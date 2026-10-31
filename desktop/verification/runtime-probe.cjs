'use strict';
// Instrumented test entry only. Loads the actual verified application main bundle.
// No runtime execution until the supervisor and complete evidence path are reviewed.
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('node:path');
const { securePreferenceEvidence } = require('./runtime-measurements.cjs');
const { mkdirSync } = require('node:fs');
const { scan } = require('./logging-evidence.cjs');
const { createLifecycle } = require('../build/lifecycle.cjs');
const { securePreferences, installWindowPolicy } = require('../build/window-policy.cjs');
const { ENTRY_URL } = require('../build/asset-policy.cjs');
const CASE_NAMES = [
  'runtime_versions',
  'mode_identity',
  'main_bundle_loaded',
  'diagnostic_rendered',
  'secure_preferences',
  'approved_preload',
  'no_node_globals',
  'bounded_public_bridge',
  'native_menu_absent',
  'isolated_world_separate',
  'popup_denied',
  'permission_denied',
  'download_denied',
  'network_policy_denied',
  'unknown_asset_denied',
  'lifecycle_close_reopen',
  'document_open_public_only',
  'reload_session_revoked',
  'about_blank_sender_denied',
  'orderly_quit',
  'health_read',
  'settings_read',
  'ipc_request_denials',
  'ipc_sender_denials',
  'react_explicit_read',
  'logging_correlation',
  'legacy_protocol_compatibility',
  'logging_persisted',
  'logging_canary_absent',
];
const cases = Object.fromEntries(CASE_NAMES.map((key) => [key, false]));
const observations = {
  documentOpenUrlUnchanged: false,
  reloadUrlUnchanged: false,
  aboutBlankUrlChanged: false,
  aboutBlankDenialObserved: false,
};
const mode = process.env.FONESI_BOOTSTRAP_MODE;
let stage = 'BOOTSTRAP';
let actualHandler;
let diagnosticHandler;
const diagnosticReferences = [];
const CANARY = 'P104_PRIVATE_PASSWORD_OTP_COOKIE_PATH_CANARY';
let mainReady = false;
const originalHandle = ipcMain.handle;
ipcMain.handle = function (channel, handler) {
  if (channel === 'foundation:request:v2') diagnosticHandler = handler;
  if (channel === 'foundation:request:v1') {
    actualHandler = handler;
    ipcMain.handle = originalHandle;
  }
  return originalHandle.call(this, channel, handler);
};
const originalLog = console.log;
console.log = (...args) => {
  if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') mainReady = true;
  originalLog.apply(console, args);
};
// Instrumentation observes the real registration/log without replacing its policy.
function direct(contents, wire, frame = contents.mainFrame) {
  return JSON.parse(actualHandler({ sender: contents, senderFrame: frame }, wire));
}
const healthWire = JSON.stringify({ version: 1, requestId: 'runtime', method: 'health.get' });

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
    const done = (...args) => {
      clearTimeout(deadline);
      emitter.removeListener(eventName, done);
      resolve(args);
    };
    const deadline = setTimeout(() => {
      emitter.removeListener(eventName, done);
      reject(new Error('PROBE_EVENT_DEADLINE'));
    }, 3000);
    emitter.once(eventName, done);
    try {
      action();
    } catch {
      clearTimeout(deadline);
      emitter.removeListener(eventName, done);
      reject(new Error('PROBE_ACTION_FAILED'));
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
    return {
      onClosed: (callback) => captured.once('closed', callback),
      close: () => captured.close(),
      destroy: () => {
        if (!captured.isDestroyed()) captured.destroy();
      },
    };
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
    return (
      first !== second &&
      first.isDestroyed() &&
      second.isDestroyed() &&
      BrowserWindow.getAllWindows().length === 1
    );
  } finally {
    lifecycle.dispose();
  }
}

