import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { FoundationDatabase } from '../src/main/foundation-database.ts';
import { createDurableCoordinator, DurableFault } from '../src/main/durable-coordinator.ts';
import { createRegistryStore } from '../src/main/registry-store.ts';
import { isRegistrySnapshot, isCurrentBinding } from '../src/main/transport-registry.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const observation = (sequence = 1, source = 'ADB_DISCOVERY', proofs = []) => ({
  sequence,
  observedAtUtc: 1000,
  source,
  rows: [{ serial: 'synthetic-private-device', transportId: '1', state: 'DEVICE' }],
  proofs,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function fixture(options = {}) {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'registry-store-')),
    storeId = randomUUID(),
    db = new FoundationDatabase(join(root, 'active.sqlite'), storeId);
  try {
    // Actual SQLite protected snapshot witnesses with synthetic provider authority only.
    await db.migrate(async (version) => {
      const path = join(root, `snapshot-${version}.sqlite`);
      await db.snapshot(path);
      const snap = new FoundationDatabase(path, storeId, true);
      try {
        return { backupId: randomUUID(), schemaVersion: version, fingerprint: snap.fingerprint() };
      } finally {
        snap.close();
      }
    }, 1000);
    let n = 100;
    const nextId = () => id(n++),
      events = [];
    const coordinator = createDurableCoordinator({
      db: options.wrapDb ? options.wrapDb(db) : db,
      assertOwnedSync: () => {},
      clock: () => 1000,
      newId: nextId,
      audit: async (e) => {
        events.push(e);
        return 'AVAILABLE';
      },
      ...options,
    });
    const store = createRegistryStore({
      coordinator,
      nextId,
      quarantined: () => false,
      assertOwnedSync: options.assertOwnedSync ?? (() => {}),
    });
    return {
      db,
      root,
      storeId,
      coordinator,
      store,
      events,
      nextId,
      async close() {
        store.close();
        await coordinator.close();
        db.close();
        assert.equal(realpathSync(root), root);
        rmSync(root, { recursive: true, force: false });
      },
    };
  } catch (error) {
    db.close();
    assert.equal(realpathSync(root), root);
    rmSync(root, { recursive: true, force: false });
    throw error;
  }
}
test('audited actual SQLite startup/reconcile and restart retain history but discard live verification', async () => {
  const f = await fixture();
  try {
    assert.equal(f.store.snapshot(), null);
    assert.equal((await f.store.startup()).outcome, 'COMMITTED');
    assert.ok(isRegistrySnapshot(f.store.snapshot()));
    assert.equal((await f.store.reconcile(1, observation())).ok, true);
    const first = f.store.snapshot(),
      device = first.devices[0];
    assert.equal(device.verification, 'PROVISIONAL');
    const proof = {
      serial: 'synthetic-private-device',
      transportId: '1',
      deviceId: device.deviceId,
      evidenceId: id(5000),
    };
    assert.equal((await f.store.reconcile(2, observation(2, 'ADB_DISCOVERY', [proof]))).ok, true);
    assert.equal(f.store.snapshot().devices[0].verification, 'VERIFIED');
    assert.equal(f.db.readDurable().identityEvidence[0].identity_sha256, null);
    const before = f.db.readDurable();
    f.store.close();
    const reopened = createRegistryStore({
      coordinator: f.coordinator,
      nextId: f.nextId,
      quarantined: () => false,
      assertOwnedSync: () => {},
    });
    assert.equal((await reopened.startup()).ok, true);
    const current = reopened.snapshot();
    assert.equal(current.devices[0].verification, 'PROVISIONAL');
    assert.equal(current.devices[0].generation, before.devices[0].generation + 1);
    assert.equal(current.devices[0].currentBindingId, null);
    assert.deepEqual(current.devices[0].evidenceIds, [id(5000)]);
    assert.ok(current.bindings.every((x) => x.retired));
    assert.equal(
      isCurrentBinding(current, {
        deviceId: device.deviceId,
        bindingId: before.bindings.at(-1).binding_id,
        generation: current.devices[0].generation,
        serial: 'synthetic-private-device',
      }),
      false,
    );
    reopened.close();
  } finally {
    await f.close();
  }
});
test('quarantine and failed INTENT never establish authority or mutate ledger', async () => {
  let fail = true;
  const f = await fixture({ audit: async () => (fail ? 'DEGRADED' : 'AVAILABLE') });
  try {
    assert.equal((await f.store.startup()).code, 'AUDIT_UNAVAILABLE');
    assert.equal(f.db.readDurable().meta.revision, 0);
    assert.equal(f.store.snapshot(), null);
    fail = false;
    const quarantined = createRegistryStore({
      coordinator: f.coordinator,
      nextId: f.nextId,
      quarantined: () => true,
      assertOwnedSync: () => {},
    });
    assert.equal((await quarantined.startup()).ok, false);
    assert.equal(f.db.readDurable().meta.revision, 0);
    assert.equal(quarantined.snapshot(), null);
    assert.equal((await f.store.startup()).ok, true);
  } finally {
    await f.close();
  }
});
test('selection-independent display revision CAS and stale reconcile preserve exact state', async () => {
  const f = await fixture();
  try {
    await f.store.startup();
    await f.store.reconcile(1, observation());
    const d = f.store.snapshot().devices[0];
    assert.equal((await f.store.display(2, d.deviceId, d.generation, 0)).ok, true);
    assert.equal(f.store.displayRevision(d.deviceId), 1);
    const hash = f.db.fingerprint();
    assert.equal((await f.store.display(3, d.deviceId, d.generation, 0)).code, 'STALE_REVISION');
    assert.equal((await f.store.reconcile(2, observation(2))).code, 'STALE_REVISION');
    assert.equal(f.db.fingerprint(), hash);
    assert.equal(f.store.snapshot().devices[0].generation, d.generation);
  } finally {
    await f.close();
  }
});
test('same binding source cannot launder synthetic durable history', async () => {
  const f = await fixture();
  try {
    await f.store.startup();
    await f.store.reconcile(1, observation(1, 'SYNTHETIC_TEST'));
    const hash = f.db.fingerprint();
    assert.equal(
      (await f.store.reconcile(2, observation(2, 'ADB_DISCOVERY'))).code,
      'INVALID_REQUEST',
    );
    assert.equal(f.db.fingerprint(), hash);
    assert.equal(f.store.snapshot().bindings[0].source, 'SYNTHETIC_TEST');
  } finally {
    await f.close();
  }
});
test('observation snapshots before await; allocation reentrancy cannot publish', async () => {
  const f = await fixture();
  try {
    await f.store.startup();
    const input = observation();
    const pending = f.store.reconcile(1, input);
    input.rows[0].serial = 'changed';
    assert.equal((await pending).ok, true);
    assert.equal(f.store.snapshot().bindings[0].serial, 'synthetic-private-device');
    let store;
    store = createRegistryStore({
      coordinator: f.coordinator,
      quarantined: () => false,
      assertOwnedSync: () => {},
      nextId: () => {
        store.close();
        return id(7000);
      },
    });
    await store.startup();
    const before = f.db.fingerprint();
    const fresh = {
      ...observation(3),
      rows: [{ serial: 'new-device', transportId: '2', state: 'DEVICE' }],
    };
    assert.equal((await store.reconcile(f.db.readDurable().meta.revision, fresh)).ok, false);
    assert.equal(f.db.fingerprint(), before);
    assert.equal(store.snapshot(), null);
  } finally {
    await f.close();
  }
});
test('postcommit audit failure retains COMMITTED while owner revocation blocks runtime publication', async () => {
  let revoke = false,
    fail = false;
  const f = await fixture({
    assertOwnedSync: () => {
      if (revoke) throw Error('OWNER');
    },
    audit: async (e) => {
      if (e.operation === 'RECONCILE' && e.phase === 'RESULT') {
        if (fail) return 'DEGRADED';
        revoke = true;
      }
      return 'AVAILABLE';
    },
  });
  try {
    await f.store.startup();
    fail = true;
    const result = await f.store.reconcile(1, observation());
    assert.equal(result.outcome, 'COMMITTED');
    assert.equal(result.auditHealth, 'DEGRADED');
    assert.ok(f.store.snapshot());
    fail = false;
    const result2 = await f.store.reconcile(2, observation(2));
    assert.equal(result2.outcome, 'COMMITTED');
    assert.equal(f.db.readDurable().meta.revision, 3);
    assert.equal(f.store.snapshot(), null);
  } finally {
    revoke = false;
    await f.close();
  }
});
test('close during INTENT and uncertain actual COMMIT never publish successor snapshot', async () => {
  const gate = deferred(),
    entered = deferred();
  let block = false;
  const f = await fixture({
    audit: async (e) => {
      if (block && e.phase === 'INTENT') {
        entered.resolve();
        await gate.promise;
      }
      return 'AVAILABLE';
    },
  });
  try {
    await f.store.startup();
    block = true;
    const pending = f.store.reconcile(1, observation());
    await entered.promise;
    f.store.close();
    gate.resolve();
    assert.equal((await pending).ok, false);
    assert.equal(f.db.readDurable().meta.revision, 1);
    assert.equal(f.store.snapshot(), null);
  } finally {
    gate.resolve();
    await f.close();
  }
  const g = await fixture();
  try {
    await g.store.startup();
    const exec = g.db.connection.exec.bind(g.db.connection);
    g.db.connection.exec = (sql) => {
      if (sql === 'COMMIT') {
        exec(sql);
        throw Error('COMMIT_UNKNOWN');
      }
      return exec(sql);
    };
    const result = await g.store.reconcile(1, observation());
    assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
    assert.equal(g.store.snapshot(), null);
    g.db.connection.exec = exec;
  } finally {
    await g.close();
  }
});

