# Master Implementation Plan

**Revision:** 0.3-review · **Date:** 2026-10-30
**Repository:** fonesi-Auto · **Documentation review branch:** plan
**Implementation state:** Phase 0 feasibility IN_PROGRESS; production application NOT_STARTED. This revision is a documentation proposal, not Phase acceptance or production authorization.

This plan is intentionally written from zero. It does not inherit the source tree, code, contracts, schema or execution plan of fonesi-W.

## 1. Overall execution model

Work is divided into strictly sequential, gated phases: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Each predecessor must be **accepted by the user and merged**; then the next detailed Phase Plan requires separate approval. Technical independence does not authorize parallel phases. A phase is complete only with its exit evidence and user acceptance, never screenshots/mock data alone.

Task IDs in this document identify roadmap work, not completion. [Traceability](14_REQUIREMENTS_TRACEABILITY.md) maps requirements, tests and historical IDs. The approved [Phase 0 plan](phases/PHASE-00-feasibility.md) owns execution IDs P0-01…P0-10; this master uses **G0-01…G0-19** for Phase 0 gates to avoid their former naming collision. Do not renumber or rewrite approved execution history. Future Phase task plans must reference the stable P1…P11 IDs below; new scope/acceptance in an approved plan requires an approved amendment.

**Current evidence boundary (2026-10-30):** Phase 0 has four IN_PROGRESS and six NOT_STARTED execution tasks; its exit checklist is unaccepted. There is no production app or runnable application CI yet. Existing device evidence is partial, not end-to-end certification. [PHASE_STATUS](PHASE_STATUS.md) is the status authority.

**Accepted directions:** [C-01…C-22](16_ACCEPTED_PRODUCT_DECISIONS.md), DEC-019 and DEC-020 are settled product choices. G0 gates now close their remaining implementation/version/permission/evidence questions; no gate passes merely because its direction is accepted. The approved physical acceptance and proposed amendment boundaries remain unchanged.

### Global rules
- V9 is the approved UI baseline. Implement it faithfully; redesign only after explicit approval.
- Use fixed workflows, not a user-editable node graph.
- ADB is the device transport/control plane.
- UI Automator is the semantic inspection/action layer.
- OpenCV + OCR is the visual fallback.
- Python Vision Worker is isolated and never issues competing ADB input.
- scrcpy is the accepted video-only stream direction; version/codec/license/compatibility still require feasibility proof. Device Host owns all input.
- No API-based social posting in this project unless the user explicitly changes the technology decision.
- No bypass of CAPTCHA, checkpoint, 2FA, rate limits, anti-abuse or platform access controls.
- Unsupported workflows remain disabled; no silent manual fallback.

## 2. Phase 0 — Product, policy and feasibility gates

**Purpose:** Resolve the issues that could invalidate the architecture before application coding.

