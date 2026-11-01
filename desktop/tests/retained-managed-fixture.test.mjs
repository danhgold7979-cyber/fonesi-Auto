// Injected evidence and exact source/materialization checks only. No C# compilation/execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import workflowFixtures from '../verification/workflow-fixture.cjs';
import {
  managedProcessPassed,
  MANAGED_SCOPE,
  MANAGED_MARKER,
} from '../scripts/retained-managed-fixture.mjs';
const runner = readFileSync(
  new URL('../verification/Invoke-RetainedManagedFixture.ps1', import.meta.url),
  'utf8',
);
const fixture = readFileSync(
  new URL('./fixtures/RetainedAdbProtocolFixture.cs', import.meta.url),
  'utf8',
);
const success = () => ({
  status: 'SUCCESS',
  exitCode: 0,
  cleanupComplete: true,
  stdoutTruncated: false,
  stderrTruncated: false,
  stdout: MANAGED_MARKER + '\r\n',
  stderr: '',
});
const before = (text, a, b) => assert.ok(text.indexOf(a) >= 0 && text.indexOf(a) < text.indexOf(b));
test('managed evidence requires exact nineteen-group marker, actual zero exit and retirement', () => {
  assert.equal(managedProcessPassed(success(), true), true);
  assert.equal(managedProcessPassed({ ...success(), stdout: MANAGED_MARKER + '\n' }, true), true);
  for (const patch of [
    { status: 'EMPTY_OUTPUT' },
    { exitCode: null },
    { exitCode: 1 },
    { cleanupComplete: false },
    { stdoutTruncated: true },
    { stderrTruncated: true },
    { stdout: 'RETAINED_MANAGED_GROUPS_8\n' },
    { stdout: 'RETAINED_MANAGED_GROUPS_10\n' },
    { stdout: MANAGED_MARKER },
    { stdout: MANAGED_MARKER + '\n\n' },
    { stdout: 'private-canary\n' + MANAGED_MARKER + '\n' },
    { stderr: 'private-canary' },
  ])
    assert.equal(managedProcessPassed({ ...success(), ...patch }, true), false);
  assert.equal(
    managedProcessPassed({ ...success(), status: 'EMPTY_OUTPUT', stdout: '' }, false),
    true,
  );
  assert.equal(managedProcessPassed({ ...success(), stdout: 'x'.repeat(32769) }, false), false);
  let called = 0;
  const bad = success();
  Object.defineProperty(bad, 'stdout', {
    get() {
      called++;
      return MANAGED_MARKER + '\n';
    },
  });
  assert.equal(managedProcessPassed(bad, true), false);
  assert.equal(called, 0);
});
test('generated fixed entry calls only the unchanged managed fixture and demands eight protocol, two version and nine server groups', () => {
  const entry = /\$entry=@'\n([\s\S]*?)\n'@/.exec(runner)?.[1];
  assert.ok(entry);
  assert.match(
    entry,
    /args\.Length != 0 \|\| Fonesi\.Tests\.RetainedAdbProtocolFixture\.RunAll\(\) != 8/,
  );
  assert.match(entry, /RunVersionExpectations\(\) != 2/);
  assert.match(entry, /RunServer\(\) != 9/);
  assert.match(entry, /Console\.Out\.WriteLine\("RETAINED_MANAGED_GROUPS_19"\)/);
  assert.match(
    entry,
    /catch \{ Console\.Error\.WriteLine\("RETAINED_MANAGED_FIXTURE_FAILED"\); return 1;/,
  );
  assert.doesNotMatch(
    entry,
    /NativeProvider|RetainedProvider|OpenParentAdmission|Process\.Start|StartForeground|\.dll|Assembly\.Load/,
  );
  assert.equal((fixture.match(/passed\+\+;/g) || []).length, 8);
  assert.doesNotMatch(fixture, /new IsolatedAdbServer|new RetainedProvider|NativeProvider\(/);
  assert.match(fixture, /sealed class Provider : RetainedAdbProtocol\.IProvider/);
});
test('fixed four-source compilation and managed execution use unchanged suspended Job supervisor', () => {
  const names = [
    'IsolatedAdbServer.cs',
    'RetainedAdbSession.cs',
    'RetainedAdbProtocol.cs',
    'RetainedHostAdmission.cs',
  ];
  for (const name of names) assert.ok(runner.includes("'native/" + name + "'"));
  assert.match(runner, /tests\/fixtures\/RetainedAdbProtocolFixture\.cs/);
  assert.match(
    runner,
    /\[Fonesi\.Phase00\.NativeProbe\]::Run\(\$exe,\$arguments,\$deadline,10000,32768\)/,
  );
  assert.match(runner, /Run-Fixed \$compiler \(\[string\[\]\]\$compilerArgs\) 30000/);
  assert.match(runner, /Run-Fixed \$output \(\[string\[\]\]@\(\)\) 120000/);
  assert.match(
    runner,
    /'\/noconfig','\/nologo','\/nostdlib\+','\/target:exe','\/optimize\+','\/debug-','\/langversion:5','\/main:ManagedFixtureEntry'/,
  );
  assert.doesNotMatch(
    runner,
    /Start-Process|Invoke-Expression|Add-Type -Path \$sources|adb\.exe|kill-server|start-server/,
  );
  const helper = readFileSync(new URL('../../tools/phase-00/HostProbeNative.cs', import.meta.url));
  assert.ok(runner.includes(createHash('sha256').update(helper).digest('hex')));
  assert.ok(runner.includes(MANAGED_SCOPE));
  before(runner, "$stage='COMPILE'", "$stage='FIXTURE'");
  before(runner, '$assemblyHash=', "$stage='FIXTURE'");
});
test('admission, source rechecks and unknown retirement preserve owned output without raw diagnostics', () => {
  assert.match(runner, /\$script:retired=\$false\s+\$p=\[Fonesi/);
  assert.match(runner, /if\(\$null -ne \$owner -and \$retired\)/);
  assert.match(runner, /Get-BoundedOwnedEntries \$owner.Path 8396800/);
  assert.match(runner, /@\('\.owner','entry.cs','fixture.exe'\)/);
  assert.match(runner, /Remove-VerifiedOwnedRun \$owner \$retired/);
  assert.match(runner, /\[IO.FileMode\]::CreateNew/);
  assert.match(runner, /\$s.Flush\(\$true\)/);
  assert.match(runner, /foreach\(\$p in \$bound\).*SOURCE_CHANGED/s);
  assert.match(runner, /\$report.sourceUnchanged=\$true/);
  assert.doesNotMatch(
    runner,
    /Write-Output \$compilerText|Write-Output \$p\.(Stdout|Stderr)|Write-Output \$_/,
  );
  assert.match(runner, /RETAINED_MANAGED_FIXTURE_PASS/);
  const old = readFileSync(
    new URL('../scripts/compile-retained-helper.mjs', import.meta.url),
    'utf8',
  );
  assert.match(old, /RETAINED_HELPER_COMPILE_ONLY_PASS/);
  assert.doesNotMatch(old, /RetainedAdbProtocolFixture|RETAINED_MANAGED_GROUPS/);
});

const workflow = readFileSync(
  new URL('../../.github/workflows/phase-02-software.yml', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');
const serverGate =
  "    if: github.ref == 'refs/heads/phase-02' && ((github.event_name == 'workflow_dispatch' && inputs.run_server_managed == true) || (github.event_name == 'push' && contains(github.event.head_commit.message, '[server-managed]')))";
function managedOnlyJob(raw) {
  const text = raw.replaceAll('\r\n', '\n');
  assert.match(
    text,
    / {6}run_server_managed:\n {8}description: '[^\n]+'\n {8}required: false\n {8}type: boolean\n {8}default: false\n/,
  );
  const job = text
    .split('  owned-server-managed-development:\n')[1]
    ?.split(/\n {2}[a-z][a-z0-9-]*:\n/)[0];
  assert.ok(job);
  assert.ok(job.includes('\n' + serverGate + '\n'));
  assert.match(job, / {4}needs: windows-software-only\n/);
  assert.match(job, /timeout-minutes: 15\n/);
  return job;
}
test('managed-only gate is phase-bound explicit opt-in with LF/CRLF and rejects broadened or absent gates', () => {
  const { workflowEncodings: encodings } = workflowFixtures;
  assert.deepEqual(encodings(workflow), encodings(workflow.replaceAll('\n', '\r\n')));
  for (const text of encodings(workflow.replaceAll('\n', '\r\n'))) {
    managedOnlyJob(text);
    for (const replacement of [
      '    if: true',
      '',
      serverGate.replace('refs/heads/phase-02', 'refs/heads/main'),
      serverGate.replace('[server-managed]', '[retained-rollback]'),
      serverGate.replace('inputs.run_server_managed == true', 'inputs.run_adb_server == true'),
    ]) {
      const changed = text.replaceAll('\r\n', '\n').replace(serverGate, replacement);
      assert.notEqual(changed, text.replaceAll('\r\n', '\n'));
      assert.throws(() => managedOnlyJob(changed));
    }
    const changedDefault = text.replace('        default: false', '        default: true');
    assert.notEqual(changedDefault, text);
    assert.throws(() => managedOnlyJob(changedDefault));
  }
});
test('managed-only job has no native campaign or archive actions and publishes only strict version3 JSON', () => {
  const job = managedOnlyJob(workflow);
  assert.match(job, /Invoke-RetainedManagedFixture\.ps1\)/);
  assert.match(job, /validate_retained_host\.py managed-server 2>&1/);
  assert.match(job, /steps\.retained_managed_validation\.outputs\.written == 'true'/);
  assert.equal((job.match(/uses: actions\/upload-artifact@/g) || []).length, 1);
  assert.match(job, /path: desktop\/retained-managed-validated\.json\n/);
  assert.doesNotMatch(
    job,
    /fetch-retained|install-electron|build-package|Invoke-RetainedRollback|Invoke-RetainedHostCheck|Invoke-Isolated|adb\.exe|\.zip|\.png|include-hidden-files/,
  );
  const old = workflow
    .replaceAll('\r\n', '\n')
    .split('  owned-retained-rollback-development:\n')[1]
    .split(/\n {2}[a-z][a-z0-9-]*:\n/)[0];
  assert.match(old, /\n {4}if: false && /);
});
