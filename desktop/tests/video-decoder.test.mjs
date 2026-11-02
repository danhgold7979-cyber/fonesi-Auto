import test from 'node:test';
import assert from 'node:assert/strict';
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
    .u(0, 1)
    .u(vui ? 1 : 0, 1);
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
function rig({ support = async () => true } = {}) {
  let now = 0,
    current = true,
    paintHook = null;
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
      },
    }),
  };
  const owner = createTileVideoDecoder(
    {
      videoId: id,
      deviceId: id,
      generation: 1,
      deadlineUtc: 30000,
      canvas,
      current: () => current,
      onConsumed: (v) => consumed.push(v),
      onPainted: (v) => {
        painted.push(v);
        paintHook?.();
      },
      onState: (s) => states.push(s),
    },
    {
      now: () => now,
      utc: () => 0,
      set: (fn, ms) => {
        const token = {};
        timers.set(token, { fn, ms });
        return token;
      },
      clear: (t) => timers.delete(t),
      supported: support,
      chunk: (v) => v,
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
    owner.receive(v);
    return v;
  };
  const frame = (decoder, pts) => {
    const f = {
      timestamp: pts,
      codedWidth: 32,
      codedHeight: 32,
      displayWidth: 32,
      displayHeight: 32,
      closed: 0,
      close() {
        this.closed++;
      },
    };
    decoder.output(f);
    return f;
  };
  return {
    owner,
    setPaintHook: (hook) => {
      paintHook = hook;
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
