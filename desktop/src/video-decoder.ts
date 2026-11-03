import { parseAvcConfiguration, prepareAvcChunk, type AvcConfiguration } from './h264-video.ts';
import type { VideoMediaDelivery } from './video-media-contract.ts';
import { snapshotVideoPresentationMessage } from './video-presentation-contract.ts';
type VideoDelivery = VideoMediaDelivery;
export type VideoConsumed = Readonly<{
  version: 2;
  epoch: number;
  videoId: string;
  deliveryId: number;
  kind: 'CONSUMED';
}>;
export type VideoPainted = Readonly<{
  version: 2;
  epoch: number;
  videoId: string;
  kind: 'PAINTED';
  deliveryId: number;
  geometryId: number;
  configId: number;
  packetId: number;
  ptsUs: number;
  width: number;
  height: number;
}>;
export type TileVideoState =
  | 'STARTING'
  | 'WAITING_KEY'
  | 'WAITING_FRESH_KEY'
  | 'PAUSED_HIDDEN'
  | 'DECODING'
  | 'DISPLAYING'
  | 'STOPPED'
  | 'DECODER_UNAVAILABLE'
  | 'DECODE_FAILED';
export const TILE_VIDEO_FAILURE_REASONS = Object.freeze([
  'ADMISSION',
  'DEADLINE',
  'CLOCK',
  'STATE_CALLBACK',
  'DELIVERY',
  'CONFIGURATION',
  'CAPABILITY',
  'SUBMISSION',
  'NATIVE_ERROR',
  'OUTPUT_IDENTITY',
  'OUTPUT_GEOMETRY',
  'PAINT',
  'PAINT_ACK',
  'FRAME_CLOSE',
  'UNCLASSIFIED',
] as const);
export type TileVideoFailureReason = (typeof TILE_VIDEO_FAILURE_REASONS)[number];
type Frame = Pick<
  VideoFrame,
  | 'timestamp'
  | 'codedWidth'
  | 'codedHeight'
  | 'visibleRect'
  | 'displayWidth'
  | 'displayHeight'
  | 'close'
> &
  Readonly<{ rotation?: unknown; flip?: unknown }>;
export type VideoGeometryFailure = Readonly<
  Record<
    | 'expectedCodedW'
    | 'expectedCodedH'
    | 'expectedVisibleW'
    | 'expectedVisibleH'
    | 'expectedDisplayW'
    | 'expectedDisplayH'
    | 'codedW'
    | 'codedH'
    | 'visibleX'
    | 'visibleY'
    | 'visibleW'
    | 'visibleH'
    | 'displayW'
    | 'displayH'
    | 'rotation',
    number | null
  > & { flip: boolean | null }
>;
export type VideoAccounting = Readonly<{
  scope: 'RENDERER_CANVAS';
  videoId: string;
  segment: number;
  payloadBytes: number;
  observedAt: number;
  width: number | null;
  height: number | null;
  admitted: number;
  submitted: number;
  drawn: number;
  discarded: number;
  waitingKey: number;
  reset: number;
  stopped: number;
  hidden: number;
  outstanding: number;
  pending: number;
  held: number;
}>;
type Decoder = Pick<VideoDecoder, 'configure' | 'decode' | 'close' | 'decodeQueueSize'>;
/** Source-test substitution only; production callers omit this second argument. */
export type VideoDecoderTestBindings = Readonly<{
  create: (output: (frame: Frame) => void, error: () => void) => Decoder;
  supported: (config: VideoDecoderConfig) => Promise<boolean>;
  chunk: (init: EncodedVideoChunkInit) => EncodedVideoChunk;
  now: () => number;
  utc: () => number;
  set: (callback: () => void, ms: number) => unknown;
  clear: (timer: unknown) => void;
}>;
const integer = (v: unknown, min = 0): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && !Object.is(v, -0);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const VIDEO_ACCOUNTING_FRESH_MS = 5000;
export type VideoRates = Readonly<{
  scope: 'RENDERER_INTERVAL';
  videoId: string;
  segment: number;
  startedAt: number;
  endedAt: number;
  intervalMs: number;
  canvasFps: number;
  payloadBitsPerSecond: number;
}>;
const cumulativeKeys = [
  'admitted',
  'submitted',
  'drawn',
  'discarded',
  'waitingKey',
  'reset',
  'stopped',
  'hidden',
  'payloadBytes',
] as const;
const accountingKeys = [
  'scope',
  'videoId',
  'segment',
  'observedAt',
  'width',
  'height',
  ...cumulativeKeys,
  'outstanding',
  'pending',
  'held',
] as const;
const observationTime = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= 0 &&
  v <= Number.MAX_SAFE_INTEGER &&
  !Object.is(v, -0);
