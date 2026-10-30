# PHASE-09 — Facebook capability pilot

**Revision:** 0.2-draft · **Date:** 2026-10-30
**Status:** DRAFT — NOT APPROVED / NOT AUTHORIZED FOR EXECUTION
**Task status:** P9-01–P9-12 NOT_STARTED; all implementation/hardware tests NOT RUN
**Planning branch:** `plan`
**Proposed execution branch:** `phase-09` — not created by this plan
**Execution base/owner:** accepted `main` SHA and responsible implementer/reviewer to be recorded at approval

Accepted product directions: [checklist C-01…C-22](../16_ACCEPTED_PRODUCT_DECISIONS.md). These choices do not replace technical proof, platform permission or express Phase execution approval.

## 1. Outcome, scope and traceability

Implement and certify only individually permitted Facebook workflows on explicitly authorized accounts and targets. Technical ability to operate an Android UI is not policy approval. A workflow must remain visibly disabled when authorization, identity, recognition, recovery or certification is missing; showing an entry in V9 never makes it runnable.

Canonical inputs: [master tasks](../04_MASTER_IMPLEMENTATION_PLAN.md), [product scope](../01_PRODUCT_SCOPE.md), [architecture](../02_TECHNICAL_ARCHITECTURE.md), [data/workflows](../03_DATA_AND_WORKFLOWS.md), [acceptance AC-09](../05_ACCEPTANCE_AND_RISKS.md), [V9 mapping](../06_UI_V9_MAPPING.md), [decisions](../08_DECISIONS_AND_OPEN_ITEMS.md), [execution rules](../11_PHASE_EXECUTION_PLAYBOOK.md), [resource controls](../12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md), [documentation policy](../13_DOCUMENTATION_CHANGE_POLICY.md).

**In scope:** lab app profiles; exact account/Page verification; separate Page video, photo/album, Reels and conditional Story certification; permitted read-back; optional authorized comments; capability denial; supported-version/locale fixtures; controlled acceptance.

**Accepted product direction:** the user's checklist 1–22 approval, recorded in the [decision register](../08_DECISIONS_AND_OPEN_ITEMS.md), selects foundation + Facebook first, with other networks disabled. The pilot target is owned/administered Pages for photo/album, feed video and Reels; Story needs separate certification; Profile/Group/reaction/share remain off. Comments require individually permitted scope. Human initial device provisioning/login and legitimate security recovery are allowed; routine enabled workflows are unattended and checkpoints stop execution. These choices are no longer product questions, but ownership is not platform permission and direction approval is not phase execution or runtime certification.

**Out of scope:** Graph API posting, arbitrary third-party scraping, Group discovery harvesting, bulk fake engagement, anti-detection, CAPTCHA/checkpoint/2FA/rate-limit bypass, credential collection, unapproved workflows or scale. No manual fallback may be hidden inside a workflow labeled unattended/READY. Legitimate provisioning/recovery remains outside routine execution and follows the approved provisioning decision.

The full [V9 HTML](../../ui-reference/Fonesi-Auto-V9-UI-Reference.html) remains the reference. Preserve every navigation item, workflow-tree entry, dock interaction and Dark/Light layout; attach status/reason data without removing unsupported entries or redesigning the tree. This is clean-slate Fonesi-Auto work; no fonesi-W implementation is an input.

## 2. Entry and remaining evidence/detail gates

- [ ] Phase 8 is ACCEPTED and merged; all earlier applicable gates, including Phase 0, have evidence. **Phase 0 is unfinished at this draft's creation.**
- [ ] User expressly approves this execution plan, the next task, execution branch and concrete pilot accounts/actions/volume within the accepted product scope. Technical dependencies do not authorize parallel phases.
- [ ] Phase 5 identity/target and account leases, Phase 6 exact media staging/Unicode content, Phase 7 queue/fencing and Phase 8 effect journal/reconciliation are accepted.
- [ ] Named test accounts/Pages, test media, device/app matrix and permissions are recorded privately with redacted references in evidence.
- [ ] Current written policy determination exists for each action; policy refresh date, reviewer, permission scope and revocation behavior are recorded. An unresolved policy outcome blocks the dependent action.
- [ ] Pilot volume, observation window, latency/accuracy criteria and stop conditions are proposed from feasibility data and approved by the user before any external action. No numeric throughput or account-safety guarantee is implied here.

