import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceActor, createDeviceQueueBudget } from '../src/main/device-actor.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const target = Object.freeze({
  deviceId: id(1),
  bindingId: id(2),
  generation: 0,
  serial: 'synthetic-device',
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const success = () => ({
  status: 'SUCCESS',
  exitCode: 0,
  retired: true,
  truncated: false,
  stdout: 'verified',
});
function fixture(overrides = {}) {
  let count = 0;
  const budget = overrides.budget ?? createDeviceQueueBudget();
  const actor = createDeviceActor({
    binding: target,
    budget,
    now: Date.now,
    assertOwned: () => true,
    current: () => true,
    binaryAvailable: () => true,
    dispatch: async () => {
      count++;
      return success();
    },
    observe: (_r, s) => s === 'verified',
    ...overrides,
  });
  const cap = actor.acquire(id(3));
  const req = (n = 10, extra = {}) => ({
    version: 1,
    commandId: id(n),
    correlationId: id(n + 10000),
    ...target,
    ownerId: id(3),
    operation: 'MODEL',
    deadlineUtc: Date.now() + 10000,
    ...extra,
  });
  return { actor, cap, req, budget, count: () => count };
}
test('actor admits only exact current binding and owner capability; invalid data never echoed', async () => {
  const f = fixture();
  assert.equal((await f.actor.execute({ ownerId: id(3) }, f.req())).code, 'OWNER_REVOKED');
  assert.equal((await f.actor.execute(f.cap, f.req(11, { generation: 1 }))).code, 'STALE_BINDING');
  let invoked = false;
  const bad = { ...f.req() };
  Object.defineProperty(bad, 'serial', {
    get() {
      invoked = true;
      throw Error('private');
    },
    enumerable: true,
  });
  assert.deepEqual(await f.actor.execute(f.cap, bad), {
    outcome: 'NOT_DISPATCHED',
    code: 'INVALID_REQUEST',
    commandId: null,
    correlationId: null,
    diagnosticId: null,
  });
  assert.equal(invoked, false);
  assert.equal(f.count(), 0);
  assert.equal((await f.actor.execute(f.cap, f.req())).outcome, 'OBSERVED');
});
test('actor serializes metadata operations and snapshots caller input', async () => {
  const pending = [];
  const seen = [];
  const f = fixture({
    dispatch: (r) => {
      seen.push(r);
      const d = deferred();
      pending.push(d);
      return d.promise;
    },
  });
  const raw = f.req();
  const first = f.actor.execute(f.cap, raw);
  raw.serial = 'mutated';
  const second = f.actor.execute(f.cap, f.req(11));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].serial, target.serial);
  assert.ok(Object.isFrozen(seen[0]));
  pending[0].resolve(success());
  assert.equal((await first).outcome, 'OBSERVED');
  await Promise.resolve();
  assert.equal(seen.length, 2);
  pending[1].resolve(success());
  await second;
  assert.equal(f.budget.pending(), 0);
});
test('queued cancel is not dispatch and active cancel does not claim undo', async () => {
  const d = deferred();
  let calls = 0;
  const f = fixture({
    dispatch: () => {
      calls++;
      return d.promise;
    },
  });
  const first = f.actor.execute(f.cap, f.req());
  const second = f.actor.execute(f.cap, f.req(11));
  assert.equal(f.actor.cancel(f.cap, id(10)), false);
  assert.equal(f.actor.cancel(f.cap, id(11)), true);
  assert.equal((await second).code, 'CANCELLED');
  assert.equal(calls, 1);
  d.resolve(success());
  await first;
});
test('per-actor queue and shared global reservation limits reject before dispatch', async () => {
  const d = deferred();
  const f = fixture({ dispatch: () => d.promise });
  const promises = [f.actor.execute(f.cap, f.req())];
  for (let i = 0; i < 64; i++) promises.push(f.actor.execute(f.cap, f.req(i + 20)));
  assert.equal((await f.actor.execute(f.cap, f.req(100))).code, 'BUSY');
  assert.equal((await f.actor.execute(f.cap, f.req())).code, 'BUSY');
  for (let i = 0; i < 64; i++) f.actor.cancel(f.cap, id(i + 20));
  d.resolve(success());
  await Promise.all(promises);
  const budget = createDeviceQueueBudget();
  const reservations = [];
  for (let i = 0; i < 1024; i++) reservations.push(budget.reserve());
  const g = fixture({ budget });
  assert.equal((await g.actor.execute(g.cap, g.req())).code, 'BUSY');
  assert.equal(g.count(), 0);
  reservations.forEach((x) => {
    budget.release(x);
  });
  assert.equal(budget.pending(), 0);
});
test('independent actors progress without crossing bindings or queues', async () => {
  const d = deferred();
  const a = fixture({ dispatch: () => d.promise });
  const b = fixture();
  const first = a.actor.execute(a.cap, a.req());
  assert.equal((await b.actor.execute(b.cap, b.req())).outcome, 'OBSERVED');
  assert.equal(a.actor.snapshot().active, true);
  d.resolve(success());
  await first;
});
test('current binding rechecked after dispatch and again after observation callback', async () => {
  let current = true;
  const d = deferred();
  const f = fixture({ current: () => current, dispatch: () => d.promise });
  const done = f.actor.execute(f.cap, f.req());
  current = false;
  d.resolve(success());
  assert.equal((await done).code, 'STALE_BINDING');
  let valid = true;
  const g = fixture({
    current: () => valid,
    observe: () => {
      valid = false;
      return true;
    },
  });
  assert.equal((await g.actor.execute(g.cap, g.req())).code, 'STALE_BINDING');
});
test('binary unavailable and expired requests never dispatch', async () => {
  const f = fixture({ binaryAvailable: () => false });
  assert.equal((await f.actor.execute(f.cap, f.req())).code, 'BINARY_UNAVAILABLE');
  assert.equal(f.count(), 0);
  const g = fixture();
  assert.equal(
    (await g.actor.execute(g.cap, g.req(10, { deadlineUtc: 0 }))).code,
    'DEADLINE_EXCEEDED',
  );
  assert.equal(g.count(), 0);
});
test('exit zero is not observed state; malformed or unretired result latches uncertainty', async () => {
  const f = fixture({ observe: () => false });
  assert.equal((await f.actor.execute(f.cap, f.req())).code, 'OBSERVATION_REJECTED');
  const g = fixture({ dispatch: async () => ({ ...success(), retired: false }) });
  assert.equal((await g.actor.execute(g.cap, g.req())).outcome, 'OUTCOME_UNKNOWN');
  assert.equal((await g.actor.execute(g.cap, g.req(11))).code, 'OUTCOME_UNKNOWN');
  assert.equal(await g.actor.shutdown(), false);
});
test('deadline returns uncertainty, bounded shutdown and no late success or replay', async () => {
  const d = deferred();
  let calls = 0;
  const f = fixture({
    now: () => 1000,
    dispatch: () => {
      calls++;
      return d.promise;
    },
  });
  const first = f.actor.execute(f.cap, f.req(10, { deadlineUtc: 1025 }));
  const queued = f.actor.execute(f.cap, f.req(11, { deadlineUtc: 2000 }));
  const shutdown = f.actor.shutdown();
  assert.equal((await first).outcome, 'OUTCOME_UNKNOWN');
  assert.equal((await queued).code, 'CLOSED');
  assert.equal(await shutdown, false);
  assert.equal(calls, 1);
  assert.equal(f.actor.snapshot().active, true);
  d.resolve(success());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(f.actor.snapshot().uncertain, true);
});
test('explicit takeover drains then requires a new capability; revoke denies final result', async () => {
  const d = deferred();
  const f = fixture({ dispatch: () => d.promise });
  const first = f.actor.execute(f.cap, f.req());
  const queued = f.actor.execute(f.cap, f.req(11));
  const takeover = f.actor.takeover(f.cap);
  assert.equal((await queued).code, 'CANCELLED');
  assert.equal(f.actor.acquire(id(4)), null);
  d.resolve(success());
  assert.equal((await first).code, 'OWNER_REVOKED');
  assert.equal(await takeover, true);
  const next = f.actor.acquire(id(4));
  assert.ok(next);
  assert.equal((await f.actor.execute(f.cap, f.req(12))).code, 'OWNER_REVOKED');
  const e = deferred();
  const g = fixture({ dispatch: () => e.promise });
  const job = g.actor.execute(g.cap, g.req());
  g.actor.revoke(g.cap);
  e.resolve(success());
  assert.equal((await job).code, 'OWNER_REVOKED');
});
test('transport throws are uncertain and callback references are captured', async () => {
  const f = fixture({
    dispatch: async () => {
      throw Error('private raw content');
    },
  });
  assert.equal((await f.actor.execute(f.cap, f.req())).code, 'OUTCOME_UNKNOWN');
  const options = {
    binding: target,
    budget: createDeviceQueueBudget(),
    now: Date.now,
    assertOwned: () => true,
    current: () => true,
    binaryAvailable: () => false,
    dispatch: async () => success(),
    observe: () => true,
  };
  const actor = createDeviceActor(options);
  const cap = actor.acquire(id(3));
  options.binaryAvailable = () => true;
  assert.equal((await actor.execute(cap, fixture().req())).code, 'BINARY_UNAVAILABLE');
});
test('reentrant admission revocation and backwards clock cannot dispatch', async () => {
  let revoke = false;
  let actor;
  let cap;
  let calls = 0;
  actor = createDeviceActor({
    binding: target,
    budget: createDeviceQueueBudget(),
    now: Date.now,
    assertOwned: () => true,
    current: () => true,
    binaryAvailable: () => {
      if (revoke) actor.revoke(cap);
      return true;
    },
    dispatch: async () => {
      calls++;
      return success();
    },
    observe: () => true,
  });
  cap = actor.acquire(id(3));
  revoke = true;
  assert.equal((await actor.execute(cap, fixture().req())).code, 'OWNER_REVOKED');
  assert.equal(calls, 0);
  let time = 100;
  const f = fixture({ now: () => time });
  await f.actor.execute(f.cap, f.req(10, { deadlineUtc: 1000 }));
  time = 99;
  assert.equal((await f.actor.execute(f.cap, f.req(11))).code, 'OWNER_REVOKED');
  assert.equal(f.count(), 1);
});
test('shared actor domain refuses a second actor for same device until clean shutdown', async () => {
  const budget = createDeviceQueueBudget();
  const f = fixture({ budget });
  assert.throws(() => fixture({ budget }), /ACTOR_ALREADY_OWNED/);
  assert.equal(await f.actor.shutdown(), true);
  assert.ok(fixture({ budget }).cap);
});
test('null capability before acquire and last-clock revocation cannot dispatch', async () => {
  const options = {
    binding: target,
    budget: createDeviceQueueBudget(),
    now: Date.now,
    assertOwned: () => true,
    current: () => true,
    binaryAvailable: () => true,
    dispatch: async () => success(),
    observe: () => true,
  };
  const fresh = createDeviceActor(options);
  assert.equal((await fresh.execute(null, fixture().req())).code, 'OWNER_REVOKED');
  let reads = 0,
    calls = 0,
    actor,
    cap;
  actor = createDeviceActor({
    ...options,
    budget: createDeviceQueueBudget(),
    now: () => {
      if (++reads === 3) actor.revoke(cap);
      return Date.now();
    },
    dispatch: async () => {
      calls++;
      return success();
    },
  });
  cap = actor.acquire(id(3));
  assert.equal((await actor.execute(cap, fixture().req())).outcome, 'NOT_DISPATCHED');
  assert.equal(calls, 0);
});
test('exact request rejects negative zero and aliased command correlation IDs', async () => {
  const f = fixture();
  for (const extra of [{ generation: -0 }, { deadlineUtc: -0 }, { correlationId: id(10) }])
    assert.equal((await f.actor.execute(f.cap, f.req(10, extra))).code, 'INVALID_REQUEST');
  assert.equal(f.count(), 0);
  const result = await f.actor.execute(f.cap, f.req());
  assert.equal(result.diagnosticId, null);
});
test('actor rejects deadlines beyond120 seconds and does not let microtasks outrun effective deadline', async () => {
  let time = 1000;
  const f = fixture({ now: () => time });
  assert.equal(
    (await f.actor.execute(f.cap, f.req(10, { deadlineUtc: 121001 }))).code,
    'DEADLINE_EXCEEDED',
  );
  assert.equal(f.count(), 0);
  const g = fixture({
    now: () => time,
    dispatch: async () => {
      time = 121001;
      return success();
    },
  });
  assert.equal(
    (await g.actor.execute(g.cap, g.req(11, { deadlineUtc: 121000 }))).code,
    'DEADLINE_EXCEEDED',
  );
});

