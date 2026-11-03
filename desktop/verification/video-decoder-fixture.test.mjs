import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  generateVideoDecoderFixture,
  VIDEO_DECODER_FIXTURE_IDENTITIES,
} from './video-decoder-fixture.mjs';
import { annexBNals, parseAvcConfiguration, prepareAvcChunk } from '../src/h264-video.ts';
const expected = Object.freeze({
  LANDSCAPE: Object.freeze({
    width: 32,
    height: 16,
    configuration: '000000016742c00ada2e400000000168ce3c80',
    keySha256: 'bbc0aa48d4a5a856aff11f4cd9a95ab29ba6caf7afbfd75f7f0e9f25cec9efa7',
  }),
  PORTRAIT: Object.freeze({
    width: 16,
    height: 32,
    configuration: '000000016742c00ada56400000000168ce3c80',
    keySha256: '7d549511c6a50064b549a32afd4776f37f9d82d0d3f135c32603b72bfdc58c31',
  }),
});
// Independent, fixed-grammar inspection of generated I_PCM syntax. This is not an AVC decoder.
function inspectPcm(nal) {
  assert.equal(nal[0], 0x65);
  const raw = [];
  for (let i = 1, zeroes = 0; i < nal.length; i++) {
    if (zeroes === 2 && nal[i] === 3) {
      assert.ok(i + 1 < nal.length && nal[i + 1] <= 3);
      zeroes = 0;
    } else {
      assert.ok(zeroes !== 2 || nal[i] > 2);
      raw.push(nal[i]);
      zeroes = nal[i] === 0 ? zeroes + 1 : 0;
    }
  }
  let position = 0;
  const bit = () => {
    assert.ok(position < raw.length * 8);
    return (raw[position >> 3] >> (7 - (position++ & 7))) & 1;
  };
  const fixed = (n) => {
    let value = 0;
    for (let i = 0; i < n; i++) value = value * 2 + bit();
    return value;
  };
  const ue = () => {
    let count = 0;
    while (bit() === 0) assert.ok(++count < 9);
    return 2 ** count - 1 + fixed(count);
  };
  assert.equal(ue(), 0); // first_mb_in_slice
  assert.equal(ue(), 2); // I slice
  assert.equal(ue(), 0); // PPS
  assert.equal(fixed(4), 0); // frame_num
  assert.equal(ue(), 0); // idr_pic_id, POCtype2 has no POC bits
  assert.equal(bit(), 0); // no_output_of_prior_pics_flag
  assert.equal(bit(), 0); // long_term_reference_flag
  assert.equal(ue(), 0); // signed QP delta0
  assert.equal(ue(), 1); // disable deblocking
  const blocks = [];
  for (let block = 0; block < 2; block++) {
    assert.equal(ue(), 25);
    while (position % 8) assert.equal(bit(), 0);
    const luma = Array.from({ length: 256 }, () => fixed(8));
    const cb = Array.from({ length: 64 }, () => fixed(8));
    const cr = Array.from({ length: 64 }, () => fixed(8));
    assert.deepEqual(luma, Array(256).fill(block === 0 ? 16 : 235));
    assert.deepEqual(cb, Array(64).fill(128));
    assert.deepEqual(cr, Array(64).fill(128));
    blocks.push(luma);
  }
  assert.equal(bit(), 1);
  while (position % 8) assert.equal(bit(), 0);
  assert.equal(position, raw.length * 8);
  return blocks;
}
for (const kind of ['LANDSCAPE', 'PORTRAIT']) {
  test(`fixed authored ${kind} payload identity and production configuration/key admission`, () => {
    const fixture = generateVideoDecoderFixture(kind),
      pin = expected[kind];
    assert.equal(fixture.width, pin.width);
    assert.equal(fixture.height, pin.height);
    assert.equal(Buffer.from(fixture.configuration).toString('hex'), pin.configuration);
    assert.equal(fixture.configuration.length, 19);
    assert.equal(fixture.key.length, 799);
    assert.equal(createHash('sha256').update(fixture.key).digest('hex'), pin.keySha256);
    assert.equal(fixture.keySha256, pin.keySha256);
    assert.equal(
      fixture.configurationSha256,
      VIDEO_DECODER_FIXTURE_IDENTITIES[kind].configurationSha256,
    );
    const config = parseAvcConfiguration(fixture.configuration, fixture.width, fixture.height);
    assert.equal(config.codec, 'avc1.42c00a');
    assert.deepEqual(
      [
        config.width,
        config.height,
        config.codedWidth,
        config.codedHeight,
        config.sarWidth,
        config.sarHeight,
      ],
      [pin.width, pin.height, pin.width, pin.height, 1, 1],
    );
    assert.deepEqual(prepareAvcChunk(fixture.key, true, config), fixture.key);
    assert.deepEqual(
      annexBNals(fixture.key).map((n) => n[0] & 31),
      [7, 8, 5],
    );
  });
  test(`fixed ${kind} I_PCM syntax produces prescribed luma/chroma sample placement`, () => {
    const f = generateVideoDecoderFixture(kind),
      blocks = inspectPcm(annexBNals(f.key)[2]);
    const plane = new Uint8Array(f.width * f.height);
    for (let mb = 0; mb < 2; mb++)
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const col = kind === 'LANDSCAPE' ? mb * 16 : 0,
            row = kind === 'PORTRAIT' ? mb * 16 : 0;
          plane[(row + y) * f.width + col + x] = blocks[mb][y * 16 + x];
        }
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++)
        assert.equal(plane[y * f.width + x], (kind === 'LANDSCAPE' ? x : y) < 16 ? 16 : 235);
    assert.deepEqual(
      f.samples.map((s) => plane[s.y * f.width + s.x]),
      [16, 235],
    );
    assert.deepEqual(
      f.samples.map((s) => [s.min, s.max, s.alpha]),
      [
        [0, 8, 255],
        [247, 255, 255],
      ],
    );
  });
}
test('fixture admits only exact closed orientations and returns independently owned bytes', () => {
  for (const kind of [undefined, null, 'landscape', 'LANDSCAPE ', {}, ['PORTRAIT'], 0])
    assert.throws(() => generateVideoDecoderFixture(kind), /VIDEO_FIXTURE_REJECTED/);
  const a = generateVideoDecoderFixture('LANDSCAPE'),
    b = generateVideoDecoderFixture('LANDSCAPE');
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.samples) && a.samples.every(Object.isFrozen));
  a.configuration.fill(0);
  a.key.fill(0);
  assert.deepEqual(generateVideoDecoderFixture('LANDSCAPE').configuration, b.configuration);
  assert.deepEqual(generateVideoDecoderFixture('LANDSCAPE').key, b.key);
});
test('production parser rejects altered geometry/parameters and fixture syntax inspector rejects sample corruption', () => {
  const f = generateVideoDecoderFixture('LANDSCAPE');
  assert.throws(() => parseAvcConfiguration(f.configuration, 16, 32), /AVC_REJECTED/);
  const config = parseAvcConfiguration(f.configuration, 32, 16);
  assert.throws(
    () => prepareAvcChunk(generateVideoDecoderFixture('PORTRAIT').key, true, config),
    /AVC_REJECTED/,
  );
  const missingPps = annexBNals(f.configuration)[0];
  assert.throws(
    () => parseAvcConfiguration(Uint8Array.from([0, 0, 0, 1, ...missingPps]), 32, 16),
    /AVC_REJECTED/,
  );
  const corrupted = annexBNals(f.key)[2].slice();
  corrupted[20] = 17;
  assert.throws(() => inspectPcm(corrupted));
  assert.throws(() => inspectPcm(annexBNals(f.key)[2].subarray(0, 30)));
  const tail = annexBNals(f.key)[2].slice();
  tail[tail.length - 1] = 0;
  assert.throws(() => inspectPcm(tail));
});
