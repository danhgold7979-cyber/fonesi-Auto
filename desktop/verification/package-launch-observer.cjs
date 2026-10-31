'use strict';
const path = require('node:path'),
  { createHash } = require('node:crypto');
const { plain, read, write, exact, uuid, STAGES, VERSIONS } = require('./package-contract.cjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const FIELDS = [
  'version',
  'stage',
  'runRoot',
  'runToken',
  'packageRoot',
  'createParent',
  'managedRoot',
  'selectedStore',
  'backupParent',
  'backupFile',
  'restoreParent',
  'retainedLaunchId',
];
function seed(raw) {
  const c = exact(raw, FIELDS);
  if (
    c.version !== 1 ||
    !STAGES.includes(c.stage) ||
    !uuid(c.runToken) ||
    !['managedRoot', 'selectedStore', 'backupFile'].every(
      (k) => c[k] === null || typeof c[k] === 'string',
    ) ||
    !(c.retainedLaunchId === null || uuid(c.retainedLaunchId))
  )
    throw Error('PACKAGE_CONTROL');
  for (const k of ['runRoot', 'packageRoot', 'createParent', 'backupParent', 'restoreParent'])
    if (typeof c[k] !== 'string' || c[k] !== path.resolve(c[k])) throw Error('PACKAGE_CONTROL');
  for (const k of [
    'createParent',
    'backupParent',
    'restoreParent',
    'managedRoot',
    'selectedStore',
    'backupFile',
  ])
    if (c[k] !== null && (c[k] !== path.resolve(c[k]) || !c[k].startsWith(c.runRoot + path.sep)))
      throw Error('PACKAGE_CONTROL');
  if (!c.packageRoot.startsWith(c.runRoot + path.sep)) throw Error('PACKAGE_CONTROL');
  return c;
}
const OBSERVER_PHASES = Object.freeze([
  'ENVIRONMENT',
  'LAYOUT',
  'CONTROL',
  'OWNER',
  'PROOF_SHAPE',
  'DERIVED_CORE',
  'ORIGINALS',
  'OBSERVERS',
  'PACKAGE',
  'OUTSIDE',
  'VERSIONS',
  'INIT_CONTROL',
  'INIT_DIALOG',
  'INIT_REQUIRE',
  'INIT_RECORD',
  'MAIN_REQUIRE',
  'MAIN_OPERATION',
  'UNKNOWN',
]);
const OBSERVER_REASONS = Object.freeze([
  'PACKAGE_ENVIRONMENT',
  'PACKAGE_CONTROL',
  'PACKAGE_OWNER',
  'PACKAGE_PROOF',
  'PACKAGE_VERSION',
  'PACKAGE_DIALOG',
  'RESTORE_OWNER',
  'PACKAGE_REJECTED',
  'RESTORE_FILE',
  'RESTORE_LIMIT',
  'RESTORE_SCHEMA',
  'RESTORE_READBACK',
  'ENOENT',
  'EACCES',
  'EPERM',
  'MODULE_NOT_FOUND',
  'ERR_REQUIRE_ESM',
  'SYNTAX_ERROR',
  'TYPE_ERROR',
  'UNCLASSIFIED',
]);
let observedPhase = 'UNKNOWN';
function phase(value) {
  observedPhase = OBSERVER_PHASES.includes(value) ? value : 'UNKNOWN';
}
function diagnostics(error) {
  let reason = 'UNCLASSIFIED';
  try {
    for (const key of ['message', 'code']) {
      const d = Object.getOwnPropertyDescriptor(error, key);
      if (d && Object.hasOwn(d, 'value') && OBSERVER_REASONS.includes(d.value)) {
        reason = d.value;
        break;
      }
    }
    if (reason === 'UNCLASSIFIED' && error instanceof SyntaxError) reason = 'SYNTAX_ERROR';
    if (reason === 'UNCLASSIFIED' && error instanceof TypeError) reason = 'TYPE_ERROR';
  } catch {}
  return ['PACKAGE_OBSERVER_PHASE_' + observedPhase, 'PACKAGE_OBSERVER_REASON_' + reason];
}
function report(error) {
  for (const line of diagnostics(error)) console.error(line);
}
function admission(directory) {
  phase('ENVIRONMENT');
  if (
    !process.env.SystemRoot ||
    process.env.PATH?.toLowerCase() !== path.join(process.env.SystemRoot, 'System32').toLowerCase()
  )
    throw Error('PACKAGE_ENVIRONMENT');
  phase('LAYOUT');
  plain(directory);
  phase('CONTROL');
  const outer = path.dirname(directory),
    c = seed(read(path.join(outer, 'control.json')));
  phase('OWNER');
  plain(c.runRoot);
  if (
    read(path.join(c.runRoot, '.owner')) !== c.runToken ||
    outer !== path.join(c.runRoot, 'package-probe-' + c.stage)
  )
    throw Error('PACKAGE_OWNER');
  phase('PROOF_SHAPE');
  const proof = exact(read(path.join(outer, 'copy-proof.json')), [
    'version',
    'stage',
    'originalFiles',
    'derivedCoreSha256',
    'observerFiles',
  ]);
  if (proof.version !== 1 || proof.stage !== c.stage) throw Error('PACKAGE_PROOF');
  const originals = ['Launch.ps1', 'app/launch/Invoke-Package.ps1', 'app/launch/launch-core.ps1'];
  const observers = [
    'package-launch-observer.cjs',
    'package-launch-init-probe.cjs',
    'package-launch-main-probe.cjs',
    'package-contract.cjs',
    'persistence-restore-contract.cjs',
  ];
  if (
    JSON.stringify(Object.keys(proof.originalFiles)) !== JSON.stringify(originals) ||
    JSON.stringify(Object.keys(proof.observerFiles)) !== JSON.stringify(observers) ||
    typeof proof.derivedCoreSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(proof.derivedCoreSha256)
  )
    throw Error('PACKAGE_PROOF');
  phase('DERIVED_CORE');
  if (
    hash(Buffer.from(read(path.join(outer, 'app/launch/launch-core.ps1')))) !==
    proof.derivedCoreSha256
  )
    throw Error('PACKAGE_PROOF');
  phase('ORIGINALS');
  for (const name of originals) {
    const digest = proof.originalFiles[name];
    if (
      typeof digest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(digest) ||
      hash(Buffer.from(read(path.join(c.packageRoot, name)))) !== digest
    )
      throw Error('PACKAGE_PROOF');
    if (
      name !== 'app/launch/launch-core.ps1' &&
      hash(Buffer.from(read(path.join(outer, name)))) !== digest
    )
      throw Error('PACKAGE_PROOF');
  }

  phase('OBSERVERS');
  for (const [name, digest] of Object.entries(proof.observerFiles)) {
    if (
      ![
        'package-launch-observer.cjs',
        'package-launch-init-probe.cjs',
        'package-launch-main-probe.cjs',
        'package-contract.cjs',
        'persistence-restore-contract.cjs',
      ].includes(name) ||
      typeof digest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(digest) ||
      hash(Buffer.from(read(path.join(directory, name)))) !== digest
    )
      throw Error('PACKAGE_PROOF');
  }
  phase('PACKAGE');
  const { verifyPackage, assertDataOutsidePackage } = require(
    path.join(c.packageRoot, 'app/launch/package-admission.cjs'),
  );
  verifyPackage(c.packageRoot);
  phase('OUTSIDE');
  for (const p of [c.createParent, c.backupParent, c.restoreParent])
    assertDataOutsidePackage(c.packageRoot, p);
  phase('VERSIONS');
  if (
    JSON.stringify({
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    }) !== JSON.stringify(VERSIONS)
  )
    throw Error('PACKAGE_VERSION');
  return { c, outer };
}
function witness(c, kind, fields) {
  return {
    version: 1,
    stage: c.stage,
    kind,
    ready: false,
    closed: false,
    quitRequested: false,
    opens: 0,
    confirms: 0,
    cancelled: false,
    sixTabsEmpty: false,
    settingsObserved: false,
    ...fields,
  };
}
function record(outer, value) {
  write(path.join(outer, 'observer-' + value.kind + '.json'), value);
}
module.exports = {
  seed,
  admission,
  witness,
  record,
  FIELDS,
  OBSERVER_PHASES,
  OBSERVER_REASONS,
  phase,
  diagnostics,
  report,
};
