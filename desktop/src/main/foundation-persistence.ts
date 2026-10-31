import { join, dirname, basename, resolve } from 'node:path';
import { lstat, mkdir, open, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { FoundationDatabase, statement } from './foundation-database.ts';
import { BackupService, parseBackupReceipt } from './backup-service.ts';
import type { BackupReceipt, BackupLocation } from './backup-service.ts';
import type { BackupKeyAdapter } from './backup-container.ts';
import { BackupCatalog } from './backup-catalog.ts';
import {
  verifyPersistenceRoot,
  createPersistenceRoot,
  acquirePersistenceLease,
  assertBorrowedPersistenceLease,
  plainPersistenceDirectory,
  readPersistenceFile,
  writePersistenceFile,
  replacePersistenceFile,
} from './persistence-files.ts';
import type { PersistenceLocation } from './persistence-files.ts';
import { validBackupLocalState } from './backup-key-profile.ts';
import { diagnosticId } from '../log-contract.ts';
import { DATABASE_VERSION } from '../persistence-contract.ts';
import { parsePersistenceProof, proofMatchesWitness } from '../persistence-proof.ts';
import type { PersistenceProof } from '../persistence-proof.ts';
export type KeyDurabilityProof = PersistenceProof;
// Only the trusted supervisor records this after actual ordered native exit/tree
// evidence. Application children cannot advance the persisted proof themselves.
export class FoundationPersistence {
  readonly root: string;
  readonly storeId: string;
  readonly restored: boolean;
  readonly catalog: BackupCatalog;
  readonly backups: BackupService;
  private database: FoundationDatabase | null = null;
  private busy = false;
  private recoveryOnly = false;
  private stopping = false;
  private idleWaiters: (() => void)[] = [];
  private readonly owned: () => Promise<void>;
  private constructor(
    root: string,
    storeId: string,
    restored: boolean,
    catalog: BackupCatalog,
    backups: BackupService,
    owned: () => Promise<void>,
  ) {
    this.root = root;
    this.storeId = storeId;
    this.restored = restored;
    this.catalog = catalog;
    this.backups = backups;
    this.owned = owned;
  }
  static async open(
    location: PersistenceLocation,
    ownerToken: string,
    keys: BackupKeyAdapter,
    fresh: boolean,
  ): Promise<FoundationPersistence> {
    const admitted = Object.freeze({ root: location.root, parentToken: location.parentToken });
    const owned = () => assertBorrowedPersistenceLease(admitted, ownerToken);
    await owned();
    const provenance = await verifyPersistenceRoot(admitted),
      staging = join(admitted.root, 'staging');
    if (fresh) await mkdir(staging);
    else await plainPersistenceDirectory(staging);
    const catalog = fresh
      ? await BackupCatalog.initialize(
          admitted.root,
          provenance.storeId,
          owned,
          provenance.kind === 'RESTORED',
        )
      : await BackupCatalog.open(
          admitted.root,
          provenance.storeId,
          owned,
          provenance.kind === 'RESTORED',
        );
    const backups = new BackupService(
      {
        storeId: provenance.storeId,
        staging,
        assertOwned: async (target) => {
          await owned();
          const known = await catalog.location(target.locationId);
          if (known.directory !== target.directory) throw new Error('BACKUP_LOCATION_REPLACED');
        },
      },
      keys,
    );
    return new FoundationPersistence(
      admitted.root,
      provenance.storeId,
      provenance.kind === 'RESTORED',
      catalog,
      backups,
      owned,
    );
  }
  private async lane<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy || this.stopping) throw new Error('PERSISTENCE_BUSY');
    this.busy = true;
    try {
      await this.owned();
      return await operation();
    } finally {
      this.busy = false;
      for (const ready of this.idleWaiters.splice(0)) ready();
    }
  }
  private async registry(): Promise<BackupReceipt[]> {
    const raw = await readPersistenceFile(join(this.root, 'migration-backups.json'));
    let rows: unknown;
    try {
      rows = JSON.parse(raw);
    } catch {
      throw new Error('MIGRATION_REGISTRY_REJECTED');
    }
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 64)
      throw new Error('MIGRATION_REGISTRY_REJECTED');
    const receipts = rows.map((value) => parseBackupReceipt(JSON.stringify(value)));
    if (
      receipts.some(
        (value) =>
          !value ||
          value.header.storeId !== this.storeId ||
          value.header.reason !== 'PRE_MIGRATION',
      ) ||
      JSON.stringify(receipts) !== raw
    )
      throw new Error('MIGRATION_REGISTRY_REJECTED');
    return receipts as BackupReceipt[];
  }
  async provision(selectedParent: string, now: number): Promise<BackupReceipt> {
    return this.lane(async () => {
      if (this.recoveryOnly) throw new Error('DATABASE_NOT_READY');
      if (this.restored) throw new Error('RESTORED_PROVISION_REJECTED');
      await this.catalog.selectLocation(selectedParent, true, now);
      const target = await this.catalog.activeLocation();
      if (!target) throw new Error('BACKUP_LOCATION_REQUIRED');
      const database = new FoundationDatabase(
        join(this.root, 'staging', 'install.sqlite'),
        this.storeId,
      );
      try {
        if (database.version !== 0) throw new Error('PROVISION_VERSION_REJECTED');
        const receipt = await this.backups.create(database, target, 'PRE_MIGRATION', now);
        await writePersistenceFile(
          join(this.root, 'migration-backups.json'),
          JSON.stringify([receipt]),
        );
        return receipt;
      } finally {
        database.close();
      }
    });
  }
  async authenticateBootstrap(): Promise<BackupReceipt> {
    return this.lane(async () => {
      const receipt = (await this.registry())[0];
      if (!receipt) throw new Error('BOOTSTRAP_RECEIPT_MISSING');
      const current = await this.backups.validate(
        await this.catalog.location(receipt.header.locationId),
        receipt.header.backupId,
      );
      if (JSON.stringify(current) !== JSON.stringify(receipt))
        throw new Error('BOOTSTRAP_RECEIPT_CHANGED');
      return current;
    });
  }
  private async authenticateDurability(): Promise<BackupReceipt[]> {
    const receipts = await this.registry(),
      bootstrap = receipts[0];
    if (!bootstrap) throw new Error('BOOTSTRAP_RECEIPT_MISSING');
    try {
      const proof = parsePersistenceProof(
        await readPersistenceFile(join(this.root, 'key-durability-proof.json')),
      );
      if (
        !proof ||
        !proofMatchesWitness(proof, {
          storeId: this.storeId,
          backupId: bootstrap.header.backupId,
          locationId: bootstrap.header.locationId,
          encryptedSha256: bootstrap.encryptedSha256,
        })
      )
        throw new Error();
    } catch {
      throw new Error('KEY_DURABILITY_UNPROVEN');
    }
    const recovered = await this.backups.validate(
      await this.catalog.location(bootstrap.header.locationId),
      bootstrap.header.backupId,
    );
    if (JSON.stringify(recovered) !== JSON.stringify(bootstrap))
      throw new Error('BOOTSTRAP_RECEIPT_CHANGED');
    return receipts;
  }
  async initializeRecovery(): Promise<void> {
    return this.lane(async () => {
      if (this.database || this.recoveryOnly) throw new Error('DATABASE_ALREADY_OPEN');
      await this.authenticateDurability();
      this.recoveryOnly = true;
    });
  }
  async recoverySelection(path: string): Promise<BackupReceipt> {
    return this.lane(async () => {
      if (!this.recoveryOnly || typeof path !== 'string' || path !== resolve(path))
        throw new Error('RESTORE_ADMISSION_REJECTED');
      const name = basename(path),
        id = name.slice(7, -7);
      if (name !== `backup-${id}.fonaub` || !diagnosticId(id))
        throw new Error('BACKUP_SELECTION_REJECTED');
      const matches = (await this.catalog.knownLocations()).filter((r) =>
        process.platform === 'win32'
          ? r.absolutePath.toLowerCase() === dirname(path).toLowerCase()
          : r.absolutePath === dirname(path),
      );
      if (matches.length !== 1 || !matches[0]) throw new Error('BACKUP_SELECTION_REJECTED');
      return this.backups.validate(await this.catalog.location(matches[0].locationId), id);
    });
  }
  async restoreRecovery(
    receipt: BackupReceipt,
    parent: string,
    keyCheckpoint: string,
  ): Promise<string> {
    const selected = parseBackupReceipt(JSON.stringify(receipt));
    if (!selected) throw new Error('BACKUP_RECEIPT_REJECTED');
    return this.lane(async () => {
      if (!this.recoveryOnly) throw new Error('RESTORE_ADMISSION_REJECTED');
      const location = await this.catalog.location(selected.header.locationId);
      const current = await this.backups.validate(location, selected.header.backupId);
      if (JSON.stringify(current) !== JSON.stringify(selected))
        throw new Error('MAINTENANCE_SELECTION_CHANGED');
      return this.restoreValidated(
        location,
        selected.header.backupId,
        parent,
        keyCheckpoint,
        selected,
      );
    });
  }
  async initialize(now: number): Promise<void> {
    return this.lane(async () => {
      if (this.database || this.recoveryOnly) throw new Error('DATABASE_ALREADY_OPEN');
      const receipts = await this.authenticateDurability(),
        bootstrap = receipts[0];
      if (!bootstrap) throw new Error('BOOTSTRAP_RECEIPT_MISSING');
      const active = join(this.root, 'active.sqlite');
      let exists = false;
      try {
        await lstat(active);
        exists = true;
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
      }
      if (this.restored && !exists) throw new Error('RESTORED_DATABASE_MISSING');
      const database = new FoundationDatabase(
        exists ? active : join(this.root, 'staging', 'install.sqlite'),
        this.storeId,
      );
      if (this.restored && database.version > 0) {
        const state = statement(
          database.connection,
          'SELECT restore_quarantine FROM foundation_store',
          (s) => s.get(),
        );
        if (state?.restore_quarantine !== 1) {
          database.close();
          throw new Error('RESTORE_QUARANTINE_REQUIRED');
        }
      }
      if (exists && database.version === DATABASE_VERSION) {
        try {
          await this.catalog.reconcile(database);
          this.database = database;
          return;
        } catch (error) {
          database.close();
          throw error;
        }
      }
      try {
        await database.migrate(
          async (version) => {
            // Reuse only a reauthenticated exact schema0 snapshot with matching rows.
            if (version === 0) {
              if (database.fingerprint() !== bootstrap.fingerprint)
                throw new Error('BOOTSTRAP_WITNESS_CHANGED');
              return this.backups.prerequisite(bootstrap);
            }
            const target = await this.catalog.activeLocation();
            if (!target) throw new Error('BACKUP_LOCATION_REQUIRED');
            const receipt = await this.backups.create(database, target, 'PRE_MIGRATION', now);
            receipts.push(receipt);
            await replacePersistenceFile(
              join(this.root, 'migration-backups.json'),
              JSON.stringify(receipts),
            );
            return this.backups.prerequisite(receipt);
          },
          now,
          this.restored,
        );
        await this.catalog.mirrorLocations(database);
        for (const receipt of receipts)
          await this.catalog.importReceipt(database, this.backups, receipt);
        if (!exists) {
          const copy = join(this.root, 'staging', `activation-${randomUUID()}.sqlite`);
          const expectedFingerprint = database.fingerprint();
          await database.snapshot(copy);
          const validation = new FoundationDatabase(copy, this.storeId, true);
          try {
            if (
              validation.version !== database.version ||
              validation.fingerprint() !== expectedFingerprint
            )
              throw new Error('ACTIVATION_COPY_MISMATCH');
          } finally {
            validation.close();
          }
          const file = await open(copy, 'r+');
          try {
            await file.sync();
          } finally {
            await file.close();
          }
          await this.owned();
          try {
            await lstat(active);
            throw new Error('ACTIVE_DESTINATION_EXISTS');
          } catch (error) {
            if ((error as { code?: string }).code !== 'ENOENT') throw error;
          }
          await rename(copy, active);
        }
      } finally {
        database.close();
      }
      this.database = new FoundationDatabase(active, this.storeId);
      await this.catalog.reconcile(this.database);
    });
  }
  async backup(now: number, automatic = false): Promise<BackupReceipt | null> {
    return this.lane(async () => {
      const database = this.database;
      if (!database) throw new Error('DATABASE_NOT_READY');
      if (automatic && !(await this.catalog.admitDaily(database, now))) return null;
      const target = await this.catalog.activeLocation();
      if (!target) throw new Error('BACKUP_LOCATION_REQUIRED');
      const receipt = await this.backups.create(
        database,
        target,
        automatic ? 'DAILY' : 'MANUAL',
        now,
      );
      await this.catalog.importReceipt(database, this.backups, receipt);
      await this.catalog.prune(database, this.backups);
      return receipt;
    });
  }
  async acceptUpgrade(id: string, now: number): Promise<void> {
    return this.lane(async () => {
      if (!this.database || !diagnosticId(id)) throw new Error('UPGRADE_ADMISSION_REJECTED');
      await this.catalog.acceptUpgrade(this.database, this.backups, id, now);
    });
  }
  settingsAdapter(): Pick<
    FoundationDatabase,
    'readSettings' | 'readPreviousSettings' | 'commitSettings'
  > {
    const current = () => {
      if (
        !this.database ||
        this.stopping ||
        this.restored ||
        this.database.version !== DATABASE_VERSION
      )
        throw new Error('SETTINGS_RECOVERY_REQUIRED');
      return this.database;
    };
    current().readSettings();
    return Object.freeze({
      readSettings: () => current().readSettings(),
      readPreviousSettings: () => current().readPreviousSettings(),
      commitSettings: (expectedRevision, next, admit) =>
        current().commitSettings(expectedRevision, next, admit),
    });
  }
  async list(): Promise<readonly { backupId: string; reason: string; protected: boolean }[]> {
    return this.lane(async () => {
      if (!this.database) throw new Error('DATABASE_NOT_READY');
      this.database.validate();
      const rows = statement(
        this.database.connection,
        "SELECT backup_id,location_id,reason,protected FROM backup_record WHERE state='VALIDATED' ORDER BY snapshot_utc,backup_id",
        (s) => s.all(),
      );
      if (rows.length > 512) throw new Error('BACKUP_CATALOG_LIMIT');
      const result = [];
      for (const row of rows) {
        if (
          typeof row.backup_id !== 'string' ||
          typeof row.location_id !== 'string' ||
          typeof row.reason !== 'string'
        )
          throw new Error('BACKUP_CATALOG_REJECTED');
        await this.backups.validate(await this.catalog.location(row.location_id), row.backup_id);
        result.push(
          Object.freeze({
            backupId: row.backup_id,
            reason: row.reason,
            protected: row.protected === 1,
          }),
        );
      }
      return Object.freeze(result);
    });
  }
  async backupSelection(path: string): Promise<string> {
    return this.lane(async () => {
      if (!this.database || typeof path !== 'string' || path !== resolve(path))
        throw new Error('BACKUP_SELECTION_REJECTED');
      const name = basename(path),
        id = name.slice(7, -7);
      if (name !== `backup-${id}.fonaub` || !diagnosticId(id))
        throw new Error('BACKUP_SELECTION_REJECTED');
      const row = statement(
        this.database.connection,
        "SELECT location_id FROM backup_record WHERE backup_id=? AND state='VALIDATED'",
        (s) => s.get(id),
      );
      if (typeof row?.location_id !== 'string') throw new Error('BACKUP_SELECTION_REJECTED');
      const target = await this.catalog.location(row.location_id);
      const equal =
        process.platform === 'win32'
          ? dirname(path).toLowerCase() === target.directory.toLowerCase()
          : dirname(path) === target.directory;
      if (!equal) throw new Error('BACKUP_SELECTION_REJECTED');
      await this.backups.validate(target, id);
      return id;
    });
  }
  async restore(id: string, parent: string, keyCheckpoint: string): Promise<string> {
    return this.lane(async () => {
      if (!this.database || !diagnosticId(id)) throw new Error('RESTORE_ADMISSION_REJECTED');
      await plainPersistenceDirectory(parent);
      const record = statement(
        this.database.connection,
        "SELECT location_id FROM backup_record WHERE backup_id=? AND state='VALIDATED'",
        (s) => s.get(id),
      );
      if (typeof record?.location_id !== 'string') throw new Error('RESTORE_BACKUP_UNKNOWN');
      const location = await this.catalog.location(record.location_id);
      await this.backups.validate(location, id);
      return this.restoreValidated(location, id, parent, keyCheckpoint);
    });
  }
  private async restoreValidated(
    location: BackupLocation,
    id: string,
    parent: string,
    keyCheckpoint: string,
    expected?: BackupReceipt,
  ): Promise<string> {
    await plainPersistenceDirectory(parent);
    await this.owned();
    if (
      !keyCheckpoint.startsWith(join(this.root, 'key-checkpoint-')) ||
      !keyCheckpoint.endsWith('.json')
    )
      throw new Error('RESTORE_KEY_CHECKPOINT_REJECTED');
    const keyMaterial = await readPersistenceFile(keyCheckpoint);
    if (!validBackupLocalState(keyMaterial)) throw new Error('RESTORE_KEY_CHECKPOINT_REJECTED');
    const selected = join(parent, `fonesi-restore-${randomUUID()}`),
      parentToken = randomUUID();
    await mkdir(selected);
    await writePersistenceFile(join(selected, '.owner'), parentToken);
    const destination = { root: join(selected, `data-${this.storeId}`), parentToken };
    await createPersistenceRoot(destination, {
      version: 1,
      storeId: this.storeId,
      kind: 'RESTORED',
      restoreReceiptId: randomUUID(),
    });
    const lease = await acquirePersistenceLease(destination, randomUUID()),
      staging = join(destination.root, 'staging');
    // Failure preserves the new root and its lease for explicit stopped-owner recovery.
    await mkdir(staging);
    await this.backups.restoreToNew(location, id, {
      staging,
      active: join(destination.root, 'active.sqlite'),
      assertOwned: async () => {
        await this.owned();
        await lease.assertOwned();
        const currentLocation = await this.catalog.location(location.locationId);
        if (currentLocation.directory !== location.directory)
          throw new Error('BACKUP_LOCATION_REPLACED');
        if (expected) {
          const receipt = parseBackupReceipt(
            await readPersistenceFile(join(location.directory, `backup-${id}.json`)),
          );
          if (!receipt || JSON.stringify(receipt) !== JSON.stringify(expected))
            throw new Error('MAINTENANCE_SELECTION_CHANGED');
        }
      },
    });
    await writePersistenceFile(
      join(destination.root, 'backup-locations.json'),
      JSON.stringify(await this.catalog.config()),
    );
    await writePersistenceFile(
      join(destination.root, 'migration-backups.json'),
      await readPersistenceFile(join(this.root, 'migration-backups.json')),
    );
    await writePersistenceFile(
      join(destination.root, 'key-durability-proof.json'),
      await readPersistenceFile(join(this.root, 'key-durability-proof.json')),
    );
    await writePersistenceFile(
      join(destination.root, 'restore-source.json'),
      JSON.stringify({ version: 1, storeId: this.storeId, backupId: id }),
    );
    const profile = join(destination.root, 'key-profile');
    await mkdir(profile);
    await writePersistenceFile(
      join(profile, '.key-profile-owner.json'),
      JSON.stringify({ version: 1, storeId: this.storeId }),
    );
    await writePersistenceFile(join(profile, 'Local State'), keyMaterial);
    await lease.release();
    return destination.root;
  }
  async selectLocation(parent: string, now: number): Promise<void> {
    return this.lane(async () => {
      if (!this.database) throw new Error('DATABASE_NOT_READY');
      await this.catalog.selectLocation(parent, true, now);
      await this.catalog.mirrorLocations(this.database);
    });
  }
  async shutdown(): Promise<void> {
    this.stopping = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (this.busy)
        await Promise.race([
          new Promise<void>((ready) => this.idleWaiters.push(ready)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('PERSISTENCE_SHUTDOWN_TIMEOUT')), 120000);
          }),
        ]);
      this.close();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  close(): void {
    if (this.busy) throw new Error('PERSISTENCE_BUSY');
    this.database?.close();
    this.database = null;
  }
}
