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
    setImmediate(() => {
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
