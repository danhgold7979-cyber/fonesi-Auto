'use strict';
// Verification-only observer. Original IPC receivers, arguments and return values are preserved.
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module');
const { createHash } = require('node:crypto');
const contract = require('./retained-rollback-contract.cjs');
const {
  CASES,
  SCOPE,
  EXPECTED,
  PHASES,
  validateObserved,
  validateBinding,
  deriveMain,
  stageForLaunch,
  mainForStage,
  write,
  reason,
} = contract;
let context = null;
function reject(code = 'RESPONSE') {
  throw Error('RETAINED_ROLLBACK_' + code);
}
function exact(value, names) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getOwnPropertySymbols(value).length
  )
    reject();
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Object.keys(d).length !== names.length ||
    names.some((k) => !d[k] || !Object.hasOwn(d[k], 'value') || !d[k].enumerable)
  )
    reject();
}
const integer = (v) => Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
const uuid = (v) =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const requestId = (v) =>
  typeof v === 'string' &&
  /^p[1-9][0-9]{0,15}$/.test(v) &&
  Number.isSafeInteger(Number(v.slice(1))) &&
  String(Number(v.slice(1))) === v.slice(1);
function response(raw, kind) {
  if (
    !['setup', 'runtime'].includes(kind) ||
    typeof raw !== 'string' ||
    Buffer.byteLength(raw) > 16384
  )
    reject();
  const v = JSON.parse(raw);
  if (JSON.stringify(v) !== raw) reject();
  exact(v, ['version', 'requestId', 'ok', 'outcome', 'snapshot', 'diagnosticId', 'loggingHealth']);
  if (
    v.version !== 2 ||
    v.ok !== true ||
    !requestId(v.requestId) ||
    !['OBSERVED', 'PENDING'].includes(v.outcome) ||
    !uuid(v.diagnosticId) ||
    v.loggingHealth !== 'AVAILABLE'
  )
    reject();
  const s = v.snapshot;
  exact(s, [
    'revision',
    'installationRevision',
    'state',
    'operationId',
    'code',
    'installTargetVersion',
    'activeVersion',
    kind === 'setup' ? 'rollbackAvailable' : 'verifiedAtUtc',
  ]);
  if (
    !integer(s.revision) ||
    !integer(s.installationRevision) ||
    s.code !== null ||
    !['36.0.0', '37.0.1'].includes(s.installTargetVersion) ||
    (s.activeVersion !== null && !['36.0.0', '37.0.1'].includes(s.activeVersion))
  )
    reject();
  if (kind === 'setup') {
    if (
      !['UNAVAILABLE', 'AWAITING_RECIPIENT', 'PROVISIONING', 'VERIFIED_LOCAL'].includes(s.state) ||
      typeof s.rollbackAvailable !== 'boolean'
    )
      reject();
    if (
      v.outcome === 'PENDING'
        ? !['AWAITING_RECIPIENT', 'PROVISIONING'].includes(s.state) || !uuid(s.operationId)
        : !['UNAVAILABLE', 'VERIFIED_LOCAL'].includes(s.state) ||
          (s.operationId !== null && !uuid(s.operationId)) ||
          (s.state === 'UNAVAILABLE' && s.operationId !== null)
    )
      reject();
  } else {
    if (
      s.installationRevision < 1 ||
      !['IDLE', 'PENDING', 'VERIFIED'].includes(s.state) ||
      s.activeVersion === null
    )
      reject();
    if (
      s.state === 'PENDING'
        ? !uuid(s.operationId) || s.verifiedAtUtc !== null
        : s.operationId !== null ||
          (s.state === 'VERIFIED' ? !integer(s.verifiedAtUtc) : s.verifiedAtUtc !== null)
    )
      reject();
    if (v.outcome === 'PENDING' ? s.state !== 'PENDING' : s.state === 'PENDING') reject();
  }
  return v;
}
function bindContext(value) {
  if (context !== null || !Object.isFrozen(value)) reject('CONTEXT');
  exact(value, ['entry', 'runtimeCustody', 'setup', 'versionService', 'assertOwnedSync']);
  if (
    typeof value.assertOwnedSync !== 'function' ||
    !value.setup ||
    !value.versionService ||
    !value.runtimeCustody
  )
    reject('CONTEXT');
  value.assertOwnedSync();
  context = value;
}
function bounded(file, limit) {
  const s = fs.lstatSync(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    s.size < 1 ||
    s.size > limit ||
    fs.realpathSync.native(file) !== file
  )
    reject('SOURCE');
  const fd = fs.openSync(file, 'r');
  try {
    const before = fs.fstatSync(fd),
      bytes = Buffer.alloc(s.size + 1);
    let n = 0;
    for (;;) {
      const count = fs.readSync(fd, bytes, n, bytes.length - n, null);
      if (!count) break;
      n += count;
      if (n === bytes.length) break;
    }
    const after = fs.fstatSync(fd);
    if (
      n !== s.size ||
      before.dev !== s.dev ||
      before.ino !== s.ino ||
      after.size !== s.size ||
      after.mtimeMs !== before.mtimeMs
    )
      reject('SOURCE');
    return bytes.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}
const hash = (b) => createHash('sha256').update(b).digest('hex');
function runObserver() {
  const { app, dialog, shell, ipcMain, BrowserWindow } = require('electron');
  let phase = 'PREPARE',
    root,
    launch,
    stage,
    prepared,
    expected,
    ready = 0,
    closed = 0,
    failed = false,
    complete = false,
    wireFailure = false,
    dialogIndex = 0,
    pickers = 0;
  const cases = Object.fromEntries(CASES.map((k) => [k, false]));
  const originalHandle = ipcMain.handle,
    originalLog = console.log,
    registered = new Set();
  const observations = {
    setup: { reads: 0, requests: 0, pending: null, last: null },
    runtime: { reads: 0, requests: 0, pending: null, last: null },
  };
  const deadline = setTimeout(() => fail(Error('RETAINED_ROLLBACK_TIMEOUT')), 210000);
  function fail(error) {
    if (failed) return;
    failed = true;
    try {
      fs.writeSync(
        2,
        `RETAINED_ROLLBACK_PHASE_${PHASES.includes(phase) ? phase : 'PREPARE'}\nRETAINED_ROLLBACK_REASON_${reason(error)}\nRETAINED_ROLLBACK_FAILED\n`,
      );
    } catch {
    } finally {
      clearTimeout(deadline);
      app.exit(1);
    }
  }
  ipcMain.handle = function (channel, handler) {
    const kind =
      channel === 'foundation:platform-tools:v2'
        ? 'setup'
        : channel === 'foundation:runtime-version:v2'
          ? 'runtime'
          : null;
    if (kind === null) return originalHandle.call(this, channel, handler);
    if (registered.has(kind)) reject('CONTEXT');
    registered.add(kind);
    return originalHandle.call(this, channel, async function (event, ...args) {
      const raw = await handler.call(this, event, ...args);
      try {
        if (args.length !== 1 || typeof args[0] !== 'string' || Buffer.byteLength(args[0]) > 8192)
          reject();
        const q = JSON.parse(args[0]),
          r = response(raw, kind),
          o = observations[kind];
        if (q.version !== 2 || q.requestId !== r.requestId) reject();
        const get = kind === 'setup' ? 'platformTools.get' : 'runtimeVersion.get';
        const request = kind === 'setup' ? 'platformTools.setup.request' : 'runtimeVersion.request';
        if (q.method === get) {
          exact(q, ['version', 'requestId', 'method']);
          if (
            ++o.reads > (kind === 'setup' ? (stage === 'REOPEN' ? 2 : 3) : 2) ||
            r.outcome !== 'OBSERVED'
          )
            reject();
          o.last = r;
        } else if (q.method === request) {
          exact(
            q,
            kind === 'setup'
              ? ['version', 'requestId', 'method', 'expectedRevision']
              : [
                  'version',
                  'requestId',
                  'method',
                  'expectedRevision',
                  'expectedInstallationRevision',
                ],
          );
          if (
            ++o.requests !== 1 ||
            o.pending !== null ||
            r.outcome !== 'PENDING' ||
            !integer(q.expectedRevision) ||
            (kind === 'setup' && stage === 'REOPEN')
          )
            reject();
          if (
            kind === 'runtime' &&
            q.expectedInstallationRevision !== r.snapshot.installationRevision
          )
            reject();
          o.pending = Object.freeze({
            operationId: r.snapshot.operationId,
            installationRevision: r.snapshot.installationRevision,
            expectedRevision: q.expectedRevision,
            pendingRevision: r.snapshot.revision,
            requestId: r.requestId,
            response: r,
          });
        } else reject();
      } catch {
        wireFailure = true;
      }
      return raw;
    });
  };
  dialog.showMessageBox = async (...args) => {
    const o = args.at(-1),
      rollback = stage === 'ROLLBACK';
    const buttons = rollback
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
    const index = dialogIndex++;
    if (
      phase !== 'SETUP' ||
      stage === 'REOPEN' ||
      index > 2 ||
      o.title !== 'Thiết lập Android Platform Tools' ||
      o.message !== `Android Platform Tools ${expected.installTargetVersion}` ||
      o.defaultId !== 0 ||
      o.cancelId !== 0 ||
      o.noLink !== true ||
      JSON.stringify(o.buttons) !== JSON.stringify(buttons[index])
    )
      reject('DIALOG');
    return { response: (rollback ? [2, 2, 1] : [2, 1, 1])[index], checkboxChecked: false };
  };
  dialog.showOpenDialog = async (...args) => {
    const o = args.at(-1);
    if (
      phase !== 'SETUP' ||
      !['SEED', 'UPGRADE'].includes(stage) ||
      ++pickers !== 1 ||
      dialogIndex !== 2 ||
      o.title !== `Chọn Android Platform Tools ${expected.installTargetVersion} ZIP` ||
      JSON.stringify(o.properties) !== JSON.stringify(['openFile']) ||
      !['official-36.zip', 'official-37.zip'].includes(prepared.archiveFile)
    )
      reject('DIALOG');
    return { canceled: false, filePaths: [path.join(root, prepared.archiveFile)] };
  };
  shell.openExternal = async () => reject('DIALOG');
  async function run() {
    if (!context || ready !== 1 || registered.size !== 2) reject('CONTEXT');
    cases.mainReady = true;
    const windows = BrowserWindow.getAllWindows();
    if (windows.length !== 1) reject('CONTEXT');
    const wc = windows[0].webContents;
    const delay = () => new Promise((r) => setTimeout(r, 100));
    function current() {
      context.assertOwnedSync();
      if (failed || wireFailure || wc.isDestroyed()) reject();
    }
    async function js(code) {
      current();
      return await wc.executeJavaScript(code);
    }
    async function button(id) {
      if (
        (await js(
          `(()=>{const b=document.getElementById(${JSON.stringify(id)});if(!b||b.disabled)return false;b.click();return true;})()`,
        )) !== true
      )
        reject('CONTEXT');
    }
    function text(r, kind) {
      const s = r.snapshot;
      return kind === 'setup'
        ? `${r.outcome} / ${s.state} / ${s.code ?? 'OK'} / LOG ${r.loggingHealth}. Chỉ xác minh tệp; chưa khởi động ADB hoặc kết nối thiết bị.`
        : `${s.state} / ${s.code ?? 'OK'} / LOG ${r.loggingHealth}. ${s.state === 'VERIFIED' ? 'Đã quan sát phiên bản tại lần kiểm tra; không giám sát liên tục.' : 'Nhấn Đọc kết quả sau khi thao tác hoàn tất.'}`;
    }
    async function settled(kind, r, stop) {
      const prefix = kind === 'setup' ? 'platform-tools' : 'runtime-version';
      while (Date.now() < stop) {
        const rendered = await js(
          `(()=>{const b=document.getElementById('${prefix}-read'),s=document.getElementById('${prefix}-status');return b&&s?{pending:b.disabled,text:s.textContent}:null;})()`,
        );
        if (!rendered || typeof rendered.pending !== 'boolean' || typeof rendered.text !== 'string')
          reject('CONTEXT');
        if (/OUTCOME_UNKNOWN|NOT_STARTED|TIMEOUT|INTERNAL_FAILURE/.test(rendered.text)) reject();
        if (!rendered.pending) {
          if (rendered.text !== text(r, kind)) reject();
          return r.snapshot;
        }
        await delay();
      }
      reject('TIMEOUT');
    }
    async function read(kind, count, click = true) {
      const stop = Date.now() + 2000;
      if (click) await button(kind === 'setup' ? 'platform-tools-read' : 'runtime-version-read');
      while (Date.now() < stop) {
        current();
        const o = observations[kind];
        if (o.reads > count) reject('LIMIT');
        if (o.reads === count && o.last) return await settled(kind, o.last, stop);
        await delay();
      }
      reject('TIMEOUT');
    }
    async function request(kind, stop) {
      const ackUntil = Math.min(stop, Date.now() + 2000);
      await button(kind === 'setup' ? 'platform-tools-setup' : 'runtime-version-verify');
      while (Date.now() < ackUntil) {
        current();
        const pending = observations[kind].pending;
        if (pending) {
          await settled(kind, pending.response, ackUntil);
          return pending;
        }
        await delay();
      }
      reject('TIMEOUT');
    }
    async function retired(kind, stop) {
      const service = kind === 'setup' ? context.setup : context.versionService;
      while (!service.retired) {
        current();
        if (Date.now() >= stop) reject('TIMEOUT');
        const id = kind === 'setup' ? 'platform-tools-status' : 'runtime-version-status';
        if (
          await js(
            `/OUTCOME_UNKNOWN|NOT_STARTED|TIMEOUT|INTERNAL_FAILURE/.test(document.getElementById('${id}')?.textContent??'')`,
          )
        )
          reject();
        await delay();
      }
      current();
      if (Date.now() >= stop) reject('TIMEOUT');
    }
    function absent() {
      return !fs
        .readdirSync(launch)
        .some((n) => n === '.host-session' || n.startsWith('host-session'));
    }
    await button('open-help');
    phase = 'SETUP';
    await read('setup', 1, false); // Existing renderer hydration, not an additional campaign click.
    const initial = await read('setup', 2);
    const beforeRevision =
      stage === 'SEED' ? 0 : stage === 'UPGRADE' ? 1 : stage === 'ROLLBACK' ? 2 : 3;
    const beforeActive = stage === 'SEED' ? null : stage === 'ROLLBACK' ? '37.0.1' : '36.0.0';
    if (
      initial.operationId !== null ||
      initial.installationRevision !== beforeRevision ||
      initial.activeVersion !== beforeActive ||
      initial.installTargetVersion !== expected.installTargetVersion ||
      initial.state !== (stage === 'SEED' ? 'UNAVAILABLE' : 'VERIFIED_LOCAL') ||
      initial.rollbackAvailable !== ['ROLLBACK', 'REOPEN'].includes(stage)
    )
      reject('STAGE');
    let setupBinding = null,
      installed = initial;
    if (stage !== 'REOPEN') {
      const stop = Date.now() + 120000,
        pending = await request('setup', stop);
      if (
        pending.expectedRevision !== initial.revision ||
        pending.installationRevision !== beforeRevision
      )
        reject();
      await retired('setup', stop);
      installed = await read('setup', 3);
      if (
        installed.revision <= pending.pendingRevision ||
        installed.state !== 'VERIFIED_LOCAL' ||
        installed.operationId !== pending.operationId ||
        installed.installationRevision !== expected.installationRevision
      )
        reject();
      if (dialogIndex !== 3 || pickers !== (stage === 'ROLLBACK' ? 0 : 1)) reject('DIALOG');
      setupBinding = {
        operationId: pending.operationId,
        expectedRevision: pending.expectedRevision,
        pendingRevision: pending.pendingRevision,
        verifiedRevision: installed.revision,
        reads: 3,
        requestId: pending.requestId,
        action: expected.action,
      };
    } else if (dialogIndex !== 0 || pickers !== 0 || observations.setup.requests !== 0)
      reject('DIALOG');
    if (
      !context.setup.retired ||
      !context.runtimeCustody.retired ||
      !absent() ||
      installed.activeVersion !== expected.activeVersion ||
      installed.installTargetVersion !== expected.installTargetVersion ||
      installed.rollbackAvailable !== (stage !== 'SEED')
    )
      reject('RETIREMENT');
    cases.setupActionCorrect = true;
    cases.setupRetired = true;
    phase = 'VERSION';
    const first = await read('runtime', 1);
    if (
      first.state !== 'IDLE' ||
      first.installationRevision !== expected.installationRevision ||
      first.activeVersion !== expected.activeVersion ||
      first.installTargetVersion !== expected.installTargetVersion ||
      !context.versionService.retired ||
      !context.runtimeCustody.retired ||
      !absent()
    )
      reject('STAGE');
    const stop = Date.now() + 45000,
      pending = await request('runtime', stop);
    if (
      pending.expectedRevision !== first.revision ||
      pending.installationRevision !== first.installationRevision
    )
      reject();
    await retired('runtime', stop);
    const verified = await read('runtime', 2);
    if (
      verified.state !== 'VERIFIED' ||
      verified.installationRevision !== expected.installationRevision ||
      verified.activeVersion !== expected.activeVersion ||
      verified.installTargetVersion !== expected.installTargetVersion ||
      verified.revision <= pending.pendingRevision
    )
      reject();
    phase = 'RETIRE';
    if (
      !context.versionService.retired ||
      !context.setup.retired ||
      !context.runtimeCustody.retired ||
      !absent()
    )
      reject('RETIREMENT');
    cases.selectedReleaseObserved = true;
    cases.installTargetObserved = true;
    cases.versionObserved = true;
    cases.versionServiceRetired = true;
    cases.runtimeCustodyRetired = true;
    cases.helperDirectoryRemoved = true;
    const binding = {
      version: 1,
      stage,
      setup: setupBinding,
      runtime: {
        operationId: pending.operationId,
        installationRevision: pending.installationRevision,
        expectedRevision: pending.expectedRevision,
        pendingRevision: pending.pendingRevision,
        verifiedRevision: verified.revision,
        reads: 2,
        requestId: pending.requestId,
      },
    };
    validateBinding(binding);
    write(path.join(root, `rollback-${stage}-binding.json`), binding);
    phase = 'CLOSE';
    complete = true;
    app.quit();
  }
  try {
    const profile = process.env.FONESI_BOOTSTRAP_ROOT;
    if (typeof profile !== 'string' || profile !== path.resolve(profile)) reject('CONTEXT');
    launch = path.dirname(profile);
    ({ root, stage, prepared } = stageForLaunch(launch));
    require('./retained-rollback-control.cjs').verify(root);
    expected = EXPECTED[stage];
    console.log = (...args) => {
      if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') {
        ipcMain.handle = originalHandle;
        if (++ready !== 1) fail(Error('RETAINED_ROLLBACK_CONTEXT'));
        else setImmediate(() => run().catch(fail));
      }
      if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed++;
      originalLog.apply(console, args);
    };
    const main = mainForStage(root, stage),
      raw = bounded(main, 8388608);
    const manifest = JSON.parse(
      bounded(path.join(path.dirname(main), '.verified-build.json'), 65536),
    );
    if (hash(raw) !== manifest.outputs['main.cjs'] || hash(raw) !== prepared.originalMainSha256)
      reject('MAIN');
    const derived = deriveMain(
      new TextDecoder('utf8', { fatal: true }).decode(raw),
      __filename,
      stage,
    );
    if (hash(derived) !== prepared.derivedMainSha256) reject('MAIN');
    const loaded = new Module(main, module);
    loaded.filename = main;
    loaded.paths = Module._nodeModulePaths(path.dirname(main));
    loaded._compile(derived, main);
    loaded.loaded = true;
    app.on('will-quit', () => {
      try {
        if (
          !complete ||
          ready !== 1 ||
          closed !== 1 ||
          wireFailure ||
          !context.versionService.retired ||
          !context.setup.retired ||
          !context.runtimeCustody.retired ||
          observations.runtime.requests !== 1 ||
          observations.runtime.reads !== 2 ||
          observations.setup.requests !== (stage === 'REOPEN' ? 0 : 1) ||
          observations.setup.reads !== (stage === 'REOPEN' ? 2 : 3)
        )
          reject('RETIREMENT');
        cases.mainClosed = true;
        const observed = {
          version: 1,
          scope: SCOPE,
          stage,
          cases,
          readyCount: ready,
          closedCount: closed,
        };
        validateObserved(observed);
        write(path.join(root, `rollback-${stage}-observed.json`), observed);
        write(require('./persistence-launch-e2e-control.cjs').witnessPath(launch, 'ui'), {
          version: 1,
          ready: true,
          quitRequested: true,
          closed: true,
        });
        clearTimeout(deadline);
      } catch (error) {
        fail(error);
      }
    });
  } catch (error) {
    fail(error);
  }
}
module.exports = { bindContext, response, bounded, runObserver };
runObserver();
