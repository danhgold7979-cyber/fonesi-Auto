import * as metricPresentation from '../src/ui/tracking-metric-presentation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMap } from '../scripts/check-module-graph.mjs';
import workflowFixture from '../verification/workflow-fixture.cjs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as health from '../src/ui/fleet-health.ts';
import * as fleet from '../src/fleet-contract.ts';
import * as model from '../src/ui/ui-model.ts';
import * as tileZoom from '../src/ui/tile-zoom.ts';
import * as settings from '../src/settings-contract.ts';
import * as setup from '../src/platform-tools-setup-contract.ts';
import * as discovery from '../src/discovery-contract.ts';
import * as metadata from '../src/metadata-contract.ts';
import * as association from '../src/association-contract.ts';
import * as input from '../src/input-interaction-contract.ts';
import * as runtime from '../src/runtime-version-contract.ts';
import { createFleetService } from '../src/main/fleet-service.ts';
import { emptyRegistry, reconcileRegistry } from '../src/main/transport-registry.ts';
import { fleetActiveFixture } from './fixtures/fleet-active-input.mjs';

// Explicit synthetic inputs only. ADB_DISCOVERY tags exercise admission, not acquisition.
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const states = ['DEVICE', 'UNAUTHORIZED', 'OFFLINE', 'UNKNOWN', 'CONFLICT', 'DISCONNECTED'];
const sample = (extra = {}) => ({
  registryRevision: 12,
  availability: 'OBSERVED',
  reason: null,
  devices: states.map((state, i) => ({
    deviceId: id(i + 1),
    generation: i + 3,
    label: `Device ${String(i + 1).padStart(4, '0')}`,
    state,
    verification: i % 2 ? 'PROVISIONAL' : 'VERIFIED',
  })),
  selection: {
    revision: 7,
    selectedDeviceIds: [id(2)],
    activeDeviceId: id(1),
    groups: [{ groupId: id(90), deviceIds: [id(3)] }],
  },
  ...extra,
});
const empty = (availability = 'OBSERVED') =>
  sample({
    availability,
    reason: availability === 'OBSERVED' ? null : 'LIVE_DISCOVERY_UNAVAILABLE',
    devices: [],
    selection: { revision: 7, selectedDeviceIds: [], activeDeviceId: null, groups: [] },
  });
