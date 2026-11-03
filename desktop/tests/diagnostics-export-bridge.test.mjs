import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewSession } from '../src/view-session.ts';
import { installDiagnosticsExportBridge } from '../src/diagnostics-export-bridge.ts';
import {
  DIAGNOSTICS_EXPORT_CHANNEL,
  diagnosticsExportSuccess,
} from '../src/diagnostics-report-contract.ts';
const caller = {
  sender: {},
  isMainFrame: true,
  origin: 'auto-foundation://app',
  url: 'auto-foundation://app/status.html',
};
const raw = JSON.stringify({ version: 1, requestId: 'p1', method: 'diagnostics.get' });
function fixture(execute) {
  const view = new ViewSession(caller.sender, caller.origin, caller.url);
  view.beginMainLoad(caller.url);
  assert.ok(view.finishInitial(caller));
  const handlers = new Map();
  const bridge = installDiagnosticsExportBridge(
    { handle: (k, v) => handlers.set(k, v), removeHandler: (k) => handlers.delete(k) },
    (e) => view.admit(e),
    (e) => view.admitCleanup(e),
    () => ({ execute }),
  );
  return { view, bridge, run: handlers.get(DIAGNOSTICS_EXPORT_CHANNEL) };
}
test('bridge rejects foreign sender, extra payload and malformed request before service', async () => {
  let calls = 0;
  const f = fixture(() => {
    calls++;
    return 'wire';
  });
  assert.equal(JSON.parse(await f.run({ ...caller, sender: {} }, raw)).code, 'UNTRUSTED_SENDER');
  assert.equal(JSON.parse(await f.run(caller, raw, {})).code, 'INVALID_REQUEST');
  assert.equal(JSON.parse(await f.run(caller, {})).code, 'INVALID_REQUEST');
  assert.equal(calls, 0);
  assert.equal(f.view.outstanding, 0);
});
test('bridge operation witness outlives request release but not view revocation', async () => {
  let current;
  const f = fixture((_raw, w) => {
    current = w;
    return diagnosticsExportSuccess('p1', {
      revision: 0,
      state: 'IDLE',
      operationId: null,
      records: 0,
      dropped: 0,
      bytes: 0,
      sha256: null,
      code: null,
    });
  });
  assert.equal(JSON.parse(await f.run(caller, raw)).ok, true);
  assert.equal(f.view.outstanding, 0);
  assert.equal(current(), true);
  f.view.revoke();
  assert.equal(current(), false);
  f.bridge.dispose();
});
test('cancel can use cleanup slot while ordinary admission is full', async () => {
  const f = fixture(() => 'wire'),
    held = Array.from({ length: 7 }, () => f.view.admit(caller));
  assert.equal(JSON.parse(await f.run(caller, raw)).code, 'BUSY');
  assert.equal(
    await f.run(
      caller,
      JSON.stringify({
        version: 1,
        requestId: 'p2',
        method: 'diagnostics.cancel',
        operationId: '00000000-0000-4000-8000-000000000001',
      }),
    ),
    'wire',
  );
  held.forEach((x) => {
    x.release();
  });
  assert.equal(f.view.outstanding, 0);
});
