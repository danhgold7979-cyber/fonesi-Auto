import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import {
  INPUT_INTERACTION_CODES,
  parseInputInteractionRequest,
  inputInteractionError,
  type InputInteractionRequest,
  type InputInteractionCode,
} from './input-interaction-contract.ts';

export const INPUT_INTERACTION_CHANNEL = 'foundation:input:v1';
type InputInteractionService = Readonly<{
  executeInput(request: InputInteractionRequest, current: () => boolean): Promise<string>;
}>;
type InputInteractionAdmission = Admission;
export function installInputInteractionBridge(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => InputInteractionAdmission,
  currentService: () => InputInteractionService | undefined,
) {
  let disposed = false;
  const denied = (code: InputInteractionCode, id: string | null = null) =>
    inputInteractionError(id, code, 'DEGRADED');
  ipcMain.handle(INPUT_INTERACTION_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    if (disposed) return denied('SESSION_REVOKED');
    let release: (() => void) | undefined,
      requestId: string | null = null;
    try {
      const admission = admit(event);
      if (!admission.ok)
        return denied(
          INPUT_INTERACTION_CODES.some((code) => code === admission.code)
            ? (admission.code as InputInteractionCode)
            : 'INTERNAL_FAILURE',
        );
      release = admission.release;
      if (extra.length) return denied('INVALID_SHAPE');
      const parsed = parseInputInteractionRequest(raw);
      if (!parsed.ok) return denied(parsed.code);
      requestId = parsed.value.requestId;
      const service = currentService();
      if (!service) return denied('SESSION_UNAVAILABLE', requestId);
      if (disposed || !admission.current()) return denied('SESSION_REVOKED', requestId);
      const current = () => !disposed && admission.operationCurrent();
      const result = await service.executeInput(parsed.value, current);
      if (disposed || !admission.current()) return denied('SESSION_REVOKED', requestId);
      return result;
    } catch {
      return denied('INTERNAL_FAILURE', requestId);
    } finally {
      release?.();
    }
  });
  return Object.freeze({
    dispose() {
      disposed = true;
      ipcMain.removeHandler(INPUT_INTERACTION_CHANNEL);
    },
  });
}
