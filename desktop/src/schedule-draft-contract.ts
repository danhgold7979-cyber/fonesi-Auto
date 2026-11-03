import {
  previewCivilOccurrences,
  snapshotCivilSchedule,
  type CivilScheduleV1,
} from './schedule-civil-contract.js';
import type { UnboundGapPreviewResult } from './schedule-gap-contract.js';
import type { ResolvedOccurrence, TimezoneRuntimeV1, ZoneCode } from './schedule-zone-contract.js';

export const SCHEDULE_DRAFT_CHANNEL = 'foundation:schedule-draft:v1';
export const SCHEDULE_DRAFT_CODES = Object.freeze([
  'INVALID_TRANSPORT',
  'PAYLOAD_TOO_LARGE',
  'INVALID_JSON',
  'INVALID_SHAPE',
  'UNSUPPORTED_VERSION',
  'UNKNOWN_METHOD',
  'UNTRUSTED_SENDER',
  'SESSION_UNAVAILABLE',
  'SESSION_REVOKED',
  'BUSY',
  'TIMEOUT',
  'CANCELLED',
  'INTERNAL_FAILURE',
  'INVALID_SCHEMA',
  'INVALID_DATE',
  'INVALID_RULE',
  'INVALID_BOUNDS',
  'INVALID_SLOTS',
  'INVALID_PREVIEW',
  'RUNTIME_UNAVAILABLE',
  'DATA_VERSION_MISMATCH',
  'FORMAT_UNSUPPORTED',
  'UNSUPPORTED_ZONE',
  'UNSUPPORTED_DATE_RANGE',
  'RESOLUTION_UNAVAILABLE',
] as const);
export type ScheduleDraftCode = (typeof SCHEDULE_DRAFT_CODES)[number];
// Keep the fixed domain vocabulary exhaustive without loading the live resolver.
const domainCodes: Record<ZoneCode, true> = {
  INVALID_SCHEMA: true,
  INVALID_DATE: true,
  INVALID_RULE: true,
  INVALID_BOUNDS: true,
  INVALID_SLOTS: true,
  INVALID_PREVIEW: true,
  RUNTIME_UNAVAILABLE: true,
  DATA_VERSION_MISMATCH: true,
  FORMAT_UNSUPPORTED: true,
  UNSUPPORTED_ZONE: true,
  UNSUPPORTED_DATE_RANGE: true,
  RESOLUTION_UNAVAILABLE: true,
};
void domainCodes;
export type ScheduleDraftInput = Readonly<{
  schedule: CivilScheduleV1;
  request: Readonly<{
    version: 1;
    scope: Readonly<{ kind: 'UNBOUND_DRAFT'; draftId: string; draftRevision: number }>;
    zone: string;
    fromDate: string;
    throughDate: string;
    limit: number;
  }>;
}>;
export type ScheduleDraftRequest = ScheduleDraftInput &
  Readonly<{
    version: 1;
    requestId: string;
    method: 'schedule.draft.preview';
  }>;
type Success = Extract<UnboundGapPreviewResult, { ok: true }>;
export type ScheduleDraftResponse =
  | Readonly<{ version: 1; ok: true; requestId: string; preview: Success }>
  | Readonly<{ version: 1; ok: false; requestId: string | null; code: ScheduleDraftCode }>;
