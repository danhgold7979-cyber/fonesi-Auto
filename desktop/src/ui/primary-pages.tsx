import {
  readFleetHealth,
  captureFleetCsvPreview,
  isFleetCsvPreviewCurrent,
} from './fleet-health.js';
import { useState, useRef } from 'react';
import { trackingMetricPresentation } from './tracking-metric-presentation.js';
import { UI_EXPORT_ACTION, type PageProps } from './ui-model.js';
import { UnavailableButton, EmptyPanel, PageHeader, StatCard, UiModal } from './ui-shared.tsx';

const networks = [
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
const deviceTools = [
  ['package-search', 'Quản lý ứng dụng · Cài / Gỡ / Quét'],
  ['network', 'Proxy'],
  ['settings', 'Cấu hình máy'],
  ['eraser', 'Dọn cache'],
  ['layers', 'Dừng app nền'],
  ['wifi', 'Kiểm tra mạng'],
  ['clock', 'Đồng bộ giờ'],
  ['camera', 'Chụp màn hình'],
  ['folder', 'Quản lý file'],
  ['terminal', 'ADB / Logcat'],
  ['power', 'Khởi động lại'],
] as const;

function PlatformFilter({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>Mạng xã hội</label>
      <select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {networks.map((name) => (
          <option key={name} value={name.toLowerCase()}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function OverviewPage({ snapshot, onUnavailable, onNavigate }: PageProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('selected');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const devices = snapshot.status === 'READY' ? snapshot.devices : [];
  const rows = devices.filter((device) =>
    `${device.name} ${device.id} ${device.serial} ${device.connection}`
      .toLocaleLowerCase('vi-VN')
      .includes(query.toLocaleLowerCase('vi-VN')),
  );
  const chosen = devices.filter((device) => selected.includes(device.id));
  const count =
    scope === 'all'
      ? devices.length
      : scope === 'selected'
        ? chosen.length
        : devices.filter((device) => device.id === scope).length;
  const actions = [
    'app-manager',
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
  ] as const;
  return (
    <>
      <PageHeader
        eyebrow="DEVICE OPERATIONS"
        title="Tổng quan · Quản lý điện thoại"
        subtitle="Chọn một hoặc nhiều điện thoại rồi dùng thanh công cụ để thao tác theo phạm vi đã chọn."
        actions={
          <>
            <UnavailableButton action="scan" onUnavailable={onUnavailable} icon="scan">
              Quét điện thoại
            </UnavailableButton>
            <UnavailableButton action="reconnect" onUnavailable={onUnavailable} icon="refresh">
              Kết nối lại
            </UnavailableButton>
          </>
        }
      />
      <section className="content-card">
        <div className="scopebar">
          <div className="rowflex wrap">
            <label className="label" htmlFor="manage-phone">
              Phạm vi thao tác
            </label>
            <select
              id="manage-phone"
              value={scope}
              onChange={(event) => setScope(event.currentTarget.value)}
            >
              <option value="selected">Đang tích chọn ({chosen.length})</option>
              <option value="all">Tất cả ({devices.length})</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.id} · {device.name}
                </option>
              ))}
            </select>
            <span className="pill blue">{count} máy đích</span>
          </div>
          <span className="muted">Mặc định không chọn tất cả · phải xác nhận phạm vi</span>
        </div>
        <div className="opsbar" id="overview-ops">
          {deviceTools.map(([icon, label], index) => (
            <UnavailableButton
              key={label}
              action={actions[index] ?? 'device-config'}
              onUnavailable={onUnavailable}
              icon={icon}
            >
              {label}
            </UnavailableButton>
          ))}
        </div>
      </section>
      <div className="stat-grid">
        <StatCard
          label="Điện thoại"
          value={devices.length}
          detail="Số bản ghi đã tải · không phải số thiết bị được phát hiện"
        />
        <StatCard label="Đang kết nối" value="—" detail="Chưa có quan sát kết nối" />
        <StatCard label="Job đã xếp" value="—" detail="Dịch vụ lịch chưa khả dụng" />
        <StatCard label="Cảnh báo vận hành" value="—" detail="Chưa có dữ liệu sức khỏe" />
      </div>
      <section className="content-card">
        <div className="rowflex between wrap">
          <b>Danh sách điện thoại</b>
          <span className="pill blue">{rows.length} bản ghi khớp</span>
        </div>
        <label className="field">
          <span className="label">Tìm điện thoại</span>
          <input
            id="overview-search"
            type="search"
            placeholder="Tìm điện thoại, serial, ADB/LAN/Wi-Fi..."
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div className="device-table">
          <div className="device-row header">
            <span>✓</span>
            <span>TÊN / SERIAL</span>
            <span>TRẠNG THÁI</span>
            <span>KIỂU KẾT NỐI</span>
            <span>PIN / DUNG LƯỢNG</span>
            <span>THIẾT LẬP</span>
          </div>
          <div className="devlist-scroller">
            {rows.map((device) => (
              <div className="device-row" key={device.id}>
                <input
                  type="checkbox"
                  aria-label={`Chọn ${device.id}`}
                  checked={selected.includes(device.id)}
                  onChange={(event) =>
                    setSelected(
                      event.currentTarget.checked
                        ? [...selected, device.id]
                        : selected.filter((id) => id !== device.id),
                    )
                  }
                />
                <span>
                  <strong>{device.name}</strong>
                  <span className="sub">
                    {device.id} · {device.serial}
                  </span>
                </span>
                <span className="pill dark">{device.status}</span>
                <span className="muted">{device.connection}</span>
                <span className="muted">— / —</span>
                <button
                  type="button"
                  className="inline-link"
                  onClick={() => onNavigate('setup', device.id)}
                >
                  Thiết lập
                </button>
              </div>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyPanel
            status={snapshot.status}
            detail="Chưa có điện thoại phù hợp. Dịch vụ thiết bị chưa khả dụng."
          />
        ) : (
          <p className="tab-note">Dữ liệu kiểm thử tổng hợp · không phải thiết bị được quan sát.</p>
        )}
      </section>
    </>
  );
}

export function AccountsPage({
  snapshot,
  onUnavailable,
  selectedDeviceId,
  onFocusDevice,
}: PageProps) {
  const [network, setNetwork] = useState('facebook');
  const [query, setQuery] = useState('');
  const devices = snapshot.status === 'READY' ? snapshot.devices : [];
  const activePhone = devices.some((device) => device.id === selectedDeviceId)
    ? selectedDeviceId
    : '';
  const accounts =
    snapshot.status === 'READY'
      ? snapshot.accounts.filter(
          (account) =>
            account.deviceId === activePhone &&
            account.network === network &&
            `${account.name} ${account.id} ${account.target}`
              .toLocaleLowerCase('vi-VN')
              .includes(query.toLocaleLowerCase('vi-VN')),
        )
      : [];
  return (
    <>
      <PageHeader
        eyebrow="ACCOUNT REGISTRY"
        title="Tài khoản & đích đăng"
        subtitle="Chọn điện thoại để xem profile và các Fanpage / Group / kênh liên kết. Đăng nhập do người dùng thực hiện; tool không thu thập mật khẩu."
        actions={
          <>
            <UnavailableButton action="account-scan" onUnavailable={onUnavailable} icon="scan">
              Quét tài khoản trên máy
            </UnavailableButton>
            <UnavailableButton
              action="account-refresh"
              onUnavailable={onUnavailable}
              icon="refresh"
            >
              Làm mới
            </UnavailableButton>
          </>
        }
      />
      <section className="content-card account-filterbar">
        <div className="formgrid">
          <div className="field">
            <label htmlFor="accounts-phone">Điện thoại</label>
            <select
              id="accounts-phone"
              value={activePhone}
              onChange={(event) => onFocusDevice(event.currentTarget.value)}
            >
              <option value="">Chọn điện thoại</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.id} · {device.name} · {device.status}
                </option>
              ))}
            </select>
          </div>
          <PlatformFilter id="accounts-network" value={network} onChange={setNetwork} />
          <div className="field wide">
            <label htmlFor="accounts-search">Tìm nick / Fanpage / Group / ID</label>
            <input
              id="accounts-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Tìm theo tên hoặc ID..."
            />
          </div>
        </div>
        <div className="rowflex wrap between">
          <span className="pill blue">
            {accounts.length} tài khoản ·{' '}
            {accounts.filter((account) => account.target !== '').length} nhãn đích
          </span>
          <span className="muted">Kết nối: — · Danh tính: chưa xác minh</span>
        </div>
      </section>
      <section className="content-card">
        <div className="account-list-head">
          <b>DANH SÁCH TÀI KHOẢN</b>
          <span className="muted">Avatar · Tên · Trạng thái · Đích đăng</span>
        </div>
        {accounts.map((account) => (
          <article className="account-row" key={account.id}>
            <div className="account-main">
              <span className="identity-avatar" role="img" aria-label="Chưa có avatar">
                ?
              </span>
              <div className="account-copy">
                <b>{account.name}</b>
                <small>
                  {account.network} · {account.id} · Hoạt động: —
                </small>
                <div className="account-metrics">
                  <span>Video: —</span>
                  <span>Thời hạn: —</span>
                  <span>Danh tính chưa xác minh</span>
                </div>
              </div>
              <div className="account-statuses">
                <span className="health-flag blue">{account.status}</span>
              </div>
              <div className="account-actions">
                <UnavailableButton action="login" onUnavailable={onUnavailable} icon="log-in">
                  Đăng nhập
                </UnavailableButton>
                <UnavailableButton action="account-scan" onUnavailable={onUnavailable} icon="scan">
                  Quét lại
                </UnavailableButton>
              </div>
            </div>
            <details className="account-targets">
              <summary>Đích đăng · chưa xác minh</summary>
              <div className="target-row">
                <span className="identity-avatar sm" role="img" aria-label="Chưa có avatar đích">
                  ?
                </span>
                <div>
                  <b>{account.target || 'Chưa có đích đăng'}</b>
                  <small>Loại / ID / quyền: chưa xác minh</small>
                </div>
                <span className="pill dark">UNAVAILABLE</span>
              </div>
            </details>
          </article>
        ))}
        {accounts.length === 0 ? (
          <EmptyPanel
            status={snapshot.status}
            detail="Chưa có tài khoản phù hợp. Chọn điện thoại và mạng xã hội; dịch vụ nhận diện chưa khả dụng."
          />
        ) : null}
      </section>
      <div className="notice warn">
        Không lấy hoặc lưu mật khẩu, OTP hay cookie thô. Danh tính chưa xác minh không thể được chọn
        cho một tác vụ chạy thật.
      </div>
    </>
  );
}

