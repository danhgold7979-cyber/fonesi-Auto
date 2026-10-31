import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  parseSettingsRequest,
  parseSettingsResponse,
  settingsError,
  snapshotPatch,
  validSettingsRevision,
  type SettingsMethod,
  type SettingsErrorCode,
} from './settings-contract.ts';
type Invoke = (wire: string) => Promise<unknown>;
type Timer = {
  set: (callback: () => void, milliseconds: number) => unknown;
  clear: (handle: unknown) => void;
};
const defaultTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
export function createSettingsReadiness() {
  let ready = false,
    closed = false;
  const waiting = new Set<(value: boolean) => void>();
  return Object.freeze({
    signal() {
      if (closed || ready) return;
      ready = true;
      for (const resolve of waiting) resolve(true);
      waiting.clear();
    },
    wait() {
      let finish: (value: boolean) => void = () => {};
      const promise = new Promise<boolean>((resolve) => {
        finish = (value) => {
          waiting.delete(finish);
          resolve(value);
        };
        if (closed || ready) finish(!closed && ready);
        else waiting.add(finish);
      });
      return Object.freeze({ promise, cancel: () => finish(false) });
    },
    dispose() {
      closed = true;
      for (const resolve of waiting) resolve(false);
      waiting.clear();
    },
  });
}
type Readiness = Pick<ReturnType<typeof createSettingsReadiness>, 'wait'>;
const failure = (code: SettingsErrorCode) => settingsError(code, null, 'DEGRADED') as string;
export function createSettingsClient(
  invoke: Invoke,
  budget: InvocationBudget = createInvocationBudget(),
  timer: Timer = defaultTimer,
  readiness?: Readiness,
) {
  let disposed = false,
    nextId = 0;
  const pending = new Set<{ dispose: () => void }>();
  function call(method: SettingsMethod, revision?: unknown, input?: unknown): Promise<string> {
    if (disposed) return Promise.resolve(failure('SESSION_UNAVAILABLE'));
    const patch = method === 'preferences.update' ? snapshotPatch(input) : null;
    if (
      method !== 'preferences.get' &&
      (!validSettingsRevision(revision) || (method === 'preferences.update' && !patch))
    )
      return Promise.resolve(failure('INVALID_SHAPE'));
    if (!Number.isSafeInteger(nextId + 1)) return Promise.resolve(failure('INTERNAL_FAILURE'));
    const requestId = `p${nextId + 1}`;
    const wire = JSON.stringify({
      version: 1,
      requestId,
      method,
      ...(method === 'preferences.get' ? {} : { expectedRevision: revision }),
      ...(method === 'preferences.update' ? { patch } : {}),
    });
    if (!parseSettingsRequest(wire).ok) return Promise.resolve(failure('INVALID_SHAPE'));
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
      const waiting = method === 'preferences.get' ? readiness?.wait() : undefined;
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
            const response = parseSettingsResponse(raw);
            if (
              !response ||
              (response.ok &&
                (response.requestId !== requestId ||
                  (method === 'preferences.get'
                    ? response.outcome !== 'OBSERVED'
                    : !['UNCHANGED', 'COMMITTED'].includes(response.outcome))))
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
    read: () => call('preferences.get'),
    update: (expectedRevision: unknown, patch: unknown) =>
      call('preferences.update', expectedRevision, patch),
    reset: (expectedRevision: unknown) => call('preferences.reset', expectedRevision),
    restorePrevious: (expectedRevision: unknown) =>
      call('preferences.restorePrevious', expectedRevision),
    dispose: () => {
      disposed = true;
      for (const entry of pending) entry.dispose();
    },
    outstanding: () => pending.size,
  });
}