test('input queue fences rotation epochs before dispatch and after retirement; no exit-only effect success', async () => {
  let display = {
    version: 1,
    evidenceId: id(500),
    ...target,
    displayId: 0,
    width: 1080,
    height: 1920,
    rotation: 0,
    orientationEpoch: 1,
    observedUtc: 900,
    validUntilUtc: 9000,
    source: 'SYNTHETIC_TEST',
  };
  const first = deferred();
  let calls = 0;
  const f = fixture({
    now: () => 1000,
    currentDisplay: () => display,
    dispatch: () => {
      calls++;
      return first.promise;
    },
    observe: () => false,
  });
  const input = (n) =>
    f.req(n, { version: 2, deadlineUtc: 5000, operation: { kind: 'TAP', x: 0, y: 0 }, display });
  const active = f.actor.execute(f.cap, input(600));
  const queued = f.actor.execute(f.cap, input(601));
  display = { ...display, orientationEpoch: 3 }; // Rotate away and back: dimensions unchanged.
  first.resolve(success());
  assert.equal((await active).code, 'STALE_DISPLAY');
  assert.deepEqual([(await queued).code, calls], ['STALE_DISPLAY', 1]);
  assert.equal(await f.actor.shutdown(), true);
  const fresh = fixture({ now: () => 1000, currentDisplay: () => display, observe: () => false });
  const denied = await fresh.actor.execute(
    fresh.cap,
    fresh.req(602, {
      version: 2,
      deadlineUtc: 5000,
      operation: { kind: 'TAP', x: 1, y: 1 },
      display,
    }),
  );
  assert.equal(denied.outcome, 'DISPATCHED_UNCONFIRMED');
  assert.equal(denied.code, 'OBSERVATION_REJECTED');
});

