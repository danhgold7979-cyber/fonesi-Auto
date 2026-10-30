# PHASE-04 — UI Automator, OpenCV and OCR recognition

**Revision/date:** 1.0-draft / 2026-10-30
**Plan:** DRAFT / NOT AUTHORIZED · **Execution:** NOT_STARTED · **Coding:** NO
**Proposed branch:** `phase-04` (not created)
**Execution base:** accepted `main` SHA after Phase 3 acceptance/merge, to verify at entry
**Owner/reviewer:** assign at approval

> Phase 0 is unfinished. Accepted product/technology directions do not authorize this Phase, a helper install, device access or application coding. All implementation, OCR, Windows, GPU and physical-device tests below remain NOT RUN.

## 1. Outcome, sources and scope

Deliver an evidence-producing recognition service that uses semantic UI first, OpenCV/PaddleOCR fallback second, and coordinates only for calibrated, fresh, sufficiently confident supported layouts. Unknown/ambiguous state stops safely; the worker never controls a phone.

Trace **P4-01…P4-12** in [master Phase 4](../04_MASTER_IMPLEMENTATION_PLAN.md), **AC-04** in [acceptance](../05_ACCEPTANCE_AND_RISKS.md), [architecture](../02_TECHNICAL_ARCHITECTURE.md), [evidence/entities](../03_DATA_AND_WORKFLOWS.md), [V9](../06_UI_V9_MAPPING.md), [resource controls](../12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md) and [accepted checklist C-01…C-22](../16_ACCEPTED_PRODUCT_DECISIONS.md) / [pending evidence](../08_DECISIONS_AND_OPEN_ITEMS.md).

**Accepted direction:** UI Automator first; OpenCV + PaddleOCR in isolated Python, CPU-first; Device Host/Actor is sole input authority. Exact versions, models, execution adapter, language configuration, IPC transport, calibrated thresholds and measured host support still require evidence/recorded technical decisions. No competing Python, UI Automator helper or scrcpy input path is permitted.

In scope: hierarchy parser/selectors/freshness, preprocessing, OCR benchmarks, worker IPC/lifecycle, calibrated decisions, labeled evidence/replay and safe stop. Out of scope: Facebook posting/certification, credential recognition/collection, CAPTCHA/checkpoint solving, GPU acceleration commitment, general workflow editor, V9 redesign or fonesi-W code reuse. Successful OCR of a page does not establish permitted access to its data.

## 2. Entry and ordered dependencies

- Phase 0 accepted with mandatory physical feasibility, Phase 3 accepted and merged, all earlier acceptance still valid; no parallel phase exemption.
- Verify repo/remote/authorized branch/HEAD/status; obtain explicit approval of this plan and current task.
- Phase 2 actor, capture/generation/Unicode contracts and Phase 3 resource monitor/stream budgets accepted. Validate current physical devices and two-AVD lab matrix; start one AVD initially within measured capacity. Emulator evidence cannot replace physical/OEM proof.
- P0 hierarchy-vs-instrumentation, worker/runtime/OCR feasibility and privacy decisions available. This Phase productionizes that evidence; an incompatible finding requires a reviewed decision/amendment, not an unannounced adapter swap.
- Approve labeled corpus, private artifact location, supported app/profile/locale subset, benchmark procedure and target owner. Helper installation/permissions require their own authorization; no silent deployment.
- Execution order: **P4-01 → P4-02 → P4-03 → P4-04 → P4-05 → P4-06 → P4-07 → P4-08 → P4-09 → P4-10 → P4-11 → P4-12**. Finish each required test/review loop first. Task-level fixtures start when needed; P4-10 consolidates replay tooling rather than delaying earlier tests.

## 3. Proposed design and contracts

Actual source paths follow Phase 1 accepted package layout; logical modules below are proposed, not existing: UiAutomatorAdapter, HierarchyParser, SelectorResolver, ScreenFreshnessGuard, OpenCvPipeline, OcrModelManifest, VisionWorkerHost, RecognitionDecision, EvidenceStore/Replay and safe-stop UI adapter.

