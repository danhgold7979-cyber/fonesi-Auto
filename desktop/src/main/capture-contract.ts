import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { snapshotDisplayEvidence, type DisplayEvidence } from './input-contract.ts';
// Pure supplied-byte validators, not capture execution, provenance certification,
// device admission or atomic persistence. Supported PNG: RGB/RGBA8, noninterlaced.
export const CAPTURE_LIMITS = Object.freeze({
  pngBytes: 16 * 1024 * 1024,
  decodedBytes: 64 * 1024 * 1024,
  chunks: 4096,
  xmlBytes: 1024 * 1024,
  xmlDepth: 64,
  xmlNodes: 10000,
});
type Rejection = Readonly<{
  ok: false;
  code: 'INVALID_CAPTURE' | 'CAPTURE_LIMIT' | 'DISPLAY_MISMATCH';
}>;
export type PngCaptureResult =
  | Rejection
  | Readonly<{
      ok: true;
      format: 'PNG';
      width: number;
      height: number;
      encodedBytes: number;
      decodedBytes: number;
      pixelSha256: string;
      evidence: DisplayEvidence;
    }>;
export type HierarchyCaptureResult =
  | Rejection
  | Readonly<{
      ok: true;
      format: 'HIERARCHY_XML';
      nodeCount: number;
      encodedBytes: number;
      sha256: string;
      evidence: DisplayEvidence;
    }>;
const bad = (code: Rejection['code'] = 'INVALID_CAPTURE'): Rejection =>
  Object.freeze({ ok: false, code });
