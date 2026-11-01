'use strict';
// Private four-launch campaign grammar. No runtime/candidate selection authority.
const path = require('node:path');
const { plain, read, write, uuid } = require('./persistence-restore-contract.cjs');
const { rootForLaunch } = require('./retained-host-contract.cjs');
const STAGES = Object.freeze(['SEED', 'UPGRADE', 'ROLLBACK', 'REOPEN']);
const SCOPE = 'HOSTED_RETAINED_ROLLBACK_PACKAGE_ONLY';
const OBSERVER_CASES = Object.freeze([
  'mainReady',
  'setupActionCorrect',
  'selectedReleaseObserved',
  'installTargetObserved',
  'versionObserved',
  'versionServiceRetired',
  'setupRetired',
  'runtimeCustodyRetired',
  'helperDirectoryRemoved',
  'mainClosed',
]);
const CONTROL_CASES = Object.freeze([
  'schema4Observed',
  'durableEpochObserved',
  'provisionChainObserved',
  'auditBound',
  'previousHistoryUnchanged',
  'launchReleased',
]);
const CASES = Object.freeze([...OBSERVER_CASES, ...CONTROL_CASES]);
const PHASES = Object.freeze([
  'PREPARE',
  'ADMISSION',
  'SCHEMA',
  'SETUP',
  'VERSION',
  'RETIRE',
  'CLOSE',
  'AUDIT',
  'INSPECT',
  'CLEANUP',
  'DIAGNOSE',
  'ARGUMENT',
]);
const REASONS = Object.freeze([
  'SCHEMA',
  'OWNER',
  'SOURCE',
  'BUILD',
  'COPY',
  'ARCHIVE',
  'PACKAGE',
  'STAGE',
  'JOURNAL',
  'CAPTURE',
  'AUTH',
  'DATABASE',
  'LEDGER',
  'AUDIT',
  'HISTORY',
  'INVENTORY',
  'LIMIT',
  'CONTEXT',
  'DIALOG',
  'TIMEOUT',
  'RESPONSE',
  'RETIREMENT',
  'MAIN',
  'UNCLASSIFIED',
]);
const EXPECTED = Object.freeze(
  Object.fromEntries(
    STAGES.map((stage, i) => [
      stage,
      Object.freeze({
        epoch: i + 1,
        durableRevision: 2 * (i + 1),
        installationRevision: Math.min(i + 1, 3),
        activeVersion: i === 1 ? '37.0.1' : '36.0.0',
        previousVersion: i === 0 ? null : i === 1 ? '36.0.0' : '37.0.1',
        installTargetVersion: i === 0 ? '36.0.0' : '37.0.1',
        action: i === 3 ? null : i === 2 ? 'ROLLBACK' : 'INSTALL',
        entryMode: i === 0 ? 'SOURCE' : 'PACKAGE',
      }),
    ]),
  ),
);
function fail(reason = 'SCHEMA') {
  throw Error('RETAINED_ROLLBACK_' + reason);
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
function json(file) {
  const raw = read(file),
    v = JSON.parse(raw);
  if (JSON.stringify(v) !== raw) fail();
  return v;
}
function stageName(stage) {
  if (!STAGES.includes(stage)) fail('STAGE');
  return stage;
}
function validate(value, observed) {
  exact(value, ['version', 'scope', 'stage', 'cases', 'readyCount', 'closedCount']);
  stageName(value.stage);
  if (
    value.version !== 1 ||
    value.scope !== SCOPE ||
    value.readyCount !== 1 ||
    value.closedCount !== 1
  )
    fail();
  exact(value.cases, CASES);
  for (const name of CASES)
    if (value.cases[name] !== !(observed && CONTROL_CASES.includes(name))) fail();
  return { passed: true };
}
function validateObserved(v) {
  return validate(v, true);
}
function validateResult(v) {
  return validate(v, false);
}
function integer(v) {
  return Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
}
function operation(v, setup, stage) {
  exact(
    v,
    setup
      ? [
          'operationId',
          'expectedRevision',
          'pendingRevision',
          'verifiedRevision',
          'reads',
          'requestId',
          'action',
        ]
      : [
          'operationId',
          'installationRevision',
          'expectedRevision',
          'pendingRevision',
          'verifiedRevision',
          'reads',
          'requestId',
        ],
  );
  if (
    !uuid(v.operationId) ||
    !['expectedRevision', 'pendingRevision', 'verifiedRevision'].every((k) => integer(v[k])) ||
    !(v.expectedRevision < v.pendingRevision && v.pendingRevision < v.verifiedRevision) ||
    v.reads !== (setup ? 3 : 2) ||
    typeof v.requestId !== 'string' ||
    !/^p[1-9][0-9]{0,15}$/.test(v.requestId) ||
    !Number.isSafeInteger(Number(v.requestId.slice(1))) ||
    String(Number(v.requestId.slice(1))) !== v.requestId.slice(1)
  )
    fail();
  if (
    setup
      ? v.action !== EXPECTED[stage].action
      : v.installationRevision !== EXPECTED[stage].installationRevision
  )
    fail();
}
function validateBinding(v) {
  exact(v, ['version', 'stage', 'setup', 'runtime']);
  stageName(v.stage);
  if (v.version !== 1) fail();
  if (v.stage === 'REOPEN') {
    if (v.setup !== null) fail();
  } else operation(v.setup, true, v.stage);
  operation(v.runtime, false, v.stage);
  return v;
}
const ANCHOR = 'const setup = platformToolsService;';
const TARGET = 'var INSTALL_TARGET_SHA256 = PLATFORM_TOOLS_CANDIDATE.archive.sha256;';
const PRIOR = 'var INSTALL_TARGET_SHA256 = PLATFORM_TOOLS_PRIOR_36_CANDIDATE.archive.sha256;';
function deriveMain(raw, observerPath, stage) {
  stageName(stage);
  if (
    typeof raw !== 'string' ||
    Buffer.byteLength(raw) > 8388608 ||
    observerPath !== path.join(__dirname, 'retained-rollback-main-probe.cjs') ||
    raw.split(ANCHOR).length !== 2 ||
    raw.split(TARGET).length !== 2 ||
    raw.includes(PRIOR)
  )
    fail('MAIN');
  const inserted = `${ANCHOR}\nrequire(${JSON.stringify(observerPath)}).bindContext(Object.freeze({entry:ownedEntry,runtimeCustody,setup,versionService,assertOwnedSync:()=>{if(closing||resourcesDisposed)throw Error('OWNER_REVOKED');assertPreparedPersistenceLease(ownedEntry);}}));`;
  let result = raw.replace(ANCHOR, inserted);
  if (stage === 'SEED') result = result.replace(TARGET, PRIOR);
  if ((stage === 'SEED' ? result.replace(PRIOR, TARGET) : result).replace(inserted, ANCHOR) !== raw)
    fail('MAIN');
  return result;
}
function stageForLaunch(launch) {
  const root = rootForLaunch(launch),
    managed = path.dirname(launch),
    id = path.basename(launch).slice(7);
  if (!uuid(id)) fail('OWNER');
  const pointer = json(path.join(managed, '.launcher-current.json'));
  if (pointer.launchId !== id) fail('OWNER');
  const matches = [];
  for (const stage of STAGES) {
    let prepared;
    try {
      prepared = json(path.join(root, `stage-${stage}.json`));
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
    exact(prepared, [
      'version',
      'stage',
      'managedRoot',
      'wrapper',
      'previousLaunchIds',
      'originalMainSha256',
      'derivedMainSha256',
      'expectedTargetVersion',
      'expectedActiveVersion',
      'installationRevision',
      'archiveFile',
    ]);
    if (
      prepared.version !== 1 ||
      prepared.stage !== stage ||
      prepared.wrapper !==
        `scripts-${stage === 'SEED' ? 'SEED' : 'PACKAGE'}/Invoke-${stage === 'SEED' ? 'Desktop' : 'Package'}.instrumented.ps1` ||
      !Array.isArray(prepared.previousLaunchIds) ||
      prepared.previousLaunchIds.length !== STAGES.indexOf(stage) ||
      prepared.previousLaunchIds.some((x) => !uuid(x)) ||
      new Set(prepared.previousLaunchIds).size !== prepared.previousLaunchIds.length
    )
      fail('STAGE');
    if (
      ![prepared.originalMainSha256, prepared.derivedMainSha256].every(
        (v) => typeof v === 'string' && v.length === 64 && /^[0-9a-f]+$/.test(v),
      ) ||
      prepared.expectedTargetVersion !== EXPECTED[stage].installTargetVersion ||
      prepared.expectedActiveVersion !== EXPECTED[stage].activeVersion ||
      prepared.installationRevision !== EXPECTED[stage].installationRevision ||
      prepared.archiveFile !==
        (stage === 'SEED' ? 'official-36.zip' : stage === 'UPGRADE' ? 'official-37.zip' : null)
    )
      fail('STAGE');
    if (stage === 'SEED' ? prepared.managedRoot !== null : prepared.managedRoot !== managed)
      fail('OWNER');
    const campaign = json(path.join(root, 'campaign.json'));
    if (campaign.version !== 1 || campaign.scope !== SCOPE) fail('OWNER');
    const actual = require('./package-owned-files.cjs')
      .entries(managed, 16)
      .filter((e) => e.name.startsWith('launch-'));
    if (
      actual.length === prepared.previousLaunchIds.length + 1 &&
      !prepared.previousLaunchIds.includes(id) &&
      actual.every(
        (e) =>
          e.stat.isDirectory() &&
          !e.stat.isSymbolicLink() &&
          (e.name === 'launch-' + id || prepared.previousLaunchIds.includes(e.name.slice(7))),
      )
    )
      matches.push({ root, stage, prepared, packageMode: stage !== 'SEED' });
  }
  if (matches.length !== 1) fail('STAGE');
  plain(root);
  return Object.freeze(matches[0]);
}
function mainForStage(root, stage) {
  stageName(stage);
  plain(root);
  if (
    root !== path.resolve(__dirname, '../.retained-host-runtime/r') ||
    !uuid(read(path.join(root, '.owner')))
  )
    fail('OWNER');
  return stage === 'SEED'
    ? path.resolve(__dirname, '../build/main.cjs')
    : path.join(
        require('./main-runtime-version-package.cjs').admitPackage(root).buildRoot,
        'main.cjs',
      );
}
function reason(error) {
  try {
    const d = Object.getOwnPropertyDescriptor(error, 'message');
    if (d && typeof d.value === 'string' && d.value.startsWith('RETAINED_ROLLBACK_')) {
      const r = d.value.slice(18);
      if (REASONS.includes(r)) return r;
    }
  } catch {}
  return 'UNCLASSIFIED';
}
module.exports = {
  STAGES,
  SCOPE,
  OBSERVER_CASES,
  CONTROL_CASES,
  CASES,
  PHASES,
  REASONS,
  EXPECTED,
  stageName,
  validateObserved,
  validateResult,
  validateBinding,
  deriveMain,
  stageForLaunch,
  mainForStage,
  rootForLaunch,
  write,
  exact,
  json,
  fail,
  reason,
};
