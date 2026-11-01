// Main-only scheduling engine. No executable, endpoint, shell or live device adapter.
import { validAdbSerial } from './adb-discovery.ts';
import {
  displayCurrent,
  snapshotDeviceInputRequest,
  type DeviceInputRequest,
} from './input-contract.ts';
import {
  snapshotMetadataQueryRequest,
  snapshotMetadataQueryFacts,
  snapshotQueryRetirement,
  validMetadataTransportId,
  type MetadataQueryRequest,
  type MetadataQueryFacts,
  type MetadataQueryHandle,
} from './metadata-query-contract.ts';
const NativePromise = Promise,
  promisePrototype = Promise.prototype,
  promiseThen = Promise.prototype.then;
const promiseSpecies = Object.getOwnPropertyDescriptor(Promise, Symbol.species)?.get;
function queryPromise(value: unknown): value is Promise<unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === promisePrototype &&
    !Object.getOwnPropertyDescriptor(value, 'then') &&
    !Object.getOwnPropertyDescriptor(value, 'constructor') &&
    Object.getOwnPropertyDescriptor(promisePrototype, 'then')?.value === promiseThen &&
    Object.getOwnPropertyDescriptor(promisePrototype, 'constructor')?.value === NativePromise &&
    Object.getOwnPropertyDescriptor(NativePromise, Symbol.species)?.get === promiseSpecies &&
    !('value' in (Object.getOwnPropertyDescriptor(NativePromise, Symbol.species) ?? {}))
  );
}
export type DeviceBinding = Readonly<{
  deviceId: string;
  bindingId: string;
  generation: number;
  serial: string;
}>;
export const METADATA_OPERATIONS = Object.freeze([
  'MODEL',
  'MANUFACTURER',
  'OS',
  'SDK',
  'LOCALE',
  'RESOLUTION',
  'DENSITY',
  'BATTERY',
  'STORAGE',
] as const);
export type MetadataOperation = (typeof METADATA_OPERATIONS)[number];
export type DeviceMetadataRequest = DeviceBinding &
  Readonly<{
    version: 1;
    commandId: string;
    correlationId: string;
    ownerId: string;
    operation: MetadataOperation;
    deadlineUtc: number;
  }>;
export type DeviceRequest = DeviceMetadataRequest | DeviceInputRequest | MetadataQueryRequest;
export type ActorCode =
  | 'OK'
  | 'INVALID_REQUEST'
  | 'OWNER_REVOKED'
  | 'BUSY'
  | 'STALE_BINDING'
  | 'STALE_DISPLAY'
  | 'UNICODE_UNAVAILABLE'
  | 'DEADLINE_EXCEEDED'
  | 'CANCELLED'
  | 'BINARY_UNAVAILABLE'
  | 'TRANSPORT_FAILED'
  | 'OBSERVATION_REJECTED'
  | 'OUTCOME_UNKNOWN'
  | 'CLOSED';
