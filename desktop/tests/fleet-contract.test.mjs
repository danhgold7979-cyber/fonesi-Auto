import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFleetRequest,
  parseFleetResponse,
  snapshotFleetRequest,
  snapshotFleetSelection,
  snapshotFleetSnapshot,
  fleetSuccess,
  fleetError,
  FLEET_ERRORS,
} from '../src/fleet-contract.ts';
const id = (n) => `${n.toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`;
const selection = () => ({ selectedDeviceIds: [], activeDeviceId: null, groups: [] });
const snapshot = () => ({
  registryRevision: 0,
  availability: 'UNAVAILABLE',
  reason: 'LIVE_DISCOVERY_UNAVAILABLE',
  devices: [],
  selection: { revision: 0, ...selection() },
});
const read = { version: 1, requestId: 'f1', method: 'fleet.get' };
const replace = (s) => ({
  ...read,
  method: 'fleet.selection.replace',
  expectedRevision: 0,
  selection: s,
});
test('exact fleet request shapes, canonical IDs and immutable selection snapshots', () => {
  assert.equal(parseFleetRequest(JSON.stringify(read)).ok, true);
  const source = selection();
  source.selectedDeviceIds = [id(2), id(1)];
  source.groups = [{ groupId: id(3), deviceIds: [id(2)] }];
  const result = snapshotFleetRequest(replace(source));
  assert.ok(result);
  source.groups[0].deviceIds.length = 0;
  assert.deepEqual(result.selection.selectedDeviceIds, [id(1), id(2)]);
  assert.deepEqual(result.selection.groups[0].deviceIds, [id(2)]);
  assert.ok(Object.isFrozen(result.selection.groups[0].deviceIds));
  for (const requestId of ['f0', 'f01', 'p1', 'f9007199254740992', 'f1\n'])
    assert.equal(snapshotFleetRequest({ ...read, requestId }), null);
});
test('duplicate-aware JSON rejects decoded duplicates at every nested level', () => {
  for (const raw of [
    '{"version":1,"version":1,"requestId":"f1","method":"fleet.get"}',
    '{"version":1,"requestId":"f1","method":"fleet.get","\\u006dethod":"fleet.get"}',
    JSON.stringify(replace(selection())).replace('"groups":[]', '"groups":[],"groups":[]'),
    '{"version":1,}',
    '[] trailing',
  ])
    assert.equal(parseFleetRequest(raw).code, 'INVALID_JSON');
  const success = fleetSuccess('f1', 'OBSERVED', snapshot(), 'AVAILABLE');
  assert.equal(
    parseFleetResponse(
      success.replace('"registryRevision":0', '"registryRevision":0,"registryRevision":0'),
    ),
    null,
  );
});
test('fixed transport, version, method and UTF8 size failures never echo caller data', () => {
  assert.equal(parseFleetRequest({}).code, 'INVALID_TRANSPORT');
  assert.equal(parseFleetRequest(' '.repeat(16385)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(parseFleetRequest('é'.repeat(9000)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(
    parseFleetRequest(JSON.stringify({ ...read, version: 2 })).code,
    'UNSUPPORTED_VERSION',
  );
  assert.equal(
    parseFleetRequest(JSON.stringify({ ...read, method: 'shell' })).code,
    'UNKNOWN_METHOD',
  );
  for (const value of [
    { ...read, extra: true },
    { ...replace(selection()), expectedRevision: -0 },
    { ...replace(selection()), expectedRevision: 1.1 },
  ])
    assert.equal(snapshotFleetRequest(value), null);
});
test('selection bounds independently limit IDs, groups and total memberships without truncation', () => {
  assert.ok(
    snapshotFleetSelection({
      selectedDeviceIds: Array.from({ length: 128 }, (_, i) => id(i + 1)),
      activeDeviceId: null,
      groups: [],
    }),
  );
  assert.equal(
    snapshotFleetSelection({
      selectedDeviceIds: Array.from({ length: 129 }, (_, i) => id(i + 1)),
      activeDeviceId: null,
      groups: [],
    }),
    null,
  );
  assert.equal(
    snapshotFleetSelection({
      ...selection(),
      groups: Array.from({ length: 33 }, (_, i) => ({ groupId: id(i), deviceIds: [] })),
    }),
    null,
  );
  assert.equal(
    snapshotFleetSelection({
      ...selection(),
      groups: [
        { groupId: id(300), deviceIds: Array.from({ length: 128 }, (_, i) => id(i)) },
        { groupId: id(301), deviceIds: [id(500)] },
      ],
    }),
    null,
  );
  for (const value of [
    { ...selection(), selectedDeviceIds: [id(1), id(1)] },
    {
      ...selection(),
      groups: [
        { groupId: id(1), deviceIds: [] },
        { groupId: id(1), deviceIds: [] },
      ],
    },
    { ...selection(), selectedDeviceIds: new Array(1) },
  ])
    assert.equal(snapshotFleetSelection(value), null);
  let calls = 0;
  assert.equal(
    snapshotFleetSelection({
      ...selection(),
      get groups() {
        calls++;
        return [];
      },
    }),
    null,
  );
  assert.equal(calls, 0);
});
test('fleet public projection has no raw transport data and enforces generated labels and membership', () => {
  const value = {
    ...snapshot(),
    availability: 'OBSERVED',
    reason: null,
    devices: [
      {
        deviceId: id(1),
        generation: 1,
        label: 'Device 0001',
        state: 'OFFLINE',
        verification: 'VERIFIED',
      },
    ],
    selection: { revision: 1, selectedDeviceIds: [id(1)], activeDeviceId: id(1), groups: [] },
  };
  assert.ok(snapshotFleetSnapshot(value));
  for (const label of ['Device 0000', 'Device 0257', 'phone-a', 'Device 0001\n'])
    assert.equal(
      snapshotFleetSnapshot({ ...value, devices: [{ ...value.devices[0], label }] }),
      null,
    );
  assert.equal(
    snapshotFleetSnapshot({ ...value, devices: [{ ...value.devices[0], serial: 'private' }] }),
    null,
  );
  assert.equal(
    snapshotFleetSnapshot({ ...value, selection: { ...value.selection, activeDeviceId: id(2) } }),
    null,
  );
  assert.equal(
    snapshotFleetSnapshot({ ...value, availability: 'UNAVAILABLE', reason: 'BINARY_UNAVAILABLE' }),
    null,
  );
  assert.equal(
    snapshotFleetSnapshot({
      ...value,
      devices: [...value.devices, { ...value.devices[0], deviceId: id(2) }],
    }),
    null,
  );
});
test('response serializers preserve exact audit and errors, reject null available and malformed success', () => {
  for (const code of FLEET_ERRORS)
    assert.equal(parseFleetResponse(fleetError(code, null, 'DEGRADED')).code, code);
  assert.equal(
    parseFleetResponse(
      '{"version":1,"ok":false,"code":"TIMEOUT","diagnosticId":null,"auditHealth":"AVAILABLE"}',
    ),
    null,
  );
  assert.equal(JSON.parse(fleetError('private', id(1), 'AVAILABLE')).code, 'INTERNAL_FAILURE');
  assert.equal(fleetSuccess('f1', 'COMMITTED', snapshot(), 'AVAILABLE'), null);
  const result = parseFleetResponse(fleetSuccess('f1', 'APPLIED', snapshot(), 'DEGRADED'));
  assert.equal(result.outcome, 'APPLIED');
  assert.ok(Object.isFrozen(result.fleet.selection.groups));
  assert.equal(parseFleetResponse(' '.repeat(65537)), null);
  assert.equal(
    parseFleetResponse(
      fleetSuccess('f1', 'OBSERVED', snapshot(), 'AVAILABLE').replace(
        '"ok":true',
        '"ok":true,"private":"x"',
      ),
    ),
    null,
  );
});
