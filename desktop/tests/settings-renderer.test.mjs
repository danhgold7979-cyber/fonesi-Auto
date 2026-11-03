import * as inputContract from '../src/input-interaction-contract.ts';
import * as associationContract from '../src/association-contract.ts';
import * as metadataContract from '../src/metadata-contract.ts';
import * as discoveryContract from '../src/discovery-contract.ts';
import * as runtimeVersionContract from '../src/runtime-version-contract.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as contract from '../src/settings-contract.ts';
import * as fleetContract from '../src/fleet-contract.ts';
import * as fleetHealth from '../src/ui/fleet-health.ts';
import * as setupContract from '../src/platform-tools-setup-contract.ts';
const code = transformSync(readFileSync(new URL('../src/renderer.tsx', import.meta.url), 'utf8'), {
  loader: 'tsx',
  format: 'cjs',
  jsx: 'automatic',
}).code;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const settings = (extra = {}) => ({
  revision: 0,
  theme: 'LIGHT',
  dockWidth: null,
  tileWidth: 150,
  persistence: 'PERSISTED',
  ...extra,
});
function mount(
  api,
  width = 1600,
  fleetApi = null,
  setupApi = null,
  discoveryApi = null,
  metadataApi = null,
  associationApi = null,
  inputApi = null,
) {
  let component,
    cursor = 0;
  const slots = [];
  const effects = [],
    cleanups = [],
    events = new Map();
  const hostWindow = {
    innerWidth: width,
    preferences: api,
    discovery: discoveryApi,
    association: associationApi,
    input: inputApi,
    metadata: metadataApi ?? {
      get: async () =>
        metadataContract.metadataError(null, 'SESSION_UNAVAILABLE', null, 'DEGRADED'),
      read: async () => {
        throw Error('UNEXPECTED_READ');
      },
    },
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
      if (name === './input-interaction-contract.js') return inputContract;
      if (name === './association-contract.js') return associationContract;
      if (name === './metadata-contract.js') return metadataContract;
      if (name === './discovery-contract.js') return discoveryContract;
      if (name === './settings-contract.js') return contract;
      if (name === './fleet-contract.js') return fleetContract;
      if (name === './ui/fleet-health.js') return fleetHealth;
      if (name === './platform-tools-setup-contract.js') return setupContract;
      if (name === './runtime-version-contract.js') return runtimeVersionContract;
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
test('actual transformed React source before effects permits explicit read and applies bounded theme/preview', async () => {
  const calls = [];
  const m = mount({
    read: async () => {
      calls.push('read');
      return contract.settingsSuccess(
        'p1',
        'OBSERVED',
        settings({ theme: 'DARK', dockWidth: 700, tileWidth: 151 }),
        'AVAILABLE',
      );
    },
  });
  assert.equal(calls.length, 0);
  assert.equal(m.find('preferences-theme').props.disabled, true);
  assert.ok(m.find('health-read'));
  assert.ok(m.find('settings-read'));
  m.find('preferences-read').props.onClick();
  await flush();
  assert.deepEqual(calls, ['read']);
  assert.equal(m.find('preference-panel').props['data-theme'], 'DARK');
  assert.equal(m.find('preference-preview').props.style.width, '700px');
  assert.equal(m.find('preference-tile').props.style.width, '151px');
  assert.equal(m.render().type, 'UiShell');
  assert.equal(m.render().props.theme, 'DARK');
  assert.equal(m.find('preferences-theme').props.disabled, false);
});
test('theme update uses observed revision; timeout blocks mutations until explicit reconciliation without retry', async () => {
  const calls = [];
  let reads = 0;
  const m = mount({
    read: async () => {
      reads++;
      return contract.settingsSuccess('p1', 'OBSERVED', settings({ revision: 4 }), 'AVAILABLE');
    },
    update: async (revision, patch) => {
      calls.push({ revision, patch });
      return contract.settingsError('TIMEOUT', null, 'DEGRADED');
    },
  });
  m.find('preferences-read').props.onClick();
  await flush();
  m.find('preferences-theme').props.onClick();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].revision, 4);
  assert.equal(calls[0].patch.theme, 'DARK');
  assert.match(m.find('preferences-status').props.children, /OUTCOME UNKNOWN/);
  assert.equal(m.find('preferences-theme').props.disabled, true);
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(reads, 1);
  m.find('preferences-read').props.onClick();
  await flush();
  assert.equal(reads, 2);
  assert.equal(m.find('preferences-theme').props.disabled, false);
});
test('invalid dimensions never invoke and immediate duplicate click never creates second native request', async () => {
  let resolve,
    calls = 0;
  const m = mount({
    read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE'),
    update: () => {
      calls++;
      return new Promise((r) => {
        resolve = r;
      });
    },
  });
  m.find('preferences-read').props.onClick();
  await flush();
  m.find('preferences-tile').props.onChange({ currentTarget: { value: '69' } });
  m.find('preferences-dimensions').props.onClick();
  assert.equal(calls, 0);
  const button = m.find('preferences-theme');
  button.props.onClick();
  button.props.onClick();
  assert.equal(calls, 1);
  resolve(
    contract.settingsSuccess(
      'p2',
      'COMMITTED',
      settings({ revision: 1, theme: 'DARK' }),
      'AVAILABLE',
    ),
  );
  await flush();
  assert.equal(m.find('preference-panel').props['data-theme'], 'DARK');
});
test('dimension/reset/restore controls delegate exact current revision and responsive preview does not rewrite requested width', async () => {
  const calls = [];
  const current = settings({ revision: 2, dockWidth: 800 });
  const response = () => contract.settingsSuccess('p', 'UNCHANGED', current, 'AVAILABLE');
  const m = mount(
    {
      read: async () => contract.settingsSuccess('p', 'OBSERVED', current, 'AVAILABLE'),
      update: async (...args) => {
        calls.push(['update', ...args]);
        return response();
      },
      reset: async (...args) => {
        calls.push(['reset', ...args]);
        return response();
      },
      restorePrevious: async (...args) => {
        calls.push(['restore', ...args]);
        return response();
      },
    },
    1000,
  );
  m.find('preferences-read').props.onClick();
  await flush();
  assert.equal(m.find('preference-preview').props.style.width, '100%');
  assert.equal(m.find('preferences-dock').props.value, '800');
  m.find('preferences-dock').props.onChange({ currentTarget: { value: '' } });
  m.find('preferences-tile').props.onChange({ currentTarget: { value: '151' } });
  m.find('preferences-dimensions').props.onClick();
  await flush();
  assert.equal(calls[0][0], 'update');
  assert.equal(calls[0][1], 2);
  assert.equal(calls[0][2].dockWidth, null);
  assert.equal(calls[0][2].tileWidth, 151);
  m.find('preferences-reset').props.onClick();
  await flush();
  m.find('preferences-restore').props.onClick();
  await flush();
  assert.deepEqual(calls.slice(1), [
    ['reset', 2],
    ['restore', 2],
  ]);
});

