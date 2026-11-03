'use strict';
const STAGES = Object.freeze([
  'create',
  'replace',
  'denied',
  'missing',
  'corrupt',
  'delete',
  'deleted',
]);
const CASES = Object.freeze([
  'profileBeforeReady',
  'leaseVerified',
  'providerBound',
  'operationVerified',
  'referenceDenial',
  'auditFlushed',
  'auditCanonical',
  'canaryAbsent',
  'closed',
]);
const VERSIONS = Object.freeze({ electron: '45.1.0', node: '24.22.1', chrome: '156.0.8078.49' });
const uuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function exact(v, keys) {
  if (
    v === null ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    JSON.stringify(Object.keys(v)) !== JSON.stringify(keys)
  )
    throw new Error('INVALID');
}
function control(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) throw new Error('INVALID');
  const v = JSON.parse(raw);
  exact(v, ['version', 'mode', 'stage', 'parentToken', 'ownerToken', 'storeId', 'checkpoint']);
  if (
    JSON.stringify(v) !== raw ||
    v.version !== 1 ||
    !['source', 'package'].includes(v.mode) ||
    !STAGES.includes(v.stage) ||
    ![v.parentToken, v.ownerToken, v.storeId].every(uuid) ||
    typeof v.checkpoint !== 'string' ||
    !/^key-checkpoint-[0-9a-f-]{36}\.json$/.test(v.checkpoint) ||
    !uuid(v.checkpoint.slice(15, -5))
  )
    throw new Error('INVALID');
  return v;
}
function result(raw, mode, stage) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) throw new Error('INVALID');
  const v = JSON.parse(raw);
  exact(v, ['version', 'mode', 'stage', 'versions', 'cases', 'recordCount', 'accessDeniedCode']);
  exact(v.versions, Object.keys(VERSIONS));
  exact(v.cases, CASES);
  if (
    JSON.stringify(v) !== raw ||
    v.version !== 1 ||
    v.mode !== mode ||
    v.stage !== stage ||
    !['source', 'package'].includes(mode) ||
    !STAGES.includes(stage) ||
    JSON.stringify(v.versions) !== JSON.stringify(VERSIONS) ||
    CASES.some((k) => typeof v.cases[k] !== 'boolean') ||
    !Number.isInteger(v.recordCount) ||
    v.recordCount < 1 ||
    v.recordCount > 128 ||
    (stage === 'denied'
      ? !['EACCES', 'EPERM', 'EBUSY'].includes(v.accessDeniedCode)
      : v.accessDeniedCode !== null)
  )
    throw new Error('INVALID');
  return { ...v, passed: CASES.every((k) => v.cases[k]) };
}
function auditMatches(records, expected) {
  if (
    !Array.isArray(records) ||
    records.length < 1 ||
    records.length > 128 ||
    !Array.isArray(expected) ||
    expected.length < 1 ||
    expected.length > 128
  )
    return false;
  const runId = records[0].runId,
    sequences = new Set();
  for (const record of records) {
    if (
      !uuid(runId) ||
      record.runId !== runId ||
      !Number.isSafeInteger(record.sequence) ||
      record.sequence < 1 ||
      sequences.has(record.sequence)
    )
      return false;
    sequences.add(record.sequence);
  }
  const ordered = records
    .filter((v) => v.schemaVersion === 2)
    .sort((a, b) => a.sequence - b.sequence);
  return (
    ordered.length === expected.length &&
    ordered.every((v, i) =>
      ['operation', 'phase', 'diagnosticId', 'secretId', 'revision', 'code'].every(
        (k) => v[k] === expected[i][k],
      ),
    )
  );
}
module.exports = { STAGES, CASES, VERSIONS, uuid, exact, control, result, auditMatches };
