'use strict';
// Verification-only native answers/close request; original packaged main and providers.
const { app, dialog, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { plain, read, uuid } = require('./package-contract.cjs');
const { admission, witness, record, phase, report } = require('./package-launch-observer.cjs');
let ready = 0,
  closed = 0,
  maintenance = 0,
  opens = 0,
  confirms = 0,
  notices = 0,
  noticeFailed = false,
  requested = false,
  sixTabsEmpty = false,
  settingsObserved = false,
  context;
const originalLog = console.log;
const fail = (error) => {
  report(error);
  console.error('PACKAGE_OBSERVER_FAILED');
  app.exit(1);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function normal() {
  phase('MAIN_OPERATION');
  const end = Date.now() + 5000;
  let window;
  while (Date.now() < end) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 1 && windows[0].isVisible()) {
      window = windows[0];
      if (
        await window.webContents.executeJavaScript(
          "typeof window.preferences?.read==='function'&&!!document.getElementById('theme-toggle')&&!document.getElementById('theme-toggle').disabled",
        )
      )
        break;
    }
    await pause(25);
  }
  if (window?.webContents.getURL() !== 'auto-foundation://app/status.html')
    throw Error('PACKAGE_WINDOW');
  const { parseSettingsResponse } = require(
    path.join(context.c.packageRoot, 'app/build/settings-contract.cjs'),
  );
  const deadline = Date.now() + 5000;
  let reply;
  do {
    reply = parseSettingsResponse(
      await window.webContents.executeJavaScript('window.preferences.read()'),
    );
    if (reply?.ok) break;
    if (reply?.code !== 'BUSY') throw Error('PACKAGE_SETTINGS');
    await pause(25);
  } while (Date.now() < deadline);
  settingsObserved = reply?.ok === true && reply.outcome === 'OBSERVED';
  if (!settingsObserved) throw Error('PACKAGE_SETTINGS');
  sixTabsEmpty = true;
  for (const page of ['overview', 'accounts', 'tracking', 'setup', 'calendar', 'workflows']) {
    await window.webContents.executeJavaScript(
      `document.querySelector('#nav [data-page="${page}"]').click();true`,
    );
    await pause(50);
    sixTabsEmpty =
      sixTabsEmpty &&
      (await window.webContents.executeJavaScript(
        `document.querySelector('#nav [data-page="${page}"]').classList.contains('active')&&!document.getElementById('demo-banner')&&document.querySelectorAll('#workspace .device-row,#workspace .account-row,#workspace .job-block,#workspace tbody .filecol').length===0`,
      ));
  }
  if (!sixTabsEmpty) throw Error('PACKAGE_DOMAIN_ROWS');
  requested = true;
  app.quit();
}
try {
  context = admission(__dirname);
  const { c } = context;
  const restore = ['restore-cancel', 'restore-confirm', 'restored-maintenance'].includes(c.stage);
  if (restore) {
    if (
      typeof c.backupFile !== 'string' ||
      !/^backup-[0-9a-f-]{36}\.fonaub$/.test(path.basename(c.backupFile))
    )
      throw Error('PACKAGE_BACKUP');
    dialog.showOpenDialog = async (options) => {
      const expected =
        opens === 0
          ? {
              title: 'Choose an owned encrypted recovery backup',
              properties: ['openFile'],
              filters: [{ name: 'Fonesi encrypted backup', extensions: ['fonaub'] }],
            }
          : {
              title: 'Choose a parent for a new quarantined restore',
              properties: ['openDirectory'],
            };
      if (opens >= 2 || JSON.stringify(options) !== JSON.stringify(expected))
        throw Error('PACKAGE_DIALOG');
      return { canceled: false, filePaths: [opens++ === 0 ? c.backupFile : c.restoreParent] };
    };
    dialog.showMessageBox = async (options) => {
      if (confirms === 1 && c.stage !== 'restore-cancel') {
        try {
          plain(c.restoreParent);
          const handle = fs.opendirSync(c.restoreParent);
          let child;
          try {
            child = handle.readSync();
            if (
              !child ||
              handle.readSync() !== null ||
              !child.isDirectory() ||
              child.isSymbolicLink() ||
              !child.name.startsWith('fonesi-restore-') ||
              !uuid(child.name.slice(15))
            )
              throw Error('PACKAGE_NOTICE');
          } finally {
            handle.closeSync();
          }
          const parent = path.join(c.restoreParent, child.name);
          plain(parent);
          if (!uuid(read(path.join(parent, '.owner')))) throw Error('PACKAGE_NOTICE');
          const dir = fs.opendirSync(parent);
          let data = null,
            count = 0;
          try {
            for (;;) {
              const item = dir.readSync();
              if (!item) break;
              if (++count > 256) throw Error('PACKAGE_NOTICE');
              if (item.name.startsWith('data-')) {
                if (data || !uuid(item.name.slice(5))) throw Error('PACKAGE_NOTICE');
                data = path.join(parent, item.name);
              }
            }
          } finally {
            dir.closeSync();
          }
          if (!data) throw Error('PACKAGE_NOTICE');
          plain(data);
          const marker = JSON.parse(read(path.join(data, '.persistence-owner.json')));
          if (
            marker.version !== 1 ||
            marker.kind !== 'RESTORED' ||
            path.basename(data) !== 'data-' + marker.storeId ||
            !uuid(marker.restoreReceiptId)
          )
            throw Error('PACKAGE_NOTICE');
          const expectedNotice = {
            type: 'info',
            title: 'Quarantined restore created',
            message: 'Restore completed in a new quarantined root.',
            detail: `Created store:\n${data}\nThis store is maintenance-only. Use -Store "${data}" with -Maintenance "--maintenance=restore-to-new". Normal launch is blocked.`,
            buttons: ['OK'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          };
          if (notices++ !== 0 || JSON.stringify(options) !== JSON.stringify(expectedNotice))
            throw Error('PACKAGE_NOTICE');
          return { response: 0, checkboxChecked: false };
        } catch (error) {
          noticeFailed = true;
          throw error;
        }
      }
      const backupId = path.basename(c.backupFile).slice(7, -7);
      const expected = {
        type: 'warning',
        title: 'Confirm main-owned recovery',
        message: 'Confirm this exact operation?',
        detail: `Restore backup ${backupId} into a NEW quarantined root under:\n${c.restoreParent}\nThe existing database and key material remain unchanged.`,
        buttons: ['Confirm', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      };
      if (opens !== 2 || confirms++ !== 0 || JSON.stringify(options) !== JSON.stringify(expected))
        throw Error('PACKAGE_DIALOG');
      return { response: c.stage === 'restore-cancel' ? 1 : 0, checkboxChecked: false };
    };
  }
  console.log = (...args) => {
    if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') {
      ready++;
      if (restore) throw Error('PACKAGE_UNEXPECTED_UI');
      if (ready === 1) setImmediate(() => void normal().catch(fail));
    }
    if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed++;
    if (
      args.length === 1 &&
      args[0] ===
        `PERSISTENCE_MAINTENANCE_${c.stage === 'restore-cancel' ? 'CANCELLED' : 'COMPLETED'}`
    )
      maintenance++;
    originalLog.apply(console, args);
  };
  phase('MAIN_REQUIRE');
  require(path.join(c.packageRoot, 'app/build/main.cjs'));
  app.on('will-quit', () => {
    try {
      if (
        closed !== 1 ||
        (restore
          ? maintenance !== 1 ||
            opens !== 2 ||
            confirms !== 1 ||
            ready !== 0 ||
            noticeFailed ||
            notices !== (c.stage === 'restore-cancel' ? 0 : 1)
          : ready !== 1 || !requested || !sixTabsEmpty || !settingsObserved)
      )
        throw Error('PACKAGE_OBSERVATION');
      record(
        context.outer,
        witness(c, 'main', {
          ready: ready === 1,
          closed: true,
          quitRequested: requested,
          opens,
          confirms,
          cancelled: c.stage === 'restore-cancel',
          sixTabsEmpty,
          settingsObserved,
        }),
      );
    } catch (error) {
      fail(error);
    }
  });
} catch (error) {
  fail(error);
}
