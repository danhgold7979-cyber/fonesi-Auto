import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { createDeviceDiagnosticCollector } from '../src/main/device-diagnostic-collector.ts';
import { createDeviceDiagnosticExporter } from '../src/main/device-diagnostic-export.ts';
const id = '00000000-0000-4000-8000-000000000001';
const request = { version: 1, exportId: id };
const record = () => ({
  version: 1,
  deviceId: '00000000-0000-4000-8000-000000000002',
  commandId: null,
  correlationId: null,
  operation: 'MODEL',
  outcome: 'NOT_DISPATCHED',
  code: 'BINARY_UNAVAILABLE',
  health: 'ADB_UNAVAILABLE',
  durationMs: null,
});
async function fixture(t) {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'fonesi-diagnostic-test-'),
  );
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  const collector = createDeviceDiagnosticCollector(),
    exporter = createDeviceDiagnosticExporter(collector),
    abort = new AbortController();
  return {
    root,
    directory: path.join(root, `fonesi-diagnostics-${id}`),
    collector,
    abort,
    run: (req = request, current = () => true) => exporter.export(req, root, abort.signal, current),
    exporter,
  };
}
function patch(t, key, replacement) {
  const original = fs[key];
  fs[key] = replacement(original);
  syncBuiltinESMExports();
  t.after(() => {
    fs[key] = original;
    syncBuiltinESMExports();
  });
}
test('export creates exact verified manifest/payload, no raw identity or private text', async (t) => {
  const f = await fixture(t);
  f.collector.append(record());
  f.collector.append({ ...record(), raw: 'SECRET_CANARY serial-private 192.0.2.1' });
  const result = await f.run();
  assert.equal(result.ok, true);
  assert.deepEqual((await fs.readdir(f.directory)).sort(), ['commands.ndjson', 'manifest.json']);
  const payload = await fs.readFile(path.join(f.directory, 'commands.ndjson'), 'utf8');
  const manifest = JSON.parse(await fs.readFile(path.join(f.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.bytes, Buffer.byteLength(payload));
  assert.equal(manifest.records, 1);
  assert.equal(manifest.dropped, 1);
  assert.equal(manifest.sha256, createHash('sha256').update(payload).digest('hex'));
  assert.equal(manifest.sha256, result.sha256);
  for (const text of ['SECRET_CANARY', 'serial-private', '192.0.2.1', record().deviceId])
    assert.equal(payload.includes(text), false);
  assert.equal(f.collector.snapshot().records.length, 1);
});
test('empty export is explicit and contains an empty payload', async (t) => {
  const f = await fixture(t);
  const result = await f.run();
  assert.equal(result.ok, true);
  assert.equal(result.records, 0);
  assert.equal(result.bytes, 0);
  assert.equal(await fs.readFile(path.join(f.directory, 'commands.ndjson'), 'utf8'), '');
});
test('invalid request and parent reject without filesystem writes or getters', async (t) => {
  const f = await fixture(t);
  let invoked = false;
  const getter = Object.defineProperty({}, 'version', {
    get() {
      invoked = true;
      return 1;
    },
  });
  for (const req of [
    null,
    { ...request, path: '/tmp' },
    { version: 1, exportId: '../elsewhere' },
    getter,
  ])
    assert.equal((await f.run(req)).code, 'INVALID_REQUEST');
  assert.equal(invoked, false);
  assert.equal(
    (await f.exporter.export(request, 'relative', f.abort.signal, () => true)).code,
    'INVALID_REQUEST',
  );
  assert.deepEqual(await fs.readdir(f.root), []);
});
test('collision never overwrites or removes existing export content', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(f.directory);
  await fs.writeFile(path.join(f.directory, 'unrelated'), 'keep');
  assert.equal((await f.run()).code, 'COLLISION');
  assert.equal(await fs.readFile(path.join(f.directory, 'unrelated'), 'utf8'), 'keep');
});
test('pre-cancel and revoked or throwing owner do not create files', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.run(request, () => false)).code, 'OWNER_REVOKED');
  assert.equal(
    (
      await f.run(request, () => {
        throw new Error('private path');
      })
    ).code,
    'OWNER_REVOKED',
  );
  f.abort.abort();
  assert.equal((await f.run()).code, 'CANCELLED');
  assert.deepEqual(await fs.readdir(f.root), []);
});
test('single export lane rejects overlapping request; append does not alter snapshot', async (t) => {
  const f = await fixture(t);
  f.collector.append(record());
  const first = f.run();
  f.collector.append(record());
  assert.equal((await f.run()).code, 'BUSY');
  const result = await first;
  assert.equal(result.ok, true);
  assert.equal(result.records, 1);
  assert.equal(f.collector.snapshot().records.length, 2);
});
test('cancel after write cleans only owned files and permits later export', async (t) => {
  const f = await fixture(t);
  let cancelled = false;
  patch(t, 'open', (original) => async (...args) => {
    const handle = await original(...args),
      write = handle.writeFile.bind(handle);
    handle.writeFile = async (...values) => {
      await write(...values);
      if (!cancelled) {
        cancelled = true;
        f.abort.abort();
      }
    };
    return handle;
  });
  assert.equal((await f.run()).code, 'CANCELLED');
  assert.equal(cancelled, true);
  assert.deepEqual(await fs.readdir(f.root), []);
  const later = await f.exporter.export(request, f.root, new AbortController().signal, () => true);
  assert.equal(later.ok, true);
});
test('collector close during write fences publication and cleans output', async (t) => {
  const f = await fixture(t);
  patch(t, 'open', (original) => async (...args) => {
    const h = await original(...args),
      write = h.writeFile.bind(h);
    h.writeFile = async (...v) => {
      await write(...v);
      f.collector.close();
    };
    return h;
  });
  assert.equal((await f.run()).code, 'OWNER_REVOKED');
  assert.deepEqual(await fs.readdir(f.root), []);
});
test('write failure is finite, cleans partial content and retains buffer', async (t) => {
  const f = await fixture(t);
  f.collector.append(record());
  patch(t, 'open', (original) => async (...args) => {
    const h = await original(...args);
    h.writeFile = async () => {
      throw new Error('SECRET private path');
    };
    return h;
  });
  assert.deepEqual(await f.run(), { ok: false, code: 'IO_FAILED' });
  assert.deepEqual(await fs.readdir(f.root), []);
  assert.equal(f.collector.snapshot().records.length, 1);
});
test('readback corruption refuses success and cleans owned files', async (t) => {
  const f = await fixture(t);
  patch(t, 'open', (original) => async (...args) => {
    const handle = await original(...args);
    if (args[1] === 'r') {
      handle.read = async (buffer) => {
        buffer[0] = 120;
        return { bytesRead: 1, buffer };
      };
    }
    return handle;
  });
  assert.equal((await f.run()).code, 'IO_FAILED');
  assert.deepEqual(await fs.readdir(f.root), []);
});
test('unrelated late file is preserved and cleanup failure is explicit', async (t) => {
  const f = await fixture(t);
  patch(t, 'readdir', (original) => async (...args) => {
    if (args[0] === f.directory)
      await fs.writeFile(path.join(f.directory, 'unrelated'), 'keep', { flag: 'wx' });
    return original(...args);
  });
  assert.equal((await f.run()).code, 'CLEANUP_FAILED');
  assert.equal(await fs.readFile(path.join(f.directory, 'unrelated'), 'utf8'), 'keep');
});
test('foreign replacement file is retained rather than unlinked during cleanup', async (t) => {
  const f = await fixture(t);
  let changed = false;
  patch(t, 'open', (original) => async (...args) => {
    if (!changed && args[1] === 'r' && String(args[0]).endsWith('commands.ndjson')) {
      changed = true;
      await fs.rename(args[0], path.join(f.root, 'original-owned'));
      await fs.writeFile(args[0], 'foreign');
    }
    return original(...args);
  });
  assert.equal((await f.run()).code, 'CLEANUP_FAILED');
  assert.equal(await fs.readFile(path.join(f.directory, 'commands.ndjson'), 'utf8'), 'foreign');
});
test('symlink parent is refused without modifying its target', async (t) => {
  const f = await fixture(t),
    link = path.join(f.root, 'alias');
  await fs.symlink(f.root, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(
    (await f.exporter.export(request, link, f.abort.signal, () => true)).code,
    'INVALID_REQUEST',
  );
  assert.deepEqual(await fs.readdir(f.root), ['alias']);
});
test('real collector identity required, closed collector cannot start an exporter', () => {
  assert.throws(
    () =>
      createDeviceDiagnosticExporter({
        snapshot() {
          throw Error();
        },
      }),
    /DIAGNOSTIC_COLLECTOR_REQUIRED/,
  );
  const c = createDeviceDiagnosticCollector();
  c.close();
  assert.throws(() => createDeviceDiagnosticExporter(c), /DIAGNOSTIC_COLLECTOR_REQUIRED/);
});

test('owner loss after write cleans output without publishing success', async (t) => {
  const f = await fixture(t);
  let current = true;
  patch(t, 'open', (original) => async (...args) => {
    const h = await original(...args),
      write = h.writeFile.bind(h);
    h.writeFile = async (...values) => {
      await write(...values);
      current = false;
    };
    return h;
  });
  assert.equal((await f.run(request, () => current)).code, 'OWNER_REVOKED');
  assert.deepEqual(await fs.readdir(f.root), []);
});
test('one exporter service is admitted per collector', () => {
  const c = createDeviceDiagnosticCollector();
  createDeviceDiagnosticExporter(c);
  assert.throws(() => createDeviceDiagnosticExporter(c), /DIAGNOSTIC_COLLECTOR_REQUIRED/);
});
test('same-inode oversized readback is rejected before allocating its content', async (t) => {
  const f = await fixture(t);
  let enlarged = false;
  patch(t, 'lstat', (original) => async (...args) => {
    if (!enlarged && String(args[0]).endsWith('commands.ndjson')) {
      enlarged = true;
      await fs.truncate(args[0], 1024 * 1024);
    }
    return original(...args);
  });
  assert.equal((await f.run()).code, 'IO_FAILED');
  assert.deepEqual(await fs.readdir(f.root), []);
});

test('unknown parent inode refuses before directory creation', async (t) => {
  const f = await fixture(t);
  patch(t, 'lstat', (original) => async (...args) => {
    const observed = await original(...args);
    if (args[0] === f.root) observed.ino = 0n;
    return observed;
  });
  assert.equal((await f.run()).code, 'INVALID_REQUEST');
  assert.deepEqual(await fs.readdir(f.root), []);
});
test('unknown created directory identity is preserved with cleanup failure', async (t) => {
  const f = await fixture(t);
  patch(t, 'lstat', (original) => async (...args) => {
    const observed = await original(...args);
    if (args[0] === f.directory) observed.ino = 0n;
    return observed;
  });
  assert.equal((await f.run()).code, 'CLEANUP_FAILED');
  assert.deepEqual(await fs.readdir(f.directory), []);
});
test('unknown exclusive file identity closes handle but preserves unidentifiable file', async (t) => {
  const f = await fixture(t);
  let closed = false,
    wrote = false;
  patch(t, 'open', (original) => async (...args) => {
    const h = await original(...args),
      stat = h.stat.bind(h),
      close = h.close.bind(h);
    h.stat = async (...values) => {
      const observed = await stat(...values);
      observed.ino = 0n;
      return observed;
    };
    h.close = async () => {
      await close();
      closed = true;
    };
    h.writeFile = async () => {
      wrote = true;
      throw Error('unexpected write');
    };
    return h;
  });
  assert.equal((await f.run()).code, 'CLEANUP_FAILED');
  assert.equal(closed, true);
  assert.equal(wrote, false);
  assert.deepEqual(await fs.readdir(f.directory), ['commands.ndjson']);
  assert.equal((await fs.stat(path.join(f.directory, 'commands.ndjson'))).size, 0);
});
