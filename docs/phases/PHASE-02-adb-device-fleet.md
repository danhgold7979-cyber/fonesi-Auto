# PHASE-02 — ADB and device fleet

**Revision/date:** 1.1-draft / 2026-10-30
**Plan:** DRAFT / NOT AUTHORIZED · **Execution:** NOT_STARTED · **Coding:** NO
**Proposed branch:** `phase-02` (not created)
**Base:** accepted `main` SHA to verify after Phase 1 acceptance/merge
**Owner/reviewer:** assign at approval

> Phase 0 remains unfinished. This future plan authorizes neither code nor device changes. Planning approval does not approve this Phase or a test command on a user's phone.

## 1. Outcome and scope

Deliver real fleet discovery, explicit device targeting, transport state, serialized input, captures and V9 device selection. Cover **P2-01…P2-13**, [master Phase 2](../04_MASTER_IMPLEMENTATION_PLAN.md), **AC-02** in [acceptance](../05_ACCEPTANCE_AND_RISKS.md), [architecture §2.3–2.5](../02_TECHNICAL_ARCHITECTURE.md), [device entities](../03_DATA_AND_WORKFLOWS.md), [V9 monitor/overview](../06_UI_V9_MAPPING.md), and [open decisions](../08_DECISIONS_AND_OPEN_ITEMS.md).

No production streams/OCR/workflows/posting, automatic account login, open unauthenticated ADB ports, host SDK replacement, or V9 redesign. Test interactions use an authorized reversible lab app/setting, not live social actions. Clean-slate implementation only, no fonesi-W reuse.

## 2. Entry and execution order

Require Phase 0 acceptance with physical evidence, Phase 1 acceptance **and merge**, current repo/remote/branch/HEAD/status verification and explicit approval of this plan/task. All earlier phases remain accepted; no parallel later-phase work.

[Accepted C-03/C-07/C-08/C-17](../16_ACCEPTED_PRODUCT_DECISIONS.md): user provisions device authorization; validate current Windows host with at least two physical phones and two AVDs, initially one AVD running. **USB first; Wireless Debugging remains disabled until dedicated authenticated pairing/reconnect tests pass.** Before execution record exact Platform Tools version/license/trust, Android/Windows/driver profiles, device identity resolution and authorized input-helper/lab changes. A disabled wireless UI is not a passing wireless test. Never guess device identity from display labels; helper install/permissions need separate approval.

Sequential order: **P2-01 → P2-02 → P2-03 → P2-04 → P2-05 → P2-06 → P2-07 → P2-08 → P2-13 → P2-09 → P2-10 → P2-11 → P2-12**. Required tests/review for the current task must pass before the next. Direct dependencies below supplement the mandatory predecessor-Phase gate.

## 3. Proposed design and module map

Actual paths are finalized from Phase 1 architecture, not invented as existing files. Proposed modules: PlatformToolsManifest; AdbServerManager; TransportRegistry; DeviceIdentityResolver; DeviceActor; CaptureService; UnicodeInputAdapter; fleet IPC/events; V9 fleet/monitor adapter; hardware fixtures/diagnostics.

Contracts include device ID, explicit serial/transport ID, connection generation, command ID, correlation ID, deadline/cancel token and typed outcome. A successful process exit is not necessarily verified device state. Registry changes do not silently retarget pending work. Per-device input is serialized; independent devices may run independent actors. Serialization alone is not a whole-workflow lease: actor admission must honor an explicit operation owner, rejecting conflicting manual input or mutation until an authorized pause/takeover drains in-flight work, reconciles possible effects and invalidates prior UI evidence. Phase 8 supplies the full workflow owner; Phase 2 tests this admission contract with a simulated owner, not a claimed live workflow. Read-only capture must be coordinated so it cannot produce stale evidence used as current state.

## 4. Task packages

All tasks **NOT_STARTED**; all tests below **NOT RUN**. Each row names deliverable, direct dependencies, both positive and negative assertions, evidence and rollback. Common evidence/rollback rules in §§5–6 apply to every row.

