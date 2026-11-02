// Default: source/synthetic owner tests plus a fixed stdlib Python JSON producer.
// Actual OpenCV/OCR composition runs only with the exact explicit opt-in below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { digest } from '../src/main/preprocess-contract.ts';
import { createOcrEvaluator } from '../src/main/ocr-evaluation.ts';
import { validateCapturePng } from '../src/main/capture-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function display() {
  return {
    version: 1,
    evidenceId: id(1),
    deviceId: id(2),
    bindingId: id(3),
    generation: 1,
    serial: 'synthetic',
    displayId: 0,
    width: 2,
    height: 2,
    rotation: 0,
    orientationEpoch: 1,
    observedUtc: Date.now() - 1,
    validUntilUtc: Date.now() + 60000,
    source: 'SYNTHETIC_TEST',
  };
}
const context = (d) => ({ version: 1, revision: 1, connected: true, display: d });
const request = (d, language = 'EN') => ({
  version: 1,
  language,
  preprocess: {
    version: 1,
    png: new Uint8Array([1]),
    display: d,
    roi: { x: 0, y: 0, width: 2, height: 2 },
    scale: 'ONE',
    contrast: 'IDENTITY',
  },
});
const turn = () => new Promise((r) => setImmediate(r));
const begin = (o, r) => {
  const b = o.begin(r);
  assert.equal(b.accepted, true);
  return b.operation;
};
function harness({
  admitted = true,
  preRetired = true,
  heldPre = false,
  heldWrite = false,
  writeThrow = false,
  survivingGroup = false,
  killFailure = false,
  unknownGroup = false,
} = {}) {
  const source = readFileSync(new URL('../src/main/ocr-evaluation.ts', import.meta.url), 'utf8');
  const start = source.indexOf('function runtimeAdmitted(): boolean {'),
    end = source.indexOf('\ntype Header', start);
  assert(start > 0 && end > start);
  const changed =
    source.slice(0, start) +
    `function runtimeAdmitted(): boolean { return ${admitted}; }` +
    source.slice(end);
  const { code } = transformSync(changed.replace('DRAIN_MS = 5000', 'DRAIN_MS = 30'), {
    loader: 'ts',
    format: 'cjs',
    target: 'node24',
  });
  const require = createRequire(new URL('../src/main/ocr-evaluation.ts', import.meta.url));
  let now = 0,
    child = null,
    resolvePre,
    closeCalls = 0,
    preBeginCalls = 0,
    spawnCalls = 0,
    groupPresent = true;
  const groupSignals = [];
  const rgba = Buffer.from([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]);
  const output = {
    status: 'PROCESSED',
    code: 'OK',
    retired: true,
    rgba,
    sourcePixelSha256: 'a'.repeat(64),
    outputSha256: digest(rgba),
    mapping: {
      pipelineId: 'SUPPLIED_OPENCV_PREPROCESS_V1',
      sourcePixelSha256: 'a'.repeat(64),
      inputSha256: 'b'.repeat(64),
      requestId: id(8),
      captureId: id(1),
      deviceId: id(2),
      bindingId: id(3),
      generation: 1,
      orientationEpoch: 1,
      contextRevision: 1,
      originalWidth: 2,
      originalHeight: 2,
      roi: { x: 0, y: 0, width: 2, height: 2 },
      numerator: 1,
      denominator: 1,
    },
  };
  const pre = {
    begin() {
      preBeginCalls++;
      return {
        accepted: true,
        operation: {
          result: heldPre
            ? new Promise((r) => {
                resolvePre = r;
              })
            : Promise.resolve(output),
          cancel() {},
        },
      };
    },
    async close() {
      closeCalls++;
      return preRetired;
    },
    revoke() {},
    replaceContext() {},
  };
  function spawn(_path, _args, options) {
    spawnCalls++;
    child = new EventEmitter();
    child.pid = 424242;
    const emit = child.emit.bind(child);
    child.emit = (name, ...args) => {
      if ((name === 'exit' || name === 'close') && !survivingGroup) groupPresent = false;
      return emit(name, ...args);
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.options = options;
    child.kills = 0;
    child.kill = () => {
      child.kills++;
      return true;
    };
    child.stdin.writableEnded = false;
    child.stdin.writableLength = 0;
    child.stdin.destroyed = false;
    child.stdin.destroy = () => {
      child.stdin.destroyed = true;
    };
    child.stdin.end = (frame, done) => {
      if (writeThrow) {
        throw new Error('synthetic no-handoff');
      }
      child.frame = frame;
      child.header = JSON.parse(frame.subarray(4, 4 + frame.readUInt32LE(0)).toString());
      child.stdin.writableEnded = true;
      child.writeDone = done;
      if (!heldWrite) queueMicrotask(done);
    };
    return child;
  }
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'performance', 'process', code)(
    (name) =>
      name === 'node:child_process'
        ? { spawn }
        : name === 'node:fs'
          ? {
              ...require(name),
              mkdtempSync(prefix) {
                // Synthetic Linux-owner policy tests use an owned platform fixture root.
                // The actual Linux admission/path contract remains unchanged.
                assert.equal(prefix, '/tmp/auto-p4-ocr-job-');
                return realpathSync.native(mkdtempSync(join(tmpdir(), 'auto-p4-ocr-fixture-')));
              },
            }
          : name === './preprocess-worker.ts'
            ? { createSuppliedPreprocessor: () => pre }
            : require(name),
    module,
    module.exports,
    { now: () => now },
    new Proxy(process, {
      get(target, key) {
        if (key !== 'kill') return Reflect.get(target, key);
        return (pid, signal) => {
          assert.equal(pid, -424242);
          groupSignals.push([pid, signal]);
          if (!groupPresent) throw Object.assign(new Error('absent'), { code: 'ESRCH' });
          if (unknownGroup || (killFailure && signal === 'SIGKILL'))
            throw Object.assign(new Error('unknown'), { code: 'EPERM' });
          return true;
        };
      },
    }),
  );
  const endChild = () => {
    child.stdout.emit('end');
    child.stderr.emit('end');
    child.emit('close', 0);
  };
  const respond = (change = {}, encode = (value) => Buffer.from(JSON.stringify(value))) => {
    const h = child.header;
    const r = {
      version: 1,
      kind: 'OCR_EVALUATION_RESULT',
      scope: 'EVALUATION_ONLY',
      capability: 'UNQUALIFIED',
    };
    for (const k of [
      'requestId',
      'captureId',
      'deviceId',
      'bindingId',
      'generation',
      'orientationEpoch',
      'language',
      'sourcePixelSha256',
      'inputSha256',
    ])
      r[k] = h[k];
    Object.assign(
      r,
      {
        status: 'TEXT',
        code: 'OK',
        model: 'en_PP-OCRv5_mobile_rec',
        modelSha256: 'e595b4cf2ffad19fbb5a61ba345d63939577a3ab8717b6e5995642590c9101b4',
        text: 'Synthetic',
        rawScore: 0.8,
        modelLatencyMs: 1,
        peakRssBytes: 1024,
      },
      change,
    );
    const raw = encode(r),
      frame = Buffer.alloc(4 + raw.length);
    frame.writeUInt32LE(raw.length);
    raw.copy(frame, 4);
    child.stdout.emit('data', frame);
  };
  return {
    create: module.exports.createOcrEvaluator,
    get child() {
      return child;
    },
    get counts() {
      return { closeCalls, preBeginCalls, spawnCalls };
    },
    output,
    groupSignals,
    absentGroup() {
      groupPresent = false;
      unknownGroup = false;
    },
    respond,
    endChild,
    advance(v) {
      now = v;
    },
    releasePre() {
      resolvePre(output);
    },
    retirePre() {
      preRetired = true;
    },
  };
}
test('VI unavailable preserves mandatory language gate without touching preprocessing request', async () => {
  const o = createOcrEvaluator(context(display()));
  let touched = 0;
  const op = begin(o, {
    version: 1,
    language: 'VI',
    preprocess: new Proxy(
      {},
      {
        ownKeys() {
          touched++;
          return [];
        },
      },
    ),
  });
  const r = await op.result;
  assert.equal(r.code, 'VI_CHARACTER_REPERTOIRE_UNSUPPORTED');
  assert.equal(r.retired, true);
  assert.equal(r.capability, 'UNQUALIFIED');
  assert.equal(r.model, null);
  assert.equal(touched, 0);
  assert.equal(await o.close(), true);
});
test('synchronous reservation precedes request proxy traps and pre-start cancel touches none', async () => {
  const o = createOcrEvaluator(context(display()));
  let touched = 0;
  const op = begin(
    o,
    new Proxy(
      {},
      {
        ownKeys() {
          touched++;
          return [];
        },
      },
    ),
  );
  assert.equal(o.begin({}).code, 'BUSY');
  op.cancel();
  assert.equal((await op.result).code, 'CANCELLED');
  await turn();
  assert.equal(touched, 0);
  assert.equal(await o.close(), true);
});
test('getter requests and unknown languages refuse without execution', async () => {
  for (const input of [
    {
      get version() {
        throw new Error('getter');
      },
      language: 'EN',
      preprocess: {},
    },
    { version: 1, language: 'xx', preprocess: {} },
    { version: 1, language: 'EN', preprocess: {} },
  ]) {
    const h = harness(),
      o = h.create(context(display()));
    assert.equal((await begin(o, input).result).code, 'INVALID_INPUT');
    assert.deepEqual(h.counts, { closeCalls: 0, preBeginCalls: 0, spawnCalls: 0 });
    await o.close();
  }
});
test('unadmitted exact runtime fails before preprocessor and spawn', async () => {
  const h = harness({ admitted: false }),
    d = display(),
    o = h.create(context(d));
  assert.equal((await begin(o, request(d)).result).code, 'WORKER_UNAVAILABLE');
  assert.equal(h.counts.preBeginCalls, 0);
  assert.equal(h.counts.spawnCalls, 0);
  await o.close();
});
test('synthetic composition binds actual predecessor bytes and retains output until child EOF/close', async () => {
  const h = harness(),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  assert.equal(h.counts.preBeginCalls, 1);
  assert.equal(h.counts.closeCalls, 1);
  assert.equal(h.child.header.inputSha256, digest(h.output.rgba));
  assert.equal(h.child.header.sourcePixelSha256, h.output.sourcePixelSha256);
  assert.deepEqual(h.child.frame.subarray(4 + h.child.frame.readUInt32LE(0)), h.output.rgba);
  assert.equal(h.child.options.env.HF_HUB_OFFLINE, '1');
  assert.equal(h.child.options.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK, 'True');
  assert.equal(h.child.options.env.PATH, '/usr/bin:/bin');
  assert.equal(h.child.options.detached, true);
  h.respond();
  h.child.emit('close', 0);
  assert.equal(o.begin({}).code, 'BUSY');
  h.child.stdout.emit('end');
  assert.equal(o.begin({}).code, 'BUSY');
  h.child.stderr.emit('end');
  const r = await op.result;
  assert.equal(r.status, 'TEXT');
  assert.equal(r.retired, true);
  assert.equal(r.mapping.contextRevision, 1);
  assert.equal(r.scope, 'EVALUATION_ONLY');
  assert.equal(await o.close(), true);
});
test('synthetic write settlement remains required after output and child retirement', async () => {
  const h = harness({ heldWrite: true }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  h.respond();
  h.endChild();
  assert.equal(o.begin({}).code, 'BUSY');
  h.child.writeDone();
  assert.equal((await op.result).status, 'TEXT');
  await o.close();
});
test('cancelled predecessor retains owner until explicit observed actual retirement', async () => {
  const h = harness({ heldPre: true, preRetired: false }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  op.cancel();
  assert.equal((await op.result).retired, false);
  await turn();
  assert.equal(o.begin({}).code, 'BUSY');
  h.releasePre();
  await turn();
  assert.equal(h.counts.spawnCalls, 0);
  h.retirePre();
  assert.equal(await o.close(), true);
});
test('synthetic late OCR text after cancellation cannot restore result or free held write', async () => {
  const h = harness({ heldWrite: true }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  op.cancel();
  const r = await op.result;
  assert.equal(r.code, 'CANCELLED');
  assert.equal(r.retired, false);
  h.respond();
  h.endChild();
  assert.equal(o.begin({}).code, 'BUSY');
  h.child.writeDone();
  assert.equal(await o.close(), true);
  assert.equal((await op.result).text, null);
});
test('final original monotonic deadline and UTC capture freshness fence delivery', async () => {
  for (const mode of ['monotonic', 'utc']) {
    const h = harness(),
      d = display(),
      o = h.create(context(d)),
      op = begin(o, request(d));
    await turn();
    h.respond();
    if (mode === 'monotonic') h.advance(30001);
    else {
      const original = Date.now;
      Date.now = () => d.validUntilUtc + 1;
      try {
        h.endChild();
      } finally {
        Date.now = original;
      }
    }
    if (mode === 'monotonic') h.endChild();
    const r = await op.result;
    assert.equal(r.status, 'UNAVAILABLE');
    assert.equal(r.text, null);
    await o.close();
  }
});
test('correlation, extra fields, overlong text and nonfinite score are never trusted', async () => {
  for (const patch of [
    { requestId: id(99) },
    { extra: true },
    { text: 'x'.repeat(4097) },
    { text: '\ud800' },
    { rawScore: 2 },
    { rawScore: null },
    { model: 'other' },
  ]) {
    const h = harness(),
      d = display(),
      o = h.create(context(d)),
      op = begin(o, request(d));
    await turn();
    h.respond(patch);
    h.endChild();
    assert.equal((await op.result).code, 'MALFORMED_REPLY');
    await o.close();
  }
});
test('oversized stdout and stderr cancel without releasing live child', async () => {
  for (const name of ['stdout', 'stderr']) {
    const h = harness(),
      d = display(),
      o = h.create(context(d)),
      op = begin(o, request(d));
    await turn();
    h.child[name].emit('data', Buffer.alloc(name === 'stdout' ? 16385 : 4097));
    assert.equal((await op.result).retired, false);
    assert.equal(o.begin({}).code, 'BUSY');
    h.endChild();
    await o.close();
  }
});
test('pre-spawn stale context cancels pending predecessor and refuses replacement result', async () => {
  const h = harness({ heldPre: true }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  o.replaceContext({ ...context(d), revision: 2 });
  assert.equal((await op.result).code, 'CONTEXT_CHANGED');
  h.releasePre();
  await turn();
  assert.equal(h.counts.spawnCalls, 0);
  await o.close();
});
test('synthetic synchronous no-handoff write throw does not leave phantom write', async () => {
  const h = harness({ writeThrow: true }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  assert.equal((await op.result).code, 'WORKER_FAILED');
  h.endChild();
  assert.equal(await o.close(), true);
});

test('synthetic regressing monotonic clock invalidates result without waiting for timer', async () => {
  const h = harness({ heldPre: true }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  h.advance(-1);
  h.releasePre();
  const r = await op.result;
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.retired, true);
  assert.equal(h.counts.spawnCalls, 0);
  await o.close();
});
test('synthetic invalid derived dimensions, changed pixel hash or alpha refuse before spawn', async () => {
  for (const mode of ['dimension', 'hash', 'alpha']) {
    const h = harness(),
      d = display(),
      o = h.create(context(d));
    if (mode === 'dimension') h.output.mapping.roi.height = 257;
    if (mode === 'hash') h.output.outputSha256 = '0'.repeat(64);
    if (mode === 'alpha') {
      h.output.rgba[3] = 0;
      h.output.outputSha256 = digest(h.output.rgba);
    }
    const r = await begin(o, request(d)).result;
    assert.equal(r.status, 'UNAVAILABLE');
    assert.equal(h.counts.spawnCalls, 0);
    await o.close();
  }
});
test('synthetic stdout close without EOF cannot become successful output', async () => {
  const h = harness(),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  h.respond();
  h.child.stdout.emit('close');
  h.child.stderr.emit('end');
  h.child.emit('close', 0);
  assert.equal((await op.result).code, 'MALFORMED_REPLY');
  await o.close();
});

test('actual Python JSON float endpoints and exponent forms are accepted by typed boundary', async () => {
  const python =
    process.platform === 'win32'
      ? process.env.FOUNDATION_PYTHON_EXE
      : '/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  assert.equal(typeof python, 'string', 'trusted Windows harness must supply admitted CPython');
  assert(isAbsolute(python));
  if (process.platform === 'win32') assert(python.toLowerCase().endsWith('\\python.exe'));
  for (const [score, latency] of [
    [0, 1],
    [1, 1],
    [0.5, 1e-7],
  ]) {
    const h = harness(),
      d = display(),
      o = h.create(context(d)),
      op = begin(o, request(d));
    await turn();
    h.respond({}, (r) => {
      const produced = spawnSync(
        python,
        [
          '-I',
          '-B',
          '-c',
          'import sys,json; r=json.load(sys.stdin);r["rawScore"]=float(sys.argv[1]);r["modelLatencyMs"]=float(sys.argv[2]);print(json.dumps(r,ensure_ascii=False,separators=(",",":")),end="")',
          String(score),
          String(latency),
        ],
        { input: JSON.stringify(r), timeout: 5000, maxBuffer: 16384 },
      );
      assert.equal(produced.status, 0);
      return produced.stdout;
    });
    h.endChild();
    const r = await op.result;
    assert.equal(r.status, 'TEXT');
    assert.equal(r.rawScore, score);
    assert.equal(r.modelLatencyMs, latency);
    assert.equal(await o.close(), true);
  }
});
test('invalid UTF8 and duplicate decoded JSON keys are refused without altered text', async () => {
  for (const encode of [
    (r) =>
      Buffer.from(JSON.stringify(r).replace('Synthetic', '\uffff')).map((b) =>
        b === 0xef ? 0xff : b,
      ),
    (r) => Buffer.from(JSON.stringify(r).replace('"version":1', '"version":1,"version":1')),
    (r) => Buffer.from(JSON.stringify(r).replace('"version":1', '"version":1,"ver\\u0073ion":1')),
  ]) {
    const h = harness(),
      d = display(),
      o = h.create(context(d)),
      op = begin(o, request(d));
    await turn();
    h.respond({}, encode);
    h.endChild();
    assert.equal((await op.result).code, 'MALFORMED_REPLY');
    assert.equal(await o.close(), true);
  }
});
for (const name of ['stdout', 'stderr'])
  test(`synthetic ${name} read error retains child/write until actual drain`, async () => {
    const h = harness({ heldWrite: true }),
      d = display(),
      o = h.create(context(d)),
      op = begin(o, request(d));
    await turn();
    assert.doesNotThrow(() => h.child[name].emit('error', new Error('synthetic read error')));
    assert.equal((await op.result).code, 'WORKER_FAILED');
    assert.equal(o.begin(request(d)).code, 'BUSY');
    h.endChild();
    assert.equal(o.begin(request(d)).code, 'BUSY');
    h.child.writeDone();
    assert.equal(await o.close(), true);
  });

test('synthetic surviving descendant after leader exit is killed and never published as success', async () => {
  const h = harness({ survivingGroup: true }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  h.respond();
  h.child.emit('exit', 0);
  const r = await op.result;
  assert.equal(r.code, 'DESCENDANT_UNRETIRED');
  assert.equal(r.retired, false);
  assert(h.groupSignals.some(([, signal]) => signal === 'SIGKILL'));
  assert.equal(h.child.kills, 0);
  h.endChild();
  assert.equal(o.begin({}).code, 'BUSY');
  h.absentGroup();
  await new Promise((resolve) => setTimeout(resolve, 28));
  assert.equal(await o.close(), true);
  assert.equal((await op.result).text, null);
});
test('synthetic refused group kill cannot release even after Python and streams close', async () => {
  const h = harness({ survivingGroup: true, killFailure: true }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  op.cancel();
  h.endChild();
  assert.equal((await op.result).retired, false);
  assert.equal(o.begin({}).code, 'BUSY');
  assert.equal(await o.close(), false);
  const signals = h.groupSignals.length;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(h.groupSignals.length, signals);
  h.absentGroup();
  assert.equal(await o.close(), true);
});
test('synthetic unknown group status remains registered until explicit absence readback', async () => {
  const h = harness({ survivingGroup: true, unknownGroup: true }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  h.respond();
  h.endChild();
  assert.equal((await op.result).code, 'DESCENDANT_UNRETIRED');
  assert.equal(await o.close(), false);
  h.absentGroup();
  assert.equal(await o.close(), true);
});
test('synthetic observed absence is sticky: never signal reused group while own write remains pending', async () => {
  const h = harness({ heldWrite: true }),
    d = display(),
    o = h.create(context(d)),
    op = begin(o, request(d));
  await turn();
  h.respond();
  h.absentGroup();
  h.child.emit('exit', 0);
  const count = h.groupSignals.length;
  op.cancel();
  h.endChild();
  assert.equal((await op.result).retired, false);
  assert.equal(h.groupSignals.length, count);
  h.child.writeDone();
  assert.equal(await o.close(), true);
  assert.equal(h.groupSignals.length, count);
});

// Local reviewed synthetic fixture; never a device screenshot or held-out corpus.
// Setting another value does not opt in. This test must be separately reviewed
// and authorized before use; normal aggregates do not register this runtime-only proof.
if (process.env.FONESI_P4_OCR_COMPOSED_SMOKE === 'REVIEWED_SYNTHETIC_EN_V1')
  test('opt-in actual supplied PNG → OpenCV → EN worker → attributed smoke metrics', async (t) => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAWQAAABKCAYAAACMyi7SAAADa0lEQVR4nO3UMQ7cMAwEwPv/p5MibVzYMsWlNQNcdyCWkry/PwBE+HUHAOAfhQwQQiEDhFDIACEUMkAIhQwQQiEDhFDIACEUMkAIhQwQQiEDhFDIACEUMkAIhQwQQiEDhFgu5N/v99/fW+7Ov/p/9a/rfO5Ky3Ol+l6+quscuu6r67uuopAVcmRxTf2guilkhayQFfLrpn5Q3RSyQlbICvl1Uz+obgpZIStkhfy6qR9UN4WskBWyQn7d1A+qm0JWyCMKuYs8vXnS9n1LV7FMn5+eRyEXk6c3T9q+b1HIeyjkxfmnX6g8e+d3Uch7KOTF+adfqDx753dRyHso5MX5p1+oPHvnd1HIeyjkxfmnX6g8e+d3Uch7KOTF+adfqDx756eZvm9afoW8OP/0C5Vn7/w00/dNy6+QF+effqHy7J2fZvq+afkV8uL80y9Unr3z00zfNy2/Ql6cf/qFyrN3fprp+6blV8iL80+/UHn2zk8zfd+0/J8p5OpfV563zqfLaXnS9q02Zd+ue6/+3pdzLw9QyI/Op8tpedL2rTZlX4V8kXt5gEJ+dD5dTsuTtm+1Kfsq5IvcywMU8qPz6XJanrR9q03ZVyFf5F4eoJAfnU+X0/Kk7Vttyr4K+SL38gCF/Oh8upyWJ23falP2VcgXuZcHhH1QKQcrT0aetH2rpe2blueu3fkVcjF5evOk7Vstbd+0PHcp5MX5aQ9Ant48aftWS9s3Lc9dCnlxftoDkKc3T9q+1dL2Tctzl0JenJ/2AOTpzZO2b7W0fdPy3KWQF+enPQB5evOk7Vstbd+0PHcp5MX5aQ9Ant48aftW69r3q+eskBfnpz0MeXrzpO1bTSG/SyEvzk97GPL05knbt5pCfpdCXpyf9jDk6c2Ttm81hfwuhbw4P+1hyNObJ23fagr5XQp5cX7aw5CnN0/avtUU8rsU8uL8q/9X/+R5lqc651dNv5cp73k3hTz8wUzPU53zq6bfy5T3vJtCHv5gpuepzvlV0+9lynveTSEPfzDT81Tn/Krp9zLlPe+mkIc/mOl5qnN+1fR7mfKed1PIwx/M9DzVOb9q+r1Mec+7fffFAgyjkAFCKGSAEAoZIIRCBgihkAFCKGSAEAoZIIRCBgihkAFCKGSAEAoZIIRCBgihkAFCKGSAEAoZIMRf/SAI5tZPH4oAAAAASUVORK5CYII=',
      'base64',
    );
    assert.equal(digest(png), 'cd11a692aa4cbbcbff4e676b857ba522df64a856a8d294655a74a6e8b610cdf1');
    const manifestBytes = readFileSync(
      new URL('../vision/ocr_evaluation_manifest.json', import.meta.url),
    );
    assert.equal(
      digest(manifestBytes),
      '146a80a4bf1892b2f24b9e8a723f0ca2a813217681f1392d849f343692506dd4',
    );
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const d = { ...display(), width: 356, height: 74 };
    const original = validateCapturePng(png, d);
    assert.equal(original.ok, true);
    assert.equal(
      original.pixelSha256,
      '3de7adff61496431151de23be70a07fd545988d1bfc14df54ee1701893acef00',
    );
    const owner = createOcrEvaluator(context(d));
    assert(owner);
    try {
      const supplied = {
        version: 1,
        language: 'EN',
        preprocess: {
          version: 1,
          png,
          display: d,
          roi: { x: 0, y: 0, width: 356, height: 74 },
          scale: 'ONE',
          contrast: 'IDENTITY',
        },
      };
      const operation = begin(owner, supplied);
      const r = await operation.result;
      t.diagnostic(JSON.stringify({ status: r.status, code: r.code, retired: r.retired }));
      assert.equal(r.status, 'TEXT');
      assert.equal(r.code, 'OK');
      assert.equal(r.retired, true);
      assert.equal(r.requestId, operation.requestId);
      assert.equal(r.scope, 'EVALUATION_ONLY');
      assert.equal(r.capability, 'UNQUALIFIED');
      assert.equal(r.language, 'EN');
      assert.equal(r.sourcePixelSha256, original.pixelSha256);
      assert.equal(
        r.inputSha256,
        original.pixelSha256,
        'identity RGBA crop must preserve supplied pixels',
      );
      assert.equal(r.runtimeSha256, digest(manifestBytes));
      assert.equal(r.model, manifest.model);
      assert.equal(r.modelSha256, manifest.modelArchiveSha256);
      assert.equal(r.mapping.captureId, d.evidenceId);
      assert.equal(r.mapping.deviceId, d.deviceId);
      assert.equal(r.mapping.bindingId, d.bindingId);
      assert.equal(r.mapping.generation, d.generation);
      assert.equal(r.mapping.orientationEpoch, d.orientationEpoch);
      assert.equal(r.mapping.contextRevision, 1);
      assert.deepEqual(r.mapping.roi, supplied.preprocess.roi);
      assert.equal(r.mapping.numerator, 1);
      assert.equal(r.mapping.denominator, 1);
      assert(Number.isFinite(r.rawScore) && r.rawScore >= 0 && r.rawScore <= 1);
      assert(Number.isFinite(r.modelLatencyMs) && r.modelLatencyMs >= 0);
      assert(r.endToEndLatencyMs >= r.modelLatencyMs);
      assert(Number.isSafeInteger(r.peakRssBytes) && r.peakRssBytes > 0);

      // VI refusal is a capability test, not a mislabeled Vietnamese image benchmark.
      const vi = await begin(owner, { ...supplied, language: 'VI' }).result;
      assert.equal(vi.code, 'VI_CHARACTER_REPERTOIRE_UNSUPPORTED');
      assert.equal(vi.status, 'UNAVAILABLE');
      assert.equal(vi.retired, true);
      assert.equal(vi.text, null);
      assert.equal(vi.model, null);
      assert.equal(vi.capability, 'UNQUALIFIED');

      const row = {
        id: 'original-en-bitmap-smoke',
        imageSha256: digest(png),
        language: 'EN',
        split: 'SMOKE',
        label: 'HELLO 123',
        status: r.status,
        text: r.text,
        temperature: 'COLD',
        modelLatencyMs: r.modelLatencyMs,
        endToEndLatencyMs: r.endToEndLatencyMs,
        peakRssBytes: r.peakRssBytes,
      };
      const payload = {
        version: 1,
        scope: 'EVALUATION_ONLY',
        runtimeSha256: r.runtimeSha256,
        modelSha256: r.modelSha256,
        installedBytes: manifest.siteBytes,
        modelBytes: manifest.modelFiles.reduce((total, f) => total + f.bytes, 0),
        rows: [row],
      };
      const evaluated = spawnSync(
        '/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3',
        [
          '-I',
          '-B',
          fileURLToPath(new URL('../verification/ocr_evaluation_metrics.py', import.meta.url)),
        ],
        {
          input: JSON.stringify(payload),
          timeout: 5000,
          maxBuffer: 2 * 1024 * 1024,
          env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
        },
      );
      assert.equal(evaluated.error, undefined);
      assert.equal(evaluated.signal, null);
      assert.equal(evaluated.status, 0);
      assert.equal(evaluated.stderr.length, 0);
      const metrics = JSON.parse(evaluated.stdout.toString('utf8'));
      assert.equal(metrics.qualification, 'UNQUALIFIED');
      assert.equal(metrics.rows.length, 1);
      for (const [key, value] of Object.entries(row)) assert.equal(metrics.rows[0][key], value);
      assert.equal(metrics.summary.attempts, 1);
      assert.equal(metrics.summary.failures, 0);
      assert.equal(metrics.summary.exactLines, Number(r.text === row.label));
      assert.equal(metrics.summary.referenceCodepoints, [...row.label].length);
      assert.equal(metrics.bySplit.SMOKE.attempts, 1);
      assert.equal(metrics.bySplit.HELD_OUT, undefined);
      assert.equal(metrics.bySplit.TUNING, undefined);
      assert.equal(metrics.summary.measurements.COLD.modelLatencyMs.count, 1);
      assert.equal(metrics.summary.measurements.WARM.modelLatencyMs.count, 0);
      // Raw synthetic prediction/label retained whether or not the text is exact.
      // No accuracy threshold, held-out claim, or VI support is inferred.
      t.diagnostic(
        JSON.stringify({
          source: 'ORIGINAL_SYNTHETIC_BITMAP_GLYPHS',
          fixtureSha256: digest(png),
          vi: { code: vi.code, capability: vi.capability },
          metrics,
        }),
      );
    } finally {
      const retired = await owner.close();
      t.diagnostic(JSON.stringify({ ownedOcrAndPreprocessorRetired: retired }));
      assert.equal(retired, true, 'owned worker/group must actually retire');
    }
  });
