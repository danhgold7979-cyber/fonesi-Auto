'use strict';
// Trusted Node preflight for the next isolated native matrix, never a public route.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const uuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function directory(p) {
  const s = fs.lstatSync(p);
  if (
    p !== path.resolve(p) ||
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    fs.realpathSync(p).toLowerCase() !== p.toLowerCase()
  )
    throw new Error('DIRECTORY');
}
function read(p) {
  directory(path.dirname(p));
  const s = fs.lstatSync(p);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'r');
  try {
    const bytes = Buffer.alloc(65537);
    let n = 0;
    while (n < bytes.length) {
      const count = fs.readSync(fd, bytes, n, bytes.length - n, null);
      if (!count) break;
      n += count;
    }
    if (n > 65536) throw new Error('FILE');
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}
function write(p, v) {
  directory(path.dirname(p));
  const raw = JSON.stringify(v);
  if (Buffer.byteLength(raw) > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
async function run() {
  const [action, root, mode, boundary, stage] = process.argv.slice(2);
  if (
    !['prepare-store', 'prepare-maintenance'].includes(action) ||
    !['source', 'package'].includes(mode) ||
    (action === 'prepare-store'
      ? process.argv.length !== 7 ||
        !['BEFORE_COMMIT', 'AFTER_COMMIT'].includes(boundary) ||
        !['crash', 'reopen'].includes(stage)
      : process.argv.length !== 5)
  )
    throw new Error('ARGUMENTS');
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(path.resolve(__dirname, '..'))) throw new Error('BUILD_UNVERIFIED');
  const { assertBorrowedPersistenceLease } = require('../build/persistence-files.cjs');
  const { prepareBackupKeyProfile } = require('../build/backup-key-profile.cjs');
  const { parseControl } = require('./persistence-store-contract.cjs');
  directory(root);
  const parentToken = read(path.join(root, '.owner'));
  const raw = read(path.join(root, `persistence-state-${mode}.json`));
  const state = JSON.parse(raw);
  if (
    !uuid(parentToken) ||
    JSON.stringify(state) !== raw ||
    JSON.stringify(Object.keys(state)) !==
      JSON.stringify(['version', 'parentToken', 'ownerToken', 'storeId']) ||
    state.version !== 1 ||
    state.parentToken !== parentToken ||
    !uuid(state.ownerToken) ||
    !uuid(state.storeId)
  )
    throw new Error('STATE');
  const location = { root: path.join(root, `data-${mode}`), parentToken };
  const assertLease = () => assertBorrowedPersistenceLease(location, state.ownerToken);
  await assertLease();
  const witnessRaw = read(path.join(root, `persistence-witness-${mode}.json`));
  const witness = JSON.parse(witnessRaw);
  if (
    JSON.stringify(witness) !== witnessRaw ||
    JSON.stringify(Object.keys(witness)) !==
      JSON.stringify(['storeId', 'backupId', 'locationId', 'encryptedSha256']) ||
    witness.storeId !== state.storeId ||
    ![witness.storeId, witness.backupId, witness.locationId].every(uuid) ||
    typeof witness.encryptedSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(witness.encryptedSha256)
  )
    throw new Error('WITNESS');
  if (
    read(path.join(location.root, 'key-durability-proof.json')) !==
    JSON.stringify({ version: 1, ...witness, state: 'ORDERLY_AND_ABRUPT_RECOVERED' })
  )
    throw new Error('PROOF');
  const key = await prepareBackupKeyProfile(location.root, state.storeId, false, assertLease);
  if (key.checkpoint === null) throw new Error('CHECKPOINT');
  if (action === 'prepare-maintenance') {
    for (const kind of ['backup', 'restore'])
      fs.mkdirSync(path.join(root, `maintenance-${kind}-parent-${mode}`));
    await assertLease();
    write(path.join(root, `persistence-maintenance-control-${mode}.json`), {
      version: 1,
      mode,
      parentToken,
      ownerToken: state.ownerToken,
      storeId: state.storeId,
      checkpoint: path.basename(key.checkpoint),
    });
    console.log('PERSISTENCE_MATRIX_PREPARED');
    return;
  }
  const suffix = boundary.toLowerCase();
  const identityFile = path.join(root, `persistence-store-identity-${mode}-${suffix}.json`);
  let identity;
  if (stage === 'crash') {
    identity = { version: 1, mode, boundary, fixtureId: randomUUID() };
    write(identityFile, identity);
  } else {
    const identityRaw = read(identityFile);
    identity = JSON.parse(identityRaw);
    if (
      JSON.stringify(identity) !== identityRaw ||
      JSON.stringify(Object.keys(identity)) !==
        JSON.stringify(['version', 'mode', 'boundary', 'fixtureId']) ||
      identity.version !== 1 ||
      identity.mode !== mode ||
      identity.boundary !== boundary ||
      !uuid(identity.fixtureId)
    )
      throw new Error('IDENTITY');
  }
  const control = {
    version: 1,
    mode,
    stage,
    boundary,
    parentToken,
    ownerToken: state.ownerToken,
    storeId: state.storeId,
    fixtureId: identity.fixtureId,
    checkpoint: path.basename(key.checkpoint),
  };
  if (!parseControl(JSON.stringify(control))) throw new Error('CONTROL');
  await assertLease();
  write(path.join(root, `persistence-store-control-${mode}-${suffix}-${stage}.json`), control);
  console.log('PERSISTENCE_MATRIX_PREPARED');
}
run().catch(() => {
  console.log('PERSISTENCE_MATRIX_PREPARE_FAILED');
  process.exitCode = 1;
});
