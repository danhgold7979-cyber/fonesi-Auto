import test from 'node:test';
import assert from 'node:assert/strict';
import { SettingsStore } from '../src/main/settings-store.ts';
const defaults = () => ({
  revision: 0,
  theme: 'LIGHT',
  dockWidth: null,
  tileWidth: 150,
  normalBounds: null,
  maximized: false,
});
function fixture(overrides = {}) {
  let current = defaults(),
    previous = null,
    admitted = true,
    owned = true,
    window = { normalBounds: null, maximized: false };
  const audits = [];
  let commit = (expected, next, admit) => {
    admit();
    if (expected !== current.revision) return { ok: false, code: 'CONFLICT' };
    previous = current;
    current = structuredClone(next);
    return { ok: true, value: structuredClone(current) };
  };
  const db = {
    readSettings: () => structuredClone(current),
    readPreviousSettings: () => structuredClone(previous),
    commitSettings(expected, next, admit) {
      return commit(expected, next, admit);
    },
  };
  const store = new SettingsStore({
    db,
    assertOwned: async () => {
      if (!owned) throw Error();
    },
    assertOwnedSync: () => {
      if (!owned) throw Error();
    },
    audit: async (fields) => {
      audits.push(fields);
      return 'AVAILABLE';
    },
    confirm: async () => true,
    readWindow: () => window,
    windowOwned: () => owned,
    ...overrides,
  });
  const caller = store.grant(
    ['preferences.get', 'preferences.update', 'preferences.reset', 'preferences.restorePrevious'],
    () => {
      if (!admitted) throw Error();
    },
  );
  return {
    store,
    caller,
    db,
    audits,
    get commit() {
      return commit;
    },
    set commit(value) {
      commit = value;
    },
    get current() {
      return current;
    },
    set admitted(value) {
      admitted = value;
    },
    set owned(value) {
      owned = value;
    },
    set window(value) {
      window = value;
    },
  };
}
const get = { version: 1, requestId: 'r', method: 'preferences.get' };
const update = (revision, patch) => ({
  version: 1,
  requestId: 'r',
  method: 'preferences.update',
  expectedRevision: revision,
  patch,
});
test('CAS committed/noop/stale and previous restore are serialized', async () => {
  const f = fixture();
  assert.equal((await f.store.execute(f.caller, get)).outcome, 'OBSERVED');
  assert.equal(
    (await f.store.execute(f.caller, update(0, { theme: 'DARK' }))).outcome,
    'COMMITTED',
  );
  assert.equal(
    (await f.store.execute(f.caller, update(1, { theme: 'DARK' }))).outcome,
    'UNCHANGED',
  );
  assert.equal((await f.store.execute(f.caller, update(0, { tileWidth: 80 }))).code, 'CONFLICT');
  const restored = await f.store.execute(f.caller, {
    version: 1,
    requestId: 'r',
    method: 'preferences.restorePrevious',
    expectedRevision: 1,
  });
  assert.equal(restored.outcome, 'COMMITTED');
  assert.equal(f.current.theme, 'LIGHT');
  assert.equal(f.current.revision, 2);
  await f.store.shutdown();
});
test('busy reads do not queue; revocation during confirmation denies commit', async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({ confirm: () => pending });
  const result = f.store.execute(f.caller, {
    version: 1,
    requestId: 'r',
    method: 'preferences.reset',
    expectedRevision: 0,
  });
  assert.equal((await f.store.execute(f.caller, get)).code, 'BUSY');
  f.admitted = false;
  release(true);
  assert.equal((await result).code, 'SESSION_REVOKED');
  assert.equal(f.current.revision, 0);
  await f.store.shutdown();
});
test('intent failure prevents write; result failure does not misreport committed mutation', async () => {
  for (const phase of ['INTENT', 'RESULT']) {
    const f = fixture({
      audit: async (fields) => (fields.phase === phase ? 'DEGRADED' : 'AVAILABLE'),
    });
    const result = await f.store.execute(f.caller, update(0, { theme: 'DARK' }));
    assert.equal(result.ok, phase === 'RESULT');
    assert.equal(f.current.revision, phase === 'RESULT' ? 1 : 0);
    if (result.ok) {
      assert.equal(result.outcome, 'COMMITTED');
      assert.equal(result.auditHealth, 'DEGRADED');
    }
    await f.store.shutdown();
  }
});
test('cancel never writes and reset preserves native geometry', async () => {
  const f = fixture({ confirm: async () => false });
  assert.equal(
    (
      await f.store.execute(f.caller, {
        version: 1,
        requestId: 'r',
        method: 'preferences.reset',
        expectedRevision: 0,
      })
    ).code,
    'CANCELLED',
  );
  assert.equal(f.current.revision, 0);
  await f.store.shutdown();
});
test('unknown commit remains sticky even if a fake adapter permits read', async () => {
  const f = fixture();
  const original = f.commit;
  f.commit = () => ({ ok: false, code: 'OUTCOME_UNKNOWN' });
  assert.equal(
    (await f.store.execute(f.caller, update(0, { theme: 'DARK' }))).code,
    'OUTCOME_UNKNOWN',
  );
  f.commit = original;
  assert.equal(
    (await f.store.execute(f.caller, update(0, { theme: 'DARK' }))).code,
    'OUTCOME_UNKNOWN',
  );
  assert.equal((await f.store.execute(f.caller, get)).ok, true);
  assert.equal(
    (await f.store.execute(f.caller, update(0, { theme: 'DARK' }))).code,
    'OUTCOME_UNKNOWN',
  );
  await f.store.shutdown();
});
test('native latest geometry merges after UI mutation, shutdown drains and rejects view work', async () => {
  const f = fixture();
  f.window = { normalBounds: { x: 1, y: 2, width: 600, height: 400 }, maximized: false };
  f.store.observeWindow();
  await f.store.execute(f.caller, update(0, { theme: 'DARK' }));
  f.window = { normalBounds: { x: 3, y: 4, width: 700, height: 500 }, maximized: true };
  f.store.observeWindow();
  f.admitted = false;
  const first = f.store.shutdown(),
    second = f.store.shutdown();
  assert.equal(first, second);
  const result = await first;
  assert.equal(result.outcome, 'COMMITTED');
  assert.equal(f.current.theme, 'DARK');
  assert.equal(f.current.normalBounds.x, 3);
  assert.equal(f.current.maximized, true);
  assert.equal((await f.store.execute(f.caller, get)).code, 'SESSION_REVOKED');
});
test('input patch snapshot and final synchronous admission withstand await mutation/revocation', async () => {
  let resolve;
  let count = 0;
  const f = fixture({
    assertOwned: () =>
      ++count === 1
        ? new Promise((r) => {
            resolve = r;
          })
        : Promise.resolve(),
  });
  const patch = { theme: 'DARK' };
  const pending = f.store.execute(f.caller, update(0, patch));
  patch.theme = 'LIGHT';
  resolve();
  assert.equal((await pending).outcome, 'COMMITTED');
  assert.equal(f.current.theme, 'DARK');
  const commit = f.commit;
  f.commit = (...args) => {
    f.admitted = false;
    return commit(...args);
  };
  assert.equal(
    (await f.store.execute(f.caller, update(1, { tileWidth: 90 }))).code,
    'SESSION_REVOKED',
  );
  assert.equal(f.current.revision, 1);
  await f.store.shutdown();
});
test('native debounce saves latest one snapshot and reset preserves genuine geometry', async () => {
  const f = fixture();
  f.window = { normalBounds: { x: 10, y: 20, width: 640, height: 480 }, maximized: false };
  f.store.observeWindow();
  f.window = { normalBounds: { x: 30, y: 40, width: 800, height: 600 }, maximized: true };
  f.store.observeWindow();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(f.current.revision, 1);
  assert.equal(f.current.normalBounds.x, 30);
  assert.equal(f.store.lastWindowResult.outcome, 'COMMITTED');
  await f.store.execute(f.caller, update(1, { theme: 'DARK', tileWidth: 200 }));
  const result = await f.store.execute(f.caller, {
    version: 1,
    requestId: 'r',
    method: 'preferences.reset',
    expectedRevision: 2,
  });
  assert.equal(result.outcome, 'COMMITTED');
  assert.equal(f.current.theme, 'LIGHT');
  assert.equal(f.current.tileWidth, 150);
  assert.equal(f.current.normalBounds.x, 30);
  assert.equal(f.current.maximized, true);
  await f.store.shutdown();
});
test('forged token, wrong method grant and lost ownership deny writes', async () => {
  const f = fixture();
  assert.equal(
    (await f.store.execute(Object.freeze({ settingsCaller: true }), update(0, { theme: 'DARK' })))
      .code,
    'UNTRUSTED_SENDER',
  );
  const readOnly = f.store.grant(['preferences.get'], () => {});
  assert.equal(
    (await f.store.execute(readOnly, update(0, { theme: 'DARK' }))).code,
    'UNTRUSTED_SENDER',
  );
  f.owned = false;
  assert.equal((await f.store.execute(f.caller, update(0, { theme: 'DARK' }))).ok, false);
  assert.equal(f.current.revision, 0);
  await f.store.shutdown();
});

