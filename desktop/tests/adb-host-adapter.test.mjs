import { captureRegistryVideoBinding } from '../src/main/registry-store.ts';
import { registryVideoFixture } from './fixtures/registry-video.mjs';
import { fleetActiveFixture } from './fixtures/fleet-active-input.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter, snapshotHostAcquisitionFacts } from '../src/main/adb-host-adapter.ts';
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
    assertReadInternal(token) {
      assert.equal(token, read);
      assert.equal(held, true);
    },
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
    operationSet: extra.operationSet,
    assertOwnedSync() {
      if (!owned) throw Error('private');
      extra.owned?.();
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

const queryFacts = () => ({
  version: 1,
  kind: 'ACQUISITION',
  status: 'COMPLETE',
  code: 'OK',
  dispatched: true,
  operationRetired: true,
  payloadBase64: '',
  observedAtUtc: 1000,
});
test('discovery uses same ordinary lane/foreground holder and separate actual query settlement', async () => {
  const gate = deferred();
  let queries = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      discover: async () => {
        queries++;
        return gate.promise;
      },
    },
  });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  const h = f.adapter.acquireDiscovery(f.cap, { deadlineUtc: 2000 });
  await tick();
  assert.equal((await f.adapter.execute(f.cap, f.request('SERVER_HEALTH'))).code, 'BUSY');
  assert.throws(() => f.adapter.acquireDiscovery(f.cap, { deadlineUtc: 2000 }));
  gate.resolve(queryFacts());
  assert.equal((await h.result).kind, 'ACQUISITION');
  assert.deepEqual(await h.retirement, { status: 'RETIRED' });
  assert.equal(queries, 1);
  assert.equal(f.held(), true);
  assert.equal(f.released(), 0);
  assert.equal(f.adapter.snapshot().state, 'READY');
  assert.equal(await f.adapter.close(), 'RETIRED');
  assert.equal(f.released(), 1);
});
test('query cleanup preempts provider but retains live read holder until pending query actually settles', async () => {
  const gate = deferred();
  const f = fixture({ operationSet: 'SERVER_ONLY', provider: { discover: () => gate.promise } });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  const h = f.adapter.acquireDiscovery(f.cap, { deadlineUtc: 2000 });
  const failed = assert.rejects(h.result);
  await tick();
  const closing = f.adapter.close();
  await tick();
  assert.ok(f.calls.some((x) => x[0] === 'retire'));
  assert.equal(f.held(), true);
  gate.resolve(queryFacts());
  await failed;
  assert.deepEqual(await h.retirement, { status: 'UNRETIRED' });
  assert.equal(await closing, 'RETIRED');
  assert.equal(f.held(), false);
});
test('wrong scope, forged grant and invalid acquisition deadline never invoke query provider', async () => {
  for (const kind of ['scope', 'cap', 'other-grant', 'deadline', 'getter']) {
    let queries = 0,
      getters = 0;
    const f = fixture({
      operationSet: kind === 'scope' ? 'VERSION_ONLY' : 'SERVER_ONLY',
      provider: {
        discover: async () => {
          queries++;
          return queryFacts();
        },
      },
    });
    if (kind !== 'scope') await f.adapter.execute(f.cap, f.request('SERVER_START'));
    if (kind === 'scope')
      assert.throws(() => f.adapter.acquireDiscovery(f.cap, { deadlineUtc: 2000 }));
    else {
      const request =
        kind === 'getter'
          ? Object.defineProperty({}, 'deadlineUtc', {
              enumerable: true,
              get() {
                getters++;
                return 2000;
              },
            })
          : { deadlineUtc: kind === 'deadline' ? 31001 : 2000 };
      const h = f.adapter.acquireDiscovery(
        kind === 'cap' ? {} : kind === 'other-grant' ? f.adapter.grant(id(3), () => {}) : f.cap,
        request,
      );
      await assert.rejects(h.result);
      assert.deepEqual(await h.retirement, { status: 'UNRETIRED' });
    }
    assert.equal(queries, 0);
    assert.equal(getters, 0);
    await f.adapter.close();
  }
});
test('acquisition descriptor snapshot never calls getters and failed tuples do not masquerade as retirement', () => {
  let reads = 0;
  const f = queryFacts();
  Object.defineProperty(f, 'payloadBase64', {
    enumerable: true,
    get() {
      reads++;
      return '';
    },
  });
  assert.equal(snapshotHostAcquisitionFacts(f), null);
  assert.equal(reads, 0);
  assert.equal(
    snapshotHostAcquisitionFacts({
      ...queryFacts(),
      status: 'UNRETIRED',
      code: 'UNRETIRED',
      operationRetired: false,
      payloadBase64: null,
      observedAtUtc: null,
    }).operationRetired,
    false,
  );
});

