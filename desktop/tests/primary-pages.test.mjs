import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const code = transformSync(
  readFileSync(new URL('../src/ui/primary-pages.tsx', import.meta.url), 'utf8'),
  { loader: 'tsx', format: 'cjs', jsx: 'automatic' },
).code;
const jsx = (type, props) => (typeof type === 'function' ? type(props) : { type, props });
const shared = {
  UnavailableButton: ({ action, onUnavailable, children, ...props }) =>
    jsx('button', {
      ...props,
      'aria-disabled': true,
      onClick: () => onUnavailable(action),
      children,
    }),
  EmptyPanel: ({ status, detail }) => jsx('section', { 'data-empty': status, children: detail }),
  PageHeader: ({ title, subtitle, actions: buttons }) =>
    jsx('header', { children: [title, subtitle, buttons] }),
  StatCard: ({ label, value = '—', detail }) =>
    jsx('article', { 'data-stat': label, children: [label, value, detail] }),
};
function mount(name, snapshot) {
  let cursor = 0,
    selectedDeviceId = '';
  const focuses = [];
  const slots = [],
    actions = [],
    pages = [];
  const module = { exports: {} };
  runInNewContext(code, {
    module,
    exports: module.exports,
    require(id) {
      if (id === 'react')
        return {
          useState(initial) {
            const n = cursor++;
            if (!(n in slots)) slots[n] = initial;
            return [
              slots[n],
              (value) => {
                slots[n] = typeof value === 'function' ? value(slots[n]) : value;
              },
            ];
          },
        };
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === './ui-shared.tsx') return shared;
      if (id === './ui-model.js') return { UI_EXPORT_ACTION: 'export' };
      throw Error('UNEXPECTED_MODULE');
    },
  });
  const render = () => {
    cursor = 0;
    return module.exports[name]({
      snapshot,
      onUnavailable: (action) => actions.push(action),
      selectedDeviceId,
      onFocusDevice: (id) => {
        selectedDeviceId = id;
        focuses.push(id);
      },
      onNavigate: (page, deviceId) => pages.push({ page, deviceId }),
    });
  };
  return { render, actions, pages, focuses };
}
function nodes(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children)];
}
function text(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(text).join(' ').replace(/\s+/g, ' ');
  if (typeof value !== 'object') return String(value);
  return text(value.props?.children);
}
const empty = (status) => ({
  status,
  reason: 'NOT_IMPLEMENTED',
  devices: [],
  accounts: [],
  media: [],
  jobs: [],
});
const ready = {
  status: 'READY',
  provenance: 'SYNTHETIC_TEST',
  devices: [
    {
      id: 'd1',
      name: 'Synthetic Phone One',
      serial: 'fixture-one',
      status: 'UNAVAILABLE',
      connection: 'UNAVAILABLE',
    },
    {
      id: 'd2',
      name: 'Synthetic Phone Two',
      serial: 'fixture-two',
      status: 'OFFLINE',
      connection: 'UNAVAILABLE',
    },
  ],
  accounts: [
    {
      id: 'a1',
      deviceId: 'd1',
      name: 'Synthetic Account',
      network: 'facebook',
      target: 'Synthetic Target',
      status: 'UNAVAILABLE',
    },
    {
      id: 'a2',
      deviceId: 'd2',
      name: 'Other Account',
      network: 'facebook',
      target: 'Other Target',
      status: 'UNAVAILABLE',
    },
  ],
  media: [],
  jobs: [],
};
const change = (view, id, value) => {
  const node = nodes(view.render()).find((n) => n.props?.id === id);
  assert.ok(node, id);
  node.props.onChange({ currentTarget: { value } });
};

