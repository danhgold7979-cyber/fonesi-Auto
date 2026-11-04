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
import { SETTINGS_ERRORS } from '../src/settings-contract.ts';
import { ApplicationLogger } from '../src/main/logging.ts';
import { LogStore } from '../src/main/log-store.ts';
const id = 'abcdef00-0000-4000-8000-000000000001',
  utc = '2026-10-31T12:00:00.000Z';
const fields = () => ({
  operation: 'UPDATE',
  phase: 'INTENT',
  diagnosticId: id,
  expectedRevision: 0,
  resultingRevision: null,
  code: 'OK',
});
const record = () => ({
  schemaVersion: 3,
  runId: id,
  sequence: 1,
  utc,
  severity: 'INFO',
  component: 'MAIN',
  task: 'P1-07',
  event: 'SETTINGS_OPERATION',
  diagnosticId: id,
  code: 'OK',
  operation: 'UPDATE',
  phase: 'INTENT',
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
  const root = mkdtempSync(join(base, 'settings-audit-')),
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
test('schema3 exact canonical vocabulary and nullable safe revisions preserve old schemas', () => {
  const value = record();
  assert.equal(encodeLogRecord(value), JSON.stringify(value) + '\n');
  for (const operation of ['READ', 'UPDATE', 'RESET', 'RESTORE', 'WINDOW'])
    for (const code of ['OK', ...SETTINGS_ERRORS]) {
      assert.notEqual(
        encodeLogRecord({
          ...value,
          operation,
          phase: 'RESULT',
          code,
          severity: code === 'OK' ? 'INFO' : 'WARN',
          expectedRevision: null,
          resultingRevision: null,
        }),
        null,
      );
    }
  for (const patch of [
    { schemaVersion: 4 },
    { theme: 'DARK' },
    { normalBounds: null },
    { diagnosticId: null },
    { expectedRevision: -0 },
    { expectedRevision: -1 },
    { expectedRevision: Infinity },
    { resultingRevision: NaN },
    { resultingRevision: Number.MAX_SAFE_INTEGER + 1 },
    { operation: 'EXPORT' },
    { phase: 'REQUEST' },
    { code: 'RAW' },
    { phase: 'INTENT', code: 'WRITE_FAILED', severity: 'WARN' },
    { resultingRevision: 1 },
  ])
    assert.equal(encodeLogRecord({ ...value, ...patch }), null);
  let called = false;
  const getter = { ...value };
  Object.defineProperty(getter, 'expectedRevision', {
    enumerable: true,
    get() {
      called = true;
      return 0;
    },
  });
  assert.equal(encodeLogRecord(getter), null);
  assert.equal(called, false);
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
  const vault = {
    schemaVersion: 2,
    runId: id,
    sequence: 3,
    utc,
    severity: 'INFO',
    component: 'MAIN',
    task: 'P1-06',
    event: 'SECRET_OPERATION',
    diagnosticId: id,
    code: 'OK',
    operation: 'READ',
    phase: 'INTENT',
    secretId: null,
    revision: null,
  };
  assert.equal(encodeLogRecord(legacy), JSON.stringify(legacy) + '\n');
  assert.equal(encodeLogRecord(vault), JSON.stringify(vault) + '\n');
});
test('real owned settings audit flush, mixed schema storage and reopen', async () => {
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
    assert.equal(
      await logger.vaultAudit({
        operation: 'READ',
        phase: 'INTENT',
        diagnosticId: id,
        secretId: null,
        revision: null,
        code: 'OK',
      }),
      'AVAILABLE',
    );
    assert.equal(await logger.settingsAudit(fields()), 'AVAILABLE');
    assert.equal(
      await logger.settingsAudit({ ...fields(), phase: 'RESULT', resultingRevision: 1 }),
      'AVAILABLE',
    );
    assert.equal(await logger.close(), 'FLUSHED');
    const raw = readdirSync(f.location.root)
      .filter((x) => x.endsWith('.jsonl'))
      .map((x) => readFileSync(join(f.location.root, x), 'utf8'))
      .join('');
    for (const version of [1, 2, 3]) assert.ok(raw.includes(`"schemaVersion":${version}`));
    assert.equal(raw.includes('PRIVATE_CANARY'), false);
    store = await LogStore.open(f.location, utc);
    assert.equal(await store.close(), 'FLUSHED');
  } finally {
    await store?.close();
    f.cleanup();
  }
});
test('settings audit snapshots before await and requires real completed flush', async () => {
  let finish, queued;
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
    ),
    input = fields();
  let done = false;
  const pending = logger.settingsAudit(input).then((value) => {
    done = true;
    return value;
  });
  input.operation = 'RESET';
  await Promise.resolve();
  assert.equal(done, false);
  assert.equal(queued.operation, 'UPDATE');
  finish('FAILED');
  assert.equal(await pending, 'DEGRADED');
});
test('actual append/sync failures expose fixed degradation without private error fields', async () => {
  for (const fault of ['append', 'sync']) {
    const f = fixture();
    let store;
    const notices = [];
    try {
      store = await LogStore.open(f.location, utc, (point) => {
        if (point === fault) throw Error('PRIVATE_CANARY');
      });
      const logger = new ApplicationLogger(
        store,
        () => utc,
        (value) => notices.push(value),
        () => id,
      );
      assert.equal(await logger.settingsAudit(fields()), 'DEGRADED');
      assert.deepEqual(notices, ['LOGGING_DEGRADED']);
      for (const name of readdirSync(f.location.root).filter((x) => x.endsWith('.jsonl')))
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
test('settings audit preserves monotonic sequence and one clock-regression notice', async () => {
  let now = utc;
  const records = [];
  const logger = new ApplicationLogger(
    {
      health: 'AVAILABLE',
      enqueue(record) {
        records.push(record);
        return 'QUEUED';
      },
      async flush() {
        return 'FLUSHED';
      },
    },
    () => now,
    () => {},
    () => id,
  );
  logger.emit('STARTUP_READY', 'OK');
  now = '2026-10-31T11:00:00.000Z';
  await logger.settingsAudit(fields());
  now = '2026-10-31T10:00:00.000Z';
  await logger.settingsAudit(fields());
  assert.equal(records.filter((x) => x.code === 'CLOCK_REGRESSION').length, 1);
  assert.deepEqual(
    records.map((x) => x.sequence),
    [1, 2, 3, 4],
  );
});
