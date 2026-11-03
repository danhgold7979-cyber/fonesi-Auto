import { mkdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diagnosticId } from '../log-contract.ts';
import {
  plainPersistenceDirectory,
  readPersistenceFile,
  writePersistenceFile,
} from './persistence-files.ts';
import type { BackupKeyAdapter } from './backup-container.ts';
export type AsyncKeyProvider = Readonly<{
  isAsyncEncryptionAvailable: () => Promise<boolean>;
  encryptStringAsync: (value: string) => Promise<Buffer>;
  decryptStringAsync: (value: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>;
}>;
// Narrow adapter only; availability is not proof of old ciphertext recovery.
export async function backupKeys(provider: AsyncKeyProvider): Promise<BackupKeyAdapter> {
  if ((await provider.isAsyncEncryptionAvailable()) !== true)
    throw new Error('BACKUP_KEY_UNAVAILABLE');
  return Object.freeze({
    wrap: async (value: string) => {
      const encrypted = await provider.encryptStringAsync(value);
      if (!Buffer.isBuffer(encrypted) || encrypted.length === 0 || encrypted.length > 49152)
        throw new Error('BACKUP_KEY_UNAVAILABLE');
      return encrypted;
    },
    unwrap: async (value: Uint8Array) => {
      const decrypted = await provider.decryptStringAsync(Buffer.from(value));
      if (
        !decrypted ||
        typeof decrypted.result !== 'string' ||
        typeof decrypted.shouldReEncrypt !== 'boolean'
      )
        throw new Error('BACKUP_KEY_UNAVAILABLE');
      return { result: decrypted.result, shouldReEncrypt: decrypted.shouldReEncrypt };
    },
  });
}
export type KeyProfile = Readonly<{ directory: string; checkpoint: string | null }>;
// Invoked before app.ready/setPath(sessionData). The supervisor retains its lease
// through native process exit and verified tree retirement; this helper never releases it.
export async function prepareBackupKeyProfile(
  root: string,
  storeId: string,
  fresh: boolean,
  assertLease: () => Promise<void>,
): Promise<KeyProfile> {
  if (!diagnosticId(storeId)) throw new Error('KEY_PROFILE_ID_REJECTED');
  await assertLease();
  await plainPersistenceDirectory(root);
  const directory = join(root, 'key-profile'),
    marker = join(directory, '.key-profile-owner.json');
  const identity = JSON.stringify({ version: 1, storeId });
  if (fresh) {
    // mkdir is exclusive: never reinterpret an existing/missing provisioned profile as fresh.
    await mkdir(directory);
    await writePersistenceFile(marker, identity);
    return Object.freeze({ directory, checkpoint: null });
  }
  await plainPersistenceDirectory(directory);
  if ((await readPersistenceFile(marker)) !== identity) throw new Error('KEY_PROFILE_ID_REJECTED');
  const path = join(directory, 'Local State'),
    stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 65536)
    throw new Error('KEY_PROFILE_MATERIAL_REJECTED');
  const raw = await readPersistenceFile(path);
  // Structural validation does not establish usability. Old-backup authentication
  // after native initialization is the separate mandatory positive control.
  if (!validBackupLocalState(raw)) throw new Error('KEY_PROFILE_MATERIAL_REJECTED');
  const checkpoint = join(root, `key-checkpoint-${randomUUID()}.json`);
  await assertLease();
  await writePersistenceFile(checkpoint, raw);
  if ((await readPersistenceFile(checkpoint)) !== raw)
    throw new Error('KEY_PROFILE_CHECKPOINT_FAILED');
  return Object.freeze({ directory, checkpoint });
}

export function validBackupLocalState(raw: string): boolean {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) return false;
  try {
    const parsed = JSON.parse(raw),
      encrypted = parsed?.os_crypt?.encrypted_key;
    // Chromium 156.0.8078.49 dpapi_key_provider.cc:25,65-84. This is
    // preflight shape only, not CryptUnprotectData or old-backup usability proof.
    if (typeof encrypted !== 'string' || encrypted.length > 65536) throw new Error();
    const bytes = Buffer.from(encrypted, 'base64');
    if (
      bytes.length <= 5 ||
      bytes.toString('base64') !== encrypted ||
      !bytes.subarray(0, 5).equals(Buffer.from('DPAPI', 'ascii'))
    )
      throw new Error();
    return true;
  } catch {
    return false;
  }
}
