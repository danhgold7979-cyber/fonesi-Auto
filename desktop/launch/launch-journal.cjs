'use strict';
// Trusted supervisor metadata only. Caller holds the parent-wide OS guard across
// every operation and all Jobs; this module does not infer process death from PIDs.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const STAGES = Object.freeze([
  'SETUP',
  'PREPARE_PROVISION',
  'PROVISION',
  'OBSERVE_PROVISION',
  'PREPARE_AUTH',
  'AUTH',
  'OBSERVE_AUTH',
  'PREPARE_READY',
  'MAIN',
  'RELEASE',
  'RECOVERY',
]);
const MAINTENANCE = Object.freeze([
  'NORMAL',
  'backup-now',
  'list-backups',
  'select-backup-folder',
  'accept-upgrade',
  'restore-to-new',
]);
const TRANSITIONS = Object.freeze({
  SETUP: ['PREPARE_PROVISION', 'PREPARE_AUTH'],
  PREPARE_PROVISION: ['PROVISION'],
  PROVISION: ['OBSERVE_PROVISION'],
  OBSERVE_PROVISION: ['PREPARE_AUTH', 'RELEASE'],
  PREPARE_AUTH: ['AUTH'],
  AUTH: ['OBSERVE_AUTH'],
  OBSERVE_AUTH: ['PREPARE_READY'],
  PREPARE_READY: ['PREPARE_READY', 'MAIN'],
  MAIN: ['RELEASE'],
  RELEASE: [],
  RECOVERY: [],
});
const LIMIT = 65536;
function fail() {
  throw Error('LAUNCH_JOURNAL_REJECTED');
}
const uuid = (v) =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const sha = (raw) => createHash('sha256').update(raw).digest('hex');
const seq = (v) => Number.isSafeInteger(v) && v >= 1 && v <= 16;
const nn = (n) => String(n).padStart(2, '0');
function plain(directory) {
  if (typeof directory !== 'string' || directory !== path.resolve(directory)) fail();
  let current = directory;
  for (;;) {
    const s = fs.lstatSync(current);
    if (!s.isDirectory() || s.isSymbolicLink()) fail();
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const real = fs.realpathSync(directory);
  if (
    process.platform === 'win32'
      ? real.toLowerCase() !== directory.toLowerCase()
      : real !== directory
  )
    fail();
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
function read(file) {
  plain(path.dirname(file));
  const s = fs.lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.size > LIMIT) fail();
  const fd = fs.openSync(file, 'r');
  try {
    const actual = fs.fstatSync(fd);
    if (!actual.isFile() || actual.dev !== s.dev || actual.ino !== s.ino || actual.size > LIMIT)
      fail();
    const bytes = Buffer.alloc(LIMIT + 1);
    let n = 0;
    while (n < bytes.length) {
      const got = fs.readSync(fd, bytes, n, bytes.length - n, null);
      if (!got) break;
      n += got;
    }
    if (n > LIMIT) fail();
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}
function write(file, value) {
  plain(path.dirname(file));
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > LIMIT) fail();
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (read(file) !== raw) fail();
}
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  )
    fail();
}
function canonical(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > LIMIT) fail();
  const value = JSON.parse(raw);
  if (JSON.stringify(value) !== raw) fail();
  return value;
}
function parse(kind, raw) {
  const v = canonical(raw);
  const shapes = {
    header: [
      'version',
      'launchId',
      'parentToken',
      'storeId',
      'ownerToken',
      'dataRoot',
      'entryMode',
      'maintenance',
      'executableSha256',
    ],
    pointer: ['version', 'launchId', 'ownerToken', 'storeId', 'dataRoot'],
    intent: ['version', 'launchId', 'ownerToken', 'sequence', 'stage', 'previousSettlementSha256'],
    settlement: [
      'version',
      'launchId',
      'ownerToken',
      'sequence',
      'stage',
      'intentSha256',
      'captureSha256',
      'status',
      'exitCode',
      'cleanupComplete',
      'stdoutTruncated',
      'stderrTruncated',
    ],
    acquired: ['version', 'launchId', 'ownerToken', 'storeId', 'dataRoot', 'lockOwnerSha256'],
    recovery: [
      'version',
      'launchId',
      'ownerToken',
      'storeId',
      'dataRoot',
      'retiredSettlementSha256',
      'lockOwnerSha256',
      'state',
    ],
  };
  if (!Object.hasOwn(shapes, kind)) fail();
  exact(v, shapes[kind]);
  if (v.version !== 1 || !uuid(v.launchId) || !uuid(v.ownerToken)) fail();
  if ('storeId' in v && !uuid(v.storeId)) fail();
  if (
    'dataRoot' in v &&
    (typeof v.dataRoot !== 'string' ||
      v.dataRoot.length > 4096 ||
      path.resolve(v.dataRoot) !== v.dataRoot)
  )
    fail();
  if (
    kind === 'header' &&
    (!uuid(v.parentToken) ||
      !['SOURCE', 'PACKAGE'].includes(v.entryMode) ||
      !MAINTENANCE.includes(v.maintenance) ||
      !hash(v.executableSha256))
  )
    fail();
  if ('sequence' in v && (!seq(v.sequence) || !STAGES.includes(v.stage))) fail();
  for (const key of [
    'previousSettlementSha256',
    'intentSha256',
    'captureSha256',
    'lockOwnerSha256',
    'retiredSettlementSha256',
  ])
    if (key in v && !hash(v[key])) fail();
  if (kind === 'settlement') retired(v);
  if (kind === 'recovery' && v.state !== 'RELEASE_AUTHORIZED') fail();
  return Object.freeze(v);
}
function retired(v) {
  if (
    v.cleanupComplete !== true ||
    v.stdoutTruncated !== false ||
    v.stderrTruncated !== false ||
    !Number.isSafeInteger(v.exitCode) ||
    v.exitCode < -2147483648 ||
    v.exitCode > 2147483647
  )
    fail();
  if (v.status === 'SUCCESS' || v.status === 'EMPTY_OUTPUT') {
    if (v.exitCode !== 0) fail();
  } else if (v.status === 'NONZERO_EXIT') {
    if (v.exitCode === 0) fail();
  } else fail();
}
function capture(raw) {
  const v = canonical(raw);
  exact(v, ['process', 'stdout', 'stderr']);
  exact(v.process, ['status', 'exitCode', 'cleanupComplete', 'stdoutTruncated', 'stderrTruncated']);
  retired(v.process);
  if (
    typeof v.stdout !== 'string' ||
    typeof v.stderr !== 'string' ||
    v.stdout.length > 32768 ||
    v.stderr.length > 32768
  )
    fail();
  return v;
}
function inventory(directory, profileNames = []) {
  plain(directory);
  const entries = [];
  let count = 0;
  function profile(dir, depth, budget) {
    if (depth > 16) fail();
    const listing = fs.opendirSync(dir);
    try {
      for (;;) {
        const item = listing.readSync();
        if (!item) break;
        if (++budget.count > 256 || item.isSymbolicLink()) fail();
        const file = path.join(dir, item.name),
          stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) fail();
        if (stat.isDirectory()) profile(file, depth + 1, budget);
        else if (stat.isFile()) {
          budget.bytes += stat.size;
          if (budget.bytes > 8 * 1024 * 1024) fail();
        } else fail();
      }
    } finally {
      listing.closeSync();
    }
  }
  const dir = fs.opendirSync(directory);
  try {
    for (;;) {
      const item = dir.readSync();
      if (!item) break;
      if (++count > 256 || item.isSymbolicLink()) fail();
      if (item.isDirectory()) {
        if (!profileNames.includes(item.name)) fail();
        const child = path.join(directory, item.name);
        plain(child);
        if (read(path.join(child, '.owner')) !== 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n') fail();
        profile(child, 1, { bytes: 0, count: 0 });
      } else if (!item.isFile()) fail();
      entries.push(item.name);
    }
  } finally {
    dir.closeSync();
  }
  return entries;
}
function context(parent, launch) {
  plain(parent);
  plain(launch);
  const parentToken = read(path.join(parent, '.owner'));
  if (
    !uuid(parentToken) ||
    path.dirname(launch) !== parent ||
    !/^launch-[0-9a-f-]{36}$/.test(path.basename(launch)) ||
    !uuid(read(path.join(launch, '.owner')))
  )
    fail();
  return parentToken;
}
function readHeader(parent, launch) {
  const token = context(parent, launch),
    header = parse('header', read(path.join(launch, 'launch-journal.json')));
  if (
    header.parentToken !== token ||
    path.basename(launch) !== 'launch-' + header.launchId ||
    path.dirname(header.dataRoot) !== parent ||
    !['data-main', `data-${header.storeId}`].includes(path.basename(header.dataRoot))
  )
    fail();
  return header;
}
function pointerOf(h) {
  return {
    version: 1,
    launchId: h.launchId,
    ownerToken: h.ownerToken,
    storeId: h.storeId,
    dataRoot: h.dataRoot,
  };
}
function assertCurrent(parent, launch) {
  const h = readHeader(parent, launch);
  if (
    JSON.stringify(parse('pointer', read(path.join(parent, '.launcher-current.json')))) !==
    JSON.stringify(pointerOf(h))
  )
    fail();
  return h;
}
function same(h, v) {
  if (
    v.launchId !== h.launchId ||
    v.ownerToken !== h.ownerToken ||
    ('storeId' in v && v.storeId !== h.storeId) ||
    ('dataRoot' in v && v.dataRoot !== h.dataRoot)
  )
    fail();
}
function transition(previous, sequence, stage) {
  if (!STAGES.includes(stage) || (sequence === 1 && stage !== 'SETUP')) fail();
  if (!previous) {
    if (sequence !== 1) fail();
    return;
  }
  if (['RELEASE', 'RECOVERY'].includes(previous.stage) && previous.status === 'SUCCESS') fail();
  if (
    stage !== 'RECOVERY' &&
    (previous.status !== 'SUCCESS' || !TRANSITIONS[previous.stage].includes(stage))
  )
    fail();
}
function inspect(parent, launch) {
  const header = assertCurrent(parent, launch),
    profileNames = ['provision', 'auth', 'main'].map(
      (stage) => `fonesi-auto-foundation-${header.launchId}-${stage}`,
    ),
    names = inventory(launch, profileNames),
    intents = [],
    settlements = [];
  let pending = null;
  const fixed = [
    '.owner',
    'launch-journal.json',
    'lease-acquired.json',
    'lease-recovery.json',
    'state.json',
    'runtime-attestation.json',
    'log-launch-proof.json',
    'log-recovery-owner.json',
  ];
  for (const name of names) {
    if (
      !profileNames.includes(name) &&
      !fixed.includes(name) &&
      !/^(intent|settled|capture)-(?:0[1-9]|1[0-6])\.json$/.test(name) &&
      !/^(provision|auth)-(control|result|observed|capture)\.json$/.test(name) &&
      name !== 'main-capture.json'
    )
      fail();
  }
  let previous = sha(read(path.join(launch, 'launch-journal.json')));
  for (let n = 1; n <= 16; n++) {
    const iName = `intent-${nn(n)}.json`,
      sName = `settled-${nn(n)}.json`,
      cName = `capture-${nn(n)}.json`;
    if (!names.includes(iName)) {
      if (
        names.some(
          (name) =>
            /^(intent|settled|capture)-/.test(name) &&
            Number(name.slice(name.indexOf('-') + 1, name.indexOf('.'))) >= n,
        )
      )
        fail();
      break;
    }
    if (pending) fail();
    const iRaw = read(path.join(launch, iName)),
      intent = parse('intent', iRaw);
    same(header, intent);
    transition(settlements.at(-1), n, intent.stage);
    if (intent.sequence !== n || intent.previousSettlementSha256 !== previous) fail();
    intents.push(intent);
    if (!names.includes(sName)) {
      pending = intent;
      continue;
    }
    if (!names.includes(cName)) fail();
    const cRaw = read(path.join(launch, cName)),
      observed = capture(cRaw),
      sRaw = read(path.join(launch, sName)),
      settlement = parse('settlement', sRaw);
    same(header, settlement);
    if (
      settlement.sequence !== n ||
      settlement.stage !== intent.stage ||
      settlement.intentSha256 !== sha(iRaw) ||
      settlement.captureSha256 !== sha(cRaw) ||
      ['status', 'exitCode', 'cleanupComplete', 'stdoutTruncated', 'stderrTruncated'].some(
        (key) => settlement[key] !== observed.process[key],
      )
    )
      fail();
    settlements.push(settlement);
    previous = sha(sRaw);
  }
  return Object.freeze({
    header,
    intents: Object.freeze(intents),
    settlements: Object.freeze(settlements),
    latest: settlements.at(-1) ?? null,
    pending,
    nextSequence: intents.length + 1,
  });
}
function ownerBytes(h) {
  return JSON.stringify({ version: 1, storeId: h.storeId, ownerToken: h.ownerToken });
}
function rootProvenance(dataRoot) {
  plain(dataRoot);
  const p = canonical(read(path.join(dataRoot, '.persistence-owner.json')));
  exact(p, ['version', 'storeId', 'kind', 'restoreReceiptId']);
  if (
    p.version !== 1 ||
    !uuid(p.storeId) ||
    !['FRESH', 'RESTORED'].includes(p.kind) ||
    (p.kind === 'FRESH' ? p.restoreReceiptId !== null : !uuid(p.restoreReceiptId))
  )
    fail();
  if (path.basename(dataRoot) !== (p.kind === 'FRESH' ? 'data-main' : `data-${p.storeId}`)) fail();
  if (p.kind === 'RESTORED') {
    if (
      read(path.join(dataRoot, '.restore-receipt.json')) !==
      JSON.stringify({
        version: 1,
        storeId: p.storeId,
        restoreReceiptId: p.restoreReceiptId,
        quarantined: true,
      })
    )
      fail();
  } else if (!absent(path.join(dataRoot, '.restore-receipt.json'))) fail();
  return p;
}
function lockState(h) {
  const provenance = rootProvenance(h.dataRoot);
  if (
    provenance.storeId !== h.storeId ||
    (provenance.kind === 'RESTORED' && h.maintenance === 'NORMAL')
  )
    fail();
  const lock = path.join(h.dataRoot, '.writer-lock');
  if (absent(lock)) return 'ABSENT';
  plain(lock);
  const names = inventory(lock);
  if (names.length === 0) return 'EMPTY';
  if (
    names.length !== 1 ||
    names[0] !== 'owner.json' ||
    read(path.join(lock, 'owner.json')) !== ownerBytes(h)
  )
    fail();
  return 'OWNED';
}
function acquired(h, launch) {
  const value = parse('acquired', read(path.join(launch, 'lease-acquired.json')));
  same(h, value);
  if (value.lockOwnerSha256 !== sha(ownerBytes(h))) fail();
  return value;
}
function recordAcquired(parent, launch) {
  const inspected = inspect(parent, launch);
  if (inspected.pending?.stage !== 'SETUP' && inspected.latest?.stage !== 'SETUP') fail();
  const h = inspected.header;
  if (lockState(h) !== 'OWNED') fail();
  const value = { ...pointerOf(h), lockOwnerSha256: sha(ownerBytes(h)) };
  const file = path.join(launch, 'lease-acquired.json');
  if (!absent(file)) {
    if (JSON.stringify(acquired(h, launch)) !== JSON.stringify(value)) fail();
    return value;
  }
  write(file, value);
  return value;
}
function recoveryReceipt(h, launch, state) {
  const receipt = parse('recovery', read(path.join(launch, 'lease-recovery.json')));
  same(h, receipt);
  if (
    receipt.lockOwnerSha256 !== acquired(h, launch).lockOwnerSha256 ||
    !state.settlements.some(
      (s) =>
        sha(read(path.join(launch, `settled-${nn(s.sequence)}.json`))) ===
        receipt.retiredSettlementSha256,
    )
  )
    fail();
  return receipt;
}
function completed(parent, launch) {
  const state = inspect(parent, launch),
    h = state.header;
  if (
    state.pending ||
    !state.latest ||
    state.latest.status !== 'SUCCESS' ||
    state.latest.exitCode !== 0 ||
    !['RELEASE', 'RECOVERY'].includes(state.latest.stage) ||
    lockState(h) !== 'ABSENT'
  )
    fail();
  acquired(h, launch);
  if (state.latest.stage === 'RECOVERY') recoveryReceipt(h, launch, state);
  else if (read(path.join(h.dataRoot, `.released-${h.ownerToken}.json`)) !== ownerBytes(h)) fail();
  return state;
}
function initialize(parent, launch, header) {
  const token = context(parent, launch),
    h = parse('header', JSON.stringify(header));
  if (
    token !== h.parentToken ||
    path.basename(launch) !== 'launch-' + h.launchId ||
    path.dirname(h.dataRoot) !== parent ||
    !['data-main', `data-${h.storeId}`].includes(path.basename(h.dataRoot))
  )
    fail();
  const pointer = path.join(parent, '.launcher-current.json');
  if (!absent(pointer)) {
    const prior = parse('pointer', read(pointer));
    completed(parent, path.join(parent, 'launch-' + prior.launchId));
  }
  write(path.join(launch, 'launch-journal.json'), h);
  if (absent(pointer)) write(pointer, pointerOf(h));
  else {
    const stage = path.join(parent, `.launcher-current-${randomUUID()}.json`);
    write(stage, pointerOf(h));
    fs.renameSync(stage, pointer);
    if (read(pointer) !== JSON.stringify(pointerOf(h))) fail();
  }
  return h;
}
function plan(parent, launch, dataRoot, entryMode, maintenance, executableSha256) {
  const parentToken = context(parent, launch);
  if (typeof dataRoot !== 'string' || path.dirname(dataRoot) !== parent) fail();
  let storeId;
  if (absent(dataRoot)) {
    if (path.basename(dataRoot) !== 'data-main') fail();
    storeId = randomUUID();
  } else {
    const p = rootProvenance(dataRoot);
    if (p.kind === 'RESTORED' && maintenance === 'NORMAL') fail();
    storeId = p.storeId;
  }
  return initialize(parent, launch, {
    version: 1,
    launchId: path.basename(launch).slice(7),
    parentToken,
    storeId,
    ownerToken: randomUUID(),
    dataRoot,
    entryMode,
    maintenance,
    executableSha256,
  });
}
function appendIntent(parent, launch, sequence, stage) {
  const state = inspect(parent, launch);
  if (
    !seq(sequence) ||
    sequence !== state.nextSequence ||
    state.pending ||
    !STAGES.includes(stage) ||
    (sequence === 1 && stage !== 'SETUP')
  )
    fail();
  transition(state.latest, sequence, stage);
  if (stage === 'RECOVERY') eligibleRecovery(parent, launch);
  const value = {
    version: 1,
    launchId: state.header.launchId,
    ownerToken: state.header.ownerToken,
    sequence,
    stage,
    previousSettlementSha256: sha(
      read(
        path.join(
          launch,
          sequence === 1 ? 'launch-journal.json' : `settled-${nn(sequence - 1)}.json`,
        ),
      ),
    ),
  };
  write(path.join(launch, `intent-${nn(sequence)}.json`), value);
  return value;
}
function settle(parent, launch, sequence) {
  const state = inspect(parent, launch);
  if (!seq(sequence) || state.pending?.sequence !== sequence) fail();
  const intent = state.pending,
    cRaw = read(path.join(launch, `capture-${nn(sequence)}.json`)),
    observed = capture(cRaw);
  const value = {
    version: 1,
    launchId: state.header.launchId,
    ownerToken: state.header.ownerToken,
    sequence,
    stage: intent.stage,
    intentSha256: sha(read(path.join(launch, `intent-${nn(sequence)}.json`))),
    captureSha256: sha(cRaw),
    ...observed.process,
  };
  write(path.join(launch, `settled-${nn(sequence)}.json`), value);
  return value;
}
function eligibleRecovery(parent, launch, allowPending = false) {
  const state = inspect(parent, launch);
  if (state.pending && (!allowPending || state.pending.stage !== 'RECOVERY')) fail();
  if (!state.latest) fail();
  const h = state.header,
    kind = lockState(h);
  if (!absent(path.join(launch, 'lease-recovery.json'))) recoveryReceipt(h, launch, state);
  if (absent(path.join(launch, 'lease-acquired.json'))) {
    if (kind !== 'OWNED' || state.latest.stage !== 'SETUP') fail();
    recordAcquired(parent, launch);
  } else acquired(h, launch);
  if (kind === 'EMPTY' || kind === 'ABSENT') {
    recoveryReceipt(h, launch, state);
    if (state.latest.stage !== 'RECOVERY') fail();
  } else if (kind !== 'OWNED') fail();
  return state;
}
function recoveryIntent(parent, launch, sequence) {
  eligibleRecovery(parent, launch);
  return appendIntent(parent, launch, sequence, 'RECOVERY');
}
function recover(parent, launch) {
  const state = eligibleRecovery(parent, launch, true);
  if (state.pending?.stage !== 'RECOVERY') fail();
  const h = state.header,
    file = path.join(launch, 'lease-recovery.json');
  if (absent(file)) {
    if (lockState(h) !== 'OWNED') fail();
    write(file, {
      ...pointerOf(h),
      retiredSettlementSha256: sha(
        read(path.join(launch, `settled-${nn(state.latest.sequence)}.json`)),
      ),
      lockOwnerSha256: acquired(h, launch).lockOwnerSha256,
      state: 'RELEASE_AUTHORIZED',
    });
  } else recoveryReceipt(h, launch, state);
  const kind = lockState(h);
  if (kind === 'OWNED') fs.unlinkSync(path.join(h.dataRoot, '.writer-lock/owner.json'));
  if (kind !== 'ABSENT') fs.rmdirSync(path.join(h.dataRoot, '.writer-lock'));
  return true;
}
function cli(args) {
  const [action, parent, launch, ...rest] = args;
  if (action === 'plan' && rest.length === 4) plan(parent, launch, ...rest);
  else if (action === 'intent' && rest.length === 2 && /^(?:[1-9]|1[0-6])$/.test(rest[0]))
    appendIntent(parent, launch, Number(rest[0]), rest[1]);
  else if (action === 'settle' && rest.length === 1 && /^(?:[1-9]|1[0-6])$/.test(rest[0]))
    settle(parent, launch, Number(rest[0]));
  else if (action === 'recovery-intent' && rest.length === 1 && /^(?:[1-9]|1[0-6])$/.test(rest[0]))
    recoveryIntent(parent, launch, Number(rest[0]));
  else if (action === 'acquired' && rest.length === 0) recordAcquired(parent, launch);
  else fail();
}
module.exports = {
  STAGES,
  MAINTENANCE,
  parse,
  read,
  write,
  sha,
  plan,
  initialize,
  inspect,
  readHeader,
  assertCurrent,
  appendIntent,
  settle,
  recordAcquired,
  eligibleRecovery,
  recoveryIntent,
  recover,
  completed,
  cli,
};
if (require.main === module) {
  try {
    cli(process.argv.slice(2));
    console.log('LAUNCH_JOURNAL_PASS');
  } catch {
    console.log('LAUNCH_JOURNAL_FAILED');
    process.exitCode = 1;
  }
}
