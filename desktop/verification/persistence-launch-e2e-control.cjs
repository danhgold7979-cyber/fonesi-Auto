'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const ORIGINAL_SHA = '560c30f55e9b650f4041c6f504097ec62a6c16c80ce0108ceb37c8591967cd4a';
const CASES = [
  'audited_copy',
  'first_provisioned',
  'first_authenticated',
  'first_main_ready',
  'first_lease_released',
  'second_no_reprovision',
  'same_old_backup',
  'second_main_ready',
  'second_lease_released',
  'v2_orderly_proof',
  'schema2',
  'automatic_admission_persisted',
  'backups_persisted',
  'dialog_answers_instrumented',
];
const hash = (x) => crypto.createHash('sha256').update(x).digest('hex');
const uuid = (x) =>
  typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
function plain(p) {
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
  plain(path.dirname(p));
  const s = fs.lstatSync(p);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'r');
  try {
    const b = Buffer.alloc(65537);
    let n = 0;
    while (n < b.length) {
      const c = fs.readSync(fd, b, n, b.length - n, null);
      if (!c) break;
      n += c;
    }
    if (n > 65536) throw new Error('FILE');
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(b.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}
function parse(p) {
  const raw = read(p),
    value = JSON.parse(raw);
  if (JSON.stringify(value) !== raw) throw new Error('JSON');
  return value;
}
function write(p, v) {
  const raw = typeof v === 'string' ? v : JSON.stringify(v);
  if (Buffer.byteLength(raw) > 65536) throw new Error('FILE');
  plain(path.dirname(p));
  const fd = fs.openSync(p, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function names(p) {
  plain(p);
  const d = fs.opendirSync(p),
    out = [];
  try {
    for (;;) {
      const e = d.readSync();
      if (!e) break;
      if (out.length === 32 || e.isSymbolicLink()) throw new Error('TREE');
      out.push(e.name);
    }
  } finally {
    d.closeSync();
  }
  return out;
}
function transform(source, desktop) {
  if (hash(source) !== ORIGINAL_SHA) throw new Error('SOURCE_CHANGED');
  const replacements = [
    [
      "$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))",
      `$desktop='${desktop.replaceAll("'", "''")}'`,
    ],
    [
      "Join-Path $PSScriptRoot 'persistence-launch-control.cjs'",
      "Join-Path $desktop 'launch/persistence-launch-control.cjs'",
    ],
    [
      "Join-Path $PSScriptRoot 'persistence-initialize.cjs'",
      "Join-Path $desktop 'verification/persistence-launch-init-probe.cjs'",
    ],
    [
      "Join-Path $desktop 'build/main.cjs'",
      "Join-Path $desktop 'verification/persistence-launch-main-probe.cjs'",
    ],
  ];
  let changed = source;
  for (const [old, next] of replacements) {
    if (changed.split(old).length !== 2) throw new Error('TRANSFORM');
    changed = changed.replace(old, next);
  }
  return changed;
}
function fixedResult(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) throw new Error('RESULT');
  const v = JSON.parse(raw);
  if (
    JSON.stringify(v) !== raw ||
    JSON.stringify(Object.keys(v)) !==
      JSON.stringify(['version', 'scope', 'cases', 'protectedCount', 'ordinaryCount']) ||
    v.version !== 1 ||
    v.scope !== 'INSTRUMENTED_PRODUCTION_LAUNCHER' ||
    JSON.stringify(Object.keys(v.cases)) !== JSON.stringify(CASES) ||
    CASES.some((k) => typeof v.cases[k] !== 'boolean') ||
    !Number.isInteger(v.protectedCount) ||
    !Number.isInteger(v.ordinaryCount) ||
    v.protectedCount < 0 ||
    v.protectedCount > 2 ||
    v.ordinaryCount < 0 ||
    v.ordinaryCount > 1
  )
    throw new Error('RESULT');
  return {
    ...v,
    passed: CASES.every((k) => v.cases[k]) && v.protectedCount === 2 && v.ordinaryCount === 1,
  };
}
function capture(launch, stage, expected) {
  const v = parse(path.join(launch, stage + '-capture.json')),
    p = v.process;
  if (
    p?.status !== 'SUCCESS' ||
    p.exitCode !== 0 ||
    p.cleanupComplete !== true ||
    p.stdoutTruncated !== false ||
    p.stderrTruncated !== false ||
    typeof v.stdout !== 'string' ||
    typeof v.stderr !== 'string'
  )
    throw new Error('RETIREMENT');
  const lines = v.stdout.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] === '') lines.shift();
  if (
    JSON.stringify(lines) !== JSON.stringify(expected) ||
    v.stderr
      .split(/\r?\n/)
      .some((x) =>
        [
          'PERSISTENCE_INITIALIZE_FAILED',
          'PERSISTENCE_LAUNCH_PROBE_FAILED',
          'BOOTSTRAP_FAILED',
          'BOOTSTRAP_CLEANUP_FAILED',
          'PERSISTENCE_SHUTDOWN_FAILED',
        ].includes(x),
      )
  )
    throw new Error('CAPTURE');
}
async function run() {
  const [action, root] = process.argv.slice(2);
  if (
    process.argv.length !== 4 ||
    !['prepare', 'verify-copy', 'inspect-first', 'inspect-second'].includes(action)
  )
    throw new Error('ARGUMENT');
  const desktop = path.resolve(__dirname, '..');
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(desktop)) throw new Error('BUILD');
  plain(root);
  if (!uuid(read(path.join(root, '.owner')))) throw new Error('OWNER');
  const original = read(path.join(desktop, 'launch/Invoke-Desktop.ps1')),
    copied = transform(original, desktop),
    copy = path.join(root, 'Invoke-Desktop.instrumented.ps1');
  if (action === 'prepare') {
    fs.mkdirSync(path.join(root, 'first-use'));
    write(copy, copied);
    write(path.join(root, 'copy.json'), {
      version: 1,
      originalSha: hash(original),
      copySha: hash(copied),
      substitutions: 4,
    });
    console.log('PERSISTENCE_LAUNCH_E2E_PREPARED');
    return;
  }
  if (
    read(copy) !== copied ||
    JSON.stringify(parse(path.join(root, 'copy.json'))) !==
      JSON.stringify({
        version: 1,
        originalSha: hash(original),
        copySha: hash(copied),
        substitutions: 4,
      })
  )
    throw new Error('COPY');
  if (action === 'verify-copy') {
    console.log('PERSISTENCE_LAUNCH_E2E_COPY_VERIFIED');
    return;
  }
  const firstUse = path.join(root, 'first-use'),
    children = names(firstUse);
  if (
    children.length !== 1 ||
    !/^Fonesi-Auto-[0-9a-f-]{36}$/.test(children[0]) ||
    !uuid(children[0].slice(12))
  )
    throw new Error('ROOT');
  const managed = path.join(firstUse, children[0]);
  plain(managed);
  if (!uuid(read(path.join(managed, '.owner')))) throw new Error('OWNER');
  const launches = names(managed).filter((n) => /^launch-[0-9a-f-]{36}$/.test(n));
  const first = action === 'inspect-first' ? null : parse(path.join(root, 'first.json'));
  if (launches.length !== (first ? 2 : 1)) throw new Error('LAUNCHES');
  const chosen = launches.filter((n) => !first || path.join(managed, n) !== first.launch);
  if (chosen.length !== 1) throw new Error('LAUNCH');
  const launch = path.join(managed, chosen[0]),
    state = parse(path.join(launch, 'state.json')),
    auth = parse(path.join(launch, 'auth-observed.json'));
  if (
    state.parentToken !== read(path.join(managed, '.owner')) ||
    state.root !== managed ||
    state.needsProvision !== !first ||
    auth.status !== 'AUTHENTICATED' ||
    auth.stage !== 'auth' ||
    !auth.witness
  )
    throw new Error('STATE');
  capture(launch, 'auth', ['PERSISTENCE_INITIALIZE_ORDERLY']);
  capture(launch, 'main', ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED']);
  const authDialog = parse(path.join(launch, 'auth-dialog-witness.json'));
  if (authDialog.stage !== 'auth' || authDialog.opens !== 0 || authDialog.confirms !== 0)
    throw new Error('DIALOG');
  if (!first) {
    const provision = parse(path.join(launch, 'provision-observed.json'));
    capture(launch, 'provision', ['PERSISTENCE_INITIALIZE_ORDERLY']);
    const dialog = parse(path.join(launch, 'provision-dialog-witness.json'));
    if (
      provision.status !== 'PROVISIONED' ||
      JSON.stringify(provision.witness) !== JSON.stringify(auth.witness) ||
      dialog.stage !== 'provision' ||
      dialog.opens !== 1 ||
      dialog.confirms !== 1
    )
      throw new Error('PROVISION');
  } else if (
    fs.existsSync(path.join(launch, 'provision-control.json')) ||
    JSON.stringify(first.witness) !== JSON.stringify(auth.witness) ||
    first.root !== managed ||
    first.parentToken !== state.parentToken
  )
    throw new Error('REPROVISION');
  if (
    JSON.stringify(parse(path.join(launch, 'ui-witness.json'))) !==
    JSON.stringify({ version: 1, ready: true, quitRequested: true, closed: true })
  )
    throw new Error('UI');
  const data = path.join(managed, 'data-main');
  if (
    fs.existsSync(path.join(data, '.writer-lock')) ||
    read(path.join(data, `.released-${state.ownerToken}.json`)) !==
      JSON.stringify({ version: 1, storeId: state.storeId, ownerToken: state.ownerToken })
  )
    throw new Error('LEASE');
  const proof = read(path.join(data, 'key-durability-proof.json'));
  if (
    proof !==
    JSON.stringify({
      version: 2,
      ...auth.witness,
      state: 'ORDERLY_REOPEN_AUTHENTICATED',
      runtimeCertification: 'ELECTRON_45_1_0_WIN_X64_DPAPI_V1',
    })
  )
    throw new Error('PROOF');
  const { FoundationDatabase, statement } = require('../build/foundation-database.cjs');
  const db = new FoundationDatabase(path.join(data, 'active.sqlite'), state.storeId, true);
  let admission, counts;
  try {
    db.validate();
    if (db.version !== 2) throw new Error('SCHEMA');
    const row = statement(
      db.connection,
      'SELECT restore_quarantine,last_auto_admitted_utc FROM foundation_store WHERE singleton=1',
      (s) => s.get(),
    );
    admission = row.last_auto_admitted_utc;
    if (row.restore_quarantine !== 0 || !Number.isSafeInteger(admission) || admission < 0)
      throw new Error('ADMISSION');
    counts = statement(
      db.connection,
      "SELECT SUM(CASE WHEN protected=1 AND reason='PRE_MIGRATION' THEN 1 ELSE 0 END) AS protectedCount,SUM(CASE WHEN protected=0 AND reason='DAILY' THEN 1 ELSE 0 END) AS ordinaryCount,COUNT(*) AS total FROM backup_record WHERE state='VALIDATED'",
      (s) => s.get(),
    );
    if (counts.protectedCount !== 2 || counts.ordinaryCount !== 1 || counts.total !== 3)
      throw new Error('COUNTS');
  } finally {
    db.close();
  }
  if (first && first.admission !== admission) throw new Error('DAILY_REPLAY');
  if (!first)
    write(path.join(root, 'first.json'), {
      version: 1,
      root: managed,
      parentToken: state.parentToken,
      launch,
      witness: auth.witness,
      admission,
    });
  else
    write(path.join(root, 'result.json'), {
      version: 1,
      scope: 'INSTRUMENTED_PRODUCTION_LAUNCHER',
      cases: Object.fromEntries(CASES.map((k) => [k, true])),
      protectedCount: counts.protectedCount,
      ordinaryCount: counts.ordinaryCount,
    });
  console.log('PERSISTENCE_LAUNCH_E2E_INSPECTED');
}
if (require.main === module)
  run().catch(() => {
    console.log('PERSISTENCE_LAUNCH_E2E_FAILED');
    process.exitCode = 1;
  });
module.exports = { transform, fixedResult, CASES, ORIGINAL_SHA };
