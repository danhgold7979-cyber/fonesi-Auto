import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { verifyBuild } from './build-manifest.mjs';
// Trusted offline maintenance only. This acknowledgment is not an ownership proof:
// the operator/supervisor must stop all owners and exclude launches beforehand.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (
    process.versions.node !== '24.22.1' ||
    process.argv.length !== 7 ||
    process.argv[2] !== '--owners-stopped-and-launches-excluded' ||
    ['NODE_PATH', 'NODE_OPTIONS'].some((key) => process.env[key] !== undefined) ||
    process.argv.slice(3).some((value) => value.length > 4096) ||
    !verifyBuild(root)
  )
    throw new Error('MAINTENANCE_REJECTED');
  const require = createRequire(import.meta.url);
  const { recoverLogStore } = require('../build/log-recovery.cjs');
  const result = await recoverLogStore(
    { root: process.argv[3], parentToken: process.argv[4] },
    process.argv[5],
    process.argv[6],
    true,
  );
  if (!['RECOVERED', 'OWNERSHIP_REJECTED', 'RECOVERY_FAILED'].includes(result))
    throw new Error('RESULT_REJECTED');
  console.log(result);
  process.exitCode = result === 'RECOVERED' ? 0 : 1;
} catch {
  console.log('RECOVERY_FAILED');
  process.exitCode = 1;
}
