import * as runtimeVersionContract from '../src/runtime-version-contract.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as contract from '../src/settings-contract.ts';
import * as fleetContract from '../src/fleet-contract.ts';
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
      if (name === './settings-contract.js') return contract;
      if (name === './fleet-contract.js') return fleetContract;
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
  assert.equal(shell.selection.selectedDeviceIds.length, 0);
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
