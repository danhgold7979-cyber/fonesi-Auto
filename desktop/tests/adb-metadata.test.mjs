import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAdbMetadata as parse,
  staleMetadata,
  METADATA_BYTES,
} from '../src/main/adb-metadata.ts';
const p = (field, text) => parse(field, text, 1000);
test('fixed scalar property formats retain time/source and explicit unavailable values', () => {
  for (const [field, text, value] of [
    ['MODEL', 'Synthetic Phone\n', 'Synthetic Phone'],
    ['MANUFACTURER', 'Fixture', 'Fixture'],
    ['OS', '14', '14'],
    ['SDK', '34\n', 34],
    ['LOCALE', 'vi-VN', 'vi-VN'],
  ]) {
    const r = p(field, text);
    assert.equal(r.available, true);
    assert.equal(r.value, value);
    assert.equal(r.observedUtc, 1000);
    assert.equal(r.source, 'ADB_TEXT');
    assert.ok(Object.isFrozen(r));
  }
  for (const field of ['MODEL', 'SDK', 'BATTERY']) {
    assert.equal(p(field, '').reason, 'UNAVAILABLE');
    assert.equal('value' in p(field, ''), false);
  }
  assert.equal(p('SDK', '0').available, false);
  assert.equal(p('SDK', '034').available, false);
  assert.equal(p('MODEL', 'private\nsecondline').available, false);
  assert.equal(p('LOCALE', 'a').available, false);
  assert.equal(p('MODEL', '\ud800').available, false);
});
test('resolution/density honor exact physical then override format without partial acceptance', () => {
  assert.deepEqual(p('RESOLUTION', 'Physical size: 1080x2400\nOverride size: 720x1600\n').value, {
    width: 720,
    height: 1600,
  });
  assert.equal(p('DENSITY', 'Physical density: 420\r\nOverride density: 320\r\n').value, 320);
  for (const [field, text] of [
    ['RESOLUTION', 'Physical size: 0x1'],
    ['RESOLUTION', 'Override size: 1x1'],
    ['DENSITY', 'Physical density: 420\nPhysical density: 320'],
    ['DENSITY', 'Physical density: 420\nunknown'],
  ])
    assert.equal(p(field, text).available, false);
});
test('battery units and storage invariants cannot synthesize zero for missing or malformed fields', () => {
  const b =
    'Current Battery Service state:\n  AC powered: false\n  present: true\n  level: 25\n  scale: 50\n  technology: Li-ion\n';
  assert.equal(p('BATTERY', b).value, 50);
  assert.equal(p('BATTERY', b.replace('25', '0')).value, 0);
  for (const text of [
    b + '  level: 1\n',
    b.replace('  scale: 50\n', ''),
    b.replace('25', '51'),
    b.replace('false', 'no'),
    b.replace('technology', 'vendorExtra'),
  ])
    assert.equal(p('BATTERY', text).available, false);
  assert.equal(p('BATTERY', b.replace('present: true', 'present: false')).reason, 'UNAVAILABLE');
  const d =
    'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/fixture 1000 200 700 20% /data\n';
  assert.deepEqual(p('STORAGE', d).value, { total: 1000, used: 200, available: 700 });
  assert.equal(p('STORAGE', d).units, 'KIB');
  for (const text of [
    d.replace('700', '900'),
    d.replace('/data', '/private'),
    d + 'other\n',
    d.replace('1000', '9007199254740992'),
  ])
    assert.equal(p('STORAGE', text).available, false);
});
test('metadata limits and stale projection preserve prior observation, invalid envelopes do not guess', () => {
  const r = p('SDK', '34');
  const stale = staleMetadata(r);
  assert.equal(stale.stale, true);
  assert.equal(stale.observedUtc, 1000);
  assert.equal(r.stale, false);
  assert.equal(p('MODEL', 'x'.repeat(METADATA_BYTES + 1)).reason, 'METADATA_LIMIT');
  assert.equal(p('MODEL', 'é'.repeat(METADATA_BYTES)).reason, 'METADATA_LIMIT');
  for (const time of [-0, -1, NaN, Infinity, '1', 8640000000000001])
    assert.equal(parse('SDK', '34', time), null);
  assert.equal(parse('UNKNOWN', '34', 1), null);
  assert.equal(p('SDK', {}).reason, 'INVALID_METADATA');
});
