// Pure main-only continuity ledger. Supplied resolver evidence is not acquired here.
// No serialization/import API: durable registry custody requires a later reviewed contract.
import { snapshotDiscoveryRow, type AdbDiscoveryRow } from './adb-discovery.ts';
export type RegistrySource = 'ADB_DISCOVERY' | 'SYNTHETIC_TEST';
export type RegistryDevice = Readonly<{
  deviceId: string;
  generation: number;
  state: AdbDiscoveryRow['state'] | 'CONFLICT' | 'DISCONNECTED';
  verification: 'PROVISIONAL' | 'VERIFIED';
  evidenceIds: readonly string[];
  currentBindingId: string | null;
}>;
export type RegistryBinding = Readonly<{
  bindingId: string;
  deviceId: string;
  generation: number;
  serial: string;
  transportId: string | null;
  state: AdbDiscoveryRow['state'];
  observedAtUtc: number;
  source: RegistrySource;
  retired: boolean;
}>;
export type RegistryClaim = Readonly<{
  serial: string;
  transportId: string | null;
  state: AdbDiscoveryRow['state'] | 'CONFLICT';
  reason:
    | 'CURRENT'
    | 'PROVISIONAL'
    | 'IDENTITY_REQUIRED'
    | 'DUPLICATE_SERIAL'
    | 'DUPLICATE_TRANSPORT'
    | 'IDENTITY_CONFLICT';
  deviceId: string | null;
  bindingId: string | null;
}>;
export type RegistrySnapshot = Readonly<{
  version: 1;
  revision: number;
  sequence: number | null;
  observedAtUtc: number | null;
  source: RegistrySource | null;
  devices: readonly RegistryDevice[];
  bindings: readonly RegistryBinding[];
  claims: readonly RegistryClaim[];
}>;
export type RegistryProof = Readonly<{
  serial: string;
  transportId: string | null;
  deviceId: string;
  evidenceId: string;
}>;
export type RegistryObservation = Readonly<{
  sequence: number;
  observedAtUtc: number;
  source: RegistrySource;
  rows: readonly AdbDiscoveryRow[];
  proofs: readonly RegistryProof[];
}>;
export type RegistryBudget = Readonly<{
  maxDevices: number;
  maxBindings: number;
  maxEvidence: number;
  maxClaims: number;
}>;
export type CurrentBinding = Readonly<{
  deviceId: string;
  bindingId: string;
  generation: number;
  serial: string;
}>;
export type RegistryCode =
  | 'INVALID_SNAPSHOT'
  | 'INVALID_INPUT'
  | 'INVALID_PROOF'
  | 'STALE_OBSERVATION'
  | 'LIMIT_EXCEEDED'
  | 'ID_ALLOCATION_FAILED'
  | 'GENERATION_OVERFLOW';
export type RegistryResult =
  | Readonly<{
      ok: true;
      code: 'RECONCILED' | 'RECONCILED_WITH_CONFLICTS';
      snapshot: RegistrySnapshot;
      invalidatedBindings: readonly string[];
    }>
  | Readonly<{ ok: false; code: RegistryCode; snapshot: RegistrySnapshot | null }>;
