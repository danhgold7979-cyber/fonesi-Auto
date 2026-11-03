import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  snapshotScheduleDraftInput,
  parseScheduleDraftRequest,
  parseScheduleDraftResponse,
  scheduleDraftError,
  type ScheduleDraftCode,
} from './schedule-draft-contract.ts';

type Timer = Readonly<{
  set: (callback: () => void, milliseconds: number) => unknown;
  clear: (handle: unknown) => void;
}>;
type Readiness = Readonly<{
  wait: () => Readonly<{ promise: Promise<boolean>; cancel: () => void }>;
}>;
const defaultTimer: Timer = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
/** One explicit unsaved preview. Cancellation revokes delivery, never frees an unsettled invoke. */
export function createScheduleDraftClient(
  invoke: (wire: string) => Promise<unknown>,
  budget: InvocationBudget = createInvocationBudget(),
  timer: Timer = defaultTimer,
  readiness?: Readiness,
) {
  let disposed = false,
    nextId = 0;
  let pending: Readonly<{ cancel: (code: ScheduleDraftCode) => void }> | null = null;
  function preview(input: unknown): Promise<string> {
    const failed = (code: ScheduleDraftCode) => scheduleDraftError(null, code);
    if (disposed) return Promise.resolve(failed('SESSION_UNAVAILABLE'));
    if (pending !== null) return Promise.resolve(failed('BUSY'));
    const snapshot = snapshotScheduleDraftInput(input);
    if (!snapshot) return Promise.resolve(failed('INVALID_SHAPE'));
    if (!Number.isSafeInteger(nextId + 1)) return Promise.resolve(failed('SESSION_UNAVAILABLE'));
    const requestId = `d${nextId + 1}`;
    const wire = JSON.stringify({
      version: 1,
      requestId,
      method: 'schedule.draft.preview',
      schedule: snapshot.schedule,
      request: snapshot.request,
    });
    const parsed = parseScheduleDraftRequest(wire);
    if (!parsed.ok) return Promise.resolve(failed(parsed.code));
    const lease = budget.acquire();
    if (!lease) return Promise.resolve(failed('BUSY'));
    nextId++;
    return new Promise<string>((resolve) => {
      let delivered = false,
        handle: unknown,
        waiting: ReturnType<Readiness['wait']> | undefined;
      const deliver = (raw: string) => {
        if (delivered) return;
        delivered = true;
        resolve(raw);
      };
      const entry = Object.freeze({
        cancel: (code: ScheduleDraftCode) => {
          deliver(scheduleDraftError(requestId, code));
          timer.clear(handle);
          waiting?.cancel();
        },
      });
      pending = entry;
      let native: Promise<unknown>;
      try {
        waiting = readiness?.wait();
        handle = timer.set(() => entry.cancel('TIMEOUT'), 2000);
        native = waiting
          ? waiting.promise.then((ready) => {
              if (!ready || disposed || delivered)
                return scheduleDraftError(requestId, 'SESSION_UNAVAILABLE');
              return invoke(wire);
            })
          : Promise.resolve(
              disposed || delivered
                ? scheduleDraftError(requestId, 'SESSION_UNAVAILABLE')
                : invoke(wire),
            );
      } catch {
        native = Promise.reject(Error('INVOKE_FAILED'));
      }
      native
        .then(
          (raw) => {
            if (disposed || delivered) return;
            const response = parseScheduleDraftResponse(raw);
            if (
              !response ||
              (response.requestId !== null && response.requestId !== requestId) ||
              (response.ok &&
                (response.requestId !== requestId ||
                  response.preview.scope.draftId !== snapshot.request.scope.draftId ||
                  response.preview.scope.draftRevision !== snapshot.request.scope.draftRevision ||
                  response.preview.preview.zone !== snapshot.request.zone ||
                  response.preview.window.fromDate !== snapshot.request.fromDate ||
                  response.preview.window.throughDate !== snapshot.request.throughDate ||
                  response.preview.window.limit !== snapshot.request.limit))
            ) {
              deliver(scheduleDraftError(requestId, 'INTERNAL_FAILURE'));
              return;
            }
            deliver(raw as string);
          },
          () => {
            if (!disposed && !delivered) deliver(scheduleDraftError(requestId, 'INTERNAL_FAILURE'));
          },
        )
        .finally(() => {
          timer.clear(handle);
          waiting?.cancel();
          if (pending === entry) pending = null;
          lease.release();
        });
    });
  }
  return Object.freeze({
    preview,
    cancel: () => pending?.cancel('CANCELLED'),
    dispose: () => {
      disposed = true;
      pending?.cancel('SESSION_UNAVAILABLE');
    },
    outstanding: () => (pending === null ? 0 : 1),
  });
}
