# Hardware Resource Manager & Stream Controls

**Revision:** 1.2-draft · **Date:** 2026-10-30
**Status:** Product direction accepted under DEC-019 and [C-04/C-06/C-07/C-15/C-17](16_ACCEPTED_PRODUCT_DECISIONS.md#1-accepted-checklist). Numerical limits and detailed implementation contracts remain subject to measured feasibility/Phase approval.
**UI placement:** Existing V9 right-side device monitor; preserve overall layout.

## 1. Product decision

Fonesi-Auto must not lock its performance behavior to the first test PC. C-07 accepts validating the current Windows host first and publishing only tested support, not claiming universal Windows capacity. Detect current host resources at runtime, benchmark the host/device combination and expose user-adjustable stream controls (C-15). scrcpy video-only is selected (C-06); exact versions/codecs/limits still require tests.

The user must be able to:
- Select Auto or Manual stream mode.
- Adjust stream FPS.
- Adjust stream resolution/scale.
- Adjust stream bitrate/quality.
- Choose which phones stream (all / selected / focused).
- Set a maximum number of concurrent streams within the tested host capability.
- See live host resource usage and warnings before/during overload.

The system must distinguish:
- **Configured/requested settings:** what the user selected.
- **Effective settings:** what the stream process is currently applying.
- **Recommended settings:** what the resource manager recommends for the current host load.
- **Capability limits:** what the host, decoder, Android device and stream backend can actually support.

Never silently display the requested setting as effective if the stream backend has applied a lower value.

## 2. UI placement and behavior

Do not redesign V9. Add a compact **Stream / Performance** control popover or expandable panel to the header of the existing right-side device monitor. It must fit the current right dock and be resizable with that dock.

### 2.1 Global controls
- Mode: Auto / Manual.
- Stream scope: Focused device / Selected devices / All connected devices.
- FPS slider.
- Resolution slider or discrete resolution selector, bounded by device resolution and measured host capacity.
- Bitrate/quality slider or Low / Balanced / High presets with an Advanced section.
- Maximum concurrent streams slider.
- Button: Apply.
- Button: Use recommended settings.
- Toggle: Allow emergency stream throttling when host resources enter critical state (Manual default OFF under accepted DEC-019; explicit opt-in required).
- Toggle: Restore latest requested settings automatically after resources recover (separate explicit enablement, never inferred from emergency-throttle consent; recovery window is benchmark-derived).

### 2.2 Per-device override
- Global settings are defaults.
- A device may inherit global settings or use a per-device override.
- Show the effective FPS, resolution, bitrate and stream state for each phone.
- A per-device override must be visibly marked so the user understands why that phone differs from the global setting.
- Batch edit selected devices is supported.
- Applying settings to selected/current devices must not mutate devices outside that captured scope. Saving global defaults is a distinct explicit operation; inherited settings apply as specified in the proposed precedence contract (§3.6).

### 2.3 Live resource panel
Display actual, timestamped measurements:
- CPU total utilization and Fonesi-Auto process utilization.
- RAM total/available and Fonesi-Auto working set.
- GPU engine utilization where Windows exposes it.
- Dedicated/shared GPU memory where the adapter/driver exposes it.
- Disk free space and optional disk I/O pressure.
- Vision Worker CPU/RAM.
- Active stream count, per-stream FPS, resolution, bitrate and dropped frames when available.
- ADB transport state and stream state separately.
- Temperature only when a reliable sensor API exists; otherwise show Not available.

The UI must never fabricate unsupported sensor values or show missing values as zero.

## 3. Stream settings model

### 3.1 FPS
- User-adjustable target FPS.
- Candidate exploration range: 1–60 FPS, including common 5–60 presets mentioned in the architecture/UI draft. Neither endpoint is a promised or approved universal range. Exposed request bounds are the intersection of the approved stream backend/device profile and validated host benchmark envelope. Reject out-of-range requests with an explanation; do not silently change the stored request.
- Do not hardcode 60 FPS as universally achievable.
- In Auto mode, lower FPS for background devices and raise it for the focused device when budget permits.

### 3.2 Resolution
- User-adjustable max stream resolution or scale.
- Candidate options may include 360p, 480p, 720p, 1080p and Original, but the available options must be intersected with the device's actual resolution, scrcpy capability and tested decoder profile.
- Keep aspect ratio; do not distort the device image.
- UI tile zoom changes display size only; it must not automatically increase Android capture resolution.

### 3.3 Bitrate / quality
- User-adjustable target bitrate or a Low / Balanced / High quality preset.
- Advanced mode may expose bitrate in Mbps.
- Actual allowed range is chosen after scrcpy version/codec tests and host benchmark.
- Display configured and effective bitrate separately when measurable.
- Higher bitrate must not be assumed to improve text legibility if the stream resolution is too low.

### 3.4 Concurrent stream limit
- The phone registry has no artificial record cap.
- Concurrent live streams are bounded by benchmarked CPU/RAM/GPU/decoder/USB capacity.
- User can set a lower limit.
- Normal operation cannot exceed the current certified host concurrency envelope. A warning alone does not authorize exceeding it. No experimental override is part of the accepted first-release scope; feasibility benchmarks do not grant a production ignore-limits switch.
- Focused device receives priority; selected devices next; background devices last.

### 3.5 Slider bounds and user override
- Slider ranges are computed from the intersection of backend capability, Android device capability and the current host's tested hard envelope.
- The UI must distinguish the recommended zone from the technically supported maximum.
- In Manual mode, the user may move above the recommended zone while remaining inside the tested hard envelope; show AMBER/RED impact warnings and require an explicit Apply confirmation when the selected profile is predicted to overload.
- Never allow a slider to exceed a hard technical limit reported by scrcpy/device/backend.
- Maximum concurrent streams is bounded by the current host's certified stream envelope. The user can choose any lower value.
- The first release does not expose an unsafe "ignore all limits" switch.

### 3.6 Apply scope, precedence and revisions — PROPOSED implementation contract

Review detailed persistence/revision mechanics with [ADR-0004](decisions/ADR-0004-runtime-data-contracts.md) and the Phase 3 plan before coding. Accepted C-15/DEC-019 behavior is not reopened; this does not introduce a new V9 layout.

1. Resolve requested settings from explicit per-device override, otherwise global default. A batch Apply writes device overrides for the captured current/selected/all-connected target set; it does not silently save global defaults. A separate explicit Save defaults changes inheritance; preview names the inheriting devices affected.
2. "All connected" is a snapshot of device IDs at Apply, not permission to mutate devices that connect later. New devices inherit the saved global default. Per-device overrides persist until explicitly reset to inheritance.
3. Every operation carries an expected settings revision, exact target IDs and capability-profile revision. Validate hard bounds before applying; stale revisions require refreshed preview, not silent last-write-wins. Resolve effective Auto settings only after desired settings have been validated.
4. Apply reports per-device pending/applied/rejected state and reason. A partial batch success is visible; preserve the prior known setting for failures and offer explicit retry. Do not show a requested change as effective until the stream backend confirms/applies it; backend restarts/reconfiguration failures remain visible.
5. Precedence for effective operation is hard technical envelope, then current global concurrency budget, then selected mode policy, then device requested profile; priority is focused, selected, background. A device override cannot evade hard limits or the shared concurrency budget. A policy does not rewrite the stored requested value.
6. Record policy changes with request revision, opt-in state, before/after effective values, resource evidence and affected devices. Restore to the **latest** requested revision after sustained recovery and only under the approved restore choice; never overwrite a user's newer edit with an old throttle snapshot.
7. Unknown/stale telemetry is UNKNOWN, not evidence to increase an Auto budget or silently throttle Manual streams. Use the last still-valid certified envelope and conservative admission rules; require recalibration/review if that envelope is invalid. Exact admission behavior/thresholds need benchmark approval.

## 4. Auto and Manual modes

### Auto mode
- Continuously samples host resource signals.
- Uses a configurable target utilization and safety headroom derived from Phase 0 benchmarks.
- Allocates stream budget by focus/selection priority.
- Reduces background stream FPS/resolution/bitrate before touching foreground workflow execution.
- Pauses background preview streams if required.
- Restores quality gradually after sustained recovery; avoid rapid oscillation.

### Manual mode
- The user chooses requested FPS, resolution, bitrate and concurrency.
- The app shows estimated resource impact and a live warning before applying a setting that is likely to overload the host.
- The user can choose Use recommended settings.
- **Accepted DEC-019:** Manual mode must not silently change the user's selected values. The emergency-throttle toggle is OFF by default in Manual mode; only explicit user opt-in permits temporary policy-driven lowering/pausing of background preview streams during critical host pressure. When enabled, the safeguard must:
  1. Show an explicit warning/notification.
  2. Record requested vs effective settings.
  3. Record why throttling occurred.
  4. Restore the requested settings only after a stable recovery window if auto-restore is enabled.
- If emergency throttling is disabled, do not silently change the user's manual stream settings or programmatically throttle/pause existing previews under that policy. Continue to warn, reject new stream starts/increases exceeding hard limits, and preserve workflow/device-control ownership. Naturally lower delivered FPS, backend failure or connection loss is reported as degraded/unavailable effective output, not falsely described as an authorized settings change.
- No stream policy may cancel or corrupt an ADB workflow command.

## 5. Realtime monitoring and alert rules

### 5.1 Sampling
- Use a lightweight host sampler with a configurable interval; target 1–2 seconds for UI responsiveness after benchmark.
- Use rolling windows for decisions; do not react to a single noisy sample.
- UI may repaint more often than the system probe while showing the last measured value/time; it must not fabricate interpolated sensor readings as new measurements. Mark samples stale after the approved freshness window.
- Sampling must be resource-bounded and must not become a significant source of CPU load.

### 5.2 States
- GREEN: within the tested operating envelope with sufficient headroom.
- AMBER: approaching a resource threshold or estimated stream budget.
- RED: critical pressure or repeated dropped frames/decoder stalls.
- UNKNOWN: sensor unavailable or stale; never assume GREEN.

Thresholds are configurable and derived from Phase 0 benchmark results, not arbitrary universal constants. Use hysteresis and a recovery window to prevent warning flicker.

### 5.3 Alert content
Every alert states:
- Which resource is constrained.
- Current measurement and timestamp.
- Configured vs effective stream settings.
- Estimated safe/recommended adjustment.
- Affected devices/streams.
- Actions available: lower FPS, lower resolution, lower bitrate, reduce concurrent streams, pause background streams, or keep manual settings and accept degraded stream quality.

Do not claim a specific bottleneck if the relevant sensor is unavailable.

## 6. Resource protection priority

When the host is overloaded, priority order is below. Policy-driven preview reductions/pauses apply in Auto mode or in Manual mode only with accepted DEC-019 opt-in enabled; the priority list is not an unconditional Manual override:
1. Preserve ADB command ownership and workflow execution integrity.
2. Preserve the focused phone stream where possible.
3. Preserve selected phone streams.
4. Reduce background stream FPS/resolution/bitrate.
5. Pause background preview streams if needed.
6. Queue OCR/vision work and limit new noncritical stream starts.
7. Never kill a running workflow just to improve preview quality unless the workflow itself enters an unsafe device state.

C-04 ownership remains intact through throttling: manual Home/Back/taps, APK mutations and proxy changes cannot slip between workflow steps. Explicit safe takeover requires drain/reconciliation and revalidation; resource policy does not release ownership.

Stream overload must not be conflated with ADB disconnect or device workflow failure.

## 7. Host capability detection

On application startup and periodically:
- Detect Windows version/build.
- Detect CPU model, logical processors and available performance counters.
- Detect physical/available RAM and process memory.
- Detect GPU adapter(s), supported utilization counters and dedicated/shared memory if available.
- Detect storage free space.
- Detect ADB/scrcpy/Python worker versions and health.
- Detect display scaling and host display size for UI layout only.
- Record sensor availability and sampling errors.

GPU monitoring is adapter/driver-dependent. Use Windows performance counters/PDH or supported system APIs as the baseline; optional vendor APIs may supplement data. Do not require NVIDIA hardware. If GPU metrics are unavailable, use CPU/RAM/stream latency/dropped-frame measurements and mark GPU UNKNOWN.

Do not assume temperature, USB bandwidth or encoder utilization can be read on every Windows machine. These are optional metrics with explicit availability state.

## 8. Benchmark and calibration

C-07/C-17 require current-host/USB acceptance first, at least two physical devices for isolation, and two AVD profiles for repeatability with initially one running. AVD results do not replace physical-device acceptance; Wireless Debugging remains disabled until its authenticated pairing/reconnect tests pass.

Phase 0 and Phase 3 must benchmark:
- One, two, four and progressively more concurrent streams until the host reaches a defined safe limit.
- Focused high-quality stream plus background low-quality streams.
- Different Android resolutions and codecs.
- FPS and bitrate combinations.
- CPU-only vs GPU-accelerated decode where supported.
- RAM growth, GPU memory, frame drops, latency and recovery.
- Vision Worker running concurrently with streams.
- ADB input latency while multiple streams are active.

Calibration produces a host capability profile:
- host fingerprint (non-sensitive hardware profile)
- Windows build
- CPU/RAM/GPU capabilities
- tested stream profiles
- maximum certified concurrent streams
- recommended Auto thresholds
- benchmark date and app/scrcpy version

The profile is local to that PC and must be recalibrated when major hardware/driver/runtime changes are detected. It is not a hard-coded limit for every user's machine.

## 9. Acceptance criteria

- User can switch Auto/Manual mode; switching to Manual without a prior explicit safeguard choice starts with emergency throttling OFF (DEC-019).
- Slider ranges reflect backend/device/host capability; values above the recommended zone but below the hard limit require a clear warning and Apply confirmation.
- Values beyond hard technical limits cannot be applied.
- Manual mode does not silently change user settings; emergency throttling is opt-in and OFF by default.
- FPS, resolution/scale, bitrate/quality and concurrent stream limit are adjustable.
- Global and per-device settings behave as specified.
- Right-side V9 device dock hosts the control panel without redesigning the layout.
- Live CPU/RAM and supported GPU measurements refresh with timestamp.
- Missing sensors show UNKNOWN/Not available, never zero.
- Amber/Red warnings use measured values and hysteresis.
- Configured and effective settings are always distinguishable.
- Auto mode reduces background stream load before affecting workflows.
- Manual mode respects requested values unless emergency throttling is explicitly enabled.
- Emergency throttling is logged and can restore the latest requested settings after stable recovery only when auto-restore is enabled; newer edits cannot be overwritten by an older snapshot.
- Stream overload never steals ADB input ownership or corrupts workflow commands.
- Tests cover unsupported GPU counters, stale metrics, sensor errors, CPU/RAM pressure, stream drops, manual override and recovery.

### 9.1 Evidence checklist — required, not yet executed

| Case | Observable pass condition | Trace |
|---|---|---|
| Manual safeguard OFF | Under injected critical load, policy emits warnings/rejects unsafe new increases but issues zero automatic throttle/pause changes to existing Manual previews; requested values unchanged | DEC-019; Phase 3 mode/overload tests |
| Manual safeguard ON | Explicit opt-in revision precedes first throttle event; background previews change before focused; notification and requested/effective/reason records present | DEC-019; Phase 3 emergency-throttle tests |
| Auto overload/recovery | Sustained windows/hysteresis govern downgrade and gradual recovery; input actor remains sole owner | Phase 0/3 benchmark and resource-policy tasks |
| Auto-restore and concurrent edit | Disabled restore does not raise quality automatically; enabled restore uses latest request, not old saved snapshot | Phase 3 revision/recovery tests |
| Unsupported/stale/error sensors | Null/unavailable state and original timestamp shown; no fabricated GPU=0 or GREEN inferred from missing data | Phase 0 telemetry gate; Phase 3 telemetry tests |
| Scope/batch failure | Untargeted overrides unchanged; all-connected target snapshot fixed; each failed member visible; global default saved only explicitly | Phase 3 selected/per-device controls |
| Capability change | Out-of-range request rejected, host/driver/backend change invalidates calibration, delivered FPS displayed independently | Phase 0/3 profiles; P11-06 |
| Concurrent vision/stream load | Zero wrong-device commands or ownership violations; no lost input command; record input latency/timeout counts versus approved baseline budget | Phase 0/3 performance gate; P11-06 |

Numerical sampling/latency/CPU-overhead/FPS/drop/recovery thresholds must be recorded in the approved benchmark profile before a test can PASS. This document does not claim "no latency increase" without a measured budget.

## 10. Remaining technical measurement gates
- Exact FPS/bitrate/resolution ranges after scrcpy benchmark.
- Exact threshold values after host test matrix.
- Select supported system-wide GPU counters and any necessary vendor adapter from measured coverage/overhead, preserving explicit unavailable behavior (C-15).
- No production override of the certified concurrency envelope; record feasibility benchmark limits separately from normal operation.
- Sampling interval and alert cooldown after performance profiling.

- Tune auto-restore recovery windows and review settings persistence/apply/revision mechanics (§3.6) in the Phase plan. Restore needs its separate explicit enablement; Manual emergency safeguard OFF/opt-in is accepted (DEC-019), not an open default choice.

## Change History

- 2026-10-30 — 1.1-draft: applied accepted DEC-019 Manual OFF/opt-in semantics; separated natural preview degradation from policy changes; reconciled candidate FPS/concurrency bounds, proposed scope/revision contracts and added observable test obligations. Preserved V9 placement and all resource requirements; benchmark values remain unapproved.

- 2026-10-30 — 1.2-draft: synchronized C-04/C-06/C-07/C-15/C-17 support/resource direction, selected scrcpy video-only, current-host/USB-first acceptance and ownership preservation. Removed reopened product-preference wording while retaining exact benchmark/schema gates; no measured performance result claimed.
