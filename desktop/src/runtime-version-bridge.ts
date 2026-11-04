import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import type { RuntimeVersionService } from './main/runtime-version-service.ts';
import {
  parseRuntimeVersionRequest,
  runtimeVersionError,
  type RuntimeVersionCode,
} from './runtime-version-contract.ts';
export const RUNTIME_VERSION_CHANNEL = 'foundation:runtime-version:v2';
const denied = (code: RuntimeVersionCode, requestId: string | null = null, uncertain = false) =>
  runtimeVersionError(
    requestId,
    code,
    null,
    'DEGRADED',
    uncertain ? 'OUTCOME_UNKNOWN' : 'NOT_STARTED',
  );
export function installRuntimeVersionBridge(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
  currentService: () => RuntimeVersionService | undefined,
) {
  let disposed = false;
  ipcMain.handle(RUNTIME_VERSION_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    if (disposed) return denied('SESSION_REVOKED');
    let release: (() => void) | undefined;
    let requestId: string | null = null;
    let dispatched = false;
    try {
      const admission = admit(event);
      if (!admission.ok) return denied(admission.code);
      release = admission.release;
      if (extra.length) return denied('INVALID_SHAPE');
      const parsed = parseRuntimeVersionRequest(raw);
      if (!parsed.ok) return denied(parsed.code, parsed.requestId);
      requestId = parsed.value.requestId;
      const service = currentService();
      if (!service) return denied('SESSION_UNAVAILABLE', requestId);
      if (disposed || !admission.current()) return denied('SESSION_REVOKED', requestId);
      const operationCurrent = () => !disposed && admission.operationCurrent();
      dispatched = true;
      const result = await service.execute(parsed.value, operationCurrent);
      if (disposed || !admission.current()) return denied('SESSION_REVOKED', requestId, dispatched);
      return result;
    } catch {
      return denied('INTERNAL_FAILURE', requestId, dispatched);
    } finally {
      release?.();
    }
  });
  return {
    dispose() {
      disposed = true;
      ipcMain.removeHandler(RUNTIME_VERSION_CHANNEL);
    },
  };
}