| Evidence/detail to close | Accepted direction and remaining requirement | Owner |
|---|---|---|
| B-001 / B-003 / B-004 | Page pilot and disabled actions chosen above; action-specific written platform permission and exact account/target authorization still required | User + qualified policy reviewer |
| B-002 / B-005 | Human initial provisioning/login/recovery and routine unattended execution accepted; exact identity, account-switching and checkpoint-stop tests remain required | User + identity implementer |
| B-006 / B-011 | USB-first matrix targets two physical phones plus two AVDs; one physical phone may start testing but cannot close that matrix. Exact profiles and Vietnamese/English/emoji input proof remain required; wireless stays off until authenticated pairing/reconnect tests | User + hardware test owner |
| B-014 / B-015 | Permitted read-back, redaction/access and retention implementation tests: captures/UI/OCR 7 days, logs 30 days, jobs/metrics until user cleanup; unresolved-effect evidence retained | User + privacy/policy reviewer |
| Pilot operating envelope | Maximum authorized trials, content/audience, stop conditions, cleanup approval and measurable acceptance targets | User + test owner |

If policy cannot be approved, prepare a disabled-capability acceptance/deferral report rather than performing prohibited tests. Proceeding to Phase 10 then requires explicit user approval of that reduced release scope and Phase 9 deferral/closure plus merge; it does not certify any Facebook action or override Phase 0 gates.

## 3. Proposed implementation boundaries

Paths are **proposed logical modules**, to be mapped to the accepted Phase 1 layout at entry; they do not claim existing source files.

- `facebook/profiles/`: versioned app-state/selector profiles and certification descriptors, never embedded credentials.
- `facebook/workflows/`: fixed manifests/adapters using Phase 8 contracts; all input dispatched by the sole Device Actor.
- `facebook/verification/`: account, target and permitted result verification; UI tree before OCR, no guessed clicks.
- `tests/facebook/{fixtures,integration,hardware}/`: sanitized fixtures, lab doubles and separately labeled physical-device tests.
- `docs/evidence/phase-09/`: planned evidence index and certification matrix, with private-artifact references where raw content is sensitive.

Certification key must cover app package/version, Android version/OEM where relevant, locale, screen profile, account type, target type, workflow version and recognition model/profile version. A mismatch invalidates READY. Every publish/comment is a separate durable `EffectIntent`; intent precedes dispatch and verification binds the result to exact account/target/content. No external outcome is reconstructed solely from a toast or elapsed timeout.

## 4. Task execution details

All tasks below start **NOT_STARTED**. Default execution is numeric task order; listed dependencies are additional technical prerequisites, not permission to bypass the previous task's PASS/approved deferral.

### P9-01 — Lab-only app profile and supported UI states
- **Depends on:** accepted Phase 8 manifests/capabilities, Phase 4 recognition, action-specific lab permission.
- **Deliver:** profile loader and state corpus in `facebook/profiles/`, covering launch, composer, account/target picker, result, empty/loading/error and challenge states. Mark captures with package/version, device generation, locale and capture provenance.
- **Positive tests:** a permitted lab profile recognizes labeled states and never becomes production READY automatically. **Negative tests:** missing profile, unexpected dialog, stale screenshot, rotated layout or unapproved package safely blocks navigation/actions.
- **Evidence/acceptance:** profile schema tests plus labeled screenshots/UI trees and redacted physical capture manifest; every supported state maps to an explicit outcome.
- **Rollback:** disable the new profile; retain historical evidence and invalidate dependent certifications, never replace unknown states with coordinates.

### P9-02 — Exact logged-in account identity
- **Depends on:** P9-01 and Phase 5 identity/lease contracts.
- **Deliver:** account preflight and recheck adapter in `facebook/verification/`; correlate independently observable account identifiers with the registered account, not avatar/display name alone. Use verified global account identity across devices on this PC; its fenced account lease does not claim cross-PC exclusion.
- **Positive tests:** expected account passes with fresh evidence and lease ownership. **Negative tests:** same-name accounts, switched account, expired session, challenge, stale identity proof or competing lease blocks before input and pauses affected jobs.
- **Evidence/acceptance:** paired expected/wrong-account fixtures and physical switch test with command trace proving zero publish/comment dispatch on mismatch.
- **Rollback:** revoke profile readiness and release only owned/fenced leases; never log in automatically or collect credentials to repair identity.

