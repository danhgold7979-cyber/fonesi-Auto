import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import workflowFixture from '../verification/workflow-fixture.cjs';
const { workflowEncodings } = workflowFixture;
const raw = readFileSync(
  new URL('../../.github/workflows/phase-02-software.yml', import.meta.url),
  'utf8',
);
const nativeNames = [
  'owned-adb-version-development',
  'owned-fleet-ui-development',
  'owned-recipient-setup-development',
  'owned-retained-version-development',
  'owned-main-version-development',
  'owned-package-version-development',
  'owned-retained-rollback-development',
  'owned-discovery-managed-development',
  'owned-metadata-managed-development',
  'owned-input-managed-development',
  'owned-video-managed-development',
  'derived-pair-compile-development',
];
const marker = `          if ($env:GITHUB_REF -eq 'refs/heads/phase-03') {
            Write-Output 'PHASE03_SOFTWARE_ONLY'
          } else {
            Write-Output 'PHASE02_SOFTWARE_ONLY'
          }`;
function validate(rawSource) {
  const source = rawSource.replaceAll('\r\n', '\n');
  assert.ok(source.startsWith('name: Phase 02–03 software and gated development boundaries\n'));
  assert.match(source, / {2}push:\n {4}branches: \[phase-02, phase-03\]\n {4}paths:/);
  assert.match(source, /permissions:\n {2}contents: read\njobs:/);
  const jobs = [...source.matchAll(/^ {2}([a-z][a-z0-9-]+):\n/gm)].filter(
    (match) => match.index > source.indexOf('\njobs:\n'),
  );
  assert.deepEqual(
    jobs.map((match) => match[1]),
    ['windows-software-only', ...nativeNames],
  );
  const first = source.slice(jobs[0].index, jobs[1].index);
  assert.match(first, /runs-on: windows-2022\n {4}timeout-minutes: 10/);
  for (const literal of [
    'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
    'persist-credentials: false',
    'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
    "node-version: '24.22.1'",
    'package-manager-cache: false',
    'node desktop/scripts/check.mjs --restore',
    'node foundation/scripts/verify-bootstrap.mjs $npmVersion',
    'npm --prefix foundation ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache=.npm-cache',
    'node foundation/scripts/check.mjs $npmVersion',
    "discover('desktop/verification',pattern='test_*.py'); assert s.countTestCases()==330;",
    'r.wasSuccessful() and not r.skipped',
    marker,
    "Write-Output 'SOURCE_JOB_NO_ADB_EXECUTION'",
    "Write-Output 'DEVICE_HARDWARE_NOT_RUN'",
  ])
    assert.ok(first.includes(literal), literal);
  assert.match(first, /if: false && \(github.ref == 'refs\/heads\/phase-02'/);
  assert.doesNotMatch(first, /Invoke-PlatformTools|fetch_platform_tools|Invoke-RetainedHost/);
  for (let i = 1; i < jobs.length; i++) {
    const body = source.slice(jobs[i].index, jobs[i + 1]?.index ?? source.length);
    const conditions = [...body.matchAll(/^ {4}if: (.+)$/gm)];
    assert.equal(conditions.length, 1);
    const condition = conditions[0][1];
    if (jobs[i][1] === 'owned-adb-version-development') {
      assert.equal(
        condition,
        "github.ref == 'refs/heads/phase-02' && github.event_name == 'workflow_dispatch' && (inputs.run_adb_version || inputs.run_adb_server)",
      );
    } else if (jobs[i][1] === 'owned-video-managed-development') {
      assert.equal(
        condition,
        "github.ref == 'refs/heads/phase-03' && ((github.event_name == 'workflow_dispatch' && inputs.run_video_managed == true) || (github.event_name == 'push' && contains(github.event.head_commit.message, '[video-managed]')))",
      );
      assert.match(body, / {4}needs: windows-software-only\n/);
    } else if (jobs[i][1] === 'derived-pair-compile-development') {
      assert.equal(
        condition,
        "github.ref == 'refs/heads/phase-03' && ((github.event_name == 'workflow_dispatch' && inputs.run_pair_build == true) || (github.event_name == 'push' && contains(github.event.head_commit.message, '[pair-build]')))",
      );
      assert.match(body, / {4}needs: windows-software-only\n/);
      assert.match(
        source,
        / {6}run_pair_build:\n {8}description: [^\n]+\n {8}required: false\n {8}type: boolean\n {8}default: false\n/,
      );
    } else assert.ok(condition.startsWith('false && '));
  }
}
test('phase03 reuses pinned source gates with only explicit managed-video and compile-pair opt-ins on that branch', () => {
  for (const source of workflowEncodings(raw)) validate(source);
});
test('phase source workflow rejects branch, native authority, marker and gate drift under LF and CRLF', () => {
  for (const source of workflowEncodings(raw)) {
    const normalized = source.replaceAll('\r\n', '\n');
    const pairInput = normalized.match(
      / {6}run_pair_build:\n(?: {8}[^\n]+\n)*? {8}default: false\n/,
    )?.[0];
    assert.ok(pairInput);
    const enabledPairInput = pairInput.replace('        default: false', '        default: true');
    const enabledPair = normalized.replace(pairInput, enabledPairInput);
    assert.equal(enabledPair.replace(enabledPairInput, pairInput), normalized);
    const mutants = [
      normalized.replace('branches: [phase-02, phase-03]', 'branches: [phase-02]'),
      normalized.replace('inputs.run_pair_build == true', 'inputs.run_pair_build != true'),
      normalized.replace("'[pair-build]'", "'[video-managed]'"),
      normalized.replace(
        '  derived-pair-compile-development:\n    needs: windows-software-only',
        '  derived-pair-compile-development:\n    needs: nonexistent',
      ),
      enabledPair,
      normalized.replace(
        "if: github.ref == 'refs/heads/phase-02' && github.event_name",
        'if: github.event_name',
      ),
      normalized.replace('if: false && (', 'if: true || ('),
      normalized.replace(
        "if: false && ((github.event_name == 'workflow_dispatch' && inputs.run_fleet_ui)",
        "if: true || ((github.event_name == 'workflow_dispatch' && inputs.run_fleet_ui)",
      ),
      normalized.replace('PHASE03_SOFTWARE_ONLY', 'PHASE02_SOFTWARE_ONLY'),
      normalized.replace('s.countTestCases()==330', 's.countTestCases()==289'),
      normalized.replace('r.wasSuccessful() and not r.skipped', 'r.wasSuccessful()'),
      normalized.replace('node desktop/scripts/check.mjs --restore', 'echo bypass'),
      normalized.replace("node-version: '24.22.1'", "node-version: 'latest'"),
      normalized.replace('  owned-fleet-ui-development:\n', '  unknown-native:\n'),
    ];
    for (const mutant of mutants) {
      assert.notEqual(mutant, normalized);
      for (const encoding of workflowEncodings(mutant)) assert.throws(() => validate(encoding));
    }
  }
});
