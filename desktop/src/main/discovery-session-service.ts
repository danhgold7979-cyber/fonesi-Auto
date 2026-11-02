import { createOwnedVideoMediaConsumer } from './owned-video-consumer.ts';
import type { VideoMediaSink, VideoSession } from './video-contract.ts';
// Main-owned explicit lifecycle facade. No implicit start, acquisition, retry or epoch reset.
import {
  snapshotDiscoveryRequest,
  discoverySuccess,
  discoveryError,
  type DiscoveryRequest,
  type DiscoverySnapshot,
  type DiscoveryCode,
} from '../discovery-contract.ts';
import type { DiscoveryAudit } from '../discovery-audit-contract.ts';
import {
  inspectOwnedDiscoveryProvider,
  type createAdbServerService,
  type OwnedDiscoveryProvider,
  type ServerAudit,
} from './adb-server-service.ts';
import {
  inspectOwnedMetadataTarget,
  inspectOwnedInputTarget,
  type OwnedInputTarget,
  type OwnedMetadataTarget,
  type createAdbDiscoveryService,
  type DiscoveryReceipt,
} from './adb-discovery-service.ts';
import { createOwnedDeviceTransportOwner } from './owned-transport-metadata.ts';
import { inspectOwnedInputAuditWriter } from './logging.ts';
import { inspectFleetActiveInputIntent, type createFleetService } from './fleet-service.ts';
import {
  snapshotInputInteractionRequest,
  snapshotInputInteractionSnapshot,
  snapshotInputInteractionReceipt,
  inputInteractionSuccess,
  inputInteractionError,
  type InputInteractionRequest,
  type InputInteractionSnapshot,
  type InputInteractionCode,
} from '../input-interaction-contract.ts';
import { createDeviceQueueBudget } from './device-actor.ts';
import {
  METADATA_FIELDS,
  METADATA_CODES,
  snapshotMetadataRequest,
  metadataSuccess,
  metadataError,
  type MetadataRequest,
  type MetadataSnapshot,
  type MetadataCode,
} from '../metadata-contract.ts';
import type { MetadataAudit } from '../metadata-audit-contract.ts';
import type { PlatformToolsRuntimeCustody } from './platform-tools-runtime-custody.ts';
import type { RegistrySnapshot } from './transport-registry.ts';
import {
  ASSOCIATION_CODES,
  snapshotAssociationRequest,
  snapshotAssociationSnapshot,
  snapshotAssociationPhaseReceipt,
  associationSuccess,
  associationError,
  type AssociationRequest,
  type AssociationSnapshot,
  type AssociationPhaseReceipt,
  type AssociationCode,
} from '../association-contract.ts';
import type { AssociationAudit } from '../association-audit-contract.ts';
import { confirmAssociationInteraction } from './association-confirmation.ts';
type Health = 'AVAILABLE' | 'DEGRADED';
type Server = ReturnType<typeof createAdbServerService>;
type Ingestion = ReturnType<typeof createAdbDiscoveryService>;
type Policy =
  | 'NOT_PROVISIONED'
  | 'POLICY_DENIED'
  | 'RETAINED_HOST_DISABLED'
  | 'UNSUPPORTED_PATH'
  | 'OWNER_REVOKED'
  | 'RECOVERY_REQUIRED'
  | 'CLOSED';
