// Durable ledger composition only; no discovery, identity acquisition or device execution.
import {
  reconstructDisconnectedRegistry,
  reconcileRegistry,
  type RegistrySnapshot,
} from './transport-registry.ts';
import type {
  DurableDelta,
  DurableSnapshot,
  DurableDevice,
  DurableBinding,
  DurableIdentityEvidence,
} from './durable-contract.ts';
import {
  DurableFault,
  type DurableCoordinator,
  type DurableContext,
  type DurableMutationResult,
} from './durable-coordinator.ts';
import {
  snapshotAssociationTranscript,
  createAssociationReceipt,
  associationRowsSha256,
  type AssociationTranscript,
} from './association-receipt-contract.ts';
import { snapshotDiscoveryRow } from './adb-discovery.ts';
const budget = Object.freeze({
  maxDevices: 256,
  maxBindings: 4096,
  maxEvidence: 4096,
  maxClaims: 256,
});
const denial = (): Extract<DurableMutationResult, { outcome: 'NOT_COMMITTED' }> =>
  Object.freeze({
    ok: false,
    outcome: 'NOT_COMMITTED',
    code: 'RECOVERY_REQUIRED',
    operationId: null,
    diagnosticId: null,
    auditHealth: 'DEGRADED',
  });
const epoch = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && !Object.is(x, -0);
function base(ctx: DurableContext, kind: 'STARTUP' | 'RECONCILE' | 'DISPLAY'): DurableDelta {
  return {
    operationId: ctx.operationId,
    kind,
    utc: ctx.utc,
    hostEpoch: ctx.snapshot.meta.host_epoch,
    devices: { insert: [], update: [] },
    bindings: { insert: [], refresh: [], retireIds: [] },
    identityEvidence: { insert: [] },
    associationReceipts: { insert: [] },
    captures: { insert: [], transition: [] },
    holds: { insert: [], releaseIds: [] },
  };
}
function reconciliation(ctx: DurableContext, next: RegistrySnapshot): DurableDelta {
  const old = ctx.snapshot,
    delta = base(ctx, 'RECONCILE'),
    seen = next.observedAtUtc;
  if (seen === null || seen > ctx.utc || next.source === null)
    throw new DurableFault('INVALID_REQUEST');
  const devices = new Map(old.devices.map((d) => [d.device_id, d])),
    bindings = new Map(old.bindings.map((b) => [b.binding_id, b])),
    evidence = new Set(old.identityEvidence.map((e) => e.evidence_id));
  const inserted: DurableDevice[] = [],
    updated: DurableDevice[] = [],
    newBindings: DurableBinding[] = [],
    refresh: { bindingId: string; observedUtc: number }[] = [],
    retireIds: string[] = [],
    newEvidence: DurableIdentityEvidence[] = [];
  for (const d of next.devices) {
    const prior = devices.get(d.deviceId),
      currentBinding = next.bindings.find((b) => b.bindingId === d.currentBindingId);
    const lastSeen = currentBinding ? seen : (prior?.last_seen_utc ?? null);
    const value: DurableDevice = {
      device_id: d.deviceId,
      generation: d.generation,
      display_profile_revision: prior?.display_profile_revision ?? 0,
      created_utc: prior?.created_utc ?? ctx.utc,
      updated_utc: ctx.utc,
      last_seen_utc: lastSeen,
    };
    if (prior) updated.push(value);
    else inserted.push(value);
    for (const evidenceId of d.evidenceIds)
      if (!evidence.has(evidenceId)) {
        newEvidence.push({
          evidence_id: evidenceId,
          device_id: d.deviceId,
          observed_utc: seen,
          source: next.source,
          identity_sha256: null,
        });
        evidence.add(evidenceId);
      }
  }
  for (const b of next.bindings) {
    const prior = bindings.get(b.bindingId);
    if (!prior) {
      newBindings.push({
        binding_id: b.bindingId,
        device_id: b.deviceId,
        generation: b.generation,
        serial: b.serial,
        transport_id: b.transportId,
        source: b.source,
        last_state: b.state,
        observed_utc: b.observedAtUtc,
        retired: b.retired ? 1 : 0,
      });
      continue;
    }
    if (
      prior.device_id !== b.deviceId ||
      prior.generation !== b.generation ||
      prior.serial !== b.serial ||
      prior.transport_id !== b.transportId ||
      prior.source !== b.source ||
      prior.last_state !== b.state ||
      (prior.retired === 1 && !b.retired)
    )
      throw new DurableFault('INVALID_REQUEST');
    if (prior.retired === 0 && b.retired) retireIds.push(b.bindingId);
    else if (!b.retired && b.observedAtUtc !== prior.observed_utc)
      refresh.push({ bindingId: b.bindingId, observedUtc: b.observedAtUtc });
  }
  return {
    ...delta,
    devices: { insert: inserted, update: updated },
    bindings: { insert: newBindings, refresh, retireIds },
    identityEvidence: { insert: newEvidence },
  };
}
// The store binds a supplied, already-admitted transcript to its actual allocator and
// transaction. This is not an operator-confirmation issuer or physical identity proof.
function dataRecord(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(descriptors).length !== keys.length) return null;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const d = descriptors[key];
      if (!d || !('value' in d) || !d.enumerable) return null;
      result[key] = d.value;
    }
    return result;
  } catch {
    return null;
  }
}
function associationObservation(input: unknown, transcript: AssociationTranscript): unknown | null {
  try {
    const value = dataRecord(input, ['sequence', 'observedAtUtc', 'source', 'rows', 'proofs']);
    if (!value || !Array.isArray(value.proofs)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value.proofs) as Record<
      string,
      PropertyDescriptor
    >;
    if (
      Reflect.ownKeys(descriptors).length !== 2 ||
      descriptors.length?.value !== 1 ||
      !descriptors['0'] ||
      !('value' in descriptors['0'])
    )
      return null;
    const proof = dataRecord(descriptors['0'].value, [
      'serial',
      'transportId',
      'deviceId',
      'evidenceId',
    ]);
    if (
      !proof ||
      proof.deviceId !== transcript.deviceId ||
      proof.evidenceId !== transcript.evidenceId ||
      proof.serial !== transcript.returnRow.serial ||
      proof.transportId !== transcript.returnRow.transportId ||
      value.sequence !== transcript.stages.confirmation.sequence ||
      value.observedAtUtc !== transcript.stages.confirmation.observedUtc ||
      value.source !== 'ADB_DISCOVERY'
    )
      return null;
    if (!Array.isArray(value.rows)) return null;
    const length = Object.getOwnPropertyDescriptor(value.rows, 'length');
    if (
      !length ||
      !('value' in length) ||
      !Number.isSafeInteger(length.value) ||
      length.value < 0 ||
      length.value > 256
    )
      return null;
    const rd = Object.getOwnPropertyDescriptors(value.rows);
    if (Reflect.ownKeys(rd).length !== length.value + 1) return null;
    const rows = [];
    for (let i = 0; i < length.value; i++) {
      const d = rd[String(i)];
      if (!d || !('value' in d) || !d.enumerable) return null;
      const row = snapshotDiscoveryRow(d.value);
      if (!row) return null;
      rows.push(row);
    }
    if (associationRowsSha256(rows) !== transcript.stages.confirmation.rowsSha256) return null;
    return Object.freeze({
      ...value,
      rows: Object.freeze(rows),
      proofs: Object.freeze([Object.freeze(proof)]),
    });
  } catch {
    return null;
  }
}
function associationDelta(
  ctx: DurableContext,
  original: RegistrySnapshot,
  candidate: RegistrySnapshot,
  delta: DurableDelta,
  transcript: AssociationTranscript,
): DurableDelta {
  const prior = transcript.stages.return,
    confirmation = transcript.stages.confirmation,
    evidence = delta.identityEvidence.insert,
    device = candidate.devices.find((d) => d.deviceId === transcript.deviceId),
    binding = candidate.bindings.find((b) => b.bindingId === device?.currentBindingId);
  if (
    ctx.snapshot.meta.host_epoch !== transcript.hostEpoch ||
    ctx.snapshot.meta.revision !== prior.durableRevision ||
    original.revision !== prior.registryRevision ||
    original.sequence !== prior.sequence ||
    original.observedAtUtc !== prior.observedUtc ||
    candidate.sequence !== confirmation.sequence ||
    candidate.observedAtUtc !== confirmation.observedUtc ||
    candidate.source !== 'ADB_DISCOVERY' ||
    !candidate.claims.some(
      (c) =>
        c.serial === transcript.returnRow.serial &&
        c.transportId === transcript.returnRow.transportId &&
        c.state === 'DEVICE' &&
        c.reason === 'CURRENT' &&
        c.deviceId === transcript.deviceId &&
        c.bindingId === binding?.bindingId,
    ) ||
    evidence.length !== 1 ||
    evidence[0]?.evidence_id !== transcript.evidenceId ||
    evidence[0]?.device_id !== transcript.deviceId ||
    evidence[0]?.identity_sha256 !== null ||
    device?.verification !== 'VERIFIED' ||
    device.state !== 'DEVICE' ||
    !binding ||
    binding.retired ||
    binding.serial !== transcript.returnRow.serial ||
    binding.transportId !== transcript.returnRow.transportId ||
    binding.state !== 'DEVICE' ||
    binding.source !== 'ADB_DISCOVERY' ||
    !delta.bindings.insert.some((b) => b.binding_id === binding.bindingId) ||
    ctx.snapshot.meta.revision === Number.MAX_SAFE_INTEGER
  )
    throw new DurableFault('INVALID_REQUEST');
  const row = createAssociationReceipt(transcript, {
    finalBindingId: binding.bindingId,
    finalGeneration: binding.generation,
    registryRevision: candidate.revision,
    durableRevision: ctx.snapshot.meta.revision + 1,
  });
  if (!row) throw new DurableFault('INVALID_REQUEST');
  return { ...delta, associationReceipts: { insert: [row] } };
}
export type RegistryProjectionWitness = Readonly<{
  snapshot: RegistrySnapshot;
  hostEpoch: number;
  durableRevision: number;
  finalCurrent(): boolean;
}>;
const projectionInspectors = new WeakMap<
  object,
  (expected: unknown) => RegistryProjectionWitness | null
