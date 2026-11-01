export const SETUP_CODES = Object.freeze([
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
  'STALE_REVISION',
  'INTERNAL_FAILURE',
  'AUDIT_UNAVAILABLE',
  'TIMEOUT',
  'INVALID_REQUEST',
  'TERMS_REQUIRED',
  'TERMS_DECLINED',
  'SETUP_CANCELLED',
  'OWNER_REVOKED',
  'LIMIT_EXCEEDED',
  'ARCHIVE_REJECTED',
  'DOWNLOAD_FAILED',
  'STORAGE_FAILED',
  'OUTCOME_UNKNOWN',
  'RECOVERY_REQUIRED',
] as const);
export type SetupCode = (typeof SETUP_CODES)[number];
export type SetupHealth = 'AVAILABLE' | 'DEGRADED';
export type SetupSnapshot = Readonly<{
  revision: number;
  installationRevision: number | null;
  state:
    | 'UNAVAILABLE'
    | 'AWAITING_RECIPIENT'
    | 'PROVISIONING'
    | 'VERIFIED_LOCAL'
    | 'DECLINED'
    | 'FAILED'
    | 'OUTCOME_UNKNOWN';
  operationId: string | null;
  code: SetupCode | null;
  candidateVersion: '37.0.1';
}>;
export type SetupRequest =
  | Readonly<{ version: 1; requestId: string; method: 'platformTools.get' }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'platformTools.setup.request';
      expectedRevision: number;
    }>;
export type SetupResponse =
  | Readonly<{
      version: 1;
      requestId: string;
      ok: true;
      outcome: 'OBSERVED' | 'PENDING';
      snapshot: SetupSnapshot;
      diagnosticId: string | null;
      loggingHealth: SetupHealth;
    }>
  | Readonly<{
      version: 1;
      requestId: string | null;
      ok: false;
      outcome: 'NOT_STARTED' | 'OUTCOME_UNKNOWN';
      code: SetupCode;
      diagnosticId: string | null;
      loggingHealth: SetupHealth;
    }>;
export const validSetupRevision = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
export const validSetupId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^p[1-9][0-9]{0,15}$/.test(v) &&
  Number.isSafeInteger(Number(v.slice(1))) &&
  String(Number(v.slice(1))) === v.slice(1);
