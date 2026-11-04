# PHASE-03 — Screen wall, host resources and stream controls

**Revision/date:** 1.1-draft / 2026-10-30
**Plan:** DRAFT / NOT AUTHORIZED · **Execution:** NOT_STARTED · **Coding:** NO
**Proposed branch:** `phase-03` (not created)
**Base:** accepted `main` SHA after Phase 2 acceptance/merge; verify at entry
**Owner/reviewer:** assign at approval

> Phase 0 remains unfinished. This document does not authorize code, a stream benchmark, new processes on a user's host or workflow execution. It preserves accepted product choices while keeping versions, budgets and thresholds subject to evidence/approval.

## 1. Outcome, traceability and scope

Deliver real video-only previews in the complete V9 screen wall, with sole Device Actor input, truthful live telemetry and adjustable resource-bounded stream settings. Trace **P3-01…P3-19** in [master](../04_MASTER_IMPLEMENTATION_PLAN.md), **AC-03** in [acceptance](../05_ACCEPTANCE_AND_RISKS.md), [resource specification](../12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md), [architecture](../02_TECHNICAL_ARCHITECTURE.md), [V9](../06_UI_V9_MAPPING.md) and [decisions](../08_DECISIONS_AND_OPEN_ITEMS.md).

P3-11…P3-19 are the normalized standalone task IDs; legacy escaped duplicate P3 entries are not extra tasks. Their FPS/quality/preset/network/warning requirements are incorporated below, not dropped.

In scope: streams, V9 focus/zoom/scroll, host monitor, requested/effective/recommended state, Auto/Manual, scope/overrides, bounded admission, alerts, preview degradation/recovery. Out of scope: device display-resolution changes, Python input, platform automation, unbounded live streams, GPU/vendor support claims without tests and any V9 redesign. Device records remain uncapped by product policy; active streams remain bounded. No fonesi-W code reuse.

## 2. Entry, accepted behavior and open choices

Require Phase 0 acceptance/physical evidence, Phase 2 acceptance and merge (all earlier phases accepted), current repo/remote/branch/HEAD/status verification and express Phase/task authorization. Phase 4 does not run in parallel by default.

**Accepted product behavior — DEC-019:** Manual emergency throttling is **OFF by default** and may modify preview effective settings only after explicit opt-in. Requested settings remain unchanged. With safeguard OFF: warn, refuse new starts/increases beyond hard limits, preserve input resources and report actual degraded preview delivery; do not silently rewrite Manual settings. Auto restoration needs its own enabled choice and stable recovery evidence.

[Accepted C-06/C-07/C-15/C-17](../16_ACCEPTED_PRODUCT_DECISIONS.md): scrcpy is video-only; capability/host-derived budgets and UNKNOWN missing-sensor behavior are selected; USB validation comes first. Before code, record technical choices/evidence for scrcpy version/license/integration, codecs/decoders, range intersections, Windows adapters, benchmark workloads/safe-stop limits and per-host envelope. Preserve accepted Manual warning/apply semantics; do not reopen inclusion or missing-sensor behavior as unanswered product preferences. Exact FPS/bitrate/resolution/concurrency values and threshold/hysteresis/cooldown timings remain **unapproved until measured and recorded**; candidate ranges in UI specs are not universal guarantees. No unsafe override/experimental mode is introduced without separate approval.

Sequential order: **P3-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 17 → 16 → 18 → 19** (each number prefixed P3-). Task dependencies are explicit below; finish one task's test/review loop before moving on. P3-10 establishes the measured baseline; repeat its benchmark after resource controls for the Phase exit report.

## 3. Proposed modules and contracts

Actual paths follow approved Phase 1 structure. Proposed responsibilities: ScrcpyManifest/VideoAdapter; StreamProcessManager; frame/decoder queue; stream state/settings repository; HostResourceMonitor and Windows adapters; ResourcePolicyEngine; calibration profile store; V9 tile/input adapter; performance popover; telemetry/replay fixtures.

