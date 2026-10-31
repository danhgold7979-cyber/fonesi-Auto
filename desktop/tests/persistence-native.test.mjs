import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativePersistenceMaintenance } from '../src/main/persistence-native.ts';
const id = '12345678-1234-1234-1234-123456789abc';
function fixture() {
  const calls = [];
  const rows = [{ backupId: id, reason: 'PRE_MIGRATION', protected: true }];
  return {
    calls,
    service: {
      catalog: { activeLocation: async () => ({}) },
      backup: async () => calls.push('backup'),
      list: async () => rows,
      selectLocation: async () => calls.push('select'),
      acceptUpgrade: async () => calls.push('accept'),
      restore: async () => calls.push('restore'),
      backupSelection: async () => id,
    },
  };
}
test('native manual backup uses persisted location without recurring folder prompt', async () => {
  const { service, calls } = fixture();
  await runNativePersistenceMaintenance(
    service,
    ['--maintenance=backup-now'],
    { showOpenDialog: () => assert.fail(), showMessageBox: () => assert.fail() },
    async () => {},
    'private-checkpoint',
  );
  assert.deepEqual(calls, ['backup']);
});
test('native upgrade confirmation defaults to cancel and cancellation has no mutation', async () => {
  const { service, calls } = fixture();
  let confirmation;
  const dialog = {
    showOpenDialog: async () => ({ canceled: false, filePaths: ['selected'] }),
    showMessageBox: async (options) => {
      confirmation = options;
      return { response: 1 };
    },
  };
  assert.equal(
    await runNativePersistenceMaintenance(
      service,
      ['--maintenance=accept-upgrade'],
      dialog,
      async () => {},
      'checkpoint',
    ),
    'CANCELLED',
  );
  assert.equal(confirmation.defaultId, 1);
  assert.equal(confirmation.cancelId, 1);
  assert.deepEqual(calls, []);
});
test('native list and cancelled restore remain main-owned and never invoke restore', async () => {
  const { service, calls } = fixture();
  const shown = [];
  const dialog = {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showMessageBox: async (value) => {
      shown.push(value);
      return { response: 0 };
    },
  };
  await runNativePersistenceMaintenance(
    service,
    ['--maintenance=list-backups'],
    dialog,
    async () => {},
    'checkpoint',
  );
  assert.ok(shown[0].detail.includes(id));
  assert.equal(
    await runNativePersistenceMaintenance(
      service,
      ['--maintenance=restore-to-new'],
      dialog,
      async () => {},
      'checkpoint',
    ),
    'CANCELLED',
  );
  assert.deepEqual(calls, []);
});
