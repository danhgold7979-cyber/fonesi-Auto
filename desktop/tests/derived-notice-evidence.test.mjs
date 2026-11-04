// Source/static framing witnesses only: no PowerShell, SDK capture or payload execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const source = read('../verification/Invoke-DerivedNoticeEvidence.ps1');
const controller = read('../verification/derived_notice_evidence.py');
const workflow = read('../../.github/workflows/phase-02-software.yml').replace(/\r\n/g, '\n');
function before(a, b, text = source) {
  assert.ok(text.indexOf(a) >= 0 && text.indexOf(b) > text.indexOf(a), `${a} before ${b}`);
}
test('notice entry pins original supervisor dependencies before import and has no payload execution route', () => {
  for (const [file, sha] of [
    [
      '../verification/WindowsBoundary.psm1',
      'd796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf',
    ],
    [
      '../verification/OwnedFiles.psm1',
      '17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29',
    ],
    [
      '../../tools/phase-00/HostProbeNative.cs',
      'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89',
    ],
  ]) {
    assert.equal(createHash('sha256').update(read(file)).digest('hex'), sha);
    assert.ok(source.includes(sha));
  }
  before('foreach($entry in', 'Import-Module $boundary');
  before('Import-Module $boundary', 'Add-Type -Path $helper');
  assert.equal((source.match(/Add-Type -Path/g) ?? []).length, 1);
  assert.equal((source.match(/NativeProbe\]::Run\(/g) ?? []).length, 1);
  assert.match(source, /NativeProbe\]::Run\(\$script:PythonPath/);
  assert.match(source, /@\('-I','-B',\$script:controller\)/);
  // The one canonical receipt literal contains hash-bound tool names, not commands.
  // Its complete schema and bytes are checked by the publication case below.
  const receiptLine = /^ \$expectedReceipt='[^'\r\n]+'$/gm;
  assert.equal([...source.matchAll(receiptLine)].length, 1);
  const executableText = (text) => text.replace(receiptLine, '');
  const forbidden =
    /Start-Process|Invoke-Expression|sdkmanager|gradle|javac|d8\.jar|aidl\.exe|Assembly\]::Load|app_process|adb\.exe|Remove-Item|-Recurse/;
  assert.doesNotMatch(executableText(source), forbidden);
  for (const command of [
    '& aidl.exe',
    '& java.exe -jar d8.jar',
    'Start-Process $expectedReceipt',
  ]) {
    assert.match(executableText(`${source}\n${command}\n`), forbidden);
  }
});
test('notice entry retains exact physical SDK profile and fixed nine-source closure', () => {
  const old = read('../verification/Invoke-DerivedPairBuild.ps1');
  for (const name of ['Assert-PlainAncestors', 'Assert-SdkLabel']) {
    const section = (text) =>
      text.slice(
        text.indexOf(`function ${name}(`),
        text.indexOf('\nfunction ', text.indexOf(`function ${name}(`) + 1),
      );
    assert.equal(section(source), section(old));
  }
  assert.ok(
    source.includes(
      "$buildTools='C:\\Program Files (x86)\\Android\\android-sdk\\build-tools\\36.0.0';Assert-PlainAncestors $buildTools",
    ),
  );
  const names = [...source.match(/\$names=@\(([^\n]+)\)/)[1].matchAll(/'([^']+)'/g)]
    .map((m) => m[1])
    .sort();
  assert.equal(names.length, 9);
  assert.equal(new Set(names).size, 9);
  for (const name of names) {
    if (name.startsWith('docs/'))
      assert.ok(controller.includes(name.slice(name.lastIndexOf('/') + 1)));
    else assert.ok(controller.includes(`'${name}'`));
  }
  assert.match(source, /\[Array\]::Sort\(\$names,\[StringComparer\]::Ordinal\)/);
  assert.match(
    source,
    /version=1;owner=\$owner.Token;baseOwner=\$baseOwner.Token;scratchRoot=\$owner.Path;autoSourceCommit=.*;autoSourceTree=.*;buildToolsRoot=\$buildTools;sourceClosure=\$closure/,
  );
});
test('notice budget uses one original clock and retains unknown process work without retry', () => {
  assert.equal((source.match(/Stopwatch\]::StartNew\(\)/g) ?? []).length, 1);
  before('Stopwatch]::StartNew()', 'Add-Type -Path');
  assert.match(source, /\$total=70000-\$script:clock.ElapsedMilliseconds/);
  assert.match(source, /\$remaining=\$end-\$script:clock.ElapsedMilliseconds/);
  assert.match(source, /\$end=60000/);
  assert.match(source, /\$end=70000/);
  assert.match(source, /\$remaining-=\$drain/);
  assert.match(source, /if\(\$remaining -le 0 -or \$drain -le 0\)\{throw 'UNRETIRED'\}/);
  before('EnvironmentFor\n', '$total=70000');
  before('$script:allRetired=$false', '$p=[Fonesi.Phase00.NativeProbe]::Run');
  assert.match(source, /if\(-not \$script:allRetired\)\{throw 'UNRETIRED'\}/);
  assert.doesNotMatch(source, /Start-Sleep|retry|Stop-Process|Kill\(/i);
});
test('only four fixed actions and exact successful observed process tuples enter private records', () => {
  const action = source.slice(source.indexOf('function RunAction('), source.indexOf('\ntry {'));
  const cases = [...action.matchAll(/^ {2}'(capture|stage|cleanup|publish)' /gm)].map((m) => m[1]);
  assert.deepEqual(cases, ['capture', 'stage', 'cleanup', 'publish']);
  assert.match(action, /default \{throw 'INTERNAL_FAILURE'\}/);
  for (const clause of [
    "$p.Status -ceq 'SUCCESS'",
    '$p.ExitCode -eq 0',
    '-not $p.StdoutTruncated',
    '-not $p.StderrTruncated',
    "$p.Stderr -ceq ''",
    '(Retired $p)',
  ])
    assert.ok(source.includes(clause));
  assert.ok(action.includes('$p.Stdout.Replace("`r`n","`n") -cne ($marker+"`n")'));
  before('if(-not (Success $p)', 'return [ordered]@{status=$p.Status', action);
  assert.match(
    action,
    /status=\$p.Status;exitCode=\$p.ExitCode;cleanupComplete=\$p.CleanupComplete;stdoutTruncated=\$p.StdoutTruncated;stderrTruncated=\$p.StderrTruncated;stderrEmpty=\(\$p.Stderr -ceq ''\);marker=\$marker/,
  );
  assert.match(source, /\) 16384\}/);
});
test('identity-fenced controller cleanup retires before wrapper absence and publisher eligibility', () => {
  before('NativeProbe]::ReserveDirectory($base)', '$owner=New-OwnedRun $tempParent');
  before("$capture=RunAction 'capture'", "$stage=RunAction 'stage'");
  before("$stage=RunAction 'stage'", "$cleanup=RunAction 'cleanup'");
  before("$cleanup=RunAction 'cleanup'", 'if(Test-Path -LiteralPath $owner.Path)');
  assert.doesNotMatch(source, /Remove-VerifiedOwnedRun|Remove-Item/);
  before('if(Test-Path -LiteralPath $owner.Path)', "JsonNew (Join-Path $base 'processes.json')");
  before("JsonNew (Join-Path $base 'processes.json')", "$publication=RunAction 'publish'");
  before("$publication=RunAction 'publish'", '$published=$true');
  assert.match(source, /\$entries.Count -ne 3/);
  assert.match(source, /Assert-ExactPublishedText \(Join-Path \$upload 'NOTICE.txt'\) 1063288/);
  assert.match(source, /if\(\$clock.ElapsedMilliseconds -gt 70000\)\{throw 'PUBLICATION_FAILED'\}/);
  assert.match(source, /if\(\$published\)\{Write-Output 'DERIVED_NOTICE_EVIDENCE_PASS';exit 0\}/);
  assert.doesNotMatch(
    source,
    /Write-Output[^\n]*(?:\$p\.|\$message|\$_|Exception|\$closure|\$context)/,
  );
});
test('actual closed failure grammar rejects private text extra frames and unknown categories', () => {
  const pattern = source.match(/\$pattern='([^'\n]+)'/)[1];
  const regex = new RegExp(pattern.replace(/^\\A/, '^').replace(/\\z$/, '$(?![\\s\\S])'));
  const categories = [
    ...source.match(/\$categories=@\(([^\n]+)\)/)[1].matchAll(/'([A-Z_]+)'/g),
  ].map((m) => m[1]);
  assert.equal(categories.length, 10);
  for (const category of categories) {
    assert.equal(regex.test(`DERIVED_NOTICE_FAILED|${category}\n`), true);
    assert.ok(controller.includes(`'${category}'`));
  }
  for (const raw of [
    'DERIVED_NOTICE_FAILED|C:\\private\n',
    'DERIVED_NOTICE_FAILED|UNKNOWN\n',
    'DERIVED_NOTICE_FAILED|INPUT_REJECTED\nraw',
    '\nDERIVED_NOTICE_FAILED|INPUT_REJECTED\n',
    'DERIVED_NOTICE_FAILED|INPUT_REJECTED\n\n',
  ])
    assert.equal(regex.test(raw), false);
  assert.match(
    source,
    /\$p.ExitCode -eq 1 -and -not \$p.StdoutTruncated -and -not \$p.StderrTruncated -and \$p.Stderr -ceq '' -and \$p.Stdout.Length -le 128/,
  );
});
test('workflow opt-in and uploader are closed to three evidence files after sole successful wrapper frame', () => {
  const job = workflow.match(
    /^ {2}derived-notice-evidence-development:\n([\s\S]*?)(?=^ {2}[a-z][a-z0-9-]*:\n|$(?![\s\S]))/m,
  )[1];
  const required = [
    'needs: windows-software-only',
    "github.ref == 'refs/heads/phase-03'",
    'inputs.run_notice_evidence == true',
    "'[notice-evidence]'",
    "if: success() && steps.notice_validation.outputs.passed == 'true'",
    "$lines.Count -eq 1 -and $code -eq 0 -and $lines[0] -ceq 'DERIVED_NOTICE_EVIDENCE_PASS'",
    'retention-days: 14',
    'if-no-files-found: error',
    'persist-credentials: false',
  ];
  const admissible = (text) =>
    required.every((part) => text.includes(part)) &&
    !/always\(\)|upload\/\*|sdkmanager|gradle|npm install/.test(text);
  assert.equal(admissible(job), true);
  for (const part of required) assert.equal(admissible(job.replace(part, 'MUTATED')), false);
  const paths = [
    ...job.matchAll(/^ {12}(desktop\/\.derived-notice-runtime\/upload\/[^\n]+)$/gm),
  ].map((m) => m[1]);
  assert.deepEqual(
    paths,
    ['NOTICE.txt', 'source.properties', 'receipt.json'].map(
      (name) => `desktop/.derived-notice-runtime/upload/${name}`,
    ),
  );
  assert.match(
    workflow,
    /run_notice_evidence:\n[\s\S]*?required: false\n\s+type: boolean\n\s+default: false/,
  );
});

