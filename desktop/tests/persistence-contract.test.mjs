import test from 'node:test';
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
test('exact foundation schema has three migrations and six named tables only', () => {
  assert.equal(MIGRATIONS.length, 3);
  const names = [...MIGRATIONS.join('\n').matchAll(/CREATE TABLE ([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(names, Object.keys(TABLES));
  assert.equal((MIGRATIONS.join('\n').match(/\) STRICT;/g) || []).length, 6);
  assert.equal(/CREATE TABLE (?:device|account|job|secret)/.test(MIGRATIONS.join('\n')), false);
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
