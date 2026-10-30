# Hardware Resource Manager & Stream Controls

**Revision:** 1.0-draft  
**Status:** Product requirement accepted for Phase 0/3 planning  
**UI placement:** Existing V9 right-side device monitor; preserve overall layout.

## 1. Product decision

Fonesi-Auto must not lock its performance behavior to the first test PC. It must detect the current Windows host resources at runtime, benchmark the host/device combination, and expose user-adjustable screen-stream controls.

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
- Toggle: Allow emergency stream throttling when host resources enter critical state.
- Toggle: Restore previous requested settings automatically after resources recover.

### 2.2 Per-device override
- Global settings are defaults.
- A device may inherit global settings or use a per-device override.
- Show the effective FPS, resolution, bitrate and stream state for each phone.
- A per-device override must be visibly marked so the user understands why that phone differs from the global setting.
- Batch edit selected devices is supported.
- Do not apply a global change to devices outside the selected scope.

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
- Candidate UI range: 1–60 FPS, but the effective range must be clamped to the supported scrcpy/device profile and validated benchmark envelope.
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
- User cannot set a limit above the current certified host envelope without an explicit warning and a controlled benchmark mode.
- Focused device receives priority; selected devices next; background devices last.

### 3.5 Slider bounds and user override
- Slider ranges are computed from the intersection of backend capability, Android device capability and the current host's tested hard envelope.
- The UI must distinguish the recommended zone from the technically supported maximum.
- In Manual mode, the user may move above the recommended zone while remaining inside the tested hard envelope; show AMBER/RED impact warnings and require an explicit Apply confirmation when the selected profile is predicted to overload.
- Never allow a slider to exceed a hard technical limit reported by scrcpy/device/backend.
- Maximum concurrent streams is bounded by the current host's certified stream envelope. The user can choose any lower value.
- The first release does not expose an unsafe "ignore all limits" switch.

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
- Manual mode must not silently change the user's selected values. The emergency-throttle toggle is OFF by default in Manual mode; the user may explicitly enable it to temporarily lower or pause background preview streams during critical host pressure. It must:
  1. Show an explicit warning/notification.
  2. Record requested vs effective settings.
  3. Record why throttling occurred.
  4. Restore the requested settings only after a stable recovery window if auto-restore is enabled.
- If emergency throttling is disabled, do not silently change the user's manual stream settings. Continue to warn, block new stream starts that exceed hard limits, and protect workflow/device-control resources; existing preview streams may degrade and must be reported.
- No stream policy may cancel or corrupt an ADB workflow command.

## 5. Realtime monitoring and alert rules

### 5.1 Sampling
- Use a lightweight host sampler with a configurable interval; target 1–2 seconds for UI responsiveness after benchmark.
- Use rolling windows for decisions; do not react to a single noisy sample.
- UI may refresh more often than the expensive system probe if it only interpolates the last sample, but must show the measurement timestamp.
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

When the host is overloaded, priority order is:
1. Preserve ADB command ownership and workflow execution integrity.
2. Preserve the focused phone stream where possible.
3. Preserve selected phone streams.
4. Reduce background stream FPS/resolution/bitrate.
5. Pause background preview streams if needed.
6. Queue OCR/vision work and limit new noncritical stream starts.
7. Never kill a running workflow just to improve preview quality unless the workflow itself enters an unsafe device state.

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

- User can switch Auto/Manual mode.
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
- Emergency throttling is logged and can restore prior settings.
- Stream overload never steals ADB input ownership or corrupts workflow commands.
- Tests cover unsupported GPU counters, stale metrics, sensor errors, CPU/RAM pressure, stream drops, manual override and recovery.

## 10. Decisions still open
- Exact FPS/bitrate/resolution ranges after scrcpy benchmark.
- Exact threshold values after host test matrix.
- Whether the first release uses only system-wide GPU counters or optional vendor adapters.
- Whether user may override the certified concurrency limit in an explicit experimental mode.
- Sampling interval and alert cooldown after performance profiling.
