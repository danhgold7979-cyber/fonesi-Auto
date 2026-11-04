import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTileZoom, wheelTileZoom, tileZoomLimit, fitTileZoom } from '../src/ui/tile-zoom.ts';
test('V9 display bounds and same viewport clamp for every source', () => {
  assert.equal(tileZoomLimit(1000), 520);
  assert.equal(tileZoomLimit(200.9), 176);
  assert.equal(tileZoomLimit(50), 70);
  assert.equal(clampTileZoom(9999, 200.9), 176);
  assert.equal(clampTileZoom(-1, 510), 70);
  assert.equal(clampTileZoom(Number.NaN, 510), 150);
});
test('signed twelve-pixel wheel, bounded bursts, zero/nonfinite no movement', () => {
  for (const delta of [0, -0, Infinity, -Infinity, NaN])
    assert.equal(wheelTileZoom(150, delta, 600), 150);
  assert.equal(wheelTileZoom(150, -0.01, 600), 162);
  assert.equal(wheelTileZoom(150, 100000, 600), 138);
  let size = 150;
  for (let i = 0; i < 1000; i++) size = wheelTileZoom(size, -1, 600);
  assert.equal(size, 520);
  for (let i = 0; i < 1000; i++) size = wheelTileZoom(size, 1, 600);
  assert.equal(size, 70);
});

test('display fit uses selected-grid four-column rule and whole-tile focused aspect', () => {
  for (const [width, expected] of [
    [1000, 242],
    [510, 120],
    [300, 137],
    [144, 120],
    [80, 70],
  ]) {
    assert.equal(fitTileZoom(150, width, 600, false), expected);
  }
  assert.equal(fitTileZoom(150, 510, 600, true), 265);
  assert.equal(fitTileZoom(150, 510, 200, true), 81);
  assert.equal(fitTileZoom(150, 200, 600, true), 176);
  assert.equal(fitTileZoom(150, 5000, 5000, true), 520);
  assert.equal(fitTileZoom(150, 30, 30, true), 70);
});
test('unmeasured fit retains bounded width without inventing height or nonfinite geometry', () => {
  for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(fitTileZoom(210, invalid, 600, false), 210);
    assert.equal(fitTileZoom(210, 200, invalid, true), 176);
  }
  assert.equal(fitTileZoom(9999, 0, 0, true), 520);
  assert.equal(fitTileZoom(NaN, 0, 0, true), 150);
});
