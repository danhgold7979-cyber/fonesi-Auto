import { randomUUID } from 'node:crypto';
import {
  DIAGNOSTIC_CHANNEL,
  diagnosticError,
  diagnosticSuccess,
} from './ipc-diagnostic-contract.ts';
import type { LogHealth, LogCode } from './log-contract.ts';
import type { ErrorCode } from './ipc-contract.ts';
import type { IpcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import {
  CHANNEL,
  parseRequest,
  parseDiagnosticRequest,
  errorResponse,
  publicResponse,
} from './ipc-contract.js';
import { ViewSession, type Caller } from './view-session.js';
import { ENTRY_URL } from './main/asset-policy.js';

// Only these public reads are admitted. No process/filesystem/domain adapter here.
export type BridgeLogging = Readonly<{
  newDiagnostic: () => string | null;
  outcome: (code: LogCode, reference: string | null) => void;
  health: LogHealth;
}>;
export function installFoundationBridge(
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>,
  logging: BridgeLogging = { newDiagnostic: randomUUID, outcome: () => {}, health: 'DEGRADED' },
) {
  const sessions = new Map<object, ViewSession>();
  function caller(event: IpcMainInvokeEvent): Caller | null {
    try {
      const frame = event.senderFrame;
      if (!frame || event.sender.isDestroyed()) return null;
      return {
        sender: event.sender,
        isMainFrame: frame === event.sender.mainFrame,
        origin: frame.origin,
        url: frame.url,
      };
    } catch {
      return null;
    }
  }
  for (const version of [2, 1] as const)
    ipcMain.handle(
      version === 1 ? CHANNEL : DIAGNOSTIC_CHANNEL,
      (event, raw: unknown, ...extra: unknown[]) => {
        let reference: string | null = null;
        const error = (code: ErrorCode): string => {
          try {
            logging.outcome(code, reference);
          } catch {
            /* No raw fallback or service authority. */
          }
          return version === 1
            ? errorResponse(code)
            : diagnosticError(
                code,
                reference,
                reference === null && code === 'INTERNAL_FAILURE' ? 'DEGRADED' : logging.health,
              );
        };
        try {
          const view = sessions.get(event.sender),
            identity = caller(event);
          if (!view || !identity) return error('UNTRUSTED_SENDER');
          const admission = view.admit(identity);
          if (!admission.ok) return error(admission.code);
          try {
            try {
              reference = logging.newDiagnostic();
            } catch {
              reference = null;
            }
            if (reference === null && version === 2) return error('INTERNAL_FAILURE');
            if (extra.length !== 0) return error('INVALID_SHAPE');
            const parsed = version === 1 ? parseRequest(raw) : parseDiagnosticRequest(raw);
            if (!parsed.ok) return error(parsed.code);
            if (!admission.current()) return error('SESSION_REVOKED');
            try {
              logging.outcome('OK', reference);
            } catch {
              /* Logging failure is not a public service failure. */
            }
            if (version === 1)
              return publicResponse({
                version: 1,
                requestId: parsed.request.requestId,
                method: parsed.request.method,
              });
            if (reference === null) return error('INTERNAL_FAILURE');
            return diagnosticSuccess(
              parsed.request.requestId,
              parsed.request.method,
              reference,
              logging.health,
            );
          } finally {
            admission.release();
          }
        } catch {
          return error('INTERNAL_FAILURE');
        }
      },
    );

  return {
    admitPreferences(event: IpcMainInvokeEvent) {
      const view = sessions.get(event.sender),
        identity = caller(event);
      if (!view || !identity) return { ok: false as const, code: 'UNTRUSTED_SENDER' as const };
      const admission = view.admit(identity);
      if (!admission.ok) return admission;
      return {
        ...admission,
        current: () => {
          const latest = caller(event);
          return (
            admission.current() &&
            latest !== null &&
            latest.sender === identity.sender &&
            latest.isMainFrame &&
            latest.origin === 'auto-foundation://app' &&
            latest.url === ENTRY_URL
          );
        },
      };
    },
    attach(window: BrowserWindow) {
      const contents = window.webContents;
      if (sessions.has(contents)) throw new Error('DUPLICATE_VIEW');
      const view = new ViewSession(contents, 'auto-foundation://app', ENTRY_URL);
      sessions.set(contents, view);
      contents.on('did-start-navigation', (details) => {
        if (details.isMainFrame) view.beginMainLoad(details.url);
      });
      contents.on('will-navigate', () => view.revoke());
      contents.on('will-frame-navigate', (details) => {
        if (details.isMainFrame) view.revoke();
      });
      contents.on('will-redirect', () => view.revoke());
      contents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
        if (isMainFrame) view.revoke();
      });
      contents.on('render-process-gone', () => view.revoke());
      contents.on('destroyed', () => {
        view.close();
        sessions.delete(contents);
      });
      window.on('close', () => view.revoke());
      window.on('closed', () => {
        view.close();
        sessions.delete(contents);
      });
      return {
        arm() {
          try {
            const frame = contents.mainFrame;
            return view.finishInitial({
              sender: contents,
              isMainFrame: true,
              origin: frame.origin,
              url: frame.url,
            });
          } catch {
            view.revoke();
            return false;
          }
        },
        status: () => view.status,
      };
    },
    dispose() {
      for (const view of sessions.values()) view.close();
      sessions.clear();
      ipcMain.removeHandler(CHANNEL);
      ipcMain.removeHandler(DIAGNOSTIC_CHANNEL);
    },
  };
}
