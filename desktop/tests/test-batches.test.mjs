import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEST_FILES,
  TEST_BATCH_SIZE,
  tapCounts,
  runTestBatches,
} from '../scripts/test-batches.mjs';
const summary = (n = 3) =>
  `# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
const success = () => ({ ok: true, outcome: 'OK', stdout: summary() });
function harness(run, inventory) {
  const lines = [],
    diagnostics = [];
  const ok = runTestBatches(
    run,
    { emit: (x) => lines.push(x), diagnostic: (...x) => diagnostics.push(x) },
    inventory,
  );
  return { ok, lines, diagnostics };
}
test('fixed inventory sorted unique and every file runs exactly once in bounded sequential batches', () => {
  assert.deepEqual(TEST_FILES, [...TEST_FILES].sort());
  assert.equal(new Set(TEST_FILES).size, TEST_FILES.length);
  assert.equal(TEST_BATCH_SIZE, 16);
  const seen = [];
  const result = harness((args) => {
    assert.deepEqual(args.slice(0, 2), ['--test', '--test-reporter=tap']);
    assert.ok(args.length - 2 <= 16);
    seen.push(...args.slice(2));
    return success();
  });
  assert.deepEqual(seen, TEST_FILES);
  assert.equal(result.ok, true);
  const count = Math.ceil(TEST_FILES.length / 16) * 3;
  assert.deepEqual(result.lines, [`TESTS_PASS ${count}/${count}`]);
  assert.deepEqual(result.diagnostics, []);
});
test('duplicates omissions substitutions and reordering fail before any child', () => {
  const duplicate = [...TEST_FILES];
  duplicate[1] = duplicate[0];
  const reorder = [...TEST_FILES];
  [reorder[0], reorder[1]] = [reorder[1], reorder[0]];
  for (const inventory of [
    duplicate,
    TEST_FILES.slice(1),
    [...TEST_FILES, 'tests/unknown.test.mjs'],
    reorder,
    null,
  ]) {
    const r = harness(() => assert.fail('child'), inventory);
    assert.equal(r.ok, false);
    assert.deepEqual(r.lines, ['TEST_BATCH_INVENTORY_FAILED']);
  }
});
test('capture timeout exit and thrown spawn failures cannot become partial success', () => {
  for (const outcome of ['CAPTURE_LIMIT', 'TIMEOUT', 'EXIT_NONZERO', 'SPAWN_FAILED', 'SIGNAL']) {
    let calls = 0;
    const r = harness(() =>
      ++calls === 1 ? success() : { ok: false, outcome, stdout: summary() },
    );
    assert.equal(calls, 2);
    assert.equal(r.ok, false);
    assert.deepEqual(r.lines, ['TEST_BATCH_FAILED 2']);
    assert.equal(r.diagnostics[0][1], outcome);
  }
  const r = harness(() => {
    throw Error('PRIVATE');
  });
  assert.deepEqual(r.lines, ['TEST_BATCH_FAILED 1']);
  assert.deepEqual(r.diagnostics, [['', 'SPAWN_FAILED']]);
});
test('six summaries must be unique consistent safe integer nonzero without skipped cases', () => {
  for (const raw of [
    '',
    summary(0),
    `${summary()}# skipped 0\n`,
    summary().replace('# pass 3', '# pass 2'),
    summary().replace('# todo 0', '# todo 1'),
    summary().replace('# fail 0', '# fail 1'),
    summary().replace('# skipped 0', '# skipped 1'),
    summary().replace('# cancelled 0', '# cancelled 1'),
    summary().replace('# tests 3', '# tests 03'),
    summary(Number.MAX_SAFE_INTEGER + 1),
  ]) {
    assert.equal(tapCounts(raw), null);
    const r = harness(() => ({ ok: true, outcome: 'OK', stdout: raw }));
    assert.equal(r.ok, false);
    assert.deepEqual(r.lines, ['TEST_BATCH_FAILED 1']);
  }
  assert.equal(tapCounts(summary()).tests, 3);
});
test('contradictory process outcome never passes despite complete positive TAP', () => {
  for (const result of [
    { ok: true, outcome: 'CAPTURE_LIMIT', stdout: summary() },
    { ok: false, outcome: 'OK', stdout: summary() },
    null,
  ])
    assert.equal(harness(() => result).ok, false);
});
