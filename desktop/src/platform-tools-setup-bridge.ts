import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import type { PlatformToolsSetupService } from './main/platform-tools-setup-service.ts';
import { parseSetupRequest, setupError, type SetupCode } from './platform-tools-setup-contract.ts';
export const PLATFORM_TOOLS_SETUP_CHANNEL = 'foundation:platform-tools:v1';
const denied = (code: SetupCode, requestId: string | null = null, uncertain = false) =>
  setupError(requestId, code, null, 'DEGRADED', uncertain ? 'OUTCOME_UNKNOWN' : 'NOT_STARTED');
export function installPlatformToolsSetupBridge(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
  currentService: () => PlatformToolsSetupService | undefined,
) {
  let disposed = false;
  ipcMain.handle(PLATFORM_TOOLS_SETUP_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    if (disposed) return denied('SESSION_REVOKED');
    let release: (() => void) | undefined;
    let requestId: string | null = null;
    let dispatched = false;
    try {
      const admission = admit(event);
      if (!admission.ok) return denied(admission.code);
      release = admission.release;
      if (extra.length) return denied('INVALID_SHAPE');
      const parsed = parseSetupRequest(raw);
      if (!parsed.ok) return denied(parsed.code, parsed.requestId);
      requestId = parsed.value.requestId;
      const service = currentService();
      if (!service) return denied('SESSION_UNAVAILABLE', requestId);
      if (disposed || !admission.current()) return denied('SESSION_REVOKED', requestId);
      const operationCurrent = () => !disposed && admission.operationCurrent();
      dispatched = parsed.value.method === 'platformTools.setup.request';
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
      ipcMain.removeHandler(PLATFORM_TOOLS_SETUP_CHANNEL);
    },
  };
}
