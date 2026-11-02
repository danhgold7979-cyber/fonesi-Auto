// Supplied observations only: no acquisition, autonomous timer, identity or action authority.
import {
  validateCapturePng,
  normalizeHierarchyXml,
  classifyCaptureEvidence,
} from './capture-contract.ts';
import { snapshotDisplayEvidence, type DisplayEvidence } from './input-contract.ts';
export type StabilityCode =
  | 'INSUFFICIENT_SAMPLES'
  | 'CHANGED'
  | 'OBSERVATION_GAP'
  | 'EXACT_SUPPLIED_MATCH'
  | 'DEADLINE_EXCEEDED'
  | 'CANCELLED'
  | 'INVALID_INPUT'
  | 'INVALID_CAPTURE'
  | 'CAPTURE_LIMIT'
  | 'DISPLAY_MISMATCH'
  | 'STALE_CAPTURE'
  | 'ROTATED'
  | 'BINDING_CHANGED'
  | 'DISCONNECTED'
  | 'CONTEXT_CHANGED'
  | 'CLOCK_REGRESSION'
  | 'DUPLICATE_OBSERVATION'
  | 'OBSERVATION_LIMIT'
  | 'REENTRANT_CALL';
export type StabilitySnapshot = Readonly<{
  version: 1;
  source: 'SUPPLIED_STABILITY_V1';
  state: 'WAITING' | 'STABLE' | 'TIMEOUT' | 'CANCELLED' | 'UNAVAILABLE';
  code: StabilityCode;
  samplesSeen: number;
  consecutiveSamples: number;
  windowStartMonotonicMs: number | null;
  lastObservationMonotonicMs: number | null;
  deadlineMonotonicMs: number;
  pixelSha256: string | null;
  hierarchySha256: string | null;
  evidenceId: string | null;
  observedUtc: number | null;
}>;
export type SuppliedScreenStability = Readonly<{
  observe(frame: unknown, currentContext: unknown, clock: unknown): StabilitySnapshot;
  tick(currentContext: unknown, clock: unknown): StabilitySnapshot;
  cancel(): StabilitySnapshot;
  snapshot(): StabilitySnapshot;
}>;
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min && v <= max;
function text(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 256) return false;
  for (const c of v) {
    const n = c.codePointAt(0) ?? 0;
    if (
      (n < 32 && ![9, 10, 13].includes(n)) ||
      (n >= 0xd800 && n <= 0xdfff) ||
      n === 0xfffe ||
      n === 0xffff
    )
      return false;
  }
  return true;
}
function record(
  value: unknown,
  keys: readonly string[],
  live: () => boolean,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !live()) return null;
  const names = Reflect.ownKeys(value);
  if (
    !live() ||
    names.length !== keys.length ||
    names.some((k) => typeof k !== 'string' || !keys.includes(k))
  )
    return null;
  const out: Record<string, unknown> = Object.create(null);
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!live() || !d || !('value' in d) || !d.enumerable) return null;
    out[k] = d.value;
  }
  return out;
}
const displayKeys = [
  'version',
  'evidenceId',
  'deviceId',
  'bindingId',
  'generation',
  'serial',
  'displayId',
  'width',
  'height',
  'rotation',
  'orientationEpoch',
  'observedUtc',
  'validUntilUtc',
  'source',
] as const;
function display(value: unknown, live: () => boolean): DisplayEvidence | null {
  const v = record(value, displayKeys, live);
  return v && live() ? snapshotDisplayEvidence(v) : null;
}
const contextKeys = [
  'profileId',
  'appPackage',
  'appVersion',
  'locale',
  'appRevision',
  'screenRevision',
  'ownershipRevision',
  'connected',
  'display',
] as const;
type Context = { values: Record<string, unknown>; display: DisplayEvidence; connected: boolean };
function context(value: unknown, live: () => boolean): Context | null {
  const v = record(value, contextKeys, live);
  if (
    !v ||
    !['profileId', 'appPackage', 'appVersion', 'locale'].every((k) => text(v[k])) ||
    !['appRevision', 'screenRevision', 'ownershipRevision'].every((k) => integer(v[k])) ||
    typeof v.connected !== 'boolean'
  )
    return null;
  const d = display(v.display, live);
  return d && live()
    ? { values: Object.freeze({ ...v, display: d }), display: d, connected: v.connected }
    : null;
}
function clock(value: unknown, live: () => boolean): { monotonicMs: number; utcMs: number } | null {
  const v = record(value, ['monotonicMs', 'utcMs'], live);
  return v && integer(v.monotonicMs) && integer(v.utcMs, 0, 8640000000000000)
    ? { monotonicMs: v.monotonicMs, utcMs: v.utcMs }
    : null;
}
function changed(a: Context, b: Context): StabilityCode | null {
  if (!b.connected) return 'DISCONNECTED';
  for (const k of ['deviceId', 'bindingId', 'generation', 'serial'] as const)
    if (a.display[k] !== b.display[k]) return 'BINDING_CHANGED';
  for (const k of ['displayId', 'width', 'height', 'rotation', 'orientationEpoch'] as const)
    if (a.display[k] !== b.display[k]) return 'ROTATED';
  if (a.display.source !== b.display.source) return 'CONTEXT_CHANGED';
  for (const k of [
    'profileId',
    'appPackage',
    'appVersion',
    'locale',
    'appRevision',
    'screenRevision',
    'ownershipRevision',
  ])
    if (a.values[k] !== b.values[k]) return 'CONTEXT_CHANGED';
  return null;
}
function fresh(d: DisplayEvidence, utc: number): boolean {
  return classifyCaptureEvidence(d, d, utc, true) === 'CURRENT';
}
export function createSuppliedScreenStability(
  policy: unknown,
  initialContext: unknown,
  initialClock: unknown,
): SuppliedScreenStability | null {
  try {
    const yes = () => true,
      p = record(
        policy,
        ['version', 'kind', 'minimumSamples', 'stableForMs', 'maximumGapMs', 'timeoutMs'],
        yes,
      ),
      initial = context(initialContext, yes),
      start = clock(initialClock, yes);
    if (
      p?.version !== 1 ||
      p.kind !== 'SUPPLIED_EXACT_EQUALITY_V1' ||
      !integer(p.minimumSamples, 2, 8) ||
      !integer(p.stableForMs, 1, 10000) ||
      !integer(p.maximumGapMs, 1, 5000) ||
      !integer(p.timeoutMs, 1, 30000) ||
      p.stableForMs > p.timeoutMs ||
      p.maximumGapMs > p.timeoutMs ||
      !initial ||
      !start ||
      !initial.connected ||
      !fresh(initial.display, start.utcMs) ||
      !Number.isSafeInteger(start.monotonicMs + p.timeoutMs)
    )
      return null;
    const admittedContext = initial;
    const minimumSamples = p.minimumSamples,
      stableForMs = p.stableForMs,
      maximumGapMs = p.maximumGapMs,
      deadline = start.monotonicMs + p.timeoutMs;
    let state: StabilitySnapshot = Object.freeze({
      version: 1,
      source: 'SUPPLIED_STABILITY_V1',
      state: 'WAITING',
      code: 'INSUFFICIENT_SAMPLES',
      samplesSeen: 0,
      consecutiveSamples: 0,
      windowStartMonotonicMs: null,
      lastObservationMonotonicMs: null,
      deadlineMonotonicMs: deadline,
      pixelSha256: null,
      hierarchySha256: null,
      evidenceId: null,
      observedUtc: null,
    });
    let busy = false,
      generation = 0,
      lastClock = start,
      lastDisplay: DisplayEvidence | null = null,
      lastSequence = 0,
      lastObserved = -1,
      decodedBytes = 0;
    const ids = new Set<string>();
    const cleared = (
      base: StabilitySnapshot,
      kind: StabilitySnapshot['state'],
      code: StabilityCode,
    ): StabilitySnapshot =>
      Object.freeze({
        ...base,
        state: kind,
        code,
        consecutiveSamples: 0,
        windowStartMonotonicMs: null,
        lastObservationMonotonicMs: null,
        pixelSha256: null,
        hierarchySha256: null,
        evidenceId: null,
        observedUtc: null,
      });
    const terminal = (kind: StabilitySnapshot['state'], code: StabilityCode): StabilitySnapshot => {
      generation++;
      lastDisplay = null;
      ids.clear();
      state = cleared(state, kind, code);
      return state;
    };
    const cancel = () => (state.state === 'WAITING' ? terminal('CANCELLED', 'CANCELLED') : state);
    function run(
      hasFrame: boolean,
      rawFrame: unknown,
      rawContext: unknown,
      rawClock: unknown,
    ): StabilitySnapshot {
      if (state.state !== 'WAITING') return state;
      if (busy) return cleared(state, 'UNAVAILABLE', 'REENTRANT_CALL');
      busy = true;
      const operation = generation,
        live = () => generation === operation && state.state === 'WAITING';
      const refuse = (code: StabilityCode) => (live() ? terminal('UNAVAILABLE', code) : state);
      try {
        const c = clock(rawClock, live);
        if (!live()) return state;
        if (!c) return refuse('INVALID_INPUT');
        const current = context(rawContext, live);
        if (!live()) return state;
        if (!current) return refuse('INVALID_INPUT');
        if (c.monotonicMs < lastClock.monotonicMs || c.utcMs < lastClock.utcMs)
          return refuse('CLOCK_REGRESSION');
        if (c.monotonicMs >= deadline) return terminal('TIMEOUT', 'DEADLINE_EXCEEDED');
        const loss = changed(admittedContext, current);
        if (loss) return refuse(loss);
        if (!fresh(current.display, c.utcMs) || (lastDisplay && !fresh(lastDisplay, c.utcMs)))
          return refuse('STALE_CAPTURE');
        if (!hasFrame) {
          if (!live()) return state;
          lastClock = c;
          if (
            state.lastObservationMonotonicMs !== null &&
            c.monotonicMs - state.lastObservationMonotonicMs > maximumGapMs
          )
            state = cleared(state, 'WAITING', 'OBSERVATION_GAP');
          return state;
        }
        const f = record(rawFrame, ['version', 'sequence', 'png', 'xml', 'display'], live);
        if (!live()) return state;
        if (f?.version !== 1 || !integer(f.sequence, 1) || typeof f.xml !== 'string')
          return refuse('INVALID_INPUT');
        const d = display(f.display, live);
        if (!live()) return state;
        if (!d) return refuse('INVALID_INPUT');
        const freshness = classifyCaptureEvidence(d, current.display, c.utcMs, true);
        if (freshness !== 'CURRENT')
          return refuse(
            freshness === 'STALE'
              ? 'STALE_CAPTURE'
              : freshness === 'INVALID_CAPTURE'
                ? 'INVALID_CAPTURE'
                : freshness,
          );
        if (ids.has(d.evidenceId) || f.sequence <= lastSequence || d.observedUtc <= lastObserved)
          return refuse('DUPLICATE_OBSERVATION');
        if (state.samplesSeen >= 16) return refuse('OBSERVATION_LIMIT');
        if (!live()) return state;
        const png = validateCapturePng(f.png, d);
        if (!live()) return state;
        if (!png.ok) return refuse(png.code);
        const xml = normalizeHierarchyXml(f.xml, d);
        if (!live()) return state;
        if (!xml.ok) return refuse(xml.code);
        const gap =
          state.lastObservationMonotonicMs !== null &&
          c.monotonicMs - state.lastObservationMonotonicMs > maximumGapMs;
        const equal =
          state.pixelSha256 === png.pixelSha256 &&
          state.hierarchySha256 === xml.tree.sha256 &&
          decodedBytes === png.decodedBytes;
        const continuing = equal && !gap && state.windowStartMonotonicMs !== null;
        const consecutive = continuing ? state.consecutiveSamples + 1 : 1,
          window = continuing ? state.windowStartMonotonicMs : c.monotonicMs;
        if (window === null) return refuse('INVALID_INPUT');
        const stable = consecutive >= minimumSamples && c.monotonicMs - window >= stableForMs;
        const next: StabilitySnapshot = Object.freeze({
          version: 1,
          source: 'SUPPLIED_STABILITY_V1',
          state: stable ? 'STABLE' : 'WAITING',
          code: stable
            ? 'EXACT_SUPPLIED_MATCH'
            : gap
              ? 'OBSERVATION_GAP'
              : state.samplesSeen > 0 && !equal && state.pixelSha256 !== null
                ? 'CHANGED'
                : 'INSUFFICIENT_SAMPLES',
          samplesSeen: state.samplesSeen + 1,
          consecutiveSamples: consecutive,
          windowStartMonotonicMs: window,
          lastObservationMonotonicMs: c.monotonicMs,
          deadlineMonotonicMs: deadline,
          pixelSha256: png.pixelSha256,
          hierarchySha256: xml.tree.sha256,
          evidenceId: d.evidenceId,
          observedUtc: d.observedUtc,
        });
        if (!live()) return state;
        lastClock = c;
        lastSequence = f.sequence;
        lastObserved = d.observedUtc;
        decodedBytes = png.decodedBytes;
        ids.add(d.evidenceId);
        lastDisplay = d;
        state = next;
        if (stable) {
          generation++;
          lastDisplay = null;
          ids.clear();
        }
        return state;
      } catch {
        return refuse('INVALID_INPUT');
      } finally {
        busy = false;
      }
    }
    return Object.freeze({
      observe: (frame: unknown, c: unknown, time: unknown) => run(true, frame, c, time),
      tick: (c: unknown, time: unknown) => run(false, null, c, time),
      cancel,
      snapshot: () => state,
    });
  } catch {
    return null;
  }
}