const wire = (value) => fleet.fleetSuccess('f1', 'OBSERVED', value, 'AVAILABLE');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function walk(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...[node.props?.children, node.props?.settings]
      .flat(Infinity)
      .flatMap((child) => walk(child, predicate)),
  ];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node !== 'object') return String(node);
  return text(node.props?.children);
}
function harness(fleetApi = {}, effectful = false) {
  let cursor = 0,
    component;
  const slots = [];
  const pendingEffects = [];
  const events = new Map(),
    observers = [];
  const surface = {
    clientWidth: 500,
    clientHeight: 700,
    addEventListener() {},
    removeEventListener() {},
  };
  class ResizeObserverMock {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }
  const jsx = (type, props) => ({ type, props });
  const hooks = {
    useState(initial) {
      const at = cursor++;
      if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
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
    useEffect(effect, dependencies) {
      const at = cursor++;
      if (!effectful) return;
      const previous = slots[at];
      if (
        !previous ||
        !dependencies ||
        dependencies.some((value, index) => !Object.is(value, previous.dependencies?.[index]))
      ) {
        const slot = { dependencies, cleanup: previous?.cleanup };
        slots[at] = slot;
        pendingEffects.push(() => {
          slot.cleanup?.();
          slot.cleanup = effect();
        });
      }
    },
    useCallback(fn) {
      return fn;
    },
    createElement: jsx,
  };
  const win = {
    innerWidth: 1600,
    innerHeight: 1000,
    fleet: fleetApi,
    discovery: { stop: async () => '{invalid' },
    addEventListener(name, callback) {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      events.get(name)?.delete(callback);
    },
  };
  const doc = {
    getElementById: () => ({}),
    documentElement: { dataset: {} },
    hasFocus: () => true,
    hidden: false,
    querySelector: () => null,
  };
  const modules = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-dom/client': {
      createRoot: () => ({
        render: (node) => {
          component = node.type;
        },
      }),
    },
    './fleet-health.js': health,
    './tracking-metric-presentation.js': metricPresentation,
    './ui/fleet-health.js': health,
    './ui-model.js': model,
    './tile-zoom.js': tileZoom,
    './icon-data.js': { ICONS: {} },
    './social-data.js': { SOCIAL_ICONS: {} },
    './fleet-contract.js': fleet,
    './settings-contract.js': settings,
    './platform-tools-setup-contract.js': setup,
    './discovery-contract.js': discovery,
    './metadata-contract.js': metadata,
    './association-contract.js': association,
    './input-interaction-contract.js': input,
    './runtime-version-contract.js': runtime,
  };
  function load(path) {
    const module = { exports: {} };
    const code = transformSync(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), {
      loader: 'tsx',
      format: 'cjs',
      jsx: 'automatic',
    }).code;
    runInNewContext(code, {
      module,
      exports: module.exports,
      window: win,
      document: doc,
      ResizeObserver: ResizeObserverMock,
      require(name) {
        assert.ok(name in modules, `Unexpected module ${name}`);
        return modules[name];
      },
    });
    return module.exports;
  }
  modules['./ui-shared.tsx'] = load('ui/ui-shared.tsx');
  const pages = load('ui/primary-pages.tsx');
  modules['./primary-pages.tsx'] = pages;
  modules['./work-pages.tsx'] = load('ui/work-pages.tsx');
  const shell = load('ui/ui-shell.tsx');
  modules['./ui/ui-shell.tsx'] = shell;
  return {
    pages,
    shell,
    effects() {
      for (const effect of pendingEffects.splice(0)) effect();
    },
    resize() {
      for (const callback of events.get('resize') ?? []) callback();
      for (const observer of observers) if (observer.active) observer.callback();
    },
    render(fn, props) {
      cursor = 0;
      const tree = fn(props);
      if (effectful) {
        const node = walk(tree, (n) => n.props?.id === 'wall-surface')[0];
        if (node) node.props.ref.current = surface;
      }
      return tree;
    },
    renderer() {
      load('renderer.tsx');
      return () => {
        cursor = 0;
        return component();
      };
    },
  };
}
const pageProps = (snapshot, extra = {}) => ({
  snapshot,
  onUnavailable() {},
  onNavigate() {},
  selectedDeviceId: snapshot.devices[0]?.id ?? '',
  onFocusDevice() {},
  ...extra,
});
function tracking(snapshot, extra = {}) {
  const h = harness();
  return h.render(h.pages.TrackingPage, pageProps(snapshot, extra));
}
function frozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) frozen(child);
}

test('validated wire projection preserves all six states, both verification values and exact identity/revisions', () => {
  const source = sample(),
    response = fleet.parseFleetResponse(wire(source));
  assert.equal(response.ok, true);
  const ui = health.projectFleetUi(response.fleet, 'READY'),
    result = health.readFleetHealth(ui);
  assert.equal(result.source, 'MAIN_FLEET_PROJECTION');
  assert.equal(result.scope, 'CAPTURED_REGISTRY_RECORDS');
  assert.equal(result.registryRevision, 12);
  assert.equal(result.recordCount, 6);
  assert.deepEqual(result.records, source.devices);
  assert.deepEqual(result.selection, source.selection);
  assert.deepEqual(
    ui.devices.map((d) => d.status),
    states,
  );
  assert.equal(result.observationTime, null);
  assert.equal(result.verificationTime, null);
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'source',
      'scope',
      'registryRevision',
      'selection',
      'records',
      'recordCount',
      'observationTime',
      'verificationTime',
    ].sort(),
  );
  frozen(ui);
  frozen(result);
  source.devices[0].generation = 999;
  source.selection.groups[0].deviceIds[0] = id(99);
  assert.equal(result.records[0].generation, 3);
  assert.equal(result.selection.groups[0].deviceIds[0], id(3));
  assert.throws(() => {
    result.records[0].state = 'OFFLINE';
  }, TypeError);
});

