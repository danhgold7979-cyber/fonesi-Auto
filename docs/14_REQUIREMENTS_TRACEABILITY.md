# Requirements Traceability and ID Migration

**Revision:** 0.2-review · **Date:** 2026-10-30
**Purpose:** One current coverage index from requirement → task → planned verification → evidence, without rewriting approved history.

## 1. Reading and maintenance rules

- Canonical requirements live in [product scope](01_PRODUCT_SCOPE.md), [architecture](02_TECHNICAL_ARCHITECTURE.md), [data/workflows](03_DATA_AND_WORKFLOWS.md), [V9 mapping](06_UI_V9_MAPPING.md) and [resource controls](12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md). This index does not silently supersede them.
- Accepted product choices are [C-01…C-22](16_ACCEPTED_PRODUCT_DECISIONS.md), DEC-019 and DEC-020. This index separates those settled directions from remaining version/mechanism/permission tests and gate-specific input. Acceptance of a direction is not Phase or test acceptance.
- RQ IDs below are stable requirement groups; their named source sections retain the detailed clauses. P1…P11 IDs refer to [master roadmap tasks](04_MASTER_IMPLEMENTATION_PLAN.md). G0 IDs are **master Phase 0 gates**, not the approved execution tasks P0-01…P0-10.
- AC/T/F IDs refer to the [acceptance gates, planned test families and failure cases](05_ACCEPTANCE_AND_RISKS.md). A mapped test is not a test run. Range notation is inclusive.
- Evidence is recorded in the applicable Phase Plan/acceptance report with exact task/RQ/test IDs, commit, command/procedure, profile, actual result and sanitized artifacts. Current evidence/status lives in [PHASE_STATUS](PHASE_STATUS.md) and the approved Phase 0 plan; this coverage index does not assign PASS.
- Before changing an accepted Phase scope, follow [documentation policy](13_DOCUMENTATION_CHANGE_POLICY.md) and record an approved amendment. Newly assigned P1…P11 rows are draft future work. The proposed [Phase 0 amendment](phases/PHASE-00-feasibility-AMENDMENT-01.md) documents gate coverage without rewriting accepted IDs.

## 2. Phase 0 gate-to-approved execution crosswalk

Every gate below ends in P0-10 acceptance review. Crosswalk coverage identifies where evidence must be collected; it does not enlarge the approved feasibility scope without amendment approval. Existing P0 status/history stays untouched.

| Master gate | Requirement/output | Approved execution owner(s) | Required closure evidence |
|---|---|---|---|
| G0-01 | Current Windows host first; tested support/privileges and constraints (C-07) | P0-01, P0-09 | Sanitized host/acceleration inventory and approved support decision |
| G0-02 | Physical Android/OEM/locale/driver matrix | P0-03, P0-09 | Exact tested fleet/support matrix, not emulator substitution |
| G0-03 | Two AVDs, initially one running; measured fleet benchmark (C-07) | P0-01, P0-02, P0-05, P0-09 | One/two-AVD lifecycle/resource results and approved sample envelope |
| G0-04 | Accepted USB-first; Wi-Fi disabled until dedicated acceptance (C-17) | P0-03, P0-09 | Pairing/reconnect/security result or explicit disabled/deferred scope |
| G0-05 | Dated platform-policy review | P0-08 | Authoritative source review and written per-action disposition |
| G0-06 | Action permission/capability outcomes | P0-08, P0-09 | ALLOWED/BLOCKED/DEFERRED/NEEDS_REVIEW matrix and authorization |
| G0-07 | First-release capability scope | P0-08, P0-09 | C-01/02 scope recorded; per-action permission/certification outcomes still required |
| G0-08 | Owned/administered scope and data permission | P0-08, P0-09 | C-02/03 ownership/initial-login direction plus actual pilot authorization/source boundary |
| G0-09 | UI Automator execution model | P0-04 | Hierarchy/instrumentation comparison and selector/read-back proof |
| G0-10 | Stream backend/version/license feasibility | P0-05 | Video-only trace, codec/failure diagnosis, license and resource report |
| G0-11 | Accepted OpenCV/PaddleOCR CPU-first; model accuracy/runtime/size proof (C-06) | P0-07 (fixtures depend on P0-02) | Labeled Vietnamese/English dataset, measured accuracy/latency/memory |
| G0-12 | Accepted Electron/TypeScript/React/SQLite; runtime/binding/version proof (C-05) | P0-09 | Accepted direction linked to measured compatible versions/ADRs; no silent alternative-stack substitution |
| G0-13 | Accepted retention/backup/secret-reference rules; mechanism/key/restore proof (C-13/14/21/22) | P0-09 | Threat/privacy, accepted durations/cadence and tested encrypted recovery/deletion contracts |
| G0-14 | ADR/schema/contract approval | P0-09 | Decision/ADR register, alternatives/evidence and approval references |
| G0-15 | Multiple-host support profiles | P0-01, P0-06, P0-09 | Current host validated first; other host profiles only when measured, otherwise unsupported (C-07) |
| G0-16 | Telemetry coverage/freshness/unknowns | P0-06 | CPU/RAM/GPU/disk/network source/availability matrix by adapter/driver |
| G0-17 | FPS/resolution/bitrate/codec/concurrency | P0-05, P0-06 | Host/device/vision-load samples and safe operating envelope |
| G0-18 | Modes/scopes/overrides/thresholds/recovery | P0-05, P0-06, P0-09 | DEC-019 OFF/opt-in semantics; approved numeric policy and traceable scope/restore behavior |
| G0-19 | Monitoring overhead/input isolation | P0-03, P0-05, P0-06 | Load measurements proving no cross-device/racing input and approved latency budget |

