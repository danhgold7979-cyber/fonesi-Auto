import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as model from '../src/ui/ui-model.ts';
import * as tileZoom from '../src/ui/tile-zoom.ts';
const code = transformSync(
  readFileSync(new URL('../src/ui/ui-shell.tsx', import.meta.url), 'utf8'),
  { loader: 'tsx', format: 'cjs', jsx: 'automatic' },
).code;
const sharedCode = transformSync(
  readFileSync(new URL('../src/ui/ui-shared.tsx', import.meta.url), 'utf8'),
  { loader: 'tsx', format: 'cjs', jsx: 'automatic' },
).code;
const workCode = transformSync(
  readFileSync(new URL('../src/ui/work-pages.tsx', import.meta.url), 'utf8'),
  { loader: 'tsx', format: 'cjs', jsx: 'automatic' },
).code;
const fixture = {
  status: 'READY',
  provenance: 'SYNTHETIC_TEST',
  devices: [
    {
      id: 'test-1',
      generation: 0,
      name: 'Synthetic phone',
      serial: 'fixture',
      status: 'OFFLINE',
      connection: 'UNAVAILABLE',
    },
  ],
  accounts: [],
  media: [],
  jobs: [{ id: 'job-1' }],
};
function walk(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...[node.props?.children].flat(Infinity).flatMap((child) => walk(child, predicate)),
  ];
}
function mount(extra = {}) {
  let current,
    cursor = 0;
  const events = new Map(),
    dimensions = [],
    slots = new Map(),
    pending = [];
  const document = {
    focused: true,
    hidden: false,
    hasFocus() {
      return this.focused;
    },
    activeElement: null,
    activeDialog: null,
    documentElement: { dataset: {} },
    querySelector(selector) {
      assert.equal(selector, '[role="dialog"]');
      return this.activeDialog;
    },
  };
  class Element {
    isConnected = true;
    measuredHeight = 30;
    marginTop = 0;
    marginBottom = 0;
    children = [];
    getBoundingClientRect() {
      return { height: this.measuredHeight };
    }
    closest() {
      return null;
    }
    focus() {
      document.activeElement = this;
      this.onFocus?.();
    }
    contains(other) {
      return other === this || this.children.some((child) => child.contains(other));
    }
    querySelector() {
      return this.first;
    }
    querySelectorAll() {
      return this.items ?? [];
    }
  }
  const window = {
    innerWidth: 1600,
    innerHeight: 1000,
    getComputedStyle(element) {
      return {
        marginTop: `${element.marginTop}px`,
        marginBottom: `${element.marginBottom}px`,
        getPropertyValue(name) {
          return name.startsWith('padding')
            ? '10px'
            : name === 'border-bottom-width'
              ? '1px'
              : '0px';
        },
      };
    },
    addEventListener: (key, fn) => {
      if (!events.has(key)) events.set(key, new Set());
      events.get(key).add(fn);
    },
    removeEventListener: (key, fn) => events.get(key)?.delete(fn),
  };
  const hooks = {
    useState(initial) {
      const key = cursor++;
      if (!current.has(key)) current.set(key, { value: initial });
      const slot = current.get(key);
      return [
        slot.value,
        (value) => {
          slot.value = typeof value === 'function' ? value(slot.value) : value;
        },
      ];
    },
    useRef(value) {
      const key = cursor++;
      if (!current.has(key)) current.set(key, { current: value });
      return current.get(key);
    },
    useEffect(effect, deps) {
      const key = cursor++;
      const old = current.get(key);
      if (!old || !deps || deps.some((value, i) => !Object.is(value, old.deps?.[i]))) {
        const slot = { deps, cleanup: old?.cleanup };
        current.set(key, slot);
        pending.push(() => {
          slot.cleanup?.();
          slot.cleanup = effect();
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const shared = { exports: {} };
  runInNewContext(sharedCode, {
    module: shared,
    exports: shared.exports,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === './icon-data.js') return { ICONS: {} };
      if (name === './social-data.js') return { SOCIAL_ICONS: {} };
      throw Error('UNKNOWN_SHARED_MODULE');
    },
    window,
    document,
    HTMLElement: Element,
  });
  const work = { exports: {} };
  runInNewContext(workCode, {
    module: work,
    exports: work.exports,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === './ui-model.js') return model;
      if (name === './tile-zoom.js') return tileZoom;
      if (name === './ui-shared.tsx') return shared.exports;
      throw Error('UNKNOWN_WORK_MODULE');
    },
  });
  const observers = [];
  class ResizeObserverMock {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target) {
      this.target = target;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  const module = { exports: {} };
  runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === './ui-model.js') return model;
      if (name === './tile-zoom.js') return tileZoom;
      if (name === './ui-shared.tsx') return shared.exports;
      if (name === './primary-pages.tsx' || name === './work-pages.tsx')
        return {
          WORKFLOW_LABELS: work.exports.WORKFLOW_LABELS,
          ...Object.fromEntries(
            [
              'OverviewPage',
              'AccountsPage',
              'TrackingPage',
              'SetupPage',
              'CalendarPage',
              'WorkflowsPage',
            ].map((x) => [x, x]),
          ),
        };
      throw Error('UNKNOWN_MODULE');
    },
    window,
    document,
    ResizeObserver: ResizeObserverMock,
    Node: Element,
    HTMLElement: Element,
    HTMLInputElement: class extends Element {},
    HTMLTextAreaElement: class extends Element {},
  });
  const props = {
    theme: 'LIGHT',
    ready: true,
    pending: false,
    reconcile: false,
    status: 'OBSERVED',
    dockWidth: 510,
    tileWidth: 150,
    onTheme() {},
    onDimensions: (...args) => dimensions.push(args),
    settings: jsx('section', { id: 'settings-fixture' }),
    ...extra,
  };
  const renderComponent = (component, properties) => {
    if (!slots.has(component)) slots.set(component, new Map());
    current = slots.get(component);
    cursor = 0;
    return component(properties);
  };
  const wheelListeners = new Set();
  const surface = new Element();
  surface.clientWidth = 510;
  surface.clientHeight = 600;
  surface.addEventListener = (name, listener, options) => {
    assert.equal(name, 'wheel');
    assert.equal(options.passive, false);
    wheelListeners.add(listener);
  };
  surface.removeEventListener = (name, listener) => {
    assert.equal(name, 'wheel');
    wheelListeners.delete(listener);
  };
  const performanceNodes = Object.fromEntries(
    [
      'wall',
      'wallhead',
      'wall-controls',
      'wall-zoombar',
      'wall-bottom',
      'wall-performance',
      'wall-performance-panel',
      'performance-head',
      'performance-close',
    ].map((name) => [name, new Element()]),
  );
  performanceNodes.wall.clientHeight = 1000;
  performanceNodes.wall.clientWidth = 510;
  for (const [name, value] of Object.entries({
    wallhead: 80,
    'wall-controls': 60,
    'wall-zoombar': 40,
    'wall-bottom': 180,
  }))
    performanceNodes[name].measuredHeight = value;
  performanceNodes['wall-performance-panel'].children = [performanceNodes['performance-head']];
  performanceNodes['performance-head'].children = [performanceNodes['performance-close']];
  const render = () => {
    const tree = renderComponent(module.exports.UiShell, props);
    walk(tree, (n) => n.props?.id === 'wall-surface')[0].props.ref.current = surface;
    for (const node of walk(tree, (n) => !!n.props?.ref)) {
      const name =
        node.props.id ??
        (node.props['aria-label'] === 'Đóng bảng hiệu năng'
          ? 'performance-close'
          : node.props.className?.split(' ')[0]);
      if (performanceNodes[name]) node.props.ref.current = performanceNodes[name];
    }
    return tree;
  };
  const find = (id, tree = render()) => walk(tree, (n) => n.props?.id === id)[0];
  return {
    render,
    find,
    props,
    dimensions,
    surface,
    performanceNodes,
    wheelListeners,
    observers,
    wheel(event) {
      for (const listener of [...wheelListeners]) listener(event);
    },
    document,
    Element,
    window,
    events,
    all: (predicate, tree = render()) => walk(tree, predicate),
    effects: () => {
      for (const effect of pending.splice(0)) effect();
    },
    emit: (key, event) => {
      for (const fn of [...(events.get(key) ?? [])]) fn(event);
    },
    emptyPanel(properties) {
      return shared.exports.EmptyPanel(properties);
    },
    setupPage(properties = {}) {
      return renderComponent(work.exports.SetupPage, {
        snapshot: fixture,
        selectedDeviceId: '',
        selectedWorkflowId: '',
        onUnavailable() {},
        onFocusDevice() {},
        ...properties,
      });
    },
    localModal(properties) {
      return renderComponent(shared.exports.UiModal, properties);
    },
    modal() {
      const node = walk(
        render(),
        (n) => typeof n.type === 'function' && n.type.name === 'UiModal',
      )[0];
      return node ? renderComponent(node.type, node.props) : null;
    },
    dispose() {
      for (const group of slots.values()) for (const slot of group.values()) slot.cleanup?.();
    },
  };
}
const eligibleFixture = {
  ...fixture,
  devices: fixture.devices.map((row) => ({ ...row, status: 'DEVICE' })),
};
function selectSyntheticFixture(m) {
  m.find('wall-device-picker').props.onClick();
  m.all((n) => n.type === 'input' && n.props.type === 'checkbox')[0].props.onChange();
  m.find('wall-device-picker').props.onClick();
}
test('six actual shell tabs share selected-device context and preserve focus across page navigation', () => {
  const m = mount({ snapshot: eligibleFixture });
  selectSyntheticFixture(m);
  assert.deepEqual(
    m.all((n) => n.type === 'button' && n.props['data-page']).map((n) => n.props['data-page']),
    model.PAGES.map((p) => p.key),
  );
  for (const page of model.PAGES) {
    m.all((n) => n.type === 'button' && n.props['data-page'] === page.key)[0].props.onClick();
    assert.equal(m.find('workspace').props['data-page'], page.key);
  }
  let content = m.find('workspace').props.children;
  content.props.onNavigate('accounts', 'test-1');
  content = m.find('workspace').props.children;
  assert.equal(content.type, 'AccountsPage');
  assert.equal(content.props.selectedDeviceId, 'test-1');
  assert.equal(m.all((n) => n.props?.className?.startsWith('wall-screen')).length, 1);
  content.props.onNavigate('calendar', 'test-1');
  assert.equal(m.find('workspace').props.children.props.selectedDeviceId, 'test-1');
  content.props.onFocusDevice('unknown');
  assert.equal(m.find('workspace').props.children.props.selectedDeviceId, 'test-1');
});
test('nonREADY and untrusted READY snapshots cannot populate shell rows or counters', () => {
  for (const state of [
    { status: 'LOADING' },
    { status: 'ERROR', code: 'UNAVAILABLE' },
    { status: 'UNAVAILABLE', reason: 'NOT_IMPLEMENTED' },
    { status: 'READY', provenance: 'UNTRUSTED' },
  ]) {
    const m = mount({ snapshot: { ...fixture, ...state } });
    const content = m.find('workspace').props.children;
    assert.equal(content.props.snapshot.devices.length, 0);
    assert.equal(content.props.snapshot.jobs.length, 0);
    m.find('wall-device-picker').props.onClick();
    assert.equal(m.all((n) => n.props?.className === 'wall-choice').length, 0);
  }
});
test('performance expands an attached compact panel without global modal or shell inertness', () => {
  const m = mount();
  m.find('wall-performance').props.onClick();
  assert.equal(m.find('wall-performance').props['aria-expanded'], false);
  m.effects();
  assert.equal(m.find('wall-performance').props['aria-expanded'], true);
  assert.equal(m.find('shell').props.inert, false);
  assert.equal(m.modal(), null);
  assert.equal(m.all((n) => n.props?.className === 'performance-panel').length, 1);
  m.all((n) => n.props?.['aria-label'] === 'Đóng bảng hiệu năng')[0].props.onClick();
  assert.equal(m.all((n) => n.props?.className === 'performance-panel').length, 0);
});
test('settings modal closes by button/Escape and restores prior focus; Tab remains inside dialog', () => {
  const m = mount();
  const prior = new m.Element();
  prior.focus();
  m.find('open-help').props.onClick();
  assert.equal(m.find('shell').props.inert, true);
  const modal = m.modal();
  const panel = m.all((n) => n.props?.role === 'dialog', modal)[0];
  const first = new m.Element(),
    last = new m.Element();
  panel.props.ref.current = new m.Element();
  panel.props.ref.current.first = first;
  panel.props.ref.current.items = [first, last];
  m.effects();
  assert.equal(m.document.activeElement, first);
  let prevented = 0;
  last.focus();
  m.emit('keydown', {
    key: 'Tab',
    shiftKey: false,
    preventDefault() {
      prevented++;
    },
  });
  assert.equal(m.document.activeElement, first);
  assert.equal(prevented, 1);
  m.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(m.find('shell').props.inert, false);
  m.dispose();
  assert.equal(m.document.activeElement, prior);
  const next = mount();
  next.find('help-top').props.onClick();
  next.find('dialog-close', next.modal()).props.onClick();
  assert.equal(next.modal(), null);
});
test('device dropdown filters synthetic rows, closes with Escape, and restores picker focus', () => {
  const m = mount({ snapshot: fixture });
  const button = m.find('wall-device-picker');
  const el = new m.Element();
  button.props.ref.current = el;
  button.props.onClick();
  m.render();
  m.effects();
  assert.ok(m.find('wall-dropdown'));
  assert.equal(m.all((n) => n.props?.className === 'wall-choice').length, 1);
  m.find('wall-search').props.onChange({ currentTarget: { value: 'no match' } });
  assert.equal(m.all((n) => n.props?.className === 'wall-choice').length, 0);
  m.emit('keydown', { key: 'Escape' });
  assert.equal(m.find('wall-dropdown'), undefined);
  assert.equal(m.document.activeElement, el);
  m.dispose();
});
test('dock commits once; local zoom, cancellation and viewport changes never persist', () => {
  const m = mount();
  const target = { setPointerCapture() {}, releasePointerCapture() {} };
  const drag = m.find('wall-resizer').props;
  drag.onPointerDown({ pointerId: 1, currentTarget: target });
  drag.onPointerMove({ clientX: 1000 });
  drag.onPointerMove({ clientX: 899.75 });
  assert.equal(m.dimensions.length, 0);
  drag.onPointerUp({ pointerId: 1, currentTarget: target });
  drag.onPointerUp({ pointerId: 1, currentTarget: target });
  assert.deepEqual(m.dimensions, [[700, 150]]);
  const range = m.find('wall-size').props;
  range.onChange({ currentTarget: { value: '210' } });
  assert.equal(m.dimensions.length, 1);
  range.onPointerUp({ currentTarget: { value: '210' } });
  assert.equal(m.dimensions.length, 1);
  assert.equal(m.find('wall-size').props.value, 210);
  const before = m.dimensions.length;
  m.window.innerWidth = 1000;
  m.emit('resize', {});
  m.render();
  assert.equal(m.dimensions.length, before);
  const again = m.find('wall-resizer').props;
  again.onPointerDown({ pointerId: 2, currentTarget: target });
  again.onPointerMove({ clientX: 600 });
  again.onPointerCancel();
  again.onPointerUp({ pointerId: 2, currentTarget: target });
  assert.equal(m.dimensions.length, before);
});
test('unavailable domain actions open truthful information, while unready settings controls cannot persist', () => {
  const m = mount({ ready: false });
  assert.equal(m.find('theme-toggle').props.disabled, true);
  m.find('wall-fit').props.onClick();
  assert.equal(m.dimensions.length, 0);
  m.find('workspace').props.children.props.onUnavailable('scan');
  const modal = m.modal();
  assert.ok(modal);
  assert.equal(m.find('shell').props.inert, true);
  assert.match(JSON.stringify(modal), /UNAVAILABLE/);
});

