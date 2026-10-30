# Master Implementation Plan

**Revision:** 0.1-draft · **Date:** 2026-10-30  
**Repository:** fonesi-Auto · **Planning branch:** planning/clean-slate-master-plan  
**Implementation state:** NOT STARTED

This plan is intentionally written from zero. It does not inherit the source tree, code, contracts, schema or execution plan of fonesi-W.

## 1. Overall execution model

Work is divided into gated phases. A phase may start only when its entry criteria are met. A phase is complete only when its exit criteria and evidence are attached to the repository. No "done" status based only on UI screenshots or mock data.

### Global rules
- V9 is the approved UI baseline. Implement it faithfully; redesign only after explicit approval.
- Use fixed workflows, not a user-editable node graph.
- ADB is the device transport/control plane.
- UI Automator is the semantic inspection/action layer.
- OpenCV + OCR is the visual fallback.
- Python Vision Worker is isolated and never issues competing ADB input.
- scrcpy is a supporting video stream only; Device Host owns all input.
- No API-based social posting in this project unless the user explicitly changes the technology decision.
- No bypass of CAPTCHA, checkpoint, 2FA, rate limits, anti-abuse or platform access controls.
- Unsupported workflows remain disabled; no silent manual fallback.

## 2. Phase 0 — Product, policy and feasibility gates

**Purpose:** Resolve the issues that could invalidate the architecture before application coding.

Tasks:
- P0-01 Confirm Windows versions, host minimum CPU/RAM/GPU/storage and install privileges.
- P0-02 Confirm initial Android device test matrix: manufacturers, Android versions, screen sizes, locales, USB drivers.
- P0-03 Confirm initial test fleet size and first screen-wall benchmark target.
- P0-04 Decide whether Android Wireless Debugging is required in MVP or can follow USB acceptance.
- P0-05 Review Meta Terms, Community Standards and platform-specific restrictions for ADB-driven automation, automated data collection and engagement actions.
- P0-06 Define which Facebook actions are allowed to be automated and under what documented authorization. If not clear, mark the action BLOCKED.
- P0-07 Define exact first-release scope: Page, Profile, Group, Story, Reels, comment, reaction, share.
- P0-08 Confirm that the first Facebook use case is limited to Pages/accounts owned or administered by the user.
- P0-09 Benchmark UI Automator deployment model: hierarchy dump vs instrumentation runner.
- P0-10 Benchmark scrcpy video-only integration on Windows and multi-device resources.
- P0-11 Benchmark OpenCV + PaddleOCR with Vietnamese/English screenshots and determine CPU performance.
- P0-12 Confirm Electron + TypeScript, renderer framework and local database choice.
- P0-13 Define backup, retention, privacy and secret-storage requirements.
- P0-14 Create Architecture Decision Records (ADRs) for each decision.

Exit criteria:
- No unresolved blocker that would change the core architecture.
- ADB + UI Automator + Vision pipeline proven on at least one physical Android device.
- Policy gate has written outcome per Facebook workflow; unsupported actions are disabled.
- Host minimum and stream concurrency targets are documented.

**No product code before Phase 0 exit.** Planning documents, test scripts and throwaway feasibility prototypes may be used only to answer Phase 0 questions; they are not production implementation.

## 3. Phase 1 — Repository and desktop foundation

Tasks:
- P1-01 Establish clean folder/package architecture.
- P1-02 Add Electron main/renderer/preload boundaries and secure IPC.
- P1-03 Add TypeScript strict mode, lint, formatter and unit-test harness.
- P1-04 Add structured logging, correlation IDs and redaction.
- P1-05 Add SQLite migrations, WAL, foreign keys and backup tests.
- P1-06 Add Windows secret-store abstraction.
- P1-07 Implement app settings, theme persistence and crash recovery.
- P1-08 Integrate V9 UI layout without changing its hierarchy or navigation.
- P1-09 Add mock-data boundary so demo data can never be mistaken for production state.
- P1-10 Add CI for typecheck, lint, unit tests and packaging smoke test.

Exit criteria:
- Windows app launches, V9 layout renders and navigates.
- Renderer cannot spawn arbitrary processes or access secrets.
- Database migration/backup/restore tests pass.
- No platform automation feature is enabled yet.

## 4. Phase 2 — ADB and device fleet

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

Exit criteria:
- Two or more physical devices can be scanned and controlled without cross-device command leakage.
- Every command is addressed by exact device serial/ID.
- Per-device command serialization is proven under load.
- Disconnects do not leave jobs falsely successful.

## 5. Phase 3 — Screen wall and scrcpy

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

Exit criteria:
- No stream process can send input.
- Device input remains serialized.
- Focus/zoom/scroll behavior matches V9.
- Measured concurrency envelope and overload behavior are documented.
- "Unlimited device records" is supported independently from bounded live streams.

## 6. Phase 4 — UI Automator and Vision

Tasks:
- P4-01 Prototype hierarchy capture on target devices and apps.
- P4-02 Choose stable UI Automator version and execution model.
- P4-03 Parse UI hierarchy into a normalized element tree.
- P4-04 Build selector resolver using resource ID, content description, text, class and bounds.
- P4-05 Add stale-tree detection and wait-for-stable behavior.
- P4-06 Build OpenCV preprocessing pipeline.
- P4-07 Benchmark PaddleOCR language/model variants for Vietnamese and English.
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

