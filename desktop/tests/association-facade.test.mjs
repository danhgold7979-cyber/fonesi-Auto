import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { syntheticAssociationFixture } from './fixtures/association-confirmation.mjs';
import { parseInputInteractionResponse } from '../src/input-interaction-contract.ts';
import { parseDiscoveryResponse } from '../src/discovery-contract.ts';
import { parseMetadataResponse } from '../src/metadata-contract.ts';
import { parseAssociationResponse } from '../src/association-contract.ts';
import { snapshotAssociationAudit } from '../src/association-audit-contract.ts';
import { validDiscoveryAuditTuple } from '../src/discovery-audit-contract.ts';
import { validMetadataAuditTuple } from '../src/metadata-audit-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
// Actual owned SQLite, server/ingestion/facade, foundation admission and native leaf.
// Only OS native factory recognition and fixed Electron binding resolution are transformed.
// There is no proof-array or operator-intent injection and no physical handset evidence.
async function fixture(extra = {}) {
  const ui = syntheticAssociationFixture(
    extra.dialog,
    new Map([
      [
        'main/adb-server-service.ts',
        [['!isRealHostFactory(factory)', 'false /* SYNTHETIC_NATIVE_ADMISSION_ONLY */']],
      ],
      [
        'main/owned-transport-metadata.ts',
        [
          [
            'void actor.shutdown().then(',
            'void actor.shutdown().then(async (actual) => { await globalThis.__inputReplacementDrain?.(); return actual; }).then(',
          ],
        ],
      ],
      [
        'main/discovery-session-service.ts',
        [
          [
            'associationRequests.size >= 65536',
            '(associationRequests.size >= 65536 || globalThis.__associationRequestExhausted === true)',
          ],
          [
            'ids.size >= 65536',
            '(ids.size >= 65536 || globalThis.__associationDiagnosticExhausted === true)',
          ],
        ],
      ],
    ]),
  );
  const { FoundationDatabase } = ui.loadSource('main/foundation-database.ts');
  const { createDurableCoordinator } = ui.loadSource('main/durable-coordinator.ts');
  const { createRegistryStore } = ui.loadSource('main/registry-store.ts');
  const { createAdbServerService } = ui.loadSource('main/adb-server-service.ts');
  const { createAdbDiscoveryService } = ui.loadSource('main/adb-discovery-service.ts');
  const { createDiscoverySessionService } = ui.loadSource('main/discovery-session-service.ts');
  const { ApplicationLogger } = ui.loadSource('main/logging.ts');
  const { createFleetService } = ui.loadSource('main/fleet-service.ts');
  const associationEvents = [];
  let rows = 'private-device device transport_id:1\n';

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
    clock: () => extra.clock?.() ?? Date.now(),
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
  let facade;
  const fleet = createFleetService({
    registry: () => registry.snapshot(),
    assertOwnedSync: () => {},
    newDiagnostic: next,
    audit: async () => 'AVAILABLE',
    availability: () => facade?.availability() ?? 'BINARY_UNAVAILABLE',
    finalProjection: (p) => facade?.finalProjection(p) ?? false,
  });
  const fleetCap = fleet.grant(() => {});
  facade = createDiscoverySessionService({
    captureDiagnosticObserver: () => extra.captureDiagnosticObserver?.() ?? null,
    fleet,
    logger,
    custody,
    assertOwnedSync: () => extra.owner?.(),
    clock: () => extra.clock?.() ?? Date.now(),
    newId: () => extra.id?.() ?? next(),
    associationAudit: async (e) => {
      assert.ok(snapshotAssociationAudit(e), JSON.stringify(e));
      associationEvents.push(e);
      return (await extra.associationAudit?.(e)) ?? 'AVAILABLE';
    },
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
        clock: () => extra.clock?.() ?? Date.now(),
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
            acquireInput() {
              extra.inputHandoff?.();
              return Object.freeze({
                handoff: 'QUERY',
                result: Promise.resolve().then(async () => {
                  await extra.inputQuery?.();
                  return Object.freeze({
                    version: 1,
                    kind: 'INPUT_QUERY',
                    status: 'COMPLETE',
                    code: 'OK',
                    dispatched: true,
                    operationRetired: true,
                    remoteExitCode: 0,
                    stdoutEmpty: true,
                    stderrEmpty: true,
                    observedAtUtc: Date.now(),
                  });
                }),
                retirement: Promise.resolve().then(async () => {
                  await extra.inputRetirement?.();
                  return Object.freeze({ status: 'RETIRED' });
                }),
              });
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
                    observedAtUtc: extra.clock?.() ?? Date.now(),
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
                    payloadBase64: Buffer.from(extra.rows ?? rows).toString('base64'),
                    observedAtUtc: extra.clock?.() ?? Date.now(),
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
      const actual = createAdbDiscoveryService({
        provider,
        registry,
        readDurableRevision: () => db.readDurable().meta.revision,
        assertOwnedSync: current,
        clock: () => extra.clock?.() ?? Date.now(),
        newId: next,
      });
      return Object.freeze({
        ...actual,
        get retired() {
          return actual.retired;
        },
        beginAssociation(raw) {
          const pending = actual.beginAssociation(
            extra.refuseBegin?.()
              ? { ...raw, expectedDurableRevision: raw.expectedDurableRevision + 1 }
              : raw,
          );
          extra.afterBegin?.();
          return extra.lowerReturn
            ? pending.then(async (value) => {
                await extra.lowerReturn();
                return value;
              })
            : pending;
        },
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
    fleet,
    logger,
    async select(deviceId, revision = 0) {
      return JSON.parse(
        await fleet.execute(fleetCap, {
          version: 1,
          requestId: `f${++request}`,
          method: 'fleet.selection.replace',
          expectedRevision: revision,
          selection: { selectedDeviceIds: [], activeDeviceId: deviceId, groups: [] },
        }),
      );
    },
    async input(method, fields = {}) {
      const raw = await facade.executeInput(
        { version: 1, requestId: `p${++request}`, method: 'input.' + method, ...fields },
        () => true,
      );
      const result = parseInputInteractionResponse(raw);
      assert.ok(result, raw);
      return result;
    },
    ui,
    associationEvents,
    setRows(value) {
      rows = value;
    },
    async association(method, fields = {}, current = () => true) {
      const admission = ui.foundation.admitAssociation(ui.event);
      assert.equal(admission.ok, true);
      try {
        const raw = await facade.executeAssociation(
          { version: 1, requestId: `p${++request}`, method: 'association.' + method, ...fields },
          current,
          admission.associationAdmission,
        );
        const parsed = parseAssociationResponse(raw);
        assert.ok(parsed, raw);
        return parsed;
      } finally {
        admission.release();
      }
    },
    async associationTerminal() {
      for (let i = 0; i < 100; i++) {
        await tick();
        const r = await this.association('get');
        if (r.ok && !r.snapshot.state.endsWith('_PENDING')) return r;
      }
      throw Error('ASSOCIATION_TEST_TERMINAL');
    },
    async ready() {
      const initial = await call('get');
      await call('start', {
        expectedRevision: initial.snapshot.revision,
        expectedInstallationRevision: 1,
      });
      await this.terminal();
      const current = await call('get');
      await call('refresh', { expectedRevision: current.snapshot.revision });
      await this.terminal();
      return this.association('candidates');
    },
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

async function begin(f) {
  const c = await f.ready();
  assert.equal(c.ok, true);
  assert.equal(c.snapshot.candidates.length, 1);
  return f.association('begin', {
    expectedRevision: c.snapshot.revision,
    candidateId: c.snapshot.candidates[0].candidateId,
    mode: 'CURRENT',
  });
}
async function throughReturn(f) {
  const ack = await begin(f);
  assert.equal(ack.ok, true);
  assert.equal(ack.outcome, 'PENDING');
  let r = await f.associationTerminal();
  assert.equal(r.snapshot.state, 'AWAIT_REMOVAL');
  f.setRows('');
  await f.association('removal', {
    expectedRevision: r.snapshot.revision,
    ceremonyId: r.snapshot.ceremonyId,
  });
  r = await f.associationTerminal();
  assert.equal(r.snapshot.state, 'AWAIT_RETURN');
  f.setRows('private-device device transport_id:2\n');
  await f.association('return', {
    expectedRevision: r.snapshot.revision,
    ceremonyId: r.snapshot.ceremonyId,
  });
  r = await f.associationTerminal();
  assert.equal(r.snapshot.state, 'AWAIT_CONFIRMATION');
  return r;
}
test('actual SQLite four-stage facade + branded synthetic native dialog commits only final association', async () => {
  const f = await fixture();
  try {
    const r = await throughReturn(f);
    assert.equal(f.db.readDurable().associationReceipts.length, 0);
    const ack = await f.association('confirm', {
      expectedRevision: r.snapshot.revision,
      ceremonyId: r.snapshot.ceremonyId,
    });
    assert.equal(ack.outcome, 'PENDING');
    const done = await f.associationTerminal();
    assert.equal(done.snapshot.state, 'COMMITTED');
    assert.equal(done.snapshot.receipt.outcome, 'COMMITTED');
    assert.equal(done.snapshot.projectionCurrent, true);
    assert.equal(f.db.readDurable().associationReceipts.length, 1);
    assert.equal(f.db.readDurable().identityEvidence[0].identity_sha256, null);
    assert.equal(f.queries, 5);
  } finally {
    await f.cleanup();
  }
});
test('candidate copies/stale CAS refuse without another acquisition or dialog', async () => {
  const f = await fixture();
  try {
    const c = await f.ready();
    const q = f.queries;
    assert.equal(
      (
        await f.association('begin', {
          expectedRevision: c.snapshot.revision,
          candidateId: id(9999),
          mode: 'CURRENT',
        })
      ).code,
      'STALE_CANDIDATE',
    );
    assert.equal(
      (
        await f.association('begin', {
          expectedRevision: c.snapshot.revision + 1,
          candidateId: c.snapshot.candidates[0].candidateId,
          mode: 'CURRENT',
        })
      ).code,
      'STALE_REVISION',
    );
    assert.equal(f.queries, q);
  } finally {
    await f.cleanup();
  }
});
test('failed INTENT publishes fixed no-lower failure and never queries', async () => {
  const f = await fixture({
    associationAudit: async (e) => (e.phase === 'INTENT' ? 'DEGRADED' : 'AVAILABLE'),
  });
  try {
    const c = await f.ready(),
      q = f.queries;
    await f.association('begin', {
      expectedRevision: c.snapshot.revision,
      candidateId: c.snapshot.candidates[0].candidateId,
      mode: 'CURRENT',
    });
    const r = await f.associationTerminal();
    assert.equal(r.snapshot.state, 'FAILED');
    assert.equal(r.snapshot.code, 'AUDIT_UNAVAILABLE');
    assert.equal(r.snapshot.receipt, null);
    assert.equal(f.queries, q);
  } finally {
    await f.cleanup();
  }
});
test('Cancel aborts pending genuine leaf dialog; late affirmation cannot query or commit', async () => {
  const gate = deferred();
  let dialog = false,
    signal;
  const f = await fixture({
    dialog: async (_window, opts) => {
      dialog = true;
      signal = opts.signal;
      return gate.promise;
    },
  });
  try {
    const r = await throughReturn(f);
    await f.association('confirm', {
      expectedRevision: r.snapshot.revision,
      ceremonyId: r.snapshot.ceremonyId,
    });
    for (let i = 0; i < 30 && !dialog; i++) await tick();
    assert.equal(dialog, true);
    const p = await f.association('get'),
      q = f.queries;
    const cancelled = await f.association('cancel', {
      expectedRevision: p.snapshot.revision,
      operationId: p.snapshot.operationId,
    });
    assert.equal(cancelled.snapshot.state, 'CANCELLED');
    assert.equal(signal.aborted, true);
    gate.resolve({ response: 1, checkboxChecked: false });
    await tick();
    const done = await f.associationTerminal();
    assert.equal(done.snapshot.state, 'CANCELLED');
    assert.equal(f.queries, q);
    assert.equal(f.db.readDurable().associationReceipts.length, 0);
  } finally {
    gate.resolve({ response: 0 });
    await f.cleanup();
  }
});
test('immediate immutable PENDING allows Cancel while INTENT is held, with no late baseline', async () => {
  const gate = deferred();
  let entered = false;
  const f = await fixture({
    associationAudit: async (e) => {
      if (e.operation === 'BEGIN' && e.phase === 'INTENT') {
        entered = true;
        await gate.promise;
      }
      return 'AVAILABLE';
    },
  });
  try {
    const c = await f.ready(),
      q = f.queries;
    const pending = await f.association('begin', {
      expectedRevision: c.snapshot.revision,
      candidateId: c.snapshot.candidates[0].candidateId,
      mode: 'CURRENT',
    });
    assert.equal(pending.outcome, 'PENDING');
    assert.equal(pending.loggingHealth, 'DEGRADED');
    assert.equal(pending.diagnosticId, null);
    assert.equal(pending.snapshot.ceremonyId, null);
    const cancel = await f.association('cancel', {
      expectedRevision: pending.snapshot.revision,
      operationId: pending.snapshot.operationId,
    });
    assert.equal(cancel.snapshot.state, 'CANCELLED');
    assert.equal(cancel.snapshot.revision, 2);
    gate.resolve();
    await tick();
    assert.equal(entered, true);
    const done = await f.associationTerminal();
    assert.equal(done.snapshot.state, 'CANCELLED');
    assert.equal(done.snapshot.revision, 3);
    assert.equal(done.snapshot.receipt, null);
    assert.equal(f.queries, q);
    assert.equal(
      f.associationEvents.filter((e) => e.operation === 'BEGIN' && e.phase === 'RESULT').length,
      1,
    );
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('Cancel pending baseline uses private actual ceremony ID before returned handle and drains query', async () => {
  const gate = deferred();
  let arm = false,
    entered = false;
  const f = await fixture({
    query: async () => {
      if (arm) {
        entered = true;
        await gate.promise;
      }
    },
  });
  try {
    const c = await f.ready();
    arm = true;
    const pending = await f.association('begin', {
      expectedRevision: c.snapshot.revision,
      candidateId: c.snapshot.candidates[0].candidateId,
      mode: 'CURRENT',
    });
    for (let i = 0; i < 30 && !entered; i++) await tick();
    assert.equal(entered, true);
    const g = await f.association('get');
    assert.equal(g.snapshot.ceremonyId, null);
    assert.equal(g.snapshot.deadlineUtc, null);
    assert.equal(g.snapshot.revision, 1);
    await f.association('cancel', {
      expectedRevision: 1,
      operationId: pending.snapshot.operationId,
    });
    let closed = false;
    const closing = f.facade.close().then((x) => {
      closed = true;
      return x;
    });
    await tick();
    assert.equal(closed, false);
    gate.resolve();
    assert.equal(await closing, 'RETIRED');
    const done = await f.association('get');
    assert.equal(done.snapshot.state, 'CANCELLED');
    assert.equal(done.snapshot.revision, 3);
    assert.equal(done.snapshot.receipt.outcome, 'NOT_COMMITTED');
    assert.equal(f.db.readDurable().associationReceipts.length, 0);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('RESULT candidate attempted before Cancel retains actual COMMITTED at R+3 without duplicate audit', async () => {
  const gate = deferred();
  let arm = false,
    entered = false;
  const f = await fixture({
    associationAudit: async (e) => {
      if (arm && e.operation === 'CONFIRM' && e.stage === 'EXECUTION') {
        entered = true;
        await gate.promise;
      }
      return 'AVAILABLE';
    },
  });
  try {
    const r = await throughReturn(f);
    arm = true;
    const pending = await f.association('confirm', {
      expectedRevision: r.snapshot.revision,
      ceremonyId: r.snapshot.ceremonyId,
    });
    for (let i = 0; i < 50 && !entered; i++) await tick();
    assert.equal(entered, true);
    assert.equal(f.db.readDurable().associationReceipts.length, 1);
    const attempted = f.associationEvents.filter(
      (e) => e.operation === 'CONFIRM' && e.stage === 'EXECUTION',
    );
    assert.equal(attempted.length, 1);
    assert.equal(attempted[0].resultingRevision, r.snapshot.revision + 2);
    await f.association('cancel', {
      expectedRevision: pending.snapshot.revision,
      operationId: pending.snapshot.operationId,
    });
    gate.resolve();
    await tick();
    const done = await f.associationTerminal();
    assert.equal(done.snapshot.state, 'CANCELLED');
    assert.equal(done.snapshot.revision, r.snapshot.revision + 3);
    assert.equal(done.snapshot.receipt.outcome, 'COMMITTED');
    assert.equal(done.snapshot.projectionCurrent, false);
    assert.equal(
      f.associationEvents.filter((e) => e.operation === 'CONFIRM' && e.stage === 'EXECUTION')
        .length,
      1,
    );
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('Get/candidate listing preserves admitted human-wait ceremony; admitted Refresh invalidates IDs', async () => {
  const f = await fixture();
  try {
    await begin(f);
    const r = await f.associationTerminal();
    assert.equal(r.snapshot.state, 'AWAIT_REMOVAL');
    const list = await f.association('candidates');
    assert.equal(list.snapshot.ceremonyId, r.snapshot.ceremonyId);
    assert.equal(list.snapshot.revision, r.snapshot.revision);
    const state = await f.call('get');
    await f.call('refresh', { expectedRevision: state.snapshot.revision });
    await f.terminal();
    const old = list.snapshot.candidates[0];
    if (old)
      assert.equal(
        (
          await f.association('begin', {
            expectedRevision: (await f.association('get')).snapshot.revision,
            candidateId: old.candidateId,
            mode: 'CURRENT',
          })
        ).code,
        'STALE_CANDIDATE',
      );
  } finally {
    await f.cleanup();
  }
});

test('valid local Cancel still invalidates with exhausted request and diagnostic pools', async () => {
  const gate = deferred();
  let entered = false;
  const f = await fixture({
    associationAudit: async (e) => {
      if (e.phase === 'INTENT') {
        entered = true;
        await gate.promise;
      }
      return 'AVAILABLE';
    },
  });
  try {
    const c = await f.ready(),
      q = f.queries;
    const pending = await f.association('begin', {
      expectedRevision: c.snapshot.revision,
      candidateId: c.snapshot.candidates[0].candidateId,
      mode: 'CURRENT',
    });
    for (let i = 0; i < 20 && !entered; i++) await tick();
    globalThis.__associationRequestExhausted = true;
    globalThis.__associationDiagnosticExhausted = true;
    const cancelled = await f.association('cancel', {
      expectedRevision: pending.snapshot.revision,
      operationId: pending.snapshot.operationId,
    });
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.snapshot.state, 'CANCELLED');
    assert.equal(cancelled.loggingHealth, 'DEGRADED');
    assert.equal(cancelled.diagnosticId, null);
    const again = await f.association('cancel', {
      expectedRevision: cancelled.snapshot.revision,
      operationId: pending.snapshot.operationId,
    });
    assert.equal(again.outcome, 'UNCHANGED');
    gate.resolve();
    await tick();
    assert.equal(f.queries, q);
  } finally {
    globalThis.__associationRequestExhausted = false;
    globalThis.__associationDiagnosticExhausted = false;
    gate.resolve();
    await f.cleanup();
  }
});
test('idle human-wait expiry versions stale ceremony without querying or killing healthy server', async (t) => {
  const timers = [];
  const original = setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => {
    if (ms > 110000) {
      const token = { fn, ms };
      timers.push(token);
      return token;
    }
    return original(fn, ms, ...args);
  });
  const f = await fixture();
  try {
    await begin(f);
    const ready = await f.associationTerminal();
    const q = f.queries,
      c = f.closes;
    for (const timer of timers) timer.fn();
    const expired = await f.association('get');
    assert.equal(expired.snapshot.state, 'FAILED');
    assert.equal(expired.snapshot.code, 'DEADLINE');
    assert.equal(expired.snapshot.revision, ready.snapshot.revision + 1);
    assert.equal(expired.snapshot.receipt.outcome, 'COMMITTED');
    assert.equal(expired.snapshot.projectionCurrent, false);
    assert.equal(f.queries, q);
    assert.equal(f.closes, c);
  } finally {
    t.mock.restoreAll();
    await f.cleanup();
  }
});

test('second BEGIN actual lower refusal cannot inherit cancelled prior ceremony context', async () => {
  let refuse = false;
  const f = await fixture({ refuseBegin: () => refuse });
  try {
    await begin(f);
    const first = await f.associationTerminal();
    await f.association('cancel', {
      expectedRevision: first.snapshot.revision,
      operationId: first.snapshot.operationId,
    });
    const c = await f.association('candidates');
    refuse = true;
    await f.association('begin', {
      expectedRevision: c.snapshot.revision,
      candidateId: c.snapshot.candidates[0].candidateId,
      mode: 'CURRENT',
    });
    const result = await f.associationTerminal();
    assert.equal(result.snapshot.state, 'FAILED');
    assert.equal(result.snapshot.code, 'STALE_REVISION');
    assert.equal(result.snapshot.ceremonyId, null);
    assert.equal(result.snapshot.deadlineUtc, null);
    assert.equal(result.snapshot.receipt.ceremonyId, null);
    assert.equal(await f.facade.close(), 'RETIRED');
  } finally {
    await f.cleanup();
  }
});
test('last admission clock reentrant Cancel cannot be overwritten by next phase PENDING', async () => {
  let arm = false,
    calls = 0,
    previous,
    cancelled,
    f;
  f = await fixture({
    clock: () => {
      if (arm && ++calls === 2) {
        arm = false;
        cancelled = f.facade.executeAssociation(
          {
            version: 1,
            requestId: 'p99999',
            method: 'association.cancel',
            expectedRevision: previous.revision,
            operationId: previous.operationId,
          },
          () => true,
          {},
        );
      }
      return Date.now();
    },
  });
  try {
    await begin(f);
    previous = (await f.associationTerminal()).snapshot;
    const q = f.queries;
    arm = true;
    const r = await f.association('removal', {
      expectedRevision: previous.revision,
      ceremonyId: previous.ceremonyId,
    });
    await cancelled;
    assert.equal(r.ok, false);
    assert.equal(r.code, 'STALE_REVISION');
    const g = await f.association('get');
    assert.equal(g.snapshot.state, 'CANCELLED');
    assert.equal(g.snapshot.revision, previous.revision + 1);
    assert.equal(f.queries, q);
  } finally {
    await f.cleanup();
  }
});
test('terminal EXECUTION audit degradation survives later successful GET audit and known COMMITTED', async () => {
  const f = await fixture({
    associationAudit: async (e) =>
      e.operation === 'CONFIRM' && e.stage === 'EXECUTION' ? 'DEGRADED' : 'AVAILABLE',
  });
  try {
    const r = await throughReturn(f);
    await f.association('confirm', {
      expectedRevision: r.snapshot.revision,
      ceremonyId: r.snapshot.ceremonyId,
    });
    const terminal = await f.associationTerminal();
    assert.equal(terminal.snapshot.receipt.outcome, 'COMMITTED');
    assert.equal(terminal.snapshot.receipt.auditHealth, 'AVAILABLE');
    assert.equal(terminal.loggingHealth, 'DEGRADED');
    assert.equal((await f.association('get')).loggingHealth, 'DEGRADED');
  } finally {
    await f.cleanup();
  }
});

test('genuine AbortSignal reentrant close sees installed cleanup and CLOSED state with one retirement', async () => {
  const gate = deferred();
  let entered = false,
    reentered,
    seen,
    f;
  f = await fixture({
    dialog: async (_window, opts) => {
      entered = true;
      opts.signal.addEventListener(
        'abort',
        () => {
          seen = f.association('get');
          reentered = f.facade.close();
        },
        { once: true },
      );
      return gate.promise;
    },
  });
  try {
    const r = await throughReturn(f);
    await f.association('confirm', {
      expectedRevision: r.snapshot.revision,
      ceremonyId: r.snapshot.ceremonyId,
    });
    for (let i = 0; i < 30 && !entered; i++) await tick();
    assert.equal(entered, true);
    const first = f.facade.close();
    assert.ok(reentered);
    assert.equal((await seen).snapshot.state, 'CLOSED');
    await tick();
    assert.equal(f.closes, 1);
    gate.resolve({ response: 1, checkboxChecked: false });
    assert.equal(await first, 'RETIRED');
    assert.equal(await reentered, 'RETIRED');
    assert.equal(f.closes, 1);
    assert.equal(f.db.readDurable().associationReceipts.length, 0);
  } finally {
    gate.resolve({ response: 0 });
    await f.cleanup();
  }
});

test('post-reservation arm failure terminalizes without abandoning busy or actual work', async () => {
  let arm = false,
    calls = 0;
  const f = await fixture({
    clock: () => {
      if (arm && ++calls === 3) {
        arm = false;
        throw Error('SYNTHETIC_CLOCK_FAILURE');
      }
      return Date.now();
    },
  });
  try {
    const c = await f.ready(),
      q = f.queries;
    arm = true;
    const r = await f.association('begin', {
      expectedRevision: c.snapshot.revision,
      candidateId: c.snapshot.candidates[0].candidateId,
      mode: 'CURRENT',
    });
    assert.equal(r.ok, false);
    const terminal = await f.association('get');
    assert.equal(terminal.snapshot.state, 'FAILED');
    assert.equal(terminal.snapshot.revision, 2);
    assert.equal(terminal.snapshot.receipt, null);
    assert.equal(f.queries, q);
    assert.equal(await f.facade.close(), 'RETIRED');
  } finally {
    await f.cleanup();
  }
});

test('post-lower BEGIN arm failure retains exact lower obligation and its eventual receipt', async () => {
  const gate = deferred();
  let armed = false,
    hold = false,
    created = false;
  const f = await fixture({
    afterBegin: () => {
      created = true;
      armed = true;
    },
    clock: () => {
      if (armed) {
        armed = false;
        throw Error('SYNTHETIC_POST_LOWER_CLOCK');
      }
      return Date.now();
    },
    lowerReturn: async () => {
      if (hold) await gate.promise;
    },
  });
  try {
    const c = await f.ready();
    hold = true;
    await f.association('begin', {
      expectedRevision: c.snapshot.revision,
      candidateId: c.snapshot.candidates[0].candidateId,
      mode: 'CURRENT',
    });
    for (let i = 0; i < 20 && !created; i++) await tick();
    assert.equal(created, true);
    await tick();
    const current = await f.association('get');
    const refused = await f.association('begin', {
      expectedRevision: current.snapshot.revision,
      candidateId: c.snapshot.candidates[0].candidateId,
      mode: 'CURRENT',
    });
    assert.equal(refused.code, 'BUSY');
    let ended = false;
    const close = f.facade.close().then((r) => {
      ended = true;
      return r;
    });
    await tick();
    assert.equal(ended, false);
    gate.resolve();
    assert.equal(await close, 'RETIRED');
    const final = await f.association('get');
    assert.ok(final.snapshot.receipt);
    assert.equal(final.snapshot.receipt.outcome, 'NOT_COMMITTED');
    assert.equal(f.db.readDurable().associationReceipts.length, 0);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});

async function inputReady(f) {
  const r = await throughReturn(f);
  await f.association('confirm', {
    expectedRevision: r.snapshot.revision,
    ceremonyId: r.snapshot.ceremonyId,
  });
  const done = await f.associationTerminal();
  assert.equal(done.snapshot.state, 'COMMITTED');
  const deviceId = done.snapshot.deviceId;
  const selected = await f.select(deviceId);
  assert.equal(selected.ok, true, JSON.stringify(selected));
  return {
    deviceId,
    expectedSelectionRevision: selected.fleet.selection.revision,
    expectedRegistryRevision: f.registry.snapshot().revision,
  };
}
async function inputTerminal(f) {
  for (let n = 0; n < 200; n++) {
    await new Promise((r) => setTimeout(r, 5));
    const r = await f.input('get');
    if (r.ok && r.snapshot.state !== 'PENDING') return r;
  }
  throw Error('INPUT_TERMINAL');
}
test('main ACTIVE input composes actual SQLite association/Fleet/logger with one native-fact owner, metadata first and repeated keys', async () => {
  let handoffs = 0;
  const f = await fixture({ inputHandoff: () => handoffs++ });
  try {
    const target = await inputReady(f);
    const m = await f.metadata('get');
    await f.metadata('read', {
      expectedRevision: m.snapshot.revision,
      expectedRegistryRevision: target.expectedRegistryRevision,
      deviceId: target.deviceId,
      field: 'MODEL',
    });
    assert.equal((await f.metadataTerminal()).snapshot.lastOutcome, 'OBSERVED');
    const ack = await f.input('press', { ...target, expectedRevision: 0, action: 'HOME' });
    assert.equal(ack.outcome, 'PENDING');
    assert.equal(ack.loggingHealth, 'DEGRADED');
    const r = await inputTerminal(f);
    assert.equal(r.snapshot.state, 'SETTLED');
    assert.equal(r.snapshot.receipt.actor.outcome, 'DISPATCHED_UNCONFIRMED');
    assert.equal(r.snapshot.code, 'OK');
    assert.equal(r.snapshot.current, true);
    assert.equal(handoffs, 1);
    await f.input('press', { ...target, expectedRevision: r.snapshot.revision, action: 'BACK' });
    assert.equal((await inputTerminal(f)).snapshot.code, 'OK');
    assert.equal(handoffs, 2);
  } finally {
    await f.cleanup();
  }
});
test('input ACTIVE CAS rejects selected-device substitution and preserves history; input first permits same owner metadata', async () => {
  let handoffs = 0;
  const f = await fixture({ inputHandoff: () => handoffs++ });
  try {
    const target = await inputReady(f);
    assert.equal(
      (
        await f.input('press', {
          ...target,
          deviceId: id(999),
          expectedRevision: 0,
          action: 'HOME',
        })
      ).ok,
      false,
    );
    assert.equal((await f.input('get')).snapshot.state, 'EMPTY');
    assert.equal(handoffs, 0);
    await f.input('press', { ...target, expectedRevision: 0, action: 'ENTER' });
    const r = await inputTerminal(f);
    assert.equal(r.snapshot.code, 'OK');
    const m = await f.metadata('get');
    await f.metadata('read', {
      expectedRevision: m.snapshot.revision,
      expectedRegistryRevision: target.expectedRegistryRevision,
      deviceId: target.deviceId,
      field: 'MODEL',
    });
    assert.equal((await f.metadataTerminal()).snapshot.lastOutcome, 'OBSERVED');
    await f.select(null, target.expectedSelectionRevision);
    const old = await f.input('get');
    assert.equal(old.snapshot.current, false);
    assert.equal(old.snapshot.receipt.actor.code, 'OK');
    assert.equal(old.snapshot.revision, r.snapshot.revision);
  } finally {
    await f.cleanup();
  }
});
test('input Stop retains actual pending receipt and appends only that historical receipt at reserved revision', async () => {
  const wait = deferred();
  let calls = 0;
  const f = await fixture({ inputHandoff: () => calls++, inputQuery: () => wait.promise });
  try {
    const target = await inputReady(f);
    const ack = await f.input('press', { ...target, expectedRevision: 0, action: 'HOME' });
    while (!calls) await tick();
    const closing = f.facade.close();
    const closed = await f.input('get');
    assert.equal(closed.snapshot.state, 'CLOSED');
    assert.equal(closed.snapshot.revision, 2);
    wait.resolve();
    await closing;
    const final = await f.input('get');
    assert.equal(final.snapshot.state, 'CLOSED');
    assert.equal(final.snapshot.revision, 3);
    assert.ok(final.snapshot.receipt);
    assert.equal(final.snapshot.current, false);
    assert.equal(ack.snapshot.revision, 1);
  } finally {
    wait.resolve();
    await f.cleanup();
  }
});
test('actual ACTIVE selection change during owned schema11 INTENT prevents handoff without retargeting', async () => {
  let handoffs = 0;
  const f = await fixture({ inputHandoff: () => handoffs++ });
  const wait = deferred(),
    entered = deferred();
  try {
    const target = await inputReady(f);
    const flush = f.logger.store.flush.bind(f.logger.store);
    let count = 0;
    f.logger.store.flush = async () => {
      if (++count === 1) {
        entered.resolve();
        await wait.promise;
      }
      return flush();
    };
    await f.input('press', { ...target, expectedRevision: 0, action: 'HOME' });
    await entered.promise;
    await f.select(null, target.expectedSelectionRevision);
    wait.resolve();
    const done = await inputTerminal(f);
    assert.equal(done.snapshot.receipt.actor.outcome, 'NOT_DISPATCHED');
    assert.equal(done.snapshot.code, 'STALE_BINDING');
    assert.equal(handoffs, 0);
    assert.equal(done.snapshot.current, false);
  } finally {
    wait.resolve();
    await f.cleanup();
  }
});
test('known logical input receipt keeps all ordinary effects BUSY through actual held RESULT drain', async () => {
  const f = await fixture();
  const wait = deferred(),
    entered = deferred(),
    drained = deferred();
  const nativeTimer = globalThis.setTimeout;
  try {
    const target = await inputReady(f);
    const flush = f.logger.store.flush.bind(f.logger.store);
    let count = 0;
    f.logger.store.flush = async () => {
      if (++count === 2) {
        entered.resolve();
        await wait.promise;
      }
      const result = await flush();
      if (count === 2) drained.resolve();
      return result;
    };
    // Trigger the deadline only after RESULT is held, never during INTENT/fsync.
    // The real handle remains cancellable and original absolute deadlines are unchanged.
    let deadline;
    globalThis.setTimeout = (fn, delay, ...args) => {
      const handle = nativeTimer(fn, delay, ...args);
      if (delay > 29000 && delay <= 30000)
        deadline = () => {
          clearTimeout(handle);
          fn(...args);
        };
      return handle;
    };
    await f.input('press', { ...target, expectedRevision: 0, action: 'HOME' });
    await entered.promise;
    assert.equal(typeof deadline, 'function');
    deadline();
    const result = await inputTerminal(f);
    assert.equal(result.snapshot.receipt.actor.outcome, 'DISPATCHED_UNCONFIRMED');
    assert.equal(result.snapshot.code, 'OK');
    assert.equal(
      (
        await f.input('press', {
          ...target,
          expectedRevision: result.snapshot.revision,
          action: 'BACK',
        })
      ).code,
      'BUSY',
    );
    const m = await f.metadata('get');
    assert.equal(
      (
        await f.metadata('read', {
          expectedRevision: m.snapshot.revision,
          expectedRegistryRevision: target.expectedRegistryRevision,
          deviceId: target.deviceId,
          field: 'MODEL',
        })
      ).code,
      'BUSY',
    );
    const d = await f.call('get');
    assert.equal(
      (await f.call('refresh', { expectedRevision: d.snapshot?.revision ?? 0 })).code,
      'BUSY',
    );
    assert.equal(
      (await f.association('begin', { expectedRevision: 0, candidateId: id(999), mode: 'CURRENT' }))
        .code,
      'BUSY',
    );
    wait.resolve();
    globalThis.setTimeout = nativeTimer;
    await drained.promise;
    await tick();
    await tick();
    const ack = await f.input('press', {
      ...target,
      expectedRevision: result.snapshot.revision,
      action: 'BACK',
    });
    assert.equal(ack.outcome, 'PENDING');
    assert.equal((await inputTerminal(f)).snapshot.code, 'OK');
  } finally {
    globalThis.setTimeout = nativeTimer;
    wait.resolve();
    await f.cleanup();
  }
});

test('input original deadline includes allocator/preflight time and never grants a fresh thirty seconds', async () => {
  let time = Date.now(),
    armed = false,
    handoffs = 0;
  const f = await fixture({
    clock: () => time,
    id: () => {
      if (armed) {
        armed = false;
        time += 30001;
      }
      return undefined;
    },
    inputHandoff: () => handoffs++,
  });
  try {
    const target = await inputReady(f);
    armed = true;
    const r = await f.input('press', { ...target, expectedRevision: 0, action: 'HOME' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'DEADLINE_EXCEEDED');
    assert.equal(handoffs, 0);
    assert.equal((await f.input('get')).snapshot.state, 'EMPTY');
  } finally {
    await f.cleanup();
  }
});

test('pre-owner replacement expiry then Stop advances once and actual drain preserves the entire CLOSED history', async () => {
  const f = await fixture();
  const held = deferred(),
    entered = deferred();
  const nativeTimer = globalThis.setTimeout;
  let expire;
  async function enroll(candidate, rowsAbsent, rowsReturn) {
    let r = await f.association('get');
    await f.association('begin', {
      expectedRevision: r.snapshot.revision,
      candidateId: candidate.candidateId,
      mode: 'CURRENT',
    });
    r = await f.associationTerminal();
    f.setRows(rowsAbsent);
    await f.association('removal', {
      expectedRevision: r.snapshot.revision,
      ceremonyId: r.snapshot.ceremonyId,
    });
    r = await f.associationTerminal();
    f.setRows(rowsReturn);
    await f.association('return', {
      expectedRevision: r.snapshot.revision,
      ceremonyId: r.snapshot.ceremonyId,
    });
    r = await f.associationTerminal();
    await f.association('confirm', {
      expectedRevision: r.snapshot.revision,
      ceremonyId: r.snapshot.ceremonyId,
    });
    r = await f.associationTerminal();
    assert.equal(r.snapshot.state, 'COMMITTED');
    return r.snapshot.deviceId;
  }
  try {
    f.setRows('private-device device transport_id:1\nsecond-device device transport_id:10\n');
    let c = await f.ready();
    const a = await enroll(
      c.snapshot.candidates[0],
      'second-device device transport_id:10\n',
      'private-device device transport_id:2\nsecond-device device transport_id:10\n',
    );
    c = await f.association('candidates');
    const b = await enroll(
      c.snapshot.candidates.find((x) => x.deviceId !== a),
      'private-device device transport_id:2\n',
      'private-device device transport_id:2\nsecond-device device transport_id:11\n',
    );
    const projection = f.registry.snapshot();
    const m = await f.metadata('get');
    await f.metadata('read', {
      expectedRevision: m.snapshot.revision,
      expectedRegistryRevision: projection.revision,
      deviceId: a,
      field: 'MODEL',
    });
    assert.equal((await f.metadataTerminal()).snapshot.lastOutcome, 'OBSERVED');
    const selection = await f.select(b);
    assert.equal(selection.ok, true);
    globalThis.__inputReplacementDrain = () => {
      entered.resolve();
      return held.promise;
    };
    globalThis.setTimeout = (fn, delay, ...args) => {
      if (delay > 29000 && delay <= 30000) expire = fn;
      return nativeTimer(fn, delay, ...args);
    };
    const ack = await f.input('press', {
      expectedRevision: 0,
      expectedSelectionRevision: selection.fleet.selection.revision,
      expectedRegistryRevision: projection.revision,
      deviceId: b,
      action: 'HOME',
    });
    assert.equal(ack.outcome, 'PENDING');
    await entered.promise;
    expire();
    const failed = await f.input('get');
    assert.equal(failed.snapshot.state, 'FAILED');
    assert.equal(failed.snapshot.revision, 2);
    const closing = f.facade.close();
    const closed = await f.input('get');
    assert.equal(closed.snapshot.state, 'CLOSED');
    assert.equal(closed.snapshot.revision, 3);
    assert.equal(closed.snapshot.receipt, null);
    held.resolve();
    await closing;
    assert.deepEqual((await f.input('get')).snapshot, closed.snapshot);
  } finally {
    globalThis.setTimeout = nativeTimer;
    delete globalThis.__inputReplacementDrain;
    held.resolve();
    await f.cleanup();
  }
});

test('actual input post-result observer retains unconfirmed dispatch and cannot change receipt on throw', async () => {
  const records = [];
  const f = await fixture({
    captureDiagnosticObserver: () => (record) => {
      records.push(record);
      throw Error('optional observer');
    },
  });
  try {
    const target = await inputReady(f);
    await f.input('press', { ...target, expectedRevision: 0, action: 'HOME' });
    const done = await inputTerminal(f);
    assert.equal(done.snapshot.receipt.actor.outcome, 'DISPATCHED_UNCONFIRMED');
    assert.equal(done.snapshot.receipt.actor.code, 'OK');
    assert.equal(records.length, 1);
    assert.equal(records[0].outcome, 'DISPATCHED_UNCONFIRMED');
    assert.equal(records[0].code, 'OK');
    assert.equal(records[0].operation, 'HOME');
    assert.ok(Number.isSafeInteger(records[0].durationMs) && records[0].durationMs >= 0);
    assert.equal(records[0].health, 'UNKNOWN');
  } finally {
    await f.cleanup();
  }
});
