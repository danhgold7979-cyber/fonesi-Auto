// Source/derivation contracts ONLY. These tests do not compile or execute C# or ADB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const original = readFileSync(new URL('../native/IsolatedAdbServer.cs', import.meta.url));
const source = readFileSync(new URL('../native/RetainedAdbSession.cs', import.meta.url), 'utf8');
function body(signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, signature);
  const open = source.indexOf('{', start);
  let depth = 1;
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  assert.fail('Unbalanced method');
}
function before(text, left, right) {
  assert.ok(
    text.indexOf(left) >= 0 && text.indexOf(left) < text.indexOf(right),
    `${left} before ${right}`,
  );
}
test('source extension binds unchanged reviewed helper and reuses interop without a second implementation', () => {
  assert.equal(
    createHash('sha256').update(original).digest('hex'),
    '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7',
  );
  assert.match(source, /namespace Fonesi\.Development\.Server/);
  assert.match(source, /public static partial class IsolatedAdbServer/);
  assert.doesNotMatch(
    source,
    /DllImport|static extern|Process\.Start|Process\.GetProcesses|kill-server|start-server/,
  );
  for (const helper of [
    'CreateProcess',
    'AssignProcessToJobObject',
    'TakeDrain',
    'QuoteArgument',
    'JobEmpty',
    'AssignedToJob',
    'ListenerOwner',
    'NativeProfile',
    'ReserveAbsentProfile',
    'ProfileWitness',
    'ExactOwner',
  ])
    assert.ok(source.includes(`${helper}(`));
});
test('opaque attempt reservation is memory-only and rejects reuse until exact retirement', () => {
  const reserve = body('public Attempt Reserve(');
  assert.match(reserve, /current != null && !current\.terminal/);
  assert.match(reserve, /Int64\.MaxValue/);
  assert.doesNotMatch(reserve, /File|Directory|CreateProcess|Socket|Profile|Launch/);
  assert.match(source, /internal Attempt\(object state\)/);
  assert.match(body('bool Exact('), /Object\.ReferenceEquals\(a\.provider, this\)/);
  assert.match(body('bool Exact('), /Object\.ReferenceEquals\(current, a\)/);
});
test('effectful launch preserves suspended assignment and shared stopping gates before create and resume', () => {
  const launch = body('void Launch(');
  before(launch, 'if (a.stopping)', 'Require(CreateProcess');
  before(launch, 'Require(CreateProcess', 'AssignProcessToJobObject');
  before(launch, 'AssignProcessToJobObject', 'ResumeThread');
  const resume = launch.indexOf('Require(ResumeThread');
  assert.match(
    launch.slice(launch.lastIndexOf('lock (gate)', resume), resume),
    /if \(a\.stopping\)/,
  );
  assert.match(launch, /CREATE_SUSPENDED \| CREATE_NO_WINDOW \| EXTENDED_STARTUPINFO_PRESENT/);
  assert.match(launch, /KILL_ON_JOB_CLOSE/);
  assert.match(launch, /new string\[\] \{ "version" \}/);
  assert.match(
    launch,
    /new string\[\] \{ "-L", "tcp:127\.0\.0\.1:" \+ a.port, "server", "nodaemon" \}/,
  );
  assert.match(launch, /TakeDrain\(ref outputRead, 32768\)/);
});
test('retirement cannot emit terminal facts before workers, job, drains, endpoint and profile/root cleanup', () => {
  const retire = body('Reply RetireObserved(');
  before(retire, 'a.stopping = true', 'while (!workersSettled)');
  before(retire, 'workersSettled = a.workers == 0', 'TerminateJobObject');
  for (const proof of [
    'JobEmpty(a.job)',
    'a.stdout.Join',
    'a.stderr.Join',
    'ListenerOwner(a.port)',
    'SameProfile(a)',
    'ProfileWitness(a.android, owner, keys)',
    'Directory.Delete(a.android, false)',
  ])
    before(retire, proof, 'a.terminal = true');
  assert.equal((retire.match(/ExactOwner\(root, owner\)/g) || []).length, 3);
  assert.match(retire, /catch \{ return Failure\("UNRETIRED"\); \}/);
  assert.doesNotMatch(retire, /Directory.Delete\([^\n]*true\)/);
});
test('profile reservation is native absent-only and partial/changed inventories do not authorize deletion', () => {
  const profile = body('void Profile('),
    retire = body('Reply RetireObserved(');
  before(profile, 'NativeProfile()', 'ReserveAbsentProfile');
  before(profile, 'ReserveAbsentProfile', 'a.profileReserved = true');
  assert.match(profile, /FileMode.CreateNew/);
  assert.match(profile, /marker.Flush\(true\)/);
  assert.match(retire, /ProfileWitness\(a.android, owner, keys\)/);
  before(retire, 'witness != a.profileWitness', 'File.Delete');
  assert.doesNotMatch(
    source,
    /SetEnvironmentVariable|USERPROFILE|GetEnvironmentVariable|Impersonate|SetToken|SetAccessControl/,
  );
});
test('version and live-session observations use distinct retained facts and bounded fixed health only', () => {
  const facts = body('Reply Facts(');
  assert.match(facts, /a.kind == "VERSION" \? "INVOCATION" : "SESSION"/);
  assert.match(facts, /"processRetired", a.terminal/);
  assert.match(facts, /a.terminal \? "RETIRED" : "LIVE"/);
  assert.match(body('Reply VersionCore('), /Reply retired = RetireCore\(a\)/);
  assert.match(body('Reply VersionCore('), /a.exit != 0/);
  assert.match(
    body('Reply VersionCore('),
    /VersionOutputMatches\(a.stdout.Snapshot\(\), executable, expectedRelease, expectedBuildGrammar\)/,
  );
  assert.match(body('internal static bool VersionOutputMatches('), /"Installed as " \+ executable/);
  assert.match(body('Reply StartForegroundCore('), /observed && !a.stopping/);
  assert.match(
    body('Reply HealthCore('),
    /IsolatedAdbServer.Health\(a.port, a.process.hProcess, a.process.dwProcessId\)/,
  );
  assert.match(body('bool Live('), /AssignedToJob/);
  assert.match(source, /deadline.ElapsedMilliseconds < 30000/);
});

