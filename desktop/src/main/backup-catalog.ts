import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { unlink, opendir, lstat } from 'node:fs/promises';
import { diagnosticId } from '../log-contract.ts';
import { epoch, DATABASE_VERSION } from '../persistence-contract.ts';
import { statement } from './foundation-database.ts';
import type { FoundationDatabase } from './foundation-database.ts';
import { parseBackupReceipt } from './backup-service.ts';
import type { BackupService, BackupReceipt, BackupLocation } from './backup-service.ts';
import {
  readPersistenceFile,
  writePersistenceFile,
  replacePersistenceFile,
  createBackupLocation,
  verifyBackupLocation,
} from './persistence-files.ts';
export type CatalogLocation = Readonly<{
  locationId: string;
  folderMarkerId: string;
  absolutePath: string;
  selectedUtc: number;
  state: 'ACTIVE' | 'RETIRED';
}>;
export type LocationConfig = Readonly<{
  version: 1;
  storeId: string;
  activeLocationId: string | null;
  locations: readonly CatalogLocation[];
}>;
function reject(): never {
  throw new Error('BACKUP_CATALOG_REJECTED');
}
export function parseLocationConfig(raw: string): LocationConfig | null {
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) return null;
    const v = JSON.parse(raw);
    if (
      v.version !== 1 ||
      !diagnosticId(v.storeId) ||
      !Array.isArray(v.locations) ||
      v.locations.length > 64
    )
      return null;
    const ids = new Set<string>(),
      markers = new Set<string>(),
      paths = new Set<string>();
    const locations: CatalogLocation[] = v.locations.map((r: CatalogLocation) => {
      if (
        !r ||
        !diagnosticId(r.locationId) ||
        !diagnosticId(r.folderMarkerId) ||
        typeof r.absolutePath !== 'string' ||
        r.absolutePath.length > 4096 ||
        r.absolutePath !== resolve(r.absolutePath) ||
        !epoch(r.selectedUtc) ||
        !['ACTIVE', 'RETIRED'].includes(r.state) ||
        ids.has(r.locationId) ||
        markers.has(r.folderMarkerId) ||
        paths.has(process.platform === 'win32' ? r.absolutePath.toLowerCase() : r.absolutePath)
      )
        reject();
      ids.add(r.locationId);
      markers.add(r.folderMarkerId);
      paths.add(process.platform === 'win32' ? r.absolutePath.toLowerCase() : r.absolutePath);
      return Object.freeze({
        locationId: r.locationId,
        folderMarkerId: r.folderMarkerId,
        absolutePath: r.absolutePath,
        selectedUtc: r.selectedUtc,
        state: r.state,
      });
    });
    const active = locations.filter((r) => r.state === 'ACTIVE');
    if (
      v.activeLocationId === null
        ? active.length !== 0
        : !diagnosticId(v.activeLocationId) ||
          active.length !== 1 ||
          active[0]?.locationId !== v.activeLocationId
    )
      return null;
    const config: LocationConfig = {
      version: 1,
      storeId: v.storeId,
      activeLocationId: v.activeLocationId,
      locations: Object.freeze(locations),
    };
    return JSON.stringify(config) === raw ? Object.freeze(config) : null;
  } catch {
    return null;
  }
}
// Main-only, caller owns the whole-root lease and serializes this adapter with DB/migration work.
// Persisted paths never leave this service for renderer/logging; no directory discovery/rebinding.
export class BackupCatalog {
  private busy = false;
  readonly root: string;
  readonly storeId: string;
  private readonly owned: () => Promise<void>;
  readonly restored: boolean;
  private constructor(
    root: string,
    storeId: string,
    owned: () => Promise<void>,
    restored: boolean,
  ) {
    this.root = root;
    this.storeId = storeId;
    this.owned = owned;
    this.restored = restored;
  }
  static async initialize(
    root: string,
    storeId: string,
    owned: () => Promise<void>,
    restored: boolean,
  ): Promise<BackupCatalog> {
    if (!diagnosticId(storeId) || typeof restored !== 'boolean') reject();
    await owned();
    await writePersistenceFile(
      join(root, 'backup-locations.json'),
      JSON.stringify({ version: 1, storeId, activeLocationId: null, locations: [] }),
    );
    const c = new BackupCatalog(root, storeId, owned, restored);
    await c.config();
    return c;
  }
  static async open(
    root: string,
    storeId: string,
    owned: () => Promise<void>,
    restored: boolean,
  ): Promise<BackupCatalog> {
    if (!diagnosticId(storeId) || typeof restored !== 'boolean') reject();
    const c = new BackupCatalog(root, storeId, owned, restored);
    await c.config();
    return c;
  }
  private async lane<T>(f: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('BACKUP_CATALOG_BUSY');
    this.busy = true;
    try {
      await this.owned();
      return await f();
    } finally {
      this.busy = false;
    }
  }
  async config(): Promise<LocationConfig> {
    await this.owned();
    const c = parseLocationConfig(
      await readPersistenceFile(join(this.root, 'backup-locations.json')),
    );
    if (!c || c.storeId !== this.storeId) reject();
    return c;
  }
  async knownLocations(): Promise<readonly CatalogLocation[]> {
    return (await this.config()).locations;
  }
  async activeLocation(): Promise<BackupLocation | null> {
    const c = await this.config();
    return c.activeLocationId === null ? null : this.location(c.activeLocationId);
  }
  async location(id: string): Promise<BackupLocation> {
    const c = await this.config();
    const row = c.locations.find((r) => r.locationId === id);
    if (!row) reject();
    await verifyBackupLocation(row.absolutePath, {
      version: 1,
      storeId: this.storeId,
      locationId: row.locationId,
      folderMarkerId: row.folderMarkerId,
    });
    return Object.freeze({ locationId: row.locationId, directory: row.absolutePath });
  }
  async selectLocation(
    parent: string | null,
    confirmed: boolean,
    now: number,
  ): Promise<string | null> {
    if (parent === null || confirmed === false) return null;
    if (confirmed !== true || typeof parent !== 'string' || !epoch(now)) reject();
    return this.lane(async () => {
      const c = await this.config();
      if (c.locations.length >= 64) reject();
      const locationId = randomUUID(),
        folderMarkerId = randomUUID();
      // Check bounded document before creating anything; actual path is deterministic.
      const absolutePath = join(parent, `backup-${folderMarkerId}`);
      const next = {
        version: 1,
        storeId: this.storeId,
        activeLocationId: locationId,
        locations: [
          ...c.locations.map((r) => ({ ...r, state: 'RETIRED' })),
          { locationId, folderMarkerId, absolutePath, selectedUtc: now, state: 'ACTIVE' },
        ],
      };
      const raw = JSON.stringify(next);
      if (!parseLocationConfig(raw)) reject();
      await createBackupLocation(parent, {
        version: 1,
        storeId: this.storeId,
        locationId,
        folderMarkerId,
      });
      await this.owned();
      await replacePersistenceFile(join(this.root, 'backup-locations.json'), raw);
      if (JSON.stringify(await this.config()) !== raw) reject();
      return locationId;
    });
  }
  private database(db: FoundationDatabase): void {
    if (db.storeId !== this.storeId || db.version < 2 || db.version > DATABASE_VERSION) reject();
    db.validate();
  }
  // Explicit mirror after location selection/migration. It never deletes old mappings.
  async mirrorLocations(db: FoundationDatabase): Promise<void> {
    return this.lane(async () => {
      this.database(db);
      const c = await this.config();
      for (const r of c.locations) await this.location(r.locationId);
      await this.owned();
      db.connection.exec('BEGIN IMMEDIATE');
      try {
        const existing = statement(db.connection, 'SELECT * FROM backup_location', (s) => s.all());
        for (const r of existing) {
          const match = c.locations.find((x) => x.locationId === r.location_id);
          if (
            !match ||
            match.folderMarkerId !== r.folder_marker_id ||
            match.selectedUtc !== r.selected_utc
          )
            reject();
        }
        for (const r of c.locations)
          statement(
            db.connection,
            'INSERT INTO backup_location VALUES(?,?,?,?) ON CONFLICT(location_id) DO UPDATE SET state=excluded.state',
            (s) => s.run(r.locationId, r.folderMarkerId, r.selectedUtc, r.state),
          );
        db.validate();
        db.connection.exec('COMMIT');
      } catch (e) {
        db.connection.exec('ROLLBACK');
        throw e;
      }
    });
  }
  async reconcile(db: FoundationDatabase): Promise<void> {
    this.database(db);
    const c = await this.config();
    const actual = statement(
      db.connection,
      'SELECT * FROM backup_location ORDER BY location_id',
      (s) => s.all(),
    );
    const expected = [...c.locations]
      .sort((a, b) => a.locationId.localeCompare(b.locationId))
      .map((r) => ({
        location_id: r.locationId,
        folder_marker_id: r.folderMarkerId,
        selected_utc: r.selectedUtc,
        state: r.state,
      }));
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('BACKUP_CATALOG_DISAGREEMENT');
  }
  async importReceipt(
    db: FoundationDatabase,
    service: BackupService,
    receipt: BackupReceipt,
  ): Promise<void> {
    const admitted = parseBackupReceipt(JSON.stringify(receipt));
    if (!admitted) reject();
    return this.lane(async () => {
      await this.reconcile(db);
      const loc = await this.location(admitted.header.locationId);
      const current = await service.validate(loc, admitted.header.backupId);
      if (
        JSON.stringify(current) !== JSON.stringify(admitted) ||
        current.header.storeId !== this.storeId
      )
        reject();
      await this.owned();
      db.connection.exec('BEGIN IMMEDIATE');
      try {
        const h = current.header;
        const oldRecord = statement(
          db.connection,
          'SELECT * FROM backup_record WHERE backup_id=?',
          (s) => s.get(h.backupId),
        );
        const oldValidation = statement(
          db.connection,
          'SELECT * FROM backup_validation WHERE backup_id=?',
          (s) => s.get(h.backupId),
        );
        if (oldRecord || oldValidation) {
          const expectedRecord = {
            backup_id: h.backupId,
            location_id: h.locationId,
            store_id: h.storeId,
            reason: h.reason,
            snapshot_utc: h.snapshotUtc,
            snapshot_schema: h.schemaVersion,
            filename: `backup-${h.backupId}.fonaub`,
            encrypted_sha256: current.encryptedSha256,
            key_ref: h.keyRef,
            protected: h.reason === 'PRE_MIGRATION' ? 1 : 0,
            state: 'VALIDATED',
          };
          const expectedValidation = {
            backup_id: h.backupId,
            validated_utc: current.validatedUtc,
            plaintext_sha256: h.plaintextSha256,
            validation_version: 1,
          };
          if (
            JSON.stringify(oldRecord) !== JSON.stringify(expectedRecord) ||
            JSON.stringify(oldValidation) !== JSON.stringify(expectedValidation)
          )
            throw new Error('BACKUP_IMPORT_DISAGREEMENT');
          db.validate();
          db.connection.exec('COMMIT');
          return;
        }
        statement(db.connection, 'INSERT INTO backup_record VALUES(?,?,?,?,?,?,?,?,?,?,?)', (s) =>
          s.run(
            h.backupId,
            h.locationId,
            h.storeId,
            h.reason,
            h.snapshotUtc,
            h.schemaVersion,
            `backup-${h.backupId}.fonaub`,
            current.encryptedSha256,
            h.keyRef,
            h.reason === 'PRE_MIGRATION' ? 1 : 0,
            'VALIDATED',
          ),
        );
        statement(db.connection, 'INSERT INTO backup_validation VALUES(?,?,?,?)', (s) =>
          s.run(h.backupId, current.validatedUtc, h.plaintextSha256, 1),
        );
        db.validate();
        db.connection.exec('COMMIT');
      } catch (e) {
        db.connection.exec('ROLLBACK');
        throw e;
      }
    });
  }
  async admitDaily(db: FoundationDatabase, now: number): Promise<boolean> {
    if (!epoch(now)) reject();
    return this.lane(async () => {
      this.database(db);
      if (this.restored) return false;
      await this.reconcile(db);
      const config = await this.config();
      if (config.activeLocationId === null) reject();
      await this.location(config.activeLocationId);
      await this.owned();
      db.connection.exec('BEGIN IMMEDIATE');
      try {
        const row = statement(
          db.connection,
          'SELECT restore_quarantine,last_auto_admitted_utc FROM foundation_store WHERE singleton=1',
          (s) => s.get(),
        );
        if (!row) reject();
        const last = row.last_auto_admitted_utc;
        const admit =
          row.restore_quarantine === 0 &&
          (last === null || (typeof last === 'number' && now >= last + 86400000));
        if (admit)
          statement(
            db.connection,
            'UPDATE foundation_store SET last_auto_admitted_utc=? WHERE singleton=1',
            (s) => s.run(now),
          );
        db.connection.exec('COMMIT');
        return admit;
      } catch (e) {
        db.connection.exec('ROLLBACK');
        throw e;
      }
    });
  }
  async acceptUpgrade(
    db: FoundationDatabase,
    service: BackupService,
    backupId: string,
    now: number,
  ): Promise<void> {
    if (!diagnosticId(backupId) || !epoch(now)) reject();
    return this.lane(async () => {
      await this.reconcile(db);
      const row = statement(db.connection, 'SELECT * FROM backup_record WHERE backup_id=?', (s) =>
        s.get(backupId),
      );
      if (
        row?.reason !== 'PRE_MIGRATION' ||
        row.protected !== 1 ||
        row.state !== 'VALIDATED' ||
        typeof row.location_id !== 'string'
      )
        reject();
      const loc = await this.location(row.location_id);
      const receipt = await service.validate(loc, backupId);
      if (
        receipt.header.reason !== 'PRE_MIGRATION' ||
        receipt.encryptedSha256 !== row.encrypted_sha256
      )
        reject();
      const raw = JSON.stringify({
        version: 1,
        storeId: this.storeId,
        backupId,
        encryptedSha256: receipt.encryptedSha256,
        acceptedUtc: now,
      });
      const path = join(this.root, `upgrade-acceptance-${backupId}.json`);
      await this.owned();
      await writePersistenceFile(path, raw);
      if ((await readPersistenceFile(path)) !== raw) reject();
      statement(
        db.connection,
        "UPDATE backup_record SET protected=0 WHERE backup_id=? AND reason='PRE_MIGRATION' AND protected=1",
        (s) => s.run(backupId),
      );
    });
  }
  private async acceptedSafety(id: string, hash: unknown): Promise<void> {
    const raw = await readPersistenceFile(join(this.root, `upgrade-acceptance-${id}.json`));
    let v: Record<string, unknown>;
    try {
      v = JSON.parse(raw);
    } catch {
      return reject();
    }
    if (
      v?.version !== 1 ||
      v.storeId !== this.storeId ||
      v.backupId !== id ||
      v.encryptedSha256 !== hash ||
      !epoch(v.acceptedUtc) ||
      JSON.stringify({
        version: 1,
        storeId: v.storeId,
        backupId: v.backupId,
        encryptedSha256: v.encryptedSha256,
        acceptedUtc: v.acceptedUtc,
      }) !== raw
    )
      reject();
  }
  private async directoryReconciliation(db: FoundationDatabase): Promise<void> {
    const config = await this.config();
    const rows = statement(db.connection, 'SELECT * FROM backup_record LIMIT 513', (s) => s.all());
    if (rows.length > 512) reject();
    for (const loc of config.locations) {
      const owned = await this.location(loc.locationId);
      const expected = new Set(['.backup-owner.json']);
      for (const row of rows) {
        if (row.location_id !== loc.locationId) continue;
        if (!diagnosticId(row.backup_id) || !['VALIDATED', 'RETIRED'].includes(String(row.state)))
          reject();
        const manifest = parseBackupReceipt(
          await readPersistenceFile(join(owned.directory, `backup-${row.backup_id}.json`)),
        );
        if (
          !manifest ||
          manifest.header.backupId !== row.backup_id ||
          manifest.header.locationId !== row.location_id ||
          manifest.header.storeId !== this.storeId ||
          manifest.header.reason !== row.reason ||
          manifest.header.snapshotUtc !== row.snapshot_utc ||
          manifest.header.schemaVersion !== row.snapshot_schema ||
          manifest.header.keyRef !== row.key_ref ||
          manifest.encryptedSha256 !== row.encrypted_sha256
        )
          throw new Error('BACKUP_DIRECTORY_UNRESOLVED');
        expected.add(`backup-${row.backup_id}.json`);
        if (row.state === 'VALIDATED') expected.add(`backup-${row.backup_id}.fonaub`);
      }
      const dir = await opendir(owned.directory);
      let count = 0;
      try {
        for (;;) {
          const entry = await dir.read();
          if (!entry) break;
          if (++count > 1025 || !expected.delete(entry.name))
            throw new Error('BACKUP_DIRECTORY_UNRESOLVED');
          const stat = await lstat(join(owned.directory, entry.name));
          if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error('BACKUP_DIRECTORY_UNRESOLVED');
        }
      } finally {
        await dir.close();
      }
      if (expected.size) throw new Error('BACKUP_DIRECTORY_UNRESOLVED');
    }
  }
  // Every known live copy is authenticated before any deletion; uncertainty preserves all copies.
  async prune(db: FoundationDatabase, service: BackupService): Promise<number> {
    return this.lane(async () => {
      await this.reconcile(db);
      await this.directoryReconciliation(db);
      const records = statement(
        db.connection,
        "SELECT * FROM backup_record WHERE state!='RETIRED' ORDER BY snapshot_utc,backup_id LIMIT 513",
        (s) => s.all(),
      );
      if (records.length > 512) reject();
      const ordinary: { id: string; path: string }[] = [];
      for (const r of records) {
        if (
          r.state !== 'VALIDATED' ||
          typeof r.backup_id !== 'string' ||
          typeof r.location_id !== 'string'
        )
          reject();
        const loc = await this.location(r.location_id);
        const receipt = await service.validate(loc, r.backup_id);
        const h = receipt.header;
        const validation = statement(
          db.connection,
          'SELECT * FROM backup_validation WHERE backup_id=?',
          (s) => s.get(r.backup_id as string),
        );
        if (
          h.storeId !== this.storeId ||
          h.reason !== r.reason ||
          h.snapshotUtc !== r.snapshot_utc ||
          h.schemaVersion !== r.snapshot_schema ||
          h.keyRef !== r.key_ref ||
          receipt.encryptedSha256 !== r.encrypted_sha256 ||
          r.filename !== `backup-${h.backupId}.fonaub` ||
          !validation ||
          validation.plaintext_sha256 !== h.plaintextSha256 ||
          validation.validated_utc !== receipt.validatedUtc ||
          validation.validation_version !== 1
        )
          reject();
        if (h.reason === 'PRE_MIGRATION') {
          if (r.protected === 0) await this.acceptedSafety(h.backupId, r.encrypted_sha256);
          else if (r.protected !== 1) reject();
          continue;
        }
        if (r.protected !== 0) reject();
        ordinary.push({ id: h.backupId, path: join(loc.directory, `backup-${h.backupId}.fonaub`) });
      }
      let count = 0;
      for (const item of ordinary.slice(0, Math.max(0, ordinary.length - 7))) {
        await this.owned();
        await unlink(item.path); // If later SQL update fails, missing file blocks subsequent pruning; never delete replacements.
        statement(
          db.connection,
          "UPDATE backup_record SET state='RETIRED' WHERE backup_id=? AND reason!='PRE_MIGRATION' AND protected=0",
          (s) => s.run(item.id),
        );
        count++;
      }
      return count;
    });
  }
}
