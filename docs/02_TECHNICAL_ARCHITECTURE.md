# Technical Architecture

**Revision:** 0.1-draft  
**Design principle:** clean slate; no source-code reuse from fonesi-W.

## 1. Recommended stack

| Layer | Proposed technology | Responsibility |
|---|---|---|
| Desktop shell | Electron | Windows app lifecycle, windowing, secure IPC |
| UI | TypeScript + HTML/CSS (framework decision in Phase 0) | Preserve V9 layout and interactions |
| Domain/application | TypeScript | Device registry, jobs, workflows, scheduling, reports and resource policy |
| Device transport | Android Platform Tools / ADB | USB/Wi-Fi transport and low-level device commands |
| Semantic UI | UI Automator | UI hierarchy, element selection and cross-app state inspection |
| Screen streaming | scrcpy (video-only in wall) | Low-latency screen mirroring; no competing input control |
| Image processing | OpenCV | Crop, resize, threshold, template matching and image comparison |
| OCR | PaddleOCR candidate model | Read visible text; benchmark Vietnamese/English |
| Vision worker | Python sidecar | Isolated OCR/vision pipeline over local IPC |
| Database | SQLite | Local durable state, migrations, transactions, job ledger |
| Secrets | Windows Credential Manager / DPAPI | Proxy credentials and sensitive local secrets |
| Media probing | ffprobe/FFmpeg | Validate image/video metadata and duration |
| Testing | Vitest/Playwright + Android hardware tests | Unit, UI, integration and device acceptance |

Pin exact versions only after Phase 0 compatibility and licensing review. Do not blindly use alpha dependencies in production.

## 2. Process model

### 2.1 Desktop main process
- Owns application lifecycle and secure IPC.
- Starts/stops Device Host and Python Vision Worker.
- Owns SQLite migrations and secret-store access.
- Enforces job scheduling, device/account leases, permission checks and stream resource policy.

### 2.2 Renderer
- Implements the V9 interface.
- Cannot execute arbitrary shell commands.
- Calls typed IPC methods only.
- Never receives long-lived secret values.
- Displays observed state separately from configured/desired state.

### 2.3 Device Host
- Owns ADB server/client process and device transport registry.
- Maintains one serialized actor/command queue per device.
- Owns screenshots, input commands, package inventory and device state.
- Coordinates account-level locks with the scheduler.
- Emits structured events; does not render UI.

### 2.4 ADB adapter
- Pin a known Android Platform Tools version in the packaged app.
- Always address a device by exact serial/transport ID; never issue unscoped commands when more than one device is connected.
- Distinguish USB, paired Wireless Debugging, connected TCP and unauthorized/offline states.
- Pairing and connection are explicit operations; do not expose an unauthenticated open ADB port.
- Every command has timeout, cancellation, stdout/stderr capture, exit code and correlation ID.
- Input commands are serialized per device.
- ADB shell text input is not assumed to support all Unicode. Unicode/emoji must be validated with a dedicated, tested input method; never silently corrupt caption text.

### 2.5 UI Automator adapter
- Use AndroidX UI Automator as the semantic cross-app inspection/action layer.
- Modern UI Automator 2.4 is documented as a new Kotlin-friendly API but currently alpha in the referenced docs; select a stable release after a spike, not by assumption.
- Evaluate two modes:
  1. Read-only UI hierarchy extraction via Android's uiautomator dump, followed by XML parsing in the host.
  2. Instrumentation runner/test APK using UI Automator APIs for semantic element search, waits, clicks and scrolls.
- The first mode is simpler for initial inspection; the second may be more robust for state-aware actions but requires installation and maintenance of a test runner on each supported device.
- Selectors should prioritize resource ID, content description, visible text, class and bounds. Coordinates are a fallback only.
- If the hierarchy is absent, stale or ambiguous, do not click based on a guessed selector.

### 2.6 OpenCV + OCR adapter
- OpenCV performs image normalization, crop/ROI, scale correction, thresholding, edge/shape detection and template matching.
- PaddleOCR is the candidate OCR engine. Benchmark current PP-OCR model versions for Vietnamese and English using real screenshots.
- Every OCR result includes text, bounding box, confidence, model version, language, screenshot ID and timestamp.
- OCR is fallback/confirmation, not a substitute for semantic UI state when reliable hierarchy data exists.
- Confidence thresholds are calibrated on a labeled test set. Low confidence blocks the action.

### 2.7 Python Vision Worker

