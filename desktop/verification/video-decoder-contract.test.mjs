import { TILE_VIDEO_FAILURE_REASONS } from '../src/video-decoder.ts';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseFleetRequest, fleetSuccess, parseFleetResponse } from '../src/fleet-contract.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_QUALIFICATION_SCOPE as scope,
  VIDEO_QUALIFICATION_CASES as cases,
  VIDEO_QUALIFICATION_INPUTS as inputs,
  validateVideoQualification,
  exact,
  validPixels,
  validateVideoDiagnostic,
  validateVideoGeometry,
  validateVideoObservation,
  VIDEO_OBSERVATION_FIELDS,
  VIDEO_OBSERVATION_STEPS,
  VIDEO_GEOMETRY_FIELDS,
  validateVideoSupervisor,
  validateVideoEvidence,
  VIDEO_DIAGNOSTIC_STAGES,
  VIDEO_DIAGNOSTIC_STATES,
} from './video-decoder-contract.mjs';
const valid = () => ({
  version: 1,
  scope,
  head: 'a'.repeat(40),
  electron: '45.1.0',
  node: '24.22.1',
  inputs: Object.fromEntries(inputs.map((k) => [k, 'b'.repeat(64)])),
  cases: Object.fromEntries(cases.map((k) => [k, true])),
  landscape: {
    width: 32,
    height: 16,
    letterbox: [252, 250, 248, 255],
    box: [100, 100, 150, 280],
    tile: [100, 80, 160, 320],
    dark: [0, 0, 0, 255],
    light: [255, 255, 255, 255],
  },
  portrait: {
    width: 16,
    height: 32,
    letterbox: [252, 250, 248, 255],
    box: [100, 100, 150, 280],
    tile: [100, 80, 160, 320],
    dark: [8, 8, 8, 255],
    light: [247, 247, 247, 255],
  },
});
test('only complete fixed runtime and both rendered orientations qualify', () => {
  assert.equal(validateVideoQualification(valid()), true);
  for (const key of Object.keys(valid())) {
    const v = valid();
    delete v[key];
    assert.equal(validateVideoQualification(v), false);
  }
  assert.equal(validateVideoQualification({ ...valid(), extra: true }), false);
});
test('every required lifecycle case and every source digest is mandatory', () => {
  for (const key of cases) {
    for (const value of [false, null, 'true', 1]) {
      const v = valid();
      v.cases[key] = value;
      assert.equal(validateVideoQualification(v), false);
    }
  }
  for (const key of inputs) {
    const v = valid();
    v.inputs[key] = 'a'.repeat(63);
    assert.equal(validateVideoQualification(v), false);
  }
});
test('runtime, source head and scope are exact, not coercible', () => {
  for (const [key, value] of [
    ['version', 2],
    ['scope', 'DEVICE'],
    ['electron', '45.1.1'],
    ['node', '24.22.0'],
    ['head', 'A'.repeat(40)],
    ['head', { toString: () => 'a'.repeat(40) }],
  ]) {
    assert.equal(validateVideoQualification({ ...valid(), [key]: value }), false);
  }
});
test('pixel oracle rejects stretched orientation labels, transparent or wrong color output', () => {
  for (const field of ['landscape', 'portrait'])
    for (const mutation of [
      (p) => (p.dark[0] = 9),
      (p) => (p.letterbox = [250, 250, 250, 255]),
      (p) => (p.box[2] = 0),
      (p) => (p.light[1] = 246),
      (p) => (p.light[3] = 0),
      (p) => p.dark.push(0),
      (p) => (p.width = 17),
      (p) => (p.dark[1] = NaN),
    ]) {
      const v = valid();
      mutation(v[field]);
      assert.equal(validateVideoQualification(v), false);
    }
  const v = valid();
  [v.landscape, v.portrait] = [v.portrait, v.landscape];
  assert.equal(validateVideoQualification(v), false);
});
test('descriptor checks reject accessors and symbols without executing getter', () => {
  let called = false;
  const o = {};
  Object.defineProperty(o, 'x', {
    enumerable: true,
    get() {
      called = true;
      throw Error();
    },
  });
  assert.equal(exact(o, ['x']), false);
  assert.equal(called, false);
  assert.equal(exact({ x: 1, [Symbol()]: 2 }, ['x']), false);
  assert.equal(exact([], []), false);
  assert.equal(validPixels(null), false);
});

