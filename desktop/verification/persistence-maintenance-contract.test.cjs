'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CASES, VERSIONS, parse } = require('./persistence-maintenance-contract.cjs');
const fixture = () => ({
  version: 1,
  scope: 'NATIVE_ADAPTER_MAINTENANCE',
  mode: 'source',
  versions: { ...VERSIONS },
  cases: Object.fromEntries(CASES.map((x) => [x, true])),
  ordinaryCount: 7,
  protectedCount: 1,
  releasedSafetyCount: 1,
});
test('maintenance fixed result requires all facts and exact retained counts', () => {
  const good = fixture();
  assert.equal(parse(JSON.stringify(good)).passed, true);
  for (const name of CASES) {
    const value = fixture();
    value.cases[name] = false;
    assert.equal(parse(JSON.stringify(value)).passed, false);
  }
  for (const count of [0, 6]) {
    const value = fixture();
    value.ordinaryCount = count;
    assert.equal(parse(JSON.stringify(value)).passed, false);
  }
});
test('maintenance rejects duplicate masking, private fields, nonfinite values and type coercion', () => {
  const raw = JSON.stringify(fixture());
  assert.throws(() => parse(raw.replace('"version":1', '"version":0,"version":1')));
  assert.throws(() =>
    parse(raw.replace('"retained_lease":true', '"retained_lease":false,"retained_lease":true')),
  );
  for (const value of [null, true, '7', 8]) {
    const v = fixture();
    v.ordinaryCount = value;
    assert.throws(() => parse(JSON.stringify(v)));
  }
  const v = fixture();
  v.path = 'private';
  assert.throws(() => parse(JSON.stringify(v)));
  assert.throws(() => parse(raw.replace('"ordinaryCount":7', '"ordinaryCount":NaN')));
  assert.throws(() => parse(' '.repeat(65537)));
});
