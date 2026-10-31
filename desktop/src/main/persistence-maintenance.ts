import { maintenanceArgument, epoch } from '../persistence-contract.ts';
import { diagnosticId } from '../log-contract.ts';
export type BackupSummary = Readonly<{
  backupId: string;
  reason: 'DAILY' | 'MANUAL' | 'PRE_MIGRATION';
  protected: boolean;
}>;
export type MaintenanceIntent = Readonly<
  | { kind: 'SELECT_FOLDER'; parent: string }
  | { kind: 'RESTORE'; backupId: string; parent: string }
  | { kind: 'ACCEPT_UPGRADE'; backupId: string }
>;
export type MaintenanceDialogs = Readonly<{
  chooseFolder: (purpose: 'BACKUP' | 'RESTORE') => Promise<string | null>;
  chooseBackup: (
    rows: readonly BackupSummary[],
    purpose: 'RESTORE' | 'ACCEPT_UPGRADE',
  ) => Promise<string | null>;
  confirm: (intent: MaintenanceIntent) => Promise<boolean>;
  displayBackups: (rows: readonly BackupSummary[]) => Promise<void>;
}>;
export type MaintenanceDependencies = Readonly<{
  assertActive: () => Promise<void>;
  now: () => number;
  activeLocation: () => Promise<unknown | null>;
  selectLocation: (parent: string, now: number) => Promise<unknown>;
  backup: (now: number) => Promise<unknown>;
  list: () => Promise<readonly { backupId: string; reason: string; protected: boolean }[]>;
  acceptUpgrade: (id: string, now: number) => Promise<void>;
  restore: (id: string, destinationParent: string, now: number) => Promise<void>;
  dialogs: MaintenanceDialogs;
}>;
function reject(): never {
  throw new Error('MAINTENANCE_REJECTED');
}
function folder(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096 || value.includes('\0'))
    reject();
  return value;
}
function summaries(
  input: readonly { backupId: string; reason: string; protected: boolean }[],
): readonly BackupSummary[] {
  if (!Array.isArray(input) || input.length > 512) reject();
  const seen = new Set<string>();
  return Object.freeze(
    input.map((r) => {
      if (
        !r ||
        !diagnosticId(r.backupId) ||
        !['DAILY', 'MANUAL', 'PRE_MIGRATION'].includes(r.reason) ||
        typeof r.protected !== 'boolean' ||
        (r.protected && r.reason !== 'PRE_MIGRATION') ||
        seen.has(r.backupId)
      )
        reject();
      seen.add(r.backupId);
      return Object.freeze({
        backupId: r.backupId,
        reason: r.reason as BackupSummary['reason'],
        protected: r.protected,
      });
    }),
  );
}
// Main-only controller. Dialogs are trusted native adapters, never renderer callbacks.
// assertActive covers current lifecycle + retained owner lease; it does not revoke already
// admitted synchronous work. Parent supplies serialized operations and owned restore staging.
export class PersistenceMaintenance {
  private busy = false;
  private readonly d: MaintenanceDependencies;
  constructor(deps: MaintenanceDependencies) {
    this.d = Object.freeze({
      assertActive: deps.assertActive,
      now: deps.now,
      activeLocation: deps.activeLocation,
      selectLocation: deps.selectLocation,
      backup: deps.backup,
      list: deps.list,
      acceptUpgrade: deps.acceptUpgrade,
      restore: deps.restore,
      dialogs: Object.freeze({
        chooseFolder: deps.dialogs.chooseFolder,
        chooseBackup: deps.dialogs.chooseBackup,
        confirm: deps.dialogs.confirm,
        displayBackups: deps.dialogs.displayBackups,
      }),
    });
  }
  private async checked<T>(operation: () => Promise<T>): Promise<T> {
    const value = await operation();
    await this.d.assertActive();
    return value;
  }
  private time(): number {
    const now = this.d.now();
    if (!epoch(now)) reject();
    return now;
  }
  private async select(): Promise<boolean> {
    const selected = await this.checked(() => this.d.dialogs.chooseFolder('BACKUP'));
    if (selected === null) return false;
    const parent = folder(selected);
    const intent = Object.freeze({ kind: 'SELECT_FOLDER' as const, parent });
    const confirmed = await this.checked(() => this.d.dialogs.confirm(intent));
    if (confirmed === false) return false;
    if (confirmed !== true) reject();
    await this.d.assertActive();
    await this.d.selectLocation(parent, this.time());
    return true;
  }
  private async pick(purpose: 'RESTORE' | 'ACCEPT_UPGRADE'): Promise<BackupSummary | null> {
    const all = summaries(await this.checked(() => this.d.list()));
    const eligible =
      purpose === 'ACCEPT_UPGRADE'
        ? Object.freeze(all.filter((r) => r.reason === 'PRE_MIGRATION' && r.protected))
        : all;
    const selected = await this.checked(() => this.d.dialogs.chooseBackup(eligible, purpose));
    if (selected === null) return null;
    if (!diagnosticId(selected)) reject();
    const row = eligible.find((r) => r.backupId === selected);
    if (!row) reject();
    return row;
  }
  private async recheck(row: BackupSummary): Promise<void> {
    const latest = summaries(await this.checked(() => this.d.list())).find(
      (r) => r.backupId === row.backupId,
    );
    if (!latest || JSON.stringify(latest) !== JSON.stringify(row))
      throw new Error('MAINTENANCE_SELECTION_CHANGED');
  }
  async run(args: readonly string[]): Promise<'COMPLETED' | 'CANCELLED'> {
    if (!Array.isArray(args) || args.length !== 1 || typeof args[0] !== 'string') reject();
    const mode = maintenanceArgument(Object.freeze([args[0]]));
    if (!mode || mode === 'NORMAL') reject();
    if (this.busy) throw new Error('MAINTENANCE_BUSY');
    this.busy = true;
    try {
      await this.d.assertActive();
      if (mode === '--maintenance=select-backup-folder')
        return (await this.select()) ? 'COMPLETED' : 'CANCELLED';
      if (mode === '--maintenance=backup-now') {
        const active = await this.checked(() => this.d.activeLocation());
        if (active === null && !(await this.select())) return 'CANCELLED';
        await this.d.assertActive();
        await this.d.backup(this.time());
        return 'COMPLETED';
      }
      if (mode === '--maintenance=list-backups') {
        const rows = summaries(await this.checked(() => this.d.list()));
        await this.checked(() => this.d.dialogs.displayBackups(rows));
        return 'COMPLETED';
      }
      const row = await this.pick(
        mode === '--maintenance=accept-upgrade' ? 'ACCEPT_UPGRADE' : 'RESTORE',
      );
      if (row === null) return 'CANCELLED';
      if (mode === '--maintenance=accept-upgrade') {
        const intent = Object.freeze({ kind: 'ACCEPT_UPGRADE' as const, backupId: row.backupId });
        const confirmed = await this.checked(() => this.d.dialogs.confirm(intent));
        if (confirmed === false) return 'CANCELLED';
        if (confirmed !== true) reject();
        await this.recheck(row);
        await this.d.assertActive();
        await this.d.acceptUpgrade(row.backupId, this.time());
        return 'COMPLETED';
      }
      const chosen = await this.checked(() => this.d.dialogs.chooseFolder('RESTORE'));
      if (chosen === null) return 'CANCELLED';
      const parent = folder(chosen);
      const intent = Object.freeze({ kind: 'RESTORE' as const, backupId: row.backupId, parent });
      const confirmed = await this.checked(() => this.d.dialogs.confirm(intent));
      if (confirmed === false) return 'CANCELLED';
      if (confirmed !== true) reject();
      await this.recheck(row);
      await this.d.assertActive();
      await this.d.restore(row.backupId, parent, this.time());
      return 'COMPLETED';
    } finally {
      this.busy = false;
    }
  }
}
