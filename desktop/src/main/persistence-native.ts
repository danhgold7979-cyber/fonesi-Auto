import type { Dialog } from 'electron';
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
