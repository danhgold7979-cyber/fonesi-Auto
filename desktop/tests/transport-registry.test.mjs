import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyRegistry,
  reconcileRegistry,
  isCurrentBinding,
} from '../src/main/transport-registry.ts';
const uuid = (n) => `${n.toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`;
const row = (serial = 'phone-a', transportId = '1', state = 'DEVICE') => ({
  serial,
  transportId,
  state,
});
const budget = { maxDevices: 100, maxBindings: 100, maxEvidence: 100, maxClaims: 100 };
function fixture() {
  let id = 1,
    sequence = 0,
    calls = 0;
  let snapshot = emptyRegistry();
  const options = {
    budget,
    nextId: () => {
      calls++;
      return uuid(id++);
    },
  };
  return {
    get snapshot() {
      return snapshot;
    },
    get calls() {
      return calls;
    },
    options,
    step(rows, proofs = [], patch = {}) {
      const observation = {
        sequence: sequence++,
        observedAtUtc: 1000 + sequence,
        source: 'SYNTHETIC_TEST',
        rows,
        proofs,
        ...patch,
      };
      const result = reconcileRegistry(snapshot, observation, options);
      if (result.ok) snapshot = result.snapshot;
      return result;
    },
  };
}
const binding = (s) => {
  const device = s.devices.find((d) => d.currentBindingId !== null);
  const b = s.bindings.find((b) => b.bindingId === device.currentBindingId);
  return {
    deviceId: b.deviceId,
    bindingId: b.bindingId,
    generation: b.generation,
    serial: b.serial,
  };
};
function verify(f, serial = 'phone-a', transportId = '1', evidenceId = uuid(1000)) {
  const device = f.snapshot.devices.find((d) =>
    f.snapshot.bindings.some((b) => b.deviceId === d.deviceId && b.serial === serial),
  );
  return f.step(
    [row(serial, transportId)],
    [{ serial, transportId, deviceId: device.deviceId, evidenceId }],
  );
}
test('first observation is provisional and cannot dispatch until supplied identity proof verifies stable device', () => {
  const f = fixture();
  assert.equal(f.step([row()]).ok, true);
  const provisional = binding(f.snapshot),
    deviceId = provisional.deviceId;
  assert.equal(isCurrentBinding(f.snapshot, provisional), false);
  const result = verify(f);
  assert.equal(result.ok, true);
  assert.equal(f.snapshot.devices[0].deviceId, deviceId);
  assert.equal(f.snapshot.devices[0].verification, 'VERIFIED');
  assert.equal(isCurrentBinding(f.snapshot, binding(f.snapshot)), true);
  assert.equal(isCurrentBinding(f.snapshot, provisional), false);
  assert.deepEqual(result.invalidatedBindings, [provisional.bindingId]);
});
test('unchanged exact continuity and row reorder retain identity, binding and generations without allocation', () => {
  const f = fixture();
  f.step([row(), row('phone-b', '2')]);
  verify(f);
  const before = binding(f.snapshot),
    calls = f.calls;
  const result = f.step([row()]);
  assert.equal(result.ok, true);
  assert.deepEqual(binding(f.snapshot), before);
  assert.equal(f.calls, calls);
  assert.equal(isCurrentBinding(f.snapshot, before), true);
  const g = fixture();
  g.step([row(), row('phone-b', '2')]);
  const ids = g.snapshot.devices.map((d) => d.deviceId),
    bindings = g.snapshot.bindings.map((b) => b.bindingId);
  g.step([row('phone-b', '2'), row()]);
  assert.deepEqual(
    g.snapshot.devices.map((d) => d.deviceId),
    ids,
  );
  assert.deepEqual(
    g.snapshot.bindings.map((b) => b.bindingId),
    bindings,
  );
});
test('disconnect fences old evidence and unresolved reconnect retains history without inventing a new physical device', () => {
  const f = fixture();
  f.step([row()]);
  verify(f);
  const old = binding(f.snapshot),
    oldDevice = f.snapshot.devices[0];
  f.step([]);
  assert.equal(f.snapshot.devices[0].state, 'DISCONNECTED');
  assert.equal(f.snapshot.devices[0].generation, oldDevice.generation + 1);
  assert.equal(isCurrentBinding(f.snapshot, old), false);
  const count = f.snapshot.devices.length,
    calls = f.calls;
  const result = f.step([row()]);
  assert.equal(result.code, 'RECONCILED_WITH_CONFLICTS');
  assert.equal(f.snapshot.claims[0].reason, 'IDENTITY_REQUIRED');
  assert.equal(f.snapshot.devices.length, count);
  assert.equal(f.calls, calls);
  assert.equal(
    f.snapshot.bindings.some((b) => b.bindingId === old.bindingId && b.retired),
    true,
  );
});
test('fresh resolver proof rebinds same stable identity after disconnect with new binding and fenced generation', () => {
  const f = fixture();
  f.step([row()]);
  verify(f);
  const before = binding(f.snapshot);
  f.step([]);
  const result = f.step(
    [row('phone-a', '7')],
    [{ serial: 'phone-a', transportId: '7', deviceId: before.deviceId, evidenceId: uuid(1001) }],
  );
  assert.equal(result.ok, true);
  const after = binding(f.snapshot);
  assert.equal(after.deviceId, before.deviceId);
  assert.notEqual(after.bindingId, before.bindingId);
  assert.ok(after.generation > before.generation);
  assert.equal(isCurrentBinding(f.snapshot, after), true);
  assert.equal(isCurrentBinding(f.snapshot, before), false);
});
test('duplicate serial quarantine invalidates current binding instead of rejecting and retaining dispatch authority', () => {
  const f = fixture();
  f.step([row()]);
  verify(f);
  const before = binding(f.snapshot);
  const result = f.step([row(), row('phone-a', '2')]);
  assert.equal(result.ok, true);
  assert.equal(result.code, 'RECONCILED_WITH_CONFLICTS');
  assert.equal(f.snapshot.devices[0].state, 'CONFLICT');
  assert.equal(
    f.snapshot.claims.every((c) => c.state === 'CONFLICT' && c.reason === 'DUPLICATE_SERIAL'),
    true,
  );
  assert.equal(isCurrentBinding(f.snapshot, before), false);
  assert.deepEqual(result.invalidatedBindings, [before.bindingId]);
});
test('duplicate transport across different serials quarantines both without merging', () => {
  const f = fixture();
  f.step([row(), row('phone-b', '2')]);
  const ids = f.snapshot.devices.map((d) => d.deviceId);
  f.step([row(), row('phone-b', '1')]);
  assert.equal(
    f.snapshot.claims.every((c) => c.reason === 'DUPLICATE_TRANSPORT'),
    true,
  );
  assert.deepEqual(
    f.snapshot.devices.map((d) => d.deviceId),
    ids,
  );
  assert.equal(
    f.snapshot.devices.every((d) => d.currentBindingId === null),
    true,
  );
});
test('proof cannot merge simultaneously observed distinct transports into one verified identity', () => {
  const f = fixture();
  f.step([row()]);
  verify(f);
  const before = binding(f.snapshot);
  const result = f.step(
    [row(), row('phone-wifi', '9')],
    [{ serial: 'phone-wifi', transportId: '9', deviceId: before.deviceId, evidenceId: uuid(1002) }],
  );
  assert.equal(result.code, 'RECONCILED_WITH_CONFLICTS');
  assert.equal(
    f.snapshot.claims.every((c) => c.reason === 'IDENTITY_CONFLICT'),
    true,
  );
  assert.equal(isCurrentBinding(f.snapshot, before), false);
  assert.deepEqual(f.snapshot.devices[0].evidenceIds, [uuid(1000)]);
});
test('unauthorized offline and unknown observations never confer verified current dispatch', () => {
  for (const state of ['UNAUTHORIZED', 'OFFLINE', 'UNKNOWN']) {
    const f = fixture();
    f.step([row()]);
    verify(f);
    const old = binding(f.snapshot);
    f.step([row('phone-a', '1', state)]);
    assert.equal(isCurrentBinding(f.snapshot, old), false);
    assert.equal(f.snapshot.claims[0].reason, 'IDENTITY_REQUIRED');
    const fresh = fixture();
    fresh.step([row('new', '3', state)]);
    assert.equal(fresh.snapshot.devices[0].state, state);
    assert.equal(isCurrentBinding(fresh.snapshot, binding(fresh.snapshot)), false);
  }
});
test('stale sequence and clock regression reject atomically without consuming IDs', () => {
  const f = fixture();
  f.step([row()]);
  const original = f.snapshot,
    calls = f.calls;
  for (const patch of [{ sequence: 0 }, { observedAtUtc: 0 }]) {
    const result = f.step([row('new', '9')], [], patch);
    assert.equal(result.code, 'STALE_OBSERVATION');
    assert.equal(result.snapshot, original);
    assert.equal(f.calls, calls);
  }
});
test('unknown reused or duplicate resolver evidence is rejected without mutating history', () => {
  const f = fixture();
  f.step([row()]);
  verify(f);
  const original = f.snapshot;
  for (const proof of [
    { serial: 'phone-a', transportId: '1', deviceId: uuid(500), evidenceId: uuid(1003) },
    {
      serial: 'phone-a',
      transportId: '1',
      deviceId: original.devices[0].deviceId,
      evidenceId: uuid(1000),
    },
  ]) {
    assert.equal(f.step([row()], [proof]).code, 'INVALID_PROOF');
    assert.equal(f.snapshot, original);
  }
  const p = {
    serial: 'phone-a',
    transportId: '1',
    deviceId: original.devices[0].deviceId,
    evidenceId: uuid(1003),
  };
  assert.equal(f.step([row()], [p, p]).code, 'INVALID_PROOF');
});
test('caller budget exhaustion is atomic and never prunes retained histories', () => {
  const f = fixture();
  f.step([row()]);
  const original = f.snapshot;
  const result = reconcileRegistry(
    original,
    {
      sequence: 1,
      observedAtUtc: 1002,
      source: 'SYNTHETIC_TEST',
      rows: [row(), row('new', '2')],
      proofs: [],
    },
    { nextId: () => uuid(99), budget: { ...budget, maxDevices: 1 } },
  );
  assert.equal(result.code, 'LIMIT_EXCEEDED');
  assert.equal(result.snapshot, original);
  assert.equal(original.devices.length, 1);
  for (const maxClaims of [0, -1, 1.5, Infinity, -0])
    assert.equal(
      reconcileRegistry(original, {}, { nextId: () => uuid(99), budget: { ...budget, maxClaims } })
        .code,
      'INVALID_INPUT',
    );
});
test('malformed colliding or throwing ID allocator cannot partially publish a snapshot', () => {
  for (const nextId of [
    () => 'short',
    () => uuid(1),
    () => {
      throw Error('private raw canary');
    },
  ]) {
    const empty = emptyRegistry();
    const result = reconcileRegistry(
      empty,
      { sequence: 0, observedAtUtc: 0, source: 'SYNTHETIC_TEST', rows: [row()], proofs: [] },
      { nextId, budget },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ID_ALLOCATION_FAILED');
    assert.equal(result.snapshot, empty);
    assert.equal(empty.devices.length, 0);
    assert.equal(JSON.stringify(result).includes('private raw canary'), false);
  }
});
test('snapshots and nested values are immutable; serialized VERIFIED claims are not registry authority', () => {
  const f = fixture();
  const input = row();
  f.step([input]);
  input.serial = 'changed';
  verify(f);
  const snapshot = f.snapshot;
  assert.equal(snapshot.bindings[0].serial, 'phone-a');
  assert.throws(() => snapshot.devices.push({}));
  assert.throws(() => snapshot.devices[0].evidenceIds.push(uuid(400)));
  assert.throws(() => (snapshot.bindings[0].serial = 'changed'));
  const forged = structuredClone(snapshot);
  assert.equal(isCurrentBinding(forged, binding(snapshot)), false);
  assert.equal(reconcileRegistry(forged, {}, f.options).code, 'INVALID_SNAPSHOT');
});
test('exact descriptor validation never invokes getters, rejects holes and unsafe numeric aliases', () => {
  const f = fixture();
  let getterCalls = 0;
  const input = {
    sequence: 0,
    observedAtUtc: 0,
    source: 'SYNTHETIC_TEST',
    rows: [row()],
    proofs: [],
  };
  Object.defineProperty(input, 'rows', {
    enumerable: true,
    get() {
      getterCalls++;
      return [row()];
    },
  });
  assert.equal(reconcileRegistry(f.snapshot, input, f.options).code, 'INVALID_INPUT');
  assert.equal(getterCalls, 0);
  for (const patch of [
    { sequence: -0 },
    { sequence: Infinity },
    { observedAtUtc: 8640000000000001 },
    { rows: new Array(1) },
  ])
    assert.equal(
      reconcileRegistry(
        f.snapshot,
        {
          sequence: 0,
          observedAtUtc: 0,
          source: 'SYNTHETIC_TEST',
          rows: [row()],
          proofs: [],
          ...patch,
        },
        f.options,
      ).ok,
      false,
    );
  assert.equal(
    isCurrentBinding(
      f.snapshot,
      new Proxy(
        {},
        {
          ownKeys() {
            throw Error('private');
          },
        },
      ),
    ),
    false,
  );
});

test('fresh proof cannot silently transfer another independently VERIFIED current transport to a disconnected identity', () => {
  const f = fixture();
  f.step([row(), row('phone-b', '2')]);
  const [a, b] = f.snapshot.devices;
  f.step(
    [row(), row('phone-b', '2')],
    [
      { serial: 'phone-a', transportId: '1', deviceId: a.deviceId, evidenceId: uuid(1100) },
      { serial: 'phone-b', transportId: '2', deviceId: b.deviceId, evidenceId: uuid(1101) },
    ],
  );
  f.step([row('phone-b', '2')]);
  const current = binding(f.snapshot),
    before = f.snapshot,
    calls = f.calls;
  const result = f.step(
    [row('phone-b', '2')],
    [{ serial: 'phone-b', transportId: '2', deviceId: a.deviceId, evidenceId: uuid(1102) }],
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, 'RECONCILED_WITH_CONFLICTS');
  assert.equal(f.snapshot.claims[0].reason, 'IDENTITY_CONFLICT');
  assert.equal(isCurrentBinding(f.snapshot, current), false);
  assert.deepEqual(result.invalidatedBindings, [current.bindingId]);
  assert.deepEqual(
    f.snapshot.devices.map((d) => d.evidenceIds),
    before.devices.map((d) => d.evidenceIds),
  );
  assert.equal(f.snapshot.devices.find((d) => d.deviceId === b.deviceId).state, 'CONFLICT');
  assert.equal(f.snapshot.devices.find((d) => d.deviceId === a.deviceId).currentBindingId, null);
  assert.equal(f.calls, calls);
});
