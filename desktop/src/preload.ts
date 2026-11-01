import { createRuntimeVersionClient } from './runtime-version-client.js';
import { createPlatformToolsSetupClient } from './platform-tools-setup-client.js';
import { createFleetClient } from './fleet-client.js';
import { contextBridge, ipcRenderer } from 'electron';
import { DIAGNOSTIC_CHANNEL } from './ipc-diagnostic-contract.js';
import { createDiagnosticClient } from './preload-client.js';
import { createInvocationBudget } from './invocation-budget.js';
import { createSettingsClient, createSettingsReadiness } from './settings-client.js';

const budget = createInvocationBudget();
const readiness = createSettingsReadiness();
const ready = () => readiness.signal();
ipcRenderer.once('foundation:preferences:ready', ready);
const client = createDiagnosticClient(
  (wire) => ipcRenderer.invoke(DIAGNOSTIC_CHANNEL, wire),
  undefined,
  budget,
);
const preferences = createSettingsClient(
  (wire) => ipcRenderer.invoke('foundation:preferences:v1', wire),
  budget,
  undefined,
  readiness,
);
const fleet = createFleetClient(
  (wire) => ipcRenderer.invoke('foundation:fleet:v1', wire),
  budget,
  undefined,
  readiness,
);
const platformTools = createPlatformToolsSetupClient(
  (wire) => ipcRenderer.invoke('foundation:platform-tools:v1', wire),
  budget,
  undefined,
  readiness,
);
const runtimeVersion = createRuntimeVersionClient(
  (wire) => ipcRenderer.invoke('foundation:runtime-version:v1', wire),
  budget,
  undefined,
  readiness,
);
contextBridge.exposeInMainWorld(
  'platformTools',
  Object.freeze({
    read: () => platformTools.read(),
    readVersion: () => runtimeVersion.readVersion(),
    verifyVersion: (revision: unknown, installationRevision: unknown) =>
      runtimeVersion.verifyVersion(revision, installationRevision),
    requestSetup: (revision: unknown) => platformTools.requestSetup(revision),
  }),
);
contextBridge.exposeInMainWorld(
  'fleet',
  Object.freeze({
    read: () => fleet.read(),
    replaceSelection: (revision: unknown, selection: unknown) =>
      fleet.replaceSelection(revision, selection),
  }),
);
contextBridge.exposeInMainWorld(
  'foundation',
  Object.freeze({
    health: () => client.health(),
    settings: () => client.settings(),
  }),
);
contextBridge.exposeInMainWorld(
  'preferences',
  Object.freeze({
    read: () => preferences.read(),
    update: (revision: unknown, patch: unknown) => preferences.update(revision, patch),
    reset: (revision: unknown) => preferences.reset(revision),
    restorePrevious: (revision: unknown) => preferences.restorePrevious(revision),
  }),
);
window.addEventListener(
  'pagehide',
  () => {
    ipcRenderer.removeListener('foundation:preferences:ready', ready);
    readiness.dispose();
    client.dispose();
    preferences.dispose();
    fleet.dispose();
    platformTools.dispose();
    runtimeVersion.dispose();
  },
  { once: true },
);
