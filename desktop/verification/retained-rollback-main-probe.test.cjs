'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm');
const { createHash } = require('node:crypto'),
  contract = require('./retained-rollback-contract.cjs');
const observer = path.join(__dirname, 'retained-rollback-main-probe.cjs'),
  source = fs.readFileSync(observer, 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  hash = (b) => createHash('sha256').update(b).digest('hex');
function exportsOnly() {
  const module = { exports: {} },
    stop = Error('ENTRY');
  try {
    vm.runInNewContext(
      source,
      {
        module,
        require: (n) => {
          if (n === 'electron') throw stop;
          return require(n);
        },
        __dirname,
        __filename: observer,
        Buffer,
        TextDecoder,
        console,
      },
      { filename: observer },
    );
  } catch (e) {
    assert.equal(e, stop);
  }
  return module.exports;
}
const response = exportsOnly().response;
function wire(
  kind,
  requestId,
  state,
  revision,
  installationRevision,
  activeVersion,
  target = '37.0.1',
  setupOperationId = null,
) {
  const pending = ['PENDING', 'AWAITING_RECIPIENT'].includes(state),
    snapshot = {
      revision,
      installationRevision,
      state,
      operationId: pending
        ? id(kind === 'setup' ? 8 : 9)
        : kind === 'setup'
          ? setupOperationId
          : null,
      code: null,
      installTargetVersion: target,
      activeVersion,
    };
  if (kind === 'setup') snapshot.rollbackAvailable = installationRevision >= 2;
  else snapshot.verifiedAtUtc = state === 'VERIFIED' ? 1000 : null;
  return JSON.stringify({
    version: 2,
    requestId,
    ok: true,
    outcome: pending ? 'PENDING' : 'OBSERVED',
    snapshot,
    diagnosticId: id(7),
    loggingHealth: 'AVAILABLE',
  });
}
test('observer accepts only exact current successful wire tuples and canonical framing', () => {
  for (const release of ['36.0.0', '37.0.1'])
    for (const state of ['IDLE', 'PENDING', 'VERIFIED'])
      assert.equal(
        response(wire('runtime', 'p1', state, 1, 2, release), 'runtime').snapshot.activeVersion,
        release,
      );
  assert.equal(
    response(wire('setup', 'p1', 'UNAVAILABLE', 0, 0, null), 'setup').snapshot.installationRevision,
    0,
  );
  for (const mutate of [
    (v) => (v.version = 1),
    (v) => (v.loggingHealth = 'DEGRADED'),
    (v) => (v.snapshot.activeVersion = 'private'),
    (v) => (v.snapshot.operationId = id(2)),
    (v) => (v.snapshot.verifiedAtUtc = null),
    (v) => (v.extra = 'secret'),
  ]) {
    const v = JSON.parse(wire('runtime', 'p1', 'VERIFIED', 3, 2, '36.0.0'));
    mutate(v);
    assert.throws(() => response(JSON.stringify(v), 'runtime'));
  }
  assert.throws(() => response(wire('runtime', 'p1', 'IDLE', 1, 1, '36.0.0') + '\n', 'runtime'));
  assert.throws(() =>
    response(
      wire('runtime', 'p1', 'IDLE', 1, 1, '36.0.0').replace('"ok":true', '"ok":true,"ok":true'),
      'runtime',
    ),
  );
});
async function simulate(stage, fault = null) {
  const temp = fs.realpathSync.native(
      fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'rollback-observer-')),
    ),
    root = path.join(temp, 'r'),
    launch = path.join(root, 'launch-' + id(1)),
    profile = path.join(launch, 'profile');
  fs.mkdirSync(profile, { recursive: true });
  const expected = contract.EXPECTED[stage],
    rawMain = fs.readFileSync(path.join(__dirname, '../build/main.cjs'), 'utf8'),
    main = path.join(root, 'app/build/main.cjs');
  fs.mkdirSync(path.dirname(main), { recursive: true });
  fs.writeFileSync(main, rawMain);
  fs.writeFileSync(
    path.join(path.dirname(main), '.verified-build.json'),
    JSON.stringify({ outputs: { 'main.cjs': hash(rawMain) } }),
  );
  const prepared = {
    originalMainSha256: hash(rawMain),
    derivedMainSha256: hash(contract.deriveMain(rawMain, observer, stage)),
    archiveFile:
      stage === 'SEED' ? 'official-36.zip' : stage === 'UPGRADE' ? 'official-37.zip' : null,
  };
  const events = {},
    handlers = new Map(),
    clicks = [],
    errors = [],
    module = { exports: {} };
  let now = 10000,
    finish,
    exit = null,
    serial = 0,
    srev = 0,
    rrev = 0,
    sticks = 0,
    rticks = 0,
    swork = false,
    rwork = false,
    srequests = 0,
    rrequests = 0,
    sreads = 0,
    rreads = 0;
  let installation = stage === 'SEED' ? 0 : stage === 'UPGRADE' ? 1 : stage === 'ROLLBACK' ? 2 : 3,
    active = stage === 'SEED' ? null : stage === 'ROLLBACK' ? '37.0.1' : '36.0.0',
    rstate = 'IDLE';
  const done = new Promise((r) => (finish = r)),
    ui = { setup: { busy: false, text: '' }, runtime: { busy: false, text: '' } },
    out = { log: () => {}, error: () => {} },
    dialogs = {};
  const app = {
    on: (n, f) => (events[n] = f),
    quit: () => {
      out.log('BOOTSTRAP_CLOSED');
      events['will-quit']();
      exit = 0;
      finish();
    },
    exit: (n) => {
      exit = n;
      finish();
    },
  };
  const setup = {
    get retired() {
      if (swork) {
        if (fault === 'setup-unretired') return false;
        if (++sticks < 3) return false;
        swork = false;
        installation = expected.installationRevision;
        active = expected.activeVersion;
        srev = 2;
      }
      return true;
    },
  };
  const versionService = {
    get retired() {
      if (rwork) {
        if (++rticks < 3) return false;
        rwork = false;
        rstate = 'VERIFIED';
        rrev = 3;
      }
      return true;
    },
  };
  const runtimeCustody = {
    get retired() {
      return !swork && !rwork;
    },
  };
  function rendered(r, k) {
    const s = r.snapshot;
    return k === 'setup'
      ? `${r.outcome} / ${s.state} / OK / LOG AVAILABLE. Chỉ xác minh tệp; chưa khởi động ADB hoặc kết nối thiết bị.`
      : `${s.state} / OK / LOG AVAILABLE. ${s.state === 'VERIFIED' ? 'Đã quan sát phiên bản tại lần kiểm tra; không giám sát liên tục.' : 'Nhấn Đọc kết quả sau khi thao tác hoàn tất.'}`;
  }
  async function call(k, request = false) {
    ui[k].busy = true;
    const q = {
      version: 2,
      requestId: 'p' + ++serial,
      method:
        k === 'setup'
          ? request
            ? 'platformTools.setup.request'
            : 'platformTools.get'
          : request
            ? 'runtimeVersion.request'
            : 'runtimeVersion.get',
    };
    if (request) {
      q.expectedRevision = k === 'setup' ? srev : rrev;
      if (k === 'runtime') q.expectedInstallationRevision = installation;
    }
    const channel =
        k === 'setup' ? 'foundation:platform-tools:v2' : 'foundation:runtime-version:v2',
      answer = await handlers
        .get(channel)
        .call({ receiver: true }, { sender: true }, JSON.stringify(q));
    ui[k].text =
      fault === 'late-ui-timeout' && k === 'runtime' && rreads === 2
        ? 'OUTCOME_UNKNOWN / TIMEOUT. Đọc lại để đối chiếu; không tự thử lại.'
        : rendered(JSON.parse(answer), k);
    ui[k].busy = false;
  }
  const document = {
    getElementById: (name) => {
      if (name === 'open-help') return { disabled: false, click: () => clicks.push(name) };
      for (const k of ['setup', 'runtime']) {
        const p = k === 'setup' ? 'platform-tools' : 'runtime-version';
        if (name === p + '-status') return { textContent: ui[k].text };
        if (name === p + '-read')
          return {
            disabled: ui[k].busy,
            click: () => {
              clicks.push(name);
              void call(k);
            },
          };
        if (name === (k === 'setup' ? 'platform-tools-setup' : 'runtime-version-verify'))
          return {
            disabled: ui[k].busy,
            click: () => {
              clicks.push(name);
              void call(k, true);
            },
          };
      }
      return null;
    },
  };
  const wc = {
    isDestroyed: () => false,
    executeJavaScript: async (code) => vm.runInNewContext(code, { document }),
  };
  const ipcMain = {
    handle(channel, handler) {
      assert.equal(this, ipcMain);
      handlers.set(channel, handler);
    },
  };
  const electron = {
    app,
    dialog: dialogs,
    shell: {},
    ipcMain,
    BrowserWindow: { getAllWindows: () => [{ webContents: wc }] },
  };
  class FakeModule {
    static _nodeModulePaths(p) {
      return [p];
    }
    constructor(file) {
      this.filename = file;
    }
    _compile(derived, file) {
      assert.equal(file, main);
      assert.equal(derived, contract.deriveMain(rawMain, observer, stage));
      module.exports.bindContext(
        Object.freeze({
          entry: {},
          runtimeCustody,
          setup,
          versionService,
          assertOwnedSync: () => {},
        }),
      );
      ipcMain.handle('foundation:platform-tools:v2', async function (event, value) {
        assert.equal(this.receiver, true);
        assert.equal(event.sender, true);
        const q = JSON.parse(value);
        if (q.method === 'platformTools.get') {
          sreads++;
          return wire(
            'setup',
            q.requestId,
            installation ? 'VERIFIED_LOCAL' : 'UNAVAILABLE',
            srev,
            installation,
            active,
            expected.installTargetVersion,
            srequests
              ? fault === 'terminal-null'
                ? null
                : fault === 'terminal-other'
                  ? id(18)
                  : id(8)
              : fault === 'initial-operation'
                ? id(8)
                : null,
          );
        }
        srequests++;
        swork = true;
        srev = 1;
        queueMicrotask(async () => {
          const rb = stage === 'ROLLBACK',
            bs = rb
              ? [
                  ['Hủy', 'Cài bản mục tiêu', 'Khôi phục bản trước đã giữ'],
                  ['Hủy', 'Mở điều khoản', 'Tôi đã đọc và đồng ý'],
                  ['Hủy', 'Xác nhận khôi phục'],
                ]
              : [
                  ['Hủy', 'Mở điều khoản', 'Tôi đã đọc và đồng ý'],
                  ['Hủy', 'Chọn tệp ZIP', 'Tải từ Google'],
                  ['Hủy', 'Xác nhận thiết lập'],
                ];
          try {
            for (let i = 0; i < 3; i++) {
              await dialogs.showMessageBox({
                title: 'Thiết lập Android Platform Tools',
                message: `Android Platform Tools ${expected.installTargetVersion}`,
                defaultId: 0,
                cancelId: 0,
                noLink: true,
                buttons: bs[i],
              });
              if (!rb && i === 1)
                await dialogs.showOpenDialog({
                  title: `Chọn Android Platform Tools ${expected.installTargetVersion} ZIP`,
                  properties: ['openFile'],
                });
            }
          } catch (e) {
            errors.push(e);
          }
        });
        return wire(
          'setup',
          q.requestId,
          'AWAITING_RECIPIENT',
          1,
          installation,
          active,
          expected.installTargetVersion,
        );
      });
      ipcMain.handle('foundation:runtime-version:v2', async function (event, value) {
        assert.equal(this.receiver, true);
        assert.equal(event.sender, true);
        const q = JSON.parse(value);
        if (q.method === 'runtimeVersion.get') {
          rreads++;
          if (rrev === 0) rrev = 1;
          return wire(
            'runtime',
            q.requestId,
            rstate,
            rrev,
            installation,
            fault === 'wrong-release' && rreads === 2 ? '99.0.0' : active,
            expected.installTargetVersion,
          );
        }
        rrequests++;
        rwork = true;
        rstate = 'PENDING';
        rrev = 2;
        return wire(
          'runtime',
          q.requestId,
          'PENDING',
          2,
          installation,
          active,
          expected.installTargetVersion,
        );
      });
      queueMicrotask(() => {
        void call('setup').then(() => out.log('BOOTSTRAP_READY'));
      });
    }
  }
  const sandbox = {
    module,
    Buffer,
    TextDecoder,
    __dirname,
    __filename: observer,
    process: { env: { FONESI_BOOTSTRAP_ROOT: profile } },
    console: out,
    Date: { now: () => now },
    setImmediate: (f) => queueMicrotask(f),
    setTimeout: (f, ms) => {
      if (ms < 210000) {
        now += ms;
        queueMicrotask(f);
      }
      return 1;
    },
    clearTimeout: () => {},
    require: (n) => {
      if (n === 'electron') return electron;
      if (n === 'node:module') return FakeModule;
      if (n === 'node:fs')
        return {
          ...fs,
          writeSync: (_fd, b) => {
            errors.push(b);
            return b.length;
          },
        };
      if (n === './retained-rollback-contract.cjs')
        return {
          ...contract,
          stageForLaunch: () => ({ root, stage, prepared, packageMode: stage !== 'SEED' }),
          mainForStage: () => main,
        };
      if (n === './retained-rollback-control.cjs') return { verify: (r) => assert.equal(r, root) };
      if (n === './persistence-launch-e2e-control.cjs')
        return { witnessPath: () => path.join(root, 'ui.json') };
      return require(n);
    },
  };
  let timer;
  try {
    vm.runInNewContext(source, sandbox, { filename: observer });
    await Promise.race([
      done,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('TEST_TIMEOUT')), 3000);
      }),
    ]);
    return {
      exit,
      clicks,
      errors,
      sreads,
      rreads,
      srequests,
      rrequests,
      observed: fs.existsSync(path.join(root, `rollback-${stage}-observed.json`))
        ? JSON.parse(fs.readFileSync(path.join(root, `rollback-${stage}-observed.json`)))
        : null,
    };
  } finally {
    clearTimeout(timer);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
for (const stage of contract.STAGES)
  test(`actual observer synthetic ${stage} preserves IPC and automatic/explicit read counts`, async () => {
    const r = await simulate(stage);
    assert.equal(r.exit, 0, JSON.stringify(r.errors));
    assert.equal(r.sreads, stage === 'REOPEN' ? 2 : 3);
    assert.equal(r.rreads, 2);
    assert.equal(r.srequests, stage === 'REOPEN' ? 0 : 1);
    assert.equal(r.rrequests, 1);
    assert.equal(contract.validateObserved(r.observed).passed, true);
  });
for (const fault of ['late-ui-timeout', 'wrong-release', 'setup-unretired'])
  test(`actual observer stops without another effect on ${fault}`, async () => {
    const r = await simulate('SEED', fault);
    assert.equal(r.exit, 1);
    assert.equal(r.observed, null);
    assert.ok(r.rrequests <= 1);
    assert.equal(r.srequests, 1);
    if (fault === 'setup-unretired') assert.equal(r.rrequests, 0);
    else assert.equal(r.rreads, 2);
  });
test('actual Electron dynamic-import entry starts observer without manually calling exports', () => {
  const { spawnSync } = require('node:child_process'),
    { pathToFileURL } = require('node:url');
  const script = `import Module from 'node:module';const old=Module._load;const sentinel=new Error('ENTRY');Module._load=function(id,...args){if(id==='electron')throw sentinel;return old.call(this,id,...args);};try{await import(${JSON.stringify(pathToFileURL(observer).href)});process.exitCode=2;}catch(e){process.exitCode=e===sentinel?0:3;}`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 65536,
  });
  assert.equal(r.status, 0, r.stderr);
});