test('external owner loss and reentrant owner callback close hide synchronous registry projection', async () => {
  let owned = true;
  const f = await fixture({
    assertOwnedSync: () => {
      if (!owned) throw Error('OWNER_LOST');
    },
  });
  try {
    await f.store.startup();
    await f.store.reconcile(1, observation());
    const id = f.store.snapshot().devices[0].deviceId;
    owned = false;
    assert.equal(f.store.snapshot(), null);
    assert.equal(f.store.displayRevision(id), null);
    owned = true;
    assert.ok(f.store.snapshot());
  } finally {
    owned = true;
    await f.close();
  }
  const g = await fixture();
  try {
    let close = false,
      store;
    store = createRegistryStore({
      coordinator: g.coordinator,
      nextId: g.nextId,
      quarantined: () => false,
      assertOwnedSync: () => {
        if (close) store.close();
      },
    });
    await store.startup();
    close = true;
    assert.equal(store.snapshot(), null);
  } finally {
    await g.close();
  }
});

test('actual SQLite final COMMIT owner callback cannot revoke observation after admission and publish a mutation', async () => {
  let withinCommit = false,
    arm = false,
    revoked = false,
    finalSeen = false;
  const f = await fixture({
    wrapDb(db) {
      return {
        readDurable: () => db.readDurable(),
        commitDurable(revision, delta, admit) {
          return db.commitDurable(revision, delta, () => {
            withinCommit = true;
            try {
              admit();
            } finally {
              withinCommit = false;
            }
          });
        },
      };
    },
    assertOwnedSync() {
      if (withinCommit && arm) revoked = true;
    },
  });
  try {
    assert.equal((await f.store.startup()).outcome, 'COMMITTED');
    const ledger = f.db.readDurable(),
      fingerprint = f.db.fingerprint(),
      original = f.store.snapshot();
    const result = await f.store.reconcile(
      1,
      observation(1, 'SYNTHETIC_TEST'),
      () => {
        if (revoked) throw new DurableFault('OWNER_REVOKED');
        if (withinCommit) arm = true;
      },
      () => {
        if (withinCommit) finalSeen = true;
        if (revoked) throw new DurableFault('OWNER_REVOKED');
      },
    );
    assert.equal(finalSeen, true);
    assert.equal(revoked, true);
    assert.equal(result.outcome, 'NOT_COMMITTED');
    assert.equal(result.code, 'OWNER_REVOKED');
    assert.deepEqual(f.db.readDurable(), ledger);
    assert.equal(f.db.fingerprint(), fingerprint);
    assert.equal(f.store.snapshot(), original);
    assert.equal(original.sequence, null);
    assert.equal(f.events.at(-1).code, 'OWNER_REVOKED');
  } finally {
    await f.close();
  }
});

