'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const {
  CASES,
  capture,
  canonical,
  parseObservation,
  validateObservation,
  assertOverridesAbsent,
} = require('./schedule-runtime-contract.cjs');
const {
  boundedInventory,
  copyTree,
  validateCapture,
  SOURCE_FILES,
} = require('./schedule-runtime-control.cjs');
const fixture = () => capture({ ...process.versions, electron: '45.1.0' }, {}, [], 'win32', 'x64');
const clone = (v) => JSON.parse(JSON.stringify(v));
const receipt = () => ({
  status: 'SUCCESS',
  exitCode: 0,
  cleanupComplete: true,
  stdoutTruncated: false,
  stderrTruncated: false,
  stdout: JSON.stringify(fixture()) + '\n',
  stderr: '',
});
function temporary(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fonesi-schedule-synthetic-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test('synthetic host tuple and actual Node Intl observations roundtrip without admitting Electron', () => {
  const value = fixture();
  assert.equal(value.cases.length, 8);
  assert.deepEqual(parseObservation(JSON.stringify(value) + '\n'), value);
  assert.deepEqual(parseObservation(JSON.stringify(value) + '\r\n'), value);
  assert.deepEqual(
    value.cases.map((r) => r.id),
    CASES.map((r) => r.id),
  );
  assert.equal(value.cases[0].parts.find((p) => p.type === 'hour').value, '07');
  assert.equal(value.cases[2].parts.find((p) => p.type === 'timeZoneName').value, 'GMT-5');
  assert.equal(value.cases[3].parts.find((p) => p.type === 'timeZoneName').value, 'GMT-4');
  assert.equal(value.cases[6].parts.find((p) => p.type === 'timeZoneName').value, 'GMT+10:30');
  assert.equal(value.cases[7].parts.find((p) => p.type === 'timeZoneName').value, 'GMT+11');
  assert.equal('admitted' in value, false);
});
test('canonical output rejects duplicate keys whitespace multiline truncation extra bytes and oversize', () => {
  const raw = JSON.stringify(fixture());
  for (const text of [
    raw,
    raw + '\n\n',
    raw + '\nextra\n',
    ' ' + raw + '\n',
    raw.slice(0, -1) + '\n',
    raw.replace('"version":1', '"version":1,"version":1') + '\n',
    'x'.repeat(16385) + '\n',
  ])
    assert.throws(() => parseObservation(text));
  assert.throws(() => canonical('{"a":1,"a":1}', 100));
  assert.throws(() => canonical('{"a": 1}', 100));
});
test('closed observation rejects extra fields missing versions tuple mismatch or unsafe version text', () => {
  for (const mutate of [
    (v) => {
      v.extra = true;
    },
    (v) => {
      delete v.versions.tz;
    },
    (v) => {
      v.versions.electron = '46.0.0';
    },
    (v) => {
      v.versions.icu = 78;
    },
    (v) => {
      v.versions.node = 'secret\npath';
    },
    (v) => {
      v.versions.v8 = 'x'.repeat(65);
    },
    (v) => {
      v.platform = 'linux';
    },
    (v) => {
      v.overrideAbsent = false;
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => validateObservation(value));
  }
});
test('fixed case order zone identities and bounded part schemas reject caller substitutions', () => {
  for (const mutate of [
    (v) => {
      v.cases.reverse();
    },
    (v) => {
      v.cases[0].parts.reverse();
    },
    (v) => {
      v.cases.pop();
    },
    (v) => {
      v.cases[1] = clone(v.cases[0]);
    },
    (v) => {
      v.cases[0].requestedZone = 'UTC';
    },
    (v) => {
      v.cases[0].resolvedZone = 'Etc/UTC';
    },
    (v) => {
      v.cases[0].parts.push({ type: 'literal', value: '/' });
    },
    (v) => {
      v.cases[0].parts[1] = v.cases[0].parts[0];
    },
    (v) => {
      v.cases[0].parts[0].value = 'x'.repeat(100);
    },
    (v) => {
      v.cases[0].parts[5].value = 'PRIVATE';
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => validateObservation(value));
  }
});
test('descriptor accessors never run and hostile object prototypes reject', () => {
  const value = fixture();
  let calls = 0;
  Object.defineProperty(value, 'versions', {
    enumerable: true,
    get() {
      calls++;
      return {};
    },
  });
  assert.throws(() => validateObservation(value));
  assert.equal(calls, 0);
  assert.throws(() => validateObservation(Object.assign(Object.create(null), fixture())));
  assert.throws(() =>
    validateObservation(
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw Error('private');
          },
        },
      ),
    ),
  );
});
test('all forbidden process override casings and exec arguments refuse before observation', () => {
  for (const key of [
    'NODE_OPTIONS',
    'node_path',
    'Node_Icu_Data',
    'ICU_DATA',
    'ESBUILD_BINARY_PATH',
    'ELECTRON_RUN_AS_NODE',
    'Electron_custom',
  ])
    assert.throws(() => assertOverridesAbsent({ [key]: '' }, []));
  assert.throws(() => assertOverridesAbsent({}, ['--inspect']));
  assert.doesNotThrow(() => assertOverridesAbsent({ TEMP: 'synthetic' }, []));
});
test('unknown retirement timeout nonzero exit and incomplete capture cannot produce report input', () => {
  assert.deepEqual(validateCapture(receipt()), fixture());
  for (const patch of [
    { status: 'TIMEOUT' },
    { status: 'NONZERO_EXIT' },
    { exitCode: 1 },
    { cleanupComplete: false },
    { stdoutTruncated: true },
    { stderrTruncated: true },
    { extra: true },
    { stdout: '{}\n' },
    { stderr: 'x'.repeat(32769) },
  ])
    assert.throws(() => validateCapture({ ...receipt(), ...patch }));
});
test('runtime inventory and copy verify exact bytes with finite entry byte and depth refusal', () =>
  temporary((root) => {
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    fs.mkdirSync(path.join(source, 'nested'));
    fs.writeFileSync(path.join(source, 'nested', 'fixture.bin'), 'synthetic-not-executable');
    const expected = boundedInventory(source);
    const target = path.join(root, 'copy');
    copyTree(source, target, expected);
    assert.deepEqual(boundedInventory(target), expected);
    assert.throws(() => boundedInventory(source, 1));
    assert.throws(() => boundedInventory(source, 256, 1));
    fs.writeFileSync(path.join(source, 'nested', 'fixture.bin'), 'changed');
    assert.throws(() => copyTree(source, path.join(root, 'tampered'), expected));
    assert.throws(() => copyTree(source, target, expected));
  }));
