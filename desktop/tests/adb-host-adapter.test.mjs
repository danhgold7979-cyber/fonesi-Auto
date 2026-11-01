import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter } from '../src/main/adb-host-adapter.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const invoke = (observation = 'VERSION', exitCode = 0) => ({
  version: 2,
  kind: 'INVOCATION',
  dispatched: true,
  processRetired: true,
  exitCode,
  observation,
});
const live = (observation = 'STARTED') => ({
  version: 2,
  kind: 'SESSION',
  dispatched: true,
  jobState: 'LIVE',
  exitCode: null,
  endpointState: 'OWNED',
  observation,
});
const dead = () => ({
  version: 2,
  kind: 'SESSION',
  dispatched: true,
  jobState: 'RETIRED',
  exitCode: 1,
  endpointState: 'ABSENT',
  observation: 'STOPPED',
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
function fixture(extra = {}) {
  const calls = [],
    tokens = new WeakSet();
  let held = false,
    released = 0,
    owned = true,
    now = 1000,
    n = 10;
  const read = Object.freeze({}),
    runtime = Object.freeze({
      release: '37.0.1',
      archiveSha256: 'a'.repeat(64),
      manifestSha256: 'b'.repeat(64),
      installationRevision: 1,
      adbPath: '/synthetic/adb.exe',
    });
  const custody = {
    assertRead(token) {
      assert.equal(token, read);
      assert.equal(held, true);
    },
    acquireRead: async () => {
      assert.equal(held, false);
      held = true;
      return { ok: true, status: 'READ_VERIFIED_ONLY', token: read, observation: runtime };
    },
    revalidateRead: async (token) => {
      assert.equal(token, read);
      assert.equal(held, true);
      return { ok: true, status: 'READ_VERIFIED_ONLY', token: read, observation: runtime };
    },
    releaseRead: async (token) => {
      assert.equal(token, read);
      assert.equal(held, true);
      held = false;
      released++;
      return { ok: true, status: 'RETIRED' };
    },
    ...extra.custody,
  };
  const provider = {
    reserveAttempt(kind) {
      const token = Object.freeze({});
      tokens.add(token);
      calls.push(['reserve', kind]);
      return token;
    },
    async version(token, r) {
      assert.ok(tokens.has(token));
      assert.equal(r, runtime);
      calls.push(['version']);
      return invoke();
    },
    async startForeground(token, r) {
      assert.ok(tokens.has(token));
      assert.equal(r, runtime);
      calls.push(['start']);
      return live();
    },
    async health(token) {
      assert.ok(tokens.has(token));
      calls.push(['health']);
      return live('HEALTHY');
    },
    async retire(token) {
      assert.ok(tokens.has(token));
      calls.push(['retire']);
      return dead();
    },
    ...extra.provider,
  };
  const adapter = createHostAdapter({
    runtimeCustody: custody,
    nativeProvider: provider,
    assertOwnedSync() {
      if (!owned) throw Error('private');
    },
    now: () => now,
    diagnosticId: () => id(n++),
  });
  const cap = adapter.grant(id(3), () => {
    if (!owned) throw Error('private');
  });
  const request = (operation) => ({
    version: 1,
    commandId: id(1),
    correlationId: id(2),
    ownerId: id(3),
    operation,
    deadlineUtc: now + 1000,
  });
  return {
    adapter,
    cap,
    request,
    calls,
    held: () => held,
    released: () => released,
    revoke: () => {
      owned = false;
    },
    clock: (v) => {
      now = v;
    },
  };
}
test('synthetic provider VERSION uses current read holder and releases only retired invocation', async () => {
  const f = fixture();
  assert.equal((await f.adapter.execute(f.cap, f.request('HOST_VERSION'))).outcome, 'OBSERVED');
  assert.deepEqual(f.calls, [['reserve', 'VERSION'], ['version']]);
  assert.equal(f.released(), 1);
  assert.equal(f.adapter.retired, true);
  assert.equal(await f.adapter.close(), 'RETIRED');
});
test('live foreground retains custody through health and rejects second version; forced nonzero retired stop is valid', async () => {
  const f = fixture();
  assert.equal((await f.adapter.execute(f.cap, f.request('SERVER_START'))).outcome, 'OBSERVED');
  assert.equal(f.held(), true);
  assert.equal((await f.adapter.execute(f.cap, f.request('HOST_VERSION'))).code, 'BUSY');
  assert.equal((await f.adapter.execute(f.cap, f.request('SERVER_HEALTH'))).outcome, 'OBSERVED');
  assert.equal(f.released(), 0);
  assert.equal((await f.adapter.execute(f.cap, f.request('SERVER_STOP'))).outcome, 'OBSERVED');
  assert.equal(f.released(), 1);
  assert.equal(await f.adapter.close(), 'RETIRED');
});
test('pre-handoff attempt survives thrown start; revoked owner can only retire exact attempt', async () => {
  const f = fixture({
    provider: {
      async startForeground() {
        throw Error('PRIVATE_PATH');
      },
    },
  });
  const r = await f.adapter.execute(f.cap, f.request('SERVER_START'));
  assert.equal(r.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(f.held(), true);
  f.revoke();
  assert.equal(await f.adapter.close(), 'RETIRED');
  assert.equal(f.calls.filter((x) => x[0] === 'retire').length, 1);
  assert.equal(f.released(), 1);
  assert.equal((await f.adapter.execute(f.cap, f.request('SERVER_START'))).code, 'CLOSED');
});
test('late start promise remains held after logical deadline and cleanup retirement until actual settlement', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const late = deferred();
  const f = fixture({ provider: { startForeground: () => late.promise } });
  const operation = f.adapter.execute(f.cap, f.request('SERVER_START'));
  await tick();
  f.clock(2001);
  t.mock.timers.tick(1001);
  assert.equal((await operation).outcome, 'OUTCOME_UNKNOWN');
  assert.equal(f.held(), true);
  let done = false;
  const close = f.adapter.close().then((r) => {
    done = true;
    return r;
  });
  await tick();
  assert.equal(done, false);
  assert.equal(f.released(), 0);
  late.resolve(live());
  assert.equal(await close, 'RETIRED');
  assert.equal(f.calls.filter((x) => x[0] === 'retire').length, 2);
  assert.equal(f.released(), 1);
});
test('close waits actual byte-inspection preflight and cannot start after its completion', async () => {
  const pending = deferred();
  let released = 0;
  const f = fixture({
    custody: {
      acquireRead: () => pending.promise,
      releaseRead: async () => {
        released++;
        return { ok: true, status: 'RETIRED' };
      },
    },
  });
  const work = f.adapter.execute(f.cap, f.request('HOST_VERSION'));
  await tick();
  let done = false;
  const close = f.adapter.close().then((r) => {
    done = true;
    return r;
  });
  await tick();
  assert.equal(done, false);
  pending.resolve({ ok: true, status: 'READ_VERIFIED_ONLY', token: {}, observation: {} });
  assert.equal((await work).code, 'NOT_AUTHORIZED');
  assert.equal(await close, 'RETIRED');
  assert.equal(released, 1);
  assert.deepEqual(f.calls, []);
});
test('forged grant, missing runtime and discovery never reach a native provider', async () => {
  const f = fixture({
    custody: { acquireRead: async () => ({ ok: false, code: 'BINARY_UNAVAILABLE' }) },
  });
  assert.equal((await f.adapter.execute({}, f.request('HOST_VERSION'))).code, 'NOT_AUTHORIZED');
  assert.equal(
    (await f.adapter.execute(f.cap, f.request('HOST_VERSION'))).code,
    'BINARY_UNAVAILABLE',
  );
  assert.equal((await f.adapter.execute(f.cap, f.request('DISCOVER'))).code, 'NOT_READY');
  assert.deepEqual(f.calls, []);
  assert.equal(await f.adapter.close(), 'RETIRED');
});

test('reentrant close during effect-free reservation retires the later returned exact token without starting', async () => {
  let adapter, closing, token;
  let started = 0,
    retired = 0;
  const f = fixture({
    provider: {
      reserveAttempt() {
        token = Object.freeze({});
        closing = adapter.close();
        return token;
      },
      async startForeground() {
        started++;
        return live();
      },
      async retire(t) {
        assert.equal(t, token);
        retired++;
        return { ...dead(), dispatched: false, exitCode: null, observation: null };
      },
    },
  });
  adapter = f.adapter;
  assert.equal(
    (await adapter.execute(f.cap, f.request('SERVER_START'))).outcome,
    'OUTCOME_UNKNOWN',
  );
  assert.equal(await closing, 'RETIRED');
  assert.equal(started, 0);
  assert.equal(retired, 1);
  assert.equal(f.released(), 1);
});

test('bounded close keeps custody through unretired late invocation then never reopens', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const late = deferred();
  const f = fixture({
    provider: { version: () => late.promise, retire: async () => ({ ...invoke(null, 1) }) },
  });
  const work = f.adapter.execute(f.cap, f.request('HOST_VERSION'));
  await tick();
  const closing = f.adapter.close();
  await tick();
  t.mock.timers.tick(120000);
  assert.equal(await closing, 'UNRETIRED');
  assert.equal(f.held(), true);
  assert.equal(f.adapter.retired, false);
  late.resolve(invoke());
  await work;
  await tick();
  assert.equal(f.released(), 1);
  assert.equal(f.adapter.retired, true);
  assert.equal((await f.adapter.execute(f.cap, f.request('HOST_VERSION'))).code, 'CLOSED');
});

test('runtime revalidation failure retains existing server for cleanup only', async () => {
  let valid = true;
  const f = fixture({
    custody: {
      revalidateRead: async () => {
        assert.equal(valid, false);
        return { ok: false, code: 'RECOVERY_REQUIRED' };
      },
    },
  });
  assert.equal((await f.adapter.execute(f.cap, f.request('SERVER_START'))).outcome, 'OBSERVED');
  valid = false;
  assert.equal(
    (await f.adapter.execute(f.cap, f.request('SERVER_HEALTH'))).code,
    'CUSTODY_REJECTED',
  );
  assert.equal(f.held(), true);
  assert.equal(
    f.calls.some((x) => x[0] === 'health'),
    false,
  );
  assert.equal(await f.adapter.close(), 'RETIRED');
  assert.equal(f.released(), 1);
});

test('actual empty owned runtime custody refuses adapter version without creating files or calling provider', async () => {
  const fs = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createPlatformToolsRuntimeCustody } = await import(
    '../src/main/platform-tools-runtime-custody.ts'
  );
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'host-adapter-empty-')));
  const custody = createPlatformToolsRuntimeCustody({
    dataRoot: root,
    storeId: id(99),
    assertOwnedSync() {},
    assertDataLocation(p) {
      assert.equal(p, root);
    },
  });
  let calls = 0;
  const denied = () => {
    calls++;
    throw Error('UNEXPECTED_PROVIDER');
  };
  const adapter = createHostAdapter({
    runtimeCustody: custody,
    nativeProvider: {
      reserveAttempt: denied,
      version: denied,
      startForeground: denied,
      health: denied,
      retire: denied,
    },
    assertOwnedSync() {},
    now: () => 1000,
    diagnosticId: () => id(9),
  });
  try {
    const cap = adapter.grant(id(3), () => {});
    const result = await adapter.execute(cap, {
      version: 1,
      commandId: id(1),
      correlationId: id(2),
      ownerId: id(3),
      operation: 'HOST_VERSION',
      deadlineUtc: 2000,
    });
    assert.equal(result.code, 'BINARY_UNAVAILABLE');
    assert.equal(calls, 0);
    assert.deepEqual(await fs.readdir(root), []);
    assert.equal(await adapter.close(), 'RETIRED');
    assert.equal(await custody.close(), 'RETIRED');
  } finally {
    await fs.rmdir(root);
  }
});

