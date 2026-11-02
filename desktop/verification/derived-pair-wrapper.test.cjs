// Source assertions only. Does not parse/execute PowerShell or compile any output.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { workflowEncodings } = require('./workflow-fixture.cjs');
const source = fs.readFileSync(path.join(__dirname, 'Invoke-DerivedPairBuild.ps1'), 'utf8');
function before(left, right, text = source) {
  const a = text.indexOf(left),
    b = text.indexOf(right);
  assert.ok(a >= 0 && b > a, `${left} must precede ${right}`);
}
test('paired wrapper reserves fresh owned roots and never adopts or recursively deletes', () => {
  assert.match(source, /NativeProbe\]::ReserveDirectory\(\$base\)/);
  assert.match(source, /NativeProbe\]::ReserveDirectory\(\$root\)/);
  assert.match(source, /\$original\['RUNNER_TEMP'\]/);
  assert.match(source, /'derived-pair-'\+\[guid\]::NewGuid\(\)\.ToString\(\)/);
  before("WriteNew (Join-Path $root '.owner')", "@('prepare',$root");
  assert.doesNotMatch(
    source,
    /Remove-Item|-Recurse|Directory\]::Delete|Set-ExecutionPolicy|Start-Process/,
  );
});
test('original budget starts before acquisition and supervises all children without renewal', () => {
  before('$clock=[Diagnostics.Stopwatch]::StartNew()', "@('acquire',$root)");
  assert.match(source, /\$end=if\(\$cleanup\)\{300000\}else\{290000\}/);
  assert.match(source, /\$remaining=\[long\]\$end-\$script:clock.ElapsedMilliseconds/);
  assert.match(source, /\[Math\]::Min\(10000,300000-\$script:clock.ElapsedMilliseconds\)/);
  assert.match(source, /\[int\]\[Math\]::Min\(\$maximum,\$remaining\)/);
  assert.equal((source.match(/Stopwatch\]::StartNew\(\)/g) || []).length, 1);
  assert.match(
    source,
    /if\(\$cleanup\)\{\$drain=\[Math\]::Min\(1000,\[Math\]::Floor\(\$remaining\/2\)\);\$remaining-=\$drain\}/,
  );
  before('EnvironmentFor $compiler', '$remaining=[long]$end-$script:clock.ElapsedMilliseconds');
  before('$script:allRetired=$false', '$p=[Fonesi.Phase00.NativeProbe]::Run');
});
test('exact five stages require before and after closure verification and retired receipts', () => {
  assert.match(
    source,
    /foreach\(\$stage in @\('aidlClipboard','aidlDisplay','javac','d8','consumerCsc'\)\)/,
  );
  const loop = source.slice(
    source.indexOf(' foreach($stage in'),
    source.indexOf('}catch{\n $failure='),
  );
  assert.equal((loop.match(/@\('verify',\$root,\$stage\)/g) || []).length, 2);
  before("@('verify',$root,$stage)", '$p=RunFixed', loop);
  before('$p=RunFixed', "('private/process-'+$stage+'.json')", loop);
  assert.match(loop, /if\(-not \$allRetired\)\{throw 'UNRETIRED'\}/);
  assert.match(
    source,
    /status=\$p.Status;exitCode=\$p.ExitCode;cleanupComplete=\$p.CleanupComplete;stdoutTruncated=\$p.StdoutTruncated;stderrTruncated=\$p.StderrTruncated/,
  );
});
test('private plans reject unknown fields, noncanonical JSON and wrong executable or budget', () => {
  assert.match(source, /version,stage,executable,arguments,deadlineMs,workingDirectory/);
  assert.match(source, /ConvertTo-Json -Depth 12 -Compress\) -cne \$raw/);
  assert.match(source, /\$p.executable -cne \$script:executables\[\$stage\]/);
  assert.match(source, /\$p.deadlineMs -ne \$maximum/);
  assert.match(source, /\$p.arguments.Count -gt 2048/);
  assert.match(source, /\$a.Length -gt 2048/);
  assert.match(source, /\$p.workingDirectory -cne 'EXECUTABLE_DIRECTORY'/);
  assert.match(source, /NativeProbe\]::QuoteArgument\(\$a\)/);
  assert.match(source, /\$command.Length -gt 30000/);
});
test('tool metadata comes from fixed preinstalled locations and no candidate is loaded', () => {
  for (const item of [
    'JAVA_HOME_17_X64',
    'ANDROID_HOME',
    'platforms/android-36',
    'build-tools/36.0.0',
    'Microsoft.NET/Framework64/v4.0.30319',
    'source.properties',
    'FileVersionInfo',
    'FONESI_AUTO_SOURCE_COMMIT',
    'FONESI_AUTO_SOURCE_TREE',
  ])
    assert.ok(source.includes(item));
  assert.match(source, /\$original\['ImageOS'\] -cne 'win22'/);
  assert.match(source, /Property \$release 'JAVA_VERSION'/);
  assert.equal((source.match(/Add-Type -Path/g) || []).length, 1);
  assert.match(source, /Add-Type -Path \$helper/);
  assert.doesNotMatch(
    source,
    /Assembly\]::Load|Assembly\.Load|sdkmanager|gradle|RunCmd|app_process|adb\.exe|classes\.zip.*RunFixed/,
  );
});
test('environment is cleared and JVM overrides are refused rather than inherited', () => {
  assert.match(
    source,
    /CLASSPATH\|JAVA_TOOL_OPTIONS\|_JAVA_OPTIONS\|JDK_JAVA_OPTIONS\|JDK_JAVAC_OPTIONS/,
  );
  assert.match(source, /SetEnvironmentVariable\(\[string\]\$key,\$null,'Process'\)/);
  assert.match(source, /'private\/java-tmp'/);
  assert.match(source, /@\('-I','-B',\$script\)/);
  assert.match(
    source,
    /SetEnvironmentVariable\(\[string\]\$key,\[string\]\$original\[\$key\],'Process'\)/,
  );
  assert.doesNotMatch(source, /Write-Output \$p\.(Stdout|Stderr)/);
});
test('stage precedes closed cleanup and marker-last removal, publish independently follows', () => {
  before("@('stage',$owner.Path)", "@('cleanup',$owner.Path)");
  before("@('cleanup',$owner.Path)", 'Remove-VerifiedOwnedRun $owner $allRetired');
  before('Remove-VerifiedOwnedRun $owner $allRetired', "@('cleanup',$base)");
  before("@('cleanup',$base)", "$validator,'publish',$base");
  assert.match(source, /if\(\$staged -and \$allRetired\)/);
  assert.match(source, /DERIVED_PAIR_VALIDATION_WRITTEN`nDERIVED_PAIR_VALIDATION_PASS`n/);
});
test('unchanged historical supervisor and owned helpers are pinned before use', () => {
  const files = [
    [
      '../../tools/phase-00/HostProbeNative.cs',
      'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89',
    ],
    ['WindowsBoundary.psm1', 'd796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf'],
    ['OwnedFiles.psm1', '17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29'],
  ];
  for (const [file, sha] of files) {
    assert.equal(
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(__dirname, file)))
        .digest('hex'),
      sha,
    );
    assert.ok(source.includes(sha));
  }
  const native = fs.readFileSync(path.join(__dirname, files[0][0]), 'utf8');
  assert.match(native, /Path.GetDirectoryName\(executable\), ref startup/);
});

