import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { transformSync } from 'esbuild';
import { ApplicationLogger } from '../src/main/logging.ts';
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
// Explicit synthetic identity evidence for VERIFIED-only facade tests, never acquired identity.
const ingestUrl = moduleUrl(
  readFileSync(ingestPath, 'utf8')
    .replace("'./adb-server-service.ts'", JSON.stringify(serverUrl))
    .replace(
      'proofs: Object.freeze([]),',
      'proofs: Object.freeze(globalThis.__metadataFixtureProofs ?? []),',
    ),
  ingestPath,
);
const { createAdbDiscoveryService } = await import(ingestUrl);
const ownerPath = new URL('../src/main/owned-transport-metadata.ts', import.meta.url);
const ownerUrl = moduleUrl(
  readFileSync(ownerPath, 'utf8')
    .replaceAll("'./adb-discovery-service.ts'", JSON.stringify(ingestUrl))
    .replace('const systemClock = Date.now,', 'const systemClock = () => 1000,'),
  ownerPath,
);
const facadePath = new URL('../src/main/discovery-session-service.ts', import.meta.url);
const { createDiscoverySessionService } = await import(
  moduleUrl(
    readFileSync(facadePath, 'utf8')
      .replace("'./adb-server-service.ts'", JSON.stringify(serverUrl))
      .replace(
        'const diagnosticNow = performance.now.bind(performance);',
        'const diagnosticNow = () => globalThis.__diagnosticMonotonic ? globalThis.__diagnosticMonotonic() : performance.now();',
      )
      .replaceAll("'./adb-discovery-service.ts'", JSON.stringify(ingestUrl))
      .replace("'./owned-transport-metadata.ts'", JSON.stringify(ownerUrl))
      // Explicit test-only capacity injection exercises the actual closed exhaustion branch.
      .replace(
        'ids.size >= 65536',
        'ids.size >= 65536 || globalThis.__metadataIdCapacityExhausted === true',
      ),
    facadePath,
  )
);
const { parseMetadataResponse } = await import('../src/metadata-contract.ts');
const { validMetadataAuditTuple } = await import('../src/metadata-audit-contract.ts');
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
    events = [],
    metadataEvents = [];
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
    clock: () => extra.clock?.() ?? 1000,
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
  const ownerToken = randomUUID();
  writeFileSync(join(root, '.owner'), ownerToken, { flag: 'wx' });
  const logger = await ApplicationLogger.open(
    { root: join(root, 'logs-main'), parentToken: ownerToken },
    () => {},
  );
  const facade = createDiscoverySessionService({
    captureDiagnosticObserver: () => extra.captureDiagnosticObserver?.() ?? null,
    logger,
    custody,
    assertOwnedSync: () => extra.owner?.(),
    clock: () => extra.clock?.() ?? 1000,
    newId: () => extra.id?.() ?? next(),
    metadataAudit: async (e) => {
      assert.equal(validMetadataAuditTuple(e), true, JSON.stringify(e));
      metadataEvents.push(e);
      return (await extra.metadataAudit?.(e)) ?? 'AVAILABLE';
    },
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
        clock: () => extra.clock?.() ?? 1000,
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
                installationRevision: 1,
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
            acquireMetadata() {
              extra.metadataHandoff?.();
              return Object.freeze({
                handoff: 'QUERY',
                result: Promise.resolve().then(async () => {
                  await extra.metadataQuery?.();
                  return Object.freeze({
                    version: 1,
                    kind: 'METADATA_QUERY',
                    status: 'COMPLETE',
                    code: 'OK',
                    dispatched: true,
                    operationRetired: true,
                    stdoutBase64: Buffer.from(extra.metadataText ?? 'Fixture Phone\n').toString(
                      'base64',
                    ),
                    stderrBase64: '',
                    remoteExitCode: extra.remoteExit ?? 0,
                    observedAtUtc: 1000,
                  });
                }),
                retirement: Promise.resolve().then(async () => {
                  await extra.metadataRetirement?.();
                  return Object.freeze({ status: 'RETIRED' });
                }),
              });
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
        clock: () => extra.clock?.() ?? 1000,
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
    metadataEvents,
    async metadata(method, fields = {}, current = () => true) {
      const raw = await facade.executeMetadata(
        { version: 1, requestId: `p${++request}`, method: 'metadata.' + method, ...fields },
        current,
      );
      assert.ok(parseMetadataResponse(raw), raw);
      return JSON.parse(raw);
    },
    async metadataTerminal() {
      for (let i = 0; i < 100; i++) {
        await tick();
        const r = await this.metadata('get');
        if (r.ok && r.snapshot.state !== 'PENDING') return r;
      }
      throw Error('METADATA_TEST_TERMINAL');
    },
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
      await logger.close();
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

async function metadataReady(f, verified = true) {
  await f.call('get');
  await f.call('start', { expectedRevision: 0, expectedInstallationRevision: 1 });
  await f.terminal();
  await f.call('refresh', { expectedRevision: 2 });
  await f.terminal();
  if (verified) {
    const snapshot = f.facade.snapshot();
    globalThis.__metadataFixtureProofs = snapshot.devices.map((d, i) => ({
      deviceId: d.deviceId,
      evidenceId: id(900000 + i),
      serial: snapshot.bindings.find((b) => b.bindingId === d.currentBindingId).serial,
      transportId: snapshot.bindings.find((b) => b.bindingId === d.currentBindingId).transportId,
    }));
    try {
      await f.call('refresh', { expectedRevision: 4 });
      await f.terminal();
    } finally {
      delete globalThis.__metadataFixtureProofs;
    }
  }
  return f.facade.snapshot();
}
const metadataFields = (snapshot, revision = 0, index = 0, field = 'MODEL') => ({
  deviceId: snapshot.devices[index].deviceId,
  field,
  expectedRevision: revision,
  expectedRegistryRevision: snapshot.revision,
});
test('metadata actual SQLite/sealed issuer/owner: VERIFIED-only, same owner repeats, cache has no native query', async () => {
  let handoffs = 0;
  const f = await fixture({ metadataHandoff: () => handoffs++ });
  try {
    const provisional = await metadataReady(f, false);
    assert.equal((await f.metadata('read', metadataFields(provisional))).code, 'POLICY_DENIED');
    assert.equal(handoffs, 0);
    const d = provisional.devices[0],
      b = provisional.bindings.find((b) => b.bindingId === d.currentBindingId);
    globalThis.__metadataFixtureProofs = [
      {
        deviceId: d.deviceId,
        evidenceId: id(900000),
        serial: b.serial,
        transportId: b.transportId,
      },
    ];
    await f.call('refresh', { expectedRevision: 4 });
    await f.terminal();
    delete globalThis.__metadataFixtureProofs;
    const snapshot = f.facade.snapshot(),
      fingerprint = f.db.fingerprint();
    assert.equal((await f.metadata('read', metadataFields(snapshot))).outcome, 'PENDING');
    const first = await f.metadataTerminal();
    assert.equal(first.snapshot.state, 'READY');
    assert.equal(first.snapshot.observations.MODEL.value, 'Fixture Phone');
    assert.equal(handoffs, 1);
    await f.metadata('get');
    assert.equal(handoffs, 1);
    assert.equal(
      (await f.metadata('read', metadataFields(snapshot, 2, 0, 'MANUFACTURER'))).outcome,
      'PENDING',
    );
    const second = await f.metadataTerminal();
    assert.equal(second.snapshot.state, 'READY');
    assert.equal(handoffs, 2);
    assert.equal(
      f.db.fingerprint(),
      fingerprint,
      'metadata does not mutate durable identity or ledger',
    );
    const results = f.metadataEvents.filter((e) => e.stage === 'EXECUTION' && e.phase === 'RESULT');
    assert.equal(results.length, 2);
    assert.ok(results.every((e) => e.outcome === 'OBSERVED'));
  } finally {
    delete globalThis.__metadataFixtureProofs;
    await f.cleanup();
  }
});
test('metadata replacement preflight refuses consumed A without closing current B or issuing another query', async () => {
  let handoffs = 0;
  const f = await fixture({
    rows: 'one device transport_id:1\ntwo device transport_id:2\n',
    metadataHandoff: () => handoffs++,
  });
  try {
    const snapshot = await metadataReady(f);
    await f.metadata('read', metadataFields(snapshot));
    await f.metadataTerminal();
    await f.metadata('read', metadataFields(snapshot, 2, 1));
    await f.metadataTerminal();
    assert.equal((await f.metadata('read', metadataFields(snapshot, 4))).code, 'REFRESH_REQUIRED');
    assert.equal(handoffs, 2);
    assert.equal((await f.metadata('get')).snapshot.deviceId, snapshot.devices[1].deviceId);
    await f.metadata('read', metadataFields(snapshot, 4, 1, 'MANUFACTURER'));
    assert.equal((await f.metadataTerminal()).snapshot.state, 'READY');
    assert.equal(handoffs, 3);
  } finally {
    delete globalThis.__metadataFixtureProofs;
    await f.cleanup();
  }
});
test('metadata unavailable parser result and remote nonzero retain honest coarse actor receipts', async () => {
  for (const [text, exit, outcome] of [
    ['', 0, 'OBSERVED'],
    ['ignored', 7, 'DISPATCHED_UNCONFIRMED'],
  ]) {
    const f = await fixture({ metadataText: text, remoteExit: exit });
    try {
      const snapshot = await metadataReady(f);
      await f.metadata('read', metadataFields(snapshot));
      const terminal = await f.metadataTerminal();
      assert.equal(terminal.snapshot.lastOutcome, outcome);
      if (exit === 0) assert.equal(terminal.snapshot.observations.MODEL.available, false);
      else assert.equal(terminal.snapshot.code, 'TRANSPORT_FAILED');
    } finally {
      await f.cleanup();
    }
  }
});
test('metadata GET uses captured cache only and post-RESULT session loss never duplicates audit', async () => {
  let current = true,
    arm = false,
    owned = 0;
  const f = await fixture({
    owner: () => owned++,
    metadataAudit: (e) => {
      if (arm && e.operation === 'GET' && e.phase === 'RESULT') current = false;
    },
  });
  try {
    const snapshot = await metadataReady(f);
    await f.metadata('read', metadataFields(snapshot));
    await f.metadataTerminal();
    const before = owned;
    arm = true;
    const result = await f.metadata('get', {}, () => current);
    assert.equal(result.code, 'SESSION_REVOKED');
    assert.equal(owned, before);
    const last = f.metadataEvents.at(-1);
    assert.equal(last.outcome, 'OBSERVED');
    assert.equal(f.metadataEvents.filter((e) => e.diagnosticId === last.diagnosticId).length, 1);
  } finally {
    await f.cleanup();
  }
});
test('metadata audit failure denies query and Stop during pending query drains actual work before retirement', async () => {
  let handoffs = 0,
    deny = true;
  const gate = deferred();
  const f = await fixture({
    metadataHandoff: () => handoffs++,
    metadataQuery: () => gate.promise,
    metadataAudit: (e) =>
      deny && e.operation === 'READ' && e.phase === 'INTENT' ? 'DEGRADED' : 'AVAILABLE',
  });
  try {
    const snapshot = await metadataReady(f);
    assert.equal((await f.metadata('read', metadataFields(snapshot))).code, 'AUDIT_UNAVAILABLE');
    assert.equal(handoffs, 0);
    deny = false;
    assert.equal((await f.metadata('read', metadataFields(snapshot))).outcome, 'PENDING');
    await tick();
    assert.equal(handoffs, 1);
    const closing = f.facade.close();
    await tick();
    assert.equal(f.facade.retired, false);
    gate.resolve();
    assert.equal(await closing, 'UNRETIRED');
    assert.equal(
      f.facade.retired,
      false,
      'late invalidated query cannot turn sticky actor uncertainty into clean retirement',
    );
    const receipt = f.metadataEvents.filter((e) => e.stage === 'EXECUTION' && e.phase === 'RESULT');
    assert.equal(receipt.length, 1);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('metadata absolute deadline includes pending audit and prevents late owner construction/query', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred();
  let armed = false,
    handoffs = 0;
  const f = await fixture({
    metadataHandoff: () => handoffs++,
    metadataAudit: (e) => {
      if (armed && e.stage === 'REQUEST' && e.phase === 'INTENT') return gate.promise;
      return 'AVAILABLE';
    },
  });
  try {
    const snapshot = await metadataReady(f);
    armed = true;
    const pending = f.metadata('read', metadataFields(snapshot));
    await tick();
    t.mock.timers.tick(30000);
    assert.equal((await pending).code, 'OUTCOME_UNKNOWN');
    assert.equal(handoffs, 0);
    gate.resolve('AVAILABLE');
    await tick();
    await tick();
    assert.equal(handoffs, 0);
    assert.equal((await f.metadata('read', metadataFields(snapshot))).code, 'CLOSED');
  } finally {
    gate.resolve('AVAILABLE');
    await f.cleanup();
  }
});
test('metadata post-RESULT revocation preserves historical observation but denies fresh cache', async () => {
  let arm = false;
  let f;
  f = await fixture({
    metadataAudit: (e) => {
      if (arm && e.stage === 'EXECUTION' && e.phase === 'RESULT') f.revokeHolder();
      return 'AVAILABLE';
    },
  });
  try {
    const snapshot = await metadataReady(f);
    arm = true;
    await f.metadata('read', metadataFields(snapshot));
    const result = await f.metadataTerminal();
    assert.equal(result.snapshot.state, 'STALE');
    assert.equal(result.snapshot.lastOutcome, 'OBSERVED');
    assert.equal(result.snapshot.code, 'OK');
    assert.equal(result.snapshot.observations.MODEL.stale, true);
    const rows = f.metadataEvents.filter((e) => e.stage === 'EXECUTION' && e.phase === 'RESULT');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].outcome, 'OBSERVED');
  } finally {
    await f.cleanup();
  }
});
test('metadata pending REQUEST RESULT deadline/target loss settles valid no-query terminal once', async () => {
  for (const mode of ['deadline', 'target']) {
    let now = 1000,
      arm = false,
      handoffs = 0,
      f;
    f = await fixture({
      clock: () => now,
      metadataHandoff: () => handoffs++,
      metadataAudit: (e) => {
        if (arm && e.stage === 'REQUEST' && e.phase === 'RESULT' && e.outcome === 'PENDING') {
          if (mode === 'deadline') now = 31000;
          else f.revokeHolder();
        }
        return 'AVAILABLE';
      },
    });
    try {
      const snapshot = await metadataReady(f);
      arm = true;
      const result = await f.metadata('read', metadataFields(snapshot));
      assert.equal(result.ok, false);
      const cached = await f.metadata('get');
      assert.equal(cached.ok, true);
      assert.equal(cached.snapshot.revision, 2);
      assert.equal(cached.snapshot.lastOutcome, 'NOT_DISPATCHED');
      assert.notEqual(cached.snapshot.state, 'PENDING');
      assert.equal(handoffs, 0);
      const results = f.metadataEvents.filter((e) => e.stage === 'REQUEST' && e.phase === 'RESULT');
      assert.equal(results.length, 1);
      assert.equal(results[0].outcome, 'PENDING');
    } finally {
      await f.cleanup();
    }
  }
});
test('metadata first PENDING timeout consumes terminal revision and CLOSED remains valid wire', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred();
  let arm = false;
  const f = await fixture({
    metadataAudit: (e) =>
      arm && e.stage === 'REQUEST' && e.phase === 'RESULT' ? gate.promise : 'AVAILABLE',
  });
  try {
    const snapshot = await metadataReady(f);
    arm = true;
    const request = f.metadata('read', metadataFields(snapshot));
    await tick();
    t.mock.timers.tick(30000);
    assert.equal((await request).code, 'OUTCOME_UNKNOWN');
    const cached = await f.metadata('get');
    assert.equal(cached.ok, true);
    assert.equal(cached.snapshot.revision, 2);
    assert.equal(cached.snapshot.state, 'CLOSED');
    assert.equal(cached.snapshot.lastOutcome, 'OUTCOME_UNKNOWN');
  } finally {
    gate.resolve('AVAILABLE');
    await f.cleanup();
  }
});
test('metadata absolute timer retains settled actor history while EXECUTION RESULT audit is held', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const remoteExit of [0, 7]) {
    const gate = deferred();
    let held = false;
    const f = await fixture({
      remoteExit,
      metadataAudit: (e) => {
        if (e.stage === 'EXECUTION' && e.phase === 'RESULT') {
          held = true;
          return gate.promise;
        }
        return 'AVAILABLE';
      },
    });
    try {
      const snapshot = await metadataReady(f);
      assert.equal((await f.metadata('read', metadataFields(snapshot))).outcome, 'PENDING');
      for (let i = 0; i < 30 && !held; i++) await tick();
      assert.equal(held, true);
      t.mock.timers.tick(30000);
      const cached = await f.metadata('get');
      assert.equal(cached.ok, true);
      assert.equal(cached.snapshot.state, 'CLOSED');
      assert.equal(cached.snapshot.revision, 2);
      assert.equal(
        cached.snapshot.lastOutcome,
        remoteExit === 0 ? 'OBSERVED' : 'DISPATCHED_UNCONFIRMED',
      );
      assert.equal(cached.snapshot.code, remoteExit === 0 ? 'OK' : 'TRANSPORT_FAILED');
      if (remoteExit === 0) assert.equal(cached.snapshot.observations.MODEL.stale, true);
      assert.equal(f.facade.retired, false, 'pending actual audit remains in the retained drain');
      gate.resolve('AVAILABLE');
      await tick();
      await tick();
      const late = await f.metadata('get');
      assert.equal(late.snapshot.state, 'CLOSED');
      assert.equal(late.snapshot.lastOutcome, cached.snapshot.lastOutcome);
      assert.equal(
        f.facade.retired,
        true,
        'known query plus settled audit can retire cleanly; no invented native uncertainty',
      );
      if (remoteExit === 0) assert.equal(late.snapshot.observations.MODEL.stale, true);
      assert.equal(
        f.metadataEvents.filter((e) => e.stage === 'EXECUTION' && e.phase === 'RESULT').length,
        1,
      );
    } finally {
      gate.resolve('AVAILABLE');
      await f.cleanup();
    }
  }
});

