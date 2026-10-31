'use strict';
const {
  plain,
  read,
  write,
  exact,
  uuid,
  sourceWitness,
} = require('./persistence-restore-contract.cjs');
const VERSIONS = Object.freeze({ electron: '45.1.0', node: '24.22.1', chrome: '156.0.8078.49' });
const COMMON = ['packageVerified', 'productOutsidePackage', 'originalPackageUnchanged'];
const CASES = Object.freeze({
  'first-cancel': Object.freeze([...COMMON, 'provisioningCancelled', 'noWriterLease']),
  'first-launch': Object.freeze([
    ...COMMON,
    'initialized',
    'originalKeyAuthenticated',
    'mainReady',
    'sixTabsEmpty',
    'settingsObserved',
    'orderlyClose',
    'leaseReleased',
  ]),
  reopen: Object.freeze([
    ...COMMON,
    'noReprovision',
    'originalBackupUnchanged',
    'settingsRetained',
    'orderlyClose',
    'leaseReleased',
  ]),
  'guard-denied': Object.freeze([
    ...COMMON,
    'guardContentionRefused',
    'noNewLaunch',
    'sourceBytesPreserved',
  ]),
  'corrupt-current': Object.freeze([
    ...COMMON,
    'invalidCurrentRefused',
    'knownRetirement',
    'leaseRetained',
    'sourceBytesPreserved',
  ]),
  'recover-retained': Object.freeze([
    ...COMMON,
    'exactJournalMatched',
    'freshRecoveryReceipt',
    'oldLeaseReleased',
    'sourceBytesPreserved',
  ]),
  'restore-cancel': Object.freeze([
    ...COMMON,
    'backupAuthenticated',
    'cancelled',
    'sourceBytesPreserved',
    'leaseReleased',
  ]),
  'restore-confirm': Object.freeze([
    ...COMMON,
    'backupAuthenticated',
    'newQuarantinedRoot',
    'sourceBytesPreserved',
    'leaseReleased',
  ]),
  'restored-normal-denied': Object.freeze([
    ...COMMON,
    'normalDenied',
    'quarantineUnchanged',
    'sourceBytesPreserved',
  ]),
  'restored-maintenance': Object.freeze([
    ...COMMON,
    'selectedStoreAdmitted',
    'backupAuthenticated',
    'secondQuarantinedRoot',
    'sourceBytesPreserved',
    'leaseReleased',
  ]),
});
const STAGES = Object.freeze(Object.keys(CASES));
const EXPECTED = Object.freeze(
  Object.fromEntries(
    STAGES.map((stage) => [
      stage,
      stage === 'corrupt-current'
        ? ['NONZERO_EXIT', 1, 'PERSISTENCE_DESKTOP_APPLICATION_FAILED']
        : stage === 'restored-normal-denied' || stage === 'guard-denied'
          ? ['NONZERO_EXIT', 1, 'PERSISTENCE_DESKTOP_PREPARE_FAILED']
          : [
              'SUCCESS',
              0,
              stage === 'first-cancel'
                ? 'PERSISTENCE_DESKTOP_CANCELLED'
                : stage === 'recover-retained'
                  ? 'PERSISTENCE_DESKTOP_RECOVERED'
                  : 'PERSISTENCE_DESKTOP_CLOSED',
            ],
    ]),
  ),
);
const NEGATIVES = Object.freeze([
  'missingNode',
  'missingElectron',
  'missingNodeLicense',
  'missingElectronLicense',
  'missingChromiumLicense',
  'missingReactLicense',
  'missingReactDomLicense',
  'missingSchedulerLicense',
  'payloadTamper',
  'lockMismatch',
  'unknownDemoFile',
  'fixtureCanaryRejected',
  'promotionCollisionRejected',
  'failingTestGate',
  'originalPackageRestored',
]);
function result(raw) {
  const value = exact(raw, ['version', 'stage', 'versions', 'cases']);
  if (
    value.version !== 1 ||
    !STAGES.includes(value.stage) ||
    JSON.stringify(value.versions) !== JSON.stringify(VERSIONS)
  )
    throw Error('PACKAGE_RESULT');
  if (
    !value.cases ||
    JSON.stringify(Object.keys(value.cases)) !== JSON.stringify(CASES[value.stage]) ||
    Object.values(value.cases).some((v) => typeof v !== 'boolean')
  )
    throw Error('PACKAGE_RESULT');
  return value;
}
function negativeResult(raw) {
  const value = exact(raw, ['version', 'cases']);
  if (
    value.version !== 1 ||
    !value.cases ||
    JSON.stringify(Object.keys(value.cases)) !== JSON.stringify(NEGATIVES) ||
    Object.values(value.cases).some((v) => typeof v !== 'boolean')
  )
    throw Error('PACKAGE_RESULT');
  return value;
}
module.exports = {
  plain,
  read,
  write,
  exact,
  uuid,
  sourceWitness,
  VERSIONS,
  CASES,
  STAGES,
  EXPECTED,
  NEGATIVES,
  result,
  negativeResult,
};
