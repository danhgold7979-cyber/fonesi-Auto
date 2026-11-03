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
const mono = performance.now.bind(performance);
function exact(raw: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (
      !raw ||
      typeof raw !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
    )
      return null;
    const d = Object.getOwnPropertyDescriptors(raw);
    if (
      Reflect.ownKeys(d).length !== keys.length ||
      keys.some((k) => !d[k]?.enumerable || !Object.hasOwn(d[k], 'value'))
    )
      return null;
    return Object.fromEntries(keys.map((k) => [k, d[k]?.value]));
  } catch {
    return null;
  }
}
export function installVideoStreamBridge(
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
  admitCleanup: (event: IpcMainInvokeEvent) => Admission,
  service: () => DiscoverySessionService | null,
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
      let pendingDelivery: { delivery: VideoMediaDelivery; resolve(): void } | null = null;
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
      let drawDeadline = Math.min(
        startedMono + 30000,
        lastMono + Math.max(0, Math.min(30000, reservation.deadlineUtc - Date.now())),
      );
      const startupDeadline = drawDeadline;
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
      function arm() {
        if (timer !== null) clearTimeout(timer);
        const remaining = drawDeadline - now();
        if (remaining <= 0 || !current()) {
          void stop();
          return;
        }
        timer = setTimeout(() => {
          try {
            if (!current() || now() >= drawDeadline) void stop();
            else arm();
          } catch {
            void stop();
          }
        }, remaining);
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
      const send = (delivery: VideoMediaDelivery): Promise<void> => {
        if (!current() || !ready || !port || pendingDelivery)
          return Promise.reject(Error('VIDEO_CLOSED'));
        const capturedPort = port;
        return new Promise<void>((resolve, reject) => {
          pendingDelivery = { delivery, resolve };
          rejectDelivery = () => reject(Error('VIDEO_CLOSED'));
          if (delivery.kind === 'KEY' || (delivery.kind === 'DELTA' && !waitingKey)) {
            waitingKey = false;
            if (paints.size >= 3) {
              void stop();
              return;
            }
            // Only immutable scalar identity is retained; packet bytes remain in this one delivery.
            paints.set(delivery.deliveryId, { ...delivery, bytes: new Uint8Array() });
          }
          try {
            capturedPort.postMessage(delivery);
            if (!current()) void stop();
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
            const rawMessage = event.data;
            if (!ready) {
              const v = exact(rawMessage, ['version', 'videoId', 'kind']);
              if (v?.version !== 1 || v.videoId !== reservation.videoId || v.kind !== 'READY')
                throw Error();
              ready = true;
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
                      version: 1,
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
              return;
            }
            const ack = exact(rawMessage, ['version', 'videoId', 'deliveryId', 'kind']);
            if (ack?.kind === 'CONSUMED') {
              if (
                ack.version !== 1 ||
                ack.videoId !== reservation.videoId ||
                !pendingDelivery ||
                ack.deliveryId !== pendingDelivery.delivery.deliveryId
              )
                throw Error();
              const captured = pendingDelivery;
              pendingDelivery = null;
              rejectDelivery = null;
              captured.resolve();
              return;
            }
            const paint = exact(rawMessage, [
              'version',
              'videoId',
              'kind',
              'deliveryId',
              'geometryId',
              'configId',
              'packetId',
              'ptsUs',
              'width',
              'height',
            ]);
            if (paint?.kind === 'PAINTED') {
              const scalars = [
                'deliveryId',
                'geometryId',
                'configId',
                'packetId',
                'ptsUs',
                'width',
                'height',
              ];
              if (
                paint.version !== 1 ||
                paint.videoId !== reservation.videoId ||
                scalars.some(
                  (k) =>
                    typeof paint[k] !== 'number' ||
                    !Number.isSafeInteger(paint[k]) ||
                    (paint[k] as number) < 0 ||
                    Object.is(paint[k], -0),
                ) ||
                !paint.deliveryId ||
                !paint.geometryId ||
                !paint.configId ||
                !paint.packetId ||
                !paint.width ||
                !paint.height ||
                (paint.deliveryId as number) > deliveryId
              )
                throw Error();
              if (
                (paint.geometryId as number) > geometry ||
                (paint.configId as number) > lastConfiguration ||
                (paint.packetId as number) > lastPacket ||
                (paint.width as number) > 4096 ||
                (paint.height as number) > 4096 ||
                (paint.width as number) * (paint.height as number) > 8_388_608
              )
                throw Error();
              // Old geometry/config observations cannot renew health or become a current paint.
              if (
                (paint.deliveryId as number) <= lastPaint ||
                (paint.geometryId as number) < geometry ||
                (paint.geometryId === geometry && (paint.configId as number) < configuration)
              )
                return;
              const d = paints.get(paint.deliveryId as number);
              if (
                !d ||
                paint.version !== 1 ||
                paint.videoId !== reservation.videoId ||
                d.deliveryId <= lastPaint ||
                d.geometryId !== geometry ||
                d.configId !== configuration ||
                ['geometryId', 'configId', 'packetId', 'ptsUs', 'width', 'height'].some(
                  (k) => paint[k] !== (d as unknown as Record<string, unknown>)[k],
                )
              )
                throw Error();
              if (now() >= drawDeadline) throw Error();
              paints.delete(d.deliveryId);
              lastPaint = d.deliveryId;
              drawDeadline = now() + 30000;
              arm();
              return;
            }
            const failure = exact(rawMessage, ['version', 'videoId', 'kind']);
            if (
              failure?.version !== 1 ||
              failure.videoId !== reservation.videoId ||
              !['STOP', 'DECODER_UNAVAILABLE', 'DECODE_FAILED'].includes(failure.kind as string)
            )
              throw Error();
            void stop();
          } catch {
            void stop();
          }
        });
        port.on('close', () => {
          void stop();
        });
        port.start();
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
