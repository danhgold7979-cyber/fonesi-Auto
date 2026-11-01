import {
  mkdirSync,
  openSync,
  closeSync,
  readSync,
  writeSync,
  fsyncSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  renameSync,
  lstatSync,
  realpathSync,
  constants,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { verify } from './verify-dependencies.mjs';
import { verifyBuild, inputs, outputs } from './build-manifest.mjs';
import { scanProductionSource, scanProductionPayload } from './demo-build-manifest.mjs';
import {
  createPackageManifest,
  verifyPackage,
  packageInventory,
  packageDigest,
  packageName,
  NODE_SHA,
  NODE_LICENSE_SHA,
  REACT_LICENSE_SHA,
  CLOSURE,
  NATIVE,
} from './package-manifest.mjs';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LAUNCH =
  "# Internal production package only. No source/PATH fallback.\r\n& (Join-Path $PSScriptRoot 'app/launch/Invoke-Package.ps1') @args\r\nexit $LASTEXITCODE\r\n";
export const README =
  'Fonesi-Auto internal Windows x64 package\r\nNot a signed installer or public release. Use Launch.ps1 -CreateUnder <existing absolute folder>, or -Root <owned product root>. Product data must remain outside this package. No npm/Node installation or network is needed at launch. Do not bypass retained ownership locks; use only the documented explicit -RecoverRetainedLaunch UUID path with complete recorded retirement. RESTORED stores require -Store and an explicit supported maintenance operation. P1-06 cross-user and physical-device gates remain unmet; no automation is activated.\r\n';
const fail = () => {
  throw Error('PACKAGE_BUILD_FAILED');
};
function plain(p) {
  if (resolve(p) !== p || realpathSync.native(p) !== p) fail();
  const s = lstatSync(p);
  if (!s.isDirectory() || s.isSymbolicLink()) fail();
}
function copy(source, destination) {
  const before = packageDigest(source);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination, constants.COPYFILE_EXCL);
  const after = packageDigest(destination);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail();
  return after;
}
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crcUpdate(crc, b) {
  for (const byte of b) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255];
  return crc >>> 0;
}
export function writeStoredZip(root, destination) {
  const inventory = packageInventory(root);
  const emptyHash = createHash('sha256').digest('hex');
  const entries = [
    ...inventory.files,
    ...inventory.directories.map((name) => ({
      path: `${name}/`,
      bytes: 0,
      sha256: emptyHash,
      directory: true,
    })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const fd = openSync(destination, 'wx', 0o600);
  const central = [];
  let offset = 0;
  function emit(b) {
    let at = 0;
    while (at < b.length) {
      const n = writeSync(fd, b, at, b.length - at);
      if (n <= 0) fail();
      at += n;
    }
    offset += b.length;
  }
  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.path, 'utf8'),
        file = join(root, entry.path);
      let crc = 0xffffffff;
      let f = entry.directory ? null : openSync(file, 'r');
      let firstCount = 0;
      const firstHash = createHash('sha256');
      const chunk = Buffer.alloc(65536);
      try {
        for (;;) {
          if (f === null) break;
          const n = readSync(f, chunk, 0, chunk.length, null);
          if (!n) break;
          firstCount += n;
          if (firstCount > entry.bytes) fail();
          firstHash.update(chunk.subarray(0, n));
          crc = crcUpdate(crc, chunk.subarray(0, n));
        }
      } finally {
        if (f !== null) closeSync(f);
      }
      if (firstCount !== entry.bytes || firstHash.digest('hex') !== entry.sha256) fail();
      crc = (crc ^ 0xffffffff) >>> 0;
      const start = offset,
        h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50);
      h.writeUInt16LE(20, 4);
      h.writeUInt16LE(0x800, 6);
      h.writeUInt16LE(0x21, 12);
      h.writeUInt32LE(crc, 14);
      h.writeUInt32LE(entry.bytes, 18);
      h.writeUInt32LE(entry.bytes, 22);
      h.writeUInt16LE(name.length, 26);
      emit(h);
      emit(name);
      const hash = createHash('sha256');
      let count = 0;
      f = entry.directory ? null : openSync(file, 'r');
      try {
        for (;;) {
          if (f === null) break;
          const n = readSync(f, chunk, 0, chunk.length, null);
          if (!n) break;
          count += n;
          if (count > entry.bytes) fail();
          const b = chunk.subarray(0, n);
          hash.update(b);
          emit(b);
        }
      } finally {
        if (f !== null) closeSync(f);
      }
      if (count !== entry.bytes || hash.digest('hex') !== entry.sha256) fail();
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x800, 8);
      c.writeUInt16LE(0x21, 14);
      c.writeUInt32LE(crc, 16);
      c.writeUInt32LE(entry.bytes, 20);
      c.writeUInt32LE(entry.bytes, 24);
      c.writeUInt16LE(name.length, 28);
      if (entry.directory) c.writeUInt32LE(0x10, 38);
      c.writeUInt32LE(start, 42);
      central.push(c, name);
    }
    const start = offset;
    for (const b of central) emit(b);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - start, 12);
    end.writeUInt32LE(start, 16);
    emit(end);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return packageDigest(destination);
}
export function promotePackage(stage, final, zipStage, zip, zipDigest) {
  for (const name of [final, zip, `${zip}.sha256`]) {
    try {
      lstatSync(name);
      fail();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  renameSync(stage, final);
  renameSync(zipStage, zip);
  writeFileSync(`${zip}.sha256`, `${zipDigest.sha256}\n`, { flag: 'wx' });
}
export async function buildPackage({
  npmVersion,
  sourceHead,
  sourceTree,
  nodeExe,
  nodeLicense,
  outputParent,
}) {
  if (
    process.platform !== 'win32' ||
    process.arch !== 'x64' ||
    !/^[0-9a-f]{40}$/.test(sourceHead) ||
    !/^[0-9a-f]{40}$/.test(sourceTree)
  )
    fail();
  verify(true, npmVersion);
  if (!verifyBuild(desktop)) fail();
  scanProductionSource(desktop);
  scanProductionPayload(join(desktop, 'build'));
  plain(outputParent);
  if (
    packageDigest(nodeExe).sha256 !== NODE_SHA ||
    packageDigest(nodeLicense).sha256 !== NODE_LICENSE_SHA
  )
    fail();
  const runtime = JSON.parse(
    readFileSync(join(desktop, '.runtime/persistence-runtime-manifest.json'), 'utf8'),
  );
  if (
    runtime.version !== 1 ||
    runtime.head !== sourceHead ||
    runtime.electron !== '45.1.0' ||
    !Array.isArray(runtime.entries) ||
    runtime.entries.length > 256
  )
    fail();
  const observed = packageInventory(join(desktop, 'node_modules/electron/dist'));
  if (
    observed.total > 512 * 1024 * 1024 ||
    observed.files.length + observed.directories.length > 256
  )
    fail();
  const expectedFiles = runtime.entries
    .filter((e) => e.kind === 'file')
    .map((e) => ({ path: packageName(e.name), bytes: e.bytes, sha256: e.sha256 }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (JSON.stringify(observed.files) !== JSON.stringify(expectedFiles)) fail();
  const expectedDirs = runtime.entries
    .filter((e) => e.kind === 'directory')
    .map((e) => packageName(e.name))
    .sort();
  if (JSON.stringify([...observed.directories].sort()) !== JSON.stringify(expectedDirs)) fail();
  const id = randomUUID(),
    container = join(outputParent, `Fonesi-Auto-${id}`),
    stage = join(container, '.staging'),
    final = join(container, 'package'),
    zipStage = join(container, '.staging.zip'),
    zip = join(container, 'Fonesi-Auto.zip');
  mkdirSync(container);
  plain(container);
  mkdirSync(stage);
  plain(stage);
  writeFileSync(join(stage, 'Launch.ps1'), LAUNCH, { flag: 'wx' });
  writeFileSync(join(stage, 'README.txt'), README, { flag: 'wx' });
  for (const entry of runtime.entries) {
    packageName(entry.name);
    if (entry.kind === 'directory') {
      mkdirSync(join(stage, 'runtime/electron', entry.name), { recursive: true });
      continue;
    }
    if (entry.kind !== 'file') fail();
    const relative = 'runtime/electron/' + entry.name;
    const copied = copy(
      join(desktop, 'node_modules/electron/dist', entry.name),
      join(stage, relative),
    );
    if (copied.bytes !== entry.bytes || copied.sha256 !== entry.sha256) fail();
  }
  copy(nodeExe, join(stage, 'runtime/node/node.exe'));
  copy(nodeLicense, join(stage, 'runtime/node/LICENSE'));
  for (const name of CLOSURE) copy(join(desktop, 'launch', name), join(stage, 'app/launch', name));
  for (const name of NATIVE) copy(join(desktop, 'native', name), join(stage, 'app/native', name));
  for (const name of [...outputs, '.verified-build.json'])
    copy(join(desktop, 'build', name), join(stage, 'app/build', name));
  mkdirSync(join(stage, 'provenance'));
  writeFileSync(
    join(stage, 'provenance/source.json'),
    JSON.stringify({ version: 1, sourceHead, sourceTree }),
    { flag: 'wx' },
  );
  for (const name of ['package.json', 'package-lock.json', 'dependency-review.json'])
    copy(join(desktop, name), join(stage, 'provenance', name));
  copy(join(desktop, 'build/.verified-build.json'), join(stage, 'provenance/build-manifest.json'));
  copy(
    join(desktop, '.runtime/persistence-runtime-manifest.json'),
    join(stage, 'provenance/runtime-manifest.json'),
  );
  for (const name of ['react', 'react-dom', 'scheduler']) {
    const copied = copy(
      join(desktop, 'node_modules', name, 'LICENSE'),
      join(stage, 'licenses', name + '-LICENSE'),
    );
    if (copied.sha256 !== REACT_LICENSE_SHA) fail();
  }
  const build = JSON.parse(readFileSync(join(desktop, 'build/.verified-build.json'), 'utf8'));
  if (Object.keys(build.inputs).length !== inputs.length) fail();
  const raw = JSON.stringify(createPackageManifest(stage, sourceHead, sourceTree, runtime));
  if (Buffer.byteLength(raw) > 65536) fail();
  writeFileSync(join(stage, 'package-manifest.json'), raw, { flag: 'wx' });
  verifyPackage(stage);
  const zipDigest = writeStoredZip(stage, zipStage);
  verifyPackage(stage);
  promotePackage(stage, final, zipStage, zip, zipDigest);
  return { directory: final, zip, sha256: zipDigest.sha256, bytes: zipDigest.bytes };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 8) fail();
    const [npmVersion, sourceHead, sourceTree, nodeExe, nodeLicense, outputParent] =
      process.argv.slice(2);
    await buildPackage({ npmVersion, sourceHead, sourceTree, nodeExe, nodeLicense, outputParent });
    console.log('PACKAGE_BUILT');
  } catch {
    console.log('PACKAGE_BUILD_FAILED');
    process.exitCode = 1;
  }
}

// The same exclusive verified copy primitive is exercised by owned fault fixtures.
export { copy as copyPackageFile };