const workflowRaw = fs.readFileSync(
  path.join(__dirname, '../../.github/workflows/phase-02-software.yml'),
  'utf8',
);
const workflow = workflowEncodings(workflowRaw)[0];
const pairGate =
  "github.ref == 'refs/heads/phase-03' && ((github.event_name == 'workflow_dispatch' && inputs.run_pair_build == true) || (github.event_name == 'push' && contains(github.event.head_commit.message, '[pair-build]')))";
function validPairWorkflow(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const jobs = [
    ...text.matchAll(
      /^[ ]{2}derived-pair-compile-development:\n([\s\S]*?)(?=^[ ]{2}[a-z][a-z0-9-]*:\n|$(?![\s\S]))/gm,
    ),
  ];
  const inputs = [
    ...text.matchAll(
      /^[ ]{6}run_pair_build:\n([\s\S]*?)(?=^[ ]{6}[a-z][a-z0-9_]*:\n|^[ ]{2}[a-z]|$(?![\s\S]))/gm,
    ),
  ];
  if (jobs.length !== 1 || inputs.length !== 1) return false;
  const job = jobs[0][1],
    input = inputs[0][1];
  const one = (re, value, part = job) => {
    const m = [...part.matchAll(re)];
    return m.length === 1 && m[0][1] === value;
  };
  if (
    !one(/^[ ]{4}needs: (.*)$/gm, 'windows-software-only') ||
    !one(/^[ ]{4}if: (.*)$/gm, pairGate) ||
    !one(/^[ ]{4}runs-on: (.*)$/gm, 'windows-2022')
  )
    return false;
  if (
    !one(/^[ ]{8}default: (.*)$/gm, 'false', input) ||
    !one(/^[ ]{8}type: (.*)$/gm, 'boolean', input) ||
    !one(/^[ ]{8}required: (.*)$/gm, 'false', input)
  )
    return false;
  if (
    !one(/^[ ]{10}path: (.*)$/gm, 'desktop/.derived-pair-build-runtime/upload/*.json') ||
    !one(/^[ ]{8}if: (.*)$/gm, "always() && steps.pair_validation.outputs.written == 'true'")
  )
    return false;
  const uses = [...job.matchAll(/^[ ]{6}- uses: (.*)$|^[ ]{8}uses: (.*)$/gm)].map(
    (m) => m[1] || m[2],
  );
  if (
    JSON.stringify(uses) !==
    JSON.stringify([
      'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
      'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f',
    ])
  )
    return false;
  if (
    !one(/^[ ]{10}persist-credentials: (.*)$/gm, 'false') ||
    !one(/^[ ]{10}include-hidden-files: (.*)$/gm, 'true') ||
    !one(/^[ ]{10}if-no-files-found: (.*)$/gm, 'error')
  )
    return false;
  if (
    !job.includes('$head[0] -cne $env:GITHUB_SHA') ||
    !job.includes("git rev-parse 'HEAD^{tree}'") ||
    !job.includes('FONESI_AUTO_SOURCE_COMMIT=') ||
    !job.includes('FONESI_AUTO_SOURCE_TREE=')
  )
    return false;
  if (
    !job.includes(
      "Parser]::ParseFile((Join-Path $PWD 'desktop/verification/Invoke-DerivedPairBuild.ps1')",
    ) ||
    !job.includes("if(@($errors).Count -ne 0){throw 'SYNTAX'}")
  )
    return false;
  if (
    !job.includes(
      '$lines=@(& ./desktop/verification/Invoke-DerivedPairBuild.ps1 -PythonPath $env:FOUNDATION_PYTHON_EXE)',
    ) ||
    !job.includes("Where-Object {$_ -ceq 'DERIVED_PAIR_VALIDATION_WRITTEN'}).Count -eq 1")
  )
    return false;
  return !/setup-node|npm\s|sdkmanager|Assembly\.Load|Add-Type|--device|\.jar\s*$|\.dll\s*$/m.test(
    job,
  );
}
test('paired workflow is phase-03 opt-in, source-gated, parse-first and JSON-only, including CRLF', () => {
  const expected = workflowEncodings(workflowRaw);
  for (const checkout of expected) {
    const variants = workflowEncodings(checkout);
    assert.deepEqual(variants, expected);
    for (const variant of variants) {
      assert.equal(variant.includes('\r\r\n'), false);
      assert.equal(validPairWorkflow(variant), true);
    }
  }
});
test('paired workflow refuses changed branch, default enablement, missing gate and disabled drift', () => {
  const input = workflow.match(
    /^[ ]{6}run_pair_build:\n(?:[ ]{8}[^\n]+\n)*?[ ]{8}default: false\n/m,
  )?.[0];
  assert.ok(input);
  const enabledInput = input.replace('        default: false', '        default: true');
  assert.equal(workflow.replace(input, enabledInput).replace(enabledInput, input), workflow);
  for (const [from, to] of [
    [pairGate, pairGate.replace('phase-03', 'main')],
    [pairGate, 'true'],
    [pairGate, `false && ${pairGate}`],
    [pairGate, pairGate.replace('inputs.run_pair_build == true', 'inputs.run_pair_build != true')],
    [pairGate, pairGate.replace('[pair-build]', '[video-managed]')],
    ['run_pair_build:\n', 'run_pair_build_disabled:\n'],
    [input, enabledInput],
    [
      '  derived-pair-compile-development:\n    needs: windows-software-only',
      '  derived-pair-compile-development:\n    needs: nonexistent',
    ],
  ]) {
    assert.ok(workflow.includes(from));
    assert.equal(validPairWorkflow(workflow.replace(from, to)), false, from);
  }
});
test('paired workflow refuses binary, broad, unvalidated uploads and unbound source invocation', () => {
  for (const [from, to] of [
    [
      'path: desktop/.derived-pair-build-runtime/upload/*.json',
      'path: desktop/.derived-pair-build-runtime/upload/*',
    ],
    [
      'path: desktop/.derived-pair-build-runtime/upload/*.json',
      'path: desktop/.derived-pair-build-runtime/**/*.dll',
    ],
    ["if: always() && steps.pair_validation.outputs.written == 'true'", 'if: always()'],
    ['$head[0] -cne $env:GITHUB_SHA', "$head[0] -eq ''"],
    [
      'Invoke-DerivedPairBuild.ps1 -PythonPath $env:FOUNDATION_PYTHON_EXE',
      'Invoke-DerivedPairBuild.ps1 -ContextPath untrusted.json',
    ],
  ]) {
    assert.ok(workflow.includes(from));
    assert.equal(validPairWorkflow(workflow.replace(from, to)), false, from);
  }
});

