import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from './verify-dependencies.mjs';
import { runStages } from './stages.mjs';
import { verifyBuild } from './build-manifest.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeDir = dirname(process.execPath);
const npmCLI = process.platform === 'win32' ? resolve(nodeDir, 'node_modules/npm/bin/npm-cli.js') : resolve(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js');
function run(args, timeout = 30000) {
  const result = spawnSync(process.execPath, args, { cwd: root, shell: false, encoding: 'utf8', timeout, maxBuffer: 65536 });
  return { ok: !result.error && !result.signal && result.status === 0, stdout: result.stdout ?? '' };
}
try {
  if (process.argv.length > 3 || (process.argv[2] !== undefined && process.argv[2] !== '--restore')) throw new Error('ARGUMENTS');
  // Do not run restore or build if the parent's override or metadata checks fail.
  if (['NODE_PATH', 'NODE_OPTIONS', 'ESBUILD_BINARY_PATH'].some((key) => process.env[key] !== undefined)) throw new Error('OVERRIDE');
  const npm = run([npmCLI, '--version']); if (!npm.ok) throw new Error('NPM_UNAVAILABLE');
  const npmVersion = npm.stdout.trim();
  const stages = [['METADATA', () => Boolean(verify(false, npmVersion))]];
  if (process.argv[2] === '--restore') stages.push(['RESTORE', () => run([npmCLI, 'ci', '--ignore-scripts', '--no-audit', '--no-fund',
    '--registry=https://registry.npmjs.org', '--cache=.npm-cache'], 120000).ok]);
  stages.push(['INSTALLED', () => Boolean(verify(true, npmVersion))],
    ['TYPECHECK', () => run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--pretty', 'false']).ok],
    ['BUILD', () => run(['scripts/build.mjs', npmVersion]).ok],
    ['MANIFEST', () => verifyBuild(root)],
    ['TESTS', () => {
      const result = run(['--test', '--test-reporter=tap', 'tests/policy.test.mjs']);
      const counts = {};
      for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
        const matches = [...result.stdout.matchAll(new RegExp(`^# ${field} (.*)$`, 'gm'))];
        if (matches.length !== 1 || !/^(0|[1-9]\d*)$/.test(matches[0][1])) return false;
        counts[field] = Number(matches[0][1]); if (!Number.isSafeInteger(counts[field])) return false;
      }
      if (!result.ok || counts.tests < 1 || counts.pass !== counts.tests || counts.fail || counts.cancelled || counts.skipped || counts.todo) return false;
      console.log(`TESTS_PASS ${counts.pass}/${counts.tests}`); return true;
    }]);
  const outcome = runStages(stages);
  console.log(outcome.ok ? 'DESKTOP_SOURCE_CHECK_PASS' : `${outcome.stage}_FAILED`);
  process.exitCode = outcome.ok ? 0 : 1;
} catch { console.log('PRECHECK_FAILED'); process.exitCode = 1; }