test('native Ctrl wheel accumulates locally without settings IPC; ordinary scroll untouched', () => {
  const m = mount({ pending: true, reconcile: true });
  m.render();
  m.effects();
  assert.equal(m.find('wall-size').props.disabled, false);
  assert.equal(m.wheelListeners.size, 1);
  assert.equal(m.find('wall-surface').props.onWheel, undefined);
  let prevented = 0,
    stopped = 0;
  const event = {
    ctrlKey: true,
    deltaY: -1,
    target: m.surface,
    preventDefault() {
      prevented++;
    },
    stopPropagation() {
      stopped++;
    },
  };
  m.wheel({ ...event, ctrlKey: false });
  assert.equal(prevented, 0);
  for (let i = 0; i < 5; i++) m.wheel(event);
  assert.equal(m.find('wall-size').props.value, 210);
  m.wheel({ ...event, deltaY: 0 });
  assert.equal(m.find('wall-size').props.value, 210);
  assert.equal(prevented, 6);
  assert.equal(stopped, 6);
  assert.deepEqual(m.dimensions, []);
  m.dispose();
  assert.equal(m.wheelListeners.size, 0);
  m.wheel(event);
  assert.equal(prevented, 6);
});

test('local zoom focus, overlay, editable, and viewport fences preserve unavailable tiles', () => {
  const m = mount({ snapshot: fixture });
  selectSyntheticFixture(m);
  m.render();
  m.effects();
  const event = {
    ctrlKey: true,
    deltaY: -1,
    target: m.surface,
    preventDefault() {},
    stopPropagation() {},
  };
  m.document.focused = false;
  m.wheel(event);
  m.document.focused = true;
  m.document.hidden = true;
  m.wheel(event);
  m.document.hidden = false;
  m.document.activeDialog = {};
  m.wheel(event);
  m.document.activeDialog = null;
  const editable = new m.Element();
  editable.closest = () => ({});
  m.wheel({ ...event, target: editable });
  assert.equal(m.find('wall-size').props.value, 150);
  // Owned phone button/descendants are eligible, not generic excluded controls.
  m.wheel({ ...event, target: new m.Element() });
  assert.equal(m.find('wall-size').props.value, 162);
  m.surface.clientWidth = 120;
  m.emit('resize', {});
  assert.equal(m.find('wall-size').props.value, 96);
  m.find('wall-size').props.onChange({ currentTarget: { value: '520' } });
  assert.equal(m.find('wall-size').props.value, 96);
  m.props.tileWidth = 400;
  m.render();
  m.effects();
  assert.equal(m.find('wall-size').props.value, 96);
  const shell = m.find('shell');
  assert.equal(shell.props.style['--screenW'], '150px');
  assert.equal(shell.props.style['--tileW'], '96px');
  assert.equal(shell.props.style['--tileH'], '208px');
  assert.match(JSON.stringify(m.find('screens-grid')), /UNAVAILABLE · không có stream/);
  assert.equal(m.all((n) => n.props?.className === 'tile-footprint').length, 1);
  assert.deepEqual(m.dimensions, []);
});

