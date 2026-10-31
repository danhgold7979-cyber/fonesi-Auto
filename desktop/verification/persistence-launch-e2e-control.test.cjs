'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { transform, fixedResult, CASES } = require('./persistence-launch-e2e-control.cjs');
test('instrumented launcher permits only the audited original and four exact substitutions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../launch/Invoke-Desktop.ps1'), 'utf8');
  const copy = transform(source, 'C:\\Owned\\Desktop');
  assert.notEqual(copy, source);
  assert.ok(copy.includes("$desktop='C:\\Owned\\Desktop'"));
  assert.ok(copy.includes('verification/persistence-launch-init-probe.cjs'));
  assert.ok(copy.includes('verification/persistence-launch-main-probe.cjs'));
  assert.ok(copy.includes('launch/persistence-launch-control.cjs'));
  assert.throws(() => transform(source + '\n', 'C:\\Owned\\Desktop'));
  assert.throws(() => transform(source.replace('120000', '120001'), 'C:\\Owned\\Desktop'));
});
test('launcher E2E public facts reject duplicate masking/private data and never invent pass', () => {
  const value = {
    version: 1,
    scope: 'INSTRUMENTED_PRODUCTION_LAUNCHER',
    cases: Object.fromEntries(CASES.map((k) => [k, true])),
    protectedCount: 2,
    ordinaryCount: 1,
  };
  assert.equal(fixedResult(JSON.stringify(value)).passed, true);
  for (const key of CASES) {
    const bad = structuredClone(value);
    bad.cases[key] = false;
    assert.equal(fixedResult(JSON.stringify(bad)).passed, false);
  }
  assert.throws(() =>
    fixedResult(
      JSON.stringify(value).replace(
        '"audited_copy":true',
        '"audited_copy":false,"audited_copy":true',
      ),
    ),
  );
  assert.throws(() => fixedResult(JSON.stringify({ ...value, root: 'private' })));
  assert.throws(() => fixedResult(JSON.stringify({ ...value, ordinaryCount: true })));
});
