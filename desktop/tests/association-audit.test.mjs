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
import { snapshotAssociationAudit } from '../src/association-audit-contract.ts';
import { ApplicationLogger } from '../src/main/logging.ts';
import { LogStore } from '../src/main/log-store.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const utc = '2026-11-02T00:00:00.000Z';
function fixture() {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'association-audit-')),
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
  operation: 'BEGIN',
  stage: 'REQUEST',
  phase: 'INTENT',
  diagnosticId: id(1),
  operationId: id(2),
  ceremonyId: null,
  mode: 'CURRENT',
  expectedRevision: 0,
  resultingRevision: null,
  outcome: 'INTENT',
  code: 'OK',
});
const record = (association) => ({
  schemaVersion: 12,
  runId: id(9),
  sequence: 1,
  utc,
  severity: association.code === 'OK' ? 'INFO' : 'WARN',
  component: 'MAIN',
  task: 'P2-03',
  event: 'ASSOCIATION',
  association,
});
test('schema12 exact READ/REQUEST/EXECUTION/CANCEL tuples preserve captured IDs and R+3 history', () => {
  const variants = [
    fields(),
    { ...fields(), phase: 'RESULT', outcome: 'PENDING', resultingRevision: 1 },
    {
      ...fields(),
      phase: 'RESULT',
      outcome: 'FAILED',
      code: 'AUDIT_UNAVAILABLE',
      resultingRevision: 2,
    },
    {
      ...fields(),
      stage: 'EXECUTION',
      phase: 'RESULT',
      ceremonyId: id(3),
      outcome: 'COMMITTED',
      resultingRevision: 2,
    },
    {
      ...fields(),
      stage: 'EXECUTION',
      phase: 'RESULT',
      ceremonyId: id(3),
      outcome: 'COMMITTED',
      resultingRevision: 3,
    },
    {
      ...fields(),
      operation: 'GET',
      stage: 'READ',
      phase: 'RESULT',
      operationId: null,
      mode: null,
      expectedRevision: null,
      resultingRevision: 0,
      outcome: 'OBSERVED',
    },
    {
      ...fields(),
      operation: 'CANCEL',
      phase: 'RESULT',
      resultingRevision: 1,
      outcome: 'CANCELLED',
      code: 'CANCELLED',
    },
  ];
  for (const f of variants) {
    assert.ok(snapshotAssociationAudit(f));
    assert.ok(encodeLogRecord(record(f)));
  }
  for (const f of [
    { ...fields(), ceremonyId: id(3) },
    { ...fields(), diagnosticId: id(2) },
    { ...fields(), operation: 'CANCEL' },
    { ...variants[3], phase: 'INTENT' },
    { ...variants[3], resultingRevision: 4 },
    { ...variants[3], serial: 'private' },
    { ...variants[3], outcome: 'OUTCOME_UNKNOWN' },
    { ...fields(), phase: 'RESULT', outcome: 'PENDING', resultingRevision: 2 },
  ])
    assert.equal(snapshotAssociationAudit(f), null);
  let getters = 0;
  const bad = { ...fields() };
  Object.defineProperty(bad, 'code', {
    enumerable: true,
    get() {
      getters++;
      return 'OK';
    },
  });
  assert.equal(snapshotAssociationAudit(bad), null);
  assert.equal(getters, 0);
});
test('actual owned logger writes schema12 and LogStore reopens exact history without private payload', async () => {
  const f = fixture();
  let logger;
  try {
    logger = await ApplicationLogger.open(f.location, () => {});
    assert.equal(await logger.associationAudit(fields()), 'AVAILABLE');
    assert.equal(
      await logger.associationAudit({
        ...fields(),
        phase: 'RESULT',
        outcome: 'PENDING',
        resultingRevision: 1,
      }),
      'AVAILABLE',
    );
    assert.equal(await logger.close(), 'FLUSHED');
    const raw = readdirSync(f.location.root)
      .filter((n) => n.endsWith('.jsonl'))
      .map((n) => readFileSync(join(f.location.root, n), 'utf8'))
      .join('');
    const entries = raw
      .trim()
      .split('\n')
      .map(JSON.parse)
      .filter((r) => r.schemaVersion === 12)
      .sort((a, b) => a.sequence - b.sequence);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].association.ceremonyId, null);
    assert.equal(entries[1].association.resultingRevision, 1);
    assert.equal(raw.includes('serial'), false);
    const reopened = await LogStore.open(f.location, new Date().toISOString());
    assert.equal(await reopened.close(), 'FLUSHED');
    assert.equal(await logger.associationAudit(fields()), 'DEGRADED');
  } finally {
    await logger?.close();
    f.cleanup();
  }
});
test('association audit captures immutable fields and held flush cannot report AVAILABLE after close', async () => {
  let finish, captured;
  const logger = new ApplicationLogger(
    {
      health: 'AVAILABLE',
      enqueue(r) {
        captured = r;
        return 'QUEUED';
      },
      flush() {
        return new Promise((r) => (finish = r));
      },
      close() {
        return Promise.resolve('FLUSHED');
      },
    },
    () => utc,
    () => {},
    () => id(9),
  );
  const mutable = fields();
  let settled = false;
  const pending = logger.associationAudit(mutable).then((r) => {
    settled = true;
    return r;
  });
  mutable.mode = 'private';
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  assert.equal(captured.association.mode, 'CURRENT');
  await logger.close();
  finish('FLUSHED');
  assert.equal(await pending, 'DEGRADED');
});
test('invalid audit and failed append/flush fail fixed with no source text persistence', async () => {
  for (const cause of ['shape', 'append', 'flush']) {
    let queued = 0;
    const logger = new ApplicationLogger(
      {
        health: 'AVAILABLE',
        enqueue() {
          queued++;
          return cause === 'append' ? 'REJECTED' : 'QUEUED';
        },
        flush() {
          return Promise.resolve('FAILED');
        },
        close() {
          return Promise.resolve('FLUSHED');
        },
      },
      () => utc,
      () => {},
      () => id(9),
    );
    assert.equal(
      await logger.associationAudit(
        cause === 'shape' ? { ...fields(), private: 'CANARY' } : fields(),
      ),
      'DEGRADED',
    );
    if (cause === 'shape') assert.equal(queued, 0);
    await logger.close();
  }
});

test('reserved REQUEST failure records actual R+2 or already superseded R+3, never stale R', () => {
  for (const revision of [2, 3])
    assert.ok(
      snapshotAssociationAudit({
        ...fields(),
        phase: 'RESULT',
        outcome: 'FAILED',
        code: 'AUDIT_UNAVAILABLE',
        resultingRevision: revision,
      }),
    );
  for (const revision of [0, 1, 4])
    assert.equal(
      snapshotAssociationAudit({
        ...fields(),
        phase: 'RESULT',
        outcome: 'FAILED',
        code: 'AUDIT_UNAVAILABLE',
        resultingRevision: revision,
      }),
      null,
    );
  // Exhausted diagnostics are represented by no record, not an invented nullable schema12 ID.
  assert.equal(
    snapshotAssociationAudit({
      ...fields(),
      operation: 'CANCEL',
      phase: 'RESULT',
      outcome: 'CANCELLED',
      code: 'CANCELLED',
      resultingRevision: 1,
      diagnosticId: null,
    }),
    null,
  );
});
