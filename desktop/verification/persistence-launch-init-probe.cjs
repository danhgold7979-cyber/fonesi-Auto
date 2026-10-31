'use strict';
// Verification-only native dialog answers; actual production initializer/provider.
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
let opens = 0,
  confirms = 0,
  control,
  launch;
function read(p) {
  const s = fs.lstatSync(p);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'r');
  try {
    const b = Buffer.alloc(65537);
    let n = 0;
    while (n < b.length) {
      const count = fs.readSync(fd, b, n, b.length - n, null);
      if (count === 0) break;
      n += count;
    }
    if (n > 65536) throw new Error('FILE');
    return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(b.subarray(0, n)));
  } finally {
    fs.closeSync(fd);
  }
}
try {
  const file = process.env.FONESI_PERSISTENCE_LAUNCH_CONTROL;
  if (
    typeof file !== 'string' ||
    file !== path.resolve(file) ||
    !['provision-control.json', 'auth-control.json'].includes(path.basename(file))
  )
    throw new Error('CONTROL');
  launch = path.dirname(file);
  control = read(file);
  if (control.root !== path.dirname(launch) || !['provision', 'auth'].includes(control.stage))
    throw new Error('CONTROL');
  const parent = path.join(control.root, 'verification-backup-parent');
  dialog.showOpenDialog = async (options) => {
    if (
      control.stage !== 'provision' ||
      ++opens !== 1 ||
      options.title !== 'Choose encrypted backup storage'
    )
      throw new Error('DIALOG');
    fs.mkdirSync(parent);
    return { canceled: false, filePaths: [parent] };
  };
  dialog.showMessageBox = async (options) => {
    if (
      control.stage !== 'provision' ||
      ++confirms !== 1 ||
      options.defaultId !== 1 ||
      options.cancelId !== 1 ||
      options.title !== 'Initialize encrypted foundation storage'
    )
      throw new Error('DIALOG');
    return { response: 0, checkboxChecked: false };
  };
  require('../launch/persistence-initialize.cjs');
  app.on('will-quit', () => {
    const result = { version: 1, stage: control.stage, opens, confirms };
    const fd = fs.openSync(path.join(launch, control.stage + '-dialog-witness.json'), 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(result));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  });
} catch {
  console.error('PERSISTENCE_LAUNCH_PROBE_FAILED');
  app.exit(1);
}