const snapshots = new WeakSet<object>();
const faults = new Map<RegistryCode, object>();
function fail(code: RegistryCode): never {
  let token = faults.get(code);
  if (!token) {
    token = Object.freeze({});
    faults.set(code, token);
  }
  throw token;
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail('INVALID_INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length) fail('INVALID_INPUT');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !('value' in d) || !d.enumerable) fail('INVALID_INPUT');
    result[key] = d.value;
  }
  return result;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value)) fail('INVALID_INPUT');
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0) fail('INVALID_INPUT');
  if (length > max) fail('LIMIT_EXCEEDED');
  const d = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(d).length !== length + 1) fail('INVALID_INPUT');
  const out = [];
  for (let i = 0; i < length; i++) {
    const entry = d[String(i)];
    if (!entry || !('value' in entry) || !entry.enumerable) fail('INVALID_INPUT');
    out.push(entry.value);
  }
  return out;
}
function id(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}
function revision(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
  );
}
function next(value: number): number {
  if (value === Number.MAX_SAFE_INTEGER) fail('GENERATION_OVERFLOW');
  return value + 1;
}
function freeze(snapshot: RegistrySnapshot): RegistrySnapshot {
  for (const device of snapshot.devices) {
    Object.freeze(device.evidenceIds);
    Object.freeze(device);
  }
  for (const binding of snapshot.bindings) Object.freeze(binding);
  for (const claim of snapshot.claims) Object.freeze(claim);
  Object.freeze(snapshot.devices);
  Object.freeze(snapshot.bindings);
  Object.freeze(snapshot.claims);
  Object.freeze(snapshot);
  snapshots.add(snapshot);
  return snapshot;
}
export function emptyRegistry(): RegistrySnapshot {
  return freeze({
    version: 1,
    revision: 0,
    sequence: null,
    observedAtUtc: null,
    source: null,
    devices: [],
    bindings: [],
    claims: [],
  });
}
function recognized(value: unknown): value is RegistrySnapshot {
  return !!value && typeof value === 'object' && snapshots.has(value);
}
const key = (row: Readonly<{ serial: string; transportId: string | null }>) =>
  JSON.stringify([row.serial, row.transportId]);
