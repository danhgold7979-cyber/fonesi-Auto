// Source-only runner composition. Does not execute PowerShell, Windows payloads or downloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { workflowEncodings } = require('../verification/workflow-fixture.cjs');
const source = readFileSync(
  new URL('../verification/Invoke-RetainedPairPackage.ps1', import.meta.url),
  'utf8',
);
const workflow = readFileSync(
  new URL('../../.github/workflows/phase-02-software.yml', import.meta.url),
  'utf8',
);
function before(a, b, value = source) {
  assert.ok(value.indexOf(a) >= 0 && value.indexOf(b) > value.indexOf(a));
}
function gate(raw) {
  const text = workflowEncodings(raw)[0];
  assert.match(
    text,
    /run_pair_package_check:\n {8}description: '[^\n]+'\n {8}required: false\n {8}type: boolean\n {8}default: false/,
  );
  const job = text.split('  retained-pair-package-check-development:\n')[1];
  assert.ok(job);
  assert.match(job, /needs: windows-software-only/);
  assert.match(
    job,
    /if: github.ref == 'refs\/heads\/phase-03' && \(\(github.event_name == 'workflow_dispatch' && inputs.run_pair_package_check == true\) \|\| \(github.event_name == 'push' && contains\(github.event.head_commit.message, '\[pair-package-check\]'\)\)\)/,
  );
  assert.match(job, /permissions:\n {6}contents: read\n {6}actions: read/);
  assert.match(job, /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/);
  assert.match(
    job,
    /repository: danhgold7979-cyber\/fonesi-Auto\n {10}run-id: '41427976617'\n {10}artifact-ids: '13132988023'/,
  );
  assert.match(job, /path: desktop\/\.retained-pair-package-input/);
  assert.match(job, /if: success\(\) && steps.package_check.outputs.passed == 'true'/);
  assert.match(job, /path: desktop\/\.retained-pair-package-check\/report.json/);
  assert.match(job, /retention-days: 14/);
  assert.doesNotMatch(
    job,
    /Invoke-Package.ps1|Invoke-RetainedHostCheck|platform.tools|always\(\)|path:.*\*|contents: write|actions: write/,
  );
  return job;
}
test('package-only wrapper preserves no-execution boundary and fixed owned controller', () => {
  assert.match(source, /param\(\)/);
  assert.match(source, /retained-pair-package-control.mjs/);
  assert.doesNotMatch(
    source,
    /Invoke-Package.ps1|Invoke-RetainedHostCheck|Launch.ps1|Assembly\]::Load|Remove-Item|-Recurse/,
  );
  for (const literal of [
    "'install-electron.mjs'",
    "'attest-runtime'",
    "'prepare'",
    "'build'",
    "'cleanup'",
  ])
    assert.ok(source.includes(literal));
  assert.match(source, /NativeProbe\]::ReserveDirectory\(\$base\)/);
  assert.match(source, /NativeProbe\]::ReserveDirectory\(\$root\)/);
  assert.match(source, /Token=\[guid\]::NewGuid\(\).ToString\(\)/);
  assert.doesNotMatch(source, /Remove-VerifiedOwnedRun/);
});
test('one original deadline supervises five stages and excludes token inheritance', () => {
  assert.equal((source.match(/Stopwatch\]::StartNew/g) || []).length, 1);
  before('$clock=', "RunStage 'ELECTRON'");
  before("RunStage 'PREPARE'", "RunStage 'ELECTRON'");
  assert.match(
    source,
    /\$end=if\(\$cleanup\)\{300000\}else\{290000\};\$remaining=\$end-\$script:clock.ElapsedMilliseconds/,
  );
  assert.match(source, /\[Math\]::Min\(120000,\$remaining\)/);
  assert.match(source, /\$script:allRetired=Retired \$p/);
  const stage = source.split('function RunStage(')[1].split('\ntry{')[0];
  assert.doesNotMatch(stage, /GITHUB_TOKEN|github.token|FONESI_AUTO|GITHUB_SHA/);
  assert.match(stage, /SetEnvironmentVariable\(\[string\]\$key,\$null/);
  assert.match(source, /PREPARE,ELECTRON,ATTEST,BUILD,CLEANUP/);
});
test('immutable result is captured before cleanup and report follows real retirement and absence', () => {
  before("ReadText (Join-Path $root 'build-result.json') 8192", "RunStage 'CLEANUP'");
  before("RunStage 'CLEANUP'", '$report=[ordered]@');
  before("WriteNew (Join-Path $base 'report.json')", '$passed=$true');
  assert.match(source, /ItemNotFoundException/);
  assert.match(source, /ReadText \(Join-Path \$base 'report.json'\) 8192\) -cne \$reportText/);
  assert.match(source, /\$result.packageFiles -gt 511/);
  assert.match(source, /\$result.\$key -gt 671088640/);
  assert.match(source, /\$result.packageVerified -isnot \[bool\]/);
  assert.match(source, /\$result.\$key -isnot \[int\] -and \$result.\$key -isnot \[long\]/);
  assert.match(source, /\$p.Stderr -ceq ''/);
});
test('fixed source artifact and Node license acquisition are bounded and no payload is launched', () => {
  const job = gate(workflow);
  assert.match(job, /node-version: '24.22.1'/);
  assert.match(job, /ci --ignore-scripts/);
  assert.match(job, /https:\/\/raw.githubusercontent.com\/nodejs\/node\/v24.22.1\/LICENSE/);
  assert.match(job, /AllowAutoRedirect=\$false/);
  assert.match(job, /\$total -gt 1048576/);
  assert.match(job, /FileMode\]::CreateNew/);
  assert.match(job, /5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace/);
  assert.match(job, /\$code -ne 0 -or \$lines.Count -ne 1/);
  assert.match(job, /\$file.Length -gt 8192/);
});
test('workflow gate survives LF and CRLF and rejects broad authority or uploads', () => {
  for (const text of workflowEncodings(workflow)) gate(text);
  const text = workflowEncodings(workflow)[0],
    job = gate(text);
  for (const mutated of [
    job.replace('refs/heads/phase-03', 'refs/heads/main'),
    job.replace('needs: windows-software-only', 'needs: other'),
    job.replace("artifact-ids: '13132988023'", "artifact-ids: 'other'"),
    job.replace('actions: read', 'actions: write'),
    job.replace('if: success()', 'if: always()'),
    job.replace(
      'path: desktop/.retained-pair-package-check/report.json',
      'path: desktop/.retained-pair-package-check/**',
    ),
  ])
    assert.throws(() => gate(text.replace(job, mutated)));
  assert.throws(() =>
    gate(text.replace(/(run_pair_package_check:\n[\s\S]*?default:) false/, '$1 true')),
  );
});
test('closed failure diagnostics never forward paths or raw errors', () => {
  const job = gate(workflow),
    pattern = job.match(/-cmatch '(\^RETAINED_PAIR_PACKAGE_[^']+)'/)[1],
    re = new RegExp(pattern);
  for (const phase of [
    'ADMISSION',
    'ARTIFACT',
    'NODE_LICENSE',
    'ELECTRON',
    'ATTEST',
    'CANDIDATE',
    'BUILD',
    'VERIFY',
    'CLEANUP',
    'REPORT',
  ])
    assert.ok(re.test(`RETAINED_PAIR_PACKAGE_STAGE_${phase}`));
  for (const raw of [
    'RETAINED_PAIR_PACKAGE_STAGE_OTHER',
    'C:\\private',
    'RETAINED_PAIR_PACKAGE_PASS\nraw',
  ])
    assert.ok(!re.test(raw));
  assert.doesNotMatch(source, /Write-Output \$_|Write-Output \$p.Stdout|Write-Output.*Exception/);
});

