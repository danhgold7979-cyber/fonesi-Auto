import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FoundationDatabase } from '../src/main/foundation-database.ts';
import { SettingsStore } from '../src/main/settings-store.ts';
import { createPersistenceLifecycle } from '../src/main/persistence-lifecycle.ts';
import { LogStore } from '../src/main/log-store.ts';
import { ApplicationLogger } from '../src/main/logging.ts';
import { restoreWindowOptions, restoreMaximized } from '../src/main/settings-window.ts';
const utc = '2026-10-31T12:00:00.000Z';
async function fixture(faultPhase = null, faultPoint = 'append', confirm = async () => true) {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'settings-compose-')),
    id = randomUUID(),
    token = randomUUID();
  writeFileSync(join(root, '.owner'), token, { flag: 'wx' });
  const file = join(root, 'foundation.sqlite');
  let db = new FoundationDatabase(file, id);
  // Actual SQLite snapshots; synthetic backup receipts are not encryption/native-provider evidence.
  await db.migrate(async (version) => {
    const output = join(root, `backup-${version}.sqlite`);
    await db.snapshot(output);
    const snapshot = new FoundationDatabase(output, id, true);
    try {
      return {
        backupId: randomUUID(),
        fingerprint: snapshot.fingerprint(),
        schemaVersion: version,
      };
    } finally {
      snapshot.close();
    }
  }, 1000);
  let fault = false;
  const log = await LogStore.open(
    { root: join(root, 'logs-main'), parentToken: token },
    utc,
    (point) => {
      if (fault && point === faultPoint) throw Error('PRIVATE_FAILURE');
    },
  );
  const logger = new ApplicationLogger(
    log,
    () => utc,
    () => {},
  );
  const store = new SettingsStore({
    db,
    assertOwned: async () => {},
    assertOwnedSync: () => {},
    audit: async (fields) => {
      fault = fields.phase === faultPhase;
      return logger.settingsAudit(fields);
    },
    confirm,
    readWindow: () => ({ normalBounds: null, maximized: false }),
    windowOwned: () => true,
  });
  const caller = store.grant(
    ['preferences.get', 'preferences.update', 'preferences.reset', 'preferences.restorePrevious'],
    () => {},
  );
  return {
    root,
    file,
    id,
    store,
    caller,
    get db() {
      return db;
    },
    reopen() {
      db.close();
      db = new FoundationDatabase(file, id);
      return db;
    },
    async cleanup() {
      await store.shutdown();
      await logger.close();
      db.close();
      assert.equal(realpathSync(root), root);
      assert.equal(readFileSync(join(root, '.owner'), 'utf8'), token);
      rmSync(root, { recursive: true, force: false });
    },
  };
}
const update = (revision, patch) => ({
  version: 1,
  requestId: 'r',
  method: 'preferences.update',
  expectedRevision: revision,
  patch,
});
test('real settings DB/logger composition commits CAS and preserves previous across reopen', async () => {
  const f = await fixture();
  try {
    const result = await f.store.execute(
      f.caller,
      update(0, { theme: 'DARK', dockWidth: 510, tileWidth: 151 }),
    );
    assert.equal(result.outcome, 'COMMITTED');
    assert.equal(result.auditHealth, 'AVAILABLE');
    assert.equal((await f.store.execute(f.caller, update(0, { theme: 'LIGHT' }))).code, 'CONFLICT');
    await f.store.shutdown();
    const db = f.reopen();
    assert.equal(db.readSettings().theme, 'DARK');
    assert.equal(db.readSettings().revision, 1);
    assert.equal(db.readPreviousSettings().theme, 'LIGHT');
    assert.equal(db.readPreviousSettings().revision, 0);
  } finally {
    await f.cleanup();
  }
});
for (const point of ['append', 'sync'])
  test(`real logger ${point} intent failure prevents actual SQLite commit`, async () => {
    const f = await fixture('INTENT', point);
    try {
      const before = f.db.fingerprint();
      const result = await f.store.execute(f.caller, update(0, { theme: 'DARK' }));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'WRITE_FAILED');
      assert.equal(result.auditHealth, 'DEGRADED');
      assert.equal(f.db.readSettings().revision, 0);
      assert.equal(f.db.fingerprint(), before);
    } finally {
      await f.cleanup();
    }
  });
test('real result audit failure preserves committed SQLite success and reopen state', async () => {
  const f = await fixture('RESULT', 'sync');
  try {
    const result = await f.store.execute(f.caller, update(0, { theme: 'DARK' }));
    assert.equal(result.outcome, 'COMMITTED');
    assert.equal(result.auditHealth, 'DEGRADED');
    assert.equal(f.db.readSettings().revision, 1);
    await f.store.shutdown();
    assert.equal(f.reopen().readSettings().theme, 'DARK');
  } finally {
    await f.cleanup();
  }
});