test('local width survives unrelated preferences/theme, but stored baseline resets it and dock saves only stored width', () => {
  const m = mount();
  m.render();
  m.effects();
  m.find('wall-size').props.onChange({ currentTarget: { value: '210' } });
  m.props.pending = true;
  m.props.theme = 'DARK';
  m.render();
  m.effects();
  m.props.pending = false;
  m.render();
  m.effects();
  assert.equal(m.find('wall-size').props.value, 210);
  m.find('wall-reset').props.onClick();
  assert.deepEqual(m.dimensions, [[null, 150]]);
  m.props.tileWidth = 180;
  m.render();
  m.effects();
  assert.equal(m.find('wall-size').props.value, 180);
});

test('workflow catalogue selection enters setup with shared context and rejects unknown identifiers', () => {
  const m = mount({ snapshot: eligibleFixture });
  selectSyntheticFixture(m);
  m.find('workspace').props.children.props.onNavigate('workflows', 'test-1');
  let content = m.find('workspace').props.children;
  assert.equal(content.type, 'WorkflowsPage');
  content.props.onChooseWorkflow('unknown-workflow');
  assert.equal(m.find('workspace').props.children.type, 'WorkflowsPage');
  assert.equal(m.find('workspace').props.children.props.selectedWorkflowId, '');
  content.props.onChooseWorkflow('fb-page-video');
  content = m.find('workspace').props.children;
  assert.equal(content.type, 'SetupPage');
  assert.equal(content.props.selectedWorkflowId, 'fb-page-video');
  assert.equal(content.props.selectedDeviceId, 'test-1');
  content.props.onNavigate('overview');
  m.find('workspace').props.children.props.onNavigate('setup');
  content = m.find('workspace').props.children;
  assert.equal(content.props.selectedWorkflowId, 'fb-page-video');
  content.props.onChooseWorkflow('unknown-workflow');
  assert.equal(m.find('workspace').props.children.props.selectedWorkflowId, 'fb-page-video');
  assert.equal(m.dimensions.length, 0);
});