test('confirmed SQLite commit remains COMMITTED when RESULT or last publication owner revokes observation', async () => {
  for (const cause of ['RESULT', 'PUBLICATION']) {
    let resultAudit = false,
      arm = false,
      revoked = false;
    const f = await fixture({
      audit: async (e) => {
        if (e.operation === 'RECONCILE' && e.phase === 'RESULT') {
          resultAudit = true;
          if (cause === 'RESULT') revoked = true;
        }
        return 'AVAILABLE';
      },
      assertOwnedSync() {
        if (resultAudit && arm) revoked = true;
      },
    });
    try {
      await f.store.startup();
      const result = await f.store.reconcile(
        1,
        observation(1, 'SYNTHETIC_TEST'),
        () => {
          if (resultAudit) arm = true;
        },
        () => {
          if (revoked) throw new DurableFault('OWNER_REVOKED');
        },
      );
      assert.equal(result.outcome, 'COMMITTED');
      assert.equal(result.revision, 2);
      assert.equal(result.auditHealth, 'AVAILABLE');
      assert.equal(revoked, true);
      assert.equal(f.db.readDurable().meta.revision, 2);
      assert.equal(f.db.readDurable().devices.length, 1);
      assert.equal(f.db.readDurable().bindings[0].source, 'SYNTHETIC_TEST');
      assert.equal(f.store.snapshot(), null);
    } finally {
      await f.close();
    }
  }
});

