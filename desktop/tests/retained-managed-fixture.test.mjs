// Injected evidence and exact source/materialization checks only. No C# compilation/execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
test('managed evidence requires exact ten-group marker, actual zero exit and retirement', () => {
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
test('generated fixed entry calls only the unchanged managed fixture and demands eight protocol and two version groups', () => {
  const entry = /\$entry=@'\n([\s\S]*?)\n'@/.exec(runner)?.[1];
  assert.ok(entry);
  assert.match(
    entry,
    /args\.Length != 0 \|\| Fonesi\.Tests\.RetainedAdbProtocolFixture\.RunAll\(\) != 8/,
  );
  assert.match(entry, /RunVersionExpectations\(\) != 2/);
  assert.match(entry, /Console\.Out\.WriteLine\("RETAINED_MANAGED_GROUPS_10"\)/);
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
