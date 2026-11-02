// Closed presentation protocol; no native rows, operator assertions or authority tokens.
export const ASSOCIATION_CODES = Object.freeze([
  'OK',
  'INVALID_REQUEST',
  'BUSY',
  'CLOSED',
  'NOT_READY',
  'STALE_REVISION',
  'STALE_CANDIDATE',
  'POLICY_DENIED',
  'INVALID_SEQUENCE',
  'OTHER_ROWS_CHANGED',
  'TARGET_NOT_REMOVED',
  'RETURN_NOT_UNIQUE',
  'ATTESTATION_REQUIRED',
  'DEADLINE',
  'OWNER_REVOKED',
  'EPOCH_REVOKED',
  'INVALID_DISCOVERY',
  'DISCOVERY_LIMIT',
  'ID_EXHAUSTED',
  'LIMIT_EXCEEDED',
  'AUDIT_UNAVAILABLE',
  'STORAGE_FAILED',
  'RECOVERY_REQUIRED',
  'CANCELLED',
  'UNRETIRED',
  'OUTCOME_UNKNOWN',
  'INVALID_TRANSPORT',
  'PAYLOAD_TOO_LARGE',
  'INVALID_JSON',
  'INVALID_SHAPE',
  'UNSUPPORTED_VERSION',
  'UNKNOWN_METHOD',
  'UNTRUSTED_SENDER',
  'SESSION_UNAVAILABLE',
  'SESSION_REVOKED',
  'INTERNAL_FAILURE',
  'TIMEOUT',
] as const);
export const ASSOCIATION_STATES = Object.freeze([
  'IDLE',
  'BASELINE_PENDING',
  'AWAIT_REMOVAL',
  'REMOVAL_PENDING',
  'AWAIT_RETURN',
  'RETURN_PENDING',
  'AWAIT_CONFIRMATION',
  'CONFIRM_PENDING',
  'COMMITTED',
  'CANCELLED',
  'FAILED',
  'OUTCOME_UNKNOWN',
  'CLOSED',
] as const);
export type AssociationCode = (typeof ASSOCIATION_CODES)[number];
export type AssociationHealth = 'AVAILABLE' | 'DEGRADED';
export type AssociationMode = 'CURRENT' | 'HISTORICAL';
export type AssociationStage = 'BASELINE' | 'REMOVAL' | 'RETURN' | 'CONFIRMATION';
export type AssociationPhaseReceipt = Readonly<{
  version: 1;
  outcome: 'COMMITTED' | 'NOT_COMMITTED' | 'OUTCOME_UNKNOWN';
  code: AssociationCode;
  stage: AssociationStage;
  ceremonyId: string | null;
  revision: number | null;
  projectionCurrent: boolean;
  auditHealth: AssociationHealth;
}>;
export type AssociationSnapshot = Readonly<{
  revision: number;
  state: (typeof ASSOCIATION_STATES)[number];
  operationId: string | null;
  code: AssociationCode;
  ceremonyId: string | null;
  mode: AssociationMode | null;
  deviceId: string | null;
  stage: AssociationStage | null;
  deadlineUtc: number | null;
  receipt: AssociationPhaseReceipt | null;
  projectionCurrent: boolean;
  candidates: readonly Readonly<{
    candidateId: string;
    mode: AssociationMode;
    deviceId: string | null;
  }>[];
  historical: readonly Readonly<{ deviceId: string; generation: number }>[];
}>;
export type AssociationRequest =
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'association.get';
    }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'association.candidates';
    }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'association.begin';
      expectedRevision: number;
      candidateId: string;
      mode: 'CURRENT';
    }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'association.begin';
      expectedRevision: number;
      candidateId: string;
      mode: 'HISTORICAL';
      deviceId: string;
    }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'association.removal';
      expectedRevision: number;
      ceremonyId: string;
    }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'association.return';
      expectedRevision: number;
      ceremonyId: string;
    }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'association.confirm';
      expectedRevision: number;
      ceremonyId: string;
    }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'association.cancel';
      expectedRevision: number;
      operationId: string;
    }>;
export type AssociationResponse =
  | Readonly<{
      version: 1;
      ok: true;
      requestId: string;
      outcome: 'OBSERVED' | 'PENDING' | 'SETTLED' | 'UNCHANGED';
      snapshot: AssociationSnapshot;
      diagnosticId: string | null;
      loggingHealth: AssociationHealth;
    }>
  | Readonly<{
      version: 1;
      ok: false;
      requestId: string | null;
      code: AssociationCode;
      diagnosticId: string | null;
      loggingHealth: AssociationHealth;
    }>;
