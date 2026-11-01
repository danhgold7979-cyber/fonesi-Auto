import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostLifecycle, snapshotHostRequest } from '../src/main/adb-host-lifecycle.ts';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const request = (operation = 'HOST_VERSION', extra = {}) => ({
  version: 1,
  commandId: id(1),
  correlationId: id(2),
  ownerId: id(3),
  operation,
  deadlineUtc: Date.now() + 1000,
  ...extra,
});
const facts = (observation = 'VERSION', endpointOwned = false) => ({
  dispatched: true,
  processRetired: true,
  exitCode: 0,
  endpointOwned,
  observation,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function fixture(overrides = {}) {
  let owned = true,
    admitted = true;
  const calls = [],
    endpoint = Object.freeze({});
  const options = {
    transport: async (req, cap) => {
      calls.push({ req, cap });
      return facts(
        {
          HOST_VERSION: 'VERSION',
          SERVER_START: 'STARTED',
          SERVER_STOP: 'STOPPED',
          SERVER_HEALTH: 'HEALTHY',
          DISCOVER: 'DISCOVERY',
        }[req.operation],
        !['HOST_VERSION', 'SERVER_STOP'].includes(req.operation),
      );
    },
    endpoint,
    assertOwnedSync() {
      if (!owned) throw Error('private');
    },
    binaryAdmitted: () => true,
    now: () => Date.now(),
    diagnosticId: () => id(4),
    ...overrides,
  };
  const engine = createHostLifecycle(options);
  const cap = engine.grant(id(3), () => {
    if (!admitted) throw Error('private');
  });
  return {
    engine,
    cap,
    calls,
    endpoint,
    options,
    revoke: () => {
      admitted = false;
    },
    lose: () => {
      owned = false;
    },
  };
}
test('strict request snapshots never invoke getters or coerce and retain immutable primitives', () => {
  const raw = request();
  const snap = snapshotHostRequest(raw);
  raw.operation = 'SERVER_STOP';
  assert.equal(snap.operation, 'HOST_VERSION');
  assert.ok(Object.isFrozen(snap));
  let reads = 0;
  const getter = { ...request() };
  Object.defineProperty(getter, 'ownerId', {
    enumerable: true,
    get() {
      reads++;
      throw Error('private');
    },
  });
  for (const value of [
    getter,
    { ...request(), extra: 1 },
    { ...request(), deadlineUtc: -0 },
    { ...request(), deadlineUtc: Infinity },
    { ...request(), commandId: id(2) },
    { ...request(), version: true },
    new Proxy(
      {},
      {
        ownKeys() {
          throw Error('private');
        },
      },
    ),
  ])
    assert.equal(snapshotHostRequest(value), null);
  assert.equal(reads, 0);
});
test('host version has no fabricated device binding and binary gate refuses before dispatch', async () => {
  const f = fixture();
  assert.equal((await f.engine.execute(f.cap, request())).outcome, 'OBSERVED');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].cap, f.endpoint);
  assert.deepEqual(Object.keys(f.calls[0].req).sort(), Object.keys(request()).sort());
  const g = fixture({ binaryAdmitted: () => false });
  assert.equal((await g.engine.execute(g.cap, request())).code, 'BINARY_UNAVAILABLE');
  assert.equal(g.calls.length, 0);
});
test('null forged wrong-owner and revoked capabilities never dispatch', async () => {
  for (const token of [null, undefined, {}, Object.freeze({ hostCapability: true })]) {
    const f = fixture();
    assert.equal((await f.engine.execute(token, request())).code, 'NOT_AUTHORIZED');
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.equal(
    (await f.engine.execute(f.cap, request('HOST_VERSION', { ownerId: id(9) }))).code,
    'NOT_AUTHORIZED',
  );
  f.revoke();
  assert.equal((await f.engine.execute(f.cap, request())).code, 'NOT_AUTHORIZED');
  assert.equal(f.calls.length, 0);
});
test('owned lifecycle starts, observes health/discovery, and stops only its private endpoint', async () => {
  const f = fixture();
  assert.equal((await f.engine.execute(f.cap, request('SERVER_STOP'))).code, 'NOT_READY');
  for (const op of ['SERVER_START', 'SERVER_HEALTH', 'DISCOVER', 'SERVER_STOP'])
    assert.equal((await f.engine.execute(f.cap, request(op))).outcome, 'OBSERVED');
  assert.equal(f.engine.snapshot().state, 'STOPPED');
  assert.equal(f.calls.length, 4);
  assert.ok(f.calls.every((c) => c.cap === f.endpoint));
});
test('single host lane rejects concurrent work and freezes caller request before awaits', async () => {
  const wait = deferred();
  let seen;
  const f = fixture({
    transport: (r) => {
      seen = r;
      return wait.promise;
    },
  });
  const raw = request('SERVER_START');
  const first = f.engine.execute(f.cap, raw);
  raw.operation = 'SERVER_STOP';
  await Promise.resolve();
  assert.equal((await f.engine.execute(f.cap, request())).code, 'BUSY');
  wait.resolve(facts('STARTED', true));
  assert.equal((await first).outcome, 'OBSERVED');
  assert.equal(seen.operation, 'SERVER_START');
});
test('factory captures callbacks and transport rather than mutable option properties', async () => {
  const f = fixture();
  f.options.transport = () => {
    throw Error('replaced');
  };
  f.options.assertOwnedSync = () => {
    throw Error('replaced');
  };
  f.options.binaryAdmitted = () => false;
  assert.equal((await f.engine.execute(f.cap, request())).code, 'OK');
});
test('deadlines expire before dispatch and never extend beyond120 seconds', async () => {
  const f = fixture({ now: () => 100 });
  for (const deadlineUtc of [100, 99, 120101])
    assert.equal(
      (await f.engine.execute(f.cap, request('HOST_VERSION', { deadlineUtc }))).code,
      'DEADLINE',
    );
  assert.equal(f.calls.length, 0);
});
test('timeout latches uncertainty; late success cannot unblock or replay transport', async () => {
  const wait = deferred();
  let calls = 0;
  const f = fixture({
    now: () => 1000,
    transport: () => {
      calls++;
      return wait.promise;
    },
  });
  const result = await f.engine.execute(f.cap, request('SERVER_START', { deadlineUtc: 1020 }));
  assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(result.code, 'DEADLINE');
  wait.resolve(facts('STARTED', true));
  await new Promise((r) => setImmediate(r));
  assert.equal(f.engine.snapshot().state, 'UNCERTAIN');
  assert.equal(
    (await f.engine.execute(f.cap, request('HOST_VERSION', { deadlineUtc: 2000 }))).code,
    'RECOVERY_REQUIRED',
  );
  assert.equal(calls, 1);
});
test('revocation or ownership loss after dispatch suppresses observation and fences custody', async () => {
  for (const action of ['revoke', 'lose']) {
    const wait = deferred();
    const f = fixture({ transport: () => wait.promise });
    const run = f.engine.execute(f.cap, request('SERVER_START'));
    await Promise.resolve();
    f[action]();
    wait.resolve(facts('STARTED', true));
    assert.equal((await run).outcome, 'OUTCOME_UNKNOWN');
    assert.equal(f.engine.snapshot().state, 'UNCERTAIN');
  }
});
test('exit zero without validated observation, unknown cleanup and foreign custody never pass', async () => {
  for (const value of [
    { ...facts(), observation: null },
    { ...facts(), processRetired: false },
    facts('STARTED', false),
    { ...facts(), extra: 'private' },
  ]) {
    const f = fixture({ transport: async () => value });
    assert.notEqual((await f.engine.execute(f.cap, request('SERVER_START'))).outcome, 'OBSERVED');
    assert.equal(f.engine.snapshot().state, 'UNCERTAIN');
  }
});
test('transport throws and facts getters cannot leak raw error or claim no dispatch', async () => {
  const f = fixture({
    transport: async () => {
      throw Error('private-path');
    },
  });
  const result = await f.engine.execute(f.cap, request());
  assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(JSON.stringify(result).includes('private'), false);
  let reads = 0;
  const value = facts();
  Object.defineProperty(value, 'observation', {
    enumerable: true,
    get() {
      reads++;
      return 'VERSION';
    },
  });
  const g = fixture({ transport: async () => value });
  assert.equal((await g.engine.execute(g.cap, request())).code, 'INVALID_OBSERVATION');
  assert.equal(reads, 0);
});
test('shutdown drains once, never implicitly kills server, and rejects future admission', async () => {
  const wait = deferred();
  const f = fixture({ transport: () => wait.promise });
  const run = f.engine.execute(f.cap, request('SERVER_START'));
  await Promise.resolve();
  const close = f.engine.shutdown();
  assert.equal(close, f.engine.shutdown());
  assert.equal((await f.engine.execute(f.cap, request())).code, 'CLOSED');
  wait.resolve(facts('STARTED', true));
  await run;
  assert.deepEqual(await close, { state: 'READY', ownedServerRetained: true });
  assert.throws(() => f.engine.grant(id(3), () => {}));
  const g = fixture();
  const pending = g.engine.execute(g.cap, request());
  await g.engine.shutdown();
  assert.equal((await pending).code, 'CLOSED');
  assert.equal(g.calls.length, 0);
});
test('clock regression and reentrant shutdown cannot extend admission or dispatch', async () => {
  let calls = 0;
  let tick = 0;
  const f = fixture({
    now: () => (tick++ === 0 ? 100 : 0),
    transport: async () => {
      calls++;
      return facts();
    },
  });
  assert.equal(
    (await f.engine.execute(f.cap, request('HOST_VERSION', { deadlineUtc: 120100 }))).code,
    'DEADLINE',
  );
  assert.equal(calls, 0);
  let engine;
  const g = fixture({
    assertOwnedSync() {
      void engine.shutdown();
    },
  });
  engine = g.engine;
  assert.equal((await g.engine.execute(g.cap, request())).code, 'CLOSED');
  assert.equal(g.calls.length, 0);
});
