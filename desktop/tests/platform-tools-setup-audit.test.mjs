import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeLogRecord } from '../src/log-contract.ts';

import { ApplicationLogger } from '../src/main/logging.ts';
import { LogStore } from '../src/main/log-store.ts';
const id = 'abcdef00-0000-4000-8000-000000000001',
  utc = '2026-10-31T12:00:00.000Z';
const fields = () => ({
  action: null,
  operation: 'REQUEST',
  phase: 'INTENT',
  diagnosticId: id,
  operationId: 'abcdef00-0000-4000-8000-000000000002',
  expectedRevision: 0,
  resultingRevision: null,
  outcome: 'INTENT',
  code: 'OK',
});
const record = () => ({
  schemaVersion: 6,
  runId: id,
  sequence: 1,
  utc,
  severity: 'INFO',
  component: 'MAIN',
  task: 'P2-01',
  event: 'PLATFORM_TOOLS_SETUP',
  diagnosticId: id,
  outcome: 'INTENT',
  code: 'OK',
  operation: 'REQUEST',
  phase: 'INTENT',
  operationId: 'abcdef00-0000-4000-8000-000000000002',
  expectedRevision: 0,
  resultingRevision: null,
});
function fixture() {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'setup-audit-')),
    token = randomUUID();
  writeFileSync(join(root, '.owner'), token, { flag: 'wx' });
  return {
    root,
    location: { root: join(root, 'logs-main'), parentToken: token },
    cleanup() {
      assert.equal(realpathSync(root), root);
      assert.equal(readFileSync(join(root, '.owner'), 'utf8'), token);
      rmSync(root, { recursive: true, force: false });
    },
  };
}
test('schema6 exact audit tuples and canonical field order reject private or mismatched records', () => {
  const base = record();
  assert.notEqual(encodeLogRecord(base), null);
  assert.deepEqual(Object.keys(JSON.parse(encodeLogRecord(base))), [
    'schemaVersion',
    'runId',
    'sequence',
    'utc',
    'severity',
    'component',
    'task',
    'event',
    'operation',
    'phase',
    'diagnosticId',
    'operationId',
    'expectedRevision',
    'resultingRevision',
    'outcome',
    'code',
  ]);
  for (const patch of [
    { schemaVersion: 7 },
    { path: 'PRIVATE_CANARY' },
    { operationId: null },
    { operationId: id },
    { phase: 'RESULT' },
    { operation: 'READ' },
    { expectedRevision: -0 },
    { code: 'DOWNLOAD_FAILED' },
    { outcome: 'PENDING' },
    { resultingRevision: 1 },
  ])
    assert.equal(encodeLogRecord({ ...base, ...patch }), null);
  const positives = [
    {
      operation: 'READ',
      phase: 'RESULT',
      operationId: null,
      expectedRevision: null,
      resultingRevision: 0,
      outcome: 'OBSERVED',
    },
    {
      operation: 'READ',
      phase: 'RESULT',
      operationId: null,
      expectedRevision: null,
      resultingRevision: null,
      outcome: 'FAILED',
      code: 'STORAGE_FAILED',
      severity: 'WARN',
    },
    { phase: 'RESULT', resultingRevision: 1, outcome: 'PENDING' },
    { operation: 'PROVISION', phase: 'RESULT', resultingRevision: 2, outcome: 'VERIFIED_LOCAL' },
    {
      phase: 'RESULT',
      resultingRevision: 2,
      outcome: 'DECLINED',
      code: 'SETUP_CANCELLED',
      severity: 'WARN',
    },
    {
      operation: 'PROVISION',
      phase: 'RESULT',
      resultingRevision: null,
      outcome: 'OUTCOME_UNKNOWN',
      code: 'OUTCOME_UNKNOWN',
      severity: 'WARN',
    },
  ];
  for (const patch of positives)
    assert.notEqual(encodeLogRecord({ ...base, ...patch }), null, JSON.stringify(patch));
  let touched = false;
  const getter = { ...base };
  Object.defineProperty(getter, 'outcome', {
    enumerable: true,
    get() {
      touched = true;
      return 'INTENT';
    },
  });
  assert.equal(encodeLogRecord(getter), null);
  assert.equal(touched, false);
});
test('actual owned logger flushes schema8 alongside historical records and reopens', async () => {
  const f = fixture();
  let store;
  try {
    store = await LogStore.open(f.location, utc);
    const logger = new ApplicationLogger(
      store,
      () => utc,
      () => {},
      () => id,
    );
    logger.emit('STARTUP_READY', 'OK');
    assert.equal(await logger.platformToolsAudit(fields()), 'AVAILABLE');
    assert.equal(
      await logger.platformToolsAudit({
        ...fields(),
        phase: 'RESULT',
        outcome: 'PENDING',
        resultingRevision: 1,
      }),
      'AVAILABLE',
    );
    assert.equal(await logger.close(), 'FLUSHED');
    const raw = readdirSync(f.location.root)
      .filter((x) => x.endsWith('.jsonl'))
      .map((x) => readFileSync(join(f.location.root, x), 'utf8'))
      .join('');
    assert.ok(raw.includes('"schemaVersion":8'));
    assert.ok(raw.includes('"schemaVersion":1'));
    assert.equal(raw.includes('PRIVATE_CANARY'), false);
    store = await LogStore.open(f.location, utc);
    assert.equal(await store.close(), 'FLUSHED');
  } finally {
    await store?.close();
    f.cleanup();
  }
});
test('audit captures descriptors before await and does not acknowledge an incomplete flush', async () => {
  let release, queued;
  const logger = new ApplicationLogger(
    {
      health: 'AVAILABLE',
      enqueue(r) {
        queued = r;
        return 'QUEUED';
      },
      flush() {
        return new Promise((r) => {
          release = r;
        });
      },
    },
    () => utc,
    () => {},
    () => id,
  );
  const input = fields();
  let completed = false;
  const pending = logger.platformToolsAudit(input).then((r) => {
    completed = true;
    return r;
  });
  input.operation = 'READ';
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(queued.operation, 'REQUEST');
  release('FAILED');
  assert.equal(await pending, 'DEGRADED');
});
test('actual append/sync failures return fixed degradation without private output', async () => {
  for (const fault of ['append', 'sync']) {
    const f = fixture();
    let store;
    try {
      store = await LogStore.open(f.location, utc, (point) => {
        if (point === fault) throw Error('PRIVATE_CANARY');
      });
      const notices = [],
        logger = new ApplicationLogger(
          store,
          () => utc,
          (m) => notices.push(m),
          () => id,
        );
      assert.equal(await logger.platformToolsAudit(fields()), 'DEGRADED');
      assert.deepEqual(notices, ['LOGGING_DEGRADED']);
      for (const name of readdirSync(f.location.root).filter((n) => n.endsWith('.jsonl')))
        assert.equal(
          readFileSync(join(f.location.root, name), 'utf8').includes('PRIVATE_CANARY'),
          false,
        );
    } finally {
      await store?.close();
      f.cleanup();
    }
  }
});