test('revoked shared read observation at final authority callback prevents provider handoff', async () => {
  let valid = true,
    checks = 0;
  const f = fixture({
    custody: {
      assertRead() {
        if (!valid) throw Error('CLOSED');
      },
    },
  });
  const cap = f.adapter.grant(id(3), () => {
    if (++checks === 2) valid = false;
  });
  assert.equal((await f.adapter.execute(cap, f.request('HOST_VERSION'))).code, 'NOT_AUTHORIZED');
  assert.deepEqual(f.calls, []);
  assert.equal(f.released(), 1);
  assert.equal(await f.adapter.close(), 'RETIRED');
});

test('late LIVE contradicts early retirement and failed final confirmation retains custody', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const late = deferred();
  let retireCalls = 0;
  const f = fixture({
    provider: {
      startForeground: () => late.promise,
      retire: async () => (++retireCalls === 1 ? dead() : live()),
    },
  });
  const work = f.adapter.execute(f.cap, f.request('SERVER_START'));
  await tick();
  f.clock(2001);
  t.mock.timers.tick(1001);
  await work;
  const close = f.adapter.close();
  await tick();
  late.resolve(live());
  assert.equal(await close, 'UNRETIRED');
  assert.equal(retireCalls, 2);
  assert.equal(f.held(), true);
  assert.equal(f.released(), 0);
  assert.equal(f.adapter.retired, false);
});

