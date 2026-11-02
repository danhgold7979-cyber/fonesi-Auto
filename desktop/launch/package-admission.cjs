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
const TIMEZONE_LICENSES = Object.freeze({
  'js-temporal-polyfill': 'ffc4aee7f1279fc0494ff2b27f6829e6b4d16c20aa93aa008c3bd8d8af176387',
  jsbi: '9568a2b155e66ac3e0ba1fd80b52b827b9460e6cf6f233125e7cbca8e206ddc3',
});
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
  'RetainedVideoSession.cs',
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
// Packaging approval binds exact bytes/integrity/provenance only, not legal clearance,
// task acceptance or runtime admission; callers cannot supply it.
// Exact independently reviewed retained-byte/notice candidate; runtime pins remain separate.
const RETAINED_PAIR_APPROVAL = {
  pairManifestSha256: '934a9ff34a1b868fa56ddfc8a57d4eaba64d9d6305b6da05839566b90b366437',
  noticeManifestSha256: '305698d5f4623d7572c1c46a515a17d0984b35d26a82ae743ebeb71a04a0ebf6',
  evidenceManifestSha256: '7bd7125bf8f427cd10a2371f6a435b82c410bd4a0163b5626750049a7aa2a043',
};
const PAIR_SOURCES = Object.freeze(
  NATIVE.filter((name) => name !== 'PersistenceProcess.cs').map((name) => `app/native/${name}`),
);
const PAIR_EVIDENCE = Object.freeze({
  'commands.json': 262144,
  'consumer-build.json': 8192,
  'dependencies.json': 524288,
  'generated.json': 2097152,
  'outputs.json': 1048576,
  'report.json': 65536,
  'server-build.json': 8192,
  'source.json': 262144,
  'tools.json': 8388608,
});
const PAIR_NOTICES = Object.freeze(['APACHE-2.0.txt', 'ATTRIBUTIONS.txt']);
const RETAINED_PAIR_ADDITIONS = Object.freeze(
  [
    'app/native/RetainedVideoConsumer.dll',
    'app/video/server.jar',
    'app/video/pair.json',
    'app/video/server-build.json',
    'app/video/consumer-build.json',
    'app/video/notice-manifest.json',
    'app/video/evidence-manifest.json',
    ...PAIR_NOTICES.map((name) => `app/video/notices/${name}`),
    ...Object.keys(PAIR_EVIDENCE).map((name) => `app/video/evidence/${name}`),
  ].sort(),
);
const RETAINED_PAIR_FILES = Object.freeze([...PAIR_SOURCES, ...RETAINED_PAIR_ADDITIONS].sort());
const pairHash = (value) =>
  typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value);
