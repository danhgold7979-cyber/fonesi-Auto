import { ApplicationLogger } from './main/logging.js';
import { createLogShutdown } from './main/log-shutdown.js';
import { installFoundationBridge } from './foundation-bridge.js';
import { app, BrowserWindow, protocol, session, Menu, ipcMain } from 'electron';
import { readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createLifecycle, disposeResources } from './main/lifecycle.js';
import { prepareOwnedProfile } from './main/profile-owner.js';
import { ENTRY_URL, SCHEME, ASSET_SHA256 } from './main/asset-policy.js';
import {
  securePreferences,
  installSessionPolicy,
  installWindowPolicy,
} from './main/window-policy.js';

// Public-read-only foundation bridge; no native/domain service authority.
let bridge: ReturnType<typeof installFoundationBridge> | undefined;
let disposeSession: (() => void) | undefined;
let lifecycle: ReturnType<typeof createLifecycle> | undefined;
let closing = false;
let cleanupComplete = true;
let logger: ApplicationLogger | undefined;
let mainReady = false;
let loggingNotice = false;
function reportLoggingDegraded(): void {
  if (!loggingNotice) {
    loggingNotice = true;
    console.error('LOGGING_DEGRADED');
  }
}
function cleanup(): boolean {
  if (closing) return cleanupComplete;
  closing = true;
  cleanupComplete = disposeResources([
    () => bridge?.dispose(),
    () => lifecycle?.dispose(),
    () => disposeSession?.(),
  ]);
  return cleanupComplete;
}
function fail(): void {
  if (closing) return;
  if (!mainReady) logger?.emit('STARTUP_FAILED', 'STARTUP_FAILURE');
  cleanup();
  console.error('BOOTSTRAP_FAILED');
  app.exit(1);
}
try {
  if (
    ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_FORCE_IS_PACKAGED'].some(
      (name) => process.env[name] !== undefined,
    ) ||
    [
      'no-sandbox',
      'disable-gpu-sandbox',
      'disable-setuid-sandbox',
      'disable-web-security',
      'allow-running-insecure-content',
      'ignore-certificate-errors',
      'remote-debugging-port',
      'remote-debugging-pipe',
      'inspect',
      'inspect-brk',
    ].some((name) => app.commandLine.hasSwitch(name))
  )
    throw new Error('UNSAFE_OVERRIDE');
  // Launcher also fixes argv/environment; this guard cannot undo native startup flags.
  if (process.argv.slice(app.isPackaged ? 1 : 2).length !== 0)
    throw new Error('ARGUMENTS_REJECTED');
  const paths = prepareOwnedProfile(process.env.FONESI_BOOTSTRAP_ROOT);
  for (const [key, value] of Object.entries(paths))
    app.setPath(key as 'userData' | 'sessionData' | 'logs' | 'crashDumps', value);
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true } },
  ]);
  app
    .whenReady()
    .then(async () => {
      logger = await ApplicationLogger.open(
        typeof process.env.FONESI_LOG_ROOT === 'string' &&
          typeof process.env.FONESI_LOG_PARENT_TOKEN === 'string'
          ? { root: process.env.FONESI_LOG_ROOT, parentToken: process.env.FONESI_LOG_PARENT_TOKEN }
          : undefined,
        () => reportLoggingDegraded(),
      );
      if (closing) {
        await logger.close();
        return;
      }
      // An invalidated/partial build must not launch even when old files remain.
      const markerPath = join(__dirname, '.verified-build.json');
      if (
        !lstatSync(markerPath).isFile() ||
        lstatSync(markerPath).isSymbolicLink() ||
        lstatSync(markerPath).size > 65536
      )
        throw new Error('BUILD_UNVERIFIED');
      const manifest: unknown = JSON.parse(readFileSync(markerPath, 'utf8'));
      if (
        manifest === null ||
        typeof manifest !== 'object' ||
        !('schema' in manifest) ||
        manifest.schema !== 1 ||
        !('outputs' in manifest) ||
        manifest.outputs === null ||
        typeof manifest.outputs !== 'object'
      )
        throw new Error('BUILD_UNVERIFIED');
      const hashes = manifest.outputs as Record<string, unknown>;
      const required = [
        'main.cjs',
        'asset-policy.cjs',
        'lifecycle.cjs',
        'profile-owner.cjs',
        'window-policy.cjs',
        'foundation-bridge.cjs',
        'ipc-contract.cjs',
        'log-contract.cjs',
        'log-store.cjs',
        'log-recovery.cjs',
        'preload.cjs',
        'renderer.js',
        'status.html',
      ];
      if (Object.keys(hashes).length !== required.length) throw new Error('BUILD_UNVERIFIED');
      for (const name of required) {
        const file = join(__dirname, name),
          stat = lstatSync(file);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.size > 8 * 1024 * 1024 ||
          createHash('sha256').update(readFileSync(file)).digest('hex') !== hashes[name]
        )
          throw new Error('BUILD_UNVERIFIED');
      }
      const assetPath = join(__dirname, 'status.html');
      if (
        !lstatSync(assetPath).isFile() ||
        lstatSync(assetPath).isSymbolicLink() ||
        lstatSync(assetPath).size > 65536
      )
        throw new Error('ASSET_REJECTED');
      const asset = readFileSync(assetPath);
      if (createHash('sha256').update(asset).digest('hex') !== ASSET_SHA256)
        throw new Error('ASSET_CHANGED');
      const html = asset.toString('utf8');
      Menu.setApplicationMenu(null);
      const ownedSession = session.fromPartition('auto-foundation-owned', { cache: false });
      disposeSession = installSessionPolicy(
        ownedSession,
        html,
        readFileSync(join(__dirname, 'renderer.js'), 'utf8'),
      );
      bridge = installFoundationBridge(ipcMain, logger);
      lifecycle = createLifecycle(() => {
        if (bridge === undefined) throw new Error('BRIDGE_UNAVAILABLE');
        const window = new BrowserWindow({
          width: 640,
          height: 360,
          show: false,
          webPreferences: {
            ...securePreferences(ownedSession),
            preload: join(__dirname, 'preload.cjs'),
          },
        });
        installWindowPolicy(window);
        const view = bridge.attach(window);
        window.webContents.on('render-process-gone', () => {
          if (!closing) logger?.emit('RENDERER_LOST', 'RENDERER_LOSS');
          fail();
        });
        window
          .loadURL(ENTRY_URL)
          .then(() => {
            if (!window.isDestroyed()) {
              if (!view.arm()) throw new Error('VIEW_NOT_ADMITTED');
              window.show();
              mainReady = true;
              logger?.emit('STARTUP_READY', 'OK');
              console.log('BOOTSTRAP_READY');
            }
          })
          .catch(fail);
        return {
          onClosed: (callback) => window.once('closed', callback),
          close: () => window.close(),
          destroy: () => {
            if (!window.isDestroyed()) window.destroy();
          },
        };
      });
      lifecycle.start();
    })
    .catch(fail);
  app.on('window-all-closed', () => {
    if (!closing) app.quit();
  });
  const shutdown = createLogShutdown({
    stop: cleanup,
    flush: () => logger?.close() ?? Promise.resolve('FAILED'),
    degraded: reportLoggingDegraded,
    resume: () => app.quit(),
    fail: () => app.exit(1),
  });
  app.on('before-quit', (event) => shutdown.beforeQuit(event));
  app.on('will-quit', () => {
    if (!cleanup()) {
      console.error('BOOTSTRAP_CLEANUP_FAILED');
      app.exit(1);
    } else console.log('BOOTSTRAP_CLOSED');
  });
} catch {
  fail();
}
