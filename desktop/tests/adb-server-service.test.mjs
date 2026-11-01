import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdbServerService } from '../src/main/adb-server-service.ts';
import { createHostAdapter } from '../src/main/adb-host-adapter.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
const facts = (observation = 'STARTED') =>
  Object.freeze({
    version: 2,
    kind: 'SESSION',
    dispatched: true,
    jobState: observation === 'STOPPED' ? 'RETIRED' : 'LIVE',
    exitCode: observation === 'STOPPED' ? 9 : null,
    endpointState: observation === 'STOPPED' ? 'ABSENT' : 'OWNED',
    observation,
  });
function fixture(extra = {}) {
  let owned = true,
    current = true,
    held = false,
    leaseValid = true,
    n = 10,
    time = 1000,
    closes = 0,
    service;
  const calls = [],
    events = [],
    read = Object.freeze({}),
    attempt = Object.freeze({}),
    runtime = Object.freeze({
      release: '37.0.1',
      archiveSha256: 'a'.repeat(64),
      manifestSha256: 'b'.repeat(64),
      installationRevision: 7,
      adbPath: '/synthetic/adb.exe',
    });
  const assertOwned = () => {
    if (!owned) throw Error('PRIVATE_OWNER');
  };
  const custody = {
    async acquireRead() {
      assert.equal(held, false);
      held = true;
      return { ok: true, status: 'READ_VERIFIED_ONLY', token: read, observation: runtime };
    },
    assertRead(t) {
      assert.equal(t, read);
      assert.equal(held, true);
      assert.equal(leaseValid, true);
    },
    async revalidateRead(t) {
      this.assertRead(t);
      return { ok: true, status: 'READ_VERIFIED_ONLY', token: read, observation: runtime };
    },
    async releaseRead(t) {
      assert.equal(t, read);
      assert.equal(held, true);
      held = false;
      return { ok: true, status: 'RETIRED' };
    },
  };
  const provider = {
    reserveAttempt(kind) {
      assert.equal(kind, 'FOREGROUND');
      calls.push('reserve');
      return attempt;
    },
    async version() {
      assert.fail('wrong scope');
    },
    async startForeground(t, r) {
      assert.equal(t, attempt);
      assert.equal(r, runtime);
      calls.push('start');
      return extra.start ? extra.start() : facts();
    },
    async health(t) {
      assert.equal(t, attempt);
      calls.push('health');
      return extra.health ? extra.health() : facts('HEALTHY');
    },
    async retire(t) {
      assert.equal(t, attempt);
      calls.push('retire');
      return extra.retire ? extra.retire() : facts('STOPPED');
    },
  };
  const adapter = createHostAdapter({
    runtimeCustody: custody,
    nativeProvider: provider,
    assertOwnedSync: assertOwned,
    now: () => time,
    diagnosticId: () => id(n++),
  });
  const options = {
    ownerId: id(1),
    expectedInstallationRevision: 7,
    assertOwnedSync: assertOwned,
    assertCurrentSync() {
      if (!current) throw Error('PRIVATE_SESSION');
      extra.current?.(service);
    },
    clock() {
      extra.clock?.(service);
      return time;
    },
    newId() {
      return extra.id ? extra.id(service) : id(n++);
    },
    createFactory(rev, scope) {
      assert.equal(rev, 7);
      assert.equal(scope, 'SERVER_ONLY');
      return {
        grant: adapter.grant,
        execute: adapter.execute,
        snapshot: adapter.snapshot,
        assertCurrentSession() {
          assert.equal(adapter.snapshot().state, 'READY');
          custody.assertRead(read);
        },
        assertRetiredSession() {
          assert.equal(adapter.snapshot().state, 'STOPPED');
          assert.equal(adapter.retired, true);
          assert.equal(held, false);
        },
        get retired() {
          return adapter.retired;
        },
        close() {
          closes++;
          return adapter.close();
        },
      };
    },
    async audit(record) {
      events.push(record);
      return extra.audit ? extra.audit(record, service) : 'AVAILABLE';
    },
  };
  service = createAdbServerService(options);
  return {
    service,
    calls,
    events,
    held: () => held,
    invalidateRead: () => {
      leaseValid = false;
    },
    closes: () => closes,
    revoke: () => {
      current = false;
    },
    loseOwner: () => {
      owned = false;
    },
    clock: (v) => {
      time = v;
    },
    options,
    adapter,
  };
}
test('actual adapter composition START/live HEALTH/STOP retains same attempt and read until physical retirement', async () => {
  const f = fixture();
  assert.equal(f.service.snapshot().state, 'STOPPED');
  assert.equal((await f.service.start()).result.outcome, 'OBSERVED');
  assert.equal(f.held(), true);
  assert.equal(f.service.snapshot().state, 'READY');
  assert.equal((await f.service.health()).result.code, 'OK');
  const stop = await f.service.stop();
  assert.equal(stop.kind, 'OPERATION');
  assert.equal(stop.result.outcome, 'OBSERVED');
  assert.equal(f.held(), false);
  assert.deepEqual(f.calls, ['reserve', 'start', 'health', 'retire']);
  assert.equal((await f.service.start()).result.code, 'NOT_READY');
  assert.equal((await f.service.close()).status, 'RETIRED');
  assert.equal(f.service.snapshot().closed, true);
  assert.ok(
    f.events.every(
      (e) =>
        Object.isFrozen(e) &&
        Object.isFrozen(e.request) &&
        ['SERVER_START', 'SERVER_HEALTH', 'SERVER_STOP'].includes(e.request.operation),
    ),
  );
});
test('pending START stop immediately uses cleanup rather than busy execute; late start cannot revive', async () => {
  const pending = deferred(),
    f = fixture({ start: () => pending.promise });
  const start = f.service.start();
  await tick();
  assert.equal(f.calls.includes('start'), true);
  const stop = f.service.stop();
  assert.equal(f.closes(), 1);
  await tick();
  assert.ok(f.calls.includes('retire'));
  pending.resolve(facts());
  const r = await start;
  assert.notEqual(r.result.outcome, 'OBSERVED');
  const c = await stop;
  assert.equal(c.kind, 'CLEANUP');
  assert.equal(c.status, 'RETIRED');
  assert.equal(f.held(), false);
  assert.equal(f.service.snapshot().closed, true);
});
test('pending INTENT does not delay cleanup and late receipt cannot dispatch', async () => {
  const audit = deferred(),
    f = fixture({ audit: (e) => (e.phase === 'INTENT' ? audit.promise : 'AVAILABLE') });
  const start = f.service.start();
  await tick();
  const close = f.service.close();
  assert.equal(f.closes(), 1);
  assert.deepEqual(f.calls, []);
  let settled = false;
  void close.then(() => {
    settled = true;
  });
  await tick();
  assert.equal(settled, false);
  audit.resolve('AVAILABLE');
  assert.notEqual((await start).result.outcome, 'OBSERVED');
  assert.equal((await close).status, 'RETIRED');
  assert.deepEqual(f.calls, []);
});
test('audit INTENT failure prevents effects; RESULT failure preserves known observation with degradation', async () => {
  const denied = fixture({ audit: () => 'DEGRADED' });
  assert.equal((await denied.service.start()).result.outcome, 'NOT_DISPATCHED');
  assert.deepEqual(denied.calls, []);
  await denied.service.close();
  const f = fixture({ audit: (e) => (e.phase === 'RESULT' ? 'DEGRADED' : 'AVAILABLE') });
  const r = await f.service.start();
  assert.equal(r.result.outcome, 'OBSERVED');
  assert.equal(r.auditHealth, 'DEGRADED');
  await f.service.close();
});
test('revoked ordinary authority still permits exact cleanup and no HEALTH effect', async () => {
  const f = fixture();
  await f.service.start();
  f.revoke();
  const r = await f.service.stop();
  assert.equal(r.kind, 'CLEANUP');
  assert.equal(r.status, 'RETIRED');
  assert.equal(f.held(), false);
  assert.ok(!f.calls.includes('health'));
});
test('clock and ID callback reentry cannot cause a second launch or dispatch after close', async () => {
  for (const callback of ['clock', 'id']) {
    let nested;
    const f = fixture({
      [callback]: (service) => {
        if (service && !nested) nested = service.close();
        return id(100);
      },
    });
    const r = await f.service.start();
    assert.equal(r.result.outcome, 'NOT_DISPATCHED');
    assert.deepEqual(f.calls, []);
    assert.equal((await nested).status, 'RETIRED');
  }
});
test('duplicate IDs and regressing clock refuse without a second native operation', async () => {
  const duplicate = fixture({ id: () => id(77) });
  assert.equal((await duplicate.service.start()).result.outcome, 'NOT_DISPATCHED');
  assert.deepEqual(duplicate.calls, []);
  await duplicate.service.close();
  const f = fixture();
  await f.service.start();
  f.clock(999);
  assert.notEqual((await f.service.health()).result.outcome, 'OBSERVED');
  await f.service.close();
  assert.ok(!f.calls.includes('health'));
});
test('HEALTH limit is per retained foreground attempt and does not block cleanup', async () => {
  const f = fixture();
  await f.service.start();
  for (let n = 0; n < 128; n++) assert.equal((await f.service.health()).result.code, 'OK');
  assert.equal((await f.service.health()).result.code, 'BUSY');
  assert.equal(f.calls.filter((c) => c === 'health').length, 128);
  assert.equal((await f.service.close()).status, 'RETIRED');
});
test('ordinary STOP does not wait on its audit before physical retirement', async () => {
  const audit = deferred(),
    f = fixture({
      audit: (e) =>
        e.request.operation === 'SERVER_STOP' && e.phase === 'INTENT' ? audit.promise : 'AVAILABLE',
    });
  await f.service.start();
  const stop = f.service.stop();
  await tick();
  assert.ok(f.calls.includes('retire'));
  assert.equal(f.held(), false);
  audit.resolve('DEGRADED');
  const r = await stop;
  assert.equal(r.kind, 'OPERATION');
  assert.equal(r.result.outcome, 'OBSERVED');
  assert.equal(r.auditHealth, 'DEGRADED');
  await f.service.close();
});