test('provider facts are descriptor-snapshotted once before retirement and lifecycle consume them', async () => {
  let reads = 0;
  const raw = new Proxy(invoke(), {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'processRetired') return { ...descriptor, value: ++reads === 1 };
      return descriptor;
    },
  });
  const f = fixture({ provider: { version: async () => raw } });
  assert.equal((await f.adapter.execute(f.cap, f.request('HOST_VERSION'))).outcome, 'OBSERVED');
  assert.equal(reads, 1);
  assert.equal(f.released(), 1);
  assert.equal(await f.adapter.close(), 'RETIRED');
});

test('late malformed completion invalidates early retirement and cannot release on failed final confirmation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const late = deferred();
  let retireCalls = 0;
  const f = fixture({
    provider: {
      startForeground: () => late.promise,
      retire: async () => (++retireCalls === 1 ? dead() : live()),
    },
  });
  const work = f.adapter.execute(f.cap, f.request('SERVER_START'));
  await tick();
  f.clock(2001);
  t.mock.timers.tick(1001);
  await work;
  const close = f.adapter.close();
  await tick();
  late.resolve({ privateUnexpected: 'not echoed' });
  assert.equal(await close, 'UNRETIRED');
  assert.equal(retireCalls, 2);
  assert.equal(f.held(), true);
  assert.equal(f.released(), 0);
});

