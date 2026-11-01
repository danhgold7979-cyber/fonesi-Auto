import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  writeFile,
  readFile,
  unlink,
  mkdir,
  symlink,
  link,
  rm,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyPlatformToolsFiles } from '../src/main/platform-tools-files.ts';
const candidate = JSON.parse(
  await readFile(new URL('../verification/platform-tools-candidate.json', import.meta.url), 'utf8'),
);
const sha = (b) => createHash('sha256').update(b).digest('hex');
async function fixture(fn) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'fonesi-platform-inspection-'))),
    root = join(parent, 'platform-tools');
  await mkdir(root);
  const inventory = [];
  try {
    for (const row of candidate.files) {
      const bytes = Buffer.alloc(row.peMachine === null ? 16 : 128, 0);
      if (row.peMachine !== null) {
        bytes.writeUInt16LE(0x5a4d);
        bytes.writeUInt32LE(64, 60);
        bytes.writeUInt32LE(0x4550, 64);
        bytes.writeUInt16LE(332, 68);
        bytes.writeUInt16LE(267, 88);
      }
      await writeFile(join(root, row.path), bytes, { flag: 'wx' });
      inventory.push({ ...row, bytes: bytes.length, sha256: sha(bytes) });
    }
    await fn({ parent, root, inventory });
  } finally {
    await rm(parent, { recursive: true });
  }
}
const rejects = (root, rows) =>
  assert.rejects(verifyPlatformToolsFiles(root, rows), /^Error: PLATFORM_TOOLS_FILES_REJECTED$/);
test('synthetic exact14 physicalfiles measured without executing or activating candidate', async () => {
  await fixture(async ({ root, inventory }) => {
    const out = await verifyPlatformToolsFiles(root, inventory);
    assert.deepEqual(out, inventory);
    assert.ok(Object.isFrozen(out) && Object.isFrozen(out[0]));
  });
  assert.equal(candidate.files.length, 14);
  assert.equal(
    candidate.files.reduce((n, r) => n + r.bytes, 0),
    17529398,
  );
  assert.equal(
    candidate.archive.sha256,
    '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99',
  );
});
test('missing extra directory casealias hardlink and symlink reject exact closed inventory', async () => {
  for (const mutate of [
    async ({ root }) => unlink(join(root, 'adb.exe')),
    async ({ root }) => writeFile(join(root, 'unexpected'), 'x'),
    async ({ root }) => mkdir(join(root, 'nested')),
    async ({ root }) => {
      await unlink(join(root, 'adb.exe'));
      await writeFile(join(root, 'ADB.EXE'), 'x');
    },
    async ({ root, parent }) => link(join(root, 'adb.exe'), join(parent, 'hardlink')),
  ])
    await fixture(async (f) => {
      await mutate(f);
      await rejects(f.root, f.inventory);
    });
  await fixture(async (f) => {
    const alias = join(f.parent, 'alias');
    await symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await rejects(alias, f.inventory);
  });
});
test('hash size and PEarchitecture remain independently enforced even with synthetic matching hash', async () => {
  for (const mutate of [
    (b) => (b[100] ^= 1),
    (b) => b.writeUInt16LE(0x8664, 68),
    (b) => b.writeUInt16LE(0x20b, 88),
    (b) => b.writeUInt32LE(0xffffffff, 60),
    (b) => b.writeUInt32LE(0, 64),
  ])
    await fixture(async ({ root, inventory }) => {
      const path = join(root, 'adb.exe'),
        b = await readFile(path);
      mutate(b);
      await writeFile(path, b);
      await rejects(root, inventory);
      if (
        b.readUInt16LE(68) !== 332 ||
        b.readUInt16LE(88) !== 267 ||
        b.readUInt32LE(60) !== 64 ||
        b.readUInt32LE(64) !== 0x4550
      ) {
        const rows = inventory.map((r) => (r.path === 'adb.exe' ? { ...r, sha256: sha(b) } : r));
        await rejects(root, rows);
      }
    });
  await fixture(async (f) => {
    await writeFile(join(f.root, 'adb.exe'), Buffer.alloc(129));
    await rejects(f.root, f.inventory);
  });
});
test('caller inventory is snapshotted before await and malformed descriptors never execute', async () => {
  await fixture(async ({ root, inventory }) => {
    const promise = verifyPlatformToolsFiles(root, inventory);
    inventory[0].sha256 = 'f'.repeat(64);
    assert.notEqual((await promise)[0].sha256, inventory[0].sha256);
    let reads = 0;
    Object.defineProperty(inventory[1], 'bytes', {
      get() {
        reads++;
        return 128;
      },
      enumerable: true,
    });
    await rejects(root, inventory);
    assert.equal(reads, 0);
  });
});
test('canonical path, exact14names/schema and finite bounds reject without PATH fallback', async () => {
  await fixture(async ({ root, inventory }) => {
    for (const rows of [
      inventory.slice(1),
      [...inventory].reverse(),
      inventory.map((r, i) => (i ? r : { ...r, extra: true })),
      inventory.map((r, i) => (i ? r : { ...r, bytes: 32 * 1024 * 1024 + 1 })),
      inventory.map((r, i) => (i ? r : { ...r, path: '../adb.exe' })),
    ])
      await rejects(root, rows);
    await rejects(join(root, '..', 'platform-tools') + '/.', inventory);
    await rejects('platform-tools', inventory);
    assert.equal(resolve(root), root);
  });
  const source = await readFile(
    new URL('../src/main/platform-tools-files.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /child_process|process\.env|spawn\(|exec\(/);
});
