import * as discoveryClient from '../src/discovery-client.ts';
import * as discoveryContract from '../src/discovery-contract.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ApplicationLogger } from '../src/main/logging.ts';
import { LogStore } from '../src/main/log-store.ts';
import { encodeLogRecord } from '../src/log-contract.ts';
import * as versionClient from '../src/runtime-version-client.ts';
import * as versionContract from '../src/runtime-version-contract.ts';
import * as clients from '../src/preload-client.ts';
import * as fleet from '../src/fleet-client.ts';
import * as platformTools from '../src/platform-tools-setup-client.ts';
import * as preferences from '../src/settings-client.ts';
import * as budget from '../src/invocation-budget.ts';
import * as diagnostic from '../src/ipc-diagnostic-contract.ts';
import * as contract from '../src/settings-contract.ts';
import * as fleetContract from '../src/fleet-contract.ts';
import * as setupContract from '../src/platform-tools-setup-contract.ts';
const id = 'abcdef00-0000-4000-8000-000000000001',
  utc = '2026-10-31T12:00:00.000Z';
const fields = () => ({
  operation: 'REQUEST',
  phase: 'INTENT',
  diagnosticId: id,
  operationId: 'abcdef00-0000-4000-8000-000000000002',
  expectedRevision: 0,
  resultingRevision: null,
  installationRevision: 1,
  outcome: 'INTENT',
  code: 'OK',
});
const source = (n) => readFileSync(new URL('../' + n, import.meta.url), 'utf8');
function fixture() {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'version-audit-')),
    token = randomUUID();
  writeFileSync(join(root, '.owner'), token, { flag: 'wx' });
  return {
    root,
    location: { root: join(root, 'logs-main'), parentToken: token },
    cleanup() {
      assert.equal(realpathSync(root), root);
      assert.equal(readFileSync(join(root, '.owner'), 'utf8'), token);
      rmSync(root, { recursive: true, force: false });
    },
  };
}

