// Source-static assertions only; no Windows, compiler, retained binary or device execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { workflowEncodings } = require('../verification/workflow-fixture.cjs');
const source = readFileSync(
  new URL('../verification/Invoke-DerivedPairBuild.ps1', import.meta.url),
  'utf8',
);
const workflow = readFileSync(
  new URL('../../.github/workflows/phase-02-software.yml', import.meta.url),
  'utf8',
);
function before(a, b, text = source) {
  assert.ok(text.indexOf(a) >= 0 && text.indexOf(b) > text.indexOf(a), `${a} precedes ${b}`);
}
function gate(raw) {
  const text = workflowEncodings(raw)[0];
  assert.match(
    text,
    /run_pair_retention:\n {8}description: '[^\n]+'\n {8}required: false\n {8}type: boolean\n {8}default: false/,
  );
  const job = text
    .split('  derived-pair-retained-evidence-development:\n')[1]
    ?.split(/\n {2}[a-z][a-z0-9-]*:\n/)[0];
  assert.ok(job);
  assert.match(job, /needs: windows-software-only/);
  assert.match(
    job,
    /if: github.ref == 'refs\/heads\/phase-03' && \(\(github.event_name == 'workflow_dispatch' && inputs.run_pair_retention == true\) \|\| \(github.event_name == 'push' && contains\(github.event.head_commit.message, '\[pair-retain\]'\)\)\)/,
  );
  assert.match(job, /-PythonPath \$env:FOUNDATION_PYTHON_EXE -RetainEvidence/);
  assert.match(job, /if: success\(\) && steps.pair_retention.outputs.passed == 'true'/);
  assert.match(job, /path: desktop\/\.derived-pair-build-runtime\/retained-upload\//);
  assert.match(job, /retention-days: 14/);
  assert.match(job, /\$code -ne 0.*DERIVED_PAIR_RETENTION_WRITTEN.*DERIVED_PAIR_RETENTION_PASS/);
  assert.doesNotMatch(job, /always\(\)|sdkmanager|setup-java|setup-node|npm |upload\/\*|Release/);
  return job;
}
test('retention is explicit and default compile-only cleanup and result remain intact', () => {
  assert.match(source, /\[switch\]\$RetainEvidence/);
  assert.match(source, /if\(\$ArchivePath\)\{throw 'RETENTION_ARCHIVE_REJECTED'\}/);
  assert.match(source, /else\{Remove-VerifiedOwnedRun \$owner \$allRetired\}/);
  assert.match(source, /if\(\$published\)\{Write-Output 'DERIVED_PAIR_VALIDATION_PASS';exit 0\}/);
  assert.equal((source.match(/Stopwatch\]::StartNew\(\)/g) || []).length, 1);
  before('$original=', '$clock=');
  before("JsonNew (Join-Path $base 'retention-context.json')", "@('acquire',$root)");
});
test('copy and independent staging precede cleanup; marker-last removal is independent', () => {
  before(
    "RetentionPython $retentionProducer 'stage'",
    "RetentionPython $retentionValidator 'stage'",
  );
  before("RetentionPython $retentionValidator 'stage'", "@('cleanup',$owner.Path)");
  before("@('cleanup',$owner.Path)", "RetentionPython $retentionValidator 'cleanup'");
  before(
    "RetentionPython $retentionValidator 'publish'",
    'RetentionReadback;$retentionPublished=$true',
  );
  before(
    'RetentionReadback;$retentionPublished=$true',
    "Write-Output 'DERIVED_PAIR_RETENTION_WRITTEN'",
  );
  assert.match(source, /\$retentionPublished -and \$published -and \$allRetired/);
});
test('retired publisher readback binds all 31 paths, current run and owner, hashes and absence', () => {
  const body = source.split('function RetentionReadback {')[1].split('function Property(')[0];
  const caps = [
    ...body
      .split('$caps=[ordered]@{')[1]
      .split('\n }')[0]
      .matchAll(/'([^']+)'=(\d+)/g),
  ];
  assert.equal(caps.length, 30);
  assert.equal(new Set(caps.map((m) => m[1])).size, 30);
  assert.match(body, /\$files.Count -ne 31/);
  assert.match(body, /Get-BoundedOwnedEntries \$folder 67108864/);
  assert.match(body, /\[Array\]::Sort\(\$names,\[StringComparer\]::Ordinal\)/);
  assert.match(body, /\$receiptText -cne \$script:expectedRetentionReceiptText/);
  assert.match(body, /\$receipt=\$script:expectedRetentionReceipt/);
  assert.match(
    source,
    /githubRunId=\$retentionContext.githubRunId;githubRunAttempt=\$retentionContext.githubRunAttempt;autoSourceCommit=\$context.autoCommit;autoSourceTree=\$context.autoTree/,
  );
  assert.doesNotMatch(body, /ComputeHash\(\$stream\)/);
  assert.match(body, /\$stream.Length -ne \$length/);
  assert.match(body, /Assert-OwnedRun \$script:baseOwner;Assert-ScratchAbsent/);
  assert.match(body, /ElapsedMilliseconds -ge 300000/);
  assert.doesNotMatch(body, /Invoke-Expression|Assembly.*Load|Start-Process/);
});
test('retention diagnostics accept one closed bound frame and never raw child text', () => {
  const body = source
    .split('function RetentionPython(')[1]
    .split('function Assert-ScratchAbsent')[0];
  const pattern = body
    .match(/\$pattern='([^']+)'/)[1]
    .replace('\\A', '^')
    .replace('\\z', '$(?![\\s\\S])');
  const re = new RegExp(pattern);
  assert.ok(
    re.test('DERIVED_PAIR_RETENTION_DIAG|COPY|SOURCE|HASH\nDERIVED_PAIR_RETENTION_FAILED\n'),
  );
  for (const raw of [
    'DERIVED_PAIR_RETENTION_DIAG|OTHER|SOURCE|HASH\nDERIVED_PAIR_RETENTION_FAILED\n',
    'DERIVED_PAIR_RETENTION_DIAG|COPY|SOURCE|C:\\private\nDERIVED_PAIR_RETENTION_FAILED\n',
    'extra\nDERIVED_PAIR_RETENTION_DIAG|COPY|SOURCE|HASH\nDERIVED_PAIR_RETENTION_FAILED\n',
  ])
    assert.ok(!re.test(raw));
  for (const guard of [
    '(Retired $p)',
    '$p.ExitCode -eq 1',
    '-not $p.StdoutTruncated',
    '-not $p.StderrTruncated',
    "$p.Stderr -ceq ''",
    '$raw.Length -le 256',
    '$m.Groups[1].Value -ceq $action',
  ])
    assert.ok(body.includes(guard));
  assert.doesNotMatch(body, /Write-Output \$raw|Write-Output \$p/);
});
test('retention workflow is source-gated, opt-in, fixed packet only in LF and CRLF', () => {
  for (const encoding of workflowEncodings(workflow)) gate(encoding);
  for (const encoding of workflowEncodings(workflowEncodings(workflow)[1])) gate(encoding);
});
test('retention workflow refuses disabled-gate, branch, premature and broad upload mutations', () => {
  const text = workflowEncodings(workflow)[0];
  const job = gate(text);
  for (const changed of [
    job.replace('refs/heads/phase-03', 'refs/heads/main'),
    job.replace('needs: windows-software-only', 'needs: other'),
    job.replace('if: success()', 'if: always()'),
    job.replace('retained-upload/', '**'),
    job.replace('retention-days: 14', 'retention-days: 90'),
    job.replace('$code -ne 0', '$code -eq 0'),
  ])
    assert.throws(() => gate(text.replace(job, changed)));
  assert.throws(() =>
    gate(text.replace(/(run_pair_retention:\n[\s\S]*?default:) false/, '$1 true')),
  );
});