test('one mount hydration read applies saved theme; resize adjusts preview without persistence or retries', async () => {
  let reads = 0,
    writes = 0;
  const m = mount({
    read: async () => {
      reads++;
      return contract.settingsSuccess(
        'p',
        'OBSERVED',
        settings({ theme: 'DARK', dockWidth: 800 }),
        'AVAILABLE',
      );
    },
    update: async () => {
      writes++;
      throw Error('UNEXPECTED');
    },
  });
  m.effects();
  await flush();
  assert.equal(reads, 1);
  assert.equal(m.find('preference-panel').props['data-theme'], 'DARK');
  m.effects();
  await flush();
  assert.equal(reads, 1);
  m.resize(1200);
  assert.equal(m.find('preference-preview').props.style.width, '690px');
  assert.equal(m.find('preferences-dock').props.value, '800');
  m.resize(1000);
  assert.equal(m.find('preference-preview').props.style.width, '100%');
  assert.equal(writes, 0);
  m.dispose();
  assert.equal(m.events.size, 0);
});
test('failed mount hydration stays explicit-read-only without automatic retry', async () => {
  let reads = 0;
  const m = mount({
    read: async () => {
      reads++;
      return contract.settingsError('TIMEOUT', null, 'DEGRADED');
    },
  });
  m.effects();
  await flush();
  m.effects();
  await flush();
  assert.equal(reads, 1);
  assert.equal(m.find('preferences-theme').props.disabled, true);
  assert.match(m.find('preferences-status').props.children, /OUTCOME UNKNOWN/);
  m.dispose();
});

test('actual shell dimension callback persists exact observed revision once without opening settings', async () => {
  const calls = [];
  const current = settings({ revision: 8, theme: 'DARK', dockWidth: 700 });
  const m = mount({
    read: async () => contract.settingsSuccess('p', 'OBSERVED', current, 'AVAILABLE'),
    update: async (revision, patch) => {
      calls.push({ revision, patch });
      return contract.settingsSuccess(
        'p2',
        'COMMITTED',
        settings({ ...current, revision: 9, ...patch }),
        'AVAILABLE',
      );
    },
  });
  m.effects();
  await flush();
  assert.equal(m.render().props.theme, 'DARK');
  assert.equal(m.render().props.ready, true);
  assert.equal(m.render().props.requestedDockWidth, 700);
  m.render().props.onDimensions(650, 180);
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].revision, 8);
  assert.equal(calls[0].patch.dockWidth, 650);
  assert.equal(calls[0].patch.tileWidth, 180);
  assert.equal(m.render().props.tileWidth, 180);
  m.effects();
  await flush();
  assert.equal(calls.length, 1);
  m.dispose();
});
const fleetId = '00000001-1234-4234-8234-123456789abc';
const fleetState = (revision = 0, selected = []) => ({
  registryRevision: 1,
  availability: 'OBSERVED',
  reason: null,
  devices: [
    {
      deviceId: fleetId,
      generation: 1,
      label: 'Device 0001',
      state: 'OFFLINE',
      verification: 'VERIFIED',
    },
  ],
  selection: { revision, selectedDeviceIds: selected, activeDeviceId: null, groups: [] },
});
test('fleet hydrates once independently of preferences and exposes only main-observed safe UI rows', async () => {
  let reads = 0,
    prefs = 0;
  const m = mount(
    {
      read: async () => {
        prefs++;
        return contract.settingsSuccess('p1', 'OBSERVED', settings({ theme: 'DARK' }), 'AVAILABLE');
      },
    },
    1600,
    {
      read: async () => {
        reads++;
        return fleetContract.fleetSuccess('f1', 'OBSERVED', fleetState(), 'DEGRADED');
      },
      replaceSelection: async () => {
        throw Error('not requested');
      },
    },
  );
  assert.equal(m.render().props.snapshot.status, 'LOADING');
  m.effects();
  await flush();
  m.effects();
  await flush();
  const shell = m.render().props;
  assert.equal(reads, 1);
  assert.equal(prefs, 1);
  assert.equal(shell.theme, 'DARK');
  assert.equal(shell.snapshot.provenance, 'MAIN_OBSERVED');
  assert.equal(shell.snapshot.devices[0].serial, '—');
  assert.equal(shell.snapshot.devices[0].name, 'Device 0001');
  assert.equal(shell.snapshot.devices[0].generation, 1);
  assert.equal(shell.selection.selectedDeviceIds.length, 0);
});
test('Fleet generation is copied unchanged and malformed generations never enter UI rows', async () => {
  // Synthetic bridge responses traverse the actual Fleet parser and renderer projection.
  const original = fleetContract.fleetSuccess('f1', 'OBSERVED', fleetState(), 'AVAILABLE');
  for (const generation of [0, 7, Number.MAX_SAFE_INTEGER]) {
    const raw = original.replace('"generation":1', `"generation":${generation}`);
    const m = mount(
      { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
      1600,
      { read: async () => raw },
    );
    m.render();
    m.effects();
    await flush();
    const snapshot = m.render().props.snapshot;
    assert.equal(snapshot.status, 'READY');
    assert.equal(snapshot.devices[0].generation, generation);
    assert.equal(snapshot.provenance, 'MAIN_OBSERVED');
  }
  for (const replacement of [
    '',
    '"generation":-0,',
    '"generation":-1,',
    '"generation":1.5,',
    '"generation":9007199254740992,',
    '"generation":"1",',
    '"generation":null,',
  ]) {
    const raw = original.replace('"generation":1,', replacement);
    assert.notEqual(raw, original);
    const m = mount(
      { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
      1600,
      { read: async () => raw },
    );
    m.render();
    m.effects();
    await flush();
    const snapshot = m.render().props.snapshot;
    assert.equal(snapshot.status, 'ERROR');
    assert.equal(snapshot.devices.length, 0);
  }
});
test('fleet selection remains confirmed-only, guards immediate double submit and requires explicit read after timeout', async () => {
  let reads = 0,
    resolve;
  const mutations = [];
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    {
      read: async () => {
        reads++;
        return fleetContract.fleetSuccess('f1', 'OBSERVED', fleetState(), 'AVAILABLE');
      },
      replaceSelection: (revision, selection) => {
        mutations.push({ revision, selection });
        return new Promise((r) => (resolve = r));
      },
    },
  );
  m.effects();
  await flush();
  const next = { selectedDeviceIds: [fleetId], activeDeviceId: null, groups: [] };
  m.render().props.onSelection(next);
  m.render().props.onSelection(next);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].revision, 0);
  assert.equal(m.render().props.selection.selectedDeviceIds.length, 0);
  resolve(fleetContract.fleetError('TIMEOUT', null, 'DEGRADED'));
  await flush();
  assert.equal(m.render().props.snapshot.status, 'ERROR');
  assert.equal(m.render().props.selectionBlocked, true);
  m.render().props.onSelection(next);
  assert.equal(mutations.length, 1);
  m.effects();
  await flush();
  assert.equal(reads, 1);
  m.find('fleet-read').props.onClick();
  await flush();
  assert.equal(reads, 2);
  assert.equal(m.render().props.selectionBlocked, false);
  m.render().props.onSelection(next);
  resolve(fleetContract.fleetSuccess('f2', 'APPLIED', fleetState(1, [fleetId]), 'DEGRADED'));
  await flush();
  assert.deepEqual(Array.from(m.render().props.selection.selectedDeviceIds), [fleetId]);
  assert.match(m.find('fleet-status').props.children, /PROCESS-LOCAL SELECTION 1/);
});
test('failed fleet hydration never hides independently restored preferences or automatically retries', async () => {
  let reads = 0;
  const m = mount(
    {
      read: async () =>
        contract.settingsSuccess('p1', 'OBSERVED', settings({ theme: 'DARK' }), 'AVAILABLE'),
    },
    1600,
    {
      read: async () => {
        reads++;
        return 'invalid';
      },
      replaceSelection: async () => {
        throw Error('must not mutate');
      },
    },
  );
  m.effects();
  await flush();
  m.effects();
  await flush();
  assert.equal(reads, 1);
  assert.equal(m.render().props.theme, 'DARK');
  assert.equal(m.render().props.snapshot.status, 'ERROR');
  assert.equal(m.render().props.selectionBlocked, true);
});