test('runtime inventory rejects link roots and nested junctions before staging', () =>
  temporary((root) => {
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    const other = path.join(root, 'other');
    fs.mkdirSync(other);
    fs.symlinkSync(
      other,
      path.join(source, 'link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    assert.throws(() => boundedInventory(source));
  }));
test('CLI refuses unknown command with fixed output and no staging', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'schedule-runtime-control.cjs'), 'unknown'],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, NODE_PATH: undefined, NODE_OPTIONS: undefined },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'SCHEDULE_RUNTIME_CONTROL_FAILED\n');
});
test('observation entry has no production imports window navigation network database or device execution', () => {
  const source = fs.readFileSync(path.join(__dirname, 'schedule-runtime-observer.cjs'), 'utf8');
  assert.doesNotMatch(
    source,
    /BrowserWindow|webContents|fetch\(|node:net|node:http|node:sqlite|node:child_process|main\.cjs|preload|adb|safeStorage/,
  );
  const imports = [...source.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(
    imports,
    ['./schedule-runtime-contract.cjs', 'electron', 'node:crypto', 'node:fs', 'node:path'].sort(),
  );
  assert.match(source, /app\.setPath/);
  assert.match(source, /process\.argv\.length !== 1/);
});
test('manual or explicit-marker exact-branch workflow retains only closed report and no privileged jobs', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/phase-07-scheduler.yml'),
    'utf8',
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/phase-07'/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(
    workflow,
    /pull_request:|secrets\.|id-token:|write-all|Invoke-Package|Invoke-Foundation/,
  );
  assert.match(
    workflow,
    /path: desktop\/\.schedule-runtime-public\/schedule-runtime-observation\.json/,
  );
  assert.match(workflow, /retention-days: 14/);
  assert.match(workflow, /if-no-files-found: error/);
  for (const item of SOURCE_FILES) assert.ok(!path.isAbsolute(item) && !item.includes('..'));
});
test('wrapper preserves owned job bounds and cannot publish until validated cleanup completes', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Invoke-ScheduleRuntime.ps1'), 'utf8');
  assert.match(source, /\$args.Count -ne 0/);
  assert.match(source, /Invoke-OwnedChild \$exe \(\[string\[\]\]@\(\)\) 30000 @\{\}/);
  assert.ok(
    source.indexOf('Remove-VerifiedOwnedRun $owner $allRetired') <
      source.indexOf("Write-New (Join-Path $public 'schedule-runtime-observation.json')"),
  );
  assert.match(source, /New-OwnedProfile \$owner 'source'/);
  assert.doesNotMatch(source, /--no-sandbox|ELECTRON_RUN_AS_NODE|Remove-Item|Invoke-Expression/);
});

