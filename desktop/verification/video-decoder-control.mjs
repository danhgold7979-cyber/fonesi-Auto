// Fixed owned-file preparation/validation/cleanup; never starts an application.
import {
  lstatSync,
  openSync,
  readSync,
  closeSync,
  fstatSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyBuild } from '../scripts/build-manifest.mjs';
import {
  VIDEO_QUALIFICATION_INPUTS,
  validateVideoQualification,
  exact,
  VIDEO_QUALIFICATION_SCOPE,
  validateVideoDiagnostic,
  validateVideoEvidence,
} from './video-decoder-contract.mjs';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function plainDirectory(path) {
  const s = lstatSync(path);
  if (!s.isDirectory() || s.isSymbolicLink() || realpathSync(path) !== path)
    throw Error('DIRECTORY');
}
export function readBounded(file, limit = 1048576) {
  plainDirectory(dirname(file));
  const s = lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.size < 1 || s.size > limit)
    throw Error('FILE');
  const b = readFileSync(file);
  if (b.length !== s.size) throw Error('FILE');
  return b;
}
export function hash(file) {
  plainDirectory(dirname(file));
  const before = lstatSync(file);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > 536870912
  )
    throw Error('FILE');
  const fd = openSync(file, 'r');
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size)
      throw Error('CHANGED');
    const digest = createHash('sha256'),
      buffer = Buffer.alloc(65536);
    let total = 0;
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      total += n;
      if (total > before.size) throw Error('CHANGED');
      digest.update(buffer.subarray(0, n));
    }
    const after = fstatSync(fd);
    if (total !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs)
      throw Error('CHANGED');
    return digest.digest('hex');
  } finally {
    closeSync(fd);
  }
}
export function assertOwner(root) {
  plainDirectory(root);
  if (
    dirname(root) !== join(desktop, '.test-output') ||
    !/^video-decoder-[0-9a-f-]{36}$/.test(root.slice(dirname(root).length + 1))
  )
    throw Error('ROOT');
  const token = readBounded(join(root, '.owner'), 36).toString();
  if (!/^[0-9a-f-]{36}$/.test(token)) throw Error('TOKEN');
  return token;
}
function paths() {
  return {
    productionManifest: join(desktop, 'build/.verified-build.json'),
    probe: join(desktop, '.test-output/video-decoder-build/probe.cjs'),
    fixture: join(desktop, 'verification/video-decoder-fixture.mjs'),
    contract: join(desktop, 'verification/video-decoder-contract.mjs'),
    builder: join(desktop, 'verification/build-video-decoder.mjs'),
    control: join(desktop, 'verification/video-decoder-control.mjs'),
    runner: join(desktop, 'verification/Invoke-VideoDecoder.ps1'),
    installer: join(desktop, 'verification/install-electron.mjs'),
    runtimeControl: join(desktop, 'verification/persistence-control.cjs'),
    boundary: join(desktop, 'verification/WindowsBoundary.psm1'),
    ownedFiles: join(desktop, 'verification/OwnedFiles.psm1'),
    supervisor: resolve(desktop, '../tools/phase-00/HostProbeNative.cs'),
    runtimeManifest: join(desktop, '.runtime/persistence-runtime-manifest.json'),
    executable: join(desktop, 'node_modules/electron/dist/electron.exe'),
  };
}
export function inputs() {
  const p = paths();
  return Object.fromEntries(VIDEO_QUALIFICATION_INPUTS.map((k) => [k, hash(p[k])]));
}
function verifyProbe() {
  const proof = JSON.parse(
    readBounded(join(desktop, '.test-output/video-decoder-build/proof.json'), 65536),
  );
  if (
    !exact(proof, ['version', 'productionManifest', 'inputs', 'output']) ||
    proof.version !== 1 ||
    proof.productionManifest !== hash(paths().productionManifest) ||
    proof.output !== hash(paths().probe) ||
    Object.keys(proof.inputs).length > 64 ||
    !Object.hasOwn(proof.inputs, 'verification/video-decoder-probe.mjs')
  )
    throw Error('PROBE');
  for (const [name, digest] of Object.entries(proof.inputs)) {
    if (
      !/^(src|verification)\/[a-zA-Z0-9/_.-]+\.(ts|mjs)$/.test(name) ||
      name.includes('..') ||
      hash(join(desktop, name)) !== digest
    )
      throw Error('PROBE');
  }
}
function write(file, value) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 16384) throw Error('LIMIT');
  writeFileSync(file, text, { flag: 'wx', mode: 0o600 });
}
export function prepare(root, head) {
  const token = assertOwner(root);
  verifyProbe();
  if (!/^[0-9a-f]{40}$/.test(head) || !verifyBuild(desktop)) throw Error('BUILD');
  const runtime = JSON.parse(readBounded(paths().runtimeManifest, 65536));
  const bound = inputs();
  if (
    runtime.head !== head ||
    runtime.electron !== '45.1.0' ||
    runtime.exeSha256 !== bound.executable
  )
    throw Error('RUNTIME');
  copyFileSync(paths().probe, join(root, 'probe.cjs'), 1);
  if (hash(join(root, 'probe.cjs')) !== bound.probe) throw Error('COPY');
  write(join(root, 'control.json'), { version: 1, head, token, desktop, inputs: bound });
}
export function inspect(root) {
  const token = assertOwner(root);
  verifyProbe();
  const control = JSON.parse(readBounded(join(root, 'control.json'), 16384));
  if (
    control.token !== token ||
    JSON.stringify(inputs()) !== JSON.stringify(control.inputs) ||
    hash(join(root, 'probe.cjs')) !== control.inputs.probe ||
    !verifyBuild(desktop)
  )
    throw Error('SOURCE_CHANGED');
  const result = JSON.parse(readBounded(join(root, 'result.json'), 16384));
  if (
    !validateVideoQualification(result) ||
    result.head !== control.head ||
    JSON.stringify(result.inputs) !== JSON.stringify(control.inputs)
  )
    throw Error('RESULT');
  return result;
}
export function cleanup(root) {
  assertOwner(root);
  const entries = [];
  let bytes = 0;
  function walk(path, depth) {
    if (depth > 16 || entries.length > 256) throw Error('LIMIT');
    for (const name of readdirSync(path)) {
      if (path === root && name === '.owner') continue;
      const file = join(path, name),
        s = lstatSync(file);
      if (s.isSymbolicLink() || (!s.isDirectory() && !s.isFile())) throw Error('KIND');
      if (s.isFile()) {
        if (s.nlink !== 1) throw Error('LINK');
        bytes += s.size;
        if (bytes > 67108864) throw Error('LIMIT');
      }
      entries.push([file, s.isDirectory()]);
      if (s.isDirectory()) walk(file, depth + 1);
    }
  }
  walk(root, 0);
  assertOwner(root);
  for (const [file, dir] of entries.reverse()) {
    if (dir) rmdirSync(file);
    else unlinkSync(file);
  }
}
function optional(file) {
  try {
    return JSON.parse(readBounded(file, 16384));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
export function diagnostic(root) {
  const token = assertOwner(root);
  verifyProbe();
  const control = JSON.parse(readBounded(join(root, 'control.json'), 16384));
  if (
    control.token !== token ||
    JSON.stringify(inputs()) !== JSON.stringify(control.inputs) ||
    !verifyBuild(desktop)
  )
    throw Error('SOURCE_CHANGED');
  const value = optional(join(root, 'failure.json'));
  if (
    value !== null &&
    (!validateVideoDiagnostic(value) ||
      value.head !== control.head ||
      JSON.stringify(value.inputs) !== JSON.stringify(control.inputs))
  )
    throw Error('DIAGNOSTIC');
  write(join(desktop, '.test-output/video-decoder-diagnostic.json'), value);
}
export function publish(head) {
  if (typeof head !== 'string' || !/^[0-9a-f]{40}$/.test(head)) throw Error('HEAD');
  const base = join(desktop, '.test-output');
  const supervisor = JSON.parse(readBounded(join(base, 'video-decoder-supervisor.json'), 16384));
  const diagnostic = optional(join(base, 'video-decoder-diagnostic.json'));
  const result = optional(join(base, 'video-decoder-result.json'));
  const value = {
    version: 1,
    scope: VIDEO_QUALIFICATION_SCOPE,
    head,
    supervisor,
    diagnostic,
    result,
  };
  if (!validateVideoEvidence(value)) throw Error('EVIDENCE');
  for (const record of [diagnostic, result])
    if (record !== null && JSON.stringify(record.inputs) !== JSON.stringify(inputs()))
      throw Error('SOURCE_CHANGED');
  write(join(base, 'video-decoder-evidence.json'), value);
  return supervisor.passed;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, root, head] = process.argv.slice(2);
    if (
      !['prepare', 'inspect', 'cleanup', 'diagnostic', 'publish'].includes(action) ||
      process.argv.length !== (action === 'prepare' ? 5 : 4)
    )
      throw Error();
    if (action === 'publish') {
      const passed = publish(root);
      console.log('VIDEO_DECODER_EVIDENCE_WRITTEN');
      console.log(passed ? 'VIDEO_DECODER_EVIDENCE_PASS' : 'VIDEO_DECODER_EVIDENCE_FAIL');
      if (!passed) process.exitCode = 1;
    } else if (action === 'prepare') prepare(resolve(root), head);
    else if (action === 'inspect') {
      const result = inspect(resolve(root));
      write(join(desktop, '.test-output/video-decoder-result.json'), result);
    } else if (action === 'diagnostic') diagnostic(resolve(root));
    else cleanup(resolve(root));
    if (action !== 'publish') console.log('VIDEO_DECODER_CONTROL_PASS');
  } catch {
    console.error('VIDEO_DECODER_CONTROL_FAIL');
    process.exitCode = 1;
  }
}
