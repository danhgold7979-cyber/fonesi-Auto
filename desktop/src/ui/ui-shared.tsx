import { useRef, useEffect, createElement, type ReactNode } from 'react';
import { ICONS } from './icon-data.js';
import { SOCIAL_ICONS, type SocialNode } from './social-data.js';
import type { DomainAction, UiSnapshot } from './ui-model.js';
export function Icon({ name, className = '' }: Readonly<{ name: string; className?: string }>) {
  const nodes = ICONS[name] ?? ICONS.info ?? [];
  return (
    <svg className={`uc ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      {nodes.map((node) =>
        createElement(node.tag, { ...node.props, key: node.tag + JSON.stringify(node.props) }),
      )}
    </svg>
  );
}
export function UnavailableButton({
  action,
  onUnavailable,
  children,
  icon,
  className = 'btn',
  title,
}: Readonly<{
  action: DomainAction;
  onUnavailable: (action: DomainAction) => void;
  children?: ReactNode;
  icon?: string;
  className?: string;
  title?: string;
}>) {
  return (
    <button
      type="button"
      className={className}
      aria-disabled="true"
      title={title ?? 'Chưa khả dụng — dịch vụ chưa được triển khai'}
      onClick={() => onUnavailable(action)}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}
export function EmptyPanel({
  title = 'Chưa có dữ liệu',
  detail = 'Dịch vụ chưa được triển khai. Không có dữ liệu thiết bị hoặc kết quả giả lập.',
  status,
  children,
}: Readonly<{
  title?: string;
  detail?: string;
  status?: UiSnapshot['status'];
  children?: ReactNode;
}>) {
  return (
    <div className="empty" role="status">
      <Icon name={status === 'ERROR' ? 'alert-triangle' : 'info'} className="big" />
      <strong>
        {status === 'LOADING' ? 'Đang tải…' : status === 'ERROR' ? 'Không thể tải dữ liệu' : title}
      </strong>
      <p className="muted">{detail}</p>
      {children}
    </div>
  );
}
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: Readonly<{ title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }>) {
  return (
    <div className="pagehead">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="rowflex wrap">{actions}</div> : null}
    </div>
  );
}
export function StatCard({
  label,
  value = '—',
  detail = 'Chưa có dữ liệu quan sát',
}: Readonly<{ label: string; value?: ReactNode; detail?: string; icon?: string; color?: string }>) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function socialNode(node: SocialNode): ReactNode {
  return createElement(
    node.tag,
    { ...node.props, key: node.key },
    node.text,
    ...node.children.map(socialNode),
  );
}
export function SocialIcon({ name }: Readonly<{ name: string }>) {
  return (
    <span className="brand-svg" title={name}>
      <svg viewBox="0 0 24 24" aria-label={name} role="img">
        {(SOCIAL_ICONS[name.toLowerCase()] ?? []).map(socialNode)}
      </svg>
    </span>
  );
}

export function UiModal({
  title,
  children,
  onClose,
}: Readonly<{ title: string; children: ReactNode; onClose: () => void }>) {
  const panel = useRef<HTMLElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const pointer = (event: PointerEvent) => {
      if (event.target === shade.current) close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const items = panel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
      );
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('pointerdown', pointer);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', pointer);
      window.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div ref={shade} className="dialog-shade" id="dialog-shade">
      <section
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="dialog-header">
          <div>
            <h2 id="dialog-title">{title}</h2>
            <p>Fonesi-Auto · trạng thái trung thực, không tự chạy tác vụ</p>
          </div>
          <button
            className="iconbtn"
            id="dialog-x"
            type="button"
            aria-label="Đóng"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button className="btn" id="dialog-cancel" type="button" onClick={onClose}>
            Hủy
          </button>
          <button className="btn primary" id="dialog-close" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </section>
    </div>
  );
}
