// Fixed build-only retained-pair composition. No payload execution or runtime approval.
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildPackage } from '../scripts/build-package.mjs';
import {
  verifyRetainedPair,
  verifyPackage,
  packageInventory,
  NODE_SHA,
  NODE_LICENSE_SHA,
} from '../scripts/package-manifest.mjs';
import { inputs, outputs, verifyBuild } from '../scripts/build-manifest.mjs';
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASE = path.join(desktop, '.retained-pair-package-check');
export const INPUT = path.join(desktop, '.retained-pair-package-input');
export const LICENSE = path.join(desktop, '.retained-pair-package-node-LICENSE');
const metadata = path.join(desktop, 'video-source/retained-package');
export const PINS = Object.freeze({
  retainedArtifactId: '13132988023',
  retainedRunId: '41427976617',
  retentionReceiptSha256: 'dc3e9888284b5512c4c5314890eff9591ae825db4029884bbed81c683a966e98',
  pairManifestSha256: '934a9ff34a1b868fa56ddfc8a57d4eaba64d9d6305b6da05839566b90b366437',
  noticeManifestSha256: '305698d5f4623d7572c1c46a515a17d0984b35d26a82ae743ebeb71a04a0ebf6',
  evidenceManifestSha256: '7bd7125bf8f427cd10a2371f6a435b82c410bd4a0163b5626750049a7aa2a043',
});
const uuid = (x) =>
  typeof x === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x) &&
  x.length === 36;
