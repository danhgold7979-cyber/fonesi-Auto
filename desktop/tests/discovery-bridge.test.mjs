import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewSession } from '../src/view-session.ts';
import { installDiscoveryBridge, DISCOVERY_CHANNEL } from '../src/discovery-bridge.ts';
import { discoverySuccess } from '../src/discovery-contract.ts';
const sender = {},
  caller = {
    sender,
    isMainFrame: true,
    origin: 'auto-foundation://app',
    url: 'auto-foundation://app/status.html',
  },
  id = '00000000-0000-4000-8000-000000000001';
const pending = {
  revision: 1,
  installationRevision: 1,
  state: 'STARTING',
  operation: 'START',
  lastOutcome: 'PENDING',
  registryRevision: 2,
  observedAtUtc: null,
  restartRequired: false,
  operationId: id,
  code: null,
};
const wire = (request = false) =>
  JSON.stringify({
    version: 1,
    requestId: 'p1',
    method: request ? 'discovery.start' : 'discovery.get',
    ...(request ? { expectedRevision: 0, expectedInstallationRevision: 1 } : {}),
  });
function fixture(execute) {
  const v = new ViewSession(sender, caller.origin, caller.url);
  v.beginMainLoad(caller.url);
  assert.equal(v.finishInitial(caller), true);
  const handlers = new Map();
  const bridge = installDiscoveryBridge(
    { handle: (k, f) => handlers.set(k, f), removeHandler: (k) => handlers.delete(k) },
    (e) => v.admit(e),
    (e) => v.admitCleanup(e),
    () => ({ execute }),
  );
  return { v, bridge, run: handlers.get(DISCOVERY_CHANNEL), handlers };
}
test('real ViewSession rejects foreign/subframe/extra/no arguments before service and releases slots', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return '';
  });
  for (const e of [
    { ...caller, sender: {} },
    { ...caller, isMainFrame: false },
  ])
    assert.equal(JSON.parse(await f.run(e, wire())).code, 'UNTRUSTED_SENDER');
  assert.equal(JSON.parse(await f.run(caller)).code, 'INVALID_TRANSPORT');
  assert.equal(JSON.parse(await f.run(caller, wire(), null)).code, 'INVALID_SHAPE');
  assert.equal(calls, 0);
  assert.equal(f.v.outstanding, 0);
  f.bridge.dispose();
  assert.equal(f.handlers.size, 0);
});
test('PENDING releases RPC slot without releasing session operation authority; revocation/disposal fences it', async () => {
  let current;
  const f = fixture(async (q, c) => {
    current = c;
    return discoverySuccess(q.requestId, 'PENDING', pending, id, 'AVAILABLE');
  });
  assert.equal(JSON.parse(await f.run(caller, wire(true))).outcome, 'PENDING');
  assert.equal(f.v.outstanding, 0);
  assert.equal(current(), true);
  f.bridge.dispose();
  assert.equal(current(), false);
  assert.equal(JSON.parse(await f.run(caller, wire())).code, 'SESSION_REVOKED');
});
test('final reply revocation after service entry remains conservative unknown even for known no-effect result', async () => {
  const f = fixture(async () => {
    f.v.revoke();
    return 'known-not-started';
  });
  const r = JSON.parse(await f.run(caller, wire(true)));
  assert.equal(r.code, 'SESSION_REVOKED');
  assert.equal(r.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(f.v.outstanding, 0);
});
test('shared ViewSession seven ordinary slots and dispose while awaiting do not leak raw exceptions', async () => {
  const pending = [];
  const f = fixture(() => new Promise((r) => pending.push(r)));
  const calls = Array.from({ length: 7 }, () => f.run(caller, wire()));
  assert.equal(JSON.parse(await f.run(caller, wire())).code, 'BUSY');
  f.bridge.dispose();
  for (const r of pending) r('');
  for (const raw of await Promise.all(calls))
    assert.equal(JSON.parse(raw).outcome, 'OUTCOME_UNKNOWN');
  assert.equal(f.v.outstanding, 0);
  const g = fixture(async () => {
    throw Error('private-canary');
  });
  const raw = await g.run(caller, wire(true));
  assert.equal(JSON.parse(raw).code, 'INTERNAL_FAILURE');
  assert.equal(raw.includes('canary'), false);
});

test('exact Stop reaches reserved slot while seven ordinary channels pending; malformed stop cannot', async () => {
  let resolve;
  const gate = new Promise((r) => {
    resolve = r;
  });
  let stops = 0;
  const f = fixture(async (q) => {
    if (q.method === 'discovery.stop') {
      stops++;
      return 'cleanup';
    }
    await gate;
    return '';
  });
  const pending = Array.from({ length: 7 }, () => f.run(caller, wire()));
  assert.equal(f.v.outstanding, 7);
  const stop = JSON.stringify({ version: 1, requestId: 'p2', method: 'discovery.stop' });
  assert.equal(JSON.parse(await f.run(caller, stop, null)).code, 'BUSY');
  assert.equal(await f.run(caller, stop), 'cleanup');
  assert.equal(stops, 1);
  resolve();
  await Promise.all(pending);
  assert.equal(f.v.outstanding, 0);
  f.bridge.dispose();
});
