// Actual owned files plus injected child streams only; never invokes PowerShell or native code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  runPairedStartup,
  materializeScript,
  SOURCE_SHA256,
  BODY_SHA256,
  BOOTSTRAP,
  CASES,
  ENTRY,
} = require('../verification/retained-pipe-startup.cjs');
function fixture(t) {
  const root = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'retained-pipe-test-')),
    ),
    owner = randomUUID();
  fs.writeFileSync(path.join(root, '.owner'), owner, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'synthetic-powershell.exe'), 'synthetic executable identity', {
    flag: 'wx',
  });
  t.after(() => fs.rmSync(root, { recursive: true }));
  return {
    root,
    owner,
    powershell: path.join(root, 'synthetic-powershell.exe'),
    environment: { SystemRoot: root, WINDIR: root, TEMP: root, TMP: root },
    assertOwned() {
      assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), owner);
    },
  };
}
function dependencies(modes, calls) {
  return {
    validateExecutable() {},
    setTimeout: (fn, ms) => {
      assert.equal(ms, 10000);
      return setTimeout(fn, 15);
    },
    clearTimeout,
    spawn(exe, args, options) {
      const mode = modes[calls.length] ?? 'normal';
      calls.push({ exe, args, options });
      const c = new EventEmitter();
      c.stdin = new EventEmitter();
      c.stdout = new EventEmitter();
      c.stderr = new EventEmitter();
      let entered = false;
      const output = () => {
        if (entered) return;
        entered = true;
        fs.writeFileSync(path.join(path.dirname(args[4]), 'entry.txt'), ENTRY, { flag: 'wx' });
        c.stderr.emit(
          'data',
          Buffer.from(
            'RETAINED_PIPE_ENTRY\r\nHOST_BOOTSTRAP_PROGRESS_ENVIRONMENT\r\nRETAINED_PIPE_FUNCTION_RETURNED\r\nRETAINED_PIPE_INPUT_' +
              (mode === 'other' ? 'OTHER' : mode === 'consumed' ? 'EOF' : 'Q') +
              '\r\n',
          ),
        );
        c.stdout.emit(
          'data',
          Buffer.from(mode === 'bad' ? 'private-canary\n' : 'RETAINED_PIPE_RESPONSE\r\n'),
        );
      };
      c.stdin.write = (bytes, cb) => {
        assert.deepEqual(bytes, Buffer.from([81]));
        setImmediate(() => {
          c.emit('spawn');
          if (mode !== 'callback-stuck') cb();
          if (['normal', 'bad', 'callback-stuck', 'other', 'consumed'].includes(mode)) output();
        });
        return true;
      };
      c.stdin.end = (cb) => {
        cb();
        if (mode === 'stuck') return;
        setImmediate(() => {
          if (mode === 'eof') output();
          for (const key of ['stdin', 'stdout', 'stderr']) c[key].emit('close');
          c.emit('close', 0, null);
        });
      };
      c.kill = () => assert.fail('No kill permitted');
      return c;
    },
  };
}
test('four fixed cases isolate mandatory binding and cwd/TEMP depth while script/witness/arguments remain short', async (t) => {
  const f = fixture(t),
    calls = [];
  const r = await runPairedStartup(f, dependencies([], calls));
  assert.equal(calls.length, 4);
  const sharedArguments = calls[0].args.slice(5);
  for (const [n, spec] of CASES.entries()) {
    const c = calls[n],
      result = r[spec.mode],
      scriptRoot = path.join(f.root, spec.directory);
    assert.equal(result.outcome, 'COMPLETE');
    assert.equal(result.directoryCleanup, false);
    assert.deepEqual(c.args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-File']);
    assert.deepEqual(c.args.slice(5), sharedArguments);
    assert.equal(c.args[4], path.join(scriptRoot, 'fixture.ps1'));
    assert.deepEqual(fs.readFileSync(c.args[4]), materializeScript(spec.parameters));
    const cwd = spec.deep
      ? path.join(
          f.root,
          spec.deep,
          'Fonesi-Auto-' + f.owner,
          'launch-' + f.owner,
          'host-session-' + f.owner,
        )
      : scriptRoot;
    assert.equal(c.options.cwd, cwd);
    assert.equal(c.options.env.TEMP, path.join(cwd, 'profile'));
    assert.equal(c.options.env.TMP, c.options.env.TEMP);
    assert.equal(c.options.shell, false);
    assert.equal(c.options.detached, false);
    assert.deepEqual(c.options.stdio, ['pipe', 'pipe', 'pipe']);
    assert.deepEqual(fs.readdirSync(c.options.env.TEMP), []);
    assert.equal(fs.readFileSync(path.join(scriptRoot, 'entry.txt'), 'utf8'), ENTRY);
    assert.equal(result.progressBeforeEof, true);
    assert.equal(result.progressAfterEof, true);
    assert.equal(spec.directory.length, 22);
    if (spec.deep) assert.equal(spec.deep.length, 9);
  }
  assert.equal(fs.readFileSync(calls[0].args[5], 'utf8'), BOOTSTRAP);
  assert.equal(calls[0].args[6], createHash('sha256').update(BOOTSTRAP).digest('hex'));
  const source = fs.readFileSync(new URL('../launch/Invoke-RetainedHost.ps1', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), SOURCE_SHA256);
  const body = fs.readFileSync(new URL('../verification/RetainedPipeEntry.ps1', import.meta.url));
  assert.equal(createHash('sha256').update(body).digest('hex'), BODY_SHA256);
  const parameter =
    'param([Parameter(Mandatory=$true)][string]$BootstrapFile,[Parameter(Mandatory=$true)][string]$BootstrapSha256)\n';
  assert.equal(
    materializeScript(true).toString().replace(parameter, ''),
    materializeScript(false).toString(),
  );
  assert.ok(
    materializeScript(true)
      .toString()
      .startsWith(source.toString().split("try {\n    Progress 'ENVIRONMENT'")[0]),
  );
  assert.doesNotMatch(materializeScript(true).toString(), /Add-Type|::Run\(/);
});
test('late startup after requested EOF stays EOF_REQUIRED and never becomes before-EOF success', async (t) => {
  const f = fixture(t),
    calls = [];
  const r = await runPairedStartup(f, dependencies(['eof', 'normal'], calls));
  assert.equal(r.plainShort.outcome, 'EOF_REQUIRED');
  assert.equal(r.plainShort.entryBeforeEof, false);
  assert.equal(r.plainShort.responseBeforeEof, false);
  assert.equal(r.plainShort.entryAfterEof, true);
  assert.equal(r.plainShort.responseAfterEof, true);
  assert.equal(r.plainShort.eofDelivered, true);
  assert.equal(r.plainShort.stdioRetired, true);
  assert.equal(r.plainDepth.outcome, 'COMPLETE');
});
test('unretired first child preserves exact owned root, does not kill and prevents second spawn', async (t) => {
  const f = fixture(t),
    calls = [];
  const r = await runPairedStartup(f, dependencies(['stuck'], calls));
  assert.equal(r.plainShort.outcome, 'UNRETIRED');
  assert.equal(r.plainShort.stdioRetired, false);
  assert.equal(r.plainShort.directoryCleanup, false);
  assert.equal(r.plainDepth, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'retained-pipe-plain001')).sort(), [
    '.owner',
    'bootstrap.json',
    'fixture.ps1',
    'profile',
  ]);
});
test('unknown output is fixed OUTPUT_REJECTED without raw echo and existing roots are never overwritten', async (t) => {
  const f = fixture(t),
    calls = [];
  const r = await runPairedStartup(f, dependencies(['bad', 'normal'], calls));
  assert.equal(r.plainShort.outcome, 'OUTPUT_REJECTED');
  assert.doesNotMatch(JSON.stringify(r), /private-canary|fixture.ps1|powershell/);
  const before = fs.readFileSync(path.join(f.root, 'retained-pipe-plain001', 'fixture.ps1'));
  await assert.rejects(runPairedStartup(f, dependencies([], [])));
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, 'retained-pipe-plain001', 'fixture.ps1')),
    before,
  );
});
test('fixed script records independent entry before Console and never compiles or invokes native/device code', () => {
  const s = fs.readFileSync(
    new URL('../verification/RetainedPipeEntry.ps1', import.meta.url),
    'utf8',
  );
  assert.ok(s.indexOf('[IO.File]::Open(') < s.indexOf('[Console]::Error.WriteLine'));
  assert.match(s, /FileMode\]::CreateNew/);
  assert.doesNotMatch(
    s.slice(0, s.indexOf('[Console]::Error.WriteLine')),
    /Join-Path|Get-Item|New-Object/,
  );
  assert.match(s, /Flush\(\$true\)/);
  assert.match(s, /\$byte -eq 81/);
  assert.match(s, /\$inputStream.ReadByte\(\) -ne -1/);
  assert.doesNotMatch(
    s,
    /Add-Type|adb\.exe|RetainedProvider|Start-Process|Invoke-Expression|ExecutionPolicy/,
  );
  const helper = fs.readFileSync(
    new URL('../verification/retained-pipe-startup.cjs', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(helper, /\.kill\(|ExecutionPolicy/);
});

test('closed child streams do not retire an unsettled request-write callback', async (t) => {
  const f = fixture(t),
    calls = [];
  const r = await runPairedStartup(f, dependencies(['callback-stuck'], calls));
  assert.equal(r.plainShort.exitZero, true);
  assert.equal(r.plainShort.requestWriteSettled, false);
  assert.equal(r.plainShort.stdioRetired, false);
  assert.equal(r.plainShort.outcome, 'UNRETIRED');
  assert.equal(r.plainDepth, null);
});
test('decoded input classification preserves EOF versus OTHER and never promotes them to COMPLETE', async (t) => {
  for (const [mode, input, outcome] of [
    ['consumed', 'EOF', 'EOF_REQUIRED'],
    ['other', 'OTHER', 'OUTPUT_REJECTED'],
  ]) {
    const f = fixture(t),
      calls = [];
    const r = await runPairedStartup(f, dependencies([mode, 'normal'], calls));
    assert.equal(r.plainShort.input, input);
    assert.equal(r.plainShort.outcome, outcome);
  }
});
test('last ownership callback executable replacement refuses before spawn with fixed error', async (t) => {
  const f = fixture(t),
    calls = [];
  let checks = 0;
  const original = f.assertOwned;
  f.assertOwned = () => {
    original();
    if (++checks === 4) fs.writeFileSync(f.powershell, 'changed executable identity');
  };
  await assert.rejects(runPairedStartup(f, dependencies([], calls)), {
    message: 'RETAINED_PIPE_REJECTED',
  });
  assert.equal(calls.length, 0);
});
test('growing owner file uses admitted-size plus one bounded fd read and refuses before spawn', async (t) => {
  const f = fixture(t),
    calls = [];
  const original = fs.readSync;
  let changed = false,
    max = 0;
  fs.readSync = (fd, buffer, offset, length, position) => {
    if (!changed && fs.fstatSync(fd).size === 36) {
      changed = true;
      fs.appendFileSync(path.join(f.root, '.owner'), 'x'.repeat(10000));
      max = length;
    }
    return original(fd, buffer, offset, length, position);
  };
  try {
    await assert.rejects(runPairedStartup(f, dependencies([], calls)), {
      message: 'RETAINED_PIPE_REJECTED',
    });
    assert.equal(changed, true);
    assert.equal(max, 37);
    assert.equal(calls.length, 0);
  } finally {
    fs.readSync = original;
  }
});

test('final ownership callback cannot replace the fixed materialized script before handoff', async (t) => {
  const f = fixture(t),
    calls = [];
  let checks = 0;
  const original = f.assertOwned;
  f.assertOwned = () => {
    original();
    if (++checks === 4)
      fs.writeFileSync(
        path.join(f.root, 'retained-pipe-plain001', 'fixture.ps1'),
        'private replacement',
      );
  };
  await assert.rejects(runPairedStartup(f, dependencies([], calls)), {
    message: 'RETAINED_PIPE_REJECTED',
  });
  assert.equal(calls.length, 0);
  assert.equal(
    fs.readFileSync(path.join(f.root, 'retained-pipe-plain001', 'fixture.ps1'), 'utf8'),
    'private replacement',
  );
});
