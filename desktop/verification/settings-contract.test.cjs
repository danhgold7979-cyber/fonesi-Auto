'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto'),
  fs = require('node:fs'),
  path = require('node:path');
const { STAGES, VERSIONS, CASES, control, result } = require('./settings-contract.cjs');
function input(stage = 'ui') {
  return {
    version: 1,
    mode: 'source',
    stage,
    parentToken: randomUUID(),
    ownerToken: randomUUID(),
    storeId: randomUUID(),
    checkpoint: `key-checkpoint-${randomUUID()}.json`,
    fixtureId: randomUUID(),
  };
}
test('all six exact private stages accept canonical control only', () => {
  for (const stage of STAGES) {
    const c = input(stage);
    assert.deepEqual(control(JSON.stringify(c)), c);
    assert.ok(Object.isFrozen(control(JSON.stringify(c))));
    for (const v of [
      { ...c, extra: 1 },
      { ...c, mode: 'other' },
      { ...c, stage: 'context' },
      { ...c, checkpoint: '../Local State' },
      { ...c, ownerToken: 'private' },
    ])
      assert.throws(() => control(JSON.stringify(v)));
    assert.throws(() =>
      control(JSON.stringify(c).replace('"version":1', '"version":0,"version":1')),
    );
  }
});
test('public native result exact stage cases booleans and pinned versions', () => {
  for (const stage of STAGES) {
    const r = {
      version: 1,
      mode: 'package',
      stage,
      versions: VERSIONS,
      cases: Object.fromEntries(CASES[stage].map((k) => [k, true])),
    };
    assert.deepEqual(result(JSON.stringify(r)), r);
    for (const mutate of [
      (v) => {
        v.cases.extra = true;
      },
      (v) => {
        delete v.cases.ownedRoot;
      },
      (v) => {
        v.cases.ownedRoot = 1;
      },
      (v) => {
        v.versions.node = '24.22.2';
      },
    ]) {
      const bad = JSON.parse(JSON.stringify(r));
      mutate(bad);
      assert.throws(() => result(JSON.stringify(bad)));
    }
    r.cases.ownedRoot = false;
    assert.equal(result(JSON.stringify(r)).cases.ownedRoot, false);
  }
});
test('fixed cases distinguish crash admission from separately proved reopened durability', () => {
  for (const stage of ['before-crash', 'after-crash']) {
    assert.ok(CASES[stage].includes('commitBoundaryReached'));
    assert.ok(!CASES[stage].includes('orderlyQuit'));
  }
  assert.ok(CASES['before-reopen'].includes('wholeOldState'));
  assert.ok(CASES['after-reopen'].includes('wholeNewState'));
  assert.ok(CASES.ui.includes('resetCancelled'));
  assert.ok(CASES.reopen.includes('vaultUnchanged'));
});
test('trusted control build gate precedes compiled helper imports; native entries remain verification only', async () => {
  const controlSource = fs.readFileSync(path.join(__dirname, 'settings-control.cjs'), 'utf8');
  assert.ok(
    controlSource.indexOf('if (!verifyBuild') <
      controlSource.indexOf("require('../build/persistence-files.cjs')"),
  );
  for (const name of ['settings-main-probe.cjs', 'settings-store-probe.cjs']) {
    const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.ok(source.includes('preflight(app)'));
    assert.ok(source.includes('authenticated(state, safeStorage)'));
    assert.ok(!source.includes('--no-sandbox'));
  }
  const main = fs.readFileSync(path.join(__dirname, 'settings-main-probe.cjs'), 'utf8');
  assert.ok(main.includes("require('../build/main.cjs')"));
  assert.ok(main.includes('window.webContents.capturePage()'));
  const store = fs.readFileSync(path.join(__dirname, 'settings-store-probe.cjs'), 'utf8');
  assert.ok(store.includes('process.crash()'));
  assert.ok(store.includes('db.commitSettings('));
  const { runInNewContext } = require('node:vm');
  const {
    parseSettingsResponse,
    settingsSuccess,
    settingsError,
  } = require('../build/settings-contract.cjs');
  const start = main.indexOf('async function publicRead(window) {'),
    end = main.indexOf('async function operation', start);
  assert.ok(start >= 0 && end > start);
  const busy = settingsError('BUSY', null, 'DEGRADED'),
    success = settingsSuccess(
      'p1',
      'OBSERVED',
      { revision: 0, theme: 'LIGHT', dockWidth: null, tileWidth: 150, persistence: 'PERSISTED' },
      'AVAILABLE',
    );
  for (const scenario of ['settle', 'timeout', 'malformed', 'other']) {
    let now = 0,
      calls = 0;
    const read = runInNewContext(`(${main.slice(start, end).trim()})`, {
      Date: { now: () => now },
      parseSettingsResponse,
      pause: async (ms) => {
        assert.equal(ms, 25);
        now += ms;
      },
      execute: async (_window, code) => {
        assert.equal(code, 'window.preferences.read()');
        calls++;
        return scenario === 'settle'
          ? calls < 3
            ? busy
            : success
          : scenario === 'timeout'
            ? busy
            : scenario === 'malformed'
              ? '{}'
              : settingsError('CONFLICT', null, 'DEGRADED');
      },
    });
    if (scenario === 'settle') {
      assert.equal((await read({})).theme, 'LIGHT');
      assert.equal(calls, 3);
    } else {
      await assert.rejects(
        read({}),
        scenario === 'timeout' ? /SETTINGS_READ_BUSY/ : /SETTINGS_READ/,
      );
      assert.equal(calls, scenario === 'timeout' ? 200 : 1);
    }
  }
  const boundsStart = main.indexOf('function fixtureBounds(area) {'),
    boundsEnd = main.indexOf('async function run()', boundsStart);
  assert.ok(boundsStart >= 0 && boundsEnd > boundsStart);
  const bounds = runInNewContext(`(${main.slice(boundsStart, boundsEnd).trim()})`);
  for (const area of [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: -800, y: 20, width: 640, height: 480 },
    { x: 0, y: 0, width: 1024, height: 728 },
  ]) {
    const value = bounds(area);
    assert.ok(
      value.x >= area.x &&
        value.y >= area.y &&
        value.x + value.width <= area.x + area.width &&
        value.y + value.height <= area.y + area.height,
    );
    assert.ok(value.width <= 900 && value.height <= 700);
  }
  for (const area of [
    null,
    { x: 0, y: 0, width: 0, height: 10 },
    { x: 0, y: 0, width: 100, height: NaN },
  ])
    assert.throws(() => bounds(area), /SETTINGS_WORK_AREA/);
});
