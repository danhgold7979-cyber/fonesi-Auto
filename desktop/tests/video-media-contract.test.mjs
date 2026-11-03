import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVideoWireParser,
  parseVideoMediaHeader,
  snapshotVideoMediaDelivery,
} from '../src/video-media-contract.ts';
const id = '00000000-0000-4000-8000-000000000001';
const header = {
  version: 1,
  sessionId: id,
  attemptId: id,
  videoId: id,
  creditId: 1,
  geometryId: 1,
  configId: 1,
  packetId: 1,
  kind: 'KEY',
  ptsUs: 0,
  totalBytes: 4,
  offset: 0,
  width: 16,
  height: 16,
};
function frame(h = header, payload = new Uint8Array([0, 10, 123, 255])) {
  const text = new TextEncoder().encode(JSON.stringify(h));
  const out = new Uint8Array(16 + text.length + payload.length);
  out.set([0, 65, 86, 77, 69, 68, 48, 49]);
  const v = new DataView(out.buffer);
  v.setUint32(8, text.length);
  v.setUint32(12, payload.length);
  out.set(text, 16);
  out.set(payload, 16 + text.length);
  return out;
}
test('actual binary parser accepts every split and coalesced control without interpreting payload newline', () => {
  const media = frame(),
    control = new TextEncoder().encode('{"version":1}\n');
  const all = new Uint8Array(media.length + control.length);
  all.set(media);
  all.set(control, media.length);
  for (let split = 0; split <= all.length; split++) {
    const got = [];
    const parser = createVideoWireParser((x) => got.push(x));
    assert.equal(parser.push(all.slice(0, split)), true);
    assert.equal(parser.push(all.slice(split)), true);
    assert.equal(parser.pending, false);
    assert.equal(got.length, 2);
    assert.equal(got[0].kind, 'MEDIA');
    assert.deepEqual([...got[0].bytes], [0, 10, 123, 255]);
    assert.equal(got[1].kind, 'CONTROL');
  }
});
test('canonical header refuses duplicates, reordered syntax, mismatched payload and all finite bounds', () => {
  const encode = (x) => new TextEncoder().encode(x);
  assert.ok(parseVideoMediaHeader(encode(JSON.stringify(header)), 4));
  assert.equal(
    parseVideoMediaHeader(
      encode(JSON.stringify(header).replace('"version":1', '"version":1,"version":1')),
      4,
    ),
    null,
  );
  assert.equal(parseVideoMediaHeader(encode(JSON.stringify({ ...header, extra: 1 })), 4), null);
  for (const h of [
    { ...header, offset: 1 },
    { ...header, totalBytes: 8_388_609 },
    { ...header, width: 4097 },
    { ...header, configId: 0 },
    { ...header, kind: 'CONFIG', totalBytes: 65537 },
  ])
    assert.equal(parseVideoMediaHeader(encode(JSON.stringify(h)), 4), null);
  assert.equal(
    parseVideoMediaHeader(encode(JSON.stringify(header).replace('"ptsUs":0', '"ptsUs":-0')), 4),
    null,
  );
  assert.equal(parseVideoMediaHeader(encode(JSON.stringify(header)), 3), null);
});
test('malformed framing and reentrant emission close irreversibly within fixed event limit', () => {
  for (const mutate of [
    (x) => (x[1] = 0),
    (x) => new DataView(x.buffer).setUint32(8, 1025),
    (x) => new DataView(x.buffer).setUint32(12, 32769),
  ]) {
    const x = frame();
    mutate(x);
    const p = createVideoWireParser(() => assert.fail());
    assert.equal(p.push(x), false);
    assert.equal(p.push(frame()), false);
  }
  const p = createVideoWireParser(() => assert.fail());
  assert.equal(p.push(new Uint8Array(65537)), false);
  let q;
  q = createVideoWireParser(() => assert.equal(q.push(frame()), false));
  assert.equal(q.push(frame()), false);
  let r;
  r = createVideoWireParser(() => r.close());
  assert.equal(r.push(frame()), false);
});
test('delivery copies supplied bytes and never evaluates accessors or admits session aliases', () => {
  const d = {
    version: 1,
    videoId: id,
    deliveryId: 1,
    geometryId: 1,
    configId: 1,
    packetId: 1,
    kind: 'KEY',
    ptsUs: 0,
    totalBytes: 4,
    width: 16,
    height: 16,
    bytes: new Uint8Array([1, 2, 3, 4]),
  };
  const result = snapshotVideoMediaDelivery(d);
  assert.ok(result);
  d.bytes[0] = 9;
  assert.equal(result.bytes[0], 1);
  assert.ok(Object.isFrozen(result));
  let calls = 0;
  const hostile = { ...d };
  Object.defineProperty(hostile, 'bytes', {
    enumerable: true,
    get() {
      calls++;
      return d.bytes;
    },
  });
  assert.equal(snapshotVideoMediaDelivery(hostile), null);
  assert.equal(calls, 0);
  assert.equal(snapshotVideoMediaDelivery({ ...d, deliveryId: 0 }), null);
  assert.equal(snapshotVideoMediaDelivery({ ...d, kind: 'SESSION' }), null);
  assert.ok(
    snapshotVideoMediaDelivery({
      ...d,
      kind: 'SESSION',
      packetId: 0,
      configId: 0,
      ptsUs: null,
      totalBytes: 0,
      bytes: new Uint8Array(),
    }),
  );
});

test('video interaction canonical wire refuses duplicate keys, foreign tuples and unsafe counters', async () => {
  const {
    parseVideoStreamRequest,
    parseVideoStreamResponse,
    videoStreamResponse,
    snapshotVideoPortMetadata,
  } = await import('../src/video-stream-contract.ts');
  const wire = JSON.stringify({
    version: 1,
    requestId: id,
    kind: 'START',
    deviceId: id,
    expectedRegistryRevision: 0,
  });
  assert.ok(parseVideoStreamRequest(wire));
  assert.equal(
    parseVideoStreamRequest(wire.replace('"version":1', '"version":1,"version":1')),
    null,
  );
  assert.equal(
    parseVideoStreamRequest(
      wire.replace('"expectedRegistryRevision":0', '"expectedRegistryRevision":-0'),
    ),
    null,
  );
  assert.equal(
    parseVideoStreamRequest(
      JSON.stringify({
        version: 1,
        requestId: id,
        kind: 'START',
        deviceId: id,
        expectedRegistryRevision: 0,
        serial: 'x',
      }),
    ),
    null,
  );
  assert.ok(parseVideoStreamResponse(videoStreamResponse(id, 'PENDING', id)));
  assert.equal(parseVideoStreamResponse(videoStreamResponse(null, 'PENDING')), null);
  assert.ok(
    snapshotVideoPortMetadata({
      version: 1,
      videoId: id,
      requestId: id,
      deviceId: id,
      generation: 0,
      deadlineUtc: 1,
    }),
  );
  assert.equal(
    snapshotVideoPortMetadata({
      version: 1,
      videoId: id,
      requestId: id,
      deviceId: id,
      generation: -0,
      deadlineUtc: 1,
    }),
    null,
  );
});
