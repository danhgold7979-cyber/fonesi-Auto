# PHASE-08 — Workflow runtime and safety

**Revision:** 0.1-draft · **Date:** 2026-10-30
**Status:** DRAFT — NOT AUTHORIZED FOR IMPLEMENTATION; P8-01..14 NOT_STARTED
**Proposed branch:** `phase-08` — not created
**Execution base/owner:** Future accepted `main` SHA and AI/developer, recorded at phase approval

Phase 0 remains unfinished. No application/Windows/device/OCR tests ran for this draft. Accepted product direction is not phase authorization, platform permission or workflow certification.

## 1. Outcome, sources and scope

Deliver fixed versioned workflows, enforceable preflight/ownership, durable effects and evidence-based recovery. A click/toast is not success; UNKNOWN is never not done.

Sources: [master P8-01..14](../04_MASTER_IMPLEMENTATION_PLAN.md), [product](../01_PRODUCT_SCOPE.md), [architecture](../02_TECHNICAL_ARCHITECTURE.md), [workflow/data/ledger](../03_DATA_AND_WORKFLOWS.md), [AC-08](../05_ACCEPTANCE_AND_RISKS.md), [V9](../06_UI_V9_MAPPING.md), [accepted C-01..C-22](../16_ACCEPTED_PRODUCT_DECISIONS.md), [execution rules](../11_PHASE_EXECUTION_PLAYBOOK.md).

**In:** manifest/capability/preflight, state machine, journal/evidence, verification, comments, retry/reconciliation, pause/cancel/timeouts, drift, audit and interaction ledger. **Out:** real Facebook operations before Phase 9 permission/certification; node editor; login/2FA/checkpoint bypass; fake engagement; unknown-effect replay; Graph API posting; cross-PC locks; fonesi-W code; V9 redesign.

C-01..08/C-12 govern Facebook-first disabled-other-network scope, owned/administered Page photo/album/video/Reels pilot, separately certified Story, Profile/Group/reactions/shares off, comments only if permitted, user-led provisioning then unattended routine work, challenge stop, ADB-only input, semantic-first recognition and CPU-first OCR fallback. Account ownership alone is not platform permission. Exact versions/models/profile thresholds still require evidence.

## 2. Entry, architecture and invariants

- [ ] Phase 7 accepted/merged; earlier gates valid; this exact revision approved; one phase/task active. Verify repo/remote/branch/base/worktree.
- [ ] P2 actor/generation, P4 recognition, P5 exact identity, P6 media/staging and P7 fenced leases/snapshots accepted together.
- [ ] Per-action policy outcomes, supported profiles, verification oracle, safe retry classes and evidence permissions reviewed. Unknown permission remains blocked.

Proposed modules, mapped to accepted Phase 1 tree before coding: `src/domain/workflows/`, `src/application/workflows/`, `src/persistence/effects/`, reviewed migrations, existing workflow/job/log renderer surfaces; `tests/workflows/`, `tests/effects/`, `tests/recovery/`. React/SQLite direction accepted; exact schema remains reviewed, not invented as final.

1. Bind immutable job/content/hash/ordered-album, device generation, account/target, workflow and capability versions. Recheck freshness before consequential steps. One album group creates one post per target. Runtime never adds replacement occurrences for retries/failures.
2. Own the device for the whole foreground workflow, plus account lease across phones on this local PC. Refuse conflicting tap/Home/Back/APK/proxy actions. Explicit safe takeover drains commands, reconciles possible effects and invalidates earlier UI/identity evidence before handover/resume. Unresolved effects cannot be bypassed by forced unlock.
3. Typed outcomes: SUCCESS_VERIFIED, FAILED_KNOWN, BLOCKED_PRECONDITION, RETRYABLE, UNKNOWN_EXTERNAL_EFFECT, NEEDS_RECONCILIATION, CANCELLED. One unresolved action at a time; transitions carry reason, correlation/effect ID and evidence.
4. Durable intent precedes dispatch; failed persistence means no action. Dispatch and verified outcome are separate. Timeout/cancel/crash after possible dispatch preserves uncertainty; transport error alone never makes effect retry safe.
5. Evidence binds capture time, device generation/orientation, app/profile, screenshot and model. Stale/low-confidence/unknown screen stops; Python and scrcpy never send competing input.

