# PHASE-07 — Scheduler and queue

**Revision:** 0.2-draft · **Date:** 2026-10-30
**Plan status:** DRAFT — NOT AUTHORIZED FOR IMPLEMENTATION
**Task status:** All tasks NOT_STARTED; no scheduler/runtime/Windows/device tests executed by this revision.
**Proposed execution branch:** `phase-07` — not created by this plan
**Execution base:** Future accepted `main` SHA, to be recorded at approval
**Owner / approver:** Implementing AI/developer / user, to be recorded at approval

Phase 0 is still unfinished. The accepted advisory-gap decision is a product behavior decision, not authorization to implement or run this phase. A generated job is not permission to publish.

## 1. Outcome and traceability

Deliver deterministic recurrence preview/job generation, durable queue and device/account exclusion, plus V9 calendar editing with revision checks and audit. Planned time, queue eligibility and actual execution time must be separate facts.

Sources: [master P7-01..13](../04_MASTER_IMPLEMENTATION_PLAN.md), [product scheduling](../01_PRODUCT_SCOPE.md), [ScheduleProfile/Job and lease contracts](../03_DATA_AND_WORKFLOWS.md), [architecture concurrency](../02_TECHNICAL_ARCHITECTURE.md), [AC-07](../05_ACCEPTANCE_AND_RISKS.md), [V9 calendar](../06_UI_V9_MAPPING.md), [DEC-020 and B-013](../08_DECISIONS_AND_OPEN_ITEMS.md), [execution playbook](../11_PHASE_EXECUTION_PLAYBOOK.md).

**Accepted DEC-020:** below-30-minute spacing emits a visible warning only. It does not by itself reject a schedule, move a timestamp or cancel a job. A 29-minute gap is schedulable with warning; 30 minutes has no below-gap warning. Device serialization, account leases, platform/capability restrictions and collision policies are independent hard constraints.

**[Accepted checklist C-01..C-22](../16_ACCEPTED_PRODUCT_DECISIONS.md), especially C-10..14/C-18/19:** QUEUE is default; AUTO_SHIFT requires explicit choice and stays in the same local day/configured allowed window, otherwise REVIEW. Missed runs from downtime default to REVIEW, not catch-up flood; work already admitted to QUEUE remains queued, not reclassified merely because time passes. Default zone is `Asia/Ho_Chi_Minh`, with selectable IANA zones. DST gaps SKIP with notification; overlaps choose the earlier instant once. Every-N-days anchors on start date; end date is inclusive; max count counts planned occurrences, not successful posts; when both limits exist, stop at the first reached constraint. Retries/skips add no automatic replacement. A complete row date/time/zone overrides profile visibly; partial override is invalid and may not produce duplicate dispatch. Leases bind verified global account identity across phones on this local PC only, with no cross-PC guarantee. These product choices are not phase-execution approval.

## 2. Scope, entry and decisions

**In scope:** once/weekdays/every-N-days recurrence; IANA timezones; N slots; advisory gap; explicit collision modes; persistent device/account queue and leases; priority/aging; overdue policies; optimistic calendar drag/drop with undo; preview/idempotent generation; DST/timezone handling; restart fencing and immutable job snapshots.

**Out of scope:** executing actual social actions, altering accepted DST/overdue/collision defaults without approval, changing content after a job begins, automatic retries of uncertain external effects, distributed/cross-PC scheduling, arbitrary node-workflow design, fonesi-W code and V9 redesign.

Entry criteria:
- [ ] Phase 6 ACCEPTED and merged; all previous phase acceptance remains valid. Technical ability to unit-test recurrence earlier is not authority to start this phase early.
- [ ] Exact plan revision and one authorized task approved; verify repo, remote, branch, accepted base and clean/understood worktree.
- [ ] Phase 1 transactional persistence, P2 actors/device generations, P5 principal/identity contracts and P6 immutable media/content revisions accepted.
- [ ] Accepted scheduling choices above mapped to deterministic fixtures and reviewed schema. Remaining technical issues must be resolved without reopening accepted directions or claiming they prove implementation.
- [ ] Approved synthetic timezone/job fixtures and safe dummy device runner are available; no production dispatch path enabled in this phase.

