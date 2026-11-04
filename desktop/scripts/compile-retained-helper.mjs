// Compile-only: never imports/loads/invokes the produced assembly or any ADB binary.
import {
  openSync,
  closeSync,
  readSync,
  fstatSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  mkdtempSync,
  opendirSync,
  unlinkSync,
  rmdirSync,
  constants,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { verifyBuild } from './build-manifest.mjs';
const originalHash = '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7';
const hash = (b) => createHash('sha256').update(b).digest('hex');
function fail() {
  throw Error('RETAINED_COMPILE_REJECTED');
}
function plain(path, directory = false) {
  const s = lstatSync(path);
  if (
    s.isSymbolicLink() ||
    (directory ? !s.isDirectory() : !s.isFile()) ||
    realpathSync.native(path) !== path
  )
    fail();
  return s;
}
function bytes(path, max) {
  plain(path);
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || s.size < 1 || s.size > max) fail();
    const b = Buffer.alloc(s.size + 1);
    let n = 0;
    while (n < b.length) {
      const got = readSync(fd, b, n, b.length - n, null);
      if (got === 0) break;
      n += got;
    }
    const after = fstatSync(fd);
    if (n !== s.size || after.size !== s.size || after.mtimeMs !== s.mtimeMs) fail();
    return b.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}
