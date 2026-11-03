// Synthetic composition only: no native issuer, endpoint, executable or input capability.
import { validAdbSerial, validTransportId } from './adb-discovery.ts';
import { parseAdbMetadata, staleMetadata, type MetadataResult } from './adb-metadata.ts';
import {
  createDeviceActor,
  METADATA_OPERATIONS,
  type ActorCode,
  type ActorResult,
  type DeviceMetadataRequest,
  type DeviceProcessResult,
  type DeviceQueueBudget,
  type MetadataOperation,
} from './device-actor.ts';
import { isRegistrySnapshot, type RegistrySnapshot } from './transport-registry.ts';

const NativePromise = Promise;
const promisePrototype = Promise.prototype;
const promiseThen = Promise.prototype.then;
const species = Object.getOwnPropertyDescriptor(Promise, Symbol.species)?.get;
const MAX_TIME = 8640000000000000;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error();
  const ds = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(ds).length !== keys.length) throw Error();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const d = ds[key];
    if (!d || !Object.hasOwn(d, 'value')) throw Error();
    out[key] = d.value;
  }
  return out;
}
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= 0;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function ordinaryPromise(v: unknown): v is Promise<unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    Object.getPrototypeOf(v) === promisePrototype &&
    !Object.getOwnPropertyDescriptor(v, 'then') &&
    !Object.getOwnPropertyDescriptor(v, 'constructor') &&
    Object.getOwnPropertyDescriptor(promisePrototype, 'then')?.value === promiseThen &&
    Object.getOwnPropertyDescriptor(promisePrototype, 'constructor')?.value === NativePromise &&
    Object.getOwnPropertyDescriptor(NativePromise, Symbol.species)?.get === species &&
    !('value' in (Object.getOwnPropertyDescriptor(NativePromise, Symbol.species) ?? {}))
  );
}
export type MetadataTarget = Readonly<{
  deviceId: string;
  bindingId: string;
  generation: number;
  serial: string;
  transportId: string;
  hostEpoch: number;
  registryRevision: number;
  observationSequence: number;
}>;
export type MetadataObservation = Readonly<{ target: MetadataTarget; metadata: MetadataResult }>;
export type MetadataReadResult = Readonly<{
  version: 1;
  source: 'SYNTHETIC_TEST';
  evidence: 'SYNTHETIC_PROCESS';
  actor: ActorResult;
  observation: MetadataObservation | null;
}>;
export type MetadataSnapshot = Readonly<{
  version: 1;
  source: 'SYNTHETIC_TEST';
  evidence: 'SYNTHETIC_PROCESS';
  state: 'ACTIVE' | 'INVALIDATED' | 'CLOSING' | 'CLOSED' | 'UNCERTAIN';
  target: MetadataTarget;
  observations: Readonly<Record<MetadataOperation, MetadataObservation | null>>;
}>;
export type SyntheticTransportMetadataOptions = Readonly<{
  registry: RegistrySnapshot;
  hostEpoch: number;
  deviceId: string;
  ownerId: string;
  budget: DeviceQueueBudget;
  now: () => number;
  assertOwned: () => boolean;
  dispatchSynthetic: (request: DeviceMetadataRequest) => Promise<unknown>;
}>;
function targetFor(registry: unknown, hostEpoch: unknown, deviceId: unknown): MetadataTarget {
  if (
    !isRegistrySnapshot(registry) ||
    registry.source !== 'SYNTHETIC_TEST' ||
    !integer(registry.sequence) ||
    !integer(registry.observedAtUtc) ||
    registry.observedAtUtc > MAX_TIME ||
    !integer(hostEpoch) ||
    hostEpoch === 0 ||
    !uuid(deviceId)
  )
    throw Error();
  const devices = registry.devices.filter((d) => d.deviceId === deviceId);
  const d = devices[0];
  if (
    devices.length !== 1 ||
    !d ||
    d.state !== 'DEVICE' ||
    !uuid(d.currentBindingId) ||
    !integer(d.generation)
  )
    throw Error();
  const bindings = registry.bindings.filter((b) => b.bindingId === d.currentBindingId);
  const b = bindings[0];
  if (
    bindings.length !== 1 ||
    !b ||
    b.retired ||
    b.source !== 'SYNTHETIC_TEST' ||
    b.state !== 'DEVICE' ||
    b.deviceId !== deviceId ||
    b.generation !== d.generation ||
    !validAdbSerial(b.serial) ||
    /[\r\n]/.test(b.serial) ||
    !validTransportId(b.transportId) ||
    /[\r\n]/.test(b.transportId)
  )
    throw Error();
  const claims = registry.claims.filter(
    (c) => c.serial === b.serial || c.transportId === b.transportId,
  );
  const c = claims[0];
  if (
    claims.length !== 1 ||
    !c ||
    c.state !== 'DEVICE' ||
    c.deviceId !== deviceId ||
    c.bindingId !== b.bindingId ||
    c.serial !== b.serial ||
    c.transportId !== b.transportId
  )
    throw Error();
  return Object.freeze({
    deviceId,
    bindingId: b.bindingId,
    generation: b.generation,
    serial: b.serial,
    transportId: b.transportId,
    hostEpoch,
    registryRevision: registry.revision,
    observationSequence: registry.sequence,
  });
}
function processSnapshot(raw: unknown): DeviceProcessResult {
  const v = record(raw, ['status', 'exitCode', 'retired', 'truncated', 'stdout']);
  if (
    !['SUCCESS', 'NONZERO_EXIT', 'TIMEOUT', 'FAILED'].includes(v.status as string) ||
    !(
      v.exitCode === null ||
      (Number.isSafeInteger(v.exitCode) &&
        !Object.is(v.exitCode, -0) &&
        (v.exitCode as number) >= -2147483648 &&
        (v.exitCode as number) <= 2147483647)
    ) ||
    v.retired !== true ||
    typeof v.truncated !== 'boolean' ||
    typeof v.stdout !== 'string' ||
    v.stdout.length > 65536 ||
    new TextEncoder().encode(v.stdout).length > 65536 ||
    (v.status === 'SUCCESS' && v.exitCode !== 0) ||
    (v.status === 'NONZERO_EXIT' && (v.exitCode === null || v.exitCode === 0))
  )
    throw Error();
  return Object.freeze(v) as DeviceProcessResult;
}
type Work = {
  request: DeviceMetadataRequest;
  start: number;
  sequence: number;
  entered: boolean;
  settled: boolean;
  observedUtc: number | null;
  candidate: MetadataResult | null;
};
export function createSyntheticTransportMetadataOwner(options: SyntheticTransportMetadataOptions) {
  let o: Record<string, unknown>, initial: MetadataTarget;
  try {
    o = record(options, [
      'registry',
      'hostEpoch',
      'deviceId',
      'ownerId',
      'budget',
      'now',
      'assertOwned',
      'dispatchSynthetic',
    ]);
    initial = targetFor(o.registry, o.hostEpoch, o.deviceId);
    if (
      !uuid(o.ownerId) ||
      [o.now, o.assertOwned, o.dispatchSynthetic].some((f) => typeof f !== 'function')
    )
      throw Error();
  } catch {
    throw new Error('TRANSPORT_METADATA_OPTIONS');
  }
  const ownerId = o.ownerId as string,
    now = o.now as () => number,
    owned = o.assertOwned as () => boolean,
    dispatch = o.dispatchSynthetic as (r: DeviceMetadataRequest) => Promise<unknown>;
  let registry = o.registry as RegistrySnapshot,
    current = initial;
  const generation = Object.freeze({});
  let liveGeneration: object | null = generation;
  let state: MetadataSnapshot['state'] = 'ACTIVE',
    lastTime = -1,
    outstanding = 0,
    logical = 0;
  let sticky = false,
    actorRetired = false,
    closeReport: Promise<boolean> | null = null;
  let finishClose = () => {};
  const works = new Map<string, Work>(),
    ids = new Set<string>();
  const entries = Object.fromEntries(METADATA_OPERATIONS.map((f) => [f, null])) as Record<
    MetadataOperation,
    MetadataObservation | null
  >;
  const applied = new Map<MetadataOperation, number>();
  function stale(field?: MetadataOperation) {
    for (const f of field ? [field] : METADATA_OPERATIONS) {
      const old = entries[f];
      if (old)
        entries[f] = Object.freeze({ target: old.target, metadata: staleMetadata(old.metadata) });
    }
  }
  function invalidate(unknown = false) {
    liveGeneration = null;
    sticky ||= unknown;
    state = sticky
      ? 'UNCERTAIN'
      : state === 'CLOSING' || state === 'CLOSED'
        ? state
        : 'INVALIDATED';
    stale();
  }
  function clock(): number {
    const time = now();
    if (!integer(time) || time > MAX_TIME || time < lastTime) throw Error();
    lastTime = time;
    return time;
  }
  function internal(): ActorCode | null {
    if (sticky) return 'OUTCOME_UNKNOWN';
    if (state === 'CLOSING' || state === 'CLOSED') return 'CLOSED';
    if (liveGeneration !== generation || state !== 'ACTIVE') return 'STALE_BINDING';
    return null;
  }
  function fence(deadline?: number): ActorCode | null {
    let time: number;
    try {
      time = clock();
    } catch {
      invalidate();
      return 'DEADLINE_EXCEEDED';
    }
    try {
      if (owned() !== true) {
        invalidate();
        return 'OWNER_REVOKED';
      }
    } catch {
      invalidate();
      return 'OWNER_REVOKED';
    }
    const denied = internal();
    if (denied) return denied;
    return deadline !== undefined && (deadline <= time || deadline - time > 120000)
      ? 'DEADLINE_EXCEEDED'
      : null;
  }
  function wrap(
    actor: ActorResult,
    observation: MetadataObservation | null = null,
  ): MetadataReadResult {
    return Object.freeze({
      version: 1,
      source: 'SYNTHETIC_TEST',
      evidence: 'SYNTHETIC_PROCESS',
      actor,
      observation,
    });
  }
  function refusal(
    code: ActorCode,
    request?: DeviceMetadataRequest,
    dispatched = false,
  ): MetadataReadResult {
    return wrap(
      Object.freeze({
        outcome:
          code === 'OUTCOME_UNKNOWN'
            ? 'OUTCOME_UNKNOWN'
            : dispatched
              ? 'DISPATCHED_UNCONFIRMED'
              : 'NOT_DISPATCHED',
        code,
        commandId: request?.commandId ?? null,
        correlationId: request?.correlationId ?? null,
        diagnosticId: null,
      }),
    );
  }
  const actor = (() => {
    try {
      return createDeviceActor({
        binding: Object.freeze({
          deviceId: initial.deviceId,
          bindingId: initial.bindingId,
          generation: initial.generation,
          serial: initial.serial,
        }),
        budget: o.budget as DeviceQueueBudget,
        now: clock,
        assertOwned: () => fence() === null,
        current: () => internal() === null,
        binaryAvailable: () => internal() === null,
        dispatch(request) {
          if (request.version !== 1) throw Error();
          const w = works.get(request.commandId);
          const denied = fence(request.deadlineUtc);
          if (!w || denied) throw Error();
          w.entered = true;
          outstanding++;
          let raw: unknown;
          try {
            raw = dispatch(request);
            if (!ordinaryPromise(raw)) throw Error();
            return Reflect.apply(promiseThen, raw, [
              (value: unknown) => {
                w.settled = true;
                outstanding--;
                try {
                  const normalized = processSnapshot(value);
                  const observedUtc = clock();
                  if (observedUtc < w.start || observedUtc > request.deadlineUtc) throw Error();
                  w.observedUtc = observedUtc;
                  return normalized;
                } catch {
                  invalidate(true);
                  throw new Error('TRANSPORT_METADATA_STATE');
                }
              },
              () => {
                w.settled = true;
                outstanding--;
                invalidate(true);
                throw new Error('TRANSPORT_METADATA_STATE');
              },
            ]) as Promise<DeviceProcessResult>;
          } catch {
            invalidate(true);
            throw new Error('TRANSPORT_METADATA_STATE');
          }
        },
        observe(request, stdout) {
          const w = works.get(request.commandId);
          if (request.version !== 1 || !w?.settled || w.observedUtc === null) return false;
          w.candidate = parseAdbMetadata(request.operation, stdout, w.observedUtc);
          return w.candidate !== null;
        },
      });
    } catch {
      throw new Error('TRANSPORT_METADATA_OPTIONS');
    }
  })();
  const cap = actor.acquire(ownerId);
  if (!cap) {
    void actor.shutdown();
    throw new Error('TRANSPORT_METADATA_OPTIONS');
  }
  return Object.freeze({
    async read(input: unknown): Promise<MetadataReadResult> {
      let request: DeviceMetadataRequest;
      try {
        const v = record(input, ['version', 'commandId', 'correlationId', 'field', 'deadlineUtc']);
        if (
          v.version !== 1 ||
          !uuid(v.commandId) ||
          !uuid(v.correlationId) ||
          v.commandId === v.correlationId ||
          !METADATA_OPERATIONS.includes(v.field as MetadataOperation) ||
          !integer(v.deadlineUtc) ||
          v.deadlineUtc > MAX_TIME ||
          ids.has(v.commandId) ||
          ids.has(v.correlationId)
        )
          return refusal('INVALID_REQUEST');
        request = Object.freeze({
          version: 1,
          commandId: v.commandId,
          correlationId: v.correlationId,
          ownerId,
          deviceId: initial.deviceId,
          bindingId: initial.bindingId,
          generation: initial.generation,
          serial: initial.serial,
          operation: v.field as MetadataOperation,
          deadlineUtc: v.deadlineUtc,
        });
      } catch {
        return refusal('INVALID_REQUEST');
      }
      const prior = internal();
      if (prior) return refusal(prior, request);
      if (works.size >= 128) return refusal('BUSY', request);
      // Reserve IDs before any reentrant clock/ownership callback.
      ids.add(request.commandId);
      ids.add(request.correlationId);
      const w: Work = {
        request,
        start: 0,
        sequence: works.size + 1,
        entered: false,
        settled: false,
        observedUtc: null,
        candidate: null,
      };
      works.set(request.commandId, w);
      logical++;
      try {
        const denied = fence(request.deadlineUtc);
        if (denied) return refusal(denied, request);
        w.start = lastTime;
        const result = await actor.execute(cap, request);
        if (result.outcome === 'OUTCOME_UNKNOWN') invalidate(true);
        if (result.outcome !== 'OBSERVED') {
          if (w.entered && w.sequence >= (applied.get(request.operation) ?? 0)) {
            stale(request.operation);
            applied.set(request.operation, w.sequence);
          }
          return wrap(result);
        }
        const final = fence(request.deadlineUtc);
        if (
          final ||
          !w.settled ||
          !w.candidate ||
          (applied.get(request.operation) ?? 0) > w.sequence
        ) {
          if (w.entered && w.sequence >= (applied.get(request.operation) ?? 0)) {
            stale(request.operation);
            applied.set(request.operation, w.sequence);
          }
          return refusal(final ?? 'OBSERVATION_REJECTED', request, w.entered);
        }
        const observation = Object.freeze({ target: current, metadata: w.candidate });
        entries[request.operation] = observation;
        applied.set(request.operation, w.sequence);
        return wrap(result, observation);
      } catch {
        invalidate(true);
        return refusal('OUTCOME_UNKNOWN', request, w.entered);
      } finally {
        w.candidate = null;
        logical--;
        finishClose();
      }
    },
    updateRegistry(next: unknown, hostEpoch: unknown): void {
      try {
        if (internal()) throw Error();
        const target = targetFor(next, hostEpoch, initial.deviceId);
        const r = next as RegistrySnapshot;
        if (
          r.revision < registry.revision ||
          (r.revision === registry.revision && r !== registry) ||
          target.observationSequence < current.observationSequence ||
          (r.observedAtUtc ?? -1) < (registry.observedAtUtc ?? -1) ||
          ['deviceId', 'bindingId', 'generation', 'serial', 'transportId', 'hostEpoch'].some(
            (k) => target[k as keyof MetadataTarget] !== initial[k as keyof MetadataTarget],
          )
        )
          throw Error();
        registry = r;
        current = target;
      } catch {
        invalidate();
        throw new Error('TRANSPORT_METADATA_STATE');
      }
    },
    snapshot(): MetadataSnapshot {
      return Object.freeze({
        version: 1,
        source: 'SYNTHETIC_TEST',
        evidence: 'SYNTHETIC_PROCESS',
        state,
        target: initial,
        observations: Object.freeze({ ...entries }),
      });
    },
    close(): Promise<boolean> {
      if (closeReport) return closeReport;
      state = sticky ? 'UNCERTAIN' : 'CLOSING';
      liveGeneration = null;
      stale();
      // Publish the single report before invoking actor cleanup.
      let resolveReport!: (value: boolean) => void;
      closeReport = new NativePromise<boolean>((resolve) => {
        resolveReport = resolve;
      });
      const timer = setTimeout(() => {
        invalidate(true);
        resolveReport(false);
      }, 120000);
      finishClose = () => {
        if (sticky) {
          clearTimeout(timer);
          resolveReport(false);
          return;
        }
        if (actorRetired && outstanding === 0 && logical === 0) {
          state = 'CLOSED';
          clearTimeout(timer);
          resolveReport(true);
        }
      };
      void actor.shutdown().then(
        (ok) => {
          actorRetired = ok;
          if (!ok) invalidate(true);
          finishClose();
        },
        () => {
          invalidate(true);
          clearTimeout(timer);
          resolveReport(false);
        },
      );
      return closeReport;
    },
    get retired(): boolean {
      return actorRetired && outstanding === 0 && logical === 0 && !sticky;
    },
  });
}
