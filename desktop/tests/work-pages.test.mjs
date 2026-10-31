import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as model from '../src/ui/ui-model.ts';
const source = readFileSync(new URL('../src/ui/work-pages.tsx', import.meta.url), 'utf8');
const jsx = (type, props) => ({ type, props });
const shared = {
  UiModal: ({ title, children, onClose }) =>
    jsx('section', {
      role: 'dialog',
      children: [title, children, jsx('button', { children: 'Đóng', onClick: onClose })],
    }),
  Icon: () => jsx('svg', {}),
  SocialIcon: () => jsx('svg', {}),
  UnavailableButton: ({ action, onUnavailable, children, className }) =>
    jsx('button', {
      type: 'button',
      className,
      'aria-disabled': true,
      children,
      onClick: () => onUnavailable(action),
    }),
};
function harness(name, snapshot = model.unavailableSnapshot, props = {}) {
  let at = 0;
  const state = [],
    events = [],
    module = { exports: {} };
  runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    exports: module.exports,
    module,
    require(id) {
      if (id === 'react')
        return {
          useState(initial) {
            const slot = at++;
            if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
            return [
              state[slot],
              (v) => {
                state[slot] = typeof v === 'function' ? v(state[slot]) : v;
              },
            ];
          },
        };
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === './ui-model.js') return model;
      if (id === './ui-shared.tsx') return shared;
      throw Error(`unexpected module ${id}`);
    },
  });
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  return {
    exports: module.exports,
    events,
    render() {
      at = 0;
      return expand(
        module.exports[name]({
          snapshot,
          selectedDeviceId: '',
          selectedWorkflowId: '',
          onChooseWorkflow: (id) => events.push(['workflow', id]),
          onFocusDevice: (id) => events.push(['focus', id]),
          onUnavailable: (action) => events.push(['unavailable', action]),
          onNavigate: (page) => events.push(['navigate', page]),
          ...props,
        }),
      );
    },
  };
}
function nodes(tree, predicate) {
  const out = [];
  function visit(n) {
    if (Array.isArray(n)) {
      n.forEach(visit);
      return;
    }
    if (n && typeof n === 'object') {
      if (predicate(n)) out.push(n);
      visit(n.props?.children);
    }
  }
  visit(tree);
  return out;
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object') return text(node.props?.children);
  return node == null || typeof node === 'boolean' ? '' : String(node);
}
const button = (tree, label) => {
  const found = nodes(tree, (n) => n.type === 'button' && text(n).trim() === label);
  assert.equal(found.length, 1, label);
  return found[0];
};
test('setup preserves four sections and typed unavailable effects without fake media', () => {
  const h = harness('SetupPage'),
    tree = h.render(),
    content = text(tree);
  for (const label of [
    '01 · Chọn điện thoại và tài khoản',
    '02 · Chọn folder & quét media',
    '03 · Caption, hashtag và bình luận 0–10',
    '04 · Số bài/ngày và tần suất đăng',
    'FILE / FOLDER',
    'CAPTION',
    'HASHTAG',
    'GIỜ ĐĂNG',
    'TRẠNG THÁI',
  ])
    assert.ok(content.includes(label), label);
  button(tree, 'Lập lịch hàng loạt').props.onClick();
  assert.deepEqual(h.events, [['unavailable', 'schedule']]);
  assert.equal(nodes(tree, (n) => n.type === 'input' && n.props.type === 'file').length, 0);
  assert.ok(content.includes('Chưa có media phù hợp'));
});
test('setup comment range includes zero and keeps later synthetic rows reachable inside the bounded scroll viewport', () => {
  const media = Array.from({ length: 25 }, (_, i) => ({
    id: `m${i}`,
    name: `synthetic${i}`,
    caption: 'draft',
    hashtag: 'tag',
    comments: [],
    time: '',
  }));
  const h = harness('SetupPage', {
    ...model.unavailableSnapshot,
    status: 'READY',
    provenance: 'SYNTHETIC_TEST',
    media,
  });
  let tree = h.render();
  assert.equal(nodes(tree, (n) => n.type === 'td' && n.props.className === 'filecol').length, 25);
  const input = nodes(
    tree,
    (n) => n.type === 'input' && n.props.min === 0 && n.props.max === 10,
  )[0];
  input.props.onChange({ target: { value: '0' } });
  tree = h.render();
  assert.equal(
    nodes(tree, (n) => n.type === 'th' && n.props.className === 'comment-col').length,
    0,
  );
  nodes(
    tree,
    (n) => n.type === 'input' && n.props.min === 0 && n.props.max === 10,
  )[0].props.onChange({ target: { value: '99' } });
  tree = h.render();
  assert.equal(
    nodes(tree, (n) => n.type === 'th' && n.props.className === 'comment-col').length,
    10,
  );
  assert.equal(nodes(tree, (n) => n.props?.className === 'media-table-scroll').length, 1);
  assert.ok(text(tree).includes('synthetic24'));
  const css = readFileSync(new URL('../assets/v9.css', import.meta.url), 'utf8');
  assert.match(css, /\.media-table-scroll\{overflow:auto;max-height:850px;/);
  assert.match(css, /\.media-table td\{[^}]*height:40px/);
});
test('calendar local day week month navigation retains24h and7/42cells with no fake jobs', () => {
  const h = harness('CalendarPage');
  let tree = h.render();
  assert.equal(nodes(tree, (n) => n.props?.className === 'hour-label').length, 24);
  button(tree, 'Tuần').props.onClick();
  tree = h.render();
  assert.equal(nodes(tree, (n) => String(n.props?.className).startsWith('day-card')).length, 7);
  button(tree, 'Tháng').props.onClick();
  tree = h.render();
  const days = nodes(tree, (n) => String(n.props?.className).startsWith('day-card'));
  assert.equal(days.length, 42);
  days[0].props.onClick();
  tree = h.render();
  assert.equal(nodes(tree, (n) => n.props?.className === 'hour-label').length, 24);
  assert.equal(nodes(tree, (n) => n.props?.className === 'job-block').length, 0);
  button(tree, 'Đề xuất dời các job sát giờ').props.onClick();
  assert.deepEqual(h.events, [['unavailable', 'reschedule']]);
});
test('workflow catalogue retains21labels/nine roots and local interaction subview without seventh route', () => {
  const h = harness('WorkflowsPage');
  let tree = h.render();
  assert.equal(h.exports.WORKFLOW_LABELS.length, 21);
  assert.equal(new Set(h.exports.WORKFLOW_LABELS.map((x) => x.network)).size, 9);
  button(tree, 'Mở tất cả').props.onClick();
  tree = h.render();
  assert.equal(nodes(tree, (n) => n.props?.className === 'tree-leaf').length, 21);
  for (const row of h.exports.WORKFLOW_LABELS) assert.ok(text(tree).includes(row.name));
  button(tree, 'Thu gọn').props.onClick();
  assert.equal(nodes(h.render(), (n) => n.props?.className === 'tree-leaf').length, 0);
  button(h.render(), 'Thiết lập tương tác').props.onClick();
  tree = h.render();
  assert.ok(text(tree).includes('03 · Lịch tác vụ'));
  button(tree, 'Tạo hàng đợi kiểm duyệt').props.onClick();
  assert.deepEqual(h.events, [['unavailable', 'interaction']]);
  button(tree, 'Quay lại quy trình').props.onClick();
  assert.ok(text(h.render()).includes('Quy trình Facebook'));
});
test('loading/error/unavailable retain page structure and source excludes browser-effect/demo handlers', () => {
  for (const page of ['SetupPage', 'CalendarPage'])
    for (const status of ['LOADING', 'ERROR', 'UNAVAILABLE']) {
      const h = harness(page, { ...model.unavailableSnapshot, status, code: 'UNAVAILABLE' });
      assert.ok(nodes(h.render(), (n) => n.props?.className === 'content-card').length > 0);
    }
  for (const forbidden of [
    'localStorage',
    'window.open',
    'navigator.clipboard',
    'dangerouslySetInnerHTML',
    'downloadBlob',
    'createInteractionQueue',
    'commitTable',
    'type="file"',
  ])
    assert.equal(source.includes(forbidden), false, forbidden);
});

test('setup and calendar use shared device focus without cross-device account leakage', () => {
  const snapshot = {
    ...model.unavailableSnapshot,
    status: 'READY',
    provenance: 'SYNTHETIC_TEST',
    devices: [
      { id: 'a', name: 'Synthetic A' },
      { id: 'b', name: 'Synthetic B' },
    ],
    accounts: [
      { id: 'aa', deviceId: 'a', network: 'facebook', name: 'Account A', target: 'Target A' },
      { id: 'bb', deviceId: 'b', network: 'facebook', name: 'Account B', target: 'Target B' },
    ],
  };
  const h = harness('SetupPage', snapshot, { selectedDeviceId: 'a' });
  let tree = h.render();
  assert.ok(text(tree).includes('Account A'));
  assert.equal(text(tree).includes('Account B'), false);
  button(tree, 'Account A').props.onClick();
  tree = h.render();
  assert.ok(text(tree).includes('Target A'));
  const phone = nodes(tree, (n) => n.props?.id === 'setup-phone')[0];
  phone.props.onChange({ target: { value: 'b' } });
  assert.deepEqual(h.events, [['focus', 'b']]);
  tree = h.render();
  assert.equal(text(tree).includes('Target A'), false);
  const calendar = harness('CalendarPage', snapshot, { selectedDeviceId: 'a' });
  const filter = nodes(
    calendar.render(),
    (n) => n.type === 'select' && n.props['aria-label'] === 'Tất cả điện thoại',
  )[0];
  assert.equal(filter.props.value, 'a');
  filter.props.onChange({ target: { value: 'b' } });
  assert.deepEqual(calendar.events, [['focus', 'b']]);
});

test('all work pages remain within the unchanged bounded TSX import grammar', async () => {
  const { sourceImports } = await import('../scripts/check-module-graph.mjs');
  assert.deepEqual(
    (await sourceImports(source, 'tsx')).map((entry) => entry.specifier),
    ['react', './ui-model.js', './ui-model.js', './ui-shared.tsx'],
  );
});

test('local content modal closes and count drafts truncate fractions and reject nonfinite values', () => {
  const h = harness('SetupPage');
  button(h.render(), 'Bộ nội dung').props.onClick();
  assert.equal(nodes(h.render(), (n) => n.props?.role === 'dialog').length, 1);
  button(h.render(), 'Đóng').props.onClick();
  assert.equal(nodes(h.render(), (n) => n.props?.role === 'dialog').length, 0);
  for (const [value, expected] of [
    ['1.5', 1],
    ['Infinity', 0],
    ['NaN', 0],
    ['10', 10],
  ]) {
    nodes(
      h.render(),
      (n) => n.type === 'input' && n.props.min === 0 && n.props.max === 10,
    )[0].props.onChange({ target: { value } });
    assert.equal(
      nodes(h.render(), (n) => n.type === 'th' && n.props.className === 'comment-col').length,
      expected,
    );
  }
});
test('typed synthetic calendar rows filter locally and context never mutates jobs', () => {
  const day = new Date().toISOString().slice(0, 10);
  const jobs = [
    {
      id: 'j1',
      name: 'Synthetic job A',
      deviceId: 'a',
      network: 'facebook',
      accountId: 'aa',
      target: 'Target A',
      time: `${day}T08:00:00Z`,
      status: 'UNAVAILABLE',
    },
    {
      id: 'j2',
      name: 'Synthetic job B',
      deviceId: 'b',
      network: 'youtube',
      accountId: 'bb',
      target: 'Target B',
      time: `${day}T09:00:00Z`,
      status: 'UNAVAILABLE',
    },
  ];
  const snapshot = {
    ...model.unavailableSnapshot,
    status: 'READY',
    provenance: 'SYNTHETIC_TEST',
    jobs,
    accounts: [
      { id: 'aa', deviceId: 'a', network: 'facebook', name: 'Account A', target: 'Target A' },
      { id: 'bb', deviceId: 'b', network: 'youtube', name: 'Account B', target: 'Target B' },
    ],
  };
  const h = harness('CalendarPage', snapshot);
  assert.equal(nodes(h.render(), (n) => n.props?.className?.startsWith('job-block')).length, 2);
  nodes(h.render(), (n) => n.props?.['aria-label'] === 'Tất cả mạng xã hội')[0].props.onChange({
    target: { value: 'facebook' },
  });
  const tree = h.render();
  assert.equal(nodes(tree, (n) => n.props?.className?.startsWith('job-block')).length, 1);
  nodes(tree, (n) => n.props?.className?.startsWith('job-block'))[0].props.onContextMenu({
    preventDefault() {},
  });
  button(h.render(), 'Xóa lịch').props.onClick();
  assert.deepEqual(h.events, [['unavailable', 'delete-job']]);
  assert.equal(jobs.length, 2);
  nodes(h.render(), (n) => n.props?.['aria-label'] === 'Tất cả nick')[0].props.onChange({
    target: { value: 'bb' },
  });
  assert.equal(nodes(h.render(), (n) => n.props?.className?.startsWith('job-block')).length, 0);
});
test('workflow choice carries exact catalogue identity into setup local draft', () => {
  const h = harness('WorkflowsPage');
  button(h.render(), 'Mở tất cả').props.onClick();
  nodes(h.render(), (n) => n.type === 'button' && text(n).trim() === 'Chọn')[0].props.onClick();
  const id = h.events[0][1];
  const setup = harness('SetupPage', model.unavailableSnapshot, { selectedWorkflowId: id });
  assert.equal(nodes(setup.render(), (n) => n.props?.id === 'setup-workflow')[0].props.value, id);
  assert.equal(
    nodes(setup.render(), (n) => n.props?.id === 'setup-network')[0].props.value,
    h.exports.WORKFLOW_LABELS.find((row) => row.id === id).network,
  );
});

test('setup V9 step chips are direct flex children and truthful state stays in the existing caption', () => {
  const tree = harness('SetupPage').render();
  const stepper = nodes(tree, (n) => n.props?.className === 'stepper')[0];
  const children = stepper.props.children.flat(Infinity).filter(Boolean);
  assert.deepEqual(
    Array.from(children, (n) => n.props.className),
    ['step on', 'arr', 'step on', 'arr', 'step on', 'arr', 'step on', 'arr', 'step on'],
  );
  assert.equal(nodes(tree, (n) => n.props?.className === 'notice warn').length, 0);
  const caption = nodes(tree, (n) => n.props?.id === 'work-unavailable')[0];
  assert.ok(text(caption).includes('Bản nháp chưa lưu'));
  assert.ok(text(caption).includes('Chưa triển khai dịch vụ'));
});
test('workflow category bands and subgroup badges match the static catalogue; calendar palette is exact', () => {
  const h = harness('WorkflowsPage');
  button(h.render(), 'Mở tất cả').props.onClick();
  const tree = h.render();
  for (const node of nodes(
    tree,
    (n) => n.type === 'button' && n.props?.className?.startsWith('tree-item'),
  )) {
    assert.equal(node.props.style.width, '100%');
    assert.equal(node.props.style.textAlign, 'left');
  }
  const groups = [
    ...new Set(
      h.exports.WORKFLOW_LABELS.map((row) => `${row.network}|${row.category}|${row.group}`),
    ),
  ];
  for (const group of groups) {
    const [network, category, name] = group.split('|');
    const expected = h.exports.WORKFLOW_LABELS.filter(
      (row) => row.network === network && row.category === category && row.group === name,
    ).length;
    const matching = nodes(
      tree,
      (n) =>
        n.type === 'button' &&
        n.props?.className === 'tree-item' &&
        nodes(n, (c) => c.type === 'span' && text(c) === name).length > 0,
    );
    assert.ok(
      matching.some(
        (n) =>
          nodes(n, (c) => c.props?.className === 'pill' && text(c) === String(expected)).length ===
          1,
      ),
    );
  }
  const calendar = harness('CalendarPage').render();
  assert.deepEqual(
    nodes(calendar, (n) => n.type === 'i').map((n) => n.props.style.background),
    [215, 260, 305, 225, 28, 196, 4, 195, 175].map((hue) => `hsl(${hue} 66% 46%)`),
  );
  assert.equal(nodes(calendar, (n) => n.props?.className === 'timeline calendar-grid').length, 1);
  assert.equal(
    nodes(calendar, (n) => n.props?.className === 'time-label-cell calendar-label').length,
    1,
  );
  assert.equal(nodes(calendar, (n) => n.props?.className === 'notice warn').length, 0);
  assert.ok(text(calendar).includes('Chưa triển khai dịch vụ'));
});
