import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react';
import {
  PAGES,
  NETWORKS,
  unavailableAction,
  unavailableSnapshot,
  type PageKey,
  type DomainAction,
  type UiSnapshot,
} from './ui-model.js';
import { Icon, SocialIcon, UnavailableButton, EmptyPanel, UiModal } from './ui-shared.tsx';
import { OverviewPage, AccountsPage, TrackingPage } from './primary-pages.tsx';
import { SetupPage, CalendarPage, WorkflowsPage, WORKFLOW_LABELS } from './work-pages.tsx';
export type ShellProps = Readonly<{
  theme: 'LIGHT' | 'DARK';
  ready: boolean;
  pending: boolean;
  reconcile: boolean;
  status: string;
  dockWidth: number;
  requestedDockWidth?: number | null;
  tileWidth: number;
  onTheme: () => void;
  onDimensions: (dock: number | null, tile: number) => void;
  settings: ReactNode;
  snapshot?: UiSnapshot;
}>;
function Performance({
  onUnavailable,
}: Readonly<{ onUnavailable: (action: DomainAction) => void }>) {
  return (
    <>
      <div className="notice">
        Stream và cảm biến chưa khả dụng. Giá trị yêu cầu không phải cấu hình đã áp dụng.
      </div>
      <div className="formgrid">
        <label className="field">
          <span className="label">Chế độ</span>
          <select disabled defaultValue="Manual">
            <option>Manual</option>
            <option>Auto</option>
          </select>
        </label>
        <label className="field">
          <span className="label">Phạm vi stream</span>
          <select disabled>
            <option>Máy đang tập trung</option>
            <option>Máy đã chọn</option>
            <option>Tất cả máy kết nối</option>
          </select>
        </label>
        {[
          'FPS yêu cầu / thực nhận',
          'Độ phân giải / tỉ lệ',
          'Bitrate / chất lượng',
          'Số stream đồng thời',
        ].map((label) => (
          <label className="field" key={label}>
            <span className="label">{label}</span>
            <input disabled value="Chưa có capability đã kiểm chứng" readOnly />
          </label>
        ))}
        <label className="field">
          <span>
            <input type="checkbox" disabled /> Giảm tải khẩn cấp (Manual mặc định tắt)
          </span>
        </label>
        <label className="field">
          <span>
            <input type="checkbox" disabled /> Tự khôi phục — đồng ý riêng
          </span>
        </label>
      </div>
      <div className="stat-grid">
        {[
          'CPU',
          'RAM',
          'GPU',
          'Đĩa trống',
          'Mạng',
          'Stream / backlog',
          'Hàng đợi Vision',
          'Mức tài nguyên',
        ].map((label) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>—</strong>
            <small>UNKNOWN · không có mẫu quan sát</small>
          </div>
        ))}
      </div>
      <div className="notice">
        Yêu cầu / hiệu lực / đề xuất: UNAVAILABLE. Thay đổi kích thước ô không thay đổi độ phân giải
        Android hay stream.
      </div>
      <div className="rowflex">
        <UnavailableButton action="stream" onUnavailable={onUnavailable}>
          Áp dụng
        </UnavailableButton>
        <UnavailableButton action="stream" onUnavailable={onUnavailable}>
          Dùng đề xuất
        </UnavailableButton>
      </div>
    </>
  );
}
const QUICK = [
  ['home', 'Home'],
  ['arrow-left', 'Back'],
  ['layers', 'Recent'],
  ['x', 'Bỏ chọn'],
  ['square', 'Dừng nền'],
  ['camera', 'Chụp màn hình'],
  ['refresh', 'Làm mới'],
  ['power', 'Nguồn'],
  ['terminal', 'ADB'],
] as const;
export function UiShell(p: ShellProps) {
  const supplied = p.snapshot ?? unavailableSnapshot;
  const snapshot: UiSnapshot =
    supplied.status === 'READY' && supplied.provenance === 'SYNTHETIC_TEST'
      ? supplied
      : { ...supplied, devices: [], accounts: [], media: [], jobs: [] };
  const [page, setPage] = useState<PageKey>('overview');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [modal, setModal] = useState<'help' | 'unavailable' | null>(null);
  const [performance, setPerformance] = useState(false);
  const [action, setAction] = useState<DomainAction>('scan');
  const [picker, setPicker] = useState(false),
    [search, setSearch] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]),
    [active, setActive] = useState('');
  const [view, setView] = useState<'all' | 'one'>('all');
  const [draftDock, setDraftDock] = useState<number | null>(null),
    [draftTile, setDraftTile] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null),
    pickerButton = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false),
    currentDock = useRef(p.dockWidth);
  const blocked = p.pending || !p.ready || p.reconcile;
  const tile = draftTile ?? p.tileWidth,
    dock = draftDock ?? p.dockWidth;
  useEffect(() => {
    document.documentElement.dataset.theme = p.theme === 'DARK' ? 'dark' : 'light';
  }, [p.theme]);
  useEffect(() => {
    if (!picker) return;
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && !pickerRef.current?.contains(e.target)) setPicker(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPicker(false);
        pickerButton.current?.focus();
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [picker]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === '?' &&
        document.querySelector('[role="dialog"]') === null &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setModal('help');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!p.pending) {
      setDraftTile(null);
      if (!dragging.current) setDraftDock(null);
    }
  }, [p.pending]);
  const focusDevice = (id: string) => {
    if (id === '') {
      setActive('');
      setView('all');
      return;
    }
    if (!snapshot.devices.some((d) => d.id === id)) return;
    setActive(id);
    setSelected((current) => (current.includes(id) ? current : [...current, id]));
    setView('one');
  };
  const navigate = (next: PageKey, deviceId?: string) => {
    if (deviceId) focusDevice(deviceId);
    setPage(next);
    setPicker(false);
    setModal(null);
  };
  const unavailable = (next: DomainAction) => {
    unavailableAction(next);
    setAction(next);
    setModal('unavailable');
  };
  const pageProps = {
    snapshot,
    onUnavailable: unavailable,
    onNavigate: navigate,
    selectedDeviceId: active,
    selectedWorkflowId,
    onChooseWorkflow: (id: string) => {
      if (!WORKFLOW_LABELS.some((entry) => entry.id === id)) return;
      setSelectedWorkflowId(id);
      navigate('setup');
    },
    onFocusDevice: focusDevice,
  };
  const content =
    page === 'overview' ? (
      <OverviewPage {...pageProps} />
    ) : page === 'accounts' ? (
      <AccountsPage {...pageProps} />
    ) : page === 'tracking' ? (
      <TrackingPage {...pageProps} />
    ) : page === 'setup' ? (
      <SetupPage {...pageProps} />
    ) : page === 'calendar' ? (
      <CalendarPage {...pageProps} />
    ) : (
      <WorkflowsPage {...pageProps} />
    );
  const zoom = (value: number) => {
    if (blocked) return;
    const next = Math.max(70, Math.min(520, Math.round(value)));
    setDraftTile(next);
    p.onDimensions(p.requestedDockWidth ?? null, next);
  };
  const devices = snapshot.devices.filter((d) =>
    `${d.id} ${d.name} ${d.serial}`
      .toLocaleLowerCase('vi-VN')
      .includes(search.toLocaleLowerCase('vi-VN')),
  );
  return (
    <>
      <div
        className="shell"
        id="shell"
        inert={modal !== null}
        style={{ '--wallW': `${dock}px`, '--screenW': `${tile}px` } as CSSProperties}
      >
        <aside className="side" aria-label="Điều hướng">
          <div className="brand">
            <div className="brandmark">F</div>
            <div>
              <strong>Fonesi-Auto</strong>
              <small>
                AUTOREELS STUDIO <b>V9</b>
              </small>
            </div>
          </div>
          <div className="side-caption">KHÔNG GIAN LÀM VIỆC</div>
          <nav className="nav" id="nav">
            {PAGES.map((item) => (
              <button
                className={`navitem ${page === item.key ? 'active' : ''}`}
                data-page={item.key}
                key={item.key}
                type="button"
                onClick={() => navigate(item.key)}
                aria-current={page === item.key ? 'page' : undefined}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.key === 'calendar' ? (
                  <span className="navcount">{snapshot.jobs.length}</span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="side-divider" />
          <button
            className="side-help"
            id="open-help"
            type="button"
            onClick={() => setModal('help')}
          >
            <Icon name="keyboard" />
            <span>Phím tắt & hướng dẫn</span>
            <Icon name="chevron-right" />
          </button>
        </aside>
        <main className="main">
          <header className="topbar">
            <div className="crumb">
              <span className="top-logo">Fonesi-Auto</span>
              <span className="crumbslash">/</span>
              <strong id="page-crumb">{PAGES.find((x) => x.key === page)?.label}</strong>
            </div>
            <div className="top-actions">
              <span className="top-demo">Dịch vụ chưa khả dụng</span>
              <button
                className="iconbtn"
                id="theme-toggle"
                type="button"
                disabled={blocked}
                aria-label="Chuyển giao diện"
                title="Chuyển Dark / Light"
                onClick={p.onTheme}
              >
                <Icon name={p.theme === 'DARK' ? 'sun' : 'moon'} />
              </button>
              <button
                className="iconbtn"
                id="help-top"
                type="button"
                title="Phím tắt và thiết lập"
                aria-label="Phím tắt và thiết lập"
                onClick={() => setModal('help')}
              >
                <Icon name="circle-help" />
              </button>
              <div className="user-badge">FA</div>
            </div>
          </header>
          <section className="workspace" id="workspace" aria-live="polite" data-page={page}>
            {content}
          </section>
        </main>
        <aside className="wall" id="wall" aria-label="Màn hình giám sát điện thoại">
          <hr
            className="wall-resizer"
            id="wall-resizer"
            aria-orientation="vertical"
            aria-label="Độ rộng vùng giám sát"
            aria-valuemin={300}
            aria-valuemax={16384}
            aria-valuenow={Math.round(dock)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (!blocked && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                p.onDimensions(
                  Math.max(300, Math.min(16384, dock + (e.key === 'ArrowLeft' ? 10 : -10))),
                  tile,
                );
              }
            }}
            onPointerDown={(e) => {
              if (blocked) return;
              dragging.current = true;
              currentDock.current = dock;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              const width = Math.max(
                300,
                Math.min(16384, window.innerWidth - 510, Math.round(window.innerWidth - e.clientX)),
              );
              currentDock.current = width;
              setDraftDock(width);
            }}
            onPointerUp={(e) => {
              if (!dragging.current) return;
              dragging.current = false;
              e.currentTarget.releasePointerCapture(e.pointerId);
              p.onDimensions(currentDock.current, tile);
            }}
            onPointerCancel={() => {
              dragging.current = false;
              setDraftDock(null);
            }}
          />
          <header className="wallhead">
            <div>
              <div className="walltitle">
                <Icon name="monitor-smartphone" />
                <strong>Giám sát điện thoại</strong>
              </div>
              <p>
                <span id="online-text">Chưa có nguồn thiết bị</span>
              </p>
            </div>
            <div className="rowflex">
              <button
                className="iconbtn"
                id="wall-performance"
                title="Hiệu năng và chất lượng stream"
                aria-label="Hiệu năng và chất lượng stream"
                type="button"
                aria-expanded={performance}
                onClick={() => setPerformance(!performance)}
              >
                <Icon name="gauge" />
              </button>
              <UnavailableButton
                action="scan"
                onUnavailable={unavailable}
                icon="scan"
                className="iconbtn"
                title="Quét điện thoại — chưa khả dụng"
              />
              <UnavailableButton
                action="reconnect"
                onUnavailable={unavailable}
                icon="refresh"
                className="iconbtn"
                title="Kết nối lại — chưa khả dụng"
              />
              <button
                className="iconbtn"
                id="wall-reset"
                title="Khôi phục độ rộng panel"
                type="button"
                disabled={blocked}
                onClick={() => p.onDimensions(null, tile)}
              >
                <Icon name="panel-right" />
              </button>
            </div>
          </header>
          {performance ? (
            <section className="performance-panel" aria-label="Hiệu năng và chất lượng stream">
              <div className="rowflex between">
                <strong>Hiệu năng / stream</strong>
                <button
                  className="tinybtn"
                  type="button"
                  aria-label="Đóng bảng hiệu năng"
                  onClick={() => setPerformance(false)}
                >
                  <Icon name="x" />
                </button>
              </div>
              <Performance onUnavailable={unavailable} />
            </section>
          ) : null}
          <div className="wall-controls">
            <div className="wall-dropdown-wrap" ref={pickerRef}>
              <button
                className="wall-picker"
                id="wall-device-picker"
                ref={pickerButton}
                type="button"
                aria-expanded={picker}
                onClick={() => setPicker(!picker)}
              >
                <Icon name="smartphone" />
                <span>Tất cả điện thoại</span>
                <span className="wall-pill">{selected.length}</span>
                <Icon name="chevron-down" />
              </button>
              {picker ? (
                <div className="wall-dropdown" id="wall-dropdown">
                  <input
                    id="wall-search"
                    type="search"
                    placeholder="Tìm tên, serial, nick…"
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                  />
                  <div className="mini-actions">
                    <button
                      type="button"
                      onClick={() => setSelected(snapshot.devices.map((d) => d.id))}
                    >
                      Chọn tất cả
                    </button>
                    <button type="button" onClick={() => setSelected([])}>
                      Bỏ chọn
                    </button>
                    <span>{selected.length} đã chọn</span>
                  </div>
                  <div className="wall-options">
                    {devices.length ? (
                      devices.map((d) => (
                        <label className="wall-choice" key={d.id}>
                          <input
                            type="checkbox"
                            checked={selected.includes(d.id)}
                            onChange={() =>
                              setSelected(
                                selected.includes(d.id)
                                  ? selected.filter((id) => id !== d.id)
                                  : [...selected, d.id],
                              )
                            }
                          />
                          <span>
                            <b>{d.name}</b> · {d.serial}
                          </span>
                          <small>{d.status}</small>
                        </label>
                      ))
                    ) : (
                      <div className="muted">Chưa có thiết bị quan sát được.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="wall-view-controls">
              <button
                className={`tinybtn ${view === 'all' ? 'active' : ''}`}
                type="button"
                title="Lưới toàn bộ điện thoại"
                onClick={() => setView('all')}
              >
                <Icon name="grid-3x3" />
              </button>
              <button
                className={`tinybtn ${view === 'one' ? 'active' : ''}`}
                type="button"
                title="Chỉ một điện thoại"
                onClick={() => setView('one')}
              >
                <Icon name="square" />
              </button>
              <button
                className="tinybtn"
                id="wall-fit"
                type="button"
                title="Khớp kích thước với panel"
                disabled={blocked}
                onClick={() => zoom(Math.max(70, Math.min(520, dock - 30)))}
              >
                <Icon name="maximize" />
              </button>
            </div>
          </div>
          <div className="wall-zoombar">
            <span>Phóng khung đồng bộ</span>
            <div className="zoomactions">
              <button
                className="tinybtn"
                type="button"
                title="Thu nhỏ"
                disabled={blocked}
                onClick={() => zoom(tile - 10)}
              >
                <Icon name="minus" />
              </button>
              <input
                id="wall-size"
                type="range"
                min="70"
                max="520"
                step="1"
                value={tile}
                aria-label="Kích thước toàn bộ màn hình điện thoại"
                disabled={blocked}
                onChange={(e) => setDraftTile(Number(e.currentTarget.value))}
                onPointerUp={(e) => zoom(Number(e.currentTarget.value))}
                onKeyUp={(e) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key))
                    zoom(Number(e.currentTarget.value));
                }}
              />
              <button
                className="tinybtn"
                type="button"
                title="Phóng to"
                disabled={blocked}
                onClick={() => zoom(tile + 10)}
              >
                <Icon name="plus" />
              </button>
              <span className="zoompct">{tile} px</span>
            </div>
          </div>
          <section
            className="wall-surface"
            id="wall-surface"
            aria-label="Vùng giám sát; Ctrl và con lăn đổi cỡ ô, điều khiển Android chưa khả dụng"
            onWheel={(e) => {
              if (e.ctrlKey) {
                e.preventDefault();
                zoom(tile + (e.deltaY < 0 ? 10 : -10));
              }
            }}
          >
            <div className="dot-grid">
              <div className={`screens-grid ${view === 'one' ? 'single' : ''}`} id="screens-grid">
                {snapshot.devices
                  .filter((d) => selected.includes(d.id) && (view === 'all' || d.id === active))
                  .map((d, index) => (
                    <button
                      type="button"
                      className={`wall-screen ${d.id === active ? 'active' : ''}`}
                      key={d.id}
                      onClick={() => setActive(d.id)}
                      onDoubleClick={() => {
                        setActive(d.id);
                        setView('one');
                      }}
                    >
                      <div className="android-view">
                        <span className="screen-order">{index + 1}</span>
                        <p>{d.name}</p>
                        <small>UNAVAILABLE · không có stream</small>
                      </div>
                    </button>
                  ))}
              </div>
              {selected.length === 0 ? (
                <EmptyPanel
                  title="Chưa chọn điện thoại"
                  detail="Thiết bị và stream chưa khả dụng. Không hiển thị màn hình Android giả."
                />
              ) : null}
            </div>
          </section>
          <div className="wall-bottom">
            <div className="quick-head">
              <b>ĐIỀU KHIỂN NHANH</b>
              <label className="sync-label">
                <input type="checkbox" disabled />
                <span>Điều khiển nhóm đã chọn</span>
              </label>
            </div>
            <div className="quickbuttons">
              {QUICK.map(([icon, label]) => (
                <UnavailableButton
                  key={label}
                  action="device-input"
                  onUnavailable={unavailable}
                  icon={icon}
                  className="quick-btn"
                  title={`${label} — chưa khả dụng`}
                />
              ))}
            </div>
            <div className="quick-head quick-head-second">
              <b>MỞ ỨNG DỤNG</b>
              <span className="quiet">Chưa khả dụng</span>
            </div>
            <div className="socialbuttons">
              {NETWORKS.map((name) => (
                <UnavailableButton
                  key={name}
                  action="launch-app"
                  onUnavailable={unavailable}
                  className="quick-btn"
                  title={`${name} — chưa khả dụng`}
                >
                  <SocialIcon name={name} />
                </UnavailableButton>
              ))}
            </div>
            <div className="wall-foot">
              {selected.length} ô đã chọn · Ctrl + con lăn: cỡ khung · Nháy đúp:1 máy
            </div>
          </div>
        </aside>
      </div>
      {modal ? (
        <UiModal
          title={modal === 'help' ? 'Phím tắt, thiết lập và khôi phục' : 'Chức năng chưa khả dụng'}
          onClose={() => setModal(null)}
        >
          {modal === 'help' ? (
            <>
              <p>
                Điều hướng sáu trang; dấu ? mở hướng dẫn; Escape đóng hộp thoại. Không tự chạy thiết
                bị hoặc lịch đăng.
              </p>
              <div className="notice">
                Khôi phục dữ liệu chỉ qua thao tác bảo trì được xác nhận vào vùng cách ly mới.
                Launcher chưa có lệnh phục hồi khóa giữ lại sau lần mở lỗi; không xóa khóa hay đặt
                lại khóa mã hóa. Handoff P1-10 còn bắt buộc.
              </div>
              {p.settings}
            </>
          ) : (
            <EmptyPanel
              title="UNAVAILABLE"
              detail={`Thao tác ${action} chưa có dịch vụ được triển khai. Không gửi lệnh, không lưu tác vụ, không có kết quả giả.`}
            />
          )}
        </UiModal>
      ) : null}
      <p className="preference-notice" role="status" hidden={!p.reconcile && !p.pending}>
        {p.status}
      </p>
    </>
  );
}
