'use strict';
function runObserver() {
  // Verification-only injected native answers; never genuine recipient consent.
  const { app, BrowserWindow, ipcMain, safeStorage, dialog, shell } = require('electron');
  const fs = require('node:fs'),
    path = require('node:path'),
    { createHash } = require('node:crypto');
  const {
    FIRST_CASES,
    REOPEN_CASES,
    PHASES,
    SCOPE,
    validateResult,
    saveImage,
    rootForLaunch,
    write,
  } = require('./recipient-setup-contract.cjs');
  const { securePreferences } = require('../build/window-policy.cjs');
  const candidate = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'platform-tools-candidate.json'), 'utf8'),
  );
  let root,
    launch,
    window,
    handler,
    mode,
    ready = 0,
    closed = 0,
    complete = false,
    phase = 'PREPARE',
    cases;
  let nativeCalls = 0,
    termsCalls = 0,
    holdRelease = null;
  const queue = [],
    responses = [],
    screenshots = {};
  const handle = ipcMain.handle,
    log = console.log;
  ipcMain.handle = function (channel, callback) {
    if (channel !== 'foundation:platform-tools:v1') return handle.call(this, channel, callback);
    if (handler) throw Error('SETUP_HANDLER');
    handler = callback;
    ipcMain.handle = handle;
    return handle.call(this, channel, async function (...args) {
      const result = await callback.apply(this, args);
      responses.push({ request: JSON.parse(args[1]), response: parse(result) });
      return result;
    });
  };
  function parse(raw) {
    const v = JSON.parse(raw);
    if (
      v?.version !== 1 ||
      typeof v.ok !== 'boolean' ||
      !['AVAILABLE', 'DEGRADED'].includes(v.loggingHealth)
    )
      throw Error('SETUP_RESPONSE');
    const keys = v.ok
      ? ['version', 'requestId', 'ok', 'outcome', 'snapshot', 'diagnosticId', 'loggingHealth']
      : ['version', 'requestId', 'ok', 'outcome', 'code', 'diagnosticId', 'loggingHealth'];
    if (JSON.stringify(Object.keys(v).sort()) !== JSON.stringify(keys.sort()))
      throw Error('SETUP_RESPONSE');
    if (v.ok) {
      const a = v.snapshot;
      if (
        !a ||
        JSON.stringify(Object.keys(a).sort()) !==
          JSON.stringify(
            [
              'revision',
              'installationRevision',
              'state',
              'operationId',
              'code',
              'candidateVersion',
            ].sort(),
          ) ||
        !Number.isSafeInteger(a.revision) ||
        a.revision < 0 ||
        !(
          a.installationRevision === null ||
          (Number.isSafeInteger(a.installationRevision) && a.installationRevision >= 0)
        ) ||
        a.candidateVersion !== '37.0.1' ||
        !['OBSERVED', 'PENDING'].includes(v.outcome)
      )
        throw Error('SETUP_RESPONSE');
    }
    return v;
  }
  function next(kind) {
    nativeCalls++;
    const item = queue.shift();
    if (!item || item.kind !== kind) throw Error('SETUP_DIALOG');
    return item;
  }
  dialog.showMessageBox = async (...args) => {
    const options = args.at(-1),
      item = next('message');
    if (
      options.title !== 'Thiết lập Android Platform Tools' ||
      options.defaultId !== 0 ||
      options.cancelId !== 0 ||
      options.buttons[0] !== 'Hủy' ||
      JSON.stringify(options.buttons) !== JSON.stringify(item.buttons)
    )
      throw Error('SETUP_DIALOG');
    if (item.hold)
      return new Promise((resolve) => {
        holdRelease = () => resolve({ response: item.answer });
      });
    return { response: item.answer };
  };
  dialog.showOpenDialog = async (...args) => {
    const options = args.at(-1),
      item = next('picker');
    if (
      JSON.stringify(options.properties) !== JSON.stringify(['openFile']) ||
      options.filters.length !== 1 ||
      JSON.stringify(options.filters[0].extensions) !== JSON.stringify(['zip'])
    )
      throw Error('SETUP_PICKER');
    if (item.cancel) return { canceled: true, filePaths: [] };
    const file = path.join(root, item.file);
    verifyArchive(file, item.file === 'official.zip');
    return { canceled: false, filePaths: [file] };
  };
  shell.openExternal = async (url) => {
    if (url !== 'https://developer.android.com/studio/terms') throw Error('SETUP_URL');
    termsCalls++;
  };
  const terms = ['Hủy', 'Mở điều khoản', 'Tôi đã đọc và đồng ý'],
    routes = ['Hủy', 'Chọn tệp ZIP', 'Tải từ Google'],
    final = ['Hủy', 'Xác nhận thiết lập'];
  const message = (buttons, answer, hold = false) => ({ kind: 'message', buttons, answer, hold });
  function local(file) {
    return [message(terms, 2), message(routes, 1), { kind: 'picker', file }, message(final, 1)];
  }
  function verifyArchive(file, official) {
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.size !== candidate.archive.bytes ||
      fs.realpathSync.native(file) !== file
    )
      throw Error('SETUP_ARCHIVE');
    const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if ((hash === candidate.archive.sha256) !== official) throw Error('SETUP_ARCHIVE');
  }
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const execute = (code) => window.webContents.executeJavaScript(code);
  async function poll(fn, ms = 10000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (await fn()) return;
      await pause(25);
    }
    throw Error('SETUP_WAIT');
  }
  function fail() {
    clearTimeout(deadline);
    if (PHASES.includes(phase)) fs.writeSync(2, `RECIPIENT_SETUP_PHASE_${phase}\n`);
    fs.writeSync(2, 'RECIPIENT_SETUP_FAILED\n');
    app.exit(1);
  }
  const deadline = setTimeout(fail, 110000);
  async function click(selector) {
    await execute(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('CONTROL');e.click();return true;})()`,
    );
  }
  async function read() {
    return parse(await execute('window.platformTools.read()'));
  }
  async function visibleRead() {
    const before = responses.length;
    await poll(() => execute("!document.getElementById('platform-tools-read').disabled"));
    await click('#platform-tools-read');
    await poll(
      () =>
        responses.slice(before).some((x) => x.request.method === 'platformTools.get') &&
        execute(
          "!document.getElementById('platform-tools-read').disabled && document.getElementById('platform-tools-status').textContent.startsWith('OBSERVED / ')",
        ),
    );
  }
  function absent() {
    try {
      fs.lstatSync(path.join(path.dirname(launch), 'data-main', 'platform-tools-runtime'));
      return false;
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      throw error;
    }
  }
  async function settled(state, code, revision, afterRevision = -1) {
    let value;
    await poll(async () => {
      value = await read();
      if (!value.ok) throw Error('SETUP_READ');
      return (
        value.snapshot.revision > afterRevision &&
        value.snapshot.state === state &&
        value.snapshot.code === code &&
        (revision === undefined || value.snapshot.installationRevision === revision)
      );
    }, 60000);
    await visibleRead();
    return value.snapshot;
  }
  async function scenario(items, state, code) {
    await visibleRead();
    const before = (await read()).snapshot.revision;
    queue.push(...items);
    await click('#platform-tools-setup');
    await settled(state, code, undefined, before);
    if (queue.length !== 0) throw Error('SETUP_QUEUE');
    if (!absent()) throw Error('SETUP_EARLY_FILES');
  }
  function physical() {
    const dir = path.join(
      path.dirname(launch),
      'data-main',
      'platform-tools-runtime',
      'runtimes',
      `runtime-${candidate.archive.sha256}`,
    );
    const names = [];
    const directory = fs.opendirSync(dir);
    try {
      let entry = directory.readSync();
      while (entry !== null) {
        if (names.length >= 14) throw Error('SETUP_FILES');
        names.push(entry.name);
        entry = directory.readSync();
      }
    } finally {
      directory.closeSync();
    }
    names.sort();
    if (JSON.stringify(names) !== JSON.stringify(candidate.files.map((x) => x.path).sort()))
      throw Error('SETUP_FILES');
    for (const row of candidate.files) {
      const f = path.join(dir, row.path),
        stat = fs.lstatSync(f);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        stat.size !== row.bytes ||
        fs.realpathSync.native(f) !== f ||
        createHash('sha256').update(fs.readFileSync(f)).digest('hex') !== row.sha256
      )
        throw Error('SETUP_FILES');
    }
    return true;
  }
  async function fleetUnavailable() {
    const v = JSON.parse(await execute('window.fleet.read()'));
    return (
      v.ok === true &&
      v.fleet.availability === 'UNAVAILABLE' &&
      v.fleet.reason === 'BINARY_UNAVAILABLE' &&
      v.fleet.devices.length === 0
    );
  }
  async function capture(theme) {
    await execute(
      "document.getElementById('platform-tools-panel').scrollIntoView({block:'start'})",
    );
    await poll(() =>
      execute(
        "(()=>{const ids=['platform-tools-read','platform-tools-setup','platform-tools-status'];return ids.every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});})()",
      ),
    );
    await poll(() =>
      execute(
        `document.documentElement.dataset.theme===${JSON.stringify(theme)}&&!!document.getElementById('platform-tools-panel')`,
      ),
    );
    const shape = await execute(
      "({w:innerWidth,h:innerHeight,dialogs:document.querySelectorAll('[role=dialog]').length,tabs:document.querySelectorAll('button[data-page]').length,tiles:document.querySelectorAll('.wall-screen').length,text:document.getElementById('platform-tools-status').textContent})",
    );
    if (
      shape.w !== 1024 ||
      shape.h !== 768 ||
      shape.dialogs !== 1 ||
      shape.tabs !== 6 ||
      shape.tiles !== 0 ||
      !shape.text.startsWith('OBSERVED / VERIFIED_LOCAL / OK')
    )
      throw Error('SETUP_LAYOUT');
    screenshots[theme] = saveImage(root, theme, await window.webContents.capturePage());
    cases[`${theme}Layout`] = true;
  }
  async function direct(contents, frame) {
    return parse(
      await handler(
        { sender: contents, senderFrame: frame },
        '{"version":1,"requestId":"p900","method":"platformTools.get"}',
      ),
    );
  }
  async function run() {
    phase = 'MIGRATION';
    if (mode === 'FIRST') {
      const { observeSchema4 } = require('./fleet-ui-schema4.cjs');
      if ((await observeSchema4(launch, safeStorage)) !== true) throw Error('SETUP_SCHEMA');
      write(path.join(root, 'schema4-observed.json'), {
        version: 2,
        migration3BackupAuthenticated: true,
        migration4ReceiptBound: true,
        durableStartupCommitted: true,
        captureStoreEmpty: true,
      });
    } else {
      const { observeReopenStartup } = require('./recipient-setup-control.cjs');
      if ((await observeReopenStartup(launch)) !== true) throw Error('SETUP_REOPEN');
      cases.secondStartupObserved = true;
    }
    phase = 'HYDRATE';
    window = BrowserWindow.getAllWindows()[0];
    if (!window || BrowserWindow.getAllWindows().length !== 1) throw Error('SETUP_WINDOW');
    window.setContentSize(1024, 768);
    await poll(() => execute("!!document.getElementById('help-top')"));
    await click('#help-top');
    await poll(() => execute("!!document.getElementById('platform-tools-read')"));
    await visibleRead();
    cases.mainReady = ready === 1;
    const initial = await read();
    if (!initial.ok) throw Error('SETUP_INITIAL');
    if (mode === 'REOPEN') {
      phase = 'REOPEN';
      cases.persistedVerifiedLocal =
        initial.snapshot.state === 'VERIFIED_LOCAL' && initial.snapshot.code === null && physical();
      cases.installationRevisionRetained = initial.snapshot.installationRevision === 2;
      cases.noAutomaticConsent = nativeCalls === 0 && termsCalls === 0;
      cases.fleetStillUnavailable = await fleetUnavailable();
    } else {
      cases.initialStatus =
        initial.snapshot.state === 'UNAVAILABLE' && initial.snapshot.installationRevision === 0;
      phase = 'TERMS_CANCEL';
      await scenario([message(terms, 0)], 'DECLINED', 'TERMS_DECLINED');
      cases.termsCancel = true;
      phase = 'TERMS_PAGE';
      await scenario([message(terms, 1)], 'DECLINED', 'TERMS_REQUIRED');
      cases.termsPageNoConsent = termsCalls === 1;
      phase = 'ROUTE_CANCEL';
      await scenario([message(terms, 2), message(routes, 0)], 'DECLINED', 'SETUP_CANCELLED');
      cases.routeCancel = true;
      phase = 'PICKER_CANCEL';
      await scenario(
        [message(terms, 2), message(routes, 1), { kind: 'picker', cancel: true }],
        'DECLINED',
        'SETUP_CANCELLED',
      );
      cases.pickerCancel = true;
      phase = 'FINAL_CANCEL';
      await scenario(
        [
          message(terms, 2),
          message(routes, 1),
          { kind: 'picker', file: 'official.zip' },
          message(final, 0),
        ],
        'DECLINED',
        'SETUP_CANCELLED',
      );
      cases.finalCancel = true;
      cases.noCoreBeforeConsent = absent();
      phase = 'PENDING';
      await visibleRead();
      queue.push(message(terms, 0, true));
      const before = responses.length;
      await click('#platform-tools-setup');
      await poll(
        () =>
          holdRelease !== null &&
          responses
            .slice(before)
            .some(
              (x) =>
                x.request.method === 'platformTools.setup.request' &&
                x.response.ok &&
                x.response.outcome === 'PENDING',
            ) &&
          execute(
            "!document.getElementById('platform-tools-read').disabled && document.getElementById('platform-tools-status').textContent.startsWith('PENDING / AWAITING_RECIPIENT / ')",
          ),
      );
      cases.pendingAcknowledged = true;
      const held = await read();
      cases.pendingReadObserved = held.ok && held.snapshot.state === 'AWAITING_RECIPIENT';
      const count = nativeCalls;
      const duplicate = parse(
        await execute(`window.platformTools.requestSetup(${held.snapshot.revision})`),
      );
      cases.duplicateBusy = !duplicate.ok && duplicate.code === 'BUSY' && nativeCalls === count;
      holdRelease();
      holdRelease = null;
      await settled('DECLINED', 'TERMS_DECLINED');
      if (!absent()) throw Error('SETUP_EARLY_FILES');
      phase = 'WRONG_HASH';
      await visibleRead();
      queue.push(...local('wrong-hash.zip'));
      await click('#platform-tools-setup');
      const failed = await settled('FAILED', 'ARCHIVE_REJECTED', 1);
      const rejectedRuntime = fs.opendirSync(
        path.join(path.dirname(launch), 'data-main', 'platform-tools-runtime', 'runtimes'),
      );
      let noRuntime;
      try {
        noRuntime = rejectedRuntime.readSync() === null;
      } finally {
        rejectedRuntime.closeSync();
      }
      cases.wrongHashRejected = failed.code === 'ARCHIVE_REJECTED' && noRuntime;
      cases.revisionReconciled = failed.installationRevision === 1;
      phase = 'INSTALL';
      await visibleRead();
      queue.push(...local('official.zip'));
      await click('#platform-tools-setup');
      await settled('VERIFIED_LOCAL', null, 2);
      cases.localArchiveVerified = physical();
      cases.fleetStillUnavailable = await fleetUnavailable();
      phase = 'LIGHT';
      await capture('light');
      phase = 'DARK';
      let previous = null,
        stable = 0;
      await poll(async () => {
        const v = JSON.parse(await execute('window.preferences.read()'));
        if (!v.ok) {
          if (v.code === 'BUSY') return false;
          throw Error('SETUP_PREFS');
        }
        if (v.settings.revision === previous) stable++;
        else {
          previous = v.settings.revision;
          stable = 0;
        }
        await pause(125);
        return stable >= 3;
      });
      await click('#preferences-read');
      await poll(() => execute("!document.getElementById('preferences-theme').disabled"));
      await click('#preferences-theme');
      await poll(() =>
        execute(
          "document.documentElement.dataset.theme==='dark'&&document.getElementById('preferences-status').textContent.startsWith('COMMITTED / PERSISTED / ')",
        ),
      );
      await capture('dark');
      phase = 'SENDER';
      const foreign = new BrowserWindow({
        show: false,
        webPreferences: securePreferences(window.webContents.session),
      });
      try {
        const denied = await direct(foreign.webContents, foreign.webContents.mainFrame);
        cases.foreignSenderDenied = !denied.ok && denied.code === 'UNTRUSTED_SENDER';
      } finally {
        foreign.destroy();
      }
      phase = 'SUBFRAME';
      await execute(
        "(()=>{const f=document.createElement('iframe');f.id='setup-owned-empty-frame';document.body.append(f);return true;})()",
      );
      let frame;
      await poll(() => {
        frame = window.webContents.mainFrame.frames.find(
          (f) => f.parent === window.webContents.mainFrame,
        );
        return frame !== undefined;
      });
      const denied = await direct(window.webContents, frame);
      cases.subframeDenied = !denied.ok && denied.code === 'UNTRUSTED_SENDER';
      await execute("document.getElementById('setup-owned-empty-frame').remove()");
    }
    if (
      queue.length ||
      (mode === 'FIRST' ? FIRST_CASES : REOPEN_CASES)
        .filter((k) => k !== 'mainClosed')
        .some((k) => cases[k] !== true)
    )
      throw Error('SETUP_CASES');
    phase = 'CLOSE';
    complete = true;
    app.quit();
  }
  try {
    const profile = process.env.FONESI_BOOTSTRAP_ROOT;
    if (typeof profile !== 'string' || profile !== path.resolve(profile))
      throw Error('SETUP_PROFILE');
    launch = path.dirname(profile);
    root = rootForLaunch(launch);
    try {
      const stat = fs.lstatSync(path.join(root, 'first-release.json'));
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error('SETUP_MODE');
      mode = 'REOPEN';
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      mode = 'FIRST';
    }
    cases = Object.fromEntries(
      (mode === 'FIRST' ? FIRST_CASES : REOPEN_CASES).map((k) => [k, false]),
    );
    console.log = (...args) => {
      if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') {
        ready++;
        if (ready !== 1) fail();
        else setImmediate(() => run().catch(fail));
      }
      if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed++;
      log.apply(console, args);
    };
    require('../build/main.cjs');
    app.on('will-quit', () => {
      try {
        if (!complete || ready !== 1 || closed !== 1) throw Error('SETUP_CLOSE');
        cases.mainClosed = true;
        const result = {
          version: 1,
          scope: SCOPE,
          mode,
          cases,
          screenshots,
          readyCount: ready,
          closedCount: closed,
        };
        if (!validateResult(result).passed) throw Error('SETUP_CASES');
        write(
          path.join(
            root,
            mode === 'FIRST' ? 'setup-first-result.json' : 'setup-reopen-result.json',
          ),
          result,
        );
        write(path.join(root, `launcher-witness-${path.basename(launch).slice(7)}-ui.json`), {
          version: 1,
          ready: true,
          quitRequested: true,
          closed: true,
        });
        clearTimeout(deadline);
      } catch {
        fail();
      }
    });
  } catch {
    fail();
  }
}
try {
  runObserver();
} catch {
  require('node:fs').writeSync(2, 'RECIPIENT_SETUP_PHASE_PREPARE\nRECIPIENT_SETUP_FAILED\n');
  require('electron').app.exit(1);
}
