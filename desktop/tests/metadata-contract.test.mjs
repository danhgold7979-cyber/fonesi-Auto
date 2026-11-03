import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METADATA_FIELDS,
  METADATA_CODES,
  parseMetadataRequest as parse,
  snapshotMetadataRequest,
  snapshotMetadataSnapshot as snapshot,
  snapshotMetadataResult,
  metadataSuccess,
  metadataError,
  parseMetadataResponse,
} from '../src/metadata-contract.ts';
import { parseAdbMetadata } from '../src/main/adb-metadata.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const empty = () => ({
  revision: 0,
  state: 'EMPTY',
  deviceId: null,
  registryRevision: null,
  operationId: null,
  field: null,
  lastOutcome: 'NONE',
  code: null,
  observations: Object.fromEntries(METADATA_FIELDS.map((f) => [f, null])),
  source: 'ADB_DISCOVERY',
  evidence: 'NATIVE_METADATA_QUERY',
});
const pending = () => ({
  ...empty(),
  revision: 1,
  state: 'PENDING',
  deviceId: id(1),
  registryRevision: 3,
  operationId: id(2),
  field: 'MODEL',
  lastOutcome: 'PENDING',
});
const ready = () => ({
  ...pending(),
  revision: 2,
  state: 'READY',
  lastOutcome: 'OBSERVED',
  code: 'OK',
  observations: { ...empty().observations, MODEL: parseAdbMetadata('MODEL', 'Fixture', 1000) },
});
const request = () => ({
  version: 1,
  requestId: 'p1',
  method: 'metadata.read',
  deviceId: id(1),
  field: 'MODEL',
  expectedRevision: 0,
  expectedRegistryRevision: 3,
});
test('two exact requests, duplicate-aware JSON, bounded p-counter/UUID/revisions and private-input rejection', () => {
  for (const q of [{ version: 1, requestId: 'p1', method: 'metadata.get' }, request()])
    assert.equal(parse(JSON.stringify(q)).ok, true);
  for (const patch of [
    { requestId: 'p0' },
    { requestId: 'p01' },
    { requestId: 'p9007199254740992' },
    { requestId: 'p1\n' },
    { deviceId: `${id(1)}\n` },
    { expectedRevision: -0 },
    { expectedRegistryRevision: NaN },
    { field: 'MODEL;id' },
    { path: 'PRIVATE_CANARY' },
  ])
    assert.equal(snapshotMetadataRequest({ ...request(), ...patch }), null);
  for (const raw of [
    '{"version":1,"version":1,"method":"metadata.get","requestId":"p1"}',
    '{"version":1,"method":"metadata.get","requestId":"p1","\\u006dethod":"metadata.read"}',
    '\ufeff' + JSON.stringify(request()),
  ])
    assert.equal(parse(raw).code, 'INVALID_JSON');
  assert.equal(parse(' '.repeat(16385)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(parse('é'.repeat(9000)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(parse({}).code, 'INVALID_TRANSPORT');
  assert.equal(parse(JSON.stringify({ ...request(), version: 2 })).code, 'UNSUPPORTED_VERSION');
  assert.equal(
    parse(JSON.stringify({ ...request(), method: 'metadata.stop' })).code,
    'UNKNOWN_METHOD',
  );
  assert.equal(parse(` \t${JSON.stringify(request())}\n`).ok, true);
});
test('descriptor snapshots never invoke getters and reject changing discriminators', () => {
  let touched = 0;
  const q = request();
  Object.defineProperty(q, 'field', {
    enumerable: true,
    get() {
      touched++;
      return 'MODEL';
    },
  });
  assert.equal(snapshotMetadataRequest(q), null);
  assert.equal(touched, 0);
  let reads = 0;
  const proxy = new Proxy(request(), {
    getOwnPropertyDescriptor(target, key) {
      const d = Reflect.getOwnPropertyDescriptor(target, key);
      return key === 'method'
        ? { ...d, value: ++reads === 1 ? 'metadata.read' : 'metadata.get' }
        : d;
    },
  });
  assert.equal(snapshotMetadataRequest(proxy), null);
  const r = ready();
  assert.throws(
    () => Object.defineProperty(r.observations.MODEL, 'value', { value: 'x' }),
    TypeError,
  );
});
test('all nine parser values normalize immutably with exact units and truthful unavailable slots', () => {
  const values = {
    MODEL: 'Fixture',
    MANUFACTURER: 'Maker',
    OS: '14',
    SDK: '34',
    LOCALE: 'vi-VN',
    RESOLUTION: 'Physical size: 1080x2400',
    DENSITY: 'Physical density: 420',
    BATTERY: 'Current Battery Service state:\n  present: true\n  level: 25\n  scale: 50\n',
    STORAGE:
      'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/fixture 1000 200 700 20% /data\n',
  };
  for (const field of METADATA_FIELDS) {
    const parsed = parseAdbMetadata(field, values[field], 1000),
      copy = snapshotMetadataResult(parsed, field);
    assert.deepEqual(copy, parsed);
    assert.ok(Object.isFrozen(copy));
    if (typeof copy.value === 'object') assert.ok(Object.isFrozen(copy.value));
    assert.equal(snapshotMetadataResult({ ...parsed, units: 'PRIVATE' }, field), null);
    assert.equal(snapshotMetadataResult({ ...parsed, observedUtc: -0 }, field), null);
  }
  const unavailable = parseAdbMetadata('MODEL', '', 1000);
  assert.equal(snapshotMetadataResult(unavailable, 'MODEL').available, false);
  assert.equal(snapshotMetadataResult({ ...unavailable, value: 0 }, 'MODEL'), null);
  for (const value of ['', 'x\n', ' x', '\u0000', '\ud800', 'x'.repeat(257)])
    assert.equal(
      snapshotMetadataResult({ ...parseAdbMetadata('MODEL', 'Fixture', 1000), value }, 'MODEL'),
      null,
    );
  assert.equal(
    snapshotMetadataResult({ ...parseAdbMetadata('SDK', '34', 1000), value: 10001 }, 'SDK'),
    null,
  );
  assert.equal(
    snapshotMetadataResult(
      {
        ...parseAdbMetadata('STORAGE', values.STORAGE, 1000),
        value: { total: 100, used: 90, available: 20 },
      },
      'STORAGE',
    ),
    null,
  );
});
test('exact state/correlation history distinguishes pending, unavailable READY and stale/closed without fabricated values', () => {
  for (const value of [
    empty(),
    pending(),
    ready(),
    { ...ready(), state: 'FAILED', lastOutcome: 'NOT_DISPATCHED', code: 'BUSY' },
  ])
    assert.ok(snapshot(value));
  const unavailable = ready();
  unavailable.observations.MODEL = parseAdbMetadata('MODEL', '', 1000);
  assert.ok(snapshot(unavailable));
  for (const state of ['STALE', 'CLOSED']) {
    const value = ready();
    value.state = state;
    value.observations.MODEL = { ...value.observations.MODEL, stale: true };
    assert.ok(snapshot(value));
    assert.equal(snapshot({ ...ready(), state }), null);
  }
  assert.ok(snapshot({ ...empty(), state: 'CLOSED' }));
  for (const patch of [
    { revision: -0 },
    { state: 'READY' },
    { operationId: id(2) },
    { field: 'MODEL' },
    { code: 'OK' },
    { source: 'SYNTHETIC_TEST' },
    { evidence: 'SYNTHETIC_PROCESS' },
    { extra: true },
  ])
    assert.equal(snapshot({ ...empty(), ...patch }), null);
  for (const patch of [
    { revision: 1 },
    { operationId: null },
    { code: null },
    { lastOutcome: 'NONE' },
    { field: 'SDK' },
  ])
    assert.equal(snapshot({ ...ready(), ...patch }), null);
  const unknown = {
    ...ready(),
    state: 'OUTCOME_UNKNOWN',
    lastOutcome: 'OUTCOME_UNKNOWN',
    code: 'OUTCOME_UNKNOWN',
  };
  assert.equal(snapshot(unknown), null);
  unknown.observations.MODEL = { ...unknown.observations.MODEL, stale: true };
  assert.ok(snapshot(unknown));
  const value = ready(),
    copy = snapshot(value);
  value.observations.MODEL = { ...value.observations.MODEL, value: 'Changed' };
  assert.equal(copy.observations.MODEL.value, 'Fixture');
  assert.ok(Object.isFrozen(copy.observations));
});
test('canonical bounded responses preserve diagnostics health and never serialize raw invalid input', () => {
  for (const s of [empty(), pending(), ready()]) {
    const raw = metadataSuccess(
      'p1',
      s.state === 'PENDING' ? 'PENDING' : 'OBSERVED',
      s,
      id(3),
      'AVAILABLE',
    );
    assert.ok(raw);
    assert.ok(parseMetadataResponse(raw));
    assert.equal(parseMetadataResponse(` ${raw}`), null);
    assert.equal(
      parseMetadataResponse(raw.replace('"version":1', '"version":1,"version":1')),
      null,
    );
  }
  assert.equal(metadataSuccess('p1', 'PENDING', ready(), id(3), 'AVAILABLE'), null);
  assert.equal(metadataSuccess('p1', 'OBSERVED', empty(), null, 'AVAILABLE'), null);
  for (const code of METADATA_CODES) {
    const raw = metadataError(
      'p1',
      code,
      null,
      'DEGRADED',
      code === 'TIMEOUT' ? 'OUTCOME_UNKNOWN' : 'NOT_STARTED',
    );
    assert.equal(parseMetadataResponse(raw).code, code);
  }
  const raw = metadataError('p1', 'PRIVATE_CANARY', null, 'DEGRADED');
  assert.equal(raw.includes('PRIVATE_CANARY'), false);
  assert.equal(parseMetadataResponse(raw).code, 'INTERNAL_FAILURE');
  assert.equal(parseMetadataResponse(' '.repeat(16385)), null);
  let touched = 0;
  const r = ready(),
    observation = { ...r.observations.MODEL };
  Object.defineProperty(observation, 'value', {
    enumerable: true,
    get() {
      touched++;
      return 'PRIVATE';
    },
  });
  r.observations.MODEL = observation;
  assert.equal(metadataSuccess('p1', 'OBSERVED', r, id(3), 'AVAILABLE'), null);
  assert.equal(touched, 0);
});
