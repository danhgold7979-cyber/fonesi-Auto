'use strict';
// Actual renderer/preload/IPC/main VERSION; instrumentation observes replies, never substitutes them.
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module');
const { createHash } = require('node:crypto');
const {
  CASES,
  PHASES,
  SCOPE,
  validateObserved,
  validateBinding,
  response,
  deriveMain,
  write,
  rootForLaunch,
  reason,
} = require('./main-runtime-version-contract.cjs');
let context = null;
function bindContext(value) {
  if (
    context !== null ||
    !Object.isFrozen(value) ||
    JSON.stringify(Object.keys(value)) !==
      JSON.stringify(['entry', 'runtimeCustody', 'setup', 'versionService', 'assertOwnedSync']) ||
    typeof value.assertOwnedSync !== 'function' ||
    !value.versionService
  )
    throw Error('MAIN_RUNTIME_CONTEXT');
  value.assertOwnedSync();
  context = value;
}
function bounded(file, max) {
  const s = fs.lstatSync(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    s.size < 1 ||
    s.size > max ||
    fs.realpathSync.native(file) !== file
  )
    throw Error('MAIN_RUNTIME_FILE');
  const fd = fs.openSync(file, 'r');
  try {
    const before = fs.fstatSync(fd),
      b = Buffer.alloc(s.size + 1);
    let n = 0;
    while (n < b.length) {
      const got = fs.readSync(fd, b, n, b.length - n, null);
      if (!got) break;
      n += got;
    }
    const after = fs.fstatSync(fd);
    if (
      n !== s.size ||
      before.ino !== s.ino ||
      before.dev !== s.dev ||
      after.size !== s.size ||
      after.mtimeMs !== before.mtimeMs
    )
      throw Error('MAIN_RUNTIME_FILE');
    return b.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}
const hash = (b) => createHash('sha256').update(b).digest('hex');
function runObserver() {
  const { app, dialog, shell, safeStorage, ipcMain, BrowserWindow } = require('electron');
  let phase = 'PREPARE',
    root,
    launch,
    ready = 0,
    closed = 0,
    complete = false,
    failed = false,
    dialogIndex = 0,
    request = 0;
  const cases = Object.fromEntries(CASES.map((k) => [k, false]));
  const originalLog = console.log,
    originalHandle = ipcMain.handle;
  let registered = false,
    requestCount = 0,
    readCount = 0,
    pending = null,
    lastRead = null,
    lastReadHealth = null,
    wireFailure = false;
  const deadline = setTimeout(() => fail(Error('MAIN_RUNTIME_TIMEOUT')), 210000);
  function fail(error) {
    if (failed) return;
    failed = true;
    try {
      fs.writeSync(
        2,
        `MAIN_RUNTIME_VERSION_PHASE_${PHASES.includes(phase) ? phase : 'PREPARE'}\nMAIN_RUNTIME_VERSION_REASON_${reason(error)}\nMAIN_RUNTIME_VERSION_FAILED\n`,
      );
    } catch {
    } finally {
      clearTimeout(deadline);
      app.exit(1);
    }
  }
  // One exact registration wrapper; original sender/arguments and returned bytes are unchanged.
  ipcMain.handle = function (channel, handler) {
    if (channel !== 'foundation:runtime-version:v1')
      return originalHandle.call(this, channel, handler);
    if (registered) throw Error('MAIN_RUNTIME_CONTEXT');
    registered = true;
    return originalHandle.call(this, channel, async function (event, ...args) {
      const raw = await handler.call(this, event, ...args);
      try {
        if (args.length !== 1 || typeof args[0] !== 'string' || Buffer.byteLength(args[0]) > 8192)
          throw Error();
        const q = JSON.parse(args[0]),
          r = response(raw);
        if (q.requestId !== r.requestId) throw Error();
        if (q.method === 'runtimeVersion.request') {
          if (
            ++requestCount !== 1 ||
            r.outcome !== 'PENDING' ||
            pending !== null ||
            !Number.isSafeInteger(q.expectedRevision) ||
            q.expectedRevision < 0 ||
            q.expectedInstallationRevision !== r.snapshot.installationRevision
          )
            throw Error();
          pending = Object.freeze({
            operationId: r.snapshot.operationId,
            installationRevision: r.snapshot.installationRevision,
            expectedRevision: q.expectedRevision,
            pendingRevision: r.snapshot.revision,
            requestId: r.requestId,
          });
        } else if (q.method === 'runtimeVersion.get') {
          if (++readCount > 41 || r.outcome !== 'OBSERVED') throw Error();
          lastRead = r.snapshot;
          lastReadHealth = r.loggingHealth;
        } else throw Error();
      } catch {
        wireFailure = true;
      }
      return raw;
    });
  };
  function current() {
    try {
      context.assertOwnedSync();
      return !failed;
    } catch {
      return false;
    }
  }
  async function read() {
    const r = JSON.parse(
      await context.setup.execute(
        { version: 1, requestId: `p${++request}`, method: 'platformTools.get' },
        current,
      ),
    );
    if (!r.ok || r.outcome !== 'OBSERVED') throw Error('MAIN_RUNTIME_SETUP');
    return r.snapshot;
  }
  async function poll(fn) {
    const stop = Date.now() + 120000;
    while (Date.now() < stop) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error('MAIN_RUNTIME_TIMEOUT');
  }
  dialog.showMessageBox = async (...args) => {
    const o = args.at(-1);
    const expected = [
      ['Hủy', 'Mở điều khoản', 'Tôi đã đọc và đồng ý'],
      ['Hủy', 'Chọn tệp ZIP', 'Tải từ Google'],
      ['Hủy', 'Xác nhận thiết lập'],
    ];
    const index = dialogIndex++;
    if (
      phase !== 'SETUP' ||
      index > 2 ||
      o.title !== 'Thiết lập Android Platform Tools' ||
      o.defaultId !== 0 ||
      o.cancelId !== 0 ||
      JSON.stringify(o.buttons) !== JSON.stringify(expected[index])
    )
      throw Error('MAIN_RUNTIME_DIALOG');
    return { response: [2, 1, 1][index], checkboxChecked: false };
  };
  let pickers = 0;
  dialog.showOpenDialog = async (...args) => {
    const o = args.at(-1);
    if (
      phase !== 'SETUP' ||
      ++pickers !== 1 ||
      dialogIndex !== 2 ||
      o.title !== 'Chọn Android Platform Tools 37.0.1 ZIP' ||
      JSON.stringify(o.properties) !== JSON.stringify(['openFile'])
    )
      throw Error('MAIN_RUNTIME_DIALOG');
    return { canceled: false, filePaths: [path.join(root, 'official.zip')] };
  };
  shell.openExternal = async () => {
    throw Error('MAIN_RUNTIME_TERMS_NOT_OPENED');
  };
  async function run() {
    if (!context || ready !== 1 || !registered) throw Error('MAIN_RUNTIME_CONTEXT');
    cases.mainReady = true;
    phase = 'MIGRATION';
    if ((await require('./fleet-ui-schema4.cjs').observeSchema4(launch, safeStorage)) !== true)
      throw Error('MAIN_RUNTIME_SCHEMA');
    write(path.join(root, 'schema4-observed.json'), {
      version: 2,
      migration3BackupAuthenticated: true,
      migration4ReceiptBound: true,
      durableStartupCommitted: true,
      captureStoreEmpty: true,
    });
    cases.schema4Observed = true;
    phase = 'SETUP';
    const initial = await read();
    if (initial.state !== 'UNAVAILABLE' || initial.installationRevision !== 0)
      throw Error('MAIN_RUNTIME_SETUP');
    const ack = JSON.parse(
      await context.setup.execute(
        {
          version: 1,
          requestId: `p${++request}`,
          method: 'platformTools.setup.request',
          expectedRevision: initial.revision,
        },
        current,
      ),
    );
    if (!ack.ok || ack.outcome !== 'PENDING') throw Error('MAIN_RUNTIME_PENDING');
    await poll(() => context.setup.retired);
    const installed = await read();
    if (
      installed.state !== 'VERIFIED_LOCAL' ||
      installed.installationRevision !== 1 ||
      installed.code !== null ||
      !context.setup.retired
    )
      throw Error('MAIN_RUNTIME_SETUP');
    if (dialogIndex !== 3 || pickers !== 1 || !context.runtimeCustody.retired)
      throw Error('MAIN_RUNTIME_CUSTODY');
    cases.archiveProvisioned = true;
    cases.setupRetired = true;
    const windows = BrowserWindow.getAllWindows();
    if (windows.length !== 1) throw Error('MAIN_RUNTIME_UI_CONTROL');
    const wc = windows[0].webContents;
    const js = async (code) => {
      currentOrFail();
      return await wc.executeJavaScript(code);
    };
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    function currentOrFail() {
      if (!current() || wireFailure || wc.isDestroyed()) throw Error('MAIN_RUNTIME_RESPONSE');
    }
    async function button(id) {
      const ok = await js(
        `(()=>{const b=document.getElementById(${JSON.stringify(id)});if(!b||b.disabled)return false;b.click();return true;})()`,
      );
      if (ok !== true) throw Error('MAIN_RUNTIME_UI_CONTROL');
    }
    async function responseRead(expected, stop) {
      while (Date.now() < stop) {
        currentOrFail();
        if (readCount === expected && lastRead) {
          const rendered = await js(
            `(()=>{const b=document.getElementById('runtime-version-read'),s=document.getElementById('runtime-version-status');return b&&s?{pending:b.disabled,text:s.textContent}:null;})()`,
          );
          if (
            !rendered ||
            typeof rendered.pending !== 'boolean' ||
            typeof rendered.text !== 'string'
          )
            throw Error('MAIN_RUNTIME_UI_CONTROL');
          if (!rendered.pending) {
            const expectedText = `${lastRead.state} / OK / LOG ${lastReadHealth}. ${lastRead.state === 'VERIFIED' ? 'Đã quan sát phiên bản tại lần kiểm tra; không giám sát liên tục.' : 'Nhấn Đọc kết quả sau khi thao tác hoàn tất.'}`;
            if (rendered.text !== expectedText) throw Error('MAIN_RUNTIME_RESPONSE');
            return lastRead;
          }
        }
        if (readCount > expected) throw Error('MAIN_RUNTIME_READ_LIMIT');
        await delay(25);
      }
      throw Error('MAIN_RUNTIME_TIMEOUT');
    }
    phase = 'HELP';
    await button('open-help');
    if (
      (await js(
        `Boolean(document.getElementById('runtime-version-read')&&document.getElementById('runtime-version-verify')?.disabled)`,
      )) !== true
    )
      throw Error('MAIN_RUNTIME_UI_CONTROL');
    cases.versionControlsPresent = true;
    phase = 'READ';
    await button('runtime-version-read');
    const first = await responseRead(1, Date.now() + 2000);
    if (
      first.state !== 'IDLE' ||
      first.installationRevision !== 1 ||
      !context.versionService.retired ||
      !context.runtimeCustody.retired ||
      fs.readdirSync(launch).some((n) => n === '.host-session' || n.startsWith('host-session'))
    )
      throw Error('MAIN_RUNTIME_CUSTODY');
    cases.readOnlyNoHelper = true;
    // Wait only for the completed renderer response to enable its one explicit effect control.
    const enabledUntil = Date.now() + 2000;
    while (await js(`document.getElementById('runtime-version-verify')?.disabled!==false`)) {
      if (Date.now() >= enabledUntil) throw Error('MAIN_RUNTIME_UI_CONTROL');
      await delay(25);
    }
    phase = 'VERIFY';
    const stop = Date.now() + 45000;
    await button('runtime-version-verify');
    const pendingUntil = Math.min(stop, Date.now() + 2000);
    while (!pending) {
      currentOrFail();
      if (Date.now() >= pendingUntil) throw Error('MAIN_RUNTIME_TIMEOUT');
      await delay(25);
    }
    if (
      requestCount !== 1 ||
      pending.installationRevision !== first.installationRevision ||
      pending.expectedRevision !== first.revision
    )
      throw Error('MAIN_RUNTIME_BINDING');
    while (
      await js(
        `!document.getElementById('runtime-version-status')?.textContent.includes('PENDING')`,
      )
    ) {
      if (Date.now() >= pendingUntil) throw Error('MAIN_RUNTIME_PENDING');
      await delay(25);
    }
    cases.pendingAcknowledged = true;
    phase = 'RECONCILE';
    let verified = null;
    for (let count = 0; count < 40 && Date.now() < stop; count++) {
      await delay(1000);
      if (Date.now() >= stop) break;
      currentOrFail();
      const expected = readCount + 1;
      await button('runtime-version-read');
      const s = await responseRead(expected, Math.min(stop, Date.now() + 2000));
      if (s.state === 'VERIFIED') {
        verified = s;
        break;
      }
      if (
        s.state !== 'PENDING' ||
        s.operationId !== pending.operationId ||
        s.installationRevision !== pending.installationRevision
      )
        throw Error('MAIN_RUNTIME_VERIFY');
    }
    if (!verified) throw Error('MAIN_RUNTIME_TIMEOUT');
    if (
      verified.installationRevision !== pending.installationRevision ||
      verified.revision <= pending.pendingRevision ||
      verified.operationId !== null
    )
      throw Error('MAIN_RUNTIME_BINDING');
    while (
      await js(
        `!document.getElementById('runtime-version-status')?.textContent.includes('VERIFIED')`,
      )
    ) {
      if (Date.now() >= stop) throw Error('MAIN_RUNTIME_UI_CONTROL');
      await delay(25);
    }
    cases.versionVerified = true;
    cases.installationBound = true;
    phase = 'RETIRE';
    while (!context.versionService.retired) {
      currentOrFail();
      if (Date.now() >= stop) throw Error('MAIN_RUNTIME_TIMEOUT');
      await delay(25);
    }
    if (
      !context.runtimeCustody.retired ||
      fs.readdirSync(launch).some((n) => n === '.host-session' || n.startsWith('host-session'))
    )
      throw Error('MAIN_RUNTIME_CUSTODY');
    cases.helperAbsent = true;
    cases.serviceRetired = true;
    const binding = {
      version: 1,
      operationId: pending.operationId,
      installationRevision: pending.installationRevision,
      expectedRevision: pending.expectedRevision,
      pendingRevision: pending.pendingRevision,
      verifiedRevision: verified.revision,
      reads: readCount,
      requestId: pending.requestId,
    };
    validateBinding(binding);
    write(path.join(root, 'main-runtime-version-binding.json'), binding);
    phase = 'CLOSE';
    complete = true;
    app.quit();
  }
  try {
    const profile = process.env.FONESI_BOOTSTRAP_ROOT;
    if (typeof profile !== 'string' || profile !== path.resolve(profile))
      throw Error('MAIN_RUNTIME_CONTEXT');
    launch = path.dirname(profile);
    root = rootForLaunch(launch);
    console.log = (...args) => {
      if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') {
        ipcMain.handle = originalHandle;
        if (++ready !== 1) fail(Error('MAIN_RUNTIME_CONTEXT'));
        else setImmediate(() => run().catch(fail));
      }
      if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed++;
      originalLog.apply(console, args);
    };
    const main = path.resolve(__dirname, '../build/main.cjs'),
      raw = bounded(main, 8388608),
      manifest = JSON.parse(
        bounded(path.resolve(__dirname, '../build/.verified-build.json'), 65536),
      ),
      proof = JSON.parse(bounded(path.join(root, 'copy.json'), 65536));
    if (hash(raw) !== manifest.outputs['main.cjs'] || hash(raw) !== proof.originalMainSha256)
      throw Error('MAIN_RUNTIME_MAIN');
    const derived = deriveMain(new TextDecoder('utf8', { fatal: true }).decode(raw), __filename);
    if (hash(derived) !== proof.derivedMainSha256) throw Error('MAIN_RUNTIME_MAIN');
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
          !context.versionService.retired ||
          requestCount !== 1 ||
          wireFailure
        )
          throw Error('MAIN_RUNTIME_CLOSE');
        cases.mainClosed = true;
        const result = { version: 1, scope: SCOPE, cases, readyCount: ready, closedCount: closed };
        if (!validateObserved(result).passed) throw Error('MAIN_RUNTIME_CASES');
        write(path.join(root, 'main-runtime-version-observed.json'), result);
        write(path.join(root, `launcher-witness-${path.basename(launch).slice(7)}-ui.json`), {
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
module.exports = { bindContext, runObserver };
runObserver();
