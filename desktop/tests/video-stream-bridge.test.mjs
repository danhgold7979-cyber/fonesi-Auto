import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { EventEmitter } from 'node:events';
import { ViewSession } from '../src/view-session.ts';
import * as contract from '../src/video-stream-contract.ts';

// Explicit source-only Electron/clock substitutions. The bridge body, real ViewSession and
// wire contract execute unchanged. These are not Electron custom-origin or device proofs.
const source = readFileSync(new URL('../src/video-stream-bridge.ts', import.meta.url), 'utf8');
const javascript = stripTypeScriptTypes(source)
  .replace(/import\s*\{[^}]+\}\s*from 'electron';/, '')
  .replace(/import\s*\{[^}]+\}\s*from '\.\/video-stream-contract\.ts';/, '')
  .replace('export function installVideoStreamBridge', 'function installVideoStreamBridge');
assert.equal(javascript.includes("from 'electron'"), false);
const load = new Function(
  'MessageChannelMain',
  'contract',
  'performance',
  'Date',
  'setTimeout',
  'clearTimeout',
  `const { VIDEO_STREAM_CHANNEL, VIDEO_PORT_CHANNEL, parseVideoStreamRequest, videoStreamResponse } = contract;\n${javascript}\nreturn installVideoStreamBridge;`,
);
const DEVICE = '11111111-1111-4111-8111-111111111111';
const VIDEO = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture(options = {}) {
  let mono = 0,
    utc = 1000,
    timerId = 0,
    requestNo = 0,
    destroyed = false,
    reservationCurrent = true;
  const timers = new Map(),
    handlers = new Map(),
    channels = [],
    deliveries = [];
  const started = deferred(),
    drained = deferred();
  let calls = 0,
    begins = 0,
    stops = 0,
    sink = null;
  class Port extends EventEmitter {
    closed = false;
    postMessage(value) {
      if (this.closed) throw Error('CLOSED');
      deliveries.push(value);
      options.onPost?.(value, f);
      queueMicrotask(() => {
        if (!this.peer.closed) this.peer.emit('message', { data: value });
      });
    }
    start() {}
    close() {
      if (this.closed) return;
      this.closed = true;
      queueMicrotask(() => this.emit('close'));
    }
  }
  class Channel {
    constructor() {
      this.port1 = new Port();
      this.port2 = new Port();
      this.port1.peer = this.port2;
      this.port2.peer = this.port1;
      channels.push(this);
    }
  }
  const frame = {
    url: 'auto-foundation://app/status.html',
    postMessage(channel, value, ports) {
      f.transfer = { channel, value, ports };
      options.onTransfer?.(f);
    },
  };
  const sender = { mainFrame: frame, isDestroyed: () => destroyed };
  const event = { sender, senderFrame: frame };
  const view = new ViewSession(sender, 'auto-foundation://app', frame.url);
  const caller = (e) => ({
    sender: e.sender,
    isMainFrame: e.senderFrame === sender.mainFrame,
    origin: 'auto-foundation://app',
    url: e.senderFrame?.url,
  });
  view.beginMainLoad(frame.url);
  assert.equal(view.finishInitial(caller(event)), true);
  const reservation = {
    videoId: VIDEO,
    generation: 7,
    deadlineUtc: 31000,
    current: () => reservationCurrent,
    begin(value) {
      begins++;
      sink = value;
      options.onBegin?.(f);
      return { started: started.promise };
    },
    stop() {
      stops++;
      return drained.promise;
    },
  };
  const install = load(
    Channel,
    contract,
    { now: () => mono },
    { now: () => utc },
    (callback, delay) => {
      const id = ++timerId;
      timers.set(id, { callback, at: mono + delay });
      return id;
    },
    (id) => timers.delete(id),
  );
  const bridge = install(
    {
      handle: (name, handler) => handlers.set(name, handler),
      removeHandler: (name) => handlers.delete(name),
    },
    (e) => view.admit(caller(e)),
    (e) => view.admitCleanup(caller(e)),
    () => ({
      reserveVideo(deviceId, revision) {
        calls++;
        assert.equal(deviceId, DEVICE);
        assert.equal(revision, 9);
        options.onReserve?.(f);
        return options.unavailable ? null : reservation;
      },
    }),
  );
  const invoke = handlers.get(contract.VIDEO_STREAM_CHANNEL);
  const f = {
    bridge,
    view,
    sender,
    frame,
    event,
    reservation,
    timers,
    channels,
    deliveries,
    started,
    drained,
    get calls() {
      return calls;
    },
    get begins() {
      return begins;
    },
    get stops() {
      return stops;
    },
    get sink() {
      return sink;
    },
    nextId() {
      return `00000000-0000-4000-8000-${String(++requestNo).padStart(12, '0')}`;
    },
    async run(value, e = event, ...extra) {
      return JSON.parse(await invoke(e, value, ...extra));
    },
    start(e = event) {
      return f.run(
        JSON.stringify({
          version: 1,
          requestId: f.nextId(),
          kind: 'START',
          deviceId: DEVICE,
          expectedRegistryRevision: 9,
        }),
        e,
      );
    },
    stop(e = event) {
      return f.run(
        JSON.stringify({ version: 1, requestId: f.nextId(), kind: 'STOP', videoId: VIDEO }),
        e,
      );
    },
    message(value) {
      queueMicrotask(() => channels[0].port1.emit('message', { data: value }));
    },
    ready() {
      f.message({ version: 1, videoId: VIDEO, kind: 'READY' });
    },
    ack(deliveryId = deliveries.at(-1)?.deliveryId) {
      f.message({ version: 1, videoId: VIDEO, deliveryId, kind: 'CONSUMED' });
    },
    paint(delivery = deliveries.at(-1), patch = {}) {
      f.message({
        version: 1,
        videoId: VIDEO,
        kind: 'PAINTED',
        deliveryId: delivery.deliveryId,
        geometryId: delivery.geometryId,
        configId: delivery.configId,
        packetId: delivery.packetId,
        ptsUs: delivery.ptsUs,
        width: delivery.width,
        height: delivery.height,
        ...patch,
      });
    },
    advance(value) {
      mono = value;
      utc = 1000 + value;
      for (const [id, timer] of [...timers])
        if (timer.at <= mono) {
          timers.delete(id);
          timer.callback();
        }
    },
    setWall(value) {
      utc = value;
    },
    lose() {
      reservationCurrent = false;
    },
    destroy() {
      destroyed = true;
    },
    async close() {
      drained.resolve(true);
      started.resolve();
      await bridge.close();
      await flush();
    },
  };
  return f;
}
function header(creditId, patch = {}) {
  return Object.freeze({
    version: 1,
    sessionId: SESSION,
    attemptId: ATTEMPT,
    videoId: VIDEO,
    creditId,
    geometryId: 1,
    configId: 0,
    packetId: 0,
    kind: 'SESSION',
    ptsUs: null,
    totalBytes: 0,
    offset: 0,
    width: 100,
    height: 200,
    ...patch,
  });
}
async function ready(f) {
  assert.equal((await f.start()).code, 'PENDING');
  assert.equal(f.begins, 0);
  f.ready();
  await flush();
  assert.equal(f.begins, 1);
}
async function deliver(f, h, bytes = new Uint8Array(h.totalBytes)) {
  const pending = f.sink.accept(h, bytes);
  await flush();
  f.ack();
  await pending;
  await flush();
  return f.deliveries.at(-1);
}
async function configured(f) {
  await ready(f);
  await deliver(f, header(1));
  await deliver(
    f,
    header(2, { configId: 1, packetId: 1, kind: 'CONFIG', totalBytes: 1 }),
    new Uint8Array([7]),
  );
}
test('actual bridge rejects untrusted sender, wrong frame URL and malformed requests before reservation', async () => {
  const f = fixture();
  assert.equal((await f.start({ ...f.event, sender: {} })).code, 'CLOSED');
  assert.equal((await f.start({ ...f.event, senderFrame: { url: f.frame.url } })).code, 'CLOSED');
  assert.equal((await f.run('{}')).code, 'INVALID');
  assert.equal(f.calls, 0);
  assert.equal(f.view.outstanding, 0);
  await f.close();
  const wrong = fixture();
  wrong.frame.url = 'auto-foundation://app/other.html';
  assert.equal((await wrong.start()).code, 'CLOSED');
  assert.equal(wrong.calls, 0);
  await wrong.close();
});
test('PENDING transfers only the captured frame/port, releases IPC lease, and READY alone begins reservation', async () => {
  const f = fixture();
  const response = await f.start();
  assert.equal(response.code, 'PENDING');
  assert.equal(response.videoId, VIDEO);
  assert.equal(f.view.outstanding, 0);
  assert.equal(f.begins, 0);
  assert.equal(f.transfer.channel, contract.VIDEO_PORT_CHANNEL);
  assert.equal(f.transfer.ports[0], f.channels[0].port2);
  assert.equal(f.transfer.value.generation, 7);
  f.ready();
  await flush();
  assert.equal(f.begins, 1);
  f.ready();
  await flush();
  assert.equal(f.stops, 1);
  await f.close();
});
test('SESSION packet zero uses independent delivery identities and held CONSUMED retains accept', async () => {
  const f = fixture();
  await ready(f);
  let settled = false;
  const first = f.sink.accept(header(1), new Uint8Array()).then(() => {
    settled = true;
  });
  await flush();
  assert.equal(settled, false);
  assert.equal(f.deliveries[0].deliveryId, 1);
  f.ack(1);
  await first;
  await deliver(f, header(2, { geometryId: 2 }));
  assert.deepEqual(
    f.deliveries.map((d) => [d.deliveryId, d.packetId, d.geometryId]),
    [
      [1, 0, 1],
      [2, 0, 2],
    ],
  );
  await f.close();
});
test('split chunks compose one exact packet and only complete payload delivery consumes a port ACK', async () => {
  const f = fixture();
  await configured(f);
  const bytes = new Uint8Array(32769);
  bytes[0] = 3;
  bytes[32768] = 4;
  const h = header(3, {
    configId: 1,
    packetId: 2,
    kind: 'KEY',
    ptsUs: 1,
    totalBytes: bytes.length,
  });
  await f.sink.accept(h, bytes.slice(0, 32768));
  assert.equal(f.deliveries.length, 2);
  const pending = f.sink.accept(
    header(4, { ...h, creditId: 4, offset: 32768 }),
    bytes.slice(32768),
  );
  await flush();
  assert.equal(f.deliveries.length, 3);
  assert.deepEqual(f.deliveries[2].bytes, bytes);
  f.ack();
  await pending;
  await f.close();
});
test('Stop immediately rejects held delivery but returns the actual held cleanup drain, never rearming', async () => {
  const f = fixture();
  await ready(f);
  const rejected = assert.rejects(f.sink.accept(header(1), new Uint8Array()), /VIDEO_CLOSED/);
  await flush();
  const stopping = f.stop();
  await flush();
  assert.equal(f.stops, 1);
  assert.equal(f.view.outstanding, 1);
  await rejected;
  let drained = false;
  const closed = f.bridge.close().then((value) => {
    drained = value;
  });
  await flush();
  assert.equal(drained, false);
  f.drained.resolve(true);
  await closed;
  assert.equal((await stopping).code, 'STOPPED');
  assert.equal(f.view.outstanding, 0);
  assert.equal(drained, true);
  assert.equal(f.stops, 1);
  await f.close();
});
test('CONFIG and CONSUMED chatter cannot renew the original first-paint deadline', async () => {
  const f = fixture();
  await configured(f);
  f.advance(29000);
  await deliver(
    f,
    header(3, { configId: 2, packetId: 2, kind: 'CONFIG', totalBytes: 1 }),
    new Uint8Array([8]),
  );
  f.advance(30000);
  assert.equal(f.stops, 1);
  assert.equal(f.begins, 1);
  await f.close();
});
test('only an exact current issued media draw renews draw health; foreign geometry closes', async () => {
  const f = fixture();
  await configured(f);
  const key = await deliver(
    f,
    header(3, { configId: 1, packetId: 2, kind: 'KEY', ptsUs: 1, totalBytes: 1 }),
    new Uint8Array([8]),
  );
  f.advance(10000);
  f.paint(key);
  await flush();
  f.advance(30000);
  assert.equal(f.stops, 0);
  f.paint(key, { geometryId: 99 });
  await flush();
  assert.equal(f.stops, 1);
  await f.close();
});
test('late known paint after configuration replacement is historical and does not renew or close current session', async () => {
  const f = fixture();
  await configured(f);
  const old = await deliver(
    f,
    header(3, { configId: 1, packetId: 2, kind: 'KEY', ptsUs: 1, totalBytes: 1 }),
    new Uint8Array([8]),
  );
  await deliver(
    f,
    header(4, { configId: 2, packetId: 3, kind: 'CONFIG', totalBytes: 1 }),
    new Uint8Array([9]),
  );
  f.advance(20000);
  f.paint(old);
  await flush();
  assert.equal(f.stops, 0);
  f.advance(30000);
  assert.equal(f.stops, 1);
  await f.close();
});
test('port close and view revocation stop the same retained reservation without another begin', async () => {
  for (const mode of ['port', 'view']) {
    const f = fixture();
    await ready(f);
    if (mode === 'port') f.channels[0].port1.close();
    else {
      f.view.revoke();
      f.message({ version: 1, videoId: VIDEO, kind: 'READY' });
    }
    await flush();
    assert.equal(f.stops, 1);
    assert.equal(f.begins, 1);
    await f.close();
  }
});
test('currentness lost synchronously during transfer or delivery prevents later admission/publication', async () => {
  const transfer = fixture({ onTransfer: (f) => f.lose() });
  assert.equal((await transfer.start()).code, 'PENDING');
  assert.equal(transfer.stops, 1);
  transfer.ready();
  await flush();
  assert.equal(transfer.begins, 0);
  await transfer.close();
  const delivery = fixture({ onPost: (_value, f) => f.lose() });
  await ready(delivery);
  await assert.rejects(delivery.sink.accept(header(1), new Uint8Array()), /VIDEO_CLOSED/);
  assert.equal(delivery.stops, 1);
  await delivery.close();
});
test('malformed/foreign ACK refuses and cleanup uses the cleanup admission without exhausting ordinary slots', async () => {
  const f = fixture();
  await ready(f);
  const denied = assert.rejects(f.sink.accept(header(1), new Uint8Array()), /VIDEO_CLOSED/);
  await flush();
  f.ack(9);
  await denied;
  assert.equal(f.stops, 1);
  assert.equal(f.view.outstanding, 0);
  const stopping = f.stop();
  await flush();
  assert.equal(f.view.outstanding, 1);
  f.drained.resolve(true);
  assert.equal((await stopping).code, 'STOPPED');
  assert.equal(f.view.outstanding, 0);
  await f.close();
});