test('audit schema discriminator cannot change during descriptor admission', () => {
  let reads = 0;
  const proxy = new Proxy(record(), {
    getOwnPropertyDescriptor(target, key) {
      const d = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'schemaVersion') return { ...d, value: ++reads === 1 ? 6 : 0 };
      return d;
    },
  });
  assert.equal(encodeLogRecord(proxy), null);
});

test('schema8 binds selected action while historical schema6 remains exact', () => {
  const base = { ...record(), schemaVersion: 8, action: null };
  assert.ok(encodeLogRecord(base));
  assert.ok(encodeLogRecord(record()));
  assert.equal(encodeLogRecord({ ...record(), action: null }), null);
  assert.equal(encodeLogRecord({ ...base, action: 'ROLLBACK' }), null);
  for (const action of ['INSTALL', 'ROLLBACK']) {
    assert.ok(encodeLogRecord({ ...base, operation: 'PROVISION', action }));
    assert.ok(
      encodeLogRecord({
        ...base,
        operation: 'PROVISION',
        phase: 'RESULT',
        action,
        outcome: 'VERIFIED_LOCAL',
        resultingRevision: 2,
      }),
    );
    assert.ok(
      encodeLogRecord({
        ...base,
        operation: 'PROVISION',
        phase: 'RESULT',
        action,
        outcome: 'DECLINED',
        resultingRevision: 2,
        code: 'SETUP_CANCELLED',
        severity: 'WARN',
      }),
    );
  }
  for (const code of ['TERMS_REQUIRED', 'TERMS_DECLINED', 'SETUP_CANCELLED'])
    assert.ok(
      encodeLogRecord({
        ...base,
        operation: 'PROVISION',
        phase: 'RESULT',
        outcome: 'DECLINED',
        resultingRevision: 2,
        code,
        severity: 'WARN',
      }),
    );
  for (const code of ['INTERNAL_FAILURE', 'OWNER_REVOKED'])
    assert.ok(
      encodeLogRecord({
        ...base,
        operation: 'PROVISION',
        phase: 'RESULT',
        outcome: 'FAILED',
        resultingRevision: 2,
        code,
        severity: 'WARN',
      }),
    );
  for (const patch of [
    { phase: 'INTENT', outcome: 'INTENT' },
    { phase: 'RESULT', outcome: 'VERIFIED_LOCAL', resultingRevision: 2 },
    { phase: 'RESULT', outcome: 'FAILED', code: 'AUDIT_UNAVAILABLE', severity: 'WARN' },
  ])
    assert.equal(encodeLogRecord({ ...base, operation: 'PROVISION', ...patch }), null);
});