test('metadata synchronous EXEC diagnostic exhaustion retains immutable PENDING ack and known no-query failure', async () => {
  let handoffs = 0;
  const f = await fixture({
    metadataHandoff: () => handoffs++,
    metadataAudit: (e) => {
      if (e.stage === 'REQUEST' && e.phase === 'RESULT' && e.outcome === 'PENDING')
        globalThis.__metadataIdCapacityExhausted = true;
      return 'AVAILABLE';
    },
  });
  try {
    const snapshot = await metadataReady(f);
    const ack = await f.metadata('read', metadataFields(snapshot));
    assert.equal(ack.ok, true);
    assert.equal(ack.outcome, 'PENDING');
    assert.equal(ack.snapshot.revision, 1);
    delete globalThis.__metadataIdCapacityExhausted;
    const result = await f.metadata('get');
    assert.equal(result.ok, true);
    assert.equal(result.snapshot.state, 'FAILED');
    assert.equal(result.snapshot.revision, 2);
    assert.equal(result.snapshot.lastOutcome, 'NOT_DISPATCHED');
    assert.equal(result.snapshot.code, 'LIMIT_EXCEEDED');
    assert.equal(handoffs, 0);
  } finally {
    delete globalThis.__metadataIdCapacityExhausted;
    await f.cleanup();
  }
});