### 2.8 Host Hardware & Resource Manager
- A dedicated HostResourceMonitor samples Windows host capabilities and live resource usage.
- Detect CPU model/logical processors, total/available RAM, Fonesi-Auto process memory, GPU adapters and supported utilization/memory counters, disk free space and optional temperature/USB metrics when exposed.
- Every metric carries value, unit, source, availability state, sample timestamp and staleness information.
- GPU metrics are adapter/driver-dependent; do not require NVIDIA hardware. Use supported Windows counters/APIs as baseline and optional vendor APIs only as adapters.
- Missing counters are UNKNOWN/Not available, never zero.
- ResourcePolicyEngine calculates recommended stream budgets from measured host/device benchmarks, current load, stream profiles and user-selected priority.
- Expose Auto and Manual modes, FPS, resolution/scale, bitrate/quality, concurrent stream limit, global defaults and per-device overrides.
- Persist requested settings separately from effective settings and recommendations. Report every temporary throttle and restoration.
- Apply hysteresis and recovery windows to avoid oscillation. Alert thresholds are calibrated in Phase 0/3, not assumed universal constants.
- Resource monitoring must be lightweight and must not block Device Host input queues or workflow execution.


- Separate process with versioned JSON/binary IPC.
- Input: screenshot bytes, device dimensions, locale, task type and optional region of interest.
- Output: structured detections with bounding boxes, text, confidence, model version and elapsed time.
- Worker is restartable and resource-limited.
- Python must not invoke ADB input or compete with Device Host. It only returns recognition results.
- Start CPU-first; optional GPU acceleration is a later benchmark decision.

### 2.9 Screen streaming
- ADB screenshot polling is acceptable for diagnostics but not a good default for a live multi-device wall.
- Use scrcpy as a supporting stream process after a Windows packaging/licensing/resource spike.
- In the screen wall, scrcpy should be video-only; Device Host remains the single input authority.
- If interactive mouse control is required, translate the pointer position into device coordinates and send through the serialized Device Host actor.
- Stream profiles: focused/high quality, selected devices/medium quality, all devices/low frame rate or paused.
- Apply backpressure and stop decoding hidden/offscreen devices when appropriate.

## 3. Domain services

- DeviceFleetService
- DeviceActorService
- ScreenStreamService
- HostResourceMonitor / ResourcePolicyEngine
- UiInspectionService
- VisionRecognitionService
- AccountRegistryService
- TargetRegistryService
- AppInventoryService
- MediaLibraryService
- ContentImportExportService
- WorkflowCatalogService
- WorkflowExecutionService
- SchedulerService
- QueueCoordinator
- EffectJournalService
- TrackingService
- ProxyService
- AuditLogService
- BackupRecoveryService

Each service has typed input/output contracts and unit tests. No UI component directly calls shell commands.

## 4. Persistence and security

- SQLite database with schema migrations, WAL mode and transactional writes.
- Unique IDs for devices, accounts, targets, media, schedules, jobs and effects.
- Foreign keys enabled; deletion policies explicit.
- Secrets are stored in Windows Credential Manager/DPAPI. Database stores references only.
- Redact tokens, passwords, proxy credentials and personal data from logs.
- Encrypt exported backups if they contain account/device-sensitive data.
- Keep an audit trail for configuration changes and external side effects.
- Define retention and deletion rules for screenshots, OCR output and logs.

## 5. Scheduling and concurrency

- One foreground input actor per phone.
- One active publishing session per account globally unless an explicitly tested safe read-only operation is allowed.
- Scheduler persists intended UTC execution time and the IANA timezone used to derive it.
- Queue priority is deterministic; aging prevents starvation.
- A job never retries an uncertain publish automatically.
- Vision requests are queued separately and may be parallelized subject to CPU/RAM budgets.
- Device registry is unbounded by product policy; streams and workers are bounded by measured resources.

## 6. Failure model

Every step returns one of:
- SUCCESS_VERIFIED
- FAILED_KNOWN
- BLOCKED_PRECONDITION
- RETRYABLE
- UNKNOWN_EXTERNAL_EFFECT
- CANCELLED
- NEEDS_RECONCILIATION

Unknown screen, unexpected dialog, account mismatch, stale screenshot, low OCR confidence or lost ADB connection must stop the current workflow safely.

## 7. Architecture decisions still open

- Electron vs Tauri. Recommendation: Electron for V9 HTML/TypeScript reuse at the UI-artifact level, not source-code reuse.
- UI framework: plain TypeScript/React/Vue. Choose one after measuring V9 integration and maintainability.
- UI Automator stable version and instrumentation deployment model.
- scrcpy version, video-only integration method, license notice and Windows binary packaging.
- PaddleOCR model and Python runtime bundling size.
- SQLite access library and migration tool.
- Windows minimum version and supported CPU/RAM envelope.