const MAX_BYTES = 128 * 1024;
const POLICY = 'GAP_SKIP_OVERLAP_EARLIER_V1';
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw null;
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  requireValue(
    value !== null &&
      typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
  const own = Reflect.ownKeys(value);
  requireValue(
    own.length === keys.length && own.every((k) => typeof k === 'string' && keys.includes(k)),
  );
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    requireValue(d && 'value' in d && d.enumerable);
    out[key] = d.value;
  }
  return out;
}
function array(value: unknown, maximum: number): unknown[] {
  requireValue(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype);
  const d = Object.getOwnPropertyDescriptor(value, 'length');
  requireValue(d && 'value' in d && integer(d.value, 0, maximum));
  requireValue(Reflect.ownKeys(value).length === d.value + 1);
  const out: unknown[] = [];
  for (let i = 0; i < d.value; i++) {
    const item = Object.getOwnPropertyDescriptor(value, String(i));
    requireValue(item && 'value' in item && item.enumerable);
    out.push(item.value);
  }
  return out;
}
function integer(v: unknown, low: number, high = Number.MAX_SAFE_INTEGER): v is number {
  return (
    typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= low && v <= high
  );
}
function uuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
  );
}
function requestId(v: unknown): v is string {
  return typeof v === 'string' && /^d[1-9][0-9]{0,15}$/.test(v) && integer(Number(v.slice(1)), 1);
}
function zone(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length <= 128 &&
    (v === 'UTC' || /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/.test(v))
  );
}
const dateProbe = Object.freeze({
  version: 1,
  kind: 'CIVIL_RULE',
  startDate: '1970-01-01',
  endDate: null,
  maxOccurrences: null,
  rule: Object.freeze({ kind: 'ONCE' }),
  postsPerActiveDay: 1,
  slots: Object.freeze([
    Object.freeze({ id: '00000000-0000-4000-8000-000000000000', time: '00:00' }),
  ]),
});
function windowSnapshot(value: unknown) {
  const w = record(value, ['fromDate', 'throughDate', 'limit']);
  requireValue(
    typeof w.fromDate === 'string' &&
      typeof w.throughDate === 'string' &&
      w.fromDate >= '1970-01-01' &&
      w.throughDate <= '2099-12-31' &&
      integer(w.limit, 1, 128),
  );
  requireValue(previewCivilOccurrences(dateProbe, { version: 1, ...w }).ok);
  return Object.freeze({ fromDate: w.fromDate, throughDate: w.throughDate, limit: w.limit });
}
function date(v: unknown): v is string {
  if (typeof v !== 'string' || v < '1970-01-01' || v > '2099-12-31') return false;
  return snapshotCivilSchedule({ ...dateProbe, startDate: v }) !== null;
}
function scopeSnapshot(value: unknown) {
  const s = record(value, ['kind', 'draftId', 'draftRevision']);
  requireValue(s.kind === 'UNBOUND_DRAFT' && uuid(s.draftId) && integer(s.draftRevision, 0));
  return Object.freeze({
    kind: 'UNBOUND_DRAFT' as const,
    draftId: s.draftId,
    draftRevision: s.draftRevision,
  });
}
export function snapshotScheduleDraftInput(value: unknown): ScheduleDraftInput | null {
  try {
    const i = record(value, ['schedule', 'request']);
    const schedule = snapshotCivilSchedule(i.schedule);
    requireValue(schedule);
    const r = record(i.request, ['version', 'scope', 'zone', 'fromDate', 'throughDate', 'limit']);
    requireValue(r.version === 1 && zone(r.zone));
    const window = windowSnapshot({
      fromDate: r.fromDate,
      throughDate: r.throughDate,
      limit: r.limit,
    });
    return Object.freeze({
      schedule,
      request: Object.freeze({
        version: 1,
        scope: scopeSnapshot(r.scope),
        zone: r.zone,
        ...window,
      }),
    });
  } catch {
    return null;
  }
}
function decode(raw: unknown): { value: unknown } | { code: ScheduleDraftCode } {
  if (typeof raw !== 'string') return { code: 'INVALID_TRANSPORT' };
  if (raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES)
    return { code: 'PAYLOAD_TOO_LARGE' };
  try {
    const value: unknown = JSON.parse(raw);
    if (JSON.stringify(value) !== raw) return { code: 'INVALID_JSON' };
    return { value };
  } catch {
    return { code: 'INVALID_JSON' };
  }
}
export function parseScheduleDraftRequest(
  raw: unknown,
):
  | Readonly<{ ok: true; value: ScheduleDraftRequest }>
  | Readonly<{ ok: false; code: ScheduleDraftCode }> {
  const decoded = decode(raw);
  if ('code' in decoded) return Object.freeze({ ok: false, code: decoded.code });
  try {
    const r = record(decoded.value, ['version', 'requestId', 'method', 'schedule', 'request']);
    if (r.version !== 1) return Object.freeze({ ok: false, code: 'UNSUPPORTED_VERSION' });
    if (r.method !== 'schedule.draft.preview')
      return Object.freeze({ ok: false, code: 'UNKNOWN_METHOD' });
    requireValue(requestId(r.requestId));
    const input = snapshotScheduleDraftInput({ schedule: r.schedule, request: r.request });
    requireValue(input);
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        version: 1,
        requestId: r.requestId,
        method: 'schedule.draft.preview',
        ...input,
      }),
    });
  } catch {
    return Object.freeze({ ok: false, code: 'INVALID_SHAPE' });
  }
}
function runtimeSnapshot(value: unknown): TimezoneRuntimeV1 {
  const r = record(value, [
    'version',
    'source',
    'runtimeKind',
    'nodeVersion',
    'electronVersion',
    'v8Version',
    'icuVersion',
    'cldrVersion',
    'tzVersion',
    'unicodeVersion',
    'polyfillVersion',
    'jsbiVersion',
    'profileId',
    'profileSha256',
    'policy',
  ]);
  requireValue(
    r.version === 1 &&
      r.source === 'TEMPORAL_POLYFILL_INTL' &&
      r.policy === POLICY &&
      r.polyfillVersion === '0.5.1' &&
      r.jsbiVersion === '4.3.2',
  );
  const profiles = {
    NODE: 'TEMPORAL_051_ICU_2026E_1970_2099_V1',
    ELECTRON: 'ELECTRON_4510_ICU782_2026E_1970_2099_V1',
    ELECTRON_CANDIDATE: 'ELECTRON_4510_ICU782_2026E_CANDIDATE_V1',
  } as const;
  requireValue(
    r.runtimeKind === 'NODE' ||
      r.runtimeKind === 'ELECTRON' ||
      r.runtimeKind === 'ELECTRON_CANDIDATE',
  );
  requireValue(r.profileId === profiles[r.runtimeKind]);
  for (const key of ['nodeVersion', 'v8Version', 'icuVersion', 'cldrVersion', 'unicodeVersion'])
    requireValue(typeof r[key] === 'string' && /^[0-9][0-9A-Za-z.-]{0,63}$/.test(r[key]));
  requireValue(typeof r.tzVersion === 'string' && /^[0-9]{4}[a-z]$/.test(r.tzVersion));
  requireValue(
    r.runtimeKind === 'NODE'
      ? r.electronVersion === null
      : typeof r.electronVersion === 'string' &&
          /^[0-9][0-9A-Za-z.-]{0,63}$/.test(r.electronVersion),
  );
  requireValue(typeof r.profileSha256 === 'string' && /^[0-9a-f]{64}$/.test(r.profileSha256));
  return Object.freeze(r) as TimezoneRuntimeV1;
}
function rowSnapshot(value: unknown): ResolvedOccurrence {
  const r = record(value, [
    'date',
    'time',
    'slotId',
    'plannedOrdinal',
    'resolution',
    'utcMs',
    'offsetSeconds',
    'notification',
  ]);
  requireValue(
    date(r.date) &&
      typeof r.time === 'string' &&
      /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(r.time) &&
      typeof r.slotId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.slotId) &&
      integer(r.plannedOrdinal, 1),
  );
  if (r.resolution === 'SKIPPED_GAP')
    requireValue(
      r.utcMs === null && r.offsetSeconds === null && r.notification === 'DST_GAP_SKIPPED',
    );
  else
    requireValue(
      (r.resolution === 'UNIQUE' || r.resolution === 'OVERLAP_EARLIER') &&
        integer(r.utcMs, -86400000, 4102531200000) &&
        integer(r.offsetSeconds, -86399, 86399) &&
        r.notification === null,
    );
  return Object.freeze(r) as ResolvedOccurrence;
}
function successSnapshot(value: unknown): Success {
  const s = record(value, [
    'ok',
    'version',
    'kind',
    'scope',
    'window',
    'thresholdMs',
    'comparison',
    'preview',
    'coverage',
    'warnings',
  ]);
  requireValue(
    s.ok === true &&
      s.version === 1 &&
      s.kind === 'UNBOUND_SCHEDULE_GAP_ADVISORY' &&
      s.thresholdMs === 1800000 &&
      s.comparison === 'CONSECUTIVE_RESOLVED_INSTANTS',
  );
  const scope = scopeSnapshot(s.scope),
    window = windowSnapshot(s.window);
  const p = record(s.preview, [
    'ok',
    'version',
    'kind',
    'runtime',
    'zone',
    'resolvedZone',
    'policy',
    'occurrences',
    'truncated',
    'next',
  ]);
  requireValue(
    p.ok === true &&
      p.version === 1 &&
      p.kind === 'RESOLVED_CIVIL_PREVIEW' &&
      p.policy === POLICY &&
      zone(p.zone) &&
      zone(p.resolvedZone) &&
      typeof p.truncated === 'boolean',
  );
  const occurrences = Object.freeze(array(p.occurrences, window.limit).map(rowSnapshot));
  const next = p.next === null ? null : rowSnapshot(p.next);
  requireValue(
    p.truncated
      ? next !== null && occurrences.length === window.limit && s.coverage === 'TRUNCATED_PREFIX'
      : next === null && s.coverage === 'COMPLETE_WINDOW',
  );
  let prior: ResolvedOccurrence | undefined;
  for (const row of next === null ? occurrences : [...occurrences, next]) {
    requireValue(row.date >= window.fromDate && row.date <= window.throughDate);
    if (prior)
      requireValue(
        row.plannedOrdinal === prior.plannedOrdinal + 1 &&
          (row.date > prior.date || (row.date === prior.date && row.time > prior.time)),
      );
    prior = row;
  }
  const resolved = occurrences
    .filter((r) => r.resolution !== 'SKIPPED_GAP')
    .sort((a, b) => a.utcMs - b.utcMs || a.plannedOrdinal - b.plannedOrdinal);
  const expected = resolved.slice(1).flatMap((r, i) => {
    const earlier = resolved[i];
    return earlier && r.utcMs - earlier.utcMs < 1800000
      ? [
          {
            code: 'BELOW_30_MINUTES' as const,
            earlierPlannedOrdinal: earlier.plannedOrdinal,
            laterPlannedOrdinal: r.plannedOrdinal,
            gapMs: r.utcMs - earlier.utcMs,
          },
        ]
      : [];
  });
  const warnings = Object.freeze(
    array(s.warnings, 127).map((value, i) => {
      const w = record(value, ['code', 'earlierPlannedOrdinal', 'laterPlannedOrdinal', 'gapMs']);
      const e = expected[i];
      requireValue(
        e &&
          w.code === e.code &&
          w.earlierPlannedOrdinal === e.earlierPlannedOrdinal &&
          w.laterPlannedOrdinal === e.laterPlannedOrdinal &&
          integer(w.gapMs, 0, 1799999) &&
          w.gapMs === e.gapMs,
      );
      return Object.freeze({ ...e });
    }),
  );
  requireValue(warnings.length === expected.length);
  return Object.freeze({
    ok: true,
    version: 1,
    kind: 'UNBOUND_SCHEDULE_GAP_ADVISORY',
    scope,
    window,
    thresholdMs: 1800000,
    comparison: 'CONSECUTIVE_RESOLVED_INSTANTS',
    preview: Object.freeze({
      ok: true,
      version: 1,
      kind: 'RESOLVED_CIVIL_PREVIEW',
      runtime: runtimeSnapshot(p.runtime),
      zone: p.zone,
      resolvedZone: p.resolvedZone,
      policy: POLICY,
      occurrences,
      truncated: p.truncated,
      next,
    }),
    coverage: p.truncated ? 'TRUNCATED_PREFIX' : 'COMPLETE_WINDOW',
    warnings,
  });
}
export function parseScheduleDraftResponse(raw: unknown): ScheduleDraftResponse | null {
  const decoded = decode(raw);
  if ('code' in decoded) return null;
  try {
    const value = decoded.value;
    requireValue(value !== null && typeof value === 'object');
    const ok = Object.getOwnPropertyDescriptor(value, 'ok');
    requireValue(ok && 'value' in ok);
    if (ok.value === true) {
      const r = record(value, ['version', 'ok', 'requestId', 'preview']);
      requireValue(r.version === 1 && requestId(r.requestId));
      return Object.freeze({
        version: 1,
        ok: true,
        requestId: r.requestId,
        preview: successSnapshot(r.preview),
      });
    }
    const r = record(value, ['version', 'ok', 'requestId', 'code']);
    requireValue(
      r.version === 1 &&
        r.ok === false &&
        (r.requestId === null || requestId(r.requestId)) &&
        typeof r.code === 'string' &&
        SCHEDULE_DRAFT_CODES.some((code) => code === r.code),
    );
    return Object.freeze({
      version: 1,
      ok: false,
      requestId: r.requestId,
      code: r.code as ScheduleDraftCode,
    });
  } catch {
    return null;
  }
}
export function scheduleDraftError(id: string | null, code: ScheduleDraftCode): string {
  return JSON.stringify({
    version: 1,
    ok: false,
    requestId: requestId(id) ? id : null,
    code: SCHEDULE_DRAFT_CODES.includes(code) ? code : 'INTERNAL_FAILURE',
  });
}
export function scheduleDraftSuccess(id: string, preview: unknown): string | null {
  try {
    requireValue(requestId(id));
    const raw = JSON.stringify({
      version: 1,
      ok: true,
      requestId: id,
      preview: successSnapshot(preview),
    });
    return new TextEncoder().encode(raw).length <= MAX_BYTES ? raw : null;
  } catch {
    return null;
  }
}
