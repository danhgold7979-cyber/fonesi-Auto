import type { Method } from './ipc-contract.ts';
import { errorResponse, RESPONSE_BYTES } from './ipc-contract.ts';
export type Invoke = (wire: string) => Promise<unknown>;
export type Timer = {
  set: (callback: () => void, milliseconds: number) => unknown;
  clear: (handle: unknown) => void;
};
const defaultTimer: Timer = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// Native invokes cannot be canceled. Timed-out calls keep their native occupancy
// until settlement; disposal suppresses delivery, not hypothetical transport work.
export function createPublicClient(invoke: Invoke, timer: Timer = defaultTimer) {
  let disposed = false;
  let nextId = 0;
  const pending = new Set<{ dispose: () => void }>();
  function call(method: Method): Promise<string> {
    if (disposed) return Promise.resolve(errorResponse('SESSION_UNAVAILABLE'));
    if (pending.size >= 8) return Promise.resolve(errorResponse('BUSY'));
    if (!Number.isSafeInteger(nextId + 1))
      return Promise.resolve(errorResponse('INTERNAL_FAILURE'));
    const requestId = `r${++nextId}`;
    return new Promise<string>((resolve) => {
      let delivered = false;
      let timerHandle: unknown;
      const deliver = (value: string) => {
        if (!delivered) {
          delivered = true;
          resolve(value);
        }
      };
      const entry = {
        dispose: () => {
          timer.clear(timerHandle);
          deliver(errorResponse('SESSION_UNAVAILABLE'));
        },
      };
      pending.add(entry);
      timerHandle = timer.set(() => deliver(errorResponse('TIMEOUT')), 2000);
      let native: Promise<unknown>;
      try {
        native = invoke(JSON.stringify({ version: 1, requestId, method }));
      } catch {
        native = Promise.reject(new Error('INVOKE_FAILED'));
      }
      native
        .then(
          (raw) => {
            if (disposed || delivered) return;
            if (
              typeof raw !== 'string' ||
              raw.length > RESPONSE_BYTES ||
              new TextEncoder().encode(raw).byteLength > RESPONSE_BYTES
            ) {
              deliver(errorResponse('INTERNAL_FAILURE'));
              return;
            }
            // Main emits the strict public contract; never forward arbitrary native data.
            try {
              const value: unknown = JSON.parse(raw);
              if (value === null || typeof value !== 'object' || Array.isArray(value))
                throw new Error('RESPONSE');
              const response = value as Record<string, unknown>;
              if (response.version !== 1 || typeof response.ok !== 'boolean')
                throw new Error('RESPONSE');
              if (response.ok) {
                if (
                  Object.keys(response).length !== 4 ||
                  response.requestId !== requestId ||
                  response.result === null ||
                  typeof response.result !== 'object'
                )
                  throw new Error('RESPONSE');
                const result = response.result as Record<string, unknown>;
                const expected =
                  method === 'health.get'
                    ? { kind: 'health', status: 'READY', services: 'UNAVAILABLE' }
                    : {
                        kind: 'settings',
                        revision: 0,
                        persistence: 'NOT_PERSISTED',
                        theme: 'LIGHT',
                      };
                if (
                  Object.keys(result).length !== Object.keys(expected).length ||
                  Object.entries(expected).some(([key, item]) => result[key] !== item)
                )
                  throw new Error('RESPONSE');
                const canonical = JSON.stringify({
                  version: 1,
                  ok: true,
                  requestId,
                  result: expected,
                });
                if (raw !== canonical) throw new Error('NONCANONICAL_RESPONSE');
                deliver(canonical);
              } else {
                const codes = [
                  'INVALID_TRANSPORT',
                  'PAYLOAD_TOO_LARGE',
                  'INVALID_JSON',
                  'INVALID_SHAPE',
                  'UNSUPPORTED_VERSION',
                  'UNKNOWN_METHOD',
                  'UNTRUSTED_SENDER',
                  'SESSION_UNAVAILABLE',
                  'SESSION_REVOKED',
                  'BUSY',
                  'TIMEOUT',
                  'INTERNAL_FAILURE',
                ];
                if (
                  Object.keys(response).length !== 3 ||
                  typeof response.code !== 'string' ||
                  !codes.includes(response.code)
                )
                  throw new Error('RESPONSE');
                const canonical = JSON.stringify({ version: 1, ok: false, code: response.code });
                if (raw !== canonical) throw new Error('NONCANONICAL_RESPONSE');
                deliver(canonical);
              }
            } catch {
              deliver(errorResponse('INTERNAL_FAILURE'));
            }
          },
          () => {
            if (!disposed) deliver(errorResponse('INTERNAL_FAILURE'));
          },
        )
        .finally(() => {
          timer.clear(timerHandle);
          pending.delete(entry);
        });
    });
  }
  return {
    health: () => call('health.get'),
    settings: () => call('settings.get'),
    dispose: () => {
      disposed = true;
      for (const entry of pending) entry.dispose();
    },
    outstanding: () => pending.size,
  };
}
