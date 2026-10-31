import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as model from '../src/ui/ui-model.ts';
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
    activeElement: null,
    activeDialog: null,
    documentElement: { dataset: {} },
    querySelector(selector) {
      assert.equal(selector, '[role="dialog"]');
      return this.activeDialog;
    },
  };
  class Element {
    focus() {
      document.activeElement = this;
    }
    contains(other) {
      return other === this;
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
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
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
      if (name === './ui-shared.tsx') return shared.exports;
      throw Error('UNKNOWN_WORK_MODULE');
    },
  });
  const module = { exports: {} };
  runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === './ui-model.js') return model;
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
  const render = () => renderComponent(module.exports.UiShell, props);
  const find = (id, tree = render()) => walk(tree, (n) => n.props?.id === id)[0];
  return {
    render,
    find,
    props,
    dimensions,
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
test('six actual shell tabs share selected-device context and preserve focus across page navigation', () => {
  const m = mount({ snapshot: fixture });
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
test('dock drag and zoom commit once on completion; drafts, cancellation and viewport changes never write', () => {
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
  assert.deepEqual(m.dimensions[1], [null, 210]);
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

test('zoom preserves requested responsive default or user width rather than derived viewport clamp', () => {
  for (const requestedDockWidth of [null, 800]) {
    const m = mount({ requestedDockWidth, dockWidth: 490 });
    m.find('wall-size').props.onPointerUp({ currentTarget: { value: '180' } });
    assert.deepEqual(m.dimensions, [[requestedDockWidth, 180]]);
    m.find('wall-surface').props.onWheel({
      ctrlKey: false,
      deltaY: 1,
      preventDefault() {
        throw Error('NORMAL_WHEEL_CAPTURED');
      },
    });
    assert.equal(m.dimensions.length, 1);
    m.find('wall-surface').props.onWheel({ ctrlKey: true, deltaY: -1, preventDefault() {} });
    assert.deepEqual(m.dimensions[1], [requestedDockWidth, 190]);
  }
});

test('workflow catalogue selection enters setup with shared context and rejects unknown identifiers', () => {
  const m = mount({ snapshot: fixture });
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
  const m = mount({ snapshot: fixture });
  m.find('workspace').props.children.props.onNavigate('calendar', 'test-1');
  let content = m.find('workspace').props.children;
  assert.equal(content.props.selectedDeviceId, 'test-1');
  assert.equal(m.all((n) => n.props?.className?.startsWith('wall-screen')).length, 1);
  content.props.onFocusDevice('');
  content = m.find('workspace').props.children;
  assert.equal(content.type, 'CalendarPage');
  assert.equal(content.props.selectedDeviceId, '');
  assert.equal(m.all((n) => n.props?.className?.startsWith('wall-screen')).length, 1);
  assert.match(
    m.all((n) => n.props?.title === 'Lưới toàn bộ điện thoại')[0].props.className,
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
