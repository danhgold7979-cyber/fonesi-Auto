import { createHostResourceClient } from './host-resource-client.ts';
import { HOST_RESOURCE_CHANNEL } from './host-resource-contract.ts';
import { createInputInteractionClient } from './input-interaction-client.js';
import { createAssociationClient } from './association-client.js';
import { createMetadataClient } from './metadata-client.js';
import { createDiscoveryClient } from './discovery-client.js';
import { createRuntimeVersionClient } from './runtime-version-client.js';
import { createPlatformToolsSetupClient } from './platform-tools-setup-client.js';
import { createFleetClient } from './fleet-client.js';
import { contextBridge, ipcRenderer } from 'electron';
import { DIAGNOSTIC_CHANNEL } from './ipc-diagnostic-contract.js';
import { createDiagnosticClient } from './preload-client.js';
import { createInvocationBudget } from './invocation-budget.js';
import { createSettingsClient, createSettingsReadiness } from './settings-client.js';

const budget = createInvocationBudget();
const hostResources = createHostResourceClient(
  (wire) => ipcRenderer.invoke(HOST_RESOURCE_CHANNEL, wire),
  budget,
);
contextBridge.exposeInMainWorld(
  'hostResources',
  Object.freeze({ sample: () => hostResources.sample(), cancel: () => hostResources.cancel() }),
);
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
  (wire) => ipcRenderer.invoke('foundation:platform-tools:v2', wire),
  budget,
  undefined,
  readiness,
);
const runtimeVersion = createRuntimeVersionClient(
  (wire) => ipcRenderer.invoke('foundation:runtime-version:v2', wire),
  budget,
  undefined,
  readiness,
);
const discovery = createDiscoveryClient(
  (wire) => ipcRenderer.invoke('auto:discovery:v1', wire),
  budget,
  undefined,
  readiness,
);
const metadata = createMetadataClient(
  (wire) => ipcRenderer.invoke('foundation:metadata:v1', wire),
  budget,
  undefined,
  readiness,
);
const association = createAssociationClient(
  (wire) => ipcRenderer.invoke('foundation:association:v1', wire),
  budget,
  undefined,
  readiness,
);
const input = createInputInteractionClient(
  (wire) => ipcRenderer.invoke('foundation:input:v1', wire),
  budget,
  undefined,
  readiness,
);
contextBridge.exposeInMainWorld(
  'input',
  Object.freeze({
    get: () => input.get(),
    press: (
      revision: unknown,
      selectionRevision: unknown,
      registryRevision: unknown,
      deviceId: unknown,
      action: unknown,
    ) => input.press(revision, selectionRevision, registryRevision, deviceId, action),
  }),
);
contextBridge.exposeInMainWorld(
  'association',
  Object.freeze({
    get: () => association.get(),
    candidates: () => association.candidates(),
    begin: (revision: unknown, candidateId: unknown, mode: unknown, deviceId?: unknown) => {
      input.invalidateObservation();
      metadata.invalidateObservation();
      return association.begin(revision, candidateId, mode, deviceId);
    },
    removal: (revision: unknown, ceremonyId: unknown) => {
      input.invalidateObservation();
      metadata.invalidateObservation();
      return association.removal(revision, ceremonyId);
    },
    return: (revision: unknown, ceremonyId: unknown) => {
      input.invalidateObservation();
      metadata.invalidateObservation();
      return association.return(revision, ceremonyId);
    },
    confirm: (revision: unknown, ceremonyId: unknown) => {
      input.invalidateObservation();
      metadata.invalidateObservation();
      return association.confirm(revision, ceremonyId);
    },
    cancel: (revision: unknown, operationId: unknown) => association.cancel(revision, operationId),
  }),
);
contextBridge.exposeInMainWorld(
  'metadata',
  Object.freeze({
    get: () => metadata.get(),
    read: (deviceId: unknown, field: unknown, revision: unknown, registryRevision: unknown) =>
      metadata.read(deviceId, field, revision, registryRevision),
  }),
);
contextBridge.exposeInMainWorld(
  'discovery',
  Object.freeze({
    get: () => discovery.get(),
    start: (revision: unknown, installationRevision: unknown) => {
      input.invalidateObservation();
      metadata.invalidateObservation();
      association.invalidateObservation();
      return discovery.start(revision, installationRevision);
    },
    refresh: (revision: unknown) => {
      input.invalidateObservation();
      metadata.invalidateObservation();
      association.invalidateObservation();
      return discovery.refresh(revision);
    },
    stop: () => {
      input.invalidateObservation();
      metadata.invalidateObservation();
      association.invalidateObservation();
      return discovery.stop();
    },
  }),
);
contextBridge.exposeInMainWorld(
  'platformTools',
  Object.freeze({
    read: () => platformTools.read(),
    readVersion: () => runtimeVersion.readVersion(),
    verifyVersion: (revision: unknown, installationRevision: unknown) =>
      runtimeVersion.verifyVersion(revision, installationRevision),
    requestSetup: (revision: unknown) => {
      runtimeVersion.invalidateObservation();
      discovery.invalidateObservation();
      input.invalidateObservation();
      metadata.invalidateObservation();
      association.invalidateObservation();
      return platformTools.requestSetup(revision).finally(() => {
        runtimeVersion.invalidateObservation();
        discovery.invalidateObservation();
        input.invalidateObservation();
        metadata.invalidateObservation();
        association.invalidateObservation();
      });
    },
  }),
);
contextBridge.exposeInMainWorld(
  'fleet',
  Object.freeze({
    read: () => fleet.read(),
    replaceSelection: (revision: unknown, selection: unknown) => {
      input.invalidateObservation();
      return fleet.replaceSelection(revision, selection);
    },
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
    hostResources.dispose();
    client.dispose();
    preferences.dispose();
    fleet.dispose();
    platformTools.dispose();
    runtimeVersion.dispose();
    discovery.dispose();
    metadata.dispose();
    input.dispose();
    association.dispose();
  },
  { once: true },
);
