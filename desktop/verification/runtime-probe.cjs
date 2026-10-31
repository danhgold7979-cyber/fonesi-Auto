'use strict';
// Instrumented test entry only. Loads the actual verified application main bundle.
// No runtime execution until the supervisor and complete evidence path are reviewed.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const { mkdirSync } = require('node:fs');
const { createLifecycle } = require('../build/lifecycle.cjs');
const { securePreferences, installWindowPolicy } = require('../build/window-policy.cjs');
const { ENTRY_URL } = require('../build/asset-policy.cjs');
const CASE_NAMES = [
  'runtime_versions', 'mode_identity', 'main_bundle_loaded', 'diagnostic_rendered',
  'secure_preferences', 'no_preload', 'no_node_globals', 'no_application_bridge',
  'native_menu_absent', 'isolated_world_separate', 'popup_denied',
  'permission_denied', 'download_denied', 'network_policy_denied',
  'unknown_asset_denied', 'lifecycle_close_reopen', 'document_open_no_authority',
  'reload_no_authority', 'about_blank_no_authority', 'orderly_quit',
];
const cases = Object.fromEntries(CASE_NAMES.map((key) => [key, false]));
const observations = { documentOpenUrlUnchanged: false, reloadUrlUnchanged: false,
  aboutBlankUrlChanged: false, aboutBlankDenialObserved: false };
const mode = process.env.FONESI_BOOTSTRAP_MODE;
let stage = 'BOOTSTRAP';
let originalWindow;
let finished = false;
let testsCompleted = false;
const timer = setTimeout(() => {
  console.error('FOUNDATION_PROBE_DEADLINE');
  app.exit(1); // Future supervisor must independently verify owned Job cleanup.
}, 25000);

function fail() {
  console.error(`FOUNDATION_PROBE_FAILED_${stage}`); // Only internal fixed stage.
  app.quit();
}

// Register before requiring main, so the actual application's first window is used.
app.once('browser-window-created', (_event, window) => {
  originalWindow = window;
  window.webContents.once('did-finish-load', () => {
    setImmediate(() => runInitialChecks(window).catch(fail));
  });
});


function boundedEvent(emitter, eventName, action) {
  return new Promise((resolve, reject) => {
    const done = (...args) => { clearTimeout(deadline); emitter.removeListener(eventName, done); resolve(args); };
    const deadline = setTimeout(() => {
      emitter.removeListener(eventName, done); reject(new Error('PROBE_EVENT_DEADLINE'));
    }, 3000);
    emitter.once(eventName, done);
    try { action(); } catch {
      clearTimeout(deadline); emitter.removeListener(eventName, done); reject(new Error('PROBE_ACTION_FAILED'));
    }
  });
}

async function checkNativeLifecycle(ownedSession) {
  let current;
  let loaded;
  const lifecycle = createLifecycle(() => {
    current = new BrowserWindow({ show: false, webPreferences: securePreferences(ownedSession) });
    installWindowPolicy(current);
    const captured = current;
    loaded = current.loadURL(ENTRY_URL);
    return { onClosed: (callback) => captured.once('closed', callback),
      close: () => captured.close(), destroy: () => { if (!captured.isDestroyed()) captured.destroy(); } };
  });
  try {
    lifecycle.start();
    await loaded;
    const first = current;
    await boundedEvent(first, 'closed', () => lifecycle.close());
    lifecycle.start();
    await loaded;
    const second = current;
    lifecycle.dispose();
    return first !== second && first.isDestroyed() && second.isDestroyed() &&
      BrowserWindow.getAllWindows().length === 1;
  } finally {
    lifecycle.dispose();
  }
}


const NO_AUTHORITY = `typeof require === 'undefined' && typeof process === 'undefined' &&
  typeof module === 'undefined' && typeof Buffer === 'undefined' &&
  !('electron' in globalThis) && !('lab' in globalThis) &&
  !('fonesi' in globalThis) && !('api' in globalThis)`;