test('PowerShell private base64 capture preserves apostrophes HTML and Unicode without public leakage', () => {
  const { decodeCapture } = require('./schedule-runtime-control.cjs');
  const raw = receipt();
  raw.stderr = "private ' <value> tiếng Việt";
  const { stdout, stderr, ...rest } = raw;
  const encoded = {
    ...rest,
    stdoutBase64: Buffer.from(stdout).toString('base64'),
    stderrBase64: Buffer.from(stderr).toString('base64'),
  };
  assert.deepEqual(decodeCapture(encoded), raw);
  assert.deepEqual(validateCapture(decodeCapture(encoded)), fixture());
  for (const value of [
    '!!!!',
    'Zg=',
    'Zh==',
    Buffer.from([0xff]).toString('base64'),
    'A'.repeat(43696),
  ])
    assert.throws(() => decodeCapture({ ...encoded, stderrBase64: value }));
  assert.throws(() => decodeCapture({ ...encoded, extra: 1 }));
});

function observerFixture(root, mutate = () => {}) {
  const crypto = require('node:crypto'),
    vm = require('node:vm'),
    { createRequire } = require('node:module');
  const run = path.join(root, 'run-00000000-0000-4000-8000-000000000001');
  const appRoot = path.join(run, 'package', 'resources', 'app');
  fs.mkdirSync(appRoot, { recursive: true });
  const token = '00000000-0000-4000-8000-000000000002';
  fs.writeFileSync(path.join(run, '.owner'), token);
  const profile = path.join(run, 'fonesi-auto-foundation-source');
  fs.mkdirSync(profile);
  fs.writeFileSync(path.join(profile, '.owner'), 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n');
  for (const name of ['schedule-runtime-contract.cjs', 'schedule-runtime-observer.cjs'])
    fs.copyFileSync(path.join(__dirname, name), path.join(appRoot, name));
  const hash = (name) =>
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(appRoot, name)))
      .digest('hex');
  const control = {
    version: 1,
    token,
    head: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    observerSha256: hash('schedule-runtime-observer.cjs'),
    contractSha256: hash('schedule-runtime-contract.cjs'),
  };
  fs.writeFileSync(path.join(appRoot, 'control.json'), JSON.stringify(control));
  const exe = path.join(run, 'package', 'electron.exe');
  fs.writeFileSync(exe, 'synthetic-non-executable');
  const proc = {
    platform: 'win32',
    arch: 'x64',
    argv: [exe],
    execPath: exe,
    execArgv: [],
    env: {},
    versions: { ...process.versions, electron: '45.1.0' },
  };
  const paths = [],
    exits = [],
    output = [];
  const app = { setPath: (...args) => paths.push(args), exit: (code) => exits.push(code) };
  const req = createRequire(path.join(appRoot, 'schedule-runtime-observer.cjs'));
  mutate({ run, appRoot, profile, control, proc, app });
  const source = fs.readFileSync(path.join(__dirname, 'schedule-runtime-observer.cjs'), 'utf8');
  vm.runInNewContext(
    source,
    {
      require: (name) =>
        name === 'electron'
          ? { app }
          : name === 'node:fs'
            ? { ...fs, writeSync: (fd, raw) => output.push({ fd, raw }) }
            : req(name),
      __dirname: appRoot,
      process: proc,
      Buffer,
      setTimeout,
      clearTimeout,
    },
    { timeout: 1000 },
  );
  return { paths, exits, output, run };
}
test('actual observer entry composes real filesystem hashes Intl and output with only Electron app mocked', () =>
  temporary((root) => {
    const result = observerFixture(root);
    assert.deepEqual(result.exits, [0]);
    assert.equal(result.paths.length, 4);
    assert.deepEqual(
      result.paths.map((p) => p[0]),
      ['userData', 'sessionData', 'logs', 'crashDumps'],
    );
    for (const [, p] of result.paths)
      assert.ok(p.startsWith(path.join(result.run, 'fonesi-auto-foundation-source') + path.sep));
    assert.equal(result.output.length, 1);
    assert.equal(result.output[0].fd, 1);
    assert.equal(parseObservation(result.output[0].raw).kind, 'SCHEDULE_RUNTIME_OBSERVATION');
  }));
