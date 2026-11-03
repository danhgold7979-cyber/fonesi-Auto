import { lstat, realpath, mkdir, open, opendir, rename, unlink, rmdir } from 'node:fs/promises';
import { resolve, dirname, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

// Main-only helpers. Caller serializes operations and supplies trusted canonical parents.
// No hostile concurrent filesystem editor guarantee, stale-owner stealing, or recursive cleanup.
export type PersistenceLocation = Readonly<{ root: string; parentToken: string }>;
export type RootProvenance = Readonly<{
  version: 1;
  storeId: string;
  kind: 'FRESH' | 'RESTORED';
  restoreReceiptId: string | null;
}>;
export type BackupLocationIdentity = Readonly<{
  version: 1;
  storeId: string;
  locationId: string;
  folderMarkerId: string;
}>;
const LIMIT = 65536;
const id = (x: unknown): x is string =>
  typeof x === 'string' &&
  x.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const equalPath = (a: string, b: string) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function fail(): never {
  throw new Error('PERSISTENCE_FILES_REJECTED');
}
export async function plainPersistenceDirectory(path: string): Promise<void> {
  if (path !== resolve(path)) fail();
  const s = await lstat(path);
  if (!s.isDirectory() || s.isSymbolicLink() || !equalPath(await realpath(path), path)) fail();
}
export async function readPersistenceFile(path: string, limit = LIMIT): Promise<string> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > LIMIT) fail();
  await plainPersistenceDirectory(dirname(path));
  const s = await lstat(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size > limit) fail();
  const h = await open(path, 'r');
  try {
    const actual = await h.stat();
    if (!actual.isFile() || actual.size > limit || actual.dev !== s.dev || actual.ino !== s.ino)
      fail();
    const bytes = Buffer.alloc(limit + 1);
    let count = 0;
    while (count < bytes.length) {
      const r = await h.read(bytes, count, bytes.length - count, null);
      if (!r.bytesRead) break;
      count += r.bytesRead;
    }
    if (count > limit) fail();
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, count),
    );
  } finally {
    await h.close();
  }
}
export async function writePersistenceFile(path: string, value: string): Promise<void> {
  if (typeof value !== 'string' || Buffer.byteLength(value) > LIMIT) fail();
  await plainPersistenceDirectory(dirname(path));
  const h = await open(path, 'wx', 0o600);
  try {
    await h.writeFile(value, 'utf8');
    await h.sync();
  } finally {
    await h.close();
  }
}
// Existing target must be an owned regular file. Caller holds the lease; failure retains staging.
export async function replacePersistenceFile(path: string, value: string): Promise<void> {
  await readPersistenceFile(path);
  const temp = join(dirname(path), `.replace-${randomUUID()}.json`);
  await writePersistenceFile(temp, value);
  await readPersistenceFile(path);
  await rename(temp, path);
}
async function parent(location: PersistenceLocation): Promise<void> {
  if (
    !id(location.parentToken) ||
    location.root !== resolve(location.root) ||
    !/^data-[a-z0-9-]+$/.test(basename(location.root))
  )
    fail();
  await plainPersistenceDirectory(dirname(location.root));
  if (
    (await readPersistenceFile(join(dirname(location.root), '.owner'), 36)) !== location.parentToken
  )
    fail();
}
function rootBytes(value: RootProvenance): string {
  if (
    value.version !== 1 ||
    !id(value.storeId) ||
    (value.kind === 'FRESH'
      ? value.restoreReceiptId !== null
      : value.kind !== 'RESTORED' || !id(value.restoreReceiptId))
  )
    fail();
  return JSON.stringify({
    version: 1,
    storeId: value.storeId,
    kind: value.kind,
    restoreReceiptId: value.restoreReceiptId,
  });
}
const receiptBytes = (p: RootProvenance) =>
  JSON.stringify({
    version: 1,
    storeId: p.storeId,
    restoreReceiptId: p.restoreReceiptId,
    quarantined: true,
  });
