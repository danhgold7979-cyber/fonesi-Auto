// Civil intent only: no timezone, clock, persistence, job or execution authority.
export type CivilSlot = Readonly<{ id: string; time: string }>;
export type CivilRule =
  | Readonly<{ kind: 'ONCE' }>
  | Readonly<{ kind: 'WEEKDAYS'; weekdays: readonly number[] }>
  | Readonly<{ kind: 'EVERY_N_DAYS'; intervalDays: number }>;
export type CivilScheduleV1 = Readonly<{
  version: 1;
  kind: 'CIVIL_RULE';
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  rule: CivilRule;
  postsPerActiveDay: number;
  slots: readonly CivilSlot[];
}>;
export type CivilCode =
  | 'INVALID_SCHEMA'
  | 'INVALID_DATE'
  | 'INVALID_RULE'
  | 'INVALID_BOUNDS'
  | 'INVALID_SLOTS'
  | 'DISCARD_REQUIRED'
  | 'INVALID_DISCARD'
  | 'RETAINED_SLOT_CHANGED'
  | 'INVALID_PREVIEW';
export type CivilOccurrence = Readonly<{
  date: string;
  time: string;
  slotId: string;
  plannedOrdinal: number;
}>;
export type EditCode = Exclude<CivilCode, 'INVALID_PREVIEW'>;
export type PreviewCode = Exclude<
  CivilCode,
  'DISCARD_REQUIRED' | 'INVALID_DISCARD' | 'RETAINED_SLOT_CHANGED'
>;
export type EditResult =
  | Readonly<{ ok: false; code: EditCode }>
  | Readonly<{
      ok: true;
      schedule: CivilScheduleV1;
      removedSlotIds: readonly string[];
      addedSlotIds: readonly string[];
    }>;
export type PreviewResult =
  | Readonly<{ ok: false; code: PreviewCode }>
  | Readonly<{
      ok: true;
      kind: 'CIVIL_INTENT';
      occurrences: readonly CivilOccurrence[];
      truncated: boolean;
      next: CivilOccurrence | null;
    }>;