test('original staged rows and retired final report defeat coherent replacement and coercion (source plus model)', () => {
  before('$retentionBinding=$retentionBindingText|ConvertFrom-Json', "@('cleanup',$owner.Path)");
  before('$retentionFinalReportText=ReadText', "RetentionPython $retentionValidator 'publish'");
  before(
    '$expectedRetentionReceiptText=$expectedRetentionReceipt|ConvertTo-Json',
    "RetentionPython $retentionValidator 'publish'",
  );
  assert.match(source, /foreach\(\$row in \$retentionBinding.files\)/);
  assert.match(
    source,
    /\$expectedRows\['build\/report.json'\]=\[pscustomobject\]\[ordered\]@\{path='build\/report.json';bytes=\$reportBytes.Length;sha256=\$reportDigest\}/,
  );
  assert.match(source, /\$row=\$receipt.files\[\$i\]/);
  const saved = Object.freeze({
    version: 1,
    files: [Object.freeze({ path: 'payload/server.jar', bytes: 7, sha256: 'a'.repeat(64) })],
  });
  const expected = JSON.stringify(saved);
  const coherentReplacement = {
    version: 1,
    files: [{ path: 'payload/server.jar', bytes: 7, sha256: 'b'.repeat(64) }],
  };
  assert.notEqual(JSON.stringify(coherentReplacement), expected);
  assert.notEqual(JSON.stringify({ ...saved, version: '1' }), expected);
  assert.notEqual(
    JSON.stringify({ ...saved, files: [{ ...saved.files[0], bytes: '7' }] }),
    expected,
  );
  // The assertions above bind this finite model to the actual exact-byte comparison, not PS execution.
  assert.match(
    source,
    /\(ReadText \(Join-Path \$folder 'retention-receipt.json'\) 65536\) -cne \$script:expectedRetentionReceiptText/,
  );
});
test('opened length and each bounded chunk remain under the original deadline (source plus model)', () => {
  const body = source.split('function RetentionReadback {')[1].split('function Property(')[0];
  before('$length=$stream.Length', '$stream.Read(', body);
  before(
    'if($length -lt 1 -or $length -gt $caps[$name] -or $length -ne $row.bytes)',
    '$stream.Read(',
    body,
  );
  before(
    "if($script:clock.ElapsedMilliseconds -ge 300000){throw 'RETENTION_DEADLINE'}",
    '$stream.Read(',
    body.split('while($read -lt $length){')[1],
  );
  assert.match(body, /New-Object byte\[\] 65536/);
  assert.match(body, /\[Math\]::Min\(\$buffer.Length,\$length-\$read\)/);
  assert.match(body, /\$finalInventory=Get-BoundedOwnedEntries/);
  assert.match(body, /\$finalInventory.Entries.Count -ne \$inventory.Entries.Count/);
  let reads = 0;
  function bounded(opened, cap, expected, clock) {
    if (opened < 1 || opened > cap || opened !== expected) throw Error('LENGTH');
    for (let offset = 0; offset < opened; offset += 65536) {
      if (clock() >= 300000) throw Error('DEADLINE');
      reads++;
    }
  }
  assert.throws(() => bounded(8388609, 8388608, 7, () => 0), /LENGTH/);
  assert.equal(reads, 0);
  assert.throws(() => bounded(7, 8388608, 7, () => 300000), /DEADLINE/);
  assert.equal(reads, 0);
  let ticks = 0;
  assert.throws(
    () => bounded(131072, 8388608, 131072, () => (ticks++ ? 300000 : 299999)),
    /DEADLINE/,
  );
  assert.equal(reads, 1);
});

