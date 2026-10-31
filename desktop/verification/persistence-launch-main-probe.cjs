'use strict';
// Observe real production main; only request a deterministic user-close equivalent.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
let ready = 0,
  closed = 0,
  requested = false;
const log = console.log;
console.log = (...args) => {
  if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') {
    ready += 1;
    if (ready === 1)
      setImmediate(() => {
        requested = true;
        app.quit();
      });
  }
  if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed += 1;
  log.apply(console, args);
};
try {
  const profile = process.env.FONESI_BOOTSTRAP_ROOT;
  if (typeof profile !== 'string' || profile !== path.resolve(profile)) throw new Error('PROFILE');
  const launch = path.dirname(profile);
  require('../build/main.cjs');
  app.on('will-quit', () => {
    if (ready !== 1 || closed !== 1 || !requested) {
      console.error('PERSISTENCE_LAUNCH_PROBE_FAILED');
      app.exit(1);
      return;
    }
    const fd = fs.openSync(path.join(launch, 'ui-witness.json'), 'wx', 0o600);
    try {
      fs.writeFileSync(
        fd,
        JSON.stringify({ version: 1, ready: true, quitRequested: true, closed: true }),
      );
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  });
} catch {
  console.error('PERSISTENCE_LAUNCH_PROBE_FAILED');
  app.exit(1);
}
