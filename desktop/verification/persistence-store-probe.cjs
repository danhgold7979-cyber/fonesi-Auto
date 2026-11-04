'use strict';
// Verification-only entry. No production env flag or migration fault hook is added.
const { app, safeStorage } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { FoundationDatabase, statement } = require('../build/foundation-database.cjs');
const { BackupService, parseBackupReceipt } = require('../build/backup-service.cjs');
const { backupKeys, validBackupLocalState } = require('../build/backup-key-profile.cjs');
const { FoundationPersistence } = require('../build/foundation-persistence.cjs');
const { prepareOwnedProfile } = require('../build/profile-owner.cjs');
const { assertBorrowedPersistenceLease } = require('../build/persistence-files.cjs');
const {
  parseControl,
  parseDurabilityProof,
  caseNames,
  validateResult,
  installCommitCrash,
  observeReadOnlyWrite,
} = require('./persistence-store-contract.cjs');
function plain(p) {
  const s = fs.lstatSync(p),
    eq = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (
    !path.isAbsolute(p) ||
    path.resolve(p) !== p ||
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    !eq(fs.realpathSync(p), p)
  )
    throw new Error('STORE_OWNER');
}
function read(p) {
  plain(path.dirname(p));
  const s = fs.lstatSync(p);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('STORE_FILE');
  const fd = fs.openSync(p, 'r');
  try {
    const b = Buffer.alloc(65537);
    let n = 0;
    while (n < b.length) {
      const count = fs.readSync(fd, b, n, b.length - n, null);
      if (!count) break;
      n += count;
    }
    if (n > 65536) throw new Error('STORE_FILE');
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(b.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}
function write(p, value) {
  plain(path.dirname(p));
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > 65536) throw new Error('STORE_OUTPUT');
  const fd = fs.openSync(p, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function primaryWitness(dataRoot) {
  const result = {};
  for (const name of ['active.sqlite', 'active.sqlite-wal', 'active.sqlite-shm']) {
    const target = path.join(dataRoot, name);
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch (e) {
      if (e.code === 'ENOENT' && name !== 'active.sqlite') {
        result[name] = null;
        continue;
      }
      throw e;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 67108864)
      throw new Error('STORE_PRIMARY');
    const fd = fs.openSync(target, 'r');
    try {
      const sha = createHash('sha256'),
        chunk = Buffer.alloc(65536);
      let size = 0;
      for (;;) {
        const count = fs.readSync(fd, chunk, 0, chunk.length, null);
        if (!count) break;
        size += count;
        if (size > 67108864) throw new Error('STORE_PRIMARY');
        sha.update(chunk.subarray(0, count));
      }
      result[name] = { size, sha256: sha.digest('hex') };
    } finally {
      fs.closeSync(fd);
    }
  }
  return result;
}
let control,
  root,
  dataRoot,
  fixture,
  marker,
  cases,
  output,
  database,
  completed = false;
const deadline = setTimeout(() => {
  fs.writeSync(2, 'PERSISTENCE_STORE_DEADLINE\n');
  app.exit(74);
}, 110000);
function failed() {
  clearTimeout(deadline);
  fs.writeSync(2, 'PERSISTENCE_STORE_FAILED\n');
  app.exit(1);
}
function result() {
  const v = {
    version: 1,
    mode: control.mode,
    stage: control.stage,
    boundary: control.boundary,
    cases,
  };
  if (!validateResult(JSON.stringify(v))) throw new Error('STORE_RESULT');
  return v;
}
function unchanged() {
  return (
    read(path.join(fixture, 'primary-before.json')) === JSON.stringify(primaryWitness(dataRoot))
  );
}
try {
  if (
    process.argv.slice(app.isPackaged ? 1 : 2).length ||
    ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_FORCE_IS_PACKAGED'].some(
      (k) => process.env[k] !== undefined,
    )
  )
    throw new Error('STORE_ARGS');
  for (const flag of [
    'no-sandbox',
    'disable-gpu-sandbox',
    'disable-setuid-sandbox',
    'disable-web-security',
    'allow-running-insecure-content',
    'ignore-certificate-errors',
    'remote-debugging-port',
    'remote-debugging-pipe',
    'inspect',
    'inspect-brk',
  ])
    if (app.commandLine.hasSwitch(flag)) throw new Error('STORE_ARGS');
  root = process.env.FONESI_PERSISTENCE_RUN_ROOT;
  plain(root);
  const name = process.env.FONESI_PERSISTENCE_STORE_CONTROL_NAME;
  if (
    typeof name !== 'string' ||
    !/^persistence-store-control-(source|package)-(before_commit|after_commit)-(crash|reopen)\.json$/.test(
      name,
    )
  )
    throw new Error('STORE_CONTROL');
  control = parseControl(read(path.join(root, name)));
  if (
    !control ||
    name !==
      `persistence-store-control-${control.mode}-${control.boundary.toLowerCase()}-${control.stage}.json` ||
    (control.mode === 'package') !== app.isPackaged ||
    read(path.join(root, '.owner')) !== control.parentToken
  )
    throw new Error('STORE_CONTROL');
  cases = Object.fromEntries(caseNames(control.stage).map((k) => [k, false]));
  dataRoot = path.join(root, `data-${control.mode}`);
  plain(dataRoot);
  if (
    read(path.join(dataRoot, '.persistence-owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId, kind: 'FRESH', restoreReceiptId: null })
  )
    throw new Error('STORE_OWNER');
  const lock = path.join(dataRoot, '.writer-lock');
  plain(lock);
  if (
    JSON.stringify(fs.readdirSync(lock)) !== JSON.stringify(['owner.json']) ||
    read(path.join(lock, 'owner.json')) !==
      JSON.stringify({ version: 1, storeId: control.storeId, ownerToken: control.ownerToken })
  )
    throw new Error('STORE_LEASE');
  const keyProfile = path.join(dataRoot, 'key-profile');
  plain(keyProfile);
  if (
    read(path.join(keyProfile, '.key-profile-owner.json')) !==
      JSON.stringify({ version: 1, storeId: control.storeId }) ||
    !validBackupLocalState(read(path.join(keyProfile, 'Local State'))) ||
    read(path.join(keyProfile, 'Local State')) !== read(path.join(dataRoot, control.checkpoint))
  )
    throw new Error('STORE_KEY');
  const proof = parseDurabilityProof(read(path.join(dataRoot, 'key-durability-proof.json')));
  if (
    proof?.version !== 1 ||
    proof.storeId !== control.storeId ||
    proof.state !== 'ORDERLY_AND_ABRUPT_RECOVERED'
  )
    throw new Error('STORE_KEY_UNPROVEN');
  fixture = path.join(dataRoot, `store-fixture-${control.fixtureId}`);
  marker = {
    version: 1,
    storeId: control.storeId,
    fixtureId: control.fixtureId,
    boundary: control.boundary,
  };
  if (control.stage === 'crash') {
    fs.mkdirSync(fixture);
    write(path.join(fixture, '.fixture-owner.json'), marker);
    fs.mkdirSync(path.join(fixture, 'staging'));
    fs.mkdirSync(path.join(fixture, 'backups'));
    write(path.join(fixture, 'primary-before.json'), primaryWitness(dataRoot));
  } else {
    plain(fixture);
    if (read(path.join(fixture, '.fixture-owner.json')) !== JSON.stringify(marker))
      throw new Error('STORE_FIXTURE');
  }
  const profile = path.join(
    root,
    `fonesi-auto-foundation-${control.mode}-store-${control.boundary.toLowerCase().replace('_', '-')}-${control.stage}`,
  );
  const paths = prepareOwnedProfile(profile);
  if (app.isReady()) throw new Error('STORE_LATE');
  for (const [k, v] of Object.entries(paths)) app.setPath(k, v);
  app.setPath('sessionData', keyProfile);
  cases.profilePreparedBeforeReady = !app.isReady();
  output = path.join(
    root,
    `persistence-store-${control.mode}-${control.boundary.toLowerCase()}-${control.stage}.json`,
  );
  app
    .whenReady()
    .then(async () => {
      const assertOwned = async () => {
        await assertBorrowedPersistenceLease(
          { root: dataRoot, parentToken: control.parentToken },
          control.ownerToken,
        );
        plain(fixture);
        if (read(path.join(fixture, '.fixture-owner.json')) !== JSON.stringify(marker))
          throw new Error('STORE_FIXTURE');
        plain(path.join(fixture, 'staging'));
        plain(path.join(fixture, 'backups'));
      };
      await assertOwned();
      cases.leaseVerified = true;
      const keys = await backupKeys(safeStorage);
      const existing = await FoundationPersistence.open(
        { root: dataRoot, parentToken: control.parentToken },
        control.ownerToken,
        keys,
        false,
      );
      try {
        const old = await existing.authenticateBootstrap();
        if (
          old.header.storeId !== proof.storeId ||
          old.header.backupId !== proof.backupId ||
          old.header.locationId !== proof.locationId ||
          old.encryptedSha256 !== proof.encryptedSha256
        )
          throw new Error('STORE_KEY_WITNESS');
      } finally {
        existing.close();
      }
      const location = { locationId: control.fixtureId, directory: path.join(fixture, 'backups') };
      const service = new BackupService(
        {
          storeId: control.storeId,
          staging: path.join(fixture, 'staging'),
          assertOwned: async (loc) => {
            await assertOwned();
            if (loc.locationId !== location.locationId || loc.directory !== location.directory)
              throw new Error('STORE_LOCATION');
          },
        },
        keys,
      );
      const databasePath = path.join(fixture, 'schema.sqlite');
      if (control.stage === 'reopen') {
        const stat = fs.lstatSync(databasePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 67108864)
          throw new Error('STORE_DATABASE_MISSING');
      }
      database = new FoundationDatabase(databasePath, control.storeId);
      if (control.stage === 'crash') {
        if (database.version !== 0) throw new Error('STORE_VERSION');
        const receipt = await service.create(database, location, 'PRE_MIGRATION', Date.now());
        const authenticated = await service.validate(location, receipt.header.backupId);
        if (
          JSON.stringify(receipt) !== JSON.stringify(authenticated) ||
          receipt.header.schemaVersion !== 0 ||
          receipt.header.reason !== 'PRE_MIGRATION'
        )
          throw new Error('STORE_PREREQUISITE');
        write(path.join(fixture, 'prerequisite.json'), receipt);
        cases.prerequisiteAuthenticated = true;
        installCommitCrash(database.connection, control.boundary, () => {
          cases.commitBoundaryReached = true;
          cases.primaryDatabaseUnchanged = unchanged();
          if (!Object.values(cases).every((v) => v === true)) throw new Error('STORE_CASE');
          if (typeof process.crash !== 'function') throw new Error('STORE_CRASH_UNAVAILABLE');
          write(output, result());
          fs.writeSync(1, `PERSISTENCE_STORE_${control.boundary}_ARMED\n`);
          process.crash();
        });
        await database.migrate(async (version) => {
          if (version !== 0) throw new Error('STORE_EXTRA_MIGRATION');
          return service.prerequisite(authenticated);
        }, Date.now());
        throw new Error('STORE_CRASH_MISSED');
      }
      const receipt = parseBackupReceipt(read(path.join(fixture, 'prerequisite.json')));
      if (receipt?.header.schemaVersion !== 0 || receipt.header.reason !== 'PRE_MIGRATION')
        throw new Error('STORE_PREREQUISITE');
      const authenticated = await service.validate(location, receipt.header.backupId);
      cases.prerequisiteAuthenticated = JSON.stringify(authenticated) === JSON.stringify(receipt);
      const expected = control.boundary === 'BEFORE_COMMIT' ? 0 : 1;
      cases.schemaVersionExpected = database.version === expected;
      database.validate();
      cases.integrityValid =
        statement(database.connection, 'PRAGMA integrity_check', (s) => s.get()).integrity_check ===
        'ok';
      if (expected === 0)
        cases.historyExpected =
          statement(
            database.connection,
            "SELECT count(*) AS n FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
            (s) => s.get(),
          ).n === 0;
      else {
        const rows = statement(
          database.connection,
          'SELECT version,prerequisite_backup_id FROM schema_migration ORDER BY version',
          (s) => s.all(),
        );
        cases.historyExpected =
          rows.length === 1 &&
          rows[0].version === 1 &&
          rows[0].prerequisite_backup_id === receipt.header.backupId;
      }
      // Real Electron SQLite contention at the production migration's own
      // BEGIN IMMEDIATE, backed by a fresh authenticated current-version snapshot.
      const busyReceipt = await service.create(database, location, 'PRE_MIGRATION', Date.now());
      const busyBackup = await service.validate(location, busyReceipt.header.backupId);
      const beforeBusy = database.fingerprint();
      const writer = new DatabaseSync(databasePath);
      let locked = false;
      try {
        writer.exec('BEGIN IMMEDIATE');
        locked = true;
        try {
          await database.migrate(async (version) => {
            if (version !== expected) throw new Error('STORE_BUSY_VERSION');
            return service.prerequisite(busyBackup);
          }, Date.now());
        } catch (error) {
          cases.migrationBusyDenied =
            error instanceof Error && error.code === 'ERR_SQLITE_ERROR' && error.errcode === 5;
        }
      } finally {
        try {
          if (locked) writer.exec('ROLLBACK');
        } finally {
          writer.close();
        }
      }
      cases.migrationBusyDenied =
        cases.migrationBusyDenied &&
        database.version === expected &&
        database.fingerprint() === beforeBusy;
      // Owned Windows ReadOnly file attribute only: no ACL/account/host setting
      // changes and no altered production open flags. Observe denial at the
      // actual migration write, not a backup read or generic constructor error.
      database.close();
      database = null;
      const originalMode = fs.statSync(databasePath).mode & 0o777;
      let prerequisiteSupplied = false;
      let deniedAtWrite = false;
      let typedDenial = false;
      try {
        fs.chmodSync(databasePath, originalMode & ~0o222);
        database = new FoundationDatabase(databasePath, control.storeId);
        observeReadOnlyWrite(
          database.connection,
          () => prerequisiteSupplied,
          () => {
            deniedAtWrite = true;
          },
        );
        try {
          await database.migrate(async (version) => {
            if (version !== expected) throw new Error('STORE_READONLY_VERSION');
            prerequisiteSupplied = true;
            return service.prerequisite(busyBackup);
          }, Date.now());
        } catch (error) {
          typedDenial =
            error instanceof Error && error.code === 'ERR_SQLITE_ERROR' && error.errcode === 8;
        }
      } finally {
        try {
          database?.close();
          database = null;
        } finally {
          fs.chmodSync(databasePath, originalMode);
        }
      }
      database = new FoundationDatabase(databasePath, control.storeId, true);
      const afterDeniedBackup = await service.validate(location, busyReceipt.header.backupId);
      cases.migrationReadOnlyDenied =
        prerequisiteSupplied &&
        deniedAtWrite &&
        typedDenial &&
        database.version === expected &&
        database.fingerprint() === beforeBusy &&
        afterDeniedBackup.encryptedSha256 === busyBackup.encryptedSha256 &&
        JSON.stringify(afterDeniedBackup) === JSON.stringify(busyBackup) &&
        (fs.statSync(databasePath).mode & 0o777) === originalMode;
      database.close();
      database = null;
      cases.databaseClosed = true;
      cases.primaryDatabaseUnchanged = unchanged();
      if (!Object.values(cases).every((v) => v === true)) throw new Error('STORE_CASE');
      completed = true;
      app.quit();
    })
    .catch(failed);
  app.once('will-quit', () => {
    try {
      if (!completed || control.stage !== 'reopen') throw new Error('STORE_QUIT');
      write(output, result());
      clearTimeout(deadline);
      fs.writeSync(1, 'PERSISTENCE_STORE_REOPEN_CLOSED\n');
    } catch {
      failed();
    }
  });
} catch {
  failed();
}