async function checkBlockedRequest(ownedSession, url) {
  const window = new BrowserWindow({ show: false, webPreferences: securePreferences(ownedSession) });
  installWindowPolicy(window);
  let policyDenied = false;
  window.webContents.on('did-fail-load', (_event, _code, description, failedUrl, mainFrame) => {
    if (mainFrame && failedUrl === url && description === 'ERR_BLOCKED_BY_CLIENT') policyDenied = true;
  });
  try {
    try { await window.loadURL(url); } catch { /* Only the observed policy code counts. */ }
    return policyDenied;
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

async function checkAboutBlank(contents) {
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(deadline);
      contents.removeListener('did-finish-load', loaded);
      contents.removeListener('will-navigate', denied);
      contents.removeListener('will-frame-navigate', deniedFrame);
    };
    const loaded = () => {
      if (contents.getURL() === 'about:blank') {
        observations.aboutBlankUrlChanged = true; cleanup(); resolve();
      }
    };
    const denied = (event, url) => {
      if (url === 'about:blank' && event.defaultPrevented === true) {
        observations.aboutBlankDenialObserved = true; cleanup(); resolve();
      }
    };
    const deniedFrame = (event) => {
      if (event.isMainFrame === true) denied(event, event.url);
    };
    const deadline = setTimeout(() => { cleanup(); reject(new Error('NAVIGATION_UNOBSERVED')); }, 3000);
    contents.on('did-finish-load', loaded);
    contents.on('will-navigate', denied);
    contents.on('will-frame-navigate', deniedFrame);
    // Navigation may destroy the execution context before the return value arrives.
    // A rejected script is not success: only a separate observed event resolves.
    contents.executeJavaScript("(() => { const a=document.createElement('a'); a.href='about:blank'; document.body.append(a); a.click(); })()")
      .catch(() => {});
  });
  return await contents.executeJavaScript(NO_AUTHORITY) === true;
}

