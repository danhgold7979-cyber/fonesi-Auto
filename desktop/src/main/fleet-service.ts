// Main-owned process-local projection/selection; no discovery or device execution.
import { isRegistrySnapshot, type RegistrySnapshot } from './transport-registry.ts';
import { createDeviceSelection, type DeviceSelectionSnapshot } from './device-selection.ts';
import {
  snapshotFleetRequest,
  fleetSuccess,
  fleetError,
  type FleetRequest,
  type FleetSnapshot,
  type FleetErrorCode,
} from '../fleet-contract.ts';
type Health = 'AVAILABLE' | 'DEGRADED';
export type FleetAudit = Readonly<{
  operation: 'READ' | 'SELECT';
  phase: 'INTENT' | 'RESULT';
  diagnosticId: string;
  expectedRevision: number | null;
  resultingRevision: number | null;
  code: 'OK' | FleetErrorCode;
}>;
export type FleetCapability = Readonly<{ fleetCaller: true }>;
export type FleetServiceOptions = Readonly<{
  registry(): unknown;
  assertOwnedSync(): void;
  newDiagnostic(): string | null;
  audit(fields: FleetAudit): Promise<Health>;
  finalProjection?(expected: RegistrySnapshot): boolean;
  availability(): 'BINARY_UNAVAILABLE' | 'LIVE_DISCOVERY_UNAVAILABLE' | 'OBSERVED';
}>;
const budget = Object.freeze({
  maxSelected: 128,
  maxGroups: 32,
  maxGroupMembers: 128,
  maxRegistryDevices: 256,
  maxRegistryBindings: 4096,
});
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
class Fault extends Error {
  readonly code: FleetErrorCode;
  constructor(code: FleetErrorCode) {
    super(code);
    this.code = code;
  }
}
export function createFleetService(options: FleetServiceOptions) {
  const registry = options.registry.bind(options),
    owned = options.assertOwnedSync.bind(options),
    allocate = options.newDiagnostic.bind(options),
    audit = options.audit.bind(options),
    availability = options.availability.bind(options),
    finalProjection = options.finalProjection?.bind(options);
  const admittedSelection = createDeviceSelection(budget);
  if (!admittedSelection) throw new Error('FLEET_OPTIONS');
  const selection = admittedSelection;
  const capabilities = new WeakMap<FleetCapability, () => void>();
  const issued = new WeakSet<FleetCapability>();
  const labels = new Map<string, string>();
  let closed = false,
    busy = false;
  let active: Promise<string> | null = null;
  let closing: Promise<void> | null = null;
  function admit(cap: FleetCapability) {
    if (closed) throw new Fault('SESSION_REVOKED');
    const check = capabilities.get(cap);
    if (!check) throw new Fault(issued.has(cap) ? 'SESSION_REVOKED' : 'UNTRUSTED_SENDER');
    try {
      owned();
    } catch {
      throw new Fault('OWNER_REVOKED');
    }
    try {
      check();
    } catch {
      throw new Fault('SESSION_REVOKED');
    }
    // Trusted callbacks may synchronously close/revoke; no callback follows this fence.
    if (closed || capabilities.get(cap) !== check) throw new Fault('SESSION_REVOKED');
  }
  function finalAdmission(cap: FleetCapability, expected: RegistrySnapshot, observed: boolean) {
    admit(cap);
    const check = capabilities.get(cap);
    const latest = registry();
    if (closed || !check || capabilities.get(cap) !== check) throw new Fault('SESSION_REVOKED');
    if (latest !== expected) throw new Fault('CONFLICT');
    // The registry callback itself may invalidate external owner/session custody.
    admit(cap);
    if (observed && finalProjection && !finalProjection(expected))
      throw new Fault('FLEET_UNAVAILABLE');
    if (closed || capabilities.get(cap) !== check) throw new Fault('SESSION_REVOKED');
  }
  function current(): RegistrySnapshot {
    const r = registry();
    if (!isRegistrySnapshot(r)) throw new Fault('FLEET_UNAVAILABLE');
    if (
      r.devices.length > 256 ||
      r.bindings.length > 4096 ||
      r.claims.length > 256 ||
      r.devices.reduce((n, d) => n + d.evidenceIds.length, 0) > 4096
    )
      throw new Fault('LIMIT_EXCEEDED');
    if (r.source === 'SYNTHETIC_TEST' || r.bindings.some((b) => b.source === 'SYNTHETIC_TEST'))
      throw new Fault('FLEET_UNAVAILABLE');
    return r;
  }
  function publicSelection(s: DeviceSelectionSnapshot) {
    return Object.freeze({
      revision: s.revision,
      selectedDeviceIds: s.selectedDeviceIds,
      activeDeviceId: s.activeDeviceId,
      groups: s.groups,
    });
  }
  function project(r: RegistrySnapshot, s: DeviceSelectionSnapshot): FleetSnapshot {
    const reason = availability();
    if (!['OBSERVED', 'BINARY_UNAVAILABLE', 'LIVE_DISCOVERY_UNAVAILABLE'].includes(reason))
      throw new Fault('FLEET_UNAVAILABLE');
    if (reason !== 'OBSERVED' && r.devices.length !== 0) throw new Fault('FLEET_UNAVAILABLE');
    if (reason === 'OBSERVED' && r.source !== 'ADB_DISCOVERY') throw new Fault('FLEET_UNAVAILABLE');
    const missing = r.devices.filter((d) => !labels.has(d.deviceId));
    if (labels.size + missing.length > 256) throw new Fault('LIMIT_EXCEEDED');
    for (const d of missing)
      labels.set(d.deviceId, `Device ${String(labels.size + 1).padStart(4, '0')}`);
    return Object.freeze({
      registryRevision: r.revision,
      availability: reason === 'OBSERVED' ? 'OBSERVED' : 'UNAVAILABLE',
      reason: reason === 'OBSERVED' ? null : reason,
      devices: Object.freeze(
        r.devices.map((d) =>
          Object.freeze({
            deviceId: d.deviceId,
            generation: d.generation,
            label: labels.get(d.deviceId) ?? '',
            state: d.state,
            verification: d.verification,
          }),
        ),
      ),
      selection: publicSelection(s),
    });
  }
  function members(r: RegistrySnapshot, s: DeviceSelectionSnapshot) {
    const ids = new Set(r.devices.map((d) => d.deviceId));
    if (
      [
        ...s.selectedDeviceIds,
        ...(s.activeDeviceId === null ? [] : [s.activeDeviceId]),
        ...s.groups.flatMap((g) => g.deviceIds),
      ].some((id) => !ids.has(id))
    )
      throw new Fault('MEMBER_UNAVAILABLE');
  }
  async function log(fields: FleetAudit): Promise<Health> {
    try {
      return (await audit(Object.freeze({ ...fields }))) === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  async function run(cap: FleetCapability, request: FleetRequest): Promise<string> {
    let diagnosticId: string | null = null,
      applied = false;
    try {
      admit(cap);
      const allocated = allocate();
      if (!uuid(allocated)) throw new Fault('INTERNAL_FAILURE');
      diagnosticId = allocated;
      admit(cap);
      const operation = request.method === 'fleet.get' ? 'READ' : 'SELECT';
      const expected = request.method === 'fleet.get' ? null : request.expectedRevision;
      const fields = { operation, diagnosticId, expectedRevision: expected } as const;
      let r = current(),
        state = selection.snapshot();
      if (request.method === 'fleet.get') {
        const fleet = project(r, state);
        if (!fleetSuccess(request.requestId, 'OBSERVED', fleet, 'AVAILABLE'))
          throw new Fault('LIMIT_EXCEEDED');
        const health = await log({
          ...fields,
          phase: 'RESULT',
          resultingRevision: state.revision,
          code: 'OK',
        });
        finalAdmission(cap, r, fleet.availability === 'OBSERVED');
        return (
          fleetSuccess(request.requestId, 'OBSERVED', fleet, health) ??
          fleetError('INTERNAL_FAILURE', diagnosticId, 'DEGRADED')
        );
      }
      if (request.expectedRevision !== state.revision) throw new Fault('CONFLICT');
      const preview = createDeviceSelection(budget);
      const normalized = preview?.replace(0, request.selection);
      if (!normalized?.ok) throw new Fault('INVALID_SHAPE');
      members(r, normalized.snapshot);
      project(r, state);
      const intent = await log({ ...fields, phase: 'INTENT', resultingRevision: null, code: 'OK' });
      admit(cap);
      if (intent !== 'AVAILABLE') return fleetError('INTERNAL_FAILURE', diagnosticId, 'DEGRADED');
      r = current();
      state = selection.snapshot();
      if (request.expectedRevision !== state.revision) throw new Fault('CONFLICT');
      members(r, normalized.snapshot);
      const same =
        JSON.stringify({ ...publicSelection(state), revision: 0 }) ===
        JSON.stringify({ ...publicSelection(normalized.snapshot), revision: 0 });
      if (!same && state.revision === Number.MAX_SAFE_INTEGER) throw new Fault('LIMIT_EXCEEDED');
      const next = Object.freeze({
        ...normalized.snapshot,
        revision: same ? state.revision : state.revision + 1,
      });
      const fleet = project(r, next);
      const outcome = same ? 'UNCHANGED' : 'APPLIED';
      if (!fleetSuccess(request.requestId, outcome, fleet, 'AVAILABLE'))
        throw new Fault('LIMIT_EXCEEDED');
      finalAdmission(cap, r, fleet.availability === 'OBSERVED');
      if (!same) {
        const changed = selection.replace(state.revision, request.selection);
        if (!changed.ok)
          throw new Fault(changed.code === 'STALE_SELECTION' ? 'CONFLICT' : 'INTERNAL_FAILURE');
        applied = true;
      }
      const health = await log({
        ...fields,
        phase: 'RESULT',
        resultingRevision: next.revision,
        code: 'OK',
      });
      finalAdmission(cap, r, fleet.availability === 'OBSERVED');
      return (
        fleetSuccess(request.requestId, outcome, fleet, health) ??
        fleetError('INTERNAL_FAILURE', diagnosticId, 'DEGRADED')
      );
    } catch (error) {
      // A revoked response never rolls back an applied selection.
      let code: FleetErrorCode = error instanceof Fault ? error.code : 'INTERNAL_FAILURE';
      if (diagnosticId && !applied)
        await log({
          operation: request.method === 'fleet.get' ? 'READ' : 'SELECT',
          phase: 'RESULT',
          diagnosticId,
          expectedRevision: request.method === 'fleet.get' ? null : request.expectedRevision,
          resultingRevision: null,
          code,
        });
      try {
        admit(cap);
      } catch (final) {
        code = final instanceof Fault ? final.code : 'INTERNAL_FAILURE';
      }
      return fleetError(code, diagnosticId, 'DEGRADED');
    }
  }
  return Object.freeze({
    grant(check: () => void): FleetCapability {
      if (closed || typeof check !== 'function') throw new Error('FLEET_OPTIONS');
      const cap = Object.freeze({ fleetCaller: true as const });
      capabilities.set(cap, check);
      issued.add(cap);
      return cap;
    },
    revoke(cap: FleetCapability): void {
      capabilities.delete(cap);
    },
    execute(cap: FleetCapability, input: unknown): Promise<string> {
      if (busy) return Promise.resolve(fleetError('BUSY', null, 'DEGRADED'));
      const request = snapshotFleetRequest(input);
      if (!request) return Promise.resolve(fleetError('INVALID_SHAPE', null, 'DEGRADED'));
      busy = true;
      const work = run(cap, request).finally(() => {
        busy = false;
        active = null;
      });
      active = work;
      return work;
    },
    close(): Promise<void> {
      if (closing) return closing;
      closed = true;
      closing = (active ?? Promise.resolve('')).then(
        () => undefined,
        () => undefined,
      );
      return closing;
    },
  });
}

export type FleetService = ReturnType<typeof createFleetService>;
