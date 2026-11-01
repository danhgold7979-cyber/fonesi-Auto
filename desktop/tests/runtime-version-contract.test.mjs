import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRuntimeVersionRequest as parse,
  snapshotRuntimeVersionRequest,
  snapshotRuntimeVersionSnapshot as snapshot,
  runtimeVersionSuccess,
  runtimeVersionError,
  parseRuntimeVersionResponse,
} from '../src/runtime-version-contract.ts';
const id = '00000000-0000-4000-8000-000000000001';
const initial = {
  revision: 0,
  installationRevision: null,
  state: 'UNAVAILABLE',
  operationId: null,
  code: 'NOT_PROVISIONED',
  candidateVersion: '37.0.1',
  verifiedAtUtc: null,
};
test('bounded duplicate-aware request accepts equivalent whitespace/order/escaped keys, preserves known ID on shape failure', () => {
  assert.equal(
    parse(' { "method":"runtimeVersion.get", "requestId":"p1", "version":1 } ').ok,
    true,
  );
  assert.equal(
    parse('{"version":1,"request\\u0049d":"p1","method":"runtimeVersion.get"}').ok,
    true,
  );
  for (const raw of [
    '{"version":1,"requestId":"p1","request\\u0049d":"p2","method":"runtimeVersion.get"}',
    '{"version":1,"requestId":"p1","method":"runtimeVersion.request","expectedRevision":-0,"expectedInstallationRevision":1}',
    '\ufeff{}',
    '{"version":1,"requestId":"p1","method":"runtimeVersion.get","extra":{"x":1,"x":2}}',
  ])
    assert.equal(parse(raw).ok, false);
  assert.equal(
    parse(
      JSON.stringify({
        version: 1,
        requestId: 'p1',
        method: 'runtimeVersion.request',
        expectedRevision: 0,
        expectedInstallationRevision: 0,
      }),
    ).requestId,
    'p1',
  );
  assert.equal(parse(' '.repeat(8193)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(parse({}).code, 'INVALID_TRANSPORT');
});
test('descriptor-only snapshots reject getters and unstable discriminators without coercion', () => {
  let calls = 0;
  const r = {
    version: 1,
    requestId: 'p1',
    get method() {
      calls++;
      return 'runtimeVersion.get';
    },
  };
  assert.equal(snapshotRuntimeVersionRequest(r), null);
  assert.equal(calls, 0);
  let n = 0;
  const p = new Proxy(
    { version: 1, requestId: 'p1', method: 'runtimeVersion.get' },
    {
      getOwnPropertyDescriptor(t, k) {
        const d = Reflect.getOwnPropertyDescriptor(t, k);
        if (k === 'method')
          return { ...d, value: ++n === 1 ? 'runtimeVersion.request' : 'runtimeVersion.get' };
        return d;
      },
    },
  );
  assert.equal(snapshotRuntimeVersionRequest(p), null);
  assert.equal(
    snapshot({
      ...initial,
      get revision() {
        calls++;
        return 0;
      },
    }),
    null,
  );
  assert.equal(calls, 0);
});
test('exact state tuples and immutable canonical response bind pending without inventing verification', () => {
  const states = [
    initial,
    { ...initial, installationRevision: 1, state: 'IDLE', code: null },
    { ...initial, installationRevision: 1, state: 'PENDING', operationId: id, code: null },
    { ...initial, installationRevision: 1, state: 'VERIFIED', code: null, verifiedAtUtc: 0 },
    { ...initial, installationRevision: 1, state: 'FAILED', code: 'TIMEOUT' },
    {
      ...initial,
      installationRevision: 1,
      state: 'OUTCOME_UNKNOWN',
      operationId: id,
      code: 'OUTCOME_UNKNOWN',
    },
  ];
  for (const s of states) {
    assert.ok(Object.isFrozen(snapshot(s)));
    const raw = runtimeVersionSuccess('p1', 'OBSERVED', s, id, 'AVAILABLE');
    assert.ok(parseRuntimeVersionResponse(raw));
    assert.equal(parseRuntimeVersionResponse(`${raw} `), null);
  }
  for (const s of [
    { ...states[1], installationRevision: null },
    { ...states[2], operationId: null },
    { ...states[3], operationId: id },
    { ...states[3], verifiedAtUtc: -0 },
    { ...states[4], code: 'BUSY' },
    { ...states[5], operationId: null },
  ])
    assert.equal(snapshot(s), null);
  assert.equal(runtimeVersionSuccess('p1', 'PENDING', states[3], id, 'AVAILABLE'), null);
  assert.equal(runtimeVersionSuccess('p1', 'OBSERVED', initial, null, 'AVAILABLE'), null);
  const error = JSON.parse(runtimeVersionError('bad-secret', 'BUSY', null, 'AVAILABLE'));
  assert.equal(error.requestId, null);
  assert.equal(error.code, 'INTERNAL_FAILURE');
  assert.equal(error.loggingHealth, 'DEGRADED');
});
