import * as metricPresentation from '../src/ui/tracking-metric-presentation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as health from '../src/ui/fleet-health.ts';
import { parseFleetResponse } from '../src/fleet-contract.ts';
import { fleetActiveFixture } from './fixtures/fleet-active-input.mjs';

// Synthetic test inputs only, never a production source/label expansion.
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sample = (count = 2) => ({
  registryRevision: 0,
  availability: 'OBSERVED',
  reason: null,
  devices: Array.from({ length: count }, (_, i) => ({
    deviceId: id(i + 1),
    generation: i,
    label: `Device ${String(i + 1).padStart(4, '0')}`,
    state: i % 2 ? 'OFFLINE' : 'DEVICE',
    verification: i % 2 ? 'PROVISIONAL' : 'VERIFIED',
  })),
  selection: { revision: 0, selectedDeviceIds: [], activeDeviceId: null, groups: [] },
});
const project = (source = sample()) => health.projectFleetUi(source, 'READY');
function parse(csv) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && c === '\r' && csv[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  assert.equal(quoted, false);
  assert.equal(cell, '');
  assert.deepEqual(row, []);
  return rows;
}

test('actual admitted service response produces immutable redacted CSV with exact schema and record order', async () => {
  const f = await fleetActiveFixture();
  try {
    const response = parseFleetResponse(
      await f.service.execute(
        f.service.grant(() => {}),
        {
          version: 1,
          requestId: 'f1',
          method: 'fleet.get',
        },
      ),
    );
    assert.equal(response.ok, true);
    const ui = project(response.fleet),
      capture = health.captureFleetCsvPreview(ui);
    assert.ok(capture);
    assert.ok(Object.isFrozen(capture));
    const previewUi = mount(ui);
    previewUi.open();
    assert.equal(previewUi.csv(), capture.csv);
    previewUi.unmount();
    const rows = parse(capture.csv);
    assert.deepEqual(rows[0], [...health.FLEET_CSV_COLUMNS]);
    assert.equal(rows.length, response.fleet.devices.length + 1);
    for (const [i, device] of response.fleet.devices.entries()) {
      assert.deepEqual(rows[i + 1], [
        '1',
        'MAIN_FLEET_PROJECTION',
        'CAPTURED_REGISTRY_RECORDS',
        String(response.fleet.registryRevision),
        String(response.fleet.selection.revision),
        String(response.fleet.devices.length),
        device.deviceId,
        String(device.generation),
        device.label,
        device.state,
        device.verification,
        'NOT_PROVIDED_BY_SOURCE',
        'NOT_PROVIDED_BY_SOURCE',
      ]);
    }
    assert.equal(capture.utf8Bytes, Buffer.byteLength(capture.csv, 'utf8'));
    assert.doesNotMatch(
      capture.csv,
      /synthetic-a|synthetic-b|serial|account|media|password|1002|observedAt/,
    );
    assert.equal(health.isFleetCsvPreviewCurrent(capture, project(response.fleet)), true);
    const changed = await f.select(f.devices[1], [f.devices[0]]);
    assert.equal(health.isFleetCsvPreviewCurrent(capture, project(changed.fleet)), false);
    assert.deepEqual(parse(capture.csv), rows);
  } finally {
    await f.service.close();
  }
});

test('known zero records is header-only, actual integer zero and max safe integers retain lexical meaning', () => {
  const zero = health.captureFleetCsvPreview(project(sample(0)));
  assert.equal(zero.recordCount, 0);
  assert.equal(parse(zero.csv).length, 1);
  const source = sample(1);
  source.registryRevision = Number.MAX_SAFE_INTEGER;
  source.selection.revision = Number.MAX_SAFE_INTEGER;
  const capture = health.captureFleetCsvPreview(project(source)),
    row = parse(capture.csv)[1];
  assert.equal(row[3], '9007199254740991');
  assert.equal(row[4], '9007199254740991');
  assert.equal(row[7], '0');
  assert.equal(row[11], 'NOT_PROVIDED_BY_SOURCE');
  assert.ok(!capture.csv.startsWith('\ufeff'));
  assert.ok(capture.csv.endsWith('\r\n'));
});

