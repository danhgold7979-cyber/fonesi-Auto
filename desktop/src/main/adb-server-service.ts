import { inspectRegistryVideoBinding, type OwnedRegistryVideoBinding } from './registry-store.ts';
import {
  snapshotVideoAdmission,
  snapshotVideoRecoveryResult,
  videoRecoveryRetired,
  type VideoRecoveryResult,
  type VideoRecoveryTransportSession,
  snapshotVideo,
  preparingVideo,
  type VideoSnapshot,
  type VideoMediaSink,
  type VideoTransportSession,
} from './video-contract.ts';
import { inspectFleetActiveInputIntent, type OwnedFleetActiveIntent } from './fleet-service.ts';
import {
  snapshotInputQueryFacts,
  validInputAction,
  type InputQueryFacts,
  type InputQueryAction,
  type InputQueryHandle,
} from './input-query-contract.ts';
/** Private source-only server controller. No application activation or persistent audit binding. */
import { snapshotHostRequest } from './adb-host-lifecycle.ts';
import type { HostRequest, HostResult, HostState } from './adb-host-lifecycle.ts';
import { isRealHostFactory, type createHostFactory } from './adb-host-factory.ts';
import { parseAdbServerDiscovery } from './adb-discovery.ts';
import {
  validMetadataField,
  validMetadataDeadline,
  validMetadataTransportId,
  snapshotMetadataQueryFacts,
  snapshotQueryRetirement,
  type MetadataQueryField,
  type MetadataQueryFacts,
  type MetadataQueryHandle,
  type QueryRetirement,
} from './metadata-query-contract.ts';
const nativePromise = Promise;
const nativePromisePrototype = Promise.prototype;
const nativeThen = Promise.prototype.then;
const nativeSpecies = Object.getOwnPropertyDescriptor(Promise, Symbol.species)?.get;
function metadataPromise(value: unknown): value is Promise<unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === nativePromisePrototype &&
    !Object.getOwnPropertyDescriptor(value, 'then') &&
    !Object.getOwnPropertyDescriptor(value, 'constructor') &&
    Object.getOwnPropertyDescriptor(nativePromisePrototype, 'then')?.value === nativeThen &&
    Object.getOwnPropertyDescriptor(nativePromisePrototype, 'constructor')?.value ===
      nativePromise &&
    Object.getOwnPropertyDescriptor(nativePromise, Symbol.species)?.get === nativeSpecies &&
    !('value' in (Object.getOwnPropertyDescriptor(nativePromise, Symbol.species) ?? {}))
  );
}
type Health = 'AVAILABLE' | 'DEGRADED';
type Factory = Pick<
  ReturnType<typeof createHostFactory>,
  | 'grant'
  | 'execute'
  | 'snapshot'
  | 'close'
  | 'retired'
  | 'assertCurrentSession'
  | 'assertRetiredSession'
  | 'acquireDiscovery'
  | 'acquireMetadata'
  | 'acquireInput'
  | 'videoArtifactAvailable'
  | 'startVideo'
  | 'statusVideo'
  | 'stopVideo'
  | 'startVideoRecovery'
  | 'statusVideoRecovery'
  | 'stopVideoRecovery'
  | 'assertDiscoveryEpochCurrent'
  | 'discoveryEpochWitness'
>;
export type ServerAudit = Readonly<{
  phase: 'INTENT' | 'RESULT';
  request: HostRequest;
  result: HostResult | null;
  state: HostState;
}>;
export type ServerReceipt =
  | Readonly<{ kind: 'OPERATION'; result: HostResult; auditHealth: Health }>
  | Readonly<{ kind: 'CLEANUP'; status: 'RETIRED' | 'UNRETIRED'; auditHealth: Health }>;
export type OwnedDiscoveryProvider = Readonly<{ ownedDiscovery: true }>;
export type OwnedDiscoveryRequest = Readonly<{
  requestId: string;
  epoch: object;
  sequence: number;
  deadlineUtc: number;
}>;
export type OwnedMetadataRequest = Readonly<{
  requestId: string;
  epoch: object;
  sequence: number;
  transportId: string;
  field: MetadataQueryField;
  deadlineUtc: number;
}>;
export type OwnedInputRequest = Readonly<
  Omit<OwnedMetadataRequest, 'field'> & {
    action: InputQueryAction;
    activeIntent: OwnedFleetActiveIntent;
  }
