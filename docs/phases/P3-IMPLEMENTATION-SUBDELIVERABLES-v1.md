# Phase 3 software subdeliverables — fixed ledger v1.0

**ADOPTED MEASUREMENT BASELINE — independent review CLEAR 2026-11-02 05:09 UTC.** Reporting only; not a new implementation authorization.
Prepared 2026-11-02 05:03 UTC; exact reviewed draft SHA256 `5036ad3e5d214be529a8315591fa265c785fc13800981710bf24cb7c8a2ad39e`. No tests, builds, downloads or runtime actions were performed to calculate this baseline. The prior whole-deliverable metric remains historical and separately labelled.

## 1. Scope frozen before evidence scoring

Source of scope: all 19 concrete deliverables, their positive/negative assertions and recovery obligations in `docs/phases/PHASE-03-screen-wall-resources.md` §4, cross-checked against §§1–6 and `docs/12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md`. The existing audited `docs/phases/P3-IMPLEMENTATION-CHECKLIST.md` remains a different metric.

Fixed denominator: **100 fixed functional subdeliverables, covering all 19 canonical tasks**. The decomposition follows independently deliverable behaviors in the canonical clauses, not a forced equal slot count. Unfinished tasks are decomposed as fully as completed work: each distinct build/output, lifecycle operation, resource adapter, policy/apply mode or failure-control behavior receives its own cell where it can be independently delivered without claiming the adjacent behavior. The cells describe delivered behavior, not a design/code/test/document phase, test count, lines of code, elapsed time or estimated effort. Tests are evidence for a cell, not extra percentage-bearing cells. Large and small cells are not asserted to require equal effort. The chosen granularity remains an explicit reporting convention, not an objective estimate of project completion. Counts vary by task because their named functional requirements vary; they are not weights chosen from current completion. Cross-cutting safety properties remain requirements of their functional cell, not bonus credit.

Coverage rules:
- Every canonical requirement must have a home below; named exclusions remain open, not silently removed from the denominator.
- A cell is checked only when **all** its named software behavior is implemented. Partial pieces can be described, but do not round up a cell.
- No cell may be split, moved, merged or added after progress scoring without a new ledger version, explicit reason and a bridge table. Recalibration is never reported as newly completed work.
- Dependencies, actual hardware/Windows/visual/performance evidence and formal acceptance remain separate gates; software-first work does not erase them.
- Mapping in §2 was independently reviewed before adopting §3's evidence overlay. Future changes require a new version and recomputation of all counts together.

Uniform cell statuses:
1. **N — NOT_IMPLEMENTED:** the entire named software cell is not implemented; includes partial/design-only work.
2. **S — SOURCE_IMPLEMENTED:** the entire bounded software cell exists, but its required app/backend integration or software tests are not all established. Component/source/managed tests may exist; this status does not mean untested code.
3. **I — INTEGRATED_SOFTWARE_TESTED:** the cell is implemented in its intended integration path and has attributable passing software tests. For a user-facing feature this includes actual app wiring, not merely a helper. Hardware/visual acceptance is still separate.

Source coverage = `(S + I) / 100`; integrated software coverage = `I / 100`. Never add these percentages together. No 0.5 credit is assigned to S, and no effort estimate is implied.

## 2. Complete scope-only mapping (no scores in this section)

