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
  return Object.freeze({
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
    async reconcile(
      expectedDurableRevision: number,
      observation: unknown,
      assertObservationCurrent?: () => void,
      finalInternal?: () => void,
    ): Promise<DurableMutationResult> {
      if (
        (assertObservationCurrent !== undefined &&
          typeof assertObservationCurrent !== 'function') ||
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
            const delta = reconciliation(ctx, candidate);
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
}
export type RegistryStore = ReturnType<typeof createRegistryStore>;
