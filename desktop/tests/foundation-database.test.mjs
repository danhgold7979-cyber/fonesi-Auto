import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  rmSync,
  existsSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { FoundationDatabase, statement } from '../src/main/foundation-database.ts';
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
  const path = mkdtempSync(join(base, 'database-'));
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
test('actual SQLite migration core uses real snapshot witnesses, WAL/FK and reopen', async () => {
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    let copies = 0;
    await db.migrate(async (version) => {
      const target = join(f.path, `snapshot-${version}.sqlite`);
      assert.equal(existsSync(target), false);
      await db.snapshot(target);
      const snap = new FoundationDatabase(target, f.id, true);
      try {
        copies++;
        return { backupId: randomUUID(), fingerprint: snap.fingerprint(), schemaVersion: version };
      } finally {
        snap.close();
      }
    }, 1000);
    assert.equal(copies, 2);
    assert.equal(db.version, 2);
    const fingerprint = db.fingerprint();
    assert.throws(
      () =>
        statement(db.connection, 'INSERT INTO backup_validation VALUES(?,?,?,?)', (s) =>
          s.run(randomUUID(), 1000, 'a'.repeat(64), 1),
        ),
      (e) => e instanceof Error && e.code === 'ERR_SQLITE_ERROR' && e.errcode === 787,
    );
    assert.throws(
      () => db.connection.enableLoadExtension(true),
      (e) => e instanceof Error && e.code === 'ERR_INVALID_STATE',
    );
    db.close();
    db = new FoundationDatabase(f.file, f.id);
    assert.equal(db.fingerprint(), fingerprint);
    let called = false;
    await db.migrate(async () => {
      called = true;
      throw new Error('UNEXPECTED');
    }, 2000);
    assert.equal(called, false);
  } finally {
    db?.close();
    f.cleanup();
  }
});
test('failed encrypted-backup provider blocks migration without creating tables', async () => {
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    const before = db.fingerprint();
    await assert.rejects(
      db.migrate(async () => {
        throw new Error('BACKUP_FAILED');
      }, 1000),
      /BACKUP_FAILED/,
    );
    assert.equal(db.version, 0);
    assert.equal(db.fingerprint(), before);
  } finally {
    db?.close();
    f.cleanup();
  }
});
test('independent intervening DML invalidates prerequisite before next DDL transaction', async () => {
  const f = fixture();
  let db, other;
  try {
    db = new FoundationDatabase(f.file, f.id);
    await assert.rejects(
      db.migrate(async (version) => {
        const fingerprint = db.fingerprint();
        if (version === 1) {
          other = new DatabaseSync(f.file);
          try {
            statement(other, 'UPDATE foundation_store SET created_utc=?', (s) => s.run(2000));
          } finally {
            other.close();
            other = undefined;
          }
        }
        return { backupId: randomUUID(), fingerprint, schemaVersion: version };
      }, 1000),
      /BACKUP_WITNESS_CHANGED/,
    );
    assert.equal(db.version, 1);
    assert.equal(
      statement(db.connection, 'SELECT created_utc FROM foundation_store', (s) => s.get())
        .created_utc,
      2000,
    );
  } finally {
    other?.close();
    db?.close();
    f.cleanup();
  }
});

test('unknown sqliteX-prefixed objects cannot hide behind reserved-prefix filtering', () => {
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    db.connection.exec('CREATE TABLE sqliteXhidden(value TEXT)');
    assert.throws(() => db.validate(), /DATABASE_SCHEMA_MISMATCH/);
  } finally {
    db?.close();
    f.cleanup();
  }
});
test('dangling link is not treated as an absent database or snapshot destination', async () => {
  const f = fixture();
  let db;
  try {
    const link = join(f.path, 'link.sqlite'),
      target = join(f.path, 'absent-target');
    symlinkSync(target, link, 'junction');
    assert.throws(() => new FoundationDatabase(link, f.id), /DATABASE_FILE_REJECTED/);
    db = new FoundationDatabase(f.file, f.id);
    await assert.rejects(db.snapshot(link), /SNAPSHOT_DESTINATION_REJECTED/);
    assert.equal(existsSync(target), false);
  } finally {
    db?.close();
    f.cleanup();
  }
});

