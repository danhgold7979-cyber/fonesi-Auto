export const PAGES = [
  { key: 'overview', label: 'Tổng quan', icon: 'layout-dashboard' },
  { key: 'accounts', label: 'Tài khoản', icon: 'users' },
  { key: 'tracking', label: 'Theo dõi', icon: 'chart-no-axes-combined' },
  { key: 'setup', label: 'Thiết lập & nội dung', icon: 'list-filter' },
  { key: 'calendar', label: 'Quản lý lịch đăng', icon: 'calendar-days' },
  { key: 'workflows', label: 'Quy trình', icon: 'git-branch' },
] as const;
export type PageKey = (typeof PAGES)[number]['key'];
export const NETWORKS = [
  'Facebook',
  'Threads',
  'Instagram',
  'X',
  'Shopee',
  'Zalo',
  'YouTube',
  'Telegram',
  'TikTok',
] as const;
export const DOMAIN_ACTIONS = [
  'scan',
  'reconnect',
  'app-manager',
  'app-install',
  'app-remove',
  'proxy',
  'device-config',
  'cache',
  'stop-background',
  'network',
  'time',
  'screenshot',
  'files',
  'adb',
  'reboot',
  'login',
  'account-scan',
  'account-refresh',
  'metrics-refresh',
  'export',
  'folder',
  'import',
  'schedule',
  'reschedule',
  'delete-job',
  'workflow-run',
  'interaction',
  'stream',
  'device-input',
  'launch-app',
] as const;
export type DomainAction = (typeof DOMAIN_ACTIONS)[number];
export type UiDevice = Readonly<{
  id: string;
  name: string;
  serial: string;
  status: 'UNAVAILABLE' | 'OFFLINE';
  connection: string;
}>;
export type UiAccount = Readonly<{
  id: string;
  deviceId: string;
  name: string;
  network: string;
  target: string;
  status: 'UNAVAILABLE';
}>;
export type UiMedia = Readonly<{
  id: string;
  name: string;
  caption: string;
  hashtag: string;
  comments: readonly string[];
  time: string;
}>;
export type UiJob = Readonly<{
  accountId?: string;
  target?: string;
  id: string;
  name: string;
  deviceId: string;
  network: string;
  time: string;
  status: 'UNAVAILABLE';
}>;
export type UiRows = Readonly<{
  devices: readonly UiDevice[];
  accounts: readonly UiAccount[];
  media: readonly UiMedia[];
  jobs: readonly UiJob[];
}>;
export type UiSnapshot = UiRows &
  (
    | Readonly<{ status: 'UNAVAILABLE'; reason: 'NOT_IMPLEMENTED' }>
    | Readonly<{ status: 'LOADING' }>
    | Readonly<{ status: 'ERROR'; code: 'UNAVAILABLE' | 'INVALID_RESPONSE' }>
    | Readonly<{ status: 'READY'; provenance: 'SYNTHETIC_TEST' }>
  );
const empty = Object.freeze([]);
export const unavailableSnapshot: UiSnapshot = Object.freeze({
  status: 'UNAVAILABLE',
  reason: 'NOT_IMPLEMENTED',
  devices: empty,
  accounts: empty,
  media: empty,
  jobs: empty,
});
export function unavailableAction(
  action: DomainAction,
): Readonly<{ ok: false; code: 'UNAVAILABLE' }> {
  if (!DOMAIN_ACTIONS.includes(action)) throw new Error('UI_ACTION_INVALID');
  return Object.freeze({ ok: false, code: 'UNAVAILABLE' });
}
export type PageProps = Readonly<{
  selectedWorkflowId: string;
  onChooseWorkflow: (id: string) => void;
  snapshot: UiSnapshot;
  onUnavailable: (action: DomainAction) => void;
  onNavigate: (page: PageKey, deviceId?: string) => void;
  selectedDeviceId: string;
  onFocusDevice: (id: string) => void;
}>;
// Fixed UI command vocabulary is data, not executable module syntax.
export const UI_IMPORT_ACTION: DomainAction = 'import';
export const UI_EXPORT_ACTION: DomainAction = 'export';
