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
        acquireInput(cap, request) {
          calls.push('input');
          return extra.input(cap, request);
        },
        acquireMetadata(cap, request) {
          calls.push('metadata');
          return extra.metadata(cap, request);
        },
        acquireDiscovery(cap, request) {
          calls.push('discover');
          return extra.acquire(cap, request);
        },
        assertCurrentSession() {
          assert.equal(adapter.snapshot().state, 'READY');
          custody.assertRead(read);
        },
        assertDiscoveryEpochCurrent() {
          assert.equal(adapter.snapshot().state, 'READY');
          custody.assertRead(read);
        },
        discoveryEpochWitness() {
          return Object.freeze({
            get valid() {
              return (
                adapter.snapshot().state === 'READY' &&
                !adapter.snapshot().closed &&
                held &&
                leaseValid
              );
            },
          });
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
  service = (extra.createService ?? createAdbServerService)(options);
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
// Explicit test-only native-issuer admission transform. Real runtime/default binding proof is NOT supplied.
async function transformedService() {
  const { readFileSync } = await import('node:fs');
  const { transformSync } = await import('esbuild');
  const path = new URL('../src/main/adb-server-service.ts', import.meta.url);
  let source = readFileSync(path, 'utf8');
  assert.equal(source.split('!isRealHostFactory(factory)').length, 2);
  source = source.replace(
    '!isRealHostFactory(factory)',
    'false /* SYNTHETIC_TEST_ONLY_FACTORY_ADMISSION */',
  );
  source = source.replace(
    /from '(\.\/[^']+)'/g,
    (_, relative) => `from '${new URL(relative, path).href}'`,
  );
  const code = transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const acquisition = (raw = '', extra = {}) =>
  Object.freeze({
    version: 1,
    kind: 'ACQUISITION',
    status: 'COMPLETE',
    code: 'OK',
    dispatched: true,
    operationRetired: true,
    payloadBase64: Buffer.from(raw).toString('base64'),
    observedAtUtc: 1000,
    ...extra,
  });
const acquired = (facts = acquisition()) =>
  Object.freeze({
    result: Promise.resolve(facts),
    retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
  });
const query = (record) =>
  Object.freeze({ requestId: id(700), epoch: record.epoch, sequence: 1, deadlineUtc: 31000 });
