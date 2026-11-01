import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { createPlatformToolsDownload } from '../src/main/platform-tools-download.ts';
import { PLATFORM_TOOLS_CANDIDATE } from '../src/main/platform-tools-candidate.ts';
function fake() {
  let callback, options;
  const req = new EventEmitter();
  req.end = () => {};
  req.destroy = () => {};
  const res = new EventEmitter();
  res.destroy = () => {};
  res.statusCode = 200;
  res.headers = { 'content-length': String(PLATFORM_TOOLS_CANDIDATE.archive.bytes) };
  return {
    req,
    res,
    get options() {
      return options;
    },
    transport(o, cb) {
      options = o;
      callback = cb;
      return req;
    },
    respond() {
      callback(res);
    },
    close() {
      res.emit('close');
      req.emit('close');
    },
  };
}
const tick = () => new Promise((r) => setImmediate(r));
test('fixed HTTPS request, exact bytes and resolution waits both actual close events', async () => {
  const f = fake();
  let done = false;
  const p = createPlatformToolsDownload(f.transport)(new AbortController().signal).then((x) => {
    done = true;
    return x;
  });
  f.respond();
  f.res.emit('data', Buffer.alloc(PLATFORM_TOOLS_CANDIDATE.archive.bytes));
  f.res.emit('end');
  await tick();
  assert.equal(done, false);
  f.res.emit('close');
  await tick();
  assert.equal(done, false);
  f.req.emit('close');
  assert.equal((await p).length, PLATFORM_TOOLS_CANDIDATE.archive.bytes);
  assert.equal(f.options.hostname, 'dl.google.com');
  assert.equal(f.options.method, 'GET');
  assert.equal(f.options.rejectUnauthorized, true);
});
test('redirect, encoding, wrong length, overflow and incomplete body fail only after closure', async () => {
  for (const kind of ['redirect', 'encoding', 'length', 'overflow', 'incomplete']) {
    const f = fake();
    const p = createPlatformToolsDownload(f.transport)(new AbortController().signal);
    let done = false;
    const observed = p.then(
      () => assert.fail(),
      (e) => {
        done = true;
        assert.equal(e.message, 'DOWNLOAD_FAILED');
      },
    );
    if (kind === 'redirect') f.res.statusCode = 302;
    if (kind === 'encoding') f.res.headers['content-encoding'] = 'gzip';
    if (kind === 'length') f.res.headers['content-length'] = '1';
    f.respond();
    if (kind === 'overflow')
      f.res.emit('data', Buffer.alloc(PLATFORM_TOOLS_CANDIDATE.archive.bytes + 1));
    f.res.emit('end');
    await tick();
    assert.equal(done, false);
    f.close();
    await observed;
  }
});
test('abort is not retirement and no retry is made', async () => {
  const f = fake(),
    abort = new AbortController();
  let calls = 0;
  const p = createPlatformToolsDownload((...args) => {
    calls++;
    return f.transport(...args);
  })(abort.signal);
  let done = false;
  const observed = p.catch((e) => {
    done = true;
    assert.equal(e.message, 'DOWNLOAD_FAILED');
  });
  f.respond();
  abort.abort();
  await tick();
  assert.equal(done, false);
  f.close();
  await observed;
  assert.equal(calls, 1);
});
test('fragmented and empty chunks use a single byte-bounded payload and still require close', async () => {
  const f = fake();
  let done = false;
  const p = createPlatformToolsDownload(f.transport)(new AbortController().signal).then((x) => {
    done = true;
    return x;
  });
  f.respond();
  for (let i = 0; i < 1000; i++) f.res.emit('data', Buffer.alloc(0));
  let remaining = PLATFORM_TOOLS_CANDIDATE.archive.bytes;
  while (remaining) {
    const n = Math.min(4093, remaining);
    f.res.emit('data', Buffer.alloc(n, 7));
    remaining -= n;
  }
  f.res.emit('end');
  await tick();
  assert.equal(done, false);
  f.close();
  const bytes = await p;
  assert.equal(bytes.length, PLATFORM_TOOLS_CANDIDATE.archive.bytes);
  assert.ok(bytes.every((x) => x === 7));
});

test('pre-aborted request performs zero transport calls', async () => {
  let calls = 0;
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    createPlatformToolsDownload(() => {
      calls++;
      throw Error('should not run');
    })(abort.signal),
    { message: 'DOWNLOAD_FAILED' },
  );
  assert.equal(calls, 0);
});

test('download uses only transformed build-owned install target URL and exact byte cap', async () => {
  const target = {
    ...PLATFORM_TOOLS_CANDIDATE,
    release: '36.0.0',
    archive: {
      url: 'https://dl.google.com/android/repository/platform-tools_r36.0.0-win.zip',
      bytes: 17,
      sha256: 'b'.repeat(64),
    },
  };
  const data = (source) =>
    'data:text/javascript;base64,' +
    Buffer.from(
      transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022' }).code,
    ).toString('base64');
  let catalog = readFileSync(
    new URL('../src/main/platform-tools-catalog.ts', import.meta.url),
    'utf8',
  );
  catalog = catalog.replace(
    "'./platform-tools-candidate.ts'",
    JSON.stringify(data('export const PLATFORM_TOOLS_CANDIDATE = ' + JSON.stringify(target) + ';')),
  );
  const source = readFileSync(
    new URL('../src/main/platform-tools-download.ts', import.meta.url),
    'utf8',
  ).replace("'./platform-tools-catalog.ts'", JSON.stringify(data(catalog)));
  const create = (await import(data(source))).createPlatformToolsDownload;
  const f = fake();
  f.res.headers['content-length'] = '17';
  const pending = create(f.transport)(new AbortController().signal);
  assert.equal(f.options.hostname, 'dl.google.com');
  assert.equal(f.options.path, '/android/repository/platform-tools_r36.0.0-win.zip');
  assert.equal(f.options.method, 'GET');
  f.respond();
  f.res.emit('data', Buffer.alloc(17));
  f.res.emit('end');
  f.close();
  assert.equal((await pending).length, 17);
});
