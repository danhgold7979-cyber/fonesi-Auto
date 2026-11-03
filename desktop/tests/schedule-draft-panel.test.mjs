import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildSync, transformSync } from 'esbuild';
async function load(name) {
  const built = buildSync({
    entryPoints: [fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`
  );
}
const model = await load('ui/schedule-draft-model');
const { evaluateUnboundScheduleGapPreview } = await load('schedule-gap-contract');
const source = readFileSync(new URL('../src/ui/schedule-draft-panel.tsx', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
const jsx = (type, props) => ({ type, props });
function mount(port) {
  let cursor = 0;
  const slots = [],
    effects = [],
    cleanups = new Set();
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[i].value,
        (v) => {
          slots[i].value = typeof v === 'function' ? v(slots[i].value) : v;
        },
      ];
    },
    useRef(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: value };
      return slots[i];
    },
    useEffect(fn, deps) {
      const i = cursor++,
        old = slots[i];
      if (!old?.deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
        const slot = { deps, cleanup: old?.cleanup, effect: true };
        slots[i] = slot;
        effects.push(() => {
          slot.cleanup?.();
          slot.cleanup = fn();
          if (slot.cleanup) cleanups.add(slot.cleanup);
        });
      }
    },
  };
  const module = { exports: {} };
  runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === './schedule-draft-model.js') return model;
      throw Error(name);
    },
  });
  const props = { port, context: 'initial' };
  return {
    props,
    render() {
      cursor = 0;
      let tree = module.exports.ScheduleDraftPanel(props);
      if (effects.length) {
        effects.splice(0).forEach((fn) => {
          fn();
        });
        cursor = 0;
        tree = module.exports.ScheduleDraftPanel(props);
      }
      return tree;
    },
    unmount() {
      cleanups.forEach((fn) => {
        fn();
      });
      cleanups.clear();
    },
    rearm() {
      cleanups.forEach((fn) => {
        fn();
      });
      cleanups.clear();
      for (const slot of slots)
        if (slot?.effect) {
          slot.deps = null;
          slot.cleanup = null;
        }
    },
  };
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((n) => nodes(n, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object') return text(node.props?.children);
  return node == null || typeof node === 'boolean' ? '' : String(node);
}
function button(h, label) {
  const found = nodes(h.render(), (n) => n.type === 'button' && text(n) === label);
  assert.equal(found.length, 1, label);
  return found[0];
}
function field(h, label, value) {
  const found = nodes(h.render(), (n) => n.type === 'input' && n.props['aria-label'] === label);
  assert.equal(found.length, 1, label);
  if (value !== undefined) found[0].props.onChange({ target: { value } });
  return found[0];
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const success = (input) =>
  JSON.stringify({
    version: 1,
    ok: true,
    requestId: 'd1',
    preview: evaluateUnboundScheduleGapPreview(input.schedule, input.request),
  });
function prepare(
  h,
  date = '2024-01-01',
  zone = 'Asia/Ho_Chi_Minh',
  first = '09:00',
  second = '09:29',
) {
  h.render();
  field(h, 'Ngày bắt đầu', date);
  field(h, 'Xem trước đến ngày', date);
  field(h, 'Múi giờ IANA', zone);
  field(h, 'Số video / ngày đăng', '2');
  button(h, 'Xác nhận bỏ các ô giờ').props.onClick();
  field(h, 'Giờ video 1', first);
  field(h, 'Giờ video 2', second);
}
test('explicit UI preview renders actual29/30-minute advisory, UTC and unchanged unsaved intent', async () => {
  const inputs = [],
    h = mount({
      preview: async (i) => {
        inputs.push(i);
        return success(i);
      },
      cancel() {},
    });
  prepare(h);
  assert.equal(inputs.length, 0);
  button(h, 'Xem trước bản nháp').props.onClick();
  await tick();
  let content = text(h.render());
  assert.match(content, /1 cặp dưới 30 phút/);
  assert.match(content, /29 phút/);
  assert.match(content, /2024-01-01T02:00:00.000Z/);
  assert.match(content, /UTC\+07:00/);
  assert.match(content, /chưa lưu · không tạo job/);
  assert.equal(inputs[0].schedule.slots[1].time, '09:29');
  field(h, 'Giờ video 2', '09:30');
  assert.equal(
    nodes(h.render(), (n) => n.props?.['aria-label'] === 'Kết quả bản nháp chưa lưu').length,
    0,
  );
  button(h, 'Xem trước bản nháp').props.onClick();
  await tick();
  content = text(h.render());
  assert.match(content, /0 cặp dưới 30 phút/);
  assert.match(content, /không kiểm tra xung đột/);
  assert.equal(button(h, 'Tự chia khung giờ').props.disabled, true);
  h.unmount();
});
test('actual gap and overlap decisions remain visible and partial preview never claims all clear', async () => {
  const h = mount({ preview: async (i) => success(i), cancel() {} });
  prepare(h, '2024-03-10', 'America/New_York', '02:30', '03:30');
  button(h, 'Xem trước bản nháp').props.onClick();
  await tick();
  assert.match(text(h.render()), /Bỏ qua giờ không tồn tại do DST/);
  assert.match(text(h.render()), /Không có UTC/);
  field(h, 'Ngày bắt đầu', '2024-11-03');
  field(h, 'Xem trước đến ngày', '2024-11-03');
  field(h, 'Giờ video 1', '01:30');
  button(h, 'Xem trước bản nháp').props.onClick();
  await tick();
  assert.match(text(h.render()), /chọn lần sớm hơn đúng một lần/);
  assert.match(text(h.render()), /2024-11-03T05:30:00.000Z/);
  field(h, 'Ngày bắt đầu', '2024-01-01');
  field(h, 'Xem trước đến ngày', '2024-05-31');
  button(h, 'Xem trước bản nháp').props.onClick();
  await tick();
  assert.match(text(h.render()), /Kết quả chưa đầy đủ/);
  assert.match(text(h.render()), /Mốc tiếp theo chưa hiển thị/);
  assert.match(text(h.render()), /128\/128/);
  h.unmount();
});
test('slot reduction stays staged, addition is blank, invalid numeric input stays visible and errors preserve fields', async () => {
  const h = mount(undefined);
  h.render();
  field(h, 'Số video / ngày đăng', '1');
  assert.equal(nodes(h.render(), (n) => n.type === 'input' && n.props.type === 'time').length, 3);
  assert.match(text(h.render()), /12:00/);
  assert.match(text(h.render()), /19:00/);
  button(h, 'Giữ các ô giờ').props.onClick();
  assert.equal(field(h, 'Số video / ngày đăng').props.value, '3');
  field(h, 'Số video / ngày đăng', '4');
  assert.equal(field(h, 'Giờ video 4').props.value, '');
  field(h, 'Chu kỳ đăng (ngày)', '-2');
  button(h, 'Xem trước bản nháp').props.onClick();
  await tick();
  assert.equal(field(h, 'Chu kỳ đăng (ngày)').props.value, '-2');
  assert.match(text(h.render()), /Chưa có kết quả/);
  assert.equal(field(h, 'Giờ video 1').props.value, '08:00');
  h.unmount();
});
test('late responses after edit, cancel, external selection, unmount and effect rearm cannot replace current intent', async () => {
  for (const action of ['edit', 'cancel', 'context', 'unmount', 'rearm']) {
    let resolve,
      input,
      calls = 0;
    const h = mount({
      preview: (i) => {
        input = i;
        calls++;
        return new Promise((r) => {
          resolve = r;
        });
      },
      cancel() {},
    });
    prepare(h);
    button(h, 'Xem trước bản nháp').props.onClick();
    assert.equal(calls, 1);
    assert.equal(button(h, 'Xem trước bản nháp').props.disabled, true);
    if (action === 'edit') field(h, 'Giờ video 1', '08:15');
    if (action === 'cancel') button(h, 'Hủy xem trước').props.onClick();
    if (action === 'context') {
      h.props.context = 'another-device-or-workflow';
      h.render();
    }
    if (action === 'unmount') h.unmount();
    if (action === 'rearm') {
      h.rearm();
      h.render();
    }
    resolve(success(input));
    await tick();
    assert.equal(
      nodes(h.render(), (n) => n.props?.['aria-label'] === 'Kết quả bản nháp chưa lưu').length,
      0,
      action,
    );
    assert.equal(calls, 1);
    h.unmount();
  }
});
test('closed contract validation refuses malformed/mismatched successful response without raw private details', async () => {
  for (const response of [
    () => 'PRIVATE',
    (i) => {
      const r = JSON.parse(success(i));
      r.preview.scope.draftRevision++;
      return JSON.stringify(r);
    },
  ]) {
    const h = mount({ preview: async (i) => response(i), cancel() {} });
    prepare(h);
    button(h, 'Xem trước bản nháp').props.onClick();
    await tick();
    assert.match(text(h.render()), /INTERNAL_FAILURE/);
    assert(!text(h.render()).includes('PRIVATE'));
    assert.equal(field(h, 'Giờ video 2').props.value, '09:29');
    h.unmount();
  }
});