| Topic | Accepted behavior and remaining evidence | Blocks |
|---|---|---|
| Recurrence calendar arithmetic | Start-date anchor, inclusive end and planned-occurrence max count accepted; test boundaries, empty weekdays/slot validation and no replacement on failure | P7-01/03 |
| DST gap/overlap | SKIP+notify gap, earlier instant once on overlap accepted; verify chosen library/data version and preview consistency | P7-02/12 |
| Collision policy | QUEUE default and same-day/configured-window AUTO_SHIFT accepted; verify collision domain, no fixed-duration guess and REVIEW when no slot | P7-05/11 |
| Overdue behavior | Downtime missed runs REVIEW; already admitted QUEUE stays queued; test classification at sleep/crash/admission boundaries | P7-09 |
| Lease/recovery policy | Transaction/fencing design, lease expiry/heartbeat model, uncertain work recovery and operator resolution | P7-06/07/13 |
| Performance | Representative schedule/device/account/job corpus; acceptable UI/generation latency and fairness wait objectives | Benchmark owner/user approval before performance acceptance |

## 3. Proposed components and invariant contracts

Candidate paths, to align with accepted Phase 1 package layout before coding:
- `src/domain/scheduling/`: recurrence, timezone, collision and immutable occurrence/snapshot types.
- `src/application/scheduling/`, `src/application/queue/`: preview, deterministic generation, queue coordinator and durable lease operations.
- `src/persistence/scheduling/`, `src/persistence/migrations/`: reviewed ScheduleProfile, occurrence keys, Job and lease storage/indexes.
- `src/renderer/calendar/`: V9 filters, day/week/month timeline, queue display, drag/drop/undo.
- `tests/scheduling/`, `tests/queue/`, `tests/calendar/`: fixed-clock/DST fixtures, DB concurrency/crash tests and V9 parity.

Invariants:
1. Persist local scheduling intent, IANA zone, derivation policy/revision and resolved UTC. Never interpret user schedule via the host's current timezone implicitly.
2. One active foreground job per physical device and one publish session per verified global account principal within this local PC. Multiple app profiles on one phone do not create extra foreground capacity. Ownership spans the workflow, not each command: refuse conflicting manual/Home/Back/APK/proxy requests unless explicitly authorized safe takeover drains/reconciles effects and invalidates prior UI evidence.
3. Job records bind schedule revision, occurrence identity, content/asset hash, device/account/target IDs and workflow version. An edited table row or schedule cannot silently mutate a claimed/running job.
4. Claim and lease acquisition are atomic or compensate with no dispatch. Fencing generation is checked before every device-bound handoff; stale workers cannot regain authority after reconnect/restart.
5. Lease expiry is not proof that an external operation failed. A job with possible side effect must remain reserved/blocked for reconciliation until runtime evidence resolves it.
6. Repeated generation/preview or worker restart never creates a second executable occurrence for the same logical schedule revision/occurrence. A complete row date/time/zone override resolves through the same occurrence path, not a second scheduler. Max count consumes planned occurrences; retry or failed publish never adds replacement occurrences. Amendments that intentionally replace future occurrences are explicit and audited.
7. Queue priority changes order, not authority: every dequeued job revalidates identity, capability, content and lease state. This phase hands only to a safe test runner; Phase 8 enables guarded workflow dispatch.

## 4. V9 calendar mapping

| V9 behavior | Backend contract | Evidence |
|---|---|---|
| Phone/platform/account/target filters | Stable IDs; incompatible filter changes do not mutate schedules | Empty/stale selection/repeated navigation tests |
| Horizontal day/week/month calendar | Timezone-labeled intended times distinct from queued/running times | Same-viewport Dark/Light comparison |
| Drag/drop immediate update | Optimistic expected revision; server-side collision/capability checks; revert on rejection | Concurrent edits/offline/undo cases; no extra hidden confirmation popup |
| Stable colors and queue view | Color keys stable by platform/account/target; queued work visible separately | Accessibility text/icons, sort and refresh checks |
| Time-slot count | Exactly posts-per-active-day slots, with advisory warnings and preview | N changes retain explicit edited values per approved rule |

Full V9 navigation, right-side phone monitor and workflow tree remain unchanged. A calendar marker is not evidence of a completed post.

## 5. Task contracts

