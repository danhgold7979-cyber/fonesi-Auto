import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import { inspectAssociationAdmission } from './foundation-bridge.ts';
import {
  ASSOCIATION_CODES,
  parseAssociationRequest,
  associationError,
  type AssociationRequest,
  type AssociationCode,
} from './association-contract.ts';

export const ASSOCIATION_CHANNEL = 'foundation:association:v1';
type AssociationService = Readonly<{
  executeAssociation(
    request: AssociationRequest,
    current: () => boolean,
    admission: unknown,
  ): Promise<string>;
}>;
type AssociationAdmission = Admission & Readonly<{ associationAdmission?: unknown }>;
export function installAssociationBridge(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => AssociationAdmission,
  currentService: () => AssociationService | undefined,
) {
  let disposed = false;
  const denied = (code: AssociationCode, id: string | null = null) =>
    associationError(id, code, null, 'DEGRADED');
  ipcMain.handle(ASSOCIATION_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    if (disposed) return denied('SESSION_REVOKED');
    let release: (() => void) | undefined,
      requestId: string | null = null;
    try {
      const admission = admit(event);
      if (!admission.ok)
        return denied(
          ASSOCIATION_CODES.some((code) => code === admission.code)
            ? (admission.code as AssociationCode)
            : 'INTERNAL_FAILURE',
        );
      release = admission.release;
      const token = admission.associationAdmission;
      if (!inspectAssociationAdmission(token)) return denied('UNTRUSTED_SENDER');
      if (extra.length) return denied('INVALID_SHAPE');
      const parsed = parseAssociationRequest(raw);
      if (!parsed.ok) return denied(parsed.code);
      requestId = parsed.value.requestId;
      const service = currentService();
      if (!service) return denied('SESSION_UNAVAILABLE', requestId);
      if (disposed || !admission.current()) return denied('SESSION_REVOKED', requestId);
      const current = () => !disposed && admission.operationCurrent();
      const result = await service.executeAssociation(parsed.value, current, token);
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
      ipcMain.removeHandler(ASSOCIATION_CHANNEL);
    },
  });
}
