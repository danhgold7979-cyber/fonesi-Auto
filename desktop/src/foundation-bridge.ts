import type { IpcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { CHANNEL, parseRequest, errorResponse, publicResponse } from './ipc-contract.js';
import { ViewSession, type Caller } from './view-session.js';
import { ENTRY_URL } from './main/asset-policy.js';

// Only these public reads are admitted. No process/filesystem/domain adapter here.
export function installFoundationBridge(ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>) {
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
  ipcMain.handle(CHANNEL, (event, raw: unknown, ...extra: unknown[]) => {
    try {
      const view = sessions.get(event.sender),
        identity = caller(event);
      if (!view || !identity) return errorResponse('UNTRUSTED_SENDER');
      const admission = view.admit(identity);
      if (!admission.ok) return errorResponse(admission.code);
      try {
        if (extra.length !== 0) return errorResponse('INVALID_SHAPE');
        const parsed = parseRequest(raw);
        if (!parsed.ok) return errorResponse(parsed.code);
        if (!admission.current()) return errorResponse('SESSION_REVOKED');
        // Atomic synchronous public-read construction; no await or external sink.
        return publicResponse(parsed.request);
      } finally {
        admission.release();
      }
    } catch {
      return errorResponse('INTERNAL_FAILURE');
    }
  });
  return {
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
    },
  };
}
