import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DEMO_PREFERENCES as defaults,
  parseDemoPreferences,
  serializeDemoPreferences,
  snapshotDemoPreferences,
  createDemoPreferences,
  DEMO_PREFERENCE_KEY,
} from '../demo/preferences.ts';
import { DEMO_SNAPSHOT, DEMO_CANARY, DEMO_DATE } from '../demo/fixtures.ts';
function storage(initial = null) {
  let value = initial;
  const operations = [];
  return {
    operations,
    get value() {
      return value;
    },
    read: () => {
      operations.push('read');
      return value;
    },
    write: (next) => {
      operations.push('write');
      value = next;
    },
    remove: () => {
      operations.push('remove');
      value = null;
    },
  };
}
test('demo fixed inventory is deeply immutable, namespaced and never connected', () => {
  assert.match(DEMO_CANARY, /^FONESI_DEMO_FIXTURE_BUNDLE_/);
  assert.equal(DEMO_DATE, '2026-10-31');
  assert.equal(DEMO_SNAPSHOT.status, 'READY');
  assert.equal(DEMO_SNAPSHOT.provenance, 'SYNTHETIC_TEST');
  for (const [key, count] of [
    ['devices', 3],
    ['accounts', 3],
    ['media', 25],
    ['jobs', 3],
  ]) {
    const rows = DEMO_SNAPSHOT[key];
    assert.equal(rows.length, count);
    assert.ok(Object.isFrozen(rows));
    for (const row of rows) {
      assert.ok(Object.isFrozen(row));
      assert.match(row.id, /^DEMO-/);
      assert.match(row.name, /^DEMO/);
    }
  }
  assert.ok(Object.isFrozen(DEMO_SNAPSHOT));
  assert.equal(new Set(DEMO_SNAPSHOT.accounts.map((a) => a.target)).size, 3);
  for (const row of DEMO_SNAPSHOT.devices) assert.equal(row.status, 'OFFLINE');
  for (const row of [...DEMO_SNAPSHOT.accounts, ...DEMO_SNAPSHOT.jobs])
    assert.equal(row.status, 'UNAVAILABLE');
  for (const row of DEMO_SNAPSHOT.media) assert.ok(Object.isFrozen(row.comments));
});
test('exact preference grammar accepts whitespace/order but rejects duplicate decoded keys and malformed bounds', () => {
  const raw = serializeDemoPreferences(defaults);
  for (const prefix of ['\u00a0', '\ufeff']) assert.equal(parseDemoPreferences(prefix + raw), null);
  assert.deepEqual(parseDemoPreferences(raw.replace('theme', 'th\\u0065me')), defaults);
  assert.deepEqual(parseDemoPreferences(raw), defaults);
  assert.deepEqual(
    parseDemoPreferences(' { "tileWidth":150, "theme":"LIGHT", "version":1, "dockWidth":null } '),
    defaults,
  );
  for (const raw of [
    '{"version":1,"theme":"LIGHT","theme":"DARK","dockWidth":null,"tileWidth":150}',
    '{"version":1,"theme":"LIGHT","th\\u0065me":"DARK","dockWidth":null,"tileWidth":150}',
    'x'.repeat(513),
    '{}',
    '[]',
    'null',
    '{"version":1,}',
    '{"version":1,"theme":{},"dockWidth":null,"tileWidth":150}',
  ])
    assert.equal(parseDemoPreferences(raw), null);
  for (const patch of [
    { version: 2 },
    { theme: 'SYSTEM' },
    { dockWidth: 299 },
    { dockWidth: 16385 },
    { dockWidth: -0 },
    { tileWidth: 69 },
    { tileWidth: 521 },
    { tileWidth: NaN },
    { tileWidth: Infinity },
    { tileWidth: '150' },
    { extra: true },
  ])
    assert.equal(snapshotDemoPreferences({ ...defaults, ...patch }), null);
  for (const dockWidth of [null, 300, 16384])
    for (const tileWidth of [70, 520])
      assert.ok(snapshotDemoPreferences({ ...defaults, dockWidth, tileWidth }));
});
test('snapshot reads descriptors only and does not coerce caller fields', () => {
  let called = 0;
  const value = { ...defaults };
  Object.defineProperty(value, 'theme', {
    get() {
      called++;
      return 'LIGHT';
    },
  });
  assert.equal(snapshotDemoPreferences(value), null);
  assert.equal(called, 0);
  assert.equal(snapshotDemoPreferences(Object.create(defaults)), null);
  assert.equal(snapshotDemoPreferences({ ...defaults, [Symbol('extra')]: 1 }), null);
  const input = { ...defaults };
  const snap = snapshotDemoPreferences(input);
  input.theme = 'DARK';
  assert.equal(snap.theme, 'LIGHT');
  assert.ok(Object.isFrozen(snap));
});
test('session writes require exact readback and never claim durable retention', () => {
  const disk = storage();
  const controller = createDemoPreferences(disk);
  assert.equal(controller.read().status, 'SESSION_ONLY');
  assert.equal(controller.update({ ...defaults, theme: 'DARK' }).status, 'SESSION_ONLY');
  assert.equal(disk.value, serializeDemoPreferences({ ...defaults, theme: 'DARK' }));
  assert.deepEqual(disk.operations, ['read', 'write', 'read']);
  assert.equal(DEMO_PREFERENCE_KEY, 'fonesi.demo.preferences.v1');
  const lying = createDemoPreferences({ read: () => null, write: () => {}, remove: () => {} });
  assert.equal(lying.update({ ...defaults, theme: 'DARK' }).status, 'NOT_SAVED');
  assert.equal(lying.read().value.theme, 'DARK');
});
test('malformed storage resets only demo key and every denied operation remains visibly unsaved', () => {
  const bad = storage('bad');
  assert.deepEqual(createDemoPreferences(bad).read().value, defaults);
  assert.deepEqual(bad.operations, ['read', 'remove', 'read']);
  for (const part of ['read', 'write', 'remove']) {
    const disk = storage(part === 'remove' ? 'bad' : null);
    disk[part] = () => {
      throw Error('PRIVATE');
    };
    const controller = createDemoPreferences(disk);
    const result =
      part === 'write' ? controller.update({ ...defaults, theme: 'DARK' }) : controller.read();
    assert.equal(result.status, 'NOT_SAVED');
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
  assert.equal(createDemoPreferences(null).read().status, 'NOT_SAVED');
});
