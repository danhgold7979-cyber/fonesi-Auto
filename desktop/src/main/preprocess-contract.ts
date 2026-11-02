import { createHash } from 'node:crypto';
export const PREPROCESS_PIPELINE = 'SUPPLIED_OPENCV_PREPROCESS_V1';
export const PREPROCESS_BYTES = 16 * 1024 * 1024;
export type PreprocessCode =
  | 'OK'
  | 'INVALID_INPUT'
  | 'INPUT_LIMIT'
  | 'UNSUPPORTED_ALPHA'
  | 'INVALID_ROI'
  | 'INVALID_SCALE'
  | 'WORKER_UNAVAILABLE'
  | 'BUSY'
  | 'DEADLINE_EXCEEDED'
  | 'CANCELLED'
  | 'WORKER_FAILED'
  | 'MALFORMED_REPLY'
  | 'CONTEXT_CHANGED'
  | 'UNRETIRED';
export type Roi = Readonly<{ x: number; y: number; width: number; height: number }>;
export type Scale = 'HALF' | 'ONE' | 'DOUBLE';
export type Contrast = 'IDENTITY' | 'GAIN_125';
export type Mapping = Readonly<{
  pipelineId: string;
  sourcePixelSha256: string;
  inputSha256: string;
  requestId: string;
  captureId: string;
  deviceId: string;
  bindingId: string;
  generation: number;
  orientationEpoch: number;
  contextRevision: number;
  originalWidth: number;
  originalHeight: number;
  roi: Roi;
  numerator: number;
  denominator: number;
}>;
export type Header = Readonly<{
  version: 1;
  kind: 'PREPROCESS';
  requestId: string;
  captureId: string;
  deviceId: string;
  bindingId: string;
  generation: number;
  orientationEpoch: number;
  pipelineId: typeof PREPROCESS_PIPELINE;
  inputWidth: number;
  inputHeight: number;
  inputBytes: number;
  sourcePixelSha256: string;
  inputSha256: string;
  roi: Roi;
  scale: Scale;
  contrast: Contrast;
}>;
export const digest = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');
export const safeInteger = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min && v <= max;
export function ownRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const names = Reflect.ownKeys(value);
    if (
      names.length !== keys.length ||
      names.some((k) => typeof k !== 'string' || !keys.includes(k))
    )
      return null;
    const r: Record<string, unknown> = Object.create(null);
    for (const k of keys) {
      const d = Object.getOwnPropertyDescriptor(value, k);
      if (!d || !('value' in d) || !d.enumerable) return null;
      r[k] = d.value;
    }
    return r;
  } catch {
    return null;
  }
}
export function snapshotRoi(v: unknown, width: number, height: number): Roi | null {
  const r = ownRecord(v, ['x', 'y', 'width', 'height']);
  if (
    !r ||
    !safeInteger(r.x) ||
    !safeInteger(r.y) ||
    !safeInteger(r.width, 1) ||
    !safeInteger(r.height, 1) ||
    r.width > width ||
    r.height > height ||
    r.x > width - r.width ||
    r.y > height - r.height
  )
    return null;
  return Object.freeze({ x: r.x, y: r.y, width: r.width, height: r.height });
}
export function dimensions(roi: Roi, scale: Scale): readonly [number, number] | null {
  if (scale === 'HALF' && (roi.width % 2 || roi.height % 2)) return null;
  const factor = scale === 'HALF' ? 0.5 : scale === 'DOUBLE' ? 2 : 1;
  const w = roi.width * factor,
    h = roi.height * factor;
  return safeInteger(w, 1, 4096) && safeInteger(h, 1, 4096) && w * h <= 4194304
    ? Object.freeze([w, h])
    : null;
}
export function mappingFor(h: Header, contextRevision: number): Mapping {
  return Object.freeze({
    pipelineId: h.pipelineId,
    sourcePixelSha256: h.sourcePixelSha256,
    inputSha256: h.inputSha256,
    requestId: h.requestId,
    captureId: h.captureId,
    deviceId: h.deviceId,
    bindingId: h.bindingId,
    generation: h.generation,
    orientationEpoch: h.orientationEpoch,
    contextRevision,
    originalWidth: h.inputWidth,
    originalHeight: h.inputHeight,
    roi: h.roi,
    numerator: h.scale === 'DOUBLE' ? 2 : 1,
    denominator: h.scale === 'HALF' ? 2 : 1,
  });
}
// Rational image-edge mapping, not a device/action coordinate capability.
export function sourceEdge(
  mapping: Mapping,
  x: number,
  y: number,
): Readonly<{ xNumerator: number; yNumerator: number; denominator: number }> | null {
  if (!geometryValid(mapping)) return null;
  const w = (mapping.roi.width * mapping.numerator) / mapping.denominator,
    h = (mapping.roi.height * mapping.numerator) / mapping.denominator;
  if (!safeInteger(x, 0, w) || !safeInteger(y, 0, h)) return null;
  return Object.freeze({
    xNumerator: mapping.roi.x * mapping.numerator + x * mapping.denominator,
    yNumerator: mapping.roi.y * mapping.numerator + y * mapping.denominator,
    denominator: mapping.numerator,
  });
}
export type RationalEdge = Readonly<{
  xNumerator: number;
  yNumerator: number;
  denominator: number;
}>;
export type RationalRectangle = Readonly<{
  leftNumerator: number;
  topNumerator: number;
  rightNumerator: number;
  bottomNumerator: number;
  denominator: number;
}>;
function geometryValid(m: Mapping): boolean {
  return (
    safeInteger(m.originalWidth, 1, 4096) &&
    safeInteger(m.originalHeight, 1, 4096) &&
    m.originalWidth * m.originalHeight <= 4194304 &&
    !!snapshotRoi(m.roi, m.originalWidth, m.originalHeight) &&
    ((m.numerator === 1 && (m.denominator === 1 || m.denominator === 2)) ||
      (m.numerator === 2 && m.denominator === 1)) &&
    !!dimensions(m.roi, m.denominator === 2 ? 'HALF' : m.numerator === 2 ? 'DOUBLE' : 'ONE')
  );
}
// Forward rational source edge; accepts the exact half-pixel values produced by
// sourceEdge. No float rounding, screenshot acquisition, or action authority.
export function outputEdge(m: Mapping, point: RationalEdge): RationalEdge | null {
  if (
    !geometryValid(m) ||
    !safeInteger(point.denominator, 1, 2) ||
    !safeInteger(point.xNumerator, 0, 8192) ||
    !safeInteger(point.yNumerator, 0, 8192)
  )
    return null;
  const x = point.xNumerator - m.roi.x * point.denominator,
    y = point.yNumerator - m.roi.y * point.denominator;
  if (x < 0 || y < 0 || x > m.roi.width * point.denominator || y > m.roi.height * point.denominator)
    return null;
  let nx = x * m.numerator,
    ny = y * m.numerator,
    d = point.denominator * m.denominator;
  while (d % 2 === 0 && nx % 2 === 0 && ny % 2 === 0) {
    nx /= 2;
    ny /= 2;
    d /= 2;
  }
  return Object.freeze({ xNumerator: nx, yNumerator: ny, denominator: d });
}
export function sourceRectangle(m: Mapping, rect: Roi): RationalRectangle | null {
  if (!geometryValid(m)) return null;
  const w = (m.roi.width * m.numerator) / m.denominator,
    h = (m.roi.height * m.numerator) / m.denominator;
  const r = snapshotRoi(rect, w, h);
  if (!r) return null;
  const a = sourceEdge(m, r.x, r.y),
    b = sourceEdge(m, r.x + r.width, r.y + r.height);
  if (!a || !b) return null;
  return Object.freeze({
    leftNumerator: a.xNumerator,
    topNumerator: a.yNumerator,
    rightNumerator: b.xNumerator,
    bottomNumerator: b.yNumerator,
    denominator: a.denominator,
  });
}
export function outputRectangle(m: Mapping, rect: RationalRectangle): RationalRectangle | null {
  if (
    !geometryValid(m) ||
    !safeInteger(rect.denominator, 1, 2) ||
    ![rect.leftNumerator, rect.topNumerator, rect.rightNumerator, rect.bottomNumerator].every((v) =>
      safeInteger(v, 0, 8192),
    ) ||
    rect.leftNumerator >= rect.rightNumerator ||
    rect.topNumerator >= rect.bottomNumerator
  )
    return null;
  const a = outputEdge(m, {
      xNumerator: rect.leftNumerator,
      yNumerator: rect.topNumerator,
      denominator: rect.denominator,
    }),
    b = outputEdge(m, {
      xNumerator: rect.rightNumerator,
      yNumerator: rect.bottomNumerator,
      denominator: rect.denominator,
    });
  if (!a || !b) return null;
  const denominator = Math.max(a.denominator, b.denominator);
  return Object.freeze({
    leftNumerator: a.xNumerator * (denominator / a.denominator),
    topNumerator: a.yNumerator * (denominator / a.denominator),
    rightNumerator: b.xNumerator * (denominator / b.denominator),
    bottomNumerator: b.yNumerator * (denominator / b.denominator),
    denominator,
  });
}
export function coverSourceRectangle(m: Mapping, rect: Roi): Roi | null {
  const r = sourceRectangle(m, rect);
  if (!r) return null;
  const x = Math.floor(r.leftNumerator / r.denominator),
    y = Math.floor(r.topNumerator / r.denominator),
    right = Math.ceil(r.rightNumerator / r.denominator),
    bottom = Math.ceil(r.bottomNumerator / r.denominator);
  return snapshotRoi(
    { x, y, width: right - x, height: bottom - y },
    m.originalWidth,
    m.originalHeight,
  );
}
export function encodePreprocessFrame(header: Header, rgba: Uint8Array): Buffer {
  const b = Buffer.from(JSON.stringify(header));
  if (
    b.length > 4096 ||
    rgba.length > PREPROCESS_BYTES ||
    rgba.length !== header.inputBytes ||
    digest(rgba) !== header.inputSha256
  )
    throw new Error('INVALID_INPUT');
  const size = Buffer.alloc(4);
  size.writeUInt32LE(b.length);
  return Buffer.concat([size, b, rgba]);
}
export type ParsedReply = Readonly<{
  code: PreprocessCode;
  rgba: Uint8Array | null;
  outputSha256: string | null;
  statistics: Readonly<{
    minIntensity: number;
    maxIntensity: number;
    clippedChannels: number;
  }> | null;
}>;
export function parsePreprocessReply(bytes: Buffer, h: Header): ParsedReply | null {
  try {
    if (bytes.length < 4 || bytes.length > PREPROCESS_BYTES + 4100) return null;
    const n = bytes.readUInt32LE(0);
    if (!n || n > 4096 || bytes.length < 4 + n) return null;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + n));
    const r = JSON.parse(text);
    const keys = [
      'version',
      'kind',
      'requestId',
      'captureId',
      'deviceId',
      'bindingId',
      'generation',
      'orientationEpoch',
      'pipelineId',
      'status',
      'code',
      'sourcePixelSha256',
      'inputSha256',
      'outputWidth',
      'outputHeight',
      'outputBytes',
      'outputSha256',
      'mapping',
      'minIntensity',
      'maxIntensity',
      'clippedChannels',
    ];
    if (
      !ownRecord(r, keys) ||
      JSON.stringify(r) !== text ||
      Object.keys(r).join(',') !== keys.join(',')
    )
      return null;
    if (
      r.version !== 1 ||
      r.kind !== 'PREPROCESS_RESULT' ||
      [
        'requestId',
        'captureId',
        'deviceId',
        'bindingId',
        'generation',
        'orientationEpoch',
        'pipelineId',
        'sourcePixelSha256',
        'inputSha256',
      ].some((k) => r[k] !== h[k as keyof Header])
    )
      return null;
    const pixels = bytes.subarray(4 + n);
    if (r.status === 'REFUSED') {
      if (
        ![
          'INVALID_INPUT',
          'INPUT_LIMIT',
          'UNSUPPORTED_ALPHA',
          'INVALID_ROI',
          'INVALID_SCALE',
          'WORKER_FAILED',
        ].includes(r.code) ||
        r.outputBytes !== 0 ||
        pixels.length ||
        [
          'outputWidth',
          'outputHeight',
          'outputSha256',
          'mapping',
          'minIntensity',
          'maxIntensity',
          'clippedChannels',
        ].some((k) => r[k] !== null)
      )
        return null;
      return Object.freeze({ code: r.code, rgba: null, outputSha256: null, statistics: null });
    }
    const dim = dimensions(h.roi, h.scale);
    const map = {
      originalWidth: h.inputWidth,
      originalHeight: h.inputHeight,
      roi: h.roi,
      numerator: h.scale === 'DOUBLE' ? 2 : 1,
      denominator: h.scale === 'HALF' ? 2 : 1,
    };
    if (
      !dim ||
      r.status !== 'PROCESSED' ||
      r.code !== 'OK' ||
      r.outputWidth !== dim[0] ||
      r.outputHeight !== dim[1] ||
      r.outputBytes !== dim[0] * dim[1] * 4 ||
      pixels.length !== r.outputBytes ||
      r.outputSha256 !== digest(pixels) ||
      JSON.stringify(r.mapping) !== JSON.stringify(map)
    )
      return null;
    let min = 255,
      max = 0;
    for (let i = 0; i < pixels.length; i++) {
      const v = pixels[i] ?? 0;
      if (i % 4 === 3) {
        if (v !== 255) return null;
      } else {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (
      r.minIntensity !== min ||
      r.maxIntensity !== max ||
      !safeInteger(r.clippedChannels, 0, dim[0] * dim[1] * 3) ||
      (h.contrast === 'IDENTITY' && r.clippedChannels !== 0)
    )
      return null;
    return Object.freeze({
      code: 'OK',
      rgba: new Uint8Array(pixels),
      outputSha256: r.outputSha256,
      statistics: Object.freeze({
        minIntensity: min,
        maxIntensity: max,
        clippedChannels: r.clippedChannels,
      }),
    });
  } catch {
    return null;
  }
}
