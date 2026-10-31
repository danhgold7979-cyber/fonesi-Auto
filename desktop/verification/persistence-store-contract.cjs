'use strict';
const uuid = (v) =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const BOUNDARIES = ['BEFORE_COMMIT', 'AFTER_COMMIT'];
function parseControl(raw) {
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) return null;
    const v = JSON.parse(raw);
    if (
      v?.version !== 1 ||
      !['source', 'package'].includes(v.mode) ||
      !['crash', 'reopen'].includes(v.stage) ||
      !BOUNDARIES.includes(v.boundary) ||
      ![v.parentToken, v.ownerToken, v.storeId, v.fixtureId].every(uuid) ||
      typeof v.checkpoint !== 'string' ||
      !/^key-checkpoint-[0-9a-f-]{36}\.json$/.test(v.checkpoint) ||
      !uuid(v.checkpoint.slice(15, -5))
    )
      return null;
    const c = {
      version: 1,
      mode: v.mode,
      stage: v.stage,
      boundary: v.boundary,
      parentToken: v.parentToken,
      ownerToken: v.ownerToken,
      storeId: v.storeId,
      fixtureId: v.fixtureId,
      checkpoint: v.checkpoint,
    };
    return JSON.stringify(c) === raw ? Object.freeze(c) : null;
  } catch {
    return null;
  }
}
function parseDurabilityProof(raw) {
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) return null;
    const v = JSON.parse(raw);
    if (
      v?.version !== 1 ||
      ![v.storeId, v.backupId, v.locationId].every(uuid) ||
      typeof v.encryptedSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(v.encryptedSha256) ||
      v.state !== 'ORDERLY_AND_ABRUPT_RECOVERED'
    )
      return null;
    const p = {
      version: 1,
      storeId: v.storeId,
      backupId: v.backupId,
      locationId: v.locationId,
      encryptedSha256: v.encryptedSha256,
      state: v.state,
    };
    return JSON.stringify(p) === raw ? Object.freeze(p) : null;
  } catch {
    return null;
  }
}
const COMMON = [
  'profilePreparedBeforeReady',
  'leaseVerified',
  'prerequisiteAuthenticated',
  'primaryDatabaseUnchanged',
];
function caseNames(stage) {
  if (stage === 'crash') return [...COMMON, 'commitBoundaryReached'];
  if (stage === 'reopen')
    return [
      ...COMMON,
      'schemaVersionExpected',
      'historyExpected',
      'integrityValid',
      'migrationBusyDenied',
      'migrationReadOnlyDenied',
      'databaseClosed',
    ];
  throw new Error('STORE_STAGE');
}
function validateResult(raw) {
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) return null;
    const v = JSON.parse(raw);
    if (
      v?.version !== 1 ||
      !['source', 'package'].includes(v.mode) ||
      !['crash', 'reopen'].includes(v.stage) ||
      !BOUNDARIES.includes(v.boundary)
    )
      return null;
    const names = caseNames(v.stage);
    if (
      !v.cases ||
      Object.keys(v.cases).length !== names.length ||
      names.some((k) => typeof v.cases[k] !== 'boolean')
    )
      return null;
    const cases = Object.fromEntries(names.map((k) => [k, v.cases[k]]));
    const result = { version: 1, mode: v.mode, stage: v.stage, boundary: v.boundary, cases };
    return JSON.stringify(result) === raw ? Object.freeze(result) : null;
  } catch {
    return null;
  }
}
// Verification-only wrapper of the actual isolated connection. The callback must
// terminate the process; returning is always failure, never normal migration.
function installCommitCrash(connection, boundary, crash) {
  if (
    !BOUNDARIES.includes(boundary) ||
    typeof connection.exec !== 'function' ||
    typeof crash !== 'function'
  )
    throw new Error('STORE_HOOK');
  const original = connection.exec;
  let fired = false;
  connection.exec = function (sql) {
    if (sql === 'COMMIT' && !fired) {
      fired = true;
      if (boundary === 'BEFORE_COMMIT') {
        crash();
        throw new Error('STORE_CRASH_RETURNED');
      }
      original.call(this, sql);
      crash();
      throw new Error('STORE_CRASH_RETURNED');
    }
    return original.call(this, sql);
  };
  return () => {
    connection.exec = original;
  };
}
// Observation only: execute the unchanged method/SQL and rethrow the same error.
function observeReadOnlyWrite(connection, admitted, denied) {
  const original = connection.exec;
  connection.exec = function (sql) {
    try {
      return original.call(this, sql);
    } catch (error) {
      if (
        admitted() &&
        (sql === 'BEGIN IMMEDIATE' ||
          (typeof sql === 'string' && sql.startsWith('CREATE TABLE '))) &&
        error instanceof Error &&
        error.code === 'ERR_SQLITE_ERROR' &&
        error.errcode === 8
      )
        denied();
      throw error;
    }
  };
  return () => {
    connection.exec = original;
  };
}
module.exports = {
  parseControl,
  parseDurabilityProof,
  caseNames,
  validateResult,
  installCommitCrash,
  observeReadOnlyWrite,
};