export const validAssociationRevision = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
export const validAssociationUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const validAssociationId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length <= 17 &&
  /^p[1-9][0-9]*$/.test(v) &&
  !/[\r\n]/.test(v) &&
  Number.isSafeInteger(Number(v.slice(1)));
const stage = (v: unknown): v is AssociationStage =>
  ['BASELINE', 'REMOVAL', 'RETURN', 'CONFIRMATION'].includes(v as string);
const health = (v: unknown): v is AssociationHealth => v === 'AVAILABLE' || v === 'DEGRADED';
const code = (v: unknown): v is AssociationCode => ASSOCIATION_CODES.some((c) => c === v);
const mode = (v: unknown): v is AssociationMode => v === 'CURRENT' || v === 'HISTORICAL';
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw Error();
  const ds = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(ds).length !== keys.length) throw Error();
  const v: Record<string, unknown> = {};
  for (const key of keys) {
    const d = ds[key];
    if (!d || !('value' in d) || !d.enumerable) throw Error();
    v[key] = d.value;
  }
  return v;
}
function array(input: unknown): readonly unknown[] {
  if (!Array.isArray(input)) throw Error();
  const len = Object.getOwnPropertyDescriptor(input, 'length');
  if (!len || !('value' in len) || !validAssociationRevision(len.value) || len.value > 256)
    throw Error();
  const ds = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(ds).length !== len.value + 1) throw Error();
  const out = [];
  for (let i = 0; i < len.value; i++) {
    const d = ds[String(i)];
    if (!d || !('value' in d) || !d.enumerable) throw Error();
    out.push(d.value);
  }
  return out;
}
export function snapshotAssociationPhaseReceipt(input: unknown): AssociationPhaseReceipt | null {
  try {
    const v = record(input, [
      'version',
      'outcome',
      'code',
      'stage',
      'ceremonyId',
      'revision',
      'projectionCurrent',
      'auditHealth',
    ]);
    if (
      v.version !== 1 ||
      !stage(v.stage) ||
      !code(v.code) ||
      ASSOCIATION_CODES.indexOf(v.code) > ASSOCIATION_CODES.indexOf('OUTCOME_UNKNOWN') ||
      !health(v.auditHealth) ||
      typeof v.projectionCurrent !== 'boolean' ||
      (v.ceremonyId !== null && !validAssociationUuid(v.ceremonyId))
    )
      return null;
    if (v.outcome === 'COMMITTED') {
      if (
        v.code !== 'OK' ||
        !validAssociationRevision(v.revision) ||
        v.revision < 1 ||
        v.ceremonyId === null
      )
        return null;
    } else if (v.outcome === 'NOT_COMMITTED') {
      if (
        v.code === 'OK' ||
        v.code === 'OUTCOME_UNKNOWN' ||
        v.revision !== null ||
        v.projectionCurrent !== false ||
        v.auditHealth !== 'DEGRADED'
      )
        return null;
    } else if (v.outcome === 'OUTCOME_UNKNOWN') {
      if (
        v.code !== 'OUTCOME_UNKNOWN' ||
        v.revision !== null ||
        v.projectionCurrent !== false ||
        v.auditHealth !== 'DEGRADED' ||
        v.ceremonyId === null
      )
        return null;
    } else return null;
    return Object.freeze(v) as AssociationPhaseReceipt;
  } catch {
    return null;
  }
}
export function snapshotAssociationSnapshot(input: unknown): AssociationSnapshot | null {
  try {
    const v = record(input, [
      'revision',
      'state',
      'operationId',
      'code',
      'ceremonyId',
      'mode',
      'deviceId',
      'stage',
      'deadlineUtc',
      'receipt',
      'projectionCurrent',
      'candidates',
      'historical',
    ]);
    if (
      !validAssociationRevision(v.revision) ||
      !ASSOCIATION_STATES.includes(v.state as AssociationSnapshot['state']) ||
      !code(v.code) ||
      typeof v.projectionCurrent !== 'boolean'
    )
      return null;
    for (const k of ['operationId', 'ceremonyId', 'deviceId'])
      if (v[k] !== null && !validAssociationUuid(v[k])) return null;
    if (v.operationId !== null && v.operationId === v.ceremonyId) return null;
    if ((v.mode !== null && !mode(v.mode)) || (v.stage !== null && !stage(v.stage))) return null;
    if (
      v.deadlineUtc !== null &&
      (!validAssociationRevision(v.deadlineUtc) || v.deadlineUtc > 8640000000000000)
    )
      return null;
    if ((v.ceremonyId === null) !== (v.deadlineUtc === null)) return null;
    const receipt = v.receipt === null ? null : snapshotAssociationPhaseReceipt(v.receipt);
    if (v.receipt !== null && !receipt) return null;
    if (receipt && receipt.ceremonyId !== v.ceremonyId) return null;
    const emptyContext =
      v.operationId === null &&
      v.ceremonyId === null &&
      v.mode === null &&
      v.deviceId === null &&
      v.stage === null &&
      v.deadlineUtc === null &&
      receipt === null;
    if (v.state === 'IDLE') {
      if (!emptyContext || v.code !== 'OK' || v.projectionCurrent) return null;
    } else if (v.state === 'CLOSED' && emptyContext) {
      if (v.code !== 'CLOSED' || v.projectionCurrent) return null;
    } else {
      if (
        v.operationId === null ||
        v.mode === null ||
        v.deviceId === null ||
        v.stage === null ||
        v.revision < 1
      )
        return null;
      const pendingStage: Record<string, string> = {
        BASELINE_PENDING: 'BASELINE',
        REMOVAL_PENDING: 'REMOVAL',
        RETURN_PENDING: 'RETURN',
        CONFIRM_PENDING: 'CONFIRMATION',
      };
      if (Object.hasOwn(pendingStage, v.state as string)) {
        if (v.stage !== pendingStage[v.state as string] || v.code !== 'OK' || v.projectionCurrent)
          return null;
        if (v.state !== 'BASELINE_PENDING' && v.ceremonyId === null) return null;
        if (v.state === 'BASELINE_PENDING' && (v.ceremonyId !== null || receipt !== null))
          return null;
      } else if (
        ['AWAIT_REMOVAL', 'AWAIT_RETURN', 'AWAIT_CONFIRMATION', 'COMMITTED'].includes(
          v.state as string,
        )
      ) {
        const expected = {
          AWAIT_REMOVAL: 'BASELINE',
          AWAIT_RETURN: 'REMOVAL',
          AWAIT_CONFIRMATION: 'RETURN',
          COMMITTED: 'CONFIRMATION',
        }[v.state as string];
        if (
          v.stage !== expected ||
          v.ceremonyId === null ||
          receipt?.outcome !== 'COMMITTED' ||
          receipt.stage !== expected ||
          v.code !== 'OK'
        )
          return null;
      } else if (v.state === 'OUTCOME_UNKNOWN') {
        if (
          receipt?.outcome !== 'OUTCOME_UNKNOWN' ||
          v.code !== 'OUTCOME_UNKNOWN' ||
          v.projectionCurrent
        )
          return null;
      } else if (v.state === 'CANCELLED') {
        if (v.code !== 'CANCELLED' || v.projectionCurrent) return null;
      } else if (v.state === 'CLOSED') {
        if (v.projectionCurrent) return null;
      } else if (v.state === 'FAILED') {
        if (
          v.code === 'OK' ||
          v.code === 'OUTCOME_UNKNOWN' ||
          receipt?.outcome === 'OUTCOME_UNKNOWN' ||
          v.projectionCurrent
        )
          return null;
      }
    }
    if (v.projectionCurrent && receipt?.outcome !== 'COMMITTED') return null;
    const candidates = array(v.candidates).map((x) => {
      const c = record(x, ['candidateId', 'mode', 'deviceId']);
      if (
        !validAssociationUuid(c.candidateId) ||
        !mode(c.mode) ||
        (c.mode === 'CURRENT' ? !validAssociationUuid(c.deviceId) : c.deviceId !== null)
      )
        throw Error();
      return Object.freeze(c);
    });
    const historical = array(v.historical).map((x) => {
      const h = record(x, ['deviceId', 'generation']);
      if (!validAssociationUuid(h.deviceId) || !validAssociationRevision(h.generation))
        throw Error();
      return Object.freeze(h);
    });
    if (
      new Set(candidates.map((c) => c.candidateId)).size !== candidates.length ||
      new Set(historical.map((h) => h.deviceId)).size !== historical.length
    )
      return null;
    return Object.freeze({
      ...v,
      receipt,
      candidates: Object.freeze(candidates),
      historical: Object.freeze(historical),
    }) as AssociationSnapshot;
  } catch {
    return null;
  }
}
const METHODS = [
  'association.get',
  'association.candidates',
  'association.begin',
  'association.removal',
  'association.return',
  'association.confirm',
  'association.cancel',
];
export function snapshotAssociationRequest(input: unknown): AssociationRequest | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const d = Object.getOwnPropertyDescriptor(input, 'method');
    if (!d || !('value' in d) || !METHODS.includes(d.value)) return null;
    const m = d.value;
    let extras: string[] = [];
    if (m === 'association.begin') {
      const md = Object.getOwnPropertyDescriptor(input, 'mode');
      if (!md || !('value' in md) || !mode(md.value)) return null;
      extras = [
        'expectedRevision',
        'candidateId',
        'mode',
        ...(md.value === 'HISTORICAL' ? ['deviceId'] : []),
      ];
    } else if (m === 'association.cancel') extras = ['expectedRevision', 'operationId'];
    else if (!['association.get', 'association.candidates'].includes(m))
      extras = ['expectedRevision', 'ceremonyId'];
    const v = record(input, ['version', 'requestId', 'method', ...extras]);
    if (v.version !== 1 || v.method !== m || !validAssociationId(v.requestId)) return null;
    if (extras.length && !validAssociationRevision(v.expectedRevision)) return null;
    for (const k of ['candidateId', 'deviceId', 'operationId', 'ceremonyId'])
      if (Object.hasOwn(v, k) && !validAssociationUuid(v[k])) return null;
    return Object.freeze(v) as AssociationRequest;
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
export function parseAssociationRequest(
  raw: unknown,
):
  | Readonly<{ ok: true; value: AssociationRequest }>
  | Readonly<{ ok: false; code: AssociationCode; requestId: string | null }> {
  const denied = (code: AssociationCode, requestId: string | null = null) =>
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
    requestId = validAssociationId(value.requestId) ? value.requestId : null;
  if (!Number.isSafeInteger(value.version) || Object.is(value.version, -0))
    return denied('INVALID_SHAPE', requestId);
  if (value.version !== 1) return denied('UNSUPPORTED_VERSION', requestId);
  if (!METHODS.includes(value.method as string)) return denied('UNKNOWN_METHOD', requestId);
  const request = snapshotAssociationRequest(parsed);
  return request ? Object.freeze({ ok: true, value: request }) : denied('INVALID_SHAPE', requestId);
}
function response(input: unknown): AssociationResponse | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const d = Object.getOwnPropertyDescriptor(input, 'ok');
    if (!d || !('value' in d)) return null;
    const v = record(
      input,
      d.value === true
        ? ['version', 'requestId', 'ok', 'outcome', 'snapshot', 'diagnosticId', 'loggingHealth']
        : ['version', 'requestId', 'ok', 'code', 'diagnosticId', 'loggingHealth'],
    );
    if (
      v.version !== 1 ||
      v.ok !== d.value ||
      !health(v.loggingHealth) ||
      (v.diagnosticId !== null && !validAssociationUuid(v.diagnosticId)) ||
      (v.diagnosticId === null && v.loggingHealth !== 'DEGRADED')
    )
      return null;
    if (v.ok === true) {
      const snapshot = snapshotAssociationSnapshot(v.snapshot);
      if (
        !snapshot ||
        !validAssociationId(v.requestId) ||
        !['OBSERVED', 'PENDING', 'SETTLED', 'UNCHANGED'].includes(v.outcome as string) ||
        (v.diagnosticId === snapshot.operationId && v.diagnosticId !== null) ||
        (v.diagnosticId === snapshot.ceremonyId && v.diagnosticId !== null)
      )
        return null;
      if (v.outcome === 'PENDING' && !snapshot.state.endsWith('_PENDING')) return null;
      return Object.freeze({ ...v, snapshot }) as AssociationResponse;
    }
    if (
      v.ok !== false ||
      (v.requestId !== null && !validAssociationId(v.requestId)) ||
      !code(v.code) ||
      v.code === 'OK'
    )
      return null;
    return Object.freeze(v) as AssociationResponse;
  } catch {
    return null;
  }
}
export function parseAssociationResponse(raw: unknown): AssociationResponse | null {
  if (typeof raw !== 'string' || raw.length > 16384 || new TextEncoder().encode(raw).length > 16384)
    return null;
  try {
    const v = response(JSON.parse(raw));
    return v && JSON.stringify(v) === raw ? v : null;
  } catch {
    return null;
  }
}
export function associationSuccess(
  requestId: string,
  outcome: 'OBSERVED' | 'PENDING' | 'SETTLED' | 'UNCHANGED',
  snapshot: AssociationSnapshot,
  diagnosticId: string | null,
  loggingHealth: AssociationHealth,
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
  if (!value) return null;
  const raw = JSON.stringify(value);
  return raw.length <= 16384 && new TextEncoder().encode(raw).length <= 16384 ? raw : null;
}
export function associationError(
  requestId: string | null,
  code: AssociationCode,
  diagnosticId: string | null,
  loggingHealth: AssociationHealth,
): string {
  return JSON.stringify(
    response({ version: 1, requestId, ok: false, code, diagnosticId, loggingHealth }) ?? {
      version: 1,
      requestId: validAssociationId(requestId) ? requestId : null,
      ok: false,
      code: 'INTERNAL_FAILURE',
      diagnosticId: null,
      loggingHealth: 'DEGRADED',
    },
  );
}
