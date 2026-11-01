'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm');
const { createHash } = require('node:crypto');
const contract = require('./main-runtime-version-contract.cjs');
const {
  CASES,
  SCOPE,
  deriveMain,
  validateObserved,
  validateResult,
  validateBinding,
  response,
  reason,
} = contract;
const observer = path.join(__dirname, 'main-runtime-version-probe.cjs');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshot = (state, revision = state === 'IDLE' ? 1 : state === 'PENDING' ? 2 : 3) => ({
  revision,
  installationRevision: 1,
  state,
  operationId: state === 'PENDING' ? id(8) : null,
  code: null,
  candidateVersion: '37.0.1',
  verifiedAtUtc: state === 'VERIFIED' ? 1000 : null,
});
const wire = (requestId, state, outcome = state === 'PENDING' ? 'PENDING' : 'OBSERVED') =>
  JSON.stringify({
    version: 1,
    requestId,
    ok: true,
    outcome,
    snapshot: snapshot(state),
    diagnosticId: id(7),
    loggingHealth: 'AVAILABLE',
  });
const binding = () => ({
  version: 1,
  operationId: id(8),
  installationRevision: 1,
  expectedRevision: 1,
  pendingRevision: 2,
  verifiedRevision: 3,
  reads: 2,
  requestId: 'p2',
});
test('main derivation is one reversible insertion exposing existing service only', () => {
  const raw = fs.readFileSync(path.join(__dirname, '../build/main.cjs'), 'utf8'),
    d = deriveMain(raw, observer);
  assert.ok(d.includes('setup,versionService,assertOwnedSync:'));
  assert.equal(d.split('.bindContext(Object.freeze(').length, 2);
  assert.throws(() => deriveMain(raw + 'const setup = platformToolsService;', observer));
  assert.throws(() => deriveMain(raw, observer + '.other'));
  assert.equal(d.includes('createHostFactory('), raw.includes('createHostFactory('));
});
test('observed audit placeholders cannot masquerade as final validated evidence', () => {
  const v = {
    version: 1,
    scope: SCOPE,
    cases: Object.fromEntries(
      CASES.map((k) => [k, !['schema7Intents', 'schema7Result'].includes(k)]),
    ),
    readyCount: 1,
    closedCount: 1,
  };
  assert.equal(validateObserved(v).passed, true);
  assert.equal(validateResult(v).passed, false);
  v.cases.schema7Intents = v.cases.schema7Result = true;
  assert.equal(validateResult(v).passed, true);
  assert.equal(validateObserved(v).passed, false);
  assert.throws(() => validateResult({ ...v, privatePath: 'secret' }));
  assert.throws(() => validateResult({ ...v, cases: { ...v.cases, mainClosed: 1 } }));
});
test('private binding rejects stale revisions, extra keys, unsafe IDs and read overflow', () => {
  assert.equal(validateBinding(binding()).reads, 2);
  for (const delta of [
    { reads: 42 },
    { reads: 0 },
    { expectedRevision: 2 },
    { verifiedRevision: 2 },
    { installationRevision: 0 },
    { expectedRevision: -0 },
    { requestId: 'p9007199254740992' },
    { operationId: 'private' },
    { path: 'secret' },
  ])
    assert.throws(() => validateBinding({ ...binding(), ...delta }));
});
test('wire projection accepts only exact successful current state tuples', () => {
  for (const state of ['IDLE', 'PENDING', 'VERIFIED'])
    assert.equal(response(wire('p1', state)).snapshot.state, state);
  for (const delta of [
    { state: 'OUTCOME_UNKNOWN' },
    { code: 'OK' },
    { installationRevision: 0 },
    { operationId: id(2) },
    { candidateVersion: '99' },
    { verifiedAtUtc: null },
  ]) {
    const v = JSON.parse(wire('p1', 'VERIFIED'));
    Object.assign(v.snapshot, delta);
    assert.throws(() => response(JSON.stringify(v)));
  }
  assert.throws(() => response(' ' + wire('p1', 'IDLE')));
  assert.throws(() => response(wire('p1', 'IDLE').replace('"ok":true', '"ok":true,"ok":true')));
  assert.throws(() => response(wire('p1', 'IDLE').replace('"OBSERVED"', '"PENDING"')));
});
test('fixed errors never invoke getters or expose unknown private strings', () => {
  let calls = 0;
  const e = {
    get message() {
      calls++;
      return 'MAIN_RUNTIME_FILE';
    },
  };
  assert.equal(reason(e), 'UNCLASSIFIED');
  assert.equal(calls, 0);
  assert.equal(reason(new Error('MAIN_RUNTIME_FILE')), 'FILE');
  assert.equal(reason(new Error('PRIVATE/path')), 'UNCLASSIFIED');
});
async function simulate(fault = null) {
  const temp = fs.realpathSync.native(
      fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'main-version-observer-')),
    ),
    root = path.join(temp, '.retained-host-runtime', 'r'),
    managed = path.join(root, 'first-use', `Fonesi-Auto-${id(1)}`),
    launch = path.join(managed, `launch-${id(2)}`),
    profile = path.join(launch, 'profile');
  fs.mkdirSync(profile, { recursive: true });
  for (const d of [root, managed, launch]) fs.writeFileSync(path.join(d, '.owner'), id(3));
  const raw = fs.readFileSync(path.join(__dirname, '../build/main.cjs'), 'utf8');
  fs.writeFileSync(
    path.join(root, 'copy.json'),
    JSON.stringify({
      originalMainSha256: hash(raw),
      derivedMainSha256: hash(deriveMain(raw, observer)),
    }),
  );
  const events = {},
    handlers = new Map(),
    stderr = [],
    clicks = [],
    passthrough = [];
  let now = 10000,
    sequence = 0,
    installed = false,
    state = 'IDLE',
    uiState = '',
    verifyEnabled = false,
    timerId = 0,
    observerTimer = null,
    requestCalls = 0,
    readCalls = 0,
    setupReads = 0,
    done;
  const finished = new Promise((r) => {
    done = r;
  });
  const custody = { retired: true },
    service = { retired: true };
  const electron = {
    safeStorage: {},
    dialog: {},
    shell: {},
    ipcMain: {
      handle(channel, fn) {
        handlers.set(channel, fn);
      },
    },
    app: {
      on(k, f) {
        events[k] = f;
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
    get retired() {
      return fault !== 'delayed-setup' || !installed || now >= 10075;
    },
    async execute(q) {
      if (q.method === 'platformTools.setup.request') {
        for (const [i, buttons] of [
          ['Hủy', 'Mở điều khoản', 'Tôi đã đọc và đồng ý'],
          ['Hủy', 'Chọn tệp ZIP', 'Tải từ Google'],
          ['Hủy', 'Xác nhận thiết lập'],
        ].entries()) {
          await electron.dialog.showMessageBox({
            title: 'Thiết lập Android Platform Tools',
            defaultId: 0,
            cancelId: 0,
            buttons,
          });
          if (i === 1)
            await electron.dialog.showOpenDialog({
              title: 'Chọn Android Platform Tools 37.0.1 ZIP',
              properties: ['openFile'],
            });
        }
        installed = true;
        return JSON.stringify({ ok: true, outcome: 'PENDING' });
      }
      setupReads++;
      return JSON.stringify({
        ok: true,
        outcome: 'OBSERVED',
        snapshot: {
          state: installed ? 'VERIFIED_LOCAL' : 'UNAVAILABLE',
          installationRevision: installed ? 1 : 0,
          revision: installed ? 1 : 0,
          code: null,
        },
      });
    },
  };
  const event = Object.freeze({ sender: 'actual-sender-fixture' }),
    receiver = { name: 'handler-this' };
  async function dispatch(method) {
    const q = {
      version: 1,
      requestId: `p${++sequence}`,
      method,
      ...(method === 'runtimeVersion.request'
        ? { expectedRevision: 1, expectedInstallationRevision: 1 }
        : {}),
    };
    const argument = JSON.stringify(q),
      result = await handlers.get('foundation:runtime-version:v1').call(receiver, event, argument);
    passthrough.push({ argument, result });
    if (method === 'runtimeVersion.get') {
      verifyEnabled = true;
      uiState =
        fault === 'late-wire-ui-timeout' && readCalls > 1
          ? 'OUTCOME_UNKNOWN'
          : JSON.parse(result).snapshot.state;
    } else uiState = fault === 'missing-pending-ui' ? 'IDLE' : 'PENDING';
  }
  electron.BrowserWindow = {
    getAllWindows() {
      return [
        {
          webContents: {
            isDestroyed: () => false,
            async executeJavaScript(code) {
              const match = code.match(/getElementById\("([a-z-]+)"\)/);
              if (match && code.includes('b.click()')) {
                const button = match[1];
                clicks.push(button);
                if (button === 'runtime-version-read') await dispatch('runtimeVersion.get');
                if (button === 'runtime-version-verify') await dispatch('runtimeVersion.request');
                return true;
              }
              if (code.includes('pending:b.disabled,text:s.textContent'))
                return {
                  pending: false,
                  text:
                    uiState === 'OUTCOME_UNKNOWN'
                      ? 'OUTCOME_UNKNOWN / TIMEOUT. Đọc lại để đối chiếu; không tự thử lại.'
                      : `${uiState} / OK / LOG AVAILABLE. ${uiState === 'VERIFIED' ? 'Đã quan sát phiên bản tại lần kiểm tra; không giám sát liên tục.' : 'Nhấn Đọc kết quả sau khi thao tác hoàn tất.'}`,
                };
              if (code.startsWith('Boolean(')) return !verifyEnabled;
              if (code.includes('disabled!==false')) return !verifyEnabled;
              if (code.includes("includes('PENDING')")) return uiState !== 'PENDING';
              if (code.includes("includes('VERIFIED')")) return uiState !== 'VERIFIED';
              throw Error('UNEXPECTED_DOM_CODE');
            },
          },
        },
      ];
    },
  };
  const module = { exports: {} };
  class FakeModule {
    static _nodeModulePaths() {
      return [];
    }
    _compile(derived, filename) {
      assert.equal(derived, deriveMain(raw, observer));
      assert.equal(filename, path.join(__dirname, '../build/main.cjs'));
      module.exports.bindContext(
        Object.freeze({
          entry: { storeId: id(4), ownerToken: id(5) },
          runtimeCustody: custody,
          setup,
          versionService: service,
          assertOwnedSync() {},
        }),
      );
      electron.ipcMain.handle('other-channel', (x) => x);
      electron.ipcMain.handle('foundation:runtime-version:v1', async function (e, argument) {
        assert.equal(this, receiver);
        assert.equal(e, event);
        const q = JSON.parse(argument);
        if (q.method === 'runtimeVersion.request') {
          requestCalls++;
          state = 'PENDING';
          return wire(q.requestId, 'PENDING');
        }
        readCalls++;
        if (readCalls > 1) state = fault === 'never-verified' ? 'PENDING' : 'VERIFIED';
        const v = JSON.parse(wire(q.requestId, state, 'OBSERVED'));
        if (fault === 'changed-installation' && readCalls > 1) v.snapshot.installationRevision = 2;
        if (fault === 'error-response' && readCalls > 1)
          return JSON.stringify({
            version: 1,
            requestId: q.requestId,
            ok: false,
            outcome: 'OUTCOME_UNKNOWN',
          });
        if (fault === 'helper-residue' && readCalls > 1)
          fs.mkdirSync(path.join(launch, '.host-session'));
        return JSON.stringify(v);
      });
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
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const sandbox = {
    module,
    exports: module.exports,
    __dirname,
    __filename: observer,
    Buffer,
    TextDecoder,
    Date: Clock,
    process: { env: { FONESI_BOOTSTRAP_ROOT: profile } },
    console: { log() {} },
    setImmediate,
    setTimeout(fn, ms) {
      if (ms === 210000) {
        observerTimer = fn;
        return ++timerId;
      }
      now += ms;
      queueMicrotask(fn);
      return ++timerId;
    },
    clearTimeout() {
      observerTimer = null;
    },
    require(name) {
      if (name === 'electron') return electron;
      if (name === 'node:fs') return fsProxy;
      if (name === 'node:module') return FakeModule;
      if (name === './fleet-ui-schema4.cjs') return { observeSchema4: async () => true };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(observer, 'utf8'), sandbox, { filename: observer });
  try {
    const result = await finished;
    return {
      ...result,
      stderr,
      clicks,
      passthrough,
      requestCalls,
      readCalls,
      setupReads,
      observerTimer,
      otherResult: handlers.get('other-channel')('unchanged'),
      observed: fs.existsSync(path.join(root, 'main-runtime-version-observed.json'))
        ? JSON.parse(fs.readFileSync(path.join(root, 'main-runtime-version-observed.json')))
        : null,
      binding: fs.existsSync(path.join(root, 'main-runtime-version-binding.json'))
        ? JSON.parse(fs.readFileSync(path.join(root, 'main-runtime-version-binding.json')))
        : null,
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
test('actual observer entry uses real registration wrapper/DOM flow with unchanged wire and one Verify', async () => {
  const r = await simulate();
  assert.equal(r.code, 0, r.stderr.join(''));
  assert.equal(r.requestCalls, 1);
  assert.equal(r.readCalls, 2);
  assert.equal(r.otherResult, 'unchanged');
  assert.equal(r.observerTimer, null);
  assert.deepEqual(r.clicks, [
    'open-help',
    'runtime-version-read',
    'runtime-version-verify',
    'runtime-version-read',
  ]);
  assert.equal(validateObserved(r.observed).passed, true);
  assert.equal(validateBinding(r.binding).reads, 2);
  for (const p of r.passthrough) {
    const q = JSON.parse(p.argument);
    assert.equal(JSON.parse(p.result).requestId, q.requestId);
  }
});
for (const fault of [
  'missing-pending-ui',
  'changed-installation',
  'error-response',
  'helper-residue',
  'never-verified',
])
  test(`actual observer stops without repeat Verify on ${fault}`, async () => {
    const r = await simulate(fault);
    assert.equal(r.code, 1);
    assert.equal(r.requestCalls, 1);
    assert.equal(r.observed, null);
    assert.equal(r.observerTimer, null);
    assert.ok(r.readCalls <= 41);
    assert.ok(r.stderr.join('').includes('MAIN_RUNTIME_VERSION_FAILED'));
    if (fault === 'error-response') assert.equal(r.readCalls, 2);
  });
test('actual CJS entry auto-starts under Electron dynamic-import loading', () => {
  const { spawnSync } = require('node:child_process'),
    { pathToFileURL } = require('node:url');
  const script = `import Module from 'node:module'; const old=Module._load;const sentinel=new Error('ENTRY');Module._load=function(id,...args){if(id==='electron')throw sentinel;return old.call(this,id,...args);};try{await import(${JSON.stringify(pathToFileURL(observer).href)});process.exitCode=2;}catch(e){process.exitCode=e===sentinel?0:3;}`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    shell: false,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 4096,
  });
  assert.equal(r.error, undefined);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
});

test('delayed setup retirement polls only getter and keeps exactly two audited setup GETs', async () => {
  const r = await simulate('delayed-setup');
  assert.equal(r.code, 0, r.stderr.join(''));
  assert.equal(r.setupReads, 2);
  assert.equal(r.requestCalls, 1);
});

test('late main read success cannot override actual client timeout or trigger another click', async () => {
  const r = await simulate('late-wire-ui-timeout');
  assert.equal(r.code, 1);
  assert.equal(r.requestCalls, 1);
  assert.equal(r.readCalls, 2);
  assert.equal(r.observed, null);
  assert.match(r.stderr.join(''), /MAIN_RUNTIME_VERSION_REASON_RESPONSE/);
});
