import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  parseDiscoveryRequest,
  validDiscoveryRevision,
  parseDiscoveryResponse,
  discoveryError,
  type DiscoveryRequest,
  type DiscoveryCode,
} from './discovery-contract.ts';
type Timer = { set: (callback: () => void, ms: number) => unknown; clear: (id: unknown) => void };
type Readiness = Readonly<{
  wait: () => Readonly<{ promise: Promise<boolean>; cancel: () => void }>;
}>;
const defaultTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
export function createDiscoveryClient(
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
  let stopPending: Promise<string> | null = null;
  const pending = new Set<{ dispose: () => void }>();
  function call(
    method: DiscoveryRequest['method'],
    revision?: unknown,
    installation?: unknown,
  ): Promise<string> {
    const initial = (code: DiscoveryCode) => discoveryError(null, code, null, 'DEGRADED');
    if (disposed) return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (method !== 'discovery.get' && method !== 'discovery.stop' && !observed)
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (!Number.isSafeInteger(nextId + 1)) {
      disposed = true;
      invalidate();
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    }
    if (
      ((method === 'discovery.start' || method === 'discovery.refresh') &&
        !validDiscoveryRevision(revision)) ||
      (method === 'discovery.start' &&
        (!validDiscoveryRevision(installation) || installation === 0))
    )
      return Promise.resolve(initial('INVALID_SHAPE'));
    const requestId = `p${nextId + 1}`;
    const wire = JSON.stringify({
      version: 1,
      requestId,
      method,
      ...(method === 'discovery.start'
        ? { expectedRevision: revision, expectedInstallationRevision: installation }
        : method === 'discovery.refresh'
          ? { expectedRevision: revision }
          : {}),
    });
    if (!parseDiscoveryRequest(wire).ok) return Promise.resolve(initial('INVALID_SHAPE'));
    const lease = method === 'discovery.stop' ? budget.acquireCleanup() : budget.acquire();
    if (!lease) return Promise.resolve(initial('BUSY'));
    nextId++;
    if (method !== 'discovery.get') invalidate();
    const epoch = reconciliation;
    const completion = new Promise<string>((resolve) => {
      let delivered = false,
        dispatched = false,
        handle: unknown;
      const failure = (code: DiscoveryCode) =>
        discoveryError(
          requestId,
          code,
          null,
          'DEGRADED',
          code === 'TIMEOUT' || (dispatched && method !== 'discovery.get')
            ? 'OUTCOME_UNKNOWN'
            : 'NOT_STARTED',
        );
      const deliver = (raw: string) => {
        if (!delivered) {
          delivered = true;
          resolve(raw);
        }
      };
      const waiting = method === 'discovery.get' ? readiness?.wait() : undefined;
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
            const response = parseDiscoveryResponse(raw);
            if (
              !response ||
              (response.requestId !== null && response.requestId !== requestId) ||
              (response.ok &&
                (method === 'discovery.get'
                  ? response.outcome !== 'OBSERVED'
                  : response.outcome !== 'PENDING' ||
                    response.snapshot.operation !==
                      (
                        {
                          'discovery.start': 'START',
                          'discovery.refresh': 'REFRESH',
                          'discovery.stop': 'STOP',
                        } as const
                      )[method]))
            ) {
              invalidate();
              deliver(failure('INTERNAL_FAILURE'));
              return;
            }
            if (response.ok && method === 'discovery.get' && epoch === reconciliation)
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
          if (method === 'discovery.stop') stopPending = null;
        });
    });
    if (method === 'discovery.stop') stopPending = completion;
    return completion;
  }
  return Object.freeze({
    invalidateObservation: invalidate,
    get: () => call('discovery.get'),
    start: (expectedRevision: unknown, expectedInstallationRevision: unknown) =>
      call('discovery.start', expectedRevision, expectedInstallationRevision),
    refresh: (expectedRevision: unknown) => call('discovery.refresh', expectedRevision),
    stop: () => stopPending ?? call('discovery.stop'),
    dispose: () => {
      disposed = true;
      invalidate();
      for (const p of pending) p.dispose();
    },
    outstanding: () => pending.size,
  });
}
