import { inspectFleetActiveInputIntent, type OwnedFleetActiveIntent } from './fleet-service.ts';
import { inspectAssociationConfirmation } from './association-confirmation.ts';
import {
  associationRowsSha256,
  snapshotAssociationTranscript,
} from './association-receipt-contract.ts';
import {
  validInputAction,
  type InputQueryAction,
  type InputQueryHandle,
} from './input-query-contract.ts';
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
  | 'ID_EXHAUSTED'
  | 'OTHER_ROWS_CHANGED'
  | 'TARGET_NOT_REMOVED'
  | 'RETURN_NOT_UNIQUE'
  | 'ATTESTATION_REQUIRED'
  | 'CANCELLED'
  | 'STALE_CANDIDATE';
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
  'OTHER_ROWS_CHANGED',
  'TARGET_NOT_REMOVED',
  'RETURN_NOT_UNIQUE',
  'ATTESTATION_REQUIRED',
  'CANCELLED',
  'STALE_CANDIDATE',
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
  ownerAnchor: object;
  projection: RegistrySnapshot;
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
export type OwnedInputTarget = Readonly<{ ownedInputTarget: true }>;
export type InputTargetRecord = Readonly<
  Omit<MetadataTargetRecord, 'begin'> & {
    begin(
      action: InputQueryAction,
      deadlineUtc: number,
      activeIntent: OwnedFleetActiveIntent,
    ): InputQueryHandle;
  }
>;
const inputTargets = new WeakMap<object, InputTargetRecord>();
export function inspectOwnedInputTarget(value: unknown): InputTargetRecord | null {
  return value !== null && typeof value === 'object' ? (inputTargets.get(value) ?? null) : null;
}
const metadataTargets = new WeakMap<object, MetadataTargetRecord>();
export function inspectOwnedMetadataTarget(value: unknown): MetadataTargetRecord | null {
  return value !== null && typeof value === 'object' ? (metadataTargets.get(value) ?? null) : null;
}
export type OwnedAssociationCandidate = Readonly<{ associationCandidate: true }>;
export type OwnedAssociationHandle = Readonly<{ associationHandle: true }>;
export type OwnedAssociationConfirmation = Readonly<{ associationConfirmation: true }>;
type AssociationMode = 'CURRENT' | 'HISTORICAL';
type AssociationStage = 'BASELINE' | 'REMOVAL' | 'RETURN' | 'CONFIRMATION';
type AssociationCode =
  | 'OK'
  | 'INVALID_REQUEST'
  | 'BUSY'
  | 'CLOSED'
  | 'NOT_READY'
  | 'STALE_REVISION'
  | 'STALE_CANDIDATE'
  | 'POLICY_DENIED'
  | 'INVALID_SEQUENCE'
  | 'OTHER_ROWS_CHANGED'
  | 'TARGET_NOT_REMOVED'
  | 'RETURN_NOT_UNIQUE'
  | 'ATTESTATION_REQUIRED'
  | 'DEADLINE'
  | 'OWNER_REVOKED'
  | 'EPOCH_REVOKED'
  | 'INVALID_DISCOVERY'
  | 'DISCOVERY_LIMIT'
  | 'ID_EXHAUSTED'
  | 'LIMIT_EXCEEDED'
  | 'AUDIT_UNAVAILABLE'
  | 'STORAGE_FAILED'
  | 'RECOVERY_REQUIRED'
  | 'CANCELLED'
  | 'UNRETIRED'
  | 'OUTCOME_UNKNOWN';
type AssociationState =
  | 'IDLE'
  | 'BASELINE_PENDING'
  | 'AWAIT_REMOVAL'
  | 'REMOVAL_PENDING'
  | 'AWAIT_RETURN'
  | 'RETURN_PENDING'
  | 'AWAIT_CONFIRMATION'
  | 'CONFIRM_PENDING'
  | 'COMMITTED'
  | 'CANCELLED'
  | 'FAILED'
  | 'OUTCOME_UNKNOWN'
  | 'CLOSED';
