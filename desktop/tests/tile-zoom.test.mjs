import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTileZoom, wheelTileZoom, tileZoomLimit } from '../src/ui/tile-zoom.ts';
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