test('unknown, copied, synthetic, pending, hostile or malformed source never gains CSV admission', () => {
  const source = sample(),
    ui = project(source),
    capture = health.captureFleetCsvPreview(ui);
  let reads = 0;
  const hostile = Object.defineProperty({}, 'status', {
    get() {
      reads++;
      throw Error();
    },
  });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const invalid of [
    null,
    undefined,
    'file:///private',
    'https://example.test',
    hostile,
    revoked.proxy,
    { ...ui },
    { ...ui, provenance: 'SYNTHETIC_TEST' },
    health.readFleetHealth(ui),
    health.projectFleetUi(source, 'READY', false),
    health.projectFleetUi(null, 'ERROR'),
    health.projectFleetUi(null, 'LOADING'),
    project({ ...sample(0), availability: 'UNAVAILABLE', reason: 'LIVE_DISCOVERY_UNAVAILABLE' }),
  ]) {
    assert.equal(health.captureFleetCsvPreview(invalid), null);
    assert.equal(health.isFleetCsvPreviewCurrent(capture, invalid), false);
  }
  assert.equal(reads, 0);
  assert.equal(health.isFleetCsvPreviewCurrent({ ...capture }, ui), false);
  for (const label of ['Việt 😀', '=SUM(1)', 'Device 0001\nsecret', 'Device 0001\u0000']) {
    const malformed = sample(1);
    malformed.devices[0].label = label;
    assert.equal(health.captureFleetCsvPreview(project(malformed)), null);
  }
  const malformed = sample(1);
  malformed.devices[0].generation = NaN;
  assert.equal(health.captureFleetCsvPreview(project(malformed)), null);
});

test('cell primitive preserves valid Unicode, commas, quotes and CRLF while making formula transformation explicit', () => {
  const encode = health.encodeFleetCsvCell;
  for (const value of ['Việt 😀', 'one,two', 'a"b', 'first\r\nsecond', 'last\nline', ' a', "'safe"])
    assert.equal(parse(`${encode(value)}\r\n`)[0][0], value);
  for (const value of [
    '=1+1',
    '+1',
    '-1',
    '@SUM(A1)',
    '  =1',
    '\u00a0@foo',
    '\ufeff+1',
    '\ttext',
    '\rtext',
    '\ntext',
  ])
    assert.equal(parse(`${encode(value)}\r\n`)[0][0], `'${value}`);
  assert.equal(encode('a"b'), '"a""b"');
  for (const value of [
    '\u0000',
    '\u000b',
    '\u001f',
    '\u007f',
    '\ud800',
    '\udc00',
    '\ud800x',
    '\udc00\ud800',
    {},
    0,
    null,
  ])
    assert.equal(encode(value), null);
});

test('raw cell and full admitted report resource limits refuse whole invalid input without truncation', () => {
  assert.equal(health.encodeFleetCsvCell('x'.repeat(256)), `"${'x'.repeat(256)}"`);
  assert.equal(health.encodeFleetCsvCell('x'.repeat(257)), null);
  assert.equal(health.encodeFleetCsvCell('😀'.repeat(128)), `"${'😀'.repeat(128)}"`);
  assert.equal(health.encodeFleetCsvCell('😀'.repeat(129)), null);
  assert.equal(health.encodeFleetCsvCell('"'.repeat(256)).length, 514);
  const source = sample(256);
  source.registryRevision = Number.MAX_SAFE_INTEGER;
  source.selection.revision = Number.MAX_SAFE_INTEGER;
  source.devices.forEach((device) => {
    device.generation = Number.MAX_SAFE_INTEGER;
    device.state = 'DISCONNECTED';
    device.verification = 'PROVISIONAL';
  });
  const capture = health.captureFleetCsvPreview(project(source));
  assert.equal(capture.recordCount, 256);
  assert.equal(parse(capture.csv).length, 257);
  assert.equal(capture.utf8Bytes, Buffer.byteLength(capture.csv));
  assert.equal(capture.utf8Bytes, 64731); // 219-byte header + 256 maximal 252-byte rows.
  assert.ok(capture.utf8Bytes <= health.FLEET_CSV_LIMITS.utf8Bytes);
  assert.equal(health.captureFleetCsvPreview(project(sample(257))), null);
});

function walk(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...[node.props?.children, node.props?.actions]
      .flat(Infinity)
      .flatMap((n) => walk(n, predicate)),
  ];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