test('discovery deadline does not erase pending query or release foreground custody; late result cannot revive it', async () => {
  const gate = deferred();
  const f = fixture({ operationSet: 'SERVER_ONLY', provider: { discover: () => gate.promise } });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  const h = f.adapter.acquireDiscovery(f.cap, { deadlineUtc: 1005 });
  let retired = false;
  void h.retirement.then(() => {
    retired = true;
  });
  await assert.rejects(h.result, /HOST_DISCOVERY_DEADLINE/);
  assert.equal(retired, false);
  assert.equal(f.held(), true);
  assert.throws(() => f.adapter.acquireDiscovery(f.cap, { deadlineUtc: 2000 }));
  const closing = f.adapter.close();
  await tick();
  assert.ok(f.calls.some((x) => x[0] === 'retire'));
  assert.equal(f.held(), true);
  gate.resolve(queryFacts());
  assert.deepEqual(await h.retirement, { status: 'UNRETIRED' });
  assert.equal(await closing, 'RETIRED');
  assert.equal(f.held(), false);
});
test('adapter snapshots deadline before await and caps discovery calls at128 on the same live attempt', async () => {
  let queries = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      discover: async (_token, deadline) => {
        queries++;
        assert.equal(deadline, 2000);
        return queryFacts();
      },
    },
  });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  for (let i = 0; i < 128; i++) {
    const request = { deadlineUtc: 2000 },
      h = f.adapter.acquireDiscovery(f.cap, request);
    request.deadlineUtc = 0;
    assert.equal((await h.result).status, 'COMPLETE');
    assert.deepEqual(await h.retirement, { status: 'RETIRED' });
  }
  const denied = f.adapter.acquireDiscovery(f.cap, { deadlineUtc: 2000 });
  await assert.rejects(denied.result);
  await denied.retirement;
  assert.equal(queries, 128);
  assert.equal(f.calls.filter((x) => x[0] === 'reserve').length, 1);
  assert.equal(f.held(), true);
  assert.equal(await f.adapter.close(), 'RETIRED');
});

test('late unretired, malformed or rejected acquisition invalidates early cleanup until fresh actual confirmation', async () => {
  for (const mode of ['UNRETIRED', 'MALFORMED', 'REJECTED']) {
    const query = deferred(),
      fresh = deferred();
    let retires = 0;
    const f = fixture({
      operationSet: 'SERVER_ONLY',
      provider: {
        discover: async () => {
          const value = await query.promise;
          if (mode === 'REJECTED') throw Error('synthetic query failure');
          return value;
        },
        retire: () => (++retires === 1 ? Promise.resolve(dead()) : fresh.promise),
      },
    });
    await f.adapter.execute(f.cap, f.request('SERVER_START'));
    const h = f.adapter.acquireDiscovery(f.cap, { deadlineUtc: 2000 });
    const result = mode === 'UNRETIRED' ? h.result : assert.rejects(h.result);
    await tick();
    const closing = f.adapter.close();
    await tick();
    assert.equal(retires, 1);
    assert.equal(f.held(), true);
    query.resolve(
      mode === 'MALFORMED'
        ? {}
        : {
            ...queryFacts(),
            status: 'UNRETIRED',
            code: 'UNRETIRED',
            operationRetired: false,
            payloadBase64: null,
            observedAtUtc: null,
          },
    );
    if (mode === 'UNRETIRED') assert.equal((await result).status, 'UNRETIRED');
    else await result;
    await h.retirement;
    await tick();
    assert.equal(retires, 2);
    assert.equal(f.held(), true);
    assert.equal(f.released(), 0);
    fresh.resolve(dead());
    assert.equal(await closing, 'RETIRED');
    assert.equal(f.released(), 1);
  }
});