| ID / deliverable and proposed module | Dependencies | Positive acceptance | Negative / failure acceptance | Required evidence / rollback |
|---|---|---|---|---|
| **P2-01 — Bundle/pin Platform Tools.** Trusted manifest with version, origin, hash, architecture/license and app-local executable resolution. | Phase 0 binary decision; P1-10 | Packaged Windows build invokes its exact verified app-local ADB, irrespective of PATH. | Missing/tampered/wrong-architecture binary blocks startup; another app's ADB path is not silently used. | Manifest/license/hash and Windows invocation trace. Restore prior verified binary atomically; do not alter global SDKs. |
| **P2-02 — ADB server lifecycle.** Own-process tracking, health, bounded startup/shutdown and explicit shared-server conflict behavior. | P2-01; P1-02/04 | Start/health/close cycle leaves correct ownership and diagnostics. | Port/version collision, denied launch, hung child and server death yield typed failure; do not kill an unrelated server or hang forever. | Windows lifecycle/process-tree tests including output/error capture and timeout. Stop only app-owned processes; restore prior permitted server state. |
| **P2-03 — Discover by serial/transport.** Registry reconciliation with observation timestamps and generation. | P2-02 | Two physical devices remain distinct through scan/order changes; same physical device's transports associate only with sufficient identity proof. | Duplicate/empty serial, spoofed/mismatched identity and stale discovery event cannot merge or retarget records; conflict stays visible. | Sanitized discovery fixtures plus real two-phone trace. Quarantine unresolved records, retain stable IDs; never delete account history to resolve conflict. |
| **P2-04 — Model USB, paired Wi-Fi and TCP.** Explicit pair/connect/disconnect methods and transport state. | P2-03; accepted USB-first C-17 | USB targets exact device; wireless transport states/disabled reason are explicit. Only separately authorized authenticated wireless tests can certify pairing/reconnect and preserve identity across transport changes. | Disabled wireless action rejects; in an authorized test wrong/expired code, unauthorized connection and stale transport fail. No automatic open TCP listener or secret logging. | Windows + physical USB matrix; wireless is DEFERRED/disabled until its dedicated evidence passes; AVD result labeled separately. Disconnect only the test connection; pairing removal/phone config changes require explicit scope. |
| **P2-05 — Unauthorized/offline/conflict/reconnect.** State transitions and new-generation fencing. | P2-04 | Legitimate user RSA authorization/reconnect restores observed health and creates a new generation. | Reconnect with reused endpoint/changed device cannot resume stale commands; unauthorized/offline/conflict cannot appear CONNECTED. | Transition fixtures plus physical cable/reconnect trace. Pause affected queue, invalidate old generation; do not bypass RSA authorization. |
| **P2-06 — Device metadata.** Model/manufacturer/OS/SDK/locale/resolution/density/battery/storage snapshots with units/source/time. | P2-05 | Actual physical values map to correct device and update on locale/orientation change. | Unsupported/malformed/read-denied metadata becomes unavailable, not zero or copied from another phone. | Raw redacted responses and normalized expected values. Retain prior snapshot as stale, never claim fresh data after rollback. |
| **P2-07 — One serialized actor per device.** Command queue, ownership, admission, deadlines, cancellation and generation fencing. | P2-06; P1-11 | Ordered commands on one actor cannot overlap; separate devices progress independently without cross-target leakage. | Simultaneous UI/background requests, queue overflow, cancel race, actor crash and stale completion cannot dispatch twice or release another actor's ownership. Conflicting manual Home/Back/input while a simulated operation owner holds the device is refused; explicit takeover cannot run before the old owner drains/reconciles. | Deterministic fake-transport race tests plus physical serial-labeled trace. Stop admission, drain/cancel known not-dispatched work; uncertain dispatched work remains unresolved. |
| **P2-08 — Tap/swipe/key/Home/Back/text.** Bounded typed operations, coordinate transforms/limits and explicit scope. | P2-07 | Reversible lab actions occur on the exact selected phone and state is checked; timeout/cancel releases resources. | Out-of-range coordinates, malformed shell-sensitive text, wrong serial/generation, rapid repeated clicks and timeout cannot affect another phone. Cancellation after dispatch is not proof of undo. | Unit argument-building tests, Windows process tests and physical before/after evidence. Stop queue on uncertainty; revert only authorized reversible lab changes. |
| **P2-09 — Screenshot and UI hierarchy capture.** Atomic capture artifacts tagged device/generation/time/dimensions/orientation. | P2-08/P2-13 | Capture decodes/parses and matches current phone; stale evidence is identifiable. | Empty/truncated XML/image, screen rotation mid-capture, disconnect and disk-full return errors or stale flags, never another device's last image as current. | Real physical capture fixtures + malformed replay tests. Remove owned incomplete temp files, preserve evidence needed for diagnosis subject to retention. |
| **P2-10 — Selection, active target and groups.** V9 fleet state through typed services, explicit batch scope. | P2-03/P2-07/P2-09 | One active-control target differs from selected set; Accounts focus follows selected phone; explicit group action snapshots intended members. | Changing selection during pending action, offline member and stale UI events cannot broadcast a single-phone input; empty selection fails safely. | Same-viewport V9 screenshots and two-phone input trace, per-device batch outcomes. Cancel undispatched operations; restore UI selection only, not external effects. |
| **P2-11 — Per-device logs/diagnostics.** Correlated command state, health, duration and sanitized error export. | P2-10; P1-04 | Operator can distinguish device/ADB/command failure and trace each result. | Output with credentials, IP/serial identifiers or multiline injection is redacted; export path/collision/write failure cannot collect unrelated files or claim success. | Canary scans and exact file allowlist/archive inspection. Export to a new dedicated location; delete only app-owned partial export, keep user originals. |
| **P2-12 — Disconnect/reconnect fault suite.** Regression across command and queue lifecycle. | P2-01…P2-11; P2-13 | After reconnect, new verified work on each phone runs once with correct ordering. | Unplug before/during/after dispatch, restart server with two phones, cancel queued work and swap transport: no wrong-phone action or false success. | Windows physical two-device matrix, command timelines and observed state; AVD/fake tests supplemental. Quarantine uncertain commands; user-authorized reconciliation before replay. |
| **P2-13 — Unicode input round-trip.** Tested input adapter for Vietnamese/English/emoji, escaping and exact read-back. | P2-08; approved input method/permissions | Lab text containing diacritics, combining characters, emoji, punctuation/newlines is entered exactly and verified exactly; no silent normalization, truncation or character substitution. | Unsupported character/method, partial entry, clipboard/IME denial and disconnect block success; never silently transliterate, truncate or type into wrong app. | Per-device/locale physical input/read-back fixtures; no claim from mock string tests alone. Restore prior input method/clipboard only when owned and authorized; never log sensitive real text. |

