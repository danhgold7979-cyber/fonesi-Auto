import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from './verify-dependencies.mjs';
import { runStages } from './stages.mjs';
import { testDiagnostics } from './test-diagnostics.mjs';
import { verifyBuild } from './build-manifest.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeDir = dirname(process.execPath);
const npmCLI =
  process.platform === 'win32'
    ? resolve(nodeDir, 'node_modules/npm/bin/npm-cli.js')
    : resolve(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js');
function run(args, timeout = 30000) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    shell: false,
    encoding: 'utf8',
    timeout,
    maxBuffer: 65536,
  });
  return {
    ok: !result.error && !result.signal && result.status === 0,
    stdout: result.stdout ?? '',
    outcome:
      result.error?.code === 'ETIMEDOUT'
        ? 'TIMEOUT'
        : result.error?.code === 'ENOBUFS'
          ? 'CAPTURE_LIMIT'
          : result.error
            ? 'SPAWN_FAILED'
            : result.signal
              ? 'SIGNAL'
              : result.status === 0
                ? 'OK'
                : 'EXIT_NONZERO',
  };
}
try {
  if (process.argv.length > 3 || (process.argv[2] !== undefined && process.argv[2] !== '--restore'))
    throw new Error('ARGUMENTS');
  // Do not run restore or build if the parent's override or metadata checks fail.
  if (
    ['NODE_PATH', 'NODE_OPTIONS', 'ESBUILD_BINARY_PATH'].some(
      (key) => process.env[key] !== undefined,
    )
  )
    throw new Error('OVERRIDE');
  const npm = run([npmCLI, '--version']);
  if (!npm.ok) throw new Error('NPM_UNAVAILABLE');
  const npmVersion = npm.stdout.trim();
  const stages = [['METADATA', () => Boolean(verify(false, npmVersion))]];
  if (process.argv[2] === '--restore')
    stages.push([
      'RESTORE',
      () =>
        run(
          [
            npmCLI,
            'ci',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            '--registry=https://registry.npmjs.org',
            '--cache=.npm-cache',
          ],
          120000,
        ).ok,
    ]);
  stages.push(['INSTALLED', () => Boolean(verify(true, npmVersion))]);
  if (process.argv[2] === '--restore') {
    stages.push(
      [
        'SIGNATURES',
        () => {
          const result = run(
            [
              npmCLI,
              'audit',
              'signatures',
              '--ignore-scripts',
              '--json',
              '--registry=https://registry.npmjs.org',
              '--cache=.npm-cache',
            ],
            120000,
          );
          if (!result.ok) return false;
          const report = JSON.parse(result.stdout);
          return (
            Array.isArray(report.invalid) &&
            report.invalid.length === 0 &&
            Array.isArray(report.missing) &&
            report.missing.length === 0
          );
        },
      ],
      [
        'ADVISORIES',
        () => {
          const result = run(
            [
              npmCLI,
              'audit',
              '--ignore-scripts',
              '--json',
              '--registry=https://registry.npmjs.org',
              '--cache=.npm-cache',
            ],
            120000,
          );
          if (!result.ok) return false;
          return JSON.parse(result.stdout).metadata?.vulnerabilities?.total === 0;
        },
      ],
    );
  }
  stages.push(
    ['MODULE_GRAPH', () => run(['scripts/check-module-graph.mjs', npmVersion]).ok],
    ['QUALITY', () => run(['scripts/quality-tool.mjs', '--inventory', npmVersion]).ok],
    [
      'TYPECHECK',
      () => run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--pretty', 'false']).ok,
    ],
    ['BUILD', () => run(['scripts/build.mjs', npmVersion]).ok],
    ['MANIFEST', () => verifyBuild(root)],
    [
      'TESTS',
      () => {
        const result = run([
          '--test',
          '--test-reporter=tap',
          'tests/policy.test.mjs',
          'tests/test-diagnostics.test.mjs',
          'tests/ipc-contract.test.mjs',
          'tests/log-contract.test.mjs',
          'tests/persistence-contract.test.mjs',
          'tests/persistence-proof.test.mjs',
          'tests/persistence-process.test.mjs',
          'tests/persistence-launcher.test.mjs',
          'tests/persistence-launch-control.test.mjs',
          'tests/foundation-database.test.mjs',
          'tests/backup-container.test.mjs',
          'tests/backup-service.test.mjs',
          'tests/persistence-files.test.mjs',
          'tests/backup-key-profile.test.mjs',
          'tests/backup-catalog.test.mjs',
          'tests/foundation-persistence.test.mjs',
          'tests/persistence-entry.test.mjs',
          'tests/persistence-native.test.mjs',
          'tests/persistence-maintenance.test.mjs',
          'tests/persistence-lifecycle.test.mjs',
          'tests/log-files.test.mjs',
          'tests/logging.test.mjs',
          'verification/logging-evidence.test.cjs',
          'verification/persistence-envelope.test.cjs',
          'verification/persistence-store-contract.test.cjs',
          'verification/persistence-maintenance-contract.test.cjs',
          'verification/persistence-matrix-control.test.cjs',
          'verification/persistence-restore-contract.test.cjs',
          'verification/persistence-launch-e2e-control.test.cjs',
          'tests/ipc-diagnostic.test.mjs',
          'tests/quality-tool.test.mjs',
          'tests/module-graph.test.mjs',
        ]);
        const diagnostic = () => {
          for (const line of testDiagnostics(result.stdout, result.outcome)) console.log(line);
          return false;
        };
        const counts = {};
        for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
          const matches = [...result.stdout.matchAll(new RegExp(`^# ${field} (.*)$`, 'gm'))];
          if (matches.length !== 1 || !/^(0|[1-9]\d*)$/.test(matches[0][1])) return diagnostic();
          counts[field] = Number(matches[0][1]);
          if (!Number.isSafeInteger(counts[field])) return diagnostic();
        }
        if (
          !result.ok ||
          counts.tests < 1 ||
          counts.pass !== counts.tests ||
          counts.fail ||
          counts.cancelled ||
          counts.skipped ||
          counts.todo
        )
          return diagnostic();
        console.log(`TESTS_PASS ${counts.pass}/${counts.tests}`);
        return true;
      },
    ],
  );
  const outcome = runStages(stages);
  console.log(outcome.ok ? 'DESKTOP_SOURCE_CHECK_PASS' : `${outcome.stage}_FAILED`);
  process.exitCode = outcome.ok ? 0 : 1;
} catch {
  console.log('PRECHECK_FAILED');
  process.exitCode = 1;
}