async function runInitialChecks(window) {
  stage = 'INITIAL_CHECKS';
  const contents = window.webContents;
  cases.main_bundle_loaded = BrowserWindow.getAllWindows().length === 1;
  cases.runtime_versions = process.versions.electron === '45.1.0' &&
    process.versions.node === '24.22.1' && process.versions.chrome === '156.0.8078.49';
  cases.mode_identity = (mode === 'package') === app.isPackaged &&
    path.basename(process.execPath).toLowerCase() === (mode === 'package' ? 'autofoundation.exe' : 'electron.exe') &&
    (mode !== 'package' || app.getAppPath() === path.join(process.resourcesPath, 'app'));
  cases.native_menu_absent = Menu.getApplicationMenu() === null;
  const preferences = contents.getLastWebPreferences();
  cases.secure_preferences = preferences.sandbox === true &&
    preferences.contextIsolation === true && preferences.webSecurity === true &&
    preferences.nodeIntegration === false && preferences.nodeIntegrationInWorker === false &&
    preferences.nodeIntegrationInSubFrames === false && preferences.webviewTag === false &&
    preferences.allowRunningInsecureContent === false && preferences.devTools === false;
  cases.no_preload = preferences.preload === undefined || preferences.preload === '';
  // These are ordinary renderer observations, not OS sandbox-token measurement.
  const initial = await contents.executeJavaScript(`(() => ({
    diagnostic: document.body.textContent.includes('UNAVAILABLE'),
    noNode: typeof require === 'undefined' && typeof process === 'undefined' &&
      typeof module === 'undefined' && typeof Buffer === 'undefined',
    noBridge: !('electron' in globalThis) && !('lab' in globalThis) &&
      !('fonesi' in globalThis) && !('api' in globalThis)
  }))()`);
  cases.diagnostic_rendered = initial.diagnostic === true;
  cases.no_node_globals = initial.noNode === true;
  // Must be paired with complete source/bundle audit: absent names alone are not proof.
  cases.no_application_bridge = initial.noBridge === true;
  stage = 'ISOLATION';
  const isolatedControl = await contents.executeJavaScriptInIsolatedWorld(999, [{ code: 'globalThis.__foundationIsolatedProbe = true; globalThis.__foundationIsolatedProbe === true' }]);
  cases.isolated_world_separate = isolatedControl === true && await contents.executeJavaScript("typeof globalThis.__foundationIsolatedProbe === 'undefined'") === true;
  stage = 'POPUP_PERMISSION';
  const popupResult = await contents.executeJavaScript(`window.open(${JSON.stringify(ENTRY_URL)}) === null`);
  cases.popup_denied = popupResult === true && BrowserWindow.getAllWindows().length === 1;
  // Query only: never request location or contact a location provider.
  cases.permission_denied = await contents.executeJavaScript("navigator.permissions.query({name:'geolocation'}).then(result => result.state === 'denied')") === true;
  stage = 'LIFECYCLE';
  cases.lifecycle_close_reopen = await checkNativeLifecycle(contents.session);
  stage = 'RESOURCE_DENIAL';
  // Safety envelope for the owned session only. Offline error is NOT policy evidence.
  contents.session.enableNetworkEmulation({ offline: true });
  try {
    cases.network_policy_denied = await checkBlockedRequest(contents.session, 'https://blocked.invalid/');
    cases.unknown_asset_denied = await checkBlockedRequest(contents.session, 'auto-foundation://app/missing.html');
  } finally {
    contents.session.disableNetworkEmulation();
  }
  stage = 'DOWNLOAD_DENIAL';
  const downloadRoot = path.join(app.getPath('sessionData'), 'downloads');
  mkdirSync(downloadRoot);
  contents.session.setDownloadPath(downloadRoot);
  const [downloadEvent] = await boundedEvent(contents.session, 'will-download', () => {
    contents.executeJavaScript(`(() => { const a=document.createElement('a'); a.href=${JSON.stringify(ENTRY_URL)}; a.download='owned-test.html'; document.body.append(a); a.click(); a.remove(); })()`)
      .catch(() => {});
  });
  cases.download_denied = downloadEvent.defaultPrevented === true;
  stage = 'DOCUMENT_OPEN';
  await contents.executeJavaScript("document.open(); document.write('<!doctype html><title>Owned transition probe</title>'); document.close(); true");
  observations.documentOpenUrlUnchanged = contents.getURL() === ENTRY_URL;
  cases.document_open_no_authority = await contents.executeJavaScript(NO_AUTHORITY) === true;
  stage = 'RELOAD';
  await boundedEvent(contents, 'did-finish-load', () => contents.reload());
  observations.reloadUrlUnchanged = contents.getURL() === ENTRY_URL;
  cases.reload_no_authority = await contents.executeJavaScript(NO_AUTHORITY) === true;
  stage = 'ABOUT_BLANK';
  cases.about_blank_no_authority = await checkAboutBlank(contents);
  stage = 'ORDERLY_QUIT';
  testsCompleted = true;
  app.quit();
}

if (mode !== 'source' && mode !== 'package') {
  console.error('FOUNDATION_PROBE_MODE_REJECTED');
  clearTimeout(timer);
  app.exit(1);
} else {
  require(path.join(__dirname, '..', 'build', 'main.cjs'));
  // Registered after main: actual bootstrap cleanup runs before this evidence hook.
  app.on('will-quit', () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    cases.orderly_quit = testsCompleted && originalWindow !== undefined &&
      originalWindow.isDestroyed() && BrowserWindow.getAllWindows().length === 0;
    console.log('FOUNDATION_RESULT ' + JSON.stringify({ mode,
      versions: { electron: process.versions.electron, node: process.versions.node,
        chrome: process.versions.chrome }, cases, observations }));
    // This hook is not root-process exit or Job cleanup proof. Supervisor supplies both.
  });
}