P0-10 must check all 19 rows plus the approved plan's own exit checklist. Four tasks IN_PROGRESS and six NOT_STARTED do not mean any gate is accepted. Physical-device smoke remains mandatory under the existing user approval; proposed deferral wording is not permission to skip it.

## 3. Historical ID migration: no requirement deleted

Migration source is snapshot `34b964956e530dbc9d5b97dcb8564e49aa1c4fdf`. Literal escaped newlines had created 166 task entries but only 155 distinct labels. **Embedded** means the earlier entry previously located inside an escaped-newline string; **standalone** means the later normal Markdown row. Historical references must include the description/occurrence when ambiguous.

| Historical master label/meaning | Current ID(s) | Preservation rule |
|---|---|---|
| P0-01…P0-14 master gates | G0-01…G0-14 respectively | Renamed only; approved detailed P0-01…P0-10 are a different namespace and remain unchanged |
| P0-15 standalone host profiles | G0-15 | Multiple Windows host profiles retained |
| P0-16 standalone telemetry | G0-16 | Timestamped telemetry and unavailable-counter behavior retained |
| P0-17 standalone stream combinations | G0-17 | Codec/FPS/resolution/bitrate/concurrency combinations retained |
| P0-18 standalone Auto/Manual policy | G0-18 | Modes, override, warning, emergency/recovery/hysteresis retained |
| P0-19 monitoring overhead | G0-19 | Input/workflow latency/ownership proof retained |
| P0-15 embedded host telemetry | G0-16 | Adds network source/availability coverage to consolidated telemetry gate |
| P0-16 embedded stream profiles | G0-17 | Increasing stream-count/profile benchmark retained |
| P0-17 embedded thresholds/degradation | G0-18 | Warning/critical, hysteresis, cooldown, safe degradation retained |
| P0-18 embedded scope/precedence | G0-18 | Global/selected/per-device precedence retained |
| P3-01…P3-10; standalone P3-11…P3-19 | Same IDs | Standalone meanings retained/enriched; no renumbering |
| P3-11 embedded FPS slider | P3-13 | Target and effective FPS retained |
| P3-12 embedded quality/resolution | P3-13 | Quality/bitrate and resolution cap retained |
| P3-13 embedded profile scopes | P3-14 | Global/selected/per-device profiles and override indicator retained |
| P3-14 embedded modes/presets | P3-14 | Auto/Manual and Eco/Balanced/Smooth/Custom retained |
| P3-15 embedded resource telemetry | P3-11 | CPU/RAM/GPU/disk/network/stream telemetry retained |
| P3-16 embedded alerts | P3-15 | Cause, recommendation, measured estimated impact retained |
| P3-17 embedded adaptive recovery | P3-16, P3-17, P3-19 | Degradation/hysteresis/recovery plus workflow/input protection retained |
| R-001…R-020, standalone R-021…R-025 | Same IDs | Standalone meanings retained |
| R-021 embedded high-FPS overload | R-021 | Consolidated overload cause/mitigation; no separate risk lost |
| R-022 embedded vendor GPU telemetry | R-022 | Vendor/driver differences, sensor source/availability/UNKNOWN retained |
| R-023 embedded manual-capacity overload | R-026 | Distinct from retained R-023 Auto oscillation; new unique risk ID |
| G0…G9 acceptance gates | AC-00…AC-09 | Avoid confusion with G0 master-gate namespace |
| G3A resource acceptance | AC-03 | Consolidated all telemetry/settings/limits/recovery criteria |
| G10 release acceptance | AC-11 | AC-10 newly covers tracking/reporting, never silently reuse legacy release meaning |