test('actual observer refuses wrong owner source tamper profile marker arguments and runtime overrides', () => {
  for (const mutate of [
    ({ run }) => fs.writeFileSync(path.join(run, '.owner'), 'f'.repeat(36)),
    ({ appRoot }) =>
      fs.appendFileSync(path.join(appRoot, 'schedule-runtime-contract.cjs'), '\n//tamper'),
    ({ profile }) => fs.writeFileSync(path.join(profile, '.owner'), 'invalid'),
    ({ proc }) => proc.argv.push('--unexpected'),
    ({ proc }) => {
      proc.env.NODE_ICU_DATA = '';
    },
    ({ proc }) => {
      proc.versions.electron = '46.0.0';
    },
  ])
    temporary((root) => {
      const result = observerFixture(root, mutate);
      assert.deepEqual(result.exits, [1]);
      assert.deepEqual(result.output, [{ fd: 2, raw: 'SCHEDULE_RUNTIME_OBSERVATION_FAILED\n' }]);
    });
});

function controllerFixture(root) {
  const vm = require('node:vm'),
    { createRequire } = require('node:module');
  const repo = path.join(root, 'repo'),
    desktop = path.join(repo, 'desktop'),
    verification = path.join(desktop, 'verification');
  fs.mkdirSync(verification, { recursive: true });
  for (const name of SOURCE_FILES) {
    const destination = path.join(repo, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../..', name), destination);
  }
  const dist = path.join(desktop, 'node_modules/electron/dist');
  fs.mkdirSync(path.join(dist, 'resources'), { recursive: true });
  for (const [name, value] of [
    ['version', '45.1.0'],
    ['electron.exe', 'synthetic-not-executable'],
    ['LICENSE', 'synthetic-notice'],
    ['LICENSES.chromium.html', 'synthetic-notice'],
    ['resources/default_app.asar', 'synthetic-not-executable'],
  ])
    fs.writeFileSync(path.join(dist, name), value);
  const run = path.join(desktop, '.schedule-runtime', 'run-00000000-0000-4000-8000-000000000001');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, '.owner'), '00000000-0000-4000-8000-000000000002');
  fs.writeFileSync(
    path.join(run, 'install.json'),
    JSON.stringify({ version: 1, installedThisRun: true }),
  );
  const req = createRequire(path.join(__dirname, 'schedule-runtime-control.cjs'));
  const fakeGit = (exe, args) => {
    assert.equal(exe, 'git');
    if (args[0] === 'rev-parse') return args[1] === 'HEAD' ? 'a'.repeat(40) : 'b'.repeat(40);
    if (args[0] === 'branch') return 'phase-07';
    if (args[0] === 'ls-files' || args[0] === 'status') return '';
    throw Error('unexpected-git-command');
  };
  const mod = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, 'schedule-runtime-control.cjs'), 'utf8');
  // Expose lexical functions only in the test VM; production CLI surface is unchanged.
  const load = vm.runInThisContext(
    '(function(require,module,__dirname){' +
      source +
      '\nmodule.exports.testStage=stage;module.exports.testValidate=validate;})',
    { timeout: 1000 },
  );
  load(
    (name) => (name === 'node:child_process' ? { execFileSync: fakeGit } : req(name)),
    mod,
    verification,
  );
  const api = mod.exports;
  assert.equal(api.testStage(run, 'a'.repeat(40), 'b'.repeat(40)), 'SCHEDULE_RUNTIME_STAGED');
  const raw = receipt();
  const { stdout, stderr, ...rest } = raw;
  fs.writeFileSync(
    path.join(run, 'capture.json'),
    JSON.stringify({
      ...rest,
      stdoutBase64: Buffer.from(stdout).toString('base64'),
      stderrBase64: Buffer.from(stderr).toString('base64'),
    }),
  );
  return { api, run, repo, dist };
}
test('actual stage and validate compose filesystem package attestations and closed report with only Git source facts synthetic', () =>
  temporary((root) => {
    const { api, run } = controllerFixture(root);
    assert.equal(api.testValidate(run), 'SCHEDULE_RUNTIME_VALIDATED');
    const report = JSON.parse(fs.readFileSync(path.join(run, 'report.json'), 'utf8'));
    assert.equal(report.disposition, 'OBSERVED_NOT_ADMITTED');
    assert.equal(report.source.head, 'a'.repeat(40));
    assert.equal(report.observation.cases.length, 8);
    assert.deepEqual(Object.keys(report), [
      'version',
      'kind',
      'source',
      'runtime',
      'verificationPackage',
      'process',
      'observation',
      'disposition',
    ]);
    assert.equal(JSON.stringify(report).includes(root), false);
    assert.ok(fs.statSync(path.join(run, 'report.json')).size < 32768);
    assert.throws(() => api.testValidate(run)); // CreateNew result cannot overwrite prior evidence.
  }));
