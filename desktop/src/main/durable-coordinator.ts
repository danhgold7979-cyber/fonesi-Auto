// Private main-only serialization and audit/commit boundary; never a wire capability.
import {
  snapshotDurable,
  snapshotDurableDelta,
  type DurableSnapshot,
  type DurableDelta,
} from './durable-contract.ts';
import {
  DURABLE_OPERATIONS,
  type DurableCode,
  type DurableOperation,
  type DurableHealth,
  type DurableAudit,
} from '../durable-audit-contract.ts';
export type DurableMutationResult =
  | Readonly<{
      ok: true;
      outcome: 'COMMITTED';
      revision: number;
      operationId: string;
      diagnosticId: string;
      auditHealth: DurableHealth;
    }>
  | Readonly<{
      ok: false;
      outcome: 'NOT_COMMITTED';
      code: Exclude<DurableCode, 'OUTCOME_UNKNOWN'>;
      operationId: string | null;
      diagnosticId: string | null;
      auditHealth: 'DEGRADED';
    }>
  | Readonly<{
      ok: false;
      outcome: 'OUTCOME_UNKNOWN';
      code: 'OUTCOME_UNKNOWN';
      operationId: string;
      diagnosticId: string;
      auditHealth: 'DEGRADED';
    }>;
export type DurableDenied = Extract<DurableMutationResult, { ok: false }>;
export type DurableDbResult =
  | { ok: true; value: DurableSnapshot }
  | { ok: false; code: 'CONFLICT' | 'WRITE_FAILED' | 'OUTCOME_UNKNOWN' | 'RECOVERY_REQUIRED' };
export type DurableDb = Readonly<{
  readDurable(): DurableSnapshot;
  commitDurable(expectedRevision: number, delta: DurableDelta, admit: () => void): DurableDbResult;
}>;
export type DurableContext = Readonly<{
  snapshot: DurableSnapshot;
  operationId: string;
  diagnosticId: string;
  utc: number;
}>;
export type DurablePlan<T> = Readonly<{
  effect?: () => Promise<T>;
  mutationStarted?: () => boolean;
  delta: (effect: T | undefined, current: DurableSnapshot) => DurableDelta;
}>;
export type DurableStepResult<T> =
  | {
      ok: true;
      result: Extract<DurableMutationResult, { ok: true }>;
      snapshot: DurableSnapshot;
      value: T | undefined;
    }
  | { ok: false; result: DurableDenied };