test('actual Help setup hydrates once and requires explicit read after pending native acknowledgment', async () => {
  let reads = 0,
    requests = 0;
  const snapshot = {
    revision: 0,
    installationRevision: 0,
    state: 'UNAVAILABLE',
    operationId: null,
    code: null,
    installTargetVersion: '37.0.1',
    activeVersion: null,
    rollbackAvailable: false,
  };
  const api = {
    read: async () => {
      reads++;
      return setupContract.setupSuccess(
        'p1',
        'OBSERVED',
        snapshot,
        '00000000-0000-4000-8000-000000000001',
        'AVAILABLE',
      );
    },
    requestSetup: async (revision) => {
      requests++;
      assert.equal(revision, 0);
      return setupContract.setupSuccess(
        'p2',
        'PENDING',
        {
          ...snapshot,
          revision: 1,
          state: 'AWAITING_RECIPIENT',
          operationId: '00000000-0000-4000-8000-000000000002',
        },
        '00000000-0000-4000-8000-000000000001',
        'AVAILABLE',
      );
    },
  };
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    null,
    api,
  );
  assert.equal(m.find('platform-tools-setup').props.disabled, true);
  m.effects();
  await flush();
  m.effects();
  await flush();
  assert.equal(reads, 1);
  assert.equal(m.find('platform-tools-setup').props.disabled, false);
  m.find('platform-tools-setup').props.onClick();
  await flush();
  m.effects();
  await flush();
  assert.equal(requests, 1);
  assert.equal(reads, 1);
  assert.equal(m.find('platform-tools-setup').props.disabled, true);
  m.find('platform-tools-read').props.onClick();
  await flush();
  assert.equal(reads, 2);
  assert.equal(m.find('platform-tools-setup').props.disabled, false);
  m.dispose();
});

test('Help exposes target versus prior active release and setup invalidates cached VERSION', async () => {
  const diagnostic = '00000000-0000-4000-8000-000000000001';
  const setup = {
    revision: 2,
    installationRevision: 3,
    state: 'VERIFIED_LOCAL',
    operationId: null,
    code: null,
    installTargetVersion: '37.0.1',
    activeVersion: '36.0.0',
    rollbackAvailable: true,
  };
  const runtime = {
    revision: 1,
    installationRevision: 3,
    state: 'VERIFIED',
    operationId: null,
    code: null,
    installTargetVersion: '37.0.1',
    activeVersion: '36.0.0',
    verifiedAtUtc: 1,
  };
  let requests = 0;
  const api = {
    read: async () => setupContract.setupSuccess('p1', 'OBSERVED', setup, diagnostic, 'AVAILABLE'),
    readVersion: async () =>
      runtimeVersionContract.runtimeVersionSuccess(
        'p2',
        'OBSERVED',
        runtime,
        diagnostic,
        'AVAILABLE',
      ),
    requestSetup: async () => {
      requests++;
      return setupContract.setupError('p3', 'SETUP_CANCELLED', diagnostic, 'AVAILABLE');
    },
  };
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    null,
    api,
  );
  m.effects();
  await flush();
  m.effects();
  await flush();
  assert.equal(m.find('platform-tools-setup').props.disabled, false);
  const text = JSON.stringify(m.find('platform-tools-release').props.children);
  assert.ok(text.includes('37.0.1') && text.includes('36.0.0'));
  m.find('runtime-version-read').props.onClick();
  await flush();
  assert.equal(m.find('runtime-version-verify').props.disabled, false);
  m.find('platform-tools-setup').props.onClick();
  await flush();
  assert.equal(requests, 1);
  assert.equal(m.find('runtime-version-verify').props.disabled, true);
  m.dispose();
});