test('reservation callbacks cannot grant a fresh monotonic startup window when UTC does not advance', async () => {
  const f = fixture({
    onReserve: (value) => {
      value.advance(20000);
      value.setWall(1000);
    },
  });
  assert.equal((await f.start()).code, 'PENDING');
  f.ready();
  await flush();
  f.advance(30000);
  assert.equal(f.stops, 1);
  await f.close();
});

test('already painted same-generation delivery is historical and cannot renew the draw deadline', async () => {
  const f = fixture();
  await configured(f);
  const key = await deliver(
    f,
    header(3, { configId: 1, packetId: 2, kind: 'KEY', ptsUs: 1, totalBytes: 1 }),
    new Uint8Array([8]),
  );
  f.advance(10000);
  f.paint(key);
  await flush();
  f.advance(35000);
  f.paint(key);
  await flush();
  assert.equal(f.stops, 0);
  f.advance(40000);
  assert.equal(f.stops, 1);
  await f.close();
});

test('pre-key DELTAs drain without paint identities initially and after CONFIG or SESSION reset', async () => {
  for (const mode of ['initial', 'config', 'session']) {
    const f = fixture();
    await configured(f);
    let credit = 2,
      packet = 1,
      geometry = 1,
      config = 1;
    if (mode !== 'initial') {
      const old = await deliver(
        f,
        header(++credit, {
          configId: config,
          packetId: ++packet,
          kind: 'KEY',
          ptsUs: 1,
          totalBytes: 1,
        }),
      );
      if (mode === 'session') {
        geometry++;
        await deliver(f, header(++credit, { geometryId: geometry }));
      }
      config++;
      await deliver(
        f,
        header(++credit, {
          geometryId: geometry,
          configId: config,
          packetId: ++packet,
          kind: 'CONFIG',
          totalBytes: 1,
        }),
      );
      f.paint(old);
      await flush();
      assert.equal(f.stops, 0);
    }
    for (let n = 0; n < 4; n++) {
      await deliver(
        f,
        header(++credit, {
          geometryId: geometry,
          configId: config,
          packetId: ++packet,
          kind: 'DELTA',
          ptsUs: n + 2,
          totalBytes: 1,
        }),
      );
    }
    const key = await deliver(
      f,
      header(++credit, {
        geometryId: geometry,
        configId: config,
        packetId: ++packet,
        kind: 'KEY',
        ptsUs: 6,
        totalBytes: 1,
      }),
    );
    f.paint(key);
    await flush();
    assert.equal(f.stops, 0);
    await f.close();
  }
});
test('pre-key discarded DELTA cannot claim a paint', async () => {
  const f = fixture();
  await configured(f);
  const delta = await deliver(
    f,
    header(3, { configId: 1, packetId: 2, kind: 'DELTA', ptsUs: 1, totalBytes: 1 }),
  );
  f.paint(delta);
  await flush();
  assert.equal(f.stops, 1);
  await f.close();
});

