import test from 'node:test';
import assert from 'node:assert/strict';
import { createInputInteractionClient } from '../src/input-interaction-client.ts';
import { inputInteractionSuccess } from '../src/input-interaction-contract.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
const id = '00000000-0000-4000-8000-000000000001';
const empty = {
  revision: 0,
  state: 'EMPTY',
  operationId: null,
  deviceId: null,
  generation: null,
  selectionRevision: null,
  registryRevision: null,
  action: null,
  deadlineUtc: null,
  receipt: null,
  code: null,
  current: false,
};
const answer = (w) => {
  const q = JSON.parse(w);
  return inputInteractionSuccess(
    q.requestId,
    q.method === 'input.get' ? 'STATUS' : 'PENDING',
    q.method === 'input.get'
      ? empty
      : {
          ...empty,
          revision: q.expectedRevision + 1,
          state: 'PENDING',
          operationId: id,
          deviceId: q.deviceId,
          generation: 1,
          selectionRevision: q.expectedSelectionRevision,
          registryRevision: q.expectedRegistryRevision,
          action: q.action,
          deadlineUtc: 1000,
        },
    'DEGRADED',
  );
};
const flush = () => new Promise((r) => setImmediate(r));
const timer = () => {
  const work = new Set();
  return {
    set: (f) => {
      work.add(f);
      return f;
    },
    clear: (f) => work.delete(f),
    expire: () => {
      for (const f of [...work]) f();
    },
  };
};
test('explicit input requires fresh status, validates scalars before serialization, binds every PENDING CAS', async () => {
  const calls = [];
  const c = createInputInteractionClient(async (w) => {
    calls.push(w);
    return answer(w);
  });
  assert.equal(JSON.parse(await c.press(0, 0, 2, id, 'HOME')).code, 'SESSION_UNAVAILABLE');
  assert.equal(JSON.parse(await c.get()).outcome, 'STATUS');
  let coerced = 0;
  const hostile = {
    toJSON() {
      coerced++;
      throw Error('PRIVATE');
    },
  };
  for (const args of [
    [hostile, 0, 2, id, 'HOME'],
    [0, hostile, 2, id, 'HOME'],
    [0, 0, hostile, id, 'HOME'],
    [0, 0, 2, hostile, 'HOME'],
    [0, 0, 2, id, hostile],
    [0, -0, 2, id, 'HOME'],
  ])
    assert.equal(JSON.parse(await c.press(...args)).code, 'INVALID_SHAPE');
  assert.equal(coerced, 0);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(await c.press(0, 0, 2, id, 'HOME')).outcome, 'PENDING');
  assert.equal(JSON.parse(await c.press(0, 0, 2, id, 'HOME')).code, 'SESSION_UNAVAILABLE');
  const forged = createInputInteractionClient(async (w) => {
    const q = JSON.parse(w);
    return answer(
      q.method === 'input.get' ? w : JSON.stringify({ ...q, expectedSelectionRevision: 99 }),
    );
  });
  await forged.get();
  assert.equal(JSON.parse(await forged.press(0, 0, 2, id, 'HOME')).code, 'INTERNAL_FAILURE');
});
test('timeout retains ordinary budget until actual invoke settles and late STATUS cannot rearm', async () => {
  const t = timer(),
    budget = createInvocationBudget();
  let finish;
  const c = createInputInteractionClient(
    (w) => new Promise((r) => (finish = () => r(answer(w)))),
    budget,
    t,
  );
  const get = c.get();
  t.expire();
  assert.equal(JSON.parse(await get).code, 'TIMEOUT');
  assert.equal(c.outstanding(), 1);
  finish();
  await flush();
  assert.equal(c.outstanding(), 0);
  assert.equal(JSON.parse(await c.press(0, 0, 2, id, 'HOME')).code, 'SESSION_UNAVAILABLE');
  const holds = Array.from({ length: 7 }, () => budget.acquire());
  assert.ok(holds.every(Boolean));
  assert.equal(JSON.parse(await c.get()).code, 'BUSY');
  const stop = budget.acquireCleanup();
  assert.ok(stop);
  stop.release();
  holds.forEach((h) => {
    h.release();
  });
});
test('invalidation while STATUS waits denies rearm; disposal retains actual pending invoke', async () => {
  let finish;
  const c = createInputInteractionClient((w) => new Promise((r) => (finish = () => r(answer(w)))));
  const p = c.get();
  c.invalidateObservation();
  finish();
  await p;
  assert.equal(JSON.parse(await c.press(0, 0, 2, id, 'HOME')).code, 'SESSION_UNAVAILABLE');
  const p2 = c.get();
  c.dispose();
  assert.equal(JSON.parse(await p2).code, 'SESSION_UNAVAILABLE');
  assert.equal(c.outstanding(), 1);
  finish();
  await flush();
  assert.equal(c.outstanding(), 0);
});
