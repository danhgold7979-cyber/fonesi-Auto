import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verify } from '../scripts/verify-dependencies.mjs';
verify(true, '11.9.0');
const require = createRequire(import.meta.url);
const { buildSync } = require('esbuild');
async function load(name) {
  const compiled = buildSync({
    entryPoints: [fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`
  );
}
const { createScheduleDraftEditor } = await load('ui/schedule-draft-model');
const { createScheduleDraftClient } = await load('schedule-draft-client');
const { installScheduleDraftBridge } = await load('schedule-draft-bridge');
const { evaluateUnboundScheduleGapPreview } = await load('schedule-gap-contract');
let nextId = 0;
const id = () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;
const editor = (port) => createScheduleDraftEditor(port, id);
const failure = (code) => JSON.stringify({ version: 1, ok: false, requestId: null, code });
const success = (input) =>
  JSON.stringify({
    version: 1,
    ok: true,
    requestId: 'd1',
    preview: evaluateUnboundScheduleGapPreview(input.schedule, input.request),
  });
const tick = () => new Promise((r) => setImmediate(r));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function dates(e, date = '2024-01-01', through = date) {
  e.setField('startDate', date);
  e.setField('throughDate', through);
}
function times(e, values) {
  e.setCount(String(values.length));
  e.confirmRemoval();
  values.forEach((time, i) => {
    e.setTime(e.snapshot().slots[i].id, time);
  });
}
function actual() {
  let handler,
    calls = 0,
    released = 0;
  const bridge = installScheduleDraftBridge(
    {
      handle: (_channel, cb) => {
        handler = cb;
      },
      removeHandler() {},
    },
    () => ({
      ok: true,
      current: () => true,
      release: () => {
        released++;
      },
    }),
  );
  const client = createScheduleDraftClient(async (wire) => {
    calls++;
    return handler({}, wire);
  });
  return {
    e: editor(client),
    client,
    calls: () => calls,
    released: () => released,
    close() {
      client.dispose();
      bridge.dispose();
    },
  };
}
test('blank dates, immutable explicit defaults, fresh UUIDs and no automatic preview', () => {
  let calls = 0;
  const e = editor({
    preview: async () => {
      calls++;
      return '';
    },
    cancel() {},
  });
  const s = e.snapshot();
  assert.deepEqual(
    [s.startDate, s.throughDate, s.posts, s.every, s.zone],
    ['', '', '3', '1', 'Asia/Ho_Chi_Minh'],
  );
  assert.deepEqual(
    s.slots.map((x) => x.time),
    ['08:00', '12:00', '19:00'],
  );
  assert(Object.isFrozen(s));
  assert(Object.isFrozen(s.slots));
  assert(Object.isFrozen(s.slots[0]));
  assert.throws(() => {
    s.slots[0].time = '10:00';
  }, TypeError);
  dates(e);
  e.contextChanged();
  e.cancel();
  assert.equal(calls, 0);
  const another = editor();
  assert.notEqual(s.draftId, another.snapshot().draftId);
  assert.equal(new Set([s.draftId, ...s.slots.map((x) => x.id)]).size, 4);
});
test('retained IDs survive expansion; only exact acknowledged reduction discards slots', () => {
  const e = editor(),
    original = e.snapshot().slots;
  e.setCount('5');
  assert.deepEqual(e.snapshot().slots.slice(0, 3), original);
  assert.deepEqual(
    e
      .snapshot()
      .slots.slice(3)
      .map((x) => x.time),
    ['', ''],
  );
  const expanded = e.snapshot().slots;
  e.setCount('2');
  assert.equal(e.snapshot().slots.length, 5);
  assert.deepEqual(e.snapshot().removal.slots, expanded.slice(2));
  assert(Object.isFrozen(e.snapshot().removal));
  assert(Object.isFrozen(e.snapshot().removal.slots));
  e.cancelRemoval();
  assert.equal(e.snapshot().posts, '5');
  e.setCount('2');
  e.setTime(expanded[0].id, '08:15');
  assert.equal(e.snapshot().removal, null);
  assert.equal(e.snapshot().posts, '5');
  e.confirmRemoval();
  assert.equal(e.snapshot().slots.length, 5);
  e.setCount('2');
  const revision = e.snapshot().revision;
  e.confirmRemoval();
  assert.equal(e.snapshot().revision, revision + 1);
  assert.deepEqual(
    e.snapshot().slots.map((x) => x.id),
    expanded.slice(0, 2).map((x) => x.id),
  );
  e.setCount('5');
  assert(
    e
      .snapshot()
      .slots.slice(2)
      .every((x) => !expanded.some((old) => old.id === x.id)),
  );
});
test('numeric invalids remain visible, bounds are representation bounds, and removal cannot preview', async () => {
  let calls = 0;
  const e = editor({
    preview: async () => {
      calls++;
      return failure('BUSY');
    },
    cancel() {},
  });
  dates(e);
  for (const raw of ['', '0', '-1', '1.5', '1e2', '1441', 'Infinity', ' 2']) {
    e.setCount(raw);
    await e.preview();
    assert.equal(e.snapshot().posts, raw);
    assert.equal(e.snapshot().code, 'INVALID_SHAPE');
    assert.equal(e.snapshot().slots.length, 3);
  }
  e.setCount('1440');
  assert.equal(e.snapshot().slots.length, 1440);
  e.setCount('1');
  await e.preview();
  assert.equal(e.snapshot().code, 'INVALID_SHAPE');
  e.confirmRemoval();
  for (const raw of ['', '0', '3652060', '1.1', '-1']) {
    e.setField('every', raw);
    await e.preview();
    assert.equal(e.snapshot().every, raw);
    assert.equal(e.snapshot().code, 'INVALID_SHAPE');
  }
  assert.equal(calls, 0);
  e.setField('every', '3652059');
  await e.preview();
  assert.equal(calls, 1);
  assert.equal(e.snapshot().code, 'BUSY');
});
test('actual controller/client/bridge/evaluator preserves UTC, window and 29/30 advisory semantics', async () => {
  const f = actual();
  try {
    dates(f.e);
    times(f.e, ['09:00', '09:29']);
    assert.equal(f.calls(), 0);
    await f.e.preview();
    await tick();
    const result = f.e.snapshot().result;
    assert.equal(result.scope.kind, 'UNBOUND_DRAFT');
    assert.equal(result.warnings[0].gapMs, 1740000);
    assert.equal(result.preview.occurrences[0].utcMs, Date.UTC(2024, 0, 1, 2));
    assert.equal(result.preview.occurrences[0].offsetSeconds, 25200);
    assert.deepEqual(result.window, {
      fromDate: '2024-01-01',
      throughDate: '2024-01-01',
      limit: 128,
    });
    times(f.e, ['09:00', '09:30']);
    assert.equal(f.e.snapshot().result, null);
    await f.e.preview();
    await tick();
    assert.equal(f.e.snapshot().result.warnings.length, 0);
    assert.equal(f.calls(), 2);
    assert.equal(f.released(), 2);
  } finally {
    f.e.dispose();
    f.close();
  }
});
test('real DST skipped gap, earlier overlap and truncated prefix remain explicit', async () => {
  const f = actual();
  try {
    f.e.setField('zone', 'America/New_York');
    dates(f.e, '2024-03-10');
    times(f.e, ['02:30']);
    await f.e.preview();
    await tick();
    assert.equal(f.e.snapshot().result.preview.occurrences[0].resolution, 'SKIPPED_GAP');
    dates(f.e, '2024-11-03');
    times(f.e, ['01:30']);
    await f.e.preview();
    await tick();
    assert.equal(f.e.snapshot().result.preview.occurrences[0].resolution, 'OVERLAP_EARLIER');
    f.e.setField('zone', 'UTC');
    dates(f.e, '2024-01-01', '2024-12-31');
    await f.e.preview();
    await tick();
    const r = f.e.snapshot().result;
    assert.equal(r.coverage, 'TRUNCATED_PREFIX');
    assert.equal(r.preview.occurrences.length, 128);
    assert(r.preview.next);
    assert.equal(r.preview.truncated, true);
  } finally {
    f.e.dispose();
    f.close();
  }
});
for (const action of ['edit', 'context', 'cancel', 'dispose'])
  test(`${action} fences stale completion without freeing unsettled controller pending`, async () => {
    const d = deferred();
    let input,
      cancels = 0,
      notifications = 0;
    const e = editor({
      preview: (i) => {
        input = i;
        return d.promise;
      },
      cancel() {
        cancels++;
      },
    });
    dates(e);
    const unsub = e.subscribe(() => {
      notifications++;
    });
    const p = e.preview();
    assert.equal(e.snapshot().pending, true);
    if (action === 'edit') e.setField('every', '2');
    else if (action === 'context') e.contextChanged();
    else e[action]();
    const atFence = notifications;
    assert.equal(e.snapshot().pending, true);
    assert(cancels > 0);
    await e.preview();
    assert.equal(e.snapshot().result, null);
    if (action !== 'dispose') assert.equal(e.snapshot().code, 'BUSY');
    d.resolve(success(input));
    await p;
    assert.equal(e.snapshot().pending, false);
    assert.equal(e.snapshot().result, null);
    if (action === 'dispose') assert.equal(notifications, atFence);
    unsub();
    const before = notifications;
    e.setField('zone', 'UTC');
    assert.equal(notifications, before);
  });
test('cancelled real client retains native BUSY ownership until invoke settles, never replays', async () => {
  const d = deferred();
  let calls = 0;
  const c = createScheduleDraftClient(() => {
    calls++;
    return d.promise;
  });
  const e = editor(c);
  dates(e);
  const p = e.preview();
  e.cancel();
  await p;
  assert.equal(e.snapshot().pending, false);
  assert.equal(c.outstanding(), 1);
  await e.preview();
  assert.equal(e.snapshot().code, 'BUSY');
  assert.equal(calls, 1);
  d.resolve(failure('CANCELLED'));
  await tick();
  assert.equal(c.outstanding(), 0);
  assert.equal(calls, 1);
  e.dispose();
  c.dispose();
});
test('fixed errors preserve inputs and invalid dates/times never dispatch', async () => {
  const unavailable = editor();
  dates(unavailable);
  await unavailable.preview();
  assert.equal(unavailable.snapshot().code, 'SESSION_UNAVAILABLE');
  for (const behavior of [
    () => {
      throw Error('PRIVATE');
    },
    () => Promise.reject(Error('PRIVATE')),
    async () => '{',
    async () => failure('UNSUPPORTED_ZONE'),
  ]) {
    const e = editor({
      preview: behavior,
      cancel() {
        throw Error('PRIVATE');
      },
    });
    dates(e);
    const before = e.snapshot();
    await e.preview();
    assert.equal(e.snapshot().pending, false);
    assert.equal(e.snapshot().slots, before.slots);
    assert.equal(e.snapshot().startDate, before.startDate);
    assert.equal(e.snapshot().result, null);
    assert(['INTERNAL_FAILURE', 'UNSUPPORTED_ZONE'].includes(e.snapshot().code));
    assert(!JSON.stringify(e.snapshot()).includes('PRIVATE'));
  }
  let calls = 0;
  const e = editor({
    preview: async () => {
      calls++;
      return '';
    },
    cancel() {},
  });
  for (const date of ['', '2024-02-30', '1969-12-31']) {
    dates(e, date);
    await e.preview();
  }
  dates(e, '2024-01-01', '2025-01-01');
  await e.preview();
  dates(e);
  e.setTime(e.snapshot().slots[0].id, '25:00');
  await e.preview();
  assert.equal(calls, 0);
  assert.equal(e.snapshot().code, 'INVALID_SHAPE');
});
test('validated but mismatched draft/revision/zone/window responses fail closed', async () => {
  for (const patch of [
    (r) => {
      r.scope.draftId = id();
    },
    (r) => {
      r.scope.draftRevision++;
    },
    (r) => {
      r.preview.zone = 'UTC';
    },
    (r) => {
      r.window.throughDate = '2024-01-02';
    },
    (r) => {
      r.window.fromDate = '2023-12-31';
    },
    (r) => {
      r.window.limit = 127;
    },
    (r) => {
      r.extra = 'PRIVATE';
    },
  ]) {
    const e = editor({
      preview: async (input) => {
        const r = JSON.parse(success(input));
        patch(r.preview);
        return JSON.stringify(r);
      },
      cancel() {},
    });
    dates(e);
    await e.preview();
    assert.equal(e.snapshot().result, null);
    assert.equal(e.snapshot().code, 'INTERNAL_FAILURE');
  }
});
test('every context edit invalidates staged reduction and subscriber cancellation cannot dispatch', async () => {
  for (const act of [
    (e) => e.setField('zone', 'UTC'),
    (e) => e.contextChanged(),
    (e) => e.cancel(),
  ]) {
    const e = editor();
    e.setCount('1');
    act(e);
    assert.equal(e.snapshot().removal, null);
    assert.equal(e.snapshot().posts, '3');
  }
  let calls = 0;
  const e = editor({
    preview: async () => {
      calls++;
      return '';
    },
    cancel() {},
  });
  dates(e);
  const unsubscribe = e.subscribe(() => {
    if (e.snapshot().pending) {
      unsubscribe();
      e.cancel();
    }
  });
  await e.preview();
  assert.equal(calls, 0);
  assert.equal(e.snapshot().pending, false);
});
test('request is detached, uses no persistent end/max and late rejection cannot replace newer edits', async () => {
  const d = deferred();
  let captured,
    calls = 0;
  const e = editor({
    preview: (input) => {
      captured = input;
      calls++;
      return calls === 1 ? d.promise : Promise.resolve(success(input));
    },
    cancel() {},
  });
  dates(e);
  const p = e.preview();
  assert.equal(captured.schedule.endDate, null);
  assert.equal(captured.schedule.maxOccurrences, null);
  assert.deepEqual(captured.schedule.rule, { kind: 'EVERY_N_DAYS', intervalDays: 1 });
  assert.deepEqual(Object.keys(captured).sort(), ['request', 'schedule']);
  assert(Object.isFrozen(captured.schedule.slots));
  e.setField('zone', 'UTC');
  d.reject(Error('PRIVATE'));
  await p;
  assert.equal(e.snapshot().code, null);
  assert.equal(e.snapshot().result, null);
  await e.preview();
  assert.equal(e.snapshot().result.preview.zone, 'UTC');
  assert.equal(e.snapshot().result.scope.draftRevision, e.snapshot().revision);
  assert.equal(calls, 2);
});