test('actual validate refuses changed source package runtime owner and nonretired capture before report', () => {
  for (const mutate of [
    ({ repo }) => fs.appendFileSync(path.join(repo, SOURCE_FILES[1]), '\n// changed'),
    ({ run }) => fs.appendFileSync(path.join(run, 'package', 'electron.exe'), 'changed'),
    ({ dist }) => fs.appendFileSync(path.join(dist, 'electron.exe'), 'changed'),
    ({ run }) => fs.writeFileSync(path.join(run, '.owner'), 'f'.repeat(36)),
    ({ run }) => {
      const p = path.join(run, 'capture.json'),
        v = JSON.parse(fs.readFileSync(p, 'utf8'));
      v.cleanupComplete = false;
      fs.writeFileSync(p, JSON.stringify(v));
    },
  ])
    temporary((root) => {
      const context = controllerFixture(root);
      mutate(context);
      assert.throws(() => context.api.testValidate(context.run));
      assert.equal(fs.existsSync(path.join(context.run, 'report.json')), false);
    });
});

test('only exact reviewed push paths and identical explicit opt-in predicates permit observation and upload', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/phase-07-scheduler.yml'),
    'utf8',
  );
  const paths = [...workflow.matchAll(/^ {6}- '([^']+)'$/gm)].map((m) => m[1]);
  assert.deepEqual(paths, [
    '.github/workflows/phase-07-scheduler.yml',
    'desktop/verification/Invoke-ScheduleRuntime.ps1',
    'desktop/verification/schedule-runtime-observer.cjs',
    'desktop/verification/schedule-runtime-contract.cjs',
    'desktop/verification/schedule-runtime-control.cjs',
    'desktop/verification/schedule-runtime-contract.test.cjs',
  ]);
  assert.match(workflow, /branches: \[phase-07\]/);
  const gate =
    "(github.event_name == 'workflow_dispatch' && inputs.observe_runtime == true) || (github.event_name == 'push' && contains(github.event.head_commit.message, '[schedule-runtime-observe]'))";
  const conditions = [...workflow.matchAll(/^ {8}if: (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(conditions, [gate, `success() && (${gate})`]);
  const permit = (event, input, message, branch, changed) =>
    branch === 'phase-07' &&
    (event === 'workflow_dispatch'
      ? input === true
      : event === 'push' &&
        paths.includes(changed) &&
        message.includes('[schedule-runtime-observe]'));
  for (const [event, input, message, branch, changed, want] of [
    ['push', false, 'ordinary', 'phase-07', paths[0], false],
    ['push', false, '[schedule-runtime-observe]', 'phase-03', paths[0], false],
    ['push', false, '[schedule-runtime-observe]', 'phase-07', 'docs/PHASE_STATUS.md', false],
    ['push', false, '[schedule-runtime-observe]', 'phase-07', paths[0], true],
    ['workflow_dispatch', false, '', 'phase-07', paths[0], false],
    ['workflow_dispatch', true, '', 'phase-07', paths[0], true],
    ['pull_request', true, '[schedule-runtime-observe]', 'phase-07', paths[0], false],
  ])
    assert.equal(permit(event, input, message, branch, changed), want);
});
