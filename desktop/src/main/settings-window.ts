import { snapshotNativeWindowState, type NativeWindowState } from '../settings-contract.ts';
export interface OwnedSettingsWindow {
  isDestroyed(): boolean;
  getNormalBounds(): { x: number; y: number; width: number; height: number };
  isMaximized(): boolean;
  maximize(): void;
}
export type WindowCreationBounds = Readonly<{
  width: number;
  height: number;
  x?: number;
  y?: number;
}>;
const fallback = (): WindowCreationBounds => Object.freeze({ width: 640, height: 360 });
export function captureNativeWindow(
  window: Pick<OwnedSettingsWindow, 'isDestroyed' | 'getNormalBounds' | 'isMaximized'>,
): NativeWindowState | null {
  try {
    if (window.isDestroyed()) return null;
    return snapshotNativeWindowState({
      normalBounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
    });
  } catch {
    return null;
  }
}
export function restoreWindowOptions(
  state: unknown,
  workAreas: readonly unknown[],
): WindowCreationBounds {
  const saved = snapshotNativeWindowState(state);
  if (!saved?.normalBounds || !Array.isArray(workAreas) || workAreas.length > 64) return fallback();
  const bounds = saved.normalBounds;
  let selected: NativeWindowState['normalBounds'] = null,
    best = 0;
  for (const raw of workAreas) {
    const area = snapshotNativeWindowState({ normalBounds: raw, maximized: false })?.normalBounds;
    if (!area) continue;
    const width = Math.max(
      0,
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x),
    );
    const height = Math.max(
      0,
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y),
    );
    const overlap = width * height;
    if (overlap > best) {
      best = overlap;
      selected = area;
    }
  }
  if (!selected) return fallback();
  const width = Math.min(bounds.width, selected.width),
    height = Math.min(bounds.height, selected.height);
  return Object.freeze({
    width,
    height,
    x: Math.max(selected.x, Math.min(bounds.x, selected.x + selected.width - width)),
    y: Math.max(selected.y, Math.min(bounds.y, selected.y + selected.height - height)),
  });
}
export function restoreMaximized(
  window: Pick<OwnedSettingsWindow, 'isDestroyed' | 'maximize'>,
  state: unknown,
): boolean {
  const saved = snapshotNativeWindowState(state);
  if (!saved) return false;
  try {
    if (window.isDestroyed()) return false;
    if (saved.maximized) window.maximize();
    return true;
  } catch {
    return false;
  }
}
