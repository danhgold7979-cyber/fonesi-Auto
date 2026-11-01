import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const control = require('../verification/platform-tools-server-control.cjs');
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const source = read('../native/IsolatedAdbServer.cs');
const original = read('../native/PersistenceProcess.cs');
const outer = read('../verification/Invoke-PlatformToolsServer.ps1');
const inner = read('../verification/Test-PlatformToolsServer.ps1');
const section = (text, begin, end) =>
  text.slice(text.indexOf(begin), text.indexOf(end, text.indexOf(begin)));

test('server helper retains reviewed drains, explicit inheritance, suspended Job and bounded retirement', () => {
  assert.equal(
    section(source, '        sealed class Drain', '        public static void ReserveDirectory'),
    section(original, '        sealed class Drain', '        public static void ReserveDirectory'),
  );
  assert.match(
    source,
    /CREATE_SUSPENDED \| CREATE_NO_WINDOW \| EXTENDED_STARTUPINFO_PRESENT \| 0x400/,
  );
  assert.ok(
    source.indexOf('AssignProcessToJobObject(job, process.hProcess)') <
      source.indexOf('ResumeThread(process.hThread)'),
  );
  assert.match(source, /new IntPtr\(0x00020002\)/);
  assert.match(source, /const int cleanupMilliseconds = 10000, maxCharacters = 32768/);
  assert.match(source, /if \(assigned\) TerminateJobObject\(job, 1460\)/);
  assert.match(
    source,
    /WaitForSingleObject\(process.hProcess, 0\) == WAIT_OBJECT_0 && \(!assigned \|\| JobEmpty\(job\)\)/,
  );
  assert.doesNotMatch(source, /RunInteractive|RunCmd|commandTail|kill-server|start-server/);
});

test('occupied endpoint and existing profile negatives exercise actual shared admission, before launch', () => {
  const core = section(
    source,
    'static ServerProcessResult RunCore',
    '\nnamespace Fonesi.Development.Server',
  );
  assert.ok(
    core.indexOf('if (ListenerOwner(port) != 0)') < core.indexOf('EnvironmentBlock(runRoot)'),
  );
  assert.ok(core.indexOf('if (ListenerOwner(port) != 0)') < core.indexOf('Require(CreateProcess('));
  assert.match(
    source,
    /ServerProcessResult refused = RunCore\(executable, port, "occupied", runRoot\)/,
  );
  assert.match(
    source,
    /refused.Status == "ENDPOINT_REFUSED" && !refused.Launched && refused.CleanupComplete/,
  );
  assert.ok(
    source.indexOf('ServerProcessResult refused') <
      source.indexOf('android = Path.Combine(NativeProfile()'),
  );
  assert.match(source, /if \(!ReserveAbsentProfile\(android\)\)/);
  assert.match(
    source,
    /ExistingProfileRefused = !ReserveAbsentProfile\(android\) && ProfileWitness\(android, token, false\) == token/,
  );
  assert.match(
    source,
    /CollisionEndpointReleased = collisionPort != 0 && ListenerOwner\(collisionPort\) == 0/,
  );
  assert.match(inner, /\$occupied.endpointReleased=\$native.CollisionEndpointReleased/);
  assert.match(
    source,
    /CollisionOwnerUnchanged = result.CollisionRefused && ListenerOwner\(port\) == owner && collision.Server.IsBound/,
  );
});

test('native home, exact suppression and health are fixed; no configurable device or server authority', () => {
  assert.match(source, /SHGetKnownFolderPath\(ref profile, 0, IntPtr.Zero, out value\)/);
  assert.match(source, /SHGetFolderPath\(IntPtr.Zero, 0x28, IntPtr.Zero, 0, legacy\)/);
  assert.match(source, /new string\[\] \{ "-L", "tcp:127.0.0.1:" \+ port, "server", "nodaemon" \}/);
  for (const name of ['ADB_USB', 'ADB_EMU', 'ADB_MDNS'])
    assert.ok(source.includes(`env.Add("${name}", "0")`));
  const environment = section(
    source,
    'static IntPtr EnvironmentBlock',
    'static uint ListenerOwner',
  );
  assert.doesNotMatch(environment, /USERPROFILE|HOME|VENDOR_KEYS|GetEnvironmentVariables/);
  assert.match(source, /Encoding.ASCII.GetBytes\("000chost:version"\)/);
  assert.match(source, /if \(version == "0000"\)/);
  const health = section(source, 'static bool Health', 'static int FreePort');
  assert.equal((health.match(/ListenerOwner\(port\) != pid/g) || []).length, 2);
  assert.ok(
    health.indexOf('socket.EndConnect(pending)') < health.lastIndexOf('ListenerOwner(port) != pid'),
  );
  assert.ok(
    health.lastIndexOf('ListenerOwner(port) != pid') < health.indexOf('socket.Send(request'),
  );
});

