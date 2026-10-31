'use strict';
// Verification wrapper: actual compiled main/preload/React. Native answers are
// fixed injected responses, not claimed genuine user widget interaction.
const { app, BrowserWindow, dialog, safeStorage, screen, ipcMain } = require('electron');
const fs = require('node:fs'),
  path = require('node:path');
const { CASES, read, write, exact, result } = require('./settings-contract.cjs');
const { preflight, authenticated } = require('./settings-native.cjs');
const { FoundationDatabase } = require('../build/foundation-database.cjs');
const { parseSettingsResponse } = require('../build/settings-contract.cjs');
const { securePreferences } = require('../build/window-policy.cjs');
let actualHandler,
  delayNextRead = false,
  delayedReadReady = false,
  releaseDelayedRead,
  readDispatches = 0,
  releaseConfirmation,
  confirmationHeld = false;
const originalHandle = ipcMain.handle;
ipcMain.handle = function (channel, handler) {
  if (channel !== 'foundation:preferences:v1') return originalHandle.call(this, channel, handler);
  if (actualHandler) throw Error('SETTINGS_DUPLICATE_HANDLER');
  actualHandler = handler;
  ipcMain.handle = originalHandle;
  return originalHandle.call(this, channel, async function (...args) {
    const wire = args[1];
    let isRead = false;
    try {
      isRead = JSON.parse(wire)?.method === 'preferences.get';
    } catch {}
    if (isRead) readDispatches++;
    const delay = isRead && delayNextRead;
    if (delay) delayNextRead = false;
    const value = await handler.apply(this, args);
    if (delay) {
      const response = parseSettingsResponse(value);
      if (response?.ok !== true || response.outcome !== 'OBSERVED')
        throw Error('SETTINGS_DELAY_BASELINE');
      delayedReadReady = true;
      await new Promise((resolve) => {
        releaseDelayedRead = resolve;
      });
    }
    return value;
  });
};
async function direct(contents, frame, request) {
  if (typeof actualHandler !== 'function') throw Error('SETTINGS_HANDLER');
  const value = parseSettingsResponse(
    await actualHandler({ sender: contents, senderFrame: frame }, JSON.stringify(request)),
  );
  if (!value) throw Error('SETTINGS_DIRECT');
  return value;
}
function dbWitness() {
  const database = new FoundationDatabase(
    path.join(state.data, 'active.sqlite'),
    state.c.storeId,
    true,
  );
  try {
    return { fingerprint: database.fingerprint(), settings: database.readSettings() };
  } finally {
    database.close();
  }
}
let state,
  cases,
  completed = false,
  ready = 0,
  closed = 0,
  expectedWindow;
let negativeStage = null;
const originalLog = console.log,
  originalError = console.error;
