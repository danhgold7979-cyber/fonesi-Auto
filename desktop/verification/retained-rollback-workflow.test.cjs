'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const raw = fs
  .readFileSync(path.join(__dirname, '../../.github/workflows/phase-02-software.yml'), 'utf8')
  .replaceAll('\r\n', '\n');
const condition =
  "    if: false && ((github.event_name == 'workflow_dispatch' && inputs.run_retained_rollback) || (github.event_name == 'push' && github.ref == 'refs/heads/phase-02' && contains(github.event.head_commit.message, '[retained-rollback]')))";
function gate(value) {
  const s = value.replaceAll('\r\n', '\n');
  assert.match(s, /assert s\.countTestCases\(\)==277; r=unittest\.TextTestRunner/);
  assert.match(s, /r\.wasSuccessful\(\) and not r\.skipped/);
  assert.match(
    s,
    / {6}run_retained_rollback:\n {8}description: '[^\n]+'\n {8}required: false\n {8}type: boolean\n {8}default: false\n/,
  );
  const section = s
    .split('  owned-retained-rollback-development:\n')[1]
    ?.split(/\n {2}[a-z][a-z0-9-]*:\n/)[0];
  assert.ok(section);
  assert.ok(section.includes('\n' + condition + '\n'));
  assert.match(section, / {4}needs: windows-software-only\n/);
  assert.match(section, /timeout-minutes: 30/);
  return section;
}
test('historical four-stage campaign remains suspended pending current server input review under LF and CRLF', () => {
  for (const s of [raw, raw.replaceAll('\n', '\r\n')]) {
    gate(s);
    for (const replacement of ['s.countTestCases()==263', 's.countTestCases()>=277']) {
      const changed = s.replace('s.countTestCases()==277', replacement);
      assert.notEqual(changed, s);
      assert.throws(() => gate(changed));
    }
    for (const replacement of [
      '    if: true',
      condition.replace('false && (', '('),
      condition.replace('refs/heads/phase-02', 'refs/heads/main'),
      condition.replace('inputs.run_retained_rollback', 'inputs.run_package_version'),
      condition.replace('[retained-rollback]', '[package-version]'),
    ]) {
      const changed = s.replaceAll('\r\n', '\n').replace(condition, replacement);
      assert.notEqual(changed, s.replaceAll('\r\n', '\n'));
      assert.throws(() => gate(changed));
    }
  }
});
test('suspended historical ten-group gate retains exact archive ordering and JSON-only uploads', () => {
  const s = gate(raw),
    managed = s.indexOf('Invoke-RetainedManagedFixture.ps1)'),
    validate = s.indexOf('validate_retained_host.py managed'),
    fetch = s.indexOf('fetch-retained-archives.cjs'),
    run = s.indexOf('try { & ./desktop/verification/Invoke-RetainedRollbackCheck.ps1 }');
  assert.ok(managed > 0 && validate > managed && fetch > validate && run > fetch);
  assert.equal((s.match(/fetch-retained-archives\.cjs/g) || []).length, 1);
  assert.equal((s.match(/uses: actions\/upload-artifact@/g) || []).length, 2);
  assert.match(s, /steps\.retained_managed_validation\.outputs\.written == 'true'/);
  assert.match(s, /steps\.retained_rollback_validation\.outputs\.written == 'true'/);
  assert.doesNotMatch(s, /include-hidden-files|Invoke-Isolated|run_adb_server|\.png/);
  for (const name of [
    'owned-recipient-setup-development',
    'owned-retained-version-development',
    'owned-main-version-development',
    'owned-package-version-development',
  ]) {
    const job = raw.split('  ' + name + ':\n')[1].split(/\n {2}[a-z][a-z0-9-]*:\n/)[0];
    assert.match(job, / {4}if: false && /);
  }
  assert.doesNotMatch(
    raw.split('  windows-software-only:\n')[1].split(/\n {2}[a-z][a-z0-9-]*:\n/)[0],
    /fetch-retained-archives|Invoke-RetainedRollback/,
  );
});
