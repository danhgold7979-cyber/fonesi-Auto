// Fixed synthetic-only qualification schema. No production authority or device identifiers.
export const VIDEO_QUALIFICATION_SCOPE = 'ELECTRON_H264_SYNTHETIC_TILE_ONLY';
export const VIDEO_QUALIFICATION_CASES = Object.freeze([
  'secureOrigin',
  'sandbox',
  'explicitStart',
  'portReady',
  'landscapeDecoded',
  'landscapePlacement',
  'rotationCleared',
  'portraitDecoded',
  'portraitPlacement',
  'staleRejected',
  'stopCleared',
  'singleOwnerStop',
  'windowClosed',
]);
export const VIDEO_QUALIFICATION_INPUTS = Object.freeze([
  'productionManifest',
  'probe',
  'fixture',
  'contract',
  'builder',
  'control',
  'runner',
  'installer',
  'runtimeControl',
  'boundary',
  'ownedFiles',
  'supervisor',
  'runtimeManifest',
  'executable',
]);
export function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = Object.getOwnPropertyDescriptors(value);
  return (
    Reflect.ownKeys(d).length === keys.length &&
    keys.every((key) => d[key]?.enumerable && Object.hasOwn(d[key], 'value'))
  );
}
const hash = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export function validInputs(value) {
  return (
    exact(value, VIDEO_QUALIFICATION_INPUTS) &&
    VIDEO_QUALIFICATION_INPUTS.every((k) => hash(value[k]))
  );
}
export function validPixels(value) {
  return (
    exact(value, ['width', 'height', 'dark', 'light', 'letterbox', 'box', 'tile']) &&
    ((value.width === 32 && value.height === 16) || (value.width === 16 && value.height === 32)) &&
    [value.dark, value.light].every(
      (v) =>
        Array.isArray(v) &&
        v.length === 4 &&
        v.every((n) => Number.isInteger(n) && n >= 0 && n <= 255),
    ) &&
    value.dark.slice(0, 3).every((n) => n <= 8) &&
    value.light.slice(0, 3).every((n) => n >= 247) &&
    [value.box, value.tile].every(
      (v) =>
        Array.isArray(v) &&
        v.length === 4 &&
        v.every((n) => Number.isFinite(n) && n >= 0 && n <= 3200) &&
        v[2] > 0 &&
        v[3] > 0,
    ) &&
    Array.isArray(value.letterbox) &&
    value.letterbox.length === 4 &&
    value.letterbox.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    Math.max(...value.letterbox.slice(0, 3)) >= 245 &&
    Math.min(...value.letterbox.slice(0, 3)) >= 225 &&
    Math.max(...value.letterbox.slice(0, 3)) - Math.min(...value.letterbox.slice(0, 3)) >= 3 &&
    value.letterbox[3] === 255 &&
    value.dark[3] === 255 &&
    value.light[3] === 255
  );
}
export function validateVideoQualification(value) {
  return (
    exact(value, [
      'version',
      'scope',
      'head',
      'electron',
      'node',
      'inputs',
      'cases',
      'landscape',
      'portrait',
    ]) &&
    value.version === 1 &&
    value.scope === VIDEO_QUALIFICATION_SCOPE &&
    typeof value.head === 'string' &&
    /^[0-9a-f]{40}$/.test(value.head) &&
    value.electron === '45.1.0' &&
    value.node === '24.22.1' &&
    validInputs(value.inputs) &&
    exact(value.cases, VIDEO_QUALIFICATION_CASES) &&
    VIDEO_QUALIFICATION_CASES.every((k) => value.cases[k] === true) &&
    validPixels(value.landscape) &&
    value.landscape.width === 32 &&
    validPixels(value.portrait) &&
    value.portrait.width === 16
  );
}

