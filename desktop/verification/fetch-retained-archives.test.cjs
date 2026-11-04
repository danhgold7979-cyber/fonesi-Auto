'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm'),
  { EventEmitter } = require('node:events'),
  { createHash } = require('node:crypto');
const api = require('./fetch-retained-archives.cjs'),
  file = path.join(__dirname, 'fetch-retained-archives.cjs'),
  raw = fs.readFileSync(file, 'utf8'),
  payload = Buffer.from('abc'),
  hash = createHash('sha256').update(payload).digest('hex');
function fixture() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'fixed-fetch-')),
  );
  return { root, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function synthetic() {
  const pins = api.PINS.map((p) => ({ ...p, bytes: 3, sha256: hash })),
    start = raw.indexOf('const PINS ='),
    end = raw.indexOf('function fail()');
  assert.ok(start >= 0 && end > start);
  const source =
      raw.slice(0, start) +
      'const PINS = Object.freeze(' +
      JSON.stringify(pins) +
      '.map(Object.freeze));\n' +
      raw.slice(end),
    module = { exports: {} };
  vm.runInNewContext(
    source,
    { require, module, Buffer, setTimeout, clearTimeout, console },
    { filename: file },
  );
  return module.exports;
}
function transport(fault = null, root = null) {
  const calls = [],
    held = [];
  return {
    calls,
    held,
    request(options, callback) {
      calls.push(options);
      const req = new EventEmitter();
      let incoming,
        closed = false;
      function close() {
        if (closed) return;
        closed = true;
        req.emit('close');
      }
      req.destroy = () =>
        queueMicrotask(() => {
          incoming?.destroy();
          close();
        });
      req.end = () =>
        queueMicrotask(() => {
          if (fault === 'error') {
            req.emit('error', Error('PRIVATE'));
            return;
          }
          incoming = new EventEmitter();
          let responseClosed = false;
          incoming.destroy = () => {
            if (!responseClosed) {
              responseClosed = true;
              incoming.emit('close');
            }
          };
          incoming.statusCode = fault === 'redirect' ? 302 : 200;
          incoming.headers = { 'content-length': '3' };
          callback(incoming);
          if (fault === 'owner') {
            fs.writeFileSync(path.join(root, '.platform-tools-input/.owner'), 'x'.repeat(36));
          }
          if (responseClosed) return;
          incoming.emit(
            'data',
            fault === 'overflow'
              ? Buffer.from('abcd')
              : fault === 'hash'
                ? Buffer.from('abd')
                : payload,
          );
          if (responseClosed) return;
          incoming.emit('end');
          incoming.destroy();
          if (fault === 'held') held.push(close);
          else close();
        });
      return req;
    },
  };
}
test('production fixed pins are exact reviewed Google inputs and never renderer URLs', () => {
  assert.deepEqual(
    api.PINS.map((p) => [p.name, p.bytes, p.sha256]),
    [
      [
        'platform-tools_r36.0.0-win.zip',
        7138784,
        '12c2841f354e92a0eb2fd7bf6f0f9bf8538abce7bd6b060ac8349d6f6a61107c',
      ],
      [
        'platform-tools_r37.0.1-win.zip',
        8044989,
        '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99',
      ],
    ],
  );
});
test('actual downloader synthetic bytes use two exact GETs and exclusive owned files', async () => {
  const f = fixture();
  try {
    const t = transport(),
      root = await synthetic().fetchArchives(f.root, t);
    assert.equal(t.calls.length, 2);
    for (const [i, c] of t.calls.entries()) {
      assert.equal(c.hostname, 'dl.google.com');
      assert.equal(c.path, '/android/repository/' + api.PINS[i].name);
      assert.equal(c.method, 'GET');
      assert.equal(c.agent, false);
      assert.deepEqual(fs.readFileSync(path.join(root, api.PINS[i].name)), payload);
    }
    await assert.rejects(synthetic().fetchArchives(f.root, t));
    assert.equal(t.calls.length, 2);
  } finally {
    f.close();
  }
});
for (const fault of ['redirect', 'overflow', 'hash', 'error', 'owner'])
  test(`actual downloader refuses ${fault} without a second GET or raw exception`, async () => {
    const f = fixture();
    try {
      const t = transport(fault, f.root);
      await assert.rejects(
        synthetic().fetchArchives(f.root, t),
        /RETAINED_ARCHIVE_DOWNLOAD_REJECTED/,
      );
      assert.equal(t.calls.length, 1);
      assert.ok(fs.existsSync(path.join(f.root, '.platform-tools-input')));
    } finally {
      f.close();
    }
  });
test('download completion waits for actual request close, not only response end', async () => {
  const f = fixture();
  try {
    const t = transport('held');
    let done = false;
    const task = synthetic()
      .fetchArchives(f.root, t)
      .then(() => (done = true));
    await new Promise(setImmediate);
    assert.equal(done, false);
    assert.equal(t.calls.length, 1);
    t.held.shift()();
    await new Promise(setImmediate);
    assert.equal(done, false);
    assert.equal(t.calls.length, 2);
    t.held.shift()();
    await task;
    assert.equal(done, true);
  } finally {
    f.close();
  }
});