function mount(snapshot = project()) {
  const slots = new Map(),
    effects = [],
    events = new Map();
  let current,
    cursor = 0,
    changed = false,
    modalMounted = false,
    tree;
  const doc = { activeElement: null };
  class Element {
    isConnected = true;
    focus() {
      if (this.isConnected) doc.activeElement = this;
    }
    querySelector() {
      return this.items?.[0];
    }
    querySelectorAll() {
      return this.items;
    }
  }
  const trigger = new Element(),
    outside = new Element();
  const hooks = {
    useState(initial) {
      const at = cursor++;
      if (!current.has(at)) current.set(at, { value: initial });
      const slot = current.get(at);
      return [
        slot.value,
        (value) => {
          slot.value = typeof value === 'function' ? value(slot.value) : value;
          changed = true;
        },
      ];
    },
    useRef(initial) {
      const at = cursor++;
      if (!current.has(at)) current.set(at, { current: initial });
      return current.get(at);
    },
    useEffect(fn, deps) {
      const at = cursor++,
        previous = current.get(at);
      if (!previous || deps.some((v, i) => v !== previous.deps[i])) {
        const slot = { deps, cleanup: previous?.cleanup };
        current.set(at, slot);
        effects.push(() => {
          slot.cleanup?.();
          slot.cleanup = fn();
        });
      }
    },
    createElement: (type, props) => ({ type, props }),
  };
  const modules = {
    react: hooks,
    'react/jsx-runtime': { jsx: hooks.createElement, jsxs: hooks.createElement },
    './fleet-health.js': health,
    './tracking-metric-presentation.js': metricPresentation,
    './ui-model.js': { UI_EXPORT_ACTION: 'export' },
    './icon-data.js': { ICONS: {} },
    './social-data.js': { SOCIAL_ICONS: {} },
  };
  function load(path) {
    const module = { exports: {} };
    runInNewContext(
      transformSync(readFileSync(new URL(`../src/ui/${path}`, import.meta.url), 'utf8'), {
        loader: 'tsx',
        format: 'cjs',
        jsx: 'automatic',
      }).code,
      {
        module,
        exports: module.exports,
        document: doc,
        HTMLElement: Element,
        window: {
          addEventListener(k, fn) {
            if (!events.has(k)) events.set(k, new Set());
            events.get(k).add(fn);
          },
          removeEventListener(k, fn) {
            events.get(k)?.delete(fn);
          },
        },
        require(name) {
          assert.ok(name in modules, name);
          return modules[name];
        },
      },
    );
    return module.exports;
  }
  const shared = load('ui-shared.tsx');
  modules['./ui-shared.tsx'] = shared;
  const pages = load('primary-pages.tsx');
  let props = {
    snapshot,
    selectedDeviceId: '',
    onUnavailable() {},
    onFocusDevice() {},
    onNavigate() {},
  };
  function call(fn, input) {
    if (!slots.has(fn)) slots.set(fn, new Map());
    current = slots.get(fn);
    cursor = 0;
    return fn(input);
  }
  function cleanup() {
    for (const slot of slots.get(shared.UiModal)?.values() ?? []) slot.cleanup?.();
    slots.delete(shared.UiModal);
    modalMounted = false;
  }
  const api = {
    doc,
    trigger,
    outside,
    events,
    shared,
    render(extra = {}) {
      props = { ...props, ...extra };
      do {
        changed = false;
        tree = call(pages.TrackingPage, props);
      } while (changed);
      const modal = walk(tree, (n) => n.type === shared.UiModal)[0];
      if (modal) {
        const rendered = call(shared.UiModal, modal.props);
        const panel = new Element();
        panel.items = walk(rendered, (n) => ['button', 'textarea'].includes(n.type)).map(
          () => new Element(),
        );
        walk(rendered, (n) => n.props?.role === 'dialog')[0].props.ref.current = panel;
        walk(rendered, (n) => n.props?.id === 'dialog-shade')[0].props.ref.current = new Element();
        api.modal = rendered;
        api.panel = panel;
        modalMounted = true;
      } else {
        if (modalMounted) cleanup();
        api.modal = null;
      }
      for (const effect of effects.splice(0)) effect();
      return tree;
    },
    button() {
      return walk(tree, (n) => n.props?.id === 'fleet-csv-preview')[0];
    },
    open() {
      trigger.focus();
      api.button().props.onClick();
      api.render();
    },
    csv() {
      return walk(api.modal, (n) => n.props?.id === 'fleet-csv-text')[0]?.props.value;
    },
    change(id, value) {
      const field = walk(tree, (n) => n.props?.id === id)[0];
      field.props.onChange(
        field.type === 'input' || field.type === 'select' ? { currentTarget: { value } } : value,
      );
      api.render();
    },
    unmount() {
      trigger.isConnected = false;
      cleanup();
      slots.clear();
      tree = null;
      api.modal = null;
    },
  };
  api.render();
  return api;
}

test('explicit preview captures all records independent of filters, preserves equivalent projections and repeats idempotently', () => {
  const source = sample(),
    ui = project(source),
    m = mount(ui);
  assert.equal(m.modal, null);
  const firstClick = m.button().props.onClick;
  m.trigger.focus();
  firstClick();
  firstClick();
  m.render();
  const csv = m.csv();
  assert.equal(parse(csv).length, 3);
  assert.equal(walk(m.modal, (n) => n.props?.id === 'fleet-csv-text')[0].props.readOnly, true);
  assert.match(text(m.modal), /Toàn bộ 2 bản ghi registry/);
  assert.match(text(m.modal), /không thu hẹp CSV/);
  assert.match(text(m.modal), /chưa lưu tệp/);
  assert.equal(m.events.get('keydown').size, 1);
  assert.equal(m.events.get('pointerdown').size, 1);
  m.render({ snapshot: project(source) });
  assert.equal(m.csv(), csv);
  m.button().props.onClick();
  m.render();
  assert.equal(m.csv(), csv);
  assert.equal(m.events.get('keydown').size, 1);
  m.change('tracking-network', 'youtube');
  assert.equal(m.modal, null);
  m.open();
  assert.equal(m.csv(), csv);
});

