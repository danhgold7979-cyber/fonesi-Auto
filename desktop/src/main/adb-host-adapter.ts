import { inspectRegistryVideoBinding } from './registry-store.ts';
import {
  snapshotVideo,
  snapshotVideoStart,
  type VideoSnapshot,
  type VideoMediaSink,
  type VideoStart,
} from './video-contract.ts';
import { inspectFleetActiveInputIntent } from './fleet-service.ts';
import {
  snapshotInputQueryFacts,
  validInputAction,
  type InputQueryFacts,
  type InputQueryAction,
  type InputQueryHandle,
} from './input-query-contract.ts';
import {
  snapshotMetadataQueryFacts,
  validMetadataDeadline,
  validMetadataField,
  validMetadataTransportId,
  type MetadataQueryFacts,
  type MetadataQueryField,
  type MetadataQueryHandle,
} from './metadata-query-contract.ts';
/** Private injected-provider adapter. No native provider or execution issuer is wired in main. */
import { createHostLifecycle, snapshotHostTransportFacts } from './adb-host-lifecycle.ts';
import type { HostCapability, HostResult, HostTransportFacts } from './adb-host-lifecycle.ts';
import { compileHostPlan } from './adb-host-plan.ts';
import type {
  PlatformToolsRuntimeCustody,
  RuntimeReadObservation,
} from './platform-tools-runtime-custody.ts';
export type HostAcquisitionFacts = Readonly<{
  version: 1;
  kind: 'ACQUISITION';
  status: 'COMPLETE' | 'FAILED' | 'UNRETIRED';
  code:
    | 'OK'
    | 'ADMISSION_REJECTED'
    | 'BUSY'
    | 'CLOSED'
    | 'DEADLINE'
    | 'DISCOVERY_REJECTED'
    | 'NATIVE_FAILED'
    | 'UNRETIRED';
  dispatched: boolean;
  operationRetired: boolean;
  payloadBase64: string | null;
  observedAtUtc: number | null;
}>;
export type HostAcquisitionHandle = Readonly<{
  result: Promise<HostAcquisitionFacts>;
  retirement: Promise<Readonly<{ status: 'RETIRED' | 'UNRETIRED' }>>;
}>;
export function snapshotHostAcquisitionFacts(raw: unknown): HostAcquisitionFacts | null {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const d = Object.getOwnPropertyDescriptors(raw),
      keys = [
        'version',
        'kind',
        'status',
        'code',
        'dispatched',
        'operationRetired',
        'payloadBase64',
        'observedAtUtc',
      ];
    if (
      Reflect.ownKeys(d).length !== keys.length ||
      keys.some((k) => !d[k] || !('value' in d[k]) || !d[k].enumerable)
    )
      return null;
    const v = Object.fromEntries(keys.map((k) => [k, d[k]?.value]));
    if (
      v.version !== 1 ||
      v.kind !== 'ACQUISITION' ||
      typeof v.dispatched !== 'boolean' ||
      typeof v.operationRetired !== 'boolean'
    )
      return null;
    if (v.status === 'COMPLETE') {
      if (
        v.code !== 'OK' ||
        !v.dispatched ||
        !v.operationRetired ||
        typeof v.payloadBase64 !== 'string' ||
        v.payloadBase64.length > 43692 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.payloadBase64) ||
        !Number.isSafeInteger(v.observedAtUtc) ||
        v.observedAtUtc < 0 ||
        Object.is(v.observedAtUtc, -0)
      )
        return null;
      const bytes = Buffer.from(v.payloadBase64, 'base64');
      if (
        bytes.length > 32768 ||
        bytes.toString('base64') !== v.payloadBase64 ||
        (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
      )
        return null;
      if (new TextDecoder('utf-8', { fatal: true }).decode(bytes).includes('\0')) return null;
    } else if (v.status === 'FAILED') {
      if (
        ![
          'ADMISSION_REJECTED',
          'BUSY',
          'CLOSED',
          'DEADLINE',
          'DISCOVERY_REJECTED',
          'NATIVE_FAILED',
        ].includes(v.code) ||
        !v.operationRetired ||
        v.payloadBase64 !== null ||
        v.observedAtUtc !== null
      )
        return null;
    } else if (v.status === 'UNRETIRED') {
      if (
        v.code !== 'UNRETIRED' ||
        v.operationRetired ||
        v.payloadBase64 !== null ||
        v.observedAtUtc !== null
      )
        return null;
    } else return null;
    return Object.freeze(v) as HostAcquisitionFacts;
  } catch {
    return null;
  }
}
export interface HostNativeProvider {
  videoStart?(attempt: object, request: VideoStart, media?: VideoMediaSink): Promise<VideoSnapshot>;
  videoStatus?(attempt: object, videoId: string): Promise<VideoSnapshot>;
  videoStop?(attempt: object, videoId: string): Promise<VideoSnapshot>;
  reserveAttempt(kind: 'VERSION' | 'FOREGROUND'): object;
  version(attempt: object, runtime: RuntimeReadObservation): Promise<HostTransportFacts>;
  startForeground(attempt: object, runtime: RuntimeReadObservation): Promise<HostTransportFacts>;
  health(attempt: object): Promise<HostTransportFacts>;
  retire(attempt: object): Promise<HostTransportFacts>;
  discover?(attempt: object, deadlineUtc: number): Promise<HostAcquisitionFacts>;
  input?(
    attempt: object,
    transportId: string,
    action: InputQueryAction,
    deadlineUtc: number,
  ): Promise<InputQueryFacts>;
  metadata?(
    attempt: object,
    transportId: string,
    field: MetadataQueryField,
    deadlineUtc: number,
  ): Promise<MetadataQueryFacts>;
}
type Attempt = {
  capability: HostCapability;
  observedUtc: number | null;
  queries: number;
  token: object;
  kind: 'VERSION' | 'FOREGROUND';
  terminal: boolean;
};
export function createHostAdapter(
  options: Readonly<{
    runtimeCustody: Pick<
      PlatformToolsRuntimeCustody,
      'acquireRead' | 'revalidateRead' | 'assertRead' | 'assertReadInternal' | 'releaseRead'
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
    retire = provider.retire.bind(provider),
    discover = provider.discover?.bind(provider),
    metadata = provider.metadata?.bind(provider),
    input = provider.input?.bind(provider),
    videoStart = provider.videoStart?.bind(provider),
    videoStatus = provider.videoStatus?.bind(provider),
    videoStop = provider.videoStop?.bind(provider);
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
        const a: Attempt = {
          capability: cap,
          token,
          kind: plan.plan.kind,
          terminal: false,
          queries: 0,
          observedUtc: null,
        };
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
  function acquireQuery(
    cap: HostCapability,
    raw: unknown,
    kind: 'DISCOVER' | 'METADATA' | 'INPUT',
  ): HostAcquisitionHandle | MetadataQueryHandle | InputQueryHandle {
    if (
      operationSet !== 'SERVER_ONLY' ||
      closed ||
      uncertain ||
      busy ||
      works.size ||
      releasing ||
      !(kind === 'INPUT' ? input : kind === 'METADATA' ? metadata : discover)
    )
      throw Error('HOST_DISCOVERY_REJECTED');
    // Same ordinary lane as execute; reserve before any injected callback.
    busy = true;
    executionDone = new Promise<void>((resolve) => {
      finishExecution = resolve;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let queryAttempt: Attempt | null = null;
    let expire: (reason: Error) => void;
    const deadline = new Promise<never>((_resolve, reject) => {
      expire = reject;
    });
    let deadlineUtc: unknown;
    let transportId: unknown;
    let field: unknown;
    let activeIntent: unknown;
    let validRequest = false;
    try {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const d = Object.getOwnPropertyDescriptors(raw);
        if (
          Reflect.ownKeys(d).length === (kind === 'INPUT' ? 4 : kind === 'METADATA' ? 3 : 1) &&
          d.deadlineUtc &&
          'value' in d.deadlineUtc &&
          d.deadlineUtc.enumerable
        ) {
          deadlineUtc = d.deadlineUtc.value;
          if (kind !== 'DISCOVER') {
            transportId =
              d.transportId && 'value' in d.transportId && d.transportId.enumerable
                ? d.transportId.value
                : null;
            const selected = d[kind === 'INPUT' ? 'action' : 'field'];
            field = selected && 'value' in selected && selected.enumerable ? selected.value : null;
          }
          if (kind === 'INPUT')
            activeIntent =
              d.activeIntent && 'value' in d.activeIntent && d.activeIntent.enumerable
                ? d.activeIntent.value
                : null;
          validRequest =
            kind === 'DISCOVER' ||
            (validMetadataTransportId(transportId) &&
              (kind === 'INPUT'
                ? validInputAction(field) &&
                  !!inspectFleetActiveInputIntent(activeIntent)?.finalCurrent()
                : validMetadataField(field)) &&
              validMetadataDeadline(deadlineUtc));
        }
      }
    } catch {
      /* Refuse descriptor traps without losing the reserved lane. */
    }
    const work = Promise.resolve().then(async () => {
      if (!validRequest || typeof deadlineUtc !== 'number') throw Error('HOST_DISCOVERY_REJECTED');
      const started = clock();
      if (
        !Number.isSafeInteger(started) ||
        started < 0 ||
        !Number.isSafeInteger(deadlineUtc) ||
        Object.is(deadlineUtc, -0) ||
        deadlineUtc < started ||
        deadlineUtc - started > 30000
      )
        throw Error('HOST_DISCOVERY_REJECTED');
      timer = setTimeout(() => {
        uncertain = true;
        expire(Error('HOST_DISCOVERY_DEADLINE'));
      }, deadlineUtc - started);
      const grant = cap && typeof cap === 'object' ? capabilities.get(cap) : undefined;
      if (!grant || !read || !observation) throw Error('HOST_DISCOVERY_REJECTED');
      current(cap, grant.ownerId);
      const a = attempt,
        token = read;
      if (
        a?.kind !== 'FOREGROUND' ||
        a.capability !== cap ||
        a.terminal ||
        a.queries >= 128 ||
        engine.snapshot().state !== 'READY'
      )
        throw Error('HOST_DISCOVERY_REJECTED');
      const admission = await custody.revalidateRead(token);
      if (!admission.ok || admission.token !== token) throw Error('HOST_DISCOVERY_REJECTED');
      observation = admission.observation;
      current(cap, grant.ownerId);
      if (attempt !== a || a.terminal || read !== token) throw Error('HOST_DISCOVERY_REJECTED');
      if (kind === 'INPUT') {
        custody.assertReadInternal(token);
        if (!inspectFleetActiveInputIntent(activeIntent)?.finalCurrent())
          throw Error('HOST_DISCOVERY_REJECTED');
      }
      a.queries++;
      queryAttempt = a;
      const facts =
        kind === 'INPUT'
          ? snapshotInputQueryFacts(
              await input?.(a.token, transportId as string, field as InputQueryAction, deadlineUtc),
            )
          : kind === 'METADATA'
            ? snapshotMetadataQueryFacts(
                await metadata?.(
                  a.token,
                  transportId as string,
                  field as MetadataQueryField,
                  deadlineUtc,
                ),
              )
            : snapshotHostAcquisitionFacts(await discover?.(a.token, deadlineUtc));
      if (!facts) throw Error('HOST_DISCOVERY_REJECTED');
      if (facts.status !== 'COMPLETE') {
        if (!facts.operationRetired) a.terminal = false;
        uncertain = true;
        return facts;
      }
      const ended = clock();
      if (
        !Number.isSafeInteger(ended) ||
        ended < started ||
        ended > deadlineUtc ||
        facts.observedAtUtc === null ||
        facts.observedAtUtc < started ||
        facts.observedAtUtc > ended ||
        (a.observedUtc !== null && facts.observedAtUtc < a.observedUtc)
      )
        throw Error('HOST_DISCOVERY_REJECTED');
      current(cap, grant.ownerId);
      custody.assertRead(token);
      if (closed || uncertain || attempt !== a || a.terminal || read !== token)
        throw Error('HOST_DISCOVERY_REJECTED');
      if (kind === 'INPUT') {
        custody.assertReadInternal(token);
        if (!inspectFleetActiveInputIntent(activeIntent)?.finalCurrent())
          throw Error('HOST_DISCOVERY_REJECTED');
      }
      a.observedUtc = facts.observedAtUtc;
      return facts;
    });
    works.add(work);
    const settled = work
      .catch((error) => {
        if (queryAttempt) queryAttempt.terminal = false;
        throw error;
      })
      .finally(() => {
        if (timer !== undefined) clearTimeout(timer);
        works.delete(work);
        busy = false;
        finishExecution?.();
        finishExecution = null;
        void releaseIfRetired();
      });
    const result = Promise.race([settled, deadline]);
    // Query settlement never marks the foreground attempt terminal.
    const retirement = settled.then(
      (value) =>
        Object.freeze({
          status: value.operationRetired ? ('RETIRED' as const) : ('UNRETIRED' as const),
        }),
      () => {
        uncertain = true;
        return Object.freeze({ status: 'UNRETIRED' as const });
      },
    );
    return kind === 'INPUT'
      ? (Object.freeze({ handoff: 'QUERY' as const, result, retirement }) as InputQueryHandle)
      : kind === 'METADATA'
        ? (Object.freeze({ handoff: 'QUERY' as const, result, retirement }) as MetadataQueryHandle)
        : (Object.freeze({ result, retirement }) as HostAcquisitionHandle);
  }

  let videoId: string | null = null;
  let videoStopped = false;
  let videoBinding: unknown = null;
  let videoStopWork: Promise<VideoSnapshot> | null = null;
  function videoControl(
    cap: HostCapability,
    kind: 'START' | 'STATUS' | 'STOP',
    raw: unknown,
    bindingTicket?: unknown,
    media?: VideoMediaSink,
  ): Promise<VideoSnapshot> {
    const request = kind === 'START' ? snapshotVideoStart(raw) : null;
    const id = request?.videoId ?? raw;
    if (
      typeof id !== 'string' ||
      !uuid(id) ||
      operationSet !== 'SERVER_ONLY' ||
      !attempt ||
      attempt.kind !== 'FOREGROUND' ||
      attempt.capability !== cap ||
      attempt.terminal
    )
      return Promise.reject(Error('VIDEO_REJECTED'));
    if (kind === 'START' ? !request || videoId !== null : videoId !== id)
      return Promise.reject(Error('VIDEO_REJECTED'));
    if (kind === 'STOP' && videoStopWork) return videoStopWork;
    if (kind === 'STOP') videoStopped = true;
    if (kind !== 'STOP' && (busy || works.size || closed || uncertain || releasing || videoStopped))
      return Promise.reject(Error('VIDEO_REJECTED'));
    const a = attempt;
    if (kind === 'STATUS' && bindingTicket !== videoBinding)
      return Promise.reject(Error('VIDEO_REJECTED'));
    if (kind === 'START') {
      videoId = id;
      videoBinding = bindingTicket;
    } // Reserve before all callbacks, never rearm.
    if (kind !== 'STOP') {
      busy = true;
      executionDone = new Promise<void>((r) => {
        finishExecution = r;
      });
    }
    const work = Promise.resolve().then(async () => {
      if (kind !== 'STOP') {
        const entry = capabilities.get(cap),
          token = read;
        if (!entry || !token || !observation) throw Error('VIDEO_REJECTED');
        current(cap, entry.ownerId);
        const validation = await custody.revalidateRead(token);
        if (!validation.ok || validation.token !== token) throw Error('VIDEO_REJECTED');
        observation = validation.observation;
        current(cap, entry.ownerId);
        const now = clock();
        if (
          request &&
          (!Number.isSafeInteger(now) ||
            now < 0 ||
            now >= request.deadlineUtc ||
            request.deadlineUtc - now > 30000)
        )
          throw Error('VIDEO_REJECTED');
        custody.assertReadInternal(token);
        if (
          attempt !== a ||
          read !== token ||
          closed ||
          uncertain ||
          videoStopped ||
          !inspectRegistryVideoBinding(bindingTicket)?.finalCurrent() ||
          (request !== null &&
            (inspectRegistryVideoBinding(bindingTicket)?.binding.transportId !==
              request.transportId ||
              inspectRegistryVideoBinding(bindingTicket)?.binding.hostEpoch !== request.hostEpoch))
        )
          throw Error('VIDEO_REJECTED');
      }
      const rawFacts =
        kind === 'START'
          ? await videoStart?.(a.token, request as VideoStart, media)
          : kind === 'STATUS'
            ? await videoStatus?.(a.token, id)
            : await videoStop?.(a.token, id);
      const facts = snapshotVideo(rawFacts);
      if (!facts || facts.sessionId !== id) throw Error('VIDEO_REJECTED');
      if (!facts.localRetired) a.terminal = false;
      return facts;
    });
    works.add(work);
    const settled = work
      .catch((error) => {
        a.terminal = false;
        throw error;
      })
      .finally(() => {
        works.delete(work);
        if (kind !== 'STOP') {
          busy = false;
          finishExecution?.();
          finishExecution = null;
        }
      });
    if (kind === 'STOP') videoStopWork = settled;
    return settled;
  }
  return Object.freeze({
    snapshot: engine.snapshot,
    startVideo: (
      cap: HostCapability,
      request: unknown,
      bindingTicket: unknown,
      media?: VideoMediaSink,
    ) => videoControl(cap, 'START', request, bindingTicket, media),
    statusVideo: (cap: HostCapability, id: string, bindingTicket: unknown) =>
      videoControl(cap, 'STATUS', id, bindingTicket),
    stopVideo: (cap: HostCapability, id: string) => videoControl(cap, 'STOP', id),
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
    acquireDiscovery(cap: HostCapability, raw: unknown): HostAcquisitionHandle {
      return acquireQuery(cap, raw, 'DISCOVER') as HostAcquisitionHandle;
    },
    acquireInput(cap: HostCapability, raw: unknown): InputQueryHandle {
      return acquireQuery(cap, raw, 'INPUT') as InputQueryHandle;
    },
    acquireMetadata(cap: HostCapability, raw: unknown): MetadataQueryHandle {
      return acquireQuery(cap, raw, 'METADATA') as MetadataQueryHandle;
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