test('production native provider issuer refuses injected factory even after actual adapter START', async () => {
  const { inspectOwnedDiscoveryProvider } = await import('../src/main/adb-server-service.ts');
  const f = fixture();
  try {
    await f.service.start();
    assert.throws(() => f.service.discoveryProvider(), /NOT_READY/);
    assert.equal(inspectOwnedDiscoveryProvider({ ownedDiscovery: true }), null);
  } finally {
    await f.service.close();
  }
});
test('transformed-only issuer holds service lane through query retirement without retiring foreground holder', async () => {
  const module = await transformedService(),
    retirement = deferred();
  const f = fixture({
    createService: module.createAdbServerService,
    acquire: () =>
      Object.freeze({
        result: Promise.resolve(acquisition('synthetic device transport_id:1\n')),
        retirement: retirement.promise,
      }),
  });
  try {
    assert.throws(() => f.service.discoveryProvider());
    await f.service.start();
    const provider = f.service.discoveryProvider(),
      record = module.inspectOwnedDiscoveryProvider(provider);
    assert.ok(record);
    const handle = record.begin(query(record));
    await tick();
    assert.equal((await f.service.health()).result.code, 'BUSY');
    assert.equal(f.held(), true);
    retirement.resolve(Object.freeze({ status: 'RETIRED' }));
    assert.equal((await handle.result).outcome, 'COMPLETE');
    assert.deepEqual(await handle.retirement, { status: 'RETIRED' });
    assert.equal(f.held(), true);
    assert.equal(f.closes(), 0);
    assert.equal(f.service.snapshot().state, 'READY');
  } finally {
    await f.service.close();
  }
});
test('pending HEALTH RESULT audit causes settled local refusal without native handoff or cleanup', async () => {
  const module = await transformedService(),
    audit = deferred();
  let hold = false;
  const f = fixture({
    createService: module.createAdbServerService,
    acquire: () => acquired(),
    audit: (event) => (hold && event.phase === 'RESULT' ? audit.promise : 'AVAILABLE'),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    hold = true;
    const health = f.service.health();
    await tick();
    const handle = record.begin(query(record));
    assert.equal((await handle.result).outcome, 'FAILED');
    assert.deepEqual(await handle.retirement, { status: 'RETIRED' });
    assert.equal(f.calls.includes('discover'), false);
    assert.equal(record.revoked, false);
    assert.equal(f.closes(), 0);
    audit.resolve('AVAILABLE');
    await health;
  } finally {
    await f.service.close();
  }
});
test('native failed query revokes epoch and immediately starts cleanup while retirement remains pending', async () => {
  const module = await transformedService(),
    retirement = deferred();
  const f = fixture({
    createService: module.createAdbServerService,
    acquire: () =>
      Object.freeze({
        result: Promise.resolve(
          acquisition('', {
            status: 'FAILED',
            code: 'BUSY',
            payloadBase64: null,
            observedAtUtc: null,
          }),
        ),
        retirement: retirement.promise,
      }),
  });
  await f.service.start();
  const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
  const handle = record.begin(query(record));
  await tick();
  assert.equal(record.revoked, true);
  assert.equal(f.closes(), 1);
  retirement.resolve(Object.freeze({ status: 'RETIRED' }));
  assert.equal((await handle.result).outcome, 'FAILED');
  assert.deepEqual(await handle.retirement, { status: 'RETIRED' });
  assert.equal(f.held(), false);
  assert.throws(() => f.service.discoveryProvider());
  await f.service.close();
});
test('STOP during pending query preempts through factory cleanup and never promotes late complete result', async () => {
  const module = await transformedService(),
    result = deferred(),
    retirement = deferred();
  const f = fixture({
    createService: module.createAdbServerService,
    acquire: () => Object.freeze({ result: result.promise, retirement: retirement.promise }),
  });
  await f.service.start();
  const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
  const handle = record.begin(query(record));
  await tick();
  const stop = f.service.stop();
  assert.equal(f.closes(), 1);
  assert.equal(record.revoked, true);
  result.resolve(acquisition());
  retirement.resolve(Object.freeze({ status: 'RETIRED' }));
  assert.equal((await handle.result).outcome, 'FAILED');
  assert.equal((await stop).kind, 'CLEANUP');
  assert.equal(f.held(), false);
});
test('transformed-only discovery cap128 and malformed byte payloads cannot gain additional native observation', async () => {
  const module = await transformedService();
  const f = fixture({ createService: module.createAdbServerService, acquire: () => acquired() });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    for (let i = 0; i < 128; i++) {
      const handle = record.begin(query(record));
      assert.equal((await handle.result).outcome, 'COMPLETE');
      await handle.retirement;
    }
    const refused = record.begin(query(record));
    assert.equal((await refused.result).outcome, 'FAILED');
    await refused.retirement;
    assert.equal(f.calls.filter((c) => c === 'discover').length, 128);
    assert.equal(f.closes(), 0);
  } finally {
    await f.service.close();
  }
  for (const payloadBase64 of [
    ' Zm9v',
    Buffer.from('\ufeff').toString('base64'),
    Buffer.from('List of devices attached\n').toString('base64'),
  ]) {
    const g = fixture({
      createService: module.createAdbServerService,
      acquire: () => acquired(acquisition('', { payloadBase64 })),
    });
    try {
      await g.service.start();
      const record = module.inspectOwnedDiscoveryProvider(g.service.discoveryProvider());
      const handle = record.begin(query(record));
      assert.equal((await handle.result).outcome, 'FAILED');
      await handle.retirement;
      assert.equal(record.revoked, true);
      assert.equal(g.held(), false);
    } finally {
      await g.service.close();
    }
  }
});

const metadataFacts = (extra = {}) =>
  Object.freeze({
    version: 1,
    kind: 'METADATA_QUERY',
    status: 'COMPLETE',
    code: 'OK',
    dispatched: true,
    operationRetired: true,
    stdoutBase64: Buffer.from('Model\n').toString('base64'),
    stderrBase64: '',
    remoteExitCode: 0,
    observedAtUtc: 1000,
    ...extra,
  });
const metadataHandle = (value = metadataFacts()) =>
  Object.freeze({
    handoff: 'QUERY',
    result: Promise.resolve(value),
    retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
  });
