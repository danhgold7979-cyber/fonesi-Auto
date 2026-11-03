// Closed renderer projection only. Source/evidence labels never mint native authority.
export const METADATA_FIELDS = Object.freeze([
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
export type MetadataField = (typeof METADATA_FIELDS)[number];
export const METADATA_CODES = Object.freeze([
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
  'STALE_BINDING',
  'REFRESH_REQUIRED',
  'NOT_READY',
  'POLICY_DENIED',
  'AUDIT_UNAVAILABLE',
  'REVISION_EXHAUSTED',
  'LIMIT_EXCEEDED',
  'DEADLINE_EXCEEDED',
  'CANCELLED',
  'BINARY_UNAVAILABLE',
  'TRANSPORT_FAILED',
  'OBSERVATION_REJECTED',
  'OUTCOME_UNKNOWN',
  'CLOSED',
  'TIMEOUT',
  'INTERNAL_FAILURE',
] as const);
export type MetadataCode = (typeof METADATA_CODES)[number];
export type MetadataHealth = 'AVAILABLE' | 'DEGRADED';
export type MetadataResult = Readonly<
  { field: MetadataField; observedUtc: number; source: 'ADB_TEXT'; stale: boolean } & (
    | {
        available: true;
        value:
          | string
          | number
          | Readonly<{ width: number; height: number }>
          | Readonly<{ total: number; used: number; available: number }>;
        units: 'TEXT' | 'API_LEVEL' | 'PIXELS' | 'DPI' | 'PERCENT' | 'KIB';
      }
    | { available: false; reason: 'INVALID_METADATA' | 'METADATA_LIMIT' | 'UNAVAILABLE' }
  )
>;
export type MetadataSnapshot = Readonly<{
  revision: number;
  state: 'EMPTY' | 'PENDING' | 'READY' | 'STALE' | 'FAILED' | 'OUTCOME_UNKNOWN' | 'CLOSED';
  deviceId: string | null;
  registryRevision: number | null;
  operationId: string | null;
  field: MetadataField | null;
  lastOutcome:
    | 'NONE'
    | 'PENDING'
    | 'OBSERVED'
    | 'NOT_DISPATCHED'
    | 'DISPATCHED_UNCONFIRMED'
    | 'OUTCOME_UNKNOWN';
  code: 'OK' | MetadataCode | null;
  observations: Readonly<Record<MetadataField, MetadataResult | null>>;
  source: 'ADB_DISCOVERY';
  evidence: 'NATIVE_METADATA_QUERY';
}>;
export type MetadataRequest =
  | Readonly<{ version: 1; requestId: string; method: 'metadata.get' }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'metadata.read';
      deviceId: string;
      field: MetadataField;
      expectedRevision: number;
      expectedRegistryRevision: number;
    }>;
export type MetadataResponse =
  | Readonly<{
      version: 1;
      requestId: string;
      ok: true;
      outcome: 'OBSERVED' | 'PENDING';
      snapshot: MetadataSnapshot;
      diagnosticId: string | null;
      loggingHealth: MetadataHealth;
    }>
  | Readonly<{
      version: 1;
      requestId: string | null;
      ok: false;
      outcome: 'NOT_STARTED' | 'OUTCOME_UNKNOWN';
      code: MetadataCode;
      diagnosticId: string | null;
      loggingHealth: MetadataHealth;
    }>;
export const validMetadataRevision = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
export const validMetadataUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const validMetadataDeviceId = validMetadataUuid;
export const validMetadataId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^p[1-9][0-9]{0,15}$/.test(v) &&
  Number.isSafeInteger(Number(v.slice(1))) &&
  String(Number(v.slice(1))) === v.slice(1);
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

export function snapshotMetadataResult(
  input: unknown,
  field: MetadataField,
): MetadataResult | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const d = Object.getOwnPropertyDescriptor(input, 'available');
    if (!d || !('value' in d)) return null;
    const v = record(
      input,
      d.value === true
        ? ['field', 'observedUtc', 'source', 'stale', 'available', 'value', 'units']
        : ['field', 'observedUtc', 'source', 'stale', 'available', 'reason'],
    );
    if (
      v.field !== field ||
      !METADATA_FIELDS.includes(field) ||
      !validMetadataRevision(v.observedUtc) ||
      v.observedUtc > 8640000000000000 ||
      v.source !== 'ADB_TEXT' ||
      typeof v.stale !== 'boolean' ||
      v.available !== d.value
    )
      return null;
    if (v.available === false)
      return ['INVALID_METADATA', 'METADATA_LIMIT', 'UNAVAILABLE'].includes(v.reason as string)
        ? (Object.freeze({ ...v }) as MetadataResult)
        : null;
    if (v.available !== true) return null;
    const positive = (value: unknown, max: number) =>
      validMetadataRevision(value) && value > 0 && value <= max;
    let value = v.value,
      valid = false;
    if (['MODEL', 'MANUFACTURER', 'OS', 'LOCALE'].includes(field)) {
      valid =
        v.units === 'TEXT' &&
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 256 &&
        value.trim() === value &&
        !Array.from(value).some((c) => {
          const n = c.codePointAt(0);
          return (
            n === undefined || n < 32 || (n >= 127 && n <= 159) || (n >= 0xd800 && n <= 0xdfff)
          );
        });
      if (field === 'LOCALE')
        valid =
          valid &&
          typeof value === 'string' &&
          /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,3}$/.test(value);
    } else if (field === 'SDK' || field === 'DENSITY')
      valid = v.units === (field === 'SDK' ? 'API_LEVEL' : 'DPI') && positive(value, 10000);
    else if (field === 'BATTERY')
      valid =
        v.units === 'PERCENT' &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        !Object.is(value, -0) &&
        value >= 0 &&
        value <= 100;
    else if (field === 'RESOLUTION') {
      const x = record(value, ['width', 'height']);
      valid = v.units === 'PIXELS' && positive(x.width, 65535) && positive(x.height, 65535);
      value = Object.freeze({ ...x });
    } else if (field === 'STORAGE') {
      const x = record(value, ['total', 'used', 'available']);
      valid =
        v.units === 'KIB' &&
        positive(x.total, Number.MAX_SAFE_INTEGER) &&
        validMetadataRevision(x.used) &&
        validMetadataRevision(x.available) &&
        (x.used as number) + (x.available as number) <= (x.total as number);
      value = Object.freeze({ ...x });
    }
    return valid ? (Object.freeze({ ...v, value }) as MetadataResult) : null;
  } catch {
    return null;
  }
}
export function snapshotMetadataSnapshot(input: unknown): MetadataSnapshot | null {
  try {
    const v = record(input, [
      'revision',
      'state',
      'deviceId',
      'registryRevision',
      'operationId',
      'field',
      'lastOutcome',
      'code',
      'observations',
      'source',
      'evidence',
    ]);
    if (
      !validMetadataRevision(v.revision) ||
      v.source !== 'ADB_DISCOVERY' ||
      v.evidence !== 'NATIVE_METADATA_QUERY' ||
      !['EMPTY', 'PENDING', 'READY', 'STALE', 'FAILED', 'OUTCOME_UNKNOWN', 'CLOSED'].includes(
        v.state as string,
      )
    )
      return null;
    const raw = record(v.observations, METADATA_FIELDS),
      observations: Record<string, MetadataResult | null> = {};
    for (const field of METADATA_FIELDS) {
      const value = raw[field];
      const parsed = value === null ? null : snapshotMetadataResult(value, field);
      if (value !== null && !parsed) return null;
      observations[field] = parsed;
    }
    const none = v.lastOutcome === 'NONE',
      pending = v.lastOutcome === 'PENDING';
    if (none) {
      if (
        v.revision !== 0 ||
        v.deviceId !== null ||
        v.registryRevision !== null ||
        v.operationId !== null ||
        v.field !== null ||
        v.code !== null ||
        Object.values(observations).some((x) => x !== null) ||
        !['EMPTY', 'STALE', 'CLOSED'].includes(v.state as string)
      )
        return null;
    } else {
      if (
        !validMetadataUuid(v.deviceId) ||
        !validMetadataUuid(v.operationId) ||
        !validMetadataRevision(v.registryRevision) ||
        !METADATA_FIELDS.includes(v.field as MetadataField) ||
        v.revision < 1
      )
        return null;
      if (pending) {
        if (v.code !== null || !['PENDING', 'STALE', 'CLOSED'].includes(v.state as string))
          return null;
      } else {
        if (v.revision < 2) return null;
        if (v.lastOutcome === 'OBSERVED') {
          if (v.code !== 'OK') return null;
        } else if (v.lastOutcome === 'OUTCOME_UNKNOWN') {
          if (v.code !== 'OUTCOME_UNKNOWN') return null;
        } else if (
          !['NOT_DISPATCHED', 'DISPATCHED_UNCONFIRMED'].includes(v.lastOutcome as string) ||
          !METADATA_CODES.includes(v.code as MetadataCode)
        )
          return null;
        if (!['READY', 'FAILED', 'OUTCOME_UNKNOWN', 'STALE', 'CLOSED'].includes(v.state as string))
          return null;
      }
    }
    if (v.state === 'EMPTY' && !none) return null;
    if (v.state === 'PENDING' && !pending) return null;
    if (
      v.state === 'READY' &&
      (v.lastOutcome !== 'OBSERVED' ||
        !observations[v.field as MetadataField] ||
        observations[v.field as MetadataField]?.stale)
    )
      return null;
    if (
      v.state === 'FAILED' &&
      !['NOT_DISPATCHED', 'DISPATCHED_UNCONFIRMED'].includes(v.lastOutcome as string)
    )
      return null;
    if (v.state === 'OUTCOME_UNKNOWN' && v.lastOutcome !== 'OUTCOME_UNKNOWN') return null;
    if (
      ['STALE', 'CLOSED', 'OUTCOME_UNKNOWN'].includes(v.state as string) &&
      Object.values(observations).some((x) => x !== null && !x.stale)
    )
      return null;
    return Object.freeze({ ...v, observations: Object.freeze(observations) }) as MetadataSnapshot;
  } catch {
    return null;
  }
}
export function snapshotMetadataRequest(input: unknown): MetadataRequest | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const d = Object.getOwnPropertyDescriptor(input, 'method');
    if (!d || !('value' in d)) return null;
    const v = record(
      input,
      d.value === 'metadata.read'
        ? [
            'version',
            'requestId',
            'method',
            'deviceId',
            'field',
            'expectedRevision',
            'expectedRegistryRevision',
          ]
        : ['version', 'requestId', 'method'],
    );
    if (
      v.method !== d.value ||
      v.version !== 1 ||
      !validMetadataId(v.requestId) ||
      !['metadata.get', 'metadata.read'].includes(v.method as string)
    )
      return null;
    if (
      v.method === 'metadata.read' &&
      (!validMetadataUuid(v.deviceId) ||
        !METADATA_FIELDS.includes(v.field as MetadataField) ||
        !validMetadataRevision(v.expectedRevision) ||
        !validMetadataRevision(v.expectedRegistryRevision))
    )
      return null;
    return Object.freeze({ ...v }) as MetadataRequest;
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
export function parseMetadataRequest(
  raw: unknown,
):
  | Readonly<{ ok: true; value: MetadataRequest }>
  | Readonly<{ ok: false; code: MetadataCode; requestId: string | null }> {
  const denied = (code: MetadataCode, requestId: string | null = null) =>
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
    requestId = validMetadataId(value.requestId) ? value.requestId : null;
  if (!Number.isSafeInteger(value.version) || Object.is(value.version, -0))
    return denied('INVALID_SHAPE', requestId);
  if (value.version !== 1) return denied('UNSUPPORTED_VERSION', requestId);
  if (!['metadata.get', 'metadata.read'].includes(value.method as string))
    return denied('UNKNOWN_METHOD', requestId);
  const request = snapshotMetadataRequest(parsed);
  return request ? Object.freeze({ ok: true, value: request }) : denied('INVALID_SHAPE', requestId);
}
function response(input: unknown): MetadataResponse | null {
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
      (v.diagnosticId !== null && !validMetadataUuid(v.diagnosticId)) ||
      (v.diagnosticId === null && v.loggingHealth !== 'DEGRADED')
    )
      return null;
    if (v.ok === true) {
      const snapshot = snapshotMetadataSnapshot(v.snapshot);
      if (
        !snapshot ||
        !validMetadataId(v.requestId) ||
        !['OBSERVED', 'PENDING'].includes(v.outcome as string) ||
        (v.outcome === 'PENDING' && snapshot.state !== 'PENDING')
      )
        return null;
      return Object.freeze({ ...v, snapshot }) as MetadataResponse;
    }
    if (
      v.ok !== false ||
      (v.requestId !== null && !validMetadataId(v.requestId)) ||
      !METADATA_CODES.includes(v.code as MetadataCode) ||
      !['NOT_STARTED', 'OUTCOME_UNKNOWN'].includes(v.outcome as string) ||
      (v.code === 'TIMEOUT' && v.outcome !== 'OUTCOME_UNKNOWN')
    )
      return null;
    return Object.freeze({ ...v }) as MetadataResponse;
  } catch {
    return null;
  }
}
export function parseMetadataResponse(raw: unknown): MetadataResponse | null {
  if (typeof raw !== 'string' || raw.length > 16384 || new TextEncoder().encode(raw).length > 16384)
    return null;
  try {
    const value = response(JSON.parse(raw));
    return value && JSON.stringify(value) === raw ? value : null;
  } catch {
    return null;
  }
}
export function metadataSuccess(
  requestId: string,
  outcome: 'OBSERVED' | 'PENDING',
  snapshot: MetadataSnapshot,
  diagnosticId: string | null,
  loggingHealth: MetadataHealth,
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
export function metadataError(
  requestId: string | null,
  code: MetadataCode,
  diagnosticId: string | null,
  loggingHealth: MetadataHealth,
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
      requestId: validMetadataId(requestId) ? requestId : null,
      ok: false,
      outcome: 'NOT_STARTED',
      code: 'INTERNAL_FAILURE',
      diagnosticId: null,
      loggingHealth: 'DEGRADED',
    },
  );
}
