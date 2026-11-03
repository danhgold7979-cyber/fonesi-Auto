import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { BackupCatalog, parseLocationConfig } from '../src/main/backup-catalog.ts';
import {
  createPersistenceRoot,
  acquirePersistenceLease,
  verifyBackupLocation,
} from '../src/main/persistence-files.ts';
import { FoundationDatabase, statement } from '../src/main/foundation-database.ts';
import { BackupService } from '../src/main/backup-service.ts';
async function fixture() {
  const base = fileURLToPath(new URL('../.test-output/', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const dir = mkdtempSync(join(base, 'backup-catalog-'));
  const token = randomUUID(),
    storeId = randomUUID();
  writeFileSync(join(dir, '.owner'), token);
  const location = { root: join(dir, 'data-test'), parentToken: token };
  await createPersistenceRoot(location, {
    version: 1,
    storeId,
    kind: 'FRESH',
    restoreReceiptId: null,
  });
  const lease = await acquirePersistenceLease(location, randomUUID());
  const catalog = await BackupCatalog.initialize(location.root, storeId, lease.assertOwned, false);
  const stage = join(location.root, 'stage');
  mkdirSync(stage);
  const keys = new Map();
  const service = new BackupService(
    {
      storeId,
      staging: stage,
      assertOwned: async (loc) => {
        await lease.assertOwned();
        const expected = await catalog.location(loc.locationId);
        assert.equal(expected.directory, loc.directory);
      },
    },
    {
      wrap: async (key) => {
        const token = randomBytes(48);
        keys.set(token.toString('base64'), key);
        return token;
      },
      unwrap: async (token) => ({
        result: keys.get(Buffer.from(token).toString('base64')),
        shouldReEncrypt: false,
      }),
    },
  );
  const db = new FoundationDatabase(join(location.root, 'foundation.sqlite'), storeId);
  return {
    dir,
    location,
    storeId,
    catalog,
    lease,
    service,
    db,
    async ready() {
      await catalog.selectLocation(dir, true, 1000);
      const loc = await catalog.activeLocation();
      const receipts = [];
      await db.migrate(async () => {
        const r = await service.create(db, loc, 'PRE_MIGRATION', 1000);
        receipts.push(r);
        return service.prerequisite(r);
      }, 1000);
      await catalog.mirrorLocations(db);
      for (const receipt of receipts) await catalog.importReceipt(db, service, receipt);
      return loc;
    },
    async cleanup() {
      db.close();
      await lease.release();
      assert.equal(realpathSync(dir), resolve(dir));
      rmSync(dir, { recursive: true });
    },
  };
}
test('canonical persisted config rejects duplicates, unknown fields, malformed references and path aliases', () => {
  const c = { version: 1, storeId: randomUUID(), activeLocationId: null, locations: [] };
  const raw = JSON.stringify(c);
  assert.deepEqual(parseLocationConfig(raw), c);
  for (const text of [
    raw.replace('"version":1', '"version":1,"version":1'),
    JSON.stringify({ ...c, extra: true }),
    JSON.stringify({ ...c, activeLocationId: randomUUID() }),
    ` ${raw}`,
  ])
    assert.equal(parseLocationConfig(text), null);
});
test('selection cancellation preserves bytes; replacement keeps retired mappings; missing config never resets', async () => {
  const f = await fixture();
  try {
    const path = join(f.location.root, 'backup-locations.json');
    const before = readFileSync(path);
    assert.equal(await f.catalog.selectLocation(f.dir, false, 1000), null);
    assert.equal(await f.catalog.selectLocation(null, true, 1000), null);
    assert.deepEqual(readFileSync(path), before);
    const first = await f.catalog.selectLocation(f.dir, true, 1000);
    const second = await f.catalog.selectLocation(f.dir, true, 2000);
    const rows = await f.catalog.knownLocations();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].state, 'RETIRED');
    assert.equal(rows[1].state, 'ACTIVE');
    assert.equal((await f.catalog.activeLocation()).locationId, second);
    await f.catalog.location(first);
    writeFileSync(path, '{}');
    await assert.rejects(
      BackupCatalog.open(f.location.root, f.storeId, f.lease.assertOwned, false),
    );
    assert.equal(readFileSync(path, 'utf8'), '{}');
  } finally {
    await f.cleanup();
  }
});
test('SQL reconciliation rejects unknown mappings; auto admissions persist before work and survive reopen', async () => {
  const f = await fixture();
  try {
    await f.ready();
    assert.equal(await f.catalog.admitDaily(f.db, 2000), true);
    assert.equal(await f.catalog.admitDaily(f.db, 2001), false);
    const reopened = await BackupCatalog.open(
      f.location.root,
      f.storeId,
      f.lease.assertOwned,
      false,
    );
    assert.equal(await reopened.admitDaily(f.db, 1999), false);
    assert.equal(await reopened.admitDaily(f.db, 86402000), true);
    const restored = await BackupCatalog.open(
      f.location.root,
      f.storeId,
      f.lease.assertOwned,
      true,
    );
    assert.equal(await restored.admitDaily(f.db, 172802000), false);
    statement(f.db.connection, "UPDATE backup_location SET state='RETIRED'", (s) => s.run());
    await assert.rejects(f.catalog.reconcile(f.db));
  } finally {
    await f.cleanup();
  }
});
test('actual encrypted copies validate before import and rotation retains seven ordinary plus protected PRE', async () => {
  const f = await fixture();
  try {
    const loc = await f.ready();
    const safety = await f.service.create(f.db, loc, 'PRE_MIGRATION', 2000);
    await f.catalog.importReceipt(f.db, f.service, safety);
    for (let i = 0; i < 8; i++) {
      const r = await f.service.create(f.db, loc, 'MANUAL', 3000 + i);
      await f.catalog.importReceipt(f.db, f.service, r);
    }
    assert.equal(await f.catalog.prune(f.db, f.service), 1);
    const rows = statement(
      f.db.connection,
      'SELECT reason,state,protected FROM backup_record',
      (s) => s.all(),
    );
    assert.equal(rows.filter((r) => r.reason === 'MANUAL' && r.state === 'VALIDATED').length, 7);
    assert.equal(rows.find((r) => r.reason === 'PRE_MIGRATION').protected, 1);
    assert.equal(rows.find((r) => r.reason === 'PRE_MIGRATION').state, 'VALIDATED');
  } finally {
    await f.cleanup();
  }
});
test('uncertain current copy blocks every prune without deleting a newer good copy', async () => {
  const f = await fixture();
  try {
    const loc = await f.ready();
    let corrupt;
    for (let i = 0; i < 8; i++) {
      const r = await f.service.create(f.db, loc, 'MANUAL', 3000 + i);
      await f.catalog.importReceipt(f.db, f.service, r);
      corrupt = r;
    }
    writeFileSync(join(loc.directory, `backup-${corrupt.header.backupId}.fonaub`), 'CORRUPT');
    const before = readdirSync(loc.directory).sort();
    await assert.rejects(f.catalog.prune(f.db, f.service));
    assert.deepEqual(readdirSync(loc.directory).sort(), before);
    assert.equal(
      statement(
        f.db.connection,
        "SELECT count(*) AS n FROM backup_record WHERE state='RETIRED'",
        (s) => s.get(),
      ).n,
      0,
    );
  } finally {
    await f.cleanup();
  }
});
test('location marker mismatch blocks use and never searches elsewhere', async () => {
  const f = await fixture();
  try {
    await f.catalog.selectLocation(f.dir, true, 1000);
    const r = (await f.catalog.knownLocations())[0];
    await verifyBackupLocation(r.absolutePath, {
      version: 1,
      storeId: f.storeId,
      locationId: r.locationId,
      folderMarkerId: r.folderMarkerId,
    });
    writeFileSync(join(r.absolutePath, '.backup-owner.json'), '{}');
    await assert.rejects(f.catalog.activeLocation());
  } finally {
    await f.cleanup();
  }
});
test('explicit upgrade acceptance records receipt without turning safety copies into ordinary slots', async () => {
  const f = await fixture();
  try {
    const loc = await f.ready();
    const r = await f.service.create(f.db, loc, 'PRE_MIGRATION', 2000);
    await f.catalog.importReceipt(f.db, f.service, r);
    await f.catalog.acceptUpgrade(f.db, f.service, r.header.backupId, 3000);
    const row = statement(
      f.db.connection,
      'SELECT reason,protected FROM backup_record WHERE backup_id=?',
      (s) => s.get(r.header.backupId),
    );
    assert.deepEqual({ ...row }, { reason: 'PRE_MIGRATION', protected: 0 });
    assert.equal(await f.catalog.prune(f.db, f.service), 0);
    writeFileSync(join(f.location.root, `upgrade-acceptance-${r.header.backupId}.json`), '{}');
    await assert.rejects(f.catalog.prune(f.db, f.service));
  } finally {
    await f.cleanup();
  }
});