const metadataFacts = () => ({
  version: 1,
  kind: 'METADATA_QUERY',
  status: 'COMPLETE',
  code: 'OK',
  dispatched: true,
  operationRetired: true,
  stdoutBase64: 'bW9kZWw=',
  stderrBase64: '',
  remoteExitCode: 0,
  observedAtUtc: 1000,
});
test('metadata shares exact foreground custody and ordinary lane without process-result coercion', async () => {
  const pending = deferred();
  let calls = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      metadata(_attempt, tid, field, deadline) {
        calls++;
        assert.deepEqual([tid, field, deadline], ['2', 'MODEL', 2000]);
        return pending.promise;
      },
    },
  });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  const request = { transportId: '2', field: 'MODEL', deadlineUtc: 2000 },
    h = f.adapter.acquireMetadata(f.cap, request);
  assert.equal(h.handoff, 'QUERY');
  request.transportId = '3';
  await tick();
  assert.equal(calls, 1);
  assert.throws(() =>
    f.adapter.acquireMetadata(f.cap, { transportId: '2', field: 'MODEL', deadlineUtc: 2000 }),
  );
  assert.equal(f.held(), true);
  pending.resolve({ ...metadataFacts(), remoteExitCode: 7 });
  assert.equal((await h.result).remoteExitCode, 7);
  assert.deepEqual(await h.retirement, { status: 'RETIRED' });
  assert.equal(f.held(), true);
  assert.equal(await f.adapter.close(), 'RETIRED');
  assert.equal(f.released(), 1);
});
test('metadata late unretired completion invalidates early cleanup and requires fresh confirmation', async () => {
  const pending = deferred();
  let retires = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      metadata: () => pending.promise,
      retire: async () => {
        retires++;
        return retires === 1 ? dead() : live('HEALTHY');
      },
    },
  });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  const h = f.adapter.acquireMetadata(f.cap, {
    transportId: '1',
    field: 'MODEL',
    deadlineUtc: 2000,
  });
  await tick();
  const closing = f.adapter.close();
  await tick();
  assert.equal(retires, 1);
  pending.resolve({
    ...metadataFacts(),
    status: 'UNRETIRED',
    code: 'UNRETIRED',
    operationRetired: false,
    stdoutBase64: null,
    stderrBase64: null,
    remoteExitCode: null,
    observedAtUtc: null,
  });
  await h.result;
  assert.deepEqual(await h.retirement, { status: 'UNRETIRED' });
  assert.equal(await closing, 'UNRETIRED');
  assert.equal(retires, 2);
  assert.equal(f.released(), 0);
});

const inputFacts = () => ({
  version: 1,
  kind: 'INPUT_QUERY',
  status: 'COMPLETE',
  code: 'OK',
  dispatched: true,
  operationRetired: true,
  stdoutEmpty: true,
  stderrEmpty: true,
  remoteExitCode: 0,
  observedAtUtc: 1000,
});
test('input shares exact foreground custody and ordinary lane without process-result coercion', async () => {
  const fleet = await fleetActiveFixture(),
    activeIntent = fleet.capture().intent;
  const pending = deferred();
  let calls = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      input(_attempt, tid, field, deadline) {
        calls++;
        assert.deepEqual([tid, field, deadline], ['2', 'HOME', 2000]);
        return pending.promise;
      },
    },
  });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  const request = { transportId: '2', action: 'HOME', deadlineUtc: 2000, activeIntent },
    h = f.adapter.acquireInput(f.cap, request);
  assert.equal(h.handoff, 'QUERY');
  request.transportId = '3';
  await tick();
  assert.equal(calls, 1);
  assert.throws(() =>
    f.adapter.acquireInput(f.cap, { transportId: '2', action: 'HOME', deadlineUtc: 2000 }),
  );
  assert.throws(() =>
    f.adapter.acquireMetadata(f.cap, { transportId: '2', field: 'MODEL', deadlineUtc: 2000 }),
  );
  assert.equal(f.held(), true);
  pending.resolve({ ...inputFacts(), remoteExitCode: 7 });
  assert.equal((await h.result).remoteExitCode, 7);
  assert.deepEqual(await h.retirement, { status: 'RETIRED' });
  assert.equal(f.held(), true);
  assert.equal(await f.adapter.close(), 'RETIRED');
  assert.equal(f.released(), 1);
});
test('input late unretired completion invalidates early cleanup and requires fresh confirmation', async () => {
  const fleet = await fleetActiveFixture(),
    activeIntent = fleet.capture().intent;
  const pending = deferred();
  let retires = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      input: () => pending.promise,
      retire: async () => {
        retires++;
        return retires === 1 ? dead() : live('HEALTHY');
      },
    },
  });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  const h = f.adapter.acquireInput(f.cap, {
    activeIntent,
    transportId: '1',
    action: 'HOME',
    deadlineUtc: 2000,
  });
  await tick();
  const closing = f.adapter.close();
  await tick();
  assert.equal(retires, 1);
  pending.resolve({
    ...inputFacts(),
    status: 'UNRETIRED',
    code: 'UNRETIRED',
    operationRetired: false,
    stdoutEmpty: null,
    stderrEmpty: null,
    remoteExitCode: null,
    observedAtUtc: null,
  });
  await h.result;
  assert.deepEqual(await h.retirement, { status: 'UNRETIRED' });
  assert.equal(await closing, 'UNRETIRED');
  assert.equal(retires, 2);
  assert.equal(f.released(), 0);
});

