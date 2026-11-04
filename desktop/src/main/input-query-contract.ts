/** Private fixed input query facts. No issuer, transport or process authority. */
import { validAdbSerial } from './adb-discovery.ts';
export const INPUT_QUERY_ACTIONS = Object.freeze([
  'HOME',
  'BACK',
  'ENTER',
  'ESCAPE',
  'DPAD_UP',
  'DPAD_DOWN',
  'DPAD_LEFT',
  'DPAD_RIGHT',
  'DPAD_CENTER',
] as const);
export type InputQueryAction = (typeof INPUT_QUERY_ACTIONS)[number];
export type InputQueryRequest = Readonly<{
  version: 4;
  kind: 'INPUT_QUERY';
  commandId: string;
  correlationId: string;
  ownerId: string;
  deviceId: string;
  bindingId: string;
  generation: number;
  serial: string;
  transportId: string;
  action: InputQueryAction;
  deadlineUtc: number;
  display: null;
}>;
export type InputQueryFacts = Readonly<{
  version: 1;
  kind: 'INPUT_QUERY';
  status: 'COMPLETE' | 'FAILED' | 'UNRETIRED';
  code:
    | 'OK'
    | 'BUSY'
    | 'CLOSED'
    | 'DEADLINE'
    | 'ADMISSION_REJECTED'
    | 'INPUT_REJECTED'
    | 'NATIVE_FAILED'
    | 'UNRETIRED';
  dispatched: boolean;
  operationRetired: boolean;
  stdoutEmpty: boolean | null;
  stderrEmpty: boolean | null;
  remoteExitCode: number | null;
  observedAtUtc: number | null;
}>;
export type QueryRetirement = Readonly<{ status: 'RETIRED' | 'UNRETIRED' }>;
export type InputQueryHandle = Readonly<{
  handoff: 'LOCAL_REFUSAL' | 'QUERY';
  result: Promise<InputQueryFacts>;
  retirement: Promise<QueryRetirement>;
}>;
function record(raw: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (
      !raw ||
      typeof raw !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
    )
      return null;
    const d = Object.getOwnPropertyDescriptors(raw);
    if (
      Reflect.ownKeys(d).length !== keys.length ||
      keys.some((k) => !d[k] || !('value' in d[k]) || !d[k].enumerable)
    )
      return null;
    return Object.fromEntries(keys.map((k) => [k, d[k]?.value]));
  } catch {
    return null;
  }
}
export function validInputTransportId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 20 &&
    !/[\r\n]/.test(value) &&
    /^[1-9][0-9]*$/.test(value) &&
    (value.length < 20 || value <= '18446744073709551615')
  );
}
export function validInputDeadline(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    value >= 0 &&
    value <= 8640000000000000
  );
}
export function validInputAction(value: unknown): value is InputQueryAction {
  return typeof value === 'string' && INPUT_QUERY_ACTIONS.some((action) => action === value);
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function snapshotInputQueryRequest(raw: unknown): InputQueryRequest | null {
  const v = record(raw, [
    'version',
    'kind',
    'commandId',
    'correlationId',
    'ownerId',
    'deviceId',
    'bindingId',
    'generation',
    'serial',
    'transportId',
    'action',
    'deadlineUtc',
    'display',
  ]);
  if (
    v?.version !== 4 ||
    v.kind !== 'INPUT_QUERY' ||
    ![v.commandId, v.correlationId, v.ownerId, v.deviceId, v.bindingId].every(uuid) ||
    new Set([v.commandId, v.correlationId, v.ownerId]).size !== 3 ||
    typeof v.generation !== 'number' ||
    !Number.isSafeInteger(v.generation) ||
    Object.is(v.generation, -0) ||
    v.generation < 0 ||
    !validAdbSerial(v.serial) ||
    /[\r\n]/.test(v.serial) ||
    !validInputTransportId(v.transportId) ||
    !validInputAction(v.action) ||
    v.display !== null ||
    !validInputDeadline(v.deadlineUtc)
  )
    return null;
  return Object.freeze(v) as InputQueryRequest;
}
export function snapshotInputQueryFacts(raw: unknown): InputQueryFacts | null {
  try {
    const v = record(raw, [
      'version',
      'kind',
      'status',
      'code',
      'dispatched',
      'operationRetired',
      'stdoutEmpty',
      'stderrEmpty',
      'remoteExitCode',
      'observedAtUtc',
    ]);
    if (
      v?.version !== 1 ||
      v.kind !== 'INPUT_QUERY' ||
      typeof v.dispatched !== 'boolean' ||
      typeof v.operationRetired !== 'boolean'
    )
      return null;
    if (v.status === 'COMPLETE') {
      if (
        v.code !== 'OK' ||
        !v.dispatched ||
        !v.operationRetired ||
        typeof v.remoteExitCode !== 'number' ||
        !Number.isInteger(v.remoteExitCode) ||
        Object.is(v.remoteExitCode, -0) ||
        v.remoteExitCode < 0 ||
        v.remoteExitCode > 255 ||
        !validInputDeadline(v.observedAtUtc)
      )
        return null;
      if (typeof v.stdoutEmpty !== 'boolean' || typeof v.stderrEmpty !== 'boolean') return null;
    } else {
      if (
        v.stdoutEmpty !== null ||
        v.stderrEmpty !== null ||
        v.remoteExitCode !== null ||
        v.observedAtUtc !== null
      )
        return null;
      if (v.status === 'FAILED') {
        if (
          !v.operationRetired ||
          ![
            'BUSY',
            'CLOSED',
            'DEADLINE',
            'ADMISSION_REJECTED',
            'INPUT_REJECTED',
            'NATIVE_FAILED',
          ].includes(v.code as string)
        )
          return null;
      } else if (v.status !== 'UNRETIRED' || v.code !== 'UNRETIRED' || v.operationRetired)
        return null;
    }
    return Object.freeze(v) as InputQueryFacts;
  } catch {
    return null;
  }
}
