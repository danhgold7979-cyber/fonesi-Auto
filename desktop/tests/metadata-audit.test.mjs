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
import { validMetadataAuditTuple as valid } from '../src/metadata-audit-contract.ts';
function fixture() {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'metadata-audit-')),
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

const fields = () => ({
  operation: 'READ',
  stage: 'REQUEST',
  phase: 'INTENT',
  diagnosticId: id,
  operationId: 'abcdef00-0000-4000-8000-000000000002',
  field: 'MODEL',
  expectedRevision: 0,
  resultingRevision: null,
  outcome: 'INTENT',
  code: 'OK',
});
const record = (metadata) => ({
  schemaVersion: 10,
  runId: id,
  sequence: 1,
  utc,
  severity: metadata.code === 'OK' ? 'INFO' : 'WARN',
  component: 'MAIN',
  task: 'P2-06',
  event: 'METADATA',
  metadata,
});
test('actual owned logger stores nested schema10 alongside historical schema1 and reopens', async () => {
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
    assert.equal(await logger.metadataAudit(fields()), 'AVAILABLE');
    assert.equal(await logger.close(), 'FLUSHED');
    const raw = readdirSync(f.location.root)
      .filter((x) => x.endsWith('.jsonl'))
      .map((x) => readFileSync(join(f.location.root, x), 'utf8'))
      .join('');
    assert.ok(raw.includes('"schemaVersion":10'));
    assert.ok(raw.includes('"metadata":{'));
    assert.ok(raw.includes('"schemaVersion":1'));
    store = await LogStore.open(f.location, utc);
    assert.equal(await store.close(), 'FLUSHED');
  } finally {
    await store?.close();
    f.cleanup();
  }
});
test('schema10 acknowledgment waits actual flush; failed flush never AVAILABLE', async () => {
  let resolve;
  let queued;
  const logger = new ApplicationLogger(
    {
      health: 'AVAILABLE',
      enqueue(r) {
        queued = r;
        return 'QUEUED';
      },
      flush() {
        return new Promise((r) => {
          resolve = r;
        });
      },
    },
    () => utc,
    () => {},
    () => id,
  );
  let settled = false;
  const input = fields();
  const pending = logger.metadataAudit(input).then((x) => {
    settled = true;
    return x;
  });
  input.code = 'PRIVATE_CANARY';
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  assert.equal(queued.metadata.code, 'OK');
  resolve('FAILED');
  assert.equal(await pending, 'DEGRADED');
});

test('schema10 exact GET/request/execution tuples bind candidate revisions without claiming delivered observations', () => {
  const b = fields();
  const rows = [
    b,
    { ...b, phase: 'RESULT', outcome: 'PENDING', resultingRevision: 1 },
    { ...b, stage: 'EXECUTION' },
    ...['OBSERVED', 'NOT_DISPATCHED', 'DISPATCHED_UNCONFIRMED', 'OUTCOME_UNKNOWN'].map(
      (outcome) => ({
        ...b,
        stage: 'EXECUTION',
        phase: 'RESULT',
        outcome,
        code:
          outcome === 'OBSERVED'
            ? 'OK'
            : outcome === 'OUTCOME_UNKNOWN'
              ? 'OUTCOME_UNKNOWN'
              : 'TRANSPORT_FAILED',
        resultingRevision: 2,
      }),
    ),
    {
      ...b,
      operation: 'GET',
      stage: 'READ',
      phase: 'RESULT',
      operationId: null,
      field: null,
      expectedRevision: null,
      resultingRevision: 0,
      outcome: 'OBSERVED',
    },
    {
      ...b,
      phase: 'RESULT',
      operationId: null,
      resultingRevision: 5,
      outcome: 'FAILED',
      code: 'STALE_REVISION',
    },
  ];
  for (const value of rows) {
    assert.equal(valid(value), true);
    assert.ok(encodeLogRecord(record(value)));
  }
  for (const code of [
    'OWNER_REVOKED',
    'SESSION_REVOKED',
    'STALE_BINDING',
    'DEADLINE_EXCEEDED',
    'AUDIT_UNAVAILABLE',
    'INTERNAL_FAILURE',
  ])
    assert.ok(
      encodeLogRecord(
        record({ ...b, phase: 'RESULT', resultingRevision: 0, outcome: 'FAILED', code }),
      ),
    );
  for (const patch of [
    { stage: 'TRANSPORT' },
    { operation: 'STOP' },
    { operation: 'GET' },
    { field: null },
    { field: 'PRIVATE' },
    { expectedRevision: -0 },
    { diagnosticId: b.operationId },
    { phase: 'RESULT', outcome: 'OBSERVED', resultingRevision: 1 },
    { phase: 'RESULT', outcome: 'FAILED', code: 'BUSY', resultingRevision: 0 },
    { phase: 'RESULT', outcome: 'PENDING', resultingRevision: 2 },
    { stage: 'EXECUTION', phase: 'RESULT', outcome: 'OBSERVED', resultingRevision: 1 },
    {
      stage: 'EXECUTION',
      phase: 'RESULT',
      outcome: 'OUTCOME_UNKNOWN',
      code: 'TRANSPORT_FAILED',
      resultingRevision: 2,
    },
    { extra: 'PRIVATE' },
  ])
    assert.equal(encodeLogRecord(record({ ...b, ...patch })), null);
  assert.equal(encodeLogRecord({ ...record(b), severity: 'WARN' }), null);
  assert.equal(encodeLogRecord({ ...record(b), schemaVersion: 11 }), null);
});
test('schema10 descriptor snapshots reject getters, discriminator flips and private nested fields without echo', () => {
  let calls = 0;
  const b = fields();
  Object.defineProperty(b, 'code', {
    enumerable: true,
    get() {
      calls++;
      return 'OK';
    },
  });
  const outer = {
    schemaVersion: 10,
    runId: id,
    sequence: 1,
    utc,
    severity: 'INFO',
    component: 'MAIN',
    task: 'P2-06',
    event: 'METADATA',
    metadata: b,
  };
  assert.equal(encodeLogRecord(outer), null);
  assert.equal(calls, 0);
  let versionReads = 0;
  const proxy = new Proxy(record(fields()), {
    getOwnPropertyDescriptor(target, key) {
      const d = Reflect.getOwnPropertyDescriptor(target, key);
      return key === 'schemaVersion' ? { ...d, value: ++versionReads === 1 ? 10 : 0 } : d;
    },
  });
  assert.equal(encodeLogRecord(proxy), null);
  assert.equal(encodeLogRecord(record({ ...fields(), path: 'PRIVATE_CANARY' })), null);
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
      assert.equal(await logger.metadataAudit(fields()), 'DEGRADED');
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