test('single shutdown deadline covers pending audit concurrently and late retirement never reopens', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audit = deferred(),
    f = fixture({ audit: () => audit.promise });
  const start = f.service.start();
  await tick();
  const close = f.service.close();
  assert.equal(f.closes(), 1);
  t.mock.timers.tick(120000);
  await tick();
  assert.equal((await close).status, 'UNRETIRED');
  assert.equal(f.service.retired, false);
  assert.deepEqual(f.calls, []);
  audit.resolve('AVAILABLE');
  await start;
  await tick();
  assert.equal(f.service.retired, true);
  assert.equal((await f.service.start()).result.code, 'CLOSED');
  assert.equal((await f.service.close()).status, 'UNRETIRED');
});
test('pending HEALTH cleanup preempts response and revoked RESULT cannot publish current READY', async () => {
  const pending = deferred(),
    f = fixture({ health: () => pending.promise });
  await f.service.start();
  const health = f.service.health();
  await tick();
  const close = f.service.stop();
  assert.equal(f.closes(), 1);
  await tick();
  pending.resolve(facts('HEALTHY'));
  assert.notEqual((await health).result.outcome, 'OBSERVED');
  assert.equal((await close).status, 'RETIRED');
  let revoke = false;
  const g = fixture({
    audit: async (e) => {
      if (e.phase === 'RESULT') revoke = true;
      return 'AVAILABLE';
    },
    current() {
      if (revoke) throw Error('PRIVATE_REVOKED');
    },
  });
  assert.notEqual((await g.service.start()).result.outcome, 'OBSERVED');
  assert.equal((await g.service.close()).status, 'RETIRED');
  assert.equal(g.held(), false);
});
test('configuration is captured and ordinary owner loss triggers cleanup without granting shutdown authority', async () => {
  const f = fixture();
  f.options.ownerId = id(999);
  f.options.expectedInstallationRevision = 99;
  f.options.newId = () => {
    throw Error('mutated');
  };
  assert.equal((await f.service.start()).result.code, 'OK');
  f.revoke();
  assert.equal((await f.service.health()).result.code, 'NOT_AUTHORIZED');
  assert.equal((await f.service.close()).status, 'RETIRED');
  assert.equal(f.held(), false);
});