Key contracts:
- Stream identity = device ID + generation + process instance; ADB health and stream health are separate.
- Requested settings, resolved scope/override, admitted/effective settings, measured delivered values and recommendations are different fields with source/time/availability.
- Telemetry includes value/unit/source/adapter/availability/sample time/staleness; UNKNOWN is not zero or GREEN. Unsupported GPU, temperature/USB sensors are not fabricated.
- A setting change has revision/scope, allowed limits and per-device apply result. Precedence: hard capabilities/envelope bound application; explicit per-device override otherwise wins over inherited global defaults. Selected-device batch apply mutates only the explicitly snapshotted selection; clearing an override returns to global inheritance.
- A preview request cannot call device input or alter Android display settings. Manual pointer/key actions call the Phase 2 actor with current generation and coordinate transformation. They also require current device-operation ownership: active workflow ownership blocks conflicting manual taps/Home/Back unless an explicit approved pause/takeover drains work, reconciles uncertain effects and invalidates old UI evidence. Test this now with a simulated owner and again with real Phase 8 workflows.

## 4. Work packages

Every task **NOT_STARTED**; tests **NOT RUN**. Shared evidence/rollback rules below apply to every row.

| ID / concrete deliverable | Direct dependencies | Positive assertion | Negative / failure assertion | Evidence and task rollback |
|---|---|---|---|---|
| **P3-01 — Verified scrcpy pin and license.** App-local version/hash/origin/license manifest and video-only capability mapping. | Phase 0 scrcpy ADR; P1-10 | Verified Windows binary exposes the required supported video-only path. | Tampered/missing/unsupported build fails closed; unpinned PATH fallback rejected. | Binary/license review plus Windows launch trace. Restore prior verified bundle; do not alter third-party installs. |
| **P3-02 — Per-device stream lifecycle.** Start/pause/stop/restart with owned process handles, generation and bounded cleanup. | P3-01; P2-05 | Multiple streams attach to exact phones and close without orphans. | Process exit, startup timeout, disconnect/reused serial and stale frames cannot be reported as healthy/new device video. | Windows physical stream/process traces. Stop only owned stream process; retain device actor. |
| **P3-03 — Focused/selected/background profiles.** Profile model derives bounds from host/device/backend, not universal values. | P3-02; Phase 0 benchmark | Focus promotes within approved envelope; background uses lower budget/pauses with truthful status. | Unsupported FPS/codec/resolution is refused, not silently reported as effective; insufficient capacity does not exceed hard limit. | Profile unit tests and physical apply/read-back. Restore last admitted profile, keep requested preference separately. |
| **P3-04 — Render frames in V9 tiles.** Correct aspect/orientation, generation-tagged frames, empty/loading/error states and internal index badge. | P3-03 | Live physical image matches selected device; tight tile geometry and Dark/Light match V9. | Corrupt/stale/out-of-order frames, decode failure and rotation do not paint another device or stretch image. | Same-viewport before/after and real frame traces. Detach decoder/display error, not actor. |
| **P3-05 — Ctrl+wheel whole-tile zoom.** Display scaling only, bounded to usable dock/wall layout. | P3-04 | Entire tile including chrome scales, preserving aspect; stream resolution unchanged. | Rapid wheel, min/max size and focus loss cannot send a phone scroll or change capture settings. | UI event tests + visual parity. Reset tile scale only; no device state rollback. |
| **P3-06 — Inside-phone versus outside-wall scroll.** Hit testing and explicit routing. | P3-05; P2-08 | Wheel inside image sends actor scroll to active phone; outside scrolls wall. | Popover/modal/letterbox boundary and Ctrl modifier cannot trigger both routes or a background phone. | UI event assertions plus physical target trace. Cancel pending undispatched gesture; keep already dispatched outcome truthful. |
| **P3-07 — Fit/filter/focus modes.** Fit-to-panel, selected/all and double-click focus preserving selection vs active target. | P3-06; P2-10 | Resizing dock and switching modes retains correct phone identity and layout. | Disconnect during focus, empty selection and repeated double-click do not move input to unintended device. | All V9 modes/viewport screenshots and event tests. Restore prior view selection, no physical action implied. |
| **P3-08 — Sole actor pointer/key route.** Scale/rotation/letterbox transform with explicit serial/generation. | P3-07; P2-07/08 | Visible point maps to intended lab control exactly through DeviceActor; keyboard targets active device only. | Missing input authority, active operation-owner conflict, outdated dimensions, rotation and concurrent input prevent dispatch or serialize; no scrcpy input channel remains active. Manual input cannot interleave into a simulated workflow merely because commands are individually serialized. | Process/config audit + actor traces on two physical devices. Disable interactive preview while retaining read-only video if unsafe. |
| **P3-09 — Backpressure, hidden pause and failed-stream restart.** Bounded frame queue/drop policy and bounded restart with reason. | P3-08 | Hidden preview pauses decode and resumes with fresh frame; failed video restart leaves actor healthy. | Slow renderer/decoder, repeated crashes, reconnect and cancellation do not cause unlimited queue/restart loop or false ADB disconnect. | Queue stress and Windows process/fault logs. Pause/stop failing preview, preserve queued device work. |
| **P3-10 — Measured stream envelope.** CPU/RAM/GPU/USB-or-network/latency matrix and baseline overhead. | P3-09; approved lab limits | Increasing approved stream workloads produce raw samples and a reproducible host-specific safe profile. | Unsupported sensor stays unavailable; excessive pressure stops the benchmark safely, not indefinite scale-up. | Exact host/driver/device/codec/profile logs, delivered FPS/drops and actor latency. Return to last safe profile and stop only benchmark-owned load. |
| **P3-11 — HostResourceMonitor.** Timestamped CPU/RAM/GPU/disk/network plus process/stream/worker-availability telemetry. | P3-10; P1-04 | Real Windows counters include units/source/time; multiple GPU adapters distinguished; network/stream stats tied to observed source. | Missing GPU, stale/failed probe, out-of-order sample and disk error show UNKNOWN; sampler never blocks actor. | Real Windows supported/unsupported adapter results + replay tests, monitor-on/off overhead. Disable failed adapter/reduce bounded sampling with truthful stale state. |
| **P3-12 — Compact performance popover.** Existing right dock only; controls/status accessible without changing six-tab layout. | P3-11; P3-07 | Open/close/resize/theme and keyboard focus preserve monitor geometry and phone controls. | Rapid close/open, focus drift and popup wheel cannot leak input behind panel; unavailable sensors remain explicit. | V9 same-viewport images and repeated interaction tests. Hide panel, leave safe current profiles; never redesign shell to fit controls. |
| **P3-13 — FPS/resolution/bitrate/concurrency controls.** Supported bound intersection, requested/edit/applied values and per-device result. | P3-12; P3-03 | Supported settings apply and display measured/effective values; per-device stream enable/pause works. | Invalid/out-of-range/stale revision and partial backend failure cannot claim requested=effective; unsafe increase is blocked with reason. | Unit boundary tests plus Windows physical read-back. Restore last admitted setting on failed apply; retain requested choice/error for review. |
| **P3-14 — Auto/Manual, global/selected/overrides and presets.** Eco/Balanced/Smooth/Custom derive from benchmark profile; reset-to-global explicit. | P3-13 | Exact selected snapshot receives batch change; override marker/reset/Auto-to-Manual persist correctly. | Empty/stale selection, newly connected phone and repeated Apply cannot mutate devices outside scope; Manual defaults throttle OFF. | Scope/precedence matrix and real per-device results. Revert the configuration revision only for known changed members; preserve partial-result audit. |
| **P3-15 — Requested/effective/recommended and warnings.** GREEN/AMBER/RED/UNKNOWN with cause/time/action, no unsupported bottleneck inference. | P3-14; P3-10/11 | Sustained approved threshold crossing produces actionable warning and measurable recommendation when available. | Noisy sample, sensor outage, stale recommendation and unchanged requested setting cannot create flicker or fake precise savings. | Replay timelines and real load evidence; text/icon accompanies color. Clear recommendation validity on bad telemetry, not by showing GREEN. |
| **P3-16 — Emergency preview throttle/recovery.** Implement accepted DEC-019, separate restore opt-in and audit. | P3-17; P3-14/15 | Auto degrades background first; Manual ON can temporarily lower effective preview settings; stable enabled restore returns gradually toward requested values. | Manual OFF must not rewrite requested/effective configuration; new unsafe starts blocked; crash/restart and threshold oscillation cannot erase opt-in or trigger unwanted restoration. | Toggle/state/recovery traces, configuration diffs and physical preview results. Stop policy adjustment, preserve requested settings and explicit effective-state reason. |
| **P3-17 — Calibration/budget/adaptive scheduling.** Host-specific profile, focused/selected priority, bounded stream/vision budgets and invalidation. | P3-10/11/14/15 | Profile selects admitted streams within measured envelope; hardware/driver/runtime change invalidates calibration. | No profile/stale profile, starvation/backpressure and conflicting override cannot assume unlimited budget or kill actor. | Deterministic scheduler fixtures and host calibration rerun. Fall back to approved conservative profile or refuse new streams; do not invent an envelope. |
| **P3-18 — Overload/sensor/manual fault suite.** Integrated CPU/RAM pressure, unsupported counters, stream drops and recovery. | P3-16/17 | State transitions and operator choices match accepted controls on actual Windows host. | Stale/absent GPU, sampling failure, Manual OFF/ON, delayed backend result and repeated overload remain auditable/non-oscillating; no false-zero telemetry. | Fault matrix/replay plus safe Windows load injection. Stop owned load and return to last verified profile; leave genuine warnings visible. |
| **P3-19 — Input/workflow integrity under stream control.** Instrument actor ordering/cancellation while every stream operation executes. | P3-18; P2-12 | On two physical phones, reversible actor workload stays exact/serialized through apply/pause/restart/throttle. | Decoder/sampler failure and overload cannot lose/duplicate/retarget input or claim a timed-out action succeeded. | Actor traces with stream events and approved latency comparison. Disable preview feature before sacrificing actor correctness. Full real-workflow regression remains mandatory in Phase 8/11. |

