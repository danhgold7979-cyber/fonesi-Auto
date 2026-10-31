'use strict';
const { app, safeStorage } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { CASES, plain, read, write, exact, result } = require('./settings-contract.cjs');
const { preflight, authenticated } = require('./settings-native.cjs');
const { FoundationDatabase, statement } = require('../build/foundation-database.cjs');
const { BackupService, parseBackupReceipt } = require('../build/backup-service.cjs');
const { prepareOwnedProfile } = require('../build/profile-owner.cjs');
const { installCommitCrash } = require('./persistence-store-contract.cjs');
let state,
  db,
  cases,
  fixture,
  complete = false;
const deadline = setTimeout(() => {
  fs.writeSync(2, 'SETTINGS_DEADLINE\n');
  app.exit(74);
}, 110000);
function failed() {
  clearTimeout(deadline);
  fs.writeSync(2, 'SETTINGS_FAILED\n');
  app.exit(1);
}
function primary() {
  const hashes = {};
  for (const name of ['active.sqlite', 'active.sqlite-wal', 'active.sqlite-shm']) {
    const file = path.join(state.data, name);
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch (e) {
      if (e.code === 'ENOENT' && name !== 'active.sqlite') {
        hashes[name] = null;
        continue;
      }
      throw e;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 67108864)
      throw Error('SETTINGS_PRIMARY');
    const fd = fs.openSync(file, 'r'),
      hash = createHash('sha256'),
      buffer = Buffer.alloc(65536);
    let total = 0;
    try {
      for (;;) {
        const n = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (!n) break;
        total += n;
        if (total > 67108864) throw Error('SETTINGS_PRIMARY');
        hash.update(buffer.subarray(0, n));
      }
    } finally {
      fs.closeSync(fd);
    }
    hashes[name] = hash.digest('hex');
  }
  return hashes;
}
function output() {
  const v = {
    version: 2,
    mode: state.c.mode,
    stage: state.c.stage,
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    },
    cases,
  };
  result(JSON.stringify(v));
  write(path.join(state.root, `settings-${state.c.mode}-${state.c.stage}.json`), v);
}
try {
  state = preflight(app);
  if (!/^(before|after)-(crash|reopen)$/.test(state.c.stage) || app.isReady())
    throw Error('SETTINGS_STAGE');
  const crash = state.c.stage.endsWith('-crash'),
    boundary = state.c.stage.startsWith('before') ? 'BEFORE_COMMIT' : 'AFTER_COMMIT';
  cases = Object.fromEntries(CASES[state.c.stage].map((k) => [k, false]));
  cases.ownedRoot = true;
  fixture = path.join(state.data, `settings-fixture-${state.c.fixtureId}`);
  const marker = { version: 1, storeId: state.c.storeId, fixtureId: state.c.fixtureId, boundary };
  if (crash) {
    fs.mkdirSync(fixture);
    write(path.join(fixture, '.fixture-owner.json'), marker);
    fs.mkdirSync(path.join(fixture, 'staging'));
    fs.mkdirSync(path.join(fixture, 'backups'));
    write(path.join(fixture, 'primary.json'), primary());
  } else {
    plain(fixture);
    if (read(path.join(fixture, '.fixture-owner.json')) !== JSON.stringify(marker))
      throw Error('SETTINGS_FIXTURE');
  }
  const profile = path.join(
    state.root,
    `fonesi-auto-foundation-${state.c.mode}-settings-${state.c.stage}`,
  );
  const paths = prepareOwnedProfile(profile);
  for (const [key, value] of Object.entries(paths)) app.setPath(key, value);
  app.setPath('sessionData', state.key);
  app
    .whenReady()
    .then(async () => {
      const admitted = await authenticated(state, safeStorage);
      cases.originalKeyAuthenticated = true;
      const location = { locationId: state.c.fixtureId, directory: path.join(fixture, 'backups') };
      const service = new BackupService(
        {
          storeId: state.c.storeId,
          staging: path.join(fixture, 'staging'),
          assertOwned: async (loc) => {
            await admitted.owned();
            plain(fixture);
            if (
              read(path.join(fixture, '.fixture-owner.json')) !== JSON.stringify(marker) ||
              loc.locationId !== location.locationId ||
              loc.directory !== location.directory
            )
              throw Error('SETTINGS_FIXTURE');
          },
        },
        admitted.keys,
      );
      const filename = path.join(fixture, 'schema.sqlite');
      if (!crash) {
        const s = fs.lstatSync(filename);
        if (!s.isFile() || s.isSymbolicLink() || s.size === 0 || s.size > 67108864)
          throw Error('SETTINGS_DB');
      }
      db = new FoundationDatabase(filename, state.c.storeId);
      if (crash) {
        let prerequisite;
        await db.migrate(async (version) => {
          const receipt = await service.create(db, location, 'PRE_MIGRATION', Date.now());
          const validated = await service.validate(location, receipt.header.backupId);
          if (
            JSON.stringify(receipt) !== JSON.stringify(validated) ||
            receipt.header.schemaVersion !== version
          )
            throw Error('SETTINGS_BACKUP');
          if (version === 2) prerequisite = receipt;
          return service.prerequisite(validated);
        }, Date.now());
        if (!prerequisite) throw Error('SETTINGS_BACKUP');
        write(path.join(fixture, 'prerequisite.json'), prerequisite);
        cases.migration2BackupAuthenticated = true;
        cases.schema3 = db.version === 3;
        const old = db.readSettings(),
          next = {
            ...old,
            revision: old.revision + 1,
            theme: 'DARK',
            dockWidth: 510,
            tileWidth: 151,
            normalBounds: { x: 40, y: 50, width: 900, height: 700 },
            maximized: false,
          };
        write(path.join(fixture, 'expected.json'), { old, next });
        installCommitCrash(db.connection, boundary, () => {
          cases.primaryUnchanged =
            read(path.join(fixture, 'primary.json')) === JSON.stringify(primary());
          cases.commitBoundaryReached = true;
          if (!Object.values(cases).every((v) => v === true) || typeof process.crash !== 'function')
            throw Error('SETTINGS_CRASH');
          output();
          fs.writeSync(1, 'SETTINGS_ARMED\n');
          process.crash();
        });
        db.commitSettings(old.revision, next, () => {});
        throw Error('SETTINGS_CRASH_MISSED');
      }
      const receipt = parseBackupReceipt(read(path.join(fixture, 'prerequisite.json')));
      if (receipt?.header.schemaVersion !== 2 || receipt.header.reason !== 'PRE_MIGRATION')
        throw Error('SETTINGS_BACKUP');
      const verified = await service.validate(location, receipt.header.backupId);
      cases.migration2BackupAuthenticated = JSON.stringify(verified) === JSON.stringify(receipt);
      db.validate();
      cases.schema3 = db.version === 3;
      const expected = exact(read(path.join(fixture, 'expected.json')), ['old', 'next']);
      const current = db.readSettings(),
        previous = db.readPreviousSettings();
      cases[boundary === 'BEFORE_COMMIT' ? 'wholeOldState' : 'wholeNewState'] =
        JSON.stringify(current) ===
        JSON.stringify(boundary === 'BEFORE_COMMIT' ? expected.old : expected.next);
      cases.previousState =
        JSON.stringify(previous) ===
        JSON.stringify(boundary === 'BEFORE_COMMIT' ? null : expected.old);
      cases.integrity =
        statement(db.connection, 'PRAGMA integrity_check', (s) => s.get().integrity_check) === 'ok';
      cases.primaryUnchanged =
        read(path.join(fixture, 'primary.json')) === JSON.stringify(primary());
      db.close();
      db = null;
      complete = true;
      app.quit();
    })
    .catch(failed);
  app.on('will-quit', () => {
    try {
      if (!complete) throw Error('SETTINGS_CLOSE');
      cases.orderlyQuit = true;
      output();
      clearTimeout(deadline);
      fs.writeSync(1, 'SETTINGS_CLOSED\n');
    } catch {
      failed();
    }
  });
} catch {
  failed();
}