Recognition input binds screenshot/capture ID/hash, UI-tree hash if present, device ID/generation, app package/version, locale, dimensions/orientation, timestamp, requested task and ROI. Results include normalized boxes/coordinate space, text/semantic match, confidence/calibration version, model/preprocess version, latency and source provenance. A result is an observation, not permission to act.

Main/Device Host validates IPC schema/size/path and owns worker lifecycle; Python receives only bounded image bytes or approved opaque artifact handles, never arbitrary shell commands or secret references. Worker output cannot invoke ADB. Any approved instrumentation action routes through the same Device Actor/operation-owner contract as every other input. Stale generation, lost ownership or uncertain prior action blocks dispatch even with high OCR confidence.

## 4. Task packages

Every task is **NOT_STARTED**; positive/negative/failure tests are planned only. Shared evidence and rollback rules in §§5–6 apply to each row.

| ID / concrete deliverable and proposed module | Direct dependencies | Positive acceptance | Negative / failure acceptance | Evidence and rollback |
|---|---|---|---|---|
| **P4-01 — Hierarchy capture prototype on target profiles.** Reproduce Phase 0 captures through approved production adapter boundary; record coverage/limitations. | Phase 3 entry; P2-09; P0 findings | Supported authorized lab screens produce matching hierarchy/image with device/time/generation metadata on physical devices and named AVDs. | Empty/inaccessible hierarchy, permission dialog, app version mismatch, rotation and disconnect are unavailable/stale, not fabricated elements. | Profile-by-profile redacted XML/image hashes and command logs. Stop capture/clean owned temp artifacts; do not change device settings to force access. |
| **P4-02 — Stable UI Automator version/model.** Pin approved dump/instrumentation model, helper trust/permissions/lifecycle and compatibility. | P4-01; P0 adapter decision | Exact supported version works in packaged Windows/Android matrix; helper lifecycle documented if chosen. | Missing/incompatible helper, denied install/permission, corrupt output and unsupported app profile block capability; no alpha/unpinned fallback. | Version/license/adapter ADR linked to physical tests. Restore previous verified helper only with permission; never remove unrelated test packages. |
| **P4-03 — Normalized element tree.** Bounded parser preserves stable attributes, hierarchy, bounds and source context. | P4-02 | Valid trees normalize resource ID/content description/text/class/bounds and Unicode without changing semantics. | Malformed/truncated/oversized XML, unsafe entity payload, invalid bounds, duplicate IDs and missing root return typed errors or explicit ambiguity; no external resource fetch. | Unit corpus and physical-tree replay with expected normalized snapshots. Version parser output; invalidate incompatible cached trees. |
| **P4-04 — Selector resolver.** Ordered semantic matching with explicit uniqueness and capability profile. | P4-03 | Resource ID/description/text/class/bounds resolve expected labeled element; exact locale/profile rules are auditable. | Same-label duplicates, hidden/disabled nodes, unsupported locale and partial text collision cannot choose the first arbitrary element or wrong account. | Labeled expected-node tests, confusion/failure analysis and physical lab-action read-back through actor. Disable unsafe selector profile; retain evidence. |
| **P4-05 — Freshness and stable-screen wait.** Generation/orientation/app/screen revision plus bounded wait/cancel. | P4-04; P2-07 | Stable screen permits a fresh resolved action within approved freshness policy; waits finish or time out deterministically. | Rapid animation, navigation after capture, stale tree, rotation, owner takeover and reconnect invalidate old coordinates/identity; no forever wait or stale tap. | Fixed-clock replay and physical screen-change traces; latency limits approved from benchmark. Cancel pending undispatched action and recapture after known safe state. |
| **P4-06 — OpenCV preprocessing.** Versioned crop/ROI/scale/contrast pipeline with reversible coordinate mapping. | P4-05 | Labeled images preserve aspect, readable text and original-coordinate mapping across approved resolutions. | Invalid ROI, huge/corrupt image, dark/light extremes and transformation overflow fail safely; preprocessing cannot invent reliable evidence or hide uncertainty. | Before/after fixtures with transform metadata and unit/resource-bound tests. Revert pipeline version and invalidate derived outputs, not original evidence. |
| **P4-07 — PaddleOCR VI/EN models benchmark.** Pin candidate evaluation manifest and select from labeled CPU measurements. | P4-06; approved corpus/method | Vietnamese/English labels, diacritics and UI text evaluate on a held-out set with precision/recall/error cases, latency/memory and package footprint. | Wrong language, blurred/occluded text, ambiguous names, low contrast and unsupported layouts produce measured errors/unknown, not guaranteed matches. | Raw labels/predictions/model hashes/environment and owner-approved thresholds. Keep model unapproved/disabled if unmet; do not tune on holdout and claim independent accuracy. |
| **P4-08 — Python worker IPC/lifecycle.** Versioned validated messages, bounded queue, resource budget, timeout/cancel/restart and health. | P4-07; P1-11; P3 controls | Approved image request returns structured detection with provenance; CPU worker and streams coexist within measured envelope. | Malformed/oversized reply, mismatched request ID/generation, hang/crash, restart storm and exhausted queue return typed failure; no ADB input or arbitrary filesystem/network execution. | Unit/contract fuzz-negative tests, real Windows packaged worker/process traces and physical screenshots. Stop only owned worker, retain actor and pending job state; reject late replies. |
| **P4-09 — Calibrated confidence/action gate.** Versioned confidence policy by task/profile, semantic-first fallback ladder and uncertainty margin. | P4-04/05/07/08 | Held-out known screens meet approved recognition/action-safety criteria; reliable semantic match is preferred and evidence explains fallback. | Conflicting semantic/OCR candidates, near-threshold score, out-of-distribution screen and absent identity proof block action; OCR confidence alone cannot establish account identity. | Calibration/holdout report with false-positive cases and reviewer-approved per-profile thresholds. Disable affected capability rather than lower threshold silently. |
| **P4-10 — Capture evidence and replay.** Reproducible screenshot/tree/OCR bundle with manifests, hashes, labels and privacy lifecycle. | P4-09; earlier task fixtures | Replay reproduces recognition decision for exact versions; private data stays in approved artifact storage with redacted repo index. | Mixed device/time captures, tampered hash, missing artifact, expired data and sensitive unredacted fixture are rejected or marked incomplete; no false reproducibility claim. | Manifest validation, retention/redaction canary and Windows file-access tests. Quarantine broken bundle, retain unresolved evidence; delete only approved owned artifacts. |
| **P4-11 — Calibrated coordinate fallback.** Explicit certified-layout coordinates derived from current image transform, not universal hardcoded taps. | P4-05/09/10; P2 actor | Approved lab target acts correctly only with current dimensions/orientation/layout calibration and sufficient permitted confidence. | Overlay, scaling change, missing calibration, stale screen, account ambiguity or active-owner conflict blocks dispatch; high OCR score cannot override stale state. | Boundary/transform tests plus physical reversible action before/after. Disable fallback per profile; recapture/reconcile rather than repeat uncertain input. |
| **P4-12 — Unknown dialog/screen safe stop.** Typed blocked state, bounded diagnostic capture and explicit recovery/reverification. | P4-01…P4-11 | Recognized authorized continuation proceeds; unsupported screen shows a clear reason without claiming completion. | Unexpected dialog, security challenge/checkpoint/2FA, missing hierarchy plus low OCR, worker crash and disconnect halt new actions; no guessing or bypass. | Failure-injection matrix on replay + authorized physical lab states, actor trace proves no further input. Preserve evidence, revoke stale recognition and require legitimate recovery before a new preflight. |

