'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isNativeError } = require('node:util').types;
const nativeStackGetter = Object.getOwnPropertyDescriptor(new Error(), 'stack')?.get;
const initialStackFormatter = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
const initialErrorToString = Object.getOwnPropertyDescriptor(Error.prototype, 'toString').value;
const { write } = require('./persistence-restore-contract.cjs');
const { rootForLaunch: recipientRootForLaunch } = require('./recipient-setup-contract.cjs');
function rootForLaunch(launch) {
  const root = recipientRootForLaunch(launch);
  if (path.basename(root) !== 'r' || path.basename(path.dirname(root)) !== '.retained-host-runtime')
    throw Error('RETAINED_HOST_OWNER');
  return root;
}
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
  'PIPE_STARTUP',
  'VERSION',
  'RETIRE',
  'CLOSE',
]);
const SCOPE = 'HOSTED_RETAINED_VERSION_SOURCE_ONLY';
const PROGRESS = Object.freeze([
  'BOOTSTRAP_ENVIRONMENT',
  'BOOTSTRAP_CONTEXT',
  'BOOTSTRAP_ASSETS',
  'BOOTSTRAP_COMPILE_BEGIN',
  'BOOTSTRAP_COMPILE_END',
  'BOOTSTRAP_PARENT_BEGIN',
  'BOOTSTRAP_PARENT_END',
  'BOOTSTRAP_READER',
  'BOOTSTRAP_CLOSE',
  'READER_REQUEST_ACCEPTED',
  'READER_PROVIDER_ENTERED',
  'READER_RESPONSE_WRITE',
  'READER_RESPONSE_FLUSH',
  'NATIVE_ADMISSION',
  'NATIVE_LAUNCH',
  'NATIVE_LAUNCH_END',
  'NATIVE_EXIT',
  'NATIVE_RETIRE_BEGIN',
  'NATIVE_RETIRE_END',
]);
const PIPE_MODES = Object.freeze(['plainShort', 'plainDepth', 'parameterShort', 'parameterDepth']);
const PIPE_FIELDS = Object.freeze([
  'started',
  'requestWriteSettled',
  'entryBeforeEof',
  'stderrEntryBeforeEof',
  'responseBeforeEof',
  'progressBeforeEof',
  'entryAfterEof',
  'responseAfterEof',
  'progressAfterEof',
  'eofDelivered',
  'exitZero',
  'stdioRetired',
  'directoryCleanup',
]);
const PIPE_INPUTS = Object.freeze(['Q', 'EOF', 'OTHER', 'UNAVAILABLE']);
const PIPE_OUTCOMES = Object.freeze([
  'COMPLETE',
  'EOF_REQUIRED',
  'OUTPUT_REJECTED',
  'SPAWN_FAILED',
  'UNRETIRED',
  'UNAVAILABLE',
]);
const PIPE_DIAGNOSTICS = Object.freeze(
  Object.fromEntries(
    PIPE_MODES.flatMap((mode) => [
      ...PIPE_FIELDS.map((field) => [
        `PIPE_${mode.toUpperCase()}_${field.toUpperCase()}`,
        Object.freeze(['YES', 'NO', 'UNAVAILABLE']),
      ]),
      [`PIPE_${mode.toUpperCase()}_INPUT`, PIPE_INPUTS],
      [`PIPE_${mode.toUpperCase()}_OUTCOME`, PIPE_OUTCOMES],
    ]),
  ),
);
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
    'RETAINED_HOST_PIPE_STARTUP',
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
  COMPILEID: Object.freeze([
    'SOURCE_CODE_ERROR',
    'COMPILER_ERRORS',
    'ASSEMBLY_NOT_FOUND',
    'ASSEMBLY_LOAD_ERRORS',
    'COMMAND_NOT_FOUND',
    'PARAMETER_BINDING',
    'OTHER',
    'UNAVAILABLE',
  ]),
  COMPILETYPE: Object.freeze([
    'IO',
    'PATH_TOO_LONG',
    'ACCESS',
    'WIN32',
    'EXTERNAL',
    'DIRECTORY_NOT_FOUND',
    'INVALID_OPERATION',
    'ARGUMENT',
    'FILE_NOT_FOUND',
    'FILE_LOAD',
    'BAD_IMAGE',
    'CMDLET',
    'COMMAND_NOT_FOUND',
    'PARAMETER_BINDING',
    'OTHER',
    'NONE',
    'UNAVAILABLE',
  ]),
  COMPILEINNER: Object.freeze([
    'IO',
    'PATH_TOO_LONG',
    'ACCESS',
    'WIN32',
    'EXTERNAL',
    'DIRECTORY_NOT_FOUND',
    'INVALID_OPERATION',
    'ARGUMENT',
    'FILE_NOT_FOUND',
    'FILE_LOAD',
    'BAD_IMAGE',
    'CMDLET',
    'COMMAND_NOT_FOUND',
    'PARAMETER_BINDING',
    'OTHER',
    'NONE',
    'UNAVAILABLE',
  ]),
  COMPILECS: Object.freeze(['NONE', 'OTHER', 'UNAVAILABLE']),
  CONTEXTSITE: Object.freeze([
    ...Array.from({ length: 64 }, (_, i) => `SITE_${String(i + 1).padStart(2, '0')}`),
    'UNAVAILABLE',
  ]),
  CONTEXTCALLER: Object.freeze([
    'createHostFactory',
    'readHostContext',
    'hostRead',
    'imageDigest',
    'hostRecord',
    'hostPlain',
    'fence',
    'UNAVAILABLE',
  ]),
  SYSTEMREGULAR: Object.freeze(['YES', 'NO', 'UNAVAILABLE']),
  SYSTEMREPARSE: Object.freeze(['YES', 'NO', 'UNAVAILABLE']),
  SYSTEMSINGLELINK: Object.freeze(['YES', 'NO', 'UNAVAILABLE']),
  SYSTEMCANONICAL: Object.freeze(['YES', 'NO', 'UNAVAILABLE']),
  ...PIPE_DIAGNOSTICS,
  REQUESTWRITE: Object.freeze(['YES', 'NO', 'UNAVAILABLE']),
  ...Object.fromEntries(
    PROGRESS.map((name) => [`PROGRESS_${name}`, Object.freeze(['YES', 'NO', 'UNAVAILABLE'])]),
  ),
});
function diagnosticValue(slot, value) {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    (DIAGNOSTICS[slot]?.includes(value) ||
      (slot === 'COMPILECS' && value.length === 6 && /^CS[0-9]{4}$/.test(value)))
  );
}
function compileDiagnostic(evidence) {
  const out = {
    COMPILEID: 'UNAVAILABLE',
    COMPILETYPE: 'UNAVAILABLE',
    COMPILEINNER: 'UNAVAILABLE',
    COMPILECS: 'UNAVAILABLE',
  };
  try {
    if (!evidence || typeof evidence !== 'object') return out;
    const d = Object.getOwnPropertyDescriptor(evidence, 'compileFailure');
    if (
      !d ||
      !('value' in d) ||
      !d.value ||
      typeof d.value !== 'object' ||
      !Object.isFrozen(d.value)
    )
      return out;
    const value = d.value,
      fields = { id: 'COMPILEID', type: 'COMPILETYPE', inner: 'COMPILEINNER', cs: 'COMPILECS' },
      accepted = {};
    if (Reflect.ownKeys(value).length !== 4) return out;
    for (const [key, slot] of Object.entries(fields)) {
      const item = Object.getOwnPropertyDescriptor(value, key);
      if (
        !item ||
        !('value' in item) ||
        !diagnosticValue(slot, item.value) ||
        item.value === 'UNAVAILABLE'
      )
        return out;
      accepted[slot] = item.value;
    }
    return accepted;
  } catch {
    return out;
  }
}
function pipeDiagnostic(pair) {
  const out = Object.fromEntries(Object.keys(PIPE_DIAGNOSTICS).map((k) => [k, 'UNAVAILABLE']));
  for (const mode of PIPE_MODES) {
    const label = mode.toUpperCase();
    try {
      const d =
        pair && typeof pair === 'object' ? Object.getOwnPropertyDescriptor(pair, mode) : null;
      if (!d || !('value' in d) || !d.value || typeof d.value !== 'object') continue;
      const keys = Reflect.ownKeys(d.value);
      if (
        keys.length !== PIPE_FIELDS.length + 2 ||
        keys.some((k) => !PIPE_FIELDS.includes(k) && k !== 'outcome' && k !== 'input')
      )
        continue;
      const values = {};
      let valid = true;
      for (const field of [...PIPE_FIELDS, 'input', 'outcome']) {
        const item = Object.getOwnPropertyDescriptor(d.value, field);
        if (
          !item ||
          !('value' in item) ||
          (field === 'outcome'
            ? !PIPE_OUTCOMES.slice(0, -1).includes(item.value)
            : field === 'input'
              ? !PIPE_INPUTS.includes(item.value)
              : typeof item.value !== 'boolean')
        ) {
          valid = false;
          break;
        }
        values[field] = item.value;
      }
      if (!valid) continue;
      for (const field of PIPE_FIELDS)
        out[`PIPE_${label}_${field.toUpperCase()}`] = values[field] ? 'YES' : 'NO';
      out[`PIPE_${label}_INPUT`] = values.input;
      out[`PIPE_${label}_OUTCOME`] = values.outcome;
    } catch {
      /* fixed unavailable diagnostic only */
    }
  }
  return out;
}
// Diagnostic only. Exact observed progress never grants authority or changes acceptance.
function progressDiagnostic(evidence) {
  const out = Object.fromEntries(
    ['REQUESTWRITE', ...PROGRESS.map((name) => `PROGRESS_${name}`)].map((name) => [
      name,
      'UNAVAILABLE',
    ]),
  );
  try {
    if (!evidence || typeof evidence !== 'object') return out;
    const write = Object.getOwnPropertyDescriptor(evidence, 'requestWriteCompleted');
    if (write && 'value' in write && typeof write.value === 'boolean')
      out.REQUESTWRITE = write.value ? 'YES' : 'NO';
    const d = Object.getOwnPropertyDescriptor(evidence, 'progress');
    if (!d || !('value' in d) || !Array.isArray(d.value)) return out;
    const length = Object.getOwnPropertyDescriptor(d.value, 'length');
    if (
      !length ||
      !('value' in length) ||
      !Number.isInteger(length.value) ||
      length.value < 0 ||
      length.value > PROGRESS.length ||
      !Object.isFrozen(d.value)
    )
      return out;
    const values = [];
    for (let i = 0; i < length.value; i++) {
      const item = Object.getOwnPropertyDescriptor(d.value, String(i));
      if (
        !item ||
        !('value' in item) ||
        !PROGRESS.includes(item.value) ||
        values.includes(item.value)
      )
        return out;
      values.push(item.value);
    }
    if (Reflect.ownKeys(d.value).length !== values.length + 1) return out;
    for (const name of PROGRESS) out[`PROGRESS_${name}`] = values.includes(name) ? 'YES' : 'NO';
  } catch {
    /* unavailable diagnostic only */
  }
  return out;
}
function reason(error) {
  try {
    const d = error && Object.getOwnPropertyDescriptor(error, 'message');
    return d && 'value' in d && DIAGNOSTICS.REASON.includes(d.value) ? d.value : 'UNCLASSIFIED';
  } catch {
    return 'UNCLASSIFIED';
  }
}