test('input held custody revalidation observes actual Fleet selection change: zero provider and conservative QUERY cleanup', async () => {
  const fleet = await fleetActiveFixture(),
    activeIntent = fleet.capture().intent,
    gate = deferred();
  let providerCalls = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    custody: {
      revalidateRead: async (token) => {
        await gate.promise;
        return { ok: true, token, observation: { release: '37.0.1', installationRevision: 1 } };
      },
    },
    provider: {
      input() {
        providerCalls++;
        return Promise.resolve(inputFacts());
      },
    },
  });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  const query = f.adapter.acquireInput(f.cap, {
    transportId: '1',
    action: 'HOME',
    deadlineUtc: 2000,
    activeIntent,
  });
  const result = assert.rejects(query.result, /HOST_DISCOVERY_REJECTED/);
  await tick();
  await fleet.select(fleet.devices[1]);
  gate.resolve();
  await result;
  assert.equal(query.handoff, 'QUERY');
  assert.equal(providerCalls, 0);
  assert.deepEqual(await query.retirement, { status: 'UNRETIRED' });
  assert.equal(f.held(), true);
  assert.equal(await f.adapter.close(), 'RETIRED');
  assert.equal(f.released(), 1);
  await fleet.service.close();
});
test('input final owned callback invalidates held token after ordinary assertRead: internal assertion blocks provider', async () => {
  const fleet = await fleetActiveFixture(),
    activeIntent = fleet.capture().intent;
  let afterRevalidation = false,
    ownerCalls = 0,
    valid = true,
    providerCalls = 0,
    internalCalls = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    owned() {
      if (afterRevalidation && ++ownerCalls === 3) valid = false;
    },
    custody: {
      revalidateRead: async (token) => {
        afterRevalidation = true;
        return { ok: true, token, observation: { release: '37.0.1', installationRevision: 1 } };
      },
      assertRead() {
        assert.equal(valid, true);
      },
      assertReadInternal() {
        internalCalls++;
        if (!valid) throw Error('HELD_TOKEN_REVOKED');
      },
    },
    provider: {
      input() {
        providerCalls++;
        return Promise.resolve(inputFacts());
      },
    },
  });
  await f.adapter.execute(f.cap, f.request('SERVER_START'));
  const query = f.adapter.acquireInput(f.cap, {
    transportId: '1',
    action: 'HOME',
    deadlineUtc: 2000,
    activeIntent,
  });
  await assert.rejects(query.result, /HELD_TOKEN_REVOKED/);
  assert.equal(ownerCalls, 3);
  assert.equal(internalCalls, 1);
  assert.equal(providerCalls, 0);
  assert.equal(query.handoff, 'QUERY');
  assert.deepEqual(await query.retirement, { status: 'UNRETIRED' });
  assert.equal(await f.adapter.close(), 'RETIRED');
  assert.equal(f.released(), 1);
  await fleet.service.close();
});
const videoRequest = () => ({
  videoId: id(91),
  transportId: '1',
  hostEpoch: 1,
  deadlineUtc: 2000,
  artifactId: 'a'.repeat(64),
  scid: 7,
  nonceHex: 'b'.repeat(64),
});
const videoPreparing = () => ({
  sessionId: id(91),
  snapshotRevision: 0,
  state: 'PREPARING',
  code: 'OK',
  streamObserved: false,
  sessionPackets: 0,
  mediaPackets: 0,
  encodedBytes: 0,
  lastWidth: null,
  lastHeight: null,
  directory: 'NONE',
  upload: 'NONE',
  launch: 'NONE',
  localRetired: false,
  cleanup: 'NOT_REQUIRED',
});
test('video final opaque store witness follows held custody and refuses replaced projection', async () => {
  const actual = await registryVideoFixture(),
    hold = deferred();
  let dispatched = 0,
    inspect = false;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    custody: {
      async revalidateRead(token) {
        if (inspect) await hold.promise;
        return {
          ok: true,
          token,
          observation: {
            release: '37.0.1',
            archiveSha256: 'a'.repeat(64),
            manifestSha256: 'b'.repeat(64),
            installationRevision: 1,
            adbPath: '/synthetic/adb.exe',
          },
        };
      },
    },
    provider: {
      videoStart: async () => {
        dispatched++;
        return videoPreparing();
      },
    },
  });
  try {
    await f.adapter.execute(f.cap, f.request('SERVER_START'));
    inspect = true;
    const pending = f.adapter.startVideo(f.cap, videoRequest(), actual.binding);
    await tick();
    await actual.replace();
    hold.resolve();
    await assert.rejects(pending);
    assert.equal(dispatched, 0);
    await f.adapter.close();
    assert.equal(f.released(), 1);
  } finally {
    hold.resolve();
    await f.adapter.close();
    await actual.close();
  }
});
test('pending video startup retains ordinary lane and real obligation while Stop preempts', async () => {
  const actual = await registryVideoFixture(),
    start = deferred(),
    stop = deferred();
  let stops = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      videoStart: () => start.promise,
      videoStop: () => {
        stops++;
        return stop.promise;
      },
    },
  });
  try {
    await f.adapter.execute(f.cap, f.request('SERVER_START'));
    const started = f.adapter.startVideo(f.cap, videoRequest(), actual.binding);
    await tick();
    assert.equal((await f.adapter.execute(f.cap, f.request('SERVER_HEALTH'))).code, 'BUSY');
    const stopping = f.adapter.stopVideo(f.cap, id(91));
    await tick();
    assert.equal(stops, 1);
    assert.equal(f.held(), true);
    assert.equal(f.adapter.stopVideo(f.cap, id(91)), stopping);
    const wrongStop = f.adapter.stopVideo(f.cap, id(92)).then(
      () => false,
      (error) => error.message === 'VIDEO_REJECTED',
    );
    assert.equal(stops, 1, 'wrong ID cannot dispatch or adopt cached Stop receipt');
    stop.resolve({
      ...videoPreparing(),
      snapshotRevision: 1,
      state: 'CLOSED',
      code: 'CLOSED',
      localRetired: true,
    });
    await stopping;
    assert.equal(await wrongStop, true, 'wrong canonical ID cannot adopt another video receipt');
    assert.equal(f.held(), true);
    start.resolve(videoPreparing());
    await started;
    assert.equal(await f.adapter.close(), 'RETIRED');
    assert.equal(f.released(), 1);
  } finally {
    start.resolve(videoPreparing());
    stop.resolve({
      ...videoPreparing(),
      snapshotRevision: 1,
      state: 'CLOSED',
      code: 'CLOSED',
      localRetired: true,
    });
    await f.adapter.close();
    await actual.close();
  }
});

