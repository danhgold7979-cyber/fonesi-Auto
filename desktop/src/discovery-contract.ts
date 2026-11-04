export const DISCOVERY_CODES = Object.freeze([
  'INVALID_TRANSPORT',
  'PAYLOAD_TOO_LARGE',
  'INVALID_JSON',
  'INVALID_SHAPE',
  'UNSUPPORTED_VERSION',
  'UNKNOWN_METHOD',
  'UNTRUSTED_SENDER',
  'SESSION_UNAVAILABLE',
  'SESSION_REVOKED',
  'OWNER_REVOKED',
  'BUSY',
  'STALE_REVISION',
  'STALE_INSTALLATION',
  'NOT_PROVISIONED',
  'POLICY_DENIED',
  'RETAINED_HOST_DISABLED',
  'UNSUPPORTED_PATH',
  'AUDIT_UNAVAILABLE',
  'RESTART_REQUIRED',
  'DISCOVERY_FAILED',
  'DEADLINE',
  'REVISION_EXHAUSTED',
  'LIMIT_EXCEEDED',
  'RECOVERY_REQUIRED',
  'INTERNAL_FAILURE',
  'TIMEOUT',
  'TRANSPORT_FAILED',
  'OUTCOME_UNKNOWN',
  'CLOSED',
] as const);
export type DiscoveryCode = (typeof DISCOVERY_CODES)[number];
export type DiscoveryHealth = 'AVAILABLE' | 'DEGRADED';
export type DiscoverySnapshot = Readonly<{
  revision: number;
  installationRevision: number | null;
  state:
    | 'UNAVAILABLE'
    | 'IDLE'
    | 'STARTING'
    | 'READY'
    | 'REFRESHING'
    | 'STOPPING'
    | 'STOPPED'
    | 'FAILED'
    | 'OUTCOME_UNKNOWN';
  operationId: string | null;
  operation: null | 'START' | 'REFRESH' | 'STOP';
  lastOutcome:
    | 'NONE'
    | 'PENDING'
    | 'STARTED'
    | 'COMMITTED'
    | 'NOT_COMMITTED'
    | 'FAILED'
    | 'CLEANUP_RETIRED'
    | 'UNRETIRED';
  code: DiscoveryCode | null;
  registryRevision: number | null;
  observedAtUtc: number | null;
  restartRequired: boolean;
}>;
export type DiscoveryRequest =
  | Readonly<{ version: 1; requestId: string; method: 'discovery.get' | 'discovery.stop' }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'discovery.start';
      expectedRevision: number;
      expectedInstallationRevision: number;
    }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'discovery.refresh';
      expectedRevision: number;
    }>;
export type DiscoveryResponse =
  | Readonly<{
      version: 1;
      requestId: string;
      ok: true;
      outcome: 'OBSERVED' | 'PENDING';
      snapshot: DiscoverySnapshot;
      diagnosticId: string | null;
      loggingHealth: DiscoveryHealth;
    }>
  | Readonly<{
      version: 1;
      requestId: string | null;
      ok: false;
      outcome: 'NOT_STARTED' | 'OUTCOME_UNKNOWN';
      code: DiscoveryCode;
      diagnosticId: string | null;
      loggingHealth: DiscoveryHealth;
    }>;
export const validDiscoveryRelease = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length >= 1 &&
  v.length <= 32 &&
  !/[^0-9.]/.test(v) &&
  /^[0-9]+\.[0-9]+\.[0-9]+$/.test(v);
export const validDiscoveryRevision = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
export const validDiscoveryId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^p[1-9][0-9]{0,15}$/.test(v) &&
  Number.isSafeInteger(Number(v.slice(1))) &&
  String(Number(v.slice(1))) === v.slice(1);
