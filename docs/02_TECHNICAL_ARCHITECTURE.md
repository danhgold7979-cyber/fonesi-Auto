# Technical Architecture

**Revision:** 0.3-draft · **Date:** 2026-10-30
**Design principle:** clean slate; no source-code reuse from fonesi-W.

## 1. Selected stack direction and untested implementation details

**Status: accepted direction, unverified implementation.** [accepted product decisions C-01–C-22](16_ACCEPTED_PRODUCT_DECISIONS.md#1-accepted-checklist) select Electron + strict TypeScript + React, SQLite, Windows-backed secret storage, isolated Python, ADB-only input, scrcpy video-only, UI Automator first and OpenCV + PaddleOCR CPU-first fallback (C-05/C-06/C-14). Exact versions, models, bindings, process/package layout and compatibility remain subject to feasibility/ADR/Phase gates. An incompatibility requires a recorded decision, not a silent stack swap. Media-probing/testing tools below remain implementation candidates. This is not production-coding authorization.

| Layer | Selected direction / candidate detail | Responsibility |
|---|---|---|
| Desktop shell | Electron | Windows app lifecycle, windowing, secure IPC |
| UI | React + strict TypeScript + existing V9 layout/CSS direction (C-05) | Preserve V9 layout and interactions |
| Domain/application | TypeScript | Device registry, jobs, workflows, scheduling, reports and resource policy |
| Device transport | Android Platform Tools / ADB | USB/Wi-Fi transport and low-level device commands |
| Semantic UI | UI Automator | UI hierarchy, element selection and cross-app state inspection |
| Screen streaming | scrcpy (video-only in wall) | Low-latency screen mirroring; no competing input control |
| Image processing | OpenCV | Crop, resize, threshold, template matching and image comparison |
| OCR | PaddleOCR selected direction; model/version unpinned | Read visible text; benchmark Vietnamese/English |
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
- Always address a device by exact serial/transport ID; never issue unscoped commands, even with only one device currently connected. Bind the command to the registry device ID and current generation so reconnect/transport replacement cannot redirect queued input.
- Distinguish USB, paired Wireless Debugging, connected TCP and unauthorized/offline states.
- USB acceptance is first (C-17); Wireless Debugging remains disabled until dedicated authenticated pairing/reconnect tests pass. Pairing/connection are explicit operations; do not expose an unauthenticated open ADB port.
- Every command has timeout, cancellation, stdout/stderr capture, exit code and correlation ID.
- Input commands are serialized per device. Whole-workflow ownership also prevents manual inputs, APK mutation and proxy changes from interleaving between workflow steps. Refuse conflicts or require explicit safe pause/takeover after possible effects are drained/reconciled; invalidate UI/account evidence before resuming. The ownership behavior is accepted by C-04; detailed lock/fencing mechanics remain subject to ADR-0004 and Phase tests.
- ADB shell text input is not assumed to support all Unicode. C-08 requires exact Vietnamese/English/emoji round-trip before posting; unsupported/corrupted text blocks the job. Any helper installation/permissions need separate approval; never silently corrupt text or use uncontrolled keyboard/clipboard access.

### 2.5 UI Automator adapter
- Use AndroidX UI Automator as the semantic cross-app inspection/action layer.
- UI Automator 2.4 was an alpha candidate in the original reference notes, not a verified current-version claim or version pin. The Phase 0 spike must check official release status and select a supported release from dated evidence.
- Evaluate two modes:
  1. Read-only UI hierarchy extraction via Android's uiautomator dump, followed by XML parsing in the host.
  2. Instrumentation runner/test APK using UI Automator APIs for semantic element search, waits, clicks and scrolls.
- The first mode is simpler for initial inspection; the second may be more robust for state-aware actions but requires installation and maintenance of a test runner on each supported device.
- Selectors should prioritize resource ID, content description, visible text, class and bounds. Coordinates are a fallback only.
- If the hierarchy is absent, stale or ambiguous, do not click based on a guessed selector.

### 2.6 OpenCV + OCR adapter
- OpenCV performs image normalization, crop/ROI, scale correction, thresholding, edge/shape detection and template matching.
- PaddleOCR is the selected OCR direction (C-06), CPU-first. Benchmark eligible model versions for Vietnamese and English using real screenshots; no model/version or threshold is assumed certified.
- Every OCR result includes text, bounding box, confidence, model version, language, screenshot ID and timestamp.
- OCR is fallback/confirmation, not a substitute for semantic UI state when reliable hierarchy data exists.
- Confidence thresholds are calibrated on a labeled test set. Low confidence blocks the action.

### 2.7 Python Vision Worker
- Separate process with versioned JSON/binary IPC.
- Input: screenshot bytes, device dimensions, locale, task type and optional region of interest.
- Output: structured detections with bounding boxes, text, confidence, model version and elapsed time.
- Worker is restartable and resource-limited.
- Python must not invoke ADB input or compete with Device Host. It only returns recognition results.
- Start CPU-first; optional GPU acceleration is a later benchmark decision.

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

### 2.9 Screen streaming
- ADB screenshot polling is acceptable for diagnostics but not a good default for a live multi-device wall.
- scrcpy video-only is selected by C-06. Its pinned version, integration, Windows packaging, licensing and resource limits still require the recorded feasibility evidence.
- In the screen wall, scrcpy should be video-only; Device Host remains the single input authority.
- If interactive mouse control is required, translate the pointer position into device coordinates and send through the serialized Device Host actor.
- Stream profiles: focused/high quality, selected devices/medium quality, all devices/low frame rate or paused.
- Apply bounded backpressure. Auto mode may pause hidden/offscreen previews; Manual policy-driven pauses require explicit opt-in under accepted DEC-019. A backend failure or lower delivered FPS is reported as degraded effective output, not disguised as an authorized policy change.

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

Each service requires typed input/output contracts and unit tests. No UI component directly calls shell commands.

### 3.1 Typed IPC boundary contract — PROPOSED

Approval: detailed wire/schema mechanics in [ADR-0004](decisions/ADR-0004-runtime-data-contracts.md) and the Phase 1 plan require review before implementation (P1-02); accepted product directions are not an accepted wire format.

- Versioned allowlisted methods/events with runtime schema validation at every process boundary; TypeScript types alone do not validate renderer or worker input.
- Request envelope: protocol version, request/correlation ID, operation, deadline, cancellation ID and typed payload. Device-bound work additionally carries registry device ID, generation and exact transport binding; lease-protected work carries owner/fencing token. Mutations carry expected entity revision where relevant.
- Response envelope: same request ID, typed result or structured error code, retry classification and outcome certainty. A transport timeout is not evidence that a side effect did not occur.
- Reject unknown methods, unsupported versions, oversized/malformed payloads, stale generations/revisions, invalid file references and expired deadlines before side effects. Limits and compatible version policy are measured/approved in the Phase plan, not arbitrary defaults here.
- Main/Device Host resolves allowlisted operation arguments; renderer cannot pass raw shell/ADB commands, executable paths, secret values or unvalidated filesystem paths. Files use validated source/asset handles and process launch uses argument arrays, never shell string interpolation.
- Vision IPC binds screenshot ID, capture generation, dimensions/rotation, locale, ROI and model version; stale/mismatched/low-confidence results cannot authorize input. Python returns detections only and has no device-input authority.
- Bound pending requests/bytes per caller, apply backpressure and propagate cancellation. Cancellation stops undispatched work; once dispatched, return a known outcome or UNKNOWN/NEEDS_RECONCILIATION, never retroactively claim no effect.
- Event streams carry sequence/revision and support resync after a gap; UI discards older revisions. Secrets/evidence are represented by scoped references and redacted diagnostics.
- Verification: malformed/unknown method tests, stale-generation replay, late response after cancellation, worker restart, wrong-device binding, payload-limit/backpressure and malicious path/command injection negatives; renderer must have no successful process-spawn path.


## 4. Persistence and security

- SQLite database with schema migrations, WAL mode and transactional writes.
- Unique IDs for devices, accounts, targets, media, schedules, jobs and effects.
- Foreign keys enabled; deletion policies explicit.
- Secrets are stored in Windows Credential Manager/DPAPI. Database stores references only.
- Redact tokens, passwords, proxy credentials and personal data from logs.
- C-13/C-22 require encrypted local backups in a user-chosen folder, seven validated ordinary copies, at most one automatic daily backup while running, manual backup and a verified backup before migration. Keep the pre-migration safety copy until upgrade acceptance; failed backup cannot overwrite a known-good copy or permit dependent migration. No automatic cloud upload.
- Keep an audit trail for configuration changes and external side effects.
- C-13/C-21 set capture/UI/OCR diagnostics to 7 days and technical logs to 30 days; job/derived metric history remains until user cleanup. UNKNOWN recovery evidence and necessary reconciliation/idempotency records override routine expiry. Cleanup targets only tool-owned staged media after verified completion, never originals/unrelated phone files.
- C-14 restore starts in dispatch quarantine until post-snapshot effects are reconciled; same-machine and cross-machine secret/key recovery require tested proof. Restoring a local NOT_DISPATCHED record never proves no post-snapshot external action happened.

## 5. Scheduling and concurrency

- One foreground input actor per phone.
- One active publishing session per verified global account identity across all devices managed by the local scheduler. Per-device account/session IDs are not the lease key. The proposed durable identity/lease/fencing contract is [Data §§2.1–2.3](03_DATA_AND_WORKFLOWS.md#21-identity-and-device-generation-contract--proposed). Read-only exceptions require separate tests; there is no distributed multi-host lease claim.
- Scheduler persists intended local time, IANA timezone, timezone database/policy revision and resolved UTC execution time. [Data §2.6](03_DATA_AND_WORKFLOWS.md#26-schedule-time-and-occurrence-contract--proposed) defines the accepted C-10/C-11/C-18/C-19 scheduling semantics and proposed implementation mechanics: QUEUE default, downtime REVIEW, Asia/Ho_Chi_Minh default, DST gap SKIP/earlier overlap once, bounded same-day AUTO_SHIFT and explicit complete row override. DEC-020 remains warning-only; device/account mutual exclusion still applies.
- Queue priority is deterministic; aging prevents starvation.
- A job never retries an uncertain publish automatically.
- Vision requests are queued separately and may be parallelized subject to CPU/RAM budgets.
- Device registry is unbounded by product policy; streams and workers are bounded by measured resources.

## 6. Host Resource & Stream Manager

### 6.1 Real-time telemetry
Collect host metrics through a Windows-specific telemetry adapter:
- CPU total and per-core utilization, process CPU and load trend.
- Physical RAM total, available, committed and Fonesi-Auto process working set.
- GPU engine utilization and dedicated/shared GPU memory when the driver exposes reliable counters.
- Disk free space and I/O pressure for the app/data volume.
- Network throughput and ADB transport status.
- Number of connected devices, active streams, actual delivered FPS, stream queue/backpressure and Python worker queue depth.

Each metric carries value, unit, sampled_at, source, availability and confidence. Poll at a configurable interval (initial target 1–2 seconds); use smoothing for display while retaining raw samples for alert decisions. Do not present unsupported GPU telemetry as 0%.

### 6.2 User controls
- Candidate FPS UI presets include 5–60 FPS (the detailed hardware proposal also considers 1 FPS). Neither range is a universal guarantee or an approved fixed range. Expose only the intersection of pinned backend/device capability and validated host benchmark limits; display delivered FPS independently.
- Stream resolution cap: source/native, 1080p, 720p, 480p and lower adaptive profiles where supported.
- Image quality/bitrate: user-facing quality slider mapped to encoder bitrate/quality parameters supported by the pinned stream implementation.
- Per-device stream enable/pause.
- Apply scope: all devices, selected devices, or one device.
- Global defaults with per-device overrides.
- Auto mode and Manual mode.
- Presets: Eco, Balanced, Smooth, Custom. Preset values are recommendations derived from benchmark profiles, not fixed guarantees.

### 6.3 Resource policy engine
- Estimate stream cost from measured device resolution, FPS, bitrate, decoder load and recent host telemetry.
- Start with conservative profiles; increase quality gradually only when headroom is stable.
- Use configurable warning and critical thresholds, rolling windows, hysteresis and cooldown.
- Show the cause of warnings (e.g. CPU sustained high, RAM headroom low, GPU decoder saturated, stream backlog, disk nearly full).
- At warning level, recommend a specific lower setting and show estimated benefit when measurable.
- In Auto mode, critical pressure reduces non-focused preview FPS/quality/resolution, pauses hidden previews and defers nonessential OCR. In Manual mode, policy-driven preview degradation is permitted only after explicit opt-in under accepted DEC-019. Preserve active ADB workflow execution and durable job state in both modes.
- Never kill an active device actor or silently cancel a workflow to save stream resources.
- **Accepted DEC-019 (2026-10-30):** Manual emergency throttle is OFF by default and requires explicit user opt-in, with visible/audited temporary effective changes and independent stable-recovery restoration choice. This resolves the earlier unconditional degradation wording. Reject unsafe new increases at measured hard limits; without opt-in, do not programmatically throttle existing Manual previews. Observed backend degradation/failure is reported, not silently converted into new requested settings.
- Avoid alert flapping by requiring sustained threshold crossing and recovery headroom before clearing alerts.

### 6.4 Separation of control planes
- Stream quality controls affect video preview only.
- Device input commands remain owned by the serialized Device Actor.
- Workflow execution is scheduled separately from stream decoding.
- Vision worker concurrency has its own resource budget.
- Lowering or pausing a screen preview must not change the phone's actual display resolution or workflow state unless a separate explicit device setting is requested.

## 7. Failure model

Every step returns one of:
- SUCCESS_VERIFIED
- FAILED_KNOWN
- BLOCKED_PRECONDITION
- RETRYABLE
- UNKNOWN_EXTERNAL_EFFECT
- CANCELLED
- NEEDS_RECONCILIATION

Unknown screen, unexpected dialog, account mismatch, stale screenshot, low OCR confidence or lost ADB connection must stop the current workflow safely.

## 8. Remaining technical gates, not reopened product choices

- Electron + strict TypeScript + React and SQLite direction is accepted (C-05). Pin compatible runtime/dependency versions and bindings with packaging/security/V9 tests; do not reopen shell/framework selection unless evidence demonstrates incompatibility.
- UI Automator stable version and instrumentation deployment model.
- scrcpy version, video-only integration method, license notice and Windows binary packaging.
- PaddleOCR model and Python runtime bundling size.
- SQLite access library and migration tool.
- Validate the current Windows host first; publish only measured host/Android support and resource envelopes (C-07/C-15). At least two physical devices prove isolation; two AVD profiles, initially one running, supplement rather than replace device evidence.

- Manual emergency throttle OFF/explicit opt-in is accepted (DEC-019). Restore requires separate explicit enablement; numerical recovery windows and detailed implementation require Phase evidence/review.
- Schedule semantics are accepted by C-10/C-11/C-18/C-19 and DEC-020. Detailed deterministic generation/storage/IPC mechanics still need ADR/Phase review and fixtures; do not offer different DST/overdue defaults as unresolved preferences.
- Global identity, lease/fencing and effect journal recovery contract: [Data §§2.1–2.3](03_DATA_AND_WORKFLOWS.md#21-identity-and-device-generation-contract--proposed); migrations may not be inferred from this draft.

## Change History

- 2026-10-30 — 0.2-draft: separated confirmed technology direction from proposed stack; clarified typed IPC, global identity/leases, generation and scheduler contracts; applied accepted DEC-019/DEC-020 and made candidate FPS bounds capability-derived; corrected duplicate section numbering. Runtime/hardware verification remains outstanding.

- 2026-10-30 — 0.3-draft: applied C-04–C-17/C-22 accepted stack, ownership, provisioning, scheduling, support, retention and backup direction; preserved untested version/wire/schema/benchmark gates and restore quarantine. Earlier candidate choices in 0.2 history are superseded by docs16, not silently treated as previously approved.
