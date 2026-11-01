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

// Source-derived key grammar, synthetic values; not a device capture.
// BatteryService 0d30c78c8953adfc969a8dba8a58a8ea3571908c, blob
// 66e904bd4ff66636549a46671fba5c28585b788f, no-argument dumpInternal.
const pinnedBattery = `Current Battery Service state:
  AC powered: false
  USB powered: true
  Wireless powered: false
  Dock powered: false
  Max charging current: 500000
  Max charging voltage: 5000000
  Charge counter: 1000000
  status: 2
  health: 2
  present: true
  level: 75
  scale: 100
  voltage: 4000
  temperature: 250
  technology: Li-ion
  Charging state: 1
  Charging policy: 0
`;
test('pinned battery profile accepts complete source-derived keys and opaque nonnegative int32s', () => {
  const result = p('BATTERY', pinnedBattery);
  assert.equal(result.available, true);
  assert.equal(result.value, 75);
  assert.equal(result.units, 'PERCENT');
  assert.equal('raw' in result, false);
  for (const key of ['Charging state', 'Charging policy']) {
    for (const value of ['0', '6', '2147483647']) {
      const text = pinnedBattery.replace(new RegExp(`  ${key}: [0-9]+`), `  ${key}: ${value}`);
      assert.equal(p('BATTERY', text).value, 75);
    }
  }
  assert.equal(p('BATTERY', pinnedBattery.replaceAll('\n', '\r\n')).value, 75);
  assert.equal(
    p('BATTERY', pinnedBattery.replace('present: true', 'present: false')).reason,
    'UNAVAILABLE',
  );
});
test('either pinned charging key selects all seventeen unique mandatory fields and scale100', () => {
  const lines = pinnedBattery.trimEnd().split('\n');
  for (let i = 1; i < lines.length; i++) {
    const missing = lines.filter((_, index) => index !== i).join('\n') + '\n';
    assert.equal(p('BATTERY', missing).reason, 'INVALID_METADATA', `missing ${lines[i]}`);
    assert.equal(p('BATTERY', pinnedBattery + lines[i] + '\n').reason, 'INVALID_METADATA');
  }
  for (const scale of ['0', '50', '101', '0100'])
    assert.equal(
      p('BATTERY', pinnedBattery.replace('scale: 100', `scale: ${scale}`)).reason,
      'INVALID_METADATA',
    );
  assert.equal(
    p('BATTERY', pinnedBattery.replace('level: 75', 'level: 101')).reason,
    'INVALID_METADATA',
  );
});
test('pinned battery grammar refuses unknown keys, warnings, options and malformed charging scalars', () => {
  for (const key of ['Charging state', 'Charging policy']) {
    for (const value of [
      '-0',
      '-1',
      '01',
      '2147483648',
      'NaN',
      '',
      '1.0',
      ' 1',
      '1 ',
      '1\t',
      '1\0',
      '1\r2',
      '1\u0085',
    ]) {
      const text = pinnedBattery.replace(new RegExp(`  ${key}: [0-9]+`), `  ${key}: ${value}`);
      assert.equal(p('BATTERY', text).reason, 'INVALID_METADATA');
    }
    assert.equal(
      p('BATTERY', pinnedBattery.replace(key, key.toLowerCase())).reason,
      'INVALID_METADATA',
    );
  }
  for (const text of [
    pinnedBattery + '  vendorExtra: 1\n',
    pinnedBattery.replace(
      '  AC powered:',
      "  (UPDATES STOPPED -- use 'reset' to restart)\n  AC powered:",
    ),
    'Battery service (battery) commands:\n',
    '--proto\n',
    pinnedBattery.replace('technology: Li-ion', 'technology: '),
    pinnedBattery.replace('Charge counter: 1000000', 'Charge counter: -1'),
  ])
    assert.equal(p('BATTERY', text).reason, 'INVALID_METADATA');
});
