'use strict';
const CASES = Object.freeze([
  'retained_lease',
  'profile_before_ready',
  'native_keys',
  'ready_schema',
  'cancel_folder_unchanged',
  'cancel_accept_unchanged',
  'cancel_restore_unchanged',
  'list_native_display',
  'manual_backup',
  'location_identity',
  'location_persisted',
  'ordinary_retention_7',
  'protected_retained',
  'acceptance_receipt',
  'restore_new_root',
  'restore_quarantined',
  'source_unchanged_by_restore',
  'service_closed',
]);
const VERSIONS = Object.freeze({ electron: '45.1.0', node: '24.22.1', chrome: '156.0.8078.49' });
function exact(value, names) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value)) !== JSON.stringify(names)
  )
    throw new Error('INVALID');
}
function parse(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) throw new Error('INVALID');
  const value = JSON.parse(raw);
  exact(value, [
    'version',
    'scope',
    'mode',
    'versions',
    'cases',
    'ordinaryCount',
    'protectedCount',
    'releasedSafetyCount',
  ]);
  exact(value.versions, Object.keys(VERSIONS));
  exact(value.cases, CASES);
  if (
    value.version !== 1 ||
    value.scope !== 'NATIVE_ADAPTER_MAINTENANCE' ||
    !['source', 'package'].includes(value.mode) ||
    JSON.stringify(value.versions) !== JSON.stringify(VERSIONS) ||
    CASES.some((name) => typeof value.cases[name] !== 'boolean') ||
    !Number.isInteger(value.ordinaryCount) ||
    value.ordinaryCount < 0 ||
    value.ordinaryCount > 7 ||
    !Number.isInteger(value.protectedCount) ||
    value.protectedCount < 0 ||
    value.protectedCount > 2 ||
    !Number.isInteger(value.releasedSafetyCount) ||
    value.releasedSafetyCount < 0 ||
    value.releasedSafetyCount > 2 ||
    JSON.stringify(value) !== raw
  )
    throw new Error('INVALID');
  return Object.freeze({
    ...value,
    passed:
      CASES.every((name) => value.cases[name]) &&
      value.ordinaryCount === 7 &&
      value.protectedCount === 1 &&
      value.releasedSafetyCount === 1,
  });
}
const STAGES = Object.freeze([
  'ENTRY',
  'OWNERSHIP',
  'PROFILE',
  'READY',
  'LEASE',
  'KEYS',
  'OPEN',
  'INITIALIZE',
  'CANCEL_FOLDER',
  'CANCEL_ACCEPT',
  'CANCEL_RESTORE',
  'LIST',
  'SELECT_FOLDER',
  'REOPEN',
  'MANUAL_BACKUPS',
  'RETENTION',
  'ACCEPT',
  'POST_ACCEPT_BACKUP',
  'RESTORE',
  'RESTORE_VALIDATE',
  'CLOSE',
  'RESULT',
]);
const CODES = Object.freeze([
  'OWNERSHIP',
  'FILE',
  'LIMIT',
  'RESTORE_TREE',
  'BACKUP',
  'DIALOG',
  'DISPLAY',
  'CONFIRM',
  'DIALOG_COUNT',
  'OVERRIDE',
  'CONTROL',
  'ENTRY',
  'DATA_OWNER',
  'LEASE',
  'PROFILE',
  'CHECKPOINT',
  'PARENT_NOT_EMPTY',
  'CANCEL',
  'CANCEL_ORPHAN',
  'PROTECTED',
  'LIST',
  'SELECT',
  'LOCATION',
  'PERSIST',
  'RETENTION',
  'ACCEPT',
  'RECEIPT',
  'RESTORE',
]);
function diagnostic(stage, error) {
  const admittedStage = STAGES.includes(stage) ? stage : 'UNCLASSIFIED';
  let code = 'UNCLASSIFIED';
  try {
    const message = error instanceof Error ? error.message : undefined;
    if (CODES.includes(message)) code = message;
  } catch {}
  return `PERSISTENCE_MAINTENANCE_STAGE_${admittedStage}_CODE_${code}`;
}
module.exports = { CASES, VERSIONS, parse, STAGES, CODES, diagnostic };