test('null undefined and forged capabilities cannot choose private native authority for any method', async () => {
  const f = fixture();
  const requests = [
    get,
    update(0, { theme: 'DARK' }),
    { version: 1, requestId: 'r', method: 'preferences.reset', expectedRevision: 0 },
    { version: 1, requestId: 'r', method: 'preferences.restorePrevious', expectedRevision: 0 },
  ];
  for (const token of [null, undefined, {}, Object.freeze({ settingsCaller: true })])
    for (const request of requests)
      assert.equal((await f.store.execute(token, request)).code, 'UNTRUSTED_SENDER');
  assert.equal(f.current.revision, 0);
  await f.store.shutdown();
});

test('service results expose only nonsecret preference fields, never native geometry', async () => {
  const f = fixture();
  const result = await f.store.execute(f.caller, get);
  assert.deepEqual(Object.keys(result.settings), [
    'revision',
    'theme',
    'dockWidth',
    'tileWidth',
    'persistence',
  ]);
  assert.equal(result.settings.persistence, 'PERSISTED');
  await f.store.shutdown();
});

test('constructor snapshots adapter callbacks and only literal confirmation true admits', async () => {
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  let writes = 0;
  const current = defaults();
  const options = {
    db: {
      readSettings: () => current,
      readPreviousSettings: () => null,
      commitSettings: () => {
        writes++;
        return { ok: false, code: 'WRITE_FAILED' };
      },
    },
    assertOwned: () => waiting,
    assertOwnedSync: () => {},
    audit: async () => 'AVAILABLE',
    confirm: async () => false,
    readWindow: () => ({ normalBounds: null, maximized: false }),
    windowOwned: () => true,
  };
  const store = new SettingsStore(options),
    token = store.grant(['preferences.reset'], () => {});
  const pending = store.execute(token, {
    version: 1,
    requestId: 'r',
    method: 'preferences.reset',
    expectedRevision: 0,
  });
  options.confirm = async () => true;
  options.db.commitSettings = () => {
    writes++;
    throw Error();
  };
  options.assertOwnedSync = () => {
    throw Error();
  };
  release();
  assert.equal((await pending).code, 'CANCELLED');
  assert.equal(writes, 0);
  await store.shutdown();
  const f = fixture({ confirm: async () => 'yes' });
  assert.equal(
    (
      await f.store.execute(f.caller, {
        version: 1,
        requestId: 'r',
        method: 'preferences.reset',
        expectedRevision: 0,
      })
    ).code,
    'CANCELLED',
  );
  await f.store.shutdown();
});

test('missing previous after nonzero revision requires recovery without writes', async () => {
  let writes = 0;
  const f = fixture({
    db: {
      readSettings: () => ({ ...defaults(), revision: 1 }),
      readPreviousSettings: () => null,
      commitSettings() {
        writes++;
        throw Error();
      },
    },
  });
  assert.equal((await f.store.execute(f.caller, get)).code, 'RECOVERY_REQUIRED');
  assert.equal(
    (await f.store.execute(f.caller, update(1, { theme: 'DARK' }))).code,
    'RECOVERY_REQUIRED',
  );
  assert.equal(writes, 0);
  await f.store.shutdown();
});