test('private projection witness binds actual store ledger epoch and invalidates without callbacks', async () => {
  const { inspectRegistryProjection } = await import('../src/main/registry-store.ts');
  let calls = 0;
  const f = await fixture({
    assertOwnedSync() {
      calls++;
    },
  });
  try {
    assert.equal(inspectRegistryProjection({}, null), null);
    await f.store.startup();
    await f.store.reconcile(1, observation());
    const projection = f.store.snapshot();
    const witness = inspectRegistryProjection(f.store, projection);
    assert.ok(witness);
    assert.equal(witness.hostEpoch, f.db.readDurable().meta.host_epoch);
    assert.equal(witness.durableRevision, f.db.readDurable().meta.revision);
    const before = calls;
    assert.equal(witness.finalCurrent(), true);
    assert.equal(calls, before);
    assert.equal(inspectRegistryProjection({ ...f.store }, projection), null);
    assert.equal(inspectRegistryProjection(f.store, { ...projection }), null);
    await f.store.reconcile(2, observation(2));
    assert.equal(witness.finalCurrent(), false);
    const next = inspectRegistryProjection(f.store, f.store.snapshot());
    assert.ok(next);
    f.store.close();
    const closedCalls = calls;
    assert.equal(next.finalCurrent(), false);
    assert.equal(calls, closedCalls);
  } finally {
    await f.close();
  }
});

