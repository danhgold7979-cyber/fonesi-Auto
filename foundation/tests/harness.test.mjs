import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { runNode, root, suitePassed } from '../scripts/run-tool.mjs';
import { cleanText } from '../scripts/check-hygiene.mjs';
import { readSources, checkGraph } from '../scripts/check-boundaries.mjs';
function fixture(files, action) {
  const parent = resolve(root, '.test-output');
  try {
    mkdirSync(parent);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const validateParent = () => {
    const stat = lstatSync(parent);
    assert.equal(stat.isDirectory() && !stat.isSymbolicLink(), true);
    assert.equal(realpathSync(parent), resolve(realpathSync(root), '.test-output'));
  };
  validateParent();
  const directory = mkdtempSync(resolve(parent, 'harness-'));
  try {
    for (const [name, text] of Object.entries(files))
      writeFileSync(resolve(directory, name), text, { flag: 'wx' });
    return action(directory);
  } finally {
    validateParent();
    assert.equal(lstatSync(directory).isSymbolicLink(), false);
    assert.equal(
      realpathSync(directory),
      resolve(realpathSync(parent), directory.slice(parent.length + 1)),
    );
    rmSync(directory, { recursive: true, force: false });
  } // only fresh, test-owned directory
}
function compile(source) {
  const config = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf8'));
  delete config.include;
  config.files = ['input.ts'];
  return fixture({ 'input.ts': source, 'tsconfig.json': JSON.stringify(config) }, (directory) =>
    runNode([
      'node_modules/typescript/bin/tsc',
      '-p',
      resolve(directory, 'tsconfig.json'),
      '--pretty',
      'false',
    ]),
  );
}
test('strict valid fixture compiles', () => {
  const result = compile('export const number: number = 1;\n');
  assert.equal(result.failed, false);
  assert.equal(result.status, 0);
});
for (const [name, source] of Object.entries({
  unsafeType: 'export const number: number = "wrong";',
  uncheckedIndex: 'export function first(a: number[]): number { return a[0]; }',
  exactOptional: 'export const x: { a?: number } = { a: undefined };',
  implicitReturn: 'export function x(flag: boolean): number | undefined { if (flag) return 1; }',
  unusedParameter: 'export function x(unused: number): number { return 1; }',
  unused: 'const unused = 1; export {};',
  nodeGlobal: 'export const pid = process.pid;',
  domGlobal: 'export const title = document.title;',
  syntax: 'export const = ;',
}))
  test(`compiler rejects ${name}`, () => {
    const result = compile(source);
    assert.equal(result.failed, false);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /error TS\d+:/);
  });
test('passing, failing and skipped test subprocesses are distinguished', () => {
  fixture(
    {
      'pass.mjs': "import { test } from 'node:test'; test('positive', () => {});",
      'fail.mjs':
        "import { test } from 'node:test'; import assert from 'node:assert/strict'; test('negative', () => assert.equal(1, 2));",
      'skip.mjs': "import { test } from 'node:test'; test.skip('not evidence', () => {});",
    },
    (directory) => {
      const run = (name) => runNode(['--test', '--test-reporter=tap', resolve(directory, name)]);
      assert.equal(suitePassed(run('pass.mjs')), true);
      const fail = run('fail.mjs');
      assert.equal(fail.failed, false);
      assert.notEqual(fail.status, 0);
      assert.equal(suitePassed(fail), false);
      const skip = run('skip.mjs');
      assert.equal(skip.status, 0);
      assert.equal(suitePassed(skip), false);
    },
  );
});
test('empty, cancelled and todo summaries cannot pass', () => {
  for (const stdout of [
    '# tests 0\n# fail 0\n# skipped 0\n',
    '# tests 1\n# fail 0\n# cancelled 1\n# skipped 0\n# todo 0\n',
  ])
    assert.equal(suitePassed({ failed: false, status: 0, stdout }), false);
});
test('limited hygiene accepts LF and rejects tab, CRLF, trailing space and missing newline', () => {
  assert.equal(cleanText('good\n'), true);
  for (const text of ['bad\t\n', 'bad\r\n', 'bad \n', 'bad']) assert.equal(cleanText(text), false);
});
test('boundary negative fixture produces actual nonzero process exit', () => {
  const code =
    "import {checkGraph} from './scripts/check-boundaries.mjs'; process.exitCode = checkGraph(new Map([['bad.ts',\"import fs from 'node:fs';\"]])) === 'BOUNDARIES_PASS' ? 0 : 1;";
  const result = runNode(['--input-type=module', '-e', code]);
  assert.equal(result.failed, false);
  assert.equal(result.status, 1);
});
test('hygiene negative fixture produces actual nonzero process exit', () => {
  const result = runNode([
    '--input-type=module',
    '-e',
    "import {cleanText} from './scripts/check-hygiene.mjs'; process.exitCode = cleanText('bad ') ? 0 : 1;",
  ]);
  assert.equal(result.failed, false);
  assert.equal(result.status, 1);
});

test('actual filesystem source inventory rejects unlisted source and nested layout', () => {
  fixture({}, (directory) => {
    const source = resolve(directory, 'src');
    const contracts = resolve(source, 'contracts');
    mkdirSync(contracts, { recursive: true });
    writeFileSync(resolve(contracts, 'module.ts'), 'export {};\n', { flag: 'wx' });
    assert.equal(checkGraph(readSources(source)), 'BOUNDARIES_PASS');
    writeFileSync(resolve(source, 'other.ts'), "import fs from 'node:fs';", { flag: 'wx' });
    assert.throws(() => readSources(source), /SOURCE_ROOT/);
    rmSync(resolve(source, 'other.ts'));
    mkdirSync(resolve(contracts, 'nested'));
    assert.throws(() => readSources(source), /SOURCE_ENTRY/);
  });
});

test('summary counts reject contradictions, duplicates and unsafe integers', () => {
  const good = '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  assert.equal(suitePassed({ failed: false, status: 0, stdout: good }), true);
  for (const stdout of [
    good.replace('# pass 1', '# pass 0'),
    good + '# skipped 1\n',
    good + '# skipped 0\n',
    good.replace('# tests 1', '# tests 99999999999999999999'),
  ])
    assert.equal(suitePassed({ failed: false, status: 0, stdout }), false);
});
