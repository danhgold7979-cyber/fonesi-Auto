import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import {
  createDiagnosticsExportService,
  DIAGNOSTICS_MUTATION_LIMIT,
} from '../src/main/diagnostics-export-service.ts';
import {
  parseDiagnosticsExportRequest,
  parseDiagnosticsExportResponse,
} from '../src/diagnostics-report-contract.ts';
const wire = (id, method = 'get', extra = {}) =>
  JSON.stringify({ version: 1, requestId: `p${id}`, method: `diagnostics.${method}`, ...extra });
const record = {
  version: 1,
  deviceId: '00000000-0000-4000-8000-000000000001',
  commandId: null,
  correlationId: null,
  operation: 'HOME',
  outcome: 'NOT_DISPATCHED',
  code: 'BINARY_UNAVAILABLE',
  health: 'UNKNOWN',
  durationMs: null,
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  return {
    promise: new Promise((r) => {
      resolve = r;
    }),
    resolve: (v) => resolve(v),
  };
}
async function fixture(t, choose) {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'fonesi-diagnostics-service-'),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let current = true,
    requests = 0,
    id = 0;
  const service = createDiagnosticsExportService({
    current: () => current,
    chooseDirectory: async () => {
      requests++;
      return choose ? choose(root) : root;
    },
  });
  const call = (method = 'get', extra = {}, rid = ++id) => {
    const raw = service.execute(wire(rid, method, extra), () => true);
    assert.ok(parseDiagnosticsExportResponse(raw), raw);
    return JSON.parse(raw);
  };
  const terminal = async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const value = call();
      if (!['PENDING', 'CANCEL_PENDING'].includes(value.snapshot?.state)) return value;
    }
    throw Error('NO_TERMINAL');
  };
  return {
    root,
    service,
    call,
    terminal,
    requests: () => requests,
    revoke: () => {
      current = false;
    },
  };
}
test('strict request and response reject extra path/raw fields and inconsistent terminal state', () => {
  for (const raw of [
    {},
    'null',
    '{}',
    wire(1, 'export', { expectedRevision: 0, path: '/tmp' }),
    wire(1, 'cancel', { operationId: '../x' }),
    wire(1, 'export', { expectedRevision: -1 }),
  ])
    assert.equal(parseDiagnosticsExportRequest(raw), null);
  assert.ok(parseDiagnosticsExportRequest(wire(1)));
  assert.equal(
    parseDiagnosticsExportResponse(
      JSON.stringify({
        version: 1,
        requestId: 'p1',
        ok: true,
        snapshot: {
          revision: 1,
          state: 'EXPORTED',
          operationId: null,
          records: 0,
          dropped: 0,
          bytes: 0,
          sha256: null,
          code: null,
        },
      }),
    ),
    null,
  );
});
test('actual service collects finite outcomes and performs explicit exact-file export', async (t) => {
  const f = await fixture(t);
  f.service.observer()(record);
  assert.equal(f.requests(), 0);
  const pending = f.call('export', { expectedRevision: 0 });
  assert.equal(pending.snapshot.state, 'PENDING');
  assert.equal(f.requests(), 0);
  const done = await f.terminal();
  assert.equal(done.snapshot.state, 'EXPORTED');
  assert.equal(done.snapshot.records, 1);
  assert.equal(f.requests(), 1);
  const dirs = await fs.readdir(f.root);
  assert.equal(dirs.length, 1);
  assert.deepEqual((await fs.readdir(path.join(f.root, dirs[0]))).sort(), [
    'commands.ndjson',
    'manifest.json',
  ]);
  assert.equal(await f.service.close(), true);
});
test('mutation retries deduplicate exact request, reject conflicting ID and stale CAS', async (t) => {
  const picker = deferred(),
    f = await fixture(t, () => picker.promise);
  const first = f.call('export', { expectedRevision: 0 }, 100);
  assert.deepEqual(f.call('export', { expectedRevision: 0 }, 100), first);
  assert.equal(f.call('get', {}, 100).code, 'ID_CONFLICT');
  assert.equal(f.call('export', { expectedRevision: 0 }, 101).code, 'BUSY');
  await tick();
  assert.equal(f.requests(), 1);
  picker.resolve(null);
  assert.equal((await f.terminal()).snapshot.state, 'CANCELLED');
  assert.equal(f.call('export', { expectedRevision: 0 }, 101).code, 'BUSY');
  assert.equal(f.call('export', { expectedRevision: 0 }, 102).code, 'STALE_REVISION');
});
test('cancel stays pending while picker is unsettled; later directory creates no files', async (t) => {
  const picker = deferred(),
    f = await fixture(t, () => picker.promise);
  const pending = f.call('export', { expectedRevision: 0 });
  await tick();
  assert.equal(
    f.call('cancel', { operationId: pending.snapshot.operationId }).snapshot.state,
    'CANCEL_PENDING',
  );
  assert.equal(f.call().snapshot.state, 'CANCEL_PENDING');
  picker.resolve(f.root);
  assert.equal((await f.terminal()).snapshot.state, 'CANCELLED');
  assert.deepEqual(await fs.readdir(f.root), []);
});
test('close detaches revoked picker; late selection and old observer cannot affect new window', async (t) => {
  const picker = deferred(),
    old = await fixture(t, () => picker.promise),
    fresh = await fixture(t);
  const observer = old.service.observer();
  old.call('export', { expectedRevision: 0 });
  await tick();
  assert.equal(await old.service.close(), true);
  observer(record);
  picker.resolve(old.root);
  await tick();
  await tick();
  assert.deepEqual(await fs.readdir(old.root), []);
  assert.equal(fresh.call().snapshot.records, 0);
  assert.equal(old.call().code, 'SESSION_REVOKED');
});
test('owner loss while picker waits refuses export with truthful terminal failure', async (t) => {
  const picker = deferred(),
    f = await fixture(t, () => picker.promise);
  f.call('export', { expectedRevision: 0 });
  await tick();
  f.revoke();
  picker.resolve(f.root);
  await tick();
  assert.equal(f.call().code, 'SESSION_REVOKED');
  assert.deepEqual(await fs.readdir(f.root), []);
  assert.equal(await f.service.close(), true);
});
test('shutdown drains actual delayed file write before returning', async (t) => {
  const f = await fixture(t),
    blocked = deferred(),
    entered = deferred();
  const original = fs.open;
  fs.open = async (...args) => {
    const h = await original(...args),
      write = h.writeFile.bind(h);
    if (args[1] === 'wx')
      h.writeFile = async (...v) => {
        entered.resolve();
        await blocked.promise;
        return write(...v);
      };
    return h;
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.open = original;
    syncBuiltinESMExports();
  });
  f.call('export', { expectedRevision: 0 });
  await entered.promise;
  let finished = false;
  const drain = f.service.close().then((v) => {
    finished = true;
    return v;
  });
  await tick();
  assert.equal(finished, false);
  blocked.resolve();
  assert.equal(await drain, true);
  assert.deepEqual(await fs.readdir(f.root), []);
});
test('mutation cap never evicts old requests or permits replay', async (t) => {
  const picker = deferred(),
    f = await fixture(t, () => picker.promise);
  const first = f.call('export', { expectedRevision: 0 }, 1);
  for (let id = 2; id <= DIAGNOSTICS_MUTATION_LIMIT; id++)
    assert.equal(f.call('cancel', { operationId: first.snapshot.operationId }, id).ok, true);
  assert.equal(
    f.call('cancel', { operationId: first.snapshot.operationId }, DIAGNOSTICS_MUTATION_LIMIT + 1)
      .code,
    'LIMIT_EXCEEDED',
  );
  assert.deepEqual(f.call('export', { expectedRevision: 0 }, 1), first);
  await f.service.close();
  picker.resolve(null);
});

