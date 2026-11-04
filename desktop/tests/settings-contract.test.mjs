import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFERENCES,
  DEFAULT_NATIVE_WINDOW,
  snapshotPreferences,
  snapshotPatch,
  snapshotNativeWindowState,
  snapshotSettings,
  validSettingsRevision,
  parseSettingsRequest,
  settingsSuccess,
  settingsError,
  parseSettingsResponse,
  SETTINGS_ERRORS,
} from '../src/settings-contract.ts';
const full = () => ({ revision: 0, ...DEFAULT_PREFERENCES, ...DEFAULT_NATIVE_WINDOW });
const pub = () => ({ revision: 0, ...DEFAULT_PREFERENCES, persistence: 'PERSISTED' });
const req = (method = 'preferences.get', extra = {}) => ({
  version: 1,
  requestId: 'r_1-A',
  method,
  ...extra,
});
const read = (x) => parseSettingsRequest(JSON.stringify(x));
test('reference defaults flat snapshots and all scalar bounds', () => {
  assert.deepEqual(DEFAULT_PREFERENCES, { theme: 'LIGHT', dockWidth: null, tileWidth: 150 });
  assert.deepEqual(snapshotSettings(full()), full());
  for (const revision of [0, 1, Number.MAX_SAFE_INTEGER])
    assert.equal(validSettingsRevision(revision), true);
  for (const revision of [-0, -1, 1.5, Infinity, NaN, '1', true])
    assert.equal(validSettingsRevision(revision), false);
  for (const dockWidth of [null, 300, 16384])
    for (const tileWidth of [70, 151, 520])
      assert.ok(snapshotPreferences({ theme: 'DARK', dockWidth, tileWidth }));
  for (const patch of [
    { theme: 'SYSTEM' },
    { dockWidth: 299 },
    { dockWidth: 16385 },
    { tileWidth: 69 },
    { tileWidth: 521 },
    { tileWidth: -0 },
    { tileWidth: NaN },
    { nativeBounds: null },
    {},
  ])
    assert.equal(snapshotPatch(patch), null);
});
test('native signed coordinates complete tuples and frozen caller snapshots', () => {
  const input = {
    normalBounds: { x: -2147483648, y: 2147483647, width: 1, height: 16384 },
    maximized: true,
  };
  const out = snapshotNativeWindowState(input);
  input.normalBounds.width = 2;
  assert.equal(out.normalBounds.width, 1);
  assert.ok(Object.isFrozen(out.normalBounds));
  for (const bad of [
    { normalBounds: { x: 0, y: 0, width: 1 }, maximized: false },
    { normalBounds: { x: 2147483648, y: 0, width: 1, height: 1 }, maximized: false },
    { normalBounds: { x: 0, y: 0, width: 0, height: 1 }, maximized: false },
    { normalBounds: null, maximized: 1 },
  ])
    assert.equal(snapshotNativeWindowState(bad), null);
  assert.equal(snapshotSettings({ ...full(), extra: 1 }), null);
});
test('descriptor only no getter execution inherited fields symbols or coercion', () => {
  let calls = 0;
  const value = { dockWidth: null, tileWidth: 150 };
  Object.defineProperty(value, 'theme', {
    enumerable: true,
    get() {
      calls++;
      return 'LIGHT';
    },
  });
  assert.equal(snapshotPreferences(value), null);
  assert.equal(snapshotPatch(Object.create({ theme: 'LIGHT' })), null);
  assert.equal(snapshotPatch({ theme: 'LIGHT', [Symbol()]: 1 }), null);
  assert.equal(
    snapshotPatch({
      tileWidth: {
        valueOf() {
          calls++;
          return 150;
        },
      },
    }),
    null,
  );
  assert.equal(calls, 0);
  const p = snapshotPatch({ theme: 'DARK' });
  assert.ok(Object.isFrozen(p));
  assert.deepEqual(p, { theme: 'DARK' });
});
test('all four requests exact variants accept whitespace ordering and escaped valid keys', () => {
  for (const method of [
    'preferences.get',
    'preferences.update',
    'preferences.reset',
    'preferences.restorePrevious',
  ]) {
    const r = req(
      method,
      method === 'preferences.get'
        ? {}
        : method === 'preferences.update'
          ? { expectedRevision: 0, patch: { theme: 'DARK', dockWidth: 510, tileWidth: 151 } }
          : { expectedRevision: 0 },
    );
    assert.deepEqual(read(r), { ok: true, value: r });
  }
  assert.equal(
    parseSettingsRequest(' { "method":"preferences.get", "requestId":"r", "\\u0076ersion":1 } ').ok,
    true,
  );
});
test('nested decoded duplicate keys and malformed grammar fail without echo', () => {
  for (const raw of [
    '{"version":1,"version":1,"requestId":"r","method":"preferences.get"}',
    '{"version":1,"requestId":"r","method":"preferences.update","expectedRevision":0,"patch":{"theme":"LIGHT","\\u0074heme":"DARK"}}',
    '{"version":1,}',
    '[]',
    'null',
    '{"a":NaN}',
    '{"a":01}',
    '{"a":"\\q"}',
    '{"a":{"b":{"c":1}}}',
    '{"a":true} trailing',
  ])
    assert.equal(parseSettingsRequest(raw).ok, false);
});
test('size transport version method and exact shape errors', () => {
  assert.deepEqual(parseSettingsRequest({}), { ok: false, code: 'INVALID_TRANSPORT' });
  assert.equal(parseSettingsRequest(' '.repeat(1025)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(parseSettingsRequest('é'.repeat(513)).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(read({ ...req(), version: 2 }).code, 'UNSUPPORTED_VERSION');
  assert.equal(read({ ...req(), method: 'secret.read' }).code, 'UNKNOWN_METHOD');
  for (const value of [
    { ...req(), extra: 1 },
    req('preferences.reset'),
    req('preferences.reset', { expectedRevision: 0, patch: { theme: 'DARK' } }),
    req('preferences.update', { expectedRevision: -1, patch: { theme: 'DARK' } }),
    req('preferences.update', { expectedRevision: 0, patch: { normalBounds: null } }),
    { ...req(), requestId: '' },
    { ...req(), requestId: 'é' },
    { ...req(), requestId: 'x'.repeat(33) },
  ])
    assert.equal(read(value).ok, false);
  assert.equal(
    parseSettingsRequest(
      '{"version":1,"requestId":"r","method":"preferences.reset","expectedRevision":-0}',
    ).code,
    'INVALID_SHAPE',
  );
});
test('canonical public response never permits native geometry and rejects duplicates', () => {
  const raw = settingsSuccess('r', 'COMMITTED', pub(), 'DEGRADED');
  const out = parseSettingsResponse(raw);
  assert.equal(out.ok, true);
  assert.deepEqual(out.settings, pub());
  assert.ok(Object.isFrozen(out.settings));
  assert.equal(
    settingsSuccess('r', 'OBSERVED', { ...pub(), normalBounds: null }, 'AVAILABLE'),
    null,
  );
  for (const bad of [
    raw.replace('"ok":true', '"ok":false,"ok":true'),
    raw.replace('"theme":"LIGHT"', '"theme":"DARK","theme":"LIGHT"'),
    ` ${raw}`,
    raw.replace('"revision":0', '"revision":-0'),
    raw.replace('"revision":0', '"revision":1e999'),
  ])
    assert.equal(parseSettingsResponse(bad), null);
});
test('fixed error variants nullable local diagnostics no origin inference', () => {
  for (const code of SETTINGS_ERRORS) {
    assert.equal(settingsError(code, null, 'AVAILABLE'), null);
    assert.equal(
      parseSettingsResponse(
        JSON.stringify({
          version: 1,
          ok: false,
          code,
          diagnosticId: null,
          auditHealth: 'AVAILABLE',
        }),
      ),
      null,
    );
    const raw = settingsError(code, null, 'DEGRADED');
    assert.equal(parseSettingsResponse(raw).code, code);
    assert.equal(parseSettingsResponse(raw).diagnosticId, null);
  }
  assert.equal(settingsError('INTERNAL_FAILURE', null, 'AVAILABLE'), null);
  assert.equal(settingsError('PRIVATE', null, 'DEGRADED'), null);
  assert.equal(settingsError('BUSY', 'caller', 'AVAILABLE'), null);
  const uuid = 'abcdefab-1234-1234-1234-abcdefabcdef';
  assert.equal(
    parseSettingsResponse(settingsError('CONFLICT', uuid, 'AVAILABLE')).diagnosticId,
    uuid,
  );
  assert.equal(settingsError('BUSY', uuid.toUpperCase(), 'AVAILABLE'), null);
  assert.equal(parseSettingsResponse('x'.repeat(2049)), null);
});
