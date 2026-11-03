import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verify } from '../scripts/verify-dependencies.mjs';
import { createInvocationBudget } from '../src/invocation-budget.ts';
verify(true, '11.9.0');
const require = createRequire(import.meta.url);
const { buildSync } = require('esbuild');
async function load(name) {
  const result = buildSync({
    entryPoints: [fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`
  );
}
const { createScheduleDraftClient } = await load('schedule-draft-client');
const { evaluateUnboundScheduleGapPreview } = await load('schedule-gap-contract');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = () => ({
  schedule: {
    version: 1,
    kind: 'CIVIL_RULE',
    startDate: '2024-01-01',
    endDate: null,
    maxOccurrences: null,
    rule: { kind: 'EVERY_N_DAYS', intervalDays: 1 },
    postsPerActiveDay: 2,
    slots: [
      { id: id(1), time: '09:00' },
      { id: id(2), time: '09:29' },
    ],
  },
  request: {
    version: 1,
    scope: { kind: 'UNBOUND_DRAFT', draftId: id(10), draftRevision: 0 },
    zone: 'Asia/Ho_Chi_Minh',
    fromDate: '2024-01-01',
    throughDate: '2024-01-01',
    limit: 128,
  },
});
const defer = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setImmediate(r));
const failure = (requestId, code) => JSON.stringify({ version: 1, ok: false, requestId, code });
const success = (wire) => {
  const r = JSON.parse(wire);
  const preview = evaluateUnboundScheduleGapPreview(r.schedule, r.request);
  assert.equal(preview.ok, true);
  return JSON.stringify({ version: 1, ok: true, requestId: r.requestId, preview });
};
function timer() {
  let callback = null;
  return {
    set(cb, ms) {
      assert.equal(ms, 2000);
      callback = cb;
      return 1;
    },
    clear() {
      callback = null;
    },
    fire() {
      const cb = callback;
      callback = null;
      cb?.();
    },
  };
}
test('explicit detached draft uses private request IDs and actual preview without identity bindings', async () => {
  const wires = [],
    ready = defer();
  const c = createScheduleDraftClient(
    async (wire) => {
      wires.push(wire);
      return success(wire);
    },
    undefined,
    undefined,
    { wait: () => ({ promise: ready.promise, cancel() {} }) },
  );
  assert.equal(wires.length, 0);
  const i = input(),
    p = c.preview(i);
  i.schedule.slots[0].time = '08:00';
  i.request.scope.draftRevision = 9;
  assert.equal(wires.length, 0);
  ready.resolve(true);
  const r = JSON.parse(await p);
  assert.equal(r.ok, true);
  assert.equal(r.preview.warnings.length, 1);
  assert.equal(r.preview.scope.draftRevision, 0);
  assert.equal(r.preview.preview.occurrences[0].time, '09:00');
  await tick();
  assert.equal(c.outstanding(), 0);
  assert.equal(JSON.parse(wires[0]).requestId, 'd1');
  assert.equal(JSON.parse(await c.preview(input())).requestId, 'd2');
  await tick();
  c.dispose();
});
test('closed invalid input refuses dispatch; shared budget and one pending slot bound work', async () => {
  const budget = createInvocationBudget(),
    native = defer();
  let calls = 0;
  const c = createScheduleDraftClient(
    () => {
      calls++;
      return native.promise;
    },
    budget,
    timer(),
  );
  for (const i of [
    null,
    {},
    { ...input(), deviceId: id(5) },
    { ...input(), request: { ...input().request, limit: 129 } },
  ])
    assert.equal(JSON.parse(await c.preview(i)).code, 'INVALID_SHAPE');
  assert.equal(calls, 0);
  const leases = Array.from({ length: 7 }, () => budget.acquire());
  assert.equal(JSON.parse(await c.preview(input())).code, 'BUSY');
  assert.equal(calls, 0);
  for (const lease of leases) lease.release();
  const p = c.preview(input());
  assert.equal(budget.outstanding(), 1);
  assert.equal(JSON.parse(await c.preview(input())).code, 'BUSY');
  assert.equal(calls, 1);
  native.resolve(failure('d1', 'UNSUPPORTED_ZONE'));
  assert.equal(JSON.parse(await p).code, 'UNSUPPORTED_ZONE');
  await tick();
  assert.equal(budget.outstanding(), 0);
});
for (const action of ['timeout', 'cancel', 'dispose'])
  test(`${action} suppresses late delivery and holds unsettled invoke lease and client slot`, async () => {
    const budget = createInvocationBudget(),
      native = defer(),
      t = timer();
    const c = createScheduleDraftClient(() => native.promise, budget, t),
      p = c.preview(input());
    if (action === 'timeout') t.fire();
    else c[action]();
    assert.equal(
      JSON.parse(await p).code,
      { timeout: 'TIMEOUT', cancel: 'CANCELLED', dispose: 'SESSION_UNAVAILABLE' }[action],
    );
    assert.equal(budget.outstanding(), 1);
    assert.equal(c.outstanding(), 1);
    assert.equal(
      JSON.parse(await c.preview(input())).code,
      action === 'dispose' ? 'SESSION_UNAVAILABLE' : 'BUSY',
    );
    native.resolve(failure('d1', 'UNSUPPORTED_ZONE'));
    await tick();
    assert.equal(budget.outstanding(), 0);
    assert.equal(c.outstanding(), 0);
  });
test('cancelled readiness releases without dispatch; no automatic retry on not-ready', async () => {
  let calls = 0,
    cancels = 0;
  const ready = defer(),
    budget = createInvocationBudget();
  const c = createScheduleDraftClient(
    async () => {
      calls++;
      return null;
    },
    budget,
    timer(),
    {
      wait: () => ({
        promise: ready.promise,
        cancel() {
          cancels++;
          ready.resolve(false);
        },
      }),
    },
  );
  const p = c.preview(input());
  c.cancel();
  assert.equal(JSON.parse(await p).code, 'CANCELLED');
  await tick();
  assert.equal(calls, 0);
  assert.equal(budget.outstanding(), 0);
  assert(cancels >= 1);
  assert.equal(JSON.parse(await c.preview(input())).code, 'SESSION_UNAVAILABLE');
  await tick();
  assert.equal(calls, 0);
  c.dispose();
});
test('native rejection, synchronous throw, readiness and timer throw return fixed diagnostics and release', async () => {
  const cases = [
    { invoke: () => Promise.reject(Error('PRIVATE')) },
    {
      invoke: () => {
        throw Error('PRIVATE');
      },
    },
    {
      invoke: async () => null,
      readiness: {
        wait() {
          throw Error('PRIVATE');
        },
      },
    },
    {
      invoke: async () => null,
      timer: {
        set() {
          throw Error('PRIVATE');
        },
        clear() {},
      },
    },
  ];
  for (const x of cases) {
    const budget = createInvocationBudget(),
      c = createScheduleDraftClient(x.invoke, budget, x.timer ?? timer(), x.readiness);
    const raw = await c.preview(input());
    assert.equal(JSON.parse(raw).code, 'INTERNAL_FAILURE');
    assert(!raw.includes('PRIVATE'));
    await tick();
    assert.equal(budget.outstanding(), 0);
    assert.equal(c.outstanding(), 0);
    c.dispose();
  }
});
test('request, revision, identity, zone and window mismatches fail closed without trusting extra response fields', async () => {
  const patches = [
    (r) => {
      r.requestId = 'd2';
    },
    (r) => {
      r.preview.scope.draftRevision = 1;
    },
    (r) => {
      r.preview.scope.draftId = id(99);
    },
    (r) => {
      r.preview.preview.zone = 'UTC';
    },
    (r) => {
      r.preview.window.limit = 127;
    },
    (r) => {
      r.preview.window.throughDate = '2024-01-02';
    },
    (r) => {
      r.private = 'PRIVATE';
    },
  ];
  for (const patch of patches) {
    const c = createScheduleDraftClient(
      async (wire) => {
        const r = JSON.parse(success(wire));
        patch(r);
        return JSON.stringify(r);
      },
      undefined,
      timer(),
    );
    assert.equal(JSON.parse(await c.preview(input())).code, 'INTERNAL_FAILURE');
    await tick();
    c.dispose();
  }
  for (const raw of [null, '{', failure('d2', 'BUSY')]) {
    const c = createScheduleDraftClient(async () => raw, undefined, timer());
    assert.equal(JSON.parse(await c.preview(input())).code, 'INTERNAL_FAILURE');
    await tick();
    c.dispose();
  }
});
test('uncorrelated pre-admission failures are accepted but successful responses always need a matching ID', async () => {
  const c = createScheduleDraftClient(
    async () => failure(null, 'UNTRUSTED_SENDER'),
    undefined,
    timer(),
  );
  assert.equal(JSON.parse(await c.preview(input())).code, 'UNTRUSTED_SENDER');
  await tick();
  c.dispose();
});

test('a synchronous deadline before native dispatch never invokes after cancellation', async () => {
  let calls = 0;
  const budget = createInvocationBudget(),
    t = {
      set(callback) {
        callback();
        return 1;
      },
      clear() {},
    };
  const c = createScheduleDraftClient(
    async () => {
      calls++;
      return null;
    },
    budget,
    t,
  );
  assert.equal(JSON.parse(await c.preview(input())).code, 'TIMEOUT');
  await tick();
  assert.equal(calls, 0);
  assert.equal(budget.outstanding(), 0);
  assert.equal(c.outstanding(), 0);
  c.dispose();
});