## 5. Verification, privacy and measured acceptance

At Phase approval record concrete commands from Phase 1 harness and named fixtures for parser/selector/transform/state/IPC/worker tests. Collect **separate** source/Linux, replay, AVD, Windows CPU worker, physical UI/action and optional GPU evidence. CPU model results do not certify GPU runtime; emulator UI does not certify physical OEM/app behavior. UI recognition benchmarking must compare semantic-first pipeline with the coordinate-only baseline on the same supported labeled corpus, report unsafe false actions as well as successes, and obtain owner approval of limits before claiming AC-04.

Benchmark includes supported VI/EN profiles, low-quality/unknown/changed layouts, representative crop resolutions, warm/cold startup, repeated CPU runs, queue concurrency, worker crashes and **real Phase 3 streams + worker** together. Record raw latency distribution, throughput/memory/package size, error counts, samples/holdout separation and actor responsiveness. No arbitrary accuracy/latency guarantee is introduced here. Missing approved target or hardware blocks the affected gate.

Evidence metadata: task/case ID, source SHA, UTC, Windows/runtime/worker/model/preprocess versions, device/app/Android/locale, capture generation/time/orientation, expected labels, predicted result, action/no-action trace, status, hashes and redacted artifact references. Require exact scene/capture correspondence; screenshots alone are not live action proof.