const NO_AUTHORITY = `typeof require === 'undefined' && typeof process === 'undefined' &&
  typeof module === 'undefined' && typeof Buffer === 'undefined' &&
  !('electron' in globalThis) && !('lab' in globalThis) &&
  !('fonesi' in globalThis) && !('api' in globalThis) &&
  (!('foundation' in globalThis) || Object.keys(globalThis.foundation).sort().join(',') === 'health,settings')`;

async function checkBlockedRequest(ownedSession, url) {
  const window = new BrowserWindow({
    show: false,
    webPreferences: securePreferences(ownedSession),
  });
  installWindowPolicy(window);
  let policyDenied = false;
  window.webContents.on('did-fail-load', (_event, _code, description, failedUrl, mainFrame) => {
    if (mainFrame && failedUrl === url && description === 'ERR_BLOCKED_BY_CLIENT')
      policyDenied = true;
  });
  try {
    try {
      await window.loadURL(url);
    } catch {
      /* Only the observed policy code counts. */
    }
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
        observations.aboutBlankUrlChanged = true;
        cleanup();
        resolve();
      }
    };
    const denied = (event, url) => {
      if (url === 'about:blank' && event.defaultPrevented === true) {
        observations.aboutBlankDenialObserved = true;
        cleanup();
        resolve();
      }
    };
    const deniedFrame = (event) => {
      if (event.isMainFrame === true) denied(event, event.url);
    };
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error('NAVIGATION_UNOBSERVED'));
    }, 3000);
    contents.on('did-finish-load', loaded);
    contents.on('will-navigate', denied);
    contents.on('will-frame-navigate', deniedFrame);
    // Navigation may destroy the execution context before the return value arrives.
    // A rejected script is not success: only a separate observed event resolves.
    contents
      .executeJavaScript(
        "(() => { const a=document.createElement('a'); a.href='about:blank'; document.body.append(a); a.click(); })()",
      )
      .catch(() => {});
  });
  const expectedDenial = observations.aboutBlankUrlChanged ? 'UNTRUSTED_SENDER' : 'SESSION_REVOKED';
  return (
    (await contents.executeJavaScript(NO_AUTHORITY)) === true &&
    direct(contents, healthWire).code === expectedDenial
  );
}

