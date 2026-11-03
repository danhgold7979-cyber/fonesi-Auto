import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react';
import {
  PAGES,
  NETWORKS,
  unavailableAction,
  unavailableSnapshot,
  type PageKey,
  type DomainAction,
  type UiSnapshot,
  type UiSelection,
} from './ui-model.js';
import { clampTileZoom, wheelTileZoom, tileZoomLimit, fitTileZoom } from './tile-zoom.js';
import { Icon, SocialIcon, UnavailableButton, EmptyPanel, UiModal } from './ui-shared.tsx';
import { OverviewPage, AccountsPage, TrackingPage } from './primary-pages.tsx';
import { SetupPage, CalendarPage, WorkflowsPage, WORKFLOW_LABELS } from './work-pages.tsx';
export type ShellProps = Readonly<{
  scheduleDraft?:
    | Readonly<{ preview: (input: unknown) => Promise<string>; cancel: () => void }>
    | undefined;
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
  selection?: UiSelection;
  selectionPending?: boolean;
  selectionBlocked?: boolean;
  onSelection?: (selection: UiSelection) => void;
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
  ['square-stack', 'Ứng dụng gần đây'],
  ['eraser', 'Xóa nhập liệu'],
  ['layers', 'Xóa nền / dừng app nền'],
  ['camera', 'Chụp màn hình'],
  ['refresh', 'Làm mới màn hình'],
  ['power', 'Màn hình nguồn'],
  ['terminal', 'Lệnh ADB'],
] as const;
type PerformanceSession = Readonly<{ token: object; cap: number | null }>;
type VisualFocus = Readonly<{ deviceId: string; generation: number }>;
type DisplaySizing = 'manual' | 'fit';
type WallDisplay = Readonly<{
  focus: VisualFocus | null;
  restore: Readonly<{ width: number; sizing: DisplaySizing }> | null;
  width: number;
  sizing: DisplaySizing;
}>;
function focusRow(snapshot: UiSnapshot, target: VisualFocus | null) {
  if (!target || snapshot.status !== 'READY') return null;
  const rows = snapshot.devices.filter((row) => row.id === target.deviceId);
  const row = rows.length === 1 ? rows[0] : undefined;
  return row &&
    row.status === 'DEVICE' &&
    Number.isSafeInteger(row.generation) &&
    row.generation >= 0 &&
    !Object.is(row.generation, -0) &&
    row.generation === target.generation
    ? row
    : null;
}
export function UiShell(p: ShellProps) {
  const supplied = p.snapshot ?? unavailableSnapshot;
  const snapshot: UiSnapshot =
    supplied.status === 'READY' && ['SYNTHETIC_TEST', 'MAIN_OBSERVED'].includes(supplied.provenance)
      ? supplied
      : { ...supplied, devices: [], accounts: [], media: [], jobs: [] };
  const [page, setPage] = useState<PageKey>('overview');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [modal, setModal] = useState<'help' | 'unavailable' | null>(null);
  const [performance, setPerformance] = useState<PerformanceSession | null>(null);
  const performanceSession = useRef<PerformanceSession | null>(null);
  const performanceFocusDone = useRef<object | null>(null);
  const performanceTrigger = useRef<HTMLButtonElement>(null);
  const performancePanel = useRef<HTMLElement>(null);
  const performanceHeader = useRef<HTMLDivElement>(null);
  const performanceClose = useRef<HTMLButtonElement>(null);
  const wallRef = useRef<HTMLElement>(null);
  const wallHeader = useRef<HTMLElement>(null);
  const wallControls = useRef<HTMLDivElement>(null);
  const wallZoom = useRef<HTMLDivElement>(null);
  const wallBottom = useRef<HTMLDivElement>(null);
  const performanceGate = useRef({ ready: p.ready, modal });
  performanceGate.current = { ready: p.ready, modal };
  const [action, setAction] = useState<DomainAction>('scan');
  const [picker, setPickerState] = useState(false),
    [search, setSearch] = useState('');
  const pickerSession = useRef<object | null>(null);
  const setPicker = (value: boolean) => {
    pickerSession.current = value ? {} : null;
    setPickerState(value);
  };
  const [localSelected, setLocalSelected] = useState<readonly string[]>([]),
    [localActive, setLocalActive] = useState('');
  const mainOwned =
    p.selection !== undefined ||
    (supplied.status === 'READY' && supplied.provenance === 'MAIN_OBSERVED');
  const selected = mainOwned ? (p.selection?.selectedDeviceIds ?? []) : localSelected;
  const active = mainOwned ? (p.selection?.activeDeviceId ?? '') : localActive;
  const selectionBlocked =
    mainOwned && (p.selectionBlocked || p.selectionPending || !p.onSelection || !p.selection);
  const changeSelection = (next: UiSelection) => {
    if (selectionBlocked) return;
    p.onSelection?.(next);
  };
  const setSelected = (next: readonly string[]) => {
    if (mainOwned)
      changeSelection({
        selectedDeviceIds: next,
        activeDeviceId: active || null,
        groups: p.selection?.groups ?? [],
      });
    else setLocalSelected(next);
  };
  const setActive = (next: string) => {
    if (mainOwned)
      changeSelection({
        selectedDeviceIds: selected,
        activeDeviceId: next || null,
        groups: p.selection?.groups ?? [],
      });
    else setLocalActive(next);
  };
  const [display, setDisplay] = useState<WallDisplay>({
    focus: null,
    restore: null,
    width: clampTileZoom(p.tileWidth, p.dockWidth),
    sizing: 'manual',
  });
  const displayRef = useRef(display);
  const [draftDock, setDraftDock] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null),
    pickerButton = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false),
    currentDock = useRef(p.dockWidth);
  const blocked = p.pending || !p.ready || p.reconcile;
  const surfaceRef = useRef<HTMLElement>(null);
  const localBlocked = !p.ready || modal !== null || picker || performance !== null;
  const dock = draftDock ?? p.dockWidth;
  const lifetime = useRef(true);
  const renderToken = {};
  const latest = useRef({ snapshot, localBlocked, renderToken });
  latest.current = { snapshot, localBlocked, renderToken };
  const width = () => surfaceRef.current?.clientWidth ?? 0;
  const height = () => surfaceRef.current?.clientHeight ?? 0;
  const resolved = focusRow(snapshot, display.focus);
  const view = resolved ? 'one' : 'all';
  const restoreDisplay = (value: WallDisplay): WallDisplay => {
    const saved = value.restore ?? { width: value.width, sizing: value.sizing };
    return {
      focus: null,
      restore: null,
      sizing: saved.sizing,
      width:
        saved.sizing === 'fit'
          ? fitTileZoom(saved.width, width(), height(), false)
          : clampTileZoom(saved.width, width()),
    };
  };
  const effectiveDisplay = display.focus && !resolved ? restoreDisplay(display) : display;
  const tile = effectiveDisplay.width;
  const putDisplay = (next: WallDisplay) => {
    displayRef.current = next;
    setDisplay(next);
  };
  const displayActions = useRef({ putDisplay, restoreDisplay });
  displayActions.current = { putDisplay, restoreDisplay };
  const allowed = () =>
    lifetime.current &&
    latest.current.renderToken === renderToken &&
    !latest.current.localBlocked &&
    document.hasFocus() &&
    !document.hidden &&
    document.querySelector('[role="dialog"]') === null;
  const closePerformance = (token: object, restore: boolean) => {
    if (!lifetime.current || performanceSession.current?.token !== token) return;
    const trigger = performanceTrigger.current;
    const inside =
      document.activeElement === trigger ||
      (document.activeElement instanceof Node &&
        performancePanel.current?.contains(document.activeElement));
    performanceSession.current = null;
    setPerformance(null);
    if (
      restore &&
      inside &&
      trigger?.isConnected &&
      document.hasFocus() &&
      !document.hidden &&
      performanceGate.current.ready &&
      performanceGate.current.modal === null &&
      document.querySelector('[role="dialog"]') === null
    )
      trigger.focus();
  };
  const performanceActions = useRef({ closePerformance });
  performanceActions.current = { closePerformance };
  const togglePerformance = () => {
    if (
      !lifetime.current ||
      latest.current.renderToken !== renderToken ||
      !p.ready ||
      modal !== null ||
      document.querySelector('[role="dialog"]') !== null ||
      !document.hasFocus() ||
      document.hidden
    )
      return;
    const current = performanceSession.current;
    if (current) {
      closePerformance(current.token, true);
      return;
    }
    setPicker(false);
    const next = { token: {}, cap: null };
    performanceSession.current = next;
    setPerformance(next);
  };
  useEffect(() => {
    const token = performance?.token;
    if (!token) return;
    if (!p.ready || modal !== null || document.querySelector('[role="dialog"]') !== null) {
      performanceActions.current.closePerformance(token, false);
      return;
    }
    const panel = performancePanel.current;
    const header = performanceHeader.current;
    const wall = wallRef.current;
    const siblings = [
      wallHeader.current,
      wallControls.current,
      wallZoom.current,
      wallBottom.current,
    ];
    let live = true;
    const measure = () => {
      if (!live || !lifetime.current || performanceSession.current?.token !== token) return;
      if (
        !performanceGate.current.ready ||
        performanceGate.current.modal !== null ||
        document.querySelector('[role="dialog"]') !== null ||
        !panel ||
        !header ||
        !wall ||
        performancePanel.current !== panel ||
        siblings.some((element) => element === null)
      ) {
        performanceActions.current.closePerformance(token, false);
        return;
      }
      const outer = (element: HTMLElement) => {
        const style = window.getComputedStyle(element);
        return (
          element.getBoundingClientRect().height +
          Number.parseFloat(style.marginTop) +
          Number.parseFloat(style.marginBottom)
        );
      };
      const heights = siblings.map((element) => (element ? outer(element) : Number.NaN));
      const style = window.getComputedStyle(panel);
      const chrome = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce(
        (sum, name) =>
          sum +
          Number.parseFloat(
            style.getPropertyValue(name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)),
          ),
        0,
      );
      const minimum = outer(header) + chrome;
      const cap = Math.min(
        window.innerHeight * 0.45,
        wall.clientHeight - heights.reduce((sum, value) => sum + value, 0) - 130,
      );
      if (
        ![wall.clientHeight, wall.clientWidth, window.innerHeight, minimum, cap].every(
          (value) => Number.isFinite(value) && value > 0,
        ) ||
        heights.some((value) => !Number.isFinite(value) || value < 0) ||
        cap < minimum
      ) {
        performanceActions.current.closePerformance(token, true);
        return;
      }
      if (performanceSession.current.cap !== cap) {
        const next = { token, cap };
        performanceSession.current = next;
        setPerformance(next);
      }
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const element of [wall, header, ...siblings]) if (element) observer?.observe(element);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      live = false;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [performance?.token, p.ready, modal]);
  useEffect(() => {
    const token = performance?.token;
    if (
      !token ||
      performance.cap === null ||
      performanceFocusDone.current === token ||
      performanceSession.current?.token !== token ||
      !lifetime.current
    )
      return;
    performanceFocusDone.current = token;
    if (
      p.ready &&
      modal === null &&
      document.querySelector('[role="dialog"]') === null &&
      document.hasFocus() &&
      !document.hidden &&
      (document.activeElement === performanceTrigger.current ||
        (document.activeElement instanceof Node &&
          performancePanel.current?.contains(document.activeElement))) &&
      performanceClose.current?.isConnected
    )
      performanceClose.current.focus();
  }, [performance, p.ready, modal]);
  const leaveFocus = () => {
    if (!allowed()) return;
    putDisplay(restoreDisplay(displayRef.current));
  };
  const enterFocus = (target: VisualFocus, toggle = false) => {
    if (!allowed() || !focusRow(latest.current.snapshot, target)) return;
    const current = displayRef.current;
    const valid = focusRow(latest.current.snapshot, current.focus);
    if (
      valid &&
      current.focus?.deviceId === target.deviceId &&
      current.focus.generation === target.generation
    ) {
      if (toggle) putDisplay(restoreDisplay(current));
      return;
    }
    const baseline = current.focus && !valid ? restoreDisplay(current) : current;
    putDisplay({
      focus: target,
      restore: baseline.restore ?? {
        width: baseline.width,
        sizing: baseline.sizing,
      },
      sizing: 'fit',
      width: fitTileZoom(baseline.width, width(), height(), true),
    });
  };
  useEffect(() => {
    lifetime.current = true;
    return () => {
      lifetime.current = false;
      performanceSession.current = null;
      pickerSession.current = null;
    };
  }, []);
  useEffect(() => {
    if (displayRef.current.focus && !focusRow(latest.current.snapshot, displayRef.current.focus))
      displayActions.current.putDisplay(displayActions.current.restoreDisplay(displayRef.current));
  });
  useEffect(() => {
    document.documentElement.dataset.theme = p.theme === 'DARK' ? 'dark' : 'light';
  }, [p.theme]);
  useEffect(() => {
    const session = pickerSession.current;
    if (!picker || !session) return;
    let live = true;
    const current = () =>
      live &&
      lifetime.current &&
      pickerSession.current === session &&
      document.querySelector('[role="dialog"]') === null;
    const close = (e: PointerEvent) => {
      if (current() && e.target instanceof Node && !pickerRef.current?.contains(e.target)) {
        pickerSession.current = null;
        setPickerState(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (current() && event.key === 'Escape') {
        pickerSession.current = null;
        setPickerState(false);
        pickerButton.current?.focus();
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      live = false;
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
      if (!dragging.current) setDraftDock(null);
    }
  }, [p.pending]);
  const focusDevice = (id: string) => {
    if (!allowed()) return;
    if (id === '') {
      setActive('');
      leaveFocus();
      return;
    }
    const rows = latest.current.snapshot.devices.filter((row) => row.id === id);
    if (rows.length !== 1) return;
    const row = rows[0];
    if (!row) return;
    const target = { deviceId: id, generation: row.generation };
    if (!focusRow(latest.current.snapshot, target)) return;
    setActive(id);
    enterFocus(target);
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
    scheduleDraft: p.scheduleDraft,
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
  const viewport = () => surfaceRef.current?.clientWidth || dock;
  const zoom = (value: number) => {
    if (!allowed()) return;
    const current = displayRef.current;
    const base =
      current.focus && !focusRow(latest.current.snapshot, current.focus)
        ? restoreDisplay(current)
        : current;
    putDisplay({ ...base, sizing: 'manual', width: clampTileZoom(value, viewport()) });
  };
  const fit = () => {
    if (!allowed()) return;
    const current = displayRef.current;
    const base =
      current.focus && !focusRow(latest.current.snapshot, current.focus)
        ? restoreDisplay(current)
        : current;
    putDisplay({
      ...base,
      sizing: 'fit',
      width: fitTileZoom(base.width, width(), height(), base.focus !== null),
    });
  };
  useEffect(() => {
    const current = displayRef.current;
    const next = clampTileZoom(p.tileWidth, surfaceRef.current?.clientWidth ?? 0);
    if (current.focus && focusRow(latest.current.snapshot, current.focus)) {
      displayActions.current.putDisplay({
        ...current,
        width: clampTileZoom(current.width, surfaceRef.current?.clientWidth ?? 0),
        restore:
          current.restore?.sizing === 'manual'
            ? { ...current.restore, width: next }
            : current.restore,
      });
    } else
      displayActions.current.putDisplay({
        focus: null,
        restore: null,
        width: next,
        sizing: 'manual',
      });
  }, [p.tileWidth]);
  const resizeCurrent = useRef(() => {});
  resizeCurrent.current = () => {
    if (!lifetime.current) return;
    const current = displayRef.current;
    const base =
      current.focus && !focusRow(latest.current.snapshot, current.focus)
        ? restoreDisplay(current)
        : current;
    putDisplay({
      ...base,
      width:
        base.sizing === 'fit'
          ? fitTileZoom(base.width, width(), height(), base.focus !== null)
          : clampTileZoom(base.width, viewport()),
    });
  };
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let live = true;
    const resize = () => {
      if (live && lifetime.current && surfaceRef.current === surface) resizeCurrent.current();
    };
    const wheel = (event: WheelEvent) => {
      if (
        !live ||
        !lifetime.current ||
        surfaceRef.current !== surface ||
        latest.current.localBlocked ||
        !event.ctrlKey ||
        !document.hasFocus() ||
        document.hidden ||
        document.querySelector('[role="dialog"]') !== null
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const current = displayRef.current;
      const base =
        current.focus && !focusRow(latest.current.snapshot, current.focus)
          ? displayActions.current.restoreDisplay(current)
          : current;
      displayActions.current.putDisplay({
        ...base,
        sizing: 'manual',
        width: wheelTileZoom(base.width, event.deltaY, surface.clientWidth || dock),
      });
    };
    surface.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('resize', resize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(surface);
    resize();
    return () => {
      live = false;
      surface.removeEventListener('wheel', wheel);
      window.removeEventListener('resize', resize);
      observer?.disconnect();
    };
  }, [dock]);
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
        onFocusCapture={(event) => {
          const dialog = document.querySelector('[role="dialog"]');
          const session = performanceSession.current;
          if (
            lifetime.current &&
            session &&
            event.target instanceof Node &&
            dialog?.contains(event.target)
          )
            closePerformance(session.token, false);
        }}
        inert={modal !== null}
        style={
          {
            '--wallW': `${dock}px`,
            '--screenW': '150px',
            '--tileW': `${tile}px`,
            '--tileH': `${(tile * 19.5) / 9}px`,
            '--tileScale': tile / 150,
          } as CSSProperties
        }
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
        <aside className="wall" id="wall" ref={wallRef} aria-label="Màn hình giám sát điện thoại">
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
                  p.tileWidth,
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
              p.onDimensions(currentDock.current, p.tileWidth);
            }}
            onPointerCancel={() => {
              dragging.current = false;
              setDraftDock(null);
            }}
          />
          <header className="wallhead" ref={wallHeader}>
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
                ref={performanceTrigger}
                aria-controls="wall-performance-panel"
                disabled={!p.ready || modal !== null}
                title="Hiệu năng và chất lượng stream"
                aria-label="Hiệu năng và chất lượng stream"
                type="button"
                aria-expanded={
                  performance !== null && performance.cap !== null && p.ready && modal === null
                }
                onClick={togglePerformance}
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
                onClick={() => p.onDimensions(null, p.tileWidth)}
              >
                <Icon name="panel-right" />
              </button>
            </div>
          </header>
          {performance && p.ready && modal === null ? (
            <section
              className="performance-panel"
              id="wall-performance-panel"
              ref={performancePanel}
              data-measuring={performance.cap === null ? 'true' : undefined}
              inert={performance.cap === null}
              aria-hidden={performance.cap === null ? true : undefined}
              style={performance.cap === null ? undefined : { maxHeight: `${performance.cap}px` }}
              aria-label="Hiệu năng và chất lượng stream"
              onWheel={(event) => {
                if (lifetime.current && performanceSession.current?.token === performance.token)
                  event.stopPropagation();
              }}
              onKeyDown={(event) => {
                if (
                  event.key !== 'Escape' ||
                  performance.cap === null ||
                  performanceSession.current?.token !== performance.token ||
                  !(event.target instanceof Node) ||
                  !performancePanel.current?.contains(event.target)
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                closePerformance(performance.token, true);
              }}
            >
              <div className="performance-head rowflex between" ref={performanceHeader}>
                <strong>Hiệu năng / stream</strong>
                <button
                  className="tinybtn"
                  type="button"
                  aria-label="Đóng bảng hiệu năng"
                  ref={performanceClose}
                  onClick={() => closePerformance(performance.token, true)}
                >
                  <Icon name="x" />
                </button>
              </div>
              <Performance
                onUnavailable={(next) => {
                  if (
                    lifetime.current &&
                    performanceSession.current?.token === performance.token &&
                    performanceSession.current.cap !== null &&
                    performanceGate.current.ready &&
                    performanceGate.current.modal === null
                  )
                    unavailable(next);
                }}
              />
            </section>
          ) : null}
          <div className="wall-controls" ref={wallControls}>
            <div className="wall-dropdown-wrap" ref={pickerRef}>
              <button
                className="wall-picker"
                id="wall-device-picker"
                ref={pickerButton}
                type="button"
                aria-expanded={picker}
                onClick={() => {
                  if (!lifetime.current || latest.current.renderToken !== renderToken) return;
                  if (!picker && performanceSession.current)
                    closePerformance(performanceSession.current.token, false);
                  setPicker(!picker);
                }}
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
                      disabled={selectionBlocked}
                      onClick={() => setSelected(snapshot.devices.map((d) => d.id))}
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      disabled={selectionBlocked}
                      onClick={() => setSelected([])}
                    >
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
                            disabled={selectionBlocked}
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
                title="Lưới điện thoại đã chọn"
                disabled={localBlocked}
                onClick={leaveFocus}
              >
                <Icon name="grid-3x3" />
              </button>
              <button
                className={`tinybtn ${view === 'one' ? 'active' : ''}`}
                type="button"
                title="Chỉ một điện thoại"
                disabled={
                  localBlocked ||
                  !snapshot.devices.some(
                    (row) =>
                      row.id === active &&
                      focusRow(snapshot, { deviceId: row.id, generation: row.generation }),
                  )
                }
                onClick={() => {
                  const row = snapshot.devices.find((entry) => entry.id === active);
                  if (row) enterFocus({ deviceId: row.id, generation: row.generation });
                }}
              >
                <Icon name="square" />
              </button>
              <button
                className="tinybtn"
                id="wall-fit"
                type="button"
                title="Khớp kích thước với panel"
                disabled={localBlocked}
                onClick={fit}
              >
                <Icon name="maximize" />
              </button>
            </div>
          </div>
          <div className="wall-zoombar" ref={wallZoom}>
            <span>Phóng khung đồng bộ</span>
            <div className="zoomactions">
              <button
                className="tinybtn"
                type="button"
                title="Thu nhỏ"
                disabled={localBlocked}
                onClick={() => zoom(displayRef.current.width - 10)}
              >
                <Icon name="minus" />
              </button>
              <input
                id="wall-size"
                type="range"
                min="70"
                max={tileZoomLimit(viewport())}
                step="1"
                value={tile}
                aria-label="Kích thước toàn bộ màn hình điện thoại"
                disabled={localBlocked}
                onChange={(e) => zoom(Number(e.currentTarget.value))}
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
                disabled={localBlocked}
                onClick={() => zoom(displayRef.current.width + 10)}
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
            ref={surfaceRef}
          >
            <div className="dot-grid">
              <div className={`screens-grid ${view === 'one' ? 'single' : ''}`} id="screens-grid">
                {snapshot.devices
                  .filter((d) => (resolved ? d === resolved : selected.includes(d.id)))
                  .map((d, index) => (
                    <div className="tile-footprint" key={d.id}>
                      <button
                        type="button"
                        className={`wall-screen ${d.id === active ? 'active' : ''}`}
                        aria-label={`${d.name} · ${d.id === active ? 'ACTIVE đã xác nhận' : 'không phải ACTIVE'}${resolved === d ? ' · đang xem' : ''}`}
                        onClick={() => {
                          if (allowed()) setActive(d.id);
                        }}
                        onDoubleClick={() =>
                          enterFocus({ deviceId: d.id, generation: d.generation }, true)
                        }
                      >
                        <div className="android-view">
                          <span className="screen-order">{index + 1}</span>
                          <p>{d.name}</p>
                          <small>UNAVAILABLE · không có stream</small>
                        </div>
                      </button>
                    </div>
                  ))}
              </div>
              {!resolved && !snapshot.devices.some((row) => selected.includes(row.id)) ? (
                <EmptyPanel
                  title="Chưa chọn điện thoại"
                  detail="Thiết bị và stream chưa khả dụng. Không hiển thị màn hình Android giả."
                />
              ) : null}
            </div>
          </section>
          <div className="wall-bottom" ref={wallBottom}>
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
              {selected.length} ô đã chọn · Đang xem: {resolved?.name ?? 'lưới đã chọn'} · ACTIVE đã
              xác nhận: {snapshot.devices.find((row) => row.id === active)?.name ?? 'chưa có'} ·
              Ctrl + con lăn: cỡ khung · Nháy đúp: mở/đóng xem một máy
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
                Launcher chỉ phục hồi khóa giữ lại khi xác minh đúng lần chạy đã kết thúc và quyền
                sở hữu; khóa không rõ nguồn gốc bị từ chối. Không tự xóa khóa hay đặt lại khóa mã
                hóa.
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
