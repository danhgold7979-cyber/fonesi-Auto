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
import { FoundationDatabase, MIGRATION_HASHES } from '../src/main/foundation-database.ts';
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
test('migration4 preserves all three historical SQL hashes and authenticated synthetic snapshot sequence0..3', async () => {
  assert.deepEqual(MIGRATION_HASHES.slice(0, 3), [
    'a7dcc15acf94d6f8617716d4b096d1aa080fe59ecbf0b306688c4c81f2d14d73',
    '5f9d4df89fbf0ee078120acd0810c8b1e0367bbee6cb60f9be64f35814cd44b3',
    '9fd96888dcbfbf6a8a35d400be2eacc83fa54fecf89ca8d596d95fc5c4d177f6',
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
    assert.deepEqual(seen, [0, 1, 2, 3]);
    assert.equal(db.version, 4);
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
    'PRAGMA user_version=5',
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
