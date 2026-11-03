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

import { ApplicationLogger, inspectOwnedInputAuditWriter } from '../src/main/logging.ts';
import { LogStore } from '../src/main/log-store.ts';
const id = 'abcdef00-0000-4000-8000-000000000001',
  utc = '2026-10-31T12:00:00.000Z';
import { snapshotInputAudit, INPUT_AUDIT_ACTIONS } from '../src/input-audit-contract.ts';
function fixture() {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'input-audit-')),
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
  action: 'HOME',
  phase: 'INTENT',
  diagnosticId: id,
  commandId: 'abcdef00-0000-4000-8000-000000000002',
  correlationId: 'abcdef00-0000-4000-8000-000000000003',
  outcome: 'INTENT',
  code: 'OK',
});
const record = (input) => ({
  schemaVersion: 11,
  runId: id,
  sequence: 1,
  utc,
  severity: input.code === 'OK' ? 'INFO' : 'WARN',
  component: 'MAIN',
  task: 'P2-08',
  event: 'INPUT',
  input,
});
test('schema11 admits only fixed input history, never observed effect or raw payload', () => {
  for (const action of INPUT_AUDIT_ACTIONS) {
    assert.ok(encodeLogRecord(record({ ...fields(), action })));
    for (const [outcome, code] of [
      ['NOT_DISPATCHED', 'AUDIT_UNAVAILABLE'],
      ['DISPATCHED_UNCONFIRMED', 'OK'],
      ['DISPATCHED_UNCONFIRMED', 'TRANSPORT_FAILED'],
      ['OUTCOME_UNKNOWN', 'OUTCOME_UNKNOWN'],
    ])
      assert.ok(encodeLogRecord(record({ ...fields(), action, phase: 'RESULT', outcome, code })));
  }
  for (const patch of [
    { action: 'TAP' },
    { action: 'TEXT' },
    { action: 'PRIVATE' },
    { commandId: id },
    { correlationId: id },
    { phase: 'RESULT', outcome: 'OBSERVED' },
    { phase: 'RESULT', outcome: 'NOT_DISPATCHED', code: 'OK' },
    { phase: 'RESULT', outcome: 'OUTCOME_UNKNOWN', code: 'TRANSPORT_FAILED' },
    { stdout: 'PRIVATE' },
  ])
    assert.equal(encodeLogRecord(record({ ...fields(), ...patch })), null);
  assert.equal(encodeLogRecord({ ...record(fields()), severity: 'WARN' }), null);
  assert.equal(encodeLogRecord({ ...record(fields()), schemaVersion: 10 }), null);
  let calls = 0;
  const hostile = fields();
  Object.defineProperty(hostile, 'code', {
    enumerable: true,
    get() {
      calls++;
      return 'PRIVATE';
    },
  });
  assert.equal(snapshotInputAudit(hostile), null);
  assert.equal(calls, 0);
});
test('only actual owned open brands fixed writer; mutable public method cannot replace it', async () => {
  const f = fixture();
  let logger;
  const original = ApplicationLogger.prototype.inputAudit;
  try {
    const fake = new ApplicationLogger(
      {
        health: 'AVAILABLE',
        enqueue() {
          return 'QUEUED';
        },
        flush() {
          return Promise.resolve('FLUSHED');
        },
      },
      () => utc,
      () => {},
      () => id,
    );
    assert.equal(inspectOwnedInputAuditWriter(fake), null);
    assert.equal(inspectOwnedInputAuditWriter(Object.create(ApplicationLogger.prototype)), null);
    assert.equal(
      inspectOwnedInputAuditWriter(await ApplicationLogger.open(undefined, () => {})),
      null,
    );
    logger = await ApplicationLogger.open(f.location, () => {});
    const writer = inspectOwnedInputAuditWriter(logger);
    assert.ok(writer);
    assert.equal(writer.current(), true);
    original.call = () => {
      throw Error('PRIVATE_CALL_REPLACEMENT');
    };
    logger.inputAudit = () => {
      throw Error('PRIVATE_REPLACEMENT');
    };
    assert.equal(await writer.write(fields()), 'AVAILABLE');
    assert.equal(
      await writer.write({
        ...fields(),
        phase: 'RESULT',
        outcome: 'DISPATCHED_UNCONFIRMED',
        code: 'OK',
      }),
      'AVAILABLE',
    );
    assert.equal(await logger.close(), 'FLUSHED');
    assert.equal(writer.current(), false);
    assert.equal(await writer.write(fields()), 'DEGRADED');
    const raw = readdirSync(f.location.root)
      .filter((n) => n.endsWith('.jsonl'))
      .map((n) => readFileSync(join(f.location.root, n), 'utf8'))
      .join('');
    const records = raw
      .trim()
      .split('\n')
      .map(JSON.parse)
      .filter((r) => r.schemaVersion === 11)
      .sort((a, b) => a.sequence - b.sequence);
    assert.equal(records.length, 2);
    assert.equal(records[0].input.phase, 'INTENT');
    assert.equal(records[1].input.phase, 'RESULT');
    assert.ok(records[0].sequence < records[1].sequence);
    assert.equal(records[1].input.outcome, 'DISPATCHED_UNCONFIRMED');
    assert.equal(raw.includes('PRIVATE_REPLACEMENT'), false);
    const reopened = await LogStore.open(f.location, new Date().toISOString());
    assert.equal(await reopened.close(), 'FLUSHED');
  } finally {
    delete original.call;
    await logger?.close();
    f.cleanup();
  }
});
test('input audit copies before flush, retains actual wait, and close prevents late AVAILABLE', async () => {
  let finish, captured;
  const store = {
    health: 'AVAILABLE',
    enqueue(r) {
      captured = r;
      return 'QUEUED';
    },
    flush() {
      return new Promise((r) => {
        finish = r;
      });
    },
    close() {
      return Promise.resolve('FLUSHED');
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
  const pending = logger.inputAudit(input).then((x) => {
    settled = true;
    return x;
  });
  input.action = 'PRIVATE';
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  assert.equal(captured.input.action, 'HOME');
  await logger.close();
  finish('FLUSHED');
  assert.equal(await pending, 'DEGRADED');
  assert.equal(inspectOwnedInputAuditWriter(logger), null);
});
test('actual owned append and sync failures never establish input intent', async () => {
  for (const point of ['append', 'sync']) {
    const f = fixture();
    let store;
    try {
      store = await LogStore.open(f.location, utc, (p) => {
        if (p === point) throw Error('PRIVATE_CANARY');
      });
      const logger = new ApplicationLogger(
        store,
        () => utc,
        () => {},
        () => id,
      );
      assert.equal(await logger.inputAudit(fields()), 'DEGRADED');
      assert.equal(inspectOwnedInputAuditWriter(logger), null);
      for (const n of readdirSync(f.location.root).filter((n) => n.endsWith('.jsonl')))
        assert.equal(
          readFileSync(join(f.location.root, n), 'utf8').includes('PRIVATE_CANARY'),
          false,
        );
    } finally {
      await store?.close();
      f.cleanup();
    }
  }
});