test('all three primary pages preserve sections and explicit empty/loading/error surfaces', () => {
  for (const status of ['UNAVAILABLE', 'LOADING', 'ERROR'])
    for (const name of ['OverviewPage', 'AccountsPage', 'TrackingPage']) {
      const view = mount(name, empty(status)),
        tree = view.render(),
        all = nodes(tree);
      assert.ok(all.some((n) => n.props?.['data-empty'] === status));
      assert.ok(!text(tree).includes('Synthetic'));
      assert.ok(text(tree).includes('—') || name === 'AccountsPage');
      assert.equal(view.actions.length, 0);
    }
  const tracking = text(mount('TrackingPage', empty('UNAVAILABLE')).render());
  for (const label of [
    'Sức khỏe điện thoại',
    'Danh sách tài khoản & tăng trưởng',
    'Chỉ số tài khoản đang chọn',
    'Hiệu quả bài đăng theo bộ lọc',
    'Lịch sử các lần kiểm tra',
    'RECOMMENDATION REACH',
  ])
    assert.ok(tracking.includes(label), label);
});
test('overview scope starts empty, local filter/selection work without domain execution', () => {
  const view = mount('OverviewPage', ready);
  assert.ok(text(view.render()).includes('0 máy đích'));
  const checkbox = nodes(view.render()).find((n) => n.props?.['aria-label'] === 'Chọn d1');
  checkbox.props.onChange({ currentTarget: { checked: true } });
  assert.ok(text(view.render()).includes('1 máy đích'));
  change(view, 'overview-search', 'fixture-two');
  const displayed = nodes(view.render()).filter((n) => n.props?.className === 'device-row');
  assert.equal(displayed.length, 1);
  assert.ok(text(displayed[0]).includes('Synthetic Phone Two'));
  assert.equal(view.actions.length, 0);
});
test('every overview domain control only invokes its typed unavailable information action', () => {
  const view = mount('OverviewPage', empty('UNAVAILABLE'));
  const buttons = nodes(view.render()).filter(
    (n) => n.type === 'button' && n.props['aria-disabled'],
  );
  assert.equal(buttons.length, 13);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(view.actions, [
    'scan',
    'reconnect',
    'app-manager',
    'proxy',
    'device-config',
    'cache',
    'stop-background',
    'network',
    'time',
    'screenshot',
    'files',
    'adb',
    'reboot',
  ]);
});
test('account phone/platform/search filters preserve account/target distinction and unknown status', () => {
  const view = mount('AccountsPage', ready);
  assert.ok(!text(view.render()).includes('Synthetic Account'));
  change(view, 'accounts-phone', 'd1');
  assert.deepEqual(view.focuses, ['d1']);
  const content = text(view.render());
  assert.ok(content.includes('Synthetic Account'));
  assert.ok(content.includes('Synthetic Target'));
  assert.ok(!content.includes('Other Account'));
  assert.ok(content.includes('chưa xác minh'));
  assert.ok(
    nodes(view.render()).some(
      (n) => n.type === 'details' && n.props.className === 'account-targets',
    ),
  );
  change(view, 'accounts-network', 'youtube');
  assert.ok(!text(view.render()).includes('Synthetic Account'));
  change(view, 'accounts-network', 'facebook');
  change(view, 'accounts-search', 'absent');
  assert.ok(!text(view.render()).includes('Synthetic Account'));
  assert.equal(view.actions.length, 0);
});
test('tracking selection resets on dependent changes and never invents metrics or progress', () => {
  const view = mount('TrackingPage', ready);
  change(view, 'tracking-phone', 'd1');
  change(view, 'tracking-account', 'a1');
  let tree = view.render();
  assert.ok(
    nodes(tree).some(
      (n) => n.type === 'article' && n.props.className === 'tracking-account selected',
    ),
  );
  const metrics = nodes(tree).filter((n) => n.props?.className === 'tracking-metric');
  assert.equal(metrics.length, 6);
  for (const metric of metrics) assert.ok(text(metric).includes('—'));
  for (const progress of nodes(tree).filter(
    (n) => n.props?.className === 'tracking-progress-track',
  ))
    assert.equal(progress.props.children, undefined);
  change(view, 'tracking-phone', 'd2');
  tree = view.render();
  assert.ok(
    !nodes(tree).some(
      (n) => n.type === 'article' && n.props.className === 'tracking-account selected',
    ),
  );
  assert.equal(view.actions.length, 0);
});
test('nonready snapshot cannot leak supplied fixture rows and navigations remain local', () => {
  for (const name of ['OverviewPage', 'AccountsPage', 'TrackingPage']) {
    const view = mount(name, { ...ready, status: 'ERROR', code: 'INVALID_RESPONSE' });
    assert.ok(!text(view.render()).includes('Synthetic Phone'));
    assert.ok(!text(view.render()).includes('Synthetic Account'));
  }
  const view = mount('OverviewPage', ready);
  const button = nodes(view.render()).find((n) => n.type === 'button' && text(n) === 'Thiết lập');
  button.props.onClick();
  assert.deepEqual(view.pages, [{ page: 'setup', deviceId: 'd1' }]);
  assert.deepEqual(view.actions, []);
});

