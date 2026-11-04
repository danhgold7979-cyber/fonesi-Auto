export const SECRET_BYTES_LIMIT = 4096;
export const SECRET_RECORD_BYTES_LIMIT = 32768;
export const SECRET_INDEX_BYTES_LIMIT = 65536;
export const SECRET_INDEX_ENTRIES_LIMIT = 256;
export type SecretPurpose = 'PROXY_CREDENTIAL';
export type SecretRef = Readonly<{ version: 1; id: string; revision: number }>;
export type SecretIndexEntry = Readonly<{
  id: string;
  revision: number;
  purpose: SecretPurpose;
  state: 'ACTIVE' | 'DELETED';
}>;
export type SecretIndex = Readonly<{
  version: 1;
  storeId: string;
  entries: readonly SecretIndexEntry[];
}>;
export type SecretInitializationReceipt = Readonly<{
  version: 1;
  storeId: string;
  format: 'VAULT_V1';
}>;
export type SecretBinding = Readonly<{
  storeId: string;
  id: string;
  revision: number;
  purpose: SecretPurpose;
}>;
export type SecretOperation = 'CREATE' | 'READ' | 'REPLACE' | 'DELETE' | 'STATUS';
export type SecretAuditHealth = 'AVAILABLE' | 'DEGRADED';
export type SecretStatus = 'AVAILABLE' | 'MISSING' | 'DELETED' | 'STALE_REFERENCE' | 'UNAVAILABLE';
export const SECRET_FAILURES = [
  'AUDIT_UNAVAILABLE',
  'INVALID_REQUEST',
  'UNSUPPORTED_VERSION',
  'UNAUTHORIZED',
  'STALE_REFERENCE',
  'NOT_FOUND',
  'DELETED',
  'BUSY',
  'KEY_UNAVAILABLE',
  'DECRYPTION_FAILED',
  'STORE_INVALID',
  'WRITE_FAILED',
  'OWNER_REVOKED',
  'REVISION_EXHAUSTED',
] as const;
export type SecretFailureCode = (typeof SECRET_FAILURES)[number];
export type SecretFailure = Readonly<{
  version: 1;
  ok: false;
  operation: SecretOperation;
  code: SecretFailureCode;
  auditHealth: SecretAuditHealth;
}>;
export type SecretSuccess = Readonly<{ version: 1; ok: true; auditHealth: SecretAuditHealth }> &
  (
    | Readonly<{
        operation: 'CREATE' | 'REPLACE';
        outcome: 'COMMITTED';
        data: Readonly<{ reference: SecretRef }>;
      }>
    | Readonly<{
        operation: 'DELETE';
        outcome: 'COMMITTED' | 'UNCHANGED';
        data: Readonly<{ reference: SecretRef; deleted: true }>;
      }>
    | Readonly<{
        operation: 'READ';
        outcome: 'READ';
        data: Readonly<{ reference: SecretRef; bytes: Uint8Array }>;
      }>
    | Readonly<{
        operation: 'STATUS';
        outcome: 'OBSERVED';
        data: Readonly<{ reference: SecretRef; status: SecretStatus }>;
      }>
  );
