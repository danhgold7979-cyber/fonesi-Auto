'use strict';
// Verification-only authenticated observation; no migration, device or capture writes.
const fs = require('node:fs'),
  path = require('node:path');
const { plain, read, uuid } = require('./persistence-restore-contract.cjs');
function failure() {
  throw Error('FLEET_UI_SCHEMA4');
}
function parsed(file) {
  const raw = read(file),
    value = JSON.parse(raw);
  if (JSON.stringify(value) !== raw) failure();
  return value;
}
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())
  )
    failure();
}
function buildModule(name, trustedPackage) {
  if (trustedPackage !== undefined)
    return require('./main-runtime-version-package.cjs').loadBuild(trustedPackage, name);
  return require(path.join(__dirname, '../build', name));
}
function receipts(dataRoot, storeId, trustedPackage) {
  plain(dataRoot);
  if (!uuid(storeId)) failure();
  const { parseBackupReceipt } = buildModule('backup-service.cjs', trustedPackage);
  const list = parsed(path.join(dataRoot, 'migration-backups.json'));
  if (!Array.isArray(list) || list.length !== 4) failure();
  const result = list.map((entry, index) => {
    const receipt = parseBackupReceipt(JSON.stringify(entry));
    if (
      !receipt ||
      receipt.header.schemaVersion !== index ||
      receipt.header.storeId !== storeId ||
      receipt.header.reason !== 'PRE_MIGRATION'
    )
      failure();
    return receipt;
  });
  if (new Set(result.map((r) => r.header.backupId)).size !== 4) failure();
  return result;
}
function assertDurableEmpty(value) {
  if (
    value?.meta?.revision !== 2 ||
    value.meta.host_epoch !== 1 ||
    ['devices', 'bindings', 'identityEvidence', 'captures', 'holds'].some(
      (key) => !Array.isArray(value[key]) || value[key].length !== 0,
    )
  )
    failure();
  return true;
}
function assertMigrationBinding(row, receipt, migrationHash) {
  if (
    row?.version !== 4 ||
    row.script_sha256 !== migrationHash ||
    row.prerequisite_backup_id !== receipt.header.backupId
  )
    failure();
  return true;
}
function assertCaptureAbsent(dataRoot) {
  try {
    fs.lstatSync(path.join(dataRoot, 'captures-v1'));
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
  failure();
}
function inspectSchema4(dataRoot, storeId, expectedBackupId, trustedPackage) {
  const list = receipts(dataRoot, storeId, trustedPackage),
    receipt = list[3];
  if (expectedBackupId !== undefined && receipt.header.backupId !== expectedBackupId) failure();
  const { FoundationDatabase, statement, MIGRATION_HASHES } = buildModule(
    'foundation-database.cjs',
    trustedPackage,
  );
  const db = new FoundationDatabase(path.join(dataRoot, 'active.sqlite'), storeId, true);
  try {
    db.validate();
    if (db.version !== 4) failure();
    db.readSettings();
    assertDurableEmpty(db.readDurable());
    const row = statement(
      db.connection,
      'SELECT version,script_sha256,prerequisite_backup_id FROM schema_migration WHERE version=4',
      (s) => s.get(),
    );
    assertMigrationBinding(row, receipt, MIGRATION_HASHES[3]);
    assertCaptureAbsent(dataRoot);
    return Object.freeze({
      migration4ReceiptBound: true,
      durableStartupCommitted: true,
      captureStoreEmpty: true,
    });
  } finally {
    db.close();
  }
}
function launchState(launch, trustedPackage) {
  const managed = path.dirname(launch),
    root = path.dirname(path.dirname(managed));
  const { rootForLaunch } = require('./fleet-ui-contract.cjs');
  if (rootForLaunch(launch) !== root) failure();
  const journal = require('../launch/launch-journal.cjs'),
    chain = journal.inspect(managed, launch),
    header = chain.header;
  if (
    header.entryMode !== (trustedPackage === undefined ? 'SOURCE' : 'PACKAGE') ||
    header.maintenance !== 'NORMAL' ||
    header.dataRoot !== path.join(managed, 'data-main') ||
    header.parentToken !== read(path.join(managed, '.owner')) ||
    chain.pending?.stage !== 'MAIN' ||
    chain.latest?.stage !== 'PREPARE_READY'
  )
    failure();
  if (trustedPackage !== undefined) {
    require('./main-runtime-version-package.cjs').assertPackage(trustedPackage);
    const control = parsed(path.join(launch, 'auth-control.json'));
    if (
      control.version !== 3 ||
      control.packageRoot !== trustedPackage.packageRoot ||
      header.executableSha256 !==
        require('./main-runtime-version-package.cjs').fileProof(
          path.join(trustedPackage.packageRoot, 'runtime/electron/electron.exe'),
        ).sha256
    )
      failure();
  }
  const auth = parsed(path.join(launch, 'auth-observed.json')),
    provision = parsed(path.join(launch, 'provision-observed.json'));
  exact(auth, ['version', 'stage', 'status', 'witness']);
  exact(provision, ['version', 'stage', 'status', 'witness']);
  if (
    auth.version !== 1 ||
    auth.stage !== 'auth' ||
    auth.status !== 'AUTHENTICATED' ||
    provision.version !== 1 ||
    provision.stage !== 'provision' ||
    provision.status !== 'PROVISIONED' ||
    JSON.stringify(provision.witness) !== JSON.stringify(auth.witness)
  )
    failure();
  exact(auth.witness, ['storeId', 'backupId', 'locationId', 'encryptedSha256']);
  if (
    auth.witness.storeId !== header.storeId ||
    ![auth.witness.backupId, auth.witness.locationId].every(uuid) ||
    typeof auth.witness.encryptedSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(auth.witness.encryptedSha256) ||
    auth.witness.encryptedSha256.length !== 64
  )
    failure();
  if (
    read(path.join(header.dataRoot, 'key-durability-proof.json')) !==
    JSON.stringify({
      version: 2,
      ...auth.witness,
      state: 'ORDERLY_REOPEN_AUTHENTICATED',
      runtimeCertification: 'ELECTRON_45_1_0_WIN_X64_DPAPI_V1',
    })
  )
    failure();
  return {
    managed,
    root,
    header,
    witness: auth.witness,
    backupParent: path.join(managed, 'verification-backup-parent'),
  };
}
async function observeSchema4(launch, safeStorage, trustedPackage) {
  const state = launchState(launch, trustedPackage),
    { header, witness } = state;
  const { assertBorrowedPersistenceLease, verifyBackupLocation } = buildModule(
    'persistence-files.cjs',
    trustedPackage,
  );
  const { backupKeys } = buildModule('backup-key-profile.cjs', trustedPackage);
  const { FoundationPersistence } = buildModule('foundation-persistence.cjs', trustedPackage);
  const { BackupService } = buildModule('backup-service.cjs', trustedPackage);
  const owned = () =>
    assertBorrowedPersistenceLease(
      { root: header.dataRoot, parentToken: header.parentToken },
      header.ownerToken,
    );
  await owned();
  const keys = await backupKeys(safeStorage);
  const persistence = await FoundationPersistence.open(
    { root: header.dataRoot, parentToken: header.parentToken },
    header.ownerToken,
    keys,
    false,
  );
  try {
    const original = await persistence.authenticateBootstrap();
    if (
      original.header.storeId !== witness.storeId ||
      original.header.backupId !== witness.backupId ||
      original.header.locationId !== witness.locationId ||
      original.encryptedSha256 !== witness.encryptedSha256
    )
      failure();
  } finally {
    persistence.close();
  }
  const list = receipts(header.dataRoot, header.storeId, trustedPackage),
    receipt = list[3];
  const config = parsed(path.join(header.dataRoot, 'backup-locations.json'));
  exact(config, ['version', 'storeId', 'activeLocationId', 'locations']);
  if (
    config.version !== 1 ||
    config.storeId !== header.storeId ||
    !Array.isArray(config.locations) ||
    config.locations.length < 1 ||
    config.locations.length > 64
  )
    failure();
  const matches = config.locations.filter((item) => item.locationId === receipt.header.locationId);
  if (matches.length !== 1) failure();
  const location = matches[0];
  exact(location, ['locationId', 'folderMarkerId', 'absolutePath', 'selectedUtc', 'state']);
  if (
    !uuid(location.locationId) ||
    !uuid(location.folderMarkerId) ||
    typeof location.absolutePath !== 'string' ||
    location.state !== 'ACTIVE' ||
    config.activeLocationId !== location.locationId ||
    location.absolutePath !== path.join(state.backupParent, `backup-${location.folderMarkerId}`)
  )
    failure();
  const target = Object.freeze({
    locationId: location.locationId,
    directory: location.absolutePath,
  });
  const service = new BackupService(
    {
      storeId: header.storeId,
      staging: path.join(header.dataRoot, 'staging'),
      assertOwned: async (selected) => {
        await owned();
        if (selected.locationId !== target.locationId || selected.directory !== target.directory)
          failure();
        await verifyBackupLocation(target.directory, {
          version: 1,
          storeId: header.storeId,
          locationId: target.locationId,
          folderMarkerId: location.folderMarkerId,
        });
      },
    },
    keys,
  );
  const validated = await service.validate(target, receipt.header.backupId);
  if (JSON.stringify(validated) !== JSON.stringify(receipt)) failure();
  await owned();
  if (
    JSON.stringify(receipts(header.dataRoot, header.storeId, trustedPackage)) !==
      JSON.stringify(list) ||
    JSON.stringify(parsed(path.join(header.dataRoot, 'backup-locations.json'))) !==
      JSON.stringify(config)
  )
    failure();
  if (JSON.stringify(launchState(launch, trustedPackage)) !== JSON.stringify(state)) failure();
  inspectSchema4(header.dataRoot, header.storeId, receipt.header.backupId, trustedPackage);
  return true;
}
module.exports = {
  observeSchema4,
  inspectSchema4,
  assertDurableEmpty,
  assertMigrationBinding,
  assertCaptureAbsent,
  receipts,
  launchState,
};
