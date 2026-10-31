import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL } from './ipc-contract.js';
import { createPublicClient } from './preload-client.js';

const client = createPublicClient((wire) => ipcRenderer.invoke(CHANNEL, wire));
contextBridge.exposeInMainWorld('foundation', Object.freeze({
  health: () => client.health(),
  settings: () => client.settings()
}));
window.addEventListener('pagehide', () => client.dispose(), { once: true });
