import test from 'node:test';
import assert from 'node:assert/strict';
import { testDiagnostics } from '../scripts/test-diagnostics.mjs';

test('fixed diagnostics preserve numeric failures without private labels or YAML', () => {
  const lines = testDiagnostics(
    'not ok 12 - PRIVATE_SECRET\n  location: C:/private/path\n# tests 20\n# pass 19\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n',
    'EXIT_NONZERO',
  );
  assert.ok(lines.includes('TEST_FAILURE_ORDINAL_12'));
  assert.ok(lines.includes('TEST_COUNT_FAIL_1'));
  assert.ok(lines.includes('TEST_PROCESS_EXIT_NONZERO'));
  assert.ok(lines.every((line) => /^TEST_[A-Z_0-9]+$/.test(line)));
  assert.ok(!lines.join().includes('PRIVATE'));
});
test('missing duplicate malformed counts and unknown outcomes cannot echo input', () => {
  const lines = testDiagnostics('# fail 0\n# fail 1\n# tests NaN\nnot ok secret - x\n', 'PRIVATE');
  assert.ok(lines.includes('TEST_COUNT_FAIL_UNAVAILABLE'));
  assert.ok(lines.includes('TEST_PROCESS_UNKNOWN'));
  assert.ok(lines.includes('TEST_FAILURE_ORDINAL_UNAVAILABLE'));
  assert.deepEqual(testDiagnostics('x'.repeat(65537), 'CAPTURE_LIMIT'), [
    'TEST_PROCESS_CAPTURE_LIMIT',
    'TEST_DIAGNOSTIC_INPUT_REJECTED',
  ]);
});
test('failure ordinal output is capped and cannot leak nested diagnostic text', () => {
  const raw = Array.from({ length: 40 }, (_, i) => `not ok ${i + 1} - private`).join('\n');
  const lines = testDiagnostics(raw, 'TIMEOUT');
  assert.equal(lines.filter((line) => line.startsWith('TEST_FAILURE_ORDINAL_')).length, 16);
  assert.ok(
    !testDiagnostics('  not ok 99 - nested\nnot ok 9999 - beyond\n', 'SIGNAL').includes(
      'TEST_FAILURE_ORDINAL_99',
    ),
  );
});
