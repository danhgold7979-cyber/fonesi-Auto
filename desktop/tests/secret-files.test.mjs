import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, lstat, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  vaultInventory,
  readVaultCiphertext,
  writeVaultCiphertext,
  initializeVaultFiles,
  replaceVaultIndex,
  vaultRevisionName,
} from '../src/main/secret-files.ts';
const base = fileURLToPath(new URL('../.test-output', import.meta.url));
async function fixture(fn) {
  try {
    await mkdir(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal((await lstat(base)).isSymbolicLink(), false);
  assert.equal(await realpath(base), base);
  const root = await mkdtemp(join(base, 'vault-files-'));
  try {
    await fn(root);
  } finally {
    assert.equal(await realpath(root), root);
    assert.equal((await lstat(root)).isSymbolicLink(), false);
    await rm(root, { recursive: true, force: false });
  }
}
test('vault file initialization is exclusive and inventory rejects unknown entries', async () =>
  fixture(async (root) => {
    const vault = join(root, 'vault'),
      id = randomUUID();
    await initializeVaultFiles(vault, id, '{}', '{}');
    assert.equal((await vaultInventory(vault)).size, 3);
    await assert.rejects(
      () => initializeVaultFiles(vault, id, '{}', '{}'),
      (e) => e.code === 'EEXIST',
    );
    assert.equal(await readFile(join(vault, '.owner'), 'utf8'), id);
    await writeFile(join(vault, 'unknown'), '');
    await assert.rejects(() => vaultInventory(vault), /STORE_INVALID/);
  }));
test('vault ciphertext is bounded, exclusive and copied from caller bytes', async () =>
  fixture(async (root) => {
    const target = join(root, vaultRevisionName(randomUUID(), 1));
    const input = new Uint8Array([1, 2, 3]);
    const pending = writeVaultCiphertext(target, input);
    input.fill(9);
    await pending;
    assert.deepEqual(await readVaultCiphertext(target), new Uint8Array([1, 2, 3]));
    await assert.rejects(
      () => writeVaultCiphertext(target, new Uint8Array([4])),
      (e) => e.code === 'EEXIST',
    );
    await assert.rejects(
      () => writeVaultCiphertext(join(root, 'large.bin'), new Uint8Array(32769)),
      /STORE_INVALID/,
    );
    await writeFile(join(root, 'empty.bin'), '');
    await assert.rejects(() => readVaultCiphertext(join(root, 'empty.bin')), /STORE_INVALID/);
  }));
test('vault index publication rechecks admitted owner and old bytes; failed admission retains old index', async () =>
  fixture(async (root) => {
    const vault = join(root, 'vault');
    await initializeVaultFiles(vault, randomUUID(), 'old', '{}');
    let called = 0;
    await assert.rejects(
      () =>
        replaceVaultIndex(
          vault,
          'old',
          'new',
          async () => {
            called++;
            throw Error('OWNER_REVOKED');
          },
          () => {},
        ),
      /OWNER_REVOKED/,
    );
    assert.equal(called, 1);
    assert.equal(await readFile(join(vault, 'index.json'), 'utf8'), 'old');
    assert.equal((await vaultInventory(vault)).size, 4);
    await replaceVaultIndex(
      vault,
      'old',
      'new',
      async () => {},
      () => {},
    );
    assert.equal(await readFile(join(vault, 'index.json'), 'utf8'), 'new');
    await assert.rejects(
      () =>
        replaceVaultIndex(
          vault,
          'old',
          'bad',
          async () => {},
          () => {},
        ),
      /STORE_INVALID/,
    );
  }));
test('vault revision file names reject malformed identifiers and unsafe revisions', () => {
  assert.throws(() => vaultRevisionName('../outside', 1), /STORE_INVALID/);
  assert.throws(() => vaultRevisionName(randomUUID(), 0), /STORE_INVALID/);
  assert.throws(
    () => vaultRevisionName(randomUUID(), Number.MAX_SAFE_INTEGER + 1),
    /STORE_INVALID/,
  );
});

test('vault final synchronous check blocks publication after awaited owner admission', async () =>
  fixture(async (root) => {
    const vault = join(root, 'vault');
    await initializeVaultFiles(vault, randomUUID(), 'old', '{}');
    let active = true;
    await assert.rejects(
      () =>
        replaceVaultIndex(
          vault,
          'old',
          'new',
          async () => {
            active = false;
          },
          () => {
            if (!active) throw Error('OWNER_REVOKED');
          },
        ),
      /OWNER_REVOKED/,
    );
    assert.equal(await readFile(join(vault, 'index.json'), 'utf8'), 'old');
  }));
test('vault inventory rejects unsafe revision names rather than counting them as retained evidence', async () =>
  fixture(async (root) => {
    await writeFile(join(root, `secret-${randomUUID()}-r9007199254740992.bin`), 'x');
    await assert.rejects(() => vaultInventory(root), /STORE_INVALID/);
  }));
