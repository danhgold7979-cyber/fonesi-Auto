// Actual source bridge/session admission with synthetic IPC/window objects; no native UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installFoundationBridge, inspectAssociationAdmission } from '../src/foundation-bridge.ts';
import { installAssociationBridge, ASSOCIATION_CHANNEL } from '../src/association-bridge.ts';
import { installDiscoveryBridge, DISCOVERY_CHANNEL } from '../src/discovery-bridge.ts';
import { associationSuccess } from '../src/association-contract.ts';
import { ENTRY_URL } from '../src/main/asset-policy.ts';
const id = '11111111-1111-4111-8111-111111111111';
const idle = {
  revision: 0,
  state: 'IDLE',
  operationId: null,
  code: 'OK',
  ceremonyId: null,
  mode: null,
  deviceId: null,
  stage: null,
  deadlineUtc: null,
  receipt: null,
  projectionCurrent: false,
  candidates: [],
  historical: [],
};
const wire = (method = 'association.get', extra = {}) =>
  JSON.stringify({ version: 1, requestId: 'p1', method, ...extra });
function fixture(execute) {
  const handlers = new Map(),
    ipc = {
      handle: (name, fn) => handlers.set(name, fn),
      removeHandler: (name) => handlers.delete(name),
    };
  const contents = new EventEmitter();
  contents.mainFrame = { origin: 'auto-foundation://app', url: ENTRY_URL };
  contents.isDestroyed = () => false;
  const window = new EventEmitter();
  window.webContents = contents;
  const foundation = installFoundationBridge(ipc);
  const view = foundation.attach(window);
  contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY_URL });
  assert.equal(view.arm(), true);
  const event = { sender: contents, senderFrame: contents.mainFrame };
  const bridge = installAssociationBridge(ipc, foundation.admitAssociation, () => ({
    executeAssociation: execute,
  }));
  return {
    handlers,
    ipc,
    contents,
    window,
    foundation,
    bridge,
    event,
    run: handlers.get(ASSOCIATION_CHANNEL),
    close() {
      bridge.dispose();
      foundation.dispose();
    },
  };
}
test('association bridge admits only branded attached main-frame calls and bounded exact wire', async () => {
  let calls = 0;
  const f = fixture(async (q, current, token) => {
    calls++;
    assert.equal(current(), true);
    assert.ok(inspectAssociationAdmission(token));
    return associationSuccess(q.requestId, 'OBSERVED', idle, id, 'AVAILABLE');
  });
  try {
    assert.equal(
      JSON.parse(await f.run({ ...f.event, sender: {} }, wire())).code,
      'UNTRUSTED_SENDER',
    );
    assert.equal(
      JSON.parse(await f.run({ ...f.event, senderFrame: { ...f.contents.mainFrame } }, wire()))
        .code,
      'UNTRUSTED_SENDER',
    );
    assert.equal(JSON.parse(await f.run(f.event, wire(), true)).code, 'INVALID_SHAPE');
    assert.equal(JSON.parse(await f.run(f.event)).code, 'INVALID_TRANSPORT');
    assert.equal(calls, 0);
    assert.equal(JSON.parse(await f.run(f.event, wire())).outcome, 'OBSERVED');
    assert.equal(calls, 1);
    let released = 0;
    const fakeHandlers = new Map();
    const fake = installAssociationBridge(
      { handle: (k, v) => fakeHandlers.set(k, v), removeHandler: (k) => fakeHandlers.delete(k) },
      () => ({
        ok: true,
        associationAdmission: {},
        current: () => true,
        operationCurrent: () => true,
        release: () => released++,
      }),
      () => ({
        executeAssociation: async () => {
          throw Error('must not dispatch');
        },
      }),
    );
    assert.equal(
      JSON.parse(await fakeHandlers.get(ASSOCIATION_CHANNEL)(f.event, wire())).code,
      'UNTRUSTED_SENDER',
    );
    assert.equal(released, 1);
    fake.dispose();
  } finally {
    f.close();
  }
});
test('released association RPC keeps only session operation witness; late revocation blocks delivery', async () => {
  let captured, resolve;
  const f = fixture(async (q, current, token) => {
    captured = { current, token };
    return associationSuccess(q.requestId, 'OBSERVED', idle, id, 'AVAILABLE');
  });
  try {
    await f.run(f.event, wire());
    assert.equal(captured.current(), true);
    assert.equal(inspectAssociationAdmission(captured.token).finalCurrent(), true);
    f.contents.emit('will-navigate');
    assert.equal(captured.current(), false);
    assert.equal(inspectAssociationAdmission(captured.token).finalCurrent(), false);
  } finally {
    f.close();
  }
  const g = fixture(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = g.run(g.event, wire());
  g.bridge.dispose();
  resolve('private-result');
  assert.equal(JSON.parse(await pending).code, 'SESSION_REVOKED');
  g.close();
});
test('association including Cancel uses seven ordinary slots without starving the existing Stop slot', async () => {
  const held = [];
  let stops = 0;
  const f = fixture(() => new Promise((r) => held.push(r)));
  const discovery = installDiscoveryBridge(
    f.ipc,
    f.foundation.admitPreferences,
    f.foundation.admitCleanup,
    () => ({
      execute: async () => {
        stops++;
        return 'cleanup-observed';
      },
    }),
  );
  try {
    const pending = Array.from({ length: 7 }, () => f.run(f.event, wire()));
    assert.equal(
      JSON.parse(
        await f.run(f.event, wire('association.cancel', { expectedRevision: 1, operationId: id })),
      ).code,
      'BUSY',
    );
    assert.equal(
      await f.handlers.get(DISCOVERY_CHANNEL)(
        f.event,
        JSON.stringify({ version: 1, requestId: 'p2', method: 'discovery.stop' }),
      ),
      'cleanup-observed',
    );
    assert.equal(stops, 1);
    held.forEach((r) => {
      r(associationSuccess('p1', 'OBSERVED', idle, id, 'AVAILABLE'));
    });
    await Promise.all(pending);
    assert.equal(
      JSON.parse(await f.run({ ...f.event, senderFrame: null }, wire())).code,
      'UNTRUSTED_SENDER',
    );
  } finally {
    discovery.dispose();
    f.close();
  }
});
