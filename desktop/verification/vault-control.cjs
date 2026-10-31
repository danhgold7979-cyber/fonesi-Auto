'use strict';
const path = require('node:path');
const { directory, read, write } = require('./vault-owned.cjs');
const { STAGES, uuid, exact, control } = require('./vault-contract.cjs');
async function run() {
  const [root, mode, stage] = process.argv.slice(2);
  if (
    process.argv.length !== 5 ||
    !['source', 'package'].includes(mode) ||
    ![...STAGES, 'context', ...STAGES.map((s) => `inspect-${s}`)].includes(stage)
  )
    throw new Error('ARGS');
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(path.resolve(__dirname, '..'))) throw new Error('BUILD');
  const { assertBorrowedPersistenceLease } = require('../build/persistence-files.cjs');
  const { prepareBackupKeyProfile } = require('../build/backup-key-profile.cjs');
  directory(root);
  const parentToken = read(path.join(root, '.owner'));
  if (!uuid(parentToken)) throw new Error('OWNER');
  const raw = read(path.join(root, `persistence-state-${mode}.json`)),
    state = JSON.parse(raw);
  exact(state, ['version', 'parentToken', 'ownerToken', 'storeId']);
  if (
    raw !== JSON.stringify(state) ||
    state.version !== 1 ||
    state.parentToken !== parentToken ||
    ![state.ownerToken, state.storeId].every(uuid)
  )
    throw new Error('STATE');
  const location = { root: path.join(root, `data-${mode}`), parentToken };
  const assertLease = () => assertBorrowedPersistenceLease(location, state.ownerToken);
  await assertLease();
  const witnessRaw = read(path.join(root, `persistence-witness-${mode}.json`)),
    witness = JSON.parse(witnessRaw);
  exact(witness, ['storeId', 'backupId', 'locationId', 'encryptedSha256']);
  if (
    witnessRaw !== JSON.stringify(witness) ||
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
  const { FoundationDatabase } = require('../build/foundation-database.cjs');
  const database = new FoundationDatabase(
    path.join(location.root, 'active.sqlite'),
    state.storeId,
    true,
  );
  try {
    database.validate();
    if (database.version !== 2) throw new Error('SCHEMA');
  } finally {
    database.close();
  }
  if (stage.startsWith('inspect-')) {
    const selected = stage.slice(8),
      { scanTree } = require('./vault-artifacts.cjs');
    const profile = path.join(root, `fonesi-auto-foundation-${mode}-vault-${selected}`);
    if (
      read(path.join(profile, '.owner')) !== 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n' ||
      read(path.join(location.root, 'vault', '.owner')) !== state.storeId
    )
      throw new Error('ARTIFACT_OWNER');
    const logRoot = path.join(root, `logs-${mode}-vault-${selected}`);
    if (
      !/^\{"schemaVersion":1,"storeId":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\}\n$/.test(
        read(path.join(logRoot, 'owner.json')),
      )
    )
      throw new Error('LOG_OWNER');
    const parts = [
      scanTree(profile),
      scanTree(path.join(root, `logs-${mode}-vault-${selected}`)),
      scanTree(path.join(location.root, 'vault')),
    ];
    if (selected === 'missing' || selected === 'corrupt')
      parts.push(scanTree(path.join(root, `persistence-vault-original-${mode}-${selected}.bin`)));
    await assertLease();
    write(path.join(root, `persistence-vault-artifacts-${mode}-${selected}.json`), {
      version: 1,
      mode,
      stage: selected,
      canaryAbsent: parts.every((v) => v.canaryAbsent),
      fileCount: parts.reduce((n, v) => n + v.fileCount, 0),
      dumpCount: parts.reduce((n, v) => n + v.dumpCount, 0),
    });
    console.log('VAULT_ARTIFACTS_INSPECTED');
    return;
  }
  const prepared = await prepareBackupKeyProfile(location.root, state.storeId, false, assertLease);
  if (!prepared.checkpoint) throw new Error('PROFILE');
  if (stage === 'context') {
    const fs = require('node:fs');
    const { createHash } = require('node:crypto');
    const local = read(path.join(location.root, 'key-profile', 'Local State'));
    const { validBackupLocalState } = require('../build/backup-key-profile.cjs');
    if (!validBackupLocalState(local)) throw new Error('PROFILE');
    const encoded = JSON.parse(local).os_crypt.encrypted_key;
    const protectedKey = Buffer.from(encoded, 'base64');
    if (
      protectedKey.toString('base64') !== encoded ||
      !protectedKey.subarray(0, 5).equals(Buffer.from('DPAPI')) ||
      protectedKey.length < 37 ||
      protectedKey.length > 4101
    )
      throw new Error('KEY_BLOB');
    const blob = protectedKey.subarray(5);
    const fd = fs.openSync(
      path.join(root, `persistence-vault-context-blob-${mode}.bin`),
      'wx',
      0o600,
    );
    try {
      fs.writeFileSync(fd, blob);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    await assertLease();
    write(path.join(root, `persistence-vault-context-control-${mode}.json`), {
      version: 1,
      mode,
      parentToken,
      ownerToken: state.ownerToken,
      storeId: state.storeId,
      blobSha256: createHash('sha256').update(blob).digest('hex'),
      localStateSha256: createHash('sha256').update(local).digest('hex'),
    });
    console.log('VAULT_CONTEXT_PREPARED');
    return;
  }
  const value = {
    version: 1,
    mode,
    stage,
    parentToken,
    ownerToken: state.ownerToken,
    storeId: state.storeId,
    checkpoint: path.basename(prepared.checkpoint),
  };
  control(JSON.stringify(value));
  await assertLease();
  write(path.join(root, `persistence-vault-control-${mode}-${stage}.json`), value);
  console.log('VAULT_CONTROL_PREPARED');
}
run().catch(() => {
  console.error('VAULT_CONTROL_FAILED');
  process.exitCode = 1;
});