| Cell | Complete software subdeliverable |
|---|---|
| P3-01.A | App-local runtime manifest with exact version/origin, artifact/dependency identity and applicable license/notice closure |
| P3-01.B | Fixed supported video-only capability/option mapping, excluding controller/audio and unsupported modes |
| P3-01.C | Exact derived server source patch and its reviewed toolchain/build/output identity (official server bytes never stand in for modified output) |
| P3-01.D | Exact Windows consumer build and reviewed toolchain/dependency/output identity |
| P3-01.E | Pair packaging with exact server/consumer artifact binding and app-local installation layout |
| P3-01.F | Restore a prior verified compatible bundle without altering third-party installs or admitting unverified rollback bytes |
| P3-01.G | Runtime byte/path/pair admission; missing/tampered/unsupported/unpinned PATH refusal before launch |
| P3-02.A | Exact-target, generation/process-instance-bound owned stream start and truthful startup/failure state |
| P3-02.B | Per-device pause/resume lifecycle with explicit state, preserving actor/device identity |
| P3-02.C | Preemptive owned stop, retained process/channel work, bounded cleanup and truthful uncertain retirement; no unrelated process termination |
| P3-02.D | Per-device owned restart with exact new process/generation state and bounded failed-start/exit handling |
| P3-02.E | Multiple independent streams and cross-device disconnect/reused-serial/stale-frame isolation; no unrelated actor disruption |
| P3-03.A | Focused/selected/background requested profile model |
| P3-03.B | Host/device/backend supported-bound intersection, without universal guessed values |
| P3-03.C | Focus promotion within admitted capacity, preserving independent request/effective state |
| P3-03.D | Lower-budget or paused background policy with truthful per-device status |
| P3-03.E | Apply/refusal/read-back and rollback-to-last-admitted profile; unsupported FPS/codec/resolution and exhausted capacity remain explicit |
| P3-04.A | Decoder producing actual displayable frames for the V9 delivery path |
| P3-04.B | Device/generation/frame-sequence-bound routing to the correct V9 tile |
| P3-04.C | Aspect/orientation/rotation geometry and image placement without stretch |
| P3-04.D | Honest empty/loading/error content plus internal index badge in existing Dark/Light tight tile geometry |
| P3-04.E | Corrupt/stale/out-of-order/decode-failure rejection and display detach/recovery without stopping the actor |
| P3-05.A | Whole-tile display scale including chrome and aspect, separate from Android capture/stream settings |
| P3-05.B | Ctrl+wheel handling including rapid events/latest-state updates and focus-loss refusal |
| P3-05.C | Usable minimum/maximum zoom and dock/wall footprint bounds under resizing |
| P3-05.D | Local reset/control integration, preserving stored preference/capture values and guaranteeing zero phone scroll/input from zoom |
| P3-06.A | Inside-image hit testing with image/letterbox/edge distinction |
| P3-06.B | Inside-image wheel routes one current active-phone scroll through the sole actor |
| P3-06.C | Outside-image wheel scrolls wall only; Ctrl routes zoom rather than phone scroll |
| P3-06.D | Modal/popover/focus/rapid-event exclusion and cancellation of undispatched gesture, without fabricating undo of dispatched work |
| P3-07.A | Fit-to-panel layout behavior under dock/viewport resize |
| P3-07.B | Selected/all filtering with honest empty selection |
| P3-07.C | Double-click focus transitions preserving selected set versus active input target |
| P3-07.D | Repeated-focus/disconnect recovery and prior-view restoration without unintended target change |
| P3-08.A | Scale/rotation/letterbox coordinate transform bound to current image dimensions and device generation |
| P3-08.B | Current pointer dispatch solely through DeviceActor with explicit target/authority; no scrcpy input path |
| P3-08.C | Current keyboard dispatch solely through DeviceActor to active device, without selected/group misrouting |
| P3-08.D | Operation-owner conflict guard, explicit approved takeover/drain/reconciliation and stale-evidence refusal |
| P3-08.E | Concurrent input ordering and failure handling; unsafe interactive preview disabled while safe read-only video remains |
| P3-09.A | Bounded decoder/frame queue and drop/backpressure policy |
| P3-09.B | Truthful delivered-frame/drop accounting for actual decode/render queue |
| P3-09.C | Hidden-preview decode pause with explicit reason and fresh-frame resume |
| P3-09.D | Failed-stream bounded restart/cooldown/cancellation with no infinite loop |
| P3-09.E | Video-failure/reconnect isolation from ADB health and queued actor work, retaining truthful teardown/uncertainty |
| P3-10.A | Reproducible workload runner for approved stream-count/profile/codec/resolution/CPU-or-GPU sweeps, including explicitly labelled representative synthetic vision/queue load; later real Phase 4 vision integration regression remains required |
| P3-10.B | Timestamped raw CPU/RAM/GPU/USB-or-network/FPS/drop/latency and actor-latency capture, with missing samples/sensors explicit |
| P3-10.C | Warmup/repetition and OFF-versus-ON baseline comparison/reporting |
| P3-10.D | Exact host/driver/device/build/profile attribution and reproducibility of measurement records |
| P3-10.E | Safe-stop of excessive benchmark pressure and cleanup of only benchmark-owned load |
| P3-10.F | Measured host-specific envelope output; unapproved/unmeasured limits cannot become production support claims |
| P3-11.A | Windows total/process CPU and RAM adapters with exact units/source/time/availability |
| P3-11.B | Disk free and supported disk-I/O adapters with unavailable/error handling |
| P3-11.C | Network adapters with attributed observed-source measurements |
| P3-11.D | Multi-adapter GPU utilization/memory and optional temperature/USB adapters with unsupported capability explicitly unavailable |
| P3-11.E | Process/vision-worker availability and health, without pretending simulated workers are live |
| P3-11.F | Actual per-stream count/FPS/resolution/bitrate/drop telemetry and separate ADB-versus-video state |
| P3-11.G | Nonblocking bounded sampler, freshness/out-of-order/probe-failure handling and truthful stale/UNKNOWN recovery/overhead controls |
| P3-12.A | Compact performance panel in existing right dock without changing six-tab/monitor layout |
| P3-12.B | Open/close/resize/theme behavior preserving existing phone-control geometry |
| P3-12.C | Keyboard/focus and popover-wheel isolation, including rapid close/open |
| P3-12.D | Truthful unavailable/status rendering and safe hide/recovery without changing admitted profiles or leaking input |
| P3-13.A | Independent requested/edit/applied settings model for FPS/resolution/bitrate/concurrency |
| P3-13.B | Supported device/backend/host-envelope intersection and stale capability-profile refusal |
| P3-13.C | Bounded editable controls, recommended-versus-hard-limit presentation, explicit Use recommended settings action and Apply confirmation for supported above-recommendation settings |
| P3-13.D | Revision-bound batch application with exact per-device pending/applied/rejected results |
| P3-13.E | Per-device stream enable/pause controls within admitted concurrency |
| P3-13.F | Backend read-back, partial failure and prior-admitted rollback; requested values never falsely become effective |
| P3-14.A | Auto/Manual transitions and persistent explicit safeguard state; Manual emergency default OFF |
| P3-14.B | Global-default inheritance and explicit Save defaults with preview of affected inheritors |
| P3-14.C | Persistent per-device overrides, visible override markers and explicit reset-to-global |
| P3-14.D | Exact snapshotted focused/selected/all-connected batch scope; stale/empty scope refuses and later arrivals remain untouched |
| P3-14.E | Hard-bound/mode/budget/request precedence across global and device scopes |
| P3-14.F | Benchmark-derived Eco/Balanced/Smooth/Custom presets |
| P3-14.G | Repeat-Apply and partial-result recovery without out-of-scope mutation; retain known changed members and audit |
| P3-15.A | Separate requested/effective/delivered/recommended values with source/time/validity |
| P3-15.B | GREEN/AMBER/RED/UNKNOWN classification from available measurements, sustained thresholds/hysteresis and no fabricated bottleneck |
| P3-15.C | Actionable warning content with affected streams, cause, time, text/icon and bounded operator actions |
| P3-15.D | Evidence-backed recommended adjustments with source/time/validity and no unsupported precise savings |
| P3-15.E | Noise/outage/staleness invalidation and concurrent requested-setting preservation; never false GREEN |
| P3-16.A | Auto emergency degradation prioritizing background before focused, without stealing actor resources |
| P3-16.B | Explicit Manual emergency opt-in enforcement, OFF zero-policy-change behavior, warning and unsafe-new-admission refusal |
| P3-16.C | Separate auto-restore opt-in with stable gradual recovery |
| P3-16.D | Restore toward latest requested revision, never overwrite a concurrent newer edit with old throttle state |
| P3-16.E | Audited reason/before-after/opt-in/affected-device history with requested values unchanged |
| P3-16.F | Crash/restart persistence and non-oscillating policy cancellation/recovery, preserving explicit choice |
| P3-17.A | Local host calibration profile identity/version/capability persistence |
| P3-17.B | Hardware/driver/runtime change invalidates calibration and requires supported recalibration transition |
| P3-17.C | Shared stream/vision admission budgets constrained by certified hard envelope and lower user limit |
| P3-17.D | Focused/selected/background priority scheduler with starvation/backpressure/override handling, preserving actor work |
| P3-17.E | Missing/stale calibration safe refusal or approved conservative fallback and recalibration transition; never unlimited guessed capacity |
| P3-18.A | Integrated controlled CPU/RAM pressure fault scenarios with safe teardown |
| P3-18.B | Integrated stream-drop and delayed backend-result fault scenarios |
| P3-18.C | Missing/stale/error GPU/sensor scenarios with truthful UNKNOWN behavior |
| P3-18.D | Manual OFF/ON, overload/recovery and repeated-oscillation scenarios validating operator choice and request/effective history |
| P3-18.E | Reproducible integrated fault runner/assertions/artifact capture and owned-load restoration, with live Windows run evidence separately required |
| P3-19.A | Actor ordering/cancellation instrumentation correlated with every stream apply/pause/restart/throttle event |
| P3-19.B | Reversible workload integration and exact device/generation isolation through concurrent stream controls |
| P3-19.C | Decoder/sampler failure/overload/timeout fault checks against lost/duplicate/retargeted commands and false success |
| P3-19.D | Baseline-versus-stream latency/integrity reporting against the approved budget |
| P3-19.E | Preview-disable fallback before actor correctness is sacrificed, and explicit later real workflow/vision regression handoff |