export const validSetupUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error();
  const p = Object.getPrototypeOf(v);
  if (p !== Object.prototype && p !== null) throw Error();
  const descriptors = Object.getOwnPropertyDescriptors(v);
  if (Reflect.ownKeys(descriptors).length !== keys.length) throw Error();
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !('value' in d) || !d.enumerable) throw Error();
    out[key] = d.value;
  }
  return out;
}
export function snapshotSetupSnapshot(input: unknown): SetupSnapshot | null {
  try {
    const v = record(input, [
      'revision',
      'installationRevision',
      'state',
      'operationId',
      'code',
      'candidateVersion',
    ]);
    if (
      !validSetupRevision(v.revision) ||
      (v.installationRevision !== null && !validSetupRevision(v.installationRevision)) ||
      (v.operationId !== null && !validSetupUuid(v.operationId)) ||
      v.candidateVersion !== '37.0.1'
    )
      return null;
    if (
      ['UNAVAILABLE', 'AWAITING_RECIPIENT', 'PROVISIONING', 'VERIFIED_LOCAL'].includes(
        v.state as string,
      )
    ) {
      if (v.code !== null) return null;
    } else if (v.state === 'DECLINED') {
      if (!['TERMS_DECLINED', 'TERMS_REQUIRED', 'SETUP_CANCELLED'].includes(v.code as string))
        return null;
    } else if (v.state === 'OUTCOME_UNKNOWN') {
      if (!['OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED'].includes(v.code as string)) return null;
    } else if (v.state === 'FAILED') {
      if (!SETUP_CODES.includes(v.code as SetupCode)) return null;
    } else return null;
    if (
      v.state === 'VERIFIED_LOCAL' &&
      (!validSetupRevision(v.installationRevision) || v.installationRevision === 0)
    )
      return null;
    if (
      ['AWAITING_RECIPIENT', 'PROVISIONING'].includes(v.state as string) &&
      v.operationId === null
    )
      return null;
    return Object.freeze({ ...v }) as SetupSnapshot;
  } catch {
    return null;
  }
}
export function snapshotSetupRequest(input: unknown): SetupRequest | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const d = Object.getOwnPropertyDescriptor(input, 'method');
    if (!d || !('value' in d)) return null;
    const v = record(
      input,
      d.value === 'platformTools.get'
        ? ['version', 'requestId', 'method']
        : ['version', 'requestId', 'method', 'expectedRevision'],
    );
    if (v.version !== 1 || v.method !== d.value || !validSetupId(v.requestId)) return null;
    if (v.method === 'platformTools.get') return Object.freeze({ ...v }) as SetupRequest;
    if (v.method !== 'platformTools.setup.request' || !validSetupRevision(v.expectedRevision))
      return null;
    return Object.freeze({ ...v }) as SetupRequest;
  } catch {
    return null;
  }
}
export function parseSetupRequest(
  raw: unknown,
):
  | Readonly<{ ok: true; value: SetupRequest }>
  | Readonly<{ ok: false; code: SetupCode; requestId: string | null }> {
  const denied = (code: SetupCode, requestId: string | null = null) =>
    Object.freeze({ ok: false as const, code, requestId });
  if (typeof raw !== 'string') return denied('INVALID_TRANSPORT');
  if (raw.length > 512 || new TextEncoder().encode(raw).length > 512)
    return denied('PAYLOAD_TOO_LARGE');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return denied('INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return denied('INVALID_SHAPE');
  const value = parsed as Record<string, unknown>,
    requestId = validSetupId(value.requestId) ? value.requestId : null;
  // Canonical serialization also rejects decoded duplicate keys and alternate encodings.
  if (JSON.stringify(parsed) !== raw) return denied('INVALID_SHAPE', requestId);
  if (!Number.isSafeInteger(value.version)) return denied('INVALID_SHAPE', requestId);
  if (value.version !== 1) return denied('UNSUPPORTED_VERSION', requestId);
  if (!['platformTools.get', 'platformTools.setup.request'].includes(value.method as string))
    return denied('UNKNOWN_METHOD', requestId);
  const request = snapshotSetupRequest(parsed);
  return request && JSON.stringify(request) === raw
    ? Object.freeze({ ok: true, value: request })
    : denied('INVALID_SHAPE', requestId);
}
function response(input: unknown): SetupResponse | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const d = Object.getOwnPropertyDescriptor(input, 'ok');
    if (!d || !('value' in d)) return null;
    const v = record(
      input,
      d.value === true
        ? ['version', 'requestId', 'ok', 'outcome', 'snapshot', 'diagnosticId', 'loggingHealth']
        : ['version', 'requestId', 'ok', 'outcome', 'code', 'diagnosticId', 'loggingHealth'],
    );
    if (
      v.version !== 1 ||
      v.ok !== d.value ||
      !['AVAILABLE', 'DEGRADED'].includes(v.loggingHealth as string) ||
      (v.diagnosticId !== null && !validSetupUuid(v.diagnosticId)) ||
      (v.diagnosticId === null && v.loggingHealth !== 'DEGRADED')
    )
      return null;
    if (v.ok === true) {
      const snapshot = snapshotSetupSnapshot(v.snapshot);
      if (
        !snapshot ||
        !validSetupId(v.requestId) ||
        !['OBSERVED', 'PENDING'].includes(v.outcome as string) ||
        (v.outcome === 'PENDING' && snapshot.state !== 'AWAITING_RECIPIENT')
      )
        return null;
      return Object.freeze({ ...v, snapshot }) as SetupResponse;
    }
    if (
      v.ok !== false ||
      (v.requestId !== null && !validSetupId(v.requestId)) ||
      !SETUP_CODES.includes(v.code as SetupCode) ||
      !['NOT_STARTED', 'OUTCOME_UNKNOWN'].includes(v.outcome as string) ||
      (v.code === 'TIMEOUT' && v.outcome !== 'OUTCOME_UNKNOWN')
    )
      return null;
    return Object.freeze({ ...v }) as SetupResponse;
  } catch {
    return null;
  }
}
export function parseSetupResponse(raw: unknown): SetupResponse | null {
  if (typeof raw !== 'string' || raw.length > 8192 || new TextEncoder().encode(raw).length > 8192)
    return null;
  try {
    const value = response(JSON.parse(raw));
    return value && JSON.stringify(value) === raw ? value : null;
  } catch {
    return null;
  }
}
export function setupSuccess(
  requestId: string,
  outcome: 'OBSERVED' | 'PENDING',
  snapshot: SetupSnapshot,
  diagnosticId: string | null,
  loggingHealth: SetupHealth,
): string | null {
  const value = response({
    version: 1,
    requestId,
    ok: true,
    outcome,
    snapshot,
    diagnosticId,
    loggingHealth,
  });
  return value ? JSON.stringify(value) : null;
}
export function setupError(
  requestId: string | null,
  code: SetupCode,
  diagnosticId: string | null,
  loggingHealth: SetupHealth,
  outcome: 'NOT_STARTED' | 'OUTCOME_UNKNOWN' = 'NOT_STARTED',
): string {
  const value = response({
    version: 1,
    requestId,
    ok: false,
    outcome,
    code,
    diagnosticId,
    loggingHealth,
  });
  return JSON.stringify(
    value ?? {
      version: 1,
      requestId: validSetupId(requestId) ? requestId : null,
      ok: false,
      outcome: 'NOT_STARTED',
      code: 'INTERNAL_FAILURE',
      diagnosticId: null,
      loggingHealth: 'DEGRADED',
    },
  );
}
