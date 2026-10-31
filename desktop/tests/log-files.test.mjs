import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { OwnedLogFiles, readLogFile, logInventory } from '../src/main/log-files.ts';
import {
  parseStoreDocument,
  verifySegment,
  segmentFilename,
  metadataFilename,
} from '../src/log-store-schema.ts';
import { encodeLogRecord } from '../src/log-contract.ts';
const root = fileURLToPath(new URL('..', import.meta.url));
function fixture() {
  const base = join(root, '.test-output');
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const directory = mkdtempSync(join(base, 'logs-')),
    parentToken = randomUUID();
  writeFileSync(join(directory, '.owner'), parentToken, { flag: 'wx' });
  return {
    location: { root: join(directory, 'logs-main'), parentToken },
    directory,
    cleanup() {
      assert.equal(lstatSync(directory).isSymbolicLink(), false);
      assert.equal(realpathSync(directory), resolve(directory));
      rmSync(directory, { recursive: true, force: false });
    },
  };
}
test('actual owned store creation/reopen and exclusive simultaneous owner', async () => {
  const f = fixture();
  try {
    const first = await OwnedLogFiles.acquire(f.location);
    await assert.rejects(OwnedLogFiles.acquire(f.location));
    const id = first.storeId;
    await first.release();
    const next = await OwnedLogFiles.acquire(f.location);
    assert.equal(next.storeId, id);
    assert.notEqual(next.ownerToken, first.ownerToken);
    await next.release();
    assert.equal(existsSync(join(f.location.root, '.writer-lock')), false);
    assert.equal(existsSync(join(f.location.root, 'unfinished.json')), false);
  } finally {
    f.cleanup();
  }
});
test('unowned existing root and wrong parent token fail without adoption', async () => {
  const f = fixture();
  try {
    mkdirSync(f.location.root);
    writeFileSync(join(f.location.root, 'private.txt'), 'CANARY');
    await assert.rejects(OwnedLogFiles.acquire(f.location));
    assert.deepEqual(readdirSync(f.location.root), ['private.txt']);
    await assert.rejects(OwnedLogFiles.acquire({ ...f.location, parentToken: randomUUID() }));
    assert.equal(existsSync(join(f.location.root, '.writer-lock')), false);
  } finally {
    f.cleanup();
  }
});
test('store metadata is bounded canonical JSON with duplicate rejection', () => {
  const storeId = randomUUID(),
    raw = JSON.stringify({ schemaVersion: 1, storeId, segmentIds: [] }) + '\n';
  assert.notEqual(parseStoreDocument(raw, 'holds', storeId), null);
  for (const value of [
    raw.replace('"schemaVersion":1', '"schemaVersion":0,"schemaVersion":1'),
    raw.replace('"segmentIds":[]', '"segmentIds":[],"path":"CANARY"'),
    raw + '\n',
    ' '.repeat(65537),
  ])
    assert.equal(parseStoreDocument(value, 'holds', storeId), null);
});
test('metadata replacement readback and recognized segment content validation', async () => {
  const f = fixture();
  try {
    const files = await OwnedLogFiles.acquire(f.location);
    const segmentId = randomUUID(),
      runId = randomUUID();
    const record = {
      schemaVersion: 1,
      runId,
      sequence: 1,
      utc: '2026-10-31T06:14:00.000Z',
      severity: 'INFO',
      component: 'MAIN',
      task: 'P1-04',
      event: 'STARTUP_READY',
      diagnosticId: null,
      code: 'OK',
    };
    const encoded = encodeLogRecord(record),
      handle = await files.createSegment(segmentFilename(segmentId));
    await handle.writeFile(encoded);
    await handle.sync();
    await handle.close();
    const metadata = {
      schemaVersion: 1,
      segmentId,
      storeId: files.storeId,
      runId,
      firstSequence: 1,
      lastSequence: 1,
      maxUtc: record.utc,
      finalized: true,
    };
    await files.replace(metadataFilename(segmentId), 'segment', metadata);
    assert.deepEqual(await files.document(metadataFilename(segmentId), 'segment'), metadata);
    assert.equal(
      verifySegment(
        await readLogFile(join(files.root, segmentFilename(segmentId)), 1048576),
        metadata,
      ),
      true,
    );
    assert.equal(verifySegment(encoded, { ...metadata, lastSequence: 2 }), false);
    assert.equal(
      verifySegment(encoded.replace('"code":"OK"', '"code":"CANARY","code":"OK"'), metadata),
      false,
    );
    await files.release();
  } finally {
    f.cleanup();
  }
});
test('unknown entries and over-limit file reads reject without deletion', async () => {
  const f = fixture();
  try {
    const files = await OwnedLogFiles.acquire(f.location);
    writeFileSync(join(files.root, 'unrecognized.txt'), 'CANARY');
    await assert.rejects(logInventory(files.root));
    assert.equal(existsSync(join(files.root, 'unrecognized.txt')), true);
    await assert.rejects(readLogFile(join(files.root, 'unrecognized.txt'), 2));
    await files.release();
  } finally {
    f.cleanup();
  }
});
const { LogStore } = await import('../src/main/log-store.ts');
const event = (runId, sequence, utc = '2026-09-01T00:00:00.000Z') => ({
  schemaVersion: 1,
  runId,
  sequence,
  utc,
  severity: 'INFO',
  component: 'MAIN',
  task: 'P1-04',
  event: 'STARTUP_READY',
  diagnosticId: null,
  code: 'OK',
});
test('real writer flush/reopen preserves ordered records and cutoff equality', async () => {
  const f = fixture();
  try {
    const run = randomUUID();
    const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z');
    for (let sequence = 1; sequence <= 20; sequence++)
      assert.equal(store.enqueue(event(run, sequence)), 'QUEUED');
    assert.equal(await store.close(), 'FLUSHED');
    const original = readdirSync(f.location.root).filter((n) => n.endsWith('.jsonl'));
    assert.equal(original.length, 1);
    const same = await LogStore.open(f.location, '2026-10-01T00:00:00.000Z');
    assert.ok(existsSync(join(f.location.root, original[0])));
    assert.equal(await same.close(), 'FLUSHED');
    const older = await LogStore.open(f.location, '2026-10-01T00:00:00.001Z');
    assert.equal(existsSync(join(f.location.root, original[0])), false);
    assert.equal(await older.close(), 'FLUSHED');
  } finally {
    f.cleanup();
  }
});
test('persistent holds survive reopen and serialize ahead of pruning', async () => {
  const f = fixture();
  try {
    const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z');
    store.enqueue(event(randomUUID(), 1));
    assert.equal(await store.flush(), 'FLUSHED');
    const name = readdirSync(f.location.root).find((n) => n.endsWith('.jsonl')),
      id = name.slice(8, 44);
    const hold = store.hold(id),
      prune = store.prune('2026-10-10T00:00:00.000Z');
    assert.equal(await hold, 'PERSISTED');
    assert.equal(await prune, 'PRUNED');
    assert.ok(existsSync(join(f.location.root, name)));
    assert.equal(await store.close(), 'FLUSHED');
    const reopen = await LogStore.open(f.location, '2026-11-10T00:00:00.000Z');
    assert.ok(existsSync(join(f.location.root, name)));
    assert.equal(await reopen.hold(randomUUID()), 'MISSING_SEGMENT');
    assert.equal(await reopen.close(), 'FLUSHED');
  } finally {
    f.cleanup();
  }
});
test('date rotation preserves exact event UTC; clock regression suppresses pruning', async () => {
  const f = fixture();
  try {
    const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z'),
      run = randomUUID();
    store.enqueue(event(run, 1));
    store.enqueue(event(run, 2, '2026-09-02T00:00:00.000Z'));
    assert.equal(await store.flush(), 'FLUSHED');
    assert.equal(readdirSync(f.location.root).filter((n) => n.endsWith('.jsonl')).length, 2);
    assert.equal(await store.prune('2026-08-31T00:00:00.000Z'), 'PRESERVED');
    assert.equal(store.health, 'DEGRADED');
    assert.equal(await store.close(), 'FAILED');
  } finally {
    f.cleanup();
  }
});
test('queue capacity and injected disk failure never claim flush or raw fallback', async () => {
  for (const mode of ['queue', 'disk']) {
    const f = fixture();
    try {
      const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z', (operation) => {
        if (mode === 'disk' && operation === 'append')
          throw Object.assign(new Error('PRIVATE-CANARY'), { code: 'ENOSPC' });
      });
      const run = randomUUID();
      if (mode === 'queue') {
        for (let n = 1; n <= 256; n++) assert.equal(store.enqueue(event(run, n)), 'QUEUED');
        assert.equal(store.enqueue(event(run, 257)), 'DROPPED');
      } else assert.equal(store.enqueue(event(run, 1)), 'QUEUED');
      assert.equal(await store.flush(), 'FAILED');
      assert.equal(store.health, 'DEGRADED');
      assert.equal(store.failureCode, mode === 'queue' ? 'QUEUE_FULL' : 'WRITE_FAILED');
      assert.equal(await store.close(), 'FAILED');
      assert.ok(existsSync(join(f.location.root, '.writer-lock')));
      for (const name of readdirSync(f.location.root).filter((n) => n.endsWith('.jsonl')))
        assert.equal(
          (await readLogFile(join(f.location.root, name), 1048576)).includes('PRIVATE-CANARY'),
          false,
        );
    } finally {
      f.cleanup();
    }
  }
});
test('release interruption retains ownership receipt for exact stopped-owner recovery', async () => {
  const f = fixture();
  try {
    const files = await OwnedLogFiles.acquire(f.location);
    await assert.rejects(
      files.release((step) => {
        if (step === 'owner') throw new Error('INJECTED_STOP');
      }),
    );
    assert.deepEqual(readdirSync(join(files.root, '.writer-lock')), []);
    const receipt = parseStoreDocument(
      await readLogFile(join(files.root, 'release.json'), 65536),
      'release',
      files.storeId,
    );
    assert.equal(receipt.ownerToken, files.ownerToken);
    await assert.rejects(OwnedLogFiles.acquire(f.location));
  } finally {
    f.cleanup();
  }
});
const { recoverLogStore } = await import('../src/main/log-recovery.ts');
test('stopped-owner recovery quarantines incomplete segments and permits fresh writes', async () => {
  const f = fixture();
  try {
    const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z', (operation) => {
      if (operation === 'sync') throw new Error('INJECTED_SYNC_FAILURE');
    });
    const record = event(randomUUID(), 1);
    assert.equal(store.enqueue(record), 'QUEUED');
    assert.equal(await store.close(), 'FAILED');
    const before = readdirSync(f.location.root).filter((n) => n.startsWith('segment-'));
    assert.ok(before.length > 0);
    assert.equal(
      await recoverLogStore(f.location, store.storeId, store.ownerToken, false),
      'PRECONDITION_REQUIRED',
    );
    assert.equal(
      await recoverLogStore(f.location, store.storeId, randomUUID(), true),
      'OWNERSHIP_REJECTED',
    );
    assert.equal(
      await recoverLogStore(f.location, store.storeId, store.ownerToken, true),
      'RECOVERED',
    );
    const reopened = await LogStore.open(f.location, '2026-11-01T00:00:00.000Z');
    for (const name of before) assert.ok(existsSync(join(f.location.root, name)));
    assert.equal(reopened.enqueue(event(randomUUID(), 1, '2026-11-01T00:00:00.000Z')), 'QUEUED');
    assert.equal(await reopened.close(), 'FLUSHED');
  } finally {
    f.cleanup();
  }
});
test('interrupted release empty lock recovers using exact retained receipt', async () => {
  const f = fixture();
  try {
    const files = await OwnedLogFiles.acquire(f.location);
    await assert.rejects(
      files.release((step) => {
        if (step === 'owner') throw new Error('STOP');
      }),
    );
    assert.equal(
      await recoverLogStore(f.location, files.storeId, files.ownerToken, true),
      'RECOVERED',
    );
    const reopened = await LogStore.open(f.location, '2026-10-31T00:00:00.000Z');
    assert.equal(await reopened.close(), 'FLUSHED');
  } finally {
    f.cleanup();
  }
});
test('close shares one completion promise and does not report premature flushed state', async () => {
  const f = fixture();
  let release;
  try {
    const wait = new Promise((resolve) => {
      release = resolve;
    });
    const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z', (operation) =>
      operation === 'sync' ? wait : undefined,
    );
    store.enqueue(event(randomUUID(), 1));
    const a = store.close(),
      b = store.close();
    assert.equal(a, b);
    let done = false;
    b.then(() => {
      done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(done, false);
    release();
    assert.equal(await a, 'FLUSHED');
  } finally {
    release?.();
    f.cleanup();
  }
});
test('enqueue snapshots primitive record metadata before caller mutation', async () => {
  const f = fixture();
  try {
    const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z'),
      record = event(randomUUID(), 1);
    store.enqueue(record);
    record.sequence = 99;
    record.utc = '1900-01-01T00:00:00.000Z';
    record.runId = randomUUID();
    assert.equal(await store.close(), 'FLUSHED');
    const reopened = await LogStore.open(f.location, '2026-09-02T00:00:00.000Z');
    assert.equal(reopened.health, 'AVAILABLE');
    assert.equal(await reopened.close(), 'FLUSHED');
  } finally {
    f.cleanup();
  }
});
test('recovery rejects malformed-present owner and unknown lock entry without mutation', async () => {
  for (const mode of ['malformed', 'extra']) {
    const f = fixture();
    try {
      const files = await OwnedLogFiles.acquire(f.location);
      await assert.rejects(
        files.release((step) => {
          if (step === 'owner') throw new Error('STOP');
        }),
      );
      const lock = join(files.root, '.writer-lock');
      writeFileSync(join(lock, mode === 'malformed' ? 'owner.json' : 'unexpected'), 'CANARY');
      const before = readdirSync(files.root).sort();
      const bytes = await readLogFile(
        join(lock, mode === 'malformed' ? 'owner.json' : 'unexpected'),
        65536,
      );
      assert.equal(
        await recoverLogStore(f.location, files.storeId, files.ownerToken, true),
        'OWNERSHIP_REJECTED',
      );
      assert.deepEqual(readdirSync(files.root).sort(), before);
      assert.equal(
        await readLogFile(join(lock, mode === 'malformed' ? 'owner.json' : 'unexpected'), 65536),
        bytes,
      );
    } finally {
      f.cleanup();
    }
  }
});
test('abandonment during release receipt stops later ownership deletion steps', async () => {
  const f = fixture();
  let resume;
  try {
    let reached;
    const ready = new Promise((r) => {
        reached = r;
      }),
      wait = new Promise((r) => {
        resume = r;
      });
    const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z', (operation) => {
      if (operation === 'release') {
        reached();
        return wait;
      }
    });
    const closing = store.close();
    await ready;
    store.abandon();
    resume();
    assert.equal(await closing, 'FAILED');
    assert.ok(existsSync(join(f.location.root, 'unfinished.json')));
    assert.ok(existsSync(join(f.location.root, '.writer-lock', 'owner.json')));
  } finally {
    resume?.();
    f.cleanup();
  }
});
test('microtask drain handoff never strands an accepted record', async () => {
  const store = new LogStore({}, () => {}),
    appended = [];
  store.append = async (record) => {
    appended.push(record.sequence);
  };
  const run = randomUUID();
  assert.equal(store.enqueue(event(run, 1)), 'QUEUED');
  await Promise.resolve();
  queueMicrotask(() => assert.equal(store.enqueue(event(run, 2)), 'QUEUED'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(appended, [1, 2]);
  assert.equal(store.pending, 0);
});
test('actual 1 MiB rotation preserves all records without oversized segments', async () => {
  const f = fixture();
  try {
    const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z'),
      run = randomUUID();
    for (let sequence = 1; sequence <= 5000; sequence++) {
      assert.equal(store.enqueue(event(run, sequence)), 'QUEUED');
      if (sequence % 128 === 0) await store.tail;
    }
    assert.equal(await store.close(), 'FLUSHED');
    const names = readdirSync(f.location.root).filter((n) => n.endsWith('.jsonl'));
    assert.equal(names.length, 2);
    let records = 0;
    for (const name of names) {
      const text = await readLogFile(join(f.location.root, name), 1024 * 1024);
      records += text.trim().split('\n').length;
      assert.ok(Buffer.byteLength(text) <= 1024 * 1024);
    }
    assert.equal(records, 5000);
  } finally {
    f.cleanup();
  }
});
test('actual inventory accepts 4096 entries and preserves over-limit state', async () => {
  const f = fixture();
  try {
    mkdirSync(f.location.root);
    for (let i = 0; i < 4096; i++)
      writeFileSync(join(f.location.root, `pending-${randomUUID()}.tmp`), '', { flag: 'wx' });
    assert.equal((await logInventory(f.location.root)).length, 4096);
    writeFileSync(join(f.location.root, `pending-${randomUUID()}.tmp`), '', { flag: 'wx' });
    await assert.rejects(logInventory(f.location.root), /LOG_ENTRY_LIMIT/);
    assert.equal(readdirSync(f.location.root).length, 4097);
  } finally {
    f.cleanup();
  }
});
test('daily rotation stops new writes after retention metadata becomes invalid', async () => {
  const f = fixture();
  try {
    const store = await LogStore.open(f.location, '2026-09-01T00:00:00.000Z'),
      run = randomUUID();
    store.enqueue(event(run, 1));
    await store.tail;
    writeFileSync(join(f.location.root, 'holds.json'), 'CORRUPT');
    store.enqueue(event(run, 2, '2026-09-02T00:00:00.000Z'));
    await store.tail;
    assert.equal(store.health, 'DEGRADED');
    assert.equal(await store.close(), 'FAILED');
    const names = readdirSync(f.location.root).filter((n) => n.endsWith('.jsonl'));
    assert.equal(names.length, 1);
    assert.equal(
      (await readLogFile(join(f.location.root, names[0]), 1024 * 1024)).trim().split('\n').length,
      1,
    );
  } finally {
    f.cleanup();
  }
});
test('metadata writes bind exact document kind and record identity to filename', async () => {
  const f = fixture();
  try {
    const files = await OwnedLogFiles.acquire(f.location);
    const before = readdirSync(files.root).sort();
    await assert.rejects(
      files.replace('state.json', 'holds', {
        schemaVersion: 1,
        storeId: files.storeId,
        segmentIds: [],
      }),
      /LOG_METADATA_REJECTED/,
    );
    await assert.rejects(
      files.replace(`recovery-${randomUUID()}.json`, 'recovery', {
        schemaVersion: 1,
        storeId: files.storeId,
        recoveryId: randomUUID(),
        previousOwnerToken: files.ownerToken,
        segmentIds: [],
        pendingIds: [],
      }),
      /LOG_METADATA_REJECTED/,
    );
    assert.deepEqual(readdirSync(files.root).sort(), before);
    await files.release();
  } finally {
    f.cleanup();
  }
});
