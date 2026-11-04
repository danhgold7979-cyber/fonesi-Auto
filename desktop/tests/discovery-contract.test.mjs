import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiscoveryRequest as parse,
  snapshotDiscoverySnapshot as snapshot,
  discoverySuccess,
  discoveryError,
  parseDiscoveryResponse,
} from '../src/discovery-contract.ts';
const id = '00000000-0000-4000-8000-000000000001';
const idle = {
  revision: 0,
  installationRevision: 1,
  state: 'IDLE',
  operationId: null,
  operation: null,
  lastOutcome: 'NONE',
  code: null,
  registryRevision: 2,
  observedAtUtc: null,
  restartRequired: false,
};
test('four exact bounded requests, no extra cleanup authority', () => {
  for (const method of ['get', 'stop', 'start', 'refresh']) {
    const q = {
      version: 1,
      requestId: 'p1',
      method: `discovery.${method}`,
      ...(['start', 'refresh'].includes(method) ? { expectedRevision: 0 } : {}),
      ...(method === 'start' ? { expectedInstallationRevision: 1 } : {}),
    };
    assert.equal(parse(JSON.stringify(q)).ok, true);
    assert.equal(parse(JSON.stringify({ ...q, path: '/private' })).ok, false);
  }
  assert.equal(
    parse('{"version":1,"requestId":"p1","method":"discovery.stop","method":"discovery.get"}').code,
    'INVALID_JSON',
  );
  assert.equal(parse(' '.repeat(16385)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(
    parse(JSON.stringify({ version: 2, requestId: 'p1', method: 'discovery.stop' })).code,
    'UNSUPPORTED_VERSION',
  );
});
test('exact state tuples distinguish known committed stale projection and cleanup', () => {
  for (const v of [
    idle,
    { ...idle, state: 'STARTING', operation: 'START', operationId: id, lastOutcome: 'PENDING' },
    {
      ...idle,
      state: 'READY',
      operation: 'REFRESH',
      operationId: id,
      lastOutcome: 'COMMITTED',
      observedAtUtc: 100,
    },
    {
      ...idle,
      state: 'FAILED',
      operation: 'REFRESH',
      operationId: id,
      lastOutcome: 'COMMITTED',
      code: 'OWNER_REVOKED',
      restartRequired: true,
    },
    {
      ...idle,
      state: 'STOPPED',
      operation: 'STOP',
      operationId: id,
      lastOutcome: 'CLEANUP_RETIRED',
    },
  ])
    assert.ok(snapshot(v));
  for (const v of [
    { ...idle, observedAtUtc: 1 },
    {
      ...idle,
      state: 'FAILED',
      operation: 'START',
      operationId: id,
      lastOutcome: 'NOT_COMMITTED',
      code: 'DEADLINE',
      restartRequired: true,
    },
    { ...idle, state: 'READY', operation: 'REFRESH', operationId: id, lastOutcome: 'COMMITTED' },
  ])
    assert.equal(snapshot(v), null);
  let calls = 0;
  assert.equal(
    snapshot({
      ...idle,
      get revision() {
        calls++;
        return 0;
      },
    }),
    null,
  );
  assert.equal(calls, 0);
});
test('canonical response no duplicate/private data and local null diagnostic degraded', () => {
  const raw = discoverySuccess('p1', 'OBSERVED', idle, id, 'AVAILABLE');
  assert.ok(parseDiscoveryResponse(raw));
  assert.equal(parseDiscoveryResponse(raw.replace('"version":1', '"version":1,"version":1')), null);
  assert.equal(discoverySuccess('p1', 'OBSERVED', idle, null, 'AVAILABLE'), null);
  assert.equal(
    JSON.parse(discoveryError('p1', 'TIMEOUT', null, 'DEGRADED', 'OUTCOME_UNKNOWN')).outcome,
    'OUTCOME_UNKNOWN',
  );
});