test('orphan, pending and unknown location entries block pruning without deleting known copies', async () => {
  const f = await fixture();
  try {
    const loc = await f.ready();
    for (let i = 0; i < 8; i++) {
      const r = await f.service.create(f.db, loc, 'MANUAL', 4000 + i);
      await f.catalog.importReceipt(f.db, f.service, r);
    }
    for (const name of [
      `pending-${randomUUID()}.fonaub`,
      `backup-${randomUUID()}.fonaub`,
      'unknown.json',
    ]) {
      const path = join(loc.directory, name);
      writeFileSync(path, 'UNKNOWN', { flag: 'wx' });
      const before = readdirSync(loc.directory).sort();
      await assert.rejects(f.catalog.prune(f.db, f.service));
      assert.deepEqual(readdirSync(loc.directory).sort(), before);
      rmSync(path);
    }
    assert.equal(await f.catalog.prune(f.db, f.service), 1);
  } finally {
    await f.cleanup();
  }
});

test('exact repeated receipt import reauthenticates and is idempotent; altered catalog rows reject', async () => {
  const f = await fixture();
  try {
    const loc = await f.ready();
    const receipt = await f.service.create(f.db, loc, 'MANUAL', 6000);
    await f.catalog.importReceipt(f.db, f.service, receipt);
    const before = f.db.fingerprint();
    await f.catalog.importReceipt(f.db, f.service, receipt);
    assert.equal(f.db.fingerprint(), before);
    statement(
      f.db.connection,
      'UPDATE backup_validation SET validated_utc=? WHERE backup_id=?',
      (s) => s.run(6001, receipt.header.backupId),
    );
    const altered = f.db.fingerprint();
    await assert.rejects(f.catalog.importReceipt(f.db, f.service, receipt), {
      message: 'BACKUP_IMPORT_DISAGREEMENT',
    });
    assert.equal(f.db.fingerprint(), altered);
    writeFileSync(join(loc.directory, `backup-${receipt.header.backupId}.fonaub`), 'CORRUPT');
    await assert.rejects(f.catalog.importReceipt(f.db, f.service, receipt));
    assert.equal(f.db.fingerprint(), altered);
  } finally {
    await f.cleanup();
  }
});
