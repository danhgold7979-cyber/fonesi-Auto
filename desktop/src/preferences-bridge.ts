import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import type { SettingsStore } from './main/settings-store.ts';
import {
  parseSettingsRequest,
  settingsSuccess,
  settingsError,
  type SettingsErrorCode,
  type SettingsMethod,
} from './settings-contract.ts';
export const PREFERENCES_CHANNEL = 'foundation:preferences:v1';
const unavailable = (code: SettingsErrorCode) =>
  settingsError(code, null, 'DEGRADED') ??
  '{"version":1,"ok":false,"code":"INTERNAL_FAILURE","diagnosticId":null,"auditHealth":"DEGRADED"}';
// Main-owned admission/service callbacks only; no generic service, SQL or file dispatch.
export function installPreferencesBridge(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
  currentStore: () => SettingsStore | undefined,
  committed: (method: SettingsMethod) => void = () => {},
  observed: () => void = () => {},
) {
  let disposed = false;
  ipcMain.handle(PREFERENCES_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    if (disposed) return unavailable('SESSION_REVOKED');
    let release: (() => void) | undefined;
    try {
      const admission = admit(event);
      if (!admission.ok) return unavailable(admission.code);
      release = admission.release;
      if (extra.length) return unavailable('INVALID_SHAPE');
      const parsed = parseSettingsRequest(raw);
      if (!parsed.ok) return unavailable(parsed.code);
      const store = currentStore();
      if (!store) return unavailable('RECOVERY_REQUIRED');
      const check = () => {
        if (disposed || !admission.current()) throw new Error('SESSION_REVOKED');
      };
      check();
      const token = store.grant([parsed.value.method], check);
      const result = await store.execute(token, parsed.value);
      let notificationFailed = false;
      if (result.ok && result.outcome === 'COMMITTED') {
        try {
          committed(parsed.value.method);
        } catch {
          notificationFailed = true;
        }
      }
      if (disposed || !admission.current()) return unavailable('SESSION_REVOKED');
      if (result.ok && parsed.value.method === 'preferences.get') {
        try {
          observed();
        } catch {
          notificationFailed = true;
        }
      }
      return result.ok
        ? (settingsSuccess(
            parsed.value.requestId,
            result.outcome,
            result.settings,
            notificationFailed ? 'DEGRADED' : result.auditHealth,
          ) ?? unavailable('INTERNAL_FAILURE'))
        : (settingsError(result.code, result.diagnosticId, result.auditHealth) ??
            unavailable('INTERNAL_FAILURE'));
    } catch {
      return unavailable('INTERNAL_FAILURE');
    } finally {
      release?.();
    }
  });
  return {
    dispose() {
      disposed = true;
      ipcMain.removeHandler(PREFERENCES_CHANNEL);
    },
  };
}
