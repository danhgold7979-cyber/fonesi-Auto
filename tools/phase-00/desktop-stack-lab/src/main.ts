import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { isHealthRequest, type HealthResult } from './contracts';

const runRoot = process.env['FONESI_LAB_RUN'];
const token = process.env['FONESI_LAB_TOKEN'];
const mode = process.env['FONESI_LAB_MODE'];
if (!runRoot || !token || (mode !== 'source' && mode !== 'package') ||
    readFileSync(join(runRoot, '.owner'), 'utf8') !== token) throw new Error('LAB_OWNER_REQUIRED');
app.setPath('userData', join(runRoot, mode + '-user-data'));
const results: Record<string, boolean> = {};
let finished = false;
let stage = 'START';
let diagnostic: { stage: string; kind: string; code?: string } | undefined;
let navigationEvidence: { denialObserved: boolean; trustedDocumentUnchanged: boolean } | undefined;
function finish(passed: boolean): void {
  if (finished) return;
  finished = true;
  writeFileSync(join(runRoot!, mode + '-result.json'), JSON.stringify({
    mode, passed, cases: results, diagnostic, navigationEvidence, electron: process.versions.electron,
    chromium: process.versions.chrome, node: process.versions.node, packaged: app.isPackaged,
  }));
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  app.exit(passed ? 0 : 1);
}
const watchdog = setTimeout(() => { diagnostic = { stage, kind: 'WATCHDOG_TIMEOUT' }; finish(false); }, 20_000);
watchdog.unref();
void app.whenReady().then(async () => {
  const trustedUrl = pathToFileURL(join(__dirname, 'index.html')).href;
  let deniedWindows = 0;
  let deniedNavigations = 0;
  const options = { show: false, webPreferences: {
    preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
    sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
    webviewTag: false, nodeIntegrationInSubFrames: false,
  }};
  const window = new BrowserWindow(options);
  const session = window.webContents.session;
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  // All lab resources are local; external runtime traffic is forbidden.
  session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file:') }));
  const guard = (candidate: BrowserWindow): void => {
    candidate.webContents.setWindowOpenHandler(() => { deniedWindows++; return { action: 'deny' }; });
    candidate.webContents.on('will-navigate', event => { event.preventDefault(); deniedNavigations++; });
    candidate.webContents.on('will-attach-webview', event => event.preventDefault());
  };
  guard(window);
  let preloadState: { sandboxed: boolean; contextIsolated: boolean; nodeBuiltinDenied: boolean } | undefined;
  ipcMain.on('lab:preload-state', (event, state) => {
    if (event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame &&
        event.senderFrame.url === trustedUrl) preloadState = state;
  });
  ipcMain.handle('lab:health', (event, payload: unknown): HealthResult => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== trustedUrl) return { ok: false, code: 'UNTRUSTED_SENDER' };
    if (!isHealthRequest(payload)) return { ok: false, code: 'INVALID_REQUEST' };
    return { ok: true, version: 1, correlation: payload.correlation };
  });
  stage = 'LOAD_SOURCE_VIEW';
  await window.loadFile(join(__dirname, 'index.html'));
  results['secure_runtime_state'] = preloadState?.contextIsolated === true &&
    preloadState.sandboxed === true && preloadState.nodeBuiltinDenied === true;
  results['expected_electron_version'] = process.versions.electron === '45.1.0';
  results['package_mode'] = app.isPackaged === (mode === 'package');
  stage = 'RENDERER_API_SMOKE';
  if (await window.webContents.executeJavaScript('true') !== true) throw new Error('INVALID_EXECUTION_RESULT');
  stage = 'RENDERER_CHECKS';
  const observed: { checks: Record<string, boolean>; diagnostic?: { stage: string; kind: string } } = await window.webContents.executeJavaScript(`(async () => {
    const checks = {};
    let stage = 'RENDER_WAIT';
    try {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (let i=0; i<50 && !document.querySelector('#ready'); i++) await wait(100);
    stage = 'BRIDGE_INSPECTION';
    Object.assign(checks, {
      react_rendered: document.querySelector('#ready')?.textContent === 'Synthetic lab — not Fonesi-Auto UI',
      no_require: typeof require === 'undefined', no_process: typeof process === 'undefined',
      no_preload_canary: typeof labPreloadCanary === 'undefined',
      bridge_allowlist: Object.keys(window.lab).join(',') === 'health',
      no_privileged_methods: ['spawn','exec','send','invoke','readFile','getSecret'].every(k => typeof window.lab[k] === 'undefined')
    });
    try { require('node:child_process').spawn('not-a-real-command'); checks.spawn_denied = false; }
    catch { checks.spawn_denied = true; }
    stage = 'VALID_IPC';
    const good = await window.lab.health({version:1, correlation:'lab-roundtrip'});
    checks.typed_roundtrip = good.ok === true && good.version === 1 && good.correlation === 'lab-roundtrip';
    const bad = [null, [], {}, {version:2,correlation:'lab-v2'}, {version:1,correlation:'x'.repeat(10000)},
      {version:1,correlation:'lab-extra',command:'spawn'}, {version:1,correlation:'lab-extra',operation:'unknown'}];
    for (let i=0;i<bad.length;i++) {
      stage = 'INVALID_IPC_' + i;
      const reply=await window.lab.health(bad[i]);
      checks['invalid_payload_'+i] = reply.ok === false && reply.code === 'INVALID_REQUEST';
    }
    return { checks };
    } catch(error) {
      const kind = ['TypeError','ReferenceError','SyntaxError','Error','EvalError','RangeError','SecurityError'].includes(error?.name) ? error.name : 'UNEXPECTED_EXCEPTION';
      return { checks, diagnostic: { stage, kind } };
    }
  })()`);
  Object.assign(results, observed.checks);
  if (observed.diagnostic) { diagnostic = observed.diagnostic; finish(false); return; }
  // Persist read-only observations before any navigation can invalidate its context.
  stage = 'WINDOW_DENIAL';
  await window.webContents.executeJavaScript("window.open('about:blank'); true");
  await new Promise(resolve => setTimeout(resolve, 200));
  results['window_open_denied'] = deniedWindows > 0 && BrowserWindow.getAllWindows().length === 1;
  stage = 'NAVIGATION_DENIAL';
  await window.webContents.executeJavaScript(`(() => {
    const link=document.createElement('a'); link.href='about:blank'; document.body.append(link); link.click(); return true;
  })()`);
  await new Promise(resolve => setTimeout(resolve, 200));
  navigationEvidence = { denialObserved: deniedNavigations > 0, trustedDocumentUnchanged: window.webContents.getURL() === trustedUrl };
  results['navigation_denied'] = navigationEvidence.denialObserved && navigationEvidence.trustedDocumentUnchanged;
  stage = 'UNTRUSTED_SENDER';
  const untrusted = new BrowserWindow(options);
  guard(untrusted);
  await untrusted.loadFile(join(__dirname, 'untrusted.html'));
  const reply: HealthResult = await untrusted.webContents.executeJavaScript(
    `window.lab.health({version:1,correlation:'lab-untrusted'})`);
  results['untrusted_sender_denied'] = reply.ok === false && reply.code === 'UNTRUSTED_SENDER';
  untrusted.destroy();
  finish(Object.keys(results).length === 21 && Object.values(results).every(Boolean));
}).catch((error: unknown) => {
  const name = error instanceof Error ? error.name : '';
  // Exact upstream v45.1.0 strings map to fixed codes; raw text is never retained.
  const failureCodes = new Map([
    ['WebFrame was removed before script could run. This normally means the underlying frame was destroyed', 'FRAME_REMOVED'],
    ['Render frame was disposed before WebFrameMain could be accessed', 'FRAME_DISPOSED'],
    ['Script failed to execute, this normally means an error was thrown. Check the renderer console for the error.', 'SCRIPT_EXECUTION_FAILED'],
    ['An object could not be cloned.', 'RESULT_NOT_CLONEABLE'],
  ]);
  const code = error instanceof Error ? failureCodes.get(error.message) ?? 'UNKNOWN_EXECUTION_FAILURE' : 'UNKNOWN_EXECUTION_FAILURE';
  diagnostic = { stage, code, kind: ['TypeError','ReferenceError','SyntaxError','Error','EvalError','RangeError','SecurityError'].includes(name) ? name : 'UNEXPECTED_EXCEPTION' };
  finish(false);
});
