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
// Native captures are PowerShell JSON transport. Only these records accept
// equivalent JSON encoding; all owned metadata stays canonical. Settle hashes
// the original raw capture bytes, never this normalized view.
function captureTransport(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > LIMIT) fail();
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
        if (offset >= raw.length) fail();
      } else if (c.charCodeAt(0) < 32) fail();
    }
    fail();
  }
  function value(depth) {
    space();
    if (raw[offset] === '"') return string();
    if (raw[offset] === '{') {
      if (depth > 2) fail();
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
        if (raw[offset] !== '"') fail();
        if (++pairs > 8) fail();
        const key = string();
        if (keys.has(key)) fail();
        keys.add(key);
        space();
        if (raw[offset++] !== ':') fail();
        out[key] = value(depth + 1);
        space();
        if (raw[offset] === '}') {
          offset++;
          return out;
        }
        if (raw[offset++] !== ',') fail();
      }
    }
    const start = offset;
    while (offset < raw.length && !/[ \t\r\n,}]/.test(raw[offset])) offset++;
    if (start === offset) fail();
    const atom = JSON.parse(raw.slice(start, offset));
    if (
      atom !== null &&
      typeof atom !== 'boolean' &&
      (typeof atom !== 'number' || !Number.isFinite(atom))
    )
      fail();
    return atom;
  }
  const input = value(1);
  space();
  if (offset !== raw.length) fail();
  function keys(v, expected) {
    return (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === expected.length &&
      expected.every((key) => Object.hasOwn(v, key))
    );
  }
  if (!keys(input, ['process', 'stdout', 'stderr'])) fail();
  if (
    !keys(input.process, [
      'status',
      'exitCode',
      'cleanupComplete',
      'stdoutTruncated',
      'stderrTruncated',
    ])
  )
    fail();
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
    fail();
  if (
    p.exitCode !== null &&
    (!Number.isInteger(p.exitCode) ||
      Object.is(p.exitCode, -0) ||
      p.exitCode < -2147483648 ||
      p.exitCode > 2147483647)
  )
    fail();
  if (
    !['cleanupComplete', 'stdoutTruncated', 'stderrTruncated'].every(
      (key) => typeof p[key] === 'boolean',
    )
  )
    fail();
  if (typeof input.stdout !== 'string' || input.stdout.length > 32768) fail();
  if (typeof input.stderr !== 'string' || input.stderr.length > 32768) fail();
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
function capture(raw) {
  const v = captureTransport(raw);
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
const HOST_ASSET_KEYS = Object.freeze([
  'launch/Invoke-RetainedHost.ps1',
  'native/IsolatedAdbServer.cs',
  'native/RetainedAdbSession.cs',
  'native/RetainedAdbProtocol.cs',
  'native/RetainedHostAdmission.cs',
]);
function hostRecord(file, max, keys) {
  const stat = fs.lstatSync(file);
  if (stat.nlink !== 1 || stat.size < 1 || stat.size > max) fail();
  const raw = read(file),
    value = canonical(raw);
  exact(value, keys);
  if (Buffer.byteLength(raw) > max) fail();
  return { raw, value };
}
function hostParent(header, launch) {
  const file = path.join(launch, 'host-parent.json');
  if (absent(file)) return null;
  const { raw, value: r } = hostRecord(file, 4096, [
    'version',
    'launchId',
    'storeId',
    'ownerToken',
    'readySha256',
    'jobName',
    'parentPid',
    'parentCreationFileTime',
    'parentImagePath',
    'parentImageSha256',
  ]);
  if (
    r.version !== 1 ||
    r.launchId !== header.launchId ||
    r.storeId !== header.storeId ||
    r.ownerToken !== header.ownerToken ||
    !hash(r.readySha256) ||
    typeof r.jobName !== 'string' ||
    !r.jobName.startsWith('Local\\Fonesi-Auto-host-') ||
    !uuid(r.jobName.slice('Local\\Fonesi-Auto-host-'.length)) ||
    !Number.isSafeInteger(r.parentPid) ||
    r.parentPid < 1 ||
    r.parentPid > 4294967295 ||
    typeof r.parentCreationFileTime !== 'string' ||
    !/^[0-9a-f]{16}$/.test(r.parentCreationFileTime) ||
    typeof r.parentImagePath !== 'string' ||
    path.resolve(r.parentImagePath) !== r.parentImagePath ||
    r.parentImageSha256 !== header.executableSha256 ||
    header.maintenance !== 'NORMAL'
  )
    fail();
  const ready = read(path.join(header.dataRoot, '.ready-launch.json'));
  if (sha(ready) !== r.readySha256) fail();
  const value = canonical(ready);
  if (
    value.ownerToken !== header.ownerToken ||
    value.storeId !== header.storeId ||
    value.root !== header.dataRoot ||
    value.runtimeExeSha256 !== header.executableSha256 ||
    ![2, 3].includes(value.version)
  )
    fail();
  return Object.freeze({ receipt: r, sha256: sha(raw) });
}
const HOST_VIDEO_PROTOCOL = 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1';

/** Closed metadata only; this does not issue artifact or execution authority. */
function snapshotHostVideoArtifact(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = [
      'artifactId',
      'relativePath',
      'bytes',
      'sha256',
      'protocolId',
      'pairManifestSha256',
    ];
    const ds = Object.getOwnPropertyDescriptors(value);
    if (JSON.stringify(Object.keys(ds)) !== JSON.stringify(keys)) return null;
    const v = {};
    for (const key of keys) {
      if (!('value' in ds[key])) return null;
      v[key] = ds[key].value;
    }
    if (
      !hash(v.artifactId) ||
      v.artifactId.length !== 64 ||
      v.artifactId !== v.sha256 ||
      v.relativePath !== 'video/server.jar' ||
      !Number.isSafeInteger(v.bytes) ||
      typeof v.bytes !== 'number' ||
      v.bytes < 1 ||
      v.bytes > 8 * 1024 * 1024 ||
      v.protocolId !== HOST_VIDEO_PROTOCOL ||
      !hash(v.pairManifestSha256) ||
      v.pairManifestSha256.length !== 64
    )
      return null;
    return Object.freeze(v);
  } catch {
    return null;
  }
}
const VIDEO_BASE_KEYS = [
  'version',
  'launchId',
  'storeId',
  'ownerToken',
  'hostSessionId',
  'attemptId',
  'videoId',
  'transportId',
  'hostEpoch',
  'installationRevision',
  'artifactSha256',
  'protocolId',
];
const VIDEO_INTENT_KEYS = [
  ...VIDEO_BASE_KEYS,
  'remoteDirectory',
  'scid',
  'nonceSha256',
  'admittedUtc',
  'deadlineUtc',
];
const VIDEO_SETTLEMENT_KEYS = [
  ...VIDEO_BASE_KEYS,
  'directory',
  'upload',
  'launch',
  'localRetired',
  'cleanup',
  'streamObserved',
  'code',
];
/** Inspect retained metadata; only requireClean permits a deletion plan. */
function validateHostVideoJournal(root, bootstrapRaw, requireClean) {
  const b = JSON.parse(bootstrapRaw);
  const names = fs.readdirSync(root),
    hasIntent = names.includes('video-intent.json'),
    hasSettlement = names.includes('video-settlement.json');
  if (!hasIntent && !hasSettlement) return;
  const artifact = b.version === 3 ? snapshotHostVideoArtifact(b.videoArtifact) : null;
  if (!artifact || b.operationSet !== 'SERVER_ONLY' || !hasIntent) fail();
  const i = hostRecord(path.join(root, 'video-intent.json'), 8192, VIDEO_INTENT_KEYS).value;
  const integer = (v, min, max = Number.MAX_SAFE_INTEGER) =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
  for (const key of ['launchId', 'storeId', 'ownerToken']) if (i[key] !== b[key]) fail();
  if (
    i.version !== 1 ||
    i.hostSessionId !== b.sessionId ||
    !uuid(i.attemptId) ||
    i.attemptId.length !== 36 ||
    !uuid(i.videoId) ||
    i.videoId.length !== 36
  )
    fail();
  if (
    typeof i.transportId !== 'string' ||
    i.transportId.length > 20 ||
    !/^[1-9][0-9]*$/.test(i.transportId) ||
    /[^0-9]/.test(i.transportId) ||
    !integer(i.hostEpoch, 1) ||
    i.installationRevision !== b.installationRevision ||
    i.artifactSha256 !== artifact.sha256 ||
    i.protocolId !== artifact.protocolId ||
    i.remoteDirectory !== `/data/local/tmp/fonesi-video-${i.videoId}` ||
    !integer(i.scid, 0, 2147483647) ||
    !hash(i.nonceSha256) ||
    i.nonceSha256.length !== 64 ||
    !integer(i.admittedUtc, 0, 8640000000000000) ||
    !integer(i.deadlineUtc, 0, 8640000000000000) ||
    i.deadlineUtc <= i.admittedUtc ||
    i.deadlineUtc - i.admittedUtc > 30000
  )
    fail();
  if (!hasSettlement) {
    if (requireClean) fail();
    return;
  }
  const s = hostRecord(path.join(root, 'video-settlement.json'), 8192, VIDEO_SETTLEMENT_KEYS).value;
  for (const key of VIDEO_BASE_KEYS) if (s[key] !== i[key]) fail();
  if (
    !['NONE', 'CREATED', 'UNKNOWN'].includes(s.directory) ||
    !['NONE', 'PARTIAL', 'VERIFIED', 'UNKNOWN'].includes(s.upload) ||
    !['NONE', 'STARTED', 'EXITED', 'UNKNOWN'].includes(s.launch) ||
    !['NOT_REQUIRED', 'PENDING', 'CLEANED', 'UNKNOWN'].includes(s.cleanup) ||
    typeof s.localRetired !== 'boolean' ||
    typeof s.streamObserved !== 'boolean' ||
    ![
      'OK',
      'NOT_READY',
      'BUSY',
      'STALE_TARGET',
      'ADMISSION_REJECTED',
      'DEPLOYMENT_FAILED',
      'PROTOCOL_FAILED',
      'REMOTE_FAILED',
      'DEADLINE_EXCEEDED',
      'OUTCOME_UNKNOWN',
      'CLOSED',
    ].includes(s.code)
  )
    fail();
  const none =
    s.directory === 'NONE' &&
    s.upload === 'NONE' &&
    s.launch === 'NONE' &&
    s.cleanup === 'NOT_REQUIRED' &&
    s.streamObserved === false;
  const cleaned =
    s.directory === 'CREATED' &&
    s.cleanup === 'CLEANED' &&
    ['NONE', 'EXITED'].includes(s.launch) &&
    ['NONE', 'PARTIAL', 'VERIFIED'].includes(s.upload) &&
    (s.launch !== 'EXITED' || s.upload === 'VERIFIED') &&
    (!s.streamObserved || s.launch === 'EXITED');
  if (
    (s.directory === 'NONE' && !none) ||
    (s.cleanup === 'CLEANED' && !cleaned) ||
    (s.streamObserved && s.launch === 'NONE')
  )
    fail();
  if (requireClean && (!s.localRetired || s.code === 'OUTCOME_UNKNOWN' || !(none || cleaned)))
    fail();
}