async function runInitialChecks(window) {
  stage = 'INITIAL_CHECKS';
  const readyDeadline = Date.now() + 3000;
  while (!mainReady && Date.now() < readyDeadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  if (!mainReady || typeof actualHandler !== 'function') throw new Error('MAIN_NOT_READY');
  const contents = window.webContents;
  cases.main_bundle_loaded = BrowserWindow.getAllWindows().length === 1;
  cases.runtime_versions =
    process.versions.electron === '45.1.0' &&
    process.versions.node === '24.22.1' &&
    process.versions.chrome === '156.0.8078.49';
  cases.mode_identity =
    (mode === 'package') === app.isPackaged &&
    path.basename(process.execPath).toLowerCase() ===
      (mode === 'package' ? 'autofoundation.exe' : 'electron.exe') &&
    (mode !== 'package' || app.getAppPath() === path.join(process.resourcesPath, 'app'));
  cases.native_menu_absent = Menu.getApplicationMenu() === null;
  const preferences = contents.getLastWebPreferences();
  for (const key of [
    'sandbox',
    'contextIsolation',
    'webSecurity',
    'nodeIntegration',
    'nodeIntegrationInWorker',
    'nodeIntegrationInSubFrames',
    'webviewTag',
    'allowRunningInsecureContent',
    'devTools',
  ]) {
    const value = preferences[key];
    console.error(
      'FOUNDATION_PREF_' +
        key +
        '_' +
        (value === true ? 'TRUE' : value === false ? 'FALSE' : 'MISSING'),
    );
  }
  // SaveLastPreferences omits devTools/preload; missing is not a disabled value.
  const configured = securePreferences(contents.session);
  let devToolsOpened = false;
  const observeDevTools = () => {
    devToolsOpened = true;
  };
  contents.on('devtools-opened', observeDevTools);
  try {
    contents.openDevTools({ mode: 'detach', activate: false });
    await new Promise((resolve) => setTimeout(resolve, 250));
  } finally {
    contents.removeListener('devtools-opened', observeDevTools);
  }
  cases.secure_preferences = securePreferenceEvidence(preferences, configured, {
    eventObserved: devToolsOpened,
    opened: contents.isDevToolsOpened(),
    contentsAbsent: contents.devToolsWebContents === null,
  });
  const registeredPreloads = contents.session.getPreloadScripts();
  // Combined reviewed configuration/bundle evidence + actual session inventory,
  // not a general proof from an omitted preference field or absent global name.
  cases.approved_preload =
    Array.isArray(registeredPreloads) &&
    registeredPreloads.length === 0 &&
    (await contents.executeJavaScript(
      "typeof foundation === 'object' && Object.keys(foundation).sort().join(',') === 'health,settings'",
    )) === true;
  // These are ordinary renderer observations, not OS sandbox-token measurement.
  const initial = await contents.executeJavaScript(`(() => ({
    diagnostic: document.body.textContent.includes('UNAVAILABLE'),
    noNode: typeof require === 'undefined' && typeof process === 'undefined' &&
      typeof module === 'undefined' && typeof Buffer === 'undefined',
    noBridge: typeof foundation === 'object' && Object.keys(foundation).sort().join(',') === 'health,settings' && !('electron' in globalThis) && !('lab' in globalThis) &&
      !('fonesi' in globalThis) && !('api' in globalThis)
  }))()`);
  cases.diagnostic_rendered = initial.diagnostic === true;
  cases.no_node_globals = initial.noNode === true;
  // Must be paired with complete source/bundle audit: absent names alone are not proof.
  cases.bounded_public_bridge = initial.noBridge === true;
  stage = 'PUBLIC_IPC';
  const health = await contents.executeJavaScript('foundation.health().then(JSON.parse)');
  cases.health_read =
    health.version === 2 &&
    health.logging === 'AVAILABLE' &&
    typeof health.diagnosticId === 'string' &&
    health.ok === true &&
    health.result.kind === 'health' &&
    health.result.status === 'READY' &&
    health.result.services === 'UNAVAILABLE';
  const settings = await contents.executeJavaScript('foundation.settings().then(JSON.parse)');
  cases.settings_read =
    settings.version === 2 &&
    settings.logging === 'AVAILABLE' &&
    typeof settings.diagnosticId === 'string' &&
    settings.ok === true &&
    settings.result.kind === 'settings' &&
    settings.result.revision === 0 &&
    settings.result.persistence === 'NOT_PERSISTED' &&
    settings.result.theme === 'LIGHT';
  diagnosticReferences.push(
    { diagnosticId: health.diagnosticId, code: 'OK' },
    { diagnosticId: settings.diagnosticId, code: 'OK' },
  );
  const correlated = JSON.parse(
    diagnosticHandler(
      { sender: contents, senderFrame: contents.mainFrame },
      JSON.stringify({ version: 2, requestId: 'probe', method: 'health.get', password: CANARY }),
    ),
  );
  cases.logging_correlation =
    correlated.version === 2 &&
    correlated.ok === false &&
    correlated.code === 'INVALID_SHAPE' &&
    correlated.logging === 'AVAILABLE' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(correlated.diagnosticId);
  diagnosticReferences.push({ diagnosticId: correlated.diagnosticId, code: 'INVALID_SHAPE' });
  cases.legacy_protocol_compatibility =
    direct(contents, healthWire).ok === true && direct(contents, healthWire).version === 1;
  const denied = [
    [null, 'INVALID_TRANSPORT'],
    ['x'.repeat(513), 'PAYLOAD_TOO_LARGE'],
    ['{', 'INVALID_JSON'],
    [JSON.stringify({ version: 2, requestId: 'r', method: 'health.get' }), 'UNSUPPORTED_VERSION'],
    [JSON.stringify({ version: 1, requestId: 'r', method: 'shell.exec' }), 'UNKNOWN_METHOD'],
    [
      JSON.stringify({ version: 1, requestId: 'r', method: 'health.get', path: '/owned-denied' }),
      'INVALID_SHAPE',
    ],
    ['{"version":2,"version":1,"requestId":"r","method":"health.get"}', 'INVALID_SHAPE'],
  ];
  cases.ipc_request_denials = denied.every(([wire, code]) => direct(contents, wire).code === code);
  const stranger = new BrowserWindow({
    show: false,
    webPreferences: securePreferences(contents.session),
  });
  try {
    cases.ipc_sender_denials =
      direct(stranger.webContents, healthWire).code === 'UNTRUSTED_SENDER' &&
      direct(contents, healthWire, stranger.webContents.mainFrame).code === 'UNTRUSTED_SENDER' &&
      direct(contents, healthWire, null).code === 'UNTRUSTED_SENDER';
  } finally {
    stranger.destroy();
  }
  // Initial empty owned iframe gives real child-frame metadata without a URL,
  // network request, test preload or relaxation of frame-src 'none'. If Chromium
  // exposes no such child under this policy, this required case fails explicitly.
  await contents.executeJavaScript(
    "(() => { const frame=document.createElement('iframe'); frame.id='owned-frame-denial'; document.body.append(frame); return true; })()",
  );
  const frameDeadline = Date.now() + 1000;
  let childFrame;
  do {
    childFrame = contents.mainFrame.frames.find((frame) => frame.parent === contents.mainFrame);
    if (!childFrame) await new Promise((resolve) => setTimeout(resolve, 10));
  } while (!childFrame && Date.now() < frameDeadline);
  cases.ipc_sender_denials =
    cases.ipc_sender_denials &&
    childFrame !== undefined &&
    direct(contents, healthWire, childFrame).code === 'UNTRUSTED_SENDER';
  await contents.executeJavaScript("document.getElementById('owned-frame-denial')?.remove(); true");
  const mountDeadline = Date.now() + 3000;
  let mounted = false;
  do {
    mounted =
      (await contents.executeJavaScript(
        "(() => { if (!document.getElementById('health-read')) document.getElementById('help-top')?.click(); return document.getElementById('health-read') !== null && document.getElementById('bridge-status') !== null; })()",
      )) === true;
    if (!mounted) await new Promise((resolve) => setTimeout(resolve, 10));
  } while (!mounted && Date.now() < mountDeadline);
  if (!mounted) throw new Error('REACT_NOT_MOUNTED');
  await contents.executeJavaScript("document.getElementById('health-read').click(); true");
  const renderDeadline = Date.now() + 3000;
  do {
    cases.react_explicit_read =
      (await contents.executeJavaScript(
        "document.getElementById('bridge-status')?.textContent === 'BRIDGE READY / SERVICES UNAVAILABLE'",
      )) === true;
    if (!cases.react_explicit_read) await new Promise((resolve) => setTimeout(resolve, 10));
  } while (!cases.react_explicit_read && Date.now() < renderDeadline);
  stage = 'ISOLATION';
  const isolatedControl = await contents.executeJavaScriptInIsolatedWorld(999, [
    {
      code: 'globalThis.__foundationIsolatedProbe = true; globalThis.__foundationIsolatedProbe === true',
    },
  ]);
  cases.isolated_world_separate =
    isolatedControl === true &&
    (await contents.executeJavaScript(
      "typeof globalThis.__foundationIsolatedProbe === 'undefined'",
    )) === true;
  stage = 'POPUP_PERMISSION';
  const popupResult = await contents.executeJavaScript(
    `window.open(${JSON.stringify(ENTRY_URL)}) === null`,
  );
  cases.popup_denied = popupResult === true && BrowserWindow.getAllWindows().length === 1;
  // Query only: never request location or contact a location provider.
  cases.permission_denied =
    (await contents.executeJavaScript(
      "navigator.permissions.query({name:'geolocation'}).then(result => result.state === 'denied')",
    )) === true;
  stage = 'LIFECYCLE';
  cases.lifecycle_close_reopen = await checkNativeLifecycle(contents.session);
  stage = 'RESOURCE_DENIAL';
  // Safety envelope for the owned session only. Offline error is NOT policy evidence.
  contents.session.enableNetworkEmulation({ offline: true });
  try {
    cases.network_policy_denied = await checkBlockedRequest(
      contents.session,
      'https://blocked.invalid/',
    );
    cases.unknown_asset_denied = await checkBlockedRequest(
      contents.session,
      'auto-foundation://app/missing.html',
    );
  } finally {
    contents.session.disableNetworkEmulation();
  }
  stage = 'DOWNLOAD_DENIAL';
  const downloadRoot = path.join(app.getPath('sessionData'), 'downloads');
  mkdirSync(downloadRoot);
  contents.session.setDownloadPath(downloadRoot);
  const [downloadEvent] = await boundedEvent(contents.session, 'will-download', () => {
    contents
      .executeJavaScript(
        `(() => { const a=document.createElement('a'); a.href=${JSON.stringify(ENTRY_URL)}; a.download='owned-test.html'; document.body.append(a); a.click(); a.remove(); })()`,
      )
      .catch(() => {});
  });
  cases.download_denied = downloadEvent.defaultPrevented === true;
  stage = 'DOCUMENT_OPEN';
  await contents.executeJavaScript(
    "document.open(); document.write('<!doctype html><title>Owned transition probe</title>'); document.close(); true",
  );
  observations.documentOpenUrlUnchanged = contents.getURL() === ENTRY_URL;
  const afterOpen = direct(contents, healthWire);
  cases.document_open_public_only =
    (await contents.executeJavaScript(NO_AUTHORITY)) === true &&
    ((afterOpen.ok === true &&
      afterOpen.result.kind === 'health' &&
      afterOpen.result.services === 'UNAVAILABLE') ||
      afterOpen.code === 'SESSION_REVOKED');
  stage = 'RELOAD';
  await boundedEvent(contents, 'did-finish-load', () => contents.reload());
  observations.reloadUrlUnchanged = contents.getURL() === ENTRY_URL;
  cases.reload_session_revoked =
    (await contents.executeJavaScript(NO_AUTHORITY)) === true &&
    direct(contents, healthWire).code === 'SESSION_REVOKED' &&
    (await contents.executeJavaScript(
      "foundation.health().then(raw => JSON.parse(raw).code === 'SESSION_REVOKED')",
    )) === true;
  stage = 'ABOUT_BLANK';
  cases.about_blank_sender_denied = await checkAboutBlank(contents);
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
    let originalDestroyed = false;
    if (originalWindow !== undefined) originalDestroyed = originalWindow.isDestroyed();
    cases.orderly_quit =
      testsCompleted && originalDestroyed && BrowserWindow.getAllWindows().length === 0;
    let logging = { recordCount: 0, crashArtifactCount: 0 };
    try {
      const observed = scan(
        process.env.FONESI_LOG_ROOT,
        app.getPath('crashDumps'),
        diagnosticReferences,
      );
      cases.logging_persisted =
        observed.canonical && observed.correlated && observed.lifecycle && observed.recordCount > 0;
      cases.logging_canary_absent = observed.canaryAbsent;
      logging = {
        recordCount: observed.recordCount,
        crashArtifactCount: observed.crashArtifactCount,
      };
    } catch {
      /* Missing/corrupt/private evidence remains a false case; never echo. */
    }
    console.log(
      'FOUNDATION_RESULT ' +
        JSON.stringify({
          mode,
          versions: {
            electron: process.versions.electron,
            node: process.versions.node,
            chrome: process.versions.chrome,
          },
          cases,
          observations,
          logging,
        }),
    );
    // This hook is not root-process exit or Job cleanup proof. Supervisor supplies both.
  });
}
