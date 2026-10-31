import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  lstatSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import filePromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { BackupService, parseBackupReceipt } from '../src/main/backup-service.ts';
import { FoundationDatabase } from '../src/main/foundation-database.ts';
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
  assert.equal(realpathSync(parent), resolve(parent));
  assert.equal(lstatSync(parent).isSymbolicLink(), false);
  const root = mkdtempSync(join(parent, 'backup-service-'));
  const storeId = randomUUID(),
    location = { locationId: randomUUID(), directory: join(root, 'backups') };
  mkdirSync(location.directory);
  mkdirSync(join(root, 'staging'));
  const db = new FoundationDatabase(join(root, 'active.sqlite'), storeId);
  let checks = 0;
  const authority = {
    storeId,
    staging: join(root, 'staging'),
    assertOwned: async (value) => {
      assert.deepEqual(value, location);
      checks++;
    },
  };
  const service = new BackupService(authority, keys);
  try {
    await run({ root, db, service, location, authority, checks: () => checks });
  } finally {
    db.close();
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    assert.equal(realpathSync(root), resolve(root));
    rmSync(root, { recursive: true });
  }
}
test('encrypted SQLite prerequisites validate old bytes before each migration; fresh instance revalidates', async () =>
  fixture(async ({ db, service, location, authority, checks }) => {
    const ids = [];
    await db.migrate(async () => {
      const receipt = await service.create(db, location, 'PRE_MIGRATION', 1000);
      ids.push(receipt.header.backupId);
      return service.prerequisite(receipt);
    }, 1000);
    assert.equal(db.version, 3);
    assert.equal(ids.length, 3);
    const reopened = new BackupService(authority, keys);
    for (let i = 0; i < ids.length; i++) {
      const receipt = await reopened.validate(location, ids[i]);
      assert.equal(receipt.header.schemaVersion, i);
      assert.equal(receipt.header.reason, 'PRE_MIGRATION');
    }
    assert.ok(checks() >= 6);
    assert.equal(readdirSync(authority.staging).length, 0);
  }));
test('failed key wrapping leaves database unmigrated and no promoted backup', async () =>
  fixture(async ({ db, location, authority }) => {
    const failed = new BackupService(authority, {
      ...keys,
      wrap: async () => {
        throw new Error('private canary');
      },
    });
    await assert.rejects(
      db.migrate(
        async () => failed.prerequisite(await failed.create(db, location, 'PRE_MIGRATION', 1000)),
        1000,
      ),
    );
    assert.equal(db.version, 0);
    assert.equal(
      readdirSync(location.directory).filter((name) => name.startsWith('backup-')).length,
      0,
    );
  }));
test('tampered ciphertext or duplicate receipt cannot authorize old backup', async () =>
  fixture(async ({ db, service, location }) => {
    const receipt = await service.create(db, location, 'PRE_MIGRATION', 1000),
      id = receipt.header.backupId,
      path = join(location.directory, `backup-${id}.fonaub`);
    const bytes = readFileSync(path);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(path, bytes);
    await assert.rejects(service.validate(location, id));
    const raw = JSON.stringify(receipt);
    assert.equal(parseBackupReceipt(raw.replace('"version":1', '"version":0,"version":1')), null);
    assert.equal(
      parseBackupReceipt(
        raw.replace('"reason":"PRE_MIGRATION"', '"reason":"MANUAL","reason":"PRE_MIGRATION"'),
      ),
      null,
    );
  }));
test('one active operation and ownership failure reject before provider or snapshot', async () =>
  fixture(async ({ db, location, authority }) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let entered = false;
    const service = new BackupService(
      {
        ...authority,
        assertOwned: async () => {
          entered = true;
          await gate;
        },
      },
      keys,
    );
    const first = service.create(db, location, 'MANUAL', 1000);
    assert.equal(entered, true);
    await assert.rejects(service.create(db, location, 'MANUAL', 1000), /BACKUP_BUSY_OR_LOCATION/);
    release();
    await first;
    const denied = new BackupService(
      {
        ...authority,
        assertOwned: async () => {
          throw new Error('OWNER_REJECTED');
        },
      },
      keys,
    );
    const prior = readdirSync(authority.staging);
    await assert.rejects(denied.create(db, location, 'MANUAL', 1000), /OWNER_REJECTED/);
    assert.deepEqual(readdirSync(authority.staging), prior);
  }));
