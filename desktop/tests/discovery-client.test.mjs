import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryClient } from '../src/discovery-client.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
import { discoverySuccess } from '../src/discovery-contract.ts';
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
function answer(w) {
  const q = JSON.parse(w);
  return discoverySuccess(
    q.requestId,
    q.method === 'discovery.get' ? 'OBSERVED' : 'PENDING',
    q.method === 'discovery.get'
      ? idle
      : {
          ...idle,
          state:
            q.method === 'discovery.start'
              ? 'STARTING'
              : q.method === 'discovery.refresh'
                ? 'REFRESHING'
                : 'STOPPING',
          operation: q.method.split('.')[1].toUpperCase(),
          operationId: id,
          lastOutcome: 'PENDING',
        },
    id,
    'AVAILABLE',
  );
}
const flush = () => new Promise((r) => setImmediate(r));
function timer() {
  const rows = new Set();
  return {
    set(fn) {
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
test('fresh read for ordinary effects; stop independently admitted and exact methods', async () => {
  const calls = [];
  const c = createDiscoveryClient(async (w) => {
    calls.push(w);
    return answer(w);
  });
  assert.equal(JSON.parse(await c.start(0, 1)).code, 'SESSION_UNAVAILABLE');
  await c.get();
  assert.equal(JSON.parse(await c.start(0, 1)).outcome, 'PENDING');
  assert.equal(JSON.parse(await c.refresh(1)).code, 'SESSION_UNAVAILABLE');
  assert.equal(JSON.parse(await c.stop()).outcome, 'PENDING');
  await flush();
  assert.equal(c.outstanding(), 0);
});
test('cleanup reserved within eight and repeated stop keeps actual transport lease after timeout', async () => {
  const b = createInvocationBudget(),
    leases = Array.from({ length: 7 }, () => b.acquire());
  assert.ok(leases.every(Boolean));
  let release,
    calls = 0;
  const t = timer();
  const c = createDiscoveryClient(
    (w) => {
      calls++;
      return new Promise((r) => {
        release = () => r(answer(w));
      });
    },
    b,
    t,
  );
  const p = c.stop();
  assert.equal(c.stop(), p);
  assert.equal(b.outstanding(), 8);
  t.expire();
  assert.equal(JSON.parse(await p).outcome, 'OUTCOME_UNKNOWN');
  assert.equal(c.stop(), p);
  assert.equal(calls, 1);
  assert.equal(b.outstanding(), 8);
  release();
  await flush();
  assert.equal(b.outstanding(), 7);
  for (const l of leases) l.release();
});
test('older read cannot rearm after newer stop timeout; explicit fresh read can', async () => {
  let old, stop;
  const t = timer();
  let count = 0;
  const c = createDiscoveryClient(
    (w) =>
      new Promise((r) => {
        if (++count === 1) old = () => r(answer(w));
        else stop = () => r(answer(w));
      }),
    undefined,
    t,
  );
  const read = c.get();
  const pending = c.stop();
  t.expire();
  await pending;
  old();
  await read;
  await flush();
  assert.equal(JSON.parse(await c.start(0, 1)).code, 'SESSION_UNAVAILABLE');
  stop();
  await flush();
});
test('closed readiness wait cannot late dispatch and wrong operation PENDING is rejected', async () => {
  let ready;
  let calls = 0,
    cancels = 0;
  const t = timer();
  const c = createDiscoveryClient(
    async (w) => {
      calls++;
      return answer(w);
    },
    undefined,
    t,
    {
      wait: () => ({
        promise: new Promise((r) => {
          ready = r;
        }),
        cancel: () => {
          cancels++;
        },
      }),
    },
  );
  const pending = c.get();
  t.expire();
  assert.equal(JSON.parse(await pending).code, 'TIMEOUT');
  ready(true);
  await flush();
  assert.equal(calls, 0);
  assert.equal(cancels, 1);
  assert.equal(c.outstanding(), 0);
  const wrong = createDiscoveryClient(async (w) =>
    JSON.parse(w).method === 'discovery.get'
      ? answer(w)
      : discoverySuccess(
          JSON.parse(w).requestId,
          'PENDING',
          {
            ...idle,
            state: 'STOPPING',
            operation: 'STOP',
            operationId: id,
            lastOutcome: 'PENDING',
          },
          id,
          'AVAILABLE',
        ),
  );
  await wrong.get();
  assert.equal(JSON.parse(await wrong.start(0, 1)).code, 'INTERNAL_FAILURE');
});
test('an old successful read after Stop invalidation cannot rearm ordinary requests', async () => {
  let release;
  let first = true;
  const c = createDiscoveryClient((w) => {
    if (first) {
      first = false;
      return new Promise((r) => {
        release = () => r(answer(w));
      });
    }
    return Promise.resolve(answer(w));
  });
  const old = c.get();
  await c.stop();
  release();
  await old;
  await flush();
  assert.equal(JSON.parse(await c.start(0, 1)).code, 'SESSION_UNAVAILABLE');
  await c.get();
  assert.equal(JSON.parse(await c.start(0, 1)).outcome, 'PENDING');
});
test('unknown revision scalars are rejected before serialization or user conversion hooks', async () => {
  let calls = 0,
    touched = 0;
  const c = createDiscoveryClient(async (w) => {
    calls++;
    return answer(w);
  });
  await c.get();
  const before = calls;
  const hostile = {
    get toJSON() {
      touched++;
      throw Error('PRIVATE_CANARY');
    },
    valueOf() {
      touched++;
      return 1;
    },
    toString() {
      touched++;
      return '1';
    },
  };
  const proxy = new Proxy(
    {},
    {
      get() {
        touched++;
        throw Error('PRIVATE_CANARY');
      },
    },
  );
  for (const value of [
    hostile,
    proxy,
    -0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    '1',
    null,
    1n,
    Symbol('private'),
  ]) {
    assert.equal(JSON.parse(await c.start(value, 1)).code, 'INVALID_SHAPE');
    assert.equal(JSON.parse(await c.refresh(value)).code, 'INVALID_SHAPE');
    assert.equal(JSON.parse(await c.start(0, value)).code, 'INVALID_SHAPE');
  }
  assert.equal(JSON.parse(await c.start(0, 0)).code, 'INVALID_SHAPE');
  assert.equal(touched, 0);
  assert.equal(calls, before);
  assert.equal(c.outstanding(), 0);
  assert.equal(JSON.parse(await c.start(0, 1)).outcome, 'PENDING');
});
