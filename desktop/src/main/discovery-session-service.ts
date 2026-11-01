// Main-owned explicit lifecycle facade. No implicit start, acquisition, retry or epoch reset.
import {
  snapshotDiscoveryRequest,
  discoverySuccess,
  discoveryError,
  type DiscoveryRequest,
  type DiscoverySnapshot,
  type DiscoveryCode,
} from '../discovery-contract.ts';
import type { DiscoveryAudit } from '../discovery-audit-contract.ts';
import {
  inspectOwnedDiscoveryProvider,
  type createAdbServerService,
  type OwnedDiscoveryProvider,
  type ServerAudit,
} from './adb-server-service.ts';
import type { createAdbDiscoveryService, DiscoveryReceipt } from './adb-discovery-service.ts';
import type { PlatformToolsRuntimeCustody } from './platform-tools-runtime-custody.ts';
import type { RegistrySnapshot } from './transport-registry.ts';
type Health = 'AVAILABLE' | 'DEGRADED';
type Server = ReturnType<typeof createAdbServerService>;
type Ingestion = ReturnType<typeof createAdbDiscoveryService>;
type Policy =
  | 'NOT_PROVISIONED'
  | 'POLICY_DENIED'
  | 'RETAINED_HOST_DISABLED'
  | 'UNSUPPORTED_PATH'
  | 'OWNER_REVOKED'
  | 'RECOVERY_REQUIRED'
  | 'CLOSED';
