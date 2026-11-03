import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import {
  DIAGNOSTICS_EXPORT_CHANNEL,
  DIAGNOSTICS_EXPORT_CODES,
  parseDiagnosticsExportRequest,
  diagnosticsExportError,
  type DiagnosticsExportCode,
} from './diagnostics-report-contract.ts';
type Service = Readonly<{ execute(raw: unknown, current: () => boolean): string }>;
export function installDiagnosticsExportBridge(
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
  admitCleanup: (event: IpcMainInvokeEvent) => Admission,
  service: () => Service | undefined,
) {
  let disposed = false;
  ipc.handle(DIAGNOSTICS_EXPORT_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    let release: (() => void) | undefined;
    if (disposed) return diagnosticsExportError(null, 'SESSION_REVOKED');
    const request = parseDiagnosticsExportRequest(raw);
    try {
      const admission = (request?.method === 'diagnostics.cancel' ? admitCleanup : admit)(event);
      if (!admission.ok)
        return diagnosticsExportError(
          null,
          DIAGNOSTICS_EXPORT_CODES.includes(admission.code as DiagnosticsExportCode)
            ? (admission.code as DiagnosticsExportCode)
            : 'INTERNAL_FAILURE',
        );
      release = admission.release;
      if (!request || extra.length) return diagnosticsExportError(null, 'INVALID_REQUEST');
      const active = service();
      if (!active) return diagnosticsExportError(request.requestId, 'SESSION_UNAVAILABLE');
      if (disposed || !admission.current())
        return diagnosticsExportError(request.requestId, 'SESSION_REVOKED');
      const result = active.execute(raw, () => !disposed && admission.operationCurrent());
      if (disposed || !admission.current())
        return diagnosticsExportError(request.requestId, 'SESSION_REVOKED');
      return result;
    } catch {
      return diagnosticsExportError(request?.requestId ?? null, 'INTERNAL_FAILURE');
    } finally {
      release?.();
    }
  });
  return Object.freeze({
    dispose() {
      disposed = true;
      ipc.removeHandler(DIAGNOSTICS_EXPORT_CHANNEL);
    },
  });
}
