// Portable real PNG decoding and synthetic Windows wire replies; no native/model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  ocrHeader,
  ocrRequest,
  ocrResult,
  PIXEL_SHA256,
  PNG_SHA256,
} from '../verification/vision-qualification-fixture.mjs';
const frame = (r, data = Buffer.alloc(0), raw = JSON.stringify(r)) => {
  const text = Buffer.from(raw),
    prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(text.length);
  return Buffer.concat([prefix, text, data]);
};
function preReply() {
  const { header: h, pixels } = fixture();
  const r = { version: 1, kind: 'PREPROCESS_RESULT' };
  for (const k of [
    'requestId',
    'captureId',
    'deviceId',
    'bindingId',
    'generation',
    'orientationEpoch',
    'pipelineId',
  ])
    r[k] = h[k];
  Object.assign(r, {
    status: 'PROCESSED',
    code: 'OK',
    sourcePixelSha256: h.sourcePixelSha256,
    inputSha256: h.inputSha256,
    outputWidth: 356,
    outputHeight: 74,
    outputBytes: pixels.length,
    outputSha256: PIXEL_SHA256,
    mapping: { originalWidth: 356, originalHeight: 74, roi: h.roi, numerator: 1, denominator: 1 },
    minIntensity: 0,
    maxIntensity: 255,
    clippedChannels: 0,
  });
  return { r, pixels };
}
function reply(overrides = {}) {
  const h = ocrHeader();
  return {
    version: 2,
    kind: 'OCR_EVALUATION_RESULT',
    scope: 'EVALUATION_ONLY',
    capability: 'UNQUALIFIED',
    requestId: h.requestId,
    captureId: h.captureId,
    deviceId: h.deviceId,
    bindingId: h.bindingId,
    generation: h.generation,
    orientationEpoch: h.orientationEpoch,
    language: 'EN',
    sourcePixelSha256: PIXEL_SHA256,
    inputSha256: PIXEL_SHA256,
    status: 'TEXT',
    code: 'OK',
    model: 'en_PP-OCRv5_mobile_rec',
    modelSha256: 'e595b4cf2ffad19fbb5a61ba345d63939577a3ab8717b6e5995642590c9101b4',
    text: 'Hello 123',
    rawScore: 0.95,
    modelLatencyMs: 120,
    memoryKind: 'WINDOWS_PEAK_WORKING_SET',
    peakWorkingSetBytes: 123456,
    ...overrides,
  };
}
test('real original PNG decoder emits bounded attributed preprocessing frame', () => {
  const f = fixture(),
    size = f.frame.readUInt32LE(0);
  assert.deepEqual(JSON.parse(f.frame.subarray(4, 4 + size)), f.header);
  assert.equal(f.pixels.length, 105376);
  assert.equal(f.header.inputSha256, PIXEL_SHA256);
  assert.deepEqual(f.frame.subarray(4 + size), Buffer.from(f.pixels));
});
test('synthetic actual-shape preprocessing reply feeds correlated OCR request', () => {
  const { r, pixels } = preReply();
  const wire = ocrRequest(frame(r, pixels));
  const size = wire.readUInt32LE(0);
  assert.deepEqual(JSON.parse(wire.subarray(4, 4 + size)), ocrHeader());
  assert.deepEqual(wire.subarray(4 + size), Buffer.from(pixels));
  for (const key of ['sourcePixelSha256', 'outputSha256', 'captureId'])
    assert.throws(() => ocrRequest(frame({ ...r, [key]: 'a'.repeat(64) }, pixels)));
  assert.throws(() => ocrRequest(frame(r, pixels.subarray(1))));
});
test('Windows v2 keeps raw case mismatch and peak working set distinct from Linux RSS', () => {
  const r = ocrResult(frame(reply()));
  assert.equal(r.row.label, 'HELLO 123');
  assert.equal(r.row.text, 'Hello 123');
  assert.equal(r.row.imageSha256, PNG_SHA256);
  assert.equal(r.row.split, 'SMOKE');
  assert.equal(r.row.endToEndLatencyMs, null);
  assert.equal(r.memoryKind, 'WINDOWS_PEAK_WORKING_SET');
  assert.equal(r.row.peakWorkingSetBytes, 123456);
  assert(!Object.hasOwn(r.row, 'peakRssBytes'));
  assert.equal(r.capability, 'UNQUALIFIED');
});
test('strict Windows consumer refuses malformed UTF8, duplicate decoded keys and trailing bytes', () => {
  const raw = JSON.stringify(reply());
  for (const bad of [
    raw.replace('"version":2', '"version":2,"version":2'),
    raw.replace('"version":2', '"version":2,"vers\\u0069on":2'),
    `${raw}x`,
  ])
    assert.throws(() => ocrResult(frame(null, Buffer.alloc(0), bad)));
  const bad = frame(reply());
  bad[bad.indexOf(Buffer.from('Hello'))] = 0xff;
  assert.throws(() => ocrResult(bad));
  assert.throws(() => ocrResult(Buffer.concat([frame(reply()), Buffer.from([0])])));
});
test('Windows consumer accepts legitimate Python float formats without canonical-string equality', () => {
  for (const [score, latency] of [
    ['1.0', '1.0'],
    ['0.0', '1e-07'],
  ]) {
    const raw = JSON.stringify(reply())
      .replace('"rawScore":0.95', `"rawScore":${score}`)
      .replace('"modelLatencyMs":120', `"modelLatencyMs":${latency}`);
    assert.equal(ocrResult(frame(null, Buffer.alloc(0), raw)).rawScore, Number(score));
  }
});
test('Windows consumer rejects mixed platform schema, correlation and invalid measurements', () => {
  for (const change of [
    { version: 1 },
    { memoryKind: 'LINUX_RSS' },
    { peakRssBytes: 1 },
    { peakWorkingSetBytes: -1 },
    { peakWorkingSetBytes: true },
    { requestId: '00000000-0000-4000-8000-000000000002' },
    { model: 'other' },
    { rawScore: 2 },
    { text: '\ud800' },
    { text: 'x'.repeat(1025) },
    { modelLatencyMs: 30001 },
    { scope: 'PRODUCTION' },
    { language: 'VI' },
  ])
    assert.throws(() => ocrResult(frame(reply(change))));
});
test('Windows unavailable retains missing measurement without success or zero placeholders', () => {
  const r = ocrResult(
    frame(
      reply({
        status: 'UNAVAILABLE',
        code: 'WORKER_UNAVAILABLE',
        text: null,
        rawScore: null,
        modelLatencyMs: null,
        peakWorkingSetBytes: null,
      }),
    ),
  );
  const memory = ocrResult(
    frame(
      reply({
        status: 'UNAVAILABLE',
        code: 'MEMORY_UNAVAILABLE',
        text: null,
        rawScore: null,
        modelLatencyMs: null,
        peakWorkingSetBytes: null,
      }),
    ),
  );
  assert.equal(memory.code, 'MEMORY_UNAVAILABLE');
  assert.equal(memory.row.status, 'UNAVAILABLE');
  assert.equal(r.row.status, 'UNAVAILABLE');
  assert.equal(r.row.peakWorkingSetBytes, null);
  assert.equal(r.row.text, null);
  assert.throws(() =>
    ocrResult(frame(reply({ status: 'UNAVAILABLE', code: 'WORKER_UNAVAILABLE' }))),
  );
});