test('video restrictive witness rejects forged and cross-transport/epoch targets before native handoff', async () => {
  const actual = await registryVideoFixture();
  try {
    for (const [ticket, change] of [
      [{ ...actual.binding }, {}],
      [actual.binding, { transportId: '7' }],
      [actual.binding, { hostEpoch: 2 }],
    ]) {
      let dispatched = 0;
      const f = fixture({
        operationSet: 'SERVER_ONLY',
        provider: {
          videoStart: async () => {
            dispatched++;
            return videoPreparing();
          },
        },
      });
      try {
        await f.adapter.execute(f.cap, f.request('SERVER_START'));
        await assert.rejects(f.adapter.startVideo(f.cap, { ...videoRequest(), ...change }, ticket));
        assert.equal(dispatched, 0);
      } finally {
        await f.adapter.close();
      }
    }
  } finally {
    await actual.close();
  }
});

test('late uncertain or malformed video work requires fresh cleanup confirmation before read release', async () => {
  for (const malformed of [false, true, 'REJECTED']) {
    const actual = await registryVideoFixture(),
      video = deferred(),
      confirmation = deferred();
    let retires = 0;
    const f = fixture({
      operationSet: 'SERVER_ONLY',
      provider: {
        videoStart: () =>
          video.promise.then((value) => {
            if (malformed === 'REJECTED') throw Error('private');
            return value;
          }),
        retire: async () => (++retires === 1 ? dead() : confirmation.promise),
      },
    });
    try {
      await f.adapter.execute(f.cap, f.request('SERVER_START'));
      const started = f.adapter.startVideo(f.cap, videoRequest(), actual.binding).catch(() => null);
      await tick();
      let settled = false;
      const closing = f.adapter.close().then((v) => {
        settled = true;
        return v;
      });
      await tick();
      assert.equal(retires, 1);
      video.resolve(
        malformed
          ? { private: 'refused' }
          : {
              ...videoPreparing(),
              state: 'UNCERTAIN',
              code: 'OUTCOME_UNKNOWN',
            },
      );
      await started;
      await tick();
      assert.equal(retires, 2, 'late unresolved video invalidates earlier terminal proof');
      assert.equal(settled, false);
      assert.equal(f.held(), true);
      confirmation.resolve(dead());
      assert.equal(await closing, 'RETIRED');
    } finally {
      video.resolve(videoPreparing());
      confirmation.resolve(dead());
      await f.adapter.close();
      await actual.close();
    }
  }
});