test('original prepare bytes and successful build result remain bound through cleanup (source/model)', () => {
  before("RunStage 'PREPARE'", '$preparedPrivateText=ReadText');
  before('$preparedPrivateText=ReadText', "RunStage 'ELECTRON'");
  assert.match(source, /\$phase='BUILD';Assert-PreparedCapture;RunStage/);
  assert.match(source, /\$phase='VERIFY';Assert-PreparedCapture;/);
  assert.match(source, /\$phase='CLEANUP';Assert-PreparedCapture/);
  assert.match(source, /'private.json'\) 1048576\) -cne \$script:preparedPrivateText/);
  assert.match(source, /'context.json'\) 8192\) -cne \$script:preparedContextText/);
  before('$cleanupSealText=ReadText', "RunStage 'CLEANUP'");
  assert.match(source, /\$resultRows\[0\].sha256 -cne \$resultDigest/);
  assert.match(source, /'cleanup.json'\) 1048576\) -cne \$cleanupSealText/);
  assert.match(source, /'build-result.json'\) 8192\) -cne \$resultText/);
  const saved = JSON.stringify({ ownership: ['original'], result: 'a'.repeat(64) });
  assert.notEqual(JSON.stringify({ ownership: ['replacement'], result: 'b'.repeat(64) }), saved);
  // Model is not a claim of PowerShell execution; static assertions bind the actual checkpoints.
});
test('workflow reads a bounded held report twice and requires exact provenance pins', () => {
  const job = gate(workflow);
  assert.doesNotMatch(job, /ReadAllText/);
  assert.match(job, /\$length -gt 8192/);
  assert.match(job, /New-Object byte\[\] 8193/);
  assert.match(job, /\$stream.Read\(\$buffer,\$count,\$buffer.Length-\$count\)/);
  assert.match(job, /\$stream.Length -ne \$length/);
  assert.match(job, /if\(\(Read-PackageReport\) -cne \$raw\)/);
  const pins = source.match(/\$pins=@\{([^\n]+)\}/)[1];
  assert.ok(job.includes(`$pins=@{${pins}}`));
  assert.match(job, /foreach\(\$key in \$pins.Keys\)\{if\(\$report.\$key -cne \$pins\[\$key\]\)/);
});
