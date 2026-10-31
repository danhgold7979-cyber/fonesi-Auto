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
  'RESTORE_SERVICE',
  'RESTORE_COPY',
  'RESTORE_METADATA',
  'RESTORE_VALIDATE',
  'CLOSE',
  'RESULT',
]);
const CODES = Object.freeze([
  'DATABASE_LOCATION_REJECTED',
  'DATABASE_INVALID',
  'DATABASE_SCHEMA_MISMATCH',
  'DATABASE_FILE_REJECTED',
  'DATABASE_MISSING',
  'IO_FAILED',
  'AUTHENTICATION_FAILED',
  'KEY_UNAVAILABLE',

  'ENOENT',
  'EACCES',
  'EPERM',
  'ENAMETOOLONG',
  'ERR_SQLITE_ERROR',
  'SQLITE_READONLY',
  'SQLITE_CANTOPEN',
  'SQLITE_FULL',
  'SQLITE_BUSY',
  'RESTORE_ADMISSION_REJECTED',
  'RESTORE_BACKUP_UNKNOWN',
  'RESTORE_KEY_CHECKPOINT_REJECTED',
  'RESTORE_QUARANTINE_REQUIRED',
  'BACKUP_ID_REJECTED',
  'BACKUP_IDENTITY_MISMATCH',
  'BACKUP_RECEIPT_MISMATCH',
  'BACKUP_RECEIPT_REJECTED',
  'BACKUP_RECEIPT_LIMIT',
  'BACKUP_BUSY_OR_LOCATION',
  'BACKUP_OWNER_REJECTED',
  'BACKUP_PREREQUISITE_REJECTED',
  'BACKUP_SELECTION_REJECTED',
  'BACKUP_LOCATION_REPLACED',
  'BACKUP_LOCATION_REQUIRED',
  'BACKUP_CATALOG_LIMIT',
  'BACKUP_CATALOG_REJECTED',
  'PERSISTENCE_FILES_REJECTED',

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
    if (error instanceof Error) {
      const native = error.code;
      if (['ENOENT', 'EACCES', 'EPERM', 'ENAMETOOLONG'].includes(native)) code = native;
      else if (native === 'ERR_SQLITE_ERROR') {
        code = 'ERR_SQLITE_ERROR';
        const sqlite = new Map([
          [8, 'SQLITE_READONLY'],
          [14, 'SQLITE_CANTOPEN'],
          [13, 'SQLITE_FULL'],
          [5, 'SQLITE_BUSY'],
        ]);
        if (sqlite.has(error.errcode)) code = sqlite.get(error.errcode);
      } else if (CODES.includes(error.message)) code = error.message;
    }
  } catch {}
  return `PERSISTENCE_MAINTENANCE_STAGE_${admittedStage}_CODE_${code}`;
}
async function traceRestore(service, setStage, operation) {
  const originalRestore = service.restore;
  const originalCopy = service.backups.restoreToNew;
  service.restore = async function (...args) {
    setStage('RESTORE_SERVICE');
    return Reflect.apply(originalRestore, this, args);
  };
  service.backups.restoreToNew = async function (...args) {
    setStage('RESTORE_COPY');
    const value = await Reflect.apply(originalCopy, this, args);
    setStage('RESTORE_METADATA');
    return value;
  };
  try {
    return await operation();
  } finally {
    service.restore = originalRestore;
    service.backups.restoreToNew = originalCopy;
  }
}
module.exports = { CASES, VERSIONS, parse, STAGES, CODES, diagnostic, traceRestore };
