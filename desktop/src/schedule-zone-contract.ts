import { Temporal } from '@js-temporal/polyfill';
import { versions, env, execArgv, platform, arch } from 'node:process';

import { createHash } from 'node:crypto';
import { previewCivilOccurrences } from './schedule-civil-contract.js';
import type { CivilOccurrence, PreviewCode } from './schedule-civil-contract.js';

declare const __SCHEDULE_ELECTRON_CANDIDATE__: boolean;
const CANDIDATE_BUILD =
  typeof __SCHEDULE_ELECTRON_CANDIDATE__ !== 'undefined' &&
  __SCHEDULE_ELECTRON_CANDIDATE__ === true;

export const DEFAULT_SCHEDULE_ZONE = 'Asia/Ho_Chi_Minh';
const POLICY = 'GAP_SKIP_OVERLAP_EARLIER_V1';
const PROFILE = 'TEMPORAL_051_ICU_2026E_1970_2099_V1';
const EXPECTED = Object.freeze({
  node: '24.22.1',
  v8: '13.6.233.17-node.58',
  icu: '78.3',
  cldr: '48.0',
  tz: '2026e',
  unicode: '17.0',
});
// Exact source-owned tuple: independently audited Windows candidate campaign41489671719.
// No report/env/request can install another profile; unobserved tuples still refuse.
const ELECTRON_PROFILE = 'ELECTRON_4510_ICU782_2026E_1970_2099_V1';
const CANDIDATE_PROFILE = 'ELECTRON_4510_ICU782_2026E_CANDIDATE_V1';
const CANDIDATE_EXPECTED = Object.freeze({
  node: '24.22.1',
  v8: '15.6.75.19-electron.0',
  icu: '78.2',
  cldr: '48.0',
  tz: '2026e',
  unicode: '17.0',
});
const electronRuntime = versions.electron !== undefined;
const candidate = CANDIDATE_BUILD && electronRuntime;
const PROFILE_ID = electronRuntime ? (candidate ? CANDIDATE_PROFILE : ELECTRON_PROFILE) : PROFILE;
const EXPECTED_RUNTIME = electronRuntime ? CANDIDATE_EXPECTED : EXPECTED;
const PROFILE_SHA = createHash('sha256')
  .update(
    JSON.stringify({
      version: 1,
      profile: PROFILE_ID,
      policy: POLICY,
      runtime: EXPECTED_RUNTIME,
      electron: electronRuntime ? '45.1.0' : null,
      temporal: '0.5.1',
      jsbi: '4.3.2',
      alias: [DEFAULT_SCHEDULE_ZONE, 'Asia/Saigon'],
      first: '1970-01-01',
      last: '2099-12-31',
      zones: 1024,
      zoneBytes: 128,
      horizon: 366,
      limit: 4096,
    }),
  )
  .digest('hex');
const Format = Intl.DateTimeFormat;
const supported = Intl.supportedValuesOf;
const from = Temporal.ZonedDateTime.from;
const equals = Temporal.ZonedDateTime.prototype.equals;
const toPlain = Temporal.ZonedDateTime.prototype.toPlainDateTime;
export type RuntimeCode = 'RUNTIME_UNAVAILABLE' | 'DATA_VERSION_MISMATCH' | 'FORMAT_UNSUPPORTED';
export type ZoneCode =
  | PreviewCode
  | RuntimeCode
  | 'UNSUPPORTED_ZONE'
  | 'UNSUPPORTED_DATE_RANGE'
  | 'RESOLUTION_UNAVAILABLE';
export type TimezoneRuntimeV1 = Readonly<{
  version: 1;
  source: 'TEMPORAL_POLYFILL_INTL';
  runtimeKind: 'NODE' | 'ELECTRON' | 'ELECTRON_CANDIDATE';
  nodeVersion: string;
  electronVersion: string | null;
  v8Version: string;
  icuVersion: string;
  cldrVersion: string;
  tzVersion: string;
  unicodeVersion: string;
  polyfillVersion: '0.5.1';
  jsbiVersion: '4.3.2';
  profileId: string;
  profileSha256: string;
  policy: typeof POLICY;
}>;
export type RuntimeResult =
  | Readonly<{ ok: true; runtime: TimezoneRuntimeV1 }>
  | Readonly<{ ok: false; code: RuntimeCode }>;
