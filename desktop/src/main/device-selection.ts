// Pure main-only selection. Plans capture identity tuples; they do not authorize dispatch.
import {
  isRegistrySnapshot,
  isCurrentBinding,
  type CurrentBinding,
  type RegistrySnapshot,
} from './transport-registry.ts';
export type SelectionBudget = Readonly<{
  maxSelected: number;
  maxGroups: number;
  maxGroupMembers: number;
  maxRegistryDevices: number;
  maxRegistryBindings: number;
}>;
export type DeviceGroup = Readonly<{ groupId: string; deviceIds: readonly string[] }>;
export type DeviceSelectionSnapshot = Readonly<{
  version: 1;
  revision: number;
  selectedDeviceIds: readonly string[];
  activeDeviceId: string | null;
  groups: readonly DeviceGroup[];
}>;
export type DeviceActionPlan = Readonly<{
  version: 1;
  selectionRevision: number;
  registryRevision: number;
  scope: 'ACTIVE' | 'SELECTED' | 'GROUP';
  groupId: string | null;
  bindings: readonly CurrentBinding[];
}>;
export type SelectionCode =
  | 'INVALID_INPUT'
  | 'INVALID_REGISTRY'
  | 'STALE_SELECTION'
  | 'LIMIT_EXCEEDED'
  | 'REVISION_OVERFLOW'
  | 'EMPTY_SELECTION'
  | 'GROUP_UNAVAILABLE'
  | 'MEMBER_UNAVAILABLE';
