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