test('tools diagnostics identify only one closed source substep without exposing values or changing admission', () => {
  const steps = [
    'JDK_ROOT',
    'SDK_ROOT',
    'SDK_CONSISTENCY',
    'PLATFORM_ROOT',
    'BUILD_TOOLS_ROOT',
    'FRAMEWORK_ROOT',
    'JDK_METADATA',
    'PLATFORM_METADATA',
    'BUILD_TOOLS_METADATA',
    'COMPILER_METADATA',
    'IMAGE',
    'SOURCE_IDS',
    'CONTEXT',
  ];
  const filter = workflow.match(/-cmatch '(\^DERIVED_PAIR_[^'\n]+)'/)?.[1];
  assert.ok(filter);
  const admitted = new RegExp(filter);
  for (const step of steps) assert.equal(admitted.test(`DERIVED_PAIR_TOOLS_${step}`), true);
  for (const rejected of [
    'DERIVED_PAIR_TOOLS_UNKNOWN',
    'DERIVED_PAIR_TOOLS_JDK_ROOT C:\\private-canary',
    'DERIVED_PAIR_TOOLS_/private/canary',
    'Exception: private-canary',
    'DERIVED_PAIR_TOOLS_JDK_ROOT_private-canary',
  ]) {
    assert.equal(admitted.test(rejected), false);
  }
  const tools = source.slice(
    source.indexOf(" $phase='TOOLS'"),
    source.indexOf(" $phase='PREPARE'"),
  );
  assert.deepEqual(
    [...tools.matchAll(/\$toolsStep='([A-Z_]+)'/g)].map((m) => m[1]),
    steps,
  );
  const marker =
    "if($phase -ceq 'TOOLS' -and $toolsStep -cin @(" +
    steps.map((s) => `'${s}'`).join(',') +
    ")){Write-Output ('DERIVED_PAIR_TOOLS_'+$toolsStep)}";
  assert.ok(source.includes(marker));
  assert.equal(
    (source.match(/Write-Output \('DERIVED_PAIR_TOOLS_'\+\$toolsStep\)/g) || []).length,
    1,
  );
  for (const [step, check] of [
    [
      'JDK_ROOT',
      "$jdk=[IO.Path]::GetFullPath([string]$original['JAVA_HOME_17_X64']);Assert-PlainDirectory $jdk",
    ],
    ['SDK_ROOT', "Assert-SdkLabel ([string]$original['ANDROID_HOME'])"],
    ['SDK_CONSISTENCY', "if($original.Contains('ANDROID_SDK_ROOT')"],
    [
      'PLATFORM_ROOT',
      "$platform=Join-Path $sdk 'platforms/android-36';Assert-PlainDirectory $platform",
    ],
    [
      'BUILD_TOOLS_ROOT',
      "$buildTools=Join-Path $sdk 'build-tools/36.0.0';Assert-PlainDirectory $buildTools",
    ],
    [
      'FRAMEWORK_ROOT',
      "$framework=Join-Path $windows 'Microsoft.NET/Framework64/v4.0.30319';Assert-PlainDirectory $framework",
    ],
    ['JDK_METADATA', "$release=ReadText (Join-Path $jdk 'release')"],
    ['PLATFORM_METADATA', '$platformProperties=ReadText'],
    ['BUILD_TOOLS_METADATA', '$buildVersion=Property'],
    ['COMPILER_METADATA', "$csc=Join-Path $framework 'csc.exe'"],
    ['IMAGE', "if($original['ImageOS']"],
    ['SOURCE_IDS', "foreach($key in @('FONESI_AUTO_SOURCE_COMMIT'"],
    ['CONTEXT', '$context=[ordered]'],
  ])
    before(`$toolsStep='${step}'`, check, tools);
  assert.doesNotMatch(
    source,
    /Write-Output[^\n]*(?:\$_|Exception|\.Message|\$jdk|\$sdk|\$release|\$context)/,
  );
});

