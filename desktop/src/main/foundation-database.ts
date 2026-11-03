import { DatabaseSync, backup } from 'node:sqlite';
import type { StatementSync, SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, resolve, win32 } from 'node:path';
import { MIGRATIONS, TABLES, DATABASE_VERSION, epoch, checksum } from '../persistence-contract.ts';
import { diagnosticId } from '../log-contract.ts';
import { snapshotSettings, type SettingsSnapshot } from '../settings-contract.ts';
import {
  DURABLE_COLUMNS,
  DURABLE_LIMITS,
  snapshotDurable,
  snapshotDurableDelta,
  snapshotHistoricalDurableV4,
  applyDurableDelta,
  type DurableSnapshot,
  type DurableCommitResult,
} from './durable-contract.ts';
// Internal main-only adapter. Caller holds the persistent data-root lease. No SQL
// or path is accepted from renderer IPC; the integrated owner verifies the root.
// Physical SQLite spelling only: logical ownership/identity paths remain unchanged.
// Pinned default Windows VFS has a 1040-byte buffer. Reserve 64 bytes for
// SQLite sidecars plus NUL; this deliberately does not promise unlimited paths.
export function sqliteFilename(filename: string, platform: string = process.platform): string {
  if (platform !== 'win32') return filename;
  const physical = win32.toNamespacedPath(filename);
  if (Buffer.byteLength(physical, 'utf8') + 64 + 1 > 1040) throw new Error('DATABASE_PATH_LIMIT');
  return physical;
}
type ClosableStatement = StatementSync & { close: () => void };
export function statement<T>(
  db: DatabaseSync,
  sql: string,
  operation: (value: StatementSync) => T,
): T {
  const value = db.prepare(sql) as ClosableStatement;
  if (typeof value.close !== 'function') throw new Error('SQLITE_FINALIZATION_UNAVAILABLE');
  try {
    return operation(value);
  } finally {
    value.close();
  }
}
const rows = (db: DatabaseSync, sql: string, values: SQLInputValue[] = []) =>
  statement(db, sql, (s) => {
    s.setReadBigInts(true);
    return s.all(...values);
  });
