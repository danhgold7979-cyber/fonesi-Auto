import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { parseAvcConfiguration, prepareAvcChunk, annexBNals } from '../src/h264-video.ts';
import { createTileVideoDecoder } from '../src/video-decoder.ts';
const id = '00000000-0000-4000-8000-000000000001';
class Bits {
  text = '';
  u(v, n) {
    this.text += v.toString(2).padStart(n, '0');
    return this;
  }
  ue(v) {
    const t = (v + 1).toString(2);
    this.text += '0'.repeat(t.length - 1) + t;
    return this;
  }
  se(v) {
    return this.ue(v <= 0 ? -2 * v : 2 * v - 1);
  }
  end() {
    this.text += '1';
    while (this.text.length % 8) this.text += '0';
    return Uint8Array.from(this.text.match(/.{8}/g).map((v) => parseInt(v, 2)));
  }
}
function nal(type, b) {
  const out = [0, 0, 0, 1, type];
  let zeros = 0;
  for (const v of b) {
    if (zeros === 2 && v <= 3) {
      out.push(3);
      zeros = 0;
    }
    out.push(v);
    zeros = v === 0 ? zeros + 1 : 0;
  }
  return out;
}
function configuration({
  vui = false,
  interlace = false,
  ppsId = 0,
  width = 2,
  profile = 66,
  scale = false,
  sar = 1,
  refs = 1,
  buffering = 1,
  crop = false,
} = {}) {
  const s = new Bits().u(profile, 8).u(0, 8).u(30, 8).ue(0);
  if (profile === 100)
    s.ue(1)
      .ue(0)
      .ue(0)
      .u(0, 1)
      .u(scale ? 1 : 0, 1);
  s.ue(0)
    .ue(0)
    .ue(0)
    .ue(refs)
    .u(0, 1)
    .ue(width - 1)
    .ue(1)
    .u(interlace ? 0 : 1, 1)
    .u(1, 1)
    .u(crop ? 1 : 0, 1);
  if (crop) s.ue(1).ue(1).ue(1).ue(0);
  s.u(vui ? 1 : 0, 1);
  if (vui) {
    s.u(1, 1)
      .u(sar, 8)
      .u(0, 1)
      .u(1, 1)
      .u(5, 3)
      .u(1, 1)
      .u(1, 1)
      .u(1, 8)
      .u(1, 8)
      .u(1, 8)
      .u(1, 1)
      .ue(0)
      .ue(0)
      .u(1, 1)
      .u(1, 32)
      .u(60, 32)
      .u(1, 1)
      .u(1, 1)
      .ue(0)
      .u(0, 4)
      .u(0, 4)
      .ue(0)
      .ue(0)
      .u(1, 1)
      .u(0, 5)
      .u(0, 5)
      .u(0, 5)
      .u(0, 5)
      .u(0, 1)
      .u(0, 1)
      .u(0, 1)
      .u(1, 1)
      .u(1, 1)
      .ue(0)
      .ue(0)
      .ue(0)
      .ue(0)
      .ue(0)
      .ue(buffering);
  }
  const p = new Bits()
    .ue(ppsId)
    .ue(0)
    .u(0, 1)
    .u(0, 1)
    .ue(0)
    .ue(0)
    .ue(0)
    .u(0, 1)
    .u(0, 2)
    .se(0)
    .se(0)
    .se(0)
    .u(1, 1)
    .u(0, 1)
    .u(0, 1);
  return Uint8Array.from([...nal(0x67, s.end()), ...nal(0x68, p.end())]);
}
const media = (key = true, pps = 0) =>
  Uint8Array.from(
    nal(
      key ? 0x65 : 0x41,
      new Bits()
        .ue(0)
        .ue(key ? 2 : 0)
        .ue(pps)
        .end(),
    ),
  );
