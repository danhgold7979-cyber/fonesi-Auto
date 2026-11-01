import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { transformSync } from 'esbuild';
import { FoundationDatabase } from '../src/main/foundation-database.ts';
import { createDurableCoordinator } from '../src/main/durable-coordinator.ts';
import { createRegistryStore } from '../src/main/registry-store.ts';
import { createAdbDiscoveryService as originalIngestion } from '../src/main/adb-discovery-service.ts';
import { inspectOwnedDiscoveryProvider as originalInspector } from '../src/main/adb-server-service.ts';
import { validDiscoveryAuditTuple } from '../src/discovery-audit-contract.ts';
import { parseDiscoveryResponse } from '../src/discovery-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
const moduleUrl = (source, path) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    transformSync(
      source.replace(
        /from '(\.\.?\/[^']+)'/g,
        (_, relative) => `from '${new URL(relative, path).href}'`,
      ),
      { loader: 'ts', format: 'esm', target: 'es2022' },
    ).code,
  ).toString('base64');
// Only real-native factory recognition is replaced. Real server/ingestion/private WeakMaps,
// facade, coordinator, RegistryStore and owned SQLite execute; native facts are injected.
const serverPath = new URL('../src/main/adb-server-service.ts', import.meta.url);
const rawServer = readFileSync(serverPath, 'utf8');
assert.equal(rawServer.split('!isRealHostFactory(factory)').length, 2);
const serverUrl = moduleUrl(
  rawServer.replace('!isRealHostFactory(factory)', 'false /* SYNTHETIC_ADMISSION_TEST_ONLY */'),
  serverPath,
);
const { createAdbServerService } = await import(serverUrl);
const ingestPath = new URL('../src/main/adb-discovery-service.ts', import.meta.url);
const { createAdbDiscoveryService } = await import(
  moduleUrl(
    readFileSync(ingestPath, 'utf8').replace(
      "'./adb-server-service.ts'",
      JSON.stringify(serverUrl),
    ),
    ingestPath,
  )
);
const facadePath = new URL('../src/main/discovery-session-service.ts', import.meta.url);
const { createDiscoverySessionService } = await import(
  moduleUrl(
    readFileSync(facadePath, 'utf8').replace(
      "'./adb-server-service.ts'",
      JSON.stringify(serverUrl),
    ),
    facadePath,
  )
);
async function fixture(extra = {}) {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(realpathSync(base), 'discovery-session-')),
    storeId = randomUUID(),
    db = new FoundationDatabase(join(root, 'active.sqlite'), storeId);
  await db.migrate(async (version) => {
    const path = join(root, `snapshot-${version}.sqlite`);
    await db.snapshot(path);
    const s = new FoundationDatabase(path, storeId, true);
    try {
      return { backupId: randomUUID(), schemaVersion: version, fingerprint: s.fingerprint() };
    } finally {
      s.close();
    }
  }, 1000);
  let n = 100,
    held = null,
    live = true,
    factoryClosed = false,
    factoryState = 'STOPPED',
    starts = 0,
    queries = 0,
    closes = 0,
    acquires = 0,
    releases = 0;
  const next = () => id(n++),
    events = [];
  let committing = false;
  const coordinator = createDurableCoordinator({
    db: {
      readDurable: () => db.readDurable(),
      commitDurable: (revision, delta, admit) =>
        db.commitDurable(revision, delta, () => {
          committing = true;
          try {
            admit();
          } finally {
            committing = false;
          }
        }),
    },
    assertOwnedSync: () => extra.durableOwner?.(committing),
    clock: () => 1000,
    newId: next,
    audit: async (e) => {
      await extra.durableAudit?.(e);
      return 'AVAILABLE';
    },
  });
  const registry = createRegistryStore({
    coordinator,
    nextId: next,
    quarantined: () => false,
    assertOwnedSync: () => {},
  });
  await registry.startup();
  const custody = {
    async acquireRead() {
      acquires++;
      await extra.acquire?.();
      if (held) return { ok: false, code: 'BUSY' };
      held = Object.freeze({});
      return {
        ok: true,
        status: 'READ_VERIFIED_ONLY',
        token: held,
        observation: Object.freeze({ installationRevision: 1 }),
      };
    },
    assertRead(t) {
      assert.equal(t, held);
    },
    assertReadInternal(t) {
      assert.equal(t, held);
      assert.equal(live, true);
    },
    async releaseRead(t) {
      releases++;
      assert.equal(t, held);
      await extra.release?.();
      if (extra.releaseUnknown) return { ok: true, status: 'UNRETIRED' };
      held = null;
      return { ok: true, status: 'RETIRED' };
    },
  };
  const facade = createDiscoverySessionService({
    custody,
    assertOwnedSync: () => extra.owner?.(),
    clock: () => 1000,
    newId: () => extra.id?.() ?? next(),
    policy: () => extra.policy ?? null,
    readDurableRevision: () => {
      extra.readRevision?.();
      return db.readDurable().meta.revision;
    },
    audit: async (e) => {
      assert.equal(validDiscoveryAuditTuple(e), true, JSON.stringify(e));
      events.push(e);
      return (await extra.audit?.(e)) ?? 'AVAILABLE';
    },
    createServer(revision, current, audit) {
      starts++;
      assert.equal(revision, 1);
      return createAdbServerService({
        ownerId: id(1),
        expectedInstallationRevision: revision,
        assertOwnedSync: () => {},
        assertCurrentSync: current,
        clock: () => 1000,
        newId: next,
        audit,
        createFactory() {
          return {
            grant: () => Object.freeze({}),
            snapshot: () =>
              Object.freeze({ state: factoryState, busy: false, closed: factoryClosed }),
            async execute() {
              await extra.start?.();
              factoryState = 'READY';
              return Object.freeze({ outcome: 'OBSERVED', code: 'OK', diagnosticId: null });
            },
            assertCurrentSession() {
              assert.equal(factoryState, 'READY');
              assert.equal(live, true);
            },
            assertDiscoveryEpochCurrent() {
              assert.equal(factoryState, 'READY');
              assert.equal(live, true);
            },
            discoveryEpochWitness() {
              return Object.freeze({
                get valid() {
                  return live && !factoryClosed && factoryState === 'READY';
                },
              });
            },
            assertRetiredSession() {
              assert.equal(factoryState, 'STOPPED');
            },
            get retired() {
              return factoryClosed;
            },
            async close() {
              closes++;
              factoryClosed = true;
              factoryState = 'STOPPED';
              await extra.close?.();
              return 'RETIRED';
            },
            acquireDiscovery() {
              queries++;
              return Object.freeze({
                result: Promise.resolve().then(async () => {
                  await extra.query?.();
                  return Object.freeze({
                    version: 1,
                    kind: 'ACQUISITION',
                    status: 'COMPLETE',
                    code: 'OK',
                    dispatched: true,
                    operationRetired: true,
                    payloadBase64: Buffer.from(
                      extra.rows ?? 'private-device device transport_id:1\n',
                    ).toString('base64'),
                    observedAtUtc: 1000,
                  });
                }),
                retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
              });
            },
          };
        },
      });
    },
    createIngestion(provider, current) {
      assert.equal(originalInspector(provider), null); // Deliberately separate test-transformed module instance.
      return (extra.foreignModule ? originalIngestion : createAdbDiscoveryService)({
        provider,
        registry,
        readDurableRevision: () => db.readDurable().meta.revision,
        assertOwnedSync: current,
        clock: () => 1000,
        newId: next,
      });
    },
  });
  let request = 0;
  const call = async (method, fields = {}, current = () => true) => {
    const raw = await facade.execute(
      { version: 1, requestId: `p${++request}`, method: 'discovery.' + method, ...fields },
      current,
    );
    const parsed = parseDiscoveryResponse(raw);
    assert.ok(parsed, raw);
    return JSON.parse(raw);
  };
  return {
    facade,
    db,
    registry,
    events,
    call,
    revokeHolder() {
      live = false;
    },
    get held() {
      return held;
    },
    get starts() {
      return starts;
    },
    get queries() {
      return queries;
    },
    get closes() {
      return closes;
    },
    get acquires() {
      return acquires;
    },
    get releases() {
      return releases;
    },
    async terminal() {
      for (let i = 0; i < 100; i++) {
        await tick();
        const r = await call('get');
        if (r.ok && !['STARTING', 'REFRESHING', 'STOPPING'].includes(r.snapshot.state)) return r;
      }
      throw Error('TEST_TERMINAL');
    },
    async cleanup() {
      await facade.close();
      registry.close();
      await coordinator.close();
      db.close();
      assert.equal(realpathSync(root), root);
      rmSync(root, { recursive: true });
    },
  };
}
test('owned SQLite composition: explicit Start/Refresh/Stop preserves durable history and forbids restart', async () => {
  const f = await fixture();
  try {
    const read = await f.call('get');
    assert.equal(read.snapshot.state, 'IDLE');
    assert.equal(f.starts, 0);
    assert.equal(f.queries, 0);
    assert.equal(f.held, null);
    const start = await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
    assert.equal(start.outcome, 'PENDING');
    assert.equal((await f.terminal()).snapshot.lastOutcome, 'STARTED');
    const refresh = await f.call('refresh', { expectedRevision: 2 });
    assert.equal(refresh.outcome, 'PENDING');
    const done = await f.terminal();
    assert.equal(done.snapshot.lastOutcome, 'COMMITTED');
    assert.equal(f.db.readDurable().meta.revision, 2);
    assert.equal(f.facade.availability(), 'OBSERVED');
    assert.equal(f.facade.snapshot().devices[0].verification, 'PROVISIONAL');
    const before = f.db.fingerprint();
    await f.call('stop');
    assert.equal((await f.terminal()).snapshot.state, 'STOPPED');
    assert.equal(f.db.fingerprint(), before);
    assert.equal(f.facade.snapshot(), null);
    assert.equal(f.facade.availability(), 'LIVE_DISCOVERY_UNAVAILABLE');
    assert.equal(
      (await f.call('start', { expectedRevision: 6, expectedInstallationRevision: 1 })).code,
      'RESTART_REQUIRED',
    );
    assert.equal(f.starts, 1);
    assert.equal(f.queries, 1);
  } finally {
    await f.cleanup();
  }
});
test('prestart Stop settles separately; subsequent real Stop drains new actual attempt', async () => {
  const f = await fixture();
  try {
    await f.call('stop');
    const stopped = await f.terminal();
    assert.equal(stopped.snapshot.restartRequired, false);
    await f.call('start', { expectedRevision: 2, expectedInstallationRevision: 1 });
    assert.equal((await f.terminal()).snapshot.state, 'READY');
    await f.call('stop');
    assert.equal((await f.terminal()).snapshot.state, 'STOPPED');
    assert.equal(f.starts, 1);
    assert.equal(f.closes, 1);
  } finally {
    await f.cleanup();
  }
});
test('false ViewSession callback, stale CAS/install and denied audit cause zero server construction', async () => {
  for (const mode of ['session', 'cas', 'install', 'audit']) {
    const f = await fixture({ audit: () => (mode === 'audit' ? 'DEGRADED' : 'AVAILABLE') });
    try {
      const r = await f.call(
        'start',
        {
          expectedRevision: mode === 'cas' ? 1 : 0,
          expectedInstallationRevision: mode === 'install' ? 2 : 1,
        },
        () => mode !== 'session',
      );
      assert.equal(r.ok, false);
      assert.equal(f.starts, 0);
      assert.equal(f.queries, 0);
      assert.equal(f.held, null);
    } finally {
      await f.cleanup();
    }
  }
});
test('Stop preempts pending request audit and prevents late construction in same document', async () => {
  const gate = deferred();
  let entered = false;
  const f = await fixture({
    audit: (e) => {
      if (e.operation === 'START' && e.stage === 'REQUEST' && e.phase === 'INTENT') {
        entered = true;
        return gate.promise;
      }
      return 'AVAILABLE';
    },
  });
  try {
    const start = f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
    while (!entered) await tick();
    await f.call('stop');
    assert.equal(f.facade.retired, false);
    assert.equal(f.starts, 0);
    gate.resolve('AVAILABLE');
    assert.equal((await start).ok, false);
    assert.equal((await f.terminal()).snapshot.state, 'STOPPED');
    assert.equal(f.starts, 0);
  } finally {
    gate.resolve('AVAILABLE');
    await f.cleanup();
  }
});
test('Stop retains pending temporary read acquisition/release promises and denies late read publication', async () => {
  for (const phase of ['acquire', 'release']) {
    const gate = deferred();
    let entered = false;
    const f = await fixture({
      [phase]: () => {
        entered = true;
        return gate.promise;
      },
    });
    try {
      const read = f.call('get');
      while (!entered) await tick();
      await f.call('stop');
      assert.equal(f.facade.retired, false);
      gate.resolve();
      assert.equal((await read).ok, false);
      assert.equal((await f.terminal()).snapshot.state, 'STOPPED');
      assert.equal(f.releases, 1);
      assert.equal(f.held, null);
      assert.equal(f.starts, 0);
    } finally {
      gate.resolve();
      await f.cleanup();
    }
  }
});
test('unknown temporary release never publishes idle or cleanup retirement', async () => {
  const f = await fixture({ releaseUnknown: true });
  try {
    const r = await f.call('get');
    assert.equal(r.outcome, 'OUTCOME_UNKNOWN');
    assert.equal(
      (await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 })).outcome,
      'OUTCOME_UNKNOWN',
    );
    await f.call('stop');
    assert.equal((await f.call('get')).outcome, 'OUTCOME_UNKNOWN');
    assert.equal(await f.facade.close(), 'UNRETIRED');
    assert.equal(f.facade.retired, false);
  } finally {
    await f.cleanup();
  }
});
test('known SQLite COMMITTED survives RESULT revocation and never becomes rollback', async () => {
  let f,
    armed = false;
  f = await fixture({
    durableAudit: (e) => {
      if (armed && e.operation === 'RECONCILE' && e.phase === 'RESULT') f.revokeHolder();
    },
  });
  try {
    await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
    await f.terminal();
    armed = true;
    await f.call('refresh', { expectedRevision: 2 });
    const result = await f.terminal();
    assert.equal(result.snapshot.lastOutcome, 'COMMITTED');
    assert.equal(result.snapshot.state, 'FAILED');
    assert.equal(f.db.readDurable().meta.revision, 2);
    assert.equal(f.facade.snapshot(), null);
  } finally {
    await f.cleanup();
  }
});
test('no-resource Stop audit pending blocks Start until actual audit drain', async () => {
  const gate = deferred();
  let entered = false;
  const f = await fixture({
    audit: (e) => {
      if (e.operation === 'STOP' && e.stage === 'EXECUTION') {
        entered = true;
        return gate.promise;
      }
      return 'AVAILABLE';
    },
  });
  try {
    await f.call('stop');
    while (!entered) await tick();
    assert.equal(
      (await f.call('start', { expectedRevision: 1, expectedInstallationRevision: 1 })).code,
      'BUSY',
    );
    assert.equal(f.facade.retired, false);
    gate.resolve('AVAILABLE');
    assert.equal((await f.terminal()).snapshot.state, 'STOPPED');
    assert.equal(f.starts, 0);
  } finally {
    gate.resolve('AVAILABLE');
    await f.cleanup();
  }
});

