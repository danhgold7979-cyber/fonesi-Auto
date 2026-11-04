'use strict';
// Actual application with an intentionally unowned empty log-root fixture.
const { app, ipcMain } = require('electron');
const path = require('node:path');
const { scanArtifacts } = require('./logging-evidence.cjs');
const { MOUNT_DIAGNOSTICS } = require('./runtime-measurements.cjs');
let ready = false,
  handler,
  window,
  finished = false;
const cases = {
  publicReadAvailable: false,
  loggingDegraded: false,
  safeCorrelatedError: false,
  visibleDegradation: false,
  orderlyQuit: false,
  crashCanaryAbsent: false,
};
const originalLog = console.log;
console.log = (...args) => {
  if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') ready = true;
  originalLog.apply(console, args);
};
const originalHandle = ipcMain.handle;
ipcMain.handle = function (channel, callback) {
  if (channel === 'foundation:request:v2') handler = callback;
  return originalHandle.call(this, channel, callback);
};
const deadline = setTimeout(() => {
  console.error('FOUNDATION_DEGRADED_DEADLINE');
  app.exit(1);
}, 25000);
app.once('browser-window-created', (_event, created) => {
  window = created;
  created.webContents.once('did-finish-load', () => {
    setImmediate(async () => {
      try {
        const end = Date.now() + 3000;
        while (!ready && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 10));
        if (!ready || typeof handler !== 'function') throw new Error('NOT_READY');
        const health = await created.webContents.executeJavaScript(
          'foundation.health().then(JSON.parse)',
        );
        cases.publicReadAvailable =
          health.version === 2 &&
          health.ok === true &&
          health.result.kind === 'health' &&
          health.result.status === 'READY';
        cases.loggingDegraded = health.logging === 'DEGRADED';
        const error = JSON.parse(
          handler(
            { sender: created.webContents, senderFrame: created.webContents.mainFrame },
            '{"password":"P104_PRIVATE_PASSWORD_OTP_COOKIE_PATH_CANARY"}',
          ),
        );
        cases.safeCorrelatedError =
          error.version === 2 &&
          error.ok === false &&
          error.code === 'INVALID_SHAPE' &&
          error.logging === 'DEGRADED' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(error.diagnosticId);
        const mounted = Date.now() + 3000;
        while (Date.now() < mounted) {
          if (await created.webContents.executeJavaScript(MOUNT_DIAGNOSTICS)) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await created.webContents.executeJavaScript(
          "document.getElementById('health-read').click(); true",
        );
        const rendered = Date.now() + 3000;
        while (Date.now() < rendered) {
          cases.visibleDegradation =
            (await created.webContents.executeJavaScript(
              "(() => { const status=document.getElementById('bridge-status'); return status !== null && status.getClientRects().length > 0 && status.textContent.includes('LOGGING DEGRADED — diagnostics may be incomplete'); })()",
            )) === true;
          if (cases.visibleDegradation) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        app.quit();
      } catch {
        console.error('FOUNDATION_DEGRADED_FAILED');
        app.quit();
      }
    });
  });
});
require(path.join(__dirname, '../build/main.cjs'));
app.on('will-quit', () => {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  cases.orderlyQuit = window?.isDestroyed() === true;
  let crashArtifactCount = 0;
  try {
    const artifacts = scanArtifacts(app.getPath('crashDumps'));
    cases.crashCanaryAbsent = artifacts.canaryAbsent;
    crashArtifactCount = artifacts.count;
  } catch {
    /* Fixed false evidence only. */
  }
  console.log('FOUNDATION_DEGRADED_RESULT ' + JSON.stringify({ cases, crashArtifactCount }));
});
