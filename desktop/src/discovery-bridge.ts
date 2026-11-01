import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import type { DiscoveryRequest } from './discovery-contract.ts';
import { parseDiscoveryRequest, discoveryError, type DiscoveryCode } from './discovery-contract.ts';
type DiscoveryService = Readonly<{
  execute(request: DiscoveryRequest, current: () => boolean): Promise<string>;
}>;
export const DISCOVERY_CHANNEL = 'auto:discovery:v1';
const denied = (code: DiscoveryCode, requestId: string | null = null, uncertain = false) =>
  discoveryError(requestId, code, null, 'DEGRADED', uncertain ? 'OUTCOME_UNKNOWN' : 'NOT_STARTED');
export function installDiscoveryBridge(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
  admitCleanup: (event: IpcMainInvokeEvent) => Admission,
  currentService: () => DiscoveryService | undefined,
) {
  let disposed = false;
  ipcMain.handle(DISCOVERY_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    if (disposed) return denied('SESSION_REVOKED');
    let release: (() => void) | undefined;
    let requestId: string | null = null;
    let dispatched = false;
    try {
      const parsed = parseDiscoveryRequest(raw);
      const cleanup = extra.length === 0 && parsed.ok && parsed.value.method === 'discovery.stop';
      const admission = cleanup ? admitCleanup(event) : admit(event);
      if (!admission.ok) return denied(admission.code);
      release = admission.release;
      if (extra.length) return denied('INVALID_SHAPE');
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
      ipcMain.removeHandler(DISCOVERY_CHANNEL);
    },
  };
}
