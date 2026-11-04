'use strict';
// Verification-only package custody. No executable invocation or source fallback.
// Match production package admission: ASAR checksums require physical bytes.
// Missing original-fs is fatal; never disable ASAR globally or fall back.
const fs = require(process.versions.electron ? 'original-fs' : 'node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const admission = require('../launch/package-admission.cjs');
const desktop = path.resolve(__dirname, '..');
const LIMIT = 640 * 1024 * 1024,
  records = new WeakMap();
function fail() {
  throw Error('MAIN_VERSION_PACKAGE');
}
const sha40 = (v) => typeof v === 'string' && v.length === 40 && /^[0-9a-f]+$/.test(v);
function directory(file) {
  const s = fs.lstatSync(file);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    path.resolve(file) !== file ||
    fs.realpathSync.native(file) !== file
  )
    fail();
  return { dev: s.dev, ino: s.ino };
}
function fileProof(file, limit = LIMIT) {
  const before = fs.lstatSync(file);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    !Number.isSafeInteger(before.size) ||
    before.size < 0 ||
    before.size > limit ||
    fs.realpathSync.native(file) !== file
  )
    fail();
  const fd = fs.openSync(file, 'r'),
    hash = createHash('sha256'),
    chunk = Buffer.alloc(65536);
  let count = 0;
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino) fail();
    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!n) break;
      count += n;
      if (count > before.size || count > limit) fail();
      hash.update(chunk.subarray(0, n));
    }
    const after = fs.fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail();
  } finally {
    fs.closeSync(fd);
  }
  const after = fs.lstatSync(file);
  if (
    count !== before.size ||
    after.dev !== before.dev ||
    after.ino !== before.ino ||
    after.size !== before.size ||
    after.mtimeMs !== before.mtimeMs ||
    after.nlink !== 1
  )
    fail();
  return { bytes: count, sha256: hash.digest('hex') };
}
function raw(file, limit = 65536) {
  const proof = fileProof(file, limit),
    fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(proof.bytes + 1);
    let n = 0;
    while (n < b.length) {
      const c = fs.readSync(fd, b, n, b.length - n, null);
      if (!c) break;
      n += c;
    }
    if (
      n !== proof.bytes ||
      createHash('sha256').update(b.subarray(0, n)).digest('hex') !== proof.sha256
    )
      fail();
    return new TextDecoder('utf8', { fatal: true }).decode(b.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}
function json(file) {
  const text = raw(file),
    v = JSON.parse(text);
  if (JSON.stringify(v) !== text) fail();
  return v;
}
function exact(v, keys) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    JSON.stringify(Object.keys(v)) !== JSON.stringify(keys)
  )
    fail();
}
function owned(root) {
  if (root !== path.join(desktop, '.retained-host-runtime', 'r')) fail();
  const identity = directory(root);
  directory(path.dirname(root));
  const owner = raw(path.join(root, '.owner'), 36);
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(owner) || owner.length !== 36) fail();
  return { owner, ...identity };
}
function pathBudget(root, packageRoot) {
  const id = '00000000-0000-4000-8000-000000000000',
    managed = path.join(root, 'first-use', 'Fonesi-Auto-' + id),
    launch = path.join(managed, 'launch-' + id),
    helper = path.join(launch, '.host-session');
  if (
    helper.length > 184 ||
    path.join(helper, 'profile').length > 192 ||
    path.join(helper, 'bootstrap.json').length > 199
  )
    fail();
  const files = [
    path.join(
      managed,
      'data-main/platform-tools-runtime/runtimes/runtime-' + '0'.repeat(64),
      'adb.exe',
    ),
    path.join(packageRoot, 'runtime/node/node.exe'),
    path.join(packageRoot, 'runtime/electron/electron.exe'),
    ...admission.NATIVE.map((n) => path.join(packageRoot, 'app/native', n)),
    ...admission.CLOSURE.map((n) => path.join(packageRoot, 'app/launch', n)),
    path.join(__dirname, 'main-runtime-version-probe.cjs'),
    path.join(__dirname, 'persistence-launch-init-probe.cjs'),
  ];
  for (const file of files)
    if (path.resolve(file) !== file || file.length > 259 || path.dirname(file).length > 247) fail();
  return true;
}
function inspect(root, head, tree) {
  const owner = owned(root);
  if (!sha40(head) || !sha40(tree)) fail();
  pathBudget(root, path.join(root, 'relocated-package'));
  const candidateRoot = path.join(desktop, '.package-build');
  directory(candidateRoot);
  const candidateRaw = raw(path.join(candidateRoot, 'candidate.json')),
    candidate = JSON.parse(candidateRaw);
  // Existing package-build-entry writes one canonical JSON record plus one LF.
  if (JSON.stringify(candidate) + '\n' !== candidateRaw) fail();
  exact(candidate, ['directory', 'zip', 'sha256', 'bytes']);
  if (
    typeof candidate.directory !== 'string' ||
    typeof candidate.zip !== 'string' ||
    typeof candidate.sha256 !== 'string' ||
    candidate.sha256.length !== 64 ||
    !/^[0-9a-f]+$/.test(candidate.sha256) ||
    !Number.isSafeInteger(candidate.bytes) ||
    candidate.bytes < 1 ||
    candidate.bytes > LIMIT
  )
    fail();
  const container = path.dirname(candidate.directory);
  if (
    path.dirname(container) !== candidateRoot ||
    !/^Fonesi-Auto-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(path.basename(container)) ||
    path.basename(candidate.directory) !== 'package' ||
    candidate.zip !== path.join(container, 'Fonesi-Auto.zip')
  )
    fail();
  directory(container);
  directory(candidate.directory);
  const zip = fileProof(candidate.zip);
  if (zip.bytes !== candidate.bytes || zip.sha256 !== candidate.sha256) fail();
  if (raw(path.join(container, 'Fonesi-Auto.zip.sha256')) !== `${candidate.sha256}\n`) fail();
  const extracted = path.join(root, 'relocated-package');
  directory(extracted);
  const original = admission.verifyPackage(candidate.directory),
    copy = admission.verifyPackage(extracted);
  if (
    original.sourceHead !== head ||
    original.sourceTree !== tree ||
    JSON.stringify(original) !== JSON.stringify(copy)
  )
    fail();
  const first = admission.inventory(candidate.directory),
    second = admission.inventory(extracted);
  for (const inventory of [first, second]) {
    inventory.directories.sort();
    if (
      inventory.files.length > 512 ||
      inventory.files.length + inventory.directories.length > 1024 ||
      inventory.total > LIMIT
    )
      fail();
  }
  if (JSON.stringify(first) !== JSON.stringify(second)) fail();
  for (const dir of first.directories) {
    directory(path.join(candidate.directory, dir));
    directory(path.join(extracted, dir));
  }
  for (const row of first.files) {
    admission.safeName(row.path);
    for (const base of [candidate.directory, extracted])
      if (
        JSON.stringify(fileProof(path.join(base, row.path))) !==
        JSON.stringify({ bytes: row.bytes, sha256: row.sha256 })
      )
        fail();
  }
  const manifest = fileProof(path.join(extracted, 'package-manifest.json'), 65536);
  if (
    raw(path.join(extracted, 'app/build/.verified-build.json')) !==
    raw(path.join(desktop, 'build/.verified-build.json'))
  )
    fail();
  if (JSON.stringify(owned(root)) !== JSON.stringify(owner)) fail();
  return {
    version: 1,
    sourceHead: head,
    sourceTree: tree,
    candidateDirectory: candidate.directory,
    candidateZip: candidate.zip,
    zipBytes: zip.bytes,
    zipSha256: zip.sha256,
    manifestBytes: manifest.bytes,
    manifestSha256: manifest.sha256,
    files: second.files,
    directories: second.directories,
  };
}
function prepareBinding(root, head, tree) {
  const value = inspect(root, head, tree),
    text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 65536) fail();
  const owner = owned(root),
    fd = fs.openSync(path.join(root, 'package-binding.json'), 'wx', 0o600);
  try {
    fs.writeFileSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (
    raw(path.join(root, 'package-binding.json')) !== text ||
    JSON.stringify(owned(root)) !== JSON.stringify(owner)
  )
    fail();
  return admitPackage(root);
}
function admitPackage(root) {
  const value = json(path.join(root, 'package-binding.json'));
  exact(value, [
    'version',
    'sourceHead',
    'sourceTree',
    'candidateDirectory',
    'candidateZip',
    'zipBytes',
    'zipSha256',
    'manifestBytes',
    'manifestSha256',
    'files',
    'directories',
  ]);
  if (
    value.version !== 1 ||
    JSON.stringify(inspect(root, value.sourceHead, value.sourceTree)) !== JSON.stringify(value)
  )
    fail();
  const packageRoot = path.join(root, 'relocated-package'),
    appRoot = path.join(packageRoot, 'app'),
    buildRoot = path.join(appRoot, 'build');
  const result = Object.freeze({
    packageRoot,
    appRoot,
    buildRoot,
    sourceHead: value.sourceHead,
    sourceTree: value.sourceTree,
    zipSha256: value.zipSha256,
    zipBytes: value.zipBytes,
    manifestSha256: value.manifestSha256,
  });
  records.set(result, {
    root,
    owner: owned(root),
    binding: JSON.stringify(value),
    packageIdentity: directory(packageRoot),
    appIdentity: directory(appRoot),
    buildIdentity: directory(buildRoot),
    files: new Map(value.files.map((v) => [v.path, Object.freeze({ ...v })])),
  });
  return result;
}
function assertPackage(value) {
  const r = records.get(value);
  if (
    !r ||
    JSON.stringify(owned(r.root)) !== JSON.stringify(r.owner) ||
    raw(path.join(r.root, 'package-binding.json')) !== r.binding
  )
    fail();
  if (
    JSON.stringify(directory(value.packageRoot)) !== JSON.stringify(r.packageIdentity) ||
    JSON.stringify(directory(value.appRoot)) !== JSON.stringify(r.appIdentity) ||
    JSON.stringify(directory(value.buildRoot)) !== JSON.stringify(r.buildIdentity)
  )
    fail();
  return r;
}
function loadBuild(value, name) {
  const r = assertPackage(value);
  if (!admission.BUILD_OUTPUTS.includes(name)) fail();
  const row = r.files.get('app/build/' + name);
  if (
    !row ||
    JSON.stringify(fileProof(path.join(value.buildRoot, name))) !==
      JSON.stringify({ bytes: row.bytes, sha256: row.sha256 })
  )
    fail();
  return require(path.join(value.buildRoot, name));
}
function initializer(value) {
  const r = assertPackage(value),
    name = 'app/launch/persistence-initialize.cjs',
    row = r.files.get(name),
    file = path.join(value.packageRoot, name);
  if (
    !row ||
    JSON.stringify(fileProof(file)) !== JSON.stringify({ bytes: row.bytes, sha256: row.sha256 })
  )
    fail();
  return file;
}
module.exports = {
  prepareBinding,
  admitPackage,
  assertPackage,
  loadBuild,
  initializer,
  fileProof,
  pathBudget,
};
