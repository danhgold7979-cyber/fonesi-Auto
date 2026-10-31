import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { transformSync } from 'esbuild';
const source = (name) => readFileSync(new URL(`../demo/${name}`, import.meta.url), 'utf8');
function mount({ denied = false, width = 1440 } = {}) {
  let component,
    cursor = 0;
  const slots = [],
    effects = [],
    events = new Map(),
    operations = [],
    storage = new Map();
  const hostWindow = {
    innerWidth: width,
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name, fn) => {
      if (events.get(name) === fn) events.delete(name);
    },
  };
  Object.defineProperty(hostWindow, 'localStorage', {
    get() {
      if (denied) throw Error('PRIVATE');
      return {
        getItem: (key) => {
          operations.push(['read', key]);
          return storage.get(key) ?? null;
        },
        setItem: (key, value) => {
          operations.push(['write', key]);
          storage.set(key, value);
        },
        removeItem: (key) => {
          operations.push(['remove', key]);
          storage.delete(key);
        },
      };
    },
  });
  const jsx = (type, props) => ({ type, props });
  const react = {
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
    useEffect(fn, deps) {
      const at = cursor++;
      if (!(at in slots) || deps.some((value, index) => !Object.is(value, slots[at][index]))) {
        slots[at] = [...deps];
        effects.push(fn);
      }
    },
  };
  const context = createContext({
    window: hostWindow,
    document: {
      getElementById: (id) => {
        assert.equal(id, 'root');
        return {};
      },
    },
    TextEncoder,
  });
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const module = { exports: {} };
    context.module = module;
    context.exports = module.exports;
    context.require = (id) => {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === 'react-dom/client')
        return {
          createRoot: () => ({
            render: (value) => {
              component = value.type;
            },
          }),
        };
      if (id === '../src/ui/ui-shell.tsx') return { UiShell: 'UiShell' };
      if (id === './fixtures.js') return cache['fixtures.ts'];
      if (id === './preferences.js') return cache['preferences.ts'];
      throw Error('UNAPPROVED_IMPORT');
    };
    runInContext(
      transformSync(source(name), {
        loader: name.endsWith('tsx') ? 'tsx' : 'ts',
        format: 'cjs',
        jsx: 'automatic',
      }).code,
      context,
    );
    cache[name] = module.exports;
    return module.exports;
  }
  load('fixtures.ts');
  load('preferences.ts');
  load('renderer.tsx');
  const render = () => {
    cursor = 0;
    const tree = component();
    while (effects.length) effects.shift()();
    return tree;
  };
  return { render, operations, storage, events, hostWindow };
}
function nodes(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  return [value, ...nodes(value.props?.children)];
}
function text(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(text).join(' ');
  if (typeof value === 'object') return text(value.props?.children);
  return String(value);
}
const shell = (tree) => nodes(tree).find((node) => node.type === 'UiShell');
test('demo renderer permanently labels bundled synthetic rows outside the reused shell and dialogs', () => {
  const app = mount();
  const tree = app.render();
  const banner = nodes(tree).find((node) => node.props?.id === 'demo-banner');
  assert.ok(text(banner).includes('DEMO — DỮ LIỆU GIẢ LẬP / KHÔNG ĐIỀU KHIỂN THIẾT BỊ'));
  assert.ok(text(banner).includes('DEMO · CHỈ TRONG PHIÊN'));
  assert.equal(banner.props.hidden, undefined);
  const props = shell(tree).props;
  assert.equal(props.snapshot.provenance, 'SYNTHETIC_TEST');
  assert.equal(props.snapshot.media.length, 25);
  assert.equal(props.ready, true);
  assert.equal(props.reconcile, false);
  assert.ok(!nodes(props.settings).some((node) => node.props?.id === 'demo-banner'));
  assert.ok(text(props.settings).includes('Không đọc hoặc ghi'));
  assert.ok(!nodes(tree).find((node) => node.props?.id === 'demo-content').props.inert);
});
test('demo theme/dimensions/reset use only its exact session key and banner remains on changes', () => {
  const app = mount();
  let tree = app.render();
  shell(tree).props.onTheme();
  tree = app.render();
  assert.equal(shell(tree).props.theme, 'DARK');
  shell(tree).props.onDimensions(500, 190);
  tree = app.render();
  assert.equal(shell(tree).props.requestedDockWidth, 500);
  assert.equal(shell(tree).props.tileWidth, 190);
  nodes(shell(tree).props.settings)
    .find((node) => node.props?.id === 'demo-reset-preferences')
    .props.onClick();
  tree = app.render();
  assert.equal(shell(tree).props.theme, 'LIGHT');
  assert.equal(shell(tree).props.tileWidth, 150);
  assert.ok(text(tree).includes('DEMO · CHỈ TRONG PHIÊN'));
  assert.ok(app.operations.length > 1);
  assert.ok(app.operations.every(([, key]) => key === 'fonesi.demo.preferences.v1'));
  assert.equal(app.storage.size, 1);
  assert.ok(!text(tree).includes('PERSISTED'));
});
test('denied storage stays usable in memory with explicit unsaved banner and no production capability', () => {
  const app = mount({ denied: true });
  let tree = app.render();
  assert.ok(text(tree).includes('DEMO · CHƯA LƯU'));
  shell(tree).props.onTheme();
  tree = app.render();
  assert.equal(shell(tree).props.theme, 'DARK');
  assert.ok(text(tree).includes('DEMO · CHƯA LƯU'));
  assert.deepEqual(app.operations, []);
  const code = source('renderer.tsx');
  for (const forbidden of [
    'window.preferences',
    'window.foundation',
    'ipcRenderer',
    'storage.clear',
    'localStorage.clear',
  ])
    assert.ok(!code.includes(forbidden));
});
test('demo viewport clamp is presentation-only and reserved banner remains above modal on narrow widths', () => {
  const app = mount();
  let tree = app.render();
  assert.equal(shell(tree).props.dockWidth, 400);
  shell(tree).props.onDimensions(800, 150);
  app.hostWindow.innerWidth = 600;
  app.events.get('resize')();
  tree = app.render();
  assert.equal(shell(tree).props.dockWidth, 300);
  assert.equal(shell(tree).props.requestedDockWidth, 800);
  const css = source('demo.css');
  assert.match(css, /#demo-banner\{[^}]*position:fixed[^}]*z-index:100000/);
  assert.match(css, /body\{padding-top:var\(--demo-banner-height\)/);
  assert.match(css, /#demo-content \.dialog-shade\{top:var\(--demo-banner-height\)/);
  assert.match(css, /@media\(max-width:600px\)/);
});
