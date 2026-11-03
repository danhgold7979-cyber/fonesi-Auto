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
  readdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { prepareBackupKeyProfile, backupKeys } from '../src/main/backup-key-profile.ts';
const parent = fileURLToPath(new URL('../.test-output', import.meta.url));
async function fixture(run) {
  try {
    mkdirSync(parent);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  assert.equal(realpathSync(parent), resolve(parent));
  assert.equal(lstatSync(parent).isSymbolicLink(), false);
  const root = mkdtempSync(join(parent, 'key-profile-'));
  try {
    await run(root, randomUUID());
  } finally {
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    assert.equal(realpathSync(root), resolve(root));
    rmSync(root, { recursive: true });
  }
}
test('existing profile is preserved before any provider call; missing/corrupt copies never reset', async () =>
  fixture(async (root, id) => {
    const lease = async () => {};
    const fresh = await prepareBackupKeyProfile(root, id, true, lease);
    await assert.rejects(prepareBackupKeyProfile(root, id, true, lease));
    await assert.rejects(prepareBackupKeyProfile(root, id, false, lease));
    const path = join(fresh.directory, 'Local State'),
      raw = JSON.stringify({
        os_crypt: {
          encrypted_key: Buffer.from('DPAPIsynthetic-not-a-real-key').toString('base64'),
        },
      });
    writeFileSync(path, raw);
    const existing = await prepareBackupKeyProfile(root, id, false, lease);
    assert.equal(readFileSync(existing.checkpoint, 'utf8'), raw);
    assert.equal(readFileSync(path, 'utf8'), raw);
    writeFileSync(path, 'broken');
    await assert.rejects(prepareBackupKeyProfile(root, id, false, lease));
    assert.equal(readFileSync(path, 'utf8'), 'broken');
    assert.equal(readFileSync(existing.checkpoint, 'utf8'), raw);
  }));
test('wrong identity/oversized profile or lost ownership blocks before checkpoint', async () =>
  fixture(async (root, id) => {
    const profile = await prepareBackupKeyProfile(root, id, true, async () => {});
    writeFileSync(join(profile.directory, 'Local State'), '{}');
    await assert.rejects(prepareBackupKeyProfile(root, randomUUID(), false, async () => {}));
    await assert.rejects(
      prepareBackupKeyProfile(root, id, false, async () => {
        throw new Error('LEASE_LOST');
      }),
    );
    writeFileSync(join(profile.directory, 'Local State'), 'x'.repeat(65537));
    await assert.rejects(prepareBackupKeyProfile(root, id, false, async () => {}));
    assert.equal(readdirSync(root).filter((name) => name.startsWith('key-checkpoint-')).length, 0);
  }));
test('availability cannot replace old-key decryption and rotation hint is preserved', async () => {
  const provider = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value) => Buffer.from(value),
    decryptStringAsync: async () => ({ result: 'old', shouldReEncrypt: true }),
  };
  const keys = await backupKeys(provider);
  assert.deepEqual(await keys.unwrap(Buffer.from('owned')), {
    result: 'old',
    shouldReEncrypt: true,
  });
  await assert.rejects(backupKeys({ ...provider, isAsyncEncryptionAvailable: async () => false }));
  const failed = await backupKeys({
    ...provider,
    decryptStringAsync: async () => {
      throw new Error('provider failure');
    },
  });
  await assert.rejects(failed.unwrap(Buffer.from('old')));
});

test('missing and malformed persisted DPAPI key records fail before native initialization', async () =>
  fixture(async (root, id) => {
    const profile = await prepareBackupKeyProfile(root, id, true, async () => {});
    for (const value of [
      {},
      { os_crypt: {} },
      { os_crypt: { encrypted_key: '' } },
      {
        os_crypt: {
          encrypted_key: Buffer.from([0xc4, 0x50, 0x41, 0x50, 0x49, 1]).toString('base64'),
        },
      },
      { os_crypt: { encrypted_key: Buffer.from('WRONGdata').toString('base64') } },
      { os_crypt: { encrypted_key: Buffer.from('DPAPI').toString('base64') } },
    ]) {
      const raw = JSON.stringify(value);
      writeFileSync(join(profile.directory, 'Local State'), raw);
      await assert.rejects(
        prepareBackupKeyProfile(root, id, false, async () => {}),
        /KEY_PROFILE_MATERIAL_REJECTED/,
      );
      assert.equal(readFileSync(join(profile.directory, 'Local State'), 'utf8'), raw);
    }
    assert.equal(readdirSync(root).filter((name) => name.startsWith('key-checkpoint-')).length, 0);
  }));
