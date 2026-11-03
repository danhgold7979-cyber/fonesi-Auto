import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createNativeSecretStore } from './secret-store.ts';
import type { SecretStore } from './secret-store.ts';
import type { NativeSecretProvider } from './secret-provider.ts';
import { assertBorrowedPersistenceLease, verifyPersistenceRoot } from './persistence-files.ts';
import type { PersistenceEntry } from './persistence-entry.ts';
import type { VaultAuditFields, LogHealth } from '../log-contract.ts';

// Main calls only after openPreparedPersistence certified the exact runtime,
// profile and original backup. This does not replace that admission with availability.
export async function openMainSecretStore(
  entry: PersistenceEntry,
  provider: NativeSecretProvider,
  audit: (fields: VaultAuditFields) => Promise<LogHealth>,
  closing: () => boolean,
): Promise<SecretStore> {
  const location = Object.freeze({ root: entry.root, parentToken: entry.parentToken });
  const ownerToken = entry.ownerToken,
    storeId = entry.storeId;
  const owned = async () => {
    if (closing()) throw new Error('OWNER_REVOKED');
    await assertBorrowedPersistenceLease(location, ownerToken);
    if (closing()) throw new Error('OWNER_REVOKED');
  };
  await owned();
  const provenance = await verifyPersistenceRoot(location);
  if (provenance.storeId !== storeId || provenance.kind !== 'FRESH')
    throw new Error('STORE_INVALID');
  let absent = false;
  try {
    await lstat(join(location.root, 'vault'));
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw new Error('STORE_INVALID');
    absent = true;
  }
  const store = createNativeSecretStore({
    root: location.root,
    storeId,
    assertOwned: owned,
    provider,
    audit,
  });
  try {
    if (absent) await store.initialize('FRESH');
    await store.verify();
    await owned();
    return store;
  } catch (error) {
    await store.close();
    throw error;
  }
}
