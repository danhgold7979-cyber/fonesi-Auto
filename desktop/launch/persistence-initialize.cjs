'use strict';
// Production initialization: native dialog provisioning, then a SEPARATE orderly
// authentication process. There is deliberately no crash or test-provider switch.
const { app, safeStorage, dialog } = require('electron');
const fs = require('node:fs'),
  path = require('node:path');
const { prepareOwnedProfile } = require('../build/profile-owner.cjs');
const { backupKeys, validBackupLocalState } = require('../build/backup-key-profile.cjs');
const { FoundationPersistence } = require('../build/foundation-persistence.cjs');
const { runNativePersistenceProvision } = require('../build/persistence-native.cjs');
const {
  assertCertifiedPersistenceEntry,
  persistenceDataGuard,
} = require('../build/persistence-entry.cjs');
const { assertBorrowedPersistenceLease } = require('../build/persistence-files.cjs');
const uuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function plain(p) {
  const s = fs.lstatSync(p);
  if (
    path.resolve(p) !== p ||
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    fs.realpathSync(p).toLowerCase() !== p.toLowerCase()
  )
    throw new Error('OWNER');
}
function read(p) {
  plain(path.dirname(p));
  const s = fs.lstatSync(p);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'r'),
    b = Buffer.alloc(65537);
  let n = 0;
  try {
    for (;;) {
      const c = fs.readSync(fd, b, n, b.length - n, null);
      if (!c) break;
      n += c;
      if (n === b.length) throw new Error('FILE');
    }
  } finally {
    fs.closeSync(fd);
  }
  return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(b.subarray(0, n));
}
function single(p, name) {
  plain(p);
  const d = fs.opendirSync(p);
  try {
    if (d.readSync()?.name !== name || d.readSync() !== null) throw new Error('ENTRIES');
  } finally {
    d.closeSync();
  }
}
function write(p, value) {
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
let control,
  launch,
  service,
  result,
  completed = false;
function fail() {
  fs.writeSync(2, 'PERSISTENCE_INITIALIZE_FAILED\n');
  app.exit(1);
}
try {
  if (
    app.isPackaged ||
    process.argv.length !== 2 ||
    ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_FORCE_IS_PACKAGED'].some(
      (k) => process.env[k] !== undefined,
    )
  )
    throw new Error('ARGUMENTS');
  const file = process.env.FONESI_PERSISTENCE_LAUNCH_CONTROL;
  if (
    typeof file !== 'string' ||
    !['provision-control.json', 'auth-control.json'].includes(path.basename(file))
  )
    throw new Error('CONTROL');
  launch = path.dirname(file);
  plain(launch);
  const raw = read(file);
  control = JSON.parse(raw);
  const exact = {
    version: control.version,
    stage: control.stage,
    root: control.root,
    parentToken: control.parentToken,
    ownerToken: control.ownerToken,
    storeId: control.storeId,
    checkpoint: control.checkpoint,
    fresh: control.fresh,
    profile: control.profile,
    runtimeExeSha256: control.runtimeExeSha256,
    ...(control.version >= 2 ? { dataRoot: control.dataRoot, provenance: control.provenance } : {}),
    ...(control.version === 3 ? { packageRoot: control.packageRoot } : {}),
  };
  if (
    ![1, 2, 3].includes(control.version) ||
    JSON.stringify(exact) !== raw ||
    !['provision', 'auth'].includes(control.stage) ||
    path.basename(file) !== control.stage + '-control.json' ||
    ![control.parentToken, control.ownerToken, control.storeId].every(uuid) ||
    typeof control.fresh !== 'boolean' ||
    typeof control.runtimeExeSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(control.runtimeExeSha256)
  )
    throw new Error('CONTROL');
  if (control.version === 3) {
    if (
      typeof control.packageRoot !== 'string' ||
      control.packageRoot !== path.resolve(__dirname, '../..')
    )
      throw new Error('PACKAGE_ROOT');
    require('./package-admission.cjs').verifyPackage(control.packageRoot);
    persistenceDataGuard(control.packageRoot)(control.root);
  }
  plain(control.root);
  if (
    path.dirname(launch) !== control.root ||
    !/^launch-[0-9a-f-]{36}$/.test(path.basename(launch)) ||
    !uuid(read(path.join(launch, '.owner'))) ||
    read(path.join(control.root, '.owner')) !== control.parentToken
  )
    throw new Error('OWNER');
  const data = control.version >= 2 ? control.dataRoot : path.join(control.root, 'data-main');
  if (
    typeof data !== 'string' ||
    path.dirname(data) !== control.root ||
    !/^data-[a-z0-9-]+$/.test(path.basename(data))
  )
    throw new Error('OWNER');
  plain(data);
  const provenance =
    control.version >= 2
      ? control.provenance
      : { version: 1, storeId: control.storeId, kind: 'FRESH', restoreReceiptId: null };
  if (
    !provenance ||
    Object.keys(provenance).join('|') !== 'version|storeId|kind|restoreReceiptId' ||
    provenance.version !== 1 ||
    provenance.storeId !== control.storeId ||
    !['FRESH', 'RESTORED'].includes(provenance.kind) ||
    (provenance.kind === 'FRESH'
      ? provenance.restoreReceiptId !== null
      : !uuid(provenance.restoreReceiptId)) ||
    read(path.join(data, '.persistence-owner.json')) !== JSON.stringify(provenance)
  )
    throw new Error('OWNER');
  if (provenance.kind === 'RESTORED') {
    if (
      control.fresh ||
      control.stage !== 'auth' ||
      path.basename(data) !== 'data-' + control.storeId
    )
      throw new Error('RESTORED_PROVISION_DENIED');
    if (
      read(path.join(data, '.restore-receipt.json')) !==
      JSON.stringify({
        version: 1,
        storeId: control.storeId,
        restoreReceiptId: provenance.restoreReceiptId,
        quarantined: true,
      })
    )
      throw new Error('RESTORE_RECEIPT');
  } else {
    try {
      fs.lstatSync(path.join(data, '.restore-receipt.json'));
      throw new Error('RESTORE_RECEIPT');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  const lock = path.join(data, '.writer-lock');
  plain(lock);
  single(lock, 'owner.json');
  if (
    read(path.join(lock, 'owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId, ownerToken: control.ownerToken })
  )
    throw new Error('LEASE');
  const keys = path.join(data, 'key-profile');
  plain(keys);
  if (
    read(path.join(keys, '.key-profile-owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId })
  )
    throw new Error('KEY_PROFILE');
  if (control.fresh) {
    if (control.stage !== 'provision' || control.checkpoint !== null)
      throw new Error('KEY_PROFILE');
    single(keys, '.key-profile-owner.json');
  } else {
    if (
      typeof control.checkpoint !== 'string' ||
      !/^key-checkpoint-[0-9a-f-]{36}\.json$/.test(control.checkpoint) ||
      !uuid(control.checkpoint.slice(15, -5))
    )
      throw new Error('CHECKPOINT');
    const local = read(path.join(keys, 'Local State'));
    if (!validBackupLocalState(local) || local !== read(path.join(data, control.checkpoint)))
      throw new Error('KEY_PROFILE');
  }
  if (path.dirname(control.profile) !== launch) throw new Error('PROFILE');
  const paths = prepareOwnedProfile(control.profile);
  if (app.isReady()) throw new Error('LATE');
  for (const [k, v] of Object.entries(paths)) app.setPath(k, v);
  app.setPath('sessionData', keys);
  // Caller verified official runtime and current build before loading this entry.
  assertCertifiedPersistenceEntry(
    {
      runtimeExeSha256: control.runtimeExeSha256,
      ...(control.version === 3 ? { packageRoot: control.packageRoot } : {}),
    },
    true,
  );
  app
    .whenReady()
    .then(async () => {
      const location = { root: data, parentToken: control.parentToken };
      const assertOwned = () => assertBorrowedPersistenceLease(location, control.ownerToken);
      await assertOwned();
      service = await FoundationPersistence.open(
        location,
        control.ownerToken,
        await backupKeys(safeStorage),
        control.fresh,
        persistenceDataGuard(control.version === 3 ? control.packageRoot : undefined),
      );
      let receipt;
      if (control.stage === 'provision') {
        const provided = await runNativePersistenceProvision(service, dialog, assertOwned, () =>
          Date.now(),
        );
        if (provided.status === 'CANCELLED')
          result = { version: 1, stage: 'provision', status: 'CANCELLED', witness: null };
        else receipt = provided.receipt;
      } else receipt = await service.authenticateBootstrap();
      if (receipt)
        result = {
          version: 1,
          stage: control.stage,
          status: control.stage === 'provision' ? 'PROVISIONED' : 'AUTHENTICATED',
          witness: {
            storeId: receipt.header.storeId,
            backupId: receipt.header.backupId,
            locationId: receipt.header.locationId,
            encryptedSha256: receipt.encryptedSha256,
          },
        };
      await service.shutdown();
      service = undefined;
      await assertOwned();
      completed = true;
      app.quit();
    })
    .catch(fail);
  app.on('will-quit', () => {
    if (!completed || !result) {
      fail();
      return;
    }
    try {
      write(path.join(launch, control.stage + '-result.json'), result);
      fs.writeSync(1, 'PERSISTENCE_INITIALIZE_ORDERLY\n');
    } catch {
      fail();
    }
  });
} catch {
  fail();
}
