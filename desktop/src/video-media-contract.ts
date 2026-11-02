/** Bounded media observations only; no target, transport, or decoder authority. */
export const VIDEO_MEDIA_PACKET_LIMIT = 8_388_608;
export const VIDEO_MEDIA_CHUNK_LIMIT = 32_768;
export type VideoMediaKind = 'SESSION' | 'CONFIG' | 'KEY' | 'DELTA';
export type VideoMediaDelivery = Readonly<{
  version: 1;
  videoId: string;
  deliveryId: number;
  geometryId: number;
  configId: number;
  packetId: number;
  kind: VideoMediaKind;
  ptsUs: number | null;
  totalBytes: number;
  width: number;
  height: number;
  bytes: Uint8Array;
}>;
export type VideoMediaHeader = Readonly<{
  version: 1;
  sessionId: string;
  attemptId: string;
  videoId: string;
  creditId: number;
  geometryId: number;
  configId: number;
  packetId: number;
  kind: VideoMediaKind;
  ptsUs: number | null;
  totalBytes: number;
  offset: number;
  width: number;
  height: number;
}>;
const headerKeys = [
  'version',
  'sessionId',
  'attemptId',
  'videoId',
  'creditId',
  'geometryId',
  'configId',
  'packetId',
  'kind',
  'ptsUs',
  'totalBytes',
  'offset',
  'width',
  'height',
] as const;
const deliveryKeys = [
  'version',
  'videoId',
  'deliveryId',
  'geometryId',
  'configId',
  'packetId',
  'kind',
  'ptsUs',
  'totalBytes',
  'width',
  'height',
  'bytes',
] as const;
const id = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
function record(raw: unknown, keys: readonly string[]): Record<string, unknown> | null {
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
function common(v: Record<string, unknown>): boolean {
  if (
    v.version !== 1 ||
    !id(v.videoId) ||
    !count(v.geometryId) ||
    v.geometryId === 0 ||
    !count(v.configId) ||
    !count(v.packetId) ||
    !count(v.totalBytes) ||
    !count(v.width) ||
    !count(v.height) ||
    v.width === 0 ||
    v.height === 0 ||
    v.width > 4096 ||
    v.height > 4096 ||
    v.width * v.height > 8_388_608
  )
    return false;
  if (v.kind === 'SESSION')
    return v.packetId === 0 && v.configId === 0 && v.totalBytes === 0 && v.ptsUs === null;
  if (
    v.configId === 0 ||
    v.packetId === 0 ||
    v.totalBytes === 0 ||
    v.totalBytes > VIDEO_MEDIA_PACKET_LIMIT
  )
    return false;
  if (v.kind === 'CONFIG') return v.ptsUs === null && v.totalBytes <= 65_536;
  return (v.kind === 'KEY' || v.kind === 'DELTA') && count(v.ptsUs);
}
export function snapshotVideoMediaDelivery(raw: unknown): VideoMediaDelivery | null {
  const v = record(raw, deliveryKeys);
  if (!v || !common(v) || !count(v.deliveryId) || v.deliveryId === 0) return null;
  try {
    if (!(v.bytes instanceof Uint8Array) || v.bytes.byteLength !== v.totalBytes) return null;
    const bytes = Uint8Array.prototype.slice.call(v.bytes) as Uint8Array;
    return Object.freeze({ ...v, bytes }) as VideoMediaDelivery;
  } catch {
    return null;
  }
}
export function parseVideoMediaHeader(
  raw: Uint8Array,
  payloadLength: number,
): VideoMediaHeader | null {
  try {
    if (
      raw.length === 0 ||
      raw.length > 1024 ||
      !count(payloadLength) ||
      payloadLength > VIDEO_MEDIA_CHUNK_LIMIT ||
      raw.some((byte) => byte < 32 || byte > 126)
    )
      return null;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    const v = record(JSON.parse(text), headerKeys);
    if (
      !v ||
      !common(v) ||
      !id(v.sessionId) ||
      !id(v.attemptId) ||
      !count(v.creditId) ||
      v.creditId === 0 ||
      !count(v.offset)
    )
      return null;
    // Exact source-owned canonical form also rejects duplicate keys and reordered/extra syntax.
    if (JSON.stringify(v) !== text) return null;
    if (v.kind === 'SESSION') {
      if (v.offset !== 0 || payloadLength !== 0) return null;
    } else if (
      v.offset >= (v.totalBytes as number) ||
      payloadLength !== Math.min(VIDEO_MEDIA_CHUNK_LIMIT, (v.totalBytes as number) - v.offset)
    )
      return null;
    return Object.freeze(v) as VideoMediaHeader;
  } catch {
    return null;
  }
}
export type VideoWireFrame =
  | Readonly<{ kind: 'CONTROL'; bytes: Uint8Array }>
  | Readonly<{ kind: 'MEDIA'; header: VideoMediaHeader; bytes: Uint8Array }>;
/** Fixed storage; arbitrary event splitting/coalescing never changes framing. */
export function createVideoWireParser(emit: (frame: VideoWireFrame) => void) {
  const buffer = new Uint8Array(65_536);
  let used = 0,
    target = 0,
    stopped = false,
    active = false;
  function close() {
    stopped = true;
    used = 0;
    target = 0;
  }
  function push(raw: Uint8Array): boolean {
    if (stopped || active || !(raw instanceof Uint8Array) || raw.length > 65_536) {
      close();
      return false;
    }
    active = true;
    try {
      for (const byte of raw) {
        if (stopped || used >= buffer.length) throw Error('MEDIA_FRAME_REJECTED');
        buffer[used++] = byte;
        if (buffer[0] === 0) {
          if (used === 16) {
            const magic = [65, 86, 77, 69, 68, 48, 49];
            if (magic.some((value, i) => buffer[i + 1] !== value))
              throw Error('MEDIA_FRAME_REJECTED');
            const view = new DataView(buffer.buffer);
            const h = view.getUint32(8, false),
              b = view.getUint32(12, false);
            if (h === 0 || h > 1024 || b > VIDEO_MEDIA_CHUNK_LIMIT)
              throw Error('MEDIA_FRAME_REJECTED');
            target = 16 + h + b;
          }
          if (target !== 0 && used === target) {
            const view = new DataView(buffer.buffer),
              h = view.getUint32(8, false),
              b = view.getUint32(12, false);
            const header = parseVideoMediaHeader(buffer.subarray(16, 16 + h), b);
            if (!header) throw Error('MEDIA_FRAME_REJECTED');
            const bytes = buffer.slice(16 + h, target);
            used = 0;
            target = 0;
            emit(Object.freeze({ kind: 'MEDIA', header, bytes }));
          }
        } else {
          if (buffer[0] !== 123) throw Error('MEDIA_FRAME_REJECTED');
          if (byte === 10) {
            const bytes = buffer.slice(0, used);
            used = 0;
            emit(Object.freeze({ kind: 'CONTROL', bytes }));
          }
        }
      }
      return !stopped;
    } catch {
      close();
      return false;
    } finally {
      active = false;
    }
  }
  return Object.freeze({
    push,
    close,
    get pending() {
      return used !== 0;
    },
  });
}
