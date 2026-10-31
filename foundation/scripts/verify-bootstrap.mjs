// Development-only metadata gate. Never imported by application/contract source.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const hooks = ['preinstall', 'install', 'postinstall', 'preprepare', 'prepare', 'postprepare', 'prepublish', 'prepublishOnly'];
export function validateMetadata(manifest, lock, review, nodeVersion, npmVersion) {
  if (nodeVersion !== 'v24.22.1' || npmVersion !== '11.9.0') return 'RUNTIME_MISMATCH';
  if (!isDeepStrictEqual(manifest, review.manifest)) return 'MANIFEST_MISMATCH';
  if (!isDeepStrictEqual(lock, review.lock)) return 'LOCK_MISMATCH';
  const entries = Object.entries(lock.packages).filter(([name]) => name !== '');
  for (const [, entry] of entries) {
    if (!entry.resolved?.startsWith('https://registry.npmjs.org/') ||
        !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity ?? '') ||
        !['MIT', 'Apache-2.0'].includes(entry.license) || entry.hasInstallScript) {
      return 'UNREVIEWED_DEPENDENCY';
    }
  }
  return 'METADATA_VERIFIED';
}
export function validateInstalled(manifest, expected) {
  if (manifest.version !== expected.version) return 'INSTALLED_VERSION_MISMATCH';
  if (hooks.some((key) => Object.hasOwn(manifest.scripts ?? {}, key))) return 'INSTALL_HOOK_REJECTED';
  return 'INSTALLED_METADATA_VERIFIED';
}
function run() {
  const installed = process.argv[2] === '--installed';
  const npmVersion = process.argv[installed ? 3 : 2];
  if (process.argv.length !== (installed ? 4 : 3)) return 'ARGUMENTS_REJECTED';
  const review = read('dependency-review.json');
  const prior = resolve(root, '../tools/phase-00/desktop-stack-lab');
  for (const [name, field] of [['package-lock.json', 'sourceLockSha256'], ['dependency-review.json', 'sourceReviewSha256']]) {
    const digest = createHash('sha256').update(readFileSync(resolve(prior, name))).digest('hex');
    if (digest !== review[field]) return 'PROVENANCE_MISMATCH';
  }
  const result = validateMetadata(read('package.json'), read('package-lock.json'), review, process.version, npmVersion);
  if (result !== 'METADATA_VERIFIED' || !installed) return result;
  for (const [name, expected] of Object.entries(review.lock.packages)) {
    if (!name) continue;
    const path = resolve(root, name, 'package.json');
    const platformMatch = (!expected.os || expected.os.includes(process.platform)) &&
      (!expected.cpu || expected.cpu.includes(process.arch));
    if (!existsSync(path)) {
      if (expected.optional && !platformMatch) continue;
      return 'INSTALLED_DEPENDENCY_MISSING';
    }
    const status = validateInstalled(JSON.parse(readFileSync(path, 'utf8')), expected);
    if (status !== 'INSTALLED_METADATA_VERIFIED') return status;
  }
  return 'BOOTSTRAP_VERIFIED';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try { result = run(); } catch { result = 'BOOTSTRAP_CHECK_FAILED'; }
  console.log(result); // fixed codes only, never raw exception/path/package output
  process.exitCode = ['METADATA_VERIFIED', 'BOOTSTRAP_VERIFIED'].includes(result) ? 0 : 1;
}
