import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const original = readFileSync(
  new URL('../../tools/phase-00/HostProbeNative.cs', import.meta.url),
  'utf8',
);
const derived = readFileSync(new URL('../native/PersistenceProcess.cs', import.meta.url), 'utf8');
test('persistence native helper preserves the frozen ownership/capture/cleanup body', () => {
  assert.equal(
    createHash('sha256').update(original).digest('hex'),
    'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89',
  );
  let expected = original
    .replace(
      '// P0-01 only. No packages; compiled by Windows PowerShell 5.1 Add-Type.',
      '// Persistence launcher only. Derived from frozen HostProbeNative.cs; see README.md.',
    )
    .replace('using System.Text.RegularExpressions;\n', '')
    .replace('namespace Fonesi.Phase00', 'namespace Fonesi.Desktop.Persistence')
    .replaceAll('ProbeResult', 'PersistenceProcessResult')
    .replace('public static class NativeProbe', 'public static class PersistenceProcess')
    .replace(
      '        const uint WAIT_TIMEOUT = 258;',
      '        const uint WAIT_TIMEOUT = 258;\n        const uint INFINITE = 0xffffffff;',
    );
  const begin = expected.indexOf('        public static PersistenceProcessResult Run(');
  const end = expected.indexOf('        static PersistenceProcessResult RunCore(', begin);
  expected =
    expected.slice(0, begin) +
    `        // Fixed caller owns executable hash, arguments, environment and persistent lease.
        // Interactive mode deliberately has no application lifetime deadline.
        public static PersistenceProcessResult RunBounded(string executable, string[] arguments, int timeoutMilliseconds)
        {
            if (timeoutMilliseconds != 30000 && timeoutMilliseconds != 120000)
                throw new ArgumentException("INVALID_DEADLINE");
            return RunCore(executable, arguments, (uint)timeoutMilliseconds, 10000, 32768);
        }

        public static PersistenceProcessResult RunInteractive(string executable, string[] arguments)
        { return RunCore(executable, arguments, INFINITE, 10000, 32768); }

` +
    expected.slice(end);
  expected = expected
    .replace(
      'string[] arguments, string commandTail, int timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters)',
      'string[] arguments, uint timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters)',
    )
    .replace(
      '                if (timeoutMilliseconds < 1 || cleanupMilliseconds < 1 || maxCharacters < 1) throw new ArgumentException("INVALID_LIMIT");',
      `                if ((timeoutMilliseconds != 30000 && timeoutMilliseconds != 120000 && timeoutMilliseconds != INFINITE) || cleanupMilliseconds != 10000 || maxCharacters != 32768) throw new ArgumentException("INVALID_LIMIT");
                if (!Path.IsPathRooted(executable) || !String.Equals(Path.GetExtension(executable), ".exe", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("DIRECT_EXECUTABLE_REQUIRED");`,
    )
    .replace(
      '                if (commandTail != null) command.Append(commandTail);\n                else foreach',
      '                foreach',
    )
    .replace(
      'WaitForSingleObject(process.hProcess, (uint)timeoutMilliseconds)',
      'WaitForSingleObject(process.hProcess, timeoutMilliseconds)',
    );
  const optIn = derived.match(
    / {8}\/\/ BEGIN RETAINED HOST OPT-IN\n[\s\S]*? {8}\/\/ END RETAINED HOST OPT-IN\n\n/,
  );
  assert.ok(optIn);
  assert.equal(
    createHash('sha256').update(optIn[0]).digest('hex'),
    'bbee0d636fbf24526f0c408b9451c08d5e10aa9a9166c29f934c46b720f28254',
  );
  const historical = derived
    .replace(optIn[0], '')
    .replace(
      `        static PersistenceProcessResult RunCore(string executable, string[] arguments, uint timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters)
        { return RunCoreNamed(executable, arguments, timeoutMilliseconds, cleanupMilliseconds, maxCharacters, null); }

        static PersistenceProcessResult RunCoreNamed(string executable, string[] arguments, uint timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters, HostJobContext host)`,
      '        static PersistenceProcessResult RunCore(string executable, string[] arguments, uint timeoutMilliseconds, int cleanupMilliseconds, int maxCharacters)',
    )
    .replace(
      `                string hostMarker = host == null ? null : HostMarker(host);
                if (host != null && HostDigest(executable) != host.imageHash) throw new IOException("HOST_IMAGE_REJECTED");
`,
      '',
    )
    .replace(
      `                job = CreateJobObject(IntPtr.Zero, host == null ? null : host.jobName);
                int jobError = Marshal.GetLastWin32Error(); Require(job != IntPtr.Zero);
                if (host != null && jobError == 183) { Close(ref job); throw new IOException("HOST_JOB_EXISTS"); }`,
      '                job = CreateJobObject(IntPtr.Zero, null); Require(job != IntPtr.Zero);',
    )
    .replace(
      '                if (host != null) WriteHostParent(host, executable, process, hostMarker);\n',
      '',
    );
  assert.equal(historical, expected);
});
test('native lifetime policy separates indefinite UI from bounded operations, without shell entry', () => {
  assert.match(
    derived,
    /RunBounded\(string executable, string\[\] arguments, int timeoutMilliseconds\)/,
  );
  assert.match(derived, /timeoutMilliseconds != 30000 && timeoutMilliseconds != 120000/);
  assert.match(
    derived,
    /RunInteractive\(string executable, string\[\] arguments\)\s*\{ return RunCore\(executable, arguments, INFINITE, 10000, 32768\); \}/,
  );
  assert.doesNotMatch(derived, /RunCmd|commandTail|System\.Text\.RegularExpressions/);
  assert.match(derived, /CREATE_SUSPENDED \| CREATE_NO_WINDOW \| EXTENDED_STARTUPINFO_PRESENT/);
  assert.ok(
    derived.indexOf('AssignProcessToJobObject(job, process.hProcess)') <
      derived.indexOf('ResumeThread(process.hThread)'),
  );
  assert.ok(
    derived.indexOf('WaitForSingleObject(process.hProcess, timeoutMilliseconds)') <
      derived.indexOf('Stopwatch cleanup = Stopwatch.StartNew()'),
  );
});

test('fresh supervisor fixture reserves missing base before validating it without changing native limits', () => {
  const script = readFileSync(
    new URL('../verification/Test-PersistenceProcess.ps1', import.meta.url),
    'utf8',
  );
  const parent = script.indexOf('Plain-Directory $desktop');
  const reserve = script.indexOf('::ReserveDirectory($base)');
  const validate = script.indexOf('Plain-Directory $base');
  assert.ok(parent >= 0 && reserve > parent && validate > reserve);
  assert.match(
    script,
    /if\(-not \(Test-Path -LiteralPath \$base\)\)\{\[Fonesi\.Desktop\.Persistence\.PersistenceProcess\]::ReserveDirectory\(\$base\)\}/,
  );
  assert.match(
    script,
    /\$stage -cin @\('INITIALIZE','HELPER','NODE','BASE','FIXTURE','BOUNDED','INTERACTIVE','DESCENDANT','CLEANUP'\)/,
  );
  assert.doesNotMatch(script, /Write-Output[^\n]*(?:\.Message|\.Stdout|\.Stderr)/);
  assert.match(script, /RunBounded\(\$node,[^\n]*,30000\)/);
  assert.equal((script.match(/::RunInteractive\(/g) || []).length, 2);
});
