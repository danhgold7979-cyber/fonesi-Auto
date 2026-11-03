import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  MIGRATIONS,
  TABLES,
  MAINTENANCE_ARGUMENTS,
  maintenanceArgument,
  automaticDue,
  epoch,
  checksum,
} from '../src/persistence-contract.ts';
test('exact foundation schema has five migrations and thirteen exact named tables only', () => {
  assert.equal(MIGRATIONS.length, 5);
  assert.deepEqual(
    MIGRATIONS.slice(0, 4).map((sql) => createHash('sha256').update(sql).digest('hex')),
    [
      'a7dcc15acf94d6f8617716d4b096d1aa080fe59ecbf0b306688c4c81f2d14d73',
      '5f9d4df89fbf0ee078120acd0810c8b1e0367bbee6cb60f9be64f35814cd44b3',
      '9fd96888dcbfbf6a8a35d400be2eacc83fa54fecf89ca8d596d95fc5c4d177f6',
      '45b22427ff3579017424b0cff1e0bcd9ba2ecab05692d9b42023869a07562882',
    ],
  );
  const names = [...MIGRATIONS.join('\n').matchAll(/CREATE TABLE ([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(names, Object.keys(TABLES));
  assert.deepEqual(names.slice(6), [
    'registry_meta',
    'registry_device',
    'registry_binding',
    'registry_identity_evidence',
    'capture_artifact',
    'capture_hold',
    'device_session_association',
  ]);
  assert.equal((MIGRATIONS.join('\n').match(/\) STRICT;/g) || []).length, 13);
  assert.equal(
    /CREATE TABLE (?:device|account|job|secret)\s*\(/.test(MIGRATIONS.join('\n')),
    false,
  );
});
test('maintenance admits only normal startup or one exact reviewed literal', () => {
  assert.equal(maintenanceArgument([]), 'NORMAL');
  for (const value of MAINTENANCE_ARGUMENTS) assert.equal(maintenanceArgument([value]), value);
  for (const args of [
    ['--maintenance=BACKUP-NOW'],
    ['--maintenance=backup-now', 'x'],
    ['--maintenance=backup-now', '--maintenance=backup-now'],
    [' --maintenance=backup-now'],
    ['--maintenance'],
    ['--no-sandbox'],
  ])
    assert.equal(maintenanceArgument(args), null);
});
test('automatic cadence is elapsed24h, persisted admission and quarantine aware', () => {
  const previous = 1_000_000;
  assert.equal(automaticDue(previous, null, false), true);
  assert.equal(automaticDue(previous + 86_399_999, previous, false), false);
  assert.equal(automaticDue(previous + 86_400_000, previous, false), true);
  assert.equal(automaticDue(previous - 1, previous, false), false);
  assert.equal(automaticDue(previous + 86_400_000, previous, true), false);
  for (const value of [-1, -0, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(epoch(value), false);
    assert.equal(automaticDue(value, null, false), false);
  }
  assert.equal(checksum('a'.repeat(64)), true);
  assert.equal(checksum('A'.repeat(64)), false);
  assert.equal(checksum('a'.repeat(64) + '\n'), false);
});
