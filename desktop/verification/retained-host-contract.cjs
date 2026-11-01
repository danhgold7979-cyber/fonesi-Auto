'use strict';
const path = require('node:path');
const { write } = require('./persistence-restore-contract.cjs');
const { rootForLaunch } = require('./recipient-setup-contract.cjs');
const CASES = Object.freeze([
  'mainReady',
  'schema4Observed',
  'archiveProvisioned',
  'setupRetired',
  'actualRuntimeAdmitted',
  'parentReceiptBound',
  'versionObserved',
  'invocationRetired',
  'helperStarted',
  'helperRetired',
  'helperExitZero',
  'helperDirectoryRemoved',
  'mainClosed',
]);
const PHASES = Object.freeze([
  'PREPARE',
  'MIGRATION',
  'SETUP',
  'ADMISSION',
  'VERSION',
  'RETIRE',
  'CLOSE',
]);
const SCOPE = 'HOSTED_RETAINED_VERSION_SOURCE_ONLY';
const DIAGNOSTICS = Object.freeze({
  REASON: Object.freeze([
    'RETAINED_HOST_CONTEXT',
    'RETAINED_HOST_FILE',
    'RETAINED_HOST_SETUP',
    'RETAINED_HOST_TIMEOUT',
    'RETAINED_HOST_DIALOG',
    'RETAINED_HOST_TERMS_NOT_OPENED',
    'RETAINED_HOST_SCHEMA',
    'RETAINED_HOST_INITIAL',
    'RETAINED_HOST_PENDING',
    'RETAINED_HOST_CUSTODY',
    'RETAINED_HOST_RUNTIME',
    'RETAINED_HOST_PARENT',
    'RETAINED_HOST_VERSION',
    'RETAINED_HOST_RETIRE',
    'RETAINED_HOST_CASES',
    'RETAINED_HOST_PROFILE',
    'RETAINED_HOST_MAIN',
    'RETAINED_HOST_CLOSE',
    'OWNER_REVOKED',
    'HOST_FACTORY_REJECTED',
    'HOST_CONTEXT_REJECTED',
    'RECOVERY_REQUIRED',
    'FLEET_UI_SCHEMA4',
    'UNCLASSIFIED',
  ]),
  OUTCOME: Object.freeze([
    'NOT_DISPATCHED',
    'DISPATCHED_UNCONFIRMED',
    'OBSERVED',
    'OUTCOME_UNKNOWN',
    'UNAVAILABLE',
  ]),
  CODE: Object.freeze([
    'OK',
    'INVALID_REQUEST',
    'NOT_AUTHORIZED',
    'BINARY_UNAVAILABLE',
    'BUSY',
    'DEADLINE',
    'NOT_READY',
    'CUSTODY_REJECTED',
    'TRANSPORT_FAILED',
    'INVALID_OBSERVATION',
    'RECOVERY_REQUIRED',
    'CLOSED',
    'INTERNAL_FAILURE',
    'UNAVAILABLE',
  ]),
  HELPERSTATE: Object.freeze(['UNCERTAIN', 'EXITED', 'RUNNING', 'NOT_STARTED', 'UNAVAILABLE']),
  HELPERPHASE: Object.freeze([
    'ENVIRONMENT',
    'CONTEXT',
    'ASSETS',
    'COMPILE',
    'PARENT',
    'READER',
    'CLOSE',
    'UNAVAILABLE',
  ]),
  HELPEREXIT: Object.freeze(['ZERO', 'NONZERO', 'NONE', 'UNAVAILABLE']),
});
function reason(error) {
  try {
    const d = error && Object.getOwnPropertyDescriptor(error, 'message');
    return d && 'value' in d && DIAGNOSTICS.REASON.includes(d.value) ? d.value : 'UNCLASSIFIED';
  } catch {
    return 'UNCLASSIFIED';
  }
}

function exact(v, keys) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    JSON.stringify(Object.keys(v).sort()) !== JSON.stringify([...keys].sort())
  )
    throw Error('RETAINED_HOST_SCHEMA');
}
function validateResult(v) {
  exact(v, ['version', 'scope', 'cases', 'readyCount', 'closedCount']);
  exact(v.cases, CASES);
  if (
    v.version !== 1 ||
    v.scope !== SCOPE ||
    v.readyCount !== 1 ||
    v.closedCount !== 1 ||
    CASES.some((k) => typeof v.cases[k] !== 'boolean')
  )
    throw Error('RETAINED_HOST_SCHEMA');
  return Object.freeze({ passed: CASES.every((k) => v.cases[k]) });
}
const ANCHOR = 'const setup = platformToolsService;';
function deriveMain(raw, observerPath) {
  if (
    typeof raw !== 'string' ||
    Buffer.byteLength(raw) > 8388608 ||
    observerPath !== path.join(__dirname, 'retained-host-main-probe.cjs') ||
    raw.split(ANCHOR).length !== 2
  )
    throw Error('RETAINED_HOST_TRANSFORM');
  const inserted = `${ANCHOR}\nrequire(${JSON.stringify(observerPath)}).bindContext(Object.freeze({entry:ownedEntry,runtimeCustody,setup,assertOwnedSync:()=>{if(closing||resourcesDisposed)throw Error('OWNER_REVOKED');assertPreparedPersistenceLease(ownedEntry);}}));`;
  const derived = raw.replace(ANCHOR, inserted);
  if (derived.replace(inserted, ANCHOR) !== raw) throw Error('RETAINED_HOST_TRANSFORM');
  return derived;
}
module.exports = {
  DIAGNOSTICS,
  reason,
  CASES,
  PHASES,
  SCOPE,
  validateResult,
  deriveMain,
  write,
  rootForLaunch,
};