test('observed empty is a known zero record scope; loading, unavailable and errors have no health', () => {
  const known = health.projectFleetUi(empty(), 'READY');
  assert.equal(health.readFleetHealth(known).recordCount, 0);
  assert.match(text(tracking(known)), /0 bản ghi trong toàn bộ registry đã nhận/);
  for (const [value, state, expected] of [
    [sample(), 'LOADING', 'LOADING'],
    [sample(), 'ERROR', 'ERROR'],
    [empty('UNAVAILABLE'), 'READY', 'UNAVAILABLE'],
    [null, 'READY', 'ERROR'],
  ]) {
    const ui = health.projectFleetUi(value, state);
    assert.equal(ui.status, expected);
    assert.equal(ui.devices.length, 0);
    assert.equal(health.readFleetHealth(ui), null);
    assert.match(text(tracking(ui)), /Số bản ghi: chưa khả dụng/);
  }
});

test('hostile descriptors, duplicate records, unknown fields and invalid values cannot acquire health', () => {
  let getters = 0;
  const accessor = sample();
  Object.defineProperty(accessor, 'devices', {
    enumerable: true,
    get() {
      getters++;
      throw Error('PRIVATE');
    },
  });
  const nested = sample();
  Object.defineProperty(nested.devices[0], 'state', {
    enumerable: true,
    get() {
      getters++;
      throw Error('PRIVATE');
    },
  });
  const arrayGetter = sample();
  Object.defineProperty(arrayGetter.devices, '0', {
    enumerable: true,
    get() {
      getters++;
      throw Error('PRIVATE');
    },
  });
  const duplicate = sample();
  duplicate.devices[1].deviceId = duplicate.devices[0].deviceId;
  const duplicateLabel = sample();
  duplicateLabel.devices[1].label = duplicateLabel.devices[0].label;
  const extra = sample();
  extra.devices[0].battery = 99;
  const invalidGeneration = sample();
  invalidGeneration.devices[0].generation = -0;
  const invalidSelection = sample();
  invalidSelection.selection.activeDeviceId = id(999);
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const bad of [
    accessor,
    nested,
    arrayGetter,
    duplicate,
    duplicateLabel,
    extra,
    invalidGeneration,
    invalidSelection,
    revoked.proxy,
    { ...sample(), observedAtUtc: 123456789 },
    { ...sample(), registryRevision: NaN },
    { ...sample(), availability: 'SYNTHETIC_TEST' },
    [],
    undefined,
  ]) {
    const ui = health.projectFleetUi(bad, 'READY');
    assert.equal(ui.status, 'ERROR');
    assert.equal(health.readFleetHealth(ui), null);
  }
  assert.equal(getters, 0);
  assert.equal(
    fleet.parseFleetResponse(
      wire(sample()).replace(
        '"registryRevision":12',
        '"registryRevision":12,"registryRevision":13',
      ),
    ),
    null,
  );
});

test('UI identity binding rejects copied, spread, inherited, forged and synthetic UI objects', () => {
  const ui = health.projectFleetUi(sample(), 'READY');
  for (const other of [
    { ...ui },
    JSON.parse(JSON.stringify(ui)),
    Object.create(ui),
    { ...ui, provenance: 'SYNTHETIC_TEST' },
    { ...ui, health: health.readFleetHealth(ui) },
    new Proxy(ui, {}),
    null,
    undefined,
    1,
  ])
    assert.equal(health.readFleetHealth(other), null);
  assert.ok(health.readFleetHealth(ui));
});

test('revision high-water rejects either rollback and invalid values without resetting after failure', () => {
  const gate = health.createFleetRevisionGate();
  frozen(gate);
  assert.equal(gate.admit(sample()), true);
  for (const bad of [
    null,
    sample({ registryRevision: 11 }),
    sample({ selection: { ...sample().selection, revision: 6 } }),
    sample({ registryRevision: 100, selection: { ...sample().selection, revision: 6 } }),
  ])
    assert.equal(gate.admit(bad), false);
  health.projectFleetUi(null, 'ERROR');
  health.projectFleetUi(null, 'LOADING');
  assert.equal(gate.admit(sample()), true); // Failed revision 100 did not poison the gate.
  assert.equal(gate.admit(sample({ registryRevision: 13 })), true);
  assert.equal(gate.admit(sample()), false);
});

