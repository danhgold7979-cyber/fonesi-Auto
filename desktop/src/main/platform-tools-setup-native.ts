// Main-owned dialog adapter. Injected answers in tests are not recipient consent evidence.
export const PLATFORM_TOOLS_TERMS_URL = 'https://developer.android.com/studio/terms';
export type SetupAction = 'INSTALL' | 'ROLLBACK';
export type SetupNativeSelection = Readonly<{
  installTargetVersion: string;
  activeVersion: string | null;
  previousVersion: string | null;
  rollbackAvailable: boolean;
}>;
export type SetupNativeResult =
  | Readonly<{
      ok: true;
      kind: 'INSTALL';
      route: 'LOCAL_ARCHIVE' | 'OFFICIAL_DOWNLOAD';
      archivePath: string | null;
    }>
  | Readonly<{ ok: true; kind: 'ROLLBACK'; route: 'RETAINED_RUNTIME'; archivePath: null }>
  | Readonly<{
      ok: false;
      code: 'TERMS_DECLINED' | 'TERMS_REQUIRED' | 'SETUP_CANCELLED';
      action: SetupAction | null;
    }>;
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
  const ask = (detail: string, buttons: string[], release: string) =>
    message({
      type: 'question',
      title: 'Thiết lập Android Platform Tools',
      message: `Android Platform Tools ${release}`,
      detail,
      buttons,
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  return Object.freeze({
    async interact(
      current: () => void,
      selection: SetupNativeSelection,
      selected: (action: SetupAction) => void,
    ): Promise<SetupNativeResult> {
      current();
      const valid = (v: unknown) =>
        typeof v === 'string' &&
        v.length <= 32 &&
        !/[^0-9.]/.test(v) &&
        /^[0-9]+\.[0-9]+\.[0-9]+$/.test(v);
      if (
        !valid(selection.installTargetVersion) ||
        (selection.activeVersion !== null && !valid(selection.activeVersion)) ||
        (selection.previousVersion !== null && !valid(selection.previousVersion)) ||
        typeof selection.rollbackAvailable !== 'boolean' ||
        (selection.rollbackAvailable &&
          (selection.activeVersion === null ||
            selection.previousVersion === null ||
            selection.activeVersion === selection.previousVersion))
      )
        throw Error('INVALID_REQUEST');
      let action: SetupAction | null = null;
      const select = (value: SetupAction) => {
        action = value;
        selected(value);
      };
      const refuse = (
        code: 'TERMS_DECLINED' | 'TERMS_REQUIRED' | 'SETUP_CANCELLED',
      ): SetupNativeResult => Object.freeze({ ok: false, code, action });
      if (selection.rollbackAvailable) {
        const operation = await ask(
          `Bản đang được xác minh: ${selection.activeVersion}. Bản trước được giữ lại: ${selection.previousVersion}. Chọn thao tác; chưa chạy bộ công cụ hoặc thiết bị.`,
          ['Hủy', 'Cài bản mục tiêu', 'Khôi phục bản trước đã giữ'],
          selection.installTargetVersion,
        );
        if (operation.response === 1) select('INSTALL');
        else if (operation.response === 2) select('ROLLBACK');
        current();
        if (action === null) return refuse('SETUP_CANCELLED');
      }
      const terms = await ask(
        'ADB là tùy chọn. Auto không phân phối lại Android Platform Tools. Lần thiết lập đầu cần mạng nếu tải trực tiếp từ Google; có thể chọn tệp ZIP chính thức. Chưa khởi động ADB hoặc kết nối thiết bị.\nhttps://developer.android.com/studio/terms\nBằng việc xác nhận, bạn tuyên bố đã đọc và chấp nhận các điều khoản áp dụng, và có thẩm quyền cho việc sử dụng của bạn / tổ chức.',
        ['Hủy', 'Mở điều khoản', 'Tôi đã đọc và đồng ý'],
        selection.installTargetVersion,
      );
      current();
      if (terms.response === 1) {
        await openTerms(PLATFORM_TOOLS_TERMS_URL);
        current();
        return refuse('TERMS_REQUIRED');
      }
      if (terms.response !== 2) return refuse('TERMS_DECLINED');
      if (action === null) select('INSTALL');
      if (action === 'ROLLBACK') {
        const confirmation = await ask(
          `Khôi phục từ ${selection.activeVersion} về ${selection.previousVersion}. Không tải xuống; giữ nguyên byte bản mới hơn. Chỉ xác minh byte, chưa xác minh thực thi VERSION; không khởi động máy chủ hay thao tác thiết bị.`,
          ['Hủy', 'Xác nhận khôi phục'],
          selection.installTargetVersion,
        );
        current();
        if (confirmation.response !== 1) return refuse('SETUP_CANCELLED');
        return Object.freeze({
          ok: true,
          kind: 'ROLLBACK',
          route: 'RETAINED_RUNTIME',
          archivePath: null,
        });
      }
      const choice = await ask(
        `Chọn nguồn chính thức cho phiên bản ${selection.installTargetVersion}. Chưa khởi động ADB hoặc kết nối thiết bị.`,
        ['Hủy', 'Chọn tệp ZIP', 'Tải từ Google'],
        selection.installTargetVersion,
      );
      current();
      if (choice.response !== 1 && choice.response !== 2) return refuse('SETUP_CANCELLED');
      let archivePath: string | null = null;
      if (choice.response === 1) {
        const selected = await picker({
          title: `Chọn Android Platform Tools ${selection.installTargetVersion} ZIP`,
          properties: ['openFile'],
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
        });
        current();
        if (
          selected.canceled ||
          selected.filePaths.length !== 1 ||
          typeof selected.filePaths[0] !== 'string'
        )
          return refuse('SETUP_CANCELLED');
        archivePath = selected.filePaths[0];
      }
      const final = await ask(
        `Thiết lập Android Platform Tools ${selection.installTargetVersion} từ ${choice.response === 1 ? 'tệp ZIP đã chọn' : 'Google chính thức'}. Chưa khởi động ADB hoặc kết nối thiết bị.`,
        ['Hủy', 'Xác nhận thiết lập'],
        selection.installTargetVersion,
      );
      current();
      if (final.response !== 1) return refuse('SETUP_CANCELLED');
      return Object.freeze({
        ok: true,
        kind: 'INSTALL',
        route: choice.response === 1 ? 'LOCAL_ARCHIVE' : 'OFFICIAL_DOWNLOAD',
        archivePath,
      });
    },
  });
}