test('input has no default display authority or Unicode fallback; owner revocation cannot dispatch', async () => {
  const f = fixture({ now: () => 1000 });
  const display = {
    version: 1,
    evidenceId: id(500),
    ...target,
    displayId: 0,
    width: 1080,
    height: 1920,
    rotation: 0,
    orientationEpoch: 1,
    observedUtc: 900,
    validUntilUtc: 9000,
    source: 'SYNTHETIC_TEST',
  };
  const tap = f.req(700, {
    version: 2,
    deadlineUtc: 5000,
    operation: { kind: 'TAP', x: 0, y: 0 },
    display,
  });
  assert.equal((await f.actor.execute(f.cap, tap)).code, 'STALE_DISPLAY');
  const text = f.req(701, {
    version: 2,
    deadlineUtc: 5000,
    operation: { kind: 'TEXT', text: 'Tiếng Việt 🔒' },
    display: null,
  });
  assert.equal((await f.actor.execute(f.cap, text)).code, 'UNICODE_UNAVAILABLE');
  assert.equal(f.count(), 0);
  let revoke;
  const g = fixture({
    now: () => 1000,
    currentDisplay: () => {
      revoke();
      return display;
    },
  });
  revoke = () => g.actor.revoke(g.cap);
  assert.equal((await g.actor.execute(g.cap, tap)).code, 'OWNER_REVOKED');
  assert.equal(g.count(), 0);
});

