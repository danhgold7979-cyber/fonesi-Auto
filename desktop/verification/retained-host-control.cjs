'use strict';
// Verification-only SOURCE retained VERSION campaign; one launcher and no server/device commands.
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
  'verification/recipient-setup-contract.cjs',
  'verification/package-launch-observer.cjs',
  'verification/retained-host-control.cjs',
  'verification/main-runtime-version-contract.cjs',
  'verification/main-runtime-version-probe.cjs',
  'verification/main-runtime-version-evidence.cjs',
  'verification/main-runtime-version-package.cjs',
  'verification/validate_package_runtime_version.py',
  'verification/validate_package.py',
  'verification/validate_ui.py',
  'verification/package-build-entry.mjs',
  'verification/validate_main_runtime_version.py',
  'verification/retained-host-main-probe.cjs',
  'verification/retained-pipe-startup.cjs',
  'verification/RetainedPipeEntry.ps1',
  'verification/platform-tools-candidate.json',
  'verification/fleet-ui-schema4.cjs',
  'verification/fleet-ui-contract.cjs',
  'verification/retained-host-contract.cjs',
  'verification/persistence-launch-init-probe.cjs',
  'verification/persistence-launch-e2e-control.cjs',
  'verification/persistence-restore-contract.cjs',
  'verification/package-owned-files.cjs',
  'verification/package-contract.cjs',
  'verification/Invoke-RetainedHostCheck.ps1',
  'verification/validate_retained_host.py',
  'verification/validate_settings.py',
  'verification/validate_runtime.py',
  'verification/validate_persistence.py',
  'verification/WindowsBoundary.psm1',
  'verification/OwnedFiles.psm1',
]);
function fail(code = 'RETAINED_HOST_CONTROL_REJECTED') {
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
    path.basename(path.dirname(root)) !== '.retained-host-runtime' ||
    path.basename(root) !== 'r'
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
function transform(source, desktop, main = false, observerDesktop = desktop) {
  if (hash(source) !== ORIGINAL_SHA) fail('RETAINED_HOST_SOURCE_CHANGED');
  const replacements = [
    [
      "$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))",
      `$desktop='${desktop.replaceAll("'", "''")}'`,
    ],
    ['$launchTools=$PSScriptRoot', "$launchTools=Join-Path $desktop 'launch'"],
    [
      "Join-Path $launchTools 'persistence-initialize.cjs'",
      main === 'PACKAGE_VERSION'
        ? `'${path.join(observerDesktop, 'verification/persistence-launch-init-probe.cjs').replaceAll("'", "''")}'`
        : "Join-Path $desktop 'verification/persistence-launch-init-probe.cjs'",
    ],
    [
      "Join-Path $desktop 'build/main.cjs'",
      main === 'PACKAGE_VERSION'
        ? `'${path.join(observerDesktop, 'verification/main-runtime-version-probe.cjs').replaceAll("'", "''")}'`
        : main
          ? "Join-Path $desktop 'verification/main-runtime-version-probe.cjs'"
          : "Join-Path $desktop 'verification/retained-host-main-probe.cjs'",
    ],
  ];
  let derived = source;
  for (const [from, to] of replacements) {
    if (derived.split(from).length !== 2) fail('RETAINED_HOST_TRANSFORM');
    derived = derived.replace(from, to);
  }
  return derived;
}
async function binding(root, main = false) {
  owned(root);
  const desktop = path.resolve(__dirname, '..');
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(desktop)) fail('RETAINED_HOST_BUILD');
  const packaged =
    main === 'PACKAGE_VERSION'
      ? require('./main-runtime-version-package.cjs').admitPackage(root)
      : null;
  const appRoot = packaged ? packaged.appRoot : desktop;
  const wrapper = read(
      path.join(appRoot, packaged ? 'launch/Invoke-Package.ps1' : 'launch/Invoke-Desktop.ps1'),
    ),
    original = read(path.join(appRoot, 'launch/launch-core.ps1'));
  if (
    packaged
      ? !wrapper.includes("-EntryMode 'PACKAGE'")
      : hash(wrapper) !== WRAPPER_SHA || !wrapper.includes("-EntryMode 'SOURCE'")
  )
    fail('RETAINED_HOST_SOURCE_CHANGED');
  if (typeof main !== 'boolean' && main !== 'PACKAGE_VERSION') fail();
  const derived = transform(original, appRoot, main, desktop);
  const originalMain = binary(path.join(appRoot, 'build/main.cjs'), 8388608);
  const { deriveMain } = main
    ? require('./main-runtime-version-contract.cjs')
    : require('./retained-host-contract.cjs');
  const derivedMain = deriveMain(
    new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(originalMain),
    path.join(
      desktop,
      main
        ? 'verification/main-runtime-version-probe.cjs'
        : 'verification/retained-host-main-probe.cjs',
    ),
  );
  if (typeof derivedMain !== 'string' || Buffer.byteLength(derivedMain) > 8388608)
    fail('RETAINED_HOST_TRANSFORM');
  const proof = {
    version: main ? 2 : 1,
    ...(main ? { mode: packaged ? 'PACKAGE_VERSION' : 'MAIN_VERSION' } : {}),
    ...(packaged
      ? { packageBindingSha256: hash(read(path.join(root, 'package-binding.json'))) }
      : {}),
    wrapperSha: hash(wrapper),
    originalSha: hash(original),
    derivedSha: hash(derived),
    substitutions: 4,
    originalMainSha256: hash(originalMain),
    derivedMainSha256: hash(derivedMain),
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
  const before = fs.lstatSync(file);
  const valid = (s) =>
    s.isFile() &&
    !s.isSymbolicLink() &&
    s.nlink === 1 &&
    Number.isSafeInteger(s.size) &&
    s.size >= 0 &&
    s.size <= limit;
  const same = (a, b) =>
    ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every((k) => a[k] === b[k]);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 0 ||
    limit > 134217728 ||
    !valid(before) ||
    fs.realpathSync.native(file) !== file
  )
    fail('RETAINED_HOST_ARCHIVE');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!valid(opened) || !same(before, opened)) fail('RETAINED_HOST_ARCHIVE');
    const bytes = Buffer.alloc(opened.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = fs.readSync(fd, bytes, used, bytes.length - used, null);
      if (count === 0) break;
      used += count;
    }
    const after = fs.fstatSync(fd),
      current = fs.lstatSync(file);
    if (
      used !== opened.size ||
      !valid(after) ||
      !valid(current) ||
      !same(opened, after) ||
      !same(after, current) ||
      fs.realpathSync.native(file) !== file
    )
      fail('RETAINED_HOST_ARCHIVE');
    return bytes.subarray(0, used);
  } finally {
    fs.closeSync(fd);
  }
}
function exclusiveBytes(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (!binary(file, bytes.length).equals(bytes)) fail('RETAINED_HOST_ARCHIVE');
}
function archiveInputs(root, source) {
  const bytes = binary(source, PIN.bytes);
  if (bytes.length !== PIN.bytes || hash(bytes) !== PIN.sha256) fail('RETAINED_HOST_ARCHIVE');
  exclusiveBytes(path.join(root, 'official.zip'), bytes);
  write(path.join(root, 'archives.json'), {
    version: 1,
    source,
    bytes: PIN.bytes,
    sha256: PIN.sha256,
  });
}
function verifyArchives(root) {
  const receipt = json(path.join(root, 'archives.json'));
  if (
    JSON.stringify(Object.keys(receipt)) !==
      JSON.stringify(['version', 'source', 'bytes', 'sha256']) ||
    receipt.version !== 1 ||
    receipt.bytes !== PIN.bytes ||
    receipt.sha256 !== PIN.sha256 ||
    typeof receipt.source !== 'string'
  )
    fail('RETAINED_HOST_ARCHIVE');
  const source = binary(receipt.source, PIN.bytes),
    official = binary(path.join(root, 'official.zip'), PIN.bytes);
  if (source.length !== PIN.bytes || hash(source) !== PIN.sha256 || !source.equals(official))
    fail('RETAINED_HOST_ARCHIVE');
  return true;
}
function materialize(root, b) {
  fs.mkdirSync(path.join(root, 'first-use'));
  rawWrite(
    path.join(
      root,
      b.proof.mode === 'PACKAGE_VERSION'
        ? 'Invoke-Package.instrumented.ps1'
        : 'Invoke-Desktop.instrumented.ps1',
    ),
    b.wrapper,
  );
  rawWrite(path.join(root, 'launch-core.ps1'), b.derived);
  write(path.join(root, 'copy.json'), b.proof);
}
async function prepare(root, archive, main = false, sourceHead, sourceTree) {
  if (main === 'PACKAGE_VERSION')
    require('./main-runtime-version-package.cjs').prepareBinding(root, sourceHead, sourceTree);
  const b = await binding(root, main);
  archiveInputs(root, archive);
  if (main)
    write(
      path.join(root, 'historical-managed.json'),
      require('./main-runtime-version-evidence.cjs').historical(
        path.resolve(__dirname, '..'),
        binary,
      ),
    );
  materialize(root, b);
}
async function verifyCopy(root, main = false) {
  const b = await binding(root, main);
  if (
    read(
      path.join(
        root,
        main === 'PACKAGE_VERSION'
          ? 'Invoke-Package.instrumented.ps1'
          : 'Invoke-Desktop.instrumented.ps1',
      ),
    ) !== b.wrapper ||
    read(path.join(root, 'launch-core.ps1')) !== b.derived ||
    JSON.stringify(json(path.join(root, 'copy.json'))) !== JSON.stringify(b.proof)
  )
    fail('RETAINED_HOST_COPY');
  if (
    main &&
    JSON.stringify(json(path.join(root, 'historical-managed.json'))) !==
      JSON.stringify(
        require('./main-runtime-version-evidence.cjs').historical(
          path.resolve(__dirname, '..'),
          binary,
        ),
      )
  )
    fail('MAIN_VERSION_HISTORY');
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
  'RETAINED_HOST_FAILED',
  'MAIN_RUNTIME_VERSION_FAILED',
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
    fail('RETAINED_HOST_RETIREMENT');
  if (
    ![lines.join('\n') + '\n', '\n' + lines.join('\n') + '\n'].includes(
      v.stdout.replace(/\r\n/g, '\n'),
    ) ||
    v.stderr
      .split(/\r?\n/)
      .some((s) =>
        [
          'PERSISTENCE_LAUNCH_PROBE_FAILED',
          'RETAINED_HOST_FAILED',
          'MAIN_RUNTIME_VERSION_FAILED',
          'BOOTSTRAP_FAILED',
          'BOOTSTRAP_CLEANUP_FAILED',
          'PERSISTENCE_SHUTDOWN_FAILED',
        ].includes(s),
      )
  )
    fail('RETAINED_HOST_CAPTURE');
  return v;
}
function state(root, completed = true, main = false) {
  owned(root);
  const children = entries(path.join(root, 'first-use'), 2);
  if (
    children.length !== 1 ||
    !children[0].stat.isDirectory() ||
    !children[0].name.startsWith('Fonesi-Auto-') ||
    !uuid(children[0].name.slice(12))
  )
    fail('RETAINED_HOST_OWNER');
  const managed = children[0].file,
    token = read(path.join(managed, '.owner')),
    pointer = json(path.join(managed, '.launcher-current.json'));
  if (!uuid(token) || !uuid(pointer.launchId)) fail('RETAINED_HOST_OWNER');
  const launches = entries(managed, 9).filter((e) => e.name.startsWith('launch-'));
  if (
    launches.length !== 1 ||
    launches.some((e) => !e.stat.isDirectory() || !uuid(e.name.slice(7)))
  )
    fail('RETAINED_HOST_OWNER');
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
    header.entryMode !== (main === 'PACKAGE_VERSION' ? 'PACKAGE' : 'SOURCE') ||
    header.dataRoot !== path.join(managed, 'data-main') ||
    header.parentToken !== token
  )
    fail('RETAINED_HOST_JOURNAL');
  return { managed, launch, header, chain, launches };
}
function observerMarkers(raw, main = false) {
  if (main) {
    if (typeof raw !== 'string' || raw.length > 32768) return [];
    const { PHASES, REASONS } = require('./main-runtime-version-contract.cjs'),
      lines = raw.split(/\r?\n/),
      out = [];
    for (const [prefix, values] of [
      ['MAIN_RUNTIME_VERSION_PHASE_', PHASES],
      ['MAIN_RUNTIME_VERSION_REASON_', REASONS],
    ]) {
      const matches = lines.filter((line) => values.some((value) => line === prefix + value));
      if (matches.length !== 1) return [];
      out.push(matches[0]);
    }
    return lines.filter((line) => line === 'MAIN_RUNTIME_VERSION_FAILED').length === 1
      ? [...out, 'MAIN_RUNTIME_VERSION_FAILED']
      : [];
  }
  if (typeof raw !== 'string' || raw.length > 32768) return [];
  const { PHASES, DIAGNOSTICS, diagnosticValue } = require('./retained-host-contract.cjs');
  const lines = raw.split(/\r?\n/),
    matched = lines.filter((line) =>
      PHASES.some((phase) => line === 'RETAINED_HOST_PHASE_' + phase),
    );
  const failed =
    matched.length === 1 && lines.filter((line) => line === 'RETAINED_HOST_FAILED').length === 1;
  if (!failed) {
    if (matched.length !== 0 || lines.includes('RETAINED_HOST_FAILED')) return [];
    const pairs = Object.entries(DIAGNOSTICS).filter(([slot]) => slot.startsWith('PIPE_'));
    if (!pairs.length) return [];
    const out = [];
    for (const [slot, values] of pairs) {
      const found = lines.filter((line) =>
        values.some((value) => line === 'RETAINED_HOST_DIAGNOSTIC_' + slot + '_' + value),
      );
      if (found.length !== 1) return [];
      out.push(found[0]);
    }
    return out;
  }
  const out = [matched[0], 'RETAINED_HOST_FAILED'];
  for (const slot of Object.keys(DIAGNOSTICS)) {
    const prefix = 'RETAINED_HOST_DIAGNOSTIC_' + slot + '_';
    const observed = lines.filter(
      (line) => line.startsWith(prefix) && diagnosticValue(slot, line.slice(prefix.length)),
    );
    if (observed.length === 1) out.push(observed[0]);
  }
  return out;
}
async function diagnose(root, main = false) {
  await verifyCopy(root, main);
  const outer = parseCapture(read(path.join(root, 'launcher-capture.json')));
  const retired = (p) =>
    ['SUCCESS', 'NONZERO_EXIT', 'EMPTY_OUTPUT'].includes(p.status) &&
    p.cleanupComplete &&
    !p.stdoutTruncated &&
    !p.stderrTruncated;
  if (!retired(outer.process)) fail('RETAINED_HOST_RETIREMENT');
  const s = state(root, false, main),
    matches = s.chain.settlements.filter((x) => x.stage === 'MAIN');
  if (matches.length !== 1 || !retired(matches[0])) return [];
  const latest = matches[0];
  const raw = read(path.join(s.launch, `capture-${String(latest.sequence).padStart(2, '0')}.json`));
  if (hash(raw) !== latest.captureSha256) fail('RETAINED_HOST_JOURNAL');
  return observerMarkers(parseCapture(raw).stderr, main);
}
function released(s) {
  try {
    fs.lstatSync(path.join(s.header.dataRoot, '.writer-lock'));
    fail('RETAINED_HOST_LEASE');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (
    read(path.join(s.header.dataRoot, `.released-${s.header.ownerToken}.json`)) !==
    JSON.stringify({ version: 1, storeId: s.header.storeId, ownerToken: s.header.ownerToken })
  )
    fail('RETAINED_HOST_LEASE');
}
const { inspectDatabase, provisionPlan, otherDataPlan } = require('./recipient-setup-control.cjs');
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
    fail('RETAINED_HOST_SCHEMA');
  return true;
}
function hostReceipt(s) {
  // journal.inspect has validated receipt/READY bindings. Require opt-in presence and no helper residue.
  const receipt = json(path.join(s.launch, 'host-parent.json'));
  if (
    receipt.launchId !== s.header.launchId ||
    receipt.storeId !== s.header.storeId ||
    receipt.ownerToken !== s.header.ownerToken ||
    receipt.parentImageSha256 !== s.header.executableSha256 ||
    entries(s.launch).some((e) => e.name === '.host-session' || e.name.startsWith('host-session'))
  )
    fail('RETAINED_HOST_PARENT');
  return receipt;
}
function stageCapture(s, stage, lines) {
  const matches = s.chain.settlements.filter((x) => x.stage === stage);
  if (matches.length !== 1) fail('RETAINED_HOST_JOURNAL');
  const settlement = matches[0],
    raw = read(path.join(s.launch, stage.toLowerCase() + '-capture.json'));
  if (hash(raw) !== settlement.captureSha256) fail('RETAINED_HOST_JOURNAL');
  return capture(path.join(s.launch, stage.toLowerCase() + '-capture.json'), lines, stage);
}
async function inspect(root, main = false) {
  await verifyCopy(root, main);
  verifyArchives(root);
  assertSchema4Observed(json(path.join(root, 'schema4-observed.json')));
  capture(path.join(root, 'launcher-capture.json'), ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER');
  const s = state(root, true, main),
    { launch, header } = s;
  hostReceipt(s);
  const auth = json(path.join(launch, 'auth-observed.json'));
  stageCapture(s, 'AUTH', ['PERSISTENCE_INITIALIZE_ORDERLY']);
  stageCapture(s, 'MAIN', ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED']);
  if (auth.status !== 'AUTHENTICATED' || !auth.witness) fail('RETAINED_HOST_AUTH');
  {
    const provision = json(path.join(launch, 'provision-observed.json'));
    stageCapture(s, 'PROVISION', ['PERSISTENCE_INITIALIZE_ORDERLY']);
    if (
      provision.status !== 'PROVISIONED' ||
      JSON.stringify(provision.witness) !== JSON.stringify(auth.witness)
    )
      fail('RETAINED_HOST_AUTH');
  }
  for (const stage of ['provision', 'auth']) {
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
      fail('RETAINED_HOST_DIALOG');
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
    fail('RETAINED_HOST_AUTH');
  if (main === 'PACKAGE_VERSION')
    require('./fleet-ui-schema4.cjs').inspectSchema4(
      header.dataRoot,
      header.storeId,
      undefined,
      require('./main-runtime-version-package.cjs').admitPackage(root),
    );
  else inspectDatabase(header.dataRoot, header.storeId, false);
  const ui = json(witnessPath(launch, 'ui'));
  if (
    JSON.stringify(ui) !==
    JSON.stringify({ version: 1, ready: true, quitRequested: true, closed: true })
  )
    fail('RETAINED_HOST_MAIN');
  if (main) {
    const contract = require('./main-runtime-version-contract.cjs'),
      observed = json(path.join(root, 'main-runtime-version-observed.json'));
    if (!contract.validateObserved(observed, main === 'PACKAGE_VERSION').passed)
      fail('MAIN_VERSION_AUDIT');
    const audit = await require('./main-runtime-version-evidence.cjs').audit(
      path.join(s.managed, 'logs-main'),
      json(path.join(root, 'main-runtime-version-binding.json')),
      binary,
      header.ownerToken,
      main === 'PACKAGE_VERSION'
        ? require('./main-runtime-version-package.cjs').admitPackage(root)
        : undefined,
    );
    const final = { ...observed, cases: { ...observed.cases, ...audit } };
    if (!contract.validateResult(final, main === 'PACKAGE_VERSION').passed)
      fail('MAIN_VERSION_AUDIT');
    write(path.join(root, 'main-runtime-version-result.json'), final);
  } else {
    const { validateResult } = require('./retained-host-contract.cjs');
    if (!validateResult(json(path.join(root, 'retained-host-result.json'))).passed)
      fail('RETAINED_HOST_RESULT');
  }
  write(path.join(root, 'bootstrap.json'), {
    version: 1,
    cases: Object.fromEntries(BOOTSTRAP.map((k) => [k, true])),
  });
  const packageFacts = main === 'PACKAGE_VERSION' ? packagePublic(root) : null;
  write(path.join(root, 'integrity.json'), {
    version: 1,
    originalArchiveUnchanged: true,
    originalSourceUnchanged: true,
    ...(packageFacts ? { originalPackageUnchanged: true, package: packageFacts } : {}),
  });
  return s;
}
// Read-only, non-authoritative snapshots after an exact outer TIMEOUT cleanup report.
const TIMEOUT_FIELDS = Object.freeze({
  DIRECTORY: Object.freeze(['ABSENT', 'VALID', 'INVALID']),
  SCRIPT: Object.freeze(['ABSENT', 'MATCH', 'INVALID']),
  ENTRY: Object.freeze(['ABSENT', 'MATCH', 'INVALID']),
  PROFILE: Object.freeze(['ABSENT', 'EMPTY', 'NONEMPTY', 'INVALID']),
  CHAIN: Object.freeze(['ABSENT', 'COMPLETE', 'PARTIAL', 'INVALID', 'NOT_APPLICABLE']),
});
const TIMEOUT_VECTOR = Object.freeze(
  Object.fromEntries(
    require('./retained-pipe-startup.cjs').CASES.flatMap((c) =>
      Object.entries(TIMEOUT_FIELDS).map(([field, values]) => [
        c.mode.toUpperCase() + '_' + field,
        values,
      ]),
    ),
  ),
);
function timeoutSnapshot(root) {
  const owner = owned(root),
    outer = parseCapture(read(path.join(root, 'launcher-capture.json'))),
    p = outer.process;
  if (
    p.status !== 'TIMEOUT' ||
    p.exitCode !== null ||
    p.cleanupComplete !== true ||
    p.stdoutTruncated !== false ||
    p.stderrTruncated !== false
  )
    fail('RETAINED_HOST_RETIREMENT');
  const { CASES, ENTRY, BOOTSTRAP, materializeScript } = require('./retained-pipe-startup.cjs');
  const result = {};
  function present(file) {
    try {
      fs.lstatSync(file);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }
  function directory(dir, allowed) {
    plain(dir);
    const list = entries(dir, allowed.length);
    if (
      list.some(
        (e) =>
          !allowed.includes(e.name) ||
          (e.stat.isFile() && (e.stat.nlink !== 1 || e.stat.size > 16384)),
      ) ||
      !binary(path.join(dir, '.owner'), 36).equals(Buffer.from(owner, 'ascii'))
    )
      fail('RETAINED_HOST_OWNER');
    return list;
  }
  function match(file, expected, limit) {
    return !present(file)
      ? 'ABSENT'
      : binary(file, limit).equals(Buffer.from(expected))
        ? 'MATCH'
        : 'INVALID';
  }
  function profile(dir) {
    if (!present(dir)) return 'ABSENT';
    plain(dir);
    const plan = tree(dir, 8388608);
    if (plan.entries.some((e) => e.stat.isFile() && e.stat.nlink !== 1))
      fail('RETAINED_HOST_OWNER');
    return plan.entries.length ? 'NONEMPTY' : 'EMPTY';
  }
  for (const c of CASES) {
    const prefix = c.mode.toUpperCase() + '_',
      dir = path.join(root, c.directory);
    const values = {
      DIRECTORY: 'ABSENT',
      SCRIPT: 'ABSENT',
      ENTRY: 'ABSENT',
      PROFILE: 'ABSENT',
      CHAIN: c.deep ? 'ABSENT' : 'NOT_APPLICABLE',
    };
    try {
      values.DIRECTORY = 'INVALID';
      const exists = present(dir);
      if (!exists) values.DIRECTORY = 'ABSENT';
      if (exists) {
        values.DIRECTORY = 'INVALID';
        const list = directory(dir, [
          '.owner',
          'fixture.ps1',
          'entry.txt',
          ...(!c.deep ? ['profile'] : []),
          ...(c.mode === 'plainShort' ? ['bootstrap.json'] : []),
        ]);
        if (list.some((e) => (e.name === 'profile' ? !e.stat.isDirectory() : !e.stat.isFile())))
          fail('RETAINED_HOST_OWNER');
        if (
          c.mode === 'plainShort' &&
          present(path.join(dir, 'bootstrap.json')) &&
          match(path.join(dir, 'bootstrap.json'), BOOTSTRAP, 512) !== 'MATCH'
        )
          fail('RETAINED_HOST_OWNER');
        values.DIRECTORY = 'VALID';
        try {
          values.SCRIPT = match(
            path.join(dir, 'fixture.ps1'),
            materializeScript(c.parameters),
            16384,
          );
        } catch {
          values.SCRIPT = 'INVALID';
        }
        try {
          values.ENTRY = match(path.join(dir, 'entry.txt'), ENTRY, 128);
        } catch {
          values.ENTRY = 'INVALID';
        }
      }
      if (c.deep) {
        const names = [c.deep, 'Fonesi-Auto-' + owner, 'launch-' + owner, 'host-session-' + owner];
        let cursor = root;
        for (let index = 0; index < names.length; index++) {
          cursor = path.join(cursor, names[index]);
          if (!present(cursor)) {
            values.CHAIN = index === 0 ? 'ABSENT' : 'PARTIAL';
            break;
          }
          values.CHAIN = 'INVALID';
          const child = index === names.length - 1 ? 'profile' : names[index + 1];
          const list = directory(cursor, ['.owner', child]);
          if (list.some((e) => e.name === child && !e.stat.isDirectory()))
            fail('RETAINED_HOST_OWNER');
          values.CHAIN = 'PARTIAL';
          if (index === names.length - 1) {
            values.CHAIN = 'COMPLETE';
            try {
              values.PROFILE = profile(path.join(cursor, 'profile'));
            } catch {
              values.PROFILE = 'INVALID';
            }
          }
        }
      } else if (values.DIRECTORY === 'VALID') {
        try {
          values.PROFILE = profile(path.join(dir, 'profile'));
        } catch {
          values.PROFILE = 'INVALID';
        }
      }
    } catch {
      if (values.DIRECTORY === 'INVALID') {
        values.SCRIPT = 'INVALID';
        values.ENTRY = 'INVALID';
        values.PROFILE = 'INVALID';
        if (c.deep) values.CHAIN = 'INVALID';
      } else if (c.deep) {
        values.CHAIN = 'INVALID';
        values.PROFILE = 'INVALID';
      }
    }
    for (const [field, value] of Object.entries(values)) result[prefix + field] = value;
  }
  if (owned(root) !== owner) fail('RETAINED_HOST_OWNER');
  return Object.freeze(result);
}
async function diagnoseTimeout(root, main = false) {
  await verifyCopy(root, main);
  return Object.entries(timeoutSnapshot(root)).map(
    ([slot, value]) => 'RETAINED_HOST_TIMEOUT_' + slot + '_' + value,
  );
}
function pipeStartupPlans(root, owner) {
  const { CASES, ENTRY, BOOTSTRAP, materializeScript } = require('./retained-pipe-startup.cjs');
  const plans = [];
  function inspect(directory, allowed, required) {
    plain(directory);
    const list = entries(directory, allowed.length);
    if (
      list.some((e) => !allowed.includes(e.name)) ||
      required.some((n) => !list.some((e) => e.name === n)) ||
      read(path.join(directory, '.owner')) !== owner
    )
      fail('RETAINED_HOST_OWNER');
    for (const e of list)
      if (e.stat.isFile() && (e.stat.nlink !== 1 || e.stat.size > 16384))
        fail('RETAINED_HOST_LIMIT');
    return list;
  }
  for (const c of CASES) {
    const directory = path.join(root, c.directory);
    const expected = [
      '.owner',
      'fixture.ps1',
      ...(!c.deep ? ['profile'] : []),
      ...(c.mode === 'plainShort' ? ['bootstrap.json'] : []),
    ];
    const list = inspect(directory, [...expected, 'entry.txt'], expected);
    for (const e of list) {
      if (e.name === 'profile') {
        if (!e.stat.isDirectory() || entries(e.file, 1).length) fail('RETAINED_HOST_INVENTORY');
      } else if (!e.stat.isFile()) fail('RETAINED_HOST_OWNER');
    }
    if (
      !Buffer.from(read(path.join(directory, 'fixture.ps1'))).equals(
        materializeScript(c.parameters),
      ) ||
      (c.mode === 'plainShort' && read(path.join(directory, 'bootstrap.json')) !== BOOTSTRAP) ||
      (list.some((e) => e.name === 'entry.txt') &&
        read(path.join(directory, 'entry.txt')) !== ENTRY)
    )
      fail('RETAINED_HOST_OWNER');
    plans.push({ directory, entries: list, markerLast: true });
    if (c.deep) {
      const names = [c.deep, 'Fonesi-Auto-' + owner, 'launch-' + owner, 'host-session-' + owner];
      const branch = [];
      let parent = root;
      for (let i = 0; i < names.length; i++) {
        const dir = path.join(parent, names[i]);
        const child = i === names.length - 1 ? 'profile' : names[i + 1];
        const all = inspect(dir, ['.owner', child], ['.owner', child]);
        const sub = all.find((e) => e.name === child);
        if (!sub.stat.isDirectory() || (child === 'profile' && entries(sub.file, 1).length))
          fail('RETAINED_HOST_INVENTORY');
        branch.push({
          directory: dir,
          entries: all.filter((e) => e.name === '.owner' || child === 'profile'),
          markerLast: true,
        });
        parent = dir;
      }
      plans.push(...branch.reverse());
    }
  }
  return plans;
}
function packagePublic(root) {
  const p = require('./main-runtime-version-package.cjs').admitPackage(root);
  return {
    sourceHead: p.sourceHead,
    sourceTree: p.sourceTree,
    zipSha256: p.zipSha256,
    zipBytes: p.zipBytes,
    manifestSha256: p.manifestSha256,
  };
}
function packagePlan(root) {
  const p = require('./main-runtime-version-package.cjs').admitPackage(root);
  const inventory = require('../launch/package-admission.cjs').inventory(p.packageRoot);
  const names = [...inventory.files.map((e) => e.path), ...inventory.directories];
  if (names.length > 1024) fail('RETAINED_HOST_LIMIT');
  return {
    directory: p.packageRoot,
    entries: names.map((name) => {
      const file = path.join(p.packageRoot, name);
      return { name, file, stat: fs.lstatSync(file) };
    }),
  };
}
async function cleanup(root, main = false) {
  await verifyCopy(root, main);
  verifyArchives(root);
  const token = owned(root),
    s = state(root, true, main);
  capture(path.join(root, 'launcher-capture.json'), ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER');
  const publicResult = json(path.join(root, 'public.json'));
  const { validateResult } = main
    ? require('./main-runtime-version-contract.cjs')
    : require('./retained-host-contract.cjs');
  const raw = json(
    path.join(root, main ? 'main-runtime-version-result.json' : 'retained-host-result.json'),
  );
  if (main) {
    if (
      publicResult.historicalManagedEvidence !==
      require('./main-runtime-version-evidence.cjs').LABEL
    )
      fail('MAIN_VERSION_HISTORY');
    const observed = json(path.join(root, 'main-runtime-version-observed.json'));
    if (
      !require('./main-runtime-version-contract.cjs').validateObserved(
        observed,
        main === 'PACKAGE_VERSION',
      ).passed
    )
      fail('MAIN_VERSION_AUDIT');
    const audit = await require('./main-runtime-version-evidence.cjs').audit(
      path.join(s.managed, 'logs-main'),
      json(path.join(root, 'main-runtime-version-binding.json')),
      binary,
      s.header.ownerToken,
      main === 'PACKAGE_VERSION'
        ? require('./main-runtime-version-package.cjs').admitPackage(root)
        : undefined,
    );
    if (
      JSON.stringify(raw) !==
      JSON.stringify({ ...observed, cases: { ...observed.cases, ...audit } })
    )
      fail('MAIN_VERSION_AUDIT');
  }
  if (
    publicResult.failure !== null ||
    !validateResult(raw, main === 'PACKAGE_VERSION').passed ||
    JSON.stringify(raw) !== JSON.stringify(publicResult.observation)
  )
    fail('RETAINED_HOST_RESULT');
  const bootstrap = json(path.join(root, 'bootstrap.json'));
  if (
    JSON.stringify(bootstrap) !==
      JSON.stringify({ version: 1, cases: Object.fromEntries(BOOTSTRAP.map((k) => [k, true])) }) ||
    JSON.stringify(bootstrap) !== JSON.stringify(publicResult.bootstrap) ||
    publicResult.originalArchiveUnchanged !== true ||
    publicResult.originalSourceUnchanged !== true ||
    publicResult.directoryCleanup !== false ||
    JSON.stringify(publicResult.process) !==
      JSON.stringify(
        capture(path.join(root, 'launcher-capture.json'), ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER')
          .process,
      )
  )
    fail('RETAINED_HOST_RESULT');
  if (
    read(path.join(root, 'integrity.json')) !==
    JSON.stringify({
      version: 1,
      originalArchiveUnchanged: true,
      originalSourceUnchanged: true,
      ...(main === 'PACKAGE_VERSION'
        ? { originalPackageUnchanged: true, package: packagePublic(root) }
        : {}),
    })
  )
    fail('RETAINED_HOST_RESULT');
  hostReceipt(s);
  released(s);
  if (
    main === 'PACKAGE_VERSION' &&
    (publicResult.originalPackageUnchanged !== true ||
      JSON.stringify(publicResult.package) !== JSON.stringify(packagePublic(root)))
  )
    fail('RETAINED_HOST_RESULT');
  const plans = [],
    files = [];
  if (main === 'PACKAGE_VERSION') plans.push(packagePlan(root));
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
    fail('RETAINED_HOST_INVENTORY');
  const marker = json(path.join(s.header.dataRoot, '.persistence-owner.json'));
  if (
    JSON.stringify(marker) !==
    JSON.stringify({ version: 1, storeId: s.header.storeId, kind: 'FRESH', restoreReceiptId: null })
  )
    fail('RETAINED_HOST_OWNER');
  const guard = fs.lstatSync(path.join(s.managed, '.launcher-guard'));
  if (!guard.isFile() || guard.isSymbolicLink() || guard.size !== 0 || guard.nlink !== 1)
    fail('RETAINED_HOST_OWNER');
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
        fail('RETAINED_HOST_OWNER');
      add(item.file, 8388608);
    } else if (item.name === 'verification-backup-parent') {
      const config = json(path.join(s.header.dataRoot, 'backup-locations.json'));
      if (
        config.version !== 1 ||
        config.storeId !== s.header.storeId ||
        !Array.isArray(config.locations) ||
        config.locations.length !== 1
      )
        fail('RETAINED_HOST_OWNER');
      const location = config.locations[0];
      if (
        !uuid(location.locationId) ||
        !uuid(location.folderMarkerId) ||
        config.activeLocationId !== location.locationId ||
        location.state !== 'ACTIVE' ||
        location.absolutePath !== path.join(item.file, 'backup-' + location.folderMarkerId)
      )
        fail('RETAINED_HOST_OWNER');
      const children = entries(item.file, 2);
      if (
        children.length !== 1 ||
        children[0].file !== location.absolutePath ||
        !children[0].stat.isDirectory()
      )
        fail('RETAINED_HOST_OWNER');
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
        fail('RETAINED_HOST_OWNER');
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
            fail('RETAINED_HOST_OWNER');
          add(e.file, 8388608);
        } else {
          if (e.stat.size > 65536) fail('RETAINED_HOST_LIMIT');
          total += e.stat.size;
          metadata.push(e);
        }
      }
      if (total > 1048576) fail('RETAINED_HOST_LIMIT');
      plans.push({ directory: item.file, entries: metadata });
    } else files.push(item);
  }
  const expected = [
    '.owner',
    'first-use',
    main === 'PACKAGE_VERSION'
      ? 'Invoke-Package.instrumented.ps1'
      : 'Invoke-Desktop.instrumented.ps1',
    ...(main === 'PACKAGE_VERSION' ? ['package-binding.json', 'relocated-package'] : []),
    'launch-core.ps1',
    'copy.json',
    'archives.json',
    'official.zip',
    'launcher-capture.json',
    'bootstrap.json',
    ...(main
      ? [
          'main-runtime-version-observed.json',
          'main-runtime-version-binding.json',
          'main-runtime-version-result.json',
          'historical-managed.json',
        ]
      : ['retained-host-result.json']),
    'schema4-observed.json',
    'public.json',
    'integrity.json',
    ...['provision', 'auth', 'ui'].map((k) => path.basename(witnessPath(s.launch, k))),
  ];
  const rootEntries = entries(root, expected.length);
  if (rootEntries.length !== expected.length || rootEntries.some((e) => !expected.includes(e.name)))
    fail('RETAINED_HOST_INVENTORY');
  for (const e of rootEntries) {
    if (
      [
        'first-use',
        '.owner',
        ...(main === 'PACKAGE_VERSION' ? ['relocated-package'] : []),
      ].includes(e.name)
    )
      continue;
    if (
      !e.stat.isFile() ||
      e.stat.nlink !== 1 ||
      e.stat.size > (e.name === 'official.zip' ? PIN.bytes : 65536)
    )
      fail('RETAINED_HOST_LIMIT');
    files.push(e);
  }
  for (const plan of plans)
    for (const item of plan.entries) {
      if (item.stat.isFile() && item.stat.nlink !== 1) fail('RETAINED_HOST_OWNER');
    }
  for (const item of files) if (item.stat.nlink !== 1) fail('RETAINED_HOST_OWNER');
  await verifyCopy(root, main);
  verifyArchives(root);
  // Complete bounded inventory/identities before first deletion. Unknown partitions preserve all.
  if (read(path.join(root, '.owner')) !== token) fail('RETAINED_HOST_OWNER');
  for (const plan of plans) {
    for (const e of plan.entries.filter(
      (e) => e.stat.isFile() && !(plan.markerLast && e.name === '.owner'),
    ))
      fs.unlinkSync(e.file);
    for (const e of plan.entries
      .filter((e) => e.stat.isDirectory())
      .sort((a, b) => b.file.length - a.file.length))
      fs.rmdirSync(e.file);
    if (plan.markerLast) fs.unlinkSync(path.join(plan.directory, '.owner'));
    fs.rmdirSync(plan.directory);
  }
  for (const e of files) fs.unlinkSync(e.file);
  fs.rmdirSync(s.managed);
  fs.rmdirSync(path.join(root, 'first-use'));
}
const PHASES = Object.freeze([
  'PREPARE',
  'VERIFY_COPY',
  'INSPECT',
  'CLEANUP',
  'DIAGNOSE',
  'ARGUMENT',
]);
const REASONS = Object.freeze([
  'RETAINED_HOST_CONTROL_REJECTED',
  'RETAINED_HOST_SOURCE_CHANGED',
  'RETAINED_HOST_TRANSFORM',
  'RETAINED_HOST_BUILD',
  'RETAINED_HOST_COPY',
  'RETAINED_HOST_RETIREMENT',
  'RETAINED_HOST_CAPTURE',
  'RETAINED_HOST_OWNER',
  'RETAINED_HOST_PARENT',
  'RETAINED_HOST_JOURNAL',
  'RETAINED_HOST_AUTH',
  'RETAINED_HOST_DIALOG',
  'RETAINED_HOST_MAIN',
  'RETAINED_HOST_LEASE',
  'RETAINED_HOST_SCHEMA',
  'RETAINED_HOST_RESULT',
  'RETAINED_HOST_INVENTORY',
  'RETAINED_HOST_LIMIT',
  'RETAINED_HOST_ARCHIVE',
  'RECIPIENT_SETUP_SCHEMA',
  'RECIPIENT_SETUP_RESULT',
  'RECIPIENT_SETUP_OWNER',
  'RECIPIENT_SETUP_LIMIT',
  'FLEET_UI_SCHEMA4',
  'RECOVERY_REQUIRED',
  'MAIN_VERSION_AUDIT',
  'MAIN_VERSION_HISTORY',
  'MAIN_VERSION_PACKAGE',
  'PACKAGE_REJECTED',
  'MAIN_RUNTIME_SCHEMA',
  'MAIN_RUNTIME_MAIN',
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
  const phase =
    action === 'diagnose-timeout' ? 'DIAGNOSE' : String(action).toUpperCase().replaceAll('-', '_');
  return [
    'RETAINED_HOST_CONTROL_PHASE_' + (PHASES.includes(phase) ? phase : 'ARGUMENT'),
    'RETAINED_HOST_CONTROL_REASON_' + code,
    ...Object.entries(captureErrors.get(error) ?? {}).map(
      ([key, value]) => 'RETAINED_HOST_CAPTURE_' + key + '_' + value,
    ),
  ];
}
module.exports = {
  prepare,
  packagePublic,
  packagePlan,
  materialize,
  binding,
  hostReceipt,
  stageCapture,
  archiveInputs,
  binary,
  verifyArchives,
  inspectDatabase,
  assertSchema4Observed,
  otherDataPlan,
  provisionPlan,
  verifyCopy,
  inspect,
  cleanup,
  pipeStartupPlans,
  TIMEOUT_VECTOR,
  timeoutSnapshot,
  diagnoseTimeout,
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
  const [rawAction, root, archive, sourceHead, sourceTree] = process.argv.slice(2);
  const packageMode = [
    'prepare',
    'verify-copy',
    'inspect',
    'cleanup',
    'diagnose',
    'diagnose-timeout',
  ].some((a) => rawAction === a + '-package');
  const main = packageMode
    ? 'PACKAGE_VERSION'
    : [
        'prepare-main',
        'verify-copy-main',
        'inspect-main',
        'cleanup-main',
        'diagnose-main',
        'diagnose-timeout-main',
      ].includes(rawAction);
  const action = packageMode ? rawAction.slice(0, -8) : main ? rawAction.slice(0, -5) : rawAction;
  Promise.resolve()
    .then(async () => {
      if (process.argv.length !== (action === 'prepare' ? (packageMode ? 7 : 5) : 4)) fail();
      if (action === 'prepare') await prepare(root, archive, main, sourceHead, sourceTree);
      else if (action === 'verify-copy') await verifyCopy(root, main);
      else if (action === 'inspect') await inspect(root, main);
      else if (action === 'cleanup') await cleanup(root, main);
      else if (action === 'diagnose-timeout')
        for (const line of await diagnoseTimeout(root, main)) console.error(line);
      else if (action === 'diagnose')
        for (const line of await diagnose(root, main)) console.error(line);
      else fail();
      console.log('RETAINED_HOST_CONTROL_PASS');
    })
    .catch((error) => {
      for (const line of diagnostics(action, error)) console.error(line);
      console.log('RETAINED_HOST_CONTROL_FAILED');
      process.exitCode = 1;
    });
}
