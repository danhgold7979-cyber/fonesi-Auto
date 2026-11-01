import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeVersionClient } from '../src/runtime-version-client.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
import { runtimeVersionSuccess } from '../src/runtime-version-contract.ts';
const id = '00000000-0000-4000-8000-000000000001',
  state = {
    revision: 0,
    installationRevision: 1,
    state: 'IDLE',
    operationId: null,
    code: null,
    installTargetVersion: '37.0.1',
    activeVersion: '37.0.1',
    verifiedAtUtc: null,
  };
const flush = () => new Promise((r) => setImmediate(r));
function timer() {
  const rows = new Set();
  return {
    set(fn, ms) {
      assert.equal(ms, 2000);
      rows.add(fn);
      return fn;
    },
    clear(fn) {
      rows.delete(fn);
    },
    expire() {
      for (const fn of [...rows]) fn();
    },
  };
}
const answer = (wire, outcome = 'OBSERVED') =>
  runtimeVersionSuccess(
    JSON.parse(wire).requestId,
    outcome,
    outcome === 'PENDING'
      ? { ...state, revision: 1, state: 'PENDING', activeVersion: '37.0.1', operationId: id }
      : state,
    id,
    'AVAILABLE',
  );
test('explicit fresh read precedes each fixed verification request; no automatic effects', async () => {
  const wires = [];
  const c = createRuntimeVersionClient(async (w) => {
    wires.push(JSON.parse(w));
    return answer(w, JSON.parse(w).method === 'runtimeVersion.get' ? 'OBSERVED' : 'PENDING');
  });
  assert.equal(JSON.parse(await c.verifyVersion(0, 1)).code, 'SESSION_UNAVAILABLE');
  assert.equal(wires.length, 0);
  await c.readVersion();
  assert.equal(JSON.parse(await c.verifyVersion(0, 1)).outcome, 'PENDING');
  assert.deepEqual(wires[1], {
    version: 2,
    requestId: 'p2',
    method: 'runtimeVersion.request',
    expectedRevision: 0,
    expectedInstallationRevision: 1,
  });
  assert.equal(JSON.parse(await c.verifyVersion(1, 1)).code, 'SESSION_UNAVAILABLE');
  c.dispose();
});
test('shared eight unresolved slots stay occupied after timeout until actual settlement', async () => {
  const budget = createInvocationBudget(),
    t = timer(),
    pending = [];
  const c = createRuntimeVersionClient(
    (w) => new Promise((r) => pending.push(() => r(answer(w)))),
    budget,
    t,
  );
  const calls = Array.from({ length: 8 }, () => c.readVersion());
  assert.equal(JSON.parse(await c.readVersion()).code, 'BUSY');
  t.expire();
  for (const r of await Promise.all(calls)) assert.equal(JSON.parse(r).code, 'TIMEOUT');
  assert.equal(JSON.parse(await c.readVersion()).code, 'BUSY');
  for (const r of pending) r();
  await flush();
  assert.equal(c.outstanding(), 0);
  assert.equal(JSON.parse(await c.verifyVersion(0, 1)).code, 'SESSION_UNAVAILABLE');
  c.dispose();
});
test('late pre-request READ cannot restore readiness; wrong ID/outcome and invoke exceptions are fixed', async () => {
  let resolveOld;
  let count = 0;
  const c = createRuntimeVersionClient((w) => {
    count++;
    if (count === 2)
      return new Promise((r) => {
        resolveOld = () => r(answer(w));
      });
    return Promise.resolve(
      answer(w, JSON.parse(w).method === 'runtimeVersion.get' ? 'OBSERVED' : 'PENDING'),
    );
  });
  await c.readVersion();
  const old = c.readVersion();
  await c.verifyVersion(0, 1);
  resolveOld();
  await old;
  assert.equal(JSON.parse(await c.verifyVersion(1, 1)).code, 'SESSION_UNAVAILABLE');
  c.dispose();
  for (const invoke of [
    () => Promise.resolve(runtimeVersionSuccess('p99', 'OBSERVED', state, id, 'AVAILABLE')),
    () => Promise.resolve(answer('{"requestId":"p1"}', 'PENDING')),
    () => {
      throw Error('private-canary');
    },
  ]) {
    const x = createRuntimeVersionClient(invoke);
    const raw = await x.readVersion();
    assert.equal(JSON.parse(raw).code, 'INTERNAL_FAILURE');
    assert.equal(raw.includes('canary'), false);
    x.dispose();
  }
});
test('dispose invalidates generation and late reply but releases only settled promises', async () => {
  let settle;
  const c = createRuntimeVersionClient(
    (w) =>
      new Promise((r) => {
        settle = () => r(answer(w));
      }),
  );
  const p = c.readVersion();
  c.dispose();
  assert.equal(JSON.parse(await p).code, 'SESSION_UNAVAILABLE');
  assert.equal(c.outstanding(), 1);
  settle();
  await flush();
  assert.equal(c.outstanding(), 0);
});

test('untrusted revision values never invoke coercion or toJSON before request snapshot', async () => {
  let calls = 0,
    coerced = 0;
  const c = createRuntimeVersionClient(async (w) => {
    calls++;
    return answer(w);
  });
  await c.readVersion();
  const hostile = {
    toJSON() {
      coerced++;
      throw Error('private');
    },
  };
  assert.equal(JSON.parse(await c.verifyVersion(hostile, 1)).code, 'INVALID_SHAPE');
  assert.equal(JSON.parse(await c.verifyVersion(0, hostile)).code, 'INVALID_SHAPE');
  assert.equal(coerced, 0);
  assert.equal(calls, 1);
  c.dispose();
});

test('setup invalidation discards old read readiness and requires a fresh explicit read', async () => {
  let release;
  let calls = 0;
  const client = createRuntimeVersionClient((wire) => {
    calls++;
    if (calls === 1)
      return new Promise((r) => {
        release = () => r(answer(wire));
      });
    return Promise.resolve(answer(wire));
  });
  const old = client.readVersion();
  await flush();
  client.invalidateObservation();
  release();
  await old;
  await flush();
  assert.equal(JSON.parse(await client.verifyVersion(0, 1)).code, 'SESSION_UNAVAILABLE');
  assert.equal(calls, 1);
  await client.readVersion();
  assert.equal(JSON.parse(await client.verifyVersion(0, 1)).ok, false); // Transport returns OBSERVED for a mutation and remains fail-closed.
  assert.equal(calls, 3);
  client.dispose();
});
