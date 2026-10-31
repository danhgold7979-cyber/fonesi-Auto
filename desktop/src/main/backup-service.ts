import { randomUUID } from 'node:crypto';
import { open, lstat, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { FoundationDatabase, statement } from './foundation-database.ts';
import type { BackupPrerequisite } from './foundation-database.ts';
import { encryptSnapshot, decryptSnapshot } from './backup-container.ts';
import type { BackupKeyAdapter } from './backup-container.ts';
import { parseBackupHeader } from '../backup-container-contract.ts';
import type { BackupHeader, BackupReason } from '../backup-container-contract.ts';
import { checksum, epoch } from '../persistence-contract.ts';
import { diagnosticId } from '../log-contract.ts';
export type BackupReceipt = Readonly<{
  version: 1;
  header: BackupHeader;
  encryptedSha256: string;
  fingerprint: string;
  validatedUtc: number;
}>;
export type BackupLocation = Readonly<{ locationId: string; directory: string }>;
// These are main-owned handles, never IPC input. The owner validates its persistent
// lease, canonical directories and exact location marker on every operation.
export type BackupAuthority = Readonly<{
  storeId: string;
  staging: string;
  assertOwned: (location: BackupLocation) => Promise<void>;
}>;
export function parseBackupReceipt(raw: string): BackupReceipt | null {
  if (typeof raw !== 'string' || raw.length > 65536) return null;
  try {
    const row = JSON.parse(raw);
    const header = parseBackupHeader(JSON.stringify(row.header));
    if (
      row.version !== 1 ||
      !header ||
      !checksum(row.encryptedSha256) ||
      !checksum(row.fingerprint) ||
      !epoch(row.validatedUtc)
    )
      return null;
    const result: BackupReceipt = {
      version: 1,
      header,
      encryptedSha256: row.encryptedSha256,
      fingerprint: row.fingerprint,
      validatedUtc: row.validatedUtc,
    };
    return JSON.stringify(result) === raw ? result : null;
  } catch {
    return null;
  }
}
async function exclusiveDocument(path: string, raw: string): Promise<void> {
  if (Buffer.byteLength(raw) > 65536) throw new Error('BACKUP_RECEIPT_LIMIT');
  const file = await open(path, 'wx');
  try {
    await file.writeFile(raw, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
}
async function receiptFile(path: string): Promise<BackupReceipt> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
    throw new Error('BACKUP_RECEIPT_REJECTED');
  const file = await open(path, 'r');
  let raw: string;
  try {
    const bytes = Buffer.alloc(65537);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, null);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    if (offset > 65536) throw new Error('BACKUP_RECEIPT_LIMIT');
    raw = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, offset),
    );
  } finally {
    await file.close();
  }
  const receipt = parseBackupReceipt(raw);
  if (!receipt) throw new Error('BACKUP_RECEIPT_REJECTED');
  return receipt;
}
async function removeSettledSnapshot(path: string): Promise<void> {
  // SQLite read-only validation of a WAL-mode standalone snapshot may create
  // empty -wal/-shm files. All handles are closed before this exact owned cleanup.
  for (const target of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('SNAPSHOT_CLEANUP_REJECTED');
      await unlink(target);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
  }
}
export class BackupService {
  private busy = false;
  readonly authority: BackupAuthority;
  readonly keys: BackupKeyAdapter;
  constructor(authority: BackupAuthority, keys: BackupKeyAdapter) {
    if (!diagnosticId(authority.storeId)) throw new Error('BACKUP_OWNER_REJECTED');
    this.authority = Object.freeze({
      storeId: authority.storeId,
      staging: authority.staging,
      assertOwned: authority.assertOwned,
    });
    this.keys = Object.freeze({ wrap: keys.wrap, unwrap: keys.unwrap });
  }
  private async lane<T>(
    location: BackupLocation,
    operation: (location: BackupLocation) => Promise<T>,
  ): Promise<T> {
    if (this.busy || !diagnosticId(location.locationId)) throw new Error('BACKUP_BUSY_OR_LOCATION');
    const admitted = Object.freeze({
      locationId: location.locationId,
      directory: location.directory,
    });
    this.busy = true;
    try {
      await this.authority.assertOwned(admitted);
      return await operation(admitted);
    } finally {
      this.busy = false;
    }
  }
  private validatePlain(path: string, expectedVersion: number, expectedFingerprint: string): void {
    const database = new FoundationDatabase(path, this.authority.storeId, true);
    try {
      if (database.version !== expectedVersion || database.fingerprint() !== expectedFingerprint)
        throw new Error('BACKUP_SNAPSHOT_CHANGED');
    } finally {
      database.close();
    }
  }
  async create(
    database: FoundationDatabase,
    location: BackupLocation,
    reason: BackupReason,
    now: number,
  ): Promise<BackupReceipt> {
    return this.lane(location, async (location) => {
      if (
        database.storeId !== this.authority.storeId ||
        !epoch(now) ||
        !['DAILY', 'MANUAL', 'PRE_MIGRATION'].includes(reason)
      )
        throw new Error('BACKUP_ADMISSION_REJECTED');
      const id = randomUUID(),
        keyRef = randomUUID(),
        snapshot = join(this.authority.staging, `snapshot-${id}.sqlite`),
        validation = join(this.authority.staging, `validation-${id}.sqlite`);
      const temporary = join(location.directory, `pending-${id}.fonaub`),
        destination = join(location.directory, `backup-${id}.fonaub`),
        receiptPath = join(location.directory, `backup-${id}.json`);
      const fingerprint = database.fingerprint(),
        version = database.version;
      await database.snapshot(snapshot);
      this.validatePlain(snapshot, version, fingerprint);
      const encrypted = await encryptSnapshot(
        snapshot,
        temporary,
        {
          storeId: this.authority.storeId,
          locationId: location.locationId,
          backupId: id,
          keyRef,
          reason,
          snapshotUtc: now,
          schemaVersion: version,
        },
        this.keys,
      );
      if (!encrypted.ok) throw new Error(encrypted.code);
      const verified = await decryptSnapshot(temporary, validation, this.keys);
      if (!verified.ok) throw new Error(verified.code);
      if (
        verified.encryptedSha256 !== encrypted.encryptedSha256 ||
        JSON.stringify(verified.header) !== JSON.stringify(encrypted.header)
      )
        throw new Error('BACKUP_VALIDATION_MISMATCH');
      this.validatePlain(validation, version, fingerprint);
      await this.authority.assertOwned(location);
      // Generated destination is checked without treating dangling links as absent.
      try {
        await lstat(destination);
        throw new Error('BACKUP_DESTINATION_EXISTS');
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
      }
      await rename(temporary, destination);
      const receipt: BackupReceipt = {
        version: 1,
        header: encrypted.header,
        encryptedSha256: encrypted.encryptedSha256,
        fingerprint,
        validatedUtc: now,
      };
      await exclusiveDocument(receiptPath, JSON.stringify(receipt));
      if (JSON.stringify(await receiptFile(receiptPath)) !== JSON.stringify(receipt))
        throw new Error('BACKUP_RECEIPT_READBACK');
      // Success-only private staging cleanup; failures preserve uncertainty, never
      // remove an existing good backup. No secure-erasure/power-loss claim.
      await removeSettledSnapshot(snapshot);
      await removeSettledSnapshot(validation);
      return receipt;
    });
  }
  async validate(location: BackupLocation, id: string): Promise<BackupReceipt> {
    return this.lane(location, async (location) => {
      if (!diagnosticId(id)) throw new Error('BACKUP_ID_REJECTED');
      const receipt = await receiptFile(join(location.directory, `backup-${id}.json`));
      if (
        receipt.header.backupId !== id ||
        receipt.header.locationId !== location.locationId ||
        receipt.header.storeId !== this.authority.storeId
      )
        throw new Error('BACKUP_IDENTITY_MISMATCH');
      const validation = join(this.authority.staging, `validation-${randomUUID()}.sqlite`);
      const verified = await decryptSnapshot(
        join(location.directory, `backup-${id}.fonaub`),
        validation,
        this.keys,
      );
      if (!verified.ok) throw new Error(verified.code);
      if (
        verified.encryptedSha256 !== receipt.encryptedSha256 ||
        JSON.stringify(verified.header) !== JSON.stringify(receipt.header)
      )
        throw new Error('BACKUP_RECEIPT_MISMATCH');
      this.validatePlain(validation, receipt.header.schemaVersion, receipt.fingerprint);
      await removeSettledSnapshot(validation);
      return receipt;
    });
  }
  async restoreToNew(
    location: BackupLocation,
    id: string,
    target: Readonly<{ staging: string; active: string; assertOwned: () => Promise<void> }>,
  ): Promise<BackupReceipt> {
    const admitted = Object.freeze({
      staging: target.staging,
      active: target.active,
      assertOwned: target.assertOwned,
    });
    return this.lane(location, async (location) => {
      if (!diagnosticId(id)) throw new Error('BACKUP_ID_REJECTED');
      await admitted.assertOwned();
      const receipt = await receiptFile(join(location.directory, `backup-${id}.json`));
      if (
        receipt.header.backupId !== id ||
        receipt.header.storeId !== this.authority.storeId ||
        receipt.header.locationId !== location.locationId
      )
        throw new Error('BACKUP_IDENTITY_MISMATCH');
      const path = join(admitted.staging, `restore-${randomUUID()}.sqlite`);
      const decoded = await decryptSnapshot(
        join(location.directory, `backup-${id}.fonaub`),
        path,
        this.keys,
      );
      if (!decoded.ok) throw new Error(decoded.code);
      if (
        decoded.encryptedSha256 !== receipt.encryptedSha256 ||
        JSON.stringify(decoded.header) !== JSON.stringify(receipt.header)
      )
        throw new Error('BACKUP_RECEIPT_MISMATCH');
      this.validatePlain(path, receipt.header.schemaVersion, receipt.fingerprint);
      const database = new FoundationDatabase(path, this.authority.storeId);
      let fingerprint: string;
      try {
        if (database.version > 0) {
          database.connection.exec('BEGIN IMMEDIATE');
          try {
            statement(
              database.connection,
              'UPDATE foundation_store SET restore_quarantine=1,restored_from_backup_id=? WHERE singleton=1',
              (s) => s.run(id),
            );
            database.connection.exec('COMMIT');
          } catch (error) {
            try {
              database.connection.exec('ROLLBACK');
            } catch {
              /* Retain uncertain new root. */
            }
            throw error;
          }
        }
        fingerprint = database.fingerprint();
        await admitted.assertOwned();
        await database.snapshot(admitted.active);
      } finally {
        database.close();
      }
      this.validatePlain(admitted.active, receipt.header.schemaVersion, fingerprint);
      await removeSettledSnapshot(path);
      return receipt;
    });
  }
  prerequisite(receipt: BackupReceipt): BackupPrerequisite {
    if (
      receipt.header.reason !== 'PRE_MIGRATION' ||
      receipt.header.storeId !== this.authority.storeId
    )
      throw new Error('BACKUP_PREREQUISITE_REJECTED');
    return {
      backupId: receipt.header.backupId,
      fingerprint: receipt.fingerprint,
      schemaVersion: receipt.header.schemaVersion,
    };
  }
}