Proposed task order: P7-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13. Work is strictly sequential. P7-06/07 use non-side-effect dummy runners until fencing/recovery acceptance and Phase 8 authorization. All statuses NOT_STARTED.

### P7-01 — Recurrence schema
- **Depends / deliver:** Phase 6 accepted; versioned once/weekdays/every-N-days schema, start-date anchor, inclusive end and max planned-occurrence semantics, constraints and migration plan. Retry/failure never consumes an additional occurrence or silently adds a replacement.
- **Positive tests:** each recurrence generates expected active dates; intervals cross month/year/leap boundaries; end date alone, max count alone and BOTH together are valid, stopping at the first reached constraint.
- **Negative tests:** zero/negative/noninteger interval, invalid weekday/date, end before start, invalid max count and empty required selections reject with field errors; failed/UNKNOWN/retried jobs never extend max count or generate replacement posts automatically.
- **Evidence / pass:** table of approved recurrence examples, schema/serialization/migration tests; defaults explicitly linked to decisions rather than library behavior.
- **Rollback:** disable new schedule writes and keep prior revision; recover compatible snapshot without erasing generated/executed occurrence history.

### P7-02 — IANA timezone contract
- **Depends / deliver:** P7-01; default `Asia/Ho_Chi_Minh`, validate selectable IANA ID, persist zone and resolution metadata, use reviewed timezone library/data version and present local/UTC conversion consistently. No bare host-zone fallback.
- **Positive tests:** same local intent produces correct approved UTC across multiple zones; app restart on a host in another zone does not change intent.
- **Negative tests:** unknown zone, bare ambiguous abbreviation, missing zone, timezone database change and nonexistent/ambiguous wall time require explicit policy rather than silent host fallback.
- **Evidence / pass:** fixed-clock conversion fixtures, timezone-data version and Windows packaged-runtime checks; DST behavioral approval linked before disputed cases pass.
- **Rollback:** freeze affected schedule generation for review; do not retroactively rewrite historical UTC timestamps under a different database version.

### P7-03 — N slots per active day
- **Depends / deliver:** P7-01/02; exact slot-count validation, deterministic ordered slot IDs and V9 time-slot editor/preview. Editing posts-per-day follows approved preserve/remove behavior.
- **Positive tests:** counts of 1 and representative multiple values render exactly N slots; explicit user times retain identity across reorder/refresh.
- **Negative tests:** slot-count mismatch, duplicate/invalid local time, missing values, overflow and reducing N cannot silently discard a populated slot or invent posting time.
- **Evidence / pass:** model/editor tests and V9 screenshots; maximum permitted count derived from approved product/capability decisions, not guessed throughput.
- **Rollback:** restore previous schedule revision/slot list where no job has consumed it; leave executed occurrence facts intact.

### P7-04 — Advisory below-30-minute gap warning
- **Depends / deliver:** P7-03 and accepted DEC-020; a gap-warning evaluator and visible preview/editor message, separate from collision and lease enforcement.
- **Positive tests:** 29-minute gap is accepted with warning; 30-minute and longer gap has no below-gap warning; saved times equal user times.
- **Negative tests:** warning must not become hidden rejection, AUTO_SHIFT, cancellation or disabled run solely for spacing. Conversely, warning acknowledgment must not bypass simultaneous device/account exclusion.
- **Evidence / pass:** boundary tests including midnight/timezone cases under approved comparison scope, UI warning proof and assertion that no timestamps were modified. Any unresolved warning comparison scope is documented before coding, not used to re-open the accepted advisory rule.
- **Rollback:** preserve schedules and disable only a faulty warning component with visible limitation; never retroactively cancel valid sub-30-minute schedules.

### P7-05 — QUEUE, AUTO_SHIFT and BLOCK collisions
- **Depends / deliver:** P7-04 and accepted scheduling checklist; deterministic QUEUE default, explicit AUTO_SHIFT or BLOCK resolver, keeping original intent, resolved plan, reason and audit. AUTO_SHIFT searches only the same local day and configured allowed window; no valid slot means REVIEW, never next-day spill.
- **Positive tests:** QUEUE retains planned intent while waiting; explicit AUTO_SHIFT records proposed/actual shift; BLOCK returns precise conflicting IDs. Repeated resolution is deterministic.
- **Negative tests:** collisions across same phone or same principal on different phones, exhausted same-day window, stale revision and no duration certainty cannot silently overlap, endlessly shift, spill to next day or assume fixed publish duration.
- **Evidence / pass:** approved policy examples and conflict graphs; advisory gap does not create hard collision by itself.
- **Rollback:** stop new resolved generation and preserve queued/job facts; any reverse shift is a new audited schedule edit, not hidden rewrite.

