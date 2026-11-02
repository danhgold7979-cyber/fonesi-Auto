// Approved foundation/settings plus bounded durable registry/capture schema. No account/secret fields.
export const DATABASE_VERSION = 5;
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
  `CREATE TABLE app_settings_revision (
  slot TEXT PRIMARY KEY CHECK(slot IN ('CURRENT','PREVIOUS')),
  revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
  theme TEXT NOT NULL CHECK(theme IN ('LIGHT','DARK')),
  dock_width INTEGER CHECK(dock_width IS NULL OR dock_width BETWEEN 300 AND 16384),
  tile_width INTEGER NOT NULL CHECK(tile_width BETWEEN 70 AND 520),
  window_x INTEGER,
  window_y INTEGER,
  window_width INTEGER,
  window_height INTEGER,
  maximized INTEGER NOT NULL CHECK(maximized IN (0,1)),
  CHECK((window_x IS NULL AND window_y IS NULL AND window_width IS NULL AND window_height IS NULL)
    OR (window_x IS NOT NULL AND window_y IS NOT NULL AND window_width IS NOT NULL AND window_height IS NOT NULL
      AND window_x BETWEEN -2147483648 AND 2147483647
      AND window_y BETWEEN -2147483648 AND 2147483647
      AND window_width BETWEEN 1 AND 16384 AND window_height BETWEEN 1 AND 16384))
) STRICT;
INSERT INTO app_settings_revision VALUES('CURRENT',0,'LIGHT',NULL,150,NULL,NULL,NULL,NULL,0);`,
  `CREATE TABLE registry_meta (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
 host_epoch INTEGER NOT NULL CHECK(host_epoch BETWEEN 0 AND 9007199254740991),
 last_change_utc INTEGER CHECK(last_change_utc BETWEEN 0 AND 9007199254740991),
 last_operation_id TEXT,
 last_change_kind TEXT CHECK(last_change_kind IN('STARTUP','RECONCILE','DISPLAY','CAPTURE','HOLD','PRUNE')),
 CHECK((last_change_utc IS NULL AND last_operation_id IS NULL AND last_change_kind IS NULL)
    OR (last_change_utc IS NOT NULL AND last_operation_id IS NOT NULL AND last_change_kind IS NOT NULL))
) STRICT;
INSERT INTO registry_meta VALUES(1,0,0,NULL,NULL,NULL);
CREATE TABLE registry_device (
 device_id TEXT PRIMARY KEY NOT NULL,
 generation INTEGER NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991),
 display_profile_revision INTEGER NOT NULL CHECK(display_profile_revision BETWEEN 0 AND 9007199254740991),
 created_utc INTEGER NOT NULL CHECK(created_utc>=0),
 updated_utc INTEGER NOT NULL CHECK(updated_utc>=created_utc),
 last_seen_utc INTEGER CHECK(last_seen_utc>=0)
) STRICT;
CREATE TABLE registry_binding (
 binding_id TEXT PRIMARY KEY NOT NULL,
 device_id TEXT NOT NULL REFERENCES registry_device(device_id) ON DELETE RESTRICT,
 generation INTEGER NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991),
 serial TEXT NOT NULL,
 transport_id TEXT,
 source TEXT NOT NULL CHECK(source IN('ADB_DISCOVERY','SYNTHETIC_TEST')),
 last_state TEXT NOT NULL CHECK(last_state IN('DEVICE','UNAUTHORIZED','OFFLINE','UNKNOWN')),
 observed_utc INTEGER NOT NULL CHECK(observed_utc>=0),
 retired INTEGER NOT NULL CHECK(retired IN(0,1))
) STRICT;
CREATE TABLE registry_identity_evidence (
 evidence_id TEXT PRIMARY KEY NOT NULL,
 device_id TEXT NOT NULL REFERENCES registry_device(device_id) ON DELETE RESTRICT,
 observed_utc INTEGER NOT NULL CHECK(observed_utc>=0),
 source TEXT NOT NULL CHECK(source IN('ADB_DISCOVERY','SYNTHETIC_TEST')),
 identity_sha256 TEXT CHECK(identity_sha256 IS NULL OR length(identity_sha256)=64)
) STRICT;
CREATE TABLE capture_artifact (
 evidence_id TEXT PRIMARY KEY NOT NULL,
 device_id TEXT NOT NULL REFERENCES registry_device(device_id) ON DELETE RESTRICT,
 binding_id TEXT NOT NULL REFERENCES registry_binding(binding_id) ON DELETE RESTRICT,
 generation INTEGER NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991),
 display_profile_revision INTEGER NOT NULL CHECK(display_profile_revision BETWEEN 0 AND 9007199254740991),
 kind TEXT NOT NULL CHECK(kind IN('PNG','HIERARCHY_XML')),
 captured_utc INTEGER NOT NULL CHECK(captured_utc>=0),
 display_evidence_id TEXT NOT NULL,
 display_observed_utc INTEGER NOT NULL CHECK(display_observed_utc>=0),
 valid_until_utc INTEGER NOT NULL CHECK(valid_until_utc>=display_observed_utc),
 expires_utc INTEGER NOT NULL CHECK(expires_utc>=captured_utc),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 65535),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 65535),
 rotation INTEGER NOT NULL CHECK(rotation IN(0,90,180,270)),
 source TEXT NOT NULL CHECK(source IN('SYNTHETIC_TEST','VALIDATED_CAPTURE')),
 relative_name TEXT NOT NULL UNIQUE,
 sha256 TEXT CHECK(sha256 IS NULL OR length(sha256)=64),
 bytes INTEGER CHECK(bytes IS NULL OR bytes BETWEEN 1 AND 16777216),
 state TEXT NOT NULL CHECK(state IN('RESERVED','VALIDATED','STALE','DELETE_PENDING','DELETED','UNCERTAIN')),
 CHECK((sha256 IS NULL AND bytes IS NULL) OR (sha256 IS NOT NULL AND bytes IS NOT NULL))
) STRICT;
CREATE TABLE capture_hold (
 hold_id TEXT PRIMARY KEY NOT NULL,
 evidence_id TEXT NOT NULL REFERENCES capture_artifact(evidence_id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(reason IN('OUTCOME_UNKNOWN','RECONCILIATION'))
) STRICT;`,
  `CREATE TABLE device_session_association (
 evidence_id TEXT PRIMARY KEY NOT NULL REFERENCES registry_identity_evidence(evidence_id) ON DELETE RESTRICT,
 receipt_version INTEGER NOT NULL CHECK(receipt_version=1),
 receipt_json TEXT NOT NULL,
 transcript_sha256 TEXT NOT NULL CHECK(length(transcript_sha256)=64)
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
  app_settings_revision: 'slot',
  registry_meta: 'singleton',
  registry_device: 'device_id',
  registry_binding: 'binding_id',
  registry_identity_evidence: 'evidence_id',
  capture_artifact: 'evidence_id',
  capture_hold: 'hold_id',
  device_session_association: 'evidence_id',
} as const;
export const ORDINARY_BACKUP_LIMIT = 7;
export const AUTOMATIC_INTERVAL_MS = 86_400_000;
export function automaticDue(now: unknown, previous: unknown, quarantined: boolean): boolean {
  if (quarantined || !epoch(now) || (previous !== null && !epoch(previous))) return false;
  return previous === null || (now >= previous && now - previous >= AUTOMATIC_INTERVAL_MS);
}