function hostSession(root, header, receipt) {
  if (!receipt) fail();
  plain(root);
  if (
    path.basename(root) !== '.host-session' ||
    root.length > 184 ||
    path.join(root, 'profile').length > 192 ||
    path.join(root, 'bootstrap.json').length > 199 ||
    read(path.join(root, '.owner')) !== header.ownerToken
  )
    fail();
  const bootstrapFile = path.join(root, 'bootstrap.json');
  const bootstrapStat = fs.lstatSync(bootstrapFile);
  if (bootstrapStat.nlink !== 1 || bootstrapStat.size < 1 || bootstrapStat.size > 8192) fail();
  const rawBootstrap = read(bootstrapFile);
  if (Buffer.byteLength(rawBootstrap) > 8192) fail();
  const parsedBootstrap = canonical(rawBootstrap);
  const { value: b } = hostRecord(bootstrapFile, 8192, [
    'version',
    'operationSet',
    'sessionId',
    'launchId',
    'storeId',
    'ownerToken',
    'parentReceiptSha256',
    'readySha256',
    'runRoot',
    'adbPath',
    'adbExeSha256',
    'candidateArchiveSha256',
    'candidateManifestSha256',
    'installationRevision',
    'expectedRelease',
    'expectedBuildGrammar',
    'assets',
    ...(parsedBootstrap.version === 3 ? ['videoArtifact'] : []),
  ]);
  if (
    ![2, 3].includes(b.version) ||
    !['VERSION_ONLY', 'SERVER_ONLY'].includes(b.operationSet) ||
    !uuid(b.sessionId) ||
    b.launchId !== header.launchId ||
    b.storeId !== header.storeId ||
    b.ownerToken !== header.ownerToken ||
    b.parentReceiptSha256 !== receipt.sha256 ||
    b.readySha256 !== receipt.receipt.readySha256 ||
    b.runRoot !== root ||
    typeof b.adbPath !== 'string' ||
    path.resolve(b.adbPath) !== b.adbPath ||
    !hash(b.adbExeSha256) ||
    !hash(b.candidateArchiveSha256) ||
    !hash(b.candidateManifestSha256) ||
    !Number.isSafeInteger(b.installationRevision) ||
    b.installationRevision < 1 ||
    typeof b.expectedRelease !== 'string' ||
    b.expectedRelease.length > 32 ||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(b.expectedRelease) ||
    /[^0-9.]/.test(b.expectedRelease) ||
    b.expectedBuildGrammar !== 'DECIMAL_1_20' ||
    !b.assets ||
    typeof b.assets !== 'object'
  )
    fail();
  if (
    b.adbPath !==
    path.join(
      header.dataRoot,
      'platform-tools-runtime',
      'runtimes',
      `runtime-${b.candidateArchiveSha256}`,
      'adb.exe',
    )
  )
    fail();
  if (
    b.version === 3 &&
    b.videoArtifact !== null &&
    (!snapshotHostVideoArtifact(b.videoArtifact) || b.operationSet !== 'SERVER_ONLY')
  )
    fail();
  validateHostVideoJournal(root, rawBootstrap, false);
  const assetKeys =
    b.version === 3 ? [...HOST_ASSET_KEYS, 'native/RetainedVideoSession.cs'] : HOST_ASSET_KEYS;
  exact(b.assets, assetKeys);
  if (assetKeys.some((k) => !hash(b.assets[k]))) fail();
  let count = 0,
    bytes = 0;
  function scan(directory, depth) {
    if (depth > 8) fail();
    plain(directory);
    const list = fs.opendirSync(directory);
    try {
      for (;;) {
        const item = list.readSync();
        if (!item) break;
        if (
          ++count > 256 ||
          (depth === 0 &&
            ![
              '.owner',
              'bootstrap.json',
              'profile',
              'adb.log',
              'video-intent.json',
              'video-settlement.json',
            ].includes(item.name))
        )
          fail();
        const file = path.join(directory, item.name),
          stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) fail();
        if (stat.isDirectory()) {
          if (depth === 0 && item.name !== 'profile') fail();
          scan(file, depth + 1);
        } else if (stat.isFile()) {
          if (stat.nlink !== 1 || (depth === 0 && item.name === 'profile')) fail();
          bytes += stat.size;
          if (bytes > 64 * 1024 * 1024) fail();
        } else fail();
      }
    } finally {
      list.closeSync();
    }
  }
  plain(path.join(root, 'profile'));
  scan(root, 0);
}
function inventory(directory, profileNames = [], host = null) {
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
        const child = path.join(directory, item.name);
        if (host && item.name === '.host-session') {
          hostSession(child, host.header, host.receipt);
          entries.push(item.name);
          continue;
        }
        if (!profileNames.includes(item.name)) fail();
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
    receipt = hostParent(header, launch),
    names = inventory(launch, profileNames, { header, receipt }),
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
    'host-parent.json',
  ];
  for (const name of names) {
    if (
      !profileNames.includes(name) &&
      name !== '.host-session' &&
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
  const hostSessions = names.filter((name) => name === '.host-session');
  if (receipt && !intents.some((intent) => intent.stage === 'MAIN')) fail();
  return Object.freeze({
    header,
    hostSessions: Object.freeze(hostSessions),
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
    state.hostSessions.length ||
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
  if (['RELEASE', 'RECOVERY'].includes(stage) && state.hostSessions.length) fail();
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
  if (state.hostSessions.length) fail();
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
