'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { STAGES, plain, read, write, exact, uuid, control } = require('./settings-contract.cjs');
async function prepare(root, mode, stage) {
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(path.resolve(__dirname, '..'))) throw Error('SETTINGS_BUILD');
  const {
    assertBorrowedPersistenceLease,
    replacePersistenceFile,
  } = require('../build/persistence-files.cjs');
  const { prepareBackupKeyProfile } = require('../build/backup-key-profile.cjs');
  if (!['source', 'package'].includes(mode) || !STAGES.includes(stage))
    throw Error('SETTINGS_ARGS');
  plain(root);
  const parentToken = read(path.join(root, '.owner'));
  if (!uuid(parentToken)) throw Error('SETTINGS_OWNER');
  const state = exact(read(path.join(root, `persistence-state-${mode}.json`)), [
    'version',
    'parentToken',
    'ownerToken',
    'storeId',
  ]);
  if (
    state.version !== 1 ||
    state.parentToken !== parentToken ||
    ![state.ownerToken, state.storeId].every(uuid)
  )
    throw Error('SETTINGS_STATE');
  const location = { root: path.join(root, `data-${mode}`), parentToken };
  const assertLease = () => assertBorrowedPersistenceLease(location, state.ownerToken);
  await assertLease();
  const original = exact(read(path.join(root, `persistence-witness-${mode}.json`)), [
    'storeId',
    'backupId',
    'locationId',
    'encryptedSha256',
  ]);
  if (
    original.storeId !== state.storeId ||
    ![original.storeId, original.backupId, original.locationId].every(uuid) ||
    typeof original.encryptedSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(original.encryptedSha256)
  )
    throw Error('SETTINGS_WITNESS');
  if (
    read(path.join(location.root, 'key-durability-proof.json')) !==
    JSON.stringify({ version: 1, ...original, state: 'ORDERLY_AND_ABRUPT_RECOVERED' })
  )
    throw Error('SETTINGS_PROOF');
  const key = await prepareBackupKeyProfile(location.root, state.storeId, false, assertLease);
  if (!key.checkpoint) throw Error('SETTINGS_KEY');
  let fixtureId = randomUUID();
  if (stage.endsWith('-reopen')) {
    const prior = control(
      read(path.join(root, `settings-control-${mode}-${stage.replace('reopen', 'crash')}.json`)),
    );
    if (prior.storeId !== state.storeId || prior.ownerToken !== state.ownerToken)
      throw Error('SETTINGS_FIXTURE');
    fixtureId = prior.fixtureId;
  }
  const value = {
    version: 1,
    mode,
    stage,
    parentToken,
    ownerToken: state.ownerToken,
    storeId: state.storeId,
    checkpoint: path.basename(key.checkpoint),
    fixtureId,
  };
  control(JSON.stringify(value));
  if (stage === 'ui' || stage === 'reopen') {
    const attestation = JSON.parse(read(path.join(root, 'persistence-runtime-attestation.json')));
    if (typeof attestation.exeSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(attestation.exeSha256))
      throw Error('SETTINGS_RUNTIME');
    const launch = {
      version: 2,
      state: 'READY',
      root: location.root,
      parentToken,
      ownerToken: state.ownerToken,
      storeId: state.storeId,
      checkpoint: path.basename(key.checkpoint),
      runtimeExeSha256: attestation.exeSha256,
    };
    const file = path.join(location.root, '.ready-launch.json');
    if (fs.existsSync(file)) {
      const old = exact(read(file), Object.keys(launch));
      if (
        old.version !== 2 ||
        old.state !== 'READY' ||
        old.root !== location.root ||
        old.storeId !== state.storeId ||
        old.ownerToken !== state.ownerToken ||
        old.parentToken !== parentToken ||
        old.runtimeExeSha256 !== attestation.exeSha256
      )
        throw Error('SETTINGS_LAUNCH');
      await replacePersistenceFile(file, JSON.stringify(launch));
      if (read(file) !== JSON.stringify(launch)) throw Error('SETTINGS_LAUNCH');
    } else write(file, launch);
  }
  await assertLease();
  write(path.join(root, `settings-control-${mode}-${stage}.json`), value);
}
if (require.main === module) {
  if (process.argv.length !== 6 || process.argv[2] !== 'prepare') {
    console.log('SETTINGS_CONTROL_FAILED');
    process.exitCode = 1;
  } else
    prepare(process.argv[3], process.argv[4], process.argv[5]).then(
      () => console.log('SETTINGS_CONTROL_PREPARED'),
      () => {
        console.log('SETTINGS_CONTROL_FAILED');
        process.exitCode = 1;
      },
    );
}
module.exports = { prepare };