type Failure = Readonly<{ ok: false; code: SelectionCode }>;
export type SelectionResult = Failure | Readonly<{ ok: true; snapshot: DeviceSelectionSnapshot }>;
export type SelectionPlanResult = Failure | Readonly<{ ok: true; plan: DeviceActionPlan }>;
export type DeviceSelectionController = Readonly<{
  snapshot(): DeviceSelectionSnapshot;
  isCurrentPlan(input: unknown): input is DeviceActionPlan;
  replace(expectedRevision: unknown, input: unknown): SelectionResult;
  plan(input: unknown, registry: unknown): SelectionPlanResult;
}>;
const plans = new WeakSet<object>();
const faults = new Map<SelectionCode, object>();
function fail(code: SelectionCode): never {
  let token = faults.get(code);
  if (!token) {
    token = Object.freeze({});
    faults.set(code, token);
  }
  throw token;
}
function failure(error: unknown): Failure {
  let code: SelectionCode = 'INVALID_INPUT';
  for (const [key, token] of faults) if (token === error) code = key;
  return Object.freeze({ ok: false, code });
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail('INVALID_INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length) fail('INVALID_INPUT');
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !('value' in d) || !d.enumerable) fail('INVALID_INPUT');
    out[key] = d.value;
  }
  return out;
}
function integer(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
  );
}
function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value)) fail('INVALID_INPUT');
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!integer(length)) fail('INVALID_INPUT');
  if (length > max) fail('LIMIT_EXCEEDED');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== length + 1) fail('INVALID_INPUT');
  const out = [];
  for (let i = 0; i < length; i++) {
    const d = descriptors[String(i)];
    if (!d || !('value' in d) || !d.enumerable) fail('INVALID_INPUT');
    out.push(d.value);
  }
  return out;
}
function ids(value: unknown, max: number): readonly string[] {
  const list = array(value, max);
  if (!list.every(uuid) || new Set(list).size !== list.length) fail('INVALID_INPUT');
  return Object.freeze((list as string[]).slice().sort());
}
function revision(expected: unknown, current: number) {
  if (!integer(expected)) fail('INVALID_INPUT');
  if (expected !== current) fail('STALE_SELECTION');
}
export function isDeviceActionPlan(value: unknown): value is DeviceActionPlan {
  return !!value && typeof value === 'object' && plans.has(value);
}
export function createDeviceSelection(input: unknown): DeviceSelectionController | null {
  try {
    const raw = record(input, [
      'maxSelected',
      'maxGroups',
      'maxGroupMembers',
      'maxRegistryDevices',
      'maxRegistryBindings',
    ]);
    if (!Object.values(raw).every((value) => integer(value) && value > 0)) return null;
    const budget = Object.freeze({ ...raw }) as SelectionBudget;
    const ownPlans = new WeakSet<object>();
    let state: DeviceSelectionSnapshot = Object.freeze({
      version: 1,
      revision: 0,
      selectedDeviceIds: Object.freeze([]),
      activeDeviceId: null,
      groups: Object.freeze([]),
    });
    return Object.freeze({
      snapshot: () => state,
      isCurrentPlan(input: unknown): input is DeviceActionPlan {
        return (
          isDeviceActionPlan(input) &&
          ownPlans.has(input) &&
          input.selectionRevision === state.revision
        );
      },
      replace(expectedRevision: unknown, input: unknown): SelectionResult {
        try {
          const original = state;
          revision(expectedRevision, original.revision);
          const value = record(input, ['selectedDeviceIds', 'activeDeviceId', 'groups']);
          const selectedDeviceIds = ids(value.selectedDeviceIds, budget.maxSelected);
          if (value.activeDeviceId !== null && !uuid(value.activeDeviceId)) fail('INVALID_INPUT');
          let total = 0;
          const groups = array(value.groups, budget.maxGroups).map((item) => {
            const group = record(item, ['groupId', 'deviceIds']);
            if (!uuid(group.groupId)) fail('INVALID_INPUT');
            const deviceIds = ids(group.deviceIds, budget.maxGroupMembers);
            total += deviceIds.length;
            if (!Number.isSafeInteger(total) || total > budget.maxGroupMembers)
              fail('LIMIT_EXCEEDED');
            return Object.freeze({ groupId: group.groupId, deviceIds });
          });
          if (new Set(groups.map((group) => group.groupId)).size !== groups.length)
            fail('INVALID_INPUT');
          if (state !== original) fail('STALE_SELECTION');
          if (state.revision === Number.MAX_SAFE_INTEGER) fail('REVISION_OVERFLOW');
          groups.sort((a, b) => a.groupId.localeCompare(b.groupId));
          state = Object.freeze({
            version: 1,
            revision: state.revision + 1,
            selectedDeviceIds,
            activeDeviceId: value.activeDeviceId as string | null,
            groups: Object.freeze(groups),
          });
          return Object.freeze({ ok: true, snapshot: state });
        } catch (error) {
          return failure(error);
        }
      },
      plan(input: unknown, registry: unknown): SelectionPlanResult {
        try {
          const value = record(input, ['expectedRevision', 'scope', 'groupId']);
          revision(value.expectedRevision, state.revision);
          if (!['ACTIVE', 'SELECTED', 'GROUP'].includes(value.scope as string))
            fail('INVALID_INPUT');
          if (value.scope === 'GROUP' ? !uuid(value.groupId) : value.groupId !== null)
            fail('INVALID_INPUT');
          if (!isRegistrySnapshot(registry)) fail('INVALID_REGISTRY');
          const current: RegistrySnapshot = registry;
          if (
            current.devices.length > budget.maxRegistryDevices ||
            current.bindings.length > budget.maxRegistryBindings
          )
            fail('LIMIT_EXCEEDED');
          let selected: readonly string[];
          if (value.scope === 'ACTIVE')
            selected = state.activeDeviceId === null ? [] : [state.activeDeviceId];
          else if (value.scope === 'SELECTED') selected = state.selectedDeviceIds;
          else {
            const group = state.groups.find((group) => group.groupId === value.groupId);
            if (!group) fail('GROUP_UNAVAILABLE');
            selected = group.deviceIds;
          }
          if (selected.length === 0) fail('EMPTY_SELECTION');
          const bindings = selected.map((deviceId) => {
            const device = current.devices.find((device) => device.deviceId === deviceId);
            const binding = current.bindings.find(
              (binding) =>
                binding.bindingId === device?.currentBindingId && binding.deviceId === deviceId,
            );
            if (!binding) fail('MEMBER_UNAVAILABLE');
            const tuple = Object.freeze({
              deviceId,
              bindingId: binding.bindingId,
              generation: binding.generation,
              serial: binding.serial,
            });
            if (!isCurrentBinding(current, tuple)) fail('MEMBER_UNAVAILABLE');
            return tuple;
          });
          const plan: DeviceActionPlan = Object.freeze({
            version: 1,
            selectionRevision: state.revision,
            registryRevision: current.revision,
            scope: value.scope as DeviceActionPlan['scope'],
            groupId: value.groupId as string | null,
            bindings: Object.freeze(bindings),
          });
          plans.add(plan);
          ownPlans.add(plan);
          return Object.freeze({ ok: true, plan });
        } catch (error) {
          return failure(error);
        }
      },
    });
  } catch {
    return null;
  }
}