const cfg = configuration();
const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};
function rig({
  support = async () => true,
  deadline = 30000,
  factory = createTileVideoDecoder,
} = {}) {
  let now = 0,
    nowError = null,
    current = true,
    paintHook = null,
    stateHook = null,
    drawHook = null,
    decodeHook = null,
    chunkHook = null;
  const calls = { now: 0, current: 0, set: 0, clear: 0 };
  const presentationAcks = [];
  let epoch = 0;
  const consumed = [],
    painted = [],
    states = [],
    decoders = [],
    timers = new Map(),
    draws = [];
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({
      clearRect() {},
      drawImage(...args) {
        draws.push(args);
        drawHook?.(...args);
      },
    }),
  };
  const owner = factory(
    {
      videoId: id,
      deviceId: id,
      generation: 1,
      deadlineUtc: deadline,
      canvas,
      current: () => {
        calls.current++;
        return current;
      },
      onConsumed: (v) => consumed.push(v),
      onPresentationAck: (v) => presentationAcks.push(v),
      onPainted: (v) => {
        painted.push(v);
        paintHook?.();
      },
      onState: (s) => {
        states.push(s);
        stateHook?.(s);
      },
    },
    {
      now: () => {
        calls.now++;
        if (nowError) throw nowError;
        return now;
      },
      utc: () => 0,
      set: (fn, ms) => {
        calls.set++;
        const token = {};
        timers.set(token, { fn, ms });
        return token;
      },
      clear: (t) => {
        calls.clear++;
        timers.delete(t);
      },
      supported: support,
      chunk: (v) => {
        chunkHook?.(v);
        return v;
      },
      create(output, error) {
        const d = {
          output,
          error,
          decodeQueueSize: 0,
          configured: null,
          chunks: [],
          closed: false,
          configure(c) {
            this.configured = c;
          },
          decode(c) {
            this.chunks.push(c);
            decodeHook?.(this, c);
          },
          close() {
            this.closed = true;
          },
        };
        decoders.push(d);
        return d;
      },
    },
  );
  let delivery = 0,
    packet = 0;
  const send = (kind, extra = {}) => {
    const bytes =
      kind === 'SESSION'
        ? new Uint8Array()
        : kind === 'CONFIG'
          ? cfg.slice()
          : media(kind === 'KEY');
    const v = {
      version: 1,
      videoId: id,
      deliveryId: ++delivery,
      geometryId: 1,
      configId: kind === 'SESSION' ? 0 : 1,
      packetId: kind === 'SESSION' ? 0 : ++packet,
      kind,
      ptsUs: ['KEY', 'DELTA'].includes(kind) ? packet * 1000 : null,
      totalBytes: bytes.length,
      width: 32,
      height: 32,
      bytes,
      ...extra,
    };
    owner.receive({ version: 2, videoId: id, kind: 'MEDIA', epoch, delivery: v });
    return v;
  };
  const fence = (state = 'VISIBLE', extra = {}) =>
    owner.presentation({
      version: 2,
      videoId: id,
      kind: 'PRESENTATION',
      epoch: ++epoch,
      state,
      afterDeliveryId: delivery,
      afterPacketId: packet,
      remainingMs: 30000,
      ...extra,
    });
  fence();
  const frame = (decoder, pts, extra = {}) => {
    const f = {
      timestamp: pts,
      visibleRect: { x: 0, y: 0, width: 32, height: 32 },
      rotation: 0,
      flip: false,
      codedWidth: 32,
      codedHeight: 32,
      displayWidth: 32,
      displayHeight: 32,
      closed: 0,
      close() {
        this.closed++;
      },
      ...extra,
    };
    decoder.output(f);
    return f;
  };
  return {
    owner,
    fence,
    presentationAcks,
    canvas,
    calls,
    setStateHook: (hook) => {
      stateHook = hook;
    },
    setPaintHook: (hook) => {
      paintHook = hook;
    },
    setDrawHook: (hook) => {
      drawHook = hook;
    },
    setDecodeHook: (hook) => {
      decodeHook = hook;
    },
    setChunkHook: (hook) => {
      chunkHook = hook;
    },
    send,
    frame,
    decoders,
    consumed,
    painted,
    states,
    timers,
    draws,
    setNow: (v) => (now = v),
    setNowError: (error) => (nowError = error),
    revoke: () => (current = false),
  };
}
test('actual Annex B SPS PPS and bounded VUI HRD parse, parameters prepend on every KEY', () => {
  for (const vui of [false, true]) {
    const c = parseAvcConfiguration(configuration({ vui }), 32, 32);
    assert.equal(c.codec, 'avc1.42001e');
    assert.equal(c.ppsId, 0);
    for (let i = 0; i < 2; i++)
      assert.equal(annexBNals(prepareAvcChunk(media(), true, c)).length, 3);
    assert.equal(annexBNals(prepareAvcChunk(media(false), false, c)).length, 1);
  }
});
test('unsupported malformed config dimensions scaling interlace truncation and VCL PPS mismatch refuse', () => {
  for (const bytes of [
    cfg.slice(0, -1),
    configuration({ interlace: true }),
    configuration({ profile: 100, scale: true }),
    configuration({ profile: 110 }),
    configuration({ width: 257 }),
    new Uint8Array(65537),
  ])
    assert.throws(() => parseAvcConfiguration(bytes, 32, 32));
  assert.throws(() => parseAvcConfiguration(cfg, 64, 32));
  const c = parseAvcConfiguration(cfg, 32, 32);
  assert.throws(() => prepareAvcChunk(media(true, 1), true, c));
  assert.throws(() => prepareAvcChunk(media(false), true, c));
  assert.throws(() => prepareAvcChunk(media(true), false, c));
  assert.throws(() => annexBNals(Uint8Array.from([0, 0, 1, 0xff, 1])));
});
test('actual decoder orchestration emits only after real callback, closes frames and retains two unresolved identities', async () => {
  const r = rig();
  r.send('SESSION');
  r.send('CONFIG');
  await flush();
  r.send('KEY');
  r.send('DELTA');
  r.send('DELTA');
  assert.equal(r.decoders[0].chunks.length, 2);
  assert.equal(r.owner.snapshot().held, true);
  assert.equal(r.consumed.length, 4);
  assert.equal(r.painted.length, 0);
  const f = r.frame(r.decoders[0], 2000);
  await flush();
  assert.equal(f.closed, 1);
  assert.equal(r.painted.length, 1);
  assert.equal(r.decoders[0].chunks.length, 3);
  assert.equal(r.consumed.length, 5);
  r.owner.close();
  const stale = r.frame(r.decoders[0], 3000);
  assert.equal(stale.closed, 1);
  assert.equal(r.painted.length, 1);
});
test('CONFIG without geometry advances generation and closes late prior decoder output', async () => {
  const r = rig();
  r.send('SESSION');
  r.send('CONFIG');
  await flush();
  r.send('KEY');
  const old = r.decoders[0];
  r.send('CONFIG', { configId: 2 });
  await flush();
  assert.equal(old.closed, true);
  assert.equal(r.frame(old, 2000).closed, 1);
  assert.equal(r.painted.length, 0);
  r.send('KEY', { configId: 2 });
  r.frame(r.decoders[1], 4000);
  assert.equal(r.painted.length, 1);
});
test('held capability check and timer expiration cannot rearm closed decoder or extend startup', async () => {
  let settle;
  const r = rig({ support: () => new Promise((resolve) => (settle = resolve)) });
  r.send('SESSION');
  r.send('CONFIG');
  r.setNow(30000);
  for (const { fn } of [...r.timers.values()]) fn();
  settle(true);
  await flush();
  assert.equal(r.decoders.length, 0);
  assert.equal(r.owner.snapshot().closed, true);
});
test('generation loss, duplicate delivery and unsupported decoder fail closed without a paint', async () => {
  const r = rig();
  r.send('SESSION');
  r.send('CONFIG');
  await flush();
  r.send('KEY');
  r.revoke();
  r.frame(r.decoders[0], 2000);
  assert.equal(r.painted.length, 0);
  assert.equal(r.owner.snapshot().closed, true);
  const d = rig();
  const session = d.send('SESSION');
  d.owner.receive(session);
  assert.equal(d.owner.snapshot().closed, true);
  const u = rig({ support: async () => false });
  u.send('SESSION');
  u.send('CONFIG');
  await flush();
  assert.equal(u.owner.snapshot().state, 'DECODER_UNAVAILABLE');
});
test('configuration byte snapshot is immutable across held capability and both queue accounting and deadline stay independent', async () => {
  let settle;
  const r = rig({ support: () => new Promise((resolve) => (settle = resolve)) });
  r.send('SESSION');
  const config = r.send('CONFIG');
  config.bytes.fill(255);
  settle(true);
  await flush();
  r.send('KEY');
  assert.equal(r.decoders[0].chunks.length, 1);
  r.setNow(29999);
  r.send('DELTA');
  r.setNow(30000);
  for (const { fn } of [...r.timers.values()]) fn();
  assert.equal(r.owner.snapshot().closed, true);
  assert.equal(r.painted.length, 0);
});
test('wrong output identity or geometry closes rather than falsely advancing paint health', async () => {
  for (const wrong of ['identity', 'geometry']) {
    const r = rig();
    r.send('SESSION');
    r.send('CONFIG');
    await flush();
    r.send('KEY');
    let closed = 0;
    const f = {
      timestamp: wrong === 'identity' ? 999 : 2000,
      visibleRect: { x: 0, y: 0, width: 32, height: 32 },
      rotation: 0,
      flip: false,
      codedWidth: 32,
      codedHeight: 32,
      displayWidth: wrong === 'geometry' ? 16 : 32,
      displayHeight: 32,
      close() {
        closed++;
      },
    };
    r.decoders[0].output(f);
    assert.equal(closed, 1);
    assert.equal(r.painted.length, 0);
    assert.equal(r.owner.snapshot().closed, true);
  }
});
test('bounded Annex B refuses excessive NAL count, invalid emulation and missing or duplicate parameter sets', () => {
  const c = parseAvcConfiguration(cfg, 32, 32);
  assert.throws(() =>
    annexBNals(Uint8Array.from(Array.from({ length: 257 }, () => [0, 0, 1, 9, 0x80]).flat())),
  );
  assert.throws(() =>
    parseAvcConfiguration(
      Uint8Array.from([0, 0, 1, 0x67, 0, 0, 3, 4, 0, 0, 1, 0x68, 0x80]),
      32,
      32,
    ),
  );
  const n = annexBNals(cfg);
  const only = Uint8Array.from([0, 0, 1, ...n[0]]);
  assert.throws(() => parseAvcConfiguration(only, 32, 32));
  assert.throws(() => prepareAvcChunk(Uint8Array.from([...cfg, ...cfg, ...media()]), true, c));
  assert.throws(() => prepareAvcChunk(Uint8Array.from([...cfg, ...media(false)]), false, c));
});
test('rejected capability and backward monotonic clock do not create decoder or renew timers', async () => {
  const r = rig({
    support: async () => {
      throw Error('synthetic capability unavailable');
    },
  });
  r.send('SESSION');
  r.send('CONFIG');
  await flush();
  assert.equal(r.owner.snapshot().state, 'DECODER_UNAVAILABLE');
  assert.equal(r.decoders.length, 0);
  const b = rig();
  b.send('SESSION');
  b.setNow(-1);
  b.send('CONFIG');
  assert.equal(b.owner.snapshot().closed, true);
  assert.equal(b.decoders.length, 0);
});

test('current draw identity remains retained through reentrant PAINTED callback until frame close', async () => {
  const r = rig();
  r.send('SESSION');
  r.send('CONFIG');
  await flush();
  r.send('KEY');
  r.send('DELTA');
  r.setPaintHook(() => {
    assert.equal(r.owner.snapshot().pending, 2);
    r.send('DELTA');
    assert.equal(r.decoders[0].chunks.length, 2);
    assert.equal(r.owner.snapshot().held, true);
  });
  const f = r.frame(r.decoders[0], 2000);
  await flush();
  assert.equal(f.closed, 1);
  assert.equal(r.decoders[0].chunks.length, 3);
  assert.equal(r.owner.snapshot().pending, 2);
});