**Execution contract**
- **Entry:** Approved feasibility plan only; retain P0-01…10 history and amendments.
- **Deliverables:** Host/device inventory; lab lifecycle, policy/capability matrix, measured spike reports and approved ADRs.
- **Verification/evidence:** T-00 feasibility matrix and T-02 physical isolation; P0-10 review covers every G0 gate. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Gate evidence→approved decisions→P0-10 acceptance; no production runtime.
- **Acceptance gate:** AC-00 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks (gate IDs; execution crosswalk in [§2 of traceability](14_REQUIREMENTS_TRACEABILITY.md#2-phase-0-gate-to-approved-execution-crosswalk)):
- G0-01 Validate the current Windows host first, install privileges and CPU/RAM/GPU/storage constraints; publish only empirically tested support (C-07).
- G0-02 Record actual physical Android manufacturers/versions/screens/locales/drivers and test identities; at least two physical devices prove isolation, and AVD evidence never replaces physical acceptance (C-07).
- G0-03 Implement the accepted two-AVD lab direction, initially one running; measure before concurrent operation and approve the actual fleet/stream benchmark target (C-07).
- G0-04 Record USB-first acceptance and Wireless Debugging disabled until dedicated authenticated pairing/reconnect/security tests pass (C-17); no unauthenticated ADB exposure.
- G0-05 Record dated authoritative policy/permission review for ADB-driven Facebook access, automation, data collection and engagement; technical capability is not permission.
- G0-06 Record per-action ALLOWED/BLOCKED/DEFERRED/NEEDS_REVIEW outcomes and authorization evidence; unresolved actions remain disabled.
- G0-07 Record accepted owned/administered Page photo/album/video/Reels pilot scope, separate Story certification and disabled Profile/Group/reaction/share/other-network scope; obtain per-capability evidence rather than re-asking the product choice (C-01/02).
- G0-08 Apply accepted owned/administered scope; obtain actual pilot authorization, permitted sources, content/audience/volume/stop conditions and initial user login/authorization plan (C-02/03). Login alone is not ownership or policy proof.
- G0-09 Compare UI Automator hierarchy dump and instrumentation on supported physical devices and AVDs; record version/deployment choice and selector-driven read-back.
- G0-10 Benchmark video-only scrcpy integration on Windows, codec/firmware failures, version/license/packaging and multi-device resource cost.
- G0-11 Benchmark the accepted OpenCV + PaddleOCR CPU-first direction on labeled Vietnamese/English screenshots: model/version accuracy, latency, memory, package size and safe confidence thresholds (C-06).
- G0-12 Validate selected Electron + strict TypeScript + React, SQLite and isolated Python direction (C-05); choose compatible versions/bindings/migration tooling with evidence. Incompatibility returns for a decision, not silent stack substitution.
- G0-13 Translate accepted privacy/retention/cleanup/encrypted-backup/secret-reference rules (C-13/14/21/22) into reviewed threat/restore/key-handling contracts; prove mechanisms, not reopen settled cadence or duration choices.
- G0-14 Record proposed/accepted ADRs with evidence, alternatives, approval and supersession links; review domain/schema/IPC contracts before migrations.
- G0-15 Validate the current host first; derive minimum/recommended/high profiles only from measured Windows machines. C-07 permits only tested support, not extrapolation from one PC.
- G0-16 Validate timestamped CPU/RAM/GPU/disk/network telemetry, counter source/availability/freshness and adapter/driver gaps; missing counters are UNKNOWN, not zero.
- G0-17 Benchmark increasing stream counts, FPS/resolution/bitrate/codec profiles, focused/background mixes and concurrent vision; derive per-host safe envelopes.
- G0-18 Apply accepted Auto/Manual, global/selected/per-device scopes and DEC-019 Manual emergency OFF/opt-in direction; prove override behavior and approve measured ranges, warning/critical thresholds, hysteresis/cooldown and restoration profile. Numeric policy remains OPEN (C-15).
- G0-19 Measure monitoring overhead and ADB input latency under stream/vision load; prove resource policy preserves input ownership and workflow integrity.

Exit criteria:
- No unresolved blocker affecting the next phase’s approved scope or core architecture. Deferral requires a user decision, disabled capability/support restriction, owner and revisit condition; it never implies a test passed.
- ADB + UI Automator + Vision pipeline proven on at least one physical Android device.
- Policy gate has written outcome per Facebook workflow; unsupported actions are disabled.
- Host profiles and stream concurrency targets are backed by multiple-host benchmarks, or explicitly restricted/deferred by user approval without claiming untested support.
- Realtime telemetry support/limitations and sensor availability are documented.
- Auto/Manual settings and emergency protection behavior are approved; all 19 G0 gates have evidence or explicit approved deferral mapped through P0-10. The physical-device smoke test remains mandatory under the current approval.

**No product code before Phase 0 exit.** Planning documents, test scripts and throwaway feasibility prototypes may be used only to answer Phase 0 questions; they are not production implementation.

## 3. Phase 1 — Repository and desktop foundation

**Execution contract**
- **Entry:** Phase 0 accepted/merged; accepted C-05 stack versions/support/schema/privacy mechanisms proved and UI baseline retained.
- **Deliverables:** Secure runnable Windows shell, typed contracts, migrations/secrets adapter, V9 shell, package/test/CI skeleton.
- **Verification/evidence:** T-01 foundation, T-12 UI parity; validate actual clean Windows build, migration/restore and IPC denial. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Versioned IPC/domain/schema and test harness consumed by Phase 2.
- **Acceptance gate:** AC-01 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P1-01 Establish clean folder/package architecture.
- P1-02 Add Electron main/React renderer/preload boundaries with strict TypeScript and secure validated IPC; pin versions only after compatibility proof (C-05).
- P1-03 Add TypeScript strict mode, lint, formatter and unit-test harness.
- P1-04 Add structured logging, correlation IDs and redaction.
- P1-05 Add SQLite transactional migrations, WAL/foreign keys and encrypted backup/restore tests; verified pre-migration backup is mandatory. Implement manual/at-most-daily backups and seven validated ordinary copies without deleting known-good copies on failure (C-22).
- P1-06 Add Windows secret-store abstraction.
- P1-07 Implement app settings, theme persistence and crash recovery.
- P1-08 Integrate V9 UI layout/navigation and Dark/Light persistence without redesign; cover loading, empty, blocked, failure and real-data states.
- P1-09 Add mock-data boundary so demo data can never be mistaken for production state.
- P1-10 Add CI for typecheck, lint, unit tests and packaging smoke test.
- P1-11 Define versioned domain/IPC contracts, schema invariants/deletion rules, compatibility checks and threat model before dependent services write durable state.

Exit criteria:
- Windows app launches, V9 layout renders and navigates.
- Renderer cannot spawn arbitrary processes or access secrets.
- Database migration/backup/restore tests pass.
- No platform automation feature is enabled yet.

## 4. Phase 2 — ADB and device fleet

**Execution contract**
- **Entry:** Phase 1 accepted/merged; approved device/transport matrix and Unicode mechanism.
- **Deliverables:** Pinned ADB host, durable identity/transport registry, serialized actor and device controls.
- **Verification/evidence:** T-02 two-physical-device isolation, reconnect/server restart and Unicode round-trip; mocks are insufficient. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Transport-generation/cancellation/evidence contracts consumed by streams and recognition.
- **Acceptance gate:** AC-02 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P2-01 Bundle/pin Android Platform Tools.
- P2-02 Build ADB server lifecycle manager.
- P2-03 Discover devices by serial and transport.
- P2-04 Model USB, paired Wi-Fi and connected TCP transports.
- P2-05 Handle unauthorized/offline/conflict states and reconnect.
- P2-06 Capture model, manufacturer, Android version, SDK, locale, resolution, density and battery/storage.
- P2-07 Implement one serialized actor per device.
- P2-08 Add tap/swipe/key/home/back/text operations with timeouts and cancellation.
- P2-09 Add screenshot and UI hierarchy capture.
- P2-10 Add device selection, active target and group selection semantics.
- P2-11 Add per-device logs and diagnostics.
- P2-12 Test disconnect/reconnect during command and during queued work.
- P2-13 Implement approved Unicode input/transfer path through the sole Device Actor; round-trip Vietnamese, English, emoji, punctuation and multiline text without credential collection.

Exit criteria:
- Two or more physical devices can be scanned and controlled without cross-device command leakage.
- Every command is addressed by exact device serial/ID.
- Per-device command serialization is proven under load.
- Disconnects do not leave jobs falsely successful.

## 5. Phase 3 — Screen wall and scrcpy

**Execution contract**
- **Entry:** Phase 2 accepted/merged; scrcpy/telemetry decisions, safety behavior and measured budgets resolved.
- **Deliverables:** V9 video-only screen wall, resource policy, stream preferences/calibration, auditable degradation.
- **Verification/evidence:** T-03 load/overload/sensor failures and T-12 zoom/focus/scroll; measure latency while actor load continues. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Calibrated stream/vision budgets; actor remains sole input authority.
- **Acceptance gate:** AC-03 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P3-01 Pin a verified scrcpy version and license notices.
- P3-02 Build stream process manager per device.
- P3-03 Add focused/high, selected/medium and wall/low resource profiles.
- P3-04 Render frames in V9 device tiles.
- P3-05 Implement Ctrl+wheel whole-tile zoom.
- P3-06 Implement inside-phone scroll vs outside-wall scroll.
- P3-07 Implement fit-to-panel, selected-only, all-devices and double-click focus.
- P3-08 Route pointer/key input only through Device Host actor.
- P3-09 Add stream backpressure, pause hidden devices and restart failed streams.
- P3-10 Benchmark CPU, RAM, GPU, USB bandwidth and latency across increasing device counts.
- P3-11 Add HostResourceMonitor with CPU/RAM/GPU/disk/network, process/vision/stream telemetry, timestamps/source/units/freshness, counter availability and bounded sampling.
- P3-12 Add the Stream / Performance popover to the existing V9 right-side device monitor.
- P3-13 Add user FPS slider/effective-FPS display, resolution/scale cap, bitrate/quality and concurrent-stream controls bounded by device/backend/host capability.
- P3-14 Add Auto/Manual modes, Eco/Balanced/Smooth/Custom presets, global defaults, visible per-device overrides/reset and selected-device batch apply with explicit scope.
- P3-15 Show requested/effective/recommended settings and GREEN/AMBER/RED/UNKNOWN status; warnings show cause, affected devices, recommendation and estimated impact only when measured.
- P3-16 Add explicitly enabled emergency preview throttling and optional restoration, with audited requested/effective settings, sustained windows, hysteresis, cooldown and gradual recovery. Manual emergency throttle defaults OFF and requires opt-in (DEC-019).
- P3-17 Add host-budget calibration, adaptive stream scheduling and focus/selection priority; reduce hidden/background previews and nonessential vision before compromising active device work.
- P3-18 Test host overload, stale/unavailable sensors, unsupported GPU counters, manual override, emergency throttle and recovery.
- P3-19 Verify stream controls never take input ownership from Device Host or disrupt running workflows.

Exit criteria:
- No stream process can send input.
- Device input remains serialized.
- Focus/zoom/scroll behavior matches V9.
- Measured concurrency envelope and overload behavior are documented.
- FPS/quality/resolution controls work globally, for selected devices and per device.
- Real-time resource telemetry displays freshness and unavailable states correctly.
- Warning/critical alerts are validated under load and do not flicker.
- Resource pressure degrades preview/vision work before disrupting active device workflows.
- User-adjustable FPS, resolution, bitrate and stream-count controls work in Auto and Manual modes.
- Live hardware telemetry and warnings are timestamped and reflect actual sensor availability.
- Requested and effective stream settings are distinguishable.
- Emergency throttling and recovery are auditable and do not disrupt ADB workflows.
- "Unlimited device records" is supported independently from bounded live streams.

## 6. Phase 4 — UI Automator and Vision

**Execution contract**
- **Entry:** Phase 3 accepted/merged; Phase 0 model/deployment choices and labeled fixtures approved.
- **Deliverables:** Normalized UI tree/selectors, bounded worker IPC, OCR/CV pipeline, confidence/replay evidence.
- **Verification/evidence:** T-04 accuracy/latency against labeled holdout fixtures, stale generation/orientation, worker crash and unknown dialogs. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Versioned recognition results/confidence and safe-stop contract for identity/runtime.
- **Acceptance gate:** AC-04 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P4-01 Prototype hierarchy capture on target devices and apps.
- P4-02 Implement the Phase-0-selected stable UI Automator version/deployment model; any change requires a reviewed ADR, not an implicit reselection.
- P4-03 Parse UI hierarchy into a normalized element tree.
- P4-04 Build selector resolver using resource ID, content description, text, class and bounds.
- P4-05 Add stale-tree detection and wait-for-stable behavior.
- P4-06 Build OpenCV preprocessing pipeline.
- P4-07 Validate the approved OCR model/language choice against Vietnamese/English regression fixtures and packaging budget; evaluate alternatives only through decision control.
- P4-08 Build Python Worker IPC and lifecycle manager.
- P4-09 Add confidence scoring and calibrated thresholds.
- P4-10 Build screenshot evidence capture and replay fixture tooling.
- P4-11 Add coordinate fallback only for calibrated layouts and only when confidence is sufficient.
- P4-12 Add unknown-dialog/unknown-screen safe stop.

Exit criteria:
- Test screenshots have labeled expected elements.
- UI tree detection beats coordinate-only baseline on supported screens.
- OCR accuracy/latency meets an agreed benchmark.
- Low-confidence and unknown states block actions safely.
- Python worker crash/restart does not affect ADB command ownership.

## 7. Phase 5 — Identity, accounts, targets and app inventory

**Execution contract**
- **Entry:** Phase 4 accepted/merged; authorization/identity proof, APK and proxy mechanism decisions resolved.
- **Deliverables:** Real app inventory, verified account/target registry, APK/proxy tools and account lease identity contract.
- **Verification/evidence:** T-05 wrong identity/session/challenge, signature mismatch, protected app uninstall and device-route rollback. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Verified identity/capability/secret references for content, scheduler and preflight.
- **Acceptance gate:** AC-05 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P5-01 Define app package catalog per platform and version.
- P5-02 Scan installed packages per phone.
- P5-03 Extract app label, version, install source and launcher icon.
- P5-04 Cache icons by device/package/version.
- P5-05 Protect system/critical apps from uninstall by default.
- P5-06 Build Account Registry per device/platform.
- P5-07 Build account identity verification from observable app UI signals.
- P5-08 Build target registry and exact target verification.
- P5-09 Handle login expired/challenge/unknown states without collecting credentials; user performs initial login/authorization and security challenges stop/report rather than bypass or silently substitute identity (C-03).
- P5-10 Build APK install/uninstall batch operations with explicit target scope, destructive-action confirmation, cancellation, progress and per-device results.
- P5-11 Build masked device-level HTTP/HTTPS proxy profile storage, syntax/host reachability validation and assignment using protected secret references (C-09/14).
- P5-12 Prove device-side proxy egress before marking proxy active.
- P5-13 Define verified global account identity and cross-device publication lease within one local-PC coordinator; never merge by name/avatar or promise cross-PC exclusion (C-12).
- P5-14 Validate APK source/signature/package/version and downgrade policy before mutation; reject mismatches and provide failure/cancel results.
- P5-15 Implement HTTP/HTTPS device-level proxy expiry/health, cancellation and rollback with device-route proof and per-device audit; SOCKS5/per-app routing remains deferred unless separately accepted and tested (C-09).

Exit criteria:
- App inventory is based on actual device package scan, not static mock catalog.
- Account/target selection is blocked when identity confidence is insufficient.
- APK batch results are reported per device.
- Proxy is not marked live based only on host-side check.
- No password/OTP/cookie is stored.

## 8. Phase 6 — Media and content library

**Execution contract**
- **Entry:** Phase 5 accepted/merged; media/template schema and tested transfer/Unicode contracts.
- **Deliverables:** Deterministic library, import/export/TXT preview, validation/reuse and verified Android staging.
- **Verification/evidence:** T-06 nested/changed/duplicate/locked files, import round-trip, low storage and cancelled transfer cleanup. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Immutable validated content references and staged media proof; no publishing yet.
- **Acceptance gate:** AC-06 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P6-01 Add media source/folder registry.
- P6-02 Implement recursive and non-recursive scans.
- P6-03 Add stable sort by normalized relative path and filename.
- P6-04 Add SHA-256 deduplication and file-stability detection.
- P6-05 Add ffprobe metadata validation for video.
- P6-06 Add image dimensions/format validation.
- P6-07 Build media table with max 20 visible rows and scroll.
- P6-08 Default caption to filename without extension.
- P6-09 Add hashtags and 0–10 comment columns per row.
- P6-10 Add comment delay after verified post and interval between successive verified comment attempts; empty slots do not produce actions.
- P6-11 Build Excel template download, import preview, mapping and error report.
- P6-12 Build TXT comment import with explicit encoding, deterministic filename/relative-path mapping, duplicate/missing-match errors and preview.
- P6-13 Add assignment/used/reuse policy and explicit album/group key with ordered assets: one album post per target, never infer a folder is an album; validate exact count/order and composer constraints (C-20).
- P6-14 Add folder watcher/polling and scan refresh.
- P6-15 Export current content plus blank template with schema version; round-trip relative path/hash, caption, hashtags, comments, target/workflow and schedule fields.
- P6-16 Stage exact media onto Android with owned-copy manifest/hash, storage preflight, media-picker identity proof, cancellation and safe cleanup. Remove only tool-owned copies after verified completion, never originals/unrelated files; UNKNOWN retains recovery data (C-21).

Exit criteria:
- Recursive scan finds nested media and deduplicates by hash.
- Excel import never silently assigns the wrong asset.
- Caption/hashtag/comments round-trip through template.
- Changing a file after import invalidates its prior validation.

## 9. Phase 7 — Scheduler and queue

**Execution contract**
- **Entry:** Phase 6 accepted/merged; accepted C-10/11/18/19 and DEC-020 scheduling rules mapped to reviewed immutable job/lease schema.
- **Deliverables:** Deterministic scheduler, calendar, durable queue, fenced device/account leases and snapshots.
- **Verification/evidence:** T-07 DST/revision/duplicate generation, clock changes, starvation and crash/lease takeover simulation. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Claimable job snapshot+lease contract; dispatch remains non-publishing until runtime/pilot gates.
- **Acceptance gate:** AC-07 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P7-01 Define once/weekdays/every-N-day recurrence anchored to selected start date in schedule timezone; end date inclusive, maximum occurrences counts planned occurrences, stop at first applicable bound, and retries/skips create no replacement occurrences (C-18).
- P7-02 Use selectable IANA timezone, default Asia/Ho_Chi_Minh; nonexistent DST time skips with notification, overlap chooses earlier occurrence exactly once; snapshot timezone/rule version (C-11).
- P7-03 Generate N time slots based on posts-per-active-day.
- P7-04 Implement DEC-020: gaps below 30 minutes warn but do not hard-block; same-device/account execution conflicts remain serialized under the collision policy.
- P7-05 Implement QUEUE default, explicit AUTO_SHIFT and BLOCK collision policies; AUTO_SHIFT stays inside configured window/same local day or enters REVIEW (C-10/18).
- P7-06 Implement device queue with whole-workflow foreground ownership per phone; manual wall input/Home/Back, APK/proxy mutations and other jobs cannot interleave between steps. Reject conflicts or require explicit safe pause/takeover.
- P7-07 Implement verified global-account publication lease across phones in one local-PC coordinator, with unknown identity blocked and no cross-PC guarantee (C-12).
- P7-08 Add platform priority and aging.
- P7-09 Implement downtime-missed/unadmitted occurrences as REVIEW, not catch-up flood; already admitted queue jobs remain QUEUE, with auditable clock/recovery handling (C-10/19).
- P7-10 Add calendar day/week/month filters, stable account/platform colors and drag/drop with optimistic revision, visible queue time, undo and audit; invalid moves revert with reason.
- P7-11 Add deterministic preview/job generation and validated slot counts; a complete valid row date/time/timezone visibly overrides the profile, absent override follows it, partial/invalid overrides error, and the same occurrence never generates both jobs (C-18/19).
- P7-12 Test daylight-saving time gaps/overlaps and timezone changes.
- P7-13 Persist device/account leases with fencing/expiry and safe restart recovery; jobs snapshot schedule revision, content hash, identity and workflow version to prevent stale execution.

Exit criteria:
- No duplicate jobs on repeated schedule generation.
- A phone/account cannot execute conflicting jobs concurrently.
- Timezone/DST behavior is deterministic.
- Drag/drop updates persisted schedule without hidden confirmation popup, but collision checks remain enforced.

## 10. Phase 8 — Workflow runtime and safety

**Execution contract**
- **Entry:** Phase 7 accepted/merged; effect and outcome contracts plus certification/reconciliation rules approved.
- **Deliverables:** Fixed-workflow runtime, durable effect journal/ledger, recovery and capability enforcement.
- **Verification/evidence:** T-08 fault injection before/after durable intent and dispatch; unknown publish/comment never auto-retries. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Safe runtime proven with fixtures/lab effects; no Facebook capability enabled by runtime alone.
- **Acceptance gate:** AC-08 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P8-01 Define fixed workflow manifest and versioning.
- P8-02 Define capability registry per app version/account/target/content type.
- P8-03 Define preflight contract.
- P8-04 Define workflow state machine and typed step outcomes.
- P8-05 Implement durable effect journal.
- P8-06 Implement action-level screenshot/UI evidence.
- P8-07 Implement publish verification and duplicate reconciliation; album evidence proves exact certified asset count/order and one post per target (C-20).
- P8-08 Implement comment queue after verified publish only.
- P8-09 Implement retry rules for known-safe actions only.
- P8-10 Implement unknown external effect reconciliation.
- P8-11 Implement safe cancel/pause/resume, explicit manual takeover and per-step timeout; drain/fence in-flight work, reconcile uncertain effects and invalidate prior capture/identity before releasing ownership or resuming.
- P8-12 Implement app upgrade/layout drift detection.
- P8-13 Add audit trail and job report.
- P8-14 Implement interaction ledger eligibility/deduplication, verified post references and permitted latest-N ordering/pagination; UNKNOWN never means NOT_DONE and unavailable sources block execution.

Exit criteria:
- Unknown/ambiguous side effects never auto-retry.
- Job success requires verified outcome, not just button click or toast.
- A workflow can be disabled by capability registry without deleting its UI definition.
- All step outcomes are reproducible from logs/evidence.

## 11. Phase 9 — Facebook pilot

This phase is conditional on Phase 0 platform-policy gate and on app/device-specific feasibility. ADB UI automation is not a policy exemption.

**Execution contract**
- **Entry:** Phase 8 accepted/merged; written per-action policy/authorization and lab identity scope.
- **Deliverables:** Profile-specific controlled pilot or documented capability exclusion; unsupported entries remain disabled.
- **Verification/evidence:** T-09 positive/negative physical-device trials, read-back, drift and recovery within approved volume. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Per-capability certificate or explicit disabled reason. Phase acceptance/deferral still required before Phase 10.
- **Acceptance gate:** AC-09 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P9-01 Build a lab-only Facebook app profile and capture supported UI states.
- P9-02 Verify exact logged-in account identity.
- P9-03 Verify exact Page/target identity.
- P9-04 Test Page video posting only if policy gate allows.
- P9-05 Test Page photo/album posting only if policy gate allows.
- P9-06 Test Reels separately from feed video.
- P9-07 Test Story separately and leave disabled unless verified.
- P9-08 Test post read-back using only permitted visible data and authorization.
- P9-09 Test comments only within approved owned/administered scope and only if policy gate allows.
- P9-10 Keep Profile/Group/Like/Love/Share disabled unless each has a separate written policy and technical approval.
- P9-11 Add per-version/per-locale certification fixtures.
- P9-12 Run small-volume controlled acceptance before any scale test.

Exit criteria:
- Each enabled workflow has policy approval, exact identity proof, stable UI recognition, success verification and recovery tests.
- Unsupported workflows remain visibly disabled with a reason.
- No CAPTCHA/checkpoint/rate-limit bypass or anti-detection behavior.

## 12. Phase 10 — Tracking and reports

**Execution contract**
- **Entry:** Phase 9 accepted/merged, including any approved disabled-capability outcome; permitted metric-source decisions.
- **Deliverables:** Provenance-aware snapshots, health/inventory dashboard, alerts and CSV/XLSX reports.
- **Verification/evidence:** T-10 missing/stale data, comparable growth, source-denial, alert deduplication and export consistency. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Source/capability/freshness map and truthful reports; no unsupported analytics claims.
- **Acceptance gate:** AC-10 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P10-01 Define permitted sources for account/post metrics.
- P10-02 Define metric provenance and freshness.
- P10-03 Build snapshot scheduler and history table.
- P10-04 Build per-network metric capability map.
- P10-05 Build progress bars for media inventory/license/proxy status with distinct semantics.
- P10-06 Build device/account health dashboard.
- P10-07 Export CSV/XLSX with source timestamps and missing-data flags.
- P10-08 Do not infer recommendation/viral status without explicit source metrics.
- P10-09 Add alerts for idle, expired, low inventory, offline, blocked and unknown jobs.

Exit criteria:
- No mock metrics in production.
- Missing metric is UNAVAILABLE, not zero.
- Growth requires comparable snapshots and period metadata.
- Every report is traceable to its source.

## 13. Phase 11 — Hardening and release

**Execution contract**
- **Entry:** Phase 10 accepted/merged; all release-critical requirements and support budgets resolved.
- **Deliverables:** Reproducible signed installer, dependency manifest, recovery/security/load reports and operator/release runbooks.
- **Verification/evidence:** T-11 Windows install/upgrade/restore/fault/security/load matrix; full T-01…T-12 regression on exact candidate. Record exact build/commit, procedure, expected/actual result, environment and sanitized artifact links under the approved Phase Plan.
- **Handoff:** Release decision package with hashes, certificates, limitations and rollback; publish/tag only with authorization.
- **Acceptance gate:** AC-11 in [Acceptance & Risks](05_ACCEPTANCE_AND_RISKS.md); requirement rows in [Traceability](14_REQUIREMENTS_TRACEABILITY.md). Tests listed here are planned, not results.

Tasks:
- P11-01 Build Windows installer and signed release pipeline.
- P11-02 Bundle/pin approved ADB, stream backend and Python/models; verify artifact provenance/checksums, SBOM, license notices and dependency vulnerability review.
- P11-03 Test clean install, upgrade, downgrade policy and uninstall.
- P11-04 Test SQLite migration and encrypted backup restore/quarantine: verify pre-migration backup, at-most-daily/manual cadence, seven validated ordinary copies and separate safety copy until upgrade acceptance. Backup failure is visible and never deletes/replaces known-good copies. Reconcile post-backup effects/revalidate identities/leases before dispatch; restored NOT_DISPATCHED is not proof of no later effect (C-14/22).
- P11-05 Test power loss, app crash, ADB server crash and phone disconnect.
- P11-06 Load test device registry, screen wall, worker queues and media scan.
- P11-07 Security review: secrets, logs, IPC, file path access and process execution.
- P11-08 Build redacted support/diagnostics and cleanup/runbooks: captures/UI/OCR 7 days, technical logs 30 days, job/metric history until explicit cleanup; preserve unresolved evidence/idempotency data. Backups stay encrypted/local in user-chosen folder, no cloud upload; cleanup only owned staged copies (C-13/21/22).
- P11-09 Complete release checklist, quantified measured support/performance budgets, capability matrix, known limitations and rollout/rollback runbook.
- P11-10 Tag release only after all critical acceptance gates pass.

Exit criteria:
- Reproducible Windows installer.
- Recovery tests pass.
- No secret leakage in logs.
- Hardware matrix and supported versions published.
- Release notes distinguish READY, DEFERRED and unsupported workflows.

## 14. Dependency order

```text
0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11
```

This is the authorization order, not merely a technical dependency graph. Previous wording allowed Phase 3/4 parallel work and independent Phase 6 work; that conflicts with AGENTS.md and is superseded here by the strict sequential default. A future exception requires explicit user approval and governance/Phase-plan amendments before work begins. Shared technical dependencies remain listed in each execution contract, but never bypass the predecessor gate.

If no Facebook action passes its gate, Phase 9 cannot be declared successful automation. Record an explicit user-approved disabled/deferred capability release outcome and the resulting release scope, or remain BLOCKED. Do not silently skip Phase 9 to reach release.

## 15. No-code gate

Before first production code commit:
- Phase 0 decisions signed off.
- V9 UI mapping approved.
- Architecture Decision Records approved.
- Initial device test matrix available.
- ADB/UI Automator/OCR feasibility report complete.
- Facebook workflow policy status recorded.
- Database schema, domain/IPC boundaries, migration/rollback and threat model reviewed.
- Acceptance test matrix approved.

## 16. Task execution and evidence contract

The master rows are the complete roadmap index; detailed [Phase plans](phases/) supply task dependencies, expected files, stepwise acceptance and exact commands once the stack exists. Draft plans do not authorize coding. Execute in listed order unless the approved Phase Plan explicitly documents a dependency-safe order within the same phase. Every task must:
1. Link at least one RQ requirement and planned test family; identify input/output contract and prerequisite decisions.
2. Produce a working vertical increment, regression tests and sanitized evidence—not a stub, mock-only UI or unexplained screenshot.
3. Record unit/integration/UI/hardware/security/performance checks applicable to that increment, including failed and unrun checks. Physical-device claims require physical-device evidence.
4. State failure behavior, cancellation/timeout, rollback/migration impact and scope of external side effects.
5. Complete review/acceptance before the next task, or obtain an explicit recorded deferral; never infer approval from a commit or a green build.

Evidence records use commit/build hashes, tool/app/model/device versions, sanitized fixture IDs, exact command/procedure, threshold source, observed result and reviewer/user decision. Numeric performance/accuracy budgets are **OPEN until measured and approved**, not a license to choose an arbitrary passing threshold after a run. Freeze them in the relevant Phase Plan before acceptance testing. No test command is claimed runnable before its tool/package exists.

## 17. Change history

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Historical clean-slate roadmap and resource-control additions; retained in Git. |
| 2026-10-30 | 0.2-draft | Documentation-only normalization: G0 gate namespace, duplicate-row semantic migration, sequential phase governance, execution/evidence contracts, missing task coverage and unresolved-decision boundaries; DEC-019/020 user-approved defaults recorded. Approved Phase 0 execution IDs/history unchanged; no gate marked passed. |
| 2026-10-30 | 0.3-review | Synchronized C-01…C-22 accepted directions and existing task/acceptance coverage for albums, recurrence/row overrides, retention/cleanup and backup cadence. No new task IDs or empirical PASS claims. |