test('global help shortcut does not stack over an actual local shared modal and resumes after close', () => {
  const m = mount();
  m.render();
  m.effects();
  let closes = 0;
  const local = m.localModal({
    title: 'Local setup configuration',
    children: 'Synthetic draft',
    onClose() {
      closes++;
    },
  });
  const localPanel = m.all((n) => n.props?.role === 'dialog', local)[0];
  assert.ok(localPanel);
  m.document.activeDialog = new m.Element();
  let prevented = 0;
  m.emit('keydown', {
    key: '?',
    target: new m.Element(),
    preventDefault() {
      prevented++;
    },
  });
  assert.equal(m.modal(), null);
  assert.equal(m.find('shell').props.inert, false);
  assert.equal(prevented, 0);
  m.find('dialog-close', local).props.onClick();
  assert.equal(closes, 1);
  m.document.activeDialog = null;
  m.emit('keydown', {
    key: '?',
    target: new m.Element(),
    preventDefault() {
      prevented++;
    },
  });
  assert.ok(m.modal());
  assert.equal(m.find('shell').props.inert, true);
  assert.equal(prevented, 1);
  m.dispose();
});

test('all-phone context clears active device while retaining selected dock devices without persistence', () => {
  const m = mount({ snapshot: eligibleFixture });
  selectSyntheticFixture(m);
  m.find('workspace').props.children.props.onNavigate('calendar', 'test-1');
  let content = m.find('workspace').props.children;
  assert.equal(content.props.selectedDeviceId, 'test-1');
  assert.equal(m.all((n) => n.props?.className?.startsWith('wall-screen')).length, 1);
  m.find('workspace').props.children.props.onFocusDevice('');
  content = m.find('workspace').props.children;
  assert.equal(content.type, 'CalendarPage');
  assert.equal(content.props.selectedDeviceId, '');
  assert.equal(m.all((n) => n.props?.className?.startsWith('wall-screen')).length, 1);
  assert.match(
    m.all((n) => n.props?.title === 'Lưới điện thoại đã chọn')[0].props.className,
    /active/,
  );
  m.find('wall-device-picker').props.onClick();
  assert.equal(
    m.all((n) => n.type === 'input' && n.props.type === 'checkbox')[0].props.checked,
    true,
  );
  assert.equal(m.dimensions.length, 0);
});

test('quick toolbar preserves the reference nine-icon order and labels while every command stays unavailable', () => {
  const expected = [
    ['home', 'Home'],
    ['arrow-left', 'Back'],
    ['square-stack', 'Ứng dụng gần đây'],
    ['eraser', 'Xóa nhập liệu'],
    ['layers', 'Xóa nền / dừng app nền'],
    ['camera', 'Chụp màn hình'],
    ['refresh', 'Làm mới màn hình'],
    ['power', 'Màn hình nguồn'],
    ['terminal', 'Lệnh ADB'],
  ];
  const m = mount();
  const commands = m.all(
    (n) => n.props?.className === 'quick-btn' && n.props.action === 'device-input',
  );
  assert.equal(commands.length, expected.length);
  for (const [index, [icon, label]] of expected.entries()) {
    assert.equal(commands[index].props.icon, icon);
    assert.equal(commands[index].props.title, `${label} — chưa khả dụng`);
    commands[index].props.onUnavailable(commands[index].props.action);
    assert.ok(m.modal());
    assert.equal(m.dimensions.length, 0);
    m.find('dialog-close', m.modal()).props.onClick();
  }
});

test('production empty-state markup has its scoped spacing class and retains truthful status text', () => {
  const m = mount();
  for (const status of ['UNAVAILABLE', 'LOADING', 'ERROR']) {
    const panel = m.emptyPanel({
      status,
      title: 'Chưa có dữ liệu',
      detail: 'Không có nguồn thiết bị đã xác minh.',
    });
    assert.equal(panel.props.className, 'empty production-empty');
    assert.equal(panel.props.role, 'status');
    assert.equal(m.all((n) => n.type === 'strong', panel).length, 1);
    assert.equal(
      m.all((n) => n.type === 'p', panel)[0].props.children,
      'Không có nguồn thiết bị đã xác minh.',
    );
    const title = m.all((n) => n.type === 'strong', panel)[0].props.children;
    assert.equal(
      title,
      status === 'LOADING'
        ? 'Đang tải…'
        : status === 'ERROR'
          ? 'Không thể tải dữ liệu'
          : 'Chưa có dữ liệu',
    );
  }
});
test('main-observed selection and active focus await confirmed props without implicit broadcast or demo-state mutation', () => {
  const requests = [];
  const empty = { selectedDeviceIds: [], activeDeviceId: null, groups: [] };
  const m = mount({
    snapshot: { ...eligibleFixture, provenance: 'MAIN_OBSERVED' },
    selection: empty,
    onSelection: (selection) => requests.push(selection),
    selectionPending: false,
    selectionBlocked: false,
  });
  m.find('wall-device-picker').props.onClick();
  const checkbox = m.all((n) => n.type === 'input' && n.props.type === 'checkbox')[0];
  checkbox.props.onChange();
  assert.equal(requests.length, 1);
  assert.equal(
    m.all((n) => n.type === 'input' && n.props.type === 'checkbox')[0].props.checked,
    false,
  );
  m.props.selection = { ...empty, selectedDeviceIds: ['test-1'] };
  assert.equal(
    m.all((n) => n.type === 'input' && n.props.type === 'checkbox')[0].props.checked,
    true,
  );
  m.find('wall-device-picker').props.onClick();
  m.find('workspace').props.children.props.onFocusDevice('test-1');
  assert.equal(m.find('workspace').props.children.props.selectedDeviceId, '');
  assert.deepEqual(Array.from(requests[1].selectedDeviceIds), ['test-1']);
  assert.equal(requests[1].activeDeviceId, 'test-1');
  m.props.selection = { ...empty, selectedDeviceIds: [], activeDeviceId: 'test-1' };
  assert.equal(m.find('workspace').props.children.props.selectedDeviceId, 'test-1');
  assert.equal(m.all((n) => n.props?.className?.startsWith('wall-screen')).length, 1);
  m.props.selectionBlocked = true;
  m.find('workspace').props.children.props.onFocusDevice('');
  assert.equal(requests.length, 2);
  assert.equal(m.find('workspace').props.children.props.selectedDeviceId, 'test-1');
});