const sha = (v: Uint8Array | string) => createHash('sha256').update(v).digest('hex');
function snapshotBytes(value: unknown): Uint8Array | null {
  try {
    const p = Object.getPrototypeOf(Uint8Array.prototype);
    if (Object.getOwnPropertyDescriptor(p, Symbol.toStringTag)?.get?.call(value) !== 'Uint8Array')
      return null;
    const buffer = Object.getOwnPropertyDescriptor(p, 'buffer')?.get?.call(value) as unknown;
    const offset = Object.getOwnPropertyDescriptor(p, 'byteOffset')?.get?.call(value) as unknown;
    const length = Object.getOwnPropertyDescriptor(p, 'byteLength')?.get?.call(value) as unknown;
    if (
      !(buffer instanceof ArrayBuffer) ||
      typeof offset !== 'number' ||
      typeof length !== 'number' ||
      length > CAPTURE_LIMITS.pngBytes
    )
      return null;
    const copy = new Uint8Array(length);
    copy.set(new Uint8Array(buffer, offset, length));
    return copy;
  } catch {
    return null;
  }
}
function u32(b: Uint8Array, p: number): number {
  return (
    ((b[p] ?? 0) * 0x1000000 +
      ((b[p + 1] ?? 0) << 16) +
      ((b[p + 2] ?? 0) << 8) +
      (b[p + 3] ?? 0)) >>>
    0
  );
}
function crc(bytes: Uint8Array, start: number, end: number): number {
  let value = 0xffffffff;
  for (let i = start; i < end; i++) {
    value ^= bytes[i] ?? 0;
    for (let n = 0; n < 8; n++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c,
    pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
type DecodedPng = Exclude<PngCaptureResult, Rejection> &
  Readonly<{ pixels: Uint8Array; channels: number }>;
function decodePng(
  input: unknown,
  display: unknown,
  preprocessing: boolean,
): Rejection | DecodedPng {
  const evidence = snapshotDisplayEvidence(display);
  if (!evidence) return bad();
  const bytes = snapshotBytes(input);
  if (!bytes) return bad();
  if (bytes.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return bad();
  try {
    let position = 8,
      count = 0,
      width = 0,
      height = 0,
      channels = 0,
      idat = false,
      idatEnded = false,
      ended = false;
    const compressed: Uint8Array[] = [];
    const seen = new Set<string>();
    while (position < bytes.length) {
      if (++count > CAPTURE_LIMITS.chunks) return bad('CAPTURE_LIMIT');
      if (position + 12 > bytes.length) return bad();
      const length = u32(bytes, position);
      if (length > bytes.length - position - 12) return bad();
      const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));
      if (
        !/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type) ||
        crc(bytes, position + 4, position + 8 + length) !== u32(bytes, position + 8 + length)
      )
        return bad();
      const data = bytes.subarray(position + 8, position + 8 + length);
      if (count === 1 && type !== 'IHDR') return bad();
      if (type === 'IHDR') {
        if (count !== 1 || length !== 13) return bad();
        width = u32(data, 0);
        height = u32(data, 4);
        if (
          !width ||
          !height ||
          width > 65535 ||
          height > 65535 ||
          data[8] !== 8 ||
          ![2, 6].includes(data[9] ?? -1) ||
          data[10] !== 0 ||
          data[11] !== 0 ||
          data[12] !== 0
        )
          return bad();
        if (preprocessing && (width > 4096 || height > 4096 || width * height > 4194304))
          return bad('CAPTURE_LIMIT');
        channels = data[9] === 2 ? 3 : 4;
        if ((width * channels + 1) * height > CAPTURE_LIMITS.decodedBytes)
          return bad('CAPTURE_LIMIT');
        if (width !== evidence.width || height !== evidence.height) return bad('DISPLAY_MISMATCH');
      } else if (type === 'IDAT') {
        if (idatEnded) return bad();
        idat = true;
        compressed.push(data);
      } else if (type === 'IEND') {
        if (length !== 0 || !idat || position + 12 !== bytes.length) return bad();
        ended = true;
      } else {
        // Only these inert metadata chunks are supported, before image data.
        if (idat || seen.has(type)) return bad();
        seen.add(type);
        if (type === 'sRGB') {
          if (length !== 1 || (data[0] ?? 255) > 3) return bad();
        } else if (type === 'gAMA') {
          if (length !== 4 || u32(data, 0) === 0) return bad();
        } else if (type === 'pHYs') {
          if (length !== 9 || (data[8] ?? 255) > 1) return bad();
        } else if (type === 'sBIT') {
          if (length !== channels || !data.every((v) => v > 0 && v <= 8)) return bad();
        } else return bad();
      }
      if (idat && type !== 'IDAT') idatEnded = true;
      position += length + 12;
    }
    if (!ended) return bad();
    const packed = Buffer.concat(compressed),
      rowBytes = width * channels,
      expected = (rowBytes + 1) * height;
    // Installed Node typings do not model the info:true result overload. Validate
    // the actual builtin result before using this narrow representation.
    const inflated = inflateSync(packed, { maxOutputLength: expected, info: true }) as unknown as {
      buffer: unknown;
      engine: { bytesWritten: unknown };
    };
    if (
      !inflated ||
      !Buffer.isBuffer(inflated.buffer) ||
      !inflated.engine ||
      inflated.engine.bytesWritten !== packed.length ||
      inflated.buffer.length !== expected
    )
      return bad();
    const raw = inflated.buffer,
      pixels = Buffer.alloc(rowBytes * height);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (rowBytes + 1)];
      if (filter === undefined || filter > 4) return bad();
      for (let x = 0; x < rowBytes; x++) {
        const i = y * rowBytes + x,
          a = x >= channels ? (pixels[i - channels] ?? 0) : 0,
          b = y ? (pixels[i - rowBytes] ?? 0) : 0,
          c = y && x >= channels ? (pixels[i - rowBytes - channels] ?? 0) : 0;
        const predictor =
          filter === 0
            ? 0
            : filter === 1
              ? a
              : filter === 2
                ? b
                : filter === 3
                  ? Math.floor((a + b) / 2)
                  : paeth(a, b, c);
        pixels[i] = ((raw[y * (rowBytes + 1) + 1 + x] ?? 0) + predictor) & 255;
      }
    }
    return Object.freeze({
      ok: true,
      format: 'PNG',
      width,
      height,
      encodedBytes: bytes.length,
      decodedBytes: pixels.length,
      pixelSha256: sha(pixels),
      pixels,
      channels,
      evidence,
    });
  } catch {
    return bad();
  }
}
// Fixed preprocessing admission occurs at IHDR before inflate; no caller cap selector.
export function decodePreprocessPng(input: unknown, display: unknown): Rejection | DecodedPng {
  return decodePng(input, display, true);
}
export function validateCapturePng(input: unknown, display: unknown): PngCaptureResult {
  const result = decodePng(input, display, false);
  if (!result.ok) return result;
  const { pixels: _pixels, channels: _channels, ...original } = result;
  return Object.freeze(original);
}
export type HierarchyNode = Readonly<{
  ordinal: number;
  parentOrdinal: number | null;
  childOrdinals: readonly number[];
  resourceId: string | null;
  contentDescription: string | null;
  text: string | null;
  className: string;
  packageName: string | null;
  hint: string | null;
  index: number;
  drawingOrder: number | null;
  bounds: readonly [number, number, number, number];
  flags: Readonly<Record<string, boolean | null>>;
}>;
export type NormalizedHierarchy = Readonly<{
  version: 1;
  source: 'SUPPLIED_HIERARCHY_V1';
  sha256: string;
  encodedBytes: number;
  evidence: DisplayEvidence;
  nodes: readonly HierarchyNode[];
}>;
export type NormalizedHierarchyResult =
  | Rejection
  | Readonly<{ ok: true; tree: NormalizedHierarchy }>;