test('admitted location and authority are snapshots across asynchronous validation', async () =>
  fixture(async ({ db, location, authority, root }) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const original = { ...location };
    const validated = [];
    const input = {
      ...authority,
      assertOwned: async (checked) => {
        validated.push({ ...checked });
        await gate;
      },
    };
    const service = new BackupService(input, keys);
    const pending = service.create(db, location, 'MANUAL', 1000);
    location.directory = join(root, 'unowned');
    location.locationId = randomUUID();
    input.staging = join(root, 'unowned');
    release();
    const receipt = await pending;
    assert.equal(receipt.header.locationId, original.locationId);
    assert.deepEqual(validated, [original, original]);
    assert.equal(
      readdirSync(original.directory).filter((name) => name.startsWith('backup-')).length,
      2,
    );
  }));
test('restore targets a separate fresh database and persists quarantine without overwriting active', async () =>
  fixture(async ({ db, service, location, root }) => {
    await db.migrate(
      async () => service.prerequisite(await service.create(db, location, 'PRE_MIGRATION', 1000)),
      1000,
    );
    const receipt = await service.create(db, location, 'MANUAL', 1001),
      destination = join(root, 'restore');
    mkdirSync(destination);
    const target = {
      staging: destination,
      active: join(destination, 'active.sqlite'),
      assertOwned: async () => {},
    };
    await service.restoreToNew(location, receipt.header.backupId, target);
    const reopened = new FoundationDatabase(target.active, db.storeId, true);
    try {
      const row = reopened.connection.prepare(
        'SELECT restore_quarantine,restored_from_backup_id FROM foundation_store',
      );
      try {
        assert.deepEqual(
          { ...row.get() },
          { restore_quarantine: 1, restored_from_backup_id: receipt.header.backupId },
        );
      } finally {
        row.close();
      }
    } finally {
      reopened.close();
    }
    await assert.rejects(service.restoreToNew(location, receipt.header.backupId, target));
    assert.equal(db.version, 3);
  }));

// The test runner isolates this file in its own process. The temporary builtin
// binding affects only the exact owned pending-container path and is restored
// after the awaited service/migration operation; no production injection hook.
test('injected ENOSPC at the actual encrypted write blocks migration and preserves good backups', async () =>
  fixture(async ({ db, service, location }) => {
    const good = await service.create(db, location, 'PRE_MIGRATION', 1000);
    const retained = () =>
      Object.fromEntries(
        readdirSync(location.directory)
          .filter((name) => name.startsWith('backup-'))
          .sort()
          .map((name) => [
            name,
            createHash('sha256')
              .update(readFileSync(join(location.directory, name)))
              .digest('hex'),
          ]),
      );
    const before = retained();
    const fingerprint = db.fingerprint();
    const original = filePromises.open;
    let intercepted = 0;
    let injected = 0;
    let partialWrites = 0;
    try {
      filePromises.open = async (path, flags, mode) => {
        const handle = await original(path, flags, mode);
        if (
          typeof path === 'string' &&
          dirname(path) === location.directory &&
          /^pending-[0-9a-f-]{36}\.fonaub$/.test(basename(path)) &&
          flags === 'wx'
        ) {
          intercepted++;
          const originalWrite = handle.write.bind(handle);
          handle.write = async (...args) => {
            if (partialWrites === 0) {
              partialWrites++;
              return originalWrite(...args);
            }
            injected++;
            const error = new Error('SYNTHETIC_ENOSPC');
            error.code = 'ENOSPC';
            throw error;
          };
        }
        return handle;
      };
      syncBuiltinESMExports();
      await assert.rejects(
        db.migrate(
          async () =>
            service.prerequisite(await service.create(db, location, 'PRE_MIGRATION', 2000)),
          2000,
        ),
        (error) => error instanceof Error && error.message === 'IO_FAILED',
      );
    } finally {
      filePromises.open = original;
      syncBuiltinESMExports();
    }
    assert.equal(intercepted, 1);
    assert.equal(injected, 1);
    assert.equal(partialWrites, 1);
    const pending = readdirSync(location.directory).filter((name) => name.startsWith('pending-'));
    assert.equal(pending.length, 1);
    assert.ok(lstatSync(join(location.directory, pending[0])).size > 0);
    assert.equal(db.version, 0);
    assert.equal(db.fingerprint(), fingerprint);
    assert.deepEqual(retained(), before);
    assert.equal(
      (await service.validate(location, good.header.backupId)).encryptedSha256,
      good.encryptedSha256,
    );
    assert.deepEqual(retained(), before);
  }));
