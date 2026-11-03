import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeviceDiagnosticCollector,
  isOpenDeviceDiagnosticCollector,
  DEVICE_DIAGNOSTIC_LIMITS,
} from '../src/main/device-diagnostic-collector.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const record = (device = 1) => ({
  version: 1,
  deviceId: id(device),
  commandId: id(1000),
  correlationId: id(1001),
  operation: 'MODEL',
  outcome: 'OBSERVED',
  code: 'OK',
  health: 'UNKNOWN',
  durationMs: 0,
});
test('collector snapshots are immutable, encoded only and byte-exact', () => {
  const c = createDeviceDiagnosticCollector();
  assert.equal(c.append(record()), 'RECORDED');
  const snapshot = c.snapshot();
  assert.equal(snapshot.bytes, Buffer.byteLength(snapshot.records.join('\n') + '\n'));
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.records));
  assert.equal(c.append(record(2)), 'RECORDED');
  assert.equal(snapshot.records.length, 1);
  assert.equal(c.snapshot().records.length, 2);
  assert.equal(snapshot.records[0].includes(id(1)), false);
  assert.equal(JSON.parse(snapshot.records[0]).deviceLabel, 'device-0001');
});
test('closed schema rejects private canaries, getters, symbols and sentinel', () => {
  const c = createDeviceDiagnosticCollector();
  let invoked = false;
  const getter = Object.defineProperty(record(), 'operation', {
    get() {
      invoked = true;
      return 'MODEL';
    },
  });
  for (const value of [
    null,
    'DEVICE_DIAGNOSTIC_REJECTED',
    { ...record(), raw: 'SECRET_CANARY 192.0.2.1 serial-private' },
    { ...record(), [Symbol()]: true },
    getter,
    { ...record(), code: 'SECRET_CANARY' },
  ])
    assert.equal(c.append(value), 'REJECTED');
  assert.equal(invoked, false);
  assert.deepEqual(c.snapshot().records, []);
  assert.equal(c.snapshot().dropped, 6);
});
test('capacity rejects instead of evicting unresolved records', () => {
  const c = createDeviceDiagnosticCollector();
  const uncertain = { ...record(), outcome: 'OUTCOME_UNKNOWN', code: 'OUTCOME_UNKNOWN' };
  for (let n = 0; n < DEVICE_DIAGNOSTIC_LIMITS.records; n++)
    assert.equal(c.append(uncertain), 'RECORDED');
  const before = c.snapshot();
  assert.equal(c.append(record()), 'FULL');
  assert.equal(c.snapshot().records.length, 512);
  assert.equal(c.snapshot().dropped, 1);
  assert.deepEqual(c.snapshot().records, before.records);
  assert.ok(before.bytes <= DEVICE_DIAGNOSTIC_LIMITS.bytes);
});
test('encoder device-cap rejection remains distinct from record capacity', () => {
  const c = createDeviceDiagnosticCollector();
  for (let n = 1; n <= 256; n++) assert.equal(c.append(record(n)), 'RECORDED');
  assert.equal(c.append(record(257)), 'REJECTED');
  assert.equal(c.snapshot().records.length, 256);
});
test('close fences admission without silently deleting collected evidence', () => {
  const c = createDeviceDiagnosticCollector();
  c.append(record());
  c.close();
  c.close();
  assert.equal(c.append(record()), 'CLOSED');
  assert.equal(isOpenDeviceDiagnosticCollector(c), false);
  assert.equal(isOpenDeviceDiagnosticCollector({ ...c }), false);
  assert.equal(c.snapshot().records.length, 1);
});

test('reentrant input inspection cannot append after collector closure', () => {
  const c = createDeviceDiagnosticCollector();
  const value = new Proxy(record(), {
    ownKeys(target) {
      c.close();
      return Reflect.ownKeys(target);
    },
  });
  assert.equal(c.append(value), 'CLOSED');
  assert.equal(c.snapshot().records.length, 0);
});