test('late VERSION read cannot rearm Help after setup begins or observed installation changes', async () => {
  for (const trigger of ['request', 'read-change']) {
    const diagnostic = '00000000-0000-4000-8000-000000000001';
    let setup = {
      revision: 2,
      installationRevision: 3,
      state: 'VERIFIED_LOCAL',
      operationId: null,
      code: null,
      installTargetVersion: '37.0.1',
      activeVersion: '36.0.0',
      rollbackAvailable: true,
    };
    const runtime = {
      revision: 1,
      installationRevision: 3,
      state: 'VERIFIED',
      operationId: null,
      code: null,
      installTargetVersion: '37.0.1',
      activeVersion: '36.0.0',
      verifiedAtUtc: 1,
    };
    let release;
    const api = {
      read: async () =>
        setupContract.setupSuccess('p1', 'OBSERVED', setup, diagnostic, 'AVAILABLE'),
      readVersion: () =>
        new Promise((r) => {
          release = () =>
            r(
              runtimeVersionContract.runtimeVersionSuccess(
                'p2',
                'OBSERVED',
                runtime,
                diagnostic,
                'AVAILABLE',
              ),
            );
        }),
      requestSetup: async () =>
        setupContract.setupError('p3', 'SETUP_CANCELLED', diagnostic, 'AVAILABLE'),
    };
    const m = mount(
      { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
      1600,
      null,
      api,
    );
    m.effects();
    await flush();
    m.effects();
    await flush();
    m.find('runtime-version-read').props.onClick();
    await flush();
    if (trigger === 'request') m.find('platform-tools-setup').props.onClick();
    else {
      setup = { ...setup, revision: 3, installationRevision: 4, activeVersion: '37.0.1' };
      m.find('platform-tools-read').props.onClick();
    }
    await flush();
    release();
    await flush();
    assert.equal(m.find('runtime-version-verify').props.disabled, true, trigger);
    m.dispose();
  }
});

const discoverySnapshot = (extra = {}) => ({
  revision: 0,
  installationRevision: 1,
  state: 'IDLE',
  operationId: null,
  operation: null,
  lastOutcome: 'NONE',
  code: null,
  registryRevision: 2,
  observedAtUtc: null,
  restartRequired: false,
  ...extra,
});
const discoveryAnswer = (snapshot, outcome = 'OBSERVED') =>
  discoveryContract.discoverySuccess('p1', outcome, snapshot, null, 'DEGRADED');
test('Help discovery is explicit; Stop preempts pending Start and late PENDING cannot rearm', async () => {
  const calls = [];
  let settle;
  const api = {
    get: async () => {
      calls.push('get');
      return discoveryAnswer(discoverySnapshot());
    },
    start: () => {
      calls.push('start');
      return new Promise((r) => {
        settle = r;
      });
    },
    refresh: async () => {
      calls.push('refresh');
      throw Error();
    },
    stop: async () => {
      calls.push('stop');
      return discoveryAnswer(
        discoverySnapshot({
          revision: 2,
          state: 'STOPPING',
          operation: 'STOP',
          operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          lastOutcome: 'PENDING',
          restartRequired: true,
        }),
        'PENDING',
      );
    },
  };
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    null,
    null,
    api,
  );
  m.effects();
  await flush();
  assert.deepEqual(calls, []);
  m.find('discovery-read').props.onClick();
  await flush();
  assert.equal(m.find('discovery-start').props.disabled, false);
  m.find('discovery-start').props.onClick();
  await flush();
  assert.equal(m.find('discovery-stop').props.disabled, false);
  m.find('discovery-stop').props.onClick();
  await flush();
  assert.deepEqual(calls, ['get', 'start', 'stop']);
  settle(
    discoveryAnswer(
      discoverySnapshot({
        revision: 1,
        state: 'STARTING',
        operation: 'START',
        operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        lastOutcome: 'PENDING',
      }),
      'PENDING',
    ),
  );
  await flush();
  assert.match(m.find('discovery-status').props.children, /STOPPING/);
  assert.equal(m.find('discovery-start').props.disabled, true);
  assert.equal(m.render().props.selectionBlocked, true);
  m.dispose();
});
test('observed discovery failure clears cached fleet and suppresses older pending fleet reply', async () => {
  let releaseFleet,
    reads = 0;
  const fleetApi = {
    read: async () => {
      reads++;
      if (reads === 1)
        return fleetContract.fleetSuccess('f1', 'OBSERVED', fleetState(), 'AVAILABLE');
      return new Promise((r) => {
        releaseFleet = r;
      });
    },
    replaceSelection: async () => {
      throw Error();
    },
  };
  const discoveryApi = {
    get: async () => discoveryContract.discoveryError('p1', 'SESSION_REVOKED', null, 'DEGRADED'),
    start: async () => {
      throw Error();
    },
    refresh: async () => {
      throw Error();
    },
    stop: async () => {
      throw Error();
    },
  };
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    fleetApi,
    null,
    discoveryApi,
  );
  m.effects();
  await flush();
  assert.equal(m.render().props.snapshot.devices.length, 1);
  m.find('fleet-read').props.onClick();
  await flush();
  m.find('discovery-read').props.onClick();
  await flush();
  assert.equal(m.render().props.snapshot.devices.length, 0);
  releaseFleet(fleetContract.fleetSuccess('f2', 'OBSERVED', fleetState(), 'AVAILABLE'));
  await flush();
  assert.equal(m.render().props.snapshot.devices.length, 0);
  assert.equal(m.render().props.selectionBlocked, true);
  m.dispose();
});

test('explicit cross-panel session revocation clears discovery and cached fleet without treating initial unavailable as loss', async () => {
  for (const code of ['SESSION_REVOKED', 'OWNER_REVOKED', 'CLOSED']) {
    let denied = false;
    const preferences = {
      read: async () =>
        denied
          ? contract.settingsError(code, null, 'DEGRADED')
          : contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE'),
    };
    const fleetApi = {
      read: async () =>
        fleetContract.fleetSuccess('f1', 'OBSERVED', fleetState(0, [fleetId]), 'AVAILABLE'),
      replaceSelection: async () => {
        throw Error();
      },
    };
    const discoveryApi = {
      get: async () => discoveryAnswer(discoverySnapshot()),
      start: async () => {
        throw Error();
      },
      refresh: async () => {
        throw Error();
      },
      stop: async () => {
        throw Error();
      },
    };
    const setupApi = {
      read: async () => setupContract.setupError(null, 'SESSION_UNAVAILABLE', null, 'DEGRADED'),
      readVersion: async () =>
        runtimeVersionContract.runtimeVersionError(null, code, null, 'DEGRADED'),
    };
    const m = mount(preferences, 1600, fleetApi, setupApi, discoveryApi);
    m.effects();
    await flush();
    assert.equal(m.render().props.snapshot.devices.length, 1);
    m.find('discovery-read').props.onClick();
    await flush();
    assert.equal(m.find('discovery-start').props.disabled, false);
    m.find('fleet-read').props.onClick();
    await flush();
    assert.equal(m.render().props.snapshot.devices.length, 1);
    denied = true;
    m.find(
      code === 'SESSION_REVOKED' ? 'preferences-read' : 'runtime-version-read',
    ).props.onClick();
    await flush();
    assert.equal(m.render().props.snapshot.devices.length, 0, code);
    assert.equal(m.render().props.selection.selectedDeviceIds.length, 0);
    assert.equal(m.find('discovery-start').props.disabled, true);
    assert.equal(m.find('discovery-stop').props.disabled, false);
    m.dispose();
  }
});

const metadataEmpty = () => ({
  revision: 0,
  state: 'EMPTY',
  deviceId: null,
  registryRevision: null,
  operationId: null,
  field: null,
  lastOutcome: 'NONE',
  code: null,
  observations: Object.fromEntries(metadataContract.METADATA_FIELDS.map((field) => [field, null])),
  source: 'ADB_DISCOVERY',
  evidence: 'NATIVE_METADATA_QUERY',
});
const metadataAnswer = (snapshot, outcome = 'OBSERVED') =>
  metadataContract.metadataSuccess('p1', outcome, snapshot, null, 'DEGRADED');