The normalized master has **163 unique rows**: 19 G0 gates plus 144 future tasks. Eleven duplicate/overlapping rows were consolidated with the mappings above; eight previously implicit requirements gained explicit draft task IDs: P1-11, P2-13, P5-14, P5-15, P6-15, P6-16, P7-13, P8-14. No historical evidence is renamed. Future task additions use unused IDs; never recycle an old ID for a new meaning.

## 4. Requirement coverage matrix

Evidence column names the required artifact, not an existing/passed result. All implementation evidence below is pending; partial Phase 0 evidence is separately indexed in its approved plan. Requirements may share tests but all named clauses require assertions.

| ID | Requirement and canonical source | Master task coverage | Planned acceptance/tests | Required evidence |
|---|---|---|---|---|
| RQ-001 | Clean-slate repository, fixed workflow scope and sequential authorization — AGENTS; 00 §§3/8 | G0-07, G0-14; P1-01; all Phase approvals | AC-00; T-00/01 | Repository/approval/decision audit; no fonesi-W dependency |
| RQ-002 | Windows/physical Android/AVD support, no unsupported fleet claims — 00/05 | G0-01…04, G0-15; P2-12; P11-06/09 | AC-00/02/11; T-00/02/11 | Exact host/device/locale/transport support and benchmark matrix |
| RQ-003 | Per-action policy, ownership, no bypass or silent manual fallback — 01 §2.4/3; 03 §4 | G0-05…08; P8-02/03; P9-01…12 | AC-00/08/09; T-00/08/09 | Written permission/source matrix; disabled reasons and profile certificates |
| RQ-004 | Accepted Electron/React/TypeScript/SQLite direction; version/schema/IPC/secure-renderer proof — 02; 03; proposed ADR-0004 | G0-12/14; P1-01…03/10/11 | AC-01; T-01; F-24 | Approved ADR, contract/schema/threat review, denied IPC and clean build logs |
| RQ-005 | SQLite migrations, verified pre-migration backup, daily/manual local backup, secret references and privacy — 02 §4; 03 | G0-13; P1-04…07/11; P11-04/07/08 | AC-01/11; T-01/11; F-24/25 | Migration/restore and redaction tests; protected backup/key policy |
| RQ-006 | V9 shell/navigation/themes/dock/data states and no production mocks — 06 §§1…3/11 | P1-07…09; P3-04…07/12; P6-07; P10-06 | AC-01/03; T-12 | Same-viewport screenshots plus interaction/loading/empty/error checks |
| RQ-007 | Explicit transport identity, USB-first and authenticated Wi-Fi disabled until dedicated acceptance — 01 §2.2; 03 Device/Transport | G0-02/04; P2-01…06/11/12 | AC-02; T-02; F-01/03/23 | Physical serial/generation map and reconnect diagnostics |
| RQ-008 | Sole serialized input actor, whole-workflow ownership, explicit selection/scope, timeout/cancel — 02; 06 §§3/9 | P2-07/08/10/12; P3-08/19 | AC-02/03; T-02/03; F-01/03/23 | Two-device isolation/load and stale-command refusal traces |
| RQ-009 | Screenshot/hierarchy evidence and exact Unicode input — 02; 03 evidence/workflows | P2-09/13; P4-10 | AC-02/04; T-02/04; F-27 | Vietnamese/English/emoji/multiline round-trip and sanitized fixture IDs |
| RQ-010 | Video-only streaming, bounded live streams/unbounded registry, lifecycle/backpressure — 01 §2.2; 02 | G0-10/17; P3-01…04/09/10/19 | AC-03; T-03; F-04 | Codec/license/process no-input proof, measured stream envelope |
| RQ-011 | Zoom/inside-outside scroll/fit/single-all-selected/focus parity — 06 §§1/9 | P3-04…08/12 | AC-03; T-03/12 | V9 interaction and coordinate-mapping tests |
| RQ-012 | Fresh CPU/RAM/GPU/disk/network/vision telemetry, unknown not zero — 12 §§2/5/7 | G0-16/19; P3-11/15/18 | AC-03; T-03; F-21/22 | Sensor source/availability/overhead matrix and stale/error UI proof |
| RQ-013 | Scope/override/presets/FPS/resolution/quality/concurrency controls — 12 §§2/3; 06 | G0-18; P3-12…15/18 | AC-03; T-03/12 | Scoped apply/reset and requested/effective/recommended traces |
| RQ-014 | Auto/Manual budgets, emergency OFF opt-in, hysteresis/recovery/input integrity — 12 §§4…8; DEC-019 | G0-17…19; P3-10/16…19 | AC-03; T-03; F-21/22 | Frozen thresholds, overload/restore raw samples and preserved ADB trace |
| RQ-015 | UI Automator normalized tree/selectors/stale/waits — 02 UI inspection | G0-09; P4-01…05/10/12 | AC-04; T-04; F-06/08/11 | Hierarchy/instrumentation comparison and labeled physical fixtures |
| RQ-016 | OpenCV/PaddleOCR CPU-first confidence/calibrated fallback, isolated restartable worker — 02 Vision | G0-11; P4-06…12 | AC-04; T-04; F-05/07/08 | Holdout accuracy/latency/memory, model version and low-confidence refusal |
| RQ-017 | Real package/name/version/source/icon cache; protected APK actions — 01 §2.8 | P5-01…05/10/14 | AC-05; T-05; F-26 | Device package scan, signature/downgrade/protected-app rejection/cancel results |
| RQ-018 | Verified global account/per-device session/target identity, user initial login and challenge blocking; local-PC lease only — 01 §2.3; 03 | P5-06…09/13; P8-03; P9-02/03 | AC-05/09; T-05/09; F-09/10/11 | Identity/read-back and challenge safe-stop evidence; no credential capture |
| RQ-019 | Device HTTP/HTTPS proxy, masked secrets, device egress, expiry/rollback; SOCKS5/per-app deferred — 01 §2.10 | P5-11/12/15 | AC-05; T-05; F-14/26 | Device egress proof and assignment/rollback audits with masked secrets |
| RQ-020 | Source registry, recursive scan/order/hash/stability/metadata/watchers — 01 §2.5; 03 Media | P6-01…06/14 | AC-06; T-06; F-12/13/18 | Nested/duplicate/locked/changed-file corpus and metadata validation |
| RQ-021 | 20-row viewport/caption/hashtags/comments/reuse plus explicit ordered album/group (one post per target) — 01 §2.5; 06 §6 | P6-07…10/13; P8-08 | AC-06/08; T-06/08/12 | Field round-trip, correct comment count/delay/interval and reuse gate |
| RQ-022 | Excel/TXT preview/path-hash mapping/error reports/current export — 03 §6; 06 §6 | P6-11/12/15 | AC-06; T-06; F-18 | Versioned template and import/export fixtures including duplicates/missing paths |
| RQ-023 | Exact staging/ownership manifest/storage/picker proof; verified completion cleanup only, originals/UNKNOWN preserved — 03 workflows | P6-16; P8-03 | AC-06/08; T-06/08; F-12/13/27 | Staged hashes and identity/read-back; low-storage/cancel cleanup |
| RQ-024 | Once/weekdays/start-anchored every-N, inclusive end, planned-occurrence max, accepted DST, complete row override, no replacements — 01 §2.6; 03 Schedule | P7-01…03/05/09/11/12 | AC-07; T-07; F-17/20 | C-10/11/18/19 anchor/end/max/DST/REVIEW/row-override fixtures; never dual generation |
| RQ-025 | 30-minute warning-only; collision QUEUE default/AUTO_SHIFT explicit — 01 §2.6; DEC-020 | P7-04/05/11 | AC-07; T-07 | Below/equal/above 30-minute cases; warning never bypasses device/account lock |
| RQ-026 | One-local-PC global-account lease, device ownership, priority aging, queue/fencing/snapshots — 02 §5; 03 | P5-13; P7-06…09/13 | AC-07; T-07; F-17/28 | Restart/takeover/manual-input exclusion/concurrency/starvation and immutable job snapshot traces |
| RQ-027 | Calendar filters/day-week-month/colors/drag-drop/revision/undo — 06 §7 | P7-10/11 | AC-07; T-07/12 | Valid move persistence, invalid revert, conflict/undo audit and visible queue time |
| RQ-028 | Fixed versioned manifests/capabilities/preflight/state outcomes — 03 §§3/4; 06 §8 | P8-01…04/12 | AC-08; T-08; F-19/30 | Contract/state coverage and stale-profile dispatch refusal |
| RQ-029 | Durable effects, verification/evidence, safe retry, UNKNOWN reconciliation — 03 §§3/5 | P8-05…10/13 | AC-08; T-08; F-02/15/16 | Crash at each intent/dispatch/outcome boundary; no duplicate post/comment |
| RQ-030 | Safe pause/cancel/resume/timeout and drift invalidation — 02 failure model; 03 §3 | P8-09…12 | AC-08; T-08; F-02/16/19/30 | Persisted uncertain state and recertification/reconciliation before resume |
| RQ-031 | Interaction ledger eligibility/count/UNKNOWN and permitted latest-N/list source — 03 §5 | P8-14; P9-08…10 | AC-08/09; T-08/09 | Verified post references, dedupe, source denial and ordering/pagination proof |
| RQ-032 | Owned/administered Page video/photo/ordered-album/Reels pilot; Story separately certified and exact read-back — 03 §4 | P9-01…09/11/12 | AC-09; T-09 | Small-volume controlled physical certificates per supported profile/action |
| RQ-033 | Profile/Group/reaction/share remain disabled without separate approvals — 01 §2.4; 03 §4 | P9-07/10/11; P8-02 | AC-09; T-09; F-30 | Visible reason and inability to dispatch unapproved actions |
| RQ-034 | Permitted metric sources/provenance/freshness/comparable growth/no invented viral — 01 §2.7; 03 Metric | P10-01…04/08 | AC-10; T-10; F-29 | Source/capability matrix, missing/incomparable snapshot assertions |
| RQ-035 | Inventory/license/proxy bars/health/alerts/CSV-XLSX export — 06 §5 | P10-05…07/09 | AC-10; T-10/12; F-29 | Labeled denominators, source timestamps, safe export and deduplicated alerts |
| RQ-036 | Signed installer, dependency pins/licenses/SBOM and upgrade/downgrade/uninstall — 02; 05 release | P11-01…03/09/10 | AC-11; T-11 | Reproducible clean Windows artifacts, hashes/signatures and supply-chain review |
| RQ-037 | Fault/load/security, restore/retention/support/runbooks and truthful release — 02 §4; 05 | P11-04…10 | AC-11; T-11; all F cases as applicable | Full regression; retention 7/30 days with UNKNOWN hold; daily/manual and seven-copy encrypted local backup/rollback quarantine drills |