test('completed swipe does not reserve its duration twice; actual expiry remains unconfirmed', async () => {
  for (const completedAt of [1400, 1600]) {
    let time = 1000;
    const display = {
      version: 1,
      evidenceId: id(800),
      ...target,
      displayId: 0,
      width: 100,
      height: 200,
      rotation: 0,
      orientationEpoch: 1,
      observedUtc: 900,
      validUntilUtc: 2000,
      source: 'SYNTHETIC_TEST',
    };
    const f = fixture({
      now: () => time,
      currentDisplay: () => display,
      dispatch: async () => {
        time = completedAt;
        return success();
      },
    });
    const r = await f.actor.execute(
      f.cap,
      f.req(801, {
        version: 2,
        deadlineUtc: 1600,
        display,
        operation: { kind: 'SWIPE', x1: 0, y1: 0, x2: 90, y2: 190, durationMs: 400 },
      }),
    );
    assert.equal(r.outcome, completedAt === 1400 ? 'OBSERVED' : 'DISPATCHED_UNCONFIRMED');
    assert.equal(r.code, completedAt === 1400 ? 'OK' : 'DEADLINE_EXCEEDED');
  }
});

test('display callback cannot retire the registry binding and still dispatch or release success', async () => {
  const display = {
    version: 1,
    evidenceId: id(900),
    ...target,
    displayId: 0,
    width: 100,
    height: 200,
    rotation: 0,
    orientationEpoch: 1,
    observedUtc: 900,
    validUntilUtc: 9000,
    source: 'SYNTHETIC_TEST',
  };
  for (const retireAt of [1, 3, 4, 5]) {
    let current = true,
      reads = 0,
      dispatches = 0;
    const f = fixture({
      now: () => 1000,
      current: () => current,
      currentDisplay: () => {
        if (++reads === retireAt) current = false;
        return display;
      },
      dispatch: async () => {
        dispatches++;
        return success();
      },
    });
    const r = await f.actor.execute(
      f.cap,
      f.req(901, {
        version: 2,
        deadlineUtc: 5000,
        display,
        operation: { kind: 'TAP', x: 1, y: 1 },
      }),
    );
    assert.equal(r.code, 'STALE_BINDING');
    assert.equal(dispatches, retireAt >= 4 ? 1 : 0);
    assert.equal(r.outcome, retireAt >= 4 ? 'DISPATCHED_UNCONFIRMED' : 'NOT_DISPATCHED');
  }
});
const queryFacts = (extra = {}) =>
  Object.freeze({
    version: 1,
    kind: 'METADATA_QUERY',
    status: 'COMPLETE',
    code: 'OK',
    dispatched: true,
    operationRetired: true,
    stdoutBase64: Buffer.from('Synthetic\n').toString('base64'),
    stderrBase64: '',
    remoteExitCode: 0,
    observedAtUtc: Date.now(),
    ...extra,
  });
