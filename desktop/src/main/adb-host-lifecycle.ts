/** Software-only host orchestration. No binary, endpoint factory or native runner is installed here. */
export type HostOperation =
  | 'HOST_VERSION'
  | 'SERVER_START'
  | 'SERVER_HEALTH'
  | 'SERVER_STOP'
  | 'DISCOVER';
export type HostRequest = Readonly<{
  version: 1;
  commandId: string;
  correlationId: string;
  ownerId: string;
  operation: HostOperation;
  deadlineUtc: number;
}>;
export type HostState = 'STOPPED' | 'STARTING' | 'READY' | 'STOPPING' | 'UNCERTAIN';
export type HostCode =
  | 'OK'
  | 'INVALID_REQUEST'
  | 'NOT_AUTHORIZED'
  | 'BINARY_UNAVAILABLE'
  | 'BUSY'
  | 'DEADLINE'
  | 'NOT_READY'
  | 'CUSTODY_REJECTED'
  | 'TRANSPORT_FAILED'
  | 'INVALID_OBSERVATION'
  | 'RECOVERY_REQUIRED'
  | 'CLOSED'
  | 'INTERNAL_FAILURE';
export type HostResult = Readonly<{
  outcome: 'NOT_DISPATCHED' | 'DISPATCHED_UNCONFIRMED' | 'OBSERVED' | 'OUTCOME_UNKNOWN';
  code: HostCode;
  diagnosticId: string | null;
}>;
export type HostObservation = 'VERSION' | 'STARTED' | 'HEALTHY' | 'STOPPED';
/** Versioned supplied facts; session custody is never invocation retirement. */
export type HostTransportFacts =
  | Readonly<{
      version: 2;
      kind: 'INVOCATION';
      dispatched: boolean;
      processRetired: boolean;
      exitCode: number | null;
      observation: 'VERSION' | null;
    }>
  | Readonly<{
      version: 2;
      kind: 'SESSION';
      dispatched: boolean;
      jobState: 'LIVE' | 'RETIRED' | 'UNKNOWN';
      exitCode: number | null;
      endpointState: 'OWNED' | 'ABSENT' | 'UNKNOWN';
      observation: 'STARTED' | 'HEALTHY' | 'STOPPED' | null;
    }>;