const metadataOp = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const metadataPendingState = (deviceId = fleetId) => ({
  ...metadataEmpty(),
  revision: 1,
  state: 'PENDING',
  deviceId,
  registryRevision: 1,
  operationId: metadataOp,
  field: 'MODEL',
  lastOutcome: 'PENDING',
});
const metadataReadyState = (deviceId = fleetId) => ({
  ...metadataPendingState(deviceId),
  revision: 2,
  state: 'READY',
  lastOutcome: 'OBSERVED',
  code: 'OK',
  observations: {
    ...metadataEmpty().observations,
    MODEL: {
      field: 'MODEL',
      observedUtc: 1000,
      source: 'ADB_TEXT',
      stale: false,
      available: true,
      value: 'Synthetic Model A',
      units: 'TEXT',
    },
  },
});
function metadataMount(api, verification = 'VERIFIED', setupApi = null) {
  const f = fleetState();
  f.devices[0] = { ...f.devices[0], state: 'DEVICE', verification };
  f.devices.push({
    ...f.devices[0],
    deviceId: '00000002-1234-4234-8234-123456789abc',
    label: 'Device 0002',
  });
  return mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    {
      read: async () => fleetContract.fleetSuccess('f1', 'OBSERVED', f, 'AVAILABLE'),
      replaceSelection: async () => {
        throw Error('NO_SELECTION');
      },
    },
    setupApi,
    {
      get: async () =>
        discoveryAnswer(
          discoverySnapshot({
            revision: 2,
            state: 'READY',
            operationId: metadataOp,
            operation: 'REFRESH',
            lastOutcome: 'COMMITTED',
            code: null,
            observedAtUtc: 1000,
            registryRevision: 1,
          }),
        ),
      refresh: async () =>
        discoveryContract.discoveryError('p1', 'SESSION_REVOKED', null, 'DEGRADED'),
      stop: async () => discoveryContract.discoveryError('p1', 'SESSION_REVOKED', null, 'DEGRADED'),
    },
    api,
  );
}
async function metadataSelect(m, id = fleetId) {
  m.find(`metadata-candidate-${id}`).props.onClick();
  m.find('metadata-get').props.onClick();
  await flush();
}
test('metadata hydrates cache once; candidate selection is context only and PROVISIONAL remains unavailable', async () => {
  let gets = 0,
    reads = 0;
  const m = metadataMount(
    {
      get: async () => {
        gets++;
        return metadataAnswer(metadataEmpty());
      },
      read: async () => {
        reads++;
        throw Error();
      },
    },
    'PROVISIONAL',
  );
  m.effects();
  await flush();
  m.effects();
  await flush();
  assert.equal(gets, 1);
  assert.equal(reads, 0);
  m.find(`metadata-candidate-${fleetId}`).props.onClick();
  await flush();
  assert.equal(gets, 1);
  assert.equal(reads, 0);
  m.find('discovery-read').props.onClick();
  await flush();
  m.find('metadata-get').props.onClick();
  await flush();
  assert.equal(m.find('metadata-read').props.disabled, true);
  m.find('metadata-read').props.onClick();
  await flush();
  assert.equal(reads, 0);
  m.dispose();
});
test('metadata explicit one-field Read is PENDING until explicit cache reconciliation; never polls or retries', async () => {
  const calls = [];
  let completed = false;
  const m = metadataMount({
    get: async () => {
      calls.push('get');
      return metadataAnswer(completed ? metadataReadyState() : metadataEmpty());
    },
    read: async (...args) => {
      calls.push(args);
      completed = true;
      return metadataAnswer(metadataPendingState(), 'PENDING');
    },
  });
  m.effects();
  await flush();
  m.find('discovery-read').props.onClick();
  await flush();
  await metadataSelect(m);
  assert.equal(m.find('metadata-read').props.disabled, false);
  m.find('metadata-read').props.onClick();
  m.find('metadata-read').props.onClick();
  await flush();
  assert.match(m.find('metadata-status').props.children, /PENDING/);
  assert.equal(m.find('metadata-read').props.disabled, true);
  m.effects();
  await flush();
  assert.equal(calls.filter(Array.isArray).length, 1);
  assert.deepEqual(calls.find(Array.isArray), [fleetId, 'MODEL', 0, 1]);
  m.find('metadata-get').props.onClick();
  await flush();
  assert.match(JSON.stringify(m.find('metadata-observations')), /Synthetic Model A/);
  assert.equal(m.find('metadata-read').props.disabled, false);
  m.dispose();
});
test('metadata response for A cannot display under B; Stop suppresses an old cache read', async () => {
  let release,
    held = false;
  const m = metadataMount({
    get: async () =>
      held
        ? new Promise((r) => {
            release = r;
          })
        : metadataAnswer(metadataEmpty()),
    read: async () => metadataAnswer(metadataPendingState(), 'PENDING'),
  });
  m.effects();
  await flush();
  m.find('discovery-read').props.onClick();
  await flush();
  await metadataSelect(m);
  held = true;
  m.find('metadata-get').props.onClick();
  await flush();
  m.find('metadata-candidate-00000002-1234-4234-8234-123456789abc').props.onClick();
  release(metadataAnswer(metadataReadyState()));
  await flush();
  assert.doesNotMatch(JSON.stringify(m.find('metadata-observations')), /Synthetic Model A/);
  assert.equal(m.find('metadata-read').props.disabled, true);
  m.find('metadata-get').props.onClick();
  await flush();
  m.find('discovery-stop').props.onClick();
  await flush();
  release(metadataAnswer(metadataReadyState()));
  await flush();
  assert.doesNotMatch(JSON.stringify(m.find('metadata-observations')), /Synthetic Model A/);
  assert.equal(m.find('metadata-read').props.disabled, true);
  m.dispose();
});
test('metadata timeout requires explicit status and never auto retries effect', async () => {
  let reads = 0;
  const m = metadataMount({
    get: async () => metadataAnswer(metadataEmpty()),
    read: async () => {
      reads++;
      return metadataContract.metadataError('p1', 'TIMEOUT', null, 'DEGRADED', 'OUTCOME_UNKNOWN');
    },
  });
  m.effects();
  await flush();
  m.find('discovery-read').props.onClick();
  await flush();
  await metadataSelect(m);
  m.find('metadata-read').props.onClick();
  await flush();
  m.effects();
  await flush();
  assert.equal(reads, 1);
  assert.match(m.find('metadata-status').props.children, /OUTCOME_UNKNOWN.*TIMEOUT/);
  assert.equal(m.find('metadata-read').props.disabled, true);
  m.dispose();
});
test('metadata held cache reply cannot restore values after explicit discovery Refresh or setup', async () => {
  for (const action of ['discovery-refresh', 'platform-tools-setup']) {
    let held = false,
      release;
    const setupApi = {
      read: async () =>
        setupContract.setupSuccess(
          'p1',
          'OBSERVED',
          {
            revision: 0,
            installationRevision: 0,
            state: 'UNAVAILABLE',
            operationId: null,
            code: null,
            installTargetVersion: '37.0.1',
            activeVersion: null,
            rollbackAvailable: false,
          },
          null,
          'DEGRADED',
        ),
      requestSetup: async () =>
        setupContract.setupError('p2', 'SESSION_UNAVAILABLE', null, 'DEGRADED'),
    };
    const m = metadataMount(
      {
        get: async () =>
          held
            ? new Promise((r) => {
                release = r;
              })
            : metadataAnswer(metadataEmpty()),
        read: async () => {
          throw Error('NO_QUERY');
        },
      },
      'VERIFIED',
      setupApi,
    );
    m.effects();
    await flush();
    m.find('discovery-read').props.onClick();
    await flush();
    m.find('fleet-read').props.onClick();
    await flush();
    await metadataSelect(m);
    held = true;
    m.find('metadata-get').props.onClick();
    await flush();
    assert.equal(m.find(action).props.disabled, false);
    m.find(action).props.onClick();
    await flush();
    release(metadataAnswer(metadataReadyState()));
    await flush();
    assert.doesNotMatch(JSON.stringify(m.find('metadata-observations')), /Synthetic Model A/);
    assert.equal(m.find('metadata-read').props.disabled, true);
    m.dispose();
  }
});
test('Fleet unavailable result invalidates cached metadata generation before a held reply can publish', async () => {
  let failed = false,
    held = false,
    release;
  const f = fleetState();
  f.devices[0] = { ...f.devices[0], state: 'DEVICE' };
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    {
      read: async () =>
        failed
          ? fleetContract.fleetError('FLEET_UNAVAILABLE', null, 'DEGRADED')
          : fleetContract.fleetSuccess('f1', 'OBSERVED', f, 'AVAILABLE'),
      replaceSelection: async () => {
        throw Error();
      },
    },
    null,
    null,
    {
      get: async () =>
        held
          ? new Promise((r) => {
              release = r;
            })
          : metadataAnswer(metadataEmpty()),
      read: async () => {
        throw Error('NO_QUERY');
      },
    },
  );
  m.effects();
  await flush();
  await metadataSelect(m);
  held = true;
  m.find('metadata-get').props.onClick();
  await flush();
  failed = true;
  m.find('fleet-read').props.onClick();
  await flush();
  release(metadataAnswer(metadataReadyState()));
  await flush();
  assert.doesNotMatch(JSON.stringify(m.find('metadata-observations')), /Synthetic Model A/);
  assert.equal(m.find('metadata-read').props.disabled, true);
  m.dispose();
});
test('explicit Refresh and current Fleet plus STALE cache CAS allow a new explicit Read without freshening history', async () => {
  let refreshed = false,
    reads = 0;
  const stale = {
    ...metadataReadyState(),
    state: 'STALE',
    observations: {
      ...metadataReadyState().observations,
      MODEL: { ...metadataReadyState().observations.MODEL, stale: true },
    },
  };
  const currentFleet = () => {
    const f = fleetState();
    f.registryRevision = refreshed ? 2 : 1;
    f.devices[0] = { ...f.devices[0], state: 'DEVICE' };
    return f;
  };
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    {
      read: async () => fleetContract.fleetSuccess('f1', 'OBSERVED', currentFleet(), 'AVAILABLE'),
      replaceSelection: async () => {
        throw Error('NO_SELECTION');
      },
    },
    null,
    {
      get: async () =>
        discoveryAnswer(
          discoverySnapshot({
            revision: refreshed ? 4 : 2,
            state: 'READY',
            operationId: metadataOp,
            operation: 'REFRESH',
            lastOutcome: 'COMMITTED',
            code: null,
            observedAtUtc: 1000,
            registryRevision: refreshed ? 2 : 1,
          }),
        ),
      refresh: async () => {
        refreshed = true;
        return discoveryAnswer(
          discoverySnapshot({
            revision: 3,
            state: 'REFRESHING',
            operationId: metadataOp,
            operation: 'REFRESH',
            lastOutcome: 'PENDING',
            registryRevision: 1,
          }),
          'PENDING',
        );
      },
    },
    {
      get: async () => metadataAnswer(refreshed ? stale : metadataReadyState()),
      read: async (...args) => {
        reads++;
        assert.deepEqual(args, [fleetId, 'MODEL', 2, 2]);
        return metadataAnswer(
          { ...metadataPendingState(), revision: 3, registryRevision: 2 },
          'PENDING',
        );
      },
    },
  );
  m.effects();
  await flush();
  m.find('discovery-read').props.onClick();
  await flush();
  await metadataSelect(m);
  m.find('discovery-refresh').props.onClick();
  await flush();
  assert.equal(reads, 0);
  m.find('discovery-read').props.onClick();
  await flush();
  m.find('fleet-read').props.onClick();
  await flush();
  m.find('metadata-get').props.onClick();
  await flush();
  assert.equal(m.find('metadata-read').props.disabled, false);
  assert.match(JSON.stringify(m.find('metadata-observations')), /STALE.*Synthetic Model A/);
  m.effects();
  await flush();
  assert.equal(reads, 0);
  m.find('metadata-read').props.onClick();
  await flush();
  assert.equal(reads, 1);
  assert.match(m.find('metadata-status').props.children, /PENDING/);
  m.dispose();
});
test('fresh metadata status never rearms CLOSED or uncertain history even when represented as STALE', async () => {
  for (const state of ['OUTCOME_UNKNOWN', 'STALE', 'CLOSED']) {
    const uncertain = {
      ...metadataReadyState(),
      state,
      lastOutcome: 'OUTCOME_UNKNOWN',
      code: 'OUTCOME_UNKNOWN',
      observations: {
        ...metadataReadyState().observations,
        MODEL: { ...metadataReadyState().observations.MODEL, stale: true },
      },
    };
    let reads = 0;
    const m = metadataMount({
      get: async () => metadataAnswer(uncertain),
      read: async () => {
        reads++;
        throw Error('NO_EFFECT');
      },
    });
    m.effects();
    await flush();
    m.find('discovery-read').props.onClick();
    await flush();
    await metadataSelect(m);
    assert.equal(m.find('metadata-read').props.disabled, true, state);
    m.find('metadata-read').props.onClick();
    await flush();
    assert.equal(reads, 0);
    m.dispose();
  }
});