test('Tracking shows captured states separately from verification, no account zeros or invented measurements', () => {
  const ui = health.projectFleetUi(sample(), 'READY'),
    tree = tracking(ui),
    content = text(tree);
  for (const state of states) assert.ok(content.includes(state));
  assert.match(content, /Xác minh thiết bị trong registry: VERIFIED/);
  assert.match(content, /Xác minh thiết bị trong registry: PROVISIONAL/);
  assert.match(content, /Thời điểm quan sát\/xác minh: chưa có/);
  assert.match(content, /Tài khoản: chưa có nguồn/);
  assert.doesNotMatch(content, /0 tài khoản|0 snapshot đã tải|\d+%.*pin/i);
  const stats = walk(tree, (n) => n.type?.name === 'StatCard');
  assert.equal(stats.find((n) => n.props.label === 'Tài khoản trong bộ lọc').props.value, '—');
  const table = walk(tree, (n) => n.props?.className === 'health-table tracking-device-health')[0];
  const rows = walk(table, (n) => n.type === 'tr').slice(1);
  assert.equal(rows.length, 6);
  rows.forEach((row, i) => {
    const cells = walk(row, (n) => n.type === 'td');
    assert.ok(text(cells[0]).includes(id(i + 1)));
    assert.ok(text(cells[0]).includes(`Generation ${i + 3}`));
    assert.equal(text(cells[1]), 'UNKNOWN');
    assert.equal(text(cells[4]), '—');
    assert.match(text(cells[2]), /Chưa có phép đo/);
    assert.match(text(cells[3]), /Chưa có phép đo/);
  });
});

test('Tracking phone focus and row navigation remain device-specific without narrowing all-record health', () => {
  const ui = health.projectFleetUi(sample(), 'READY'),
    focus = [],
    navigation = [];
  const tree = tracking(ui, {
    selectedDeviceId: id(2),
    onFocusDevice: (v) => focus.push(v),
    onNavigate: (...v) => navigation.push(v),
  });
  const phone = walk(tree, (n) => n.props?.id === 'tracking-phone')[0];
  assert.equal(phone.props.value, id(2));
  phone.props.onChange({ currentTarget: { value: id(4) } });
  assert.deepEqual(focus, [id(4)]);
  const row = walk(tree, (n) => n.type === 'tr' && text(n).includes(id(3)))[0];
  walk(row, (n) => n.type === 'button').forEach((n) => {
    n.props.onClick();
  });
  assert.deepEqual(navigation, [
    ['setup', id(3)],
    ['calendar', id(3)],
  ]);
  assert.match(text(tree), /6 bản ghi trong toàn bộ registry đã nhận/);
});

test('actual FleetService to wire parser to UI to Tracking preserves selection, identities and redaction', async () => {
  const f = await fleetActiveFixture();
  try {
    const cap = f.service.grant(() => {});
    const response = fleet.parseFleetResponse(
      await f.service.execute(cap, { version: 1, requestId: 'f1', method: 'fleet.get' }),
    );
    assert.equal(response.ok, true);
    const ui = health.projectFleetUi(response.fleet, 'READY'),
      result = health.readFleetHealth(ui);
    assert.equal(result.registryRevision, f.registry.revision);
    assert.equal(result.selection.revision, f.revision);
    assert.equal(result.selection.activeDeviceId, f.devices[0]);
    assert.deepEqual(result.selection.selectedDeviceIds, [f.devices[1]]);
    assert.deepEqual(
      result.records.map((d) => d.deviceId),
      f.devices,
    );
    assert.ok(result.records.every((d) => d.verification === 'VERIFIED'));
    const content = text(tracking(ui));
    assert.match(content, /MAIN_FLEET_PROJECTION/);
    assert.doesNotMatch(content, /synthetic-a|synthetic-b|1002/);
    const changed = await f.select(f.devices[1], [f.devices[0]]);
    const next = health.readFleetHealth(
      health.projectFleetUi(fleet.parseFleetResponse(JSON.stringify(changed)).fleet, 'READY'),
    );
    assert.equal(next.selection.activeDeviceId, f.devices[1]);
    assert.equal(result.selection.activeDeviceId, f.devices[0]);
  } finally {
    await f.service.close();
  }
});

