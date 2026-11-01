'use strict';
// Verification-only actual main/Help campaign; historical retained factory schema is unchanged.
const path = require('node:path');
const { write, rootForLaunch } = require('./retained-host-contract.cjs');
const SCOPE = 'HOSTED_MAIN_RUNTIME_VERSION_SOURCE_ONLY';
const CASES = Object.freeze([
  'mainReady',
  'schema4Observed',
  'archiveProvisioned',
  'setupRetired',
  'readOnlyNoHelper',
  'versionControlsPresent',
  'pendingAcknowledged',
  'versionVerified',
  'installationBound',
  'schema7Intents',
  'schema7Result',
  'helperAbsent',
  'serviceRetired',
  'mainClosed',
]);
const PHASES = Object.freeze([
  'PREPARE',
  'MIGRATION',
  'SETUP',
  'HELP',
  'READ',
  'VERIFY',
  'RECONCILE',
  'RETIRE',
  'CLOSE',
]);
const REASONS = Object.freeze([
  'CONTEXT',
  'FILE',
  'MAIN',
  'SCHEMA',
  'SETUP',
  'CUSTODY',
  'DIALOG',
  'TERMS_NOT_OPENED',
  'UI_CONTROL',
  'RESPONSE',
  'PENDING',
  'VERIFY',
  'BINDING',
  'READ_LIMIT',
  'TIMEOUT',
  'CASES',
  'CLOSE',
  'UNCLASSIFIED',
]);
const uuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v) => Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
function exact(v, keys) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getOwnPropertySymbols(v).length)
    throw Error('MAIN_RUNTIME_SCHEMA');
  const d = Object.getOwnPropertyDescriptors(v);
  if (
    Object.keys(d).length !== keys.length ||
    keys.some((k) => !d[k] || !Object.hasOwn(d[k], 'value') || !d[k].enumerable)
  )
    throw Error('MAIN_RUNTIME_SCHEMA');
}
function validate(v, observed) {
  exact(v, ['version', 'scope', 'cases', 'readyCount', 'closedCount']);
  exact(v.cases, CASES);
  if (
    v.version !== 1 ||
    v.scope !== SCOPE ||
    v.readyCount !== 1 ||
    v.closedCount !== 1 ||
    CASES.some((k) => typeof v.cases[k] !== 'boolean')
  )
    throw Error('MAIN_RUNTIME_SCHEMA');
  return Object.freeze({
    passed: CASES.every(
      (k) => v.cases[k] === !(observed && ['schema7Intents', 'schema7Result'].includes(k)),
    ),
  });
}
const validateObserved = (v) => validate(v, true),
  validateResult = (v) => validate(v, false);
function validateBinding(v) {
  exact(v, [
    'version',
    'operationId',
    'installationRevision',
    'expectedRevision',
    'pendingRevision',
    'verifiedRevision',
    'reads',
    'requestId',
  ]);
  if (
    v.version !== 1 ||
    !uuid(v.operationId) ||
    !integer(v.installationRevision) ||
    v.installationRevision < 1 ||
    !integer(v.expectedRevision) ||
    !integer(v.pendingRevision) ||
    !integer(v.verifiedRevision) ||
    v.expectedRevision >= v.pendingRevision ||
    v.pendingRevision >= v.verifiedRevision ||
    !integer(v.reads) ||
    v.reads < 1 ||
    v.reads > 41 ||
    typeof v.requestId !== 'string' ||
    !/^p[1-9][0-9]{0,15}$/.test(v.requestId) ||
    !Number.isSafeInteger(Number(v.requestId.slice(1)))
  )
    throw Error('MAIN_RUNTIME_BINDING');
  return v;
}
function response(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384)
    throw Error('MAIN_RUNTIME_RESPONSE');
  const v = JSON.parse(raw);
  if (JSON.stringify(v) !== raw) throw Error('MAIN_RUNTIME_RESPONSE');
  exact(v, ['version', 'requestId', 'ok', 'outcome', 'snapshot', 'diagnosticId', 'loggingHealth']);
  if (
    v.version !== 1 ||
    v.ok !== true ||
    !['OBSERVED', 'PENDING'].includes(v.outcome) ||
    !uuid(v.diagnosticId) ||
    !['AVAILABLE', 'DEGRADED'].includes(v.loggingHealth) ||
    typeof v.requestId !== 'string' ||
    !/^p[1-9][0-9]{0,15}$/.test(v.requestId) ||
    !Number.isSafeInteger(Number(v.requestId.slice(1)))
  )
    throw Error('MAIN_RUNTIME_RESPONSE');
  const s = v.snapshot;
  exact(s, [
    'revision',
    'installationRevision',
    'state',
    'operationId',
    'code',
    'candidateVersion',
    'verifiedAtUtc',
  ]);
  if (
    !integer(s.revision) ||
    !integer(s.installationRevision) ||
    s.installationRevision < 1 ||
    s.candidateVersion !== '37.0.1' ||
    !['IDLE', 'PENDING', 'VERIFIED'].includes(s.state) ||
    s.code !== null
  )
    throw Error('MAIN_RUNTIME_RESPONSE');
  if (
    s.state === 'PENDING'
      ? !uuid(s.operationId) || s.verifiedAtUtc !== null
      : s.operationId !== null ||
        (s.state === 'VERIFIED' ? !integer(s.verifiedAtUtc) : s.verifiedAtUtc !== null)
  )
    throw Error('MAIN_RUNTIME_RESPONSE');
  if (v.outcome === 'PENDING' && s.state !== 'PENDING') throw Error('MAIN_RUNTIME_RESPONSE');
  return v;
}
const ANCHOR = 'const setup = platformToolsService;';
function deriveMain(raw, observerPath) {
  if (
    typeof raw !== 'string' ||
    Buffer.byteLength(raw) > 8388608 ||
    observerPath !== path.join(__dirname, 'main-runtime-version-probe.cjs') ||
    raw.split(ANCHOR).length !== 2
  )
    throw Error('MAIN_RUNTIME_MAIN');
  const inserted = `${ANCHOR}\nrequire(${JSON.stringify(observerPath)}).bindContext(Object.freeze({entry:ownedEntry,runtimeCustody,setup,versionService,assertOwnedSync:()=>{if(closing||resourcesDisposed)throw Error('OWNER_REVOKED');assertPreparedPersistenceLease(ownedEntry);}}));`;
  const derived = raw.replace(ANCHOR, inserted);
  if (derived.replace(inserted, ANCHOR) !== raw) throw Error('MAIN_RUNTIME_MAIN');
  return derived;
}
function reason(error) {
  try {
    const d = Object.getOwnPropertyDescriptor(error, 'message');
    if (
      d &&
      Object.hasOwn(d, 'value') &&
      typeof d.value === 'string' &&
      d.value.startsWith('MAIN_RUNTIME_')
    ) {
      const r = d.value.slice(13);
      if (REASONS.includes(r)) return r;
    }
  } catch {}
  return 'UNCLASSIFIED';
}
module.exports = {
  SCOPE,
  CASES,
  PHASES,
  REASONS,
  validateObserved,
  validateResult,
  validateBinding,
  response,
  deriveMain,
  write,
  rootForLaunch,
  reason,
};