const associationIds = {
  candidate: '11111111-1111-4111-8111-111111111101',
  other: '11111111-1111-4111-8111-111111111102',
  device: '11111111-1111-4111-8111-111111111103',
  history: '11111111-1111-4111-8111-111111111104',
  operation: '11111111-1111-4111-8111-111111111105',
  ceremony: '11111111-1111-4111-8111-111111111106',
};
const associationSnapshot = (extra = {}) => ({
  revision: 0,
  state: 'IDLE',
  operationId: null,
  code: 'OK',
  ceremonyId: null,
  mode: null,
  deviceId: null,
  stage: null,
  deadlineUtc: null,
  receipt: null,
  projectionCurrent: false,
  candidates: [],
  historical: [],
  ...extra,
});
const associationAnswer = (snapshot, outcome = 'OBSERVED') => {
  const result = associationContract.associationSuccess('p1', outcome, snapshot, null, 'DEGRADED');
  assert.ok(result);
  return result;
};
const associationPhase = (stage = 'CONFIRMATION') => ({
  version: 1,
  outcome: 'COMMITTED',
  code: 'OK',
  stage,
  ceremonyId: associationIds.ceremony,
  revision: 8,
  projectionCurrent: true,
  auditHealth: 'AVAILABLE',
});
const associationContext = (extra = {}) =>
  associationSnapshot({
    revision: 2,
    state: 'AWAIT_REMOVAL',
    operationId: associationIds.operation,
    mode: 'CURRENT',
    deviceId: associationIds.device,
    stage: 'BASELINE',
    ceremonyId: associationIds.ceremony,
    deadlineUtc: 2000000000000,
    receipt: associationPhase('BASELINE'),
    projectionCurrent: true,
    ...extra,
  });