export type ResolvedOccurrence = CivilOccurrence &
  (
    | Readonly<{
        resolution: 'UNIQUE' | 'OVERLAP_EARLIER';
        utcMs: number;
        offsetSeconds: number;
        notification: null;
      }>
    | Readonly<{
        resolution: 'SKIPPED_GAP';
        utcMs: null;
        offsetSeconds: null;
        notification: 'DST_GAP_SKIPPED';
      }>
  );
export type ZonePreviewResult =
  | Readonly<{
      ok: true;
      version: 1;
      kind: 'RESOLVED_CIVIL_PREVIEW';
      runtime: TimezoneRuntimeV1;
      zone: string;
      resolvedZone: string;
      policy: typeof POLICY;
      occurrences: readonly ResolvedOccurrence[];
      truncated: boolean;
      next: ResolvedOccurrence | null;
    }>
  | Readonly<{ ok: false; code: ZoneCode }>;
const faults = new WeakMap<object, ZoneCode>();
function refuse(code: ZoneCode): never {
  const error = Object.freeze({});
  faults.set(error, code);
  throw error;
}
function codeOf(error: unknown, fallback: ZoneCode): ZoneCode {
  return typeof error === 'object' && error !== null ? (faults.get(error) ?? fallback) : fallback;
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    return snapshotRecord(value, keys);
  } catch {
    refuse('INVALID_SCHEMA');
  }
}
function snapshotRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    refuse('INVALID_SCHEMA');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((k) => typeof k !== 'string' || !keys.includes(k)))
    refuse('INVALID_SCHEMA');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) refuse('INVALID_SCHEMA');
    result[key] = d.value;
  }
  return result;
}
function zoneSyntax(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    (value === 'UTC' || /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/.test(value)) &&
    !/[^A-Za-z0-9_+/-]/.test(value)
  );
}
function runtimeFields() {
  if (
    env.NODE_ICU_DATA !== undefined ||
    env.NODE_OPTIONS !== undefined ||
    execArgv.some((a) => a === '--icu-data-dir' || a.startsWith('--icu-data-dir='))
  )
    refuse('RUNTIME_UNAVAILABLE');
  for (const key of Object.keys(EXPECTED_RUNTIME))
    if (typeof versions[key] !== 'string' || versions[key]?.length === 0)
      refuse('RUNTIME_UNAVAILABLE');
  if (typeof Format !== 'function' || typeof supported !== 'function')
    refuse('RUNTIME_UNAVAILABLE');
  if (
    (electronRuntime
      ? versions.electron !== '45.1.0' || platform !== 'win32' || arch !== 'x64'
      : versions.electron !== undefined) ||
    Object.entries(EXPECTED_RUNTIME).some(([k, v]) => versions[k] !== v)
  )
    refuse('DATA_VERSION_MISMATCH');
  return Object.freeze({
    version: 1,
    source: 'TEMPORAL_POLYFILL_INTL',
    runtimeKind: electronRuntime ? (candidate ? 'ELECTRON_CANDIDATE' : 'ELECTRON') : 'NODE',
    nodeVersion: versions.node,
    electronVersion: electronRuntime ? (versions.electron as string) : null,
    v8Version: versions.v8,
    icuVersion: versions.icu as string,
    cldrVersion: versions.cldr as string,
    tzVersion: versions.tz as string,
    unicodeVersion: versions.unicode as string,
    polyfillVersion: '0.5.1',
    jsbiVersion: '4.3.2',
    profileId: PROFILE_ID,
    profileSha256: PROFILE_SHA,
    policy: POLICY,
  } as const);
}
function capture() {
  const runtime = runtimeFields();
  try {
    const raw = supported('timeZone');
    const length = Object.getOwnPropertyDescriptor(raw, 'length');
    if (
      !Array.isArray(raw) ||
      !length ||
      !('value' in length) ||
      !Number.isSafeInteger(length.value) ||
      length.value < 1 ||
      length.value > 1024 ||
      Reflect.ownKeys(raw).length !== length.value + 1
    )
      refuse('FORMAT_UNSUPPORTED');
    const names = new Set<string>();
    for (let i = 0; i < length.value; i++) {
      const d = Object.getOwnPropertyDescriptor(raw, String(i));
      if (!d || !('value' in d) || !zoneSyntax(d.value) || names.has(d.value))
        refuse('FORMAT_UNSUPPORTED');
      names.add(d.value);
    }
    const opts = new Format('en-US-u-ca-gregory-nu-latn', {
      timeZone: DEFAULT_SCHEDULE_ZONE,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).resolvedOptions();
    if (
      opts.timeZone !== 'Asia/Saigon' ||
      opts.calendar !== 'gregory' ||
      opts.numberingSystem !== 'latn' ||
      opts.hourCycle !== 'h23' ||
      !names.has('Asia/Saigon')
    )
      refuse('FORMAT_UNSUPPORTED');
    const a = new Temporal.ZonedDateTime(0n, DEFAULT_SCHEDULE_ZONE, 'iso8601');
    const b = new Temporal.ZonedDateTime(0n, 'Asia/Saigon', 'iso8601');
    if (!equals.call(a, b)) refuse('FORMAT_UNSUPPORTED');
    names.add('UTC');
    names.add(DEFAULT_SCHEDULE_ZONE);
    return { runtime, names };
  } catch (error) {
    refuse(codeOf(error, 'FORMAT_UNSUPPORTED'));
  }
}
export function captureTimezoneRuntime(): RuntimeResult {
  try {
    return Object.freeze({ ok: true, runtime: capture().runtime });
  } catch (error) {
    return Object.freeze({ ok: false, code: codeOf(error, 'RUNTIME_UNAVAILABLE') as RuntimeCode });
  }
}
function epoch(value: Temporal.ZonedDateTime): number {
  const ns = value.epochNanoseconds,
    ms = value.epochMilliseconds;
  if (
    typeof ns !== 'bigint' ||
    ns % 1000000n !== 0n ||
    ns / 1000000n > BigInt(Number.MAX_SAFE_INTEGER) ||
    ns / 1000000n < BigInt(-Number.MAX_SAFE_INTEGER) ||
    !Number.isSafeInteger(ms) ||
    Object.is(ms, -0) ||
    Number(ns / 1000000n) !== ms
  )
    refuse('FORMAT_UNSUPPORTED');
  return ms;
}
function scalar(value: Temporal.PlainDateTime): number {
  if (
    value.calendarId !== 'iso8601' ||
    value.millisecond !== 0 ||
    value.microsecond !== 0 ||
    value.nanosecond !== 0
  )
    refuse('FORMAT_UNSUPPORTED');
  return epoch(
    from(
      {
        year: value.year,
        month: value.month,
        day: value.day,
        hour: value.hour,
        minute: value.minute,
        second: value.second,
        millisecond: 0,
        microsecond: 0,
        nanosecond: 0,
        timeZone: 'UTC',
        calendar: 'iso8601',
      },
      { overflow: 'reject', disambiguation: 'reject' },
    ),
  );
}
function facts(value: Temporal.ZonedDateTime) {
  const ms = epoch(value),
    ns = value.offsetNanoseconds;
  if (
    !Number.isSafeInteger(ns) ||
    Object.is(ns, -0) ||
    ns % 1000000000 !== 0 ||
    Math.abs(ns) >= 86400000000000
  )
    refuse('FORMAT_UNSUPPORTED');
  const seconds = ns / 1000000000,
    local = scalar(toPlain.call(value));
  if (!Number.isSafeInteger(ms + seconds * 1000) || local !== ms + seconds * 1000)
    refuse('RESOLUTION_UNAVAILABLE');
  return { ms, seconds, local };
}
function resolveRow(row: CivilOccurrence, zone: string): ResolvedOccurrence {
  try {
    const fields = {
      year: Number(row.date.slice(0, 4)),
      month: Number(row.date.slice(5, 7)),
      day: Number(row.date.slice(8, 10)),
      hour: Number(row.time.slice(0, 2)),
      minute: Number(row.time.slice(3, 5)),
      second: 0,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0,
      calendar: 'iso8601',
      timeZone: zone,
    };
    const wanted = epoch(
      from({ ...fields, timeZone: 'UTC' }, { overflow: 'reject', disambiguation: 'reject' }),
    );
    const early = facts(from(fields, { overflow: 'reject', disambiguation: 'earlier' }));
    const late = facts(from(fields, { overflow: 'reject', disambiguation: 'later' }));
    if (early.local === wanted && late.local === wanted) {
      if (early.ms === late.ms && early.seconds === late.seconds)
        return Object.freeze({
          ...row,
          resolution: 'UNIQUE',
          utcMs: early.ms,
          offsetSeconds: early.seconds,
          notification: null,
        });
      if (
        early.ms < late.ms &&
        early.seconds > late.seconds &&
        late.ms - early.ms === (early.seconds - late.seconds) * 1000
      )
        return Object.freeze({
          ...row,
          resolution: 'OVERLAP_EARLIER',
          utcMs: early.ms,
          offsetSeconds: early.seconds,
          notification: null,
        });
    } else {
      const delta = (late.seconds - early.seconds) * 1000;
      if (
        delta > 0 &&
        delta <= 86400000 &&
        late.ms - early.ms === delta &&
        early.local === wanted - delta &&
        late.local === wanted + delta
      )
        return Object.freeze({
          ...row,
          resolution: 'SKIPPED_GAP',
          utcMs: null,
          offsetSeconds: null,
          notification: 'DST_GAP_SKIPPED',
        });
    }
    refuse('RESOLUTION_UNAVAILABLE');
  } catch (error) {
    refuse(codeOf(error, 'RESOLUTION_UNAVAILABLE'));
  }
}
export function resolveCivilPreview(schedule: unknown, request: unknown): ZonePreviewResult {
  try {
    const r = record(request, ['version', 'zone', 'fromDate', 'throughDate', 'limit']);
    if (
      r.version !== 1 ||
      !zoneSyntax(r.zone) ||
      typeof r.fromDate !== 'string' ||
      r.fromDate.length !== 10 ||
      typeof r.throughDate !== 'string' ||
      r.throughDate.length !== 10 ||
      typeof r.limit !== 'number' ||
      !Number.isSafeInteger(r.limit) ||
      Object.is(r.limit, -0)
    )
      refuse('INVALID_SCHEMA');
    const civil = previewCivilOccurrences(schedule, {
      version: 1,
      fromDate: r.fromDate,
      throughDate: r.throughDate,
      limit: r.limit,
    });
    if (!civil.ok) return civil;
    if (r.fromDate < '1970-01-01' || r.throughDate > '2099-12-31') refuse('UNSUPPORTED_DATE_RANGE');
    const { runtime, names } = capture();
    if (!names.has(r.zone)) refuse('UNSUPPORTED_ZONE');
    const resolvedZone = new Format('en-US', { timeZone: r.zone }).resolvedOptions().timeZone;
    if (
      !names.has(resolvedZone) ||
      (r.zone === DEFAULT_SCHEDULE_ZONE && resolvedZone !== 'Asia/Saigon')
    )
      refuse('FORMAT_UNSUPPORTED');
    const occurrences = Object.freeze(
      civil.occurrences.map((row) => resolveRow(row, r.zone as string)),
    );
    const next = civil.next === null ? null : resolveRow(civil.next, r.zone);
    if (JSON.stringify(runtimeFields()) !== JSON.stringify(runtime))
      refuse('DATA_VERSION_MISMATCH');
    return Object.freeze({
      ok: true,
      version: 1,
      kind: 'RESOLVED_CIVIL_PREVIEW',
      runtime,
      zone: r.zone,
      resolvedZone,
      policy: POLICY,
      occurrences,
      truncated: civil.truncated,
      next,
    });
  } catch (error) {
    return Object.freeze({ ok: false, code: codeOf(error, 'RESOLUTION_UNAVAILABLE') });
  }
}