test('actual setup service/core owned installation produces retained terminal operation accepted by observer', async () => {
  const { setupObservation } = await import('./retained-rollback-service-fixture.mjs');
  const f = await setupObservation();
  try {
    for (const record of [f.hydrated, f.initial, f.pending, f.terminal])
      assert.deepEqual(
        JSON.parse(JSON.stringify(response(JSON.stringify(record), 'setup'))),
        record,
      );
    assert.equal(f.initial.snapshot.operationId, null);
    assert.notEqual(f.pending.snapshot.operationId, null);
    assert.equal(f.terminal.snapshot.operationId, f.pending.snapshot.operationId);
    assert.ok(f.terminal.snapshot.revision > f.pending.snapshot.revision);
    assert.equal(f.terminal.snapshot.state, 'VERIFIED_LOCAL');
  } finally {
    await f.cleanup();
  }
});
for (const fault of ['terminal-null', 'terminal-other', 'initial-operation'])
  test(`actual observer rejects setup operation-correlation mismatch ${fault}`, async () => {
    const r = await simulate('SEED', fault);
    assert.equal(r.exit, 1);
    assert.equal(r.observed, null);
    assert.equal(r.rrequests, 0);
    assert.equal(r.srequests, fault === 'initial-operation' ? 0 : 1);
  });
