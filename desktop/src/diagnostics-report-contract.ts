export const DIAGNOSTICS_EXPORT_CHANNEL = 'foundation:device-diagnostics:v1';
export const DIAGNOSTICS_EXPORT_CODES = Object.freeze([
  'INVALID_REQUEST',
  'BUSY',
  'CANCELLED',
  'OWNER_REVOKED',
  'COLLISION',
  'IO_FAILED',
  'CLEANUP_FAILED',
  'SESSION_UNAVAILABLE',
  'SESSION_REVOKED',
  'UNTRUSTED_SENDER',
  'INTERNAL_FAILURE',
  'STALE_REVISION',
  'ID_CONFLICT',
  'LIMIT_EXCEEDED',
  'TIMEOUT',
] as const);
export type DiagnosticsExportCode = (typeof DIAGNOSTICS_EXPORT_CODES)[number];
export type DiagnosticsExportRequest = Readonly<
  | { version: 1; requestId: string; method: 'diagnostics.get' }
  | { version: 1; requestId: string; method: 'diagnostics.export'; expectedRevision: number }
  | { version: 1; requestId: string; method: 'diagnostics.cancel'; operationId: string }
>;
export type DiagnosticsExportSnapshot = Readonly<{
  revision: number;
  state: 'IDLE' | 'PENDING' | 'CANCEL_PENDING' | 'EXPORTED' | 'CANCELLED' | 'FAILED';
  operationId: string | null;
  records: number;
  dropped: number;
  bytes: number;
  sha256: string | null;
  code: DiagnosticsExportCode | null;
}>;
export type DiagnosticsExportResponse = Readonly<
  | { version: 1; requestId: string | null; ok: false; code: DiagnosticsExportCode }
  | { version: 1; requestId: string; ok: true; snapshot: DiagnosticsExportSnapshot }
>;
export const diagnosticExportId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export const diagnosticExportRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const requestId = (value: unknown): value is string =>
  typeof value === 'string' && /^p[1-9][0-9]{0,14}$/.test(value);
function object(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    return false;
  const d = Object.getOwnPropertyDescriptors(value);
  return (
    Reflect.ownKeys(d).length === keys.length &&
    keys.every((k) => !!d[k] && Object.hasOwn(d[k], 'value'))
  );
}
function decode(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function parseDiagnosticsExportRequest(raw: unknown): DiagnosticsExportRequest | null {
  const value = decode(raw);
  if (!value || typeof value !== 'object') return null;
  const method = (value as Record<string, unknown>).method;
  const extra =
    method === 'diagnostics.export'
      ? ['expectedRevision']
      : method === 'diagnostics.cancel'
        ? ['operationId']
        : method === 'diagnostics.get'
          ? []
          : null;
  if (
    !extra ||
    !object(value, ['version', 'requestId', 'method', ...extra]) ||
    value.version !== 1 ||
    !requestId(value.requestId)
  )
    return null;
  if (method === 'diagnostics.export' && !diagnosticExportRevision(value.expectedRevision))
    return null;
  if (method === 'diagnostics.cancel' && !diagnosticExportId(value.operationId)) return null;
  return Object.freeze(value) as DiagnosticsExportRequest;
}
function snapshot(value: unknown): value is DiagnosticsExportSnapshot {
  if (
    !object(value, [
      'revision',
      'state',
      'operationId',
      'records',
      'dropped',
      'bytes',
      'sha256',
      'code',
    ])
  )
    return false;
  if (
    !diagnosticExportRevision(value.revision) ||
    !['IDLE', 'PENDING', 'CANCEL_PENDING', 'EXPORTED', 'CANCELLED', 'FAILED'].includes(
      value.state as string,
    )
  )
    return false;
  if (
    ![value.records, value.dropped, value.bytes].every(diagnosticExportRevision) ||
    (value.records as number) > 512 ||
    (value.bytes as number) > 512 * 1024
  )
    return false;
  if (
    value.code !== null &&
    !DIAGNOSTICS_EXPORT_CODES.includes(value.code as DiagnosticsExportCode)
  )
    return false;
  if (value.state === 'IDLE')
    return value.operationId === null && value.sha256 === null && value.code === null;
  if (!diagnosticExportId(value.operationId)) return false;
  if (value.state === 'EXPORTED')
    return (
      typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256) && value.code === null
    );
  if (value.sha256 !== null) return false;
  if (value.state === 'CANCELLED') return value.code === 'CANCELLED';
  if (value.state === 'FAILED') return value.code !== null;
  return value.code === null;
}
export function diagnosticsExportError(id: string | null, code: DiagnosticsExportCode): string {
  return JSON.stringify({ version: 1, requestId: id, ok: false, code });
}
export function diagnosticsExportSuccess(id: string, value: DiagnosticsExportSnapshot): string {
  if (!requestId(id) || !snapshot(value)) return diagnosticsExportError(null, 'INTERNAL_FAILURE');
  return JSON.stringify({ version: 1, requestId: id, ok: true, snapshot: value });
}
export function parseDiagnosticsExportResponse(raw: unknown): DiagnosticsExportResponse | null {
  const value = decode(raw);
  if (!value || typeof value !== 'object') return null;
  const success = (value as Record<string, unknown>).ok === true;
  if (
    !object(
      value,
      success ? ['version', 'requestId', 'ok', 'snapshot'] : ['version', 'requestId', 'ok', 'code'],
    ) ||
    value.version !== 1
  )
    return null;
  if (success) {
    if (!requestId(value.requestId) || !snapshot(value.snapshot)) return null;
    Object.freeze(value.snapshot);
  } else if (
    value.ok !== false ||
    (value.requestId !== null && !requestId(value.requestId)) ||
    !DIAGNOSTICS_EXPORT_CODES.includes(value.code as DiagnosticsExportCode)
  )
    return null;
  return Object.freeze(value) as DiagnosticsExportResponse;
}
