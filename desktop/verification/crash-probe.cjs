'use strict';
// Owned renderer crash negative, actual bootstrap cleanup path; no substitute main.
const { app } = require('electron');
const path = require('node:path');
const deadline = setTimeout(() => {
  console.log('CRASH_DEADLINE');
  app.exit(1);
}, 25000);
app.once('browser-window-created', (_event, window) => {
  window.webContents.once('render-process-gone', () => console.log('CRASH_OBSERVED'));
  window.webContents.once('did-finish-load', () =>
    setImmediate(async () => {
      try {
        const seeded = await window.webContents.executeJavaScript(
          "globalThis.__ownedCrashCanary = 'P104_PRIVATE_PASSWORD_OTP_COOKIE_PATH_CANARY'; globalThis.__ownedCrashCanary.length > 0",
        );
        if (seeded !== true) throw new Error('CANARY_CONTROL');
      } catch {
        console.log('CRASH_CANARY_SETUP_FAILED');
        app.exit(1);
        return;
      }
      console.log('CRASH_ARMED');
      window.webContents.forcefullyCrashRenderer();
    }),
  );
});
require(path.join(__dirname, '..', 'build', 'main.cjs'));
app.on('will-quit', () => {
  clearTimeout(deadline);
  console.log('CRASH_UNEXPECTED_ORDERLY_QUIT');
});