Keep V9 fixed workflow tree and right monitor. Show readiness/block reason, pause pending, rejected takeover and reconciliation-required states truthfully; enforce UI gates through IPC too. Same-viewport Dark/Light parity required; no hidden manual workflow fallback.

## 3. Sequential task contracts

Execute P8-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14. Earlier tasks use non-side-effect adapters until integrated safety passes. All NOT_STARTED.

### P8-01 — Fixed manifest/versioning
- **Depends/deliver:** Phase 7; immutable ID/version, policy/profile requirements, ordered steps, input schema, effects, timeouts and retry metadata.
- **Tests:** valid manifest snapshots; duplicate/unknown step, changed same-version manifest, bad input or absent verification rejects; old jobs retain version.
- **Evidence/pass:** schema/version fixtures and manifest review; definition existence never enables execution.
- **Rollback:** disable version; preserve historical definitions needed by jobs/effects.

### P8-02 — Capability registry
- **Depends/deliver:** P8-01/P5; keyed app package/version, Android/device profile, locale, account/target/content type and policy outcome; missing tuple fails closed.
- **Tests:** exact certified tuple READY; unknown version, Page proof reused for Profile/Group, revoked permission or unsupported network blocks UI and IPC.
- **Evidence/pass:** registry fixtures and policy/physical-certification references; no wildcard readiness from one phone.
- **Rollback:** disable affected tuple, retain catalog/history, re-preflight queued jobs.

### P8-03 — Preflight
- **Depends/deliver:** P8-02/P5/P6/P7; verify actor/lease, exact identity, policy/capability, media hash/staging/storage, snapshot and app/UI freshness without side effects.
- **Tests:** valid fixture eligible; wrong account/target, stale generation, changed media, partial time override, proxy mismatch or challenge blocks with no dispatch.
- **Evidence/pass:** check-by-check cases plus safe physical identity/staging integration; old preview cannot replace fresh checks.
- **Rollback:** stop admissions and invalidate cached eligibility after relevant changes.

### P8-04 — State machine/typed outcomes
- **Depends/deliver:** P8-03; persistent legal transitions, whole-session ownership and one unresolved action at a time.
- **Tests:** valid PREFLIGHT→RUNNING→STEP_VERIFY→SUCCESS_VERIFIED; late/duplicate results, stale owner, unknown screen and conflicting manual/APK/proxy cannot advance or steal ownership.
- **Evidence/pass:** transition/interleaving table and no-command assertions; ownership covers inter-step waits.
- **Rollback:** fence owners, retain state; never reset RUNNING/UNKNOWN to READY.

### P8-05 — Durable effect journal
- **Depends/deliver:** P8-04; transactional intent before dispatch, separate dispatch/outcome records and stable effect key; write failure prevents handoff.
- **Tests:** verified ordering; kill at every write/dispatch boundary, disk full, duplicate request and uncertain commit produce no unjournaled/replayed effect.
- **Evidence/pass:** ordering/fault traces and actual Windows DB durability tests, not mocked writes alone.
- **Rollback:** stop dispatch, preserve journal, reconcile uncertainty; never delete intent to permit retry.

### P8-06 — Action evidence
- **Depends/deliver:** P8-05/P4; before/after screenshot/tree/OCR bound to job/step/effect, integrity hash, metadata and redacted export.
- **Tests:** labeled replay matches; stale/rotated capture, worker crash, corrupt/missing artifact or low confidence blocks; retention holds unresolved evidence.
- **Evidence/pass:** sanitized fixtures and physical capture time/generation proof; OCR references exact image/model.
- **Rollback:** disable faulty recognizer; preserve holds and explicitly report missing evidence.

