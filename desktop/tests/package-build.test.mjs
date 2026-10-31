import test from 'node:test';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import fs from 'node:fs';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { dirname, resolve, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  writeStoredZip,
  buildPackage,
  promotePackage,
  copyPackageFile,
} from '../scripts/build-package.mjs';
import { outputs } from '../scripts/build-manifest.mjs';
import { scanProductionSource } from '../scripts/demo-build-manifest.mjs';
import { runStages } from '../scripts/stages.mjs';
const require = createRequire(import.meta.url);
const admission = require('../launch/package-admission.cjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function owned(action) {
  const parent = resolve(root, '.test-output');
  assert.equal(lstatSync(parent).isSymbolicLink(), false);
  assert.equal(realpathSync.native(parent), parent);
  const p = realpathSync.native(mkdtempSync(resolve(parent, 'package-test-')));
  try {
    return action(p);
  } finally {
    rmSync(p, { recursive: true });
  }
}
test('package path grammar rejects traversal, ADS, aliases and reserved device basenames', () => {
  for (const p of [
    '../a',
    '/a',
    'a//b',
    'a/./b',
    'C:/a',
    'a:b',
    'a\\b',
    'a.',
    'a ',
    'CON',
    'aux.txt',
    'x/LPT9.log',
    'x/COM1',
  ])
    assert.throws(() => admission.safeName(p), /PACKAGE_REJECTED/);
  for (const p of ['Launch.ps1', 'runtime/node/LICENSE', 'app/build/main.cjs'])
    assert.equal(admission.safeName(p), p);
});
test('package output closure stays exact production inventory with no demo fixture additions', () => {
  assert.deepEqual(admission.BUILD_OUTPUTS, outputs);
  assert.equal(admission.CLOSURE.includes('package-admission.cjs'), true);
  assert.equal(
    admission.CLOSURE.some((x) => /demo|probe|fixture/.test(x)),
    false,
  );
});
test('bounded inventory refuses case-fold aliases and excess files', () =>
  owned((p) => {
    writeFileSync(resolve(p, 'A'), 'a');
    writeFileSync(resolve(p, 'a'), 'a');
    if (process.platform !== 'win32')
      assert.throws(() => admission.inventory(p), /PACKAGE_REJECTED/);
    rmSync(resolve(p, 'A'));
    try {
      rmSync(resolve(p, 'a'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    for (let i = 0; i < 513; i++) writeFileSync(resolve(p, `f${i}`), '');
    assert.throws(() => admission.inventory(p), /PACKAGE_REJECTED/);
  }));
test('external data overlap denies package ancestor/descendant and allows a planned sibling child', () =>
  owned((p) => {
    const pkg = resolve(p, 'package');
    mkdirSync(pkg);
    const sibling = resolve(p, 'data-new');
    assert.equal(admission.assertDataOutsidePackage(pkg, sibling), true);
    assert.throws(() => admission.assertDataOutsidePackage(pkg, p), /PACKAGE_REJECTED/);
    assert.throws(
      () => admission.assertDataOutsidePackage(pkg, parse(pkg).root),
      /PACKAGE_REJECTED/,
    );
    assert.throws(
      () => admission.assertDataOutsidePackage(pkg, resolve(pkg, 'data')),
      /PACKAGE_REJECTED/,
    );
    assert.throws(() => admission.assertDataOutsidePackage(pkg, pkg), /PACKAGE_REJECTED/);
  }));
test('STORE ZIP binds exact owned bytes and refuses destination overwrite', () =>
  owned((p) => {
    const source = resolve(p, 'source');
    mkdirSync(source);
    writeFileSync(resolve(source, 'a.txt'), '123456789');
    mkdirSync(resolve(source, 'nested'));
    mkdirSync(resolve(source, 'empty'));
    writeFileSync(resolve(source, 'nested/b.txt'), 'bounded synthetic data');
    const zip = resolve(p, 'package.zip');
    const digest = writeStoredZip(source, zip),
      bytes = readFileSync(zip);
    assert.equal(digest.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(bytes.readUInt32LE(0), 0x04034b50);
    assert.equal(bytes.readUInt32LE(14), 0xcbf43926);
    assert.equal(bytes.readUInt16LE(26), 5);
    assert.equal(bytes.subarray(30, 35).toString(), 'a.txt');
    const end = bytes.length - 22;
    assert.equal(bytes.readUInt32LE(end), 0x06054b50);
    assert.equal(bytes.readUInt16LE(end + 10), 4);
    const names = [];
    let offset = 0;
    while (bytes.readUInt32LE(offset) === 0x04034b50) {
      const size = bytes.readUInt32LE(offset + 18),
        length = bytes.readUInt16LE(offset + 26);
      names.push(bytes.subarray(offset + 30, offset + 30 + length).toString());
      offset += 30 + length + size;
    }
    assert.deepEqual(names, ['a.txt', 'empty/', 'nested/', 'nested/b.txt']);
    const central = bytes.readUInt32LE(end + 16);
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    assert.throws(() => writeStoredZip(source, zip), { code: 'EEXIST' });
    assert.deepEqual(readFileSync(zip), bytes);
  }));
test('missing package manifest or duplicate JSON never admits payload', () =>
  owned((p) => {
    assert.throws(() => admission.verifyPackage(p));
    writeFileSync(resolve(p, 'package-manifest.json'), '{"version":1,"version":1}');
    assert.throws(() => admission.verifyPackage(p), /PACKAGE_REJECTED/);
  }));
test('wrong source version arguments cannot package or emit success on any host', async () => {
  await assert.rejects(
    buildPackage({
      npmVersion: 'invalid',
      sourceHead: 'bad',
      sourceTree: 'bad',
      nodeExe: 'missing',
      nodeLicense: 'missing',
      outputParent: 'missing',
    }),
    /PACKAGE_BUILD_FAILED/,
  );
});

test('promotion refuses any existing destination without changing original directory or ZIP', () =>
  owned((p) => {
    for (const collision of ['package', 'package.zip', 'package.zip.sha256']) {
      const caseRoot = resolve(p, collision.replaceAll('.', '-'));
      mkdirSync(caseRoot);
      const stage = resolve(caseRoot, 'stage'),
        final = resolve(caseRoot, 'package'),
        zipStage = resolve(caseRoot, 'stage.zip'),
        zip = resolve(caseRoot, 'package.zip');
      mkdirSync(stage);
      writeFileSync(resolve(stage, 'a'), 'candidate');
      writeFileSync(zipStage, 'candidate zip');
      if (collision === 'package') {
        mkdirSync(final);
        writeFileSync(resolve(final, 'a'), 'original');
      } else writeFileSync(resolve(caseRoot, collision), 'original');
      assert.throws(
        () => promotePackage(stage, final, zipStage, zip, { sha256: '0'.repeat(64) }),
        /PACKAGE_BUILD_FAILED/,
      );
      assert.equal(readFileSync(resolve(stage, 'a'), 'utf8'), 'candidate');
      assert.equal(readFileSync(zipStage, 'utf8'), 'candidate zip');
      assert.equal(
        readFileSync(
          collision === 'package' ? resolve(final, 'a') : resolve(caseRoot, collision),
          'utf8',
        ),
        'original',
      );
    }
  }));

test('ZIP CRC pre-pass rejects an injected changed read while preserving source bytes', () =>
  owned((p) => {
    const source = resolve(p, 'source');
    mkdirSync(source);
    const target = resolve(source, 'a.txt');
    writeFileSync(target, 'original bytes');
    const originalOpen = fs.openSync,
      originalRead = fs.readSync;
    let targetOpens = 0,
      changed = 0,
      crcFd = null;
    try {
      fs.openSync = (file, ...args) => {
        const fd = originalOpen(file, ...args);
        if (file === target && ++targetOpens === 2) crcFd = fd;
        return fd;
      };
      fs.readSync = (fd, buffer, ...args) => {
        const n = originalRead(fd, buffer, ...args);
        if (fd === crcFd && n > 0) {
          buffer[0] ^= 1;
          changed++;
        }
        return n;
      };
      syncBuiltinESMExports();
      assert.throws(
        () => writeStoredZip(source, resolve(p, 'candidate.zip')),
        /PACKAGE_BUILD_FAILED/,
      );
      assert.equal(changed, 1);
    } finally {
      fs.openSync = originalOpen;
      fs.readSync = originalRead;
      syncBuiltinESMExports();
    }
    assert.equal(readFileSync(target, 'utf8'), 'original bytes');
  }));

// Policy composition only: synthetic fixtures substitute three exact known-byte hashes.
// This does not attest a real Node executable or license; native Windows does that separately.
function syntheticPolicyPackage(packageRoot) {
  const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const root = packageRoot;
  const source = readFileSync(resolve(sourceRoot, 'launch/package-admission.cjs'), 'utf8');
  const pinFor = new Map([
    ['SYNTHETIC-NODE', admission.NODE_SHA],
    ['SYNTHETIC-NODE-LICENSE', admission.NODE_LICENSE_SHA],
    ['SYNTHETIC-REACT-LICENSE', admission.REACT_LICENSE_SHA],
  ]);
  const fakeCrypto = {
    createHash(algorithm) {
      const chunks = [];
      return {
        update(value) {
          chunks.push(Buffer.from(value));
          return this;
        },
        digest(encoding) {
          const bytes = Buffer.concat(chunks);
          return (
            pinFor.get(bytes.toString()) ?? createHash(algorithm).update(bytes).digest(encoding)
          );
        },
      };
    },
  };
  const module = { exports: {} };
  const localRequire = (name) => (name === 'node:crypto' ? fakeCrypto : require(name));
  runInNewContext(source, {
    module,
    exports: module.exports,
    require: localRequire,
    Buffer,
    process: { argv: [], versions: {} },
  });
  const verifier = module.exports;
  const write = (name, value) => {
    const file = resolve(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, value);
  };
  const json = (name, value) => write(name, JSON.stringify(value));
  const head = 'a'.repeat(40),
    tree = 'b'.repeat(40);
  write('Launch.ps1', 'fixed wrapper');
  write('README.txt', 'synthetic policy fixture');
  write('runtime/node/node.exe', 'SYNTHETIC-NODE');
  write('runtime/node/LICENSE', 'SYNTHETIC-NODE-LICENSE');
  for (const name of ['react', 'react-dom', 'scheduler'])
    write(`licenses/${name}-LICENSE`, 'SYNTHETIC-REACT-LICENSE');
  for (const name of admission.CLOSURE) write(`app/launch/${name}`, 'owned helper');
  write('app/native/PersistenceProcess.cs', 'owned helper');
  for (const name of admission.BUILD_OUTPUTS)
    write(`app/build/${name}`, `production output ${name}`);
  const pkg = { name: 'synthetic' },
    lock = { version: 1 },
    review = { manifest: pkg, lock };
  for (const [name, value] of Object.entries({
    'package.json': pkg,
    'package-lock.json': lock,
    'dependency-review.json': review,
  }))
    json(`provenance/${name}`, value);
  const build = {
    schema: 1,
    inputs: Object.fromEntries(
      ['package.json', 'package-lock.json', 'dependency-review.json'].map((name) => [
        name,
        verifier.digest(resolve(root, 'provenance', name)).sha256,
      ]),
    ),
    outputs: Object.fromEntries(
      admission.BUILD_OUTPUTS.map((name) => [
        name,
        verifier.digest(resolve(root, 'app/build', name)).sha256,
      ]),
    ),
  };
  for (const name of [
    ...admission.CLOSURE.map((n) => `launch/${n}`),
    'native/PersistenceProcess.cs',
  ])
    build.inputs[name] = verifier.digest(resolve(root, 'app', name)).sha256;
  json('provenance/build-manifest.json', build);
  json('app/build/.verified-build.json', build);
  json('provenance/source.json', { version: 1, sourceHead: head, sourceTree: tree });
  for (const name of ['electron.exe', 'LICENSE', 'LICENSES.chromium.html', 'version'])
    write(`runtime/electron/${name}`, name === 'version' ? '45.1.0' : 'synthetic runtime');
  mkdirSync(resolve(root, 'runtime/electron/empty'));
  const runtime = {
    version: 1,
    head,
    electron: '45.1.0',
    exeSha256: verifier.digest(resolve(root, 'runtime/electron/electron.exe')).sha256,
    entries: [
      { kind: 'directory', name: 'empty' },
      ...['electron.exe', 'LICENSE', 'LICENSES.chromium.html', 'version'].map((name) => ({
        kind: 'file',
        name,
        ...verifier.digest(resolve(root, 'runtime/electron', name)),
      })),
    ],
  };
  json('provenance/runtime-manifest.json', runtime);
  const refresh = () => {
    const manifest = {
      version: 1,
      mode: 'INTERNAL_PRODUCTION',
      sourceHead: head,
      sourceTree: tree,
      runtime: {
        platform: 'win32',
        arch: 'x64',
        node: '24.22.1',
        electron: '45.1.0',
        nodeExeSha256: admission.NODE_SHA,
        electronExeSha256: runtime.exeSha256,
      },
      entry: 'Launch.ps1',
      files: verifier.inventory(root).files.filter((item) => item.path !== 'package-manifest.json'),
    };
    json('package-manifest.json', manifest);
  };
  refresh();
  return { verifier, refresh, write, json, build };
}
test('synthetic-hash policy composition admits closed package then rejects missing binary/license, extra file and missing empty directory', () =>
  owned((p) => {
    const f = syntheticPolicyPackage(p);
    assert.equal(f.verifier.verifyPackage(p).mode, 'INTERNAL_PRODUCTION');
    for (const name of [
      'runtime/node/node.exe',
      'runtime/node/LICENSE',
      'runtime/electron/LICENSE',
      'licenses/react-LICENSE',
    ]) {
      const file = resolve(p, name),
        original = readFileSync(file);
      rmSync(file);
      f.refresh();
      assert.throws(() => f.verifier.verifyPackage(p));
      writeFileSync(file, original);
      f.refresh();
      assert.equal(f.verifier.verifyPackage(p).mode, 'INTERNAL_PRODUCTION');
    }
    writeFileSync(resolve(p, 'unknown.txt'), 'extra');
    f.refresh();
    assert.throws(() => f.verifier.verifyPackage(p));
    rmSync(resolve(p, 'unknown.txt'));
    f.refresh();
    rmSync(resolve(p, 'runtime/electron/empty'), { recursive: true });
    assert.throws(() => f.verifier.verifyPackage(p));
  }));
test('synthetic-hash policy composition rejects lock mismatch even when copied build and package hashes are updated', () =>
  owned((p) => {
    const f = syntheticPolicyPackage(p);
    assert.equal(f.verifier.verifyPackage(p).mode, 'INTERNAL_PRODUCTION');
    f.json('provenance/package-lock.json', { version: 2 });
    f.build.inputs['package-lock.json'] = f.verifier.digest(
      resolve(p, 'provenance/package-lock.json'),
    ).sha256;
    f.json('provenance/build-manifest.json', f.build);
    f.json('app/build/.verified-build.json', f.build);
    f.refresh();
    assert.throws(() => f.verifier.verifyPackage(p));
  }));

test('synthetic policy rejects copied launcher/native provenance disagreement despite refreshed package inventory', () =>
  owned((p) => {
    const f = syntheticPolicyPackage(p);
    assert.equal(f.verifier.verifyPackage(p).mode, 'INTERNAL_PRODUCTION');
    for (const name of [
      ...admission.CLOSURE.map((n) => `launch/${n}`),
      'native/PersistenceProcess.cs',
    ]) {
      const file = resolve(p, 'app', name),
        original = readFileSync(file);
      writeFileSync(file, 'changed source helper');
      f.refresh();
      assert.throws(() => f.verifier.verifyPackage(p));
      writeFileSync(file, original);
      f.refresh();
      assert.equal(f.verifier.verifyPackage(p).mode, 'INTERNAL_PRODUCTION');
    }
    delete f.build.inputs['launch/launch-core.ps1'];
    f.json('provenance/build-manifest.json', f.build);
    f.json('app/build/.verified-build.json', f.build);
    f.refresh();
    assert.throws(() => f.verifier.verifyPackage(p));
  }));

test('actual builder copy failure retains original and partial staging without later promotion', () =>
  owned((root) => {
    const source = resolve(root, 'source'),
      stage = resolve(root, 'stage'),
      destination = resolve(stage, 'payload'),
      final = resolve(root, 'package');
    writeFileSync(source, 'original package source', { flag: 'wx' });
    mkdirSync(stage);
    const original = fs.copyFileSync;
    let writes = 0,
      promoted = false;
    fs.copyFileSync = (from, to, flags) => {
      assert.equal(from, source);
      assert.equal(to, destination);
      assert.equal(flags, fs.constants.COPYFILE_EXCL);
      writeFileSync(to, Buffer.from('partial'), { flag: 'wx' });
      writes++;
      throw Object.assign(Error('owned injected write failure'), { code: 'ENOSPC' });
    };
    syncBuiltinESMExports();
    try {
      const result = runStages([
        [
          'COPY',
          () => {
            copyPackageFile(source, destination);
            return true;
          },
        ],
        [
          'PROMOTE',
          () => {
            promoted = true;
            return true;
          },
        ],
      ]);
      assert.deepEqual(result, { ok: false, stage: 'COPY' });
      assert.equal(writes, 1);
      assert.equal(promoted, false);
      assert.equal(readFileSync(source, 'utf8'), 'original package source');
      assert.equal(readFileSync(destination, 'utf8'), 'partial');
      assert.equal(fs.existsSync(final), false);
    } finally {
      fs.copyFileSync = original;
      syncBuiltinESMExports();
    }
  }));

test('actual registered production source passes leakage scan with exact fragmented guard tokens', () => {
  assert.equal(scanProductionSource(root), true);
});

test('fragmented exact guard still rejects actual demo payload tokens with internally refreshed hashes', () =>
  owned((p) => {
    const f = syntheticPolicyPackage(p);
    assert.equal(f.verifier.verifyPackage(p).mode, 'INTERNAL_PRODUCTION');
    for (const token of [
      'FONESI_DEMO_FIXTURE_BUNDLE_20261031_V1',
      'DEMO-DEVICE-',
      'DEMO-ACCOUNT-',
      'DEMO-TARGET-',
      'DEMO-SERIAL-',
      'DEMO-MEDIA-',
      'DEMO-JOB-',
      'fonesi.demo.preferences.v1',
    ]) {
      writeFileSync(resolve(p, 'app/build/renderer.js'), token);
      f.build.outputs['renderer.js'] = f.verifier.digest(
        resolve(p, 'app/build/renderer.js'),
      ).sha256;
      f.json('provenance/build-manifest.json', f.build);
      f.json('app/build/.verified-build.json', f.build);
      f.refresh();
      assert.throws(() => f.verifier.verifyPackage(p), /PACKAGE_REJECTED/);
    }
  }));

function physicalAdmissionFixture({
  electron,
  virtualFs = fs,
  originalFs = fs,
  missingOriginal = false,
} = {}) {
  const source = readFileSync(resolve(root, 'launch/package-admission.cjs'), 'utf8');
  const module = { exports: {} },
    loaded = [];
  const localRequire = (name) => {
    loaded.push(name);
    if (name === 'node:fs') return virtualFs;
    if (name === 'original-fs') {
      if (missingOriginal) throw Error('ORIGINAL_FS_UNAVAILABLE');
      return originalFs;
    }
    return require(name);
  };
  const process = { argv: [], versions: electron ? { electron } : {} };
  runInNewContext(source, {
    module,
    exports: module.exports,
    require: localRequire,
    Buffer,
    process,
  });
  return { admission: module.exports, loaded, process };
}
test('package inventory and digest use physical ASAR bytes under Electron without changing global archive policy', () =>
  owned((p) => {
    const archive = resolve(p, 'default_app.asar'),
      bytes = Buffer.from('owned synthetic archive physical bytes');
    writeFileSync(archive, bytes);
    const virtualFs = {
      ...fs,
      lstatSync(file, ...args) {
        if (file === archive)
          return {
            isFile: () => false,
            isDirectory: () => true,
            isSymbolicLink: () => false,
            size: 0,
          };
        return fs.lstatSync(file, ...args);
      },
      opendirSync(file, ...args) {
        if (file === archive) return { readSync: () => null, closeSync() {} };
        return fs.opendirSync(file, ...args);
      },
    };
    // A synthetic ASAR-aware view reproduces the previous physical-file mismatch;
    // it is not an Electron execution or an actual ASAR parser implementation.
    const oldView = physicalAdmissionFixture({ virtualFs }).admission;
    assert.throws(() => oldView.digest(archive), /PACKAGE_REJECTED/);
    assert.equal(oldView.inventory(p).files.length, 0);
    assert.deepEqual([...oldView.inventory(p).directories], ['default_app.asar']);
    const native = physicalAdmissionFixture({ electron: '45.1.0', virtualFs });
    assert.equal(native.loaded.includes('original-fs'), true);
    assert.equal(native.loaded.includes('node:fs'), false);
    assert.equal(Object.hasOwn(native.process, 'noAsar'), false);
    const inventory = native.admission.inventory(p);
    assert.equal(inventory.files.length, 1);
    assert.equal(inventory.directories.length, 0);
    assert.equal(inventory.files[0].path, 'default_app.asar');
    assert.equal(inventory.files[0].bytes, bytes.length);
    assert.equal(inventory.files[0].sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(native.admission.digest(archive).sha256, admission.digest(archive).sha256);
    writeFileSync(archive, Buffer.from('changed bytes'));
    assert.notEqual(native.admission.digest(archive).sha256, inventory.files[0].sha256);
  }));
test('physical filesystem selection fails closed in Electron and uses node fs only in Node', () => {
  assert.throws(
    () => physicalAdmissionFixture({ electron: '45.1.0', missingOriginal: true }),
    /ORIGINAL_FS_UNAVAILABLE/,
  );
  const node = physicalAdmissionFixture({ missingOriginal: true });
  assert.equal(node.loaded.includes('node:fs'), true);
  assert.equal(node.loaded.includes('original-fs'), false);
  const source = readFileSync(resolve(root, 'launch/package-admission.cjs'), 'utf8');
  assert.equal(source.includes('process.noAsar ='), false);
  assert.equal(source.includes('ELECTRON_NO_ASAR'), false);
});
