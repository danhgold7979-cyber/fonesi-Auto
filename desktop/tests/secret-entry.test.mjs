import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, lstat, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createPersistenceRoot, acquirePersistenceLease } from '../src/main/persistence-files.ts';
import { openMainSecretStore } from '../src/main/secret-entry.ts';
import { SecretStore } from '../src/main/secret-store.ts';
const base = fileURLToPath(new URL('../.test-output', import.meta.url));
const provider = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (text) => Buffer.from(text),
  decryptStringAsync: async (bytes) => ({ result: bytes.toString('utf8'), shouldReEncrypt: false }),
};
async function fixture(kind, fn) {
  try {
    await mkdir(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(await realpath(base), base);
  assert.equal((await lstat(base)).isSymbolicLink(), false);
  const parent = await mkdtemp(join(base, 'vault-entry-')),
    parentToken = randomUUID(),
    storeId = randomUUID(),
    ownerToken = randomUUID();
  await writeFile(join(parent, '.owner'), parentToken, { flag: 'wx' });
  const location = { root: join(parent, `data-${storeId}`), parentToken };
  let lease;
  try {
    await createPersistenceRoot(location, {
      version: 1,
      storeId,
      kind,
      restoreReceiptId: kind === 'FRESH' ? null : randomUUID(),
    });
    lease = await acquirePersistenceLease(location, ownerToken);
    await fn({
      ...location,
      storeId,
      ownerToken,
      keyProfile: join(parent, 'profile'),
      checkpoint: join(parent, 'checkpoint'),
      runtimeExeSha256: 'a'.repeat(64),
    });
  } finally {
    await lease?.release();
    assert.equal(await realpath(parent), parent);
    await rm(parent, { recursive: true, force: false });
  }
}
test('main vault entry initializes once under real root lease and reopens without index reset', async () =>
  fixture('FRESH', async (entry) => {
    let store = await openMainSecretStore(
      entry,
      provider,
      async () => 'AVAILABLE',
      () => false,
    );
    await store.close();
    const before = await readFile(join(entry.root, 'vault/index.json'));
    store = await openMainSecretStore(
      entry,
      provider,
      async () => 'AVAILABLE',
      () => false,
    );
    assert.deepEqual(await readFile(join(entry.root, 'vault/index.json')), before);
    await store.close();
  }));
test('main vault entry refuses restored roots, closing and partial initialized directories', async () => {
  await fixture('RESTORED', async (entry) => {
    await assert.rejects(
      () =>
        openMainSecretStore(
          entry,
          provider,
          async () => 'AVAILABLE',
          () => false,
        ),
      /STORE_INVALID/,
    );
  });
  await fixture('FRESH', async (entry) => {
    await assert.rejects(
      () =>
        openMainSecretStore(
          entry,
          provider,
          async () => 'AVAILABLE',
          () => true,
        ),
      /OWNER_REVOKED/,
    );
    await mkdir(join(entry.root, 'vault'));
    await writeFile(join(entry.root, 'vault/.owner'), entry.storeId);
    await assert.rejects(() =>
      openMainSecretStore(
        entry,
        provider,
        async () => 'AVAILABLE',
        () => false,
      ),
    );
    assert.equal(await readFile(join(entry.root, 'vault/.owner'), 'utf8'), entry.storeId);
  });
});
test('vault close waits for pending initialization and prevents late initialization after closing', async () =>
  fixture('FRESH', async (entry) => {
    let resolve, entered;
    const ready = new Promise((r) => {
      entered = r;
    });
    const store = new SecretStore({
      root: entry.root,
      storeId: entry.storeId,
      provider: {
        encrypt: async () => new Uint8Array([1]),
        decrypt: async () => ({ result: '', shouldReEncrypt: false }),
      },
      audit: async () => 'AVAILABLE',
      assertOwned: async () => {
        entered();
        await new Promise((r) => {
          resolve = r;
        });
      },
    });
    const opening = store.initialize('FRESH');
    await ready;
    let settled = false;
    const close = store.close().then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    assert.equal(settled, false);
    resolve();
    await assert.rejects(() => opening, /OWNER_REVOKED/);
    await close;
    assert.equal(settled, true);
  }));
