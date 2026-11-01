import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as clients from '../src/preload-client.ts';
import * as fleet from '../src/fleet-client.ts';
import * as platformTools from '../src/platform-tools-setup-client.ts';
import * as preferences from '../src/settings-client.ts';
import * as budget from '../src/invocation-budget.ts';
import * as diagnostic from '../src/ipc-diagnostic-contract.ts';
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
      if (name === './preload-client.js') return clients;
      if (name === './settings-client.js') return preferences;
      if (name === './fleet-client.js') return fleet;
      if (name === './platform-tools-setup-client.js') return platformTools;
      if (name === './invocation-budget.js') return budget;
      if (name === './ipc-diagnostic-contract.js') return diagnostic;
      throw Error('UNKNOWN_MODULE');
    },
    window: { addEventListener: (...args) => listeners.push(args) },
  });
  assert.deepEqual(Object.keys(exposed).sort(), [
    'fleet',
    'foundation',
    'platformTools',
    'preferences',
  ]);
  assert.deepEqual(Object.keys(exposed.foundation).sort(), ['health', 'settings']);
  assert.deepEqual(Object.keys(exposed.preferences).sort(), [
    'read',
    'reset',
    'restorePrevious',
    'update',
  ]);
  assert.deepEqual(Object.keys(exposed.fleet).sort(), ['read', 'replaceSelection']);
  assert.deepEqual(Object.keys(exposed.platformTools).sort(), ['read', 'requestSetup']);
  assert.ok(Object.isFrozen(exposed.platformTools));
  assert.equal(JSON.parse(await exposed.platformTools.requestSetup(0)).code, 'SESSION_UNAVAILABLE');
  assert.equal(invocations.length, 0);
  assert.ok(Object.isFrozen(exposed.fleet));
  assert.ok(Object.isFrozen(exposed.foundation));
  assert.ok(Object.isFrozen(exposed.preferences));
  assert.deepEqual([...readyListeners.keys()], ['foundation:preferences:ready']);
  readyListeners.get('foundation:preferences:ready')();
  const pending = [
    exposed.foundation.health(),
    exposed.foundation.settings(),
    ...Array.from({ length: 2 }, () => exposed.preferences.read()),
    ...Array.from({ length: 2 }, () => exposed.fleet.read()),
    ...Array.from({ length: 2 }, () => exposed.platformTools.read()),
  ];
  assert.equal(JSON.parse(await exposed.preferences.read()).code, 'BUSY');
  assert.equal(JSON.parse(await exposed.fleet.read()).code, 'BUSY');
  assert.equal(JSON.parse(await exposed.platformTools.read()).code, 'BUSY');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(invocations.length, 8);
  assert.deepEqual([...new Set(invocations.map((x) => x.channel))].sort(), [
    'foundation:fleet:v1',
    'foundation:platform-tools:v1',
    'foundation:preferences:v1',
    'foundation:request:v2',
  ]);
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0][0], 'pagehide');
  assert.equal(listeners[0][2].once, true);
  listeners[0][1]();
  assert.equal(readyListeners.size, 0);
  for (const p of pending) assert.equal(JSON.parse(await p).code, 'SESSION_UNAVAILABLE');
  assert.equal(invocations.length, 8);
  assert.equal(JSON.parse(await exposed.platformTools.read()).code, 'SESSION_UNAVAILABLE');
  assert.equal(JSON.parse(await exposed.platformTools.requestSetup(0)).code, 'SESSION_UNAVAILABLE');
});