const metadataRequest = (record, n = 1) =>
  Object.freeze({
    requestId: id(900 + n),
    epoch: record.epoch,
    sequence: n,
    transportId: '1',
    field: 'MODEL',
    deadlineUtc: 31000,
  });
test('metadata shares the discovery lane and retains the foreground on known remote nonzero', async () => {
  const module = await transformedService(),
    gate = deferred();
  const f = fixture({
    createService: module.createAdbServerService,
    metadata: () =>
      Object.freeze({
        handoff: 'QUERY',
        result: Promise.resolve(metadataFacts({ remoteExitCode: 7 })),
        retirement: gate.promise,
      }),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    const h = record.beginMetadata(metadataRequest(record));
    await tick();
    const busy = record.beginMetadata(metadataRequest(record, 2));
    assert.equal(busy.handoff, 'LOCAL_REFUSAL');
    assert.equal((await busy.result).code, 'BUSY');
    assert.equal((await record.begin(query(record)).result).outcome, 'FAILED');
    assert.equal(f.calls.filter((x) => x === 'metadata').length, 1);
    assert.equal(f.closes(), 0);
    gate.resolve(Object.freeze({ status: 'RETIRED' }));
    assert.equal((await h.result).remoteExitCode, 7);
    assert.equal((await h.retirement).status, 'RETIRED');
    assert.equal(record.revoked, false);
    assert.equal(f.held(), true);
  } finally {
    gate.resolve(Object.freeze({ status: 'RETIRED' }));
    await f.service.close();
  }
});
test('wire metadata BUSY is not a local refusal and forces cleanup', async () => {
  const module = await transformedService();
  const f = fixture({
    createService: module.createAdbServerService,
    metadata: () =>
      metadataHandle(
        metadataFacts({
          status: 'FAILED',
          code: 'BUSY',
          dispatched: false,
          stdoutBase64: null,
          stderrBase64: null,
          remoteExitCode: null,
          observedAtUtc: null,
        }),
      ),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    const h = record.beginMetadata(metadataRequest(record));
    assert.equal(h.handoff, 'QUERY');
    assert.equal((await h.result).code, 'BUSY');
    assert.equal((await h.retirement).status, 'RETIRED');
    assert.equal(record.revoked, true);
    assert.ok(f.closes() > 0);
  } finally {
    await f.service.close();
  }
});
test('failed metadata starts cleanup before delayed actual query retirement', async () => {
  const module = await transformedService(),
    gate = deferred();
  const f = fixture({
    createService: module.createAdbServerService,
    metadata: () =>
      Object.freeze({
        handoff: 'QUERY',
        result: Promise.resolve(
          metadataFacts({
            status: 'FAILED',
            code: 'NATIVE_FAILED',
            stdoutBase64: null,
            stderrBase64: null,
            remoteExitCode: null,
            observedAtUtc: null,
          }),
        ),
        retirement: gate.promise,
      }),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    const h = record.beginMetadata(metadataRequest(record));
    await tick();
    assert.ok(f.closes() > 0);
    assert.equal(record.revoked, true);
    let done = false;
    h.retirement.then(() => {
      done = true;
    });
    await tick();
    assert.equal(done, false);
    gate.resolve(Object.freeze({ status: 'RETIRED' }));
    await h.result;
    await h.retirement;
  } finally {
    gate.resolve(Object.freeze({ status: 'RETIRED' }));
    await f.service.close();
  }
});

test('metadata and discovery share one total128 query budget', async () => {
  const module = await transformedService();
  const f = fixture({
    createService: module.createAdbServerService,
    acquire: () => acquired(),
    metadata: () => metadataHandle(),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    for (let n = 1; n <= 127; n++) {
      const h = record.begin(
        Object.freeze({
          requestId: id(1000 + n),
          epoch: record.epoch,
          sequence: n,
          deadlineUtc: 31000,
        }),
      );
      assert.equal((await h.result).outcome, 'COMPLETE');
      await h.retirement;
    }
    const final = record.beginMetadata(metadataRequest(record));
    assert.equal((await final.result).status, 'COMPLETE');
    await final.retirement;
    const exhausted = record.beginMetadata(metadataRequest(record, 2));
    assert.equal((await exhausted.result).status, 'FAILED');
    await exhausted.retirement;
    assert.equal(f.calls.filter((x) => x === 'discover').length, 127);
    assert.equal(f.calls.filter((x) => x === 'metadata').length, 1);
  } finally {
    await f.service.close();
  }
});

test('unattachable metadata handle retains uncertain service lane despite factory cleanup', async (t) => {
  const module = await transformedService();
  const hostile = Promise.resolve(metadataFacts());
  Object.defineProperty(hostile, 'then', {
    value: () => assert.fail('hostile then must not execute'),
  });
  const f = fixture({
    createService: module.createAdbServerService,
    metadata: () =>
      Object.freeze({
        handoff: 'QUERY',
        result: hostile,
        retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
      }),
  });
  await f.service.start();
  const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
  const h = record.beginMetadata(metadataRequest(record));
  assert.equal((await h.result).status, 'FAILED');
  assert.equal((await h.retirement).status, 'UNRETIRED');
  assert.equal(record.revoked, true);
  assert.ok(f.closes() > 0);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const close = f.service.close();
  t.mock.timers.tick(120000);
  assert.equal((await close).status, 'UNRETIRED');
  assert.equal(f.service.retired, false);
  t.mock.timers.reset();
});

test('metadata reserves ordinary lane before hostile descriptor inspection can reenter', async () => {
  const module = await transformedService();
  const f = fixture({
    createService: module.createAdbServerService,
    metadata: () => metadataHandle(),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    let nested;
    const hostile = new Proxy(metadataRequest(record), {
      ownKeys(target) {
        nested = record.beginMetadata(metadataRequest(record, 2));
        return Reflect.ownKeys(target);
      },
    });
    const outer = record.beginMetadata(hostile);
    assert.equal(nested.handoff, 'LOCAL_REFUSAL');
    assert.equal((await nested.result).code, 'BUSY');
    assert.equal((await outer.result).status, 'COMPLETE');
    await outer.retirement;
    assert.equal(f.calls.filter((x) => x === 'metadata').length, 1);
  } finally {
    await f.service.close();
  }
});

const inputFacts = (extra = {}) =>
  Object.freeze({
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
    ...extra,
  });
const inputHandle = (value = inputFacts()) =>
  Object.freeze({
    handoff: 'QUERY',
    result: Promise.resolve(value),
    retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
  });
const inputRequest = (record, n = 1) =>
  Object.freeze({
    requestId: id(1900 + n),
    epoch: record.epoch,
    sequence: n,
    transportId: '1',
    action: 'HOME',
    deadlineUtc: 31000,
  });
test('input shares the discovery lane and retains the foreground on known remote nonzero', async () => {
  const module = await transformedService(),
    gate = deferred();
  const f = fixture({
    createService: module.createAdbServerService,
    input: () =>
      Object.freeze({
        handoff: 'QUERY',
        result: Promise.resolve(inputFacts({ remoteExitCode: 7 })),
        retirement: gate.promise,
      }),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    const h = record.beginInput(inputRequest(record));
    await tick();
    const busy = record.beginInput(inputRequest(record, 2));
    assert.equal(busy.handoff, 'LOCAL_REFUSAL');
    assert.equal((await record.beginMetadata(metadataRequest(record, 2)).result).code, 'BUSY');
    assert.equal((await busy.result).code, 'BUSY');
    assert.equal((await record.begin(query(record)).result).outcome, 'FAILED');
    assert.equal(f.calls.filter((x) => x === 'input').length, 1);
    assert.equal(f.closes(), 0);
    gate.resolve(Object.freeze({ status: 'RETIRED' }));
    assert.equal((await h.result).remoteExitCode, 7);
    assert.equal((await h.retirement).status, 'RETIRED');
    assert.equal(record.revoked, false);
    assert.equal(f.held(), true);
  } finally {
    gate.resolve(Object.freeze({ status: 'RETIRED' }));
    await f.service.close();
  }
});
test('wire input BUSY is not a local refusal and forces cleanup', async () => {
  const module = await transformedService();
  const f = fixture({
    createService: module.createAdbServerService,
    input: () =>
      inputHandle(
        inputFacts({
          status: 'FAILED',
          code: 'BUSY',
          dispatched: false,
          stdoutEmpty: null,
          stderrEmpty: null,
          remoteExitCode: null,
          observedAtUtc: null,
        }),
      ),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    const h = record.beginInput(inputRequest(record));
    assert.equal(h.handoff, 'QUERY');
    assert.equal((await h.result).code, 'BUSY');
    assert.equal((await h.retirement).status, 'RETIRED');
    assert.equal(record.revoked, true);
    assert.ok(f.closes() > 0);
  } finally {
    await f.service.close();
  }
});
test('failed input starts cleanup before delayed actual query retirement', async () => {
  const module = await transformedService(),
    gate = deferred();
  const f = fixture({
    createService: module.createAdbServerService,
    input: () =>
      Object.freeze({
        handoff: 'QUERY',
        result: Promise.resolve(
          inputFacts({
            status: 'FAILED',
            code: 'NATIVE_FAILED',
            stdoutEmpty: null,
            stderrEmpty: null,
            remoteExitCode: null,
            observedAtUtc: null,
          }),
        ),
        retirement: gate.promise,
      }),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    const h = record.beginInput(inputRequest(record));
    await tick();
    assert.ok(f.closes() > 0);
    assert.equal(record.revoked, true);
    let done = false;
    h.retirement.then(() => {
      done = true;
    });
    await tick();
    assert.equal(done, false);
    gate.resolve(Object.freeze({ status: 'RETIRED' }));
    await h.result;
    await h.retirement;
  } finally {
    gate.resolve(Object.freeze({ status: 'RETIRED' }));
    await f.service.close();
  }
});

test('input and discovery share one total128 query budget', async () => {
  const module = await transformedService();
  const f = fixture({
    createService: module.createAdbServerService,
    acquire: () => acquired(),
    input: () => inputHandle(),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    for (let n = 1; n <= 127; n++) {
      const h = record.begin(
        Object.freeze({
          requestId: id(1000 + n),
          epoch: record.epoch,
          sequence: n,
          deadlineUtc: 31000,
        }),
      );
      assert.equal((await h.result).outcome, 'COMPLETE');
      await h.retirement;
    }
    const final = record.beginInput(inputRequest(record));
    assert.equal((await final.result).status, 'COMPLETE');
    await final.retirement;
    const exhausted = record.beginInput(inputRequest(record, 2));
    assert.equal((await exhausted.result).status, 'FAILED');
    await exhausted.retirement;
    assert.equal(f.calls.filter((x) => x === 'discover').length, 127);
    assert.equal(f.calls.filter((x) => x === 'input').length, 1);
  } finally {
    await f.service.close();
  }
});

test('unattachable input handle retains uncertain service lane despite factory cleanup', async (t) => {
  const module = await transformedService();
  const hostile = Promise.resolve(inputFacts());
  Object.defineProperty(hostile, 'then', {
    value: () => assert.fail('hostile then must not execute'),
  });
  const f = fixture({
    createService: module.createAdbServerService,
    input: () =>
      Object.freeze({
        handoff: 'QUERY',
        result: hostile,
        retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
      }),
  });
  await f.service.start();
  const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
  const h = record.beginInput(inputRequest(record));
  assert.equal((await h.result).status, 'FAILED');
  assert.equal((await h.retirement).status, 'UNRETIRED');
  assert.equal(record.revoked, true);
  assert.ok(f.closes() > 0);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const close = f.service.close();
  t.mock.timers.tick(120000);
  assert.equal((await close).status, 'UNRETIRED');
  assert.equal(f.service.retired, false);
  t.mock.timers.reset();
});

test('input reserves ordinary lane before hostile descriptor inspection can reenter', async () => {
  const module = await transformedService();
  const f = fixture({
    createService: module.createAdbServerService,
    input: () => inputHandle(),
  });
  try {
    await f.service.start();
    const record = module.inspectOwnedDiscoveryProvider(f.service.discoveryProvider());
    let nested;
    const hostile = new Proxy(inputRequest(record), {
      ownKeys(target) {
        nested = record.beginInput(inputRequest(record, 2));
        return Reflect.ownKeys(target);
      },
    });
    const outer = record.beginInput(hostile);
    assert.equal(nested.handoff, 'LOCAL_REFUSAL');
    assert.equal((await nested.result).code, 'BUSY');
    assert.equal((await outer.result).status, 'COMPLETE');
    await outer.retirement;
    assert.equal(f.calls.filter((x) => x === 'input').length, 1);
  } finally {
    await f.service.close();
  }
});