test('non-square SAR accepts decoder cropped or adjusted display once and paint remains native delivery geometry', async () => {
  const bytes = configuration({ vui: true, sar: 16 });
  const c = parseAvcConfiguration(bytes, 32, 32);
  assert.equal(c.displayWidth, 64);
  assert.equal(c.displayHeight, 32);
  for (const actualWidth of [32, 64]) {
    const r = rig();
    r.send('SESSION');
    r.send('CONFIG', { bytes, totalBytes: bytes.length });
    await flush();
    r.send('KEY');
    let closed = 0;
    r.decoders[0].output({
      timestamp: 2000,
      visibleRect: { x: 0, y: 0, width: 32, height: 32 },
      rotation: 0,
      flip: false,
      codedWidth: 32,
      codedHeight: 32,
      displayWidth: actualWidth,
      displayHeight: 32,
      close() {
        closed++;
      },
    });
    assert.equal(closed, 1);
    assert.equal(r.draws.length, 1);
    assert.equal(r.draws[0][3], 64);
    assert.equal(r.painted[0].width, 32);
    r.owner.close();
  }
});
test('VUI buffering below actual SPS reference count refuses while equal bound admits', () => {
  assert.throws(() =>
    parseAvcConfiguration(configuration({ vui: true, refs: 2, buffering: 1 }), 32, 32),
  );
  assert.equal(
    parseAvcConfiguration(configuration({ vui: true, refs: 2, buffering: 2 }), 32, 32).width,
    32,
  );
});

async function configuredRig(options) {
  const r = rig(options);
  r.send('SESSION');
  r.send('CONFIG');
  await flush();
  return r;
}
test('fixed reasons distinguish native callback, submission, malformed configuration and capability', async () => {
  const n = await configuredRig();
  n.setStateHook((s) => {
    if (s === 'DECODE_FAILED') assert.equal(n.owner.snapshot().failureReason, 'NATIVE_ERROR');
  });
  n.decoders[0].error();
  assert.equal(n.owner.snapshot().failureReason, 'NATIVE_ERROR');
  n.owner.close();
  assert.equal(n.owner.snapshot().failureReason, 'NATIVE_ERROR');
  const d = await configuredRig();
  d.decoders[0].decode = () => {
    throw Error('private');
  };
  d.send('KEY');
  assert.equal(d.owner.snapshot().failureReason, 'SUBMISSION');
  const c = rig();
  c.send('SESSION');
  c.send('CONFIG', { bytes: Uint8Array.of(0), totalBytes: 1 });
  assert.equal(c.owner.snapshot().failureReason, 'CONFIGURATION');
  const u = rig({ support: async () => false });
  u.send('SESSION');
  u.send('CONFIG');
  await flush();
  assert.equal(u.owner.snapshot().failureReason, 'CAPABILITY');
});
test('fixed reasons distinguish output identity, geometry, draw, acknowledgment and frame-close failures', async () => {
  const frame = (extra = {}) => ({
    timestamp: 2000,
    visibleRect: { x: 0, y: 0, width: 32, height: 32 },
    rotation: 0,
    flip: false,
    codedWidth: 32,
    codedHeight: 32,
    displayWidth: 32,
    displayHeight: 32,
    close() {},
    ...extra,
  });
  const i = await configuredRig();
  i.send('KEY');
  i.decoders[0].output(frame({ timestamp: 999 }));
  assert.equal(i.owner.snapshot().failureReason, 'OUTPUT_IDENTITY');
  const g = await configuredRig();
  g.send('KEY');
  g.decoders[0].output(frame({ codedWidth: 16 }));
  assert.equal(g.owner.snapshot().failureReason, 'OUTPUT_GEOMETRY');
  const p = await configuredRig();
  p.canvas.getContext = () => ({
    clearRect() {},
    drawImage() {
      throw Error('private');
    },
  });
  p.send('KEY');
  p.decoders[0].output(frame());
  assert.equal(p.owner.snapshot().failureReason, 'PAINT');
  assert.equal(p.painted.length, 0);
  const a = await configuredRig();
  a.setPaintHook(() => {
    throw Error('private');
  });
  a.send('KEY');
  a.decoders[0].output(frame());
  assert.equal(a.owner.snapshot().failureReason, 'PAINT_ACK');
  const f = await configuredRig();
  f.send('KEY');
  f.decoders[0].output(
    frame({
      close() {
        throw Error('private');
      },
    }),
  );
  assert.equal(f.owner.snapshot().failureReason, 'FRAME_CLOSE');
});
test('watchdog, clock validation, delivery and normal cancellation remain distinct with unchanged deadline', async () => {
  const w = await configuredRig();
  w.send('KEY');
  w.setNow(30000);
  for (const { fn } of [...w.timers.values()]) fn();
  assert.equal(w.owner.snapshot().failureReason, 'DEADLINE');
  const late = await configuredRig();
  late.send('KEY');
  late.setNow(30000);
  late.frame(late.decoders[0], 2000);
  assert.equal(late.owner.snapshot().failureReason, 'DEADLINE');
  const c = rig();
  c.send('SESSION');
  c.setNow(-1);
  c.send('CONFIG');
  assert.equal(c.owner.snapshot().failureReason, 'CLOCK');
  const d = rig();
  const v = d.send('SESSION');
  d.owner.receive(v);
  assert.equal(d.owner.snapshot().failureReason, 'DELIVERY');
  const normal = await configuredRig();
  normal.owner.close();
  assert.equal(normal.owner.snapshot().failureReason, null);
  assert.equal(normal.owner.snapshot().state, 'STOPPED');
  const early = rig({ deadline: 0 });
  assert.equal(early.owner.snapshot().failureReason, 'ADMISSION');
});
test('terminal reason is latched before observer and later observer error cannot replace native cause', async () => {
  const r = await configuredRig();
  let observed;
  r.setStateHook((s) => {
    if (s === 'DECODE_FAILED') {
      observed = r.owner.snapshot().failureReason;
      throw Error('private');
    }
  });
  r.decoders[0].error();
  assert.equal(observed, 'NATIVE_ERROR');
  assert.equal(r.owner.snapshot().failureReason, 'NATIVE_ERROR');
  assert.equal(JSON.stringify(r.owner.snapshot()).includes('private'), false);
  const callback = rig();
  callback.setStateHook(() => {
    throw Error('private');
  });
  callback.send('SESSION');
  assert.equal(callback.owner.snapshot().failureReason, 'STATE_CALLBACK');
});

test('WebCodecs padded allocation and relocated visible surface preserve exact draw space', async () => {
  for (const [w, h, x, y] of [
    [32, 32, 0, 0],
    [48, 64, 8, 16],
    [4096, 32, 4064, 0],
  ]) {
    const r = await configuredRig();
    r.send('KEY');
    const f = {
      timestamp: 2000,
      codedWidth: w,
      codedHeight: h,
      visibleRect: { x, y, width: 32, height: 32 },
      displayWidth: 32,
      displayHeight: 32,
      rotation: 0,
      flip: false,
      close() {},
    };
    r.decoders[0].output(f);
    assert.equal(r.owner.snapshot().state, 'DISPLAYING');
    assert.deepEqual(r.draws[0], [f, 0, 0, 32, 32]);
    assert.equal(r.owner.snapshot().geometryFailure, null);
    r.owner.close();
  }
});
test('WebCodecs rejects malformed allocation, crop, display and unknown orientation before paint', async () => {
  const bad = [
    { codedWidth: 0 },
    { codedWidth: 4097 },
    { codedWidth: 1.5 },
    { codedWidth: NaN },
    { codedWidth: 4096, codedHeight: 4096 },
    { codedHeight: Infinity },
    { visibleRect: null },
    { visibleRect: { x: -0, y: 0, width: 32, height: 32 } },
    { visibleRect: { x: 1, y: 0, width: 32, height: 32 } },
    { visibleRect: { x: 0, y: 1, width: 32, height: 32 } },
    { visibleRect: { x: 0, y: 0, width: 31, height: 32 } },
    { visibleRect: { x: 0, y: 0, width: 32, height: 31 } },
    { visibleRect: { x: NaN, y: 0, width: 32, height: 32 } },
    { visibleRect: { x: 0, y: 0, width: 32.5, height: 32 } },
    { displayWidth: 31 },
    { displayHeight: 33 },
    { displayWidth: NaN },
    { displayWidth: 4097 },
    { rotation: 90 },
    { rotation: -0 },
    { rotation: undefined },
    { flip: true },
    { flip: undefined },
  ];
  for (const extra of bad) {
    const r = await configuredRig();
    r.send('KEY');
    let closes = 0;
    r.decoders[0].output({
      timestamp: 2000,
      codedWidth: 32,
      codedHeight: 32,
      visibleRect: { x: 0, y: 0, width: 32, height: 32 },
      displayWidth: 32,
      displayHeight: 32,
      rotation: 0,
      flip: false,
      close() {
        closes++;
      },
      ...extra,
    });
    const snap = r.owner.snapshot();
    assert.equal(snap.failureReason, 'OUTPUT_GEOMETRY');
    assert.equal(closes, 1);
    assert.equal(r.draws.length, 0);
    assert.equal(r.painted.length, 0);
    assert.equal(Object.keys(snap.geometryFailure).length, 16);
    assert.equal(Object.isFrozen(snap.geometryFailure), true);
    if (!Number.isSafeInteger(extra.codedWidth) && 'codedWidth' in extra)
      assert.equal(snap.geometryFailure.codedW, null);
    r.decoders[0].error();
    assert.equal(r.owner.snapshot().geometryFailure, snap.geometryFailure);
  }
});

