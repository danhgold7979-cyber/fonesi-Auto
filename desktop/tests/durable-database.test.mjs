import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  reconstructDisconnectedRegistry,
  isRegistrySnapshot,
  isCurrentBinding,
} from '../src/main/transport-registry.ts';
import { DatabaseSync } from 'node:sqlite';
import {
  createAssociationReceipt,
  snapshotAssociationTranscript,
  snapshotAssociationRow,
  parseAssociationReceipt,
  associationRowsSha256,
} from '../src/main/association-receipt-contract.ts';
import {
  FoundationDatabase,
  MIGRATION_HASHES,
  statement,
} from '../src/main/foundation-database.ts';
import {
  snapshotDurable,
  snapshotDurableDelta,
  applyDurableDelta,
} from '../src/main/durable-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'durable-db-'));
  return {
    root,
    file: join(root, 'foundation.sqlite'),
    id: randomUUID(),
    cleanup() {
      assert.equal(realpathSync(root), root);
      rmSync(root, { recursive: true, force: false });
    },
  };
}
// Synthetic prerequisite authority, actual SQLite snapshot/integrity/history; no encryption claim.
function provider(db, f, seen = [], stop = -1) {
  return async (version) => {
    if (version === stop) throw Error('STOP');
    const file = join(f.root, `snap-${version}-${randomUUID()}.sqlite`);
    await db.snapshot(file);
    const snapshot = new FoundationDatabase(file, f.id, true);
    try {
      seen.push(version);
      return {
        backupId: randomUUID(),
        fingerprint: snapshot.fingerprint(),
        schemaVersion: version,
      };
    } finally {
      snapshot.close();
    }
  };
}
const delta = (kind = 'RECONCILE', utc = 1000) => ({
  operationId: randomUUID(),
  kind,
  utc,
  hostEpoch: 0,
  devices: { insert: [], update: [] },
  bindings: { insert: [], refresh: [], retireIds: [] },
  identityEvidence: { insert: [] },
  associationReceipts: { insert: [] },
  captures: { insert: [], transition: [] },
  holds: { insert: [], releaseIds: [] },
});
const seed = () => {
  const d = delta();
  d.devices.insert = [
    {
      device_id: id(1),
      generation: 0,
      display_profile_revision: 0,
      created_utc: 1000,
      updated_utc: 1000,
      last_seen_utc: 1000,
    },
  ];
  d.bindings.insert = [
    {
      binding_id: id(2),
      device_id: id(1),
      generation: 0,
      serial: 'synthetic-private-serial',
      transport_id: '1',
      source: 'SYNTHETIC_TEST',
      last_state: 'DEVICE',
      observed_utc: 1000,
      retired: 0,
    },
  ];
  return d;
};
const capture = () => ({
  evidence_id: id(3),
  device_id: id(1),
  binding_id: id(2),
  generation: 0,
  display_profile_revision: 0,
  kind: 'PNG',
  captured_utc: 2000,
  display_evidence_id: id(4),
  display_observed_utc: 1900,
  valid_until_utc: 2100,
  expires_utc: 604802000,
  width: 1,
  height: 1,
  rotation: 0,
  source: 'SYNTHETIC_TEST',
  relative_name: `capture-${id(3)}.png`,
  sha256: null,
  bytes: null,
  state: 'RESERVED',
});
async function opened(fn) {
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    await db.migrate(provider(db, f), 1000);
    await fn(db, f);
  } finally {
    db?.close();
    f.cleanup();
  }
}
test('migration5 preserves all four historical SQL hashes and synthetic snapshot sequence0..4', async () => {
  assert.deepEqual(MIGRATION_HASHES.slice(0, 4), [
    'a7dcc15acf94d6f8617716d4b096d1aa080fe59ecbf0b306688c4c81f2d14d73',
    '5f9d4df89fbf0ee078120acd0810c8b1e0367bbee6cb60f9be64f35814cd44b3',
    '9fd96888dcbfbf6a8a35d400be2eacc83fa54fecf89ca8d596d95fc5c4d177f6',
    '45b22427ff3579017424b0cff1e0bcd9ba2ecab05692d9b42023869a07562882',
  ]);
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    const seen = [];
    await assert.rejects(db.migrate(provider(db, f, seen, 3), 1000));
    assert.equal(db.version, 3);
    db.validate();
    assert.throws(() => db.readDurable());
    const before = db.readSettings();
    await db.migrate(provider(db, f, seen), 1001);
    assert.deepEqual(seen, [0, 1, 2, 3, 4]);
    assert.equal(db.version, 5);
    assert.deepEqual(db.readSettings(), before);
    assert.deepEqual(db.readDurable(), {
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
      associationReceipts: [],
      captures: [],
      holds: [],
    });
  } finally {
    db?.close();
    f.cleanup();
  }
});
test('actual durable CAS, immutable snapshots, final admission rollback and cross-table ownership', async () =>
  opened(async (db) => {
    const first = db.commitDurable(0, seed(), () => {});
    assert.equal(first.ok, true);
    assert.ok(Object.isFrozen(first.value.devices[0]));
    const before = db.fingerprint();
    assert.equal(db.commitDurable(0, delta(), () => {}).code, 'CONFLICT');
    assert.equal(db.fingerprint(), before);
    const original = Error('admission-private');
    assert.throws(
      () =>
        db.commitDurable(1, delta('RECONCILE', 1001), () => {
          throw original;
        }),
      (e) => e === original,
    );
    assert.equal(db.fingerprint(), before);
    const invalid = seed();
    invalid.devices.insert = [];
    invalid.bindings.insert[0].binding_id = id(5);
    invalid.bindings.insert[0].device_id = id(99);
    assert.equal(db.commitDurable(1, invalid, () => {}).ok, false);
    assert.equal(db.fingerprint(), before);
  }));