test('association UI performs no automatic enumeration or phase, and Begin/Cancel carry only exact captured IDs', async () => {
  const calls = [];
  let current = associationSnapshot();
  const api = {
    get: async () => {
      calls.push(['get']);
      return associationAnswer(current);
    },
    candidates: async () => {
      calls.push(['candidates']);
      return associationAnswer({
        ...current,
        candidates: [
          {
            candidateId: associationIds.candidate,
            mode: 'CURRENT',
            deviceId: associationIds.device,
          },
        ],
      });
    },
    begin: async (...args) => {
      calls.push(['begin', ...args]);
      current = associationSnapshot({
        revision: 1,
        state: 'BASELINE_PENDING',
        operationId: associationIds.operation,
        mode: 'CURRENT',
        deviceId: associationIds.device,
        stage: 'BASELINE',
      });
      return associationAnswer(current, 'PENDING');
    },
    cancel: async (...args) => {
      calls.push(['cancel', ...args]);
      current = { ...current, revision: 2, state: 'CANCELLED', code: 'CANCELLED' };
      return associationAnswer(current, 'SETTLED');
    },
  };
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    null,
    null,
    null,
    null,
    api,
  );
  m.effects();
  await flush();
  assert.deepEqual(calls, []);
  m.find('association-candidates').props.onClick();
  await flush();
  m.find(`association-candidate-${associationIds.candidate}`).props.onClick();
  assert.equal(m.find('association-begin').props.disabled, true);
  m.find('association-get').props.onClick();
  await flush();
  assert.equal(m.find('association-begin').props.disabled, false);
  m.find('association-begin').props.onClick();
  m.find('association-begin').props.onClick();
  await flush();
  assert.deepEqual(
    calls.filter((c) => c[0] === 'begin'),
    [['begin', 0, associationIds.candidate, 'CURRENT', undefined]],
  );
  assert.equal(m.find('association-removal').props.disabled, true);
  assert.equal(m.find('association-cancel').props.disabled, false);
  m.find('association-cancel').props.onClick();
  await flush();
  assert.deepEqual(calls.at(-1), ['cancel', 1, associationIds.operation]);
  assert.match(m.find('association-status').props.children, /CANCELLED/);
  m.dispose();
});
test('historical association requires an explicit separate destination and rejects late candidate context replies', async () => {
  const calls = [];
  let resolveGet;
  const api = {
    candidates: async () =>
      associationAnswer(
        associationSnapshot({
          candidates: [
            { candidateId: associationIds.candidate, mode: 'HISTORICAL', deviceId: null },
            { candidateId: associationIds.other, mode: 'CURRENT', deviceId: associationIds.device },
          ],
          historical: [{ deviceId: associationIds.history, generation: 4 }],
        }),
      ),
    get: () =>
      new Promise((r) => {
        resolveGet = r;
      }),
    begin: async (...args) => {
      calls.push(args);
      return associationContract.associationError('p1', 'BUSY', null, 'DEGRADED');
    },
  };
  const m = mount({}, 1600, null, null, null, null, api);
  m.find('association-candidates').props.onClick();
  await flush();
  m.find(`association-candidate-${associationIds.candidate}`).props.onClick();
  assert.equal(m.find('association-begin').props.disabled, true);
  m.find('association-get').props.onClick();
  resolveGet(associationAnswer(associationSnapshot()));
  await flush();
  assert.equal(m.find('association-begin').props.disabled, true);
  m.find(`association-history-${associationIds.history}`).props.onClick();
  m.find('association-get').props.onClick();
  m.find(`association-candidate-${associationIds.other}`).props.onClick();
  resolveGet(associationAnswer(associationSnapshot()));
  await flush();
  assert.equal(
    m.find('association-begin').props.disabled,
    true,
    'late old-selection GET cannot rearm new choice',
  );
  m.find(`association-candidate-${associationIds.candidate}`).props.onClick();
  m.find(`association-history-${associationIds.history}`).props.onClick();
  m.find('association-get').props.onClick();
  resolveGet(associationAnswer(associationSnapshot()));
  await flush();
  m.find('association-begin').props.onClick();
  await flush();
  assert.deepEqual(calls, [[0, associationIds.candidate, 'HISTORICAL', associationIds.history]]);
  assert.equal(m.find('association-begin').props.disabled, true);
  m.dispose();
});
test('association timeout preserves known COMMITTED history and Stop suppresses a late confirmation reply', async () => {
  let current = associationContext({
      state: 'COMMITTED',
      stage: 'CONFIRMATION',
      receipt: associationPhase(),
    }),
    rejectGet = false,
    resolveConfirm;
  const api = {
    get: async () =>
      rejectGet
        ? associationContract.associationError('p1', 'TIMEOUT', null, 'DEGRADED')
        : associationAnswer(current),
    confirm: () =>
      new Promise((r) => {
        resolveConfirm = r;
      }),
  };
  const m = mount(
    {},
    1600,
    null,
    null,
    {
      stop: async () =>
        discoveryAnswer(
          discoverySnapshot({ state: 'STOPPED', lastOutcome: 'CLEANUP_RETIRED' }),
          'OBSERVED',
        ),
    },
    null,
    api,
  );
  m.find('association-get').props.onClick();
  await flush();
  assert.match(JSON.stringify(m.find('association-receipt').props.children), /COMMITTED/);
  rejectGet = true;
  m.find('association-get').props.onClick();
  await flush();
  assert.match(JSON.stringify(m.find('association-receipt').props.children), /COMMITTED/);
  assert.match(m.find('association-status').props.children, /TIMEOUT/);
  rejectGet = false;
  current = associationContext({
    state: 'AWAIT_CONFIRMATION',
    stage: 'RETURN',
    receipt: associationPhase('RETURN'),
  });
  m.find('association-get').props.onClick();
  await flush();
  m.find('association-confirm').props.onClick();
  m.find('discovery-stop').props.onClick();
  await flush();
  resolveConfirm(
    associationAnswer(
      associationContext({
        revision: 4,
        state: 'COMMITTED',
        stage: 'CONFIRMATION',
        receipt: associationPhase(),
      }),
      'SETTLED',
    ),
  );
  await flush();
  assert.equal(m.find('association-confirm').props.disabled, true);
  assert.doesNotMatch(m.find('association-status').props.children, /SETTLED \/ COMMITTED/);
  m.dispose();
});

