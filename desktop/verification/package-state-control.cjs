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
// PowerShell capture transport is JSON, not our own canonical receipt encoding.
// Consume the bounded grammar before normalization so escaped duplicate keys
// cannot hide retirement/truncation failures. Arrays/deeper objects are not used.
const captureParseReasons = new WeakMap();
function captureParseFailure(reason) {
  const error = new Error('PACKAGE_STATE_REJECTED');
  captureParseReasons.set(error, reason);
  throw error;
}
function parseCapture(raw) {
  try {
    return parseCaptureInput(raw);
  } catch (error) {
    if (captureParseReasons.has(error)) throw error;
    captureParseFailure('JSON_GRAMMAR');
  }
}
function parseCaptureInput(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) captureParseFailure('INPUT_LIMIT');
  let offset = 0,
    pairs = 0;
  function space() {
    while (/[ \t\r\n]/.test(raw[offset] ?? '') && offset < raw.length) offset++;
  }
  function string() {
    const start = offset++;
    for (; offset < raw.length; offset++) {
      const c = raw[offset];
      if (c === '"') {
        offset++;
        return JSON.parse(raw.slice(start, offset));
      }
      if (c === '\\') {
        offset++;
        if (offset >= raw.length) captureParseFailure('JSON_GRAMMAR');
      } else if (c.charCodeAt(0) < 32) captureParseFailure('JSON_GRAMMAR');
    }
    captureParseFailure('JSON_GRAMMAR');
  }
  function value(depth) {
    space();
    if (raw[offset] === '"') return string();
    if (raw[offset] === '{') {
      if (depth > 2) captureParseFailure('DEPTH');
      offset++;
      space();
      const out = Object.create(null),
        keys = new Set();
      if (raw[offset] === '}') {
        offset++;
        return out;
      }
      for (;;) {
        space();
        if (raw[offset] !== '"') captureParseFailure('JSON_GRAMMAR');
        if (++pairs > 8) captureParseFailure('PAIRS');
        const key = string();
        if (keys.has(key)) captureParseFailure('DUPLICATE');
        keys.add(key);
        space();
        if (raw[offset++] !== ':') captureParseFailure('JSON_GRAMMAR');
        out[key] = value(depth + 1);
        space();
        if (raw[offset] === '}') {
          offset++;
          return out;
        }
        if (raw[offset++] !== ',') captureParseFailure('JSON_GRAMMAR');
      }
    }
    const start = offset;
    while (offset < raw.length && !/[ \t\r\n,}]/.test(raw[offset])) offset++;
    if (start === offset) captureParseFailure('JSON_GRAMMAR');
    const atom = JSON.parse(raw.slice(start, offset));
    if (
      atom !== null &&
      typeof atom !== 'boolean' &&
      (typeof atom !== 'number' || !Number.isFinite(atom))
    )
      captureParseFailure('JSON_GRAMMAR');
    return atom;
  }
  const input = value(1);
  space();
  if (offset !== raw.length) captureParseFailure('JSON_GRAMMAR');
  function keys(v, expected) {
    return (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === expected.length &&
      expected.every((key) => Object.hasOwn(v, key))
    );
  }
  if (!keys(input, ['process', 'stdout', 'stderr'])) captureParseFailure('ROOT_KEYS');
  if (
    !keys(input.process, [
      'status',
      'exitCode',
      'cleanupComplete',
      'stdoutTruncated',
      'stderrTruncated',
    ])
  )
    captureParseFailure('PROCESS_KEYS');
  const p = input.process;
  if (
    ![
      'SUCCESS',
      'NONZERO_EXIT',
      'EMPTY_OUTPUT',
      'TIMEOUT',
      'CAPTURE_FAILED',
      'LAUNCH_FAILED',
      'ACCESS_DENIED',
      'CLEANUP_FAILED',
    ].includes(p.status)
  )
    captureParseFailure('STATUS_TYPE_OR_ENUM');
  if (
    p.exitCode !== null &&
    (!Number.isInteger(p.exitCode) ||
      Object.is(p.exitCode, -0) ||
      p.exitCode < -2147483648 ||
      p.exitCode > 2147483647)
  )
    captureParseFailure('EXIT_TYPE_OR_RANGE');
  if (
    !['cleanupComplete', 'stdoutTruncated', 'stderrTruncated'].every(
      (key) => typeof p[key] === 'boolean',
    )
  )
    captureParseFailure('BOOLEAN_TYPES');
  if (typeof input.stdout !== 'string' || input.stdout.length > 32768)
    captureParseFailure('STDOUT_TYPE_OR_LIMIT');
  if (typeof input.stderr !== 'string' || input.stderr.length > 32768)
    captureParseFailure('STDERR_TYPE_OR_LIMIT');
  return {
    process: {
      status: p.status,
      exitCode: p.exitCode,
      cleanupComplete: p.cleanupComplete,
      stdoutTruncated: p.stdoutTruncated,
      stderrTruncated: p.stderrTruncated,
    },
    stdout: input.stdout,
    stderr: input.stderr,
  };
}
const CAPTURE_VECTOR = Object.freeze({
  SCHEMA: ['VALID', 'INVALID', 'UNAVAILABLE'],
  PARSE_REASON: [
    'INPUT_LIMIT',
    'JSON_GRAMMAR',
    'DEPTH',
    'PAIRS',
    'DUPLICATE',
    'ROOT_KEYS',
    'PROCESS_KEYS',
    'STATUS_TYPE_OR_ENUM',
    'EXIT_TYPE_OR_RANGE',
    'BOOLEAN_TYPES',
    'STDOUT_TYPE_OR_LIMIT',
    'STDERR_TYPE_OR_LIMIT',
    'VALID',
    'UNAVAILABLE',
  ],
  STATUS: ['MATCH', 'MISMATCH', 'UNAVAILABLE'],
  EXIT: ['MATCH', 'MISMATCH', 'UNAVAILABLE'],
  CLEANUP: ['TRUE', 'FALSE', 'UNAVAILABLE'],
  STDOUT_TRUNCATED: ['TRUE', 'FALSE', 'UNAVAILABLE'],
  STDERR_TRUNCATED: ['TRUE', 'FALSE', 'UNAVAILABLE'],
  EXPECTED_MARKER: ['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE'],
  NONEMPTY_LINES: ['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE'],
  STDOUT_MATCH: ['EXACT', 'OTHER', 'UNAVAILABLE'],
  CANCELLED: ['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE'],
  CLOSED: ['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE'],
  RECOVERED: ['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE'],
  FAILURE: ['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE'],
  OTHER: ['ZERO', 'ONE', 'MULTIPLE', 'UNAVAILABLE'],
  FRAMING: ['STANDARD', 'LEADING_EMPTY', 'EXTRA_EMPTY', 'BARE_CR', 'OTHER', 'UNAVAILABLE'],
  STDERR: ['EMPTY', 'PRESENT', 'UNAVAILABLE'],
});
for (const values of Object.values(CAPTURE_VECTOR)) Object.freeze(values);
const CAPTURE_MARKERS = Object.freeze(
  Object.entries(CAPTURE_VECTOR).flatMap(([key, values]) =>
    values.map((value) => `PACKAGE_CAPTURE_${key}_${value}`),
  ),
);
let lastCaptureDiagnostic = null;
function captureDiagnostics(raw, stage) {
  const result = Object.fromEntries(Object.keys(CAPTURE_VECTOR).map((key) => [key, 'UNAVAILABLE']));
  let c;
  try {
    c = parseCapture(raw);
    result.SCHEMA = 'VALID';
    result.PARSE_REASON = 'VALID';
  } catch (error) {
    result.SCHEMA = raw === undefined ? 'UNAVAILABLE' : 'INVALID';
    result.PARSE_REASON =
      raw === undefined ? 'UNAVAILABLE' : (captureParseReasons.get(error) ?? 'JSON_GRAMMAR');
    return Object.freeze(result);
  }
  const expected = EXPECTED[stage];
  if (!expected) return Object.freeze(result);
  const p = c.process,
    normalized = c.stdout.replace(/\r\n/g, '\n'),
    records = normalized.split('\n'),
    lines = records.filter((line) => line !== '');
  const count = (n) => (n === 0 ? 'ZERO' : n === 1 ? 'ONE' : 'MULTIPLE');
  result.STATUS = p.status === expected[0] ? 'MATCH' : 'MISMATCH';
  result.EXIT = p.exitCode === expected[1] ? 'MATCH' : 'MISMATCH';
  result.CLEANUP = p.cleanupComplete ? 'TRUE' : 'FALSE';
  result.STDOUT_TRUNCATED = p.stdoutTruncated ? 'TRUE' : 'FALSE';
  result.STDERR_TRUNCATED = p.stderrTruncated ? 'TRUE' : 'FALSE';
  result.EXPECTED_MARKER = count(lines.filter((line) => line === expected[2]).length);
  result.NONEMPTY_LINES = count(lines.length);
  result.STDOUT_MATCH = lines.length === 1 && lines[0] === expected[2] ? 'EXACT' : 'OTHER';
  const known = {
    CANCELLED: 'PERSISTENCE_DESKTOP_CANCELLED',
    CLOSED: 'PERSISTENCE_DESKTOP_CLOSED',
    RECOVERED: 'PERSISTENCE_DESKTOP_RECOVERED',
  };
  const failures = [
    'PERSISTENCE_DESKTOP_PREPARE_FAILED',
    'PERSISTENCE_DESKTOP_SETUP_FAILED',
    'PERSISTENCE_DESKTOP_INITIALIZATION_FAILED',
    'PERSISTENCE_DESKTOP_RECOVERY_FAILED',
    'PERSISTENCE_DESKTOP_APPLICATION_FAILED',
    'PERSISTENCE_DESKTOP_RELEASE_FAILED',
  ];
  for (const [key, marker] of Object.entries(known))
    result[key] = count(lines.filter((line) => line === marker).length);
  result.FAILURE = count(lines.filter((line) => failures.includes(line)).length);
  result.OTHER = count(
    lines.filter((line) => !Object.values(known).includes(line) && !failures.includes(line)).length,
  );
  const framed = [...records];
  if (framed.at(-1) === '') framed.pop();
  const leading = framed[0] === '';
  if (leading) framed.shift();
  result.FRAMING = normalized.includes('\r')
    ? 'BARE_CR'
    : framed.includes('')
      ? 'EXTRA_EMPTY'
      : framed.length === 1
        ? leading
          ? 'LEADING_EMPTY'
          : 'STANDARD'
        : 'OTHER';
  result.STDERR = c.stderr.length === 0 ? 'EMPTY' : 'PRESENT';
  return Object.freeze(result);
}
function capture(root, stage) {
  lastCaptureDiagnostic = captureDiagnostics(undefined, stage);
  const raw = read(path.join(root, `package-capture-${stage}.json`));
  lastCaptureDiagnostic = captureDiagnostics(raw, stage);
  const c = parseCapture(raw),
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
const OBSERVE_PHASES = Object.freeze([
  'ADMISSION',
  'CAPTURE',
  'BEFORE_STATE',
  'MODULES',
  'PRODUCT',
  'JOURNAL',
  'COMPLETED',
  'OBSERVER',
  'RESULT',
]);
const OBSERVE_ERRORS = Object.freeze([
  'RESTORE_CONTROL',
  'RESTORE_DESCENDANT',
  'RESTORE_FILE',
  'RESTORE_LIMIT',
  'RESTORE_OWNER',
  'RESTORE_READBACK',
  'RESTORE_RESULT',
  'RESTORE_SCHEMA',
  'RESTORE_SOURCE',
  'PACKAGE_STATE_REJECTED',
  'LAUNCH_JOURNAL_REJECTED',
]);
function fixedObservationError(error) {
  try {
    if (!error || typeof error !== 'object') return 'UNCLASSIFIED';
    const descriptors = Object.getOwnPropertyDescriptors(error);
    const known = OBSERVE_ERRORS.find((code) => descriptors.message?.value === code);
    if (known) return known;
    return descriptors.code?.value === 'ENOENT' ? 'ENOENT' : 'UNCLASSIFIED';
  } catch {
    return 'UNCLASSIFIED';
  }
}
let observationPhase = null;
function observe(root, packageRoot, stage) {
  observationPhase = 'ADMISSION';
  const { packageHash } = admission(root, packageRoot, stage);
  observationPhase = 'CAPTURE';
  capture(root, stage);
  observationPhase = 'BEFORE_STATE';
  const before = exact(read(path.join(root, `package-before-${stage}.json`)), [
    'version',
    'state',
    'products',
    'source',
    'launches',
  ]);
  let s = validateState(root, before.state);
  if (s.packageHash !== packageHash) fail();
  observationPhase = 'MODULES';
  const m = modules(packageRoot),
    cases = Object.fromEntries(CASES[stage].map((k) => [k, false]));
  cases.packageVerified = true;
  cases.productOutsidePackage = true;
  cases.originalPackageUnchanged = true;
  const data = () => path.join(s.managedRoot, 'data-main');
  const unchanged = () =>
    equal(s.source, witness(data())) && equal(s.backup.witness, backupWitness(s.backup.file));
  if (stage === 'first-cancel' || stage === 'first-launch') {
    observationPhase = 'PRODUCT';
    const added = names(path.join(root, 'products')).filter((n) => !before.products.includes(n));
    if (added.length !== 1 || !added[0].startsWith('Fonesi-Auto-') || !uuid(added[0].slice(12)))
      fail();
    const managed = path.join(root, 'products', added[0]);
    owned(managed);
    observationPhase = 'JOURNAL';
    const j = current(managed, m.journal);
    observationPhase = 'COMPLETED';
    m.journal.completed(managed, j.launch);
    observationPhase = 'OBSERVER';
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
  observationPhase = 'RESULT';
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
  } catch (error) {
    if (OBSERVE_PHASES.includes(observationPhase)) {
      process.stderr.write(`PACKAGE_OBSERVE_${observationPhase}\n`);
      process.stderr.write(`PACKAGE_OBSERVE_ERROR_${fixedObservationError(error)}\n`);
      if (observationPhase === 'CAPTURE' && lastCaptureDiagnostic) {
        for (const [key, value] of Object.entries(lastCaptureDiagnostic)) {
          const marker = `PACKAGE_CAPTURE_${key}_${value}`;
          if (CAPTURE_MARKERS.includes(marker)) process.stderr.write(`${marker}\n`);
        }
      }
    }
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
  fixedObservationError,
  parseCapture,
  OBSERVE_PHASES,
  OBSERVE_ERRORS,
  CAPTURE_VECTOR,
  CAPTURE_MARKERS,
  captureDiagnostics,
};