function entry(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    return undefined;
  }
}
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export const MIGRATION_HASHES = MIGRATIONS.map(sha);
function scalar(value: unknown): readonly string[] {
  if (value === null) return ['null'];
  if (typeof value === 'string') return ['text', value];
  if (typeof value === 'bigint') return ['integer', value.toString()];
  throw new Error('SQLITE_VALUE_REJECTED');
}
function settingsRow(row: Record<string, unknown>): SettingsSnapshot {
  const numeric = (key: string) => (typeof row[key] === 'bigint' ? Number(row[key]) : row[key]);
  const value = snapshotSettings({
    revision: numeric('revision'),
    theme: row.theme,
    dockWidth: numeric('dock_width'),
    tileWidth: numeric('tile_width'),
    normalBounds:
      row.window_x === null &&
      row.window_y === null &&
      row.window_width === null &&
      row.window_height === null
        ? null
        : {
            x: numeric('window_x'),
            y: numeric('window_y'),
            width: numeric('window_width'),
            height: numeric('window_height'),
          },
    maximized: row.maximized === 1n ? true : row.maximized === 0n ? false : null,
  });
  if (!value) throw new Error('SETTINGS_RECOVERY_REQUIRED');
  return value;
}
function visibleTable(name: string, version: number): boolean {
  if (version < 1) return false;
  if (name === 'device_session_association') return version >= 5;
  if (Object.hasOwn(DURABLE_COLUMNS, name)) return version >= 4;
  if (name === 'app_settings_revision') return version >= 3;
  return version >= 2 || ['foundation_store', 'schema_migration'].includes(name);
}
function validateRows(name: string, data: Record<string, unknown>[], version: number): void {
  if (name === 'app_settings_revision') {
    if (
      data.length < 1 ||
      data.length > 2 ||
      data.filter((r) => r.slot === 'CURRENT').length !== 1 ||
      data.some((r) => !['CURRENT', 'PREVIOUS'].includes(String(r.slot)))
    )
      throw new Error('SETTINGS_RECOVERY_REQUIRED');
    const current = data.find((r) => r.slot === 'CURRENT');
    if (!current) throw new Error('SETTINGS_RECOVERY_REQUIRED');
    const present = settingsRow(current);
    if (present.revision > 0 !== data.some((r) => r.slot === 'PREVIOUS'))
      throw new Error('SETTINGS_RECOVERY_REQUIRED');
    for (const row of data) {
      const checked = settingsRow(row);
      if (row.slot === 'PREVIOUS' && checked.revision >= present.revision)
        throw new Error('SETTINGS_RECOVERY_REQUIRED');
    }
    return;
  }
  for (const row of data)
    for (const [field, value] of Object.entries(row)) {
      if (value === null) {
        if (!['restored_from_backup_id', 'last_auto_admitted_utc'].includes(field))
          throw new Error('DATABASE_VALUE_REJECTED');
        continue;
      }
      if (field === 'singleton') {
        if (value !== 1n) throw new Error('DATABASE_VALUE_REJECTED');
        continue;
      }
      if (
        field.endsWith('_utc') ||
        ['version', 'snapshot_schema', 'validation_version'].includes(field)
      ) {
        if (typeof value !== 'bigint' || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
          throw new Error('DATABASE_VALUE_REJECTED');
        if (field === 'snapshot_schema' && value > BigInt(version))
          throw new Error('DATABASE_VALUE_REJECTED');
        continue;
      }
      if (['restore_quarantine', 'protected'].includes(field)) {
        if (value !== 0n && value !== 1n) throw new Error('DATABASE_VALUE_REJECTED');
        continue;
      }
      if (field.endsWith('_id') || field === 'key_ref') {
        if (!diagnosticId(value)) throw new Error('DATABASE_VALUE_REJECTED');
        continue;
      }
      if (field.endsWith('_sha256')) {
        if (!checksum(value)) throw new Error('DATABASE_VALUE_REJECTED');
        continue;
      }
      if (field === 'filename') {
        if (
          typeof value !== 'string' ||
          value.length !== 50 ||
          !/^backup-[0-9a-f-]{36}\.fonaub$/.test(value) ||
          !diagnosticId(value.slice(7, 43))
        )
          throw new Error('DATABASE_VALUE_REJECTED');
        continue;
      }
      if (field === 'reason') {
        if (typeof value !== 'string' || !['DAILY', 'MANUAL', 'PRE_MIGRATION'].includes(value))
          throw new Error('DATABASE_VALUE_REJECTED');
        continue;
      }
      if (field === 'state') {
        if (
          typeof value !== 'string' ||
          !(
            name === 'backup_location' ? ['ACTIVE', 'RETIRED'] : ['VALIDATED', 'MISSING', 'RETIRED']
          ).includes(value)
        )
          throw new Error('DATABASE_VALUE_REJECTED');
        continue;
      }
      throw new Error('DATABASE_FIELD_REJECTED');
    }
}
export type BackupPrerequisite = Readonly<{
  backupId: string;
  fingerprint: string;
  schemaVersion: number;
}>;
export type BackupProvider = (version: number) => Promise<BackupPrerequisite>;
export class FoundationDatabase {
  readonly connection: DatabaseSync;
  private closed = false;
  private migrating = false;
  private settingsUncertain = false;
  private durableUncertain = false;
  readonly filename: string;
  readonly storeId: string;
  constructor(filename: string, storeId: string, readOnly = false) {
    this.filename = filename;
    this.storeId = storeId;
    if (
      !diagnosticId(storeId) ||
      filename !== resolve(filename) ||
      realpathSync(dirname(filename)) !== dirname(filename)
    )
      throw new Error('DATABASE_LOCATION_REJECTED');
    const stat = entry(filename);
    if (stat) {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024)
        throw new Error('DATABASE_FILE_REJECTED');
    } else if (readOnly) throw new Error('DATABASE_MISSING');
    this.connection = new DatabaseSync(sqliteFilename(filename), {
      readOnly,
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      defensive: true,
      timeout: 1000,
    });
    try {
      this.validate(); // Refuse unsupported content before persistent journal-policy changes.
      if (!readOnly) {
        this.connection.exec(
          'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;',
        );
      }
      if (rows(this.connection, 'PRAGMA foreign_keys')[0]?.foreign_keys !== 1n)
        throw new Error('DATABASE_POLICY_FAILED');
      if (
        !readOnly &&
        (rows(this.connection, 'PRAGMA journal_mode')[0]?.journal_mode !== 'wal' ||
          rows(this.connection, 'PRAGMA synchronous')[0]?.synchronous !== 2n)
      )
        throw new Error('DATABASE_POLICY_FAILED');
      this.validate();
    } catch {
      this.connection.close();
      this.closed = true;
      throw new Error('DATABASE_INVALID');
    }
  }
  get version(): number {
    const value = rows(this.connection, 'PRAGMA user_version')[0]?.user_version;
    if (typeof value !== 'bigint' || value < 0n || value > BigInt(DATABASE_VERSION))
      throw new Error('DATABASE_VERSION_UNSUPPORTED');
    return Number(value);
  }
  validate(): void {
    const version = this.version;
    const actual = rows(
      this.connection,
      "SELECT name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY name",
    );
    const expected = MIGRATIONS.slice(0, version)
      .flatMap((sql) =>
        sql
          .split(';')
          .map((value) => value.trim())
          .filter((value) => value.startsWith('CREATE TABLE ')),
      )
      .map((sql) => {
        const name = /^CREATE TABLE ([a-z_]+) /.exec(sql)?.[1];
        if (!name) throw new Error('SCHEMA_DEFINITION');
        return { name, sql };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('DATABASE_SCHEMA_MISMATCH');
    if (
      rows(this.connection, 'PRAGMA integrity_check').some((row) => row.integrity_check !== 'ok') ||
      rows(this.connection, 'PRAGMA foreign_key_check').length !== 0
    )
      throw new Error('DATABASE_INTEGRITY_FAILED');
    for (const name of Object.keys(TABLES)) {
      if (!visibleTable(name, version) || Object.hasOwn(DURABLE_COLUMNS, name)) continue;
      validateRows(name, rows(this.connection, `SELECT * FROM ${name}`), version);
    }
    if (version >= 4) this.durableRows();
    if (version > 0) {
      const identities = rows(this.connection, 'SELECT * FROM foundation_store');
      if (
        identities.length !== 1 ||
        identities[0]?.singleton !== 1n ||
        identities[0]?.store_id !== this.storeId
      )
        throw new Error('DATABASE_IDENTITY_MISMATCH');
      const history = rows(this.connection, 'SELECT * FROM schema_migration ORDER BY version');
      if (
        history.length !== version ||
        history.some(
          (row, index) =>
            row.version !== BigInt(index + 1) ||
            row.script_sha256 !== MIGRATION_HASHES[index] ||
            !diagnosticId(row.prerequisite_backup_id),
        )
      )
        throw new Error('DATABASE_HISTORY_MISMATCH');
    }
  }
  fingerprint(): string {
    this.validate();
    const hash = createHash('sha256');
    hash.update(`version:${this.version}\n`);
    for (const [name, key] of Object.entries(TABLES)) {
      if (!visibleTable(name, this.version)) continue;
      const schema = rows(this.connection, 'SELECT sql FROM sqlite_schema WHERE name=?', [name])[0]
        ?.sql;
      hash.update(JSON.stringify([name, schema]));
      // Identifiers are fixed constants above, never caller-provided SQL fragments.
      for (const row of rows(this.connection, `SELECT * FROM ${name} ORDER BY ${key}`))
        hash.update(
          JSON.stringify(Object.entries(row).map(([column, value]) => [column, scalar(value)])),
        );
    }
    return hash.digest('hex');
  }
  async migrate(provider: BackupProvider, now: number, quarantined = false): Promise<void> {
    if (this.closed || this.migrating || !epoch(now))
      throw new Error('MIGRATION_ADMISSION_REJECTED');
    this.migrating = true;
    try {
      while (this.version < DATABASE_VERSION) {
        const version = this.version;
        // Real integration must supply a validated encrypted backup backed by a
        // provisioned key profile. This trusted callback is not an IPC proof token.
        const prerequisite = await provider(version);
        if (
          !diagnosticId(prerequisite.backupId) ||
          !checksum(prerequisite.fingerprint) ||
          prerequisite.schemaVersion !== version
        )
          throw new Error('BACKUP_PREREQUISITE_REJECTED');
        this.connection.exec('BEGIN IMMEDIATE');
        try {
          if (this.version !== version || this.fingerprint() !== prerequisite.fingerprint)
            throw new Error('BACKUP_WITNESS_CHANGED');
          this.connection.exec(MIGRATIONS[version] ?? '');
          if (version === 0)
            statement(
              this.connection,
              'INSERT INTO foundation_store VALUES(1,?,?,?,NULL,NULL)',
              (s) => s.run(this.storeId, now, quarantined ? 1 : 0),
            );
          statement(this.connection, 'INSERT INTO schema_migration VALUES(?,?,?,?)', (s) =>
            s.run(version + 1, MIGRATION_HASHES[version] ?? '', now, prerequisite.backupId),
          );
          this.connection.exec(`PRAGMA user_version=${version + 1}`);
          this.connection.exec('COMMIT');
        } catch (error) {
          try {
            this.connection.exec('ROLLBACK');
          } catch {
            /* Preserve uncertain files, never reset. */
          }
          throw error;
        }
        this.validate();
      }
    } finally {
      this.migrating = false;
    }
  }
  readSettings(): SettingsSnapshot {
    this.validate();
    if (this.closed || this.version < 3 || this.settingsUncertain || this.durableUncertain)
      throw new Error('SETTINGS_RECOVERY_REQUIRED');
    const value = rows(
      this.connection,
      "SELECT * FROM app_settings_revision WHERE slot='CURRENT'",
    )[0];
    if (!value) throw new Error('SETTINGS_RECOVERY_REQUIRED');
    return settingsRow(value);
  }
  readPreviousSettings(): SettingsSnapshot | null {
    this.readSettings();
    const value = rows(
      this.connection,
      "SELECT * FROM app_settings_revision WHERE slot='PREVIOUS'",
    )[0];
    return value ? settingsRow(value) : null;
  }
  commitSettings(
    expectedRevision: number,
    nextInput: SettingsSnapshot,
    admit: () => void,
  ):
    | { ok: true; value: SettingsSnapshot }
    | { ok: false; code: 'CONFLICT' | 'WRITE_FAILED' | 'OUTCOME_UNKNOWN' | 'RECOVERY_REQUIRED' } {
    const next = snapshotSettings(nextInput);
    if (
      this.closed ||
      this.migrating ||
      this.settingsUncertain ||
      this.durableUncertain ||
      !epoch(expectedRevision) ||
      expectedRevision === Number.MAX_SAFE_INTEGER ||
      !next ||
      next.revision !== expectedRevision + 1 ||
      typeof admit !== 'function'
    )
      return { ok: false, code: 'RECOVERY_REQUIRED' };
    let transaction = false,
      commitStarted = false,
      admissionError: unknown,
      admissionFailed = false;
    try {
      this.readSettings();
      this.connection.exec('BEGIN IMMEDIATE');
      transaction = true;
      if (this.readSettings().revision !== expectedRevision) {
        this.connection.exec('ROLLBACK');
        transaction = false;
        return { ok: false, code: 'CONFLICT' };
      }
      this.connection.exec(
        "DELETE FROM app_settings_revision WHERE slot='PREVIOUS'; INSERT INTO app_settings_revision SELECT 'PREVIOUS',revision,theme,dock_width,tile_width,window_x,window_y,window_width,window_height,maximized FROM app_settings_revision WHERE slot='CURRENT';",
      );
      const b = next.normalBounds;
      statement(
        this.connection,
        "UPDATE app_settings_revision SET revision=?,theme=?,dock_width=?,tile_width=?,window_x=?,window_y=?,window_width=?,window_height=?,maximized=? WHERE slot='CURRENT'",
        (q) =>
          q.run(
            next.revision,
            next.theme,
            next.dockWidth,
            next.tileWidth,
            b?.x ?? null,
            b?.y ?? null,
            b?.width ?? null,
            b?.height ?? null,
            next.maximized ? 1 : 0,
          ),
      );
      this.validate();
      try {
        admit();
      } catch (error) {
        admissionFailed = true;
        admissionError = error;
        throw error;
      }
      commitStarted = true;
      this.connection.exec('COMMIT');
      transaction = false;
      return { ok: true, value: this.readSettings() };
    } catch {
      if (transaction) {
        try {
          this.connection.exec('ROLLBACK');
          transaction = false;
        } catch {
          this.settingsUncertain = true;
        }
      }
      if (commitStarted || this.settingsUncertain) {
        this.settingsUncertain = true;
        return { ok: false, code: 'OUTCOME_UNKNOWN' };
      }
      if (admissionFailed) throw admissionError;
      return { ok: false, code: 'WRITE_FAILED' };
    }
  }
  private durableRows(): DurableSnapshot {
    const read = (table: keyof typeof DURABLE_COLUMNS, max: number) =>
      rows(this.connection, `SELECT * FROM ${table} LIMIT ${max + 1}`).map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            typeof v === 'bigint'
              ? v >= 0n && v <= BigInt(Number.MAX_SAFE_INTEGER)
                ? Number(v)
                : NaN
              : v,
          ]),
        ),
      );
    const meta = read('registry_meta', 1);
    const historical = {
      meta: meta.length === 1 ? meta[0] : null,
      devices: read('registry_device', DURABLE_LIMITS.devices),
      bindings: read('registry_binding', DURABLE_LIMITS.bindings),
      identityEvidence: read('registry_identity_evidence', DURABLE_LIMITS.identityEvidence),
      captures: read('capture_artifact', DURABLE_LIMITS.captures),
      holds: read('capture_hold', DURABLE_LIMITS.holds),
    };
    const value =
      this.version === 4
        ? snapshotHistoricalDurableV4(historical)
        : snapshotDurable({
            ...historical,
            associationReceipts: read(
              'device_session_association',
              DURABLE_LIMITS.associationReceipts,
            ),
          });
    if (!value) throw new Error('DURABLE_RECOVERY_REQUIRED');
    return value;
  }
  readDurable(): DurableSnapshot {
    if (
      this.closed ||
      this.migrating ||
      this.durableUncertain ||
      this.settingsUncertain ||
      (this.version !== 4 && this.version !== DATABASE_VERSION)
    )
      throw new Error('DURABLE_RECOVERY_REQUIRED');
    this.validate();
    return this.durableRows();
  }
  commitDurable(
    expectedRevision: number,
    deltaInput: unknown,
    admit: () => void,
  ): DurableCommitResult {
    const delta = snapshotDurableDelta(deltaInput);
    if (
      this.closed ||
      this.migrating ||
      this.durableUncertain ||
      this.settingsUncertain ||
      this.version !== DATABASE_VERSION ||
      !epoch(expectedRevision) ||
      expectedRevision === Number.MAX_SAFE_INTEGER ||
      !delta ||
      typeof admit !== 'function'
    )
      return { ok: false, code: 'RECOVERY_REQUIRED' };
    let transaction = false,
      commitStarted = false,
      admissionFailed = false,
      admissionError: unknown;
    try {
      this.readDurable();
      this.connection.exec('BEGIN IMMEDIATE');
      transaction = true;
      const before = this.readDurable();
      if (before.meta.revision !== expectedRevision) {
        this.connection.exec('ROLLBACK');
        transaction = false;
        return { ok: false, code: 'CONFLICT' };
      }
      const next = applyDurableDelta(before, delta);
      if (!next) throw new Error('DURABLE_DELTA_REJECTED');
      // Closed table/column inventory only; no caller SQL. Replace within one FK-safe transaction.
      for (const table of [
        'device_session_association',
        'capture_hold',
        'capture_artifact',
        'registry_identity_evidence',
        'registry_binding',
        'registry_device',
        'registry_meta',
      ] as const)
        this.connection.exec(`DELETE FROM ${table}`);
      const values = {
        registry_meta: [next.meta],
        registry_device: next.devices,
        registry_binding: next.bindings,
        registry_identity_evidence: next.identityEvidence,
        capture_artifact: next.captures,
        capture_hold: next.holds,
        device_session_association: next.associationReceipts,
      };
      for (const table of Object.keys(DURABLE_COLUMNS) as (keyof typeof DURABLE_COLUMNS)[]) {
        const columns = DURABLE_COLUMNS[table];
        const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
        statement(this.connection, sql, (q) => {
          for (const row of values[table])
            q.run(
              ...columns.map((k) => (row as unknown as Record<string, SQLInputValue>)[k] ?? null),
            );
        });
      }
      this.validate();
      if (delta.associationReceipts.insert.length) {
        const pages = rows(this.connection, 'PRAGMA page_count')[0]?.page_count,
          size = rows(this.connection, 'PRAGMA page_size')[0]?.page_size;
        if (
          typeof pages !== 'bigint' ||
          typeof size !== 'bigint' ||
          pages < 0n ||
          size <= 0n ||
          pages * size > 64n * 1024n * 1024n
        )
          throw new Error('DURABLE_SIZE_LIMIT');
      }
      try {
        admit();
      } catch (error) {
        admissionFailed = true;
        admissionError = error;
        throw error;
      }
      commitStarted = true;
      this.connection.exec('COMMIT');
      transaction = false;
      return { ok: true, value: this.readDurable() };
    } catch {
      if (transaction) {
        try {
          this.connection.exec('ROLLBACK');
          transaction = false;
        } catch {
          this.durableUncertain = true;
        }
      }
      if (commitStarted || this.durableUncertain) {
        this.durableUncertain = true;
        return { ok: false, code: 'OUTCOME_UNKNOWN' };
      }
      if (admissionFailed) throw admissionError;
      return { ok: false, code: 'WRITE_FAILED' };
    }
  }
  async snapshot(destination: string): Promise<number> {
    if (
      this.closed ||
      this.settingsUncertain ||
      this.durableUncertain ||
      destination !== resolve(destination) ||
      realpathSync(dirname(destination)) !== dirname(destination) ||
      entry(destination) !== undefined
    )
      throw new Error('SNAPSHOT_DESTINATION_REJECTED');
    this.validate();
    const pages = rows(this.connection, 'PRAGMA page_count')[0]?.page_count,
      size = rows(this.connection, 'PRAGMA page_size')[0]?.page_size;
    if (typeof pages !== 'bigint' || typeof size !== 'bigint' || pages * size > 64n * 1024n * 1024n)
      throw new Error('SNAPSHOT_LIMIT');
    return backup(this.connection, sqliteFilename(destination), {
      source: 'main',
      target: 'main',
      rate: 100,
    });
  }
  close(): void {
    if (!this.closed) {
      this.connection.close();
      this.closed = true;
    }
  }
}
