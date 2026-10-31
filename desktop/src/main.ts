import {
  captureNativeWindow,
  restoreWindowOptions,
  restoreMaximized,
} from './main/settings-window.js';
import { assertBorrowedPersistenceLease } from './main/persistence-files.js';
import { SettingsStore, type SettingsResult } from './main/settings-store.js';
import { installPreferencesBridge } from './preferences-bridge.js';
import { openMainSecretStore } from './main/secret-entry.js';
import type { SecretStore } from './main/secret-store.js';
import { createPersistenceLifecycle } from './main/persistence-lifecycle.js';
import { runNativePersistenceMaintenance } from './main/persistence-native.js';
import {
  preparedPersistenceEntry,
  configurePersistenceSession,
  openPreparedPersistence,
  assertPreparedPersistenceLease,
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
  screen,
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

// Legacy public reads plus the separately bounded nonsecret preference capability.
let bridge: ReturnType<typeof installFoundationBridge> | undefined;
let preferencesBridge: ReturnType<typeof installPreferencesBridge> | undefined;
let settingsStore: SettingsStore | undefined;
let settingsDrain: Promise<SettingsResult | null> | undefined;
let resourcesDisposed = false;
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
const settingsLifecycle = createPersistenceLifecycle<{ shutdown: () => Promise<void> }>();
let backupTimer: ReturnType<typeof setInterval> | undefined;
function reportLoggingDegraded(): void {
  if (!loggingNotice) {
    loggingNotice = true;
    console.error('LOGGING_DEGRADED');
  }
}
function cleanup(): boolean {
  if (resourcesDisposed) return cleanupComplete;
  resourcesDisposed = true;
  closing = true;
  if (backupTimer !== undefined) clearInterval(backupTimer);
  const disposed = disposeResources([
    () => preferencesBridge?.dispose(),
    () => bridge?.dispose(),
    () => lifecycle?.dispose(),
    () => disposeSession?.(),
  ]);
  cleanupComplete = disposed && cleanupComplete;
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
        'settings-contract.cjs',
        'preferences-bridge.cjs',
        'settings-store.cjs',
        'settings-window.cjs',
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
      const settingsDb = persistence?.settingsAdapter();
      const initialSettings = settingsDb?.readSettings();
      lifecycle = createLifecycle(() => {
        if (bridge === undefined) throw new Error('BRIDGE_UNAVAILABLE');
        const window = new BrowserWindow({
          width: 640,
          height: 360,
          ...(initialSettings
            ? restoreWindowOptions(
                {
                  normalBounds: initialSettings.normalBounds,
                  maximized: initialSettings.maximized,
                },
                screen.getAllDisplays().map((display) => display.workArea),
              )
            : {}),
          show: false,
          webPreferences: {
            ...securePreferences(ownedSession),
            preload: join(__dirname, 'preload.cjs'),
          },
        });
        installWindowPolicy(window);
        if (settingsDb && persistenceEntry) {
          let windowTracking = false;
          settingsStore = new SettingsStore({
            db: settingsDb,
            assertOwned: () =>
              assertBorrowedPersistenceLease(persistenceEntry, persistenceEntry.ownerToken),
            assertOwnedSync: () => assertPreparedPersistenceLease(persistenceEntry),
            audit: (fields) => logger?.settingsAudit(fields) ?? Promise.resolve('DEGRADED'),
            confirm: async (action) => {
              if (closing || window.isDestroyed()) return false;
              const answer = await dialog.showMessageBox(window, {
                type: 'question',
                buttons: [
                  'Cancel',
                  action === 'RESET' ? 'Reset preferences' : 'Restore previous preferences',
                ],
                defaultId: 0,
                cancelId: 0,
                noLink: true,
                message:
                  action === 'RESET'
                    ? 'Reset nonsecret UI preferences?'
                    : 'Restore the previous preference revision?',
              });
              return answer.response === 1;
            },
            readWindow: () => {
              const value = captureNativeWindow(window);
              if (!value) throw new Error('SETTINGS_WINDOW_UNAVAILABLE');
              return value;
            },
            windowOwned: () => !window.isDestroyed() && !resourcesDisposed,
          });
          void settingsLifecycle
            .open(async () => ({
              shutdown: async () => {
                const saved = await (settingsDrain ?? settingsStore?.shutdown());
                if (saved && !saved.ok) throw new Error('SETTINGS_SAVE_FAILED');
              },
            }))
            .catch(fail);
          preferencesBridge = installPreferencesBridge(
            ipcMain,
            bridge.admitPreferences,
            () => settingsStore,
            (method) => {
              if (method !== 'preferences.restorePrevious' || window.isDestroyed()) return;
              const saved = settingsDb.readSettings();
              if (window.isMaximized()) window.unmaximize();
              const bounds = restoreWindowOptions(
                { normalBounds: saved.normalBounds, maximized: saved.maximized },
                screen.getAllDisplays().map((display) => display.workArea),
              );
              window.setBounds({ ...window.getNormalBounds(), ...bounds });
              restoreMaximized(window, {
                normalBounds: saved.normalBounds,
                maximized: saved.maximized,
              });
            },
            () => {
              windowTracking = true;
            },
          );
          // Startup restore/show events cannot race the first hydrated snapshot.
          // Failed hydration leaves observation disabled; final close still captures.
          const observeWindow = () => {
            if (windowTracking) settingsStore?.observeWindow();
          };
          window.on('move', observeWindow);
          window.on('resize', observeWindow);
          window.on('maximize', observeWindow);
          window.on('unmaximize', observeWindow);
          window.on('close', (event) => {
            if (!closing) {
              event.preventDefault();
              app.quit();
            }
          });
          if (initialSettings)
            restoreMaximized(window, {
              normalBounds: initialSettings.normalBounds,
              maximized: initialSettings.maximized,
            });
        } else {
          preferencesBridge = installPreferencesBridge(
            ipcMain,
            bridge.admitPreferences,
            () => undefined,
          );
        }
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
              window.webContents.send('foundation:preferences:ready');
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
    stop: () => {
      closing = true;
      if (backupTimer !== undefined) clearInterval(backupTimer);
      preferencesBridge?.dispose();
      bridge?.dispose();
      // Capture native geometry before any window destruction; await the same
      // settings lane before closing its database or releasing its owner lease.
      settingsDrain = settingsStore?.shutdown();
      return cleanupComplete;
    },
    flush: async () => {
      try {
        await settingsLifecycle.stop();
        cleanupComplete = cleanup() && cleanupComplete;
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