test('startup retires every binding and increments every durable generation without VERIFIED authority', async () =>
  opened(async (db) => {
    assert.equal(db.commitDurable(0, seed(), () => {}).ok, true);
    const old = db.readDurable();
    const d = delta('STARTUP', 1100);
    d.hostEpoch = 1;
    d.devices.update = old.devices.map((x) => ({
      ...x,
      generation: x.generation + 1,
      updated_utc: 1100,
    }));
    d.bindings.retireIds = old.bindings.map((x) => x.binding_id);
    const result = db.commitDurable(1, d, () => {});
    assert.equal(result.ok, true);
    assert.equal(result.value.meta.host_epoch, 1);
    assert.equal(result.value.devices[0].generation, 1);
    assert.equal(result.value.bindings[0].retired, 1);
    assert.ok(!JSON.stringify(result.value).includes('VERIFIED'));
    const bad = structuredClone(result.value);
    bad.devices[0].generation = -0;
    assert.equal(snapshotDurable(bad), null);
    bad.devices[0].generation = 1;
    bad.devices[0].verification = 'VERIFIED';
    assert.equal(snapshotDurable(bad), null);
  }));
test('capture receipt/display identities, holds, immutable hash and expiry govern exact transitions', async () =>
  opened(async (db) => {
    assert.equal(db.commitDurable(0, seed(), () => {}).ok, true);
    const reserve = delta('CAPTURE', 2000);
    reserve.captures.insert = [capture()];
    assert.equal(db.commitDurable(1, reserve, () => {}).ok, true);
    const complete = delta('CAPTURE', 2001);
    complete.captures.transition = [
      {
        evidenceId: id(3),
        expectedState: 'RESERVED',
        state: 'VALIDATED',
        sha256: 'a'.repeat(64),
        bytes: 70,
      },
    ];
    assert.equal(db.commitDurable(2, complete, () => {}).ok, true);
    const hold = delta('HOLD', 2002);
    hold.holds.insert = [{ hold_id: id(5), evidence_id: id(3), reason: 'OUTCOME_UNKNOWN' }];
    assert.equal(db.commitDurable(3, hold, () => {}).ok, true);
    const prune = delta('PRUNE', 604802001);
    prune.captures.transition = [
      { ...complete.captures.transition[0], expectedState: 'VALIDATED', state: 'DELETE_PENDING' },
    ];
    const held = db.fingerprint();
    assert.equal(db.commitDurable(4, prune, () => {}).ok, false);
    assert.equal(db.fingerprint(), held);
    const release = delta('HOLD', 2003);
    release.holds.releaseIds = [id(5)];
    assert.equal(db.commitDurable(4, release, () => {}).ok, true);
    assert.equal(db.commitDurable(5, { ...prune, utc: 2004 }, () => {}).ok, false);
    assert.equal(db.commitDurable(5, prune, () => {}).ok, true);
    const finish = delta('PRUNE', 604802002);
    finish.captures.transition = [
      { ...prune.captures.transition[0], expectedState: 'DELETE_PENDING', state: 'DELETED' },
    ];
    assert.equal(db.commitDurable(6, finish, () => {}).ok, true);
    assert.equal(db.readDurable().captures[0].display_evidence_id, id(4));
    assert.equal(db.readDurable().captures[0].state, 'DELETED');
  }));
