// Fixed verification admission only. Does not compile or execute any assembly.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBuild } from './build-manifest.mjs';
export const MANAGED_SCOPE = 'RETAINED_PROTOCOL_MANAGED_FIXTURE_ONLY';
export const MANAGED_MARKER = 'RETAINED_MANAGED_GROUPS_92';
export function managedProcessPassed(value, fixture = false) {
  if (!value || typeof value !== 'object') return false;
  const d = Object.getOwnPropertyDescriptors(value);
  const keys = [
    'status',
    'exitCode',
    'cleanupComplete',
    'stdoutTruncated',
    'stderrTruncated',
    'stdout',
    'stderr',
  ];
  if (Object.keys(d).length !== keys.length || keys.some((k) => !d[k] || !('value' in d[k])))
    return false;
  const v = Object.fromEntries(keys.map((k) => [k, d[k].value]));
  return (
    (fixture ? v.status === 'SUCCESS' : ['SUCCESS', 'EMPTY_OUTPUT'].includes(v.status)) &&
    v.exitCode === 0 &&
    v.cleanupComplete === true &&
    v.stdoutTruncated === false &&
    v.stderrTruncated === false &&
    typeof v.stdout === 'string' &&
    typeof v.stderr === 'string' &&
    v.stdout.length <= 32768 &&
    v.stderr.length <= 32768 &&
    (!fixture ||
      ((v.stdout === MANAGED_MARKER + '\n' || v.stdout === MANAGED_MARKER + '\r\n') &&
        v.stderr === ''))
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let ok = false;
  try {
    ok =
      process.argv.length === 3 &&
      process.argv[2] === 'admit' &&
      process.platform === 'win32' &&
      process.arch === 'x64' &&
      process.versions.node === '24.22.1' &&
      ['NODE_PATH', 'NODE_OPTIONS', 'ESBUILD_BINARY_PATH'].every(
        (k) => process.env[k] === undefined,
      ) &&
      verifyBuild(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  } catch {
    ok = false;
  }
  console.log(ok ? 'RETAINED_MANAGED_ADMISSION_PASS' : 'RETAINED_MANAGED_ADMISSION_FAIL');
  process.exitCode = ok ? 0 : 1;
}
