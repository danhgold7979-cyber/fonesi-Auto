# Phase 4 software subdeliverables — fixed ledger v1

**ADOPTED — 2026-11-02 12:02 UTC.** Independent review CLEAR binds draft `6fcf76f15b529fa04d7920aacf9e487045ae672edff467f732262d90634de1ae` and the exact integrated evidence below. Reporting basis only; no new source, acquisition, device, model-download or execution authority. Formal Phase4 acceptance remains **0/12 canonical tasks**. This document is to accompany the functional P4-03/04 milestone, not a standalone progress publication.

## 1. Requirement-derived scope and uniform definitions

Sources: [canonical Phase4](PHASE-04-recognition-vision.md) §§1–6, especially every task row's deliverable, positive/negative and rollback clauses; [master plan](../04_MASTER_IMPLEMENTATION_PLAN.md) §6; [Amendment03](PARALLEL-SOFTWARE-EXECUTION-AMENDMENT-03.md) §C. The historical task sequence and acquisition/physical gates are not erased by the narrow parallel software-entry exception. Recognition results remain observations, never account identity, input permission or proof of action.

The fixed denominator is **49 functional software subdeliverables across all 12 canonical tasks**. Section2 fixes scope before the evidence overlay in §3. Cells follow distinct named software behaviors, not a forced equal count per task or a target round total. Unstarted native adapters, model/preprocessing execution, lifecycle, evidence/privacy and failure/rollback functions are decomposed on the same basis as the existing pure functions. A cell is not a code file, test, document, estimated hour or unit of complexity; equal counting does not imply equal implementation effort or risk. Tests substantiate cells and never add cells. Human approvals, empirical performance thresholds and physical results are separate gates rather than invented percentage-bearing implementation work.

Uniform statuses, matching the Phase3 reporting convention:

- **N — NOT_IMPLEMENTED:** the complete named software behavior is absent; includes partial helpers, design-only work and incomplete implementations. Partial work is described without fractional credit.
- **S — SOURCE_IMPLEMENTED:** all named bounded software behavior exists; required intended integration and/or attributable software validation is not yet fully established. Component tests may already pass. Source credit does not require unrelated hardware acceptance.
- **I — INTEGRATED_SOFTWARE_TESTED:** the complete behavior is in its intended integration path with attributable passing software tests. For a pure library, this means actual producer/consumer composition of its declared supplied-input API; for an application/worker function, actual app/backend wiring is required. A mock of that function is not integration. Neither I nor S certifies native provenance, physical accuracy, supported Android profiles or task acceptance.

Source coverage counts `S+I` over the fixed denominator; integrated-software coverage counts `I` separately. They must not be added together. The first adopted baseline is 12.2% source and 12.2% integrated; this is not a delta from an earlier adopted measure. A later split/merge/addition requires a new ledger version, reason, old-to-new bridge and recomputation; denominator changes are never presented as completed work.

Safety requirements belong inside their corresponding functional cells. Reuse of one helper in several paths does not create new credit: each cell must supply its distinct declared behavior. Evidence from inherited P2 capture storage/actor/input validation is a dependency, not automatic completion of a Phase4 recognizer or replay service.

## 2. Complete scope-only mapping

The canonical reference column maps each cell to the task row; **D**=deliverable/positive behavior, **F**=negative/failure behavior, **R**=rollback/evidence lifecycle. These labels do not create new requirements.

