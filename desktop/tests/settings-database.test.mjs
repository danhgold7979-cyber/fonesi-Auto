import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  FoundationDatabase,
  statement,
  MIGRATION_HASHES,
} from '../src/main/foundation-database.ts';
import { DEFAULT_PREFERENCES, DEFAULT_NATIVE_WINDOW } from '../src/settings-contract.ts';
const root = fileURLToPath(new URL('..', import.meta.url));
function fixture() {
  const base = join(root, '.test-output');
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const path = mkdtempSync(join(base, 'settings-db-'));
  return {
    path,
    file: join(path, 'foundation.sqlite'),
    id: randomUUID(),
    cleanup() {
      assert.equal(realpathSync(path), resolve(path));
      assert.equal(lstatSync(path).isSymbolicLink(), false);
      rmSync(path, { recursive: true, force: false });
    },
  };
}
// Synthetic provider authority ONLY: actual SQLite snapshots/witnesses, not native encryption proof.
function provider(db, f, seen = [], stop = -1) {
  return async (version) => {
    if (version === stop) throw Error('STOP_VERSION');
    const file = join(f.path, `backup-${version}-${randomUUID()}.sqlite`);
    await db.snapshot(file);
    const snap = new FoundationDatabase(file, f.id, true);
    try {
      assert.equal(snap.version, version);
      seen.push(version);
      return { backupId: randomUUID(), fingerprint: snap.fingerprint(), schemaVersion: version };
    } finally {
      snap.close();
    }
  };
}
const next = (db, patch = {}) => ({
  ...db.readSettings(),
  revision: db.readSettings().revision + 1,
  ...patch,
});
test('fresh schema3 exact defaults and unchanged first two historical migration hashes', async () => {
  assert.deepEqual(MIGRATION_HASHES.slice(0, 2), [
    'a7dcc15acf94d6f8617716d4b096d1aa080fe59ecbf0b306688c4c81f2d14d73',
    '5f9d4df89fbf0ee078120acd0810c8b1e0367bbee6cb60f9be64f35814cd44b3',
  ]);
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    const seen = [];
    await db.migrate(provider(db, f, seen), 1000);
    assert.deepEqual(seen, [0, 1, 2]);
    assert.equal(db.version, 3);
    assert.deepEqual(db.readSettings(), {
      revision: 0,
      ...DEFAULT_PREFERENCES,
      ...DEFAULT_NATIVE_WINDOW,
    });
    assert.equal(db.readPreviousSettings(), null);
  } finally {
    db?.close();
    f.cleanup();
  }
});
test('real CAS previous and native snapshots commit atomically; stale CAS preserves fingerprint', async () => {
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    await db.migrate(provider(db, f), 1000);
    const old = db.readSettings(),
      value = next(db, {
        theme: 'DARK',
        dockWidth: 510,
        tileWidth: 151,
        normalBounds: { x: -10, y: 20, width: 800, height: 600 },
        maximized: true,
      });
    let admitted = 0;
    assert.deepEqual(
      db.commitSettings(0, value, () => {
        admitted++;
      }),
      { ok: true, value },
    );
    assert.equal(admitted, 1);
    assert.deepEqual(db.readPreviousSettings(), old);
    const before = db.fingerprint();
    assert.deepEqual(
      db.commitSettings(0, { ...value, theme: 'LIGHT' }, () => assert.fail('stale admission')),
      { ok: false, code: 'CONFLICT' },
    );
    assert.equal(db.fingerprint(), before);
    db.close();
    db = new FoundationDatabase(f.file, f.id);
    assert.deepEqual(db.readSettings(), value);
    assert.deepEqual(db.readPreviousSettings(), old);
  } finally {
    db?.close();
    f.cleanup();
  }
});
test('final admission throw rolls back exactly and preserves original error identity', async () => {
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    await db.migrate(provider(db, f), 1000);
    const before = db.fingerprint(),
      failure = Object.freeze({ fixed: 'REVOKED' });
    assert.throws(
      () =>
        db.commitSettings(0, next(db, { theme: 'DARK' }), () => {
          throw failure;
        }),
      (e) => e === failure,
    );
    assert.equal(db.fingerprint(), before);
    assert.equal(db.readPreviousSettings(), null);
  } finally {
    db?.close();
    f.cleanup();
  }
});
test('before and after actual COMMIT exceptions latch uncertainty; reopen proves whole old or new', async () => {
  for (const boundary of ['BEFORE', 'AFTER']) {
    const f = fixture();
    let db;
    try {
      db = new FoundationDatabase(f.file, f.id);
      await db.migrate(provider(db, f), 1000);
      const old = db.readSettings(),
        value = next(db, { theme: 'DARK', tileWidth: 151 });
      const exec = db.connection.exec.bind(db.connection);
      db.connection.exec = (sql) => {
        if (sql === 'COMMIT') {
          if (boundary === 'AFTER') exec(sql);
          throw Error('INJECTED_SETTLED_COMMIT');
        }
        return exec(sql);
      };
      assert.deepEqual(
        db.commitSettings(0, value, () => {}),
        { ok: false, code: 'OUTCOME_UNKNOWN' },
      );
      assert.throws(() => db.readSettings());
      assert.deepEqual(
        db.commitSettings(0, value, () => {}),
        { ok: false, code: 'RECOVERY_REQUIRED' },
      );
      db.connection.exec = exec;
      db.close();
      db = new FoundationDatabase(f.file, f.id);
      assert.deepEqual(db.readSettings(), boundary === 'BEFORE' ? old : value);
      assert.deepEqual(db.readPreviousSettings(), boundary === 'BEFORE' ? null : old);
    } finally {
      db?.close();
      f.cleanup();
    }
  }
});
test('actual competing SQLite writer denies mutation without changing committed state', async () => {
  const f = fixture();
  let db, other;
  try {
    db = new FoundationDatabase(f.file, f.id);
    await db.migrate(provider(db, f), 1000);
    const value = next(db, { theme: 'DARK' }),
      before = db.fingerprint();
    other = new DatabaseSync(f.file);
    other.exec('BEGIN IMMEDIATE');
    assert.deepEqual(
      db.commitSettings(0, value, () => assert.fail('busy admission')),
      { ok: false, code: 'WRITE_FAILED' },
    );
    other.exec('ROLLBACK');
    assert.equal(db.fingerprint(), before);
  } finally {
    other?.close();
    db?.close();
    f.cleanup();
  }
});
test('malformed current or previous state rejects rather than silently resets', async () => {
  for (const sql of [
    "UPDATE app_settings_revision SET tile_width=1 WHERE slot='CURRENT'",
    "UPDATE app_settings_revision SET revision=99 WHERE slot='PREVIOUS'",
    "DELETE FROM app_settings_revision WHERE slot='CURRENT'",
    "DELETE FROM app_settings_revision WHERE slot='PREVIOUS'",
    "DELETE FROM app_settings_revision WHERE slot='PREVIOUS'",
  ]) {
    const f = fixture();
    let db;
    try {
      db = new FoundationDatabase(f.file, f.id);
      await db.migrate(provider(db, f), 1000);
      assert.equal(db.commitSettings(0, next(db, { theme: 'DARK' }), () => {}).ok, true);
      db.connection.exec('PRAGMA ignore_check_constraints=ON');
      db.connection.exec(sql);
      assert.throws(() => db.readSettings());
      assert.throws(() => db.readPreviousSettings());
    } finally {
      db?.close();
      f.cleanup();
    }
  }
});
test('existing schema2 requires version2 prerequisite and preserves foundation rows', async () => {
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    await assert.rejects(db.migrate(provider(db, f, [], 2), 1000), /STOP_VERSION/);
    assert.equal(db.version, 2);
    const before = statement(db.connection, 'SELECT * FROM foundation_store', (s) => s.all());
    const fingerprint = db.fingerprint();
    await assert.rejects(
      db.migrate(async () => {
        throw Error('NO_BACKUP');
      }, 2000),
      /NO_BACKUP/,
    );
    assert.equal(db.fingerprint(), fingerprint);
    const seen = [];
    await db.migrate(provider(db, f, seen), 2000);
    assert.deepEqual(seen, [2]);
    assert.equal(db.version, 3);
    assert.deepEqual(
      statement(db.connection, 'SELECT * FROM foundation_store', (s) => s.all()),
      before,
    );
    assert.equal(db.readSettings().revision, 0);
  } finally {
    db?.close();
    f.cleanup();
  }
});
