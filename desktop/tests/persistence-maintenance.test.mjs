import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PersistenceMaintenance } from '../src/main/persistence-maintenance.ts';
function fixture() {
  const calls = [];
  const id = randomUUID();
  const rows = [{ backupId: id, reason: 'PRE_MIGRATION', protected: true }];
  const d = {
    assertActive: async () => {},
    now: () => 1000,
    activeLocation: async () => ({ locationId: randomUUID() }),
    selectLocation: async (...args) => calls.push(['select', ...args]),
    backup: async (...args) => calls.push(['backup', ...args]),
    list: async () => rows,
    acceptUpgrade: async (...args) => calls.push(['accept', ...args]),
    restore: async (...args) => calls.push(['restore', ...args]),
    dialogs: {
      chooseFolder: async () => '/owned/native-selection',
      chooseBackup: async () => id,
      confirm: async () => true,
      displayBackups: async (value) => calls.push(['display', value]),
    },
  };
  return { d, calls, id, rows };
}
test('exact five literals only; unknown/extra/casing requests invoke no adapters', async () => {
  const f = fixture();
  let checked = 0;
  f.d.assertActive = async () => {
    checked++;
  };
  const c = new PersistenceMaintenance(f.d);
  for (const args of [
    [],
    ['--maintenance=backup-now', 'extra'],
    ['--maintenance=BACKUP-NOW'],
    [' --maintenance=backup-now'],
    ['--maintenance=x'],
    [{}],
    null,
  ])
    await assert.rejects(c.run(args));
  assert.equal(checked, 0);
  assert.deepEqual(f.calls, []);
});
test('manual backup uses existing location immediately and never admits automatic cadence', async () => {
  const f = fixture();
  f.d.dialogs.chooseFolder = async () => {
    throw new Error('NO_PROMPT');
  };
  assert.equal(
    await new PersistenceMaintenance(f.d).run(['--maintenance=backup-now']),
    'COMPLETED',
  );
  assert.deepEqual(f.calls, [['backup', 1000]]);
});
test('missing location prompts/confirm once; cancellation performs no mutation', async () => {
  for (const stage of ['folder', 'confirm']) {
    const f = fixture();
    f.d.activeLocation = async () => null;
    if (stage === 'folder') f.d.dialogs.chooseFolder = async () => null;
    else f.d.dialogs.confirm = async () => false;
    assert.equal(
      await new PersistenceMaintenance(f.d).run(['--maintenance=backup-now']),
      'CANCELLED',
    );
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  f.d.activeLocation = async () => null;
  assert.equal(
    await new PersistenceMaintenance(f.d).run(['--maintenance=backup-now']),
    'COMPLETED',
  );
  assert.deepEqual(f.calls, [
    ['select', '/owned/native-selection', 1000],
    ['backup', 1000],
  ]);
});
test('list displays frozen fixed summaries without paths or service internals', async () => {
  const f = fixture();
  f.rows[0].privatePath = 'PRIVATE';
  await new PersistenceMaintenance(f.d).run(['--maintenance=list-backups']);
  const shown = f.calls[0][1];
  assert.equal(Object.isFrozen(shown), true);
  assert.equal(Object.isFrozen(shown[0]), true);
  assert.deepEqual(Object.keys(shown[0]), ['backupId', 'reason', 'protected']);
});
test('exact protected upgrade selection is confirmed and delegated, arbitrary ID rejected', async () => {
  const f = fixture();
  await new PersistenceMaintenance(f.d).run(['--maintenance=accept-upgrade']);
  assert.deepEqual(f.calls, [['accept', f.id, 1000]]);
  f.calls.length = 0;
  f.d.dialogs.chooseBackup = async () => randomUUID();
  await assert.rejects(new PersistenceMaintenance(f.d).run(['--maintenance=accept-upgrade']));
  assert.deepEqual(f.calls, []);
});
test('restore selection and confirmation delegate known ID/new parent only; cancellation does not restore', async () => {
  const f = fixture();
  await new PersistenceMaintenance(f.d).run(['--maintenance=restore-to-new']);
  assert.deepEqual(f.calls, [['restore', f.id, '/owned/native-selection', 1000]]);
  f.calls.length = 0;
  f.d.dialogs.confirm = async () => false;
  assert.equal(
    await new PersistenceMaintenance(f.d).run(['--maintenance=restore-to-new']),
    'CANCELLED',
  );
  assert.deepEqual(f.calls, []);
});
test('app/lease invalidation while native dialog awaits blocks every operation', async () => {
  for (const mode of ['select-backup-folder', 'accept-upgrade', 'restore-to-new']) {
    const f = fixture();
    let active = true;
    f.d.assertActive = async () => {
      if (!active) throw new Error('STALE');
    };
    f.d.dialogs.confirm = async () => {
      active = false;
      return true;
    };
    await assert.rejects(new PersistenceMaintenance(f.d).run([`--maintenance=${mode}`]), {
      message: 'STALE',
    });
    assert.deepEqual(f.calls, []);
  }
});
test('mutable adapters, summaries and request arrays cannot redirect an admitted intent', async () => {
  const f = fixture();
  const args = ['--maintenance=accept-upgrade'];
  let release;
  f.d.dialogs.confirm = async (intent) => {
    assert.equal(Object.isFrozen(intent), true);
    return new Promise((r) => {
      release = r;
    });
  };
  const c = new PersistenceMaintenance(f.d);
  const pending = c.run(args);
  while (!release) await new Promise((r) => setImmediate(r));
  args[0] = '--maintenance=restore-to-new';
  f.d.acceptUpgrade = async () => {
    throw new Error('REPLACED');
  };
  f.rows[0].backupId = randomUUID();
  release(true);
  await assert.rejects(pending, { message: 'MAINTENANCE_SELECTION_CHANGED' });
  assert.deepEqual(f.calls, []);
});
test('inflight controller rejects overlap and releases lane after cancelled dialog', async () => {
  const f = fixture();
  let done;
  f.d.dialogs.chooseFolder = () =>
    new Promise((r) => {
      done = r;
    });
  const c = new PersistenceMaintenance(f.d);
  const first = c.run(['--maintenance=select-backup-folder']);
  while (!done) await new Promise((r) => setImmediate(r));
  await assert.rejects(c.run(['--maintenance=backup-now']), { message: 'MAINTENANCE_BUSY' });
  done(null);
  assert.equal(await first, 'CANCELLED');
  await c.run(['--maintenance=backup-now']);
  assert.deepEqual(f.calls, [['backup', 1000]]);
});
