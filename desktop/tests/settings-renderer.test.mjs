import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as contract from '../src/settings-contract.ts';
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
function mount(api, width = 1600) {
  let component,
    cursor = 0;
  const slots = [];
  const effects = [],
    cleanups = [],
    events = new Map();
  const hostWindow = {
    innerWidth: width,
    preferences: api,
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
    for (const child of [node.props?.children].flat(Infinity)) {
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
  assert.equal(m.render().props.style.backgroundColor, '#171a21');
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
