# Master Plan — Fonesi-Auto

**Revision:** 0.3-review · **Date:** 2026-10-30
**Repository:** danhgold7979-cyber/fonesi-Auto
**Status:** Documentation normalization for review. Phase 0 feasibility is approved/in progress; production coding is not authorized.

## 1. Executive decision

Build Fonesi-Auto as a new Windows desktop application for operating Android phones through ADB. Preserve the approved V9 interface as the product/UI reference. Design all application code, data contracts, runtime, tests and release process from a clean slate in this repository.

Accepted product/technology directions are recorded in [C-01…C-22](16_ACCEPTED_PRODUCT_DECISIONS.md). They settle preferences, not implementation evidence. Exact versions, mechanisms and benchmarks still require Phase 0/phase-specific proof:
- Windows desktop shell: Electron + strict TypeScript + React, preserving V9 layout/CSS (C-05).
- Device transport/control: Android Debug Bridge (ADB).
- Semantic Android UI inspection/action: UI Automator.
- Visual fallback: OpenCV + PaddleOCR, CPU-first (C-06); exact models/thresholds remain empirical.
- OCR/vision execution: isolated Python worker, initially CPU-first.
- Screen-wall video: scrcpy as a supporting display/stream component, subject to version/license/resource spike; it does not own workflow input.
- Host hardware/resource manager: realtime CPU/RAM/GPU/disk telemetry, Auto/Manual stream controls, user-adjustable FPS/resolution/bitrate/concurrency, and benchmark-based warnings.
- Persistence: SQLite with migrations, WAL, backup and recovery (C-05); binding/migration tooling and schema require review/tests.
- Windows-backed secret storage holds proxy secrets; SQLite stores references only (C-14). Key portability/recovery mechanism remains unproven.

## 1.1 Approved UI baseline

The complete approved V9 HTML/CSS/JavaScript source is stored in [`ui-reference/Fonesi-Auto-V9-UI-Reference.html`](../ui-reference/Fonesi-Auto-V9-UI-Reference.html). This is the canonical UI reference, not a summary mock. The implementation must preserve its navigation order, compact layout, right-side device monitor, device-tile behavior, Dark/Light mode and fixed workflow tree. See [`docs/06_UI_V9_MAPPING.md`](06_UI_V9_MAPPING.md) for page-by-page mapping. Do not redesign the UI without explicit approval.

## 2. Product outcome

A user can:
1. Connect/manage Android phones over USB first; authenticated Wireless Debugging stays disabled until its dedicated acceptance (C-17).
2. View connected phones in a resizable screen wall matching V9.
3. Select one or multiple phones and perform safe device-level actions.
4. Register multiple social accounts and targets per phone, with verified identity state.
5. Scan media folders recursively and manage caption, hashtag, comments and metadata through a table/Excel template.
6. Create fixed workflows by platform, target type and content type.
7. Schedule jobs per phone/account/target/workflow with recurring intervals, conflict detection, queues and recovery.
8. Monitor execution, logs, device/account health, inventory and metrics where data can be collected lawfully and reliably.
9. Use APK/app inventory and proxy tools with per-device results and safe rollback.

“Complete tool” means every release-critical requirement is implemented, tested and evidenced for the declared support matrix, with all conditional capabilities either certified READY or explicitly approved as disabled/deferred. A visible workflow, unsupported action or untested hardware profile is not completed functionality. Scope exclusions must be stated honestly; no substitute manual workflow is silently presented as unattended automation.

## 3. Product scope

### In scope
- Windows desktop operations studio.
- Android fleet discovery, ADB USB/Wi-Fi pairing, reconnect, screenshot/stream and input.
- UI Automator + OpenCV/OCR recognition pipeline.
- Fixed workflow catalog and deterministic workflow state machines.
- Media library, recursive scanning, fingerprinting, Excel import/export.
- Scheduler, queue, retry policy, idempotency/effect journal.
- Account/target registry, app inventory, APK install/uninstall, proxy configuration.
- Reporting, audit trail, diagnostics and release tooling.

