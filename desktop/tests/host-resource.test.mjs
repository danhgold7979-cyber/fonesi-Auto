import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { inputs, outputs, createManifest, verifyBuild } from '../scripts/build-manifest.mjs';
import {
  calculateHostSample,
  calculateDiskSpace,
  readDiskSpace,
} from '../src/main/host-resource-worker.ts';
import { createHostResourceSampler } from '../src/main/host-resource-sampler.ts';
import { createHostResourceClient } from '../src/host-resource-client.ts';
import { installHostResourceBridge } from '../src/host-resource-bridge.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
import * as contract from '../src/host-resource-contract.ts';
const raw = (extra = {}) => ({
  utc: 1000,
  mono: 0,
  cpus: [{ model: 'SYNTHETIC_CPU', times: [100, 0, 100, 800, 0] }],
  process: { user: 100, system: 100 },
  total: 10000,
  free: 5000,
  rss: 1000,
  ...extra,
});
const first = raw(),
  last = raw({
    utc: 2000,
    mono: 1000,
    cpus: [{ model: 'SYNTHETIC_CPU', times: [200, 0, 200, 1600, 0] }],
    process: { user: 100100, system: 100100 },
  });
const sample = () => calculateHostSample(first, last, 1);
const flush = () => new Promise((resolve) => setImmediate(resolve));
class FakeWorker extends EventEmitter {
  stops = 0;
  terminate() {
    this.stops++;
    return Promise.resolve(1);
  }
}
function fixture(extra = {}) {
  const worker = new FakeWorker(),
    owner = {};
  let time = 0,
    utc = 1000,
    timeout;
  const service = createHostResourceSampler({
    platform: 'win32',
    spawn: () => worker,
    now: () => time,
    utc: () => utc,
    timer: {
      set(fn) {
        timeout = fn;
        return 1;
      },
      clear() {},
    },
    ...extra,
  });
  return {
    worker,
    owner,
    service,
    advance(t = 1000) {
      time = t;
      utc = 1000 + t;
    },
    timeout() {
      timeout();
    },
    message(value = sample()) {
      worker.emit('message', JSON.stringify(value));
    },
  };
}
test('source-only synthetic CPU math uses total host capacity and bytes; main is not whole app', () => {
  const value = sample();
  assert.equal(value.metrics.hostCpu.value, 20);
  assert.equal(value.metrics.mainCpu.value, 20);
  assert.equal(value.metrics.totalRam.value, 10000);
  assert.equal(value.metrics.freeRam.value, 5000);
  assert.equal(value.metrics.mainRss.value, 1000);
  assert.equal(contract.HOST_METRIC_INFO.mainCpu.scope, 'MAIN_PROCESS');
  assert.equal(contract.HOST_METRIC_INFO.totalRam.unit, 'BYTES');
  assert.ok(contract.parseHostResourceSample(JSON.stringify(value)));
  assert.ok(Object.isFrozen(value));
});
test('counter topology regression zero and invalid fields remain UNKNOWN, not fabricated zero', () => {
  for (const change of [
    { cpus: [] },
    { cpus: [{ model: 'OTHER', times: [200, 0, 200, 1600, 0] }] },
    { cpus: [{ model: 'SYNTHETIC_CPU', times: [0, 0, 200, 1600, 0] }] },
  ]) {
    const result = calculateHostSample(first, { ...last, ...change }, 1);
    assert.equal(result.metrics.hostCpu.value, null);
    assert.equal(result.metrics.mainCpu.value, null);
  }
  assert.equal(
    calculateHostSample(first, { ...last, cpus: first.cpus }, 1).metrics.hostCpu.value,
    null,
  );
  const failure = calculateHostSample(first, { ...last, total: 2, free: 3, rss: null }, 1);
  assert.equal(failure.metrics.totalRam.value, null);
  assert.equal(failure.metrics.mainRss.code, 'PROBE_FAILED');
  for (const change of [{ mono: 999 }, { mono: 3001 }, { utc: 999 }])
    assert.equal(calculateHostSample(first, { ...last, ...change }, 1), null);
});
test('closed bounded wires reject extra duplicate fields wrong tuples and injected objects without coercion', () => {
  assert.ok(contract.parseHostResourceRequest('{"version":2,"requestId":"h1","method":"SAMPLE"}'));
  for (const text of [
    '{"version":2,"version":2,"requestId":"h1","method":"SAMPLE"}',
    '{"version":2,"requestId":"h1","method":"SAMPLE","pid":1}',
    '{"version":2,"requestId":"h65537","method":"SAMPLE"}',
  ])
    assert.equal(contract.parseHostResourceRequest(text), null);
  let called = false;
  assert.equal(
    contract.parseHostResourceRequest({
      toString() {
        called = true;
      },
    }),
    null,
  );
  assert.equal(called, false);
  const value = sample();
  assert.throws(() => {
    value.metrics.hostCpu.value = NaN;
  }, TypeError);
  const bad = {
    ...sample(),
    metrics: { ...sample().metrics, mainCpu: { value: 0, code: 'PROBE_FAILED' } },
  };
  assert.equal(contract.parseHostResourceSample(JSON.stringify(bad)), null);
  assert.equal(
    contract.parseHostResourceResponse(
      contract.hostResourceResponse('h1', 'CANCELLED', sample(), 1),
    ),
    null,
  );
});
test('sample publication requires actual worker exit, one lane, bounded captured freshness', async () => {
  const f = fixture();
  let delivered = false;
  const result = f.service
    .sample('h1', f.owner, () => true)
    .then((value) => {
      delivered = true;
      return value;
    });
  assert.equal(JSON.parse(await f.service.sample('h2', f.owner, () => true)).code, 'BUSY');
  f.advance();
  f.message();
  await flush();
  assert.equal(delivered, false);
  assert.equal(f.service.retired, false);
  f.advance(1100);
  f.worker.emit('exit', 0);
  const response = contract.parseHostResourceResponse(await result);
  assert.equal(response.code, 'OK');
  assert.equal(response.remainingFreshMs, 3900);
  assert.equal(f.service.retired, true);
});
test('logical timeout requests exact stop but retains lane and close drain until actual exit', async () => {
  const f = fixture();
  const result = f.service.sample('h1', f.owner, () => true);
  f.advance(3000);
  f.timeout();
  assert.equal(JSON.parse(await result).code, 'DEADLINE');
  assert.equal(f.worker.stops, 1);
  assert.equal(f.service.retired, false);
  assert.equal(JSON.parse(await f.service.sample('h2', f.owner, () => true)).code, 'BUSY');
  let drained = false;
  const close = f.service.close().then(() => {
    drained = true;
  });
  await flush();
  assert.equal(drained, false);
  f.message();
  f.worker.emit('exit', 1);
  await close;
  assert.equal(drained, true);
  assert.equal(f.service.retired, true);
});
test('cancellation is owner and exact request bound, late valid message never republishes', async () => {
  const f = fixture();
  const result = f.service.sample('h1', f.owner, () => true);
  assert.equal(f.service.cancel('h1', {}), false);
  assert.equal(f.service.cancel('h2', f.owner), false);
  assert.equal(f.worker.stops, 0);
  assert.equal(f.service.cancel('h1', f.owner), true);
  assert.equal(JSON.parse(await result).code, 'CANCELLED');
  f.advance();
  f.message();
  assert.equal(f.service.retired, false);
  f.worker.emit('exit', 0);
  assert.equal(f.service.retired, true);
});
test('malformed duplicate error and final owner loss cannot publish a sample', async () => {
  for (const mode of ['malformed', 'duplicate', 'error', 'owner']) {
    const f = fixture();
    let current = true;
    const result = f.service.sample('h1', f.owner, () => current);
    f.advance();
    if (mode === 'malformed') f.worker.emit('message', 'PRIVATE_CANARY');
    else if (mode === 'error') f.worker.emit('error', new Error('PRIVATE_CANARY'));
    else {
      f.message();
      if (mode === 'duplicate') f.message();
      else current = false;
    }
    f.worker.emit('exit', 0);
    const wire = await result;
    assert.equal(JSON.parse(wire).code, 'WORKER_FAILED');
    assert.ok(!wire.includes('PRIVATE_CANARY'));
  }
});
test('non-Windows and revoked admission refuse before worker construction', async () => {
  let spawns = 0;
  const service = createHostResourceSampler({
    platform: 'linux',
    spawn() {
      spawns++;
      throw Error('never');
    },
  });
  assert.equal(JSON.parse(await service.sample('h1', {}, () => true)).code, 'UNAVAILABLE');
  assert.equal(spawns, 0);
  const f = fixture({
    spawn() {
      spawns++;
      throw Error('never');
    },
  });
  assert.equal(JSON.parse(await f.service.sample('h1', {}, () => false)).code, 'SESSION_REVOKED');
  assert.equal(spawns, 0);
});
test('client uses shared ordinary budget and retains invocation until native promise settles', async () => {
  const budget = createInvocationBudget(),
    calls = [];
  let resolve;
  const client = createHostResourceClient(
    (wire) => {
      calls.push(JSON.parse(wire));
      return new Promise((r) => {
        resolve = r;
      });
    },
    budget,
    {
      set() {
        return 1;
      },
      clear() {},
    },
  );
  const pending = client.sample();
  assert.equal(budget.outstanding(), 1);
  assert.equal(JSON.parse(await client.sample()).code, 'BUSY');
  client.dispose();
  assert.equal(JSON.parse(await pending).code, 'CLOSED');
  assert.equal(budget.outstanding(), 2);
  assert.equal(calls[1].method, 'CANCEL');
  // Both actual promises remain held; logical dispose is not native settlement.
  assert.equal(client.outstanding, 2);
  assert.equal(typeof resolve, 'function');
});
test('client validates correlation and deadline is fixed without releasing an unresolved call', async () => {
  let timeout, settle;
  const budget = createInvocationBudget();
  const client = createHostResourceClient(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
    budget,
    {
      set(fn, ms) {
        assert.equal(ms, 3500);
        timeout = fn;
        return 1;
      },
      clear() {},
    },
  );
  const pending = client.sample();
  timeout();
  assert.equal(JSON.parse(await pending).code, 'DEADLINE');
  assert.ok(budget.outstanding() >= 1);
  // Fresh isolated client validates a wrong correlation without exposing returned bytes.
  const other = createHostResourceClient(async () =>
    contract.hostResourceResponse('h2', 'OK', sample(), 4000),
  );
  assert.equal(JSON.parse(await other.sample()).code, 'UNAVAILABLE');
  assert.equal(typeof settle, 'function');
});
test('actual bridge admits fixed sample/cancel only and releases each invocation; disposal closes worker owner', async () => {
  let handler,
    release = 0,
    closed = 0,
    samples = 0;
  const owner = {};
  const bridge = installHostResourceBridge(
    {
      handle(name, fn) {
        assert.equal(name, contract.HOST_RESOURCE_CHANNEL);
        handler = fn;
      },
      removeHandler() {},
    },
    () => ({
      ok: true,
      current: () => true,
      operationCurrent: () => true,
      release() {
        release++;
      },
    }),
    {
      sample: async (id, who) => {
        assert.equal(who, owner);
        samples++;
        return contract.hostResourceResponse(id, 'UNAVAILABLE');
      },
      cancel: () => true,
      close: () => {
        closed++;
        return Promise.resolve();
      },
    },
  );
  assert.equal(
    JSON.parse(await handler({ sender: owner }, '{"version":2,"requestId":"h1","method":"SAMPLE"}'))
      .code,
    'UNAVAILABLE',
  );
  assert.equal(
    JSON.parse(
      await handler(
        { sender: owner },
        '{"version":2,"requestId":"h2","method":"CANCEL","targetId":"h1"}',
      ),
    ).code,
    'CANCELLED',
  );
  assert.equal(
    JSON.parse(
      await handler({ sender: owner }, '{"version":2,"requestId":"h3","method":"SAMPLE"}', 1),
    ).code,
    'INVALID',
  );
  assert.equal(samples, 1);
  assert.equal(release, 3);
  bridge.dispose();
  assert.equal(closed, 1);
});
test('production worker route is literal bundled file with no caller path or subprocess; UI metrics remain narrowly scoped', () => {
  const source = readFileSync(
    new URL('../src/main/host-resource-sampler.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /join\(__dirname, 'host-resource-worker.cjs'\)/);
  assert.ok(!source.includes('child_process'));
  const worker = readFileSync(
    new URL('../src/main/host-resource-worker.ts', import.meta.url),
    'utf8',
  );
  assert.match(worker, /process.platform !== 'win32'/);
  assert.ok(!worker.includes('networkInterfaces'));
});

test('admission callback reentry stays BUSY and a final current callback cannot publish after close', async () => {
  const f = fixture();
  let reentered;
  const outer = f.service.sample('h1', f.owner, () => {
    if (!reentered) reentered = f.service.sample('h2', f.owner, () => true);
    return true;
  });
  assert.equal(JSON.parse(await reentered).code, 'BUSY');
  f.advance();
  f.message();
  f.worker.emit('exit', 0);
  assert.equal(JSON.parse(await outer).code, 'OK');
  const g = fixture();
  let calls = 0;
  const result = g.service.sample('h1', g.owner, () => {
    if (++calls === 2) void g.service.close();
    return true;
  });
  g.advance();
  g.message();
  g.worker.emit('exit', 0);
  assert.equal(JSON.parse(await result).code, 'CLOSED');
});

test('early timer keeps original monotonic deadline and impossible sample interval is refused', async () => {
  const f = fixture();
  const result = f.service.sample('h1', f.owner, () => true);
  f.advance(500);
  f.timeout();
  assert.equal(f.worker.stops, 0);
  f.advance(3000);
  f.timeout();
  assert.equal(JSON.parse(await result).code, 'DEADLINE');
  f.worker.emit('exit', 1);
  const g = fixture();
  const impossible = g.service.sample('h1', g.owner, () => true);
  g.advance(500);
  g.worker.emit('message', JSON.stringify({ ...sample(), endedUtc: 1500 }));
  assert.equal(JSON.parse(await impossible).code, 'WORKER_FAILED');
  g.worker.emit('exit', 1);
});

test('fixed worker is really bundled and its exact bytes are bound by production manifest without executing it', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const generated = await build({
    entryPoints: [resolve(root, 'src/main/host-resource-worker.ts')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    sourcemap: false,
    write: false,
    logLevel: 'silent',
  });
  assert.equal(generated.outputFiles.length, 1);
  const bytes = generated.outputFiles[0].contents;
  assert.ok(bytes.length > 0);
  const source = readFileSync(resolve(root, 'scripts/build.mjs'), 'utf8');
  assert.equal(source.split("resolve(root, 'src/main/host-resource-worker.ts')").length - 1, 1);
  assert.equal(outputs.filter((name) => name === 'host-resource-worker.cjs').length, 1);
  const temp = mkdtempSync(resolve(tmpdir(), 'host-worker-manifest-'));
  try {
    for (const name of inputs) {
      const target = resolve(temp, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(resolve(root, name)));
    }
    mkdirSync(resolve(temp, 'build'));
    for (const name of outputs)
      writeFileSync(
        resolve(temp, 'build', name),
        name === 'host-resource-worker.cjs' ? bytes : 'SYNTHETIC_OTHER_OUTPUT',
      );
    const manifest = createManifest(temp);
    assert.equal(
      manifest.outputs['host-resource-worker.cjs'],
      createHash('sha256').update(bytes).digest('hex'),
    );
    writeFileSync(resolve(temp, 'build/.verified-build.json'), JSON.stringify(manifest));
    assert.equal(verifyBuild(temp), true);
    writeFileSync(resolve(temp, 'build/host-resource-worker.cjs'), 'tampered');
    assert.equal(verifyBuild(temp), false);
    rmSync(resolve(temp, 'build/host-resource-worker.cjs'));
    assert.equal(verifyBuild(temp), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('disk counters use unprivileged available blocks and exact safe BigInt byte products', () => {
  assert.deepEqual(calculateDiskSpace({ bsize: 4096n, blocks: 10n, bavail: 3n, bfree: 9n }), {
    available: 12288,
    total: 40960,
    code: 'OK',
  });
  assert.deepEqual(
    calculateDiskSpace({ bsize: 1n, blocks: BigInt(Number.MAX_SAFE_INTEGER), bavail: 0n }),
    {
      available: 0,
      total: Number.MAX_SAFE_INTEGER,
      code: 'OK',
    },
  );
  for (const stats of [
    null,
    {},
    { bsize: 1, blocks: 2n, bavail: 1n },
    { bsize: 0n, blocks: 2n, bavail: 1n },
    { bsize: 1n, blocks: 0n, bavail: 0n },
    { bsize: 1n, blocks: 2n, bavail: -1n },
    { bsize: 1n, blocks: 2n, bavail: 3n },
    { bsize: 2n, blocks: BigInt(Number.MAX_SAFE_INTEGER), bavail: 0n },
    { bsize: 1n << 100n, blocks: 1n, bavail: 1n },
    { bsize: 1n, blocks: Infinity, bavail: 0n },
  ]) {
    assert.deepEqual(calculateDiskSpace(stats), {
      available: null,
      total: null,
      code: 'COUNTER_INVALID',
    });
  }
});
test('disk unavailable and probe failure preserve independently valid CPU and RAM without private errors', () => {
  for (const disk of [
    readDiskSpace(null),
    readDiskSpace('PRIVATE_CANARY'),
    calculateDiskSpace({}),
  ]) {
    const result = calculateHostSample(first, { ...last, disk }, 1);
    assert.equal(result.metrics.hostCpu.value, 20);
    assert.equal(result.metrics.freeRam.value, 5000);
    assert.equal(result.metrics.availableDisk.value, null);
    assert.equal(result.metrics.availableDisk.code, disk.code);
    const wire = JSON.stringify(result);
    assert.ok(contract.parseHostResourceSample(wire));
    assert.ok(!wire.includes('PRIVATE_CANARY'));
  }
});
test('actual disposable directory disk probe rejects missing file and symlink paths without enumerating', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'host-disk-owned-'));
  try {
    const observed = readDiskSpace(root);
    assert.equal(observed.code, 'OK');
    assert.ok(
      observed.total > 0 && observed.available >= 0 && observed.available <= observed.total,
    );
    assert.equal(readDiskSpace(resolve(root, 'absent')).code, 'PROBE_FAILED');
    const file = resolve(root, 'file');
    writeFileSync(file, 'SYNTHETIC');
    assert.equal(readDiskSpace(file).code, 'PROBE_FAILED');
    const alias = resolve(root, 'alias');
    symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(readDiskSpace(alias).code, 'PROBE_FAILED');
    assert.ok(!JSON.stringify(observed).includes(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('v2 strictly rejects old and mixed versions, path selectors and invalid disk tuples', () => {
  assert.equal(contract.HOST_RESOURCE_CHANNEL, 'foundation:host-resources:v2');
  for (const request of [
    { version: 1, requestId: 'h1', method: 'SAMPLE' },
    { version: 2, requestId: 'h1', method: 'SAMPLE', path: 'PRIVATE_CANARY' },
    { version: 2, requestId: 'h1', method: 'SAMPLE', dataRoot: null },
  ])
    assert.equal(contract.parseHostResourceRequest(JSON.stringify(request)), null);
  const observed = calculateHostSample(
    first,
    { ...last, disk: calculateDiskSpace({ bsize: 1n, blocks: 10n, bavail: 0n }) },
    1,
  );
  assert.equal(observed.metrics.availableDisk.value, 0);
  assert.ok(contract.parseHostResourceSample(JSON.stringify(observed)));
  assert.equal(contract.parseHostResourceSample(JSON.stringify({ ...observed, version: 1 })), null);
  for (const change of [
    { availableDisk: { ...observed.metrics.availableDisk, value: 11 } },
    { totalDisk: { ...observed.metrics.totalDisk, value: 0 } },
    { availableDisk: { ...observed.metrics.availableDisk, source: 'NODE_OS_FREEMEM' } },
    {
      availableDisk: {
        ...observed.metrics.availableDisk,
        code: 'DATA_VOLUME_UNAVAILABLE',
        value: null,
      },
    },
    { mainRss: { ...observed.metrics.mainRss, code: 'DATA_VOLUME_UNAVAILABLE', value: null } },
    { totalDisk: { ...observed.metrics.totalDisk, path: 'PRIVATE_CANARY' } },
  ])
    assert.equal(
      contract.parseHostResourceSample(
        JSON.stringify({ ...observed, metrics: { ...observed.metrics, ...change } }),
      ),
      null,
    );
  const reply = JSON.parse(contract.hostResourceResponse('h1', 'OK', observed, 4000));
  assert.equal(contract.parseHostResourceResponse(JSON.stringify({ ...reply, version: 1 })), null);
  assert.equal(
    contract.parseHostResourceResponse(
      JSON.stringify({ ...reply, sample: { ...observed, version: 1 } }),
    ),
    null,
  );
});
test('main-only root admission passes only to worker and ownership is checked again before publication', async () => {
  const root = resolve(tmpdir(), 'PRIVATE_CANARY');
  let owned = root,
    checks = 0,
    captured;
  const worker = new FakeWorker();
  const f = fixture({
    dataRoot: () => {
      checks++;
      return owned;
    },
    spawn: (sequence, dataRoot) => {
      captured = { sequence, dataRoot };
      return worker;
    },
  });
  const pending = f.service.sample('h1', f.owner, () => true);
  assert.deepEqual(captured, { sequence: 1, dataRoot: root });
  f.advance();
  worker.emit('message', JSON.stringify(sample()));
  owned = null;
  worker.emit('exit', 0);
  const wire = await pending;
  assert.equal(JSON.parse(wire).code, 'WORKER_FAILED');
  assert.equal(checks, 2);
  assert.ok(!wire.includes(root));
  assert.equal(f.service.retired, true);
});
test('absent root still samples CPU/RAM and revoked owner throws no path to renderer', async () => {
  for (const throws of [false, true]) {
    let spawns = 0;
    const f = fixture({
      dataRoot: () => {
        if (throws) throw Error('PRIVATE_CANARY');
        return null;
      },
      spawn: () => {
        spawns++;
        return f.worker;
      },
    });
    const pending = f.service.sample('h1', f.owner, () => true);
    if (!throws) {
      f.advance();
      f.message();
      f.worker.emit('exit', 0);
    }
    const wire = await pending;
    assert.equal(JSON.parse(wire).code, throws ? 'UNAVAILABLE' : 'OK');
    assert.equal(spawns, throws ? 0 : 1);
    assert.ok(!wire.includes('PRIVATE_CANARY'));
  }
});
test('ownership callback elapsed time consumes admission deadline and captured freshness', async () => {
  let spawns = 0;
  const slow = fixture({
    dataRoot: () => {
      slow.advance(3000);
      return null;
    },
    spawn: () => {
      spawns++;
      return slow.worker;
    },
  });
  assert.equal(
    JSON.parse(await slow.service.sample('h1', slow.owner, () => true)).code,
    'DEADLINE',
  );
  assert.equal(spawns, 0);
  for (const delay of [200, 2100]) {
    let checks = 0;
    const f = fixture({
      dataRoot: () => {
        if (++checks === 2) f.advance(1000 + delay);
        return null;
      },
    });
    const pending = f.service.sample('h1', f.owner, () => true);
    f.advance();
    f.message();
    f.worker.emit('exit', 0);
    const reply = JSON.parse(await pending);
    assert.equal(reply.code, delay === 200 ? 'OK' : 'DEADLINE');
    assert.equal(reply.remainingFreshMs, delay === 200 ? 3800 : 0);
  }
});
test('final ownership reentry cannot publish after close and cancellation retains disk worker lane', async () => {
  let checks = 0;
  const f = fixture({
    dataRoot: () => {
      if (++checks === 2) void f.service.close();
      return null;
    },
  });
  const pending = f.service.sample('h1', f.owner, () => true);
  f.advance();
  f.message();
  f.worker.emit('exit', 0);
  assert.equal(JSON.parse(await pending).code, 'CLOSED');
  const g = fixture({ dataRoot: () => resolve(tmpdir(), 'PRIVATE_CANARY') });
  const cancelled = g.service.sample('h1', g.owner, () => true);
  g.service.cancel('h1', g.owner);
  assert.equal(JSON.parse(await cancelled).code, 'CANCELLED');
  assert.equal(JSON.parse(await g.service.sample('h2', g.owner, () => true)).code, 'BUSY');
  g.advance();
  g.message();
  g.worker.emit('exit', 0);
  assert.equal(g.service.retired, true);
});
test('production root route comes from opened persistence with lease fences and no renderer path', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const scoped = main.slice(
    main.indexOf('hostResourceSampler = createHostResourceSampler('),
    main.indexOf('hostResourceBridge = installHostResourceBridge('),
  );
  assert.match(scoped, /assertPreparedPersistenceLease\(persistenceEntry\)/);
  assert.match(scoped, /return persistence.root/);
  assert.match(scoped, /if \(!persistence \|\| !persistenceEntry\) return null/);
  assert.ok(!/getPath|process\.env|cwd/.test(scoped));
  const worker = readFileSync(
    new URL('../src/main/host-resource-worker.ts', import.meta.url),
    'utf8',
  );
  assert.match(worker, /statfsSync\(root, \{ bigint: true \}\)/);
  assert.ok(!/readdir|opendir|console\.|postMessage\(workerData/.test(worker));
});

test('first worker deadline subtracts slow main ownership admission instead of restarting three seconds', async () => {
  const delays = [];
  let fire;
  const f = fixture({
    dataRoot: () => {
      f.advance(2000);
      return null;
    },
    timer: {
      set(fn, ms) {
        fire = fn;
        delays.push(ms);
        return 1;
      },
      clear() {},
    },
  });
  const pending = f.service.sample('h1', f.owner, () => true);
  assert.deepEqual(delays, [1000]);
  f.advance(3000);
  fire();
  assert.equal(JSON.parse(await pending).code, 'DEADLINE');
  assert.equal(f.worker.stops, 1);
  assert.equal(f.service.retired, false);
  f.worker.emit('exit', 1);
  assert.equal(f.service.retired, true);
});

test('Windows disk qualifier rejects caller arguments before creating or reading any directory', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = fileURLToPath(new URL('../scripts/check-host-disk.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--root=PRIVATE_CANARY'], {
    shell: false,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 65536,
  });
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.match(result.stdout, /HOST_DISK_WINDOWS_FAILED/);
  assert.ok(!result.stdout.includes('RETIRED'));
  assert.ok(!`${result.stdout}${result.stderr}`.includes('PRIVATE_CANARY'));
  const source = readFileSync(script, 'utf8');
  assert.ok(source.indexOf('!verifyBuild(root)') < source.indexOf('owned = mkdtempSync('));
  assert.match(source, /15000/);
  assert.match(source, /await sampler\?\.close\(\)/);
  assert.match(source, /HOST_DISK_ELECTRON_RUNTIME_NOT_RUN/);
  assert.ok(!source.includes('rmSync('));
  assert.equal(inputs.filter((name) => name === 'scripts/check-host-disk.mjs').length, 1);
});