const pairSha = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
function pairRead(root, name, cap) {
  safeName(name);
  const file = path.join(root, name);
  plainDirectory(path.dirname(file));
  const before = fs.lstatSync(file);
  const same = (a, b) =>
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs &&
    a.nlink === b.nlink;
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > cap
  )
    fail();
  const fd = fs.openSync(file, 'r');
  try {
    if (!same(before, fs.fstatSync(fd))) fail();
    const raw = Buffer.alloc(before.size);
    let at = 0;
    while (at < raw.length) {
      const n = fs.readSync(fd, raw, at, raw.length - at, at);
      if (!n) fail();
      at += n;
    }
    if (!same(before, fs.fstatSync(fd)) || !same(before, fs.lstatSync(file))) fail();
    plainDirectory(path.dirname(file));
    return raw;
  } finally {
    fs.closeSync(fd);
  }
}
function pairJson(raw, names) {
  const value = JSON.parse(raw.toString('utf8'));
  if (!Buffer.from(JSON.stringify(value)).equals(raw)) fail();
  if (names) keys(value, names);
  return value;
}
function pairRows(rows, expected, getRaw) {
  if (!Array.isArray(rows) || rows.length !== expected.length) fail();
  for (let i = 0; i < expected.length; i++) {
    const row = rows[i];
    keys(row, ['path', 'bytes', 'sha256']);
    const raw = getRaw(expected[i]);
    if (row.path !== expected[i] || row.bytes !== raw.length || row.sha256 !== pairSha(raw)) fail();
  }
}
function pairContents(root) {
  if (RETAINED_PAIR_APPROVAL === null) fail();
  plainDirectory(root);
  const names = ['pairManifestSha256', 'noticeManifestSha256', 'evidenceManifestSha256'];
  keys(RETAINED_PAIR_APPROVAL, names);
  if (names.some((name) => !pairHash(RETAINED_PAIR_APPROVAL[name]))) fail();
  const raws = new Map();
  const read = (name, cap) => {
    const raw = pairRead(root, name, cap);
    raws.set(name, raw);
    return raw;
  };
  const pairRaw = read('app/video/pair.json', 8192);
  const noticeRaw = read('app/video/notice-manifest.json', 262144);
  const evidenceRaw = read('app/video/evidence-manifest.json', 8192);
  const result = {
    pairManifestSha256: pairSha(pairRaw),
    noticeManifestSha256: pairSha(noticeRaw),
    evidenceManifestSha256: pairSha(evidenceRaw),
  };
  if (names.some((name) => result[name] !== RETAINED_PAIR_APPROVAL[name])) fail();
  const p = pairJson(pairRaw, [
    'version',
    'serverVersion',
    'serverBytes',
    'serverSha256',
    'protocolId',
    'consumerBytes',
    'consumerWindowsArtifactSha256',
    'consumerBuildManifestSha256',
    'serverBuildManifestSha256',
    'architecture',
  ]);
  if (
    p.version !== 1 ||
    p.serverVersion !== '5.0.1' ||
    p.architecture !== 'AMD64' ||
    p.protocolId !== 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1'
  )
    fail();
  for (const name of ['serverBytes', 'consumerBytes'])
    if (!Number.isSafeInteger(p[name]) || p[name] < 1 || p[name] > 8388608) fail();
  for (const name of [
    'serverSha256',
    'consumerWindowsArtifactSha256',
    'consumerBuildManifestSha256',
    'serverBuildManifestSha256',
  ])
    if (!pairHash(p[name])) fail();
  const server = read('app/video/server.jar', 8388608),
    dll = read('app/native/RetainedVideoConsumer.dll', 8388608);
  if (
    server.length !== p.serverBytes ||
    pairSha(server) !== p.serverSha256 ||
    dll.length !== p.consumerBytes ||
    pairSha(dll) !== p.consumerWindowsArtifactSha256
  )
    fail();
  // Same finite Windows header check as retained host admission, not a new PE/DEX parser.
  if (dll.length < 64 || dll.readUInt16LE(0) !== 0x5a4d) fail();
  const pe = dll.readUInt32LE(60);
  if (
    pe > dll.length - 26 ||
    dll.readUInt32LE(pe) !== 0x4550 ||
    dll.readUInt16LE(pe + 4) !== 0x8664 ||
    dll.readUInt16LE(pe + 24) !== 0x20b
  )
    fail();
  const evidence = pairJson(evidenceRaw, ['version', 'files']);
  if (evidence.version !== 1) fail();
  const ev = new Map();
  for (const [name, cap] of Object.entries(PAIR_EVIDENCE))
    ev.set(name, read(`app/video/evidence/${name}`, cap));
  pairRows(evidence.files, Object.keys(PAIR_EVIDENCE), (name) => ev.get(name));
  // Full evidence semantics were checked offline before approval; these are exact byte bindings.
  const sbRaw = read('app/video/server-build.json', 8192),
    cbRaw = read('app/video/consumer-build.json', 8192);
  if (
    !sbRaw.equals(ev.get('server-build.json')) ||
    !cbRaw.equals(ev.get('consumer-build.json')) ||
    pairSha(sbRaw) !== p.serverBuildManifestSha256 ||
    pairSha(cbRaw) !== p.consumerBuildManifestSha256
  )
    fail();
  const sb = pairJson(sbRaw, [
    'version',
    'upstreamCommit',
    'sourcePatchSha256',
    'toolchainManifestSha256',
    'dependenciesManifestSha256',
    'buildCommandSha256',
    'serverBytes',
    'serverSha256',
    'protocolId',
  ]);
  if (
    sb.version !== 1 ||
    sb.upstreamCommit !== 'a60891aea193d92e7e5c3942700eca63f9d19a5f' ||
    sb.serverBytes !== p.serverBytes ||
    sb.serverSha256 !== p.serverSha256 ||
    sb.protocolId !== p.protocolId ||
    !pairHash(sb.sourcePatchSha256)
  )
    fail();
  for (const [field, name] of [
    ['toolchainManifestSha256', 'tools.json'],
    ['dependenciesManifestSha256', 'dependencies.json'],
    ['buildCommandSha256', 'commands.json'],
  ])
    if (sb[field] !== pairSha(ev.get(name))) fail();
  const cb = pairJson(cbRaw, [
    'version',
    'sourceCommit',
    'compilerSha256',
    'compilerVersion',
    'arguments',
    'frameworkReferences',
    'sources',
    'consumerSha256',
  ]);
  if (
    cb.version !== 1 ||
    typeof cb.sourceCommit !== 'string' ||
    cb.sourceCommit.length !== 40 ||
    !/^[0-9a-f]{40}$/.test(cb.sourceCommit) ||
    !pairHash(cb.compilerSha256) ||
    typeof cb.compilerVersion !== 'string' ||
    cb.compilerVersion.length > 64 ||
    !/^[0-9]+(?:\.[0-9]+){1,3}$/.test(cb.compilerVersion) ||
    /[^0-9.]/.test(cb.compilerVersion) ||
    JSON.stringify(cb.arguments) !==
      JSON.stringify(['/nologo', '/target:library', '/platform:x64', '/optimize+']) ||
    cb.consumerSha256 !== p.consumerWindowsArtifactSha256
  )
    fail();
  keys(cb.frameworkReferences, ['System.dll', 'System.Core.dll']);
  if (Object.values(cb.frameworkReferences).some((hash) => !pairHash(hash))) fail();
  keys(
    cb.sources,
    PAIR_SOURCES.map((name) => name.slice(4)),
  );
  let sourceBytes = 0;
  for (const name of PAIR_SOURCES) {
    const raw = read(name, 1048576);
    sourceBytes += raw.length;
    if (sourceBytes > 4194304 || pairSha(raw) !== cb.sources[name.slice(4)]) fail();
  }
  const notice = pairJson(noticeRaw, [
    'version',
    'pairManifestSha256',
    'sourceEvidenceSha256',
    'dependenciesManifestSha256',
    'components',
    'files',
  ]);
  if (
    notice.version !== 2 ||
    notice.pairManifestSha256 !== result.pairManifestSha256 ||
    notice.sourceEvidenceSha256 !== pairSha(ev.get('source.json')) ||
    notice.dependenciesManifestSha256 !== pairSha(ev.get('dependencies.json'))
  )
    fail();
  let noticeBytes = 0;
  const texts = new Map();
  for (const name of PAIR_NOTICES) {
    const raw = read(`app/video/notices/${name}`, 2097152);
    noticeBytes += raw.length;
    if (noticeBytes > 2097152 || raw.includes(0) || !Buffer.from(raw.toString('utf8')).equals(raw))
      fail();
    texts.set(name, raw);
  }
  pairRows(notice.files, PAIR_NOTICES, (name) => texts.get(name));
  const sourceEvidence = pairJson(ev.get('source.json'));
  const toolEvidence = pairJson(ev.get('tools.json'));
  if (!Array.isArray(sourceEvidence.effective) || !Array.isArray(toolEvidence.files)) fail();
  const originSources = new Map(
    sourceEvidence.effective.map((row) => [`${row.namespace}/${row.path}`, row.sha256]),
  );
  const originTools = new Map(
    toolEvidence.files.map((row) => [`${row.namespace}/${row.path}`, row.sha256]),
  );
  const roles = [
    ['SERVER_UPSTREAM', 'COMPILED_CODE'],
    ['SERVER_AIDL', 'GENERATED_CODE'],
    ['SERVER_GENERATED', 'GENERATED_CODE'],
    ['AUTO_PATCH', 'FIRST_PARTY_MODIFICATION'],
    ['AUTO_CONSUMER', 'FIRST_PARTY_COMPILED_CODE'],
  ];
  if (!Array.isArray(notice.components) || notice.components.length !== roles.length) fail();
  for (let i = 0; i < roles.length; i++) {
    const component = notice.components[i];
    keys(component, ['id', 'role', 'origin', 'licenseEvidence', 'noticeFiles']);
    if (component.id !== roles[i][0] || component.role !== roles[i][1]) fail();
    keys(component.licenseEvidence, ['kind', 'declaredLicense', 'applicability']);
    const expectedEvidence = [
      ['DECLARED_SOURCE_NOTICE', 'Apache-2.0', 'SOURCE_DECLARED'],
      ['DECLARED_SOURCE_NOTICE', 'Apache-2.0', 'OUTPUT_APPLICABILITY_UNRESOLVED'],
      ['SUPPLIED_TOOL_NOTICE', null, 'OUTPUT_APPLICABILITY_UNRESOLVED'],
      ['OWNER_USE_STATEMENT', null, 'OWNER_INTERNAL_USE_NO_EXTERNAL_GRANT'],
      ['OWNER_USE_STATEMENT', null, 'OWNER_INTERNAL_USE_NO_EXTERNAL_GRANT'],
    ][i];
    if (
      JSON.stringify(Object.values(component.licenseEvidence)) !== JSON.stringify(expectedEvidence)
    )
      fail();
    keys(component.origin, ['sourceCommit', 'sourceHashes', 'toolHashes']);
    const commit = component.origin.sourceCommit;
    if (
      component.id === 'SERVER_GENERATED'
        ? commit !== null
        : commit !== (component.id.startsWith('AUTO_') ? cb.sourceCommit : sb.upstreamCommit)
    )
      fail();
    for (const field of ['sourceHashes', 'toolHashes']) {
      const rows = component.origin[field];
      if (!Array.isArray(rows) || rows.length > 256) fail();
      let prior = '';
      for (const row of rows) {
        keys(row, ['path', 'sha256']);
        safeName(row.path);
        if (
          row.path <= prior ||
          !pairHash(row.sha256) ||
          (field === 'sourceHashes' ? originSources : originTools).get(row.path) !== row.sha256
        )
          fail();
        prior = row.path;
      }
    }
    if (
      !Array.isArray(component.noticeFiles) ||
      component.noticeFiles.length < 1 ||
      component.noticeFiles.length > 2 ||
      component.noticeFiles.some(
        (name, index) =>
          !PAIR_NOTICES.includes(name) || (index > 0 && name <= component.noticeFiles[index - 1]),
      )
    )
      fail();
  }
  // Recheck all captured files after the last read; no callback/caller authority enters here.
  for (const [name, raw] of raws) if (!pairRead(root, name, raw.length).equals(raw)) fail();
  return Object.freeze(result);
}
function verifyRetainedPair(root) {
  try {
    const result = pairContents(root),
      actual = inventory(root);
    if (JSON.stringify(actual.files.map((row) => row.path)) !== JSON.stringify(RETAINED_PAIR_FILES))
      fail();
    const dirs = new Set();
    for (const name of RETAINED_PAIR_FILES) {
      for (let dir = path.posix.dirname(name); dir !== '.'; dir = path.posix.dirname(dir))
        dirs.add(dir);
    }
    if (JSON.stringify([...actual.directories].sort()) !== JSON.stringify([...dirs].sort())) fail();
    return result;
  } catch {
    fail();
  }
}

