import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeviceDiagnosticEncoder,
  DIAGNOSTIC_REJECTION as NO,
  DIAGNOSTIC_OPERATIONS,
  DIAGNOSTIC_HEALTH,
} from '../src/main/device-diagnostics.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = () => ({
  version: 1,
  deviceId: id(1),
  commandId: id(2),
  correlationId: id(3),
  operation: 'MODEL',
  outcome: 'OBSERVED',
  code: 'OK',
  health: 'UNKNOWN',
  durationMs: 0,
});
test('fixed canonical projection retains zero, omits private identity and allocates ephemeral bounded labels', () => {
  const e = createDeviceDiagnosticEncoder();
  assert.ok(Object.isFrozen(e));
  const raw = e.encode(input()),
    v = JSON.parse(raw);
  assert.equal(raw, JSON.stringify(v));
  assert.equal(v.deviceLabel, 'device-0001');
  assert.equal(v.durationMs, 0);
  assert.ok(!raw.includes(id(1)));
  assert.equal(v.commandId, id(2));
  assert.equal(v.correlationId, id(3));
  assert.equal(JSON.parse(e.encode(input())).deviceLabel, 'device-0001');
  assert.equal(JSON.parse(e.encode({ ...input(), deviceId: id(4) })).deviceLabel, 'device-0002');
  assert.equal(
    JSON.parse(createDeviceDiagnosticEncoder().encode({ ...input(), deviceId: id(4) })).deviceLabel,
    'device-0001',
  );
});
test('all fixed operations and health labels serialize without operation arguments', () => {
  for (const operation of DIAGNOSTIC_OPERATIONS)
    for (const health of DIAGNOSTIC_HEALTH)
      assert.equal(
        JSON.parse(createDeviceDiagnosticEncoder().encode({ ...input(), operation, health }))
          .operation,
        operation,
      );
});
test('outcomes and actor codes must agree, missing timing remains null', () => {
  const e = createDeviceDiagnosticEncoder();
  for (const [outcome, code] of [
    ['NOT_DISPATCHED', 'BUSY'],
    ['NOT_DISPATCHED', 'AUDIT_UNAVAILABLE'],
    ['DISPATCHED_UNCONFIRMED', 'TRANSPORT_FAILED'],
    ['OUTCOME_UNKNOWN', 'OUTCOME_UNKNOWN'],
  ])
    assert.equal(
      JSON.parse(e.encode({ ...input(), outcome, code, durationMs: null })).durationMs,
      null,
    );
  for (const [outcome, code] of [
    ['OBSERVED', 'BUSY'],
    ['OBSERVED', 'AUDIT_UNAVAILABLE'],
    ['DISPATCHED_UNCONFIRMED', 'AUDIT_UNAVAILABLE'],
    ['NOT_DISPATCHED', 'OK'],
    ['OBSERVED', 'OUTCOME_UNKNOWN'],
    ['OUTCOME_UNKNOWN', 'TRANSPORT_FAILED'],
    ['DISPATCHED_UNCONFIRMED', 'BUSY'],
  ])
    assert.equal(e.encode({ ...input(), outcome, code }), NO);
  assert.notEqual(
    e.encode({
      ...input(),
      outcome: 'NOT_DISPATCHED',
      code: 'INVALID_REQUEST',
      commandId: null,
      correlationId: null,
    }),
    NO,
  );
  assert.equal(e.encode({ ...input(), commandId: null }), NO);
});
test('strict fields reject multiline/private canaries, raw output and malicious descriptors without echo/getters', () => {
  const e = createDeviceDiagnosticEncoder(),
    canary = 'secret password 192.0.2.8 serial/private\nINJECT';
  for (const key of Object.keys(input())) assert.equal(e.encode({ ...input(), [key]: canary }), NO);
  for (const key of ['serial', 'stdout', 'stderr', 'path', 'text', 'diagnosticId'])
    assert.equal(e.encode({ ...input(), [key]: canary }), NO);
  let calls = 0;
  const bad = input();
  Object.defineProperty(bad, 'operation', {
    get() {
      calls++;
      return canary;
    },
  });
  assert.equal(e.encode(bad), NO);
  assert.equal(calls, 0);
  assert.equal(
    e.encode(
      new Proxy(
        {},
        {
          ownKeys() {
            throw Error(canary);
          },
        },
      ),
    ),
    NO,
  );
  const symbol = input();
  symbol[Symbol('private')] = canary;
  assert.equal(e.encode(symbol), NO);
  const inherited = Object.create(input());
  assert.equal(e.encode(inherited), NO);
});
test('timing and identity bounds are exact, missing fields never become zero', () => {
  const e = createDeviceDiagnosticEncoder();
  for (const durationMs of [-0, -1, NaN, Infinity, 0.5, 86400001, undefined, '0'])
    assert.equal(e.encode({ ...input(), durationMs }), NO);
  assert.equal(JSON.parse(e.encode({ ...input(), durationMs: 86400000 })).durationMs, 86400000);
  const missing = input();
  delete missing.durationMs;
  assert.equal(e.encode(missing), NO);
  for (const patch of [
    { commandId: id(1) },
    { correlationId: id(1) },
    { commandId: id(3) },
    { deviceId: id(1) + '\n' },
    { version: 2 },
  ])
    assert.equal(e.encode({ ...input(), ...patch }), NO);
});
test('input mutation cannot change serialized snapshots or consume mapping on rejection', () => {
  const e = createDeviceDiagnosticEncoder(),
    v = input();
  const raw = e.encode(v);
  v.operation = 'TEXT';
  v.deviceId = id(99);
  assert.equal(JSON.parse(raw).operation, 'MODEL');
  assert.equal(JSON.parse(raw).deviceLabel, 'device-0001');
  assert.equal(e.encode({ ...input(), deviceId: id(55), health: 'invalid' }), NO);
  assert.equal(JSON.parse(e.encode({ ...input(), deviceId: id(56) })).deviceLabel, 'device-0002');
});
test('mapping exhaustion fails closed while known pseudonym remains usable', () => {
  const e = createDeviceDiagnosticEncoder();
  for (let i = 100; i < 356; i++) assert.notEqual(e.encode({ ...input(), deviceId: id(i) }), NO);
  assert.equal(e.encode({ ...input(), deviceId: id(356) }), NO);
  assert.equal(JSON.parse(e.encode({ ...input(), deviceId: id(100) })).deviceLabel, 'device-0001');
});