test('before/after real COMMIT exception latches uncertainty; fresh reopen sees exact old/new state', async () => {
  for (const after of [false, true])
    await opened(async (db, f) => {
      const original = db.connection.exec.bind(db.connection);
      db.connection.exec = (sql) => {
        if (sql === 'COMMIT') {
          if (after) original(sql);
          throw Error('PRIVATE_COMMIT');
        }
        return original(sql);
      };
      assert.equal(db.commitDurable(0, seed(), () => {}).code, 'OUTCOME_UNKNOWN');
      assert.throws(() => db.readDurable());
      assert.throws(() => db.readSettings());
      await assert.rejects(db.snapshot(join(f.root, 'uncertain-copy.sqlite')));
      db.connection.exec = original;
      db.close();
      const reopened = new FoundationDatabase(f.file, f.id);
      try {
        assert.equal(reopened.readDurable().meta.revision, after ? 1 : 0);
      } finally {
        reopened.close();
      }
    });
});
test('actual second writer BUSY preserves fingerprint and no final admission executes', async () =>
  opened(async (db, f) => {
    const other = new DatabaseSync(f.file);
    let called = false;
    try {
      other.exec('BEGIN IMMEDIATE');
      const before = db.fingerprint();
      assert.equal(
        db.commitDurable(0, seed(), () => {
          called = true;
        }).code,
        'WRITE_FAILED',
      );
      assert.equal(called, false);
      assert.equal(db.fingerprint(), before);
    } finally {
      other.exec('ROLLBACK');
      other.close();
    }
  }));
test('malformed actual SQL rows and unknown schema version reject, never imported as current', async () => {
  for (const sql of [
    "UPDATE registry_meta SET last_operation_id='not-a-uuid',last_change_utc=1,last_change_kind='STARTUP',revision=1",
    'DELETE FROM registry_meta',
    'PRAGMA user_version=6',
  ])
    await opened(async (db) => {
      db.connection.exec(sql);
      assert.throws(() => db.readDurable());
    });
});
test('pure delta snapshots reject getters, duplicate fields/budgets and do not mutate caller inputs', async () =>
  opened(async (db) => {
    const d = seed(),
      copy = snapshotDurableDelta(d);
    assert.ok(copy);
    d.devices.insert[0].serial = 'private';
    assert.equal(copy.devices.insert[0].serial, undefined);
    assert.equal(snapshotDurableDelta(d), null);
    let calls = 0;
    const getter = delta();
    Object.defineProperty(getter, 'kind', {
      get() {
        calls++;
        return 'RECONCILE';
      },
    });
    assert.equal(snapshotDurableDelta(getter), null);
    assert.equal(calls, 0);
    const tooMany = delta();
    tooMany.devices.insert = Array(257).fill(seed().devices.insert[0]);
    assert.equal(snapshotDurableDelta(tooMany), null);
    let enumerated = false;
    tooMany.devices.insert = new Proxy(Array(257), {
      ownKeys() {
        enumerated = true;
        throw Error('not-enumerated');
      },
    });
    assert.equal(snapshotDurableDelta(tooMany), null);
    assert.equal(enumerated, false);

    const invalid = structuredClone(db.readDurable());
    invalid.meta.host_epoch = Number.MAX_SAFE_INTEGER;
    const startup = delta('STARTUP');
    startup.hostEpoch = Number.MAX_SAFE_INTEGER + 1;
    assert.equal(applyDurableDelta(invalid, startup), null);
    assert.equal(
      snapshotDurable({
        ...db.readDurable(),
        captures: [{ ...capture(), display_evidence_id: id(3) }],
      }),
      null,
    );
  }));

