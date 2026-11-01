import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDurableCoordinator, DurableFault } from '../src/main/durable-coordinator.ts';
import { snapshotDurable, applyDurableDelta } from '../src/main/durable-contract.ts';
function fixture(overrides = {}) {
  let snapshot = snapshotDurable({
    meta: {
      singleton: 1,
      revision: 0,
      host_epoch: 0,
      last_change_utc: null,
      last_operation_id: null,
      last_change_kind: null,
    },
    devices: [],
    bindings: [],
    identityEvidence: [],
    captures: [],
    holds: [],
  });
  const logs = [],
    effects = [];
  const db = {
    readDurable: () => snapshot,
    commitDurable(revision, delta, admit) {
      admit();
      if (revision !== snapshot.meta.revision) return { ok: false, code: 'CONFLICT' };
      snapshot = applyDurableDelta(snapshot, delta);
      assert.ok(snapshot);
      return { ok: true, value: snapshot };
    },
  };
  const coordinator = createDurableCoordinator({
    db,
    assertOwnedSync() {},
    clock: () => 1000,
    newId: randomUUID,
    audit: async (fields) => {
      logs.push(fields);
      return 'AVAILABLE';
    },
    ...overrides,
  });
  const prepare = ({ operationId, utc, snapshot: current }) => ({
    effect: async () => {
      effects.push('effect');
      return 7;
    },
    delta: () => ({
      operationId,
      utc,
      kind: 'RECONCILE',
      hostEpoch: current.meta.host_epoch,
      devices: { insert: [], update: [] },
      bindings: { insert: [], refresh: [], retireIds: [] },
      identityEvidence: { insert: [] },
      captures: { insert: [], transition: [] },
      holds: { insert: [], releaseIds: [] },
    }),
  });
  const run = () => coordinator.withLane((lane) => lane.step('RECONCILE', 0, prepare));
  return { coordinator, run, prepare, logs, effects, read: () => snapshot };
}
test('intent precedes effect and actual fixed delta commit; result audit follows commit', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.ok, true);
  assert.equal(result.result.outcome, 'COMMITTED');
  assert.equal(result.snapshot.meta.revision, 1);
  assert.equal(result.value, 7);
  assert.deepEqual(
    f.logs.map((v) => v.phase),
    ['INTENT', 'RESULT'],
  );
  assert.notEqual(result.result.operationId, result.result.diagnosticId);
});
test('failed intent prevents filesystem effect and DB commit', async () => {
  const f = fixture({ audit: async () => 'DEGRADED' });
  const r = await f.run();
  assert.equal(r.result.code, 'AUDIT_UNAVAILABLE');
  assert.deepEqual(f.effects, []);
  assert.equal(f.read().meta.revision, 0);
});
test('result audit failure retains known committed success', async () => {
  const f = fixture({ audit: async (x) => (x.phase === 'INTENT' ? 'AVAILABLE' : 'DEGRADED') });
  const r = await f.run();
  assert.equal(r.result.outcome, 'COMMITTED');
  assert.equal(r.result.auditHealth, 'DEGRADED');
  assert.equal(f.read().meta.revision, 1);
});
test('busy is bounded no-queue; close revokes before effect and waits actual audit settlement', async () => {
  let release;
  const pending = new Promise((r) => {
    release = r;
  });
  const f = fixture({
    audit: async (x) => {
      if (x.phase === 'INTENT') await pending;
      return 'AVAILABLE';
    },
  });
  const first = f.run();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal((await f.run()).code, 'BUSY');
  let closed = false;
  const close = f.coordinator.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(closed, false);
  release();
  assert.equal((await first).result.code, 'OWNER_REVOKED');
  await close;
  assert.equal(closed, true);
  assert.deepEqual(f.effects, []);
});
test('unexpected effect failure latches uncertainty until a genuinely new coordinator', async () => {
  const f = fixture();
  const r = await f.coordinator.withLane((lane) =>
    lane.step('RECONCILE', 0, (ctx) => ({
      ...f.prepare(ctx),
      effect: async () => {
        throw Error('private path');
      },
    })),
  );
  assert.equal(r.result.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(f.coordinator.available, false);
  assert.equal((await f.run()).code, 'RECOVERY_REQUIRED');
  assert.equal(JSON.stringify(r).includes('private'), false);
});
test('known rollback and unknown commit are distinct; final admission revocation cannot commit', async () => {
  for (const code of ['WRITE_FAILED', 'OUTCOME_UNKNOWN']) {
    const f = fixture({
      db: {
        readDurable: () =>
          snapshotDurable({
            meta: {
              singleton: 1,
              revision: 0,
              host_epoch: 0,
              last_change_utc: null,
              last_operation_id: null,
              last_change_kind: null,
            },
            devices: [],
            bindings: [],
            identityEvidence: [],
            captures: [],
            holds: [],
          }),
        commitDurable: () => ({ ok: false, code }),
      },
    });
    const r = await f.run();
    assert.equal(r.result.outcome, code === 'WRITE_FAILED' ? 'NOT_COMMITTED' : 'OUTCOME_UNKNOWN');
  }
  const f = fixture();
  let calls = 0;
  const r = await f.coordinator.withLane((lane) =>
    lane.step('RECONCILE', 0, f.prepare, () => {
      if (++calls === 6) throw new DurableFault('OWNER_REVOKED');
    }),
  );
  assert.equal(r.ok, false);
  assert.equal(f.read().meta.revision, 0);
});
test('retained lane cannot read after completion; stale revision never effects', async () => {
  const f = fixture();
  let retained;
  await f.coordinator.withLane(async (lane) => {
    retained = lane;
  });
  assert.throws(() => retained.read(), /OWNER_REVOKED/);
  const r = await f.coordinator.withLane((lane) => lane.step('RECONCILE', 1, f.prepare));
  assert.equal(r.result.code, 'STALE_REVISION');
  assert.deepEqual(f.effects, []);
});

test('final supplied admission cannot revoke external ownership and still commit', async () => {
  let owner = true,
    calls = 0;
  const f = fixture({
    assertOwnedSync() {
      if (!owner) throw Error('private owner');
    },
  });
  const r = await f.coordinator.withLane((lane) =>
    lane.step('RECONCILE', 0, f.prepare, () => {
      if (++calls === 7) owner = false;
    }),
  );
  assert.equal(calls, 7);
  assert.equal(r.result.code, 'OWNER_REVOKED');
  assert.equal(f.read().meta.revision, 0);
});