export function TrackingPage({
  snapshot,
  onUnavailable,
  onNavigate,
  selectedDeviceId,
  onFocusDevice,
}: PageProps) {
  const health = readFleetHealth(snapshot);
  const accountScopeKnown = snapshot.status === 'READY' && snapshot.provenance === 'SYNTHETIC_TEST';
  const [network, setNetwork] = useState('facebook');
  const [query, setQuery] = useState('');
  const [accountId, setAccountId] = useState('');
  const [csvPreview, setCsvPreview] = useState<Readonly<{
    capture: NonNullable<ReturnType<typeof captureFleetCsvPreview>>;
    phone: string;
    network: string;
    query: string;
    accountId: string;
  }> | null>(null);
  const clickIntent = useRef<object | null>(null);
  const currentPreview =
    csvPreview &&
    csvPreview.phone === selectedDeviceId &&
    csvPreview.network === network &&
    csvPreview.query === query &&
    csvPreview.accountId === accountId &&
    isFleetCsvPreviewCurrent(csvPreview.capture, snapshot)
      ? csvPreview
      : null;
  // Hide before effects and clear permanently: returning to an old context cannot
  // resurrect an earlier intent. Equivalent newly allocated projections may stay.
  if (csvPreview && !currentPreview) setCsvPreview(null);
  const intent = { open: currentPreview !== null };
  clickIntent.current = intent;
  const previewCsv = () => {
    if (clickIntent.current !== intent || intent.open) return;
    const capture = captureFleetCsvPreview(snapshot);
    if (!capture) {
      onUnavailable(UI_EXPORT_ACTION);
      return;
    }
    intent.open = true;
    setCsvPreview({ capture, phone: selectedDeviceId, network, query, accountId });
  };

  const devices = snapshot.status === 'READY' ? snapshot.devices : [];
  const healthDevices = health || accountScopeKnown ? devices : [];
  const activePhone = devices.some((device) => device.id === selectedDeviceId)
    ? selectedDeviceId
    : '';
  const accounts =
    snapshot.status === 'READY'
      ? snapshot.accounts.filter(
          (account) =>
            account.deviceId === activePhone &&
            account.network === network &&
            `${account.name} ${account.id}`
              .toLocaleLowerCase('vi-VN')
              .includes(query.toLocaleLowerCase('vi-VN')),
        )
      : [];
  const active = accounts.find((account) => account.id === accountId);
  const metricPresentation = trackingMetricPresentation(network);
  return (
    <>
      <PageHeader
        eyebrow="GROWTH & CONTENT ANALYTICS"
        title="Theo dõi tăng trưởng"
        subtitle="Chọn điện thoại và mạng xã hội để kiểm tra tài khoản, chỉ số tăng trưởng và hiệu quả bài đăng."
        actions={
          <>
            <UnavailableButton
              action="metrics-refresh"
              onUnavailable={onUnavailable}
              icon="scan"
              title={metricPresentation.detail}
            >
              Check tất cả ({accountScopeKnown ? accounts.length : '—'})
            </UnavailableButton>
            {health ? (
              <button type="button" className="btn" id="fleet-csv-preview" onClick={previewCsv}>
                Xem trước CSV fleet nội bộ
              </button>
            ) : (
              <UnavailableButton
                action={UI_EXPORT_ACTION}
                onUnavailable={onUnavailable}
                icon="download"
                title="Chưa có nguồn fleet đã được xác nhận để xem trước CSV"
              >
                Xem trước CSV fleet nội bộ · chưa có nguồn
              </UnavailableButton>
            )}
          </>
        }
      />
      {currentPreview ? (
        <UiModal
          title="Xem trước CSV fleet nội bộ"
          onClose={() => setCsvPreview((value) => (value === currentPreview ? null : value))}
        >
          <p className="notice" data-fleet-csv-scope>
            Toàn bộ {currentPreview.capture.recordCount} bản ghi registry đã nhận, cùng phạm vi với
            bảng sức khỏe. Bộ lọc điện thoại/mạng/tài khoản không thu hẹp CSV này. Không phải tổng
            điều tra thiết bị vật lý.
          </p>
          <p data-fleet-csv-source>
            Nguồn: {currentPreview.capture.source} · {currentPreview.capture.scope} · registry{' '}
            {currentPreview.capture.registryRevision} · selection{' '}
            {currentPreview.capture.selectionRevision}
          </p>
          <p className="notice warn">
            Chỉ xem trong ứng dụng, chưa lưu tệp. Thời điểm quan sát/xác minh chưa được nguồn cung
            cấp (NOT_PROVIDED_BY_SOURCE); không xác định độ mới. Xác minh registry không xác nhận
            đăng nhập tài khoản. Không gồm serial, tài khoản, media, công việc, IP, pin, dung lượng,
            transport, stream hoặc chỉ số nền tảng vì chưa có nguồn phù hợp.
          </p>
          <p className="muted">
            CSV v1 · dấu phẩy · CRLF · {currentPreview.capture.utf8Bytes} byte UTF-8. Ô có nguy cơ
            công thức được thêm dấu nháy đơn, không giữ nguyên biểu diễn gốc. Số giữ chuỗi thập
            phân; chưa chứng nhận tự nhận dạng kiểu/số lớn trong bảng tính.
          </p>
          <div className="field">
            <label htmlFor="fleet-csv-text">Nội dung CSV đã chụp</label>
            <textarea id="fleet-csv-text" readOnly rows={12} value={currentPreview.capture.csv} />
          </div>
        </UiModal>
      ) : null}
      <section className="content-card tracking-filters">
        <div className="formgrid">
          <div className="field">
            <label htmlFor="tracking-phone">Điện thoại</label>
            <select
              id="tracking-phone"
              value={activePhone}
              onChange={(event) => {
                onFocusDevice(event.currentTarget.value);
                setAccountId('');
              }}
            >
              <option value="">Chọn điện thoại</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.id} · {device.name} · {device.status}
                </option>
              ))}
            </select>
          </div>
          <PlatformFilter
            id="tracking-network"
            value={network}
            onChange={(value) => {
              setNetwork(value);
              setAccountId('');
            }}
          />
          <div className="field">
            <label htmlFor="tracking-search">Tìm tài khoản</label>
            <input
              id="tracking-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setAccountId('');
              }}
              placeholder="Tìm theo tên nick / ID..."
            />
          </div>
          <div className="field">
            <label htmlFor="tracking-account">Tài khoản / đích đang theo dõi</label>
            <select
              id="tracking-account"
              value={active?.id ?? ''}
              onChange={(event) => setAccountId(event.currentTarget.value)}
            >
              <option value="">Chọn tài khoản</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.target || 'Chưa có đích'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="rowflex between wrap">
          <span className="pill blue">
            {accountScopeKnown
              ? `${accounts.length} tài khoản mẫu đã tải`
              : 'Tài khoản: chưa có nguồn'}
          </span>
          <span
            className="muted"
            id="tracking-metric-availability"
            data-tracking-availability={metricPresentation.reason}
          >
            {metricPresentation.detail}
          </span>
        </div>
      </section>
      <div className="stat-grid">
        <StatCard
          label="Tài khoản trong bộ lọc"
          value={accountScopeKnown ? accounts.length : '—'}
          detail="Bản ghi tài khoản trong bộ lọc; chưa có nguồn thật"
        />
        <StatCard label="Bài đăng theo dõi" detail="Chưa có dữ liệu bài đăng" />
        <StatCard label="Đã check trong phiên" detail="Dịch vụ đo chưa khả dụng" />
        <StatCard label="Lần check gần nhất" detail="Chưa có thời điểm đo" />
      </div>
      <section className="content-card">
        <div className="rowflex between wrap">
          <b>Sức khỏe điện thoại</b>
          <span className="muted" data-fleet-health-scope>
            {health
              ? `${health.recordCount} bản ghi trong toàn bộ registry đã nhận`
              : 'Số bản ghi: chưa khả dụng'}
          </span>
        </div>
        <small className="muted" data-fleet-health-source>
          {health
            ? `Nguồn: ${health.source} · registry ${health.registryRevision} · selection ${health.selection.revision}`
            : 'Nguồn fleet: chưa khả dụng'}
          {' · Thời điểm quan sát/xác minh: chưa có · Không xác định độ mới'}
        </small>
        <div className="health-table-wrap">
          <table className="health-table tracking-device-health">
            <colgroup>
              {[
                ['device', 28],
                ['connection', 14],
                ['battery', 12],
                ['storage', 18],
                ['accounts', 12],
                ['status', 16],
              ].map(([name, width]) => (
                <col key={name} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>ĐIỆN THOẠI</th>
                <th>KẾT NỐI</th>
                <th>PIN</th>
                <th>DUNG LƯỢNG TRỐNG</th>
                <th>TÀI KHOẢN</th>
                <th>TRẠNG THÁI</th>
              </tr>
            </thead>
            <tbody>
              {healthDevices.map((device) => (
                <tr key={device.id}>
                  <td>
                    <b>
                      {device.id} · {device.name}
                    </b>
                    <small>
                      {device.serial} · Generation {device.generation}
                    </small>
                    <button
                      type="button"
                      className="inline-link"
                      onClick={() => onNavigate('setup', device.id)}
                    >
                      Thiết lập nội dung
                    </button>
                    <button
                      type="button"
                      className="inline-link"
                      onClick={() => onNavigate('calendar', device.id)}
                    >
                      Quản lý lịch
                    </button>
                  </td>
                  <td>{device.connection}</td>
                  <td>
                    —<small>Chưa có phép đo</small>
                  </td>
                  <td>
                    —<small>Chưa có phép đo</small>
                  </td>
                  <td>—</td>
                  <td>
                    <span className="pill dark">{device.status}</span>
                    <small>
                      Xác minh thiết bị trong registry:{' '}
                      {health?.records.find((row) => row.deviceId === device.id)?.verification ??
                        'UNAVAILABLE'}
                    </small>
                    <small>Không xác nhận đăng nhập tài khoản</small>
                  </td>
                </tr>
              ))}
              {healthDevices.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyPanel
                      status={snapshot.status}
                      detail="Chưa có dữ liệu sức khỏe điện thoại."
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="content-card">
        <div className="rowflex between wrap">
          <b>Danh sách tài khoản & tăng trưởng</b>
          <span className="muted">Đỏ ≤5% · vàng 6–49% · xanh ≥50% khi có dữ liệu hợp lệ</span>
        </div>
        <div className="tracking-account-list">
          {accounts.map((account) => (
            <article
              className={`tracking-account ${active?.id === account.id ? 'selected' : ''}`}
              key={account.id}
            >
              <div className="tracking-account-main">
                <span className="identity-avatar" role="img" aria-label="Chưa có avatar">
                  ?
                </span>
                <div className="tracking-account-title">
                  <b>{account.name}</b>
                  <small>
                    {account.network} · {account.id}
                  </small>
                  <small>Chưa kiểm tra · danh tính chưa xác minh</small>
                </div>
                <div className="tracking-account-stats">
                  <b>—</b>
                  <small>Followers / Subscribers / Members</small>
                  <span className="pill dark">Chưa có so sánh</span>
                </div>
                <div className="tracking-account-actions">
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => setAccountId(account.id)}
                  >
                    Chi tiết
                  </button>
                  <UnavailableButton
                    action="metrics-refresh"
                    onUnavailable={onUnavailable}
                    icon="scan"
                  >
                    Check
                  </UnavailableButton>
                </div>
              </div>
              <div className="tracking-bars">
                {['Kho video còn lại', 'Thời hạn còn lại'].map((label) => (
                  <div className="tracking-progress" key={label}>
                    <div className="tracking-progress-head">
                      <span>{label}</span>
                      <b>—</b>
                    </div>
                    <div
                      className="tracking-progress-track"
                      role="img"
                      aria-label={`${label}: chưa có dữ liệu`}
                    />
                    <small>Chưa có dữ liệu · không thể tính phần trăm</small>
                  </div>
                ))}
              </div>
              <div className="tracking-account-foot">
                <span className="health-flag blue">Chưa có dữ liệu nguồn đề xuất</span>
              </div>
            </article>
          ))}
          {accounts.length === 0 ? (
            <EmptyPanel
              status={snapshot.status}
              detail="Không có tài khoản trong bộ lọc đã chọn."
            />
          ) : null}
        </div>
      </section>
      <section className="content-card">
        <div className="rowflex between wrap">
          <div>
            <b>Chỉ số tài khoản đang chọn</b>
            <small className="muted">{active?.name ?? 'Chưa chọn tài khoản'}</small>
          </div>
          <span className="pill dark" aria-describedby="tracking-metric-availability">
            {metricPresentation.availability}
          </span>
        </div>
        <small className="muted" data-tracking-catalog-notice>
          {metricPresentation.catalogNotice}
        </small>
        <div className="tracking-metrics-grid">
          {metricPresentation.metrics.map((metric) => (
            <div
              className="tracking-metric"
              key={metric.key}
              data-tracking-metric={metric.key}
              title={metricPresentation.detail}
              aria-describedby="tracking-metric-availability"
            >
              <small>{metric.label}</small>
              <b>—</b>
            </div>
          ))}
        </div>
        <div className="tracking-recommendation">
          <b>Tín hiệu phân phối</b>
          <span className="health-flag blue">Chưa có dữ liệu nguồn đề xuất</span>
          <small>
            Nguồn: chưa khả dụng · Đo gần nhất: — · Độ mới: chưa xác định.{' '}
            {metricPresentation.growthDetail} {metricPresentation.recommendationDetail}
          </small>
        </div>
      </section>
      <section className="content-card">
        <div className="rowflex between wrap">
          <b>Hiệu quả bài đăng theo bộ lọc</b>
          <span className="muted">Views · Likes · Comments · Shares/Forwards</span>
        </div>
        <div className="health-table-wrap">
          <table className="health-table">
            <thead>
              <tr>
                {[
                  'BÀI ĐĂNG',
                  'THỜI GIAN',
                  'VIEWS',
                  'LIKES',
                  'COMMENTS',
                  'SHARES',
                  'RECOMMENDATION REACH',
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7}>
                  <EmptyPanel
                    status={snapshot.status}
                    detail="Chưa có dữ liệu bài đăng từ nguồn được phép."
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="content-card">
        <div className="rowflex between wrap">
          <b>Lịch sử các lần kiểm tra</b>
          <span className="pill">Snapshot: chưa có nguồn</span>
        </div>
        <EmptyPanel
          status={snapshot.status}
          detail="Chưa có snapshot; dịch vụ kiểm tra chưa khả dụng."
        />
      </section>
      <div className="notice warn">
        Chỉ hiển thị số liệu thực từ nguồn được phép. Không suy luận mức đề xuất từ like/follow hoặc
        biến giá trị chưa biết thành số không.
      </div>
    </>
  );
}
