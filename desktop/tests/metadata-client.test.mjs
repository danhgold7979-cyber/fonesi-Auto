import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetadataClient } from '../src/metadata-client.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
import { METADATA_FIELDS, metadataSuccess } from '../src/metadata-contract.ts';
const id = '00000000-0000-4000-8000-000000000001';
const op = '00000000-0000-4000-8000-000000000002';
const empty = {
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
};
function answer(w) {
  const q = JSON.parse(w);
  return metadataSuccess(
    q.requestId,
    q.method === 'metadata.get' ? 'OBSERVED' : 'PENDING',
    q.method === 'metadata.get'
      ? empty
      : {
          ...empty,
          revision: q.expectedRevision + 1,
          state: 'PENDING',
          deviceId: q.deviceId,
          registryRevision: q.expectedRegistryRevision,
          operationId: op,
          field: q.field,
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
      for (const f of [...rows]) f();
    },
  };
}
test('metadata one explicit field requires reconciliation and binds exact response target', async () => {
  const calls = [];
  const c = createMetadataClient(async (w) => {
    calls.push(JSON.parse(w));
    return answer(w);
  });
  assert.equal(JSON.parse(await c.read(id, 'MODEL', 0, 2)).code, 'SESSION_UNAVAILABLE');
  assert.equal(JSON.parse(await c.get()).outcome, 'OBSERVED');
  assert.equal(JSON.parse(await c.read(id, 'MODEL', 0, 2)).outcome, 'PENDING');
  assert.equal(JSON.parse(await c.read(id, 'SDK', 1, 2)).code, 'SESSION_UNAVAILABLE');
  assert.deepEqual(
    calls.map((q) => q.method),
    ['metadata.get', 'metadata.read'],
  );
  c.invalidateObservation();
  await c.get();
  assert.equal(JSON.parse(await c.read(id, 'SDK', 1, 2)).outcome, 'PENDING');
  await flush();
  assert.equal(c.outstanding(), 0);
});
test('every metadata scalar is validated before serialization without getter/toJSON/coercion', async () => {
  let calls = 0,
    touched = 0;
  const c = createMetadataClient(async (w) => {
    calls++;
    return answer(w);
  });
  await c.get();
  const bad = new Proxy(
    {},
    {
      get() {
        touched++;
        throw Error('PRIVATE');
      },
    },
  );
  for (const args of [
    [bad, 'MODEL', 0, 0],
    [id, bad, 0, 0],
    [id, 'MODEL', bad, 0],
    [id, 'MODEL', 0, bad],
    [id, 'MODEL', -0, 0],
    [id, 'MODEL', 0, -0],
    [id, 'MODEL', 1n, 0],
    [id, 'MODEL', 0, Infinity],
    [id, 'unknown', 0, 0],
  ])
    assert.equal(JSON.parse(await c.read(...args)).code, 'INVALID_SHAPE');
  assert.equal(touched, 0);
  assert.equal(calls, 1);
});
test('timeout retains actual ordinary lease, cleanup remains reserved, late reply never rearms', async () => {
  const b = createInvocationBudget(),
    t = timer();
  let release;
  let count = 0;
  const c = createMetadataClient(
    (w) => {
      if (++count === 1) return Promise.resolve(answer(w));
      return new Promise((r) => {
        release = () => r(answer(w));
      });
    },
    b,
    t,
  );
  await c.get();
  await flush();
  const pending = c.read(id, 'MODEL', 0, 2);
  t.expire();
  assert.equal(JSON.parse(await pending).outcome, 'OUTCOME_UNKNOWN');
  assert.equal(b.outstanding(), 1);
  const ordinary = Array.from({ length: 6 }, () => b.acquire());
  assert.ok(ordinary.every(Boolean));
  assert.equal(b.acquire(), null);
  const cleanup = b.acquireCleanup();
  assert.ok(cleanup);
  assert.equal(b.outstanding(), 8);
  release();
  await flush();
  assert.equal(JSON.parse(await c.read(id, 'MODEL', 0, 2)).code, 'SESSION_UNAVAILABLE');
  assert.equal(count, 2);
  ordinary.forEach((l) => {
    l.release();
  });
  cleanup.release();
});
test('older get cannot rearm after external invalidation and readiness timeout never late invokes', async () => {
  let release;
  const c = createMetadataClient(
    (w) =>
      new Promise((r) => {
        release = () => r(answer(w));
      }),
  );
  const old = c.get();
  c.invalidateObservation();
  release();
  await old;
  assert.equal(JSON.parse(await c.read(id, 'MODEL', 0, 2)).code, 'SESSION_UNAVAILABLE');
  let ready,
    calls = 0,
    cancel = 0;
  const t = timer();
  const d = createMetadataClient(
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
        cancel: () => cancel++,
      }),
    },
  );
  const waiting = d.get();
  t.expire();
  assert.equal(JSON.parse(await waiting).code, 'TIMEOUT');
  ready(true);
  await flush();
  assert.equal(calls, 0);
  assert.equal(cancel, 1);
  assert.equal(d.outstanding(), 0);
});
test('wrong PENDING device/field/projection and response ID fail closed without automatic retry', async () => {
  for (const change of [
    { deviceId: op },
    { field: 'SDK' },
    { registryRevision: 9 },
    { revision: 5 },
  ]) {
    const c = createMetadataClient(async (w) => {
      const a = JSON.parse(answer(w));
      if (a.outcome === 'PENDING') Object.assign(a.snapshot, change);
      return JSON.stringify(a);
    });
    await c.get();
    assert.equal(JSON.parse(await c.read(id, 'MODEL', 0, 2)).code, 'INTERNAL_FAILURE');
  }
  const c = createMetadataClient(async (w) => {
    const a = JSON.parse(answer(w));
    a.requestId = 'p999';
    return JSON.stringify(a);
  });
  assert.equal(JSON.parse(await c.get()).code, 'INTERNAL_FAILURE');
});
