'use strict';
// Exact owned native fixture. Dialog responses are injected; no genuine user-click claim.
const { app, dialog, BrowserWindow, safeStorage } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const {
  caseNames,
  control,
  witness,
  backupWitness,
  restored,
  guardActiveDatabase,
  plain,
  read,
  write,
  exact,
} = require('./settings-recovery-contract.cjs');
let root,
  c,
  cases,
  entry,
  setupService,
  finished = false,
  maintenance = 0,
  closed = 0,
  openAttempts = 0,
  openDialogs = 0,
  confirmDialogs = 0,
  windowsCreated = 0;
app.on('browser-window-created', () => {
  windowsCreated++;
});
const log = console.log;
const timer = setTimeout(() => {
  fs.writeSync(2, 'SETTINGS_RECOVERY_DEADLINE\n');
  app.exit(74);
}, 110000);
function fail() {
  clearTimeout(timer);
  fs.writeSync(2, 'SETTINGS_RECOVERY_FAILED\n');
  app.exit(1);
}
function manifest() {
  const directory = path.resolve(__dirname, '../build'),
    v = JSON.parse(read(path.join(directory, '.verified-build.json')));
  if (v.schema !== 1 || !v.outputs || typeof v.outputs !== 'object') throw Error('RECOVERY_BUILD');
  for (const name of [
    'main.cjs',
    'persistence-entry.cjs',
    'foundation-persistence.cjs',
    'persistence-files.cjs',
    'foundation-database.cjs',
    'backup-service.cjs',
    'backup-key-profile.cjs',
    'profile-owner.cjs',
  ]) {
    const file = path.join(directory, name),
      s = fs.lstatSync(file);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.size > 8388608 ||
      typeof v.outputs[name] !== 'string' ||
      createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== v.outputs[name]
    )
      throw Error('RECOVERY_BUILD');
  }
}
function empty(dir) {
  plain(dir);
  const stream = fs.opendirSync(dir);
  try {
    return stream.readSync() === null;
  } finally {
    stream.closeSync();
  }
}
function before() {
  return exact(
    read(
      path.join(
        root,
        `settings-recovery-before-${c.mode}-${c.stage.startsWith('current') ? 'current' : 'previous'}.json`,
      ),
    ),
    ['version', 'dataRoot', 'target', 'classified', 'files', 'backupFiles'],
  );
}
function emit() {
  const output = {
    version: 1,
    mode: c.mode,
    stage: c.stage,
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    },
    cases,
  };
  write(path.join(root, `settings-recovery-${c.mode}-${c.stage}.json`), output);
  clearTimeout(timer);
  fs.writeSync(1, 'SETTINGS_RECOVERY_CLOSED\n');
}
try {
  root = process.env.FONESI_PERSISTENCE_RUN_ROOT;
  plain(root);
  const name = process.env.FONESI_PERSISTENCE_CONTROL_NAME;
  if (
    typeof name !== 'string' ||
    !/^settings-recovery-control-(source|package)-(recovery-setup|current-cancel|current-confirm|previous-cancel|previous-confirm)\.json$/.test(
      name,
    )
  )
    throw Error('RECOVERY_CONTROL');
  c = control(read(path.join(root, name)));
  if (
    name !== `settings-recovery-control-${c.mode}-${c.stage}.json` ||
    app.isPackaged !== (c.mode === 'package') ||
    read(path.join(root, '.owner')) !== c.runParentToken
  )
    throw Error('RECOVERY_CONTROL');
  const original = path.join(root, `data-${c.mode}`);
  if (c.stage.startsWith('previous')) {
    const target = restored(
      path.join(root, `settings-recovery-parent-${c.mode}-current`),
      c.storeId,
    );
    if (target.root !== c.dataRoot || target.parentToken !== c.parentToken)
      throw Error('RECOVERY_ROOT');
  } else if (c.dataRoot !== original || c.parentToken !== c.runParentToken)
    throw Error('RECOVERY_ROOT');
  manifest();
  if (c.stage !== 'recovery-setup') {
    if (
      JSON.stringify(process.argv.slice(app.isPackaged ? 1 : 2)) !==
      JSON.stringify(['--maintenance=restore-to-new'])
    )
      throw Error('RECOVERY_ARGS');
    if (
      c.destinationParent !==
        path.join(
          root,
          `settings-recovery-parent-${c.mode}-${c.stage.startsWith('current') ? 'current' : 'previous'}`,
        ) ||
      path.dirname(path.dirname(c.backupFile)) !== path.join(root, `backup-parent-${c.mode}`)
    )
      throw Error('RECOVERY_PATH');
    const previous = before();
    if (
      previous.version !== 1 ||
      previous.dataRoot !== c.dataRoot ||
      previous.classified !== true ||
      previous.target !== (c.stage.startsWith('current') ? 'current' : 'previous') ||
      JSON.stringify(previous.files) !== JSON.stringify(witness(c.dataRoot)) ||
      JSON.stringify(previous.backupFiles) !== JSON.stringify(backupWitness(c.backupFile))
    )
      throw Error('RECOVERY_CHANGED');
    guardActiveDatabase(require('node:sqlite'), path.join(c.dataRoot, 'active.sqlite'), () => {
      openAttempts++;
    });
  } else if (process.argv.slice(app.isPackaged ? 1 : 2).length) throw Error('RECOVERY_ARGS');
  const {
    preparedPersistenceEntry,
    configurePersistenceSession,
    openPreparedPersistence,
  } = require('../build/persistence-entry.cjs');
  entry = preparedPersistenceEntry(process.env.FONESI_PERSISTENCE_READY_FILE);
  if (
    !entry ||
    entry.root !== c.dataRoot ||
    entry.storeId !== c.storeId ||
    entry.ownerToken !== c.ownerToken ||
    entry.parentToken !== c.parentToken ||
    path.basename(entry.checkpoint) !== c.checkpoint
  )
    throw Error('RECOVERY_ENTRY');
  cases = Object.fromEntries(caseNames(c.stage).map((k) => [k, false]));
  cases.ownedRoot = true;
  if (c.stage === 'recovery-setup') {
    const { prepareOwnedProfile } = require('../build/profile-owner.cjs');
    const paths = prepareOwnedProfile(process.env.FONESI_BOOTSTRAP_ROOT);
    if (app.isReady()) throw Error('RECOVERY_LATE');
    for (const [k, v] of Object.entries(paths)) app.setPath(k, v);
    configurePersistenceSession(app, entry);
    app
      .whenReady()
      .then(async () => {
        setupService = await openPreparedPersistence(entry, safeStorage, Date.now(), true);
        cases.originalKeyAuthenticated = true;
        const db = setupService.settingsAdapter(),
          settings = db.readSettings();
        const { FoundationDatabase } = require('../build/foundation-database.cjs');
        const view = new FoundationDatabase(
          path.join(c.dataRoot, 'active.sqlite'),
          c.storeId,
          true,
        );
        let previousSettings;
        try {
          previousSettings = view.readPreviousSettings();
          cases.bothSettingsRows =
            view.version === 3 &&
            previousSettings !== null &&
            previousSettings.revision < settings.revision;
        } finally {
          view.close();
        }
        const receipt = await setupService.backup(Date.now());
        if (receipt?.header.schemaVersion !== 3 || receipt.header.reason !== 'MANUAL')
          throw Error('RECOVERY_BACKUP');
        const location = await setupService.catalog.activeLocation();
        if (!location || location.locationId !== receipt.header.locationId)
          throw Error('RECOVERY_BACKUP');
        const backupFile = path.join(
          location.directory,
          `backup-${receipt.header.backupId}.fonaub`,
        );
        if ((await setupService.backupSelection(backupFile)) !== receipt.header.backupId)
          throw Error('RECOVERY_BACKUP');
        cases.schema3BackupAuthenticated = true;
        write(path.join(root, `settings-recovery-backup-${c.mode}.json`), {
          version: 1,
          storeId: c.storeId,
          backupId: receipt.header.backupId,
          backupFile,
          settings,
          previous: previousSettings,
        });
        setupService.close();
        setupService = null;
        finished = true;
        app.quit();
      })
      .catch(fail);
  } else {
    cases.corruptRowConfirmed = true;
    dialog.showOpenDialog = async (options) => {
      const expected =
        openDialogs === 0
          ? {
              title: 'Choose an owned encrypted recovery backup',
              properties: ['openFile'],
              filters: [{ name: 'Fonesi encrypted backup', extensions: ['fonaub'] }],
            }
          : {
              title: 'Choose a parent for a new quarantined restore',
              properties: ['openDirectory'],
            };
      if (openDialogs >= 2 || JSON.stringify(options) !== JSON.stringify(expected))
        throw Error('RECOVERY_DIALOG');
      return {
        canceled: false,
        filePaths: [openDialogs++ === 0 ? c.backupFile : c.destinationParent],
      };
    };
    dialog.showMessageBox = async (options) => {
      const expected = {
        type: 'warning',
        title: 'Confirm main-owned recovery',
        message: 'Confirm this exact operation?',
        detail: `Restore backup ${c.backupId} into a NEW quarantined root under:\n${c.destinationParent}\nThe existing database and key material remain unchanged.`,
        buttons: ['Confirm', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      };
      if (
        confirmDialogs++ !== 0 ||
        openDialogs !== 2 ||
        JSON.stringify(options) !== JSON.stringify(expected)
      )
        throw Error('RECOVERY_DIALOG');
      return { response: c.stage.endsWith('-cancel') ? 1 : 0, checkboxChecked: false };
    };
    console.log = (...args) => {
      if (
        args.length === 1 &&
        args[0] ===
          `PERSISTENCE_MAINTENANCE_${c.stage.endsWith('-cancel') ? 'CANCELLED' : 'COMPLETED'}`
      )
        maintenance++;
      if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed++;
      if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') throw Error('RECOVERY_NORMAL_UI');
      log(...args);
    };
    require('../build/main.cjs');
  }
  app.on('will-quit', () => {
    try {
      if (c.stage === 'recovery-setup') {
        if (!finished || setupService) throw Error('RECOVERY_SETUP');
      } else {
        if (maintenance !== 1 || closed !== 1 || openDialogs !== 2 || confirmDialogs !== 1)
          throw Error('RECOVERY_EXIT');
        cases.activeDatabaseNeverOpened = openAttempts === 0;
        cases.noNormalWindow = windowsCreated === 0 && BrowserWindow.getAllWindows().length === 0;
        cases.oldFilesUnchanged =
          JSON.stringify(before().files) === JSON.stringify(witness(c.dataRoot)) &&
          JSON.stringify(before().backupFiles) === JSON.stringify(backupWitness(c.backupFile));
        if (c.stage.endsWith('-cancel')) {
          cases.nativeCancelled = true;
          cases.noRestoreCreated = empty(c.destinationParent);
        } else {
          cases.nativeConfirmed = true;
          const target = restored(c.destinationParent, c.storeId);
          cases.restoredNewRoot = target.root !== c.dataRoot;
          const marker = exact(read(path.join(target.root, 'restore-source.json')), [
            'version',
            'storeId',
            'backupId',
          ]);
          if (
            marker.version !== 1 ||
            marker.storeId !== c.storeId ||
            marker.backupId !== c.backupId
          )
            throw Error('RECOVERY_RESTORED');
          const { FoundationDatabase, statement } = require('../build/foundation-database.cjs');
          const database = new FoundationDatabase(
            path.join(target.root, 'active.sqlite'),
            c.storeId,
            true,
          );
          try {
            database.validate();
            const row = statement(
              database.connection,
              'SELECT restore_quarantine,restored_from_backup_id FROM foundation_store',
              (s) => s.get(),
            );
            cases.restoredQuarantined =
              row.restore_quarantine === 1 && row.restored_from_backup_id === c.backupId;
            const saved = exact(read(path.join(root, `settings-recovery-backup-${c.mode}.json`)), [
              'version',
              'storeId',
              'backupId',
              'backupFile',
              'settings',
              'previous',
            ]);
            cases.restoredSettingsValid =
              database.version === 3 &&
              JSON.stringify(database.readSettings()) === JSON.stringify(saved.settings) &&
              JSON.stringify(database.readPreviousSettings()) === JSON.stringify(saved.previous);
          } finally {
            database.close();
          }
        }
      }
      cases.orderlyQuit = true;
      emit();
    } catch {
      fail();
    }
  });
} catch {
  fail();
}
