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