test('actual committed startup reconstructs only provisional disconnected WeakSet snapshot', async () =>
  opened(async (db, f) => {
    assert.equal(db.commitDurable(0, seed(), () => {}).ok, true);
    assert.equal(reconstructDisconnectedRegistry(db.readDurable()), null);
    const old = db.readDurable(),
      d = delta('STARTUP', 1100);
    d.hostEpoch = 1;
    d.devices.update = old.devices.map((x) => ({
      ...x,
      generation: x.generation + 1,
      updated_utc: 1100,
    }));
    d.bindings.retireIds = old.bindings.map((x) => x.binding_id);
    assert.equal(db.commitDurable(1, d, () => {}).ok, true);
    const disk = new FoundationDatabase(f.file, f.id, true);
    try {
      const rows = disk.readDurable();
      const r = reconstructDisconnectedRegistry(rows);
      assert.ok(isRegistrySnapshot(r));
      assert.equal(r.devices[0].verification, 'PROVISIONAL');
      assert.equal(r.devices[0].currentBindingId, null);
      assert.equal(r.source, null);
      assert.equal(r.sequence, null);
      assert.equal(r.bindings[0].source, 'SYNTHETIC_TEST');
      assert.equal(
        isCurrentBinding(r, {
          deviceId: id(1),
          bindingId: id(2),
          generation: 1,
          serial: 'synthetic-private-serial',
        }),
        false,
      );
      for (const bad of [
        { ...rows, meta: { ...rows.meta, last_change_kind: 'RECONCILE' } },
        { ...rows, bindings: rows.bindings.map((b) => ({ ...b, retired: 0 })) },
        { ...rows, devices: rows.devices.map((x) => ({ ...x, verification: 'VERIFIED' })) },
      ])
        assert.equal(reconstructDisconnectedRegistry(bad), null);
      assert.equal(isRegistrySnapshot(JSON.parse(JSON.stringify(r))), false);
    } finally {
      disk.close();
    }
  }));

test('durable relationship/time invariants and capture immutable hash reject without original mutation', async () =>
  opened(async (db) => {
    assert.equal(db.commitDurable(0, seed(), () => {}).ok, true);
    const before = db.readDurable();
    for (const patch of [
      (s) => {
        s.meta.host_epoch = 2;
      },
      (s) => {
        s.devices[0].last_seen_utc = 1001;
      },
      (s) => {
        s.bindings[0].generation = 1;
      },
      (s) => {
        s.bindings[0].serial = 'private\ncontrol';
      },
    ]) {
      const value = structuredClone(before);
      patch(value);
      assert.equal(snapshotDurable(value), null);
    }
    const reserve = delta('CAPTURE', 2000);
    reserve.captures.insert = [capture()];
    assert.equal(db.commitDurable(1, reserve, () => {}).ok, true);
    const completed = delta('CAPTURE', 2001);
    completed.captures.transition = [
      {
        evidenceId: id(3),
        expectedState: 'RESERVED',
        state: 'VALIDATED',
        sha256: 'a'.repeat(64),
        bytes: 70,
      },
    ];
    assert.equal(db.commitDurable(2, completed, () => {}).ok, true);
    const fingerprint = db.fingerprint(),
      bad = delta('CAPTURE', 2002);
    bad.captures.transition = [
      {
        ...completed.captures.transition[0],
        expectedState: 'VALIDATED',
        state: 'STALE',
        sha256: 'b'.repeat(64),
      },
    ];
    assert.equal(db.commitDurable(3, bad, () => {}).ok, false);
    assert.equal(db.fingerprint(), fingerprint);
  }));