test('unconfirmed native health is not success and requests retained cleanup without replay', async () => {
  const f = fixture({
    health: async () => {
      throw Error('PRIVATE_NATIVE');
    },
  });
  await f.service.start();
  const r = await f.service.health();
  assert.notEqual(r.result.outcome, 'OBSERVED');
  assert.equal(f.closes(), 1);
  assert.equal((await f.service.close()).status, 'RETIRED');
  assert.equal(f.calls.filter((x) => x === 'health').length, 1);
  assert.ok(!JSON.stringify(f.events).includes('PRIVATE_NATIVE'));
});

test('RESULT audit invalidation of held custody denies publication even with ordinary ownership intact', async () => {
  let f;
  f = fixture({
    audit: async (record) => {
      if (record.phase === 'RESULT') f.invalidateRead();
      return 'AVAILABLE';
    },
  });
  const r = await f.service.start();
  assert.notEqual(r.result.outcome, 'OBSERVED');
  assert.equal(f.closes(), 1);
  assert.equal((await f.service.close()).status, 'RETIRED');
  assert.equal(f.held(), false);
  assert.ok(f.calls.includes('retire'));
});
test('final clock invalidation is checked by retained-token assertion before publication', async () => {
  let afterResult = false,
    f;
  f = fixture({
    audit: async (record) => {
      if (record.phase === 'RESULT') afterResult = true;
      return 'AVAILABLE';
    },
    clock: () => {
      if (afterResult) f.invalidateRead();
    },
  });
  assert.notEqual((await f.service.start()).result.outcome, 'OBSERVED');
  assert.equal((await f.service.close()).status, 'RETIRED');
  assert.equal(f.held(), false);
});