// Synthetic operator transcript at the store boundary, NOT proof of the native
// four-stage ceremony or human confirmation. Ingestion tests own that composition.
async function associationFixture(options = {}) {
  const f = await fixture(options);
  const { associationRowsSha256 } = await import('../src/main/association-receipt-contract.ts');
  try {
    await f.store.startup();
    const beforeRow = { serial: 'synthetic-private-device', transportId: '1', state: 'DEVICE' };
    const returnRow = { ...beforeRow, transportId: '2' };
    const stage = (rows) => {
      const r = f.store.snapshot();
      return {
        sequence: r.sequence,
        observedUtc: r.observedAtUtc,
        registryRevision: r.revision,
        durableRevision: f.db.readDurable().meta.revision,
        rowsSha256: associationRowsSha256(rows),
      };
    };
    await f.store.reconcile(1, { ...observation(), rows: [beforeRow] });
    const device = f.store.snapshot().devices[0];
    const baseline = stage([beforeRow]);
    await f.store.reconcile(2, { ...observation(2), rows: [] });
    const removal = stage([]);
    await f.store.reconcile(3, { ...observation(3), rows: [returnRow] });
    const returned = stage([returnRow]);
    const transcript = {
      version: 1,
      kind: 'OPERATOR_CABLE_SESSION',
      evidenceId: id(7000),
      deviceId: device.deviceId,
      mode: 'CURRENT',
      hostEpoch: f.db.readDurable().meta.host_epoch,
      installationRevision: 1,
      admittedUtc: 1000,
      deadlineUtc: 121000,
      priorBindingId: device.currentBindingId,
      priorGeneration: device.generation,
      beforeRow,
      returnRow,
      attestation: { heldHandset: true, cableCycle: true, sameHistoricalHandset: false },
      stages: {
        baseline,
        removal,
        return: returned,
        confirmation: {
          sequence: 4,
          observedUtc: 1000,
          rowsSha256: associationRowsSha256([returnRow]),
        },
      },
    };
    const finalObservation = {
      ...observation(4),
      rows: [returnRow],
      proofs: [
        {
          serial: returnRow.serial,
          transportId: returnRow.transportId,
          deviceId: device.deviceId,
          evidenceId: transcript.evidenceId,
        },
      ],
    };
    return { ...f, transcript, finalObservation };
  } catch (error) {
    await f.close();
    throw error;
  }
}

test('association commits real allocated binding, evidence and canonical receipt atomically; reopen keeps history only', async () => {
  const f = await associationFixture();
  try {
    const result = await f.store.reconcileAssociation(4, f.finalObservation, f.transcript);
    assert.equal(result.outcome, 'COMMITTED');
    assert.equal(result.revision, 5);
    const before = f.db.readDurable();
    assert.equal(before.identityEvidence.length, 1);
    assert.equal(before.identityEvidence[0].identity_sha256, null);
    assert.equal(before.associationReceipts.length, 1);
    const receipt = JSON.parse(before.associationReceipts[0].receipt_json);
    const current = f.store.snapshot();
    assert.equal(receipt.finalBindingId, current.devices[0].currentBindingId);
    assert.equal(receipt.finalGeneration, current.devices[0].generation);
    assert.equal(receipt.stages.confirmation.registryRevision, current.revision);
    assert.equal(receipt.stages.confirmation.durableRevision, result.revision);
    f.store.close();
    const reopened = createRegistryStore({
      coordinator: f.coordinator,
      nextId: f.nextId,
      quarantined: () => false,
      assertOwnedSync: () => {},
    });
    assert.equal((await reopened.startup()).outcome, 'COMMITTED');
    assert.deepEqual(f.db.readDurable().associationReceipts, before.associationReceipts);
    assert.equal(reopened.snapshot().devices[0].verification, 'PROVISIONAL');
    assert.equal(reopened.snapshot().devices[0].currentBindingId, null);
    reopened.close();
  } finally {
    await f.close();
  }
});

test('association stale CAS, mismatched proof/transcript and accessor refuse without partial evidence', async () => {
  const f = await associationFixture();
  try {
    const before = f.db.fingerprint();
    assert.equal(
      (await f.store.reconcileAssociation(3, f.finalObservation, f.transcript)).code,
      'STALE_REVISION',
    );
    assert.equal(
      (await f.store.reconcileAssociation(4, { ...f.finalObservation, proofs: [] }, f.transcript))
        .code,
      'INVALID_REQUEST',
    );
    assert.equal(
      (
        await f.store.reconcileAssociation(4, f.finalObservation, {
          ...f.transcript,
          stages: {
            ...f.transcript.stages,
            return: { ...f.transcript.stages.return, registryRevision: 999 },
          },
        })
      ).code,
      'INVALID_REQUEST',
    );
    let getters = 0;
    const hostile = { ...f.finalObservation };
    Object.defineProperty(hostile, 'proofs', {
      enumerable: true,
      get() {
        getters++;
        throw Error('private');
      },
    });
    assert.equal(
      (await f.store.reconcileAssociation(4, hostile, f.transcript)).code,
      'INVALID_REQUEST',
    );
    assert.equal(getters, 0);
    assert.equal(f.db.fingerprint(), before);
    assert.equal(f.db.readDurable().associationReceipts.length, 0);
  } finally {
    await f.close();
  }
});

