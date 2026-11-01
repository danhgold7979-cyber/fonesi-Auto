import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAdbDiscovery as parse,
  snapshotDiscoveryRow,
  validTransportId,
  DISCOVERY_BYTES,
} from '../src/main/adb-discovery.ts';
test('discovery preserves exact opaque tokens, states and duplicate claims without identity inference', () => {
  const r = parse(
    'List of devices attached\r\nABC device usb:1-2 product:p model:A_B device:d transport_id:1\r\nABC offline transport_id:2\r\n192.0.2.1:5555 unauthorized\r\nemulator-5554 recovery transport_id:18446744073709551615\r\n\r\n',
  );
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.rows.map((x) => x.state),
    ['DEVICE', 'OFFLINE', 'UNAUTHORIZED', 'UNKNOWN'],
  );
  assert.equal(r.rows[0].serial, r.rows[1].serial);
  assert.equal(r.rows[2].transportId, null);
  assert.ok(Object.isFrozen(r.rows) && Object.isFrozen(r.rows[0]));
  assert.deepEqual(parse('List of devices attached\n\n'), { ok: true, rows: [] });
});
test('malformed discovery refuses entire observation; output never echoes input', () => {
  for (const suffix of [
    '\n\n',
    'A device\n\nB device',
    'A device bad:x',
    'A device transport_id:1 transport_id:2',
    'A device transport_id:0',
    'A device transport_id:01',
    'A device transport_id:18446744073709551616',
    'A no permissions',
    'A device model:',
    '-x device',
    'A device\r',
    'A device\0',
    'A device model:x\u00a0',
  ]) {
    assert.equal(parse('List of devices attached\n' + suffix).ok, false, suffix);
  }
  for (const x of [
    null,
    {},
    '',
    'daemon started\nList of devices attached\n',
    '\ufeffList of devices attached\n',
  ])
    assert.equal(parse(x).ok, false);
  assert.deepEqual(parse('x'.repeat(DISCOVERY_BYTES + 1)), { ok: false, code: 'DISCOVERY_LIMIT' });
  assert.equal(parse('List of devices attached\n' + 'A'.repeat(4097)).ok, false);
});
test('descriptor snapshots refuse getters/coercion/prototype and enforce transport uint64 decimal', () => {
  let reads = 0;
  const v = { serial: 'A', transportId: '1', state: 'DEVICE' };
  const copy = snapshotDiscoveryRow(v);
  v.serial = 'B';
  assert.equal(copy.serial, 'A');
  assert.equal(
    snapshotDiscoveryRow({
      ...v,
      get state() {
        reads++;
        return 'DEVICE';
      },
    }),
    null,
  );
  assert.equal(reads, 0);
  for (const x of [
    { ...v, extra: 1 },
    Object.create(v),
    { ...v, state: 'CONFLICT' },
    { ...v, serial: 123 },
    { ...v, transportId: 1 },
  ])
    assert.equal(snapshotDiscoveryRow(x), null);
  for (const x of ['0', '01', '-1', 1, '1\n', '18446744073709551616'])
    assert.equal(validTransportId(x), false);
});