test('retirement lock acquisition shares its finite budget and never blocks on Monitor.Wait reacquisition', () => {
  const retire = body('Reply RetireObserved(');
  before(retire, 'Stopwatch deadline = Stopwatch.StartNew()', 'RetirementLock(gate, deadline)');
  assert.match(retire, /RetirementLock\(cleanupGate, deadline\)/);
  assert.doesNotMatch(retire, /lock \(|Monitor.Wait/);
  assert.match(body('static bool RetirementLock('), /Monitor.TryEnter/);
  assert.match(source, /sealed class State/);
  assert.match(body('public sealed class Attempt'), /internal readonly object state/);
  assert.doesNotMatch(body('public sealed class Attempt'), /PROCESS_INFORMATION|Drain|FILE_INFO/);
});

test('inherited destructive Drain.Join is attempted once; successful drains are skipped and uncertain drains remain retained', () => {
  const retire = body('Reply RetireObserved(');
  for (const name of ['stdout', 'stderr']) {
    assert.ok(retire.includes(`a.${name} != null && !a.${name}Joined`));
    before(
      retire,
      `if (a.${name}JoinAttempted) return Failure("UNRETIRED")`,
      `a.${name}JoinAttempted = true`,
    );
    before(retire, `a.${name}JoinAttempted = true`, `a.${name}Joined = a.${name}.Join`);
  }
});

test('foreground failure exposes only fixed admission categories and unresolved cleanup takes precedence', () => {
  const classifier = body('static string AdmissionFailure(');
  for (const code of [
    'PROFILE_REJECTED',
    'BINARY_CHANGED',
    'ADMISSION_REJECTED',
    'ENDPOINT_REJECTED',
  ])
    assert.ok(classifier.includes(`code == "${code}"`));
  assert.match(classifier, /\? code : "NATIVE_FAILED"/);
  assert.match(
    body('Reply StartForegroundCore('),
    /Failure\(a.terminal \? failure : "UNRETIRED"\)/,
  );
  assert.doesNotMatch(source, /Failure\(error\.Message\)/);
});

test('native progress is bounded opt-in telemetry and preserves original retirement implementation', () => {
  assert.match(
    source,
    /: this\(ownedRunRoot, ownerToken, verifiedExecutable, expectedExeSha256, false\)/,
  );
  assert.match(
    source,
    /enum ProgressSlot \{ ADMISSION, LAUNCH, LAUNCH_END, EXIT, RETIRE_BEGIN, RETIRE_END \}/,
  );
  assert.match(source, /if \(!diagnostics\) return/);
  assert.match(source, /Interlocked.CompareExchange\(ref diagnosticSlots, before \| bit, before\)/);
  assert.match(source, /if \(\(before & bit\) != 0\) return/);
  assert.match(body('Reply RetireCore('), /try \{ return RetireObserved\(a\); \}/);
  assert.match(body('Reply RetireCore('), /finally \{ Progress\(ProgressSlot.RETIRE_END\); \}/);
  before(body('Reply VersionCore('), 'Progress(ProgressSlot.LAUNCH)', 'Launch(a)');
  before(body('Reply VersionCore('), 'Launch(a)', 'Progress(ProgressSlot.LAUNCH_END)');
  assert.match(body('Reply VersionCore('), /if \(observed\) Progress\(ProgressSlot.EXIT\)/);
});

test('selected release is immutable, absolutely bounded and literal escaped rather than caller regex', () => {
  assert.match(
    source,
    /readonly string root, owner, executable, executableHash, expectedRelease, expectedBuildGrammar/,
  );
  assert.match(
    source,
    /: this\(ownedRunRoot, ownerToken, verifiedExecutable, expectedExeSha256, "37\.0\.1", "DECIMAL_1_20", diagnostics\)/,
  );
  const check = body('internal static bool VersionExpectationValid('),
    parse = body('internal static bool VersionOutputMatches(');
  assert.match(check, /release.Length <= 32/);
  assert.ok(check.includes('"\\\\A[0-9]+\\\\.[0-9]+\\\\.[0-9]+\\\\z"'));
  assert.match(check, /buildGrammar == "DECIMAL_1_20"/);
  assert.match(parse, /lines\[0\] == "Android Debug Bridge version 1\.0\.41"/);
  assert.match(parse, /Regex.Escape\(release\)/);
  assert.ok(parse.includes('[0-9]{1,20}\\\\z'));
  assert.match(parse, /output.Length > 32768/);
  assert.doesNotMatch(
    check + parse,
    /Launch\(|Reserve\(|Process|File\.|Directory\.|Socket|Profile\(|NativeProfile|DllImport/,
  );
  before(body('Reply VersionCore('), 'Reply retired = RetireCore(a)', 'VersionOutputMatches(');
});
test('current bootstrap v2 supplies exact catalog expectations while old live v1 cannot enter provider', () => {
  const ps = readFileSync(new URL('../launch/Invoke-RetainedHost.ps1', import.meta.url), 'utf8');
  const keys = ps.match(/\$b=Parse \$raw @\(([^\n]+)\)/)?.[1];
  assert.ok(keys);
  assert.deepEqual(
    [...keys.matchAll(/'([^']+)'/g)].map((v) => v[1]),
    [
      'version',
      'operationSet',
      'sessionId',
      'launchId',
      'storeId',
      'ownerToken',
      'parentReceiptSha256',
      'readySha256',
      'runRoot',
      'adbPath',
      'adbExeSha256',
      'candidateArchiveSha256',
      'candidateManifestSha256',
      'installationRevision',
      'expectedRelease',
      'expectedBuildGrammar',
      'assets',
    ],
  );
  assert.match(
    ps,
    /if\(\$b.version -ne 2 -or \(\$b.operationSet -cne 'VERSION_ONLY' -and \$b.operationSet -cne 'SERVER_ONLY'\)\)\{Reject\}/,
  );
  assert.ok(ps.includes("$b.expectedRelease -cnotmatch '\\A[0-9]+\\.[0-9]+\\.[0-9]+\\z'"));
  assert.match(ps, /\$b.expectedRelease.Length -gt 32/);
  assert.match(ps, /\$b.expectedBuildGrammar -cne 'DECIMAL_1_20'/);
  assert.ok(
    ps.includes(
      'RetainedProvider($b.runRoot,$b.ownerToken,$b.adbPath,$b.adbExeSha256,$b.expectedRelease,$b.expectedBuildGrammar,$true)',
    ),
  );
  before(ps, "$b.expectedBuildGrammar -cne 'DECIMAL_1_20'", '$provider=New-Object');
});
test('new managed A/B parser groups are source-only and separate from historical eight protocol groups', () => {
  const fixture = readFileSync(
    new URL('./fixtures/RetainedAdbProtocolFixture.cs', import.meta.url),
    'utf8',
  );
  const pure = fixture.slice(
    fixture.indexOf('public static int RunVersionExpectations()'),
    fixture.indexOf('class ServerProvider :'),
  );
  assert.match(pure, /new string\[\]\{"37\.0\.1","36\.0\.0"\}/);
  assert.match(pure, /return 2;/);
  assert.match(pure, /VersionOutputMatches/);
  assert.match(pure, /VersionExpectationValid/);
  assert.doesNotMatch(
    pure,
    /new RetainedProvider|new IsolatedAdbServer|\.Reserve\(|\.Version\(|Process|NativeProfile|Socket|File\./,
  );
  assert.match(pure, /123456789012345678901/);
  assert.match(pure, /1\.0\.42/);
  assert.match(pure, /DECIMAL_1_20\\n/);
  assert.equal((fixture.match(/passed\+\+;/g) || []).length, 8);
});

test('discovery framing uses fixed service, absolute bounded I/O and retained connect accounting', () => {
  const codec = body('internal static byte[] ReadDevicesList(');
  assert.match(codec, /000ehost:devices-l/);
  before(codec, 'if(length>32768)', 'new byte[length]');
  assert.match(codec, /trailing!=0/);
  assert.match(codec, /new UTF8Encoding\(false,true\)/);
  const query = body('public AcquisitionReply Discover(');
  before(query, 'a.acquisition=q;', 'Task.Factory.FromAsync');
  assert.match(query, /q.socket.BeginConnect,q.socket.EndConnect,IPAddress.Loopback,a.port/);
  assert.match(query, /q.connect.GetAwaiter\(\).GetResult\(\)/);
  assert.match(query, /observed=budget.Observed\(\)/);
  assert.match(source, /duration-elapsed.ElapsedMilliseconds/);
  assert.match(source, /connect==null\|\|connect.IsCompleted/);
  const retire = body('Reply RetireObserved(');
  before(retire, 'CloseAcquisition(a,deadline,10000)', 'while (!workersSettled)');
  assert.match(retire, /a.workers == 0 && AcquisitionSettled\(a,deadline,10000\)/);
});
