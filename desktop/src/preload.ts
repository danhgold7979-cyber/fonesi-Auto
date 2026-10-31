import { contextBridge, ipcRenderer } from 'electron';
import { DIAGNOSTIC_CHANNEL } from './ipc-diagnostic-contract.js';
import { createDiagnosticClient } from './preload-client.js';

const client = createDiagnosticClient((wire) => ipcRenderer.invoke(DIAGNOSTIC_CHANNEL, wire));
contextBridge.exposeInMainWorld(
  'foundation',
  Object.freeze({
    health: () => client.health(),
    settings: () => client.settings(),
  }),
);
window.addEventListener('pagehide', () => client.dispose(), { once: true });