### P7-06 — One active foreground job per device
- **Depends / deliver:** P7-05 and P2 actor; persistent device-queue claim/release interface, explicit blocked/queued/running states and dummy-runner integration. ADB input owner remains existing Device Actor.
- **Positive tests:** two jobs on one phone run serially; separate phones can have separate authorized actors; cancellation before claim leaves no input dispatch.
- **Negative tests:** concurrent claim race, duplicate worker, reconnect generation change, actor unavailable and crash during claim cannot create two foreground owners or false success. Conflicting manual/Home/Back/APK/proxy cannot interleave between workflow steps; safe takeover must drain/reconcile before new ownership and invalidate earlier evidence.
- **Evidence / pass:** transaction/interleaving tests and safe physical-device actor exercise (no social action) when hardware integration is claimed. Full crash fencing is accepted only with P7-13.
- **Rollback:** pause queue admission, fence stale owners, inspect running intent and retain pending state; no blind job reset to READY.

### P7-07 — Global account publish lease
- **Depends / deliver:** P7-06 and P5-13 verified principal key; atomic account lease across phones within this local PC, coordinated with device claim, visible owner/conflict and safe release semantics. No cross-PC exclusion claim.
- **Positive tests:** two phones with the same proven principal cannot obtain simultaneous publish leases; different principals can proceed subject to each device lock.
- **Negative tests:** missing/ambiguous identity, display-name collision, lease acquisition after device claim fails and expired/stale owner cannot fall back to a per-device account key or dispatch partially locked work.
- **Evidence / pass:** concurrency/partial-acquisition tests, redacted lease trace and cross-phone principal fixtures; no actual publishing required or authorized here.
- **Rollback:** disable admission for unresolved principal; preserve lease/reconciliation state rather than deleting all locks on restart.

### P7-08 — Platform priority and aging
- **Depends / deliver:** P7-07; deterministic priority plus aging function with tie-breaker and audit of effective queue order, using approved policy parameters.
- **Positive tests:** configured platform priority is respected initially; old eligible low-priority jobs eventually progress under approved sustained-load scenario.
- **Negative tests:** continuing high-priority arrivals, unavailable device, blocked identity and priority edits cannot starve eligible jobs indefinitely or promote ineligible jobs into execution.
- **Evidence / pass:** fixed-clock queue simulation and measured fairness distributions; user/owner approves wait objectives before performance PASS, no invented universal SLA.
- **Rollback:** pause intake if policy is unsafe; apply approved prior scheduling policy without changing already claimed job ownership.

### P7-09 — Overdue and missed runs
- **Depends / deliver:** P7-08; missed occurrences from sleep/app downtime default to REVIEW, never automatic catch-up flood. Persist admission state so an already admitted QUEUE job remains queued even if its intended time passes. Other explicit modes require their configured policy and audit, not a hidden default.
- **Positive tests:** crash before admission yields missed-run REVIEW; restart after durable queue admission preserves queue position/intent; end/max-occurrence and capability remain enforced.
- **Negative tests:** prolonged offline interval, backward/forward host clock jump, expired content/target and partially executed prior job cannot trigger a burst of duplicate or unauthorized catch-up posts.
- **Evidence / pass:** fixed-clock restart fixtures and accepted REVIEW/admitted-QUEUE classification; missed-run count remains auditable, not silently erased. No undocumented grace period changes the default.
- **Rollback:** hold overdue jobs for REVIEW; preserve planned/actual times and avoid resetting potentially executed jobs.