// Static predicate/mutation witnesses, not execution of Windows filesystem admission.
test('win22 SDK uses only fixed physical authority and checks documented alias metadata', () => {
  const start = source.indexOf('function Assert-PlainAncestors(');
  const end = source.indexOf('function ReadText(');
  const profile = source.slice(start, end);
  const required = [
    "$alias='C:\\Android\\android-sdk';$physical='C:\\Program Files (x86)\\Android\\android-sdk'",
    "if($label -cne $alias -and $label -cne $physical){throw 'SDK_PROFILE_REJECTED'}",
    'if($label -ceq $alias){',
    "Assert-PlainAncestors 'C:\\Android'",
    '$link=Get-Item -LiteralPath $alias -Force -ErrorAction Stop',
    '-not $link.PSIsContainer',
    '-not ($link.Attributes -band [IO.FileAttributes]::ReparsePoint)',
    "$link.LinkType -cne 'SymbolicLink'",
    '$targets=@($link.Target)',
    '$targets.Count -ne 1',
    '$targets[0] -isnot [string]',
    '$targets[0] -cne $physical',
    'Assert-PlainDirectory $current',
    '$parent=[IO.Directory]::GetParent($current)',
    '$current=if($null -eq $parent){$null}else{$parent.FullName}',
  ];
  const exactProfile = (text) => required.every((part) => text.includes(part));
  assert.equal(exactProfile(profile), true);
  for (const part of required) {
    assert.equal(exactProfile(profile.replace(part, 'MUTATED')), false, part);
  }
  assert.ok(
    source.includes(
      "$sdk='C:\\Program Files (x86)\\Android\\android-sdk';Assert-PlainAncestors $sdk",
    ),
  );
  assert.ok(
    source.includes(
      "if($original.Contains('ANDROID_SDK_ROOT')){Assert-SdkLabel ([string]$original['ANDROID_SDK_ROOT'])}",
    ),
  );
  assert.doesNotMatch(
    profile,
    /Resolve-Path|ResolveLinkTarget|Set-Item|New-Item|GetFullPath|\$physical=\$|\$sdk=\$targets/,
  );
  const controller = fs.readFileSync(path.join(__dirname, 'derived_pair_build.py'), 'utf8');
  assert.ok(controller.includes('for parent in path.parents:'));
  assert.ok(controller.includes("parent.is_symlink() or getattr(ps,'st_file_attributes',0)&0x400"));
});

