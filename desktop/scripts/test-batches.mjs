// Fixed reviewed inventory: no glob discovery, shell expansion or concurrent children.
export const TEST_FILES = Object.freeze([
  'tests/backup-catalog.test.mjs',
  'tests/backup-container.test.mjs',
  'tests/backup-key-profile.test.mjs',
  'tests/backup-service.test.mjs',
  'tests/foundation-database.test.mjs',
  'tests/foundation-persistence.test.mjs',
  'tests/ipc-contract.test.mjs',
  'tests/ipc-diagnostic.test.mjs',
  'tests/log-contract.test.mjs',
  'tests/log-files.test.mjs',
  'tests/logging.test.mjs',
  'tests/module-graph.test.mjs',
  'tests/persistence-contract.test.mjs',
  'tests/persistence-entry.test.mjs',
  'tests/persistence-files.test.mjs',
  'tests/persistence-launch-control.test.mjs',
  'tests/persistence-launcher.test.mjs',
  'tests/persistence-lifecycle.test.mjs',
  'tests/persistence-maintenance.test.mjs',
  'tests/persistence-native.test.mjs',
  'tests/persistence-process.test.mjs',
  'tests/persistence-proof.test.mjs',
  'tests/policy.test.mjs',
  'tests/quality-tool.test.mjs',
  'tests/secret-contract.test.mjs',
  'tests/secret-entry.test.mjs',
  'tests/secret-files.test.mjs',
  'tests/secret-provider.test.mjs',
  'tests/secret-store.test.mjs',
  'tests/test-batches.test.mjs',
  'tests/test-diagnostics.test.mjs',
  'tests/vault-audit.test.mjs',
  'tests/vault-context.test.mjs',
  'verification/logging-evidence.test.cjs',
  'verification/persistence-envelope.test.cjs',
  'verification/persistence-launch-e2e-control.test.cjs',
  'verification/persistence-maintenance-contract.test.cjs',
  'verification/persistence-matrix-control.test.cjs',
  'verification/persistence-restore-contract.test.cjs',
  'verification/persistence-store-contract.test.cjs',
  'verification/vault-artifacts.test.cjs',
  'verification/vault-contract.test.cjs',
]);
export const TEST_BATCH_SIZE = 16;
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
