import { openMainSecretStore } from './main/secret-entry.js';
import type { SecretStore } from './main/secret-store.js';
import { createPersistenceLifecycle } from './main/persistence-lifecycle.js';
import { runNativePersistenceMaintenance } from './main/persistence-native.js';
import {
  preparedPersistenceEntry,
  configurePersistenceSession,
  openPreparedPersistence,
} from './main/persistence-entry.js';
import type { FoundationPersistence } from './main/foundation-persistence.js';
import { maintenanceArgument } from './persistence-contract.js';
import { ApplicationLogger } from './main/logging.js';
import { createLogShutdown } from './main/log-shutdown.js';
import { installFoundationBridge } from './foundation-bridge.js';
import {
  app,
  BrowserWindow,
  protocol,
  session,
  Menu,
  ipcMain,
  safeStorage,
  dialog,
} from 'electron';
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
let persistence: FoundationPersistence | undefined;
const persistenceLifecycle = createPersistenceLifecycle<FoundationPersistence>();
const secretLifecycle = createPersistenceLifecycle<SecretStore>();
let backupTimer: ReturnType<typeof setInterval> | undefined;
function reportLoggingDegraded(): void {
  if (!loggingNotice) {
    loggingNotice = true;
    console.error('LOGGING_DEGRADED');
  }
}
function cleanup(): boolean {
  if (closing) return cleanupComplete;
  closing = true;
  if (backupTimer !== undefined) clearInterval(backupTimer);
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
  const maintenance = maintenanceArgument(process.argv.slice(app.isPackaged ? 1 : 2));
  if (maintenance === null) throw new Error('ARGUMENTS_REJECTED');
  const persistenceEntry = preparedPersistenceEntry(process.env.FONESI_PERSISTENCE_READY_FILE);
  if (maintenance !== 'NORMAL' && !persistenceEntry) throw new Error('PERSISTENCE_UNAVAILABLE');
  const paths = prepareOwnedProfile(process.env.FONESI_BOOTSTRAP_ROOT);
  for (const [key, value] of Object.entries(paths))
    app.setPath(key as 'userData' | 'sessionData' | 'logs' | 'crashDumps', value);
  configurePersistenceSession(app, persistenceEntry);
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
        'logging.cjs',
        'log-recovery.cjs',
        'foundation-persistence.cjs',
        'backup-key-profile.cjs',
        'persistence-files.cjs',
        'foundation-database.cjs',
        'backup-service.cjs',
        'persistence-native.cjs',
        'persistence-proof.cjs',
        'persistence-entry.cjs',
        'secret-store.cjs',
        'secret-provider.cjs',
        'secret-contract.cjs',
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
      if (persistenceEntry) {
        persistence = await persistenceLifecycle.open(() =>
          openPreparedPersistence(persistenceEntry, safeStorage, Date.now(), true),
        );
        if (closing) {
          await persistenceLifecycle.stop();
          return;
        }
        if (maintenance !== 'NORMAL') {
          const result = await runNativePersistenceMaintenance(
            persistence,
            [maintenance],
            dialog,
            async () => {
              if (closing) throw new Error('PERSISTENCE_CLOSED');
              await persistence?.catalog.config();
            },
            persistenceEntry.checkpoint,
          );
          console.log(
            result === 'COMPLETED'
              ? 'PERSISTENCE_MAINTENANCE_COMPLETED'
              : 'PERSISTENCE_MAINTENANCE_CANCELLED',
          );
          app.quit();
          return;
        }
        if (maintenance === 'NORMAL') {
          if (persistence.restored) throw new Error('RESTORED_MAINTENANCE_ONLY');
          await persistence.backup(Date.now(), true);
          if (closing) {
            await persistenceLifecycle.stop();
            return;
          }
          await secretLifecycle.open(() =>
            openMainSecretStore(
              persistenceEntry,
              safeStorage,
              (fields) => logger?.vaultAudit(fields) ?? Promise.resolve('DEGRADED'),
              () => closing,
            ),
          );
          if (closing) {
            await secretLifecycle.stop();
            await persistenceLifecycle.stop();
            return;
          }
          backupTimer = setInterval(() => {
            void persistence
              ?.backup(Date.now(), true)
              .catch(() => console.error('PERSISTENCE_BACKUP_FAILED'));
          }, 3600000);
        }
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
    flush: async () => {
      try {
        await secretLifecycle.stop();
        await persistenceLifecycle.stop();
      } catch {
        cleanupComplete = false;
        console.error('PERSISTENCE_SHUTDOWN_FAILED');
      }
      return logger?.close() ?? 'FAILED';
    },
    degraded: reportLoggingDegraded,
    resume: () => (cleanupComplete ? app.quit() : app.exit(1)),
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
