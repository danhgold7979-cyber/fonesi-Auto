/** Private source-only server controller. No application activation or persistent audit binding. */
import { snapshotHostRequest } from './adb-host-lifecycle.ts';
import type { HostRequest, HostResult, HostState } from './adb-host-lifecycle.ts';
import { isRealHostFactory, type createHostFactory } from './adb-host-factory.ts';
import { parseAdbServerDiscovery } from './adb-discovery.ts';
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
  | 'acquireDiscovery'
  | 'assertDiscoveryEpochCurrent'
  | 'discoveryEpochWitness'
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
export type OwnedDiscoveryProvider = Readonly<{ ownedDiscovery: true }>;
export type OwnedDiscoveryRequest = Readonly<{
  requestId: string;
  epoch: object;
  sequence: number;
  deadlineUtc: number;
}>;
type OwnedProviderRecord = Readonly<{
  epoch: object;
  revoked: boolean;
  source: 'ADB_DISCOVERY';
  current(): void;
  finalCurrent(): boolean;
  begin(
    request: OwnedDiscoveryRequest,
  ): Readonly<{ result: Promise<unknown>; retirement: Promise<unknown> }>;
}>;
const ownedProviders = new WeakMap<object, OwnedProviderRecord>();
export function inspectOwnedDiscoveryProvider(value: unknown): OwnedProviderRecord | null {
  return value !== null && typeof value === 'object' ? (ownedProviders.get(value) ?? null) : null;
}
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
    startObserved = false,
    discoveryRevoked = false,
    discoveryCalls = 0,
    discoveryProviderValue: OwnedDiscoveryProvider | null = null,
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
    discoveryRevoked = true;
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
        if (kind === 'SERVER_STOP') discoveryRevoked = true;
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
        if (kind === 'SERVER_START' && r.outcome === 'OBSERVED' && r.code === 'OK')
          startObserved = true;
        if (r.outcome !== 'OBSERVED') discoveryRevoked = true;
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
  function discoveryProvider(): OwnedDiscoveryProvider {
    if (!isRealHostFactory(factory) || !startObserved || active || closed || discoveryRevoked)
      throw Error('NOT_READY');
    fence();
    assertCurrentSession();
    if (closed || discoveryRevoked) throw Error('NOT_READY');
    if (discoveryProviderValue) return discoveryProviderValue;
    const epoch = Object.freeze({});
    const failed = () =>
      Object.freeze({
        outcome: 'FAILED',
        raw: null,
        observedAtUtc: null,
        stdoutTruncated: false,
        stderrTruncated: false,
      });
    const refusal = () =>
      Object.freeze({
        result: Promise.resolve(failed()),
        retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
      });
    const acquire = factory.acquireDiscovery.bind(factory);
    const assertEpochCurrent = factory.assertDiscoveryEpochCurrent.bind(factory);
    const epochWitness = factory.discoveryEpochWitness();
    const currentEpoch = (requireIdleProof = false) => {
      try {
        fence();
        now();
        if (!active || requireIdleProof) assertEpochCurrent();
        if (closed || discoveryRevoked) throw Error();
      } catch {
        discoveryRevoked = true;
        void close();
        throw Error('EPOCH_REVOKED');
      }
    };
    const provider = Object.freeze({ ownedDiscovery: true as const });
    const record: OwnedProviderRecord = Object.freeze({
      epoch,
      source: 'ADB_DISCOVERY' as const,
      get revoked() {
        return discoveryRevoked || closed;
      },
      current: currentEpoch,
      finalCurrent: () => !discoveryRevoked && !closed && epochWitness.valid,
      begin(input: OwnedDiscoveryRequest) {
        let request: OwnedDiscoveryRequest;
        try {
          const d = Object.getOwnPropertyDescriptors(input);
          const keys = ['requestId', 'epoch', 'sequence', 'deadlineUtc'];
          if (
            !Object.isFrozen(input) ||
            Reflect.ownKeys(d).length !== keys.length ||
            keys.some((key) => !d[key] || !('value' in d[key]) || !d[key].enumerable)
          )
            return refusal();
          if (
            !uuid(d.requestId.value) ||
            d.epoch.value !== epoch ||
            typeof d.sequence.value !== 'number' ||
            !Number.isSafeInteger(d.sequence.value) ||
            d.sequence.value < 1 ||
            typeof d.deadlineUtc.value !== 'number' ||
            !Number.isSafeInteger(d.deadlineUtc.value)
          )
            return refusal();
          request = Object.freeze({
            requestId: d.requestId.value,
            epoch: d.epoch.value,
            sequence: d.sequence.value,
            deadlineUtc: d.deadlineUtc.value,
          });
        } catch {
          return refusal();
        }
        if (active) return refusal();
        if (closed || discoveryRevoked || request.epoch !== epoch) return refusal();
        let release: () => void = () => {};
        active = new Promise<void>((resolve) => {
          release = resolve;
        });
        let resultResolve!: (value: unknown) => void;
        let retireResolve!: (value: unknown) => void;
        let retireReject!: (error: Error) => void;
        const result = new Promise<unknown>((resolve) => {
          resultResolve = resolve;
        });
        const retirement = new Promise<unknown>((resolve, reject) => {
          retireResolve = resolve;
          retireReject = reject;
        });
        // Reader may observe result first; keep the rejection handled before returning both promises.
        void retirement.catch(() => undefined);
        void Promise.resolve().then(async () => {
          let nativeStarted = false;
          let cleanupWork: Promise<boolean> | null = null;
          const cleanup = () => {
            discoveryRevoked = true;
            if (!cleanupWork) {
              try {
                cleanupWork = Promise.resolve(retire()).then(
                  (status) => status === 'RETIRED' && factory.retired,
                  () => false,
                );
              } catch {
                cleanupWork = Promise.resolve(false);
              }
            }
            return cleanupWork;
          };
          try {
            currentEpoch(true);
            const start = now();
            if (
              !Number.isSafeInteger(request.deadlineUtc) ||
              request.deadlineUtc <= start ||
              request.deadlineUtc - start > 30000 ||
              discoveryCalls >= 128
            ) {
              resultResolve(failed());
              retireResolve(Object.freeze({ status: 'RETIRED' }));
              return;
            }
            currentEpoch(true);
            discoveryCalls++;
            nativeStarted = true;
            const handle = acquire(grant, Object.freeze({ deadlineUtc: request.deadlineUtc }));
            const resultWork = handle.result.then(
              (value) => {
                if (value.status !== 'COMPLETE' || !value.operationRetired) void cleanup();
                return value;
              },
              (error) => {
                void cleanup();
                throw error;
              },
            );
            const retirementWork = handle.retirement.then(
              (value) => {
                if (value.status !== 'RETIRED') void cleanup();
                return value;
              },
              (error) => {
                void cleanup();
                throw error;
              },
            );
            const [observed, retiredOperation] = await Promise.allSettled([
              resultWork,
              retirementWork,
            ]);
            if (observed.status !== 'fulfilled' || retiredOperation.status !== 'fulfilled')
              throw Error('UNRETIRED');
            const response = observed.value,
              settlement = retiredOperation.value;
            if (
              response.status !== 'COMPLETE' ||
              response.code !== 'OK' ||
              !response.operationRetired ||
              settlement.status !== 'RETIRED' ||
              response.payloadBase64 === null ||
              response.observedAtUtc === null
            )
              throw Error('DISCOVERY_REJECTED');
            const bytes = Buffer.from(response.payloadBase64, 'base64');
            if (bytes.length > 32768 || bytes.toString('base64') !== response.payloadBase64)
              throw Error('DISCOVERY_REJECTED');
            const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            const parsed = parseAdbServerDiscovery(raw);
            const completion = now();
            if (
              !parsed.ok ||
              response.observedAtUtc < start ||
              response.observedAtUtc > completion ||
              response.observedAtUtc > request.deadlineUtc
            )
              throw Error('DISCOVERY_REJECTED');
            currentEpoch(true);
            if (
              closed ||
              discoveryRevoked ||
              lastClock === null ||
              lastClock >= request.deadlineUtc
            )
              throw Error('EPOCH_REVOKED');
            resultResolve(
              Object.freeze({
                outcome: 'COMPLETE',
                raw,
                observedAtUtc: response.observedAtUtc,
                stdoutTruncated: false,
                stderrTruncated: false,
              }),
            );
            retireResolve(Object.freeze({ status: 'RETIRED' }));
          } catch {
            discoveryRevoked = true;
            // Cleanup is independent of this service lane; never await service.close here.
            let retired = false;
            try {
              retired = await cleanup();
            } catch {}
            resultResolve(failed());
            if (retired || !nativeStarted) retireResolve(Object.freeze({ status: 'RETIRED' }));
            else retireReject(Error('UNRETIRED'));
          } finally {
            active = null;
            release();
          }
        });
        return Object.freeze({ result, retirement });
      },
    });
    ownedProviders.set(provider, record);
    discoveryProviderValue = provider;
    return provider;
  }
  return Object.freeze({
    start: () => operation('SERVER_START'),
    health: () => operation('SERVER_HEALTH'),
    stop: () => operation('SERVER_STOP'),
    snapshot,
    discoveryProvider,
    close,
    get retired() {
      return closed && factory.retired && active === null && audits.size === 0;
    },
  });
}
