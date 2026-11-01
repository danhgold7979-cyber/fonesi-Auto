/** Explicit VERSION-only service. Reads never construct a helper. */
import { PLATFORM_TOOLS_INSTALL_TARGET } from './platform-tools-catalog.ts';
import type { PlatformToolsRuntimeCustody } from './platform-tools-runtime-custody.ts';
import type { createHostFactory } from './adb-host-factory.ts';
import type { RuntimeVersionAudit } from '../runtime-version-audit-contract.ts';
import {
  snapshotRuntimeVersionRequest,
  runtimeVersionSuccess,
  runtimeVersionError,
  type RuntimeVersionRequest,
  type RuntimeVersionSnapshot,
  type RuntimeVersionCode,
  type RuntimeVersionHealth,
} from '../runtime-version-contract.ts';
type Factory = Pick<
  ReturnType<typeof createHostFactory>,
  'grant' | 'execute' | 'close' | 'retired' | 'evidence'
>;
type Custody = Pick<PlatformToolsRuntimeCustody, 'acquireRead' | 'assertRead' | 'releaseRead'>;
export type RuntimeVersionService = ReturnType<typeof createRuntimeVersionService>;
export function createRuntimeVersionService(
  options: Readonly<{
    custody: Custody;
    assertOwnedSync(): void;
    inspectContext(): RuntimeVersionCode | null;
    createFactory(expectedInstallationRevision: number): Factory;
    clock(): number;
    newId(): string;
    audit(record: RuntimeVersionAudit): Promise<RuntimeVersionHealth>;
  }>,
) {
  const custody = options.custody,
    owned = options.assertOwnedSync.bind(options),
    inspect = options.inspectContext.bind(options),
    build = options.createFactory.bind(options),
    clock = options.clock.bind(options),
    next = options.newId.bind(options),
    audit = options.audit.bind(options);
  const ids = new Set<string>();
  const faults = new WeakMap<object, RuntimeVersionCode>();
  let verifiedAuditHealth: RuntimeVersionHealth = 'AVAILABLE';
  let stopped = false,
    uncertain = false,
    lane = false,
    pending: Promise<void> | null = null,
    factory: Factory | null = null,
    readToken: object | null = null,
    laneDone = Promise.resolve(),
    finishLane: (() => void) | null = null,
    closing: Promise<'RETIRED' | 'UNRETIRED'> | null = null;
  let state: RuntimeVersionSnapshot = Object.freeze({
    revision: 0,
    installationRevision: null,
    state: 'UNAVAILABLE',
    operationId: null,
    code: 'NOT_PROVISIONED',
    installTargetVersion: PLATFORM_TOOLS_INSTALL_TARGET.candidate.release,
    activeVersion: null,
    verifiedAtUtc: null,
  });
  function fail(code: RuntimeVersionCode): never {
    const e = new Error(code);
    faults.set(e, code);
    throw e;
  }
  function code(error: unknown): RuntimeVersionCode {
    return error && typeof error === 'object'
      ? (faults.get(error) ?? 'INTERNAL_FAILURE')
      : 'INTERNAL_FAILURE';
  }
  function id() {
    if (ids.size >= 65536) fail('INTERNAL_FAILURE');
    const value = next();
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) ||
      ids.has(value)
    )
      fail('INTERNAL_FAILURE');
    ids.add(value);
    return value;
  }
  function time() {
    const t = clock();
    if (!Number.isSafeInteger(t) || t < 0 || Object.is(t, -0)) fail('INTERNAL_FAILURE');
    return t;
  }
  function fence(current: () => boolean, token?: object, allowUncertain = false) {
    if (stopped || (uncertain && !allowUncertain)) fail(stopped ? 'CLOSED' : 'RECOVERY_REQUIRED');
    if (!current()) fail('SESSION_REVOKED');
    try {
      owned();
    } catch {
      fail('OWNER_REVOKED');
    }
    if (token) {
      try {
        custody.assertRead(token);
      } catch {
        fail('RECOVERY_REQUIRED');
      }
    }
    if (!current()) fail('SESSION_REVOKED');
    try {
      owned();
    } catch {
      fail('OWNER_REVOKED');
    }
    if (token) {
      try {
        custody.assertRead(token);
      } catch {
        fail('RECOVERY_REQUIRED');
      }
    }
    if (stopped || (uncertain && !allowUncertain)) fail(stopped ? 'CLOSED' : 'RECOVERY_REQUIRED');
  }
  function change(fields: Omit<RuntimeVersionSnapshot, 'revision' | 'installTargetVersion'>) {
    const nextState = {
      ...fields,
      installTargetVersion: PLATFORM_TOOLS_INSTALL_TARGET.candidate.release,
      revision: state.revision,
    };
    if (
      state.state === fields.state &&
      state.installationRevision === fields.installationRevision &&
      state.activeVersion === fields.activeVersion &&
      state.operationId === fields.operationId &&
      state.code === fields.code &&
      state.verifiedAtUtc === fields.verifiedAtUtc
    )
      return state;
    if (state.revision >= Number.MAX_SAFE_INTEGER) fail('CLOSED');
    state = Object.freeze({ ...nextState, revision: state.revision + 1 });
    return state;
  }
  function success(...args: Parameters<typeof runtimeVersionSuccess>): string {
    const wire = runtimeVersionSuccess(...args);
    if (wire === null) fail('INTERNAL_FAILURE');
    return wire;
  }
  async function log(record: RuntimeVersionAudit): Promise<RuntimeVersionHealth> {
    try {
      return (await audit(record)) === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  function mapCustody(c: string): RuntimeVersionCode {
    return c === 'BINARY_UNAVAILABLE'
      ? 'NOT_PROVISIONED'
      : c === 'BUSY'
        ? 'BUSY'
        : c === 'OWNER_REVOKED'
          ? 'OWNER_REVOKED'
          : c === 'CLOSED'
            ? 'CLOSED'
            : 'RECOVERY_REQUIRED';
  }
  function held(): object {
    if (readToken === null) fail('RECOVERY_REQUIRED');
    return readToken;
  }
  async function release() {
    if (!readToken) return true;
    const token = readToken;
    try {
      const result = await custody.releaseRead(token);
      if (result.ok && result.status === 'RETIRED') {
        if (readToken === token) readToken = null;
        return true;
      }
    } catch {}
    uncertain = true;
    return false;
  }
  function unknown(operationId: string, installationRevision: number) {
    uncertain = true;
    change({
      state: 'OUTCOME_UNKNOWN',
      activeVersion: null,
      installationRevision,
      operationId,
      code: 'OUTCOME_UNKNOWN',
      verifiedAtUtc: null,
    });
  }
  async function observed(current: () => boolean) {
    const result = await custody.acquireRead();
    if (result.ok) readToken = result.token;
    fence(current);
    if (!result.ok) fail(mapCustody(result.code));
    fence(current, held());
    return result.observation;
  }
  async function run(
    operationId: string,
    diagnosticId: string,
    expectedRevision: number,
    installationRevision: number,
    current: () => boolean,
  ) {
    let outcome: 'VERIFIED' | 'FAILED' | 'OUTCOME_UNKNOWN' = 'FAILED';
    let failure: RuntimeVersionCode = 'INTERNAL_FAILURE';
    try {
      fence(current);
      const health = await log({
        operation: 'VERIFY',
        phase: 'INTENT',
        diagnosticId,
        operationId,
        expectedRevision,
        resultingRevision: null,
        installationRevision,
        outcome: 'INTENT',
        code: 'OK',
      });
      fence(current);
      if (state.operationId !== operationId || state.state !== 'PENDING') fail('STALE_REVISION');
      if (health !== 'AVAILABLE') fail('AUDIT_UNAVAILABLE');
      const contextCode = inspect();
      fence(current);
      if (contextCode) fail(contextCode);
      const commandId = id(),
        correlationId = id(),
        ownerId = id();
      const startedAt = time();
      if (startedAt > Number.MAX_SAFE_INTEGER - 30000) fail('INTERNAL_FAILURE');
      const deadlineUtc = startedAt + 30000;
      fence(current);
      factory = build(installationRevision);
      fence(current);
      const cap = factory.grant(ownerId, () => fence(current));
      const result = await factory.execute(cap, {
        version: 1,
        commandId,
        correlationId,
        ownerId,
        operation: 'HOST_VERSION',
        deadlineUtc,
      });
      const retired = await factory.close();
      if (retired !== 'RETIRED' || !factory.retired || !factory.evidence.directoryCleanup) {
        unknown(operationId, installationRevision);
        outcome = 'OUTCOME_UNKNOWN';
        return;
      }
      factory = null;
      fence(current);
      if (result.outcome !== 'OBSERVED' || result.code !== 'OK')
        fail(
          result.code === 'DEADLINE'
            ? 'TIMEOUT'
            : result.code === 'INVALID_OBSERVATION'
              ? 'INVALID_OBSERVATION'
              : 'TRANSPORT_FAILED',
        );
      const observation = await observed(current);
      if (observation.installationRevision !== installationRevision) fail('STALE_INSTALLATION');
      const verifiedAtUtc = time();
      fence(current, held());
      const captured: RuntimeVersionSnapshot = Object.freeze({
        revision: state.revision + 1,
        installTargetVersion: PLATFORM_TOOLS_INSTALL_TARGET.candidate.release,
        activeVersion: observation.release,
        state: 'VERIFIED',
        installationRevision,
        operationId: null,
        code: null,
        verifiedAtUtc,
      });
      if (!(await release())) {
        unknown(operationId, installationRevision);
        outcome = 'OUTCOME_UNKNOWN';
        return;
      }
      fence(current);
      if (state.revision + 1 !== captured.revision || state.operationId !== operationId)
        fail('STALE_REVISION');
      state = captured;
      outcome = 'VERIFIED';
    } catch (error) {
      failure = code(error);
      if (factory) {
        try {
          if (
            (await factory.close()) === 'RETIRED' &&
            factory.retired &&
            factory.evidence.directoryCleanup
          )
            factory = null;
        } catch {}
      }
      if (!(await release()) || factory) {
        unknown(operationId, installationRevision);
        outcome = 'OUTCOME_UNKNOWN';
      } else
        change({
          state: 'FAILED',
          activeVersion: state.activeVersion,
          installationRevision,
          operationId: null,
          code: [
            'SESSION_REVOKED',
            'OWNER_REVOKED',
            'AUDIT_UNAVAILABLE',
            'INTERNAL_FAILURE',
            'TIMEOUT',
            'TRANSPORT_FAILED',
            'INVALID_OBSERVATION',
            'RECOVERY_REQUIRED',
            'STALE_INSTALLATION',
          ].includes(failure)
            ? failure
            : 'INTERNAL_FAILURE',
          verifiedAtUtc: null,
        });
    } finally {
      const captured = state;
      verifiedAuditHealth = await log({
        operation: 'VERIFY',
        phase: 'RESULT',
        diagnosticId,
        operationId,
        expectedRevision,
        resultingRevision: captured.revision,
        installationRevision,
        outcome,
        code:
          outcome === 'VERIFIED'
            ? 'OK'
            : outcome === 'OUTCOME_UNKNOWN'
              ? 'OUTCOME_UNKNOWN'
              : (captured.code ?? failure),
      });
    }
  }
  return Object.freeze({
    async execute(input: RuntimeVersionRequest, current: () => boolean): Promise<string> {
      const request = snapshotRuntimeVersionRequest(input);
      if (!request) return runtimeVersionError(null, 'INVALID_SHAPE', null, 'DEGRADED');
      if (lane) return runtimeVersionError(request.requestId, 'BUSY', null, 'DEGRADED');
      lane = true;
      laneDone = new Promise<void>((r) => {
        finishLane = r;
      });
      let diagnosticId: string | null = null;
      let reserved = false;
      let requestAudit: {
        operationId: string;
        expectedRevision: number;
        installationRevision: number;
      } | null = null;
      try {
        fence(current, undefined, request.method === 'runtimeVersion.get');
        const allocatedId = id();
        diagnosticId = allocatedId;
        fence(current, undefined, request.method === 'runtimeVersion.get');
        if (request.method === 'runtimeVersion.get') {
          let captured: RuntimeVersionSnapshot;
          if (uncertain && state.state !== 'OUTCOME_UNKNOWN') fail('RECOVERY_REQUIRED');
          if (pending || uncertain) captured = state;
          else {
            try {
              const observation = await observed(current);
              const contextCode = inspect();
              fence(current, held());
              if (contextCode)
                change({
                  state: 'UNAVAILABLE',
                  activeVersion: observation.release,
                  installationRevision: observation.installationRevision,
                  operationId: null,
                  code: contextCode,
                  verifiedAtUtc: null,
                });
              else if (
                !['VERIFIED', 'FAILED'].includes(state.state) ||
                state.installationRevision !== observation.installationRevision
              )
                change({
                  state: 'IDLE',
                  activeVersion: observation.release,
                  installationRevision: observation.installationRevision,
                  operationId: null,
                  code: null,
                  verifiedAtUtc: null,
                });
              fence(current, held());
              captured = state;
            } catch (error) {
              const c = code(error);
              if (readToken !== null) fail(c);
              if (c === 'BUSY')
                return runtimeVersionError(request.requestId, c, diagnosticId, 'AVAILABLE');
              change({
                state: 'UNAVAILABLE',
                activeVersion: null,
                installationRevision: null,
                operationId: null,
                code: [
                  'NOT_PROVISIONED',
                  'RETAINED_HOST_DISABLED',
                  'UNSUPPORTED_PATH',
                  'RECOVERY_REQUIRED',
                  'OWNER_REVOKED',
                  'CLOSED',
                ].includes(c)
                  ? c
                  : 'RECOVERY_REQUIRED',
                verifiedAtUtc: null,
              });
              captured = state;
            } finally {
              if (!(await release())) fail('RECOVERY_REQUIRED');
            }
          }
          const health = await log({
            operation: 'READ',
            phase: 'RESULT',
            diagnosticId: allocatedId,
            operationId: null,
            expectedRevision: null,
            resultingRevision: captured.revision,
            installationRevision: captured.installationRevision,
            outcome: 'OBSERVED',
            code: 'OK',
          });
          fence(current, undefined, captured.state === 'OUTCOME_UNKNOWN');
          return success(
            request.requestId,
            'OBSERVED',
            captured,
            allocatedId,
            health === 'AVAILABLE' && verifiedAuditHealth === 'AVAILABLE'
              ? 'AVAILABLE'
              : 'DEGRADED',
          );
        }
        if (pending || uncertain)
          return runtimeVersionError(
            request.requestId,
            uncertain ? 'RECOVERY_REQUIRED' : 'BUSY',
            diagnosticId,
            'AVAILABLE',
          );
        if (state.revision > Number.MAX_SAFE_INTEGER - 2) fail('CLOSED');
        if (request.expectedRevision !== state.revision) fail('STALE_REVISION');
        const originalRevision = state.revision;
        const observation = await observed(current);
        if (state.revision !== originalRevision || request.expectedRevision !== state.revision)
          fail('STALE_REVISION');
        if (observation.installationRevision !== request.expectedInstallationRevision)
          fail('STALE_INSTALLATION');
        const contextCode = inspect();
        fence(current, held());
        if (contextCode) fail(contextCode);
        const operationId = id();
        fence(current, held());
        const installationRevision = observation.installationRevision;
        requestAudit = { operationId, expectedRevision: originalRevision, installationRevision };
        const health = await log({
          operation: 'REQUEST',
          phase: 'INTENT',
          diagnosticId: allocatedId,
          operationId,
          expectedRevision: originalRevision,
          resultingRevision: null,
          installationRevision,
          outcome: 'INTENT',
          code: 'OK',
        });
        fence(current, held());
        if (state.revision !== originalRevision) fail('STALE_REVISION');
        if (health !== 'AVAILABLE') fail('AUDIT_UNAVAILABLE');
        if (!(await release())) fail('RECOVERY_REQUIRED');
        fence(current);
        if (state.revision !== originalRevision) fail('STALE_REVISION');
        const captured = change({
          state: 'PENDING',
          activeVersion: observation.release,
          installationRevision,
          operationId,
          code: null,
          verifiedAtUtc: null,
        });
        let begin: () => void = () => fail('INTERNAL_FAILURE');
        const gate = new Promise<void>((r) => {
          begin = r;
        });
        const work = gate.then(() =>
          run(operationId, allocatedId, originalRevision, installationRevision, current),
        );
        pending = work;
        reserved = true;
        void work.then(
          () => {
            if (pending === work && !uncertain && !factory && !readToken) pending = null;
          },
          () => {
            unknown(operationId, installationRevision);
          },
        );
        let resultHealth: RuntimeVersionHealth;
        try {
          resultHealth = await log({
            operation: 'REQUEST',
            phase: 'RESULT',
            diagnosticId: allocatedId,
            operationId,
            expectedRevision: originalRevision,
            resultingRevision: captured.revision,
            installationRevision,
            outcome: 'PENDING',
            code: 'OK',
          });
        } finally {
          begin();
        }
        fence(current);
        return success(request.requestId, 'PENDING', captured, allocatedId, resultHealth);
      } catch (error) {
        const released = await release();
        if (diagnosticId !== null && !reserved) {
          if (request.method === 'runtimeVersion.get') {
            await log({
              operation: 'READ',
              phase: 'RESULT',
              diagnosticId,
              operationId: null,
              expectedRevision: null,
              resultingRevision: null,
              installationRevision: state.installationRevision,
              outcome: 'FAILED',
              code: released ? code(error) : 'RECOVERY_REQUIRED',
            });
          } else if (requestAudit !== null) {
            await log({
              operation: 'REQUEST',
              phase: 'RESULT',
              diagnosticId,
              ...requestAudit,
              resultingRevision: null,
              outcome: 'FAILED',
              code: released ? code(error) : 'RECOVERY_REQUIRED',
            });
          }
        }
        return runtimeVersionError(
          request.requestId,
          released ? code(error) : 'RECOVERY_REQUIRED',
          diagnosticId,
          'DEGRADED',
          released && !reserved ? 'NOT_STARTED' : 'OUTCOME_UNKNOWN',
        );
      } finally {
        lane = false;
        finishLane?.();
        finishLane = null;
      }
    },
    shutdown(): Promise<'RETIRED' | 'UNRETIRED'> {
      if (closing) return closing;
      stopped = true;
      const settle = async (): Promise<'RETIRED' | 'UNRETIRED'> => {
        await laneDone;
        if (pending) await pending;
        if (factory) {
          try {
            await factory.close();
          } catch {}
        }
        return !uncertain && !factory && !readToken && !pending && !lane ? 'RETIRED' : 'UNRETIRED';
      };
      closing = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            settle().catch(() => 'UNRETIRED' as const),
            new Promise<'UNRETIRED'>((r) => {
              timer = setTimeout(() => r('UNRETIRED'), 120000);
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      })();
      return closing;
    },
    get retired() {
      return !lane && !pending && !factory && !readToken && !uncertain;
    },
  });
}
