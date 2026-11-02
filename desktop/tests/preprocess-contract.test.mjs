import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotRoi,
  dimensions,
  sourceEdge,
  mappingFor,
  PREPROCESS_PIPELINE,
  parsePreprocessReply,
  digest,
} from '../src/main/preprocess-contract.ts';
const id = '00000000-0000-4000-8000-000000000001';
const h = {
  version: 1,
  kind: 'PREPROCESS',
  requestId: id,
  captureId: id,
  deviceId: id,
  bindingId: id,
  generation: 0,
  orientationEpoch: 0,
  pipelineId: PREPROCESS_PIPELINE,
  inputWidth: 4,
  inputHeight: 4,
  inputBytes: 64,
  sourcePixelSha256: 'a'.repeat(64),
  inputSha256: 'b'.repeat(64),
  roi: { x: 1, y: 1, width: 2, height: 2 },
  scale: 'DOUBLE',
  contrast: 'IDENTITY',
};
test('bounded ROI/scale exact rational image-edge inverse, not action point', () => {
  assert.equal(snapshotRoi({ x: -0, y: 0, width: 1, height: 1 }, 2, 2), null);
  assert.equal(snapshotRoi({ x: 1, y: 1, width: 2, height: 2 }, 2, 2), null);
  assert.deepEqual(dimensions(h.roi, 'DOUBLE'), [4, 4]);
  assert.equal(dimensions({ width: 3, height: 2 }, 'HALF'), null);
  assert.equal(dimensions({ width: 4096, height: 4096 }, 'DOUBLE'), null);
  const m = mappingFor(h, 5);
  assert.deepEqual(sourceEdge(m, 1, 3), { xNumerator: 3, yNumerator: 5, denominator: 2 });
  assert.equal(sourceEdge(m, 5, 0), null);
});
test('actual frame parser refuses duplicate/noncanonical/trailing/correlation/hash/alpha/stats', () => {
  const pixels = Buffer.alloc(64);
  for (let i = 3; i < 64; i += 4) pixels[i] = 255;
  const r = {
    version: 1,
    kind: 'PREPROCESS_RESULT',
    requestId: id,
    captureId: id,
    deviceId: id,
    bindingId: id,
    generation: 0,
    orientationEpoch: 0,
    pipelineId: PREPROCESS_PIPELINE,
    status: 'PROCESSED',
    code: 'OK',
    sourcePixelSha256: h.sourcePixelSha256,
    inputSha256: h.inputSha256,
    outputWidth: 4,
    outputHeight: 4,
    outputBytes: 64,
    outputSha256: digest(pixels),
    mapping: { originalWidth: 4, originalHeight: 4, roi: h.roi, numerator: 2, denominator: 1 },
    minIntensity: 0,
    maxIntensity: 0,
    clippedChannels: 0,
  };
  const frame = (text = JSON.stringify(r), data = pixels) => {
    const b = Buffer.from(text),
      prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(b.length);
    return Buffer.concat([prefix, b, data]);
  };
  assert.equal(parsePreprocessReply(frame(), h).code, 'OK');
  for (const text of [
    JSON.stringify({ ...r, inputSha256: 'c'.repeat(64) }),
    JSON.stringify({ ...r, maxIntensity: 1 }),
    JSON.stringify({ ...r, outputSha256: 'd'.repeat(64) }),
    JSON.stringify(r).replace('"version":1', '"version":1,"version":1'),
    JSON.stringify(r) + ' ',
  ])
    assert.equal(parsePreprocessReply(frame(text), h), null);
  assert.equal(parsePreprocessReply(Buffer.concat([frame(), Buffer.from([0])]), h), null);
});

test('forward/inverse rational edge and rectangle round trips with conservative cover', async () => {
  const { outputEdge, sourceRectangle, outputRectangle, coverSourceRectangle } = await import(
    '../src/main/preprocess-contract.ts'
  );
  for (const scale of ['HALF', 'ONE', 'DOUBLE']) {
    const m = mappingFor({ ...h, scale }, 1),
      dim = dimensions(h.roi, scale);
    for (let y = 0; y <= dim[1]; y++)
      for (let x = 0; x <= dim[0]; x++)
        assert.deepEqual(outputEdge(m, sourceEdge(m, x, y)), {
          xNumerator: x,
          yNumerator: y,
          denominator: 1,
        });
    const rect = { x: 0, y: 0, width: dim[0], height: dim[1] };
    assert.deepEqual(outputRectangle(m, sourceRectangle(m, rect)), {
      leftNumerator: 0,
      topNumerator: 0,
      rightNumerator: dim[0],
      bottomNumerator: dim[1],
      denominator: 1,
    });
    assert.deepEqual(coverSourceRectangle(m, rect), h.roi);
    assert.equal(sourceRectangle(m, { x: dim[0], y: 0, width: 1, height: 1 }), null);
    assert.equal(outputEdge(m, { xNumerator: 0, yNumerator: 0, denominator: 1 }), null);
    assert.equal(
      outputRectangle(m, {
        leftNumerator: 1,
        topNumerator: 1,
        rightNumerator: 1,
        bottomNumerator: 2,
        denominator: 1,
      }),
      null,
    );
  }
  const m = mappingFor(h, 1);
  assert.deepEqual(sourceRectangle(m, { x: 1, y: 1, width: 2, height: 2 }), {
    leftNumerator: 3,
    topNumerator: 3,
    rightNumerator: 5,
    bottomNumerator: 5,
    denominator: 2,
  });
  assert.deepEqual(coverSourceRectangle(m, { x: 1, y: 1, width: 2, height: 2 }), {
    x: 1,
    y: 1,
    width: 2,
    height: 2,
  });
  assert.equal(outputEdge(m, { xNumerator: 1, yNumerator: 1, denominator: -0 }), null);
  assert.equal(sourceEdge({ ...m, numerator: 0 }, 1, 1), null);
});
