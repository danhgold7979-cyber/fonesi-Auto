import { lstat, open, opendir, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  plainPersistenceDirectory,
  readPersistenceFile,
  writePersistenceFile,
} from './persistence-files.ts';

// Existing root lease is supplied by main. No hostile concurrent filesystem-editor claim.
export const VAULT_FILE_LIMIT = 32768;
export const VAULT_ENTRY_LIMIT = 1024;
export const VAULT_TOTAL_LIMIT = 32 * 1024 * 1024;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const revisionName = new RegExp(`^secret-(${uuid})-r([1-9][0-9]{0,15})\\.bin$`);
const candidateName = new RegExp(`^\\.replace-${uuid}\\.json$`);
const fail = (): never => {
  throw new Error('STORE_INVALID');
};
export function vaultRevisionName(id: string, revision: number): string {
  if (
    !new RegExp(`^${uuid}$`).test(id) ||
    id.length !== 36 ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    return fail();
  return `secret-${id}-r${revision}.bin`;
}
export type VaultInventory = ReadonlyMap<string, number>;
export async function vaultInventory(directory: string): Promise<VaultInventory> {
  await plainPersistenceDirectory(directory);
  const result = new Map<string, number>();
  let total = 0;
  const handle = await opendir(directory);
  try {
    for (;;) {
      const entry = await handle.read();
      if (!entry) break;
      if (result.size >= VAULT_ENTRY_LIMIT || !entry.isFile() || entry.isSymbolicLink()) fail();
      const name = entry.name;
      const revision = revisionName.exec(name);
      const revisionValid =
        revision !== null &&
        typeof revision[1] === 'string' &&
        typeof revision[2] === 'string' &&
        Number.isSafeInteger(Number(revision[2])) &&
        name === vaultRevisionName(revision[1], Number(revision[2]));
      const candidate = candidateName.exec(name);
      const candidateValid = candidate !== null && candidate[0] === name;
      if (
        !['.owner', 'index.json', 'initialized.json'].includes(name) &&
        !revisionValid &&
        !candidateValid
      )
        fail();
      const stat = await lstat(join(directory, name));
      const cap = name.endsWith('.bin') ? VAULT_FILE_LIMIT : 65536;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > cap) fail();
      total += stat.size;
      if (total > VAULT_TOTAL_LIMIT) fail();
      result.set(name, stat.size);
    }
  } finally {
    await handle.close();
  }
  return result;
}
export async function readVaultCiphertext(path: string): Promise<Uint8Array> {
  await plainPersistenceDirectory(dirname(path));
  const before = await lstat(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.size < 1 ||
    before.size > VAULT_FILE_LIMIT
  )
    fail();
  const handle = await open(path, 'r');
  try {
    const actual = await handle.stat();
    if (
      !actual.isFile() ||
      actual.size !== before.size ||
      actual.dev !== before.dev ||
      actual.ino !== before.ino
    )
      fail();
    const bytes = Buffer.alloc(VAULT_FILE_LIMIT + 1);
    let count = 0;
    while (count < bytes.length) {
      const part = await handle.read(bytes, count, bytes.length - count, null);
      if (!part.bytesRead) break;
      count += part.bytesRead;
    }
    if (count !== before.size || count > VAULT_FILE_LIMIT) fail();
    return Uint8Array.from(bytes.subarray(0, count));
  } finally {
    await handle.close();
  }
}
export async function writeVaultCiphertext(path: string, value: Uint8Array): Promise<void> {
  if (!(value instanceof Uint8Array) || value.length < 1 || value.length > VAULT_FILE_LIMIT) fail();
  const bytes = Uint8Array.from(value);
  await plainPersistenceDirectory(dirname(path));
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    bytes.fill(0);
    await handle.close();
  }
}
export async function initializeVaultFiles(
  directory: string,
  storeId: string,
  emptyIndex: string,
  receipt: string,
): Promise<void> {
  await plainPersistenceDirectory(dirname(directory));
  await mkdir(directory); // Never adopt an existing directory or reset partial initialization.
  await plainPersistenceDirectory(directory);
  await writePersistenceFile(join(directory, '.owner'), storeId);
  await writePersistenceFile(join(directory, 'index.json'), emptyIndex);
  await writePersistenceFile(join(directory, 'initialized.json'), receipt);
}
export async function replaceVaultIndex(
  directory: string,
  expected: string,
  replacement: string,
  admit: () => Promise<void>,
  finalCheck: () => void,
): Promise<void> {
  const target = join(directory, 'index.json');
  if ((await readPersistenceFile(target)) !== expected) fail();
  const candidate = join(directory, `.replace-${randomUUID()}.json`);
  await writePersistenceFile(candidate, replacement);
  if ((await readPersistenceFile(target)) !== expected) fail();
  await admit();
  finalCheck();
  await rename(candidate, target);
}
