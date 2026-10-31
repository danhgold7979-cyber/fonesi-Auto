import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLogRecord, diagnosticId, utcTimestamp } from '../src/log-contract.ts';
const uuid = 'abcdef00-0000-4000-8000-000000000001';
const good = () => ({
  schemaVersion: 1,
  runId: uuid,
  sequence: 1,
  utc: '2026-10-31T06:08:00.000Z',
  severity: 'INFO',
  component: 'MAIN',
  task: 'P1-04',
  event: 'STARTUP_READY',
  diagnosticId: null,
  code: 'OK',
});
test('canonical safe log encoding preserves only fixed fields', () => {
  const value = Object.freeze(good());
  const encoded = encodeLogRecord(value);
  assert.equal(encoded, JSON.stringify(value) + '\n');
  assert.ok(Buffer.byteLength(encoded) <= 2048);
  assert.equal(encodeLogRecord(Object.fromEntries(Object.entries(value).reverse())), encoded);
});
test('explicit event/code/severity/component tuples', () => {
  const cases = [
    ['STARTUP_FAILED', 'STARTUP_FAILURE', 'ERROR', 'MAIN'],
    ['SHUTDOWN', 'OK', 'INFO', 'MAIN'],
    ['SHUTDOWN', 'FLUSH_FAILED', 'ERROR', 'MAIN'],
    ['RENDERER_LOST', 'RENDERER_LOSS', 'ERROR', 'MAIN'],
    ['LOGGING_RECOVERED', 'RECOVERED', 'INFO', 'LOGGING'],
    ...[
      'WRITE_FAILED',
      'FLUSH_FAILED',
      'QUEUE_FULL',
      'RETENTION_FAILED',
      'HOLDS_UNAVAILABLE',
      'CLOCK_REGRESSION',
    ].map((code) => [
      'LOGGING_DEGRADED',
      code,
      code === 'CLOCK_REGRESSION' ? 'WARN' : 'ERROR',
      'LOGGING',
    ]),
    ...['OK', 'RETENTION_FAILED', 'HOLDS_UNAVAILABLE', 'CLOCK_REGRESSION'].map((code) => [
      'RETENTION_RESULT',
      code,
      code === 'OK' ? 'INFO' : 'WARN',
      'LOGGING',
    ]),
  ];
  for (const [event, code, severity, component] of cases) {
    const value = { ...good(), event, code, severity, component };
    assert.notEqual(encodeLogRecord(value), null);
    assert.equal(
      encodeLogRecord({ ...value, severity: severity === 'INFO' ? 'ERROR' : 'INFO' }),
      null,
    );
    assert.equal(encodeLogRecord({ ...value, component: 'PRELOAD_BOUNDARY' }), null);
    assert.equal(encodeLogRecord({ ...value, diagnosticId: uuid }), null);
  }
});
test('bridge diagnostic field grammar and nullability follow denial codes', () => {
  for (const code of [
    'OK',
    'INVALID_TRANSPORT',
    'PAYLOAD_TOO_LARGE',
    'INVALID_JSON',
    'INVALID_SHAPE',
    'UNSUPPORTED_VERSION',
    'UNKNOWN_METHOD',
    'UNTRUSTED_SENDER',
    'SESSION_UNAVAILABLE',
    'SESSION_REVOKED',
    'BUSY',
    'TIMEOUT',
    'INTERNAL_FAILURE',
  ]) {
    const value = {
      ...good(),
      event: 'BRIDGE_RESULT',
      component: 'PRELOAD_BOUNDARY',
      code,
      severity: code === 'OK' ? 'INFO' : code === 'INTERNAL_FAILURE' ? 'ERROR' : 'WARN',
      diagnosticId: uuid,
    };
    assert.notEqual(encodeLogRecord(value), null);
    assert.equal(
      encodeLogRecord({ ...value, diagnosticId: null }) !== null,
      [
        'UNTRUSTED_SENDER',
        'SESSION_UNAVAILABLE',
        'SESSION_REVOKED',
        'BUSY',
        'INTERNAL_FAILURE',
      ].includes(code),
    );
    assert.equal(encodeLogRecord({ ...value, requestId: 'caller-canary' }), null);
  }
});
test('credential/path/multiline/nested-error canaries cannot enter encoded fields', () => {
  for (const canary of [
    'password=PRIVATE',
    'otp=123456',
    'cookie=PRIVATE',
    'token=PRIVATE',
    'proxy://user:password@host',
    'C:\\private\\user',
    '/private/user',
    'PRIVATE\nFORGED_EVENT',
    new Error('PRIVATE'),
    { cause: { password: 'PRIVATE' } },
  ]) {
    for (const field of Object.keys(good()))
      assert.equal(encodeLogRecord({ ...good(), [field]: canary }), null);
    assert.equal(encodeLogRecord({ ...good(), detail: canary }), null);
  }
});
test('ordinary getters and unsafe record shapes are rejected without evaluation', () => {
  let called = 0;
  const value = good();
  Object.defineProperty(value, 'code', {
    get() {
      called++;
      return 'OK';
    },
    enumerable: true,
  });
  assert.equal(encodeLogRecord(value), null);
  assert.equal(called, 0);
  const hidden = good();
  Object.defineProperty(hidden, 'code', { value: 'OK', enumerable: false });
  assert.equal(encodeLogRecord(hidden), null);
  for (const value of [
    null,
    [],
    Object.create(null),
    { ...good(), [Symbol('x')]: 1 },
    new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('PRIVATE');
        },
      },
    ),
  ])
    assert.equal(encodeLogRecord(value), null);
});
test('UUID/time/sequence boundaries and impossible dates reject', () => {
  for (const value of ['', uuid.toUpperCase(), uuid + 'x', 'caller'])
    if (value !== uuid) assert.equal(diagnosticId(value), false);
  for (const value of [
    '2026-02-30T00:00:00.000Z',
    '2026-10-31T06:08:00Z',
    '2026-10-31T06:08:00.000+00:00',
    'PRIVATE',
  ])
    assert.equal(utcTimestamp(value), false);
  for (const value of [-0, 0, -1, NaN, Infinity, 1.2, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(encodeLogRecord({ ...good(), sequence: value }), null);
  assert.notEqual(encodeLogRecord({ ...good(), sequence: Number.MAX_SAFE_INTEGER }), null);
});
