import type { VideoMediaHeader } from '../video-media-contract.ts';
/** Private headless video control facts; no media bytes, issuer or effect authority. */
export const VIDEO_PROTOCOL = 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1' as const;
export const VIDEO_CODES = Object.freeze([
  'OK',
  'NOT_READY',
  'BUSY',
  'STALE_TARGET',
  'ADMISSION_REJECTED',
  'DEPLOYMENT_FAILED',
  'PROTOCOL_FAILED',
  'REMOTE_FAILED',
  'DEADLINE_EXCEEDED',
  'OUTCOME_UNKNOWN',
  'CLOSED',
] as const);
export type VideoCode = (typeof VIDEO_CODES)[number];
export type VideoSnapshot = Readonly<{
  sessionId: string;
  snapshotRevision: number;
  state: 'PREPARING' | 'STARTING' | 'RECEIVING' | 'STOPPING' | 'CLOSED' | 'FAILED' | 'UNCERTAIN';
  code: VideoCode;
  streamObserved: boolean;
  sessionPackets: number;
  mediaPackets: number;
  encodedBytes: number;
  lastWidth: number | null;
  lastHeight: number | null;
  directory: 'NONE' | 'CREATED' | 'UNKNOWN';
  upload: 'NONE' | 'PARTIAL' | 'VERIFIED' | 'UNKNOWN';
  launch: 'NONE' | 'STARTED' | 'EXITED' | 'UNKNOWN';
  localRetired: boolean;
  cleanup: 'NOT_REQUIRED' | 'PENDING' | 'CLEANED' | 'UNKNOWN';
}>;
export type VideoStart = Readonly<{
  videoId: string;
  transportId: string;
  hostEpoch: number;
  deadlineUtc: number;
  artifactId: string;
  scid: number;
  nonceHex: string;
}>;
export type VideoControl = 'VIDEO_START' | 'VIDEO_STATUS' | 'VIDEO_STOP';
export type VideoTransportSession = Readonly<{
  started: Promise<VideoSnapshot>;
  status(): Promise<VideoSnapshot>;
  stop(): Promise<VideoSnapshot>;
}>;
export type VideoSession = Readonly<{
  started: Promise<VideoSnapshot>;
  status(): Promise<VideoSnapshot>;
  stop(): Promise<VideoSnapshot>;
  snapshot(): VideoSnapshot;
  readonly retired: boolean;
}>;
export function videoRecord(raw: unknown, keys: readonly string[]): Record<string, unknown> | null {
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
export function videoUuid(raw: unknown): raw is string {
  return (
    typeof raw === 'string' &&
    raw.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)
  );
}
function count(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 && !Object.is(raw, -0);
}
function hex(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length === 64 && /^[0-9a-f]{64}$/.test(raw);
}
export function snapshotVideoStart(raw: unknown): VideoStart | null {
  const v = videoRecord(raw, [
    'videoId',
    'transportId',
    'hostEpoch',
    'deadlineUtc',
    'artifactId',
    'scid',
    'nonceHex',
  ]);
  if (
    !v ||
    !videoUuid(v.videoId) ||
    typeof v.transportId !== 'string' ||
    v.transportId.length > 20 ||
    !/^[1-9][0-9]*$/.test(v.transportId) ||
    /[^0-9]/.test(v.transportId) ||
    (v.transportId.length === 20 && v.transportId > '18446744073709551615') ||
    !count(v.hostEpoch) ||
    v.hostEpoch < 1 ||
    !count(v.deadlineUtc) ||
    v.deadlineUtc > 8640000000000000 ||
    !hex(v.artifactId) ||
    !hex(v.nonceHex) ||
    !count(v.scid) ||
    v.scid > 2147483647
  )
    return null;
  return Object.freeze(v) as VideoStart;
}
export function snapshotVideo(raw: unknown): VideoSnapshot | null {
  const v = videoRecord(raw, [
    'sessionId',
    'snapshotRevision',
    'state',
    'code',
    'streamObserved',
    'sessionPackets',
    'mediaPackets',
    'encodedBytes',
    'lastWidth',
    'lastHeight',
    'directory',
    'upload',
    'launch',
    'localRetired',
    'cleanup',
  ]);
  if (
    !v ||
    !videoUuid(v.sessionId) ||
    !count(v.snapshotRevision) ||
    !['PREPARING', 'STARTING', 'RECEIVING', 'STOPPING', 'CLOSED', 'FAILED', 'UNCERTAIN'].includes(
      v.state as string,
    ) ||
    !VIDEO_CODES.includes(v.code as VideoCode) ||
    typeof v.streamObserved !== 'boolean' ||
    typeof v.localRetired !== 'boolean' ||
    !count(v.sessionPackets) ||
    !count(v.mediaPackets) ||
    !count(v.encodedBytes) ||
    !['NONE', 'CREATED', 'UNKNOWN'].includes(v.directory as string) ||
    !['NONE', 'PARTIAL', 'VERIFIED', 'UNKNOWN'].includes(v.upload as string) ||
    !['NONE', 'STARTED', 'EXITED', 'UNKNOWN'].includes(v.launch as string) ||
    !['NOT_REQUIRED', 'PENDING', 'CLEANED', 'UNKNOWN'].includes(v.cleanup as string)
  )
    return null;
  if (
    v.directory === 'NONE' &&
    (v.upload !== 'NONE' || v.launch !== 'NONE' || v.cleanup !== 'NOT_REQUIRED')
  )
    return null;
  if ((v.launch === 'STARTED' || v.launch === 'EXITED') && v.upload !== 'VERIFIED') return null;
  const dimensions =
    count(v.lastWidth) &&
    v.lastWidth > 0 &&
    v.lastWidth <= 16384 &&
    count(v.lastHeight) &&
    v.lastHeight > 0 &&
    v.lastHeight <= 16384;
  if (v.sessionPackets === 0 ? v.lastWidth !== null || v.lastHeight !== null : !dimensions)
    return null;
  if (v.mediaPackets > 0 && (v.sessionPackets === 0 || v.encodedBytes < v.mediaPackets))
    return null;
  if (v.streamObserved !== v.mediaPackets > 0) return null;
  if ((v.state === 'PREPARING' || v.state === 'STARTING') && (v.code !== 'OK' || v.streamObserved))
    return null;
  if (
    v.state === 'RECEIVING' &&
    (v.code !== 'OK' ||
      !v.streamObserved ||
      v.localRetired ||
      v.directory !== 'CREATED' ||
      v.upload !== 'VERIFIED' ||
      v.launch !== 'STARTED')
  )
    return null;
  if (v.state === 'UNCERTAIN' && v.code !== 'OUTCOME_UNKNOWN') return null;
  if (v.state === 'FAILED' && (v.code === 'OK' || v.code === 'OUTCOME_UNKNOWN')) return null;
  if (
    v.state === 'CLOSED' &&
    (!v.localRetired ||
      v.code === 'OK' ||
      v.code === 'OUTCOME_UNKNOWN' ||
      !(
        (v.directory === 'NONE' &&
          v.upload === 'NONE' &&
          v.launch === 'NONE' &&
          v.cleanup === 'NOT_REQUIRED') ||
        (v.directory === 'CREATED' &&
          (v.launch === 'NONE' || v.launch === 'EXITED') &&
          v.cleanup === 'CLEANED')
      ))
  )
    return null;
  if (
    v.cleanup === 'CLEANED' &&
    (v.directory !== 'CREATED' || !v.localRetired || (v.launch !== 'NONE' && v.launch !== 'EXITED'))
  )
    return null;
  return Object.freeze(v) as VideoSnapshot;
}
export function preparingVideo(sessionId: string): VideoSnapshot {
  if (!videoUuid(sessionId)) throw Error('VIDEO_REJECTED');
  return Object.freeze({
    sessionId,
    snapshotRevision: 0,
    state: 'PREPARING',
    code: 'OK',
    streamObserved: false,
    sessionPackets: 0,
    mediaPackets: 0,
    encodedBytes: 0,
    lastWidth: null,
    lastHeight: null,
    directory: 'NONE',
    upload: 'NONE',
    launch: 'NONE',
    localRetired: false,
    cleanup: 'NOT_REQUIRED',
  });
}

export type VideoAdmission = Readonly<{
  videoId: string;
  deadlineUtc: number;
  scid: number;
  nonceHex: string;
}>;
export function snapshotVideoAdmission(raw: unknown): VideoAdmission | null {
  const v = videoRecord(raw, ['videoId', 'deadlineUtc', 'scid', 'nonceHex']);
  if (
    !v ||
    !videoUuid(v.videoId) ||
    !count(v.deadlineUtc) ||
    v.deadlineUtc > 8640000000000000 ||
    !count(v.scid) ||
    v.scid > 2147483647 ||
    !hex(v.nonceHex)
  )
    return null;
  return Object.freeze(v) as VideoAdmission;
}

/** Restrictive downstream backpressure only; never target authority. */
export type VideoMediaSink = Readonly<{
  accept(header: VideoMediaHeader, bytes: Uint8Array): Promise<void>;
  close(): void;
}>;
