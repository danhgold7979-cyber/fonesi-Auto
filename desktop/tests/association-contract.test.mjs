import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotAssociationRequest,
  parseAssociationRequest,
  snapshotAssociationSnapshot,
  snapshotAssociationPhaseReceipt,
  associationSuccess,
  parseAssociationResponse,
  associationError,
} from '../src/association-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const idle = () => ({
  revision: 0,
  state: 'IDLE',
  operationId: null,
  code: 'OK',
  ceremonyId: null,
  mode: null,
  deviceId: null,
  stage: null,
  deadlineUtc: null,
  receipt: null,
  projectionCurrent: false,
  candidates: [],
  historical: [],
});
const receipt = () => ({
  version: 1,
  outcome: 'COMMITTED',
  code: 'OK',
  stage: 'BASELINE',
  ceremonyId: id(2),
  revision: 3,
  projectionCurrent: true,
  auditHealth: 'AVAILABLE',
});
const pending = () => ({
  ...idle(),
  revision: 1,
  state: 'BASELINE_PENDING',
  operationId: id(1),
  mode: 'CURRENT',
  deviceId: id(3),
  stage: 'BASELINE',
});
test('association request variants are exact scalar-only protocol, never operator assertions', () => {
  const reqs = [
    { method: 'association.get' },
    { method: 'association.candidates' },
    { method: 'association.begin', expectedRevision: 0, candidateId: id(4), mode: 'CURRENT' },
    {
      method: 'association.begin',
      expectedRevision: 1,
      candidateId: id(4),
      mode: 'HISTORICAL',
      deviceId: id(3),
    },
    ...['removal', 'return', 'confirm'].map((m) => ({
      method: `association.${m}`,
      expectedRevision: 2,
      ceremonyId: id(2),
    })),
    { method: 'association.cancel', expectedRevision: 1, operationId: id(1) },
  ];
  for (const fields of reqs) {
    const r = { version: 1, requestId: 'p1', ...fields };
    assert.ok(snapshotAssociationRequest(r));
    assert.equal(parseAssociationRequest(JSON.stringify(r)).ok, true);
    assert.equal(snapshotAssociationRequest({ ...r, attestation: true }), null);
  }
  for (const value of [-0, -1, 1.1, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, '0'])
    assert.equal(
      snapshotAssociationRequest({
        version: 1,
        requestId: 'p1',
        method: 'association.begin',
        expectedRevision: value,
        candidateId: id(4),
        mode: 'CURRENT',
      }),
      null,
    );
  let getters = 0;
  const r = {
    version: 1,
    requestId: 'p1',
    get method() {
      getters++;
      return 'association.get';
    },
  };
  assert.equal(snapshotAssociationRequest(r), null);
  assert.equal(getters, 0);
  assert.equal(
    parseAssociationRequest('{"version":1,"version":1,"requestId":"p1","method":"association.get"}')
      .code,
    'INVALID_JSON',
  );
  assert.equal(
    parseAssociationRequest('{"version":2,"requestId":"p1","method":"association.get"}').code,
    'UNSUPPORTED_VERSION',
  );
  assert.equal(parseAssociationRequest(' '.repeat(16385)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(parseAssociationRequest({}).code, 'INVALID_TRANSPORT');
});
test('snapshot distinguishes facade pending IDs, actual lower receipts and late cancelled committed history', () => {
  assert.ok(snapshotAssociationSnapshot(idle()));
  assert.ok(snapshotAssociationSnapshot(pending()));
  assert.equal(
    snapshotAssociationSnapshot({ ...pending(), ceremonyId: id(2), deadlineUtc: 121000 }),
    null,
  );
  const terminal = {
    ...pending(),
    revision: 2,
    state: 'AWAIT_REMOVAL',
    ceremonyId: id(2),
    deadlineUtc: 121000,
    receipt: receipt(),
    projectionCurrent: true,
  };
  assert.ok(snapshotAssociationSnapshot(terminal));
  assert.ok(
    snapshotAssociationSnapshot({
      ...terminal,
      revision: 3,
      state: 'REMOVAL_PENDING',
      stage: 'REMOVAL',
      projectionCurrent: false,
    }),
  );
  assert.ok(
    snapshotAssociationSnapshot({
      ...terminal,
      revision: 3,
      state: 'CANCELLED',
      code: 'CANCELLED',
      projectionCurrent: false,
    }),
  );
  assert.ok(
    snapshotAssociationSnapshot({
      ...terminal,
      revision: 4,
      state: 'CLOSED',
      code: 'CLOSED',
      projectionCurrent: false,
      receipt: { ...receipt(), auditHealth: 'DEGRADED' },
    }),
  );
  assert.equal(
    snapshotAssociationSnapshot({
      ...terminal,
      state: 'OUTCOME_UNKNOWN',
      code: 'OUTCOME_UNKNOWN',
      projectionCurrent: false,
    }),
    null,
  );
  assert.equal(snapshotAssociationSnapshot({ ...terminal, operationId: id(2) }), null);
  assert.equal(
    snapshotAssociationPhaseReceipt({
      ...receipt(),
      outcome: 'NOT_COMMITTED',
      revision: null,
      projectionCurrent: false,
    }),
    null,
  );
  assert.equal(snapshotAssociationPhaseReceipt({ ...receipt(), serial: 'private' }), null);
});
test('candidate inventories unique bounded complete; responses canonical and byte capped', () => {
  const snap = {
    ...idle(),
    candidates: [
      { candidateId: id(4), mode: 'CURRENT', deviceId: id(3) },
      { candidateId: id(5), mode: 'HISTORICAL', deviceId: null },
    ],
    historical: [{ deviceId: id(6), generation: 1 }],
  };
  const raw = associationSuccess('p1', 'OBSERVED', snap, id(9), 'AVAILABLE');
  assert.ok(raw);
  assert.ok(parseAssociationResponse(raw));
  assert.equal(
    parseAssociationResponse(raw.replace('"version":1', '"version":1,"version":1')),
    null,
  );
  assert.equal(parseAssociationResponse(raw + ' '), null);
  assert.equal(
    snapshotAssociationSnapshot({ ...snap, candidates: [snap.candidates[0], snap.candidates[0]] }),
    null,
  );
  assert.equal(
    snapshotAssociationSnapshot({
      ...snap,
      candidates: [{ candidateId: id(4), mode: 'HISTORICAL', deviceId: id(3) }],
    }),
    null,
  );
  const huge = {
    ...idle(),
    candidates: Array.from({ length: 256 }, (_, i) => ({
      candidateId: id(100 + i),
      mode: 'CURRENT',
      deviceId: id(500 + i),
    })),
    historical: [],
  };
  assert.ok(snapshotAssociationSnapshot(huge));
  assert.equal(associationSuccess('p1', 'OBSERVED', huge, id(9), 'AVAILABLE'), null);
  assert.equal(
    parseAssociationResponse(associationError(null, 'TIMEOUT', null, 'DEGRADED')).code,
    'TIMEOUT',
  );
  assert.equal(associationSuccess('p1', 'OBSERVED', idle(), null, 'AVAILABLE'), null);
});