## 5. Benchmark and evidence contract

Approve the workload and safe-stop limits before measurement. Sweep supported FPS/resolution/bitrate/codec combinations and increasing stream counts (start small), focused plus background priorities, different physical resolutions, USB first (Wi-Fi only after its dedicated authenticated certification) and CPU/GPU decode where actually available. Record warmup, repeated run duration, raw time series, sample gaps, delivered FPS/frame drops, memory growth, latency distribution, device actor timings and recovery. Compare sampler/stream OFF vs ON. Approver selects supported envelope and thresholds from these data; no arbitrary maximum phones or fixed utilization limit is committed here.

Phase 3 has no real Phase 4 vision worker or Phase 8 workflow yet: label representative CPU/queue loads and reversible actor workloads **synthetic**, not OCR/workflow acceptance. Add actual vision+stream integration regression in Phase 4 and end-to-end workflow/resource regression in Phases 8/11. Do not postpone actor correctness already testable in this Phase.

Use Phase 1 harness for unit/contract/UI tests and record actual commands when authorizing execution. Windows counter/process/decoder tests and physical-device video/input tests are separate required layers. Linux tests, replayed metrics or AVD frames cannot certify actual GPU counters, Windows resources, USB or physical encoder behavior. Evidence includes task/case, SHA, UTC, host/build/driver, device/app/Android/locale, binary/model/profile versions, raw source, expected/actual, result and sanitized artifact hashes. Private captures stay in approved storage. C-13 retention is 7 days for captures/UI/OCR and 30 days for technical logs, protecting unresolved recovery evidence; no automatic cloud upload.