const deadline = setTimeout(() => {
  fs.writeSync(2, 'SETTINGS_DEADLINE\n');
  app.exit(74);
}, 110000);
function failed() {
  clearTimeout(deadline);
  if (['SENDER', 'SUBFRAME', 'LATE_REPLY', 'REVOKED_RESET'].includes(negativeStage))
    fs.writeSync(2, `SETTINGS_NEGATIVE_STAGE_${negativeStage}\n`);
  fs.writeSync(2, 'SETTINGS_FAILED\n');
  app.exit(1);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(fn) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(25);
  }
  throw Error('SETTINGS_WAIT');
}
async function execute(window, code) {
  return window.webContents.executeJavaScript(code);
}
async function publicRead(window) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const raw = await execute(window, 'window.preferences.read()');
    const value = parseSettingsResponse(raw);
    if (value?.ok === true && value.outcome === 'OBSERVED') return value.settings;
    if (value?.ok !== false || value.code !== 'BUSY') throw Error('SETTINGS_READ');
    // Read-only observation of the bounded native-window save lane, never a
    // retry of a mutation, confirmation or unknown outcome.
    await pause(25);
  }
  throw Error('SETTINGS_READ_BUSY');
}
async function operation(window, name, args, expected) {
  const raw = await execute(window, `window.preferences.${name}(...${JSON.stringify(args)})`);
  const v = JSON.parse(raw);
  if (expected === 'CONFLICT' || expected === 'CANCELLED' || expected === 'INVALID_SHAPE') {
    if (v.ok !== false || v.code !== expected) throw Error('SETTINGS_DENIAL');
  } else if (v.ok !== true || v.outcome !== expected) throw Error('SETTINGS_COMMIT');
  return v;
}
async function screenshot(window, theme) {
  const actual = await execute(
    window,
    "({theme:document.getElementById('preference-panel').dataset.theme,color:getComputedStyle(document.body).backgroundColor})",
  );
  if (
    actual.theme !== theme.toUpperCase() ||
    actual.color !== (theme === 'dark' ? 'rgb(17, 26, 41)' : 'rgb(245, 247, 251)')
  )
    throw Error('SETTINGS_STYLE');
  const image = await window.webContents.capturePage();
  const size = image.getSize(),
    bytes = image.toPNG();
  if (size.width !== 1024 || size.height !== 768 || bytes.length < 32 || bytes.length > 2097152)
    throw Error('SETTINGS_IMAGE');
  const fd = fs.openSync(
    path.join(state.root, `settings-${state.c.mode}-${theme}.png`),
    'wx',
    0o600,
  );
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function fixtureBounds(area) {
  if (
    !area ||
    !['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(area[key])) ||
    area.width < 1 ||
    area.height < 1 ||
    area.width > 16384 ||
    area.height > 16384
  )
    throw Error('SETTINGS_WORK_AREA');
  const width = Math.min(900, area.width),
    height = Math.min(700, area.height);
  return {
    x: area.x + Math.min(40, area.width - width),
    y: area.y + Math.min(50, area.height - height),
    width,
    height,
  };
}
async function run() {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length !== 1) throw Error('SETTINGS_WINDOW');
  const window = windows[0];
  cases.realMainReady = true;
  await poll(() => execute(window, "!!document.getElementById('help-top')"));
  await execute(window, "document.getElementById('help-top').click()");
  await poll(() =>
    execute(
      window,
      "!!document.getElementById('preferences-read') && !document.getElementById('preferences-read').disabled && document.getElementById('preferences-status').textContent.startsWith('OBSERVED / PERSISTED / REVISION ')",
    ),
  );
  await authenticated(state, safeStorage);
  cases.originalKeyAuthenticated = true;
  cases.migration2BackupAuthenticated = true;
  const db = new FoundationDatabase(path.join(state.data, 'active.sqlite'), state.c.storeId, true);
  try {
    db.validate();
    cases.schema3 = db.version === 3;
  } finally {
    db.close();
  }
  if (state.c.stage === 'ui') {
    write(path.join(state.root, `settings-vault-before-${state.c.mode}.json`), vaultWitness());
    window.setContentSize(1024, 768);
    await pause(400);
    let current = await publicRead(window);
    cases.realPreloadRead = current.persistence === 'PERSISTED' && current.theme === 'LIGHT';
    await execute(window, "document.getElementById('preferences-read').click()");
    await poll(() => execute(window, "!document.getElementById('preferences-read').disabled"));
    await screenshot(window, 'light');
    cases.lightScreenshot = true;
    await execute(window, "document.getElementById('preferences-theme').click()");
    await poll(() =>
      execute(
        window,
        "document.getElementById('preference-panel').dataset.theme==='DARK' && !document.getElementById('preferences-read').disabled",
      ),
    );
    current = await publicRead(window);
    cases.themeCommitted = current.theme === 'DARK';
    await screenshot(window, 'dark');
    cases.darkScreenshot = true;
    const previousRevision = current.revision;
    await operation(
      window,
      'update',
      [current.revision, { dockWidth: 510, tileWidth: 151 }],
      'COMMITTED',
    );
    current = await publicRead(window);
    cases.dimensionsCommitted = current.dockWidth === 510 && current.tileWidth === 151;
    await operation(window, 'update', [previousRevision, { theme: 'LIGHT' }], 'CONFLICT');
    cases.staleConflict = true;
    await operation(
      window,
      'update',
      [current.revision, { normalBounds: { x: 1 } }],
      'INVALID_SHAPE',
    );
    cases.malformedDenied = true;
    await operation(window, 'reset', [current.revision], 'CANCELLED');
    const cancelled = await publicRead(window);
    cases.resetCancelled = JSON.stringify(cancelled) === JSON.stringify(current);
    await operation(window, 'reset', [current.revision], 'COMMITTED');
    current = await publicRead(window);
    cases.resetConfirmed =
      current.theme === 'LIGHT' && current.dockWidth === null && current.tileWidth === 150;
    await operation(window, 'restorePrevious', [current.revision], 'COMMITTED');
    current = await publicRead(window);
    cases.previousRestored =
      current.theme === 'DARK' && current.dockWidth === 510 && current.tileWidth === 151;
    if (answerIndex !== 3) throw Error('SETTINGS_CONFIRMATION');
    negativeStage = 'SENDER';
    const readRequest = { version: 1, requestId: 'native-denial', method: 'preferences.get' };
    const stranger = new BrowserWindow({
      show: false,
      webPreferences: securePreferences(window.webContents.session),
    });
    try {
      const denied = await direct(
        stranger.webContents,
        stranger.webContents.mainFrame,
        readRequest,
      );
      cases.foreignSenderDenied = denied.ok === false && denied.code === 'UNTRUSTED_SENDER';
    } finally {
      stranger.destroy();
    }
    negativeStage = 'SUBFRAME';
    await execute(
      window,
      "(() => { const frame=document.createElement('iframe'); frame.id='settings-owned-empty-frame'; document.body.append(frame); return true; })()",
    );
    let childFrame;
    await poll(() => {
      childFrame = window.webContents.mainFrame.frames.find(
        (frame) => frame.parent === window.webContents.mainFrame,
      );
      return childFrame !== undefined;
    });
    const childDenied = await direct(window.webContents, childFrame, readRequest);
    cases.childFrameDenied = childDenied.ok === false && childDenied.code === 'UNTRUSTED_SENDER';
    await execute(window, "document.getElementById('settings-owned-empty-frame').remove(); true");
    // Delay only one response after the actual registered handler completes.
    negativeStage = 'LATE_REPLY';
    const readsBefore = readDispatches;
    delayNextRead = true;
    await execute(window, "document.getElementById('preferences-read').click()");
    await poll(() => delayedReadReady && typeof releaseDelayedRead === 'function');
    await poll(() =>
      execute(
        window,
        "document.getElementById('preferences-status').textContent.startsWith('TIMEOUT / ') && document.getElementById('preferences-theme').disabled",
      ),
    );
    const timedOutStatus = await execute(
      window,
      "document.getElementById('preferences-status').textContent",
    );
    releaseDelayedRead();
    await pause(150);
    cases.delayedReplyDiscarded =
      readDispatches === readsBefore + 1 &&
      (await execute(window, "document.getElementById('preferences-status').textContent")) ===
        timedOutStatus;
    await execute(window, "document.getElementById('preferences-read').click()");
    await poll(() =>
      execute(
        window,
        "document.getElementById('preferences-status').textContent.startsWith('OBSERVED / PERSISTED / ') && !document.getElementById('preferences-theme').disabled",
      ),
    );
    const targetBounds = fixtureBounds(screen.getDisplayMatching(window.getBounds()).workArea);
    window.setBounds(targetBounds);
    window.maximize();
    await poll(() => window.isMaximized());
    expectedWindow = { normalBounds: window.getNormalBounds(), maximized: window.isMaximized() };
    cases.windowObserved =
      expectedWindow.maximized &&
      JSON.stringify(expectedWindow.normalBounds) === JSON.stringify(targetBounds);
    await poll(
      () =>
        JSON.stringify({
          normalBounds: dbWitness().settings.normalBounds,
          maximized: dbWitness().settings.maximized,
        }) === JSON.stringify(expectedWindow),
    );
    await pause(400);
    const before = dbWitness();
    await pause(100);
    if (dbWitness().fingerprint !== before.fingerprint) throw Error('SETTINGS_GEOMETRY_BUSY');
    negativeStage = 'REVOKED_RESET';
    const pendingReset = direct(window.webContents, window.webContents.mainFrame, {
      version: 1,
      requestId: 'held-reset',
      method: 'preferences.reset',
      expectedRevision: before.settings.revision,
    });
    await poll(() => confirmationHeld && typeof releaseConfirmation === 'function');
    const loaded = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(Error('SETTINGS_RELOAD_DEADLINE')), 5000);
      window.webContents.once('did-finish-load', () => {
        clearTimeout(deadline);
        resolve();
      });
    });
    window.webContents.reload();
    await loaded;
    releaseConfirmation({ response: 1, checkboxChecked: false });
    const revoked = await pendingReset;
    cases.heldConfirmationRevoked =
      revoked.ok === false &&
      revoked.code === 'SESSION_REVOKED' &&
      dbWitness().fingerprint === before.fingerprint &&
      answerIndex === 4;
    negativeStage = null;
    cases.vaultUnchanged =
      read(path.join(state.root, `settings-vault-before-${state.c.mode}.json`)) ===
      JSON.stringify(vaultWitness());
  } else {
    const expected = exact(read(path.join(state.root, `settings-expected-${state.c.mode}.json`)), [
      'settings',
      'window',
    ]);
    const actual = await publicRead(window);
    cases.preferencesRetained = JSON.stringify(actual) === JSON.stringify(expected.settings);
    cases.nativeWindowRetained =
      JSON.stringify({
        normalBounds: window.getNormalBounds(),
        maximized: window.isMaximized(),
      }) === JSON.stringify(expected.window);
    cases.vaultUnchanged =
      read(path.join(state.root, `settings-vault-before-${state.c.mode}.json`)) ===
      JSON.stringify(vaultWitness());
    // Hydrated persisted state must already be visible without a user read click.
    if (
      (await execute(window, "document.getElementById('preference-panel').dataset.theme")) !==
      actual.theme
    )
      throw Error('SETTINGS_HYDRATION');
  }
  completed = true;
  app.quit();
}
function vaultWitness() {
  const { createHash } = require('node:crypto');
  const dir = path.join(state.data, 'vault');
  const entries = fs.opendirSync(dir),
    items = [];
  try {
    for (;;) {
      const entry = entries.readSync();
      if (!entry) break;
      if (items.length >= 256) throw Error('SETTINGS_VAULT_BOUND');
      const file = path.join(dir, entry.name),
        stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
        throw Error('SETTINGS_VAULT');
      items.push([entry.name, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
    }
  } finally {
    entries.closeSync();
  }
  return items.sort((a, b) => a[0].localeCompare(b[0]));
}
let answerIndex = 0;
try {
  state = preflight(app);
  if (!['ui', 'reopen'].includes(state.c.stage) || app.isReady()) throw Error('SETTINGS_STAGE');
  cases = Object.fromEntries(CASES[state.c.stage].map((k) => [k, false]));
  cases.ownedRoot = true;
  dialog.showMessageBox = async (window, options) => {
    if (
      state.c.stage !== 'ui' ||
      window !== BrowserWindow.getAllWindows()[0] ||
      JSON.stringify(options) !==
        JSON.stringify({
          type: 'question',
          buttons: [
            'Cancel',
            answerIndex === 2 ? 'Restore previous preferences' : 'Reset preferences',
          ],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          message:
            answerIndex === 2
              ? 'Restore the previous preference revision?'
              : 'Reset nonsecret UI preferences?',
        }) ||
      answerIndex >= 4
    )
      throw Error('SETTINGS_DIALOG');
    if (answerIndex === 3) {
      answerIndex++;
      confirmationHeld = true;
      return new Promise((resolve) => {
        releaseConfirmation = resolve;
      });
    }
    return { response: [0, 1, 1][answerIndex++], checkboxChecked: false };
  };
  console.log = (...args) => {
    if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') {
      ready++;
      if (ready !== 1) failed();
      else setImmediate(() => run().catch(failed));
    }
    if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed++;
    originalLog(...args);
  };
  console.error = (...args) => {
    originalError(...args);
    failed();
  };
  require('../build/main.cjs');
  app.on('will-quit', () => {
    try {
      if (!completed || ready !== 1 || closed !== 1) throw Error('SETTINGS_CLOSE');
      const db = new FoundationDatabase(
        path.join(state.data, 'active.sqlite'),
        state.c.storeId,
        true,
      );
      try {
        const saved = db.readSettings();
        if (state.c.stage === 'ui') {
          if (
            JSON.stringify({ normalBounds: saved.normalBounds, maximized: saved.maximized }) !==
            JSON.stringify(expectedWindow)
          )
            throw Error('SETTINGS_WINDOW_SAVE');
          write(path.join(state.root, `settings-expected-${state.c.mode}.json`), {
            settings: {
              revision: saved.revision,
              theme: saved.theme,
              dockWidth: saved.dockWidth,
              tileWidth: saved.tileWidth,
              persistence: 'PERSISTED',
            },
            window: expectedWindow,
          });
        }
      } finally {
        db.close();
      }
      cases.orderlyQuit = true;
      const output = {
        version: 2,
        mode: state.c.mode,
        stage: state.c.stage,
        versions: {
          electron: process.versions.electron,
          node: process.versions.node,
          chrome: process.versions.chrome,
        },
        cases,
      };
      result(JSON.stringify(output));
      write(path.join(state.root, `settings-${state.c.mode}-${state.c.stage}.json`), output);
      clearTimeout(deadline);
      originalLog('SETTINGS_CLOSED');
    } catch {
      failed();
    }
  });
} catch {
  failed();
}
