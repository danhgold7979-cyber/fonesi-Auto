'use strict';
// Four serialized genuine launches. This controller never writes a product ledger or lease.
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const c = require('./retained-rollback-contract.cjs'),
  base = require('./retained-host-control.cjs');
const { plain, read, write, uuid } = require('./persistence-restore-contract.cjs');
const { entries, tree } = require('./package-owned-files.cjs');
const { ORIGINAL_SHA, WRAPPER_SHA, witnessPath } = require('./persistence-launch-e2e-control.cjs');
const journal = require('../launch/launch-journal.cjs'),
  pkg = require('./main-runtime-version-package.cjs');
const desktop = path.resolve(__dirname, '..'),
  hash = (b) => createHash('sha256').update(b).digest('hex');
const { STAGES, SCOPE, EXPECTED, fail, json } = c;
const ARCHIVES = Object.freeze([
  Object.freeze({
    file: 'official-36.zip',
    bytes: 7138784,
    sha256: '12c2841f354e92a0eb2fd7bf6f0f9bf8538abce7bd6b060ac8349d6f6a61107c',
  }),
  Object.freeze({
    file: 'official-37.zip',
    bytes: 8044989,
    sha256: '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99',
  }),
]);
const SOURCES = Object.freeze(
  [
    ...new Set([
      ...base.SOURCES,
      '../.github/workflows/phase-02-software.yml',
      'verification/retained-rollback-contract.cjs',
      'verification/retained-rollback-control.cjs',
      'verification/retained-rollback-audit.cjs',
      'verification/retained-rollback-main-probe.cjs',
      'verification/fetch-retained-archives.cjs',
      'verification/platform-tools-prior-36-candidate.json',
      'verification/Invoke-RetainedRollbackCheck.ps1',
      'verification/validate_retained_rollback.py',
      'verification/validate_retained_host.py',
      'verification/Invoke-RetainedManagedFixture.ps1',
      'scripts/retained-managed-fixture.mjs',
    ]),
  ].sort(),
);
function owned(root) {
  if (root !== path.join(desktop, '.retained-host-runtime', 'r')) fail('OWNER');
  plain(root);
  const token = read(path.join(root, '.owner'));
  if (!uuid(token)) fail('OWNER');
  return token;
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
function proof(file, limit = 65536) {
  const b = base.binary(file, limit);
  return { bytes: b.length, sha256: hash(b) };
}
function identityProof(file, limit = 65536) {
  const before = fs.lstatSync(file),
    value = proof(file, limit),
    after = fs.lstatSync(file);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    after.nlink !== 1
  )
    fail('OWNER');
  return { ...value, dev: after.dev, ino: after.ino, mtimeMs: after.mtimeMs };
}
function verifyBuildBytes() {
  const marker = JSON.parse(base.binary(path.join(desktop, 'build/.verified-build.json'), 65536));
  for (const [kind, maximum, limit] of [
    ['inputs', 256, 1048576],
    ['outputs', 64, 8388608],
  ]) {
    const rows = Object.entries(marker[kind] ?? {});
    if (!rows.length || rows.length > maximum) fail('BUILD');
    for (const [name, expected] of rows) {
      if (
        typeof name !== 'string' ||
        !name ||
        name.split('/').some((part) => !part || part === '.' || part === '..') ||
        name.includes('\\') ||
        path.isAbsolute(name) ||
        typeof expected !== 'string' ||
        expected.length !== 64 ||
        !/^[0-9a-f]+$/.test(expected)
      )
        fail('BUILD');
      if (
        proof(path.join(desktop, kind === 'outputs' ? 'build' : '', name), limit).sha256 !==
        expected
      )
        fail('BUILD');
    }
  }
}
function sources() {
  return Object.fromEntries(SOURCES.map((name) => [name, proof(path.join(desktop, name))]));
}
function packagePublic(p) {
  return {
    sourceHead: p.sourceHead,
    sourceTree: p.sourceTree,
    zipSha256: p.zipSha256,
    zipBytes: p.zipBytes,
    manifestSha256: p.manifestSha256,
  };
}
function transform(raw, appRoot, packageMode) {
  if (hash(raw) !== ORIGINAL_SHA) fail('SOURCE');
  const pairs = [
    [
      "$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))",
      `$desktop='${appRoot.replaceAll("'", "''")}'`,
    ],
    ['$launchTools=$PSScriptRoot', "$launchTools=Join-Path $desktop 'launch'"],
    [
      "Join-Path $launchTools 'persistence-initialize.cjs'",
      `'${path.join(desktop, 'verification/persistence-launch-init-probe.cjs').replaceAll("'", "''")}'`,
    ],
    [
      "Join-Path $desktop 'build/main.cjs'",
      `'${path.join(desktop, 'verification/retained-rollback-main-probe.cjs').replaceAll("'", "''")}'`,
    ],
  ];
  let result = raw;
  for (const [from, to] of pairs) {
    if (result.split(from).length !== 2) fail('COPY');
    result = result.replace(from, to);
  }
  let reversed = result;
  for (const [from, to] of pairs.slice().reverse()) {
    if (reversed.split(to).length !== 2) fail('COPY');
    reversed = reversed.replace(to, from);
  }
  if (reversed !== raw || typeof packageMode !== 'boolean') fail('COPY');
  return result;
}
function scriptBinding(root, mode) {
  const packageMode = mode === 'PACKAGE',
    p = packageMode ? pkg.admitPackage(root) : null,
    appRoot = p ? p.appRoot : desktop;
  const wrapper = read(
      path.join(appRoot, 'launch', packageMode ? 'Invoke-Package.ps1' : 'Invoke-Desktop.ps1'),
    ),
    raw = read(path.join(appRoot, 'launch/launch-core.ps1'));
  if (
    !wrapper.includes(`-EntryMode '${packageMode ? 'PACKAGE' : 'SOURCE'}'`) ||
    (!packageMode && hash(wrapper) !== WRAPPER_SHA)
  )
    fail('SOURCE');
  const derived = transform(raw, appRoot, packageMode),
    main = base.binary(path.join(appRoot, 'build/main.cjs'), 8388608),
    text = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(main),
    derivedMain = c.deriveMain(
      text,
      path.join(__dirname, 'retained-rollback-main-probe.cjs'),
      packageMode ? 'UPGRADE' : 'SEED',
    );
  return {
    wrapper,
    derived,
    proof: {
      version: 1,
      mode,
      wrapperSha256: hash(wrapper),
      originalCoreSha256: hash(raw),
      derivedCoreSha256: hash(derived),
      substitutions: 4,
      originalMainSha256: hash(main),
      derivedMainSha256: hash(derivedMain),
      seedTargetSubstitutions: packageMode ? 0 : 1,
    },
  };
}
function pathBudget(root) {
  pkg.pathBudget(root, path.join(root, 'relocated-package'));
  for (const file of [
    path.join(__dirname, 'retained-rollback-main-probe.cjs'),
    path.join(root, 'scripts-SEED/Invoke-Desktop.instrumented.ps1'),
    path.join(root, 'scripts-SEED/launch-core.ps1'),
    path.join(root, 'scripts-PACKAGE/Invoke-Package.instrumented.ps1'),
    path.join(root, 'scripts-PACKAGE/launch-core.ps1'),
  ]) {
    if (path.resolve(file) !== file || file.length > 259 || path.dirname(file).length > 247)
      fail('LIMIT');
  }
}
async function prepare(root, a36, a37, head, treeId) {
  const owner = owned(root);
  pathBudget(root);
  if (!absent(path.join(root, 'campaign.json')) || !absent(path.join(root, 'first-use')))
    fail('OWNER');
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(desktop)) fail('BUILD');
  const admitted = pkg.prepareBinding(root, head, treeId);
  for (let i = 0; i < 2; i++) {
    const pin = ARCHIVES[i],
      source = i ? a37 : a36;
    if (typeof source !== 'string' || path.resolve(source) !== source) fail('ARCHIVE');
    const b = base.binary(source, pin.bytes);
    if (b.length !== pin.bytes || hash(b) !== pin.sha256) fail('ARCHIVE');
    const out = path.join(root, pin.file),
      fd = fs.openSync(out, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, b);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (
      JSON.stringify(proof(out, pin.bytes)) !==
      JSON.stringify({ bytes: pin.bytes, sha256: pin.sha256 })
    )
      fail('ARCHIVE');
  }
  for (const mode of ['SEED', 'PACKAGE']) {
    const b = scriptBinding(root, mode),
      dir = path.join(root, 'scripts-' + mode);
    fs.mkdirSync(dir);
    base.rawWrite(
      path.join(dir, `Invoke-${mode === 'SEED' ? 'Desktop' : 'Package'}.instrumented.ps1`),
      b.wrapper,
    );
    base.rawWrite(path.join(dir, 'launch-core.ps1'), b.derived);
    write(path.join(root, 'copy-' + mode + '.json'), b.proof);
  }
  const managed = json(path.join(root, 'managed-evidence.json'));
  if (managed.version !== 2 || managed.groupsPassed !== 10 || managed.passed !== true)
    fail('SOURCE');
  write(path.join(root, 'campaign.json'), {
    version: 1,
    scope: SCOPE,
    ownerToken: owner,
    sources: sources(),
    archives: ARCHIVES,
    archiveInputs: [a36, a37],
    package: packagePublic(admitted),
    managedEvidence: proof(path.join(root, 'managed-evidence.json')),
    buildMarker: proof(path.join(desktop, 'build/.verified-build.json')),
  });
}
function verify(root) {
  const owner = owned(root),
    v = json(path.join(root, 'campaign.json'));
  c.exact(v, [
    'version',
    'scope',
    'ownerToken',
    'sources',
    'archives',
    'archiveInputs',
    'package',
    'managedEvidence',
    'buildMarker',
  ]);
  if (
    v.version !== 1 ||
    v.scope !== SCOPE ||
    v.ownerToken !== owner ||
    JSON.stringify(v.sources) !== JSON.stringify(sources()) ||
    JSON.stringify(v.archives) !== JSON.stringify(ARCHIVES) ||
    JSON.stringify(v.package) !== JSON.stringify(packagePublic(pkg.admitPackage(root))) ||
    JSON.stringify(v.managedEvidence) !==
      JSON.stringify(proof(path.join(root, 'managed-evidence.json'))) ||
    JSON.stringify(v.buildMarker) !==
      JSON.stringify(proof(path.join(desktop, 'build/.verified-build.json')))
  )
    fail('SOURCE');
  if (
    !Array.isArray(v.archiveInputs) ||
    v.archiveInputs.length !== 2 ||
    v.archiveInputs.some((p) => typeof p !== 'string' || path.resolve(p) !== p)
  )
    fail('ARCHIVE');
  verifyBuildBytes();
  for (let i = 0; i < 2; i++) {
    const pin = ARCHIVES[i];
    if (
      JSON.stringify(proof(v.archiveInputs[i], pin.bytes)) !==
      JSON.stringify({ bytes: pin.bytes, sha256: pin.sha256 })
    )
      fail('ARCHIVE');
  }
  for (const pin of ARCHIVES)
    if (
      JSON.stringify(proof(path.join(root, pin.file), pin.bytes)) !==
      JSON.stringify({ bytes: pin.bytes, sha256: pin.sha256 })
    )
      fail('ARCHIVE');
  for (const mode of ['SEED', 'PACKAGE']) {
    const b = scriptBinding(root, mode),
      dir = path.join(root, 'scripts-' + mode);
    if (
      read(path.join(dir, `Invoke-${mode === 'SEED' ? 'Desktop' : 'Package'}.instrumented.ps1`)) !==
        b.wrapper ||
      read(path.join(dir, 'launch-core.ps1')) !== b.derived ||
      JSON.stringify(json(path.join(root, 'copy-' + mode + '.json'))) !== JSON.stringify(b.proof)
    )
      fail('COPY');
  }
  return v;
}
function state(root, stage, completed = true) {
  owned(root);
  c.stageName(stage);
  const found = entries(path.join(root, 'first-use'), 1);
  if (
    found.length !== 1 ||
    !found[0].stat.isDirectory() ||
    !/^Fonesi-Auto-[0-9a-f-]{36}$/.test(found[0].name) ||
    !uuid(found[0].name.slice(12))
  )
    fail('OWNER');
  const managed = found[0].file,
    pointer = json(path.join(managed, '.launcher-current.json')),
    launch = path.join(managed, 'launch-' + pointer.launchId);
  if (!uuid(pointer.launchId)) fail('OWNER');
  const chain = journal.inspect(managed, launch),
    header = chain.header,
    admitted = c.stageForLaunch(launch);
  if (
    admitted.stage !== stage ||
    header.entryMode !== EXPECTED[stage].entryMode ||
    header.maintenance !== 'NORMAL' ||
    header.dataRoot !== path.join(managed, 'data-main') ||
    header.parentToken !== read(path.join(managed, '.owner')) ||
    (completed &&
      (chain.pending ||
        chain.latest?.stage !== 'RELEASE' ||
        chain.latest.status !== 'SUCCESS' ||
        chain.latest.exitCode !== 0))
  )
    fail('JOURNAL');
  return { managed, launch, chain, header };
}
function released(s) {
  if (
    !absent(path.join(s.header.dataRoot, '.writer-lock')) ||
    read(path.join(s.header.dataRoot, `.released-${s.header.ownerToken}.json`)) !==
      JSON.stringify({ version: 1, storeId: s.header.storeId, ownerToken: s.header.ownerToken })
  )
    fail('JOURNAL');
  base.hostReceipt(s);
}
function launchFiles(launch) {
  const out = {};
  for (const e of entries(launch, 256)) {
    if (e.stat.isDirectory()) {
      if (!/^fonesi-auto-foundation-[0-9a-f-]{36}-(provision|auth|main)$/.test(e.name))
        fail('INVENTORY');
      continue;
    }
    out[e.name] = identityProof(e.file);
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
function previous(root, stage) {
  const i = STAGES.indexOf(stage);
  return i ? json(path.join(root, `rollback-${STAGES[i - 1]}-state.json`)) : null;
}
function histories(root, stage) {
  for (const name of STAGES.slice(0, STAGES.indexOf(stage))) {
    const prior = json(path.join(root, `rollback-${name}-state.json`));
    if (
      JSON.stringify(launchFiles(path.join(prior.managed, 'launch-' + prior.header.launchId))) !==
      JSON.stringify(prior.launchFiles)
    )
      fail('HISTORY');
    const chain = journal.inspect(
      prior.managed,
      path.join(prior.managed, 'launch-' + prior.header.launchId),
    );
    if (
      chain.pending ||
      chain.latest?.stage !== 'RELEASE' ||
      chain.header.storeId !== prior.header.storeId
    )
      fail('HISTORY');
    released({
      managed: prior.managed,
      launch: path.join(prior.managed, 'launch-' + prior.header.launchId),
      header: prior.header,
      chain,
    });
  }
}
function prepareStage(root, stage) {
  verify(root);
  c.stageName(stage);
  const prev = previous(root, stage),
    index = STAGES.indexOf(stage);
  if (index) {
    c.validateResult(json(path.join(root, `rollback-${STAGES[index - 1]}-result.json`)));
    histories(root, stage);
    if (state(root, STAGES[index - 1]).header.launchId !== prev.header.launchId) fail('HISTORY');
  } else if (!absent(path.join(root, 'first-use'))) fail('OWNER');
  if (STAGES.slice(index).some((name) => !absent(path.join(root, `stage-${name}.json`))))
    fail('STAGE');
  const b = json(path.join(root, `copy-${stage === 'SEED' ? 'SEED' : 'PACKAGE'}.json`));
  const record = {
    version: 1,
    stage,
    managedRoot: prev?.managed ?? null,
    wrapper: `scripts-${stage === 'SEED' ? 'SEED' : 'PACKAGE'}/Invoke-${stage === 'SEED' ? 'Desktop' : 'Package'}.instrumented.ps1`,
    previousLaunchIds: STAGES.slice(0, index).map(
      (name) => json(path.join(root, `rollback-${name}-state.json`)).header.launchId,
    ),
    originalMainSha256: b.originalMainSha256,
    derivedMainSha256: b.derivedMainSha256,
    expectedTargetVersion: EXPECTED[stage].installTargetVersion,
    expectedActiveVersion: EXPECTED[stage].activeVersion,
    installationRevision: EXPECTED[stage].installationRevision,
    archiveFile:
      stage === 'SEED' ? 'official-36.zip' : stage === 'UPGRADE' ? 'official-37.zip' : null,
  };
  if (stage === 'SEED') fs.mkdirSync(path.join(root, 'first-use'));
  write(path.join(root, `stage-${stage}.json`), record);
  return record;
}
function inspectDatabase(s, stage) {
  const trusted =
      stage === 'SEED' ? undefined : pkg.admitPackage(path.dirname(path.dirname(s.managed))),
    load = (name) =>
      trusted ? pkg.loadBuild(trusted, name) : require(path.join(desktop, 'build', name));
  const { FoundationDatabase, statement, MIGRATION_HASHES } = load('foundation-database.cjs'),
    schema = require('./fleet-ui-schema4.cjs'),
    receipts = schema.receipts(s.header.dataRoot, s.header.storeId, trusted);
  const db = new FoundationDatabase(
    path.join(s.header.dataRoot, 'active.sqlite'),
    s.header.storeId,
    true,
  );
  try {
    db.validate();
    db.readSettings();
    if (db.version !== 4) fail('DATABASE');
    const snap = db.readDurable();
    if (
      snap.meta.revision !== EXPECTED[stage].durableRevision ||
      snap.meta.host_epoch !== EXPECTED[stage].epoch ||
      ['devices', 'bindings', 'identityEvidence', 'captures', 'holds'].some(
        (k) => snap[k].length !== 0,
      )
    )
      fail('DATABASE');
    const row = statement(
      db.connection,
      'SELECT version,script_sha256,prerequisite_backup_id FROM schema_migration WHERE version=4',
      (x) => x.get(),
    );
    if (
      row.version !== 4 ||
      row.script_sha256 !== MIGRATION_HASHES[3] ||
      row.prerequisite_backup_id !== receipts[3].header.backupId ||
      !absent(path.join(s.header.dataRoot, 'captures-v1'))
    )
      fail('DATABASE');
  } finally {
    db.close();
  }
}
async function runtimePlan(dataRoot, storeId, stage) {
  const { createPlatformToolsProvisionLedger } = await import(
      '../src/main/platform-tools-provision-ledger.ts'
    ),
    { createPlatformToolsProvisionFiles } = await import(
      '../src/main/platform-tools-provision-files.ts'
    ),
    catalog = await import('../src/main/platform-tools-catalog.ts');
  const ledger = createPlatformToolsProvisionLedger({
      dataRoot,
      storeId,
      assertOwnedSync: () => {},
      acceptedCandidates: catalog.PLATFORM_TOOLS_KNOWN_CANDIDATES.map((e) => ({
        manifestSha256: e.manifestSha256,
        archiveSha256: e.candidate.archive.sha256,
      })),
    }),
    current = await ledger.readState();
  const active = catalog.resolvePlatformToolsCandidate(current.activeSha256),
    prior = current.previousActiveSha256
      ? catalog.resolvePlatformToolsCandidate(current.previousActiveSha256)
      : null;
  if (
    current.revision !== EXPECTED[stage].installationRevision ||
    active?.candidate.release !== EXPECTED[stage].activeVersion ||
    (prior?.candidate.release ?? null) !== EXPECTED[stage].previousVersion ||
    current.operations.length !== current.revision
  )
    fail('LEDGER');
  current.operations.forEach((op, i) => {
    const entry = catalog.resolvePlatformToolsCandidate(op.archiveSha256);
    if (
      op.kind !== (i === 2 ? 'ROLLBACK' : 'INSTALL') ||
      entry?.candidate.release !== (i === 1 ? '37.0.1' : '36.0.0') ||
      op.manifestSha256 !== entry.manifestSha256
    )
      fail('LEDGER');
  });
  const files = createPlatformToolsProvisionFiles({ dataRoot, assertOwnedSync: () => {} });
  await files.scan(current.operations, () => {});
  await files.verifyRuntime(() => {}, active);
  if (prior) await files.verifyRuntime(() => {}, prior);
  const directory = path.join(dataRoot, 'platform-tools-runtime'),
    out = [];
  let bytes = 0;
  function walk(dir, depth) {
    if (depth > 4) fail('LIMIT');
    for (const e of entries(dir, 256)) {
      if (out.length >= 512) fail('LIMIT');
      out.push(e);
      if (e.stat.isDirectory()) walk(e.file, depth + 1);
      else {
        if (e.stat.nlink !== 1) fail('OWNER');
        bytes += e.stat.size;
        if (bytes > 134217728) fail('LIMIT');
      }
    }
  }
  walk(directory, 0);
  const witnesses = Object.fromEntries(
    out
      .filter((e) => e.stat.isFile())
      .map((e) => [
        path.relative(directory, e.file).split(path.sep).join('/'),
        identityProof(e.file, 134217728),
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return { directory, entries: out, current, witnesses };
}
async function inspect(root, stage) {
  verify(root);
  c.stageName(stage);
  const s = state(root, stage),
    prior = previous(root, stage);
  histories(root, stage);
  base.capture(
    path.join(root, `launcher-${stage}-capture.json`),
    ['PERSISTENCE_DESKTOP_CLOSED'],
    'OUTER',
  );
  base.stageCapture(s, 'AUTH', ['PERSISTENCE_INITIALIZE_ORDERLY']);
  base.stageCapture(s, 'MAIN', ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED']);
  const auth = json(path.join(s.launch, 'auth-observed.json'));
  if (auth.status !== 'AUTHENTICATED' || auth.witness.storeId !== s.header.storeId) fail('AUTH');
  if (stage === 'SEED') {
    base.stageCapture(s, 'PROVISION', ['PERSISTENCE_INITIALIZE_ORDERLY']);
    const provision = json(path.join(s.launch, 'provision-observed.json'));
    if (
      provision.status !== 'PROVISIONED' ||
      JSON.stringify(provision.witness) !== JSON.stringify(auth.witness)
    )
      fail('AUTH');
  } else if (
    JSON.stringify(auth.witness) !==
    JSON.stringify(json(path.join(root, 'rollback-SEED-state.json')).authWitness)
  )
    fail('AUTH');
  for (const kind of stage === 'SEED' ? ['provision', 'auth'] : ['auth'])
    if (
      read(witnessPath(s.launch, kind)) !==
      JSON.stringify({
        version: 1,
        stage: kind,
        opens: kind === 'provision' ? 1 : 0,
        confirms: kind === 'provision' ? 1 : 0,
      })
    )
      fail('AUTH');
  if (
    read(witnessPath(s.launch, 'ui')) !==
    JSON.stringify({ version: 1, ready: true, quitRequested: true, closed: true })
  )
    fail('MAIN');
  if (
    read(path.join(s.header.dataRoot, 'key-durability-proof.json')) !==
    JSON.stringify({
      version: 2,
      ...auth.witness,
      state: 'ORDERLY_REOPEN_AUTHENTICATED',
      runtimeCertification: 'ELECTRON_45_1_0_WIN_X64_DPAPI_V1',
    })
  )
    fail('AUTH');
  released(s);
  inspectDatabase(s, stage);
  const runtime = await runtimePlan(s.header.dataRoot, s.header.storeId, stage);
  if (prior) {
    if (
      prior.header.storeId !== s.header.storeId ||
      prior.managed !== s.managed ||
      prior.header.launchId === s.header.launchId ||
      prior.header.ownerToken === s.header.ownerToken
    )
      fail('HISTORY');
    for (const [name, p] of Object.entries(prior.runtimeWitnesses))
      if (JSON.stringify(runtime.witnesses[name]) !== JSON.stringify(p)) fail('HISTORY');
    if (
      stage === 'REOPEN' &&
      JSON.stringify(runtime.witnesses) !== JSON.stringify(prior.runtimeWitnesses)
    )
      fail('HISTORY');
  }
  const observed = json(path.join(root, `rollback-${stage}-observed.json`));
  c.validateObserved(observed);
  if (observed.stage !== stage) fail('STAGE');
  const binding = json(path.join(root, `rollback-${stage}-binding.json`));
  c.validateBinding(binding);
  if (binding.stage !== stage) fail('STAGE');
  const audit = await require('./retained-rollback-audit.cjs').audit(
    path.join(s.managed, 'logs-main'),
    binding,
    base.binary,
    s.header.ownerToken,
    prior?.audit,
    stage === 'SEED' ? undefined : pkg.admitPackage(root),
  );
  const result = {
    ...observed,
    cases: { ...observed.cases, ...Object.fromEntries(c.CONTROL_CASES.map((k) => [k, true])) },
  };
  c.validateResult(result);
  write(path.join(root, `rollback-${stage}-state.json`), {
    version: 1,
    stage,
    managed: s.managed,
    header: s.header,
    authWitness: auth.witness,
    launchFiles: launchFiles(s.launch),
    runtimeWitnesses: runtime.witnesses,
    ledger: runtime.current,
    audit,
  });
  write(path.join(root, `rollback-${stage}-result.json`), result);
  if (stage === 'SEED')
    write(path.join(root, 'bootstrap.json'), {
      version: 1,
      cases: Object.fromEntries(base.BOOTSTRAP.map((k) => [k, true])),
    });
  if (stage === 'REOPEN')
    write(path.join(root, 'integrity.json'), {
      version: 1,
      originalArchivesUnchanged: true,
      originalSourceUnchanged: true,
      originalPackageUnchanged: true,
      package: packagePublic(pkg.admitPackage(root)),
    });
  return result;
}
function diagnose(root, stage) {
  verify(root);
  c.stageName(stage);
  const s = state(root, stage, false);
  const raw = read(path.join(s.launch, 'main-capture.json'));
  const settlement = s.chain.settlements.filter((x) => x.stage === 'MAIN');
  if (settlement.length !== 1 || hash(raw) !== settlement[0].captureSha256) fail('JOURNAL');
  const capture = require('./package-state-control.cjs').parseCapture(raw);
  if (
    !['SUCCESS', 'NONZERO_EXIT'].includes(capture.process.status) ||
    !capture.process.cleanupComplete ||
    capture.process.stdoutTruncated ||
    capture.process.stderrTruncated
  )
    fail('RETIREMENT');
  const lines = capture.stderr.replaceAll('\r\n', '\n').split('\n');
  const output = [];
  for (const [prefix, values] of [
    ['RETAINED_ROLLBACK_PHASE_', c.PHASES],
    ['RETAINED_ROLLBACK_REASON_', c.REASONS],
  ]) {
    const found = lines.filter((line) => values.some((v) => line === prefix + v));
    if (found.length === 1) output.push(found[0]);
  }
  if (lines.filter((line) => line === 'RETAINED_ROLLBACK_FAILED').length === 1)
    output.push('RETAINED_ROLLBACK_FAILED');
  return output;
}
async function cleanup(root) {
  verify(root);
  const token = owned(root),
    s = state(root, 'REOPEN');
  histories(root, 'REOPEN');
  released(s);
  const publicResult = json(path.join(root, 'public.json'));
  if (
    publicResult.failure !== null ||
    publicResult.directoryCleanup !== false ||
    !publicResult.originalArchivesUnchanged ||
    !publicResult.originalSourceUnchanged ||
    !publicResult.originalPackageUnchanged
  )
    fail('SCHEMA');
  for (const stage of STAGES) {
    const result = json(path.join(root, `rollback-${stage}-result.json`));
    c.validateResult(result);
    const process = base.capture(
      path.join(root, `launcher-${stage}-capture.json`),
      ['PERSISTENCE_DESKTOP_CLOSED'],
      'OUTER',
    ).process;
    if (
      JSON.stringify(publicResult.stages[stage]) !==
      JSON.stringify({ observation: result, process })
    )
      fail('SCHEMA');
  }
  const final = json(path.join(root, 'rollback-REOPEN-state.json'));
  if (JSON.stringify(launchFiles(s.launch)) !== JSON.stringify(final.launchFiles)) fail('HISTORY');
  const runtime = await runtimePlan(s.header.dataRoot, s.header.storeId, 'REOPEN');
  if (JSON.stringify(runtime.witnesses) !== JSON.stringify(final.runtimeWitnesses)) fail('HISTORY');
  const audit = await require('./retained-rollback-audit.cjs').audit(
    path.join(s.managed, 'logs-main'),
    json(path.join(root, 'rollback-REOPEN-binding.json')),
    base.binary,
    s.header.ownerToken,
    json(path.join(root, 'rollback-ROLLBACK-state.json')).audit,
    pkg.admitPackage(root),
  );
  if (JSON.stringify(audit) !== JSON.stringify(final.audit)) fail('HISTORY');
  const plans = [
      base.packagePlan(root),
      { directory: runtime.directory, entries: runtime.entries },
      base.otherDataPlan(s.header.dataRoot),
    ],
    files = [];
  const launches = STAGES.map(
    (stage) => json(path.join(root, `rollback-${stage}-state.json`)).header.launchId,
  );
  const allowed = [
    '.owner',
    '.launcher-guard',
    '.launcher-current.json',
    'data-main',
    'logs-main',
    'verification-backup-parent',
    ...launches.map((id) => 'launch-' + id),
  ];
  const all = entries(s.managed, allowed.length);
  if (all.length !== allowed.length || all.some((e) => !allowed.includes(e.name)))
    fail('INVENTORY');
  if (
    read(path.join(s.header.dataRoot, '.persistence-owner.json')) !==
    JSON.stringify({ version: 1, storeId: s.header.storeId, kind: 'FRESH', restoreReceiptId: null })
  )
    fail('OWNER');
  for (const e of all) {
    if (e.name === 'data-main') continue;
    if (e.name === 'logs-main') {
      const logEntries = entries(e.file, 516);
      if (logEntries.some((x) => !x.stat.isFile() || x.stat.nlink !== 1)) fail('INVENTORY');
      plans.push({ directory: e.file, entries: logEntries });
    } else if (e.name === 'verification-backup-parent') {
      const cfg = json(path.join(s.header.dataRoot, 'backup-locations.json'));
      if (
        cfg.version !== 1 ||
        cfg.storeId !== s.header.storeId ||
        !Array.isArray(cfg.locations) ||
        cfg.locations.length !== 1
      )
        fail('OWNER');
      const loc = cfg.locations[0],
        children = entries(e.file, 1);
      if (
        !uuid(loc.locationId) ||
        !uuid(loc.folderMarkerId) ||
        cfg.activeLocationId !== loc.locationId ||
        loc.state !== 'ACTIVE' ||
        loc.absolutePath !== path.join(e.file, 'backup-' + loc.folderMarkerId) ||
        children.length !== 1 ||
        children[0].file !== loc.absolutePath ||
        read(path.join(loc.absolutePath, '.backup-owner.json')) !==
          JSON.stringify({
            version: 1,
            storeId: s.header.storeId,
            locationId: loc.locationId,
            folderMarkerId: loc.folderMarkerId,
          })
      )
        fail('OWNER');
      plans.push(tree(e.file, 134217728));
    } else if (e.name.startsWith('launch-')) {
      const metadata = [];
      let total = 0;
      for (const child of entries(e.file, 256)) {
        if (child.stat.isDirectory()) {
          if (
            !['provision', 'auth', 'main'].some(
              (kind) => child.name === `fonesi-auto-foundation-${e.name.slice(7)}-${kind}`,
            ) ||
            read(path.join(child.file, '.owner')) !== 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n'
          )
            fail('OWNER');
          plans.push(tree(child.file, 8388608));
        } else {
          if (child.stat.size > 65536 || child.stat.nlink !== 1) fail('LIMIT');
          total += child.stat.size;
          metadata.push(child);
        }
      }
      if (total > 1048576) fail('LIMIT');
      plans.push({ directory: e.file, entries: metadata });
    } else {
      if (
        e.name === '.launcher-guard' &&
        (!e.stat.isFile() || e.stat.size !== 0 || e.stat.nlink !== 1)
      )
        fail('OWNER');
      files.push(e);
    }
  }
  const expected = [
    '.owner',
    'first-use',
    'campaign.json',
    'package-binding.json',
    'relocated-package',
    'copy-SEED.json',
    'copy-PACKAGE.json',
    'scripts-SEED',
    'scripts-PACKAGE',
    'official-36.zip',
    'official-37.zip',
    'managed-evidence.json',
    'bootstrap.json',
    'integrity.json',
    'public.json',
    ...STAGES.flatMap((stage) => [
      `stage-${stage}.json`,
      `launcher-${stage}-capture.json`,
      `rollback-${stage}-observed.json`,
      `rollback-${stage}-binding.json`,
      `rollback-${stage}-result.json`,
      `rollback-${stage}-state.json`,
    ]),
    ...STAGES.flatMap((_stage, i) =>
      (i ? ['auth', 'ui'] : ['provision', 'auth', 'ui']).map((kind) =>
        path.basename(witnessPath(path.join(s.managed, 'launch-' + launches[i]), kind)),
      ),
    ),
  ];
  const outer = entries(root, expected.length);
  if (outer.length !== expected.length || outer.some((e) => !expected.includes(e.name)))
    fail('INVENTORY');
  for (const e of outer) {
    if (['.owner', 'first-use', 'relocated-package'].includes(e.name)) continue;
    if (['scripts-SEED', 'scripts-PACKAGE'].includes(e.name)) {
      const mode = e.name.slice(8),
        names = [
          'launch-core.ps1',
          `Invoke-${mode === 'SEED' ? 'Desktop' : 'Package'}.instrumented.ps1`,
        ],
        items = entries(e.file, 2);
      if (items.length !== 2 || items.some((x) => !names.includes(x.name) || !x.stat.isFile()))
        fail('INVENTORY');
      plans.push({ directory: e.file, entries: items });
    } else {
      const pin = ARCHIVES.find((a) => a.file === e.name);
      if (!e.stat.isFile() || e.stat.nlink !== 1 || e.stat.size > (pin ? pin.bytes : 65536))
        fail('LIMIT');
      files.push(e);
    }
  }
  for (const plan of plans)
    for (const e of plan.entries) if (e.stat.isFile() && e.stat.nlink !== 1) fail('OWNER');
  verify(root);
  if (owned(root) !== token) fail('OWNER');
  // Recheck every collected identity and size before the first deletion; no inferred ownership.
  for (const e of [...files, ...plans.flatMap((p) => p.entries)]) {
    const now = fs.lstatSync(e.file);
    if (
      now.dev !== e.stat.dev ||
      now.ino !== e.stat.ino ||
      now.size !== e.stat.size ||
      now.mtimeMs !== e.stat.mtimeMs ||
      now.isSymbolicLink() ||
      (now.isFile() && now.nlink !== 1)
    )
      fail('OWNER');
  }
  for (const plan of plans) {
    for (const e of plan.entries.filter((x) => x.stat.isFile())) fs.unlinkSync(e.file);
    for (const e of plan.entries
      .filter((x) => x.stat.isDirectory())
      .sort((a, b) => b.file.length - a.file.length))
      fs.rmdirSync(e.file);
    fs.rmdirSync(plan.directory);
  }
  for (const e of files) fs.unlinkSync(e.file);
  fs.rmdirSync(s.managed);
  fs.rmdirSync(path.join(root, 'first-use'));
}
module.exports = {
  ARCHIVES,
  SOURCES,
  owned,
  verify,
  prepare,
  prepareStage,
  transform,
  scriptBinding,
  state,
  inspectDatabase,
  runtimePlan,
  inspect,
  launchFiles,
  histories,
  proof,
  pathBudget,
  diagnose,
  cleanup,
};
if (require.main === module) {
  const [action, root, ...args] = process.argv.slice(2);
  Promise.resolve()
    .then(async () => {
      if (action === 'prepare' && args.length === 4) await prepare(root, ...args);
      else if (action === 'prepare-stage' && args.length === 1) prepareStage(root, args[0]);
      else if (action === 'inspect' && args.length === 1) await inspect(root, args[0]);
      else if (action === 'diagnose' && args.length === 1) {
        for (const marker of diagnose(root, args[0])) console.error(marker);
      } else if (action === 'cleanup' && args.length === 0) await cleanup(root);
      else fail('SCHEMA');
      console.log('RETAINED_ROLLBACK_CONTROL_PASS');
    })
    .catch((error) => {
      const phase =
        {
          prepare: 'PREPARE',
          'prepare-stage': 'PREPARE',
          inspect: 'INSPECT',
          diagnose: 'DIAGNOSE',
          cleanup: 'CLEANUP',
        }[action] ?? 'ARGUMENT';
      console.error('RETAINED_ROLLBACK_PHASE_' + phase);
      console.error('RETAINED_ROLLBACK_REASON_' + c.reason(error));
      console.log('RETAINED_ROLLBACK_CONTROL_FAILED');
      process.exitCode = 1;
    });
}
