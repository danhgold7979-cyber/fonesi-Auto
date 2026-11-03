'use strict';
// Verification-only Electron entry for actual persistence/key libraries. This is
// not application-main integration and never enables test flags in production.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { FoundationPersistence } = require('../build/foundation-persistence.cjs');
const { backupKeys } = require('../build/backup-key-profile.cjs');
const { prepareOwnedProfile } = require('../build/profile-owner.cjs');
const STAGES = ['provision', 'orderly-auth', 'abrupt-auth', 'final-auth'];
const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function plain(directory) {
  const stat = fs.lstatSync(directory);
  const equal = (a, b) =>
    process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (
    !path.isAbsolute(directory) ||
    path.resolve(directory) !== directory ||
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    !equal(fs.realpathSync(directory), directory)
  )
    throw new Error('OWNERSHIP');
}
function bounded(file) {
  plain(path.dirname(file));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error('FILE');
  const descriptor = fs.openSync(file, 'r');
  try {
    const actual = fs.fstatSync(descriptor);
    if (!actual.isFile() || actual.size !== stat.size) throw new Error('FILE');
    const bytes = Buffer.alloc(65537);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (!count) break;
      offset += count;
    }
    if (offset > 65536) throw new Error('FILE');
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, offset),
    );
  } finally {
    fs.closeSync(descriptor);
  }
}
function exact(value, keys) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  )
    throw new Error('SHAPE');
}
function witness(receipt) {
  return {
    storeId: receipt.header.storeId,
    backupId: receipt.header.backupId,
    locationId: receipt.header.locationId,
    encryptedSha256: receipt.encryptedSha256,
  };
}
let control, root, dataRoot, output, service, receipt;
let completed = false;
const cases = {
  profilePreparedBeforeReady: false,
  leaseVerified: false,
  backupAuthenticated: false,
  existingBackupMatched: false,
  schemaZero: false,
  unprovenMigrationRejected: false,
  noActiveDatabase: false,
  serviceClosed: false,
};
const versions = {
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
};
const deadline = setTimeout(() => {
  console.error('PERSISTENCE_PROBE_DEADLINE');
  app.exit(74);
}, 110000);
function writePrivate() {
  plain(root);
  const result = {
    version: 1,
    mode: control.mode,
    stage: control.stage,
    versions,
    cases,
    receipt: witness(receipt),
  };
  const bytes = Buffer.from(JSON.stringify(result), 'utf8');
  if (bytes.length > 65536) throw new Error('OUTPUT');
  const descriptor = fs.openSync(output, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}
function failed() {
  console.error('PERSISTENCE_PROBE_FAILED');
  clearTimeout(deadline);
  app.exit(1);
}
try {
  if (
    process.argv.slice(app.isPackaged ? 1 : 2).length !== 0 ||
    ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_FORCE_IS_PACKAGED'].some(
      (name) => process.env[name] !== undefined,
    )
  )
    throw new Error('ARGUMENTS');
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
    if (app.commandLine.hasSwitch(name)) throw new Error('ARGUMENTS');
  root = process.env.FONESI_PERSISTENCE_RUN_ROOT;
  if (typeof root !== 'string') throw new Error('ROOT');
  plain(root);
  const controlName = process.env.FONESI_PERSISTENCE_CONTROL_NAME;
  if (
    typeof controlName !== 'string' ||
    !/^persistence-control-(source|package)-(provision|orderly-auth|abrupt-auth|final-auth)\.json$/.test(
      controlName,
    )
  )
    throw new Error('CONTROL_NAME');
  const raw = bounded(path.join(root, controlName));
  control = JSON.parse(raw);
  exact(control, [
    'version',
    'mode',
    'stage',
    'parentToken',
    'ownerToken',
    'storeId',
    'checkpoint',
    'expected',
  ]);
  if (
    JSON.stringify(control) !== raw ||
    control.version !== 1 ||
    !['source', 'package'].includes(control.mode) ||
    !STAGES.includes(control.stage) ||
    ![control.parentToken, control.ownerToken, control.storeId].every(uuid) ||
    bounded(path.join(root, '.owner')) !== control.parentToken
  )
    throw new Error('CONTROL');
  if (controlName !== `persistence-control-${control.mode}-${control.stage}.json`)
    throw new Error('CONTROL_NAME');
  if ((control.mode === 'package') !== app.isPackaged) throw new Error('MODE');
  dataRoot = path.join(root, `data-${control.mode}`);
  plain(dataRoot);
  const identity = { version: 1, storeId: control.storeId, kind: 'FRESH', restoreReceiptId: null };
  if (bounded(path.join(dataRoot, '.persistence-owner.json')) !== JSON.stringify(identity))
    throw new Error('DATA_OWNER');
  const lock = path.join(dataRoot, '.writer-lock');
  plain(lock);
  if (
    JSON.stringify(fs.readdirSync(lock)) !== JSON.stringify(['owner.json']) ||
    bounded(path.join(lock, 'owner.json')) !==
      JSON.stringify({ version: 1, storeId: control.storeId, ownerToken: control.ownerToken })
  )
    throw new Error('LEASE');
  cases.leaseVerified = true;
  const keyProfile = path.join(dataRoot, 'key-profile');
  plain(keyProfile);
  if (
    bounded(path.join(keyProfile, '.key-profile-owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId })
  )
    throw new Error('KEY_OWNER');
  if (control.stage === 'provision') {
    if (
      control.checkpoint !== null ||
      control.expected !== null ||
      JSON.stringify(fs.readdirSync(keyProfile)) !== JSON.stringify(['.key-profile-owner.json'])
    )
      throw new Error('FRESH_PROFILE');
  } else {
    if (
      typeof control.checkpoint !== 'string' ||
      !/^key-checkpoint-[0-9a-f-]{36}\.json$/.test(control.checkpoint)
    )
      throw new Error('CHECKPOINT');
    exact(control.expected, ['storeId', 'backupId', 'locationId', 'encryptedSha256']);
    if (
      ![control.expected.storeId, control.expected.backupId, control.expected.locationId].every(
        uuid,
      ) ||
      !hash(control.expected.encryptedSha256) ||
      control.expected.storeId !== control.storeId
    )
      throw new Error('WITNESS');
    if (
      bounded(path.join(keyProfile, 'Local State')) !==
      bounded(path.join(dataRoot, control.checkpoint))
    )
      throw new Error('CHECKPOINT_CHANGED');
  }
  const paths = prepareOwnedProfile(
    path.join(root, `fonesi-auto-foundation-${control.mode}-${control.stage}`),
  );
  if (app.isReady()) throw new Error('LATE_PROFILE');
  for (const [key, value] of Object.entries(paths)) app.setPath(key, value);
  app.setPath('sessionData', keyProfile);
  cases.profilePreparedBeforeReady = !app.isReady();
  output = path.join(root, `persistence-${control.mode}-${control.stage}.json`);
  app
    .whenReady()
    .then(async () => {
      const keys = await backupKeys(safeStorage);
      service = await FoundationPersistence.open(
        { root: dataRoot, parentToken: control.parentToken },
        control.ownerToken,
        keys,
        control.stage === 'provision',
      );
      if (control.stage === 'provision') {
        const { runNativePersistenceProvision } = require('../build/persistence-native.cjs');
        const { assertBorrowedPersistenceLease } = require('../build/persistence-files.cjs');
        const result = await runNativePersistenceProvision(
          service,
          {
            showOpenDialog: async () => ({
              canceled: false,
              filePaths: [path.join(root, `backup-parent-${control.mode}`)],
            }),
            showMessageBox: async () => ({ response: 0, checkboxChecked: false }),
          },
          () =>
            assertBorrowedPersistenceLease(
              { root: dataRoot, parentToken: control.parentToken },
              control.ownerToken,
            ),
          Date.now,
        );
        if (result.status !== 'PROVISIONED') throw new Error('PROVISION_DENIED');
        receipt = result.receipt;
      } else receipt = await service.authenticateBootstrap();
      cases.backupAuthenticated = true;
      cases.schemaZero = receipt.header.schemaVersion === 0;
      cases.existingBackupMatched =
        control.stage !== 'provision' &&
        JSON.stringify(witness(receipt)) === JSON.stringify(control.expected);
      if (fs.existsSync(path.join(dataRoot, 'key-durability-proof.json')))
        throw new Error('PREMATURE_PROOF');
      try {
        await service.initialize(Date.now());
      } catch (error) {
        cases.unprovenMigrationRejected = error?.message === 'KEY_DURABILITY_UNPROVEN';
      }
      cases.noActiveDatabase = !fs.existsSync(path.join(dataRoot, 'active.sqlite'));
      service.close();
      cases.serviceClosed = true;
      completed = true;
      if (control.stage === 'abrupt-auth') {
        if (typeof process.crash !== 'function') throw new Error('CRASH_API_UNAVAILABLE');
        writePrivate();
        fs.writeSync(1, 'PERSISTENCE_ABRUPT_CRASH_ARMED\n');
        clearTimeout(deadline);
        process.crash();
        throw new Error('CRASH_RETURNED');
      } else app.quit();
    })
    .catch(failed);
  app.on('will-quit', () => {
    if (!completed || control.stage === 'abrupt-auth') {
      console.error('PERSISTENCE_UNEXPECTED_QUIT');
      return;
    }
    try {
      writePrivate();
      console.log('PERSISTENCE_ORDERLY_QUIT');
      clearTimeout(deadline);
    } catch {
      failed();
    }
  });
} catch {
  failed();
}
