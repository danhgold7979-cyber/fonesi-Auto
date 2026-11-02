// Fixed synthetic Windows qualification producer/consumer. No application authority.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { decodePreprocessPng } from '../src/main/capture-contract.ts';
import {
  digest,
  encodePreprocessFrame,
  parsePreprocessReply,
  ownRecord,
  safeInteger,
} from '../src/main/preprocess-contract.ts';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAWQAAABKCAYAAACMyi7SAAADa0lEQVR4nO3UMQ7cMAwEwPv/p5MibVzYMsWlNQNcdyCWkry/PwBE+HUHAOAfhQwQQiEDhFDIACEUMkAIhQwQQiEDhFDIACEUMkAIhQwQQiEDhFDIACEUMkAIhQwQQiEDhFgu5N/v99/fW+7Ov/p/9a/rfO5Ky3Ol+l6+quscuu6r67uuopAVcmRxTf2guilkhayQFfLrpn5Q3RSyQlbICvl1Uz+obgpZIStkhfy6qR9UN4WskBWyQn7d1A+qm0JWyCMKuYs8vXnS9n1LV7FMn5+eRyEXk6c3T9q+b1HIeyjkxfmnX6g8e+d3Uch7KOTF+adfqDx753dRyHso5MX5p1+oPHvnd1HIeyjkxfmnX6g8e+d3Uch7KOTF+adfqDx756eZvm9afoW8OP/0C5Vn7/w00/dNy6+QF+effqHy7J2fZvq+afkV8uL80y9Unr3z00zfNy2/Ql6cf/qFyrN3fprp+6blV8iL80+/UHn2zk8zfd+0/J8p5OpfV563zqfLaXnS9q02Zd+ue6/+3pdzLw9QyI/Op8tpedL2rTZlX4V8kXt5gEJ+dD5dTsuTtm+1Kfsq5IvcywMU8qPz6XJanrR9q03ZVyFf5F4eoJAfnU+X0/Kk7Vttyr4K+SL38gCF/Oh8upyWJ23falP2VcgXuZcHhH1QKQcrT0aetH2rpe2blueu3fkVcjF5evOk7Vstbd+0PHcp5MX5aQ9Ant48aftWS9s3Lc9dCnlxftoDkKc3T9q+1dL2Tctzl0JenJ/2AOTpzZO2b7W0fdPy3KWQF+enPQB5evOk7Vstbd+0PHcp5MX5aQ9Ant48aftW69r3q+eskBfnpz0MeXrzpO1bTSG/SyEvzk97GPL05knbt5pCfpdCXpyf9jDk6c2Ttm81hfwuhbw4P+1hyNObJ23fagr5XQp5cX7aw5CnN0/avtUU8rsU8uL8q/9X/+R5lqc651dNv5cp73k3hTz8wUzPU53zq6bfy5T3vJtCHv5gpuepzvlV0+9lynveTSEPfzDT81Tn/Krp9zLlPe+mkIc/mOl5qnN+1fR7mfKed1PIwx/M9DzVOb9q+r1Mec+7fffFAgyjkAFCKGSAEAoZIIRCBgihkAFCKGSAEAoZIIRCBgihkAFCKGSAEAoZIIRCBgihkAFCKGSAEAoZIMRf/SAI5tZPH4oAAAAASUVORK5CYII=',
  'base64',
);
export const PNG_SHA256 = 'cd11a692aa4cbbcbff4e676b857ba522df64a856a8d294655a74a6e8b610cdf1';
export const PIXEL_SHA256 = '3de7adff61496431151de23be70a07fd545988d1bfc14df54ee1701893acef00';
const MODEL_SHA256 = 'e595b4cf2ffad19fbb5a61ba345d63939577a3ab8717b6e5995642590c9101b4';
const UID = '00000000-0000-4000-8000-000000000001';
export function fixture() {
  if (digest(PNG) !== PNG_SHA256) throw Error('FIXTURE');
  const now = Date.now();
  const display = {
    version: 1,
    evidenceId: UID,
    deviceId: UID,
    bindingId: UID,
    generation: 1,
    serial: 'synthetic',
    displayId: 0,
    width: 356,
    height: 74,
    rotation: 0,
    orientationEpoch: 0,
    observedUtc: now,
    validUntilUtc: now + 60000,
    source: 'SYNTHETIC_TEST',
  };
  const decoded = decodePreprocessPng(PNG, display);
  if (
    !decoded.ok ||
    decoded.channels !== 4 ||
    decoded.pixelSha256 !== PIXEL_SHA256 ||
    digest(decoded.pixels) !== PIXEL_SHA256
  )
    throw Error('FIXTURE');
  const header = {
    version: 1,
    kind: 'PREPROCESS',
    requestId: UID,
    captureId: UID,
    deviceId: UID,
    bindingId: UID,
    generation: 1,
    orientationEpoch: 0,
    pipelineId: 'SUPPLIED_OPENCV_PREPROCESS_V1',
    inputWidth: 356,
    inputHeight: 74,
    inputBytes: decoded.pixels.length,
    sourcePixelSha256: PIXEL_SHA256,
    inputSha256: PIXEL_SHA256,
    roi: { x: 0, y: 0, width: 356, height: 74 },
    scale: 'ONE',
    contrast: 'IDENTITY',
  };
  return { header, pixels: decoded.pixels, frame: encodePreprocessFrame(header, decoded.pixels) };
}
export function ocrHeader() {
  return {
    version: 1,
    kind: 'OCR_EVALUATION',
    requestId: UID,
    captureId: UID,
    deviceId: UID,
    bindingId: UID,
    generation: 1,
    orientationEpoch: 0,
    language: 'EN',
    sourcePixelSha256: PIXEL_SHA256,
    inputSha256: PIXEL_SHA256,
    width: 356,
    height: 74,
    inputBytes: 105376,
  };
}
export function ocrRequest(bytes) {
  const parsed = parsePreprocessReply(bytes, fixture().header);
  if (
    parsed?.code !== 'OK' ||
    parsed.outputSha256 !== PIXEL_SHA256 ||
    !parsed.rgba ||
    parsed.rgba.length !== 105376
  )
    throw Error('PREPROCESS_REPLY');
  const raw = Buffer.from(JSON.stringify(ocrHeader()));
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(raw.length);
  return Buffer.concat([prefix, raw, parsed.rgba]);
}
function flatReplyJson(raw) {
  // Fixed flat scalar schema: no nesting, duplicate decoded keys or permissive UTF8.
  let offset = 0;
  const record = Object.create(null);
  const whitespace = () => {
    while (/[ \t\r\n]/.test(raw[offset] ?? '') && offset < raw.length) offset++;
  };
  const scalar =
    /"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null/y;
  const token = () => {
    whitespace();
    scalar.lastIndex = offset;
    const match = scalar.exec(raw);
    if (!match) throw new Error('JSON');
    offset = scalar.lastIndex;
    return match[0];
  };
  whitespace();
  if (raw[offset++] !== '{') throw new Error('JSON');
  for (let count = 0; count < 32; count++) {
    const keyToken = token();
    if (!keyToken.startsWith('"')) throw new Error('JSON');
    const key = JSON.parse(keyToken);
    if (Object.hasOwn(record, key)) throw new Error('JSON_DUPLICATE');
    whitespace();
    if (raw[offset++] !== ':') throw new Error('JSON');
    record[key] = JSON.parse(token());
    whitespace();
    const end = raw[offset++];
    if (end === '}') {
      whitespace();
      if (offset !== raw.length) throw new Error('JSON');
      return record;
    }
    if (end !== ',') throw new Error('JSON');
  }
  throw new Error('JSON_LIMIT');
}

