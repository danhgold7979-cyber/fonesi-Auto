import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { installPreferencesBridge, PREFERENCES_CHANNEL } from '../src/preferences-bridge.ts';
import { SettingsStore } from '../src/main/settings-store.ts';
const require = createRequire(import.meta.url);
const { installFoundationBridge } = require('../build/foundation-bridge.cjs');
const ENTRY = 'auto-foundation://app/status.html';
const request = (method = 'preferences.get', extra = {}) =>
  JSON.stringify({ version: 1, requestId: 'request_canary', method, ...extra });
function fixture(options = {}, notification = () => {}, observed = () => {}) {
  const handlers = new Map(),
    removed = [];
  const ipc = {
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
    removeHandler(channel) {
      removed.push(channel);
      handlers.delete(channel);
    },
  };
  const foundation = installFoundationBridge(ipc);
  const contents = new EventEmitter();
  contents.isDestroyed = () => false;
  contents.mainFrame = { origin: 'auto-foundation://app', url: ENTRY };
  const window = new EventEmitter();
  window.webContents = contents;
  const view = foundation.attach(window);
  contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY });
  assert.equal(view.arm(), true);
  const event = { sender: contents, senderFrame: contents.mainFrame };
  let current = {
      revision: 0,
      theme: 'LIGHT',
      dockWidth: null,
      tileWidth: 150,
      normalBounds: null,
      maximized: false,
    },
    previous = null,
    committed = 0;
  const db = {
    readSettings: () => structuredClone(current),
    readPreviousSettings: () => structuredClone(previous),
    commitSettings(expected, next, admit) {
      admit();
      if (expected !== current.revision) return { ok: false, code: 'CONFLICT' };
      previous = current;
      current = structuredClone(next);
      return { ok: true, value: structuredClone(current) };
    },
  };
  const store = new SettingsStore({
    db,
    assertOwned: async () => {},
    assertOwnedSync: () => {},
    audit: async () => 'AVAILABLE',
    confirm: async () => true,
    readWindow: () => ({ normalBounds: null, maximized: false }),
    windowOwned: () => true,
    ...options,
  });
  const bridge = installPreferencesBridge(
    ipc,
    foundation.admitPreferences,
    () => store,
    () => {
      committed++;
      notification();
    },
    observed,
  );
  const handler = handlers.get(PREFERENCES_CHANNEL);
  return {
    contents,
    event,
    view,
    foundation,
    bridge,
    store,
    get current() {
      return current;
    },
    get committed() {
      return committed;
    },
    call: async (raw = request(), ev = event, ...extra) =>
      JSON.parse(await handler(ev, raw, ...extra)),
    async cleanup() {
      bridge.dispose();
      foundation.dispose();
      await store.shutdown();
    },
  };
}
test('real shared admission exposes only preferences and rejects sender/frame/wire negatives', async () => {
  const f = fixture();
  try {
    const read = await f.call();
    assert.equal(read.ok, true);
    assert.deepEqual(Object.keys(read.settings), [
      'revision',
      'theme',
      'dockWidth',
      'tileWidth',
      'persistence',
    ]);
    for (const ev of [
      { sender: {}, senderFrame: null },
      { ...f.event, senderFrame: null },
      { ...f.event, senderFrame: { ...f.contents.mainFrame } },
      {
        sender: f.contents,
        get senderFrame() {
          throw Error('PRIVATE');
        },
      },
    ])
      assert.equal((await f.call(request(), ev)).code, 'UNTRUSTED_SENDER');
    f.contents.isDestroyed = () => true;
    assert.equal((await f.call()).code, 'UNTRUSTED_SENDER');
    f.contents.isDestroyed = () => false;
    for (const raw of [
      '{',
      request().replace('"version":1', '"version":1,"version":1'),
      request('preferences.get', { path: 'PRIVATE' }),
      request('preferences.update', { expectedRevision: 0, patch: { normalBounds: null } }),
    ])
      assert.equal((await f.call(raw)).ok, false);
    assert.equal((await f.call(request(), f.event, 'extra')).code, 'INVALID_SHAPE');
    assert.equal((await f.call('x'.repeat(1025))).code, 'PAYLOAD_TOO_LARGE');
    assert.equal(f.current.revision, 0);
  } finally {
    await f.cleanup();
  }
});
test('observed navigation during intent audit prevents actual commit', async () => {
  let release, entered;
  const reached = new Promise((resolve) => {
    entered = resolve;
  });
  const f = fixture({
    audit: async (fields) => {
      if (fields.phase === 'INTENT') {
        entered();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return 'AVAILABLE';
    },
  });
  try {
    const pending = f.call(
      request('preferences.update', { expectedRevision: 0, patch: { theme: 'DARK' } }),
    );
    await reached;
    f.contents.emit('will-navigate', {});
    release();
    assert.equal((await pending).code, 'SESSION_REVOKED');
    assert.equal(f.current.revision, 0);
    assert.equal(f.committed, 0);
    assert.equal(f.view.arm(), false);
  } finally {
    await f.cleanup();
  }
});
test('unobserved current browser URL change still denies final transaction admission', async () => {
  let release, entered;
  const reached = new Promise((resolve) => {
    entered = resolve;
  });
  const f = fixture({
    audit: async (fields) => {
      if (fields.phase === 'INTENT') {
        entered();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return 'AVAILABLE';
    },
  });
  try {
    const pending = f.call(
      request('preferences.update', { expectedRevision: 0, patch: { theme: 'DARK' } }),
    );
    await reached;
    f.contents.mainFrame.url = 'about:blank';
    release();
    assert.equal((await pending).code, 'SESSION_REVOKED');
    assert.equal(f.current.revision, 0);
  } finally {
    await f.cleanup();
  }
});
test('native confirmation pending revocation cannot commit and read returns BUSY', async () => {
  let release, entered;
  const reached = new Promise((resolve) => {
    entered = resolve;
  });
  const f = fixture({
    confirm: async () => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  try {
    const pending = f.call(request('preferences.reset', { expectedRevision: 0 }));
    await reached;
    assert.equal((await f.call()).code, 'BUSY');
    f.contents.emit('render-process-gone');
    release(true);
    assert.equal((await pending).code, 'SESSION_REVOKED');
    assert.equal(f.current.revision, 0);
  } finally {
    await f.cleanup();
  }
});
test('already committed effect is retained internally while stale reply is denied', async () => {
  let release, entered;
  const reached = new Promise((resolve) => {
    entered = resolve;
  });
  const f = fixture({
    audit: async (fields) => {
      if (
        fields.phase === 'RESULT' &&
        fields.operation === 'UPDATE' &&
        fields.resultingRevision === 1
      ) {
        entered();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return 'AVAILABLE';
    },
  });
  try {
    const pending = f.call(
      request('preferences.update', { expectedRevision: 0, patch: { theme: 'DARK' } }),
    );
    await reached;
    assert.equal(f.current.revision, 1);
    f.contents.emit('will-navigate', {});
    release();
    assert.equal((await pending).code, 'SESSION_REVOKED');
    assert.equal(f.current.theme, 'DARK');
    assert.equal(f.committed, 1);
    assert.equal(f.view.arm(), false);
  } finally {
    await f.cleanup();
  }
});
test('disposed preferences handler cannot rearm or perform a write', async () => {
  const f = fixture();
  try {
    f.bridge.dispose();
    assert.equal(
      (
        await f.call(
          request('preferences.update', { expectedRevision: 0, patch: { theme: 'DARK' } }),
        )
      ).code,
      'SESSION_REVOKED',
    );
    assert.equal(f.current.revision, 0);
  } finally {
    await f.cleanup();
  }
});

test('postcommit notification failure cannot turn known durable success into retryable error', async () => {
  const f = fixture({}, () => {
    throw Error('PRIVATE_NOTIFICATION');
  });
  try {
    const result = await f.call(
      request('preferences.update', { expectedRevision: 0, patch: { theme: 'DARK' } }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'COMMITTED');
    assert.equal(f.current.revision, 1);
    assert.equal(f.committed, 1);
    assert.equal(JSON.stringify(result).includes('PRIVATE_NOTIFICATION'), false);
  } finally {
    await f.cleanup();
  }
});

test('observed notification fires only admitted successful get, not writes or denied reads', async () => {
  let observations = 0;
  const f = fixture(
    {},
    () => {},
    () => {
      observations++;
    },
  );
  try {
    assert.equal(
      (
        await f.call(
          request('preferences.update', { expectedRevision: 0, patch: { theme: 'DARK' } }),
        )
      ).outcome,
      'COMMITTED',
    );
    assert.equal(observations, 0);
    assert.equal((await f.call('{')).ok, false);
    assert.equal(observations, 0);
    assert.equal((await f.call(request(), { sender: {}, senderFrame: null })).ok, false);
    assert.equal(observations, 0);
    assert.equal((await f.call()).outcome, 'OBSERVED');
    assert.equal(observations, 1);
    f.contents.emit('will-navigate', {});
    assert.equal((await f.call()).code, 'SESSION_REVOKED');
    assert.equal(observations, 1);
  } finally {
    await f.cleanup();
  }
});
test('read revoked during result audit never signals successful hydration', async () => {
  let entered,
    release,
    observations = 0;
  const reached = new Promise((resolve) => {
    entered = resolve;
  });
  const f = fixture(
    {
      audit: async (fields) => {
        if (fields.operation === 'READ' && fields.code === 'OK') {
          entered();
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        return 'AVAILABLE';
      },
    },
    () => {},
    () => {
      observations++;
    },
  );
  try {
    const pending = f.call();
    await reached;
    f.contents.mainFrame.url = 'about:blank';
    release();
    assert.equal((await pending).code, 'SESSION_REVOKED');
    assert.equal(observations, 0);
  } finally {
    await f.cleanup();
  }
});
test('failed store read cannot signal hydration', async () => {
  let observations = 0;
  const f = fixture(
    {
      db: {
        readSettings() {
          throw Error('PRIVATE');
        },
        readPreviousSettings: () => null,
        commitSettings() {
          throw Error();
        },
      },
    },
    () => {},
    () => {
      observations++;
    },
  );
  try {
    assert.equal((await f.call()).code, 'RECOVERY_REQUIRED');
    assert.equal(observations, 0);
  } finally {
    await f.cleanup();
  }
});
test('composed startup maximized events remain gated until admitted get without BUSY', async () => {
  let tracking = false,
    current = {
      revision: 1,
      theme: 'DARK',
      dockWidth: null,
      tileWidth: 150,
      normalBounds: { x: 10, y: 20, width: 800, height: 600 },
      maximized: true,
    },
    previous = {
      revision: 0,
      theme: 'LIGHT',
      dockWidth: null,
      tileWidth: 150,
      normalBounds: null,
      maximized: false,
    },
    windowState = { normalBounds: { x: 10, y: 20, width: 800, height: 600 }, maximized: true };
  const db = {
    readSettings: () => current,
    readPreviousSettings: () => previous,
    commitSettings(expected, next, admit) {
      admit();
      assert.equal(expected, current.revision);
      previous = current;
      current = structuredClone(next);
      return { ok: true, value: current };
    },
  };
  const f = fixture(
    { db, readWindow: () => windowState },
    () => {},
    () => {
      tracking = true;
    },
  );
  const observe = () => {
    if (tracking) f.store.observeWindow();
  };
  try {
    observe();
    observe();
    await new Promise((resolve) => setTimeout(resolve, 275));
    assert.equal(current.revision, 1);
    assert.equal(f.store.lastWindowResult, null);
    const read = await f.call();
    assert.equal(read.outcome, 'OBSERVED');
    assert.equal(read.settings.theme, 'DARK');
    assert.equal(tracking, true);
    assert.equal(current.revision, 1);
    windowState = { ...windowState, maximized: false };
    observe();
    await new Promise((resolve) => setTimeout(resolve, 275));
    assert.equal(current.revision, 2);
    assert.equal(current.maximized, false);
  } finally {
    await f.cleanup();
  }
});
