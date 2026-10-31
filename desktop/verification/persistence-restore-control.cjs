'use strict';
// Trusted post-retirement supervisor control; never a renderer/application route.
const path = require('node:path'),
  { randomUUID } = require('node:crypto');
const {
  plain,
  read,
  write,
  exact,
  descendant,
  sourceWitness,
  uuid,
  control,
} = require('./persistence-restore-contract.cjs');
async function prepare(root, mode) {
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(path.resolve(__dirname, '..'))) throw new Error('BUILD_UNVERIFIED');
  const {
    verifyPersistenceRoot,
    acquirePersistenceLease,
    assertBorrowedPersistenceLease,
  } = require('../build/persistence-files.cjs');
  const { prepareBackupKeyProfile } = require('../build/backup-key-profile.cjs');
  if (!['source', 'package'].includes(mode)) throw new Error('RESTORE_MODE');
  plain(root);
  const runParentToken = read(path.join(root, '.owner'));
  if (!uuid(runParentToken)) throw new Error('RESTORE_OWNER');
  const descriptor = exact(read(path.join(root, `persistence-maintenance-restore-${mode}.json`)), [
    'version',
    'storeId',
    'restoreRoot',
    'sourceBackupId',
  ]);
  if (
    descriptor.version !== 1 ||
    !uuid(descriptor.storeId) ||
    !uuid(descriptor.sourceBackupId) ||
    typeof descriptor.restoreRoot !== 'string'
  )
    throw new Error('RESTORE_DESCRIPTOR');
  const state = exact(read(path.join(root, `persistence-state-${mode}.json`)), [
    'version',
    'parentToken',
    'ownerToken',
    'storeId',
  ]);
  if (
    state.version !== 1 ||
    state.storeId !== descriptor.storeId ||
    state.parentToken !== runParentToken ||
    !uuid(state.ownerToken)
  )
    throw new Error('RESTORE_SOURCE');
  await assertBorrowedPersistenceLease(
    { root: path.join(root, `data-${mode}`), parentToken: runParentToken },
    state.ownerToken,
  );
  descendant(root, mode, descriptor.restoreRoot, descriptor.storeId);
  const restoreParentToken = read(path.join(path.dirname(descriptor.restoreRoot), '.owner'));
  if (!uuid(restoreParentToken)) throw new Error('RESTORE_OWNER');
  const location = { root: descriptor.restoreRoot, parentToken: restoreParentToken };
  const provenance = await verifyPersistenceRoot(location);
  if (provenance.kind !== 'RESTORED' || provenance.storeId !== descriptor.storeId)
    throw new Error('RESTORE_PROVENANCE');
  if (
    read(path.join(descriptor.restoreRoot, 'restore-source.json')) !==
    JSON.stringify({ version: 1, storeId: descriptor.storeId, backupId: descriptor.sourceBackupId })
  )
    throw new Error('RESTORE_SOURCE');
  const ownerToken = randomUUID(),
    lease = await acquirePersistenceLease(location, ownerToken);
  const profile = await prepareBackupKeyProfile(
    location.root,
    descriptor.storeId,
    false,
    lease.assertOwned,
  );
  if (profile.checkpoint === null) throw new Error('RESTORE_CHECKPOINT');
  const value = {
    version: 1,
    mode,
    runParentToken,
    storeId: descriptor.storeId,
    restoreRoot: descriptor.restoreRoot,
    restoreParentToken,
    ownerToken,
    sourceOwnerToken: state.ownerToken,
    sourceBackupId: descriptor.sourceBackupId,
    checkpoint: path.basename(profile.checkpoint),
    sourceWitness: sourceWitness(path.join(root, `data-${mode}`)),
  };
  control(JSON.stringify(value));
  await lease.assertOwned();
  write(path.join(root, `persistence-restore-control-${mode}.json`), value);
  // The supervisor retains this identity through native exit + Job retirement.
  // No auto release/recovery, including any uncertain error after acquisition.
  return value;
}
module.exports = { prepare };
if (require.main === module) {
  if (process.argv.length !== 4) {
    console.log('PERSISTENCE_RESTORE_CONTROL_FAILED');
    process.exitCode = 1;
  } else
    prepare(process.argv[2], process.argv[3])
      .then(() => console.log('PERSISTENCE_RESTORE_CONTROL_PREPARED'))
      .catch(() => {
        console.log('PERSISTENCE_RESTORE_CONTROL_FAILED');
        process.exitCode = 1;
      });
}
