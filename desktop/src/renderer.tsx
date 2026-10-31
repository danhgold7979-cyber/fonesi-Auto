import { createRoot } from 'react-dom/client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { parseSettingsResponse, type PublicSettings } from './settings-contract.js';
import { UiShell } from './ui/ui-shell.tsx';

declare global {
  interface Window {
    preferences: Readonly<{
      read: () => Promise<string>;
      update: (revision: number, patch: unknown) => Promise<string>;
      reset: (revision: number) => Promise<string>;
      restorePrevious: (revision: number) => Promise<string>;
    }>;
    foundation: Readonly<{ health: () => Promise<string>; settings: () => Promise<string> }>;
  }
}
function Diagnostic() {
  const [status, setStatus] = useState('NOT_READY / UNAVAILABLE');
  const [preferences, setPreferences] = useState<PublicSettings | null>(null);
  const [preferenceStatus, setPreferenceStatus] = useState(
    'NOT_READY / READ PERSISTED PREFERENCES',
  );
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [reconcile, setReconcile] = useState(false);
  const [dockInput, setDockInput] = useState('');
  const [tileInput, setTileInput] = useState('150');
  const preferenceAction = useCallback(
    async (
      kind: 'read' | 'theme' | 'dimensions' | 'reset' | 'restore',
      dimensions?: Readonly<{ dockWidth: number | null; tileWidth: number }>,
    ) => {
      if (inFlight.current || (kind !== 'read' && (!preferences || reconcile))) return;
      let patch: unknown;
      if (kind === 'dimensions' && dimensions) {
        patch = dimensions;
      } else if (kind === 'dimensions') {
        if (
          !/^(?:[1-9]\d*)$/.test(tileInput) ||
          (dockInput !== '' && !/^(?:[1-9]\d*)$/.test(dockInput))
        ) {
          setPreferenceStatus('INVALID_SHAPE');
          return;
        }
        const dockWidth = dockInput === '' ? null : Number(dockInput),
          tileWidth = Number(tileInput);
        if (
          (dockWidth !== null &&
            (!Number.isSafeInteger(dockWidth) || dockWidth < 300 || dockWidth > 16384)) ||
          !Number.isSafeInteger(tileWidth) ||
          tileWidth < 70 ||
          tileWidth > 520
        ) {
          setPreferenceStatus('INVALID_SHAPE');
          return;
        }
        patch = { dockWidth, tileWidth };
      }
      inFlight.current = true;
      setPending(true);
      setPreferenceStatus('PENDING / OUTCOME NOT YET KNOWN');
      try {
        const raw =
          kind === 'read'
            ? await window.preferences.read()
            : kind === 'theme'
              ? await window.preferences.update(preferences?.revision ?? 0, {
                  theme: preferences?.theme === 'LIGHT' ? 'DARK' : 'LIGHT',
                })
              : kind === 'dimensions'
                ? await window.preferences.update(preferences?.revision ?? 0, patch)
                : kind === 'reset'
                  ? await window.preferences.reset(preferences?.revision ?? 0)
                  : await window.preferences.restorePrevious(preferences?.revision ?? 0);
        const result = parseSettingsResponse(raw);
        if (!result) {
          setReconcile(true);
          setPreferenceStatus('INTERNAL_FAILURE / EXPLICIT READ REQUIRED');
          return;
        }
        if (result.ok) {
          setPreferences(result.settings);
          setDockInput(result.settings.dockWidth === null ? '' : String(result.settings.dockWidth));
          setTileInput(String(result.settings.tileWidth));
          setReconcile(false);
          setPreferenceStatus(
            `${result.outcome} / PERSISTED / REVISION ${result.settings.revision} / AUDIT ${result.auditHealth}`,
          );
        } else {
          setReconcile(true);
          setPreferenceStatus(
            `${result.code} / ${result.code === 'TIMEOUT' || result.code === 'OUTCOME_UNKNOWN' ? 'OUTCOME UNKNOWN — CONFIRMATION MAY STILL BE OPEN / ' : ''}EXPLICIT READ REQUIRED / AUDIT ${result.auditHealth}`,
          );
        }
      } catch {
        setReconcile(true);
        setPreferenceStatus('INTERNAL_FAILURE / OUTCOME UNKNOWN / EXPLICIT READ REQUIRED');
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [preferences, reconcile, tileInput, dockInput],
  );
  const hydrationStarted = useRef(false);
  useEffect(() => {
    if (hydrationStarted.current) return;
    hydrationStarted.current = true;
    void preferenceAction('read');
  }, [preferenceAction]);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resized = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resized);
    return () => window.removeEventListener('resize', resized);
  }, []);
  // Diagnostic preview only: fixed colors and current-viewport V9 clamp; never
  // rewrite the stored requested width when the viewport differs.
  const requestedDock =
    preferences?.dockWidth ?? (viewportWidth <= 1120 ? 350 : viewportWidth <= 1500 ? 400 : 510);
  const dockWidth =
    preferences?.dockWidth === null
      ? requestedDock
      : Math.max(300, Math.min(viewportWidth - 510, requestedDock));
  const dark = preferences?.theme === 'DARK';
  async function read(kind: 'health' | 'settings') {
    try {
      // No auto-call/effect/retry. Main independently controls initial admission.
      const response: unknown = JSON.parse(await window.foundation[kind]());
      if (
        response !== null &&
        typeof response === 'object' &&
        'ok' in response &&
        response.ok === true
      )
        setStatus(
          kind === 'health'
            ? 'BRIDGE READY / SERVICES UNAVAILABLE'
            : 'LIGHT / NOT_PERSISTED / REVISION 0',
        );
      else if (
        response !== null &&
        typeof response === 'object' &&
        'code' in response &&
        typeof response.code === 'string' &&
        'diagnosticId' in response
      ) {
        setStatus(
          `REQUEST ${response.code} / ${typeof response.diagnosticId === 'string' ? response.diagnosticId : 'diagnostic reference unavailable'}`,
        );
      } else setStatus('REQUEST UNAVAILABLE / diagnostic reference unavailable');
      if (
        response !== null &&
        typeof response === 'object' &&
        'logging' in response &&
        response.logging === 'DEGRADED'
      )
        setStatus((current) => `${current} / LOGGING DEGRADED — diagnostics may be incomplete`);
    } catch {
      setStatus('REQUEST UNAVAILABLE');
    }
  }
  return (
    <UiShell
      theme={dark ? 'DARK' : 'LIGHT'}
      ready={preferences !== null}
      pending={pending}
      reconcile={reconcile}
      status={preferenceStatus}
      dockWidth={dockWidth}
      requestedDockWidth={preferences?.dockWidth ?? null}
      tileWidth={preferences?.tileWidth ?? 150}
      onTheme={() => {
        void preferenceAction('theme');
      }}
      onDimensions={(dockWidth, tileWidth) => {
        void preferenceAction('dimensions', { dockWidth, tileWidth });
      }}
      settings={
        <>
          <button
            type="button"
            id="health-read"
            onClick={() => {
              void read('health');
            }}
          >
            Read public health
          </button>
          <button
            type="button"
            id="settings-read"
            onClick={() => {
              void read('settings');
            }}
          >
            Read public settings
          </button>
          <section
            aria-label="Persisted preference diagnostic"
            id="preference-panel"
            data-theme={preferences?.theme ?? 'NOT_READY'}
          >
            <h2>Thiết lập giao diện và trạng thái lưu</h2>
            <button
              type="button"
              id="preferences-read"
              disabled={pending}
              onClick={() => {
                void preferenceAction('read');
              }}
            >
              Read persisted preferences
            </button>
            <button
              type="button"
              id="preferences-theme"
              disabled={pending || !preferences || reconcile}
              onClick={() => {
                void preferenceAction('theme');
              }}
            >
              Toggle LIGHT / DARK
            </button>
            <label>
              Requested dock width (empty = responsive default)
              <input
                id="preferences-dock"
                value={dockInput}
                inputMode="numeric"
                disabled={pending || !preferences || reconcile}
                onChange={(event) => setDockInput(event.currentTarget.value)}
              />
            </label>
            <label>
              Tile width
              <input
                id="preferences-tile"
                value={tileInput}
                inputMode="numeric"
                disabled={pending || !preferences || reconcile}
                onChange={(event) => setTileInput(event.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              id="preferences-dimensions"
              disabled={pending || !preferences || reconcile}
              onClick={() => {
                void preferenceAction('dimensions');
              }}
            >
              Save dimensions
            </button>
            <button
              type="button"
              id="preferences-reset"
              disabled={pending || !preferences || reconcile}
              onClick={() => {
                void preferenceAction('reset');
              }}
            >
              Confirm UI defaults
            </button>
            <button
              type="button"
              id="preferences-restore"
              disabled={pending || !preferences || reconcile}
              onClick={() => {
                void preferenceAction('restore');
              }}
            >
              Confirm previous preferences
            </button>
            <p id="preferences-status" aria-live="polite">
              {preferenceStatus}
            </p>
            <div
              id="preference-preview"
              style={{
                width: viewportWidth <= 1120 ? '100%' : `${dockWidth}px`,
                maxWidth: '100%',
                border: '1px solid currentColor',
              }}
            >
              <div
                id="preference-tile"
                style={{
                  width: `${preferences?.tileWidth ?? 150}px`,
                  maxWidth: '100%',
                  border: '1px solid currentColor',
                }}
              >
                Preference size preview
              </div>
            </div>
          </section>
          <p id="bridge-status" aria-live="polite">
            {status}
          </p>
        </>
      }
    />
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Diagnostic />);
