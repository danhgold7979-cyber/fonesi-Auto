import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewSession } from '../src/view-session.ts';
import {
  installInputInteractionBridge,
  INPUT_INTERACTION_CHANNEL,
} from '../src/input-interaction-bridge.ts';
const sender = {},
  caller = {
    sender,
    isMainFrame: true,
    origin: 'auto-foundation://app',
    url: 'auto-foundation://app/status.html',
  };
const wire = JSON.stringify({ version: 1, requestId: 'p1', method: 'input.get' });
function fixture(executeInput) {
  const session = new ViewSession(sender, caller.origin, caller.url);
  session.beginMainLoad(caller.url);
  assert.ok(session.finishInitial(caller));
  const handlers = new Map();
  const bridge = installInputInteractionBridge(
    { handle: (k, v) => handlers.set(k, v), removeHandler: (k) => handlers.delete(k) },
    (e) => session.admit(e),
    () => ({ executeInput }),
  );
  return { session, bridge, run: handlers.get(INPUT_INTERACTION_CHANNEL) };
}
test('input bridge refuses foreign/extra/malformed before facade and keeps bounded ordinary admission', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return 'wire';
  });
  assert.equal(JSON.parse(await f.run({ ...caller, sender: {} }, wire)).code, 'UNTRUSTED_SENDER');
  assert.equal(JSON.parse(await f.run(caller, wire, {})).code, 'INVALID_SHAPE');
  assert.equal(JSON.parse(await f.run(caller, {})).code, 'INVALID_TRANSPORT');
  assert.equal(calls, 0);
  assert.equal(await f.run(caller, wire), 'wire');
  assert.equal(calls, 1);
  assert.equal(f.session.outstanding, 0);
  f.bridge.dispose();
});
test('input pending calls consume only ordinary slots; Stop reserve and session revocation remain effective', async () => {
  const finish = [],
    witness = [];
  const f = fixture(
    (_q, current) =>
      new Promise((r) => {
        finish.push(r);
        witness.push(current);
      }),
  );
  const work = Array.from({ length: 7 }, () => f.run(caller, wire));
  assert.equal(JSON.parse(await f.run(caller, wire)).code, 'BUSY');
  const stop = f.session.admitCleanup(caller);
  assert.equal(stop.ok, true);
  stop.release();
  assert.ok(witness.every((w) => w()));
  f.session.revoke();
  assert.ok(witness.every((w) => !w()));
  finish.forEach((r) => {
    r('late');
  });
  for (const p of work) assert.equal(JSON.parse(await p).code, 'SESSION_REVOKED');
  assert.equal(f.session.outstanding, 0);
  f.bridge.dispose();
});
