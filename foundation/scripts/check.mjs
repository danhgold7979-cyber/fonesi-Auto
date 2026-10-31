import { runNode, suitePassed } from './run-tool.mjs';
const stages = [
  ['BOOTSTRAP', ['scripts/verify-bootstrap.mjs', '--installed', process.argv[2] ?? '']],
  ['BOUNDARIES', ['scripts/check-boundaries.mjs']],
  ['TYPECHECK', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--pretty', 'false']],
  ['HYGIENE', ['scripts/check-hygiene.mjs']],
  [
    'TESTS',
    [
      '--test',
      '--test-reporter=tap',
      'tests/bootstrap.test.mjs',
      'tests/boundaries.test.mjs',
      'tests/harness.test.mjs',
      'tests/validators.test.mjs',
    ],
  ],
];
for (const [name, args] of stages) {
  const result = runNode(args);
  if (result.failed || result.status !== 0 || (name === 'TESTS' && !suitePassed(result))) {
    console.log(`${name}_FAILED`);
    process.exitCode = 1;
    break;
  }
  console.log(`${name}_PASS`);
  if (name === 'TESTS')
    console.log(
      result.stdout
        .split('\n')
        .filter((line) => /^# (tests|pass|fail|cancelled|skipped|todo) /.test(line))
        .join('\n'),
    );
}