test('association failed INTENT and final owner revocation commit neither evidence nor receipt', async () => {
  for (const cause of ['AUDIT', 'OWNER']) {
    let armed = false,
      revoked = false;
    const f = await associationFixture({
      audit: async () => (armed && cause === 'AUDIT' ? 'DEGRADED' : 'AVAILABLE'),
      assertOwnedSync() {
        if (armed && cause === 'OWNER') revoked = true;
      },
    });
    try {
      const before = f.db.fingerprint();
      armed = true;
      const result = await f.store.reconcileAssociation(
        4,
        f.finalObservation,
        f.transcript,
        () => {},
        () => {
          if (revoked) throw new DurableFault('OWNER_REVOKED');
        },
      );
      assert.equal(result.outcome, 'NOT_COMMITTED');
      assert.equal(result.code, cause === 'AUDIT' ? 'AUDIT_UNAVAILABLE' : 'OWNER_REVOKED');
      assert.equal(f.db.fingerprint(), before);
    } finally {
      await f.close();
    }
  }
});

test('association late RESULT revocation preserves exact COMMITTED receipt but suppresses live projection', async () => {
  let armed = false,
    revoked = false;
  const f = await associationFixture({
    audit: async (event) => {
      if (armed && event.phase === 'RESULT') revoked = true;
      return 'AVAILABLE';
    },
  });
  try {
    armed = true;
    const result = await f.store.reconcileAssociation(
      4,
      f.finalObservation,
      f.transcript,
      () => {},
      () => {
        if (revoked) throw new DurableFault('OWNER_REVOKED');
      },
    );
    assert.equal(result.outcome, 'COMMITTED');
    assert.equal(f.db.readDurable().associationReceipts.length, 1);
    assert.equal(f.store.snapshot(), null);
  } finally {
    await f.close();
  }
});

test('association uncertain actual COMMIT latches recovery instead of publishing fabricated verification', async () => {
  let armed = false;
  const f = await associationFixture({
    wrapDb(db) {
      return {
        readDurable: () => db.readDurable(),
        commitDurable(revision, delta, admit) {
          const result = db.commitDurable(revision, delta, admit);
          return armed && result.ok ? { ok: false, code: 'OUTCOME_UNKNOWN' } : result;
        },
      };
    },
  });
  try {
    armed = true;
    const result = await f.store.reconcileAssociation(4, f.finalObservation, f.transcript);
    assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
    assert.equal(f.store.snapshot(), null);
    // Actual SQLite committed; wrapper deliberately withholds that certainty.
    assert.equal(f.db.readDurable().associationReceipts.length, 1);
  } finally {
    await f.close();
  }
});

test('association last SQLite COMMIT owner callback cannot outlive the callback-free transcript fence', async () => {
  let withinCommit = false,
    armed = false,
    revoked = false,
    finalSeen = false;
  const f = await associationFixture({
    wrapDb(db) {
      return {
        readDurable: () => db.readDurable(),
        commitDurable(revision, delta, admit) {
          return db.commitDurable(revision, delta, () => {
            withinCommit = true;
            try {
              admit();
            } finally {
              withinCommit = false;
            }
          });
        },
      };
    },
    assertOwnedSync() {
      if (withinCommit && armed) revoked = true;
    },
  });
  try {
    const before = f.db.fingerprint();
    const result = await f.store.reconcileAssociation(
      4,
      f.finalObservation,
      f.transcript,
      () => {
        if (withinCommit) armed = true;
      },
      () => {
        if (withinCommit) finalSeen = true;
        if (revoked) throw new DurableFault('OWNER_REVOKED');
      },
    );
    assert.equal(finalSeen, true);
    assert.equal(revoked, true);
    assert.equal(result.code, 'OWNER_REVOKED');
    assert.equal(result.outcome, 'NOT_COMMITTED');
    assert.equal(f.db.fingerprint(), before);
    assert.equal(f.db.readDurable().associationReceipts.length, 0);
  } finally {
    await f.close();
  }
});