Cross-cutting obligations are included rather than extra weighted cells: V9 preservation (04/05/07/12), C-04 ownership (08/16/17/19), DEC-019 (14/16/18), telemetry truth (10/11/15/18), scope/revision/partial result (13/14/16), retained owned cleanup (02/09/10/18), and exact artifact/license custody (01). Device registry records are not capped by a stream concurrency budget. No policy here authorizes changing Android display resolution, GPU support claims, wireless operation, Python input, platform automation or a production ignore-limits switch.

## 3. Evidence overlay — existing reviewed checkpoint only

This first adopted baseline deliberately excludes all presently modified/untracked derived-pair build work. It records the already independently audited checkpoint behind the old checklist: local `a9a9531fc6a0dd6ea984000ba1aa9476c3f79c82`, exact tree `e3cea236e714995028e75d418a57237b3464dd31`, public `840fef16f175205c8531af9b7377b273323b6af9`; subsequent local `a00a486` is its docs/checklist closure. No newly authored patch or running CI earns credit.

| Task | Fixed cells and status | Evidence / why unchecked |
|---|---|---|
| P3-01 | A=N, B=S, C=N, D=N, E=N, F=N, G=S | E1/E2: candidate inventory is not complete deployed manifest/license closure. Fixed video-only host options and closed pair admission guards exist; exact derived server/consumer build artifacts and complete pair integration remain absent. |
| P3-02 | A=S, B=N, C=S, D=N, E=N | E2: one sealed headless start/stop source path with retained cleanup and controlled tests; no admitted pair/main stream integration. Pause/resume, restart and simultaneous independent stream coordination remain absent. |
| P3-03 | A=N, B=N, C=N, D=N, E=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-04 | A=N, B=N, C=N, D=N, E=N | Headless encoded drain is not a decoder or V9 frame renderer. |
| P3-05 | A=I, B=I, C=I, D=I | E3: actual display-only UI wiring and passing software tests for each cell; rendered visual parity and P3-04 dependency remain open. |
| P3-06 | A=N, B=N, C=N, D=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-07 | A=N, B=N, C=N, D=N | Existing partial local fit controls do not establish complete fit/filter/focus/disconnect cells. |
| P3-08 | A=N, B=N, C=N, D=N, E=N | Existing P2 actor is a dependency, not completed preview input integration. |
| P3-09 | A=N, B=N, C=N, D=N, E=N | Encoded bounded drain does not establish complete decoder queue/hidden/restart behavior. |
| P3-10 | A=N, B=N, C=N, D=N, E=N, F=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-11 | A=N, B=N, C=N, D=N, E=N, F=N, G=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-12 | A=N, B=N, C=N, D=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-13 | A=N, B=N, C=N, D=N, E=N, F=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-14 | A=N, B=N, C=N, D=N, E=N, F=N, G=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-15 | A=N, B=N, C=N, D=N, E=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-16 | A=N, B=N, C=N, D=N, E=N, F=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-17 | A=N, B=N, C=N, D=N, E=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-18 | A=N, B=N, C=N, D=N, E=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |
| P3-19 | A=N, B=N, C=N, D=N, E=N | Complete named software cells remain unimplemented; design, prior lower-layer tests or shell placeholders do not earn checked cells. |