function names(root) {
  const d = opendirSync(root),
    out = [];
  try {
    while (true) {
      const e = d.readSync();
      if (e === null) break;
      if (out.length >= 3) fail();
      out.push(e.name);
    }
  } finally {
    d.closeSync();
  }
  return out.sort();
}
export function compileRetainedHelper({ root, framework, tempParent, run = spawnSync }) {
  const sources = ['IsolatedAdbServer.cs', 'RetainedAdbSession.cs'].map((n) =>
    join(root, 'native', n),
  );
  let owned = null,
    identity = null,
    marker = null,
    attempted = false,
    retired = false,
    passed = false,
    cleaned = false;
  let stage = 'ADMISSION',
    status = 'NOT_RUN',
    diagnostics = [];
  try {
    plain(root, true);
    plain(framework, true);
    plain(tempParent, true);
    const compiler = join(framework, 'csc.exe');
    plain(compiler);
    const refs = ['mscorlib.dll', 'System.dll', 'System.Core.dll'].map((n) => {
      const p = join(framework, n);
      plain(p);
      return p;
    });
    const before = sources.map((p) => hash(bytes(p, 1048576)));
    if (before[0] !== originalHash) fail();
    stage = 'TEMP';
    owned = mkdtempSync(join(tempParent, 'fonesi-compile-'));
    identity = plain(owned, true);
    marker = JSON.stringify({
      version: 1,
      owner: randomUUID(),
      purpose: 'RETAINED_HELPER_COMPILE_ONLY',
    });
    writeFileSync(join(owned, 'owner.json'), marker, { flag: 'wx', encoding: 'utf8' });
    const output = join(owned, 'retained.dll');
    const args = [
      '/noconfig',
      '/nologo',
      '/nostdlib+',
      '/target:library',
      '/optimize+',
      '/debug-',
      '/langversion:5',
      `/out:${output}`,
      ...refs.map((p) => `/reference:${p}`),
      ...sources,
    ];
    stage = 'COMPILE';
    attempted = true;
    const result = run(compiler, args, {
      cwd: owned,
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 65536,
      env: {
        SystemRoot: dirname(dirname(dirname(framework))),
        WINDIR: dirname(dirname(dirname(framework))),
        TEMP: owned,
        TMP: owned,
      },
    });
    status =
      result.error?.code === 'ETIMEDOUT'
        ? 'TIMEOUT'
        : result.error?.code === 'ENOBUFS'
          ? 'CAPTURE_LIMIT'
          : !result.error && !result.signal && result.status === 0
            ? 'SUCCESS'
            : !result.error && !result.signal && Number.isInteger(result.status)
              ? 'NONZERO'
              : 'UNKNOWN';
    const outputText =
      typeof result.stdout === 'string' &&
      typeof result.stderr === 'string' &&
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 65536
        ? result.stdout + '\n' + result.stderr
        : '';
    diagnostics = [
      'CS0122',
      'CS0052',
      'CS0051',
      'CS0117',
      'CS1061',
      'CS0246',
      'CS0103',
      'CS1002',
    ].filter((code) => new RegExp('\\berror ' + code + '\\b').test(outputText));
    if (
      [...outputText.matchAll(/\berror (CS[0-9]{4})\b/g)].some(
        (match) => !diagnostics.includes(match[1]),
      )
    )
      diagnostics.push('OTHER');
    retired = !result.error && !result.signal && Number.isInteger(result.status);
    if (!retired || result.status !== 0) fail();
    if (
      typeof result.stdout !== 'string' ||
      typeof result.stderr !== 'string' ||
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > 65536
    )
      fail();
    stage = 'SOURCE_RECHECK';
    if (sources.some((p, i) => hash(bytes(p, 1048576)) !== before[i])) fail();
    stage = 'OUTPUT';
    const assembly = bytes(output, 8388608);
    if (assembly[0] !== 77 || assembly[1] !== 90) fail();
    if (names(owned).join('|') !== 'owner.json|retained.dll') fail();
    passed = true;
  } catch {
    passed = false;
  } finally {
    if (owned && (!attempted || retired)) {
      try {
        const s = plain(owned, true);
        if (
          s.dev !== identity.dev ||
          s.ino !== identity.ino ||
          bytes(join(owned, 'owner.json'), 256).toString('utf8') !== marker
        )
          fail();
        const found = names(owned);
        if (
          found.some((n) => !['owner.json', 'retained.dll'].includes(n)) ||
          !found.includes('owner.json')
        )
          fail();
        for (const n of found) {
          const s = plain(join(owned, n));
          if (s.size > (n === 'owner.json' ? 256 : 8388608)) fail();
        }
        if (found.includes('retained.dll')) unlinkSync(join(owned, 'retained.dll'));
        if (
          names(owned).join('|') !== 'owner.json' ||
          bytes(join(owned, 'owner.json'), 256).toString('utf8') !== marker
        )
          fail();
        const last = plain(owned, true);
        if (last.dev !== identity.dev || last.ino !== identity.ino) fail();
        unlinkSync(join(owned, 'owner.json'));
        rmdirSync(owned);
        cleaned = true;
      } catch {
        cleaned = false;
      }
    }
  }
  return Object.freeze({
    passed: passed && cleaned,
    stage: passed && !cleaned ? 'CLEANUP' : stage,
    status,
    diagnostics: Object.freeze(diagnostics),
    compilerRetired: retired,
    directoryCleanup: cleaned,
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let ok = false;
  try {
    if (
      process.argv.length !== 2 ||
      process.platform !== 'win32' ||
      process.arch !== 'x64' ||
      ['NODE_PATH', 'NODE_OPTIONS', 'ESBUILD_BINARY_PATH'].some((k) => process.env[k] !== undefined)
    )
      fail();
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    if (!verifyBuild(root)) fail();
    const windows = process.env.SystemRoot;
    if (!windows || resolve(windows) !== windows) fail();
    plain(windows, true);
    const framework = join(windows, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
    const result = compileRetainedHelper({
      root,
      framework,
      tempParent: realpathSync.native(tmpdir()),
    });
    ok = result.passed;
    console.log(`RETAINED_COMPILE_STAGE_${result.stage}`);
    console.log(`RETAINED_COMPILE_STATUS_${result.status}`);
    console.log(`RETAINED_COMPILE_RETIRED_${result.compilerRetired ? 'TRUE' : 'FALSE'}`);
    console.log(`RETAINED_COMPILE_CLEANUP_${result.directoryCleanup ? 'TRUE' : 'FALSE'}`);
    for (const code of result.diagnostics) console.log(`RETAINED_COMPILE_DIAGNOSTIC_${code}`);
  } catch {
    ok = false;
  }
  console.log(ok ? 'RETAINED_HELPER_COMPILE_ONLY_PASS' : 'RETAINED_HELPER_COMPILE_ONLY_FAIL');
  process.exitCode = ok ? 0 : 1;
}