Tasks:
- P5-01 Define app package catalog per platform and version.
- P5-02 Scan installed packages per phone.
- P5-03 Extract app label, version, install source and launcher icon.
- P5-04 Cache icons by device/package/version.
- P5-05 Protect system/critical apps from uninstall by default.
- P5-06 Build Account Registry per device/platform.
- P5-07 Build account identity verification from observable app UI signals.
- P5-08 Build target registry and exact target verification.
- P5-09 Handle login expired/challenge/unknown states without collecting credentials.
- P5-10 Build APK install/uninstall batch operation with per-device result.
- P5-11 Build proxy profile storage, validation and assignment.
- P5-12 Prove device-side proxy egress before marking proxy active.
- P5-13 Define account lease across devices.

Exit criteria:
- App inventory is based on actual device package scan, not static mock catalog.
- Account/target selection is blocked when identity confidence is insufficient.
- APK batch results are reported per device.
- Proxy is not marked live based only on host-side check.
- No password/OTP/cookie is stored.

## 8. Phase 6 — Media and content library

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
- P6-10 Add comment delay and interval.
- P6-11 Build Excel template download, import preview, mapping and error report.
- P6-12 Build TXT comment import with deterministic filename/path matching.
- P6-13 Add asset assignment and used/reuse policy.
- P6-14 Add folder watcher/polling and scan refresh.

Exit criteria:
- Recursive scan finds nested media and deduplicates by hash.
- Excel import never silently assigns the wrong asset.
- Caption/hashtag/comments round-trip through template.
- Changing a file after import invalidates its prior validation.

## 9. Phase 7 — Scheduler and queue

Tasks:
- P7-01 Define recurrence schema: once, weekdays, every N days.
- P7-02 Define timezone handling using IANA timezone IDs.
- P7-03 Generate N time slots based on posts-per-active-day.
- P7-04 Validate 30-minute minimum gap.
- P7-05 Implement QUEUE, AUTO_SHIFT and BLOCK collision policies.
- P7-06 Implement device queue with one active foreground job per phone.
- P7-07 Implement account-level global lease.
- P7-08 Add platform priority and aging.
- P7-09 Add overdue policy and missed-run handling.
- P7-10 Add drag/drop calendar updates with optimistic revision, undo and audit.
- P7-11 Add schedule preview and deterministic job generation.
- P7-12 Test daylight-saving time gaps/overlaps and timezone changes.

Exit criteria:
- No duplicate jobs on repeated schedule generation.
- A phone/account cannot execute conflicting jobs concurrently.
- Timezone/DST behavior is deterministic.
- Drag/drop updates persisted schedule without hidden confirmation popup, but collision checks remain enforced.

## 10. Phase 8 — Workflow runtime and safety

Tasks:
- P8-01 Define fixed workflow manifest and versioning.
- P8-02 Define capability registry per app version/account/target/content type.
- P8-03 Define preflight contract.
- P8-04 Define workflow state machine and typed step outcomes.
- P8-05 Implement durable effect journal.
- P8-06 Implement action-level screenshot/UI evidence.
- P8-07 Implement publish verification and duplicate reconciliation.
- P8-08 Implement comment queue after verified publish only.
- P8-09 Implement retry rules for known-safe actions only.
- P8-10 Implement unknown external effect reconciliation.
- P8-11 Implement cancel/pause/resume and per-step timeout.
- P8-12 Implement app upgrade/layout drift detection.
- P8-13 Add audit trail and job report.

Exit criteria:
- Unknown/ambiguous side effects never auto-retry.
- Job success requires verified outcome, not just button click or toast.
- A workflow can be disabled by capability registry without deleting its UI definition.
- All step outcomes are reproducible from logs/evidence.

## 11. Phase 9 — Facebook pilot

This phase is conditional on Phase 0 platform-policy gate and on app/device-specific feasibility. ADB UI automation is not a policy exemption.

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

Tasks:
- P11-01 Build Windows installer and signed release pipeline.
- P11-02 Bundle/pin ADB, scrcpy and Python runtime with license notices.
- P11-03 Test clean install, upgrade, downgrade policy and uninstall.
- P11-04 Test DB migration and backup restore.
- P11-05 Test power loss, app crash, ADB server crash and phone disconnect.
- P11-06 Load test device registry, screen wall, worker queues and media scan.
- P11-07 Security review: secrets, logs, IPC, file path access and process execution.
- P11-08 Build support bundle and diagnostics export.
- P11-09 Complete release checklist and known limitations.
- P11-10 Tag release only after all critical acceptance gates pass.

Exit criteria:
- Reproducible Windows installer.
- Recovery tests pass.
- No secret leakage in logs.
- Hardware matrix and supported versions published.
- Release notes distinguish READY, DEFERRED and unsupported workflows.

## 14. Dependency order

```text
Phase 0
  -> Phase 1
  -> Phase 2
       -> Phase 3
       -> Phase 4
  -> Phase 5
  -> Phase 6
  -> Phase 7
  -> Phase 8
  -> Phase 9 (conditional)
  -> Phase 10
  -> Phase 11
```

Phases 3 and 4 may proceed in parallel only after the Phase 2 device command/identity contracts are stable. Phase 6 may be developed independently after Phase 1 but must integrate before Phase 8. Phase 9 cannot start before policy and capability gates are closed.

## 15. No-code gate

Before first production code commit:
- Phase 0 decisions signed off.
- V9 UI mapping approved.
- Architecture Decision Records approved.
- Initial device test matrix available.
- ADB/UI Automator/OCR feasibility report complete.
- Facebook workflow policy status recorded.
- Database schema reviewed.
- Acceptance test matrix approved.
