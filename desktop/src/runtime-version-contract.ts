export const RUNTIME_VERSION_CODES = Object.freeze([
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
  'STALE_INSTALLATION',
  'NOT_PROVISIONED',
  'RETAINED_HOST_DISABLED',
  'UNSUPPORTED_PATH',
  'OWNER_REVOKED',
  'AUDIT_UNAVAILABLE',
  'INTERNAL_FAILURE',
  'TIMEOUT',
  'TRANSPORT_FAILED',
  'INVALID_OBSERVATION',
  'RECOVERY_REQUIRED',
  'OUTCOME_UNKNOWN',
  'CLOSED',
] as const);
export const RUNTIME_VERSION_FAILED_CODES = Object.freeze([
  'STALE_INSTALLATION',
  'SESSION_REVOKED',
  'OWNER_REVOKED',
  'AUDIT_UNAVAILABLE',
  'INTERNAL_FAILURE',
  'TIMEOUT',
  'TRANSPORT_FAILED',
  'INVALID_OBSERVATION',
  'RECOVERY_REQUIRED',
] as const);
export type RuntimeVersionCode = (typeof RUNTIME_VERSION_CODES)[number];
export type RuntimeVersionHealth = 'AVAILABLE' | 'DEGRADED';
export type RuntimeVersionSnapshot = Readonly<{
  revision: number;
  installationRevision: number | null;
  state: 'UNAVAILABLE' | 'IDLE' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'OUTCOME_UNKNOWN';
  operationId: string | null;
  code: RuntimeVersionCode | null;
  installTargetVersion: string;
  activeVersion: string | null;
  verifiedAtUtc: number | null;
}>;
export type RuntimeVersionRequest =
  | Readonly<{ version: 2; requestId: string; method: 'runtimeVersion.get' }>
  | Readonly<{
      version: 2;
      requestId: string;
      method: 'runtimeVersion.request';
      expectedRevision: number;
      expectedInstallationRevision: number;
    }>;
export type RuntimeVersionResponse =
  | Readonly<{
      version: 2;
      requestId: string;
      ok: true;
      outcome: 'OBSERVED' | 'PENDING';
      snapshot: RuntimeVersionSnapshot;
      diagnosticId: string | null;
      loggingHealth: RuntimeVersionHealth;
    }>
  | Readonly<{
      version: 2;
      requestId: string | null;
      ok: false;
      outcome: 'NOT_STARTED' | 'OUTCOME_UNKNOWN';
      code: RuntimeVersionCode;
      diagnosticId: string | null;
      loggingHealth: RuntimeVersionHealth;
    }>;
export const validRuntimeVersionRelease = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length >= 1 &&
  v.length <= 32 &&
  !/[^0-9.]/.test(v) &&
  /^[0-9]+\.[0-9]+\.[0-9]+$/.test(v);
export const validRuntimeVersionRevision = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
export const validRuntimeVersionId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^p[1-9][0-9]{0,15}$/.test(v) &&
  Number.isSafeInteger(Number(v.slice(1))) &&
  String(Number(v.slice(1))) === v.slice(1);
