/** Closed progressive 8-bit AVC subset. Parsing supplies no acquisition authority. */
export type AvcConfiguration = Readonly<{
  codec: string;
  width: number;
  height: number;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  sarWidth: number;
  sarHeight: number;
  spsId: number;
  ppsId: number;
  parameters: Uint8Array;
}>;
const fail = (): never => {
  throw Error('AVC_REJECTED');
};
class Bits {
  private at = 0;
  private readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
  read(n: number): number {
    if (n < 0 || n > 32 || this.at + n > this.bytes.length * 8) fail();
    let v = 0;
    for (let i = 0; i < n; i++) {
      const bit = this.at++;
      v = v * 2 + (((this.bytes[bit >> 3] ?? 0) >> (7 - (bit & 7))) & 1);
    }
    return v;
  }
  ue(max = 2147483647): number {
    let zeros = 0;
    while (this.read(1) === 0) if (++zeros > 31) fail();
    const v = 2 ** zeros - 1 + this.read(zeros);
    if (v > max) fail();
    return v;
  }
  se(min: number, max: number): number {
    const u = this.ue();
    const v = u % 2 ? (u + 1) / 2 : -u / 2;
    if (v < min || v > max) fail();
    return v;
  }
  more(): boolean {
    const save = this.at;
    let onlyTrailing = this.read(1) === 1;
    while (this.at < this.bytes.length * 8) if (this.read(1) !== 0) onlyTrailing = false;
    this.at = save;
    return !onlyTrailing;
  }
  finish(): void {
    if (this.read(1) !== 1) fail();
    while (this.at % 8) if (this.read(1)) fail();
    if (this.at !== this.bytes.length * 8) fail();
  }
}
function rbsp(nal: Uint8Array): Uint8Array {
  const out: number[] = [];
  let zeros = 0;
  for (let i = 1; i < nal.length; i++) {
    const value = nal[i] ?? fail();
    if (zeros === 2 && value === 3) {
      if (i + 1 >= nal.length || (nal[i + 1] ?? 4) > 3) fail();
      zeros = 0;
      continue;
    }
    if (zeros === 2 && value < 3) fail();
    out.push(value);
    zeros = value === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(out);
}
export function annexBNals(bytes: Uint8Array): readonly Uint8Array[] {
  if (!(bytes instanceof Uint8Array) || bytes.length < 5 || bytes.length > 8388608) fail();
  const start = (i: number) =>
    bytes[i] === 0 && bytes[i + 1] === 0
      ? bytes[i + 2] === 1
        ? 3
        : bytes[i + 2] === 0 && bytes[i + 3] === 1
          ? 4
          : 0
      : 0;
  const result: Uint8Array[] = [];
  let at = 0;
  while (at < bytes.length) {
    const prefix = start(at);
    if (!prefix) fail();
    const from = at + prefix;
    at = from;
    while (at < bytes.length && !start(at)) at++;
    if (at === from || result.length >= 256) fail();
    const nal = bytes.slice(from, at),
      header = nal[0] ?? fail();
    if ((header & 128) !== 0 || (header & 31) === 0 || (header & 31) > 12) fail();
    result.push(nal);
  }
  return Object.freeze(result);
}
function hrd(b: Bits) {
  const count = b.ue(31) + 1;
  b.read(4);
  b.read(4);
  for (let i = 0; i < count; i++) {
    b.ue();
    b.ue();
    b.read(1);
  }
  b.read(5);
  b.read(5);
  b.read(5);
  b.read(5);
}
function vui(b: Bits, references: number): readonly [number, number] {
  let x = 1,
    y = 1;
  if (b.read(1)) {
    const id = b.read(8),
      table = [
        [1, 1],
        [1, 1],
        [12, 11],
        [10, 11],
        [16, 11],
        [40, 33],
        [24, 11],
        [20, 11],
        [32, 11],
        [80, 33],
        [18, 11],
        [15, 11],
        [64, 33],
        [160, 99],
        [4, 3],
        [3, 2],
        [2, 1],
      ];
    if (id === 255) {
      x = b.read(16);
      y = b.read(16);
      if (!x || !y) fail();
    } else {
      if (id < 1 || id > 16) fail();
      [x, y] = table[id] as [number, number];
    }
  }
  if (b.read(1)) b.read(1);
  if (b.read(1)) {
    if (b.read(3) > 5) fail();
    b.read(1);
    if (b.read(1)) {
      b.read(8);
      b.read(8);
      b.read(8);
    }
  }
  if (b.read(1)) {
    b.ue(5);
    b.ue(5);
  }
  if (b.read(1)) {
    if (!b.read(32) || !b.read(32)) fail();
    b.read(1);
  }
  const nal = b.read(1);
  if (nal) hrd(b);
  const vcl = b.read(1);
  if (vcl) hrd(b);
  if (nal || vcl) b.read(1);
  b.read(1);
  if (b.read(1)) {
    b.read(1);
    b.ue(16);
    b.ue(16);
    b.ue(16);
    b.ue(16);
    const reorder = b.ue(16),
      buffer = b.ue(16);
    if (reorder > buffer || buffer < references) fail();
  }
  return [x, y];
}
function sps(nal: Uint8Array) {
  const b = new Bits(rbsp(nal)),
    profile = b.read(8),
    constraint = b.read(8),
    level = b.read(8),
    id = b.ue(31);
  if (![66, 77, 100].includes(profile) || (constraint & 3) !== 0 || level === 0) fail();
  if (profile === 100) {
    if (b.ue(3) !== 1 || b.ue(6) !== 0 || b.ue(6) !== 0 || b.read(1) !== 0 || b.read(1) !== 0)
      fail();
  }
  b.ue(12);
  const poc = b.ue(2);
  if (poc === 0) b.ue(12);
  else if (poc !== 2) fail();
  const references = b.ue(16);
  if (b.read(1)) fail();
  const cw = (b.ue(255) + 1) * 16,
    ch = (b.ue(255) + 1) * 16;
  if (!b.read(1)) fail();
  b.read(1);
  let left = 0,
    right = 0,
    top = 0,
    bottom = 0;
  if (b.read(1)) {
    left = b.ue(2048);
    right = b.ue(2048);
    top = b.ue(2048);
    bottom = b.ue(2048);
  }
  const width = cw - 2 * (left + right),
    height = ch - 2 * (top + bottom);
  if (width < 1 || height < 1 || cw * ch > 8388608) fail();
  const [sarWidth, sarHeight] = b.read(1) ? vui(b, references) : [1, 1];
  b.finish();
  if (
    !sarWidth ||
    !sarHeight ||
    (width * sarWidth) / sarHeight > 4096 ||
    ((width * sarWidth) / sarHeight) * height > 8388608
  )
    fail();
  const displayWidth = Math.max(1, Math.round((width * sarWidth) / sarHeight));
  if (displayWidth > 4096 || displayWidth * height > 8388608) fail();
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return {
    codec: `avc1.${hex(profile)}${hex(constraint)}${hex(level)}`,
    width,
    height,
    displayWidth,
    displayHeight: height,
    codedWidth: cw,
    codedHeight: ch,
    sarWidth,
    sarHeight,
    spsId: id,
  };
}
function pps(nal: Uint8Array, spsId: number): number {
  const b = new Bits(rbsp(nal)),
    id = b.ue(255);
  if (b.ue(31) !== spsId) fail();
  b.read(1);
  if (b.read(1)) fail();
  if (b.ue(7) !== 0) fail();
  b.ue(15);
  b.ue(15);
  b.read(1);
  if (b.read(2) === 3) fail();
  b.se(-26, 25);
  b.se(-26, 25);
  b.se(-12, 12);
  b.read(1);
  b.read(1);
  if (b.read(1)) fail();
  if (b.more()) {
    b.read(1);
    if (b.read(1)) fail();
    b.se(-12, 12);
  }
  b.finish();
  return id;
}
function join(nals: readonly Uint8Array[]): Uint8Array {
  const length = nals.reduce((n, v) => n + 4 + v.length, 0);
  if (length > 8388608) fail();
  const out = new Uint8Array(length);
  let at = 0;
  for (const n of nals) {
    out.set([0, 0, 0, 1], at);
    out.set(n, at + 4);
    at += 4 + n.length;
  }
  return out;
}
export function parseAvcConfiguration(
  bytes: Uint8Array,
  width: number,
  height: number,
): AvcConfiguration {
  if (bytes.length > 65536) fail();
  const nals = annexBNals(bytes);
  if (nals.length !== 2 || (nals[0]?.[0] ?? 0) % 32 !== 7 || (nals[1]?.[0] ?? 0) % 32 !== 8) fail();
  const sn = nals[0] ?? fail(),
    pn = nals[1] ?? fail(),
    info = sps(sn),
    ppsId = pps(pn, info.spsId);
  if (info.width !== width || info.height !== height) fail();
  return Object.freeze({ ...info, ppsId, parameters: join(nals) });
}
export function prepareAvcChunk(
  bytes: Uint8Array,
  key: boolean,
  config: AvcConfiguration,
): Uint8Array {
  const nals = annexBNals(bytes);
  let vcl = 0,
    idr = 0,
    sets = 0;
  const current = annexBNals(config.parameters);
  for (const n of nals) {
    const type = (n[0] ?? 0) & 31;
    if (type === 1 || type === 5) {
      const b = new Bits(rbsp(n));
      b.ue(65535);
      b.ue(9);
      if (b.ue(255) !== config.ppsId) fail();
      vcl++;
      if (type === 5) idr++;
    } else if (type === 7 || type === 8) {
      if (!key) fail();
      const expected = current[type === 7 ? 0 : 1] ?? fail();
      if (n.length !== expected.length || n.some((v, i) => v !== expected[i])) fail();
      const bit = type === 7 ? 1 : 2;
      if (sets & bit) fail();
      sets |= bit;
    } else if (![6, 9, 12].includes(type)) fail();
  }
  if (!vcl || (key ? idr !== vcl : idr !== 0)) fail();
  if (key) {
    if (sets !== 0 && sets !== 3) fail();
    return sets === 3 ? join(nals) : join([...current, ...nals]);
  }
  return join(nals);
}