const faults = new WeakMap<object, CivilCode>();
function refuse(code: CivilCode): never {
  const fault = Object.freeze({});
  faults.set(fault, code);
  throw fault;
}
function failure<C extends CivilCode>(error: unknown): Readonly<{ ok: false; code: C }> {
  const code = typeof error === 'object' && error !== null ? faults.get(error) : undefined;
  return Object.freeze({ ok: false, code: (code ?? 'INVALID_SCHEMA') as C });
}
function record(
  value: unknown,
  keys: readonly string[],
  code: CivilCode = 'INVALID_SCHEMA',
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    refuse(code);
  const names = Reflect.ownKeys(value);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    refuse(code);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) refuse(code);
    result[key] = descriptor.value;
  }
  return result;
}
function array(value: unknown, maximum: number, code: CivilCode): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse(code);
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (!length || !('value' in length) || !integer(length.value, 0, maximum)) refuse(code);
  if (Reflect.ownKeys(value).length !== length.value + 1) refuse(code);
  const result: unknown[] = [];
  for (let i = 0; i < length.value; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !('value' in d) || !d.enumerable) refuse(code);
    result.push(d.value);
  }
  return result;
}
function integer(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    value >= min &&
    value <= max
  );
}
function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  );
}
function leap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function monthDays(year: number, month: number): number {
  return month === 2 ? (leap(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function yearStart(year: number): number {
  const prior = year - 1;
  return 365 * prior + Math.floor(prior / 4) - Math.floor(prior / 100) + Math.floor(prior / 400);
}
function dayNumber(value: unknown, code: CivilCode = 'INVALID_DATE'): number {
  if (
    typeof value !== 'string' ||
    value.length !== 10 ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
  )
    refuse(code);
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays(year, month)) refuse(code);
  let ordinal = yearStart(year) + day - 1;
  for (let m = 1; m < month; m++) ordinal += monthDays(year, m);
  return ordinal;
}
function dateText(ordinal: number): string {
  let low = 1,
    high = 9999;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (yearStart(mid) <= ordinal) low = mid;
    else high = mid - 1;
  }
  let remaining = ordinal - yearStart(low),
    month = 1;
  while (remaining >= monthDays(low, month)) {
    remaining -= monthDays(low, month);
    month++;
  }
  return `${String(low).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(remaining + 1).padStart(2, '0')}`;
}
function minute(value: unknown): number {
  if (typeof value !== 'string' || value.length !== 5 || !/^[0-9]{2}:[0-9]{2}$/.test(value))
    refuse('INVALID_SLOTS');
  const h = Number(value.slice(0, 2)),
    m = Number(value.slice(3));
  if (h > 23 || m > 59) refuse('INVALID_SLOTS');
  return h * 60 + m;
}
function slots(value: unknown, n: unknown): readonly CivilSlot[] {
  if (!integer(n, 1, 1440)) refuse('INVALID_SLOTS');
  const raw = array(value, 1440, 'INVALID_SLOTS');
  if (raw.length !== n) refuse('INVALID_SLOTS');
  const ids = new Set<string>(),
    times = new Set<number>();
  const result: CivilSlot[] = [];
  for (const entry of raw) {
    const slot = record(entry, ['id', 'time'], 'INVALID_SLOTS');
    const time = minute(slot.time);
    if (!uuid(slot.id) || ids.has(slot.id) || times.has(time)) refuse('INVALID_SLOTS');
    ids.add(slot.id);
    times.add(time);
    result.push(Object.freeze({ id: slot.id, time: slot.time as string }));
  }
  return Object.freeze(result);
}
function rule(value: unknown): CivilRule {
  // Snapshot the discriminant without invoking getters; the selected variant is then exact.
  if (typeof value !== 'object' || value === null) refuse('INVALID_RULE');
  const kind = Object.getOwnPropertyDescriptor(value, 'kind');
  if (!kind || !('value' in kind)) refuse('INVALID_RULE');
  if (kind.value === 'ONCE') {
    const r = record(value, ['kind'], 'INVALID_RULE');
    if (r.kind !== 'ONCE') refuse('INVALID_RULE');
    return Object.freeze({ kind: 'ONCE' });
  }
  if (kind.value === 'EVERY_N_DAYS') {
    const r = record(value, ['kind', 'intervalDays'], 'INVALID_RULE');
    if (r.kind !== 'EVERY_N_DAYS') refuse('INVALID_RULE');
    if (!integer(r.intervalDays, 1, 3652059)) refuse('INVALID_RULE');
    return Object.freeze({ kind: 'EVERY_N_DAYS', intervalDays: r.intervalDays });
  }
  if (kind.value === 'WEEKDAYS') {
    const r = record(value, ['kind', 'weekdays'], 'INVALID_RULE');
    if (r.kind !== 'WEEKDAYS') refuse('INVALID_RULE');
    const days = array(r.weekdays, 7, 'INVALID_RULE');
    const result: number[] = [];
    for (const day of days) {
      if (!integer(day, 1, 7) || day <= (result.at(-1) ?? 0)) refuse('INVALID_RULE');
      result.push(day);
    }
    if (!result.length) refuse('INVALID_RULE');
    return Object.freeze({ kind: 'WEEKDAYS', weekdays: Object.freeze(result) });
  }
  return refuse('INVALID_RULE');
}
function schedule(value: unknown): CivilScheduleV1 {
  const s = record(value, [
    'version',
    'kind',
    'startDate',
    'endDate',
    'maxOccurrences',
    'rule',
    'postsPerActiveDay',
    'slots',
  ]);
  if (s.version !== 1 || s.kind !== 'CIVIL_RULE') refuse('INVALID_SCHEMA');
  const start = dayNumber(s.startDate),
    end = s.endDate === null ? null : dayNumber(s.endDate);
  const parsedRule = rule(s.rule);
  if (
    (end !== null && end < start) ||
    (s.maxOccurrences !== null && !integer(s.maxOccurrences, 1, Number.MAX_SAFE_INTEGER))
  )
    refuse('INVALID_BOUNDS');
  const parsedSlots = slots(s.slots, s.postsPerActiveDay);
  return Object.freeze({
    version: 1,
    kind: 'CIVIL_RULE',
    startDate: s.startDate as string,
    endDate: s.endDate as string | null,
    maxOccurrences: s.maxOccurrences as number | null,
    rule: parsedRule,
    postsPerActiveDay: s.postsPerActiveDay as number,
    slots: parsedSlots,
  });
}
export function snapshotCivilSchedule(value: unknown): CivilScheduleV1 | null {
  try {
    return schedule(value);
  } catch {
    return null;
  }
}
export function editCivilSlots(current: unknown, edit: unknown): EditResult {
  try {
    const prior = schedule(current);
    const e = record(edit, ['version', 'postsPerActiveDay', 'slots', 'discardSlotIds']);
    if (e.version !== 1) refuse('INVALID_SCHEMA');
    const replacement = slots(e.slots, e.postsPerActiveDay);
    const afterIds = new Set(replacement.map((slot) => slot.id));
    const old = new Map(prior.slots.map((slot) => [slot.id, slot.time]));
    const removed = prior.slots.filter((slot) => !afterIds.has(slot.id)).map((slot) => slot.id);
    const discarded = array(e.discardSlotIds, 1440, 'INVALID_DISCARD');
    const seen = new Set<string>();
    for (const id of discarded) {
      if (!uuid(id) || seen.has(id) || !old.has(id)) refuse('INVALID_DISCARD');
      seen.add(id);
    }
    if (removed.some((id) => !seen.has(id))) refuse('DISCARD_REQUIRED');
    if (discarded.length !== removed.length || discarded.some((id, i) => id !== removed[i]))
      refuse('INVALID_DISCARD');
    if (replacement.some((slot) => old.has(slot.id) && old.get(slot.id) !== slot.time))
      refuse('RETAINED_SLOT_CHANGED');
    const updated = Object.freeze({
      ...prior,
      postsPerActiveDay: e.postsPerActiveDay as number,
      slots: replacement,
    });
    return Object.freeze({
      ok: true,
      schedule: updated,
      removedSlotIds: Object.freeze(removed),
      addedSlotIds: Object.freeze(
        replacement.filter((slot) => !old.has(slot.id)).map((slot) => slot.id),
      ),
    });
  } catch (error) {
    return failure<EditCode>(error);
  }
}
function active(ruleValue: CivilRule, start: number, day: number): boolean {
  if (ruleValue.kind === 'ONCE') return day === start;
  if (ruleValue.kind === 'EVERY_N_DAYS') return (day - start) % ruleValue.intervalDays === 0;
  return ruleValue.weekdays.includes((day % 7) + 1);
}
function activeBefore(ruleValue: CivilRule, start: number, exclusive: number): number {
  const days = Math.max(0, exclusive - start);
  if (!days) return 0;
  if (ruleValue.kind === 'ONCE') return 1;
  if (ruleValue.kind === 'EVERY_N_DAYS') return Math.floor((days - 1) / ruleValue.intervalDays) + 1;
  let total = Math.floor(days / 7) * ruleValue.weekdays.length;
  for (let i = 0; i < days % 7; i++)
    if (ruleValue.weekdays.includes(((start + i) % 7) + 1)) total++;
  return total;
}
export function previewCivilOccurrences(value: unknown, request: unknown): PreviewResult {
  try {
    const s = schedule(value);
    const r = record(request, ['version', 'fromDate', 'throughDate', 'limit']);
    if (r.version !== 1) refuse('INVALID_SCHEMA');
    const from = dayNumber(r.fromDate, 'INVALID_PREVIEW'),
      through = dayNumber(r.throughDate, 'INVALID_PREVIEW');
    if (through < from || through - from >= 366 || !integer(r.limit, 1, 4096))
      refuse('INVALID_PREVIEW');
    const start = dayNumber(s.startDate),
      first = Math.max(start, from),
      end = Math.min(through, s.endDate === null ? through : dayNumber(s.endDate));
    const ordered = [...s.slots].sort((a, b) => minute(a.time) - minute(b.time));
    let ordinal = activeBefore(s.rule, start, first) * ordered.length;
    const maximum = s.maxOccurrences ?? Number.MAX_SAFE_INTEGER;
    const occurrences: CivilOccurrence[] = [];
    let next: CivilOccurrence | null = null;
    outer: for (let day = first; day <= end; day++) {
      if (ordinal >= maximum) break;
      if (!active(s.rule, start, day)) continue;
      const date = dateText(day);
      for (const slot of ordered) {
        if (ordinal >= maximum) break outer;
        const occurrence = Object.freeze({
          date,
          time: slot.time,
          slotId: slot.id,
          plannedOrdinal: ++ordinal,
        });
        if (occurrences.length === r.limit) {
          next = occurrence;
          break outer;
        }
        occurrences.push(occurrence);
      }
    }
    return Object.freeze({
      ok: true,
      kind: 'CIVIL_INTENT',
      occurrences: Object.freeze(occurrences),
      truncated: next !== null,
      next,
    });
  } catch (error) {
    return failure<PreviewCode>(error);
  }
}
