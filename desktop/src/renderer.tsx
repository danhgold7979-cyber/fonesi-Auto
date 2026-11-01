import {
  METADATA_FIELDS,
  parseMetadataResponse,
  type MetadataField,
  type MetadataSnapshot,
} from './metadata-contract.js';
import { parseDiscoveryResponse, type DiscoverySnapshot } from './discovery-contract.js';
import {
  parseRuntimeVersionResponse,
  type RuntimeVersionSnapshot,
} from './runtime-version-contract.js';
import { parseSetupResponse, type SetupSnapshot } from './platform-tools-setup-contract.js';
import { createRoot } from 'react-dom/client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { parseSettingsResponse, type PublicSettings } from './settings-contract.js';
import { parseFleetResponse, type FleetSnapshot, type FleetSelection } from './fleet-contract.js';
import type { UiSnapshot } from './ui/ui-model.js';
import { UiShell } from './ui/ui-shell.tsx';

declare global {
  interface Window {
    metadata: Readonly<{
      get: () => Promise<string>;
      read: (
        deviceId: unknown,
        field: unknown,
        revision: unknown,
        registryRevision: unknown,
      ) => Promise<string>;
    }>;
    preferences: Readonly<{
      read: () => Promise<string>;
      update: (revision: number, patch: unknown) => Promise<string>;
      reset: (revision: number) => Promise<string>;
      restorePrevious: (revision: number) => Promise<string>;
    }>;
    platformTools: Readonly<{
      read: () => Promise<string>;
      requestSetup: (revision: unknown) => Promise<string>;
      readVersion: () => Promise<string>;
      verifyVersion: (revision: unknown, installationRevision: unknown) => Promise<string>;
    }>;
    fleet: Readonly<{
      read: () => Promise<string>;
      replaceSelection: (expectedRevision: number, selection: FleetSelection) => Promise<string>;
    }>;
    discovery: Readonly<{
      get: () => Promise<string>;
      start: (revision: unknown, installationRevision: unknown) => Promise<string>;
      refresh: (revision: unknown) => Promise<string>;
      stop: () => Promise<string>;
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
  const [setup, setSetup] = useState<SetupSnapshot | null>(null);
  const [setupStatus, setSetupStatus] = useState(
    'Chưa đọc trạng thái bộ công cụ. Tính năng thiết bị chưa khả dụng.',
  );
  const [setupPending, setSetupPending] = useState(false);
  const [setupReconcile, setSetupReconcile] = useState(true);
  const setupInFlight = useRef(false);
  const setupHydrated = useRef(false);
  const runtimeGeneration = useRef<object>(Object.freeze({}));
  const setupObservation = useRef<string | null>(null);
  const discoveryGeneration = useRef<object>(Object.freeze({}));
  const fleetGeneration = useRef<object>(Object.freeze({}));
  const [discovery, setDiscovery] = useState<DiscoverySnapshot | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState(
    'Chưa đọc trạng thái máy chủ; không tự khởi động hoặc quét.',
  );
  const [discoveryPending, setDiscoveryPending] = useState(false);
  const [discoveryStopPending, setDiscoveryStopPending] = useState(false);
  const [discoveryReconcile, setDiscoveryReconcile] = useState(true);
  const discoveryInFlight = useRef(false),
    discoveryStopInFlight = useRef(false);
  const metadataGeneration = useRef<object>(Object.freeze({}));
  const [metadata, setMetadata] = useState<MetadataSnapshot | null>(null);
  const [metadataDevice, setMetadataDevice] = useState<string | null>(null);
  const [metadataField, setMetadataField] = useState<MetadataField>('MODEL');
  const [metadataStatus, setMetadataStatus] = useState(
    'Chưa đọc bộ nhớ metadata; không tự truy vấn thiết bị.',
  );
  const [metadataPending, setMetadataPending] = useState(false);
  const [metadataReconcile, setMetadataReconcile] = useState(true);
  const metadataInFlight = useRef(false),
    metadataHydrated = useRef(false);
  const invalidateMetadata = useCallback(() => {
    metadataGeneration.current = Object.freeze({});
    setMetadata(null);
    setMetadataReconcile(true);
    setMetadataStatus('REFRESH_REQUIRED / Cần đọc lại trạng thái metadata; không tự thử lại.');
  }, []);
  const invalidateFleet = useCallback(() => {
    invalidateMetadata();
    fleetGeneration.current = Object.freeze({});
    setFleet(null);
    setFleetFailed(true);
    setFleetReconcile(true);
    setFleetStatus(
      'LIVE_DISCOVERY_UNAVAILABLE / CACHED OBSERVATION CLEARED / EXPLICIT FLEET READ REQUIRED',
    );
  }, [invalidateMetadata]);
  const invalidateDiscovery = useCallback(() => {
    discoveryGeneration.current = Object.freeze({});
    setDiscovery(null);
    setDiscoveryReconcile(true);
    setDiscoveryStatus('Cần đọc lại trạng thái; quan sát trước không còn hiện hành.');
    invalidateFleet();
  }, [invalidateFleet]);
  const observeRevocation = useCallback(
    (code: unknown) => {
      if (code === 'SESSION_REVOKED' || code === 'OWNER_REVOKED' || code === 'CLOSED')
        invalidateDiscovery();
    },
    [invalidateDiscovery],
  );
  async function discoveryAction(method: 'get' | 'start' | 'refresh' | 'stop') {
    const stop = method === 'stop';
    if (
      stop
        ? discoveryStopInFlight.current
        : discoveryInFlight.current || discoveryStopInFlight.current
    )
      return;
    if ((method === 'start' || method === 'refresh') && (!discovery || discoveryReconcile)) return;
    if (stop) {
      discoveryStopInFlight.current = true;
      setDiscoveryStopPending(true);
    } else {
      discoveryInFlight.current = true;
      setDiscoveryPending(true);
    }
    if (method !== 'get') {
      discoveryGeneration.current = Object.freeze({});
      setDiscoveryReconcile(true);
      invalidateFleet();
    }
    const generation = discoveryGeneration.current;
    try {
      const raw =
        method === 'get'
          ? await window.discovery.get()
          : method === 'start'
            ? await window.discovery.start(discovery?.revision, discovery?.installationRevision)
            : method === 'refresh'
              ? await window.discovery.refresh(discovery?.revision)
              : await window.discovery.stop();
      if (generation !== discoveryGeneration.current) return;
      const response = parseDiscoveryResponse(raw);
      if (!response) throw Error('INVALID_RESPONSE');
      if (!response.ok) {
        discoveryGeneration.current = Object.freeze({});
        setDiscovery(null);
        setDiscoveryReconcile(true);
        invalidateFleet();
        setDiscoveryStatus(
          `${response.outcome} / ${response.code}. Đọc lại để đối chiếu; không tự thử lại.`,
        );
        return;
      }
      setDiscovery(response.snapshot);
      setDiscoveryReconcile(
        response.outcome !== 'OBSERVED' ||
          !['IDLE', 'READY', 'STOPPED'].includes(response.snapshot.state),
      );
      if (
        response.snapshot.state !== 'READY' ||
        response.snapshot.lastOutcome !== 'COMMITTED' ||
        response.snapshot.observedAtUtc === null
      )
        invalidateFleet();
      setDiscoveryStatus(
        `${response.outcome} / ${response.snapshot.state} / ${response.snapshot.lastOutcome} / ${response.snapshot.code ?? 'OK'} / LOG ${response.loggingHealth}. ${response.snapshot.restartRequired ? 'Cần khởi động lại ứng dụng trước lần Start mới.' : 'Nhấn Đọc trạng thái để đối chiếu; không tự quét hoặc thử lại.'} ${response.snapshot.observedAtUtc === null ? 'Chưa có quan sát thiết bị hiện hành.' : `Quan sát được chụp tại UTC ms ${response.snapshot.observedAtUtc}; không giám sát liên tục. Đọc Fleet riêng để xem kết quả.`}`,
      );
    } catch {
      if (generation !== discoveryGeneration.current) return;
      discoveryGeneration.current = Object.freeze({});
      setDiscovery(null);
      setDiscoveryReconcile(true);
      invalidateFleet();
      setDiscoveryStatus(
        'OUTCOME_UNKNOWN / INTERNAL_FAILURE. Đọc trạng thái để đối chiếu; Stop vẫn khả dụng.',
      );
    } finally {
      if (stop) {
        discoveryStopInFlight.current = false;
        setDiscoveryStopPending(false);
      } else {
        discoveryInFlight.current = false;
        setDiscoveryPending(false);
      }
    }
  }

  const setupAction = useCallback(
    async (request = false) => {
      if (setupInFlight.current || (request && (!setup || setupReconcile))) return;
      setupInFlight.current = true;
      setSetupPending(true);
      if (request) {
        invalidateDiscovery();
        setSetupReconcile(true);
        runtimeGeneration.current = Object.freeze({});
        setRuntimeReconcile(true);
        setRuntimeVersion(null);
      }
      try {
        const raw = request
          ? await window.platformTools.requestSetup(setup?.revision ?? 0)
          : await window.platformTools.read();
        const response = parseSetupResponse(raw);
        if (!response) throw Error('INVALID_RESPONSE');
        if (!response.ok) {
          observeRevocation(response.code);
          setSetupReconcile(true);
          setSetupStatus(
            `${response.outcome} / ${response.code}. Nhấn Đọc trạng thái để đối chiếu; không tự thử lại.`,
          );
          return;
        }
        const observed = JSON.stringify(response.snapshot);
        if (setupObservation.current !== observed) {
          setupObservation.current = observed;
          invalidateDiscovery();
          runtimeGeneration.current = Object.freeze({});
          setRuntimeReconcile(true);
          setRuntimeVersion(null);
        }
        setSetup(response.snapshot);
        setSetupReconcile(response.outcome !== 'OBSERVED');
        setSetupStatus(
          `${response.outcome} / ${response.snapshot.state} / ${response.snapshot.code ?? 'OK'} / LOG ${response.loggingHealth}. Chỉ xác minh tệp; chưa khởi động ADB hoặc kết nối thiết bị.`,
        );
      } catch {
        setSetupReconcile(true);
        setSetupStatus(
          'OUTCOME_UNKNOWN / INTERNAL_FAILURE. Nhấn Đọc trạng thái để đối chiếu; không tự thử lại.',
        );
      } finally {
        setupInFlight.current = false;
        setSetupPending(false);
      }
    },
    [setup, setupReconcile, invalidateDiscovery, observeRevocation],
  );
  useEffect(() => {
    if (setupHydrated.current) return;
    setupHydrated.current = true;
    void setupAction();
  }, [setupAction]);
  const [runtimeVersion, setRuntimeVersion] = useState<RuntimeVersionSnapshot | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState(
    'Chưa kiểm tra phiên bản. Không tự chạy khi mở bảng.',
  );
  const [runtimePending, setRuntimePending] = useState(false);
  const [runtimeReconcile, setRuntimeReconcile] = useState(true);
  const runtimeInFlight = useRef(false);
  async function runtimeAction(verify = false) {
    if (runtimeInFlight.current || (verify && (!runtimeVersion || runtimeReconcile))) return;
    runtimeInFlight.current = true;
    const generation = runtimeGeneration.current;
    setRuntimePending(true);
    if (verify) setRuntimeReconcile(true);
    try {
      const raw = verify
        ? await window.platformTools.verifyVersion(
            runtimeVersion?.revision,
            runtimeVersion?.installationRevision,
          )
        : await window.platformTools.readVersion();
      if (generation !== runtimeGeneration.current) return;
      const response = parseRuntimeVersionResponse(raw);
      if (!response) throw Error('INVALID_RESPONSE');
      if (!response.ok) {
        observeRevocation(response.code);
        setRuntimeReconcile(true);
        setRuntimeStatus(
          `${response.outcome} / ${response.code}. Đọc lại để đối chiếu; không tự thử lại.`,
        );
      } else {
        setRuntimeVersion(response.snapshot);
        setRuntimeReconcile(
          response.outcome !== 'OBSERVED' ||
            response.snapshot.state === 'PENDING' ||
            response.snapshot.state === 'OUTCOME_UNKNOWN',
        );
        setRuntimeStatus(
          `${response.snapshot.state} / ${response.snapshot.code ?? 'OK'} / LOG ${response.loggingHealth}. ${response.snapshot.state === 'VERIFIED' ? 'Đã quan sát phiên bản tại lần kiểm tra; không giám sát liên tục.' : 'Nhấn Đọc kết quả sau khi thao tác hoàn tất.'}`,
        );
      }
    } catch {
      if (generation !== runtimeGeneration.current) return;
      setRuntimeReconcile(true);
      setRuntimeStatus('OUTCOME_UNKNOWN / INTERNAL_FAILURE. Đọc lại để đối chiếu.');
    } finally {
      runtimeInFlight.current = false;
      setRuntimePending(false);
    }
  }
  const [fleet, setFleet] = useState<FleetSnapshot | null>(null);
  const [fleetStatus, setFleetStatus] = useState('LOADING / FLEET NOT YET OBSERVED');
  const [fleetFailed, setFleetFailed] = useState(false);
  const [fleetPending, setFleetPending] = useState(false);
  const [fleetReconcile, setFleetReconcile] = useState(false);
  const fleetInFlight = useRef(false);
  const fleetHydrationStarted = useRef(false);
  const fleetAction = useCallback(
    async (selection?: FleetSelection) => {
      if (fleetInFlight.current || (selection !== undefined && (!fleet || fleetReconcile))) return;
      fleetInFlight.current = true;
      const generation = fleetGeneration.current;
      setFleetPending(true);
      setFleetStatus(
        selection === undefined ? 'READING / FLEET' : 'PENDING / SELECTION NOT YET APPLIED',
      );
      try {
        const raw =
          selection === undefined
            ? await window.fleet.read()
            : await window.fleet.replaceSelection(fleet?.selection.revision ?? 0, selection);
        if (generation !== fleetGeneration.current) return;
        const response = parseFleetResponse(raw);
        if (!response?.ok) {
          if (response && !response.ok) observeRevocation(response.code);
          invalidateMetadata();
          setFleet(null);
          setFleetFailed(true);
          setFleetReconcile(true);
          setFleetStatus(
            `${response && !response.ok ? response.code : 'INTERNAL_FAILURE'} / EXPLICIT FLEET READ REQUIRED`,
          );
          return;
        }
        if (
          response.fleet.availability !== 'OBSERVED' ||
          (fleet && fleet.registryRevision !== response.fleet.registryRevision)
        )
          invalidateMetadata();
        setFleet(response.fleet);
        setFleetFailed(false);
        setFleetReconcile(false);
        setFleetStatus(
          `${response.outcome} / PROCESS-LOCAL SELECTION ${response.fleet.selection.revision} / ${response.fleet.reason ?? 'OBSERVED'} / AUDIT ${response.auditHealth}`,
        );
      } catch {
        if (generation !== fleetGeneration.current) return;
        invalidateMetadata();
        setFleet(null);
        setFleetFailed(true);
        setFleetReconcile(true);
        setFleetStatus('INTERNAL_FAILURE / EXPLICIT FLEET READ REQUIRED');
      } finally {
        fleetInFlight.current = false;
        setFleetPending(false);
      }
    },
    [fleet, fleetReconcile, observeRevocation, invalidateMetadata],
  );
  useEffect(() => {
    if (fleetHydrationStarted.current) return;
    fleetHydrationStarted.current = true;
    void fleetAction();
  }, [fleetAction]);
  const metadataCandidate =
    fleet?.availability === 'OBSERVED'
      ? fleet.devices.find((device) => device.deviceId === metadataDevice)
      : undefined;
  const metadataAction = useCallback(
    async (read = false) => {
      if (metadataInFlight.current) return;
      if (
        read &&
        (!metadata ||
          metadataReconcile ||
          !metadataCandidate ||
          metadataCandidate.verification !== 'VERIFIED' ||
          metadataCandidate.state !== 'DEVICE' ||
          fleetReconcile ||
          discovery?.state !== 'READY' ||
          discoveryReconcile)
      )
        return;
      metadataInFlight.current = true;
      setMetadataPending(true);
      if (read) {
        metadataGeneration.current = Object.freeze({});
        setMetadataReconcile(true);
      }
      const generation = metadataGeneration.current;
      const candidate = metadataDevice;
      try {
        const raw = read
          ? await window.metadata.read(
              candidate,
              metadataField,
              metadata?.revision,
              fleet?.registryRevision,
            )
          : await window.metadata.get();
        if (generation !== metadataGeneration.current) return;
        const response = parseMetadataResponse(raw);
        if (!response) throw Error('INVALID_RESPONSE');
        if (!response.ok) {
          setMetadataReconcile(true);
          setMetadata(null);
          observeRevocation(response.code);
          setMetadataStatus(
            `${response.outcome} / ${response.code}. Đọc trạng thái để đối chiếu; không tự thử lại.`,
          );
          return;
        }
        if (
          read &&
          (response.snapshot.deviceId !== candidate || response.snapshot.field !== metadataField)
        )
          throw Error('INVALID_RESPONSE');
        setMetadata(response.snapshot);
        setMetadataReconcile(
          response.outcome !== 'OBSERVED' ||
            ['PENDING', 'OUTCOME_UNKNOWN', 'CLOSED'].includes(response.snapshot.state) ||
            response.snapshot.lastOutcome === 'OUTCOME_UNKNOWN',
        );
        setMetadataStatus(
          `${response.outcome} / ${response.snapshot.state} / ${response.snapshot.lastOutcome} / ${response.snapshot.code ?? 'OK'} / LOG ${response.loggingHealth}. Quan sát tại thời điểm ghi nhận, không giám sát liên tục; Read status để đối chiếu.`,
        );
      } catch {
        if (generation !== metadataGeneration.current) return;
        setMetadata(null);
        setMetadataReconcile(true);
        setMetadataStatus(
          'OUTCOME_UNKNOWN / INTERNAL_FAILURE. Đọc trạng thái để đối chiếu; không tự thử lại.',
        );
      } finally {
        metadataInFlight.current = false;
        setMetadataPending(false);
      }
    },
    [
      metadata,
      metadataReconcile,
      metadataCandidate,
      metadataDevice,
      metadataField,
      fleet,
      fleetReconcile,
      discovery,
      discoveryReconcile,
      observeRevocation,
    ],
  );
  useEffect(() => {
    if (metadataHydrated.current) return;
    metadataHydrated.current = true;
    void metadataAction();
  }, [metadataAction]);
  const emptyRows = { devices: [], accounts: [], media: [], jobs: [] };
  const fleetUi: UiSnapshot = fleetFailed
    ? { status: 'ERROR', code: 'UNAVAILABLE', ...emptyRows }
    : !fleet
      ? { status: 'LOADING', ...emptyRows }
      : fleet.availability === 'UNAVAILABLE'
        ? {
            status: 'UNAVAILABLE',
            reason: fleet.reason as 'BINARY_UNAVAILABLE' | 'LIVE_DISCOVERY_UNAVAILABLE',
            ...emptyRows,
          }
        : {
            status: 'READY',
            provenance: 'MAIN_OBSERVED',
            ...emptyRows,
            devices: fleet.devices.map((device) => ({
              id: device.deviceId,
              name: device.label,
              serial: '—',
              status: device.state,
              connection: 'UNKNOWN',
            })),
          };
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
          observeRevocation(result.code);
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
    [preferences, reconcile, tileInput, dockInput, observeRevocation],
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
        observeRevocation(response.code);
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
      snapshot={fleetUi}
      selection={
        fleetFailed || !fleet
          ? { selectedDeviceIds: [], activeDeviceId: null, groups: [] }
          : fleet.selection
      }
      selectionPending={fleetPending}
      selectionBlocked={!fleet || fleetReconcile}
      onSelection={(selection) => {
        void fleetAction(selection);
      }}
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
          <section aria-label="Android Platform Tools setup" id="platform-tools-panel">
            <h2>Android Platform Tools</h2>
            <p>
              Thiết lập tùy chọn bản {setup?.installTargetVersion ?? 'chưa quan sát'} từ Google hoặc
              tệp ZIP đã có. Lần đầu cần mạng nếu chưa có đúng tệp; Auto không phân phối bộ công cụ
              này.
            </p>
            <button
              type="button"
              id="platform-tools-read"
              disabled={setupPending}
              onClick={() => {
                void setupAction();
              }}
            >
              Đọc trạng thái / đối chiếu
            </button>
            <button
              type="button"
              id="platform-tools-setup"
              disabled={
                setupPending ||
                !setup ||
                setupReconcile ||
                ['AWAITING_RECIPIENT', 'PROVISIONING', 'OUTCOME_UNKNOWN'].includes(setup.state)
              }
              onClick={() => {
                void setupAction(true);
              }}
            >
              Thiết lập bộ công cụ
            </button>
            <p id="platform-tools-release">
              Bản mục tiêu: {setup?.installTargetVersion ?? 'chưa quan sát'}; bản byte được xác
              minh: {setup?.activeVersion ?? 'không có'}.
              {setup?.state === 'AWAITING_RECIPIENT' ||
              setup?.state === 'PROVISIONING' ||
              setup?.state === 'OUTCOME_UNKNOWN'
                ? ' Bản hiển thị trước đó không phải quyền sử dụng hiện tại.'
                : ''}{' '}
              Khôi phục bản trước:{' '}
              {setup?.rollbackAvailable ? 'có thể yêu cầu xác nhận gốc' : 'không khả dụng'}.
            </p>
            <p id="platform-tools-status" aria-live="polite">
              {setupStatus}
            </p>
            <p>
              Sau khi hoàn tất hộp thoại, nhấn Đọc trạng thái. Mọi xác nhận điều khoản và chọn tệp
              diễn ra trong hộp thoại gốc; không có quyền thiết bị được cấp.
            </p>
          </section>
          <section aria-label="Local runtime version" id="runtime-version-panel">
            <h3>Kiểm tra phiên bản bộ công cụ</h3>
            <p>
              Bản mục tiêu: {runtimeVersion?.installTargetVersion ?? 'chưa quan sát'}; bản đang được
              xác minh byte: {runtimeVersion?.activeVersion ?? 'không có'}.
            </p>
            <p>
              Chỉ chạy lệnh version khi bạn chọn. Không khởi động máy chủ hoặc kết nối thiết bị. Cần
              phiên launcher bật chế độ kiểm tra được quản lý; đường dẫn quá dài bị từ chối.
            </p>
            <button
              type="button"
              id="runtime-version-read"
              disabled={runtimePending}
              onClick={() => {
                void runtimeAction();
              }}
            >
              Đọc kết quả / đối chiếu
            </button>
            <button
              type="button"
              id="runtime-version-verify"
              disabled={
                runtimePending ||
                runtimeReconcile ||
                !runtimeVersion ||
                !['IDLE', 'VERIFIED', 'FAILED'].includes(runtimeVersion.state) ||
                runtimeVersion.installationRevision === null
              }
              onClick={() => {
                void runtimeAction(true);
              }}
            >
              Kiểm tra phiên bản cục bộ
            </button>
            <p id="runtime-version-status" aria-live="polite">
              {runtimeStatus}
            </p>
          </section>
          <section aria-label="Owned discovery" id="discovery-panel">
            <h3>Máy chủ và quan sát thiết bị</h3>
            <p>
              Chỉ thực hiện khi bạn chọn. Không giám sát liên tục; hồ sơ hoặc môi trường không phù
              hợp sẽ bị từ chối.
            </p>
            <button
              type="button"
              id="discovery-read"
              disabled={discoveryPending || discoveryStopPending}
              onClick={() => {
                void discoveryAction('get');
              }}
            >
              Đọc trạng thái máy chủ
            </button>
            <button
              type="button"
              id="discovery-start"
              disabled={
                discoveryPending ||
                discoveryStopPending ||
                discoveryReconcile ||
                !discovery ||
                discovery.restartRequired ||
                !['IDLE', 'STOPPED'].includes(discovery.state) ||
                discovery.installationRevision === null
              }
              onClick={() => {
                void discoveryAction('start');
              }}
            >
              Start máy chủ được sở hữu
            </button>
            <button
              type="button"
              id="discovery-refresh"
              disabled={
                discoveryPending ||
                discoveryStopPending ||
                discoveryReconcile ||
                discovery?.state !== 'READY' ||
                discovery.restartRequired
              }
              onClick={() => {
                void discoveryAction('refresh');
              }}
            >
              Refresh thiết bị
            </button>
            <button
              type="button"
              id="discovery-stop"
              disabled={discoveryStopPending}
              onClick={() => {
                void discoveryAction('stop');
              }}
            >
              Stop / dọn phiên được sở hữu
            </button>
            <p id="discovery-status" aria-live="polite">
              {discoveryStatus}
            </p>
          </section>
          <section aria-label="Fleet status" id="fleet-panel">
            <button
              type="button"
              id="fleet-read"
              disabled={fleetPending}
              onClick={() => {
                void fleetAction();
              }}
            >
              Read fleet / reconcile selection
            </button>
            <p id="fleet-status" aria-live="polite">
              {fleetStatus}
            </p>
          </section>
          <section aria-label="Candidate metadata" id="metadata-panel">
            <h3>Thông tin thiết bị / Read candidate field</h3>
            <p>
              Chọn một dòng Fleet hiện hành. PROVISIONAL không đủ điều kiện; metadata không xác minh
              danh tính.
            </p>
            <fieldset className="pills">
              <legend>Metadata candidates</legend>
              {fleet?.availability === 'OBSERVED' && !fleetFailed ? (
                fleet.devices.map((device) => (
                  <button
                    type="button"
                    className="btn small"
                    key={device.deviceId}
                    id={`metadata-candidate-${device.deviceId}`}
                    data-metadata-device={device.deviceId}
                    aria-pressed={metadataDevice === device.deviceId}
                    onClick={() => {
                      metadataGeneration.current = Object.freeze({});
                      setMetadataDevice(device.deviceId);
                      setMetadataReconcile(true);
                      setMetadataStatus(
                        'Đã chọn ngữ cảnh; đọc trạng thái trước Read. Không có truy vấn tự động.',
                      );
                    }}
                  >
                    {device.label} / {device.verification} / {device.state}
                  </button>
                ))
              ) : (
                <p>UNAVAILABLE / Chưa có Fleet hiện hành.</p>
              )}
            </fieldset>
            <label htmlFor="metadata-field">Trường thông tin</label>
            <select
              id="metadata-field"
              value={metadataField}
              onChange={(event) => {
                const field = event.currentTarget.value;
                if (METADATA_FIELDS.some((candidate) => candidate === field)) {
                  metadataGeneration.current = Object.freeze({});
                  setMetadataField(field as MetadataField);
                  setMetadataReconcile(true);
                }
              }}
            >
              {METADATA_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
            <button
              type="button"
              id="metadata-get"
              disabled={metadataPending}
              onClick={() => {
                void metadataAction();
              }}
            >
              Read status / bộ nhớ metadata
            </button>
            <button
              type="button"
              id="metadata-read"
              disabled={
                metadataPending ||
                metadataReconcile ||
                !metadata ||
                fleetReconcile ||
                discoveryReconcile ||
                discovery?.state !== 'READY' ||
                metadataCandidate?.verification !== 'VERIFIED' ||
                metadataCandidate?.state !== 'DEVICE'
              }
              onClick={() => {
                void metadataAction(true);
              }}
            >
              Read candidate field
            </button>
            <p id="metadata-status" aria-live="polite">
              {metadataStatus}
            </p>
            {metadataCandidate?.verification === 'PROVISIONAL' && (
              <p>POLICY_DENIED / PROVISIONAL: Read không khả dụng.</p>
            )}
            <dl id="metadata-observations">
              {METADATA_FIELDS.map((field) => {
                const observation =
                  metadata?.deviceId === metadataDevice ? metadata.observations[field] : null;
                return (
                  <div key={field}>
                    <dt>{field}</dt>
                    <dd>
                      {!observation
                        ? 'UNAVAILABLE / chưa quan sát'
                        : `${observation.stale ? 'STALE' : 'CAPTURED'} / UTC ms ${observation.observedUtc} / ${observation.source} / ${observation.available ? `${typeof observation.value === 'object' ? JSON.stringify(observation.value) : observation.value} ${observation.units}` : observation.reason}`}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
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