### P8-07 — Publish verification/duplicates
- **Depends/deliver:** P8-05/06; exact identity/content-kind/media/caption verification and permitted created-post reference, reconciled against intent.
- **Tests:** controlled publication verifies once; toast-only, wrong target/type, partial album, identical unrelated caption or timeout after possible press never causes blind republish.
- **Evidence/pass:** verification oracle and safe adapter cases; real Facebook read-back requires Phase 9. Reels need separate proof from video.
- **Rollback:** disable publishing, hold reconciliation; no automatic post deletion as compensation.

### P8-08 — Post-success comments
- **Depends/deliver:** P8-07/P6; 0–10 permitted non-empty comments linked to verified post; delay after verified publish, interval between verified comment attempts; each journaled.
- **Tests:** valid timers/order; unknown publish/previous comment, wrong post/account, challenge or expired permission blocks next comment; Vietnamese/English/emoji round-trip exact.
- **Evidence/pass:** virtual-time, Unicode and per-comment effect fixtures plus permission reference; no live comment authority here.
- **Rollback:** cancel undispatched comments; preserve dispatched/UNKNOWN, never automatic retry/delete.

### P8-09 — Safe retry policy
- **Depends/deliver:** P8-05/08; reviewed action-specific bounded attempts/backoff and fresh ownership/state checks.
- **Tests:** known-safe read retries; possible effect, lost acknowledgment, stale fencing, checkpoint/rate limit or unsupported action never retries/bypasses.
- **Evidence/pass:** action-class/fault matrix; exact budgets approved from measurements, not universal numbers.
- **Rollback:** disable retries; preserve attempts, occurrence count and idempotency keys.

### P8-10 — Unknown-effect reconciliation
- **Depends/deliver:** P8-07/09; permitted read-only evidence resolves VERIFIED/FAILED only if adequate; otherwise NEEDS_RECONCILIATION with holds.
- **Tests:** exact known effect resolves; ambiguous/no read-back, expired session or multiple candidates remain unresolved. TTL/restart never means NOT_DONE. Older backup NOT_DISPATCHED/absent rows cannot bypass dispatch quarantine.
- **Evidence/pass:** replay/crash/older-backup cases; operator acknowledgment is not proof of success or absence.
- **Rollback:** hold execution and evidence; never rerun from a clean schedule snapshot.

### P8-11 — Pause/cancel/resume/timeouts
- **Depends/deliver:** P8-10/P7; requested/settled states, bounded waits, safe points and authorized takeover; resume needs fresh preflight.
- **Tests:** pre-dispatch cancel sends nothing; pause drains; takeover waits for reconciliation and invalidates evidence. In-flight possible effect stays UNKNOWN; repeated clicks idempotent, stale owner/challenge cannot resume.
- **Evidence/pass:** interleaving tests and safe physical Home/Back ownership exercise; cancellation never claims to undo dispatch.
- **Rollback:** stop admissions/fence owner; retain pending state, no forced unresolved unlock.

### P8-12 — Upgrade/layout drift
- **Depends/deliver:** P8-02/06/11; app/profile/orientation/locale mismatch revokes readiness and stops before unsafe action; recertify.
- **Tests:** supported profile resumes with fresh proof; queued/running app update, changed selector/dialog or confidence loss cannot reuse stale coordinates/certification.
- **Evidence/pass:** versioned drift fixtures and physical change observations; no automatic app downgrade workaround.
- **Rollback:** disable profile; historical evidence cannot certify new execution.

### P8-13 — Audit/job report
- **Depends/deliver:** P8-01..12; correlated intent/step/outcome/lease/takeover/reconciliation report, source timestamps, missing-evidence states and safe export.
- **Tests:** reconstruct controlled run; missing artifact, redaction failure, cancelled/denied export and concurrent update never fake all-success or leak secrets.
- **Evidence/pass:** report-to-record comparison, redaction scan and V9 log parity; test data labeled.
- **Rollback:** disable export, retain audit; never rewrite UNKNOWN for presentation.