const recoveryRequest = (ordinal = 1, previousVideoId = null) => ({
  ...videoRequest(),
  videoId: id(90 + ordinal),
  videoOrdinal: ordinal,
  previousVideoId,
  scid: ordinal,
  nonceHex: ordinal.toString(16).padStart(64, '0'),
});
const recoveryResult = (request, stopped = false) => ({
  handoff: 'OWNED',
  videoId: request.videoId,
  videoOrdinal: request.videoOrdinal,
  refusal: null,
  fresh: true,
  snapshot: {
    ...videoPreparing(),
    sessionId: request.videoId,
    ...(stopped
      ? { snapshotRevision: 1, state: 'CLOSED', code: 'CLOSED', localRetired: true }
      : {}),
  },
});
const freshRecoveryBinding = (actual) =>
  captureRegistryVideoBinding(actual.store, actual.store.snapshot(), actual.deviceId);
const recoveryMedia = () => ({ accept: async () => {}, close() {} });
test('recovery adapter preserves issuer/custody and foreground across two explicit fresh owners', async () => {
  const actual = await registryVideoFixture();
  let starts = 0,
    stops = 0;
  const requests = new Map();
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      async videoRecoveryStart(_token, request) {
        starts++;
        requests.set(request.videoId, request);
        return recoveryResult(request);
      },
      async videoRecoveryStop(_token, id, ordinal) {
        stops++;
        assert.equal(requests.get(id).videoOrdinal, ordinal);
        return recoveryResult(requests.get(id), true);
      },
    },
  });
  try {
    await f.adapter.execute(f.cap, f.request('SERVER_START'));
    const one = recoveryRequest();
    assert.equal(
      (await f.adapter.startVideoRecovery(f.cap, one, actual.binding, recoveryMedia())).handoff,
      'OWNED',
    );
    const stop = f.adapter.stopVideoRecovery(f.cap, one.videoId, 1);
    assert.equal(f.adapter.stopVideoRecovery(f.cap, one.videoId, 1), stop);
    await stop;
    const two = recoveryRequest(2, one.videoId);
    await f.adapter.startVideoRecovery(f.cap, two, freshRecoveryBinding(actual), recoveryMedia());
    assert.equal(await f.adapter.stopVideoRecovery(f.cap, one.videoId, 1), await stop);
    assert.equal(starts, 2);
    assert.equal(stops, 1);
    assert.equal((await f.adapter.execute(f.cap, f.request('SERVER_HEALTH'))).outcome, 'OBSERVED');
    await assert.rejects(f.adapter.startVideo(f.cap, videoRequest(), actual.binding));
    await f.adapter.stopVideoRecovery(f.cap, two.videoId, 2);
  } finally {
    await f.adapter.close();
    await actual.close();
  }
});
test('recovery adapter refuses stale tickets, wrong identity, consumed ordinals and held actual work', async () => {
  const actual = await registryVideoFixture(),
    held = deferred();
  let calls = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      videoRecoveryStart: async (_token, r) => {
        calls++;
        await held.promise;
        return recoveryResult(r);
      },
      videoRecoveryStop: async (_token, id, ordinal) =>
        recoveryResult({ ...recoveryRequest(), videoId: id, videoOrdinal: ordinal }, true),
    },
  });
  try {
    await f.adapter.execute(f.cap, f.request('SERVER_START'));
    const one = recoveryRequest(),
      work = f.adapter.startVideoRecovery(f.cap, one, actual.binding, recoveryMedia());
    await tick();
    const stop = f.adapter.stopVideoRecovery(f.cap, one.videoId, 1);
    await stop;
    await assert.rejects(
      f.adapter.startVideoRecovery(
        f.cap,
        recoveryRequest(2, one.videoId),
        actual.binding,
        recoveryMedia(),
      ),
    );
    await assert.rejects(f.adapter.stopVideoRecovery(f.cap, one.videoId, 2));
    held.resolve();
    await work;
    for (const changed of [
      { videoOrdinal: 1 },
      { previousVideoId: null },
      { scid: one.scid },
      { nonceHex: one.nonceHex },
    ])
      await assert.rejects(
        f.adapter.startVideoRecovery(
          f.cap,
          { ...recoveryRequest(2, one.videoId), ...changed },
          actual.binding,
          recoveryMedia(),
        ),
      );
    assert.equal(calls, 1);
    await assert.rejects(
      f.adapter.startVideoRecovery(
        f.cap,
        recoveryRequest(2, one.videoId),
        Object.freeze({ ...actual.binding }),
        recoveryMedia(),
      ),
    );
    assert.equal(calls, 1, 'forged ticket never reaches provider');
  } finally {
    held.resolve();
    await f.adapter.close();
    await actual.close();
  }
});
test('recovery adapter distinguishes NOT_STARTED BUSY from uncertain provider rejection', async () => {
  for (const uncertain of [false, true]) {
    const actual = await registryVideoFixture();
    let calls = 0;
    const f = fixture({
      operationSet: 'SERVER_ONLY',
      provider: {
        async videoRecoveryStart(_token, r) {
          calls++;
          if (uncertain) throw Error('synthetic unknown handoff');
          return {
            handoff: 'NOT_STARTED',
            videoId: r.videoId,
            videoOrdinal: r.videoOrdinal,
            refusal: 'BUSY',
            snapshot: null,
            fresh: false,
          };
        },
      },
    });
    try {
      await f.adapter.execute(f.cap, f.request('SERVER_START'));
      const one = recoveryRequest(),
        first = f.adapter.startVideoRecovery(f.cap, one, actual.binding, recoveryMedia());
      if (uncertain) {
        await assert.rejects(first);
        await assert.rejects(
          f.adapter.startVideoRecovery(
            f.cap,
            recoveryRequest(2),
            freshRecoveryBinding(actual),
            recoveryMedia(),
          ),
        );
        assert.equal(calls, 1);
      } else {
        const result = await first;
        assert.equal(await f.adapter.stopVideoRecovery(f.cap, one.videoId, 1), result);
        await f.adapter.startVideoRecovery(
          f.cap,
          recoveryRequest(2),
          freshRecoveryBinding(actual),
          recoveryMedia(),
        );
        assert.equal(calls, 2);
      }
    } finally {
      await f.adapter.close();
      await actual.close();
    }
  }
});
test('recovery Stop while custody validation is held cancels before provider handoff without inventing native retirement', async () => {
  const actual = await registryVideoFixture(),
    held = deferred();
  let armed = false,
    calls = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    custody: {
      async revalidateRead(token) {
        if (armed) await held.promise;
        return { ok: true, token, observation: { release: '37.0.1', installationRevision: 1 } };
      },
    },
    provider: {
      async videoRecoveryStart(_token, r) {
        calls++;
        return recoveryResult(r);
      },
    },
  });
  try {
    await f.adapter.execute(f.cap, f.request('SERVER_START'));
    armed = true;
    const one = recoveryRequest();
    const start = f.adapter.startVideoRecovery(f.cap, one, actual.binding, recoveryMedia());
    const stop = f.adapter.stopVideoRecovery(f.cap, one.videoId, 1);
    let stopped = false;
    void stop.then(() => {
      stopped = true;
    });
    await tick();
    assert.equal(stopped, false, 'actual held validation has not retired');
    held.resolve();
    assert.deepEqual(await Promise.all([start, stop]), [null, null]);
    assert.equal(calls, 0);
    const next = { ...recoveryRequest(2), videoOrdinal: 1 };
    await assert.rejects(
      f.adapter.startVideoRecovery(f.cap, next, actual.binding, recoveryMedia()),
    );
    const result = await f.adapter.startVideoRecovery(
      f.cap,
      next,
      freshRecoveryBinding(actual),
      recoveryMedia(),
    );
    assert.equal(result.videoOrdinal, 1);
    assert.equal(calls, 1);
    assert.equal((await f.adapter.execute(f.cap, f.request('SERVER_HEALTH'))).outcome, 'OBSERVED');
    assert.equal(await f.adapter.stopVideoRecovery(f.cap, one.videoId, 1), null);
  } finally {
    held.resolve();
    await f.adapter.close();
    await actual.close();
  }
});
test('recovery adapter rejects equal-revision conflicting snapshots and retains cleanup responsibility', async () => {
  const actual = await registryVideoFixture(),
    one = recoveryRequest();
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      async videoRecoveryStart() {
        return recoveryResult(one);
      },
      async videoRecoveryStatus() {
        const r = recoveryResult(one);
        return { ...r, snapshot: { ...r.snapshot, state: 'FAILED', code: 'PROTOCOL_FAILED' } };
      },
      async videoRecoveryStop() {
        return recoveryResult(one, true);
      },
    },
  });
  try {
    await f.adapter.execute(f.cap, f.request('SERVER_START'));
    await f.adapter.startVideoRecovery(f.cap, one, actual.binding, recoveryMedia());
    await assert.rejects(f.adapter.statusVideoRecovery(f.cap, one.videoId, 1, actual.binding));
    await f.adapter.stopVideoRecovery(f.cap, one.videoId, 1);
    await assert.rejects(
      f.adapter.startVideoRecovery(
        f.cap,
        recoveryRequest(2, one.videoId),
        actual.binding,
        recoveryMedia(),
      ),
    );
  } finally {
    await f.adapter.close();
    await actual.close();
  }
});
test('recovery adapter rejects late OWNED receipt after matching NOT_STARTED admission', async () => {
  const actual = await registryVideoFixture(),
    starting = deferred(),
    stopping = deferred(),
    one = recoveryRequest();
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    provider: {
      videoRecoveryStart: () => starting.promise,
      videoRecoveryStop: () => stopping.promise,
    },
  });
  try {
    await f.adapter.execute(f.cap, f.request('SERVER_START'));
    const first = f.adapter.startVideoRecovery(f.cap, one, actual.binding, recoveryMedia());
    await tick();
    const stop = f.adapter.stopVideoRecovery(f.cap, one.videoId, 1);
    await tick();
    starting.resolve({
      handoff: 'NOT_STARTED',
      videoId: one.videoId,
      videoOrdinal: 1,
      refusal: 'BUSY',
      snapshot: null,
      fresh: false,
    });
    await first;
    const rejected = assert.rejects(stop);
    stopping.resolve(recoveryResult(one, true));
    await rejected;
  } finally {
    starting.resolve();
    stopping.resolve();
    await f.adapter.close();
    await actual.close();
  }
});