test('historical association promotes only selected row while unchanged second historical claimant stays unresolved', async () => {
  const f = await fixture();
  let store;
  try {
    const { associationRowsSha256 } = await import('../src/main/association-receipt-contract.ts');
    const a = { serial: 'synthetic-handset-a', transportId: '1', state: 'DEVICE' };
    const b = { serial: 'synthetic-handset-b', transportId: '2', state: 'DEVICE' };
    await f.store.startup();
    await f.store.reconcile(1, { ...observation(), rows: [a, b] });
    const ids = f.store.snapshot().devices.map((d) => d.deviceId);
    f.store.close();
    store = createRegistryStore({
      coordinator: f.coordinator,
      nextId: f.nextId,
      quarantined: () => false,
      assertOwnedSync: () => {},
    });
    await store.startup();
    const destination = store.snapshot().devices.find((d) => d.deviceId === ids[0]);
    const beforeRow = { ...a, transportId: '3' },
      other = { ...b, transportId: '4' },
      returnRow = { ...a, transportId: '5' };
    const stage = (rows) => {
      const r = store.snapshot();
      return {
        sequence: r.sequence,
        observedUtc: r.observedAtUtc,
        registryRevision: r.revision,
        durableRevision: f.db.readDurable().meta.revision,
        rowsSha256: associationRowsSha256(rows),
      };
    };
    await store.reconcile(3, { ...observation(1), rows: [beforeRow, other] });
    assert.equal(store.snapshot().claims.filter((c) => c.reason === 'IDENTITY_REQUIRED').length, 2);
    const baseline = stage([beforeRow, other]);
    await store.reconcile(4, { ...observation(2), rows: [other] });
    const removal = stage([other]);
    await store.reconcile(5, { ...observation(3), rows: [returnRow, other] });
    const returned = stage([returnRow, other]);
    const transcript = {
      version: 1,
      kind: 'OPERATOR_CABLE_SESSION',
      evidenceId: id(7001),
      deviceId: destination.deviceId,
      mode: 'HISTORICAL',
      hostEpoch: 2,
      installationRevision: 1,
      admittedUtc: 1000,
      deadlineUtc: 121000,
      priorBindingId: null,
      priorGeneration: destination.generation,
      beforeRow,
      returnRow,
      attestation: { heldHandset: true, cableCycle: true, sameHistoricalHandset: true },
      stages: {
        baseline,
        removal,
        return: returned,
        confirmation: {
          sequence: 4,
          observedUtc: 1000,
          rowsSha256: associationRowsSha256([returnRow, other]),
        },
      },
    };
    const result = await store.reconcileAssociation(
      6,
      {
        ...observation(4),
        rows: [returnRow, other],
        proofs: [
          {
            serial: returnRow.serial,
            transportId: returnRow.transportId,
            deviceId: destination.deviceId,
            evidenceId: transcript.evidenceId,
          },
        ],
      },
      transcript,
    );
    assert.equal(result.outcome, 'COMMITTED');
    const projection = store.snapshot();
    assert.equal(projection.devices.length, 2);
    assert.equal(projection.devices.filter((d) => d.verification === 'VERIFIED').length, 1);
    assert.equal(projection.devices.find((d) => d.deviceId === ids[1]).currentBindingId, null);
    assert.equal(
      projection.claims.find((c) => c.serial === other.serial).reason,
      'IDENTITY_REQUIRED',
    );
    assert.equal(f.db.readDurable().identityEvidence.length, 1);
    assert.equal(f.db.readDurable().associationReceipts.length, 1);
  } finally {
    store?.close();
    await f.close();
  }
});
