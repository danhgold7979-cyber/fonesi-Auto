import test from 'node:test';
import assert from 'node:assert/strict';
import { validRuntimeVersionAuditTuple as valid } from '../src/runtime-version-audit-contract.ts';
const base = {
  operation: 'REQUEST',
  phase: 'INTENT',
  diagnosticId: '00000000-0000-4000-8000-000000000001',
  operationId: '00000000-0000-4000-8000-000000000002',
  expectedRevision: 0,
  resultingRevision: null,
  installationRevision: 1,
  outcome: 'INTENT',
  code: 'OK',
};
test('schema7 exact intent/result table distinguishes request no-transition from retired verify result', () => {
  const rows = [
    base,
    { ...base, operation: 'VERIFY' },
    { ...base, phase: 'RESULT', outcome: 'PENDING', resultingRevision: 1 },
    { ...base, phase: 'RESULT', outcome: 'FAILED', code: 'BUSY' },
    { ...base, operation: 'VERIFY', phase: 'RESULT', outcome: 'VERIFIED', resultingRevision: 2 },
    {
      ...base,
      operation: 'VERIFY',
      phase: 'RESULT',
      outcome: 'FAILED',
      code: 'TIMEOUT',
      resultingRevision: 2,
    },
    {
      ...base,
      phase: 'RESULT',
      outcome: 'OUTCOME_UNKNOWN',
      code: 'RECOVERY_REQUIRED',
      resultingRevision: 1,
    },
    {
      ...base,
      operation: 'READ',
      operationId: null,
      expectedRevision: null,
      phase: 'RESULT',
      outcome: 'OBSERVED',
      resultingRevision: 0,
      installationRevision: null,
    },
  ];
  for (const r of rows) assert.equal(valid(r), true);
  for (const r of [
    { ...base, operation: 'READ' },
    { ...base, operationId: null },
    { ...base, installationRevision: 0 },
    { ...rows[3], resultingRevision: 1 },
    { ...rows[5], resultingRevision: null },
    { ...rows[5], code: 'BUSY' },
    { ...rows[6], code: 'TIMEOUT' },
    { ...rows[7], operationId: base.operationId },
    { ...base, diagnosticId: base.operationId },
  ])
    assert.equal(valid(r), false);
});
test('audit tuple rejects throwing getters and private unsupported fields without evaluating values', () => {
  let called = 0;
  assert.equal(
    valid({
      ...base,
      get code() {
        called++;
        throw Error('secret');
      },
    }),
    false,
  );
  assert.equal(called, 0);
  assert.equal(valid({ ...base, code: 'private-canary' }), false);
  assert.equal(valid({ ...base, expectedRevision: -0 }), false);
});
