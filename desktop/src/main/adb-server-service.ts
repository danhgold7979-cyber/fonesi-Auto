/** Private source-only server controller. No application activation or persistent audit binding. */
import { snapshotHostRequest } from './adb-host-lifecycle.ts';
import type { HostRequest, HostResult, HostState } from './adb-host-lifecycle.ts';
import type { createHostFactory } from './adb-host-factory.ts';
type Health = 'AVAILABLE' | 'DEGRADED';
type Factory = Pick<
  ReturnType<typeof createHostFactory>,
  | 'grant'
  | 'execute'
  | 'snapshot'
  | 'close'
  | 'retired'
  | 'assertCurrentSession'
  | 'assertRetiredSession'
>;
export type ServerAudit = Readonly<{
  phase: 'INTENT' | 'RESULT';
  request: HostRequest;
  result: HostResult | null;
  state: HostState;
}>;
export type ServerReceipt =
  | Readonly<{ kind: 'OPERATION'; result: HostResult; auditHealth: Health }>
  | Readonly<{ kind: 'CLEANUP'; status: 'RETIRED' | 'UNRETIRED'; auditHealth: Health }>;
const codes = [
  'OK',
  'INVALID_REQUEST',
  'NOT_AUTHORIZED',
  'BINARY_UNAVAILABLE',
  'BUSY',
  'DEADLINE',
  'NOT_READY',
  'CUSTODY_REJECTED',
  'TRANSPORT_FAILED',
  'INVALID_OBSERVATION',
  'RECOVERY_REQUIRED',
  'CLOSED',
  'INTERNAL_FAILURE',
] as const;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function observed(value: unknown): HostResult | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 3 ||
      keys.some((k) => !['outcome', 'code', 'diagnosticId'].includes(k as string))
    )
      return null;
    const d = Object.getOwnPropertyDescriptors(value);
    if (Object.values(d).some((x) => !('value' in x) || !x.enumerable)) return null;
    if (!d.outcome || !d.code || !d.diagnosticId) return null;
    const outcome = d.outcome.value,
      code = d.code.value,
      diagnosticId = d.diagnosticId.value;
    if (
      !['NOT_DISPATCHED', 'DISPATCHED_UNCONFIRMED', 'OBSERVED', 'OUTCOME_UNKNOWN'].includes(
        outcome,
      ) ||
      !codes.includes(code) ||
      (diagnosticId !== null && !uuid(diagnosticId)) ||
      (outcome === 'OBSERVED' && code !== 'OK')
    )
      return null;
    return Object.freeze({ outcome, code, diagnosticId });
  } catch {
    return null;
  }
}
export function createAdbServerService(
  options: Readonly<{
    ownerId: string;
    expectedInstallationRevision: number;
    assertOwnedSync(): void;
    assertCurrentSync(): void;
    clock(): number;
    newId(): string;
    createFactory(expectedInstallationRevision: number, operationSet: 'SERVER_ONLY'): Factory;
    audit(record: ServerAudit): Promise<Health>;
  }>,
) {
  const ownerId = options.ownerId,
    revision = options.expectedInstallationRevision,
    owned = options.assertOwnedSync.bind(options),
    current = options.assertCurrentSync.bind(options),
    clock = options.clock.bind(options),
    next = options.newId.bind(options),
    audit = options.audit.bind(options),
    build = options.createFactory.bind(options);
  if (!uuid(ownerId) || !Number.isSafeInteger(revision) || revision < 1)
    throw Error('INVALID_REQUEST');
  let closed = false,
    active: Promise<void> | null = null,
    closing: Promise<ServerReceipt> | null = null,
    started = false,
    healthCalls = 0,
    auditDegraded = false;
  const ids = new Set<string>(),
    audits = new Set<Promise<Health>>();
  function fence() {
    if (closed) throw Error('CLOSED');
    owned();
    current();
    owned();
    if (closed) throw Error('CLOSED');
  }
  fence();
  const factory = build(revision, 'SERVER_ONLY');
  fence();
  const grant = factory.grant(ownerId, fence);
  fence();
  const snapshot = factory.snapshot.bind(factory),
    execute = factory.execute.bind(factory),
    retire = factory.close.bind(factory),
    assertCurrentSession = factory.assertCurrentSession.bind(factory),
    assertRetiredSession = factory.assertRetiredSession.bind(factory);
  const result = (
    code: HostResult['code'],
    outcome: HostResult['outcome'] = 'NOT_DISPATCHED',
  ): HostResult => Object.freeze({ outcome, code, diagnosticId: null });
  const receipt = (r: HostResult, health: Health = 'DEGRADED'): ServerReceipt =>
    Object.freeze({ kind: 'OPERATION', result: r, auditHealth: health });
  function id() {
    if (ids.size >= 65536) throw Error('INTERNAL_FAILURE');
    const v = next();
    if (!uuid(v) || ids.has(v)) throw Error('INTERNAL_FAILURE');
    ids.add(v);
    fence();
    return v;
  }
  let lastClock: number | null = null;
  function now() {
    const v = clock();
    fence();
    if (
      !Number.isSafeInteger(v) ||
      v < 0 ||
      Object.is(v, -0) ||
      (lastClock !== null && v < lastClock)
    )
      throw Error('INTERNAL_FAILURE');
    lastClock = v;
    return v;
  }
  function log(
    request: HostRequest,
    phase: 'INTENT' | 'RESULT',
    r: HostResult | null,
  ): Promise<Health> {
    const record = Object.freeze({ phase, request, result: r, state: snapshot().state });
    const work = Promise.resolve()
      .then(() => audit(record))
      .then(
        (v) => (v === 'AVAILABLE' ? ('AVAILABLE' as const) : ('DEGRADED' as const)),
        () => 'DEGRADED' as const,
      );
    audits.add(work);
    void work.then((h) => {
      if (h === 'DEGRADED') auditDegraded = true;
      audits.delete(work);
    });
    return work;
  }
  function close(): Promise<ServerReceipt> {
    if (closing) return closing;
    closed = true;
    let settleClose: (value: ServerReceipt) => void = () => {};
    closing = new Promise<ServerReceipt>((resolve) => {
      settleClose = resolve;
    });
    // Begin retained cleanup before waiting on any audit or ordinary operation.
    let cleanup: Promise<'RETIRED' | 'UNRETIRED'>;
    try {
      cleanup = Promise.resolve(retire()).catch(() => 'UNRETIRED' as const);
    } catch {
      cleanup = Promise.resolve('UNRETIRED');
    }
    const ordinary = active;
    const drain = (async () => {
      const status = await cleanup;
      if (ordinary) await ordinary;
      while (audits.size) await Promise.all([...audits]);
      return status;
    })();
    void (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const status = await Promise.race([
          drain,
          new Promise<'UNRETIRED'>((resolve) => {
            timer = setTimeout(() => resolve('UNRETIRED'), 120000);
          }),
        ]);
        return Object.freeze({
          kind: 'CLEANUP' as const,
          status:
            status === 'RETIRED' && factory.retired && active === null && audits.size === 0
              ? ('RETIRED' as const)
              : ('UNRETIRED' as const),
          auditHealth:
            auditDegraded || audits.size ? ('DEGRADED' as const) : ('AVAILABLE' as const),
        });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    })().then(settleClose);
    return closing;
  }
  function operation(
    kind: 'SERVER_START' | 'SERVER_HEALTH' | 'SERVER_STOP',
  ): Promise<ServerReceipt> {
    if (closed)
      return kind === 'SERVER_STOP' ? close() : Promise.resolve(receipt(result('CLOSED')));
    if (active) return kind === 'SERVER_STOP' ? close() : Promise.resolve(receipt(result('BUSY')));
    let finish: () => void = () => {};
    active = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let expired = false,
      dispatched = false;
    const work = (async (): Promise<ServerReceipt> => {
      // Yield only after the lane is reserved, before any injected allocator/clock/audit.
      await Promise.resolve();
      try {
        try {
          fence();
        } catch {
          void close();
          return receipt(result('NOT_AUTHORIZED'));
        }
        if (kind === 'SERVER_START' && started) return receipt(result('NOT_READY'));
        if (kind === 'SERVER_HEALTH' && (!started || snapshot().state !== 'READY'))
          return receipt(result('NOT_READY'));
        if (kind === 'SERVER_HEALTH' && healthCalls >= 128) return receipt(result('BUSY'));
        const start = now();
        if (start > Number.MAX_SAFE_INTEGER - 30000) return receipt(result('INVALID_REQUEST'));
        const request = snapshotHostRequest({
          version: 1,
          commandId: id(),
          correlationId: id(),
          ownerId,
          operation: kind,
          deadlineUtc: start + 30000,
        });
        if (!request) return receipt(result('INVALID_REQUEST'));
        if (kind === 'SERVER_HEALTH') healthCalls++;
        const intentWork = log(request, 'INTENT', null);
        const intent = kind === 'SERVER_STOP' ? 'AVAILABLE' : await intentWork;
        fence();
        if (expired || now() >= request.deadlineUtc) {
          void close();
          return receipt(result('DEADLINE'));
        }
        if (intent !== 'AVAILABLE' && kind !== 'SERVER_STOP')
          return receipt(result('INTERNAL_FAILURE'));
        fence();
        if (kind === 'SERVER_START') started = true;
        dispatched = true;
        const r = observed(await execute(grant, request));
        if (!r) {
          void close();
          return receipt(result('INVALID_OBSERVATION', 'OUTCOME_UNKNOWN'));
        }
        if (r.outcome === 'OUTCOME_UNKNOWN' || r.outcome === 'DISPATCHED_UNCONFIRMED') void close();
        const health = await log(request, 'RESULT', r);
        const actualIntent = await intentWork;
        try {
          fence();
          const publicationAt = now();
          if (r.outcome === 'OBSERVED' && r.code === 'OK') {
            if (kind === 'SERVER_STOP') assertRetiredSession();
            else assertCurrentSession();
          }
          // No external callback after the final retained-token/terminal assertion.
          if (closed || expired || publicationAt >= request.deadlineUtc) throw Error('DEADLINE');
        } catch {
          void close();
          return receipt(result('RECOVERY_REQUIRED', 'OUTCOME_UNKNOWN'));
        }
        return receipt(
          r,
          actualIntent === 'AVAILABLE' && health === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED',
        );
      } catch {
        void close();
        return receipt(
          result(
            closed ? 'CLOSED' : 'NOT_AUTHORIZED',
            dispatched ? 'OUTCOME_UNKNOWN' : 'NOT_DISPATCHED',
          ),
        );
      } finally {
        active = null;
        finish();
        if (timeout !== undefined) clearTimeout(timeout);
      }
    })();
    const deadline = new Promise<ServerReceipt>((resolve) => {
      timeout = setTimeout(() => {
        expired = true;
        void close();
        resolve(receipt(result('DEADLINE', dispatched ? 'OUTCOME_UNKNOWN' : 'NOT_DISPATCHED')));
      }, 30000);
    });
    return Promise.race([work, deadline]).then((r) =>
      kind === 'SERVER_STOP' && closed ? close() : r,
    );
  }
  return Object.freeze({
    start: () => operation('SERVER_START'),
    health: () => operation('SERVER_HEALTH'),
    stop: () => operation('SERVER_STOP'),
    snapshot,
    close,
    get retired() {
      return closed && factory.retired && active === null && audits.size === 0;
    },
  });
}