export type ActorResult = Readonly<{
  outcome: 'NOT_DISPATCHED' | 'DISPATCHED_UNCONFIRMED' | 'OBSERVED' | 'OUTCOME_UNKNOWN';
  code: ActorCode;
  commandId: string | null;
  correlationId: string | null;
  diagnosticId: null;
}>;
export type DeviceProcessResult = Readonly<{
  status: 'SUCCESS' | 'NONZERO_EXIT' | 'TIMEOUT' | 'FAILED';
  exitCode: number | null;
  retired: boolean;
  truncated: boolean;
  stdout: string;
}>;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(descriptors).length !== keys.length ||
      keys.some(
        (key) =>
          !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key] ?? {}, 'value'),
      )
    )
      return null;
    return Object.fromEntries(keys.map((key) => [key, descriptors[key]?.value]));
  } catch {
    return null;
  }
}
function binding(value: unknown): DeviceBinding | null {
  const v = record(value, ['deviceId', 'bindingId', 'generation', 'serial']);
  if (
    !v ||
    !uuid(v.deviceId) ||
    !uuid(v.bindingId) ||
    !Number.isSafeInteger(v.generation) ||
    Object.is(v.generation, -0) ||
    (v.generation as number) < 0 ||
    !validAdbSerial(v.serial)
  )
    return null;
  return Object.freeze(v) as DeviceBinding;
}
function request(value: unknown): DeviceRequest | null {
  const metadata = snapshotMetadataQueryRequest(value);
  if (metadata) return metadata;
  const input = snapshotDeviceInputRequest(value);
  if (input) return input;
  const v = record(value, [
    'version',
    'commandId',
    'correlationId',
    'deviceId',
    'bindingId',
    'generation',
    'serial',
    'ownerId',
    'operation',
    'deadlineUtc',
  ]);
  if (
    v?.version !== 1 ||
    !uuid(v.commandId) ||
    !uuid(v.correlationId) ||
    v.commandId === v.correlationId ||
    !uuid(v.ownerId) ||
    !METADATA_OPERATIONS.includes(v.operation as MetadataOperation) ||
    !Number.isSafeInteger(v.deadlineUtc) ||
    Object.is(v.deadlineUtc, -0) ||
    (v.deadlineUtc as number) < 0 ||
    !binding({
      deviceId: v.deviceId,
      bindingId: v.bindingId,
      generation: v.generation,
      serial: v.serial,
    })
  )
    return null;
  return Object.freeze(v) as DeviceMetadataRequest;
}
function processResult(value: unknown): DeviceProcessResult | null {
  const v = record(value, ['status', 'exitCode', 'retired', 'truncated', 'stdout']);
  if (
    !v ||
    !['SUCCESS', 'NONZERO_EXIT', 'TIMEOUT', 'FAILED'].includes(v.status as string) ||
    !(
      v.exitCode === null ||
      (Number.isSafeInteger(v.exitCode) &&
        (v.exitCode as number) >= -2147483648 &&
        (v.exitCode as number) <= 2147483647)
    ) ||
    typeof v.retired !== 'boolean' ||
    typeof v.truncated !== 'boolean' ||
    typeof v.stdout !== 'string' ||
    new TextEncoder().encode(v.stdout).byteLength > 65536
  )
    return null;
  return Object.freeze(v) as DeviceProcessResult;
}
function result(
  r: DeviceRequest | null,
  code: ActorCode,
  outcome: ActorResult['outcome'] = 'NOT_DISPATCHED',
): ActorResult {
  return Object.freeze({
    outcome,
    code,
    commandId: r?.commandId ?? null,
    correlationId: r?.correlationId ?? null,
    diagnosticId: null,
  });
}
const budgets = new WeakMap<object, Set<string>>();
export function createDeviceQueueBudget() {
  const reservations = new Set<object>();
  const value = Object.freeze({
    reserve(): object | null {
      if (reservations.size >= 1024) return null;
      const key = Object.freeze({});
      reservations.add(key);
      return key;
    },
    release(key: object): void {
      reservations.delete(key);
    },
    pending(): number {
      return reservations.size;
    },
  });
  budgets.set(value, new Set());
  return value;
}
export type DeviceQueueBudget = ReturnType<typeof createDeviceQueueBudget>;
export type ActorCapability = Readonly<{ ownerId: string }>;
export type ActorMetadataConfig = Readonly<{
  transportId: string;
  dispatch(request: MetadataQueryRequest): MetadataQueryHandle;
  observe(request: MetadataQueryRequest, facts: MetadataQueryFacts): boolean;
  finalCurrent(): boolean;
  localBusy(): boolean;
}>;
export type ActorOptions = Readonly<{
  metadata?: ActorMetadataConfig;
  binding: DeviceBinding;
  budget: DeviceQueueBudget;
  now: () => number;
  assertOwned: () => boolean;
  current: (binding: DeviceBinding) => boolean;
  binaryAvailable: () => boolean;
  currentDisplay?: (binding: DeviceBinding) => unknown;
  dispatch: (request: DeviceMetadataRequest | DeviceInputRequest) => Promise<unknown>;
  observe: (request: DeviceMetadataRequest | DeviceInputRequest, stdout: string) => boolean;
}>;
type Pending = {
  request: DeviceRequest;
  cap: ActorCapability;
  reservation: object;
  resolve: (value: ActorResult) => void;
};
export function createDeviceActor(options: ActorOptions) {
  const admittedTarget = binding(options.binding);
  if (!admittedTarget || !budgets.has(options.budget)) throw new Error('ACTOR_OPTIONS');
  const target: DeviceBinding = admittedTarget;
  const registered = budgets.get(options.budget);
  if (!registered || registered.has(target.deviceId)) throw new Error('ACTOR_ALREADY_OWNED');
  const { now, assertOwned, current, binaryAvailable, dispatch, observe, budget } = options;
  const metadataDescriptor = Object.getOwnPropertyDescriptor(options, 'metadata');
  if (metadataDescriptor && (!('value' in metadataDescriptor) || !metadataDescriptor.enumerable))
    throw Error('ACTOR_OPTIONS');
  const metadataValue = metadataDescriptor?.value;
  const md =
    metadataValue === undefined
      ? null
      : record(metadataValue, ['transportId', 'dispatch', 'observe', 'finalCurrent', 'localBusy']);
  if (
    metadataValue !== undefined &&
    (!md ||
      !validMetadataTransportId(md.transportId) ||
      [md.dispatch, md.observe, md.finalCurrent, md.localBusy].some((f) => typeof f !== 'function'))
  )
    throw Error('ACTOR_OPTIONS');
  const metadata = md ? (Object.freeze(md) as ActorMetadataConfig) : null;
  const currentDisplay = options.currentDisplay ?? (() => null);
  if (
    [now, assertOwned, current, binaryAvailable, dispatch, observe, currentDisplay].some(
      (fn) => typeof fn !== 'function',
    )
  )
    throw new Error('ACTOR_OPTIONS');
  registered.add(target.deviceId);
  let owner: ActorCapability | null = null;
  let closed = false;
  let draining = false;
  let uncertain = false;
  let active: Pending | null = null;
  let lastTime = -1;
  function clock(): number {
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0 || time < lastTime) throw new Error('ACTOR_CLOCK');
    lastTime = time;
    return time;
  }
  const queue: Pending[] = [];
  const idle: (() => void)[] = [];
  function admission(
    cap: ActorCapability,
    r: DeviceRequest,
    phase: 'DISPATCH' | 'OBSERVE' = 'DISPATCH',
  ): ActorCode | null {
    if (closed) return 'CLOSED';
    if (uncertain) return 'OUTCOME_UNKNOWN';
    if (!cap || typeof cap !== 'object' || owner !== cap || cap.ownerId !== r.ownerId || draining)
      return 'OWNER_REVOKED';
    try {
      if (r.version === 3 && phase === 'DISPATCH' && metadata?.localBusy() === true) return 'BUSY';
      if (assertOwned() !== true) return 'OWNER_REVOKED';
      if (
        r.deviceId !== target.deviceId ||
        r.bindingId !== target.bindingId ||
        r.generation !== target.generation ||
        r.serial !== target.serial ||
        current(target) !== true
      )
        return 'STALE_BINDING';
      const time = clock();
      if (r.deadlineUtc <= time || r.deadlineUtc - time > (r.version === 3 ? 30000 : 120000))
        return 'DEADLINE_EXCEEDED';
      if (r.version === 2) {
        if (r.operation.kind === 'TEXT') return 'UNICODE_UNAVAILABLE';
        if (!displayCurrent(r, r.display === null ? null : currentDisplay(target), time, phase))
          return 'STALE_DISPLAY';
      }
      if (r.version === 3 && (!metadata || r.transportId !== metadata.transportId))
        return 'STALE_BINDING';
      if (binaryAvailable() !== true) return 'BINARY_UNAVAILABLE';
      if (r.version === 2 && current(target) !== true) return 'STALE_BINDING';
      if (r.version === 3 && phase === 'DISPATCH' && metadata?.localBusy() === true) return 'BUSY';
      if (r.version === 3 && metadata?.finalCurrent() !== true) return 'STALE_BINDING';
      if (closed || draining || uncertain || owner !== cap) return 'OWNER_REVOKED';
    } catch {
      return 'OWNER_REVOKED';
    }
    return null;
  }
  function settleQueued(code: ActorCode): void {
    for (const item of queue.splice(0)) {
      budget.release(item.reservation);
      item.resolve(result(item.request, code));
    }
  }
  function notifyIdle(): void {
    if (!active && queue.length === 0) for (const resolve of idle.splice(0)) resolve();
  }
  async function run(item: Pending): Promise<void> {
    const r = item.request;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let queryRetired = true;
    const finish = (value: ActorResult) => {
      if (!settled) {
        settled = true;
        item.resolve(value);
      }
    };
    try {
      const denied = admission(item.cap, r);
      if (denied) {
        finish(result(r, denied));
        return;
      }
      const remaining = Math.min(120000, r.deadlineUtc - clock());
      if (
        r.version === 2 &&
        !displayCurrent(r, r.display === null ? null : currentDisplay(target), lastTime)
      ) {
        finish(result(r, 'STALE_DISPLAY'));
        return;
      }
      if (r.version === 2 && current(target) !== true) {
        finish(result(r, 'STALE_BINDING'));
        return;
      }
      if (owner !== item.cap || closed || draining || uncertain) {
        finish(result(r, 'OWNER_REVOKED'));
        return;
      }
      if (remaining <= 0) {
        finish(result(r, 'DEADLINE_EXCEEDED'));
        return;
      }
      if (r.version === 3) {
        if (
          !metadata ||
          r.transportId !== metadata.transportId ||
          metadata.finalCurrent() !== true
        ) {
          finish(result(r, 'STALE_BINDING'));
          return;
        }
        const start = lastTime;
        queryRetired = false;
        const failUnknown = () => {
          uncertain = true;
          settleQueued('OUTCOME_UNKNOWN');
          finish(result(r, 'OUTCOME_UNKNOWN', 'OUTCOME_UNKNOWN'));
          for (const resolve of idle.splice(0)) resolve();
        };
        timer = setTimeout(failUnknown, Math.min(30000, remaining));
        try {
          const handle = record(metadata.dispatch(r), ['handoff', 'result', 'retirement']);
          if (
            !handle ||
            !['LOCAL_REFUSAL', 'QUERY'].includes(handle.handoff as string) ||
            !queryPromise(handle.result) ||
            !queryPromise(handle.retirement)
          )
            throw Error();
          const factWork = Reflect.apply(promiseThen, handle.result, [
            (raw: unknown) => {
              const facts = snapshotMetadataQueryFacts(raw);
              const time = clock();
              return facts &&
                time >= start &&
                facts.observedAtUtc !== null &&
                (facts.observedAtUtc < start ||
                  facts.observedAtUtc > time ||
                  facts.observedAtUtc > r.deadlineUtc)
                ? null
                : facts;
            },
            () => null,
          ]) as Promise<MetadataQueryFacts | null>;
          const retireWork = Reflect.apply(promiseThen, handle.retirement, [
            (raw: unknown) => snapshotQueryRetirement(raw),
            () => null,
          ]) as Promise<ReturnType<typeof snapshotQueryRetirement>>;
          const [facts, retirement] = await Promise.all([factWork, retireWork]);
          if (!facts || retirement?.status !== 'RETIRED' || !facts.operationRetired) {
            failUnknown();
            return;
          }
          if (handle.handoff === 'LOCAL_REFUSAL') {
            if (facts.status !== 'FAILED' || facts.dispatched) {
              failUnknown();
              return;
            }
            const localCode: ActorCode | null =
              facts.code === 'BUSY'
                ? 'BUSY'
                : facts.code === 'CLOSED'
                  ? 'CLOSED'
                  : facts.code === 'DEADLINE'
                    ? 'DEADLINE_EXCEEDED'
                    : facts.code === 'ADMISSION_REJECTED'
                      ? 'STALE_BINDING'
                      : null;
            if (localCode === null) {
              failUnknown();
              return;
            }
            queryRetired = true;
            if (!settled) finish(result(r, localCode));
            return;
          }
          queryRetired = true;
          if (facts.status === 'FAILED' && facts.dispatched) {
            failUnknown();
            return;
          }
          if (settled) return;
          const denied = admission(item.cap, r, 'OBSERVE');
          if (denied) {
            finish(result(r, denied, 'DISPATCHED_UNCONFIRMED'));
            return;
          }
          if (
            facts.status !== 'COMPLETE' ||
            facts.remoteExitCode !== 0 ||
            facts.stderrBase64 !== ''
          ) {
            finish(result(r, 'TRANSPORT_FAILED', 'DISPATCHED_UNCONFIRMED'));
            return;
          }
          const valid = metadata.observe(r, facts) === true;
          const final = admission(item.cap, r, 'OBSERVE');
          finish(
            final
              ? result(r, final, 'DISPATCHED_UNCONFIRMED')
              : valid
                ? result(r, 'OK', 'OBSERVED')
                : result(r, 'OBSERVATION_REJECTED', 'DISPATCHED_UNCONFIRMED'),
          );
        } catch {
          failUnknown();
        }
        return;
      }
      // Invocation is synchronous after the last admission; no await/retry gap.
      const work = dispatch(r);
      timer = setTimeout(() => {
        uncertain = true;
        settleQueued('OUTCOME_UNKNOWN');
        finish(result(r, 'OUTCOME_UNKNOWN', 'OUTCOME_UNKNOWN'));
        for (const resolve of idle.splice(0)) resolve();
      }, remaining);
      const observed = processResult(await work);
      if (settled) return; // Deadline never becomes late automatic success.
      if (!observed?.retired) {
        uncertain = true;
        settleQueued('OUTCOME_UNKNOWN');
        finish(result(r, 'OUTCOME_UNKNOWN', 'OUTCOME_UNKNOWN'));
        return;
      }
      const stale = admission(item.cap, r, 'OBSERVE');
      if (stale) {
        finish(result(r, stale, 'DISPATCHED_UNCONFIRMED'));
        return;
      }
      if (observed.status !== 'SUCCESS' || observed.exitCode !== 0 || observed.truncated) {
        finish(result(r, 'TRANSPORT_FAILED', 'DISPATCHED_UNCONFIRMED'));
        return;
      }
      let valid = false;
      try {
        valid = observe(r, observed.stdout) === true;
      } catch {
        /* fixed rejection */
      }
      const final = admission(item.cap, r, 'OBSERVE');
      finish(
        final
          ? result(r, final, 'DISPATCHED_UNCONFIRMED')
          : valid
            ? result(r, 'OK', 'OBSERVED')
            : result(r, 'OBSERVATION_REJECTED', 'DISPATCHED_UNCONFIRMED'),
      );
    } catch {
      uncertain = true;
      settleQueued('OUTCOME_UNKNOWN');
      finish(result(r, 'OUTCOME_UNKNOWN', 'OUTCOME_UNKNOWN'));
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (queryRetired) {
        budget.release(item.reservation);
        active = null;
        pump();
        notifyIdle();
      }
    }
  }
  function pump(): void {
    if (active || closed || draining || uncertain) return;
    const next = queue.shift();
    if (next) {
      active = next;
      void run(next);
    }
  }
  return Object.freeze({
    acquire(ownerId: string): ActorCapability | null {
      if (!uuid(ownerId) || owner || closed || uncertain || draining) return null;
      try {
        if (assertOwned() !== true) return null;
      } catch {
        return null;
      }
      if (owner || closed || uncertain || draining) return null;
      owner = Object.freeze({ ownerId });
      return owner;
    },
    execute(cap: ActorCapability, input: unknown): Promise<ActorResult> {
      const r = request(input);
      if (!r) return Promise.resolve(result(null, 'INVALID_REQUEST'));
      const denied = admission(cap, r);
      if (denied) return Promise.resolve(result(r, denied));
      if (
        queue.length >= 64 ||
        active?.request.commandId === r.commandId ||
        queue.some((item) => item.request.commandId === r.commandId)
      )
        return Promise.resolve(result(r, 'BUSY'));
      const reservation = budget.reserve();
      if (!reservation) return Promise.resolve(result(r, 'BUSY'));
      return new Promise((resolve) => {
        queue.push({ request: r, cap, reservation, resolve });
        pump();
      });
    },
    cancel(cap: ActorCapability, commandId: string): boolean {
      if (owner !== cap) return false;
      const index = queue.findIndex(
        (item) => item.request.commandId === commandId && item.cap === cap,
      );
      if (index < 0) return false;
      const item = queue.splice(index, 1)[0];
      if (!item) return false;
      budget.release(item.reservation);
      item.resolve(result(item.request, 'CANCELLED'));
      notifyIdle();
      return true;
    },
    revoke(cap: ActorCapability): void {
      if (owner !== cap) return;
      owner = null;
      draining = true;
      settleQueued('OWNER_REVOKED');
    },
    async takeover(cap: ActorCapability): Promise<boolean> {
      if (owner !== cap || closed || uncertain) return false;
      draining = true;
      settleQueued('CANCELLED');
      if (active) await new Promise<void>((resolve) => idle.push(resolve));
      if (uncertain || closed) return false;
      owner = null;
      draining = false;
      return true;
    },
    async shutdown(): Promise<boolean> {
      closed = true;
      draining = true;
      settleQueued('CLOSED');
      if (uncertain) return false;
      if (active) await new Promise<void>((resolve) => idle.push(resolve));
      if (!uncertain && !active) registered.delete(target.deviceId);
      return !uncertain;
    },
    snapshot() {
      return Object.freeze({
        closed,
        draining,
        uncertain,
        active: active !== null,
        queued: queue.length,
      });
    },
  });
}
