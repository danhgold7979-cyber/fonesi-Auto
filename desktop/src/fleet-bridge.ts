import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import type { FleetService } from './main/fleet-service.ts';
import { parseFleetRequest, fleetError, type FleetErrorCode } from './fleet-contract.ts';
export const FLEET_CHANNEL = 'foundation:fleet:v1';
const unavailable = (code: FleetErrorCode) => fleetError(code, null, 'DEGRADED');
// Selection authority is main-session-bound; no device effect is exposed here.
export function installFleetBridge(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
  currentService: () => FleetService | undefined,
) {
  let disposed = false;
  ipcMain.handle(FLEET_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    if (disposed) return unavailable('SESSION_REVOKED');
    let release: (() => void) | undefined;
    let revoke: (() => void) | undefined;
    try {
      const admission = admit(event);
      if (!admission.ok) return unavailable(admission.code);
      release = admission.release;
      if (extra.length) return unavailable('INVALID_SHAPE');
      const parsed = parseFleetRequest(raw);
      if (!parsed.ok) return unavailable(parsed.code);
      const service = currentService();
      if (!service) return unavailable('FLEET_UNAVAILABLE');
      const check = () => {
        if (disposed || !admission.current()) throw new Error('SESSION_REVOKED');
      };
      check();
      const token = service.grant(check);
      revoke = () => service.revoke(token);
      const result = await service.execute(token, parsed.value);
      if (disposed || !admission.current()) return unavailable('SESSION_REVOKED');
      return result;
    } catch {
      return unavailable('INTERNAL_FAILURE');
    } finally {
      revoke?.();
      release?.();
    }
  });
  return {
    dispose() {
      disposed = true;
      ipcMain.removeHandler(FLEET_CHANNEL);
    },
  };
}
