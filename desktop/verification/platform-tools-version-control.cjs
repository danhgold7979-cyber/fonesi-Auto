'use strict';
// Development-only source preflight. Never spawns ADB or accepts executable arguments.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { plain, read, write, uuid } = require('./persistence-restore-contract.cjs');
const SOURCES = [
  'src/main/platform-tools-files.ts',
  'verification/platform-tools-candidate.json',
  'verification/platform-tools-version-control.cjs',
  'verification/Invoke-PlatformToolsVersion.ps1',
  'verification/platform_tools_archive.py',
  'verification/validate_platform_tools.py',
  '../tools/phase-00/HostProbeNative.cs',
  'verification/WindowsBoundary.psm1',
  'verification/OwnedFiles.psm1',
  'verification/persistence-restore-contract.cjs',
];
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
function owner(root) {
  plain(root);
  const token = read(path.join(root, '.owner'));
  if (!uuid(token)) throw Error('P201_OWNER');
  return token;
}
function sourceHashes() {
  const desktop = path.resolve(__dirname, '..');
  return Object.fromEntries(SOURCES.map((name) => [name, hash(read(path.join(desktop, name)))]));
}
async function api() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/main/platform-tools-files.ts')).href);
}
function candidate() {
  return JSON.parse(read(path.join(__dirname, 'platform-tools-candidate.json')));
}
function names(directory) {
  plain(directory);
  const d = fs.opendirSync(directory),
    out = [];
  try {
    let entry = d.readSync();
    while (entry !== null) {
      if (out.length >= 256) throw Error('P201_LIMIT');
      out.push(entry.name);
      entry = d.readSync();
    }
  } finally {
    d.closeSync();
  }
  return out;
}
function fileBytes(file, max = 20 * 1024 * 1024) {
  plain(path.dirname(file));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > max)
    throw Error('P201_FILE');
  const fd = fs.openSync(file, 'r');
  try {
    const start = fs.fstatSync(fd);
    if (start.dev !== stat.dev || start.ino !== stat.ino || start.size !== stat.size)
      throw Error('P201_FILE');
    const bytes = Buffer.alloc(stat.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const n = fs.readSync(fd, bytes, used, bytes.length - used, null);
      if (n === 0) break;
      used += n;
    }
    const end = fs.fstatSync(fd);
    if (
      used !== stat.size ||
      end.size !== stat.size ||
      end.mtimeMs !== start.mtimeMs ||
      end.ctimeMs !== start.ctimeMs
    )
      throw Error('P201_FILE');
    return bytes.subarray(0, used);
  } finally {
    fs.closeSync(fd);
  }
}
async function rejected(action) {
  try {
    await action();
  } catch (error) {
    const descriptor =
      error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'message') : null;
    if (
      descriptor &&
      Object.hasOwn(descriptor, 'value') &&
      descriptor.value === 'PLATFORM_TOOLS_FILES_REJECTED'
    )
      return true;
    throw Error('P201_NEGATIVE_UNEXPECTED');
  }
  throw Error('P201_NEGATIVE_ACCEPTED');
}
async function exerciseNegatives(root, pin, verifyPlatformToolsFiles) {
  owner(root);
  const selected = path.join(root, 'candidate/platform-tools');
  await verifyPlatformToolsFiles(selected, pin.files);
  const clone = path.join(root, 'negative');
  fs.mkdirSync(clone);
  for (const row of pin.files) {
    const bytes = fileBytes(path.join(selected, row.path));
    fs.writeFileSync(path.join(clone, row.path), bytes, { flag: 'wx' });
  }
  await verifyPlatformToolsFiles(clone, pin.files);
  const adb = path.join(clone, 'adb.exe'),
    original = fileBytes(adb),
    digest = hash(original);
  const held = path.join(root, 'held-adb-original.bin');
  if (fs.existsSync(held)) throw Error('P201_CHANGED');
  fs.renameSync(adb, held);
  if (
    JSON.stringify(names(clone).sort()) !==
    JSON.stringify(
      pin.files
        .map((row) => row.path)
        .filter((name) => name !== 'adb.exe')
        .sort(),
    )
  )
    throw Error('P201_CHANGED');
  const missingRejected = await rejected(() => verifyPlatformToolsFiles(clone, pin.files));
  if (hash(fileBytes(held)) !== digest) throw Error('P201_CHANGED');
  fs.renameSync(held, adb);
  const altered = Buffer.from(original);
  altered[altered.length - 1] ^= 1;
  fs.writeFileSync(adb, altered);
  const tamperRejected = await rejected(() => verifyPlatformToolsFiles(clone, pin.files));
  if (hash(fileBytes(adb)) !== hash(altered)) throw Error('P201_CHANGED');
  fs.writeFileSync(adb, original);
  const arch = Buffer.from(original),
    offset = arch.readUInt32LE(0x3c);
  if (offset + 6 > arch.length) throw Error('P201_PE');
  arch.writeUInt16LE(0x8664, offset + 4);
  fs.writeFileSync(adb, arch);
  // Update only the negative fixture hash: force the real verifier to inspect PE architecture.
  const archRows = pin.files.map((row) =>
    row.path === 'adb.exe' ? { ...row, sha256: hash(arch) } : row,
  );
  const architectureRejected = await rejected(() => verifyPlatformToolsFiles(clone, archRows));
  if (hash(fileBytes(adb)) !== hash(arch)) throw Error('P201_CHANGED');
  fs.writeFileSync(adb, original);
  if (hash(fileBytes(adb)) !== digest) throw Error('P201_CHANGED');
  await verifyPlatformToolsFiles(clone, pin.files);
  const shadow = path.join(root, 'shadow');
  fs.mkdirSync(shadow);
  fs.writeFileSync(path.join(shadow, 'adb.exe'), 'P201_NONEXECUTABLE_PATH_SHADOW\n', {
    flag: 'wx',
  });
  const old = process.env.PATH;
  try {
    process.env.PATH = shadow;
    await verifyPlatformToolsFiles(selected, pin.files);
  } finally {
    if (old === undefined) delete process.env.PATH;
    else process.env.PATH = old;
  }
  return { missingRejected, tamperRejected, architectureRejected, pathShadowIgnored: true };
}
async function prepare(root) {
  const token = owner(root),
    sources = sourceHashes(),
    pin = candidate(),
    { verifyPlatformToolsFiles } = await api();
  const negativeFacts = await exerciseNegatives(root, pin, verifyPlatformToolsFiles);
  if (owner(root) !== token || JSON.stringify(sourceHashes()) !== JSON.stringify(sources))
    throw Error('P201_CHANGED');
  write(path.join(root, 'admission.json'), {
    version: 1,
    runToken: token,
    sources,
    candidateManifestSha256: hash(read(path.join(__dirname, 'platform-tools-candidate.json'))),
  });
  write(path.join(root, 'preflight.json'), {
    inventoryVerified: true,
    architectureVerified: true,
    ...negativeFacts,
    sourceBound: true,
  });
}
async function verify(root) {
  const token = owner(root),
    raw = read(path.join(root, 'admission.json')),
    v = JSON.parse(raw);
  if (
    JSON.stringify(v) !== raw ||
    JSON.stringify(Object.keys(v)) !==
      JSON.stringify(['version', 'runToken', 'sources', 'candidateManifestSha256']) ||
    v.version !== 1 ||
    v.runToken !== token ||
    JSON.stringify(v.sources) !== JSON.stringify(sourceHashes()) ||
    v.candidateManifestSha256 !== hash(read(path.join(__dirname, 'platform-tools-candidate.json')))
  )
    throw Error('P201_CHANGED');
  const { verifyPlatformToolsFiles } = await api();
  await verifyPlatformToolsFiles(path.join(root, 'candidate/platform-tools'), candidate().files);
}
async function cleanup(root) {
  await verify(root);
  const pin = candidate(),
    { verifyPlatformToolsFiles } = await api();
  await verifyPlatformToolsFiles(path.join(root, 'negative'), pin.files);
  const extracted = path.join(root, 'candidate');
  plain(extracted);
  if (
    JSON.stringify(names(extracted).sort()) !==
    JSON.stringify(['.owner', '.platform-tools-complete.json', 'platform-tools'])
  )
    throw Error('P201_CLEANUP');
  if (read(path.join(extracted, '.owner')) !== owner(root)) throw Error('P201_CLEANUP');
  const summary = {
    archiveSha256: pin.archive.sha256,
    binaryExecuted: false,
    expandedBytes: 17529398,
    fileCount: 14,
    redistributionApproved: false,
    scope: 'PINNED_DEVELOPMENT_ARCHIVE',
    version: 1,
  };
  if (read(path.join(extracted, '.platform-tools-complete.json')) !== JSON.stringify(summary))
    throw Error('P201_CLEANUP');
  plain(path.join(root, 'profile'));
  if (names(path.join(root, 'profile')).length !== 0) throw Error('P201_CLEANUP');
  const expectedNames = [
    '.owner',
    'admission.json',
    'preflight.json',
    'capture.json',
    'public.json',
    'candidate',
    'negative',
    'shadow',
    'profile',
  ].sort();
  const entries = names(root).sort();
  if (JSON.stringify(entries) !== JSON.stringify(expectedNames)) throw Error('P201_CLEANUP');
  plain(path.join(root, 'shadow'));
  if (
    JSON.stringify(names(path.join(root, 'shadow'))) !== '["adb.exe"]' ||
    fileBytes(path.join(root, 'shadow/adb.exe')).toString('utf8') !==
      'P201_NONEXECUTABLE_PATH_SHADOW\n'
  )
    throw Error('P201_CLEANUP');
  for (const name of ['admission.json', 'preflight.json', 'capture.json', 'public.json'])
    read(path.join(root, name));
  // Entire fixed inventory and byte identity validated before first deletion.
  for (const dir of ['candidate/platform-tools', 'negative']) {
    for (const row of pin.files) fs.unlinkSync(path.join(root, dir, row.path));
    fs.rmdirSync(path.join(root, dir));
  }
  fs.unlinkSync(path.join(extracted, '.platform-tools-complete.json'));
  fs.unlinkSync(path.join(extracted, '.owner'));
  fs.rmdirSync(extracted);
  fs.rmdirSync(path.join(root, 'profile'));
  fs.unlinkSync(path.join(root, 'shadow/adb.exe'));
  fs.rmdirSync(path.join(root, 'shadow'));
  for (const name of ['admission.json', 'preflight.json', 'capture.json', 'public.json'])
    fs.unlinkSync(path.join(root, name));
}
const CONTROL_PHASES = Object.freeze(['PREPARE', 'VERIFY', 'CLEANUP', 'ARGUMENT']);
const CONTROL_REASONS = Object.freeze([
  'P201_ARGUMENT',
  'P201_CHANGED',
  'P201_CLEANUP',
  'P201_FILE',
  'P201_LIMIT',
  'P201_NEGATIVE_ACCEPTED',
  'P201_NEGATIVE_UNEXPECTED',
  'P201_OWNER',
  'P201_PE',
  'PLATFORM_TOOLS_FILES_REJECTED',
  'RESTORE_OWNER',
  'RESTORE_FILE',
  'RESTORE_LIMIT',
  'RESTORE_READBACK',
  'ENOENT',
  'EACCES',
  'EPERM',
  'EEXIST',
  'ENOTEMPTY',
  'UNCLASSIFIED',
]);
function controlDiagnostics(phase, error) {
  let reason = 'UNCLASSIFIED';
  try {
    for (const key of ['message', 'code']) {
      const d = Object.getOwnPropertyDescriptor(error, key);
      if (d && Object.hasOwn(d, 'value') && CONTROL_REASONS.includes(d.value)) {
        reason = d.value;
        break;
      }
    }
  } catch {}
  return [
    'P201_CONTROL_PHASE_' + (CONTROL_PHASES.includes(phase) ? phase : 'ARGUMENT'),
    'P201_CONTROL_REASON_' + reason,
  ];
}
module.exports = {
  prepare,
  verify,
  cleanup,
  sourceHashes,
  SOURCES,
  exerciseNegatives,
  CONTROL_PHASES,
  CONTROL_REASONS,
  controlDiagnostics,
};
if (require.main === module) {
  (async () => {
    let phase = 'ARGUMENT';
    try {
      const [action, root] = process.argv.slice(2);
      if (process.argv.length !== 4) throw Error('P201_ARGUMENT');
      if (CONTROL_PHASES.includes(action?.toUpperCase())) phase = action.toUpperCase();
      if (action === 'prepare') await prepare(root);
      else if (action === 'verify') await verify(root);
      else if (action === 'cleanup') await cleanup(root);
      else throw Error('P201_ARGUMENT');
      console.log('P201_CONTROL_PASS');
    } catch (error) {
      for (const marker of controlDiagnostics(phase, error)) console.error(marker);
      console.log('P201_CONTROL_FAILED');
      process.exitCode = 1;
    }
  })();
}
