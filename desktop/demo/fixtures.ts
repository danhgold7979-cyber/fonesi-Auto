import type { UiSnapshot } from '../src/ui/ui-model.js';

export const DEMO_CANARY = 'FONESI_DEMO_FIXTURE_BUNDLE_20261031_V1';
export const DEMO_DATE = '2026-10-31';
export const DEMO_BANNER = 'DEMO — DỮ LIỆU GIẢ LẬP / KHÔNG ĐIỀU KHIỂN THIẾT BỊ';
const devices = Object.freeze(
  [1, 2, 3].map((n) =>
    Object.freeze({
      id: `DEMO-DEVICE-${n}`,
      name: `DEMO Điện thoại giả lập ${n}`,
      serial: `DEMO-SERIAL-${n}`,
      status: 'OFFLINE' as const,
      connection: 'DEMO · KHÔNG KẾT NỐI',
    }),
  ),
);
const accounts = Object.freeze(
  [1, 2, 3].map((n) =>
    Object.freeze({
      id: `DEMO-ACCOUNT-${n}`,
      deviceId: `DEMO-DEVICE-${n}`,
      name: `DEMO Tài khoản giả lập ${n}`,
      network: 'facebook',
      target: `DEMO-TARGET-${n}`,
      status: 'UNAVAILABLE' as const,
    }),
  ),
);
const media = Object.freeze(
  Array.from({ length: 25 }, (_, i) =>
    Object.freeze({
      id: `DEMO-MEDIA-${String(i + 1).padStart(2, '0')}`,
      name: `DEMO-media-${String(i + 1).padStart(2, '0')}.mp4`,
      caption: `DEMO Nội dung giả lập ${i + 1}`,
      hashtag: '#DEMO',
      comments: Object.freeze(['DEMO Bình luận mẫu']),
      time: `${DEMO_DATE}T09:00`,
    }),
  ),
);
const jobs = Object.freeze(
  [1, 2, 3].map((n) =>
    Object.freeze({
      id: `DEMO-JOB-${n}`,
      name: `DEMO Lịch giả lập ${n}`,
      deviceId: `DEMO-DEVICE-${n}`,
      accountId: `DEMO-ACCOUNT-${n}`,
      target: `DEMO-TARGET-${n}`,
      network: 'facebook',
      time: `${DEMO_DATE}T${String(8 + n).padStart(2, '0')}:00`,
      status: 'UNAVAILABLE' as const,
    }),
  ),
);
export const DEMO_SNAPSHOT: UiSnapshot = Object.freeze({
  status: 'READY',
  provenance: 'SYNTHETIC_TEST',
  devices,
  accounts,
  media,
  jobs,
});
