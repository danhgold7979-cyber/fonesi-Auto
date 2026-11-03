/** Private fixed metadata query facts. No issuer, transport or process authority. */
import { validAdbSerial } from './adb-discovery.ts';
export const METADATA_QUERY_FIELDS = Object.freeze([
  'MODEL',
  'MANUFACTURER',
  'OS',
  'SDK',
  'LOCALE',
  'RESOLUTION',
  'DENSITY',
  'BATTERY',
  'STORAGE',
] as const);
export type MetadataQueryField = (typeof METADATA_QUERY_FIELDS)[number];
export type MetadataQueryRequest = Readonly<{
  version: 3;
  kind: 'METADATA_QUERY';
  commandId: string;
  correlationId: string;
  ownerId: string;
  deviceId: string;
  bindingId: string;
  generation: number;
  serial: string;
  transportId: string;
  field: MetadataQueryField;
  deadlineUtc: number;
}>;
export type MetadataQueryFacts = Readonly<{
  version: 1;
  kind: 'METADATA_QUERY';
  status: 'COMPLETE' | 'FAILED' | 'UNRETIRED';
  code:
    | 'OK'
    | 'BUSY'
    | 'CLOSED'
    | 'DEADLINE'
    | 'ADMISSION_REJECTED'
    | 'METADATA_REJECTED'
    | 'NATIVE_FAILED'
    | 'UNRETIRED';
  dispatched: boolean;
  operationRetired: boolean;
  stdoutBase64: string | null;
  stderrBase64: string | null;
  remoteExitCode: number | null;
  observedAtUtc: number | null;
}>;
export type QueryRetirement = Readonly<{ status: 'RETIRED' | 'UNRETIRED' }>;
export type MetadataQueryHandle = Readonly<{
  handoff: 'LOCAL_REFUSAL' | 'QUERY';
  result: Promise<MetadataQueryFacts>;
  retirement: Promise<QueryRetirement>;
}>;
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
      keys.some((k) => !d[k] || !('value' in d[k]) || !d[k].enumerable)
    )
      return null;
    return Object.fromEntries(keys.map((k) => [k, d[k]?.value]));
  } catch {
    return null;
  }
}
export function validMetadataTransportId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 20 &&
    !/[\r\n]/.test(value) &&
    /^[1-9][0-9]*$/.test(value) &&
    (value.length < 20 || value <= '18446744073709551615')
  );
}
export function validMetadataDeadline(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    value >= 0 &&
    value <= 8640000000000000
  );
}
export function validMetadataField(value: unknown): value is MetadataQueryField {
  return typeof value === 'string' && METADATA_QUERY_FIELDS.some((field) => field === value);
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function snapshotMetadataQueryRequest(raw: unknown): MetadataQueryRequest | null {
  const v = record(raw, [
    'version',
    'kind',
    'commandId',
    'correlationId',
    'ownerId',
    'deviceId',
    'bindingId',
    'generation',
    'serial',
    'transportId',
    'field',
    'deadlineUtc',
  ]);
  if (
    v?.version !== 3 ||
    v.kind !== 'METADATA_QUERY' ||
    ![v.commandId, v.correlationId, v.ownerId, v.deviceId, v.bindingId].every(uuid) ||
    typeof v.generation !== 'number' ||
    !Number.isSafeInteger(v.generation) ||
    Object.is(v.generation, -0) ||
    v.generation < 0 ||
    !validAdbSerial(v.serial) ||
    /[\r\n]/.test(v.serial) ||
    !validMetadataTransportId(v.transportId) ||
    !validMetadataField(v.field) ||
    !validMetadataDeadline(v.deadlineUtc)
  )
    return null;
  return Object.freeze(v) as MetadataQueryRequest;
}
function text(raw: unknown): Uint8Array | null {
  if (
    typeof raw !== 'string' ||
    raw.length > 43696 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)
  )
    return null;
  const bytes = Buffer.from(raw, 'base64');
  if (
    bytes.length > 32768 ||
    bytes.toString('base64') !== raw ||
    (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
  )
    return null;
  if (new TextDecoder('utf-8', { fatal: true }).decode(bytes).includes('\0')) return null;
  return bytes;
}
export function snapshotMetadataQueryFacts(raw: unknown): MetadataQueryFacts | null {
  try {
    const v = record(raw, [
      'version',
      'kind',
      'status',
      'code',
      'dispatched',
      'operationRetired',
      'stdoutBase64',
      'stderrBase64',
      'remoteExitCode',
      'observedAtUtc',
    ]);
    if (
      v?.version !== 1 ||
      v.kind !== 'METADATA_QUERY' ||
      typeof v.dispatched !== 'boolean' ||
      typeof v.operationRetired !== 'boolean'
    )
      return null;
    if (v.status === 'COMPLETE') {
      if (
        v.code !== 'OK' ||
        !v.dispatched ||
        !v.operationRetired ||
        typeof v.remoteExitCode !== 'number' ||
        !Number.isInteger(v.remoteExitCode) ||
        Object.is(v.remoteExitCode, -0) ||
        v.remoteExitCode < 0 ||
        v.remoteExitCode > 255 ||
        !validMetadataDeadline(v.observedAtUtc)
      )
        return null;
      const stdout = text(v.stdoutBase64),
        stderr = text(v.stderrBase64);
      if (
        !stdout ||
        !stderr ||
        stdout.length + stderr.length > 32768 ||
        (v.stdoutBase64 as string).length + (v.stderrBase64 as string).length > 43696
      )
        return null;
    } else {
      if (
        v.stdoutBase64 !== null ||
        v.stderrBase64 !== null ||
        v.remoteExitCode !== null ||
        v.observedAtUtc !== null
      )
        return null;
      if (v.status === 'FAILED') {
        if (
          !v.operationRetired ||
          ![
            'BUSY',
            'CLOSED',
            'DEADLINE',
            'ADMISSION_REJECTED',
            'METADATA_REJECTED',
            'NATIVE_FAILED',
          ].includes(v.code as string)
        )
          return null;
      } else if (v.status !== 'UNRETIRED' || v.code !== 'UNRETIRED' || v.operationRetired)
        return null;
    }
    return Object.freeze(v) as MetadataQueryFacts;
  } catch {
    return null;
  }
}
export function snapshotQueryRetirement(raw: unknown): QueryRetirement | null {
  const v = record(raw, ['status']);
  return v && (v.status === 'RETIRED' || v.status === 'UNRETIRED')
    ? (Object.freeze(v) as QueryRetirement)
    : null;
}