## 6. Recovery, risk and exit

Rollback strategy: disable new stream admission, stop only owned video/decoder/sampler resources, preserve DeviceActor, durable state and requested settings; restore last verified compatible stream configuration. Never change physical screen resolution or kill an active job to improve FPS. Frame buffers/temporary files are bounded and cleaned by ownership. New settings schemas use migration/backup from Phase 1; unverified effective state is UNKNOWN until observed.

Risks: driver-specific counters → UNKNOWN; codec incompatibility → capability-disabled preview; overload → preserve actor before preview; Manual intent loss → DEC-019 test gate; visual drift → parity gate; unmeasured host → no universal support claim. Owners assigned at approval.

- [ ] P3-01…P3-19 PASS or explicit approved deferral with downstream impact.
- [ ] AC-03: video-only, sole input owner, V9 zoom/scroll/focus, truthful telemetry and scope/override controls verified.
- [ ] Manual OFF/ON and restore semantics pass; requested/effective/recommended remain distinct.
- [ ] Benchmark rerun after final implementation establishes approved per-host envelope and no input integrity regression.
- [ ] Required physical/Windows plus full unit/UI/contract regression and package smoke pass; vision/workflow future regression obligations recorded, not marked passed.
- [ ] Acceptance report/status/PR reviewed; user acceptance and authorized merge before Phase 4.

**Approval:** PENDING for this Phase · **Coding:** NO · **Actual runtime tests:** NOT RUN.

| Date | Task | Commit/evidence | Actual result |
|---|---|---|---|
| — | — | — | NOT_STARTED |

## 7. Change history
| Date | Revision | Change | Authorization effect |
|---|---|---|---|
| 2026-10-30 | 1.0-draft | Normalized 19 tasks, DEC-019 safeguards, measured controls and evidence split | Draft only; product decision preserved |

- 2026-10-30 / 1.1-draft: linked accepted C-06/C-07/C-13/C-15/C-17; version and benchmark gates remain open evidence work.