export const VIDEO_DIAGNOSTIC_STAGES = Object.freeze([
  'ADMISSION',
  'READY',
  'LOAD',
  'START_BUTTON',
  'PORT',
  'LANDSCAPE_MEDIA',
  'LANDSCAPE_OUTPUT',
  'ROTATION',
  'PORTRAIT_MEDIA',
  'PORTRAIT_OUTPUT',
  'STOP',
  'STALE',
  'CLOSE',
]);
const diagnosticFailureReasons = Object.freeze([
  'ADMISSION',
  'DEADLINE',
  'CLOCK',
  'STATE_CALLBACK',
  'DELIVERY',
  'CONFIGURATION',
  'CAPABILITY',
  'SUBMISSION',
  'NATIVE_ERROR',
  'OUTPUT_IDENTITY',
  'OUTPUT_GEOMETRY',
  'PAINT',
  'PAINT_ACK',
  'FRAME_CLOSE',
  'UNCLASSIFIED',
  'UNOBSERVED',
]);
export const VIDEO_DIAGNOSTIC_STATES = Object.freeze([
  ...diagnosticFailureReasons.flatMap((reason) =>
    ['STOPPING', 'STOPPED', 'UNCERTAIN'].map((state) => `DECODE_FAILED:${reason} / ${state}`),
  ),
  'UNOBSERVED',
  'UNRECOGNIZED',
  'STARTING',
  'WAITING_KEY',
  'DISPLAYING',
  'DECODING',
  'DECODE_FAILED / STOPPED',
  'DECODER_UNAVAILABLE / STOPPED',
  'DECODE_FAILED / STOPPING',
  'DECODER_UNAVAILABLE / STOPPING',
  'DECODE_FAILED / UNCERTAIN',
  'DECODER_UNAVAILABLE / UNCERTAIN',
  'STOPPING',
  'STOPPED',
  'DECODER_UNAVAILABLE',
  'DECODE_FAILED',
  'UNCERTAIN',
]);
export function validateVideoDiagnostic(v) {
  return (
    exact(v, ['version', 'scope', 'head', 'inputs', 'stage', 'rendererState', 'cases']) &&
    v.version === 1 &&
    v.scope === VIDEO_QUALIFICATION_SCOPE &&
    typeof v.head === 'string' &&
    /^[0-9a-f]{40}$/.test(v.head) &&
    validInputs(v.inputs) &&
    VIDEO_DIAGNOSTIC_STAGES.includes(v.stage) &&
    VIDEO_DIAGNOSTIC_STATES.includes(v.rendererState) &&
    exact(v.cases, VIDEO_QUALIFICATION_CASES) &&
    VIDEO_QUALIFICATION_CASES.every((k) => typeof v.cases[k] === 'boolean')
  );
}
function retiredProcess(p) {
  return (
    p !== null &&
    p.cleanupComplete === true &&
    p.exitCode !== null &&
    ['SUCCESS', 'NONZERO_EXIT', 'EMPTY_OUTPUT'].includes(p.status)
  );
}
export function validateVideoSupervisor(v) {
  if (
    !exact(v, [
      'version',
      'scope',
      'head',
      'process',
      'directoryCleanup',
      'cleanupFailure',
      'passed',
      'failure',
    ]) ||
    v.version !== 1 ||
    v.scope !== VIDEO_QUALIFICATION_SCOPE ||
    typeof v.head !== 'string' ||
    !/^[0-9a-f]{40}$/.test(v.head) ||
    typeof v.directoryCleanup !== 'boolean' ||
    typeof v.passed !== 'boolean' ||
    ![null, 'CLEANUP_FAILED', 'RETIREMENT_UNCONFIRMED'].includes(v.cleanupFailure) ||
    ![
      null,
      'PREPARE_FAILED',
      'INSTALL_FAILED',
      'CONTROL_FAILED',
      'DECODE_FAILED',
      'CLEANUP_FAILED',
    ].includes(v.failure)
  )
    return false;
  const p = v.process;
  if (p !== null) {
    if (
      !exact(p, ['status', 'exitCode', 'cleanupComplete', 'stdoutTruncated', 'stderrTruncated']) ||
      ![
        'SUCCESS',
        'NONZERO_EXIT',
        'TIMEOUT',
        'CAPTURE_FAILED',
        'LAUNCH_FAILED',
        'ACCESS_DENIED',
        'CLEANUP_FAILED',
        'EMPTY_OUTPUT',
      ].includes(p.status) ||
      !['cleanupComplete', 'stdoutTruncated', 'stderrTruncated'].every(
        (k) => typeof p[k] === 'boolean',
      ) ||
      (p.exitCode !== null &&
        (!Number.isInteger(p.exitCode) || p.exitCode < -2147483648 || p.exitCode > 2147483647))
    )
      return false;
    if (
      (['TIMEOUT', 'LAUNCH_FAILED', 'ACCESS_DENIED'].includes(p.status) && p.exitCode !== null) ||
      (p.status === 'CLEANUP_FAILED' && p.cleanupComplete) ||
      (['SUCCESS', 'EMPTY_OUTPUT'].includes(p.status) && p.exitCode !== 0) ||
      (p.status === 'NONZERO_EXIT' && (p.exitCode === null || p.exitCode === 0))
    )
      return false;
  }
  if (v.directoryCleanup && p !== null && !retiredProcess(p)) return false;
  if (v.passed)
    return (
      p?.status === 'SUCCESS' &&
      p.exitCode === 0 &&
      p.cleanupComplete &&
      !p.stdoutTruncated &&
      !p.stderrTruncated &&
      v.directoryCleanup &&
      v.cleanupFailure === null &&
      v.failure === null
    );
  return v.failure !== null || v.cleanupFailure !== null;
}
export function validateVideoEvidence(v) {
  if (
    !exact(v, ['version', 'scope', 'head', 'supervisor', 'diagnostic', 'result']) ||
    v.version !== 1 ||
    v.scope !== VIDEO_QUALIFICATION_SCOPE ||
    !validateVideoSupervisor(v.supervisor) ||
    v.head !== v.supervisor.head
  )
    return false;
  if (
    v.diagnostic !== null &&
    (!validateVideoDiagnostic(v.diagnostic) || v.diagnostic.head !== v.head)
  )
    return false;
  if (v.result !== null && (!validateVideoQualification(v.result) || v.result.head !== v.head))
    return false;
  if ((v.diagnostic !== null || v.result !== null) && !retiredProcess(v.supervisor.process))
    return false;
  return !v.supervisor.passed || (v.result !== null && v.diagnostic === null);
}
