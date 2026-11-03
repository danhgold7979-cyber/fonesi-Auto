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
import { validDiscoveryAuditTuple as valid } from '../src/discovery-audit-contract.ts';
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

const fields = () => ({
  operation: 'START',
  stage: 'REQUEST',
  phase: 'INTENT',
  diagnosticId: id,
  operationId: 'abcdef00-0000-4000-8000-000000000002',
  expectedRevision: 0,
  resultingRevision: null,
  outcome: 'INTENT',
  code: 'OK',
});
const record = (d) => ({
  schemaVersion: 9,
  runId: id,
  sequence: 1,
  utc,
  severity: d.code === 'OK' ? 'INFO' : 'WARN',
  component: 'MAIN',
  task: 'P2-03',
  event: 'DISCOVERY',
  discovery: d,
});
test('schema9 distinguishes request/execute/read and cleanup without fabricated intent', () => {
  const base = fields();
  const rows = [
    base,
    { ...base, phase: 'RESULT', outcome: 'PENDING', resultingRevision: 1 },
    { ...base, stage: 'EXECUTION', phase: 'RESULT', outcome: 'STARTED', resultingRevision: 2 },
    {
      ...base,
      operation: 'STOP',
      stage: 'EXECUTION',
      phase: 'RESULT',
      outcome: 'CLEANUP_RETIRED',
      expectedRevision: null,
      resultingRevision: 2,
    },
    {
      ...base,
      operation: 'READ',
      stage: 'READ',
      phase: 'RESULT',
      operationId: null,
      expectedRevision: null,
      resultingRevision: 0,
      outcome: 'FAILED',
      code: 'BUSY',
    },
    {
      ...base,
      operationId: null,
      phase: 'RESULT',
      outcome: 'FAILED',
      resultingRevision: 0,
      code: 'STALE_REVISION',
    },
  ];
  for (const row of rows) {
    assert.equal(valid(row), true, JSON.stringify(row));
    assert.ok(encodeLogRecord(record(row)));
  }
  for (const row of [
    { ...base, operation: 'STOP', expectedRevision: null },
    { ...base, operationId: null },
    { ...rows[3], outcome: 'STARTED' },
    { ...base, code: 'PRIVATE_CANARY' },
  ])
    assert.equal(valid(row), false);
  assert.equal(encodeLogRecord({ ...record(base), private: 'PRIVATE_CANARY' }), null);
  assert.equal(encodeLogRecord(record({ ...base, private: 'PRIVATE_CANARY' })), null);
  let touched = 0;
  const hostile = record(base);
  hostile.discovery = {
    ...base,
    get code() {
      touched++;
      return 'OK';
    },
  };
  assert.equal(encodeLogRecord(hostile), null);
  assert.equal(touched, 0);
});
test('actual owned logger stores nested schema9 alongside historical schema1 and reopens', async () => {
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
    assert.equal(await logger.discoveryAudit(fields()), 'AVAILABLE');
    assert.equal(await logger.close(), 'FLUSHED');
    const raw = readdirSync(f.location.root)
      .filter((x) => x.endsWith('.jsonl'))
      .map((x) => readFileSync(join(f.location.root, x), 'utf8'))
      .join('');
    assert.ok(raw.includes('"schemaVersion":9'));
    assert.ok(raw.includes('"discovery":{'));
    assert.ok(raw.includes('"schemaVersion":1'));
    store = await LogStore.open(f.location, utc);
    assert.equal(await store.close(), 'FLUSHED');
  } finally {
    await store?.close();
    f.cleanup();
  }
});
test('schema9 acknowledgment waits actual flush; failed flush never AVAILABLE', async () => {
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
  const pending = logger.discoveryAudit(input).then((x) => {
    settled = true;
    return x;
  });
  input.code = 'PRIVATE_CANARY';
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  assert.equal(queued.discovery.code, 'OK');
  resolve('FAILED');
  assert.equal(await pending, 'DEGRADED');
});

test('actual START transport audit has no public revision and never invents Refresh or Stop transport', () => {
  const base = { ...fields(), stage: 'TRANSPORT', expectedRevision: 1 };
  for (const row of [
    base,
    { ...base, phase: 'RESULT', outcome: 'OBSERVED' },
    { ...base, phase: 'RESULT', outcome: 'FAILED', code: 'DISCOVERY_FAILED' },
    { ...base, phase: 'RESULT', outcome: 'OUTCOME_UNKNOWN', code: 'OUTCOME_UNKNOWN' },
  ])
    assert.ok(encodeLogRecord(record(row)));
  for (const row of [
    { ...base, operation: 'REFRESH' },
    { ...base, operation: 'STOP' },
    { ...base, resultingRevision: 2 },
    { ...base, phase: 'RESULT', outcome: 'STARTED' },
    { ...base, operationId: null },
  ])
    assert.equal(encodeLogRecord(record(row)), null);
});
