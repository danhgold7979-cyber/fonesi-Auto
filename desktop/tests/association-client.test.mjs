import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssociationClient } from '../src/association-client.ts';
import { associationSuccess, associationError } from '../src/association-contract.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const idle = () => ({
  revision: 0,
  state: 'IDLE',
  operationId: null,
  code: 'OK',
  ceremonyId: null,
  mode: null,
  deviceId: null,
  stage: null,
  deadlineUtc: null,
  receipt: null,
  projectionCurrent: false,
  candidates: [],
  historical: [],
});
const pending = () => ({
  ...idle(),
  revision: 1,
  state: 'BASELINE_PENDING',
  operationId: id(1),
  mode: 'CURRENT',
  deviceId: id(3),
  stage: 'BASELINE',
});
const defer = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
function timer() {
  const callbacks = new Set();
  return {
    set(fn) {
      callbacks.add(fn);
      return fn;
    },
    clear(fn) {
      callbacks.delete(fn);
    },
    fire() {
      for (const f of [...callbacks]) f();
    },
  };
}
test('client scalar rejection occurs before serialization/invoke and no automatic phase advancement', async () => {
  let calls = 0,
    coerce = 0;
  const client = createAssociationClient(async (raw) => {
    calls++;
    const r = JSON.parse(raw);
    return associationSuccess(
      r.requestId,
      r.method === 'association.get' ? 'OBSERVED' : 'PENDING',
      r.method === 'association.get' ? idle() : pending(),
      id(9),
      'AVAILABLE',
    );
  });
  await client.get();
  const bad = {
    toJSON() {
      coerce++;
      throw Error('private');
    },
  };
  for (const r of [bad, -0, -1, Infinity])
    assert.equal(JSON.parse(await client.begin(r, id(4), 'CURRENT')).code, 'INVALID_SHAPE');
  assert.equal(coerce, 0);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await client.begin(0, id(4), 'CURRENT')).outcome, 'PENDING');
  await tick();
  assert.equal(calls, 2);
  assert.equal(JSON.parse(await client.removal(1, id(2))).code, 'SESSION_UNAVAILABLE');
  client.dispose();
});
test('timeout retains actual ordinary lease; Cancel is ordinary and permitted while request pending', async () => {
  const t = timer(),
    held = defer(),
    budget = createInvocationBudget();
  let calls = 0;
  const client = createAssociationClient(
    (raw) => {
      const r = JSON.parse(raw);
      calls++;
      if (r.method === 'association.get')
        return Promise.resolve(
          associationSuccess(r.requestId, 'OBSERVED', idle(), id(9), 'AVAILABLE'),
        );
      if (r.method === 'association.cancel')
        return Promise.resolve(
          associationSuccess(
            r.requestId,
            'SETTLED',
            { ...pending(), revision: 2, state: 'CANCELLED', code: 'CANCELLED' },
            id(9),
            'AVAILABLE',
          ),
        );
      return held.promise;
    },
    budget,
    t,
  );
  await client.get();
  await tick();
  const work = client.begin(0, id(4), 'CURRENT');
  t.fire();
  assert.equal(JSON.parse(await work).code, 'TIMEOUT');
  assert.equal(client.outstanding(), 1);
  assert.equal(JSON.parse(await client.cancel(1, id(1))).outcome, 'SETTLED');
  await tick();
  assert.equal(client.outstanding(), 1);
  held.resolve(associationSuccess('p2', 'PENDING', pending(), id(9), 'AVAILABLE'));
  await tick();
  assert.equal(client.outstanding(), 0);
  assert.equal(calls, 3);
  client.dispose();
});
test('old GET cannot rearm after newer effect/error or explicit invalidation', async () => {
  const old = defer();
  let count = 0;
  const client = createAssociationClient((raw) => {
    const r = JSON.parse(raw);
    count++;
    return count === 1
      ? old.promise
      : Promise.resolve(associationError(r.requestId, 'STALE_REVISION', id(9), 'AVAILABLE'));
  });
  const get = client.get();
  await client.cancel(1, id(1));
  old.resolve(associationSuccess('p1', 'OBSERVED', idle(), id(9), 'AVAILABLE'));
  await get;
  assert.equal(JSON.parse(await client.begin(0, id(4), 'CURRENT')).code, 'SESSION_UNAVAILABLE');
  assert.equal(count, 2);
  client.dispose();
});
test('seven ordinary invocations exhaust same shared budget while cleanup slot remains independent', async () => {
  const held = defer(),
    budget = createInvocationBudget(),
    client = createAssociationClient(() => held.promise, budget, timer());
  const leases = Array.from({ length: 6 }, () => budget.acquire());
  const get = client.get();
  assert.equal(JSON.parse(await client.candidates()).code, 'BUSY');
  const cleanup = budget.acquireCleanup();
  assert.ok(cleanup);
  assert.equal(budget.acquireCleanup(), null);
  client.dispose();
  assert.equal(JSON.parse(await get).code, 'SESSION_UNAVAILABLE');
  assert.equal(client.outstanding(), 1);
  held.resolve(null);
  await tick();
  assert.equal(client.outstanding(), 0);
  for (const l of leases) l.release();
  cleanup.release();
});
test('readiness timeout cancels deferred get and cannot invoke later', async () => {
  const ready = defer(),
    t = timer();
  let calls = 0,
    cancelled = 0;
  const client = createAssociationClient(
    () => {
      calls++;
      return Promise.resolve(null);
    },
    createInvocationBudget(),
    t,
    {
      wait: () => ({
        promise: ready.promise,
        cancel() {
          cancelled++;
        },
      }),
    },
  );
  const get = client.get();
  t.fire();
  assert.equal(JSON.parse(await get).code, 'TIMEOUT');
  ready.resolve(true);
  await tick();
  assert.equal(calls, 0);
  assert.equal(cancelled, 1);
  client.dispose();
});

