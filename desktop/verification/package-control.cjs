'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { spawnSync } = require('node:child_process'),
  { pathToFileURL } = require('node:url');
const { plain, read, write, uuid, NEGATIVES } = require('./package-contract.cjs');
const admission = require('../launch/package-admission.cjs');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function absent(file) {
  try {
    fs.lstatSync(file);
    return false;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
}
function admit(root) {
  plain(root);
  const token = read(path.join(root, '.owner'));
  if (!uuid(token)) throw Error('PACKAGE_OWNER');
  return token;
}
function deny(verifier) {
  let rejected = false;
  try {
    verifier();
  } catch {
    rejected = true;
  }
  if (!rejected) throw Error('PACKAGE_NEGATIVE_NOT_DENIED');
}
function withMissing(file, backup, verifier) {
  const original = admission.digest(file);
  if (!absent(backup)) throw Error('PACKAGE_BACKUP_EXISTS');
  fs.renameSync(file, backup);
  let primary,
    failed = false;
  try {
    deny(verifier);
  } catch (error) {
    primary = error;
    failed = true;
  }
  if (!absent(file) || JSON.stringify(admission.digest(backup)) !== JSON.stringify(original))
    throw Error('PACKAGE_RESTORE_UNCERTAIN');
  fs.renameSync(backup, file);
  if (JSON.stringify(admission.digest(file)) !== JSON.stringify(original))
    throw Error('PACKAGE_RESTORE_UNCERTAIN');
  if (failed) throw primary;
}
function withReplacement(file, backup, replacement, verifier) {
  const original = admission.digest(file);
  if (!absent(backup)) throw Error('PACKAGE_BACKUP_EXISTS');
  fs.renameSync(file, backup);
  fs.writeFileSync(file, replacement, { flag: 'wx', mode: 0o600 });
  const changed = admission.digest(file);
  let primary,
    failed = false;
  try {
    deny(verifier);
  } catch (error) {
    primary = error;
    failed = true;
  }
  if (
    JSON.stringify(admission.digest(file)) !== JSON.stringify(changed) ||
    JSON.stringify(admission.digest(backup)) !== JSON.stringify(original)
  )
    throw Error('PACKAGE_RESTORE_UNCERTAIN');
  fs.unlinkSync(file);
  fs.renameSync(backup, file);
  if (JSON.stringify(admission.digest(file)) !== JSON.stringify(original))
    throw Error('PACKAGE_RESTORE_UNCERTAIN');
  if (failed) throw primary;
}
const FAILING_TEST =
  "require('node:test')('owned intentionally failing package prerequisite',()=>{throw Error('INJECTED_TEST_FAILURE');});\n";
function cleanNegativeFixtures(root) {
  const work = path.join(root, 'promotion-negative'),
    stage = path.join(work, 'stage');
  function inventory(folder, expected) {
    plain(folder);
    const handle = fs.opendirSync(folder),
      names = [];
    try {
      for (;;) {
        const entry = handle.readSync();
        if (entry === null) break;
        if (names.length >= expected.length) throw Error('PACKAGE_CLEANUP_UNCERTAIN');
        names.push(entry.name);
      }
    } finally {
      handle.closeSync();
    }
    if (JSON.stringify(names.sort()) !== JSON.stringify([...expected].sort()))
      throw Error('PACKAGE_CLEANUP_UNCERTAIN');
  }
  inventory(work, ['stage', 'stage.zip', 'package.zip']);
  inventory(stage, ['owned']);
  const files = [
    ['promotion-negative/stage/owned', 'candidate'],
    ['promotion-negative/stage.zip', 'candidate'],
    ['promotion-negative/package.zip', 'last verified owned fixture'],
    ['injected-failing-test.cjs', FAILING_TEST],
  ];
  for (const [name, expected] of files) {
    const observed = admission.digest(path.join(root, name));
    if (
      observed.bytes !== Buffer.byteLength(expected) ||
      observed.sha256 !== sha(Buffer.from(expected))
    )
      throw Error('PACKAGE_CLEANUP_UNCERTAIN');
  }
  for (const [name] of files) fs.unlinkSync(path.join(root, name));
  fs.rmdirSync(stage);
  fs.rmdirSync(work);
}
async function runNegatives(root, packageRoot) {
  const owner = admit(root);
  if (packageRoot !== path.join(root, 'package-negative')) throw Error('PACKAGE_NEGATIVE_LOCATION');
  const before = admission.verifyPackage(packageRoot),
    beforeRaw = JSON.stringify(before);
  const cases = Object.fromEntries(NEGATIVES.map((k) => [k, false]));
  const backup = path.join(root, 'negative-original');
  const missing = {
    missingNode: 'runtime/node/node.exe',
    missingElectron: 'runtime/electron/electron.exe',
    missingNodeLicense: 'runtime/node/LICENSE',
    missingElectronLicense: 'runtime/electron/LICENSE',
    missingChromiumLicense: 'runtime/electron/LICENSES.chromium.html',
    missingReactLicense: 'licenses/react-LICENSE',
    missingReactDomLicense: 'licenses/react-dom-LICENSE',
    missingSchedulerLicense: 'licenses/scheduler-LICENSE',
  };
  for (const [name, file] of Object.entries(missing)) {
    withMissing(path.join(packageRoot, file), backup, () => admission.verifyPackage(packageRoot));
    admission.verifyPackage(packageRoot);
    cases[name] = true;
  }
  for (const [name, file, replacement] of [
    ['payloadTamper', 'app/build/renderer.js', Buffer.from('invalid owned payload')],
    ['lockMismatch', 'provenance/package-lock.json', Buffer.from('{"lockfileVersion":0}')],
  ]) {
    withReplacement(path.join(packageRoot, file), backup, replacement, () =>
      admission.verifyPackage(packageRoot),
    );
    admission.verifyPackage(packageRoot);
    cases[name] = true;
  }
  const unknown = path.join(packageRoot, 'app/build/demo-fixtures.cjs');
  fs.writeFileSync(unknown, 'owned negative', { flag: 'wx' });
  const unknownHash = admission.digest(unknown);
  let unknownFailure,
    unknownFailed = false;
  try {
    deny(() => admission.verifyPackage(packageRoot));
  } catch (error) {
    unknownFailure = error;
    unknownFailed = true;
  }
  if (JSON.stringify(admission.digest(unknown)) !== JSON.stringify(unknownHash))
    throw Error('PACKAGE_RESTORE_UNCERTAIN');
  fs.unlinkSync(unknown);
  if (unknownFailed) throw unknownFailure;
  cases.unknownDemoFile = true;
  const { scanProductionBytes } = await import(
    pathToFileURL(path.join(__dirname, '../scripts/demo-build-manifest.mjs')).href
  );
  scanProductionBytes(Buffer.from('production positive'));
  deny(() => scanProductionBytes(Buffer.from('FONESI_DEMO_FIXTURE_BUNDLE_20261031_V1')));
  cases.fixtureCanaryRejected = true;
  const { promotePackage } = await import(
    pathToFileURL(path.join(__dirname, '../scripts/build-package.mjs')).href
  );
  const work = path.join(root, 'promotion-negative');
  fs.mkdirSync(work);
  const stage = path.join(work, 'stage'),
    final = path.join(work, 'package'),
    zipStage = path.join(work, 'stage.zip'),
    zip = path.join(work, 'package.zip');
  fs.mkdirSync(stage);
  fs.writeFileSync(path.join(stage, 'owned'), 'candidate', { flag: 'wx' });
  fs.writeFileSync(zipStage, 'candidate', { flag: 'wx' });
  fs.writeFileSync(zip, 'last verified owned fixture', { flag: 'wx' });
  const old = sha(fs.readFileSync(zip));
  deny(() => promotePackage(stage, final, zipStage, zip, { sha256: '0'.repeat(64) }));
  if (!absent(final) || sha(fs.readFileSync(zip)) !== old)
    throw Error('PACKAGE_PROMOTION_NEGATIVE');
  cases.promotionCollisionRejected = true;
  const testFile = path.join(root, 'injected-failing-test.cjs');
  fs.writeFileSync(testFile, FAILING_TEST, { flag: 'wx' });
  const observed = spawnSync(process.execPath, ['--test', testFile], {
    shell: false,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 65536,
    windowsHide: true,
  });
  if (
    observed.error ||
    observed.signal ||
    observed.status !== 1 ||
    !observed.stdout.includes('fail 1')
  )
    throw Error('PACKAGE_TEST_NEGATIVE');
  const { runStages } = await import(
    pathToFileURL(path.join(__dirname, '../scripts/stages.mjs')).href
  );
  let promoted = false;
  const gated = await runStages([
    ['TESTS', () => observed.status === 0],
    [
      'PACKAGE',
      () => {
        promoted = true;
        return true;
      },
    ],
  ]);
  if (promoted || gated.ok !== false) throw Error('PACKAGE_TEST_NEGATIVE');
  cases.failingTestGate = true;
  if (
    admit(root) !== owner ||
    JSON.stringify(admission.verifyPackage(packageRoot)) !== beforeRaw ||
    !absent(backup)
  )
    throw Error('PACKAGE_ORIGINAL_CHANGED');
  cleanNegativeFixtures(root);
  if (admit(root) !== owner) throw Error('PACKAGE_OWNER');
  cases.originalPackageRestored = true;
  write(path.join(root, 'package-negatives.json'), { version: 1, cases });
  return cases;
}
module.exports = {
  runNegatives,
  withMissing,
  withReplacement,
  cleanNegativeFixtures,
  FAILING_TEST,
};
if (require.main === module) {
  (async () => {
    try {
      const [action, root, packageRoot] = process.argv.slice(2);
      if (process.argv.length !== 5 || action !== 'negatives') throw Error('PACKAGE_ARGUMENTS');
      await runNegatives(root, packageRoot);
      console.log('PACKAGE_NEGATIVES_VERIFIED');
    } catch {
      console.log('PACKAGE_NEGATIVES_FAILED');
      process.exitCode = 1;
    }
  })();
}
