// Actual owned files with injected compiler results; never executes a compiler or DLL here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileRetainedHelper } from '../scripts/compile-retained-helper.mjs';
function fixture() {
  const base = realpathSync.native(
      mkdtempSync(join(realpathSync.native(tmpdir()), 'retained-compile-test-')),
    ),
    root = join(base, 'app'),
    framework = join(base, 'framework'),
    tempParent = join(base, 'tmp');
  for (const p of [root, framework, tempParent, join(root, 'native')]) mkdirSync(p);
  for (const n of ['csc.exe', 'mscorlib.dll', 'System.dll', 'System.Core.dll'])
    writeFileSync(join(framework, n), 'synthetic compiler fixture');
  for (const n of ['IsolatedAdbServer.cs', 'RetainedAdbSession.cs'])
    copyFileSync(new URL(`../native/${n}`, import.meta.url), join(root, 'native', n));
  for (const p of [base, root, framework, tempParent]) assert.equal(realpathSync.native(p), p);
  return { base, root, framework, tempParent };
}
const clean = (f) => rmSync(f.base, { recursive: true, force: true });
const success = { status: 0, signal: null, stdout: '', stderr: '' };
test('compile-only fixed args use actual sources, no shell/config/assembly execution and exact owned cleanup', () => {
  const f = fixture();
  try {
    let calls = 0;
    const result = compileRetainedHelper({
      ...f,
      run: (exe, args, options) => {
        calls++;
        assert.equal(exe, join(f.framework, 'csc.exe'));
        assert.deepEqual(args.slice(0, 7), [
          '/noconfig',
          '/nologo',
          '/nostdlib+',
          '/target:library',
          '/optimize+',
          '/debug-',
          '/langversion:5',
        ]);
        assert.deepEqual(
          args.slice(-2),
          ['IsolatedAdbServer.cs', 'RetainedAdbSession.cs'].map((n) => join(f.root, 'native', n)),
        );
        assert.equal(options.shell, false);
        assert.equal(options.timeout, 30000);
        assert.equal(options.maxBuffer, 65536);
        assert.equal(Object.hasOwn(options.env, 'PATH'), false);
        assert.equal(options.env.TEMP, options.cwd);
        writeFileSync(
          args.find((a) => a.startsWith('/out:')).slice(5),
          Buffer.from('MZsynthetic compiler bytes'),
        );
        return success;
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.passed, true);
    assert.equal(result.directoryCleanup, true);
    assert.deepEqual(readdirSync(f.tempParent), []);
  } finally {
    clean(f);
  }
});
test('compiler error codes are finite and raw paths/source never become diagnostics', () => {
  const f = fixture();
  try {
    const result = compileRetainedHelper({
      ...f,
      run: () => ({
        ...success,
        status: 1,
        stdout: 'C:\\private-canary.cs(1): error CS0122: private secret\nerror CS9999: secret',
      }),
    });
    assert.equal(result.passed, false);
    assert.equal(result.status, 'NONZERO');
    assert.equal(result.compilerRetired, true);
    assert.equal(result.directoryCleanup, true);
    assert.deepEqual(result.diagnostics, ['CS0122', 'OTHER']);
    assert.doesNotMatch(JSON.stringify(result), /private|secret/);
  } finally {
    clean(f);
  }
});
test('unknown compiler retirement and unexpected output preserve the exact owned directory', () => {
  for (const mode of ['timeout', 'extra']) {
    const f = fixture();
    try {
      const result = compileRetainedHelper({
        ...f,
        run: (_exe, args, options) => {
          if (mode === 'timeout') return { ...success, status: null, error: { code: 'ETIMEDOUT' } };
          writeFileSync(args.find((a) => a.startsWith('/out:')).slice(5), 'MZfixture');
          writeFileSync(join(options.cwd, 'unknown'), 'untouched');
          return success;
        },
      });
      assert.equal(result.passed, false);
      assert.equal(result.directoryCleanup, false);
      const roots = readdirSync(f.tempParent);
      assert.equal(roots.length, 1);
      assert.ok(readdirSync(join(f.tempParent, roots[0])).includes('owner.json'));
      if (mode === 'extra')
        assert.equal(readFileSync(join(f.tempParent, roots[0], 'unknown'), 'utf8'), 'untouched');
    } finally {
      clean(f);
    }
  }
});
test('changed original helper refuses before compiler and source mutation cannot produce PASS', () => {
  for (const mode of ['before', 'during']) {
    const f = fixture();
    try {
      let calls = 0;
      const file = join(f.root, 'native', 'IsolatedAdbServer.cs');
      if (mode === 'before') writeFileSync(file, 'changed');
      const result = compileRetainedHelper({
        ...f,
        run: (_exe, args) => {
          calls++;
          writeFileSync(file, 'changed');
          writeFileSync(args.find((a) => a.startsWith('/out:')).slice(5), 'MZfixture');
          return success;
        },
      });
      assert.equal(result.passed, false);
      assert.equal(calls, mode === 'before' ? 0 : 1);
    } finally {
      clean(f);
    }
  }
});
test('compile workflow is default-off exact opt-in after source checks, never an assembly invocation', () => {
  const raw = readFileSync(
    new URL('../../.github/workflows/phase-02-software.yml', import.meta.url),
    'utf8',
  );
  const check = (text) => {
    const s = text.replace(/\r\n/g, '\n');
    assert.match(s, /run_retained_compile:\n(?:[^\n]*\n){3} {8}default: false/);
    const step = s
      .split('      - name: Retained helper compile only without assembly execution\n')[1]
      ?.split('      - name:')[0];
    assert.ok(step);
    assert.match(
      step,
      /if: false && \(github.ref == 'refs\/heads\/phase-02' && \(\(github.event_name == 'workflow_dispatch' && inputs.run_retained_compile == true\) \|\| \(github.event_name == 'push' && contains\(github.event.head_commit.message, '\[retained-compile\]'\)\)\)\)/,
    );
    assert.match(step, /node desktop\/scripts\/compile-retained-helper.mjs/);
    assert.ok(
      s.indexOf('node desktop/scripts/check.mjs --restore') <
        s.indexOf('      - name: Retained helper compile only'),
    );
  };
  check(raw);
  check(raw.replace(/\r?\n/g, '\r\n'));
  assert.throws(() =>
    check(
      raw.replace(
        "if: false && (github.ref == 'refs/heads/phase-02' && ((github.event_name == 'workflow_dispatch' && inputs.run_retained_compile == true)",
        "if: true || ((github.event_name == 'workflow_dispatch' && inputs.run_retained_compile == true)",
      ),
    ),
  );
  assert.throws(() =>
    check(raw.replace('inputs.run_retained_compile == true', 'inputs.run_adb_server == true')),
  );
  const source = readFileSync(
    new URL('../scripts/compile-retained-helper.mjs', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /Assembly\.Load|Add-Type|Import-Module|execFile|powershell|\.invoke\(/,
  );
  assert.match(source, /v4\.0\.30319/);
});
test('noncanonical owned input is refused before any compiler handoff without weakening physical admission', () => {
  const f = fixture();
  try {
    let calls = 0;
    const result = compileRetainedHelper({
      ...f,
      root: f.root + '/../app',
      run: () => {
        calls++;
        return success;
      },
    });
    assert.equal(result.passed, false);
    assert.equal(result.stage, 'ADMISSION');
    assert.equal(calls, 0);
    assert.deepEqual(readdirSync(f.tempParent), []);
  } finally {
    clean(f);
  }
});
