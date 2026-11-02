import { parseAvcConfiguration, prepareAvcChunk, type AvcConfiguration } from './h264-video.ts';
import { snapshotVideoMediaDelivery, type VideoMediaDelivery } from './video-media-contract.ts';
type VideoDelivery = VideoMediaDelivery;
export type VideoConsumed = Readonly<{
  version: 1;
  videoId: string;
  deliveryId: number;
  kind: 'CONSUMED';
}>;
export type VideoPainted = Readonly<{
  version: 1;
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
export function createTileVideoDecoder(
  options: Readonly<{
    videoId: string;
    deviceId: string;
    generation: number;
    deadlineUtc: number;
    canvas: HTMLCanvasElement;
    current: () => boolean;
    onConsumed: (value: VideoConsumed) => void;
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
  let width = 0,
    height = 0,
    held: VideoDelivery | null = null,
    busy = false,
    timer: unknown = null;
  const pending = new Map<number, VideoDelivery>();
  const admitted = native.now(),
    remaining = options.deadlineUtc - native.utc();
  let lastNow = admitted,
    until = admitted + Math.min(30000, remaining);
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
    generation++;
    held = null;
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
  function schedule() {
    native.clear(timer);
    if (closed) return;
    const wait = until - clock();
    if (wait <= 0) {
      stop('DECODE_FAILED', 'DEADLINE');
      return;
    }
    timer = native.set(() => {
      try {
        schedule();
      } catch {
        stop('DECODE_FAILED');
      }
    }, wait);
  }
  function acknowledge(v: VideoDelivery) {
    if (!live()) return stop();
    options.onConsumed(
      Object.freeze({
        version: 1,
        videoId: options.videoId,
        deliveryId: v.deliveryId,
        kind: 'CONSUMED',
      }),
    );
    if (closed) return;
  }
  function reset() {
    generation++;
    try {
      decoder?.close();
    } catch {}
    decoder = null;
    pending.clear();
    config = null;
    pts = -1;
    lastPaint = -1;
    clear();
  }
  function output(frame: Frame, token: number) {
    let completed: number | null = null;
    let failureContext: TileVideoFailureReason = 'OUTPUT_IDENTITY';
    try {
      if (closed || token !== generation) return;
      const v = pending.get(frame.timestamp);
      if (!v || !config || !live() || token !== generation)
        return stop('DECODE_FAILED', 'OUTPUT_IDENTITY');
      if (clock() >= until) return stop('DECODE_FAILED', 'DEADLINE');
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
      const context = options.canvas.getContext('2d');
      if (!context || !live() || token !== generation || closed) return stop();
      options.canvas.width = config.displayWidth;
      options.canvas.height = config.displayHeight;
      options.canvas.style.aspectRatio = `${config.displayWidth} / ${config.displayHeight}`;
      if (!live() || token !== generation || closed) return stop();
      context.drawImage(frame as VideoFrame, 0, 0, config.displayWidth, config.displayHeight);
      completed = frame.timestamp;
      lastPaint = frame.timestamp;
      if (!live() || token !== generation || closed) return stop();
      failureContext = 'PAINT_ACK';
      options.onPainted(
        Object.freeze({
          version: 1,
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
      until = clock() + 30000;
      publish('DISPLAYING');
      schedule();
    } catch {
      stop('DECODE_FAILED', failureContext);
    } finally {
      try {
        frame.close();
      } catch {
        stop('DECODE_FAILED', 'FRAME_CLOSE');
      }
      if (!closed && token === generation && completed !== null) pending.delete(completed);
      if (!closed && held && !busy) {
        const next = held;
        held = null;
        void process(next);
      }
    }
  }
  async function process(v: VideoDelivery) {
    if (closed) return;
    busy = true;
    let failureContext: TileVideoFailureReason = 'DELIVERY';
    try {
      if (!live() || clock() >= until) return stop();
      if (v.kind === 'SESSION') {
        if (v.geometryId !== geometry + 1) return stop('DECODE_FAILED', 'DELIVERY');
        reset();
        geometry = v.geometryId;
        configId = 0;
        width = v.width;
        height = v.height;
        publish('WAITING_KEY');
        acknowledge(v);
        return;
      }
      if (
        v.geometryId !== geometry ||
        v.width !== width ||
        v.height !== height ||
        v.packetId !== packet + 1
      )
        return stop('DECODE_FAILED', 'DELIVERY');
      if (v.kind === 'CONFIG') {
        if (v.configId !== lastConfig + 1) return stop('DECODE_FAILED', 'DELIVERY');
        reset();
        const token = generation;
        failureContext = 'CONFIGURATION';
        config = parseAvcConfiguration(v.bytes, width, height);
        configId = v.configId;
        lastConfig = configId;
        packet = v.packetId;
        const cfg: VideoDecoderConfig = {
          codec: config.codec,
          codedWidth: config.codedWidth,
          codedHeight: config.codedHeight,
          hardwareAcceleration: 'no-preference',
          optimizeForLatency: true,
        };
        let supported = false;
        try {
          supported = await native.supported(cfg);
        } catch {}
        if (!supported) {
          if (token === generation) stop('DECODER_UNAVAILABLE', 'CAPABILITY');
          return;
        }
        if (closed || token !== generation) return;
        if (!live() || clock() >= until) return stop();
        decoder = native.create(
          (f) => output(f, token),
          () => {
            if (token === generation) stop('DECODE_FAILED', 'NATIVE_ERROR');
          },
        );
        decoder.configure(cfg);
        if (closed || token !== generation) return;
        publish('WAITING_KEY');
        acknowledge(v);
        return;
      }
      if (v.configId !== configId || !config || !decoder || v.ptsUs === null || v.ptsUs <= pts)
        return stop('DECODE_FAILED', 'DELIVERY');
      if (pending.size >= 2 || decoder.decodeQueueSize >= 2) {
        held = v;
        return;
      }
      const key = v.kind === 'KEY';
      if (pts < 0 && !key) {
        packet = v.packetId;
        acknowledge(v);
        return;
      }
      failureContext = 'SUBMISSION';
      const bytes = prepareAvcChunk(v.bytes, key, config);
      const chunk = native.chunk({ type: key ? 'key' : 'delta', timestamp: v.ptsUs, data: bytes });
      if (!live() || closed) return stop();
      pts = v.ptsUs;
      packet = v.packetId;
      pending.set(v.ptsUs, v);
      decoder.decode(chunk);
      if (closed) return;
      if (pending.has(v.ptsUs)) publish('DECODING');
      acknowledge(v);
    } catch {
      stop('DECODE_FAILED', failureContext);
    } finally {
      busy = false;
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
    receive(raw: unknown) {
      if (closed) return;
      const v = snapshotVideoMediaDelivery(raw);
      if (!v || v.videoId !== options.videoId || v.deliveryId !== delivery + 1 || busy || held) {
        stop('DECODE_FAILED', 'DELIVERY');
        return;
      }
      delivery = v.deliveryId;
      void process(v);
    },
    close: () => stop(),
    snapshot: () =>
      Object.freeze({
        state,
        closed,
        pending: pending.size,
        held: held !== null,
        failureReason,
        geometryFailure,
      }),
  });
}
