import { contextBridge, ipcRenderer } from 'electron';
import type { HealthRequest, HealthResult, LabBridge } from './contracts';
const bridge: LabBridge = Object.freeze({
  health: (request: HealthRequest): Promise<HealthResult> => ipcRenderer.invoke('lab:health', request),
});
contextBridge.exposeInMainWorld('lab', bridge);
// Deliberately not exposed; runtime checks prove context separation.
(globalThis as unknown as Record<string, unknown>).labPreloadCanary = 'synthetic-only';

let nodeBuiltinDenied = false;
try { require('node:fs'); } catch { nodeBuiltinDenied = true; }
ipcRenderer.send('lab:preload-state', {
  sandboxed: process.sandboxed, contextIsolated: process.contextIsolated, nodeBuiltinDenied,
});