### Conditional scope
The accepted first pilot is owned/administered Page photo/album/video/Reels; Story requires separate certification, Profile/Group/reactions/shares stay off, and other networks are explicitly unsupported (C-01/02). Relevant comments require permitted scope. The user handles initial authorization/login; routine certified work is unattended, while login expiry/security challenges stop and report (C-03). Initial proxy scope is device-level HTTP/HTTPS with real route proof/rollback; SOCKS5/per-app routing is deferred (C-09).

Facebook-specific actions are capability-gated. ADB can technically send input to the Facebook app, but that alone does not establish permission under Meta terms or guarantee account safety. Each automated action requires platform-policy review, feasibility spike and explicit certification. Unsupported actions remain disabled; no manual fallback is silently substituted.

### Not in scope for the first release
- General-purpose drag-and-drop workflow/node editor.
- Cloud-hosted multi-tenant SaaS backend.
- CAPTCHA/checkpoint bypass, anti-detection evasion, account/session spoofing.
- Unauthorized scraping or harvesting of profile/group data.
- Automated fake engagement, coordinated bulk reactions or spam comments.
- Claiming real analytics where only mock/OCR-inferred data exists.
- Hard guarantee of unlimited simultaneous live video streams.

## 4. Architecture summary

```text
Windows Desktop (Electron + strict TypeScript + React)
  ├─ V9 Renderer / UI
  ├─ Application Services
  │   ├─ Device Fleet Manager
  │   ├─ Account & Target Registry
  │   ├─ Media & Content Library
  │   ├─ Fixed Workflow Engine
  │   ├─ Scheduler & Queue
  │   ├─ Tracking & Reports
  │   ├─ Host Resource Monitor / Resource Policy Engine
  │   └─ Audit / Recovery
  ├─ Device Host
  │   ├─ ADB Server/Client
  │   ├─ Per-device serialized Actor
  │   ├─ UI Automator adapter
  │   └─ scrcpy video-only stream adapter
  ├─ Python Vision Worker (IPC)
  │   ├─ OpenCV preprocessing
  │   ├─ PaddleOCR candidate models
  │   └─ structured recognition results
  └─ SQLite + Windows-backed Secret Store (bindings/versions pending)
          |
          +---- Android Phone 01
          +---- Android Phone 02
          +---- Android Phone N
```

## 5. Critical architectural rules

1. One device actor owns all input commands for a device; no parallel ADB/UIAutomator/scrcpy input race.
2. Device records are not capped, but stream/worker concurrency is controlled by resource budgets.
3. Account identity and target identity must be verified before a job can execute.
4. Recognition order: UI hierarchy/selector → OCR/visual detection → calibrated coordinate fallback. Low confidence means stop, not guess.
5. Every external side effect has a durable intent record before execution and a verification record after execution.
6. Timeout after a possible publish must be UNKNOWN/RECONCILIATION_REQUIRED, never blind retry.
7. A workflow is READY only for a tested combination of app package, app version, Android version, locale, account type, target type and screen profile.
8. UI V9 is the baseline; do not redesign layout while implementing backend functionality without approval.

## 6. Master delivery stages

Delivery is strictly sequential: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11**. The previous phase must be user-accepted and merged, then the next detailed plan approved. Technical independence does not permit parallel phases; an exception would require explicit user approval and governance/plan amendments. See [master task/dependency contracts](04_MASTER_IMPLEMENTATION_PLAN.md), [draft Phase plans](phases/) and [acceptance gates](05_ACCEPTANCE_AND_RISKS.md).

