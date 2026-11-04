import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INPUT_KEYS,
  INPUT_TEXT_BYTES,
  snapshotDeviceInputRequest,
  snapshotDisplayEvidence,
  displayCurrent,
  inputArguments,
  unicodeInputCapability,
  exactUnicodeTextEqual,
  mapViewportPoint,
} from '../src/main/input-contract.ts';
const id = (n) => `${n.toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`;
const binding = { deviceId: id(1), bindingId: id(2), generation: 3, serial: 'fixture-device-1' };
const display = () => ({
  version: 1,
  evidenceId: id(3),
  ...binding,
  displayId: 0,
  width: 1080,
  height: 1920,
  rotation: 0,
  orientationEpoch: 4,
  observedUtc: 1000,
  validUntilUtc: 10000,
  source: 'SYNTHETIC_TEST',
});
const request = (operation = { kind: 'TAP', x: 30, y: 40 }, screen = display()) => ({
  version: 2,
  commandId: id(4),
  correlationId: id(5),
  ...binding,
  ownerId: id(6),
  operation,
  deadlineUtc: 9000,
  display: screen,
});

test('exact v2 input shapes preserve metadata v1 separation and require bound display for pointer input', () => {
  for (const operation of [
    { kind: 'TAP', x: 0, y: 0 },
    { kind: 'SWIPE', x1: 0, y1: 0, x2: 1079, y2: 1919, durationMs: 200 },
    { kind: 'HOME' },
    { kind: 'BACK' },
    ...INPUT_KEYS.map((key) => ({ kind: 'KEY', key })),
    { kind: 'TEXT', text: 'Tiếng Việt 👋' },
  ])
    assert.ok(snapshotDeviceInputRequest(request(operation)));
  assert.equal(snapshotDeviceInputRequest({ ...request(), version: 1 }), null);
  assert.equal(snapshotDeviceInputRequest(request({ kind: 'TAP', x: 0, y: 0 }, null)), null);
  assert.equal(
    snapshotDeviceInputRequest(
      request({ kind: 'SWIPE', x1: 0, y1: 0, x2: 1, y2: 1, durationMs: 1 }, null),
    ),
    null,
  );
  for (const operation of [
    { kind: 'HOME' },
    { kind: 'BACK' },
    { kind: 'KEY', key: 'ENTER' },
    { kind: 'TEXT', text: 'x' },
  ])
    assert.ok(snapshotDeviceInputRequest(request(operation, null)));
});
test('complete exact binding and distinct command/correlation identities are mandatory', () => {
  for (const patch of [
    { commandId: 'short' },
    { correlationId: id(4) },
    { ownerId: 'owner' },
    { deviceId: id(9) },
    { bindingId: id(9) },
    { generation: 4 },
    { serial: 'different-device' },
    { generation: -0 },
    { serial: '-injected' },
  ])
    assert.equal(snapshotDeviceInputRequest({ ...request(), ...patch }), null);
  for (const field of [
    'commandId',
    'correlationId',
    'ownerId',
    'deviceId',
    'bindingId',
    'generation',
    'serial',
  ]) {
    const v = request();
    delete v[field];
    assert.equal(snapshotDeviceInputRequest(v), null);
  }
  assert.equal(snapshotDeviceInputRequest({ ...request(), rawArgv: ['shell'] }), null);
});
test('pointer coordinates must be bounded safe integers with no coercion clamping or special float alias', () => {
  for (const x of [-1, -0, 1080, Infinity, NaN, 1.5, '1', '1;echo x', Number.MAX_SAFE_INTEGER])
    assert.equal(snapshotDeviceInputRequest(request({ kind: 'TAP', x, y: 0 })), null);
  for (const y of [-1, 1920, 0.5])
    assert.equal(snapshotDeviceInputRequest(request({ kind: 'TAP', x: 0, y })), null);
  assert.ok(snapshotDeviceInputRequest(request({ kind: 'TAP', x: 1079, y: 1919 })));
  assert.equal(
    snapshotDeviceInputRequest(
      request({ kind: 'SWIPE', x1: 0, y1: 0, x2: 1080, y2: 1, durationMs: 10 }),
    ),
    null,
  );
});
test('swipe duration is explicit positive bounded and must fit both remaining command and display interval', () => {
  for (const durationMs of [undefined, 0, -0, -1, 1.5, Infinity, '100', 120001])
    assert.equal(
      snapshotDeviceInputRequest(
        request({ kind: 'SWIPE', x1: 0, y1: 0, x2: 1, y2: 1, durationMs }),
      ),
      null,
    );
  const v = request({ kind: 'SWIPE', x1: 0, y1: 0, x2: 1, y2: 1, durationMs: 500 });
  assert.equal(displayCurrent(v, v.display, 8501), false);
  assert.equal(displayCurrent(v, v.display, 8500), true);
  v.deadlineUtc = 20000;
  v.display.validUntilUtc = 9000;
  assert.equal(displayCurrent(v, v.display, 8501), false);
});
test('all fixed argument plans contain only reviewed literal device tokens and canonical decimals', () => {
  assert.deepEqual(inputArguments(request()), [
    'input',
    'touchscreen',
    '-d',
    '0',
    'tap',
    '30',
    '40',
  ]);
  assert.deepEqual(
    inputArguments(request({ kind: 'SWIPE', x1: 0, y1: 1, x2: 100, y2: 200, durationMs: 300 })),
    ['input', 'touchscreen', '-d', '0', 'swipe', '0', '1', '100', '200', '300'],
  );
  assert.deepEqual(inputArguments(request({ kind: 'HOME' }, null)), [
    'input',
    'keyboard',
    '-d',
    '0',
    'keyevent',
    '3',
  ]);
  assert.deepEqual(inputArguments(request({ kind: 'BACK' }, null)), [
    'input',
    'keyboard',
    '-d',
    '0',
    'keyevent',
    '4',
  ]);
  assert.deepEqual(inputArguments(request({ kind: 'KEY', key: 'ENTER' }, null)), [
    'input',
    'keyboard',
    '-d',
    '0',
    'keyevent',
    '66',
  ]);
  for (const key of ['RECENTS', 'POWER', '66', '66; echo unsafe', 3])
    assert.equal(inputArguments(request({ kind: 'KEY', key }, null)), null);
  assert.equal(inputArguments(request({ kind: 'RAW', argv: ['shell'] })), null);
  assert.throws(() => inputArguments(request()).push('extra'));
});
test('display geometry format is exact and does not infer orientation from dimensions', () => {
  for (const rotation of [0, 90, 180, 270])
    assert.ok(snapshotDisplayEvidence({ ...display(), rotation }));
  for (const patch of [
    { rotation: 45 },
    { rotation: -0 },
    { displayId: 1 },
    { displayId: -0 },
    { width: 0 },
    { height: 65536 },
    { width: 1.2 },
    { orientationEpoch: -0 },
    { observedUtc: -1 },
    { validUntilUtc: 1000 },
    { source: 'renderer' },
  ])
    assert.equal(snapshotDisplayEvidence({ ...display(), ...patch }), null);
  assert.equal(snapshotDisplayEvidence({ ...display(), privatePath: '/private' }), null);
  const landscape = { ...display(), width: 1920, height: 1080, rotation: 90 };
  assert.deepEqual(
    mapViewportPoint(landscape, { left: 0, top: 0, width: 192, height: 108 }, { x: 19.2, y: 10.8 }),
    { x: 192, y: 108 },
  );
});
test('rotation away and back invalidates old display evidence even when dimensions return unchanged', () => {
  const v = request();
  assert.equal(displayCurrent(v, v.display, 1100), true);
  for (const patch of [
    { orientationEpoch: 5 },
    { rotation: 90 },
    { width: 1920, height: 1080 },
    { evidenceId: id(99) },
    { generation: 4 },
    { source: 'VALIDATED_CAPTURE' },
  ])
    assert.equal(displayCurrent(v, { ...v.display, ...patch }, 1100), false);
  assert.equal(displayCurrent(v, { ...v.display, orientationEpoch: 6, rotation: 0 }, 1100), false);
});
test('display freshness and command deadlines are half-open with no extension by later evidence', () => {
  const v = request();
  assert.equal(displayCurrent(v, v.display, 999), false);
  assert.equal(displayCurrent(v, v.display, 1000), true);
  assert.equal(displayCurrent(v, v.display, 8999), true);
  assert.equal(displayCurrent(v, v.display, 9000), false);
  v.deadlineUtc = 12000;
  assert.equal(displayCurrent(v, v.display, 10000), false);
  assert.equal(displayCurrent(v, { ...v.display, validUntilUtc: 20000 }, 10001), false);
  for (const now of [-0, NaN, Infinity, '1001'])
    assert.equal(displayCurrent(v, v.display, now), false);
});
test('key-only requests may omit display but never bypass their own deadline or request grammar', () => {
  const v = request({ kind: 'HOME' }, null);
  assert.equal(displayCurrent(v, null, 1001), true);
  assert.equal(displayCurrent(v, null, 9000), false);
  assert.equal(displayCurrent({ ...v, deviceId: 'bad' }, null, 1001), false);
});
test('viewport maps visible content half-open edges without accepting letterbox or clamping', () => {
  const d = display(),
    r = { left: 100, top: 50, width: 270, height: 480 };
  assert.deepEqual(mapViewportPoint(d, r, { x: 100, y: 50 }), { x: 0, y: 0 });
  assert.deepEqual(mapViewportPoint(d, r, { x: 369.99, y: 529.99 }), { x: 1079, y: 1919 });
  for (const p of [
    { x: 99, y: 50 },
    { x: 370, y: 50 },
    { x: 100, y: 530 },
    { x: 100, y: 49 },
    { x: NaN, y: 50 },
    { x: '100', y: 50 },
  ])
    assert.equal(mapViewportPoint(d, r, p), null);
  for (const patch of [{ width: 0 }, { height: -1 }, { left: Infinity }, { width: NaN }])
    assert.equal(mapViewportPoint(d, { ...r, ...patch }, { x: 100, y: 50 }), null);
});
test('snapshots deeply freeze copied fields and caller mutation cannot alter admitted plans', () => {
  const raw = request();
  const value = snapshotDeviceInputRequest(raw);
  raw.operation.x = 1000;
  raw.display.width = 2;
  assert.equal(value.operation.x, 30);
  assert.equal(value.display.width, 1080);
  assert.throws(() => (value.operation.x = 9));
  assert.throws(() => (value.display.rotation = 90));
  assert.throws(() => (value.commandId = id(99)));
});
test('exact data descriptors refuse getters and proxies without invoking user coercion', () => {
  let calls = 0;
  const raw = request();
  Object.defineProperty(raw.operation, 'kind', {
    enumerable: true,
    get() {
      calls++;
      return 'TAP';
    },
  });
  assert.equal(snapshotDeviceInputRequest(raw), null);
  const d = display();
  Object.defineProperty(d, 'width', {
    enumerable: true,
    get() {
      calls++;
      return1080;
    },
  });
  assert.equal(snapshotDisplayEvidence(d), null);
  assert.equal(calls, 0);
  const throwing = new Proxy(
    {},
    {
      ownKeys() {
        throw Error('private');
      },
    },
  );
  assert.equal(snapshotDeviceInputRequest(throwing), null);
  assert.equal(
    exactUnicodeTextEqual(
      {
        toString() {
          calls++;
          return 'x';
        },
      },
      'x',
    ),
    false,
  );
  assert.equal(calls, 0);
});
test('Unicode capability is always unavailable, including ASCII; no input-text argument fallback exists', () => {
  const capability = unicodeInputCapability();
  assert.deepEqual(capability, {
    available: false,
    outcome: 'NOT_DISPATCHED',
    code: 'UNICODE_UNAVAILABLE',
    reason: 'NO_APPROVED_METHOD',
  });
  for (const text of [
    'hello',
    'Tiếng Việt',
    'e\u0301',
    '👩🏽‍💻',
    '"quotes"; $HOME & | < >',
    'line1\nline2',
    'line1\r\nline2',
    '',
  ]) {
    const v = request({ kind: 'TEXT', text }, null);
    assert.ok(snapshotDeviceInputRequest(v));
    assert.equal(inputArguments(v), null);
    assert.equal(unicodeInputCapability(), capability);
  }
  assert.throws(() => (capability.available = true));
  assert.equal(JSON.stringify(capability).includes('hello'), false);
});
test('Unicode comparison is exact code-unit equality without normalization transliteration or newline changes', () => {
  for (const text of [
    'ế',
    'e\u0302\u0301',
    'Tiếng Việt / English 👋',
    '👩🏽‍💻',
    'a\nb',
    'a\r\nb',
    '\t punctuation !?',
  ])
    assert.equal(exactUnicodeTextEqual(text, text), true);
  for (const [a, b] of [
    ['é', 'e\u0301'],
    ['ế', 'e'],
    ['a\r\nb', 'a\nb'],
    ['👋', '?'],
    ['hello', 'hello '],
  ])
    assert.equal(exactUnicodeTextEqual(a, b), false);
  for (const text of ['\ud800', '\udfff', 'a\0b']) {
    assert.equal(snapshotDeviceInputRequest(request({ kind: 'TEXT', text }, null)), null);
    assert.equal(exactUnicodeTextEqual(text, text), false);
  }
});
test('Unicode defensive inspection cap counts exact UTF8 bytes and never truncates', () => {
  const boundary = 'x'.repeat(INPUT_TEXT_BYTES);
  assert.ok(snapshotDeviceInputRequest(request({ kind: 'TEXT', text: boundary }, null)));
  for (const text of [`${boundary}x`, 'ế'.repeat(21846), '👋'.repeat(16385)]) {
    assert.equal(snapshotDeviceInputRequest(request({ kind: 'TEXT', text }, null)), null);
    assert.equal(exactUnicodeTextEqual(text, text), false);
  }
  assert.equal(inputArguments(request({ kind: 'TEXT', text: boundary }, null)), null);
});

