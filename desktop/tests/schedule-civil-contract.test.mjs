import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  snapshotCivilSchedule,
  editCivilSlots,
  previewCivilOccurrences,
} from '../src/schedule-civil-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const slot = (n, time = '09:00') => ({ id: id(n), time });
const base = (patch = {}) => ({
  version: 1,
  kind: 'CIVIL_RULE',
  startDate: '2024-01-01',
  endDate: null,
  maxOccurrences: null,
  rule: { kind: 'EVERY_N_DAYS', intervalDays: 1 },
  postsPerActiveDay: 1,
  slots: [slot(1)],
  ...patch,
});
const request = (fromDate = '2024-01-01', throughDate = fromDate, limit = 4096) => ({
  version: 1,
  fromDate,
  throughDate,
  limit,
});
const preview = (schedule, from, through, limit) =>
  previewCivilOccurrences(schedule, request(from, through, limit));
function frozen(value) {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
}
test('snapshot is exact, deeply immutable and independent of caller mutation', () => {
  const input = base({ rule: { kind: 'WEEKDAYS', weekdays: [1, 7] } }),
    result = snapshotCivilSchedule(input);
  assert.ok(result);
  frozen(result);
  input.slots[0].time = '10:00';
  input.rule.weekdays[0] = 2;
  assert.equal(result.slots[0].time, '09:00');
  assert.deepEqual(result.rule.weekdays, [1, 7]);
  for (const changed of [
    { ...base(), zone: 'UTC' },
    { ...base(), retry: true },
    { ...base(), version: 2 },
    { ...base(), kind: 'JOB' },
    Object.assign(Object.create(null), base()),
  ])
    assert.equal(snapshotCivilSchedule(changed), null);
});
test('Gregorian dates reject rollover and support exact leap/century/domain boundaries', () => {
  for (const value of [
    '0000-01-01',
    '10000-01-01',
    '2024-1-01',
    '2024-01-1',
    '2024-00-01',
    '2024-13-01',
    '2024-04-31',
    '1900-02-29',
    '2100-02-29',
    '2024-02-30',
    '2024-01-01\n',
    '２０２４-01-01',
  ])
    assert.equal(snapshotCivilSchedule(base({ startDate: value })), null, value);
  for (const value of ['0001-01-01', '2000-02-29', '2024-02-29', '9999-12-31'])
    assert.equal(preview(base({ startDate: value }), value, value).occurrences[0].date, value);
  assert.deepEqual(
    preview(base({ startDate: '2024-02-28' }), '2024-02-28', '2024-03-01').occurrences.map(
      (x) => x.date,
    ),
    ['2024-02-28', '2024-02-29', '2024-03-01'],
  );
  assert.deepEqual(
    preview(base({ startDate: '2023-12-31' }), '2023-12-31', '2024-01-01').occurrences.map(
      (x) => x.date,
    ),
    ['2023-12-31', '2024-01-01'],
  );
});
test('all month boundaries and non-leap February advance without host date conversion', () => {
  for (const [month, last] of [
    [1, 31],
    [2, 28],
    [3, 31],
    [4, 30],
    [5, 31],
    [6, 30],
    [7, 31],
    [8, 31],
    [9, 30],
    [10, 31],
    [11, 30],
  ]) {
    const first = `2023-${String(month).padStart(2, '0')}-${last}`,
      next = `2023-${String(month + 1).padStart(2, '0')}-01`;
    assert.deepEqual(
      preview(base({ startDate: first }), first, next).occurrences.map((x) => x.date),
      [first, next],
    );
  }
});
test('once means one active date with N chronological slots and stable IDs', () => {
  const s = base({
    rule: { kind: 'ONCE' },
    postsPerActiveDay: 3,
    slots: [slot(1, '18:00'), slot(2, '06:00'), slot(3, '12:00')],
  });
  const result = preview(s, '2024-01-01', '2024-01-10');
  assert.deepEqual(
    result.occurrences.map((x) => [x.time, x.slotId, x.plannedOrdinal]),
    [
      ['06:00', id(2), 1],
      ['12:00', id(3), 2],
      ['18:00', id(1), 3],
    ],
  );
  frozen(result);
  assert.equal(preview(s, '2024-01-02', '2024-01-10').occurrences.length, 0);
  assert.equal(
    preview({ ...s, maxOccurrences: 2 }, '2024-01-01', '2024-01-10').occurrences.length,
    2,
  );
});
test('weekday mapping Monday1 Sunday7 and first selected date on/after anchor', () => {
  const s = base({ startDate: '0001-01-01', rule: { kind: 'WEEKDAYS', weekdays: [1, 7] } });
  assert.deepEqual(
    preview(s, '0001-01-01', '0001-01-08').occurrences.map((x) => [x.date, x.plannedOrdinal]),
    [
      ['0001-01-01', 1],
      ['0001-01-07', 2],
      ['0001-01-08', 3],
    ],
  );
  const t = base({ startDate: '2024-01-02', rule: { kind: 'WEEKDAYS', weekdays: [1] } });
  assert.equal(preview(t, '2024-01-02', '2024-01-08').occurrences[0].date, '2024-01-08');
  for (const weekdays of [[], [0], [8], [2, 1], [1, 1], [1.5]])
    assert.equal(snapshotCivilSchedule(base({ rule: { kind: 'WEEKDAYS', weekdays } })), null);
});
test('every N uses original start across window/month/year/leap boundaries', () => {
  const s = base({ startDate: '2023-12-30', rule: { kind: 'EVERY_N_DAYS', intervalDays: 2 } });
  assert.deepEqual(
    preview(s, '2024-01-02', '2024-01-05').occurrences.map((x) => [x.date, x.plannedOrdinal]),
    [
      ['2024-01-03', 3],
      ['2024-01-05', 4],
    ],
  );
  assert.deepEqual(
    preview(
      base({ startDate: '2024-02-27', rule: { kind: 'EVERY_N_DAYS', intervalDays: 2 } }),
      '2024-02-28',
      '2024-03-02',
    ).occurrences.map((x) => x.date),
    ['2024-02-29', '2024-03-02'],
  );
  for (const intervalDays of [0, -0, -1, 1.5, NaN, Infinity, 3652060, '1'])
    assert.equal(
      snapshotCivilSchedule(base({ rule: { kind: 'EVERY_N_DAYS', intervalDays } })),
      null,
    );
});
test('maximum counts planned SLOTS including before window and partial last day', () => {
  const s = base({
    postsPerActiveDay: 3,
    slots: [slot(1, '09:00'), slot(2, '10:00'), slot(3, '11:00')],
    maxOccurrences: 5,
  });
  assert.deepEqual(
    preview(s, '2024-01-01', '2024-01-04').occurrences.map((x) => x.plannedOrdinal),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    preview(s, '2024-01-02', '2024-01-04').occurrences.map((x) => [
      x.date,
      x.time,
      x.plannedOrdinal,
    ]),
    [
      ['2024-01-02', '09:00', 4],
      ['2024-01-02', '10:00', 5],
    ],
  );
  assert.equal(preview(s, '2024-01-03', '2024-01-04').occurrences.length, 0);
  for (const count of [1, 3, 4])
    assert.equal(
      preview({ ...s, maxOccurrences: count }, '2024-01-01', '2024-01-04').occurrences.length,
      count,
    );
});
test('inclusive end and max stop at first bound; invalid bounds reject', () => {
  const s = base({ endDate: '2024-01-02', maxOccurrences: 5 });
  assert.equal(preview(s, '2024-01-01', '2024-01-03').occurrences.length, 2);
  assert.equal(
    preview({ ...s, maxOccurrences: 1 }, '2024-01-01', '2024-01-03').occurrences.length,
    1,
  );
  const weekly = base({ rule: { kind: 'WEEKDAYS', weekdays: [1] }, endDate: '2024-01-07' });
  assert.equal(preview(weekly, '2024-01-01', '2024-01-08').occurrences.length, 1);
  for (const maxOccurrences of [0, -0, -1, 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1, '2'])
    assert.equal(
      preview(base({ maxOccurrences }), '2024-01-01', '2024-01-01').code,
      'INVALID_BOUNDS',
    );
  assert.equal(
    preview(base({ endDate: '2023-12-31' }), '2024-01-01', '2024-01-01').code,
    'INVALID_BOUNDS',
  );
});
test('full minute-domain slots remain bounded, unique and explicitly supplied', () => {
  const slots = Array.from({ length: 1440 }, (_, n) =>
    slot(
      n + 1,
      `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`,
    ),
  );
  const s = base({ postsPerActiveDay: 1440, slots });
  assert.ok(snapshotCivilSchedule(s));
  assert.equal(preview(s, '2024-01-01', '2024-01-01').occurrences.length, 1440);
  for (const patch of [
    { postsPerActiveDay: 0 },
    { postsPerActiveDay: 1441 },
    { postsPerActiveDay: 2 },
    { slots: [slot(1, '24:00')] },
    { slots: [slot(1, '1:00')] },
    { slots: [slot(1, null)] },
    { slots: [{ id: id(1) + '\n', time: '00:00' }] },
  ])
    assert.equal(snapshotCivilSchedule(base(patch)), null);
  assert.equal(
    snapshotCivilSchedule(base({ postsPerActiveDay: 2, slots: [slot(1), slot(2)] })),
    null,
  );
  assert.equal(
    snapshotCivilSchedule(base({ postsPerActiveDay: 2, slots: [slot(1), slot(1, '10:00')] })),
    null,
  );
});
test('bounded preview produces exactly one next within window without claiming schedule exhaustion', () => {
  const s = base();
  const r = preview(s, '2024-01-01', '2024-01-03', 2);
  assert.equal(r.truncated, true);
  assert.equal(r.next.date, '2024-01-03');
  assert.equal(r.occurrences.length, 2);
  const exact = preview(s, '2024-01-01', '2024-01-02', 2);
  assert.equal(exact.truncated, false);
  assert.equal(exact.next, null);
  assert.equal(preview(s, '2024-01-01', '2024-12-31', 1).ok, true);
  assert.equal(preview(s, '2024-01-01', '2025-01-01', 1).code, 'INVALID_PREVIEW');
  for (const limit of [0, -0, 4097, 1.5, '1'])
    assert.equal(preview(s, '2024-01-01', '2024-01-02', limit).code, 'INVALID_PREVIEW');
  const many = base({
    postsPerActiveDay: 12,
    slots: Array.from({ length: 12 }, (_, i) => slot(i + 1, `${String(i).padStart(2, '0')}:00`)),
  });
  const cap = preview(many, '2024-01-01', '2024-12-31', 4096);
  assert.equal(cap.occurrences.length, 4096);
  assert.equal(cap.next.plannedOrdinal, 4097);
});
test('late previews retain arithmetic count across centuries and final date', () => {
  const s = base({ startDate: '0001-01-01' });
  assert.equal(preview(s, '9999-12-31', '9999-12-31').occurrences[0].plannedOrdinal, 3652059);
  assert.equal(
    preview({ ...s, maxOccurrences: 2 }, '9999-12-31', '9999-12-31').occurrences.length,
    0,
  );
  const monday = base({ startDate: '0001-01-01', rule: { kind: 'WEEKDAYS', weekdays: [1] } });
  assert.equal(preview(monday, '0001-01-08', '0001-01-08').occurrences[0].plannedOrdinal, 2);
});
test('slot reorder preserves IDs/times and chronological occurrence identity', () => {
  const s = base({ postsPerActiveDay: 2, slots: [slot(1, '10:00'), slot(2, '09:00')] });
  const edited = editCivilSlots(s, {
    version: 1,
    postsPerActiveDay: 2,
    slots: [s.slots[1], s.slots[0]],
    discardSlotIds: [],
  });
  assert.equal(edited.ok, true);
  frozen(edited);
  assert.deepEqual(
    edited.schedule.slots.map((x) => x.id),
    [id(2), id(1)],
  );
  assert.deepEqual(
    preview(s, '2024-01-01', '2024-01-01'),
    preview(edited.schedule, '2024-01-01', '2024-01-01'),
  );
});
test('increase/reduction require exact explicit values and ordered discard acknowledgement', () => {
  const s = base({
    postsPerActiveDay: 3,
    slots: [slot(1, '09:00'), slot(2, '10:00'), slot(3, '11:00')],
  });
  const edit = {
    version: 1,
    postsPerActiveDay: 1,
    slots: [slot(2, '10:00')],
    discardSlotIds: [id(1), id(3)],
  };
  const result = editCivilSlots(s, edit);
  assert.equal(result.ok, true);
  assert.deepEqual(result.removedSlotIds, [id(1), id(3)]);
  assert.deepEqual(result.schedule.slots, [slot(2, '10:00')]);
  assert.equal(editCivilSlots(s, { ...edit, discardSlotIds: [] }).code, 'DISCARD_REQUIRED');
  for (const discardSlotIds of [[id(3), id(1)], [id(1), id(1)], [id(9)], [id(1), id(2), id(3)]])
    assert.equal(editCivilSlots(s, { ...edit, discardSlotIds }).code, 'INVALID_DISCARD');
  assert.equal(
    editCivilSlots(s, { ...edit, slots: [slot(2, '12:00')] }).code,
    'RETAINED_SLOT_CHANGED',
  );
  const added = editCivilSlots(base(), {
    version: 1,
    postsPerActiveDay: 2,
    slots: [slot(1), slot(2, '10:00')],
    discardSlotIds: [],
  });
  assert.deepEqual(added.addedSlotIds, [id(2)]);
  assert.equal(
    editCivilSlots(base(), {
      version: 1,
      postsPerActiveDay: 2,
      slots: [slot(1)],
      discardSlotIds: [],
    }).code,
    'INVALID_SLOTS',
  );
});
test('time replacement explicitly retires old ID without silently retiming it', () => {
  const result = editCivilSlots(base(), {
    version: 1,
    postsPerActiveDay: 1,
    slots: [slot(2, '10:00')],
    discardSlotIds: [id(1)],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.addedSlotIds, [id(2)]);
  assert.deepEqual(result.removedSlotIds, [id(1)]);
});
test('descriptor-safe snapshots never invoke getters, conversions, iterators, or inherited hooks', () => {
  let calls = 0;
  const bad = base();
  Object.defineProperty(bad, 'startDate', {
    get() {
      calls++;
      return '2024-01-01';
    },
    enumerable: true,
  });
  assert.equal(snapshotCivilSchedule(bad), null);
  const array = [slot(1)];
  Object.defineProperty(array, 0, {
    get() {
      calls++;
      return slot(1);
    },
  });
  assert.equal(snapshotCivilSchedule(base({ slots: array })), null);
  const hostile = {
    toJSON() {
      calls++;
    },
    valueOf() {
      calls++;
    },
    [Symbol.iterator]() {
      calls++;
    },
  };
  assert.equal(snapshotCivilSchedule(base({ maxOccurrences: hostile })), null);
  assert.equal(snapshotCivilSchedule(base({ slots: new Array(1) })), null);
  const sym = base();
  sym[Symbol('extra')] = 1;
  assert.equal(snapshotCivilSchedule(sym), null);
  const trap = new Proxy(
    {},
    {
      ownKeys() {
        throw Error('raw');
      },
    },
  );
  assert.deepEqual(previewCivilOccurrences(trap, request()), { ok: false, code: 'INVALID_SCHEMA' });
  assert.equal(calls, 0);
});
test('failure precedence is fixed and no partial success escapes', () => {
  assert.deepEqual(editCivilSlots(base({ startDate: 'bad' }), {}), {
    ok: false,
    code: 'INVALID_DATE',
  });
  assert.deepEqual(previewCivilOccurrences(base(), { ...request(), zone: 'UTC' }), {
    ok: false,
    code: 'INVALID_SCHEMA',
  });
  assert.deepEqual(previewCivilOccurrences(base(), request('2024-01-02', '2024-01-01')), {
    ok: false,
    code: 'INVALID_PREVIEW',
  });
  assert.deepEqual(
    editCivilSlots(base(), {
      version: 1,
      postsPerActiveDay: 1,
      slots: [slot(1, 'bad')],
      discardSlotIds: [id(99)],
    }),
    { ok: false, code: 'INVALID_SLOTS' },
  );
});
test('actual module produces identical civil results under different host timezone settings', () => {
  const url = new URL('../src/schedule-civil-contract.ts', import.meta.url).href;
  const script = `import {previewCivilOccurrences as p} from ${JSON.stringify(url)};console.log(JSON.stringify(p(${JSON.stringify(base({ startDate: '2000-02-28' }))},${JSON.stringify(request('2000-02-28', '2000-03-01'))})))`;
  const outputs = ['UTC', 'Pacific/Honolulu', 'Asia/Ho_Chi_Minh'].map((TZ) => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, TZ },
      timeout: 10000,
      maxBuffer: 16384,
    });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  });
  assert.equal(new Set(outputs).size, 1);
});
test('leaf has no effect imports or production activation', () => {
  const source = readFileSync(
    new URL('../src/schedule-civil-contract.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /\b(?:import|require|Date|Intl|setTimeout|setInterval|Promise|fetch)\b/,
  );
  const root = new URL('../src/', import.meta.url);
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(path);
      else if (
        /\.[cm]?[jt]sx?$/.test(entry.name) &&
        entry.name !== 'schedule-zone-contract.ts' &&
        fileURLToPath(path) !==
          fileURLToPath(new URL('../src/schedule-civil-contract.ts', import.meta.url))
      )
        assert.ok(!readFileSync(path, 'utf8').includes('schedule-civil-contract'));
    }
  }
  walk(root);
});