test('three unresolved media identities are bounded and a fourth cannot overwrite them', async () => {
  const f = fixture();
  await configured(f);
  for (let n = 0; n < 3; n++)
    await deliver(
      f,
      header(n + 3, {
        configId: 1,
        packetId: n + 2,
        kind: n === 0 ? 'KEY' : 'DELTA',
        ptsUs: n + 1,
        totalBytes: 1,
      }),
    );
  await assert.rejects(
    f.sink.accept(
      header(6, { configId: 1, packetId: 5, kind: 'DELTA', ptsUs: 4, totalBytes: 1 }),
      new Uint8Array(1),
    ),
  );
  assert.equal(f.stops, 1);
  await f.close();
});

test('old CONSUMED cannot retire a pending newer CONFIG or SESSION delivery', async () => {
  for (const kind of ['CONFIG', 'SESSION']) {
    const f = fixture();
    await configured(f);
    const pending = f.sink.accept(
      header(
        3,
        kind === 'SESSION'
          ? { geometryId: 2 }
          : { configId: 2, packetId: 2, kind: 'CONFIG', totalBytes: 1 },
      ),
      new Uint8Array(kind === 'SESSION' ? 0 : 1),
    );
    const rejected = assert.rejects(pending, /VIDEO_CLOSED/);
    await flush();
    f.ack(2);
    await rejected;
    assert.equal(f.stops, 1);
    await f.close();
  }
});
