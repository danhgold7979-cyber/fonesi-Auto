'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const {
  STAGES,
  plain,
  read,
  write,
  exact,
  uuid,
  control,
  witness,
  backupWitness,
  restored,
} = require('./settings-recovery-contract.cjs');
async function prepare(root, mode, stage) {
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(path.resolve(__dirname, '..'))) throw Error('RECOVERY_BUILD');
  if (!['source', 'package'].includes(mode) || !STAGES.includes(stage))
    throw Error('RECOVERY_ARGS');
  plain(root);
  const runParentToken = read(path.join(root, '.owner'));
  if (!uuid(runParentToken)) throw Error('RECOVERY_OWNER');
  const {
    acquirePersistenceLease,
    assertBorrowedPersistenceLease,
    replacePersistenceFile,
  } = require('../build/persistence-files.cjs');
  const { prepareBackupKeyProfile } = require('../build/backup-key-profile.cjs');
  const original = exact(read(path.join(root, `persistence-state-${mode}.json`)), [
    'version',
    'parentToken',
    'ownerToken',
    'storeId',
  ]);
  if (
    original.version !== 1 ||
    original.parentToken !== runParentToken ||
    ![original.storeId, original.ownerToken].every(uuid)
  )
    throw Error('RECOVERY_STATE');
  let dataRoot = path.join(root, `data-${mode}`),
    parentToken = runParentToken,
    ownerToken = original.ownerToken;
  const storeId = original.storeId;
  const target = stage.startsWith('previous') ? 'previous' : 'current';
  if (target === 'previous') {
    const parent = path.join(root, `settings-recovery-parent-${mode}-current`),
      selected = restored(parent, storeId);
    dataRoot = selected.root;
    parentToken = selected.parentToken;
    const ownership = path.join(root, `settings-recovery-owner-${mode}.json`);
    if (stage === 'previous-cancel') {
      ownerToken = randomUUID();
      await acquirePersistenceLease({ root: dataRoot, parentToken }, ownerToken);
      write(ownership, { version: 1, dataRoot, parentToken, ownerToken, storeId });
    } else {
      const value = exact(read(ownership), [
        'version',
        'dataRoot',
        'parentToken',
        'ownerToken',
        'storeId',
      ]);
      if (
        value.version !== 1 ||
        value.dataRoot !== dataRoot ||
        value.parentToken !== parentToken ||
        value.storeId !== storeId ||
        !uuid(value.ownerToken)
      )
        throw Error('RECOVERY_OWNER');
      ownerToken = value.ownerToken;
    }
  }
  const lease = () => assertBorrowedPersistenceLease({ root: dataRoot, parentToken }, ownerToken);
  await lease();
  let backupId = null,
    backupFile = null,
    destinationParent = null;
  if (stage !== 'recovery-setup') {
    const backup = exact(read(path.join(root, `settings-recovery-backup-${mode}.json`)), [
      'version',
      'storeId',
      'backupId',
      'backupFile',
      'settings',
      'previous',
    ]);
    if (
      backup.version !== 1 ||
      backup.storeId !== storeId ||
      !uuid(backup.backupId) ||
      typeof backup.backupFile !== 'string' ||
      path.basename(backup.backupFile) !== `backup-${backup.backupId}.fonaub`
    )
      throw Error('RECOVERY_BACKUP');
    backupId = backup.backupId;
    backupFile = backup.backupFile;
    destinationParent = path.join(root, `settings-recovery-parent-${mode}-${target}`);
    if (stage.endsWith('-cancel')) {
      fs.mkdirSync(destinationParent);
      const { FoundationDatabase, statement } = require('../build/foundation-database.cjs');
      const db = new FoundationDatabase(path.join(dataRoot, 'active.sqlite'), storeId);
      try {
        const before = db.readSettings(),
          previous = db.readPreviousSettings();
        if (!previous || db.version !== 3 || before.revision <= previous.revision)
          throw Error('RECOVERY_FIXTURE');
        db.connection.exec('PRAGMA ignore_check_constraints=ON');
        const changed = statement(
          db.connection,
          `UPDATE app_settings_revision SET tile_width=1 WHERE slot='${target === 'current' ? 'CURRENT' : 'PREVIOUS'}'`,
          (s) => s.run(),
        );
        if (changed.changes !== 1) throw Error('RECOVERY_FIXTURE');
        let rejected = false;
        try {
          db.validate();
        } catch {
          rejected = true;
        }
        if (!rejected) throw Error('RECOVERY_FIXTURE');
      } finally {
        db.close();
      }
      write(path.join(root, `settings-recovery-before-${mode}-${target}.json`), {
        version: 1,
        dataRoot,
        target,
        classified: true,
        files: witness(dataRoot),
        backupFiles: backupWitness(backupFile),
      });
    } else {
      const previous = exact(
        read(path.join(root, `settings-recovery-before-${mode}-${target}.json`)),
        ['version', 'dataRoot', 'target', 'classified', 'files', 'backupFiles'],
      );
      if (
        previous.version !== 1 ||
        previous.dataRoot !== dataRoot ||
        previous.target !== target ||
        previous.classified !== true ||
        JSON.stringify(previous.files) !== JSON.stringify(witness(dataRoot)) ||
        JSON.stringify(previous.backupFiles) !== JSON.stringify(backupWitness(backupFile))
      )
        throw Error('RECOVERY_CHANGED');
    }
  }
  const key = await prepareBackupKeyProfile(dataRoot, storeId, false, lease);
  if (!key.checkpoint) throw Error('RECOVERY_KEY');
  const attestation = JSON.parse(read(path.join(root, 'persistence-runtime-attestation.json')));
  if (typeof attestation.exeSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(attestation.exeSha256))
    throw Error('RECOVERY_RUNTIME');
  const launch = {
    version: 2,
    state: 'READY',
    root: dataRoot,
    parentToken,
    ownerToken,
    storeId,
    checkpoint: path.basename(key.checkpoint),
    runtimeExeSha256: attestation.exeSha256,
  };
  const ready = path.join(dataRoot, '.ready-launch.json');
  if (fs.existsSync(ready)) {
    const old = exact(read(ready), Object.keys(launch));
    if (
      old.version !== 2 ||
      old.state !== 'READY' ||
      old.root !== dataRoot ||
      old.parentToken !== parentToken ||
      old.ownerToken !== ownerToken ||
      old.storeId !== storeId ||
      old.runtimeExeSha256 !== attestation.exeSha256
    )
      throw Error('RECOVERY_LAUNCH');
    await replacePersistenceFile(ready, JSON.stringify(launch));
    if (read(ready) !== JSON.stringify(launch)) throw Error('RECOVERY_LAUNCH');
  } else write(ready, launch);
  const value = {
    version: 1,
    mode,
    stage,
    runParentToken,
    dataRoot,
    parentToken,
    ownerToken,
    storeId,
    checkpoint: path.basename(key.checkpoint),
    backupId,
    backupFile,
    destinationParent,
  };
  control(JSON.stringify(value));
  await lease();
  write(path.join(root, `settings-recovery-control-${mode}-${stage}.json`), value);
}
if (require.main === module) {
  if (process.argv.length !== 6 || process.argv[2] !== 'prepare') {
    console.log('SETTINGS_RECOVERY_CONTROL_FAILED');
    process.exitCode = 1;
  } else
    prepare(process.argv[3], process.argv[4], process.argv[5]).then(
      () => console.log('SETTINGS_RECOVERY_CONTROL_PREPARED'),
      () => {
        console.log('SETTINGS_RECOVERY_CONTROL_FAILED');
        process.exitCode = 1;
      },
    );
}
module.exports = { prepare };
