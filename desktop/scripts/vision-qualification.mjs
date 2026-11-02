// Read-only source/build admission. Never installs, imports or launches a vision runtime.
import { readFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBuild } from './build-manifest.mjs';
export function visionSourceAdmission(value) {
  if (!value || typeof value !== 'object') return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = ['platform', 'arch', 'nodeVersion', 'overrides', 'buildValid', 'mode', 'candidate'];
  if (
    Object.keys(descriptors).length !== keys.length ||
    keys.some((k) => !descriptors[k] || !('value' in descriptors[k]))
  )
    return false;
  const v = Object.fromEntries(keys.map((k) => [k, descriptors[k].value]));
  if (
    v.platform !== 'win32' ||
    v.arch !== 'x64' ||
    v.nodeVersion !== '24.22.1' ||
    v.overrides !== false ||
    v.buildValid !== true ||
    !['compile', 'managed', 'runtime'].includes(v.mode)
  )
    return false;
  if (v.mode === 'managed' || v.mode === 'compile') return true;
  if (!v.candidate || typeof v.candidate !== 'object') return false;
  const d = Object.getOwnPropertyDescriptors(v.candidate);
  for (const k of ['scope', 'approvedInstalledInventorySha256', 'prerequisitesVerifiedOnHost'])
    if (!d[k] || !('value' in d[k])) return false;
  return (
    d.scope.value === 'WINDOWS_X64_DEVELOPMENT_CANDIDATE' &&
    d.prerequisitesVerifiedOnHost.value === true &&
    typeof d.approvedInstalledInventorySha256.value === 'string' &&
    /^[0-9a-f]{64}$/.test(d.approvedInstalledInventorySha256.value)
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let ok = false;
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const path = resolve(root, 'vision/windows_qualification_manifest.json');
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw Error('MANIFEST');
    ok =
      process.argv.length === 3 &&
      visionSourceAdmission({
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
        overrides: ['NODE_OPTIONS', 'NODE_PATH', 'ESBUILD_BINARY_PATH'].some(
          (k) => process.env[k] !== undefined,
        ),
        buildValid: verifyBuild(root),
        mode: process.argv[2],
        candidate: JSON.parse(readFileSync(path, 'utf8')),
      });
  } catch {
    ok = false;
  }
  console.log(ok ? 'WINDOWS_VISION_SOURCE_ADMISSION_PASS' : 'WINDOWS_VISION_SOURCE_ADMISSION_FAIL');
  process.exitCode = ok ? 0 : 1;
}
