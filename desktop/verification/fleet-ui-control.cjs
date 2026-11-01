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
  'schema3',
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
  'verification/fleet-ui-control.cjs',
  'verification/fleet-ui-main-probe.cjs',
  'verification/fleet-ui-contract.cjs',
  'verification/persistence-launch-init-probe.cjs',
  'verification/persistence-launch-e2e-control.cjs',
  'verification/persistence-restore-contract.cjs',
  'verification/package-owned-files.cjs',
  'verification/package-contract.cjs',
  'verification/Invoke-FleetUi.ps1',
  'verification/validate_fleet_ui.py',
  'verification/validate_settings.py',
  'verification/validate_runtime.py',
  'verification/validate_persistence.py',
  'verification/WindowsBoundary.psm1',
  'verification/OwnedFiles.psm1',
]);
function fail(code = 'FLEET_UI_CONTROL_REJECTED') {
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
    path.basename(path.dirname(root)) !== '.fleet-ui-runtime' ||
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
  if (hash(source) !== ORIGINAL_SHA) fail('FLEET_UI_SOURCE_CHANGED');
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
      "Join-Path $desktop 'verification/fleet-ui-main-probe.cjs'",
    ],
  ];
  let derived = source;
  for (const [from, to] of replacements) {
    if (derived.split(from).length !== 2) fail('FLEET_UI_TRANSFORM');
    derived = derived.replace(from, to);
  }
  return derived;
}
async function binding(root) {
  owned(root);
  const desktop = path.resolve(__dirname, '..');
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(desktop)) fail('FLEET_UI_BUILD');
  const wrapper = read(path.join(desktop, 'launch/Invoke-Desktop.ps1')),
    original = read(path.join(desktop, 'launch/launch-core.ps1'));
  if (hash(wrapper) !== WRAPPER_SHA || !wrapper.includes("-EntryMode 'SOURCE'"))
    fail('FLEET_UI_SOURCE_CHANGED');
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
async function prepare(root) {
  const b = await binding(root);
  fs.mkdirSync(path.join(root, 'first-use'));
  rawWrite(path.join(root, 'Invoke-Desktop.instrumented.ps1'), b.wrapper);
  rawWrite(path.join(root, 'launch-core.ps1'), b.derived);
  write(path.join(root, 'copy.json'), b.proof);
}
async function verifyCopy(root) {
  const b = await binding(root);
  if (
    read(path.join(root, 'Invoke-Desktop.instrumented.ps1')) !== b.wrapper ||
    read(path.join(root, 'launch-core.ps1')) !== b.derived ||
    JSON.stringify(json(path.join(root, 'copy.json'))) !== JSON.stringify(b.proof)
  )
    fail('FLEET_UI_COPY');
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
  'FLEET_UI_FAILED',
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
    fail('FLEET_UI_RETIREMENT');
  if (
    ![lines.join('\n') + '\n', '\n' + lines.join('\n') + '\n'].includes(
      v.stdout.replace(/\r\n/g, '\n'),
    ) ||
    v.stderr
      .split(/\r?\n/)
      .some((s) =>
        [
          'PERSISTENCE_LAUNCH_PROBE_FAILED',
          'FLEET_UI_FAILED',
          'BOOTSTRAP_FAILED',
          'BOOTSTRAP_CLEANUP_FAILED',
          'PERSISTENCE_SHUTDOWN_FAILED',
        ].includes(s),
      )
  )
    fail('FLEET_UI_CAPTURE');
  return v;
}
function state(root, completed = true) {
  owned(root);
  const first = path.join(root, 'first-use'),
    children = entries(first, 2);
  if (
    children.length !== 1 ||
    !children[0].stat.isDirectory() ||
    !children[0].name.startsWith('Fonesi-Auto-') ||
    !uuid(children[0].name.slice(12))
  )
    fail('FLEET_UI_OWNER');
  const managed = children[0].file,
    token = read(path.join(managed, '.owner'));
  if (!uuid(token)) fail('FLEET_UI_OWNER');
  const launches = entries(managed, 8).filter((e) => e.name.startsWith('launch-'));
  if (launches.length !== 1 || !launches[0].stat.isDirectory()) fail('FLEET_UI_OWNER');
  const launch = launches[0].file,
    chain = journal.inspect(managed, launch),
    header = chain.header;
  if (
    (completed &&
      (chain.pending ||
        chain.latest?.stage !== 'RELEASE' ||
        chain.latest.status !== 'SUCCESS' ||
        chain.latest.exitCode !== 0)) ||
    header.entryMode !== 'SOURCE' ||
    header.dataRoot !== path.join(managed, 'data-main') ||
    header.parentToken !== token
  )
    fail('FLEET_UI_JOURNAL');
  return { managed, launch, header, chain };
}
function observerMarkers(raw) {
  const phases = require('./fleet-ui-contract.cjs').PHASES;
  const lines = raw.split(/\r?\n/);
  const matched = lines.filter((line) =>
    phases.some((phase) => line === 'FLEET_UI_PHASE_' + phase),
  );
  return matched.length === 1 && lines.filter((line) => line === 'FLEET_UI_FAILED').length === 1
    ? [matched[0], 'FLEET_UI_FAILED']
    : [];
}
async function diagnose(root) {
  await verifyCopy(root);
  const outer = parseCapture(read(path.join(root, 'launcher-capture.json')));
  const retired = (p) =>
    ['SUCCESS', 'NONZERO_EXIT', 'EMPTY_OUTPUT'].includes(p.status) &&
    p.cleanupComplete &&
    !p.stdoutTruncated &&
    !p.stderrTruncated;
  if (!retired(outer.process)) fail('FLEET_UI_RETIREMENT');
  const s = state(root, false),
    latest = s.chain.latest;
  if (s.chain.pending || latest?.stage !== 'MAIN' || !retired(latest)) return [];
  const raw = read(path.join(s.launch, `capture-${String(latest.sequence).padStart(2, '0')}.json`));
  if (hash(raw) !== latest.captureSha256) fail('FLEET_UI_JOURNAL');
  return observerMarkers(parseCapture(raw).stderr);
}
async function inspect(root) {
  await verifyCopy(root);
  capture(path.join(root, 'launcher-capture.json'), ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER');
  const s = state(root),
    { launch, header } = s;
  const provision = json(path.join(launch, 'provision-observed.json')),
    auth = json(path.join(launch, 'auth-observed.json'));
  for (const stage of ['provision', 'auth'])
    capture(
      path.join(launch, stage + '-capture.json'),
      ['PERSISTENCE_INITIALIZE_ORDERLY'],
      stage.toUpperCase(),
    );
  capture(path.join(launch, 'main-capture.json'), ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED'], 'MAIN');
  if (
    provision.status !== 'PROVISIONED' ||
    auth.status !== 'AUTHENTICATED' ||
    !auth.witness ||
    JSON.stringify(provision.witness) !== JSON.stringify(auth.witness)
  )
    fail('FLEET_UI_AUTH');
  for (const stage of ['provision', 'auth']) {
    const d = json(witnessPath(launch, stage));
    if (
      d.version !== 1 ||
      d.stage !== stage ||
      d.opens !== (stage === 'provision' ? 1 : 0) ||
      d.confirms !== (stage === 'provision' ? 1 : 0)
    )
      fail('FLEET_UI_DIALOG');
  }
  if (
    read(witnessPath(launch, 'ui')) !==
    JSON.stringify({ version: 1, ready: true, quitRequested: true, closed: true })
  )
    fail('FLEET_UI_MAIN');
  const data = header.dataRoot;
  try {
    fs.lstatSync(path.join(data, '.writer-lock'));
    fail('FLEET_UI_LEASE');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (
    read(path.join(data, `.released-${header.ownerToken}.json`)) !==
    JSON.stringify({ version: 1, storeId: header.storeId, ownerToken: header.ownerToken })
  )
    fail('FLEET_UI_LEASE');
  if (
    read(path.join(data, 'key-durability-proof.json')) !==
    JSON.stringify({
      version: 2,
      ...auth.witness,
      state: 'ORDERLY_REOPEN_AUTHENTICATED',
      runtimeCertification: 'ELECTRON_45_1_0_WIN_X64_DPAPI_V1',
    })
  )
    fail('FLEET_UI_AUTH');
  const { FoundationDatabase } = require('../build/foundation-database.cjs');
  const db = new FoundationDatabase(path.join(data, 'active.sqlite'), header.storeId, true);
  try {
    db.validate();
    if (db.version !== 3) fail('FLEET_UI_SCHEMA');
    db.readSettings();
  } finally {
    db.close();
  }
  write(path.join(root, 'bootstrap.json'), {
    version: 1,
    cases: Object.fromEntries(BOOTSTRAP.map((k) => [k, true])),
  });
  return s;
}
async function cleanup(root) {
  await verifyCopy(root);
  const token = owned(root),
    s = state(root);
  capture(path.join(root, 'launcher-capture.json'), ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER');
  const publicResult = json(path.join(root, 'public.json'));
  if (
    publicResult.failure !== null ||
    !publicResult.ui ||
    !Object.values(publicResult.bootstrap.cases).every((x) => x === true) ||
    !Object.values(publicResult.ui.cases).every((x) => x === true)
  )
    fail('FLEET_UI_RESULT');
  const plans = [],
    files = [];
  const add = (dir, limit) => plans.push(tree(dir, limit));
  const managedEntries = entries(s.managed, 8),
    allowed = [
      '.owner',
      '.launcher-guard',
      '.launcher-current.json',
      'data-main',
      'logs-main',
      'verification-backup-parent',
      path.basename(s.launch),
    ];
  if (
    managedEntries.length !== allowed.length ||
    managedEntries.some((e) => !allowed.includes(e.name))
  )
    fail('FLEET_UI_INVENTORY');
  const marker = json(path.join(s.header.dataRoot, '.persistence-owner.json'));
  if (
    JSON.stringify(marker) !==
    JSON.stringify({ version: 1, storeId: s.header.storeId, kind: 'FRESH', restoreReceiptId: null })
  )
    fail('FLEET_UI_OWNER');
  const guard = fs.lstatSync(path.join(s.managed, '.launcher-guard'));
  if (!guard.isFile() || guard.isSymbolicLink() || guard.size !== 0 || guard.nlink !== 1)
    fail('FLEET_UI_OWNER');
  for (const item of managedEntries) {
    if (item.name === 'data-main') add(item.file, 134217728);
    else if (item.name === 'logs-main') {
      const raw = read(path.join(item.file, 'owner.json'));
      if (
        !/^\{"schemaVersion":1,"storeId":"[0-9a-f-]{36}"\}\n$/.test(raw) ||
        !uuid(JSON.parse(raw).storeId) ||
        raw !== JSON.stringify(JSON.parse(raw)) + '\n'
      )
        fail('FLEET_UI_OWNER');
      add(item.file, 8388608);
    } else if (item.name === 'verification-backup-parent') {
      const config = json(path.join(s.header.dataRoot, 'backup-locations.json'));
      if (
        config.version !== 1 ||
        config.storeId !== s.header.storeId ||
        !Array.isArray(config.locations) ||
        config.locations.length !== 1
      )
        fail('FLEET_UI_OWNER');
      const location = config.locations[0];
      if (
        !uuid(location.locationId) ||
        !uuid(location.folderMarkerId) ||
        config.activeLocationId !== location.locationId ||
        location.state !== 'ACTIVE' ||
        location.absolutePath !== path.join(item.file, 'backup-' + location.folderMarkerId)
      )
        fail('FLEET_UI_OWNER');
      const children = entries(item.file, 2);
      if (
        children.length !== 1 ||
        children[0].file !== location.absolutePath ||
        !children[0].stat.isDirectory()
      )
        fail('FLEET_UI_OWNER');
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
        fail('FLEET_UI_OWNER');
      add(item.file, 134217728);
    } else if (item.file === s.launch) {
      const metadata = [];
      let total = 0;
      for (const e of entries(item.file)) {
        if (e.stat.isDirectory()) {
          if (
            !['provision', 'auth', 'main'].some(
              (stage) => e.name === `fonesi-auto-foundation-${s.header.launchId}-${stage}`,
            ) ||
            read(path.join(e.file, '.owner')) !== 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n'
          )
            fail('FLEET_UI_OWNER');
          add(e.file, 8388608);
        } else {
          if (e.stat.size > 65536) fail('FLEET_UI_LIMIT');
          total += e.stat.size;
          metadata.push(e);
        }
      }
      if (total > 1048576) fail('FLEET_UI_LIMIT');
      plans.push({ directory: item.file, entries: metadata });
    } else files.push(item);
  }
  const expected = [
    '.owner',
    'first-use',
    'Invoke-Desktop.instrumented.ps1',
    'launch-core.ps1',
    'copy.json',
    'launcher-capture.json',
    'bootstrap.json',
    'fleet-ui-result.json',
    'public.json',
    'fleet-light.png',
    'fleet-dark.png',
    ...['provision', 'auth', 'ui'].map((k) => path.basename(witnessPath(s.launch, k))),
  ];
  const rootEntries = entries(root, expected.length);
  if (rootEntries.length !== expected.length || rootEntries.some((e) => !expected.includes(e.name)))
    fail('FLEET_UI_INVENTORY');
  for (const e of rootEntries) {
    if (e.name === 'first-use' || e.name === '.owner') continue;
    if (
      !e.stat.isFile() ||
      e.stat.nlink !== 1 ||
      e.stat.size > (e.name.endsWith('.png') ? 2097152 : 65536)
    )
      fail('FLEET_UI_LIMIT');
    files.push(e);
  }
  for (const plan of plans)
    for (const item of plan.entries) {
      if (item.stat.isFile() && item.stat.nlink !== 1) fail('FLEET_UI_OWNER');
    }
  for (const item of files) if (item.stat.nlink !== 1) fail('FLEET_UI_OWNER');
  for (const theme of ['light', 'dark']) {
    const file = path.join(root, `fleet-${theme}.png`),
      expected = publicResult.ui.screenshots[theme];
    const bytes = fs.readFileSync(file);
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) fail('FLEET_UI_RESULT');
  }
  // Complete bounded inventory/identities before first deletion. Unknown partitions preserve all.
  if (read(path.join(root, '.owner')) !== token) fail('FLEET_UI_OWNER');
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
  'INSPECT',
  'CLEANUP',
  'DIAGNOSE',
  'ARGUMENT',
]);
const REASONS = Object.freeze([
  'FLEET_UI_CONTROL_REJECTED',
  'FLEET_UI_SOURCE_CHANGED',
  'FLEET_UI_TRANSFORM',
  'FLEET_UI_BUILD',
  'FLEET_UI_COPY',
  'FLEET_UI_RETIREMENT',
  'FLEET_UI_CAPTURE',
  'FLEET_UI_OWNER',
  'FLEET_UI_JOURNAL',
  'FLEET_UI_AUTH',
  'FLEET_UI_DIALOG',
  'FLEET_UI_MAIN',
  'FLEET_UI_LEASE',
  'FLEET_UI_SCHEMA',
  'FLEET_UI_RESULT',
  'FLEET_UI_INVENTORY',
  'FLEET_UI_LIMIT',
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
    'FLEET_UI_CONTROL_PHASE_' + (PHASES.includes(phase) ? phase : 'ARGUMENT'),
    'FLEET_UI_CONTROL_REASON_' + code,
    ...Object.entries(captureErrors.get(error) ?? {}).map(
      ([key, value]) => 'FLEET_UI_CAPTURE_' + key + '_' + value,
    ),
  ];
}
module.exports = {
  prepare,
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
  const [action, root] = process.argv.slice(2);
  Promise.resolve()
    .then(async () => {
      if (process.argv.length !== 4) fail();
      if (action === 'prepare') await prepare(root);
      else if (action === 'verify-copy') await verifyCopy(root);
      else if (action === 'inspect') await inspect(root);
      else if (action === 'cleanup') await cleanup(root);
      else if (action === 'diagnose') for (const line of await diagnose(root)) console.error(line);
      else fail();
      console.log('FLEET_UI_CONTROL_PASS');
    })
    .catch((error) => {
      for (const line of diagnostics(action, error)) console.error(line);
      console.log('FLEET_UI_CONTROL_FAILED');
      process.exitCode = 1;
    });
}