| Cell | Complete functional software subdeliverable | Canonical clause |
|---|---|---|
| P4-01.A | Exact-target hierarchy capture through the approved production adapter, with supported profile selection and bounded execution | 01 D |
| P4-01.B | Matching hierarchy/image observation bundle bound to device, generation, time and capture identity | 01 D |
| P4-01.C | Empty/inaccessible output, permission obstruction, app mismatch, rotation and disconnect classified unavailable/stale without fabricated nodes | 01 F |
| P4-01.D | Cancel/stop capture and clean only owned temporary artifacts while retaining required redacted evidence; no phone-setting changes | 01 R |
| P4-02.A | Versioned selected UI Automator model/helper manifest with exact version, provenance/trust, permissions and compatibility requirements | 02 D |
| P4-02.B | Packaged helper/runtime admission and missing, incompatible, corrupt or unsupported profile refusal with no unpinned fallback | 02 D/F |
| P4-02.C | Owned deployment/session lifecycle for the selected dump/instrumentation model, including denied installation/permission handling | 02 D/F |
| P4-02.D | Restore only a previously verified compatible helper under permission, preserving unrelated installed packages | 02 R |
| P4-03.A | Normalize supported supplied XML into immutable hierarchy, stable attributes, bounds, exact Unicode and captured source/display context | 03 D |
| P4-03.B | Bounded malformed/truncated/oversized/unsafe XML, duplicate-attribute, missing-root and invalid-bounds refusal; preserve repeated semantic IDs rather than deduplicate | 03 F |
| P4-03.C | Version normalized output and reject incompatible tree versions at consuming boundaries so old representations cannot be reused as compatible | 03 R |
| P4-04.A | Explicit exact resource-ID/content-description/text/class/bounds predicate composition with deterministic evaluation, no implicit fallback or substring-first choice | 04 D |
| P4-04.B | Unique/not-found/ambiguous/unavailable outcomes, preserving duplicates and excluding or refusing hidden/disabled/missing-eligibility/non-actionable candidates without choosing the first | 04 F |
| P4-04.C | Auditable exact supplied app/profile/version/locale support contract and unsupported/mismatched-context refusal; supplied declarations do not certify a live profile | 04 D/F |
| P4-04.D | Disable an unsafe deployed selector capability/profile and retain its decision evidence for review and later supported re-enablement | 04 R |
| P4-05.A | Current recognition-to-action freshness gate covering generation, orientation, app/screen revision, navigation, takeover/reconnect and actual authority loss | 05 D/F |
| P4-05.B | Bounded stable-screen observation/wait with explicit policy, animation handling, timeout and cancellation | 05 D/F |
| P4-05.C | Cancel undispatched work and request fresh capture only after safe reconciliation; never replay stale coordinates or an uncertain prior action | 05 R |
| P4-06.A | Versioned OpenCV crop/ROI/scale/contrast processing of admitted image inputs | 06 D |
| P4-06.B | Reversible preprocessing-to-original coordinate mapping preserving aspect and orientation | 06 D |
| P4-06.C | Invalid ROI, corrupt/oversized image, transformation overflow and unsupported extreme input refusal within bounded memory/work | 06 F |
| P4-06.D | Restore a prior supported preprocessing version and invalidate derived results without altering original evidence | 06 R |
| P4-07.A | Exact candidate OCR model/language/runtime evaluation manifest and artifact/package admission, with unapproved candidates disabled | 07 D/R |
| P4-07.B | CPU OCR execution for approved VI/EN inputs with attributed model/version, text and structured unavailable/error output | 07 D/F |
| P4-07.C | Labeled held-out benchmark runner separating training/tuning inputs from evaluation and retaining raw predictions/labels/environment | 07 D/F |
| P4-07.D | Precision/recall/error, latency, memory and package-footprint computation/reporting against explicit owner-approved criteria | 07 D/R |
| P4-07.E | Wrong-language, blur/occlusion, ambiguous/unsupported layout and failed-model qualification handled as unknown/unapproved capability, not guaranteed text matches | 07 F/R |
| P4-08.A | Versioned worker request/reply schemas with bounded image/result sizes and exact request/device/generation/provenance correlation | 08 D/F |
| P4-08.B | Worker input boundary admits only approved bytes/opaque artifacts, never arbitrary paths, commands, network or ADB authority | 08 F and §3 |
| P4-08.C | Bounded queue and resource admission coordinated with streams/host budgets, with explicit exhaustion/backpressure | 08 D/F |
| P4-08.D | Owned worker start, request lifecycle, timeout/cancel and stop with actual outstanding work retained until retirement | 08 D/F/R |
| P4-08.E | Crash/restart containment, bounded restart policy and late-response rejection preserving Device Actor ownership | 08 F/R |
| P4-08.F | Attributed worker health/capability availability in the application integration, distinguishing unavailable worker from successful recognition | 08 D and §5 |
| P4-09.A | Versioned task/profile confidence and calibration policy with explicit approved thresholds and uncertainty margins | 09 D |
| P4-09.B | Semantic-first fallback decision ladder with evidence explaining which admitted recognizer was used | 09 D |
| P4-09.C | Conflict, near-threshold, out-of-distribution and absent-identity/action-authority refusal; OCR score cannot override freshness or prove identity | 09 F |
| P4-09.D | Disable/revoke affected recognition capability on unsafe calibration/profile change rather than silently lower thresholds | 09 R |
| P4-10.A | Versioned screenshot/tree/OCR evidence bundle with capture/provenance hashes, labels and complete/missing/mixed-context validation | 10 D/F |
| P4-10.B | Replay exact admitted versions and inputs to reproduce and compare recognition decisions with labeled expectations | 10 D |
| P4-10.C | Private artifact access, redacted repository index and approved retention/deletion protecting unresolved evidence | 10 D/F/R |
| P4-10.D | Quarantine tampered/incomplete/expired/mixed-device bundles and reject false reproducibility while preserving unresolved originals | 10 F/R |
| P4-11.A | Versioned certified-layout calibration data bound to dimensions/orientation and original-image transform; no universal hardcoded taps | 11 D |
| P4-11.B | Derive coordinate fallback only from current calibrated evidence and sufficient admitted confidence | 11 D |
| P4-11.C | Dispatch gate through the sole actor rejects overlay/scaling drift, missing calibration, stale screen, ambiguous identity or owner conflict | 11 F |
| P4-11.D | Disable fallback per profile and require recapture/reconciliation instead of retrying uncertain input | 11 R |
| P4-12.A | Typed recognized/unknown/blocked dialog-screen state and truthful application reason, including challenge/missing hierarchy/worker failure | 12 D/F |
| P4-12.B | Bounded diagnostic capture preserving required evidence without collecting credentials or exposing sensitive raw data | 12 D/R |
| P4-12.C | Synchronous safe-stop/revocation prevents new actions after unknown screen or challenge; no guessing, bypass or hidden manual continuation | 12 F |
| P4-12.D | Explicit legitimate recovery/reverification before a new preflight, with old recognition evidence remaining stale | 12 R |