test('SPS cropped visible content may be repacked without applying original crop offsets twice', async () => {
  const bytes = configuration({ crop: true });
  const c = parseAvcConfiguration(bytes, 28, 30);
  assert.equal(c.codedWidth, 32);
  assert.equal(c.codedHeight, 32);
  for (const [codedWidth, codedHeight, x, y] of [
    [28, 30, 0, 0],
    [48, 64, 3, 5],
  ]) {
    const r = rig();
    r.send('SESSION', { width: 28, height: 30 });
    r.send('CONFIG', { width: 28, height: 30, bytes, totalBytes: bytes.length });
    await flush();
    r.send('KEY', { width: 28, height: 30 });
    const f = {
      timestamp: 2000,
      codedWidth,
      codedHeight,
      visibleRect: { x, y, width: 28, height: 30 },
      displayWidth: 28,
      displayHeight: 30,
      rotation: 0,
      flip: false,
      close() {},
    };
    r.decoders[0].output(f);
    assert.equal(r.owner.snapshot().state, 'DISPLAYING');
    assert.deepEqual(r.draws[0], [f, 0, 0, 28, 30]);
    r.owner.close();
  }
});

// These tests execute createTileVideoDecoder, substituting native WebCodecs, Canvas
// and clocks only. They do not establish native decoder or physical presentation evidence.
const counterKeys = [
  'admitted',
  'submitted',
  'drawn',
  'discarded',
  'waitingKey',
  'reset',
  'stopped',
  'hidden',
  'outstanding',
  'pending',
  'held',
];
function accounting(r, expected = {}) {
  const s = r.owner.accounting();
  assert.notEqual(s, null, 'accounting must remain available');
  assert.equal(Object.isFrozen(s), true);
  assert.equal(s.scope, 'RENDERER_CANVAS');
  for (const key of counterKeys) {
    assert.equal(Number.isSafeInteger(s[key]), true, `${key} is a safe integer`);
    assert.ok(s[key] >= 0, `${key} is nonnegative`);
  }
  assert.equal(s.admitted, s.drawn + s.discarded + s.outstanding);
  assert.equal(s.discarded, s.waitingKey + s.reset + s.stopped + s.hidden);
  assert.ok(s.submitted <= s.admitted);
  assert.ok(s.drawn <= s.submitted);
  assert.ok(s.outstanding <= 3, 'accounting retains at most three admitted delivery identities');
  assert.ok(s.pending <= 2, 'pending is a bounded queue, not a displayed-frame total');
  assert.ok(s.held <= 1, 'at most one delivery is held');
  for (const [key, value] of Object.entries(expected)) assert.equal(s[key], value, key);
  return s;
}

test('accounting distinguishes admission, API submissions, successful draws and immutable captures', async () => {
  const r = rig();
  const empty = accounting(r, Object.fromEntries(counterKeys.map((key) => [key, 0])));
  assert.equal(empty.width, null);
  assert.equal(empty.height, null);
  r.send('SESSION');
  accounting(r, { admitted: 0 });
  r.send('CONFIG');
  accounting(r, { admitted: 0 });
  await flush();
  const key = r.send('KEY');
  const queued = accounting(r, {
    admitted: 1,
    submitted: 1,
    drawn: 0,
    discarded: 0,
    outstanding: 1,
    pending: 1,
    held: 0,
    width: null,
    height: null,
  });
  r.setNow(7);
  assert.equal(r.frame(r.decoders[0], key.ptsUs).closed, 1);
  const drawn = accounting(r, {
    admitted: 1,
    submitted: 1,
    drawn: 1,
    discarded: 0,
    outstanding: 0,
    pending: 0,
    width: 32,
    height: 32,
    observedAt: 7,
  });
  assert.notEqual(drawn, queued);
  assert.equal(queued.drawn, 0);
  assert.equal(queued.outstanding, 1);
  assert.equal(empty.admitted, 0);
  assert.throws(() => {
    drawn.drawn = 999;
  }, TypeError);
  const delta = r.send('DELTA');
  accounting(r, { admitted: 2, submitted: 2, drawn: 1, outstanding: 1 });
  r.frame(r.decoders[0], delta.ptsUs);
  accounting(r, { admitted: 2, submitted: 2, drawn: 2, discarded: 0, outstanding: 0 });
  assert.equal(r.painted.length, 2);
  r.owner.close();
});

test('pre-key deltas settle once as waiting-key discards and never call decode', async () => {
  const r = await configuredRig();
  for (let i = 1; i <= 4; i++) {
    r.send('DELTA');
    accounting(r, {
      admitted: i,
      submitted: 0,
      drawn: 0,
      discarded: i,
      waitingKey: i,
      reset: 0,
      stopped: 0,
      outstanding: 0,
      pending: 0,
    });
  }
  assert.equal(r.decoders[0].chunks.length, 0);
  assert.equal(r.consumed.length, 6);
  const key = r.send('KEY');
  r.frame(r.decoders[0], key.ptsUs);
  accounting(r, { admitted: 5, submitted: 1, drawn: 1, discarded: 4, waitingKey: 4 });
  r.owner.close();
  accounting(r, { stopped: 0 });
});

test('pressure-held admission is counted before submission and drains within the fixed three records', async () => {
  const r = await configuredRig();
  const deliveries = [r.send('KEY'), r.send('DELTA'), r.send('DELTA')];
  const held = accounting(r, {
    admitted: 3,
    submitted: 2,
    drawn: 0,
    discarded: 0,
    outstanding: 3,
    pending: 2,
    held: 1,
  });
  assert.equal(r.consumed.length, 4);
  r.setPaintHook(() => {
    accounting(r, { admitted: 3, submitted: 2, drawn: 1, outstanding: 2, pending: 2, held: 1 });
  });
  r.frame(r.decoders[0], deliveries[0].ptsUs);
  r.setPaintHook(null);
  accounting(r, { admitted: 3, submitted: 3, drawn: 1, outstanding: 2, pending: 2, held: 0 });
  assert.equal(r.consumed.length, 5);
  for (const v of deliveries.slice(1)) r.frame(r.decoders[0], v.ptsUs);
  accounting(r, { admitted: 3, submitted: 3, drawn: 3, outstanding: 0, pending: 0, held: 0 });
  assert.equal(held.outstanding, 3);
  for (let cycle = 0; cycle < 32; cycle++) {
    const batch = [r.send('DELTA'), r.send('DELTA'), r.send('DELTA')];
    accounting(r, { outstanding: 3, pending: 2, held: 1 });
    for (const v of batch) {
      r.frame(r.decoders[0], v.ptsUs);
      accounting(r);
    }
  }
  accounting(r, { admitted: 99, submitted: 99, drawn: 99, discarded: 0, outstanding: 0 });
  r.owner.close();
});