test('close waits actual read-holder release and a failed release remains unretired without raw rejection', async () => {
  const release = deferred();
  let called = false;
  const f = fixture({
    custody: {
      releaseRead: () => {
        called = true;
        return release.promise;
      },
    },
  });
  const work = f.adapter.execute(f.cap, f.request('HOST_VERSION'));
  await tick();
  assert.equal(called, true);
  let finished = false;
  const close = f.adapter.close().then((r) => {
    finished = true;
    return r;
  });
  await tick();
  assert.equal(finished, false);
  release.resolve({ ok: true, status: 'RETIRED' });
  await work;
  assert.equal(await close, 'RETIRED');
  const g = fixture({
    custody: {
      releaseRead: async () => {
        throw Error('PRIVATE_RELEASE_PATH');
      },
    },
  });
  assert.equal((await g.adapter.execute(g.cap, g.request('HOST_VERSION'))).outcome, 'OBSERVED');
  assert.equal(await g.adapter.close(), 'UNRETIRED');
  assert.equal(g.adapter.retired, false);
});

test('custody admission callback cannot revoke adapter owner immediately before provider handoff', async () => {
  let f;
  let checks = 0;
  f = fixture({
    custody: {
      assertRead() {
        if (++checks === 1) f.revoke();
      },
    },
  });
  assert.equal((await f.adapter.execute(f.cap, f.request('HOST_VERSION'))).code, 'NOT_AUTHORIZED');
  assert.deepEqual(f.calls, []);
  assert.equal(f.released(), 1);
  assert.equal(await f.adapter.close(), 'RETIRED');
});
