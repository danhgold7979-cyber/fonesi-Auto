// Approved foundation-only schema. No domain, account, device or secret columns.
export const DATABASE_VERSION = 2;
export const MIGRATIONS = [
  `CREATE TABLE foundation_store (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 store_id TEXT NOT NULL UNIQUE,
 created_utc INTEGER NOT NULL CHECK(created_utc>=0),
 restore_quarantine INTEGER NOT NULL CHECK(restore_quarantine IN(0,1)),
 restored_from_backup_id TEXT,
 last_auto_admitted_utc INTEGER CHECK(last_auto_admitted_utc>=0)
) STRICT;
CREATE TABLE schema_migration (
 version INTEGER PRIMARY KEY CHECK(version>0),
 script_sha256 TEXT NOT NULL CHECK(length(script_sha256)=64),
 applied_utc INTEGER NOT NULL CHECK(applied_utc>=0),
 prerequisite_backup_id TEXT NOT NULL
) STRICT;`,
  `CREATE TABLE backup_location (
 location_id TEXT PRIMARY KEY NOT NULL,
 folder_marker_id TEXT NOT NULL UNIQUE,
 selected_utc INTEGER NOT NULL CHECK(selected_utc>=0),
 state TEXT NOT NULL CHECK(state IN('ACTIVE','RETIRED'))
) STRICT;
CREATE TABLE backup_record (
 backup_id TEXT PRIMARY KEY NOT NULL,
 location_id TEXT NOT NULL REFERENCES backup_location(location_id) ON DELETE RESTRICT,
 store_id TEXT NOT NULL REFERENCES foundation_store(store_id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(reason IN('DAILY','MANUAL','PRE_MIGRATION')),
 snapshot_utc INTEGER NOT NULL CHECK(snapshot_utc>=0),
 snapshot_schema INTEGER NOT NULL CHECK(snapshot_schema>=0),
 filename TEXT NOT NULL UNIQUE,
 encrypted_sha256 TEXT NOT NULL CHECK(length(encrypted_sha256)=64),
 key_ref TEXT NOT NULL,
 protected INTEGER NOT NULL CHECK(protected IN(0,1)),
 state TEXT NOT NULL CHECK(state IN('VALIDATED','MISSING','RETIRED'))
) STRICT;
CREATE TABLE backup_validation (
 backup_id TEXT PRIMARY KEY NOT NULL REFERENCES backup_record(backup_id) ON DELETE RESTRICT,
 validated_utc INTEGER NOT NULL CHECK(validated_utc>=0),
 plaintext_sha256 TEXT NOT NULL CHECK(length(plaintext_sha256)=64),
 validation_version INTEGER NOT NULL CHECK(validation_version=1)
) STRICT;`,
] as const;
export const MAINTENANCE_ARGUMENTS = [
  '--maintenance=backup-now',
  '--maintenance=list-backups',
  '--maintenance=restore-to-new',
  '--maintenance=accept-upgrade',
  '--maintenance=select-backup-folder',
] as const;
export type MaintenanceArgument = (typeof MAINTENANCE_ARGUMENTS)[number];
export function maintenanceArgument(
  args: readonly string[],
): MaintenanceArgument | 'NORMAL' | null {
  if (args.length === 0) return 'NORMAL';
  if (args.length !== 1) return null;
  return MAINTENANCE_ARGUMENTS.find((value) => value === args[0]) ?? null;
}
export function epoch(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
  );
}
export function checksum(value: unknown): value is string {
  return typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value);
}
export const TABLES = {
  foundation_store: 'singleton',
  schema_migration: 'version',
  backup_location: 'location_id',
  backup_record: 'backup_id',
  backup_validation: 'backup_id',
} as const;
export const ORDINARY_BACKUP_LIMIT = 7;
export const AUTOMATIC_INTERVAL_MS = 86_400_000;
export function automaticDue(now: unknown, previous: unknown, quarantined: boolean): boolean {
  if (quarantined || !epoch(now) || (previous !== null && !epoch(previous))) return false;
  return previous === null || (now >= previous && now - previous >= AUTOMATIC_INTERVAL_MS);
}
