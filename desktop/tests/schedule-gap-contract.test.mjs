import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { verify } from '../scripts/verify-dependencies.mjs';
verify(true, '11.9.0');
const url = (p) => new URL(p, import.meta.url).href;
const data = (text) =>
  'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(text)).toString('base64');
const zone = data(
  readFileSync(new URL('../src/schedule-zone-contract.ts', import.meta.url), 'utf8')
    .replaceAll(
      "'@js-temporal/polyfill'",
      JSON.stringify(url('../node_modules/@js-temporal/polyfill/dist/index.esm.js')),
    )
    .replaceAll(
      "'./schedule-civil-contract.js'",
      JSON.stringify(url('../src/schedule-civil-contract.ts')),
    ),
);
const source = readFileSync(new URL('../src/schedule-gap-contract.ts', import.meta.url), 'utf8');
const { evaluateScheduleGapPreview: evaluate } = await import(
  data(source.replaceAll("'./schedule-zone-contract.js'", JSON.stringify(zone)))
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const schedule = (date, times) => ({
  version: 1,
  kind: 'CIVIL_RULE',
  startDate: date,
  endDate: null,
  maxOccurrences: null,
  rule: { kind: 'EVERY_N_DAYS', intervalDays: 1 },
  postsPerActiveDay: times.length,
  slots: times.map((time, i) => ({ id: id(i + 1), time })),
});
const request = (date, patch = {}) => ({
  version: 1,
  scope: { scheduleId: id(10), scheduleRevision: 0, deviceId: id(11), accountId: id(12) },
  zone: 'Asia/Ho_Chi_Minh',
  fromDate: date,
  throughDate: date,
  limit: 4096,
  ...patch,
});
const run = (s, r) => {
  const out = evaluate(s, r);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out;
};
test('actual civil zone gap composition warns 29 not 30 or31 and preserves intent', () => {
  for (const [time, count] of [
    ['09:29', 1],
    ['09:30', 0],
    ['09:31', 0],
  ]) {
    const s = schedule('2024-01-01', ['09:00', time]),
      before = JSON.stringify(s),
      out = run(s, request(s.startDate));
    assert.equal(out.warnings.length, count);
    assert.equal(JSON.stringify(s), before);
    assert.deepEqual(
      out.preview.occurrences.map((r) => r.time),
      ['09:00', time],
    );
    if (count) assert.equal(out.warnings[0].gapMs, 1740000);
  }
});
test('midnight comparison crosses local date without resetting and retains exact window', () => {
  for (const [time, count] of [
    ['00:19', 1],
    ['00:20', 0],
  ]) {
    const out = run(
      schedule('2024-01-01', [time, '23:50']),
      request('2024-01-01', { throughDate: '2024-01-02' }),
    );
    assert.equal(out.warnings.length, count);
    assert.deepEqual(out.window, {
      fromDate: '2024-01-01',
      throughDate: '2024-01-02',
      limit: 4096,
    });
    if (count)
      assert.deepEqual(out.warnings[0], {
        code: 'BELOW_30_MINUTES',
        earlierPlannedOrdinal: 2,
        laterPlannedOrdinal: 3,
        gapMs: 1740000,
      });
  }
});
test('NY spring gap rows retain ordinal while elapsed instant spacing warns', () => {
  const out = run(
    schedule('2024-03-10', ['01:59', '02:15', '03:00']),
    request('2024-03-10', { zone: 'America/New_York' }),
  );
  assert.equal(out.preview.occurrences[1].resolution, 'SKIPPED_GAP');
  assert.equal(out.preview.occurrences[1].utcMs, null);
  assert.deepEqual(out.warnings, [
    { code: 'BELOW_30_MINUTES', earlierPlannedOrdinal: 1, laterPlannedOrdinal: 3, gapMs: 60000 },
  ]);
});
test('earlier NY fold and Lord Howe half hour use real elapsed instants once', () => {
  const ny = run(
    schedule('2024-11-03', ['01:45', '02:00']),
    request('2024-11-03', { zone: 'America/New_York' }),
  );
  assert.equal(ny.preview.occurrences[0].resolution, 'OVERLAP_EARLIER');
  assert.equal(ny.warnings.length, 0);
  assert.equal(ny.preview.occurrences[1].utcMs - ny.preview.occurrences[0].utcMs, 4500000);
  const lh = run(
    schedule('2024-10-06', ['01:59', '02:15', '02:30']),
    request('2024-10-06', { zone: 'Australia/Lord_Howe' }),
  );
  assert.equal(lh.preview.occurrences[1].resolution, 'SKIPPED_GAP');
  assert.equal(lh.warnings[0].gapMs, 60000);
});
test('truncated and gap-only prefixes preserve next but never compare it or claim global all clear', () => {
  const out = run(schedule('2024-01-01', ['09:00', '09:01']), request('2024-01-01', { limit: 1 }));
  assert.equal(out.coverage, 'TRUNCATED_PREFIX');
  assert.equal(out.warnings.length, 0);
  assert.equal(out.preview.next.time, '09:01');
  assert.equal(out.window.limit, 1);
  const gap = run(
    schedule('2024-03-10', ['02:15', '03:00']),
    request('2024-03-10', { zone: 'America/New_York', limit: 1 }),
  );
  assert.equal(gap.coverage, 'TRUNCATED_PREFIX');
  assert.equal(gap.preview.occurrences[0].resolution, 'SKIPPED_GAP');
  assert.equal(gap.warnings.length, 0);
  const empty = run(
    { ...schedule('2024-01-01', ['09:00']), endDate: '2024-01-01' },
    request('2024-01-02'),
  );
  assert.equal(empty.coverage, 'COMPLETE_WINDOW');
  assert.equal(empty.preview.occurrences.length, 0);
  assert.equal(empty.window.fromDate, '2024-01-02');
});
test('scope is frozen supplied attribution and repeated contexts cannot combine', () => {
  const s = schedule('2024-01-01', ['09:00', '09:01']),
    r = request(s.startDate),
    out = run(s, r);
  assert.deepEqual(run(s, r), out);
  r.scope.deviceId = id(99);
  assert.equal(out.scope.deviceId, id(11));
  assert.equal(run(s, r).warnings.length, 1);
  for (const obj of [
    out,
    out.scope,
    out.window,
    out.preview,
    out.preview.occurrences,
    out.warnings,
    out.warnings[0],
  ])
    assert.ok(Object.isFrozen(obj));
  assert.equal('dispatchAllowed' in out, false);
  assert.equal('saveAllowed' in out, false);
});
test('descriptor schema and scope refuses without coercion and resolver failure stays exact', () => {
  const s = schedule('2024-01-01', ['09:00']);
  let calls = 0;
  const getter = request(s.startDate);
  Object.defineProperty(getter, 'scope', {
    enumerable: true,
    get() {
      calls++;
      return {};
    },
  });
  const bad = [
    getter,
    { ...request(s.startDate), extra: 1 },
    new Proxy(
      {},
      {
        getPrototypeOf() {
          throw Error('private');
        },
      },
    ),
    ...[-0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '0'].map((scheduleRevision) => ({
      ...request(s.startDate),
      scope: { ...request(s.startDate).scope, scheduleRevision },
    })),
    {
      ...request(s.startDate),
      scope: {
        ...request(s.startDate).scope,
        deviceId: {
          toString() {
            calls++;
            return id(11);
          },
        },
      },
    },
  ];
  for (const r of bad) assert.deepEqual(evaluate(s, r), { ok: false, code: 'INVALID_SCHEMA' });
  assert.equal(calls, 0);
  assert.deepEqual(evaluate(s, request(s.startDate, { zone: 'Unknown/Zone' })), {
    ok: false,
    code: 'UNSUPPORTED_ZONE',
  });
  assert.deepEqual(evaluate(s, request('1969-01-01')), {
    ok: false,
    code: 'UNSUPPORTED_DATE_RANGE',
  });
});
test('dense bounded preview never expands limit and end max retains planned counting', () => {
  const times = Array.from(
    { length: 48 },
    (_, i) => `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
  );
  const s = schedule('2024-01-01', times),
    out = run(s, request(s.startDate, { throughDate: '2024-12-31', limit: 4096 }));
  assert.equal(out.preview.occurrences.length, 4096);
  assert.equal(out.coverage, 'TRUNCATED_PREFIX');
  assert.equal(out.warnings.length, 4010);
  assert.equal(out.preview.next.plannedOrdinal, 4097);
  const capped = run(
    { ...s, maxOccurrences: 2 },
    request(s.startDate, { throughDate: '2024-01-02' }),
  );
  assert.equal(capped.preview.occurrences.length, 2);
  assert.equal(capped.coverage, 'COMPLETE_WINDOW');
});

test('scope attribution preserves repository UUID syntax independently of civil slot IDs', () => {
  const s = schedule('2024-01-01', ['09:00', '09:01']);
  const r = request(s.startDate);
  r.scope = {
    scheduleId: 'abcdef01-2345-f678-0123-456789abcdef',
    scheduleRevision: 1,
    deviceId: '01234567-89ab-0000-ffff-0123456789ab',
    accountId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  };
  assert.deepEqual(run(s, r).scope, r.scope);
  for (const deviceId of [
    r.scope.deviceId.toUpperCase(),
    '01234567-89ab-0000-ffff-0123456789a',
    ' 01234567-89ab-0000-ffff-0123456789ab',
  ]) {
    assert.deepEqual(evaluate(s, { ...r, scope: { ...r.scope, deviceId } }), {
      ok: false,
      code: 'INVALID_SCHEMA',
    });
  }
});

test('malformed resolver inputs and actual runtime refusal propagate without a partial advisory', () => {
  const s = schedule('2024-01-01', ['09:00']);
  for (const [model, req] of [
    [{ ...s, postsPerActiveDay: 2 }, request(s.startDate)],
    [s, request(s.startDate, { limit: 0 })],
    [s, request(s.startDate, { fromDate: 'not-a-date' })],
  ]) {
    const result = evaluate(model, req);
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result).sort(), ['code', 'ok']);
  }
  const previous = process.env.NODE_ICU_DATA;
  try {
    process.env.NODE_ICU_DATA = '';
    assert.deepEqual(evaluate(s, request(s.startDate)), {
      ok: false,
      code: 'RUNTIME_UNAVAILABLE',
    });
  } finally {
    if (previous === undefined) delete process.env.NODE_ICU_DATA;
    else process.env.NODE_ICU_DATA = previous;
  }
});

test('all nested result data is frozen including runtime witness and next occurrence', () => {
  const out = run(
    schedule('2024-01-01', ['09:00', '09:01', '09:02']),
    request('2024-01-01', { limit: 2 }),
  );
  const visit = (value) => {
    if (value === null || typeof value !== 'object') return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) visit(child);
  };
  visit(out);
  assert.equal(out.preview.next.plannedOrdinal, 3);
  assert.equal(out.warnings.length, 1);
});

test('dense warnings are exact and cross-day end and maximum stop at first bound', () => {
  const s = schedule('2024-01-01', ['00:00', '00:01', '00:02']);
  const out = run(s, request(s.startDate, { throughDate: '2024-01-03', limit: 8 }));
  assert.equal(out.warnings.length, 5);
  assert.deepEqual(
    out.warnings.map((w) => w.laterPlannedOrdinal),
    [2, 3, 5, 6, 8],
  );
  for (const [endDate, maxOccurrences, expected] of [
    ['2024-01-02', 8, 6],
    ['2024-01-03', 4, 4],
  ]) {
    const bounded = run(
      { ...s, endDate, maxOccurrences },
      request(s.startDate, { throughDate: '2024-01-04' }),
    );
    assert.equal(bounded.preview.occurrences.length, expected);
    assert.equal(bounded.coverage, 'COMPLETE_WINDOW');
    assert.equal(bounded.preview.next, null);
  }
});