test('source admission separates Windows managed ownership from unadmitted runtime', async () => {
  const { visionSourceAdmission } = await import('../scripts/vision-qualification.mjs');
  const context = {
    platform: 'win32',
    arch: 'x64',
    nodeVersion: '24.22.1',
    overrides: false,
    buildValid: true,
    mode: 'managed',
    candidate: null,
  };
  assert.equal(visionSourceAdmission(context), true);
  for (const change of [
    { platform: 'linux' },
    { arch: 'arm64' },
    { nodeVersion: '24.0.0' },
    { overrides: true },
    { buildValid: false },
    { mode: 'unknown' },
    { extra: true },
  ])
    assert.equal(visionSourceAdmission({ ...context, ...change }), false);
  assert.equal(visionSourceAdmission({ ...context, mode: 'runtime' }), false);
  const candidate = {
    scope: 'WINDOWS_X64_DEVELOPMENT_CANDIDATE',
    approvedInstalledInventorySha256: 'a'.repeat(64),
    prerequisitesVerifiedOnHost: true,
  };
  assert.equal(visionSourceAdmission({ ...context, mode: 'runtime', candidate }), true);
  for (const change of [
    { approvedInstalledInventorySha256: null },
    { approvedInstalledInventorySha256: 'g'.repeat(64) },
    { prerequisitesVerifiedOnHost: false },
    { scope: 'PRODUCTION' },
  ])
    assert.equal(
      visionSourceAdmission({
        ...context,
        mode: 'runtime',
        candidate: { ...candidate, ...change },
      }),
      false,
    );
  let touched = 0;
  const trapped = { ...context };
  Object.defineProperty(trapped, 'buildValid', {
    get() {
      touched++;
      return true;
    },
  });
  assert.equal(visionSourceAdmission(trapped), false);
  assert.equal(touched, 0);
});

test('Windows workflow compiles by default and keeps actual native ownership explicit, never OCR', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(
    new URL('../../.github/workflows/phase-04-vision.yml', import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
  function closed(s) {
    assert.match(s, /branches: \[phase-04\]/);
    assert.match(s, /permissions:\n {2}contents: read\njobs:/);
    assert.match(s, /persist-credentials: false/);
    assert.match(s, /runs-on: windows-2022\n {4}timeout-minutes: 15/);
    assert.match(s, /run_native_ownership:[\s\S]*?default: false/);
    assert.match(
      s,
      /if: github.ref == 'refs\/heads\/phase-04' && github.event_name == 'workflow_dispatch' && inputs.run_native_ownership == true/,
    );
    assert.match(s, /Invoke-VisionQualification.ps1 -Mode Compile/);
    assert.match(s, /run_vision_source_tests.py/);
    assert(!s.includes('-Mode Runtime'));
    assert(!s.includes('pip install'));
    assert(!s.includes('upload-artifact'));
    assert.match(s, /WINDOWS_OCR_MODEL_NOT_RUN/);
  }
  closed(raw);
  for (const changed of [
    raw.replace('default: false', 'default: true'),
    raw.replace('contents: read', 'contents: write'),
    raw.replace('&& inputs.run_native_ownership == true', '|| inputs.run_native_ownership == true'),
    raw.replace('-Mode Compile', '-Mode Runtime'),
  ])
    assert.throws(() => closed(changed));
});
