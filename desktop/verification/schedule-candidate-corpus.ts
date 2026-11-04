// Verification-only fixed expectations. Never regenerate expectations from Intl.
import { createHash } from 'node:crypto';
import { env } from 'node:process';
import { captureTimezoneRuntime } from '../src/schedule-zone-contract.js';
import { evaluateScheduleGapPreview } from '../src/schedule-gap-contract.js';
export { captureTimezoneRuntime };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const schedule = (date: string, times: string[]) => ({
  version: 1,
  kind: 'CIVIL_RULE',
  startDate: date,
  endDate: null,
  maxOccurrences: null,
  rule: { kind: 'EVERY_N_DAYS', intervalDays: 1 },
  postsPerActiveDay: times.length,
  slots: times.map((time, i) => ({ id: id(i + 1), time })),
});
const request = (date: string, zone = 'Asia/Ho_Chi_Minh', throughDate = date, limit = 4096) => ({
  version: 1,
  scope: { scheduleId: id(10), scheduleRevision: 0, deviceId: id(11), accountId: id(12) },
  zone,
  fromDate: date,
  throughDate,
  limit,
});
export const CASE_IDS = Object.freeze([
  'HCM_ALIAS',
  'NY_GAP',
  'NY_FOLD',
  'LORD_HOWE',
  'THRESHOLD',
  'MIDNIGHT',
  'BOUNDS_NEXT',
  'DENSE_PREFIX',
  'CALENDAR',
  'FAIL_CLOSED',
]);
export function runCorpus() {
  let active = '',
    checks = 0;
  const facts: unknown[] = [];
  const equal = (actual: unknown, expected: unknown) => {
    checks++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('CORPUS_' + active);
    facts.push(expected);
  };
  const run = (s: unknown, r: unknown) => {
    const before = JSON.stringify(s),
      out = evaluateScheduleGapPreview(s, r);
    equal(out.ok, true);
    if (!out.ok) throw new Error('CORPUS_' + active);
    equal(JSON.stringify(s), before);
    for (const value of [
      out,
      out.preview,
      out.preview.runtime,
      out.preview.occurrences,
      out.warnings,
      ...out.preview.occurrences,
      ...(out.preview.next ? [out.preview.next] : []),
    ])
      equal(Object.isFrozen(value), true);
    return out;
  };
  active = 'HCM_ALIAS';
  for (const zone of ['Asia/Ho_Chi_Minh', 'Asia/Saigon']) {
    const out = run(schedule('2024-01-01', ['09:00']), request('2024-01-01', zone));
    equal(out.preview.zone, zone);
    equal(out.preview.resolvedZone, 'Asia/Saigon');
    equal(
      out.preview.occurrences.map((x) => [x.utcMs, x.offsetSeconds, x.resolution]),
      [[1704074400000, 25200, 'UNIQUE']],
    );
  }
  active = 'NY_GAP';
  const gap = run(
    schedule('2024-03-10', ['01:59', '02:15', '03:00']),
    request('2024-03-10', 'America/New_York'),
  );
  equal(
    gap.preview.occurrences.map((x) => [x.plannedOrdinal, x.utcMs, x.offsetSeconds, x.resolution]),
    [
      [1, 1710053940000, -18000, 'UNIQUE'],
      [2, null, null, 'SKIPPED_GAP'],
      [3, 1710054000000, -14400, 'UNIQUE'],
    ],
  );
  equal(gap.warnings, [
    { code: 'BELOW_30_MINUTES', earlierPlannedOrdinal: 1, laterPlannedOrdinal: 3, gapMs: 60000 },
  ]);
  active = 'NY_FOLD';
  const fold = run(
    schedule('2024-11-03', ['01:30', '02:00']),
    request('2024-11-03', 'America/New_York'),
  );
  equal(
    fold.preview.occurrences.map((x) => [x.utcMs, x.offsetSeconds, x.resolution]),
    [
      [1730611800000, -14400, 'OVERLAP_EARLIER'],
      [1730617200000, -18000, 'UNIQUE'],
    ],
  );
  equal(fold.warnings, []);
  active = 'LORD_HOWE';
  const lord = run(
    schedule('2024-10-06', ['01:59', '02:15', '02:30']),
    request('2024-10-06', 'Australia/Lord_Howe'),
  );
  equal(
    lord.preview.occurrences.map((x) => [x.plannedOrdinal, x.utcMs, x.offsetSeconds, x.resolution]),
    [
      [1, 1728142140000, 37800, 'UNIQUE'],
      [2, null, null, 'SKIPPED_GAP'],
      [3, 1728142200000, 39600, 'UNIQUE'],
    ],
  );
  equal(lord.warnings, [
    { code: 'BELOW_30_MINUTES', earlierPlannedOrdinal: 1, laterPlannedOrdinal: 3, gapMs: 60000 },
  ]);
  active = 'THRESHOLD';
  for (const [time, count] of [
    ['09:29', 1],
    ['09:30', 0],
    ['09:31', 0],
  ] as const) {
    const out = run(schedule('2024-01-01', ['09:00', time]), request('2024-01-01'));
    equal(out.warnings.length, count);
    if (count) equal(out.warnings[0]?.gapMs, 1740000);
  }
  active = 'MIDNIGHT';
  for (const [time, count] of [
    ['00:19', 1],
    ['00:20', 0],
  ] as const) {
    const out = run(
      schedule('2024-01-01', [time, '23:50']),
      request('2024-01-01', 'Asia/Ho_Chi_Minh', '2024-01-02'),
    );
    equal(out.warnings.length, count);
    if (count)
      equal(out.warnings[0], {
        code: 'BELOW_30_MINUTES',
        earlierPlannedOrdinal: 2,
        laterPlannedOrdinal: 3,
        gapMs: 1740000,
      });
  }
  active = 'BOUNDS_NEXT';
  const bounded = {
    ...schedule('2024-03-10', ['01:59', '02:15', '03:00']),
    endDate: '2024-03-10',
    maxOccurrences: 3,
  };
  const prefix = run(bounded, request('2024-03-10', 'America/New_York', '2024-03-11', 2));
  equal(prefix.coverage, 'TRUNCATED_PREFIX');
  equal(
    prefix.preview.occurrences.map((x) => x.plannedOrdinal),
    [1, 2],
  );
  equal(prefix.preview.next?.plannedOrdinal, 3);
  equal(prefix.preview.next?.utcMs, 1710054000000);
  equal(prefix.warnings, []);
  const complete = run(bounded, request('2024-03-10', 'America/New_York', '2024-03-11'));
  equal(complete.preview.occurrences.length, 3);
  equal(complete.preview.next, null);
  const clipped = run(schedule('2024-01-01', ['09:00']), request('2024-01-03'));
  equal(
    clipped.preview.occurrences.map((x) => [x.plannedOrdinal, x.slotId]),
    [[3, id(1)]],
  );
  active = 'DENSE_PREFIX';
  const dense = run(
    schedule(
      '2024-01-01',
      Array.from(
        { length: 48 },
        (_, i) =>
          `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
      ),
    ),
    request('2024-01-01', 'Asia/Ho_Chi_Minh', '2024-12-31'),
  );
  equal(dense.preview.occurrences.length, 4096);
  equal(dense.warnings.length, 4010);
  equal(dense.preview.next?.plannedOrdinal, 4097);
  equal(dense.coverage, 'TRUNCATED_PREFIX');
  active = 'CALENDAR';
  for (const [from, through, dates] of [
    ['2024-01-31', '2024-02-01', ['2024-01-31', '2024-02-01']],
    ['2024-02-28', '2024-03-01', ['2024-02-28', '2024-02-29', '2024-03-01']],
  ] as const) {
    const out = run(schedule(from, ['09:00']), request(from, 'Asia/Ho_Chi_Minh', through));
    equal(
      out.preview.occurrences.map((x) => x.date),
      dates,
    );
  }
  active = 'FAIL_CLOSED';
  equal(
    evaluateScheduleGapPreview(
      schedule('2024-01-01', ['09:00']),
      request('2024-01-01', 'Not/A_Zone'),
    ),
    { ok: false, code: 'UNSUPPORTED_ZONE' },
  );
  equal(evaluateScheduleGapPreview(schedule('2100-01-01', ['09:00']), request('2100-01-01')), {
    ok: false,
    code: 'UNSUPPORTED_DATE_RANGE',
  });
  equal(evaluateScheduleGapPreview({}, request('2024-01-01')), {
    ok: false,
    code: 'INVALID_SCHEMA',
  });
  equal(evaluateScheduleGapPreview(schedule('2024-01-01', ['09:00']), {}), {
    ok: false,
    code: 'INVALID_SCHEMA',
  });
  equal(
    evaluateScheduleGapPreview(
      { ...schedule('2024-01-01', ['09:00']), rule: { kind: 'MONTHLY', day: 31 } },
      request('2024-01-01'),
    ),
    { ok: false, code: 'INVALID_RULE' },
  );
  const prior = env.NODE_ICU_DATA;
  try {
    env.NODE_ICU_DATA = 'verification-refusal';
    equal(captureTimezoneRuntime(), { ok: false, code: 'RUNTIME_UNAVAILABLE' });
  } finally {
    if (prior === undefined) delete env.NODE_ICU_DATA;
    else env.NODE_ICU_DATA = prior;
  }
  return Object.freeze({
    version: 1,
    kind: 'SCHEDULE_CANDIDATE_CORPUS',
    cases: CASE_IDS,
    checks,
    semanticSha256: createHash('sha256').update(JSON.stringify(facts)).digest('hex'),
  });
}