### P9-03 — Exact Page/target identity
- **Depends on:** P9-02 and Phase 5 target permission evidence.
- **Deliver:** target resolver/recheck binding account, target type and exact authorized Page in `facebook/verification/`; store current evidence reference in preflight.
- **Positive tests:** intended administered Page is selected and reverified before composer/commit. **Negative tests:** similarly named Page, Profile instead of Page, removed admin rights, unexpected target switch and ambiguous picker block without posting.
- **Evidence/acceptance:** target identity decision table, duplicate-name fixtures and physical target-switch trace; no cross-target action in any negative case.
- **Rollback:** invalidate target capability and pending preflights; preserve registry/audit history rather than relabeling the wrong target as expected.

### P9-04 — Conditional Page video posting
- **Depends on:** P9-01–P9-03, explicit video policy approval, accepted media staging/Unicode and Phase 8 verification/journal.
- **Deliver:** `FB-PAGE-VIDEO` adapter in `facebook/workflows/` with format/profile preflight, exact staged media selection, caption/hashtag round-trip and versioned result verifier. Reuse Phase 8 verification contract; P9-08 adds the cross-workflow read-back regression.
- **Positive tests:** authorized lab video on the exact Page yields verified content/type/target evidence. **Negative tests:** wrong file/hash, truncated Unicode, low storage, account drift, rejected media, disconnect or crash after dispatch never produces false success or blind republish.
- **Evidence/acceptance:** intent-before-dispatch trace, physical before/after captures, media fingerprint and permitted read-back; ambiguous results are UNKNOWN/reconciliation-required.
- **Rollback:** disable video capability and stop new dispatch; already published content is not automatically deleted. Reconcile and obtain cleanup authorization.

### P9-05 — Conditional Page photo/album posting
- **Depends on:** P9-04 PASS or approved deferral, P9-03 and separate photo/album policy/profile approval.
- **Deliver:** `FB-PAGE-PHOTO` adapter using the explicit album group key and ordered asset list, producing one post per target and verifying asset IDs, image count/order, caption and same-Page result; no assumption that video certification covers photos.
- **Positive tests:** single photo and authorized multi-image album preserve exact image order/count and one-post-per-target grouping. **Negative tests:** missing/ambiguous album group, duplicate basenames, stale gallery cache, missing image, partial upload, reordered selection and failed final verification block success; uncertain publish is not retried.
- **Evidence/acceptance:** ordered asset/hash manifest, selection/result evidence and per-step journal from physical device; every expected image is verified using permitted visible evidence.
- **Rollback:** disable only affected profile/workflow, preserve failed selection/result records and staged-file ownership; delete local staging only through accepted cleanup rules.

### P9-06 — Reels distinct from feed video
- **Depends on:** P9-05 PASS or approved deferral, P9-03 and explicit Reels permission/certification scope.
- **Deliver:** separate Reels manifest/profile and content constraints in `facebook/workflows/`; composer/result classification cannot inherit a feed-video success.
- **Positive tests:** permitted Reel has correct media, target, content type and verified result. **Negative tests:** app routes into feed composer, unsupported aspect/duration, unknown audio/license prompt, missing result type or layout drift returns blocked/unknown, not READY.
- **Evidence/acceptance:** labeled Reel-versus-feed fixtures and physical result proof with journal correlation; criteria and supported formats approved before trials.
- **Rollback:** revoke Reels certification independently of feed-video certification; do not repost through another flow as a silent fallback.

### P9-07 — Story separate and disabled until verified
- **Depends on:** P9-06 PASS or approved deferral, Story-specific policy, audience/expiry/content requirements and profile approval.
- **Deliver:** separate Story capability/manifest and result verification plan; leave capability disabled until its full evidence is accepted.
- **Positive tests:** if authorized, verify exact Page, media, intended audience and Story result/expiry metadata exposed by permitted UI. **Negative tests:** absent permission, ambiguous audience, unsupported flow, expired result before verification or feed/Reels misclassification never becomes success.
- **Evidence/acceptance:** Story-only certification record or explicit DEFERRED reason; a fixture-only pass is insufficient to enable it.
- **Rollback:** disable Story, preserve expiry-related evidence and reconcile ambiguous effects. Do not alter audience or delete published content without separate authorization.