| Stage | Deliverable | Exit condition |
|---|---|---|
| 0 | Product, policy and feasibility gates | G0-01…19 evidenced through approved P0-01…10; mandatory physical smoke and explicit acceptance |
| 1 | Clean repository foundation | Desktop shell, build, lint, test, packaging skeleton |
| 2 | ADB fleet control | Stable USB/Wi-Fi discovery and serialized per-device control |
| 3 | Screen wall | Multi-device live view, zoom, focus, input and resource management |
| 4 | Recognition engine | UI Automator + OpenCV/OCR confidence pipeline |
| 5 | Identity and app management | Verified device/account/target inventory; package list/icons |
| 6 | Media/content | Recursive scan, validation, Excel, comments and asset staging |
| 7 | Scheduler/queue | Recurrence, collision, per-device/account locks, durable jobs |
| 8 | Workflow runtime | State machine, journaling, recovery and certification |
| 9 | Facebook capability pilot | Only approved, feasible and certified workflows enabled |
| 10 | Tracking/reporting | Verified snapshots and evidence-based alerts |
| 11 | Hardening/release | Hardware matrix, load tests, backup, installer, rollback |

## 7. Readiness decision

### Ready to plan
Yes. The V9 UI baseline, technology direction and broad product modules are sufficiently clear to create a detailed plan.

### Ready to start full application coding
No. Phase 0 currently has **4 IN_PROGRESS / 6 NOT_STARTED execution tasks**, and no exit gate is accepted. Partial physical ADB/UI observations do not establish a production pipeline. There is no production app or app CI. The [status board](PHASE_STATUS.md) is authoritative; this rewrite is not a new acceptance decision.

### Remaining evidence and phase-specific inputs
- Validate the current Windows host first; establish actual supported Android/host profiles and at least two-physical-device isolation. Two AVDs are for repeatability, initially one running; they do not replace physical acceptance (C-07).
- Obtain written per-action policy/permission outcomes and supply the actual authorized pilot Page/account/content/audience/volume/stop conditions. Owned/administered scope is accepted; policy permission is not inferred (C-02).
- Prove selected Electron/React/SQLite, scrcpy and PaddleOCR versions/licenses/compatibility; choose UI Automator deployment, Unicode and proxy mechanisms through tests. Incompatibility requires a new decision, not a silent stack change.
- Review schema/IPC/security and implement the accepted schedule, retention and backup rules; test numeric performance thresholds, Windows key recovery/portability and local-PC account lease boundaries.
- Supply the backup folder, exact test profiles and eventual signing identity/release destination at their named gates. Do not request credentials in chat.

No longer open product preferences: C-01…C-22, **DEC-019** (Manual protection OFF/opt-in) and **DEC-020** (30-minute warning-only). In particular, recurrence/DST/row overrides, ordered albums, cleanup, retention and backup cadence now have accepted rules in [the decision record](16_ACCEPTED_PRODUCT_DECISIONS.md). Their implementation/tests, Phase 0 exit, numbered amendment and later Phase authorization remain pending.

## 8. Approval protocol

This is a current planning map, not permission to begin production coding. Preserve the approved Phase 0 baseline/history; amend scope or acceptance through the documented approval process. Record decisions/ADRs, attach gate evidence and obtain Phase 0 acceptance before requesting Phase 1 authorization. Draft Phase 1–11 plans are reviewable execution proposals, not approved work orders.

Each task needs a stable ID, dependency/input contract, deliverable, expected failure behavior, acceptance/test/evidence and rollback impact. Each phase needs regression and an acceptance report linked to exact commits and hardware profiles. The [requirements traceability matrix](14_REQUIREMENTS_TRACEABILITY.md) links these to canonical requirements and retains legacy ID mappings. The [acceptance document](05_ACCEPTANCE_AND_RISKS.md) distinguishes plan reviewability, implementation readiness, capability readiness and release authorization. No production test, merge or release is implied by this plan.

## 9. Change history

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Original clean-slate planning baseline, preserved in Git. |
| 2026-10-30 | 0.2-draft | Aligned actual feasibility status, sequential delivery, conditional completion, pending stack choices, requirement traceability and accepted DEC-019/020; no production authorization or Phase acceptance claimed. |
| 2026-10-30 | 0.3-review | Synchronized accepted C-01…C-22 product/stack directions; separated unresolved technical proofs/inputs from settled preferences. Physical/Phase acceptance unchanged. |