## 5. Accepted checklist to verification crosswalk

All 22 directions are accepted; the test/evidence obligations below remain pending. Details are authoritative in [the accepted decision record](16_ACCEPTED_PRODUCT_DECISIONS.md), not inferred from checklist titles.

| Accepted item(s) | Existing requirement/task coverage | Decisive planned verification |
|---|---|---|
| C-01, C-02 | RQ-001/003/032/033; G0-05…08; P8-02; P9-01…12 | AC-00/09: Facebook-first owned/administered Page pilot, separate Story certificate, disabled unsupported networks/actions; per-action permission remains required |
| C-03 | RQ-018/030; P5-09; P8-03/11 | T-05/08/09: user initial login/authorization, unattended certified routine, challenge/expiry safe stop without bypass/substitution |
| C-04 | RQ-008/026/030; P7-06/13; P8-11 | F-28: exclude interleaved manual/APK/proxy commands; explicit drain/fence/reconcile takeover and fresh identity/UI |
| C-05, C-06 | RQ-004/010/015/016; G0-09…12; P1-02/05; P3-01; P4-01…12 | T-00/01/03/04: selected stack/vision/stream direction; measured versions/licenses/model/deployment, no silent swap |
| C-07, C-17 | RQ-002/007; G0-01…04/15; P2-01…12 | T-00/02: current host and two-physical-device isolation, two AVDs initially one running; USB first, Wi-Fi disabled until dedicated tests |
| C-08 | RQ-009; P2-13 | T-02/F-27: exact Vietnamese/English/emoji input or block; helper permissions separately authorized |
| C-09 | RQ-019; P5-11/12/15 | T-05/F-14/26: HTTP/HTTPS Android route proof/rollback; SOCKS5/per-app not enabled |
| C-10, C-11, C-18, C-19 | RQ-024…027; P7-01…13 | T-07/F-17/20: QUEUE vs missed REVIEW, Asia/Ho_Chi_Minh default, skip/earlier-once DST, anchored every-N, inclusive end/planned max, bounded same-day shift, complete row override and no dual/replacement jobs |
| C-12 | RQ-018/026; P5-13; P7-07/13 | T-05/07/F-28: stable verified account identity, one-local-PC cross-device exclusion, no display-name merge/cross-PC promise |
| C-13, C-21 | RQ-005/023/034/037; P1-04/11; P6-16; P11-08 | T-06/11/F-25/27: diagnostic 7-day/log 30-day cleanup, explicit job/metric-history cleanup, owned staging only, originals/unresolved recovery data preserved |
| C-14, C-22 | RQ-005/037; P1-05/06; P11-04/08 | T-01/11/F-25: secret references, restore quarantine/key proof; manual/at-most-daily and mandatory verified pre-migration backup, seven validated ordinary copies, safety-copy hold and visible failure preserving known-good |
| C-15 | RQ-010/012…014/034; P3-10…19; P10-01…04/08 | T-03/10: empirical bounds and availability; no universal stream maximum, missing metric zero or invented viral claim |
| C-16 | RQ-001/036/037; all Phase reports; P11-01…10 | AC-00…11: deliverable/failure/evidence/acceptance plus Windows install/upgrade/recovery/support matrix; no UI-only completion |
| C-20 | RQ-021/022/023/032; P6-13/15/16; P8-07; P9-05 | T-06/08/09/F-18: explicit album/group ordered assets, one post per target, exact count/order before dispatch/read-back and no folder inference |