test('preflight final callback-free holder fence refuses owner callback invalidation and releases exact holder', async () => {
  let f,
    armed = false;
  f = await fixture({
    owner: () => {
      if (armed && f.held) f.revokeHolder();
    },
  });
  try {
    armed = true;
    assert.equal((await f.call('get')).ok, false);
    assert.equal(f.held, null);
    assert.equal(f.releases, 1);
    assert.equal(f.starts, 0);
  } finally {
    await f.cleanup();
  }
});
test('Stop preempts pending real private START and repeated Stop shares cleanup', async () => {
  const gate = deferred();
  let entered = false;
  const f = await fixture({
    start: () => {
      entered = true;
      return gate.promise;
    },
  });
  try {
    await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
    while (!entered) await tick();
    const a = await f.call('stop'),
      b = await f.call('stop');
    assert.equal(a.snapshot.operationId, b.snapshot.operationId);
    assert.equal(f.closes, 1);
    assert.equal(f.facade.retired, false);
    gate.resolve();
    assert.equal((await f.terminal()).snapshot.state, 'STOPPED');
    assert.equal(f.queries, 0);
    assert.equal(f.starts, 1);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('Stop drains pending acquisition and prevents late registry projection or reply revival', async () => {
  const gate = deferred();
  let entered = false;
  const f = await fixture({
    query: () => {
      entered = true;
      return gate.promise;
    },
  });
  try {
    await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
    await f.terminal();
    await f.call('refresh', { expectedRevision: 2 });
    while (!entered) await tick();
    await f.call('stop');
    assert.equal(f.facade.retired, false);
    gate.resolve();
    assert.equal((await f.terminal()).snapshot.state, 'STOPPED');
    assert.equal(f.facade.snapshot(), null);
    assert.equal(f.db.readDurable().meta.revision, 1);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('pending EXECUTION result audit never publishes READY and late custody loss preserves known COMMITTED', async () => {
  const gate = deferred();
  let entered = false;
  const f = await fixture({
    audit: (e) => {
      if (e.operation === 'REFRESH' && e.stage === 'EXECUTION' && e.phase === 'RESULT') {
        entered = true;
        return gate.promise;
      }
      return 'AVAILABLE';
    },
  });
  try {
    await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
    await f.terminal();
    await f.call('refresh', { expectedRevision: 2 });
    while (!entered) await tick();
    assert.equal((await f.call('get')).snapshot.state, 'REFRESHING');
    assert.equal(f.facade.snapshot(), null);
    f.revokeHolder();
    gate.resolve('AVAILABLE');
    const result = await f.terminal();
    assert.equal(result.snapshot.state, 'FAILED');
    assert.equal(result.snapshot.lastOutcome, 'COMMITTED');
    assert.equal(f.db.readDurable().meta.revision, 2);
    assert.equal(f.facade.snapshot(), null);
  } finally {
    gate.resolve('AVAILABLE');
    await f.cleanup();
  }
});
test('cleanup still starts when UUID allocation fails; unknown error carries no invented operation', async () => {
  const f = await fixture({ id: () => 'not-a-uuid' });
  try {
    const r = await f.call('stop');
    assert.equal(r.outcome, 'OUTCOME_UNKNOWN');
    assert.equal(r.diagnosticId, null);
    assert.equal(await f.facade.close(), 'RETIRED');
    assert.equal(f.starts, 0);
    assert.equal(f.events.length, 0);
  } finally {
    await f.cleanup();
  }
});

test('actual SQLite final owner invalidates retained holder before COMMIT with unchanged durable history', async () => {
  let f,
    armed = false,
    calls = 0;
  f = await fixture({
    durableOwner: (committing) => {
      if (armed && committing && ++calls === 2) f.revokeHolder();
    },
  });
  try {
    await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
    await f.terminal();
    const before = f.db.fingerprint();
    armed = true;
    await f.call('refresh', { expectedRevision: 2 });
    const result = await f.terminal();
    assert.equal(result.snapshot.lastOutcome, 'NOT_COMMITTED');
    assert.equal(f.db.fingerprint(), before);
    assert.equal(f.db.readDurable().meta.revision, 1);
    assert.equal(f.facade.snapshot(), null);
  } finally {
    await f.cleanup();
  }
});

test('separate native provider module cannot mint this facade ingestion provenance', async () => {
  const f = await fixture({ foreignModule: true });
  try {
    await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
    const result = await f.terminal();
    assert.equal(result.snapshot.state, 'FAILED');
    assert.equal(f.queries, 0);
    assert.equal(f.db.readDurable().meta.revision, 1);
  } finally {
    await f.cleanup();
  }
});
test('actual competing SQLite display commit preserves stale revision NOT_COMMITTED for refresh', async () => {
  const gate = deferred();
  let armed = false,
    entered = false;
  const f = await fixture({
    query: () => {
      if (armed) {
        entered = true;
        return gate.promise;
      }
    },
  });
  try {
    await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
    await f.terminal();
    await f.call('refresh', { expectedRevision: 2 });
    await f.terminal();
    armed = true;
    await f.call('refresh', { expectedRevision: 4 });
    while (!entered) await tick();
    const d = f.db.readDurable().devices[0];
    const changed = await f.registry.display(
      2,
      d.device_id,
      d.generation,
      d.display_profile_revision,
    );
    assert.equal(changed.outcome, 'COMMITTED');
    gate.resolve();
    const result = await f.terminal();
    assert.equal(result.snapshot.lastOutcome, 'NOT_COMMITTED');
    assert.equal(result.snapshot.code, 'STALE_REVISION');
    assert.equal(f.db.readDurable().meta.revision, 3);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('one cleanup deadline reports unknown while retaining pending temporary holder until actual settlement', async () => {
  const gate = deferred();
  let entered = false;
  const f = await fixture({
    release: () => {
      entered = true;
      return gate.promise;
    },
  });
  const originalSet = globalThis.setTimeout,
    originalClear = globalThis.clearTimeout;
  let expiry = null;
  const token = Object.freeze({});
  try {
    const read = f.call('get');
    while (!entered) await tick();
    globalThis.setTimeout = (fn, ms, ...args) => {
      if (ms === 120000) {
        assert.equal(expiry, null);
        expiry = fn;
        return token;
      }
      return originalSet(fn, ms, ...args);
    };
    globalThis.clearTimeout = (t) => {
      if (t !== token) originalClear(t);
    };
    await f.call('stop');
    const closing = f.facade.close();
    assert.equal(typeof expiry, 'function');
    expiry();
    assert.equal(await closing, 'UNRETIRED');
    assert.equal(f.facade.retired, false);
    assert.notEqual(f.held, null);
    gate.resolve();
    await read;
    for (let i = 0; i < 100 && !f.facade.retired; i++) await tick();
    assert.equal(f.facade.retired, true);
    assert.equal(f.held, null);
    assert.equal(f.starts, 0);
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    gate.resolve();
    await f.cleanup();
  }
});

test('ViewSession revocation preempts pending request audit, START and discovery with retained cleanup', async () => {
  for (const phase of ['audit', 'start', 'query']) {
    const gate = deferred();
    let entered = false;
    const pause = () => {
      entered = true;
      return gate.promise;
    };
    const f = await fixture(
      phase === 'audit'
        ? {
            audit: (e) =>
              e.operation === 'START' && e.stage === 'REQUEST' && e.phase === 'INTENT'
                ? pause()
                : 'AVAILABLE',
          }
        : { [phase]: pause },
    );
    let request;
    try {
      if (phase === 'query') {
        await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
        await f.terminal();
        request = f.call('refresh', { expectedRevision: 2 });
      } else request = f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
      while (!entered) await tick();
      f.facade.revoke();
      const closing = f.facade.close();
      assert.equal(f.facade.retired, false);
      assert.equal(f.facade.snapshot(), null);
      assert.equal((await f.call('get')).code, 'SESSION_REVOKED');
      gate.resolve(phase === 'audit' ? 'AVAILABLE' : undefined);
      await request;
      assert.equal(await closing, 'RETIRED');
      assert.equal(f.facade.retired, true);
      assert.equal(f.starts, phase === 'audit' ? 0 : 1);
      assert.equal(f.db.readDurable().meta.revision, 1);
    } finally {
      gate.resolve('AVAILABLE');
      await f.cleanup();
    }
  }
});

test('last idle-read revision callback Stop cannot overwrite cleanup with IDLE', async () => {
  let f,
    stop,
    armed = true;
  const auditGate = deferred();
  f = await fixture({
    readRevision() {
      if (armed) {
        armed = false;
        stop = f.call('stop');
      }
    },
    audit: (e) =>
      e.operation === 'STOP' && e.stage === 'EXECUTION' ? auditGate.promise : 'AVAILABLE',
  });
  try {
    const read = await f.call('get');
    assert.equal(read.ok, false);
    assert.equal(read.code, 'SESSION_REVOKED');
    assert.equal((await stop).snapshot.state, 'STOPPING');
    assert.equal((await f.call('get')).snapshot.state, 'STOPPING');
    assert.equal(f.held, null);
    assert.equal(f.releases, 1);
    assert.equal(f.facade.retired, false);
    assert.equal(f.starts, 0);
    auditGate.resolve('AVAILABLE');
    const terminal = await f.terminal();
    assert.equal(terminal.snapshot.state, 'STOPPED');
    assert.equal(terminal.snapshot.operation, 'STOP');
    assert.equal(terminal.snapshot.lastOutcome, 'CLEANUP_RETIRED');
    assert.equal(f.facade.retired, true);
  } finally {
    auditGate.resolve('AVAILABLE');
    await f.cleanup();
  }
});

test('READ audit completion revocation denies publication without a second result under the same diagnostic', async () => {
  let current = true;
  const f = await fixture({
    audit: (e) => {
      if (e.operation === 'READ' && e.outcome === 'OBSERVED') current = false;
      return 'AVAILABLE';
    },
  });
  try {
    const reply = await f.call('get', {}, () => current);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'SESSION_REVOKED');
    const records = f.events.filter((e) => e.operation === 'READ');
    assert.equal(records.length, 1);
    assert.equal(records[0].outcome, 'OBSERVED');
    assert.equal(records[0].diagnosticId, reply.diagnosticId);
    assert.equal(f.held, null);
    assert.equal(f.releases, 1);
    assert.equal(f.starts, 0);
  } finally {
    await f.cleanup();
  }
});
