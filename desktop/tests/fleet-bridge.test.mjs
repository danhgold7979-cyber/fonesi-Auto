import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { installFleetBridge, FLEET_CHANNEL } from '../src/fleet-bridge.ts';
import { createFleetService } from '../src/main/fleet-service.ts';
import { emptyRegistry, reconcileRegistry } from '../src/main/transport-registry.ts';
const require = createRequire(import.meta.url);
const { installFoundationBridge } = require('../build/foundation-bridge.cjs');
const ENTRY = 'auto-foundation://app/status.html';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const request = (method = 'fleet.get', extra = {}) =>
  JSON.stringify({ version: 1, requestId: 'f1', method, ...extra });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function fixture(audit = async () => 'AVAILABLE') {
  const handlers = new Map();
  const ipc = {
    handle: (key, fn) => handlers.set(key, fn),
    removeHandler: (key) => handlers.delete(key),
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
  let n = 10;
  const r = reconcileRegistry(
    emptyRegistry(),
    {
      sequence: 1,
      observedAtUtc: 1000,
      source: 'ADB_DISCOVERY',
      rows: [{ serial: 'synthetic-private-fixture', transportId: '1', state: 'OFFLINE' }],
      proofs: [],
    },
    {
      nextId: () => id(n++),
      budget: { maxDevices: 256, maxBindings: 4096, maxEvidence: 4096, maxClaims: 256 },
    },
  );
  assert.equal(r.ok, true);
  const service = createFleetService({
    registry: () => r.snapshot,
    assertOwnedSync: () => {},
    newDiagnostic: () => id(900),
    audit,
    availability: () => 'OBSERVED',
  });
  let exposed = service;
  const bridge = installFleetBridge(ipc, foundation.admitPreferences, () => exposed);
  const handler = handlers.get(FLEET_CHANNEL);
  return {
    foundation,
    contents,
    event,
    view,
    bridge,
    service,
    handlers,
    hide: () => {
      exposed = undefined;
    },
    call: async (raw = request(), ev = event, ...extra) =>
      JSON.parse(await handler(ev, raw, ...extra)),
    noargs: async () => JSON.parse(await handler(event)),
    selected: () =>
      request('fleet.selection.replace', {
        expectedRevision: 0,
        selection: {
          selectedDeviceIds: [r.snapshot.devices[0].deviceId],
          activeDeviceId: null,
          groups: [],
        },
      }),
    async cleanup() {
      bridge.dispose();
      foundation.dispose();
      await service.close();
    },
  };
}
test('compiled shared ViewSession and actual fleet dispatcher reject wire/sender/frame negatives', async () => {
  const f = fixture();
  try {
    assert.equal((await f.call()).outcome, 'OBSERVED');
    assert.equal((await f.noargs()).code, 'INVALID_TRANSPORT');
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
      request('fleet.get', { serial: 'PRIVATE' }),
      { version: 1 },
    ])
      assert.equal((await f.call(raw)).ok, false);
    assert.equal((await f.call('x'.repeat(16385))).code, 'PAYLOAD_TOO_LARGE');
    assert.equal((await f.call(request(), f.event, 'extra')).code, 'INVALID_SHAPE');
    assert.equal((await f.call()).fleet.selection.revision, 0);
  } finally {
    await f.cleanup();
  }
});
test('navigation during service INTENT prevents selection CAS', async () => {
  const gate = deferred(),
    entered = deferred();
  const f = fixture(async (e) => {
    if (e.phase === 'INTENT') {
      entered.resolve();
      await gate.promise;
    }
    return 'AVAILABLE';
  });
  try {
    const pending = f.call(f.selected());
    await entered.promise;
    f.contents.emit('will-navigate', {});
    gate.resolve();
    assert.equal((await pending).code, 'SESSION_REVOKED');
    assert.equal(f.view.arm(), false);
    const cap = f.service.grant(() => {});
    const v = JSON.parse(
      await f.service.execute(cap, { version: 1, requestId: 'f3', method: 'fleet.get' }),
    );
    assert.equal(v.fleet.selection.revision, 0);
    f.service.revoke(cap);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('post-application reload denies stale reply without reversing actual selection', async () => {
  const gate = deferred(),
    entered = deferred();
  const f = fixture(async (e) => {
    if (e.operation === 'SELECT' && e.phase === 'RESULT') {
      entered.resolve();
      await gate.promise;
    }
    return 'AVAILABLE';
  });
  try {
    const pending = f.call(f.selected());
    await entered.promise;
    f.contents.emit('will-navigate', {});
    gate.resolve();
    assert.equal((await pending).code, 'SESSION_REVOKED');
    const cap = f.service.grant(() => {});
    const v = JSON.parse(
      await f.service.execute(cap, { version: 1, requestId: 'f3', method: 'fleet.get' }),
    );
    assert.equal(v.fleet.selection.revision, 1);
    f.service.revoke(cap);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('shared seven-ordinary-admission budget denies fleet then releases idempotently', async () => {
  const f = fixture();
  const held = [];
  try {
    for (let i = 0; i < 7; i++) {
      const a = f.foundation.admitPreferences(f.event);
      assert.equal(a.ok, true);
      held.push(a);
    }
    assert.equal((await f.call()).code, 'BUSY');
    held[0].release();
    held[0].release();
    assert.equal((await f.call()).ok, true);
  } finally {
    for (const a of held) a.release();
    await f.cleanup();
  }
});
test('dispose during service audit revokes reply and handler', async () => {
  const gate = deferred(),
    entered = deferred();
  const f = fixture(async () => {
    entered.resolve();
    await gate.promise;
    return 'AVAILABLE';
  });
  try {
    const pending = f.call();
    await entered.promise;
    f.bridge.dispose();
    gate.resolve();
    assert.equal((await pending).code, 'SESSION_REVOKED');
    assert.equal(f.handlers.has(FLEET_CHANNEL), false);
    assert.equal((await f.call()).code, 'SESSION_REVOKED');
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});
test('missing service reports unavailable without leaking admission occupancy', async () => {
  const f = fixture();
  try {
    f.hide();
    for (let i = 0; i < 12; i++) assert.equal((await f.call()).code, 'FLEET_UNAVAILABLE');
  } finally {
    await f.cleanup();
  }
});