test('decoder API queue pressure holds an admitted key without miscounting submission', async () => {
  const r = await configuredRig();
  r.decoders[0].decodeQueueSize = 2;
  r.send('KEY');
  accounting(r, { admitted: 1, submitted: 0, drawn: 0, outstanding: 1, pending: 0, held: 1 });
  assert.equal(r.decoders[0].chunks.length, 0);
  assert.equal(r.consumed.length, 2);
  r.owner.close();
  accounting(r, { admitted: 1, submitted: 0, discarded: 1, stopped: 1, outstanding: 0, held: 0 });
});

for (const kind of ['CONFIG', 'SESSION']) {
  test(`${kind} reset discards unresolved submissions once and old callbacks cannot settle new records`, async () => {
    const r = await configuredRig();
    const key = r.send('KEY');
    r.send('DELTA');
    const old = r.decoders[0];
    if (kind === 'CONFIG') r.send('CONFIG', { configId: 2 });
    else {
      r.send('SESSION', { geometryId: 2 });
      r.send('CONFIG', { geometryId: 2, configId: 2 });
    }
    await flush();
    accounting(r, {
      admitted: 2,
      submitted: 2,
      drawn: 0,
      discarded: 2,
      reset: 2,
      stopped: 0,
      outstanding: 0,
      pending: 0,
      width: null,
      height: null,
    });
    const extra = { configId: 2, ...(kind === 'SESSION' ? { geometryId: 2 } : {}) };
    const fresh = r.send('KEY', extra);
    const before = accounting(r, { admitted: 3, submitted: 3, outstanding: 1 });
    assert.equal(r.frame(old, key.ptsUs).closed, 1);
    old.error();
    assert.deepEqual(accounting(r), before);
    assert.equal(r.owner.snapshot().closed, false);
    r.frame(r.decoders[1], fresh.ptsUs);
    accounting(r, { admitted: 3, submitted: 3, drawn: 1, discarded: 2, reset: 2, outstanding: 0 });
    r.owner.close();
  });
}

test('Stop retires two pending and one held delivery; stale callbacks and repeated close add nothing', async () => {
  const r = await configuredRig();
  const first = r.send('KEY');
  r.send('DELTA');
  r.send('DELTA');
  accounting(r, { admitted: 3, submitted: 2, outstanding: 3, pending: 2, held: 1 });
  const d = r.decoders[0];
  r.owner.close();
  const closed = accounting(r, {
    admitted: 3,
    submitted: 2,
    drawn: 0,
    discarded: 3,
    stopped: 3,
    reset: 0,
    outstanding: 0,
    pending: 0,
    held: 0,
  });
  const calls = { ...r.calls };
  for (let i = 0; i < 5; i++) {
    r.owner.close();
    d.error();
    assert.equal(r.frame(d, first.ptsUs).closed, 1);
    r.send('KEY');
    assert.deepEqual(accounting(r), closed);
  }
  assert.equal(r.calls.clear, calls.clear);
  assert.equal(r.painted.length, 0);
  assert.equal(r.timers.size, 0);
  assert.equal(r.owner.snapshot().failureReason, null);
});

for (const [name, extra] of [
  ['foreign video', { videoId: '00000000-0000-4000-8000-000000000002' }],
  ['delivery sequence', { deliveryId: 99 }],
  ['invalid envelope version', { version: 2 }],
  ['extra envelope property', { other: true }],
  ['invalid byte length', { totalBytes: 999 }],
  ['invalid media kind', { kind: 'OTHER' }],
]) {
  test(`receive rejection (${name}) never admits the rejected delivery`, async () => {
    const r = await configuredRig();
    r.send('KEY');
    r.send('DELTA', extra);
    accounting(r, { admitted: 1, submitted: 1, discarded: 1, stopped: 1, outstanding: 0 });
    assert.equal(r.owner.snapshot().failureReason, 'DELIVERY');
    assert.equal(r.decoders[0].chunks.length, 1);
  });
}

test('busy capability and occupied-held receive gates reject media before admission', async () => {
  let resolve;
  const busy = rig({ support: () => new Promise((done) => (resolve = done)) });
  busy.send('SESSION');
  busy.send('CONFIG');
  busy.send('KEY');
  accounting(busy, { admitted: 0, submitted: 0, discarded: 0, outstanding: 0 });
  resolve(true);
  await flush();
  assert.equal(busy.decoders.length, 0);
  assert.equal(busy.owner.snapshot().failureReason, 'DELIVERY');
  const held = await configuredRig();
  held.send('KEY');
  held.send('DELTA');
  held.send('DELTA');
  held.send('DELTA');
  accounting(held, { admitted: 3, submitted: 2, discarded: 3, stopped: 3, outstanding: 0 });
  assert.equal(held.owner.snapshot().failureReason, 'DELIVERY');
});

for (const [name, extra, reason] of [
  ['wrong geometry', { geometryId: 2 }, 'DELIVERY'],
  ['wrong dimensions', { width: 16 }, 'DELIVERY'],
  ['wrong packet sequence', { packetId: 99 }, 'DELIVERY'],
  ['wrong configuration', { configId: 2 }, 'DELIVERY'],
  ['malformed AVC contents', { bytes: Uint8Array.of(0), totalBytes: 1 }, 'SUBMISSION'],
]) {
  test(`wire rejection (${name}) never admits malformed media or calls decode`, async () => {
    const r = await configuredRig();
    r.send('KEY', extra);
    accounting(r, {
      admitted: 0,
      submitted: 0,
      drawn: 0,
      discarded: 0,
      stopped: 0,
      outstanding: 0,
    });
    assert.equal(r.owner.snapshot().failureReason, reason);
    assert.equal(r.decoders[0].chunks.length, 0);
  });
}

test('duplicate PTS is rejected before admission and retires the earlier submission', async () => {
  const r = await configuredRig();
  const key = r.send('KEY');
  r.send('DELTA', { ptsUs: key.ptsUs });
  accounting(r, { admitted: 1, submitted: 1, drawn: 0, discarded: 1, stopped: 1, outstanding: 0 });
  assert.equal(r.owner.snapshot().failureReason, 'DELIVERY');
});

test('submission attempts are recorded exactly at decode, including throws and synchronous errors', async () => {
  for (const failure of ['chunk', 'decode', 'native']) {
    const r = await configuredRig();
    if (failure === 'chunk')
      r.setChunkHook(() => {
        accounting(r, { admitted: 1, submitted: 0, outstanding: 1 });
        throw Error('synthetic chunk');
      });
    else
      r.setDecodeHook((d) => {
        accounting(r, { admitted: 1, submitted: 1, outstanding: 1, pending: 1 });
        if (failure === 'native') d.error();
        else throw Error('synthetic decode');
      });
    r.send('KEY');
    accounting(r, {
      admitted: 1,
      submitted: failure === 'chunk' ? 0 : 1,
      drawn: 0,
      discarded: 1,
      stopped: 1,
      outstanding: 0,
    });
    assert.equal(
      r.owner.snapshot().failureReason,
      failure === 'native' ? 'NATIVE_ERROR' : 'SUBMISSION',
    );
  }
});

test('asynchronous native error settles all pending and held identities without counting new submissions', async () => {
  const r = await configuredRig();
  const key = r.send('KEY');
  r.send('DELTA');
  r.send('DELTA');
  r.decoders[0].error();
  const failed = accounting(r, { admitted: 3, submitted: 2, drawn: 0, discarded: 3, stopped: 3 });
  assert.equal(r.frame(r.decoders[0], key.ptsUs).closed, 1);
  assert.deepEqual(accounting(r), failed);
  assert.equal(r.owner.snapshot().failureReason, 'NATIVE_ERROR');
});

