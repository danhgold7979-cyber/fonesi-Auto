import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runNativePersistenceMaintenance,
  runNativePersistenceProvision,
} from '../src/main/persistence-native.ts';
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

test('first-use native selection cancellation never provisions or replaces storage', async () => {
  let writes = 0;
  const service = {
    provision: async () => {
      writes++;
    },
  };
  assert.deepEqual(
    await runNativePersistenceProvision(
      service,
      { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
      async () => {},
      () => 1,
    ),
    { status: 'CANCELLED' },
  );
  assert.equal(writes, 0);
});
test('first-use confirmation binds selected parent and defaults to cancel', async () => {
  const calls = [];
  let options;
  const receipt = { synthetic: true };
  const result = await runNativePersistenceProvision(
    {
      provision: async (...args) => {
        calls.push(args);
        return receipt;
      },
    },
    {
      showOpenDialog: async () => ({ canceled: false, filePaths: ['owned-selected-parent'] }),
      showMessageBox: async (value) => {
        options = value;
        return { response: 0 };
      },
    },
    async () => {},
    () => 1000,
  );
  assert.deepEqual(calls, [['owned-selected-parent', 1000]]);
  assert.equal(options.defaultId, 1);
  assert.equal(options.cancelId, 1);
  assert.equal(result.receipt, receipt);
});
test('first-use delayed dialog cannot continue after launcher ownership is lost', async () => {
  let checks = 0,
    writes = 0;
  await assert.rejects(
    runNativePersistenceProvision(
      {
        provision: async () => {
          writes++;
        },
      },
      {
        showOpenDialog: async () => ({ canceled: false, filePaths: ['owned'] }),
        showMessageBox: () => assert.fail(),
      },
      async () => {
        if (++checks === 2) throw new Error('OWNER_LOST');
      },
      () => 1,
    ),
    /OWNER_LOST/,
  );
  assert.equal(writes, 0);
});