test('real owned ApplicationLogger schema7 flushes alongside historical logs and reopens', async () => {
  const f = fixture();
  let store;
  try {
    store = await LogStore.open(f.location, utc);
    const logger = new ApplicationLogger(
      store,
      () => utc,
      () => {},
      () => id,
    );
    logger.emit('STARTUP_READY', 'OK');
    assert.equal(await logger.runtimeVersionAudit(fields()), 'AVAILABLE');
    assert.equal(
      await logger.runtimeVersionAudit({
        ...fields(),
        phase: 'RESULT',
        outcome: 'PENDING',
        resultingRevision: 1,
      }),
      'AVAILABLE',
    );
    assert.equal(
      await logger.runtimeVersionAudit({
        ...fields(),
        operation: 'VERIFY',
        phase: 'RESULT',
        outcome: 'VERIFIED',
        resultingRevision: 2,
      }),
      'AVAILABLE',
    );
    assert.equal(await logger.close(), 'FLUSHED');
    const records = readdirSync(f.location.root)
      .filter((n) => n.endsWith('.jsonl'))
      .flatMap((n) => readFileSync(join(f.location.root, n), 'utf8').trim().split('\n'))
      .map(JSON.parse);
    assert.ok(records.some((r) => r.schemaVersion === 1));
    const version = records.filter((r) => r.schemaVersion === 7);
    assert.equal(version.length, 3);
    for (const r of version) {
      assert.equal(r.event, 'RUNTIME_VERSION');
      assert.equal(r.component, 'MAIN');
      assert.equal(r.task, 'P2-01');
      assert.notEqual(encodeLogRecord(r), null);
      assert.equal(encodeLogRecord({ ...r, path: 'private-canary' }), null);
    }
    assert.equal(JSON.stringify(records).includes('private-canary'), false);
    store = await LogStore.open(f.location, utc);
    assert.equal(await store.close(), 'FLUSHED');
  } finally {
    await store?.close();
    f.cleanup();
  }
});
test('real owned schema7 append/sync faults degrade without leaking private errors', async () => {
  for (const fault of ['append', 'sync']) {
    const f = fixture();
    let store;
    try {
      store = await LogStore.open(f.location, utc, (point) => {
        if (point === fault) throw Error('private-canary');
      });
      const notices = [];
      const logger = new ApplicationLogger(
        store,
        () => utc,
        (m) => notices.push(m),
        () => id,
      );
      assert.equal(await logger.runtimeVersionAudit(fields()), 'DEGRADED');
      assert.deepEqual(notices, ['LOGGING_DEGRADED']);
      for (const n of readdirSync(f.location.root).filter((n) => n.endsWith('.jsonl')))
        assert.equal(
          readFileSync(join(f.location.root, n), 'utf8').includes('private-canary'),
          false,
        );
    } finally {
      await store?.close();
      f.cleanup();
    }
  }
});
test('actual transformed preload shares eight slots with VERSION and exposes no host capability', async () => {
  const code = transformSync(source('src/preload.ts'), { loader: 'ts', format: 'cjs' }).code,
    exposed = {},
    ready = new Map(),
    events = [],
    invocations = [];
  const modules = {
    './discovery-client.js': discoveryClient,
    './preload-client.js': clients,
    './settings-client.js': preferences,
    './fleet-client.js': fleet,
    './platform-tools-setup-client.js': platformTools,
    './runtime-version-client.js': versionClient,
    './invocation-budget.js': budget,
    './ipc-diagnostic-contract.js': diagnostic,
  };
  runInNewContext(code, {
    require: (n) =>
      n === 'electron'
        ? {
            contextBridge: {
              exposeInMainWorld: (k, v) => {
                exposed[k] = v;
              },
            },
            ipcRenderer: {
              once: (k, f) => ready.set(k, f),
              removeListener: (k) => ready.delete(k),
              invoke: (channel, wire) => {
                invocations.push({ channel, wire });
                return new Promise(() => {});
              },
            },
          }
        : (modules[n] ??
          (() => {
            throw Error('UNKNOWN_IMPORT');
          })()),
    window: { addEventListener: (...args) => events.push(args) },
  });
  assert.deepEqual(Object.keys(exposed.platformTools).sort(), [
    'read',
    'readVersion',
    'requestSetup',
    'verifyVersion',
  ]);
  assert.ok(Object.isFrozen(exposed.platformTools));
  assert.equal(
    JSON.parse(await exposed.platformTools.verifyVersion(0, 1)).code,
    'SESSION_UNAVAILABLE',
  );
  assert.equal(invocations.length, 0);
  ready.get('foundation:preferences:ready')();
  const pending = [
    exposed.foundation.health(),
    exposed.foundation.settings(),
    exposed.preferences.read(),
    exposed.fleet.read(),
    exposed.platformTools.read(),
    ...Array.from({ length: 2 }, () => exposed.platformTools.readVersion()),
  ];
  assert.equal(JSON.parse(await exposed.platformTools.readVersion()).code, 'BUSY');
  await new Promise((r) => setImmediate(r));
  assert.equal(invocations.length, 7);
  assert.equal(invocations.filter((r) => r.channel === 'foundation:runtime-version:v2').length, 2);
  events.find((e) => e[0] === 'pagehide')[1]();
  for (const p of pending) assert.equal(JSON.parse(await p).code, 'SESSION_UNAVAILABLE');
  assert.equal(JSON.parse(await exposed.platformTools.readVersion()).code, 'SESSION_UNAVAILABLE');
});
const code = transformSync(source('src/renderer.tsx'), {
  loader: 'tsx',
  format: 'cjs',
  jsx: 'automatic',
}).code;
const flush = () => new Promise((r) => setImmediate(r));
function mount(api, width = 1600, fleetApi = null, setupApi = null) {
  let component,
    cursor = 0;
  const slots = [];
  const effects = [],
    cleanups = [],
    events = new Map();
  const hostWindow = {
    innerWidth: width,
    preferences: api,
    platformTools: setupApi ?? {
      read: async () => setupContract.setupError(null, 'SESSION_UNAVAILABLE', null, 'DEGRADED'),
      requestSetup: async () =>
        setupContract.setupError(null, 'SESSION_UNAVAILABLE', null, 'DEGRADED'),
    },
    fleet: fleetApi ?? {
      read: async () =>
        fleetContract.fleetSuccess(
          'f1',
          'OBSERVED',
          {
            registryRevision: 0,
            availability: 'UNAVAILABLE',
            reason: 'BINARY_UNAVAILABLE',
            devices: [],
            selection: { revision: 0, selectedDeviceIds: [], activeDeviceId: null, groups: [] },
          },
          'DEGRADED',
        ),
      replaceSelection: async () => fleetContract.fleetError('FLEET_UNAVAILABLE', null, 'DEGRADED'),
    },
    foundation: { health: async () => '{"ok":true}', settings: async () => '{"ok":true}' },
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name, fn) => {
      if (events.get(name) === fn) events.delete(name);
    },
  };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useCallback(fn) {
      return fn;
    },
    useEffect(effect, dependencies) {
      const at = cursor++;
      if (
        !(at in slots) ||
        dependencies.length !== slots[at].length ||
        dependencies.some((value, index) => !Object.is(value, slots[at][index]))
      ) {
        slots[at] = [...dependencies];
        effects.push(effect);
      }
    },
    useState(initial) {
      const at = cursor++;
      if (!(at in slots)) slots[at] = initial;
      return [
        slots[at],
        (value) => {
          slots[at] = typeof value === 'function' ? value(slots[at]) : value;
        },
      ];
    },
    useRef(initial) {
      const at = cursor++;
      if (!(at in slots)) slots[at] = { current: initial };
      return slots[at];
    },
  };
  runInNewContext(code, {
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-dom/client')
        return {
          createRoot: () => ({
            render: (value) => {
              component = value.type;
            },
          }),
        };
      if (name === './runtime-version-contract.js') return versionContract;
      if (name === './discovery-contract.js') return discoveryContract;
      if (name === './settings-contract.js') return contract;
      if (name === './fleet-contract.js') return fleetContract;
      if (name === './platform-tools-setup-contract.js') return setupContract;
      if (name === './ui/ui-shell.tsx') return { UiShell: 'UiShell' };
      throw Error('UNKNOWN_MODULE');
    },
    window: hostWindow,
    document: { getElementById: () => ({}) },
  });
  const render = () => {
    cursor = 0;
    return component();
  };
  const find = (id, node = render()) => {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.id === id) return node;
    for (const child of [node.props?.children, node.props?.settings].flat(Infinity)) {
      const found = find(id, child ?? null);
      if (found) return found;
    }
    return null;
  };
  return {
    render,
    find,
    effects: () => {
      render();
      for (const effect of effects.splice(0)) cleanups.push(effect());
    },
    resize: (width) => {
      hostWindow.innerWidth = width;
      events.get('resize')?.();
    },
    dispose: () => {
      for (const fn of cleanups) fn?.();
    },
    events,
  };
}