export type DiscoverySessionOptions = Readonly<{
  custody: PlatformToolsRuntimeCustody;
  fleet?: ReturnType<typeof createFleetService>;
  logger?: unknown;
  assertOwnedSync(): void;
  clock(): number;
  newId(): string;
  audit(record: DiscoveryAudit): Promise<Health>;
  metadataAudit?(record: MetadataAudit): Promise<Health>;
  associationAudit?(record: AssociationAudit): Promise<Health>;
  policy(): Policy | null;
  readDurableRevision(): number;
  createServer(
    installationRevision: number,
    assertCurrentSync: () => void,
    audit: (record: ServerAudit) => Promise<Health>,
  ): Server;
  createIngestion(provider: OwnedDiscoveryProvider, assertCurrentSync: () => void): Ingestion;
}>;
const faults = new WeakMap<object, DiscoveryCode>();
class Fault extends Error {
  constructor(code: DiscoveryCode) {
    super(code);
    faults.set(this, code);
  }
}
const codeOf = (e: unknown): DiscoveryCode =>
  e !== null && typeof e === 'object' ? (faults.get(e) ?? 'INTERNAL_FAILURE') : 'INTERNAL_FAILURE';
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const metadataFaults = new WeakMap<object, MetadataCode>();
class MetadataFault extends Error {
  constructor(code: MetadataCode) {
    super(code);
    metadataFaults.set(this, code);
  }
}
function metadataCode(e: unknown): MetadataCode {
  if (e !== null && typeof e === 'object') {
    const code = metadataFaults.get(e) ?? faults.get(e);
    if (code && METADATA_CODES.some((v) => v === code)) return code as MetadataCode;
  }
  return 'INTERNAL_FAILURE';
}
function metadataActorCode(code: string): MetadataCode {
  if (code === 'INVALID_REQUEST') return 'INVALID_SHAPE';
  return METADATA_CODES.some((v) => v === code) ? (code as MetadataCode) : 'INTERNAL_FAILURE';
}
const associationFaults = new WeakMap<object, AssociationCode>();
class AssociationFault extends Error {
  constructor(code: AssociationCode) {
    super(code);
    associationFaults.set(this, code);
  }
}
export function createDiscoverySessionService(options: DiscoverySessionOptions) {
  const custody = options.custody,
    owned = options.assertOwnedSync.bind(options),
    clock = options.clock.bind(options),
    next = options.newId.bind(options),
    audit = options.audit.bind(options),
    policy = options.policy.bind(options),
    readRevision = options.readDurableRevision.bind(options),
    buildServer = options.createServer.bind(options),
    buildIngestion = options.createIngestion.bind(options);
  const acquire = custody.acquireRead.bind(custody),
    assertRead = custody.assertRead.bind(custody),
    release = custody.releaseRead.bind(custody),
    assertReadInternal = custody.assertReadInternal.bind(custody);
  const ids = new Set<string>(),
    work = new Set<Promise<unknown>>();
  let generation = 0,
    revoked = false,
    attempted = false,
    busy = false,
    uncertain = false,
    server: Server | null = null,
    ingestion: Ingestion | null = null,
    provider: ReturnType<typeof inspectOwnedDiscoveryProvider> = null,
    projection: RegistrySnapshot | null = null;
  let cleanup: Promise<'RETIRED' | 'UNRETIRED'> | null = null,
    cleanupSettled = false,
    cleanupResource = false,
    cleanupAuditPending = false;
  type VideoReservation = Readonly<{
    videoId: string;
    deviceId: string;
    generation: number;
    admittedUtc: number;
    deadlineUtc: number;
    current(): boolean;
    begin(sink: VideoMediaSink): VideoSession;
    stop(): Promise<boolean>;
  }>;
  let videoReservation: VideoReservation | null = null;
  function reserveVideo(deviceId: string, expectedRegistryRevision: number): VideoReservation {
    if (
      !uuid(deviceId) ||
      !Number.isSafeInteger(expectedRegistryRevision) ||
      expectedRegistryRevision < 0 ||
      Object.is(expectedRegistryRevision, -0) ||
      busy ||
      metadataOwner?.pending ||
      videoReservation ||
      !ingestion ||
      !currentProjection() ||
      projection?.revision !== expectedRegistryRevision
    )
      throw Error('VIDEO_UNAVAILABLE');
    const captured = projection,
      capturedIngestion = ingestion,
      ownerGeneration = generation;
    const rows = captured.devices.filter((row) => row.deviceId === deviceId);
    if (rows.length !== 1 || rows[0]?.verification !== 'VERIFIED' || rows[0].state !== 'DEVICE')
      throw Error('VIDEO_UNAVAILABLE');
    const deviceGeneration = rows[0].generation;
    busy = true; // Reserve shared ordinary lane before clock, allocator or target callbacks.
    let cancelled = false,
      entered = false,
      constructing = false;
    let consumer: VideoSession | null = null;
    let stopWork: Promise<boolean> | null = null;
    let constructionDone: () => void = () => {};
    const construction = new Promise<void>((resolve) => {
      constructionDone = resolve;
    });
    let reservation: VideoReservation;
    const current = () =>
      !cancelled &&
      videoReservation === reservation &&
      generation === ownerGeneration &&
      currentProjection(captured) &&
      ingestion === capturedIngestion;
    function stop(): Promise<boolean> {
      if (stopWork) return stopWork;
      cancelled = true;
      let complete: (value: boolean) => void = () => {};
      stopWork = new Promise<boolean>((resolve) => {
        complete = resolve;
      });
      work.add(stopWork);
      const retained = stopWork;
      let lower: Promise<unknown> | null = null;
      try {
        lower = consumer?.stop() ?? null;
      } catch {
        uncertain = true;
      }
      void Promise.resolve().then(async () => {
        try {
          if (constructing) await construction;
          if (!lower && consumer) lower = consumer.stop();
          if (lower) await lower;
          const ok = !consumer || consumer.retired;
          if (!ok) uncertain = true;
          complete(ok);
        } catch {
          uncertain = true;
          complete(false);
        } finally {
          work.delete(retained);
          if (!entered) busy = false;
        }
      });
      return retained;
    }
    try {
      const admittedUtc = clock(),
        deadlineUtc = admittedUtc + 30000,
        videoId = allocate();
      if (
        !Number.isSafeInteger(admittedUtc) ||
        admittedUtc < 0 ||
        !Number.isSafeInteger(deadlineUtc) ||
        generation !== ownerGeneration ||
        !currentProjection(captured) ||
        ingestion !== capturedIngestion
      )
        throw Error('VIDEO_UNAVAILABLE');
      reservation = Object.freeze({
        videoId,
        deviceId,
        generation: deviceGeneration,
        admittedUtc,
        deadlineUtc,
        current,
        begin(sink: VideoMediaSink) {
          if (entered || !current()) throw Error('VIDEO_UNAVAILABLE');
          entered = true;
          constructing = true;
          try {
            const now = clock();
            if (!current() || !Number.isSafeInteger(now) || now < admittedUtc || now >= deadlineUtc)
              throw Error('VIDEO_UNAVAILABLE');
            const target = capturedIngestion.videoTarget(deviceId);
            if (!target || !current()) throw Error('VIDEO_UNAVAILABLE');
            consumer = createOwnedVideoMediaConsumer(
              target,
              { admittedUtc, deadlineUtc, videoId },
              sink,
            );
            const started = consumer.started.finally(() => {
              busy = false;
            });
            work.add(started);
            void started
              .then(
                () => {},
                () => {
                  uncertain = true;
                },
              )
              .finally(() => work.delete(started));
            if (!current()) void consumer.stop();
            return consumer;
          } catch (error) {
            busy = false;
            void stop();
            throw error;
          } finally {
            constructing = false;
            constructionDone();
          }
        },
        stop,
      });
      videoReservation = reservation;
      return reservation;
    } catch (error) {
      busy = false;
      cancelled = true;
      constructionDone();
      throw error;
    }
  }
  let lastReceipt: DiscoveryReceipt | null = null;
  let state: DiscoverySnapshot = Object.freeze({
    revision: 0,
    installationRevision: null,
    state: 'UNAVAILABLE',
    operationId: null,
    operation: null,
    lastOutcome: 'NONE',
    code: 'NOT_PROVISIONED',
    registryRevision: null,
    observedAtUtc: null,
    restartRequired: false,
  });
  type MetadataOwner = ReturnType<typeof createOwnedDeviceTransportOwner>;
  type MetadataProof = NonNullable<ReturnType<typeof inspectOwnedMetadataTarget>>;
  const metadataBudget = createDeviceQueueBudget();
  const fleet = options.fleet,
    logger = options.logger;
  const captureInputIntent = fleet?.captureActiveInputIntent.bind(fleet);
  const inputWriter = inspectOwnedInputAuditWriter(logger);
  const metadataAudit = options.metadataAudit?.bind(options);
  const metadataRequests = new Set<string>();
  let metadataOwner: MetadataOwner | null = null,
    metadataProof: MetadataProof | null = null,
    metadataOwnerProjection: RegistrySnapshot | null = null,
    consumedProjection: RegistrySnapshot | null = null;
  const consumed = new Set<string>();
  let metadataState: MetadataSnapshot = Object.freeze({
    revision: 0,
    state: 'EMPTY',
    deviceId: null,
    registryRevision: null,
    operationId: null,
    field: null,
    lastOutcome: 'NONE',
    code: null,
    source: 'ADB_DISCOVERY',
    evidence: 'NATIVE_METADATA_QUERY',
    observations: Object.freeze(
      Object.fromEntries(METADATA_FIELDS.map((f) => [f, null])),
    ) as MetadataSnapshot['observations'],
  });
  type AssociationLower = ReturnType<Ingestion['associationSnapshot']>;
  type AssociationCandidate = ReturnType<Ingestion['associationCandidates']>[number];
  type AssociationOperation = {
    request: Exclude<
      AssociationRequest,
      { method: 'association.get' | 'association.candidates' | 'association.cancel' }
    >;
    id: string;
    base: number;
    generation: number;
    current: () => boolean;
    admission: unknown;
    mode: 'CURRENT' | 'HISTORICAL';
    deviceId: string;
    stage: AssociationSnapshot['stage'];
    candidate: AssociationCandidate | null;
    lower: AssociationLower | null;
    cancelled: boolean;
    stopped: boolean;
    settled: boolean;
    deadline: number;
    signal: AbortController;
    timer: ReturnType<typeof setTimeout> | null;
    receipt: AssociationPhaseReceipt | null;
    auditHealth: Health;
    auditPending: boolean;
    candidateState: AssociationSnapshot | null;
  };
  const associationAudit = options.associationAudit?.bind(options);
  const associationRequests = new Set<string>();
  const associationCandidates = new Map<string, AssociationCandidate>();
  const associationCandidateIds = new Map<object, string>();
  let associationProjection: RegistrySnapshot | null = null;
  let associationHandle: Awaited<ReturnType<Ingestion['beginAssociation']>>['handle'] = null;
  let associationOperation: AssociationOperation | null = null;
  let associationWaitingTimer: ReturnType<typeof setTimeout> | null = null;
  let associationState: AssociationSnapshot = Object.freeze({
    revision: 0,
    state: 'IDLE',
    operationId: null,
    code: 'OK',
    ceremonyId: null,
    mode: null,
    deviceId: null,
    stage: null,
    deadlineUtc: null,
    receipt: null,
    projectionCurrent: false,
    candidates: Object.freeze([]),
    historical: Object.freeze([]),
  });
  function associationPut(value: AssociationSnapshot) {
    const captured = snapshotAssociationSnapshot(value);
    if (!captured) throw new AssociationFault('INTERNAL_FAILURE');
    associationState = captured;
  }
  function associationErrorCode(error: unknown): AssociationCode {
    if (error && typeof error === 'object') {
      const code = associationFaults.get(error) ?? faults.get(error);
      if (code && ASSOCIATION_CODES.some((c) => c === code)) return code as AssociationCode;
    }
    return 'INTERNAL_FAILURE';
  }
  function associationClearCandidates() {
    associationCandidates.clear();
    associationCandidateIds.clear();
    associationProjection = null;
  }
  function associationCancel(closed = false) {
    if (associationWaitingTimer !== null) {
      clearTimeout(associationWaitingTimer);
      associationWaitingTimer = null;
    }
    associationClearCandidates();
    const op = associationOperation;
    if (op && !op.cancelled && !op.stopped) {
      op.cancelled = !closed;
      op.stopped = closed;
      if (associationState.operationId === op.id) {
        associationPut({
          ...associationState,
          revision: op.settled ? associationState.revision + 1 : op.base + 2,
          state: closed ? 'CLOSED' : 'CANCELLED',
          code: closed ? 'CLOSED' : 'CANCELLED',
          projectionCurrent: false,
          candidates: [],
          historical: [],
        });
      }
      if (op.lower?.ceremonyId) ingestion?.cancelAssociationById(op.lower.ceremonyId);
      else if (associationState.ceremonyId)
        ingestion?.cancelAssociationById(associationState.ceremonyId);
      op.signal.abort();
    } else if (!op && closed && associationState.state === 'IDLE') {
      associationPut({ ...associationState, state: 'CLOSED', code: 'CLOSED' });
    }
  }
  function associationInternal(op: AssociationOperation) {
    internal(op.generation);
    if (associationOperation !== op || op.cancelled || op.stopped)
      throw new AssociationFault('CANCELLED');
    if (!provider || provider.revoked || !provider.finalCurrent())
      throw new AssociationFault('EPOCH_REVOKED');
  }
  function associationFence(op: AssociationOperation) {
    fence(op.generation, () => {
      if (op.current() !== true) throw new AssociationFault('SESSION_REVOKED');
    });
    const time = clock();
    if (!Number.isSafeInteger(time) || time < 0 || time >= op.deadline)
      throw new AssociationFault('DEADLINE');
    associationInternal(op);
  }
  async function associationLog(record: AssociationAudit): Promise<Health> {
    try {
      return (await associationAudit?.(Object.freeze(record))) === 'AVAILABLE'
        ? 'AVAILABLE'
        : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  async function associationOperationLog(
    op: AssociationOperation,
    record: AssociationAudit,
  ): Promise<Health> {
    const health = await associationLog(record);
    if (health === 'DEGRADED') op.auditHealth = 'DEGRADED';
    return health;
  }
  function associationWire(
    request: AssociationRequest,
    outcome: 'OBSERVED' | 'PENDING' | 'SETTLED' | 'UNCHANGED',
    diagnostic: string | null,
    health: Health,
    value = associationState,
  ) {
    return (
      associationSuccess(
        request.requestId,
        outcome,
        value,
        diagnostic,
        associationOperation?.id === value.operationId &&
          (associationOperation.auditHealth === 'DEGRADED' || associationOperation.auditPending)
          ? 'DEGRADED'
          : health,
      ) ?? associationError(request.requestId, 'LIMIT_EXCEEDED', diagnostic, 'DEGRADED')
    );
  }
  function associationArm(op: AssociationOperation) {
    if (op.timer !== null) clearTimeout(op.timer);
    const now = clock();
    associationInternal(op);
    op.timer = setTimeout(
      () => {
        if (associationOperation !== op || op.settled || op.cancelled || op.stopped) return;
        op.cancelled = true;
        associationClearCandidates();
        const known = op.candidateState;
        associationPut({
          ...(known ?? associationState),
          revision: op.base + 2,
          state: known?.state === 'OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN' : 'FAILED',
          code: known?.state === 'OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN' : 'DEADLINE',
          projectionCurrent: false,
          candidates: [],
          historical: [],
        });
        if (op.lower?.ceremonyId) ingestion?.cancelAssociationById(op.lower.ceremonyId);
        op.signal.abort();
      },
      Math.max(0, op.deadline - now),
    );
  }
  async function associationRead(request: AssociationRequest, current: () => boolean) {
    let diagnostic: string | null = null,
      written = false;
    try {
      if (current() !== true) throw new AssociationFault('SESSION_REVOKED');
      diagnostic = allocate();
      let captured = associationState;
      if (request.method === 'association.candidates') {
        if (busy || revoked || cleanup || !ingestion || !currentProjection())
          throw new AssociationFault('NOT_READY');
        const expected = projection;
        const entries = ingestion.associationCandidates();
        if (!expected || projection !== expected || !currentProjection(expected))
          throw new AssociationFault('STALE_CANDIDATE');
        if (associationProjection !== expected) {
          associationClearCandidates();
          associationProjection = expected;
        }
        const candidates = entries.map((entry) => {
          let id = associationCandidateIds.get(entry.candidate);
          if (!id) {
            id = allocate();
            associationCandidateIds.set(entry.candidate, id);
            associationCandidates.set(id, entry);
          }
          return Object.freeze({
            candidateId: id,
            mode: entry.eligibility,
            deviceId: entry.deviceId,
          });
        });
        const historical = expected.devices
          .filter((d) => d.state === 'DISCONNECTED' && d.currentBindingId === null)
          .map((d) => Object.freeze({ deviceId: d.deviceId, generation: d.generation }));
        if (current() !== true || !currentProjection(expected))
          throw new AssociationFault('STALE_CANDIDATE');
        captured = Object.freeze({
          ...associationState,
          candidates: Object.freeze(candidates),
          historical: Object.freeze(historical),
        });
      } else {
        // GET observes captured state only; no custody/store/owner/clock callbacks.
        captured = Object.freeze({
          ...captured,
          candidates: Object.freeze([]),
          historical: Object.freeze([]),
          projectionCurrent:
            captured.projectionCurrent && !revoked && !cleanup && !!provider?.finalCurrent(),
        });
      }
      if (!associationSuccess(request.requestId, 'OBSERVED', captured, diagnostic, 'AVAILABLE'))
        throw new AssociationFault('LIMIT_EXCEEDED');
      const capturedHealth =
        associationOperation?.id === captured.operationId &&
        (associationOperation.auditPending || associationOperation.auditHealth === 'DEGRADED')
          ? 'DEGRADED'
          : 'AVAILABLE';
      written = true;
      const health = await associationLog({
        operation: request.method === 'association.get' ? 'GET' : 'CANDIDATES',
        stage: 'READ',
        phase: 'RESULT',
        diagnosticId: diagnostic,
        operationId: null,
        ceremonyId: captured.ceremonyId,
        mode: captured.mode,
        expectedRevision: null,
        resultingRevision: captured.revision,
        outcome: 'OBSERVED',
        code: 'OK',
      });
      if (current() !== true) throw new AssociationFault('SESSION_REVOKED');
      return associationWire(
        request,
        'OBSERVED',
        diagnostic,
        capturedHealth === 'DEGRADED' ? 'DEGRADED' : health,
        Object.freeze({
          ...captured,
          projectionCurrent:
            captured.projectionCurrent && !revoked && !cleanup && !!provider?.finalCurrent(),
        }),
      );
    } catch (error) {
      const code = associationErrorCode(error);
      if (diagnostic && !written)
        await associationLog({
          operation: request.method === 'association.get' ? 'GET' : 'CANDIDATES',
          stage: 'READ',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId: null,
          ceremonyId: associationState.ceremonyId,
          mode: associationState.mode,
          expectedRevision: null,
          resultingRevision: associationState.revision,
          outcome: 'FAILED',
          code,
        });
      return associationError(request.requestId, code, diagnostic, 'DEGRADED');
    }
  }
  function associationTerminal(
    op: AssociationOperation,
    receipt: AssociationPhaseReceipt | null,
    code: AssociationCode,
  ): AssociationSnapshot {
    const lower = op.lower;
    const success = receipt?.outcome === 'COMMITTED';
    const terminalState: AssociationSnapshot['state'] =
      receipt?.outcome === 'OUTCOME_UNKNOWN'
        ? 'OUTCOME_UNKNOWN'
        : success
          ? op.stage === 'BASELINE'
            ? 'AWAIT_REMOVAL'
            : op.stage === 'REMOVAL'
              ? 'AWAIT_RETURN'
              : op.stage === 'RETURN'
                ? 'AWAIT_CONFIRMATION'
                : 'COMMITTED'
          : 'FAILED';
    return Object.freeze({
      revision: op.base + 2,
      state: terminalState,
      operationId: op.id,
      code: success ? 'OK' : code,
      ceremonyId: receipt ? receipt.ceremonyId : (lower?.ceremonyId ?? null),
      mode: op.mode,
      deviceId: op.deviceId,
      stage: op.stage,
      deadlineUtc: receipt?.ceremonyId === null ? null : (lower?.deadlineUtc ?? null),
      receipt,
      projectionCurrent: success && receipt.projectionCurrent,
      candidates: Object.freeze([]),
      historical: Object.freeze([]),
    });
  }
  async function associationExecutePhase(op: AssociationOperation) {
    let diagnostic: string | null = null,
      written = false;
    try {
      diagnostic = allocate();
      associationFence(op);
      if (!ingestion) throw new AssociationFault('NOT_READY');
      if (metadataOwner) {
        if (!(await metadataOwner.close()) || !metadataOwner.retired)
          throw new AssociationFault('UNRETIRED');
        metadataOwner = null;
        metadataProof = null;
        metadataOwnerProjection = null;
        associationFence(op);
      }
      const phaseProjection = projection;
      projection = null;
      metadataStale();
      associationClearCandidates();
      let receipt: AssociationPhaseReceipt;
      if (op.request.method === 'association.begin') {
        if (!op.candidate) throw new AssociationFault('STALE_CANDIDATE');
        const revision = registryRevision();
        associationFence(op);
        const previousLower = ingestion.associationSnapshot();
        associationFence(op);
        const pending = track(
          ingestion.beginAssociation({
            mode: op.mode,
            candidate: op.candidate.candidate,
            expectedDurableRevision: revision,
            ...(op.mode === 'HISTORICAL' ? { deviceId: op.deviceId } : {}),
          }),
        );
        // Retain the returned lower obligation before snapshot/clock/arming callbacks.
        try {
          const created = ingestion.associationSnapshot();
          op.lower =
            created.ceremonyId !== null &&
            created.ceremonyId !== previousLower.ceremonyId &&
            created.mode === op.mode &&
            created.deviceId === op.deviceId
              ? created
              : null;
          if (op.lower?.deadlineUtc !== null && op.lower?.deadlineUtc !== undefined)
            op.deadline = op.lower.deadlineUtc;
          if (op.cancelled || op.stopped || cleanup || revoked) {
            if (op.lower?.ceremonyId) ingestion.cancelAssociationById(op.lower.ceremonyId);
          } else associationArm(op);
        } catch (error) {
          // Local bookkeeping failure cannot replace the actual lower settlement.
          op.cancelled = true;
          if (associationOperation === op && !op.stopped && !cleanup && !revoked) {
            try {
              associationPut({
                ...associationState,
                revision: op.base + 2,
                state: 'FAILED',
                code: associationErrorCode(error),
                projectionCurrent: false,
              });
            } catch {
              op.auditHealth = 'DEGRADED';
            }
          }
          try {
            if (op.lower?.ceremonyId) ingestion.cancelAssociationById(op.lower.ceremonyId);
          } catch {
            /* Still await the actual lower result; no rollback assertion. */
          }
          op.signal.abort();
        }
        const value = await pending;
        associationHandle = value.handle;
        receipt = value.receipt;
        op.receipt = snapshotAssociationPhaseReceipt(receipt);
        if ((op.cancelled || op.stopped) && value.handle) {
          try {
            ingestion.cancelAssociation(value.handle);
          } catch {
            /* Receipt remains actual. */
          }
        }
      } else if (op.request.method === 'association.confirm') {
        if (!associationHandle || !phaseProjection || !op.lower?.deadlineUtc)
          throw new AssociationFault('INVALID_SEQUENCE');
        const requestId = allocate();
        const context = Object.freeze({
          handle: associationHandle,
          mode: op.mode,
          deviceId: op.deviceId,
          projection: phaseProjection,
          expectedDurableRevision: registryRevision(),
          requestId,
          deadlineUtc: op.lower.deadlineUtc,
          label: op.deviceId,
        });
        associationFence(op);
        // This continuation is already in the retained work set before entering the genuine native leaf.
        const intent = await confirmAssociationInteraction(op.admission, context, op.signal.signal);
        associationFence(op);
        if (!intent) throw new AssociationFault('CANCELLED');
        receipt = await ingestion.confirmAssociation(associationHandle, intent);
      } else {
        if (!associationHandle) throw new AssociationFault('INVALID_SEQUENCE');
        receipt = await ingestion.observeAssociation(
          associationHandle,
          op.request.method === 'association.removal' ? 'REMOVAL' : 'RETURN',
        );
      }
      op.receipt = snapshotAssociationPhaseReceipt(receipt);
      if (!op.receipt) throw new AssociationFault('INTERNAL_FAILURE');
      if (op.receipt.ceremonyId === null) op.lower = null;
      else {
        const latest = ingestion.associationSnapshot();
        if (
          (!op.lower || op.lower.ceremonyId === op.receipt.ceremonyId) &&
          latest.ceremonyId === op.receipt.ceremonyId &&
          latest.mode === op.mode &&
          latest.deviceId === op.deviceId
        )
          op.lower = latest;
      }
      if (op.receipt.auditHealth === 'DEGRADED') op.auditHealth = 'DEGRADED';
      let live = false;
      if (op.receipt.outcome === 'COMMITTED') {
        try {
          associationFence(op);
          const candidate = ingestion.snapshot();
          associationFence(op);
          if (candidate && op.receipt.projectionCurrent) {
            projection = candidate;
            live = true;
            put({ registryRevision: op.receipt.revision, observedAtUtc: candidate.observedAtUtc });
          }
        } catch {
          /* Confirmed commit remains historical when authority has gone. */
        }
      }
      metadataStale();
      associationClearCandidates();
      op.candidateState = Object.freeze({
        ...associationTerminal(op, op.receipt, op.receipt.code),
        projectionCurrent: live,
      });
      written = true;
      op.auditPending = true;
      await associationOperationLog(op, {
        operation: associationOperationName(op.request),
        stage: 'EXECUTION',
        phase: 'RESULT',
        diagnosticId: diagnostic,
        operationId: op.id,
        ceremonyId: op.receipt.ceremonyId,
        mode: op.mode,
        expectedRevision: op.base,
        resultingRevision: op.cancelled || op.stopped ? op.base + 3 : op.base + 2,
        outcome: op.receipt.outcome,
        code: op.receipt.code,
      });
    } catch (error) {
      const code = associationErrorCode(error);
      if (!op.candidateState) op.candidateState = associationTerminal(op, op.receipt, code);
      if (diagnostic && !written) {
        written = true;
        await associationOperationLog(op, {
          operation: associationOperationName(op.request),
          stage: 'EXECUTION',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId: op.id,
          ceremonyId: op.lower?.ceremonyId ?? null,
          mode: op.mode,
          expectedRevision: op.base,
          resultingRevision: op.cancelled || op.stopped ? op.base + 3 : op.base + 2,
          outcome: op.receipt?.outcome ?? 'NOT_COMMITTED',
          code: op.receipt?.code ?? code,
        });
      }
    } finally {
      try {
        if (op.timer !== null) clearTimeout(op.timer);
        op.signal.abort();
        if (associationOperation === op && op.candidateState) {
          if (op.cancelled || op.stopped || cleanup || revoked)
            associationPut({
              ...op.candidateState,
              revision: op.base + 3,
              state:
                associationState.state === 'CANCELLED'
                  ? 'CANCELLED'
                  : associationState.state === 'FAILED'
                    ? 'FAILED'
                    : 'CLOSED',
              code: associationState.code,
              projectionCurrent: false,
            });
          else {
            let live = false;
            try {
              associationFence(op);
              live = op.candidateState.projectionCurrent;
            } catch {
              /* Stale history only. */
            }
            associationPut({ ...op.candidateState, projectionCurrent: live });
          }
        }
      } finally {
        op.auditPending = false;
        op.settled = true;
        busy = false;
      }
      if (
        associationOperation === op &&
        !op.cancelled &&
        !op.stopped &&
        !cleanup &&
        !revoked &&
        ['AWAIT_REMOVAL', 'AWAIT_RETURN', 'AWAIT_CONFIRMATION'].includes(associationState.state)
      ) {
        const remaining = op.deadline - clock();
        if (associationOperation === op && !op.cancelled && !op.stopped && !cleanup && !revoked) {
          associationWaitingTimer = setTimeout(
            () => {
              associationWaitingTimer = null;
              if (associationOperation !== op || !op.settled || op.cancelled || op.stopped) return;
              op.cancelled = true;
              associationClearCandidates();
              associationPut({
                ...associationState,
                revision: op.base + 3,
                state: 'FAILED',
                code: 'DEADLINE',
                projectionCurrent: false,
              });
              if (op.lower?.ceremonyId) ingestion?.cancelAssociationById(op.lower.ceremonyId);
              op.signal.abort();
            },
            Math.max(0, remaining),
          );
        }
      }
    }
  }
  function associationOperationName(request: AssociationRequest): AssociationAudit['operation'] {
    return request.method
      .slice('association.'.length)
      .toUpperCase() as AssociationAudit['operation'];
  }
  function associationStart(
    request: AssociationOperation['request'],
    current: () => boolean,
    admission: unknown,
  ): Promise<string> {
    const admittedState = associationState,
      admittedOperation = associationOperation;
    const base = admittedState.revision;
    let op: AssociationOperation | null = null;
    let release!: () => void;
    // Reserve actual lifecycle work before owner/clock/allocator callbacks or native construction.
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    track(barrier);
    busy = true;
    try {
      if (request.expectedRevision !== base) throw new AssociationFault('STALE_REVISION');
      if (base > Number.MAX_SAFE_INTEGER - 3) throw new AssociationFault('LIMIT_EXCEEDED');
      fence(generation, () => {
        if (!current()) throw new AssociationFault('SESSION_REVOKED');
      });
      if (!ingestion || !currentProjection()) throw new AssociationFault('NOT_READY');
      let candidate: AssociationCandidate | null = null;
      let mode = associationState.mode,
        deviceId = associationState.deviceId;
      if (request.method === 'association.begin') {
        if (associationOperation && !associationOperation.settled)
          throw new AssociationFault('BUSY');
        if (
          ['AWAIT_REMOVAL', 'AWAIT_RETURN', 'AWAIT_CONFIRMATION'].includes(associationState.state)
        )
          throw new AssociationFault('BUSY');
        candidate = associationCandidates.get(request.candidateId) ?? null;
        if (
          !candidate ||
          associationProjection !== projection ||
          candidate.eligibility !== request.mode
        )
          throw new AssociationFault('STALE_CANDIDATE');
        mode = request.mode;
        deviceId = request.mode === 'HISTORICAL' ? request.deviceId : candidate.deviceId;
        if (!deviceId) throw new AssociationFault('INVALID_REQUEST');
        if (
          mode === 'HISTORICAL' &&
          !projection?.devices.some(
            (d) =>
              d.deviceId === deviceId && d.state === 'DISCONNECTED' && d.currentBindingId === null,
          )
        )
          throw new AssociationFault('INVALID_REQUEST');
      } else {
        const expected =
          request.method === 'association.removal'
            ? 'AWAIT_REMOVAL'
            : request.method === 'association.return'
              ? 'AWAIT_RETURN'
              : 'AWAIT_CONFIRMATION';
        if (
          associationState.state !== expected ||
          associationState.ceremonyId !== request.ceremonyId ||
          !associationHandle
        )
          throw new AssociationFault('INVALID_SEQUENCE');
      }
      if (!mode || !deviceId) throw new AssociationFault('INVALID_REQUEST');
      const id = allocate(),
        started = clock();
      if (!Number.isSafeInteger(started) || started < 0 || started > 8640000000000000 - 120000)
        throw new AssociationFault('INTERNAL_FAILURE');
      const stage =
        request.method === 'association.begin'
          ? 'BASELINE'
          : request.method === 'association.removal'
            ? 'REMOVAL'
            : request.method === 'association.return'
              ? 'RETURN'
              : 'CONFIRMATION';
      op = {
        request,
        id,
        base,
        generation,
        current,
        admission,
        mode,
        deviceId,
        stage,
        candidate,
        lower: request.method === 'association.begin' ? null : ingestion.associationSnapshot(),
        cancelled: false,
        stopped: false,
        settled: false,
        deadline:
          request.method === 'association.begin'
            ? started + 30000
            : (associationState.deadlineUtc ?? started),
        signal: new AbortController(),
        timer: null,
        receipt: null,
        auditHealth: 'AVAILABLE',
        auditPending: true,
        candidateState: null,
      };
      internal(op.generation);
      if (
        associationState !== admittedState ||
        associationState.revision !== base ||
        associationOperation !== admittedOperation
      )
        throw new AssociationFault('STALE_REVISION');
      if (associationWaitingTimer !== null) {
        clearTimeout(associationWaitingTimer);
        associationWaitingTimer = null;
      }
      associationOperation = op;
      associationPut({
        ...associationState,
        revision: base + 1,
        state:
          `${stage === 'CONFIRMATION' ? 'CONFIRM' : stage}_PENDING` as AssociationSnapshot['state'],
        operationId: id,
        mode,
        deviceId,
        stage,
        code: 'OK',
        projectionCurrent: false,
        ...(stage === 'BASELINE' ? { ceremonyId: null, deadlineUtc: null, receipt: null } : {}),
        candidates: [],
        historical: [],
      });
      associationArm(op);
      const captured = associationState;
      const pendingWire = associationSuccess(
        request.requestId,
        'PENDING',
        captured,
        null,
        'DEGRADED',
      );
      if (!pendingWire) throw new AssociationFault('INTERNAL_FAILURE');
      const operation = op;
      const continuation = Promise.resolve().then(async () => {
        let diagnostic: string | null = null,
          written = false,
          launched = false;
        try {
          diagnostic = allocate();
          const fields = {
            operation: associationOperationName(request),
            diagnosticId: diagnostic,
            operationId: operation.id,
            ceremonyId: captured.ceremonyId,
            mode: operation.mode,
            expectedRevision: base,
          };
          const health = await associationOperationLog(operation, {
            ...fields,
            stage: 'REQUEST',
            phase: 'INTENT',
            resultingRevision: null,
            outcome: 'INTENT',
            code: 'OK',
          });
          if (health !== 'AVAILABLE') throw new AssociationFault('AUDIT_UNAVAILABLE');
          associationFence(operation);
          written = true;
          const resultHealth = await associationOperationLog(operation, {
            ...fields,
            stage: 'REQUEST',
            phase: 'RESULT',
            resultingRevision: base + 1,
            outcome: 'PENDING',
            code: 'OK',
          });
          operation.auditPending = false;
          associationFence(operation);
          const wire = associationWire(request, 'PENDING', diagnostic, resultHealth, captured);
          if (!associationSuccess(request.requestId, 'PENDING', captured, diagnostic, resultHealth))
            throw new AssociationFault('INTERNAL_FAILURE');
          launched = true;
          track(Promise.resolve().then(() => associationExecutePhase(operation)));
          return wire;
        } catch (error) {
          const code = associationErrorCode(error);
          operation.auditHealth = 'DEGRADED';
          if (diagnostic && !written) {
            written = true;
            await associationOperationLog(operation, {
              operation: associationOperationName(request),
              stage: 'REQUEST',
              phase: 'RESULT',
              diagnosticId: diagnostic,
              operationId: operation.id,
              ceremonyId: captured.ceremonyId,
              mode: operation.mode,
              expectedRevision: base,
              resultingRevision: operation.cancelled || operation.stopped ? base + 3 : base + 2,
              outcome: 'FAILED',
              code,
            });
          }
          if (operation.timer !== null) clearTimeout(operation.timer);
          operation.signal.abort();
          if (associationOperation === operation) {
            const terminal = associationTerminal(operation, null, code);
            if (operation.cancelled || operation.stopped || cleanup || revoked)
              associationPut({
                ...terminal,
                revision: base + 3,
                state:
                  associationState.state === 'CANCELLED'
                    ? 'CANCELLED'
                    : associationState.state === 'FAILED'
                      ? 'FAILED'
                      : 'CLOSED',
                code: associationState.code,
                projectionCurrent: false,
              });
            else associationPut(terminal);
          }
          operation.settled = true;
          busy = false;
          return associationError(request.requestId, code, diagnostic, 'DEGRADED');
        } finally {
          if (!launched) {
            operation.auditPending = false;
            operation.settled = true;
            busy = false;
          }
          release();
        }
      });
      track(continuation);
      return Promise.resolve(pendingWire);
    } catch (error) {
      try {
        if (op) {
          if (
            associationOperation === op &&
            !op.cancelled &&
            !op.stopped &&
            associationState.operationId === op.id
          )
            associationPut(associationTerminal(op, null, associationErrorCode(error)));
          op.settled = true;
          if (op.timer !== null) clearTimeout(op.timer);
          op.signal.abort();
        }
        return Promise.resolve(
          associationError(request.requestId, associationErrorCode(error), null, 'DEGRADED'),
        );
      } finally {
        if (op) {
          op.auditPending = false;
          op.settled = true;
          if (op.timer !== null) clearTimeout(op.timer);
          op.signal.abort();
        }
        busy = false;
        release();
      }
    }
  }
  function metadataStale(closed = false) {
    const observations = Object.freeze(
      Object.fromEntries(
        METADATA_FIELDS.map((f) => {
          const old = metadataState.observations[f];
          return [f, old ? Object.freeze({ ...old, stale: true }) : null];
        }),
      ),
    ) as MetadataSnapshot['observations'];
    metadataState = Object.freeze({
      ...metadataState,
      observations,
      state:
        closed || metadataState.state === 'CLOSED'
          ? 'CLOSED'
          : metadataState.state === 'OUTCOME_UNKNOWN'
            ? 'OUTCOME_UNKNOWN'
            : 'STALE',
    });
  }
  function metadataInternal(g: number, expected: RegistrySnapshot, proof: MetadataProof) {
    internal(g);
    if (projection !== expected || state.state !== 'READY' || !proof.finalCurrent())
      throw new MetadataFault('STALE_BINDING');
  }
  function metadataFence(
    g: number,
    current: () => void,
    expected: RegistrySnapshot,
    proof: MetadataProof,
    deadline: number,
  ) {
    fence(g, current);
    const now = clock();
    if (!Number.isSafeInteger(now) || now < 0 || now >= deadline)
      throw new MetadataFault('DEADLINE_EXCEEDED');
    metadataInternal(g, expected, proof);
  }
  async function metadataLog(record: MetadataAudit): Promise<Health> {
    try {
      return (await metadataAudit?.(Object.freeze({ ...record }))) === 'AVAILABLE'
        ? 'AVAILABLE'
        : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  function metadataFailure(
    request: MetadataRequest,
    code: MetadataCode,
    diagnostic: string | null = null,
    unknown = false,
  ) {
    return metadataError(
      request.requestId,
      code,
      diagnostic,
      'DEGRADED',
      unknown ? 'OUTCOME_UNKNOWN' : 'NOT_STARTED',
    );
  }
  function metadataReply(
    request: MetadataRequest,
    outcome: 'OBSERVED' | 'PENDING',
    diagnostic: string | null,
    health: Health,
  ) {
    return (
      metadataSuccess(request.requestId, outcome, metadataState, diagnostic, health) ??
      metadataFailure(request, 'INTERNAL_FAILURE', diagnostic, true)
    );
  }
  const inputRequests = new Set<string>();
  let inputState: InputInteractionSnapshot = Object.freeze({
    revision: 0,
    state: 'EMPTY',
    operationId: null,
    deviceId: null,
    generation: null,
    selectionRevision: null,
    registryRevision: null,
    action: null,
    deadlineUtc: null,
    receipt: null,
    code: null,
    current: false,
  });
  let inputWitness: (() => boolean) | null = null;
  let inputActive: { base: number; stopped: boolean; settled: boolean } | null = null;
  function inputPut(value: InputInteractionSnapshot) {
    const captured = snapshotInputInteractionSnapshot(value);
    if (!captured) throw new Error('INPUT_SNAPSHOT');
    inputState = captured;
  }
  function inputClose() {
    if (inputState.state === 'CLOSED') return;
    if (inputActive && !inputActive.settled) inputActive.stopped = true;
    inputPut({
      ...inputState,
      state: 'CLOSED',
      current: false,
      revision:
        inputActive && !inputActive.settled
          ? inputState.revision >= inputActive.base + 2
            ? inputActive.base + 3
            : inputActive.base + 2
          : inputState.operationId
            ? inputState.revision + 1
            : 0,
    });
  }
  function inputStatus(request: InputInteractionRequest, current: () => boolean): string {
    try {
      if (current() !== true)
        return inputInteractionError(request.requestId, 'SESSION_REVOKED', 'DEGRADED');
      const captured = inputState;
      const valid = captured.current && !revoked && !cleanup && !!inputWitness?.();
      return (
        inputInteractionSuccess(
          request.requestId,
          'STATUS',
          Object.freeze({ ...captured, current: valid }),
          captured.receipt?.loggingHealth === 'AVAILABLE' && inputWriter?.current()
            ? 'AVAILABLE'
            : 'DEGRADED',
        ) ?? inputInteractionError(request.requestId, 'INTERNAL_FAILURE', 'DEGRADED')
      );
    } catch {
      return inputInteractionError(request.requestId, 'INTERNAL_FAILURE', 'DEGRADED');
    }
  }
  function inputPress(
    request: Extract<InputInteractionRequest, { method: 'input.press' }>,
    current: () => boolean,
  ): Promise<string> {
    const baseState = inputState,
      g = generation;
    busy = true;
    let retained = false;
    const fail = (code: InputInteractionCode) =>
      inputInteractionError(request.requestId, code, 'DEGRADED');
    try {
      const start = clock(),
        deadline = start + 30000;
      if (
        !Number.isSafeInteger(start) ||
        start < 0 ||
        !Number.isSafeInteger(deadline) ||
        deadline > 8640000000000000
      )
        return Promise.resolve(fail('INTERNAL_FAILURE'));
      internal(g);
      if (inputState !== baseState) return Promise.resolve(fail('STALE_REVISION'));
      const admit = () => {
        if (current() !== true) throw new Fault('SESSION_REVOKED');
      };
      fence(g, admit);
      if (request.expectedRevision !== baseState.revision)
        return Promise.resolve(fail('STALE_REVISION'));
      if (
        baseState.revision > Number.MAX_SAFE_INTEGER - 3 ||
        inputRequests.size >= 65536 ||
        inputRequests.has(request.requestId)
      )
        return Promise.resolve(fail('LIMIT_EXCEEDED'));
      inputRequests.add(request.requestId);
      if (!captureInputIntent || !inputWriter?.current())
        return Promise.resolve(fail('AUDIT_UNAVAILABLE'));
      const captured = captureInputIntent({
        expectedSelectionRevision: request.expectedSelectionRevision,
        expectedRegistryRevision: request.expectedRegistryRevision,
        deviceId: request.deviceId,
      });
      if (!captured.ok) return Promise.resolve(fail(captured.code));
      const intent = captured.intent,
        intentRecord = inspectFleetActiveInputIntent(intent);
      const expected = projection;
      if (
        !intentRecord ||
        !expected ||
        !ingestion ||
        intentRecord.projection !== expected ||
        !currentProjection(expected)
      )
        return Promise.resolve(fail('STALE_REGISTRY'));
      if (consumedProjection !== expected) {
        consumedProjection = expected;
        consumed.clear();
      }
      const same =
        metadataOwnerProjection === expected && metadataProof?.target.deviceId === request.deviceId;
      if (!same && consumed.has(request.deviceId)) return Promise.resolve(fail('REFRESH_REQUIRED'));
      const ticket = ingestion.metadataTarget(request.deviceId),
        inputTicket = ingestion.inputTarget(request.deviceId);
      const proof = inspectOwnedMetadataTarget(ticket),
        inputProof = inspectOwnedInputTarget(inputTicket);
      if (
        !ticket ||
        !inputTicket ||
        !proof ||
        !inputProof ||
        proof.ownerAnchor !== inputProof.ownerAnchor ||
        proof.projection !== expected ||
        inputProof.projection !== expected
      )
        return Promise.resolve(fail('REFRESH_REQUIRED'));
      const operationId = allocate();
      const witness = () =>
        generation === g &&
        !revoked &&
        !cleanup &&
        currentProjection(expected) &&
        intentRecord.finalCurrent() &&
        proof.finalCurrent() &&
        inputProof.finalCurrent();
      const preOwner = () => {
        fence(g, admit);
        const now = clock();
        if (!Number.isSafeInteger(now) || now < start || now >= deadline)
          throw new MetadataFault('DEADLINE_EXCEEDED');
        if (!witness()) throw new MetadataFault('STALE_BINDING');
        return now;
      };
      const admittedAt = preOwner();
      if (inputState !== baseState) return Promise.resolve(fail('STALE_REVISION'));
      const op = { base: baseState.revision, stopped: false, settled: false };
      let preOwnerExpired = false;
      const pending: InputInteractionSnapshot = Object.freeze({
        revision: op.base + 1,
        state: 'PENDING',
        operationId,
        deviceId: request.deviceId,
        generation: proof.target.generation,
        selectionRevision: request.expectedSelectionRevision,
        registryRevision: expected.revision,
        action: request.action,
        deadlineUtc: deadline,
        receipt: null,
        code: null,
        current: false,
      });
      const wire = inputInteractionSuccess(request.requestId, 'PENDING', pending, 'DEGRADED');
      if (!wire) return Promise.resolve(fail('INTERNAL_FAILURE'));
      inputActive = op;
      inputWitness = witness;
      inputPut(pending);
      // Install the actual work obligation before the first continuation callback.
      let entered = false;
      const admissionTimer = setTimeout(
        () => {
          if (entered || op.settled || op.stopped) return;
          preOwnerExpired = true;
          inputPut({
            ...pending,
            revision: op.base + 2,
            state: 'FAILED',
            code: 'DEADLINE_EXCEEDED',
            current: false,
          });
        },
        Math.max(1, deadline - admittedAt),
      );
      const continuation = Promise.resolve().then(async () => {
        try {
          if (preOwnerExpired) throw new MetadataFault('DEADLINE_EXCEEDED');
          preOwner();
          if (!same) {
            const old = metadataOwner;
            if (old && (!(await old.close()) || !old.retired))
              throw new MetadataFault('OUTCOME_UNKNOWN');
            preOwner();
            consumed.add(request.deviceId);
            const made = createOwnedDeviceTransportOwner({
              metadataTarget: ticket,
              inputTarget: inputTicket,
              budget: metadataBudget,
              logger,
            });
            metadataOwner = made;
            metadataProof = proof;
            metadataOwnerProjection = expected;
            preOwner();
          }
          const owner = metadataOwner;
          if (!owner) throw new MetadataFault('INTERNAL_FAILURE');
          preOwner();
          if (preOwnerExpired) throw new MetadataFault('DEADLINE_EXCEEDED');
          entered = true;
          clearTimeout(admissionTimer);
          // The actor owns this same absolute deadline; no competing facade timeout.
          const raw = await owner.input.press(request.action, deadline, intent);
          const receipt = snapshotInputInteractionReceipt(raw);
          if (!receipt) {
            uncertain = true;
            void startCleanup();
            return;
          }
          if (receipt.actor.outcome === 'OUTCOME_UNKNOWN') {
            uncertain = true;
            void startCleanup();
          }
          let fresh = false;
          try {
            fresh = current() === true && witness();
          } catch {}
          const closed = op.stopped || revoked || !!cleanup;
          inputPut({
            ...pending,
            revision: op.base + (closed ? 3 : 2),
            state: closed
              ? 'CLOSED'
              : receipt.actor.outcome === 'OUTCOME_UNKNOWN'
                ? 'OUTCOME_UNKNOWN'
                : 'SETTLED',
            receipt,
            code: receipt.actor.code,
            current: !closed && fresh && receipt.actor.outcome !== 'OUTCOME_UNKNOWN',
          });
        } catch (e) {
          if (entered) {
            uncertain = true;
            void startCleanup();
          }
          const mapped = metadataCode(e);
          const code: InputInteractionCode =
            mapped === 'DEADLINE_EXCEEDED'
              ? 'DEADLINE_EXCEEDED'
              : mapped === 'SESSION_REVOKED'
                ? 'SESSION_REVOKED'
                : mapped === 'OWNER_REVOKED'
                  ? 'OWNER_REVOKED'
                  : mapped === 'STALE_BINDING'
                    ? 'STALE_BINDING'
                    : mapped === 'AUDIT_UNAVAILABLE'
                      ? 'AUDIT_UNAVAILABLE'
                      : 'INTERNAL_FAILURE';
          if (!preOwnerExpired)
            inputPut({
              ...pending,
              revision: op.base + (op.stopped ? 3 : 2),
              state: op.stopped ? 'CLOSED' : 'FAILED',
              code,
              current: false,
            });
        } finally {
          op.settled = true;
          clearTimeout(admissionTimer);
          if (cleanup && metadataOwner)
            try {
              if (!(await metadataOwner.close())) uncertain = true;
            } catch {
              uncertain = true;
            }
          busy = false;
        }
      });
      retained = true;
      track(continuation);
      return Promise.resolve(wire);
    } catch (e) {
      const code = metadataCode(e);
      return Promise.resolve(
        fail(
          code === 'DEADLINE_EXCEEDED'
            ? 'DEADLINE_EXCEEDED'
            : code === 'OWNER_REVOKED'
              ? 'OWNER_REVOKED'
              : code === 'SESSION_REVOKED'
                ? 'SESSION_REVOKED'
                : code === 'LIMIT_EXCEEDED'
                  ? 'LIMIT_EXCEEDED'
                  : 'INTERNAL_FAILURE',
        ),
      );
    } finally {
      if (!retained) busy = false;
    }
  }

  async function metadataGet(request: MetadataRequest, current: () => boolean): Promise<string> {
    let diagnostic: string | null = null,
      written = false;
    try {
      // GET never invokes owned(), clock(), owner.snapshot(), or an ordinary target admission.
      if (current() !== true || revoked) throw new MetadataFault('SESSION_REVOKED');
      diagnostic = allocate();
      if (current() !== true || revoked) throw new MetadataFault('SESSION_REVOKED');
      if (
        metadataProof &&
        ((!metadataProof.localBusy() && !metadataProof.finalCurrent()) ||
          projection !== metadataOwnerProjection)
      )
        metadataStale();
      const captured = metadataState;
      written = true;
      const health = await metadataLog({
        operation: 'GET',
        stage: 'READ',
        phase: 'RESULT',
        diagnosticId: diagnostic,
        operationId: null,
        field: null,
        expectedRevision: null,
        resultingRevision: captured.revision,
        outcome: 'OBSERVED',
        code: 'OK',
      });
      if (current() !== true || revoked) throw new MetadataFault('SESSION_REVOKED');
      if (metadataState !== captured) throw new MetadataFault('STALE_REVISION');
      if (metadataProof && !metadataProof.localBusy() && !metadataProof.finalCurrent())
        metadataStale();
      return metadataReply(request, 'OBSERVED', diagnostic, health);
    } catch (e) {
      const code = metadataCode(e);
      if (diagnostic && !written) {
        written = true;
        await metadataLog({
          operation: 'GET',
          stage: 'READ',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId: null,
          field: null,
          expectedRevision: null,
          resultingRevision: metadataState.revision,
          outcome: 'FAILED',
          code,
        });
      }
      return metadataFailure(request, code, diagnostic);
    }
  }
  async function metadataRun(
    request: Extract<MetadataRequest, { method: 'metadata.read' }>,
    current: () => void,
    g: number,
    expected: RegistrySnapshot,
    proof: MetadataProof,
    ticket: OwnedMetadataTarget,
    inputTicket: OwnedInputTarget,
    deadline: number,
    operationId: string,
    baseRevision: number,
    finish: () => void,
    settled: { candidate: MetadataSnapshot | null },
  ) {
    let diagnostic: string | null = null,
      resultWritten = false;
    let resultCandidate: MetadataSnapshot | null = null;
    let outcome: 'OBSERVED' | 'NOT_DISPATCHED' | 'DISPATCHED_UNCONFIRMED' | 'OUTCOME_UNKNOWN' =
      'NOT_DISPATCHED';
    let code: MetadataCode | 'OK' = 'INTERNAL_FAILURE';
    try {
      diagnostic = allocate();
      metadataFence(g, current, expected, proof, deadline);
      const fields = {
        operation: 'READ' as const,
        stage: 'EXECUTION' as const,
        diagnosticId: diagnostic,
        operationId,
        field: request.field,
        expectedRevision: baseRevision,
      };
      if (
        (await metadataLog({
          ...fields,
          phase: 'INTENT',
          resultingRevision: null,
          outcome: 'INTENT',
          code: 'OK',
        })) !== 'AVAILABLE'
      )
        throw new MetadataFault('AUDIT_UNAVAILABLE');
      metadataFence(g, current, expected, proof, deadline);
      if (metadataOwnerProjection !== expected || metadataProof !== proof) {
        const old = metadataOwner;
        if (old && (!(await old.close()) || !old.retired))
          throw new MetadataFault('OUTCOME_UNKNOWN');
        metadataFence(g, current, expected, proof, deadline);
        consumed.add(request.deviceId); // Reserve before construction; construction may fail after claiming.
        const made = createOwnedDeviceTransportOwner({
          metadataTarget: ticket,
          inputTarget: inputTicket,
          budget: metadataBudget,
          logger,
        });
        metadataOwner = made;
        metadataProof = proof;
        metadataOwnerProjection = expected;
        metadataFence(g, current, expected, proof, deadline);
      }
      const owner = metadataOwner;
      if (!owner) throw new MetadataFault('INTERNAL_FAILURE');
      metadataFence(g, current, expected, proof, deadline);
      const result = await owner.metadata.read(request.field, deadline);
      outcome = result.actor.outcome;
      code = result.actor.code === 'OK' ? 'OK' : metadataActorCode(result.actor.code);
      // Capture the actual logical result before owner snapshot/audit callbacks can reenter.
      // Until normalized observation capture completes this is historical, never fresh.
      settled.candidate = Object.freeze({
        ...metadataState,
        revision: baseRevision + 2,
        state: 'STALE',
        lastOutcome: outcome,
        code,
        observations: Object.freeze(
          Object.fromEntries(
            METADATA_FIELDS.map((f) => {
              const old = metadataState.observations[f];
              return [f, old ? Object.freeze({ ...old, stale: true }) : null];
            }),
          ),
        ) as MetadataSnapshot['observations'],
      });
      if (outcome === 'OUTCOME_UNKNOWN') uncertain = true;
      // Capture only at result settlement, never in GET. Native owner preserves unavailable/stale fields.
      const snapshot = owner.metadata.snapshot();
      const observations = Object.freeze(
        Object.fromEntries(
          METADATA_FIELDS.map((f) => [f, snapshot.observations[f]?.metadata ?? null]),
        ),
      ) as MetadataSnapshot['observations'];
      const candidate: MetadataSnapshot = Object.freeze({
        ...metadataState,
        revision: baseRevision + 2,
        state:
          outcome === 'OBSERVED'
            ? 'READY'
            : outcome === 'OUTCOME_UNKNOWN'
              ? 'OUTCOME_UNKNOWN'
              : 'FAILED',
        lastOutcome: outcome,
        code,
        observations,
      });
      resultCandidate = candidate;
      settled.candidate = candidate;
      if (outcome === 'OUTCOME_UNKNOWN') {
        if (generation === g && !cleanup) {
          metadataState = candidate;
          metadataStale();
        }
        void startCleanup();
      }
      resultWritten = true;
      await metadataLog({
        ...fields,
        phase: 'RESULT',
        resultingRevision: candidate.revision,
        outcome,
        code,
      });
      metadataFence(g, current, expected, proof, deadline);
      if (metadataState.operationId !== operationId) return;
      metadataState = candidate;
    } catch (e) {
      const failure = metadataCode(e);
      if (failure === 'OUTCOME_UNKNOWN') outcome = 'OUTCOME_UNKNOWN';
      // Do not rewrite a known actor outcome merely because publication was lost.
      if (code === 'INTERNAL_FAILURE') code = failure;
      if (diagnostic && !resultWritten) {
        resultWritten = true;
        await metadataLog({
          operation: 'READ',
          stage: 'EXECUTION',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId,
          field: request.field,
          expectedRevision: baseRevision,
          resultingRevision: baseRevision + 2,
          outcome,
          code,
        });
      }
      if (generation === g && !revoked && !cleanup && metadataState.operationId === operationId) {
        metadataState =
          resultCandidate ??
          Object.freeze({
            ...metadataState,
            revision: baseRevision + 2,
            state: outcome === 'OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN' : 'FAILED',
            lastOutcome: outcome,
            code,
          });
        if (
          resultCandidate ||
          failure === 'STALE_BINDING' ||
          failure === 'SESSION_REVOKED' ||
          failure === 'OWNER_REVOKED'
        )
          metadataStale();
      }
      if (outcome === 'OUTCOME_UNKNOWN') {
        uncertain = true;
        void startCleanup();
      }
    } finally {
      if (cleanup && metadataOwner) {
        try {
          if (!(await metadataOwner.close())) uncertain = true;
        } catch {
          uncertain = true;
        }
      }
      busy = false;
      finish();
    }
  }
  function metadataRead(
    request: Extract<MetadataRequest, { method: 'metadata.read' }>,
    current: () => void,
  ): Promise<string> {
    busy = true; // Before any authority, clock, allocator or logger callback.
    const g = generation;
    const settled: { candidate: MetadataSnapshot | null } = { candidate: null };
    let deadline = 0,
      timer: ReturnType<typeof setTimeout> | undefined,
      finished = false,
      pendingBase: number | null = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
    };
    let timeout!: (value: string) => void;
    const timed = new Promise<string>((resolve) => {
      timeout = resolve;
    });
    const admission = (async () => {
      let diagnostic: string | null = null,
        operationId: string | null = null,
        written = false,
        launched = false;
      try {
        fence(g, current);
        const now = clock();
        if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000 - 30000)
          throw new MetadataFault('INTERNAL_FAILURE');
        deadline = now + 30000;
        timer = setTimeout(() => {
          if (finished) return;
          if (!settled.candidate || settled.candidate.lastOutcome === 'OUTCOME_UNKNOWN')
            uncertain = true;
          if (
            generation === g &&
            settled.candidate &&
            metadataState.operationId === settled.candidate.operationId
          )
            metadataState = settled.candidate;
          else if (
            pendingBase !== null &&
            generation === g &&
            metadataState.lastOutcome === 'PENDING'
          )
            metadataState = Object.freeze({
              ...metadataState,
              revision: pendingBase + 2,
              state: 'OUTCOME_UNKNOWN',
              lastOutcome: 'OUTCOME_UNKNOWN',
              code: 'OUTCOME_UNKNOWN',
            });
          metadataStale();
          void startCleanup();
          timeout(metadataFailure(request, 'OUTCOME_UNKNOWN', diagnostic, true));
        }, 30000);
        if (metadataRequests.size >= 128) throw new MetadataFault('LIMIT_EXCEEDED');
        if (metadataRequests.has(request.requestId)) throw new MetadataFault('INVALID_SHAPE');
        metadataRequests.add(request.requestId);
        diagnostic = allocate();
        fence(g, current);
        if (request.expectedRevision !== metadataState.revision)
          throw new MetadataFault('STALE_REVISION');
        if (metadataState.revision > Number.MAX_SAFE_INTEGER - 2)
          throw new MetadataFault('REVISION_EXHAUSTED');
        const expected = projection;
        if (!expected || !ingestion || !currentProjection(expected))
          throw new MetadataFault('NOT_READY');
        if (request.expectedRegistryRevision !== expected.revision)
          throw new MetadataFault('STALE_REVISION');
        const device = expected.devices.find((d) => d.deviceId === request.deviceId);
        if (device?.state !== 'DEVICE' || device.verification !== 'VERIFIED')
          throw new MetadataFault('POLICY_DENIED');
        if (consumedProjection !== expected) {
          consumedProjection = expected;
          consumed.clear();
        }
        const same =
          metadataOwnerProjection === expected &&
          metadataProof?.target.deviceId === request.deviceId;
        if (!same && consumed.has(request.deviceId)) throw new MetadataFault('REFRESH_REQUIRED');
        const ticket = ingestion.metadataTarget(request.deviceId);
        const proof = inspectOwnedMetadataTarget(ticket);
        const inputTicket = ingestion.inputTarget(request.deviceId);
        const inputProof = inspectOwnedInputTarget(inputTicket);
        if (
          !ticket ||
          !proof ||
          !inputTicket ||
          !inputProof ||
          proof.ownerAnchor !== inputProof.ownerAnchor ||
          proof.projection !== inputProof.projection
        )
          throw new MetadataFault('REFRESH_REQUIRED');
        if (!inputWriter?.current()) throw new MetadataFault('AUDIT_UNAVAILABLE');
        metadataFence(g, current, expected, proof, deadline);
        operationId = allocate();
        metadataFence(g, current, expected, proof, deadline);
        const baseRevision = metadataState.revision;
        const fields = {
          operation: 'READ' as const,
          stage: 'REQUEST' as const,
          diagnosticId: diagnostic,
          operationId,
          field: request.field,
          expectedRevision: baseRevision,
        };
        if (
          (await metadataLog({
            ...fields,
            phase: 'INTENT',
            resultingRevision: null,
            outcome: 'INTENT',
            code: 'OK',
          })) !== 'AVAILABLE'
        )
          throw new MetadataFault('AUDIT_UNAVAILABLE');
        metadataFence(g, current, expected, proof, deadline);
        pendingBase = baseRevision;
        metadataState = Object.freeze({
          ...metadataState,
          revision: baseRevision + 1,
          state: 'PENDING',
          deviceId: request.deviceId,
          registryRevision: expected.revision,
          operationId,
          field: request.field,
          lastOutcome: 'PENDING',
          code: null,
          observations: same
            ? metadataState.observations
            : (Object.freeze(
                Object.fromEntries(METADATA_FIELDS.map((f) => [f, null])),
              ) as MetadataSnapshot['observations']),
        });
        written = true;
        const health = await metadataLog({
          ...fields,
          phase: 'RESULT',
          resultingRevision: baseRevision + 1,
          outcome: 'PENDING',
          code: 'OK',
        });
        metadataFence(g, current, expected, proof, deadline);
        // Freeze the admitted acknowledgement before a synchronous continuation can settle it.
        const pendingWire = metadataSuccess(
          request.requestId,
          'PENDING',
          metadataState,
          diagnostic,
          health,
        );
        if (pendingWire === null) throw new MetadataFault('INTERNAL_FAILURE');
        launched = true;
        track(
          metadataRun(
            request,
            current,
            g,
            expected,
            proof,
            ticket,
            inputTicket,
            deadline,
            operationId,
            baseRevision,
            finish,
            settled,
          ),
        );
        return pendingWire;
      } catch (e) {
        const code = metadataCode(e);
        if (diagnostic && !written) {
          written = true;
          await metadataLog({
            operation: 'READ',
            stage: 'REQUEST',
            phase: 'RESULT',
            diagnosticId: diagnostic,
            operationId,
            field: request.field,
            expectedRevision: request.expectedRevision,
            resultingRevision: metadataState.revision,
            outcome: 'FAILED',
            code,
          });
        }
        if (written && pendingBase !== null && operationId && !launched) {
          // Accepted request, but no owner.read handoff: settle the reserved terminal revision.
          const terminal: MetadataSnapshot = Object.freeze({
            ...metadataState,
            revision: pendingBase + 2,
            state: 'FAILED',
            lastOutcome: 'NOT_DISPATCHED',
            code,
          });
          let terminalDiagnostic: string | null = null;
          try {
            terminalDiagnostic = allocate();
          } catch {
            /* Cleanup/publication never waits on ID capacity. */
          }
          if (terminalDiagnostic)
            await metadataLog({
              operation: 'READ',
              stage: 'EXECUTION',
              phase: 'RESULT',
              diagnosticId: terminalDiagnostic,
              operationId,
              field: request.field,
              expectedRevision: pendingBase,
              resultingRevision: pendingBase + 2,
              outcome: 'NOT_DISPATCHED',
              code,
            });
          if (
            generation === g &&
            !cleanup &&
            !revoked &&
            metadataState.operationId === operationId
          ) {
            metadataState = terminal;
            if (['STALE_BINDING', 'OWNER_REVOKED', 'SESSION_REVOKED'].includes(code))
              metadataStale();
          }
        }
        return metadataFailure(request, code, diagnostic, code === 'OUTCOME_UNKNOWN');
      } finally {
        if (!launched) {
          busy = false;
          finish();
        }
      }
    })();
    track(admission);
    return Promise.race([admission, timed]);
  }
  function track<T>(p: Promise<T>): Promise<T> {
    work.add(p);
    void p.then(
      () => work.delete(p),
      () => work.delete(p),
    );
    return p;
  }
  function allocate(): string {
    if (ids.size >= 65536) throw new Fault('LIMIT_EXCEEDED');
    const id = next();
    if (!uuid(id) || ids.has(id)) throw new Fault('INTERNAL_FAILURE');
    ids.add(id);
    return id;
  }
  function internal(g: number) {
    if (revoked || generation !== g || cleanup) throw new Fault('SESSION_REVOKED');
  }
  function fence(g: number, current: () => void) {
    internal(g);
    try {
      owned();
    } catch {
      throw new Fault('OWNER_REVOKED');
    }
    try {
      current();
    } catch {
      throw new Fault('SESSION_REVOKED');
    }
    const time = clock();
    if (!Number.isSafeInteger(time) || time < 0) throw new Fault('INTERNAL_FAILURE');
    try {
      owned();
    } catch {
      throw new Fault('OWNER_REVOKED');
    }
    internal(g);
  }
  function put(update: Partial<DiscoverySnapshot>) {
    state = Object.freeze({ ...state, ...update });
  }
  function registryRevision(): number {
    const r = readRevision();
    if (!Number.isSafeInteger(r) || r < 0) throw new Fault('RECOVERY_REQUIRED');
    return r;
  }
  async function log(record: DiscoveryAudit): Promise<Health> {
    try {
      return (await audit(Object.freeze({ ...record }))) === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  function error(
    request: DiscoveryRequest,
    code: DiscoveryCode,
    id: string | null = null,
    unknown = false,
  ) {
    return discoveryError(
      request.requestId,
      code,
      id,
      'DEGRADED',
      unknown ? 'OUTCOME_UNKNOWN' : 'NOT_STARTED',
    );
  }
  function success(
    request: DiscoveryRequest,
    outcome: 'OBSERVED' | 'PENDING',
    id: string | null,
    health: Health,
  ) {
    return (
      discoverySuccess(request.requestId, outcome, state, id, health) ??
      error(request, 'INTERNAL_FAILURE', id, true)
    );
  }
  function currentProjection(expected?: RegistrySnapshot): boolean {
    return (
      !revoked &&
      !cleanup &&
      !uncertain &&
      state.state === 'READY' &&
      !!provider &&
      !provider.revoked &&
      provider.finalCurrent() &&
      !!projection &&
      (!expected || projection === expected)
    );
  }
  function invalidate() {
    void videoReservation?.stop();
    metadataStale();
    projection = null;
    if (attempted) put({ observedAtUtc: null, restartRequired: true });
  }
  async function preflight(g: number, current: () => void): Promise<number> {
    fence(g, current);
    const denial = policy();
    fence(g, current);
    if (denial) throw new Fault(denial);
    let r: Awaited<ReturnType<typeof acquire>>;
    try {
      r = await acquire();
    } catch {
      uncertain = true;
      throw new Fault('OUTCOME_UNKNOWN');
    }
    let installation: number | null = null;
    if (!r.ok)
      throw new Fault(
        r.code === 'BUSY'
          ? 'BUSY'
          : r.code === 'BINARY_UNAVAILABLE'
            ? 'NOT_PROVISIONED'
            : r.code === 'OWNER_REVOKED'
              ? 'OWNER_REVOKED'
              : 'RECOVERY_REQUIRED',
      );
    let admissionFailure: DiscoveryCode | null = null;
    try {
      fence(g, current);
      assertRead(r.token);
      fence(g, current);
      assertReadInternal(r.token);
      internal(g);
      installation = r.observation.installationRevision;
      if (!Number.isSafeInteger(installation) || installation < 1)
        throw new Fault('RECOVERY_REQUIRED');
    } catch (e) {
      admissionFailure = codeOf(e);
    }
    let released = false;
    try {
      const retired = await release(r.token);
      released = retired.ok && retired.status === 'RETIRED';
    } catch {}
    if (!released) {
      uncertain = true;
      invalidate();
      throw new Fault('OUTCOME_UNKNOWN');
    }
    if (admissionFailure) throw new Fault(admissionFailure);
    if (installation === null) throw new Fault('RECOVERY_REQUIRED');
    fence(g, current);
    return installation;
  }
  function startCleanup(): Promise<'RETIRED' | 'UNRETIRED'> {
    if (cleanup) return cleanup;
    generation++;
    invalidate();
    metadataStale(true);
    cleanupResource = attempted || server !== null || metadataOwner !== null;
    cleanupSettled = false;
    let complete!: (status: 'RETIRED' | 'UNRETIRED') => void;
    const retained = new Promise<'RETIRED' | 'UNRETIRED'>((resolve) => {
      complete = resolve;
    });
    cleanup = retained;
    inputClose();
    associationCancel(true);
    // Latch before calling either external cleanup implementation.
    let metadataClose: Promise<boolean> | undefined;
    try {
      metadataClose = metadataOwner?.close();
    } catch {
      uncertain = true;
    }
    let serverClose: ReturnType<Server['close']> | undefined,
      ingestionClose: ReturnType<Ingestion['close']> | undefined,
      preemption = true;
    try {
      serverClose = server?.close();
    } catch {
      preemption = false;
    }
    try {
      ingestionClose = ingestion?.close();
    } catch {
      preemption = false;
    }
    void Promise.resolve()
      .then(async () => {
        let ok = preemption;
        try {
          if (serverClose) {
            const r = await serverClose;
            ok = ok && r.kind === 'CLEANUP' && r.status === 'RETIRED' && server?.retired === true;
          }
          if (ingestionClose) {
            const r = await ingestionClose;
            ok = ok && r.status === 'RETIRED' && ingestion?.retired === true;
          }
          if (metadataClose) ok = (await metadataClose) && metadataOwner?.retired === true && ok;
          while (work.size) await Promise.allSettled([...work]);
          if (metadataOwner && !metadataOwner.retired)
            ok = (await metadataOwner.close()) && metadataOwner.retired && ok;
          // A synchronous constructor entered before Stop may return after its reentrant callback.
          if (server && !server.retired) {
            const r = await server.close();
            ok = ok && r.kind === 'CLEANUP' && r.status === 'RETIRED' && server.retired;
          }
          if (ingestion && !ingestion.retired) {
            const r = await ingestion.close();
            ok = ok && r.status === 'RETIRED' && ingestion.retired;
          }
        } catch {
          ok = false;
        }
        cleanupSettled = true;
        busy = false;
        complete(ok && !uncertain ? 'RETIRED' : 'UNRETIRED');
      })
      .catch(() => complete('UNRETIRED'));
    return retained;
  }
  async function read(
    request: DiscoveryRequest,
    current: () => void,
    g: number,
    inspect = false,
  ): Promise<string> {
    let diagnostic: string | null = null,
      resultAttempted = false;
    try {
      if (!cleanup) fence(g, current);
      else {
        owned();
        current();
        if (revoked) throw new Fault('SESSION_REVOKED');
      }
      diagnostic = allocate();
      if (uncertain) throw new Fault('OUTCOME_UNKNOWN');
      if (inspect) {
        const installation = await preflight(g, current);
        const capturedRegistryRevision = registryRevision();
        fence(g, current);
        put({
          installationRevision: installation,
          state: 'IDLE',
          operation: null,
          operationId: null,
          lastOutcome: 'NONE',
          code: null,
          registryRevision: capturedRegistryRevision,
          observedAtUtc: null,
          restartRequired: false,
        });
      } else if (server && !cleanup && provider && (!provider.finalCurrent() || provider.revoked)) {
        invalidate();
        void stopInternal();
        throw new Fault('SESSION_REVOKED');
      }
      const captured = state;
      resultAttempted = true;
      const health = await log({
        operation: 'READ',
        stage: 'READ',
        phase: 'RESULT',
        diagnosticId: diagnostic,
        operationId: null,
        expectedRevision: null,
        resultingRevision: captured.revision,
        outcome: 'OBSERVED',
        code: 'OK',
      });
      if (!cleanup) fence(g, current);
      else {
        owned();
        current();
      }
      if (revoked || state !== captured) throw new Fault('SESSION_REVOKED');
      if (server && !cleanup && provider && (!provider.finalCurrent() || provider.revoked)) {
        invalidate();
        void startCleanup();
        throw new Fault('SESSION_REVOKED');
      }
      return (
        discoverySuccess(request.requestId, 'OBSERVED', captured, diagnostic, health) ??
        error(request, 'INTERNAL_FAILURE', diagnostic)
      );
    } catch (e) {
      const code = codeOf(e);
      if (diagnostic && !resultAttempted)
        await log({
          operation: 'READ',
          stage: 'READ',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId: null,
          expectedRevision: null,
          resultingRevision: state.revision,
          outcome: 'FAILED',
          code,
        });
      return error(request, code, diagnostic, code === 'OUTCOME_UNKNOWN');
    }
  }
  function serverAudit(
    operationId: string,
    pendingRevision: number,
  ): (record: ServerAudit) => Promise<Health> {
    const pairs = new Map<string, { correlation: string; diagnostic: string; done: boolean }>();
    return async (record) => {
      try {
        const request = record.request;
        if (
          request.operation !== 'SERVER_START' ||
          !uuid(request.commandId) ||
          !uuid(request.correlationId)
        )
          return 'DEGRADED';
        let pair = pairs.get(request.commandId);
        if (record.phase === 'INTENT') {
          if (pair || pairs.size >= 128) return 'DEGRADED';
          pair = { correlation: request.correlationId, diagnostic: allocate(), done: false };
          pairs.set(request.commandId, pair);
        } else if (!pair || pair.done || pair.correlation !== request.correlationId)
          return 'DEGRADED';
        if (!pair) return 'DEGRADED';
        const fields = {
          operation: 'START' as const,
          stage: 'TRANSPORT' as const,
          diagnosticId: pair.diagnostic,
          operationId,
          expectedRevision: pendingRevision,
          resultingRevision: null,
        };
        if (record.phase === 'INTENT')
          return log({ ...fields, phase: 'INTENT', outcome: 'INTENT', code: 'OK' });
        pair.done = true;
        const result = record.result;
        if (result?.outcome === 'OBSERVED' && result.code === 'OK')
          return log({ ...fields, phase: 'RESULT', outcome: 'OBSERVED', code: 'OK' });
        const unknown =
          result?.outcome === 'OUTCOME_UNKNOWN' ||
          result?.outcome === 'DISPATCHED_UNCONFIRMED' ||
          !result;
        return log({
          ...fields,
          phase: 'RESULT',
          outcome: unknown ? 'OUTCOME_UNKNOWN' : 'FAILED',
          code: unknown
            ? 'OUTCOME_UNKNOWN'
            : result.code === 'DEADLINE'
              ? 'DEADLINE'
              : 'DISCOVERY_FAILED',
        });
      } catch {
        return 'DEGRADED';
      }
    };
  }
  async function finishOperation(
    operation: 'START' | 'REFRESH',
    id: string,
    g: number,
    current: () => void,
    pendingRevision: number,
  ): Promise<void> {
    let diagnostic: string | null = null,
      terminal: DiscoverySnapshot | null = null,
      candidate: RegistrySnapshot | null = null,
      resultWritten = false;
    try {
      diagnostic = allocate();
      fence(g, current);
      const fields = {
        operation,
        stage: 'EXECUTION' as const,
        diagnosticId: diagnostic,
        operationId: id,
        expectedRevision: pendingRevision,
      };
      if (
        (await log({
          ...fields,
          phase: 'INTENT',
          resultingRevision: null,
          outcome: 'INTENT',
          code: 'OK',
        })) !== 'AVAILABLE'
      )
        throw new Fault('AUDIT_UNAVAILABLE');
      fence(g, current);
      if (operation === 'START') {
        const installation = state.installationRevision;
        if (installation === null) throw new Fault('RECOVERY_REQUIRED');
        server = buildServer(
          installation,
          () => fence(g, current),
          serverAudit(id, pendingRevision),
        );
        fence(g, current);
        const receipt = await server.start();
        fence(g, current);
        if (receipt.kind !== 'OPERATION' || receipt.result.outcome !== 'OBSERVED')
          throw new Fault(
            receipt.kind === 'OPERATION' &&
              ['OUTCOME_UNKNOWN', 'DISPATCHED_UNCONFIRMED'].includes(receipt.result.outcome)
              ? 'OUTCOME_UNKNOWN'
              : 'DISCOVERY_FAILED',
          );
        const opaque = server.discoveryProvider();
        provider = inspectOwnedDiscoveryProvider(opaque);
        if (!provider || provider.revoked || !provider.finalCurrent())
          throw new Fault('SESSION_REVOKED');
        ingestion = buildIngestion(opaque, () => fence(g, current));
        fence(g, current);
        if (!provider.finalCurrent()) throw new Fault('SESSION_REVOKED');
        terminal = Object.freeze({
          ...state,
          revision: pendingRevision + 1,
          state: 'READY',
          lastOutcome: 'STARTED',
          code: null,
          registryRevision: registryRevision(),
        });
      } else {
        if (!ingestion || !provider) throw new Fault('SESSION_REVOKED');
        const receipt = await ingestion.refresh(registryRevision());
        lastReceipt = receipt;
        // Known COMMITTED survives loss of authority; it never becomes NOT_COMMITTED.
        if (receipt.outcome === 'COMMITTED') {
          if (generation !== g || cleanup || revoked) return;
          let live = false;
          try {
            fence(g, current);
            candidate = ingestion.snapshot();
            live =
              receipt.projectionCurrent &&
              candidate !== null &&
              !provider.revoked &&
              provider.finalCurrent();
          } catch {
            live = false;
          }
          terminal = Object.freeze({
            ...state,
            revision: pendingRevision + 1,
            state: live ? 'READY' : 'FAILED',
            lastOutcome: 'COMMITTED',
            code: live ? null : 'SESSION_REVOKED',
            registryRevision: receipt.revision,
            observedAtUtc: live && candidate ? candidate.observedAtUtc : null,
            restartRequired: !live,
          });
        } else {
          fence(g, current);
          if (receipt.outcome === 'OUTCOME_UNKNOWN') throw new Fault('OUTCOME_UNKNOWN');
          const code: DiscoveryCode =
            receipt.code === 'STALE_REVISION'
              ? 'STALE_REVISION'
              : receipt.code === 'DEADLINE'
                ? 'DEADLINE'
                : receipt.code === 'OWNER_REVOKED'
                  ? 'OWNER_REVOKED'
                  : receipt.code === 'EPOCH_REVOKED'
                    ? 'SESSION_REVOKED'
                    : receipt.code === 'AUDIT_UNAVAILABLE'
                      ? 'AUDIT_UNAVAILABLE'
                      : receipt.code === 'CLOSED'
                        ? 'CLOSED'
                        : 'DISCOVERY_FAILED';
          const live = !provider.revoked && provider.finalCurrent();
          terminal = Object.freeze({
            ...state,
            revision: pendingRevision + 1,
            state: live ? 'READY' : 'FAILED',
            lastOutcome: 'NOT_COMMITTED',
            code,
            observedAtUtc: null,
            restartRequired: !live,
          });
        }
      }
      if (!terminal) throw new Fault('INTERNAL_FAILURE');
      await log({
        ...fields,
        phase: 'RESULT',
        resultingRevision: terminal.revision,
        outcome: terminal.lastOutcome === 'NONE' ? 'FAILED' : terminal.lastOutcome,
        code: terminal.code ?? 'OK',
      });
      resultWritten = true;
      if (generation !== g || cleanup || revoked) return;
      fence(g, current);
      if (!provider?.finalCurrent()) throw new Fault('SESSION_REVOKED');
      state = terminal;
      projection = candidate;
    } catch (e) {
      if (generation !== g || cleanup || revoked) return;
      const code = codeOf(e);
      invalidate();
      const committed = lastReceipt?.outcome === 'COMMITTED' && operation === 'REFRESH';
      terminal = Object.freeze({
        ...state,
        revision: pendingRevision + 1,
        state: committed ? 'FAILED' : code === 'OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN' : 'FAILED',
        lastOutcome: committed
          ? 'COMMITTED'
          : code === 'OUTCOME_UNKNOWN'
            ? 'UNRETIRED'
            : operation === 'START'
              ? 'FAILED'
              : 'NOT_COMMITTED',
        code: committed
          ? code === 'OWNER_REVOKED'
            ? 'OWNER_REVOKED'
            : code === 'CLOSED'
              ? 'CLOSED'
              : 'SESSION_REVOKED'
          : code,
        observedAtUtc: null,
        restartRequired: true,
      });
      state = terminal;
      // Preempt known loss before a possibly hanging failure audit.
      void startCleanup();
      if (diagnostic && !resultWritten)
        await log({
          operation,
          stage: 'EXECUTION',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId: id,
          expectedRevision: pendingRevision,
          resultingRevision: terminal.revision,
          outcome: terminal.lastOutcome === 'NONE' ? 'FAILED' : terminal.lastOutcome,
          code: terminal.code ?? 'OK',
        });
    }
  }
  async function ordinary(
    request: Extract<DiscoveryRequest, { method: 'discovery.start' | 'discovery.refresh' }>,
    current: () => void,
    g: number,
  ): Promise<string> {
    let diagnostic: string | null = null,
      operationId: string | null = null,
      requestResultWritten = false;
    const operation: 'START' | 'REFRESH' =
      request.method === 'discovery.start' ? 'START' : 'REFRESH';
    try {
      fence(g, current);
      diagnostic = allocate();
      fence(g, current);
      if (request.expectedRevision !== state.revision) throw new Fault('STALE_REVISION');
      if (state.revision > Number.MAX_SAFE_INTEGER - 2) throw new Fault('REVISION_EXHAUSTED');
      if (request.method === 'discovery.start') {
        if (attempted) throw new Fault('RESTART_REQUIRED');
        const installation = await preflight(g, current);
        fence(g, current);
        if (installation !== request.expectedInstallationRevision)
          throw new Fault('STALE_INSTALLATION');
        put({ installationRevision: installation });
      } else if (!ingestion || !provider || state.state !== 'READY' || !provider.finalCurrent())
        throw new Fault('SESSION_REVOKED');
      operationId = allocate();
      fence(g, current);
      const fields = {
        operation,
        stage: 'REQUEST' as const,
        diagnosticId: diagnostic,
        operationId,
        expectedRevision: request.expectedRevision,
      };
      if (
        (await log({
          ...fields,
          phase: 'INTENT',
          resultingRevision: null,
          outcome: 'INTENT',
          code: 'OK',
        })) !== 'AVAILABLE'
      )
        throw new Fault('AUDIT_UNAVAILABLE');
      fence(g, current);
      if (request.expectedRevision !== state.revision) throw new Fault('STALE_REVISION');
      if (operation === 'START') attempted = true;
      else lastReceipt = null;
      put({
        revision: state.revision + 1,
        state: operation === 'START' ? 'STARTING' : 'REFRESHING',
        operation,
        operationId,
        lastOutcome: 'PENDING',
        code: null,
        observedAtUtc: null,
        restartRequired: false,
      });
      const pending = state;
      const health = await log({
        ...fields,
        phase: 'RESULT',
        resultingRevision: pending.revision,
        outcome: 'PENDING',
        code: 'OK',
      });
      requestResultWritten = true;
      fence(g, current);
      const capturedOperationId = operationId;
      const execution = Promise.resolve().then(() =>
        finishOperation(operation, capturedOperationId, g, current, pending.revision),
      );
      track(execution);
      void execution.finally(() => {
        if (generation === g) busy = false;
      });
      return (
        discoverySuccess(request.requestId, 'PENDING', pending, diagnostic, health) ??
        error(request, 'INTERNAL_FAILURE', diagnostic, true)
      );
    } catch (e) {
      const code = codeOf(e);
      if (requestResultWritten && operationId && generation === g && !cleanup && !revoked) {
        const capturedOperationId = operationId,
          capturedRevision = state.revision;
        const execution = Promise.resolve().then(() =>
          finishOperation(operation, capturedOperationId, g, current, capturedRevision),
        );
        track(execution);
      }
      if (diagnostic && !requestResultWritten)
        await log({
          operation,
          stage: 'REQUEST',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId,
          expectedRevision: request.expectedRevision,
          resultingRevision: state.revision,
          outcome: 'FAILED',
          code,
        });
      if (generation === g) busy = false;
      return error(request, code, diagnostic, code === 'OUTCOME_UNKNOWN');
    }
  }
  let stopAck: Promise<{ diagnostic: string | null; health: Health }> | null = null;
  let cleanupReport: Promise<'RETIRED' | 'UNRETIRED'> | null = null;
  function stopInternal(): Promise<{ diagnostic: string | null; health: Health }> {
    if (stopAck) return stopAck;
    let acknowledge!: (value: { diagnostic: string | null; health: Health }) => void;
    stopAck = new Promise((resolve) => {
      acknowledge = resolve;
    });
    let reportComplete!: (status: 'RETIRED' | 'UNRETIRED') => void;
    cleanupReport = new Promise((resolve) => {
      reportComplete = resolve;
    });
    const retiring = startCleanup();
    cleanupAuditPending = true;
    let diagnostic: string | null = null,
      operationId: string | null = null;
    try {
      diagnostic = allocate();
      operationId = allocate();
      if (state.revision > Number.MAX_SAFE_INTEGER - 2) throw new Fault('REVISION_EXHAUSTED');
      put({
        revision: state.revision + 1,
        state: 'STOPPING',
        operation: 'STOP',
        operationId,
        lastOutcome: 'PENDING',
        code: null,
        observedAtUtc: null,
        restartRequired: attempted,
      });
    } catch (e) {
      put({
        state: 'OUTCOME_UNKNOWN',
        operation: null,
        operationId: null,
        lastOutcome: 'UNRETIRED',
        code: codeOf(e),
        observedAtUtc: null,
        restartRequired: attempted,
      });
      diagnostic = null;
      operationId = null;
    }
    const pending = state;
    void Promise.resolve()
      .then(async () => ({
        diagnostic,
        health:
          diagnostic && operationId
            ? await log({
                operation: 'STOP',
                stage: 'REQUEST',
                phase: 'RESULT',
                diagnosticId: diagnostic,
                operationId,
                expectedRevision: null,
                resultingRevision: pending.revision,
                outcome: 'PENDING',
                code: 'OK',
              })
            : ('DEGRADED' as Health),
      }))
      .then(acknowledge, () => acknowledge({ diagnostic: null, health: 'DEGRADED' }));
    const ack = stopAck;
    const completion = retiring.then(async (status) => {
      await ack;
      let terminalDiagnostic: string | null = null;
      try {
        terminalDiagnostic = allocate();
      } catch {}
      if (operationId) {
        const outcome = status === 'RETIRED' ? 'CLEANUP_RETIRED' : 'UNRETIRED';
        if (terminalDiagnostic)
          await log({
            operation: 'STOP',
            stage: 'EXECUTION',
            phase: 'RESULT',
            diagnosticId: terminalDiagnostic,
            operationId,
            expectedRevision: null,
            resultingRevision: pending.revision + 1,
            outcome,
            code: status === 'RETIRED' ? 'OK' : 'OUTCOME_UNKNOWN',
          });
        put({
          revision: pending.revision + 1,
          state: status === 'RETIRED' ? 'STOPPED' : 'OUTCOME_UNKNOWN',
          lastOutcome: outcome,
          code: status === 'RETIRED' ? null : 'OUTCOME_UNKNOWN',
          restartRequired: attempted,
        });
      }
    });
    // Final cleanup includes STOP audit completion but never waits on itself.
    cleanup = completion.then(async () => {
      const result = await retiring;
      cleanupSettled = true;
      cleanupAuditPending = false;
      return result;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    void Promise.race([
      cleanup,
      new Promise<'UNRETIRED'>((resolve) => {
        timer = setTimeout(() => {
          cleanupResource = true;
          invalidate();
          if (operationId)
            put({
              revision: pending.revision + 1,
              state: 'OUTCOME_UNKNOWN',
              lastOutcome: 'UNRETIRED',
              code: 'OUTCOME_UNKNOWN',
              restartRequired: true,
            });
          resolve('UNRETIRED');
        }, 120000);
      }),
    ])
      .finally(() => {
        if (timer !== undefined) clearTimeout(timer);
      })
      .then(reportComplete, () => reportComplete('UNRETIRED'));
    return ack;
  }
  return Object.freeze({
    reserveVideo,
    execute(input: unknown, operationCurrent: () => boolean): Promise<string> {
      const admittedCurrent = () => {
        if (operationCurrent() !== true) throw new Fault('SESSION_REVOKED');
      };
      const request = snapshotDiscoveryRequest(input);
      if (!request || typeof operationCurrent !== 'function')
        return Promise.resolve(discoveryError(null, 'INVALID_SHAPE', null, 'DEGRADED'));
      if (request.method === 'discovery.stop') {
        try {
          owned();
          admittedCurrent();
          if (revoked) throw Error();
        } catch {
          return Promise.resolve(error(request, 'SESSION_REVOKED'));
        }
        return stopInternal().then(({ diagnostic, health }) =>
          diagnostic
            ? success(request, 'PENDING', diagnostic, health)
            : error(request, 'INTERNAL_FAILURE', null, true),
        );
      }
      if (revoked) return Promise.resolve(error(request, 'SESSION_REVOKED'));
      if (request.method === 'discovery.get') {
        if (busy && !['STARTING', 'REFRESHING', 'STOPPING'].includes(state.state))
          return Promise.resolve(error(request, 'BUSY'));
        if (!busy && !server && !attempted && !cleanup) {
          busy = true;
          const p = read(request, admittedCurrent, generation, true).finally(() => {
            busy = false;
          });
          return track(p);
        }
        return track(read(request, admittedCurrent, generation));
      }
      if (uncertain) return Promise.resolve(error(request, 'OUTCOME_UNKNOWN', null, true));
      if (cleanup) {
        if (
          cleanupSettled &&
          !cleanupAuditPending &&
          !cleanupResource &&
          !attempted &&
          state.state === 'STOPPED'
        ) {
          cleanup = null;
          cleanupReport = null;
          stopAck = null;
          cleanupSettled = false;
          generation++;
        } else return Promise.resolve(error(request, attempted ? 'RESTART_REQUIRED' : 'BUSY'));
      }
      if (busy || metadataOwner?.pending) return Promise.resolve(error(request, 'BUSY'));
      if (request.method !== 'discovery.start' && request.method !== 'discovery.refresh')
        return Promise.resolve(error(request, 'INVALID_SHAPE'));
      associationCancel();
      busy = true;
      return track(ordinary(request, admittedCurrent, generation));
    },
    executeAssociation(
      input: unknown,
      current: () => boolean,
      admissionToken: unknown,
    ): Promise<string> {
      const request = snapshotAssociationRequest(input);
      if (!request || typeof current !== 'function')
        return Promise.resolve(associationError(null, 'INVALID_SHAPE', null, 'DEGRADED'));
      if (request.method === 'association.cancel') {
        try {
          if (current() !== true) throw new AssociationFault('SESSION_REVOKED');
          if (request.expectedRevision !== associationState.revision)
            throw new AssociationFault('STALE_REVISION');
          if (request.operationId !== associationOperation?.id)
            throw new AssociationFault('INVALID_REQUEST');
          if (associationState.state === 'CANCELLED' || associationState.state === 'CLOSED')
            return Promise.resolve(associationWire(request, 'UNCHANGED', null, 'DEGRADED'));
          associationCancel();
          const captured = associationState;
          let diagnostic: string;
          try {
            diagnostic = allocate();
          } catch {
            return Promise.resolve(associationWire(request, 'SETTLED', null, 'DEGRADED', captured));
          }
          return track(
            associationLog({
              operation: 'CANCEL',
              stage: 'REQUEST',
              phase: 'RESULT',
              diagnosticId: diagnostic,
              operationId: captured.operationId,
              ceremonyId: captured.ceremonyId,
              mode: captured.mode,
              expectedRevision: request.expectedRevision,
              resultingRevision: captured.revision,
              outcome: 'CANCELLED',
              code: 'CANCELLED',
            }).then((health) => associationWire(request, 'SETTLED', diagnostic, health, captured)),
          );
        } catch (error) {
          return Promise.resolve(
            associationError(request.requestId, associationErrorCode(error), null, 'DEGRADED'),
          );
        }
      }
      if (associationRequests.has(request.requestId) || associationRequests.size >= 65536)
        return Promise.resolve(
          associationError(request.requestId, 'ID_EXHAUSTED', null, 'DEGRADED'),
        );
      associationRequests.add(request.requestId);
      if (request.method === 'association.get' || request.method === 'association.candidates')
        return track(associationRead(request, current));
      if (revoked || cleanup)
        return Promise.resolve(associationError(request.requestId, 'CLOSED', null, 'DEGRADED'));
      if (busy || metadataOwner?.pending)
        return Promise.resolve(associationError(request.requestId, 'BUSY', null, 'DEGRADED'));
      return associationStart(request as AssociationOperation['request'], current, admissionToken);
    },
    executeInput(input: unknown, operationCurrent: () => boolean): Promise<string> {
      const request = snapshotInputInteractionRequest(input);
      if (!request || typeof operationCurrent !== 'function')
        return Promise.resolve(inputInteractionError(null, 'INVALID_SHAPE', 'DEGRADED'));
      if (request.method === 'input.get') {
        if (inputRequests.size >= 65536 || inputRequests.has(request.requestId))
          return Promise.resolve(
            inputInteractionError(request.requestId, 'LIMIT_EXCEEDED', 'DEGRADED'),
          );
        inputRequests.add(request.requestId);
        return Promise.resolve(inputStatus(request, operationCurrent));
      }
      if (revoked || cleanup)
        return Promise.resolve(inputInteractionError(request.requestId, 'CLOSED', 'DEGRADED'));
      if (uncertain)
        return Promise.resolve(
          inputInteractionError(request.requestId, 'OUTCOME_UNKNOWN', 'DEGRADED'),
        );
      if (busy || metadataOwner?.pending)
        return Promise.resolve(inputInteractionError(request.requestId, 'BUSY', 'DEGRADED'));
      return inputPress(request, operationCurrent);
    },
    executeMetadata(input: unknown, operationCurrent: () => boolean): Promise<string> {
      const request = snapshotMetadataRequest(input);
      if (!request || typeof operationCurrent !== 'function')
        return Promise.resolve(metadataError(null, 'INVALID_SHAPE', null, 'DEGRADED'));
      if (request.method === 'metadata.get') return track(metadataGet(request, operationCurrent));
      if (revoked || cleanup) return Promise.resolve(metadataFailure(request, 'CLOSED'));
      if (uncertain)
        return Promise.resolve(metadataFailure(request, 'OUTCOME_UNKNOWN', null, true));
      if (busy || metadataOwner?.pending) return Promise.resolve(metadataFailure(request, 'BUSY'));
      const current = () => {
        if (operationCurrent() !== true) throw new MetadataFault('SESSION_REVOKED');
      };
      return metadataRead(request, current);
    },
    revoke(): void {
      revoked = true;
      void stopInternal();
    },
    close(): Promise<'RETIRED' | 'UNRETIRED'> {
      revoked = true;
      void stopInternal();
      return cleanupReport ?? Promise.resolve('UNRETIRED');
    },
    snapshot(): RegistrySnapshot | null {
      if (!currentProjection()) return null;
      return projection;
    },
    availability(): 'BINARY_UNAVAILABLE' | 'LIVE_DISCOVERY_UNAVAILABLE' | 'OBSERVED' {
      return currentProjection()
        ? 'OBSERVED'
        : state.installationRevision === null && !attempted
          ? 'BINARY_UNAVAILABLE'
          : 'LIVE_DISCOVERY_UNAVAILABLE';
    },
    finalProjection(expected: RegistrySnapshot): boolean {
      return currentProjection(expected);
    },
    get retired(): boolean {
      return (
        cleanupSettled &&
        !cleanupAuditPending &&
        work.size === 0 &&
        !uncertain &&
        (!server || server.retired) &&
        (!metadataOwner || metadataOwner.retired) &&
        (!ingestion || ingestion.retired)
      );
    },
  });
}
export type DiscoverySessionService = ReturnType<typeof createDiscoverySessionService>;
