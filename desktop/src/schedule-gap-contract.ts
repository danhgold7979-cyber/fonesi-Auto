import {
  resolveCivilPreview,
  type ZoneCode,
  type ZonePreviewResult,
} from './schedule-zone-contract.js';

type Scope = Readonly<{
  scheduleId: string;
  scheduleRevision: number;
  deviceId: string;
  accountId: string;
}>;
type Warning = Readonly<{
  code: 'BELOW_30_MINUTES';
  earlierPlannedOrdinal: number;
  laterPlannedOrdinal: number;
  gapMs: number;
}>;
type GapFailure = Readonly<{ ok: false; code: ZoneCode }>;
type GapData = Readonly<{
  window: Readonly<{ fromDate: string; throughDate: string; limit: number }>;
  thresholdMs: 1800000;
  comparison: 'CONSECUTIVE_RESOLVED_INSTANTS';
  preview: Extract<ZonePreviewResult, { ok: true }>;
  coverage: 'COMPLETE_WINDOW' | 'TRUNCATED_PREFIX';
  warnings: readonly Warning[];
}>;
type UnboundScope = Readonly<{
  kind: 'UNBOUND_DRAFT';
  draftId: string;
  draftRevision: number;
}>;
export type GapPreviewResult =
  | GapFailure
  | (Readonly<{
      ok: true;
      version: 1;
      kind: 'SCHEDULE_GAP_ADVISORY';
      scope: Scope;
    }> &
      GapData);
export type UnboundGapPreviewResult =
  | GapFailure
  | (Readonly<{
      ok: true;
      version: 1;
      kind: 'UNBOUND_SCHEDULE_GAP_ADVISORY';
      scope: UnboundScope;
    }> &
      GapData);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw null;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((k) => typeof k !== 'string' || !keys.includes(k)))
    throw null;
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) throw null;
    result[key] = d.value;
  }
  return result;
}
/** Advisory only: supplied scope is attribution, never identity or execution authority. */
export function evaluateScheduleGapPreview(schedule: unknown, request: unknown): GapPreviewResult {
  let r: Record<string, unknown>, scope: Scope;
  try {
    r = record(request, ['version', 'scope', 'zone', 'fromDate', 'throughDate', 'limit']);
    const s = record(r.scope, ['scheduleId', 'scheduleRevision', 'deviceId', 'accountId']);
    if (
      r.version !== 1 ||
      !uuid(s.scheduleId) ||
      !uuid(s.deviceId) ||
      !uuid(s.accountId) ||
      typeof s.scheduleRevision !== 'number' ||
      !Number.isSafeInteger(s.scheduleRevision) ||
      s.scheduleRevision < 0 ||
      Object.is(s.scheduleRevision, -0)
    )
      throw null;
    scope = Object.freeze({
      scheduleId: s.scheduleId,
      scheduleRevision: s.scheduleRevision,
      deviceId: s.deviceId,
      accountId: s.accountId,
    });
  } catch {
    return Object.freeze({ ok: false, code: 'INVALID_SCHEMA' });
  }
  const result = resolveAndWarn(schedule, r);
  if (!result.ok) return result;
  return Object.freeze({
    ok: true,
    version: 1,
    kind: 'SCHEDULE_GAP_ADVISORY',
    scope,
    ...result.data,
  });
}
/** Unsaved local intent only: no stored schedule, device or principal binding. */
export function evaluateUnboundScheduleGapPreview(
  schedule: unknown,
  request: unknown,
): UnboundGapPreviewResult {
  let r: Record<string, unknown>, scope: UnboundScope;
  try {
    r = record(request, ['version', 'scope', 'zone', 'fromDate', 'throughDate', 'limit']);
    const s = record(r.scope, ['kind', 'draftId', 'draftRevision']);
    if (
      r.version !== 1 ||
      s.kind !== 'UNBOUND_DRAFT' ||
      !uuid(s.draftId) ||
      typeof s.draftRevision !== 'number' ||
      !Number.isSafeInteger(s.draftRevision) ||
      s.draftRevision < 0 ||
      Object.is(s.draftRevision, -0)
    )
      throw null;
    scope = Object.freeze({
      kind: 'UNBOUND_DRAFT',
      draftId: s.draftId,
      draftRevision: s.draftRevision,
    });
  } catch {
    return Object.freeze({ ok: false, code: 'INVALID_SCHEMA' });
  }
  const result = resolveAndWarn(schedule, r);
  if (!result.ok) return result;
  return Object.freeze({
    ok: true,
    version: 1,
    kind: 'UNBOUND_SCHEDULE_GAP_ADVISORY',
    scope,
    ...result.data,
  });
}
function resolveAndWarn(
  schedule: unknown,
  r: Record<string, unknown>,
): GapFailure | Readonly<{ ok: true; data: GapData }> {
  const preview = resolveCivilPreview(schedule, {
    version: 1,
    zone: r.zone,
    fromDate: r.fromDate,
    throughDate: r.throughDate,
    limit: r.limit,
  });
  if (!preview.ok) return preview;
  const rows = preview.occurrences
    .filter((row) => row.resolution !== 'SKIPPED_GAP')
    .sort((a, b) => a.utcMs - b.utcMs || a.plannedOrdinal - b.plannedOrdinal);
  const warnings: Warning[] = [];
  for (let i = 1; i < rows.length; i++) {
    const earlier = rows[i - 1],
      later = rows[i];
    if (!earlier || !later) continue;
    const gapMs = later.utcMs - earlier.utcMs;
    if (gapMs < 1800000)
      warnings.push(
        Object.freeze({
          code: 'BELOW_30_MINUTES',
          earlierPlannedOrdinal: earlier.plannedOrdinal,
          laterPlannedOrdinal: later.plannedOrdinal,
          gapMs,
        }),
      );
  }
  return Object.freeze({
    ok: true,
    data: Object.freeze({
      window: Object.freeze({
        fromDate: r.fromDate as string,
        throughDate: r.throughDate as string,
        limit: r.limit as number,
      }),
      thresholdMs: 1800000,
      comparison: 'CONSECUTIVE_RESOLVED_INSTANTS',
      preview,
      coverage: preview.truncated ? 'TRUNCATED_PREFIX' : 'COMPLETE_WINDOW',
      warnings: Object.freeze(warnings),
    }),
  });
}