test('Help describes bounded verified retained-launch recovery without obsolete P110 denial', () => {
  const m = mount();
  m.find('open-help').props.onClick();
  const notice = m.all((n) => n.props?.className === 'notice')[0];
  const text = [notice.props.children].flat(Infinity).join('');
  assert.match(text, /xác minh đúng lần chạy đã kết thúc/);
  assert.match(text, /khóa không rõ nguồn gốc bị từ chối/);
  assert.match(text, /Không tự xóa khóa hay đặt lại khóa mã hóa/);
  assert.doesNotMatch(text, /chưa có lệnh|Handoff P1-10/);
});

test('observer reclamps actual dock footprint and single/all grids use the fixed scaled canvas', () => {
  const m = mount();
  m.render();
  m.effects();
  assert.equal(m.observers.length, 1);
  const observer = m.observers[0];
  assert.equal(observer.target, m.surface);
  m.find('wall-size').props.onChange({ currentTarget: { value: '400' } });
  m.surface.clientWidth = 200;
  observer.callback();
  assert.equal(m.find('wall-size').props.value, 176);
  m.surface.clientWidth = 80;
  observer.callback();
  assert.equal(m.find('wall-size').props.value, 70);
  m.dispose();
  assert.equal(observer.disconnected, true);
  m.surface.clientWidth = 600;
  observer.callback();
  assert.equal(m.find('wall-size').props.value, 70);
  assert.deepEqual(m.dimensions, []);
  const css = readFileSync(new URL('../assets/v9.css', import.meta.url), 'utf8');
  assert.match(css, /\.screens-grid\.single\{grid-template-columns:var\(--tileW,150px\)\}/);
  assert.match(css, /\.tile-footprint\{width:var\(--tileW,150px\);height:var\(--tileH,325px\)/);
  assert.match(css, /--screenW:150px;width:150px;height:325px;padding:0;border:0/);
  assert.match(css, /transform:scale\(var\(--tileScale,1\)\);transform-origin:top left/);
});

// Actual transformed UiShell with labelled synthetic Fleet props, not native/rendered proof.
function focusFixture() {
  const snapshot = {
    ...fixture,
    provenance: 'MAIN_OBSERVED',
    devices: ['a', 'b', 'c'].map((id, index) => ({
      ...fixture.devices[0],
      id,
      name: `Synthetic ${id}`,
      generation: index + 1,
      status: 'DEVICE',
    })),
  };
  const requests = [];
  const m = mount({
    snapshot,
    selection: { selectedDeviceIds: ['a', 'b'], activeDeviceId: 'a', groups: [] },
    onSelection: (next) => requests.push(next),
    selectionPending: false,
    selectionBlocked: false,
  });
  m.render();
  m.effects();
  const tiles = () => m.all((node) => node.props?.className?.startsWith('wall-screen'));
  const focus = (id) => m.find('workspace').props.children.props.onFocusDevice(id);
  const grid = () =>
    m
      .all((node) => node.type === 'button' && node.props.title?.includes('Lưới'))[0]
      .props.onClick();
  return { m, requests, tiles, focus, grid };
}
test('visual tuple focus is independent of delayed denied ACTIVE and selected grid', () => {
  const { m, requests, tiles, focus, grid } = focusFixture();
  assert.equal(tiles().length, 2);
  const b = tiles()[1];
  b.props.onClick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].activeDeviceId, 'b');
  m.props.selectionPending = true;
  b.props.onDoubleClick();
  assert.equal(requests.length, 1);
  assert.equal(tiles().length, 1);
  assert.match(JSON.stringify(tiles()[0]), /Synthetic b/);
  assert.doesNotMatch(tiles()[0].props.className, /active/);
  assert.equal(m.find('workspace').props.children.props.selectedDeviceId, 'a');
  m.props.selectionPending = false;
  focus('c');
  assert.equal(requests.length, 2);
  assert.deepEqual(Array.from(requests[1].selectedDeviceIds), ['a', 'b']);
  assert.match(JSON.stringify(tiles()[0]), /Synthetic c/);
  m.props.selection = { selectedDeviceIds: [], activeDeviceId: 'b', groups: [] };
  assert.match(JSON.stringify(tiles()[0]), /Synthetic c/);
  assert.equal(m.find('workspace').props.children.props.selectedDeviceId, 'b');
  grid();
  assert.equal(tiles().length, 0);
  assert.deepEqual(m.dimensions, []);
});
test('focus record is idempotent and restores current-clamped manual baseline without target restoration', () => {
  const { m, focus, tiles, grid, requests } = focusFixture();
  m.find('wall-size').props.onChange({ currentTarget: { value: '210' } });
  focus('a');
  assert.equal(m.find('wall-size').props.value, 265);
  m.find('wall-size').props.onChange({ currentTarget: { value: '230' } });
  focus('a');
  assert.equal(m.find('wall-size').props.value, 230);
  focus('b');
  m.props.tileWidth = 190;
  m.render();
  m.effects();
  m.props.selection = { selectedDeviceIds: ['b'], activeDeviceId: 'c', groups: [] };
  const before = requests.length;
  tiles()[0].props.onDoubleClick();
  assert.equal(requests.length, before);
  assert.equal(m.find('wall-size').props.value, 190);
  assert.equal(tiles().length, 1);
  assert.match(JSON.stringify(tiles()[0]), /Synthetic b/);
  focus('a');
  m.surface.clientWidth = 160;
  m.observers[0].callback();
  grid();
  assert.equal(m.find('wall-size').props.value, 136);
  assert.equal(m.find('workspace').props.children.props.selectedDeviceId, 'c');
  assert.deepEqual(m.dimensions, []);
});
test('persistent fit recomputes on resize but manual zoom only clamps and saved fit recomputes on exit', () => {
  const { m, focus, grid } = focusFixture();
  m.find('wall-fit').props.onClick();
  assert.equal(m.find('wall-size').props.value, 120);
  m.surface.clientWidth = 300;
  m.observers[0].callback();
  assert.equal(m.find('wall-size').props.value, 137);
  focus('a');
  assert.equal(m.find('wall-size').props.value, 265);
  m.surface.clientHeight = 200;
  m.observers[0].callback();
  assert.equal(m.find('wall-size').props.value, 81);
  m.find('wall-size').props.onChange({ currentTarget: { value: '100' } });
  m.surface.clientHeight = 600;
  m.observers[0].callback();
  assert.equal(m.find('wall-size').props.value, 100);
  m.props.tileWidth = 400;
  m.render();
  m.effects();
  assert.equal(m.find('wall-size').props.value, 100);
  grid();
  assert.equal(m.find('wall-size').props.value, 137);
  assert.deepEqual(m.dimensions, []);
});
test('render-time tuple loss never renders replacement as focused and stale tile handlers cannot revive it', () => {
  for (const change of [
    'generation',
    'missing',
    'OFFLINE',
    'UNAUTHORIZED',
    'DISCONNECTED',
    'UNKNOWN',
    'CONFLICT',
    'notReady',
  ]) {
    const { m, focus, tiles } = focusFixture();
    m.find('wall-size').props.onChange({ currentTarget: { value: '200' } });
    focus('a');
    const old = tiles()[0];
    let devices = m.props.snapshot.devices.map((row) => ({ ...row }));
    if (change === 'generation') devices[0].generation++;
    else if (change === 'missing') devices = devices.slice(1);
    else if (change !== 'notReady') devices[0].status = change;
    m.props.snapshot = {
      ...m.props.snapshot,
      devices,
      ...(change === 'notReady' ? { status: 'UNAVAILABLE' } : {}),
    };
    const tree = m.render();
    assert.doesNotMatch(m.find('screens-grid', tree).props.className, /single/, change);
    old.props.onDoubleClick();
    assert.doesNotMatch(m.find('screens-grid').props.className, /single/, change);
    m.effects();
    assert.equal(m.find('wall-size').props.value, 200, change);
    assert.deepEqual(m.dimensions, []);
  }
});
test('visual focus has no first-row fallback and rejects overlays focus loss invalid generation and disposed handlers', () => {
  const { m, focus, tiles, requests } = focusFixture();
  m.props.selection = { ...m.props.selection, activeDeviceId: null };
  const one = () =>
    m.all((node) => node.type === 'button' && node.props.title === 'Chỉ một điện thoại')[0];
  assert.equal(one().props.disabled, true);
  one().props.onClick();
  assert.doesNotMatch(m.find('screens-grid').props.className, /single/);
  for (const block of ['hidden', 'blur', 'dialog', 'picker']) {
    if (block === 'hidden') m.document.hidden = true;
    if (block === 'blur') m.document.focused = false;
    if (block === 'dialog') m.document.activeDialog = {};
    if (block === 'picker') m.find('wall-device-picker').props.onClick();
    const before = requests.length;
    tiles()[0].props.onDoubleClick();
    assert.doesNotMatch(m.find('screens-grid').props.className, /single/, block);
    assert.equal(requests.length, before);
    if (block === 'picker') m.find('wall-device-picker').props.onClick();
    m.document.hidden = false;
    m.document.focused = true;
    m.document.activeDialog = null;
  }
  for (const generation of [undefined, -0, -1, NaN, Infinity]) {
    m.props.snapshot = {
      ...m.props.snapshot,
      devices: m.props.snapshot.devices.map((row) =>
        row.id === 'a' ? { ...row, generation } : row,
      ),
    };
    focus('a');
    assert.doesNotMatch(m.find('screens-grid').props.className, /single/);
  }
  const stale = tiles()[1].props.onDoubleClick;
  m.dispose();
  stale();
  assert.doesNotMatch(m.find('screens-grid').props.className, /single/);
  assert.deepEqual(m.dimensions, []);
});

