import type { LifecyclePhase } from './asset-policy.js';
export interface OwnedWindow {
  onClosed(callback: () => void): void;
  close(): void;
  destroy(): void;
}

// Application-owned windows only. No renderer callable operation or service registry.
export function createLifecycle(createWindow: () => OwnedWindow) {
  let window: OwnedWindow | undefined;
  let phase: LifecyclePhase = 'IDLE';
  return {
    start(): boolean {
      if (phase !== 'IDLE') return false;
      const created = createWindow();
      window = created;
      phase = 'OPEN';
      created.onClosed(() => {
        if (window === created) {
          window = undefined;
          if (phase !== 'DISPOSED') phase = 'IDLE';
        }
      });
      return true;
    },
    close(): boolean {
      if (phase !== 'OPEN' || !window) return false;
      phase = 'CLOSING';
      window.close();
      return true;
    },
    dispose(): void {
      if (phase === 'DISPOSED') return;
      phase = 'DISPOSED';
      const owned = window;
      window = undefined;
      owned?.destroy();
    },
    phase(): LifecyclePhase {
      return phase;
    },
  };
}

export function disposeResources(actions: ReadonlyArray<() => void>): boolean {
  let complete = true;
  for (const action of actions) {
    try {
      action();
    } catch {
      complete = false;
    }
  }
  return complete;
}
