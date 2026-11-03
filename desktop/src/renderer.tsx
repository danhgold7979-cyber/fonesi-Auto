import {
  createTileVideoDecoder,
  measureVideoRates,
  VIDEO_ACCOUNTING_FRESH_MS,
  type VideoAccounting,
  type VideoRates,
} from './video-decoder.ts';
import { snapshotVideoPresentationMessage } from './video-presentation-contract.ts';
import {
  parseVideoStreamResponse,
  snapshotVideoPortMetadata,
  VIDEO_WINDOW_ORIGIN,
  type VideoPortMetadata,
} from './video-stream-contract.ts';
import {
  parseHostResourceResponse,
  HOST_METRICS,
  HOST_METRIC_INFO,
  type HostResourceSample,
} from './host-resource-contract.ts';
import {
  INPUT_ACTIONS,
  parseInputInteractionResponse,
  type InputInteractionSnapshot,
  type InputInteractionAction,
} from './input-interaction-contract.js';
import { parseAssociationResponse, type AssociationSnapshot } from './association-contract.js';
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
    videoStream?: Readonly<{ invoke: (wire: string) => Promise<string> }>;
    hostResources?: Readonly<{ sample: () => Promise<string>; cancel: () => Promise<string> }>;
    input: Readonly<{
      get: () => Promise<string>;
      press: (
        revision: unknown,
        selectionRevision: unknown,
        registryRevision: unknown,
        deviceId: unknown,
        action: unknown,
      ) => Promise<string>;
    }>;
    association: Readonly<{
      get: () => Promise<string>;
      candidates: () => Promise<string>;
      begin: (
        revision: unknown,
        candidateId: unknown,
        mode: unknown,
        deviceId?: unknown,
      ) => Promise<string>;
      removal: (revision: unknown, ceremonyId: unknown) => Promise<string>;
      return: (revision: unknown, ceremonyId: unknown) => Promise<string>;
      confirm: (revision: unknown, ceremonyId: unknown) => Promise<string>;
      cancel: (revision: unknown, operationId: unknown) => Promise<string>;
    }>;
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
  const [hostSample, setHostSample] = useState<HostResourceSample | null>(null);
  const [hostStatus, setHostStatus] = useState('UNKNOWN');
  const [hostPending, setHostPending] = useState(false);
  const hostGeneration = useRef<object>({});
  const hostInFlight = useRef(false);
  const hostFresh = useRef({ from: 0, until: 0 });
  const hostAlive = useRef(true);
  const hostExpiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelHost = () => {
    hostGeneration.current = {};
    if (hostExpiry.current !== undefined) clearTimeout(hostExpiry.current);
    hostExpiry.current = undefined;
    hostFresh.current = { from: 0, until: 0 };
    if (hostAlive.current) setHostStatus('STALE');
    if (hostInFlight.current) void window.hostResources?.cancel().catch(() => {});
  };
  useEffect(() => {
    hostAlive.current = true;
    return () => {
      hostAlive.current = false;
      hostGeneration.current = {};
      if (hostExpiry.current !== undefined) clearTimeout(hostExpiry.current);
      void window.hostResources?.cancel().catch(() => {});
    };
  }, []);
  async function readHost() {
    if (hostInFlight.current || !window.hostResources) return;
    hostInFlight.current = true;
    setHostPending(true);
    setHostStatus('SAMPLING');
    const generation = {};
    hostGeneration.current = generation;
    const started = performance.now();
    if (hostExpiry.current !== undefined) clearTimeout(hostExpiry.current);
    try {
      const result = parseHostResourceResponse(await window.hostResources.sample());
      if (!hostAlive.current || hostGeneration.current !== generation) return;
      if (result?.code !== 'OK' || !result.sample) {
        setHostStatus(result?.code ?? 'UNAVAILABLE');
        return;
      }
      setHostSample(result.sample);
      const elapsed = performance.now() - started;
      const remaining =
        Number.isFinite(elapsed) && elapsed >= 0
          ? Math.max(0, result.remainingFreshMs - elapsed)
          : 0;
      const observedAt = performance.now();
      hostFresh.current = { from: observedAt, until: observedAt + remaining };
      setHostStatus(remaining > 0 ? 'FRESH' : 'STALE');
      if (remaining > 0)
        hostExpiry.current = setTimeout(() => {
          if (hostAlive.current && hostGeneration.current === generation) setHostStatus('STALE');
        }, remaining);
    } catch {
      if (hostAlive.current && hostGeneration.current === generation) setHostStatus('UNAVAILABLE');
    } finally {
      hostInFlight.current = false;
      if (hostAlive.current) setHostPending(false);
    }
  }
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
  const [inputSnapshot, setInputSnapshot] = useState<InputInteractionSnapshot | null>(null);
  const [inputStatus, setInputStatus] = useState('Chưa đọc lịch sử input; không tự gửi phím.');
  const [inputReconcile, setInputReconcile] = useState(true);
  const [inputPending, setInputPending] = useState(false);
  const inputInFlight = useRef(false),
    inputGeneration = useRef<object>(Object.freeze({}));
  const invalidateInput = useCallback(() => {
    inputGeneration.current = Object.freeze({});
    setInputReconcile(true);
    setInputStatus('Lịch sử input chỉ thuộc đích gốc; Get để đối chiếu trước thao tác mới.');
  }, []);
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
  const [association, setAssociation] = useState<AssociationSnapshot | null>(null);
  const [associationCandidates, setAssociationCandidates] = useState<
    AssociationSnapshot['candidates']
  >([]);
  const [associationHistorical, setAssociationHistorical] = useState<
    AssociationSnapshot['historical']
  >([]);
  const [associationCandidate, setAssociationCandidate] = useState<string | null>(null);
  const [associationDestination, setAssociationDestination] = useState<string | null>(null);
  const [associationStatus, setAssociationStatus] = useState(
    'Chưa đọc phiên liên kết; không tự quét hoặc xác nhận.',
  );
  const [associationReconcile, setAssociationReconcile] = useState(true);
  const [associationPending, setAssociationPending] = useState(false);
  const [associationGetPending, setAssociationGetPending] = useState(false);
  const [associationCancelPending, setAssociationCancelPending] = useState(false);
  const associationGeneration = useRef<object>(Object.freeze({}));
  const associationEffectInFlight = useRef(false),
    associationGetInFlight = useRef(false),
    associationCancelInFlight = useRef(false);
  const associationProjection = useRef<number | null>(null);
  const invalidateAssociation = useCallback(() => {
    associationGeneration.current = Object.freeze({});
    setAssociationReconcile(true);
    setAssociationCandidates([]);
    setAssociationHistorical([]);
    setAssociationCandidate(null);
    setAssociationDestination(null);
    setAssociationStatus('Quan sát liên kết đã cũ; đọc lại trạng thái. Không tự thử lại.');
  }, []);
  const invalidateMetadata = useCallback(() => {
    metadataGeneration.current = Object.freeze({});
    setMetadata(null);
    setMetadataReconcile(true);
    setMetadataStatus('REFRESH_REQUIRED / Cần đọc lại trạng thái metadata; không tự thử lại.');
  }, []);
  const invalidateFleet = useCallback(() => {
    invalidateInput();
    invalidateMetadata();
    fleetGeneration.current = Object.freeze({});
    setFleet(null);
    setFleetFailed(true);
    setFleetReconcile(true);
    setFleetStatus(
      'LIVE_DISCOVERY_UNAVAILABLE / CACHED OBSERVATION CLEARED / EXPLICIT FLEET READ REQUIRED',
    );
  }, [invalidateMetadata, invalidateInput]);
  const invalidateDiscovery = useCallback(() => {
    invalidateAssociation();
    discoveryGeneration.current = Object.freeze({});
    setDiscovery(null);
    setDiscoveryReconcile(true);
    setDiscoveryStatus('Cần đọc lại trạng thái; quan sát trước không còn hiện hành.');
    invalidateFleet();
  }, [invalidateFleet, invalidateAssociation]);
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
      invalidateAssociation();
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
      if (selection !== undefined) invalidateInput();
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
          invalidateInput();
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
        if (
          !fleet ||
          response.fleet.availability !== 'OBSERVED' ||
          fleet.registryRevision !== response.fleet.registryRevision ||
          fleet.selection.revision !== response.fleet.selection.revision
        )
          invalidateInput();
        setFleet(response.fleet);
        setFleetFailed(false);
        setFleetReconcile(false);
        setFleetStatus(
          `${response.outcome} / PROCESS-LOCAL SELECTION ${response.fleet.selection.revision} / ${response.fleet.reason ?? 'OBSERVED'} / AUDIT ${response.auditHealth}`,
        );
      } catch {
        if (generation !== fleetGeneration.current) return;
        invalidateMetadata();
        invalidateInput();
        setFleet(null);
        setFleetFailed(true);
        setFleetReconcile(true);
        setFleetStatus('INTERNAL_FAILURE / EXPLICIT FLEET READ REQUIRED');
      } finally {
        fleetInFlight.current = false;
        setFleetPending(false);
      }
    },
    [fleet, fleetReconcile, observeRevocation, invalidateMetadata, invalidateInput],
  );
  useEffect(() => {
    if (fleetHydrationStarted.current) return;
    fleetHydrationStarted.current = true;
    void fleetAction();
  }, [fleetAction]);
  const inputActive =
    fleet?.availability === 'OBSERVED' && !fleetFailed && !fleetReconcile && !fleetPending
      ? fleet.devices.find(
          (d) =>
            d.deviceId === fleet.selection.activeDeviceId &&
            d.verification === 'VERIFIED' &&
            d.state === 'DEVICE',
        )
      : undefined;
  const inputBlocked =
    inputPending ||
    inputReconcile ||
    !inputSnapshot ||
    !inputActive ||
    ['PENDING', 'OUTCOME_UNKNOWN', 'STALE', 'CLOSED'].includes(inputSnapshot.state);
  async function inputAction(action?: InputInteractionAction) {
    if (inputInFlight.current || (action !== undefined && inputBlocked)) return;
    inputInFlight.current = true;
    setInputPending(true);
    const generation = inputGeneration.current;
    if (action !== undefined) setInputReconcile(true);
    try {
      const raw =
        action === undefined
          ? await window.input.get()
          : await window.input.press(
              inputSnapshot?.revision,
              fleet?.selection.revision,
              fleet?.registryRevision,
              inputActive?.deviceId,
              action,
            );
      if (generation !== inputGeneration.current) return;
      const response = parseInputInteractionResponse(raw);
      if (!response) throw Error('INVALID_RESPONSE');
      if (!response.ok) {
        setInputReconcile(true);
        observeRevocation(response.code);
        setInputStatus(
          `${response.code} / LOG ${response.loggingHealth}. Lịch sử cũ được giữ; Get để đối chiếu, không tự thử lại.`,
        );
        return;
      }
      setInputSnapshot(response.snapshot);
      setInputReconcile(
        response.outcome !== 'STATUS' ||
          ['PENDING', 'OUTCOME_UNKNOWN', 'STALE', 'CLOSED'].includes(response.snapshot.state),
      );
      setInputStatus(
        `${response.outcome} / ${response.snapshot.state} / ${response.snapshot.code ?? 'NONE'} / LOG ${response.loggingHealth}. Chỉ là biên nhận lệnh, không chứng minh hiệu ứng Android.`,
      );
    } catch {
      if (generation !== inputGeneration.current) return;
      setInputReconcile(true);
      setInputStatus('INTERNAL_FAILURE / Get để đối chiếu; không tự thử lại.');
    } finally {
      inputInFlight.current = false;
      setInputPending(false);
    }
  }
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
  const chosenAssociationCandidate = associationCandidates.find(
    (candidate) => candidate.candidateId === associationCandidate,
  );
  const associationIdle =
    association !== null &&
    ['IDLE', 'COMMITTED', 'CANCELLED', 'FAILED'].includes(association.state);
  async function associationAction(
    method: 'get' | 'candidates' | 'begin' | 'removal' | 'return' | 'confirm' | 'cancel',
  ) {
    const read = method === 'get' || method === 'candidates',
      cancel = method === 'cancel';
    if (
      read
        ? associationGetInFlight.current
        : cancel
          ? associationCancelInFlight.current
          : associationEffectInFlight.current || associationCancelInFlight.current
    )
      return;
    if (!read && !cancel && (!association || associationReconcile)) return;
    if (
      cancel &&
      (!association?.operationId ||
        ['IDLE', 'COMMITTED', 'CANCELLED', 'CLOSED'].includes(association.state))
    )
      return;
    if (
      method === 'begin' &&
      (!associationIdle ||
        !chosenAssociationCandidate ||
        (chosenAssociationCandidate.mode === 'HISTORICAL' &&
          !associationHistorical.some((d) => d.deviceId === associationDestination)))
    )
      return;
    if (
      (method === 'removal' && association?.state !== 'AWAIT_REMOVAL') ||
      (method === 'return' && association?.state !== 'AWAIT_RETURN') ||
      (method === 'confirm' && association?.state !== 'AWAIT_CONFIRMATION')
    )
      return;
    if (read) {
      associationGetInFlight.current = true;
      setAssociationGetPending(true);
    } else if (cancel) {
      associationCancelInFlight.current = true;
      setAssociationCancelPending(true);
    } else {
      associationEffectInFlight.current = true;
      setAssociationPending(true);
    }
    associationGeneration.current = Object.freeze({});
    const generation = associationGeneration.current;
    if (!read) {
      setAssociationReconcile(true);
      setAssociationCandidates([]);
      setAssociationHistorical([]);
      discoveryGeneration.current = Object.freeze({});
      setDiscoveryReconcile(true);
      invalidateFleet();
    }
    try {
      const raw =
        method === 'get'
          ? await window.association.get()
          : method === 'candidates'
            ? await window.association.candidates()
            : method === 'begin'
              ? await window.association.begin(
                  association?.revision,
                  chosenAssociationCandidate?.candidateId,
                  chosenAssociationCandidate?.mode,
                  chosenAssociationCandidate?.mode === 'HISTORICAL'
                    ? associationDestination
                    : undefined,
                )
              : method === 'cancel'
                ? await window.association.cancel(association?.revision, association?.operationId)
                : await window.association[method](association?.revision, association?.ceremonyId);
      if (generation !== associationGeneration.current) return;
      const response = parseAssociationResponse(raw);
      if (!response) throw Error('INVALID_RESPONSE');
      if (!response.ok) {
        setAssociationReconcile(true);
        observeRevocation(response.code);
        setAssociationStatus(
          `${response.code} / LOG ${response.loggingHealth}. Lịch sử đã biết được giữ lại; Get để đối chiếu, không tự thử lại.`,
        );
        return;
      }
      const next = response.snapshot;
      setAssociation(next);
      if (method === 'candidates') {
        setAssociationCandidates(next.candidates);
        setAssociationHistorical(next.historical);
        if (!next.candidates.some((candidate) => candidate.candidateId === associationCandidate)) {
          setAssociationCandidate(null);
          setAssociationDestination(null);
        }
      }
      setAssociationReconcile(
        response.outcome !== 'OBSERVED' ||
          [
            'BASELINE_PENDING',
            'REMOVAL_PENDING',
            'RETURN_PENDING',
            'CONFIRM_PENDING',
            'OUTCOME_UNKNOWN',
            'CLOSED',
          ].includes(next.state) ||
          (read && (associationEffectInFlight.current || associationCancelInFlight.current)),
      );
      if (
        next.receipt?.outcome === 'COMMITTED' &&
        associationProjection.current !== next.receipt.revision
      ) {
        associationProjection.current = next.receipt.revision;
        invalidateFleet();
        discoveryGeneration.current = Object.freeze({});
        setDiscoveryReconcile(true);
      }
      setAssociationStatus(
        `${response.outcome} / ${next.state} / ${next.code} / LOG ${response.loggingHealth}. ${next.receipt ? `Lịch sử ${next.receipt.stage}: ${next.receipt.outcome}, revision ${next.receipt.revision ?? 'không có'}; ${next.projectionCurrent ? 'hiện hành tại thời điểm chụp' : 'không phải quyền hiện hành'}.` : 'Chưa có biên nhận pha.'} Nhấn Get để đối chiếu; không tự thực hiện bước kế tiếp.`,
      );
    } catch {
      if (generation !== associationGeneration.current) return;
      setAssociationReconcile(true);
      setAssociationStatus(
        'INTERNAL_FAILURE / Lịch sử đã biết được giữ lại; Get để đối chiếu, không tự thử lại.',
      );
    } finally {
      if (read) {
        associationGetInFlight.current = false;
        setAssociationGetPending(false);
      } else if (cancel) {
        associationCancelInFlight.current = false;
        setAssociationCancelPending(false);
      } else {
        associationEffectInFlight.current = false;
        setAssociationPending(false);
      }
    }
  }
  type DisplaySession = {
    requestId: string;
    deviceId: string;
    generation: number;
    registryRevision: number;
    videoId: string | null;
    stopped: boolean;
    failure: string | null;
    stopping: boolean;
    port: MessagePort | null;
    metadata: VideoPortMetadata | null;
    decoder: ReturnType<typeof createTileVideoDecoder> | null;
    canvas: HTMLCanvasElement | null;
    disposeVisibility: (() => void) | null;
  };
  const [videoView, setVideoView] = useState<{
    deviceId: string;
    generation: number;
    state: string;
  } | null>(null);
  const videoSession = useRef<DisplaySession | null>(null);
  type PreviewObservation = Readonly<{
    owner: DisplaySession;
    decoder: NonNullable<DisplaySession['decoder']>;
    sample: VideoAccounting;
  }>;
  const previewBaseline = useRef<PreviewObservation | null>(null);
  const [previewCapture, setPreviewCapture] = useState<
    (PreviewObservation & Readonly<{ rates: VideoRates | null }>) | null
  >(null);
  function clearPreview() {
    previewBaseline.current = null;
    if (videoAlive.current) setPreviewCapture(null);
  }
  const previewClock = useRef<number | null>(null);
  const previewClockValid = useRef(true);
  function previewNow() {
    let now: number;
    try {
      now = performance.now();
    } catch {
      previewClockValid.current = false;
      return null;
    }
    if (!Number.isFinite(now) || (previewClock.current !== null && now < previewClock.current))
      previewClockValid.current = false;
    previewClock.current = now;
    return previewClockValid.current ? now : null;
  }
  function currentPreview(r: DisplaySession | null) {
    return (
      r !== null &&
      videoSession.current === r &&
      !r.stopped &&
      !r.stopping &&
      r.failure === null &&
      r.videoId !== null &&
      r.metadata?.videoId === r.videoId &&
      eligibleVideo(r.deviceId, r.generation) &&
      videoFleet.current.fleet?.registryRevision === r.registryRevision &&
      r.decoder !== null &&
      !r.decoder.snapshot().closed
    );
  }
  function readPreview() {
    const r = videoSession.current;
    const decoder = r?.decoder;
    const sample = currentPreview(r) ? decoder?.accounting() : null;
    const now = previewNow();
    if (
      !r ||
      !decoder ||
      !sample ||
      now === null ||
      sample.admitted <= 0 ||
      sample.videoId !== r.videoId ||
      sample.segment !== decoder.snapshot().segment ||
      sample.observedAt > now ||
      now - sample.observedAt >= VIDEO_ACCOUNTING_FRESH_MS ||
      r.decoder !== decoder ||
      !currentPreview(r)
    ) {
      clearPreview();
      return;
    }
    const previous = previewBaseline.current;
    const rates =
      previous?.owner === r && previous.decoder === decoder
        ? measureVideoRates(previous.sample, sample)
        : null;
    const observation = { owner: r, decoder, sample };
    previewBaseline.current = observation;
    setPreviewCapture({ ...observation, rates });
  }

  const videoAlive = useRef(true);
  const videoQuotaClosed = useRef(false);
  const videoFleetBlocked = fleetFailed || fleetReconcile || fleetPending;
  const videoFleet = useRef({ fleet, fleetFailed, fleetReconcile, fleetPending });
  videoFleet.current = { fleet, fleetFailed, fleetReconcile, fleetPending };
  const eligibleVideo = useCallback((deviceId: string, generation: number) => {
    const f = videoFleet.current;
    return (
      videoAlive.current &&
      !f.fleetFailed &&
      !f.fleetReconcile &&
      !f.fleetPending &&
      f.fleet?.availability === 'OBSERVED' &&
      f.fleet.devices.some(
        (d) =>
          d.deviceId === deviceId &&
          d.generation === generation &&
          d.verification === 'VERIFIED' &&
          d.state === 'DEVICE',
      )
    );
  }, []);
  const stopVideo = async () => {
    const r = videoSession.current;
    clearPreview();
    if (!r) return;
    r.stopped = true;
    r.disposeVisibility?.();
    r.disposeVisibility = null;
    r.decoder?.close();
    r.decoder = null;
    r.port?.close();
    r.port = null;
    if (videoAlive.current)
      setVideoView({
        deviceId: r.deviceId,
        generation: r.generation,
        state: r.failure ? `${r.failure} / STOPPING` : 'STOPPING',
      });
    if (!r.videoId || r.stopping) return;
    r.stopping = true;
    try {
      const wire = await window.videoStream?.invoke(
        JSON.stringify({
          version: 1,
          requestId: crypto.randomUUID(),
          kind: 'STOP',
          videoId: r.videoId,
        }),
      );
      const result = parseVideoStreamResponse(wire);
      if (videoSession.current !== r) return;
      if (videoAlive.current)
        setVideoView({
          deviceId: r.deviceId,
          generation: r.generation,
          state: `${r.failure ? `${r.failure} / ` : ''}${result?.code === 'STOPPED' ? 'STOPPED' : 'UNCERTAIN'}`,
        });
      if (result?.code === 'STOPPED') videoSession.current = null;
    } catch {
      if (videoAlive.current && videoSession.current === r)
        setVideoView({
          deviceId: r.deviceId,
          generation: r.generation,
          state: `${r.failure ? `${r.failure} / ` : ''}UNCERTAIN`,
        });
    }
  };
  const videoActions = useRef({ stopVideo });
  videoActions.current = { stopVideo };
  const attachVideo = () => {
    const r = videoSession.current;
    if (!r || r.stopped || r.decoder || !r.port || !r.metadata || !r.canvas) return;
    const port = r.port;
    delete r.canvas.dataset.videoGeometry;
    r.decoder = createTileVideoDecoder({
      videoId: r.metadata.videoId,
      deviceId: r.deviceId,
      generation: r.generation,
      deadlineUtc: r.metadata.deadlineUtc,
      canvas: r.canvas,
      current: () =>
        videoSession.current === r &&
        !r.stopped &&
        eligibleVideo(r.deviceId, r.generation) &&
        videoFleet.current.fleet?.registryRevision === r.registryRevision,
      visible: () => !document.hidden,
      onPresentationAck: (value) => port.postMessage(value),
      onConsumed: (value) => port.postMessage(value),
      onPainted: (value) => port.postMessage(value),
      onState: (state) => {
        if (videoSession.current !== r || !videoAlive.current || r.failure?.startsWith('REFUSED:'))
          return;
        setVideoView({
          deviceId: r.deviceId,
          generation: r.generation,
          state: state === 'PAUSED_HIDDEN' ? 'PAUSED_HIDDEN:WINDOW_HIDDEN' : state,
        });
        if (state === 'DECODE_FAILED' || state === 'DECODER_UNAVAILABLE') {
          const geometry = r.decoder?.snapshot().geometryFailure;
          if (geometry && r.canvas) r.canvas.dataset.videoGeometry = JSON.stringify(geometry);
          r.failure =
            state === 'DECODE_FAILED'
              ? `${state}:${r.decoder?.snapshot().failureReason ?? 'UNOBSERVED'}`
              : state;
          void videoActions.current.stopVideo();
        }
      },
    });
    if (r.stopped || videoSession.current !== r) {
      r.decoder.close();
      return;
    }
    port.onmessage = (event) => {
      if (videoSession.current !== r || r.stopped) return;
      const message = snapshotVideoPresentationMessage(event.data);
      if (message?.kind === 'REFUSED') {
        if (message.videoId !== r.videoId) return;
        if (message.reason === 'QUOTA') videoQuotaClosed.current = true;
        r.failure = `REFUSED:${message.reason}`;
        void videoActions.current.stopVideo();
        return;
      }
      const decoder = r.decoder;
      const segment = decoder?.snapshot().segment;
      if (message?.kind === 'PRESENTATION') decoder?.presentation(message);
      else decoder?.receive(message ?? event.data);
      // CONFIG advances synchronously before its capability Promise settles.
      // Invalidate here rather than waiting for a later onState notification.
      if (decoder && decoder.snapshot().segment !== segment) clearPreview();
    };
    port.onmessageerror = () => {
      if (videoSession.current === r && !r.stopped && r.port === port)
        void videoActions.current.stopVideo();
    };
    const visibility = () => {
      if (videoSession.current !== r || r.stopped || r.port !== port || !videoAlive.current) return;
      try {
        // This is a wake-up hint only. Main independently reads its captured BrowserWindow.
        port.postMessage({ version: 2, videoId: r.videoId, kind: 'VISIBILITY_HINT' });
      } catch {
        void videoActions.current.stopVideo();
      }
    };
    r.disposeVisibility = () => document.removeEventListener('visibilitychange', visibility);
    try {
      document.addEventListener('visibilitychange', visibility);
      port.start();
      if (!r.stopped && videoSession.current === r && r.port === port)
        port.postMessage({ version: 2, videoId: r.videoId, kind: 'READY' });
    } catch {
      void videoActions.current.stopVideo();
    }
  };
  const videoAttach = useRef(attachVideo);
  videoAttach.current = attachVideo;
  const videoCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    const r = videoSession.current;
    if (!r) return;
    r.canvas = canvas;
    if (canvas) videoAttach.current();
    else void videoActions.current.stopVideo();
  }, []);
  async function startVideo(deviceId: string, generation: number) {
    if (
      videoSession.current ||
      videoQuotaClosed.current ||
      !window.videoStream ||
      !eligibleVideo(deviceId, generation) ||
      !videoFleet.current.fleet
    )
      return;
    if (
      typeof VideoDecoder === 'undefined' ||
      typeof EncodedVideoChunk === 'undefined' ||
      !window.isSecureContext
    ) {
      setVideoView({ deviceId, generation, state: 'DECODER_UNAVAILABLE' });
      return;
    }
    const r: DisplaySession = {
      requestId: crypto.randomUUID(),
      deviceId,
      generation,
      registryRevision: videoFleet.current.fleet.registryRevision,
      videoId: null,
      stopped: false,
      failure: null,
      stopping: false,
      port: null,
      metadata: null,
      decoder: null,
      canvas: null,
      disposeVisibility: null,
    };
    videoSession.current = r;
    clearPreview();
    setVideoView({ deviceId, generation, state: 'STARTING' });
    try {
      const raw = await window.videoStream.invoke(
        JSON.stringify({
          version: 1,
          requestId: r.requestId,
          kind: 'START',
          deviceId,
          expectedRegistryRevision: r.registryRevision,
        }),
      );
      const result = parseVideoStreamResponse(raw);
      if (videoSession.current !== r) return;
      if (
        !result ||
        result.requestId !== r.requestId ||
        result.code !== 'PENDING' ||
        !result.videoId
      ) {
        clearPreview();
        r.stopped = true;
        r.disposeVisibility?.();
        r.disposeVisibility = null;
        r.decoder?.close();
        r.port?.close();
        if (videoAlive.current)
          setVideoView({ deviceId, generation, state: result?.code ?? 'UNCERTAIN' });
        if (
          result &&
          ['UNAVAILABLE', 'INVALID', 'STALE', 'BUSY', 'FAILED', 'CLOSED'].includes(result.code)
        )
          videoSession.current = null;
        return;
      }
      if (r.videoId && r.videoId !== result.videoId) {
        void videoActions.current.stopVideo();
        return;
      }
      r.videoId = result.videoId;
      if (r.stopped) void videoActions.current.stopVideo();
    } catch {
      if (videoSession.current === r) {
        clearPreview();
        r.stopped = true;
        r.disposeVisibility?.();
        r.disposeVisibility = null;
        r.port?.close();
        r.decoder?.close();
        if (videoAlive.current) setVideoView({ deviceId, generation, state: 'UNCERTAIN' });
      }
    }
  }
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== VIDEO_WINDOW_ORIGIN) return;
      const data = event.data;
      let metadata: VideoPortMetadata | null = null;
      try {
        if (data && data.type === 'AUTO_VIDEO_PORT_V1' && Object.keys(data).length === 7) {
          const { type: _, ...rest } = data;
          metadata = snapshotVideoPortMetadata(rest);
        }
      } catch {}
      const r = videoSession.current;
      if (
        !metadata ||
        !r ||
        r.port ||
        metadata.requestId !== r.requestId ||
        metadata.deviceId !== r.deviceId ||
        metadata.generation !== r.generation ||
        event.ports.length !== 1 ||
        (r.videoId !== null && r.videoId !== metadata.videoId)
      ) {
        for (const port of event.ports) port.close();
        return;
      }
      r.videoId = metadata.videoId;
      if (r.stopped) {
        for (const port of event.ports) port.close();
        void videoActions.current.stopVideo();
        return;
      }
      r.port = event.ports[0] ?? null;
      r.metadata = metadata;
      videoAttach.current();
    };
    const pagehide = () => {
      videoAlive.current = false;
      void videoActions.current.stopVideo();
    };
    window.addEventListener('message', message);
    window.addEventListener('pagehide', pagehide);
    return () => {
      videoAlive.current = false;
      window.removeEventListener('message', message);
      window.removeEventListener('pagehide', pagehide);
      void videoActions.current.stopVideo();
    };
  }, []);
  useEffect(() => {
    const r = videoSession.current;
    if (
      r &&
      !r.stopped &&
      (videoFleetBlocked ||
        !eligibleVideo(r.deviceId, r.generation) ||
        fleet?.registryRevision !== r.registryRevision)
    )
      void videoActions.current.stopVideo();
  }, [fleet, eligibleVideo, videoFleetBlocked]);
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
              generation: device.generation,
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
  const hostViewStatus =
    hostStatus === 'FRESH' &&
    (!Number.isFinite(performance.now()) ||
      performance.now() < hostFresh.current.from ||
      performance.now() >= hostFresh.current.until)
      ? 'STALE'
      : hostStatus;
  const capturedNow = previewNow();
  const previewSample =
    previewCapture &&
    currentPreview(previewCapture.owner) &&
    previewCapture.owner.decoder === previewCapture.decoder &&
    previewCapture.sample.videoId === previewCapture.owner.videoId &&
    previewCapture.sample.segment === previewCapture.decoder.snapshot().segment &&
    capturedNow !== null &&
    capturedNow >= previewCapture.sample.observedAt &&
    capturedNow - previewCapture.sample.observedAt < VIDEO_ACCOUNTING_FRESH_MS
      ? previewCapture.sample
      : null;
  const previewRates = previewSample ? previewCapture?.rates : null;
  return (
    <UiShell
      video={{
        view: videoView,
        available: !!window.videoStream,
        canStart: (id, generation) =>
          !videoQuotaClosed.current && !videoSession.current && eligibleVideo(id, generation),
        onStart: (id, generation) => {
          void startVideo(id, generation);
        },
        onStop: () => {
          void stopVideo();
        },
        canvasRef: videoCanvas,
      }}
      previewAccounting={
        <section aria-label="Renderer preview accounting" id="preview-accounting">
          <span>Stream / backlog · RENDERER_CANVAS</span>
          <strong>
            {previewSample
              ? 'CAPTURED · không phải số liệu trực tiếp'
              : 'UNKNOWN · chưa có mẫu hiện hành'}
          </strong>
          {previewSample ? (
            <>
              <small>
                Mẫu monotonic {previewSample.observedAt} ms · chỉ lần thử preview hiện tại
              </small>
              <div>
                Media nhận: {previewSample.admitted} · Lần gọi decode: {previewSample.submitted} ·
                Canvas đã vẽ: {previewSample.drawn} · AVC payload: {previewSample.payloadBytes}{' '}
                bytes
              </div>
              <div>
                Bỏ: {previewSample.discarded} (chờ key {previewSample.waitingKey}, reset{' '}
                {previewSample.reset}, stop/lỗi {previewSample.stopped}, ẩn cửa sổ{' '}
                {previewSample.hidden})
              </div>
              <div>
                Canvas:{' '}
                {previewSample.width === null
                  ? 'UNKNOWN'
                  : `${previewSample.width}×${previewSample.height}`}
              </div>
              <div>
                Chưa kết thúc: {previewSample.outstanding} · Bản ghi pending:{' '}
                {previewSample.pending} · Held: {previewSample.held}
              </div>
            </>
          ) : null}
          <div>
            RENDERER_INTERVAL ·{' '}
            {previewRates
              ? `Canvas: ${previewRates.canvasFps.toFixed(2)} draws/s · AVC payload: ${(previewRates.payloadBitsPerSecond / 1000000).toFixed(6)} Mbps · khoảng ${previewRates.intervalMs} ms`
              : 'Canvas draws/s / AVC payload Mbps: UNKNOWN'}
          </div>
          <small>
            Đọc lần hai trong 5 giây để chụp trung bình khoảng thời gian; không phải số liệu trực
            tiếp. Native/effective FPS / bitrate / native drops / GPU presentation: UNKNOWN. Canvas
            draw không chứng minh màn hình vật lý.
          </small>
        </section>
      }
      onPreviewAccountingRead={readPreview}
      onHostResourcesClose={() => {
        cancelHost();
        clearPreview();
      }}
      onHostResourcesRead={() => {
        void readHost();
      }}
      hostResourcesReadDisabled={hostPending || !window.hostResources}
      hostResources={
        <section
          aria-label="Host CPU, RAM and application data volume disk space"
          id="host-resources"
        >
          <span role="status">{hostViewStatus} · MAIN_PROCESS không phải toàn bộ Auto</span>
          <small>Đĩa: chỉ volume dữ liệu ứng dụng, không phải tất cả ổ đĩa máy chủ.</small>
          {hostSample ? (
            <small>
              Mẫu {hostSample.sequence} · {hostSample.startedUtc}–{hostSample.endedUtc} UTC ms ·{' '}
              {hostSample.intervalMs} ms
            </small>
          ) : null}
          <div className="stat-grid">
            {HOST_METRICS.map((key) => (
              <div className="stat" key={key} data-host-metric={key}>
                <span>
                  {key === 'availableDisk'
                    ? 'Đĩa dữ liệu ứng dụng còn trống'
                    : key === 'totalDisk'
                      ? 'Tổng dung lượng volume dữ liệu ứng dụng'
                      : key}{' '}
                  · {HOST_METRIC_INFO[key].scope}
                </span>
                <strong>
                  {hostSample?.metrics[key].value ?? '—'} {HOST_METRIC_INFO[key].unit}
                </strong>
                <small>
                  {hostSample?.metrics[key].code ?? 'UNKNOWN'} · {HOST_METRIC_INFO[key].source} ·{' '}
                  {hostViewStatus === 'FRESH' ? 'captured sample' : 'NOT CURRENT'}
                </small>
              </div>
            ))}
          </div>
        </section>
      }
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
          <section aria-label="Explicit ACTIVE input">
            <h3>Input — đích ACTIVE thực tế</h3>
            <p id="input-active">
              ACTIVE: {inputActive?.label ?? 'UNAVAILABLE'} /{' '}
              {inputActive?.deviceId ?? 'không có đích VERIFIED DEVICE'}. Không dùng tập chọn hoặc
              nhóm.
            </p>
            <button
              type="button"
              id="input-get"
              disabled={inputPending}
              onClick={() => void inputAction()}
            >
              Get lịch sử input
            </button>
            {INPUT_ACTIONS.map((action) => (
              <button
                type="button"
                key={action}
                id={`input-${action.toLowerCase()}`}
                disabled={inputBlocked}
                onClick={() => void inputAction(action)}
              >
                {action}
              </button>
            ))}
            <output id="input-status">{inputStatus}</output>
            {inputSnapshot && (
              <p id="input-history">
                Đích gốc {inputSnapshot.deviceId ?? 'NONE'} / {inputSnapshot.action ?? 'NONE'} /{' '}
                {inputSnapshot.receipt?.actor.outcome ?? inputSnapshot.state} /{' '}
                {inputSnapshot.code ?? 'NONE'} —{' '}
                {inputSnapshot.current && !inputReconcile
                  ? 'hiện hành tại thời điểm chụp'
                  : 'lịch sử, không phải quyền hiện hành'}
                ; không chứng minh hiệu ứng Android.
              </p>
            )}
          </section>
          <section aria-label="Device session association" id="association-panel">
            <h3>Liên kết điện thoại đang cầm / Device association</h3>
            <p>
              Đây là xác nhận vật lý của người vận hành, không phải dấu vân tay mật mã hay USB được
              máy chứng nhận. Không tự khởi động, quét, đọc metadata hoặc gửi input.
            </p>
            <button
              type="button"
              id="association-get"
              disabled={associationGetPending}
              onClick={() => {
                void associationAction('get');
              }}
            >
              Get / đối chiếu phiên
            </button>
            <button
              type="button"
              id="association-candidates"
              disabled={associationGetPending}
              onClick={() => {
                void associationAction('candidates');
              }}
            >
              Đọc danh sách ứng viên đã quan sát
            </button>
            <fieldset className="pills">
              <legend>Chọn ứng viên rõ ràng</legend>
              {associationCandidates.map((candidate, index) => (
                <button
                  type="button"
                  className="btn small"
                  key={candidate.candidateId}
                  id={`association-candidate-${candidate.candidateId}`}
                  aria-pressed={associationCandidate === candidate.candidateId}
                  onClick={() => {
                    associationGeneration.current = Object.freeze({});
                    setAssociationCandidate(candidate.candidateId);
                    setAssociationDestination(null);
                    setAssociationReconcile(true);
                    setAssociationStatus(
                      'Đã chọn ngữ cảnh; Get trước Begin. Không có hành động tự động.',
                    );
                  }}
                >
                  {candidate.mode} / ứng viên {index + 1} / {candidate.deviceId ?? 'chưa liên kết'}
                </button>
              ))}
              {associationCandidates.length === 0 ? (
                <p>
                  Chưa có danh sách ứng viên được chụp; không suy luận từ serial hoặc lựa chọn
                  Fleet.
                </p>
              ) : null}
            </fieldset>
            {chosenAssociationCandidate?.mode === 'HISTORICAL' ? (
              <fieldset className="pills">
                <legend>Chọn chính xác hồ sơ lịch sử — không ghép tự động</legend>
                {associationHistorical.map((device) => (
                  <button
                    type="button"
                    className="btn small"
                    key={device.deviceId}
                    id={`association-history-${device.deviceId}`}
                    aria-pressed={associationDestination === device.deviceId}
                    onClick={() => {
                      associationGeneration.current = Object.freeze({});
                      setAssociationDestination(device.deviceId);
                      setAssociationReconcile(true);
                      setAssociationStatus(
                        'Đã chọn hồ sơ lịch sử; Get trước Begin. Phải xác nhận đúng cùng điện thoại trong hộp thoại gốc.',
                      );
                    }}
                  >
                    {fleet?.devices.find((row) => row.deviceId === device.deviceId)?.label ??
                      device.deviceId}{' '}
                    / generation {device.generation}
                  </button>
                ))}
              </fieldset>
            ) : null}
            <button
              type="button"
              id="association-begin"
              disabled={
                associationPending ||
                associationCancelPending ||
                associationReconcile ||
                !associationIdle ||
                !chosenAssociationCandidate ||
                (chosenAssociationCandidate.mode === 'HISTORICAL' && !associationDestination)
              }
              onClick={() => {
                void associationAction('begin');
              }}
            >
              Begin / chụp mốc ban đầu
            </button>
            <button
              type="button"
              id="association-removal"
              disabled={
                associationPending ||
                associationCancelPending ||
                associationReconcile ||
                association?.state !== 'AWAIT_REMOVAL'
              }
              onClick={() => {
                void associationAction('removal');
              }}
            >
              Tôi đã rút cáp — quan sát mất kết nối
            </button>
            <button
              type="button"
              id="association-return"
              disabled={
                associationPending ||
                associationCancelPending ||
                associationReconcile ||
                association?.state !== 'AWAIT_RETURN'
              }
              onClick={() => {
                void associationAction('return');
              }}
            >
              Tôi đã cắm lại cùng điện thoại — quan sát trở lại
            </button>
            <button
              type="button"
              id="association-confirm"
              disabled={
                associationPending ||
                associationCancelPending ||
                associationReconcile ||
                association?.state !== 'AWAIT_CONFIRMATION'
              }
              onClick={() => {
                void associationAction('confirm');
              }}
            >
              Xem và xác nhận trong hộp thoại gốc
            </button>
            <button
              type="button"
              id="association-cancel"
              disabled={
                associationCancelPending ||
                !association?.operationId ||
                ['IDLE', 'COMMITTED', 'CANCELLED', 'CLOSED'].includes(association.state)
              }
              onClick={() => {
                void associationAction('cancel');
              }}
            >
              Hủy phiên liên kết
            </button>
            <p id="association-status" aria-live="polite">
              {associationStatus}
            </p>
            {association?.receipt ? (
              <p id="association-receipt">
                Biên nhận đã ghi: {association.receipt.stage} / {association.receipt.outcome} /{' '}
                {association.receipt.code} / revision {association.receipt.revision ?? 'không có'}.{' '}
                {associationReconcile || !association.projectionCurrent
                  ? 'Lịch sử, không phải quyền hiện hành.'
                  : 'Quan sát được chụp, không giám sát liên tục.'}
              </p>
            ) : null}
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
