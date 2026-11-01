// Fixed reviewed inventory: no glob discovery, shell expansion or concurrent children.
export const TEST_FILES = Object.freeze([
  'tests/adb-composition.test.mjs',
  'tests/adb-discovery.test.mjs',
  'tests/adb-host-adapter.test.mjs',
  'tests/adb-host-bridge.test.mjs',
  'tests/adb-host-factory.test.mjs',
  'tests/adb-host-lifecycle.test.mjs',
  'tests/adb-host-plan.test.mjs',
  'tests/adb-metadata.test.mjs',
  'tests/backup-catalog.test.mjs',
  'tests/backup-container.test.mjs',
  'tests/backup-key-profile.test.mjs',
  'tests/backup-service.test.mjs',
  'tests/capture-contract.test.mjs',
  'tests/capture-store.test.mjs',
  'tests/demo-build.test.mjs',
  'tests/demo-preferences.test.mjs',
  'tests/demo-renderer.test.mjs',
  'tests/demo-runtime.test.mjs',
  'tests/device-actor.test.mjs',
  'tests/device-diagnostics.test.mjs',
  'tests/device-fault-composition.test.mjs',
  'tests/device-selection.test.mjs',
  'tests/durable-audit.test.mjs',
  'tests/durable-coordinator.test.mjs',
  'tests/durable-database.test.mjs',
  'tests/fleet-audit.test.mjs',
  'tests/fleet-bridge.test.mjs',
  'tests/fleet-client.test.mjs',
  'tests/fleet-contract.test.mjs',
  'tests/fleet-service.test.mjs',
  'tests/fleet-ui-workflow.test.mjs',
  'tests/foundation-database.test.mjs',
  'tests/foundation-persistence.test.mjs',
  'tests/input-contract.test.mjs',
  'tests/invocation-budget.test.mjs',
  'tests/ipc-contract.test.mjs',
  'tests/ipc-diagnostic.test.mjs',
  'tests/isolated-adb-server.test.mjs',
  'tests/launch-journal.test.mjs',
  'tests/log-contract.test.mjs',
  'tests/log-files.test.mjs',
  'tests/logging.test.mjs',
  'tests/module-graph.test.mjs',
  'tests/package-build.test.mjs',
  'tests/package-state-control.test.mjs',
  'tests/persistence-contract.test.mjs',
  'tests/persistence-entry.test.mjs',
  'tests/persistence-files.test.mjs',
  'tests/persistence-initializer.test.mjs',
  'tests/persistence-launch-control.test.mjs',
  'tests/persistence-launcher.test.mjs',
  'tests/persistence-lifecycle.test.mjs',
  'tests/persistence-maintenance.test.mjs',
  'tests/persistence-native.test.mjs',
  'tests/persistence-process.test.mjs',
  'tests/persistence-proof.test.mjs',
  'tests/persistence-recovery.test.mjs',
  'tests/platform-tools-catalog.test.mjs',
  'tests/platform-tools-contract.test.mjs',
  'tests/platform-tools-download.test.mjs',
  'tests/platform-tools-files.test.mjs',
  'tests/platform-tools-provision-ledger.test.mjs',
  'tests/platform-tools-provisioner.test.mjs',
  'tests/platform-tools-runtime-custody.test.mjs',
  'tests/platform-tools-setup-audit.test.mjs',
  'tests/platform-tools-setup-bridge.test.mjs',
  'tests/platform-tools-setup-client.test.mjs',
  'tests/platform-tools-setup-contract.test.mjs',
  'tests/platform-tools-setup-service.test.mjs',
  'tests/policy.test.mjs',
  'tests/preferences-bridge.test.mjs',
  'tests/primary-pages.test.mjs',
  'tests/quality-tool.test.mjs',
  'tests/registry-store.test.mjs',
  'tests/retained-adb-protocol.test.mjs',
  'tests/retained-adb-session.test.mjs',
  'tests/retained-helper-compile.test.mjs',
  'tests/retained-host-admission.test.mjs',
  'tests/retained-managed-fixture.test.mjs',
  'tests/retained-pipe-startup.test.mjs',
  'tests/runtime-version-audit-contract.test.mjs',
  'tests/runtime-version-bridge.test.mjs',
  'tests/runtime-version-client.test.mjs',
  'tests/runtime-version-contract.test.mjs',
  'tests/runtime-version-integration.test.mjs',
  'tests/runtime-version-service.test.mjs',
  'tests/secret-contract.test.mjs',
  'tests/secret-entry.test.mjs',
  'tests/secret-files.test.mjs',
  'tests/secret-provider.test.mjs',
  'tests/secret-store.test.mjs',
  'tests/settings-audit.test.mjs',
  'tests/settings-client.test.mjs',
  'tests/settings-composition.test.mjs',
  'tests/settings-contract.test.mjs',
  'tests/settings-database.test.mjs',
  'tests/settings-preload.test.mjs',
  'tests/settings-renderer.test.mjs',
  'tests/settings-store.test.mjs',
  'tests/settings-window.test.mjs',
  'tests/test-batches.test.mjs',
  'tests/test-diagnostics.test.mjs',
  'tests/transport-registry.test.mjs',
  'tests/ui-shell.test.mjs',
  'tests/vault-audit.test.mjs',
  'tests/vault-context.test.mjs',
  'tests/work-pages.test.mjs',
  'verification/demo-contract.test.cjs',
  'verification/fleet-ui-contract.test.cjs',
  'verification/fleet-ui-control.test.cjs',
  'verification/fleet-ui-schema4.test.cjs',
  'verification/logging-evidence.test.cjs',
  'verification/main-runtime-version-contract.test.cjs',
  'verification/main-runtime-version-evidence.test.cjs',
  'verification/main-runtime-version-package.test.cjs',
  'verification/package-contract.test.cjs',
  'verification/package-launch-driver.test.cjs',
  'verification/persistence-envelope.test.cjs',
  'verification/persistence-launch-e2e-control.test.cjs',
  'verification/persistence-maintenance-contract.test.cjs',
  'verification/persistence-matrix-control.test.cjs',
  'verification/persistence-restore-contract.test.cjs',
  'verification/persistence-store-contract.test.cjs',
  'verification/platform-tools-server-control.test.cjs',
  'verification/platform-tools-version-control.test.cjs',
  'verification/recipient-setup-contract.test.cjs',
  'verification/recipient-setup-control.test.cjs',
  'verification/recipient-setup-main-probe.test.cjs',
  'verification/retained-host-contract.test.cjs',
  'verification/retained-host-control.test.cjs',
  'verification/settings-contract.test.cjs',
  'verification/settings-recovery-contract.test.cjs',
  'verification/ui-contract.test.cjs',
  'verification/vault-artifacts.test.cjs',
  'verification/vault-contract.test.cjs',
  'verification/vault-record-negative.test.cjs',
]);
export const TEST_BATCH_SIZE = 8;
export function tapCounts(stdout) {
  if (typeof stdout !== 'string') return null;
  const counts = {};
  for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const matches = [...stdout.matchAll(new RegExp(`^# ${field} (.*)$`, 'gm'))];
    if (matches.length !== 1 || !/^(0|[1-9]\d*)$/.test(matches[0][1])) return null;
    counts[field] = Number(matches[0][1]);
    if (!Number.isSafeInteger(counts[field])) return null;
  }
  if (
    counts.tests < 1 ||
    counts.pass !== counts.tests ||
    counts.fail ||
    counts.cancelled ||
    counts.skipped ||
    counts.todo
  )
    return null;
  return Object.freeze(counts);
}
export function runTestBatches(run, { diagnostic, emit }, inventory = TEST_FILES) {
  if (
    !Array.isArray(inventory) ||
    inventory.length !== TEST_FILES.length ||
    inventory.some((file, i) => file !== TEST_FILES[i]) ||
    new Set(inventory).size !== inventory.length
  ) {
    emit('TEST_BATCH_INVENTORY_FAILED');
    return false;
  }
  // Snapshot before invoking any injected child adapter.
  const files = [...inventory];
  let total = 0;
  for (let offset = 0; offset < files.length; offset += TEST_BATCH_SIZE) {
    const ordinal = offset / TEST_BATCH_SIZE + 1;
    let result;
    try {
      result = run([
        '--test',
        '--test-reporter=tap',
        ...files.slice(offset, offset + TEST_BATCH_SIZE),
      ]);
    } catch {
      result = { ok: false, stdout: '', outcome: 'SPAWN_FAILED' };
    }
    const counts = tapCounts(result?.stdout);
    if (
      result?.ok !== true ||
      result.outcome !== 'OK' ||
      !counts ||
      !Number.isSafeInteger(total + counts.tests)
    ) {
      emit(`TEST_BATCH_FAILED ${ordinal}`);
      diagnostic(result?.stdout ?? '', result?.outcome ?? 'SPAWN_FAILED');
      return false;
    }
    total += counts.tests;
  }
  emit(`TESTS_PASS ${total}/${total}`);
  return true;
}
