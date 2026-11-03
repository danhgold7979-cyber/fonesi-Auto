import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from './verify-dependencies.mjs';
import { runStages } from './stages.mjs';
import { testDiagnostics } from './test-diagnostics.mjs';
import { runTestBatches } from './test-batches.mjs';
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
    [
      'DEMO_TYPECHECK',
      () =>
        run(['node_modules/typescript/bin/tsc', '-p', 'demo-tsconfig.json', '--pretty', 'false'])
          .ok,
    ],
    ['DEMO_BUILD', () => run(['scripts/build-demo.mjs', npmVersion]).ok],
    ['MANIFEST', () => verifyBuild(root)],
    [
      'TESTS',
      () => {
        return runTestBatches(run, {
          emit: (line) => console.log(line),
          diagnostic: (stdout, outcome) => {
            for (const line of testDiagnostics(stdout, outcome)) console.log(line);
          },
        });
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
