'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { inventory, digest } = require('../launch/package-admission.cjs');
const {
  record,
  canonical,
  parseObservation,
  parseProduction,
  HOST_ZONES,
  assertOverridesAbsent,
} = require('./schedule-runtime-contract.cjs');
const desktop = path.resolve(__dirname, '..');
const repo = path.dirname(desktop);
const SOURCE_FILES = Object.freeze([
  '.github/workflows/phase-07-scheduler.yml',
  'desktop/verification/schedule-runtime-observer.cjs',
  'desktop/verification/schedule-runtime-contract.cjs',
  'desktop/verification/schedule-runtime-control.cjs',
  'desktop/verification/schedule-runtime-contract.test.cjs',
  'desktop/verification/Invoke-ScheduleRuntime.ps1',
  'desktop/verification/install-electron.mjs',
  'desktop/verification/WindowsBoundary.psm1',
  'desktop/verification/OwnedFiles.psm1',
  'desktop/launch/package-admission.cjs',
  'desktop/dependency-review.json',
  'desktop/package-lock.json',
  'tools/phase-00/HostProbeNative.cs',
  'desktop/verification/build-schedule-corpus.mjs',
  'desktop/verification/schedule-candidate-corpus.ts',
  'desktop/src/schedule-civil-contract.ts',
  'desktop/src/schedule-zone-contract.ts',
  'desktop/src/schedule-gap-contract.ts',
  'desktop/scripts/build.mjs',
  'desktop/scripts/verify-dependencies.mjs',
]);
let phase = 'HOST';
let captureFacts = [];
const fail = () => {
  throw new Error('SCHEDULE_RUNTIME_CONTROL_REJECTED');
};
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function plain(p, directory) {
  const s = fs.lstatSync(p);
  if (
    s.isSymbolicLink() ||
    (directory ? !s.isDirectory() : !s.isFile()) ||
    fs.realpathSync.native(p) !== path.resolve(p)
  )
    fail();
  return s;
}
function read(p, bound = 262144) {
  if (plain(p, false).size > bound) fail();
  return canonical(fs.readFileSync(p, 'utf8'), bound);
}
function write(p, value, bound = 262144) {
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > bound) fail();
  fs.writeFileSync(p, raw, { flag: 'wx' });
}
function owned(root) {
  if (
    path.resolve(root) !== root ||
    path.dirname(root) !== path.join(desktop, '.schedule-runtime') ||
    !/^run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path.basename(root))
  )
    fail();
  plain(path.dirname(root), true);
  plain(root, true);
  const marker = path.join(root, '.owner');
  if (plain(marker, false).size !== 36) fail();
  const token = fs.readFileSync(marker, 'utf8');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token)) fail();
  return token;
}
function facts() {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 4096,
      windowsHide: true,
    }).trim();
  const head = git(['rev-parse', 'HEAD']),
    tree = git(['rev-parse', 'HEAD^{tree}']);
  if (
    !/^[0-9a-f]{40}$/.test(head) ||
    !/^[0-9a-f]{40}$/.test(tree) ||
    git(['branch', '--show-current']) !== 'phase-07'
  )
    fail();
  const files = SOURCE_FILES.map((name) => ({
    path: name,
    sha256: digest(path.join(repo, name)).sha256,
  }));
  // Tracked harness bytes must belong to this exact source commit, not dirty overrides.
  git(['ls-files', '--error-unmatch', '--', ...SOURCE_FILES]);
  if (git(['status', '--porcelain', '--untracked-files=no', '--', ...SOURCE_FILES]) !== '') fail();
  return { head, tree, files };
}
function boundedInventory(root, count = 256, bytes = 512 * 1024 * 1024) {
  const result = inventory(root);
  if (
    result.files.length + result.directories.length > count ||
    result.total > bytes ||
    result.files.some((f) => f.path.split('/').length > 8 || f.bytes > 512 * 1024 * 1024) ||
    result.directories.some((d) => d.split('/').length > 8)
  )
    fail();
  return { ...result, directories: [...result.directories].sort() };
}
function copyTree(source, target, expected) {
  fs.mkdirSync(target);
  for (const directory of [...expected.directories].sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
  ))
    fs.mkdirSync(path.join(target, directory));
  for (const file of expected.files)
    fs.copyFileSync(
      path.join(source, file.path),
      path.join(target, file.path),
      fs.constants.COPYFILE_EXCL,
    );
  if (
    !equal(boundedInventory(target, 250, 512 * 1024 * 1024 - 65536), expected) ||
    !equal(boundedInventory(source, 250, 512 * 1024 * 1024 - 65536), expected)
  )
    fail();
}
function corpusBuild(hostZone) {
  if (!HOST_ZONES.includes(hostZone)) fail();
  const base = path.join(desktop, '.schedule-corpus-build'),
    file = path.join(base, 'manifest.json');
  const manifest = read(file, 16384);
  record(manifest, ['version', 'inputs', 'files']);
  const inputs = [
    'node_modules/@js-temporal/polyfill/dist/index.esm.js',
    'node_modules/jsbi/dist/jsbi-cjs.js',
    'src/schedule-civil-contract.ts',
    'src/schedule-gap-contract.ts',
    'src/schedule-zone-contract.ts',
    'verification/schedule-candidate-corpus.ts',
  ];
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.inputs) ||
    !Array.isArray(manifest.files) ||
    manifest.inputs.length !== inputs.length ||
    manifest.files.length !== 2
  )
    fail();
  manifest.inputs.forEach((input, i) => {
    record(input, ['path', 'sha256']);
    if (input.path !== inputs[i] || digest(path.join(desktop, input.path)).sha256 !== input.sha256)
      fail();
  });
  manifest.files.forEach((item, i) => {
    record(item, ['name', 'sha256', 'bytes']);
    if (
      item.name !== ['candidate.cjs', 'production.cjs'][i] ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 1 ||
      item.bytes > 450000
    )
      fail();
    const f = path.join(base, item.name);
    if (plain(f, false).size !== item.bytes || digest(f).sha256 !== item.sha256) fail();
  });
  return {
    hostZone,
    candidateSha256: manifest.files[0].sha256,
    productionSha256: manifest.files[1].sha256,
    manifestSha256: digest(file).sha256,
  };
}
function stage(root, head, tree, hostZone = null) {
  phase = 'OWNED';
  const token = owned(root);
  phase = 'SOURCE';
  const source = facts();
  if (
    source.head !== head ||
    source.tree !== tree ||
    !equal(read(path.join(root, 'install.json'), 1024), { version: 1, installedThisRun: true })
  )
    fail();
  phase = 'RUNTIME';
  const dist = path.join(desktop, 'node_modules/electron/dist');
  if (plain(path.join(dist, 'version'), false).size > 64) fail();
  if (fs.readFileSync(path.join(dist, 'version'), 'utf8').trim().replace(/^v/, '') !== '45.1.0')
    fail();
  const corpus = hostZone === null ? null : corpusBuild(hostZone);
  const runtime = boundedInventory(
    dist,
    corpus ? 248 : 250,
    512 * 1024 * 1024 - (corpus ? 1048576 : 65536),
  );
  if (
    runtime.files.some((f) => /^resources\/app(?:\/|\.asar$)/i.test(f.path)) ||
    runtime.directories.some((d) => d.toLowerCase() === 'resources/app')
  )
    fail();
  for (const name of ['electron.exe', 'LICENSE', 'LICENSES.chromium.html'])
    if (!runtime.files.some((f) => f.path === name && f.bytes > 0)) fail();
  const packageRoot = path.join(root, 'package');
  phase = 'COPY';
  copyTree(dist, packageRoot, runtime);
  phase = 'APP';
  const app = path.join(packageRoot, 'resources', 'app');
  fs.mkdirSync(app, { recursive: true });
  const observerSha256 = digest(path.join(__dirname, 'schedule-runtime-observer.cjs')).sha256;
  const contractSha256 = digest(path.join(__dirname, 'schedule-runtime-contract.cjs')).sha256;
  for (const name of ['schedule-runtime-observer.cjs', 'schedule-runtime-contract.cjs']) {
    if (plain(path.join(__dirname, name), false).size > 16384) fail();
    fs.copyFileSync(path.join(__dirname, name), path.join(app, name), fs.constants.COPYFILE_EXCL);
  }
  if (corpus)
    for (const name of ['candidate.cjs', 'production.cjs'])
      fs.copyFileSync(
        path.join(desktop, '.schedule-corpus-build', name),
        path.join(app, name),
        fs.constants.COPYFILE_EXCL,
      );
  write(
    path.join(app, 'package.json'),
    {
      name: 'fonesi-schedule-runtime-observation',
      version: '0.0.0',
      main: 'schedule-runtime-observer.cjs',
    },
    16384,
  );
  write(
    path.join(app, 'control.json'),
    {
      version: corpus ? 2 : 1,
      token,
      head,
      tree,
      observerSha256,
      contractSha256,
      ...(corpus ? { corpus } : {}),
    },
    16384,
  );
  const packaged = boundedInventory(packageRoot);
  phase = 'STATE';
  write(path.join(root, 'state.json'), {
    version: 1,
    token,
    source,
    runtime,
    packaged,
    observerSha256,
    contractSha256,
    ...(corpus ? { corpus } : {}),
  });
  return 'SCHEDULE_RUNTIME_STAGED';
}
function describeCaptureFraming(text) {
  if (typeof text !== 'string') return ['TYPE_INVALID'];
  const facts = [];
  if (Buffer.byteLength(text) > 16384) facts.push('OVER_OBSERVATION_LIMIT');
  if (text.startsWith('\uFEFF')) facts.push('LEADING_BOM');
  if (/^[ \t\r\n]/.test(text)) facts.push('LEADING_WHITESPACE');
  const lines = text.split(/\r?\n/);
  const nonempty = lines.filter((line) => line.trim().length > 0);
  facts.push(
    nonempty.length === 0
      ? 'NO_NONEMPTY_LINES'
      : nonempty.length === 1
        ? 'ONE_NONEMPTY_LINE'
        : 'MULTIPLE_NONEMPTY_LINES',
  );
  let valid = 0;
  for (const line of nonempty.slice(0, 32)) {
    try {
      parseObservation(line + '\n');
      valid++;
    } catch {}
  }
  facts.push(
    valid === 0
      ? 'NO_CANONICAL_OBSERVATION_LINE'
      : valid === 1
        ? 'ONE_CANONICAL_OBSERVATION_LINE'
        : 'MULTIPLE_CANONICAL_OBSERVATION_LINES',
  );
  if (lines.length > 33) facts.push('LINE_SCAN_BOUND');
  try {
    parseObservation(text.trim() + '\n');
    facts.push('TRIM_ONLY_CANONICAL');
  } catch {}
  const body = text.endsWith('\r\n')
    ? text.slice(0, -2)
    : text.endsWith('\n')
      ? text.slice(0, -1)
      : text;
  const category = (char) =>
    char === '{'
      ? 'OPEN_BRACE'
      : char === '}'
        ? 'CLOSE_BRACE'
        : /[ \t\r\n]/.test(char ?? '')
          ? 'WHITESPACE'
          : 'OTHER';
  facts.push('FIRST_' + category(body[0]), 'LAST_' + category(body.at(-1)));
  return facts;
}
function validateCapture(value, corpus = false) {
  phase = 'CAPTURE_PROCESS';
  record(value, [
    'status',
    'exitCode',
    'cleanupComplete',
    'stdoutTruncated',
    'stderrTruncated',
    'stdout',
    'stderr',
  ]);
  if (
    value.status !== 'SUCCESS' ||
    value.exitCode !== 0 ||
    Object.is(value.exitCode, -0) ||
    value.cleanupComplete !== true ||
    value.stdoutTruncated !== false ||
    value.stderrTruncated !== false ||
    typeof value.stderr !== 'string' ||
    Buffer.byteLength(value.stderr) > 32768
  )
    fail();
  phase = 'CAPTURE_FRAMING';
  captureFacts = describeCaptureFraming(value.stdout);
  return corpus ? parseProduction(value.stdout) : parseObservation(value.stdout);
}
// PowerShell capture is transport JSON, unlike canonical owned state and observer stdout.
// Flat fixed-schema grammar rejects duplicate decoded keys before normalization.
function parseCaptureTransport(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 131072) fail();
  const keys = [
    'status',
    'exitCode',
    'cleanupComplete',
    'stdoutTruncated',
    'stderrTruncated',
    'stdoutBase64',
    'stderrBase64',
  ];
  let offset = 0;
  const space = () => {
    while (offset < raw.length && /[ \t\r\n]/.test(raw[offset])) offset++;
  };
  const string = () => {
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
  };
  const out = {},
    seen = new Set();
  space();
  if (raw[offset++] !== '{') fail();
  for (let count = 0; count < 7; count++) {
    space();
    if (raw[offset] !== '"') fail();
    const key = string();
    if (!keys.includes(key) || seen.has(key)) fail();
    seen.add(key);
    space();
    if (raw[offset++] !== ':') fail();
    space();
    let value;
    if (raw[offset] === '"') value = string();
    else {
      const start = offset;
      while (offset < raw.length && !/[ \t\r\n,}]/.test(raw[offset])) offset++;
      if (start === offset) fail();
      value = JSON.parse(raw.slice(start, offset));
      if (
        value !== null &&
        typeof value !== 'boolean' &&
        (typeof value !== 'number' || !Number.isFinite(value))
      )
        fail();
    }
    out[key] = value;
    space();
    if (raw[offset++] !== (count === 6 ? '}' : ',')) fail();
  }
  space();
  if (offset !== raw.length) fail();
  return out;
}
function decodeCapture(value) {
  record(value, [
    'status',
    'exitCode',
    'cleanupComplete',
    'stdoutTruncated',
    'stderrTruncated',
    'stdoutBase64',
    'stderrBase64',
  ]);
  const decode = (raw) => {
    if (
      typeof raw !== 'string' ||
      raw.length > 43692 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)
    )
      fail();
    const bytes = Buffer.from(raw, 'base64'),
      text = bytes.toString('utf8');
    if (
      bytes.length > 32768 ||
      bytes.toString('base64') !== raw ||
      !Buffer.from(text, 'utf8').equals(bytes)
    )
      fail();
    return text;
  };
  const { stdoutBase64, stderrBase64, ...rest } = value;
  return { ...rest, stdout: decode(stdoutBase64), stderr: decode(stderrBase64) };
}
function validate(root) {
  phase = 'OWNED';
  const token = owned(root),
    state = read(path.join(root, 'state.json'));
  record(state, [
    'version',
    'token',
    'source',
    'runtime',
    'packaged',
    'observerSha256',
    'contractSha256',
    ...(state.corpus ? ['corpus'] : []),
  ]);
  if (state.version !== 1 || state.token !== token || !equal(state.source, facts())) fail();
  if (
    !equal(
      state.runtime,
      boundedInventory(
        path.join(desktop, 'node_modules/electron/dist'),
        state.corpus ? 248 : 250,
        512 * 1024 * 1024 - (state.corpus ? 1048576 : 65536),
      ),
    ) ||
    !equal(state.packaged, boundedInventory(path.join(root, 'package')))
  )
    fail();
  if (state.corpus && !equal(state.corpus, corpusBuild(state.corpus.hostZone))) fail();
  phase = 'CAPTURE_FILE';
  const captureFile = path.join(root, 'capture.json');
  if (plain(captureFile, false).size > 131072) fail();
  const encodedCapture = parseCaptureTransport(fs.readFileSync(captureFile, 'utf8'));
  phase = 'CAPTURE_ENCODING';
  const decodedCapture = decodeCapture(encodedCapture);
  const observation = validateCapture(decodedCapture, Boolean(state.corpus));
  if (state.corpus && observation.hostZone !== state.corpus.hostZone) fail();
  const exe = state.runtime.files.find((f) => f.path === 'electron.exe');
  if (!exe) fail();
  const report = {
    version: 1,
    kind: state.corpus ? 'SCHEDULE_PRODUCTION_RUN_REPORT' : 'SCHEDULE_RUNTIME_OBSERVATION_REPORT',
    source: state.source,
    runtime: {
      electronPackage: '45.1.0',
      exeSha256: exe.sha256,
      inventorySha256: sha(JSON.stringify(state.runtime)),
    },
    verificationPackage: {
      inventorySha256: sha(JSON.stringify(state.packaged)),
      observerSha256: state.observerSha256,
      contractSha256: state.contractSha256,
      ...(state.corpus ? { corpus: state.corpus } : {}),
    },
    process: { exitCode: 0, retirement: 'CONFIRMED', captureComplete: true },
    observation,
    disposition: state.corpus ? 'PRODUCTION_PROFILE_VERIFIED' : 'OBSERVED_NOT_ADMITTED',
  };
  phase = 'REPORT';
  write(path.join(root, 'report.json'), report, 32768);
  return 'SCHEDULE_RUNTIME_VALIDATED';
}
function campaign(root) {
  owned(root);
  const values = read(path.join(root, 'campaign.json'), 98304),
    source = facts();
  if (!Array.isArray(values) || values.length !== 3) fail();
  let runtime = null,
    semantic = null,
    bundles = null;
  for (let index = 0; index < 3; index++) {
    const value = values[index];
    record(value, [
      'version',
      'kind',
      'source',
      'runtime',
      'verificationPackage',
      'process',
      'observation',
      'disposition',
    ]);
    if (
      value.version !== 1 ||
      value.kind !== 'SCHEDULE_PRODUCTION_RUN_REPORT' ||
      !equal(value.source, source) ||
      value.disposition !== 'PRODUCTION_PROFILE_VERIFIED' ||
      !equal(value.process, { exitCode: 0, retirement: 'CONFIRMED', captureComplete: true })
    )
      fail();
    record(value.runtime, ['electronPackage', 'exeSha256', 'inventorySha256']);
    if (
      value.runtime.electronPackage !== '45.1.0' ||
      !/^[0-9a-f]{64}$/.test(value.runtime.exeSha256) ||
      !/^[0-9a-f]{64}$/.test(value.runtime.inventorySha256)
    )
      fail();
    record(value.verificationPackage, [
      'inventorySha256',
      'observerSha256',
      'contractSha256',
      'corpus',
    ]);
    if (
      !/^[0-9a-f]{64}$/.test(value.verificationPackage.inventorySha256) ||
      value.verificationPackage.observerSha256 !==
        digest(path.join(__dirname, 'schedule-runtime-observer.cjs')).sha256 ||
      value.verificationPackage.contractSha256 !==
        digest(path.join(__dirname, 'schedule-runtime-contract.cjs')).sha256
    )
      fail();
    const expected = corpusBuild(HOST_ZONES[index]);
    if (!equal(value.verificationPackage.corpus, expected)) fail();
    const result = require('./schedule-runtime-contract.cjs').validateProduction(value.observation);
    if (result.hostZone !== HOST_ZONES[index]) fail();
    if (
      index &&
      (!equal(runtime, value.runtime) || semantic !== result.production.corpus.semanticSha256)
    )
      fail();
    runtime = value.runtime;
    semantic = result.production.corpus.semanticSha256;
    bundles = {
      candidateSha256: expected.candidateSha256,
      productionSha256: expected.productionSha256,
      manifestSha256: expected.manifestSha256,
    };
  }
  write(
    path.join(root, 'report.json'),
    {
      version: 1,
      kind: 'SCHEDULE_PRODUCTION_CAMPAIGN_REPORT',
      source,
      runtime,
      bundles,
      runs: values.map((v) => ({
        verificationPackage: v.verificationPackage,
        process: v.process,
        result: v.observation,
      })),
      disposition: 'PRODUCTION_PROFILE_VERIFIED',
    },
    32768,
  );
  return 'SCHEDULE_CORPUS_CAMPAIGN_VALIDATED';
}
if (require.main === module) {
  try {
    if (process.platform !== 'win32' || process.arch !== 'x64' || process.version !== 'v24.22.1')
      fail();
    assertOverridesAbsent(process.env, process.execArgv);
    const [verb, root, head, tree] = process.argv.slice(2);
    const out =
      ['stage-utc', 'stage-la', 'stage-tokyo'].includes(verb) && process.argv.length === 6
        ? stage(
            root,
            head,
            tree,
            HOST_ZONES[['stage-utc', 'stage-la', 'stage-tokyo'].indexOf(verb)],
          )
        : verb === 'stage' && process.argv.length === 6
          ? stage(root, head, tree)
          : verb === 'campaign' && process.argv.length === 4
            ? campaign(root)
            : verb === 'validate' && process.argv.length === 4
              ? validate(root)
              : fail();
    console.log(out);
  } catch (error) {
    console.log('SCHEDULE_CONTROL_STAGE_' + phase);
    for (const fact of captureFacts) console.log('SCHEDULE_CAPTURE_FACT_' + fact);
    const reason = [
      'SCHEDULE_CAPTURE_FRAMING',
      'SCHEDULE_CAPTURE_LIMIT',
      'SCHEDULE_CAPTURE_GRAMMAR',
      'SCHEDULE_CAPTURE_REPRESENTATION',
      'SCHEDULE_CAPTURE_JSON',
      'SCHEDULE_CAPTURE_SCHEMA',
      'SCHEDULE_RUNTIME_REJECTED',
      'SCHEDULE_RUNTIME_CONTROL_REJECTED',
      'PACKAGE_REJECTED',
      'ENOENT',
      'EINVAL',
      'EPERM',
      'EACCES',
    ].find((code) => error?.code === code || error?.message === code);
    if (reason) console.log('SCHEDULE_CONTROL_REASON_' + reason);
    console.log('SCHEDULE_RUNTIME_CONTROL_FAILED');
    process.exitCode = 1;
  }
}
module.exports = {
  SOURCE_FILES,
  corpusBuild,
  campaign,
  boundedInventory,
  copyTree,
  validateCapture,
  decodeCapture,
  parseCaptureTransport,
  describeCaptureFraming,
};
