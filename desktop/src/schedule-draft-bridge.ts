import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import { evaluateUnboundScheduleGapPreview } from './schedule-gap-contract.ts';
import {
  SCHEDULE_DRAFT_CHANNEL,
  SCHEDULE_DRAFT_CODES,
  parseScheduleDraftRequest,
  scheduleDraftError,
  scheduleDraftSuccess,
  type ScheduleDraftCode,
} from './schedule-draft-contract.ts';

/** Read-only bounded computation; main's admitted view is the only caller authority. */
export function installScheduleDraftBridge(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
) {
  let disposed = false;
  ipcMain.handle(SCHEDULE_DRAFT_CHANNEL, (event, raw: unknown, ...extra: unknown[]) => {
    if (disposed) return scheduleDraftError(null, 'SESSION_REVOKED');
    let release: (() => void) | undefined,
      requestId: string | null = null;
    try {
      const admission = admit(event);
      if (!admission.ok)
        return scheduleDraftError(
          null,
          SCHEDULE_DRAFT_CODES.some((code) => code === admission.code)
            ? (admission.code as ScheduleDraftCode)
            : 'INTERNAL_FAILURE',
        );
      release = admission.release;
      if (extra.length) return scheduleDraftError(null, 'INVALID_SHAPE');
      const parsed = parseScheduleDraftRequest(raw);
      if (!parsed.ok) return scheduleDraftError(null, parsed.code);
      requestId = parsed.value.requestId;
      if (disposed || !admission.current()) return scheduleDraftError(requestId, 'SESSION_REVOKED');
      const result = evaluateUnboundScheduleGapPreview(parsed.value.schedule, parsed.value.request);
      if (disposed || !admission.current()) return scheduleDraftError(requestId, 'SESSION_REVOKED');
      if (!result.ok) return scheduleDraftError(requestId, result.code);
      return (
        scheduleDraftSuccess(requestId, result) ?? scheduleDraftError(requestId, 'INTERNAL_FAILURE')
      );
    } catch {
      return scheduleDraftError(requestId, 'INTERNAL_FAILURE');
    } finally {
      release?.();
    }
  });
  return Object.freeze({
    dispose() {
      disposed = true;
      ipcMain.removeHandler(SCHEDULE_DRAFT_CHANNEL);
    },
  });
}