### P7-10 — V9 drag/drop, optimistic revision, undo and audit
- **Depends / deliver:** P7-05/09; move command carries expected schedule/job revision, destination local/UTC intent and correlation ID; immediate UI preview then persist or revert with reason. Undo is another validated revisioned action.
- **Positive tests:** move persists and survives reload; undo restores valid prior intent; calendar filters/colors remain stable; no hidden confirmation popup for valid move.
- **Negative tests:** concurrent edits, stale response arriving after newer navigation, move of running/completed job, collision rejection, offline save, repeated drag and failed undo cannot silently clobber state or falsify success.
- **Evidence / pass:** UI/integration network-order cases, audit before/after and same-viewport V9 screenshots. Gap warning alone never rejects valid drag.
- **Rollback:** cancel optimistic state on failure, read latest canonical revision; do not replay a move automatically against a changed schedule.

### P7-11 — Preview and deterministic job generation
- **Depends / deliver:** P7-01..10; one shared calculation path for non-mutating preview and transactional generation, stable occurrence/idempotency key and clear planned-versus-queued times.
- **Positive tests:** preview matches generated rows; repeated/overlapping generator runs create no duplicate executable occurrence; complete row date/time/zone override visibly supersedes profile via one occurrence path; approved revision edit affects only intended future jobs.
- **Negative tests:** partial row overrides, profile-plus-row double generation, crash mid-generation, stale content/identity revision, partial transaction, conflicting import and recurrence changes cannot yield duplicate/mixed-version jobs or mutate running snapshots.
- **Evidence / pass:** preview/database diff, uniqueness/concurrency tests and restart trace; generated jobs remain non-dispatching until full runtime gates.
- **Rollback:** suspend generation, retain occurrence ledger; remove only provably undispatched erroneous jobs via audited correction, never clear completed/UNKNOWN records to rerun.

### P7-12 — DST and timezone-change acceptance
- **Depends / deliver:** P7-02/11; explicit regression corpus for spring gap SKIP+notification, autumn overlap earlier-instant-once, no-DST zone, zone edit and timezone-data update. Future intent changes require visible revision; completed UTC history is immutable.
- **Positive tests:** accepted resolution appears in preview and is reproduced after restart; skipped gap is reported, overlap generates exactly one occurrence at earlier instant; completed job UTC history remains immutable after changing zone.
- **Negative tests:** future zone-data mismatch, schedule edited during generation and overlap occurrence-ID collision cannot silently execute twice or shift history; a gap must not silently shift to a later hour instead of SKIP+notify.
- **Evidence / pass:** expected local/UTC/offset/fold decisions for every fixture; Windows packaged-runtime timezone comparison plus unit results. Host timezone changes must not alter stored intent accidentally.
- **Rollback:** freeze unresolved future occurrences for REVIEW; prior executed jobs remain facts, not regenerated under new timezone rules.

### P7-13 — Durable lease fencing, recovery and immutable snapshots
- **Depends / deliver:** P7-06/07/11/12; persistence and crash protocol binds device/account leases to owner/generation/fencing token; snapshots include schedule revision, content/hash, identity and workflow version. Restart reconciles owner/actor state before dispatch.
- **Positive tests:** clean restart reclaims only safe undispatched work; newer owner rejects old token; current content/schedule edits cannot change running job snapshot.
- **Negative tests:** crash between device/account claims, wall-clock jump, lease timeout while command may run, split worker ownership, restore from backup and stale device generation cannot double dispatch. Possible side effects remain UNKNOWN/reconciliation-blocked; elapsed TTL alone is never replay authorization. An older backup with NOT_DISPATCHED/absent rows still quarantines dispatch until potentially post-backup effects are reconciled.
- **Evidence / pass:** fault-injection interleaving table at every claim/dispatch/release boundary, DB integrity/fencing traces and Windows process-restart test; physical safe-command integration proves actor fencing where advertised.
- **Rollback:** fence all old owners, stop admissions and reconcile durable/actual state; do not bulk-delete leases or rebuild jobs from schedules when effects may already exist.

## 6. Persistence, security and recovery

