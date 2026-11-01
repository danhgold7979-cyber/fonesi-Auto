'use strict';
// Verification-only real pipe comparison. No provider, candidate binary, kill or shell command.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const SOURCE_SHA256 = '35d825b536f5541c7ed33683884fd640a937c95d62330b73f3f3c952ccfe8750';
const BODY_SHA256 = '29999102f3c35887d92fe77531b24973ac689d4dba81162215e075c33669b6cf';
const BOOTSTRAP = '{"version":1,"purpose":"RETAINED_PIPE_STARTUP"}';
const CASES = Object.freeze([
  Object.freeze({
    mode: 'plainShort',
    directory: 'retained-pipe-plain001',
    parameters: false,
    deep: null,
  }),
  Object.freeze({
    mode: 'plainDepth',
    directory: 'retained-pipe-plain002',
    parameters: false,
    deep: 'pipe-deep',
  }),
  Object.freeze({
    mode: 'parameterShort',
    directory: 'retained-pipe-param001',
    parameters: true,
    deep: null,
  }),
  Object.freeze({
    mode: 'parameterDepth',
    directory: 'retained-pipe-param002',
    parameters: true,
    deep: 'pipe-test',
  }),
]);
const ENTRY = 'RETAINED_PIPE_ENTRY_V1\n';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fail = () => {
  throw Error('RETAINED_PIPE_REJECTED');
};
function plain(file, directory = false, owned = true) {
  const s = fs.lstatSync(file);
  if (
    s.isSymbolicLink() ||
    (directory ? !s.isDirectory() : !s.isFile()) ||
    fs.realpathSync.native(file) !== file ||
    (!directory && owned && s.nlink !== 1)
  )
    fail();
  return s;
}
function sameIdentity(a, b) {
  return ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every((k) => a[k] === b[k]);
}
function read(file, limit) {
  const initial = plain(file);
  if (initial.size < 1 || initial.size > limit) fail();
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(fd);
    if (!sameIdentity(initial, before) || !before.isFile() || before.nlink !== 1) fail();
    const bytes = Buffer.alloc(before.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const n = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (n === 0) break;
      offset += n;
    }
    if (
      offset !== before.size ||
      !sameIdentity(before, fs.fstatSync(fd)) ||
      !sameIdentity(before, plain(file))
    )
      fail();
    return bytes.subarray(0, offset);
  } finally {
    fs.closeSync(fd);
  }
}
function write(file, bytes) {
  const fd = fs.openSync(file, 'wx');
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (!read(file, 8192).equals(Buffer.from(bytes))) fail();
}
function materializeScript(parameters) {
  if (typeof parameters !== 'boolean') fail();
  const source = read(path.join(__dirname, '../launch/Invoke-RetainedHost.ps1'), 16384);
  const body = read(path.join(__dirname, 'RetainedPipeEntry.ps1'), 8192);
  if (sha(source) !== SOURCE_SHA256 || sha(body) !== BODY_SHA256) fail();
  const boundary = "try {\n    Progress 'ENVIRONMENT'";
  const text = source.toString('utf8'),
    index = text.indexOf(boundary);
  if (index < 0 || text.indexOf(boundary, index + 1) !== -1) fail();
  let prefix = text.slice(0, index);
  const diagnosticStart = 'function Compile-Type',
    diagnosticEnd = 'function Reject';
  const start = prefix.indexOf(diagnosticStart),
    end = prefix.indexOf(diagnosticEnd);
  if (
    start < 0 ||
    end <= start ||
    prefix.indexOf(diagnosticStart, start + 1) !== -1 ||
    prefix.indexOf(diagnosticEnd, end + 1) !== -1
  )
    fail();
  prefix = prefix.slice(0, start) + prefix.slice(end);
  const parameter =
    'param([Parameter(Mandatory=$true)][string]$BootstrapFile,[Parameter(Mandatory=$true)][string]$BootstrapSha256)\n';
  if (prefix.split(parameter).length !== 2) fail();
  if (!parameters) prefix = prefix.replace(parameter, '');
  return Buffer.concat([Buffer.from(prefix), body]);
}
function validateExecutable(file) {
  if (
    process.platform !== 'win32' ||
    typeof file !== 'string' ||
    path.resolve(file) !== file ||
    !/\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i.test(file)
  )
    fail();
  const s = plain(file, false, false); // OS-managed hardlinks are legitimate, unlike owned fixture bytes.
  if (s.size < 1 || s.size > 16 * 1024 * 1024) fail();
}
function witness(root) {
  try {
    return read(path.join(root, 'entry.txt'), 64).toString('ascii') === ENTRY;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
const response = (s) => s === 'RETAINED_PIPE_RESPONSE\n' || s === 'RETAINED_PIPE_RESPONSE\r\n';
function inputClass(s) {
  return (
    /^RETAINED_PIPE_ENTRY\r?\nHOST_BOOTSTRAP_PROGRESS_ENVIRONMENT\r?\nRETAINED_PIPE_FUNCTION_RETURNED\r?\nRETAINED_PIPE_INPUT_(Q|EOF|OTHER)\r?\n$/.exec(
      s,
    )?.[1] ?? 'UNAVAILABLE'
  );
}
function progressObserved(s) {
  return (
    s.includes('HOST_BOOTSTRAP_PROGRESS_ENVIRONMENT\nRETAINED_PIPE_FUNCTION_RETURNED\n') ||
    s.includes('HOST_BOOTSTRAP_PROGRESS_ENVIRONMENT\r\nRETAINED_PIPE_FUNCTION_RETURNED\r\n')
  );
}
async function runPairedStartupCore(options, testDependencies = {}) {
  // Injection is verification-test-only; production observer uses the concrete defaults.
  const { root, owner, powershell, assertOwned } = options;
  if (
    typeof root !== 'string' ||
    path.resolve(root) !== root ||
    typeof owner !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(owner) ||
    typeof assertOwned !== 'function'
  )
    fail();
  const environment = Object.freeze({ ...options.environment });
  if (
    Object.keys(environment).sort().join('|') !== 'SystemRoot|TEMP|TMP|WINDIR' ||
    Object.values(environment).some((v) => typeof v !== 'string' || v.length > 32768) ||
    environment.WINDIR !== environment.SystemRoot
  )
    fail();
  if (
    !testDependencies.validateExecutable &&
    powershell !==
      path.join(environment.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  )
    fail();
  const launch = testDependencies.spawn ?? spawn;
  const later = testDependencies.setTimeout ?? setTimeout;
  const cancel = testDependencies.clearTimeout ?? clearTimeout;
  (testDependencies.validateExecutable ?? validateExecutable)(powershell);
  const executableIdentity = plain(powershell, false, false);
  const scripts = { plain: materializeScript(false), parameter: materializeScript(true) };
  const bootstrapFile = path.join(root, CASES[0].directory, 'bootstrap.json');
  const bootstrapHash = sha(BOOTSTRAP);
  const check = () => {
    assertOwned();
    plain(root, true);
    if (read(path.join(root, '.owner'), 36).toString('ascii') !== owner) fail();
  };
  check();
  async function variant(spec) {
    const script = scripts[spec.parameters ? 'parameter' : 'plain'];
    const scriptHash = sha(script);
    check();
    const childRoot = path.join(root, spec.directory);
    fs.mkdirSync(childRoot); // Exclusive: existing directories are never adopted or overwritten.
    plain(childRoot, true);
    write(path.join(childRoot, '.owner'), owner);
    let cwd = childRoot;
    const deepRoots = [];
    if (spec.deep) {
      for (const component of [
        spec.deep,
        'Fonesi-Auto-' + owner,
        'launch-' + owner,
        'host-session-' + owner,
      ]) {
        cwd = path.join(deepRoots.length ? cwd : root, component);
        fs.mkdirSync(cwd);
        plain(cwd, true);
        write(path.join(cwd, '.owner'), owner);
        deepRoots.push(cwd);
      }
    }
    const profile = path.join(cwd, 'profile');
    fs.mkdirSync(profile);
    plain(profile, true);
    if (spec.mode === 'plainShort') write(bootstrapFile, BOOTSTRAP);
    const deepIdentities = deepRoots.map((directory) => ({
      directory,
      identity: plain(directory, true),
    }));
    const childEnvironment = Object.freeze({ ...environment, TEMP: profile, TMP: profile });
    const scriptFile = path.join(childRoot, 'fixture.ps1');
    write(scriptFile, script);
    const childIdentity = plain(childRoot, true),
      profileIdentity = plain(profile, true);
    check();
    const args = [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-File',
      scriptFile,
      bootstrapFile,
      bootstrapHash,
    ];
    const facts = {
      started: false,
      requestWriteSettled: false,
      entryBeforeEof: false,
      stderrEntryBeforeEof: false,
      responseBeforeEof: false,
      progressBeforeEof: false,
      entryAfterEof: false,
      responseAfterEof: false,
      progressAfterEof: false,
      eofDelivered: false,
      exitZero: false,
      stdioRetired: false,
      directoryCleanup: false,
      outcome: 'UNRETIRED',
      input: 'UNAVAILABLE',
    };
    let child,
      out = '',
      err = '',
      invalid = false,
      spawnFailed = false,
      closed = false,
      before = false,
      eof = false,
      settled = false,
      writeCallbackSettled = false,
      endCallbackSettled = false,
      timer,
      resolveDone;
    const streamClosed = { stdin: false, stdout: false, stderr: false };
    const done = new Promise((resolve) => {
      resolveDone = resolve;
    });
    function finish() {
      if (settled) return;
      settled = true;
      cancel(timer);
      try {
        check();
        facts.entryAfterEof = witness(childRoot);
      } catch {
        invalid = true;
      }
      facts.responseAfterEof = response(out);
      facts.progressAfterEof = progressObserved(err);
      facts.stdioRetired =
        closed &&
        writeCallbackSettled &&
        endCallbackSettled &&
        Object.values(streamClosed).every(Boolean);
      facts.input = inputClass(err);
      if (!facts.stdioRetired) facts.outcome = 'UNRETIRED';
      else if (spawnFailed) facts.outcome = 'SPAWN_FAILED';
      else if (
        invalid ||
        !facts.started ||
        !facts.exitZero ||
        !facts.requestWriteSettled ||
        !facts.eofDelivered ||
        !facts.entryAfterEof ||
        !facts.responseAfterEof ||
        !['Q', 'EOF'].includes(facts.input)
      )
        facts.outcome = 'OUTPUT_REJECTED';
      else
        facts.outcome =
          facts.entryBeforeEof && facts.responseBeforeEof && facts.input === 'Q'
            ? 'COMPLETE'
            : 'EOF_REQUIRED';
      resolveDone(Object.freeze({ ...facts }));
    }
    function finishIfSettled() {
      if (
        closed &&
        writeCallbackSettled &&
        endCallbackSettled &&
        Object.values(streamClosed).every(Boolean)
      )
        finish();
    }
    function sendEof() {
      if (eof) return;
      eof = true;
      before = true;
      try {
        check();
        facts.entryBeforeEof = witness(childRoot);
      } catch {
        invalid = true;
      }
      facts.stderrEntryBeforeEof =
        err.startsWith('RETAINED_PIPE_ENTRY\n') || err.startsWith('RETAINED_PIPE_ENTRY\r\n');
      facts.responseBeforeEof = response(out);
      facts.progressBeforeEof = progressObserved(err);
      cancel(timer);
      timer = later(finish, 10000);
      try {
        child.stdin.end((error) => {
          endCallbackSettled = true;
          if (error) invalid = true;
          else facts.eofDelivered = true;
          finishIfSettled();
        });
      } catch {
        endCallbackSettled = true;
        invalid = true;
        finishIfSettled();
      }
    }
    check();
    if (
      !sameIdentity(executableIdentity, plain(powershell, false, false)) ||
      !sameIdentity(childIdentity, plain(childRoot, true)) ||
      !sameIdentity(profileIdentity, plain(profile, true)) ||
      read(path.join(childRoot, '.owner'), 36).toString('ascii') !== owner ||
      sha(read(scriptFile, 8192)) !== scriptHash ||
      sha(read(bootstrapFile, 256)) !== bootstrapHash
    )
      fail();
    for (const item of deepIdentities) {
      if (
        !sameIdentity(item.identity, plain(item.directory, true)) ||
        read(path.join(item.directory, '.owner'), 36).toString('ascii') !== owner
      )
        fail();
    }
    const profileEntries = fs.opendirSync(profile);
    try {
      if (profileEntries.readSync() !== null) fail();
    } finally {
      profileEntries.closeSync();
    }
    try {
      child = launch(powershell, args, {
        cwd,
        env: childEnvironment,
        shell: false,
        detached: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      facts.outcome = 'SPAWN_FAILED';
      return Object.freeze(facts);
    }
    timer = later(sendEof, 10000);
    child.once('spawn', () => {
      facts.started = true;
    });
    child.on('error', () => {
      spawnFailed = true;
    });
    for (const key of ['stdin', 'stdout', 'stderr']) {
      child[key].once('close', () => {
        streamClosed[key] = true;
        finishIfSettled();
      });
      child[key].on('error', () => {
        invalid = true;
      });
    }
    child.stdout.on('data', (chunk) => {
      if (!Buffer.isBuffer(chunk) || chunk.length + Buffer.byteLength(out) > 4096) {
        invalid = true;
        return;
      }
      out += chunk.toString('utf8');
      if (!before && response(out)) sendEof();
    });
    child.stderr.on('data', (chunk) => {
      if (!Buffer.isBuffer(chunk) || chunk.length + Buffer.byteLength(err) > 4096) {
        invalid = true;
        return;
      }
      err += chunk.toString('utf8');
    });
    child.once('close', (code, signal) => {
      closed = true;
      facts.exitZero = code === 0 && signal === null;
      if (!eof) sendEof();
      finishIfSettled();
    });
    try {
      child.stdin.write(Buffer.from([81]), (error) => {
        writeCallbackSettled = true;
        if (error) invalid = true;
        else facts.requestWriteSettled = true;
        finishIfSettled();
      });
    } catch {
      writeCallbackSettled = true;
      invalid = true;
      finishIfSettled();
    }
    return done;
  }
  const results = {
    plainShort: null,
    plainDepth: null,
    parameterShort: null,
    parameterDepth: null,
  };
  for (const spec of CASES) {
    const result = await variant(spec);
    results[spec.mode] = result;
    if (!result.stdioRetired) break;
  }
  return Object.freeze(results);
}
async function runPairedStartup(options, testDependencies) {
  try {
    return await runPairedStartupCore(options, testDependencies);
  } catch {
    fail();
  }
}
module.exports = Object.freeze({
  runPairedStartup,
  materializeScript,
  SOURCE_SHA256,
  BODY_SHA256,
  BOOTSTRAP,
  CASES,
  ENTRY,
});