// The extracted fixed grammar is executed here; PowerShell/supervisor are not executed.
test('controller failure diagnostic requires exact bounded action-bound retired frame', () => {
  const section = source.slice(
    source.indexOf('function PythonDiagnostic('),
    source.indexOf('function Python([string]'),
  );
  const pattern = section.match(/\$pattern='([^'\n]+)'/)?.[1];
  assert.ok(pattern);
  const controller = fs.readFileSync(path.join(__dirname, 'derived_pair_build.py'), 'utf8');
  for (const name of ['ACTIONS', 'STEPS', 'REASONS']) {
    const values = controller.match(new RegExp(`^DIAGNOSTIC_${name} = \\(([^\\n]+)\\)$`, 'm'))?.[1];
    assert.ok(values);
    const alternatives = [...values.matchAll(/'([A-Z0-9_]+)'/g)].map((match) => match[1]).join('|');
    assert.ok(pattern.includes(`(${alternatives})`));
  }
  const forwarding = workflow.match(/-cmatch '(\^DERIVED_PAIR_[^'\n]+)'/)?.[1];
  assert.ok(forwarding);
  const forwarded = new RegExp(forwarding);
  assert.equal(forwarded.test('DERIVED_PAIR_CONTROL_DIAG|PREPARE|TOOLS_JDK17|REPARSE'), true);
  assert.equal(forwarded.test('DERIVED_PAIR_DIAGNOSTIC_UNAVAILABLE'), true);
  for (const line of [
    'DERIVED_PAIR_CONTROL_DIAG|FOREIGN|TOOLS_JDK17|REPARSE',
    'DERIVED_PAIR_CONTROL_DIAG|PREPARE|C:\\private|IO_OTHER',
    'DERIVED_PAIR_CONTROL_DIAG|PREPARE|TOOLS_JDK17|RAW_CANARY',
    'DERIVED_PAIR_CONTROL_DIAG|PREPARE|TOOLS_JDK17|REPARSE\nraw-canary',
    'raw-canary',
  ])
    assert.equal(forwarded.test(line), false);
  const framePattern = new RegExp(pattern.replace(/^\\A/, '^').replace(/\\z$/, '$(?![\\s\\S])'));
  const good =
    'DERIVED_PAIR_CONTROL_DIAG|PREPARE|TOOLS_JDK17|REPARSE\nDERIVED_PAIR_CONTROL_FAILED\n';
  function admit(raw, action = 'prepare', facts = {}) {
    const p = {
      retired: true,
      exitCode: 1,
      stdoutTruncated: false,
      stderrTruncated: false,
      stderr: '',
      controller: true,
      ...facts,
    };
    if (
      !p.controller ||
      !p.retired ||
      p.exitCode !== 1 ||
      p.stdoutTruncated ||
      p.stderrTruncated ||
      p.stderr !== '' ||
      raw.length > 256 ||
      [...raw].some((character) => character.charCodeAt(0) > 127)
    )
      return false;
    const m = framePattern.exec(raw.replace(/\r\n/g, '\n'));
    return !!m && m[1] === action.toUpperCase();
  }
  assert.equal(admit(good), true);
  assert.equal(admit(good.replace(/\n/g, '\r\n')), true);
  for (const bad of [
    `${good}\n`,
    good + good,
    good.replace('PREPARE', 'CLI'),
    good.replace('REPARSE', 'PRIVATE_PATH'),
    good.replace('TOOLS_JDK17', 'C:\\private'),
    good.replace('CONTROL_FAILED', 'CONTROL_PASS'),
    good.replace('REPARSE', 'é'),
    'x'.repeat(257),
    good.replace(/\n$/, ''),
  ])
    assert.equal(admit(bad), false);
  for (const facts of [
    { retired: false },
    { exitCode: null },
    { exitCode: 0 },
    { exitCode: 2 },
    { stdoutTruncated: true },
    { stderrTruncated: true },
    { stderr: 'private-canary' },
    { controller: false },
  ])
    assert.equal(admit(good, 'prepare', facts), false);
  for (const clause of [
    '$script -ceq $script:controller',
    '(Retired $p)',
    '$p.ExitCode -eq 1',
    '-not $p.StdoutTruncated',
    '-not $p.StderrTruncated',
    "$p.Stderr -ceq ''",
    '$raw.Length -le 256',
    "$raw -cnotmatch '[^\\x00-\\x7f]'",
    '$match.Groups[1].Value -ceq $action.ToUpperInvariant()',
  ])
    assert.ok(section.includes(clause), clause);
  assert.match(section, /Write-Output 'DERIVED_PAIR_DIAGNOSTIC_UNAVAILABLE'/);
  assert.doesNotMatch(
    section,
    /Write-Output[^\n]*(?:\$raw|\$frame|\.Reason|\.Stderr|\.Stdout|Exception)/,
  );
  assert.ok(source.includes("PythonDiagnostic $p $script $arguments[0];throw 'CONTROL_FAILED'"));
});

