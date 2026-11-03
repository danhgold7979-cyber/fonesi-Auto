'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { control, plain, read, exact, uuid } = require('./settings-contract.cjs');
function preflight(app) {
  if (
    process.argv.slice(app.isPackaged ? 1 : 2).length ||
    ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_FORCE_IS_PACKAGED'].some(
      (key) => process.env[key] !== undefined,
    )
  )
    throw Error('SETTINGS_ARGUMENTS');
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
    if (app.commandLine.hasSwitch(flag)) throw Error('SETTINGS_ARGUMENTS');
  const root = process.env.FONESI_PERSISTENCE_RUN_ROOT;
  plain(root);
  const name = process.env.FONESI_PERSISTENCE_CONTROL_NAME;
  if (
    typeof name !== 'string' ||
    !/^settings-control-(source|package)-(ui|reopen|before-crash|before-reopen|after-crash|after-reopen)\.json$/.test(
      name,
    )
  )
    throw Error('SETTINGS_CONTROL');
  const c = control(read(path.join(root, name)));
  if (
    name !== `settings-control-${c.mode}-${c.stage}.json` ||
    app.isPackaged !== (c.mode === 'package') ||
    read(path.join(root, '.owner')) !== c.parentToken
  )
    throw Error('SETTINGS_CONTROL');
  const data = path.join(root, `data-${c.mode}`);
  plain(data);
  if (
    read(path.join(data, '.persistence-owner.json')) !==
    JSON.stringify({ version: 1, storeId: c.storeId, kind: 'FRESH', restoreReceiptId: null })
  )
    throw Error('SETTINGS_OWNER');
  const lock = path.join(data, '.writer-lock');
  plain(lock);
  const entries = fs.opendirSync(lock);
  try {
    if (entries.readSync()?.name !== 'owner.json' || entries.readSync() !== null)
      throw Error('SETTINGS_LOCK');
  } finally {
    entries.closeSync();
  }
  if (
    read(path.join(lock, 'owner.json')) !==
    JSON.stringify({ version: 1, storeId: c.storeId, ownerToken: c.ownerToken })
  )
    throw Error('SETTINGS_LOCK');
  const key = path.join(data, 'key-profile');
  plain(key);
  const { validBackupLocalState } = require('../build/backup-key-profile.cjs');
  const material = read(path.join(key, 'Local State'));
  if (
    read(path.join(key, '.key-profile-owner.json')) !==
      JSON.stringify({ version: 1, storeId: c.storeId }) ||
    !validBackupLocalState(material) ||
    material !== read(path.join(data, c.checkpoint))
  )
    throw Error('SETTINGS_KEY');
  const witness = exact(read(path.join(root, `persistence-witness-${c.mode}.json`)), [
    'storeId',
    'backupId',
    'locationId',
    'encryptedSha256',
  ]);
  if (
    witness.storeId !== c.storeId ||
    ![witness.storeId, witness.backupId, witness.locationId].every(uuid) ||
    typeof witness.encryptedSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(witness.encryptedSha256) ||
    read(path.join(data, 'key-durability-proof.json')) !==
      JSON.stringify({ version: 1, ...witness, state: 'ORDERLY_AND_ABRUPT_RECOVERED' })
  )
    throw Error('SETTINGS_PROOF');
  return { root, data, key, c, witness };
}
async function authenticated(state, safeStorage, requireMigration = true) {
  const {
    assertBorrowedPersistenceLease,
    verifyBackupLocation,
  } = require('../build/persistence-files.cjs');
  const { backupKeys } = require('../build/backup-key-profile.cjs');
  const { FoundationPersistence } = require('../build/foundation-persistence.cjs');
  const { BackupService, parseBackupReceipt } = require('../build/backup-service.cjs');
  const owned = () =>
    assertBorrowedPersistenceLease(
      { root: state.data, parentToken: state.c.parentToken },
      state.c.ownerToken,
    );
  await owned();
  const keys = await backupKeys(safeStorage);
  const persistence = await FoundationPersistence.open(
    { root: state.data, parentToken: state.c.parentToken },
    state.c.ownerToken,
    keys,
    false,
  );
  try {
    const old = await persistence.authenticateBootstrap();
    if (
      old.header.storeId !== state.witness.storeId ||
      old.header.backupId !== state.witness.backupId ||
      old.header.locationId !== state.witness.locationId ||
      old.encryptedSha256 !== state.witness.encryptedSha256
    )
      throw Error('SETTINGS_OLD_KEY');
  } finally {
    persistence.close();
  }
  if (requireMigration) {
    const raw = read(path.join(state.data, 'migration-backups.json'));
    const registry = JSON.parse(raw);
    if (!Array.isArray(registry) || registry.length !== 3 || JSON.stringify(registry) !== raw)
      throw Error('SETTINGS_REGISTRY');
    const receipts = registry.map((v) => parseBackupReceipt(JSON.stringify(v)));
    if (
      receipts.some(
        (r, i) =>
          !r ||
          r.header.schemaVersion !== i ||
          r.header.storeId !== state.c.storeId ||
          r.header.reason !== 'PRE_MIGRATION',
      )
    )
      throw Error('SETTINGS_PREREQUISITE');
    const config = exact(read(path.join(state.data, 'backup-locations.json')), [
      'version',
      'storeId',
      'activeLocationId',
      'locations',
    ]);
    if (
      config.version !== 1 ||
      config.storeId !== state.c.storeId ||
      !Array.isArray(config.locations) ||
      config.locations.length > 64
    )
      throw Error('SETTINGS_LOCATION');
    const receipt = receipts[2];
    const matches = config.locations.filter((v) => v.locationId === receipt.header.locationId);
    if (matches.length !== 1) throw Error('SETTINGS_LOCATION');
    const loc = matches[0];
    if (
      !uuid(loc.folderMarkerId) ||
      typeof loc.absolutePath !== 'string' ||
      path.dirname(loc.absolutePath) !== path.join(state.root, `backup-parent-${state.c.mode}`)
    )
      throw Error('SETTINGS_LOCATION');
    const target = { locationId: loc.locationId, directory: loc.absolutePath };
    const service = new BackupService(
      {
        storeId: state.c.storeId,
        staging: path.join(state.data, 'staging'),
        assertOwned: async (candidate) => {
          await owned();
          if (
            candidate.locationId !== target.locationId ||
            candidate.directory !== target.directory
          )
            throw Error('SETTINGS_LOCATION');
          await verifyBackupLocation(target.directory, {
            version: 1,
            storeId: state.c.storeId,
            locationId: target.locationId,
            folderMarkerId: loc.folderMarkerId,
          });
        },
      },
      keys,
    );
    const verified = await service.validate(target, receipt.header.backupId);
    if (JSON.stringify(verified) !== JSON.stringify(receipt)) throw Error('SETTINGS_PREREQUISITE');
  }
  return { keys, owned };
}
module.exports = { preflight, authenticated };