test('actual FleetService rejects synthetic registry source before health projection', async () => {
  let sequence = 1;
  const result = reconcileRegistry(
    emptyRegistry(),
    {
      sequence: 1,
      observedAtUtc: 1001,
      source: 'SYNTHETIC_TEST',
      rows: [{ serial: 'synthetic-health-only', transportId: '1', state: 'DEVICE' }],
      proofs: [],
    },
    {
      nextId: () => id(sequence++),
      budget: { maxDevices: 256, maxBindings: 4096, maxEvidence: 4096, maxClaims: 256 },
    },
  );
  assert.equal(result.ok, true);
  const service = createFleetService({
    registry: () => result.snapshot,
    availability: () => 'OBSERVED',
    assertOwnedSync() {},
    newDiagnostic: () => id(900),
    audit: async () => 'AVAILABLE',
  });
  try {
    const response = fleet.parseFleetResponse(
      await service.execute(
        service.grant(() => {}),
        { version: 1, requestId: 'f1', method: 'fleet.get' },
      ),
    );
    assert.equal(response.ok, false);
    assert.equal(response.code, 'FLEET_UNAVAILABLE');
    assert.equal(health.readFleetHealth(health.projectFleetUi(response.fleet, 'ERROR')), null);
  } finally {
    await service.close();
  }
});

test('actual shell passes the same admitted bound snapshot to Tracking and clears rejected payloads', () => {
  const h = harness(),
    ui = health.projectFleetUi(sample(), 'READY');
  let props = {
    theme: 'LIGHT',
    ready: true,
    pending: false,
    reconcile: false,
    status: '',
    dockWidth: 500,
    tileWidth: 150,
    onTheme() {},
    onDimensions() {},
    snapshot: ui,
    settings: null,
  };
  let tree = h.render(h.shell.UiShell, props);
  walk(
    tree,
    (n) => n.type === 'button' && n.props?.['data-page'] === 'tracking',
  )[0].props.onClick();
  tree = h.render(h.shell.UiShell, props);
  let page = walk(tree, (n) => n.type === h.pages.TrackingPage)[0];
  assert.equal(page.props.snapshot, ui);
  assert.ok(health.readFleetHealth(page.props.snapshot));
  props = { ...props, snapshot: { ...ui, status: 'ERROR' }, health: health.readFleetHealth(ui) };
  page = walk(h.render(h.shell.UiShell, props), (n) => n.type === h.pages.TrackingPage)[0];
  assert.equal(page.props.snapshot.devices.length, 0);
  assert.equal(health.readFleetHealth(page.props.snapshot), null);
});

test('actual renderer clears pending/errors and retains revision high-water through errors and unavailable', async () => {
  let reply = wire(sample());
  const h = harness({ read: async () => reply });
  const render = h.renderer();
  const click = () => walk(render(), (n) => n.props?.id === 'fleet-read')[0].props.onClick();
  click();
  await flush();
  assert.ok(health.readFleetHealth(render().props.snapshot));
  const hold = deferred();
  reply = hold.promise;
  click();
  assert.equal(render().props.snapshot.status, 'READY');
  assert.equal(render().props.snapshot.devices.length, 6);
  assert.equal(health.readFleetHealth(render().props.snapshot), null);
  const pendingTracking = tracking(render().props.snapshot);
  assert.match(text(pendingTracking), /Nguồn fleet: chưa khả dụng/);
  assert.match(text(pendingTracking), /Số bản ghi: chưa khả dụng/);
  assert.doesNotMatch(
    text(pendingTracking),
    /Generation 3|registry: VERIFIED|registry: PROVISIONAL/,
  );
  hold.resolve('{invalid');
  await flush();
  assert.equal(render().props.snapshot.status, 'ERROR');
  for (const next of [
    sample({ registryRevision: 11 }),
    sample({ selection: { ...sample().selection, revision: 6 } }),
  ]) {
    reply = wire(next);
    click();
    await flush();
    assert.equal(render().props.snapshot.status, 'ERROR');
  }
  reply = wire(empty('UNAVAILABLE'));
  click();
  await flush();
  assert.equal(render().props.snapshot.status, 'UNAVAILABLE');
  reply = wire(sample());
  click();
  await flush();
  assert.equal(health.readFleetHealth(render().props.snapshot).registryRevision, 12);
});

