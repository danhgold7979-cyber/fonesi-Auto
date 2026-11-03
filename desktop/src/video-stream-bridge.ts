import {
  MessageChannelMain,
  type IpcMain,
  type IpcMainInvokeEvent,
  type MessagePortMain,
} from 'electron';
import type { Admission } from './view-session.ts';
import type { DiscoverySessionService } from './main/discovery-session-service.ts';
import { snapshotVideoRecoveryResult, type VideoMediaSink } from './main/video-contract.ts';
import {
  VIDEO_STREAM_CHANNEL,
  VIDEO_PORT_CHANNEL,
  parseVideoStreamRequest,
  videoStreamResponse,
} from './video-stream-contract.ts';
import type { VideoMediaDelivery, VideoMediaHeader } from './video-media-contract.ts';
import {
  snapshotVideoPresentationControl,
  type VideoPresentationState,
} from './video-presentation-contract.ts';
const mono = performance.now.bind(performance);
export type VideoWindowObservation = Readonly<{
  read(): 'VISIBLE' | 'HIDDEN' | 'UNAVAILABLE';
  subscribe(listener: () => void): () => void;
}>;
export function installVideoStreamBridge(
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
  admitCleanup: (event: IpcMainInvokeEvent) => Admission,
  service: () => DiscoverySessionService | null,
  captureWindow: (event: IpcMainInvokeEvent) => VideoWindowObservation | null,
) {
  let disposed = false,
    quotaClosed = false;
  type Owner = {
    videoId: string;
    sender: IpcMainInvokeEvent['sender'];
    readonly retired: boolean;
    stop(): Promise<boolean>;
  };
  let owner: Owner | null = null;
  const owners = new Map<string, Owner>();
  let rejectionStop: Promise<boolean> | null = null;
  const requests = new Set<string>();
  ipc.handle(VIDEO_STREAM_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    let release: (() => void) | undefined;
    let releaseObservation: (() => void) | undefined;
    let requestId: string | null = null;
    try {
      if (disposed) return videoStreamResponse(null, 'CLOSED');
      const request = extra.length ? null : parseVideoStreamRequest(raw);
      const admission = request?.kind === 'STOP' ? admitCleanup(event) : admit(event);
      if (!admission.ok) return videoStreamResponse(null, 'CLOSED');
      release = admission.release;
      if (!request) return videoStreamResponse(null, 'INVALID');
      requestId = request.requestId;
      if (requests.has(requestId) || (request.kind === 'START' && requests.size >= 65536))
        return videoStreamResponse(requestId, 'INVALID');
      if (request.kind === 'START') requests.add(requestId);
      if (!admission.current()) return videoStreamResponse(requestId, 'CLOSED');
      if (request.kind === 'STOP') {
        const captured = owners.get(request.videoId);
        if (!captured || captured.sender !== event.sender)
          return videoStreamResponse(requestId, 'STALE');
        const retired = await captured.stop();
        return videoStreamResponse(requestId, retired ? 'STOPPED' : 'UNCERTAIN', captured.videoId);
      }
      if (owner && !owner.retired) return videoStreamResponse(requestId, 'BUSY');
      if (quotaClosed || owners.size >= 128 || rejectionStop)
        return videoStreamResponse(requestId, 'UNAVAILABLE');
      const frame = event.senderFrame;
      if (
        !frame ||
        frame !== event.sender.mainFrame ||
        frame.url !== 'auto-foundation://app/status.html'
      )
        return videoStreamResponse(requestId, 'CLOSED');
      const capturedObservation = captureWindow(event);
      if (!capturedObservation) return videoStreamResponse(requestId, 'UNAVAILABLE');
      const observation = capturedObservation;
      let observeChanged = () => {};
      releaseObservation = observation.subscribe(() => observeChanged());
      if (observation.read() !== 'VISIBLE' || !admission.current())
        return videoStreamResponse(requestId, 'UNAVAILABLE');
      const admissionMono = mono();
      if (!Number.isFinite(admissionMono)) return videoStreamResponse(requestId, 'UNAVAILABLE');
      const candidate = service()?.reserveVideo(request.deviceId, request.expectedRegistryRevision);
      if (!candidate) return videoStreamResponse(requestId, 'UNAVAILABLE');
      const reservation = candidate;
      if (owners.has(reservation.videoId)) {
        let finish: (value: boolean) => void = () => {};
        rejectionStop = new Promise<boolean>((resolve) => {
          finish = resolve;
        });
        try {
          void reservation.stop().then(
            (value) => finish(value === true),
            () => finish(false),
          );
        } catch {
          finish(false);
        }
        return videoStreamResponse(requestId, 'UNAVAILABLE');
      }
      let retired = false;
      let stopped = false,
        ready = false,
        port: MessagePortMain | null = null;
      let transferPort: MessagePortMain | null = null;
      let stopWork: Promise<boolean> | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let rejectDelivery: (() => void) | null = null;
      let pendingDelivery: {
        delivery: VideoMediaDelivery;
        epoch: number;
        deadline: number;
        posted: boolean;
        resolve(): void;
      } | null = null;
      let observed: VideoPresentationState = 'VISIBLE';
      let fenced: VideoPresentationState | null = null;
      let epoch = 0,
        retiredEpoch = 0,
        frontier = 0,
        postedDeliveryId = 0;
      let fence: { epoch: number; state: VideoPresentationState; deadline: number } | null = null;
      let begun = false,
        firstPaint = false;
      let unsubscribe: (() => void) | undefined = releaseObservation;
      releaseObservation = undefined;
      let packet: { header: VideoMediaHeader; bytes: Uint8Array; offset: number } | null = null;
      let credit = 0,
        deliveryId = 0,
        geometry = 0,
        configuration = 0,
        lastConfiguration = 0,
        lastPacket = 0;
      let width = 0,
        height = 0,
        accepting = false,
        waitingKey = true,
        lastPaint = 0;
      const paints = new Map<number, VideoMediaDelivery>();
      const startedMono = admissionMono;
      let lastMono = mono();
      const drawDeadline = Math.min(
        startedMono + 30000,
        lastMono + Math.max(0, Math.min(30000, reservation.deadlineUtc - Date.now())),
      );
      const startupDeadline = drawDeadline;
      let remainingVisible = drawDeadline - lastMono;
      let chargedMono = lastMono;
      let portRetired = false,
        portTeardownStarted = false;
      let refusalTimer: ReturnType<typeof setTimeout> | null = null;
      let refusal: string | null = null;
      let startResolved = false,
        lowerMediaClosed = false;
      const current = () =>
        !disposed &&
        !stopped &&
        owner === entry &&
        admission.operationCurrent() &&
        reservation.current() &&
        !event.sender.isDestroyed() &&
        event.sender.mainFrame === frame &&
        frame.url === 'auto-foundation://app/status.html';
      function now() {
        const value = mono();
        if (!Number.isFinite(value) || value < lastMono) throw Error('VIDEO_CLOCK');
        lastMono = value;
        return value;
      }
      function charge() {
        const t = now();
        if (observed === 'VISIBLE') remainingVisible -= t - chargedMono;
        chargedMono = t;
        if (
          !current() ||
          (!firstPaint && t >= startupDeadline) ||
          remainingVisible <= 0 ||
          (fence && t >= fence.deadline) ||
          (pendingDelivery?.posted && t >= pendingDelivery.deadline)
        )
          throw Error('VIDEO_EXPIRED');
        return t;
      }
      function refreshWindow() {
        charge(); // A late hide never saves an expired visible owner.
        const state = observation.read();
        if (state !== 'VISIBLE' && state !== 'HIDDEN') throw Error('VIDEO_WINDOW');
        if (!current()) throw Error('VIDEO_CLOSED');
        if (state !== observed) {
          observed = state;
          retiredEpoch = epoch;
          paints.clear();
          waitingKey = true;
        }
      }
      function arm() {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        const t = charge();
        const due = Math.min(
          firstPaint ? Infinity : startupDeadline,
          observed === 'VISIBLE' ? t + remainingVisible : Infinity,
          fence?.deadline ?? Infinity,
          pendingDelivery?.posted ? pendingDelivery.deadline : Infinity,
        );
        if (Number.isFinite(due))
          timer = setTimeout(
            () => {
              try {
                refreshWindow();
                pump();
              } catch {
                void stop();
              }
            },
            Math.max(0, due - t),
          );
      }
      function pump() {
        if (!ready || !port || !current()) return;
        refreshWindow();
        if (!fence && (fenced !== observed || epoch === 0 || retiredEpoch === epoch)) {
          if (epoch >= 65536) throw Error('VIDEO_TRANSITION_LIMIT');
          const t = charge();
          // Bootstrap is always VISIBLE. If the window hid after admission,
          // coalesce HIDDEN behind this ACK before beginning the native session.
          const state = epoch === 0 ? 'VISIBLE' : observed;
          const next = ++epoch;
          frontier = Math.max(
            frontier,
            lastPacket,
            packet?.header.packetId ?? 0,
            pendingDelivery?.delivery.packetId ?? 0,
          );
          fence = {
            epoch: next,
            state,
            deadline: Math.min(t + 30000, firstPaint ? Infinity : startupDeadline),
          };
          port.postMessage({
            version: 2,
            videoId: reservation.videoId,
            kind: 'PRESENTATION',
            epoch: next,
            state,
            afterDeliveryId: postedDeliveryId,
            afterPacketId: frontier,
            remainingMs: Math.min(
              30000,
              remainingVisible,
              firstPaint ? Infinity : startupDeadline - t,
            ),
          });
          if (!current()) {
            void stop();
            return;
          }
        }
        if (!fence && fenced === observed && retiredEpoch < epoch) {
          if (!begun) {
            begun = true;
            begin();
            if (!current()) {
              void stop();
              return;
            }
          }
          const pending = pendingDelivery;
          if (pending && !pending.posted) {
            const d = pending.delivery;
            const t = charge();
            pending.epoch = epoch;
            pending.deadline = Math.min(t + 30000, firstPaint ? Infinity : startupDeadline);
            pending.posted = true;
            postedDeliveryId = d.deliveryId;
            if (
              observed === 'VISIBLE' &&
              d.packetId > frontier &&
              (d.kind === 'KEY' || (d.kind === 'DELTA' && !waitingKey))
            ) {
              waitingKey = false;
              if (paints.size >= 3) throw Error('VIDEO_PAINT_LIMIT');
              paints.set(d.deliveryId, { ...d, bytes: new Uint8Array() });
            }
            port.postMessage({
              version: 2,
              videoId: reservation.videoId,
              kind: 'MEDIA',
              epoch,
              delivery: d,
            });
            if (!current()) {
              void stop();
              return;
            }
          }
        }
        arm();
      }
      function teardownPort() {
        if (portTeardownStarted) return;
        portTeardownStarted = true; // Before either potentially reentrant close callback.
        if (refusalTimer !== null) clearTimeout(refusalTimer);
        refusalTimer = null;
        let closed = true;
        try {
          port?.close();
        } catch {
          closed = false;
        }
        try {
          transferPort?.close();
          transferPort = null;
        } catch {
          closed = false;
        }
        portRetired = closed;
      }
      function stop(keepNotification = false): Promise<boolean> {
        if (stopWork) {
          if (!keepNotification) teardownPort();
          return stopWork;
        }
        stopped = true;
        const remove = unsubscribe;
        unsubscribe = undefined;
        try {
          remove?.();
        } catch {
          /* Owner remains terminal even if listener removal fails. */
        }
        let settle: (value: boolean) => void = () => {};
        stopWork = new Promise<boolean>((resolve) => {
          settle = resolve;
        });
        if (!keepNotification) teardownPort();
        if (timer !== null) clearTimeout(timer);
        timer = null;
        const reject = rejectDelivery;
        rejectDelivery = null;
        pendingDelivery = null;
        packet = null;
        paints.clear();
        reject?.();
        try {
          void reservation.stop().then(
            (value) => {
              retired = value === true;
              settle(retired);
            },
            () => settle(false),
          );
        } catch {
          settle(false);
        }
        return stopWork;
      }
      const entry: Owner = Object.freeze({
        videoId: reservation.videoId,
        sender: event.sender,
        get retired() {
          return retired && portRetired;
        },
        stop: async () => (await stop()) && portRetired,
      });
      owners.set(entry.videoId, entry);
      owner = entry; // Distinct owner after proven retirement; old tombstone remains single-use.
      observeChanged = () => {
        if (stopped) return;
        try {
          refreshWindow();
          pump();
        } catch {
          void stop();
        }
      };
      const send = (delivery: VideoMediaDelivery): Promise<void> => {
        if (!current() || !ready || !port || pendingDelivery)
          return Promise.reject(Error('VIDEO_CLOSED'));
        return new Promise<void>((resolve, reject) => {
          pendingDelivery = { delivery, epoch: 0, deadline: Infinity, posted: false, resolve };
          rejectDelivery = () => reject(Error('VIDEO_CLOSED'));
          try {
            pump();
          } catch {
            void stop();
          }
        });
      };
      const sink: VideoMediaSink = Object.freeze({
        close() {
          lowerMediaClosed = true;
          // Lower cancellation can precede the classified START reply. Preserve
          // only the bounded notification path, never media or retirement credit.
          if (startResolved) void stop(refusal !== null && !portRetired);
        },
        async accept(header: VideoMediaHeader, bytes: Uint8Array) {
          if (
            accepting ||
            lowerMediaClosed ||
            !current() ||
            header.videoId !== reservation.videoId ||
            header.creditId !== credit + 1
          )
            throw Error('VIDEO_MEDIA_REJECTED');
          accepting = true;
          credit = header.creditId;
          try {
            if (header.kind === 'SESSION') {
              if (
                packet ||
                deliveryId >= Number.MAX_SAFE_INTEGER ||
                header.geometryId !== geometry + 1
              )
                throw Error('VIDEO_MEDIA_REJECTED');
              geometry = header.geometryId;
              configuration = 0;
              waitingKey = true;
              width = header.width;
              height = header.height;
              paints.clear();
              await send(
                Object.freeze({
                  version: 1,
                  videoId: header.videoId,
                  deliveryId: ++deliveryId,
                  geometryId: geometry,
                  configId: 0,
                  packetId: 0,
                  kind: 'SESSION',
                  ptsUs: null,
                  totalBytes: 0,
                  width,
                  height,
                  bytes: new Uint8Array(),
                }),
              );
              return;
            }
            if (
              header.geometryId !== geometry ||
              header.width !== width ||
              header.height !== height
            )
              throw Error('VIDEO_MEDIA_REJECTED');
            if (!packet) {
              if (
                header.offset !== 0 ||
                header.packetId !== lastPacket + 1 ||
                (header.kind === 'CONFIG'
                  ? header.configId !== lastConfiguration + 1
                  : header.configId !== configuration || configuration === 0)
              )
                throw Error('VIDEO_MEDIA_REJECTED');
              packet = { header, bytes: new Uint8Array(header.totalBytes), offset: 0 };
            }
            const p = packet;
            for (const key of [
              'geometryId',
              'configId',
              'packetId',
              'kind',
              'ptsUs',
              'totalBytes',
              'width',
              'height',
            ] as const)
              if (p.header[key] !== header[key]) throw Error('VIDEO_MEDIA_REJECTED');
            if (
              header.offset !== p.offset ||
              bytes.length !== Math.min(32768, header.totalBytes - p.offset)
            )
              throw Error('VIDEO_MEDIA_REJECTED');
            p.bytes.set(bytes, p.offset);
            p.offset += bytes.length;
            if (p.offset === header.totalBytes) {
              packet = null;
              lastPacket = header.packetId;
              if (header.kind === 'CONFIG') {
                configuration = header.configId;
                lastConfiguration = configuration;
                waitingKey = true;
                paints.clear();
              }
              if (deliveryId >= Number.MAX_SAFE_INTEGER) throw Error('VIDEO_MEDIA_REJECTED');
              await send(
                Object.freeze({
                  version: 1,
                  videoId: header.videoId,
                  deliveryId: ++deliveryId,
                  geometryId: geometry,
                  configId: header.configId,
                  packetId: header.packetId,
                  kind: header.kind,
                  ptsUs: header.ptsUs,
                  totalBytes: header.totalBytes,
                  width,
                  height,
                  bytes: p.bytes,
                }),
              );
            }
            if (!current()) throw Error('VIDEO_CLOSED');
          } catch (error) {
            void stop();
            throw error;
          } finally {
            accepting = false;
          }
        },
      });
      function begin() {
        const session = reservation.begin(sink);
        void session.started.then(
          (rawResult) => {
            startResolved = true;
            const result = rawResult === null ? null : snapshotVideoRecoveryResult(rawResult);
            if (rawResult !== null && (!result || result.videoId !== reservation.videoId)) {
              void stop();
              return;
            }
            if (result?.refusal === 'QUOTA') quotaClosed = true;
            if (!current()) {
              void stop();
              return;
            }
            if (result?.handoff === 'OWNED') {
              if (lowerMediaClosed) void stop();
              return;
            }
            refusal = result?.refusal ?? 'REJECTED';
            if (refusal === 'QUOTA') quotaClosed = true;
            void stop(true); // Cancel media/lower work now; notification is not retirement.
            try {
              const remaining = startupDeadline - now();
              if (remaining <= 0 || !port) {
                teardownPort();
                return;
              }
              refusalTimer = setTimeout(teardownPort, remaining);
              port.postMessage({
                version: 2,
                videoId: reservation.videoId,
                kind: 'REFUSED',
                reason: refusal,
              });
            } catch {
              teardownPort();
            }
          },
          () => {
            startResolved = true;
            void stop();
          },
        );
      }
      try {
        const channel = new MessageChannelMain();
        port = channel.port1;
        transferPort = channel.port2;
        port.on('message', (event) => {
          try {
            if (!current()) {
              void stop();
              return;
            }
            refreshWindow();
            const message = snapshotVideoPresentationControl(event.data);
            if (!message || message.videoId !== reservation.videoId) throw Error('VIDEO_CONTROL');
            if (!ready) {
              if (message.kind !== 'READY') throw Error('VIDEO_READY');
              ready = true;
              pump();
              return;
            }
            if (message.kind === 'PRESENTATION_ACK') {
              if (!fence || message.epoch !== fence.epoch) throw Error('VIDEO_FENCE');
              fenced = fence.state;
              fence = null;
              pump();
              return;
            }
            if (message.kind === 'VISIBILITY_HINT') {
              pump();
              return;
            }
            if (message.kind === 'CONSUMED') {
              if (
                !pendingDelivery?.posted ||
                message.epoch !== pendingDelivery.epoch ||
                message.deliveryId !== pendingDelivery.delivery.deliveryId
              )
                throw Error('VIDEO_CONSUMED');
              const captured = pendingDelivery;
              pendingDelivery = null;
              rejectDelivery = null;
              captured.resolve();
              pump();
              return;
            }
            if (message.kind === 'PAINTED') {
              if (
                message.epoch > epoch ||
                message.deliveryId > deliveryId ||
                message.geometryId > geometry ||
                message.configId > lastConfiguration ||
                message.packetId > lastPacket
              )
                throw Error('VIDEO_PAINT_FUTURE');
              if (message.epoch < epoch || message.epoch <= retiredEpoch) {
                pump();
                return;
              }
              if (observed !== 'VISIBLE' || fence || fenced !== 'VISIBLE')
                throw Error('VIDEO_PAINT_HIDDEN');
              if (
                message.deliveryId <= lastPaint ||
                message.geometryId < geometry ||
                (message.geometryId === geometry && message.configId < configuration)
              ) {
                pump();
                return;
              }
              const d = paints.get(message.deliveryId);
              if (
                !d ||
                d.geometryId !== geometry ||
                d.configId !== configuration ||
                ['geometryId', 'configId', 'packetId', 'ptsUs', 'width', 'height'].some(
                  (k) =>
                    (message as unknown as Record<string, unknown>)[k] !==
                    (d as unknown as Record<string, unknown>)[k],
                )
              )
                throw Error('VIDEO_PAINT_IDENTITY');
              charge();
              paints.delete(d.deliveryId);
              lastPaint = d.deliveryId;
              firstPaint = true;
              remainingVisible = 30000;
              chargedMono = now();
              pump();
              return;
            }
            if (!['STOP', 'DECODER_UNAVAILABLE', 'DECODE_FAILED'].includes(message.kind))
              throw Error('VIDEO_CONTROL');
            void stop();
          } catch {
            void stop();
          }
        });
        port.on('close', () => {
          void stop();
        });
        port.start();
        refreshWindow();
        arm();
        if (!current()) throw Error();
        frame.postMessage(
          VIDEO_PORT_CHANNEL,
          {
            version: 1,
            videoId: reservation.videoId,
            requestId,
            deviceId: request.deviceId,
            generation: reservation.generation,
            deadlineUtc: reservation.deadlineUtc,
          },
          [channel.port2],
        );
        transferPort = null;
        if (!current()) void stop();
        return videoStreamResponse(requestId, 'PENDING', reservation.videoId);
      } catch {
        void stop();
        return videoStreamResponse(requestId, 'FAILED', reservation.videoId);
      }
    } catch {
      return videoStreamResponse(requestId, 'UNAVAILABLE');
    } finally {
      releaseObservation?.();
      release?.();
    }
  });
  return Object.freeze({
    close() {
      disposed = true;
      ipc.removeHandler(VIDEO_STREAM_CHANNEL);
      return Promise.all(
        [...owners.values()]
          .map((record) => record.stop())
          .concat(rejectionStop ? [rejectionStop] : []),
      ).then((results) => results.every((value) => value === true));
    },
  });
}
