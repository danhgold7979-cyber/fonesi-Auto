// Actual codecs over synthetic supplied frames; no acquisition or action authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { createSuppliedScreenStability as create } from '../src/main/supplied-screen-stability.ts';
import { normalizeHierarchyXml } from '../src/main/capture-contract.ts';
import { resolveHierarchySelector } from '../src/main/hierarchy-selector.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const display = (n = 1, t = 100) => ({
  version: 1,
  evidenceId: id(n),
  deviceId: id(100),
  bindingId: id(101),
  generation: 1,
  serial: 'synthetic',
  displayId: 0,
  width: 1,
  height: 1,
  rotation: 0,
  orientationEpoch: 1,
  observedUtc: t,
  validUntilUtc: 10000,
  source: 'SYNTHETIC_TEST',
});
const context = (d) => ({
  profileId: 'test',
  appPackage: 'synthetic.app',
  appVersion: '1',
  locale: 'vi',
  appRevision: 1,
  screenRevision: 1,
  ownershipRevision: 1,
  connected: true,
  display: d,
});
const policy = {
  version: 1,
  kind: 'SUPPLIED_EXACT_EQUALITY_V1',
  minimumSamples: 2,
  stableForMs: 10,
  maximumGapMs: 20,
  timeoutMs: 100,
};
const clock = (t) => ({ monotonicMs: t, utcMs: t + 100 });
const xml = (text = 'hello') =>
  `<hierarchy rotation="0"><node index="0" class="View" package="synthetic.app" text="${text}" bounds="[0,0][1,1]" enabled="true" visible-to-user="true"/></hierarchy>`;