test('actual renderer invalidation fences a delayed fleet response and permits explicit fresh recovery', async () => {
  const hold = deferred();
  let reply = hold.promise;
  const h = harness({ read: async () => reply }),
    render = h.renderer();
  const click = (id) => walk(render(), (n) => n.props?.id === id)[0].props.onClick();
  click('fleet-read');
  click('discovery-stop');
  await flush();
  hold.resolve(wire(sample()));
  await flush();
  assert.equal(health.readFleetHealth(render().props.snapshot), null);
  reply = wire(sample({ registryRevision: 13 }));
  click('fleet-read');
  await flush();
  assert.equal(health.readFleetHealth(render().props.snapshot).registryRevision, 13);
});

test('synthetic and copied UI may retain demo rows but never display observed health or verification', () => {
  const observed = health.projectFleetUi(sample(), 'READY');
  for (const snapshot of [{ ...observed }, { ...observed, provenance: 'SYNTHETIC_TEST' }]) {
    const content = text(tracking(snapshot));
    assert.match(content, /Nguồn fleet: chưa khả dụng/);
    if (snapshot.provenance === 'SYNTHETIC_TEST')
      assert.match(content, /Xác minh thiết bị trong registry: UNAVAILABLE/);
    else assert.doesNotMatch(content, /Generation 3/);
    assert.doesNotMatch(content, /MAIN_FLEET_PROJECTION|registry: VERIFIED|registry: PROVISIONAL/);
  }
});

test('actual renderer selection pending clears health and response preserves independent ACTIVE and selected sets', async () => {
  const hold = deferred(),
    calls = [];
  const h = harness({
      read: async () => wire(sample()),
      replaceSelection: (revision, selection) => {
        calls.push({ revision, selection });
        return hold.promise;
      },
    }),
    render = h.renderer();
  walk(render(), (n) => n.props?.id === 'fleet-read')[0].props.onClick();
  await flush();
  const selection = { selectedDeviceIds: [id(1)], activeDeviceId: id(2), groups: [] };
  render().props.onSelection(selection);
  assert.equal(render().props.snapshot.status, 'READY');
  assert.equal(render().props.snapshot.devices.length, 6);
  assert.equal(health.readFleetHealth(render().props.snapshot), null);
  const pendingTracking = tracking(render().props.snapshot);
  assert.match(text(pendingTracking), /Nguồn fleet: chưa khả dụng/);
  assert.match(text(pendingTracking), /Số bản ghi: chưa khả dụng/);
  assert.doesNotMatch(
    text(pendingTracking),
    /Generation 3|registry: VERIFIED|registry: PROVISIONAL/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].revision, 7);
  assert.equal(calls[0].selection, selection);
  hold.resolve(
    fleet.fleetSuccess(
      'f2',
      'APPLIED',
      sample({ selection: { revision: 8, ...selection } }),
      'AVAILABLE',
    ),
  );
  await flush();
  const result = health.readFleetHealth(render().props.snapshot);
  assert.equal(result.selection.activeDeviceId, id(2));
  assert.deepEqual(result.selection.selectedDeviceIds, [id(1)]);
  assert.equal(result.selection.revision, 8);
});