export function ocrResult(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 5 ||
    bytes.length > 16384 ||
    bytes.readUInt32LE(0) !== bytes.length - 4
  )
    throw Error('OCR_REPLY');
  const value = flatReplyJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4)));
  const r = ownRecord(value, [
    'version',
    'kind',
    'scope',
    'capability',
    'requestId',
    'captureId',
    'deviceId',
    'bindingId',
    'generation',
    'orientationEpoch',
    'language',
    'sourcePixelSha256',
    'inputSha256',
    'status',
    'code',
    'model',
    'modelSha256',
    'text',
    'rawScore',
    'modelLatencyMs',
    'memoryKind',
    'peakWorkingSetBytes',
  ]);
  if (
    r?.version !== 2 ||
    r.kind !== 'OCR_EVALUATION_RESULT' ||
    r.scope !== 'EVALUATION_ONLY' ||
    r.capability !== 'UNQUALIFIED' ||
    r.memoryKind !== 'WINDOWS_PEAK_WORKING_SET'
  )
    throw Error('OCR_REPLY');
  const h = ocrHeader();
  for (const k of [
    'requestId',
    'captureId',
    'deviceId',
    'bindingId',
    'generation',
    'orientationEpoch',
    'language',
    'sourcePixelSha256',
    'inputSha256',
  ])
    if (r[k] !== h[k]) throw Error('OCR_CORRELATION');
  if (
    r.model !== 'en_PP-OCRv5_mobile_rec' ||
    r.modelSha256 !== MODEL_SHA256 ||
    (r.peakWorkingSetBytes !== null && !safeInteger(r.peakWorkingSetBytes))
  )
    throw Error('OCR_MODEL');
  if (r.status === 'UNAVAILABLE') {
    if (
      !['WORKER_UNAVAILABLE', 'MEMORY_UNAVAILABLE'].includes(r.code) ||
      r.text !== null ||
      r.rawScore !== null ||
      r.modelLatencyMs !== null
    )
      throw Error('OCR_UNAVAILABLE');
  } else if (
    !['TEXT', 'NO_TEXT'].includes(r.status) ||
    r.code !== 'OK' ||
    typeof r.text !== 'string' ||
    Buffer.byteLength(r.text) > 4096 ||
    [...r.text].length > 1024 ||
    Buffer.from(r.text).toString('utf8') !== r.text ||
    (r.status === 'TEXT') !== r.text.length > 0 ||
    typeof r.rawScore !== 'number' ||
    !Number.isFinite(r.rawScore) ||
    r.rawScore < 0 ||
    r.rawScore > 1 ||
    typeof r.modelLatencyMs !== 'number' ||
    !Number.isFinite(r.modelLatencyMs) ||
    r.modelLatencyMs < 0 ||
    r.modelLatencyMs > 30000 ||
    !safeInteger(r.peakWorkingSetBytes)
  )
    throw Error('OCR_VALUE');
  return {
    version: 2,
    scope: 'EVALUATION_ONLY',
    capability: 'UNQUALIFIED',
    memoryKind: r.memoryKind,
    modelSha256: r.modelSha256,
    sourcePixelSha256: r.sourcePixelSha256,
    inputSha256: r.inputSha256,
    rawScore: r.rawScore,
    code: r.code,
    row: {
      id: 'original-en-bitmap-smoke',
      imageSha256: PNG_SHA256,
      language: 'EN',
      split: 'SMOKE',
      label: 'HELLO 123',
      status: r.status,
      text: r.text,
      temperature: 'COLD',
      modelLatencyMs: r.modelLatencyMs,
      endToEndLatencyMs: null,
      peakWorkingSetBytes: r.peakWorkingSetBytes,
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2];
    if (process.argv.length === 2) process.stdout.write(fixture().frame);
    else if (process.argv.length === 3 && ['preprocess-reply', 'ocr-reply'].includes(mode)) {
      const chunks = [];
      let size = 0;
      for await (const chunk of process.stdin) {
        size += chunk.length;
        if (size > 131072) throw Error('INPUT_LIMIT');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      process.stdout.write(
        mode === 'preprocess-reply'
          ? ocrRequest(bytes)
          : Buffer.from(JSON.stringify(ocrResult(bytes))),
      );
    } else throw Error('ARGUMENTS');
  } catch {
    process.stderr.write('VISION_FIXTURE_REFUSED\n');
    process.exitCode = 2;
  }
}
