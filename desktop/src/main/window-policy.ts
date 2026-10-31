import type { Session, BrowserWindow } from 'electron';
import { CSP, ENTRY_URL, RENDERER_URL, permitsAsset, SCHEME } from './asset-policy.js';

export function securePreferences(session: Session) {
  return {
    session,
    sandbox: true,
    contextIsolation: true,
    webSecurity: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    allowRunningInsecureContent: false,
    webviewTag: false,
    plugins: false,
    experimentalFeatures: false,
    devTools: false,
  } as const;
}
export function installSessionPolicy(session: Session, html: string, renderer: string): () => void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !permitsAsset(details.url, details.method) }),
  );
  const denyDownload = (event: Electron.Event) => event.preventDefault();
  session.on('will-download', denyDownload);
  session.protocol.handle(SCHEME, (request) => {
    if (!permitsAsset(request.url, request.method)) return new Response('DENIED', { status: 403 });
    return new Response(request.url === RENDERER_URL ? renderer : html, {
      headers: {
        'content-type':
          request.url === RENDERER_URL
            ? 'text/javascript; charset=utf-8'
            : 'text/html; charset=utf-8',
        'content-security-policy': CSP,
        'x-content-type-options': 'nosniff',
      },
    });
  });
  return () => {
    session.protocol.unhandle(SCHEME);
    session.webRequest.onBeforeRequest(null);
    session.removeListener('will-download', denyDownload);
    // Permission denials remain on this private session; it is never reused.
  };
}
export function installWindowPolicy(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== ENTRY_URL) event.preventDefault();
  });
  window.webContents.on('will-frame-navigate', (event) => {
    if (event.url !== ENTRY_URL || !event.isMainFrame) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event) => event.preventDefault());
}
