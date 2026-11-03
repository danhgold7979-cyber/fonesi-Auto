import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotVideoPresentationMessage as message,
  snapshotVideoPresentationControl as control,
} from '../src/video-presentation-contract.ts';
const videoId = '22222222-2222-4222-8222-222222222222';
const fence = {
  version: 2,
  videoId,
  kind: 'PRESENTATION',
  epoch: 1,
  state: 'VISIBLE',
  afterDeliveryId: 0,
  afterPacketId: 0,
  remainingMs: 30000,
};
const paint = {
  version: 2,
  videoId,
  kind: 'PAINTED',
  epoch: 1,
  deliveryId: 1,
  geometryId: 1,
  configId: 1,
  packetId: 1,
  ptsUs: 0,
  width: 100,
  height: 200,
};
test('private v2 exact messages and controls accept only intended direction', () => {
  for (const value of [
    fence,
    { ...fence, state: 'HIDDEN', epoch: 2, remainingMs: 0.5 },
    { version: 2, videoId, kind: 'REFUSED', reason: 'BUSY' },
  ]) {
    assert.deepEqual(message(value), value);
    assert.equal(control(value), null);
  }
  for (const value of [
    paint,
    { version: 2, videoId, kind: 'PRESENTATION_ACK', epoch: 1 },
    { version: 2, videoId, kind: 'CONSUMED', epoch: 1, deliveryId: 1 },
    ...['READY', 'STOP', 'DECODER_UNAVAILABLE', 'DECODE_FAILED', 'VISIBILITY_HINT'].map((kind) => ({
      version: 2,
      videoId,
      kind,
    })),
  ]) {
    assert.deepEqual(control(value), value);
    assert.equal(message(value), null);
  }
});
test('private v2 refuses extra, accessor, symbol and nonplain records without invoking getters', () => {
  for (const [parse, value] of [
    [message, fence],
    [control, paint],
  ]) {
    let reads = 0;
    const accessor = { ...value };
    Object.defineProperty(accessor, 'epoch', {
      enumerable: true,
      get() {
        reads++;
        return 1;
      },
    });
    for (const bad of [
      { ...value, extra: 1 },
      { ...value, [Symbol('x')]: 1 },
      Object.assign(Object.create({}), value),
      accessor,
      { ...value, version: 1 },
      { ...value, epoch: -0 },
      { ...value, epoch: Number.MAX_SAFE_INTEGER + 1 },
      { ...value, videoId: 'foreign' },
    ])
      assert.equal(parse(bad), null);
    assert.equal(reads, 0);
  }
});
test('fence budget and frontiers reject malformed or unbounded values', () => {
  for (const remainingMs of [0, -1, 30001, NaN, Infinity])
    assert.equal(message({ ...fence, remainingMs }), null);
  for (const key of ['afterDeliveryId', 'afterPacketId'])
    for (const value of [-0, -1, 0.5, Infinity])
      assert.equal(message({ ...fence, [key]: value }), null);
  for (const [key, value] of [
    ['state', 'OFFSCREEN'],
    ['epoch', 0],
  ])
    assert.equal(message({ ...fence, [key]: value }), null);
});
test('MEDIA preserves strict nested v1 delivery and copies bytes', () => {
  const delivery = {
    version: 1,
    videoId,
    deliveryId: 1,
    geometryId: 1,
    configId: 1,
    packetId: 1,
    kind: 'CONFIG',
    ptsUs: null,
    totalBytes: 1,
    width: 100,
    height: 200,
    bytes: new Uint8Array([1]),
  };
  const value = { version: 2, videoId, kind: 'MEDIA', epoch: 1, delivery };
  const copied = message(value);
  assert.deepEqual(copied, value);
  assert.notEqual(copied.delivery.bytes, delivery.bytes);
  for (const bad of [
    { ...value, delivery: { ...delivery, version: 2 } },
    { ...value, delivery: { ...delivery, extra: 1 } },
    { ...value, delivery: { ...delivery, videoId: '33333333-3333-4333-8333-333333333333' } },
    { ...value, epoch: 0 },
  ])
    assert.equal(message(bad), null);
});
test('PAINTED and consumed counters reject fractional negative and oversize identities', () => {
  for (const key of [
    'epoch',
    'deliveryId',
    'geometryId',
    'configId',
    'packetId',
    'ptsUs',
    'width',
    'height',
  ])
    for (const value of [-0, -1, 0.5, NaN, Infinity])
      assert.equal(control({ ...paint, [key]: value }), null);
  assert.equal(control({ ...paint, width: 4097 }), null);
  assert.equal(control({ ...paint, width: 4096, height: 4096 }), null);
});