test('supervisor diagnostics expose only actual closed status and finite retirement facts', () => {
  const statuses = [
    'SUCCESS',
    'EMPTY_OUTPUT',
    'NONZERO_EXIT',
    'TIMEOUT',
    'ACCESS_DENIED',
    'LAUNCH_FAILED',
    'CAPTURE_FAILED',
    'CLEANUP_FAILED',
  ];
  const native = fs.readFileSync(
    path.join(__dirname, '../../tools/phase-00/HostProbeNative.cs'),
    'utf8',
  );
  for (const status of statuses) assert.ok(native.includes(`"${status}"`));
  assert.ok(source.includes(`$statuses=@(${statuses.map((status) => `'${status}'`).join(',')})`));
  assert.ok(source.includes('if($p.Status -cin $statuses)'));
  assert.ok(source.includes("$exitFlag=if($null -eq $p.ExitCode){'NULL'}else{'PRESENT'}"));
  assert.ok(source.includes("$retiredFlag=if(Retired $p){'TRUE'}else{'FALSE'}"));
  assert.ok(source.includes("$outFlag=if($p.StdoutTruncated){'TRUE'}else{'FALSE'}"));
  assert.ok(source.includes("$errFlag=if($p.StderrTruncated){'TRUE'}else{'FALSE'}"));
  const maximum =
    'DERIVED_PAIR_SUPERVISOR_STATUS_CLEANUP_FAILED_EXIT_PRESENT_RETIRED_FALSE_STDOUT_TRUNCATED_FALSE_STDERR_TRUNCATED_FALSE';
  assert.ok(maximum.length <= 256);
  const forwarding = workflow.match(/-cmatch '(\^DERIVED_PAIR_[^'\n]+)'/)?.[1];
  assert.ok(forwarding);
  const forwarded = new RegExp(forwarding);
  for (const status of statuses)
    assert.equal(forwarded.test(maximum.replace('CLEANUP_FAILED', status)), true);
  for (const line of [
    maximum.replace('CLEANUP_FAILED', 'UNKNOWN'),
    maximum.replace('EXIT_PRESENT', 'EXIT_123'),
    `${maximum}\nprivate-canary`,
    maximum.replace('RETIRED_FALSE', 'RETIRED_MAYBE'),
  ])
    assert.equal(forwarded.test(line), false);
});
