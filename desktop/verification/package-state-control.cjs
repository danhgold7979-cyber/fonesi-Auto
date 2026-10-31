'use strict';
// Private verification controller. Runs only after the preceding whole native Job
// retires. It never authenticates a key itself: native confirmation is the witness
// that the real selected-backup route authenticated before showing its dialog.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const contract = require('./package-contract.cjs');
const { witness, backupWitness, restored } = require('./settings-recovery-contract.cjs');
const { plain, read, write, exact, uuid, STAGES, CASES, VERSIONS, EXPECTED } = contract;
const hash = (v) => createHash('sha256').update(v).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fail() {
  throw Error('PACKAGE_STATE_REJECTED');
}
function json(file) {
  const raw = read(file),
    value = JSON.parse(raw);
  if (JSON.stringify(value) !== raw) fail();
  return value;
}
function absent(file) {
  try {
    fs.lstatSync(file);
    return false;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
}
function names(directory) {
  plain(directory);
  const out = [],
    stream = fs.opendirSync(directory);
  try {
    for (;;) {
      const entry = stream.readSync();
      if (!entry) break;
      if (out.length >= 256 || entry.isSymbolicLink()) fail();
      out.push(entry.name);
    }
  } finally {
    stream.closeSync();
  }
  return out.sort();
}
function owned(root) {
  plain(root);
  const token = read(path.join(root, '.owner'));
  if (!uuid(token)) fail();
  return token;
}
function inside(root, target) {
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) fail();
  return target;
}
function admission(root, packageRoot, stage) {
  const token = owned(root);
  if (!STAGES.includes(stage) || packageRoot !== path.join(root, 'relocated-package')) fail();
  const api = require('../launch/package-admission.cjs');
  const manifest = api.verifyPackage(packageRoot);
  for (const name of ['products', 'backups', 'restore-first', 'restore-second'])
    api.assertDataOutsidePackage(packageRoot, path.join(root, name));
  return { token, packageHash: hash(JSON.stringify(manifest)), api };
}
function modules(packageRoot) {
  // admission has verified the closed packaged payload before any compiled import.
  return {
    Database: require(path.join(packageRoot, 'app/build/foundation-database.cjs'))
      .FoundationDatabase,
    statement: require(path.join(packageRoot, 'app/build/foundation-database.cjs')).statement,
    parseReceipt: require(path.join(packageRoot, 'app/build/backup-service.cjs'))
      .parseBackupReceipt,
    journal: require(path.join(packageRoot, 'app/launch/launch-journal.cjs')),
  };
}
function provenance(data) {
  const v = exact(read(path.join(data, '.persistence-owner.json')), [
    'version',
    'storeId',
    'kind',
    'restoreReceiptId',
  ]);
  if (v.version !== 1 || !uuid(v.storeId)) fail();
  if (v.kind === 'FRESH') {
    if (
      path.basename(data) !== 'data-main' ||
      v.restoreReceiptId !== null ||
      !absent(path.join(data, '.restore-receipt.json'))
    )
      fail();
  } else if (v.kind === 'RESTORED') {
    if (path.basename(data) !== `data-${v.storeId}` || !uuid(v.restoreReceiptId)) fail();
    if (
      !equal(json(path.join(data, '.restore-receipt.json')), {
        version: 1,
        storeId: v.storeId,
        restoreReceiptId: v.restoreReceiptId,
        quarantined: true,
      })
    )
      fail();
  } else fail();
  return v;
}
function databaseFacts(data, Database, statement) {
  const p = provenance(data),
    db = new Database(path.join(data, 'active.sqlite'), p.storeId, true);
  try {
    db.validate();
    const store = statement(
      db.connection,
      'SELECT restore_quarantine,restored_from_backup_id,last_auto_admitted_utc FROM foundation_store WHERE singleton=1',
      (s) => s.get(),
    );
    const s = db.version === 3 ? db.readSettings() : null;
    return {
      version: db.version,
      storeId: p.storeId,
      quarantine: store.restore_quarantine,
      restoredFrom: store.restored_from_backup_id,
      auto: store.last_auto_admitted_utc,
      settings: s ? { theme: s.theme, dockWidth: s.dockWidth, tileWidth: s.tileWidth } : null,
    };
  } finally {
    db.close();
  }
}
function candidate(root, data, parseReceipt) {
  const p = provenance(data),
    registry = json(path.join(data, 'migration-backups.json'));
  if (!Array.isArray(registry) || registry.length !== 3) fail();
  const receipts = registry.map((v) => parseReceipt(JSON.stringify(v)));
  if (
    receipts.some(
      (v, i) =>
        !v ||
        v.header.storeId !== p.storeId ||
        v.header.reason !== 'PRE_MIGRATION' ||
        v.header.schemaVersion !== i,
    )
  )
    fail();
  const config = json(path.join(data, 'backup-locations.json'));
  if (
    config.version !== 1 ||
    config.storeId !== p.storeId ||
    !Array.isArray(config.locations) ||
    config.locations.length > 64
  )
    fail();
  function file(r) {
    const loc = config.locations.find((v) => v.locationId === r.header.locationId);
    if (
      !loc ||
      !uuid(loc.folderMarkerId) ||
      loc.absolutePath !== path.join(root, 'backups', `backup-${loc.folderMarkerId}`)
    )
      fail();
    plain(loc.absolutePath);
    if (
      !equal(json(path.join(loc.absolutePath, '.backup-owner.json')), {
        version: 1,
        storeId: p.storeId,
        locationId: loc.locationId,
        folderMarkerId: loc.folderMarkerId,
      })
    )
      fail();
    const f = path.join(loc.absolutePath, `backup-${r.header.backupId}.fonaub`),
      w = backupWitness(f);
    if (
      w.container.sha256 !== r.encryptedSha256 ||
      !equal(json(f.replace(/\.fonaub$/, '.json')), r)
    )
      fail();
    return { file: f, witness: w };
  }
  return {
    selected: file(receipts[2]),
    original: file(receipts[0]),
    backupId: receipts[2].header.backupId,
  };
}
function current(parent, journal) {
  const p = journal.parse('pointer', read(path.join(parent, '.launcher-current.json'))),
    launch = path.join(parent, `launch-${p.launchId}`);
  const state = journal.inspect(parent, launch);
  return { p, launch, state };
}
function observer(root, stage, kind) {
  const v = exact(read(path.join(root, `package-probe-${stage}`, `observer-${kind}.json`)), [
    'version',
    'stage',
    'kind',
    'ready',
    'closed',
    'quitRequested',
    'opens',
    'confirms',
    'cancelled',
    'sixTabsEmpty',
    'settingsObserved',
  ]);
  if (
    v.version !== 1 ||
    v.stage !== stage ||
    v.kind !== kind ||
    !['ready', 'closed', 'quitRequested', 'cancelled', 'sixTabsEmpty', 'settingsObserved'].every(
      (k) => typeof v[k] === 'boolean',
    ) ||
    !Number.isInteger(v.opens) ||
    v.opens < 0 ||
    v.opens > 2 ||
    !Number.isInteger(v.confirms) ||
    v.confirms < 0 ||
    v.confirms > 1
  )
    fail();
  return v;
}
function capture(root, stage) {
  const c = exact(read(path.join(root, `package-capture-${stage}.json`)), [
      'process',
      'stdout',
      'stderr',
    ]),
    p = c.process,
    expected = EXPECTED[stage];
  if (
    !p ||
    p.status !== expected[0] ||
    p.exitCode !== expected[1] ||
    p.cleanupComplete !== true ||
    p.stdoutTruncated !== false ||
    p.stderrTruncated !== false ||
    typeof c.stdout !== 'string' ||
    typeof c.stderr !== 'string'
  )
    fail();
  const lines = c.stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((x) => x !== '');
  if (lines.length !== 1 || lines[0] !== expected[2]) fail();
  return c;
}
function validateState(root, s) {
  if (
    !s ||
    !equal(Object.keys(s), [
      'version',
      'packageHash',
      'managedRoot',
      'storeId',
      'backup',
      'original',
      'settings',
      'source',
      'rootA',
      'rootAWitness',
      'retainedLaunchId',
    ]) ||
    s.version !== 1 ||
    typeof s.packageHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(s.packageHash)
  )
    fail();
  if (s.managedRoot !== null) {
    if (
      typeof s.managedRoot !== 'string' ||
      path.dirname(s.managedRoot) !== path.join(root, 'products') ||
      !path.basename(s.managedRoot).startsWith('Fonesi-Auto-') ||
      !uuid(path.basename(s.managedRoot).slice(12))
    )
      fail();
    owned(s.managedRoot);
  }
  if (s.storeId !== null && !uuid(s.storeId)) fail();
  for (const item of [s.backup, s.original])
    if (item !== null) {
      if (
        !item ||
        typeof item.file !== 'string' ||
        path.dirname(path.dirname(item.file)) !== path.join(root, 'backups') ||
        !/^backup-[0-9a-f-]{36}\.fonaub$/.test(path.basename(item.file)) ||
        !uuid(path.basename(item.file).slice(7, -7))
      )
        fail();
    }
  if (s.rootA !== null) {
    if (
      typeof s.rootA !== 'string' ||
      path.dirname(path.dirname(s.rootA)) !== path.join(root, 'restore-first') ||
      path.basename(s.rootA) !== `data-${s.storeId}` ||
      !path.basename(path.dirname(s.rootA)).startsWith('fonesi-restore-') ||
      !uuid(path.basename(path.dirname(s.rootA)).slice(15))
    )
      fail();
    provenance(s.rootA);
  }
  if (s.retainedLaunchId !== null && !uuid(s.retainedLaunchId)) fail();
  return s;
}
function prepare(root, packageRoot, stage) {
  const { token, packageHash } = admission(root, packageRoot, stage),
    index = STAGES.indexOf(stage);
  let state = index
    ? json(path.join(root, `package-state-${STAGES[index - 1]}.json`))
    : {
        version: 1,
        packageHash,
        managedRoot: null,
        storeId: null,
        backup: null,
        original: null,
        settings: null,
        source: null,
        rootA: null,
        rootAWitness: null,
        retainedLaunchId: null,
      };
  validateState(root, state);
  if (state.packageHash !== packageHash) fail();
  if (index === 0)
    for (const name of ['products', 'backups', 'restore-first', 'restore-second'])
      fs.mkdirSync(path.join(root, name));
  for (const name of ['products', 'backups', 'restore-first', 'restore-second'])
    plain(path.join(root, name));
  const m = modules(packageRoot);
  if (stage === 'corrupt-current') {
    const data = path.join(state.managedRoot, 'data-main'),
      db = new m.Database(path.join(data, 'active.sqlite'), state.storeId);
    let rejected = false;
    try {
      db.validate();
      db.connection.exec('PRAGMA ignore_check_constraints=ON');
      const changed = m.statement(
        db.connection,
        "UPDATE app_settings_revision SET tile_width=1 WHERE slot='CURRENT'",
        (s) => s.run(),
      );
      if (Number(changed.changes) !== 1) fail();
      try {
        db.validate();
      } catch {
        rejected = true;
      }
    } finally {
      db.close();
    }
    if (!rejected) fail();
    state = { ...state, source: witness(data) };
  }
  const selectedStore = stage.startsWith('restored-') ? state.rootA : null;
  if (selectedStore) {
    inside(path.join(root, 'restore-first'), selectedStore);
    provenance(selectedStore);
  }
  const seed = {
    version: 1,
    stage,
    runRoot: root,
    runToken: token,
    packageRoot,
    createParent: path.join(root, 'products'),
    managedRoot: state.managedRoot,
    selectedStore,
    backupParent: path.join(root, 'backups'),
    backupFile: state.backup?.file ?? null,
    restoreParent: path.join(
      root,
      stage === 'restored-maintenance' ? 'restore-second' : 'restore-first',
    ),
    retainedLaunchId: stage === 'recover-retained' ? state.retainedLaunchId : null,
  };
  write(path.join(root, `package-before-${stage}.json`), {
    version: 1,
    state,
    products: names(seed.createParent),
    source: state.managedRoot ? witness(path.join(state.managedRoot, 'data-main')) : null,
    launches: state.managedRoot ? names(state.managedRoot) : [],
  });
  write(path.join(root, `package-stage-${stage}.json`), seed);
  return seed;
}
function observe(root, packageRoot, stage) {
  const { packageHash } = admission(root, packageRoot, stage);
  capture(root, stage);
  const before = exact(read(path.join(root, `package-before-${stage}.json`)), [
    'version',
    'state',
    'products',
    'source',
    'launches',
  ]);
  let s = validateState(root, before.state);
  if (s.packageHash !== packageHash) fail();
  const m = modules(packageRoot),
    cases = Object.fromEntries(CASES[stage].map((k) => [k, false]));
  cases.packageVerified = true;
  cases.productOutsidePackage = true;
  cases.originalPackageUnchanged = true;
  const data = () => path.join(s.managedRoot, 'data-main');
  const unchanged = () =>
    equal(s.source, witness(data())) && equal(s.backup.witness, backupWitness(s.backup.file));
  if (stage === 'first-cancel' || stage === 'first-launch') {
    const added = names(path.join(root, 'products')).filter((n) => !before.products.includes(n));
    if (added.length !== 1 || !added[0].startsWith('Fonesi-Auto-') || !uuid(added[0].slice(12)))
      fail();
    const managed = path.join(root, 'products', added[0]);
    owned(managed);
    const j = current(managed, m.journal);
    m.journal.completed(managed, j.launch);
    const provision = observer(root, stage, 'provision');
    if (stage === 'first-cancel') {
      cases.provisioningCancelled =
        provision.closed &&
        provision.cancelled &&
        provision.opens === 1 &&
        provision.confirms === 0;
      cases.noWriterLease = absent(path.join(managed, 'data-main', '.writer-lock'));
    } else {
      s = { ...s, managedRoot: managed };
      const facts = databaseFacts(data(), m.Database, m.statement),
        backup = candidate(root, data(), m.parseReceipt),
        main = observer(root, stage, 'main'),
        auth = observer(root, stage, 'auth');
      s = {
        ...s,
        storeId: facts.storeId,
        backup: { ...backup.selected, backupId: backup.backupId },
        original: backup.original,
        settings: facts.settings,
      };
      cases.initialized =
        facts.version === 3 &&
        facts.quarantine === 0 &&
        provision.opens === 1 &&
        provision.confirms === 1 &&
        !provision.cancelled;
      cases.originalKeyAuthenticated =
        auth.closed &&
        !auth.cancelled &&
        auth.opens === 0 &&
        j.state.settlements.some((v) => v.stage === 'OBSERVE_AUTH' && v.status === 'SUCCESS');
      cases.mainReady = main.ready;
      cases.sixTabsEmpty = main.sixTabsEmpty;
      cases.settingsObserved = main.settingsObserved;
      cases.orderlyClose = main.closed && main.quitRequested;
      cases.leaseReleased = absent(path.join(data(), '.writer-lock'));
    }
  } else if (stage === 'reopen') {
    const j = current(s.managedRoot, m.journal);
    m.journal.completed(s.managedRoot, j.launch);
    const main = observer(root, stage, 'main'),
      facts = databaseFacts(data(), m.Database, m.statement);
    cases.noReprovision =
      !j.state.intents.some((v) => v.stage.includes('PROVISION')) &&
      absent(path.join(root, `package-probe-${stage}`, 'observer-provision.json'));
    cases.originalBackupUnchanged = equal(s.original.witness, backupWitness(s.original.file));
    cases.settingsRetained = equal(s.settings, facts.settings);
    cases.orderlyClose = main.closed && main.quitRequested;
    cases.leaseReleased = absent(path.join(data(), '.writer-lock'));
  } else if (stage === 'guard-denied') {
    cases.guardContentionRefused = absent(
      path.join(root, `package-probe-${stage}`, 'observer-main.json'),
    );
    cases.noNewLaunch = equal(before.launches, names(s.managedRoot));
    cases.sourceBytesPreserved = equal(before.source, witness(data()));
  } else if (stage === 'corrupt-current') {
    const j = current(s.managedRoot, m.journal);
    s = { ...s, retainedLaunchId: j.p.launchId };
    cases.invalidCurrentRefused =
      j.state.latest?.stage === 'MAIN' && j.state.latest.status === 'NONZERO_EXIT';
    cases.knownRetirement = !j.state.pending && j.state.latest?.cleanupComplete === true;
    const owner = json(path.join(data(), '.writer-lock', 'owner.json'));
    cases.leaseRetained =
      owner.ownerToken === j.state.header.ownerToken && owner.storeId === s.storeId;
    cases.sourceBytesPreserved = unchanged();
  } else if (stage === 'recover-retained') {
    const j = current(s.managedRoot, m.journal);
    m.journal.completed(s.managedRoot, j.launch);
    const receipt = json(path.join(j.launch, 'lease-recovery.json'));
    cases.exactJournalMatched =
      j.p.launchId === s.retainedLaunchId && j.state.latest.stage === 'RECOVERY';
    cases.freshRecoveryReceipt =
      receipt.launchId === s.retainedLaunchId &&
      receipt.ownerToken === j.state.header.ownerToken &&
      receipt.state === 'RELEASE_AUTHORIZED';
    cases.oldLeaseReleased = absent(path.join(data(), '.writer-lock'));
    cases.sourceBytesPreserved = unchanged();
  } else if (stage === 'restored-normal-denied') {
    cases.normalDenied = absent(path.join(root, `package-probe-${stage}`, 'observer-main.json'));
    cases.quarantineUnchanged = equal(s.rootAWitness, witness(s.rootA));
    cases.sourceBytesPreserved = unchanged();
  } else {
    const parent = stage === 'restored-maintenance' ? path.dirname(s.rootA) : s.managedRoot;
    const j = current(parent, m.journal);
    m.journal.completed(parent, j.launch);
    const o = observer(root, stage, 'main');
    cases.backupAuthenticated = o.opens === 2 && o.confirms === 1 && !o.ready && o.closed;
    cases.sourceBytesPreserved =
      unchanged() && (stage !== 'restored-maintenance' || equal(s.rootAWitness, witness(s.rootA)));
    cases.leaseReleased = absent(
      path.join(stage === 'restored-maintenance' ? s.rootA : data(), '.writer-lock'),
    );
    if (stage === 'restore-cancel') {
      cases.cancelled = o.cancelled && names(path.join(root, 'restore-first')).length === 0;
    } else {
      const target = restored(
        path.join(root, stage === 'restore-confirm' ? 'restore-first' : 'restore-second'),
        s.storeId,
      ).root;
      const facts = databaseFacts(target, m.Database, m.statement);
      const quarantined =
        facts.version === 2 &&
        facts.quarantine === 1 &&
        facts.restoredFrom === s.backup.backupId &&
        facts.auto === null;
      if (stage === 'restore-confirm') {
        cases.newQuarantinedRoot = quarantined;
        s = { ...s, rootA: target, rootAWitness: witness(target) };
      } else {
        cases.selectedStoreAdmitted = j.state.header.dataRoot === s.rootA;
        cases.secondQuarantinedRoot = quarantined && target !== s.rootA;
      }
    }
  }
  const result = { version: 1, stage, versions: VERSIONS, cases };
  contract.result(JSON.stringify(result));
  write(path.join(root, `package-result-${stage}.json`), result);
  if (!Object.values(cases).every(Boolean)) fail();
  write(path.join(root, `package-state-${stage}.json`), s);
  return result;
}
if (require.main === module) {
  try {
    const [action, root, pkg, stage, ...extra] = process.argv.slice(2);
    if (extra.length || !['prepare', 'observe'].includes(action)) fail();
    (action === 'prepare' ? prepare : observe)(root, pkg, stage);
    process.stdout.write(`PACKAGE_STATE_${action === 'prepare' ? 'PREPARED' : 'OBSERVED'}\n`);
  } catch {
    process.stdout.write('PACKAGE_STATE_FAILED\n');
    process.exitCode = 1;
  }
}
module.exports = {
  prepare,
  observe,
  names,
  provenance,
  databaseFacts,
  candidate,
  capture,
  validateState,
};
