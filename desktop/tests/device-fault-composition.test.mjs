import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyRegistry,
  reconcileRegistry,
  isCurrentBinding,
} from '../src/main/transport-registry.ts';
import { createDeviceActor, createDeviceQueueBudget } from '../src/main/device-actor.ts';
import { createDeviceSelection } from '../src/main/device-selection.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rows = [
  { serial: 'synthetic-a', transportId: '1', state: 'DEVICE' },
  { serial: 'synthetic-b', transportId: '2', state: 'DEVICE' },
];
const success = () => ({
  status: 'SUCCESS',
  exitCode: 0,
  retired: true,
  truncated: false,
  stdout: 'synthetic-observed',
});
function fleet() {
  let snapshot = emptyRegistry(),
    sequence = 0,
    next = 1;
  const options = {
    nextId: () => id(next++),
    budget: { maxDevices: 32, maxBindings: 64, maxEvidence: 64, maxClaims: 64 },
  };
  function step(observed, proofs = []) {
    const result = reconcileRegistry(
      snapshot,
      {
        sequence: sequence++,
        observedAtUtc: 1000 + sequence,
        source: 'SYNTHETIC_TEST',
        rows: observed,
        proofs,
      },
      options,
    );
    assert.equal(result.ok, true);
    snapshot = result.snapshot;
  }
  step(rows);
  const devices = rows.map(
    (row) => snapshot.claims.find((claim) => claim.serial === row.serial).deviceId,
  );
  const proof = (index, transportId = rows[index].transportId) => ({
    serial: rows[index].serial,
    transportId,
    deviceId: devices[index],
    evidenceId: id(1000 + next++),
  });
  step(rows, [proof(0), proof(1)]);
  const tuple = (index) => {
    const device = snapshot.devices.find((d) => d.deviceId === devices[index]);
    const binding = snapshot.bindings.find((b) => b.bindingId === device.currentBindingId);
    return {
      deviceId: device.deviceId,
      bindingId: binding.bindingId,
      generation: binding.generation,
      serial: binding.serial,
    };
  };
  return {
    step,
    proof,
    tuple,
    registry: () => snapshot,
    current: (binding) => isCurrentBinding(snapshot, binding),
  };
}
function request(binding, command, patch = {}) {
  return {
    version: 2,
    ...binding,
    commandId: id(command),
    correlationId: id(command + 10000),
    ownerId: id(900),
    deadlineUtc: 5000,
    operation: { kind: 'HOME' },
    display: null,
    ...patch,
  };
}
function actor(f, binding, budget, dispatch, observe = () => true) {
  const value = createDeviceActor({
    binding,
    budget,
    now: () => 1000,
    assertOwned: () => true,
    current: f.current,
    binaryAvailable: () => true,
    dispatch,
    observe,
  });
  return { value, cap: value.acquire(id(900)) };
}

test('synthetic two-device reconnect composition fences active input and preserves queued cancellation', async () => {
  const f = fleet(),
    budget = createDeviceQueueBudget(),
    a = f.tuple(0),
    b = f.tuple(1),
    seen = [];
  let settleA;
  const aa = actor(f, a, budget, (r) => {
    seen.push(r);
    return new Promise((resolve) => {
      settleA = resolve;
    });
  });
  const bb = actor(f, b, budget, async (r) => {
    seen.push(r);
    return success();
  });
  const pending = aa.value.execute(aa.cap, request(a, 200));
  const cancelled = aa.value.execute(aa.cap, request(a, 201));
  assert.equal(aa.value.cancel(aa.cap, id(201)), true);
  assert.equal((await cancelled).code, 'CANCELLED');
  f.step([rows[1]]);
  assert.equal((await bb.value.execute(bb.cap, request(b, 202))).outcome, 'OBSERVED');
  settleA(success());
  assert.equal((await pending).code, 'STALE_BINDING');
  assert.equal(await aa.value.shutdown(), true);
  f.step([{ ...rows[0], transportId: '3' }, rows[1]], [f.proof(0, '3')]);
  const rebound = f.tuple(0);
  assert.equal(rebound.deviceId, a.deviceId);
  assert.notEqual(rebound.bindingId, a.bindingId);
  assert.ok(rebound.generation > a.generation);
  const fresh = actor(f, rebound, budget, async (r) => {
    seen.push(r);
    return success();
  });
  assert.equal((await fresh.value.execute(fresh.cap, request(a, 203))).code, 'STALE_BINDING');
  assert.equal((await fresh.value.execute(fresh.cap, request(rebound, 204))).outcome, 'OBSERVED');
  assert.deepEqual(
    seen.map((r) => [r.serial, r.commandId]),
    [
      ['synthetic-a', id(200)],
      ['synthetic-b', id(202)],
      ['synthetic-a', id(204)],
    ],
  );
  await fresh.value.shutdown();
  await bb.value.shutdown();
  assert.equal(budget.pending(), 0);
});