test('reconstructed receipt rows preserve note-property shape and checkpoints stay finite (source only)', () => {
  for (const target of ['$expectedRows[$row.path]', "$expectedRows['build/report.json']"]) {
    assert.ok(source.includes(`${target}=[pscustomobject][ordered]@{`));
    assert.ok(!source.includes(`${target}=[ordered]@{`));
  }
  const boundary = readFileSync(
    new URL('../verification/WindowsBoundary.psm1', import.meta.url),
    'utf8',
  );
  assert.match(
    boundary,
    /return \[pscustomobject\]@\{ Entries=\$entries.ToArray\(\); Bytes=\$bytes \}/,
  );
  const job = gate(workflow);
  const pattern = job
    .match(/-cmatch '([^']+)'/g)
    .find((text) => text.includes('RETENTION_WRAPPER_'))
    .slice(9, -1);
  const diagnostic = new RegExp(pattern);
  for (const step of [
    'CAPTURE_REPORT',
    'EXPECTED_RECEIPT',
    'PUBLISH',
    'ADMISSION',
    'INVENTORY',
    'RECEIPT',
    'FILE_HASH',
    'FINAL_BINDING',
  ]) {
    assert.ok(diagnostic.test(`DERIVED_PAIR_RETENTION_WRAPPER_${step}`));
    assert.ok(source.includes(`retentionWrapperStep='${step}'`));
  }
  for (const value of ['UNKNOWN', 'C:\\private', 'FILE_HASH\nraw'])
    assert.ok(!diagnostic.test(`DERIVED_PAIR_RETENTION_WRAPPER_${value}`));
  assert.match(
    source,
    /Write-Output \('DERIVED_PAIR_RETENTION_WRAPPER_'\+\$retentionWrapperStep\)/,
  );
  assert.doesNotMatch(source, /Write-Output.*Exception|Write-Output \$_/);
});

test('retention assertions stop at the next top-level job, not unrelated package prerequisites', () => {
  const selected = gate(workflow);
  assert.ok(!selected.includes('retained-pair-package-check-development:'));
  assert.equal(
    gate(`${workflow}\n  unrelated-source-check:\n    run: npm unsafe-synthetic\n`),
    selected,
  );
  assert.throws(() =>
    gate(
      workflow.replace(
        'name: derived-pair-retained-evidence',
        'name: derived-pair-retained-evidence\n          synthetic: always()',
      ),
    ),
  );
});
