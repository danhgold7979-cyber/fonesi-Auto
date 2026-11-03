import { app, BrowserWindow, protocol, session, Menu } from 'electron';
import { writeSync } from 'node:fs';
import { join } from 'node:path';
import { admitDemoRuntime, DEMO_URL } from './runtime-contract.js';
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; font-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
let ready = false,
  closed = false,
  quitting = false,
  failed = false;
let window: BrowserWindow | null = null;
function fail(): void {
  if (!failed) writeSync(2, 'DEMO_FAILED\n');
  failed = true;
  app.exit(1);
}
try {
  const admitted = admitDemoRuntime({
    entry: join(__dirname, 'main.cjs'),
    argv: process.argv,
    profile: process.env.FONESI_BOOTSTRAP_ROOT,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    environment: process.env,
  });
  if (app.isReady() || app.isPackaged) throw new Error('DEMO_ADMISSION_REJECTED');
  for (const flag of [
    'no-sandbox',
    'disable-web-security',
    'allow-running-insecure-content',
    'ignore-certificate-errors',
    'remote-debugging-port',
    'remote-debugging-pipe',
    'inspect',
    'inspect-brk',
  ])
    if (app.commandLine.hasSwitch(flag)) throw new Error('DEMO_ADMISSION_REJECTED');
  app.setPath('userData', admitted.profile);
  app.setPath('sessionData', admitted.profile);
  app.setPath('crashDumps', admitted.profile);
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'fonesi-demo',
      privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false },
    },
  ]);
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    if (ready && closed && quitting && !failed) writeSync(1, 'DEMO_CLOSED\n');
    else if (!failed) fail();
  });
  void app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      const owned = session.fromPartition(`demo-${admitted.ownerToken}`);
      owned.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      owned.setPermissionCheckHandler(() => false);
      owned.on('will-download', (event) => event.preventDefault());
      const allowed = new Map<string, readonly [string, string]>([
        [DEMO_URL, ['index.html', 'text/html; charset=utf-8']],
        ['fonesi-demo://app/renderer.js', ['renderer.js', 'text/javascript; charset=utf-8']],
        ['fonesi-demo://app/v9.css', ['v9.css', 'text/css; charset=utf-8']],
        ['fonesi-demo://app/demo.css', ['demo.css', 'text/css; charset=utf-8']],
      ]);
      owned.webRequest.onBeforeRequest((details, callback) =>
        callback({ cancel: !allowed.has(details.url) }),
      );
      owned.protocol.handle('fonesi-demo', (request) => {
        const asset = allowed.get(request.url);
        if (request.method !== 'GET' || !asset) return new Response(null, { status: 403 });
        const content = admitted.assets[asset[0]];
        if (!content) return new Response(null, { status: 403 });
        return new Response(new Uint8Array(content), {
          status: 200,
          headers: {
            'Content-Type': asset[1],
            'Content-Security-Policy': CSP,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      });
      window = new BrowserWindow({
        width: 1440,
        height: 900,
        useContentSize: true,
        show: false,
        title: 'Fonesi-Auto — DEMO',
        webPreferences: {
          session: owned,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          devTools: false,
        },
      });
      const contents = window.webContents;
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      contents.on('will-navigate', (event) => event.preventDefault());
      contents.on('will-attach-webview', (event) => event.preventDefault());
      contents.on('render-process-gone', () => fail());
      window.on('closed', () => {
        closed = true;
        window = null;
      });
      await contents.loadURL(DEMO_URL);
      if (!window || contents.getURL() !== DEMO_URL) throw new Error('DEMO_ORIGIN_REJECTED');
      ready = true;
      window.show();
      writeSync(1, 'DEMO_READY\n');
    })
    .catch(fail);
} catch {
  fail();
}
