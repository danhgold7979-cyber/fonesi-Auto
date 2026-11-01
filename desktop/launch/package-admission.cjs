'use strict';
// Verify physical package bytes, including ASAR archives. Electron's node:fs
// presents archive contents as a virtual directory; original-fs preserves the
// on-disk archive. Failure to load it is fatal, never a virtual-fs fallback.
const fs = require(process.versions.electron ? 'original-fs' : 'node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { isDeepStrictEqual } = require('node:util');
const NODE_SHA = 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5';
const NODE_LICENSE_SHA = '5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace';
const REACT_LICENSE_SHA = 'da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93';
const MAX_BYTES = 640 * 1024 * 1024;
const BUILD_OUTPUTS = [
  'main.cjs',
  'adb-host-factory.cjs',
  'asset-policy.cjs',
  'lifecycle.cjs',
  'profile-owner.cjs',
  'window-policy.cjs',
  'foundation-bridge.cjs',
  'ipc-contract.cjs',
  'log-contract.cjs',
  'log-store.cjs',
  'logging.cjs',
  'log-recovery.cjs',
  'foundation-persistence.cjs',
  'backup-key-profile.cjs',
  'persistence-files.cjs',
  'foundation-database.cjs',
  'backup-service.cjs',
  'persistence-native.cjs',
  'persistence-proof.cjs',
  'persistence-entry.cjs',
  'secret-store.cjs',
  'secret-provider.cjs',
  'secret-contract.cjs',
  'settings-contract.cjs',
  'preferences-bridge.cjs',
  'fleet-contract.cjs',
  'fleet-bridge.cjs',
  'fleet-service.cjs',
  'settings-store.cjs',
  'settings-window.cjs',
  'preload.cjs',
  'renderer.js',
  'status.html',
  'v9.css',
];
const NATIVE = [
  'PersistenceProcess.cs',
  'IsolatedAdbServer.cs',
  'RetainedAdbSession.cs',
  'RetainedAdbProtocol.cs',
  'RetainedHostAdmission.cs',
];
const CLOSURE = [
  'Invoke-Package.ps1',
  'Invoke-RetainedHost.ps1',
  'launch-core.ps1',
  'persistence-initialize.cjs',
  'persistence-launch-control.cjs',
  'launch-journal.cjs',
  'package-admission.cjs',
];
const PROVENANCE = [
  'source.json',
  'package.json',
  'package-lock.json',
  'dependency-review.json',
  'build-manifest.json',
  'runtime-manifest.json',
];
const fail = () => {
  throw Error('PACKAGE_REJECTED');
};
function keys(v, names) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).join('|') !== names.join('|')
  )
    fail();
}
function safeName(name) {
  if (typeof name !== 'string' || name.length > 240 || name.includes('\\')) fail();
  for (const part of name.split('/'))
    if (
      !/^[A-Za-z0-9._-]+$/.test(part) ||
      part === '.' ||
      part === '..' ||
      part.endsWith('.') ||
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)
    )
      fail();
  return name;
}
function plainDirectory(directory) {
  if (path.resolve(directory) !== directory || fs.realpathSync.native(directory) !== directory)
    fail();
  for (let p = directory; ; ) {
    const s = fs.lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink()) fail();
    const parent = path.dirname(p);
    if (parent === p) break;
    p = parent;
  }
}
function digest(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) fail();
  const h = fs.openSync(file, 'r'),
    hash = crypto.createHash('sha256'),
    b = Buffer.alloc(65536);
  let count = 0;
  try {
    for (;;) {
      const n = fs.readSync(h, b, 0, b.length, null);
      if (!n) break;
      count += n;
      if (count > stat.size) fail();
      hash.update(b.subarray(0, n));
    }
  } finally {
    fs.closeSync(h);
  }
  if (count !== stat.size) fail();
  return { bytes: count, sha256: hash.digest('hex') };
}
function json(file, canonical = true) {
  const s = fs.lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 1024 * 1024) fail();
  const raw = fs.readFileSync(file, 'utf8'),
    v = JSON.parse(raw);
  if (canonical && raw !== JSON.stringify(v)) fail();
  return v;
}
function inventory(root) {
  plainDirectory(root);
  const files = [],
    directories = [],
    folded = new Set();
  let total = 0,
    count = 0;
  function walk(directory, prefix, depth) {
    if (depth > 16) fail();
    const h = fs.opendirSync(directory);
    try {
      for (;;) {
        const e = h.readSync();
        if (!e) break;
        if (++count > 1024) fail();
        const name = safeName(prefix + e.name),
          lower = name.toLowerCase();
        if (folded.has(lower)) fail();
        folded.add(lower);
        const full = path.join(directory, e.name),
          s = fs.lstatSync(full);
        if (s.isSymbolicLink()) fail();
        if (s.isDirectory()) {
          directories.push(name);
          walk(full, name + '/', depth + 1);
        } else {
          if (files.length >= 512) fail();
          const d = digest(full);
          total += d.bytes;
          if (total > MAX_BYTES) fail();
          files.push({ path: name, ...d });
        }
      }
    } finally {
      h.closeSync();
    }
  }
  walk(root, '', 0);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, directories, total };
}
function verifyPackage(root) {
  const actual = inventory(root),
    manifest = json(path.join(root, 'package-manifest.json'));
  if (fs.lstatSync(path.join(root, 'package-manifest.json')).size > 65536) fail();
  keys(manifest, ['version', 'mode', 'sourceHead', 'sourceTree', 'runtime', 'entry', 'files']);
  keys(manifest.runtime, [
    'platform',
    'arch',
    'node',
    'electron',
    'nodeExeSha256',
    'electronExeSha256',
  ]);
  if (
    manifest.version !== 1 ||
    manifest.mode !== 'INTERNAL_PRODUCTION' ||
    !/^[0-9a-f]{40}$/.test(manifest.sourceHead) ||
    !/^[0-9a-f]{40}$/.test(manifest.sourceTree) ||
    manifest.entry !== 'Launch.ps1' ||
    manifest.runtime.platform !== 'win32' ||
    manifest.runtime.arch !== 'x64' ||
    manifest.runtime.node !== '24.22.1' ||
    manifest.runtime.electron !== '45.1.0' ||
    manifest.runtime.nodeExeSha256 !== NODE_SHA ||
    !/^[0-9a-f]{64}$/.test(manifest.runtime.electronExeSha256) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > 511
  )
    fail();
  const files = actual.files.filter((f) => f.path !== 'package-manifest.json');
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) fail();
  const byName = new Map(files.map((f) => [f.path, f]));
  const runtime = json(path.join(root, 'provenance/runtime-manifest.json'));
  keys(runtime, ['version', 'head', 'electron', 'exeSha256', 'entries']);
  if (
    runtime.version !== 1 ||
    runtime.head !== manifest.sourceHead ||
    runtime.electron !== '45.1.0' ||
    runtime.exeSha256 !== manifest.runtime.electronExeSha256 ||
    !Array.isArray(runtime.entries) ||
    runtime.entries.length > 256
  )
    fail();
  const runtimeFiles = [];
  const runtimeNames = new Set();
  for (const item of runtime.entries) {
    safeName(item.name);
    if (runtimeNames.has(item.name.toLowerCase())) fail();
    runtimeNames.add(item.name.toLowerCase());
    if (item.kind === 'directory') {
      keys(item, ['kind', 'name']);
      safeName(item.name);
    } else {
      keys(item, ['kind', 'name', 'bytes', 'sha256']);
      if (item.kind !== 'file') fail();
      safeName(item.name);
      const expected = {
        path: 'runtime/electron/' + item.name,
        bytes: item.bytes,
        sha256: item.sha256,
      };
      if (JSON.stringify(byName.get(expected.path)) !== JSON.stringify(expected)) fail();
      runtimeFiles.push(expected.path);
    }
  }
  const expected = [
    'Launch.ps1',
    'README.txt',
    'runtime/node/node.exe',
    'runtime/node/LICENSE',
    ...NATIVE.map((n) => 'app/native/' + n),
    ...CLOSURE.map((n) => 'app/launch/' + n),
    ...BUILD_OUTPUTS.map((n) => 'app/build/' + n),
    'app/build/.verified-build.json',
    ...PROVENANCE.map((n) => 'provenance/' + n),
    ...['react', 'react-dom', 'scheduler'].map((n) => 'licenses/' + n + '-LICENSE'),
    ...runtimeFiles,
  ].sort();
  if (
    expected.length !== new Set(expected).size ||
    JSON.stringify([...byName.keys()].sort()) !== JSON.stringify(expected)
  )
    fail();
  for (const required of ['electron.exe', 'LICENSE', 'LICENSES.chromium.html', 'version'])
    if (!byName.has('runtime/electron/' + required)) fail();
  if (fs.readFileSync(path.join(root, 'runtime/electron/version'), 'utf8').trim() !== '45.1.0')
    fail();
  if (
    byName.get('runtime/node/node.exe').sha256 !== NODE_SHA ||
    byName.get('runtime/node/LICENSE').sha256 !== NODE_LICENSE_SHA ||
    byName.get('runtime/electron/electron.exe').sha256 !== manifest.runtime.electronExeSha256
  )
    fail();
  for (const name of ['react', 'react-dom', 'scheduler'])
    if (byName.get('licenses/' + name + '-LICENSE').sha256 !== REACT_LICENSE_SHA) fail();
  const allowedDirs = new Set(
    runtime.entries.filter((e) => e.kind === 'directory').map((e) => 'runtime/electron/' + e.name),
  );
  for (const name of expected.concat('package-manifest.json')) {
    let p = path.posix.dirname(name);
    while (p !== '.') {
      allowedDirs.add(p);
      p = path.posix.dirname(p);
    }
  }
  if (JSON.stringify([...actual.directories].sort()) !== JSON.stringify([...allowedDirs].sort()))
    fail();
  const source = json(path.join(root, 'provenance/source.json'));
  keys(source, ['version', 'sourceHead', 'sourceTree']);
  if (
    source.version !== 1 ||
    source.sourceHead !== manifest.sourceHead ||
    source.sourceTree !== manifest.sourceTree
  )
    fail();
  const build = json(path.join(root, 'provenance/build-manifest.json'));
  keys(build, ['schema', 'inputs', 'outputs']);
  if (
    build.schema !== 1 ||
    !build.inputs ||
    Array.isArray(build.inputs) ||
    !build.outputs ||
    Object.keys(build.outputs).join('|') !== BUILD_OUTPUTS.join('|')
  )
    fail();
  for (const [name, hash] of Object.entries(build.inputs)) {
    safeName(name);
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) fail();
  }
  for (const name of [...CLOSURE.map((n) => `launch/${n}`), ...NATIVE.map((n) => `native/${n}`)]) {
    const expectedHash = build.inputs[name];
    if (
      typeof expectedHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(expectedHash) ||
      byName.get(`app/${name}`).sha256 !== expectedHash
    )
      fail();
  }
  for (const name of BUILD_OUTPUTS)
    if (build.outputs[name] !== byName.get('app/build/' + name).sha256) fail();
  if (
    JSON.stringify(json(path.join(root, 'app/build/.verified-build.json'))) !==
    JSON.stringify(build)
  )
    fail();
  const pkg = json(path.join(root, 'provenance/package.json'), false),
    lock = json(path.join(root, 'provenance/package-lock.json'), false),
    review = json(path.join(root, 'provenance/dependency-review.json'), false);
  if (!isDeepStrictEqual(review.manifest, pkg) || !isDeepStrictEqual(review.lock, lock)) fail();
  for (const name of ['package.json', 'package-lock.json', 'dependency-review.json']) {
    const expectedHash = build.inputs[name];
    if (!expectedHash) fail();
    if (byName.get('provenance/' + name).sha256 !== expectedHash) fail();
  }
  let appBytes = 0;
  for (const name of BUILD_OUTPUTS) {
    const b = fs.readFileSync(path.join(root, 'app/build', name));
    appBytes += b.length;
    if (appBytes > 8 * 1024 * 1024) fail();
    for (const token of [
      ['FONESI', 'DEMO', 'FIXTURE', 'BUNDLE', '20261031', 'V1'].join('_'),
      ['DEMO', 'DEVICE', ''].join('-'),
      ['DEMO', 'ACCOUNT', ''].join('-'),
      ['DEMO', 'TARGET', ''].join('-'),
      ['DEMO', 'SERIAL', ''].join('-'),
      ['DEMO', 'MEDIA', ''].join('-'),
      ['DEMO', 'JOB', ''].join('-'),
      ['fonesi', 'demo', 'preferences', 'v1'].join('.'),
    ])
      if (b.includes(Buffer.from(token))) fail();
  }
  return Object.freeze(manifest);
}
function assertDataOutsidePackage(root, data) {
  plainDirectory(root);
  if (path.resolve(data) !== data) fail();
  try {
    fs.lstatSync(data);
    plainDirectory(data);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    plainDirectory(path.dirname(data));
  }
  const a = root.toLowerCase(),
    b = data.toLowerCase();
  const aPrefix = a.endsWith(path.sep) ? a : `${a}${path.sep}`;
  const bPrefix = b.endsWith(path.sep) ? b : `${b}${path.sep}`;
  if (a === b || b.startsWith(aPrefix) || a.startsWith(bPrefix)) fail();
  return true;
}
module.exports = {
  verifyPackage,
  assertDataOutsidePackage,
  inventory,
  digest,
  safeName,
  NODE_SHA,
  NODE_LICENSE_SHA,
  REACT_LICENSE_SHA,
  BUILD_OUTPUTS,
  CLOSURE,
  NATIVE,
  PROVENANCE,
};
if (require.main === module) {
  try {
    const [action, root, data] = process.argv.slice(2);
    if (action === 'verify' && process.argv.length === 4) {
      verifyPackage(root);
      console.log('PACKAGE_VERIFIED');
    } else if (action === 'outside' && process.argv.length === 5) {
      assertDataOutsidePackage(root, data);
      console.log('PACKAGE_DATA_OUTSIDE');
    } else fail();
  } catch {
    console.log('PACKAGE_REJECTED');
    process.exitCode = 1;
  }
}
