import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  parseInputInteractionRequest,
  validInputInteractionRevision,
  validInputInteractionUuid,
  INPUT_ACTIONS,
  parseInputInteractionResponse,
  inputInteractionError,
  type InputInteractionRequest,
  type InputInteractionCode,
} from './input-interaction-contract.ts';
type Timer = { set: (callback: () => void, ms: number) => unknown; clear: (id: unknown) => void };
type Readiness = Readonly<{
  wait: () => Readonly<{ promise: Promise<boolean>; cancel: () => void }>;
}>;
const defaultTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
export function createInputInteractionClient(
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
    method: InputInteractionRequest['method'],
    deviceId?: unknown,
    action?: unknown,
    revision?: unknown,
    registryRevision?: unknown,
    selectionRevision?: unknown,
  ): Promise<string> {
    const initial = (code: InputInteractionCode) => inputInteractionError(null, code, 'DEGRADED');
    if (disposed) return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (method !== 'input.get' && !observed) return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (!Number.isSafeInteger(nextId + 1)) {
      disposed = true;
      invalidate();
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    }
    if (
      method === 'input.press' &&
      (!validInputInteractionUuid(deviceId) ||
        typeof action !== 'string' ||
        !INPUT_ACTIONS.some((candidate) => candidate === action) ||
        !validInputInteractionRevision(revision) ||
        !validInputInteractionRevision(registryRevision) ||
        !validInputInteractionRevision(selectionRevision))
    )
      return Promise.resolve(initial('INVALID_SHAPE'));
    const requestId = `p${nextId + 1}`;
    const wire = JSON.stringify({
      version: 1,
      requestId,
      method,
      ...(method === 'input.press'
        ? {
            deviceId,
            action,
            expectedRevision: revision,
            expectedRegistryRevision: registryRevision,
            expectedSelectionRevision: selectionRevision,
          }
        : {}),
    });
    if (!parseInputInteractionRequest(wire).ok) return Promise.resolve(initial('INVALID_SHAPE'));
    const lease = budget.acquire();
    if (!lease) return Promise.resolve(initial('BUSY'));
    nextId++;
    if (method !== 'input.get') invalidate();
    const epoch = reconciliation;
    const completion = new Promise<string>((resolve) => {
      let delivered = false,
        handle: unknown;
      const failure = (code: InputInteractionCode) =>
        inputInteractionError(requestId, code, 'DEGRADED');
      const deliver = (raw: string) => {
        if (!delivered) {
          delivered = true;
          resolve(raw);
        }
      };
      const waiting = method === 'input.get' ? readiness?.wait() : undefined;
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
            const response = parseInputInteractionResponse(raw);
            if (
              !response ||
              (response.requestId !== null && response.requestId !== requestId) ||
              (response.ok &&
                (method === 'input.get'
                  ? response.outcome !== 'STATUS'
                  : response.outcome !== 'PENDING' ||
                    response.snapshot.deviceId !== deviceId ||
                    response.snapshot.action !== action ||
                    response.snapshot.registryRevision !== registryRevision ||
                    response.snapshot.selectionRevision !== selectionRevision ||
                    response.snapshot.revision !== (revision as number) + 1))
            ) {
              invalidate();
              deliver(failure('INTERNAL_FAILURE'));
              return;
            }
            if (response.ok && method === 'input.get' && epoch === reconciliation)
              observed = !['PENDING', 'OUTCOME_UNKNOWN', 'CLOSED'].includes(
                response.snapshot.state,
              );
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
    return completion;
  }
  return Object.freeze({
    invalidateObservation: invalidate,
    get: () => call('input.get'),
    press: (
      expectedRevision: unknown,
      expectedSelectionRevision: unknown,
      expectedRegistryRevision: unknown,
      deviceId: unknown,
      action: unknown,
    ) =>
      call(
        'input.press',
        deviceId,
        action,
        expectedRevision,
        expectedRegistryRevision,
        expectedSelectionRevision,
      ),
    dispose: () => {
      disposed = true;
      invalidate();
      for (const p of pending) p.dispose();
    },
    outstanding: () => pending.size,
  });
}