>;
type OwnedProviderRecord = Readonly<{
  epoch: object;
  revoked: boolean;
  source: 'ADB_DISCOVERY';
  installationRevision: number;
  current(): void;
  finalCurrent(): boolean;
  localBusy(): boolean;
  videoAvailable(): boolean;
  beginVideo(
    binding: OwnedRegistryVideoBinding,
    request: unknown,
    media?: VideoMediaSink,
  ): VideoTransportSession;
  beginVideoRecovery(
    binding: OwnedRegistryVideoBinding,
    request: unknown,
    media: VideoMediaSink,
  ): VideoRecoveryTransportSession;
  beginMetadata(request: OwnedMetadataRequest): MetadataQueryHandle;
  beginInput(request: OwnedInputRequest): InputQueryHandle;
  begin(
    request: OwnedDiscoveryRequest,
  ): Readonly<{ result: Promise<unknown>; retirement: Promise<unknown> }>;
}>;
const ownedProviders = new WeakMap<object, OwnedProviderRecord>();
export function inspectOwnedDiscoveryProvider(value: unknown): OwnedProviderRecord | null {
  return value !== null && typeof value === 'object' ? (ownedProviders.get(value) ?? null) : null;
}
const codes = [
  'OK',
  'INVALID_REQUEST',
  'NOT_AUTHORIZED',
  'BINARY_UNAVAILABLE',
  'BUSY',
  'DEADLINE',
  'NOT_READY',
  'CUSTODY_REJECTED',
  'TRANSPORT_FAILED',
  'INVALID_OBSERVATION',
  'RECOVERY_REQUIRED',
  'CLOSED',
  'INTERNAL_FAILURE',
] as const;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function observed(value: unknown): HostResult | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 3 ||
      keys.some((k) => !['outcome', 'code', 'diagnosticId'].includes(k as string))
    )
      return null;
    const d = Object.getOwnPropertyDescriptors(value);
    if (Object.values(d).some((x) => !('value' in x) || !x.enumerable)) return null;
    if (!d.outcome || !d.code || !d.diagnosticId) return null;
    const outcome = d.outcome.value,
      code = d.code.value,
      diagnosticId = d.diagnosticId.value;
    if (
      !['NOT_DISPATCHED', 'DISPATCHED_UNCONFIRMED', 'OBSERVED', 'OUTCOME_UNKNOWN'].includes(
        outcome,
      ) ||
      !codes.includes(code) ||
      (diagnosticId !== null && !uuid(diagnosticId)) ||
      (outcome === 'OBSERVED' && code !== 'OK')
    )
      return null;
    return Object.freeze({ outcome, code, diagnosticId });
  } catch {
    return null;
  }
}
export function createAdbServerService(
  options: Readonly<{
    ownerId: string;
    expectedInstallationRevision: number;
    assertOwnedSync(): void;
    assertCurrentSync(): void;
    clock(): number;
    newId(): string;
    createFactory(expectedInstallationRevision: number, operationSet: 'SERVER_ONLY'): Factory;
    audit(record: ServerAudit): Promise<Health>;
  }>,
) {
  const ownerId = options.ownerId,
    revision = options.expectedInstallationRevision,
    owned = options.assertOwnedSync.bind(options),
    current = options.assertCurrentSync.bind(options),
    clock = options.clock.bind(options),
    next = options.newId.bind(options),
    audit = options.audit.bind(options),
    build = options.createFactory.bind(options);
  if (!uuid(ownerId) || !Number.isSafeInteger(revision) || revision < 1)
    throw Error('INVALID_REQUEST');
  let closed = false,
    active: Promise<void> | null = null,
    closing: Promise<ServerReceipt> | null = null,
    started = false,
    startObserved = false,
    discoveryRevoked = false,
    discoveryCalls = 0,
    discoveryProviderValue: OwnedDiscoveryProvider | null = null,
    healthCalls = 0,
    auditDegraded = false;
  const ids = new Set<string>(),
    audits = new Set<Promise<Health>>();
  function fence() {
    if (closed) throw Error('CLOSED');
    owned();
    current();
    owned();
    if (closed) throw Error('CLOSED');
  }
  fence();
  const factory = build(revision, 'SERVER_ONLY');
  fence();
  const grant = factory.grant(ownerId, fence);
  fence();
  const snapshot = factory.snapshot.bind(factory),
    execute = factory.execute.bind(factory),
    retire = factory.close.bind(factory),
    assertCurrentSession = factory.assertCurrentSession.bind(factory),
    assertRetiredSession = factory.assertRetiredSession.bind(factory);
  const result = (
    code: HostResult['code'],
    outcome: HostResult['outcome'] = 'NOT_DISPATCHED',
  ): HostResult => Object.freeze({ outcome, code, diagnosticId: null });
  const receipt = (r: HostResult, health: Health = 'DEGRADED'): ServerReceipt =>
    Object.freeze({ kind: 'OPERATION', result: r, auditHealth: health });
  function id() {
    if (ids.size >= 65536) throw Error('INTERNAL_FAILURE');
    const v = next();
    if (!uuid(v) || ids.has(v)) throw Error('INTERNAL_FAILURE');
    ids.add(v);
    fence();
    return v;
  }
  let lastClock: number | null = null;
  function now() {
    const v = clock();
    fence();
    if (
      !Number.isSafeInteger(v) ||
      v < 0 ||
      Object.is(v, -0) ||
      (lastClock !== null && v < lastClock)
    )
      throw Error('INTERNAL_FAILURE');
    lastClock = v;
    return v;
  }
  function log(
    request: HostRequest,
    phase: 'INTENT' | 'RESULT',
    r: HostResult | null,
  ): Promise<Health> {
    const record = Object.freeze({ phase, request, result: r, state: snapshot().state });
    const work = Promise.resolve()
      .then(() => audit(record))
      .then(
        (v) => (v === 'AVAILABLE' ? ('AVAILABLE' as const) : ('DEGRADED' as const)),
        () => 'DEGRADED' as const,
      );
    audits.add(work);
    void work.then((h) => {
      if (h === 'DEGRADED') auditDegraded = true;
      audits.delete(work);
    });
    return work;
  }
  const recoveryWorks = new Set<Promise<unknown>>();
  function close(): Promise<ServerReceipt> {
    if (closing) return closing;
    closed = true;
    discoveryRevoked = true;
    let settleClose: (value: ServerReceipt) => void = () => {};
    closing = new Promise<ServerReceipt>((resolve) => {
      settleClose = resolve;
    });
    // Begin retained cleanup before waiting on any audit or ordinary operation.
    let cleanup: Promise<'RETIRED' | 'UNRETIRED'>;
    try {
      cleanup = Promise.resolve(retire()).catch(() => 'UNRETIRED' as const);
    } catch {
      cleanup = Promise.resolve('UNRETIRED');
    }
    const ordinary = active;
    const drain = (async () => {
      const status = await cleanup;
      if (ordinary) await ordinary;
      while (recoveryWorks.size) await Promise.allSettled([...recoveryWorks]);
      while (audits.size) await Promise.all([...audits]);
      return status;
    })();
    void (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const status = await Promise.race([
          drain,
          new Promise<'UNRETIRED'>((resolve) => {
            timer = setTimeout(() => resolve('UNRETIRED'), 120000);
          }),
        ]);
        return Object.freeze({
          kind: 'CLEANUP' as const,
          status:
            status === 'RETIRED' &&
            factory.retired &&
            active === null &&
            audits.size === 0 &&
            recoveryWorks.size === 0
              ? ('RETIRED' as const)
              : ('UNRETIRED' as const),
          auditHealth:
            auditDegraded || audits.size ? ('DEGRADED' as const) : ('AVAILABLE' as const),
        });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    })().then(settleClose);
    return closing;
  }
  function operation(
    kind: 'SERVER_START' | 'SERVER_HEALTH' | 'SERVER_STOP',
  ): Promise<ServerReceipt> {
    if (closed)
      return kind === 'SERVER_STOP' ? close() : Promise.resolve(receipt(result('CLOSED')));
    if (active) return kind === 'SERVER_STOP' ? close() : Promise.resolve(receipt(result('BUSY')));
    let finish: () => void = () => {};
    active = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let expired = false,
      dispatched = false;
    const work = (async (): Promise<ServerReceipt> => {
      // Yield only after the lane is reserved, before any injected allocator/clock/audit.
      await Promise.resolve();
      try {
        try {
          fence();
        } catch {
          void close();
          return receipt(result('NOT_AUTHORIZED'));
        }
        if (kind === 'SERVER_START' && started) return receipt(result('NOT_READY'));
        if (kind === 'SERVER_HEALTH' && (!started || snapshot().state !== 'READY'))
          return receipt(result('NOT_READY'));
        if (kind === 'SERVER_HEALTH' && healthCalls >= 128) return receipt(result('BUSY'));
        const start = now();
        if (start > Number.MAX_SAFE_INTEGER - 30000) return receipt(result('INVALID_REQUEST'));
        const request = snapshotHostRequest({
          version: 1,
          commandId: id(),
          correlationId: id(),
          ownerId,
          operation: kind,
          deadlineUtc: start + 30000,
        });
        if (!request) return receipt(result('INVALID_REQUEST'));
        if (kind === 'SERVER_HEALTH') healthCalls++;
        const intentWork = log(request, 'INTENT', null);
        const intent = kind === 'SERVER_STOP' ? 'AVAILABLE' : await intentWork;
        fence();
        if (expired || now() >= request.deadlineUtc) {
          void close();
          return receipt(result('DEADLINE'));
        }
        if (intent !== 'AVAILABLE' && kind !== 'SERVER_STOP')
          return receipt(result('INTERNAL_FAILURE'));
        fence();
        if (kind === 'SERVER_START') started = true;
        if (kind === 'SERVER_STOP') discoveryRevoked = true;
        dispatched = true;
        const r = observed(await execute(grant, request));
        if (!r) {
          void close();
          return receipt(result('INVALID_OBSERVATION', 'OUTCOME_UNKNOWN'));
        }
        if (r.outcome === 'OUTCOME_UNKNOWN' || r.outcome === 'DISPATCHED_UNCONFIRMED') void close();
        const health = await log(request, 'RESULT', r);
        const actualIntent = await intentWork;
        try {
          fence();
          const publicationAt = now();
          if (r.outcome === 'OBSERVED' && r.code === 'OK') {
            if (kind === 'SERVER_STOP') assertRetiredSession();
            else assertCurrentSession();
          }
          // No external callback after the final retained-token/terminal assertion.
          if (closed || expired || publicationAt >= request.deadlineUtc) throw Error('DEADLINE');
        } catch {
          void close();
          return receipt(result('RECOVERY_REQUIRED', 'OUTCOME_UNKNOWN'));
        }
        if (kind === 'SERVER_START' && r.outcome === 'OBSERVED' && r.code === 'OK')
          startObserved = true;
        if (r.outcome !== 'OBSERVED') discoveryRevoked = true;
        return receipt(
          r,
          actualIntent === 'AVAILABLE' && health === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED',
        );
      } catch {
        void close();
        return receipt(
          result(
            closed ? 'CLOSED' : 'NOT_AUTHORIZED',
            dispatched ? 'OUTCOME_UNKNOWN' : 'NOT_DISPATCHED',
          ),
        );
      } finally {
        active = null;
        finish();
        if (timeout !== undefined) clearTimeout(timeout);
      }
    })();
    const deadline = new Promise<ServerReceipt>((resolve) => {
      timeout = setTimeout(() => {
        expired = true;
        void close();
        resolve(receipt(result('DEADLINE', dispatched ? 'OUTCOME_UNKNOWN' : 'NOT_DISPATCHED')));
      }, 30000);
    });
    return Promise.race([work, deadline]).then((r) =>
      kind === 'SERVER_STOP' && closed ? close() : r,
    );
  }
  function discoveryProvider(): OwnedDiscoveryProvider {
    if (!isRealHostFactory(factory) || !startObserved || active || closed || discoveryRevoked)
      throw Error('NOT_READY');
    fence();
    assertCurrentSession();
    if (closed || discoveryRevoked) throw Error('NOT_READY');
    if (discoveryProviderValue) return discoveryProviderValue;
    const epoch = Object.freeze({});
    const failed = () =>
      Object.freeze({
        outcome: 'FAILED',
        raw: null,
        observedAtUtc: null,
        stdoutTruncated: false,
        stderrTruncated: false,
      });
    const refusal = () =>
      Object.freeze({
        result: Promise.resolve(failed()),
        retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
      });
    const acquire = factory.acquireDiscovery.bind(factory);
    const acquireMetadata = factory.acquireMetadata?.bind(factory);
    const acquireInput = factory.acquireInput?.bind(factory);
    let metadataSequence = 0;
    const metadataIds = new Set<string>();
    function metadataFailure(
      code: MetadataQueryFacts['code'] = 'NATIVE_FAILED',
      dispatched = false,
    ): MetadataQueryFacts {
      return Object.freeze({
        version: 1,
        kind: 'METADATA_QUERY',
        status: 'FAILED',
        code,
        dispatched,
        operationRetired: true,
        stdoutBase64: null,
        stderrBase64: null,
        remoteExitCode: null,
        observedAtUtc: null,
      });
    }
    const assertEpochCurrent = factory.assertDiscoveryEpochCurrent.bind(factory);
    const epochWitness = factory.discoveryEpochWitness();
    const installationRevision = epochWitness.installationRevision;
    if (
      typeof installationRevision !== 'number' ||
      !Number.isSafeInteger(installationRevision) ||
      installationRevision <= 0 ||
      !epochWitness.valid
    )
      throw Error('NOT_READY');
    const currentEpoch = (requireIdleProof = false) => {
      try {
        fence();
        now();
        if (!active || requireIdleProof) assertEpochCurrent();
        if (closed || discoveryRevoked) throw Error();
      } catch {
        discoveryRevoked = true;
        void close();
        throw Error('EPOCH_REVOKED');
      }
    };
    function beginQuery(
      input: OwnedMetadataRequest | OwnedInputRequest,
      mode: 'METADATA' | 'INPUT',
    ): MetadataQueryHandle | InputQueryHandle {
      type QueryFacts = MetadataQueryFacts | InputQueryFacts;
      const failureFor = (
        code: 'BUSY' | 'CLOSED' | 'ADMISSION_REJECTED' | 'NATIVE_FAILED',
        dispatched = false,
      ): QueryFacts =>
        mode === 'METADATA'
          ? metadataFailure(code, dispatched)
          : Object.freeze({
              version: 1,
              kind: 'INPUT_QUERY',
              status: 'FAILED',
              code,
              dispatched,
              operationRetired: true,
              remoteExitCode: null,
              stdoutEmpty: null,
              stderrEmpty: null,
              observedAtUtc: null,
            });
      const refusalFor = (code: 'BUSY' | 'CLOSED' | 'ADMISSION_REJECTED') =>
        Object.freeze({
          handoff: 'LOCAL_REFUSAL' as const,
          result: Promise.resolve(failureFor(code)),
          retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' as const })),
        }) as MetadataQueryHandle | InputQueryHandle;
      if (active) return refusalFor('BUSY');
      if (closed || discoveryRevoked || !(mode === 'INPUT' ? acquireInput : acquireMetadata))
        return refusalFor('CLOSED');
      let release = () => {};
      const reserved = new Promise<void>((resolve) => {
        release = resolve;
      });
      active = reserved;
      const localRefusal = () => {
        if (active === reserved) active = null;
        release();
        return refusalFor('ADMISSION_REJECTED');
      };
      let request: OwnedMetadataRequest | OwnedInputRequest;
      try {
        const d = Object.getOwnPropertyDescriptors(input);
        const keys = [
          'requestId',
          'epoch',
          'sequence',
          'transportId',
          mode === 'INPUT' ? 'action' : 'field',
          'deadlineUtc',
          ...(mode === 'INPUT' ? ['activeIntent'] : []),
        ];
        if (
          ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
          !Object.isFrozen(input) ||
          Reflect.ownKeys(d).length !== keys.length ||
          keys.some((k) => !d[k] || !('value' in d[k]) || !d[k].enumerable) ||
          !uuid(d.requestId?.value) ||
          d.requestId?.value.length !== 36 ||
          metadataIds.has(d.requestId?.value) ||
          metadataIds.size >= 65536 ||
          d.epoch?.value !== epoch ||
          typeof d.sequence?.value !== 'number' ||
          !Number.isSafeInteger(d.sequence?.value) ||
          d.sequence?.value <= metadataSequence ||
          d.sequence?.value > 65536 ||
          !validMetadataTransportId(d.transportId?.value) ||
          !(mode === 'INPUT'
            ? validInputAction(d.action?.value) &&
              !!inspectFleetActiveInputIntent(d.activeIntent?.value)?.finalCurrent()
            : validMetadataField(d.field?.value)) ||
          !validMetadataDeadline(d.deadlineUtc?.value)
        )
          return localRefusal();
        request = Object.freeze(Object.fromEntries(keys.map((k) => [k, d[k]?.value]))) as
          | OwnedMetadataRequest
          | OwnedInputRequest;
      } catch {
        return localRefusal();
      }
      metadataSequence = request.sequence;
      metadataIds.add(request.requestId);
      let resolveResult!: (facts: QueryFacts) => void;
      let resolveRetirement!: (retirement: QueryRetirement) => void;
      const result = new Promise<QueryFacts>((resolve) => {
        resolveResult = resolve;
      });
      const retirement = new Promise<QueryRetirement>((resolve) => {
        resolveRetirement = resolve;
      });
      void Promise.resolve().then(async () => {
        const attached: Promise<unknown>[] = [];
        let obligationsSettled = false;
        let invoked = false,
          cleanupWork: Promise<boolean> | null = null;
        const cleanup = () => {
          discoveryRevoked = true;
          if (!cleanupWork) {
            try {
              cleanupWork = Promise.resolve(retire()).then(
                (status) => status === 'RETIRED' && factory.retired,
                () => false,
              );
            } catch {
              cleanupWork = Promise.resolve(false);
            }
          }
          return cleanupWork;
        };
        let response: QueryFacts | null = null;
        try {
          currentEpoch(true);
          const start = now();
          if (
            request.deadlineUtc <= start ||
            request.deadlineUtc - start > 30000 ||
            discoveryCalls >= 128
          )
            throw Error('ADMISSION_REJECTED');
          currentEpoch(true);
          if (
            mode === 'INPUT' &&
            !inspectFleetActiveInputIntent(
              (request as OwnedInputRequest).activeIntent,
            )?.finalCurrent()
          )
            throw Error('ADMISSION_REJECTED');
          discoveryCalls++;
          invoked = true;
          const handle =
            mode === 'INPUT'
              ? acquireInput?.(
                  grant,
                  Object.freeze({
                    transportId: request.transportId,
                    action: (request as OwnedInputRequest).action,
                    activeIntent: (request as OwnedInputRequest).activeIntent,
                    deadlineUtc: request.deadlineUtc,
                  }),
                )
              : acquireMetadata?.(
                  grant,
                  Object.freeze({
                    transportId: request.transportId,
                    field: (request as OwnedMetadataRequest).field,
                    deadlineUtc: request.deadlineUtc,
                  }),
                );
          const descriptors = Object.getOwnPropertyDescriptors(handle);
          if (
            Reflect.ownKeys(descriptors).length !== 3 ||
            ['handoff', 'result', 'retirement'].some(
              (k) => !descriptors[k] || !('value' in descriptors[k]),
            ) ||
            descriptors.handoff?.value !== 'QUERY' ||
            !metadataPromise(descriptors.result?.value) ||
            !metadataPromise(descriptors.retirement?.value)
          )
            throw Error('METADATA_REJECTED');
          const resultWork = nativeThen.call(
            descriptors.result?.value,
            (raw: unknown) => {
              const facts =
                mode === 'INPUT' ? snapshotInputQueryFacts(raw) : snapshotMetadataQueryFacts(raw);
              if (facts?.status !== 'COMPLETE') void cleanup();
              return facts;
            },
            () => {
              void cleanup();
              return null;
            },
          ) as Promise<QueryFacts | null>;
          attached.push(resultWork);
          const retirementWork = nativeThen.call(
            descriptors.retirement?.value,
            (raw: unknown) => {
              const facts = snapshotQueryRetirement(raw);
              if (facts?.status !== 'RETIRED') void cleanup();
              return facts;
            },
            () => {
              void cleanup();
              return null;
            },
          ) as Promise<QueryRetirement | null>;
          attached.push(retirementWork);
          const [facts, retired] = await Promise.all([resultWork, retirementWork]);
          obligationsSettled = true;
          response = facts;
          if (
            !facts ||
            !retired ||
            retired.status !== 'RETIRED' ||
            !facts.operationRetired ||
            facts.status !== 'COMPLETE'
          )
            throw Error('METADATA_REJECTED');
          const completed = now();
          if (
            facts.observedAtUtc === null ||
            facts.observedAtUtc < start ||
            facts.observedAtUtc > completed ||
            facts.observedAtUtc > request.deadlineUtc
          )
            throw Error('METADATA_REJECTED');
          currentEpoch(true);
          if (
            closed ||
            discoveryRevoked ||
            (lastClock ?? completed) >= request.deadlineUtc ||
            !epochWitness.valid
          )
            throw Error('EPOCH_REVOKED');
          resolveResult(facts);
          resolveRetirement(Object.freeze({ status: 'RETIRED' }));
        } catch {
          const cleanupPending = cleanup();
          await Promise.allSettled(attached);
          const cleaned = await cleanupPending;
          resolveResult(
            response && response.status !== 'COMPLETE'
              ? response
              : failureFor('NATIVE_FAILED', invoked),
          );
          resolveRetirement(
            Object.freeze({
              status: cleaned && (!invoked || obligationsSettled) ? 'RETIRED' : 'UNRETIRED',
            }),
          );
        } finally {
          if (!invoked || obligationsSettled) {
            active = null;
            release();
          }
          // Unobservable query obligations remain retained; server close cannot claim clean.
        }
      });
      return Object.freeze({ handoff: 'QUERY', result, retirement }) as
        | MetadataQueryHandle
        | InputQueryHandle;
    }
    let video: VideoTransportSession | null = null;
    let videoReserved = false;
    function beginVideo(
      bindingTicket: OwnedRegistryVideoBinding,
      raw: unknown,
      media?: VideoMediaSink,
    ): VideoTransportSession {
      if (videoReserved || recoverySessions.size || active || closed || discoveryRevoked)
        throw Error('VIDEO_REJECTED');
      videoReserved = true;
      const request = snapshotVideoAdmission(raw);
      const binding = inspectRegistryVideoBinding(bindingTicket);
      if (!request || !binding?.finalCurrent()) throw Error('VIDEO_REJECTED');
      if (video || active || closed || discoveryRevoked) throw Error('VIDEO_REJECTED');
      let handed = false;
      let stopRequested = false,
        stopWork: Promise<VideoSnapshot> | null = null;
      let latest = preparingVideo(request.videoId);
      let resolveStart: (value: VideoSnapshot) => void = () => {};
      let rejectStart: (reason: Error) => void = () => {};
      const started = new Promise<VideoSnapshot>((resolve, reject) => {
        resolveStart = resolve;
        rejectStart = reject;
      });
      let release: () => void = () => {};
      active = new Promise<void>((resolve) => {
        release = resolve;
      });
      const session: VideoTransportSession = Object.freeze({
        started,
        async status() {
          if (stopRequested) return latest;
          if (active || closed || discoveryRevoked) throw Error('VIDEO_REJECTED');
          let releaseStatus: () => void = () => {};
          active = new Promise<void>((r) => {
            releaseStatus = r;
          });
          try {
            currentEpoch(true);
            const facts = snapshotVideo(
              await factory.statusVideo(grant, request.videoId, bindingTicket),
            );
            if (!facts) throw Error('VIDEO_REJECTED');
            latest = facts;
            return facts;
          } finally {
            active = null;
            releaseStatus();
          }
        },
        stop() {
          if (stopWork) return stopWork;
          stopRequested = true;
          // Cleanup preempts immediately, but retirement also owns the ordinary
          // START/STATUS admission already in flight (including custody awaits).
          const ordinaryDrain = active;
          let resolveCleanup: (value: VideoSnapshot | PromiseLike<VideoSnapshot>) => void =
            () => {};
          let rejectCleanup: (reason: Error) => void = () => {};
          const cleanup = new Promise<VideoSnapshot>((resolve, reject) => {
            resolveCleanup = resolve;
            rejectCleanup = reject;
          });
          stopWork = Promise.allSettled([cleanup, ordinaryDrain]).then(([result]) => {
            if (result.status !== 'fulfilled') throw Error('VIDEO_REJECTED');
            latest = result.value;
            return latest;
          });
          try {
            media?.close();
          } catch {
            /* Cleanup remains mandatory. */
          }
          // Publish the idempotent latch before callbacks, then synchronously
          // propagate cancellation to the final adapter handoff fence.
          try {
            resolveCleanup(
              handed ? factory.stopVideo(grant, request.videoId) : started.then(() => latest),
            );
          } catch {
            rejectCleanup(Error('VIDEO_REJECTED'));
          }
          return stopWork;
        },
      });
      video = session; // Register before ordinary, clock, custody and artifact callbacks.
      void Promise.resolve()
        .then(async () => {
          if (stopRequested) {
            latest = Object.freeze({
              ...latest,
              state: 'CLOSED',
              code: 'CLOSED',
              localRetired: true,
            });
            resolveStart(latest);
            return;
          }
          currentEpoch(true);
          if (!binding.finalCurrent()) throw Error('VIDEO_REJECTED');
          handed = true;
          const facts = snapshotVideo(
            await factory.startVideo(grant, request, bindingTicket, media),
          );
          if (!facts) throw Error('VIDEO_REJECTED');
          latest = facts;
          resolveStart(facts);
        })
        .catch(() => {
          discoveryRevoked = true;
          void close();
          rejectStart(Error('VIDEO_REJECTED'));
        })
        .finally(() => {
          active = null;
          release();
        });
      return session;
    }
    const provider = Object.freeze({ ownedDiscovery: true as const });
    const recoverySessions = new Map<string, VideoRecoveryTransportSession>();
    let currentRecovery: VideoRecoveryTransportSession | null = null;
    function beginVideoRecovery(
      bindingTicket: OwnedRegistryVideoBinding,
      raw: unknown,
      media: VideoMediaSink,
    ): VideoRecoveryTransportSession {
      if (
        videoReserved ||
        active ||
        closed ||
        discoveryRevoked ||
        recoverySessions.size >= 128 ||
        (currentRecovery && !currentRecovery.retired)
      )
        throw Error('VIDEO_REJECTED');
      const request = snapshotVideoAdmission(raw);
      const binding = inspectRegistryVideoBinding(bindingTicket);
      if (!request || !binding?.finalCurrent() || recoverySessions.has(request.videoId))
        throw Error('VIDEO_REJECTED');
      let handed = false,
        stopped = false,
        startDone = false,
        stopDone = false,
        uncertainVideo = false,
        pendingVideo = 1;
      let latest: VideoRecoveryResult | null = null;
      let stopWork: Promise<VideoRecoveryResult | null> | null = null;
      let release = () => {};
      const ordinary = new Promise<void>((resolve) => {
        release = resolve;
      });
      active = ordinary;
      const accept = (rawResult: unknown) => {
        // Only the trusted factory may return null: its captured construction was
        // cancelled and actually drained before provider handoff, not a wire refusal.
        if (rawResult === null) {
          if (latest !== null) throw Error('VIDEO_REJECTED');
          handed = false;
          return null;
        }
        const value = snapshotVideoRecoveryResult(rawResult);
        if (
          !value ||
          value.videoId !== request.videoId ||
          (latest && value.videoOrdinal !== latest.videoOrdinal)
        )
          throw Error('VIDEO_REJECTED');
        if (latest && latest.handoff !== value.handoff) throw Error('VIDEO_REJECTED');
        const prior = latest?.snapshot,
          next = value.snapshot;
        if (prior && next) {
          if (next.snapshotRevision < prior.snapshotRevision) return latest as VideoRecoveryResult;
          if (
            (next.snapshotRevision === prior.snapshotRevision &&
              JSON.stringify(prior) !== JSON.stringify(next)) ||
            (prior.localRetired && !next.localRetired)
          )
            throw Error('VIDEO_REJECTED');
        }
        latest = value;
        return value;
      };
      const started = Promise.resolve()
        .then(async () => {
          if (stopped) return null;
          currentEpoch(true);
          if (stopped || !binding.finalCurrent()) return null;
          handed = true;
          return accept(await factory.startVideoRecovery(grant, request, bindingTicket, media));
        })
        .catch(() => {
          if (!handed) return null;
          uncertainVideo = true;
          discoveryRevoked = true;
          void close();
          throw Error('VIDEO_REJECTED');
        })
        .finally(() => {
          startDone = true;
          pendingVideo--;
          if (active === ordinary) active = null;
          release();
        });
      recoveryWorks.add(started);
      void started.then(
        () => recoveryWorks.delete(started),
        () => recoveryWorks.delete(started),
      );
      const session: VideoRecoveryTransportSession = Object.freeze({
        started,
        get retired() {
          return (
            stopped &&
            stopDone &&
            startDone &&
            pendingVideo === 0 &&
            !uncertainVideo &&
            (!handed || (latest !== null && videoRecoveryRetired(latest)))
          );
        },
        async status() {
          if (stopped) return latest;
          if (active || closed || discoveryRevoked || currentRecovery !== session)
            throw Error('VIDEO_REJECTED');
          let releaseStatus = () => {};
          const statusSlot = new Promise<void>((resolve) => {
            releaseStatus = resolve;
          });
          active = statusSlot;
          pendingVideo++;
          const work = Promise.resolve().then(async () => {
            currentEpoch(true);
            if (stopped || currentRecovery !== session || !binding.finalCurrent())
              throw Error('VIDEO_REJECTED');
            return accept(await factory.statusVideoRecovery(grant, request.videoId, bindingTicket));
          });
          recoveryWorks.add(work);
          try {
            return await work;
          } catch {
            uncertainVideo = true;
            throw Error('VIDEO_REJECTED');
          } finally {
            pendingVideo--;
            recoveryWorks.delete(work);
            if (active === statusSlot) active = null;
            releaseStatus();
          }
        },
        stop() {
          if (stopWork) return stopWork;
          stopped = true;
          const drain = active;
          let resolveStop: (value: VideoRecoveryResult | null) => void = () => {};
          let rejectStop: (reason: Error) => void = () => {};
          stopWork = new Promise((resolve, reject) => {
            resolveStop = resolve;
            rejectStop = reject;
          });
          const retained = stopWork;
          pendingVideo++;
          recoveryWorks.add(retained);
          try {
            media.close();
          } catch {
            uncertainVideo = true;
          }
          let immediate: Promise<VideoRecoveryResult | null> | null = null;
          try {
            if (handed) immediate = factory.stopVideoRecovery(grant, request.videoId);
          } catch {
            uncertainVideo = true;
          }
          void Promise.resolve()
            .then(async () => {
              if (immediate) accept(await immediate);
              await started;
              if (!immediate && handed)
                accept(await factory.stopVideoRecovery(grant, request.videoId));
              if (drain) await drain;
              if (handed && (!latest || !videoRecoveryRetired(latest))) uncertainVideo = true;
            })
            .then(
              () => {
                pendingVideo--;
                stopDone = true;
                recoveryWorks.delete(retained);
                if (uncertainVideo) rejectStop(Error('VIDEO_REJECTED'));
                else resolveStop(latest);
              },
              () => {
                pendingVideo--;
                stopDone = true;
                uncertainVideo = true;
                recoveryWorks.delete(retained);
                rejectStop(Error('VIDEO_REJECTED'));
              },
            );
          return retained;
        },
      });
      recoverySessions.set(request.videoId, session);
      currentRecovery = session; // Publish before the scheduled START can call another owner.
      return session;
    }
    const record: OwnedProviderRecord = Object.freeze({
      epoch,
      source: 'ADB_DISCOVERY' as const,
      installationRevision,
      get revoked() {
        return discoveryRevoked || closed;
      },
      current: currentEpoch,
      localBusy: () => active !== null && !closed && !discoveryRevoked,
      finalCurrent: () => !discoveryRevoked && !closed && epochWitness.valid,
      beginVideo,
      beginVideoRecovery,
      videoAvailable: () => !closed && !discoveryRevoked && factory.videoArtifactAvailable(),
      beginMetadata: (input: OwnedMetadataRequest) =>
        beginQuery(input, 'METADATA') as MetadataQueryHandle,
      beginInput: (input: OwnedInputRequest) => beginQuery(input, 'INPUT') as InputQueryHandle,
      begin(input: OwnedDiscoveryRequest) {
        let request: OwnedDiscoveryRequest;
        try {
          const d = Object.getOwnPropertyDescriptors(input);
          const keys = ['requestId', 'epoch', 'sequence', 'deadlineUtc'];
          if (
            !Object.isFrozen(input) ||
            Reflect.ownKeys(d).length !== keys.length ||
            keys.some((key) => !d[key] || !('value' in d[key]) || !d[key].enumerable)
          )
            return refusal();
          if (
            !uuid(d.requestId.value) ||
            d.epoch.value !== epoch ||
            typeof d.sequence.value !== 'number' ||
            !Number.isSafeInteger(d.sequence.value) ||
            d.sequence.value < 1 ||
            typeof d.deadlineUtc.value !== 'number' ||
            !Number.isSafeInteger(d.deadlineUtc.value)
          )
            return refusal();
          request = Object.freeze({
            requestId: d.requestId.value,
            epoch: d.epoch.value,
            sequence: d.sequence.value,
            deadlineUtc: d.deadlineUtc.value,
          });
        } catch {
          return refusal();
        }
        if (active) return refusal();
        if (closed || discoveryRevoked || request.epoch !== epoch) return refusal();
        let release: () => void = () => {};
        active = new Promise<void>((resolve) => {
          release = resolve;
        });
        let resultResolve!: (value: unknown) => void;
        let retireResolve!: (value: unknown) => void;
        let retireReject!: (error: Error) => void;
        const result = new Promise<unknown>((resolve) => {
          resultResolve = resolve;
        });
        const retirement = new Promise<unknown>((resolve, reject) => {
          retireResolve = resolve;
          retireReject = reject;
        });
        // Reader may observe result first; keep the rejection handled before returning both promises.
        void retirement.catch(() => undefined);
        void Promise.resolve().then(async () => {
          let nativeStarted = false;
          let cleanupWork: Promise<boolean> | null = null;
          const cleanup = () => {
            discoveryRevoked = true;
            if (!cleanupWork) {
              try {
                cleanupWork = Promise.resolve(retire()).then(
                  (status) => status === 'RETIRED' && factory.retired,
                  () => false,
                );
              } catch {
                cleanupWork = Promise.resolve(false);
              }
            }
            return cleanupWork;
          };
          try {
            currentEpoch(true);
            const start = now();
            if (
              !Number.isSafeInteger(request.deadlineUtc) ||
              request.deadlineUtc <= start ||
              request.deadlineUtc - start > 30000 ||
              discoveryCalls >= 128
            ) {
              resultResolve(failed());
              retireResolve(Object.freeze({ status: 'RETIRED' }));
              return;
            }
            currentEpoch(true);
            discoveryCalls++;
            nativeStarted = true;
            const handle = acquire(grant, Object.freeze({ deadlineUtc: request.deadlineUtc }));
            const resultWork = handle.result.then(
              (value) => {
                if (value.status !== 'COMPLETE' || !value.operationRetired) void cleanup();
                return value;
              },
              (error) => {
                void cleanup();
                throw error;
              },
            );
            const retirementWork = handle.retirement.then(
              (value) => {
                if (value.status !== 'RETIRED') void cleanup();
                return value;
              },
              (error) => {
                void cleanup();
                throw error;
              },
            );
            const [observed, retiredOperation] = await Promise.allSettled([
              resultWork,
              retirementWork,
            ]);
            if (observed.status !== 'fulfilled' || retiredOperation.status !== 'fulfilled')
              throw Error('UNRETIRED');
            const response = observed.value,
              settlement = retiredOperation.value;
            if (
              response.status !== 'COMPLETE' ||
              response.code !== 'OK' ||
              !response.operationRetired ||
              settlement.status !== 'RETIRED' ||
              response.payloadBase64 === null ||
              response.observedAtUtc === null
            )
              throw Error('DISCOVERY_REJECTED');
            const bytes = Buffer.from(response.payloadBase64, 'base64');
            if (bytes.length > 32768 || bytes.toString('base64') !== response.payloadBase64)
              throw Error('DISCOVERY_REJECTED');
            const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            const parsed = parseAdbServerDiscovery(raw);
            const completion = now();
            if (
              !parsed.ok ||
              response.observedAtUtc < start ||
              response.observedAtUtc > completion ||
              response.observedAtUtc > request.deadlineUtc
            )
              throw Error('DISCOVERY_REJECTED');
            currentEpoch(true);
            if (
              closed ||
              discoveryRevoked ||
              lastClock === null ||
              lastClock >= request.deadlineUtc
            )
              throw Error('EPOCH_REVOKED');
            resultResolve(
              Object.freeze({
                outcome: 'COMPLETE',
                raw,
                observedAtUtc: response.observedAtUtc,
                stdoutTruncated: false,
                stderrTruncated: false,
              }),
            );
            retireResolve(Object.freeze({ status: 'RETIRED' }));
          } catch {
            discoveryRevoked = true;
            // Cleanup is independent of this service lane; never await service.close here.
            let retired = false;
            try {
              retired = await cleanup();
            } catch {}
            resultResolve(failed());
            if (retired || !nativeStarted) retireResolve(Object.freeze({ status: 'RETIRED' }));
            else retireReject(Error('UNRETIRED'));
          } finally {
            active = null;
            release();
          }
        });
        return Object.freeze({ result, retirement });
      },
    });
    ownedProviders.set(provider, record);
    discoveryProviderValue = provider;
    return provider;
  }
  return Object.freeze({
    start: () => operation('SERVER_START'),
    health: () => operation('SERVER_HEALTH'),
    stop: () => operation('SERVER_STOP'),
    snapshot,
    discoveryProvider,
    close,
    get retired() {
      return closed && factory.retired && active === null && audits.size === 0;
    },
  });
}
