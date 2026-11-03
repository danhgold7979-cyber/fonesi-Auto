import test from 'node:test';
import assert from 'node:assert/strict';
import { compileHostPlan } from '../src/main/adb-host-plan.ts';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const request = (operation) => ({
  version: 1,
  commandId: id(1),
  correlationId: id(2),
  ownerId: id(3),
  operation,
  deadlineUtc: 1000,
});
test('fixed plans contain no caller paths, endpoint or generic argv; discovery refuses', () => {
  for (const [operation, expected] of [
    ['HOST_VERSION', { kind: 'VERSION', argv: ['version'] }],
    ['SERVER_START', { kind: 'FOREGROUND' }],
    ['SERVER_HEALTH', { kind: 'HEALTH', service: 'host:version' }],
    ['SERVER_STOP', { kind: 'RETIRE' }],
  ]) {
    const raw = request(operation),
      result = compileHostPlan(raw);
    assert.equal(result.ok, true);
    assert.deepEqual(result.plan, { request: raw, ...expected });
    raw.operation = 'DISCOVER';
    assert.equal(result.plan.request.operation, operation);
    assert.ok(
      Object.isFrozen(result) &&
        Object.isFrozen(result.plan) &&
        Object.isFrozen(result.plan.request),
    );
    if (result.plan.argv) assert.ok(Object.isFrozen(result.plan.argv));
  }
  assert.deepEqual(compileHostPlan(request('DISCOVER')), {
    ok: false,
    outcome: 'NOT_DISPATCHED',
    code: 'NOT_READY',
  });
});
test('extra arguments, accessors, malformed IDs and caller mutation cannot widen plans', () => {
  let reads = 0;
  const getter = { ...request('HOST_VERSION') };
  Object.defineProperty(getter, 'operation', {
    enumerable: true,
    get() {
      reads++;
      return 'HOST_VERSION';
    },
  });
  for (const raw of [
    getter,
    { ...request('HOST_VERSION'), argv: ['shell'] },
    { ...request('HOST_VERSION'), deadlineUtc: -0 },
    { ...request('HOST_VERSION'), operation: 'shell' },
    null,
  ])
    assert.equal(compileHostPlan(raw).code, 'INVALID_REQUEST');
  assert.equal(reads, 0);
});
