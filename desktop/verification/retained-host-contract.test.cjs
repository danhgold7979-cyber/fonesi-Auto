'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm');
const { createHash } = require('node:crypto');
const {
  CASES,
  SCOPE,
  DIAGNOSTICS,
  PIPE_FIELDS,
  PIPE_MODES,
  PIPE_DIAGNOSTICS,
  pipeDiagnostic,
  PROGRESS,
  progressDiagnostic,
  contextDiagnostic,
  deriveMain,
  validateResult,
} = require('./retained-host-contract.cjs');
const observer = path.join(__dirname, 'retained-host-main-probe.cjs'),
  hash = (b) => createHash('sha256').update(b).digest('hex');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('exact derived main insertion preserves every original byte and binds actual compiled anchor', () => {
  const raw = fs.readFileSync(path.join(__dirname, '../build/main.cjs'), 'utf8'),
    derived = deriveMain(raw, observer);
  assert.equal(raw.split('const setup = platformToolsService;').length, 2);
  assert.equal(derived.split('.bindContext(Object.freeze(').length, 2);
  assert.ok(derived.includes('entry:ownedEntry,runtimeCustody,setup,assertOwnedSync:'));
  assert.throws(() =>
    deriveMain(raw.replace('const setup = platformToolsService;', 'const setup = null;'), observer),
  );
  assert.throws(() => deriveMain(raw, `${observer}.other`));
});
test('fixed result requires all13 true and rejects extras and type coercion', () => {
  const valid = {
    version: 1,
    scope: SCOPE,
    cases: Object.fromEntries(CASES.map((k) => [k, true])),
    readyCount: 1,
    closedCount: 1,
  };
  assert.equal(validateResult(valid).passed, true);
  for (const key of CASES)
    assert.equal(
      validateResult({ ...valid, cases: { ...valid.cases, [key]: false } }).passed,
      false,
    );
  assert.throws(() => validateResult({ ...valid, path: 'private' }));
  assert.throws(() => validateResult({ ...valid, cases: { ...valid.cases, versionObserved: 1 } }));
});
function serviceSuccessTransition() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/main/platform-tools-setup-service.ts'),
    'utf8',
  );
  const matches = [...source.matchAll(/if \(result\.ok\) (publish\('VERIFIED_LOCAL', [^;]+\));/g)];
  assert.equal(matches.length, 1);
  let snapshot;
  vm.runInNewContext(matches[0][1], {
    result: { revision: 1 },
    publish(state, code, installationRevision) {
      snapshot = { state, code, installationRevision };
    },
  });
  assert.deepEqual(snapshot, { state: 'VERIFIED_LOCAL', code: null, installationRevision: 1 });
  return snapshot;
}
async function simulatedObserver(wrongParent = false, fault = null) {
  const root = fs.realpathSync.native(
      fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'retained-observer-')),
    ),
    managed = path.join(root, 'first-use', `Fonesi-Auto-${id(1)}`),
    launch = path.join(managed, `launch-${id(2)}`),
    profile = path.join(launch, 'profile');
  fs.mkdirSync(profile, { recursive: true });
  for (const p of [root, managed, launch]) fs.writeFileSync(path.join(p, '.owner'), id(3));
  const raw = fs.readFileSync(path.join(__dirname, '../build/main.cjs'), 'utf8');
  fs.writeFileSync(
    path.join(root, 'copy.json'),
    JSON.stringify({
      originalMainSha256: hash(raw),
      derivedMainSha256: hash(deriveMain(raw, observer)),
    }),
  );
  const entry = { storeId: id(4), ownerToken: id(5) };
  fs.writeFileSync(
    path.join(launch, 'host-parent.json'),
    JSON.stringify({ parentPid: wrongParent ? 100 : 200, ...entry }),
  );
  const events = {},
    stderr = [],
    messages = [],
    requests = [];
  let state = 'UNAVAILABLE',
    revision = 0,
    installed = 0,
    closed = false,
    executed = 0,
    bound = false;
  const custody = {
    retired: true,
    async acquireRead() {
      return {
        ok: true,
        status: 'READ_VERIFIED_ONLY',
        token: {},
        observation: { release: '37.0.1', installationRevision: 1 },
      };
    },
    async releaseRead() {
      return { ok: true, status: 'RETIRED' };
    },
  };
  let done;
  const finished = new Promise((r) => {
    done = r;
  });
  const electron = {
    safeStorage: {},
    dialog: {},
    shell: {},
    app: {
      on(k, fn) {
        events[k] = fn;
      },
      exit(code) {
        done({ code });
      },
      quit() {
        sandbox.console.log('BOOTSTRAP_CLOSED');
        events['will-quit']();
        done({ code: 0 });
      },
    },
  };
  const setup = {
    retired: true,
    async execute(r) {
      requests.push(r);
      if (r.method === 'platformTools.setup.request') {
        for (const [i, buttons] of [
          ['Hủy', 'Mở điều khoản', 'Tôi đã đọc và đồng ý'],
          ['Hủy', 'Chọn tệp ZIP', 'Tải từ Google'],
          ['Hủy', 'Xác nhận thiết lập'],
        ].entries()) {
          const answer = await electron.dialog.showMessageBox({
            title: 'Thiết lập Android Platform Tools',
            defaultId: 0,
            cancelId: 0,
            buttons,
          });
          assert.equal(answer.response, [2, 1, 1][i]);
          if (i === 1)
            assert.equal(
              (
                await electron.dialog.showOpenDialog({
                  title: 'Chọn Android Platform Tools 37.0.1 ZIP',
                  properties: ['openFile'],
                })
              ).filePaths[0],
              path.join(root, 'official.zip'),
            );
        }
        state = 'VERIFIED_LOCAL';
        revision++;
        installed = 1;
        return JSON.stringify({ ok: true, outcome: 'PENDING' });
      }
      return JSON.stringify({
        ok: true,
        outcome: 'OBSERVED',
        snapshot: {
          state,
          revision,
          installationRevision: installed,
          code: installed ? serviceSuccessTransition().code : null,
        },
      });
    },
  };
  const factory = {
    grant() {
      return {};
    },
    async execute(_cap, r) {
      executed++;
      assert.equal(r.operation, 'HOST_VERSION');
      return fault
        ? { outcome: 'OUTCOME_UNKNOWN', code: 'DEADLINE' }
        : { outcome: 'OBSERVED', code: 'OK' };
    },
    async close() {
      closed = true;
      return 'RETIRED';
    },
    get retired() {
      return closed;
    },
    get evidence() {
      return {
        helperState: closed ? 'EXITED' : 'RUNNING',
        phase: 'NONE',
        exit: closed ? 'ZERO' : 'NONE',
        directoryCleanup: closed,
        ...(fault?.evidence ?? {}),
      };
    },
  };
  const module = { exports: {} };
  class FakeModule {
    static _nodeModulePaths() {
      return [];
    }
    _compile(derived, filename) {
      assert.equal(filename, path.resolve(__dirname, '../build/main.cjs'));
      assert.equal(derived, deriveMain(raw, observer));
      module.exports.bindContext(
        Object.freeze({ entry, runtimeCustody: custody, setup, assertOwnedSync() {} }),
      );
      bound = true;
      sandbox.console.log('BOOTSTRAP_READY');
    }
  }
  const fsProxy = {
    ...fs,
    writeSync(fd, ...args) {
      if (fd === 2) {
        stderr.push(args[0]);
        return Buffer.byteLength(args[0]);
      }
      return fs.writeSync(fd, ...args);
    },
  };
  const sandbox = {
    module,
    exports: module.exports,
    __dirname,
    __filename: observer,
    Buffer,
    TextDecoder,
    setTimeout,
    clearTimeout,
    setImmediate,
    process: { pid: 200, env: { FONESI_BOOTSTRAP_ROOT: profile, SystemRoot: root } },
    console: {
      log(...a) {
        messages.push(a);
      },
    },
    require(name) {
      if (name === 'electron') return electron;
      if (name === 'node:fs') return fsProxy;
      if (name === 'node:module') return FakeModule;
      if (name === './retained-pipe-startup.cjs')
        return {
          async runPairedStartup(options) {
            assert.equal(options.root, root);
            assert.equal(options.owner, id(3));
            assert.deepEqual(Object.keys(options.environment), [
              'SystemRoot',
              'WINDIR',
              'TEMP',
              'TMP',
            ]);
            options.assertOwned();
            const row = () =>
              Object.freeze({
                ...Object.fromEntries(PIPE_FIELDS.map((k) => [k, k !== 'directoryCleanup'])),
                input: 'Q',
                outcome: 'COMPLETE',
              });
            return (
              fault?.pair ??
              Object.freeze(Object.fromEntries(PIPE_MODES.map((mode) => [mode, row()])))
            );
          },
        };
      if (name === './fleet-ui-schema4.cjs') return { observeSchema4: async () => true };
      if (name === '../build/adb-host-factory.cjs')
        return {
          createHostFactory(options) {
            assert.equal(options.runtimeCustody, custody);
            assert.equal(options.entry, entry);
            return factory;
          },
        };
      return require(name);
    },
  };
  sandbox.require.main = {};
  vm.runInNewContext(fs.readFileSync(observer, 'utf8'), sandbox, { filename: observer });
  // Entry must start under Electron's dynamic-import semantics, without a manual call.
  try {
    const result = await finished;
    return {
      ...result,
      executed,
      bound,
      stderr,
      requests,
      result: fs.existsSync(path.join(root, 'retained-host-result.json'))
        ? JSON.parse(fs.readFileSync(path.join(root, 'retained-host-result.json')))
        : null,
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test('actual CJS entry starts through dynamic import, not require.main', () => {
  const { spawnSync } = require('node:child_process');
  const { pathToFileURL } = require('node:url');
  const script = `import Module from 'node:module';
const original = Module._load;
const sentinel = new Error('ENTRY_STARTED');
Module._load = function(id, ...args) {
  if (id === 'electron') throw sentinel;
  return original.call(this, id, ...args);
};
try { await import(${JSON.stringify(pathToFileURL(observer).href)}); process.exitCode = 2; }
catch (error) { process.exitCode = error === sentinel ? 0 : 3; }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    shell: false,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 4096,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
test('actual observer control flow uses captured same-main custody and one VERSION then EOF close with injected facts', async () => {
  const r = await simulatedObserver();
  assert.equal(r.code, 0, r.stderr.join(''));
  assert.equal(r.executed, 1);
  assert.equal(r.bound, true);
  assert.equal(validateResult(r.result).passed, true);
  assert.equal(r.stderr.length, Object.keys(PIPE_DIAGNOSTICS).length);
  assert.ok(r.stderr.every((line) => line.startsWith('RETAINED_HOST_DIAGNOSTIC_PIPE_')));
});
test('actual observer wrong parent refuses before factory VERSION and emits finite phase only', async () => {
  const r = await simulatedObserver(true);
  assert.equal(r.code, 1);
  assert.equal(r.executed, 0);
  assert.equal(r.result, null);
  assert.equal(r.stderr.length, Object.keys(DIAGNOSTICS).length + 1);
  assert.equal(r.stderr[0], 'RETAINED_HOST_DIAGNOSTIC_REASON_RETAINED_HOST_PARENT\n');
  assert.equal(r.stderr.at(-1), 'RETAINED_HOST_PHASE_ADMISSION\nRETAINED_HOST_FAILED\n');
  assert.ok(r.stderr.slice(1, -1).every((x) => x.endsWith('_UNAVAILABLE\n')));
});

test('diagnostics never invoke getters or echo hostile error objects', () => {
  const { reason } = require('./retained-host-contract.cjs');
  assert.equal(
    reason(
      new Proxy(
        {},
        {
          getOwnPropertyDescriptor() {
            throw Error('private');
          },
        },
      ),
    ),
    'UNCLASSIFIED',
  );
  assert.equal(
    reason({
      get message() {
        throw Error('private');
      },
    }),
    'UNCLASSIFIED',
  );
  assert.equal(reason(Error('private path')), 'UNCLASSIFIED');
});
test('fixed context diagnostics classify compiled owned-file refusal without exposing private facts', () => {
  const file = path.resolve(__dirname, '../build/adb-host-factory.cjs');
  const source =
      fs.readFileSync(file, 'utf8') +
      '\nmodule.exports.probe = function createHostFactory(path) { hostPlain(path); };\n',
    digest = hash(source);
  const Module = require('node:module');
  const probe = new Module(file, module);
  probe.filename = file;
  probe.paths = Module._nodeModulePaths(path.dirname(file));
  probe._compile(source, file);
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'private-context-')),
  );
  const exe = path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, 'synthetic OS image');
  fs.linkSync(exe, path.join(root, 'other-link'));
  try {
    let thrown;
    try {
      const check = probe.exports.probe;
      check(exe);
    } catch (error) {
      thrown = error;
    }
    assert.equal(thrown?.message, 'HOST_CONTEXT_REJECTED');
    const system = {
      SYSTEMREGULAR: true,
      SYSTEMREPARSE: false,
      SYSTEMSINGLELINK: false,
      SYSTEMCANONICAL: true,
    };
    const result = contextDiagnostic(thrown, source, file, digest, system);
    assert.equal(result.CONTEXTSITE, 'SITE_02');
    assert.equal(result.CONTEXTCALLER, 'createHostFactory');
    assert.equal(result.SYSTEMSINGLELINK, 'NO');
    assert.equal(result.SYSTEMREGULAR, 'YES');
    let touched = 0;
    const hostile = Error('HOST_CONTEXT_REJECTED');
    Object.defineProperty(hostile, 'name', {
      get() {
        touched++;
        throw Error('PRIVATE');
      },
    });
    assert.ok(
      Object.values(contextDiagnostic(hostile, source, file, digest, system)).every(
        (v) => v === 'UNAVAILABLE',
      ),
    );
    assert.equal(touched, 0);
    const initial = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
    try {
      Object.defineProperty(Error, 'prepareStackTrace', {
        configurable: true,
        value() {
          touched++;
          throw Error('PRIVATE');
        },
      });
      assert.ok(
        Object.values(contextDiagnostic(thrown, source, file, digest, system)).every(
          (v) => v === 'UNAVAILABLE',
        ),
      );
      assert.equal(touched, 0);
    } finally {
      if (initial) Object.defineProperty(Error, 'prepareStackTrace', initial);
      else delete Error.prepareStackTrace;
    }

    assert.doesNotMatch(JSON.stringify(result), /private-context|powershell|HOST_CONTEXT_REJECTED/);
    for (const [bad, pin] of [
      [thrown, '0'.repeat(64)],
      [
        {
          message: 'HOST_CONTEXT_REJECTED',
          get stack() {
            throw Error('PRIVATE');
          },
        },
        digest,
      ],
      [
        new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              throw Error('PRIVATE');
            },
          },
        ),
        digest,
      ],
      [
        { message: 'HOST_CONTEXT_REJECTED', stack: 'Error: HOST_CONTEXT_REJECTED\nPRIVATE' },
        digest,
      ],
    ]) {
      assert.ok(
        Object.values(contextDiagnostic(bad, source, file, pin, system)).every(
          (v) => v === 'UNAVAILABLE',
        ),
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('campaign is default-off, source-dependent and keeps managed success before one VERSION with strict artifacts', () => {
  const raw = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/phase-02-software.yml'),
    'utf8',
  );
  const check = (input) => {
    const text = input.replaceAll('\r\n', '\n'),
      job = text.split('  owned-retained-version-development:\n')[1];
    assert.ok(job);
    assert.match(job, /needs: windows-software-only/);
    assert.match(
      job,
      /if: \(github.event_name == 'workflow_dispatch' && inputs.run_retained_version\) \|\| \(github.event_name == 'push' && github.ref == 'refs\/heads\/phase-02' && contains\(github.event.head_commit.message, '\[retained-version\]'\)\)/,
    );
    assert.match(text, /run_retained_version:\n[\s\S]*?default: false/);
    assert.ok(
      job.indexOf('Strictly publish managed compilation') <
        job.indexOf('Download one exact official'),
    );
    const native = job
      .split('      - name: Actual owned SOURCE private VERSION')[1]
      .split('      - name:')[0];
    assert.doesNotMatch(native, /if:|continue-on-error/);
    assert.match(native, /Invoke-RetainedHostCheck.ps1/);
    assert.equal((job.match(/fetch_platform_tools.py/g) || []).length, 1);
    assert.doesNotMatch(
      job,
      /Invoke-(RecipientSetup|FleetUI|IsolatedAdbServer|PlatformToolsVersion)\.ps1/,
    );
    assert.match(job, /steps.retained_managed_validation.outputs.written == 'true'/);
    assert.match(job, /steps.retained_host_validation.outputs.written == 'true'/);
    assert.doesNotMatch(job, /path:.*(?:\.exe|\.dll|\.zip|\*\*)/);
    assert.match(job, /path: desktop\/retained-managed-validated\.json/);
    assert.doesNotMatch(job, /include-hidden-files: true/);
  };
  for (const fixture of [raw, raw.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')]) {
    check(fixture);
    const normalized = fixture.replaceAll('\r\n', '\n');
    const wrongGate = normalized.replace('inputs.run_retained_version)', 'true)');
    assert.notEqual(wrongGate, normalized);
    assert.throws(() => check(wrongGate));
    const always = normalized.replace(
      '      - name: Actual owned SOURCE private VERSION and EOF retirement only\n        run:',
      '      - name: Actual owned SOURCE private VERSION and EOF retirement only\n        if: always()\n        run:',
    );
    assert.notEqual(always, normalized);
    assert.throws(() => check(always));
  }
});

test('complete progress vector uses only exact frozen evidence and never reads accessors', () => {
  assert.equal(PROGRESS.length, 19);
  const seen = Object.freeze(['BOOTSTRAP_ENVIRONMENT', 'READER_REQUEST_ACCEPTED', 'NATIVE_LAUNCH']);
  const facts = progressDiagnostic({ progress: seen, requestWriteCompleted: true });
  assert.equal(Object.keys(facts).length, 20);
  assert.equal(facts.REQUESTWRITE, 'YES');
  for (const name of PROGRESS)
    assert.equal(facts[`PROGRESS_${name}`], seen.includes(name) ? 'YES' : 'NO');
  assert.equal(
    progressDiagnostic({ progress: Object.freeze([]), requestWriteCompleted: false }).REQUESTWRITE,
    'NO',
  );
  for (const evidence of [
    null,
    {},
    { progress: ['BOOTSTRAP_CONTEXT'] },
    { progress: Object.freeze(['PRIVATE/PATH']) },
    { progress: Object.freeze(['NATIVE_EXIT', 'NATIVE_EXIT']) },
    {
      get progress() {
        throw Error('PRIVATE');
      },
    },
  ]) {
    assert.ok(
      Object.entries(progressDiagnostic(evidence))
        .filter(([k]) => k !== 'REQUESTWRITE')
        .every(([, v]) => v === 'UNAVAILABLE'),
    );
  }
  let touched = 0;
  const array = [];
  Object.defineProperty(array, '0', {
    enumerable: true,
    get() {
      touched++;
      return 'NATIVE_EXIT';
    },
  });
  Object.freeze(array);
  assert.ok(
    Object.values(
      progressDiagnostic({
        progress: array,
        get requestWriteCompleted() {
          touched++;
          return true;
        },
      }),
    ).every((v) => v === 'UNAVAILABLE'),
  );
  assert.equal(touched, 0);
  assert.deepEqual(
    Object.keys(DIAGNOSTICS).filter((k) => k.startsWith('PROGRESS_')),
    PROGRESS.map((name) => `PROGRESS_${name}`),
  );
});
test('actual observer deadline failure emits each observed progress bit and request-write without raw values', async () => {
  const seen = Object.freeze([
    'BOOTSTRAP_ENVIRONMENT',
    'BOOTSTRAP_CONTEXT',
    'BOOTSTRAP_COMPILE_BEGIN',
    'BOOTSTRAP_COMPILE_END',
    'BOOTSTRAP_READER',
    'READER_REQUEST_ACCEPTED',
    'READER_PROVIDER_ENTERED',
    'NATIVE_ADMISSION',
  ]);
  const result = await simulatedObserver(false, {
    evidence: { progress: seen, requestWriteCompleted: true },
  });
  assert.equal(result.code, 1);
  assert.equal(result.result, null);
  assert.equal(result.executed, 1);
  assert.equal(result.stderr.length, Object.keys(DIAGNOSTICS).length + 1);
  for (const name of PROGRESS)
    assert.ok(
      result.stderr.includes(
        `RETAINED_HOST_DIAGNOSTIC_PROGRESS_${name}_${seen.includes(name) ? 'YES' : 'NO'}\n`,
      ),
    );
  assert.ok(result.stderr.includes('RETAINED_HOST_DIAGNOSTIC_REQUESTWRITE_YES\n'));
  assert.ok(result.stderr.includes('RETAINED_HOST_DIAGNOSTIC_CODE_DEADLINE\n'));
  assert.equal(result.stderr.at(-1), 'RETAINED_HOST_PHASE_VERSION\nRETAINED_HOST_FAILED\n');
  assert.doesNotMatch(result.stderr.join(''), /retained-observer-|host-parent|official.zip/);
});

test('progress array Proxy get trap never runs: length is bounded via own data descriptor first', () => {
  let reads = 0;
  const array = new Proxy(Object.freeze(['NATIVE_ADMISSION']), {
    get() {
      reads++;
      throw Error('PRIVATE');
    },
  });
  const facts = progressDiagnostic({ progress: array, requestWriteCompleted: false });
  assert.equal(reads, 0);
  assert.equal(facts.PROGRESS_NATIVE_ADMISSION, 'YES');
  assert.equal(facts.PROGRESS_NATIVE_LAUNCH, 'NO');
  assert.equal(facts.REQUESTWRITE, 'NO');
});

test('paired startup diagnostic projection is exact, finite and getter-safe', () => {
  const row = Object.freeze({
    ...Object.fromEntries(PIPE_FIELDS.map((k) => [k, false])),
    input: 'EOF',
    outcome: 'EOF_REQUIRED',
  });
  const vector = pipeDiagnostic({
    plainShort: row,
    plainDepth: { ...row, started: true, input: 'Q', outcome: 'COMPLETE' },
  });
  assert.equal(Object.keys(vector).length, 60);
  assert.equal(vector.PIPE_PLAINSHORT_STARTED, 'NO');
  assert.equal(vector.PIPE_PLAINDEPTH_STARTED, 'YES');
  assert.equal(vector.PIPE_PLAINSHORT_OUTCOME, 'EOF_REQUIRED');
  assert.equal(vector.PIPE_PLAINSHORT_INPUT, 'EOF');
  assert.equal(vector.PIPE_PLAINDEPTH_INPUT, 'Q');
  assert.equal(
    pipeDiagnostic({ plainShort: { ...row, input: 'OTHER' } }).PIPE_PLAINSHORT_INPUT,
    'OTHER',
  );
  assert.ok(
    Object.values(pipeDiagnostic({ plainShort: { ...row, input: 'private bytes' } })).every(
      (v) => v === 'UNAVAILABLE',
    ),
  );
  let reads = 0;
  const bad = { ...row };
  Object.defineProperty(bad, 'started', {
    get() {
      reads++;
      throw Error('PRIVATE');
    },
  });
  assert.ok(
    Object.entries(
      pipeDiagnostic({ plainShort: bad, plainDepth: { ...row, path: 'private' } }),
    ).every(([, v]) => v === 'UNAVAILABLE'),
  );
  assert.equal(reads, 0);
  assert.ok(Object.values(pipeDiagnostic(null)).every((v) => v === 'UNAVAILABLE'));
});
test('unretired paired startup refuses before VERSION and emits each pipe slot exactly once', async () => {
  const row = Object.freeze({
    ...Object.fromEntries(PIPE_FIELDS.map((k) => [k, false])),
    input: 'UNAVAILABLE',
    outcome: 'UNRETIRED',
  });
  const result = await simulatedObserver(false, {
    pair: Object.freeze({ plainShort: row, plainDepth: null }),
  });
  assert.equal(result.code, 1);
  assert.equal(result.executed, 0);
  assert.equal(result.result, null);
  for (const slot of Object.keys(PIPE_DIAGNOSTICS))
    assert.equal(
      result.stderr.filter((line) => line.startsWith(`RETAINED_HOST_DIAGNOSTIC_${slot}_`)).length,
      1,
    );
  assert.ok(result.stderr.includes('RETAINED_HOST_DIAGNOSTIC_PIPE_PLAINSHORT_OUTCOME_UNRETIRED\n'));
  assert.equal(result.stderr.at(-1), 'RETAINED_HOST_PHASE_PIPE_STARTUP\nRETAINED_HOST_FAILED\n');
});

test('explicit UNRETIRED outcome refuses even inconsistent positive retirement bit', async () => {
  const row = Object.freeze({
    ...Object.fromEntries(PIPE_FIELDS.map((k) => [k, true])),
    input: 'Q',
    outcome: 'UNRETIRED',
  });
  const result = await simulatedObserver(false, {
    pair: Object.freeze({ plainShort: row, plainDepth: row }),
  });
  assert.equal(result.executed, 0);
  assert.equal(result.code, 1);
  assert.equal(result.stderr.at(-1), 'RETAINED_HOST_PHASE_PIPE_STARTUP\nRETAINED_HOST_FAILED\n');
});

test('all four 2x2 cases must retire before VERSION; unrun cases remain unavailable', async () => {
  const complete = Object.freeze({
    ...Object.fromEntries(PIPE_FIELDS.map((k) => [k, k !== 'directoryCleanup'])),
    input: 'Q',
    outcome: 'COMPLETE',
  });
  for (const mode of PIPE_MODES) {
    const pair = Object.fromEntries(PIPE_MODES.map((key) => [key, complete]));
    pair[mode] = Object.freeze({ ...complete, outcome: 'UNRETIRED' });
    const result = await simulatedObserver(false, { pair: Object.freeze(pair) });
    assert.equal(result.executed, 0, mode);
    assert.equal(result.code, 1, mode);
    assert.ok(
      result.stderr.includes(
        `RETAINED_HOST_DIAGNOSTIC_PIPE_${mode.toUpperCase()}_OUTCOME_UNRETIRED\n`,
      ),
    );
  }
  const vector = pipeDiagnostic({ plainShort: complete });
  assert.equal(vector.PIPE_PLAINSHORT_PROGRESSBEFOREEOF, 'YES');
  assert.equal(vector.PIPE_PLAINSHORT_PROGRESSAFTEREOF, 'YES');
  for (const mode of PIPE_MODES.slice(1)) {
    for (const [slot, value] of Object.entries(vector)) {
      if (slot.startsWith(`PIPE_${mode.toUpperCase()}_`)) assert.equal(value, 'UNAVAILABLE');
    }
  }
  assert.ok(
    !Object.keys(vector).some(
      (slot) => slot.startsWith('PIPE_BASELINE_') || slot.startsWith('PIPE_NONE_'),
    ),
  );
});
