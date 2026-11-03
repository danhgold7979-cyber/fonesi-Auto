# P3-11.F bounded renderer rate observations

Prepared 2026-11-03 23:45 UTC. **ADOPTED for bounded source implementation at
23:48 UTC after independent entry review CLEAR under delegated phase authority.** Follow-on to public `602e8f93b67d436b3de302929ccf32c38a8c40da`,
local `08dbfaba782d280e6391554f076c1960698d66f5`, identical tree
`ce6f2d3e7ade5320eebc4223a4353fa87c676e8d`. Existing hidden-decoder hosted closure
documentation is preserved for the next meaningful publication. Only P3/P10 lanes
are active. No device, user computer, new provider, credential or security access.

## 1. Useful application scope and exclusions

Add actual interval-average canvas draw rate and validated AVC media-payload rate
to the existing captured preview accounting read. Both use two explicit user reads
of the current decoder's actual counters. This is useful partial P3-11.F telemetry,
not a stream settings/control feature or a full fixed-cell completion.

These numbers are not phone capture FPS, encoder target/effective bitrate, network
utilization, GPU/compositor/physical presentation or certified host capacity.
Native drops, global stream totals and applied/native rates remain UNKNOWN.
Do not guess benchmark settings, add resource pressure policy, rewrite requests,
change the producer/DeviceActor/public IPC, restart sessions or access devices.

## 2. Exact counters and observation identity

Extend the immutable local `VideoAccounting` sample with `videoId`, `segment` and
`payloadBytes`. The videoId is the existing private-port UUID, not a device serial.
Segment is the decoder's existing generation, advanced on SESSION/CONFIG,
presentation fences and Stop. Expose the same scalar through `snapshot()` for
render-time currentness checks without a clock call. It grants no authority.
Invalid or unsafe segment disables accounting only, not media behavior.

Count KEY/DELTA `totalBytes` exactly once at actual decoder admission, after strict
wire identity/order/PTS and full current-configuration AVC validation. Include
validated media later discarded for hidden/waiting-key/reset/Stop and held media;
do not count held processing again. Exclude SESSION and CONFIG, invalid/duplicate
media and framing overhead. Retain no media bytes to calculate rates. Checked
addition refuses values beyond Number.MAX_SAFE_INTEGER before mutation; use the
existing accounting-unavailable path without changing ACKs, native calls, outputs,
Stop or deadlines. Frame conservation equations remain unchanged.

## 3. Pure bounded interval calculation

Export a small pure `measureVideoRates(previous, current)` from the existing decoder
module, plus a shared 5000ms accounting freshness constant and readonly rate type.
Validate exact ordinary accounting fields, no accessors/extras/prototype tricks,
UUID/segment, finite monotonic observation times, safe nonnegative counters and
frame conservation. Samples must have the same videoId and segment, at least one
admitted media packet, and nondecreasing cumulative admitted/submitted/drawn/
discarded/waitingKey/reset/stopped/hidden/payloadBytes counters. Outstanding, pending
and held are current gauges and may decrease; dimensions are not cumulative.
No media or clock effects.

The interval must be finite and strictly `0 < end - start < 5000ms`. This reuses the
existing captured-sample freshness policy, not a benchmark/performance threshold.
Rates are delta drawn *1000/interval and delta payload bytes *8000/interval, computed
in an order that avoids unnecessary integer multiplication overflow. Require finite
nonnegative results. A valid interval with no events gives true zero. First read,
duplicate-time, stale or mixed-segment samples yield null/UNKNOWN.

Return immutable exact videoId/segment, start/end monotonic timestamps, intervalMs,
canvasFps and payloadBitsPerSecond, with explicit RENDERER_INTERVAL scope. Decimal
Mbps is bits/s divided by1000000 only for presentation. No rolling buckets,
timestamps per packet, sampling timer, polling, event log, extra per-frame React
updates or new calls to the media deadline-sensitive clock.

## 4. Renderer wiring and cancellation

Extend existing `readPreview`, `previewCapture` and `currentPreview`. Retain one
baseline and one captured result, O(1) storage. Every valid explicit read replaces
the baseline; stale/zero interval can establish a new baseline but not a rate.
Malformed/unavailable observation clears it. Require the same captured owner,
decoder instance and existing video/device/generation/registry eligibility fences.

Clear baseline/results on Stop, start replacement, failure, pagehide/unmount,
panel close, and SESSION/CONFIG/presentation transitions. Old handlers cannot
publish into a new panel/session. Rendering checks captured sample's segment against
the decoder's current segment, in addition to current owner and existing freshness;
old rates cannot remain visible after same-session config/hide/show invalidation.
The actual port handler clears captured UI immediately after a segment advance,
including CONFIG before an asynchronous capability check can publish state.
Reuse the existing monotonic-clock-fault latch, without renewing old observations.

Same-segment hidden-only intervals can show zero canvas draws/s and positive
validated payload rate. Use elapsed wall-monotonic interval, never visible-only
time. Intervals crossing hide/show/CONFIG/Stop are unavailable, including successful
draw callbacks that were invalidated reentrantly. Existing cumulative drawn/discard
accounting semantics are unchanged.

Preserve V9 layout, six tabs, dock dimensions and existing controls. Add concise
source, interval and unit text inside the current accounting block. Keep CAPTURED /
not-live language, explain that a second read within five seconds produces an
interval observation, and keep native/effective rates explicitly UNKNOWN. Read the
complete V9 reference before renderer changes. No visual-parity claim without proof.

## 5. Inventory and required verification

Expected source: `desktop/src/video-decoder.ts`, `desktop/src/renderer.tsx` and exact
named module-map bindings. Tests: decoder and actual transformed renderer tests;
existing main/bridge/protocol/host/UI fixtures only if their real schema changes.
No new modules or dependencies are required. Preserve all previous regressions.

Focused cases: known rates; first/duplicate-time/idle-zero/stale reads; malformed,
accessor, NaN/Infinity/backward/throwing clocks; byte overflow without changed media
effects; exact once-only hidden/waiting-key/held byte accounting; CONFIG/SESSION and
rejected media excluded; failed versus successful reentrant draw; segment/owner/
decoder/config/visibility/revocation/Stop and panel close/reopen invalidation; exact
labels/units and no extra IPC/timers/native work. Test actual application modules.

After source review, run strict TypeScript, lint/module boundaries, focused suites,
the full current desktop aggregate, foundation and Python suites, production/demo
and qualifier builds. Review final diff, freeze hashes/tree and publish non-force to
phase-03 with exact parent/ref verification. Monitor corresponding Windows source
CI to terminal; no optional device/native campaign is implied.

## 6. Coverage and remaining dependencies

Measured host/device envelope remains missing for P3-03/13-17 settings and policy.
This local observation feature does not depend on inventing that envelope. Full
P3-11.F, P3-09.C, Electron visibility/runtime/visual/native/device proof and P1-06
remain open. Fixed ledger N71/S5/I24 and technical task acceptance0/19 are unchanged.
