import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  createPersistenceRoot,
  acquirePersistenceLease,
  writePersistenceFile,
} from '../src/main/persistence-files.ts';
import { prepareBackupKeyProfile } from '../src/main/backup-key-profile.ts';
import {
  preparedPersistenceEntry,
  configurePersistenceSession,
} from '../src/main/persistence-entry.ts';
const parent = fileURLToPath(new URL('../.test-output', import.meta.url));
async function fixture(run) {
  try {
    mkdirSync(parent);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  assert.equal(lstatSync(parent).isSymbolicLink(), false);
  assert.equal(realpathSync(parent), resolve(parent));
  const root = mkdtempSync(join(parent, 'entry-')),
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
  try {
    const profile = await prepareBackupKeyProfile(location.root, storeId, true, lease.assertOwned);
    writeFileSync(
      join(profile.directory, 'Local State'),
      JSON.stringify({
        os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic').toString('base64') },
      }),
    );
    const prepared = await prepareBackupKeyProfile(
        location.root,
        storeId,
        false,
        lease.assertOwned,
      ),
      file = join(location.root, '.ready-launch.json'),
      control = {
        version: 2,
        state: 'READY',
        root: location.root,
        parentToken,
        ownerToken,
        storeId,
        checkpoint: basename(prepared.checkpoint),
        runtimeExeSha256: 'a'.repeat(64),
      };
    await writePersistenceFile(file, JSON.stringify(control));
    await run({ file, control, location, profile: prepared });
  } finally {
    await lease.release();
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    assert.equal(realpathSync(root), resolve(root));
    rmSync(root, { recursive: true });
  }
}
test('production entry is synchronous, exact and configures sessionData only before ready', async () =>
  fixture(async ({ file, profile }) => {
    const entry = preparedPersistenceEntry(file);
    assert.equal(entry.keyProfile, profile.directory);
    const calls = [];
    configurePersistenceSession(
      { isReady: () => false, setPath: (...args) => calls.push(args) },
      entry,
    );
    assert.deepEqual(calls, [['sessionData', profile.directory]]);
    assert.throws(
      () =>
        configurePersistenceSession({ isReady: () => true, setPath: () => assert.fail() }, entry),
      /PERSISTENCE_PROFILE_TOO_LATE/,
    );
    assert.equal(preparedPersistenceEntry(undefined), undefined);
  }));
test('identical malformed checkpoint/profile and FRESH restore receipt are refused before native use', async () =>
  fixture(async ({ file, profile, location }) => {
    writeFileSync(join(profile.directory, 'Local State'), '{}');
    writeFileSync(profile.checkpoint, '{}');
    assert.throws(() => preparedPersistenceEntry(file), /PERSISTENCE_ENTRY_REJECTED/);
    const valid = JSON.stringify({
      os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic').toString('base64') },
    });
    writeFileSync(join(profile.directory, 'Local State'), valid);
    writeFileSync(profile.checkpoint, valid);
    writeFileSync(join(location.root, '.restore-receipt.json'), '{}');
    assert.throws(() => preparedPersistenceEntry(file), /PERSISTENCE_ENTRY_REJECTED/);
    // Restore the deliberately invalid fixture so the unchanged owned lease can retire.
    const { unlinkSync } = await import('node:fs');
    unlinkSync(join(location.root, '.restore-receipt.json'));
  }));
test('verification stage flags, duplicate keys and unknown owner cannot become production READY', async () =>
  fixture(async ({ file, control }) => {
    for (const raw of [
      JSON.stringify({ ...control, state: 'provision' }),
      JSON.stringify(control).replace('"version":2', '"version":0,"version":2'),
      JSON.stringify({ ...control, ownerToken: randomUUID() }),
    ]) {
      writeFileSync(file, raw);
      assert.throws(() => preparedPersistenceEntry(file), /PERSISTENCE_ENTRY_REJECTED/);
    }
  }));
