import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceSelection, isDeviceActionPlan } from '../src/main/device-selection.ts';
import {
  emptyRegistry,
  reconcileRegistry,
  isCurrentBinding,
} from '../src/main/transport-registry.ts';
const uuid = (n) => `${n.toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`;
const budget = {
  maxSelected: 10,
  maxGroups: 10,
  maxGroupMembers: 20,
  maxRegistryDevices: 20,
  maxRegistryBindings: 40,
};
function fixture() {
  let id = 1,
    sequence = 0,
    registry = emptyRegistry();
  const step = (rows, proofs = []) => {
    const result = reconcileRegistry(
      registry,
      {
        sequence: sequence++,
        observedAtUtc: 1000 + sequence,
        source: 'SYNTHETIC_TEST',
        rows,
        proofs,
      },
      {
        budget: { maxDevices: 20, maxBindings: 40, maxEvidence: 40, maxClaims: 20 },
        nextId: () => uuid(id++),
      },
    );
    assert.equal(result.ok, true);
    registry = result.snapshot;
    return registry;
  };
  const rows = [
    { serial: 'phone-a', transportId: '1', state: 'DEVICE' },
    { serial: 'phone-b', transportId: '2', state: 'DEVICE' },
  ];
  step(rows);
  const devices = registry.devices.map((d) => d.deviceId);
  step(
    rows,
    rows
      .map((row, i) => ({ ...row, deviceId: devices[i], evidenceId: uuid(100 + i) }))
      .map(({ state, ...proof }) => proof),
  );
  return {
    get registry() {
      return registry;
    },
    step,
    rows,
    devices,
  };
}
const replace = (c, ids, active = null, groups = []) =>
  c.replace(c.snapshot().revision, { selectedDeviceIds: ids, activeDeviceId: active, groups });