test('throwing draw discards all admitted work, while failed PAINTED acknowledgment preserves successful draw', async () => {
  for (const failure of ['draw', 'ack', 'close']) {
    const r = await configuredRig();
    const key = r.send('KEY');
    r.send('DELTA');
    r.send('DELTA');
    r.setDrawHook(() => {
      accounting(r, { drawn: 0, outstanding: 3 });
      if (failure === 'draw') throw Error('synthetic draw');
    });
    r.setPaintHook(() => {
      accounting(r, { drawn: 1, outstanding: 2 });
      if (failure === 'ack') throw Error('synthetic ack');
    });
    let closes = 0;
    r.frame(r.decoders[0], key.ptsUs, {
      close() {
        closes++;
        if (failure === 'close') throw Error('synthetic close');
      },
    });
    accounting(r, {
      admitted: 3,
      submitted: 2,
      drawn: failure === 'draw' ? 0 : 1,
      discarded: failure === 'draw' ? 3 : 2,
      stopped: failure === 'draw' ? 3 : 2,
      outstanding: 0,
      pending: 0,
      held: 0,
    });
    assert.equal(closes, 1);
    assert.equal(
      r.owner.snapshot().failureReason,
      { draw: 'PAINT', ack: 'PAINT_ACK', close: 'FRAME_CLOSE' }[failure],
    );
  }
});

for (const terminal of ['Stop', 'CONFIG', 'SESSION']) {
  for (const throws of [false, true]) {
    test(`reentrant ${terminal} during ${throws ? 'throwing' : 'successful'} draw settles the in-flight record exactly once`, async () => {
      const r = await configuredRig();
      const key = r.send('KEY');
      r.send('DELTA');
      let inside;
      r.setDrawHook(() => {
        accounting(r, { admitted: 2, submitted: 2, drawn: 0, outstanding: 2 });
        if (terminal === 'Stop') r.owner.close();
        else if (terminal === 'CONFIG') r.send('CONFIG', { configId: 2 });
        else r.send('SESSION', { geometryId: 2 });
        inside = accounting(r, {
          admitted: 2,
          drawn: 0,
          discarded: 1,
          outstanding: 1,
          pending: 0,
          held: 0,
          reset: terminal === 'Stop' ? 0 : 1,
          stopped: terminal === 'Stop' ? 1 : 0,
        });
        r.owner.close();
        accounting(r, { discarded: 1, outstanding: 1 });
        if (throws) throw Error('synthetic reentrant draw');
      });
      assert.equal(r.frame(r.decoders[0], key.ptsUs).closed, 1);
      await flush();
      const result = accounting(r, {
        admitted: 2,
        submitted: 2,
        drawn: throws ? 0 : 1,
        discarded: throws ? 2 : 1,
        outstanding: 0,
        pending: 0,
        reset: terminal === 'Stop' ? 0 : throws ? 2 : 1,
        stopped: terminal === 'Stop' ? (throws ? 2 : 1) : 0,
      });
      assert.equal(inside.outstanding, 1);
      assert.equal(r.painted.length, 0);
      assert.equal(r.owner.snapshot().closed, true);
      r.owner.close();
      r.frame(r.decoders[0], key.ptsUs);
      assert.deepEqual(accounting(r), result);
    });
  }
}

test('reentrant replacement decoder owns independent counts even when the old draw returns successfully', async () => {
  const old = await configuredRig();
  const replacement = await configuredRig();
  const key = old.send('KEY');
  old.send('DELTA');
  old.setDrawHook(() => {
    old.owner.close();
    const fresh = replacement.send('KEY');
    replacement.frame(replacement.decoders[0], fresh.ptsUs);
    accounting(old, { drawn: 0, discarded: 1, outstanding: 1 });
    accounting(replacement, { admitted: 1, submitted: 1, drawn: 1, discarded: 0, outstanding: 0 });
  });
  old.frame(old.decoders[0], key.ptsUs);
  accounting(old, { admitted: 2, submitted: 2, drawn: 1, discarded: 1, stopped: 1 });
  const expected = accounting(replacement);
  old.decoders[0].error();
  old.frame(old.decoders[0], key.ptsUs);
  assert.deepEqual(accounting(replacement), expected);
  replacement.owner.close();
});

test('synchronous decode output can settle before decode returns, and a later decode throw cannot undo a draw', async () => {
  for (const throws of [false, true]) {
    const r = await configuredRig();
    r.setDecodeHook((d, c) => {
      accounting(r, { admitted: 1, submitted: 1, drawn: 0, outstanding: 1 });
      assert.equal(r.frame(d, c.timestamp).closed, 1);
      accounting(r, { admitted: 1, submitted: 1, drawn: 1, outstanding: 0, pending: 0 });
      if (throws) throw Error('synthetic throw after synchronous output');
    });
    r.send('KEY');
    accounting(r, {
      admitted: 1,
      submitted: 1,
      drawn: 1,
      discarded: 0,
      outstanding: 0,
      pending: 0,
    });
    assert.equal(r.owner.snapshot().failureReason, throws ? 'SUBMISSION' : null);
    assert.equal(r.painted.length, 1);
    assert.equal(r.owner.snapshot().state, throws ? 'DECODE_FAILED' : 'DISPLAYING');
    r.owner.close();
  }
});

test('duplicate output never credits the same admitted delivery twice', async () => {
  const r = await configuredRig();
  const key = r.send('KEY');
  r.frame(r.decoders[0], key.ptsUs);
  r.send('DELTA');
  assert.equal(r.frame(r.decoders[0], key.ptsUs).closed, 1);
  accounting(r, { admitted: 2, submitted: 2, drawn: 1, discarded: 1, stopped: 1, outstanding: 0 });
  assert.equal(r.owner.snapshot().failureReason, 'OUTPUT_IDENTITY');
});

test('accounting reads sample only the monotonic observation clock and never update decoder deadlines', async () => {
  const r = await configuredRig();
  const calls = { ...r.calls };
  const states = [...r.states];
  const timers = [...r.timers.values()];
  for (let i = 1; i <= 12; i++) {
    r.setNow(i * 100);
    accounting(r, { observedAt: i * 100, admitted: 0 });
  }
  assert.equal(r.calls.now, calls.now + 12);
  for (const key of ['current', 'set', 'clear']) assert.equal(r.calls[key], calls[key], key);
  assert.deepEqual(r.states, states);
  assert.deepEqual([...r.timers.values()], timers);
  assert.equal(timers[0].ms, 30000);
  // If accounting had advanced the failure-sensitive media clock, this delivery
  // would stop with CLOCK. Observation alone is deliberately not media time.
  r.setNow(1);
  const key = r.send('KEY');
  assert.equal(r.owner.snapshot().closed, false);
  r.frame(r.decoders[0], key.ptsUs);
  assert.equal(r.owner.snapshot().state, 'DISPLAYING');
  assert.equal(r.owner.accounting(), null);
  r.owner.close();
});

for (const failure of ['backward', 'NaN', 'Infinity', 'throw']) {
  test(`observation ${failure} latches accounting unavailable without stopping media or rearming timers`, async () => {
    const r = await configuredRig();
    r.setNow(100);
    accounting(r, { observedAt: 100 });
    const key = r.send('KEY');
    const snapshot = r.owner.snapshot();
    const timers = [...r.timers.entries()];
    const calls = { ...r.calls };
    if (failure === 'throw') r.setNowError(Error('synthetic observation clock'));
    else r.setNow({ backward: 99, NaN: NaN, Infinity: Infinity }[failure]);
    assert.equal(r.owner.accounting(), null);
    assert.deepEqual(r.owner.snapshot(), snapshot);
    assert.deepEqual([...r.timers.entries()], timers);
    assert.equal(r.calls.set, calls.set);
    assert.equal(r.calls.clear, calls.clear);
    r.setNowError(null);
    r.setNow(101);
    const reads = r.calls.now;
    assert.equal(r.owner.accounting(), null);
    assert.equal(r.calls.now, reads, 'latched unavailable reads do not touch clocks');
    assert.equal(r.frame(r.decoders[0], key.ptsUs).closed, 1);
    const delta = r.send('DELTA');
    r.frame(r.decoders[0], delta.ptsUs);
    assert.equal(r.owner.snapshot().state, 'DISPLAYING');
    assert.equal(r.owner.snapshot().failureReason, null);
    assert.equal(r.painted.length, 2);
    assert.equal(r.decoders[0].chunks.length, 2);
    assert.equal(r.owner.accounting(), null);
    r.owner.close();
  });
}

