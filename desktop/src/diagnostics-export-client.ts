import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  diagnosticExportId,
  diagnosticExportRevision,
  parseDiagnosticsExportRequest,
  parseDiagnosticsExportResponse,
  diagnosticsExportError,
  type DiagnosticsExportRequest,
} from './diagnostics-report-contract.ts';
type Timer = Readonly<{ set(fn: () => void, ms: number): unknown; clear(id: unknown): void }>;
const timerDefault: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
export function createDiagnosticsExportClient(
  invoke: (wire: string) => Promise<unknown>,
  budget: InvocationBudget = createInvocationBudget(),
  timer: Timer = timerDefault,
) {
  let next = 0,
    closed = false;
  const pending = new Set<() => void>();
  function call(method: DiagnosticsExportRequest['method'], value?: unknown): Promise<string> {
    if (closed || next >= 999999999999999)
      return Promise.resolve(diagnosticsExportError(null, 'SESSION_UNAVAILABLE'));
    if (
      (method === 'diagnostics.export' && !diagnosticExportRevision(value)) ||
      (method === 'diagnostics.cancel' && !diagnosticExportId(value))
    )
      return Promise.resolve(diagnosticsExportError(null, 'INVALID_REQUEST'));
    const id = `p${++next}`;
    const wire = JSON.stringify({
      version: 1,
      requestId: id,
      method,
      ...(method === 'diagnostics.export'
        ? { expectedRevision: value }
        : method === 'diagnostics.cancel'
          ? { operationId: value }
          : {}),
    });
    if (!parseDiagnosticsExportRequest(wire))
      return Promise.resolve(diagnosticsExportError(id, 'INVALID_REQUEST'));
    let lease: ReturnType<InvocationBudget['acquire']>;
    try {
      lease = method === 'diagnostics.cancel' ? budget.acquireCleanup() : budget.acquire();
    } catch {
      return Promise.resolve(diagnosticsExportError(id, 'INTERNAL_FAILURE'));
    }
    if (!lease)
      return Promise.resolve(diagnosticsExportError(id, closed ? 'SESSION_UNAVAILABLE' : 'BUSY'));
    const ownedLease = lease;
    const release = () => {
      try {
        ownedLease.release();
      } catch {
        /* Never fabricate a released custom lease. */
      }
    };
    if (closed) {
      release();
      return Promise.resolve(diagnosticsExportError(id, 'SESSION_UNAVAILABLE'));
    }
    return new Promise((resolve) => {
      let delivered = false,
        handle: unknown;
      const deliver = (raw: string) => {
        if (!delivered) {
          delivered = true;
          resolve(raw);
        }
      };
      const dispose = () => deliver(diagnosticsExportError(id, 'SESSION_UNAVAILABLE'));
      pending.add(dispose);
      const cleanup = () => {
        try {
          timer.clear(handle);
        } catch {
          /* Actual invoke settlement still releases its lease. */
        }
        pending.delete(dispose);
        release();
      };
      try {
        handle = timer.set(() => deliver(diagnosticsExportError(id, 'TIMEOUT')), 2000);
      } catch {
        deliver(diagnosticsExportError(id, closed ? 'SESSION_UNAVAILABLE' : 'INTERNAL_FAILURE'));
        cleanup();
        return;
      }
      // Budget/timer callbacks cannot admit a mutation after disposal or visible expiry.
      if (closed || delivered) {
        dispose();
        cleanup();
        return;
      }
      let native: Promise<unknown>;
      try {
        native = Promise.resolve(invoke(wire));
      } catch {
        native = Promise.reject(Error('INVOKE_FAILED'));
      }
      void native
        .then(
          (raw) => {
            if (delivered || closed) return;
            const response = parseDiagnosticsExportResponse(raw);
            if (!response || (response.requestId !== null && response.requestId !== id)) {
              deliver(diagnosticsExportError(id, 'INTERNAL_FAILURE'));
              return;
            }
            deliver(raw as string);
          },
          () => deliver(diagnosticsExportError(id, 'INTERNAL_FAILURE')),
        )
        .finally(cleanup);
      // Timeout/dispose do not release a still-outstanding native lease or retry mutation.
    });
  }
  return Object.freeze({
    get: () => call('diagnostics.get'),
    export: (revision: unknown) => call('diagnostics.export', revision),
    cancel: (operationId: unknown) => call('diagnostics.cancel', operationId),
    dispose() {
      closed = true;
      for (const stop of pending) stop();
    },
  });
}