const queryRequest = (f, n = 500, extra = {}) => {
  const old = f.req(n);
  delete old.operation;
  return { ...old, version: 3, kind: 'METADATA_QUERY', transportId: '7', field: 'MODEL', ...extra };
};
const queryHandle = (
  facts = queryFacts(),
  retirement = Promise.resolve(Object.freeze({ status: 'RETIRED' })),
  handoff = 'QUERY',
) => Object.freeze({ handoff, result: Promise.resolve(facts), retirement });
test('v3 uses honest query facts and immutable transport pair, never process dispatcher', async () => {
  let calls = 0;
  const f = fixture({
    metadata: {
      transportId: '7',
      localBusy: () => false,
      dispatch: () => {
        calls++;
        return queryHandle();
      },
      observe: () => true,
      finalCurrent: () => true,
    },
  });
  assert.equal(
    (await f.actor.execute(f.cap, queryRequest(f, 500, { transportId: '8' }))).code,
    'STALE_BINDING',
  );
  assert.equal(calls, 0);
  assert.equal((await f.actor.execute(f.cap, queryRequest(f))).outcome, 'OBSERVED');
  assert.equal(calls, 1);
  assert.equal(f.count(), 0);
  assert.equal(await f.actor.shutdown(), true);
});
test('v3 snapshots result at its own settlement and awaits separate retirement', async () => {
  const retire = deferred();
  const raw = { ...queryFacts() };
  let seen;
  const f = fixture({
    metadata: {
      transportId: '7',
      localBusy: () => false,
      dispatch: () => {
        raw.observedAtUtc = Date.now();
        return queryHandle(raw, retire.promise);
      },
      observe: (_r, v) => {
        seen = v;
        return true;
      },
      finalCurrent: () => true,
    },
  });
  let done = false;
  const pending = f.actor.execute(f.cap, queryRequest(f)).then((r) => {
    done = true;
    return r;
  });
  await new Promise((r) => setImmediate(r));
  raw.remoteExitCode = 9;
  assert.equal(done, false);
  assert.equal(f.budget.pending(), 1);
  retire.resolve({ status: 'RETIRED' });
  assert.equal((await pending).outcome, 'OBSERVED');
  assert.equal(seen.remoteExitCode, 0);
  await f.actor.shutdown();
});
test('v3 timeout returns promptly but retains real query and shared reservation until settlement', async () => {
  const facts = deferred(),
    retire = deferred();
  let dispatched = 0;
  const f = fixture({
    now: () => 1000,
    metadata: {
      transportId: '7',
      localBusy: () => false,
      dispatch: () => {
        dispatched++;
        return { handoff: 'QUERY', result: facts.promise, retirement: retire.promise };
      },
      observe: () => true,
      finalCurrent: () => true,
    },
  });
  const result = await f.actor.execute(f.cap, queryRequest(f, 500, { deadlineUtc: 1020 }));
  assert.equal(dispatched, 1);
  assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(f.actor.snapshot().active, true);
  assert.equal(f.budget.pending(), 1);
  assert.equal(await f.actor.shutdown(), false);
  facts.resolve(queryFacts({ observedAtUtc: 1000 }));
  retire.resolve({ status: 'RETIRED' });
  await new Promise((r) => setImmediate(r));
  assert.equal(f.budget.pending(), 0);
  assert.equal(f.actor.snapshot().uncertain, true);
});
test('v3 local refusal stays undispatched; malformed local and hostile attachment retain uncertainty', async () => {
  const failure = {
    version: 1,
    kind: 'METADATA_QUERY',
    status: 'FAILED',
    code: 'BUSY',
    dispatched: false,
    operationRetired: true,
    stdoutBase64: null,
    stderrBase64: null,
    remoteExitCode: null,
    observedAtUtc: null,
  };
  const good = fixture({
    metadata: {
      transportId: '7',
      localBusy: () => false,
      dispatch: () => queryHandle(failure, undefined, 'LOCAL_REFUSAL'),
      observe: () => true,
      finalCurrent: () => true,
    },
  });
  assert.equal((await good.actor.execute(good.cap, queryRequest(good))).code, 'BUSY');
  assert.equal(await good.actor.shutdown(), true);
  for (const broken of ['local', 'promise']) {
    const p = Promise.resolve(queryFacts());
    if (broken === 'promise')
      Object.defineProperty(p, 'then', {
        get() {
          throw Error('private');
        },
      });
    const f = fixture({
      metadata: {
        transportId: '7',
        localBusy: () => false,
        dispatch: () => ({
          handoff: broken === 'local' ? 'LOCAL_REFUSAL' : 'QUERY',
          result: p,
          retirement: Promise.resolve({ status: 'RETIRED' }),
        }),
        observe: () => true,
        finalCurrent: () => true,
      },
    });
    assert.equal((await f.actor.execute(f.cap, queryRequest(f))).outcome, 'OUTCOME_UNKNOWN');
    assert.equal(await f.actor.shutdown(), false);
    assert.equal(f.budget.pending(), 1);
  }
});
test('v3 remote failure and last observer custody invalidation never publish success', async () => {
  for (const mode of ['exit', 'stderr', 'revoke']) {
    let valid = true;
    const f = fixture({
      metadata: {
        transportId: '7',
        localBusy: () => false,
        dispatch: () =>
          queryHandle(
            queryFacts(
              mode === 'exit'
                ? { remoteExitCode: 1 }
                : mode === 'stderr'
                  ? { stderrBase64: Buffer.from('error').toString('base64') }
                  : {},
            ),
          ),
        observe: () => {
          if (mode === 'revoke') valid = false;
          return true;
        },
        finalCurrent: () => valid,
      },
    });
    assert.notEqual((await f.actor.execute(f.cap, queryRequest(f))).outcome, 'OBSERVED');
    await f.actor.shutdown();
  }
});
test('v3 localBusy refuses before inspection-sensitive current and never weakens OBSERVE fence', async () => {
  let busy = true,
    valid = false,
    calls = 0;
  const f = fixture({
    current: () => {
      if (busy) throw Error('inspection');
      return true;
    },
    metadata: {
      transportId: '7',
      localBusy: () => busy,
      finalCurrent: () => valid,
      dispatch: () => {
        calls++;
        return queryHandle();
      },
      observe: () => true,
    },
  });
  assert.equal((await f.actor.execute(f.cap, queryRequest(f))).code, 'BUSY');
  assert.equal(calls, 0);
  busy = false;
  valid = true;
  assert.equal((await f.actor.execute(f.cap, queryRequest(f, 501))).outcome, 'OBSERVED');
  await f.actor.shutdown();
  const retired = deferred();
  let observedBusy = false;
  const g = fixture({
    metadata: {
      transportId: '7',
      localBusy: () => observedBusy,
      finalCurrent: () => !observedBusy,
      dispatch: () => queryHandle(queryFacts(), retired.promise),
      observe: () => true,
    },
  });
  const pending = g.actor.execute(g.cap, queryRequest(g));
  observedBusy = true;
  retired.resolve({ status: 'RETIRED' });
  assert.notEqual((await pending).outcome, 'OBSERVED');
  await g.actor.shutdown();
});
test('v3 retired socket without remote completion is sticky unknown after actual dispatched failure', async () => {
  const failed = {
    version: 1,
    kind: 'METADATA_QUERY',
    status: 'FAILED',
    code: 'NATIVE_FAILED',
    dispatched: true,
    operationRetired: true,
    stdoutBase64: null,
    stderrBase64: null,
    remoteExitCode: null,
    observedAtUtc: null,
  };
  const f = fixture({
    metadata: {
      transportId: '7',
      localBusy: () => false,
      dispatch: () => queryHandle(failed),
      observe: () => true,
      finalCurrent: () => true,
    },
  });
  assert.equal((await f.actor.execute(f.cap, queryRequest(f))).outcome, 'OUTCOME_UNKNOWN');
  assert.equal(f.actor.snapshot().uncertain, true);
  assert.equal(f.budget.pending(), 0);
  assert.equal(await f.actor.shutdown(), false);
});
test('v3 proven local refusal maps only closed local codes without converting native QUERY facts', async () => {
  for (const [code, expected] of [
    ['BUSY', 'BUSY'],
    ['CLOSED', 'CLOSED'],
    ['DEADLINE', 'DEADLINE_EXCEEDED'],
    ['ADMISSION_REJECTED', 'STALE_BINDING'],
    ['NATIVE_FAILED', 'OUTCOME_UNKNOWN'],
    ['METADATA_REJECTED', 'OUTCOME_UNKNOWN'],
  ]) {
    const facts = {
      version: 1,
      kind: 'METADATA_QUERY',
      status: 'FAILED',
      code,
      dispatched: false,
      operationRetired: true,
      stdoutBase64: null,
      stderrBase64: null,
      remoteExitCode: null,
      observedAtUtc: null,
    };
    const f = fixture({
      metadata: {
        transportId: '7',
        localBusy: () => false,
        dispatch: () => queryHandle(facts, undefined, 'LOCAL_REFUSAL'),
        observe: () => true,
        finalCurrent: () => true,
      },
    });
    const r = await f.actor.execute(f.cap, queryRequest(f));
    assert.equal(r.code, expected);
    assert.equal(r.outcome, expected === 'OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN' : 'NOT_DISPATCHED');
    await f.actor.shutdown();
  }
});
