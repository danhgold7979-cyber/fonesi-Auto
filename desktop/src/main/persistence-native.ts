import type { Dialog } from 'electron';
import type { BackupReceipt } from './backup-service.ts';
import type { FoundationPersistence } from './foundation-persistence.ts';
import { PersistenceMaintenance } from './persistence-maintenance.ts';
export async function runNativePersistenceMaintenance(
  service: FoundationPersistence,
  args: readonly string[],
  dialog: Dialog,
  assertActive: () => Promise<void>,
  checkpoint: string,
): Promise<'COMPLETED' | 'CANCELLED'> {
  const controller = new PersistenceMaintenance({
    assertActive,
    now: () => Date.now(),
    activeLocation: () => service.catalog.activeLocation(),
    selectLocation: (parent, now) => service.selectLocation(parent, now),
    backup: (now) => service.backup(now),
    list: () => service.list(),
    acceptUpgrade: (id, now) => service.acceptUpgrade(id, now),
    restore: async (id, parent) => {
      await service.restore(id, parent, checkpoint);
    },
    dialogs: {
      chooseFolder: async (purpose) => {
        const result = await dialog.showOpenDialog({
          title:
            purpose === 'BACKUP'
              ? 'Choose backup storage parent'
              : 'Choose a parent for a new quarantined restore',
          properties: ['openDirectory'],
        });
        if (result.canceled) return null;
        if (result.filePaths.length !== 1) throw new Error('NATIVE_SELECTION_REJECTED');
        return result.filePaths[0] ?? null;
      },
      chooseBackup: async (rows, purpose) => {
        if (rows.length === 0) return null;
        const result = await dialog.showOpenDialog({
          title:
            purpose === 'RESTORE'
              ? 'Choose a catalogued encrypted backup'
              : 'Choose a protected migration backup',
          properties: ['openFile'],
          filters: [{ name: 'Fonesi encrypted backup', extensions: ['fonaub'] }],
        });
        if (result.canceled) return null;
        if (result.filePaths.length !== 1 || result.filePaths[0] === undefined)
          throw new Error('NATIVE_SELECTION_REJECTED');
        return service.backupSelection(result.filePaths[0]);
      },
      confirm: async (intent) => {
        const detail =
          intent.kind === 'SELECT_FOLDER'
            ? `Create new owned backup storage under:\n${intent.parent}`
            : intent.kind === 'RESTORE'
              ? `Restore backup ${intent.backupId} into a NEW quarantined root under:\n${intent.parent}\nThe existing database and key material remain unchanged.`
              : `Accept the upgrade associated with safety backup ${intent.backupId}. This records explicit acceptance; it does not delete that safety copy.`;
        const result = await dialog.showMessageBox({
          type: 'warning',
          title: 'Confirm main-owned maintenance',
          message: 'Confirm this exact operation?',
          detail,
          buttons: ['Confirm', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });
        return result.response === 0;
      },
      displayBackups: async (rows) => {
        await dialog.showMessageBox({
          type: 'info',
          title: 'Validated backup catalogue',
          message: `${rows.length} catalogued backups`,
          detail:
            rows
              .map(
                (row) =>
                  `${row.backupId} | ${row.reason} | ${row.protected ? 'PROTECTED' : 'ORDINARY/RELEASED'}`,
              )
              .join('\n') || 'No catalogued backup.',
          buttons: ['Close'],
          defaultId: 0,
          cancelId: 0,
        });
      },
    },
  });
  return controller.run(args);
}

// First-use production callback: the trusted launcher opens the owned provisional
// store and key profile first; only native selection + explicit confirmation admits
// the schema0 backup. Cancellation never calls provision or selects storage.
export async function runNativePersistenceProvision(
  service: FoundationPersistence,
  dialog: Dialog,
  assertActive: () => Promise<void>,
  now: () => number,
): Promise<
  Readonly<{ status: 'PROVISIONED'; receipt: BackupReceipt }> | Readonly<{ status: 'CANCELLED' }>
> {
  await assertActive();
  const selected = await dialog.showOpenDialog({
    title: 'Choose encrypted backup storage',
    properties: ['openDirectory'],
  });
  await assertActive();
  if (selected.canceled) return { status: 'CANCELLED' };
  const parent = selected.filePaths[0];
  if (
    selected.filePaths.length !== 1 ||
    typeof parent !== 'string' ||
    parent.length < 1 ||
    parent.length > 4096 ||
    parent.includes('\0')
  )
    throw new Error('NATIVE_SELECTION_REJECTED');
  const confirmed = await dialog.showMessageBox({
    type: 'warning',
    title: 'Initialize encrypted foundation storage',
    message: 'Create an owned backup folder under the selected parent?',
    detail: `${parent}\nRecovery currently requires this Windows user/machine and retained usable key material. No portable-key claim is made.`,
    buttons: ['Initialize', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  await assertActive();
  if (confirmed.response !== 0) return { status: 'CANCELLED' };
  const receipt = await service.provision(parent, now());
  return Object.freeze({ status: 'PROVISIONED', receipt });
}
