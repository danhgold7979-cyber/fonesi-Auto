'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { STAGES, CASES, VERSIONS, control, result, auditMatches } = require('./vault-contract.cjs');
const id = 'abcdef00-0000-4000-8000-000000000001';
test('vault fixed schema and private controls reject aliases/duplicate/private values', () => {
  for (const stage of STAGES) {
    const value = {
      version: 1,
      mode: 'source',
      stage,
      versions: { ...VERSIONS },
      cases: Object.fromEntries(CASES.map((k) => [k, true])),
      recordCount: 1,
      accessDeniedCode: stage === 'denied' ? 'EACCES' : null,
    };
    assert.equal(result(JSON.stringify(value), 'source', stage).passed, true);
    for (const key of CASES)
      assert.equal(
        result(
          JSON.stringify({ ...value, cases: { ...value.cases, [key]: false } }),
          'source',
          stage,
        ).passed,
        false,
      );
    assert.throws(() => result(JSON.stringify({ ...value, secret: id }), 'source', stage));
    assert.throws(() =>
      result(
        JSON.stringify(value).replace('"closed":true', '"closed":false,"closed":true'),
        'source',
        stage,
      ),
    );
  }
  const value = {
    version: 1,
    mode: 'source',
    stage: 'create',
    parentToken: id,
    ownerToken: id,
    storeId: id,
    checkpoint: `key-checkpoint-${id}.json`,
  };
  assert.deepEqual(control(JSON.stringify(value)), value);
  assert.throws(() => control(JSON.stringify({ ...value, checkpoint: '../private' })));
  assert.throws(() =>
    control(JSON.stringify(value).replace('"version":1', '"version":0,"version":1')),
  );
});
test('audit correlation sorts directory-independent sequence but rejects duplicates and mixed runs', () => {
  const fields = {
    operation: 'READ',
    phase: 'INTENT',
    diagnosticId: id,
    secretId: id,
    revision: 1,
    code: 'OK',
  };
  const first = { ...fields, schemaVersion: 2, runId: id, sequence: 1 },
    second = { ...first, phase: 'RESULT', sequence: 2 };
  assert.equal(auditMatches([second, first], [fields, { ...fields, phase: 'RESULT' }]), true);
  assert.equal(auditMatches([first, first], [fields, fields]), false);
  assert.equal(
    auditMatches(
      [first, { ...second, runId: 'abcdef00-0000-4000-8000-000000000002' }],
      [fields, { ...fields, phase: 'RESULT' }],
    ),
    false,
  );
  assert.equal(
    auditMatches(
      [first, { ...second, code: 'WRITE_FAILED' }],
      [fields, { ...fields, phase: 'RESULT' }],
    ),
    false,
  );
});
