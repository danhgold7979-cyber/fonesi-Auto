import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { FoundationDatabase } from '../src/main/foundation-database.ts';
import { FoundationPersistence } from '../src/main/foundation-persistence.ts';
import {
  createPersistenceRoot,
  acquirePersistenceLease,
  writePersistenceFile,
} from '../src/main/persistence-files.ts';
const parent = fileURLToPath(new URL('../.test-output', import.meta.url));
const keys = {
  wrap: async (value) => Buffer.from(value),
  unwrap: async (value) => ({ result: Buffer.from(value).toString(), shouldReEncrypt: false }),
};
async function fixture(run) {
  try {
    mkdirSync(parent);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  assert.equal(lstatSync(parent).isSymbolicLink(), false);
  assert.equal(realpathSync(parent), resolve(parent));
  const root = mkdtempSync(join(parent, 'persistence-')),
    parentToken = randomUUID(),
    storeId = randomUUID(),
    ownerToken = randomUUID();
  writeFileSync(join(root, '.owner'), parentToken);
  const location = { root: join(root, `data-${storeId}`), parentToken };
  await createPersistenceRoot(location, {
    version: 1,
    storeId,
    kind: 'FRESH',
    restoreReceiptId: null,
  });
  const lease = await acquirePersistenceLease(location, ownerToken);
  let app;
  try {
    app = await FoundationPersistence.open(location, ownerToken, keys, true);
    await run({ root, location, storeId, ownerToken, app });
  } finally {
    app?.close();
    await lease.release();
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    assert.equal(realpathSync(root), resolve(root));
    rmSync(root, { recursive: true });
  }
}
test('orchestrator refuses migration without separate durability evidence, then imports protected receipts and reopens', async () =>
  fixture(async ({ root, location, storeId, ownerToken, app }) => {
    const selected = join(root, 'selected');
    mkdirSync(selected);
    const receipt = await app.provision(selected, 1000);
    await assert.rejects(app.initialize(1001), /KEY_DURABILITY_UNPROVEN/);
    assert.deepEqual(await app.authenticateBootstrap(), receipt);
    // Synthetic supervisor receipt tests admission only; NOT actual native restart proof.
    await writePersistenceFile(
      join(location.root, 'key-durability-proof.json'),
      JSON.stringify({
        version: 1,
        storeId,
        backupId: receipt.header.backupId,
        locationId: receipt.header.locationId,
        encryptedSha256: receipt.encryptedSha256,
        state: 'ORDERLY_AND_ABRUPT_RECOVERED',
      }),
    );
    await app.initialize(1002);
    await assert.rejects(app.initialize(1002), /DATABASE_ALREADY_OPEN/);
    assert.equal((await app.list()).length, 2);
    assert.ok((await app.list()).every((row) => row.protected));
    const manual = await app.backup(1003);
    assert.equal(manual.header.reason, 'MANUAL');
    const daily = await app.backup(1004, true);
    assert.equal(daily.header.reason, 'DAILY');
    assert.equal(await app.backup(1005, true), null);
    app.close();
    const reopened = await FoundationPersistence.open(location, ownerToken, keys, false);
    try {
      await reopened.initialize(1006);
      assert.equal(await reopened.backup(1007, true), null);
      assert.equal((await reopened.list()).length, 4);
    } finally {
      reopened.close();
    }
  }));
test('failed provider after existing backup does not substitute a newly created key', async () =>
  fixture(async ({ root, location, ownerToken, app }) => {
    const selected = join(root, 'selected');
    mkdirSync(selected);
    await app.provision(selected, 1000);
    app.close();
    const wrong = await FoundationPersistence.open(
      location,
      ownerToken,
      {
        ...keys,
        unwrap: async () => {
          throw new Error('unavailable');
        },
      },
      false,
    );
    try {
      await assert.rejects(wrong.authenticateBootstrap());
      await assert.rejects(wrong.initialize(1001));
    } finally {
      wrong.close();
    }
  }));

test('existing version1 active database migrates behind authenticated content witness without reset', async () =>
  fixture(async ({ root, location, storeId, app }) => {
    const selected = join(root, 'selected');
    mkdirSync(selected);
    const receipt = await app.provision(selected, 1000);
    await writePersistenceFile(
      join(location.root, 'key-durability-proof.json'),
      JSON.stringify({
        version: 1,
        storeId,
        backupId: receipt.header.backupId,
        locationId: receipt.header.locationId,
        encryptedSha256: receipt.encryptedSha256,
        state: 'ORDERLY_AND_ABRUPT_RECOVERED',
      }),
    );
    const previous = new FoundationDatabase(
      join(location.root, 'staging', 'install.sqlite'),
      storeId,
    );
    try {
      await assert.rejects(
        previous.migrate(async (version) => {
          if (version === 1) throw new Error('STOP_AFTER_FIRST_COMMIT');
          return app.backups.prerequisite(receipt);
        }, 1001),
        /STOP_AFTER_FIRST_COMMIT/,
      );
      assert.equal(previous.version, 1);
      await previous.snapshot(join(location.root, 'active.sqlite'));
    } finally {
      previous.close();
    }
    await app.initialize(1002);
    assert.equal((await app.list()).length, 2);
    assert.ok((await app.list()).every((row) => row.protected));
  }));

test('corrupted final activation copy is never promoted', async () =>
  fixture(async ({ root, location, storeId, app }) => {
    const selected = join(root, 'selected');
    mkdirSync(selected);
    const receipt = await app.provision(selected, 1000);
    await writePersistenceFile(
      join(location.root, 'key-durability-proof.json'),
      JSON.stringify({
        version: 1,
        storeId,
        backupId: receipt.header.backupId,
        locationId: receipt.header.locationId,
        encryptedSha256: receipt.encryptedSha256,
        state: 'ORDERLY_AND_ABRUPT_RECOVERED',
      }),
    );
    const original = FoundationDatabase.prototype.snapshot;
    FoundationDatabase.prototype.snapshot = async function (path) {
      const result = await original.call(this, path);
      if (path.includes('activation-')) writeFileSync(path, 'corrupt synthetic activation');
      return result;
    };
    try {
      await assert.rejects(app.initialize(1001));
      assert.equal(existsSync(join(location.root, 'active.sqlite')), false);
      assert.equal((await app.authenticateBootstrap()).header.backupId, receipt.header.backupId);
    } finally {
      FoundationDatabase.prototype.snapshot = original;
    }
  }));

for (const snapshotVersion of [0, 2])
  test(`restored schema${snapshotVersion} root stays quarantined after reopen/migration and automatic admission stays off`, async () =>
    fixture(async ({ root, location, storeId, app }) => {
      const selected = join(root, 'selected');
      mkdirSync(selected);
      const bootstrap = await app.provision(selected, 1000);
      await writePersistenceFile(
        join(location.root, 'key-durability-proof.json'),
        JSON.stringify({
          version: 1,
          storeId,
          backupId: bootstrap.header.backupId,
          locationId: bootstrap.header.locationId,
          encryptedSha256: bootstrap.encryptedSha256,
          state: 'ORDERLY_AND_ABRUPT_RECOVERED',
        }),
      );
      await app.initialize(1001);
      const backup = snapshotVersion === 0 ? bootstrap : await app.backup(1002);
      const checkpoint = join(location.root, `key-checkpoint-${randomUUID()}.json`);
      await writePersistenceFile(
        checkpoint,
        JSON.stringify({
          os_crypt: {
            encrypted_key: Buffer.from('DPAPIsynthetic-retained-key').toString('base64'),
          },
        }),
      );
      const restoreParent = join(root, 'restore-parent');
      mkdirSync(restoreParent);
      const restoredRoot = await app.restore(backup.header.backupId, restoreParent, checkpoint);
      const restoredLocation = {
          root: restoredRoot,
          parentToken: readFileSync(join(dirname(restoredRoot), '.owner'), 'utf8'),
        },
        token = randomUUID(),
        lease = await acquirePersistenceLease(restoredLocation, token);
      let reopened;
      try {
        reopened = await FoundationPersistence.open(restoredLocation, token, keys, false);
        await reopened.initialize(1003);
        assert.equal(reopened.restored, true);
        assert.equal(await reopened.backup(1004, true), null);
        reopened.close();
        const database = new FoundationDatabase(join(restoredRoot, 'active.sqlite'), storeId, true);
        try {
          const q = database.connection.prepare('SELECT restore_quarantine FROM foundation_store');
          try {
            assert.equal(q.get().restore_quarantine, 1);
          } finally {
            q.close();
          }
        } finally {
          database.close();
        }
      } finally {
        reopened?.close();
        await lease.release();
      }
    }));