// Actual SQLite, synthetic operator transcript only; not device/physical enrollment evidence.
function associationCandidate(db) {
  const initial = delta('STARTUP', 1000);
  initial.hostEpoch = 1;
  assert.equal(db.commitDurable(0, initial, () => {}).ok, true);
  const baseline = seed();
  baseline.hostEpoch = 1;
  baseline.utc = 1100;
  baseline.devices.insert[0].created_utc = 1100;
  baseline.devices.insert[0].updated_utc = 1100;
  baseline.devices.insert[0].last_seen_utc = 1100;
  baseline.bindings.insert[0].observed_utc = 1100;
  assert.equal(db.commitDurable(1, baseline, () => {}).ok, true);
  const removal = delta('RECONCILE', 1200);
  removal.hostEpoch = 1;
  removal.devices.update = [{ ...db.readDurable().devices[0], generation: 1, updated_utc: 1200 }];
  removal.bindings.retireIds = [id(2)];
  assert.equal(db.commitDurable(2, removal, () => {}).ok, true);
  const returned = delta('RECONCILE', 1300);
  returned.hostEpoch = 1;
  assert.equal(db.commitDurable(3, returned, () => {}).ok, true);
  const beforeRow = { serial: 'synthetic-private-serial', transportId: '1', state: 'DEVICE' },
    returnRow = { ...beforeRow, transportId: '2' };
  const stage = (sequence, observedUtc, registryRevision, durableRevision, rows) => ({
    sequence,
    observedUtc,
    registryRevision,
    durableRevision,
    rowsSha256: associationRowsSha256(rows),
  });
  const transcript = {
    version: 1,
    kind: 'OPERATOR_CABLE_SESSION',
    evidenceId: id(3),
    deviceId: id(1),
    mode: 'CURRENT',
    hostEpoch: 1,
    installationRevision: 1,
    admittedUtc: 1000,
    deadlineUtc: 121000,
    priorBindingId: id(2),
    priorGeneration: 0,
    beforeRow,
    returnRow,
    attestation: { heldHandset: true, cableCycle: true, sameHistoricalHandset: false },
    stages: {
      baseline: stage(1, 1100, 1, 2, [beforeRow]),
      removal: stage(2, 1200, 2, 3, []),
      return: stage(3, 1300, 3, 4, [returnRow]),
      confirmation: {
        sequence: 4,
        observedUtc: 1400,
        rowsSha256: associationRowsSha256([returnRow]),
      },
    },
  };
  const receipt = createAssociationReceipt(transcript, {
    finalBindingId: id(4),
    finalGeneration: 1,
    registryRevision: 4,
    durableRevision: 5,
  });
  assert.ok(receipt);
  const d = delta('RECONCILE', 1400);
  d.hostEpoch = 1;
  d.devices.update = [{ ...db.readDurable().devices[0], updated_utc: 1400, last_seen_utc: 1400 }];
  d.bindings.insert = [
    {
      ...baseline.bindings.insert[0],
      binding_id: id(4),
      generation: 1,
      transport_id: '2',
      observed_utc: 1400,
    },
  ];
  d.identityEvidence.insert = [
    {
      evidence_id: id(3),
      device_id: id(1),
      observed_utc: 1400,
      source: 'SYNTHETIC_TEST',
      identity_sha256: null,
    },
  ];
  d.associationReceipts.insert = [receipt];
  return { d, transcript, receipt };
}
test('association canonical parser is bounded descriptor-only and hashes exact normalized rowsets', async () =>
  opened(async (db) => {
    const { transcript, receipt } = associationCandidate(db);
    const value = snapshotAssociationTranscript(transcript);
    assert.ok(value);
    assert.ok(Object.isFrozen(value.stages.confirmation));
    assert.deepEqual(snapshotAssociationRow(receipt), receipt);
    assert.equal(parseAssociationReceipt(receipt.receipt_json).finalBindingId, id(4));
    for (const raw of [
      ' ' + receipt.receipt_json,
      receipt.receipt_json.replace('"version":1', '"version":1,"version":1'),
      receipt.receipt_json + '\n',
      'x'.repeat(4097),
    ])
      assert.equal(parseAssociationReceipt(raw), null);
    for (const change of [
      { transcript_sha256: 'a'.repeat(64) },
      { receipt_version: 2 },
      { evidence_id: id(5) },
    ])
      assert.equal(snapshotAssociationRow({ ...receipt, ...change }), null);
    let calls = 0;
    const getter = { ...transcript };
    Object.defineProperty(getter, 'beforeRow', {
      get() {
        calls++;
        throw Error('private');
      },
      enumerable: true,
    });
    assert.equal(snapshotAssociationTranscript(getter), null);
    assert.equal(calls, 0);
    assert.equal(snapshotAssociationTranscript({ ...transcript, deadlineUtc: 120999 }), null);
    assert.equal(
      snapshotAssociationTranscript({
        ...transcript,
        attestation: { ...transcript.attestation, sameHistoricalHandset: true },
      }),
      null,
    );
    for (const change of [
      { extra: true },
      { mode: 'OTHER' },
      { evidenceId: transcript.deviceId },
      { priorBindingId: transcript.deviceId },
      { deadlineUtc: -0 },
    ])
      assert.equal(snapshotAssociationTranscript({ ...transcript, ...change }), null);
    for (const [name, change] of [
      ['removal', { sequence: 1 }],
      ['return', { observedUtc: 1199 }],
      ['return', { registryRevision: 2 }],
      ['return', { durableRevision: 3 }],
      ['confirmation', { observedUtc: 121001 }],
      ['confirmation', { rowsSha256: 'a'.repeat(64) }],
    ])
      assert.equal(
        snapshotAssociationTranscript({
          ...transcript,
          stages: { ...transcript.stages, [name]: { ...transcript.stages[name], ...change } },
        }),
        null,
      );
    assert.equal(
      createAssociationReceipt(transcript, {
        finalBindingId: transcript.priorBindingId,
        finalGeneration: 1,
        registryRevision: 4,
        durableRevision: 5,
      }),
      null,
    );
    const later = { serial: 'other', transportId: '3', state: 'OFFLINE' };
    assert.equal(
      associationRowsSha256([transcript.returnRow, later]),
      associationRowsSha256([later, transcript.returnRow]),
    );
    assert.equal(associationRowsSha256([later, later]), null);
    let enumerated = false;
    assert.equal(
      associationRowsSha256(
        new Proxy(Array(257), {
          ownKeys() {
            enumerated = true;
            throw Error();
          },
        }),
      ),
      null,
    );
    assert.equal(enumerated, false);
    const missing = { ...db.readDurable() };
    delete missing.associationReceipts;
    assert.equal(snapshotDurable(missing), null);
    const missingDelta = { ...delta() };
    delete missingDelta.associationReceipts;
    assert.equal(snapshotDurableDelta(missingDelta), null);
  }));
