import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, parseDiagnosticRequest, publicResponse } from '../src/ipc-contract.ts';
import {
  diagnosticSuccess,
  diagnosticError,
  localDiagnosticError,
  validateDiagnosticResponse,
} from '../src/ipc-diagnostic-contract.ts';
const uuid = '00000000-0000-4000-8000-000000000001';
const request = (version = 2) => JSON.stringify({ version, requestId: 'r1', method: 'health.get' });
test('v1 unchanged and v2 explicit, never fallback negotiation', () => {
  assert.equal(parseRequest(request(1)).ok, true);
  assert.equal(parseDiagnosticRequest(request()).ok, true);
  assert.deepEqual(parseRequest(request()), { ok: false, code: 'UNSUPPORTED_VERSION' });
  assert.deepEqual(parseDiagnosticRequest(request(1)), { ok: false, code: 'UNSUPPORTED_VERSION' });
  assert.equal(
    publicResponse(parseRequest(request(1)).request),
    ' {"version":1,"ok":true,"requestId":"r1","result":{"kind":"health","status":"READY","services":"UNAVAILABLE"}}'.trim(),
  );
});
test('v2 retains exact request size and duplicate/escape/extra rejection', () => {
  for (const raw of [
    '{"version":1,"version":2,"requestId":"r1","method":"health.get"}',
    '{"version":2,"\\u0076ersion":2,"requestId":"r1","method":"health.get"}',
    request().replace('"version":2', '"version":2,"native":true'),
  ])
    assert.equal(parseDiagnosticRequest(raw).ok, false);
  assert.equal(parseDiagnosticRequest(' '.repeat(513)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(parseDiagnosticRequest('é'.repeat(257)).code, 'PAYLOAD_TOO_LARGE');
});
test('main v2 positive/error correlation retains exact canonical fields', () => {
  for (const method of ['health.get', 'settings.get'])
    for (const logging of ['AVAILABLE', 'DEGRADED']) {
      const wire = diagnosticSuccess('r1', method, uuid, logging);
      assert.equal(validateDiagnosticResponse(wire, 'r1', method), wire);
      assert.equal(JSON.parse(wire).diagnosticId, uuid);
      assert.ok(Buffer.byteLength(wire) <= 1024);
    }
  const wire = diagnosticError('INVALID_JSON', uuid, 'AVAILABLE');
  assert.equal(validateDiagnosticResponse(wire, 'r1', 'health.get'), wire);
});
test('native nullable references restricted; local errors never invent main IDs', () => {
  for (const code of [
    'UNTRUSTED_SENDER',
    'SESSION_UNAVAILABLE',
    'SESSION_REVOKED',
    'BUSY',
    'INTERNAL_FAILURE',
  ]) {
    const raw = diagnosticError(code, null, code === 'INTERNAL_FAILURE' ? 'DEGRADED' : 'AVAILABLE');
    assert.equal(validateDiagnosticResponse(raw, 'r1', 'health.get'), raw);
  }
  const local = localDiagnosticError('TIMEOUT');
  assert.deepEqual(JSON.parse(local), {
    version: 2,
    ok: false,
    diagnosticId: null,
    logging: 'DEGRADED',
    code: 'TIMEOUT',
  });
  assert.equal(validateDiagnosticResponse(local, 'r1', 'health.get'), null);
});
test('duplicate result/status and code fields, caller references, wrong versions reject', () => {
  const positive = diagnosticSuccess('r1', 'health.get', uuid, 'AVAILABLE');
  const negative = diagnosticError('INVALID_JSON', uuid, 'AVAILABLE');
  for (const raw of [
    positive.replace('"ok":true', '"ok":false,"ok":true'),
    positive.replace('"status":"READY"', '"status":"PRIVATE","status":"READY"'),
    negative.replace('"code":"INVALID_JSON"', '"code":"PRIVATE","code":"INVALID_JSON"'),
    positive.replace(uuid, 'caller-canary'),
    positive.replace('"version":2', '"version":1'),
    ' ' + positive,
    positive.replace('"requestId":"r1"', '"requestId":"r2"'),
    positive.replace('"logging":"AVAILABLE"', '"logging":"PRIVATE"'),
    positive.replace('"version":2', '"version":2,"stack":"PRIVATE"'),
  ])
    assert.equal(validateDiagnosticResponse(raw, 'r1', 'health.get'), null);
});
const { createDiagnosticClient } = await import('../src/preload-client.ts');
function clock() {
  const callbacks = new Set();
  return {
    timer: {
      set(fn, ms) {
        assert.equal(ms, 2000);
        callbacks.add(fn);
        return fn;
      },
      clear(fn) {
        callbacks.delete(fn);
      },
    },
    tick() {
      for (const fn of [...callbacks]) fn();
    },
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
test('v2 wrapper preserves Promise<string>, exact main references, no v1 fallback', async () => {
  const c = clock();
  let calls = 0;
  const client = createDiagnosticClient(async (raw) => {
    calls++;
    const parsed = parseDiagnosticRequest(raw);
    assert.equal(parsed.ok, true);
    return diagnosticError('INVALID_JSON', uuid, 'AVAILABLE');
  }, c.timer);
  assert.deepEqual(JSON.parse(await client.health()), {
    version: 2,
    ok: false,
    diagnosticId: uuid,
    logging: 'AVAILABLE',
    code: 'INVALID_JSON',
  });
  await settle();
  assert.equal(calls, 1);
  const wrong = createDiagnosticClient(
    async () => publicResponse(parseRequest(request(1)).request),
    c.timer,
  );
  assert.equal(await wrong.health(), localDiagnosticError('INTERNAL_FAILURE'));
});
test('v2 timeout/busy/disposal retain bounded native occupancy and discard late ID', async () => {
  const c = clock(),
    resolves = [];
  let calls = 0;
  const client = createDiagnosticClient((raw) => {
    calls++;
    return new Promise((resolve) =>
      resolves.push(() =>
        resolve(diagnosticSuccess(JSON.parse(raw).requestId, 'health.get', uuid, 'AVAILABLE')),
      ),
    );
  }, c.timer);
  const pending = Array.from({ length: 8 }, () => client.health());
  c.tick();
  const results = await Promise.all(pending);
  assert.ok(results.every((raw) => raw === localDiagnosticError('TIMEOUT')));
  assert.equal(client.outstanding(), 8);
  assert.equal(await client.settings(), localDiagnosticError('BUSY'));
  resolves[0]();
  await settle();
  assert.equal(client.outstanding(), 7);
  assert.equal(calls, 8);
  assert.ok(results.every((raw) => !raw.includes(uuid)));
  client.dispose();
  for (const done of resolves.slice(1)) done();
  await settle();
  assert.equal(client.outstanding(), 0);
  assert.equal(await client.health(), localDiagnosticError('SESSION_UNAVAILABLE'));
});

test('failed main ID allocation must be degraded and producer never coerces request IDs', () => {
  assert.equal(
    validateDiagnosticResponse(
      '{"version":2,"ok":false,"diagnosticId":null,"logging":"AVAILABLE","code":"INTERNAL_FAILURE"}',
      'r1',
      'health.get',
    ),
    null,
  );
  assert.equal(
    JSON.parse(diagnosticError('INTERNAL_FAILURE', null, 'AVAILABLE')).logging,
    'DEGRADED',
  );
  assert.equal(
    diagnosticSuccess(123, 'health.get', uuid, 'AVAILABLE'),
    localDiagnosticError('INTERNAL_FAILURE'),
  );
});
