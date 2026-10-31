'use strict';
// Native adapters and actual storage/key implementations; only native dialog
// answers are injected here. This does not establish authentic human intent.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { FoundationPersistence } = require('../build/foundation-persistence.cjs');
const { FoundationDatabase, statement } = require('../build/foundation-database.cjs');
const { backupKeys, validBackupLocalState } = require('../build/backup-key-profile.cjs');
const { assertBorrowedPersistenceLease } = require('../build/persistence-files.cjs');
const { runNativePersistenceMaintenance } = require('../build/persistence-native.cjs');
const { prepareOwnedProfile } = require('../build/profile-owner.cjs');
const { CASES, parse, diagnostic } = require('./persistence-maintenance-contract.cjs');
const uuid = (x) =>
  typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
function plain(p) {
  const s = fs.lstatSync(p);
  if (
    p !== path.resolve(p) ||
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    fs.realpathSync(p).toLowerCase() !== p.toLowerCase()
  )
    throw new Error('OWNERSHIP');
}
function read(p) {
  plain(path.dirname(p));
  const s = fs.lstatSync(p);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'r');
  try {
    const b = Buffer.alloc(65537);
    let n = 0;
    while (n < b.length) {
      const got = fs.readSync(fd, b, n, b.length - n, null);
      if (!got) break;
      n += got;
    }
    if (n > 65536) throw new Error('LIMIT');
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(b.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}
function write(p, value) {
  plain(path.dirname(p));
  const bytes = JSON.stringify(value);
  if (Buffer.byteLength(bytes) > 65536) throw new Error('LIMIT');
  const fd = fs.openSync(p, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function emptyDirectory(p) {
  plain(p);
  const dir = fs.opendirSync(p);
  try {
    return dir.readSync() === null;
  } finally {
    dir.closeSync();
  }
}
function oneDirectory(p) {
  plain(p);
  const d = fs.opendirSync(p);
  try {
    const e = d.readSync();
    if (!e?.isDirectory() || e.isSymbolicLink() || d.readSync() !== null)
      throw new Error('RESTORE_TREE');
    return path.join(p, e.name);
  } finally {
    d.closeSync();
  }
}
const cases = Object.fromEntries(CASES.map((x) => [x, false]));
let service, root, data, control, checkpoint, counts;
let complete = false;
let stage = 'ENTRY';
const timer = setTimeout(() => {
  console.error('PERSISTENCE_MAINTENANCE_DEADLINE');
  app.exit(74);
}, 110000);
function inspect(operation) {
  const db = new FoundationDatabase(path.join(data, 'active.sqlite'), control.storeId, true);
  try {
    db.validate();
    return operation(db);
  } finally {
    db.close();
  }
}
const fingerprint = () =>
  `${inspect((db) => db.fingerprint())}|${read(path.join(data, 'backup-locations.json'))}`;
async function selectedPath(id) {
  const row = inspect((db) =>
    statement(
      db.connection,
      "SELECT location_id,filename FROM backup_record WHERE backup_id=? AND state='VALIDATED'",
      (s) => s.get(id),
    ),
  );
  if (!row) throw new Error('BACKUP');
  const location = await service.catalog.location(row.location_id);
  return path.join(location.directory, row.filename);
}
async function run(arg, opens = [], responses = [], display = false) {
  let shown = 0;
  const native = {
    showOpenDialog: async () => {
      if (!opens.length) throw new Error('DIALOG');
      const item = opens.shift();
      return item === null
        ? { canceled: true, filePaths: [] }
        : { canceled: false, filePaths: [item] };
    },
    showMessageBox: async (options) => {
      shown += 1;
      if (display) {
        const expectedDetail =
          display
            .map(
              (row) =>
                `${row.backupId} | ${row.reason} | ${row.protected ? 'PROTECTED' : 'ORDINARY/RELEASED'}`,
            )
            .join('\n') || 'No catalogued backup.';
        if (
          options.type !== 'info' ||
          options.title !== 'Validated backup catalogue' ||
          options.message !== `${display.length} catalogued backups` ||
          options.detail !== expectedDetail
        )
          throw new Error('DISPLAY');
        return { response: 0, checkboxChecked: false };
      }
      if (options.defaultId !== 1 || options.cancelId !== 1 || !responses.length)
        throw new Error('CONFIRM');
      return { response: responses.shift(), checkboxChecked: false };
    },
  };
  const result = await runNativePersistenceMaintenance(
    service,
    [arg],
    native,
    () =>
      assertBorrowedPersistenceLease(
        { root: data, parentToken: control.parentToken },
        control.ownerToken,
      ),
    checkpoint,
  );
  if (opens.length || responses.length || (display && shown !== 1)) throw new Error('DIALOG_COUNT');
  return result;
}
try {
  if (
    ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_FORCE_IS_PACKAGED'].some(
      (name) => process.env[name] !== undefined,
    )
  )
    throw new Error('OVERRIDE');
  for (const name of [
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
    if (app.commandLine.hasSwitch(name)) throw new Error('OVERRIDE');
  root = process.env.FONESI_PERSISTENCE_RUN_ROOT;
  plain(root);
  const name = process.env.FONESI_PERSISTENCE_CONTROL_NAME;
  if (
    typeof name !== 'string' ||
    !/^persistence-maintenance-control-(source|package)\.json$/.test(name)
  )
    throw new Error('CONTROL');
  const raw = read(path.join(root, name));
  control = JSON.parse(raw);
  if (
    JSON.stringify(control) !== raw ||
    JSON.stringify(Object.keys(control)) !==
      JSON.stringify(['version', 'mode', 'parentToken', 'ownerToken', 'storeId', 'checkpoint']) ||
    control.version !== 1 ||
    !['source', 'package'].includes(control.mode) ||
    name !== `persistence-maintenance-control-${control.mode}.json` ||
    ![control.parentToken, control.ownerToken, control.storeId].every(uuid) ||
    typeof control.checkpoint !== 'string' ||
    !/^key-checkpoint-[0-9a-f-]{36}\.json$/.test(control.checkpoint) ||
    !uuid(control.checkpoint.slice(15, -5))
  )
    throw new Error('CONTROL');
  if (
    read(path.join(root, '.owner')) !== control.parentToken ||
    app.isReady() ||
    app.isPackaged !== (control.mode === 'package') ||
    process.argv.slice(app.isPackaged ? 1 : 2).length
  )
    throw new Error('ENTRY');
  stage = 'OWNERSHIP';
  data = path.join(root, `data-${control.mode}`);
  plain(data);
  if (
    read(path.join(data, '.persistence-owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId, kind: 'FRESH', restoreReceiptId: null })
  )
    throw new Error('DATA_OWNER');
  const lock = path.join(data, '.writer-lock');
  plain(lock);
  const lockEntries = fs.opendirSync(lock);
  try {
    if (lockEntries.readSync()?.name !== 'owner.json' || lockEntries.readSync() !== null)
      throw new Error('LEASE');
  } finally {
    lockEntries.closeSync();
  }
  if (
    read(path.join(lock, 'owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId, ownerToken: control.ownerToken })
  )
    throw new Error('LEASE');
  stage = 'PROFILE';
  const profile = path.join(data, 'key-profile');
  plain(profile);
  if (
    read(path.join(profile, '.key-profile-owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId })
  )
    throw new Error('PROFILE');
  checkpoint = path.join(data, control.checkpoint);
  const localState = read(path.join(profile, 'Local State'));
  if (!validBackupLocalState(localState) || read(checkpoint) !== localState)
    throw new Error('CHECKPOINT');
  const paths = prepareOwnedProfile(
    path.join(root, `fonesi-auto-foundation-${control.mode}-maintenance`),
  );
  for (const [key, value] of Object.entries(paths)) app.setPath(key, value);
  app.setPath('sessionData', profile);
  cases.profile_before_ready = true;
  app.on('will-quit', () => {
    clearTimeout(timer);
    if (!complete) {
      console.error(diagnostic(stage));
      console.error('PERSISTENCE_MAINTENANCE_FAILED');
      app.exit(1);
      return;
    }
    stage = 'RESULT';
    const result = {
      version: 1,
      scope: 'NATIVE_ADAPTER_MAINTENANCE',
      mode: control.mode,
      versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
      },
      cases,
      ordinaryCount: counts.ordinary,
      protectedCount: counts.protected,
      releasedSafetyCount: counts.released,
    };
    if (!parse(JSON.stringify(result)).passed) {
      console.error(diagnostic(stage));
      console.error('PERSISTENCE_MAINTENANCE_FAILED');
      app.exit(1);
      return;
    }
    write(path.join(root, `persistence-maintenance-result-${control.mode}.json`), result);
    console.log('PERSISTENCE_MAINTENANCE_ORDERLY');
  });
  stage = 'READY';
  app
    .whenReady()
    .then(async () => {
      const assertLease = () =>
        assertBorrowedPersistenceLease(
          { root: data, parentToken: control.parentToken },
          control.ownerToken,
        );
      stage = 'LEASE';
      await assertLease();
      cases.retained_lease = true;
      stage = 'KEYS';
      const keys = await backupKeys(safeStorage);
      stage = 'OPEN';
      service = await FoundationPersistence.open(
        { root: data, parentToken: control.parentToken },
        control.ownerToken,
        keys,
        false,
      );
      stage = 'INITIALIZE';
      await service.initialize(Date.now());
      cases.native_keys = true;
      cases.ready_schema = inspect((db) => db.version === 2);
      const backupParent = path.join(root, `maintenance-backup-parent-${control.mode}`),
        restoreParent = path.join(root, `maintenance-restore-parent-${control.mode}`);
      plain(backupParent);
      plain(restoreParent);
      if (!emptyDirectory(backupParent) || !emptyDirectory(restoreParent))
        throw new Error('PARENT_NOT_EMPTY');
      stage = 'CANCEL_FOLDER';
      let before = fingerprint();
      if (
        (await run('--maintenance=select-backup-folder', [backupParent], [1])) !== 'CANCELLED' ||
        fingerprint() !== before
      )
        throw new Error('CANCEL');
      if (!emptyDirectory(backupParent)) throw new Error('CANCEL_ORPHAN');
      cases.cancel_folder_unchanged = true;
      stage = 'CANCEL_ACCEPT';
      const protectedRows = (await service.list()).filter((r) => r.protected);
      if (protectedRows.length !== 2) throw new Error('PROTECTED');
      const protectedPath = await selectedPath(protectedRows[0].backupId);
      before = fingerprint();
      if (
        (await run('--maintenance=accept-upgrade', [protectedPath], [1])) !== 'CANCELLED' ||
        fingerprint() !== before
      )
        throw new Error('CANCEL');
      cases.cancel_accept_unchanged = true;
      stage = 'CANCEL_RESTORE';
      before = fingerprint();
      if (
        (await run('--maintenance=restore-to-new', [protectedPath, restoreParent], [1])) !==
          'CANCELLED' ||
        fingerprint() !== before
      )
        throw new Error('CANCEL');
      if (!emptyDirectory(restoreParent)) throw new Error('CANCEL_ORPHAN');
      cases.cancel_restore_unchanged = true;
      stage = 'LIST';
      if ((await run('--maintenance=list-backups', [], [], await service.list())) !== 'COMPLETED')
        throw new Error('LIST');
      cases.list_native_display = true;
      stage = 'SELECT_FOLDER';
      const previous = await service.catalog.config();
      if ((await run('--maintenance=select-backup-folder', [backupParent], [0])) !== 'COMPLETED')
        throw new Error('SELECT');
      const current = await service.catalog.config();
      const location = await service.catalog.activeLocation();
      if (
        !location ||
        current.activeLocationId === previous.activeLocationId ||
        path.dirname(location.directory) !== backupParent ||
        current.locations.length !== previous.locations.length + 1 ||
        !previous.locations.every((old) =>
          current.locations.some((v) => v.locationId === old.locationId),
        )
      )
        throw new Error('LOCATION');
      cases.location_identity = true;
      stage = 'REOPEN';
      service.close();
      service = await FoundationPersistence.open(
        { root: data, parentToken: control.parentToken },
        control.ownerToken,
        keys,
        false,
      );
      stage = 'REOPEN';
      await service.initialize(Date.now());
      if (JSON.stringify(await service.catalog.config()) !== JSON.stringify(current))
        throw new Error('PERSIST');
      cases.location_persisted = true;
      stage = 'MANUAL_BACKUPS';
      for (let index = 0; index < 8; index++) {
        if ((await run('--maintenance=backup-now')) !== 'COMPLETED') throw new Error('BACKUP');
      }
      cases.manual_backup = true;
      stage = 'RETENTION';
      let rows = await service.list();
      if (rows.filter((r) => r.reason === 'DAILY' || r.reason === 'MANUAL').length !== 7)
        throw new Error('RETENTION');
      cases.ordinary_retention_7 = true;
      if (
        !protectedRows.every((old) => rows.some((r) => r.backupId === old.backupId && r.protected))
      )
        throw new Error('PROTECTED');
      cases.protected_retained = true;
      stage = 'ACCEPT';
      if ((await run('--maintenance=accept-upgrade', [protectedPath], [0])) !== 'COMPLETED')
        throw new Error('ACCEPT');
      const acceptedRaw = read(
        path.join(data, `upgrade-acceptance-${protectedRows[0].backupId}.json`),
      );
      const accepted = JSON.parse(acceptedRaw);
      const acceptedRow = inspect((db) =>
        statement(
          db.connection,
          'SELECT encrypted_sha256,protected FROM backup_record WHERE backup_id=?',
          (stmt) => stmt.get(protectedRows[0].backupId),
        ),
      );
      if (
        acceptedRow?.protected !== 0 ||
        !Number.isSafeInteger(accepted.acceptedUtc) ||
        accepted.acceptedUtc < 0 ||
        acceptedRaw !==
          JSON.stringify({
            version: 1,
            storeId: control.storeId,
            backupId: protectedRows[0].backupId,
            encryptedSha256: acceptedRow.encrypted_sha256,
            acceptedUtc: accepted.acceptedUtc,
          })
      )
        throw new Error('RECEIPT');
      cases.acceptance_receipt = true;
      stage = 'POST_ACCEPT_BACKUP';
      if ((await run('--maintenance=backup-now')) !== 'COMPLETED') throw new Error('BACKUP');
      rows = await service.list();
      counts = {
        ordinary: rows.filter((r) => r.reason === 'DAILY' || r.reason === 'MANUAL').length,
        protected: rows.filter((r) => r.protected).length,
        released: rows.filter((r) => r.reason === 'PRE_MIGRATION' && !r.protected).length,
      };
      stage = 'RESTORE';
      const restore = rows.find((r) => r.reason === 'MANUAL' && !r.protected);
      if (!restore) throw new Error('RESTORE');
      const restoreFile = await selectedPath(restore.backupId);
      before = fingerprint();
      if (
        (await run('--maintenance=restore-to-new', [restoreFile, restoreParent], [0])) !==
        'COMPLETED'
      )
        throw new Error('RESTORE');
      stage = 'RESTORE_VALIDATE';
      const restoredParent = oneDirectory(restoreParent),
        restoredData = path.join(restoredParent, `data-${control.storeId}`);
      plain(restoredData);
      if (restoredData === data) throw new Error('RESTORE');
      cases.restore_new_root = true;
      const restored = new FoundationDatabase(
        path.join(restoredData, 'active.sqlite'),
        control.storeId,
        true,
      );
      try {
        restored.validate();
        const row = statement(
          restored.connection,
          'SELECT restore_quarantine,restored_from_backup_id FROM foundation_store WHERE singleton=1',
          (s) => s.get(),
        );
        cases.restore_quarantined =
          restored.version === 2 &&
          row.restore_quarantine === 1 &&
          row.restored_from_backup_id === restore.backupId;
      } finally {
        restored.close();
      }
      cases.source_unchanged_by_restore = fingerprint() === before;
      write(path.join(root, `persistence-maintenance-restore-${control.mode}.json`), {
        version: 1,
        storeId: control.storeId,
        restoreRoot: restoredData,
        sourceBackupId: restore.backupId,
      });
      stage = 'CLOSE';
      await assertLease();
      service.close();
      cases.service_closed = true;
      complete = true;
      app.quit();
    })
    .catch((error) => {
      clearTimeout(timer);
      try {
        service?.close();
      } catch {}
      console.error(diagnostic(stage, error));
      console.error('PERSISTENCE_MAINTENANCE_FAILED');
      app.exit(1);
    });
} catch (error) {
  clearTimeout(timer);
  console.error(diagnostic(stage, error));
  console.error('PERSISTENCE_MAINTENANCE_FAILED');
  app.exit(1);
}