>();
export function inspectRegistryProjection(
  store: unknown,
  expectedProjection: unknown,
): RegistryProjectionWitness | null {
  if (!store || typeof store !== 'object') return null;
  const inspect = projectionInspectors.get(store);
  return inspect ? inspect(expectedProjection) : null;
}
export function createRegistryStore(
  options: Readonly<{
    coordinator: DurableCoordinator;
    nextId: () => string;
    quarantined: () => boolean;
    assertOwnedSync: () => void;
  }>,
) {
  const coordinator = options.coordinator,
    nextId = options.nextId.bind(options),
    quarantined = options.quarantined.bind(options),
    owned = options.assertOwnedSync.bind(options),
    withLane = coordinator.withLane.bind(coordinator);
  let runtime: RegistrySnapshot | null = null,
    ledger: DurableSnapshot | null = null,
    stopped = false;
  function admit() {
    if (stopped || quarantined() !== false || stopped) throw new DurableFault('OWNER_REVOKED');
    try {
      owned();
    } catch {
      throw new DurableFault('OWNER_REVOKED');
    }
    if (stopped || !coordinator.available) throw new DurableFault('OWNER_REVOKED');
  }
  function current(): RegistrySnapshot | null {
    try {
      admit();
      return coordinator.available ? runtime : null;
    } catch {
      return null;
    }
  }
  async function reconcile(
    expectedDurableRevision: number,
    observation: unknown,
    assertObservationCurrent?: () => void,
    finalInternal?: () => void,
    transcript?: AssociationTranscript,
  ): Promise<DurableMutationResult> {
    if (
      (assertObservationCurrent !== undefined && typeof assertObservationCurrent !== 'function') ||
      (finalInternal !== undefined && typeof finalInternal !== 'function')
    )
      return Object.freeze({ ...denial(), code: 'INVALID_REQUEST' });
    const observationAdmission = assertObservationCurrent,
      observationFence = finalInternal;
    const original = current();
    if (!original) return denial();
    const finalFence =
      observationFence === undefined
        ? undefined
        : () => {
            observationFence();
            if (stopped) throw new DurableFault('OWNER_REVOKED');
            if (runtime !== original) throw new DurableFault('STALE_REVISION');
          };
    // Pure reconciler snapshots all descriptors before any asynchronous lane admission.
    const reconciled = reconcileRegistry(original, observation, { nextId, budget });
    if (!reconciled.ok)
      return Object.freeze({
        ...denial(),
        code:
          reconciled.code === 'LIMIT_EXCEEDED'
            ? 'LIMIT_EXCEEDED'
            : reconciled.code === 'GENERATION_OVERFLOW'
              ? 'REVISION_EXHAUSTED'
              : 'INVALID_REQUEST',
      }) as DurableMutationResult;
    const candidate = reconciled.snapshot;
    return withLane(async (lane) => {
      const result = await lane.step(
        'RECONCILE',
        expectedDurableRevision,
        (ctx) => {
          if (runtime !== original) throw new DurableFault('STALE_REVISION');
          let delta = reconciliation(ctx, candidate);
          if (transcript) delta = associationDelta(ctx, original, candidate, delta, transcript);
          return { delta: () => delta };
        },
        () => {
          admit();
          observationAdmission?.();
          if (runtime !== original) throw new DurableFault('STALE_REVISION');
        },
        finalFence,
      );
      if (result.ok) {
        try {
          lane.assertCurrent(() => {
            admit();
            observationAdmission?.();
          }, finalFence);
          runtime = candidate;
          ledger = result.snapshot;
        } catch {
          stopped = true;
          runtime = null;
          ledger = null;
        }
      }
      return result.result;
    });
  }
  const store = Object.freeze({
    async startup(): Promise<DurableMutationResult> {
      if (runtime || stopped) return denial();
      return withLane(async (lane) => {
        admit();
        const before = lane.read();
        const result = await lane.step(
          'STARTUP',
          before.meta.revision,
          (ctx) => ({
            delta: () => {
              if (ctx.snapshot.meta.host_epoch === Number.MAX_SAFE_INTEGER)
                throw new DurableFault('REVISION_EXHAUSTED');
              const devices = ctx.snapshot.devices.map((d) => {
                if (d.generation === Number.MAX_SAFE_INTEGER)
                  throw new DurableFault('REVISION_EXHAUSTED');
                return { ...d, generation: d.generation + 1, updated_utc: ctx.utc };
              });
              return {
                ...base(ctx, 'STARTUP'),
                hostEpoch: ctx.snapshot.meta.host_epoch + 1,
                devices: { insert: [], update: devices },
                bindings: {
                  insert: [],
                  refresh: [],
                  retireIds: ctx.snapshot.bindings
                    .filter((b) => !b.retired)
                    .map((b) => b.binding_id),
                },
              };
            },
          }),
          admit,
        );
        if (result.ok) {
          try {
            lane.assertCurrent(admit);
            const restored = reconstructDisconnectedRegistry(result.snapshot);
            if (!restored) throw new DurableFault('RECOVERY_REQUIRED');
            ledger = result.snapshot;
            runtime = restored;
          } catch {
            stopped = true;
            runtime = null;
            ledger = null;
          }
        }
        return result.result;
      });
    },
    snapshot: current,
    displayRevision(deviceId: string): number | null {
      if (!current()) return null;
      return (
        ledger?.devices.find((d) => d.device_id === deviceId)?.display_profile_revision ?? null
      );
    },
    reconcile(
      expectedDurableRevision: number,
      observation: unknown,
      admitObservation?: () => void,
      finalInternal?: () => void,
    ): Promise<DurableMutationResult> {
      return reconcile(expectedDurableRevision, observation, admitObservation, finalInternal);
    },
    async reconcileAssociation(
      expectedDurableRevision: number,
      observation: unknown,
      transcriptInput: unknown,
      admitObservation?: () => void,
      finalInternal?: () => void,
    ): Promise<DurableMutationResult> {
      const transcript = snapshotAssociationTranscript(transcriptInput);
      const captured = transcript ? associationObservation(observation, transcript) : null;
      if (!transcript || !captured) return Object.freeze({ ...denial(), code: 'INVALID_REQUEST' });
      return reconcile(
        expectedDurableRevision,
        captured,
        admitObservation,
        finalInternal,
        transcript,
      );
    },
    async display(
      expectedDurableRevision: number,
      deviceId: string,
      expectedGeneration: number,
      expectedDisplayRevision: number,
    ): Promise<DurableMutationResult> {
      if (!current() || !epoch(expectedGeneration) || !epoch(expectedDisplayRevision))
        return denial();
      return withLane(async (lane) => {
        const result = await lane.step(
          'DISPLAY',
          expectedDurableRevision,
          (ctx) => {
            const d = ctx.snapshot.devices.find((x) => x.device_id === deviceId);
            if (
              !d ||
              d.generation !== expectedGeneration ||
              d.display_profile_revision !== expectedDisplayRevision
            )
              throw new DurableFault('STALE_REVISION');
            if (expectedDisplayRevision === Number.MAX_SAFE_INTEGER)
              throw new DurableFault('REVISION_EXHAUSTED');
            return {
              delta: () => ({
                ...base(ctx, 'DISPLAY'),
                devices: {
                  insert: [],
                  update: [
                    {
                      ...d,
                      updated_utc: ctx.utc,
                      display_profile_revision: d.display_profile_revision + 1,
                    },
                  ],
                },
              }),
            };
          },
          admit,
        );
        if (result.ok) {
          try {
            lane.assertCurrent(admit);
            ledger = result.snapshot;
          } catch {
            stopped = true;
            runtime = null;
            ledger = null;
          }
        }
        return result.result;
      });
    },
    close(): void {
      stopped = true;
      runtime = null;
      ledger = null;
    },
  });
  projectionInspectors.set(store, (expected) => {
    try {
      admit();
      const capturedRuntime = runtime,
        capturedLedger = ledger;
      if (
        !capturedRuntime ||
        expected !== capturedRuntime ||
        !capturedLedger ||
        capturedLedger.meta.host_epoch < 1 ||
        !coordinator.available ||
        stopped
      )
        return null;
      return Object.freeze({
        snapshot: capturedRuntime,
        hostEpoch: capturedLedger.meta.host_epoch,
        durableRevision: capturedLedger.meta.revision,
        finalCurrent: () =>
          !stopped &&
          coordinator.available &&
          runtime === capturedRuntime &&
          ledger === capturedLedger,
      });
    } catch {
      return null;
    }
  });
  return store;
}
export type RegistryStore = ReturnType<typeof createRegistryStore>;