Task distribution checksum: **4 + 4 + 3 + 4 + 3 + 4 + 5 + 6 + 4 + 4 + 4 + 4 = 49**. All P4-01…12 have a home; no later unimplemented task was collapsed to one placeholder while completed work was finely split.

## 3. Adopted evidence overlay — baseline and supplied-input continuations

Initial bounded source lane: `phase-04` based on `a1291d99e464292a6709351e54b79a6d366e48ef`, tree `2a56b23b829f46d1f4890189a5c8ef3f2723829b`. No main/native/IPC/DB/logger/actor acquisition or action path was activated. The local integrated check now passes1663/1663 and DESKTOP_SOURCE_CHECK_PASS; independent source and tooling review is CLEAR.

| Cells | Status | Exact basis and remaining boundary |
|---|---|---|
| P4-03.A/B/C | I | `capture-contract.ts` exposes the same bounded scanner as `normalizeHierarchyXml`; immutable `SUPPLIED_HIERARCHY_V1` tree preserves hierarchy/attributes/Unicode/display and repeated semantic IDs. Existing XML language/refusals remain. `hierarchy-selector.ts` descriptor-snapshots and rejects incompatible versions/invalid structure. Entities including predefined/numeric, DTD/comments and other unsupported syntax remain refused; no claim of universal Android XML compatibility. |
| P4-04.A/B/C | I | `resolveHierarchySelector(tree,profile,query,currentContext,now)` performs bounded exact conjunction, explicit uniqueness/eligibility and supplied context/profile/locale comparisons. Returns ordinal/status only. Profile declarations and `DisplayEvidence` are supplied observations, not sealed acquisition/certification or live authority. |
| P4-05.B | I | Actual PNG/XML codec → bounded supplied-observation stability → selector composition; explicit policy, change/gap reset, original supplied-monotonic timeout, immediate cancellation and immutable terminal history. No autonomous acquisition/timer, variance estimate or physical-stability guarantee. |
| All remaining 42 cells | N | No complete implementation is evidenced for the named behavior. Existing freshness helpers and P2 capture/actor storage are partial dependencies of P4-01/05/10/11, not counted again as full functions. No deployed profile-disable lifecycle is claimed from pure unsupported-profile refusal. |

**Previous supplied-stability counts: N42 / S0 / I7, total49. Source coverage7/49=14.3%; integrated coverage7/49=14.3%; acceptance0/12.** Independent criterion review on 2026-11-02 permits exactly P4-05.B N→I after the [supplied-stability checkpoint](../evidence/P4-05-supplied-stability-2026-11-02.md): 12 affected cases and one integrated1675/1675 PASS. This is +1/49, or +2.04 percentage points, in each coverage measure versus the preserved first baseline N43/S0/I6 (12.2%/12.2%). The denominator is unchanged. P4-03.A/B/C and P4-04.A/B/C remain I; P4-04.D and P4-05.A/C remain N. Supplied observations are not acquisition or action authority.

