'use strict';
const {
  plain,
  read,
  write,
  exact,
  uuid,
  sourceWitness,
} = require('./persistence-restore-contract.cjs');
const STAGES = Object.freeze([
  'ui',
  'reopen',
  'before-crash',
  'before-reopen',
  'after-crash',
  'after-reopen',
]);
const VERSIONS = Object.freeze({ electron: '45.1.0', node: '24.22.1', chrome: '156.0.8078.49' });
const COMMON = [
  'ownedRoot',
  'originalKeyAuthenticated',
  'schema3',
  'migration2BackupAuthenticated',
];
const CASES = Object.freeze({
  ui: Object.freeze([
    ...COMMON,
    'realMainReady',
    'realPreloadRead',
    'themeCommitted',
    'dimensionsCommitted',
    'resetCancelled',
    'resetConfirmed',
    'previousRestored',
    'staleConflict',
    'malformedDenied',
    'lightScreenshot',
    'darkScreenshot',
    'windowObserved',
    'vaultUnchanged',
    'orderlyQuit',
  ]),
  reopen: Object.freeze([
    ...COMMON,
    'realMainReady',
    'preferencesRetained',
    'nativeWindowRetained',
    'vaultUnchanged',
    'orderlyQuit',
  ]),
  'before-crash': Object.freeze([...COMMON, 'primaryUnchanged', 'commitBoundaryReached']),
  'after-crash': Object.freeze([...COMMON, 'primaryUnchanged', 'commitBoundaryReached']),
  'before-reopen': Object.freeze([
    ...COMMON,
    'primaryUnchanged',
    'integrity',
    'wholeOldState',
    'previousState',
    'orderlyQuit',
  ]),
  'after-reopen': Object.freeze([
    ...COMMON,
    'primaryUnchanged',
    'integrity',
    'wholeNewState',
    'previousState',
    'orderlyQuit',
  ]),
});
function control(raw) {
  const v = exact(raw, [
    'version',
    'mode',
    'stage',
    'parentToken',
    'ownerToken',
    'storeId',
    'checkpoint',
    'fixtureId',
  ]);
  if (
    v.version !== 1 ||
    !['source', 'package'].includes(v.mode) ||
    !STAGES.includes(v.stage) ||
    ![v.parentToken, v.ownerToken, v.storeId, v.fixtureId].every(uuid) ||
    typeof v.checkpoint !== 'string' ||
    !/^key-checkpoint-[0-9a-f-]{36}\.json$/.test(v.checkpoint) ||
    !uuid(v.checkpoint.slice(15, -5))
  )
    throw Error('SETTINGS_CONTROL');
  return Object.freeze(v);
}
function result(raw) {
  const v = exact(raw, ['version', 'mode', 'stage', 'versions', 'cases']);
  if (
    v.version !== 1 ||
    !['source', 'package'].includes(v.mode) ||
    !STAGES.includes(v.stage) ||
    JSON.stringify(v.versions) !== JSON.stringify(VERSIONS) ||
    JSON.stringify(Object.keys(v.cases ?? {})) !== JSON.stringify(CASES[v.stage]) ||
    CASES[v.stage].some((k) => typeof v.cases[k] !== 'boolean')
  )
    throw Error('SETTINGS_RESULT');
  return v;
}
module.exports = {
  STAGES,
  VERSIONS,
  CASES,
  plain,
  read,
  write,
  exact,
  uuid,
  sourceWitness,
  control,
  result,
};
