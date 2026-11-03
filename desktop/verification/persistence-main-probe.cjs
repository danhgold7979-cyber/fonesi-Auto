'use strict';
// Verification wrapper only: observes the actual compiled application's NORMAL
// READY path. No production test switch, injected key provider or replacement UI.
const { app } = require('electron');
const path = require('node:path');
const mode = process.env.FONESI_BOOTSTRAP_MODE;
if (!['source', 'package'].includes(mode) || app.isPackaged !== (mode === 'package')) {
  console.error('PERSISTENCE_MAIN_FAILED');
  app.exit(1);
  throw new Error('MODE_REJECTED');
}
let ready = 0;
let closed = 0;
let failed = false;
const log = console.log;
const error = console.error;
const deadline = setTimeout(() => {
  failed = true;
  error('PERSISTENCE_MAIN_DEADLINE');
  app.exit(75);
}, 110000);
console.log = (...args) => {
  if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') {
    ready += 1;
    if (ready === 1) setImmediate(() => app.quit());
    else failed = true;
  }
  if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed += 1;
  log.apply(console, args);
};
console.error = (...args) => {
  failed = true;
  error.apply(console, args);
};
// Register the witness after real main so its shutdown listener has completed.
try {
  require(path.join(__dirname, '../build/main.cjs'));
  app.on('will-quit', () => {
    clearTimeout(deadline);
    if (!failed && ready === 1 && closed === 1) {
      log('PERSISTENCE_MAIN_ORDERLY');
      log(
        'PERSISTENCE_MAIN_RESULT ' +
          JSON.stringify({
            mode,
            versions: {
              electron: process.versions.electron,
              node: process.versions.node,
              chrome: process.versions.chrome,
            },
            mainReady: true,
            orderlyQuit: true,
          }),
      );
    } else {
      error('PERSISTENCE_MAIN_FAILED');
      app.exit(1);
    }
  });
} catch {
  clearTimeout(deadline);
  error('PERSISTENCE_MAIN_FAILED');
  app.exit(1);
}