const xmlAttributes = new Set([
  'index',
  'text',
  'resource-id',
  'class',
  'package',
  'content-desc',
  'checkable',
  'checked',
  'clickable',
  'enabled',
  'focusable',
  'focused',
  'scrollable',
  'long-clickable',
  'password',
  'selected',
  'bounds',
  'drawing-order',
  'visible-to-user',
  'hint',
]);
const xmlBools = new Set([
  'checkable',
  'checked',
  'clickable',
  'enabled',
  'focusable',
  'focused',
  'scrollable',
  'long-clickable',
  'password',
  'selected',
  'visible-to-user',
]);
function attributes(text: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let at = 0;
  while (at < text.length) {
    const ws = /^[ \t\r\n]+/.exec(text.slice(at));
    if (!ws) return null;
    at += ws[0].length;
    if (at === text.length) break;
    const m = /^([a-z][a-z-]*)[ \t\r\n]*=[ \t\r\n]*("[^"<]*"|'[^'<]*')/.exec(text.slice(at));
    if (!m?.[1] || m[2] === undefined || out.has(m[1]) || out.size >= 24) return null;
    const value = m[2].slice(1, -1);
    if (value.length > 4096) return null;
    out.set(m[1], value);
    at += m[0].length;
  }
  return out;
}
export function normalizeHierarchyXml(input: unknown, display: unknown): NormalizedHierarchyResult {
  const evidence = snapshotDisplayEvidence(display);
  if (!evidence || typeof input !== 'string') return bad();
  if (input.length > CAPTURE_LIMITS.xmlBytes) return bad('CAPTURE_LIMIT');
  const encoded = new TextEncoder().encode(input);
  if (encoded.length > CAPTURE_LIMITS.xmlBytes) return bad('CAPTURE_LIMIT');
  // Deliberately unsupported entities (including numeric/predefined), DTD, comments,
  // CDATA and processing instructions cannot be silently expanded or ignored.
  if (
    input.includes('&') ||
    Array.from(input).some((c) => {
      const n = c.codePointAt(0) ?? 0;
      return (
        (n < 32 && ![9, 10, 13].includes(n)) ||
        (n >= 0xd800 && n <= 0xdfff) ||
        n === 0xfffe ||
        n === 0xffff
      );
    })
  )
    return bad();
  let text = input;
  const decl = /^<\?xml version=(?:"1\.0"|'1\.0') encoding=(?:"UTF-8"|'UTF-8')\?>/.exec(text);
  if (decl) text = text.slice(decl[0].length);
  let at = 0,
    nodes = 0,
    closed = false,
    opened = false;
  const stack: string[] = [];
  const parents: (number | null)[] = [];
  const normalized: { node: Omit<HierarchyNode, 'childOrdinals'>; children: number[] }[] = [];
  while (at < text.length) {
    const whitespace = /^[ \t\r\n]+/.exec(text.slice(at));
    if (whitespace) {
      at += whitespace[0].length;
      continue;
    }
    if (closed || text[at] !== '<') return bad();
    let end = at + 1,
      quote = '';
    for (; end < text.length; end++) {
      const c = text[end];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (end === text.length || quote) return bad();
    const tag = text.slice(at + 1, end);
    at = end + 1;
    if (stack.length > 0 && tag === '/' + stack.at(-1)) {
      const name = stack.pop();
      parents.pop();
      if (name === 'hierarchy') closed = true;
      continue;
    }
    const m = /^(hierarchy|node)([\s\S]*?)(\/?)$/.exec(tag);
    if (!m?.[1] || m[2] === undefined) return bad();
    const name = m[1],
      attrs = attributes(m[2]);
    if (!attrs) return bad();
    let ordinal: number | null = null;
    if (name === 'hierarchy') {
      if (opened || stack.length || m[3] === '/' || attrs.size !== 1 || !attrs.has('rotation'))
        return bad();
      const rotation = attrs.get('rotation');
      if (!rotation || !/^[0-3]$/.test(rotation) || Number(rotation) * 90 !== evidence.rotation)
        return bad('DISPLAY_MISMATCH');
      opened = true;
    } else {
      if (!opened || !stack.length || ++nodes > CAPTURE_LIMITS.xmlNodes)
        return bad(nodes > CAPTURE_LIMITS.xmlNodes ? 'CAPTURE_LIMIT' : 'INVALID_CAPTURE');
      if (!attrs.has('index') || !attrs.has('class') || !attrs.has('bounds') || !attrs.get('class'))
        return bad();
      for (const [key, value] of attrs) {
        if (!xmlAttributes.has(key)) return bad();
        if (xmlBools.has(key) && value !== 'true' && value !== 'false') return bad();
        if (['index', 'drawing-order'].includes(key) && !/^(0|[1-9][0-9]{0,8})$/.test(value))
          return bad();
      }
      const b = /^\[(-?[0-9]{1,6}),(-?[0-9]{1,6})\]\[(-?[0-9]{1,6}),(-?[0-9]{1,6})\]$/.exec(
        attrs.get('bounds') ?? '',
      );
      if (!b || Number(b[1]) > Number(b[3]) || Number(b[2]) > Number(b[4])) return bad();
      ordinal = normalized.length;
      const parentOrdinal = parents.at(-1) ?? null;
      const flags: Record<string, boolean | null> = Object.create(null);
      for (const key of xmlBools) flags[key] = attrs.has(key) ? attrs.get(key) === 'true' : null;
      const node = Object.freeze({
        ordinal,
        parentOrdinal,
        resourceId: attrs.get('resource-id') ?? null,
        contentDescription: attrs.get('content-desc') ?? null,
        text: attrs.get('text') ?? null,
        className: attrs.get('class') ?? '',
        packageName: attrs.get('package') ?? null,
        hint: attrs.get('hint') ?? null,
        index: Number(attrs.get('index')),
        drawingOrder: attrs.has('drawing-order') ? Number(attrs.get('drawing-order')) : null,
        bounds: Object.freeze([
          Number(b[1]) || 0,
          Number(b[2]) || 0,
          Number(b[3]) || 0,
          Number(b[4]) || 0,
        ]) as readonly [number, number, number, number],
        flags: Object.freeze(flags),
      });
      normalized.push({ node, children: [] });
      if (parentOrdinal !== null) {
        const parent = normalized[parentOrdinal];
        if (!parent) return bad();
        parent.children.push(ordinal);
      }
    }
    if (m[3] !== '/') {
      stack.push(name);
      parents.push(ordinal);
      if (stack.length > CAPTURE_LIMITS.xmlDepth) return bad('CAPTURE_LIMIT');
    }
  }
  if (!opened || !closed || stack.length) return bad();
  return Object.freeze({
    ok: true,
    tree: Object.freeze({
      version: 1,
      source: 'SUPPLIED_HIERARCHY_V1',
      encodedBytes: encoded.length,
      sha256: sha(encoded),
      evidence,
      nodes: Object.freeze(
        normalized.map(({ node, children }) =>
          Object.freeze({ ...node, childOrdinals: Object.freeze(children) }),
        ),
      ),
    }),
  });
}
export function validateHierarchyXml(input: unknown, display: unknown): HierarchyCaptureResult {
  const result = normalizeHierarchyXml(input, display);
  if (!result.ok) return result;
  const tree = result.tree;
  return Object.freeze({
    ok: true,
    format: 'HIERARCHY_XML',
    nodeCount: tree.nodes.length,
    encodedBytes: tree.encodedBytes,
    sha256: tree.sha256,
    evidence: tree.evidence,
  });
}

export function classifyCaptureEvidence(
  captured: unknown,
  current: unknown,
  now: unknown,
  connected: unknown,
): 'CURRENT' | 'STALE' | 'ROTATED' | 'DISCONNECTED' | 'BINDING_CHANGED' | 'INVALID_CAPTURE' {
  const a = snapshotDisplayEvidence(captured),
    b = snapshotDisplayEvidence(current);
  if (
    !a ||
    !b ||
    typeof connected !== 'boolean' ||
    typeof now !== 'number' ||
    !Number.isSafeInteger(now) ||
    Object.is(now, -0) ||
    now < 0 ||
    now > 8640000000000000
  )
    return 'INVALID_CAPTURE';
  if (!connected) return 'DISCONNECTED';
  if (
    a.deviceId !== b.deviceId ||
    a.bindingId !== b.bindingId ||
    a.generation !== b.generation ||
    a.serial !== b.serial
  )
    return 'BINDING_CHANGED';
  if (
    a.rotation !== b.rotation ||
    a.orientationEpoch !== b.orientationEpoch ||
    a.width !== b.width ||
    a.height !== b.height
  )
    return 'ROTATED';
  if (
    a.evidenceId !== b.evidenceId ||
    a.source !== b.source ||
    a.observedUtc !== b.observedUtc ||
    a.validUntilUtc !== b.validUntilUtc ||
    now < a.observedUtc ||
    now < b.observedUtc ||
    now >= a.validUntilUtc ||
    now >= b.validUntilUtc
  )
    return 'STALE';
  return 'CURRENT';
}
