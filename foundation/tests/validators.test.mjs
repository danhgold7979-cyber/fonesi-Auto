import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNode, root } from '../scripts/run-tool.mjs';
let directory;
let validateUnavailable;
const parent = resolve(root, '.test-output');
function verifyParent() {
  const stat = lstatSync(parent);
  assert.equal(stat.isDirectory() && !stat.isSymbolicLink(), true);
  assert.equal(realpathSync(parent), resolve(realpathSync(root), '.test-output'));
}
before(async () => {
  try { mkdirSync(parent); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  verifyParent(); directory = mkdtempSync(resolve(parent, 'validators-'));
  const result = runNode(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json',
    '--noEmit', 'false', '--rootDir', 'src/contracts', '--outDir', directory, '--pretty', 'false']);
  assert.equal(result.failed, false); assert.equal(result.status, 0, 'PURE_SOURCE_COMPILE_FAILED');
  ({ validateUnavailable } = await import(pathToFileURL(resolve(directory, 'validate.js')).href));
});
after(() => {
  if (!directory) return;
  verifyParent(); assert.equal(lstatSync(directory).isSymbolicLink(), false);
  assert.equal(realpathSync(directory), resolve(realpathSync(parent), basename(directory)));
  rmSync(directory, { recursive: true, force: false });
});
const good = () => ({ version: 1, status: 'UNAVAILABLE', reason: 'NOT_IMPLEMENTED', correlationId: 'synthetic-1' });
for (const reason of ['NOT_IMPLEMENTED', 'DEPENDENCY_BLOCKED', 'UNSUPPORTED'])
  test(`accept exact unavailable reason ${reason}`, () => assert.equal(validateUnavailable({ ...good(), reason }), 'VALID'));
test('accept 1 and 64 ASCII identifier characters', () => {
  for (const correlationId of ['a', 'A0_-'.repeat(16)]) assert.equal(validateUnavailable({ ...good(), correlationId }), 'VALID');
});
for (const [name, value] of Object.entries({
  null: null, undefined: undefined, boolean: false, number: 1, bigint: 1n,
  string: 'UNAVAILABLE', symbol: Symbol('synthetic'), array: [], function: () => {},
  date: new Date(0), boxed: new String('synthetic'), nullPrototype: Object.assign(Object.create(null), good()),
  inherited: Object.create(good())
})) test(`reject shape ${name}`, () => assert.equal(validateUnavailable(value), 'INVALID_SHAPE'));
test('reject missing and extra keys including privilege-bearing fields', () => {
  for (const key of Object.keys(good())) { const value = good(); delete value[key]; assert.equal(validateUnavailable(value), 'INVALID_SHAPE'); }
  for (const key of ['enabled', 'operation', 'payload', 'result', 'path', 'secret', '__proto__']) {
    const value = good(); Object.defineProperty(value, key, { value: 'SYNTHETIC_PRIVATE', enumerable: true });
    assert.equal(validateUnavailable(value), 'INVALID_SHAPE');
  }
});
test('reject own symbol even when nonenumerable', () => {
  const value = good(); Object.defineProperty(value, Symbol('extra'), { value: true });
  assert.equal(validateUnavailable(value), 'INVALID_SHAPE');
});
test('getters and setters rejected without invoking them', () => {
  for (const key of Object.keys(good())) {
    let calls = 0; const value = good();
    Object.defineProperty(value, key, { get() { calls++; throw new Error('SYNTHETIC_PRIVATE'); }, configurable: true });
    assert.equal(validateUnavailable(value), 'INVALID_SHAPE'); assert.equal(calls, 0);
    Object.defineProperty(value, key, { set() { calls++; }, configurable: true });
    assert.equal(validateUnavailable(value), 'INVALID_SHAPE'); assert.equal(calls, 0);
  }
});
test('nonenumerable ordinary data properties accepted', () => {
  const value = good(); Object.defineProperty(value, 'correlationId', { value: 'synthetic', enumerable: false });
  assert.equal(validateUnavailable(value), 'VALID');
});
test('frozen valid input accepted and all descriptors unchanged', () => {
  const value = Object.freeze(good()), before = Object.getOwnPropertyDescriptors(value);
  assert.equal(validateUnavailable(value), 'VALID'); assert.deepEqual(Object.getOwnPropertyDescriptors(value), before);
});
test('invalid input remains unchanged', () => {
  const value = Object.freeze({ ...good(), reason: 'WRONG' }), before = Object.getOwnPropertyDescriptors(value);
  assert.equal(validateUnavailable(value), 'INVALID_FIELD'); assert.deepEqual(Object.getOwnPropertyDescriptors(value), before);
});
test('unsupported safe integer version has fixed distinct code', () => {
  for (const version of [0, 2, -1, Number.MAX_SAFE_INTEGER]) assert.equal(validateUnavailable({ ...good(), version }), 'UNSUPPORTED_VERSION');
});
test('invalid version representation rejected', () => {
  for (const version of ['1', true, false, undefined, null, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(validateUnavailable({ ...good(), version }), 'INVALID_FIELD');
});
test('no success status or unknown reason accepted', () => {
  for (const status of ['READY', 'AVAILABLE', 'PASS', true, null, 'unavailable'])
    assert.equal(validateUnavailable({ ...good(), status }), 'INVALID_FIELD');
  for (const reason of ['ALLOWED', 'SYNTHETIC_PRIVATE', {}, null, 0])
    assert.equal(validateUnavailable({ ...good(), reason }), 'INVALID_FIELD');
});
test('correlation bounds and invalid Unicode/path/secret-shaped characters rejected without echo', () => {
  for (const correlationId of ['', 'a'.repeat(65), 'Tiếng Việt', '🙂', 'with space', 'a\nb',
    'a\0b', '/synthetic/private', 'C:\\synthetic', 'token=FAKE', '\uD800', 1, null, {}]) {
    const result = validateUnavailable({ ...good(), correlationId });
    assert.equal(result, 'INVALID_FIELD'); assert.equal(typeof result, 'string');
  }
});
test('ASCII format is not secret detection or logging authorization', () => {
  const value = { ...good(), correlationId: 'SYNTHETIC_SECRET_CANARY' };
  assert.equal(validateUnavailable(value), 'VALID'); // no values returned, not safe-to-log inference
});
test('every valid result is a fixed primitive and does not expose input', () => {
  const result = validateUnavailable(good()); assert.equal(result, 'VALID'); assert.equal(typeof result, 'string');
});
test('revoked or throwing proxy returns fixed shape error; traps are not sandboxed', () => {
  const pair = Proxy.revocable(good(), {}); pair.revoke(); assert.equal(validateUnavailable(pair.proxy), 'INVALID_SHAPE');
  let calls = 0;
  const value = new Proxy(good(), { getPrototypeOf() { calls++; throw new Error('SYNTHETIC_PRIVATE'); } });
  assert.equal(validateUnavailable(value), 'INVALID_SHAPE'); assert.equal(calls, 1);
});

test('field objects are not coerced or evaluated', () => {
  let calls = 0;
  const object = { toString() { calls++; throw new Error('SYNTHETIC_PRIVATE'); }, valueOf() { calls++; return 1; } };
  for (const key of ['version', 'status', 'reason', 'correlationId'])
    assert.equal(validateUnavailable({ ...good(), [key]: object }), 'INVALID_FIELD');
  assert.equal(calls, 0);
});