test('tracking health navigation carries selected device context without domain effects', () => {
  const view = mount('TrackingPage', ready);
  const row = nodes(view.render()).find(
    (n) => n.type === 'tr' && text(n).includes('Synthetic Phone Two'),
  );
  assert.ok(row);
  for (const button of nodes(row).filter((n) => n.type === 'button')) button.props.onClick();
  assert.deepEqual(view.pages, [
    { page: 'setup', deviceId: 'd2' },
    { page: 'calendar', deviceId: 'd2' },
  ]);
  assert.deepEqual(view.actions, []);
});

test('tracking preserves the reference platform-specific metric catalogue, never fabricated values', () => {
  const expected = {
    facebook: ['Người theo dõi', 'Lượt thích', 'Bình luận', 'Chia sẻ', 'Lượt xem', 'Tiếp cận'],
    instagram: ['Followers', 'Lượt thích', 'Bình luận', 'Chia sẻ', 'Lưu bài', 'Tiếp cận'],
    threads: ['Followers', 'Lượt thích', 'Trả lời', 'Repost', 'Lượt xem'],
    x: ['Followers', 'Lượt thích', 'Trả lời', 'Repost', 'Impressions'],
    shopee: ['Followers shop', 'Lượt xem sản phẩm', 'Yêu thích', 'Lượt thích'],
    zalo: ['Quan tâm / theo dõi', 'Lượt xem', 'Quan tâm', 'Chia sẻ', 'Bình luận'],
    youtube: ['Người đăng ký', 'Lượt xem', 'Lượt thích', 'Bình luận', 'Chia sẻ', 'Giờ xem'],
    telegram: ['Thành viên', 'Lượt xem', 'Reaction', 'Forward', 'Bình luận'],
    tiktok: ['Followers', 'Lượt thích', 'Lượt xem video', 'Bình luận', 'Chia sẻ'],
  };
  const view = mount('TrackingPage', empty('UNAVAILABLE'));
  for (const [network, labels] of Object.entries(expected)) {
    change(view, 'tracking-network', network);
    const metrics = nodes(view.render()).filter((n) => n.props?.className === 'tracking-metric');
    assert.deepEqual(
      metrics.map((n) => text(n)),
      labels.map((label) => `${label} —`),
    );
  }
});

test('tracking fits required account selector into existing filter rows and retains all six health columns', () => {
  const tree = mount('TrackingPage', empty('UNAVAILABLE')).render();
  const all = nodes(tree);
  for (const id of ['tracking-search', 'tracking-account']) {
    const field = all.find(
      (node) =>
        node.props?.className === 'field' && nodes(node).some((child) => child.props?.id === id),
    );
    assert.ok(field, `${id} remains in a compact half-row field`);
    assert.ok(!field.props.className.includes('wide'));
  }
  const table = all.find((node) => node.props?.className === 'health-table tracking-device-health');
  assert.ok(table);
  assert.deepEqual(
    nodes(table)
      .filter((node) => node.type === 'th')
      .map(text),
    ['ĐIỆN THOẠI', 'KẾT NỐI', 'PIN', 'DUNG LƯỢNG TRỐNG', 'TÀI KHOẢN', 'TRẠNG THÁI'],
  );
  assert.deepEqual(
    nodes(table)
      .filter((node) => node.type === 'col')
      .map((node) => node.props.style.width),
    ['28%', '14%', '12%', '18%', '12%', '16%'],
  );
  assert.ok(text(table).includes('Chưa có dữ liệu sức khỏe điện thoại.'));
  assert.equal(nodes(table).find((node) => node.type === 'td').props.colSpan, 6);
});
