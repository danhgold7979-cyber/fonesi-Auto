import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureNativeWindow,
  restoreWindowOptions,
  restoreMaximized,
} from '../src/main/settings-window.ts';
const area = { x: 0, y: 0, width: 1920, height: 1080 };
const state = (normalBounds, maximized = false) => ({ normalBounds, maximized });
test('capture uses normal bounds and maximized only, copies values and handles lost windows', () => {
  const bounds = { x: 1, y: 2, width: 800, height: 600 };
  const window = {
    isDestroyed: () => false,
    getNormalBounds: () => bounds,
    isMaximized: () => true,
  };
  const captured = captureNativeWindow(window);
  bounds.x = 999;
  assert.deepEqual(captured, state({ x: 1, y: 2, width: 800, height: 600 }, true));
  assert.equal(Object.isFrozen(captured.normalBounds), true);
  assert.equal(captureNativeWindow({ ...window, isDestroyed: () => true }), null);
  assert.equal(
    captureNativeWindow({
      ...window,
      getNormalBounds() {
        throw Error('PRIVATE');
      },
    }),
    null,
  );
  assert.equal(captureNativeWindow({ ...window, isMaximized: () => 1 }), null);
});
test('restore chooses largest overlap and clamps inside current work area', () => {
  assert.deepEqual(
    restoreWindowOptions(state({ x: 1800, y: 1000, width: 800, height: 600 }), [area]),
    { width: 800, height: 600, x: 1120, y: 480 },
  );
  assert.deepEqual(
    restoreWindowOptions(state({ x: -50, y: 0, width: 2000, height: 1200 }), [area]),
    { width: 1920, height: 1080, x: 0, y: 0 },
  );
  const left = { x: -1920, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(
    restoreWindowOptions(state({ x: -1000, y: 20, width: 800, height: 600 }), [area, left]),
    { width: 800, height: 600, x: -1000, y: 20 },
  );
});
test('missing display or invalid saved geometry falls back without replaying coordinates', () => {
  for (const saved of [
    state(null),
    state({ x: 5000, y: 0, width: 800, height: 600 }),
    state({ x: 0, y: 0, width: Infinity, height: 600 }),
    null,
  ])
    assert.deepEqual(restoreWindowOptions(saved, [area]), { width: 640, height: 360 });
  assert.deepEqual(restoreWindowOptions(state({ x: 0, y: 0, width: 800, height: 600 }), []), {
    width: 640,
    height: 360,
  });
  assert.deepEqual(
    restoreWindowOptions(state({ x: 0, y: 0, width: 800, height: 600 }), Array(65).fill(area)),
    { width: 640, height: 360 },
  );
});
test('maximize restoration never requests fullscreen or minimized state', () => {
  let calls = 0;
  const window = {
    isDestroyed: () => false,
    maximize() {
      calls++;
    },
  };
  assert.equal(restoreMaximized(window, state(null, false)), true);
  assert.equal(calls, 0);
  assert.equal(restoreMaximized(window, state(null, true)), true);
  assert.equal(calls, 1);
  assert.equal(restoreMaximized({ ...window, isDestroyed: () => true }, state(null, true)), false);
  assert.equal(calls, 1);
  assert.equal(restoreMaximized(window, { ...state(null, true), fullscreen: true }), false);
});