export async function createPersistenceRoot(
  location: PersistenceLocation,
  provenance: RootProvenance,
): Promise<void> {
  location = Object.freeze({ root: location.root, parentToken: location.parentToken });
  provenance = Object.freeze({
    version: provenance.version,
    storeId: provenance.storeId,
    kind: provenance.kind,
    restoreReceiptId: provenance.restoreReceiptId,
  });
  const bytes = rootBytes(provenance);
  await parent(location);
  await mkdir(location.root); // Never adopt an existing directory, even an empty one.
  if (provenance.kind === 'RESTORED')
    await writePersistenceFile(
      join(location.root, '.restore-receipt.json'),
      receiptBytes(provenance),
    );
  await writePersistenceFile(join(location.root, '.persistence-owner.json'), bytes);
}
export async function verifyPersistenceRoot(
  location: PersistenceLocation,
): Promise<RootProvenance> {
  location = Object.freeze({ root: location.root, parentToken: location.parentToken });
  await parent(location);
  await plainPersistenceDirectory(location.root);
  const raw = await readPersistenceFile(join(location.root, '.persistence-owner.json'));
  let p: RootProvenance;
  try {
    p = JSON.parse(raw) as RootProvenance;
    if (!p || rootBytes(p) !== raw) fail();
  } catch {
    return fail();
  }
  if (
    p.kind === 'RESTORED' &&
    (await readPersistenceFile(join(location.root, '.restore-receipt.json'))) !== receiptBytes(p)
  )
    fail();
  if (p.kind === 'FRESH') {
    try {
      await lstat(join(location.root, '.restore-receipt.json'));
      fail();
    } catch (e) {
      if ((e as { code?: string }).code !== 'ENOENT') throw e;
    }
  }
  return Object.freeze(p);
}
async function exactEntries(path: string, expected: string[]): Promise<void> {
  await plainPersistenceDirectory(path);
  const d = await opendir(path);
  const names: string[] = [];
  try {
    for (;;) {
      const item = await d.read();
      if (!item) break;
      if (names.length >= expected.length || !expected.includes(item.name)) fail();
      names.push(item.name);
    }
  } finally {
    await d.close();
  }
  if (names.length !== expected.length) fail();
}
export async function acquirePersistenceLease(
  location: PersistenceLocation,
  ownerToken: string,
): Promise<Readonly<{ assertOwned(): Promise<void>; release(): Promise<void> }>> {
  location = Object.freeze({ root: location.root, parentToken: location.parentToken });
  if (!id(ownerToken)) fail();
  const p = await verifyPersistenceRoot(location);
  const lock = join(location.root, '.writer-lock');
  const owner = JSON.stringify({ version: 1, storeId: p.storeId, ownerToken });
  // Refuse reused owner identities: immutable receipt is the normal-release crash witness.
  const receipt = join(location.root, `.released-${ownerToken}.json`);
  try {
    await lstat(receipt);
    fail();
  } catch (e) {
    if ((e as { code?: string }).code !== 'ENOENT') throw e;
  }
  await mkdir(lock);
  await writePersistenceFile(join(lock, 'owner.json'), owner);
  let released = false;
  let releasePromise: Promise<void> | null = null;
  const assertOwned = async () => {
    if (released) fail();
    const current = await verifyPersistenceRoot(location);
    if (rootBytes(current) !== rootBytes(p)) fail();
    await exactEntries(lock, ['owner.json']);
    if ((await readPersistenceFile(join(lock, 'owner.json'))) !== owner) fail();
  };
  const release = () => {
    if (releasePromise) return releasePromise;
    releasePromise = (async () => {
      await assertOwned();
      await writePersistenceFile(receipt, owner);
      await assertOwned();
      await unlink(join(lock, 'owner.json'));
      await rmdir(lock);
      released = true;
      // Receipt deliberately retained. An interrupted empty lock never loses its identity witness.
    })();
    return releasePromise;
  };
  return Object.freeze({ assertOwned, release });
}
function locationBytes(i: BackupLocationIdentity): string {
  if (i.version !== 1 || !id(i.storeId) || !id(i.locationId) || !id(i.folderMarkerId)) fail();
  return JSON.stringify({
    version: 1,
    storeId: i.storeId,
    locationId: i.locationId,
    folderMarkerId: i.folderMarkerId,
  });
}
export async function createBackupLocation(
  selectedParent: string,
  identity: BackupLocationIdentity,
): Promise<string> {
  identity = Object.freeze({
    version: identity.version,
    storeId: identity.storeId,
    locationId: identity.locationId,
    folderMarkerId: identity.folderMarkerId,
  });
  const bytes = locationBytes(identity);
  await plainPersistenceDirectory(selectedParent);
  const path = join(selectedParent, `backup-${identity.folderMarkerId}`);
  await mkdir(path);
  await writePersistenceFile(join(path, '.backup-owner.json'), bytes);
  return path;
}
export async function verifyBackupLocation(
  path: string,
  identity: BackupLocationIdentity,
): Promise<void> {
  identity = Object.freeze({
    version: identity.version,
    storeId: identity.storeId,
    locationId: identity.locationId,
    folderMarkerId: identity.folderMarkerId,
  });
  const bytes = locationBytes(identity);
  await plainPersistenceDirectory(dirname(path));
  await plainPersistenceDirectory(path);
  if (
    basename(path) !== `backup-${identity.folderMarkerId}` ||
    (await readPersistenceFile(join(path, '.backup-owner.json'))) !== bytes
  )
    fail();
}
// Child can prove a supervisor-retained lease, but receives no release/recovery authority.
export async function assertBorrowedPersistenceLease(
  location: PersistenceLocation,
  ownerToken: string,
): Promise<void> {
  location = Object.freeze({ root: location.root, parentToken: location.parentToken });
  if (!id(ownerToken)) fail();
  const p = await verifyPersistenceRoot(location);
  const lock = join(location.root, '.writer-lock');
  await exactEntries(lock, ['owner.json']);
  const expected = JSON.stringify({ version: 1, storeId: p.storeId, ownerToken });
  if ((await readPersistenceFile(join(lock, 'owner.json'))) !== expected) fail();
}