export const validRuntimeVersionUuid = (v: unknown): v is string =>
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
export function snapshotRuntimeVersionSnapshot(input: unknown): RuntimeVersionSnapshot | null {
  try {
    const v = record(input, [
      'revision',
      'installationRevision',
      'state',
      'operationId',
      'code',
      'installTargetVersion',
      'activeVersion',
      'verifiedAtUtc',
    ]);
    const positive = (n: unknown) => validRuntimeVersionRevision(n) && n > 0;
    if (
      !validRuntimeVersionRevision(v.revision) ||
      (v.installationRevision !== null && !positive(v.installationRevision)) ||
      (v.operationId !== null && !validRuntimeVersionUuid(v.operationId)) ||
      !validRuntimeVersionRelease(v.installTargetVersion) ||
      (v.activeVersion !== null && !validRuntimeVersionRelease(v.activeVersion)) ||
      (['IDLE', 'PENDING', 'VERIFIED', 'FAILED'].includes(v.state as string) &&
        v.activeVersion === null)
    )
      return null;
    if (v.state === 'VERIFIED') {
      if (
        !positive(v.installationRevision) ||
        v.operationId !== null ||
        v.code !== null ||
        !validRuntimeVersionRevision(v.verifiedAtUtc)
      )
        return null;
    } else {
      if (v.verifiedAtUtc !== null) return null;
      if (v.state === 'UNAVAILABLE') {
        if (
          v.operationId !== null ||
          ![
            'NOT_PROVISIONED',
            'RETAINED_HOST_DISABLED',
            'UNSUPPORTED_PATH',
            'RECOVERY_REQUIRED',
            'OWNER_REVOKED',
            'CLOSED',
          ].includes(v.code as string)
        )
          return null;
      } else if (v.state === 'IDLE' || v.state === 'PENDING') {
        if (
          !positive(v.installationRevision) ||
          v.code !== null ||
          (v.state === 'IDLE' ? v.operationId !== null : v.operationId === null)
        )
          return null;
      } else if (v.state === 'FAILED') {
        if (
          !positive(v.installationRevision) ||
          v.operationId !== null ||
          !RUNTIME_VERSION_FAILED_CODES.some((c) => c === v.code)
        )
          return null;
      } else if (v.state === 'OUTCOME_UNKNOWN') {
        if (
          !positive(v.installationRevision) ||
          v.operationId === null ||
          !['OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED'].includes(v.code as string)
        )
          return null;
      } else return null;
    }
    return Object.freeze({ ...v }) as RuntimeVersionSnapshot;
  } catch {
    return null;
  }
}
export function snapshotRuntimeVersionRequest(input: unknown): RuntimeVersionRequest | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const d = Object.getOwnPropertyDescriptor(input, 'method');
    if (!d || !('value' in d)) return null;
    const v = record(
      input,
      d.value === 'runtimeVersion.get'
        ? ['version', 'requestId', 'method']
        : ['version', 'requestId', 'method', 'expectedRevision', 'expectedInstallationRevision'],
    );
    if (v.version !== 2 || v.method !== d.value || !validRuntimeVersionId(v.requestId)) return null;
    if (v.method === 'runtimeVersion.get') return Object.freeze({ ...v }) as RuntimeVersionRequest;
    if (
      v.method !== 'runtimeVersion.request' ||
      !validRuntimeVersionRevision(v.expectedRevision) ||
      !validRuntimeVersionRevision(v.expectedInstallationRevision) ||
      v.expectedInstallationRevision === 0
    )
      return null;
    return Object.freeze({ ...v }) as RuntimeVersionRequest;
  } catch {
    return null;
  }
}
function json(raw: string): unknown {
  let at = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(raw[at] ?? '!')) at++;
  };
  const string = () => {
    const start = at++;
    while (at < raw.length) {
      const c = raw[at++];
      if (c === '"') return JSON.parse(raw.slice(start, at));
      if (c === '\\') at++;
    }
    throw Error();
  };
  const value = (depth: number): unknown => {
    ws();
    if (raw[at] === '"') return string();
    if (raw[at] === '{') {
      if (depth > 1) throw Error();
      at++;
      ws();
      const out: Record<string, unknown> = Object.create(null);
      if (raw[at] === '}') {
        at++;
        return out;
      }
      while (true) {
        ws();
        if (raw[at] !== '"') throw Error();
        const key = string();
        if (Object.hasOwn(out, key)) throw Error();
        ws();
        if (raw[at++] !== ':') throw Error();
        out[key] = value(depth + 1);
        ws();
        const c = raw[at++];
        if (c === '}') return out;
        if (c !== ',') throw Error();
      }
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      raw.slice(at),
    );
    if (!match) throw Error();
    at += match[0].length;
    return JSON.parse(match[0]);
  };
  const out = value(0);
  ws();
  if (at !== raw.length) throw Error();
  return out;
}
export function parseRuntimeVersionRequest(
  raw: unknown,
):
  | Readonly<{ ok: true; value: RuntimeVersionRequest }>
  | Readonly<{ ok: false; code: RuntimeVersionCode; requestId: string | null }> {
  const denied = (code: RuntimeVersionCode, requestId: string | null = null) =>
    Object.freeze({ ok: false as const, code, requestId });
  if (typeof raw !== 'string') return denied('INVALID_TRANSPORT');
  if (raw.length > 8192 || new TextEncoder().encode(raw).length > 8192)
    return denied('PAYLOAD_TOO_LARGE');
  let parsed: unknown;
  try {
    parsed = json(raw);
  } catch {
    return denied('INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return denied('INVALID_SHAPE');
  const value = parsed as Record<string, unknown>,
    requestId = validRuntimeVersionId(value.requestId) ? value.requestId : null;
  if (!Number.isSafeInteger(value.version) || Object.is(value.version, -0))
    return denied('INVALID_SHAPE', requestId);
  if (value.version !== 2) return denied('UNSUPPORTED_VERSION', requestId);
  if (!['runtimeVersion.get', 'runtimeVersion.request'].includes(value.method as string))
    return denied('UNKNOWN_METHOD', requestId);
  const request = snapshotRuntimeVersionRequest(parsed);
  return request ? Object.freeze({ ok: true, value: request }) : denied('INVALID_SHAPE', requestId);
}
function response(input: unknown): RuntimeVersionResponse | null {
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
      v.version !== 2 ||
      v.ok !== d.value ||
      !['AVAILABLE', 'DEGRADED'].includes(v.loggingHealth as string) ||
      (v.diagnosticId !== null && !validRuntimeVersionUuid(v.diagnosticId)) ||
      (v.diagnosticId === null && v.loggingHealth !== 'DEGRADED')
    )
      return null;
    if (v.ok === true) {
      const snapshot = snapshotRuntimeVersionSnapshot(v.snapshot);
      if (
        !snapshot ||
        !validRuntimeVersionId(v.requestId) ||
        !['OBSERVED', 'PENDING'].includes(v.outcome as string) ||
        (v.outcome === 'PENDING' && snapshot.state !== 'PENDING')
      )
        return null;
      return Object.freeze({ ...v, snapshot }) as RuntimeVersionResponse;
    }
    if (
      v.ok !== false ||
      (v.requestId !== null && !validRuntimeVersionId(v.requestId)) ||
      !RUNTIME_VERSION_CODES.includes(v.code as RuntimeVersionCode) ||
      !['NOT_STARTED', 'OUTCOME_UNKNOWN'].includes(v.outcome as string) ||
      (v.code === 'TIMEOUT' && v.outcome !== 'OUTCOME_UNKNOWN')
    )
      return null;
    return Object.freeze({ ...v }) as RuntimeVersionResponse;
  } catch {
    return null;
  }
}
export function parseRuntimeVersionResponse(raw: unknown): RuntimeVersionResponse | null {
  if (typeof raw !== 'string' || raw.length > 16384 || new TextEncoder().encode(raw).length > 16384)
    return null;
  try {
    const value = response(JSON.parse(raw));
    return value && JSON.stringify(value) === raw ? value : null;
  } catch {
    return null;
  }
}
export function runtimeVersionSuccess(
  requestId: string,
  outcome: 'OBSERVED' | 'PENDING',
  snapshot: RuntimeVersionSnapshot,
  diagnosticId: string | null,
  loggingHealth: RuntimeVersionHealth,
): string | null {
  const value = response({
    version: 2,
    requestId,
    ok: true,
    outcome,
    snapshot,
    diagnosticId,
    loggingHealth,
  });
  return value ? JSON.stringify(value) : null;
}
export function runtimeVersionError(
  requestId: string | null,
  code: RuntimeVersionCode,
  diagnosticId: string | null,
  loggingHealth: RuntimeVersionHealth,
  outcome: 'NOT_STARTED' | 'OUTCOME_UNKNOWN' = 'NOT_STARTED',
): string {
  const value = response({
    version: 2,
    requestId,
    ok: false,
    outcome,
    code,
    diagnosticId,
    loggingHealth,
  });
  return JSON.stringify(
    value ?? {
      version: 2,
      requestId: validRuntimeVersionId(requestId) ? requestId : null,
      ok: false,
      outcome: 'NOT_STARTED',
      code: 'INTERNAL_FAILURE',
      diagnosticId: null,
      loggingHealth: 'DEGRADED',
    },
  );
}
