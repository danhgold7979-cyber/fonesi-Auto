// Self-authored synthetic AVC fixture; no captured/downloaded media or encoder runtime.
// Recipe: P3-DECODER-OUTPUT-QUALIFICATION-PROPOSAL.md §6, ITU-T H.264 (08/2021)
// §§7.3.1–7.3.5, Table7-11, §8.3.5 and AnnexB. Source/oracle, not decode evidence.
import { createHash } from 'node:crypto';
const reject = () => {
  throw Error('VIDEO_FIXTURE_REJECTED');
};
class Bits {
  values = [];
  u(value, width) {
    if (
      !Number.isSafeInteger(value) ||
      !Number.isSafeInteger(width) ||
      width < 1 ||
      width > 8 ||
      value < 0 ||
      value >= 2 ** width
    )
      reject();
    for (let i = width - 1; i >= 0; i--) this.values.push((value >> i) & 1);
    if (this.values.length > 8192) reject();
    return this;
  }
  ue(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 255) reject();
    const text = (value + 1).toString(2);
    for (let i = 1; i < text.length; i++) this.u(0, 1);
    for (const bit of text) this.u(Number(bit), 1);
    return this;
  }
  zeroAlign() {
    while (this.values.length % 8) this.u(0, 1);
    return this;
  }
  bytes() {
    this.u(1, 1).zeroAlign();
    const bytes = new Uint8Array(this.values.length / 8);
    for (let i = 0; i < this.values.length; i++) bytes[i >> 3] |= this.values[i] << (7 - (i & 7));
    return bytes;
  }
}
function annexB(header, rbsp) {
  const bytes = [0, 0, 0, 1, header];
  let zeroes = 0;
  for (const value of rbsp) {
    if (zeroes === 2 && value <= 3) {
      bytes.push(3);
      zeroes = 0;
    }
    bytes.push(value);
    zeroes = value === 0 ? zeroes + 1 : 0;
  }
  return Uint8Array.from(bytes);
}
function sps(width, height) {
  return annexB(
    0x67,
    new Bits()
      .u(66, 8)
      .u(0xc0, 8)
      .u(10, 8)
      .ue(0)
      .ue(0)
      .ue(2)
      .ue(1)
      .u(0, 1)
      .ue(width / 16 - 1)
      .ue(height / 16 - 1)
      .u(1, 1)
      .u(1, 1)
      .u(0, 1)
      .u(0, 1)
      .bytes(),
  );
}
function pps() {
  return annexB(
    0x68,
    new Bits()
      .ue(0)
      .ue(0)
      .u(0, 1)
      .u(0, 1)
      .ue(0)
      .ue(0)
      .ue(0)
      .u(0, 1)
      .u(0, 2)
      .ue(0)
      .ue(0)
      .ue(0)
      .u(1, 1)
      .u(0, 1)
      .u(0, 1)
      .bytes(),
  );
}
function idr() {
  const bits = new Bits().ue(0).ue(2).ue(0).u(0, 4).ue(0).u(0, 1).u(0, 1).ue(0).ue(1);
  // In an I slice mb_type25 is I_PCM. Samples are raster luma, then Cb and Cr.
  for (const luma of [16, 235]) {
    bits.ue(25).zeroAlign();
    for (let i = 0; i < 256; i++) bits.u(luma, 8);
    for (let i = 0; i < 128; i++) bits.u(128, 8);
  }
  return annexB(0x65, bits.bytes());
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const VIDEO_DECODER_FIXTURE_IDENTITIES = Object.freeze({
  LANDSCAPE: Object.freeze({
    width: 32,
    height: 16,
    configurationBytes: 19,
    keyBytes: 799,
    configurationSha256: 'ea3b988f540ca81bd0bcab2425dd22b58d9fbb2ca2529cd3d4bb3eef6d1a7b2d',
    keySha256: 'bbc0aa48d4a5a856aff11f4cd9a95ab29ba6caf7afbfd75f7f0e9f25cec9efa7',
  }),
  PORTRAIT: Object.freeze({
    width: 16,
    height: 32,
    configurationBytes: 19,
    keyBytes: 799,
    configurationSha256: 'a4957c412d5e530fa5f5a6cdaadb28809fbb486b17fe4bbdd68c1982175f038e',
    keySha256: '7d549511c6a50064b549a32afd4776f37f9d82d0d3f135c32603b72bfdc58c31',
  }),
});
export function generateVideoDecoderFixture(kind) {
  if (kind !== 'LANDSCAPE' && kind !== 'PORTRAIT') reject();
  const identity = VIDEO_DECODER_FIXTURE_IDENTITIES[kind];
  const { width, height } = identity;
  const configuration = Uint8Array.from([...sps(width, height), ...pps()]);
  const key = Uint8Array.from([...configuration, ...idr()]);
  if (
    configuration.length !== identity.configurationBytes ||
    key.length !== identity.keyBytes ||
    sha256(configuration) !== identity.configurationSha256 ||
    sha256(key) !== identity.keySha256
  )
    reject();
  const samples = Object.freeze([
    Object.freeze({ x: 8, y: 8, min: 0, max: 8, alpha: 255 }),
    Object.freeze({
      x: kind === 'LANDSCAPE' ? 24 : 8,
      y: kind === 'LANDSCAPE' ? 8 : 24,
      min: 247,
      max: 255,
      alpha: 255,
    }),
  ]);
  return Object.freeze({
    kind,
    width,
    height,
    configuration,
    key,
    configurationSha256: sha256(configuration),
    keySha256: sha256(key),
    samples,
  });
}