test('newer schema and corrupt bytes fail without resetting database content', () => {
  const f = fixture();
  let db;
  try {
    db = new FoundationDatabase(f.file, f.id);
    db.connection.exec('PRAGMA user_version=3');
    db.close();
    db = undefined;
    const before = readFileSync(f.file);
    assert.throws(() => new FoundationDatabase(f.file, f.id), /DATABASE_INVALID/);
    assert.deepEqual(readFileSync(f.file), before);
    const corrupt = join(f.path, 'corrupt.sqlite');
    writeFileSync(corrupt, 'NOT_SQLITE');
    assert.throws(() => new FoundationDatabase(corrupt, f.id));
    assert.equal(readFileSync(corrupt, 'utf8'), 'NOT_SQLITE');
  } finally {
    db?.close();
    f.cleanup();
  }
});
test('real second-connection write lock blocks migration with typed SQLITE_BUSY', async () => {
  const f = fixture();
  let db, other;
  try {
    db = new FoundationDatabase(f.file, f.id);
    other = new DatabaseSync(f.file, { timeout: 1000 });
    await assert.rejects(
      db.migrate(async (version) => {
        const fingerprint = db.fingerprint();
        other.exec('BEGIN IMMEDIATE');
        return { backupId: randomUUID(), fingerprint, schemaVersion: version };
      }, 1000),
      (e) => e instanceof Error && e.code === 'ERR_SQLITE_ERROR' && e.errcode === 5,
    );
    other.exec('ROLLBACK');
    assert.equal(db.version, 0);
  } finally {
    other?.close();
    db?.close();
    f.cleanup();
  }
});

test('online snapshot remains coherent while a real second connection commits', async () => {
  const f = fixture();
  let db, writer, snapshot, pending;
  try {
    db = new FoundationDatabase(f.file, f.id);
    await db.migrate(
      async (version) => ({
        backupId: randomUUID(),
        fingerprint: db.fingerprint(),
        schemaVersion: version,
      }),
      1000,
    );
    writer = new DatabaseSync(f.file);
    const target = join(f.path, 'online.sqlite');
    let settled = false;
    pending = db.snapshot(target).finally(() => {
      settled = true;
    });
    // Real WAL connection commit while the production async snapshot is pending.
    // This is not a promise that the native copy has already reached a given page.
    assert.equal(settled, false);
    writer.exec('BEGIN IMMEDIATE');
    try {
      writer.exec('UPDATE foundation_store SET created_utc=2000,last_auto_admitted_utc=2000');
      writer.exec('COMMIT');
    } catch (error) {
      writer.exec('ROLLBACK');
      throw error;
    }
    assert.equal(settled, false);
    await pending;
    snapshot = new FoundationDatabase(target, f.id, true);
    snapshot.validate();
    assert.equal(snapshot.version, 2);
    const row = statement(
      snapshot.connection,
      'SELECT created_utc,last_auto_admitted_utc FROM foundation_store',
      (s) => s.get(),
    );
    assert.ok(
      (row.created_utc === 1000 && row.last_auto_admitted_utc === null) ||
        (row.created_utc === 2000 && row.last_auto_admitted_utc === 2000),
    );
    assert.equal(
      statement(db.connection, 'SELECT created_utc FROM foundation_store', (s) => s.get())
        .created_utc,
      2000,
    );
  } finally {
    // Retire the owned asynchronous copy even if a prior assertion/write fails.
    await pending?.catch(() => {});
    snapshot?.close();
    writer?.close();
    db?.close();
    f.cleanup();
  }
});
