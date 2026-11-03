/** Fixed explicit video interaction metadata; never transport or target authority. */
export const VIDEO_STREAM_CHANNEL = 'foundation:video:v1';
export const VIDEO_PORT_CHANNEL = 'foundation:video:port:v1';
export const VIDEO_WINDOW_ORIGIN = 'auto-foundation://app';
export type VideoStreamRequest = Readonly<
  | {
      version: 1;
      requestId: string;
      kind: 'START';
      deviceId: string;
      expectedRegistryRevision: number;
    }
  | { version: 1; requestId: string; kind: 'STOP'; videoId: string }
>;
export type VideoPortMetadata = Readonly<{
  version: 1;
  videoId: string;
  requestId: string;
  deviceId: string;
  generation: number;
  deadlineUtc: number;
}>;
/** Notification only: cleanup proof still comes exclusively from STOPPED. */
export type VideoRefusal = Readonly<{
  version: 1;
  videoId: string;
  kind: 'REFUSED';
  reason: 'BUSY' | 'QUOTA' | 'STALE_TARGET' | 'REJECTED';
}>;
export function snapshotVideoRefusal(raw: unknown): VideoRefusal | null {
  const v = record(raw, ['version', 'videoId', 'kind', 'reason']);
  return v?.version === 1 &&
    uuid(v.videoId) &&
    v.kind === 'REFUSED' &&
    ['BUSY', 'QUOTA', 'STALE_TARGET', 'REJECTED'].includes(v.reason as string)
    ? (Object.freeze(v) as VideoRefusal)
    : null;
}
export type VideoStreamCode =
  | 'PENDING'
  | 'STOPPED'
  | 'FAILED'
  | 'BUSY'
  | 'UNAVAILABLE'
  | 'INVALID'
  | 'STALE'
  | 'CLOSED'
  | 'UNCERTAIN';
export type VideoStreamResponse = Readonly<{
  version: 1;
  requestId: string | null;
  code: VideoStreamCode;
  videoId: string | null;
}>;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
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
export function parseVideoStreamRequest(raw: unknown): VideoStreamRequest | null {
  try {
    if (typeof raw !== 'string' || raw.length > 1024) return null;
    const parsed = JSON.parse(raw);
    const v = record(
      parsed,
      parsed?.kind === 'START'
        ? ['version', 'requestId', 'kind', 'deviceId', 'expectedRegistryRevision']
        : ['version', 'requestId', 'kind', 'videoId'],
    );
    if (v?.version !== 1 || !uuid(v.requestId) || JSON.stringify(v) !== raw) return null;
    if (
      v.kind === 'START'
        ? !uuid(v.deviceId) || !count(v.expectedRegistryRevision)
        : v.kind !== 'STOP' || !uuid(v.videoId)
    )
      return null;
    return Object.freeze(v) as VideoStreamRequest;
  } catch {
    return null;
  }
}
export function snapshotVideoPortMetadata(raw: unknown): VideoPortMetadata | null {
  const v = record(raw, [
    'version',
    'videoId',
    'requestId',
    'deviceId',
    'generation',
    'deadlineUtc',
  ]);
  if (
    v?.version !== 1 ||
    !uuid(v.videoId) ||
    !uuid(v.requestId) ||
    !uuid(v.deviceId) ||
    !count(v.generation) ||
    !count(v.deadlineUtc) ||
    v.deadlineUtc === 0
  )
    return null;
  return Object.freeze(v) as VideoPortMetadata;
}
export function videoStreamResponse(
  requestId: string | null,
  code: VideoStreamCode,
  videoId: string | null = null,
): string {
  return JSON.stringify({ version: 1, requestId, code, videoId });
}
export function parseVideoStreamResponse(raw: unknown): VideoStreamResponse | null {
  try {
    if (typeof raw !== 'string' || raw.length > 1024) return null;
    const v = record(JSON.parse(raw), ['version', 'requestId', 'code', 'videoId']);
    if (
      v?.version !== 1 ||
      (v.requestId !== null && !uuid(v.requestId)) ||
      (v.videoId !== null && !uuid(v.videoId)) ||
      ![
        'PENDING',
        'STOPPED',
        'FAILED',
        'BUSY',
        'UNAVAILABLE',
        'INVALID',
        'STALE',
        'CLOSED',
        'UNCERTAIN',
      ].includes(v.code as string) ||
      JSON.stringify(v) !== raw ||
      ((v.code === 'PENDING' || v.code === 'STOPPED') && (!uuid(v.requestId) || !uuid(v.videoId)))
    )
      return null;
    return Object.freeze(v) as VideoStreamResponse;
  } catch {
    return null;
  }
}