test('association receipt/evidence/binding commit atomically, remain immutable across startup and actual reopen', async () =>
  opened(async (db, f) => {
    const { d, receipt } = associationCandidate(db);
    assert.equal(db.commitDurable(4, d, () => {}).ok, true);
    const committed = db.readDurable();
    assert.deepEqual(committed.associationReceipts, [receipt]);
    assert.equal(committed.identityEvidence[0].identity_sha256, null);
    const startup = delta('STARTUP', 1500);
    startup.hostEpoch = 2;
    startup.devices.update = committed.devices.map((x) => ({
      ...x,
      generation: x.generation + 1,
      updated_utc: 1500,
    }));
    startup.bindings.retireIds = [id(4)];
    assert.equal(db.commitDurable(5, startup, () => {}).ok, true);
    const reopened = new FoundationDatabase(f.file, f.id);
    try {
      assert.deepEqual(reopened.readDurable().associationReceipts, [receipt]);
      const runtime = reconstructDisconnectedRegistry(reopened.readDurable());
      assert.ok(runtime);
      assert.equal(runtime.devices[0].state, 'DISCONNECTED');
      assert.equal(runtime.devices[0].verification, 'PROVISIONAL');
    } finally {
      reopened.close();
    }
  }));
test('association missing/tampered refs, wrong delta kind and duplicate receipt refuse without changing SQL', async () =>
  opened(async (db) => {
    const { d } = associationCandidate(db);
    const before = db.fingerprint();
    for (const mutate of [
      (x) => (x.identityEvidence.insert = []),
      (x) => (x.bindings.insert = []),
      (x) => (x.kind = 'DISPLAY'),
      (x) => (x.associationReceipts.insert[0].transcript_sha256 = 'b'.repeat(64)),
      (x) => (x.identityEvidence.insert[0].identity_sha256 = 'c'.repeat(64)),
      (x) => (x.bindings.insert[0].transport_id = '9'),
    ]) {
      const bad = structuredClone(d);
      mutate(bad);
      assert.equal(db.commitDurable(4, bad, () => {}).ok, false);
      assert.equal(db.fingerprint(), before);
    }
    assert.throws(
      () =>
        db.commitDurable(4, d, () => {
          throw Error('revoked');
        }),
      /revoked/,
    );
    assert.equal(db.fingerprint(), before);
    assert.equal(db.commitDurable(3, d, () => {}).code, 'CONFLICT');
    assert.equal(db.fingerprint(), before);
    assert.equal(db.commitDurable(4, d, () => {}).ok, true);
    const after = db.fingerprint();
    const duplicate = delta('RECONCILE', 1500);
    duplicate.hostEpoch = 1;
    duplicate.associationReceipts.insert = d.associationReceipts.insert;
    assert.equal(db.commitDurable(5, duplicate, () => {}).ok, false);
    assert.equal(db.fingerprint(), after);
    statement(db.connection, 'UPDATE device_session_association SET transcript_sha256=?', (q) =>
      q.run('f'.repeat(64)),
    );
    assert.throws(() => db.readDurable(), /DURABLE_RECOVERY_REQUIRED/);
  }));
