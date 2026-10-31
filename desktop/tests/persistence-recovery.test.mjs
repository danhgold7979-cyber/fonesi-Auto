import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { FoundationPersistence } from '../src/main/foundation-persistence.ts';
import { FoundationDatabase } from '../src/main/foundation-database.ts';
import {
  createPersistenceRoot,
  acquirePersistenceLease,
  writePersistenceFile,
} from '../src/main/persistence-files.ts';
const base = fileURLToPath(new URL('../.test-output', import.meta.url));
// This adapter tests actual authenticated container/SQLite behavior, NOT native DPAPI custody.
const keys = {
  wrap: async (value) => Buffer.from(value),
  unwrap: async (value) => ({ result: Buffer.from(value).toString(), shouldReEncrypt: false }),
};
function inventory(root) {
  const out = Object.create(null);
  function walk(path, prefix = '') {
    for (const name of readdirSync(path).sort()) {
      const file = join(path, name),
        relative = prefix + name,
        stat = lstatSync(file);
      assert.equal(stat.isSymbolicLink(), false);
      if (stat.isDirectory()) walk(file, relative + '/');
      else {
        assert.equal(stat.isFile(), true);
        out[relative] = createHash('sha256').update(readFileSync(file)).digest('hex');
      }
    }
  }
  walk(root);
  return out;
}
async function fixture(corruption, run) {
  try {
    mkdirSync(base);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  assert.equal(realpathSync(base), resolve(base));
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  const root = mkdtempSync(join(base, 'recovery-')),
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
  let service;
  try {
    service = await FoundationPersistence.open(location, ownerToken, keys, true);
    const selected = join(root, 'selected');
    mkdirSync(selected);
    const bootstrap = await service.provision(selected, 1000);
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
    await service.initialize(1001);
    service.close();
    const db = new FoundationDatabase(join(location.root, 'active.sqlite'), storeId);
    try {
      assert.equal(
        db.commitSettings(0, { ...db.readSettings(), revision: 1, theme: 'DARK' }, () => {}).ok,
        true,
      );
    } finally {
      db.close();
    }
    await service.initialize(1002);
    const receipt = await service.backup(1003);
    service.close();
    const config = JSON.parse(readFileSync(join(location.root, 'backup-locations.json'), 'utf8'));
    const directory = config.locations.find(
      (row) => row.locationId === receipt.header.locationId,
    ).absolutePath;
    const candidate = join(directory, `backup-${receipt.header.backupId}.fonaub`);
    const raw = new DatabaseSync(join(location.root, 'active.sqlite'));
    try {
      raw.exec('PRAGMA ignore_check_constraints=ON');
      raw.exec(corruption);
    } finally {
      raw.close();
    }
    // These closed-owner synthetic sidecars witness that recovery never opens/touches the old DB.
    writeFileSync(join(location.root, 'active.sqlite-wal'), 'synthetic retained WAL witness');
    writeFileSync(join(location.root, 'active.sqlite-shm'), 'synthetic retained SHM witness');
    mkdirSync(join(location.root, 'vault'));
    writeFileSync(join(location.root, 'vault', 'cipher.bin'), 'synthetic vault witness');
    const checkpoint = join(location.root, `key-checkpoint-${randomUUID()}.json`);
    await writePersistenceFile(
      checkpoint,
      JSON.stringify({
        os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic-retained-key').toString('base64') },
      }),
    );
    const restoreParent = join(root, 'restore-parent');
    mkdirSync(restoreParent);
    await run({
      root,
      location,
      storeId,
      ownerToken,
      service,
      receipt,
      candidate,
      checkpoint,
      restoreParent,
    });
  } finally {
    service?.close();
    await lease.release();
    assert.equal(readFileSync(join(root, '.owner'), 'utf8'), parentToken);
    assert.equal(realpathSync(root), resolve(root));
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    rmSync(root, { recursive: true, force: false });
  }
}
for (const [name, sql] of [
  ['CURRENT', "UPDATE app_settings_revision SET tile_width=1 WHERE slot='CURRENT'"],
  ['PREVIOUS', "DELETE FROM app_settings_revision WHERE slot='PREVIOUS'"],
]) {
  test(`recovery from corrupt ${name} authenticates selected backup without touching old DB/sidecars/vault`, async () =>
    fixture(
      sql,
      async ({
        location,
        storeId,
        ownerToken,
        service,
        receipt,
        candidate,
        checkpoint,
        restoreParent,
      }) => {
        const before = inventory(location.root);
        await service.initializeRecovery();
        assert.deepEqual(inventory(location.root), before);
        const selected = await service.recoverySelection(candidate);
        assert.deepEqual(selected, receipt);
        const restored = await service.restoreRecovery(selected, restoreParent, checkpoint);
        assert.notEqual(restored, location.root);
        assert.deepEqual(inventory(location.root), before);
        const database = new FoundationDatabase(join(restored, 'active.sqlite'), storeId, true);
        try {
          assert.equal(database.readSettings().theme, 'DARK');
          const q = database.connection.prepare('SELECT restore_quarantine FROM foundation_store');
          try {
            assert.equal(q.get().restore_quarantine, 1);
          } finally {
            q.close();
          }
        } finally {
          database.close();
        }
        await assert.rejects(service.provision(restoreParent, 1004));
        await assert.rejects(service.initialize(1004));
        await assert.rejects(service.backup(1004));
        await assert.rejects(service.list());
        await assert.rejects(service.selectLocation(restoreParent, 1005));
        const normal = await FoundationPersistence.open(location, ownerToken, keys, false);
        try {
          await assert.rejects(normal.initialize(1006));
        } finally {
          normal.close();
        }
      },
    ));
}
test('recovery rejects wrong path, changed ciphertext and changed confirmation receipt without mutation', async () =>
  fixture(
    "DELETE FROM app_settings_revision WHERE slot='PREVIOUS'",
    async ({ location, service, receipt, candidate, checkpoint, restoreParent, root }) => {
      await service.initializeRecovery();
      const before = inventory(location.root),
        destBefore = inventory(restoreParent);
      await assert.rejects(
        service.recoverySelection(join(root, `backup-${receipt.header.backupId}.fonaub`)),
      );
      const original = readFileSync(candidate),
        changed = Buffer.from(original);
      changed[changed.length - 1] ^= 1;
      const selected = await service.recoverySelection(candidate);
      writeFileSync(candidate, changed);
      try {
        await assert.rejects(service.recoverySelection(candidate));
        await assert.rejects(service.restoreRecovery(selected, restoreParent, checkpoint));
      } finally {
        writeFileSync(candidate, original);
      }
      await assert.rejects(
        service.restoreRecovery(
          { ...selected, encryptedSha256: '0'.repeat(64) },
          restoreParent,
          checkpoint,
        ),
      );
      const after = inventory(location.root);
      for (const [name, hash] of Object.entries(before)) assert.equal(after[name], hash);
      // Failed authenticated decrypt retains only owned validation evidence, not active state changes.
      for (const name of Object.keys(after).filter((name) => !Object.hasOwn(before, name)))
        assert.match(name, /^staging\/validation-[0-9a-f-]{36}\.sqlite$/);
      assert.deepEqual(inventory(restoreParent), destBefore);
    },
  ));

test('native recovery cancels at every dialog and confirms only the selected receipt and destination', async () => {
  const { runNativePersistenceRecovery } = await import('../src/main/persistence-native.ts');
  for (const cancelAt of [0, 1, 2, 3]) {
    const receipt = Object.freeze({ header: Object.freeze({ backupId: randomUUID() }) }),
      calls = [];
    let dialogIndex = 0;
    const service = {
      recoverySelection: async (path) => {
        assert.equal(path, 'selected-private-backup');
        return receipt;
      },
      restoreRecovery: async (...args) => calls.push(args),
    };
    const dialog = {
      showOpenDialog: async (options) => {
        const index = dialogIndex++;
        assert.deepEqual(options.properties, [index === 0 ? 'openFile' : 'openDirectory']);
        return {
          canceled: cancelAt === index,
          filePaths: [index === 0 ? 'selected-private-backup' : 'selected-private-parent'],
        };
      },
      showMessageBox: async (options) => {
        assert.deepEqual(options.buttons, ['Confirm', 'Cancel']);
        assert.equal(options.defaultId, 1);
        assert.equal(options.cancelId, 1);
        return { response: cancelAt === 2 ? 1 : 0 };
      },
    };
    assert.equal(
      await runNativePersistenceRecovery(
        service,
        dialog,
        async () => {},
        'owned-private-checkpoint',
      ),
      cancelAt === 3 ? 'COMPLETED' : 'CANCELLED',
    );
    assert.deepEqual(
      calls,
      cancelAt === 3 ? [[receipt, 'selected-private-parent', 'owned-private-checkpoint']] : [],
    );
  }
});
test('native recovery rechecks ownership after confirmation before restore', async () => {
  const { runNativePersistenceRecovery } = await import('../src/main/persistence-native.ts');
  let active = true;
  const dialog = {
    showOpenDialog: async () => ({ canceled: false, filePaths: ['private-selection'] }),
    showMessageBox: async () => {
      active = false;
      return { response: 0 };
    },
  };
  await assert.rejects(
    runNativePersistenceRecovery(
      {
        recoverySelection: async () => ({ header: { backupId: randomUUID() } }),
        restoreRecovery: () => assert.fail('revoked restore'),
      },
      dialog,
      async () => {
        if (!active) throw Error('OWNERSHIP_REVOKED');
      },
      'private-checkpoint',
    ),
    /OWNERSHIP_REVOKED/,
  );
});