test('synthetic disconnect before dispatch or during observation cannot become success; prior observed result is not replayed', async () => {
  for (const phase of ['before', 'observe', 'after']) {
    const f = fleet(),
      binding = f.tuple(0),
      seen = [];
    const a = actor(
      f,
      binding,
      createDeviceQueueBudget(),
      async (r) => {
        seen.push(r);
        return success();
      },
      () => {
        if (phase === 'observe') f.step([rows[1]]);
        return true;
      },
    );
    if (phase === 'before') f.step([rows[1]]);
    const result = await a.value.execute(a.cap, request(binding, 300));
    assert.equal(
      result.outcome,
      phase === 'after'
        ? 'OBSERVED'
        : phase === 'before'
          ? 'NOT_DISPATCHED'
          : 'DISPATCHED_UNCONFIRMED',
    );
    if (phase === 'after') f.step([rows[1]]);
    assert.equal((await a.value.execute(a.cap, request(binding, 301))).code, 'STALE_BINDING');
    assert.equal(seen.length, phase === 'before' ? 0 : 1);
    await a.value.shutdown();
  }
});

test('synthetic unretired server loss remains uncertain across fresh registry proof; no implicit actor replacement', async () => {
  const f = fleet(),
    binding = f.tuple(0),
    budget = createDeviceQueueBudget();
  let dispatches = 0;
  const a = actor(f, binding, budget, async () => {
    dispatches++;
    return { ...success(), retired: false };
  });
  assert.equal((await a.value.execute(a.cap, request(binding, 400))).outcome, 'OUTCOME_UNKNOWN');
  f.step([rows[1]]);
  f.step([{ ...rows[0], transportId: '3' }, rows[1]], [f.proof(0, '3')]);
  assert.equal((await a.value.execute(a.cap, request(f.tuple(0), 401))).code, 'OUTCOME_UNKNOWN');
  assert.equal(await a.value.shutdown(), false);
  assert.throws(() => actor(f, f.tuple(0), budget, async () => success()), /ACTOR_ALREADY_OWNED/);
  assert.equal(dispatches, 1);
});

test('selection plan gate keeps active control single-target and never substitutes a changed selection', async () => {
  const f = fleet(),
    a = f.tuple(0),
    b = f.tuple(1);
  const selection = createDeviceSelection({
    maxSelected: 8,
    maxGroups: 4,
    maxGroupMembers: 16,
    maxRegistryDevices: 32,
    maxRegistryBindings: 64,
  });
  assert.ok(selection);
  assert.equal(
    selection.replace(0, {
      selectedDeviceIds: [a.deviceId, b.deviceId],
      activeDeviceId: a.deviceId,
      groups: [],
    }).ok,
    true,
  );
  const first = selection.plan(
    { expectedRevision: 1, scope: 'ACTIVE', groupId: null },
    f.registry(),
  );
  assert.equal(first.ok, true);
  assert.deepEqual(first.plan.bindings, [a]);
  const seen = [];
  const aa = actor(f, a, createDeviceQueueBudget(), async (r) => {
    seen.push(r.serial);
    return success();
  });
  // This is an explicit synthetic integration gate, not a new production IPC/dispatcher.
  assert.equal(selection.isCurrentPlan(first.plan), true);
  assert.equal(
    (await aa.value.execute(aa.cap, request(first.plan.bindings[0], 500))).outcome,
    'OBSERVED',
  );
  assert.equal(
    selection.replace(1, {
      selectedDeviceIds: [b.deviceId],
      activeDeviceId: b.deviceId,
      groups: [],
    }).ok,
    true,
  );
  assert.equal(selection.isCurrentPlan(first.plan), false); // No enqueue of the stale plan.
  assert.deepEqual(first.plan.bindings, [a]);
  assert.deepEqual(seen, ['synthetic-a']);
  const fresh = selection.plan(
    { expectedRevision: 2, scope: 'ACTIVE', groupId: null },
    f.registry(),
  );
  assert.deepEqual(fresh.plan.bindings, [b]);
  f.step([rows[0]]); // Current selection alone is not current-device evidence.
  assert.equal(
    selection.plan({ expectedRevision: 2, scope: 'ACTIVE', groupId: null }, f.registry()).code,
    'MEMBER_UNAVAILABLE',
  );
  await aa.value.shutdown();
});
