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
/** Fit only the existing unavailable tile footprint, never Android dimensions. */
export function fitTileZoom(
  current: number,
  viewportWidth: number,
  viewportHeight: number,
  focused: boolean,
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return clampTileZoom(current, 0);
  if (focused && (!Number.isFinite(viewportHeight) || viewportHeight <= 0))
    return clampTileZoom(current, viewportWidth);
  const innerWidth = Math.max(0, viewportWidth - 24);
  const columns = Math.min(4, Math.max(1, Math.floor(innerWidth / 120)));
  const raw = focused
    ? Math.floor(Math.min(innerWidth, (Math.max(0, viewportHeight - 24) * 150) / 325))
    : Math.floor((innerWidth - (columns - 1) * 2) / columns);
  return clampTileZoom(raw, viewportWidth);
}