test('cleanup failure stays latched across a later successful export and shutdown', async (t) => {
  const f = await fixture(t),
    original = fs.readdir;
  let injected = false;
  // Inject an unrelated entry into only the first owned export directory.
  fs.readdir = async (...args) => {
    if (!injected && String(args[0]).startsWith(f.root + path.sep)) {
      injected = true;
      await fs.writeFile(path.join(args[0], 'foreign'), 'preserve', { flag: 'wx' });
    }
    return original(...args);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.readdir = original;
    syncBuiltinESMExports();
  });
  f.call('export', { expectedRevision: 0 });
  const failed = await f.terminal();
  assert.equal(failed.snapshot.code, 'CLEANUP_FAILED');
  fs.readdir = original;
  syncBuiltinESMExports();
  f.call('export', { expectedRevision: failed.snapshot.revision });
  assert.equal((await f.terminal()).snapshot.state, 'EXPORTED');
  assert.equal(await f.service.close(), false);
});

test('cancel before queued launch never opens the native picker', async (t) => {
  const f = await fixture(t);
  const pending = f.call('export', { expectedRevision: 0 });
  f.call('cancel', { operationId: pending.snapshot.operationId });
  assert.equal((await f.terminal()).snapshot.state, 'CANCELLED');
  assert.equal(f.requests(), 0);
  assert.deepEqual(await fs.readdir(f.root), []);
});