function openPerformance(m) {
  m.render();
  m.effects();
  m.performanceNodes['wall-performance'].focus();
  m.find('wall-performance').props.onClick();
  const measuring = m.find('wall-performance-panel');
  assert.equal(measuring.props.inert, true);
  assert.equal(measuring.props['aria-hidden'], true);
  assert.equal(m.find('wall-performance').props['aria-expanded'], false);
  m.effects();
  m.render();
  m.effects();
  return m.find('wall-performance-panel');
}

test('performance panel measures actual owned geometry before presentation and has nonmodal focus semantics', () => {
  const m = mount();
  const panel = openPerformance(m);
  assert.equal(panel.props.style.maxHeight, '450px');
  assert.equal(panel.props.inert, false);
  assert.equal(panel.props['aria-hidden'], undefined);
  assert.equal(m.find('wall-performance').props['aria-controls'], 'wall-performance-panel');
  assert.equal(m.find('wall-performance').props['aria-expanded'], true);
  assert.equal(m.document.activeElement, m.performanceNodes['performance-close']);
  assert.equal(m.find('shell').props.inert, false);
  assert.equal(panel.props['aria-modal'], undefined);
  let prevented = 0,
    stopped = 0;
  const event = {
    target: m.performanceNodes['performance-close'],
    key: 'Tab',
    preventDefault() {
      prevented++;
    },
    stopPropagation() {
      stopped++;
    },
  };
  panel.props.onKeyDown(event);
  assert.deepEqual([prevented, stopped], [0, 0]);
  panel.props.onKeyDown({ ...event, key: 'Escape', target: new m.Element() });
  assert.equal(m.find('wall-performance').props['aria-expanded'], true);
  panel.props.onKeyDown({ ...event, key: 'Escape' });
  assert.deepEqual([prevented, stopped], [1, 1]);
  assert.equal(m.find('wall-performance-panel'), undefined);
  assert.equal(m.document.activeElement, m.performanceNodes['wall-performance']);
});

test('performance sessions cancel measuring and stale callbacks cannot close or focus a later open', () => {
  const m = mount();
  m.render();
  m.effects();
  m.performanceNodes['wall-performance'].focus();
  m.find('wall-performance').props.onClick();
  const pending = m.find('wall-performance-panel');
  const pendingClose = m.all((n) => n.props?.['aria-label'] === 'Đóng bảng hiệu năng')[0];
  m.find('wall-performance').props.onClick();
  m.effects();
  assert.equal(m.find('wall-performance-panel'), undefined);
  const second = openPerformance(m);
  pendingClose.props.onClick();
  pending.props.onKeyDown({
    key: 'Escape',
    target: m.performanceNodes['performance-close'],
    preventDefault() {
      throw Error('stale');
    },
    stopPropagation() {
      throw Error('stale');
    },
  });
  assert.equal(m.find('wall-performance').props['aria-expanded'], true);
  const outside = new m.Element();
  outside.focus();
  m.all((n) => n.props?.['aria-label'] === 'Đóng bảng hiệu năng')[0].props.onClick();
  assert.equal(m.document.activeElement, outside);
  assert.equal(m.find('wall-performance-panel'), undefined);
  second.props.onWheel({
    stopPropagation() {
      throw Error('stale wheel');
    },
  });
});