const inputEmpty = () => ({
  revision: 0,
  state: 'EMPTY',
  operationId: null,
  deviceId: null,
  generation: null,
  selectionRevision: null,
  registryRevision: null,
  action: null,
  deadlineUtc: null,
  receipt: null,
  code: null,
  current: false,
});
const inputAnswer = (snapshot, outcome = 'STATUS') => {
  const wire = inputContract.inputInteractionSuccess('p1', outcome, snapshot, 'DEGRADED');
  assert.ok(wire);
  return wire;
};
function inputMount(api, verification = 'VERIFIED') {
  const f = fleetState(3, [fleetId]);
  f.devices[0] = { ...f.devices[0], state: 'DEVICE', verification };
  const b = '00000002-1234-4234-8234-123456789abc';
  f.devices.push({ ...f.devices[0], deviceId: b, label: 'Device 0002' });
  f.selection.activeDeviceId = b;
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    {
      read: async () => fleetContract.fleetSuccess('f1', 'OBSERVED', f, 'AVAILABLE'),
      replaceSelection: async (rev, selection) => {
        f.selection = { ...selection, revision: rev + 1 };
        return fleetContract.fleetSuccess('f2', 'APPLIED', f, 'AVAILABLE');
      },
    },
    null,
    {
      stop: async () => discoveryContract.discoveryError('p1', 'SESSION_REVOKED', null, 'DEGRADED'),
    },
    null,
    null,
    api,
  );
  return { m, f, b };
}
test('input UI never auto sends or reads; nine keys target actual ACTIVE rather than selected set', async () => {
  const calls = [];
  const { m, b } = inputMount({
    get: async () => {
      calls.push('get');
      return inputAnswer(inputEmpty());
    },
    press: async (...args) => {
      calls.push(args);
      return inputAnswer(
        {
          ...inputEmpty(),
          revision: 1,
          state: 'PENDING',
          operationId: metadataOp,
          deviceId: args[3],
          generation: 1,
          selectionRevision: args[1],
          registryRevision: args[2],
          action: args[4],
          deadlineUtc: 1000,
        },
        'PENDING',
      );
    },
  });
  m.effects();
  await flush();
  assert.deepEqual(calls, []);
  assert.equal(m.find('input-home').props.disabled, true);
  m.find('fleet-read').props.onClick();
  await flush();
  m.find('input-get').props.onClick();
  await flush();
  for (const action of inputContract.INPUT_ACTIONS)
    assert.ok(m.find(`input-${action.toLowerCase()}`));
  assert.match(JSON.stringify(m.find('input-active')), /Device 0002/);
  assert.equal(m.find('input-home').props.disabled, false);
  const press = m.find('input-home').props.onClick;
  press();
  press();
  await flush();
  assert.deepEqual(calls, ['get', [0, 3, 1, b, 'HOME']]);
  assert.equal(m.find('input-back').props.disabled, true);
  m.effects();
  await flush();
  assert.equal(calls.length, 2);
  m.dispose();
});
test('input refuses PROVISIONAL and preserves original result target across selection changes and timeout', async () => {
  const denied = inputMount(
    {
      get: async () => inputAnswer(inputEmpty()),
      press: async () => {
        throw Error('NO_EFFECT');
      },
    },
    'PROVISIONAL',
  );
  denied.m.effects();
  await flush();
  denied.m.find('fleet-read').props.onClick();
  await flush();
  denied.m.find('input-get').props.onClick();
  await flush();
  assert.equal(denied.m.find('input-home').props.disabled, true);
  denied.m.dispose();
  const { m, b } = inputMount({
    get: async () =>
      inputAnswer({
        ...inputEmpty(),
        revision: 2,
        state: 'SETTLED',
        operationId: metadataOp,
        deviceId: b,
        generation: 1,
        selectionRevision: 3,
        registryRevision: 1,
        action: 'HOME',
        deadlineUtc: 1000,
        code: 'OK',
        current: true,
        receipt: {
          version: 1,
          evidence: 'NATIVE_INPUT_QUERY',
          actor: {
            outcome: 'DISPATCHED_UNCONFIRMED',
            code: 'OK',
            commandId: metadataOp,
            correlationId: '00000000-0000-4000-8000-000000000099',
            diagnosticId: null,
          },
          loggingHealth: 'DEGRADED',
        },
      }),
    press: async () => inputContract.inputInteractionError('p2', 'TIMEOUT', 'DEGRADED'),
  });
  m.effects();
  await flush();
  m.find('fleet-read').props.onClick();
  await flush();
  m.find('input-get').props.onClick();
  await flush();
  m.find('input-home').props.onClick();
  await flush();
  assert.match(JSON.stringify(m.find('input-history')), /DISPATCHED_UNCONFIRMED/);
  assert.match(m.find('input-status').props.children, /TIMEOUT/);
  assert.equal(m.find('input-home').props.disabled, true);
  m.render().props.onSelection({
    selectedDeviceIds: [fleetId],
    activeDeviceId: fleetId,
    groups: [],
  });
  await flush();
  assert.match(JSON.stringify(m.find('input-history')), new RegExp(b));
  assert.match(JSON.stringify(m.find('input-active')), new RegExp(fleetId));
  assert.equal(m.find('input-home').props.disabled, true);
  m.dispose();
});
test('late input STATUS cannot rearm after ACTIVE selection or Stop invalidation', async () => {
  for (const action of ['selection', 'stop']) {
    let finish;
    const { m } = inputMount({
      get: () => new Promise((r) => (finish = r)),
      press: async () => {
        throw Error('NO_EFFECT');
      },
    });
    m.effects();
    await flush();
    m.find('fleet-read').props.onClick();
    await flush();
    m.find('input-get').props.onClick();
    await flush();
    if (action === 'selection')
      m.render().props.onSelection({ selectedDeviceIds: [], activeDeviceId: fleetId, groups: [] });
    else m.find('discovery-stop').props.onClick();
    await flush();
    finish(inputAnswer(inputEmpty()));
    await flush();
    assert.equal(m.find('input-home').props.disabled, true);
    m.dispose();
  }
});
