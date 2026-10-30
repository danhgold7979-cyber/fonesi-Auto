# Master Plan — Fonesi-Auto

**Revision:** 0.1-draft · **Date:** 2026-10-30  
**Repository:** danhgold7979-cyber/fonesi-Auto  
**Status:** Planning baseline; not approved for production coding.

## 1. Executive decision

Build Fonesi-Auto as a new Windows desktop application for operating Android phones through ADB. Preserve the approved V9 interface as the product/UI reference. Design all application code, data contracts, runtime, tests and release process from a clean slate in this repository.

Selected technology direction:
- Windows desktop shell: Electron + TypeScript (recommended; confirm in Phase 0).
- Device transport/control: Android Debug Bridge (ADB).
- Semantic Android UI inspection/action: UI Automator.
- Visual fallback: OpenCV + OCR.
- OCR/vision execution: isolated Python worker, initially CPU-first.
- Screen-wall video: scrcpy as a supporting display/stream component, subject to version/license/resource spike; it does not own workflow input.
- Persistence: SQLite with migrations, WAL, backup and recovery.
- Local secrets: Windows Credential Manager / DPAPI-backed secret storage.

## 1.1 Approved UI baseline

The complete approved V9 HTML/CSS/JavaScript source is stored in [`ui-reference/Fonesi-Auto-V9-UI-Reference.html`](../ui-reference/Fonesi-Auto-V9-UI-Reference.html). This is the canonical UI reference, not a summary mock. The implementation must preserve its navigation order, compact layout, right-side device monitor, device-tile behavior, Dark/Light mode and fixed workflow tree. See [`docs/06_UI_V9_MAPPING.md`](06_UI_V9_MAPPING.md) for page-by-page mapping. Do not redesign the UI without explicit approval.

## 2. Product outcome

A user can:
1. Connect and manage many Android phones over USB and approved ADB Wireless Debugging.
2. View connected phones in a resizable screen wall matching V9.
3. Select one or multiple phones and perform safe device-level actions.
4. Register multiple social accounts and targets per phone, with verified identity state.
5. Scan media folders recursively and manage caption, hashtag, comments and metadata through a table/Excel template.
6. Create fixed workflows by platform, target type and content type.
7. Schedule jobs per phone/account/target/workflow with recurring intervals, conflict detection, queues and recovery.
8. Monitor execution, logs, device/account health, inventory and metrics where data can be collected lawfully and reliably.
9. Use APK/app inventory and proxy tools with per-device results and safe rollback.

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
Windows Desktop (Electron + TypeScript)
  ├─ V9 Renderer / UI
  ├─ Application Services
  │   ├─ Device Fleet Manager
  │   ├─ Account & Target Registry
  │   ├─ Media & Content Library
  │   ├─ Fixed Workflow Engine
  │   ├─ Scheduler & Queue
  │   ├─ Tracking & Reports
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
  └─ SQLite + Windows Secret Store
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

| Stage | Deliverable | Exit condition |
|---|---|---|
| 0 | Product, policy and feasibility gates | Critical platform and device feasibility decisions documented |
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
No. Phase 0 must close the blockers below first.

### Blocking decisions
- Confirm supported Windows versions and minimum host specification.
- Confirm initial Android test-device models/Android versions and whether USB-only is acceptable for the first hardware gate.
- Confirm whether Facebook automation is only for Pages/accounts owned or administered by the user.
- Obtain a policy/legal determination for ADB-driven automation of Facebook app actions. Meta terms/policies may restrict automated access, collection and inauthentic engagement; ADB does not exempt the activity.
- Decide what to do when a requested Facebook action is technically automatable but not permitted or not certifiable: safe behavior is DISABLED/UNAVAILABLE.
- Approve an initial maximum number of simultaneously streamed phones for benchmark, while keeping the device registry unbounded.

## 8. Approval protocol

This document is a planning baseline, not permission to begin coding. Phase 0 decisions must be recorded in the decision log. Once blockers are resolved, produce a versioned implementation plan with task IDs, dependencies, acceptance tests and rollback notes. No implementation work is authorized by the existence of this plan alone.
