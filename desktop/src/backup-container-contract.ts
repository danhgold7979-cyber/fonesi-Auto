import { DATABASE_VERSION } from './persistence-contract.ts';
// Internal backup format only. Not renderer IPC or a portable-key promise.
export const BACKUP_MAGIC = 'FONAUB01';
export const BACKUP_HEADER_BYTES = 65536;
export const BACKUP_SNAPSHOT_BYTES = 64 * 1024 * 1024;
export type BackupReason = 'DAILY' | 'MANUAL' | 'PRE_MIGRATION';
export type BackupHeader = Readonly<{
  formatVersion: 1;
  storeId: string;
  locationId: string;
  backupId: string;
  keyRef: string;
  reason: BackupReason;
  snapshotUtc: number;
  schemaVersion: number;
  plaintextBytes: number;
  plaintextSha256: string;
  nonceBase64: string;
  wrappedKeyBase64: string;
}>;
export type BackupMetadata = Pick<
  BackupHeader,
  'storeId' | 'locationId' | 'backupId' | 'keyRef' | 'reason' | 'snapshotUtc' | 'schemaVersion'
>;
const id = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
export function canonicalBase64(value: unknown, minimum: number, maximum: number): value is string {
  if (
    typeof value !== 'string' ||
    value.length > BACKUP_HEADER_BYTES ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    return false;
  try {
    const bytes = atob(value);
    return bytes.length >= minimum && bytes.length <= maximum && btoa(bytes) === value;
  } catch {
    return false;
  }
}
export function parseBackupHeader(raw: string): BackupHeader | null {
  if (
    typeof raw !== 'string' ||
    raw.length > BACKUP_HEADER_BYTES ||
    new TextEncoder().encode(raw).length > BACKUP_HEADER_BYTES
  )
    return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (
      row.formatVersion !== 1 ||
      !id(row.storeId) ||
      !id(row.locationId) ||
      !id(row.backupId) ||
      !id(row.keyRef) ||
      !['DAILY', 'MANUAL', 'PRE_MIGRATION'].includes(row.reason as string) ||
      !integer(row.snapshotUtc) ||
      !integer(row.schemaVersion) ||
      row.schemaVersion > DATABASE_VERSION ||
      !integer(row.plaintextBytes) ||
      row.plaintextBytes < 1 ||
      row.plaintextBytes > BACKUP_SNAPSHOT_BYTES ||
      typeof row.plaintextSha256 !== 'string' ||
      row.plaintextSha256.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(row.plaintextSha256) ||
      !canonicalBase64(row.nonceBase64, 12, 12) ||
      !canonicalBase64(row.wrappedKeyBase64, 1, 49152)
    )
      return null;
    const header: BackupHeader = {
      formatVersion: 1,
      storeId: row.storeId,
      locationId: row.locationId,
      backupId: row.backupId,
      keyRef: row.keyRef,
      reason: row.reason as BackupReason,
      snapshotUtc: row.snapshotUtc,
      schemaVersion: row.schemaVersion,
      plaintextBytes: row.plaintextBytes,
      plaintextSha256: row.plaintextSha256,
      nonceBase64: row.nonceBase64,
      wrappedKeyBase64: row.wrappedKeyBase64,
    };
    // Exact reconstruction rejects duplicates (including escaped names), unknown keys,
    // alternate whitespace/order/number spellings and noncanonical base64.
    return JSON.stringify(header) === raw ? Object.freeze(header) : null;
  } catch {
    return null;
  }
}
