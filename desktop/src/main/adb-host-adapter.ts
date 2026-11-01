/** Private injected-provider adapter. No native provider or execution issuer is wired in main. */
import { createHostLifecycle, snapshotHostTransportFacts } from './adb-host-lifecycle.ts';
import type { HostCapability, HostResult, HostTransportFacts } from './adb-host-lifecycle.ts';
import { compileHostPlan } from './adb-host-plan.ts';
import type {
  PlatformToolsRuntimeCustody,
  RuntimeReadObservation,
} from './platform-tools-runtime-custody.ts';
export interface HostNativeProvider {
  reserveAttempt(kind: 'VERSION' | 'FOREGROUND'): object;
  version(attempt: object, runtime: RuntimeReadObservation): Promise<HostTransportFacts>;
  startForeground(attempt: object, runtime: RuntimeReadObservation): Promise<HostTransportFacts>;
  health(attempt: object): Promise<HostTransportFacts>;
  retire(attempt: object): Promise<HostTransportFacts>;
}
type Attempt = { token: object; kind: 'VERSION' | 'FOREGROUND'; terminal: boolean };
export function createHostAdapter(
  options: Readonly<{
    runtimeCustody: Pick<
      PlatformToolsRuntimeCustody,
      'acquireRead' | 'revalidateRead' | 'assertRead' | 'releaseRead'
    >;
    nativeProvider: HostNativeProvider;
    operationSet?: 'VERSION_ONLY' | 'SERVER_ONLY';
    assertOwnedSync(): void;
    now(): number;
    diagnosticId(): string;
  }>,
) {
  const operationSet = options.operationSet;
  if (
    operationSet !== undefined &&
    operationSet !== 'VERSION_ONLY' &&
    operationSet !== 'SERVER_ONLY'
  )
    throw Error('HOST_SCOPE');
  const custody = options.runtimeCustody,
    owned = options.assertOwnedSync.bind(options),
    clock = options.now.bind(options),
    diagnostic = options.diagnosticId.bind(options),
    provider = options.nativeProvider;
  const reserve = provider.reserveAttempt.bind(provider),
    version = provider.version.bind(provider),
    start = provider.startForeground.bind(provider),
    health = provider.health.bind(provider),
    retire = provider.retire.bind(provider);
  const capabilities = new WeakMap<object, { ownerId: string; admit(): void }>();
  const attempts = new WeakSet<object>();
  const works = new Set<Promise<unknown>>();
  let read: object | null = null,
    observation: RuntimeReadObservation | null = null,
    attempt: Attempt | null = null,
    context: HostCapability | null = null,
    busy = false,
    closed = false,
    uncertain = false,
    releaseUncertain = false,
    releasing: Promise<void> | null = null,
    closing: Promise<'RETIRED' | 'UNRETIRED'> | null = null;
  let executionDone: Promise<void> = Promise.resolve();
  let finishExecution: (() => void) | null = null;
  const uuid = (s: unknown): s is string =>
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
  function result(code: HostResult['code']): HostResult {
    let id: string | null = null;
    try {
      const value = diagnostic();
      if (uuid(value)) id = value;
    } catch {}
    return Object.freeze({
      outcome: 'NOT_DISPATCHED',
      code: id === null ? 'INTERNAL_FAILURE' : code,
      diagnosticId: id,
    });
  }
  function current(cap: HostCapability, ownerId: string) {
    const entry = cap && typeof cap === 'object' ? capabilities.get(cap) : undefined;
    if (!entry || entry.ownerId !== ownerId || closed || uncertain) throw Error('HOST_AUTHORITY');
    owned();
    entry.admit();
    owned();
    if (read !== null) custody.assertRead(read);
    owned();
    if (closed || uncertain || capabilities.get(cap) !== entry) throw Error('HOST_AUTHORITY');
  }
  function terminal(raw: unknown, a: Attempt): boolean {
    const f = snapshotHostTransportFacts(raw);
    if (!f) return false;
    if (a.kind === 'VERSION')
      return (
        f.kind === 'INVOCATION' &&
        f.processRetired &&
        (f.dispatched ? f.exitCode !== null : f.exitCode === null && f.observation === null)
      );
    return (
      f.kind === 'SESSION' &&
      f.jobState === 'RETIRED' &&
      f.endpointState === 'ABSENT' &&
      (f.dispatched ? f.exitCode !== null : f.exitCode === null && f.observation === null)
    );
  }
  async function releaseIfRetired() {
    if (releaseUncertain) return;
    if (releasing) {
      await releasing;
      return;
    }
    if (works.size || (attempt && !attempt.terminal) || read === null) return;
    const token = read;
    releasing = (async () => {
      let r: Awaited<ReturnType<PlatformToolsRuntimeCustody['releaseRead']>>;
      try {
        r = await custody.releaseRead(token);
      } catch {
        uncertain = true;
        releaseUncertain = true;
        return;
      }
      if (!r.ok || r.status !== 'RETIRED') {
        uncertain = true;
        releaseUncertain = true;
        return;
      }
      if (read === token) {
        read = null;
        observation = null;
        attempt = null;
      }
    })();
    try {
      await releasing;
    } finally {
      releasing = null;
    }
  }
  function invoke(
    a: Attempt,
    call: () => Promise<HostTransportFacts>,
  ): Promise<HostTransportFacts> {
    // Register the promise before any provider effect, including synchronous throws.
    const work = Promise.resolve()
      .then(call)
      .then((raw) => {
        const snapshot = snapshotHostTransportFacts(raw);
        if (!snapshot) throw Error('HOST_FACTS');
        return snapshot;
      });
    works.add(work);
    void work.then(
      (value) => {
        a.terminal = terminal(value, a);
        works.delete(work);
        void releaseIfRetired();
      },
      () => {
        a.terminal = false;
        uncertain = true;
        works.delete(work);
      },
    );
    return work;
  }
  const engine = createHostLifecycle({
    endpoint: Object.freeze({}),
    assertOwnedSync: owned,
    now: clock,
    diagnosticId: diagnostic,
    binaryAdmitted: () => read !== null && observation !== null && !closed && !uncertain,
    async transport(request) {
      const cap = context;
      if (!cap || !observation || !read) throw Error('HOST_AUTHORITY');
      const plan = compileHostPlan(request);
      if (!plan.ok) throw Error('HOST_PLAN');
      current(cap, request.ownerId);
      if (plan.plan.kind === 'VERSION' || plan.plan.kind === 'FOREGROUND') {
        if (attempt) throw Error('HOST_BUSY');
        const token = reserve(plan.plan.kind);
        if (!token || typeof token !== 'object' || attempts.has(token)) throw Error('HOST_ATTEMPT');
        attempts.add(token);
        const a: Attempt = { token, kind: plan.plan.kind, terminal: false };
        attempt = a;
        current(cap, request.ownerId);
        const runtime = observation;
        return invoke(a, () => {
          current(cap, request.ownerId);
          return a.kind === 'VERSION' ? version(a.token, runtime) : start(a.token, runtime);
        });
      }
      const a = attempt;
      if (a?.kind !== 'FOREGROUND' || a.terminal) throw Error('HOST_ATTEMPT');
      if (plan.plan.kind === 'HEALTH')
        return invoke(a, () => {
          current(cap, request.ownerId);
          return health(a.token);
        });
      return invoke(a, () => retire(a.token));
    },
  });
  return Object.freeze({
    snapshot: engine.snapshot,
    grant(ownerId: string, admit: () => void): HostCapability {
      if (closed || uncertain || !uuid(ownerId) || typeof admit !== 'function')
        throw Error('HOST_AUTHORITY');
      const callback = admit.bind(undefined);
      const cap = engine.grant(ownerId, callback);
      capabilities.set(cap, { ownerId, admit: callback });
      return cap;
    },
    async execute(cap: HostCapability, raw: unknown): Promise<HostResult> {
      const plan = compileHostPlan(raw);
      if (!plan.ok) return result(plan.code);
      if (
        (operationSet === 'VERSION_ONLY' &&
          plan.plan.kind !== 'VERSION' &&
          plan.plan.kind !== 'RETIRE') ||
        (operationSet === 'SERVER_ONLY' && plan.plan.kind === 'VERSION')
      )
        return result('NOT_READY');
      if (closed) return result('CLOSED');
      if (uncertain) return result('RECOVERY_REQUIRED');
      if (busy || works.size || releasing || (plan.plan.kind === 'VERSION' && attempt !== null))
        return result('BUSY');
      busy = true;
      executionDone = new Promise<void>((resolve) => {
        finishExecution = resolve;
      });
      try {
        current(cap, plan.plan.request.ownerId);
        const admission =
          read === null ? await custody.acquireRead() : await custody.revalidateRead(read);
        if (!admission.ok)
          return result(
            admission.code === 'BUSY'
              ? 'BUSY'
              : admission.code === 'BINARY_UNAVAILABLE'
                ? 'BINARY_UNAVAILABLE'
                : 'CUSTODY_REJECTED',
          );
        read = admission.token;
        observation = admission.observation;
        current(cap, plan.plan.request.ownerId);
        context = cap;
        return await engine.execute(cap, plan.plan.request);
      } catch {
        return result('NOT_AUTHORIZED');
      } finally {
        context = null;
        busy = false;
        await releaseIfRetired();
        finishExecution?.();
        finishExecution = null;
      }
    },
    close(): Promise<'RETIRED' | 'UNRETIRED'> {
      if (closing) return closing;
      closed = true;
      const logical = engine.shutdown();
      const a = attempt;
      // Cleanup capability is the exact pre-handoff token, independent of revoked caller grants.
      const cleanup = a && !a.terminal ? invoke(a, () => retire(a.token)) : Promise.resolve(null);
      closing = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            (async () => {
              await Promise.allSettled([logical, cleanup, executionDone, ...works]);
              // A reentrant close inside effect-free reserveAttempt may precede token return.
              // After all in-flight observations settle, require fresh terminal evidence if
              // a late LIVE observation contradicted the initial retirement response.
              // This is one cleanup-only confirmation, never a start/health replay.
              const late = attempt;
              if (late && !late.terminal)
                await Promise.allSettled([invoke(late, () => retire(late.token))]);
              await releaseIfRetired();
              return read === null && works.size === 0 && attempt === null && !busy
                ? ('RETIRED' as const)
                : ('UNRETIRED' as const);
            })(),
            new Promise<'UNRETIRED'>((resolve) => {
              timer = setTimeout(() => resolve('UNRETIRED'), 120000);
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      })();
      return closing;
    },
    get retired() {
      return read === null && attempt === null && works.size === 0 && !busy && releasing === null;
    },
  });
}
