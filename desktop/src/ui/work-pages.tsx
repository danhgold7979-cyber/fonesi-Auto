import { useState, type ReactNode } from 'react';
import type { PageProps, DomainAction } from './ui-model.js';
import { NETWORKS, UI_IMPORT_ACTION, UI_EXPORT_ACTION } from './ui-model.js';
import { Icon, SocialIcon, UnavailableButton, UiModal } from './ui-shared.tsx';

// Reference catalogue labels only: no runnable automation or capability assertions.
export const WORKFLOW_LABELS = [
  {
    id: 'fb-page-video',
    network: 'facebook',
    category: 'ĐĂNG',
    group: 'Fanpage',
    name: 'Đăng video + bình luận',
    status: 'UI CATALOG',
    steps: [
      'Xác minh nick Facebook',
      'Xác minh Page ID và quyền quản lý',
      'Chọn video + caption/hashtag',
      'Đăng bài và xác minh post ID',
      'Chỉ bình luận sau khi bài của chính tài khoản được xác minh',
    ],
  },
  {
    id: 'fb-page-photo',
    network: 'facebook',
    category: 'ĐĂNG',
    group: 'Fanpage',
    name: 'Đăng ảnh / album + bình luận',
    status: 'UI CATALOG',
    steps: [
      'Xác minh Page ID và quyền',
      'Chọn ảnh / album',
      'Đăng và xác minh bài',
      'Bình luận theo danh sách nội dung đã duyệt',
    ],
  },
  {
    id: 'fb-page-reels',
    network: 'facebook',
    category: 'ĐĂNG',
    group: 'Fanpage',
    name: 'Đăng Reels + bình luận',
    status: 'UI CATALOG',
    steps: [
      'Xác minh Page và capability Reels',
      'Chọn video dọc và nội dung',
      'Đăng Reels và xác minh',
      'Bình luận theo danh sách đã duyệt',
    ],
  },
  {
    id: 'fb-story',
    network: 'facebook',
    category: 'ĐĂNG',
    group: 'Bản tin (Story)',
    name: 'Đăng bản tin Facebook',
    status: 'UI CATALOG',
    steps: [
      'Xác minh profile đang hoạt động',
      'Chọn ảnh/video Story',
      'Kiểm tra thời lượng và định dạng',
      'Đăng Story và xác minh trạng thái',
    ],
  },
  {
    id: 'fb-group-video',
    network: 'facebook',
    category: 'ĐĂNG',
    group: 'Đăng nhóm',
    name: 'Đăng video lên danh sách nhóm',
    status: 'UI CATALOG',
    steps: [
      'Chọn các nhóm đã xác minh quyền đăng',
      'Chọn video + caption/hashtag',
      'Tạo job riêng cho từng Group ID',
      'Giãn giờ giữa các nhóm theo cấu hình',
      'Theo dõi bài pending / approved / rejected',
    ],
  },
  {
    id: 'fb-group-photo',
    network: 'facebook',
    category: 'ĐĂNG',
    group: 'Đăng nhóm',
    name: 'Đăng ảnh lên danh sách nhóm',
    status: 'UI CATALOG',
    steps: [
      'Chọn các nhóm đã xác minh quyền đăng',
      'Chọn ảnh / album và caption',
      'Tạo job riêng cho từng Group ID',
      'Giãn giờ giữa các nhóm',
      'Theo dõi trạng thái duyệt bài',
    ],
  },
  {
    id: 'fb-comment-links',
    network: 'facebook',
    category: 'TƯƠNG TÁC',
    group: 'Bình luận theo link',
    name: 'Bình luận · Hàng đợi duyệt theo link',
    status: 'REVIEW QUEUE',
    steps: [
      'Nhập link Profile/Page hoặc danh sách post URL',
      'Chọn số bài mới nhất / số bài mục tiêu',
      'Nhập danh sách mẫu bình luận',
      'Xếp lịch tác vụ nhắc duyệt theo ngày và khung giờ',
      'Mở từng bài, kiểm tra ngữ cảnh và tự xác nhận gửi',
    ],
  },
  {
    id: 'fb-reaction-links',
    network: 'facebook',
    category: 'TƯƠNG TÁC',
    group: 'Like / Share / Love',
    name: 'Like · Love · Share · Hàng đợi duyệt',
    status: 'REVIEW QUEUE',
    steps: [
      'Nhập danh sách link bài viết hoặc nguồn được quản lý',
      'Đối chiếu sổ theo dõi tương tác do người dùng xác nhận',
      'Bỏ qua mục đã đánh dấu hoàn tất',
      'Xếp lịch hàng đợi xem xét',
      'Mở bài và thực hiện thủ công trên Facebook',
    ],
  },
  {
    id: 'fb-profile-video',
    network: 'facebook',
    category: 'ĐĂNG',
    group: 'Nick cá nhân',
    name: 'Đăng video Profile + bình luận',
    status: 'UI CATALOG',
    steps: [
      'Xác minh nick đang hoạt động',
      'Chọn video + caption/hashtag',
      'Đăng và xác minh bài',
      'Bình luận sau khi xác minh bài của chính nick',
    ],
  },
  {
    id: 'fb-profile-photo',
    network: 'facebook',
    category: 'ĐĂNG',
    group: 'Nick cá nhân',
    name: 'Đăng ảnh Profile + bình luận',
    status: 'UI CATALOG',
    steps: [
      'Xác minh nick',
      'Chọn ảnh / album',
      'Đăng và xác minh bài',
      'Bình luận theo danh sách đã duyệt',
    ],
  },
  {
    id: 'fb-profile-reels',
    network: 'facebook',
    category: 'ĐĂNG',
    group: 'Nick cá nhân',
    name: 'Đăng Reels trên Profile',
    status: 'UI CATALOG',
    steps: [
      'Xác minh nick',
      'Chọn video dọc',
      'Đăng Reels và xác minh',
      'Bình luận sau khi xác minh',
    ],
  },
  {
    id: 'ig-reels',
    network: 'instagram',
    category: 'ĐĂNG',
    group: 'Reels',
    name: 'Đăng Reels',
    status: 'ROADMAP',
    steps: ['Xác minh Instagram', 'Đăng nội dung', 'Xác minh kết quả'],
  },
  {
    id: 'ig-photo',
    network: 'instagram',
    category: 'ĐĂNG',
    group: 'Ảnh',
    name: 'Đăng ảnh/carousel',
    status: 'ROADMAP',
    steps: ['Xác minh Instagram', 'Đăng ảnh', 'Xác minh'],
  },
  {
    id: 'ig-story',
    network: 'instagram',
    category: 'ĐĂNG',
    group: 'Story',
    name: 'Đăng Story',
    status: 'ROADMAP',
    steps: ['Xác minh Instagram', 'Đăng Story', 'Xác minh'],
  },
  {
    id: 'tt-video',
    network: 'tiktok',
    category: 'ĐĂNG',
    group: 'Video',
    name: 'Đăng video',
    status: 'ROADMAP',
    steps: ['Xác minh TikTok', 'Tải video', 'Đăng & xác minh'],
  },
  {
    id: 'yt-short',
    network: 'youtube',
    category: 'ĐĂNG',
    group: 'Shorts',
    name: 'Đăng YouTube Shorts',
    status: 'ROADMAP',
    steps: ['Xác minh kênh', 'Tải Shorts', 'Đăng & xác minh'],
  },
  {
    id: 'threads-post',
    network: 'threads',
    category: 'ĐĂNG',
    group: 'Bài đăng',
    name: 'Đăng bài Threads',
    status: 'ROADMAP',
    steps: ['Xác minh tài khoản', 'Tạo bài', 'Xác minh'],
  },
  {
    id: 'x-post',
    network: 'x',
    category: 'ĐĂNG',
    group: 'Bài đăng',
    name: 'Đăng bài X',
    status: 'ROADMAP',
    steps: ['Xác minh tài khoản', 'Đăng bài', 'Xác minh'],
  },
  {
    id: 'shopee-video',
    network: 'shopee',
    category: 'ĐĂNG',
    group: 'Video',
    name: 'Đăng Shopee Video',
    status: 'ROADMAP',
    steps: ['Xác minh tài khoản', 'Đăng video', 'Xác minh'],
  },
  {
    id: 'zalo-post',
    network: 'zalo',
    category: 'ĐĂNG',
    group: 'OA',
    name: 'Đăng Zalo OA',
    status: 'ROADMAP',
    steps: ['Xác minh OA', 'Đăng nội dung', 'Xác minh'],
  },
  {
    id: 'telegram-post',
    network: 'telegram',
    category: 'ĐĂNG',
    group: 'Kênh',
    name: 'Đăng Telegram Channel',
    status: 'ROADMAP',
    steps: ['Xác minh kênh', 'Đăng ảnh/video', 'Xác minh'],
  },
] as const;
function Unavailable({
  action,
  children,
  onUnavailable,
}: {
  action: DomainAction;
  children: ReactNode;
  onUnavailable: PageProps['onUnavailable'];
}) {
  return (
    <UnavailableButton action={action} onUnavailable={onUnavailable} className="btn small">
      {children}
    </UnavailableButton>
  );
}
const ORDINALS = Array.from({ length: 24 }, (_, n) => n);
function Header({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="rowflex wrap">{children}</div>
    </div>
  );
}
function CardHead({ title, description }: { title: string; description: string }) {
  return (
    <div className="cardhead">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
function StateNotice({ snapshot }: Pick<PageProps, 'snapshot'>) {
  return (
    <div className="notice warn" role="status">
      {snapshot.status === 'LOADING'
        ? 'Đang tải dữ liệu…'
        : snapshot.status === 'ERROR'
          ? 'Không thể tải dữ liệu. Dịch vụ chưa sẵn sàng.'
          : snapshot.status === 'READY'
            ? 'SYNTHETIC TEST · Dữ liệu kiểm thử, không phải thiết bị thật.'
            : 'Chưa triển khai dịch vụ · Không có dữ liệu thiết bị được quan sát.'}
    </div>
  );
}
function EmptySelect({ label, id }: { label: string; id: string }) {
  return (
    <label className="field">
      {label}
      <select id={id} disabled aria-describedby="work-unavailable">
        <option>Chưa có dữ liệu</option>
      </select>
    </label>
  );
}
const today = () => new Date().toISOString().slice(0, 10);
const bounded = (raw: string, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(Number(raw)) ? Math.trunc(Number(raw)) : min));
export function SetupPage({
  snapshot,
  onUnavailable,
  selectedDeviceId,
  onFocusDevice,
  selectedWorkflowId,
}: PageProps) {
  const chosen = WORKFLOW_LABELS.find((entry) => entry.id === selectedWorkflowId);
  const [network, setNetwork] = useState<string>(chosen?.network ?? 'facebook'),
    [workflow, setWorkflow] = useState(chosen?.id ?? ''),
    [accountId, setAccountId] = useState(''),
    [target, setTarget] = useState(''),
    [comments, setComments] = useState(1),
    [posts, setPosts] = useState(3),
    [every, setEvery] = useState(1),
    [date, setDate] = useState(today),
    [recursive, setRecursive] = useState(true),
    [slots, setSlots] = useState(['08:00', '12:00', '19:00']),
    [preview, setPreview] = useState(false),
    [packOpen, setPackOpen] = useState(false);
  const accounts = snapshot.accounts.filter(
    (a) => a.deviceId === selectedDeviceId && a.network.toLowerCase() === network,
  );
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const rows = snapshot.media,
    flows = WORKFLOW_LABELS.filter((w) => w.network === network && w.category === 'ĐĂNG');
  const setPostCount = (value: number) => {
    setPosts(value);
    setSlots(Array.from({ length: value }, (_, i) => slots[i] ?? '08:00'));
    setPreview(false);
  };
  return (
    <>
      <Header
        eyebrow="CAMPAIGN BUILDER"
        title="Thiết lập điện thoại · media · nội dung"
        description="Một chuỗi chọn duy nhất, không mở nhiều tab. File media, nội dung và thời gian được cố định theo từng dòng trước khi đưa vào hàng đợi."
      >
        <button type="button" className="btn small" onClick={() => setPackOpen(!packOpen)}>
          <Icon name="plus" /> Bộ nội dung
        </button>
      </Header>
      <div className="stepper">
        {[
          '1. Điện thoại',
          '2. Nick / Page / Group',
          '3. Quy trình',
          '4. Media + Excel',
          '5. Lịch đăng',
        ].map((label, i) => (
          <span key={label}>
            <span className="step on">{label}</span>
            {i < 4 && <span className="arr"> → </span>}
          </span>
        ))}
      </div>
      <StateNotice snapshot={snapshot} />
      <p id="work-unavailable" className="muted">
        Bản nháp cục bộ, chưa lưu và không thể thực thi.
      </p>
      {packOpen && (
        <UiModal
          title="Tạo bộ nội dung (Caption + Hashtag + 10 bình luận)"
          onClose={() => setPackOpen(false)}
        >
          <p className="muted">Bản nháp chưa lưu</p>
          <div className="formgrid">
            <label className="field wide">
              Tên bộ nội dung
              <input maxLength={160} />
            </label>
            <label className="field wide">
              Caption
              <textarea maxLength={4096} />
            </label>
            <label className="field wide">
              Hashtag
              <input maxLength={512} />
            </label>
            {ORDINALS.slice(0, 10).map((i) => (
              <label className="field" key={i}>
                Bình luận {i + 1}
                <input maxLength={1024} />
              </label>
            ))}
          </div>
          <div className="buttonrow">
            <button type="button" className="btn" onClick={() => setPackOpen(false)}>
              Hủy
            </button>
            <Unavailable
              action="schedule"
              onUnavailable={(action) => {
                setPackOpen(false);
                onUnavailable(action);
              }}
            >
              Lưu bộ nội dung
            </Unavailable>
          </div>
        </UiModal>
      )}
      <section className="content-card">
        <CardHead
          title="01 · Chọn điện thoại và tài khoản"
          description="Chọn điện thoại trước, mọi nick/đích đăng và quy trình sẽ lọc theo điện thoại đó."
        />
        <div className="formgrid">
          <label className="field wide">
            Điện thoại được áp dụng
            <select
              id="setup-phone"
              value={selectedDeviceId}
              onChange={(e) => {
                onFocusDevice(e.target.value);
                setAccountId('');
                setTarget('');
                setWorkflow('');
                setPreview(false);
              }}
            >
              <option value="">Chưa chọn điện thoại</option>
              {snapshot.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id} · {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Mạng xã hội
            <select
              id="setup-network"
              value={network}
              onChange={(e) => {
                setNetwork(e.target.value);
                setAccountId('');
                setTarget('');
                setWorkflow('');
                setPreview(false);
              }}
            >
              {NETWORKS.map((n) => (
                <option key={n} value={n.toLowerCase()}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <label htmlFor="setup-identity">Nick đăng nhập trên điện thoại</label>
            <details className="identity-dropdown" id="setup-identity">
              <summary>
                {selectedAccount?.name ?? 'Chọn tài khoản'} <Icon name="chevron-down" />
              </summary>
              <div className="identity-menu">
                {accounts.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => {
                      setAccountId(a.id);
                      setTarget('');
                      setWorkflow('');
                    }}
                  >
                    {a.name}
                  </button>
                ))}
                {accounts.length === 0 && (
                  <div className="file-note">Chưa có tài khoản đã quét.</div>
                )}
              </div>
            </details>
          </div>
          <div className="field">
            <label htmlFor="setup-destination">Fanpage / Profile đích đăng</label>
            <details className="identity-dropdown" id="setup-destination">
              <summary>
                {selectedAccount && target === selectedAccount.target ? target : 'Chọn đích đăng'}{' '}
                <Icon name="chevron-down" />
              </summary>
              <div className="identity-menu">
                {selectedAccount?.target ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTarget(selectedAccount.target);
                      setWorkflow('');
                    }}
                  >
                    {selectedAccount.target}
                  </button>
                ) : (
                  <div className="file-note">Chưa có đích đăng phù hợp.</div>
                )}
              </div>
            </details>
          </div>
          <label className="field">
            Quy trình phù hợp với đích
            <select
              id="setup-workflow"
              value={workflow}
              onChange={(e) => setWorkflow(e.target.value)}
            >
              <option value="">Chọn quy trình</option>
              {flows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} [UNAVAILABLE]
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rowflex wrap">
          <span className="pill amber">UNAVAILABLE</span>
          <span className="muted">Nick, ID và quyền chưa được xác minh.</span>
        </div>
        {workflow.startsWith('fb-group') && (
          <div className="group-target-picker">
            <div className="file-note">Chưa phát hiện nhóm Facebook được xác minh quyền đăng.</div>
          </div>
        )}
      </section>
      <section className="content-card">
        <CardHead
          title="02 · Chọn folder & quét media"
          description="Chọn thư mục nguồn và quét media theo thứ tự tên / đường dẫn."
        />
        <div className="formgrid">
          <label className="field wide">
            Đường dẫn thư mục (tham chiếu cho bản Windows)
            <span className="rowflex">
              <input
                id="folder-path"
                placeholder="Đường dẫn nguồn · chưa được truy cập"
                maxLength={1024}
              />
              <Unavailable action="folder" onUnavailable={onUnavailable}>
                <Icon name="folder" /> Chọn folder
              </Unavailable>
            </span>
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
            />{' '}
            Quét toàn bộ thư mục con (đệ quy) · bỏ chọn để chỉ lấy file ngay thư mục gốc
          </label>
        </div>
        <div className="kpi-inline">
          <span>
            <strong>{snapshot.media.length}</strong> hàng đã tải
          </span>
          <span>
            Video: <strong>Chưa quan sát</strong>
          </span>
          <span>
            Thứ tự: <strong>đường dẫn / tên A→Z</strong>
          </span>
          <span>
            Loại quy trình: <strong>Chưa sẵn sàng</strong>
          </span>
        </div>
      </section>
      <section className="content-card">
        <CardHead
          title="03 · Caption, hashtag và bình luận 0–10"
          description="Caption mặc định lấy tên file. Có thể sửa bản nháp từng dòng; dịch vụ nội dung chưa triển khai."
        />
        <div className="setup-media-header">
          <label htmlFor="pack-select">Bộ nội dung</label>
          <select id="pack-select" disabled>
            <option>Chưa có bộ nội dung</option>
          </select>
          {[
            ['schedule', 'Điền cho cả bảng'],
            [UI_IMPORT_ACTION, 'Import Excel / CSV'],
            [UI_IMPORT_ACTION, 'Quét file bình luận'],
            [UI_EXPORT_ACTION, 'Tải mẫu XLSX'],
            [UI_EXPORT_ACTION, 'Xuất bảng XLSX'],
            [UI_EXPORT_ACTION, 'CSV'],
          ].map(([a, label]) => (
            <Unavailable key={label} action={a as DomainAction} onUnavailable={onUnavailable}>
              {label}
            </Unavailable>
          ))}
        </div>
        <div className="rowflex wrap between comment-config">
          <label className="field">
            Số lượng bình luận / media
            <span className="rowflex">
              <button
                type="button"
                className="btn tiny"
                aria-label="Giảm số bình luận"
                onClick={() => setComments(Math.max(0, comments - 1))}
              >
                −
              </button>
              <input
                type="number"
                min={0}
                max={10}
                value={comments}
                onChange={(e) => setComments(bounded(e.target.value, 0, 10))}
              />
              <button
                type="button"
                className="btn tiny"
                aria-label="Tăng số bình luận"
                onClick={() => setComments(Math.min(10, comments + 1))}
              >
                +
              </button>
            </span>
          </label>
          <span className="muted">Hiển thị {comments} cột bình luận · tối đa 10</span>
        </div>
        <div className="media-table-wrap">
          <div className="media-table-scroll" id="media-table-scroll">
            <table className="media-table">
              <thead>
                <tr>
                  <th>{'#'}</th>
                  <th>FILE / FOLDER</th>
                  <th>CAPTION</th>
                  <th>HASHTAG</th>
                  {ORDINALS.slice(0, comments).map((i) => (
                    <th className="comment-col" key={i}>
                      BÌNH LUẬN {i + 1}
                    </th>
                  ))}
                  <th>GIỜ ĐĂNG</th>
                  <th>TRẠNG THÁI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id}>
                    <td>{i + 1}</td>
                    <td className="filecol">{row.name}</td>
                    <td>
                      <input
                        aria-label={`Caption ${row.name}`}
                        defaultValue={row.caption}
                        maxLength={4096}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Hashtag ${row.name}`}
                        defaultValue={row.hashtag}
                        maxLength={512}
                      />
                    </td>
                    {ORDINALS.slice(0, comments).map((j) => (
                      <td key={j}>
                        <input
                          aria-label={`Bình luận ${j + 1} ${row.name}`}
                          defaultValue={row.comments[j] ?? ''}
                          maxLength={1024}
                        />
                      </td>
                    ))}
                    <td>
                      <input type="datetime-local" defaultValue={row.time} />
                    </td>
                    <td>
                      <span className="pill amber">UNAVAILABLE</span>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={6 + comments}>
                      <div className="media-empty">
                        Chưa có media phù hợp. Dịch vụ nguồn chưa triển khai.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="table-pager">
          <span>
            {snapshot.media.length} hàng đã tải · tối đa 20 hàng hiển thị · {comments}/10 cột bình
            luận
          </span>
          <span>Cuộn ngang →</span>
        </div>
      </section>
      <section className="content-card">
        <CardHead
          title="04 · Số bài/ngày và tần suất đăng"
          description="Số bài/ngày đăng tạo đúng số ô giờ. Hàng 2 ngày = cách 2 ngày đăng một lần; hàng 3 ngày = cách 3 ngày."
        />
        <div className="formgrid">
          <label className="field">
            Số video / ngày đăng
            <input
              type="number"
              min={1}
              max={24}
              value={posts}
              onChange={(e) => setPostCount(bounded(e.target.value, 1, 24))}
            />
          </label>
          <label className="field">
            Chu kỳ đăng (ngày)
            <input
              type="number"
              min={1}
              max={365}
              value={every}
              onChange={(e) => setEvery(bounded(e.target.value, 1, 365))}
            />
          </label>
          <label className="field">
            Ngày bắt đầu
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            Nếu gần / trùng giờ trên cùng máy
            <select defaultValue="QUEUE">
              <option value="QUEUE">QUEUE · Giữ giờ, xếp hàng đợi</option>
              <option value="AUTO_SHIFT">AUTO_SHIFT · Đề xuất dời giờ</option>
            </select>
          </label>
          <label className="field">
            Chờ sau khi bài đăng thành công (phút)
            <input type="number" min={0} max={1440} defaultValue={2} />
          </label>
          <label className="field">
            Khoảng cách giữa các bình luận (phút)
            <input type="number" min={0} max={1440} defaultValue={3} />
          </label>
          {workflow.startsWith('fb-group') && (
            <label className="field">
              Giãn cách đăng giữa các nhóm (phút)
              <input type="number" min={0} max={1440} defaultValue={60} />
            </label>
          )}
        </div>
        <div className="rowflex between">
          <strong>{posts} khung giờ trong một ngày đăng</strong>
          <span className="pill amber">Cảnh báo khi dưới 30 phút · không chặn</span>
        </div>
        <div className="slot-grid">
          {ORDINALS.slice(0, posts).map((i) => (
            <label className="slot" key={i}>
              <span>Video {i + 1}</span>
              <input
                type="time"
                value={slots[i] ?? '08:00'}
                onChange={(e) => setSlots(slots.map((v, j) => (j === i ? e.target.value : v)))}
              />
            </label>
          ))}
        </div>
        <div className="muted">
          Múi giờ: chưa xác nhận từ dịch vụ lập lịch. Không có lịch nào được lưu.
        </div>
        <div className="buttonrow">
          <button
            type="button"
            className="btn"
            onClick={() =>
              setSlots(
                Array.from({ length: posts }, (_, i) => {
                  const minutes =
                    480 + Math.round((posts === 1 ? 0 : (i * 840) / (posts - 1)) / 5) * 5;
                  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
                }),
              )
            }
          >
            Tự chia khung giờ
          </button>
          <button type="button" className="btn" onClick={() => setPreview(!preview)}>
            Xếp thời gian vào bảng
          </button>
          <Unavailable action="schedule" onUnavailable={onUnavailable}>
            Lập lịch hàng loạt
          </Unavailable>
        </div>
        {preview && (
          <div className="preview-summary">
            Bản nháp chưa lưu · chưa có media/tài khoản được xác minh; không tạo job.
          </div>
        )}
      </section>
    </>
  );
}
export function CalendarPage({
  snapshot,
  onUnavailable,
  onNavigate,
  selectedDeviceId,
  onFocusDevice,
}: PageProps) {
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('day'),
    [date, setDate] = useState(today),
    [scale, setScale] = useState(80),
    [network, setNetwork] = useState(''),
    [account, setAccount] = useState(''),
    [target, setTarget] = useState(''),
    [selectedJob, setSelectedJob] = useState('');
  const jobs =
    snapshot.status === 'READY'
      ? snapshot.jobs.filter(
          (job) =>
            (!selectedDeviceId || job.deviceId === selectedDeviceId) &&
            (!network || job.network.toLowerCase() === network) &&
            (!account || job.accountId === account) &&
            (!target || job.target === target),
        )
      : [];
  const accounts = snapshot.accounts.filter(
    (row) =>
      (!selectedDeviceId || row.deviceId === selectedDeviceId) &&
      (!network || row.network.toLowerCase() === network),
  );
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      ? date
      : today();
  function shift(amount: number) {
    const value = new Date(`${validDate}T00:00:00Z`);
    if (mode === 'month') value.setUTCMonth(value.getUTCMonth() + amount);
    else value.setUTCDate(value.getUTCDate() + amount * (mode === 'week' ? 7 : 1));
    setDate(value.toISOString().slice(0, 10));
  }
  const start = new Date(
    `${mode === 'month' ? `${validDate.slice(0, 7)}-01` : validDate}T00:00:00Z`,
  );
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return (
    <>
      <Header
        eyebrow="TIME MANAGEMENT"
        title="Quản lý lịch đăng"
        description="Kéo khối lịch qua trục giờ để đổi giờ; thao tác lưu lịch chưa triển khai. Màu nền tảng và màu riêng mỗi nick/đích được giữ ổn định."
      >
        <Unavailable action="reschedule" onUnavailable={onUnavailable}>
          <Icon name="undo" /> Hoàn tác
        </Unavailable>
      </Header>
      <StateNotice snapshot={snapshot} />
      <div className="content-card">
        <div className="cal-toolbar">
          <div className="cal-toolbar-left">
            <div className="segment">
              {(['day', 'week', 'month'] as const).map((value, i) => (
                <button
                  type="button"
                  key={value}
                  className={mode === value ? 'active' : ''}
                  onClick={() => setMode(value)}
                >
                  {['Ngày', 'Tuần', 'Tháng'][i]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="tinybtn"
              aria-label="Lùi ngày tuần tháng"
              onClick={() => shift(-1)}
            >
              <Icon name="arrow-left" />
            </button>
            <button
              type="button"
              className="tinybtn"
              aria-label="Tiến ngày tuần tháng"
              onClick={() => shift(1)}
            >
              <Icon name="chevron-right" />
            </button>
            <input
              aria-label="Ngày lịch"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button type="button" className="btn small" onClick={() => setDate(today())}>
              Hôm nay
            </button>
          </div>
          <div className="cal-toolbar-right">
            <span className="muted">Độ rộng trục giờ</span>
            <button
              type="button"
              className="tinybtn"
              aria-label="Thu nhỏ trục giờ"
              onClick={() => setScale(Math.max(44, scale - 12))}
            >
              −
            </button>
            <button
              type="button"
              className="tinybtn"
              aria-label="Mở rộng trục giờ"
              onClick={() => setScale(Math.min(160, scale + 12))}
            >
              +
            </button>
            <span className="pill blue">{scale}px/h</span>
          </div>
        </div>
        <div className="calendar-filters">
          <select
            aria-label="Tất cả điện thoại"
            value={selectedDeviceId}
            onChange={(e) => {
              onFocusDevice(e.target.value);
              setAccount('');
              setTarget('');
              setSelectedJob('');
            }}
          >
            <option value="">Tất cả điện thoại</option>
            {snapshot.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id} · {d.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Tất cả mạng xã hội"
            value={network}
            onChange={(e) => {
              setNetwork(e.target.value);
              setAccount('');
              setTarget('');
              setSelectedJob('');
            }}
          >
            <option value="">Tất cả mạng xã hội</option>
            {NETWORKS.map((n) => (
              <option key={n} value={n.toLowerCase()}>
                {n}
              </option>
            ))}
          </select>
          <select
            aria-label="Tất cả nick"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setTarget('');
              setSelectedJob('');
            }}
          >
            <option value="">Tất cả nick</option>
            {accounts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Tất cả Fanpage/kênh"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setSelectedJob('');
            }}
          >
            <option value="">Tất cả Fanpage/kênh</option>
            {[
              ...new Set(
                accounts.filter((row) => !account || row.id === account).map((row) => row.target),
              ),
            ].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="rowflex between wrap">
          <span className="muted">
            {validDate} ·{' '}
            {mode === 'day' ? 'Trục giờ 00:00–24:00' : 'Nhấp một ngày để mở trục thời gian ngang'}
          </span>
          <span className="pills">
            <span className="pill amber">Xung đột: chưa quan sát</span>
            <span className="pill blue">Facebook ưu tiên khi cùng đến hạn</span>
          </span>
        </div>
        <div className="legend">
          {NETWORKS.map((n, i) => (
            <span key={n}>
              <i
                style={{ background: `hsl(${[215, 0, 325, 0, 15, 210, 0, 200, 180][i]} 66% 46%)` }}
              />
              {n}
            </span>
          ))}
        </div>
        {mode === 'day' ? (
          <div className="timeline-outer">
            <div className="timeline-scroll" id="timeline-scroll">
              <div className="timeline">
                <div className="time-header">
                  <div className="time-label-cell">ĐIỆN THOẠI / FANPAGE</div>
                  <div className="hour-strip" style={{ width: 24 * scale, flex: 'none' }}>
                    {ORDINALS.map((i) => (
                      <div className="hour-label" key={i} style={{ left: i * scale, width: scale }}>
                        {String(i).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>
                </div>
                {jobs
                  .filter((job) => job.time.slice(0, 10) === validDate)
                  .map((job) => (
                    <div className="lane" key={job.id}>
                      <div className="lane-name">
                        <strong>{job.deviceId}</strong>
                        <small>{job.target ?? job.name}</small>
                      </div>
                      <div
                        className="lane-track"
                        style={{ width: 24 * scale, backgroundSize: `${scale}px 100%` }}
                      >
                        <button
                          type="button"
                          className={`job-block ${selectedJob === job.id ? 'selected' : ''}`}
                          style={{
                            left:
                              (Number(job.time.slice(11, 13)) +
                                Number(job.time.slice(14, 16)) / 60) *
                              scale,
                            width: Math.max(124, scale * 1.25),
                          }}
                          onClick={() => setSelectedJob(job.id)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setSelectedJob(job.id);
                          }}
                        >
                          <span className="job-bar" />
                          <span className="job-main">
                            <b>
                              {job.time.slice(11, 16)} · {job.network}
                            </b>
                            <small>{job.name} · UNAVAILABLE</small>
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                {jobs.every((job) => job.time.slice(0, 10) !== validDate) && (
                  <div className="lane">
                    <div className="lane-name">
                      <strong>Chưa có lịch</strong>
                      <small>Chưa có dữ liệu lịch được xác minh</small>
                    </div>
                    <div
                      className="lane-track"
                      style={{ width: 24 * scale, backgroundSize: `${scale}px 100%` }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="drag-hint">
              <Icon name="mouse-pointer" /> Kéo lịch, sao chép, xóa và hoàn tác chưa khả dụng; không
              có job được tạo.
            </div>
          </div>
        ) : (
          <div className={mode === 'week' ? 'week-grid' : 'month-grid'}>
            {Array.from({ length: mode === 'week' ? 7 : 42 }, (_, i) => {
              const day = new Date(start);
              day.setUTCDate(start.getUTCDate() + i);
              const key = day.toISOString().slice(0, 10);
              return (
                <button
                  type="button"
                  className={`day-card ${key === today() ? 'today' : ''}`}
                  key={key}
                  onClick={() => {
                    setDate(key);
                    setMode('day');
                  }}
                >
                  <span className="rowflex between">
                    <strong>
                      {key.slice(8)} · {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][day.getUTCDay()]}
                    </strong>
                    <span className="pill">—</span>
                  </span>
                  <span className="day-jobs">
                    {jobs
                      .filter((job) => job.time.slice(0, 10) === key)
                      .map((job) => (
                        <span key={job.id}>
                          {job.time.slice(11, 16)} · {job.name} · UNAVAILABLE
                        </span>
                      ))}
                    {jobs.every((job) => job.time.slice(0, 10) !== key) && 'Chưa có dữ liệu'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {jobs.some((job) => job.id === selectedJob) && (
          <fieldset className="buttonrow" aria-label="Thao tác lịch chưa khả dụng">
            <Unavailable action="reschedule" onUnavailable={onUnavailable}>
              Đổi giờ / sao chép lịch
            </Unavailable>
            <Unavailable action="delete-job" onUnavailable={onUnavailable}>
              Xóa lịch
            </Unavailable>
            <button type="button" className="btn small" onClick={() => setSelectedJob('')}>
              Đóng thao tác
            </button>
          </fieldset>
        )}
        <div className="buttonrow">
          <Unavailable action="reschedule" onUnavailable={onUnavailable}>
            Đề xuất dời các job sát giờ
          </Unavailable>
          <button type="button" className="btn small" onClick={() => onNavigate('setup')}>
            <Icon name="plus" /> Thiết lập lịch hàng loạt
          </button>
          <span className="muted">Múi giờ và trạng thái lịch: chưa quan sát.</span>
        </div>
      </div>
    </>
  );
}
function InteractionPage({
  snapshot,
  onUnavailable,
  onBack,
}: {
  snapshot: PageProps['snapshot'];
  onUnavailable: PageProps['onUnavailable'];
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'comments' | 'reactions'>('comments'),
    [count, setCount] = useState(1),
    [perDay, setPerDay] = useState(5),
    [draftKey, setDraftKey] = useState(0);
  return (
    <>
      <Header
        eyebrow="FACEBOOK INTERACTION REVIEW"
        title="Tương tác Facebook · Hàng đợi kiểm duyệt"
        description="Quản lý link bài viết, mẫu bình luận, trạng thái đã xử lý và lịch nhắc xem xét."
      >
        <button type="button" className="btn small" onClick={onBack}>
          <Icon name="arrow-left" /> Quay lại quy trình
        </button>
      </Header>
      <StateNotice snapshot={snapshot} />
      <section className="content-card">
        <div className="segmented">
          <button
            type="button"
            className={mode === 'comments' ? 'active' : ''}
            onClick={() => setMode('comments')}
          >
            Bình luận theo link
          </button>
          <button
            type="button"
            className={mode === 'reactions' ? 'active' : ''}
            onClick={() => setMode('reactions')}
          >
            Like / Love / Share
          </button>
        </div>
      </section>
      <div key={draftKey}>
        <section className="content-card">
          <CardHead
            title="01 · Nguồn bài viết"
            description="Chọn điện thoại, nick và Profile/Fanpage mà bạn sở hữu hoặc được ủy quyền quản lý."
          />
          <div className="formgrid">
            <EmptySelect id="int-phone" label="Điện thoại" />
            <EmptySelect id="int-account" label="Nick Facebook" />
            <EmptySelect id="int-source-target" label="Profile / Fanpage nguồn" />
            <label className="field">
              Số bài chưa xử lý cần lấy
              <input type="number" min={1} max={100} defaultValue={5} />
            </label>
            <label className="field wide">
              Link Profile / Fanpage nguồn để đồng bộ bài mới nhất
              <input maxLength={2048} placeholder="https://www.facebook.com/ten-trang" />
            </label>
            <label className="field wide">
              Hoặc dán danh sách link bài viết · mới nhất ở trên, mỗi dòng một link
              <textarea rows={4} maxLength={8192} />
            </label>
          </div>
          <label className="checkline">
            <input type="checkbox" /> Tôi sở hữu hoặc được ủy quyền quản lý nguồn bài viết này.
          </label>
          <div className="notice warn">
            Bản nháp cục bộ không cấp quyền. Không quét Facebook, mở link, gửi nội dung hoặc đọc
            lịch sử tương tác.
          </div>
        </section>
        <section className="content-card">
          <CardHead
            title={mode === 'comments' ? '02 · Danh sách bình luận' : '02 · Hành động cần xem xét'}
            description="Chỉ bản nháp kiểm duyệt, chưa lưu hay thực thi."
          />
          {mode === 'comments' ? (
            <>
              <label className="field">
                Số mẫu bình luận (0–10)
                <span className="rowflex">
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => setCount(Math.max(0, count - 1))}
                    aria-label="Giảm mẫu bình luận"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={count}
                    onChange={(e) => setCount(bounded(e.target.value, 0, 10))}
                  />
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => setCount(Math.min(10, count + 1))}
                    aria-label="Tăng mẫu bình luận"
                  >
                    +
                  </button>
                </span>
              </label>
              <label className="field">
                Nội dung bình luận · mỗi dòng một mẫu
                <textarea rows={5} maxLength={10240} />
              </label>
            </>
          ) : (
            <div className="interaction-action-grid">
              {['Like', 'Love / Tym', 'Share'].map((label) => (
                <label className="interaction-action" key={label}>
                  <input type="checkbox" />
                  <span>
                    <b>{label}</b>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="notice warn">
            Không tự động like/share/comment hàng loạt hoặc tạo tương tác giả.
          </div>
        </section>
        <section className="content-card">
          <CardHead
            title="03 · Lịch tác vụ"
            description="Chia các mục cần xem xét theo ngày và khung giờ."
          />
          <div className="formgrid">
            <label className="field">
              Số tác vụ mỗi ngày
              <input
                type="number"
                min={1}
                max={24}
                value={perDay}
                onChange={(e) => setPerDay(bounded(e.target.value, 1, 24))}
              />
            </label>
            <label className="field">
              Chu kỳ (ngày)
              <input type="number" min={1} max={365} defaultValue={1} />
            </label>
            <label className="field">
              Ngày bắt đầu
              <input type="date" defaultValue={today()} />
            </label>
          </div>
          <div className="slot-grid">
            {ORDINALS.slice(0, perDay).map((i) => (
              <label className="slot" key={i}>
                <span>Tác vụ {i + 1}</span>
                <input type="time" defaultValue="09:00" />
              </label>
            ))}
          </div>
          <div className="buttonrow">
            <Unavailable action="interaction" onUnavailable={onUnavailable}>
              Tạo hàng đợi kiểm duyệt
            </Unavailable>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDraftKey(draftKey + 1);
                setCount(1);
                setPerDay(5);
              }}
            >
              Xóa thiết lập
            </button>
          </div>
        </section>
      </div>
      <section className="content-card">
        <div className="rowflex between wrap">
          <div>
            <b>Hàng đợi tương tác</b>
            <small className="muted">Chưa chọn nick · Chưa chọn nguồn</small>
          </div>
          <span className="pill amber">UNAVAILABLE</span>
        </div>
        <div className="health-table-wrap">
          <table className="health-table interaction-table">
            <thead>
              <tr>
                {[
                  '#',
                  'BÀI VIẾT / LINK',
                  'GIỜ DỰ KIẾN',
                  mode === 'comments' ? 'BẢN NHÁP BÌNH LUẬN' : 'HÀNH ĐỘNG',
                  'TRẠNG THÁI',
                  'THAO TÁC',
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6}>Chưa có tác vụ được quan sát. Dịch vụ hàng đợi chưa triển khai.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
export function WorkflowsPage({ snapshot, onUnavailable, onChooseWorkflow }: PageProps) {
  const [interaction, setInteraction] = useState(false),
    [open, setOpen] = useState<ReadonlySet<string>>(
      () =>
        new Set([
          'facebook',
          'facebook/ĐĂNG',
          'facebook/TƯƠNG TÁC',
          'facebook/ĐĂNG/Fanpage',
          'facebook/ĐĂNG/Bản tin (Story)',
          'facebook/ĐĂNG/Đăng nhóm',
          'facebook/ĐĂNG/Nick cá nhân',
          'facebook/TƯƠNG TÁC/Bình luận theo link',
          'facebook/TƯƠNG TÁC/Like / Share / Love',
          'instagram',
          'tiktok',
        ]),
    );
  const toggle = (key: string) =>
    setOpen((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  if (interaction)
    return (
      <InteractionPage
        snapshot={snapshot}
        onUnavailable={onUnavailable}
        onBack={() => setInteraction(false)}
      />
    );
  return (
    <>
      <Header
        eyebrow="FACEBOOK FIRST · FIXED WORKFLOWS"
        title="Quy trình Facebook"
        description="Tạm thời triển khai Facebook trước. Cây quy trình tách rõ ĐĂNG và TƯƠNG TÁC; các nền tảng còn lại giữ danh mục ROADMAP."
      >
        <button type="button" className="btn small" onClick={() => setInteraction(true)}>
          Thiết lập tương tác
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            setOpen(
              new Set(
                WORKFLOW_LABELS.flatMap((w) => [
                  w.network,
                  `${w.network}/${w.category}`,
                  `${w.network}/${w.category}/${w.group}`,
                ]),
              ),
            )
          }
        >
          Mở tất cả
        </button>
        <button type="button" className="btn small" onClick={() => setOpen(new Set())}>
          Thu gọn
        </button>
      </Header>
      <section className="content-card">
        <div className="rowflex wrap between">
          <div>
            <b>Facebook · Nhóm ĐĂNG</b>
            <p className="muted">
              Video, ảnh, Reels, Story và đăng video/ảnh tới các nhóm đã xác minh quyền.
            </p>
          </div>
          <span className="pill blue">9 nhãn quy trình</span>
        </div>
        <div className="rowflex wrap between">
          <div>
            <b>Facebook · Nhóm TƯƠNG TÁC</b>
            <p className="muted">
              Hàng đợi kiểm duyệt bình luận/reaction theo link; không tự động tương tác hàng loạt.
            </p>
          </div>
          <span className="pill amber">2 nhãn quy trình</span>
        </div>
        <div className="workflow-tree">
          {NETWORKS.map((network) => {
            const id = network.toLowerCase(),
              flows = WORKFLOW_LABELS.filter((w) => w.network === id);
            return (
              <div className="tree-root" key={id}>
                <button
                  type="button"
                  className="tree-item"
                  style={{ width: '100%', textAlign: 'left' }}
                  aria-expanded={open.has(id)}
                  onClick={() => toggle(id)}
                >
                  <SocialIcon name={id} />
                  <span>{network}</span>
                  <span className="pill">{flows.length} quy trình</span>
                  <span className="caret">
                    <Icon name={open.has(id) ? 'minus' : 'plus'} />
                  </span>
                </button>
                {open.has(id) && (
                  <div className="tree-node">
                    {(id === 'facebook' ? ['ĐĂNG', 'TƯƠNG TÁC'] : ['ĐĂNG']).map((category) => {
                      const catKey = `${id}/${category}`,
                        items = flows.filter((w) => w.category === category);
                      return (
                        <div className="tree-category" key={catKey}>
                          <button
                            type="button"
                            className={`tree-item ${category === 'TƯƠNG TÁC' ? 'interaction-root' : ''}`}
                            aria-expanded={open.has(catKey)}
                            onClick={() => toggle(catKey)}
                          >
                            <Icon name={category === 'ĐĂNG' ? 'send' : 'message-circle'} />
                            <b>{category}</b>
                            <span className="pill">{items.length}</span>
                            <span className="caret">
                              <Icon name={open.has(catKey) ? 'minus' : 'plus'} />
                            </span>
                          </button>
                          {open.has(catKey) && (
                            <div className="tree-node">
                              {[...new Set(items.map((w) => w.group))].map((group) => {
                                const groupKey = `${catKey}/${group}`;
                                return (
                                  <div key={groupKey}>
                                    <button
                                      type="button"
                                      className="tree-item"
                                      style={{ width: '100%', textAlign: 'left' }}
                                      aria-expanded={open.has(groupKey)}
                                      onClick={() => toggle(groupKey)}
                                    >
                                      <Icon name="git-branch" />
                                      <span>{group}</span>
                                      <span className="caret">
                                        <Icon name={open.has(groupKey) ? 'minus' : 'plus'} />
                                      </span>
                                    </button>
                                    {open.has(groupKey) && (
                                      <div className="tree-node">
                                        {items
                                          .filter((w) => w.group === group)
                                          .map((w) => (
                                            <div className="tree-leaf" key={w.id}>
                                              <Icon
                                                name={
                                                  w.category === 'TƯƠNG TÁC'
                                                    ? 'messages-square'
                                                    : 'list-filter'
                                                }
                                              />
                                              <div style={{ flex: 1 }}>
                                                <strong>{w.name}</strong>
                                                <small>ID: {w.id} · Nhãn danh mục</small>
                                                <div className="tree-steps">
                                                  {w.steps.map((step, i) => (
                                                    <div key={step}>
                                                      {i + 1}. {step}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                              <span className="pill amber">
                                                UNAVAILABLE ·{' '}
                                                {w.status === 'ROADMAP' ? 'ROADMAP' : 'Danh mục UI'}
                                              </span>
                                              <button
                                                type="button"
                                                className="btn small primary"
                                                onClick={() =>
                                                  w.category === 'TƯƠNG TÁC'
                                                    ? setInteraction(true)
                                                    : onChooseWorkflow(w.id)
                                                }
                                              >
                                                {w.category === 'TƯƠNG TÁC' ? 'Thiết lập' : 'Chọn'}
                                              </button>
                                            </div>
                                          ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <div className="notice warn">
        Không có adapter thực thi. Không tự động like/share/comment hàng loạt. Đăng nhóm chỉ áp dụng
        với quyền được xác minh ở giai đoạn sau.
      </div>
    </>
  );
}