### P9-08 — Permitted post read-back
- **Depends on:** P9-04–P9-07 disposition, Phase 8 reconciliation and current collection permission.
- **Deliver:** shared read-back adapter/tests in `facebook/verification/` matching exact target, content fingerprint/context, result type and stable post reference where legitimately exposed. Bound search to approved visible data and approved observation window.
- **Positive tests:** each enabled post type maps to the intended effect and a repeat verification remains idempotent. **Negative tests:** stale cached posts, duplicate captions/media, wrong Page, delayed visibility, unavailable post ID and revoked permission yield ambiguous/blocked outcomes instead of invented references or scraping.
- **Evidence/acceptance:** verifier decision matrix and physical delayed/ambiguous-result traces; no toast-only success or automatic retry when visibility is uncertain.
- **Rollback:** suspend dependent capabilities if verification cannot remain reliable; retain UNKNOWN journal entries for authorized reconciliation.

### P9-09 — Comments within approved owned/administered scope
- **Depends on:** P9-08 and comment-specific policy approval, Phase 8 comment queue/interaction ledger.
- **Deliver:** comment adapter with eligible verified post reference, relevance/non-spam validation, exact identity checks, approved count/delay/interval and separate intent per comment. Count uses nonempty configured slots, not arbitrary target URLs.
- **Positive tests:** optional permitted comments start only after verified publish; delay and interval use the accepted verified-attempt semantics. **Negative tests:** unknown publish, unauthorized link, duplicate ledger entry, empty slot, changed target, rate limit, checkpoint or disconnect after send stops safely; UNKNOWN is not NOT_DONE.
- **Evidence/acceptance:** timestamped queue/effect traces, physical comment read-back and duplicate suppression fixtures; all action-level policy restrictions enforced at runtime.
- **Rollback:** stop comment scheduling, preserve ledger and reconcile dispatched items; no repeated send or deletion as automatic compensation.

### P9-10 — Deny unapproved Profile/Group/reaction/share flows
- **Depends on:** P9-09 disposition and Phase 8 capability registry.
- **Deliver:** default-deny capability entries and reasons for each Profile, Group, Like, Love and Share catalog entry. Separate written policy and technical certification are required before any future enablement; bulk fake engagement remains excluded.
- **Positive tests:** disabled entries stay visible in V9 with reason and permitted flows retain their own state. **Negative tests:** direct IPC invocation, saved schedules, stale enabled cache, imported configuration and UI double-click cannot bypass denial.
- **Evidence/acceptance:** UI screenshots and service/API negative tests show no actor dispatch for every denied action; Page certification grants nothing to these flows.
- **Rollback:** fail closed on registry/version failure; revoke any accidental enablement and audit affected jobs without replaying them.

### P9-11 — Per-version/per-locale certification fixtures
- **Depends on:** P9-01–P9-10 dispositions and Phase 4/8 drift detection.
- **Deliver:** sanitized fixture index and certification matrix keyed to the complete supported profile, with source hashes, labels, expected outcomes, approver and invalidation rules.
- **Positive tests:** exact certified combinations load their validated manifests and replay fixtures deterministically. **Negative tests:** unknown app update, locale, OEM/layout, recognition model or workflow revision invalidates matching capability until reviewed; certification cannot be copied by display-name similarity.
- **Evidence/acceptance:** physical run references for each advertised combination plus isolated replay results; simulator results explicitly labeled and not counted as physical coverage.
- **Rollback:** restore the prior still-valid profile only if the actual installed combination matches; otherwise remain disabled. Preserve superseded certification records.

### P9-12 — Small-volume controlled acceptance
- **Depends on:** all preceding tasks PASS/approved deferral; policy, pilot budget and cleanup authorization recorded.
- **Deliver:** controlled acceptance procedure/report in `docs/evidence/phase-09/`, covering every proposed enabled flow, interruptions and abstention paths before any scale proposal.
- **Positive tests:** approved trial set completes with exact identity, content, typed outcomes and durable verification. **Negative tests:** device loss, worker crash, app drift, account/target change, challenge, uncertain publish/comment and policy revocation cause the intended safe state; restart does not duplicate effects.
- **Evidence/acceptance:** full physical run matrix, raw timing/resource measurements, effect ledger, redacted captures, failures and user acceptance against pre-approved targets. Test volume never grows automatically.
- **Rollback:** disable pilot dispatch on any safety failure, preserve evidence, reconcile effects and follow separately approved cleanup. No automated scale test is authorized by a passing pilot.

