// Main-owned dialog adapter. Injected answers in tests are not recipient consent evidence.
export const PLATFORM_TOOLS_TERMS_URL = 'https://developer.android.com/studio/terms';
export type SetupNativeResult =
  | Readonly<{ ok: true; route: 'LOCAL_ARCHIVE' | 'OFFICIAL_DOWNLOAD'; archivePath: string | null }>
  | Readonly<{ ok: false; code: 'TERMS_DECLINED' | 'TERMS_REQUIRED' | 'SETUP_CANCELLED' }>;
export type SetupDialogs = Readonly<{
  showMessageBox: (
    options: Readonly<{
      type: 'question';
      title: string;
      message: string;
      detail: string;
      buttons: string[];
      defaultId: number;
      cancelId: number;
      noLink: boolean;
    }>,
  ) => Promise<{ response: number }>;
  showOpenDialog: (
    options: Readonly<{
      title: string;
      properties: ['openFile'];
      filters: { name: string; extensions: string[] }[];
    }>,
  ) => Promise<{ canceled: boolean; filePaths: string[] }>;
}>;
export function createPlatformToolsSetupNative(
  dialogs: SetupDialogs,
  openTerms: (url: string) => Promise<void>,
) {
  const message = dialogs.showMessageBox.bind(dialogs),
    picker = dialogs.showOpenDialog.bind(dialogs);
  const ask = (detail: string, buttons: string[]) =>
    message({
      type: 'question',
      title: 'Thiết lập Android Platform Tools',
      message: 'Android Platform Tools 37.0.1',
      detail,
      buttons,
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  return Object.freeze({
    async interact(current: () => void): Promise<SetupNativeResult> {
      current();
      const terms = await ask(
        'ADB là tùy chọn. Auto không phân phối lại Android Platform Tools. Lần thiết lập đầu cần mạng nếu tải trực tiếp từ Google; có thể chọn tệp ZIP chính thức. Chưa khởi động ADB hoặc kết nối thiết bị.\nhttps://developer.android.com/studio/terms\nBằng việc xác nhận, bạn tuyên bố đã đọc và chấp nhận các điều khoản áp dụng, và có thẩm quyền cho việc sử dụng của bạn / tổ chức.',
        ['Hủy', 'Mở điều khoản', 'Tôi đã đọc và đồng ý'],
      );
      current();
      if (terms.response === 1) {
        await openTerms(PLATFORM_TOOLS_TERMS_URL);
        current();
        return Object.freeze({ ok: false, code: 'TERMS_REQUIRED' });
      }
      if (terms.response !== 2) return Object.freeze({ ok: false, code: 'TERMS_DECLINED' });
      const choice = await ask(
        'Chọn nguồn chính thức cho phiên bản 37.0.1. Chưa khởi động ADB hoặc kết nối thiết bị.',
        ['Hủy', 'Chọn tệp ZIP', 'Tải từ Google'],
      );
      current();
      if (choice.response !== 1 && choice.response !== 2)
        return Object.freeze({ ok: false, code: 'SETUP_CANCELLED' });
      let archivePath: string | null = null;
      if (choice.response === 1) {
        const selected = await picker({
          title: 'Chọn Android Platform Tools 37.0.1 ZIP',
          properties: ['openFile'],
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
        });
        current();
        if (
          selected.canceled ||
          selected.filePaths.length !== 1 ||
          typeof selected.filePaths[0] !== 'string'
        )
          return Object.freeze({ ok: false, code: 'SETUP_CANCELLED' });
        archivePath = selected.filePaths[0];
      }
      const final = await ask(
        `Thiết lập Android Platform Tools 37.0.1 từ ${choice.response === 1 ? 'tệp ZIP đã chọn' : 'Google chính thức'}. Chưa khởi động ADB hoặc kết nối thiết bị.`,
        ['Hủy', 'Xác nhận thiết lập'],
      );
      current();
      if (final.response !== 1) return Object.freeze({ ok: false, code: 'SETUP_CANCELLED' });
      return Object.freeze({
        ok: true,
        route: choice.response === 1 ? 'LOCAL_ARCHIVE' : 'OFFICIAL_DOWNLOAD',
        archivePath,
      });
    },
  });
}