function verifyPackage(root) {
  const actual = inventory(root),
    manifest = json(path.join(root, 'package-manifest.json'));
  if (fs.lstatSync(path.join(root, 'package-manifest.json')).size > 65536) fail();
  keys(
    manifest,
    manifest.version === 2
      ? ['version', 'mode', 'sourceHead', 'sourceTree', 'runtime', 'entry', 'video', 'files']
      : ['version', 'mode', 'sourceHead', 'sourceTree', 'runtime', 'entry', 'files'],
  );
  keys(manifest.runtime, [
    'platform',
    'arch',
    'node',
    'electron',
    'nodeExeSha256',
    'electronExeSha256',
  ]);
  if (
    (manifest.version !== 1 && manifest.version !== 2) ||
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
    ...Object.keys(TIMEZONE_LICENSES).map((n) => 'licenses/' + n + '-LICENSE'),
    ...runtimeFiles,
    ...(manifest.version === 2 ? RETAINED_PAIR_ADDITIONS : []),
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
  for (const [name, hash] of Object.entries(TIMEZONE_LICENSES))
    if (byName.get('licenses/' + name + '-LICENSE').sha256 !== hash) fail();
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
  if (manifest.version === 2) {
    keys(manifest.video, ['pairManifestSha256', 'noticeManifestSha256', 'evidenceManifestSha256']);
    if (JSON.stringify(manifest.video) !== JSON.stringify(pairContents(root))) fail();
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
  verifyRetainedPair,
  RETAINED_PAIR_FILES,
  RETAINED_PAIR_ADDITIONS,
  verifyPackage,
  assertDataOutsidePackage,
  inventory,
  digest,
  safeName,
  NODE_SHA,
  NODE_LICENSE_SHA,
  REACT_LICENSE_SHA,
  TIMEZONE_LICENSES,
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
