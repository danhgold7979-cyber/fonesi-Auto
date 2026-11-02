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
]);
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
function stage(root, head, tree) {
  const token = owned(root),
    source = facts();
  if (
    source.head !== head ||
    source.tree !== tree ||
    !equal(read(path.join(root, 'install.json'), 1024), { version: 1, installedThisRun: true })
  )
    fail();
  const dist = path.join(desktop, 'node_modules/electron/dist');
  if (plain(path.join(dist, 'version'), false).size > 64) fail();
  if (fs.readFileSync(path.join(dist, 'version'), 'utf8').trim().replace(/^v/, '') !== '45.1.0')
    fail();
  const runtime = boundedInventory(dist, 250, 512 * 1024 * 1024 - 65536);
  if (
    runtime.files.some((f) => /^resources\/app(?:\/|\.asar$)/i.test(f.path)) ||
    runtime.directories.some((d) => d.toLowerCase() === 'resources/app')
  )
    fail();
  for (const name of ['electron.exe', 'LICENSE', 'LICENSES.chromium.html'])
    if (!runtime.files.some((f) => f.path === name && f.bytes > 0)) fail();
  const packageRoot = path.join(root, 'package');
  copyTree(dist, packageRoot, runtime);
  const app = path.join(packageRoot, 'resources', 'app');
  fs.mkdirSync(app, { recursive: true });
  const observerSha256 = digest(path.join(__dirname, 'schedule-runtime-observer.cjs')).sha256;
  const contractSha256 = digest(path.join(__dirname, 'schedule-runtime-contract.cjs')).sha256;
  for (const name of ['schedule-runtime-observer.cjs', 'schedule-runtime-contract.cjs']) {
    if (plain(path.join(__dirname, name), false).size > 16384) fail();
    fs.copyFileSync(path.join(__dirname, name), path.join(app, name), fs.constants.COPYFILE_EXCL);
  }
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
    { version: 1, token, head, tree, observerSha256, contractSha256 },
    16384,
  );
  const packaged = boundedInventory(packageRoot);
  write(path.join(root, 'state.json'), {
    version: 1,
    token,
    source,
    runtime,
    packaged,
    observerSha256,
    contractSha256,
  });
  return 'SCHEDULE_RUNTIME_STAGED';
}
function validateCapture(value) {
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
    value.cleanupComplete !== true ||
    value.stdoutTruncated !== false ||
    value.stderrTruncated !== false ||
    typeof value.stderr !== 'string' ||
    Buffer.byteLength(value.stderr) > 32768
  )
    fail();
  return parseObservation(value.stdout);
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
  ]);
  if (state.version !== 1 || state.token !== token || !equal(state.source, facts())) fail();
  if (
    !equal(
      state.runtime,
      boundedInventory(
        path.join(desktop, 'node_modules/electron/dist'),
        250,
        512 * 1024 * 1024 - 65536,
      ),
    ) ||
    !equal(state.packaged, boundedInventory(path.join(root, 'package')))
  )
    fail();
  const observation = validateCapture(decodeCapture(read(path.join(root, 'capture.json'), 131072)));
  const exe = state.runtime.files.find((f) => f.path === 'electron.exe');
  if (!exe) fail();
  const report = {
    version: 1,
    kind: 'SCHEDULE_RUNTIME_OBSERVATION_REPORT',
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
    },
    process: { exitCode: 0, retirement: 'CONFIRMED', captureComplete: true },
    observation,
    disposition: 'OBSERVED_NOT_ADMITTED',
  };
  write(path.join(root, 'report.json'), report, 32768);
  return 'SCHEDULE_RUNTIME_VALIDATED';
}
if (require.main === module) {
  try {
    if (process.platform !== 'win32' || process.arch !== 'x64' || process.version !== 'v24.22.1')
      fail();
    assertOverridesAbsent(process.env, process.execArgv);
    const [verb, root, head, tree] = process.argv.slice(2);
    const out =
      verb === 'stage' && process.argv.length === 6
        ? stage(root, head, tree)
        : verb === 'validate' && process.argv.length === 4
          ? validate(root)
          : fail();
    console.log(out);
  } catch {
    console.log('SCHEDULE_RUNTIME_CONTROL_FAILED');
    process.exitCode = 1;
  }
}
module.exports = { SOURCE_FILES, boundedInventory, copyTree, validateCapture, decodeCapture };
