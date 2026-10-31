import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  assertBorrowedPersistenceLease,
  createPersistenceRoot,
  verifyPersistenceRoot,
  acquirePersistenceLease,
  readPersistenceFile,
  writePersistenceFile,
  replacePersistenceFile,
  createBackupLocation,
  verifyBackupLocation,
} from '../src/main/persistence-files.ts';
function fixture() {
  const base = fileURLToPath(new URL('../.test-output/', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const dir = mkdtempSync(join(base, 'persistence-files-'));
  const token = randomUUID();
  writeFileSync(join(dir, '.owner'), token, { flag: 'wx' });
  return {
    dir,
    location: { root: join(dir, 'data-test'), parentToken: token },
    cleanup() {
      assert.equal(realpathSync(dir), resolve(dir));
      assert.equal(lstatSync(dir).isSymbolicLink(), false);
      rmSync(dir, { recursive: true });
    },
  };
}
const provenance = () => ({
  version: 1,
  storeId: randomUUID(),
  kind: 'FRESH',
  restoreReceiptId: null,
});
test('fresh root requires exact owned parent and never adopts existing directories', async () => {
  const f = fixture();
  try {
    const p = provenance();
    await assert.rejects(createPersistenceRoot({ ...f.location, parentToken: randomUUID() }, p));
    assert.equal(existsSync(f.location.root), false);
    await createPersistenceRoot(f.location, p);
    assert.deepEqual(await verifyPersistenceRoot(f.location), p);
    await assert.rejects(createPersistenceRoot(f.location, p));
    const old = readFileSync(join(f.location.root, '.persistence-owner.json'), 'utf8');
    writeFileSync(
      join(f.location.root, '.persistence-owner.json'),
      old.replace('"version":1', '"version":1,"version":1'),
    );
    await assert.rejects(verifyPersistenceRoot(f.location));
  } finally {
    f.cleanup();
  }
});
test('restored provenance always requires exact independent quarantine receipt', async () => {
  const f = fixture();
  try {
    const p = { ...provenance(), kind: 'RESTORED', restoreReceiptId: randomUUID() };
    await createPersistenceRoot(f.location, p);
    assert.deepEqual(await verifyPersistenceRoot(f.location), p);
    const receipt = join(f.location.root, '.restore-receipt.json');
    writeFileSync(receipt, '{}');
    await assert.rejects(verifyPersistenceRoot(f.location));
    unlinkSync(receipt);
    await assert.rejects(verifyPersistenceRoot(f.location));
  } finally {
    f.cleanup();
  }
});
test('exclusive writer never steals stale lock; concurrent release shares completion and leaves identity witness', async () => {
  const f = fixture();
  try {
    const p = provenance();
    await createPersistenceRoot(f.location, p);
    const token = randomUUID();
    const lease = await acquirePersistenceLease(f.location, token);
    await lease.assertOwned();
    await assert.rejects(acquirePersistenceLease(f.location, randomUUID()));
    const a = lease.release();
    const b = lease.release();
    assert.equal(a, b);
    await a;
    assert.equal(existsSync(join(f.location.root, '.writer-lock')), false);
    assert.deepEqual(
      JSON.parse(readFileSync(join(f.location.root, `.released-${token}.json`), 'utf8')),
      { version: 1, storeId: p.storeId, ownerToken: token },
    );
    await assert.rejects(lease.assertOwned());
    await assert.rejects(acquirePersistenceLease(f.location, token));
    const next = await acquirePersistenceLease(f.location, randomUUID());
    await next.release();
  } finally {
    f.cleanup();
  }
});
test('unexpected lock entries and malformed owner reject release before mutations', async () => {
  const f = fixture();
  try {
    await createPersistenceRoot(f.location, provenance());
    const token = randomUUID();
    const lease = await acquirePersistenceLease(f.location, token);
    const lock = join(f.location.root, '.writer-lock');
    writeFileSync(join(lock, 'extra'), 'KEEP');
    const before = readdirSync(lock);
    await assert.rejects(lease.release());
    assert.deepEqual(readdirSync(lock), before);
    assert.equal(existsSync(join(f.location.root, `.released-${token}.json`)), false);
  } finally {
    f.cleanup();
  }
});
test('interrupted release empty lock retains readable identity but is never silently adopted', async () => {
  const f = fixture();
  try {
    const p = provenance();
    await createPersistenceRoot(f.location, p);
    const token = randomUUID();
    await acquirePersistenceLease(f.location, token);
    const owner = readFileSync(join(f.location.root, '.writer-lock', 'owner.json'));
    writeFileSync(join(f.location.root, `.released-${token}.json`), owner, { flag: 'wx' });
    unlinkSync(join(f.location.root, '.writer-lock', 'owner.json'));
    await assert.rejects(acquirePersistenceLease(f.location, randomUUID()));
    assert.equal(
      readFileSync(join(f.location.root, `.released-${token}.json`), 'utf8'),
      owner.toString(),
    );
  } finally {
    f.cleanup();
  }
});
test('bounded regular UTF8 reads, exclusive writes and replacement preserve preexisting destinations', async () => {
  const f = fixture();
  try {
    const path = join(f.dir, 'value');
    await writePersistenceFile(path, 'old');
    await assert.rejects(writePersistenceFile(path, 'BAD'));
    assert.equal(await readPersistenceFile(path), 'old');
    await replacePersistenceFile(path, 'new');
    assert.equal(await readPersistenceFile(path), 'new');
    await assert.rejects(readPersistenceFile(path, 2));
    await assert.rejects(writePersistenceFile(join(f.dir, 'oversize'), 'x'.repeat(65537)));
    assert.equal(existsSync(join(f.dir, 'oversize')), false);
    writeFileSync(path, Buffer.from([255]));
    await assert.rejects(readPersistenceFile(path));
    await assert.rejects(replacePersistenceFile(join(f.dir, 'missing'), 'x'));
  } finally {
    f.cleanup();
  }
});
test('backup location binds exact store/location/folder identity without taking parent ownership', async () => {
  const f = fixture();
  try {
    const identity = {
      version: 1,
      storeId: randomUUID(),
      locationId: randomUUID(),
      folderMarkerId: randomUUID(),
    };
    const path = await createBackupLocation(f.dir, identity);
    await verifyBackupLocation(path, identity);
    await assert.rejects(verifyBackupLocation(path, { ...identity, storeId: randomUUID() }));
    await assert.rejects(createBackupLocation(f.dir, identity));
    assert.equal(readFileSync(join(f.dir, '.owner'), 'utf8'), f.location.parentToken);
  } finally {
    f.cleanup();
  }
});
test('static directory and file symlinks are rejected without following them', async () => {
  const f = fixture();
  try {
    const target = join(f.dir, 'real');
    mkdirSync(target);
    const alias = join(f.dir, 'alias');
    symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(
      createBackupLocation(alias, {
        version: 1,
        storeId: randomUUID(),
        locationId: randomUUID(),
        folderMarkerId: randomUUID(),
      }),
    );
    const file = join(f.dir, 'file');
    writeFileSync(file, 'KEEP');
    const link = join(f.dir, 'link');
    if (process.platform !== 'win32') {
      symlinkSync(file, link);
      await assert.rejects(readPersistenceFile(link));
    }
    assert.equal(readFileSync(file, 'utf8'), 'KEEP');
  } finally {
    f.cleanup();
  }
});
test('admission snapshots remain bound when caller mutates objects across awaits', async () => {
  const f = fixture();
  try {
    const location = { ...f.location };
    const p = provenance();
    const expected = { ...p };
    const pending = createPersistenceRoot(location, p);
    location.root = join(f.dir, 'data-redirect');
    p.storeId = randomUUID();
    await pending;
    assert.deepEqual(await verifyPersistenceRoot(f.location), expected);
    assert.equal(existsSync(location.root), false);
    const leaseLocation = { ...f.location };
    const acquired = acquirePersistenceLease(leaseLocation, randomUUID());
    leaseLocation.root = location.root;
    const lease = await acquired;
    await lease.assertOwned();
    await lease.release();
    const identity = {
      version: 1,
      storeId: expected.storeId,
      locationId: randomUUID(),
      folderMarkerId: randomUUID(),
    };
    const original = { ...identity };
    const creation = createBackupLocation(f.dir, identity);
    identity.folderMarkerId = randomUUID();
    const path = await creation;
    await verifyBackupLocation(path, original);
    assert.equal(path, join(f.dir, `backup-${original.folderMarkerId}`));
  } finally {
    f.cleanup();
  }
});

test('borrowed assertion binds exact owner and grants no release capability', async () => {
  const f = fixture();
  try {
    await createPersistenceRoot(f.location, provenance());
    const token = randomUUID();
    const lease = await acquirePersistenceLease(f.location, token);
    assert.equal(await assertBorrowedPersistenceLease(f.location, token), undefined);
    await assert.rejects(assertBorrowedPersistenceLease(f.location, randomUUID()));
    await lease.release();
    await assert.rejects(assertBorrowedPersistenceLease(f.location, token));
  } finally {
    f.cleanup();
  }
});
