import * as inputClient from '../src/input-interaction-client.ts';
import * as associationClient from '../src/association-client.ts';
import * as metadataClient from '../src/metadata-client.ts';
import * as discoveryClient from '../src/discovery-client.ts';
import * as runtimeVersion from '../src/runtime-version-client.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { transformSync, buildSync } from 'esbuild';
import * as clients from '../src/preload-client.ts';
import * as fleet from '../src/fleet-client.ts';
import * as platformTools from '../src/platform-tools-setup-client.ts';
import * as preferences from '../src/settings-client.ts';
import * as budget from '../src/invocation-budget.ts';
import * as diagnostic from '../src/ipc-diagnostic-contract.ts';
const loadDraftModule = async (name) => {
  const result = buildSync({
    entryPoints: [fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`
  );
};
const scheduleDraftClient = await loadDraftModule('schedule-draft-client');
const scheduleDraftContract = await loadDraftModule('schedule-draft-contract');
const code = transformSync(readFileSync(new URL('../src/preload.ts', import.meta.url), 'utf8'), {
  loader: 'ts',
  format: 'cjs',
}).code;
test('actual transformed preload exposes only frozen intended wrappers with one shared budget', async () => {
  const exposed = {},
    invocations = [],
    listeners = [],
    readyListeners = new Map();
  runInNewContext(code, {
    require(name) {
      if (name === 'electron')
        return {
          contextBridge: {
            exposeInMainWorld: (name, value) => {
              exposed[name] = value;
            },
          },
          ipcRenderer: {
            once: (name, fn) => readyListeners.set(name, fn),
            removeListener: (name, fn) => {
              if (readyListeners.get(name) === fn) readyListeners.delete(name);
            },
            invoke: (channel, wire) => {
              invocations.push({ channel, wire });
              return new Promise(() => {});
            },
          },
        };
      if (name === './schedule-draft-client.ts') return scheduleDraftClient;
      if (name === './schedule-draft-contract.ts') return scheduleDraftContract;
      if (name === './preload-client.js') return clients;
      if (name === './settings-client.js') return preferences;
      if (name === './association-client.js') return associationClient;
      if (name === './input-interaction-client.js') return inputClient;
      if (name === './metadata-client.js') return metadataClient;
      if (name === './discovery-client.js') return discoveryClient;
      if (name === './fleet-client.js') return fleet;
      if (name === './platform-tools-setup-client.js') return platformTools;
      if (name === './runtime-version-client.js') return runtimeVersion;
      if (name === './invocation-budget.js') return budget;
      if (name === './ipc-diagnostic-contract.js') return diagnostic;
      throw Error('UNKNOWN_MODULE');
    },
    window: { addEventListener: (...args) => listeners.push(args) },
  });
  assert.deepEqual(Object.keys(exposed).sort(), [
    'association',
    'discovery',
    'fleet',
    'foundation',
    'input',
    'metadata',
    'platformTools',
    'preferences',
    'scheduleDraft',
  ]);
  assert.deepEqual(Object.keys(exposed.scheduleDraft).sort(), ['cancel', 'preview']);
  assert.ok(Object.isFrozen(exposed.scheduleDraft));
  assert.equal(JSON.parse(await exposed.scheduleDraft.preview(null)).code, 'INVALID_SHAPE');
  assert.deepEqual(Object.keys(exposed.foundation).sort(), ['health', 'settings']);
  assert.deepEqual(Object.keys(exposed.preferences).sort(), [
    'read',
    'reset',
    'restorePrevious',
    'update',
  ]);
  assert.deepEqual(Object.keys(exposed.input).sort(), ['get', 'press']);
  assert.deepEqual(Object.keys(exposed.metadata).sort(), ['get', 'read']);
  assert.deepEqual(Object.keys(exposed.association).sort(), [
    'begin',
    'cancel',
    'candidates',
    'confirm',
    'get',
    'removal',
    'return',
  ]);
  assert.ok(Object.isFrozen(exposed.association));
  assert.ok(Object.isFrozen(exposed.metadata));
  assert.deepEqual(Object.keys(exposed.fleet).sort(), ['read', 'replaceSelection']);
  assert.deepEqual(Object.keys(exposed.platformTools).sort(), [
    'read',
    'readVersion',
    'requestSetup',
    'verifyVersion',
  ]);
  assert.ok(Object.isFrozen(exposed.platformTools));
  assert.equal(JSON.parse(await exposed.platformTools.requestSetup(0)).code, 'SESSION_UNAVAILABLE');
  assert.equal(invocations.length, 0);
  assert.ok(Object.isFrozen(exposed.fleet));
  assert.ok(Object.isFrozen(exposed.foundation));
  assert.ok(Object.isFrozen(exposed.preferences));
  assert.deepEqual([...readyListeners.keys()], ['foundation:preferences:ready']);
  readyListeners.get('foundation:preferences:ready')();
  const draft = {
    schedule: {
      version: 1,
      kind: 'CIVIL_RULE',
      startDate: '2024-01-01',
      endDate: null,
      maxOccurrences: null,
      rule: { kind: 'ONCE' },
      postsPerActiveDay: 1,
      slots: [{ id: '00000000-0000-4000-8000-000000000001', time: '09:00' }],
    },
    request: {
      version: 1,
      scope: {
        kind: 'UNBOUND_DRAFT',
        draftId: '00000000-0000-4000-8000-000000000002',
        draftRevision: 0,
      },
      zone: 'UTC',
      fromDate: '2024-01-01',
      throughDate: '2024-01-01',
      limit: 128,
    },
  };
  const pending = [
    exposed.foundation.health(),
    exposed.foundation.settings(),
    exposed.preferences.read(),
    exposed.scheduleDraft.preview(draft),
    exposed.fleet.read(),
    exposed.metadata.get(),
    ...Array.from({ length: 1 }, () => exposed.platformTools.read()),
  ];
  assert.equal(JSON.parse(await exposed.scheduleDraft.preview(draft)).code, 'BUSY');
  assert.equal(JSON.parse(await exposed.preferences.read()).code, 'BUSY');
  assert.equal(JSON.parse(await exposed.fleet.read()).code, 'BUSY');
  assert.equal(JSON.parse(await exposed.metadata.get()).code, 'BUSY');
  assert.equal(JSON.parse(await exposed.input.get()).code, 'BUSY');
  assert.equal(JSON.parse(await exposed.association.get()).code, 'BUSY');
  assert.equal(
    JSON.parse(await exposed.association.cancel(1, '11111111-1111-4111-8111-111111111111')).code,
    'BUSY',
  );
  assert.equal(JSON.parse(await exposed.platformTools.read()).code, 'BUSY');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(invocations.length, 7);
  assert.deepEqual(Object.keys(exposed.discovery).sort(), ['get', 'refresh', 'start', 'stop']);
  const stop = exposed.discovery.stop();
  assert.equal(exposed.discovery.stop(), stop);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(invocations.length, 8);
  assert.equal(invocations.filter((x) => x.channel === 'auto:discovery:v1').length, 1);
  assert.deepEqual([...new Set(invocations.map((x) => x.channel))].sort(), [
    'auto:discovery:v1',
    'foundation:fleet:v1',
    'foundation:metadata:v1',
    'foundation:platform-tools:v2',
    'foundation:preferences:v1',
    'foundation:request:v2',
    'foundation:schedule-draft:v1',
  ]);
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0][0], 'pagehide');
  assert.equal(listeners[0][2].once, true);
  listeners[0][1]();
  assert.equal(readyListeners.size, 0);
  for (const p of pending) assert.equal(JSON.parse(await p).code, 'SESSION_UNAVAILABLE');
  assert.equal(JSON.parse(await stop).outcome, 'OUTCOME_UNKNOWN');
  assert.equal(invocations.length, 8);
  assert.equal(JSON.parse(await exposed.scheduleDraft.preview(draft)).code, 'SESSION_UNAVAILABLE');
  assert.equal(JSON.parse(await exposed.platformTools.read()).code, 'SESSION_UNAVAILABLE');
  assert.equal(JSON.parse(await exposed.platformTools.requestSetup(0)).code, 'SESSION_UNAVAILABLE');
});