export type DiscoverySessionOptions = Readonly<{
  custody: PlatformToolsRuntimeCustody;
  assertOwnedSync(): void;
  clock(): number;
  newId(): string;
  audit(record: DiscoveryAudit): Promise<Health>;
  policy(): Policy | null;
  readDurableRevision(): number;
  createServer(
    installationRevision: number,
    assertCurrentSync: () => void,
    audit: (record: ServerAudit) => Promise<Health>,
  ): Server;
  createIngestion(provider: OwnedDiscoveryProvider, assertCurrentSync: () => void): Ingestion;
}>;
const faults = new WeakMap<object, DiscoveryCode>();
class Fault extends Error {
  constructor(code: DiscoveryCode) {
    super(code);
    faults.set(this, code);
  }
}
const codeOf = (e: unknown): DiscoveryCode =>
  e !== null && typeof e === 'object' ? (faults.get(e) ?? 'INTERNAL_FAILURE') : 'INTERNAL_FAILURE';
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export function createDiscoverySessionService(options: DiscoverySessionOptions) {
  const custody = options.custody,
    owned = options.assertOwnedSync.bind(options),
    clock = options.clock.bind(options),
    next = options.newId.bind(options),
    audit = options.audit.bind(options),
    policy = options.policy.bind(options),
    readRevision = options.readDurableRevision.bind(options),
    buildServer = options.createServer.bind(options),
    buildIngestion = options.createIngestion.bind(options);
  const acquire = custody.acquireRead.bind(custody),
    assertRead = custody.assertRead.bind(custody),
    release = custody.releaseRead.bind(custody),
    assertReadInternal = custody.assertReadInternal.bind(custody);
  const ids = new Set<string>(),
    work = new Set<Promise<unknown>>();
  let generation = 0,
    revoked = false,
    attempted = false,
    busy = false,
    uncertain = false,
    server: Server | null = null,
    ingestion: Ingestion | null = null,
    provider: ReturnType<typeof inspectOwnedDiscoveryProvider> = null,
    projection: RegistrySnapshot | null = null;
  let cleanup: Promise<'RETIRED' | 'UNRETIRED'> | null = null,
    cleanupSettled = false,
    cleanupResource = false,
    cleanupAuditPending = false;
  let lastReceipt: DiscoveryReceipt | null = null;
  let state: DiscoverySnapshot = Object.freeze({
    revision: 0,
    installationRevision: null,
    state: 'UNAVAILABLE',
    operationId: null,
    operation: null,
    lastOutcome: 'NONE',
    code: 'NOT_PROVISIONED',
    registryRevision: null,
    observedAtUtc: null,
    restartRequired: false,
  });
  function track<T>(p: Promise<T>): Promise<T> {
    work.add(p);
    void p.then(
      () => work.delete(p),
      () => work.delete(p),
    );
    return p;
  }
  function allocate(): string {
    if (ids.size >= 65536) throw new Fault('LIMIT_EXCEEDED');
    const id = next();
    if (!uuid(id) || ids.has(id)) throw new Fault('INTERNAL_FAILURE');
    ids.add(id);
    return id;
  }
  function internal(g: number) {
    if (revoked || generation !== g || cleanup) throw new Fault('SESSION_REVOKED');
  }
  function fence(g: number, current: () => void) {
    internal(g);
    try {
      owned();
    } catch {
      throw new Fault('OWNER_REVOKED');
    }
    try {
      current();
    } catch {
      throw new Fault('SESSION_REVOKED');
    }
    const time = clock();
    if (!Number.isSafeInteger(time) || time < 0) throw new Fault('INTERNAL_FAILURE');
    try {
      owned();
    } catch {
      throw new Fault('OWNER_REVOKED');
    }
    internal(g);
  }
  function put(update: Partial<DiscoverySnapshot>) {
    state = Object.freeze({ ...state, ...update });
  }
  function registryRevision(): number {
    const r = readRevision();
    if (!Number.isSafeInteger(r) || r < 0) throw new Fault('RECOVERY_REQUIRED');
    return r;
  }
  async function log(record: DiscoveryAudit): Promise<Health> {
    try {
      return (await audit(Object.freeze({ ...record }))) === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  function error(
    request: DiscoveryRequest,
    code: DiscoveryCode,
    id: string | null = null,
    unknown = false,
  ) {
    return discoveryError(
      request.requestId,
      code,
      id,
      'DEGRADED',
      unknown ? 'OUTCOME_UNKNOWN' : 'NOT_STARTED',
    );
  }
  function success(
    request: DiscoveryRequest,
    outcome: 'OBSERVED' | 'PENDING',
    id: string | null,
    health: Health,
  ) {
    return (
      discoverySuccess(request.requestId, outcome, state, id, health) ??
      error(request, 'INTERNAL_FAILURE', id, true)
    );
  }
  function currentProjection(expected?: RegistrySnapshot): boolean {
    return (
      !revoked &&
      !cleanup &&
      !uncertain &&
      state.state === 'READY' &&
      !!provider &&
      !provider.revoked &&
      provider.finalCurrent() &&
      !!projection &&
      (!expected || projection === expected)
    );
  }
  function invalidate() {
    projection = null;
    if (attempted) put({ observedAtUtc: null, restartRequired: true });
  }
  async function preflight(g: number, current: () => void): Promise<number> {
    fence(g, current);
    const denial = policy();
    fence(g, current);
    if (denial) throw new Fault(denial);
    let r: Awaited<ReturnType<typeof acquire>>;
    try {
      r = await acquire();
    } catch {
      uncertain = true;
      throw new Fault('OUTCOME_UNKNOWN');
    }
    let installation: number | null = null;
    if (!r.ok)
      throw new Fault(
        r.code === 'BUSY'
          ? 'BUSY'
          : r.code === 'BINARY_UNAVAILABLE'
            ? 'NOT_PROVISIONED'
            : r.code === 'OWNER_REVOKED'
              ? 'OWNER_REVOKED'
              : 'RECOVERY_REQUIRED',
      );
    let admissionFailure: DiscoveryCode | null = null;
    try {
      fence(g, current);
      assertRead(r.token);
      fence(g, current);
      assertReadInternal(r.token);
      internal(g);
      installation = r.observation.installationRevision;
      if (!Number.isSafeInteger(installation) || installation < 1)
        throw new Fault('RECOVERY_REQUIRED');
    } catch (e) {
      admissionFailure = codeOf(e);
    }
    let released = false;
    try {
      const retired = await release(r.token);
      released = retired.ok && retired.status === 'RETIRED';
    } catch {}
    if (!released) {
      uncertain = true;
      invalidate();
      throw new Fault('OUTCOME_UNKNOWN');
    }
    if (admissionFailure) throw new Fault(admissionFailure);
    if (installation === null) throw new Fault('RECOVERY_REQUIRED');
    fence(g, current);
    return installation;
  }
  function startCleanup(): Promise<'RETIRED' | 'UNRETIRED'> {
    if (cleanup) return cleanup;
    generation++;
    invalidate();
    cleanupResource = attempted || server !== null;
    cleanupSettled = false;
    let complete!: (status: 'RETIRED' | 'UNRETIRED') => void;
    const retained = new Promise<'RETIRED' | 'UNRETIRED'>((resolve) => {
      complete = resolve;
    });
    cleanup = retained;
    // Latch before calling either external cleanup implementation.
    let serverClose: ReturnType<Server['close']> | undefined,
      ingestionClose: ReturnType<Ingestion['close']> | undefined,
      preemption = true;
    try {
      serverClose = server?.close();
    } catch {
      preemption = false;
    }
    try {
      ingestionClose = ingestion?.close();
    } catch {
      preemption = false;
    }
    void Promise.resolve()
      .then(async () => {
        let ok = preemption;
        try {
          if (serverClose) {
            const r = await serverClose;
            ok = ok && r.kind === 'CLEANUP' && r.status === 'RETIRED' && server?.retired === true;
          }
          if (ingestionClose) {
            const r = await ingestionClose;
            ok = ok && r.status === 'RETIRED' && ingestion?.retired === true;
          }
          while (work.size) await Promise.allSettled([...work]);
          // A synchronous constructor entered before Stop may return after its reentrant callback.
          if (server && !server.retired) {
            const r = await server.close();
            ok = ok && r.kind === 'CLEANUP' && r.status === 'RETIRED' && server.retired;
          }
          if (ingestion && !ingestion.retired) {
            const r = await ingestion.close();
            ok = ok && r.status === 'RETIRED' && ingestion.retired;
          }
        } catch {
          ok = false;
        }
        cleanupSettled = true;
        busy = false;
        complete(ok && !uncertain ? 'RETIRED' : 'UNRETIRED');
      })
      .catch(() => complete('UNRETIRED'));
    return retained;
  }
  async function read(
    request: DiscoveryRequest,
    current: () => void,
    g: number,
    inspect = false,
  ): Promise<string> {
    let diagnostic: string | null = null,
      resultAttempted = false;
    try {
      if (!cleanup) fence(g, current);
      else {
        owned();
        current();
        if (revoked) throw new Fault('SESSION_REVOKED');
      }
      diagnostic = allocate();
      if (uncertain) throw new Fault('OUTCOME_UNKNOWN');
      if (inspect) {
        const installation = await preflight(g, current);
        const capturedRegistryRevision = registryRevision();
        fence(g, current);
        put({
          installationRevision: installation,
          state: 'IDLE',
          operation: null,
          operationId: null,
          lastOutcome: 'NONE',
          code: null,
          registryRevision: capturedRegistryRevision,
          observedAtUtc: null,
          restartRequired: false,
        });
      } else if (server && !cleanup && provider && (!provider.finalCurrent() || provider.revoked)) {
        invalidate();
        void stopInternal();
        throw new Fault('SESSION_REVOKED');
      }
      const captured = state;
      resultAttempted = true;
      const health = await log({
        operation: 'READ',
        stage: 'READ',
        phase: 'RESULT',
        diagnosticId: diagnostic,
        operationId: null,
        expectedRevision: null,
        resultingRevision: captured.revision,
        outcome: 'OBSERVED',
        code: 'OK',
      });
      if (!cleanup) fence(g, current);
      else {
        owned();
        current();
      }
      if (revoked || state !== captured) throw new Fault('SESSION_REVOKED');
      if (server && !cleanup && provider && (!provider.finalCurrent() || provider.revoked)) {
        invalidate();
        void startCleanup();
        throw new Fault('SESSION_REVOKED');
      }
      return (
        discoverySuccess(request.requestId, 'OBSERVED', captured, diagnostic, health) ??
        error(request, 'INTERNAL_FAILURE', diagnostic)
      );
    } catch (e) {
      const code = codeOf(e);
      if (diagnostic && !resultAttempted)
        await log({
          operation: 'READ',
          stage: 'READ',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId: null,
          expectedRevision: null,
          resultingRevision: state.revision,
          outcome: 'FAILED',
          code,
        });
      return error(request, code, diagnostic, code === 'OUTCOME_UNKNOWN');
    }
  }
  function serverAudit(
    operationId: string,
    pendingRevision: number,
  ): (record: ServerAudit) => Promise<Health> {
    const pairs = new Map<string, { correlation: string; diagnostic: string; done: boolean }>();
    return async (record) => {
      try {
        const request = record.request;
        if (
          request.operation !== 'SERVER_START' ||
          !uuid(request.commandId) ||
          !uuid(request.correlationId)
        )
          return 'DEGRADED';
        let pair = pairs.get(request.commandId);
        if (record.phase === 'INTENT') {
          if (pair || pairs.size >= 128) return 'DEGRADED';
          pair = { correlation: request.correlationId, diagnostic: allocate(), done: false };
          pairs.set(request.commandId, pair);
        } else if (!pair || pair.done || pair.correlation !== request.correlationId)
          return 'DEGRADED';
        if (!pair) return 'DEGRADED';
        const fields = {
          operation: 'START' as const,
          stage: 'TRANSPORT' as const,
          diagnosticId: pair.diagnostic,
          operationId,
          expectedRevision: pendingRevision,
          resultingRevision: null,
        };
        if (record.phase === 'INTENT')
          return log({ ...fields, phase: 'INTENT', outcome: 'INTENT', code: 'OK' });
        pair.done = true;
        const result = record.result;
        if (result?.outcome === 'OBSERVED' && result.code === 'OK')
          return log({ ...fields, phase: 'RESULT', outcome: 'OBSERVED', code: 'OK' });
        const unknown =
          result?.outcome === 'OUTCOME_UNKNOWN' ||
          result?.outcome === 'DISPATCHED_UNCONFIRMED' ||
          !result;
        return log({
          ...fields,
          phase: 'RESULT',
          outcome: unknown ? 'OUTCOME_UNKNOWN' : 'FAILED',
          code: unknown
            ? 'OUTCOME_UNKNOWN'
            : result.code === 'DEADLINE'
              ? 'DEADLINE'
              : 'DISCOVERY_FAILED',
        });
      } catch {
        return 'DEGRADED';
      }
    };
  }
  async function finishOperation(
    operation: 'START' | 'REFRESH',
    id: string,
    g: number,
    current: () => void,
    pendingRevision: number,
  ): Promise<void> {
    let diagnostic: string | null = null,
      terminal: DiscoverySnapshot | null = null,
      candidate: RegistrySnapshot | null = null,
      resultWritten = false;
    try {
      diagnostic = allocate();
      fence(g, current);
      const fields = {
        operation,
        stage: 'EXECUTION' as const,
        diagnosticId: diagnostic,
        operationId: id,
        expectedRevision: pendingRevision,
      };
      if (
        (await log({
          ...fields,
          phase: 'INTENT',
          resultingRevision: null,
          outcome: 'INTENT',
          code: 'OK',
        })) !== 'AVAILABLE'
      )
        throw new Fault('AUDIT_UNAVAILABLE');
      fence(g, current);
      if (operation === 'START') {
        const installation = state.installationRevision;
        if (installation === null) throw new Fault('RECOVERY_REQUIRED');
        server = buildServer(
          installation,
          () => fence(g, current),
          serverAudit(id, pendingRevision),
        );
        fence(g, current);
        const receipt = await server.start();
        fence(g, current);
        if (receipt.kind !== 'OPERATION' || receipt.result.outcome !== 'OBSERVED')
          throw new Fault(
            receipt.kind === 'OPERATION' &&
              ['OUTCOME_UNKNOWN', 'DISPATCHED_UNCONFIRMED'].includes(receipt.result.outcome)
              ? 'OUTCOME_UNKNOWN'
              : 'DISCOVERY_FAILED',
          );
        const opaque = server.discoveryProvider();
        provider = inspectOwnedDiscoveryProvider(opaque);
        if (!provider || provider.revoked || !provider.finalCurrent())
          throw new Fault('SESSION_REVOKED');
        ingestion = buildIngestion(opaque, () => fence(g, current));
        fence(g, current);
        if (!provider.finalCurrent()) throw new Fault('SESSION_REVOKED');
        terminal = Object.freeze({
          ...state,
          revision: pendingRevision + 1,
          state: 'READY',
          lastOutcome: 'STARTED',
          code: null,
          registryRevision: registryRevision(),
        });
      } else {
        if (!ingestion || !provider) throw new Fault('SESSION_REVOKED');
        const receipt = await ingestion.refresh(registryRevision());
        lastReceipt = receipt;
        // Known COMMITTED survives loss of authority; it never becomes NOT_COMMITTED.
        if (receipt.outcome === 'COMMITTED') {
          if (generation !== g || cleanup || revoked) return;
          let live = false;
          try {
            fence(g, current);
            candidate = ingestion.snapshot();
            live =
              receipt.projectionCurrent &&
              candidate !== null &&
              !provider.revoked &&
              provider.finalCurrent();
          } catch {
            live = false;
          }
          terminal = Object.freeze({
            ...state,
            revision: pendingRevision + 1,
            state: live ? 'READY' : 'FAILED',
            lastOutcome: 'COMMITTED',
            code: live ? null : 'SESSION_REVOKED',
            registryRevision: receipt.revision,
            observedAtUtc: live && candidate ? candidate.observedAtUtc : null,
            restartRequired: !live,
          });
        } else {
          fence(g, current);
          if (receipt.outcome === 'OUTCOME_UNKNOWN') throw new Fault('OUTCOME_UNKNOWN');
          const code: DiscoveryCode =
            receipt.code === 'STALE_REVISION'
              ? 'STALE_REVISION'
              : receipt.code === 'DEADLINE'
                ? 'DEADLINE'
                : receipt.code === 'OWNER_REVOKED'
                  ? 'OWNER_REVOKED'
                  : receipt.code === 'EPOCH_REVOKED'
                    ? 'SESSION_REVOKED'
                    : receipt.code === 'AUDIT_UNAVAILABLE'
                      ? 'AUDIT_UNAVAILABLE'
                      : receipt.code === 'CLOSED'
                        ? 'CLOSED'
                        : 'DISCOVERY_FAILED';
          const live = !provider.revoked && provider.finalCurrent();
          terminal = Object.freeze({
            ...state,
            revision: pendingRevision + 1,
            state: live ? 'READY' : 'FAILED',
            lastOutcome: 'NOT_COMMITTED',
            code,
            observedAtUtc: null,
            restartRequired: !live,
          });
        }
      }
      if (!terminal) throw new Fault('INTERNAL_FAILURE');
      await log({
        ...fields,
        phase: 'RESULT',
        resultingRevision: terminal.revision,
        outcome: terminal.lastOutcome === 'NONE' ? 'FAILED' : terminal.lastOutcome,
        code: terminal.code ?? 'OK',
      });
      resultWritten = true;
      if (generation !== g || cleanup || revoked) return;
      fence(g, current);
      if (!provider?.finalCurrent()) throw new Fault('SESSION_REVOKED');
      state = terminal;
      projection = candidate;
    } catch (e) {
      if (generation !== g || cleanup || revoked) return;
      const code = codeOf(e);
      invalidate();
      const committed = lastReceipt?.outcome === 'COMMITTED' && operation === 'REFRESH';
      terminal = Object.freeze({
        ...state,
        revision: pendingRevision + 1,
        state: committed ? 'FAILED' : code === 'OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN' : 'FAILED',
        lastOutcome: committed
          ? 'COMMITTED'
          : code === 'OUTCOME_UNKNOWN'
            ? 'UNRETIRED'
            : operation === 'START'
              ? 'FAILED'
              : 'NOT_COMMITTED',
        code: committed
          ? code === 'OWNER_REVOKED'
            ? 'OWNER_REVOKED'
            : code === 'CLOSED'
              ? 'CLOSED'
              : 'SESSION_REVOKED'
          : code,
        observedAtUtc: null,
        restartRequired: true,
      });
      state = terminal;
      // Preempt known loss before a possibly hanging failure audit.
      void startCleanup();
      if (diagnostic && !resultWritten)
        await log({
          operation,
          stage: 'EXECUTION',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId: id,
          expectedRevision: pendingRevision,
          resultingRevision: terminal.revision,
          outcome: terminal.lastOutcome === 'NONE' ? 'FAILED' : terminal.lastOutcome,
          code: terminal.code ?? 'OK',
        });
    }
  }
  async function ordinary(
    request: Extract<DiscoveryRequest, { method: 'discovery.start' | 'discovery.refresh' }>,
    current: () => void,
    g: number,
  ): Promise<string> {
    let diagnostic: string | null = null,
      operationId: string | null = null,
      requestResultWritten = false;
    const operation: 'START' | 'REFRESH' =
      request.method === 'discovery.start' ? 'START' : 'REFRESH';
    try {
      fence(g, current);
      diagnostic = allocate();
      fence(g, current);
      if (request.expectedRevision !== state.revision) throw new Fault('STALE_REVISION');
      if (state.revision > Number.MAX_SAFE_INTEGER - 2) throw new Fault('REVISION_EXHAUSTED');
      if (request.method === 'discovery.start') {
        if (attempted) throw new Fault('RESTART_REQUIRED');
        const installation = await preflight(g, current);
        fence(g, current);
        if (installation !== request.expectedInstallationRevision)
          throw new Fault('STALE_INSTALLATION');
        put({ installationRevision: installation });
      } else if (!ingestion || !provider || state.state !== 'READY' || !provider.finalCurrent())
        throw new Fault('SESSION_REVOKED');
      operationId = allocate();
      fence(g, current);
      const fields = {
        operation,
        stage: 'REQUEST' as const,
        diagnosticId: diagnostic,
        operationId,
        expectedRevision: request.expectedRevision,
      };
      if (
        (await log({
          ...fields,
          phase: 'INTENT',
          resultingRevision: null,
          outcome: 'INTENT',
          code: 'OK',
        })) !== 'AVAILABLE'
      )
        throw new Fault('AUDIT_UNAVAILABLE');
      fence(g, current);
      if (request.expectedRevision !== state.revision) throw new Fault('STALE_REVISION');
      if (operation === 'START') attempted = true;
      else lastReceipt = null;
      put({
        revision: state.revision + 1,
        state: operation === 'START' ? 'STARTING' : 'REFRESHING',
        operation,
        operationId,
        lastOutcome: 'PENDING',
        code: null,
        observedAtUtc: null,
        restartRequired: false,
      });
      const pending = state;
      const health = await log({
        ...fields,
        phase: 'RESULT',
        resultingRevision: pending.revision,
        outcome: 'PENDING',
        code: 'OK',
      });
      requestResultWritten = true;
      fence(g, current);
      const capturedOperationId = operationId;
      const execution = Promise.resolve().then(() =>
        finishOperation(operation, capturedOperationId, g, current, pending.revision),
      );
      track(execution);
      void execution.finally(() => {
        if (generation === g) busy = false;
      });
      return (
        discoverySuccess(request.requestId, 'PENDING', pending, diagnostic, health) ??
        error(request, 'INTERNAL_FAILURE', diagnostic, true)
      );
    } catch (e) {
      const code = codeOf(e);
      if (requestResultWritten && operationId && generation === g && !cleanup && !revoked) {
        const capturedOperationId = operationId,
          capturedRevision = state.revision;
        const execution = Promise.resolve().then(() =>
          finishOperation(operation, capturedOperationId, g, current, capturedRevision),
        );
        track(execution);
      }
      if (diagnostic && !requestResultWritten)
        await log({
          operation,
          stage: 'REQUEST',
          phase: 'RESULT',
          diagnosticId: diagnostic,
          operationId,
          expectedRevision: request.expectedRevision,
          resultingRevision: state.revision,
          outcome: 'FAILED',
          code,
        });
      if (generation === g) busy = false;
      return error(request, code, diagnostic, code === 'OUTCOME_UNKNOWN');
    }
  }
  let stopAck: Promise<{ diagnostic: string | null; health: Health }> | null = null;
  let cleanupReport: Promise<'RETIRED' | 'UNRETIRED'> | null = null;
  function stopInternal(): Promise<{ diagnostic: string | null; health: Health }> {
    if (stopAck) return stopAck;
    let acknowledge!: (value: { diagnostic: string | null; health: Health }) => void;
    stopAck = new Promise((resolve) => {
      acknowledge = resolve;
    });
    const retiring = startCleanup();
    cleanupAuditPending = true;
    let diagnostic: string | null = null,
      operationId: string | null = null;
    try {
      diagnostic = allocate();
      operationId = allocate();
      if (state.revision > Number.MAX_SAFE_INTEGER - 2) throw new Fault('REVISION_EXHAUSTED');
      put({
        revision: state.revision + 1,
        state: 'STOPPING',
        operation: 'STOP',
        operationId,
        lastOutcome: 'PENDING',
        code: null,
        observedAtUtc: null,
        restartRequired: attempted,
      });
    } catch (e) {
      put({
        state: 'OUTCOME_UNKNOWN',
        operation: null,
        operationId: null,
        lastOutcome: 'UNRETIRED',
        code: codeOf(e),
        observedAtUtc: null,
        restartRequired: attempted,
      });
      diagnostic = null;
      operationId = null;
    }
    const pending = state;
    void Promise.resolve()
      .then(async () => ({
        diagnostic,
        health:
          diagnostic && operationId
            ? await log({
                operation: 'STOP',
                stage: 'REQUEST',
                phase: 'RESULT',
                diagnosticId: diagnostic,
                operationId,
                expectedRevision: null,
                resultingRevision: pending.revision,
                outcome: 'PENDING',
                code: 'OK',
              })
            : ('DEGRADED' as Health),
      }))
      .then(acknowledge, () => acknowledge({ diagnostic: null, health: 'DEGRADED' }));
    const ack = stopAck;
    const completion = retiring.then(async (status) => {
      await ack;
      let terminalDiagnostic: string | null = null;
      try {
        terminalDiagnostic = allocate();
      } catch {}
      if (operationId) {
        const outcome = status === 'RETIRED' ? 'CLEANUP_RETIRED' : 'UNRETIRED';
        if (terminalDiagnostic)
          await log({
            operation: 'STOP',
            stage: 'EXECUTION',
            phase: 'RESULT',
            diagnosticId: terminalDiagnostic,
            operationId,
            expectedRevision: null,
            resultingRevision: pending.revision + 1,
            outcome,
            code: status === 'RETIRED' ? 'OK' : 'OUTCOME_UNKNOWN',
          });
        put({
          revision: pending.revision + 1,
          state: status === 'RETIRED' ? 'STOPPED' : 'OUTCOME_UNKNOWN',
          lastOutcome: outcome,
          code: status === 'RETIRED' ? null : 'OUTCOME_UNKNOWN',
          restartRequired: attempted,
        });
      }
    });
    // Final cleanup includes STOP audit completion but never waits on itself.
    cleanup = completion.then(async () => {
      const result = await retiring;
      cleanupSettled = true;
      cleanupAuditPending = false;
      return result;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    cleanupReport = Promise.race([
      cleanup,
      new Promise<'UNRETIRED'>((resolve) => {
        timer = setTimeout(() => {
          cleanupResource = true;
          invalidate();
          if (operationId)
            put({
              revision: pending.revision + 1,
              state: 'OUTCOME_UNKNOWN',
              lastOutcome: 'UNRETIRED',
              code: 'OUTCOME_UNKNOWN',
              restartRequired: true,
            });
          resolve('UNRETIRED');
        }, 120000);
      }),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
    return ack;
  }
  return Object.freeze({
    execute(input: unknown, operationCurrent: () => boolean): Promise<string> {
      const admittedCurrent = () => {
        if (operationCurrent() !== true) throw new Fault('SESSION_REVOKED');
      };
      const request = snapshotDiscoveryRequest(input);
      if (!request || typeof operationCurrent !== 'function')
        return Promise.resolve(discoveryError(null, 'INVALID_SHAPE', null, 'DEGRADED'));
      if (request.method === 'discovery.stop') {
        try {
          owned();
          admittedCurrent();
          if (revoked) throw Error();
        } catch {
          return Promise.resolve(error(request, 'SESSION_REVOKED'));
        }
        return stopInternal().then(({ diagnostic, health }) =>
          diagnostic
            ? success(request, 'PENDING', diagnostic, health)
            : error(request, 'INTERNAL_FAILURE', null, true),
        );
      }
      if (revoked) return Promise.resolve(error(request, 'SESSION_REVOKED'));
      if (request.method === 'discovery.get') {
        if (busy && !['STARTING', 'REFRESHING', 'STOPPING'].includes(state.state))
          return Promise.resolve(error(request, 'BUSY'));
        if (!busy && !server && !attempted && !cleanup) {
          busy = true;
          const p = read(request, admittedCurrent, generation, true).finally(() => {
            busy = false;
          });
          return track(p);
        }
        return track(read(request, admittedCurrent, generation));
      }
      if (uncertain) return Promise.resolve(error(request, 'OUTCOME_UNKNOWN', null, true));
      if (cleanup) {
        if (
          cleanupSettled &&
          !cleanupAuditPending &&
          !cleanupResource &&
          !attempted &&
          state.state === 'STOPPED'
        ) {
          cleanup = null;
          cleanupReport = null;
          stopAck = null;
          cleanupSettled = false;
          generation++;
        } else return Promise.resolve(error(request, attempted ? 'RESTART_REQUIRED' : 'BUSY'));
      }
      if (busy) return Promise.resolve(error(request, 'BUSY'));
      if (request.method !== 'discovery.start' && request.method !== 'discovery.refresh')
        return Promise.resolve(error(request, 'INVALID_SHAPE'));
      busy = true;
      return track(ordinary(request, admittedCurrent, generation));
    },
    revoke(): void {
      revoked = true;
      void stopInternal();
    },
    close(): Promise<'RETIRED' | 'UNRETIRED'> {
      revoked = true;
      void stopInternal();
      return cleanupReport ?? Promise.resolve('UNRETIRED');
    },
    snapshot(): RegistrySnapshot | null {
      if (!currentProjection()) return null;
      return projection;
    },
    availability(): 'BINARY_UNAVAILABLE' | 'LIVE_DISCOVERY_UNAVAILABLE' | 'OBSERVED' {
      return currentProjection()
        ? 'OBSERVED'
        : state.installationRevision === null && !attempted
          ? 'BINARY_UNAVAILABLE'
          : 'LIVE_DISCOVERY_UNAVAILABLE';
    },
    finalProjection(expected: RegistrySnapshot): boolean {
      return currentProjection(expected);
    },
    get retired(): boolean {
      return (
        cleanupSettled &&
        !cleanupAuditPending &&
        work.size === 0 &&
        !uncertain &&
        (!server || server.retired) &&
        (!ingestion || ingestion.retired)
      );
    },
  });
}
export type DiscoverySessionService = ReturnType<typeof createDiscoverySessionService>;
