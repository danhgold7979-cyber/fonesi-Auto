import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  snapshotRef,
  snapshotBytes,
  parseRef,
  serializeRef,
  parseIndex,
  serializeIndex,
  parseInitializationReceipt,
  serializeInitializationReceipt,
  encodeSecretPayload,
  decodeSecretPayload,
  secretRevisionFilename,
  parseSecretRevisionFilename,
  makeSecretSuccess,
  makeSecretFailure,
  SECRET_FAILURES,
} from '../src/secret-contract.ts';
const ref = () => ({ version: 1, id: randomUUID(), revision: 1 });
const bind = () => ({
  storeId: randomUUID(),
  id: randomUUID(),
  revision: 1,
  purpose: 'PROXY_CREDENTIAL',
});
const entry = (id = randomUUID(), revision = 1, state = 'ACTIVE') => ({
  id,
  revision,
  purpose: 'PROXY_CREDENTIAL',
  state,
});
test('reference exact fields positive revision and supported-version classification', () => {
  const r = ref();
  assert.deepEqual(snapshotRef(r), { ok: true, value: r });
  for (const revision of [0, -0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', true])
    assert.deepEqual(snapshotRef({ ...r, revision }), { ok: false, code: 'INVALID_REQUEST' });
  for (const version of [-1, 0, -0, 2, Number.MAX_SAFE_INTEGER])
    assert.deepEqual(snapshotRef({ ...r, version }), { ok: false, code: 'UNSUPPORTED_VERSION' });
  for (const version of [true, '1', NaN, Infinity, 1.5])
    assert.deepEqual(snapshotRef({ ...r, version }), { ok: false, code: 'INVALID_REQUEST' });
  assert.equal(snapshotRef({ ...r, revision: Number.MAX_SAFE_INTEGER }).ok, true);
});
test('reference descriptors reject getters inherited extras symbols and malformed IDs without echo', () => {
  const r = ref();
  let calls = 0;
  for (const key of ['version', 'id', 'revision']) {
    const v = { ...r };
    Object.defineProperty(v, key, {
      enumerable: true,
      get() {
        calls++;
        return r[key];
      },
    });
    assert.deepEqual(snapshotRef(v), { ok: false, code: 'INVALID_REQUEST' });
  }
  assert.equal(calls, 0);
  for (const v of [
    Object.create(r),
    { ...r, extra: 'PRIVATE' },
    Object.assign({ ...r }, { [Symbol('extra')]: 1 }),
    { ...r, id: 'PRIVATE_TOKEN' },
    { ...r, id: `${r.id}\n` },
  ])
    assert.deepEqual(snapshotRef(v), { ok: false, code: 'INVALID_REQUEST' });
});
test('reference snapshot and canonical JSON reject duplicates unknowns escaped keys and alternate spelling', () => {
  const r = ref(),
    snap = snapshotRef(r).value,
    raw = serializeRef(r);
  r.revision = 5;
  assert.equal(snap.revision, 1);
  assert.equal(Object.isFrozen(snap), true);
  assert.deepEqual(parseRef(raw), snap);
  for (const bad of [
    raw.replace('"version":1', '"version":1,"version":1'),
    raw.replace('"id":', '"\\u0069d":'),
    raw.replace('"revision":1', '"revision":1.0'),
    ` ${raw}`,
    JSON.stringify({ ...snap, extra: 1 }),
    'x'.repeat(257),
  ])
    assert.equal(parseRef(bad), null);
});
test('bytes snapshot is fresh bounded noncoercing and uses internal typed-array data', () => {
  const bytes = new Uint8Array([0, 1, 255]),
    copy = snapshotBytes(bytes);
  bytes[0] = 9;
  assert.deepEqual([...copy], [0, 1, 255]);
  assert.notEqual(copy, bytes);
  for (const bad of [
    [],
    [1],
    new Uint16Array([1]),
    new Uint8Array(),
    new Uint8Array(4097),
    'PRIVATE',
    null,
  ])
    assert.equal(snapshotBytes(bad), null);
  assert.equal(snapshotBytes(new Uint8Array(4096)).length, 4096);
  assert.equal(snapshotBytes(new Uint8Array(new SharedArrayBuffer(2))), null);
  let calls = 0;
  const tricky = new Uint8Array([7]);
  Object.defineProperty(tricky, 'byteLength', {
    get() {
      calls++;
      throw new Error('GETTER');
    },
  });
  Object.defineProperty(tricky, Symbol.iterator, {
    get() {
      calls++;
      throw new Error('ITERATOR');
    },
  });
  assert.deepEqual([...snapshotBytes(tricky)], [7]);
  assert.equal(calls, 0);
  assert.deepEqual([...snapshotBytes(Buffer.from([8]))], [8]);
});
test('index canonical sorted entries include tombstones and never mutate/sort caller input', () => {
  const storeId = randomUUID(),
    entries = [entry(), entry(undefined, 2, 'DELETED')].sort((a, b) => a.id.localeCompare(b.id));
  const v = { version: 1, storeId, entries };
  const raw = serializeIndex(v);
  assert.deepEqual(parseIndex(raw, storeId), v);
  assert.equal(parseIndex(raw, randomUUID()), null);
  assert.equal(serializeIndex({ ...v, entries: [...entries].reverse() }), null);
  assert.equal(serializeIndex({ ...v, entries: [entries[0], entries[0]] }), null);
  const parsed = parseIndex(raw, storeId);
  entries[0].revision = 999;
  assert.notEqual(parsed.entries[0].revision, 999);
  assert.equal(Object.isFrozen(parsed.entries), true);
  assert.equal(Object.isFrozen(parsed.entries[0]), true);
});
test('index bounds count tombstones and reject malformed known entry fields', () => {
  const storeId = randomUUID(),
    entries = Array.from({ length: 256 }, () => entry(undefined, 1, 'DELETED')).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  assert.ok(serializeIndex({ version: 1, storeId, entries }));
  assert.equal(serializeIndex({ version: 1, storeId, entries: [...entries, entry()] }), null);
  const v = { version: 1, storeId, entries: [entry()] };
  for (const change of [
    { purpose: 'OTHER' },
    { state: 'MISSING' },
    { revision: 0 },
    { extra: 'PRIVATE' },
  ])
    assert.equal(serializeIndex({ ...v, entries: [{ ...v.entries[0], ...change }] }), null);
  const raw = serializeIndex(v);
  for (const bad of [
    raw.replace('"state":"ACTIVE"', '"state":"DELETED","state":"ACTIVE"'),
    `${raw}\n`,
    'x'.repeat(65537),
  ])
    assert.equal(parseIndex(bad, storeId), null);
});
test('index array descriptors reject holes/getters and object getters are not invoked', () => {
  let calls = 0;
  const entries = [entry()];
  Object.defineProperty(entries, '0', {
    enumerable: true,
    get() {
      calls++;
      return entry();
    },
  });
  assert.equal(serializeIndex({ version: 1, storeId: randomUUID(), entries }), null);
  assert.equal(calls, 0);
  assert.equal(serializeIndex({ version: 1, storeId: randomUUID(), entries: new Array(1) }), null);
  const e = entry();
  Object.defineProperty(e, 'id', {
    enumerable: true,
    get() {
      calls++;
      return randomUUID();
    },
  });
  assert.equal(serializeIndex({ version: 1, storeId: randomUUID(), entries: [e] }), null);
  assert.equal(calls, 0);
});
test('initialization receipt is exact canonical and bound to expected store', () => {
  const r = { version: 1, storeId: randomUUID(), format: 'VAULT_V1' },
    raw = serializeInitializationReceipt(r);
  assert.deepEqual(parseInitializationReceipt(raw, r.storeId), r);
  assert.equal(parseInitializationReceipt(raw, randomUUID()), null);
  for (const bad of [
    JSON.stringify({ ...r, extra: 1 }),
    raw.replace('"version":1', '"version":1,"version":1'),
    JSON.stringify({ ...r, format: 'VAULT_V2' }),
  ])
    assert.equal(parseInitializationReceipt(bad, r.storeId), null);
});
test('protected payload canonical round trip supports arbitrary bytes and fresh copies', () => {
  const b = bind(),
    bytes = new Uint8Array([0, 255, 1, 128]),
    raw = encodeSecretPayload({ ...b, bytes });
  assert.equal(raw, JSON.stringify({ version: 1, ...b, payloadBase64: 'AP8BgA==' }));
  const first = decodeSecretPayload(raw, b),
    second = decodeSecretPayload(raw, b);
  first[0] = 7;
  assert.deepEqual([...second], [0, 255, 1, 128]);
  assert.notEqual(first, second);
  assert.deepEqual([...bytes], [0, 255, 1, 128]);
  assert.equal(
    decodeSecretPayload(encodeSecretPayload({ ...b, bytes: new Uint8Array(4096) }), b).length,
    4096,
  );
});
test('encrypted plaintext binding rejects swaps of every store/ref/revision/purpose field', () => {
  const b = bind(),
    raw = encodeSecretPayload({ ...b, bytes: new Uint8Array([1]) });
  for (const update of [
    { storeId: randomUUID() },
    { id: randomUUID() },
    { revision: 2 },
    { purpose: 'OTHER' },
  ])
    assert.equal(decodeSecretPayload(raw, { ...b, ...update }), null);
  assert.equal(encodeSecretPayload({ ...b, extra: true, bytes: new Uint8Array([1]) }), null);
});
test('plaintext duplicate unknown malformed noncanonical base64 and bytes limits reject', () => {
  const b = bind(),
    raw = encodeSecretPayload({ ...b, bytes: new Uint8Array([0]) });
  for (const bad of [
    raw.replace('"version":1', '"version":1,"version":1'),
    JSON.stringify({ ...JSON.parse(raw), extra: 'PRIVATE' }),
    raw.replace('AA==', 'AB=='),
    raw.replace('AA==', 'AA'),
    raw.replace('AA==', ''),
    raw.replace('AA==', 'é==='),
    ` ${raw}`,
    raw.replace('"revision":1', '"revision":1.0'),
    'x'.repeat(32769),
  ])
    assert.equal(decodeSecretPayload(bad, b), null);
  assert.equal(encodeSecretPayload({ ...b, bytes: new Uint8Array(4097) }), null);
  assert.equal(encodeSecretPayload({ ...b, bytes: new Uint8Array() }), null);
});
test('filename grammar is derived only from validated UUID/revision and never aliases', () => {
  const r = ref(),
    name = secretRevisionFilename(r);
  assert.deepEqual(parseSecretRevisionFilename(name), r);
  for (const bad of [
    `../${name}`,
    name.replace('-r1.', '-r01.'),
    name.replace('-r1.', '-r0.'),
    name.replace('-r1.', '-r9007199254740992.'),
    `${name}\n`,
    name.toUpperCase(),
  ])
    assert.equal(parseSecretRevisionFilename(bad), null);
  assert.equal(secretRevisionFilename({ ...r, id: '../private' }), null);
});
test('failure envelopes contain only fixed operation/code/health with no payload echo', () => {
  for (const code of SECRET_FAILURES) {
    const r = makeSecretFailure('CREATE', code, 'DEGRADED');
    assert.deepEqual(Object.keys(r), ['version', 'ok', 'operation', 'code', 'auditHealth']);
    assert.equal(r.ok, false);
    assert.equal(r.code, code);
  }
  assert.equal(makeSecretFailure('PRIVATE', 'WRITE_FAILED', 'AVAILABLE'), null);
  assert.equal(makeSecretFailure('READ', 'PRIVATE_ERROR', 'AVAILABLE'), null);
  assert.equal(makeSecretFailure('READ', 'DELETED', true), null);
});
test('success variants enforce exact data and distinguish committed degradation from plaintext release', () => {
  const r = ref();
  for (const op of ['CREATE', 'REPLACE']) {
    const s = makeSecretSuccess(op, 'COMMITTED', { reference: r }, 'DEGRADED');
    assert.equal(s.ok, true);
    assert.equal(s.auditHealth, 'DEGRADED');
  }
  for (const outcome of ['COMMITTED', 'UNCHANGED'])
    assert.equal(
      makeSecretSuccess('DELETE', outcome, { reference: r, deleted: true }, 'AVAILABLE').ok,
      true,
    );
  assert.equal(
    makeSecretSuccess('DELETE', 'COMMITTED', { reference: r, deleted: false }, 'AVAILABLE'),
    null,
  );
  for (const status of ['AVAILABLE', 'MISSING', 'DELETED', 'STALE_REFERENCE', 'UNAVAILABLE'])
    assert.equal(
      makeSecretSuccess('STATUS', 'OBSERVED', { reference: r, status }, 'AVAILABLE').data.status,
      status,
    );
  assert.equal(
    makeSecretSuccess('STATUS', 'OBSERVED', { reference: r, status: 'SECRET' }, 'AVAILABLE'),
    null,
  );
  const bytes = new Uint8Array([1]);
  const read = makeSecretSuccess('READ', 'READ', { reference: r, bytes }, 'AVAILABLE');
  bytes[0] = 2;
  r.revision = 2;
  assert.equal(read.data.bytes[0], 1);
  assert.equal(read.data.reference.revision, 1);
  assert.equal(makeSecretSuccess('READ', 'READ', { reference: r, bytes }, 'DEGRADED'), null);
  assert.equal(
    makeSecretSuccess('CREATE', 'COMMITTED', { reference: r, bytes }, 'AVAILABLE'),
    null,
  );
  assert.equal(makeSecretSuccess('OTHER', 'COMMITTED', { reference: r }, 'AVAILABLE'), null);
});
