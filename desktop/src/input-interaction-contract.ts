// Closed public cache/input boundary; never imports native acquisition authority.
export const INPUT_ACTIONS = Object.freeze([
  'HOME',
  'BACK',
  'ENTER',
  'ESCAPE',
  'DPAD_UP',
  'DPAD_DOWN',
  'DPAD_LEFT',
  'DPAD_RIGHT',
  'DPAD_CENTER',
] as const);
export type InputInteractionAction = (typeof INPUT_ACTIONS)[number];
export const INPUT_INTERACTION_CODES = Object.freeze([
  'AUDIT_UNAVAILABLE',
  'INVALID_REQUEST',
  'OWNER_REVOKED',
  'BUSY',
  'STALE_BINDING',
  'STALE_DISPLAY',
  'UNICODE_UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'CANCELLED',
  'BINARY_UNAVAILABLE',
  'TRANSPORT_FAILED',
  'OBSERVATION_REJECTED',
  'OUTCOME_UNKNOWN',
  'CLOSED',
  'INVALID_TRANSPORT',
  'PAYLOAD_TOO_LARGE',
  'INVALID_JSON',
  'INVALID_SHAPE',
  'UNSUPPORTED_VERSION',
  'UNKNOWN_METHOD',
  'UNTRUSTED_SENDER',
  'SESSION_UNAVAILABLE',
  'SESSION_REVOKED',
  'STALE_REVISION',
  'STALE_SELECTION',
  'STALE_REGISTRY',
  'NO_ACTIVE_TARGET',
  'MEMBER_UNAVAILABLE',
  'REFRESH_REQUIRED',
  'LIMIT_EXCEEDED',
  'INTERNAL_FAILURE',
  'TIMEOUT',
] as const);
export type InputInteractionCode = (typeof INPUT_INTERACTION_CODES)[number];
export type InputInteractionHealth = 'AVAILABLE' | 'DEGRADED';
export type InputInteractionReceipt = Readonly<{
  version: 1;
  evidence: 'NATIVE_INPUT_QUERY';
  actor: Readonly<{
    outcome: 'NOT_DISPATCHED' | 'DISPATCHED_UNCONFIRMED' | 'OUTCOME_UNKNOWN';
    code: 'OK' | InputInteractionCode;
    commandId: string | null;
    correlationId: string | null;
    diagnosticId: null;
  }>;
  loggingHealth: InputInteractionHealth;
}>;
export type InputInteractionSnapshot = Readonly<{
  revision: number;
  state: 'EMPTY' | 'PENDING' | 'SETTLED' | 'FAILED' | 'OUTCOME_UNKNOWN' | 'STALE' | 'CLOSED';
  operationId: string | null;
  deviceId: string | null;
  generation: number | null;
  selectionRevision: number | null;
  registryRevision: number | null;
  action: InputInteractionAction | null;
  deadlineUtc: number | null;
  receipt: InputInteractionReceipt | null;
  code: 'OK' | InputInteractionCode | null;
  current: boolean;
}>;
export type InputInteractionRequest =
  | Readonly<{ version: 1; requestId: string; method: 'input.get' }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'input.press';
      expectedRevision: number;
      expectedSelectionRevision: number;
      expectedRegistryRevision: number;
      deviceId: string;
      action: InputInteractionAction;
    }>;
export type InputInteractionResponse =
  | Readonly<{
      version: 1;
      ok: true;
      requestId: string;
      outcome: 'STATUS' | 'PENDING';
      snapshot: InputInteractionSnapshot;
      loggingHealth: InputInteractionHealth;
    }>
  | Readonly<{
      version: 1;
      ok: false;
      requestId: string | null;
      code: InputInteractionCode;
      loggingHealth: InputInteractionHealth;
    }>;
export const validInputInteractionRevision = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
export const validInputInteractionUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length <= 17 &&
  /^p[1-9][0-9]{0,15}$/.test(v) &&
  Number.isSafeInteger(Number(v.slice(1))) &&
  String(Number(v.slice(1))) === v.slice(1);
const health = (v: unknown): v is InputInteractionHealth => v === 'AVAILABLE' || v === 'DEGRADED';
const code = (v: unknown): v is InputInteractionCode =>
  typeof v === 'string' && INPUT_INTERACTION_CODES.some((c) => c === v);
export const validInputInteractionAction = (v: unknown): v is InputInteractionAction =>
  typeof v === 'string' && INPUT_ACTIONS.some((a) => a === v);
const notDispatchedCodes = Object.freeze([
  'BUSY',
  'CLOSED',
  'OWNER_REVOKED',
  'STALE_BINDING',
  'DEADLINE_EXCEEDED',
  'CANCELLED',
  'BINARY_UNAVAILABLE',
  'AUDIT_UNAVAILABLE',
  'INVALID_REQUEST',
]);
const dispatchedCodes = Object.freeze([
  'OK',
  'TRANSPORT_FAILED',
  'OWNER_REVOKED',
  'STALE_BINDING',
  'DEADLINE_EXCEEDED',
  'CLOSED',
]);
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