test('historical schema4 normalizes only absent receipt table and refuses current writes until protected migration5', async () => {
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    await assert.rejects(db.migrate(provider(db, f, [], 4), 1000));
    assert.equal(db.version, 4);
    db.validate();
    assert.deepEqual(db.readDurable().associationReceipts, []);
    assert.equal(db.commitDurable(0, seed(), () => {}).ok, false);
    const original = db.fingerprint();
    await assert.rejects(
      db.migrate(async () => {
        throw Error('NO_PROTECTED_BACKUP');
      }, 1100),
      /NO_PROTECTED_BACKUP/,
    );
    assert.equal(db.fingerprint(), original);
    assert.equal(db.version, 4);
    await db.migrate(provider(db, f), 1200);
    assert.equal(db.version, 5);
    assert.deepEqual(db.readDurable().associationReceipts, []);
  } finally {
    db?.close();
    f.cleanup();
  }
});

test('association insertion uses actual SQLite page budget and rolls back before final admission over64MiB', async () =>
  opened(async (db) => {
    const { d } = associationCandidate(db);
    const before = db.fingerprint();
    // Test-owned temporary growth of a known TEXT column, restored before admission.
    // Freed pages remain in this actual SQLite database; no schema or cap override.
    statement(
      db.connection,
      'UPDATE registry_binding SET serial=CAST(zeroblob(?) AS TEXT) WHERE binding_id=?',
      (q) => q.run(64 * 1024 * 1024, id(2)),
    );
    statement(db.connection, 'UPDATE registry_binding SET serial=? WHERE binding_id=?', (q) =>
      q.run('synthetic-private-serial', id(2)),
    );
    assert.equal(db.fingerprint(), before);
    const pages = statement(db.connection, 'PRAGMA page_count', (q) => q.get().page_count),
      size = statement(db.connection, 'PRAGMA page_size', (q) => q.get().page_size);
    assert.ok(pages * size > 64 * 1024 * 1024);
    let admitted = false;
    const result = db.commitDurable(4, d, () => {
      admitted = true;
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'WRITE_FAILED');
    assert.equal(admitted, false);
    assert.equal(db.fingerprint(), before);
    assert.equal(db.readDurable().associationReceipts.length, 0);
  }));

test('closed durable database refuses commit before reading SQLite version', async () =>
  opened(async (db) => {
    db.close();
    Object.defineProperty(db, 'version', {
      get() {
        throw Error('VERSION_READ_AFTER_CLOSE');
      },
    });
    assert.deepEqual(
      db.commitDurable(0, delta(), () => {
        throw Error('ADMISSION');
      }),
      { ok: false, code: 'RECOVERY_REQUIRED' },
    );
  }));
