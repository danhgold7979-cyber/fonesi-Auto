'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { transform, fixedResult, CASES } = require('./persistence-launch-e2e-control.cjs');
test('instrumented launcher permits only the audited original and four exact substitutions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../launch/launch-core.ps1'), 'utf8');
  const copy = transform(source, 'C:\\Owned\\Desktop');
  assert.notEqual(copy, source);
  const wrapper = fs.readFileSync(path.join(__dirname, '../launch/Invoke-Desktop.ps1'), 'utf8');
  const { WRAPPER_SHA } = require('./persistence-launch-e2e-control.cjs');
  assert.equal(
    require('node:crypto').createHash('sha256').update(wrapper).digest('hex'),
    WRAPPER_SHA,
  );
  assert.ok(wrapper.includes(". (Join-Path $PSScriptRoot 'launch-core.ps1')"));
  assert.ok(wrapper.includes("-EntryMode 'SOURCE'"));
  assert.ok(copy.includes("$desktop='C:\\Owned\\Desktop'"));
  assert.ok(copy.includes('verification/persistence-launch-init-probe.cjs'));
  assert.ok(copy.includes('verification/persistence-launch-main-probe.cjs'));
  assert.ok(copy.includes("$launchTools=Join-Path $desktop 'launch'"));
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
test('both real observer call sites place witnesses outside the production journal', () => {
  const { witnessPath } = require('./persistence-launch-e2e-control.cjs');
  const base = fs.realpathSync(path.join(__dirname, '../.test-output')),
    root = fs.mkdtempSync(path.join(base, 'launcher-witness-'));
  const id = '12345678-1234-1234-1234-123456789abc',
    first = path.join(root, 'first-use'),
    managed = path.join(first, 'Fonesi-Auto-' + id),
    launch = path.join(managed, 'launch-' + id);
  for (const d of [first, managed, launch]) fs.mkdirSync(d);
  for (const d of [root, managed, launch])
    fs.writeFileSync(path.join(d, '.owner'), id, { flag: 'wx' });
  try {
    for (const kind of ['provision', 'auth', 'ui']) {
      const target = witnessPath(launch, kind);
      assert.equal(path.dirname(target), root);
      assert.equal(path.basename(target), 'launcher-witness-' + id + '-' + kind + '.json');
      fs.writeFileSync(target, '{}', { flag: 'wx' });
      fs.unlinkSync(target);
    }
    assert.deepEqual(fs.readdirSync(launch), ['.owner']);
    assert.throws(() => witnessPath(launch, 'other'));
    for (const kind of ['init', 'main']) {
      const source = fs.readFileSync(
        path.join(__dirname, 'persistence-launch-' + kind + '-probe.cjs'),
        'utf8',
      );
      assert.ok(source.includes('witnessPath(launch,'));
      assert.ok(!source.includes("path.join(launch, 'ui-witness.json')"));
    }
    const ps = fs.readFileSync(path.join(__dirname, 'Invoke-PersistenceLauncherE2E.ps1'), 'utf8');
    assert.ok(ps.includes('CURRENT_NOT_SECOND'));
    assert.ok(ps.includes('JOURNAL_BINDING'));
    assert.ok(ps.includes('GUARD_OWNER'));
  } finally {
    for (const d of [launch, managed]) {
      fs.unlinkSync(path.join(d, '.owner'));
      fs.rmdirSync(d);
    }
    fs.rmdirSync(first);
    fs.unlinkSync(path.join(root, '.owner'));
    fs.rmdirSync(root);
  }
});