Accepted privacy defaults: captures/UI trees/OCR expire after **7 days**, logs after **30 days**; unresolved-effect evidence stays protected until resolved/authorized cleanup. Jobs/metrics persist until user cleanup. A raw capture must not be renamed a fixture to evade retention. Use synthetic/deidentified fixtures and explicitly approved retention for the reusable test corpus. No credentials, OTP, cookies or challenge-solving corpus. Encrypted local backups follow the accepted seven-validated-copy and pre-migration protection rules; no automatic cloud upload.

## 6. UI, recovery and exit

Keep the V9 shell, right dock and workflow tree. Recognition status/errors appear through existing status/log/evidence surfaces and show unavailable/stale/blocked distinctions; no renderer bypass or automatic manual fallback. Same-viewport Dark/Light screenshots accompany affected UI.

Rollback: disable unsafe profile/model/coordinate fallback, stop owned worker/helper operations, preserve Device Actor and journal, version/invalidate derived recognition caches and restore a compatible model/runtime after verification. Do not treat an old backup or prior screenshot as fresh authority. After restored state or device takeover, quarantine dispatch until external-effect history is reconciled and fresh identity/screen evidence is obtained. No rollback automatically changes phone settings, removes user apps or replays uncertain actions.

Risks/stop signals: false positive identity/action → block profile; inaccessible tree → measured fallback or UNKNOWN; model/resource excess → queue/disable optional recognition without corrupting actor; schema/version mismatch → reject; missing privacy/policy permission → no capture. Assign technical and review owners at approval.

- [ ] All 12 P4 tasks PASS or explicit user-approved deferral with disabled scope/downstream impact.
- [ ] AC-04 semantic/OCR/calibrated-fallback gates meet approved labeled benchmark, including unsafe/unknown cases.
- [ ] Windows CPU worker packaging/restart and physical UI/action matrix pass; real stream+vision regression protects actor ownership.
- [ ] No Python/stream/helper competing input, low-confidence click or unknown-dialog auto-continuation.
- [ ] Privacy/retention, evidence replay, V9 parity, full regression and rollback verified.
- [ ] Acceptance report/status/PR reviewed; user acceptance and authorized merge before Phase 5 approval.

**User approval of this Phase:** PENDING · **Coding:** NO · **Actual tests:** NOT RUN.

| Date | Task | Commit/evidence | Actual result |
|---|---|---|---|
| — | — | — | NOT_STARTED |

## 7. Change history
| Date | Revision | Change | Authorization effect |
|---|---|---|---|
| 2026-10-30 | 1.0-draft | Detailed 12-task recognition plan using accepted product directions and separate evidence gates | Future draft only |