test('actual actor queued timeout and post-retirement binary revocation remain encodable', async () => {
  const { createDeviceActor, createDeviceQueueBudget } = await import(
    '../src/main/device-actor.ts'
  );
  const target = {
    deviceId: id(1),
    bindingId: id(4),
    generation: 0,
    serial: 'synthetic-private-serial',
  };
  const project = (r) =>
    createDeviceDiagnosticEncoder().encode({
      ...input(),
      commandId: r.commandId,
      correlationId: r.correlationId,
      outcome: r.outcome,
      code: r.code,
    });
  const request = (n) => ({
    version: 1,
    ...target,
    ownerId: id(5),
    commandId: id(n),
    correlationId: id(n + 1000),
    operation: 'MODEL',
    deadlineUtc: 1030,
  });
  let resolve;
  const held = new Promise((r) => {
    resolve = r;
  });
  const actor = createDeviceActor({
    binding: target,
    budget: createDeviceQueueBudget(),
    now: () => 1000,
    assertOwned: () => true,
    current: () => true,
    binaryAvailable: () => true,
    dispatch: () => held,
    observe: () => true,
  });
  const cap = actor.acquire(id(5));
  const active = actor.execute(cap, request(10)),
    queued = actor.execute(cap, request(11));
  const [a, q] = await Promise.all([active, queued]);
  assert.equal(a.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(q.outcome, 'NOT_DISPATCHED');
  assert.equal(q.code, 'OUTCOME_UNKNOWN');
  assert.notEqual(project(a), NO);
  assert.notEqual(project(q), NO);
  resolve({ status: 'SUCCESS', exitCode: 0, retired: true, truncated: false, stdout: 'synthetic' });
  let available = true;
  const second = createDeviceActor({
    binding: target,
    budget: createDeviceQueueBudget(),
    now: () => 1000,
    assertOwned: () => true,
    current: () => true,
    binaryAvailable: () => available,
    dispatch: async () => {
      available = false;
      return {
        status: 'SUCCESS',
        exitCode: 0,
        retired: true,
        truncated: false,
        stdout: 'synthetic',
      };
    },
    observe: () => true,
  });
  const r = await second.execute(second.acquire(id(5)), {
    ...request(12),
    deadlineUtc: 2000,
  });
  assert.equal(r.outcome, 'DISPATCHED_UNCONFIRMED');
  assert.equal(r.code, 'BINARY_UNAVAILABLE');
  assert.notEqual(project(r), NO);
});

test('successful dispatch remains unconfirmed rather than being relabeled observed', () => {
  const raw = createDeviceDiagnosticEncoder().encode({
    ...input(),
    outcome: 'DISPATCHED_UNCONFIRMED',
    code: 'OK',
  });
  assert.notEqual(raw, NO);
  assert.equal(JSON.parse(raw).outcome, 'DISPATCHED_UNCONFIRMED');
  assert.equal(
    createDeviceDiagnosticEncoder().encode({ ...input(), outcome: 'NOT_DISPATCHED', code: 'OK' }),
    NO,
  );
});