test('actual metadata observer runs after result audit and preserves known outcome when it throws', async () => {
  const seen = [];
  let f;
  f = await fixture({
    captureDiagnosticObserver: () => (record) => {
      assert.ok(Object.isFrozen(record));
      assert.equal(f.metadataEvents.at(-1).phase, 'RESULT');
      seen.push(record);
      throw Error('optional diagnostics failed');
    },
  });
  try {
    const target = await metadataReady(f);
    await f.metadata('read', metadataFields(target));
    const result = await f.metadataTerminal();
    assert.equal(result.snapshot.state, 'READY');
    assert.equal(result.snapshot.lastOutcome, 'OBSERVED');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].operation, 'MODEL');
    assert.equal(seen[0].health, 'UNKNOWN');
    assert.ok(Number.isSafeInteger(seen[0].durationMs) && seen[0].durationMs >= 0);
    assert.deepEqual(
      Object.keys(seen[0]).sort(),
      [
        'version',
        'deviceId',
        'commandId',
        'correlationId',
        'operation',
        'outcome',
        'code',
        'health',
        'durationMs',
      ].sort(),
    );
  } finally {
    await f.cleanup();
  }
});
test('observer capture failure cannot prevent real metadata operation or fabricate a record', async () => {
  const f = await fixture({
    captureDiagnosticObserver: () => {
      throw Error('optional capture failed');
    },
  });
  try {
    const target = await metadataReady(f);
    await f.metadata('read', metadataFields(target));
    assert.equal((await f.metadataTerminal()).snapshot.state, 'READY');
  } finally {
    await f.cleanup();
  }
});
test('delayed metadata result stays with captured origin observer, never replacement window', async () => {
  const wait = deferred(),
    seen = [],
    fresh = [];
  let selected = (r) => seen.push(r),
    handoff = false;
  const f = await fixture({
    captureDiagnosticObserver: () => selected,
    metadataQuery: () => {
      handoff = true;
      return wait.promise;
    },
  });
  try {
    const target = await metadataReady(f);
    await f.metadata('read', metadataFields(target));
    while (!handoff) await tick();
    selected = (r) => fresh.push(r);
    wait.resolve();
    assert.equal((await f.metadataTerminal()).snapshot.state, 'READY');
    assert.equal(seen.length, 1);
    assert.equal(fresh.length, 0);
  } finally {
    wait.resolve();
    await f.cleanup();
  }
});

