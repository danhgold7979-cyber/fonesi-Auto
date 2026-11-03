import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotMetadataQueryRequest,
  snapshotMetadataQueryFacts,
  snapshotQueryRetirement,
  validMetadataTransportId,
  validMetadataDeadline,
} from '../src/main/metadata-query-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const request = () => ({
  version: 3,
  kind: 'METADATA_QUERY',
  commandId: id(1),
  correlationId: id(2),
  ownerId: id(3),
  deviceId: id(4),
  bindingId: id(5),
  generation: 0,
  serial: 'fixture',
  transportId: '1',
  field: 'MODEL',
  deadlineUtc: 100,
});
const facts = () => ({
  version: 1,
  kind: 'METADATA_QUERY',
  status: 'COMPLETE',
  code: 'OK',
  dispatched: true,
  operationRetired: true,
  stdoutBase64: Buffer.from('model').toString('base64'),
  stderrBase64: '',
  remoteExitCode: 0,
  observedAtUtc: 10,
});
test('metadata query request is an exact immutable transport-bound value', () => {
  const input = request(),
    value = snapshotMetadataQueryRequest(input);
  assert.deepEqual(value, input);
  assert(Object.isFrozen(value));
  input.transportId = '2';
  assert.equal(value.transportId, '1');
  for (const bad of [
    { ...request(), transportId: '1\n' },
    { ...request(), serial: 'fixture\n' },
    { ...request(), generation: -0 },
    { ...request(), commandId: id(1) + '\n' },
    { ...request(), field: 'MODEL;id' },
    { ...request(), extra: true },
    { ...request(), version: 1 },
  ])
    assert.equal(snapshotMetadataQueryRequest(bad), null);
  let invoked = 0;
  const hostile = { ...request() };
  Object.defineProperty(hostile, 'transportId', {
    enumerable: true,
    get() {
      invoked++;
      return '1';
    },
  });
  assert.equal(snapshotMetadataQueryRequest(hostile), null);
  assert.equal(invoked, 0);
});
test('metadata transport and deadline boundaries are absolute, noncoercing and canonical', () => {
  assert(validMetadataTransportId('18446744073709551615'));
  for (const v of ['18446744073709551616', '0', '01', '1\r\n', 1, {}, ''])
    assert.equal(validMetadataTransportId(v), false);
  assert(validMetadataDeadline(8640000000000000));
  for (const v of [8640000000000001, -0, -1, Infinity, NaN, '1', {}])
    assert.equal(validMetadataDeadline(v), false);
});
test('metadata complete retains remote nonzero/stderr without inventing a process result', () => {
  const v = snapshotMetadataQueryFacts({
    ...facts(),
    remoteExitCode: 7,
    stderrBase64: Buffer.from('error').toString('base64'),
  });
  assert.equal(v.remoteExitCode, 7);
  assert(Object.isFrozen(v));
  assert.equal('exitCode' in v, false);
  for (const bad of [
    { ...facts(), operationRetired: false },
    { ...facts(), remoteExitCode: null },
    { ...facts(), remoteExitCode: -0 },
    { ...facts(), remoteExitCode: 256 },
    { ...facts(), stdoutBase64: 'YQ==' + '\n' },
    { ...facts(), stdoutBase64: 'Yh==' },
    { ...facts(), stdoutBase64: Buffer.from([255]).toString('base64') },
    { ...facts(), stdoutBase64: Buffer.from('\ufeffx').toString('base64') },
    { ...facts(), stdoutBase64: Buffer.from('a\0b').toString('base64') },
  ])
    assert.equal(snapshotMetadataQueryFacts(bad), null);
});
test('metadata payload and actual maximum serialized frame stay inside unchanged caps', () => {
  const v = {
    ...facts(),
    stdoutBase64: Buffer.alloc(16384, 97).toString('base64'),
    stderrBase64: Buffer.alloc(16384, 98).toString('base64'),
  };
  assert(snapshotMetadataQueryFacts(v));
  const frame =
    JSON.stringify({
      version: 3,
      sessionId: id(1),
      requestId: Number.MAX_SAFE_INTEGER,
      attemptId: id(2),
      operation: 'METADATA',
      result: v,
    }) + '\n';
  assert(Buffer.byteLength(frame) < 65536);
  assert.equal(
    snapshotMetadataQueryFacts({ ...v, stderrBase64: Buffer.alloc(16385, 98).toString('base64') }),
    null,
  );
});
test('metadata failure and retirement remain distinct closed facts', () => {
  const failed = {
    ...facts(),
    status: 'FAILED',
    code: 'NATIVE_FAILED',
    stdoutBase64: null,
    stderrBase64: null,
    remoteExitCode: null,
    observedAtUtc: null,
  };
  assert(snapshotMetadataQueryFacts(failed));
  assert(
    snapshotMetadataQueryFacts({
      ...failed,
      status: 'UNRETIRED',
      code: 'UNRETIRED',
      operationRetired: false,
    }),
  );
  assert.equal(snapshotMetadataQueryFacts({ ...failed, operationRetired: false }), null);
  assert.equal(snapshotMetadataQueryFacts({ ...failed, code: 'private' }), null);
  assert.deepEqual(snapshotQueryRetirement({ status: 'RETIRED' }), { status: 'RETIRED' });
  assert.equal(snapshotQueryRetirement({ status: 'RETIRED', exitCode: 0 }), null);
});
