'use strict';
// Unchanged V9 is admitted only in this isolated verification window, never in
// the production asset map. No prototype external-action handler is exercised.
const { app, BrowserWindow, session, protocol, Menu } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
fs.writeSync(2, 'UI_REFERENCE_PROGRESS_ENTRY\n');
const {
  PAGES,
  THEMES,
  LABELS,
  VERSIONS,
  pageKeys,
  imageSpecs,
  caseNames,
  referenceBytes,
  referencePolicy,
  saveImage,
  validateResult,
  plain,
  read,
  write,
} = require('./ui-contract.cjs');
const URL = 'ui-reference://fixture/index.html';
let root,
  window,
  ownedSession,
  complete = false,
  closed = false,
  phase = 'PREPARE';
const images = [],
  pages = Object.fromEntries(pageKeys().map((key) => [key, false])),
  cases = Object.fromEntries(caseNames('reference').map((key) => [key, false]));
const deadline = setTimeout(() => {
  fs.writeSync(2, 'UI_REFERENCE_DEADLINE\n');
  app.exit(74);
}, 110000);
function fail() {
  clearTimeout(deadline);
  if (['PREPARE', 'LOAD', 'PAGES', 'CLOSE'].includes(phase))
    fs.writeSync(2, `UI_REFERENCE_STAGE_${phase}\n`);
  fs.writeSync(2, 'UI_REFERENCE_FAILED\n');
  if (window && !window.isDestroyed()) window.destroy();
  app.exit(1);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function execute(code) {
  if (!window || window.webContents.getURL() !== URL) throw Error('UI_REFERENCE_ORIGIN');
  return window.webContents.executeJavaScript(code);
}
async function run() {
  root = process.env.FONESI_PERSISTENCE_RUN_ROOT;
  plain(root);
  if (
    process.argv.slice(2).length ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      read(path.join(root, '.owner')),
    ) ||
    ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_FORCE_IS_PACKAGED'].some(
      (key) => process.env[key] !== undefined,
    )
  )
    throw Error('UI_REFERENCE_ARGUMENTS');
  for (const flag of [
    'no-sandbox',
    'disable-gpu-sandbox',
    'disable-setuid-sandbox',
    'disable-web-security',
    'allow-running-insecure-content',
    'ignore-certificate-errors',
    'remote-debugging-port',
    'remote-debugging-pipe',
    'inspect',
    'inspect-brk',
  ])
    if (app.commandLine.hasSwitch(flag)) throw Error('UI_REFERENCE_ARGUMENTS');
  const bytes = referenceBytes(path.join(root, 'ui-reference.html')),
    policy = referencePolicy(bytes);
  cases.referenceHash = true;
  if (app.isPackaged) throw Error('UI_REFERENCE_SOURCE_ONLY');
  // Every writable native profile path belongs to the parent-owned fresh profile.
  const profile = process.env.FONESI_BOOTSTRAP_ROOT;
  plain(profile);
  if (
    path.dirname(profile) !== root ||
    path.basename(profile) !== 'fonesi-auto-foundation-ui-reference'
  )
    throw Error('UI_REFERENCE_PROFILE');
  if (read(path.join(profile, '.owner')) !== 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n')
    throw Error('UI_REFERENCE_PROFILE');
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  app.setPath('crashDumps', profile);
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'ui-reference',
      privileges: { standard: true, secure: true, supportFetchAPI: false, stream: false },
    },
  ]);
  fs.writeSync(2, 'UI_REFERENCE_PROGRESS_PREPARED\n');
  await app.whenReady();
  Menu.setApplicationMenu(null);
  ownedSession = session.fromPartition(`ui-reference-${randomUUID()}`, { cache: false });
  ownedSession.setPermissionCheckHandler(() => false);
  ownedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ownedSession.on('will-download', (event) => event.preventDefault());
  ownedSession.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: details.url !== URL }),
  );
  ownedSession.protocol.handle('ui-reference', (request) =>
    request.url === URL && request.method === 'GET'
      ? new Response(bytes, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': policy,
          },
        })
      : new Response(null, { status: 403 }),
  );
  cases.isolatedSession = !ownedSession.isPersistent() && ownedSession !== session.defaultSession;
  cases.exactAssetPolicy = true; // The fixed handler/permission configuration is source-reviewed; no arbitrary URL test is sent.
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    show: true,
    webPreferences: {
      session: ownedSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-frame-navigate', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', fail);
  window.webContents.on('preload-error', fail);
  phase = 'LOAD';
  await window.loadURL(URL);
  fs.writeSync(2, 'UI_REFERENCE_PROGRESS_LOADED\n');
  window.setContentSize(1440, 900);
  window.webContents.setZoomFactor(1);
  await pause(250);
  const prefs = window.webContents.getLastWebPreferences();
  cases.sandboxAndIsolation =
    prefs.sandbox === true &&
    prefs.contextIsolation === true &&
    prefs.nodeIntegration === false &&
    prefs.webSecurity === true &&
    (await execute("typeof require==='undefined' && typeof process==='undefined'")) === true;
  const tabs = await execute(
    "Array.from(document.querySelectorAll('#nav [data-page]')).map(n=>({key:n.dataset.page,label:n.querySelector('span:not(.navcount)').textContent.trim()}))",
  );
  cases.exactTabs =
    JSON.stringify(tabs.map((v) => v.key)) === JSON.stringify(PAGES) &&
    JSON.stringify(tabs.map((v) => v.label)) === JSON.stringify(LABELS);
  phase = 'PAGES';
  for (const theme of THEMES) {
    await execute(`applyTheme(${JSON.stringify(theme)});true`);
    for (const page of PAGES) {
      await execute(`setPage(${JSON.stringify(page)});scrollTo(0,0);true`);
      await pause(100);
      const current = await execute(
        "({width:innerWidth,height:innerHeight,ratio:devicePixelRatio,theme:document.documentElement.dataset.theme,active:document.querySelector('#nav .active').dataset.page,title:!!document.querySelector('#workspace h1'),top:document.querySelector('.topbar').getBoundingClientRect().height})",
      );
      if (
        current.width !== 1440 ||
        current.height !== 900 ||
        current.ratio !== 1 ||
        current.theme !== theme ||
        current.active !== page ||
        !current.title ||
        Math.abs(current.top - 57) > 1 ||
        window.webContents.getZoomFactor() !== 1
      )
        throw Error('UI_REFERENCE_VIEWPORT');
      pages[`${page}-${theme}`] = true;
      const spec = imageSpecs('reference').find(
        (value) => value.name === `ui-reference-${page}-${theme}.png`,
      );
      images.push(saveImage(root, spec, await window.webContents.capturePage()));
    }
  }
  fs.writeSync(2, 'UI_REFERENCE_PROGRESS_CAPTURED\n');
  cases.allPagesBothThemes = Object.values(pages).every(Boolean);
  if (
    !Object.entries(cases)
      .filter(([key]) => key !== 'orderlyQuit')
      .every(([, value]) => value)
  )
    throw Error('UI_REFERENCE_CASES');
  phase = 'CLOSE';
  complete = true;
  fs.writeSync(2, 'UI_REFERENCE_PROGRESS_CLOSING\n');
  window.close();
  closed = window.isDestroyed();
  app.quit();
}
app.on('will-quit', () => {
  try {
    if (!complete || !closed) throw Error('UI_REFERENCE_CLOSE');
    cases.orderlyQuit = true;
    const actual = {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    };
    if (JSON.stringify(actual) !== JSON.stringify(VERSIONS)) throw Error('UI_REFERENCE_VERSION');
    const output = { version: 1, mode: 'reference', versions: actual, cases, pages, images };
    validateResult(JSON.stringify(output));
    write(path.join(root, 'ui-reference.json'), output);
    fs.writeSync(2, 'UI_REFERENCE_PROGRESS_WRITTEN\n');
    clearTimeout(deadline);
    fs.writeSync(1, 'UI_REFERENCE_CLOSED\n');
  } catch {
    fail();
  }
});
run().catch(fail);