export interface HostOptions {
  transport(request: HostRequest, endpoint: object): Promise<HostTransportFacts>;
  endpoint: object;
  assertOwnedSync(): void;
  binaryAdmitted(): boolean;
  now(): number;
  diagnosticId(): string;
}
export type HostCapability = Readonly<{ hostCapability: true }>;
const OPERATIONS: readonly HostOperation[] = [
  'HOST_VERSION',
  'SERVER_START',
  'SERVER_HEALTH',
  'SERVER_STOP',
  'DISCOVER',
];
const OBSERVATIONS: Readonly<Record<HostOperation, HostObservation | null>> = {
  HOST_VERSION: 'VERSION',
  SERVER_START: 'STARTED',
  SERVER_HEALTH: 'HEALTHY',
  SERVER_STOP: 'STOPPED',
  DISCOVER: null,
};
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
function fields(raw: unknown, names: readonly string[]): Record<string, unknown> | null {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const keys = Reflect.ownKeys(raw);
    if (
      keys.length !== names.length ||
      keys.some((k) => typeof k !== 'string' || !names.includes(k))
    )
      return null;
    const out: Record<string, unknown> = Object.create(null);
    for (const name of names) {
      const d = Object.getOwnPropertyDescriptor(raw, name);
      if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) return null;
      out[name] = d.value;
    }
    return out;
  } catch {
    return null;
  }
}
export function snapshotHostRequest(raw: unknown): HostRequest | null {
  const v = fields(raw, [
    'version',
    'commandId',
    'correlationId',
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
    !OPERATIONS.includes(v.operation as HostOperation) ||
    !integer(v.deadlineUtc)
  )
    return null;
  return Object.freeze({ ...v }) as HostRequest;
}
export function snapshotHostTransportFacts(raw: unknown): HostTransportFacts | null {
  let kind: unknown;
  try {
    kind = Object.getOwnPropertyDescriptor(raw, 'kind')?.value;
  } catch {
    return null;
  }
  const names =
    kind === 'INVOCATION'
      ? ['version', 'kind', 'dispatched', 'processRetired', 'exitCode', 'observation']
      : kind === 'SESSION'
        ? ['version', 'kind', 'dispatched', 'jobState', 'exitCode', 'endpointState', 'observation']
        : null;
  if (!names) return null;
  const v = fields(raw, names);
  if (
    v?.version !== 2 ||
    v.kind !== kind ||
    typeof v.dispatched !== 'boolean' ||
    !(
      v.exitCode === null ||
      (typeof v.exitCode === 'number' &&
        Number.isSafeInteger(v.exitCode) &&
        !Object.is(v.exitCode, -0) &&
        v.exitCode >= -2147483648 &&
        v.exitCode <= 4294967295)
    )
  )
    return null;
  if (kind === 'INVOCATION') {
    if (
      typeof v.processRetired !== 'boolean' ||
      !(v.observation === null || v.observation === 'VERSION')
    )
      return null;
    if (!v.dispatched && (v.exitCode !== null || v.observation !== null)) return null;
    if (!v.processRetired && v.exitCode !== null) return null;
  } else {
    if (
      !['LIVE', 'RETIRED', 'UNKNOWN'].includes(v.jobState as string) ||
      !['OWNED', 'ABSENT', 'UNKNOWN'].includes(v.endpointState as string) ||
      !(
        v.observation === null ||
        ['STARTED', 'HEALTHY', 'STOPPED'].includes(v.observation as string)
      )
    )
      return null;
    if (v.jobState === 'LIVE' && v.exitCode !== null) return null;
    if (!v.dispatched && v.observation !== null) return null;
  }
  return Object.freeze({ ...v }) as HostTransportFacts;
}
export function createHostLifecycle(options: HostOptions) {
  const transport = options.transport.bind(options),
    assertOwned = options.assertOwnedSync.bind(options),
    binary = options.binaryAdmitted.bind(options),
    now = options.now.bind(options),
    diagnostic = options.diagnosticId.bind(options),
    endpoint = options.endpoint;
  if (!endpoint || typeof endpoint !== 'object') throw Error('HOST_CONFIGURATION');
  const capabilities = new WeakMap<object, { ownerId: string; admit: () => void }>();
  let state: HostState = 'STOPPED',
    closed = false,
    active: Promise<HostResult> | null = null;
  let pendingTransport: Promise<HostTransportFacts> | null = null;
  const result = (outcome: HostResult['outcome'], code: HostCode, id: string | null): HostResult =>
    Object.freeze({ outcome, code, diagnosticId: id });
  const current = (cap: HostCapability, request: HostRequest) => {
    const entry = cap && typeof cap === 'object' ? capabilities.get(cap) : undefined;
    if (!entry || entry.ownerId !== request.ownerId) throw Error('HOST_AUTHORITY');
    assertOwned();
    entry.admit();
    assertOwned();
    if (capabilities.get(cap) !== entry) throw Error('HOST_AUTHORITY');
  };
  function grant(ownerId: string, admit: () => void): HostCapability {
    if (closed || !uuid(ownerId) || typeof admit !== 'function') throw Error('HOST_AUTHORITY');
    const cap = Object.freeze({ hostCapability: true as const });
    capabilities.set(cap, { ownerId, admit: admit.bind(undefined) });
    return cap;
  }
  async function run(cap: HostCapability, request: HostRequest, id: string): Promise<HostResult> {
    if (closed) return result('NOT_DISPATCHED', 'CLOSED', id);
    let start: number;
    try {
      current(cap, request);
      start = now();
      if (!integer(start)) throw Error('HOST_CLOCK');
    } catch {
      return result('NOT_DISPATCHED', 'NOT_AUTHORIZED', id);
    }
    if (request.deadlineUtc <= start || request.deadlineUtc - start > 120000)
      return result('NOT_DISPATCHED', 'DEADLINE', id);
    try {
      if (binary() !== true) return result('NOT_DISPATCHED', 'BINARY_UNAVAILABLE', id);
    } catch {
      return result('NOT_DISPATCHED', 'BINARY_UNAVAILABLE', id);
    }
    if (request.operation === 'DISCOVER') return result('NOT_DISPATCHED', 'NOT_READY', id);
    if (state === 'UNCERTAIN') return result('NOT_DISPATCHED', 'RECOVERY_REQUIRED', id);
    if (request.operation === 'SERVER_START' && state !== 'STOPPED')
      return result('NOT_DISPATCHED', 'BUSY', id);
    if (!['HOST_VERSION', 'SERVER_START'].includes(request.operation) && state !== 'READY')
      return result('NOT_DISPATCHED', 'NOT_READY', id);
    const previous = state;
    if (request.operation === 'SERVER_START') state = 'STARTING';
    if (request.operation === 'SERVER_STOP') state = 'STOPPING';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = Object.freeze({ timeout: true });
    try {
      current(cap, request);
      const before = now();
      if (closed) {
        state = previous;
        return result('NOT_DISPATCHED', 'CLOSED', id);
      }
      if (
        !integer(before) ||
        before < start ||
        before >= request.deadlineUtc ||
        request.deadlineUtc - before > 120000
      ) {
        state = previous;
        return result('NOT_DISPATCHED', 'DEADLINE', id);
      }
      try {
        current(cap, request);
      } catch {
        state = previous;
        return result('NOT_DISPATCHED', 'NOT_AUTHORIZED', id);
      }
      if (closed) {
        state = previous;
        return result('NOT_DISPATCHED', 'CLOSED', id);
      }
      // Calling the private adapter is dispatch handoff. Throws/timeouts never imply no effect.
      const work = Promise.resolve(transport(request, endpoint));
      pendingTransport = work;
      void work.then(
        () => {
          if (pendingTransport === work) pendingTransport = null;
        },
        () => {
          if (pendingTransport === work) pendingTransport = null;
        },
      );
      const settled = await Promise.race([
        work,
        new Promise<typeof timeout>((resolve) => {
          timer = setTimeout(() => resolve(timeout), request.deadlineUtc - before);
        }),
      ]);
      if (settled === timeout) {
        state = 'UNCERTAIN';
        return result('OUTCOME_UNKNOWN', 'DEADLINE', id);
      }
      const observed = snapshotHostTransportFacts(settled);
      const expectedKind = request.operation === 'HOST_VERSION' ? 'INVOCATION' : 'SESSION';
      if (!observed || observed.kind !== expectedKind) {
        state = 'UNCERTAIN';
        return result('OUTCOME_UNKNOWN', 'INVALID_OBSERVATION', id);
      }
      if (!observed.dispatched) {
        const unchanged =
          observed.kind === 'INVOCATION'
            ? observed.processRetired
            : previous === 'READY'
              ? observed.jobState === 'LIVE' && observed.endpointState === 'OWNED'
              : observed.jobState === 'RETIRED' && observed.endpointState === 'ABSENT';
        if (!unchanged) {
          state = 'UNCERTAIN';
          return result('OUTCOME_UNKNOWN', 'CUSTODY_REJECTED', id);
        }
        state = previous;
        return result('NOT_DISPATCHED', 'TRANSPORT_FAILED', id);
      }
      try {
        current(cap, request);
        const after = now();
        if (closed) throw Error('HOST_CLOSED');
        if (!integer(after) || after < before || after >= request.deadlineUtc)
          throw Error('HOST_EXPIRED');
        current(cap, request);
        if (closed) throw Error('HOST_CLOSED');
      } catch {
        state = 'UNCERTAIN';
        return result('OUTCOME_UNKNOWN', 'NOT_AUTHORIZED', id);
      }
      const custody =
        observed.kind === 'INVOCATION'
          ? observed.processRetired
          : request.operation === 'SERVER_STOP'
            ? observed.jobState === 'RETIRED' &&
              observed.exitCode !== null &&
              observed.endpointState === 'ABSENT'
            : observed.jobState === 'LIVE' &&
              observed.exitCode === null &&
              observed.endpointState === 'OWNED';
      if (!custody) {
        state = 'UNCERTAIN';
        return result('OUTCOME_UNKNOWN', 'CUSTODY_REJECTED', id);
      }
      if (
        (observed.kind === 'INVOCATION' && observed.exitCode !== 0) ||
        observed.observation !== OBSERVATIONS[request.operation]
      ) {
        state = 'UNCERTAIN';
        return result('DISPATCHED_UNCONFIRMED', 'INVALID_OBSERVATION', id);
      }
      state =
        request.operation === 'SERVER_START'
          ? 'READY'
          : request.operation === 'SERVER_STOP'
            ? 'STOPPED'
            : previous;
      return result('OBSERVED', 'OK', id);
    } catch {
      state = 'UNCERTAIN';
      return result('OUTCOME_UNKNOWN', 'TRANSPORT_FAILED', id);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  function execute(cap: HostCapability, raw: unknown): Promise<HostResult> {
    let id: string | null = null;
    try {
      const value = diagnostic();
      if (uuid(value)) id = value;
    } catch {}
    if (id === null) return Promise.resolve(result('NOT_DISPATCHED', 'INTERNAL_FAILURE', null));
    const request = snapshotHostRequest(raw);
    if (!request) return Promise.resolve(result('NOT_DISPATCHED', 'INVALID_REQUEST', id));
    if (closed) return Promise.resolve(result('NOT_DISPATCHED', 'CLOSED', id));
    if (active || pendingTransport) return Promise.resolve(result('NOT_DISPATCHED', 'BUSY', id));
    // Reserve the lane before running any injected callback (including reentrant ones).
    const work = Promise.resolve().then(() => run(cap, request, id));
    active = work;
    void work.then(
      () => {
        if (active === work) active = null;
      },
      () => {
        if (active === work) active = null;
      },
    );
    return work;
  }
  let closing: Promise<Readonly<{ state: HostState; ownedServerRetained: boolean }>> | null = null;
  function shutdown() {
    if (closing) return closing;
    closed = true;
    closing = (async () => {
      if (active) await active;
      if (pendingTransport) await pendingTransport.catch(() => undefined);
      return Object.freeze({ state, ownedServerRetained: state !== 'STOPPED' });
    })();
    return closing;
  }
  return Object.freeze({
    grant,
    execute,
    shutdown,
    snapshot: () =>
      Object.freeze({ state, busy: active !== null || pendingTransport !== null, closed }),
  });
}
