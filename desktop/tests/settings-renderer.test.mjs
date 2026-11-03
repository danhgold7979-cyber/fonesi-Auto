import { generateVideoDecoderFixture } from '../verification/video-decoder-fixture.mjs';
import * as presentationContract from '../src/video-presentation-contract.ts';
import * as videoContract from '../src/video-stream-contract.ts';
import * as videoClient from '../src/video-stream-client.ts';
import * as videoDecoder from '../src/video-decoder.ts';
import * as hostContract from '../src/host-resource-contract.ts';
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
function SyntheticApiPresence() {}
function mount(
  api,
  width = 1600,
  fleetApi = null,
  setupApi = null,
  discoveryApi = null,
  metadataApi = null,
  associationApi = null,
  inputApi = null,
  hostApi = null,
  videoApi = null,
  videoBindings = null,
) {
  let component,
    cursor = 0;
  const slots = [];
  const effects = [],
    cleanups = [],
    events = new Map();
  const documentEvents = new Map();
  const hostDocument = {
    hidden: false,
    getElementById: () => ({}),
    addEventListener: (name, fn) => documentEvents.set(name, fn),
    removeEventListener: (name, fn) => {
      if (documentEvents.get(name) === fn) documentEvents.delete(name);
    },
  };
  const hostWindow = {
    innerWidth: width,
    videoStream: videoApi,
    isSecureContext: true,
    preferences: api,
    discovery: discoveryApi,
    association: associationApi,
    input: inputApi,
    hostResources: hostApi,
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
  let hostClock = 0;
  const hostTimers = new Map();
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
      if (name === './video-stream-contract.ts')
        return {
          ...videoContract,
          snapshotVideoRefusal: (raw) =>
            videoContract.snapshotVideoRefusal(JSON.parse(JSON.stringify(raw))),
          snapshotVideoPortMetadata: (raw) =>
            videoContract.snapshotVideoPortMetadata(JSON.parse(JSON.stringify(raw))),
        }; // VM realm marshaling only
      if (name === './video-presentation-contract.ts') return presentationContract;
      if (name === './video-stream-client.ts') return videoClient;
      if (name === './video-decoder.ts')
        return videoBindings
          ? {
              ...videoDecoder,
              createTileVideoDecoder: (options) =>
                videoDecoder.createTileVideoDecoder(options, videoBindings),
            }
          : videoDecoder;
      if (name === './host-resource-contract.ts') return hostContract;
      if (name === './input-interaction-contract.js') return inputContract;
      if (name === './association-contract.js') return associationContract;
      if (name === './metadata-contract.js') return metadataContract;
      if (name === './discovery-contract.js') return discoveryContract;
      if (name === './settings-contract.js') return contract;
      if (name === './fleet-contract.js') return fleetContract;
      if (name === './platform-tools-setup-contract.js') return setupContract;
      if (name === './runtime-version-contract.js') return runtimeVersionContract;
      if (name === './ui/ui-shell.tsx') return { UiShell: 'UiShell' };
      throw Error('UNKNOWN_MODULE');
    },
    VideoDecoder: SyntheticApiPresence,
    EncodedVideoChunk: SyntheticApiPresence,
    crypto: {
      randomUUID: (() => {
        let n = 0;
        return () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, '0')}`;
      })(),
    },
    performance: {
      now: () => {
        if (hostClock instanceof Error) throw hostClock;
        return hostClock;
      },
    },
    setTimeout: (fn, ms) => {
      const id = {};
      hostTimers.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => hostTimers.delete(id),
    window: hostWindow,
    document: hostDocument,
  });
  const render = () => {
    cursor = 0;
    return component();
  };
  const find = (id, node = render()) => {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.id === id) return node;
    for (const child of [
      node.props?.children,
      node.props?.settings,
      node.props?.hostResources,
      node.props?.previewAccounting,
    ].flat(Infinity)) {
      const found = find(id, child ?? null);
      if (found) return found;
    }
    return null;
  };
  return {
    render,
    hostWindow,
    hostDocument,
    documentEvents,
    find,
    hostTimers,
    hostTime: (value) => {
      hostClock = value;
    },
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

test('host CPU RAM explicit read renders immutable scope then expires without polling or fake unsupported data', async () => {
  let calls = 0;
  const sample = {
    version: 2,
    sequence: 1,
    startedUtc: 1000,
    endedUtc: 2000,
    intervalMs: 1000,
    metrics: Object.fromEntries(
      hostContract.HOST_METRICS.map((key) => [
        key,
        {
          ...hostContract.HOST_METRIC_INFO[key],
          value: key.endsWith('Cpu') ? 20 : 100,
          code: 'OK',
        },
      ]),
    ),
  };
  const m = mount({}, 1600, null, null, null, null, null, null, {
    sample: async () => {
      calls++;
      return hostContract.hostResourceResponse('h1', 'OK', sample, 4000);
    },
    cancel: async () => hostContract.hostResourceResponse(null, 'CANCELLED'),
  });
  m.effects();
  assert.equal(calls, 0);
  m.render().props.onHostResourcesRead();
  await flush();
  assert.equal(calls, 1);
  assert.ok(JSON.stringify(m.render().props.hostResources).includes('MAIN_PROCESS'));
  assert.ok(JSON.stringify(m.render().props.hostResources).includes('FRESH'));
  assert.equal(m.hostTimers.size, 1);
  m.hostTime(5000);
  assert.ok(JSON.stringify(m.render().props.hostResources).includes('STALE'));
  for (const { fn } of m.hostTimers.values()) fn();
  assert.equal(calls, 1);
});

test('host panel close cancels only owned pending read and suppresses late completion without resetting history', async () => {
  let settle,
    cancelled = 0;
  const m = mount({}, 1600, null, null, null, null, null, null, {
    sample: () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
    cancel: async () => {
      cancelled++;
      return hostContract.hostResourceResponse(null, 'CANCELLED');
    },
  });
  m.effects();
  m.render().props.onHostResourcesRead();
  m.render().props.onHostResourcesClose();
  assert.equal(cancelled, 1);
  settle(hostContract.hostResourceResponse('h1', 'UNAVAILABLE'));
  await flush();
  assert.ok(JSON.stringify(m.render().props.hostResources).includes('STALE'));
  assert.equal(m.hostTimers.size, 0);
  m.dispose();
});
test('actual renderer registers explicit video request before early port and READY only after matching canvas and handlers', async () => {
  const calls = [],
    posts = [];
  let settle;
  const f = fleetState(0, [fleetId]);
  f.devices[0].state = 'DEVICE';
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    { read: async () => fleetContract.fleetSuccess('f1', 'OBSERVED', f, 'AVAILABLE') },
    null,
    null,
    null,
    null,
    null,
    null,
    {
      invoke: (raw) => {
        const r = JSON.parse(raw);
        calls.push(r);
        return r.kind === 'START'
          ? new Promise((resolve) => (settle = resolve))
          : Promise.resolve(videoContract.videoStreamResponse(r.requestId, 'STOPPED', r.videoId));
      },
    },
  );
  m.effects();
  await flush();
  m.effects();
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(m.render().props.video.canStart(fleetId, 1), true);
  m.render().props.video.onStart(fleetId, 1);
  assert.equal(calls.length, 1);
  const videoId = '00000000-0000-4000-8000-000000000099';
  const port = {
    onmessage: null,
    onmessageerror: null,
    closed: 0,
    start() {
      assert.equal(typeof this.onmessage, 'function');
    },
    postMessage: (v) => posts.push(v),
    close() {
      this.closed++;
    },
  };
  const metadata = {
    version: 1,
    videoId,
    requestId: calls[0].requestId,
    deviceId: fleetId,
    generation: 1,
    deadlineUtc: Date.now() + 20000,
  };
  m.events.get('message')({
    source: m.hostWindow,
    origin: videoContract.VIDEO_WINDOW_ORIGIN,
    data: { type: 'AUTO_VIDEO_PORT_V1', ...metadata },
    ports: [port],
  });
  assert.equal(posts.length, 0);
  const dataset = { videoGeometry: 'stale' };
  m.render().props.video.canvasRef({
    dataset,
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({ clearRect() {}, drawImage() {} }),
  });
  assert.equal(Object.hasOwn(dataset, 'videoGeometry'), false);
  assert.deepEqual(
    posts.map((v) => v.kind),
    ['READY'],
  );
  settle(videoContract.videoStreamResponse(calls[0].requestId, 'PENDING', videoId));
  await flush();
  m.render().props.video.onStop();
  await flush();
  assert.equal(calls[1].kind, 'STOP');
  assert.equal(m.render().props.video.view.state, 'STOPPED');
  assert.ok(port.closed > 0);
  m.dispose();
});
test('renderer rejects foreign port and Stop before PENDING never sends READY or starts a replacement', async () => {
  const calls = [];
  let settle;
  const f = fleetState(0, [fleetId]);
  f.devices[0].state = 'DEVICE';
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    { read: async () => fleetContract.fleetSuccess('f1', 'OBSERVED', f, 'AVAILABLE') },
    null,
    null,
    null,
    null,
    null,
    null,
    {
      invoke: (raw) => {
        const r = JSON.parse(raw);
        calls.push(r);
        return r.kind === 'START'
          ? new Promise((resolve) => (settle = resolve))
          : Promise.resolve(videoContract.videoStreamResponse(r.requestId, 'STOPPED', r.videoId));
      },
    },
  );
  m.effects();
  await flush();
  m.effects();
  m.render().props.video.onStart(fleetId, 1);
  m.render().props.video.onStop();
  const videoId = '00000000-0000-4000-8000-000000000098';
  let closes = 0;
  const port = {
    close() {
      closes++;
    },
    postMessage() {
      assert.fail('no READY');
    },
  };
  m.events.get('message')({
    source: m.hostWindow,
    origin: videoContract.VIDEO_WINDOW_ORIGIN,
    data: {
      type: 'AUTO_VIDEO_PORT_V1',
      version: 1,
      videoId,
      requestId: calls[0].requestId,
      deviceId: fleetId,
      generation: 1,
      deadlineUtc: Date.now() + 20000,
    },
    ports: [port],
  });
  assert.equal(closes, 1);
  await flush();
  assert.equal(calls[1].kind, 'STOP');
  settle(videoContract.videoStreamResponse(calls[0].requestId, 'PENDING', videoId));
  await flush();
  assert.equal(calls.length, 2);
  m.dispose();
});

for (const stopFailure of [false, true])
  for (const reason of ['BUSY', 'QUOTA'])
    test(`renderer retains ${reason} refusal separately with cleanup failure=${stopFailure}`, async () => {
      const calls = [],
        posts = [];
      let settle;
      const f = fleetState(0, [fleetId]);
      f.devices[0].state = 'DEVICE';
      const m = mount(
        { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
        1600,
        { read: async () => fleetContract.fleetSuccess('f1', 'OBSERVED', f, 'AVAILABLE') },
        null,
        null,
        null,
        null,
        null,
        null,
        {
          invoke: (raw) => {
            const r = JSON.parse(raw);
            calls.push(r);
            return r.kind === 'START'
              ? new Promise((resolve) => (settle = resolve))
              : stopFailure
                ? Promise.reject(Error('synthetic'))
                : Promise.resolve(
                    videoContract.videoStreamResponse(r.requestId, 'STOPPED', r.videoId),
                  );
          },
        },
      );
      m.effects();
      await flush();
      m.effects();
      await flush();
      assert.equal(calls.length, 0);
      assert.equal(m.render().props.video.canStart(fleetId, 1), true);
      m.render().props.video.onStart(fleetId, 1);
      assert.equal(calls.length, 1);
      const videoId = '00000000-0000-4000-8000-000000000099';
      const port = {
        onmessage: null,
        onmessageerror: null,
        closed: 0,
        start() {
          assert.equal(typeof this.onmessage, 'function');
        },
        postMessage: (v) => posts.push(v),
        close() {
          this.closed++;
        },
      };
      const metadata = {
        version: 1,
        videoId,
        requestId: calls[0].requestId,
        deviceId: fleetId,
        generation: 1,
        deadlineUtc: Date.now() + 20000,
      };
      m.events.get('message')({
        source: m.hostWindow,
        origin: videoContract.VIDEO_WINDOW_ORIGIN,
        data: { type: 'AUTO_VIDEO_PORT_V1', ...metadata },
        ports: [port],
      });
      assert.equal(posts.length, 0);
      const dataset = { videoGeometry: 'stale' };
      m.render().props.video.canvasRef({
        dataset,
        width: 0,
        height: 0,
        style: {},
        getContext: () => ({ clearRect() {}, drawImage() {} }),
      });
      assert.equal(Object.hasOwn(dataset, 'videoGeometry'), false);
      assert.deepEqual(
        posts.map((v) => v.kind),
        ['READY'],
      );
      settle(videoContract.videoStreamResponse(calls[0].requestId, 'PENDING', videoId));
      await flush();
      port.onmessage({
        data: {
          version: 2,
          videoId: '00000000-0000-4000-8000-000000000098',
          kind: 'REFUSED',
          reason: 'QUOTA',
        },
      });
      assert.equal(calls.length, 1);
      port.onmessage({ data: { version: 2, videoId, kind: 'REFUSED', reason } });
      assert.equal(m.render().props.video.canStart(fleetId, 1), false);
      await flush();
      assert.equal(calls[1].kind, 'STOP');
      assert.equal(
        m.render().props.video.view.state,
        `REFUSED:${reason} / ${stopFailure ? 'UNCERTAIN' : 'STOPPED'}`,
      );
      assert.equal(m.render().props.video.canStart(fleetId, 1), !stopFailure && reason === 'BUSY');
      port.onmessage({ data: { version: 2, videoId, kind: 'REFUSED', reason: 'QUOTA' } });
      assert.equal(m.render().props.video.canStart(fleetId, 1), !stopFailure && reason === 'BUSY');
      assert.ok(port.closed > 0);
      m.dispose();
    });

test('actual renderer reads scoped preview counts without IPC and invalidates stale stopped or closed samples', async () => {
  let now = 0;
  const timers = new Map();
  const bindings = {
    now: () => now,
    utc: () => Date.now(),
    set: (fn, ms) => {
      const id = {};
      timers.set(id, { fn, ms });
      return id;
    },
    clear: (id) => timers.delete(id),
    supported: async () => true,
    chunk: (v) => v,
    create(output) {
      return {
        decodeQueueSize: 0,
        configure() {},
        close() {},
        decode(chunk) {
          output({
            timestamp: chunk.timestamp,
            codedWidth: 32,
            codedHeight: 16,
            visibleRect: { x: 0, y: 0, width: 32, height: 16 },
            displayWidth: 32,
            displayHeight: 16,
            rotation: 0,
            flip: false,
            close() {},
          });
        },
      };
    },
  };
  const calls = [],
    posts = [];
  let settle;
  const f = fleetState(0, [fleetId]);
  f.devices[0].state = 'DEVICE';
  const m = mount(
    { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
    1600,
    { read: async () => fleetContract.fleetSuccess('f1', 'OBSERVED', f, 'AVAILABLE') },
    null,
    null,
    null,
    null,
    null,
    null,
    {
      invoke: (raw) => {
        const r = JSON.parse(raw);
        calls.push(r);
        return r.kind === 'START'
          ? new Promise((resolve) => (settle = resolve))
          : Promise.resolve(videoContract.videoStreamResponse(r.requestId, 'STOPPED', r.videoId));
      },
    },
    bindings,
  );
  m.effects();
  await flush();
  m.effects();
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(m.render().props.video.canStart(fleetId, 1), true);
  m.render().props.video.onStart(fleetId, 1);
  assert.equal(calls.length, 1);
  const videoId = '00000000-0000-4000-8000-000000000099';
  const port = {
    onmessage: null,
    onmessageerror: null,
    closed: 0,
    start() {
      assert.equal(typeof this.onmessage, 'function');
    },
    postMessage: (v) => posts.push(v),
    close() {
      this.closed++;
    },
  };
  const metadata = {
    version: 1,
    videoId,
    requestId: calls[0].requestId,
    deviceId: fleetId,
    generation: 1,
    deadlineUtc: Date.now() + 20000,
  };
  m.events.get('message')({
    source: m.hostWindow,
    origin: videoContract.VIDEO_WINDOW_ORIGIN,
    data: { type: 'AUTO_VIDEO_PORT_V1', ...metadata },
    ports: [port],
  });
  assert.equal(posts.length, 0);
  const dataset = { videoGeometry: 'stale' };
  m.render().props.video.canvasRef({
    dataset,
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({ clearRect() {}, drawImage() {} }),
  });
  assert.equal(Object.hasOwn(dataset, 'videoGeometry'), false);
  assert.deepEqual(
    posts.map((v) => v.kind),
    ['READY'],
  );
  settle(videoContract.videoStreamResponse(calls[0].requestId, 'PENDING', videoId));
  await flush();

  const show = () => JSON.stringify(m.render().props.previewAccounting);
  m.render().props.onPreviewAccountingRead();
  assert.ok(show().includes('UNKNOWN'));
  assert.equal(calls.length, 1);
  const fixture = generateVideoDecoderFixture('LANDSCAPE');
  port.onmessage({
    data: {
      version: 2,
      videoId,
      kind: 'PRESENTATION',
      epoch: 1,
      state: 'VISIBLE',
      afterDeliveryId: 0,
      afterPacketId: 0,
      remainingMs: 20000,
    },
  });
  let epoch = 1;
  const send = (kind, deliveryId, packetId, bytes) =>
    port.onmessage({
      data: {
        version: 2,
        videoId,
        kind: 'MEDIA',
        epoch,
        delivery: {
          version: 1,
          videoId,
          deliveryId,
          geometryId: 1,
          configId: kind === 'SESSION' ? 0 : 1,
          packetId,
          kind,
          ptsUs: kind === 'KEY' ? packetId : null,
          totalBytes: bytes.length,
          width: 32,
          height: 16,
          bytes,
        },
      },
    });
  send('SESSION', 1, 0, new Uint8Array());
  send('CONFIG', 2, 1, fixture.configuration);
  await flush();
  send('KEY', 3, 2, fixture.key);
  await flush();
  assert.equal(m.render().props.video.view.state, 'DISPLAYING');
  const timerCount = timers.size;
  m.render().props.onPreviewAccountingRead();
  assert.ok(show().includes('CAPTURED'));
  assert.ok(show().includes('RENDERER_CANVAS'));
  assert.ok(show().includes('Canvas đã vẽ: '));
  const renderedText = (node) =>
    typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : Array.isArray(node)
        ? node.map(renderedText).join('')
        : node?.props
          ? renderedText(node.props.children)
          : '';
  const text = renderedText(m.render().props.previewAccounting);
  assert.match(text, /Media nhận: 1/);
  assert.match(text, /Lần gọi decode: 1/);
  assert.match(text, /Canvas đã vẽ: 1/);
  assert.match(text, /Bỏ: 0/);
  assert.match(text, /Chưa kết thúc: 0/);
  assert.match(text, /Canvas: 32×16/);

  assert.equal(m.documentEvents.size, 1);
  const visibility = m.documentEvents.get('visibilitychange');
  m.hostDocument.hidden = true;
  visibility();
  assert.equal(posts.at(-1).kind, 'VISIBILITY_HINT');
  assert.equal(posts.at(-1).version, 2);
  assert.deepEqual(Object.keys(posts.at(-1)).sort(), ['kind', 'version', 'videoId']);
  // Document hints do not manufacture a main fence or a paused state.
  assert.equal(m.render().props.video.view.state, 'DISPLAYING');
  epoch = 2;
  port.onmessage({
    data: {
      version: 2,
      videoId,
      kind: 'PRESENTATION',
      epoch,
      state: 'HIDDEN',
      afterDeliveryId: 3,
      afterPacketId: 2,
      remainingMs: 30000,
    },
  });
  assert.equal(m.render().props.video.view.state, 'PAUSED_HIDDEN:WINDOW_HIDDEN');
  for (let id = 4; id <= 12; id++) send('KEY', id, id - 1, fixture.key);
  await flush();
  m.render().props.onPreviewAccountingRead();
  let hiddenText = renderedText(m.render().props.previewAccounting);
  assert.match(hiddenText, /Media nhận: 10/);
  assert.match(hiddenText, /Lần gọi decode: 1/);
  assert.match(hiddenText, /ẩn cửa sổ 9/);
  assert.match(hiddenText, /Chưa kết thúc: 0/);
  assert.equal(posts.filter((v) => v.kind === 'CONSUMED').length, 12);
  assert.equal(calls.length, 1);
  m.hostDocument.hidden = false;
  visibility();
  epoch = 3;
  port.onmessage({
    data: {
      version: 2,
      videoId,
      kind: 'PRESENTATION',
      epoch,
      state: 'VISIBLE',
      afterDeliveryId: 12,
      afterPacketId: 11,
      remainingMs: 30000,
    },
  });
  assert.equal(m.render().props.video.view.state, 'WAITING_FRESH_KEY');
  send('KEY', 13, 12, fixture.key);
  await flush();
  assert.equal(m.render().props.video.view.state, 'DISPLAYING');
  m.render().props.onPreviewAccountingRead();
  hiddenText = renderedText(m.render().props.previewAccounting);
  assert.match(hiddenText, /Media nhận: 11/);
  assert.match(hiddenText, /Canvas đã vẽ: 2/);
  assert.match(hiddenText, /ẩn cửa sổ 9/);
  assert.deepEqual(
    posts.filter((v) => v.kind === 'PRESENTATION_ACK').map((v) => v.epoch),
    [1, 2, 3],
  );

  assert.equal(calls.length, 1);
  assert.equal(timers.size, timerCount);
  m.render().props.onHostResourcesClose();
  assert.ok(!show().includes('CAPTURED'));
  m.render().props.onPreviewAccountingRead();
  assert.ok(show().includes('CAPTURED'));
  now = 6000;
  m.hostTime(now);
  assert.ok(!show().includes('CAPTURED'));
  m.render().props.onPreviewAccountingRead();
  assert.ok(show().includes('CAPTURED'));
  now = 5999;
  m.hostTime(now);
  assert.ok(!show().includes('CAPTURED'));
  now = 6001;
  m.hostTime(now);
  m.render().props.onPreviewAccountingRead();
  assert.ok(!show().includes('CAPTURED'));
  assert.equal(m.render().props.video.view.state, 'DISPLAYING');
  m.render().props.video.onStop();
  await flush();
  assert.equal(calls[1].kind, 'STOP');
  m.render().props.onPreviewAccountingRead();
  assert.ok(!show().includes('CAPTURED'));
  assert.equal(m.render().props.video.view.state, 'STOPPED');
  assert.ok(port.closed > 0);
  assert.equal(m.documentEvents.size, 0);
  const postCount = posts.length;
  visibility();
  assert.equal(posts.length, postCount);
  m.dispose();
});

for (const terminal of [
  'pagehide',
  'unmount',
  'canvas-removed',
  'port-error',
  'explicit-stop',
  'start-rejected',
  'ready-throws',
]) {
  test(`renderer visibility observation retires on ${terminal} and stale callbacks cannot send`, async () => {
    const calls = [],
      posts = [];
    let finishStart;
    const f = fleetState(0, [fleetId]);
    f.devices[0].state = 'DEVICE';
    const m = mount(
      { read: async () => contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE') },
      1600,
      { read: async () => fleetContract.fleetSuccess('f1', 'OBSERVED', f, 'AVAILABLE') },
      null,
      null,
      null,
      null,
      null,
      null,
      {
        invoke(raw) {
          const r = JSON.parse(raw);
          calls.push(r);
          return r.kind === 'START'
            ? new Promise((resolve) => {
                finishStart = resolve;
              })
            : Promise.resolve(videoContract.videoStreamResponse(r.requestId, 'STOPPED', r.videoId));
        },
      },
    );
    m.effects();
    await flush();
    m.effects();
    await flush();
    m.render().props.video.onStart(fleetId, 1);
    const videoId = '00000000-0000-4000-8000-000000000099';
    const port = {
      onmessage: null,
      onmessageerror: null,
      start() {},
      close() {},
      postMessage(value) {
        if (terminal === 'ready-throws' && value.kind === 'READY') throw Error('fixture');
        posts.push(value);
      },
    };
    m.events.get('message')({
      source: m.hostWindow,
      origin: videoContract.VIDEO_WINDOW_ORIGIN,
      data: {
        type: 'AUTO_VIDEO_PORT_V1',
        version: 1,
        videoId,
        requestId: calls[0].requestId,
        deviceId: fleetId,
        generation: 1,
        deadlineUtc: Date.now() + 20000,
      },
      ports: [port],
    });
    m.render().props.video.canvasRef({
      dataset: {},
      width: 0,
      height: 0,
      style: {},
      getContext: () => ({ clearRect() {}, drawImage() {} }),
    });
    const visibility = m.documentEvents.get('visibilitychange');
    if (terminal !== 'ready-throws') assert.equal(typeof visibility, 'function');
    const oldMessage = port.onmessage,
      oldError = port.onmessageerror;
    if (terminal === 'pagehide') m.events.get('pagehide')();
    if (terminal === 'unmount') m.dispose();
    if (terminal === 'canvas-removed') m.render().props.video.canvasRef(null);
    if (terminal === 'port-error') oldError();
    if (terminal === 'explicit-stop') m.render().props.video.onStop();
    finishStart(
      videoContract.videoStreamResponse(
        calls[0].requestId,
        terminal === 'start-rejected' ? 'FAILED' : 'PENDING',
        videoId,
      ),
    );
    await flush();
    assert.equal(m.documentEvents.size, 0);
    const before = posts.length;
    visibility?.();
    oldError();
    oldMessage({
      data: {
        version: 2,
        videoId,
        kind: 'PRESENTATION',
        epoch: 1,
        state: 'VISIBLE',
        afterDeliveryId: 0,
        afterPacketId: 0,
        remainingMs: 20000,
      },
    });
    assert.equal(posts.length, before);
    assert.equal(calls.filter((v) => v.kind === 'START').length, 1);
    m.dispose();
  });
}

const previewText = (node) =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(previewText).join('')
      : node?.props
        ? previewText(node.props.children)
        : '';
async function rateRenderer() {
  let now = 0,
    supports = () => Promise.resolve(true),
    preferenceResult = contract.settingsSuccess('p1', 'OBSERVED', settings(), 'AVAILABLE');
  const timers = new Map(),
    calls = [],
    posts = [];
  const f = fleetState(0, [fleetId]);
  f.devices[0].state = 'DEVICE';
  let sessionNumber = 0;
  const m = mount(
    { read: async () => preferenceResult },
    1600,
    { read: async () => fleetContract.fleetSuccess('f1', 'OBSERVED', f, 'AVAILABLE') },
    null,
    null,
    null,
    null,
    null,
    null,
    {
      invoke: async (raw) => {
        const r = JSON.parse(raw);
        calls.push(r);
        return videoContract.videoStreamResponse(
          r.requestId,
          r.kind === 'START' ? 'PENDING' : 'STOPPED',
          r.kind === 'START'
            ? `00000000-0000-4000-8000-${String(++sessionNumber).padStart(12, '0')}`
            : r.videoId,
        );
      },
    },
    {
      now: () => now,
      utc: () => Date.now(),
      set: (fn, ms) => {
        const id = {};
        timers.set(id, { fn, ms });
        return id;
      },
      clear: (id) => timers.delete(id),
      supported: () => supports(),
      chunk: (v) => v,
      create: (output) => ({
        decodeQueueSize: 0,
        configure() {},
        close() {},
        decode: (chunk) =>
          output({
            timestamp: chunk.timestamp,
            codedWidth: 32,
            codedHeight: 16,
            visibleRect: { x: 0, y: 0, width: 32, height: 16 },
            displayWidth: 32,
            displayHeight: 16,
            rotation: 0,
            flip: false,
            close() {},
          }),
      }),
    },
  );
  m.effects();
  await flush();
  m.effects();
  await flush();
  const fixture = generateVideoDecoderFixture('LANDSCAPE');
  async function start() {
    m.render().props.video.onStart(fleetId, 1);
    await flush();
    const videoId = `00000000-0000-4000-8000-${String(sessionNumber).padStart(12, '0')}`;
    const port = {
      onmessage: null,
      onmessageerror: null,
      start() {},
      close() {},
      postMessage: (v) => posts.push(v),
    };
    m.events.get('message')({
      source: m.hostWindow,
      origin: videoContract.VIDEO_WINDOW_ORIGIN,
      data: {
        type: 'AUTO_VIDEO_PORT_V1',
        version: 1,
        videoId,
        requestId: calls.at(-1).requestId,
        deviceId: fleetId,
        generation: 1,
        deadlineUtc: Date.now() + 20000,
      },
      ports: [port],
    });
    m.render().props.video.canvasRef({
      dataset: {},
      width: 0,
      height: 0,
      style: {},
      getContext: () => ({ clearRect() {}, drawImage() {} }),
    });
    let epoch = 0,
      delivery = 0,
      packet = 0,
      geometry = 0,
      config = 0;
    const presentation = (state) =>
      port.onmessage({
        data: {
          version: 2,
          videoId,
          kind: 'PRESENTATION',
          epoch: ++epoch,
          state,
          afterDeliveryId: delivery,
          afterPacketId: packet,
          remainingMs: 20000,
        },
      });
    const send = (
      kind,
      bytes = kind === 'CONFIG'
        ? fixture.configuration
        : kind === 'SESSION'
          ? new Uint8Array()
          : fixture.key,
    ) => {
      if (kind === 'SESSION') geometry++;
      else packet++;
      if (kind === 'CONFIG') config++;
      port.onmessage({
        data: {
          version: 2,
          videoId,
          kind: 'MEDIA',
          epoch,
          delivery: {
            version: 1,
            videoId,
            deliveryId: ++delivery,
            geometryId: geometry,
            configId: kind === 'SESSION' ? 0 : config,
            packetId: packet,
            kind,
            ptsUs: kind === 'KEY' || kind === 'DELTA' ? packet : null,
            totalBytes: bytes.length,
            width: 32,
            height: 16,
            bytes,
          },
        },
      });
    };
    presentation('VISIBLE');
    send('SESSION');
    send('CONFIG');
    await flush();
    send('KEY');
    await flush();
    assert.equal(m.render().props.video.view.state, 'DISPLAYING');
    return { port, send, presentation, videoId };
  }
  return {
    m,
    timers,
    calls,
    posts,
    fixture,
    start,
    time: (value) => {
      now = value;
      m.hostTime(value);
    },
    text: () => previewText(m.render().props.previewAccounting),
    read: () => m.render().props.onPreviewAccountingRead(),
    support: (fn) => {
      supports = fn;
    },
    revoke: () => {
      preferenceResult = contract.settingsError('SESSION_REVOKED', null, 'DEGRADED');
    },
  };
}

test('renderer interval rates use two explicit reads, correct units, idle zeros and no additional effects', async () => {
  const h = await rateRenderer(),
    s = await h.start();
  h.read();
  assert.match(h.text(), /CAPTURED/);
  assert.match(h.text(), /Canvas draws\/s \/ AVC payload Mbps: UNKNOWN/);
  const calls = h.calls.length,
    posts = h.posts.length,
    timers = h.timers.size;
  h.time(1000);
  s.send('KEY');
  await flush();
  h.read();
  assert.match(h.text(), /Canvas: 1\.00 draws\/s/);
  assert.ok(
    h.text().includes(`AVC payload: ${((h.fixture.key.length * 8) / 1000000).toFixed(6)} Mbps`),
  );
  assert.match(h.text(), /khoảng 1000 ms/);
  assert.match(h.text(), /RENDERER_INTERVAL/);
  assert.match(
    h.text(),
    /Native\/effective FPS \/ bitrate \/ native drops \/ GPU presentation: UNKNOWN/,
  );
  assert.match(h.text(), /Đọc lần hai trong 5 giây/);
  assert.equal(h.calls.length, calls);
  assert.equal(h.posts.length, posts + 2); // Only the actual KEY's painted/consumed ACKs.
  assert.equal(h.timers.size, timers);
  assert.equal(h.m.hostTimers.size, 0);
  h.time(1500);
  h.read();
  assert.match(h.text(), /Canvas: 0\.00 draws\/s · AVC payload: 0\.000000 Mbps · khoảng 500 ms/);
  h.read();
  assert.match(h.text(), /Canvas draws\/s \/ AVC payload Mbps: UNKNOWN/);
  h.time(6500);
  h.read(); // Exactly 5 seconds is not an interval, but becomes a new baseline.
  assert.match(h.text(), /Canvas draws\/s \/ AVC payload Mbps: UNKNOWN/);
  h.time(6600);
  h.read();
  assert.match(h.text(), /Canvas: 0\.00 draws\/s/);
  h.time(11600);
  assert.doesNotMatch(h.text(), /CAPTURED/);
  assert.doesNotMatch(h.text(), /Canvas: 0\.00 draws\/s/);
  h.m.dispose();
});

test('renderer clears interval capture synchronously during pending CONFIG and at SESSION and hidden fences', async () => {
  const h = await rateRenderer(),
    s = await h.start();
  h.read();
  h.time(100);
  h.read();
  assert.match(h.text(), /Canvas: 0\.00 draws\/s/);
  let complete;
  h.support(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  s.send('CONFIG');
  assert.doesNotMatch(h.text(), /CAPTURED/); // No onState has run for pending capability.
  complete(true);
  await flush();
  h.read();
  assert.match(h.text(), /Canvas draws\/s \/ AVC payload Mbps: UNKNOWN/);
  s.send('KEY');
  await flush();
  h.time(200);
  h.read();
  assert.match(h.text(), /Canvas: 10\.00 draws\/s/);
  s.presentation('HIDDEN');
  assert.doesNotMatch(h.text(), /CAPTURED/);
  h.read();
  assert.match(h.text(), /Canvas draws\/s \/ AVC payload Mbps: UNKNOWN/);
  h.time(1200);
  s.send('KEY');
  await flush();
  h.read();
  assert.match(h.text(), /Canvas: 0\.00 draws\/s/);
  assert.ok(
    h.text().includes(`AVC payload: ${((h.fixture.key.length * 8) / 1000000).toFixed(6)} Mbps`),
  );
  s.presentation('VISIBLE');
  assert.doesNotMatch(h.text(), /CAPTURED/);
  h.read();
  assert.match(h.text(), /Canvas draws\/s \/ AVC payload Mbps: UNKNOWN/);
  s.send('SESSION');
  assert.doesNotMatch(h.text(), /CAPTURED/);
  h.read();
  assert.match(h.text(), /Canvas draws\/s \/ AVC payload Mbps: UNKNOWN/);
  h.m.dispose();
});

for (const terminal of [
  'stop-replace',
  'panel-close',
  'pagehide',
  'unmount',
  'port-failure',
  'revocation',
]) {
  test(`captured renderer rates cannot survive ${terminal}`, async () => {
    const h = await rateRenderer(),
      s = await h.start();
    h.read();
    h.time(100);
    h.read();
    assert.match(h.text(), /Canvas: 0\.00 draws\/s/);
    if (terminal === 'panel-close') h.m.render().props.onHostResourcesClose();
    if (terminal === 'pagehide') h.m.events.get('pagehide')();
    if (terminal === 'unmount') h.m.dispose();
    if (terminal === 'port-failure') s.port.onmessageerror();
    if (terminal === 'stop-replace') h.m.render().props.video.onStop();
    if (terminal === 'revocation') {
      h.revoke();
      h.m.find('preferences-read').props.onClick();
      await flush();
      h.m.effects();
    }
    assert.doesNotMatch(h.text(), /CAPTURED/);
    assert.doesNotMatch(h.text(), /Canvas: 0\.00 draws\/s/);
    await flush();
    if (terminal === 'stop-replace') {
      await h.start();
      h.read();
      assert.match(h.text(), /CAPTURED/);
      assert.match(h.text(), /Canvas draws\/s \/ AVC payload Mbps: UNKNOWN/);
      s.port.onmessageerror(); // Retired decoder/owner cannot invalidate the replacement.
      assert.match(h.text(), /CAPTURED/);
    } else if (terminal === 'panel-close') {
      h.time(200);
      h.read(); // A new panel's first legitimate read cannot reuse the closed baseline.
      assert.match(h.text(), /Canvas draws\/s \/ AVC payload Mbps: UNKNOWN/);
    } else {
      h.read();
      assert.doesNotMatch(h.text(), /CAPTURED/);
    }
    h.m.dispose();
  });
}

test('renderer backward observation clock permanently fences captured interval values', async () => {
  const h = await rateRenderer();
  await h.start();
  h.read();
  h.time(100);
  h.read();
  assert.match(h.text(), /Canvas: 0\.00 draws\/s/);
  h.time(99);
  assert.doesNotMatch(h.text(), /CAPTURED/);
  h.time(101);
  h.read();
  assert.doesNotMatch(h.text(), /CAPTURED/);
  assert.equal(h.m.render().props.video.view.state, 'DISPLAYING');
  h.m.dispose();
});

for (const fault of [NaN, Infinity, new Error('synthetic clock failure')]) {
  test(`renderer accounting clock fault ${String(fault)} hides rates without changing media`, async () => {
    const h = await rateRenderer();
    await h.start();
    h.read();
    h.time(100);
    h.read();
    assert.match(h.text(), /Canvas: 0\.00 draws\/s/);
    h.m.hostTime(fault);
    assert.doesNotMatch(h.text(), /CAPTURED/);
    h.time(200);
    h.read();
    assert.doesNotMatch(h.text(), /CAPTURED/);
    assert.equal(h.m.render().props.video.view.state, 'DISPLAYING');
    assert.equal(h.calls.length, 1);
    h.m.dispose();
  });
}
