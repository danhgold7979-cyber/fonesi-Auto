import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  parseFleetRequest,
  parseFleetResponse,
  fleetError,
  snapshotFleetSelection,
  validFleetRevision,
  type FleetRequest,
  type FleetErrorCode,
} from './fleet-contract.ts';
type Invoke = (wire: string) => Promise<unknown>;
type Timer = {
  set: (callback: () => void, milliseconds: number) => unknown;
  clear: (handle: unknown) => void;
};
const defaultTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
type Readiness = Readonly<{
  wait: () => Readonly<{ promise: Promise<boolean>; cancel: () => void }>;
}>;
const failure = (code: FleetErrorCode) => fleetError(code, null, 'DEGRADED') as string;
export function createFleetClient(
  invoke: Invoke,
  budget: InvocationBudget = createInvocationBudget(),
  timer: Timer = defaultTimer,
  readiness?: Readiness,
) {
  let disposed = false,
    nextId = 0;
  const pending = new Set<{ dispose: () => void }>();
  function call(
    method: FleetRequest['method'],
    revision?: unknown,
    input?: unknown,
  ): Promise<string> {
    if (disposed) return Promise.resolve(failure('SESSION_UNAVAILABLE'));
    const patch = method === 'fleet.selection.replace' ? snapshotFleetSelection(input) : null;
    if (
      method !== 'fleet.get' &&
      (!validFleetRevision(revision) || (method === 'fleet.selection.replace' && !patch))
    )
      return Promise.resolve(failure('INVALID_SHAPE'));
    if (!Number.isSafeInteger(nextId + 1)) return Promise.resolve(failure('INTERNAL_FAILURE'));
    const requestId = `f${nextId + 1}`;
    const wire = JSON.stringify({
      version: 1,
      requestId,
      method,
      ...(method === 'fleet.get' ? {} : { expectedRevision: revision }),
      ...(method === 'fleet.selection.replace' ? { selection: patch } : {}),
    });
    if (!parseFleetRequest(wire).ok) return Promise.resolve(failure('INVALID_SHAPE'));
    const lease = budget.acquire();
    if (!lease) return Promise.resolve(failure('BUSY'));
    nextId++;
    return new Promise<string>((resolve) => {
      let delivered = false,
        handle: unknown;
      const deliver = (value: string) => {
        if (!delivered) {
          delivered = true;
          resolve(value);
        }
      };
      const waiting = method === 'fleet.get' ? readiness?.wait() : undefined;
      const entry = {
        dispose: () => {
          timer.clear(handle);
          waiting?.cancel();
          deliver(failure('SESSION_UNAVAILABLE'));
        },
      };
      pending.add(entry);
      handle = timer.set(() => {
        waiting?.cancel();
        deliver(failure('TIMEOUT'));
      }, 2000);
      let native: Promise<unknown>;
      try {
        native = waiting
          ? waiting.promise.then((ready) => {
              if (!ready || disposed || delivered) return failure('SESSION_UNAVAILABLE');
              return invoke(wire);
            })
          : Promise.resolve(invoke(wire));
      } catch {
        native = Promise.reject(new Error('INVOKE_FAILED'));
      }
      native
        .then(
          (raw) => {
            if (disposed || delivered) return;
            const response = parseFleetResponse(raw);
            if (
              !response ||
              (response.ok &&
                (response.requestId !== requestId ||
                  (method === 'fleet.get'
                    ? response.outcome !== 'OBSERVED'
                    : !['UNCHANGED', 'APPLIED'].includes(response.outcome))))
            ) {
              deliver(failure('INTERNAL_FAILURE'));
              return;
            }
            deliver(raw as string);
          },
          () => {
            if (!disposed) deliver(failure('INTERNAL_FAILURE'));
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
    read: () => call('fleet.get'),
    replaceSelection: (expectedRevision: unknown, selection: unknown) =>
      call('fleet.selection.replace', expectedRevision, selection),
    dispose: () => {
      disposed = true;
      for (const entry of pending) entry.dispose();
    },
    outstanding: () => pending.size,
  });
}
