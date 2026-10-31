'use strict';
const { app, safeStorage } = require('electron');
const path = require('node:path');
const {
  CASES,
  VERSIONS,
  uuid,
  plain,
  oneOwner,
  read,
  write,
  exact,
  descendant,
  sourceWitness,
  control: parseControl,
  result,
} = require('./persistence-restore-contract.cjs');
const { FoundationPersistence } = require('../build/foundation-persistence.cjs');
const { FoundationDatabase, statement } = require('../build/foundation-database.cjs');
const { backupKeys, validBackupLocalState } = require('../build/backup-key-profile.cjs');
const {
  verifyPersistenceRoot,
  assertBorrowedPersistenceLease,
} = require('../build/persistence-files.cjs');
const { parsePersistenceProof, proofMatchesWitness } = require('../build/persistence-proof.cjs');
const { prepareOwnedProfile } = require('../build/profile-owner.cjs');
let root,
  mode,
  c,
  service,
  completed = false;
const cases = Object.fromEntries(CASES.map((k) => [k, false]));
const timer = setTimeout(() => {
  console.error('PERSISTENCE_RESTORE_DEADLINE');
  app.exit(74);
}, 110000);
function failed() {
  clearTimeout(timer);
  console.error('PERSISTENCE_RESTORE_FAILED');
  app.exit(1);
}
try {
  if (
    process.argv.slice(app.isPackaged ? 1 : 2).length ||
    ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_FORCE_IS_PACKAGED'].some(
      (k) => process.env[k] !== undefined,
    )
  )
    throw new Error('RESTORE_ARGS');
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
    if (app.commandLine.hasSwitch(flag)) throw new Error('RESTORE_ARGS');
  root = process.env.FONESI_PERSISTENCE_RUN_ROOT;
  mode = process.env.FONESI_PERSISTENCE_MODE;
  if (!['source', 'package'].includes(mode) || (mode === 'package') !== app.isPackaged)
    throw new Error('RESTORE_MODE');
  plain(root);
  c = parseControl(read(path.join(root, `persistence-restore-control-${mode}.json`)));
  if (c.mode !== mode || read(path.join(root, '.owner')) !== c.runParentToken)
    throw new Error('RESTORE_CONTROL');
  descendant(root, mode, c.restoreRoot, c.storeId);
  if (read(path.join(path.dirname(c.restoreRoot), '.owner')) !== c.restoreParentToken)
    throw new Error('RESTORE_OWNER');
  const provenance = exact(read(path.join(c.restoreRoot, '.persistence-owner.json')), [
    'version',
    'storeId',
    'kind',
    'restoreReceiptId',
  ]);
  if (
    provenance.version !== 1 ||
    provenance.kind !== 'RESTORED' ||
    provenance.storeId !== c.storeId ||
    !uuid(provenance.restoreReceiptId) ||
    read(path.join(c.restoreRoot, '.restore-receipt.json')) !==
      JSON.stringify({
        version: 1,
        storeId: c.storeId,
        restoreReceiptId: provenance.restoreReceiptId,
        quarantined: true,
      })
  )
    throw new Error('RESTORE_PROVENANCE');
  const lock = path.join(c.restoreRoot, '.writer-lock');
  plain(lock);
  if (
    !oneOwner(lock) ||
    read(path.join(lock, 'owner.json')) !==
      JSON.stringify({ version: 1, storeId: c.storeId, ownerToken: c.ownerToken })
  )
    throw new Error('RESTORE_LEASE');
  if (
    read(path.join(c.restoreRoot, 'restore-source.json')) !==
    JSON.stringify({ version: 1, storeId: c.storeId, backupId: c.sourceBackupId })
  )
    throw new Error('RESTORE_SOURCE');
  const profile = path.join(c.restoreRoot, 'key-profile');
  plain(profile);
  const material = read(path.join(profile, 'Local State'));
  if (
    read(path.join(profile, '.key-profile-owner.json')) !==
      JSON.stringify({ version: 1, storeId: c.storeId }) ||
    !validBackupLocalState(material) ||
    material !== read(path.join(c.restoreRoot, c.checkpoint))
  )
    throw new Error('RESTORE_KEY');
  const proof = parsePersistenceProof(read(path.join(c.restoreRoot, 'key-durability-proof.json')));
  if (!proof || proof.storeId !== c.storeId) throw new Error('RESTORE_PROOF');
  if (sourceWitness(path.join(root, `data-${mode}`)) !== c.sourceWitness)
    throw new Error('RESTORE_SOURCE_CHANGED');
  const versions = {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  };
  if (
    JSON.stringify(versions) !== JSON.stringify(VERSIONS) ||
    process.platform !== 'win32' ||
    process.arch !== 'x64'
  )
    throw new Error('RESTORE_RUNTIME');
  const paths = prepareOwnedProfile(path.join(root, `fonesi-auto-foundation-${mode}-restore`));
  if (app.isReady()) throw new Error('RESTORE_LATE');
  for (const [k, v] of Object.entries(paths)) app.setPath(k, v);
  app.setPath('sessionData', profile);
  cases.profile_before_ready = !app.isReady();
  cases.copied_key_material = true;
  app
    .whenReady()
    .then(async () => {
      const location = { root: c.restoreRoot, parentToken: c.restoreParentToken };
      await assertBorrowedPersistenceLease(location, c.ownerToken);
      await assertBorrowedPersistenceLease(
        { root: path.join(root, `data-${mode}`), parentToken: c.runParentToken },
        c.sourceOwnerToken,
      );
      cases.restored_lease = true;
      const rootProof = await verifyPersistenceRoot(location);
      cases.root_quarantined = rootProof.kind === 'RESTORED' && rootProof.storeId === c.storeId;
      service = await FoundationPersistence.open(
        location,
        c.ownerToken,
        await backupKeys(safeStorage),
        false,
      );
      const original = await service.authenticateBootstrap();
      cases.original_bootstrap_authenticated = true;
      cases.proof_bound = proofMatchesWitness(proof, {
        storeId: original.header.storeId,
        backupId: original.header.backupId,
        locationId: original.header.locationId,
        encryptedSha256: original.encryptedSha256,
      });
      if (!cases.proof_bound) throw new Error('RESTORE_PROOF');
      await service.initialize(Date.now());
      const inspect = () => {
        const db = new FoundationDatabase(
          path.join(c.restoreRoot, 'active.sqlite'),
          c.storeId,
          true,
        );
        try {
          db.validate();
          const row = statement(
            db.connection,
            'SELECT restore_quarantine,restored_from_backup_id FROM foundation_store WHERE singleton=1',
            (s) => s.get(),
          );
          return { version: db.version, row, fingerprint: db.fingerprint() };
        } finally {
          db.close();
        }
      };
      const before = inspect();
      cases.schema_two = before.version === 2;
      cases.sql_quarantined =
        before.row.restore_quarantine === 1 &&
        before.row.restored_from_backup_id === c.sourceBackupId;
      const automatic = await service.backup(Date.now() + 86400000, true);
      cases.automatic_backup_disabled =
        automatic === null && inspect().fingerprint === before.fingerprint;
      await service.shutdown();
      service = null;
      cases.service_closed = true;
      await assertBorrowedPersistenceLease(location, c.ownerToken);
      cases.source_unchanged = sourceWitness(path.join(root, `data-${mode}`)) === c.sourceWitness;
      if (!Object.values(cases).every((v) => v === true)) throw new Error('RESTORE_CASE');
      completed = true;
      app.quit();
    })
    .catch(failed);
  app.once('will-quit', () => {
    try {
      if (!completed) throw new Error('RESTORE_EARLY_QUIT');
      const value = { version: 1, scope: 'COPIED_PROFILE_RESTORE_REOPEN', mode, versions, cases };
      result(JSON.stringify(value));
      write(path.join(root, `persistence-restore-result-${mode}.json`), value);
      clearTimeout(timer);
      console.log('PERSISTENCE_RESTORE_ORDERLY');
    } catch {
      failed();
    }
  });
} catch {
  failed();
}
