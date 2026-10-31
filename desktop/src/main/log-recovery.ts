import { lstat, open, unlink, rmdir, rename, opendir } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diagnosticId } from '../log-contract.ts';
import { parseStoreDocument, STORE_DOCUMENT_BYTES, SEGMENT_BYTES } from '../log-store-schema.ts';
import { plainLogDirectory, readLogFile, logInventory } from './log-files.ts';
import type { LogLocation } from './log-files.ts';
export type RecoveryResult =
  | 'RECOVERED'
  | 'PRECONDITION_REQUIRED'
  | 'OWNERSHIP_REJECTED'
  | 'RECOVERY_FAILED';
// Maintenance-only. This caller assertion is NOT a proof that processes stopped.
// Trusted supervisor must verify whole owned tree retirement, or operator must
// stop/exclude all app owners/new launches throughout this offline operation.
export async function recoverLogStore(
  location: LogLocation,
  expectedStore: string,
  expectedOwner: string,
  allOwnersStoppedAndLaunchesExcluded: boolean,
): Promise<RecoveryResult> {
  if (allOwnersStoppedAndLaunchesExcluded !== true) return 'PRECONDITION_REQUIRED';
  if (
    !diagnosticId(expectedStore) ||
    !diagnosticId(expectedOwner) ||
    !diagnosticId(location.parentToken) ||
    location.root !== resolve(location.root) ||
    !/^logs-[a-z0-9-]+$/.test(basename(location.root))
  )
    return 'OWNERSHIP_REJECTED';
  try {
    await plainLogDirectory(dirname(location.root));
    await plainLogDirectory(location.root);
    if ((await readLogFile(join(dirname(location.root), '.owner'), 36)) !== location.parentToken)
      return 'OWNERSHIP_REJECTED';
    const owner = parseStoreDocument(
      await readLogFile(join(location.root, 'owner.json'), STORE_DOCUMENT_BYTES),
      'owner',
      expectedStore,
    );
    if (!owner) return 'OWNERSHIP_REJECTED';
    const names = await logInventory(location.root),
      lock = join(location.root, '.writer-lock');
    await plainLogDirectory(lock);
    const entries = await opendir(lock);
    let ownerPresent = false;
    try {
      const first = await entries.read(),
        second = await entries.read();
      if (second || (first && first.name !== 'owner.json')) return 'OWNERSHIP_REJECTED';
      ownerPresent = first !== null;
    } finally {
      await entries.close();
    }
    let identity: Record<string, unknown> | null = null;
    try {
      identity = parseStoreDocument(
        await readLogFile(join(lock, 'owner.json'), STORE_DOCUMENT_BYTES),
        'lock',
        expectedStore,
      );
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') return 'OWNERSHIP_REJECTED';
    }
    if (ownerPresent && identity === null) return 'OWNERSHIP_REJECTED';
    if (identity) {
      if (identity.ownerToken !== expectedOwner) return 'OWNERSHIP_REJECTED';
    } else {
      // Interrupted normal release or a previously persisted recovery receipt.
      let witnessed = false;
      if (names.includes('release.json')) {
        const receipt = parseStoreDocument(
          await readLogFile(join(location.root, 'release.json'), STORE_DOCUMENT_BYTES),
          'release',
          expectedStore,
        );
        witnessed = receipt?.ownerToken === expectedOwner;
      }
      for (const name of names.filter((value) => value.startsWith('recovery-'))) {
        const receipt = parseStoreDocument(
          await readLogFile(join(location.root, name), STORE_DOCUMENT_BYTES),
          'recovery',
          expectedStore,
        );
        if (receipt?.recoveryId !== name.slice(9, 45)) return 'RECOVERY_FAILED';
        if (receipt.previousOwnerToken === expectedOwner) witnessed = true;
      }
      if (!witnessed) return 'OWNERSHIP_REJECTED';
    }
    // Verify all committed schemas before any change. Preserve incomplete segments.
    for (const [name, kind] of [
      ['holds.json', 'holds'],
      ['state.json', 'state'],
    ] as const)
      if (
        !parseStoreDocument(
          await readLogFile(join(location.root, name), STORE_DOCUMENT_BYTES),
          kind,
          expectedStore,
        )
      )
        return 'RECOVERY_FAILED';
    if (names.includes('unfinished.json')) {
      const value = parseStoreDocument(
        await readLogFile(join(location.root, 'unfinished.json'), STORE_DOCUMENT_BYTES),
        'unfinished',
        expectedStore,
      );
      if (value?.ownerToken !== expectedOwner) return 'OWNERSHIP_REJECTED';
    }
    const segments = new Set<string>(),
      pendingIds: string[] = [];
    for (const name of names) {
      if (name.startsWith('segment-')) {
        const id = name.slice(8, 44);
        segments.add(id);
        if (name.endsWith('.meta.json')) {
          const value = parseStoreDocument(
            await readLogFile(join(location.root, name), STORE_DOCUMENT_BYTES),
            'segment',
            expectedStore,
          );
          if (value?.segmentId !== id) return 'RECOVERY_FAILED';
        } else await readLogFile(join(location.root, name), SEGMENT_BYTES);
      }
      if (name.startsWith('pending-')) {
        await readLogFile(join(location.root, name), STORE_DOCUMENT_BYTES);
        pendingIds.push(name.slice(8, 44));
      }
      if (name.startsWith('recovery-')) {
        const receipt = parseStoreDocument(
          await readLogFile(join(location.root, name), STORE_DOCUMENT_BYTES),
          'recovery',
          expectedStore,
        );
        if (receipt?.recoveryId !== name.slice(9, 45)) return 'RECOVERY_FAILED';
      }
    }
    const recoveryId = randomUUID(),
      document = {
        schemaVersion: 1,
        storeId: expectedStore,
        recoveryId,
        previousOwnerToken: expectedOwner,
        segmentIds: [...segments],
        pendingIds,
      },
      bytes = JSON.stringify(document) + '\n';
    if (!parseStoreDocument(bytes, 'recovery', expectedStore)) return 'RECOVERY_FAILED';
    const temp = join(location.root, `pending-${randomUUID()}.tmp`),
      destination = join(location.root, `recovery-${recoveryId}.json`);
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(bytes, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, destination);
    if ((await readLogFile(destination, STORE_DOCUMENT_BYTES)) !== bytes) return 'RECOVERY_FAILED';
    if (names.includes('unfinished.json')) await unlink(join(location.root, 'unfinished.json'));
    try {
      const stat = await lstat(join(lock, 'owner.json'));
      if (!stat.isFile() || stat.isSymbolicLink()) return 'OWNERSHIP_REJECTED';
      await unlink(join(lock, 'owner.json'));
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') return 'RECOVERY_FAILED';
    }
    await rmdir(lock);
    return 'RECOVERED';
  } catch {
    return 'RECOVERY_FAILED';
  }
}
