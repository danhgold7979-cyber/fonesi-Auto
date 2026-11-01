'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const {
  CASES,
  PHASES,
  SCOPE,
  validateResult,
  saveImage,
  rootForLaunch,
} = require('./fleet-ui-contract.cjs');
function result() {
  return {
    version: 1,
    scope: SCOPE,
    cases: Object.fromEntries(CASES.map((key) => [key, true])),
    screenshots: {
      light: {
        file: 'fleet-light.png',
        sha256: 'a'.repeat(64),
        width: 1024,
        height: 768,
        bytes: 100,
      },
      dark: {
        file: 'fleet-dark.png',
        sha256: 'b'.repeat(64),
        width: 1024,
        height: 768,
        bytes: 101,
      },
    },
    readyCount: 1,
    closedCount: 1,
  };
}
test('fixed fleet UI result derives truthfully from every case and exact two screenshots', () => {
  assert.equal(validateResult(result()).passed, true);
  for (const key of CASES) {
    const value = result();
    value.cases[key] = false;
    assert.equal(validateResult(value).passed, false);
  }
  for (const mutation of [
    (v) => (v.cases.privatePath = 'private'),
    (v) => (v.readyCount = 2),
    (v) => (v.closedCount = 0),
    (v) => (v.screenshots.light.file = '../private.png'),
    (v) => (v.screenshots.dark.sha256 = v.screenshots.light.sha256),
    (v) => (v.screenshots.light.width = 1280),
    (v) => (v.screenshots.light.bytes = 2097153),
    (v) => (v.screenshots.light.extra = 'raw'),
    (v) => (v.scope = 'INSTALLED_PACKAGE'),
  ]) {
    const value = result();
    mutation(value);
    assert.throws(() => validateResult(value), /FLEET_UI_SCHEMA/);
  }
});
test('bounded owned screenshot writer is exclusive and never overwrites an earlier image', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(
      path.join(fs.realpathSync.native(path.resolve(__dirname, '../.test-output')), 'fleet-image-'),
    ),
  );
  const file = path.join(root, 'fleet-light.png');
  const bytes = Buffer.alloc(64, 1);
  try {
    const value = saveImage(root, 'light', {
      getSize: () => ({ width: 1024, height: 768 }),
      toPNG: () => bytes,
    });
    assert.equal(value.bytes, 64);
    assert.equal(value.file, 'fleet-light.png');
    assert.throws(
      () =>
        saveImage(root, 'light', {
          getSize: () => ({ width: 1024, height: 768 }),
          toPNG: () => Buffer.alloc(64, 2),
        }),
      { code: 'EEXIST' },
    );
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.throws(
      () =>
        saveImage(root, 'dark', { getSize: () => ({ width: 1, height: 1 }), toPNG: () => bytes }),
      /FLEET_UI_IMAGE/,
    );
    assert.throws(
      () =>
        saveImage(root, '../raw', {
          getSize: () => ({ width: 1024, height: 768 }),
          toPNG: () => bytes,
        }),
      /FLEET_UI_IMAGE/,
    );
  } finally {
    assert.deepEqual(fs.readdirSync(root), ['fleet-light.png']);
    assert.deepEqual(fs.readFileSync(file), bytes);
    fs.unlinkSync(file);
    fs.rmdirSync(root);
  }
});
test('observer keeps original production main and full handler dispatch while only delaying one response', () => {
  const source = fs.readFileSync(path.join(__dirname, 'fleet-ui-main-probe.cjs'), 'utf8');
  assert.ok(source.includes("require('../build/main.cjs')"));
  assert.ok(source.includes('callback.apply(this, args)'));
  assert.ok(source.includes('handle.call(this, channel'));
  assert.ok(source.includes("channel !== 'foundation:fleet:v1'"));
  assert.ok(source.includes('await pause(150)'));
  assert.ok(source.includes('selects === dispatches'));
  assert.ok(source.includes('reads === readCount'));
  assert.ok(source.includes('window.webContents.reload()'));
  assert.ok(source.includes('buttons.length===2&&buttons.every(n=>n.disabled)'));
  assert.ok(source.includes("n.textContent.trim()==='Bỏ chọn'"));
  assert.ok(!source.includes('SYNTHETIC_TEST'));
  assert.ok(!source.includes('createFleetService'));
  assert.ok(!source.includes('child_process'));
  assert.equal((source.match(/holdNext = true/g) || []).length, 1);
  assert.deepEqual(PHASES, [
    'PREPARE',
    'HYDRATE',
    'READ',
    'SELECT',
    'RECONCILE',
    'LIGHT',
    'DARK',
    'SENDER',
    'SUBFRAME',
    'REVOKE',
    'CLOSE',
  ]);
});
test('root derivation refuses an arbitrary directory instead of assuming launcher custody', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(
      path.join(fs.realpathSync.native(path.resolve(__dirname, '../.test-output')), 'fleet-root-'),
    ),
  );
  try {
    assert.throws(() => rootForLaunch(root));
  } finally {
    assert.deepEqual(fs.readdirSync(root), []);
    fs.rmdirSync(root);
  }
});
test('observer preparation dependency failure emits only fixed phase markers', () => {
  const { runInNewContext } = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, 'fleet-ui-main-probe.cjs'), 'utf8');
  const output = [],
    exits = [];
  runInNewContext(source, {
    require(name) {
      if (name === 'electron') return { app: { exit: (code) => exits.push(code) } };
      if (name === 'node:fs')
        return {
          writeSync: (fd, text) => {
            assert.equal(fd, 2);
            output.push(text);
          },
        };
      if (name === 'node:path') return path;
      throw Error('C:\\private\\dependency');
    },
  });
  assert.deepEqual(exits, [1]);
  assert.equal(output.join(''), 'FLEET_UI_PHASE_PREPARE\nFLEET_UI_FAILED\n');
});

test('observer waits for actual React help control before first UI action', () => {
  const source = fs.readFileSync(path.join(__dirname, 'fleet-ui-main-probe.cjs'), 'utf8');
  const start = source.indexOf('async function run()');
  const wait = source.indexOf(
    'await poll(() => execute("!!document.getElementById(\'help-top\')"))',
    start,
  );
  const action = source.indexOf('await help()', start);
  assert.ok(start >= 0 && wait > start && action > wait);
});