### P8-14 — Interaction ledger/permitted sources
- **Depends/deliver:** P8-02/05/10/13; account+target+verified post+action key, eligibility/dedup states and permitted explicit-list/latest-N ordering/pagination.
- **Tests:** authorized references deduplicate/order; duplicate URL, stale page, no permission, uncertain pagination, mismatch or UNKNOWN never becomes NOT_DONE/eligible. No invented URLs/unauthorized harvest.
- **Evidence/pass:** source policy/capability and pagination fixtures; real collection needs separate Phase 9/10 permission/certification.
- **Rollback:** disable source/actions, retain ledger/evidence; never reset ledger to refill target count.

## 4. Privacy, migration and rollback

C-13/14/C-21/22: captures/UI/OCR 7 days, logs 30 days; unresolved evidence retained beyond expiry; job/metric history until explicit cleanup. Remove only tool-owned staged copies after verified completion, never originals/UNKNOWN copies. No credentials/OTP/cookies/proxy secrets in reports; Windows secret references only.

Review journal atomicity, uniqueness, foreign keys and migrations. Encrypted local backups in user-selected folder, no cloud: before migration, at most daily automatically while running, and manually; seven validated normal copies plus pre-migration copies until upgrade accepted. Failed backup never deletes good copies. Secret/key portability requires proof; unavailable secrets block dependent operations.

Shared rollback: stop dispatch → fence workers → preserve evidence/actual state → validated backup → authorized compatible revert/restore → reconcile. **Every older-backup restore quarantines dispatch until post-snapshot effects reconcile. Restored NOT_DISPATCHED/absent rows are not proof no effect occurred.** Insufficient evidence stays blocked. Local restore never undoes external effects or authorizes compensation.

## 5. Verification, exit and approval

| Layer | Required planned evidence |
|---|---|
| Static/unit | Actual accepted Phase 1 lint/typecheck/test commands, manifest/state/preflight/retry fixtures; no invented commands before manifests |
| Integration/faults | DB intent ordering, stale/concurrent owners, disk/write failure, kill/restart at each effect boundary, old-backup quarantine |
| Recognition | Labeled UI/OCR stale/unknown/drift corpus; model/version/locale and owner-approved measured accuracy/latency |
| Windows/physical | Packaged process/DB/worker recovery; safe takeover, two-phone isolation and capture generation; Linux/AVD alone insufficient |
| UI/security | Full-V9 Dark/Light same-viewport states, IPC gate bypass, secret redaction and process/path boundary tests |
| Performance | Representative jobs/evidence/streams/vision load, latency/memory/queue distributions and input integrity; measured owner-approved budgets |

Artifacts record task/case/commit, environment class, tool/model/app/host/device versions, procedure, expected/actual result, timestamp, sanitized link/hash, reviewer and limits. Missing required hardware means BLOCKED, never source-review PASS. Platform policy/pilot certification is separate from safe runtime tests.

Exit: all 14 tasks PASS or explicitly approved deferral with dependents disabled; earlier-phase regression; durable effects and no duplicate crash/restore replay; exact identity/capability; takeover/UNKNOWN holds; V9/privacy/retention; measured approved budgets; acceptance report plus user acceptance/merge approval before Phase 9. No permitted read-back means relevant workflow disabled, not secretly manual.

**Phase execution approval: NOT RECORDED. Production coding authorized: NO.** Accepted C-01..22 behavior does not close Phase 0 or prove runtime acceptance.

## 6. Execution/history

| Date | Task/commit | Actual tests | Result |
|---|---|---|---|
| — | — | No implementation tests run | NOT_STARTED |

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Complete P8-01..14 after accepted directions; no code/operation authorization or runtime PASS. |
