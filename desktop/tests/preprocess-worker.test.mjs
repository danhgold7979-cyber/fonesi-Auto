// Real cv2 supplied-image positives; explicitly synthetic child faults below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  appendFileSync,
  rmSync,
  readSync,
  mkdirSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { transformSync } from 'esbuild';
import { createSuppliedPreprocessor } from '../src/main/preprocess-worker.ts';
import { validateCapturePng, decodePreprocessPng } from '../src/main/capture-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function display(w = 2, h = 2) {
  return {
    version: 1,
    evidenceId: id(1),
    deviceId: id(2),
    bindingId: id(3),
    generation: 1,
    serial: 'synthetic',
    displayId: 0,
    width: w,
    height: h,
    rotation: 0,
    orientationEpoch: 1,
    observedUtc: Date.now() - 1,
    validUntilUtc: Date.now() + 60000,
    source: 'SYNTHETIC_TEST',
  };
}
const ctx = (d) => ({ version: 1, revision: 1, connected: true, display: d });
function chunk(name, b) {
  const n = Buffer.from(name),
    o = Buffer.alloc(b.length + 12);
  o.writeUInt32BE(b.length);
  n.copy(o, 4);
  b.copy(o, 8);
  let c = 0xffffffff;
  for (const v of Buffer.concat([n, b])) {
    c ^= v;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  o.writeUInt32BE((c ^ 0xffffffff) >>> 0, o.length - 4);
  return o;
}
function png(w = 2, h = 2, rgb = true, values = [2, 204, 255]) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = rgb ? 2 : 6;
  const a = [];
  for (let y = 0; y < h; y++) {
    a.push(0);
    for (let x = 0; x < w; x++) a.push(...(rgb ? values : [...values, 255]));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(Buffer.from(a))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const request = (d, extras = {}) => ({
  version: 1,
  png: png(d.width, d.height),
  display: d,
  roi: { x: 0, y: 0, width: d.width, height: d.height },
  scale: 'ONE',
  contrast: 'IDENTITY',
  ...extras,
});
const turn = () => new Promise((r) => setImmediate(r));
function begin(owner, r) {
  const b = owner.begin(r);
  assert.equal(b.accepted, true);
  return b.operation;
}
test('actual PNG RGB → real isolated cv2 gain → verified RGBA with distinct hashes and retired child', async () => {
  const d = display(),
    owner = createSuppliedPreprocessor(ctx(d));
  const input = request(d, { contrast: 'GAIN_125' }),
    copy = Buffer.from(input.png);
  const result = await begin(owner, input).result;
  assert.equal(result.code, 'OK');
  assert.equal(result.retired, true);
  assert.deepEqual([...result.rgba.slice(0, 4)], [3, 255, 255, 255]);
  assert.deepEqual(result.statistics, { minIntensity: 3, maxIntensity: 255, clippedChannels: 4 });
  assert.notEqual(result.sourcePixelSha256, result.inputSha256);
  assert.equal(result.sourcePixelSha256, validateCapturePng(input.png, d).pixelSha256);
  assert.equal(result.mapping.contextRevision, 1);
  assert.deepEqual(input.png, copy);
  assert.equal(await owner.close(), true);
});
test('actual HALF/DOUBLE ROI mapping and opaque RGBA source equality', async () => {
  for (const scale of ['HALF', 'DOUBLE']) {
    const d = display(),
      o = createSuppliedPreprocessor(ctx(d));
    const r = await begin(o, request(d, { scale, png: png(2, 2, false) })).result;
    assert.equal(r.code, 'OK');
    assert.equal(r.rgba.length, scale === 'HALF' ? 4 : 64);
    assert.equal(r.sourcePixelSha256, r.inputSha256);
    assert.equal(r.mapping.denominator, scale === 'HALF' ? 2 : 1);
    assert.equal(await o.close(), true);
  }
});
test('synchronous reservation and cancel before request proxy traps', async () => {
  const d = display(),
    o = createSuppliedPreprocessor(ctx(d));
  let traps = 0;
  const op = begin(
    o,
    new Proxy(
      {},
      {
        ownKeys() {
          traps++;
          return [];
        },
      },
    ),
  );
  assert.equal(o.begin(request(d)).code, 'BUSY');
  op.cancel();
  assert.equal((await op.result).code, 'CANCELLED');
  await turn();
  assert.equal(traps, 0);
  assert.equal(await o.close(), true);
});
test('proxy cancellation and nested begin cannot overwrite terminal or spawn', async () => {
  const d = display(),
    o = createSuppliedPreprocessor(ctx(d));
  let op, nested;
  const raw = request(d);
  op = begin(
    o,
    new Proxy(raw, {
      ownKeys(t) {
        nested = o.begin(raw);
        op.cancel();
        return Reflect.ownKeys(t);
      },
    }),
  );
  assert.equal((await op.result).code, 'CANCELLED');
  assert.equal(nested.code, 'BUSY');
  assert.equal(await o.close(), true);
});
test('context replacement trap is generation fenced; revocation permanent', async () => {
  const d = display(),
    o = createSuppliedPreprocessor(ctx(d));
  const op = begin(o, request(d));
  o.replaceContext(
    new Proxy(ctx(d), {
      ownKeys(t) {
        o.revoke();
        return Reflect.ownKeys(t);
      },
    }),
  );
  assert.equal((await op.result).code, 'CONTEXT_CHANGED');
  assert.equal(o.begin(request(d)).code, 'CONTEXT_CHANGED');
  assert.equal(await o.close(), true);
});
test('pre-inflate preprocessing IHDR cap preserves original capture validation limits', () => {
  const d = display(4097, 1),
    bytes = png(4097, 1);
  assert.equal(validateCapturePng(bytes, d).ok, true);
  assert.equal(decodePreprocessPng(bytes, d).code, 'CAPTURE_LIMIT');
});
test('local invalid ROI/scale/alpha and stale context refuse without processing', async () => {
  const d = display();
  for (const x of [
    { roi: { x: 2, y: 0, width: 1, height: 1 } },
    { scale: 'HALF', roi: { x: 0, y: 0, width: 1, height: 1 } },
    { png: Buffer.from([1, 2]) },
  ]) {
    const o = createSuppliedPreprocessor(ctx(d));
    assert.notEqual((await begin(o, request(d, x)).result).code, 'OK');
    assert.equal(await o.close(), true);
  }
  const stale = { ...d, validUntilUtc: Date.now() - 1, observedUtc: Date.now() - 10 };
  const o = createSuppliedPreprocessor(ctx(stale));
  assert.equal((await begin(o, request(stale)).result).code, 'CONTEXT_CHANGED');
  await o.close();
});
function syntheticFactory(options = {}) {
  const path = new URL('../src/main/preprocess-worker.ts', import.meta.url);
  let source = readFileSync(path, 'utf8');
  assert.match(source, /if\s*\(!runtimeAdmitted\(\)\)/);
  source = source
    .replace(
      /if\s*\(!runtimeAdmitted\(\)\)/,
      'if(false /* synthetic admitted runtime, no vendor process */)',
    )
    .replace('WORK_MS = 10000', 'WORK_MS = 40')
    .replace('DRAIN_MS = 5000', 'DRAIN_MS = 30');
  source =
    source.replaceAll('Date.now()', 'testNow()').replaceAll('performance.now()', 'testMono()') +
    '\nexport const __testStableRead = stableRead;';
  const calls = [];
  const require = createRequire(path);
  const mod = { exports: {} };
  const js = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  new Function('require', 'module', 'exports', 'testNow', 'testMono', js)(
    (n) =>
      n === 'node:child_process'
        ? {
            spawn() {
              const c = new EventEmitter();
              c.stdout = new EventEmitter();
              c.stderr = new EventEmitter();
              c.stdin = new EventEmitter();
              c.stdin.writableEnded = false;
              c.stdin.writableLength = 0;
              c.stdin.destroyed = false;
              c.stdin.destroy = () => {
                c.stdin.destroyed = true;
              };
              c.stdin.end = (bytes, cb) => {
                if (options.throwBeforeWrite) throw new Error('synthetic before handoff');
                c.stdin.writableEnded = true;
                c.stdin.writableLength = bytes.length;
                c.bytes = bytes;
                c.writeDone = cb;
                if (options.throwAfterWrite) throw new Error('synthetic queued handoff');
              };
              c.kill = () => {
                c.killed = true;
                return true;
              };
              calls.push(c);
              return c;
            },
          }
        : n === 'node:fs' && options.fs
          ? { ...require(n), ...options.fs }
          : require(n),
    mod,
    mod.exports,
    options.now ?? Date.now,
    options.monotonic ?? (() => performance.now()),
  );
  return {
    create: mod.exports.createSuppliedPreprocessor,
    stableRead: mod.exports.__testStableRead,
    calls,
  };
}
test('synthetic cancel keeps slot until actual child/EOF/write settlement', async () => {
  const f = syntheticFactory(),
    d = display(),
    o = f.create(ctx(d));
  const op = begin(o, request(d));
  await turn();
  const c = f.calls[0];
  assert.ok(c);
  op.cancel();
  assert.equal((await op.result).code, 'CANCELLED');
  assert.equal(c.killed, true);
  c.emit('close', null);
  assert.equal(o.begin(request(d)).code, 'BUSY');
  c.stdout.emit('end');
  c.stderr.emit('end');
  assert.equal(o.begin(request(d)).code, 'BUSY');
  c.writeDone();
  assert.equal(await o.close(), true);
});
test('synthetic timeout/undrained latch prevents replacement even after cleanup timeout', async () => {
  const f = syntheticFactory(),
    d = display(),
    o = f.create(ctx(d));
  const op = begin(o, request(d));
  assert.equal((await op.result).code, 'DEADLINE_EXCEEDED');
  assert.equal(await o.close(), false);
  assert.equal(o.begin(request(d)).code, 'BUSY');
  const c = f.calls[0];
  c.writeDone();
  c.stdout.emit('close');
  c.stderr.emit('close');
  c.emit('close', null);
  assert.equal(await o.close(), true);
});
test('synthetic malformed reply with actual close is refused and retired', async () => {
  const f = syntheticFactory(),
    d = display(),
    o = f.create(ctx(d));
  const op = begin(o, request(d));
  await turn();
  const c = f.calls[0];
  c.stdout.emit('data', Buffer.from([1, 2]));
  c.writeDone();
  c.stdout.emit('end');
  c.stderr.emit('end');
  c.emit('close', 0);
  const r = await op.result;
  assert.equal(r.code, 'MALFORMED_REPLY');
  assert.equal(r.retired, true);
  assert.equal(await o.close(), true);
});

test('actual registered Python child cancel drains before owner close resolves', async () => {
  const d = display(),
    owner = createSuppliedPreprocessor(ctx(d));
  const op = begin(owner, request(d));
  setTimeout(() => op.cancel(), 1);
  const r = await op.result;
  assert.equal(r.code, 'CANCELLED');
  assert.equal(r.retired, false);
  assert.equal(await owner.close(), true);
});

test('synthetic post-handoff context loss and late output cannot publish or release without writes', async () => {
  const f = syntheticFactory(),
    d = display(),
    o = f.create(ctx(d));
  const op = begin(o, request(d));
  await turn();
  const c = f.calls[0];
  o.replaceContext({ ...ctx(d), revision: 2 });
  assert.equal((await op.result).code, 'CONTEXT_CHANGED');
  c.stdout.emit('data', Buffer.alloc(32));
  c.stdout.emit('end');
  c.stderr.emit('end');
  c.emit('close', 0);
  assert.equal(o.begin(request(d)).code, 'BUSY');
  c.writeDone();
  assert.equal(await o.close(), true);
});

test('synthetic stderr and output cap are bounded failures with retained cleanup', async () => {
  for (const kind of ['stderr', 'limit']) {
    const f = syntheticFactory(),
      d = display(),
      o = f.create(ctx(d));
    const op = begin(o, request(d));
    await turn();
    const c = f.calls[0];
    if (kind === 'stderr') c.stderr.emit('data', Buffer.from('private diagnostic never surfaced'));
    else c.stdout.emit('data', Buffer.alloc(16 * 1024 * 1024 + 4101));
    const r = await op.result;
    assert.equal(r.code, kind === 'stderr' ? 'WORKER_FAILED' : 'MALFORMED_REPLY');
    assert.equal(r.rgba, null);
    assert.equal(r.retired, false);
    c.writeDone();
    c.stdout.emit('close');
    c.stderr.emit('close');
    c.emit('close', null);
    assert.equal(await o.close(), true);
  }
});

test('bounded stable read refuses growth with at most captured length plus one byte read', () => {
  const root = mkdtempSync('/tmp/p4-stable-read-'),
    path = `${root}/input`;
  writeFileSync(path, Buffer.from('abc'));
  let changed = false,
    total = 0;
  const f = syntheticFactory({
    fs: {
      readSync(fd, b, o, n, pos) {
        if (!changed) {
          changed = true;
          appendFileSync(path, Buffer.alloc(10000));
        }
        total += n;
        return readSync(fd, b, o, n, pos);
      },
    },
  });
  try {
    assert.throws(() => f.stableRead(path, 4), /WORKER_UNAVAILABLE/);
    assert.equal(total, 4);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('stdin synchronous no-handoff throw does not leave phantom write; queued throw stays registered', async () => {
  for (const queued of [false, true]) {
    const f = syntheticFactory(queued ? { throwAfterWrite: true } : { throwBeforeWrite: true }),
      d = display(),
      o = f.create(ctx(d));
    const op = begin(o, request(d));
    await turn();
    const c = f.calls[0];
    assert.equal((await op.result).code, 'WORKER_FAILED');
    c.stdout.emit('end');
    c.stderr.emit('end');
    c.emit('close', 1);
    if (queued) {
      assert.equal(o.begin(request(d)).code, 'BUSY');
      c.writeDone();
      c.writeDone();
    }
    assert.equal(await o.close(), true);
  }
});

test('deadline after cwd creation refuses before spawn', async () => {
  let clock = 0,
    count = 0;
  const f = syntheticFactory({
      monotonic: () => clock,
      fs: {
        mkdirSync(path) {
          mkdirSync(path);
          if (++count === 2) clock = 100;
        },
      },
    }),
    d = display(),
    o = f.create(ctx(d));
  const r = await begin(o, request(d)).result;
  assert.equal(r.code, 'DEADLINE_EXCEEDED');
  assert.equal(f.calls.length, 0);
  assert.equal(r.retired, true);
  assert.equal(await o.close(), true);
});

function syntheticIdentityReply(c) {
  const n = c.bytes.readUInt32LE(),
    h = JSON.parse(c.bytes.subarray(4, n + 4).toString()),
    pixels = c.bytes.subarray(n + 4);
  const r = {
    version: 1,
    kind: 'PREPROCESS_RESULT',
    requestId: h.requestId,
    captureId: h.captureId,
    deviceId: h.deviceId,
    bindingId: h.bindingId,
    generation: h.generation,
    orientationEpoch: h.orientationEpoch,
    pipelineId: h.pipelineId,
    status: 'PROCESSED',
    code: 'OK',
    sourcePixelSha256: h.sourcePixelSha256,
    inputSha256: h.inputSha256,
    outputWidth: h.inputWidth,
    outputHeight: h.inputHeight,
    outputBytes: pixels.length,
    outputSha256: createHash('sha256').update(pixels).digest('hex'),
    mapping: {
      originalWidth: h.inputWidth,
      originalHeight: h.inputHeight,
      roi: h.roi,
      numerator: 1,
      denominator: 1,
    },
    minIntensity: 2,
    maxIntensity: 255,
    clippedChannels: 0,
  };
  const b = Buffer.from(JSON.stringify(r)),
    prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(b.length);
  return Buffer.concat([prefix, b, pixels]);
}
test('backward final UTC below observed capture refuses otherwise valid retired response', async () => {
  const d = display();
  let now = d.observedUtc + 1;
  const f = syntheticFactory({ now: () => now }),
    o = f.create(ctx(d));
  const op = begin(o, request(d));
  await turn();
  const c = f.calls[0];
  c.stdout.emit('data', syntheticIdentityReply(c));
  c.writeDone();
  c.stdout.emit('end');
  c.stderr.emit('end');
  now = d.observedUtc - 1;
  c.emit('close', 0);
  const r = await op.result;
  assert.equal(r.code, 'CONTEXT_CHANGED');
  assert.equal(r.rgba, null);
  assert.equal(r.retired, true);
  assert.equal(await o.close(), true);
});