export function isCurrentBinding(snapshot: unknown, input: unknown): boolean {
  try {
    if (!recognized(snapshot)) return false;
    const value = record(input, ['deviceId', 'bindingId', 'generation', 'serial']);
    if (
      !id(value.deviceId) ||
      !id(value.bindingId) ||
      !revision(value.generation) ||
      typeof value.serial !== 'string'
    )
      return false;
    const device = snapshot.devices.find((d) => d.deviceId === value.deviceId);
    if (
      device?.verification !== 'VERIFIED' ||
      device.state !== 'DEVICE' ||
      device.currentBindingId !== value.bindingId ||
      device.generation !== value.generation
    )
      return false;
    return snapshot.bindings.some(
      (b) =>
        !b.retired &&
        b.state === 'DEVICE' &&
        b.bindingId === value.bindingId &&
        b.deviceId === value.deviceId &&
        b.generation === value.generation &&
        b.serial === value.serial,
    );
  } catch {
    return false;
  }
}
export function reconcileRegistry(
  previous: unknown,
  input: unknown,
  options: unknown,
): RegistryResult {
  const original = recognized(previous) ? previous : null;
  try {
    if (!original) fail('INVALID_SNAPSHOT');
    const opts = record(options, ['nextId', 'budget']);
    if (typeof opts.nextId !== 'function') fail('INVALID_INPUT');
    const allocate = opts.nextId as () => unknown;
    const rawBudget = record(opts.budget, [
      'maxDevices',
      'maxBindings',
      'maxEvidence',
      'maxClaims',
    ]);
    for (const value of Object.values(rawBudget))
      if (!revision(value) || value === 0) fail('INVALID_INPUT');
    const budget = rawBudget as RegistryBudget;
    if (
      original.devices.length > budget.maxDevices ||
      original.bindings.length > budget.maxBindings ||
      original.claims.length > budget.maxClaims
    )
      fail('LIMIT_EXCEEDED');
    let evidenceCount = 0;
    for (const device of original.devices) {
      evidenceCount += device.evidenceIds.length;
      if (evidenceCount > budget.maxEvidence) fail('LIMIT_EXCEEDED');
    }
    const observation = record(input, ['sequence', 'observedAtUtc', 'source', 'rows', 'proofs']);
    if (
      !revision(observation.sequence) ||
      !revision(observation.observedAtUtc) ||
      observation.observedAtUtc > 8640000000000000 ||
      (observation.source !== 'ADB_DISCOVERY' && observation.source !== 'SYNTHETIC_TEST')
    )
      fail('INVALID_INPUT');
    if (
      original.sequence !== null &&
      (observation.sequence <= original.sequence ||
        observation.observedAtUtc < (original.observedAtUtc ?? 0))
    )
      fail('STALE_OBSERVATION');
    const source: RegistrySource = observation.source;
    const observedAtUtc = observation.observedAtUtc;
    const rows = array(observation.rows, budget.maxClaims).map((value) => {
      const row = snapshotDiscoveryRow(value);
      if (!row) fail('INVALID_INPUT');
      return row;
    });
    const proofs = array(observation.proofs, budget.maxEvidence).map((value) => {
      const p = record(value, ['serial', 'transportId', 'deviceId', 'evidenceId']);
      const row = snapshotDiscoveryRow({
        serial: p.serial,
        transportId: p.transportId,
        state: 'DEVICE',
      });
      if (!row || !id(p.deviceId) || !id(p.evidenceId)) fail('INVALID_PROOF');
      return {
        serial: row.serial,
        transportId: row.transportId,
        deviceId: p.deviceId,
        evidenceId: p.evidenceId,
      };
    });
    const used = new Set<string>();
    for (const d of original.devices) {
      used.add(d.deviceId);
      for (const evidence of d.evidenceIds) used.add(evidence);
    }
    for (const b of original.bindings) used.add(b.bindingId);
    const proofKeys = new Set<string>(),
      proofDevices = new Set<string>();
    for (const proof of proofs) {
      if (
        used.has(proof.evidenceId) ||
        !original.devices.some((d) => d.deviceId === proof.deviceId) ||
        proofKeys.has(key(proof)) ||
        proofDevices.has(proof.deviceId) ||
        !rows.some((r) => key(r) === key(proof) && r.state === 'DEVICE')
      )
        fail('INVALID_PROOF');
      used.add(proof.evidenceId);
      proofKeys.add(key(proof));
      proofDevices.add(proof.deviceId);
    }
    const devices = original.devices.map((d) => ({ ...d, evidenceIds: [...d.evidenceIds] }));
    const bindings = original.bindings.map((b) => ({ ...b }));
    const claims: RegistryClaim[] = [];
    const invalidated: string[] = [];
    const serialCounts = new Map<string, number>(),
      transportCounts = new Map<string, number>();
    for (const row of rows) {
      serialCounts.set(row.serial, (serialCounts.get(row.serial) ?? 0) + 1);
      if (row.transportId !== null)
        transportCounts.set(row.transportId, (transportCounts.get(row.transportId) ?? 0) + 1);
    }
    const conflicts = new Map<string, RegistryClaim['reason']>();
    for (const row of rows) {
      if (serialCounts.get(row.serial) !== 1) conflicts.set(key(row), 'DUPLICATE_SERIAL');
      else if (row.transportId !== null && transportCounts.get(row.transportId) !== 1)
        conflicts.set(key(row), 'DUPLICATE_TRANSPORT');
    }
    for (const proof of proofs) {
      const device = devices.find((d) => d.deviceId === proof.deviceId);
      if (!device) fail('INVALID_PROOF');
      const owner = devices.find(
        (candidate) =>
          candidate.currentBindingId !== null &&
          bindings.some(
            (binding) =>
              binding.bindingId === candidate.currentBindingId && key(binding) === key(proof),
          ),
      );
      if (owner && owner.deviceId !== device.deviceId && owner.verification === 'VERIFIED') {
        conflicts.set(key(proof), 'IDENTITY_CONFLICT');
      }
      const current = bindings.find((b) => b.bindingId === device.currentBindingId);
      if (current && key(current) !== key(proof) && rows.some((r) => key(r) === key(current))) {
        conflicts.set(key(current), 'IDENTITY_CONFLICT');
        conflicts.set(key(proof), 'IDENTITY_CONFLICT');
      }
    }
    function retire(device: (typeof devices)[number]): void {
      if (device.currentBindingId === null) return;
      const binding = bindings.find((b) => b.bindingId === device.currentBindingId);
      if (!binding) fail('INVALID_SNAPSHOT');
      binding.retired = true;
      invalidated.push(binding.bindingId);
      device.currentBindingId = null;
      device.state = 'DISCONNECTED';
      device.generation = next(device.generation);
    }
    for (const device of devices) {
      const current = bindings.find((b) => b.bindingId === device.currentBindingId);
      if (
        current &&
        (!rows.some((r) => key(r) === key(current) && r.state === current.state) ||
          conflicts.has(key(current)))
      ) {
        retire(device);
        if (conflicts.has(key(current))) device.state = 'CONFLICT';
      }
    }
    function newId(): string {
      let value: unknown;
      try {
        value = allocate();
      } catch {
        fail('ID_ALLOCATION_FAILED');
      }
      if (!id(value) || used.has(value)) fail('ID_ALLOCATION_FAILED');
      used.add(value);
      return value;
    }
    function bind(device: (typeof devices)[number], row: AdbDiscoveryRow): RegistryBinding {
      if (bindings.length >= budget.maxBindings) fail('LIMIT_EXCEEDED');
      const binding = {
        bindingId: newId(),
        deviceId: device.deviceId,
        generation: device.generation,
        serial: row.serial,
        transportId: row.transportId,
        state: row.state,
        observedAtUtc,
        source,
        retired: false,
      };
      bindings.push(binding);
      device.currentBindingId = binding.bindingId;
      device.state = row.state;
      return binding;
    }
    for (const row of rows) {
      const conflict = conflicts.get(key(row));
      if (conflict) {
        claims.push({
          ...row,
          state: 'CONFLICT',
          reason: conflict,
          deviceId: null,
          bindingId: null,
        });
        continue;
      }
      const proof = proofs.find((p) => key(p) === key(row));
      let device = devices.find((d) =>
        bindings.some((b) => b.bindingId === d.currentBindingId && key(b) === key(row)),
      );
      let binding = bindings.find((b) => b.bindingId === device?.currentBindingId);
      if (proof) {
        const target = devices.find((d) => d.deviceId === proof.deviceId);
        if (!target) fail('INVALID_PROOF');
        if (device && device !== target) {
          retire(device);
          device = undefined;
          binding = undefined;
        }
        retire(target);
        target.verification = 'VERIFIED';
        target.evidenceIds.push(proof.evidenceId);
        if (devices.reduce((sum, d) => sum + d.evidenceIds.length, 0) > budget.maxEvidence)
          fail('LIMIT_EXCEEDED');
        device = target;
        binding = bind(target, row);
      } else if (!device) {
        const historical = bindings.some(
          (b) =>
            b.serial === row.serial ||
            (row.transportId !== null && b.transportId === row.transportId),
        );
        if (historical) {
          claims.push({
            ...row,
            state: 'CONFLICT',
            reason: 'IDENTITY_REQUIRED',
            deviceId: null,
            bindingId: null,
          });
          continue;
        }
        if (devices.length >= budget.maxDevices) fail('LIMIT_EXCEEDED');
        device = {
          deviceId: newId(),
          generation: 0,
          state: row.state,
          verification: 'PROVISIONAL',
          evidenceIds: [],
          currentBindingId: null,
        };
        devices.push(device);
        binding = bind(device, row);
      } else if (binding) {
        binding.observedAtUtc = observedAtUtc;
        binding.source = source;
      }
      if (!binding) fail('INVALID_SNAPSHOT');
      claims.push({
        ...row,
        reason: device.verification === 'VERIFIED' ? 'CURRENT' : 'PROVISIONAL',
        deviceId: device.deviceId,
        bindingId: binding.bindingId,
      });
    }
    const snapshot = freeze({
      version: 1,
      revision: next(original.revision),
      sequence: observation.sequence,
      observedAtUtc,
      source,
      devices,
      bindings,
      claims,
    });
    return Object.freeze({
      ok: true,
      code: claims.some((c) => c.state === 'CONFLICT') ? 'RECONCILED_WITH_CONFLICTS' : 'RECONCILED',
      snapshot,
      invalidatedBindings: Object.freeze(invalidated),
    });
  } catch (error) {
    let code: RegistryCode = 'INVALID_INPUT';
    for (const [name, token] of faults) if (error === token) code = name;
    return Object.freeze({ ok: false, code, snapshot: original });
  }
}
