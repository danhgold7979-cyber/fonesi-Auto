import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  validateCapturePng as png,
  validateHierarchyXml as xml,
  classifyCaptureEvidence as classify,
  CAPTURE_LIMITS,
} from '../src/main/capture-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const display = () => ({
  version: 1,
  evidenceId: id(1),
  deviceId: id(2),
  bindingId: id(3),
  generation: 1,
  serial: 'synthetic-device',
  displayId: 0,
  width: 1,
  height: 1,
  rotation: 0,
  orientationEpoch: 1,
  observedUtc: 100,
  validUntilUtc: 200,
  source: 'SYNTHETIC_TEST',
});
function crc(bytes) {
  let v = 0xffffffff;
  for (const b of bytes) {
    v ^= b;
    for (let i = 0; i < 8; i++) v = (v >>> 1) ^ (v & 1 ? 0xedb88320 : 0);
  }
  return (v ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length);
  t.copy(b, 4);
  data.copy(b, 8);
  b.writeUInt32BE(crc(Buffer.concat([t, data])), data.length + 8);
  return b;
}
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function fixture({
  width = 1,
  height = 1,
  color = 6,
  depth = 8,
  interlace = 0,
  raw = Buffer.from([0, 1, 2, 3, 4]),
  packed = null,
  extra = [],
  after = [],
} = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = depth;
  header[9] = color;
  header[12] = interlace;
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    ...extra,
    chunk('IDAT', packed ?? deflateSync(raw)),
    ...after,
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const node =
  '<node index="0" class="synthetic.View" bounds="[0,0][1,1]" text="fixture" enabled="true"/>';
const hierarchy = (body = node) =>
  `<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0">${body}</hierarchy>`;
test('PNG validates physical framing CRC deflate and decoded sample hash while preserving synthetic evidence', () => {
  const d = display(),
    input = fixture();
  const result = png(input, d);
  assert.equal(result.ok, true);
  assert.equal(
    result.pixelSha256,
    createHash('sha256')
      .update(Buffer.from([1, 2, 3, 4]))
      .digest('hex'),
  );
  assert.equal(result.decodedBytes, 4);
  assert.equal(result.evidence.source, 'SYNTHETIC_TEST');
  d.serial = 'changed';
  input.fill(0);
  assert.equal(result.evidence.serial, 'synthetic-device');
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.evidence));
  assert.equal(png(fixture({ color: 2, raw: Buffer.from([0, 1, 2, 3]) }), display()).ok, true);
});
test('all five PNG row filters are actually reconstructed rather than merely header accepted', () => {
  for (let filter = 0; filter <= 4; filter++) {
    const raw = Buffer.from([0, 1, 2, 3, 4, filter, 5, 6, 7, 8]);
    const d = { ...display(), height: 2 };
    const r = png(fixture({ height: 2, raw }), d);
    assert.equal(r.ok, true);
    const expected =
      filter === 2 || filter === 4
        ? [1, 2, 3, 4, 6, 8, 10, 12]
        : filter === 3
          ? [1, 2, 3, 4, 5, 7, 8, 10]
          : [1, 2, 3, 4, 5, 6, 7, 8];
    assert.equal(r.pixelSha256, createHash('sha256').update(Buffer.from(expected)).digest('hex'));
  }
});
test('PNG rejects invalid CRC truncated/extra framing unknown critical chunks and interrupted IDAT', () => {
  const good = fixture();
  const corrupt = Buffer.from(good);
  corrupt[20] ^= 1;
  for (const b of [
    corrupt,
    good.subarray(0, -1),
    Buffer.concat([good, Buffer.from([0])]),
    fixture({ extra: [chunk('ABCD', Buffer.alloc(0))] }),
    fixture({ after: [chunk('gAMA', Buffer.from([0, 0, 0, 1])), chunk('IDAT', Buffer.alloc(0))] }),
    fixture({ after: [chunk('IHDR', Buffer.alloc(13))] }),
  ])
    assert.equal(png(b, display()).ok, false);
});
test('PNG rejects overflow unsupported encoding invalid filters truncated and trailing deflate', () => {
  for (const opts of [
    { width: 0 },
    { depth: 16 },
    { interlace: 1 },
    { color: 3 },
    { raw: Buffer.from([5, 1, 2, 3, 4]) },
    { raw: Buffer.from([0, 1, 2, 3]) },
    { raw: Buffer.alloc(100) },
    { packed: Buffer.concat([deflateSync(Buffer.from([0, 1, 2, 3, 4])), Buffer.from([0])]) },
  ])
    assert.equal(png(fixture(opts), display()).ok, false);
  assert.equal(
    png(fixture({ width: 65535, height: 65535 }), { ...display(), width: 65535, height: 65535 })
      .code,
    'CAPTURE_LIMIT',
  );
  assert.equal(png(fixture(), { ...display(), width: 2 }).code, 'DISPLAY_MISMATCH');
  for (const value of [null, {}, new Float64Array(8), new Uint8Array(new SharedArrayBuffer(80))])
    assert.equal(png(value, display()).ok, false);
});
test('hierarchy finite grammar records counts/hash without returning private attributes', () => {
  const input = hierarchy(node.replace('/>', '>') + node + '</node>');
  const r = xml(input, display());
  assert.equal(r.ok, true);
  assert.equal(r.nodeCount, 2);
  assert.equal(r.sha256, createHash('sha256').update(input).digest('hex'));
  assert.equal(JSON.stringify(r).includes('synthetic.View'), false);
  assert.equal(xml(hierarchy(''), display()).nodeCount, 0);
  assert.equal(xml(hierarchy().replaceAll('"', "'"), display()).ok, true);
});
test('hierarchy rejects DTD external/general/predefined/numeric entities explicitly, not silent expansion', () => {
  for (const input of [
    hierarchy().replace('fixture', '&amp;'),
    hierarchy().replace('fixture', '&#65;'),
    hierarchy().replace('fixture', '&unknown;'),
    '<!DOCTYPE hierarchy SYSTEM "file:///private">' + hierarchy(),
    hierarchy().replace(node, '<!--private-->'),
    hierarchy().replace(node, '<![CDATA[private]]>'),
    hierarchy().replace('fixture', '\ud800'),
    hierarchy().replace('fixture', '\0'),
    hierarchy().slice(0, -1),
    hierarchy() + '<node/>',
    '</undefined>' + hierarchy(),
  ])
    assert.equal(xml(input, display()).ok, false);
});
test('hierarchy bounds mismatched tags duplicate attributes malformed booleans and rotation fail closed', () => {
  for (const body of [
    node.replace(' index="0"', ' index="0" index="1"'),
    node.replace('enabled="true"', 'enabled="yes"'),
    node.replace('[0,0][1,1]', '[2,0][1,1]'),
    node.replace('class="synthetic.View"', 'unknown="x"'),
    '<node index="0" class="x" bounds="[0,0][1,1]"></hierarchy>',
  ])
    assert.equal(xml(hierarchy(body), display()).ok, false);
  assert.equal(
    xml(hierarchy().replace('rotation="0"', 'rotation="1"'), display()).code,
    'DISPLAY_MISMATCH',
  );
  const open = node.replace('/>', '>');
  assert.equal(
    xml(hierarchy(open.repeat(64) + '</node>'.repeat(64)), display()).code,
    'CAPTURE_LIMIT',
  );
  assert.equal(xml(hierarchy(node.repeat(CAPTURE_LIMITS.xmlNodes + 1)), display()).ok, false);
  assert.equal(xml('x'.repeat(CAPTURE_LIMITS.xmlBytes + 1), display()).code, 'CAPTURE_LIMIT');
});
test('capture freshness fences binding rotation dimensions times disconnect and malformed snapshots', () => {
  const d = display();
  assert.equal(classify(d, d, 100, true), 'CURRENT');
  for (const now of [99, 200]) assert.equal(classify(d, d, now, true), 'STALE');
  assert.equal(classify(d, d, 110, false), 'DISCONNECTED');
  for (const patch of [
    { generation: 2 },
    { serial: 'other' },
    { deviceId: id(4) },
    { bindingId: id(5) },
  ])
    assert.equal(classify(d, { ...d, ...patch }, 110, true), 'BINDING_CHANGED');
  for (const patch of [{ rotation: 90 }, { orientationEpoch: 2 }, { width: 2 }])
    assert.equal(classify(d, { ...d, ...patch }, 110, true), 'ROTATED');
  for (const patch of [
    { evidenceId: id(9) },
    { source: 'VALIDATED_CAPTURE' },
    { observedUtc: 101 },
    { validUntilUtc: 201 },
  ])
    assert.equal(classify(d, { ...d, ...patch }, 110, true), 'STALE');
  let n = 0;
  const malicious = {
    ...d,
    get width() {
      n++;
      return 1;
    },
  };
  assert.equal(png(fixture(), malicious).ok, false);
  assert.equal(n, 0);
  assert.equal(classify(d, d, -0, true), 'INVALID_CAPTURE');
});