## 5. Evidence and test protocol

| Layer | Procedure / environment | Evidence and pass meaning |
|---|---|---|
| Source/type/unit | Commands adopted from the accepted repository harness at phase entry | Exact command, commit, stdout/stderr and exit code; no fabricated command names |
| Fixture replay | Labeled UI XML/screenshots, malicious/stale/ambiguous cases | Recognition/state-machine correctness only; replay is not hardware certification |
| Service integration | Fake transport + real journal/queue with fault injection | Denied dispatch count, idempotency, recovery and fencing invariants |
| Windows app + V9 | Approved Windows builds, same viewport/DPI/themes as reference | Full screenshots and parity checklist; capability reasons and loading/error states |
| Physical Android | Approved device/app/locale matrix; permitted account/target trials | Per-device serial alias/generation, app versions, content hashes, exact effects and recovery evidence |
| Performance | Record repeated end-to-end timings, recognition latency, resources and workload composition | User approves metrics, target values and sample/observation design before acceptance; no arbitrary universal SLO |

Every evidence entry records task ID, code SHA, environment, timestamp, test input, expected/actual result, command/procedure, outcome and artifact hash/reference. Keep raw private screenshots/trees in access-controlled storage; repo evidence uses sanitized copies or private references. **Linux/source/mock checks cannot certify Windows integration, physical Android behavior, OCR accuracy on the actual corpus or GPU behavior.** Missing hardware/permission is BLOCKED, never PASS.

## 6. Safety, migration and rollback

- No passwords/OTPs/cookies/access tokens in fixtures, logs, SQLite or support exports. SQLite stores secret references to the Windows secret store only. Retain captures/UI trees/OCR for 7 days and logs for 30 days; jobs/metrics remain until user cleanup, and unresolved-effect evidence is protected from expiry cleanup.
- All actor input remains serial/transport-scoped with timeouts, cancellation, generation fencing and correlation IDs. Python and scrcpy cannot send input.
- Profile/certification schema changes use reviewed migrations and backup tests; historical effect records are immutable evidence, not rollback targets.
- Code rollback means disabling new dispatch, checkpointing durable work, restoring a compatible application/profile version and reconciling outstanding effects. Old-backup restore enters dispatch quarantine until post-backup effects are reconciled; restored `NOT_DISPATCHED` is not proof that no external effect happened.
- Cleanup removes only tool-owned staged copies after a verified outcome, never source originals; UNKNOWN effects retain their staged copies/evidence for reconciliation.
- External effects cannot be rolled back by Git or by restoring a DB. Delete/edit actions require separate authorization and their own verified effects.

## 7. Exit and acceptance

- [ ] Every P9 task PASS or individually user-approved DEFERRED with release consequence; unsupported capabilities remain disabled.
- [ ] Each READY workflow has current written policy approval, exact identity proof, complete profile certification, positive/failure/cancel/restart evidence and permitted outcome verification.
- [ ] No challenge/access-control bypass, credential capture, false success, wrong-target action or blind retry.
- [ ] Required Windows/physical tests and Phase 8 regression passed; V9 parity recorded.
- [ ] Pilot operating envelope, limitations, policy refresh/revocation conditions and safe-stop/cleanup procedures accepted.
- [ ] Acceptance report identifies commit range, exact tests, environment matrix, evidence, residual risks and proposed scope.
- [ ] User accepts Phase 9 (or explicit disabled-only deferral outcome), authorizes merge, and merged SHA is recorded before Phase 10 starts.

**Approval:** product directions accepted through checklist 1–22 in the decision register; this phase's execution-plan approval, named pilot authorization and evidence acceptance remain PENDING. Production coding authorized **NO**; external pilot actions authorized **NO**.
**Execution log:** none — planning only.
**Acceptance report:** NOT CREATED; no runtime PASS or release-readiness claim.

## Change history

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Added all P9 task execution contracts, conditional policy gates, evidence separation and rollback; no execution approval |
| 2026-10-30 | 0.2-draft | Reconciled accepted checklist 1–22 directions; retained policy/hardware/execution gates and added album, retention, local-PC identity and restore-quarantine precision |