test('performance delayed initial focus never steals outside focus or focus from hidden unfocused document', () => {
  for (const condition of ['outside', 'hidden', 'blurred']) {
    const m = mount();
    m.render();
    m.effects();
    m.performanceNodes['wall-performance'].focus();
    m.find('wall-performance').props.onClick();
    m.render();
    m.effects();
    const outside = new m.Element();
    if (condition === 'outside') outside.focus();
    if (condition === 'hidden') m.document.hidden = true;
    if (condition === 'blurred') m.document.focused = false;
    const before = m.document.activeElement;
    m.render();
    m.effects();
    assert.equal(m.document.activeElement, before, condition);
    m.document.hidden = false;
    m.document.focused = true;
    m.props.theme = 'DARK';
    m.render();
    m.effects();
    assert.equal(m.document.activeElement, before, 'not replayed');
  }
});

test('performance and picker are exclusive; modal readiness and unmount close without restoration', () => {
  const m = mount({ pending: true, reconcile: true });
  openPerformance(m);
  const oldPicker = m.find('wall-device-picker');
  m.find('wall-device-picker').props.onClick();
  assert.equal(m.find('wall-performance-panel'), undefined);
  assert.equal(m.find('wall-device-picker').props['aria-expanded'], true);
  assert.equal(m.document.activeElement, m.performanceNodes['performance-close']);
  openPerformance(m);
  oldPicker.props.onClick();
  assert.equal(m.find('wall-performance').props['aria-expanded'], true);
  assert.equal(m.find('wall-device-picker').props['aria-expanded'], false);
  m.find('help-top').props.onClick();
  m.render();
  m.effects();
  assert.equal(m.find('wall-performance-panel'), undefined);
  const n = mount();
  openPerformance(n);
  const outside = new n.Element();
  outside.focus();
  n.props.ready = false;
  n.render();
  n.effects();
  assert.equal(n.find('wall-performance-panel'), undefined);
  assert.equal(n.document.activeElement, outside);
  n.props.ready = true;
  n.render();
  n.effects();
  assert.equal(n.find('wall-performance-panel'), undefined);
  openPerformance(n);
  const close = n.all((x) => x.props?.['aria-label'] === 'Đóng bảng hiệu năng')[0];
  n.dispose();
  close.props.onClick();
  assert.equal(n.document.activeElement, n.performanceNodes['performance-close']);
});

test('performance resize reserves fixed sibling heights and rejects invalid or insufficient measurement without reopening', () => {
  const m = mount();
  openPerformance(m);
  const observer = m.observers.find((o) => o.target === m.performanceNodes['wall-bottom']);
  assert.ok(observer);
  m.performanceNodes.wall.clientHeight = 700;
  m.performanceNodes.wallhead.marginBottom = 5;
  observer.callback();
  assert.equal(m.find('wall-performance-panel').props.style.maxHeight, '205px');
  m.window.innerHeight = 400;
  observer.callback();
  assert.equal(m.find('wall-performance-panel').props.style.maxHeight, '180px');
  m.performanceNodes.wall.clientHeight = 500;
  observer.callback();
  m.render();
  m.effects();
  assert.equal(m.find('wall-performance-panel'), undefined);
  assert.equal(m.document.activeElement, m.performanceNodes['wall-performance']);
  m.performanceNodes.wall.clientHeight = 1000;
  observer.callback();
  assert.equal(m.find('wall-performance-panel'), undefined);
  for (const value of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
    const n = mount();
    n.render();
    n.effects();
    n.performanceNodes.wall.clientWidth = value;
    n.find('wall-performance').props.onClick();
    n.render();
    n.effects();
    assert.equal(n.find('wall-performance-panel'), undefined);
  }
});

test('performance wheel containment preserves native default and never reaches wall zoom or settings', () => {
  const m = mount();
  const panel = openPerformance(m);
  const width = m.find('shell').props.style['--tileW'];
  let stopped = 0;
  for (const ctrlKey of [false, true])
    panel.props.onWheel({
      ctrlKey,
      stopPropagation() {
        stopped++;
      },
      preventDefault() {
        throw Error('native default prevented');
      },
    });
  assert.equal(stopped, 2);
  assert.equal(m.find('shell').props.style['--tileW'], width);
  assert.deepEqual(m.dimensions, []);
  const css = readFileSync(new URL('../assets/v9.css', import.meta.url), 'utf8');
  assert.match(css, /\.performance-panel\{[^}]*overscroll-behavior:contain/);
  assert.match(
    css,
    /\.performance-panel\[data-measuring="true"\]\{[^}]*position:absolute[^}]*visibility:hidden[^}]*pointer-events:none/,
  );
  assert.match(
    css,
    /\.wall>\.wallhead,\.wall>\.wall-controls,\.wall>\.wall-zoombar,\.wall>\.wall-bottom\{flex-shrink:0\}/,
  );
});

test('performance unknown sensors and disabled capabilities survive theme and resize without synthetic telemetry', () => {
  const m = mount();
  openPerformance(m);
  const performanceNode = m.all(
    (n) => typeof n.type === 'function' && n.type.name === 'Performance',
  )[0];
  const tree = performanceNode.type(performanceNode.props);
  const serialized = JSON.stringify(tree);
  assert.ok(serialized.includes('UNKNOWN · không có mẫu quan sát'));
  assert.ok(serialized.includes('Yêu cầu / hiệu lực / đề xuất: UNAVAILABLE'));
  assert.equal(
    walk(tree, (n) => ['input', 'select'].includes(n.type) && !n.props.disabled).length,
    0,
  );
  m.props.theme = 'DARK';
  m.render();
  m.effects();
  assert.equal(m.document.documentElement.dataset.theme, 'dark');
  assert.equal(m.find('wall-performance').props['aria-expanded'], true);
  assert.deepEqual(m.dimensions, []);
});