Evidence keys (repository paths, no new fetch/test claimed):
- **E1:** `docs/evidence/P3-01-scrcpy-candidate-2026-11-02.md`: official5.0.1 archive `b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5`, source `a60891aea193d92e7e5c3942700eca63f9d19a5f`, member inventory and explicit incomplete component/license mapping. Metadata-only, runtime NOT ADMITTED; no checked manifest cell inferred.
- **E2:** `docs/evidence/P3-01-owned-video-consumer-source-2026-11-02.md`, independent source/index closure03:51 and actual audit04:03. Relevant frozen files: `desktop/src/main/video-contract.ts` SHA `b2199ae93a30ca82fa261efa830e1f6e917b75f5cb6f0283338298ae64473647`; `owned-video-consumer.ts` `f0676f903c6811ea1bcedb42c74141fa84ab7e9fe941be60161520b85b7440f3`; `adb-host-context.ts` `de4e8aea9603fcdb875374b2d6d83b4b074f0321b9962f45f635b1be4a5d2211`; `desktop/native/RetainedVideoSession.cs` `c4311d6080f6b566353c6f72151d8ef04b99e60a1f16ce396d020d3b86770ccf`. Context/bootstrap/package/journal guards, TS→adapter/bridge and native fixed start/stop paths were reviewed; owned-consumer/context/factory/journal tests and actual controlled v7/74 compilation report substantiate source work. Source CI41385778285 actual1587/109/289; report SHA `0e545efbdabce316022f5133f05d79fda5c4fda4b1d704c9443583d207261e8d`. No live IO or complete pair/main integration is inferred; hence S, not I.
- **E3:** `docs/evidence/P3-05-display-only-zoom-2026-11-02.md`, source/UI review02:59, exact closure03:04, hosted audit03:15. Public `acaae17b0e8898406bc9af55c16845bcc128642a`, local `d4798d343ebebab7240bc64e80c784e54882ad70`, tree `8b324ceb198db907398ec1b59a172e81d077215d`; CI41381350039 actual1557/109/286. `desktop/src/ui/tile-zoom.ts` SHA `35e303fe3d5ec1a796053e02359f2a56a1db273ed1cc516d5e312ec39de305ad`; `ui-shell.tsx` `b7ad027014cf064acc3d2db79c814e8b1bd4a82cbf696212b5bc7dfc07815782`; tests `tile-zoom.test.mjs` `f1b42ae5c8b501de1d8d3f742f9afdfb3ecaa6fe68f55bdd72256a80c36d6887`, `ui-shell.test.mjs` `cad792652105541e8bf33e51b450ba2c298424255b70e7228b4228303745d06d`. Actual source/VM UI geometry, ResizeObserver/latest-state/focus/range/reset and no-effect cases; no rendered-parity claim.