// Diagnostic only: never echo a stack/path/line, and never use this as admission.
function contextDiagnostic(error, source, file, digest, system) {
  const out = Object.fromEntries(
    [
      'CONTEXTSITE',
      'CONTEXTCALLER',
      'SYSTEMREGULAR',
      'SYSTEMREPARSE',
      'SYSTEMSINGLELINK',
      'SYSTEMCANONICAL',
    ].map((k) => [k, 'UNAVAILABLE']),
  );
  try {
    if (
      reason(error) !== 'HOST_CONTEXT_REJECTED' ||
      typeof source !== 'string' ||
      Buffer.byteLength(source) > 8388608 ||
      typeof file !== 'string' ||
      !/^[0-9a-f]{64}$/.test(digest) ||
      createHash('sha256').update(source).digest('hex') !== digest
    )
      return out;
    const formatter = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
    if (
      !isNativeError(error) ||
      formatter?.get ||
      formatter?.set ||
      formatter?.value !== initialStackFormatter?.value
    )
      return out;
    if (
      Object.getPrototypeOf(error) !== Error.prototype ||
      Object.getOwnPropertyDescriptor(error, 'toString') ||
      Object.getOwnPropertyDescriptor(error, Symbol.toPrimitive)
    )
      return out;
    for (const [object, key, expected] of [
      [Error.prototype, 'name', 'Error'],
      [Error.prototype, 'message', ''],
      [Error.prototype, 'toString', initialErrorToString],
      [error, 'message', 'HOST_CONTEXT_REJECTED'],
    ]) {
      const d = Object.getOwnPropertyDescriptor(object, key);
      if (!d || !('value' in d) || d.value !== expected) return out;
    }
    const name = Object.getOwnPropertyDescriptor(error, 'name');
    if (name && (!('value' in name) || name.value !== 'Error')) return out;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'stack');
    let stack;
    if (descriptor && 'value' in descriptor) stack = descriptor.value;
    else if (descriptor?.get === nativeStackGetter && typeof nativeStackGetter === 'function')
      stack = nativeStackGetter.call(error);
    if (typeof stack !== 'string' || stack.length > 32768) return out;
    const lines = stack.split(/\r?\n/);
    if (lines[0] !== 'Error: HOST_CONTEXT_REJECTED' || lines.length > 32) return out;
    const frames = [];
    for (const line of lines.slice(1)) {
      const m = /^ {4}at ([A-Za-z0-9_.]+) \((.*):(\d+):(\d+)\)$/.exec(line);
      if (m && m[2] === file)
        frames.push({ name: m[1].replace(/^Object\./, ''), row: Number(m[3]) });
    }
    const rows = source.split('\n');
    if (
      frames.length < 2 ||
      frames[0].name !== 'reject' ||
      !rows[frames[0].row - 1]?.includes('throw Error("HOST_CONTEXT_REJECTED")')
    )
      return out;
    const sites = rows.flatMap((line, i) => (/\breject\(\);/.test(line) ? [i + 1] : []));
    const index = sites.indexOf(frames[1].row);
    if (sites.length > 64 || index < 0) return out;
    out.CONTEXTSITE = `SITE_${String(index + 1).padStart(2, '0')}`;
    if (DIAGNOSTICS.CONTEXTCALLER.includes(frames[2]?.name)) out.CONTEXTCALLER = frames[2].name;
    // These are present-time observations, not claims about the earlier failed stat.
    for (const key of ['SYSTEMREGULAR', 'SYSTEMREPARSE', 'SYSTEMSINGLELINK', 'SYSTEMCANONICAL']) {
      const d = system && Object.getOwnPropertyDescriptor(system, key);
      if (d && 'value' in d && typeof d.value === 'boolean') out[key] = d.value ? 'YES' : 'NO';
    }
  } catch {
    /* fixed unavailable fields only */
  }
  return out;
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
  PIPE_MODES,
  PIPE_FIELDS,
  PIPE_DIAGNOSTICS,
  pipeDiagnostic,
  PROGRESS,
  progressDiagnostic,
  compileDiagnostic,
  diagnosticValue,
  DIAGNOSTICS,
  contextDiagnostic,
  reason,
  CASES,
  PHASES,
  SCOPE,
  validateResult,
  deriveMain,
  write,
  rootForLaunch,
};
