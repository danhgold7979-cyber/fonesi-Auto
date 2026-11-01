// Private software-only ingestion. Synthetic text never becomes native discovery authority.
import {
  parseAdbDiscovery,
  parseAdbServerDiscovery,
  type AdbDiscoveryRow,
} from './adb-discovery.ts';
import { isRegistrySnapshot, type RegistrySnapshot } from './transport-registry.ts';
import { DurableFault, type DurableMutationResult } from './durable-coordinator.ts';
import { inspectRegistryProjection, type RegistryStore } from './registry-store.ts';
import {
  validMetadataField,
  validMetadataDeadline,
  validMetadataTransportId,
  type MetadataQueryField,
  type MetadataQueryHandle,
} from './metadata-query-contract.ts';
import {
  inspectOwnedDiscoveryProvider,
  type OwnedDiscoveryProvider,
} from './adb-server-service.ts';
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
const claimedProviders = new WeakSet<object>();
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
      source: 'SYNTHETIC_TEST' | 'ADB_DISCOVERY';
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
export type OwnedMetadataTarget = Readonly<{ ownedMetadataTarget: true }>;
export type MetadataTargetRecord = Readonly<{
  target: Readonly<{
    deviceId: string;
    bindingId: string;
    generation: number;
    serial: string;
    transportId: string;
    hostEpoch: number;
    registryRevision: number;
    observationSequence: number;
  }>;
  current(): void;
  finalCurrent(): boolean;
  localBusy(): boolean;
  begin(field: MetadataQueryField, deadlineUtc: number): MetadataQueryHandle;
}>;
const metadataTargets = new WeakMap<object, MetadataTargetRecord>();
export function inspectOwnedMetadataTarget(value: unknown): MetadataTargetRecord | null {
  return value !== null && typeof value === 'object' ? (metadataTargets.get(value) ?? null) : null;
}
export function createAdbDiscoveryService(
  options: Readonly<{
    provider: SyntheticDiscoveryProvider | OwnedDiscoveryProvider;
    registry: RegistryStore;
    readDurableRevision(): number;
    assertOwnedSync(): void;
    clock(): number;
    newId(): string;
  }>,
) {
  const synthetic = providers.get(options.provider as SyntheticDiscoveryProvider);
  const native = synthetic ? null : inspectOwnedDiscoveryProvider(options.provider);
  if (
    (!synthetic && !native) ||
    claimedProviders.has(options.provider) ||
    synthetic?.revoked ||
    native?.revoked
  )
    throw Error('INVALID_REQUEST');
  claimedProviders.add(options.provider);
  if (synthetic) synthetic.claimed = true;
  const admitted = synthetic ?? native;
  if (!admitted) throw Error('INVALID_REQUEST');
  const provider: NonNullable<typeof admitted> = admitted;
  const source = synthetic ? ('SYNTHETIC_TEST' as const) : ('ADB_DISCOVERY' as const);
  const actualRegistry = options.registry;
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
  let nativeRows: readonly AdbDiscoveryRow[] | null = null;
  let issuedTickets = 0,
    metadataSequence = 0;
  const tickets = new Map<string, OwnedMetadataTarget>();

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
    nativeRows = null;
    tickets.clear();
    active = Promise.resolve()
      .then(async () => {
        let requestId: string | null = null,
          seq: number | null = null,
          timer: ReturnType<typeof setTimeout> | null = null,
          expired = false,
          entered = false,
          requireCustody = false,
          deadline = 0;
        function internal() {
          if (
            closed ||
            provider?.revoked ||
            (requireCustody && native !== null && !native.finalCurrent()) ||
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
          !closed &&
          !provider.revoked &&
          (!requireCustody || native === null || native.finalCurrent()) &&
          !expired &&
          lastClock !== null &&
          lastClock < deadline;
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
              const parsed =
                source === 'ADB_DISCOVERY'
                  ? parseAdbServerDiscovery(value.raw)
                  : parseAdbDiscovery(value.raw);
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
          requireCustody = true;
          external();
          entered = true;
          const committed = await reconcile(
            expectedRevision,
            Object.freeze({
              sequence: seq,
              observedAtUtc: value.observedAtUtc,
              source,
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
                candidate.source !== source
              )
                throw Error();
              internal();
              projection = candidate;
              nativeRows = native ? value.rows : null;
              tickets.clear();
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
                source,
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
  function metadataTarget(deviceId: string): OwnedMetadataTarget | null {
    if (
      !native ||
      !projection ||
      !nativeRows ||
      active ||
      closed ||
      uncertainRetirement ||
      !uuid(deviceId) ||
      deviceId.length !== 36
    )
      return null;
    try {
      admission();
      const captured = projection,
        rows = nativeRows;
      if (!captured || !rows || captured.source !== 'ADB_DISCOVERY' || captured.sequence === null)
        return null;
      const witness = inspectRegistryProjection(actualRegistry, captured);
      if (!witness?.finalCurrent() || !native.finalCurrent()) return null;
      const device = captured.devices.find((d) => d.deviceId === deviceId);
      if (device?.state !== 'DEVICE' || !device.currentBindingId) return null;
      const binding = captured.bindings.find((b) => b.bindingId === device.currentBindingId);
      if (
        !binding ||
        binding.retired ||
        binding.state !== 'DEVICE' ||
        binding.source !== 'ADB_DISCOVERY' ||
        binding.deviceId !== deviceId ||
        binding.generation !== device.generation ||
        !validMetadataTransportId(binding.transportId)
      )
        return null;
      const claims = captured.claims.filter(
        (c) => c.serial === binding.serial || c.transportId === binding.transportId,
      );
      const selectedRows = rows.filter(
        (r) => r.serial === binding.serial || r.transportId === binding.transportId,
      );
      if (
        claims.length !== 1 ||
        selectedRows.length !== 1 ||
        claims[0]?.state !== 'DEVICE' ||
        claims[0].deviceId !== deviceId ||
        claims[0].bindingId !== binding.bindingId ||
        claims[0].serial !== binding.serial ||
        claims[0].transportId !== binding.transportId ||
        selectedRows[0]?.state !== 'DEVICE' ||
        selectedRows[0].serial !== binding.serial ||
        selectedRows[0].transportId !== binding.transportId
      )
        return null;
      const finalCurrent = () =>
        !closed &&
        !uncertainRetirement &&
        projection === captured &&
        nativeRows === rows &&
        !native.revoked &&
        native.finalCurrent() &&
        witness.finalCurrent();
      const localBusy = () =>
        !closed &&
        !uncertainRetirement &&
        projection === captured &&
        nativeRows === rows &&
        !native.revoked &&
        witness.finalCurrent() &&
        native.localBusy();
      const current = () => {
        admission();
        if (!finalCurrent()) throw Error('EPOCH_REVOKED');
      };
      current();
      const prior = tickets.get(deviceId);
      if (prior) return metadataTargets.get(prior)?.finalCurrent() ? prior : null;
      if (issuedTickets >= 65536 || tickets.size >= 256) return null;
      const ticket: OwnedMetadataTarget = Object.freeze({ ownedMetadataTarget: true });
      const target = Object.freeze({
        deviceId,
        bindingId: binding.bindingId,
        generation: binding.generation,
        serial: binding.serial,
        transportId: binding.transportId,
        hostEpoch: witness.hostEpoch,
        registryRevision: captured.revision,
        observationSequence: captured.sequence,
      });
      const record: MetadataTargetRecord = Object.freeze({
        target,
        current,
        finalCurrent,
        localBusy,
        begin(field: MetadataQueryField, deadlineUtc: number) {
          if (!validMetadataField(field) || !validMetadataDeadline(deadlineUtc))
            throw Error('INVALID_REQUEST');
          if (localBusy())
            return Object.freeze({
              handoff: 'LOCAL_REFUSAL',
              result: Promise.resolve(
                Object.freeze({
                  version: 1,
                  kind: 'METADATA_QUERY',
                  status: 'FAILED',
                  code: 'BUSY',
                  dispatched: false,
                  operationRetired: true,
                  stdoutBase64: null,
                  stderrBase64: null,
                  remoteExitCode: null,
                  observedAtUtc: null,
                }),
              ),
              retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
            });
          current();
          if (metadataSequence >= 65536 || ids.size >= 65536) throw Error('ID_EXHAUSTED');
          const sequence = ++metadataSequence;
          const requestId = newId();
          if (!uuid(requestId) || requestId.length !== 36 || ids.has(requestId))
            throw Error('ID_EXHAUSTED');
          ids.add(requestId);
          current();
          return native.beginMetadata(
            Object.freeze({
              requestId,
              epoch: native.epoch,
              sequence,
              transportId: target.transportId,
              field,
              deadlineUtc,
            }),
          );
        },
      });
      if (!finalCurrent()) return null;
      issuedTickets++;
      tickets.set(deviceId, ticket);
      metadataTargets.set(ticket, record);
      return ticket;
    } catch {
      return null;
    }
  }
  return Object.freeze({
    metadataTarget,
    refresh,
    snapshot(): RegistrySnapshot | null {
      if (!projection) return null;
      try {
        admission();
        const latest = snapshot();
        admission();
        if (latest !== projection || (native !== null && !native.finalCurrent())) throw Error();
        return projection;
      } catch {
        projection = null;
        return null;
      }
    },
    availability(): 'LIVE_DISCOVERY_UNAVAILABLE' | 'OBSERVED' {
      if (source !== 'ADB_DISCOVERY' || !projection) return 'LIVE_DISCOVERY_UNAVAILABLE';
      try {
        admission();
        return projection && (native === null || native.finalCurrent())
          ? 'OBSERVED'
          : 'LIVE_DISCOVERY_UNAVAILABLE';
      } catch {
        projection = null;
        return 'LIVE_DISCOVERY_UNAVAILABLE';
      }
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