const hash = (b) => createHash('sha256').update(b).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let phase = 'ADMISSION';
function requireThat(ok) {
  if (!ok) throw Error('RETAINED_PAIR_PACKAGE_REJECTED');
}
function id(s) {
  return [String(s.dev), String(s.ino)];
}
function stamp(s) {
  return [...id(s), String(s.size), String(s.mtimeNs)];
}
export function directory(p) {
  requireThat(path.resolve(p) === p && fs.realpathSync.native(p) === p);
  const s = fs.lstatSync(p, { bigint: true });
  requireThat(s.isDirectory() && !s.isSymbolicLink());
  return id(s);
}
function ancestors(p) {
  let d = path.dirname(p);
  for (;;) {
    directory(d);
    const n = path.dirname(d);
    if (n === d) break;
    d = n;
  }
}
export function stableFile(p, cap, collect = false) {
  ancestors(p);
  const before = fs.lstatSync(p, { bigint: true });
  requireThat(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1n &&
      before.size >= 0n &&
      before.size <= BigInt(cap),
  );
  const fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const held = fs.fstatSync(fd, { bigint: true });
    requireThat(same(stamp(before), stamp(held)));
    const h = createHash('sha256'),
      chunks = [];
    let bytes = 0;
    const buf = Buffer.alloc(65536);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, Math.min(buf.length, cap - bytes + 1), null);
      if (!n) break;
      bytes += n;
      requireThat(bytes <= cap);
      h.update(buf.subarray(0, n));
      if (collect) chunks.push(Buffer.from(buf.subarray(0, n)));
    }
    const after = fs.lstatSync(p, { bigint: true });
    requireThat(
      same(stamp(before), stamp(after)) &&
        same(stamp(held), stamp(fs.fstatSync(fd, { bigint: true }))) &&
        bytes === Number(before.size),
    );
    return {
      identity: id(before),
      bytes,
      sha256: h.digest('hex'),
      ...(collect ? { data: Buffer.concat(chunks) } : {}),
    };
  } finally {
    fs.closeSync(fd);
  }
}
function bytes(p, cap = 1048576) {
  return stableFile(p, cap, true).data;
}
function canonical(p, cap = 1048576) {
  const b = bytes(p, cap),
    v = JSON.parse(b.toString('utf8'));
  requireThat(Buffer.from(JSON.stringify(v)).equals(b));
  return v;
}
function write(p, b) {
  requireThat(Buffer.isBuffer(b));
  directory(path.dirname(p));
  const fd = fs.openSync(p, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, b);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  requireThat(bytes(p, b.length).equals(b));
}
function json(p, v) {
  write(p, Buffer.from(JSON.stringify(v)));
}
function token(p) {
  const t = bytes(path.join(p, '.owner'), 36).toString('ascii');
  requireThat(uuid(t));
  return t;
}
function owned(root) {
  requireThat(
    path.dirname(root) === BASE &&
      path.basename(root).startsWith('run-') &&
      uuid(path.basename(root).slice(4)),
  );
  return {
    rootIdentity: directory(root),
    baseIdentity: directory(BASE),
    owner: token(root),
    baseOwner: token(BASE),
  };
}
function fence(root, o) {
  requireThat(same(owned(root), o));
}
function safeName(n) {
  requireThat(
    typeof n === 'string' &&
      n.length <= 256 &&
      n.split('/').every((s) => s !== '' && s !== '.' && s !== '..' && /^[A-Za-z0-9_.-]+$/.test(s)),
  );
  return n;
}
function parents(names) {
  const ds = new Set();
  for (const n of names) {
    let d = path.posix.dirname(n);
    while (d !== '.') {
      ds.add(d);
      d = path.posix.dirname(d);
    }
  }
  return [...ds].sort();
}
// Refuse before entering any unknown subtree. Bounds derive from existing 1024-entry package inventory plus fixed candidate/private files.
export function captureLayout(root, names, extraDirs = []) {
  const allowed = new Set(names.map(safeName)),
    dirs = new Set([...parents(names), ...extraDirs]);
  requireThat(allowed.size === names.length && allowed.size <= 550 && dirs.size <= 1050);
  const rows = [],
    foundDirs = [];
  let count = 0,
    total = 0;
  function walk(d, prefix) {
    const h = fs.opendirSync(d);
    try {
      for (;;) {
        const e = h.readSync();
        if (!e) break;
        requireThat(++count <= 1600);
        const n = prefix + e.name;
        requireThat(allowed.has(n) || dirs.has(n));
        const f = path.join(root, n),
          s = fs.lstatSync(f);
        if (dirs.has(n)) {
          requireThat(s.isDirectory() && !s.isSymbolicLink());
          foundDirs.push({ path: n, identity: directory(f) });
          walk(f, n + '/');
        } else {
          const v = stableFile(f, 700 * 1024 * 1024);
          total += v.bytes;
          requireThat(total <= 1300 * 1024 * 1024);
          rows.push({ path: n, ...v });
        }
      }
    } finally {
      h.closeSync();
    }
  }
  directory(root);
  walk(root, '');
  rows.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  foundDirs.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  requireThat(
    same(rows.map((x) => x.path).sort(), [...allowed].sort()) &&
      same(foundDirs.map((x) => x.path).sort(), [...dirs].sort()),
  );
  return { files: rows, directories: foundDirs };
}
export function admitArtifact(root = INPUT) {
  phase = 'ARTIFACT';
  const r = bytes(path.join(root, 'retention-receipt.json'), 8192);
  requireThat(hash(r) === PINS.retentionReceiptSha256);
  const receipt = JSON.parse(r);
  requireThat(
    receipt.githubRunId === PINS.retainedRunId &&
      receipt.files.length === 30 &&
      receipt.totalBytes === 2482468 &&
      receipt.passed === true,
  );
  const inv = captureLayout(root, ['retention-receipt.json', ...receipt.files.map((x) => x.path)]);
  for (const row of receipt.files) {
    const got = inv.files.find((x) => x.path === row.path);
    requireThat(got.bytes === row.bytes && got.sha256 === row.sha256);
  }
  return inv;
}
export function candidateBuffers(input = INPUT) {
  const artifact = admitArtifact(input),
    out = new Map();
  phase = 'CANDIDATE';
  const get = (n) => {
    const r = artifact.files.find((x) => x.path === n);
    requireThat(r);
    const b = bytes(path.join(input, n), r.bytes);
    requireThat(hash(b) === r.sha256);
    return b;
  };
  for (const n of [
    'IsolatedAdbServer',
    'RetainedAdbProtocol',
    'RetainedAdbSession',
    'RetainedHostAdmission',
    'RetainedVideoSession',
  ]) {
    const b = get(`source/auto/native/${n}.cs`);
    requireThat(bytes(path.join(desktop, 'native', n + '.cs')).equals(b));
    out.set(`app/native/${n}.cs`, b);
  }
  out.set('app/native/RetainedVideoConsumer.dll', get('payload/RetainedVideoConsumer.dll'));
  out.set('app/video/server.jar', get('payload/server.jar'));
  for (const n of [
    'commands',
    'consumer-build',
    'dependencies',
    'generated',
    'outputs',
    'report',
    'server-build',
    'source',
    'tools',
  ])
    out.set(`app/video/evidence/${n}.json`, get(`build/${n}.json`));
  for (const n of ['consumer-build', 'server-build'])
    out.set(`app/video/${n}.json`, get(`build/${n}.json`));
  for (const [n, pin] of [
    ['pair', PINS.pairManifestSha256],
    ['notice-manifest', PINS.noticeManifestSha256],
    ['evidence-manifest', PINS.evidenceManifestSha256],
  ]) {
    const b = bytes(path.join(metadata, n + '.json'));
    requireThat(hash(b) === pin);
    out.set(`app/video/${n}.json`, b);
  }
  out.set('app/video/notices/APACHE-2.0.txt', get('source/upstream-LICENSE'));
  out.set(
    'app/video/notices/ATTRIBUTIONS.txt',
    Buffer.concat([
      bytes(path.join(metadata, 'attribution-prefix.txt'), 16384),
      get('notice/NOTICE.txt'),
    ]),
  );
  requireThat(out.size === 23);
  return out;
}
export function materializeCandidate(root, buffers) {
  directory(root);
  requireThat(fs.readdirSync(root).length === 0);
  for (const d of parents([...buffers.keys()]).sort((a, b) => a.length - b.length))
    fs.mkdirSync(path.join(root, d));
  for (const [n, b] of buffers) write(path.join(root, safeName(n)), b);
  verifyRetainedPair(root);
  return captureLayout(root, [...buffers.keys()]);
}
function sourceClosure() {
  const names = [
    ...new Set([
      ...inputs,
      ...outputs.map((x) => 'build/' + x),
      'scripts/build-package.mjs',
      'scripts/package-manifest.mjs',
      'scripts/build-manifest.mjs',
      'scripts/demo-build-manifest.mjs',
      'scripts/verify-dependencies.mjs',
      'verification/retained-pair-package-control.mjs',
      'verification/Invoke-RetainedPairPackage.ps1',
      '../tools/phase-00/HostProbeNative.cs',
      'verification/WindowsBoundary.psm1',
      'verification/OwnedFiles.psm1',
      ...[
        'pair.json',
        'notice-manifest.json',
        'evidence-manifest.json',
        'attribution-prefix.txt',
      ].map((x) => 'video-source/retained-package/' + x),
    ]),
  ].sort();
  return names.map((p) => ({ path: p, ...stableFile(path.join(desktop, p), 16 * 1024 * 1024) }));
}
function context(root) {
  const c = canonical(path.join(root, 'context.json'), 8192);
  requireThat(
    same(Object.keys(c), ['version', 'sourceHead', 'sourceTree', 'npmVersion', 'nodeExe']) &&
      c.version === 1 &&
      /^[0-9a-f]{40}$/.test(c.sourceHead) &&
      c.sourceHead.length === 40 &&
      /^[0-9a-f]{40}$/.test(c.sourceTree) &&
      c.sourceTree.length === 40 &&
      typeof c.npmVersion === 'string' &&
      /^\d+\.\d+\.\d+$/.test(c.npmVersion) &&
      c.nodeExe === process.execPath,
  );
  return c;
}
function recheck(root, s) {
  fence(root, s.ownership);
  requireThat(
    same(context(root), s.context) &&
      same(sourceClosure(), s.source) &&
      same(admitArtifact(), s.artifact) &&
      same(stableFile(process.execPath, 128 * 1024 * 1024), s.node) &&
      same(stableFile(LICENSE, 1048576), s.license),
  );
  if (s.candidate) {
    requireThat(
      same(directory(path.join(root, 'candidate')), s.candidateIdentity) &&
        same(directory(path.join(root, 'output')), s.outputIdentity),
    );
    requireThat(
      same(
        captureLayout(
          path.join(root, 'candidate'),
          s.candidate.files.map((x) => x.path),
        ),
        s.candidate,
      ),
    );
  }
  fence(root, s.ownership);
}
export function prepare(root) {
  phase = 'ADMISSION';
  const ownership = owned(root);
  captureLayout(root, ['.owner', 'context.json']);
  const c = context(root);
  requireThat(process.platform === 'win32' && process.arch === 'x64');
  const node = stableFile(process.execPath, 128 * 1024 * 1024),
    license = stableFile(LICENSE, 1048576);
  requireThat(
    node.sha256 === NODE_SHA && license.sha256 === NODE_LICENSE_SHA && verifyBuild(desktop),
  );
  const artifact = admitArtifact(),
    source = sourceClosure();
  const state = { version: 1, ownership, context: c, node, license, artifact, source };
  phase = 'CANDIDATE';
  fence(root, ownership);
  fs.mkdirSync(path.join(root, 'candidate'));
  state.candidate = materializeCandidate(path.join(root, 'candidate'), candidateBuffers());
  state.candidateIdentity = directory(path.join(root, 'candidate'));
  fs.mkdirSync(path.join(root, 'output'));
  state.outputIdentity = directory(path.join(root, 'output'));
  recheck(root, state);
  phase = 'CANDIDATE';
  json(path.join(root, 'private.json'), state);
}
export async function build(root) {
  phase = 'BUILD';
  const state = canonical(path.join(root, 'private.json'), 1048576);
  recheck(root, state);
  verifyRetainedPair(path.join(root, 'candidate'));
  requireThat(fs.readdirSync(path.join(root, 'output')).length === 0);
  const runtimePath = path.join(desktop, '.runtime/persistence-runtime-manifest.json');
  const runtime = stableFile(runtimePath, 1048576);
  requireThat(canonical(runtimePath).head === state.context.sourceHead);
  phase = 'BUILD';
  const result = await buildPackage({
    ...state.context,
    nodeLicense: LICENSE,
    outputParent: path.join(root, 'output'),
    retainedPairRoot: path.join(root, 'candidate'),
  });
  phase = 'VERIFY';
  recheck(root, state);
  phase = 'VERIFY';
  requireThat(same(stableFile(runtimePath, 1048576), runtime));
  const manifest = verifyPackage(result.directory),
    inv = packageInventory(result.directory);
  const zip = stableFile(result.zip, 640 * 1024 * 1024),
    receipt = canonical(result.receipt, 8192);
  requireThat(
    zip.sha256 === result.sha256 &&
      zip.bytes === result.bytes &&
      receipt.archiveSha256 === zip.sha256 &&
      receipt.archiveBytes === zip.bytes &&
      receipt.sourceHead === state.context.sourceHead &&
      receipt.sourceTree === state.context.sourceTree,
  );
  const packageManifestSha256 = stableFile(
    path.join(result.directory, 'package-manifest.json'),
    65536,
  ).sha256;
  requireThat(
    receipt.packageManifestSha256 === packageManifestSha256 &&
      receipt.pairManifestSha256 === PINS.pairManifestSha256 &&
      receipt.noticeManifestSha256 === PINS.noticeManifestSha256 &&
      receipt.evidenceManifestSha256 === PINS.evidenceManifestSha256 &&
      bytes(result.zip + '.sha256', 65).toString('ascii') === zip.sha256 + '\n',
  );
  const publicResult = {
    sourceHead: state.context.sourceHead,
    sourceTree: state.context.sourceTree,
    ...PINS,
    nodeSha256: nodePin(state),
    electronManifestSha256: runtime.sha256,
    packageManifestSha256,
    packageFiles: manifest.files.length,
    packageBytes: inv.total,
    archiveBytes: zip.bytes,
    archiveSha256: zip.sha256,
    externalReceiptSha256: stableFile(result.receipt, 8192).sha256,
    packageVerified: true,
    archiveBound: true,
  };
  requireThat(Buffer.byteLength(JSON.stringify(publicResult)) <= 8192);
  json(path.join(root, 'build-result.json'), publicResult);
  const relative = (p) => {
    const n = path.relative(root, p).split(path.sep).join('/');
    return safeName(n);
  };
  const candidateNames = [...candidateBuffers().keys()].map((n) => 'candidate/' + n),
    packageNames = inv.files.map((f) => relative(path.join(result.directory, f.path)));
  const names = [
    '.owner',
    'context.json',
    'private.json',
    'build-result.json',
    ...candidateNames,
    ...packageNames,
    relative(result.zip),
    relative(result.zip + '.sha256'),
    relative(result.receipt),
  ];
  const packageDirs = inv.directories.map((n) => relative(path.join(result.directory, n)));
  const layout = captureLayout(root, names, packageDirs);
  // Never promote a coherent replacement into the successful cleanup baseline.
  const originalResult = Buffer.from(JSON.stringify(publicResult));
  const resultRow = layout.files.find((row) => row.path === 'build-result.json');
  requireThat(
    bytes(path.join(root, 'build-result.json'), 8192).equals(originalResult) &&
      resultRow.bytes === originalResult.length &&
      resultRow.sha256 === hash(originalResult),
  );
  fence(root, state.ownership);
  json(path.join(root, 'cleanup.json'), { version: 1, ownership: state.ownership, layout });
  return publicResult;
}
function nodePin(s) {
  return s.node.sha256;
}
export function removeCaptured(root, ownership, layout, sealName) {
  fence(root, ownership);
  const seal = stableFile(path.join(root, sealName), 1048576);
  const now = captureLayout(
    root,
    [...layout.files.map((x) => x.path), sealName],
    layout.directories.map((x) => x.path),
  );
  requireThat(
    same(
      now.files.filter((x) => x.path !== sealName),
      layout.files,
    ) && same(now.directories, layout.directories),
  );
  const check = (relativeName = null) => {
    fence(root, ownership);
    requireThat(same(stableFile(path.join(root, sealName), 1048576), seal));
    if (relativeName !== null)
      for (const d of layout.directories) {
        if (relativeName.startsWith(d.path + '/'))
          requireThat(same(directory(path.join(root, d.path)), d.identity));
      }
  };
  for (const row of layout.files.filter((x) => x.path !== '.owner')) {
    check(row.path);
    requireThat(
      same(stableFile(path.join(root, row.path), 700 * 1024 * 1024), {
        identity: row.identity,
        bytes: row.bytes,
        sha256: row.sha256,
      }),
    );
    fs.unlinkSync(path.join(root, row.path));
  }
  for (const d of layout.directories.slice().sort((a, b) => b.path.length - a.path.length)) {
    check(d.path);
    requireThat(same(directory(path.join(root, d.path)), d.identity));
    fs.rmdirSync(path.join(root, d.path));
  }
  check();
  fs.unlinkSync(path.join(root, sealName));
  fence(root, ownership);
  requireThat(fs.readdirSync(root).length === 1);
  fs.unlinkSync(path.join(root, '.owner'));
  requireThat(
    same(directory(root), ownership.rootIdentity) &&
      same(directory(BASE), ownership.baseIdentity) &&
      token(BASE) === ownership.baseOwner,
  );
  fs.rmdirSync(root);
  requireThat(!fs.existsSync(root));
}
export function cleanup(root) {
  phase = 'CLEANUP';
  const seal = canonical(path.join(root, 'cleanup.json'), 1048576);
  requireThat(seal.version === 1);
  const state = canonical(path.join(root, 'private.json'), 1048576);
  requireThat(same(seal.ownership, state.ownership));
  recheck(root, state);
  phase = 'CLEANUP';
  removeCaptured(root, seal.ownership, seal.layout, 'cleanup.json');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireThat(process.argv.length === 4);
    const [action, root] = process.argv.slice(2);
    requireThat(['prepare', 'build', 'cleanup'].includes(action));
    if (action === 'prepare') prepare(root);
    else if (action === 'build') await build(root);
    else cleanup(root);
    console.log(
      action === 'prepare'
        ? 'RETAINED_PAIR_PACKAGE_PREPARED'
        : action === 'build'
          ? 'RETAINED_PAIR_PACKAGE_BUILT'
          : 'RETAINED_PAIR_PACKAGE_CLEANED',
    );
  } catch {
    console.log(
      'RETAINED_PAIR_PACKAGE_FAILED|' +
        (['ADMISSION', 'ARTIFACT', 'CANDIDATE', 'BUILD', 'VERIFY', 'CLEANUP'].includes(phase)
          ? phase
          : 'ADMISSION'),
    );
    process.exitCode = 1;
  }
}
