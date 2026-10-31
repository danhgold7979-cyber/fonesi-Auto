import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { UiShell } from '../src/ui/ui-shell.tsx';
import { DEMO_BANNER, DEMO_CANARY, DEMO_SNAPSHOT } from './fixtures.js';
import { createDemoPreferences, DEMO_PREFERENCE_KEY } from './preferences.js';

function sessionPreferences() {
  try {
    const storage = window.localStorage;
    return createDemoPreferences({
      read: () => storage.getItem(DEMO_PREFERENCE_KEY),
      write: (value) => storage.setItem(DEMO_PREFERENCE_KEY, value),
      remove: () => storage.removeItem(DEMO_PREFERENCE_KEY),
    });
  } catch {
    return createDemoPreferences(null);
  }
}
export function DemoRenderer() {
  const [controller] = useState(sessionPreferences);
  const [state, setState] = useState(() => controller.read());
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const resized = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resized);
    return () => window.removeEventListener('resize', resized);
  }, []);
  const label = state.status === 'SESSION_ONLY' ? 'DEMO · CHỈ TRONG PHIÊN' : 'DEMO · CHƯA LƯU';
  const requested = state.value.dockWidth ?? (width <= 1120 ? 350 : width <= 1500 ? 400 : 510);
  const dock =
    state.value.dockWidth === null ? requested : Math.max(300, Math.min(width - 510, requested));
  return (
    <>
      <aside id="demo-banner" role="status" aria-live="polite" data-demo-fixture={DEMO_CANARY}>
        <strong>{DEMO_BANNER}</strong>
        <span id="demo-storage-state">
          {label} · 3 điện thoại / 3 tài khoản / 25 media / 3 lịch đều giả lập
        </span>
      </aside>
      <div id="demo-content">
        <UiShell
          theme={state.value.theme}
          ready={true}
          pending={false}
          reconcile={false}
          status={label}
          dockWidth={dock}
          requestedDockWidth={state.value.dockWidth}
          tileWidth={state.value.tileWidth}
          snapshot={DEMO_SNAPSHOT}
          onTheme={() =>
            setState(
              controller.update({
                ...state.value,
                theme: state.value.theme === 'LIGHT' ? 'DARK' : 'LIGHT',
              }),
            )
          }
          onDimensions={(dockWidth, tileWidth) =>
            setState(controller.update({ ...state.value, dockWidth, tileWidth }))
          }
          settings={
            <section id="demo-settings">
              <h2>Thiết lập phiên DEMO</h2>
              <p>
                {label}. Không đọc hoặc ghi thiết lập, cơ sở dữ liệu hay kho bí mật của ứng dụng
                thật.
              </p>
              <p>
                Mọi thao tác thiết bị, đăng nhập, quét và đăng bài đều chưa khả dụng. Dữ liệu giả
                lập không thể nhập vào ứng dụng thật.
              </p>
              <button
                type="button"
                id="demo-reset-preferences"
                onClick={() =>
                  setState(
                    controller.update({
                      version: 1,
                      theme: 'LIGHT',
                      dockWidth: null,
                      tileWidth: 150,
                    }),
                  )
                }
              >
                Đặt lại giao diện DEMO trong phiên
              </button>
            </section>
          }
        />
      </div>
    </>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<DemoRenderer />);
