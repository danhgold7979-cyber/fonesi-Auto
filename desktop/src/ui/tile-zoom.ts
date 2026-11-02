/** Display pixels only: never a stream size or persisted preference. */
export function tileZoomLimit(viewportWidth: number): number {
  return Number.isFinite(viewportWidth) && viewportWidth > 0
    ? Math.max(70, Math.min(520, Math.floor(viewportWidth - 24)))
    : 520;
}
export function clampTileZoom(value: number, viewportWidth: number): number {
  return Math.max(
    70,
    Math.min(tileZoomLimit(viewportWidth), Math.round(Number.isFinite(value) ? value : 150)),
  );
}
export function wheelTileZoom(current: number, delta: number, viewportWidth: number): number {
  return clampTileZoom(
    current + (Number.isFinite(delta) && delta !== 0 ? (delta < 0 ? 12 : -12) : 0),
    viewportWidth,
  );
}