## 5. Safety, V9 and rollback

- All input routes, including manual monitor tools, use DeviceActor. UI Automator/stream/Python later cannot bypass it.
- Readiness requires explicit serial plus current device generation. A selected display row or remembered endpoint is insufficient authority.
- User RSA approval/pairing is a provisioning requirement, not an automation bypass. No credentials/OTP/cookies are collected.
- Overview and right monitor retain V9 compact dropdown, selection/focus distinction, quick actions and per-device batch progress. No fake model/avatar values.
- Accepted C-13: captures/UI/OCR expire after 7 days and technical logs after 30 days; preserve unresolved-effect evidence. Public manifests use pseudonymous device labels, private raw data stays in approved local storage.
- Rollback stops new dispatch, closes owned processes and restores known compatible package/configuration. Keep registry/evidence and uncertain results. Already dispatched inputs are not undone by a commit revert; restore only known reversible authorized lab state. Firmware/factory reset/uninstall is not a recovery shortcut.

## 6. Verification and evidence

Use the approved Phase 1 harness; at approval record exact commands and fixture IDs for static/unit, argument validation, transport/actor contract, UI parity, Windows process and physical fleet tests. Mock tests prove race/state logic; AVD proves emulator behavior; neither certifies USB/OEM/Wireless/Unicode on physical phones. At least two authorized physical phones are required by AC-02. C-17 wireless scope stays disabled until dedicated authenticated tests pass; do not convert the USB gate into a claim that wireless is ready.

Each test artifact records task/case ID, SHA, UTC, Windows/ADB version, pseudonymous device/model/Android/locale/transport, generation, input/expected/actual, status and hash/reference. Report NOT_RUN/BLOCKED where hardware is absent. Queue/command latency and discovery scale are measured under a reproducible load with repeated runs, failure counts and owner-approved thresholds before any performance commitment. No unapproved device-count or millisecond promise is made.

## 7. Exit and approval

- [ ] Every P2 task has actual PASS evidence or approved deferral with release consequences.
- [ ] Two physical phones: exact targeting, serial isolation, actor ordering, metadata, captures, Unicode and disconnect/server-restart suite pass.
- [ ] No unscoped command path, competing input owner, unsafe fallback or false success remains.
- [ ] V9 selection/focus/batch behavior and redacted diagnostics pass; complete impacted regression and Windows package smoke pass.
- [ ] AC-02, supported matrix, known limitations and rollback are recorded in acceptance report/status.
- [ ] User accepts and authorizes merge before separate Phase 3 approval.

Risks/stop conditions: identity collision → quarantine; Unicode unsupported → text capability blocked; ADB ownership conflict → do not terminate foreign process; missing hardware → BLOCKED; unapproved wireless → disabled. Name owners at approval.

**User approval:** PENDING · **Coding:** NO · **Runtime/hardware tests:** NOT RUN.

| Date | Task | Commit/evidence | Actual result |
|---|---|---|---|
| — | — | — | NOT_STARTED |

## 8. Change history
| Date | Revision | Change | Authorization effect |
|---|---|---|---|
| 2026-10-30 | 1.0-draft | Full device-fleet tasks, Unicode gate, failure and evidence plan | Future draft only |

- 2026-10-30 / 1.1-draft: aligned accepted USB-first, provisioning, two-physical/two-AVD and exact-Unicode directions; no hardware result inferred.