export const validDiscoveryUuid = (v: unknown): v is string =>
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
export const DISCOVERY_FAILURE_CODES = Object.freeze([
  'STALE_REVISION',
  'SESSION_REVOKED',
  'OWNER_REVOKED',
  'AUDIT_UNAVAILABLE',
  'DISCOVERY_FAILED',
  'DEADLINE',
  'REVISION_EXHAUSTED',
  'LIMIT_EXCEEDED',
  'RECOVERY_REQUIRED',
  'INTERNAL_FAILURE',
  'CLOSED',
] as const);
export function snapshotDiscoverySnapshot(input: unknown): DiscoverySnapshot | null {
  try {
    const v = record(input, [
      'revision',
      'installationRevision',
      'state',
      'operationId',
      'operation',
      'lastOutcome',
      'code',
      'registryRevision',
      'observedAtUtc',
      'restartRequired',
    ]);
    const rev = validDiscoveryRevision;
    if (
      !rev(v.revision) ||
      (v.installationRevision !== null &&
        (!rev(v.installationRevision) || v.installationRevision === 0)) ||
      (v.registryRevision !== null && !rev(v.registryRevision)) ||
      (v.observedAtUtc !== null && !rev(v.observedAtUtc)) ||
      typeof v.restartRequired !== 'boolean' ||
      (v.operationId !== null && !validDiscoveryUuid(v.operationId)) ||
      (v.code !== null && !DISCOVERY_CODES.some((x) => x === v.code))
    )
      return null;
    const installed = v.installationRevision !== null,
      op = v.operationId !== null;
    const failure = DISCOVERY_FAILURE_CODES.some((x) => x === v.code);
    let valid = false;
    if (v.state === 'IDLE')
      valid =
        installed &&
        v.operation === null &&
        !op &&
        v.lastOutcome === 'NONE' &&
        v.code === null &&
        !v.restartRequired;
    if (v.state === 'UNAVAILABLE')
      valid =
        v.operation === null &&
        !op &&
        v.lastOutcome === 'NONE' &&
        !v.restartRequired &&
        [
          'NOT_PROVISIONED',
          'POLICY_DENIED',
          'RETAINED_HOST_DISABLED',
          'UNSUPPORTED_PATH',
          'OWNER_REVOKED',
          'RECOVERY_REQUIRED',
          'CLOSED',
        ].includes(v.code as string);
    if (['STARTING', 'REFRESHING', 'STOPPING'].includes(v.state as string))
      valid =
        op &&
        v.operation ===
          (
            { STARTING: 'START', REFRESHING: 'REFRESH', STOPPING: 'STOP' } as Record<string, string>
          )[v.state as string] &&
        v.lastOutcome === 'PENDING' &&
        v.code === null &&
        (v.state === 'STOPPING' || (installed && !v.restartRequired));
    if (v.state === 'READY')
      valid =
        installed &&
        op &&
        !v.restartRequired &&
        ((v.operation === 'START' && v.lastOutcome === 'STARTED' && v.code === null) ||
          (v.operation === 'REFRESH' &&
            ((v.lastOutcome === 'COMMITTED' &&
              v.code === null &&
              v.observedAtUtc !== null &&
              v.registryRevision !== null) ||
              (v.lastOutcome === 'NOT_COMMITTED' && failure))));
    if (v.state === 'FAILED')
      valid =
        installed &&
        op &&
        v.restartRequired &&
        ((v.operation === 'START' && v.lastOutcome === 'FAILED' && failure) ||
          (v.operation === 'REFRESH' &&
            ((v.lastOutcome === 'NOT_COMMITTED' && failure) ||
              (v.lastOutcome === 'COMMITTED' &&
                ['SESSION_REVOKED', 'OWNER_REVOKED', 'CLOSED'].includes(v.code as string)))));
    if (v.state === 'STOPPED')
      valid =
        v.operation === 'STOP' && op && v.lastOutcome === 'CLEANUP_RETIRED' && v.code === null;
    if (v.state === 'OUTCOME_UNKNOWN')
      valid =
        v.lastOutcome === 'UNRETIRED' &&
        ((op &&
          ['START', 'REFRESH', 'STOP'].includes(v.operation as string) &&
          v.restartRequired &&
          ['OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED'].includes(v.code as string)) ||
          (!op &&
            v.operation === null &&
            ['INTERNAL_FAILURE', 'REVISION_EXHAUSTED', 'LIMIT_EXCEEDED'].includes(
              v.code as string,
            )));
    if (
      !valid ||
      (v.observedAtUtc !== null &&
        !(v.state === 'READY' && v.operation === 'REFRESH' && v.lastOutcome === 'COMMITTED'))
    )
      return null;
    return Object.freeze({ ...v }) as DiscoverySnapshot;
  } catch {
    return null;
  }
}
export function snapshotDiscoveryRequest(input: unknown): DiscoveryRequest | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const d = Object.getOwnPropertyDescriptor(input, 'method');
    if (!d || !('value' in d)) return null;
    const keys = ['version', 'requestId', 'method'];
    if (d.value === 'discovery.start')
      keys.push('expectedRevision', 'expectedInstallationRevision');
    else if (d.value === 'discovery.refresh') keys.push('expectedRevision');
    const v = record(input, keys);
    if (
      v.version !== 1 ||
      !validDiscoveryId(v.requestId) ||
      !['discovery.get', 'discovery.start', 'discovery.refresh', 'discovery.stop'].includes(
        v.method as string,
      )
    )
      return null;
    if (
      (v.method === 'discovery.start' || v.method === 'discovery.refresh') &&
      !validDiscoveryRevision(v.expectedRevision)
    )
      return null;
    if (
      v.method === 'discovery.start' &&
      (!validDiscoveryRevision(v.expectedInstallationRevision) ||
        v.expectedInstallationRevision === 0)
    )
      return null;
    return Object.freeze({ ...v }) as DiscoveryRequest;
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
export function parseDiscoveryRequest(
  raw: unknown,
):
  | Readonly<{ ok: true; value: DiscoveryRequest }>
  | Readonly<{ ok: false; code: DiscoveryCode; requestId: string | null }> {
  const denied = (code: DiscoveryCode, requestId: string | null = null) =>
    Object.freeze({ ok: false as const, code, requestId });
  if (typeof raw !== 'string') return denied('INVALID_TRANSPORT');
  if (raw.length > 16384 || new TextEncoder().encode(raw).length > 16384)
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
    requestId = validDiscoveryId(value.requestId) ? value.requestId : null;
  if (!Number.isSafeInteger(value.version) || Object.is(value.version, -0))
    return denied('INVALID_SHAPE', requestId);
  if (value.version !== 1) return denied('UNSUPPORTED_VERSION', requestId);
  if (
    !['discovery.get', 'discovery.start', 'discovery.refresh', 'discovery.stop'].includes(
      value.method as string,
    )
  )
    return denied('UNKNOWN_METHOD', requestId);
  const request = snapshotDiscoveryRequest(parsed);
  return request ? Object.freeze({ ok: true, value: request }) : denied('INVALID_SHAPE', requestId);
}
function response(input: unknown): DiscoveryResponse | null {
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
      (v.diagnosticId !== null && !validDiscoveryUuid(v.diagnosticId)) ||
      (v.diagnosticId === null && v.loggingHealth !== 'DEGRADED')
    )
      return null;
    if (v.ok === true) {
      const snapshot = snapshotDiscoverySnapshot(v.snapshot);
      if (
        !snapshot ||
        !validDiscoveryId(v.requestId) ||
        !['OBSERVED', 'PENDING'].includes(v.outcome as string) ||
        (v.outcome === 'PENDING' &&
          !['STARTING', 'REFRESHING', 'STOPPING', 'STOPPED'].includes(snapshot.state))
      )
        return null;
      return Object.freeze({ ...v, snapshot }) as DiscoveryResponse;
    }
    if (
      v.ok !== false ||
      (v.requestId !== null && !validDiscoveryId(v.requestId)) ||
      !DISCOVERY_CODES.includes(v.code as DiscoveryCode) ||
      !['NOT_STARTED', 'OUTCOME_UNKNOWN'].includes(v.outcome as string) ||
      (v.code === 'TIMEOUT' && v.outcome !== 'OUTCOME_UNKNOWN')
    )
      return null;
    return Object.freeze({ ...v }) as DiscoveryResponse;
  } catch {
    return null;
  }
}
export function parseDiscoveryResponse(raw: unknown): DiscoveryResponse | null {
  if (typeof raw !== 'string' || raw.length > 16384 || new TextEncoder().encode(raw).length > 16384)
    return null;
  try {
    const value = response(JSON.parse(raw));
    return value && JSON.stringify(value) === raw ? value : null;
  } catch {
    return null;
  }
}
export function discoverySuccess(
  requestId: string,
  outcome: 'OBSERVED' | 'PENDING',
  snapshot: DiscoverySnapshot,
  diagnosticId: string | null,
  loggingHealth: DiscoveryHealth,
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
export function discoveryError(
  requestId: string | null,
  code: DiscoveryCode,
  diagnosticId: string | null,
  loggingHealth: DiscoveryHealth,
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
      requestId: validDiscoveryId(requestId) ? requestId : null,
      ok: false,
      outcome: 'NOT_STARTED',
      code: 'INTERNAL_FAILURE',
      diagnosticId: null,
      loggingHealth: 'DEGRADED',
    },
  );
}