test('actual SetupPage nested UiModal focus closes performance without restoration and fences native panel admission', () => {
  const m = mount();
  openPerformance(m);
  let setup = m.setupPage();
  walk(
    setup,
    (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Bộ nội dung'),
  )[0].props.onClick();
  setup = m.setupPage();
  const nested = walk(setup, (n) => typeof n.type === 'function' && n.type.name === 'UiModal')[0];
  assert.ok(nested);
  const modal = m.localModal(nested.props);
  const dialogNode = walk(modal, (n) => n.props?.role === 'dialog')[0];
  const dialog = new m.Element(),
    close = new m.Element();
  dialog.first = close;
  dialog.children = [close];
  dialogNode.props.ref.current = dialog;
  close.onFocus = () => m.find('shell').props.onFocusCapture({ target: close });
  m.document.activeDialog = dialog;
  m.effects();
  assert.equal(m.document.activeElement, close);
  assert.equal(m.find('wall-performance-panel'), undefined);
  m.find('wall-performance').props.onClick();
  m.render();
  m.effects();
  assert.equal(m.find('wall-performance-panel'), undefined);
  assert.equal(m.document.activeElement, close);
  const n = mount();
  n.render();
  n.effects();
  n.performanceNodes['wall-performance'].focus();
  n.find('wall-performance').props.onClick();
  n.render();
  n.document.activeDialog = new n.Element();
  n.effects();
  assert.equal(n.find('wall-performance-panel'), undefined);
});

test('picker Escape retained before passive cleanup cannot steal performance session focus', () => {
  const m = mount();
  m.render();
  m.effects();
  m.find('wall-device-picker').props.onClick();
  m.render();
  m.effects();
  const retained = [...(m.events.get('keydown') ?? [])];
  const pickerButton = new m.Element();
  m.find('wall-device-picker').props.ref.current = pickerButton;
  let stolen = 0;
  pickerButton.focus = () => {
    stolen++;
  };
  m.performanceNodes['wall-performance'].focus();
  m.find('wall-performance').props.onClick();
  for (const callback of retained) callback({ key: 'Escape' });
  assert.equal(stolen, 0);
  assert.equal(m.document.activeElement, m.performanceNodes['wall-performance']);
  m.render();
  m.effects();
  m.render();
  m.effects();
  assert.equal(m.document.activeElement, m.performanceNodes['performance-close']);
  for (const callback of retained) callback({ key: 'Escape' });
  assert.equal(stolen, 0);
  assert.equal(m.find('wall-performance').props['aria-expanded'], true);
  const css = readFileSync(new URL('../assets/v9.css', import.meta.url), 'utf8');
  assert.match(css, /\.performance-panel \.performance-head\{position:sticky;top:0;/);
  assert.doesNotMatch(css, /\.performance-panel \.performance-head\{[^}]*top:-/);
});

test('host read content stays in explicit performance session and close requests cancellation once', () => {
  let cancels = 0;
  const child = { type: 'section', props: { id: 'synthetic-host-read' } };
  const m = mount({
    hostResources: child,
    onHostResourcesClose: () => {
      cancels++;
    },
  });
  m.render();
  m.effects();
  assert.equal(cancels, 0);
  openPerformance(m);
  const node = m.all((n) => typeof n.type === 'function' && n.type.name === 'Performance')[0];
  assert.equal(node.props.hostResources, child);
  const content = node.type(node.props);
  assert.equal(walk(content, (n) => n.props?.id === 'synthetic-host-read').length, 1);
  const text = JSON.stringify(content);
  assert.ok(text.includes('UNKNOWN · không có mẫu quan sát'));
  assert.ok(text.includes('GPU'));
  const close = m.all((n) => n.props?.['aria-label'] === 'Đóng bảng hiệu năng')[0];
  close.props.onClick();
  close.props.onClick();
  assert.equal(cancels, 1);
});

test('host Read belongs to the live measured panel session and stale close reopen handlers cannot sample', () => {
  let reads = 0;
  const m = mount({
    hostResources: { type: 'section', props: { id: 'host-history' } },
    onHostResourcesRead() {
      reads++;
    },
  });
  openPerformance(m);
  const oldRead = m.find('host-resources-read').props.onClick;
  oldRead();
  assert.equal(reads, 1);
  m.all((n) => n.props?.['aria-label'] === 'Đóng bảng hiệu năng')[0].props.onClick();
  oldRead();
  assert.equal(reads, 1);
  openPerformance(m);
  oldRead();
  assert.equal(reads, 1);
  const currentRead = m.find('host-resources-read').props.onClick;
  currentRead();
  assert.equal(reads, 2);
  m.document.hidden = true;
  currentRead();
  assert.equal(reads, 2);
  m.document.hidden = false;
  const query = m.document.querySelector;
  m.document.querySelector = () => ({ role: 'dialog' });
  currentRead();
  assert.equal(reads, 2);
  m.document.querySelector = query;
  m.props.hostResourcesReadDisabled = true;
  m.render();
  currentRead();
  assert.equal(reads, 2);
  m.props.hostResourcesReadDisabled = false;
  m.props.ready = false;
  m.render();
  currentRead();
  assert.equal(reads, 2);
  m.dispose();
  currentRead();
  assert.equal(reads, 2);
});
test('explicit video controls are siblings of ACTIVE tile and old Start Stop handlers cannot retarget', () => {
  let starts = 0,
    stops = 0;
  const m = mount({
    snapshot: eligibleFixture,
    selection: { selectedDeviceIds: ['test-1'], activeDeviceId: null },
    video: {
      view: { deviceId: 'test-1', generation: 0, state: 'STARTING' },
      available: true,
      canStart: () => true,
      onStart: () => starts++,
      onStop: () => stops++,
      canvasRef() {},
    },
  });
  m.render();
  m.effects();
  const tree = m.render();
  const start = m.all((n) => n.props?.['aria-label'] === 'Start video Synthetic phone', tree)[0];
  const stop = m.all((n) => n.props?.['aria-label'] === 'Stop video Synthetic phone', tree)[0];
  assert.ok(start && stop);
  const canvas = m.all((n) => n.type === 'canvas', tree)[0];
  assert.equal(canvas.props.style.flex, '1 1 0');
  assert.equal(canvas.props.style.minHeight, 0);
  assert.equal(canvas.props.style.height, 0);
  assert.equal(canvas.props.style.width, '100%');
  assert.equal(canvas.props.style.objectFit, 'contain');
  const parent = m.all((n) => n.props?.className === 'android-view', tree)[0];
  for (const child of walk(parent, (n) => ['span', 'p', 'small'].includes(n.type)))
    assert.equal(child.props.style.flexShrink, 0);

  assert.equal(starts, 0);
  const tiles = m.all((n) => n.props?.className?.startsWith('wall-screen'), tree);
  assert.equal(walk(tiles[0], (n) => n !== tiles[0] && n.type === 'button').length, 0);
  start.props.onClick();
  assert.equal(starts, 1);
  m.render();
  start.props.onClick();
  stop.props.onClick();
  assert.equal(starts, 1);
  assert.equal(stops, 0);
});