test('phase10 workflow remains exact-branch source-only with pinned tools and explicit deferred gates', () => {
  const raw = readFileSync(
    new URL('../../.github/workflows/phase-10-fleet-health-source.yml', import.meta.url),
    'utf8',
  );
  function validate(source) {
    const normalized = source.replaceAll('\r\n', '\n');
    assert.match(
      normalized,
      /on:\n {2}workflow_dispatch:\n {2}push:\n {4}branches: \[phase-10\]\n/,
    );
    assert.match(normalized, /permissions:\n {2}contents: read\njobs:/);
    assert.match(normalized, / {4}if: github.ref == 'refs\/heads\/phase-10'\n/);
    assert.match(normalized, /runs-on: windows-2022\n {4}timeout-minutes: 15\n/);
    assert.match(normalized, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/);
    assert.match(normalized, /persist-credentials: false/);
    assert.match(normalized, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
    assert.match(normalized, /node-version: '24\.22\.1'/);
    assert.match(normalized, /package-manager-cache: false/);
    assert.equal(
      (normalized.match(/node desktop\/scripts\/check\.mjs --restore/g) ?? []).length,
      1,
    );
    assert.match(normalized, /if \(\$LASTEXITCODE -ne 0\) \{ exit \$LASTEXITCODE \}/);
    assert.doesNotMatch(
      normalized,
      /Invoke-|upload-artifact|download-artifact|actions\/cache|secrets\.|id-token:|contents: write|npm install|npm ci|electron|adb\.exe/i,
    );
    for (const marker of [
      'PHASE10_SOURCE_ONLY',
      'FLEET_HEALTH_CAPTURED_RECORDS_ONLY',
      'VISUAL_NATIVE_NOT_RUN',
      'DEVICE_HARDWARE_NOT_RUN',
      'P106_CROSS_USER_UNMET_NOT_RERUN',
    ])
      assert.ok(normalized.includes(marker));
  }
  for (const source of workflowFixture.workflowEncodings(raw)) {
    validate(source);
    for (const changed of [
      source.replace('[phase-10]', '[main]'),
      source.replace("github.ref == 'refs/heads/phase-10'", 'true'),
      source.replace('persist-credentials: false', 'persist-credentials: true'),
      source.replace('contents: read', 'contents: write'),
      source.replace('timeout-minutes: 15', 'timeout-minutes: 0'),
      source.replace('VISUAL_NATIVE_NOT_RUN', 'VISUAL_NATIVE_PASS'),
      `${source}\n      - run: Invoke-FleetUi.ps1\n`,
    ]) {
      assert.notEqual(changed, source);
      assert.throws(() => validate(changed));
    }
  }
});

test('module-map byte limit admits exact 66304 bytes and rejects 66305 before parsing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fleet-health-map-'));
  const path = join(directory, 'synthetic-map.json');
  try {
    const source = readFileSync(new URL('../module-map.json', import.meta.url));
    assert.ok(source.length <= 66304);
    writeFileSync(path, Buffer.concat([source, Buffer.alloc(66304 - source.length, 32)]), {
      flag: 'wx',
    });
    assert.deepEqual(readMap(path), JSON.parse(source.toString('utf8')));
    writeFileSync(path, Buffer.alloc(66305, 32));
    assert.throws(() => readMap(path), /MAP_INVALID/);
  } finally {
    unlinkSync(path);
    rmdirSync(directory);
  }
});