export class DurableFault extends Error {
  readonly code: Exclude<DurableCode, 'OUTCOME_UNKNOWN'>;
  constructor(code: Exclude<DurableCode, 'OUTCOME_UNKNOWN'>) {
    super(code);
    this.code = code;
  }
}
// An uncertain filesystem effect is not described as a known rollback.
export class DurableUncertain extends Error {
  constructor() {
    super('OUTCOME_UNKNOWN');
  }
}
export type DurableLane = Readonly<{
  read(): DurableSnapshot;
  assertCurrent(admit?: () => void, finalInternal?: () => void): void;
  step<T>(
    operation: DurableOperation,
    expectedRevision: number,
    prepare: (context: DurableContext) => DurablePlan<T>,
    admit?: () => void,
    finalInternal?: () => void,
  ): Promise<DurableStepResult<T>>;
}>;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const epoch = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
export function createDurableCoordinator(
  options: Readonly<{
    db: DurableDb;
    assertOwnedSync: () => void;
    clock: () => number;
    newId: () => string;
    audit: (fields: DurableAudit) => Promise<DurableHealth>;
  }>,
) {
  const readDb = options.db.readDurable.bind(options.db),
    commit = options.db.commitDurable.bind(options.db),
    owned = options.assertOwnedSync.bind(options),
    clock = options.clock.bind(options),
    newId = options.newId.bind(options),
    audit = options.audit.bind(options);
  let closed = false,
    uncertain = false,
    active: Promise<unknown> | null = null,
    activeToken: object | null = null,
    closing: Promise<void> | null = null;
  const allocated = new Set<string>();
  function denial(
    code: Exclude<DurableCode, 'OUTCOME_UNKNOWN'>,
    operationId: string | null = null,
    diagnosticId: string | null = null,
  ): DurableDenied {
    return Object.freeze({
      ok: false,
      outcome: 'NOT_COMMITTED',
      code,
      operationId,
      diagnosticId,
      auditHealth: 'DEGRADED',
    });
  }
  async function log(fields: DurableAudit): Promise<DurableHealth> {
    try {
      return (await audit(Object.freeze({ ...fields }))) === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  function assert(token: object, admit?: () => void, finalInternal?: () => void) {
    if (closed || activeToken !== token) throw new DurableFault('OWNER_REVOKED');
    if (uncertain) throw new DurableFault('RECOVERY_REQUIRED');
    try {
      owned();
    } catch {
      throw new DurableFault('OWNER_REVOKED');
    }
    admit?.();
    try {
      owned();
    } catch {
      throw new DurableFault('OWNER_REVOKED');
    }
    if (closed || activeToken !== token) throw new DurableFault('OWNER_REVOKED');
    if (uncertain) throw new DurableFault('RECOVERY_REQUIRED');
    // Trusted callback-free observation fence: no external callback follows it.
    finalInternal?.();
    if (closed || activeToken !== token) throw new DurableFault('OWNER_REVOKED');
    if (uncertain) throw new DurableFault('RECOVERY_REQUIRED');
  }
  function read(token: object): DurableSnapshot {
    assert(token);
    let snapshot: DurableSnapshot | null;
    try {
      snapshot = snapshotDurable(readDb());
    } catch {
      throw new DurableFault('RECOVERY_REQUIRED');
    }
    assert(token);
    if (!snapshot) throw new DurableFault('RECOVERY_REQUIRED');
    return snapshot;
  }
  function allocate(): string {
    const id = newId();
    if (!uuid(id) || allocated.has(id) || allocated.size >= 65536)
      throw new DurableFault('LIMIT_EXCEEDED');
    allocated.add(id);
    return id;
  }
  async function step<T>(
    token: object,
    operation: DurableOperation,
    expectedRevision: number,
    prepare: (ctx: DurableContext) => DurablePlan<T>,
    admit?: () => void,
    finalInternal?: () => void,
  ): Promise<DurableStepResult<T>> {
    let operationId: string | null = null,
      diagnosticId: string | null = null,
      effectStarted = false,
      commitStarted = false;
    let mutationStarted: (() => boolean) | undefined;
    try {
      assert(token, admit, finalInternal);
      if (
        !DURABLE_OPERATIONS.includes(operation) ||
        !epoch(expectedRevision) ||
        typeof prepare !== 'function'
      )
        throw new DurableFault('INVALID_REQUEST');
      const before = read(token);
      if (before.meta.revision !== expectedRevision) throw new DurableFault('STALE_REVISION');
      if (expectedRevision === Number.MAX_SAFE_INTEGER)
        throw new DurableFault('REVISION_EXHAUSTED');
      operationId = allocate();
      diagnosticId = allocate();
      const utc = clock();
      if (!epoch(utc)) throw new DurableFault('INVALID_REQUEST');
      const plan = prepare(Object.freeze({ snapshot: before, operationId, diagnosticId, utc }));
      if (
        !plan ||
        typeof plan.delta !== 'function' ||
        (plan.effect !== undefined && typeof plan.effect !== 'function') ||
        (plan.mutationStarted !== undefined && typeof plan.mutationStarted !== 'function')
      )
        throw new DurableFault('INVALID_REQUEST');
      mutationStarted = plan.mutationStarted?.bind(plan);
      const effect = plan.effect?.bind(plan),
        delta = plan.delta.bind(plan);
      assert(token, admit, finalInternal);
      if (
        (await log({
          operation,
          phase: 'INTENT',
          operationId,
          diagnosticId,
          expectedRevision,
          resultingRevision: null,
          code: 'OK',
        })) !== 'AVAILABLE'
      )
        return { ok: false, result: denial('AUDIT_UNAVAILABLE', operationId, diagnosticId) };
      assert(token, admit, finalInternal);
      if (read(token).meta.revision !== expectedRevision) throw new DurableFault('STALE_REVISION');
      assert(token, admit, finalInternal);
      effectStarted = effect !== undefined;
      const value = await effect?.();
      assert(token, admit, finalInternal);
      const current = read(token);
      if (current.meta.revision !== expectedRevision) throw new DurableFault('STALE_REVISION');
      const next = snapshotDurableDelta(delta(value, current));
      if (
        !next ||
        next.operationId !== operationId ||
        next.utc !== utc ||
        next.kind !==
          (operation === 'STARTUP' || operation === 'RECONCILE' || operation === 'DISPLAY'
            ? operation
            : operation.startsWith('HOLD_')
              ? 'HOLD'
              : operation.startsWith('PRUNE_')
                ? 'PRUNE'
                : 'CAPTURE')
      )
        throw new DurableFault('INVALID_REQUEST');
      assert(token, admit, finalInternal);
      commitStarted = true;
      const committed = commit(expectedRevision, next, () => assert(token, admit, finalInternal));
      commitStarted = false;
      if (!committed.ok) {
        if (committed.code === 'OUTCOME_UNKNOWN') throw new DurableUncertain();
        throw new DurableFault(
          committed.code === 'CONFLICT'
            ? 'STALE_REVISION'
            : committed.code === 'WRITE_FAILED'
              ? 'STORAGE_FAILED'
              : 'RECOVERY_REQUIRED',
        );
      }
      const snapshot = snapshotDurable(committed.value);
      if (
        !snapshot ||
        snapshot.meta.revision !== expectedRevision + 1 ||
        snapshot.meta.last_operation_id !== operationId
      )
        throw new DurableUncertain();
      const auditHealth = await log({
        operation,
        phase: 'RESULT',
        operationId,
        diagnosticId,
        expectedRevision,
        resultingRevision: snapshot.meta.revision,
        code: 'OK',
      });
      return {
        ok: true,
        result: Object.freeze({
          ok: true,
          outcome: 'COMMITTED',
          revision: snapshot.meta.revision,
          operationId,
          diagnosticId,
          auditHealth,
        }),
        snapshot,
        value,
      };
    } catch (error) {
      let mutated = false;
      if (effectStarted && mutationStarted) {
        try {
          mutated = mutationStarted() !== false;
        } catch {
          mutated = true;
        }
      }
      if (
        (mutated ||
          error instanceof DurableUncertain ||
          (!(error instanceof DurableFault) && (effectStarted || commitStarted))) &&
        operationId &&
        diagnosticId
      ) {
        uncertain = true;
        await log({
          operation,
          phase: 'RESULT',
          operationId,
          diagnosticId,
          expectedRevision: epoch(expectedRevision) ? expectedRevision : null,
          resultingRevision: null,
          code: 'OUTCOME_UNKNOWN',
        });
        return {
          ok: false,
          result: Object.freeze({
            ok: false,
            outcome: 'OUTCOME_UNKNOWN',
            code: 'OUTCOME_UNKNOWN',
            operationId,
            diagnosticId,
            auditHealth: 'DEGRADED',
          }),
        };
      }
      const code = error instanceof DurableFault ? error.code : 'STORAGE_FAILED';
      if (operationId && diagnosticId)
        await log({
          operation,
          phase: 'RESULT',
          operationId,
          diagnosticId,
          expectedRevision: epoch(expectedRevision) ? expectedRevision : null,
          resultingRevision: null,
          code,
        });
      return { ok: false, result: denial(code, operationId, diagnosticId) };
    }
  }
  return Object.freeze({
    withLane<T>(work: (lane: DurableLane) => Promise<T>): Promise<T | DurableDenied> {
      if (closed) return Promise.resolve(denial('OWNER_REVOKED'));
      if (uncertain) return Promise.resolve(denial('RECOVERY_REQUIRED'));
      if (activeToken) return Promise.resolve(denial('BUSY'));
      const token = Object.freeze({});
      activeToken = token;
      const lane: DurableLane = Object.freeze({
        read: () => read(token),
        assertCurrent: (admit?: () => void, finalInternal?: () => void) =>
          assert(token, admit, finalInternal),
        step: <T>(
          operation: DurableOperation,
          expectedRevision: number,
          prepare: (ctx: DurableContext) => DurablePlan<T>,
          admit?: () => void,
          finalInternal?: () => void,
        ) => step(token, operation, expectedRevision, prepare, admit, finalInternal),
      });
      const pending = Promise.resolve()
        .then(() => work(lane))
        .catch((error) => denial(error instanceof DurableFault ? error.code : 'STORAGE_FAILED'))
        .finally(() => {
          if (activeToken === token) activeToken = null;
          active = null;
        });
      active = pending;
      return pending;
    },
    close(): Promise<void> {
      if (closing) return closing;
      closed = true;
      closing = (active ?? Promise.resolve()).then(
        () => undefined,
        () => undefined,
      );
      return closing;
    },
    get available() {
      return !closed && !uncertain;
    },
  });
}
export type DurableCoordinator = ReturnType<typeof createDurableCoordinator>;
