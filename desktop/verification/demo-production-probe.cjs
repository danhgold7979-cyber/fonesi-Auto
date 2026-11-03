'use strict';
// Verification-only environment injection before unchanged production main admission.
const { app, BrowserWindow, safeStorage } = require('electron');
const fs = require('node:fs'),
  path = require('node:path');
const { preflight, authenticated } = require('./settings-native.cjs');
const {
  VERSIONS,
  caseNames,
  imageSpecs,
  write,
  saveImage,
  validateResult,
} = require('./demo-contract.cjs');
let state,
  window,
  complete = false,
  quitting = false;
const cases = Object.fromEntries(caseNames('production').map((name) => [name, false]));
const images = [];
const deadline = setTimeout(() => {
  fs.writeSync(2, 'DEMO_PRODUCTION_DEADLINE\n');
  app.exit(74);
}, 110000);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function fail() {
  clearTimeout(deadline);
  fs.writeSync(2, 'DEMO_PRODUCTION_FAILED\n');
  app.exit(1);
}
async function execute(code) {
  if (window?.webContents.getURL() !== 'auto-foundation://app/status.html')
    throw Error('DEMO_PRODUCTION_ORIGIN');
  return window.webContents.executeJavaScript(code);
}
async function poll(fn) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(25);
  }
  throw Error('DEMO_PRODUCTION_POLL');
}
async function run() {
  await poll(async () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length !== 1) return false;
    window = windows[0];
    return (
      window.isVisible() &&
      window.webContents.getURL() === 'auto-foundation://app/status.html' &&
      (await execute(
        "!!document.getElementById('theme-toggle')&&!document.getElementById('theme-toggle').disabled",
      ))
    );
  });
  cases.realMain = true;
  await authenticated(state, safeStorage);
  cases.originalKeyAuthenticated = true;
  cases.productionOrigin = await execute("location.origin==='auto-foundation://app'");
  const empty = await execute(
    "!document.getElementById('demo-banner')&&document.querySelectorAll('.wall-screen,.account-row,.job-block').length===0&&!document.body.textContent.includes('DEMO-DEVICE-')",
  );
  cases.productionEmpty = empty;
  cases.demoEnvironmentIgnored =
    process.env.DEMO === 'true' && process.env.MOCK === 'true' && empty;
  cases.fixtureCanaryAbsent = await execute(
    "!document.documentElement.outerHTML.includes('FONESI_DEMO_FIXTURE_BUNDLE_20261031_V1')&&localStorage.getItem('fonesi.demo.preferences.v1')===null",
  );
  window.setContentSize(1440, 900);
  await poll(() =>
    execute(
      "innerWidth===1440&&innerHeight===900&&document.documentElement.dataset.theme==='light'",
    ),
  );
  await pause(100);
  images.push(
    saveImage(state.root, imageSpecs('production')[0], await window.webContents.capturePage()),
  );
  complete = true;
  app.quit();
}
try {
  state = preflight(app);
  if (state.c.mode !== 'source' || state.c.stage !== 'ui') throw Error('DEMO_PRODUCTION_CONTROL');
  process.env.DEMO = 'true';
  process.env.MOCK = 'true';
  app.on('will-quit', () => {
    quitting = true;
  });
  app.on('quit', () => {
    clearTimeout(deadline);
    if (!complete || !quitting) return;
    cases.orderlyQuit = true;
    const result = { version: 1, mode: 'production', versions: VERSIONS, cases, images };
    validateResult(JSON.stringify(result));
    write(path.join(state.root, 'demo-production.json'), result);
    fs.writeSync(1, 'DEMO_PRODUCTION_VERIFIED\n');
  });
  require('../build/main.cjs');
  void app
    .whenReady()
    .then(() => run())
    .catch(fail);
} catch {
  fail();
}
