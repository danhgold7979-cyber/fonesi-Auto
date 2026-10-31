import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export const outputs = [
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
  'v9.css',
];
export const inputs = [
  'launch/Invoke-Desktop.ps1',
  'launch/persistence-initialize.cjs',
  'launch/persistence-launch-control.cjs',
  'native/PersistenceProcess.cs',
  'package.json',
  'package-lock.json',
  'dependency-review.json',
  'tsconfig.json',
  'module-map.json',
  'scripts/check-module-graph.mjs',
  'src/main.ts',
  'src/foundation-bridge.ts',
  'src/ipc-contract.ts',
  'src/ipc-diagnostic-contract.ts',
  'src/log-contract.ts',
  'src/log-store-schema.ts',
  'src/persistence-contract.ts',
  'src/persistence-proof.ts',
  'src/backup-container-contract.ts',
  'src/main/foundation-database.ts',
  'src/main/backup-container.ts',
  'src/main/backup-service.ts',
  'src/main/persistence-files.ts',
  'src/main/backup-key-profile.ts',
  'src/main/backup-catalog.ts',
  'src/main/foundation-persistence.ts',
  'src/main/persistence-entry.ts',
  'src/main/secret-store.ts',
  'src/main/secret-entry.ts',
  'src/main/secret-files.ts',
  'src/main/secret-provider.ts',
  'src/secret-contract.ts',
  'src/settings-contract.ts',
  'src/invocation-budget.ts',
  'src/settings-client.ts',
  'src/preferences-bridge.ts',
  'src/main/settings-store.ts',
  'src/main/settings-window.ts',
  'src/main/persistence-native.ts',
  'src/main/persistence-maintenance.ts',
  'src/main/persistence-lifecycle.ts',
  'src/main/log-files.ts',
  'src/main/log-store.ts',
  'src/main/log-recovery.ts',
  'src/main/logging.ts',
  'src/main/log-shutdown.ts',
  'src/view-session.ts',
  'src/preload-client.ts',
  'src/preload.ts',
  'src/renderer.tsx',
  'src/ui/icon-data.ts',
  'src/ui/primary-pages.tsx',
  'src/ui/social-data.ts',
  'src/ui/ui-model.ts',
  'src/ui/ui-shared.tsx',
  'src/ui/ui-shell.tsx',
  'assets/v9.css',
  'src/ui/work-pages.tsx',
  'src/main/asset-policy.ts',
  'src/main/lifecycle.ts',
  'src/main/profile-owner.ts',
  'src/main/window-policy.ts',
  'tests/fixtures/unavailable.html',
  'scripts/build.mjs',
  'scripts/recover-logs.mjs',
  'scripts/build-manifest.mjs',
];
export function digest(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024)
    throw new Error('BUILD_FILE_REJECTED');
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
export function createManifest(root) {
  return {
    schema: 1,
    inputs: Object.fromEntries(inputs.map((file) => [file, digest(resolve(root, file))])),
    outputs: Object.fromEntries(
      outputs.map((file) => [file, digest(resolve(root, 'build', file))]),
    ),
  };
}
export function verifyBuild(root) {
  try {
    const file = resolve(root, 'build/.verified-build.json');
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > 65536 || stat.isSymbolicLink()) return false;
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    return JSON.stringify(manifest) === JSON.stringify(createManifest(root));
  } catch {
    return false;
  }
}
