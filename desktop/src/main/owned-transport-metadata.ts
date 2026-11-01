/** Main-only sealed-target composition; never accepts provider/clock/authority callbacks. */
import { randomUUID } from 'node:crypto';
import { inspectOwnedMetadataTarget, type OwnedMetadataTarget } from './adb-discovery-service.ts';
import {
  createDeviceActor,
  type DeviceQueueBudget,
  type ActorResult,
  type ActorCode,
} from './device-actor.ts';
import {
  METADATA_QUERY_FIELDS,
  validMetadataField,
  validMetadataDeadline,
  type MetadataQueryField,
  type MetadataQueryRequest,
} from './metadata-query-contract.ts';
import { parseAdbMetadata, staleMetadata, type MetadataResult } from './adb-metadata.ts';
const systemClock = Date.now,
  uuid = randomUUID;
const claimed = new WeakSet<object>();
type Target = NonNullable<ReturnType<typeof inspectOwnedMetadataTarget>>['target'];
type Observation = Readonly<{ target: Target; metadata: MetadataResult }>;
type State = 'ACTIVE' | 'INVALIDATED' | 'CLOSING' | 'CLOSED' | 'UNCERTAIN';
type Work = { sequence: number; entered: boolean; candidate: MetadataResult | null; start: number };
export function createOwnedTransportMetadataOwner(
  options: Readonly<{ target: OwnedMetadataTarget; budget: DeviceQueueBudget }>,
) {
  let target: OwnedMetadataTarget, budget: DeviceQueueBudget;
  try {
    const ds = Object.getOwnPropertyDescriptors(options);
    if (
      Reflect.ownKeys(ds).length !== 2 ||
      !ds.target ||
      !('value' in ds.target) ||
      !ds.budget ||
      !('value' in ds.budget)
    )
      throw Error();
    target = ds.target.value;
    budget = ds.budget.value;
    if (!target || typeof target !== 'object' || claimed.has(target)) throw Error();
  } catch {
    throw Error('OWNED_METADATA_OPTIONS');
  }
  const proof = inspectOwnedMetadataTarget(target);
  if (!proof) throw Error('OWNED_METADATA_OPTIONS');
  claimed.add(target);
  const initial = proof.target,
    current = proof.current,
    finalCurrent = proof.finalCurrent,
    localBusy = proof.localBusy,
    begin = proof.begin;
  let state: State = 'ACTIVE',
    sticky = false,
    lastTime = -1,
    sequence = 0,
    logical = 0;
  let closing: Promise<boolean> | null = null;
  const works = new Map<string, Work>(),
    ids = new Set<string>();
  const entries = Object.fromEntries(METADATA_QUERY_FIELDS.map((f) => [f, null])) as Record<
    MetadataQueryField,
    Observation | null
  >;
  const applied = new Map<MetadataQueryField, number>();
  function stale(field?: MetadataQueryField) {
    for (const f of field ? [field] : METADATA_QUERY_FIELDS) {
      const old = entries[f];
      if (old)
        entries[f] = Object.freeze({ target: initial, metadata: staleMetadata(old.metadata) });
    }
  }
  function invalidate(unknown = false) {
    sticky ||= unknown;
    state = sticky
      ? 'UNCERTAIN'
      : state === 'CLOSING' || state === 'CLOSED'
        ? state
        : 'INVALIDATED';
    stale();
  }
  function clock() {
    const n = systemClock();
    if (!validMetadataDeadline(n) || n < lastTime) throw Error();
    lastTime = n;
    return n;
  }
  function internal() {
    return state === 'ACTIVE' && !sticky && finalCurrent();
  }
  function fence() {
    try {
      clock();
      current();
      clock();
      if (!internal()) throw Error();
      return true;
    } catch {
      invalidate();
      return false;
    }
  }
  function nextId() {
    if (ids.size >= 65536) throw Error();
    const id = uuid();
    if (ids.has(id)) throw Error();
    ids.add(id);
    return id;
  }
  if (!fence()) throw Error('OWNED_METADATA_OPTIONS');
  const ownerId = nextId();
  const actor = createDeviceActor({
    binding: {
      deviceId: initial.deviceId,
      bindingId: initial.bindingId,
      generation: initial.generation,
      serial: initial.serial,
    },
    budget,
    now: clock,
    assertOwned: fence,
    current: () => fence(),
    binaryAvailable: internal,
    dispatch: () => {
      throw Error('OWNED_METADATA_OPTIONS');
    },
    observe: () => false,
    metadata: {
      transportId: initial.transportId,
      finalCurrent: internal,
      localBusy,
      dispatch(request) {
        const w = works.get(request.commandId);
        if (!w || !fence() || request.transportId !== initial.transportId)
          throw Error('OWNED_METADATA_STATE');
        const handle = begin(request.field, request.deadlineUtc);
        const d = Object.getOwnPropertyDescriptor(handle, 'handoff');
        if (d && 'value' in d && d.value === 'QUERY') w.entered = true;
        return handle;
      },
      observe(request, facts) {
        const w = works.get(request.commandId);
        if (
          !w?.entered ||
          facts.observedAtUtc === null ||
          facts.observedAtUtc < w.start ||
          facts.observedAtUtc > request.deadlineUtc ||
          facts.stdoutBase64 === null
        )
          return false;
        w.candidate = parseAdbMetadata(
          request.field,
          Buffer.from(facts.stdoutBase64, 'base64').toString('utf8'),
          facts.observedAtUtc,
        );
        return w.candidate !== null;
      },
    },
  });
  const cap = actor.acquire(ownerId);
  if (!cap) {
    void actor.shutdown();
    throw Error('OWNED_METADATA_OPTIONS');
  }
  function wrap(actorResult: ActorResult, observation: Observation | null = null) {
    return Object.freeze({
      version: 1 as const,
      source: 'ADB_DISCOVERY' as const,
      evidence: 'NATIVE_METADATA_QUERY' as const,
      actor: actorResult,
      observation,
    });
  }
  function refuse(code: ActorCode, r?: MetadataQueryRequest) {
    return wrap(
      Object.freeze({
        outcome:
          code === 'OUTCOME_UNKNOWN' ? ('OUTCOME_UNKNOWN' as const) : ('NOT_DISPATCHED' as const),
        code,
        commandId: r?.commandId ?? null,
        correlationId: r?.correlationId ?? null,
        diagnosticId: null,
      }),
    );
  }
  return Object.freeze({
    async read(field: unknown, deadlineUtc: unknown) {
      if (!validMetadataField(field) || !validMetadataDeadline(deadlineUtc))
        return refuse('INVALID_REQUEST');
      if (state !== 'ACTIVE') return refuse(sticky ? 'OUTCOME_UNKNOWN' : 'CLOSED');
      if (localBusy()) return refuse('BUSY');
      if (sequence >= 128) return refuse('BUSY');
      let request: MetadataQueryRequest;
      try {
        request = Object.freeze({
          version: 3,
          kind: 'METADATA_QUERY',
          commandId: nextId(),
          correlationId: nextId(),
          ownerId,
          deviceId: initial.deviceId,
          bindingId: initial.bindingId,
          generation: initial.generation,
          serial: initial.serial,
          transportId: initial.transportId,
          field,
          deadlineUtc,
        });
      } catch {
        invalidate(true);
        return refuse('OUTCOME_UNKNOWN');
      }
      const w: Work = { sequence: ++sequence, entered: false, candidate: null, start: 0 };
      works.set(request.commandId, w);
      logical++;
      try {
        if (!fence()) return refuse('STALE_BINDING', request);
        w.start = lastTime;
        if (deadlineUtc <= lastTime || deadlineUtc - lastTime > 30000)
          return refuse('DEADLINE_EXCEEDED', request);
        const result = await actor.execute(cap, request);
        if (
          result.outcome === 'NOT_DISPATCHED' &&
          result.code === 'BUSY' &&
          !w.entered &&
          localBusy()
        )
          return wrap(result);
        if (result.outcome === 'OUTCOME_UNKNOWN') invalidate(true);
        if (!internal()) invalidate();
        if (result.outcome !== 'OBSERVED') {
          if (w.entered && w.sequence >= (applied.get(field) ?? 0)) {
            stale(field);
            applied.set(field, w.sequence);
          }
          return wrap(result);
        }
        if (
          !fence() ||
          request.deadlineUtc <= lastTime ||
          !w.candidate ||
          (applied.get(field) ?? 0) > w.sequence
        ) {
          if (w.entered && w.sequence >= (applied.get(field) ?? 0)) {
            stale(field);
            applied.set(field, w.sequence);
          }
          return refuse(
            request.deadlineUtc <= lastTime ? 'DEADLINE_EXCEEDED' : 'STALE_BINDING',
            request,
          );
        }
        const observation = Object.freeze({ target: initial, metadata: w.candidate });
        entries[field] = observation;
        applied.set(field, w.sequence);
        return wrap(result, observation);
      } catch {
        invalidate(true);
        return refuse('OUTCOME_UNKNOWN', request);
      } finally {
        w.candidate = null;
        logical--;
      }
    },
    snapshot() {
      if (state === 'ACTIVE' && !localBusy()) fence();
      return Object.freeze({
        version: 1 as const,
        source: 'ADB_DISCOVERY' as const,
        evidence: 'NATIVE_METADATA_QUERY' as const,
        state,
        target: initial,
        observations: Object.freeze({ ...entries }),
      });
    },
    close(): Promise<boolean> {
      if (closing) return closing;
      state = sticky ? 'UNCERTAIN' : 'CLOSING';
      stale();
      let resolve!: (v: boolean) => void;
      closing = new Promise((r) => {
        resolve = r;
      });
      const timer = setTimeout(() => {
        invalidate(true);
        resolve(false);
      }, 120000);
      void actor.shutdown().then(
        (ok) => {
          clearTimeout(timer);
          if (!ok || logical !== 0) {
            invalidate(true);
            resolve(false);
          } else {
            state = sticky ? 'UNCERTAIN' : 'CLOSED';
            resolve(!sticky);
          }
        },
        () => {
          clearTimeout(timer);
          invalidate(true);
          resolve(false);
        },
      );
      return closing;
    },
    get retired() {
      return state === 'CLOSED' && !sticky && logical === 0 && !actor.snapshot().active;
    },
  });
}