## 4. First baseline and honest deltas

The independently reviewed complete mapping and evidence overlay establish:
- N = 92; S = 4; I = 4; total = 100.
- **Source-covered subdeliverables: 8/100 = 8.0%.**
- **Integrated/software-tested subdeliverables: 4/100 = 4.0%.**
- **Old whole-deliverable checklist: 1/19 = 5.3%; integrated whole deliverables 1/19.** This remains correct and unchanged.
- **Technical acceptance: 0/19**, with hardware/visual/performance/formal phase gates separate.

The new source-coverage figure is not a progress increase over the old 5.3% whole-deliverable figure. They measure different units. No software was implemented by creating this ledger. The first v1.0 report has **no prior comparable v1.0 baseline; actual progress delta is not yet computable** (or report “baseline established; +0 newly completed cells in this reporting action”).

Subsequent same-version reports must list changed cell IDs and exact new evidence, then calculate:
- source coverage delta = `100 × ((S+I)new − (S+I)old) / 100` percentage points;
- integrated coverage delta = `100 × (Inew − Iold) / 100` percentage points.

One newly completed N→S or N→I cell adds 100/100 = 1.0 percentage points of source coverage. S→I adds 0 source points and 1.0 integrated points. A regression can subtract points; waiting/build duration/test count never adds points. Round display to one decimal only after exact fraction/delta calculation. Keep old and new checkpoint IDs so +x is auditable; no comparison across ledger versions without a separately disclosed baseline restatement.

