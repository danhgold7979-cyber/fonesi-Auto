import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdbDiscovery } from '../src/main/adb-discovery.ts';
import { parseAdbMetadata } from '../src/main/adb-metadata.ts';
import {
  emptyRegistry,
  reconcileRegistry,
  isCurrentBinding,
} from '../src/main/transport-registry.ts';
import { productionPlatformToolsStatus } from '../src/main/platform-tools-contract.ts';
import { createDeviceActor, createDeviceQueueBudget } from '../src/main/device-actor.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function composed() {
  let n = 1;
  let seq = 0;
  let snapshot = emptyRegistry();
  const options = {
    nextId: () => id(n++),
    budget: { maxDevices: 100, maxBindings: 100, maxEvidence: 100, maxClaims: 100 },
  };
  const step = (rows, proofs = []) => {
    const r = reconcileRegistry(
      snapshot,
      { sequence: seq++, observedAtUtc: 1000 + seq, source: 'SYNTHETIC_TEST', rows, proofs },
      options,
    );
    assert.equal(r.ok, true);
    snapshot = r.snapshot;
  };
  const discovery = parseAdbDiscovery(
    'List of devices attached\nsynthetic-a device transport_id:1\n',
  );
  assert.equal(discovery.ok, true);
  step(discovery.rows);
  const tuple = () => {
    const d = snapshot.devices[0];
    const b = snapshot.bindings.find((b) => b.bindingId === d.currentBindingId);
    return {
      deviceId: b.deviceId,
      bindingId: b.bindingId,
      generation: b.generation,
      serial: b.serial,
    };
  };
  return {
    step,
    rows: discovery.rows,
    tuple,
    current: (b) => isCurrentBinding(snapshot, b),
    verify: () =>
      step(discovery.rows, [
        {
          serial: 'synthetic-a',
          transportId: '1',
          deviceId: snapshot.devices[0].deviceId,
          evidenceId: id(999),
        },
      ]),
  };
}
const req = (b) => ({
  version: 1,
  ...b,
  commandId: id(100),
  correlationId: id(101),
  ownerId: id(102),
  operation: 'SDK',
  deadlineUtc: Date.now() + 1000,
});
const facts = (stdout) => ({
  status: 'SUCCESS',
  exitCode: 0,
  retired: true,
  truncated: false,
  stdout,
});
test('real pure discovery→registry→actor rejects provisional binding and actual unavailable production admission', async () => {
  const f = composed();
  let calls = 0;
  const provisional = createDeviceActor({
    binding: f.tuple(),
    budget: createDeviceQueueBudget(),
    now: Date.now,
    assertOwned: () => true,
    current: f.current,
    binaryAvailable: () => true,
    dispatch: async () => {
      calls++;
      return facts('35\n');
    },
    observe: () => true,
  });
  const cap = provisional.acquire(id(102));
  assert.equal((await provisional.execute(cap, req(f.tuple()))).code, 'STALE_BINDING');
  assert.equal(calls, 0);
  await provisional.shutdown();
  f.verify();
  const actor = createDeviceActor({
    binding: f.tuple(),
    budget: createDeviceQueueBudget(),
    now: Date.now,
    assertOwned: () => true,
    current: f.current,
    binaryAvailable: () => productionPlatformToolsStatus() !== 'BINARY_UNAVAILABLE',
    dispatch: async () => {
      calls++;
      return facts('35\n');
    },
    observe: () => true,
  });
  assert.equal(
    (await actor.execute(actor.acquire(id(102)), req(f.tuple()))).code,
    'BINARY_UNAVAILABLE',
  );
  assert.equal(calls, 0);
});
test('synthetic transport with actual metadata parser observes validated SDK but disconnect fences pending result', async () => {
  const f = composed();
  f.verify();
  const b = f.tuple();
  let finish;
  const actor = createDeviceActor({
    binding: b,
    budget: createDeviceQueueBudget(),
    now: Date.now,
    assertOwned: () => true,
    current: f.current,
    binaryAvailable: () => true,
    dispatch: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    observe: (r, stdout) => parseAdbMetadata(r.operation, stdout, 1000)?.available === true,
  });
  const cap = actor.acquire(id(102));
  const first = actor.execute(cap, req(b));
  finish(facts('35\n'));
  assert.equal((await first).outcome, 'OBSERVED');
  const second = actor.execute(cap, { ...req(b), commandId: id(103) });
  f.step([]);
  finish(facts('35\n'));
  assert.equal((await second).code, 'STALE_BINDING');
  assert.equal(f.current(b), false);
});
