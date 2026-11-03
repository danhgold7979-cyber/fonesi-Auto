// Source-policy assertions only. These do not compile/execute C# or prove Windows custody.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = readFileSync(
  new URL('../native/VisionBootstrapProcess.cs', import.meta.url),
  'utf8',
);
const section = (start, end) =>
  source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const includes = (...tokens) => {
  for (const token of tokens) assert.ok(source.includes(token), token);
};

test('bootstrap source: dedicated namespace and exactly four closed profiles', () => {
  assert.match(source, /namespace Fonesi\.Development\.VisionBootstrap/);
  assert.equal(
    source.match(/enum BootstrapProfile \{([^}]+)\}/)[1].trim(),
    'CreatePreprocess, CreateOcr, InstallPreprocess, InstallOcr',
  );
  assert.doesNotMatch(source, /IsNode\(|NestedOwnerCrash|AssignFailure|fixture\//);
});
test('bootstrap source: fixed candidate, sibling acquisition and canonical parent', () => {
  includes(
    'D:\\a\\_temp\\fonesi-p4-windows-candidate-v1',
    'D:\\a\\_temp\\fonesi-p4-windows-acquisition-v1',
    'const string ParentRoot = @"D:\\a\\_temp"',
  );
  assert.doesNotMatch(source, /Admit\(string root/);
});
test('bootstrap source: reserve absent roots under retained ancestor custody', () => {
  const reserve = section('internal void Reserve()', 'public bool Ready');
  assert.ok(
    reserve.indexOf('holder.HoldDirectories(ParentRoot)') <
      reserve.indexOf('Require(CreateDirectory(CandidateRoot'),
  );
  assert.ok(
    reserve.indexOf('Require(CreateDirectory(CandidateRoot') <
      reserve.indexOf('holder.HoldDirectories(CandidateRoot)'),
  );
  assert.ok(reserve.includes('Require(CreateDirectory(AcquisitionRoot'));
  includes(
    'catch { staging.Failed = true; }',
    'if (staging != null || admissionReserved || retained.Count != 0)',
  );
});
test('bootstrap source: custody stays held while child or admission remains owned', () => {
  const release = section('public bool Release()', 'VisionBootstrapProcess()');
  assert.ok(release.indexOf('retained.Count != 0') < release.indexOf('holder.ReleaseAdmission()'));
  assert.ok(release.indexOf('holder.ReleaseAdmission()') < release.indexOf('staging = null'));
});
test('bootstrap source: original overall and child clocks are independently bounded', () => {
  includes(
    'Stopwatch.Frequency * 600',
    'deadline = Math.Min(owner.OverallDeadline, checked(started + Stopwatch.Frequency * 120))',
    'Stopwatch.GetTimestamp() >= deadline',
  );
});
test('bootstrap source: ordered reservation refuses queues and failed predecessor', () => {
  includes(
    'if (admissionReserved || retained.Count != 0)',
    '(int)profile != custody.NextProfile',
    '!custody.Ready',
    'if (status == "SUCCESS") { if (hostOperation) custody.HostStep++; else custody.NextProfile++; }',
    'else custody.Failed = true',
  );
});
test('bootstrap source: exact pip-free venv command without activation or ensurepip', () => {
  includes(
    '"-I", "-B", "-m", "venv", "--without-pip", "--copies", "--without-scm-ignore-files"',
    '"fonesi-p4-preprocess-v1"',
    '"fonesi-p4-ocr-v1"',
    '"DESTINATION_EXISTS"',
  );
  assert.doesNotMatch(source, /"ensurepip"|"--upgrade"|"cmd\.exe"|"powershell\.exe"/);
});
test('bootstrap source: exact pinned runner and offline hash-required install', () => {
  includes(
    'python/Lib/site-packages/pip/__pip-runner__.py',
    '"--isolated", "--disable-pip-version-check", "install", "--no-index", "--no-deps"',
    '"--require-hashes", "--only-binary=:all:", "--no-compile", "--no-cache-dir", "--no-warn-script-location"',
  );
});
test('bootstrap source: separate wheelhouses and exact two lock pins', () => {
  includes(
    '"preprocess-wheelhouse" : "ocr-wheelhouse"',
    '"-requirements-windows.lock"',
    '3a855aa577e4e21615eb9a2ab3741f4ee3c71ea86c31e1d2a069518c301ea4ff',
    'adad5582bcdee77451031e1ec3cf9ebc2d9b0cd60ad423bcb0891f62a913fc84',
    'lockHash != expectedLock',
  );
});
test('bootstrap source: finite environment key union and guarded candidate epoch', () => {
  const env = section('string EnvironmentBlock()', 'public BootstrapResult Begin');
  assert.deepEqual(
    [...env.matchAll(/values\.Add\("([^"]+)"/g)].map((m) => m[1]).sort(),
    [
      'FONESI_VISION_HOST_STAGE',
      'FONESI_VISION_HOST_INDEX_SHA256',
      'SystemRoot',
      'WINDIR',
      'PATH',
      'HOME',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'TEMP',
      'TMP',
      'SOURCE_DATE_EPOCH',
      'PIP_CONFIG_FILE',
      'PIP_DISABLE_PIP_VERSION_CHECK',
      'PIP_NO_INPUT',
      'PYTHONDONTWRITEBYTECODE',
      'PYTHONNOUSERSITE',
    ].sort(),
  );
  assert.ok(env.includes('"SOURCE_DATE_EPOCH", "946684800"'));
  assert.ok(env.includes('"PIP_CONFIG_FILE", "NUL"'));
  assert.doesNotMatch(env, /GetEnvironmentVariables|PYTHONPATH|PYTHONHOME|NODE_OPTIONS/);
});
test('bootstrap source: fixed canonical Windows root and private folders', () => {
  includes(
    'const string WindowsRoot = @"C:\\Windows"',
    'Environment.GetFolderPath(Environment.SpecialFolder.Windows) != WindowsRoot',
    '"home", "tmp", "appdata", "localappdata"',
  );
});
test('bootstrap source: no arbitrary arguments, input frame, or executable API', () => {
  includes(
    'public BootstrapResult Begin()',
    'byte[] owned = new byte[0]',
    'foreach (string argument in arguments)',
  );
  assert.doesNotMatch(
    source,
    /public .*\(.*(?:string executable|string\[\] arguments|byte\[\] frame)/,
  );
});
test('bootstrap source: immutable base, wheel closure and initial venv originals held', () => {
  includes(
    'HoldTree(CandidateRoot, "python", hashes)',
    'HoldTree(AcquisitionRoot, wheelhouse, acquisitionHashes)',
    'HoldInitialVenv(target, hashes)',
    'if (!allowed.Contains(name))',
    '"Lib/site-packages"',
  );
  assert.doesNotMatch(source, /HoldTree\(CandidateRoot, target/);
});
test('bootstrap source: exact empty file hash supported; tamper changes digest', () => {
  assert.doesNotMatch(source, /file\.Length < 1/);
  includes('digest != expected', 'after.Links != 1', 'CheckFinal(file.SafeFileHandle, path)');
  assert.equal(
    createHash('sha256').update('').digest('hex'),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.notEqual(
    createHash('sha256').update('x').digest('hex'),
    createHash('sha256').update('').digest('hex'),
  );
});
test('bootstrap source: suspended child assigned to non-breakaway Job before resume', () => {
  includes(
    'CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT | 0x400',
    'limits.BasicLimitInformation.LimitFlags = KILL_ON_JOB_CLOSE',
  );
  assert.ok(
    source.indexOf('Require(AssignProcessToJobObject(job, process))') <
      source.indexOf('Require(ResumeThread(primaryThread)'),
  );
  assert.doesNotMatch(source, /BREAKAWAY_OK|CREATE_BREAKAWAY_FROM_JOB/);
});
test('bootstrap source: explicit handle-list inheritance and byte caps on both streams', () => {
  includes(
    'new IntPtr(0x00020002)',
    'outputLimit = 65536',
    'stdout = TakePipe(ref outputRead, null, outputLimit)',
    'stderr = TakePipe(ref errorRead, null, outputLimit)',
    'thread.Join(0)',
  );
  assert.doesNotMatch(source, /StreamReader|Process\.Start\(/);
});
test('bootstrap source: checked release follows tree and pipe death', () => {
  includes(
    'if (!CloseHandle(handle)) return false',
    'if (launched && !treeDead)',
    'treeDead = true',
    '!TryCloseProcess() || !TryClose(ref job) || !ReleaseAdmission()',
  );
  assert.ok(
    source.indexOf('!TryCloseProcess() || !TryClose(ref job) || !ReleaseAdmission()') <
      source.indexOf('retired = true'),
  );
});
test('bootstrap source: explicit reconciliation retains failures without process reopening', () => {
  includes(
    'milliseconds > 10000',
    'Stopwatch.Frequency * 10',
    'status = "HANDLE_CLOSE_UNCERTAIN"',
    'PauseObservation()',
    'deferredClose.Add(handle)',
    'if (retired || treeDead) return',
  );
  assert.doesNotMatch(source, /OpenProcess\(|taskkill|GetProcessesByName/);
});
test('bootstrap source: public bytes withheld until final retirement and roots preserved', () => {
  includes(
    '!retired || stdout == null',
    '!retired || stderr == null',
    'Work roots are deliberately preserved',
  );
  assert.doesNotMatch(source, /Directory\.Delete|File\.Delete/);
});

test('bootstrap source: operational work stays outside candidate and input closure', () => {
  includes('string parent = Path.Combine(AcquisitionRoot, "work")');
  assert.doesNotMatch(source, /string parent = Path.Combine\(CandidateRoot, "work"\)/);
  assert.doesNotMatch(source, /HoldTree\(AcquisitionRoot, "work"/);
});

test('bootstrap source: pinned Windows venv admits exactly eight initial files', () => {
  const initial = section('HashSet<string> allowed', 'HashSet<string> directories');
  assert.deepEqual(
    [...initial.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort(),
    [
      'pyvenv.cfg',
      'Scripts/python.exe',
      'Scripts/pythonw.exe',
      'Scripts/Activate.ps1',
      'Scripts/activate',
      'Scripts/activate.bat',
      'Scripts/deactivate.bat',
      'Scripts/activate.fish',
    ].sort(),
  );
  includes('foreach (string name in allowed)', 'VENV_INITIAL_MISSING');
});

test('host staging source: finite separate profile set and strict seven-step order', () => {
  assert.equal(
    source.match(/enum HostStagingProfile \{([^}]+)\}/)[1].trim(),
    'Prepare, Bundle, Freeze',
  );
  includes(
    'custody.HostStep != 2',
    'custody.HostStep == 0 && custody.NextProfile == 0',
    'custody.HostStep == 1 && custody.NextProfile == 0',
    'custody.HostStep == 2 && custody.NextProfile == 4',
  );
});
test('host staging source: tool paths derive only from observed trusted runner context', () => {
  includes(
    'context.ToolCacheRoot != Environment.GetEnvironmentVariable("RUNNER_TOOL_CACHE")',
    'context.CheckoutRoot != Environment.GetEnvironmentVariable("GITHUB_WORKSPACE")',
    '"Python/" + context.PythonVersion + "/x64/python.exe"',
    '"node/24.22.1/x64/node.exe"',
  );
  assert.doesNotMatch(source, /HoldTree\(context.ToolCacheRoot/);
  const wrapper = readFileSync(
    new URL('../verification/Invoke-VisionMaterialization.ps1', import.meta.url),
    'utf8',
  );
  assert.ok(
    wrapper.includes(
      "-TypeName 'Fonesi.Development.VisionBootstrap.VisionBootstrapProcess+HostToolContext'",
    ),
  );
});
test('host staging source: Python disables site and inherited startup overrides', () => {
  includes(
    'new string[] { "-I", "-S", "-B", "-c", HostBootstrap }',
    'EndsWith("._pth", StringComparison.OrdinalIgnoreCase)',
    'HOST_STARTUP_OVERRIDE',
  );
  const bootstrap = source.match(/const string HostBootstrap = "([^\n]+)";/)[1];
  assert.ok(bootstrap.includes('sys.path.insert(0,'));
  assert.ok(bootstrap.includes('windows_vision_host.py'));
  assert.ok(bootstrap.includes("run_name='__main__'"));
  assert.doesNotMatch(bootstrap, /context|argv|format/);
});
test('host staging source: exact nine held helper inputs include externally pinned index', () => {
  const files = section(
    'static readonly string[] HostSourceNames',
    'static readonly string[] BundleSourceNames',
  );
  assert.deepEqual(
    [...files.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort(),
    [
      'windows_vision_host.py',
      'windows_vision_catalog.py',
      'windows_vision_materialize.py',
      'windows_vision_prepare.py',
      'windows_materialization_catalog.json',
      'windows_python_members.json',
      'preprocess-requirements-windows.lock',
      'ocr-requirements-windows.lock',
      'source-index.json',
    ].sort(),
  );
  includes(
    'ExactMap(hostSourceHashes, HostSourceNames)',
    'hostIndexHash = helper["source-index.json"]',
    'values.Add("FONESI_VISION_HOST_INDEX_SHA256", hostIndexHash)',
  );
});
test('host staging source: finite bundle graph includes all known imported TS and esbuild code', () => {
  const files = section('static readonly string[] BundleSourceNames', 'const string HostNodeHash');
  assert.equal([...files.matchAll(/"([^"]+)"/g)].length, 22);
  includes(
    'desktop/src/main/adb-discovery.ts',
    'desktop/node_modules/esbuild/lib/main.js',
    'desktop/node_modules/@esbuild/win32-x64/esbuild.exe',
    'ExactMap(bundleSourceHashes, BundleSourceNames)',
    'foreach (string name in BundleSourceNames) HoldFile',
  );
});
test('host staging source: fixed Node identity and only permitted npm literal values', () => {
  includes(
    'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5',
    'context.NpmVersion != "11.9.0" && context.NpmVersion != "11.19.1"',
    '"stage-vision-source.mjs"), context.NpmVersion',
  );
});
test('host staging source: Prepare receives remaining original deadline, no reset', () => {
  includes(
    'deadline = selected == HostStagingProfile.Prepare ? owner.OverallDeadline : Math.Min(owner.OverallDeadline, checked(started + Stopwatch.Frequency * 120))',
  );
});
test('host staging source: closed host env excludes candidate pip and runner context', () => {
  const env = section('string EnvironmentBlock()', 'public BootstrapResult Begin');
  assert.ok(env.includes('if (!hostOperation)'));
  assert.ok(env.includes('if (hostOperation && hostProfile != HostStagingProfile.Bundle)'));
  assert.ok(env.includes('"PREPARE" : "FREEZE"'));
  assert.doesNotMatch(env, /RUNNER_TOOL_CACHE|GITHUB_WORKSPACE|GetEnvironmentVariable/);
  const wrapper = readFileSync(
    new URL('../verification/Invoke-VisionMaterialization.ps1', import.meta.url),
    'utf8',
  );
  assert.ok(
    wrapper.includes("$compilerEnvironment=[Environment]::GetEnvironmentVariables('Process')"),
  );
  assert.ok(
    wrapper.includes(
      "@('PATH','C:\\Windows\\System32'),@('TEMP',$compiledRoot),@('TMP',$compiledRoot)",
    ),
  );
  assert.ok(wrapper.includes('foreach($key in $compilerEnvironment.Keys)'));
});
test('host staging source: fresh Prepare roots and disposable enumeration custody', () => {
  includes(
    'sourceCount != HostSourceNames.Length',
    'PREPARE_NOT_FRESH',
    'HasEntries(Path.Combine(AcquisitionRoot, "work"))',
    'HasEntries(Path.Combine(CandidateRoot, "work"))',
  );
  assert.doesNotMatch(source, /GetEnumerator\(\)\.MoveNext\(/);
});
test('host staging source: observed metadata bounded, not a whole-stdlib claim', () => {
  includes(
    'FileVersionInfo.GetVersionInfo(executable).FileVersion',
    'version.Length > 128',
    'hostToolHash',
    'not an exact stdlib/DLL closure',
    'ExpectedPythonVersion',
  );
});

test('host staging source: public bundle paths return a defensive clone', () => {
  includes(
    'public static string[] BundleSourcePaths { get { return (string[])BundleSourceNames.Clone(); } }',
  );
  assert.doesNotMatch(source, /public static (?:readonly )?string\[\] BundleSourceNames/);
});