## 6. Coverage and acceptance controls

- Before Phase approval, verify every task maps back to a row and every release-critical row has a named test/evidence owner. Missing owners/thresholds/commands remain planning blockers, not implementation discretion.
- The current master inventory is G0-01…19; P1-01…11; P2-01…13; P3-01…19; P4-01…12; P5-01…15; P6-01…16; P7-01…13; P8-01…14; P9-01…12; P10-01…09; P11-01…10. No range authorizes later-phase work.
- Source contradictions go to the decision register. C-01…C-22 and DEC-019/020 are resolved product directions. Exact versions, schema/mechanisms, numeric budgets, policy permission, actual profiles/pilot inputs and gate acceptance remain pending; never re-ask settled preferences or infer empirical PASS.
- At acceptance attach results for each RQ/test—not merely the task count. Link failed/unrun checks and approved restrictions. A conditional capability may be disabled in an approved release, never described as implemented READY.

## 7. Change history

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-review | Added unique requirement coverage, G0/P0 crosswalk, lossless duplicate task/risk/gate migration and planned verification/evidence links. No approved Phase history rewritten or test result inferred. |
| 2026-10-30 | 0.2-review | Added complete C-01…C-22 crosswalk and synchronized existing G0/RQ coverage for accepted directions, exact schedule/album/retention/backup rules; empirical gates and approved Phase history unchanged. |