test('metadata observer is captured before deferred admission audit, not selected from later window', async () => {
  const wait = deferred(),
    old = [],
    fresh = [];
  let selected = (r) => old.push(r),
    entered = false;
  const f = await fixture({
    captureDiagnosticObserver: () => selected,
    metadataAudit: (e) => {
      if (e.stage === 'REQUEST' && e.phase === 'INTENT') {
        entered = true;
        return wait.promise;
      }
      return 'AVAILABLE';
    },
  });
  try {
    const target = await metadataReady(f),
      pending = f.metadata('read', metadataFields(target));
    while (!entered) await tick();
    selected = (r) => fresh.push(r);
    wait.resolve('AVAILABLE');
    await pending;
    assert.equal((await f.metadataTerminal()).snapshot.state, 'READY');
    assert.equal(old.length, 1);
    assert.equal(fresh.length, 0);
  } finally {
    wait.resolve('AVAILABLE');
    await f.cleanup();
  }
});

for (const [label, samples, expected] of [
  ['fractional elapsed', [10.25, 18.99], 8],
  ['zero elapsed', [12, 12], 0],
  ['clock regression', [12, 11], null],
  ['negative zero sample', [-0, 14], null],
  ['unavailable sample', [NaN, 14], null],
  ['throwing sample', ['THROW', 14], null],
  ['unbounded interval', [0, 86400001], null],
])
  test(`actual metadata diagnostics report ${label} without changing actor result`, async () => {
    const seen = [],
      values = [...samples];
    globalThis.__diagnosticMonotonic = () => {
      const v = values.shift();
      if (v === 'THROW') throw Error('clock');
      return v;
    };
    const f = await fixture({ captureDiagnosticObserver: () => (r) => seen.push(r) });
    try {
      const target = await metadataReady(f);
      await f.metadata('read', metadataFields(target));
      const terminal = await f.metadataTerminal();
      assert.equal(terminal.snapshot.state, 'READY');
      assert.equal(seen.length, 1);
      assert.equal(seen[0].durationMs, expected);
      assert.equal(seen[0].health, 'UNKNOWN');
      assert.equal(seen[0].outcome, 'OBSERVED');
      assert.equal(values.length, 0);
    } finally {
      delete globalThis.__diagnosticMonotonic;
      await f.cleanup();
    }
  });
