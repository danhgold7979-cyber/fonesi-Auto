// Private software-only ingestion. Synthetic text never becomes native discovery authority.
import { parseAdbDiscovery, type AdbDiscoveryRow } from './adb-discovery.ts';
import { isRegistrySnapshot, type RegistrySnapshot } from './transport-registry.ts';
import { DurableFault, type DurableMutationResult } from './durable-coordinator.ts';
import type { RegistryStore } from './registry-store.ts';
const NativePromise = Promise;
const promisePrototype = Promise.prototype;
const promiseThen = Promise.prototype.then;
const promiseSpecies = Object.getOwnPropertyDescriptor(Promise, Symbol.species)?.get;
function ordinaryPromise(value: unknown): value is Promise<unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === promisePrototype &&
    Object.getOwnPropertyDescriptor(value, 'then') === undefined &&
    Object.getOwnPropertyDescriptor(value, 'constructor') === undefined &&
    Object.getOwnPropertyDescriptor(promisePrototype, 'then')?.value === promiseThen &&
    Object.getOwnPropertyDescriptor(promisePrototype, 'constructor')?.value === NativePromise &&
    Object.getOwnPropertyDescriptor(NativePromise, Symbol.species)?.get === promiseSpecies &&
    !('value' in (Object.getOwnPropertyDescriptor(NativePromise, Symbol.species) ?? {}))
  );
}
export type DiscoveryRequest = Readonly<{
  requestId: string;
  epoch: object;
  sequence: number;
  deadlineUtc: number;
}>;
export type DiscoveryAcquisition = Readonly<{
  result: Promise<unknown>;
  retirement: Promise<unknown>;
}>;
export type SyntheticDiscoveryProvider = Readonly<{ syntheticDiscovery: true }>;
type Provider = {
  epoch: object;
  revoked: boolean;
  claimed: boolean;
  begin(request: DiscoveryRequest): DiscoveryAcquisition;
  current(): void;
};
const providers = new WeakMap<SyntheticDiscoveryProvider, Provider>();
export function createSyntheticDiscoveryProvider(
  options: Readonly<{
    begin(request: DiscoveryRequest): DiscoveryAcquisition;
    assertCurrentSync(): void;
  }>,
) {
  const state: Provider = {
    epoch: Object.freeze({}),
    revoked: false,
    claimed: false,
    begin: options.begin.bind(options),
    current: options.assertCurrentSync.bind(options),
  };
  const provider = Object.freeze({ syntheticDiscovery: true as const });
  providers.set(provider, state);
  return Object.freeze({
    provider,
    revoke(): void {
      state.revoked = true;
    },
  });
}
type LocalCode =
  | 'BUSY'
  | 'CLOSED'
  | 'INVALID_REQUEST'
  | 'INVALID_DISCOVERY'
  | 'DISCOVERY_LIMIT'
  | 'STALE_OBSERVATION'
  | 'EPOCH_REVOKED'
  | 'DEADLINE'
  | 'PROVIDER_FAILED'
  | 'UNRETIRED'
  | 'ID_EXHAUSTED';
type DurableCode = Exclude<
  Extract<DurableMutationResult, { ok: false }>['code'],
  'OUTCOME_UNKNOWN'