test('actual verification fleet response selects the synthetic tile required by unchanged screen wall', () => {
  const source = readFileSync(new URL('./video-decoder-probe.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("fixedRead('foundation:fleet:v1'"),
    end = source.indexOf("fixedRead('foundation:platform-tools:v2'", start);
  assert.ok(start > 0 && end > start);
  const DEVICE = '11111111-1111-4111-8111-111111111111';
  let raw;
  runInNewContext(
    source.slice(start, end),
    {
      DEVICE,
      parseFleetRequest,
      fleetSuccess: (...args) => fleetSuccess(...JSON.parse(JSON.stringify(args))),
      fixedRead(channel, parse, method, answer) {
        assert.equal(channel, 'foundation:fleet:v1');
        assert.equal(parse, parseFleetRequest);
        assert.equal(method, 'fleet.get');
        raw = answer({ requestId: 'f1' });
      },
    },
    { timeout: 1000 },
  );
  const value = parseFleetResponse(raw);
  assert.equal(value?.ok, true);
  assert.deepEqual(value.fleet.selection.selectedDeviceIds, [DEVICE]);
  assert.equal(value.fleet.selection.activeDeviceId, DEVICE);
  assert.equal(value.fleet.devices.length, 1);
  assert.equal(value.fleet.devices[0].verification, 'VERIFIED');
});

const supervisor = () => ({
  version: 1,
  scope,
  head: 'a'.repeat(40),
  process: {
    status: 'NONZERO_EXIT',
    exitCode: 1,
    cleanupComplete: true,
    stdoutTruncated: false,
    stderrTruncated: false,
  },
  directoryCleanup: true,
  cleanupFailure: null,
  passed: false,
  failure: 'DECODE_FAILED',
});
test('failure diagnostics admit only fixed stages, states, cases and bound digests', () => {
  const base = valid(),
    d = {
      version: 1,
      scope,
      head: base.head,
      inputs: base.inputs,
      stage: 'LANDSCAPE_OUTPUT',
      rendererState: 'WAITING_KEY',
      geometry: null,
      observation: null,
      cases: base.cases,
    };
  for (const stage of VIDEO_DIAGNOSTIC_STAGES)
    assert.equal(validateVideoDiagnostic({ ...d, stage }), true);
  for (const patch of [
    { stage: 'secret path' },
    { rendererState: 'raw exception' },
    { extra: 'private' },
    { inputs: {} },
    { head: 'b' },
  ])
    assert.equal(validateVideoDiagnostic({ ...d, ...patch }), false);
  const bad = structuredClone(d);
  bad.cases.displaying = 'true';
  assert.equal(validateVideoDiagnostic(bad), false);
});
test('supervisor retains failures and rejects contradictory pass or process claims', () => {
  const s = supervisor();
  assert.equal(validateVideoSupervisor(s), true);
  for (const patch of [
    { passed: true },
    { failure: null },
    { private: 'secret' },
    { process: { ...s.process, exitCode: 0 } },
    { process: { ...s.process, status: 'SUCCESS' } },
    { process: { ...s.process, cleanupComplete: 'true' } },
  ])
    assert.equal(validateVideoSupervisor({ ...s, ...patch }), false);
  const success = {
    ...s,
    passed: true,
    failure: null,
    process: { ...s.process, status: 'SUCCESS', exitCode: 0 },
  };
  assert.equal(validateVideoSupervisor(success), true);
  assert.equal(validateVideoSupervisor({ ...success, directoryCleanup: false }), false);
});
test('sanitized aggregate cannot promote failed or missing pixel evidence to pass', () => {
  const s = supervisor(),
    v = { version: 1, scope, head: s.head, supervisor: s, diagnostic: null, result: null };
  assert.equal(validateVideoEvidence(v), true);
  const result = valid(),
    diagnostic = {
      version: 1,
      scope,
      head: s.head,
      inputs: result.inputs,
      stage: 'LANDSCAPE_OUTPUT',
      rendererState: 'DECODING',
      geometry: null,
      observation: null,
      cases: result.cases,
    };
  for (const process of [
    null,
    { ...s.process, cleanupComplete: false },
    { ...s.process, status: 'TIMEOUT', exitCode: null },
  ]) {
    const uncertain = {
      ...s,
      process,
      directoryCleanup: false,
      cleanupFailure: 'RETIREMENT_UNCONFIRMED',
    };
    assert.equal(validateVideoEvidence({ ...v, supervisor: uncertain }), true);
    assert.equal(validateVideoEvidence({ ...v, supervisor: uncertain, diagnostic }), false);
    assert.equal(validateVideoEvidence({ ...v, supervisor: uncertain, result }), false);
    if (process !== null)
      assert.equal(validateVideoSupervisor({ ...uncertain, directoryCleanup: true }), false);
  }

  assert.equal(validateVideoEvidence({ ...v, private: 'path' }), false);
  assert.equal(validateVideoEvidence({ ...v, head: 'b'.repeat(40) }), false);
  const success = {
    ...s,
    passed: true,
    failure: null,
    process: { ...s.process, status: 'SUCCESS', exitCode: 0 },
  };
  assert.equal(validateVideoEvidence({ ...v, supervisor: success }), false);
  assert.equal(validateVideoEvidence({ ...v, supervisor: success, result: valid() }), true);
  assert.equal(
    validateVideoEvidence({ ...v, result: { ...valid(), head: 'b'.repeat(40) } }),
    false,
  );
});

test('qualification failure suffixes exactly cover reviewed production reasons without raw errors', () => {
  for (const reason of [...TILE_VIDEO_FAILURE_REASONS, 'UNOBSERVED'])
    for (const state of ['STOPPING', 'STOPPED', 'UNCERTAIN'])
      assert.ok(VIDEO_DIAGNOSTIC_STATES.includes(`DECODE_FAILED:${reason} / ${state}`));
  assert.equal(VIDEO_DIAGNOSTIC_STATES.includes('DECODE_FAILED:secret / STOPPED'), false);
});

test('geometry failure facts admit only fixed bounded scalars and matching cause', () => {
  const geometry = Object.fromEntries(
    VIDEO_GEOMETRY_FIELDS.map((k) => [k, k === 'flip' ? false : 0]),
  );
  assert.equal(validateVideoGeometry(geometry), true);
  assert.equal(
    validateVideoGeometry(Object.fromEntries(VIDEO_GEOMETRY_FIELDS.map((k) => [k, null]))),
    true,
  );
  for (const change of [
    { extra: 1 },
    { codedW: 4097 },
    { visibleX: -0 },
    { visibleY: NaN },
    { rotation: 45 },
    { rotation: 360 },
    { flip: 0 },
    { displayW: '32' },
    { codedH: Infinity },
  ])
    assert.equal(validateVideoGeometry({ ...geometry, ...change }), false);
  const diagnostic = {
    version: 1,
    scope,
    head: 'a'.repeat(40),
    inputs: Object.fromEntries(inputs.map((k) => [k, 'b'.repeat(64)])),
    stage: 'LANDSCAPE_OUTPUT',
    rendererState: 'DECODE_FAILED:OUTPUT_GEOMETRY / STOPPED',
    geometry,
    observation: null,
    cases: Object.fromEntries(cases.map((k) => [k, false])),
  };
  assert.equal(validateVideoDiagnostic(diagnostic), true);
  assert.equal(validateVideoDiagnostic({ ...diagnostic, rendererState: 'DISPLAYING' }), false);
  assert.equal(
    validateVideoDiagnostic({ ...diagnostic, rendererState: 'DECODE_FAILED:DEADLINE / STOPPED' }),
    false,
  );
  assert.equal(validateVideoDiagnostic({ ...diagnostic, geometry: 'x'.repeat(513) }), false);
});

test('probe bounds serialized geometry and never reuses absent or malformed facts', () => {
  const text = readFileSync(new URL('./video-decoder-probe.mjs', import.meta.url), 'utf8');
  const fn = text.slice(
    text.indexOf('function observeState(v)'),
    text.indexOf('async function observe(fixture)'),
  );
  const ctx = {
    VIDEO_DIAGNOSTIC_STATES,
    validateVideoGeometry,
    validateVideoObservation,
    VIDEO_OBSERVATION_FIELDS,
    VIDEO_OBSERVATION_STEPS,
    rendererState: 'UNOBSERVED',
    failureGeometry: null,
  };
  runInNewContext(`${fn};globalThis.observeState=observeState;`, ctx);
  const g = Object.fromEntries(VIDEO_GEOMETRY_FIELDS.map((k) => [k, k === 'flip' ? false : 0]));
  const state = 'DECODE_FAILED:OUTPUT_GEOMETRY / STOPPED';
  ctx.observeState({ state, geometry: JSON.stringify(g) });
  assert.equal(JSON.stringify(ctx.failureGeometry), JSON.stringify(g));
  for (const geometry of [
    undefined,
    null,
    '{',
    'x'.repeat(513),
    JSON.stringify({ ...g, extra: 1 }),
  ]) {
    ctx.observeState({ state, geometry: JSON.stringify(g) });
    ctx.observeState({ state, geometry });
    assert.equal(ctx.failureGeometry, null);
  }
});

test('fixed observation facts reject arbitrary, malformed and out-of-budget values', () => {
  const empty = Object.fromEntries(
    VIDEO_OBSERVATION_FIELDS.map((k) => [k, k === 'step' ? 'WAIT_FRAME' : null]),
  );
  for (const step of VIDEO_OBSERVATION_STEPS)
    assert.equal(validateVideoObservation({ ...empty, step }), true);
  for (const change of [
    { step: 'raw exception' },
    { extra: 0 },
    { box: [0, 0, 5000, 1] },
    { parent: [0, NaN, 1, 1] },
    { dark: [0, 0, 0, 256] },
    { light: [0, 0, 0] },
    { capture: [1.5, 1] },
    { baseline: [0, 0, 0, 0] },
    { dpr: [9] },
    { box: [-0, 0, 1, 1] },
  ])
    assert.equal(validateVideoObservation({ ...empty, ...change }), false);
  const diagnostic = {
    version: 1,
    scope,
    head: 'a'.repeat(40),
    inputs: Object.fromEntries(inputs.map((k) => [k, 'b'.repeat(64)])),
    stage: 'PORTRAIT_OUTPUT',
    rendererState: 'DISPLAYING',
    geometry: null,
    observation: empty,
    cases: Object.fromEntries(cases.map((k) => [k, false])),
  };
  assert.equal(validateVideoDiagnostic(diagnostic), true);
  assert.equal(validateVideoDiagnostic({ ...diagnostic, stage: 'STOP' }), false);
});
test('actual observation records failed chrome or pixel facts before throwing without weakening oracle', async () => {
  const text = readFileSync(new URL('./video-decoder-probe.mjs', import.meta.url), 'utf8');
  const source = text.slice(
    text.indexOf('function observationFacts(facts)'),
    text.indexOf('\ntry {\n  if (\n    process.platform'),
  );
  const facts = {
    width: 16,
    height: 32,
    x: 0,
    y: 20,
    w: 160,
    h: 400,
    fit: 'contain',
    visible: true,
    state: 'DISPLAYING',
    tile: [0, 0, 160, 400],
    chrome: [0, 0, 30, 10],
    parent: [0, 0, 160, 450],
    inner: [0, 0, 160, 450],
    status: [0, 420, 160, 15],
    statusVisible: true,
    dpr: [1],
    backingDark: [0, 0, 0, 255],
    backingLight: [255, 255, 255, 255],
  };
  const bitmap = Buffer.alloc(161 * 401 * 4);
  for (let i = 3; i < bitmap.length; i += 4) bitmap[i] = 255;
  const make = (baselineChrome) => {
    const ctx = {
      observation: null,
      baselineChrome,
      VIDEO_OBSERVATION_FIELDS,
      validateVideoObservation,
      canvasFacts: 'fixed',
      js: async () => facts,
      observeState() {},
      until: async (fn) => fn(),
      window: {
        webContents: {
          capturePage: async () => ({
            getSize: () => ({ width: 161, height: 401 }),
            toBitmap: () => bitmap,
          }),
        },
      },
    };
    runInNewContext(`${source};globalThis.observe=observe;`, ctx);
    return ctx;
  };
  const c = make([1, 1, 160, 400, 10, 10, 30, 10]);
  await assert.rejects(c.observe({ width: 16, height: 32 }));
  assert.equal(c.observation.step, 'CHROME');
  assert.deepEqual(c.observation.chrome, facts.chrome);
  const p = make(null);
  await assert.rejects(p.observe({ width: 16, height: 32 }));
  assert.equal(p.observation.step, 'PIXELS');
  assert.deepEqual(p.observation.backingLight, facts.backingLight);
  assert.deepEqual(Array.from(p.observation.light), [0, 0, 0, 255]);
  assert.equal(validateVideoObservation(p.observation), true);
});

test('viewport containment rejects clipping and exact-fit geometry is distinct from required campaign bars', () => {
  const text = readFileSync(new URL('./video-decoder-probe.mjs', import.meta.url), 'utf8');
  const source = text.slice(
    text.indexOf('function containedVideoLayout(f)'),
    text.indexOf('async function observe(fixture)'),
  );
  const ctx = {};
  runInNewContext(
    `${source};globalThis.layout=containedVideoLayout;globalThis.geometry=containGeometry;`,
    ctx,
  );
  const f = {
    statusVisible: true,
    x: 1,
    y: 30,
    w: 148,
    h: 270,
    inner: [1, 1, 148, 323],
    chrome: [1, 10, 148, 18],
    status: [1, 300, 148, 15],
  };
  assert.equal(ctx.layout(f), true);
  for (const bad of [
    { ...f, h: 296 },
    { ...f, y: 20 },
    { ...f, status: [1, 299, 148, 15] },
    { ...f, status: [1, 300, 0, 15] },
    { ...f, inner: [1, 1, 148, 300] },
    { ...f, w: NaN },
  ])
    assert.equal(ctx.layout(bad), false);
  // A transformed tile uses matching transformed inner bounds, not unscaled borders.
  const scaled = Object.fromEntries(
    Object.entries(f).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.map((n) => n / 2) : typeof v === 'number' ? v / 2 : v,
    ]),
  );
  assert.equal(ctx.layout(scaled), true);
  const exactFit = ctx.geometry(16, 32, 148, 296);
  assert.equal(exactFit.offsetX, 0);
  assert.equal(exactFit.offsetY, 0);
  assert.ok(Math.max(exactFit.offsetX, exactFit.offsetY) < 3);
  for (const [w, h] of [
    [16, 32],
    [32, 16],
  ]) {
    const g = ctx.geometry(w, h, 148, 270);
    assert.ok(Math.max(g.offsetX, g.offsetY) >= 3);
    assert.equal(g.cw / g.ch, w / h);
  }
  for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => ctx.geometry(16, 32, 148, bad));
});

test('post-retirement marker failure retains qualified pixels without certifying campaign success', () => {
  const s = {
    ...supervisor(),
    process: { ...supervisor().process, status: 'SUCCESS', exitCode: 0 },
    failure: 'PROBE_MARKER_FAILED',
  };
  const v = { version: 1, scope, head: s.head, supervisor: s, diagnostic: null, result: valid() };
  assert.equal(validateVideoEvidence(v), true);
  assert.equal(validateVideoEvidence({ ...v, supervisor: { ...s, passed: true } }), false);
  for (const failure of ['DIAGNOSTIC_FAILED', 'RUNTIME_VERIFY_FAILED', 'RESULT_INSPECT_FAILED']) {
    assert.equal(
      validateVideoEvidence({ ...v, supervisor: { ...s, failure }, result: null }),
      true,
    );
    assert.equal(validateVideoEvidence({ ...v, supervisor: { ...s, failure } }), false);
  }
  assert.equal(validateVideoSupervisor({ ...s, failure: 'ARBITRARY_FAILED' }), false);
});
