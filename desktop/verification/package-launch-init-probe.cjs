'use strict';
// Verification-only dialog answers around the byte-verified packaged initializer.
const { app, dialog } = require('electron');
const path = require('node:path');
const { read } = require('./package-contract.cjs');
const { admission, witness, record, phase, report } = require('./package-launch-observer.cjs');
let opens = 0,
  confirms = 0;
try {
  const { c, outer } = admission(__dirname);
  phase('INIT_CONTROL');
  const file = process.env.FONESI_PERSISTENCE_LAUNCH_CONTROL;
  if (
    typeof file !== 'string' ||
    file !== path.resolve(file) ||
    !['provision-control.json', 'auth-control.json'].includes(path.basename(file))
  )
    throw Error('PACKAGE_CONTROL');
  const control = JSON.parse(read(file));
  if (
    !['provision', 'auth'].includes(control.stage) ||
    path.basename(file) !== control.stage + '-control.json' ||
    control.packageRoot !== c.packageRoot
  )
    throw Error('PACKAGE_CONTROL');
  dialog.showOpenDialog = async (options) => {
    phase('INIT_DIALOG');
    if (
      control.stage !== 'provision' ||
      ++opens !== 1 ||
      JSON.stringify(options) !==
        JSON.stringify({ title: 'Choose encrypted backup storage', properties: ['openDirectory'] })
    )
      throw Error('PACKAGE_DIALOG');
    return c.stage === 'first-cancel'
      ? { canceled: true, filePaths: [] }
      : { canceled: false, filePaths: [c.backupParent] };
  };
  dialog.showMessageBox = async (options) => {
    phase('INIT_DIALOG');
    if (
      control.stage !== 'provision' ||
      ++confirms !== 1 ||
      c.stage !== 'first-launch' ||
      JSON.stringify(options) !==
        JSON.stringify({
          type: 'warning',
          title: 'Initialize encrypted foundation storage',
          message: 'Create an owned backup folder under the selected parent?',
          detail: `${c.backupParent}\nRecovery currently requires this Windows user/machine and retained usable key material. No portable-key claim is made.`,
          buttons: ['Initialize', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        })
    )
      throw Error('PACKAGE_DIALOG');
    return { response: 0, checkboxChecked: false };
  };
  phase('INIT_REQUIRE');
  require(path.join(c.packageRoot, 'app/launch/persistence-initialize.cjs'));
  app.on('will-quit', () => {
    try {
      phase('INIT_RECORD');
      record(
        outer,
        witness(c, control.stage, {
          closed: true,
          opens,
          confirms,
          cancelled: c.stage === 'first-cancel',
        }),
      );
    } catch (error) {
      report(error);
      console.error('PACKAGE_OBSERVER_FAILED');
      app.exit(1);
    }
  });
} catch (error) {
  report(error);
  console.error('PACKAGE_OBSERVER_FAILED');
  app.exit(1);
}
