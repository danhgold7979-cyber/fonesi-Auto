import { createHash } from 'node:crypto';
import { certifiedPersistenceRuntime } from '../persistence-proof.ts';
import { openSync, readSync, closeSync, lstatSync, realpathSync, opendirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { diagnosticId } from '../log-contract.ts';
import { FoundationPersistence } from './foundation-persistence.ts';
import { backupKeys, validBackupLocalState } from './backup-key-profile.ts';
import type { AsyncKeyProvider } from './backup-key-profile.ts';
export type PersistenceEntry = Readonly<{
  root: string;
  parentToken: string;
  ownerToken: string;
  storeId: string;
  keyProfile: string;
  checkpoint: string;
  runtimeExeSha256: string;
}>;
function read(path: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
    throw new Error('PERSISTENCE_ENTRY_REJECTED');
  const fd = openSync(path, 'r');
  try {
    const value = Buffer.alloc(65537);
    let count = 0;
    while (count < value.length) {
      const n = readSync(fd, value, count, value.length - count, null);
      if (n === 0) break;
      count += n;
    }
    if (count > 65536) throw new Error('PERSISTENCE_ENTRY_REJECTED');
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(
      value.subarray(0, count),
    );
  } finally {
    closeSync(fd);
  }
}
function plain(path: string): void {
  const stat = lstatSync(path);
  const real = realpathSync(path),
    expected = resolve(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (process.platform === 'win32'
      ? real.toLowerCase() !== expected.toLowerCase()
      : real !== expected)
  )
    throw new Error('PERSISTENCE_ENTRY_REJECTED');
}
// Synchronous BEFORE native readiness. This accepts only a prepared production
// READY control, never verification stage flags or a renderer-provided location.
export function preparedPersistenceEntry(file: unknown): PersistenceEntry | undefined {
  if (file === undefined) return undefined;
  try {
    if (
      typeof file !== 'string' ||
      file !== resolve(file) ||
      basename(file) !== '.ready-launch.json'
    )
      throw new Error();
    const root = dirname(file);
    plain(root);
    plain(dirname(root));
    const raw = read(file),
      value = JSON.parse(raw);
    if (
      value.version !== 2 ||
      typeof value.runtimeExeSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(value.runtimeExeSha256) ||
      value.state !== 'READY' ||
      value.root !== root ||
      !diagnosticId(value.parentToken) ||
      !diagnosticId(value.ownerToken) ||
      !diagnosticId(value.storeId) ||
      typeof value.checkpoint !== 'string' ||
      !/^key-checkpoint-[0-9a-f-]{36}\.json$/.test(value.checkpoint) ||
      !diagnosticId(value.checkpoint.slice(15, -5))
    )
      throw new Error();
    const canonical = {
      version: 2,
      state: 'READY',
      root,
      parentToken: value.parentToken,
      ownerToken: value.ownerToken,
      storeId: value.storeId,
      checkpoint: value.checkpoint,
      runtimeExeSha256: value.runtimeExeSha256,
    };
    if (
      JSON.stringify(canonical) !== raw ||
      read(join(dirname(root), '.owner')) !== value.parentToken
    )
      throw new Error();
    const provenanceRaw = read(join(root, '.persistence-owner.json')),
      provenance = JSON.parse(provenanceRaw);
    if (
      provenance.storeId !== value.storeId ||
      provenance.version !== 1 ||
      !['FRESH', 'RESTORED'].includes(provenance.kind)
    )
      throw new Error();
    if (
      provenanceRaw !==
      JSON.stringify({
        version: 1,
        storeId: value.storeId,
        kind: provenance.kind,
        restoreReceiptId: provenance.restoreReceiptId,
      })
    )
      throw new Error();
    if (provenance.kind === 'FRESH') {
      if (provenance.restoreReceiptId !== null) throw new Error();
      try {
        lstatSync(join(root, '.restore-receipt.json'));
        throw new Error();
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
      }
    } else {
      if (
        !diagnosticId(provenance.restoreReceiptId) ||
        read(join(root, '.restore-receipt.json')) !==
          JSON.stringify({
            version: 1,
            storeId: value.storeId,
            restoreReceiptId: provenance.restoreReceiptId,
            quarantined: true,
          })
      )
        throw new Error();
    }
    const lock = join(root, '.writer-lock');
    plain(lock);
    const entries = opendirSync(lock);
    try {
      if (entries.readSync()?.name !== 'owner.json' || entries.readSync() !== null)
        throw new Error();
    } finally {
      entries.closeSync();
    }
    if (
      read(join(lock, 'owner.json')) !==
      JSON.stringify({ version: 1, storeId: value.storeId, ownerToken: value.ownerToken })
    )
      throw new Error();
    const keyProfile = join(root, 'key-profile');
    plain(keyProfile);
    if (
      read(join(keyProfile, '.key-profile-owner.json')) !==
      JSON.stringify({ version: 1, storeId: value.storeId })
    )
      throw new Error();
    const localState = read(join(keyProfile, 'Local State'));
    if (!validBackupLocalState(localState) || localState !== read(join(root, value.checkpoint)))
      throw new Error();
    return Object.freeze({
      root,
      parentToken: value.parentToken,
      ownerToken: value.ownerToken,
      storeId: value.storeId,
      keyProfile,
      checkpoint: join(root, value.checkpoint),
      runtimeExeSha256: value.runtimeExeSha256,
    });
  } catch {
    throw new Error('PERSISTENCE_ENTRY_REJECTED');
  }
}
// Production-only native admission. The trusted launcher derives the expected
// executable hash from its verified official distribution; the app rechecks it.
// reviewedBuildVerified is supplied only after main has checked every bundle hash.
export function assertCertifiedPersistenceEntry(
  entry: PersistenceEntry,
  reviewedBuildVerified: boolean,
): void {
  const stat = lstatSync(process.execPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024 * 1024)
    throw new Error('PERSISTENCE_RUNTIME_UNCERTIFIED');
  const fd = openSync(process.execPath, 'r'),
    hash = createHash('sha256'),
    chunk = Buffer.alloc(65536);
  let total = 0;
  try {
    for (;;) {
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      total += count;
      if (total > stat.size) throw new Error('PERSISTENCE_RUNTIME_UNCERTIFIED');
      hash.update(chunk.subarray(0, count));
    }
  } finally {
    closeSync(fd);
  }
  if (
    !certifiedPersistenceRuntime({
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron ?? '',
      node: process.versions.node,
      chrome: process.versions.chrome ?? '',
      provenance: {
        officialDistributionVerified:
          total === stat.size && hash.digest('hex') === entry.runtimeExeSha256,
        reviewedKeyProfileImplementation: reviewedBuildVerified === true,
      },
    })
  )
    throw new Error('PERSISTENCE_RUNTIME_UNCERTIFIED');
}
export async function openPreparedPersistence(
  entry: PersistenceEntry,
  provider: AsyncKeyProvider,
  now: number,
  reviewedBuildVerified: boolean,
): Promise<FoundationPersistence> {
  assertCertifiedPersistenceEntry(entry, reviewedBuildVerified);
  const app = await FoundationPersistence.open(
    { root: entry.root, parentToken: entry.parentToken },
    entry.ownerToken,
    await backupKeys(provider),
    false,
  );
  try {
    await app.initialize(now);
    return app;
  } catch (error) {
    app.close();
    throw error;
  }
}

export function configurePersistenceSession(
  app: Readonly<{ isReady: () => boolean; setPath: (name: 'sessionData', value: string) => void }>,
  entry: PersistenceEntry | undefined,
): void {
  if (!entry) return;
  if (app.isReady()) throw new Error('PERSISTENCE_PROFILE_TOO_LATE');
  app.setPath('sessionData', entry.keyProfile);
}