export type AssociationPhaseReceipt = Readonly<{
  version: 1;
  outcome: 'COMMITTED' | 'NOT_COMMITTED' | 'OUTCOME_UNKNOWN';
  code: AssociationCode;
  stage: AssociationStage;
  ceremonyId: string | null;
  revision: number | null;
  projectionCurrent: boolean;
  auditHealth: 'AVAILABLE' | 'DEGRADED';
}>;
type StageWitness = Readonly<{
  sequence: number;
  observedUtc: number;
  registryRevision: number;
  durableRevision: number;
  rowsSha256: string;
}>;
type ConfirmationRecord = Readonly<{
  handle: OwnedAssociationHandle;
  mode: AssociationMode;
  deviceId: string;
  projection: RegistrySnapshot;
  expectedDurableRevision: number;
  operatorSession: object;
  requestId: string;
  attestation: Readonly<{ heldHandset: true; cableCycle: true; sameHistoricalHandset: boolean }>;
  finalCurrent(): boolean;
}>;
type AssociationTransaction = {
  handle: OwnedAssociationHandle;
  id: string;
  evidenceId: string;
  mode: AssociationMode;
  deviceId: string;
  priorBindingId: string | null;
  priorGeneration: number;
  installationRevision: number;
  epoch: object;
  admittedUtc: number;
  deadlineUtc: number;
  baselineRow: AdbDiscoveryRow;
  otherRows: readonly AdbDiscoveryRow[];
  returnRow: AdbDiscoveryRow | null;
  expectedProjection: RegistrySnapshot;
  expectedRevision: number;
  stages: Partial<Record<'baseline' | 'removal' | 'return', StageWitness>>;
  state: AssociationState;
  stage: AssociationStage;
  code: AssociationCode;
  valid: boolean;
  pending: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  intent: ConfirmationRecord | null;
};
type AssociationContext = {
  transaction: AssociationTransaction;
  stage: AssociationStage;
  witness: NonNullable<ReturnType<typeof inspectRegistryProjection>>;
  committed: boolean;
};
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
    reconcileAssociation = options.registry.reconcileAssociation.bind(options.registry),
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
  const inputTickets = new Map<string, OwnedInputTarget>();
  const ownerAnchors = new Map<string, object>();

  let ceremony: AssociationTransaction | null = null,
    associationBusy = false;
  const associationWorks = new Set<Promise<unknown>>();
  type CandidateRecord = {
    row: AdbDiscoveryRow;
    projection: RegistrySnapshot;
    rows: readonly AdbDiscoveryRow[];
    mode: AssociationMode;
    deviceId: string | null;
  };
  const candidates = new WeakMap<object, CandidateRecord>();
  const consumedIntents = new WeakSet<object>();
  let candidateProjection: RegistrySnapshot | null = null;
  const candidateMemo = new Map<string, OwnedAssociationCandidate>();
  const phaseKey = (stage: AssociationStage) =>
    stage === 'BASELINE'
      ? 'baseline'
      : stage === 'REMOVAL'
        ? 'removal'
        : stage === 'RETURN'
          ? 'return'
          : 'confirmation';
  const rowEqual = (a: AdbDiscoveryRow, b: AdbDiscoveryRow) =>
    a.serial === b.serial && a.transportId === b.transportId && a.state === b.state;
  function invalidateAssociation(tx: AssociationTransaction, code: AssociationCode, clear = false) {
    tx.valid = false;
    tx.code = code;
    tx.state =
      code === 'CANCELLED'
        ? 'CANCELLED'
        : code === 'OUTCOME_UNKNOWN'
          ? 'OUTCOME_UNKNOWN'
          : 'FAILED';
    if (tx.timer !== null) {
      clearTimeout(tx.timer);
      tx.timer = null;
    }
    if (clear) {
      projection = null;
      nativeRows = null;
      tickets.clear();
      inputTickets.clear();
      ownerAnchors.clear();
    }
  }
  function associationInternal(ctx: AssociationContext) {
    const tx = ctx.transaction;
    if (
      ceremony !== tx ||
      !tx.valid ||
      !tx.pending ||
      closed ||
      !native ||
      native.revoked ||
      native.epoch !== tx.epoch ||
      native.installationRevision !== tx.installationRevision ||
      !native.finalCurrent() ||
      lastClock === null ||
      lastClock >= tx.deadlineUtc ||
      (!ctx.committed && !ctx.witness.finalCurrent()) ||
      (tx.intent && !tx.intent.finalCurrent())
    )
      throw new DurableFault('OWNER_REVOKED');
  }
  function associationReceipt(
    code: AssociationCode,
    stage: AssociationStage,
    tx: AssociationTransaction | null = null,
  ): AssociationPhaseReceipt {
    return Object.freeze({
      version: 1,
      outcome: 'NOT_COMMITTED',
      code,
      stage,
      ceremonyId: tx?.id ?? null,
      revision: null,
      projectionCurrent: false,
      auditHealth: 'DEGRADED',
    });
  }
  function associationCode(raw: unknown): AssociationCode {
    const code = classify(raw);
    if (
      code === 'PROVIDER_FAILED' ||
      code === 'INVALID_CAPTURE' ||
      code === 'STALE_CAPTURE' ||
      code === 'STALE_OBSERVATION'
    )
      return 'INVALID_DISCOVERY';
    if (code === 'REVISION_EXHAUSTED') return 'LIMIT_EXCEEDED';
    return code;
  }
  function allocateAssociationId() {
    if (ids.size >= 65536) throw new Fault('ID_EXHAUSTED');
    const id = newId();
    if (!uuid(id) || ids.has(id)) throw new Fault('ID_EXHAUSTED');
    ids.add(id);
    return id;
  }
  function associationCandidates(): readonly Readonly<{
    candidate: OwnedAssociationCandidate;
    deviceId: string | null;
    eligibility: AssociationMode;
  }>[] {
    if (!native || closed || active || associationBusy || !projection || !nativeRows)
      return Object.freeze([]);
    try {
      admission();
      const current = projection,
        rows = nativeRows;
      if (!current || !rows || !associationRowsSha256(rows) || !native.finalCurrent())
        return Object.freeze([]);
      const witness = inspectRegistryProjection(actualRegistry, current);
      if (!witness?.finalCurrent()) return Object.freeze([]);
      if (candidateProjection !== current) {
        candidateProjection = current;
        candidateMemo.clear();
      }
      const out: Readonly<{
        candidate: OwnedAssociationCandidate;
        deviceId: string | null;
        eligibility: AssociationMode;
      }>[] = [];
      for (const row of rows) {
        if (row.state !== 'DEVICE' || !validMetadataTransportId(row.transportId)) continue;
        const claims = current.claims.filter(
          (c) => c.serial === row.serial || c.transportId === row.transportId,
        );
        if (claims.length !== 1) continue;
        const claim = claims[0];
        if (!claim || claim.serial !== row.serial || claim.transportId !== row.transportId)
          continue;
        const device = current.devices.find((d) => d.deviceId === claim.deviceId);
        const mode: AssociationMode | null =
          claim.state === 'DEVICE' &&
          device?.verification === 'PROVISIONAL' &&
          device.state === 'DEVICE' &&
          device.currentBindingId === claim.bindingId
            ? 'CURRENT'
            : claim.reason === 'IDENTITY_REQUIRED' && claim.deviceId === null
              ? 'HISTORICAL'
              : null;
        if (!mode) continue;
        let candidate = candidateMemo.get(row.serial);
        if (!candidate) {
          if (issuedTickets >= 65536 || candidateMemo.size >= 256) break;
          candidate = Object.freeze({ associationCandidate: true });
          issuedTickets++;
          candidateMemo.set(row.serial, candidate);
          candidates.set(candidate, {
            row,
            projection: current,
            rows,
            mode,
            deviceId: mode === 'CURRENT' ? claim.deviceId : null,
          });
        }
        out.push(
          Object.freeze({
            candidate,
            deviceId: mode === 'CURRENT' ? claim.deviceId : null,
            eligibility: mode,
          }),
        );
      }
      admission();
      if (
        projection !== current ||
        nativeRows !== rows ||
        !witness.finalCurrent() ||
        !native.finalCurrent()
      )
        return Object.freeze([]);
      return Object.freeze(out);
    } catch {
      return Object.freeze([]);
    }
  }
  function validateAssociationRows(ctx: AssociationContext, rows: readonly AdbDiscoveryRow[]) {
    associationInternal(ctx);
    const tx = ctx.transaction;
    if (!associationRowsSha256(rows)) throw new Fault('INVALID_DISCOVERY');
    if (ctx.stage === 'BASELINE') {
      if (associationRowsSha256(rows) !== associationRowsSha256([...tx.otherRows, tx.baselineRow]))
        throw new Fault('OTHER_ROWS_CHANGED');
    } else if (ctx.stage === 'REMOVAL') {
      if (
        rows.some(
          (r) => r.serial === tx.baselineRow.serial || r.transportId === tx.baselineRow.transportId,
        )
      )
        throw new Fault('TARGET_NOT_REMOVED');
      if (associationRowsSha256(rows) !== associationRowsSha256(tx.otherRows))
        throw new Fault('OTHER_ROWS_CHANGED');
    } else if (ctx.stage === 'RETURN') {
      const matches = rows.filter((r) => !tx.otherRows.some((o) => rowEqual(r, o)));
      if (
        matches.length !== 1 ||
        rows.length !== tx.otherRows.length + 1 ||
        !tx.otherRows.every((o) => rows.some((r) => rowEqual(r, o)))
      )
        throw new Fault('RETURN_NOT_UNIQUE');
      const r = matches[0];
      if (
        r?.state !== 'DEVICE' ||
        !validMetadataTransportId(r.transportId) ||
        r.serial !== tx.baselineRow.serial ||
        r.transportId === tx.baselineRow.transportId
      )
        throw new Fault('RETURN_NOT_UNIQUE');
      tx.returnRow = r;
    } else if (
      !tx.returnRow ||
      associationRowsSha256(rows) !== associationRowsSha256([...tx.otherRows, tx.returnRow])
    )
      throw new Fault('OTHER_ROWS_CHANGED');
    associationInternal(ctx);
  }
  function associationTranscript(
    tx: AssociationTransaction,
    seq: number,
    observedUtc: number,
    rows: readonly AdbDiscoveryRow[],
  ) {
    const witness = inspectRegistryProjection(actualRegistry, tx.expectedProjection);
    const transcript = snapshotAssociationTranscript({
      version: 1,
      kind: 'OPERATOR_CABLE_SESSION',
      evidenceId: tx.evidenceId,
      deviceId: tx.deviceId,
      mode: tx.mode,
      hostEpoch: witness?.hostEpoch,
      installationRevision: tx.installationRevision,
      admittedUtc: tx.admittedUtc,
      deadlineUtc: tx.deadlineUtc,
      priorBindingId: tx.priorBindingId,
      priorGeneration: tx.priorGeneration,
      beforeRow: tx.baselineRow,
      returnRow: tx.returnRow,
      attestation: tx.intent?.attestation,
      stages: {
        ...tx.stages,
        confirmation: { sequence: seq, observedUtc, rowsSha256: associationRowsSha256(rows) },
      },
    });
    if (!transcript) throw new Fault('INVALID_REQUEST');
    return transcript;
  }
  function associationBarrier() {
    let finish!: () => void;
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    associationWorks.add(work);
    return () => {
      associationWorks.delete(work);
      finish();
    };
  }
  function runAssociation(
    tx: AssociationTransaction,
    stage: AssociationStage,
  ): Promise<AssociationPhaseReceipt> {
    const release = associationBarrier();
    tx.pending = true;
    associationBusy = true;
    tx.stage = stage;
    tx.state = stage === 'CONFIRMATION' ? 'CONFIRM_PENDING' : `${stage}_PENDING`;
    let work: Promise<AssociationPhaseReceipt>;
    try {
      admission();
      const witness = inspectRegistryProjection(actualRegistry, tx.expectedProjection);
      if (
        !witness ||
        projection !== tx.expectedProjection ||
        witness.durableRevision !== tx.expectedRevision
      )
        throw new Fault('STALE_REVISION');
      const ctx: AssociationContext = { transaction: tx, stage, witness, committed: false };
      associationInternal(ctx);
      work = refreshInternal(tx.expectedRevision, ctx).then((receipt) => {
        if (receipt.outcome === 'COMMITTED') {
          const candidate = projection,
            rows = nativeRows;
          const hash = rows ? associationRowsSha256(rows) : null;
          const current =
            hash !== null &&
            candidate?.observedAtUtc !== null &&
            receipt.projectionCurrent &&
            tx.valid &&
            !closed &&
            !!native?.finalCurrent() &&
            candidate !== null &&
            rows !== null;
          if (current && candidate && rows && hash && candidate.observedAtUtc !== null) {
            if (stage !== 'CONFIRMATION')
              tx.stages[phaseKey(stage) as 'baseline' | 'removal' | 'return'] = Object.freeze({
                sequence: receipt.sequence,
                observedUtc: candidate.observedAtUtc,
                registryRevision: candidate.revision,
                durableRevision: receipt.revision,
                rowsSha256: hash,
              });
            tx.expectedProjection = candidate;
            tx.expectedRevision = receipt.revision;
            tx.state =
              stage === 'BASELINE'
                ? 'AWAIT_REMOVAL'
                : stage === 'REMOVAL'
                  ? 'AWAIT_RETURN'
                  : stage === 'RETURN'
                    ? 'AWAIT_CONFIRMATION'
                    : 'COMMITTED';
            tx.code = 'OK';
            if (stage === 'CONFIRMATION') {
              tx.valid = false;
              if (tx.timer !== null) clearTimeout(tx.timer);
              tx.timer = null;
            }
          } else invalidateAssociation(tx, tx.code === 'OK' ? 'OWNER_REVOKED' : tx.code, true);
          return Object.freeze({
            version: 1,
            outcome: 'COMMITTED',
            code: 'OK',
            stage,
            ceremonyId: tx.id,
            revision: receipt.revision,
            projectionCurrent: current,
            auditHealth: receipt.auditHealth,
          });
        }
        const code: AssociationCode =
          receipt.outcome === 'OUTCOME_UNKNOWN'
            ? 'OUTCOME_UNKNOWN'
            : associationCode(new Fault(receipt.code));
        invalidateAssociation(tx, code, true);
        return Object.freeze({
          version: 1,
          outcome: receipt.outcome,
          code,
          stage,
          ceremonyId: tx.id,
          revision: null,
          projectionCurrent: false,
          auditHealth: 'DEGRADED',
        });
      });
    } catch (error) {
      const code = associationCode(error);
      invalidateAssociation(tx, code, true);
      work = Promise.resolve(associationReceipt(code, stage, tx));
    }
    const final = work.finally(() => {
      tx.pending = false;
      associationBusy = false;
      associationWorks.delete(final);
      release();
    });
    associationWorks.add(final);
    return final;
  }
  function beginAssociation(
    raw: unknown,
  ): Promise<
    Readonly<{ receipt: AssociationPhaseReceipt; handle: OwnedAssociationHandle | null }>
  > {
    const deny = (code: AssociationCode) =>
      Promise.resolve(
        Object.freeze({ receipt: associationReceipt(code, 'BASELINE'), handle: null }),
      );
    if (!native) return deny('POLICY_DENIED');
    if (closed) return deny('CLOSED');
    if (active || associationBusy || associationWorks.size || ceremony?.valid) return deny('BUSY');
    associationBusy = true;
    const release = associationBarrier();
    try {
      const descriptors = record(raw, [
        'mode',
        'candidate',
        'expectedDurableRevision',
        ...(Object.getOwnPropertyDescriptor(raw as object, 'mode')?.value === 'HISTORICAL'
          ? ['deviceId']
          : []),
      ]);
      if (descriptors.mode !== 'CURRENT' && descriptors.mode !== 'HISTORICAL')
        throw new Fault('INVALID_REQUEST');
      const candidate =
        typeof descriptors.candidate === 'object' && descriptors.candidate
          ? candidates.get(descriptors.candidate)
          : undefined;
      if (
        !candidate ||
        candidate.mode !== descriptors.mode ||
        candidate.projection !== projection ||
        candidate.rows !== nativeRows
      )
        throw new Fault('STALE_CANDIDATE');
      if (!integer(descriptors.expectedDurableRevision)) throw new Fault('INVALID_REQUEST');
      admission();
      const witness = inspectRegistryProjection(actualRegistry, candidate.projection);
      if (
        !witness ||
        witness.durableRevision !== descriptors.expectedDurableRevision ||
        readRevision() !== descriptors.expectedDurableRevision
      )
        throw new Fault('STALE_REVISION');
      const deviceId = descriptors.mode === 'CURRENT' ? candidate.deviceId : descriptors.deviceId;
      if (!uuid(deviceId)) throw new Fault('INVALID_REQUEST');
      const device = candidate.projection.devices.find((d) => d.deviceId === deviceId);
      if (
        !device ||
        (descriptors.mode === 'CURRENT'
          ? device.verification !== 'PROVISIONAL' ||
            device.state !== 'DEVICE' ||
            !device.currentBindingId
          : device.state !== 'DISCONNECTED' || device.currentBindingId !== null)
      )
        throw new Fault('INVALID_REQUEST');
      if (
        ids.size > 65534 ||
        candidate.projection.bindings.length >= 4096 ||
        candidate.projection.devices.reduce((n, d) => n + d.evidenceIds.length, 0) >= 4096
      )
        throw new Fault('LIMIT_EXCEEDED');
      const id = allocateAssociationId(),
        evidenceId = allocateAssociationId(),
        started = now();
      admission();
      if (
        started + 120000 > 8640000000000000 ||
        projection !== candidate.projection ||
        nativeRows !== candidate.rows ||
        !witness.finalCurrent() ||
        !native.finalCurrent() ||
        closed
      )
        throw new Fault('STALE_CANDIDATE');
      const tx: AssociationTransaction = {
        handle: Object.freeze({ associationHandle: true }),
        id,
        evidenceId,
        mode: descriptors.mode,
        deviceId,
        priorBindingId: descriptors.mode === 'CURRENT' ? device.currentBindingId : null,
        priorGeneration: device.generation,
        installationRevision: native.installationRevision,
        epoch: native.epoch,
        admittedUtc: started,
        deadlineUtc: started + 120000,
        baselineRow: candidate.row,
        otherRows: Object.freeze(candidate.rows.filter((r) => r !== candidate.row)),
        returnRow: null,
        expectedProjection: candidate.projection,
        expectedRevision: descriptors.expectedDurableRevision,
        stages: {},
        state: 'BASELINE_PENDING',
        stage: 'BASELINE',
        code: 'OK',
        valid: true,
        pending: false,
        timer: null,
        intent: null,
      };
      ceremony = tx;
      tx.timer = setTimeout(() => {
        if (tx.valid) invalidateAssociation(tx, 'DEADLINE', tx.pending);
      }, 120000);
      return runAssociation(tx, 'BASELINE')
        .then((receipt) =>
          Object.freeze({
            receipt,
            handle: receipt.outcome === 'COMMITTED' && receipt.projectionCurrent ? tx.handle : null,
          }),
        )
        .finally(release);
    } catch (error) {
      associationBusy = false;
      release();
      return deny(associationCode(error));
    }
  }
  function observeAssociation(handle: unknown, stage: unknown): Promise<AssociationPhaseReceipt> {
    const tx = ceremony;
    if (!tx || tx.handle !== handle)
      return Promise.resolve(associationReceipt('INVALID_REQUEST', 'BASELINE'));
    if (active || associationBusy || associationWorks.size)
      return Promise.resolve(associationReceipt('BUSY', tx.stage, tx));
    if (
      !tx.valid ||
      !(
        (stage === 'REMOVAL' && tx.state === 'AWAIT_REMOVAL') ||
        (stage === 'RETURN' && tx.state === 'AWAIT_RETURN')
      )
    )
      return Promise.resolve(associationReceipt('INVALID_SEQUENCE', tx.stage, tx));
    return runAssociation(tx, stage);
  }
  function confirmAssociation(handle: unknown, intent: unknown): Promise<AssociationPhaseReceipt> {
    const tx = ceremony;
    if (!tx || tx.handle !== handle)
      return Promise.resolve(associationReceipt('INVALID_REQUEST', 'CONFIRMATION'));
    if (active || associationBusy || associationWorks.size)
      return Promise.resolve(associationReceipt('BUSY', 'CONFIRMATION', tx));
    if (!tx.valid || tx.state !== 'AWAIT_CONFIRMATION')
      return Promise.resolve(associationReceipt('INVALID_SEQUENCE', 'CONFIRMATION', tx));
    associationBusy = true;
    const release = associationBarrier();
    try {
      const supplied = inspectAssociationConfirmation(intent);
      if (!supplied || !intent || typeof intent !== 'object' || consumedIntents.has(intent))
        return Promise.resolve(associationReceipt('ATTESTATION_REQUIRED', 'CONFIRMATION', tx));
      consumedIntents.add(intent as object);
      const v = record(supplied, [
        'handle',
        'mode',
        'deviceId',
        'projection',
        'expectedDurableRevision',
        'operatorSession',
        'requestId',
        'attestation',
        'finalCurrent',
      ]);
      const attest = record(v.attestation, ['heldHandset', 'cableCycle', 'sameHistoricalHandset']);
      if (
        v.handle !== tx.handle ||
        v.mode !== tx.mode ||
        v.deviceId !== tx.deviceId ||
        v.projection !== tx.expectedProjection ||
        v.expectedDurableRevision !== tx.expectedRevision ||
        !v.operatorSession ||
        typeof v.operatorSession !== 'object' ||
        !uuid(v.requestId) ||
        ids.has(v.requestId) ||
        ids.size >= 65536 ||
        attest.heldHandset !== true ||
        attest.cableCycle !== true ||
        attest.sameHistoricalHandset !== (tx.mode === 'HISTORICAL') ||
        typeof v.finalCurrent !== 'function'
      )
        return Promise.resolve(associationReceipt('ATTESTATION_REQUIRED', 'CONFIRMATION', tx));
      ids.add(v.requestId);
      tx.intent = Object.freeze({
        ...v,
        attestation: Object.freeze(attest),
        finalCurrent: v.finalCurrent.bind(supplied),
      }) as ConfirmationRecord;
      if (!tx.intent.finalCurrent())
        return Promise.resolve(associationReceipt('ATTESTATION_REQUIRED', 'CONFIRMATION', tx));
      return runAssociation(tx, 'CONFIRMATION');
    } catch {
      return Promise.resolve(associationReceipt('ATTESTATION_REQUIRED', 'CONFIRMATION', tx));
    } finally {
      if (!tx.pending) associationBusy = false;
      release();
    }
  }
  function cancelAssociation(handle: unknown) {
    const tx = ceremony;
    if (tx && tx.handle === handle && tx.valid) invalidateAssociation(tx, 'CANCELLED');
  }
  function cancelAssociationById(expectedCeremonyId: unknown) {
    const tx = ceremony;
    if (uuid(expectedCeremonyId) && tx?.id === expectedCeremonyId && tx.valid)
      invalidateAssociation(tx, 'CANCELLED');
  }
  function associationSnapshot() {
    const tx = ceremony;
    return Object.freeze({
      version: 1 as const,
      state: closed ? 'CLOSED' : (tx?.state ?? 'IDLE'),
      ceremonyId: tx?.id ?? null,
      mode: tx?.mode ?? null,
      deviceId: tx?.deviceId ?? null,
      stage: tx?.stage ?? null,
      code: tx?.code ?? (closed ? 'CLOSED' : 'OK'),
      deadlineUtc: tx?.deadlineUtc ?? null,
    });
  }
  function refresh(expectedRevision: number) {
    if (associationBusy || associationWorks.size) return Promise.resolve(refusal('BUSY'));
    if (ceremony?.valid) {
      invalidateAssociation(ceremony, 'STALE_CANDIDATE', true);
      return Promise.resolve(refusal('BUSY'));
    }
    return refreshInternal(expectedRevision);
  }
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
  function refreshInternal(
    expectedRevision: number,
    association?: AssociationContext,
  ): Promise<DiscoveryReceipt> {
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
    inputTickets.clear();
    ownerAnchors.clear();
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
          if (association) associationInternal(association);
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
          deadline = association
            ? Math.min(started + 30000, association.transaction.deadlineUtc)
            : started + 30000;
          external();
          timer = setTimeout(
            () => {
              expired = true;
              projection = null;
              if (!entered) deliver(refusal('DEADLINE', requestId, seq));
            },
            Math.max(0, deadline - started),
          );
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
          if (association) validateAssociationRows(association, value.rows);
          const observation = Object.freeze({
            sequence: seq,
            observedAtUtc: value.observedAtUtc,
            source,
            rows: value.rows,
            proofs: Object.freeze([]),
            ...(association?.stage === 'CONFIRMATION'
              ? {
                  proofs: Object.freeze([
                    Object.freeze({
                      serial: association.transaction.returnRow?.serial,
                      transportId: association.transaction.returnRow?.transportId,
                      deviceId: association.transaction.deviceId,
                      evidenceId: association.transaction.evidenceId,
                    }),
                  ]),
                }
              : {}),
          });
          const transcript =
            association?.stage === 'CONFIRMATION'
              ? associationTranscript(association.transaction, seq, value.observedAtUtc, value.rows)
              : null;
          external();
          entered = true;
          const committed = transcript
            ? await reconcileAssociation(
                expectedRevision,
                observation,
                transcript,
                external,
                internal,
              )
            : await reconcile(expectedRevision, observation, external, internal);
          if (association) association.committed = committed.ok;
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
              inputTickets.clear();
              ownerAnchors.clear();
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
  function issueTarget(
    deviceId: string,
    mode: 'METADATA' | 'INPUT',
  ): OwnedMetadataTarget | OwnedInputTarget | null {
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
      if (
        device?.state !== 'DEVICE' ||
        !device.currentBindingId ||
        (mode === 'INPUT' && device.verification !== 'VERIFIED')
      )
        return null;
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
      const prior = mode === 'INPUT' ? inputTickets.get(deviceId) : tickets.get(deviceId);
      if (prior)
        return (mode === 'INPUT'
          ? inputTargets.get(prior)
          : metadataTargets.get(prior)
        )?.finalCurrent()
          ? prior
          : null;
      if (issuedTickets >= 65536 || (mode === 'INPUT' ? inputTickets : tickets).size >= 256)
        return null;
      const ticket =
        mode === 'INPUT'
          ? Object.freeze({ ownedInputTarget: true as const })
          : Object.freeze({ ownedMetadataTarget: true as const });
      const ownerAnchor = ownerAnchors.get(deviceId) ?? Object.freeze({});
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
      const record = Object.freeze({
        ownerAnchor,
        projection: captured,
        target,
        current,
        finalCurrent,
        localBusy,
        begin(
          field: MetadataQueryField | InputQueryAction,
          deadlineUtc: number,
          activeIntent?: OwnedFleetActiveIntent,
        ) {
          if (mode === 'INPUT') {
            const intent = inspectFleetActiveInputIntent(activeIntent);
            if (
              !intent ||
              intent.projection !== captured ||
              intent.binding.deviceId !== target.deviceId ||
              intent.binding.bindingId !== target.bindingId ||
              intent.binding.generation !== target.generation ||
              intent.binding.serial !== target.serial ||
              !intent.finalCurrent()
            )
              throw Error('INVALID_REQUEST');
          }
          if (
            !(mode === 'INPUT' ? validInputAction(field) : validMetadataField(field)) ||
            !validMetadataDeadline(deadlineUtc)
          )
            throw Error('INVALID_REQUEST');
          if (localBusy())
            return mode === 'INPUT'
              ? Object.freeze({
                  handoff: 'LOCAL_REFUSAL' as const,
                  result: Promise.resolve(
                    Object.freeze({
                      version: 1 as const,
                      kind: 'INPUT_QUERY' as const,
                      status: 'FAILED' as const,
                      code: 'BUSY' as const,
                      dispatched: false,
                      operationRetired: true,
                      remoteExitCode: null,
                      stdoutEmpty: null,
                      stderrEmpty: null,
                      observedAtUtc: null,
                    }),
                  ),
                  retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' as const })),
                })
              : Object.freeze({
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
          return mode === 'INPUT'
            ? native.beginInput(
                Object.freeze({
                  requestId,
                  epoch: native.epoch,
                  sequence,
                  transportId: target.transportId,
                  action: field as InputQueryAction,
                  deadlineUtc,
                  activeIntent: activeIntent as OwnedFleetActiveIntent,
                }),
              )
            : native.beginMetadata(
                Object.freeze({
                  requestId,
                  epoch: native.epoch,
                  sequence,
                  transportId: target.transportId,
                  field: field as MetadataQueryField,
                  deadlineUtc,
                }),
              );
        },
      });
      if (!finalCurrent()) return null;
      issuedTickets++;
      ownerAnchors.set(deviceId, ownerAnchor);
      if (mode === 'INPUT') {
        inputTickets.set(deviceId, ticket as OwnedInputTarget);
        inputTargets.set(ticket, record as InputTargetRecord);
      } else {
        tickets.set(deviceId, ticket as OwnedMetadataTarget);
        metadataTargets.set(ticket, record as MetadataTargetRecord);
      }
      return ticket;
    } catch {
      return null;
    }
  }
  return Object.freeze({
    metadataTarget: (deviceId: string) =>
      issueTarget(deviceId, 'METADATA') as OwnedMetadataTarget | null,
    inputTarget: (deviceId: string) => issueTarget(deviceId, 'INPUT') as OwnedInputTarget | null,
    refresh,
    associationCandidates,
    beginAssociation,
    observeAssociation,
    confirmAssociation,
    cancelAssociation,
    cancelAssociationById,
    associationSnapshot,
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
      if (ceremony) {
        ceremony.valid = false;
        ceremony.state = 'CLOSED';
        if (ceremony.timer !== null) clearTimeout(ceremony.timer);
      }
      projection = null;
      closing = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(Object.freeze({ status: 'UNRETIRED' })), 120000);
        void Promise.allSettled([active ?? Promise.resolve(), ...associationWorks]).then(() => {
          clearTimeout(timer);
          resolve(Object.freeze({ status: uncertainRetirement ? 'UNRETIRED' : 'RETIRED' }));
        });
      });
      return closing;
    },
    get retired(): boolean {
      return closed && !active && associationWorks.size === 0 && !uncertainRetirement;
    },
  });
}
