'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const {
  FIRST_CASES,
  REOPEN_CASES,
  PHASES,
  SCOPE,
  validateResult,
} = require('./recipient-setup-contract.cjs');
function sample(mode = 'FIRST') {
  return {
    version: 1,
    scope: SCOPE,
    mode,
    cases: Object.fromEntries(
      (mode === 'FIRST' ? FIRST_CASES : REOPEN_CASES).map((k) => [k, true]),
    ),
    screenshots:
      mode === 'FIRST'
        ? Object.fromEntries(
            ['light', 'dark'].map((t, i) => [
              t,
              {
                file: `setup-${t}.png`,
                sha256: String(i).repeat(64),
                width: 1024,
                height: 768,
                bytes: 100,
              },
            ]),
          )
        : {},
    readyCount: 1,
    closedCount: 1,
  };
}
test('exact first/reopen records preserve every false case and reject invented shapes', () => {
  for (const mode of ['FIRST', 'REOPEN']) {
    assert.equal(validateResult(sample(mode)).passed, true);
    for (const key of Object.keys(sample(mode).cases)) {
      const v = sample(mode);
      v.cases[key] = false;
      assert.equal(validateResult(v).passed, false);
    }
    for (const change of [
      (v) => (v.mode = 'OTHER'),
      (v) => (v.readyCount = true),
      (v) => (v.cases.private = 'data'),
      (v) => (v.extra = 'path'),
    ]) {
      const v = sample(mode);
      change(v);
      assert.throws(() => validateResult(v));
    }
  }
});
test('reopen and first images cannot be interchanged or use unbounded filenames', () => {
  const v = sample('REOPEN');
  v.screenshots = sample().screenshots;
  assert.throws(() => validateResult(v));
  for (const [field, value] of [
    ['file', '../private.png'],
    ['bytes', 2097153],
    ['width', 800],
    ['sha256', 'X'.repeat(64)],
  ]) {
    const s = sample();
    s.screenshots.light[field] = value;
    assert.throws(() => validateResult(s));
  }
});
test('runner observer phase grammar and two exact captures match contract', () => {
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-RecipientSetup.ps1'), 'utf8');
  const match = ps.match(/RECIPIENT_SETUP_PHASE_\(([^)]+)\)/);
  assert.ok(match);
  assert.deepEqual(match[1].split('|'), PHASES);
  for (const fragment of [
    "@('FIRST','REOPEN')",
    "'launcher-'+$suffix+'-capture.json'",
    "'launch-command.json'",
    '120000,10000,32768',
  ])
    assert.ok(ps.includes(fragment));
  assert.ok(!ps.includes("Node-Control 'prepare-reopen'"));
});
test('recipient workflow uses separate default-off exact branch marker and dual artifact gates', () => {
  const raw = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/phase-02-software.yml'),
    'utf8',
  );
  for (const s of [raw.replace(/\r\n/g, '\n'), raw.replace(/\r?\n/g, '\r\n')]) {
    const normalized = s.replace(/\r\n/g, '\n');
    assert.match(
      normalized,
      /run_recipient_setup:\n\s+description:[^\n]+\n\s+required: false\n\s+type: boolean\n\s+default: false/,
    );
    const job = normalized.split('  owned-recipient-setup-development:')[1];
    assert.ok(job);
    assert.match(
      job,
      /if: \(github.event_name == 'workflow_dispatch' && inputs.run_recipient_setup\) \|\| \(github.event_name == 'push' && github.ref == 'refs\/heads\/phase-02' && contains\(github.event.head_commit.message, '\[recipient-setup\]'\)\)/,
    );
    for (const fragment of [
      'setup-light.png',
      'setup-dark.png',
      "steps.recipient_setup_validation.outputs.written == 'true'",
      "steps.recipient_setup_validation.outputs.images == 'true'",
    ])
      assert.ok(job.includes(fragment));
    assert.ok(!job.includes('Invoke-PlatformToolsVersion'));
    assert.ok(!job.includes('Invoke-PlatformToolsServer'));
  }
});
