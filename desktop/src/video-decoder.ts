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
type Frame = Pick<
  VideoFrame,
  'timestamp' | 'codedWidth' | 'codedHeight' | 'displayWidth' | 'displayHeight' | 'close'
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
    if (!Number.isFinite(n) || n < lastNow) throw Error();
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
      stop('DECODE_FAILED');
    }
  }
  function stop(next: TileVideoState = 'STOPPED') {
    if (closed) return;
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
      stop('DECODE_FAILED');
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
    try {
      if (closed || token !== generation) return;
      const v = pending.get(frame.timestamp);
      if (!v || !config || !live() || token !== generation || clock() >= until)
        return stop('DECODE_FAILED');
      if (
        frame.codedWidth !== config.codedWidth ||
        frame.codedHeight !== config.codedHeight ||
        !(
          (frame.displayWidth === config.width && frame.displayHeight === config.height) ||
          (frame.displayWidth === config.displayWidth &&
            frame.displayHeight === config.displayHeight)
        ) ||
        frame.displayWidth > 4096 ||
        frame.displayHeight > 4096 ||
        frame.displayWidth * frame.displayHeight > 8388608 ||
        frame.timestamp <= lastPaint
      )
        return stop('DECODE_FAILED');
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
      stop('DECODE_FAILED');
    } finally {
      try {
        frame.close();
      } catch {
        stop('DECODE_FAILED');
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
    try {
      if (!live() || clock() >= until) return stop();
      if (v.kind === 'SESSION') {
        if (v.geometryId !== geometry + 1) return stop('DECODE_FAILED');
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
        return stop('DECODE_FAILED');
      if (v.kind === 'CONFIG') {
        if (v.configId !== lastConfig + 1) return stop('DECODE_FAILED');
        reset();
        const token = generation;
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
          if (token === generation) stop('DECODER_UNAVAILABLE');
          return;
        }
        if (closed || token !== generation) return;
        if (!live() || clock() >= until) return stop();
        decoder = native.create(
          (f) => output(f, token),
          () => {
            if (token === generation) stop('DECODE_FAILED');
          },
        );
        decoder.configure(cfg);
        if (closed || token !== generation) return;
        publish('WAITING_KEY');
        acknowledge(v);
        return;
      }
      if (v.configId !== configId || !config || !decoder || v.ptsUs === null || v.ptsUs <= pts)
        return stop('DECODE_FAILED');
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
      stop('DECODE_FAILED');
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
    stop('DECODE_FAILED');
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
        stop('DECODE_FAILED');
        return;
      }
      delivery = v.deliveryId;
      void process(v);
    },
    close: () => stop(),
    snapshot: () => Object.freeze({ state, closed, pending: pending.size, held: held !== null }),
  });
}
