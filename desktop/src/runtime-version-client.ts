import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  parseRuntimeVersionRequest,
  validRuntimeVersionRevision,
  parseRuntimeVersionResponse,
  runtimeVersionError,
  type RuntimeVersionRequest,
  type RuntimeVersionCode,
} from './runtime-version-contract.ts';
type Timer = { set: (callback: () => void, ms: number) => unknown; clear: (id: unknown) => void };
type Readiness = Readonly<{
  wait: () => Readonly<{ promise: Promise<boolean>; cancel: () => void }>;
}>;
const defaultTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
export function createRuntimeVersionClient(
  invoke: (wire: string) => Promise<unknown>,
  budget: InvocationBudget = createInvocationBudget(),
  timer: Timer = defaultTimer,
  readiness?: Readiness,
) {
  let disposed = false,
    nextId = 0,
    observed = false;
  let reconciliation: object = Object.freeze({});
  const invalidate = () => {
    observed = false;
    reconciliation = Object.freeze({});
  };
  const pending = new Set<{ dispose: () => void }>();
  function call(
    method: RuntimeVersionRequest['method'],
    revision?: unknown,
    installation?: unknown,
  ): Promise<string> {
    const initial = (code: RuntimeVersionCode) => runtimeVersionError(null, code, null, 'DEGRADED');
    if (disposed) return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (method !== 'runtimeVersion.get' && !observed)
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (!Number.isSafeInteger(nextId + 1)) {
      disposed = true;
      invalidate();
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    }
    if (
      method !== 'runtimeVersion.get' &&
      (!validRuntimeVersionRevision(revision) ||
        !validRuntimeVersionRevision(installation) ||
        installation === 0)
    )
      return Promise.resolve(initial('INVALID_SHAPE'));
    const requestId = `p${nextId + 1}`;
    const wire = JSON.stringify({
      version: 2,
      requestId,
      method,
      ...(method === 'runtimeVersion.get'
        ? {}
        : { expectedRevision: revision, expectedInstallationRevision: installation }),
    });
    if (!parseRuntimeVersionRequest(wire).ok) return Promise.resolve(initial('INVALID_SHAPE'));
    const lease = budget.acquire();
    if (!lease) return Promise.resolve(initial('BUSY'));
    nextId++;
    if (method !== 'runtimeVersion.get') invalidate();
    const epoch = reconciliation;
    return new Promise<string>((resolve) => {
      let delivered = false,
        dispatched = false,
        handle: unknown;
      const failure = (code: RuntimeVersionCode) =>
        runtimeVersionError(
          requestId,
          code,
          null,
          'DEGRADED',
          code === 'TIMEOUT' || (dispatched && method !== 'runtimeVersion.get')
            ? 'OUTCOME_UNKNOWN'
            : 'NOT_STARTED',
        );
      const deliver = (raw: string) => {
        if (!delivered) {
          delivered = true;
          resolve(raw);
        }
      };
      const waiting = method === 'runtimeVersion.get' ? readiness?.wait() : undefined;
      const entry = {
        dispose: () => {
          invalidate();
          timer.clear(handle);
          waiting?.cancel();
          deliver(failure('SESSION_UNAVAILABLE'));
        },
      };
      pending.add(entry);
      handle = timer.set(() => {
        if (delivered) return;
        invalidate();
        waiting?.cancel();
        deliver(failure('TIMEOUT'));
      }, 2000);
      const dispatch = () => {
        dispatched = true;
        return invoke(wire);
      };
      let native: Promise<unknown>;
      try {
        native = waiting
          ? waiting.promise.then((ready) => {
              if (!ready || disposed || delivered) return failure('SESSION_UNAVAILABLE');
              return dispatch();
            })
          : Promise.resolve(dispatch());
      } catch {
        native = Promise.reject(Error('INVOKE_FAILED'));
      }
      native
        .then(
          (raw) => {
            if (disposed || delivered) return;
            const response = parseRuntimeVersionResponse(raw);
            if (
              !response ||
              (response.requestId !== null && response.requestId !== requestId) ||
              (response.ok &&
                (method === 'runtimeVersion.get'
                  ? response.outcome !== 'OBSERVED'
                  : response.outcome !== 'PENDING'))
            ) {
              invalidate();
              deliver(failure('INTERNAL_FAILURE'));
              return;
            }
            if (response.ok && method === 'runtimeVersion.get' && epoch === reconciliation)
              observed = true;
            else if (!response.ok) invalidate();
            deliver(raw as string);
          },
          () => {
            if (disposed || delivered) return;
            invalidate();
            deliver(failure('INTERNAL_FAILURE'));
          },
        )
        .finally(() => {
          timer.clear(handle);
          pending.delete(entry);
          lease.release();
        });
    });
  }
  return Object.freeze({
    invalidateObservation: invalidate,
    readVersion: () => call('runtimeVersion.get'),
    verifyVersion: (expectedRevision: unknown, expectedInstallationRevision: unknown) =>
      call('runtimeVersion.request', expectedRevision, expectedInstallationRevision),
    dispose: () => {
      disposed = true;
      invalidate();
      for (const p of pending) p.dispose();
    },
    outstanding: () => pending.size,
  });
}