test('meaningful source/context changes close before cleanup and returning cannot revive or permit a stale open', () => {
  for (const kind of [
    'PENDING',
    'ERROR',
    'UNAVAILABLE',
    'REVISION',
    'SELECTION',
    'GENERATION',
    'STATE',
    'PHONE',
    'NETWORK',
    'QUERY',
    'ACCOUNT',
  ]) {
    const source = sample(),
      original = project(source),
      m = mount(original);
    const stale = m.button().props.onClick;
    m.open();
    if (kind === 'PHONE') m.render({ selectedDeviceId: id(1) });
    else if (kind === 'NETWORK') m.change('tracking-network', 'youtube');
    else if (kind === 'QUERY') m.change('tracking-search', 'new');
    else if (kind === 'ACCOUNT') m.change('tracking-account', 'missing');
    else {
      let changed;
      if (kind === 'PENDING') changed = health.projectFleetUi(source, 'READY', false);
      else if (kind === 'ERROR') changed = health.projectFleetUi(null, 'ERROR');
      else if (kind === 'UNAVAILABLE')
        changed = project({
          ...sample(0),
          availability: 'UNAVAILABLE',
          reason: 'LIVE_DISCOVERY_UNAVAILABLE',
        });
      else {
        const next = sample();
        if (kind === 'REVISION') next.registryRevision++;
        if (kind === 'SELECTION') next.selection.activeDeviceId = id(2);
        if (kind === 'GENERATION') next.devices[0].generation++;
        if (kind === 'STATE') next.devices[0].state = 'DISCONNECTED';
        changed = project(next);
      }
      m.render({ snapshot: changed });
    }
    assert.equal(m.modal, null, kind);
    assert.equal(m.events.get('keydown').size, 0, kind);
    m.render({ snapshot: original, selectedDeviceId: '' });
    stale();
    m.render();
    assert.equal(m.modal, null, `${kind} stale callback`);
    m.open();
    assert.ok(m.modal, kind);
  }
});

test('cancel, Escape, backdrop and unmount own one modal, restore focus and fence stale close callbacks', () => {
  const m = mount();
  m.open();
  assert.equal(m.doc.activeElement, m.panel.items[0]);
  const modalNode = walk(m.render(), (n) => n.type === m.shared.UiModal)[0];
  const oldClose = modalNode.props.onClose;
  walk(m.modal, (n) => n.props?.id === 'dialog-cancel')[0].props.onClick();
  m.render();
  assert.equal(m.modal, null);
  assert.equal(m.doc.activeElement, m.trigger);
  m.open();
  oldClose();
  m.render();
  assert.ok(m.modal);
  let prevented = false;
  for (const fn of m.events.get('keydown'))
    fn({
      key: 'Escape',
      preventDefault() {
        prevented = true;
      },
    });
  m.render();
  assert.ok(prevented);
  assert.equal(m.modal, null);
  assert.equal(m.doc.activeElement, m.trigger);
  m.open();
  m.panel.items.at(-1).focus();
  for (const fn of m.events.get('keydown'))
    fn({ key: 'Tab', preventDefault() {}, shiftKey: false });
  assert.equal(m.doc.activeElement, m.panel.items[0]);
  const shade = walk(m.modal, (n) => n.props?.id === 'dialog-shade')[0].props.ref.current;
  for (const fn of m.events.get('pointerdown')) fn({ target: shade });
  m.render();
  assert.equal(m.modal, null);
  assert.equal(m.doc.activeElement, m.trigger);
  m.open();
  m.outside.focus();
  m.unmount();
  assert.equal(m.doc.activeElement, m.outside);
  assert.equal(m.events.get('keydown').size, 0);
  assert.equal(m.events.get('pointerdown').size, 0);
  m.render();
  assert.equal(m.modal, null);
});

test('preview production path has no save, network, clipboard, date or new authority surface', () => {
  const source = readFileSync(new URL('../src/ui/fleet-health.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /Date\.|new Date|fetch\(|XMLHttpRequest|Blob|createObjectURL|clipboard|writeFile|saveDialog|node:|electron/,
  );
  const page = readFileSync(new URL('../src/ui/primary-pages.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(
    page,
    /fetch\(|Blob|createObjectURL|clipboard|download=|showSave|writeFile|ipcRenderer/,
  );
});
