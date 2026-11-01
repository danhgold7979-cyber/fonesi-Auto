'use strict';
// Verification-owned SOURCE launcher only; no ADB, fixture database or product switch.
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { plain, read, write, uuid } = require('./persistence-restore-contract.cjs');
const { ORIGINAL_SHA, WRAPPER_SHA, witnessPath } = require('./persistence-launch-e2e-control.cjs');
const journal = require('../launch/launch-journal.cjs');
const { parseCapture } = require('./package-state-control.cjs');
const { entries, tree } = require('./package-owned-files.cjs');
const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const BOOTSTRAP = Object.freeze([
  'auditedCopy',
  'provisioned',
  'authenticated',
  'mainReady',
  'schema4',
  'migration3BackupAuthenticated',
  'migration4ReceiptBound',
  'durableStartupCommitted',
  'captureStoreEmpty',
  'leaseReleased',
  'journalSettled',
]);
const SOURCES = Object.freeze([
  'scripts/verify-dependencies.mjs',
  'verification/install-electron.mjs',
  'verification/persistence-control.cjs',
  'verification/package-state-control.cjs',
  'verification/settings-recovery-contract.cjs',
  'verification/settings-contract.cjs',
  'verification/recipient-setup-control.cjs',
  'verification/recipient-setup-main-probe.cjs',
  'verification/platform-tools-candidate.json',
  'verification/fleet-ui-schema4.cjs',
  'verification/recipient-setup-contract.cjs',
  'verification/persistence-launch-init-probe.cjs',
  'verification/persistence-launch-e2e-control.cjs',
  'verification/persistence-restore-contract.cjs',
  'verification/package-owned-files.cjs',
  'verification/package-contract.cjs',
  'verification/Invoke-RecipientSetup.ps1',
  'verification/validate_recipient_setup.py',
  'verification/validate_settings.py',
  'verification/validate_runtime.py',
  'verification/validate_persistence.py',
  'verification/WindowsBoundary.psm1',
  'verification/OwnedFiles.psm1',
]);
function fail(code = 'RECIPIENT_SETUP_CONTROL_REJECTED') {
  throw Error(code);
}
function json(file) {
  const raw = read(file),
    v = JSON.parse(raw);
  if (JSON.stringify(v) !== raw) fail();
  return v;
}
function owned(root) {
  plain(root);
  const token = read(path.join(root, '.owner'));
  if (
    !uuid(token) ||
    path.basename(path.dirname(root)) !== '.recipient-setup-runtime' ||
    path.basename(root) !== 'run-' + path.basename(root).slice(4) ||
    !uuid(path.basename(root).slice(4))
  )
    fail();
  return token;
}
function rawWrite(file, raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) fail();
  plain(path.dirname(file));
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (read(file) !== raw) fail();
}
function transform(source, desktop) {
  if (hash(source) !== ORIGINAL_SHA) fail('RECIPIENT_SETUP_SOURCE_CHANGED');
  const replacements = [
    [
      "$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))",
      `$desktop='${desktop.replaceAll("'", "''")}'`,
    ],
    ['$launchTools=$PSScriptRoot', "$launchTools=Join-Path $desktop 'launch'"],
    [
      "Join-Path $launchTools 'persistence-initialize.cjs'",
      "Join-Path $desktop 'verification/persistence-launch-init-probe.cjs'",
    ],
    [
      "Join-Path $desktop 'build/main.cjs'",
      "Join-Path $desktop 'verification/recipient-setup-main-probe.cjs'",
    ],
  ];
  let derived = source;
  for (const [from, to] of replacements) {
    if (derived.split(from).length !== 2) fail('RECIPIENT_SETUP_TRANSFORM');
    derived = derived.replace(from, to);
  }
  return derived;
}
async function binding(root) {
  owned(root);
  const desktop = path.resolve(__dirname, '..');
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(desktop)) fail('RECIPIENT_SETUP_BUILD');
  const wrapper = read(path.join(desktop, 'launch/Invoke-Desktop.ps1')),
    original = read(path.join(desktop, 'launch/launch-core.ps1'));
  if (hash(wrapper) !== WRAPPER_SHA || !wrapper.includes("-EntryMode 'SOURCE'"))
    fail('RECIPIENT_SETUP_SOURCE_CHANGED');
  const derived = transform(original, desktop);
  const proof = {
    version: 1,
    wrapperSha: hash(wrapper),
    originalSha: hash(original),
    derivedSha: hash(derived),
    substitutions: 4,
    sources: Object.fromEntries(SOURCES.map((n) => [n, hash(read(path.join(desktop, n)))])),
  };
  return { wrapper, derived, proof };
}
const PIN = Object.freeze({
  bytes: 8044989,
  sha256: '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99',
});
function binary(file, limit) {
  plain(path.dirname(file));
  const s = fs.lstatSync(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    s.size > limit ||
    fs.realpathSync.native(file) !== file
  )
    fail('RECIPIENT_SETUP_ARCHIVE');
  const bytes = fs.readFileSync(file);
  if (bytes.length !== s.size) fail('RECIPIENT_SETUP_ARCHIVE');
  return bytes;
}
function exclusiveBytes(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (!binary(file, bytes.length).equals(bytes)) fail('RECIPIENT_SETUP_ARCHIVE');
}
function archiveInputs(root, source) {
  const bytes = binary(source, PIN.bytes);
  if (bytes.length !== PIN.bytes || hash(bytes) !== PIN.sha256) fail('RECIPIENT_SETUP_ARCHIVE');
  exclusiveBytes(path.join(root, 'official.zip'), bytes);
  const wrong = Buffer.from(bytes);
  wrong[0] ^= 1;
  exclusiveBytes(path.join(root, 'wrong-hash.zip'), wrong);
  write(path.join(root, 'archives.json'), {
    version: 1,
    source,
    bytes: PIN.bytes,
    sha256: PIN.sha256,
    wrongSha256: hash(wrong),
  });
}
function verifyArchives(root) {
  const receipt = json(path.join(root, 'archives.json'));
  if (
    JSON.stringify(Object.keys(receipt)) !==
      JSON.stringify(['version', 'source', 'bytes', 'sha256', 'wrongSha256']) ||
    receipt.version !== 1 ||
    receipt.bytes !== PIN.bytes ||
    receipt.sha256 !== PIN.sha256 ||
    typeof receipt.source !== 'string'
  )
    fail('RECIPIENT_SETUP_ARCHIVE');
  const source = binary(receipt.source, PIN.bytes),
    official = binary(path.join(root, 'official.zip'), PIN.bytes),
    wrong = binary(path.join(root, 'wrong-hash.zip'), PIN.bytes);
  if (
    source.length !== PIN.bytes ||
    hash(source) !== PIN.sha256 ||
    !source.equals(official) ||
    wrong.length !== PIN.bytes ||
    hash(wrong) !== receipt.wrongSha256
  )
    fail('RECIPIENT_SETUP_ARCHIVE');
  const expected = Buffer.from(official);
  expected[0] ^= 1;
  if (!wrong.equals(expected)) fail('RECIPIENT_SETUP_ARCHIVE');
  return true;
}
function materialize(root, b) {
  fs.mkdirSync(path.join(root, 'first-use'));
  rawWrite(path.join(root, 'Invoke-Desktop.instrumented.ps1'), b.wrapper);
  rawWrite(path.join(root, 'launch-core.ps1'), b.derived);
  write(path.join(root, 'copy.json'), b.proof);
}
async function prepare(root, archive) {
  const b = await binding(root);
  archiveInputs(root, archive);
  materialize(root, b);
}
async function verifyCopy(root) {
  const b = await binding(root);
  if (
    read(path.join(root, 'Invoke-Desktop.instrumented.ps1')) !== b.wrapper ||
    read(path.join(root, 'launch-core.ps1')) !== b.derived ||
    JSON.stringify(json(path.join(root, 'copy.json'))) !== JSON.stringify(b.proof)
  )
    fail('RECIPIENT_SETUP_COPY');
  return true;
}
const CAPTURE_VECTOR = Object.freeze({
  TARGET: Object.freeze(['OUTER', 'PROVISION', 'AUTH', 'MAIN', 'UNKNOWN']),
  SCHEMA: Object.freeze(['VALID', 'INVALID']),
  STATUS: Object.freeze(['SUCCESS', 'NONZERO_EXIT', 'OTHER', 'UNAVAILABLE']),
  EXIT: Object.freeze(['ZERO', 'NONZERO', 'NULL', 'UNAVAILABLE']),
  RETIRED: Object.freeze(['TRUE', 'FALSE', 'UNAVAILABLE']),
  TRUNCATED: Object.freeze(['TRUE', 'FALSE', 'UNAVAILABLE']),
  EXPECTED: Object.freeze(['ZERO', 'EXACT', 'OTHER', 'UNAVAILABLE']),
  ORDER: Object.freeze(['MATCH', 'MISMATCH', 'UNAVAILABLE']),
  LEADING: Object.freeze(['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE']),
  TRAILING: Object.freeze(['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE']),
  INTERIOR: Object.freeze(['TRUE', 'FALSE', 'UNAVAILABLE']),
  UNKNOWN: Object.freeze(['TRUE', 'FALSE', 'UNAVAILABLE']),
  FAILURE: Object.freeze(['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE']),
  STDERR_FAILURE: Object.freeze(['TRUE', 'FALSE', 'UNAVAILABLE']),
});
const captureErrors = new WeakMap();
const FAILURE_LINES = Object.freeze([
  'PERSISTENCE_LAUNCH_PROBE_FAILED',
  'RECIPIENT_SETUP_FAILED',
  'BOOTSTRAP_FAILED',
  'BOOTSTRAP_CLEANUP_FAILED',
  'PERSISTENCE_SHUTDOWN_FAILED',
  'PERSISTENCE_DESKTOP_PREPARE_FAILED',
  'PERSISTENCE_DESKTOP_SETUP_FAILED',
  'PERSISTENCE_DESKTOP_INITIALIZATION_FAILED',
  'PERSISTENCE_DESKTOP_APPLICATION_FAILED',
  'PERSISTENCE_DESKTOP_RELEASE_FAILED',
  'PERSISTENCE_DESKTOP_RECOVERY_FAILED',
  'PERSISTENCE_INITIALIZE_FAILED',
]);
function captureVector(value, lines, target) {
  const out = Object.fromEntries(Object.keys(CAPTURE_VECTOR).map((k) => [k, 'UNAVAILABLE']));
  out.TARGET = CAPTURE_VECTOR.TARGET.includes(target) ? target : 'UNKNOWN';
  out.SCHEMA = 'INVALID';
  let v;
  try {
    v = parseCapture(value);
  } catch {
    return out;
  }
  out.SCHEMA = 'VALID';
  const p = v.process,
    raw = v.stdout.replace(/\r\n/g, '\n'),
    parts = raw.split('\n');
  out.STATUS = ['SUCCESS', 'NONZERO_EXIT'].includes(p.status) ? p.status : 'OTHER';
  out.EXIT = p.exitCode === 0 ? 'ZERO' : p.exitCode === null ? 'NULL' : 'NONZERO';
  out.RETIRED = p.cleanupComplete === true ? 'TRUE' : 'FALSE';
  out.TRUNCATED = p.stdoutTruncated || p.stderrTruncated ? 'TRUE' : 'FALSE';
  const nonempty = parts.filter((x) => x !== ''),
    expected = nonempty.filter((x) => lines.includes(x));
  out.EXPECTED =
    expected.length === 0
      ? 'ZERO'
      : expected.length === lines.length &&
          lines.every((x) => expected.filter((y) => x === y).length === 1)
        ? 'EXACT'
        : 'OTHER';
  out.ORDER = JSON.stringify(expected) === JSON.stringify(lines) ? 'MATCH' : 'MISMATCH';
  let leading = 0,
    trailing = 0;
  while (leading < parts.length && parts[leading] === '') leading++;
  while (trailing < parts.length && parts[parts.length - 1 - trailing] === '') trailing++;
  const count = (n) => (n === 0 ? 'ZERO' : n === 1 ? 'ONE' : 'MULTIPLE');
  out.LEADING = count(leading);
  out.TRAILING = count(trailing);
  out.INTERIOR = parts.slice(leading, parts.length - trailing).includes('') ? 'TRUE' : 'FALSE';
  out.UNKNOWN = nonempty.some((x) => !lines.includes(x) && !FAILURE_LINES.includes(x))
    ? 'TRUE'
    : 'FALSE';
  out.FAILURE = count(nonempty.filter((x) => FAILURE_LINES.includes(x)).length);
  out.STDERR_FAILURE = v.stderr.split(/\r?\n/).some((x) => FAILURE_LINES.includes(x))
    ? 'TRUE'
    : 'FALSE';
  return out;
}
function capture(file, lines, target = 'UNKNOWN') {
  const raw = read(file);
  try {
    return captureChecked(raw, lines);
  } catch (error) {
    if (error && typeof error === 'object')
      captureErrors.set(error, captureVector(raw, lines, target));
    throw error;
  }
}
function captureChecked(raw, lines) {
  const v = parseCapture(raw),
    p = v.process;
  if (
    p?.status !== 'SUCCESS' ||
    p.exitCode !== 0 ||
    p.cleanupComplete !== true ||
    p.stdoutTruncated !== false ||
    p.stderrTruncated !== false ||
    typeof v.stdout !== 'string' ||
    typeof v.stderr !== 'string' ||
    v.stdout.length > 32768 ||
    v.stderr.length > 32768
  )
    fail('RECIPIENT_SETUP_RETIREMENT');
  if (
    ![lines.join('\n') + '\n', '\n' + lines.join('\n') + '\n'].includes(
      v.stdout.replace(/\r\n/g, '\n'),
    ) ||
    v.stderr
      .split(/\r?\n/)
      .some((s) =>
        [
          'PERSISTENCE_LAUNCH_PROBE_FAILED',
          'RECIPIENT_SETUP_FAILED',
          'BOOTSTRAP_FAILED',
          'BOOTSTRAP_CLEANUP_FAILED',
          'PERSISTENCE_SHUTDOWN_FAILED',
        ].includes(s),
      )
  )
    fail('RECIPIENT_SETUP_CAPTURE');
  return v;
}
function state(root, completed = true) {
  owned(root);
  const children = entries(path.join(root, 'first-use'), 2);
  if (
    children.length !== 1 ||
    !children[0].stat.isDirectory() ||
    !children[0].name.startsWith('Fonesi-Auto-') ||
    !uuid(children[0].name.slice(12))
  )
    fail('RECIPIENT_SETUP_OWNER');
  const managed = children[0].file,
    token = read(path.join(managed, '.owner')),
    pointer = json(path.join(managed, '.launcher-current.json'));
  if (!uuid(token) || !uuid(pointer.launchId)) fail('RECIPIENT_SETUP_OWNER');
  const launches = entries(managed, 9).filter((e) => e.name.startsWith('launch-'));
  if (
    launches.length < 1 ||
    launches.length > 2 ||
    launches.some((e) => !e.stat.isDirectory() || !uuid(e.name.slice(7)))
  )
    fail('RECIPIENT_SETUP_OWNER');
  const launch = path.join(managed, 'launch-' + pointer.launchId),
    chain = journal.inspect(managed, launch),
    header = chain.header;
  if (
    !launches.some((e) => e.file === launch) ||
    (completed &&
      (chain.pending ||
        chain.latest?.stage !== 'RELEASE' ||
        chain.latest.status !== 'SUCCESS' ||
        chain.latest.exitCode !== 0)) ||
    header.entryMode !== 'SOURCE' ||
    header.dataRoot !== path.join(managed, 'data-main') ||
    header.parentToken !== token
  )
    fail('RECIPIENT_SETUP_JOURNAL');
  return { managed, launch, header, chain, launches };
}
function launchWitness(launch) {
  const result = [];
  let metadata = 0;
  for (const e of entries(launch)) {
    if (e.stat.isDirectory()) {
      if (
        !['provision', 'auth', 'main'].some(
          (stage) => e.name === `fonesi-auto-foundation-${path.basename(launch).slice(7)}-${stage}`,
        ) ||
        read(path.join(e.file, '.owner')) !== 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n'
      )
        fail('RECIPIENT_SETUP_OWNER');
      result.push({ path: e.name, kind: 'DIRECTORY' });
      for (const item of tree(e.file, 8388608).entries) {
        if (item.stat.isDirectory())
          result.push({
            path: path.relative(launch, item.file).split(path.sep).join('/'),
            kind: 'DIRECTORY',
          });
        if (item.stat.isFile()) {
          if (item.stat.nlink !== 1) fail('RECIPIENT_SETUP_OWNER');
          result.push({
            path: path.relative(launch, item.file).split(path.sep).join('/'),
            bytes: item.stat.size,
            sha256: hash(binary(item.file, 8388608)),
          });
        }
      }
    } else {
      if (e.stat.nlink !== 1 || e.stat.size > 65536) fail('RECIPIENT_SETUP_LIMIT');
      metadata += e.stat.size;
      result.push({ path: e.name, bytes: e.stat.size, sha256: hash(binary(e.file, 65536)) });
    }
  }
  if (metadata > 1048576) fail('RECIPIENT_SETUP_LIMIT');
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
function observerMarkers(raw) {
  const phases = require('./recipient-setup-contract.cjs').PHASES;
  const lines = raw.split(/\r?\n/);
  const matched = lines.filter((line) =>
    phases.some((phase) => line === 'RECIPIENT_SETUP_PHASE_' + phase),
  );
  return matched.length === 1 &&
    lines.filter((line) => line === 'RECIPIENT_SETUP_FAILED').length === 1
    ? [matched[0], 'RECIPIENT_SETUP_FAILED']
    : [];
}
async function diagnose(root) {
  await verifyCopy(root);
  const outer = parseCapture(
    read(
      path.join(
        root,
        fs.existsSync(path.join(root, 'launcher-reopen-capture.json'))
          ? 'launcher-reopen-capture.json'
          : 'launcher-first-capture.json',
      ),
    ),
  );
  const retired = (p) =>
    ['SUCCESS', 'NONZERO_EXIT', 'EMPTY_OUTPUT'].includes(p.status) &&
    p.cleanupComplete &&
    !p.stdoutTruncated &&
    !p.stderrTruncated;
  if (!retired(outer.process)) fail('RECIPIENT_SETUP_RETIREMENT');
  const s = state(root, false),
    latest = s.chain.latest;
  if (s.chain.pending || latest?.stage !== 'MAIN' || !retired(latest)) return [];
  const raw = read(path.join(s.launch, `capture-${String(latest.sequence).padStart(2, '0')}.json`));
  if (hash(raw) !== latest.captureSha256) fail('RECIPIENT_SETUP_JOURNAL');
  return observerMarkers(parseCapture(raw).stderr);
}
function released(s) {
  try {
    fs.lstatSync(path.join(s.header.dataRoot, '.writer-lock'));
    fail('RECIPIENT_SETUP_LEASE');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (
    read(path.join(s.header.dataRoot, `.released-${s.header.ownerToken}.json`)) !==
    JSON.stringify({ version: 1, storeId: s.header.storeId, ownerToken: s.header.ownerToken })
  )
    fail('RECIPIENT_SETUP_LEASE');
}
function inspectDatabase(data, storeId, reopen) {
  const {
    FoundationDatabase,
    statement,
    MIGRATION_HASHES,
  } = require('../build/foundation-database.cjs');
  const {
    receipts,
    assertMigrationBinding,
    assertCaptureAbsent,
  } = require('./fleet-ui-schema4.cjs');
  const receipt = receipts(data, storeId)[3],
    db = new FoundationDatabase(path.join(data, 'active.sqlite'), storeId, true);
  try {
    db.validate();
    if (db.version !== 4) fail('RECIPIENT_SETUP_SCHEMA');
    db.readSettings();
    const d = db.readDurable();
    if (
      d.meta.revision !== (reopen ? 4 : 2) ||
      d.meta.host_epoch !== (reopen ? 2 : 1) ||
      ['devices', 'bindings', 'identityEvidence', 'captures', 'holds'].some(
        (k) => d[k].length !== 0,
      )
    )
      fail('RECIPIENT_SETUP_SCHEMA');
    assertMigrationBinding(
      statement(
        db.connection,
        'SELECT version,script_sha256,prerequisite_backup_id FROM schema_migration WHERE version=4',
        (s) => s.get(),
      ),
      receipt,
      MIGRATION_HASHES[3],
    );
    assertCaptureAbsent(data);
  } finally {
    db.close();
  }
}
function assertSchema4Observed(value) {
  if (
    JSON.stringify(value) !==
    JSON.stringify({
      version: 2,
      migration3BackupAuthenticated: true,
      migration4ReceiptBound: true,
      durableStartupCommitted: true,
      captureStoreEmpty: true,
    })
  )
    fail('RECIPIENT_SETUP_SCHEMA');
  return true;
}
async function inspect(root, reopen = false) {
  await verifyCopy(root);
  verifyArchives(root);
  assertSchema4Observed(json(path.join(root, 'schema4-observed.json')));
  capture(
    path.join(root, reopen ? 'launcher-reopen-capture.json' : 'launcher-first-capture.json'),
    ['PERSISTENCE_DESKTOP_CLOSED'],
    'OUTER',
  );
  const s = state(root),
    { launch, header } = s;
  if (s.launches.length !== (reopen ? 2 : 1)) fail('RECIPIENT_SETUP_JOURNAL');
  if (reopen) {
    const first = json(path.join(root, 'first-release.json'));
    if (
      first.version !== 1 ||
      first.managed !== s.managed ||
      first.schema4Sha256 !== hash(read(path.join(root, 'schema4-observed.json'))) ||
      first.header.launchId === header.launchId ||
      first.header.ownerToken === header.ownerToken ||
      first.header.storeId !== header.storeId ||
      JSON.stringify(launchWitness(path.join(s.managed, 'launch-' + first.header.launchId))) !==
        JSON.stringify(first.files)
    )
      fail('RECIPIENT_SETUP_JOURNAL');
    if (
      read(path.join(header.dataRoot, `.released-${first.header.ownerToken}.json`)) !==
      JSON.stringify({ version: 1, storeId: header.storeId, ownerToken: first.header.ownerToken })
    )
      fail('RECIPIENT_SETUP_LEASE');
  }
  const auth = json(path.join(launch, 'auth-observed.json'));
  capture(path.join(launch, 'auth-capture.json'), ['PERSISTENCE_INITIALIZE_ORDERLY'], 'AUTH');
  capture(path.join(launch, 'main-capture.json'), ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED'], 'MAIN');
  if (auth.status !== 'AUTHENTICATED' || !auth.witness) fail('RECIPIENT_SETUP_AUTH');
  if (!reopen) {
    const provision = json(path.join(launch, 'provision-observed.json'));
    capture(
      path.join(launch, 'provision-capture.json'),
      ['PERSISTENCE_INITIALIZE_ORDERLY'],
      'PROVISION',
    );
    if (
      provision.status !== 'PROVISIONED' ||
      JSON.stringify(provision.witness) !== JSON.stringify(auth.witness)
    )
      fail('RECIPIENT_SETUP_AUTH');
  }
  for (const stage of reopen ? ['auth'] : ['provision', 'auth']) {
    const d = json(witnessPath(launch, stage));
    if (
      JSON.stringify(d) !==
      JSON.stringify({
        version: 1,
        stage,
        opens: stage === 'provision' ? 1 : 0,
        confirms: stage === 'provision' ? 1 : 0,
      })
    )
      fail('RECIPIENT_SETUP_DIALOG');
  }
  released(s);
  if (
    read(path.join(header.dataRoot, 'key-durability-proof.json')) !==
    JSON.stringify({
      version: 2,
      ...auth.witness,
      state: 'ORDERLY_REOPEN_AUTHENTICATED',
      runtimeCertification: 'ELECTRON_45_1_0_WIN_X64_DPAPI_V1',
    })
  )
    fail('RECIPIENT_SETUP_AUTH');
  inspectDatabase(header.dataRoot, header.storeId, reopen);
  if (!reopen) {
    write(path.join(root, 'first-release.json'), {
      version: 1,
      managed: s.managed,
      schema4Sha256: hash(read(path.join(root, 'schema4-observed.json'))),
      header,
      files: launchWitness(launch),
    });
    write(path.join(root, 'launch-command.json'), {
      version: 1,
      managedRoot: s.managed,
      firstLaunchId: header.launchId,
    });
  }
  write(path.join(root, reopen ? 'bootstrap-reopen.json' : 'bootstrap-first.json'), {
    version: 1,
    cases: Object.fromEntries(BOOTSTRAP.map((k) => [k, true])),
  });
  if (reopen) {
    await verifyCopy(root);
    verifyArchives(root);
    write(path.join(root, 'integrity.json'), {
      version: 1,
      originalArchiveUnchanged: true,
      originalSourceUnchanged: true,
    });
  }
  return s;
}
function observeReopenStartup(launch) {
  const root = path.dirname(path.dirname(path.dirname(launch))),
    s = state(root, false),
    first = json(path.join(root, 'first-release.json'));
  if (
    s.launch !== launch ||
    s.launches.length !== 2 ||
    first.header.launchId === s.header.launchId ||
    first.header.ownerToken === s.header.ownerToken ||
    first.header.storeId !== s.header.storeId ||
    s.chain.pending?.stage !== 'MAIN' ||
    s.chain.latest?.stage !== 'PREPARE_READY'
  )
    fail('RECIPIENT_SETUP_JOURNAL');
  if (
    JSON.stringify(launchWitness(path.join(s.managed, 'launch-' + first.header.launchId))) !==
    JSON.stringify(first.files)
  )
    fail('RECIPIENT_SETUP_JOURNAL');
  inspectDatabase(s.header.dataRoot, s.header.storeId, true);
  return true;
}
async function provisionPlan(dataRoot, storeId) {
  const { createPlatformToolsProvisionLedger } = await import(
    '../src/main/platform-tools-provision-ledger.ts'
  );
  const { createPlatformToolsProvisionFiles } = await import(
    '../src/main/platform-tools-provision-files.ts'
  );
  const { PLATFORM_TOOLS_CANDIDATE: candidate } = await import(
    '../src/main/platform-tools-candidate.ts'
  );
  const ledger = createPlatformToolsProvisionLedger({
    dataRoot,
    storeId,
    assertOwnedSync: () => {},
    acceptedCandidates: [
      { manifestSha256: hash(JSON.stringify(candidate)), archiveSha256: candidate.archive.sha256 },
    ],
  });
  const current = await ledger.readState();
  if (current.activeSha256 !== PIN.sha256 || current.revision < 1) fail('RECIPIENT_SETUP_RESULT');
  const files = createPlatformToolsProvisionFiles({ dataRoot, assertOwnedSync: () => {} });
  await files.scan(current.operationIds, () => {});
  await files.verifyRuntime(() => {});
  const directory = path.join(dataRoot, 'platform-tools-runtime'),
    out = [];
  let bytes = 0;
  function walk(dir, depth) {
    if (depth > 4) fail('RECIPIENT_SETUP_LIMIT');
    for (const e of entries(dir, 256)) {
      if (out.length >= 512) fail('RECIPIENT_SETUP_LIMIT');
      out.push(e);
      if (e.stat.isDirectory()) walk(e.file, depth + 1);
      else {
        if (e.stat.nlink !== 1) fail('RECIPIENT_SETUP_OWNER');
        bytes += e.stat.size;
        if (bytes > 134217728) fail('RECIPIENT_SETUP_LIMIT');
      }
    }
  }
  walk(directory, 0);
  return { directory, entries: out };
}
function otherDataPlan(dataRoot) {
  const out = [];
  let bytes = 0;
  for (const e of entries(dataRoot)) {
    if (e.name === 'platform-tools-runtime') continue;
    out.push(e);
    if (e.stat.isDirectory()) out.push(...tree(e.file, 134217728).entries);
  }
  for (const e of out) {
    if (e.stat.isFile()) {
      if (e.stat.nlink !== 1) fail('RECIPIENT_SETUP_OWNER');
      bytes += e.stat.size;
    }
  }
  if (out.length > 256 || bytes > 134217728) fail('RECIPIENT_SETUP_LIMIT');
  return { directory: dataRoot, entries: out };
}
async function cleanup(root) {
  await verifyCopy(root);
  verifyArchives(root);
  const token = owned(root),
    s = state(root);
  capture(path.join(root, 'launcher-reopen-capture.json'), ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER');
  const publicResult = json(path.join(root, 'public.json'));
  if (
    publicResult.failure !== null ||
    !publicResult.modes ||
    !['FIRST', 'REOPEN'].every((mode) =>
      Object.values(publicResult.modes[mode].cases).every((x) => x === true),
    )
  )
    fail('RECIPIENT_SETUP_RESULT');
  const { validateResult } = require('./recipient-setup-contract.cjs');
  for (const mode of ['FIRST', 'REOPEN']) {
    const raw = json(
      path.join(root, mode === 'FIRST' ? 'setup-first-result.json' : 'setup-reopen-result.json'),
    );
    if (
      !validateResult(raw).passed ||
      JSON.stringify(raw) !== JSON.stringify(publicResult.modes[mode])
    )
      fail('RECIPIENT_SETUP_RESULT');
  }
  if (
    read(path.join(root, 'integrity.json')) !==
    JSON.stringify({ version: 1, originalArchiveUnchanged: true, originalSourceUnchanged: true })
  )
    fail('RECIPIENT_SETUP_RESULT');
  const first = json(path.join(root, 'first-release.json'));
  if (
    s.launches.length !== 2 ||
    first.header.launchId === s.header.launchId ||
    first.header.ownerToken === s.header.ownerToken ||
    first.header.storeId !== s.header.storeId ||
    JSON.stringify(launchWitness(path.join(s.managed, 'launch-' + first.header.launchId))) !==
      JSON.stringify(first.files)
  )
    fail('RECIPIENT_SETUP_JOURNAL');
  released(s);
  if (
    read(path.join(s.header.dataRoot, `.released-${first.header.ownerToken}.json`)) !==
    JSON.stringify({ version: 1, storeId: s.header.storeId, ownerToken: first.header.ownerToken })
  )
    fail('RECIPIENT_SETUP_LEASE');
  const plans = [],
    files = [];
  const add = (dir, limit) => plans.push(tree(dir, limit));
  const managedEntries = entries(s.managed, 9),
    allowed = [
      '.owner',
      '.launcher-guard',
      '.launcher-current.json',
      'data-main',
      'logs-main',
      'verification-backup-parent',
      ...s.launches.map((e) => e.name),
    ];
  if (
    managedEntries.length !== allowed.length ||
    managedEntries.some((e) => !allowed.includes(e.name))
  )
    fail('RECIPIENT_SETUP_INVENTORY');
  const marker = json(path.join(s.header.dataRoot, '.persistence-owner.json'));
  if (
    JSON.stringify(marker) !==
    JSON.stringify({ version: 1, storeId: s.header.storeId, kind: 'FRESH', restoreReceiptId: null })
  )
    fail('RECIPIENT_SETUP_OWNER');
  const guard = fs.lstatSync(path.join(s.managed, '.launcher-guard'));
  if (!guard.isFile() || guard.isSymbolicLink() || guard.size !== 0 || guard.nlink !== 1)
    fail('RECIPIENT_SETUP_OWNER');
  for (const item of managedEntries) {
    if (item.name === 'data-main') {
      const p = await provisionPlan(item.file, s.header.storeId);
      plans.push(p, otherDataPlan(item.file));
    } else if (item.name === 'logs-main') {
      const raw = read(path.join(item.file, 'owner.json'));
      if (
        !/^\{"schemaVersion":1,"storeId":"[0-9a-f-]{36}"\}\n$/.test(raw) ||
        !uuid(JSON.parse(raw).storeId) ||
        raw !== JSON.stringify(JSON.parse(raw)) + '\n'
      )
        fail('RECIPIENT_SETUP_OWNER');
      add(item.file, 8388608);
    } else if (item.name === 'verification-backup-parent') {
      const config = json(path.join(s.header.dataRoot, 'backup-locations.json'));
      if (
        config.version !== 1 ||
        config.storeId !== s.header.storeId ||
        !Array.isArray(config.locations) ||
        config.locations.length !== 1
      )
        fail('RECIPIENT_SETUP_OWNER');
      const location = config.locations[0];
      if (
        !uuid(location.locationId) ||
        !uuid(location.folderMarkerId) ||
        config.activeLocationId !== location.locationId ||
        location.state !== 'ACTIVE' ||
        location.absolutePath !== path.join(item.file, 'backup-' + location.folderMarkerId)
      )
        fail('RECIPIENT_SETUP_OWNER');
      const children = entries(item.file, 2);
      if (
        children.length !== 1 ||
        children[0].file !== location.absolutePath ||
        !children[0].stat.isDirectory()
      )
        fail('RECIPIENT_SETUP_OWNER');
      const marker = json(path.join(location.absolutePath, '.backup-owner.json'));
      if (
        JSON.stringify(marker) !==
        JSON.stringify({
          version: 1,
          storeId: s.header.storeId,
          locationId: location.locationId,
          folderMarkerId: location.folderMarkerId,
        })
      )
        fail('RECIPIENT_SETUP_OWNER');
      add(item.file, 134217728);
    } else if (s.launches.some((e) => e.file === item.file)) {
      const metadata = [];
      let total = 0;
      for (const e of entries(item.file)) {
        if (e.stat.isDirectory()) {
          if (
            !['provision', 'auth', 'main'].some(
              (stage) => e.name === `fonesi-auto-foundation-${item.name.slice(7)}-${stage}`,
            ) ||
            read(path.join(e.file, '.owner')) !== 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n'
          )
            fail('RECIPIENT_SETUP_OWNER');
          add(e.file, 8388608);
        } else {
          if (e.stat.size > 65536) fail('RECIPIENT_SETUP_LIMIT');
          total += e.stat.size;
          metadata.push(e);
        }
      }
      if (total > 1048576) fail('RECIPIENT_SETUP_LIMIT');
      plans.push({ directory: item.file, entries: metadata });
    } else files.push(item);
  }
  const expected = [
    '.owner',
    'first-use',
    'Invoke-Desktop.instrumented.ps1',
    'launch-core.ps1',
    'copy.json',
    'archives.json',
    'official.zip',
    'wrong-hash.zip',
    'launcher-first-capture.json',
    'launcher-reopen-capture.json',
    'first-release.json',
    'launch-command.json',
    'bootstrap-first.json',
    'bootstrap-reopen.json',
    'setup-first-result.json',
    'setup-reopen-result.json',
    'schema4-observed.json',
    'public.json',
    'integrity.json',
    'setup-light.png',
    'setup-dark.png',
    ...s.launches
      .flatMap((e) => ['provision', 'auth', 'ui'].map((k) => path.basename(witnessPath(e.file, k))))
      .filter((n) => fs.existsSync(path.join(root, n))),
  ];
  const rootEntries = entries(root, expected.length);
  if (rootEntries.length !== expected.length || rootEntries.some((e) => !expected.includes(e.name)))
    fail('RECIPIENT_SETUP_INVENTORY');
  for (const e of rootEntries) {
    if (e.name === 'first-use' || e.name === '.owner') continue;
    if (
      !e.stat.isFile() ||
      e.stat.nlink !== 1 ||
      e.stat.size >
        (e.name.endsWith('.png') ? 2097152 : e.name.endsWith('.zip') ? PIN.bytes : 65536)
    )
      fail('RECIPIENT_SETUP_LIMIT');
    files.push(e);
  }
  for (const plan of plans)
    for (const item of plan.entries) {
      if (item.stat.isFile() && item.stat.nlink !== 1) fail('RECIPIENT_SETUP_OWNER');
    }
  for (const item of files) if (item.stat.nlink !== 1) fail('RECIPIENT_SETUP_OWNER');
  for (const theme of ['light', 'dark']) {
    const file = path.join(root, `setup-${theme}.png`),
      expected = publicResult.modes.FIRST.screenshots[theme];
    const bytes = fs.readFileSync(file);
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256)
      fail('RECIPIENT_SETUP_RESULT');
  }
  await verifyCopy(root);
  verifyArchives(root);
  // Complete bounded inventory/identities before first deletion. Unknown partitions preserve all.
  if (read(path.join(root, '.owner')) !== token) fail('RECIPIENT_SETUP_OWNER');
  for (const plan of plans) {
    for (const e of plan.entries.filter((e) => e.stat.isFile())) fs.unlinkSync(e.file);
    for (const e of plan.entries
      .filter((e) => e.stat.isDirectory())
      .sort((a, b) => b.file.length - a.file.length))
      fs.rmdirSync(e.file);
    fs.rmdirSync(plan.directory);
  }
  for (const e of files) fs.unlinkSync(e.file);
  fs.rmdirSync(s.managed);
  fs.rmdirSync(path.join(root, 'first-use'));
}
const PHASES = Object.freeze([
  'PREPARE',
  'VERIFY_COPY',
  'INSPECT_FIRST',
  'INSPECT_REOPEN',
  'CLEANUP',
  'DIAGNOSE',
  'ARGUMENT',
]);
const REASONS = Object.freeze([
  'RECIPIENT_SETUP_CONTROL_REJECTED',
  'RECIPIENT_SETUP_SOURCE_CHANGED',
  'RECIPIENT_SETUP_TRANSFORM',
  'RECIPIENT_SETUP_BUILD',
  'RECIPIENT_SETUP_COPY',
  'RECIPIENT_SETUP_RETIREMENT',
  'RECIPIENT_SETUP_CAPTURE',
  'RECIPIENT_SETUP_OWNER',
  'RECIPIENT_SETUP_JOURNAL',
  'RECIPIENT_SETUP_AUTH',
  'RECIPIENT_SETUP_DIALOG',
  'RECIPIENT_SETUP_MAIN',
  'RECIPIENT_SETUP_LEASE',
  'RECIPIENT_SETUP_SCHEMA',
  'RECIPIENT_SETUP_RESULT',
  'RECIPIENT_SETUP_INVENTORY',
  'RECIPIENT_SETUP_LIMIT',
  'RECIPIENT_SETUP_ARCHIVE',
  'LAUNCH_JOURNAL_REJECTED',
  'PACKAGE_STATE_REJECTED',
  'RESTORE_SCHEMA',
  'ENOENT',
  'EACCES',
  'EPERM',
  'UNCLASSIFIED',
]);
function diagnostics(action, error) {
  let code = 'UNCLASSIFIED';
  for (const key of ['message', 'code']) {
    const d = error && Object.getOwnPropertyDescriptor(error, key);
    if (d && Object.hasOwn(d, 'value') && REASONS.includes(d.value)) {
      code = d.value;
      break;
    }
  }
  const phase = String(action).toUpperCase().replaceAll('-', '_');
  return [
    'RECIPIENT_SETUP_CONTROL_PHASE_' + (PHASES.includes(phase) ? phase : 'ARGUMENT'),
    'RECIPIENT_SETUP_CONTROL_REASON_' + code,
    ...Object.entries(captureErrors.get(error) ?? {}).map(
      ([key, value]) => 'RECIPIENT_SETUP_CAPTURE_' + key + '_' + value,
    ),
  ];
}
module.exports = {
  prepare,
  materialize,
  archiveInputs,
  verifyArchives,
  inspectDatabase,
  observeReopenStartup,
  assertSchema4Observed,
  otherDataPlan,
  launchWitness,
  provisionPlan,
  verifyCopy,
  inspect,
  cleanup,
  transform,
  rawWrite,
  capture,
  captureVector,
  CAPTURE_VECTOR,
  BOOTSTRAP,
  SOURCES,
  PHASES,
  REASONS,
  diagnostics,
  diagnose,
  observerMarkers,
};
if (require.main === module) {
  const [action, root, archive] = process.argv.slice(2);
  Promise.resolve()
    .then(async () => {
      if (process.argv.length !== (action === 'prepare' ? 5 : 4)) fail();
      if (action === 'prepare') await prepare(root, archive);
      else if (action === 'verify-copy') await verifyCopy(root);
      else if (action === 'inspect-first') await inspect(root, false);
      else if (action === 'inspect-reopen') await inspect(root, true);
      else if (action === 'cleanup') await cleanup(root);
      else if (action === 'diagnose') for (const line of await diagnose(root)) console.error(line);
      else fail();
      console.log('RECIPIENT_SETUP_CONTROL_PASS');
    })
    .catch((error) => {
      for (const line of diagnostics(action, error)) console.error(line);
      console.log('RECIPIENT_SETUP_CONTROL_FAILED');
      process.exitCode = 1;
    });
}