test('actual database snapshot projects native-only restoration fields without preference extras', async () => {
  const f = await fixture();
  try {
    const current = f.db.readSettings();
    const value = {
      ...current,
      revision: 1,
      theme: 'DARK',
      normalBounds: { x: 100, y: 200, width: 800, height: 600 },
      maximized: true,
    };
    assert.equal(f.db.commitSettings(0, value, () => {}).ok, true);
    const saved = f.db.readSettings(),
      native = { normalBounds: saved.normalBounds, maximized: saved.maximized };
    assert.deepEqual(restoreWindowOptions(native, [{ x: 0, y: 0, width: 1920, height: 1080 }]), {
      width: 800,
      height: 600,
      x: 100,
      y: 200,
    });
    let maximized = false;
    assert.equal(
      restoreMaximized(
        {
          isDestroyed: () => false,
          maximize() {
            maximized = true;
          },
        },
        native,
      ),
      true,
    );
    assert.equal(maximized, true);
  } finally {
    await f.cleanup();
  }
});
test('actual main restore callsites explicitly project native fields rather than full rows', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
    .replace(/\s+/g, '')
    .replace(/,([})])/g, '$1');
  for (const name of ['initialSettings', 'saved']) {
    assert.ok(
      main.includes(
        `restoreWindowOptions({normalBounds:${name}.normalBounds,maximized:${name}.maximized},`,
      ),
    );
    assert.ok(
      main.includes(
        `restoreMaximized(window,{normalBounds:${name}.normalBounds,maximized:${name}.maximized})`,
      ),
    );
    assert.equal(main.includes(`restoreWindowOptions(${name},`), false);
  }
});

test('pending confirmation drain deadline preserves open DB and does not cancel late settlement', async () => {
  let enter, release;
  const entered = new Promise((resolve) => {
    enter = resolve;
  });
  const f = await fixture(null, 'append', async () => {
    enter();
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  try {
    const operation = f.store.execute(f.caller, {
      version: 1,
      requestId: 'r',
      method: 'preferences.reset',
      expectedRevision: 0,
    });
    await entered;
    const drain = f.store.shutdown(),
      lifecycle = createPersistenceLifecycle(10);
    await lifecycle.open(async () => ({
      shutdown: async () => {
        await drain;
      },
    }));
    let databaseClosed = false;
    await assert.rejects(
      (async () => {
        await lifecycle.stop();
        databaseClosed = true;
        f.db.close();
      })(),
      /PERSISTENCE_SHUTDOWN_TIMEOUT/,
    );
    assert.equal(databaseClosed, false);
    assert.equal(f.db.readSettings().revision, 0);
    release(false);
    assert.equal((await operation).code, 'CANCELLED');
    await drain;
    assert.equal(f.db.readSettings().revision, 0);
    assert.equal(databaseClosed, false);
    await assert.rejects(lifecycle.stop(), /PERSISTENCE_SHUTDOWN_TIMEOUT/);
  } finally {
    release?.(false);
    await f.cleanup();
  }
});
test('actual main bounds settings drain before destruction and database shutdown', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
    .replace(/\s+/g, '')
    .replace(/,([})])/g, '$1');
  assert.ok(main.includes('settingsDrain=settingsStore?.shutdown()'));
  assert.ok(
    main.includes(
      'awaitsettingsLifecycle.stop();cleanupComplete=cleanup()&&cleanupComplete;awaitsecretLifecycle.stop();awaitpersistenceLifecycle.stop();',
    ),
  );
  assert.ok(
    main.includes("catch{cleanupComplete=false;console.error('PERSISTENCE_SHUTDOWN_FAILED');}"),
  );
  assert.ok(main.includes('resume:()=>(cleanupComplete?app.quit():app.exit(1))'));
});

test('actual main gates startup window events but retains unconditional final native snapshot drain', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
    .replace(/\s+/g, '')
    .replace(/,([})])/g, '$1');
  assert.ok(main.includes('letwindowTracking=false;'));
  assert.ok(main.includes('()=>{windowTracking=true;}'));
  assert.ok(
    main.includes('constobserveWindow=()=>{if(windowTracking)settingsStore?.observeWindow();};'),
  );
  assert.ok(main.includes('settingsDrain=settingsStore?.shutdown();'));
  assert.equal(main.includes('if(windowTracking)settingsDrain='), false);
});
