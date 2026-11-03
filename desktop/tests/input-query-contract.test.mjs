import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INPUT_QUERY_ACTIONS,
  snapshotInputQueryRequest,
  snapshotInputQueryFacts,
  validInputTransportId,
  validInputDeadline,
} from '../src/main/input-query-contract.ts';
import { inputArguments } from '../src/main/input-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const request = () => ({
  version: 4,
  kind: 'INPUT_QUERY',
  commandId: id(1),
  correlationId: id(2),
  ownerId: id(3),
  deviceId: id(4),
  bindingId: id(5),
  generation: 0,
  serial: 'fixture',
  transportId: '1',
  action: 'HOME',
  deadlineUtc: 100,
  display: null,
});
const facts = () => ({
  version: 1,
  kind: 'INPUT_QUERY',
  status: 'COMPLETE',
  code: 'OK',
  dispatched: true,
  operationRetired: true,
  remoteExitCode: 0,
  stdoutEmpty: true,
  stderrEmpty: true,
  observedAtUtc: 10,
});
test('input v4 exact nine-action request is immutable and rejects coordinate/text/argv authority', () => {
  for (const action of INPUT_QUERY_ACTIONS) {
    const raw = { ...request(), action };
    const value = snapshotInputQueryRequest(raw);
    assert.deepEqual(value, raw);
    assert(Object.isFrozen(value));
    raw.transportId = '2';
    assert.equal(value.transportId, '1');
  }
  for (const extra of [
    { action: 'TAP' },
    { correlationId: id(1) },
    { action: 'TEXT' },
    { action: 'HOME;id' },
    { display: {} },
    { transportId: '01' },
    { commandId: id(1) + '\n' },
    { version: 3 },
    { argv: [] },
    { deadlineUtc: -0 },
  ])
    assert.equal(snapshotInputQueryRequest({ ...request(), ...extra }), null);
  let calls = 0;
  const raw = request();
  Object.defineProperty(raw, 'action', {
    enumerable: true,
    get() {
      calls++;
      return 'HOME';
    },
  });
  assert.equal(snapshotInputQueryRequest(raw), null);
  assert.equal(calls, 0);
});
test('input action table matches existing fixed non-coordinate argument mapping', () => {
  const numbers = [3, 4, 66, 111, 19, 20, 21, 22, 23];
  for (const [i, action] of INPUT_QUERY_ACTIONS.entries()) {
    const command =
      action === 'HOME' || action === 'BACK' ? { kind: action } : { kind: 'KEY', key: action };
    const { kind, transportId, action: ignored, ...base } = request();
    void kind;
    void transportId;
    void ignored;
    assert.deepEqual(inputArguments({ ...base, version: 2, operation: command }), [
      'input',
      'keyboard',
      '-d',
      '0',
      'keyevent',
      String(numbers[i]),
    ]);
  }
});
test('input facts retain honest remote exit and empty flags, never process or raw output evidence', () => {
  for (const remoteExitCode of [0, 7, 255]) {
    const v = snapshotInputQueryFacts({ ...facts(), remoteExitCode, stderrEmpty: false });
    assert.equal(v.remoteExitCode, remoteExitCode);
    assert(Object.isFrozen(v));
    assert.equal('exitCode' in v, false);
  }
  for (const extra of [
    { remoteExitCode: null },
    { remoteExitCode: 256 },
    { remoteExitCode: -0 },
    { stdoutEmpty: 0 },
    { stderrEmpty: null },
    { stdoutBase64: '' },
    { operationRetired: false },
    { dispatched: false },
    { kind: 'METADATA_QUERY' },
  ])
    assert.equal(snapshotInputQueryFacts({ ...facts(), ...extra }), null);
});
test('input failed/unretired tuples cannot invent completion and have a closed native code set', () => {
  const failed = {
    ...facts(),
    status: 'FAILED',
    code: 'BUSY',
    dispatched: false,
    remoteExitCode: null,
    stdoutEmpty: null,
    stderrEmpty: null,
    observedAtUtc: null,
  };
  assert(snapshotInputQueryFacts(failed));
  assert(
    snapshotInputQueryFacts({
      ...failed,
      status: 'UNRETIRED',
      code: 'UNRETIRED',
      operationRetired: false,
    }),
  );
  for (const extra of [
    { code: 'AUDIT_UNAVAILABLE' },
    { code: 'METADATA_REJECTED' },
    { remoteExitCode: 0 },
    { stdoutEmpty: true },
    { observedAtUtc: 0 },
    { operationRetired: false },
  ])
    assert.equal(snapshotInputQueryFacts({ ...failed, ...extra }), null);
});
test('input transport/deadline canonical caps and maximum fact frame remain bounded', () => {
  assert(validInputTransportId('18446744073709551615'));
  for (const v of ['0', '01', '1\n', '18446744073709551616', 1])
    assert.equal(validInputTransportId(v), false);
  assert(validInputDeadline(8640000000000000));
  for (const v of [-0, -1, 8640000000000001, NaN, '1']) assert.equal(validInputDeadline(v), false);
  assert(
    Buffer.byteLength(
      JSON.stringify({
        version: 4,
        sessionId: id(1),
        requestId: Number.MAX_SAFE_INTEGER,
        attemptId: id(2),
        operation: 'INPUT',
        result: facts(),
      }) + '\n',
    ) < 65536,
  );
});