const request = (c, scope = 'SELECTED', groupId = null) => ({
  expectedRevision: c.snapshot().revision,
  scope,
  groupId,
});
test('active device and selected set remain independent; single action never broadcasts', () => {
  const f = fixture(),
    c = createDeviceSelection(budget);
  assert.ok(c);
  assert.equal(replace(c, [f.devices[0]], f.devices[1]).ok, true);
  const single = c.plan(request(c, 'ACTIVE'), f.registry),
    multi = c.plan(request(c), f.registry);
  assert.equal(single.ok, true);
  assert.equal(multi.ok, true);
  assert.deepEqual(
    single.plan.bindings.map((b) => b.deviceId),
    [f.devices[1]],
  );
  assert.deepEqual(
    multi.plan.bindings.map((b) => b.deviceId),
    [f.devices[0]],
  );
  assert.ok(isDeviceActionPlan(single.plan));
  assert.ok(!isDeviceActionPlan({ ...single.plan }));
});
test('selection CAS and immutable plans never retarget after selection or group changes', () => {
  const f = fixture(),
    c = createDeviceSelection(budget),
    groupId = uuid(500);
  const input = {
    selectedDeviceIds: [...f.devices],
    activeDeviceId: f.devices[0],
    groups: [{ groupId, deviceIds: [f.devices[0]] }],
  };
  assert.equal(c.replace(0, input).ok, true);
  input.groups[0].deviceIds[0] = f.devices[1];
  input.selectedDeviceIds.length = 0;
  const captured = c.plan(request(c, 'GROUP', groupId), f.registry);
  assert.equal(captured.ok, true);
  const old = c.snapshot();
  assert.equal(
    c.replace(0, { selectedDeviceIds: [], activeDeviceId: null, groups: [] }).code,
    'STALE_SELECTION',
  );
  assert.equal(c.snapshot(), old);
  replace(c, [f.devices[1]], f.devices[1], [{ groupId, deviceIds: [f.devices[1]] }]);
  assert.deepEqual(
    captured.plan.bindings.map((b) => b.deviceId),
    [f.devices[0]],
  );
  assert.ok(
    Object.isFrozen(captured.plan) &&
      Object.isFrozen(captured.plan.bindings) &&
      Object.isFrozen(captured.plan.bindings[0]),
  );
  assert.equal(
    c.plan({ ...request(c), expectedRevision: old.revision }, f.registry).code,
    'STALE_SELECTION',
  );
});
test('forged verified registry and structural plan imports cannot confer authority', () => {
  const f = fixture(),
    c = createDeviceSelection(budget);
  replace(c, f.devices);
  assert.equal(c.plan(request(c), JSON.parse(JSON.stringify(f.registry))).code, 'INVALID_REGISTRY');
  assert.equal(isDeviceActionPlan({ version: 1, bindings: [] }), false);
  let invoked = 0;
  const bad = Object.defineProperty({}, 'devices', {
    get() {
      invoked++;
      return f.registry.devices;
    },
  });
  assert.equal(c.plan(request(c), bad).code, 'INVALID_REGISTRY');
  assert.equal(invoked, 0);
});
test('offline, provisional, unknown and empty members fail atomically without partial plans', () => {
  const f = fixture(),
    c = createDeviceSelection(budget);
  assert.equal(c.plan(request(c), f.registry).code, 'EMPTY_SELECTION');
  replace(c, [uuid(999)]);
  assert.equal(c.plan(request(c), f.registry).code, 'MEMBER_UNAVAILABLE');
  replace(c, f.devices);
  f.step([f.rows[0], { ...f.rows[1], state: 'OFFLINE' }]);
  assert.deepEqual(c.plan(request(c), f.registry), { ok: false, code: 'MEMBER_UNAVAILABLE' });
  const p = reconcileRegistry(
    emptyRegistry(),
    { sequence: 0, observedAtUtc: 0, source: 'SYNTHETIC_TEST', rows: [f.rows[0]], proofs: [] },
    {
      budget: { maxDevices: 5, maxBindings: 5, maxEvidence: 5, maxClaims: 5 },
      nextId: (() => {
        let i = 600;
        return () => uuid(i++);
      })(),
    },
  );
  replace(c, [p.snapshot.devices[0].deviceId]);
  assert.equal(c.plan(request(c), p.snapshot).code, 'MEMBER_UNAVAILABLE');
});
test('disconnect invalidates captured binding but never substitutes another current generation', () => {
  const f = fixture(),
    c = createDeviceSelection(budget);
  replace(c, [f.devices[0]]);
  const result = c.plan(request(c), f.registry);
  assert.equal(result.ok, true);
  const old = result.plan.bindings[0];
  f.step([f.rows[1]]);
  assert.equal(isCurrentBinding(f.registry, old), false);
  f.step(f.rows, [
    { serial: 'phone-a', transportId: '1', deviceId: f.devices[0], evidenceId: uuid(800) },
  ]);
  assert.equal(isCurrentBinding(f.registry, old), false);
  const next = c.plan(request(c), f.registry);
  assert.equal(next.ok, true);
  assert.notEqual(next.plan.bindings[0].bindingId, old.bindingId);
  assert.equal(result.plan.bindings[0], old);
});
test('caller inspection budgets fail atomically without pruning selection or groups', () => {
  const f = fixture(),
    c = createDeviceSelection({
      ...budget,
      maxSelected: 1,
      maxGroupMembers: 1,
      maxRegistryDevices: 1,
    });
  assert.equal(replace(c, [f.devices[0]]).ok, true);
  const old = c.snapshot();
  assert.equal(replace(c, f.devices).code, 'LIMIT_EXCEEDED');
  assert.equal(c.snapshot(), old);
  assert.equal(
    replace(c, [], null, [
      { groupId: uuid(300), deviceIds: [f.devices[0]] },
      { groupId: uuid(301), deviceIds: [f.devices[1]] },
    ]).code,
    'LIMIT_EXCEEDED',
  );
  assert.equal(c.snapshot(), old);
  assert.equal(c.plan(request(c), f.registry).code, 'LIMIT_EXCEEDED');
  for (const value of [0, -1, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(createDeviceSelection({ ...budget, maxGroups: value }), null);
});
test('exact shape validation rejects duplicates, getters, sparse arrays and invalid scope', () => {
  const f = fixture(),
    c = createDeviceSelection(budget);
  const old = c.snapshot();
  for (const value of [
    { selectedDeviceIds: [f.devices[0], f.devices[0]], activeDeviceId: null, groups: [] },
    { selectedDeviceIds: new Array(1), activeDeviceId: null, groups: [] },
    { selectedDeviceIds: [], activeDeviceId: 'phone-a', groups: [] },
    {
      selectedDeviceIds: [],
      activeDeviceId: null,
      groups: [
        { groupId: uuid(1), deviceIds: [] },
        { groupId: uuid(1), deviceIds: [] },
      ],
    },
  ]) {
    assert.equal(c.replace(0, value).code, 'INVALID_INPUT');
    assert.equal(c.snapshot(), old);
  }
  let calls = 0;
  const bad = {
    selectedDeviceIds: [],
    activeDeviceId: null,
    get groups() {
      calls++;
      return [];
    },
  };
  assert.equal(c.replace(0, bad).code, 'INVALID_INPUT');
  assert.equal(calls, 0);
  assert.equal(c.plan({ ...request(c), scope: 'ALL' }, f.registry).code, 'INVALID_INPUT');
  assert.equal(c.plan(request(c, 'ACTIVE', uuid(1)), f.registry).code, 'INVALID_INPUT');
  assert.equal(c.plan(request(c, 'GROUP', uuid(1)), f.registry).code, 'GROUP_UNAVAILABLE');
});
test('reentrant descriptor inspection cannot overwrite a newer selection revision', () => {
  const f = fixture(),
    c = createDeviceSelection(budget);
  let once = false;
  const candidate = new Proxy(
    { selectedDeviceIds: [f.devices[0]], activeDeviceId: null, groups: [] },
    {
      ownKeys(target) {
        if (!once) {
          once = true;
          assert.equal(replace(c, [f.devices[1]], f.devices[1]).ok, true);
        }
        return Reflect.ownKeys(target);
      },
    },
  );
  assert.equal(c.replace(0, candidate).code, 'STALE_SELECTION');
  assert.equal(c.snapshot().revision, 1);
  assert.deepEqual(c.snapshot().selectedDeviceIds, [f.devices[1]]);
});
test('plan dispatch admission is bound to the same controller and unchanged selection revision', () => {
  const f = fixture(),
    first = createDeviceSelection(budget),
    second = createDeviceSelection(budget);
  replace(first, [f.devices[0]]);
  replace(second, [f.devices[0]]);
  const captured = first.plan(request(first), f.registry).plan;
  assert.equal(first.isCurrentPlan(captured), true);
  assert.equal(second.isCurrentPlan(captured), false);
  assert.equal(first.isCurrentPlan({ ...captured }), false);
  replace(first, [f.devices[1]]);
  assert.equal(first.isCurrentPlan(captured), false);
  assert.equal(isDeviceActionPlan(captured), true);
  assert.deepEqual(
    captured.bindings.map((binding) => binding.deviceId),
    [f.devices[0]],
  );
});
