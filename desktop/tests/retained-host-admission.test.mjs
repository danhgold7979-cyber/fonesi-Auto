// Source/derivation checks, not Windows compilation or runtime admission evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = readFileSync(new URL('../native/RetainedHostAdmission.cs', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('../native/PersistenceProcess.cs', import.meta.url), 'utf8');
function before(text, a, b) {
  assert.ok(text.indexOf(a) >= 0 && text.indexOf(a) < text.indexOf(b), `${a} before ${b}`);
}
test('original server and current catalog-aware session source pins remain exact', () => {
  for (const [file, hash] of [
    ['IsolatedAdbServer.cs', '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7'],
    ['RetainedAdbSession.cs', 'be62300592244f1474fa340101976cb86ad5ed5c6734b98b28dc545d6b00ce71'],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('../native/' + file, import.meta.url)))
        .digest('hex'),
      hash,
    );
});
test('named outer Job is opt-in, existing object refused, receipt occurs before resume', () => {
  assert.match(
    launcher,
    /RunInteractiveWithHostJob\(string executable, string\[\] arguments, HostJobContext context\)/,
  );
  assert.match(launcher, /host == null \? null : host.jobName/);
  const job = launcher.slice(launcher.indexOf('job = CreateJobObject'));
  before(job, 'Marshal.GetLastWin32Error()', 'jobError == 183');
  before(job, 'jobError == 183', 'CreateProcess(executable');
  before(
    job,
    'AssignProcessToJobObject(job, process.hProcess)',
    'WriteHostParent(host, executable, process, hostMarker)',
  );
  before(
    job,
    'WriteHostParent(host, executable, process, hostMarker)',
    'ResumeThread(process.hThread)',
  );
  assert.match(job, /limits.BasicLimitInformation.LimitFlags = KILL_ON_JOB_CLOSE/);
  assert.doesNotMatch(launcher, /BREAKAWAY_OK|SILENT_BREAKAWAY_OK|Process\.Start\(/);
});
test('native parent receipt uses exact FILETIME, exclusive durable write/readback and fixed fields', () => {
  for (const field of [
    'launchId',
    'storeId',
    'ownerToken',
    'readySha256',
    'jobName',
    'parentPid',
    'parentCreationFileTime',
    'parentImagePath',
    'parentImageSha256',
  ])
    assert.ok(launcher.includes('\\"' + field + '\\"'));
  assert.match(launcher, /GetProcessTimes\(process.hProcess, out creation/);
  assert.match(launcher, /creation.ToString\("x16"/);
  assert.match(launcher, /FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None/);
  assert.match(launcher, /file.Flush\(true\); file.Position = 0/);
  assert.match(launcher, /bytes.Length > 4096/);
  assert.doesNotMatch(launcher, /GetCreationTime|DateTime.Now|DateTime.UtcNow|GetProcessById/);
});
test('parent admission retains least-rights process identity and closes transient Job before return', () => {
  assert.match(source, /OpenProcess\(0x00101000, false, parentPid\)/);
  assert.match(source, /OpenJobObject\(0x0004, false, jobName\)/);
  assert.match(source, /creation.ToString\("x16"/);
  assert.match(source, /QueryFullProcessImageName\(raw, 0, image, ref size\)/);
  assert.match(source, /ParentImageDigest\(imagePath\) != imageSha256/);
  assert.match(source, /limits.BasicLimitInformation.LimitFlags != KILL_ON_JOB_CLOSE/);
  assert.match(source, /AssignedToJob\(raw, job\)/);
  assert.match(source, /AssignedToJob\(self.Handle, job\)/);
  const end = source.slice(source.indexOf('// Close BEFORE'));
  before(end, 'Close(ref job)', 'ParentAdmission admitted');
  assert.match(end, /finally \{ Close\(ref job\); if \(parent != null\) parent.Dispose\(\); \}/);
  const retained = source.slice(
    source.indexOf('public sealed class ParentAdmission'),
    source.indexOf('static string ParentImageDigest'),
  );
  assert.doesNotMatch(retained, /OpenProcess|OpenJobObject|job;/);
  assert.match(retained, /SafeWaitHandle process/);
  assert.match(
    retained,
    /public Func<bool> Liveness\(\) \{ return delegate \{ return IsAlive; \}; \}/,
  );
  assert.match(retained, /milliseconds > 1000/);
});
test('admission is fixed failure/no effects and stream hashing retains exact file identity', () => {
  assert.doesNotMatch(
    source,
    /CreateProcess|CreateDirectory|WriteAllText|TerminateJobObject|ResumeThread|GetEnvironmentVariable/,
  );
  assert.match(source, /catch \{ throw new IOException\("ADMISSION_REJECTED"\); \}/);
  assert.match(source, /before.Links != 1/);
  assert.match(source, /after.IndexLow != before.IndexLow/);
  assert.match(source, /FileShare.Read/);
  assert.match(source, /hash.ComputeHash\(file\)/);
});
test('launcher opt-in is explicit normal-only and journaled MAIN alone receives named context', () => {
  const core = readFileSync(new URL('../launch/launch-core.ps1', import.meta.url), 'utf8');
  for (const file of ['Invoke-Desktop.ps1', 'Invoke-Package.ps1']) {
    const wrapper = readFileSync(new URL(`../launch/${file}`, import.meta.url), 'utf8');
    assert.match(wrapper, /\[switch\]\$EnableRetainedHost/);
    assert.match(wrapper, /-EnableRetainedHost:\$EnableRetainedHost/);
  }
  assert.match(
    core,
    /\$EnableRetainedHost -and \(\$Maintenance -or \$Selection -ceq 'Store' -or \$RecoverRetainedLaunch\)/,
  );
  assert.match(core, /\$Stage -ceq 'MAIN' -and \$EnableRetainedHost/);
  assert.match(core, /RunInteractiveWithHostJob\(\$Exe,\$Arguments,\$HostContext\)/);
  assert.match(core, /if\(\$Interactive\)\{return .*RunInteractive\(\$Exe,\$Arguments\)\}/);
  assert.ok(core.includes(createHash('sha256').update(launcher).digest('hex')));
});