test('client rejects a valid but wrong phase/mode response and never rearms after it', async () => {
  const client = createAssociationClient(async (raw) => {
    const r = JSON.parse(raw);
    return associationSuccess(
      r.requestId,
      r.method === 'association.get' ? 'OBSERVED' : 'PENDING',
      r.method === 'association.get' ? idle() : { ...pending(), mode: 'HISTORICAL' },
      id(9),
      'AVAILABLE',
    );
  });
  await client.get();
  assert.equal(JSON.parse(await client.begin(0, id(4), 'CURRENT')).code, 'INTERNAL_FAILURE');
  assert.equal(JSON.parse(await client.begin(0, id(4), 'CURRENT')).code, 'SESSION_UNAVAILABLE');
  client.dispose();
});

test('immediate reserved PENDING and preemptive CANCEL accept DEGRADED without fabricated diagnostic', async () => {
  let calls = 0;
  const client = createAssociationClient(async (raw) => {
    const r = JSON.parse(raw);
    calls++;
    if (r.method === 'association.get')
      return associationSuccess(r.requestId, 'OBSERVED', idle(), null, 'DEGRADED');
    if (r.method === 'association.begin')
      return associationSuccess(r.requestId, 'PENDING', pending(), null, 'DEGRADED');
    return associationSuccess(
      r.requestId,
      'SETTLED',
      { ...pending(), revision: 2, state: 'CANCELLED', code: 'CANCELLED' },
      null,
      'DEGRADED',
    );
  });
  await client.get();
  const ack = JSON.parse(await client.begin(0, id(4), 'CURRENT'));
  assert.equal(ack.outcome, 'PENDING');
  assert.equal(ack.snapshot.operationId, id(1));
  assert.equal(ack.diagnosticId, null);
  assert.equal(ack.loggingHealth, 'DEGRADED');
  const cancel = JSON.parse(await client.cancel(1, id(1)));
  assert.equal(cancel.snapshot.state, 'CANCELLED');
  assert.equal(cancel.diagnosticId, null);
  assert.equal(cancel.loggingHealth, 'DEGRADED');
  assert.equal(calls, 3);
  client.dispose();
});
