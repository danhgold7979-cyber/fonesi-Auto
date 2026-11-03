import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import { parseHostResourceResponse, hostResourceResponse } from './host-resource-contract.ts';
type Timer = Readonly<{
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
}>;
export function createHostResourceClient(
  invoke: (wire: string) => Promise<unknown>,
  budget: InvocationBudget = createInvocationBudget(),
  timer: Timer = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
) {
  let closed = false,
    next = 0,
    active: string | null = null;
  const pending = new Set<() => void>();
  function call(method: 'SAMPLE' | 'CANCEL', targetId?: string): Promise<string> {
    if (closed || next >= 65536) return Promise.resolve(hostResourceResponse(null, 'CLOSED'));
    if (method === 'SAMPLE' && active) return Promise.resolve(hostResourceResponse(null, 'BUSY'));
    const lease = budget.acquire();
    if (!lease) return Promise.resolve(hostResourceResponse(null, 'BUSY'));
    const requestId = `h${++next}`;
    if (method === 'SAMPLE') active = requestId;
    const wire = JSON.stringify({
      version: 2,
      requestId,
      method,
      ...(method === 'CANCEL' ? { targetId } : {}),
    });
    return new Promise<string>((resolve) => {
      let delivered = false;
      const deliver = (result: string) => {
        if (!delivered) {
          delivered = true;
          resolve(result);
        }
      };
      const stop = () => deliver(hostResourceResponse(requestId, 'CLOSED'));
      pending.add(stop);
      const handle = timer.set(() => {
        deliver(hostResourceResponse(requestId, 'DEADLINE'));
        if (method === 'SAMPLE') void cancel();
      }, 3500);
      let promise: Promise<unknown>;
      try {
        promise = invoke(wire);
      } catch {
        promise = Promise.reject(new Error('HOST_REQUEST_FAILED'));
      }
      void promise
        .then(
          (raw) => {
            const parsed = parseHostResourceResponse(raw);
            deliver(
              !closed && parsed && parsed.requestId === requestId
                ? (raw as string)
                : hostResourceResponse(requestId, 'UNAVAILABLE'),
            );
          },
          () => deliver(hostResourceResponse(requestId, 'UNAVAILABLE')),
        )
        .finally(() => {
          timer.clear(handle);
          pending.delete(stop);
          lease.release();
          if (active === requestId) active = null;
        });
    });
  }
  function cancel(): Promise<string> {
    return active
      ? call('CANCEL', active)
      : Promise.resolve(hostResourceResponse(null, 'CANCELLED'));
  }
  return Object.freeze({
    sample: () => call('SAMPLE'),
    cancel,
    dispose() {
      if (closed) return;
      void cancel();
      closed = true;
      for (const stop of pending) stop();
    },
    get outstanding() {
      return pending.size;
    },
  });
}