test('health-first deadline/death and key cleanup preserve uncertainty without recursive deletion', () => {
  assert.ok(
    source.indexOf('if (!result.HealthObserved)') < source.indexOf('if (scenario == "timeout")'),
  );
  assert.match(source, /while \(elapsed.ElapsedMilliseconds < 30000\)/);
  assert.match(
    source,
    /result.PrematureDeathObserved = WaitForSingleObject\(process.hProcess, 5000\) == WAIT_OBJECT_0/,
  );
  assert.match(source, /".fonesi-server-owner,adbkey,adbkey.pub"/);
  assert.match(source, /info.Links != 1/);
  assert.match(source, /CreateFile\(android, 0x80, 3, ref security, 3, 0x02000000/);
  const cleanup = source.indexOf('File.Delete(Path.Combine(android, "adbkey"))');
  assert.ok(source.indexOf('if (!Good(result.Timeout)') < cleanup);
  assert.ok(source.indexOf('if (ProfileWitness(android, token, true) != witness)') < cleanup);
  assert.doesNotMatch(source, /Directory.Delete\([^\n]*true\)/);
  assert.match(source, /finally \{ if \(directoryGuard != null\) directoryGuard.Dispose\(\); \}/);
  assert.ok(
    source.indexOf('result.ProfileCleaned = true') >
      source.indexOf('Directory.Delete(android, false)'),
  );
});

test('checked-in fresh PS entry binds complete source closure and exact pins with bounded private transport', () => {
  for (const name of control.SOURCES) assert.ok(inner.includes(`'${name}'`), name);
  for (const value of [...control.CONTROL_PHASES, ...control.CONTROL_REASONS])
    assert.ok(outer.includes(`'${value}'`), value);
  const hash = createHash('sha256')
    .update(read('../../tools/phase-00/HostProbeNative.cs'))
    .digest('hex');
  assert.ok(outer.includes(hash));
  assert.match(outer, /'Test-PlatformToolsServer.ps1'\),\$root\),120000,10000,32768/);
  assert.match(outer, /\$env:GITHUB_ACTIONS -cne 'true'/);
  assert.match(outer, /Node-Control 'verify';Assert-OwnedRun \$owner/);
  assert.match(inner, /\$_.path -ceq 'adb.exe'/);
  assert.match(inner, /\$entryCount -gt 14/);
  assert.match(inner, /\$report.cases.candidateUnchanged=\$true/);
  assert.ok(
    outer.indexOf("Require $native 'P202_SERVER_OBSERVED'") <
      outer.indexOf("Node-Control 'cleanup'"),
  );
  assert.match(outer, /Remove-VerifiedOwnedRun \$owner \$allClean/);
  const literals = section(source, 'static string FixedReason', 'static bool AssignedToJob').match(
    /"[A-Z_]+"/g,
  );
  for (const literal of literals) {
    const quoted = `'${literal.slice(1, -1)}'`;
    assert.ok(inner.includes(quoted), quoted);
    assert.ok(outer.includes(quoted), quoted);
  }
  assert.match(outer, /\$count -eq 1 -and \$shown -lt 6/);
  assert.match(source, /privateKey.Length \+ publicKey.Length \+ 36 > 65536/);
  assert.doesNotMatch(outer, /Invoke-Expression|process\.noAsar|Set-Acl|New-LocalUser/);
});

function assertManualGates(raw) {
  const workflow = raw.replace(/\r\n/g, '\n');
  for (const flag of ['run_adb_version', 'run_adb_server']) {
    assert.match(
      workflow,
      new RegExp(`${flag}:\\n[\\s\\S]*?type: boolean\\n        default: false`),
    );
    assert.ok(workflow.includes(`if: inputs.${flag}`));
    assert.ok(workflow.includes(`if: always() && inputs.${flag}`));
  }
  assert.ok(
    workflow.includes(
      "if: github.event_name == 'workflow_dispatch' && (inputs.run_adb_version || inputs.run_adb_server)",
    ),
  );
  for (const [flag, name] of [
    [
      'run_adb_version',
      'Owned exact app-local version command only, no server or device operations',
    ],
    ['run_adb_server', 'Owned isolated foreground server and fixed host-version health only'],
  ]) {
    const step = workflow.split(`      - name: ${name}\n`);
    assert.equal(step.length, 2);
    const body = step[1].split('      - name: ')[0];
    assert.ok(body.startsWith(`        if: inputs.${flag}\n        run: |\n`));
  }
  const sourceJob = section(
    workflow,
    '  windows-software-only:',
    '  owned-adb-version-development:',
  );
  assert.doesNotMatch(sourceJob, /Invoke-PlatformTools|fetch_platform_tools/);
  assert.equal((workflow.match(/fetch_platform_tools.py/g) ?? []).length, 1);
}

test('ordinary source pushes cannot invoke development binaries; version and server require separate manual opt-ins', () => {
  const workflow = read('../../.github/workflows/phase-02-software.yml').replace(/\r\n/g, '\n');
  assertManualGates(workflow);
  assertManualGates(workflow.replace(/\n/g, '\r\n'));
  for (const flag of ['run_adb_version', 'run_adb_server']) {
    assert.throws(() => assertManualGates(workflow.replace(`${flag}:`, `${flag}_missing:`)));
    assert.throws(() =>
      assertManualGates(
        workflow.replace(
          `if: inputs.${flag}\n        run: |\n          try`,
          'if: true\n        run: |\n          try',
        ),
      ),
    );
  }
  assert.throws(() => assertManualGates(workflow.replace(/default: false/g, 'default: true')));
  assert.throws(() =>
    assertManualGates(workflow.replace("github.event_name == 'workflow_dispatch' && ", '')),
  );
});
