import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/input-interaction-contract.ts';
import { INPUT_QUERY_ACTIONS } from '../src/main/input-query-contract.ts';
const id = '00000000-0000-4000-8000-000000000001';
const empty = {
  revision: 0,
  state: 'EMPTY',
  operationId: null,
  deviceId: null,
  generation: null,
  selectionRevision: null,
  registryRevision: null,
  action: null,
  deadlineUtc: null,
  receipt: null,
  code: null,
  current: false,
};
const pending = {
  ...empty,
  revision: 1,
  state: 'PENDING',
  operationId: id,
  deviceId: id,
  generation: 1,
  selectionRevision: 0,
  registryRevision: 2,
  action: 'HOME',
  deadlineUtc: 1000,
};
test('input exact fixed actions and strict bounded requests reject duplicates, coercion, extras and negative zero', () => {
  assert.deepEqual(c.INPUT_ACTIONS, INPUT_QUERY_ACTIONS);
  const q = {
    version: 1,
    requestId: 'p1',
    method: 'input.press',
    expectedRevision: 0,
    expectedSelectionRevision: 0,
    expectedRegistryRevision: 2,
    deviceId: id,
    action: 'HOME',
  };
  assert.ok(c.parseInputInteractionRequest(JSON.stringify(q)).ok);
  for (const field of ['expectedRevision', 'expectedSelectionRevision', 'expectedRegistryRevision'])
    for (const value of [-1, 1.5, '0', null])
      assert.equal(
        c.parseInputInteractionRequest(JSON.stringify({ ...q, [field]: value })).ok,
        false,
      );
  for (const raw of [
    JSON.stringify({ ...q, action: 'TAP' }),
    JSON.stringify({ ...q, serial: 'secret' }),
    JSON.stringify(q).replace('"expectedRevision":0', '"expectedRevision":-0'),
    JSON.stringify(q).replace('"version":1', '"version":1,"version":1'),
  ])
    assert.equal(c.parseInputInteractionRequest(raw).ok, false);
  assert.equal(c.parseInputInteractionRequest(' '.repeat(16385)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(
    c.parseInputInteractionRequest('"' + '\u00e9'.repeat(9000) + '"').code,
    'PAYLOAD_TOO_LARGE',
  );
  let calls = 0;
  assert.equal(
    c.snapshotInputInteractionRequest({
      ...q,
      get action() {
        calls++;
        return 'HOME';
      },
    }),
    null,
  );
  assert.equal(calls, 0);
});
test('input cache and receipt tuples never admit OBSERVED or remote-effect claims', () => {
  assert.ok(
    c.parseInputInteractionResponse(c.inputInteractionSuccess('p1', 'STATUS', empty, 'DEGRADED')),
  );
  assert.ok(
    c.parseInputInteractionResponse(
      c.inputInteractionSuccess('p1', 'PENDING', pending, 'DEGRADED'),
    ),
  );
  assert.equal(c.inputInteractionSuccess('p1', 'PENDING', pending, 'AVAILABLE'), null);
  const receipt = {
    version: 1,
    evidence: 'NATIVE_INPUT_QUERY',
    actor: {
      outcome: 'DISPATCHED_UNCONFIRMED',
      code: 'OK',
      commandId: id,
      correlationId: '00000000-0000-4000-8000-000000000002',
      diagnosticId: null,
    },
    loggingHealth: 'AVAILABLE',
  };
  assert.ok(
    c.snapshotInputInteractionReceipt({
      ...receipt,
      actor: {
        ...receipt.actor,
        outcome: 'OUTCOME_UNKNOWN',
        code: 'OUTCOME_UNKNOWN',
        commandId: null,
        correlationId: null,
      },
    }),
  );
  const settled = { ...pending, revision: 2, state: 'SETTLED', receipt, code: 'OK', current: true };
  assert.ok(c.snapshotInputInteractionSnapshot(settled));
  for (const bad of [
    { ...receipt, actor: { ...receipt.actor, outcome: 'OBSERVED' } },
    { ...receipt, actor: { ...receipt.actor, correlationId: null } },
    { ...receipt, stdout: 'secret' },
  ])
    assert.equal(c.snapshotInputInteractionReceipt(bad), null);
  assert.ok(c.snapshotInputInteractionSnapshot({ ...settled, state: 'CLOSED', current: false }));
  assert.equal(
    c.snapshotInputInteractionSnapshot({ ...settled, state: 'OUTCOME_UNKNOWN', current: false }),
    null,
  );
  assert.equal(
    c.parseInputInteractionResponse(
      c
        .inputInteractionSuccess('p1', 'STATUS', empty, 'DEGRADED')
        .replace('"version":1', '"version":1,"version":1'),
    ),
    null,
  );
  assert.equal(
    c.parseInputInteractionResponse(
      c.inputInteractionSuccess('p1', 'STATUS', empty, 'DEGRADED') + '\n',
    ),
    null,
  );
  assert.equal(c.inputInteractionSuccess('p1', 'OBSERVED', settled, 'AVAILABLE'), null);
});
test('receipt rejects aliased command/correlation identity and admits only exact schema11 result mappings', async () => {
  const { snapshotInputAudit } = await import('../src/input-audit-contract.ts');
  const actor = {
    outcome: 'DISPATCHED_UNCONFIRMED',
    code: 'OK',
    commandId: id,
    correlationId: '00000000-0000-4000-8000-000000000002',
    diagnosticId: null,
  };
  const wrap = (actor) => ({
    version: 1,
    evidence: 'NATIVE_INPUT_QUERY',
    actor,
    loggingHealth: 'AVAILABLE',
  });
  assert.equal(c.snapshotInputInteractionReceipt(wrap({ ...actor, correlationId: id })), null);
  assert.equal(
    c.snapshotInputInteractionReceipt(wrap({ ...actor, code: 'AUDIT_UNAVAILABLE' })),
    null,
  );
  for (const outcome of ['NOT_DISPATCHED', 'DISPATCHED_UNCONFIRMED', 'OUTCOME_UNKNOWN'])
    for (const code of ['OK', ...c.INPUT_INTERACTION_CODES]) {
      const expected = !!snapshotInputAudit({
        action: 'HOME',
        phase: 'RESULT',
        diagnosticId: '00000000-0000-4000-8000-000000000003',
        commandId: actor.commandId,
        correlationId: actor.correlationId,
        outcome,
        code,
      });
      assert.equal(
        !!c.snapshotInputInteractionReceipt(wrap({ ...actor, outcome, code })),
        expected,
        `${outcome}/${code}`,
      );
    }
  assert.ok(
    c.snapshotInputInteractionReceipt(
      wrap({
        ...actor,
        outcome: 'NOT_DISPATCHED',
        code: 'BUSY',
        commandId: null,
        correlationId: null,
      }),
    ),
  );
  assert.ok(
    c.snapshotInputInteractionReceipt(
      wrap({
        ...actor,
        outcome: 'OUTCOME_UNKNOWN',
        code: 'OUTCOME_UNKNOWN',
        commandId: null,
        correlationId: null,
      }),
    ),
  );
});