test('notice context binds actual owned path independently from the marker UUID', () => {
  const owned = read('../verification/OwnedFiles.psm1');
  assert.ok(owned.includes("$path = Join-Path $Parent ('run-' + [guid]::NewGuid().ToString())"));
  assert.ok(owned.includes('$token = [guid]::NewGuid().ToString()'));
  assert.ok(owned.includes('Path=$path; Parent=$Parent; Token=$token'));
  assert.ok(
    source.includes('owner=$owner.Token;baseOwner=$baseOwner.Token;scratchRoot=$owner.Path;'),
  );
  assert.doesNotMatch(source, /run-.*\$owner.Token|scratchRoot=\$owner.Token/);
});

test('publisher retirement is followed by exact fixed text and canonical receipt checks', () => {
  before(
    "$publication=RunAction 'publish'",
    "Assert-ExactPublishedText (Join-Path $upload 'NOTICE.txt')",
  );
  before("if((ReadText (Join-Path $upload 'receipt.json') 8192)", '$published=$true');
  const raw = source.match(/\$expectedReceipt='([^'\n]+)'/)[1];
  const expected = JSON.parse(raw);
  assert.equal(expected.autoSourceCommit, '@COMMIT@');
  assert.equal(expected.autoSourceTree, '@TREE@');
  assert.equal(raw, JSON.stringify(expected));
  assert.deepEqual(Object.keys(expected), [
    'version',
    'scope',
    'autoSourceCommit',
    'autoSourceTree',
    'baselineReportSha256',
    'baselineToolsSha256',
    'baselineDependenciesSha256',
    'files',
    'toolBindings',
    'sourceUnchanged',
    'inputsUnchanged',
    'processRetired',
    'directoryCleanup',
    'passed',
  ]);
  const inputs = [...controller.matchAll(/\('([^']+)',(\d+),'([a-f0-9]{64})'\)/g)].map((m) => ({
    name: m[1],
    bytes: Number(m[2]),
    sha256: m[3],
  }));
  assert.deepEqual(expected.files, inputs.slice(0, 2));
  assert.deepEqual(expected.toolBindings, inputs.slice(2, 5));
  for (const row of expected.files)
    assert.ok(
      source.includes(
        `Assert-ExactPublishedText (Join-Path $upload '${row.name}') ${row.bytes} '${row.sha256}'`,
      ),
    );
  for (const value of [
    expected.baselineReportSha256,
    expected.baselineToolsSha256,
    expected.baselineDependenciesSha256,
  ])
    assert.ok(controller.includes(value));
  assert.match(source, /\$s.Length -ne \$bytes/);
  assert.match(
    source,
    /\$s.Position -ne \$bytes -or \$s.Length -ne \$bytes -or \$actual -cne \$sha256/,
  );
  assert.match(source, /\$hash.ComputeHash\(\$s\)/);
  assert.match(
    source,
    /Replace\('@COMMIT@',\[string\]\$original\['FONESI_AUTO_SOURCE_COMMIT'\]\).Replace\('@TREE@',\[string\]\$original\['FONESI_AUTO_SOURCE_TREE'\]\)/,
  );
  assert.doesNotMatch(source, /ConvertFrom-Json/);
});