>;
export type DiscoveryReceipt =
  | Readonly<{
      outcome: 'COMMITTED';
      revision: number;
      requestId: string;
      sequence: number;
      source: 'SYNTHETIC_TEST';
      auditHealth: 'AVAILABLE' | 'DEGRADED';
      projectionCurrent: boolean;
    }>
  | Readonly<{
      outcome: 'NOT_COMMITTED';
      code: LocalCode | DurableCode;
      requestId: string | null;
      sequence: number | null;
      auditHealth: 'DEGRADED';
    }>
  | Readonly<{
      outcome: 'OUTCOME_UNKNOWN';
      code: 'OUTCOME_UNKNOWN';
      requestId: string;
      sequence: number;
      auditHealth: 'DEGRADED';
    }>;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw Error();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length) throw Error();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !('value' in d) || !d.enumerable) throw Error();
    result[key] = d.value;
  }
  return result;
}
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
class Fault extends Error {
  readonly code: LocalCode | DurableCode;
  constructor(code: LocalCode | DurableCode) {
    super(code);
    this.code = code;
  }
}
const refusalCodes = Object.freeze([
  'BUSY',
  'CLOSED',
  'INVALID_REQUEST',
  'INVALID_DISCOVERY',
  'DISCOVERY_LIMIT',
  'STALE_OBSERVATION',
  'EPOCH_REVOKED',
  'DEADLINE',
  'PROVIDER_FAILED',
  'UNRETIRED',
  'ID_EXHAUSTED',
  'STALE_REVISION',
  'LIMIT_EXCEEDED',
  'OWNER_REVOKED',
  'INVALID_CAPTURE',
  'STALE_CAPTURE',
  'STORAGE_FAILED',
  'RECOVERY_REQUIRED',
  'AUDIT_UNAVAILABLE',
  'REVISION_EXHAUSTED',
] as const);
function classify(error: unknown): LocalCode | Exclude<DurableCode, 'OUTCOME_UNKNOWN'> {
  try {
    if (error instanceof Fault || error instanceof DurableFault) {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
      if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') {
        const matched = refusalCodes.find((code) => code === descriptor.value);
        if (matched !== undefined) return matched;
      }
    }
  } catch {
    /* Hostile thrown values never become public diagnostics. */
  }
  return 'PROVIDER_FAILED';
}
export function createAdbDiscoveryService(
  options: Readonly<{
    provider: SyntheticDiscoveryProvider;
    registry: RegistryStore;
    readDurableRevision(): number;
    assertOwnedSync(): void;
    clock(): number;
    newId(): string;
  }>,
) {
  const admittedProvider = providers.get(options.provider);
  if (!admittedProvider || admittedProvider.claimed || admittedProvider.revoked)
    throw Error('INVALID_REQUEST');
  const provider: Provider = admittedProvider;
  provider.claimed = true;
  const snapshot = options.registry.snapshot.bind(options.registry),
    reconcile = options.registry.reconcile.bind(options.registry),
    readRevision = options.readDurableRevision.bind(options),
    owned = options.assertOwnedSync.bind(options),
    clock = options.clock.bind(options),
    newId = options.newId.bind(options);
  const initial = snapshot();
  if (
    !isRegistrySnapshot(initial) ||
    initial.sequence !== null ||
    initial.devices.some((d) => d.currentBindingId !== null) ||
    initial.bindings.some((b) => !b.retired)
  )
    throw Error('INVALID_REQUEST');
  if (provider.revoked) throw Error('INVALID_REQUEST');
  let closed = false,
    uncertainRetirement = false,
    sequence = 0,
    lastClock: number | null = null,
    active: Promise<void> | null = null,
    closing: Promise<Readonly<{ status: 'RETIRED' | 'UNRETIRED' }>> | null = null,
    currentRequest: object | null = null,
    projection: RegistrySnapshot | null = null;
  const ids = new Set<string>();
  function now() {
    const value = clock();
    if (!integer(value) || (lastClock !== null && value < lastClock))
      throw new Fault('INVALID_REQUEST');
    lastClock = value;
    return value;
  }
  function live() {
    if (closed) throw new Fault('CLOSED');
    if (provider?.revoked) throw new Fault('EPOCH_REVOKED');
  }
  function admission() {
    live();
    owned();
    provider?.current();
    now();
    owned();
    live();
  }
  function refusal(
    code: LocalCode | DurableCode,
    requestId: string | null = null,
    seq: number | null = null,
  ): DiscoveryReceipt {
    return Object.freeze({
      outcome: 'NOT_COMMITTED',
      code,
      requestId,
      sequence: seq,
      auditHealth: 'DEGRADED',
    });
  }
  function latch() {
    uncertainRetirement = true;
    closed = true;
    projection = null;
  }
  function refresh(expectedRevision: number): Promise<DiscoveryReceipt> {
    if (closed) return Promise.resolve(refusal('CLOSED'));
    if (active) return Promise.resolve(refusal('BUSY'));
    let deliver!: (value: DiscoveryReceipt) => void;
    let pendingReceipt: DiscoveryReceipt | null = null;
    let publicationCurrent = () => false;
    const respond = (value: DiscoveryReceipt) => {
      pendingReceipt = value;
    };
    const response = new Promise<DiscoveryReceipt>((resolve) => {
      deliver = resolve;
    });
    const token = Object.freeze({});
    currentRequest = token;
    projection = null;
    active = Promise.resolve()
      .then(async () => {
        let requestId: string | null = null,
          seq: number | null = null,
          timer: ReturnType<typeof setTimeout> | null = null,
          expired = false,
          entered = false,
          deadline = 0;
        function internal() {
          if (
            closed ||
            provider?.revoked ||
            currentRequest !== token ||
            expired ||
            (lastClock !== null && lastClock >= deadline)
          )
            throw new DurableFault('OWNER_REVOKED');
        }
        function external() {
          admission();
          internal();
        }
        publicationCurrent = () =>
          !closed && !provider.revoked && !expired && lastClock !== null && lastClock < deadline;
        try {
          admission();
          if (!integer(expectedRevision)) throw new Fault('INVALID_REQUEST');
          if (readRevision() !== expectedRevision) {
            respond(refusal('STALE_REVISION'));
            return;
          }
          admission();
          if (sequence === Number.MAX_SAFE_INTEGER || ids.size >= 65536)
            throw new Fault('ID_EXHAUSTED');
          const allocated = newId();
          admission();
          if (!uuid(allocated) || ids.has(allocated)) throw new Fault('ID_EXHAUSTED');
          ids.add(allocated);
          requestId = allocated;
          seq = ++sequence;
          const started = now();
          if (!integer(started + 30000)) throw new Fault('INVALID_REQUEST');
          deadline = started + 30000;
          external();
          timer = setTimeout(() => {
            expired = true;
            projection = null;
            if (!entered) deliver(refusal('DEADLINE', requestId, seq));
          }, 30000);
          let handle: Record<string, unknown>;
          try {
            const supplied = provider.begin(
              Object.freeze({
                requestId,
                epoch: provider.epoch,
                sequence: seq,
                deadlineUtc: deadline,
              }),
            );
            handle = record(supplied, ['result', 'retirement']);
            if (
              !Object.isFrozen(supplied) ||
              !ordinaryPromise(handle.result) ||
              !ordinaryPromise(handle.retirement)
            )
              throw Error();
          } catch {
            latch();
            throw new Fault('UNRETIRED');
          }
          // Snapshot each value at its own settlement, never after waiting on its peer.
          let normalizedResult: Promise<
            Readonly<{ observedAtUtc: number; rows: readonly AdbDiscoveryRow[] }>
          >;
          let normalizedRetirement: Promise<unknown>;
          try {
            normalizedResult = promiseThen.call(handle.result, (input: unknown) => {
              const completed = now();
              let value: Record<string, unknown>;
              try {
                value = record(input, [
                  'outcome',
                  'raw',
                  'observedAtUtc',
                  'stdoutTruncated',
                  'stderrTruncated',
                ]);
              } catch {
                throw new Fault('INVALID_DISCOVERY');
              }
              if (
                typeof value.stdoutTruncated !== 'boolean' ||
                typeof value.stderrTruncated !== 'boolean'
              )
                throw new Fault('INVALID_DISCOVERY');
              if (value.outcome === 'FAILED' && value.raw === null && value.observedAtUtc === null)
                throw new Fault('PROVIDER_FAILED');
              if (
                value.outcome !== 'COMPLETE' ||
                value.stdoutTruncated ||
                value.stderrTruncated ||
                !integer(value.observedAtUtc) ||
                value.observedAtUtc < started ||
                value.observedAtUtc > completed
              )
                throw new Fault('INVALID_DISCOVERY');
              const parsed = parseAdbDiscovery(value.raw);
              if (!parsed.ok) throw new Fault(parsed.code);
              return Object.freeze({ observedAtUtc: value.observedAtUtc, rows: parsed.rows });
            }) as Promise<Readonly<{ observedAtUtc: number; rows: readonly AdbDiscoveryRow[] }>>;
            promiseThen.call(normalizedResult, undefined, () => undefined);
            normalizedRetirement = promiseThen.call(handle.retirement, (input: unknown) => {
              if (record(input, ['status']).status !== 'RETIRED' || !Object.isFrozen(input))
                throw Error();
              return true;
            });
          } catch {
            latch();
            throw new Fault('UNRETIRED');
          }
          const [result, retirement] = await Promise.allSettled([
            normalizedResult,
            normalizedRetirement,
          ]);
          if (retirement.status !== 'fulfilled') {
            latch();
            throw new Fault('UNRETIRED');
          }
          if (expired) throw new Fault('DEADLINE');
          external();
          if (result.status !== 'fulfilled') {
            throw new Fault(classify(result.reason));
          }
          const value = result.value;
          external();
          entered = true;
          const committed = await reconcile(
            expectedRevision,
            Object.freeze({
              sequence: seq,
              observedAtUtc: value.observedAtUtc,
              source: 'SYNTHETIC_TEST',
              rows: value.rows,
              proofs: Object.freeze([]),
            }),
            external,
            internal,
          );
          if (committed.ok) {
            let valid = false;
            try {
              external();
              const candidate = snapshot();
              external();
              if (
                !isRegistrySnapshot(candidate) ||
                candidate.sequence !== seq ||
                candidate.source !== 'SYNTHETIC_TEST'
              )
                throw Error();
              internal();
              projection = candidate;
              valid = true;
            } catch {
              projection = null;
            }
            respond(
              Object.freeze({
                outcome: 'COMMITTED',
                revision: committed.revision,
                requestId,
                sequence: seq,
                source: 'SYNTHETIC_TEST',
                auditHealth: committed.auditHealth,
                projectionCurrent: valid,
              }),
            );
          } else if (committed.outcome === 'OUTCOME_UNKNOWN') {
            closed = true;
            respond(
              Object.freeze({
                outcome: 'OUTCOME_UNKNOWN',
                code: 'OUTCOME_UNKNOWN',
                requestId,
                sequence: seq,
                auditHealth: committed.auditHealth,
              }),
            );
          } else respond(refusal(committed.code, requestId, seq));
        } catch (error) {
          projection = null;
          respond(refusal(classify(error), requestId, seq));
        } finally {
          if (timer !== null) clearTimeout(timer);
          currentRequest = null;
        }
      })
      .finally(() => {
        active = null;
        if (pendingReceipt) {
          if (pendingReceipt.outcome === 'COMMITTED' && !publicationCurrent()) {
            projection = null;
            pendingReceipt = Object.freeze({ ...pendingReceipt, projectionCurrent: false });
          }
          deliver(pendingReceipt);
        }
      });
    return response;
  }
  return Object.freeze({
    refresh,
    snapshot(): RegistrySnapshot | null {
      if (!projection) return null;
      try {
        admission();
        const latest = snapshot();
        admission();
        if (latest !== projection) throw Error();
        return projection;
      } catch {
        projection = null;
        return null;
      }
    },
    availability(): 'LIVE_DISCOVERY_UNAVAILABLE' | 'OBSERVED' {
      return 'LIVE_DISCOVERY_UNAVAILABLE';
    },
    close(): Promise<Readonly<{ status: 'RETIRED' | 'UNRETIRED' }>> {
      if (closing) return closing;
      closed = true;
      projection = null;
      closing = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(Object.freeze({ status: 'UNRETIRED' })), 120000);
        void (active ?? Promise.resolve()).then(() => {
          clearTimeout(timer);
          resolve(Object.freeze({ status: uncertainRetirement ? 'UNRETIRED' : 'RETIRED' }));
        });
      });
      return closing;
    },
    get retired(): boolean {
      return closed && !active && !uncertainRetirement;
    },
  });
}