## 5. Actual outstanding gates, not generic new permission requests

Already covered by standing engineering scope: reviewed branches/source/docs/tests/CI repairs/publication preserving history, corresponding bounded builds/tests, exact public upstream source/document retrieval, and reputable official build tools/dependencies installed/run solely in disposable build environments, all subject to actual tool permissions. Do not request blanket permission again for these. A prior tool denial is not bypassed by changing transport; only a known-unexecuted operation with materially new relevant evidence may be reconsidered through the applicable tool decision. This report makes no such retry.

Specific foreseeable decisions outside that scope:
1. **Actual authorized-device runtime ceremony and stream/input benchmark.** Requires the user's chosen authorized phones, physical association/USB consent and a supported genuinely eligible Windows account/profile where the real KnownFolder `.android` absence guard can pass. The known ineligible existing profile is not to be adopted, deleted or redirected by environment variables. Device payload upload/execution/cleanup, real video capture and reversible input are effects, not source compilation; approve the exact bounded workload/devices/storage/safe-stop envelope before running it.
2. **Measured production support envelope.** Exact FPS/bitrate/resolution/concurrency/latency/threshold/hysteresis/restore choices must be selected from actual measurements. Existing DEC-019 Manual OFF and separate restore opt-in are already decided, not new questions. No “ignore hard limits” mode is authorized.
3. **New legal terms or non-disposable host changes, if required.** Reputable official build tools/dependencies may be installed and run solely in a disposable build environment under current engineering permission; public upstream source/document downloads also need no new blanket approval. The currently reviewed pair runner remains preinstalled-only until its exact contract/implementation is reviewed for such a change. Payments, installation on the user’s computer/phones, credential/security changes and acceptance of new legal terms remain separate decisions. Do not silently accept an SDK license, modify host security or bypass existing guards; report the exact concrete blocker if any.
4. **Binary distribution/release, if proposed.** Publishing derived JAR/DLL/third-party runtime artifacts or shipping a release is different from source/docs/tests publication; first close exact source/build/component-license/NOTICE obligations and obtain the specific release/distribution disposition. The current candidate inspection is not blanket legal clearance for the complete ZIP or a derivative.
5. **Private capture dissemination.** Local scoped artifacts use the existing agreed retention/private-storage rules; uploading real phone images or private device data to external/cloud storage requires the actual destination/data scope, not an inference from public source publication.

No new identity policy, wireless pairing, existing-profile cleanup, generic deployment framework or extra phase scaffolding is requested. This ledger is useful even while these actual gates remain pending.
