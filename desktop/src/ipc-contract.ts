// Public read-only foundation wire contract. No Electron or service imports.
export type Method = 'health.get' | 'settings.get';
export type ErrorCode = 'INVALID_TRANSPORT' | 'PAYLOAD_TOO_LARGE' | 'INVALID_JSON' |
  'INVALID_SHAPE' | 'UNSUPPORTED_VERSION' | 'UNKNOWN_METHOD' | 'UNTRUSTED_SENDER' |
  'SESSION_UNAVAILABLE' | 'SESSION_REVOKED' | 'BUSY' | 'TIMEOUT' | 'INTERNAL_FAILURE';
export type Request = Readonly<{ version: 1; requestId: string; method: Method }>;
export type Parsed = { ok: true; request: Request } | { ok: false; code: ErrorCode };
export const REQUEST_BYTES = 512;
export const RESPONSE_BYTES = 1024;
export const CHANNEL = 'foundation:request:v1';

const stringToken = '"(?:[^"\\\\\\u0000-\\u001f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"';
const scalarToken = `(?:${stringToken}|-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)`;
const pair = new RegExp(`\\s*(${stringToken})\\s*:\\s*(${scalarToken})\\s*`, 'y');

// Only flat scalar records can be accepted. Validate JSON first, then consume the
// complete flat grammar and decoded keys: duplicate keys cannot disappear in parse.
function uniqueFlatKeys(raw: string): boolean {
  const text = raw.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return false;
  const keys = new Set<string>();
  let offset = 1;
  for (;;) {
    pair.lastIndex = offset;
    const found = pair.exec(text);
    if (!found) return false;
    const key: unknown = JSON.parse(found[1]!);
    if (typeof key !== 'string' || keys.has(key)) return false;
    keys.add(key); offset = pair.lastIndex;
    if (text[offset] === '}') return offset === text.length - 1;
    if (text[offset] !== ',') return false;
    offset++;
  }
}

export function parseRequest(raw: unknown): Parsed {
  if (typeof raw !== 'string') return { ok: false, code: 'INVALID_TRANSPORT' };
  if (raw.length > REQUEST_BYTES || new TextEncoder().encode(raw).byteLength > REQUEST_BYTES)
    return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { ok: false, code: 'INVALID_JSON' }; }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !uniqueFlatKeys(raw))
    return { ok: false, code: 'INVALID_SHAPE' };
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !Object.hasOwn(record, 'version') ||
      !Object.hasOwn(record, 'requestId') || !Object.hasOwn(record, 'method'))
    return { ok: false, code: 'INVALID_SHAPE' };
  if (typeof record.version !== 'number' || !Number.isSafeInteger(record.version))
    return { ok: false, code: 'INVALID_SHAPE' };
  if (record.version !== 1) return { ok: false, code: 'UNSUPPORTED_VERSION' };
  if (typeof record.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(record.requestId))
    return { ok: false, code: 'INVALID_SHAPE' };
  if (record.method !== 'health.get' && record.method !== 'settings.get')
    return { ok: false, code: 'UNKNOWN_METHOD' };
  return { ok: true, request: Object.freeze({ version: 1, requestId: record.requestId, method: record.method }) };
}

export function errorResponse(code: ErrorCode): string {
  return JSON.stringify({ version: 1, ok: false, code });
}
export function publicResponse(request: Request): string {
  const result = request.method === 'health.get'
    ? { kind: 'health', status: 'READY', services: 'UNAVAILABLE' }
    : { kind: 'settings', revision: 0, persistence: 'NOT_PERSISTED', theme: 'LIGHT' };
  const response = JSON.stringify({ version: 1, ok: true, requestId: request.requestId, result });
  return new TextEncoder().encode(response).byteLength <= RESPONSE_BYTES ? response : errorResponse('INTERNAL_FAILURE');
}