function crc(b) {
  let c = 0xffffffff;
  for (const v of b) {
    c ^= v;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, b) {
  const n = Buffer.from(name),
    o = Buffer.alloc(b.length + 12);
  o.writeUInt32BE(b.length);
  n.copy(o, 4);
  b.copy(o, 8);
  o.writeUInt32BE(crc(Buffer.concat([n, b])), o.length - 4);
  return o;
}
function png({ pixel = 1, level = 6, filter = 0, rgb = false } = {}) {
  const h = Buffer.alloc(13);
  h.writeUInt32BE(1);
  h.writeUInt32BE(1, 4);
  h[8] = 8;
  h[9] = rgb ? 2 : 6;
  const raw = Buffer.from(rgb ? [filter, pixel, 2, 3] : [filter, pixel, 2, 3, 4]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', h),
    chunk('IDAT', deflateSync(raw, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const frame = (n, t, options = {}) => ({
  version: 1,
  sequence: n,
  png: png(options),
  xml: xml(),
  display: display(n, t + 100),
});
function gate(p = policy) {
  const g = create(p, context(display()), clock(0));
  assert.ok(g);
  return g;
}
function feed(g, n, t, options) {
  const f = frame(n, t, options);
  return g.observe(f, context(f.display), clock(t));
}
test('decoded equality spans compression/filter changes and reaches historical STABLE only on a new frame', () => {
  const g = gate();
  const a = frame(1, 0, { level: 0 }),
    b = frame(2, 10, { level: 9, filter: 1 });
  assert.notDeepEqual(a.png, b.png);
  assert.equal(g.observe(a, context(a.display), clock(0)).state, 'WAITING');
  assert.equal(g.tick(context(a.display), clock(10)).state, 'WAITING');
  const r = g.observe(b, context(b.display), clock(10));
  assert.equal(r.state, 'STABLE');
  assert.equal(r.samplesSeen, 2);
  assert.ok(Object.isFrozen(r));
  let traps = 0;
  const hostile = new Proxy(
    {},
    {
      ownKeys() {
        traps++;
        throw Error('never');
      },
    },
  );
  assert.equal(g.observe(hostile, hostile, hostile), r);
  assert.equal(g.tick(hostile, hostile), r);
  assert.equal(g.cancel(), r);
  assert.equal(traps, 0);
});
test('pixel, XML and RGB/RGBA changes reset the exact window rather than supply variance confidence', () => {
  for (const change of ['pixel', 'xml', 'rgb']) {
    const g = gate();
    feed(g, 1, 0);
    const f = frame(
      2,
      10,
      change === 'pixel' ? { pixel: 9 } : change === 'rgb' ? { rgb: true } : {},
    );
    if (change === 'xml') f.xml = xml('changed');
    const r = g.observe(f, context(f.display), clock(10));
    assert.equal(r.code, 'CHANGED');
    assert.equal(r.consecutiveSamples, 1);
    assert.equal(r.windowStartMonotonicMs, 10);
  }
});
test('too few samples, gap and animation use one original deadline; ticks never certify a screen', () => {
  const g = gate({ ...policy, minimumSamples: 3 });
  feed(g, 1, 0);
  assert.equal(feed(g, 2, 10).state, 'WAITING');
  assert.equal(g.tick(context(display(2, 110)), clock(31)).code, 'OBSERVATION_GAP');
  assert.equal(feed(g, 3, 32).consecutiveSamples, 1);
  for (const [n, t] of [
    [4, 50],
    [5, 70],
    [6, 90],
  ])
    assert.equal(feed(g, n, t, { pixel: n }).state, 'WAITING');
  const r = g.tick(context(display(6, 190)), clock(100));
  assert.equal(r.state, 'TIMEOUT');
  assert.equal(r.deadlineMonotonicMs, 100);
  assert.equal(r.pixelSha256, null);
});
test('evidence IDs are unique across all frames, and sequence/observation time must advance', () => {
  for (const kind of ['id', 'sequence', 'time']) {
    const g = gate({ ...policy, stableForMs: 90 });
    feed(g, 1, 0);
    feed(g, 2, 1);
    const f = frame(3, 2);
    if (kind === 'id') f.display.evidenceId = id(1);
    if (kind === 'sequence') f.sequence = 2;
    if (kind === 'time') f.display.observedUtc = 101;
    assert.equal(g.observe(f, context(f.display), clock(2)).code, 'DUPLICATE_OBSERVATION');
  }
});
test('clock regression, deadline overflow, negative zero, accessors and unsupported policy refuse', () => {
  for (const patch of [
    { minimumSamples: 1 },
    { stableForMs: -0 },
    { timeoutMs: 30001 },
    { unknown: 1 },
  ])
    assert.equal(create({ ...policy, ...patch }, context(display()), clock(0)), null);
  assert.equal(
    create(policy, context(display()), { monotonicMs: Number.MAX_SAFE_INTEGER, utcMs: 100 }),
    null,
  );
  for (const time of [
    { monotonicMs: -0, utcMs: 100 },
    { monotonicMs: 0, utcMs: 99 },
  ]) {
    const g = gate();
    feed(g, 1, 1);
    assert.equal(g.tick(context(display()), time).state, 'UNAVAILABLE');
  }
  let reads = 0;
  const bad = { ...policy };
  Object.defineProperty(bad, 'minimumSamples', {
    get() {
      reads++;
      return 2;
    },
    enumerable: true,
  });
  assert.equal(create(bad, context(display()), clock(0)), null);
  assert.equal(reads, 0);
});
test('WAITING context loss refuses binding, orientation, app/navigation/ownership/source and disconnect', () => {
  const cases = [
    ['generation', 2, 'BINDING_CHANGED'],
    ['rotation', 90, 'ROTATED'],
    ['width', 2, 'ROTATED'],
    ['source', 'VALIDATED_CAPTURE', 'CONTEXT_CHANGED'],
  ];
  for (const [k, v, code] of cases) {
    const g = gate();
    feed(g, 1, 0);
    const c = context(display());
    c.display[k] = v;
    assert.equal(g.tick(c, clock(1)).code, code);
  }
  for (const k of [
    'profileId',
    'appPackage',
    'appVersion',
    'locale',
    'appRevision',
    'screenRevision',
    'ownershipRevision',
    'connected',
  ]) {
    const g = gate();
    feed(g, 1, 0);
    const c = context(display());
    c[k] = k === 'connected' ? false : typeof c[k] === 'number' ? 2 : 'other';
    assert.equal(g.tick(c, clock(1)).code, k === 'connected' ? 'DISCONNECTED' : 'CONTEXT_CHANGED');
  }
});
test('stale previous capture cannot be bridged with a new frame; future and mismatched display refuse', () => {
  const g = gate();
  const a = frame(1, 0);
  a.display.validUntilUtc = 105;
  g.observe(a, context(a.display), clock(0));
  assert.equal(feed(g, 2, 10).code, 'STALE_CAPTURE');
  const h = gate(),
    b = frame(1, 10);
  assert.equal(h.observe(b, context(b.display), clock(0)).code, 'STALE_CAPTURE');
  const j = gate(),
    c = frame(1, 0);
  assert.equal(j.observe(c, context(display(2)), clock(0)).code, 'STALE_CAPTURE');
});
test('cancel clears admitted observations, is sticky, and no late input can publish over it', () => {
  for (const begun of [false, true]) {
    const g = gate();
    if (begun) feed(g, 1, 0);
    const r = g.cancel();
    assert.equal(r.state, 'CANCELLED');
    assert.equal(r.pixelSha256, null);
    assert.equal(feed(g, 2, 10), r);
    assert.equal(g.cancel(), r);
  }
});
test('Proxy cancellation and throwing descriptor traps cannot overwrite the committed cancellation', () => {
  for (const trap of ['ownKeys', 'getOwnPropertyDescriptor']) {
    const g = gate(),
      f = frame(1, 0);
    const prox = new Proxy(f, {
      [trap](target, key) {
        g.cancel();
        if (trap === 'ownKeys') return Reflect.ownKeys(target);
        throw Error(String(key));
      },
    });
    const r = g.observe(prox, context(f.display), clock(0));
    assert.equal(r.state, 'CANCELLED');
    assert.equal(r.samplesSeen, 0);
    assert.equal(g.snapshot(), r);
  }
});
test('nested observe/tick refuses transiently and does not replace the admitted outer operation', () => {
  const g = gate(),
    f = frame(1, 0);
  let nested;
  const prox = new Proxy(f, {
    ownKeys(target) {
      nested = g.tick(context(f.display), clock(0));
      assert.equal(g.snapshot().state, 'WAITING');
      return Reflect.ownKeys(target);
    },
  });
  const r = g.observe(prox, context(f.display), clock(0));
  assert.equal(nested.code, 'REENTRANT_CALL');
  assert.equal(nested.state, 'UNAVAILABLE');
  assert.equal(r.state, 'WAITING');
  assert.equal(r.samplesSeen, 1);
  assert.equal(feed(g, 2, 10).state, 'STABLE');
});
test('malformed codecs, frame17 and caller mutation are bounded and do not create observations', () => {
  for (const kind of ['png', 'xml']) {
    const g = gate(),
      f = frame(1, 0);
    f[kind] = kind === 'png' ? Buffer.from('bad') : '<!DOCTYPE bad>';
    assert.equal(g.observe(f, context(f.display), clock(0)).code, 'INVALID_CAPTURE');
    assert.equal(g.snapshot().samplesSeen, 0);
  }
  const g = gate({ ...policy, stableForMs: 1000, timeoutMs: 2000 }),
    first = feed(g, 1, 0);
  for (let n = 2; n <= 16; n++) feed(g, n, n);
  const f = frame(17, 17);
  f.png = Buffer.from('bad');
  assert.equal(g.observe(f, context(f.display), clock(17)).code, 'OBSERVATION_LIMIT');
  assert.equal(first.samplesSeen, 1);
  assert.equal(first.state, 'WAITING');
});
test('real supplied codec/stability/selector composition never bypasses later selector freshness', () => {
  const g = gate();
  feed(g, 1, 0);
  const f = frame(2, 10);
  assert.equal(g.observe(f, context(f.display), clock(10)).state, 'STABLE');
  const n = normalizeHierarchyXml(f.xml, f.display);
  assert.equal(n.ok, true);
  const profile = {
    version: 1,
    kind: 'SUPPLIED_EXACT_V1',
    profileId: 'test',
    appPackage: 'synthetic.app',
    appVersion: '1',
    locale: 'vi',
    treeSha256: n.tree.sha256,
  };
  const current = {
    profileId: 'test',
    appPackage: 'synthetic.app',
    appVersion: '1',
    locale: 'vi',
    display: f.display,
    connected: true,
  };
  const query = { version: 1, predicates: [{ field: 'text', value: 'hello' }] };
  // Use the exact existing selector query below; no stability token/action is admitted.
  const result = resolveHierarchySelector(n.tree, profile, query, current, 110);
  assert.equal(result.status, 'UNIQUE');
  current.display = { ...f.display, evidenceId: id(9) };
  assert.equal(
    resolveHierarchySelector(n.tree, profile, query, current, 110).code,
    'STALE_CAPTURE',
  );
  assert.equal(g.snapshot().state, 'STABLE');
});