export type SecretResult = SecretSuccess | SecretFailure;
export function validSecretId(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
  );
}
export function validRevision(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && !Object.is(v, -0);
}
// Accepted own-data envelope bounds are not a resource/sandbox guarantee for
// arbitrary proxies or already-allocated huge objects in a compromised main.
function record(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return null;
    if (
      Object.getOwnPropertySymbols(input).length ||
      Object.getOwnPropertyNames(input).length !== keys.length
    )
      return null;
    const out: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(input, key);
      if (!d || !('value' in d) || !d.enumerable) return null;
      out[key] = d.value;
    }
    return out;
  } catch {
    return null;
  }
}
export function snapshotRef(
  input: unknown,
):
  | Readonly<{ ok: true; value: SecretRef }>
  | Readonly<{ ok: false; code: 'INVALID_REQUEST' | 'UNSUPPORTED_VERSION' }> {
  const v = record(input, ['version', 'id', 'revision']);
  if (!v || typeof v.version !== 'number' || !Number.isSafeInteger(v.version))
    return { ok: false, code: 'INVALID_REQUEST' };
  if (v.version !== 1) return { ok: false, code: 'UNSUPPORTED_VERSION' };
  if (!validSecretId(v.id) || !validRevision(v.revision))
    return { ok: false, code: 'INVALID_REQUEST' };
  return { ok: true, value: Object.freeze({ version: 1, id: v.id, revision: v.revision }) };
}
export function snapshotBytes(input: unknown): Uint8Array | null {
  try {
    if (!ArrayBuffer.isView(input) || !(input instanceof Uint8Array)) return null;
    const typed = Object.getPrototypeOf(Uint8Array.prototype);
    const length = Object.getOwnPropertyDescriptor(typed, 'byteLength')?.get?.call(input);
    const buffer = Object.getOwnPropertyDescriptor(typed, 'buffer')?.get?.call(input);
    if (
      !(buffer instanceof ArrayBuffer) ||
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > SECRET_BYTES_LIMIT
    )
      return null;
    const copy = new Uint8Array(length);
    Uint8Array.prototype.set.call(copy, input);
    return copy;
  } catch {
    return null;
  }
}
function canonical(
  raw: unknown,
  limit: number,
  normalize: (input: unknown) => unknown | null,
): unknown | null {
  try {
    if (
      typeof raw !== 'string' ||
      raw.length > limit ||
      new TextEncoder().encode(raw).length > limit
    )
      return null;
    const v = normalize(JSON.parse(raw));
    return v !== null && JSON.stringify(v) === raw ? v : null;
  } catch {
    return null;
  }
}
export function serializeRef(input: unknown): string | null {
  const v = snapshotRef(input);
  return v.ok ? JSON.stringify(v.value) : null;
}
export function parseRef(raw: unknown): SecretRef | null {
  return canonical(raw, 256, (v) => {
    const r = snapshotRef(v);
    return r.ok ? r.value : null;
  }) as SecretRef | null;
}
function arrayData(input: unknown): unknown[] | null {
  try {
    if (
      !Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Array.prototype ||
      Object.getOwnPropertySymbols(input).length
    )
      return null;
    const d = Object.getOwnPropertyDescriptor(input, 'length');
    const length = d?.value;
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > SECRET_INDEX_ENTRIES_LIMIT ||
      Object.getOwnPropertyNames(input).length !== length + 1
    )
      return null;
    const values = [];
    for (let i = 0; i < length; i++) {
      const item = Object.getOwnPropertyDescriptor(input, String(i));
      if (!item || !('value' in item) || !item.enumerable) return null;
      values.push(item.value);
    }
    return values;
  } catch {
    return null;
  }
}
function indexValue(input: unknown): SecretIndex | null {
  const v = record(input, ['version', 'storeId', 'entries']);
  if (v?.version !== 1 || !validSecretId(v.storeId)) return null;
  const items = arrayData(v.entries);
  if (!items) return null;
  const entries: SecretIndexEntry[] = [];
  let previous = '';
  for (const item of items) {
    const e = record(item, ['id', 'revision', 'purpose', 'state']);
    if (
      !e ||
      !validSecretId(e.id) ||
      e.id <= previous ||
      !validRevision(e.revision) ||
      e.purpose !== 'PROXY_CREDENTIAL' ||
      (e.state !== 'ACTIVE' && e.state !== 'DELETED')
    )
      return null;
    previous = e.id;
    entries.push(
      Object.freeze({ id: e.id, revision: e.revision, purpose: e.purpose, state: e.state }),
    );
  }
  return Object.freeze({ version: 1, storeId: v.storeId, entries: Object.freeze(entries) });
}
export function serializeIndex(input: unknown): string | null {
  const v = indexValue(input);
  if (!v) return null;
  const raw = JSON.stringify(v);
  return new TextEncoder().encode(raw).length <= SECRET_INDEX_BYTES_LIMIT ? raw : null;
}
export function parseIndex(raw: unknown, storeId: unknown): SecretIndex | null {
  if (!validSecretId(storeId)) return null;
  const v = canonical(raw, SECRET_INDEX_BYTES_LIMIT, indexValue) as SecretIndex | null;
  return v?.storeId === storeId ? v : null;
}
function receiptValue(input: unknown): SecretInitializationReceipt | null {
  const v = record(input, ['version', 'storeId', 'format']);
  return v?.version === 1 && validSecretId(v.storeId) && v.format === 'VAULT_V1'
    ? Object.freeze({ version: 1, storeId: v.storeId, format: 'VAULT_V1' })
    : null;
}
export function serializeInitializationReceipt(input: unknown): string | null {
  const v = receiptValue(input);
  return v ? JSON.stringify(v) : null;
}
export function parseInitializationReceipt(
  raw: unknown,
  storeId: unknown,
): SecretInitializationReceipt | null {
  if (!validSecretId(storeId)) return null;
  const v = canonical(raw, 256, receiptValue) as SecretInitializationReceipt | null;
  return v?.storeId === storeId ? v : null;
}
function binding(input: unknown): SecretBinding | null {
  const v = record(input, ['storeId', 'id', 'revision', 'purpose']);
  return v &&
    validSecretId(v.storeId) &&
    validSecretId(v.id) &&
    validRevision(v.revision) &&
    v.purpose === 'PROXY_CREDENTIAL'
    ? Object.freeze({ storeId: v.storeId, id: v.id, revision: v.revision, purpose: v.purpose })
    : null;
}
function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function unbase64(input: unknown): Uint8Array | null {
  try {
    if (
      typeof input !== 'string' ||
      input.length < 4 ||
      input.length > 5464 ||
      input.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)
    )
      return null;
    const text = atob(input);
    if (text.length < 1 || text.length > SECRET_BYTES_LIMIT || btoa(text) !== input) return null;
    return Uint8Array.from(text, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
export function encodeSecretPayload(input: unknown): string | null {
  const v = record(input, ['storeId', 'id', 'revision', 'purpose', 'bytes']);
  if (!v) return null;
  const b = binding({ storeId: v.storeId, id: v.id, revision: v.revision, purpose: v.purpose });
  if (!b) return null;
  const bytes = snapshotBytes(v.bytes);
  if (!bytes) return null;
  try {
    return JSON.stringify({ version: 1, ...b, payloadBase64: base64(bytes) });
  } finally {
    bytes.fill(0);
  }
}
export function decodeSecretPayload(raw: unknown, expected: unknown): Uint8Array | null {
  const b = binding(expected);
  if (!b) return null;
  let bytes: Uint8Array | null = null;
  const value = canonical(raw, SECRET_RECORD_BYTES_LIMIT, (input) => {
    const v = record(input, ['version', 'storeId', 'id', 'revision', 'purpose', 'payloadBase64']);
    if (
      v?.version !== 1 ||
      v.storeId !== b.storeId ||
      v.id !== b.id ||
      v.revision !== b.revision ||
      v.purpose !== b.purpose
    )
      return null;
    bytes = unbase64(v.payloadBase64);
    return bytes ? { version: 1, ...b, payloadBase64: v.payloadBase64 } : null;
  });
  if (!value) {
    if (bytes) (bytes as Uint8Array).fill(0);
    return null;
  }
  return bytes;
}
export function secretRevisionFilename(input: unknown): string | null {
  const r = snapshotRef(input);
  return r.ok ? `secret-${r.value.id}-r${r.value.revision}.bin` : null;
}
export function parseSecretRevisionFilename(name: unknown): SecretRef | null {
  if (typeof name !== 'string' || name.length > 80) return null;
  const match = /^secret-([0-9a-f-]{36})-r([1-9][0-9]*)\.bin$/.exec(name);
  if (!match) return null;
  const revision = Number(match[2]);
  const r = snapshotRef({ version: 1, id: match[1], revision });
  return r.ok && secretRevisionFilename(r.value) === name ? r.value : null;
}
const operations = ['CREATE', 'READ', 'REPLACE', 'DELETE', 'STATUS'];
const health = (v: unknown): v is SecretAuditHealth => v === 'AVAILABLE' || v === 'DEGRADED';
export function makeSecretFailure(
  operation: unknown,
  code: unknown,
  auditHealth: unknown,
): SecretFailure | null {
  if (
    typeof operation !== 'string' ||
    !operations.includes(operation) ||
    typeof code !== 'string' ||
    !(SECRET_FAILURES as readonly string[]).includes(code) ||
    !health(auditHealth)
  )
    return null;
  return Object.freeze({
    version: 1,
    ok: false,
    operation: operation as SecretOperation,
    code: code as SecretFailureCode,
    auditHealth,
  });
}
export function makeSecretSuccess(
  operation: unknown,
  outcome: unknown,
  input: unknown,
  auditHealth: unknown,
): SecretSuccess | null {
  if (!health(auditHealth)) return null;
  const keys =
    operation === 'READ'
      ? ['reference', 'bytes']
      : operation === 'DELETE'
        ? ['reference', 'deleted']
        : operation === 'STATUS'
          ? ['reference', 'status']
          : ['reference'];
  const d = record(input, keys);
  if (!d) return null;
  const ref = snapshotRef(d.reference);
  if (!ref.ok) return null;
  const common = { version: 1 as const, ok: true as const, auditHealth };
  if ((operation === 'CREATE' || operation === 'REPLACE') && outcome === 'COMMITTED')
    return Object.freeze({
      ...common,
      operation,
      outcome,
      data: Object.freeze({ reference: ref.value }),
    });
  if (
    operation === 'DELETE' &&
    (outcome === 'COMMITTED' || outcome === 'UNCHANGED') &&
    d.deleted === true
  )
    return Object.freeze({
      ...common,
      operation,
      outcome,
      data: Object.freeze({ reference: ref.value, deleted: true }),
    });
  if (operation === 'READ' && outcome === 'READ' && auditHealth === 'AVAILABLE') {
    const bytes = snapshotBytes(d.bytes);
    return bytes
      ? Object.freeze({
          ...common,
          operation,
          outcome,
          data: Object.freeze({ reference: ref.value, bytes }),
        })
      : null;
  }
  if (
    operation === 'STATUS' &&
    outcome === 'OBSERVED' &&
    typeof d.status === 'string' &&
    ['AVAILABLE', 'MISSING', 'DELETED', 'STALE_REFERENCE', 'UNAVAILABLE'].includes(d.status)
  )
    return Object.freeze({
      ...common,
      operation,
      outcome,
      data: Object.freeze({ reference: ref.value, status: d.status as SecretStatus }),
    });
  return null;
}