- Migrations require reviewed uniqueness/index/foreign-key design and backup. Test full-disk/locked DB/crash during writes; failure to durably claim means no dispatch.
- Lease acquire/release, configuration edits, shifts, skips, cancellations and undo record actor, time, reason, expected/result revision and correlation ID without secrets.
- A schedule edit can alter future intent only under approved rules. Running/unknown jobs retain their snapshot and require separate cancellation/reconciliation, never silent mutation.
- Queue actions use typed IPC and service authorization; changing UI selection is not permission to operate all devices/accounts.
- Shared rollback: stop new admissions/generation → fence old workers → preserve snapshot/occurrence/effect history → take validated backup → restore only compatible state with explicit approval → reconcile before allowing new claims. Database restore cannot undo a post or establish that a formerly running job never executed.
- Back up before migration, at most daily automatically while running, and on manual request; retain seven validated normal copies plus pre-migration copies until upgrade acceptance. A failed backup never deletes good copies. Every older-backup restore starts in dispatch quarantine; NOT_DISPATCHED from that snapshot is insufficient proof against a post-backup effect.
- Same-day intervals and platform priority do not authorize spam or evade platform limits; capability and policy gates remain required downstream.

## 7. Verification matrix and evidence

| Layer | Planned procedure | Evidence and limits |
|---|---|---|
| Static/unit | Accepted Phase 1 lint/typecheck commands; pure recurrence/zone/gap/collision/priority tests | Exact actual commands/results added at execution; no command invented before manifests exist |
| Persistence/concurrency | Transaction races, duplicate generators, claim/release failure injection, migrations and restore | Deterministic seeds/interleavings, row snapshots and invariant assertions |
| Time | Fixed clock plus approved IANA fixtures, DST gaps/folds, host timezone/clock changes | Timezone data/library version and expected intent/resolution table |
| UI/V9 | Calendar moves/undo/repeated drag, filters, new navigation, stale responses, queue display and warnings | Same-viewport Dark/Light parity; failures revert truthfully |
| Windows recovery | Packaged scheduler sleep/resume, process kill/restart, DB locks and disk failure | Windows build and exact recovery trace; Linux test is not Windows proof |
| Device integration | Safe no-social-action commands on approved phones; two phones/same account-principal fixture; reconnect/fencing | Physical actor evidence distinct from simulator tests; no platform posting |
| Scale/fairness | Representative schedule/job/device counts, mixed priority, generation latency, queue wait and memory under streams/vision | Raw distributions and owner-approved limits; no arbitrary timing/concurrency promise |

Every evidence record: task/case ID, commit, environment class (source/unit/simulator/Windows/physical), exact procedure, expected/observed result, timestamp, tool/data/host/device versions, sanitized link/hash, reviewer and limitations. A mocked clock or queue proves algorithmic behavior, not real Windows sleep recovery or device exclusion. Missing required hardware tests remain BLOCKED.

## 8. Exit criteria and approval

- [ ] P7-01..13 PASS or each deferral explicitly approved with dependent behavior disabled.
- [ ] Recurrence, IANA zone, approved DST/overdue/collision semantics and below-30-minute advisory behavior deterministic and documented.
- [ ] Preview equals generated intent; repeated generation and concurrent workers produce no duplicate executable occurrences.
- [ ] Device and global account exclusion, fenced ownership and restart/backup reconciliation prevent stale dispatch.
- [ ] Immutable job snapshots survive source edits; UNKNOWN work is never made retryable by lease expiration alone.
- [ ] V9 calendar drag/drop persists or visibly reverts, audit/undo works, no unapproved confirmation popup/redesign.
- [ ] Windows recovery, safe physical-device integration, migration/restore and Phase 1–6 regression evidence pass; approved performance/fairness budgets measured.
- [ ] Acceptance report names unresolved/deferred capabilities, exact commit range, evidence and user decision; user accepts and approves merge before Phase 8 starts.

**Phase execution approval:** Not recorded. **Production coding authorized: NO.** DEC-020 and accepted checklist scheduling/stack directions are incorporated; exact schema, dependency pins, lease implementation and runtime evidence remain pending.

## 9. Execution and history

| Date | Task/commit | Actual tests/evidence | Result/approval |
|---|---|---|---|
| — | — | No implementation tests run by this draft | NOT_STARTED |

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Initial P7-01..13 execution plan; incorporates accepted DEC-020 advisory spacing while leaving collision/DST/overdue choices pending; no phase implementation authorization. |
| 2026-10-30 | 0.2-draft | Incorporated accepted QUEUE/REVIEW, DST, recurrence/count, same-day shifting, row overrides and local-PC lease directions; added whole-workflow ownership and restored-backup quarantine. |
