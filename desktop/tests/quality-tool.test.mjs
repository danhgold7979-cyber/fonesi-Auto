import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { executable, inventory, invoke } from '../scripts/quality-tool.mjs';
const binary = executable(process.platform === 'win32' ? '11.19.1' : '11.9.0');
function run(mode, input) {
  let directory;
  let result;
  if (input !== undefined && mode !== 'format') {
    const parent = fileURLToPath(new URL('.', import.meta.url));
    const parentStat = lstatSync(parent);
    assert.ok(parentStat.isDirectory() && !parentStat.isSymbolicLink());
    assert.equal(realpathSync(parent), parent.replace(/[\\/]$/, ''));
    directory = mkdtempSync(fileURLToPath(new URL('./quality-case-', import.meta.url)));
    const file = `${directory}/fixture.ts`;
    try {
      writeFileSync(file, input, { flag: 'wx' });
      result = invoke(binary, mode, [file]);
    } finally {
      unlinkSync(file);
      rmdirSync(directory);
    }
  } else result = invoke(binary, mode, [], input);
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return result;
}
test('pinned native executable reports exact version', () => {
  const result = run('version');
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'Version: 2.6.4');
});
test('valid current TypeScript corpus fixture passes lint and format', () => {
  assert.equal(run('check', 'export const value: number = 1;\n').status, 0);
});
test('unused variable produces nonzero named lint diagnostic', () => {
  const result = run('lint', 'const unused = 1;\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lint\/correctness\/noUnusedVariables/);
});
test('invalid TypeScript produces nonzero parse diagnostic', () => {
  const result = run('check', 'export const = ;\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /parse/);
});
test('format drift fails check and formatting is idempotent', () => {
  const input = 'export const value={a:1,b:"two"}';
  const checked = run('check', input);
  assert.notEqual(checked.status, 0);
  assert.match(checked.stderr, /format/);
  const first = run('format', input);
  assert.equal(first.status, 0);
  const second = run('format', first.stdout);
  assert.equal(second.status, 0);
  assert.equal(first.stdout, second.stdout);
  assert.equal(run('check', first.stdout).status, 0);
});
test('inventory includes active verification CJS and excludes historical/generated trees', () => {
  const paths = inventory().map((path) => path.replaceAll('\\', '/'));
  assert.ok(paths.includes('desktop/verification/runtime-probe.cjs'));
  assert.ok(paths.includes('foundation/src/contracts/validate.ts'));
  assert.ok(
    paths.every(
      (path) => !/(?:^|\/)(?:node_modules|build|phase-00|ui-reference)(?:\/|$)/.test(path),
    ),
  );
});
test('check-only corpus traversal never changes source bytes', () => {
  const paths = inventory();
  const hash = () =>
    paths.map((path) =>
      createHash('sha256')
        .update(readFileSync(new URL(`../../${path}`, import.meta.url)))
        .digest('hex'),
    );
  const before = hash();
  const result = invoke(binary, 'check', paths);
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0);
  assert.deepEqual(hash(), before);
});

test('mixed-case native overrides are rejected before selection', () => {
  const key = 'Biome_Binary';
  const prior = process.env[key];
  try {
    process.env[key] = 'rejected';
    assert.throws(() => executable('11.9.0'), /TOOL_OVERRIDE/);
  } finally {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
});

test('tool targets cannot escape the active corpus or add command options', () => {
  for (const file of [
    '--write',
    'tools/phase-00/desktop-stack-lab/scripts/run-windows.cjs',
    '../outside.ts',
  ]) {
    assert.throws(() => invoke(binary, 'format-write', [file]), /TOOL_TARGETS/);
  }
  assert.throws(() => invoke(binary, 'format', [], 'x'.repeat(1048577)), /TOOL_INPUT/);
});

test('warning-only non-null assertion is a nonzero acceptance failure', () => {
  const result = run('lint', 'export function value(input?: string) { return input!; }\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lint\/style\/noNonNullAssertion/);
});

test('nested config is rejected without interpreting its contents', () => {
  const parent = fileURLToPath(new URL('.', import.meta.url));
  assert.ok(lstatSync(parent).isDirectory() && !lstatSync(parent).isSymbolicLink());
  assert.equal(realpathSync(parent), parent.replace(/[\\/]$/, ''));
  const directory = mkdtempSync(fileURLToPath(new URL('./quality-case-', import.meta.url)));
  try {
    for (const name of ['biome.json', 'biome.jsonc']) {
      const file = `${directory}/${name}`;
      writeFileSync(file, '{"linter":{"enabled":false}}', { flag: 'wx' });
      try {
        assert.throws(() => inventory(), /TOOL_NESTED_CONFIG/);
        assert.throws(() => invoke(binary, 'version', []), /TOOL_NESTED_CONFIG/);
      } finally {
        unlinkSync(file);
      }
    }
  } finally {
    rmdirSync(directory);
  }
});
