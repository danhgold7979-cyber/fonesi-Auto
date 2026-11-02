# Phase 3 — software-deliverable checklist

**Code checklist coverage: 1/19 = 5.3%. Integrated and software-tested: 1/19. Technical task acceptance: 0/19.**

Recorded 2026-11-02 04:03 UTC after independent engineering review. This answers the user's request to distinguish implemented code from acceptance. It is **binary checklist coverage, not an effort-weighted estimate, percentage of source lines, or predicted time remaining**.

## Fixed measurement rule

The denominator is exactly the 19 concrete-deliverable cells in [canonical Phase 3 §4](PHASE-03-screen-wall-resources.md#4-work-packages), with one checkbox per complete software deliverable. No added sub-lines, test counts or fractional credit change that denominator. A checkbox is complete only when all named software behavior for that deliverable is present. Integration/software testing is recorded separately; actual Windows, device, performance and visual acceptance remain separate. Partial source work is useful and described below but earns no invented partial percentage. This does not mark a canonical task accepted or waive its dependencies.

| Canonical deliverable | Software checklist | Integrated / software-tested | Current evidence or remaining software |
|---|---|---|---|
| P3-01 Verified scrcpy pin/license and video-only admission | Partial — 0 | Incomplete — 0 | Candidate inspected and bounded pair admission implemented; derived server patch/build and reviewed paired artifacts unavailable. |
| P3-02 Per-device start/pause/stop/restart and cleanup | Partial — 0 | Incomplete — 0 | Headless host path implemented and controlled tests pass; full per-device pause/restart/multiple-stream integration absent. |
| P3-03 Focused/selected/background profiles | Not complete — 0 | 0 | Capability-derived profile implementation remains. |
| P3-04 Generation-tagged frames in V9 tiles | Not complete — 0 | 0 | Decoder/rendering, actual frame orientation/aspect and generation routing remain. |
| P3-05 Bounded Ctrl+wheel whole-tile zoom | **Complete — 1** | **1** | Local whole tile/chrome scaling, aspect, dock bounds, latest-state wheel/focus guards, no device/capture/settings writes; source-tested in actual UI wiring. |
| P3-06 Inside-phone versus outside-wall scroll | Not complete — 0 | 0 | Actor scroll/hit routing and exact interaction boundaries remain. |
| P3-07 Complete fit/filter/focus modes | Not complete — 0 | 0 | Existing local fit controls do not establish the entire selection/focus/disconnect contract. |
| P3-08 Sole actor preview pointer/key route | Not complete — 0 | 0 | Actual scale/rotation/letterbox targeting and operation-owner integration remain. |
| P3-09 Backpressure/hidden pause/failed-stream restart | Not complete — 0 | 0 | Decoder queue, hidden lifecycle and bounded restart integration remain. |
| P3-10 Reproducible measured stream envelope | Not complete — 0 | 0 | Bounded workload/measurement/profile tool and actual measurements remain. |
| P3-11 HostResourceMonitor | Not complete — 0 | 0 | Actual resource adapters, availability and attributed telemetry remain. |
| P3-12 Accessible compact performance popover | Not complete — 0 | 0 | Existing shell is not the complete resource-bound interaction contract. |
| P3-13 Supported FPS/resolution/bitrate/concurrency controls | Not complete — 0 | 0 | Bound intersection, requested/edit/applied and per-device outcomes remain. |
| P3-14 Auto/Manual, scopes, overrides and presets | Not complete — 0 | 0 | Exact scope/precedence/application behavior remains. |
| P3-15 Requested/effective/recommended warnings | Not complete — 0 | 0 | Attributed warning/recommendation state and invalidation remain. |
| P3-16 Opted-in emergency preview throttle/recovery | Not complete — 0 | 0 | DEC-019 policy and truthful recovery integration remain. |
| P3-17 Calibration, priority and budget scheduling | Not complete — 0 | 0 | Host-specific calibration/budget scheduler and invalidation remain. |
| P3-18 Integrated overload/sensor/manual fault suite | Not complete — 0 | 0 | Product-level integrated fault campaign remains. |
| P3-19 Input integrity through every stream control | Not complete — 0 | 0 | Complete stream-operation instrumentation/regression remains. |

## Evidence and acceptance distinction

- [P3-05 source and hosted evidence](../evidence/P3-05-display-only-zoom-2026-11-02.md): actual public `acaae17b`, source checks/build, reviewed UI behavior. Its visual parity and canonical P3-04 dependency remain open. No phone prerequisite is invented for local display zoom, and no P3-05 technical acceptance is inferred.
- [P3-01/P3-02 host source and controlled compilation evidence](../evidence/P3-01-owned-video-consumer-source-2026-11-02.md): public `840fef16`, actual source 1587/109/289 and strict v7/74 controlled managed proof. Derived Java patch/build is tool-blocked, pair pins are null, no main/UI video activation or live deployment/stream is established. These partial rows do not earn full checkboxes.
- [P2 software handoff](P2-SOFTWARE-HANDOFF-2026-11-02.md) remains explicit: P2 technical acceptance 1/13; overall technical acceptance 11/154; formal acceptance unchanged. Neither this checklist nor passing tests promote those counts.

Future changes must cite exact source/integration evidence against the same canonical cell before changing a checkbox. Report partial milestones in words rather than silently changing weights or rounding them into completed tasks.