export function snapshotInputInteractionReceipt(input: unknown): InputInteractionReceipt | null {
  try {
    const v = record(input, ['version', 'evidence', 'actor', 'loggingHealth']),
      a = record(v.actor, ['outcome', 'code', 'commandId', 'correlationId', 'diagnosticId']);
    if (
      v.version !== 1 ||
      v.evidence !== 'NATIVE_INPUT_QUERY' ||
      !health(v.loggingHealth) ||
      a.diagnosticId !== null ||
      !['NOT_DISPATCHED', 'DISPATCHED_UNCONFIRMED', 'OUTCOME_UNKNOWN'].includes(a.outcome as string)
    )
      return null;
    if (
      a.commandId === null
        ? a.correlationId !== null || a.outcome === 'DISPATCHED_UNCONFIRMED'
        : !validInputInteractionUuid(a.commandId) ||
          !validInputInteractionUuid(a.correlationId) ||
          a.commandId === a.correlationId
    )
      return null;
    if (
      !(
        (a.outcome === 'NOT_DISPATCHED' && notDispatchedCodes.includes(a.code as string)) ||
        (a.outcome === 'DISPATCHED_UNCONFIRMED' && dispatchedCodes.includes(a.code as string)) ||
        (a.outcome === 'OUTCOME_UNKNOWN' && a.code === 'OUTCOME_UNKNOWN')
      )
    )
      return null;
    return Object.freeze({ ...v, actor: Object.freeze({ ...a }) }) as InputInteractionReceipt;
  } catch {
    return null;
  }
}
export function snapshotInputInteractionSnapshot(input: unknown): InputInteractionSnapshot | null {
  try {
    const v = record(input, [
      'revision',
      'state',
      'operationId',
      'deviceId',
      'generation',
      'selectionRevision',
      'registryRevision',
      'action',
      'deadlineUtc',
      'receipt',
      'code',
      'current',
    ]);
    if (
      !validInputInteractionRevision(v.revision) ||
      !['EMPTY', 'PENDING', 'SETTLED', 'FAILED', 'OUTCOME_UNKNOWN', 'STALE', 'CLOSED'].includes(
        v.state as string,
      ) ||
      typeof v.current !== 'boolean' ||
      (v.code !== null && v.code !== 'OK' && !code(v.code))
    )
      return null;
    const empty = v.operationId === null;
    if (empty) {
      if (
        v.revision !== 0 ||
        !['EMPTY', 'CLOSED'].includes(v.state as string) ||
        v.deviceId !== null ||
        v.generation !== null ||
        v.selectionRevision !== null ||
        v.registryRevision !== null ||
        v.action !== null ||
        v.deadlineUtc !== null ||
        v.receipt !== null ||
        v.code !== null ||
        v.current
      )
        return null;
      return Object.freeze({ ...v }) as InputInteractionSnapshot;
    }
    if (
      !validInputInteractionUuid(v.operationId) ||
      !validInputInteractionUuid(v.deviceId) ||
      v.revision < 1 ||
      !validInputInteractionRevision(v.generation) ||
      v.generation < 1 ||
      !validInputInteractionRevision(v.selectionRevision) ||
      !validInputInteractionRevision(v.registryRevision) ||
      !validInputInteractionAction(v.action) ||
      !validInputInteractionRevision(v.deadlineUtc) ||
      v.deadlineUtc < 1 ||
      v.state === 'EMPTY'
    )
      return null;
    const receipt = v.receipt === null ? null : snapshotInputInteractionReceipt(v.receipt);
    if (v.receipt !== null && !receipt) return null;
    if (receipt && receipt.actor.code !== v.code) return null;
    if (v.state === 'PENDING' && (receipt !== null || v.code !== null || v.current)) return null;
    if (v.state === 'SETTLED' && (!receipt || receipt.actor.outcome === 'OUTCOME_UNKNOWN'))
      return null;
    if (v.state === 'FAILED' && (receipt !== null || !code(v.code) || v.current)) return null;
    if (
      v.state === 'OUTCOME_UNKNOWN' &&
      (receipt?.actor.outcome !== 'OUTCOME_UNKNOWN' || v.code !== 'OUTCOME_UNKNOWN' || v.current)
    )
      return null;
    if (['STALE', 'CLOSED'].includes(v.state as string) && v.current) return null;
    if (v.current && v.state !== 'SETTLED') return null;
    return Object.freeze({ ...v, receipt }) as InputInteractionSnapshot;
  } catch {
    return null;
  }
}
export function snapshotInputInteractionRequest(input: unknown): InputInteractionRequest | null {
  try {
    const d = Object.getOwnPropertyDescriptor(input, 'method');
    if (!d || !('value' in d)) return null;
    const v = record(
      input,
      d.value === 'input.press'
        ? [
            'version',
            'requestId',
            'method',
            'expectedRevision',
            'expectedSelectionRevision',
            'expectedRegistryRevision',
            'deviceId',
            'action',
          ]
        : ['version', 'requestId', 'method'],
    );
    if (
      v.version !== 1 ||
      !id(v.requestId) ||
      !['input.get', 'input.press'].includes(v.method as string)
    )
      return null;
    if (
      v.method === 'input.press' &&
      (!validInputInteractionRevision(v.expectedRevision) ||
        !validInputInteractionRevision(v.expectedSelectionRevision) ||
        !validInputInteractionRevision(v.expectedRegistryRevision) ||
        !validInputInteractionUuid(v.deviceId) ||
        !validInputInteractionAction(v.action))
    )
      return null;
    return Object.freeze({ ...v }) as InputInteractionRequest;
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
      if (depth > 4) throw Error();
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

export function parseInputInteractionRequest(
  raw: unknown,
):
  | Readonly<{ ok: true; value: InputInteractionRequest }>
  | Readonly<{ ok: false; code: InputInteractionCode; requestId: string | null }> {
  const deny = (code: InputInteractionCode, requestId: string | null = null) =>
    Object.freeze({ ok: false as const, code, requestId });
  if (typeof raw !== 'string') return deny('INVALID_TRANSPORT');
  if (raw.length > 16384 || new TextEncoder().encode(raw).length > 16384)
    return deny('PAYLOAD_TOO_LARGE');
  let v: unknown;
  try {
    v = json(raw);
  } catch {
    return deny('INVALID_JSON');
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return deny('INVALID_SHAPE');
  const r = v as Record<string, unknown>,
    requestId = id(r.requestId) ? r.requestId : null;
  if (!Number.isSafeInteger(r.version) || Object.is(r.version, -0))
    return deny('INVALID_SHAPE', requestId);
  if (r.version !== 1) return deny('UNSUPPORTED_VERSION', requestId);
  if (!['input.get', 'input.press'].includes(r.method as string))
    return deny('UNKNOWN_METHOD', requestId);
  const value = snapshotInputInteractionRequest(v);
  return value ? Object.freeze({ ok: true, value }) : deny('INVALID_SHAPE', requestId);
}
function response(input: unknown): InputInteractionResponse | null {
  try {
    const d = Object.getOwnPropertyDescriptor(input, 'ok');
    if (!d || !('value' in d)) return null;
    const v = record(
      input,
      d.value === true
        ? ['version', 'ok', 'requestId', 'outcome', 'snapshot', 'loggingHealth']
        : ['version', 'ok', 'requestId', 'code', 'loggingHealth'],
    );
    if (v.version !== 1 || !health(v.loggingHealth)) return null;
    if (v.ok === true) {
      const snapshot = snapshotInputInteractionSnapshot(v.snapshot);
      if (
        !id(v.requestId) ||
        !snapshot ||
        !['STATUS', 'PENDING'].includes(v.outcome as string) ||
        (v.outcome === 'PENDING' &&
          (snapshot.state !== 'PENDING' || v.loggingHealth !== 'DEGRADED'))
      )
        return null;
      return Object.freeze({ ...v, snapshot }) as InputInteractionResponse;
    }
    if (v.ok !== false || (v.requestId !== null && !id(v.requestId)) || !code(v.code)) return null;
    return Object.freeze({ ...v }) as InputInteractionResponse;
  } catch {
    return null;
  }
}
export function parseInputInteractionResponse(raw: unknown): InputInteractionResponse | null {
  if (typeof raw !== 'string' || raw.length > 16384 || new TextEncoder().encode(raw).length > 16384)
    return null;
  try {
    const v = response(json(raw));
    return v && JSON.stringify(v) === raw ? v : null;
  } catch {
    return null;
  }
}
export function inputInteractionSuccess(
  requestId: string,
  outcome: 'STATUS' | 'PENDING',
  snapshot: InputInteractionSnapshot,
  loggingHealth: InputInteractionHealth,
): string | null {
  const v = response({ version: 1, ok: true, requestId, outcome, snapshot, loggingHealth });
  if (!v) return null;
  const raw = JSON.stringify(v);
  return raw.length <= 16384 && new TextEncoder().encode(raw).length <= 16384 ? raw : null;
}
export function inputInteractionError(
  requestId: string | null,
  code: InputInteractionCode,
  loggingHealth: InputInteractionHealth,
): string {
  const v = response({ version: 1, ok: false, requestId, code, loggingHealth });
  if (!v) throw Error('INPUT_INTERACTION_RESPONSE');
  return JSON.stringify(v);
}