test('actual transformed Help renderer never auto-verifies; only explicit click invokes fixed version API', async () => {
  const calls = [];
  const state = {
    revision: 1,
    installationRevision: 1,
    state: 'IDLE',
    operationId: null,
    code: null,
    installTargetVersion: '37.0.1',
    activeVersion: '37.0.1',
    verifiedAtUtc: null,
  };
  const api = { read: async () => contract.settingsError('SESSION_UNAVAILABLE', null, 'DEGRADED') };
  const setup = {
    read: async () => setupContract.setupError(null, 'SESSION_UNAVAILABLE', null, 'DEGRADED'),
    requestSetup: async () =>
      setupContract.setupError(null, 'SESSION_UNAVAILABLE', null, 'DEGRADED'),
    readVersion: async () => {
      calls.push('READ');
      return versionContract.runtimeVersionSuccess('p1', 'OBSERVED', state, id, 'AVAILABLE');
    },
    verifyVersion: async (...args) => {
      calls.push(args);
      return versionContract.runtimeVersionSuccess(
        'p2',
        'PENDING',
        { ...state, revision: 2, state: 'PENDING', operationId: id },
        id,
        'AVAILABLE',
      );
    },
  };
  const m = mount(api, 1600, null, setup);
  m.effects();
  await flush();
  assert.deepEqual(calls, []);
  const read = m.find('runtime-version-read');
  assert.ok(read);
  read.props.onClick();
  await flush();
  assert.deepEqual(calls, ['READ']);
  const verify = m.find('runtime-version-verify');
  assert.equal(verify.props.disabled, false);
  verify.props.onClick();
  await flush();
  assert.deepEqual(calls, ['READ', [1, 1]]);
  assert.equal(m.find('runtime-version-verify').props.disabled, true);
  m.effects();
  await flush();
  assert.equal(calls.length, 2);
  m.dispose();
});
test('source lifecycle keeps cleanup lease distinct and closes setup/version/discovery before custody; observer detects fixed and legacy residue', () => {
  const main = source('src/main.ts'),
    native = source('src/main/runtime-version-native.ts');
  const concurrent =
    /Promise\.all\(\[\s*setup\.shutdown\(\),\s*versionService\.shutdown\(\),\s*discovery\.close\(\),?\s*\]\)/.exec(
      main,
    );
  assert.ok(concurrent);
  assert.ok(concurrent.index < main.indexOf('await runtimeCustody.close()'));
  const cleanup = main.slice(
    main.indexOf('const cleanupOwned ='),
    main.indexOf('const desktopRoot =', main.indexOf('const cleanupOwned =')),
  );
  assert.match(cleanup, /assertPreparedPersistenceLease\(ownedEntry\)/);
  assert.doesNotMatch(cleanup, /closing/);
  assert.match(main, /assertOwnedSync: cleanupOwned/);
  assert.match(native, /\.launcher-current\.json/);
  assert.doesNotMatch(native, /readdir|createHostFactory/);
  const observer = source('verification/retained-host-main-probe.cjs');
  const predicate = observer.match(
    /\(n\) => n === '\.host-session' \|\| n\.startsWith\('host-session'\)/,
  );
  assert.ok(predicate);
  const retained = runInNewContext('(' + predicate[0] + ')');
  assert.equal(retained('.host-session'), true);
  assert.equal(retained('host-session-legacy'), true);
  assert.equal(retained('host-parent.json'), false);
});
