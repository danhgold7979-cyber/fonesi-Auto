'use strict';
function runObserver() {
  // Verification-only observer. Actual compiled main/preload/React; no provider substitution.
  const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
  const fs = require('node:fs'),
    path = require('node:path');
  const {
    CASES,
    PHASES,
    SCOPE,
    validateResult,
    saveImage,
    rootForLaunch,
    write,
  } = require('./fleet-ui-contract.cjs');
  const { parseFleetResponse } = require('../build/fleet-contract.cjs');
  const { securePreferences } = require('../build/window-policy.cjs');
  let root,
    launch,
    window,
    handler,
    ready = 0,
    closed = 0,
    complete = false,
    phase = 'PREPARE';
  let reads = 0,
    selects = 0,
    holdNext = false,
    held = false,
    releaseHeld;
  const cases = Object.fromEntries(CASES.map((key) => [key, false])),
    screenshots = {};
  const handle = ipcMain.handle,
    log = console.log;
  ipcMain.handle = function (channel, callback) {
    if (channel !== 'foundation:fleet:v1') return handle.call(this, channel, callback);
    if (handler) throw Error('FLEET_UI_HANDLER');
    handler = callback;
    ipcMain.handle = handle;
    return handle.call(this, channel, async function (...args) {
      let method;
      try {
        method = JSON.parse(args[1]).method;
      } catch {}
      if (method === 'fleet.get') reads++;
      if (method === 'fleet.selection.replace') selects++;
      const delay = holdNext && method === 'fleet.selection.replace';
      if (delay) holdNext = false;
      const result = await callback.apply(this, args);
      if (delay) {
        const parsed = parseFleetResponse(result);
        if (!parsed?.ok || parsed.outcome !== 'UNCHANGED') throw Error('FLEET_UI_UNCHANGED');
        held = true;
        await new Promise((resolve) => (releaseHeld = resolve));
      }
      return result;
    });
  };
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const execute = (code) => window.webContents.executeJavaScript(code);
  async function poll(fn) {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      if (await fn()) return;
      await pause(25);
    }
    throw Error('FLEET_UI_WAIT');
  }
  function fail() {
    clearTimeout(deadline);
    if (PHASES.includes(phase)) fs.writeSync(2, `FLEET_UI_PHASE_${phase}\n`);
    fs.writeSync(2, 'FLEET_UI_FAILED\n');
    app.exit(1);
  }
  const deadline = setTimeout(fail, 110000);
  async function click(selector) {
    await execute(
      `(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element||element.disabled)throw Error('CONTROL');element.click();return true;})()`,
    );
  }
  async function help() {
    await click('#help-top');
    await poll(() => execute("!!document.getElementById('fleet-status')"));
  }
  async function openPicker() {
    if (
      (await execute(
        "document.getElementById('wall-device-picker').getAttribute('aria-expanded')",
      )) !== 'true'
    )
      await click('#wall-device-picker');
    await poll(() => execute("!!document.getElementById('wall-dropdown')"));
  }
  async function closeHelp() {
    await click('#dialog-close');
    await poll(() => execute("document.querySelector('[role=dialog]')===null"));
  }
  function empty(value) {
    return (
      value?.ok === true &&
      value.fleet.availability === 'UNAVAILABLE' &&
      value.fleet.reason === 'BINARY_UNAVAILABLE' &&
      value.fleet.devices.length === 0 &&
      value.fleet.selection.selectedDeviceIds.length === 0 &&
      value.fleet.selection.activeDeviceId === null &&
      value.fleet.selection.groups.length === 0 &&
      value.fleet.selection.revision === 0
    );
  }
  async function read() {
    return parseFleetResponse(await execute('window.fleet.read()'));
  }
  async function direct(contents, frame) {
    return parseFleetResponse(
      await handler(
        { sender: contents, senderFrame: frame },
        '{"version":1,"requestId":"f900","method":"fleet.get"}',
      ),
    );
  }
  async function capture(theme) {
    await closeHelp();
    await click('[data-page="overview"]');
    const expectedColor = theme === 'dark' ? 'rgb(17, 26, 41)' : 'rgb(245, 247, 251)';
    await poll(() =>
      execute(
        `document.documentElement.dataset.theme===${JSON.stringify(theme)} && getComputedStyle(document.body).backgroundColor===${JSON.stringify(expectedColor)} && document.querySelector('[role="dialog"]')===null && document.getElementById('wall-device-picker').getAttribute('aria-expanded')==='false'`,
      ),
    );
    const facts = await execute(
      "({theme:document.documentElement.dataset.theme,width:innerWidth,height:innerHeight,tabs:[...document.querySelectorAll('button[data-page]')].map(n=>n.dataset.page),tiles:document.querySelectorAll('.wall-screen').length,workspace:!!document.querySelector('#workspace'),dock:!!document.querySelector('#wall-device-picker')})",
    );
    if (
      facts.theme !== theme ||
      facts.width !== 1024 ||
      facts.height !== 768 ||
      facts.tiles !== 0 ||
      !facts.workspace ||
      !facts.dock ||
      JSON.stringify(facts.tabs) !==
        JSON.stringify(['overview', 'accounts', 'tracking', 'setup', 'calendar', 'workflows'])
    )
      throw Error('FLEET_UI_LAYOUT');
    screenshots[theme] = saveImage(root, theme, await window.webContents.capturePage());
    cases[`${theme}Layout`] = true;
    cases.sixTabsPresent = true;
    await help();
  }
  async function run() {
    phase = 'MIGRATION';
    const { observeSchema4 } = require('./fleet-ui-schema4.cjs');
    if ((await observeSchema4(launch, safeStorage)) !== true) throw Error('FLEET_UI_SCHEMA4');
    write(path.join(root, 'schema4-observed.json'), {
      version: 2,
      migration3BackupAuthenticated: true,
      migration4ReceiptBound: true,
      durableStartupCommitted: true,
      captureStoreEmpty: true,
    });
    phase = 'HYDRATE';
    window = BrowserWindow.getAllWindows()[0];
    if (!window || BrowserWindow.getAllWindows().length !== 1) throw Error('FLEET_UI_WINDOW');
    window.setContentSize(1024, 768);
    await poll(() => execute("!!document.getElementById('help-top')"));
    await help();
    await poll(() =>
      execute(
        "document.getElementById('fleet-status').textContent.startsWith('OBSERVED / PROCESS-LOCAL SELECTION 0 / BINARY_UNAVAILABLE / ') && document.getElementById('preferences-status').textContent.startsWith('OBSERVED / PERSISTED / ')",
      ),
    );
    cases.mainReady = ready === 1;
    cases.oneFleetHydration = reads === 1;
    cases.preferencesHydrated = true;
    phase = 'READ';
    const observed = await read();
    cases.readObserved = empty(observed) && observed.outcome === 'OBSERVED';
    cases.emptyProduction = empty(observed);
    cases.noDeviceActions = await execute(
      "JSON.stringify(Object.keys(window.fleet).sort())===JSON.stringify(['read','replaceSelection'])",
    );
    phase = 'SELECT';
    const unchanged = parseFleetResponse(
      await execute(
        'window.fleet.replaceSelection(0,{selectedDeviceIds:[],activeDeviceId:null,groups:[]})',
      ),
    );
    cases.emptySelectionUnchanged = empty(unchanged) && unchanged.outcome === 'UNCHANGED';
    phase = 'RECONCILE';
    const beforeSelects = selects;
    holdNext = true;
    await closeHelp();
    await openPicker();
    await execute(
      "(()=>{const b=[...document.querySelectorAll('#wall-dropdown .mini-actions button')].find(n=>n.textContent.trim()==='Bỏ chọn');if(!b||b.disabled)throw Error('CONTROL');b.click();return true;})()",
    );
    await poll(() => held);
    await help();
    await poll(() =>
      execute(
        "document.getElementById('fleet-status').textContent.startsWith('TIMEOUT / EXPLICIT FLEET READ REQUIRED')",
      ),
    );
    cases.selectionTimeoutObserved = true;
    await closeHelp();
    await openPicker();
    cases.selectionReconcileRequired = await execute(
      "(()=>{const buttons=[...document.querySelectorAll('#wall-dropdown .mini-actions button')];return buttons.length===2&&buttons.every(n=>n.disabled);})()",
    );
    await help();
    await click('#fleet-read');
    await poll(() =>
      execute(
        "document.getElementById('fleet-status').textContent.startsWith('OBSERVED / PROCESS-LOCAL SELECTION 0 / BINARY_UNAVAILABLE / ')",
      ),
    );
    cases.explicitReadReconciled = empty(await read());
    const dispatches = selects,
      readCount = reads,
      status = await execute("document.getElementById('fleet-status').textContent");
    releaseHeld();
    await pause(150);
    cases.lateReplyNoReplay =
      dispatches === beforeSelects + 1 &&
      selects === dispatches &&
      reads === readCount &&
      (await execute("document.getElementById('fleet-status').textContent")) === status;
    phase = 'LIGHT';
    await capture('light');
    phase = 'DARK'; // Observe actual preference read until native resize-save lane settles; never retry mutation.
    let previous = null,
      stable = 0;
    await poll(async () => {
      const raw = JSON.parse(await execute('window.preferences.read()'));
      if (!raw.ok) {
        if (raw.code === 'BUSY') return false;
        throw Error('FLEET_UI_PREFERENCES');
      }
      if (raw.settings.revision === previous) stable++;
      else {
        previous = raw.settings.revision;
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
        "document.documentElement.dataset.theme==='dark' && document.getElementById('preferences-status').textContent.startsWith('COMMITTED / PERSISTED / ')",
      ),
    );
    await capture('dark');
    phase = 'SENDER';
    const stranger = new BrowserWindow({
      show: false,
      webPreferences: securePreferences(window.webContents.session),
    });
    try {
      const denied = await direct(stranger.webContents, stranger.webContents.mainFrame);
      cases.foreignSenderDenied = denied?.ok === false && denied.code === 'UNTRUSTED_SENDER';
    } finally {
      stranger.destroy();
    }
    phase = 'SUBFRAME';
    await execute(
      "(()=>{const f=document.createElement('iframe');f.id='fleet-owned-empty-frame';document.body.append(f);return true;})()",
    );
    let frame;
    await poll(() => {
      frame = window.webContents.mainFrame.frames.find(
        (item) => item.parent === window.webContents.mainFrame,
      );
      return frame !== undefined;
    });
    const denied = await direct(window.webContents, frame);
    cases.subframeDenied = denied?.ok === false && denied.code === 'UNTRUSTED_SENDER';
    await execute("document.getElementById('fleet-owned-empty-frame').remove()");
    phase = 'REVOKE';
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('FLEET_UI_RELOAD')), 5000);
      window.webContents.once('did-finish-load', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    window.webContents.reload();
    await loaded;
    const revoked = await direct(window.webContents, window.webContents.mainFrame);
    cases.revokedSessionDenied = revoked?.ok === false && revoked.code === 'SESSION_REVOKED';
    if (CASES.filter((key) => key !== 'mainClosed').some((key) => cases[key] !== true))
      throw Error('FLEET_UI_CASES');
    phase = 'CLOSE';
    complete = true;
    app.quit();
  }
  try {
    const profile = process.env.FONESI_BOOTSTRAP_ROOT;
    if (typeof profile !== 'string' || profile !== path.resolve(profile))
      throw Error('FLEET_UI_PROFILE');
    launch = path.dirname(profile);
    root = rootForLaunch(launch);
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
        if (!complete || ready !== 1 || closed !== 1) throw Error('FLEET_UI_CLOSE');
        cases.mainClosed = true;
        const result = {
          version: 1,
          scope: SCOPE,
          cases,
          screenshots,
          readyCount: ready,
          closedCount: closed,
        };
        if (!validateResult(result).passed) throw Error('FLEET_UI_CASES');
        write(path.join(root, 'fleet-ui-result.json'), result);
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
  require('node:fs').writeSync(2, 'FLEET_UI_PHASE_PREPARE\nFLEET_UI_FAILED\n');
  require('electron').app.exit(1);
}
