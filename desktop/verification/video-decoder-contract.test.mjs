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
