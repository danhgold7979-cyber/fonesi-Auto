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
import { verifySegment } from '../src/log-store-schema.ts';
import { ApplicationLogger } from '../src/main/logging.ts';
import { LogStore } from '../src/main/log-store.ts';
const id = 'abcdef00-0000-4000-8000-000000000001';
const utc = '2026-10-31T11:00:00.000Z';
const fields = () => ({
  operation: 'CREATE',
  phase: 'INTENT',
  diagnosticId: id,
  secretId: null,
  revision: null,
  code: 'OK',
});
const record = () => ({
  schemaVersion: 2,
  runId: id,
  sequence: 1,
  utc,
  severity: 'INFO',
  component: 'MAIN',
  task: 'P1-06',
  event: 'SECRET_OPERATION',
  diagnosticId: id,
  code: 'OK',
  operation: 'CREATE',
  phase: 'INTENT',
  secretId: null,
  revision: null,
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
  const root = mkdtempSync(join(base, 'vault-audit-'));
  const token = randomUUID();
  writeFileSync(join(root, '.owner'), token, { flag: 'wx' });
  return {
    root,
    location: { root: join(root, 'logs-main'), parentToken: token },
    cleanup() {
      assert.equal(realpathSync(root), root);
      rmSync(root, { recursive: true });
    },
  };
}
test('vault audit schema is bounded exact canonical union and retains legacy bytes', () => {
  const v = record(),
    encoded = encodeLogRecord(v);
  assert.equal(encoded, JSON.stringify(v) + '\n');
  const legacy = {
    schemaVersion: 1,
    runId: id,
    sequence: 2,
    utc,
    severity: 'INFO',
    component: 'MAIN',
    task: 'P1-04',
    event: 'STARTUP_READY',
    diagnosticId: null,
    code: 'OK',
  };
  assert.equal(encodeLogRecord(legacy), JSON.stringify(legacy) + '\n');
  const metadata = {
    schemaVersion: 1,
    segmentId: id,
    storeId: id,
    runId: id,
    firstSequence: 1,
    lastSequence: 2,
    maxUtc: utc,
    finalized: true,
  };
  assert.equal(verifySegment(encoded + encodeLogRecord(legacy), metadata), true);
  assert.equal(
    verifySegment(
      encoded.replace('"code":"OK"', '"code":"CANARY","code":"OK"') + encodeLogRecord(legacy),
      metadata,
    ),
    false,
  );
  for (const patch of [
    { schemaVersion: 3 },
    { purpose: 'CANARY' },
    { diagnosticId: null },
    { secretId: id, revision: null },
    { secretId: null, revision: 1 },
    { secretId: id, revision: 0 },
    { secretId: id, revision: -0 },
    { secretId: id, revision: Infinity },
    { code: 'CANARY' },
    { phase: 'INTENT', code: 'WRITE_FAILED', severity: 'WARN' },
    { phase: 'RESULT', code: 'INVALID_REQUEST', severity: 'WARN', secretId: id, revision: 1 },
    { component: 'PRELOAD_BOUNDARY' },
  ])
    assert.equal(encodeLogRecord({ ...v, ...patch }), null);
  let called = false;
  const getter = { ...v };
  Object.defineProperty(getter, 'secretId', {
    enumerable: true,
    get() {
      called = true;
      return id;
    },
  });
  assert.equal(encodeLogRecord(getter), null);
  assert.equal(called, false);
});
test('vault audit awaits actual persistence and mixed segment reopens without canary content', async () => {
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
    assert.equal(await logger.vaultAudit(fields()), 'AVAILABLE');
    assert.equal(
      await logger.vaultAudit({ ...fields(), phase: 'RESULT', secretId: id, revision: 1 }),
      'AVAILABLE',
    );
    assert.equal(await logger.close(), 'FLUSHED');
    const segments = readdirSync(f.location.root).filter((x) => x.endsWith('.jsonl'));
    assert.ok(segments.length > 0);
    const raw = segments.map((x) => readFileSync(join(f.location.root, x), 'utf8')).join('');
    assert.ok(raw.includes('"schemaVersion":2'));
    assert.ok(raw.includes('"schemaVersion":1'));
    assert.equal(raw.includes('CANARY_PAYLOAD'), false);
    store = await LogStore.open(f.location, utc);
    assert.equal(await store.close(), 'FLUSHED');
  } finally {
    await store?.close();
    f.cleanup();
  }
});
test('vault audit rejects queue/flush failures and does not treat enqueue as durable', async () => {
  let finish;
  let queued;
  const store = {
    health: 'AVAILABLE',
    enqueue(value) {
      queued = value;
      return 'QUEUED';
    },
    flush() {
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const logger = new ApplicationLogger(
    store,
    () => utc,
    () => {},
    () => id,
  );
  const input = fields();
  let settled = false;
  const pending = logger.vaultAudit(input).then((x) => {
    settled = true;
    return x;
  });
  input.operation = 'DELETE';
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(queued.operation, 'CREATE');
  finish('FAILED');
  assert.equal(await pending, 'DEGRADED');
  const rejected = new ApplicationLogger(
    {
      ...store,
      enqueue() {
        return 'FAILED';
      },
      flush() {
        throw new Error('CANARY');
      },
    },
    () => utc,
    () => {},
    () => id,
  );
  assert.equal(await rejected.vaultAudit(fields()), 'DEGRADED');
});
test('vault audit actual append and sync failures degrade; getters never run', async () => {
  for (const faultPoint of ['append', 'sync']) {
    const f = fixture();
    let store;
    try {
      store = await LogStore.open(f.location, utc, (point) => {
        if (point === faultPoint) throw new Error('CANARY_PAYLOAD');
      });
      const logger = new ApplicationLogger(
        store,
        () => utc,
        () => {},
        () => id,
      );
      assert.equal(await logger.vaultAudit(fields()), 'DEGRADED');
      for (const name of readdirSync(f.location.root).filter((x) => x.endsWith('.jsonl'))) {
        assert.equal(
          readFileSync(join(f.location.root, name), 'utf8').includes('CANARY_PAYLOAD'),
          false,
        );
      }
    } finally {
      await store?.close();
      f.cleanup();
    }
  }
  let called = false;
  const bad = fields();
  Object.defineProperty(bad, 'code', {
    enumerable: true,
    get() {
      called = true;
      return 'OK';
    },
  });
  const healthy = {
    health: 'AVAILABLE',
    enqueue() {
      throw new Error('must not enqueue');
    },
    flush() {
      throw new Error('must not flush');
    },
  };
  assert.equal(
    await new ApplicationLogger(
      healthy,
      () => utc,
      () => {},
      () => id,
    ).vaultAudit(bad),
    'DEGRADED',
  );
  assert.equal(called, false);
});
test('vault operation/result vocabulary is exact and invalid input never keeps references', () => {
  const codes = [
    'OK',
    'AUDIT_UNAVAILABLE',
    'INVALID_REQUEST',
    'UNSUPPORTED_VERSION',
    'UNAUTHORIZED',
    'STALE_REFERENCE',
    'NOT_FOUND',
    'DELETED',
    'BUSY',
    'KEY_UNAVAILABLE',
    'DECRYPTION_FAILED',
    'STORE_INVALID',
    'WRITE_FAILED',
    'OWNER_REVOKED',
    'REVISION_EXHAUSTED',
  ];
  for (const operation of ['CREATE', 'READ', 'REPLACE', 'DELETE', 'STATUS']) {
    for (const code of codes) {
      const value = {
        ...record(),
        operation,
        phase: 'RESULT',
        code,
        severity: code === 'OK' ? 'INFO' : 'WARN',
      };
      assert.notEqual(encodeLogRecord(value), null);
      const referenced = { ...value, secretId: id, revision: 1 };
      assert.equal(
        encodeLogRecord(referenced) !== null,
        !['INVALID_REQUEST', 'UNSUPPORTED_VERSION'].includes(code),
      );
    }
  }
  for (const operation of ['create', 'EXPORT', 'CANARY'])
    assert.equal(encodeLogRecord({ ...record(), operation }), null);
});

test('vault audit preserves the one-shot observed clock-regression record and monotonic sequence', async () => {
  const records = [];
  let now = utc;
  const store = {
    health: 'AVAILABLE',
    enqueue(value) {
      records.push(value);
      return 'QUEUED';
    },
    async flush() {
      return 'FLUSHED';
    },
  };
  const logger = new ApplicationLogger(
    store,
    () => now,
    () => {},
    () => id,
  );
  logger.emit('STARTUP_READY', 'OK');
  now = '2026-10-31T10:00:00.000Z';
  assert.equal(await logger.vaultAudit(fields()), 'AVAILABLE');
  now = '2026-10-31T09:00:00.000Z';
  assert.equal(await logger.vaultAudit(fields()), 'AVAILABLE');
  assert.equal(records.filter((x) => x.code === 'CLOCK_REGRESSION').length, 1);
  assert.deepEqual(
    records.map((x) => x.sequence),
    [1, 2, 3, 4],
  );
});
