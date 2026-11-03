'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process');
const rawContract = require('./package-contract.cjs');
const contract = {
  ...rawContract,
  result: (v) => rawContract.result(JSON.stringify(v)),
  negativeResult: (v) => rawContract.negativeResult(JSON.stringify(v)),
};

const { withMissing, withReplacement } = require('./package-control.cjs');
function owned(fn) {
  const parent = path.resolve(__dirname, '../.test-output');
  assert.equal(fs.realpathSync.native(parent), parent);
  assert.equal(fs.lstatSync(parent).isSymbolicLink(), false);
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(parent, 'package-negative-test-')));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
}
test('ten package stage schemas require exact observed cases and fixed process outcomes', () => {
  assert.equal(contract.STAGES.length, 10);
  for (const stage of contract.STAGES) {
    const value = {
      version: 1,
      stage,
      versions: contract.VERSIONS,
      cases: Object.fromEntries(contract.CASES[stage].map((k) => [k, true])),
    };
    assert.deepEqual(contract.result(value), value);
    assert.throws(() =>
      contract.result({ ...value, cases: { ...value.cases, privatePath: true } }),
    );
    assert.throws(() =>
      contract.result({ ...value, cases: { ...value.cases, [contract.CASES[stage][0]]: 1 } }),
    );
    assert.equal(contract.EXPECTED[stage].length, 3);
  }
  assert.equal(contract.EXPECTED['corrupt-current'][1], 1);
  assert.equal(contract.EXPECTED['restored-normal-denied'][1], 1);
});
test('negative schema retains all fifteen actual checks without truth coercion', () => {
  const value = { version: 1, cases: Object.fromEntries(contract.NEGATIVES.map((k) => [k, true])) };
  assert.equal(contract.NEGATIVES.length, 15);
  assert.deepEqual(contract.negativeResult(value), value);
  assert.throws(() =>
    contract.negativeResult({ ...value, cases: { ...value.cases, missingNode: 1 } }),
  );
});
test('actual missing and replacement negative helpers restore exact original bytes even when verifier unexpectedly accepts', () =>
  owned((root) => {
    const file = path.join(root, 'owned'),
      backup = path.join(root, 'original');
    fs.writeFileSync(file, 'original', { flag: 'wx' });
    withMissing(file, backup, () => {
      assert.equal(fs.existsSync(file), false);
      throw Error('DENIED');
    });
    assert.equal(fs.readFileSync(file, 'utf8'), 'original');
    withReplacement(file, backup, Buffer.from('changed'), () => {
      assert.equal(fs.readFileSync(file, 'utf8'), 'changed');
      throw Error('DENIED');
    });
    assert.equal(fs.readFileSync(file, 'utf8'), 'original');
    assert.throws(() => withMissing(file, backup, () => {}), /NOT_DENIED/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'original');
    assert.throws(
      () => withReplacement(file, backup, Buffer.from('changed'), () => {}),
      /NOT_DENIED/,
    );
    assert.equal(fs.readFileSync(file, 'utf8'), 'original');
    assert.equal(fs.existsSync(backup), false);
  }));
test('negative helper retains original evidence rather than overwriting unexpected changed target', () =>
  owned((root) => {
    const file = path.join(root, 'owned'),
      backup = path.join(root, 'original');
    fs.writeFileSync(file, 'original', { flag: 'wx' });
    assert.throws(
      () =>
        withReplacement(file, backup, Buffer.from('changed'), () => {
          fs.writeFileSync(file, 'unexpected');
          throw Error('DENIED');
        }),
      /RESTORE_UNCERTAIN/,
    );
    assert.equal(fs.readFileSync(file, 'utf8'), 'unexpected');
    assert.equal(fs.readFileSync(backup, 'utf8'), 'original');
  }));
test('fixed candidate adapter rejects malformed arguments without exposing private diagnostics', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'package-build-entry.mjs')], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 65536,
    shell: false,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'PACKAGE_CANDIDATE_FAILED\n');
  assert.equal(result.stderr, '');
});

test('negative synthetic fixtures clean only exact witnessed files and preserve unknown alterations', () =>
  owned((root) => {
    const { cleanNegativeFixtures, FAILING_TEST } = require('./package-control.cjs');
    const work = path.join(root, 'promotion-negative'),
      stage = path.join(work, 'stage');
    fs.mkdirSync(work);
    fs.mkdirSync(stage);
    for (const [name, value] of [
      ['promotion-negative/stage/owned', 'candidate'],
      ['promotion-negative/stage.zip', 'candidate'],
      ['promotion-negative/package.zip', 'last verified owned fixture'],
      ['injected-failing-test.cjs', FAILING_TEST],
    ])
      fs.writeFileSync(path.join(root, name), value, { flag: 'wx' });
    fs.writeFileSync(path.join(work, 'unexpected'), 'preserve', { flag: 'wx' });
    assert.throws(() => cleanNegativeFixtures(root), /CLEANUP_UNCERTAIN/);
    assert.equal(fs.readFileSync(path.join(work, 'unexpected'), 'utf8'), 'preserve');
    assert.equal(fs.existsSync(path.join(stage, 'owned')), true);
    fs.unlinkSync(path.join(work, 'unexpected'));
    cleanNegativeFixtures(root);
    assert.equal(fs.existsSync(work), false);
    assert.equal(fs.existsSync(path.join(root, 'injected-failing-test.cjs')), false);
  }));
