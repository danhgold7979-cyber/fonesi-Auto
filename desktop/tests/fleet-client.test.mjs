import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleetClient } from '../src/fleet-client.ts';
import { createSettingsClient, createSettingsReadiness } from '../src/settings-client.ts';
import { createDiagnosticClient } from '../src/preload-client.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
import { fleetSuccess } from '../src/fleet-contract.ts';
const selection = { selectedDeviceIds: [], activeDeviceId: null, groups: [] };
const fleet = {
  registryRevision: 0,
  availability: 'UNAVAILABLE',
  reason: 'LIVE_DISCOVERY_UNAVAILABLE',
  devices: [],
  selection: { revision: 0, ...selection },
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
function timer() {
  const callbacks = new Set();
  return {
    set(fn, ms) {
      assert.equal(ms, 2000);
      callbacks.add(fn);
      return fn;
    },
    clear(fn) {
      callbacks.delete(fn);
    },
    expire() {
      for (const fn of [...callbacks]) fn();
    },
  };
}
const code = (raw) => JSON.parse(raw).code;
test('exact two wrappers snapshot selection, bind private request and permitted method outcome', async () => {
  const wires = [];
  const client = createFleetClient(async (raw) => {
    const req = JSON.parse(raw);
    wires.push(req);
    return fleetSuccess(
      req.requestId,
      req.method === 'fleet.get' ? 'OBSERVED' : 'APPLIED',
      fleet,
      'AVAILABLE',
    );
  });
  assert.equal(JSON.parse(await client.read()).ok, true);
  assert.equal(JSON.parse(await client.replaceSelection(0, selection)).outcome, 'APPLIED');
  assert.deepEqual(wires, [
    { version: 1, requestId: 'f1', method: 'fleet.get' },
    {
      version: 1,
      requestId: 'f2',
      method: 'fleet.selection.replace',
      expectedRevision: 0,
      selection,
    },
  ]);
  for (const [requestId, outcome] of [
    ['f99', 'OBSERVED'],
    ['f1', 'APPLIED'],
  ]) {
    const bad = createFleetClient(async () => fleetSuccess(requestId, outcome, fleet, 'AVAILABLE'));
    assert.equal(code(await bad.read()), 'INTERNAL_FAILURE');
  }
  const bad = createFleetClient(async () => fleetSuccess('f1', 'OBSERVED', fleet, 'AVAILABLE'));
  assert.equal(code(await bad.replaceSelection(0, selection)), 'INTERNAL_FAILURE');
});
test('invalid selection never invokes and asynchronous caller mutation cannot change captured wire', async () => {
  let calls = 0,
    held;
  const client = createFleetClient((raw) => {
    calls++;
    held = raw;
    return Promise.resolve(fleetSuccess('f1', 'APPLIED', fleet, 'AVAILABLE'));
  });
  assert.equal(code(await client.replaceSelection(-1, selection)), 'INVALID_SHAPE');
  assert.equal(calls, 0);
  const copy = { ...selection, groups: [] };
  const result = client.replaceSelection(0, copy);
  copy.groups.push({ groupId: 'bad', deviceIds: [] });
  assert.deepEqual(JSON.parse(held).selection, selection);
  await result;
});
test('ordinary budget remains seven across diagnostic preferences and fleet, timeout retains native occupancy', async () => {
  const budget = createInvocationBudget(),
    t = timer(),
    settlers = [];
  const invoke = () => new Promise((resolve) => settlers.push(resolve));
  const d = createDiagnosticClient(invoke, t, budget),
    p = createSettingsClient(invoke, budget, t),
    f = createFleetClient(invoke, budget, t);
  const pending = [d.health(), d.settings(), p.read(), p.read(), f.read(), f.read(), f.read()];
  assert.equal(budget.outstanding(), 7);
  assert.equal(code(await f.read()), 'BUSY');
  t.expire();
  await Promise.all(pending);
  assert.equal(budget.outstanding(), 7);
  for (const resolve of settlers) resolve('bad');
  await flush();
  assert.equal(budget.outstanding(), 0);
});
test('one readiness gate allows already-signalled and late reads, never retries or replays', async () => {
  const gate = createSettingsReadiness(),
    t = timer();
  let calls = 0;
  const f = createFleetClient(
    async () => {
      calls++;
      return fleetSuccess(`f${calls}`, 'OBSERVED', fleet, 'AVAILABLE');
    },
    createInvocationBudget(),
    t,
    gate,
  );
  const waiting = f.read();
  assert.equal(calls, 0);
  gate.signal();
  assert.equal(JSON.parse(await waiting).ok, true);
  gate.signal();
  await flush();
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await f.read()).ok, true);
  assert.equal(calls, 2);
});
test('timeout or disposal before readiness prevents late invocation; mutation does not wait', async () => {
  for (const dispose of [false, true]) {
    const gate = createSettingsReadiness(),
      t = timer(),
      budget = createInvocationBudget();
    let calls = 0;
    const f = createFleetClient(
      async () => {
        calls++;
        return 'bad';
      },
      budget,
      t,
      gate,
    );
    const result = f.read();
    if (dispose) f.dispose();
    else t.expire();
    assert.equal(code(await result), dispose ? 'SESSION_UNAVAILABLE' : 'TIMEOUT');
    gate.signal();
    await flush();
    assert.equal(calls, 0);
    assert.equal(budget.outstanding(), 0);
  }
  const gate = createSettingsReadiness();
  let calls = 0;
  const f = createFleetClient(
    async () => {
      calls++;
      return fleetSuccess('f1', 'UNCHANGED', fleet, 'AVAILABLE');
    },
    createInvocationBudget(),
    timer(),
    gate,
  );
  assert.equal(JSON.parse(await f.replaceSelection(0, selection)).outcome, 'UNCHANGED');
  assert.equal(calls, 1);
});
test('late mutation result cannot turn timeout into success and disposed client stays closed', async () => {
  const t = timer();
  let resolve,
    calls = 0;
  const f = createFleetClient(
    () => {
      calls++;
      return new Promise((r) => (resolve = r));
    },
    createInvocationBudget(),
    t,
  );
  const pending = f.replaceSelection(0, selection);
  t.expire();
  const initial = await pending;
  assert.equal(code(initial), 'TIMEOUT');
  resolve(fleetSuccess('f1', 'APPLIED', fleet, 'AVAILABLE'));
  await flush();
  assert.equal(await pending, initial);
  assert.equal(calls, 1);
  f.dispose();
  assert.equal(code(await f.read()), 'SESSION_UNAVAILABLE');
  assert.equal(calls, 1);
});