test('effectful shell retains exact phone focus through pending and automatic resizes without health', () => {
  const h = harness({}, true),
    selected = [];
  const source = sample(),
    initial = health.projectFleetUi(source, 'READY');
  let props = {
    theme: 'LIGHT',
    ready: true,
    pending: false,
    reconcile: false,
    status: '',
    dockWidth: 500,
    tileWidth: 150,
    onTheme() {},
    onDimensions() {},
    snapshot: initial,
    settings: null,
    selection: source.selection,
    onSelection: (selection) => selected.push(selection),
  };
  const render = () => {
    const tree = h.render(h.shell.UiShell, props);
    h.effects();
    return tree;
  };
  let tree = render();
  walk(
    tree,
    (n) => n.type === 'button' && n.props?.['data-page'] === 'tracking',
  )[0].props.onClick();
  tree = render();
  walk(tree, (n) => n.type === h.pages.TrackingPage)[0].props.onFocusDevice(id(1));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].activeDeviceId, id(1));
  tree = render();
  const grid = (value) => walk(value, (n) => n.props?.id === 'screens-grid')[0];
  assert.match(grid(tree).props.className, /single/);
  assert.match(text(grid(tree)), /Device 0001/);
  assert.doesNotMatch(text(grid(tree)), /Device 0002/);
  props = {
    ...props,
    snapshot: health.projectFleetUi(source, 'READY', false),
    selectionPending: true,
  };
  tree = render();
  assert.equal(walk(grid(tree), (n) => n.type === 'button').length, 1);
  assert.match(grid(tree).props.className, /single/);
  h.resize();
  props = { ...props, dockWidth: 600 };
  tree = render();
  h.resize();
  tree = render();
  assert.match(grid(tree).props.className, /single/);
  const pendingPage = tracking(props.snapshot);
  assert.match(text(pendingPage), /Nguồn fleet: chưa khả dụng/);
  assert.doesNotMatch(text(pendingPage), /Generation 3|registry: VERIFIED|registry: PROVISIONAL/);
  assert.match(text(pendingPage), /Số bản ghi: chưa khả dụng/);
  assert.equal(
    health.readFleetHealth(walk(tree, (n) => n.type === h.pages.TrackingPage)[0].props.snapshot),
    null,
  );
  const admitted = sample({ selection: { revision: 8, ...selected[0] } });
  props = {
    ...props,
    snapshot: health.projectFleetUi(admitted, 'READY'),
    selection: admitted.selection,
    selectionPending: false,
  };
  tree = render();
  assert.match(grid(tree).props.className, /single/);
  assert.match(text(grid(tree)), /Device 0001/);
  assert.doesNotMatch(text(grid(tree)), /Device 0002/);
});

test('effectful shell discards stored phone focus after error, unavailable, generation or ID mismatch', () => {
  for (const kind of ['ERROR', 'UNAVAILABLE', 'MISSING', 'GENERATION', 'DEVICE_ID']) {
    const h = harness({}, true),
      source = sample(),
      initial = health.projectFleetUi(source, 'READY');
    let props = {
      theme: 'LIGHT',
      ready: true,
      pending: false,
      reconcile: false,
      status: '',
      dockWidth: 500,
      tileWidth: 150,
      onTheme() {},
      onDimensions() {},
      snapshot: initial,
      settings: null,
      selection: source.selection,
      onSelection() {},
    };
    const render = () => {
      const tree = h.render(h.shell.UiShell, props);
      h.effects();
      return tree;
    };
    let tree = render();
    walk(
      tree,
      (n) => n.type === 'button' && n.props?.['data-page'] === 'tracking',
    )[0].props.onClick();
    tree = render();
    walk(tree, (n) => n.type === h.pages.TrackingPage)[0].props.onFocusDevice(id(1));
    tree = render();
    assert.match(walk(tree, (n) => n.props?.id === 'screens-grid')[0].props.className, /single/);
    props = { ...props, snapshot: health.projectFleetUi(source, 'READY', false) };
    render();
    let changed;
    if (kind === 'ERROR') changed = health.projectFleetUi(null, 'ERROR');
    else if (kind === 'UNAVAILABLE') changed = health.projectFleetUi(empty('UNAVAILABLE'), 'READY');
    else if (kind === 'MISSING') changed = health.projectFleetUi(empty(), 'READY');
    else {
      const next = sample();
      if (kind === 'GENERATION') next.devices[0].generation++;
      else {
        next.devices[0].deviceId = id(99);
        next.selection.activeDeviceId = id(99);
      }
      changed = health.projectFleetUi(next, 'READY');
      assert.equal(changed.status, 'READY');
    }
    props = { ...props, snapshot: changed };
    render();
    props = { ...props, snapshot: initial };
    tree = render();
    const grid = walk(tree, (n) => n.props?.id === 'screens-grid')[0];
    assert.doesNotMatch(grid.props.className, /single/, kind);
    assert.doesNotMatch(text(grid), /Device 0001/, kind);
  }
});
