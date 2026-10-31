// Fixed main-constructed events only. No exception serialization or caller metadata.
export type LogHealth = 'AVAILABLE' | 'DEGRADED';
export type LogEvent =
  | 'STARTUP_READY'
  | 'STARTUP_FAILED'
  | 'SHUTDOWN'
  | 'BRIDGE_RESULT'
  | 'RENDERER_LOST'
  | 'LOGGING_DEGRADED'
  | 'LOGGING_RECOVERED'
  | 'RETENTION_RESULT';
export type LogCode =
  | 'OK'
  | 'INVALID_TRANSPORT'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_SHAPE'
  | 'UNSUPPORTED_VERSION'
  | 'UNKNOWN_METHOD'
  | 'UNTRUSTED_SENDER'
  | 'SESSION_UNAVAILABLE'
  | 'SESSION_REVOKED'
  | 'BUSY'
  | 'TIMEOUT'
  | 'INTERNAL_FAILURE'
  | 'STARTUP_FAILURE'
  | 'RENDERER_LOSS'
  | 'WRITE_FAILED'
  | 'FLUSH_FAILED'
  | 'QUEUE_FULL'
  | 'RETENTION_FAILED'
  | 'HOLDS_UNAVAILABLE'
  | 'CLOCK_REGRESSION'
  | 'RECOVERED';
export type LogRecord = Readonly<{
  schemaVersion: 1;
  runId: string;
  sequence: number;
  utc: string;
  severity: 'INFO' | 'WARN' | 'ERROR';
  component: 'MAIN' | 'PRELOAD_BOUNDARY' | 'LOGGING';
  task: 'P1-04';
  event: LogEvent;
  diagnosticId: string | null;
  code: LogCode;
}>;
export const LOG_RECORD_BYTES = 2048;
const publicCodes: readonly string[] = [
  'INVALID_TRANSPORT',
  'PAYLOAD_TOO_LARGE',
  'INVALID_JSON',
  'INVALID_SHAPE',
  'UNSUPPORTED_VERSION',
  'UNKNOWN_METHOD',
  'UNTRUSTED_SENDER',
  'SESSION_UNAVAILABLE',
  'SESSION_REVOKED',
  'BUSY',
  'TIMEOUT',
  'INTERNAL_FAILURE',
];
const deniedBeforeAdmission: readonly string[] = [
  'UNTRUSTED_SENDER',
  'SESSION_UNAVAILABLE',
  'SESSION_REVOKED',
  'BUSY',
  'INTERNAL_FAILURE',
];
export function diagnosticId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}
export function utcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))
    return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}
export function publicErrorCode(value: unknown): boolean {
  return typeof value === 'string' && publicCodes.includes(value);
}
export function nullableDiagnosticCode(value: unknown): boolean {
  return typeof value === 'string' && deniedBeforeAdmission.includes(value);
}
function tuple(record: Record<string, unknown>): boolean {
  const { event, code, severity, component, diagnosticId: reference } = record;
  if (typeof code !== 'string') return false;
  if (event === 'BRIDGE_RESULT')
    return (
      component === 'PRELOAD_BOUNDARY' &&
      (code === 'OK' || publicCodes.includes(code)) &&
      severity === (code === 'OK' ? 'INFO' : code === 'INTERNAL_FAILURE' ? 'ERROR' : 'WARN') &&
      (reference === null ? deniedBeforeAdmission.includes(code) : diagnosticId(reference))
    );
  if (reference !== null) return false;
  if (event === 'STARTUP_READY')
    return component === 'MAIN' && code === 'OK' && severity === 'INFO';
  if (event === 'STARTUP_FAILED')
    return component === 'MAIN' && code === 'STARTUP_FAILURE' && severity === 'ERROR';
  if (event === 'SHUTDOWN')
    return (
      component === 'MAIN' &&
      (code === 'OK' || code === 'FLUSH_FAILED') &&
      severity === (code === 'OK' ? 'INFO' : 'ERROR')
    );
  if (event === 'RENDERER_LOST')
    return component === 'MAIN' && code === 'RENDERER_LOSS' && severity === 'ERROR';
  if (component !== 'LOGGING') return false;
  if (event === 'LOGGING_DEGRADED')
    return (
      [
        'WRITE_FAILED',
        'FLUSH_FAILED',
        'QUEUE_FULL',
        'RETENTION_FAILED',
        'HOLDS_UNAVAILABLE',
        'CLOCK_REGRESSION',
      ].includes(code) && severity === (code === 'CLOCK_REGRESSION' ? 'WARN' : 'ERROR')
    );
  if (event === 'LOGGING_RECOVERED') return code === 'RECOVERED' && severity === 'INFO';
  if (event === 'RETENTION_RESULT')
    return (
      ['OK', 'RETENTION_FAILED', 'HOLDS_UNAVAILABLE', 'CLOCK_REGRESSION'].includes(code) &&
      severity === (code === 'OK' ? 'INFO' : 'WARN')
    );
  return false;
}
export function encodeLogRecord(input: unknown): string | null {
  try {
    if (
      input === null ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype ||
      Object.getOwnPropertySymbols(input).length !== 0
    )
      return null;
    const fields = [
      'schemaVersion',
      'runId',
      'sequence',
      'utc',
      'severity',
      'component',
      'task',
      'event',
      'diagnosticId',
      'code',
    ];
    if (Object.getOwnPropertyNames(input).length !== fields.length) return null;
    const record: Record<string, unknown> = {};
    for (const key of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true)
        return null;
      record[key] = descriptor.value;
    }
    if (
      record.schemaVersion !== 1 ||
      !diagnosticId(record.runId) ||
      typeof record.sequence !== 'number' ||
      !Number.isSafeInteger(record.sequence) ||
      record.sequence <= 0 ||
      !utcTimestamp(record.utc) ||
      record.task !== 'P1-04' ||
      !tuple(record)
    )
      return null;
    const encoded = JSON.stringify(record) + '\n';
    return new TextEncoder().encode(encoded).byteLength <= LOG_RECORD_BYTES ? encoded : null;
  } catch {
    return null;
  }
}
