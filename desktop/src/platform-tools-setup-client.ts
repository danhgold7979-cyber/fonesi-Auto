import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  parseSetupRequest,
  parseSetupResponse,
  setupError,
  type SetupRequest,
  type SetupCode,
} from './platform-tools-setup-contract.ts';
type Timer = { set: (callback: () => void, ms: number) => unknown; clear: (id: unknown) => void };
type Readiness = Readonly<{
  wait: () => Readonly<{ promise: Promise<boolean>; cancel: () => void }>;
}>;
const defaultTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
export function createPlatformToolsSetupClient(
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
  function call(method: SetupRequest['method'], revision?: unknown): Promise<string> {
    const initial = (code: SetupCode) => setupError(null, code, null, 'DEGRADED');
    if (disposed) return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (method !== 'platformTools.get' && !observed)
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (!Number.isSafeInteger(nextId + 1)) return Promise.resolve(initial('INTERNAL_FAILURE'));
    const requestId = `p${nextId + 1}`;
    const wire = JSON.stringify({
      version: 1,
      requestId,
      method,
      ...(method === 'platformTools.get' ? {} : { expectedRevision: revision }),
    });
    if (!parseSetupRequest(wire).ok) return Promise.resolve(initial('INVALID_SHAPE'));
    const lease = budget.acquire();
    if (!lease) return Promise.resolve(initial('BUSY'));
    nextId++;
    if (method !== 'platformTools.get') invalidate();
    const epoch = reconciliation;
    return new Promise<string>((resolve) => {
      let delivered = false,
        dispatched = false,
        handle: unknown;
      const failure = (code: SetupCode) =>
        setupError(
          requestId,
          code,
          null,
          'DEGRADED',
          code === 'TIMEOUT' || (dispatched && method !== 'platformTools.get')
            ? 'OUTCOME_UNKNOWN'
            : 'NOT_STARTED',
        );
      const deliver = (raw: string) => {
        if (!delivered) {
          delivered = true;
          resolve(raw);
        }
      };
      const waiting = method === 'platformTools.get' ? readiness?.wait() : undefined;
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
            const response = parseSetupResponse(raw);
            if (
              !response ||
              (response.requestId !== null && response.requestId !== requestId) ||
              (response.ok &&
                (method === 'platformTools.get'
                  ? response.outcome !== 'OBSERVED'
                  : response.outcome !== 'PENDING'))
            ) {
              invalidate();
              deliver(failure('INTERNAL_FAILURE'));
              return;
            }
            if (response.ok && method === 'platformTools.get' && epoch === reconciliation)
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
    read: () => call('platformTools.get'),
    requestSetup: (expectedRevision: unknown) =>
      call('platformTools.setup.request', expectedRevision),
    dispose: () => {
      disposed = true;
      invalidate();
      for (const p of pending) p.dispose();
    },
    outstanding: () => pending.size,
  });
}