test('completed swipe observation does not require its full duration again while expiry and orientation remain mandatory', () => {
  const d = { ...display(), observedUtc: 1000, validUntilUtc: 1600 };
  const v = {
    ...request({ kind: 'SWIPE', x1: 0, y1: 0, x2: 1, y2: 1, durationMs: 400 }, d),
    deadlineUtc: 1600,
  };
  assert.equal(displayCurrent(v, d, 1000, 'DISPATCH'), true);
  assert.equal(displayCurrent(v, d, 1400, 'DISPATCH'), false);
  assert.equal(displayCurrent(v, d, 1400, 'OBSERVE'), true);
  assert.equal(displayCurrent(v, d, 1600, 'OBSERVE'), false);
  assert.equal(displayCurrent(v, { ...d, orientationEpoch: 5 }, 1400, 'OBSERVE'), false);
  assert.equal(displayCurrent(v, d, 1400, 'unknown'), false);
});
test('operation discriminator and fields use one captured descriptor snapshot', () => {
  let reads = 0;
  const op = new Proxy(
    { kind: 'HOME' },
    {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'kind') {
          reads++;
          return {
            value: reads === 1 ? 'HOME' : 'KEY',
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
        return Object.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  const parsed = snapshotDeviceInputRequest(request(op, null));
  assert.ok(parsed);
  assert.equal(parsed.operation.kind, 'HOME');
  assert.equal(reads, 1);
  assert.deepEqual(inputArguments(parsed), ['input', 'keyboard', '-d', '0', 'keyevent', '3']);
});