function rateSample(raw: unknown): VideoAccounting | null {
  try {
    if (
      !raw ||
      typeof raw !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
    )
      return null;
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (
      Reflect.ownKeys(descriptors).length !== accountingKeys.length ||
      accountingKeys.some(
        (key) => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'),
      )
    )
      return null;
    // Read descriptor values only: caller accessors are never invoked.
    const v = Object.fromEntries(accountingKeys.map((key) => [key, descriptors[key]?.value]));
    if (
      v.scope !== 'RENDERER_CANVAS' ||
      !uuid(v.videoId) ||
      !integer(v.segment) ||
      !observationTime(v.observedAt) ||
      cumulativeKeys.some((key) => !integer(v[key])) ||
      !integer(v.outstanding) ||
      v.outstanding > 3 ||
      !integer(v.pending) ||
      v.pending > 2 ||
      !integer(v.held) ||
      v.held > 1 ||
      !(
        (v.width === null && v.height === null) ||
        (integer(v.width, 1) &&
          integer(v.height, 1) &&
          v.width <= 4096 &&
          v.height <= 4096 &&
          v.width * v.height <= 8388608)
      ) ||
      v.admitted - v.drawn - v.discarded !== v.outstanding ||
      v.discarded - v.waitingKey - v.reset - v.stopped - v.hidden !== 0 ||
      v.submitted > v.admitted ||
      v.drawn > v.submitted
    )
      return null;
    return v as VideoAccounting;
  } catch {
    return null;
  }
}
/** Pure, captured renderer observations, never native/effective stream settings. */
export function measureVideoRates(previous: unknown, current: unknown): VideoRates | null {
  const before = rateSample(previous),
    after = rateSample(current);
  if (
    !before ||
    !after ||
    before.videoId !== after.videoId ||
    before.segment !== after.segment ||
    after.admitted === 0 ||
    cumulativeKeys.some((key) => after[key] < before[key])
  )
    return null;
  const intervalMs = after.observedAt - before.observedAt;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs >= VIDEO_ACCOUNTING_FRESH_MS)
    return null;
  const canvasFps = ((after.drawn - before.drawn) / intervalMs) * 1000;
  const payloadBitsPerSecond = ((after.payloadBytes - before.payloadBytes) / intervalMs) * 8000;
  if (![canvasFps, payloadBitsPerSecond].every((v) => Number.isFinite(v) && v >= 0)) return null;
  return Object.freeze({
    scope: 'RENDERER_INTERVAL',
    videoId: after.videoId,
    segment: after.segment,
    startedAt: before.observedAt,
    endedAt: after.observedAt,
    intervalMs,
    canvasFps,
    payloadBitsPerSecond,
  });
}
export function createTileVideoDecoder(
  options: Readonly<{
    videoId: string;
    deviceId: string;
    generation: number;
    deadlineUtc: number;
    canvas: HTMLCanvasElement;
    current: () => boolean;
    onConsumed: (value: VideoConsumed) => void;
    onPresentationAck: (
      value: Readonly<{ version: 2; videoId: string; kind: 'PRESENTATION_ACK'; epoch: number }>,
    ) => void;
    visible?: () => boolean;
    onPainted: (value: VideoPainted) => void;
    onState: (state: TileVideoState) => void;
  }>,
  test?: VideoDecoderTestBindings,
) {
  const native: VideoDecoderTestBindings = test ?? {
    create: (output, error) => new VideoDecoder({ output, error }),
    supported: async (config) =>
      typeof VideoDecoder !== 'undefined' &&
      (await VideoDecoder.isConfigSupported(config)).supported === true,
    chunk: (init) => new EncodedVideoChunk(init),
    now: () => performance.now(),
    utc: () => Date.now(),
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  };
  let failureReason: TileVideoFailureReason | null = null;
  let geometryFailure: VideoGeometryFailure | null = null;
  let clockFailed = false;
  let closed = false,
    state: TileVideoState = 'STARTING',
    generation = 0,
    decoder: Decoder | null = null;
  let config: AvcConfiguration | null = null,
    geometry = 0,
    configId = 0,
    lastConfig = 0,
    packet = 0,
    delivery = 0,
    pts = -1,
    lastPaint = -1;
  type Work = { value: VideoDelivery; epoch: number; consumed: boolean };
  type Operation = {
    work: Work;
    generation: number;
    epoch: number;
    config: AvcConfiguration | null;
  };
  let width = 0,
    height = 0,
    held: Work | null = null,
    inflight: Work | null = null,
    operation: Operation | null = null,
    supportSlot: Promise<boolean> | null = null,
    timer: unknown = null;
  let epoch = 0,
    visible = true,
    freshKey = true,
    frontier = 0,
    fencePacket = 0,
    firstPaint = false,
    remainingVisible = 30000;
  const pending = new Map<number, Work>();
  const admitted = native.now(),
    remaining = options.deadlineUtc - native.utc();
  let startupUntil = admitted + Math.min(30000, remaining);
  let lastNow = admitted,
    chargedAt = admitted;
  type Outcome = 'drawn' | 'waitingKey' | 'reset' | 'stopped' | 'hidden';
  type Record = { drawing: boolean; deferred: Outcome | null };
  const accounting = new Map<number, Record>();
  const counts = {
    payloadBytes: 0,
    admitted: 0,
    submitted: 0,
    drawn: 0,
    discarded: 0,
    waitingKey: 0,
    reset: 0,
    stopped: 0,
    hidden: 0,
  };
  let accountingAvailable = true,
    observedAt = admitted;
  function unavailableAccounting() {
    accountingAvailable = false;
    accounting.clear();
  }
  function increment(key: keyof typeof counts) {
    if (!accountingAvailable) return;
    if (counts[key] >= Number.MAX_SAFE_INTEGER) {
      unavailableAccounting();
      return;
    }
    counts[key]++;
  }
  function settle(id: number, outcome: Outcome) {
    if (!accountingAvailable) return;
    const record = accounting.get(id);
    if (!record) return;
    if (record.drawing && outcome !== 'drawn') {
      record.deferred ??= outcome;
      return;
    }
    accounting.delete(id);
    increment(outcome);
    if (outcome !== 'drawn') increment('discarded');
  }
  function discard(outcome: 'reset' | 'stopped' | 'hidden') {
    for (const id of accounting.keys()) settle(id, outcome);
  }
  function account(v: VideoDelivery) {
    if (!accountingAvailable || (v.kind !== 'KEY' && v.kind !== 'DELTA')) return;
    if (accounting.size >= 3 || accounting.has(v.deliveryId)) {
      unavailableAccounting();
      return;
    }
    if (!integer(v.totalBytes) || counts.payloadBytes > Number.MAX_SAFE_INTEGER - v.totalBytes) {
      unavailableAccounting();
      return;
    }
    counts.payloadBytes += v.totalBytes;
    increment('admitted');
    if (accountingAvailable) accounting.set(v.deliveryId, { drawing: false, deferred: null });
  }
  function accountingSnapshot(): VideoAccounting | null {
    if (!accountingAvailable) return null;
    let now: number;
    try {
      now = native.now();
    } catch {
      unavailableAccounting();
      return null;
    }
    if (
      !integer(generation) ||
      !observationTime(now) ||
      now < observedAt ||
      counts.admitted !== counts.drawn + counts.discarded + accounting.size ||
      counts.discarded !== counts.waitingKey + counts.reset + counts.stopped + counts.hidden ||
      counts.submitted > counts.admitted ||
      counts.drawn > counts.submitted
    ) {
      unavailableAccounting();
      return null;
    }
    observedAt = now;
    return Object.freeze({
      scope: 'RENDERER_CANVAS',
      videoId: options.videoId,
      segment: generation,
      observedAt,
      width: lastPaint >= 0 && config ? config.displayWidth : null,
      height: lastPaint >= 0 && config ? config.displayHeight : null,
      ...counts,
      outstanding: accounting.size,
      pending: pending.size,
      held: held === null ? 0 : 1,
    });
  }
  function clock() {
    const n = native.now();
    if (!Number.isFinite(n) || n < lastNow) {
      clockFailed = true;
      throw Error();
    }
    lastNow = n;
    return n;
  }
  function live() {
    if (closed) return false;
    let ok = false;
    try {
      ok = options.current();
    } catch {}
    return ok && !closed;
  }
  function clear() {
    try {
      const c = options.canvas.getContext('2d');
      c?.clearRect(0, 0, options.canvas.width, options.canvas.height);
    } catch {}
  }
  function publish(next: TileVideoState) {
    if (closed && next !== 'STOPPED' && next !== 'DECODER_UNAVAILABLE' && next !== 'DECODE_FAILED')
      return;
    state = next;
    try {
      options.onState(next);
    } catch {
      stop('DECODE_FAILED', 'STATE_CALLBACK');
    }
  }
  function stop(next: TileVideoState = 'STOPPED', reason: TileVideoFailureReason = 'UNCLASSIFIED') {
    if (closed) return;
    if (next === 'DECODE_FAILED' || next === 'DECODER_UNAVAILABLE')
      failureReason ??= clockFailed ? 'CLOCK' : reason;
    closed = true;
    discard('stopped');
    generation++;
    held = null;
    inflight = null;
    operation = null;
    config = null;
    pending.clear();
    native.clear(timer);
    try {
      decoder?.close();
    } catch {}
    decoder = null;
    clear();
    state = next;
    try {
      options.onState(next);
    } catch {}
  }
  // Only main-attested VISIBLE time spends the post-paint allowance. Startup never pauses.
  function budget() {
    const now = clock();
    if (firstPaint && visible) remainingVisible -= now - chargedAt;
    chargedAt = now;
    const wait = firstPaint ? remainingVisible : startupUntil - now;
    if (!Number.isFinite(wait) || wait <= 0) {
      stop('DECODE_FAILED', 'DEADLINE');
      return 0;
    }
    return wait;
  }
  function schedule() {
    native.clear(timer);
    timer = null;
    if (closed) return;
    const wait = budget();
    if (closed || (firstPaint && !visible)) return;
    timer = native.set(() => {
      try {
        schedule();
      } catch {
        stop('DECODE_FAILED');
      }
    }, wait);
  }
  function current(op: Operation) {
    if (closed || generation !== op.generation || epoch !== op.epoch || config !== op.config)
      return false;
    if (!live()) {
      stop();
      return false;
    }
    return budget() > 0 && !closed;
  }
  function identityOnly(value: VideoDelivery): VideoDelivery {
    return Object.freeze({ ...value, bytes: new Uint8Array() });
  }
  function acknowledge(work: Work) {
    if (work.consumed || closed) return;
    if (!live()) return stop();
    work.consumed = true;
    work.value = identityOnly(work.value);
    if (inflight === work) inflight = null;
    if (held === work) held = null;
    if (operation?.work === work) operation = null;
    options.onConsumed(
      Object.freeze({
        version: 2,
        epoch: work.epoch,
        videoId: options.videoId,
        deliveryId: work.value.deliveryId,
        kind: 'CONSUMED',
      }),
    );
  }
  function invalidate(outcome: 'reset' | 'hidden', dropConfig: boolean) {
    generation++;
    operation = null;
    discard(outcome);
    const old = decoder;
    decoder = null;
    pending.clear();
    lastPaint = -1;
    freshKey = true;
    if (dropConfig) config = null;
    clear();
    try {
      old?.close();
    } catch {}
    // close/getContext can synchronously reenter Stop or another fence.
  }
  function presentation(raw: unknown) {
    if (closed) return;
    try {
      const value = snapshotVideoPresentationMessage(raw);
      if (
        value?.kind !== 'PRESENTATION' ||
        value.videoId !== options.videoId ||
        value.epoch !== epoch + 1 ||
        value.epoch > 65536 ||
        value.afterDeliveryId !== delivery ||
        value.afterPacketId < packet ||
        value.afterPacketId < fencePacket ||
        (epoch === 0 && value.state !== 'VISIBLE')
      )
        return stop('DECODE_FAILED', 'DELIVERY');
      if (!live()) return stop();
      const wait = budget();
      if (closed) return;
      remainingVisible = Math.min(firstPaint ? wait : remainingVisible, value.remainingMs);
      if (!firstPaint) startupUntil = Math.min(startupUntil, lastNow + value.remainingMs);
      epoch = value.epoch;
      visible = value.state === 'VISIBLE';
      fencePacket = value.afterPacketId;
      if (visible) frontier = value.afterPacketId;
      const previous = inflight;
      held = null;
      const token = generation + 1;
      invalidate(visible ? 'reset' : 'hidden', false);
      if (closed || generation !== token || epoch !== value.epoch) return;
      if (previous) acknowledge(previous);
      if (closed || generation !== token || epoch !== value.epoch) return;
      publish(visible ? 'WAITING_FRESH_KEY' : 'PAUSED_HIDDEN');
      if (closed || generation !== token || epoch !== value.epoch) return;
      options.onPresentationAck(
        Object.freeze({
          version: 2,
          videoId: options.videoId,
          kind: 'PRESENTATION_ACK',
          epoch,
        }),
      );
      if (closed || generation !== token || epoch !== value.epoch) return;
      schedule();
    } catch {
      stop('DECODE_FAILED', 'DELIVERY');
    }
  }
  function resumeHeld() {
    if (!closed && held && operation === null) {
      const next = held;
      held = null;
      void process(next);
    }
  }
  function output(frame: Frame, token: number) {
    let completed: number | null = null;
    let drawAttempted = false;
    let failureContext: TileVideoFailureReason = 'OUTPUT_IDENTITY';
    try {
      if (closed || token !== generation) return;
      const work = pending.get(frame.timestamp);
      const v = work?.value;
      if (
        !v ||
        !work ||
        work.epoch !== epoch ||
        !visible ||
        !config ||
        !live() ||
        token !== generation
      )
        return stop('DECODE_FAILED', 'OUTPUT_IDENTITY');
      if (budget() <= 0) return;
      const rect = frame.visibleRect;
      // WebCodecs allocation may contain padding or a relocated visible surface.
      // Canvas consumes visible/display space, so do not apply the SPS crop twice.
      if (
        !integer(frame.codedWidth, 1) ||
        !integer(frame.codedHeight, 1) ||
        frame.codedWidth > 4096 ||
        frame.codedHeight > 4096 ||
        frame.codedWidth * frame.codedHeight > 8388608 ||
        !rect ||
        !integer(rect.x) ||
        !integer(rect.y) ||
        !integer(rect.width, 1) ||
        !integer(rect.height, 1) ||
        rect.width !== config.width ||
        rect.height !== config.height ||
        rect.x + rect.width > frame.codedWidth ||
        rect.y + rect.height > frame.codedHeight ||
        frame.rotation !== 0 ||
        Object.is(frame.rotation, -0) ||
        frame.flip !== false ||
        !(
          (frame.displayWidth === config.width && frame.displayHeight === config.height) ||
          (frame.displayWidth === config.displayWidth &&
            frame.displayHeight === config.displayHeight)
        ) ||
        frame.displayWidth > 4096 ||
        frame.displayHeight > 4096 ||
        frame.displayWidth * frame.displayHeight > 8388608
      ) {
        const scalar = (n: unknown) => (integer(n) && n <= 4096 ? n : null);
        geometryFailure = Object.freeze({
          expectedCodedW: scalar(config.codedWidth),
          expectedCodedH: scalar(config.codedHeight),
          expectedVisibleW: scalar(config.width),
          expectedVisibleH: scalar(config.height),
          expectedDisplayW: scalar(config.displayWidth),
          expectedDisplayH: scalar(config.displayHeight),
          codedW: scalar(frame.codedWidth),
          codedH: scalar(frame.codedHeight),
          visibleX: scalar(rect?.x),
          visibleY: scalar(rect?.y),
          visibleW: scalar(rect?.width),
          visibleH: scalar(rect?.height),
          displayW: scalar(frame.displayWidth),
          displayH: scalar(frame.displayHeight),
          rotation:
            integer(frame.rotation) && [0, 90, 180, 270].includes(frame.rotation)
              ? frame.rotation
              : null,
          flip: typeof frame.flip === 'boolean' ? frame.flip : null,
        });
        return stop('DECODE_FAILED', 'OUTPUT_GEOMETRY');
      }
      if (frame.timestamp <= lastPaint) return stop('DECODE_FAILED', 'OUTPUT_IDENTITY');
      failureContext = 'PAINT';
      if (options.visible && !options.visible()) {
        settle(v.deliveryId, 'hidden');
        completed = frame.timestamp;
        clear();
        return;
      }
      const context = options.canvas.getContext('2d');
      if (!context) return stop('DECODE_FAILED', 'PAINT');
      if (closed || token !== generation) return;
      if (!live()) return stop();
      options.canvas.width = config.displayWidth;
      options.canvas.height = config.displayHeight;
      options.canvas.style.aspectRatio = `${config.displayWidth} / ${config.displayHeight}`;
      if (closed || token !== generation) {
        clear();
        return;
      }
      if (!live()) return stop();
      const record = accounting.get(v.deliveryId);
      if (record) record.drawing = true;
      try {
        drawAttempted = true;
        context.drawImage(frame as VideoFrame, 0, 0, config.displayWidth, config.displayHeight);
        settle(v.deliveryId, 'drawn');
      } finally {
        if (record) {
          record.drawing = false;
          if (record.deferred) settle(v.deliveryId, record.deferred);
        }
      }
      completed = frame.timestamp;
      if (closed || token !== generation) {
        clear();
        return;
      }
      if (!live()) return stop();
      lastPaint = frame.timestamp;
      failureContext = 'PAINT_ACK';
      options.onPainted(
        Object.freeze({
          version: 2,
          epoch: work.epoch,
          videoId: options.videoId,
          kind: 'PAINTED',
          deliveryId: v.deliveryId,
          geometryId: v.geometryId,
          configId: v.configId,
          packetId: v.packetId,
          ptsUs: frame.timestamp,
          width: v.width,
          height: v.height,
        }),
      );
      if (closed || token !== generation) return;
      chargedAt = clock();
      remainingVisible = 30000;
      firstPaint = true;
      publish('DISPLAYING');
      schedule();
    } catch {
      if (!closed && token === generation) stop('DECODE_FAILED', failureContext);
    } finally {
      try {
        frame.close();
      } catch {
        stop('DECODE_FAILED', 'FRAME_CLOSE');
      }
      if (!closed && token === generation && completed !== null) pending.delete(completed);
      // A reentrant hide/Stop may happen inside a draw that then throws. Clear
      // that attempted draw, but never erase a newer canvas for an old callback.
      if (drawAttempted && token !== generation) clear();
      resumeHeld();
    }
  }
  function decoderConfig(value: AvcConfiguration): VideoDecoderConfig {
    return {
      codec: value.codec,
      codedWidth: value.codedWidth,
      codedHeight: value.codedHeight,
      hardwareAcceleration: 'no-preference',
      optimizeForLatency: true,
    };
  }
  async function configure(op: Operation): Promise<boolean> {
    if (!op.config) return false;
    // Invalidated capability work still occupies this one slot until it settles.
    if (supportSlot) {
      held = op.work;
      return false;
    }
    if (!current(op) || !visible) return false;
    const cfg = decoderConfig(op.config);
    let settle: (value: boolean) => void = () => {};
    const check = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    supportSlot = check;
    // Reserve before invoking the binding: even a synchronous visibility callback
    // cannot start a second unresolved capability probe.
    void check.then(() => {
      if (supportSlot !== check) return;
      supportSlot = null;
      resumeHeld();
    });
    try {
      void Promise.resolve(native.supported(cfg)).then(
        (v) => settle(v === true),
        () => settle(false),
      );
    } catch {
      settle(false);
    }
    const supported = await check;
    if (!current(op) || !visible) return false;
    if (!supported) {
      stop('DECODER_UNAVAILABLE', 'CAPABILITY');
      return false;
    }
    const created = native.create(
      (frame) => output(frame, op.generation),
      () => {
        if (!closed && op.generation === generation) stop('DECODE_FAILED', 'NATIVE_ERROR');
      },
    );
    if (!current(op) || !visible) {
      try {
        created.close();
      } catch {}
      return false;
    }
    decoder = created;
    created.configure(cfg);
    return current(op) && visible && decoder === created;
  }
  async function process(work: Work) {
    if (closed || work.consumed) return;
    let v = identityOnly(work.value);
    const op: Operation = { work, generation, epoch, config };
    operation = op;
    let failureContext: TileVideoFailureReason = 'DELIVERY';
    try {
      if (!current(op)) return;
      if (v.kind === 'SESSION') {
        publish(visible ? 'WAITING_FRESH_KEY' : 'PAUSED_HIDDEN');
        if (!current(op)) return;
        acknowledge(work);
        return;
      }
      if (v.kind === 'CONFIG') {
        // Startup CONFIG may probe capability. After a visibility transition, wait
        // for a later IDR before using native APIs or retaining support work.
        if (visible && epoch === 1) {
          failureContext = 'CAPABILITY';
          if (!(await configure(op))) return;
        }
        if (!current(op)) return;
        publish(visible ? 'WAITING_FRESH_KEY' : 'PAUSED_HIDDEN');
        if (!current(op)) return;
        acknowledge(work);
        return;
      }
      if (!visible) {
        settle(v.deliveryId, 'hidden');
        acknowledge(work);
        return;
      }
      const key = v.kind === 'KEY';
      if (freshKey && (!key || v.packetId <= frontier)) {
        settle(v.deliveryId, 'waitingKey');
        acknowledge(work);
        return;
      }
      if (!decoder) {
        failureContext = 'CAPABILITY';
        if (!(await configure(op))) return;
      }
      if (!current(op) || !decoder) return;
      if (pending.size >= 2 || decoder.decodeQueueSize >= 2) {
        held = work;
        return;
      }
      failureContext = 'SUBMISSION';
      v = work.value;
      if (!config || v.ptsUs === null) return stop('DECODE_FAILED', 'DELIVERY');
      const bytes = prepareAvcChunk(v.bytes, key, config);
      const chunk = native.chunk({ type: key ? 'key' : 'delta', timestamp: v.ptsUs, data: bytes });
      if (!current(op)) return;
      freshKey = false;
      pending.set(v.ptsUs, work);
      increment('submitted');
      decoder.decode(chunk);
      if (!current(op)) return;
      if (pending.has(v.ptsUs)) publish('DECODING');
      if (!current(op)) return;
      acknowledge(work);
    } catch {
      if (!closed && generation === op.generation && epoch === op.epoch)
        stop('DECODE_FAILED', failureContext);
    } finally {
      if (operation === op) operation = null;
    }
  }
  function receive(raw: unknown) {
    if (closed) return;
    let reason: TileVideoFailureReason = 'DELIVERY';
    try {
      const message = snapshotVideoPresentationMessage(raw);
      if (
        message?.kind !== 'MEDIA' ||
        message.videoId !== options.videoId ||
        message.epoch !== epoch ||
        epoch === 0 ||
        inflight !== null
      )
        return stop('DECODE_FAILED', 'DELIVERY');
      const v = message.delivery;
      if (v.deliveryId !== delivery + 1 || !live()) return stop('DECODE_FAILED', 'DELIVERY');
      if (budget() <= 0) return;
      let replacement: AvcConfiguration | null = null;
      if (v.kind === 'SESSION') {
        if (v.geometryId !== geometry + 1) return stop('DECODE_FAILED', 'DELIVERY');
      } else {
        if (
          v.geometryId !== geometry ||
          v.width !== width ||
          v.height !== height ||
          v.packetId !== packet + 1
        )
          return stop('DECODE_FAILED', 'DELIVERY');
        if (v.kind === 'CONFIG') {
          if (v.configId !== lastConfig + 1) return stop('DECODE_FAILED', 'DELIVERY');
          reason = 'CONFIGURATION';
          replacement = parseAvcConfiguration(v.bytes, width, height);
        } else {
          if (!config || v.configId !== configId || v.ptsUs === null || v.ptsUs <= pts)
            return stop('DECODE_FAILED', 'DELIVERY');
          reason = 'SUBMISSION';
          // Hidden and pre-fresh packets receive the same full AVC validation.
          prepareAvcChunk(v.bytes, v.kind === 'KEY', config);
        }
      }
      // Commit wire cursors once before close, observers, support or decode can reenter.
      delivery = v.deliveryId;
      const work: Work = {
        value: v.kind === 'CONFIG' ? identityOnly(v) : v,
        epoch,
        consumed: false,
      };
      inflight = work;
      if (v.kind === 'SESSION' || v.kind === 'CONFIG') {
        if (v.kind === 'SESSION') {
          geometry = v.geometryId;
          configId = 0;
          width = v.width;
          height = v.height;
          config = null;
        } else {
          packet = v.packetId;
          configId = v.configId;
          lastConfig = v.configId;
          config = replacement;
        }
        pts = -1;
        const token = generation + 1;
        invalidate('reset', false);
        if (closed || generation !== token || epoch !== work.epoch || work.consumed) return;
      } else {
        packet = v.packetId;
        pts = v.ptsUs as number;
        account(v);
      }
      void process(work);
    } catch {
      stop('DECODE_FAILED', reason);
    }
  }
  if (
    !uuid(options.videoId) ||
    !uuid(options.deviceId) ||
    !integer(options.generation) ||
    !integer(options.deadlineUtc, 1) ||
    !Number.isFinite(admitted) ||
    remaining <= 0 ||
    remaining > 30000
  )
    stop('DECODE_FAILED', 'ADMISSION');
  else
    try {
      schedule();
    } catch {
      stop('DECODE_FAILED');
    }
  return Object.freeze({
    receive,
    presentation,
    close: () => stop(),
    accounting: accountingSnapshot,
    snapshot: () =>
      Object.freeze({
        state,
        closed,
        segment: generation,
        pending: pending.size,
        held: held !== null,
        epoch,
        presentationReason: state === 'PAUSED_HIDDEN' ? 'WINDOW_HIDDEN' : null,
        failureReason,
        geometryFailure,
      }),
  });
}