// Explicit SOURCE-ONLY substitutions below enter unreachable counter boundaries
// in a copy of this exact decoder module. No production option, exported hook,
// native runtime authority, original file write or media-algorithm replacement is added.
async function accountingSourceFactory({ seed = {}, storage = false, entry = '' } = {}) {
  const url = new URL('../src/video-decoder.ts', import.meta.url);
  let source = readFileSync(url, 'utf8');
  const replaceOnce = (before, after) => {
    assert.equal(
      source.split(before).length,
      2,
      `source substitution must have one exact target: ${before}`,
    );
    source = source.replace(before, after);
  };
  for (const [key, value] of Object.entries(seed))
    replaceOnce(`    ${key}: 0,`, `    ${key}: ${value},`);
  if (entry)
    replaceOnce('  let accountingAvailable = true,', `${entry}\n  let accountingAvailable = true,`);
  if (storage)
    replaceOnce(
      '    accounting: accountingSnapshot,',
      '    accounting: accountingSnapshot,\n    accountingStorage: () => accounting.size,',
    );
  for (const dependency of [
    './h264-video.ts',
    './video-media-contract.ts',
    './video-presentation-contract.ts',
  ])
    replaceOnce(`from '${dependency}'`, `from '${new URL(dependency, url).href}'`);
  const code = stripTypeScriptTypes(source, { mode: 'strip' });
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`))
    .createTileVideoDecoder;
}

test('source-only near-safe-integer state reaches the exact bound then latches unavailable without changing media', async () => {
  const r = await configuredRig({
    factory: await accountingSourceFactory({
      seed: {
        admitted: Number.MAX_SAFE_INTEGER - 1,
        submitted: Number.MAX_SAFE_INTEGER - 1,
        drawn: Number.MAX_SAFE_INTEGER - 1,
      },
      storage: true,
    }),
  });
  const first = r.send('KEY');
  accounting(r, {
    admitted: Number.MAX_SAFE_INTEGER,
    drawn: Number.MAX_SAFE_INTEGER - 1,
    submitted: Number.MAX_SAFE_INTEGER,
    outstanding: 1,
  });
  r.frame(r.decoders[0], first.ptsUs);
  accounting(r, {
    admitted: Number.MAX_SAFE_INTEGER,
    drawn: Number.MAX_SAFE_INTEGER,
    outstanding: 0,
  });
  const second = r.send('DELTA');
  assert.equal(r.owner.accounting(), null);
  assert.equal(r.owner.accountingStorage(), 0);
  assert.equal(r.owner.snapshot().closed, false);
  assert.equal(r.frame(r.decoders[0], second.ptsUs).closed, 1);
  assert.equal(r.painted.length, 2);
  assert.equal(r.owner.snapshot().state, 'DISPLAYING');
  r.owner.close();
});

for (const key of [
  'admitted',
  'submitted',
  'drawn',
  'discarded',
  'waitingKey',
  'reset',
  'stopped',
  'hidden',
]) {
  test(`source-only ${key} counter overflow clears accounting storage without adding media effects`, async () => {
    const boundary = await accountingSourceFactory({
      seed: { [key]: Number.MAX_SAFE_INTEGER },
      storage: true,
    });
    const measured = await configuredRig({ factory: boundary });
    const control = await configuredRig();
    for (const r of [measured, control]) {
      if (key === 'discarded' || key === 'waitingKey') r.send('DELTA');
      else {
        const first = r.send('KEY');
        if (key === 'drawn') r.frame(r.decoders[0], first.ptsUs);
        else if (key === 'reset') {
          r.send('CONFIG', { configId: 2 });
          await flush();
        } else if (key === 'stopped') r.owner.close();
        else if (key === 'hidden') r.fence('HIDDEN');
      }
    }
    assert.equal(measured.owner.accounting(), null);
    assert.equal(measured.owner.accountingStorage(), 0);
    const state = (r) => ({
      lifecycle: r.owner.snapshot(),
      states: r.states,
      consumed: r.consumed,
      painted: r.painted,
      chunks: r.decoders.map((d) => d.chunks),
      closed: r.decoders.map((d) => d.closed),
      timers: [...r.timers.values()].map((t) => t.ms),
      timerSets: r.calls.set,
      timerClears: r.calls.clear,
    });
    assert.deepEqual(state(measured), state(control));
    for (const r of [measured, control]) {
      if (!r.owner.snapshot().closed && key !== 'hidden') {
        const d = r.decoders.at(-1);
        for (const chunk of [...d.chunks])
          if (!r.painted.some((p) => p.ptsUs === chunk.timestamp)) r.frame(d, chunk.timestamp);
        const fresh = r.send('KEY', key === 'reset' ? { configId: 2 } : {});
        r.frame(d, fresh.ptsUs);
      }
      r.owner.close();
      r.owner.close();
      r.decoders[0].error();
      assert.equal(r.frame(r.decoders[0], 2000).closed, 1);
    }
    assert.equal(measured.owner.accounting(), null);
    assert.equal(measured.owner.accountingStorage(), 0);
    assert.deepEqual(state(measured), state(control));
  });
}

test('source-only inconsistent equation disables only telemetry and callbacks continue safely', async () => {
  const r = await configuredRig({
    factory: await accountingSourceFactory({ seed: { admitted: 1 }, storage: true }),
  });
  const before = r.owner.snapshot();
  assert.equal(r.owner.accounting(), null);
  assert.equal(r.owner.accountingStorage(), 0);
  assert.deepEqual(r.owner.snapshot(), before);
  const key = r.send('KEY');
  r.frame(r.decoders[0], key.ptsUs);
  assert.equal(r.owner.snapshot().state, 'DISPLAYING');
  assert.equal(r.owner.accounting(), null);
  r.owner.close();
});

test('source-only retained in-flight record exercises the real capacity-three unavailable path without dropping held media', async () => {
  const r = await configuredRig({
    factory: await accountingSourceFactory({
      seed: { admitted: 1 },
      storage: true,
      entry: '  accounting.set(0, { drawing: true, deferred: null });',
    }),
  });
  const first = r.send('KEY');
  const second = r.send('DELTA');
  accounting(r, { admitted: 3, submitted: 2, outstanding: 3, pending: 2, held: 0 });
  const held = r.send('DELTA');
  assert.equal(r.owner.accounting(), null);
  assert.equal(r.owner.accountingStorage(), 0);
  assert.equal(r.owner.snapshot().closed, false);
  assert.equal(r.owner.snapshot().held, true);
  for (const v of [first, second, held]) r.frame(r.decoders[0], v.ptsUs);
  assert.equal(r.owner.snapshot().state, 'DISPLAYING');
  assert.equal(r.owner.snapshot().pending, 0);
  assert.equal(r.owner.snapshot().held, false);
  assert.equal(r.decoders[0].chunks.length, 3);
  assert.equal(r.painted.length, 3);
  assert.equal(r.consumed.length, 5);
  assert.equal(r.owner.accounting(), null);
  r.owner.close();
});

test('hidden decoder retires pending and held work once, drains bounded traffic, then requires a fresh IDR', async () => {
  const r = await configuredRig();
  const old = r.send('KEY');
  r.send('DELTA');
  const held = r.send('DELTA');
  accounting(r, { admitted: 3, submitted: 2, outstanding: 3, pending: 2, held: 1 });
  r.fence('HIDDEN');
  accounting(r, { admitted: 3, hidden: 3, outstanding: 0, pending: 0, held: 0 });
  assert.equal(r.consumed.filter((v) => v.deliveryId === held.deliveryId).length, 1);
  assert.equal(r.owner.snapshot().state, 'PAUSED_HIDDEN');
  for (let i = 0; i < 20; i++) r.send(i % 3 ? 'DELTA' : 'KEY');
  accounting(r, { admitted: 23, hidden: 23, submitted: 2, outstanding: 0 });
  assert.equal(r.decoders.length, 1);
  r.fence('VISIBLE');
  r.send('DELTA');
  accounting(r, { admitted: 24, waitingKey: 1, outstanding: 0 });
  assert.equal(r.owner.snapshot().state, 'WAITING_FRESH_KEY');
  const fresh = r.send('KEY');
  await flush();
  r.frame(r.decoders[1], fresh.ptsUs);
  accounting(r, { admitted: 25, submitted: 3, drawn: 1, hidden: 23, waitingKey: 1 });
  assert.equal(r.frame(r.decoders[0], old.ptsUs).closed, 1);
  assert.equal(r.owner.snapshot().state, 'DISPLAYING');
  assert.equal(new Set(r.consumed.map((v) => v.deliveryId)).size, r.consumed.length);
  r.owner.close();
});

test('stale decoder output cannot erase a newer resumed paint', async () => {
  const r = await configuredRig();
  let clears = 0;
  const original = r.canvas.getContext;
  r.canvas.getContext = (...args) => ({
    ...original(...args),
    clearRect() {
      clears++;
    },
  });
  const old = r.send('KEY');
  r.frame(r.decoders[0], old.ptsUs);
  r.fence('HIDDEN');
  r.fence('VISIBLE');
  const fresh = r.send('KEY');
  await flush();
  r.frame(r.decoders[1], fresh.ptsUs);
  const before = clears;
  assert.equal(r.frame(r.decoders[0], old.ptsUs).closed, 1);
  assert.equal(clears, before, 'stale output must close without touching the new canvas');
  assert.equal(r.owner.snapshot().state, 'DISPLAYING');
  assert.equal(r.painted.length, 2);
  r.owner.close();
});

for (const rejection of [false, true]) {
  test(`hidden CONFIG support ${rejection ? 'rejection' : 'resolution'} stays bounded and cannot steal fresh-key ownership`, async () => {
    const checks = [];
    const r = rig({
      support: () => new Promise((resolve, reject) => checks.push({ resolve, reject })),
    });
    r.send('SESSION');
    const config = r.send('CONFIG');
    assert.equal(checks.length, 1);
    r.fence('HIDDEN');
    assert.equal(r.consumed.filter((v) => v.deliveryId === config.deliveryId).length, 1);
    r.fence('VISIBLE');
    const abandoned = r.send('KEY');
    await flush();
    assert.equal(r.owner.snapshot().held, true);
    r.fence('HIDDEN');
    assert.equal(r.consumed.filter((v) => v.deliveryId === abandoned.deliveryId).length, 1);
    r.fence('VISIBLE');
    const fresh = r.send('KEY');
    await flush();
    assert.equal(checks.length, 1, 'invalidating a check does not cancel its promise');
    if (rejection) checks[0].reject(Error('obsolete support'));
    else checks[0].resolve(true);
    await flush();
    assert.equal(checks.length, 2);
    assert.equal(r.decoders.length, 0);
    assert.equal(r.owner.snapshot().closed, false);
    assert.equal(
      r.consumed.some((v) => v.deliveryId === fresh.deliveryId),
      false,
    );
    checks[1].resolve(true);
    await flush();
    assert.equal(r.decoders.length, 1);
    assert.equal(r.decoders[0].chunks.length, 1);
    r.frame(r.decoders[0], fresh.ptsUs);
    accounting(r, { admitted: 2, submitted: 1, drawn: 1, hidden: 1, outstanding: 0 });
    assert.equal(new Set(r.consumed.map((v) => v.deliveryId)).size, r.consumed.length);
    r.owner.close();
  });
}

test('hide before first paint never suspends the original startup deadline', async () => {
  const r = await configuredRig();
  r.setNow(29000);
  r.fence('HIDDEN');
  assert.equal([...r.timers.values()][0].ms, 1000);
  r.setNow(30000);
  [...r.timers.values()][0].fn();
  assert.equal(r.owner.snapshot().failureReason, 'DEADLINE');
  assert.equal(r.owner.snapshot().closed, true);
});

test('hide and repeated fences preserve the remaining visible second instead of renewing it', async () => {
  const r = await configuredRig();
  const first = r.send('KEY');
  r.frame(r.decoders[0], first.ptsUs);
  r.setNow(29000);
  r.fence('HIDDEN');
  assert.equal(r.timers.size, 0);
  r.setNow(100000);
  r.fence('VISIBLE');
  assert.equal([...r.timers.values()][0].ms, 1000);
  r.send('CONFIG', { configId: 2 });
  await flush();
  r.fence('HIDDEN');
  r.fence('VISIBLE');
  assert.equal([...r.timers.values()][0].ms, 1000);
  r.setNow(101000);
  [...r.timers.values()][0].fn();
  assert.equal(r.owner.snapshot().failureReason, 'DEADLINE');
});

for (const throws of [false, true]) {
  test(`hide during ${throws ? 'failed' : 'successful'} draw settles once and cannot publish PAINTED`, async () => {
    const r = await configuredRig();
    const key = r.send('KEY');
    r.send('DELTA');
    const canvasEvents = [];
    const original = r.canvas.getContext;
    r.canvas.getContext = (...args) => ({
      ...original(...args),
      clearRect() {
        canvasEvents.push('clear');
      },
    });
    r.setDrawHook(() => {
      r.fence('HIDDEN');
      canvasEvents.push('draw-after-hide');
      if (throws) throw Error('synthetic hidden draw');
    });
    assert.equal(r.frame(r.decoders[0], key.ptsUs).closed, 1);
    assert.equal(
      canvasEvents.at(-1),
      'clear',
      'an invalidated draw must clear after returning or throwing',
    );
    accounting(r, {
      admitted: 2,
      submitted: 2,
      drawn: throws ? 0 : 1,
      hidden: throws ? 2 : 1,
      outstanding: 0,
    });
    assert.equal(r.owner.snapshot().state, 'PAUSED_HIDDEN');
    assert.equal(r.painted.length, 0);
    r.owner.close();
  });
}

test('hidden media still rejects a KEY label containing a delta NAL', async () => {
  const r = await configuredRig();
  r.fence('HIDDEN');
  r.send('KEY', { bytes: media(false), totalBytes: media(false).length });
  assert.equal(r.owner.snapshot().failureReason, 'SUBMISSION');
  accounting(r, { admitted: 0, hidden: 0 });
});

test('visible frontier rejects an already assembling KEY but admits a later same-config IDR', async () => {
  const r = await configuredRig();
  r.fence('HIDDEN');
  r.fence('VISIBLE', { afterPacketId: 2 });
  r.send('KEY');
  accounting(r, { admitted: 1, waitingKey: 1, submitted: 0 });
  assert.equal(r.decoders.length, 1);
  const later = r.send('KEY');
  await flush();
  r.frame(r.decoders[1], later.ptsUs);
  accounting(r, { admitted: 2, waitingKey: 1, drawn: 1 });
  r.owner.close();
});

test('nested VISIBLE fence from decoder close preserves the held delivery ACK exactly once', async () => {
  const r = await configuredRig();
  r.send('KEY');
  r.send('DELTA');
  const held = r.send('DELTA');
  accounting(r, { admitted: 3, submitted: 2, outstanding: 3, held: 1 });
  r.decoders[0].close = function () {
    this.closed = true;
    r.fence('VISIBLE');
  };
  r.fence('HIDDEN');
  assert.equal(r.owner.snapshot().closed, false);
  assert.equal(r.owner.snapshot().state, 'WAITING_FRESH_KEY');
  assert.equal(r.consumed.filter((v) => v.deliveryId === held.deliveryId).length, 1);
  accounting(r, { admitted: 3, hidden: 3, outstanding: 0, pending: 0, held: 0 });
  const fresh = r.send('KEY');
  await flush();
  assert.equal(r.decoders.length, 2);
  r.frame(r.decoders[1], fresh.ptsUs);
  assert.equal(r.owner.snapshot().state, 'DISPLAYING');
  assert.equal(new Set(r.consumed.map((v) => v.deliveryId)).size, r.consumed.length);
  r.owner.close();
});