The [source checkpoint](../evidence/P4-03-04-supplied-hierarchy-selector-2026-11-02.md) records17/17 affected cases, one normal integrated1663/1663 source PASS, and overlapping2/2 graph-title corrections. Exact integrated log SHA256 `63222687f77637143834fd313d44eafea3d2e398810ae2d6279ce9a5c0bc4cc4`; module map124nodes/65,373bytes, test inventory177. These are local software facts, not native acquisition/Windows/physical/profile/action acceptance.

Source evidence identities at this snapshot:
- `desktop/src/main/capture-contract.ts`: `cc975b0fe8ef79a014441d17af149d024ecdb64aa689265dab3e08968372c4dc`.
- `desktop/src/main/hierarchy-selector.ts`: `e581fb5f2952d8a267ac81a2ec95b3b979e1c07cce3210310cc29d5a56058e1f`.
- `desktop/tests/hierarchy-selector.test.mjs`: `72046199bcc25adf10202d670dcbf4e1a59a862fb8133b136a70c6eebf2c3bb2`.
- Focused source-run log: `/tmp/p4-hierarchy-final.log`; scoped typecheck: `/tmp/p4-scoped-tsc-final.log`. These local logs are ephemeral, not a published or physical evidence claim.

## 4. Acceptance and unresolved evidence remain separate

**Formal acceptance: 0/12.** The seven integrated software cells do not turn P4-03, P4-04 or P4-05 into accepted tasks. P4-01/02 capture/model/helper compatibility is still unavailable; actual physical hierarchy replay and actor read-back for selected elements remain NOT_RUN. Autonomous acquisition/action-bound stable-screen operation, OpenCV, OCR/model admission/benchmark, worker lifecycle, calibrated decision/fallback, private recognition replay and unknown-screen application safe-stop remain unimplemented at their full named scope.

Every task retains its canonical device/AVD/Windows/visual/performance/privacy/recovery acceptance requirements. Held-out VI/EN accuracy and latency criteria, semantic-versus-coordinate baseline, stream/vision coexistence and preservation of actor ownership must be measured rather than inferred from a synthetic tree. CPU results do not certify GPU behavior, AVDs do not replace OEM devices, and supplied context does not prove account identity or permitted access. Physical deferral and parallel source entry change neither the acceptance denominator nor these obligations.


## 4. Reviewed OpenCV and worker continuation — local software evidence

Independent criterion review on 2026-11-02 permits exactly **P4-06.A/B/C and P4-08.A/B/D/E N→I**, based on the [actual supplied-image OpenCV/owned-worker checkpoint](../evidence/P4-06-08-supplied-opencv-worker-2026-11-02.md). The fixed denominator and cell definitions above are unchanged.

| Cells | Status | Exact basis and remaining boundary |
|---|---|---|
| P4-06.A/B/C | I | Actual bounded PNG decoder → cv2 crop/ROI/scale/gain → verified RGBA pipeline; separately bound source/wire hashes; exact forward/inverse rational edges/rectangles and conservative cover; invalid input, pre-inflate limits and overflow refusal. Coordinate mapping is not lossless image reconstruction or action authority. |
| P4-08.A/B/D/E | I | Actual fixed Linux development backend composes versioned bounded correlated byte-only IPC, one owned child/zero queue, original deadline/cancel, retained writes/EOF/close, late-output rejection and no automatic restart. A later explicit request requires actual prior retirement; processing supplies no Device Actor dispatch authority and does not replace the actor. |

**Current counts: N35 / S0 / I14, total49. Source coverage14/49=28.6%; integrated coverage14/49=28.6%; acceptance0/12.** This is +7/49 (+14.29 percentage points) in each measure from the preceding7/49 baseline, not seven completed tasks. Evidence is local: 20 affected JS cases, separate8 actual Python cases, and uninterrupted1695/1695 integrated source PASS. No hosted/Windows runtime result is claimed. P4-06.D prior-version recovery, P4-08.C stream/resource-budget coexistence, P4-08.F application health, native acquisition, OCR/models and action integration remain N/open.
