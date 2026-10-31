import { app, BrowserWindow, protocol, session, Menu } from 'electron';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createLifecycle, disposeResources } from './main/lifecycle.js';
import { prepareOwnedProfile } from './main/profile-owner.js';
import { ENTRY_URL, SCHEME, ASSET_SHA256 } from './main/asset-policy.js';
import { securePreferences, installSessionPolicy, installWindowPolicy } from './main/window-policy.js';

// Authority-free internal bootstrap; no preload, bridge, IPC handlers or app services.
let disposeSession: (() => void) | undefined;
let lifecycle: ReturnType<typeof createLifecycle> | undefined;
let closing = false;
let cleanupComplete = true;
function cleanup(): boolean {
  if (closing) return cleanupComplete;
  closing = true;
  cleanupComplete = disposeResources([() => lifecycle?.dispose(), () => disposeSession?.()]);
  return cleanupComplete;
}
function fail(): void {
  if (closing) return;
  cleanup(); console.error('BOOTSTRAP_FAILED'); app.exit(1);
}
try {
  if (['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_FORCE_IS_PACKAGED'].some((name) => process.env[name] !== undefined) ||
    ['no-sandbox', 'disable-gpu-sandbox', 'disable-setuid-sandbox', 'disable-web-security',
      'allow-running-insecure-content', 'ignore-certificate-errors', 'remote-debugging-port',
      'remote-debugging-pipe', 'inspect', 'inspect-brk'].some((name) => app.commandLine.hasSwitch(name))) throw new Error('UNSAFE_OVERRIDE');
  // Launcher also fixes argv/environment; this guard cannot undo native startup flags.
  if (process.argv.slice(app.isPackaged ? 1 : 2).length !== 0) throw new Error('ARGUMENTS_REJECTED');
  const paths = prepareOwnedProfile(process.env.FONESI_BOOTSTRAP_ROOT);
  for (const [key, value] of Object.entries(paths)) app.setPath(key as 'userData' | 'sessionData' | 'logs' | 'crashDumps', value);
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true } }]);
  app.whenReady().then(async () => {
    // An invalidated/partial build must not launch even when old files remain.
    const markerPath = join(__dirname, '.verified-build.json');
    if (!lstatSync(markerPath).isFile() || lstatSync(markerPath).isSymbolicLink() || lstatSync(markerPath).size > 65536) throw new Error('BUILD_UNVERIFIED');
    const manifest: unknown = JSON.parse(readFileSync(markerPath, 'utf8'));
    if (manifest === null || typeof manifest !== 'object' || !('schema' in manifest) || manifest.schema !== 1 ||
      !('outputs' in manifest) || manifest.outputs === null || typeof manifest.outputs !== 'object') throw new Error('BUILD_UNVERIFIED');
    const hashes = manifest.outputs as Record<string, unknown>;
    const required = ['main.cjs', 'asset-policy.cjs', 'lifecycle.cjs', 'profile-owner.cjs', 'window-policy.cjs', 'status.html'];
    if (Object.keys(hashes).length !== required.length) throw new Error('BUILD_UNVERIFIED');
    for (const name of required) {
      const file = join(__dirname, name), stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024 ||
        createHash('sha256').update(readFileSync(file)).digest('hex') !== hashes[name]) throw new Error('BUILD_UNVERIFIED');
    }
    const assetPath = join(__dirname, 'status.html');
    if (!lstatSync(assetPath).isFile() || lstatSync(assetPath).isSymbolicLink() || lstatSync(assetPath).size > 65536) throw new Error('ASSET_REJECTED');
    const asset = readFileSync(assetPath);
    if (createHash('sha256').update(asset).digest('hex') !== ASSET_SHA256) throw new Error('ASSET_CHANGED');
    const html = asset.toString('utf8');
    Menu.setApplicationMenu(null);
    const ownedSession = session.fromPartition('auto-foundation-owned', { cache: false });
    disposeSession = installSessionPolicy(ownedSession, html);
    lifecycle = createLifecycle(() => {
      const window = new BrowserWindow({ width: 640, height: 360, show: false, webPreferences: securePreferences(ownedSession) });
      installWindowPolicy(window);
      window.webContents.on('render-process-gone', fail);
      window.loadURL(ENTRY_URL).then(() => { if (!window.isDestroyed()) { window.show(); console.log('BOOTSTRAP_READY'); } }).catch(fail);
      return { onClosed: (callback) => window.once('closed', callback), close: () => window.close(),
        destroy: () => { if (!window.isDestroyed()) window.destroy(); } };
    });
    lifecycle.start();
  }).catch(fail);
  app.on('window-all-closed', () => { if (!closing) app.quit(); });
  app.on('will-quit', () => {
    if (!cleanup()) { console.error('BOOTSTRAP_CLEANUP_FAILED'); app.exit(1); }
    else console.log('BOOTSTRAP_CLOSED');
  });
} catch { fail(); }
