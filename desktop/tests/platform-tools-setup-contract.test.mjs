import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETUP_CODES,
  parseSetupRequest,
  snapshotSetupRequest,
  snapshotSetupSnapshot,
  setupSuccess,
  setupError,
  parseSetupResponse,
} from '../src/platform-tools-setup-contract.ts';
const id = 'abcdef00-0000-4000-8000-000000000001';
const snapshot = () => ({
  revision: 0,
  installationRevision: null,
  state: 'UNAVAILABLE',
  operationId: null,
  code: null,
  candidateVersion: '37.0.1',
});
test('exact canonical request IDs, versions and independent safe revision bounds', () => {
  for (const request of [
    { version: 1, requestId: 'p1', method: 'platformTools.get' },
    {
      version: 1,
      requestId: 'p9007199254740991',
      method: 'platformTools.setup.request',
      expectedRevision: 0,
    },
  ])
    assert.deepEqual(parseSetupRequest(JSON.stringify(request)), { ok: true, value: request });
  for (const requestId of ['p0', 'p01', 'p9007199254740992', 'p1\n', 1])
    assert.equal(
      parseSetupRequest(JSON.stringify({ version: 1, requestId, method: 'platformTools.get' })).ok,
      false,
    );
  for (const expectedRevision of [-0, -1, Infinity, 1.5])
    assert.equal(
      snapshotSetupRequest({
        version: 1,
        requestId: 'p1',
        method: 'platformTools.setup.request',
        expectedRevision,
      }),
      null,
    );
  assert.equal(parseSetupRequest('{}'.repeat(300)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(parseSetupRequest(null).code, 'INVALID_TRANSPORT');
  assert.equal(parseSetupRequest('{').code, 'INVALID_JSON');
  assert.equal(
    parseSetupRequest('{"version":2,"requestId":"p1","method":"platformTools.get"}').code,
    'UNSUPPORTED_VERSION',
  );
  for (const raw of [
    '{"version":1,"requestId":"p1","requestId":"p2","method":"platformTools.get"}',
    ' {"version":1,"requestId":"p1","method":"platformTools.get"}',
    '{"method":"platformTools.get","version":1,"requestId":"p1"}',
  ])
    assert.equal(parseSetupRequest(raw).ok, false);
});
test('snapshots reject getters/private extras and do not confuse installation and process revisions', () => {
  const value = { ...snapshot(), revision: 2, installationRevision: 77 };
  assert.deepEqual(snapshotSetupSnapshot(value), value);
  value.revision = 4;
  assert.equal(snapshotSetupSnapshot(value).revision, 4);
  let touched = false;
  const bad = { ...snapshot() };
  Object.defineProperty(bad, 'state', {
    enumerable: true,
    get() {
      touched = true;
      return 'UNAVAILABLE';
    },
  });
  assert.equal(snapshotSetupSnapshot(bad), null);
  assert.equal(touched, false);
  for (const patch of [
    { path: 'private\ncanary' },
    { state: 'VERIFIED_LOCAL', code: 'DOWNLOAD_FAILED' },
    { state: 'DECLINED', code: null },
    { state: 'OUTCOME_UNKNOWN', code: 'BUSY' },
    { installationRevision: -0 },
    { candidateVersion: 'latest' },
  ])
    assert.equal(snapshotSetupSnapshot({ ...snapshot(), ...patch }), null);
});
test('response exact outcome/state and null diagnostic health invariants, all25 codes fixed', () => {
  assert.equal(SETUP_CODES.length, 25);
  const raw = setupSuccess('p1', 'OBSERVED', snapshot(), id, 'AVAILABLE');
  assert.equal(parseSetupResponse(raw).snapshot.state, 'UNAVAILABLE');
  assert.equal(setupSuccess('p1', 'PENDING', snapshot(), id, 'AVAILABLE'), null);
  const pending = { ...snapshot(), state: 'AWAITING_RECIPIENT', operationId: id };
  assert.equal(
    parseSetupResponse(setupSuccess('p2', 'PENDING', pending, id, 'AVAILABLE')).outcome,
    'PENDING',
  );
  assert.equal(setupSuccess('p1', 'OBSERVED', snapshot(), null, 'AVAILABLE'), null);
  for (const code of SETUP_CODES) {
    const wire = setupError(
      'p1',
      code,
      null,
      'DEGRADED',
      code === 'TIMEOUT' ? 'OUTCOME_UNKNOWN' : 'NOT_STARTED',
    );
    assert.equal(parseSetupResponse(wire).code, code);
    assert.equal(parseSetupResponse(wire.replace('DEGRADED', 'AVAILABLE')), null);
  }
  for (const raw of [
    '{}',
    '\ufeff' + setupError(null, 'INVALID_JSON', null, 'DEGRADED'),
    setupError(null, 'INVALID_JSON', null, 'DEGRADED') + '\n',
  ])
    assert.equal(parseSetupResponse(raw), null);
  const malformed = JSON.parse(setupError('p1', 'TIMEOUT', null, 'DEGRADED', 'OUTCOME_UNKNOWN'));
  malformed.outcome = 'NOT_STARTED';
  assert.equal(parseSetupResponse(JSON.stringify(malformed)), null);
});

test('changing descriptor discriminators and false verified/pending snapshots are rejected', () => {
  let reads = 0;
  const proxy = new Proxy(
    { version: 1, requestId: 'p1', method: 'platformTools.setup.request', expectedRevision: 0 },
    {
      getOwnPropertyDescriptor(target, key) {
        const d = Reflect.getOwnPropertyDescriptor(target, key);
        if (key === 'method')
          return {
            ...d,
            value: ++reads === 1 ? 'platformTools.setup.request' : 'platformTools.get',
          };
        return d;
      },
    },
  );
  assert.equal(snapshotSetupRequest(proxy), null);
  for (const installationRevision of [null, 0])
    assert.equal(
      snapshotSetupSnapshot({ ...snapshot(), state: 'VERIFIED_LOCAL', installationRevision }),
      null,
    );
  assert.notEqual(
    snapshotSetupSnapshot({ ...snapshot(), state: 'VERIFIED_LOCAL', installationRevision: 1 }),
    null,
  );
  for (const state of ['AWAITING_RECIPIENT', 'PROVISIONING'])
    assert.equal(snapshotSetupSnapshot({ ...snapshot(), state }), null);
});
