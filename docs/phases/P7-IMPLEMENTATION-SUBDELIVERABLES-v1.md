# Phase 7 software subdeliverables — fixed ledger v1

**ADOPTED — 2026-11-02 12:29 UTC.** Independent scope and terminal evidence review CLEAR binds draft `d41120a98206cf759b5fcdc5e652cfb53eb7fca7b7213af211afa1ca6ec39a9f`. Reporting basis only, not new implementation authority. Formal acceptance remains **0/13 canonical tasks**. This first baseline accompanies the functional civil recurrence/slot milestone; it is not a delta from a previous measure or a standalone progress publication.

## 1. Requirements and uniform counting rule

Sources: [canonical Phase7](PHASE-07-scheduler-queue.md) §§1–6 and all thirteen task contracts, including deliverable, negative and rollback clauses; [master plan](../04_MASTER_IMPLEMENTATION_PLAN.md) §9; accepted C-10/11/18/19 and DEC-020 referenced there; [Amendment03](PARALLEL-SOFTWARE-EXECUTION-AMENDMENT-03.md); and the narrow [civil source-entry contract](P7-CIVIL-RECURRENCE-SOURCE-ENTRY.md). The source exception does not waive timezone, persistence, account identity, content, actor, Windows, V9 or physical dependencies.

Fixed denominator: **47 functional software subdeliverables across all 13 tasks**. Section2 derives scope before section3 overlays evidence. Cells follow separately named functional behaviors, not files, tests, estimated effort, an equal task allocation or a desired round total. Full unstarted queue, UI, timezone and recovery behaviors receive the same decomposition treatment as current pure functions. Equal counting is not an assertion of equal complexity/risk. Safety/refusal behavior belongs inside the relevant cell; tests substantiate behavior and never add cells. Human approval, empirical fairness targets and physical acceptance are separate gates, not fabricated percentage-bearing software work.

Uniform definitions, matching the Phase3/4 convention:

- **N — NOT_IMPLEMENTED:** the complete named software behavior is absent, including partial helpers/design-only work. No fractional credit.
- **S — SOURCE_IMPLEMENTED:** the entire named bounded behavior exists, but its intended integration and/or attributable software validation is not yet fully established. Component tests may already pass. Unrelated hardware acceptance does not withhold complete pure-source credit.
- **I — INTEGRATED_SOFTWARE_TESTED:** the entire behavior is in its intended integration path with attributable passing software tests. A pure library qualifies through actual composition of its declared input/consumer API; an app/DB/queue function requires its actual wiring. Mocking the function is not integration. Neither I nor S proves physical exclusion, actual timezone resolution or accepted tasks.

Source coverage counts S+I; integrated coverage counts I separately, never their sum. **First adopted baseline: source3/47=6.4%, integrated3/47=6.4%.** No comparative percentage-point delta is claimed. Any future split/merge/addition requires a new version, reason, old-to-new mapping and recomputation; denominator changes are not progress. One helper cannot earn several cells without completing their distinct behaviors. In particular civil preview is not also durable P7-11 job generation; runtime types are not queue/lease implementation.

## 2. Full scope-only mapping

References identify the canonical task row: **D** deliverable/positive behavior, **F** negative/refusal behavior, **R** rollback/lifecycle. Shared §3/§6 invariants remain binding throughout.

| Cell | Complete functional software subdeliverable | Canonical clause |
|---|---|---|
| P7-01.A | Versioned immutable civil recurrence schema for once/weekdays/every-N-days with exact dates, required selections and invalid interval/bounds refusal | 01 D/F |
| P7-01.B | Deterministic start-anchored civil occurrence arithmetic: inclusive end, planned-slot maximum, first bound wins, leap/month/year handling and no replacement from retries/skips | 01 D/F |
| P7-01.C | Persistent revisioned ScheduleProfile schema/serialization and compatible transactional migration with history preservation | 01 D; §6 |
| P7-01.D | Disable faulty schedule writes and recover a compatible prior revision without deleting generated/executed occurrence history | 01 R |
| P7-02.A | Explicit selectable IANA-zone admission with Asia/Ho_Chi_Minh default and no bare abbreviation/missing/host-zone fallback | 02 D/F |
| P7-02.B | Local-intent-to-UTC resolver using reviewed zone data, gap SKIP+notification and earlier-overlap-once policy, independent of host zone | 02 D/F; master02 |
| P7-02.C | Persist zone, resolution/offset policy and rule/data version; consistently expose local and UTC facts across restart | 02 D; §3.1 |
| P7-02.D | Zone/data incompatibility freezes affected future generation for review rather than rewriting historical UTC | 02 F/R |
| P7-03.A | Exact N-slot model with explicit valid unique local times/IDs, stable identity through reorder, explicit additions and acknowledged removals without invented times or silent retiming | 03 D/F |
| P7-03.B | V9 time-slot count/editor/preview integration and actual product/capability maximum admission, preserving explicit edits on refresh/count change | 03 D/F and §4 |
| P7-03.C | Revisioned restoration of an unconsumed prior slot list while retaining consumed/executed occurrence facts | 03 R |
| P7-04.A | Non-mutating below-30-minute warning evaluator with approved midnight/timezone comparison scope; 29 warns, 30 does not, no hard collision inferred | 04 D/F |
| P7-04.B | Visible editor/preview advisory and limited warning-disable recovery, never rejecting, shifting or cancelling solely for spacing or bypassing hard exclusion | 04 D/F/R |
| P7-05.A | Deterministic device/principal collision detection with precise conflict identity, revision checks and no assumed fixed execution duration | 05 D/F |
| P7-05.B | QUEUE-default and explicit BLOCK resolution retaining original intent and truthful reason | 05 D/F |
| P7-05.C | Explicit AUTO_SHIFT searches only allowed window/same local day, records resolved plan and returns REVIEW when no valid placement exists | 05 D/F |
| P7-05.D | Durable audited resolution/reversal and safe generation pause preserving existing queue/job facts; reversal is a new edit, not hidden rewrite | 05 D/R; §6 |
| P7-06.A | Persistent atomic device queue claim/release and blocked/queued/running state transitions, with no dispatch on failed/cancelled claim | 06 D/F |
| P7-06.B | Whole-workflow foreground ownership through the existing actor, serialized per phone and excluding conflicting manual/Home/Back/APK/proxy work | 06 D/F; §3.2 |
| P7-06.C | Explicit safe pause/takeover drains or reconciles effects and invalidates old UI evidence before replacement ownership | 06 F |
| P7-06.D | Dummy-runner queue/actor integration with reconnect/unavailable/duplicate-worker refusal and safe pause preserving unresolved running intent | 06 D/F/R |
| P7-07.A | Verified global-principal lease-key admission, blocking unknown/ambiguous/display-name-only identity without per-device fallback | 07 D/F |
| P7-07.B | Atomic account publication lease across phones on this local PC, coordinated with device claims and compensating partial-acquisition failure without dispatch | 07 D/F; §3.4 |
| P7-07.C | Visible owner/conflict and safe release/renewal semantics that reject expired or stale owners rather than claiming cross-PC exclusion | 07 D/F |
| P7-07.D | Unresolved-principal admission disable and preservation of lease/reconciliation state through restart/rollback | 07 R |
| P7-08.A | Deterministic configured platform priority/aging and tie-breaker with audited effective order, eligibility revalidation and safe policy replacement | 08 D/F/R; §3.7 |
| P7-08.B | Fixed-clock sustained-load fairness simulation/reporting for eligible jobs, blocked resources and policy edits against explicit approved wait objectives | 08 D/F/evidence |
| P7-09.A | Durable missed-versus-admitted classification: downtime-unadmitted defaults REVIEW, already admitted QUEUE remains queued with its intent | 09 D/F |
| P7-09.B | Clock-jump/offline/restart handling prevents duplicate catch-up floods, retains end/max/capability constraints and blocks uncertain or expired prior work | 09 D/F |
| P7-09.C | Auditable missed counts/planned-versus-actual times and explicit policy/review recovery without erasing or replaying possibly executed jobs | 09 D/R |
| P7-10.A | V9 day/week/month calendar, stable-ID phone/platform/account/target filters, stable colors and distinct planned/queued/running time display | master10; §4 |
| P7-10.B | Typed authorized revisioned move command with local/UTC intent, correlation and backend collision/capability/running-job refusal | 10 D/F; §6 |
| P7-10.C | Immediate optimistic drag/drop with persist-or-revert reason, stale-response/navigation/offline/repeated-drag fences and no hidden valid-move confirmation | 10 D/F |
| P7-10.D | Undo as a separately validated revisioned action with truthful failed-undo handling and before/after audit | 10 D/F |
| P7-10.E | Failure cancels optimistic state and reconciles latest canonical revision without automatic replay against changed intent | 10 R |
| P7-11.A | Shared resolved calculation path for non-mutating preview and generation, showing intended versus queued times and validated slot counts | 11 D |
| P7-11.B | Complete valid row date/time/zone visibly overrides profile; absent override follows it, partial/invalid override refuses through the same occurrence path | 11 D/F |
| P7-11.C | Transactional immutable job generation with stable occurrence/idempotency keys, revision/content/identity checks and duplicate/partial-write/crash refusal | 11 D/F; §3.3/6 |
| P7-11.D | Explicit audited future-revision amendments and correction of only provably undispatched erroneous jobs, preserving running/completed/UNKNOWN ledger facts | 11 D/R |
| P7-12.A | Attributed DST/no-DST regression corpus through actual resolver and preview/generation: expected local/UTC/offset/fold, gap notification and exactly one earlier overlap | 12 D/F/evidence |
| P7-12.B | Visible revisioned future zone/data edits and generation races preserve completed UTC history; unresolved future occurrences freeze for REVIEW | 12 D/F/R |
| P7-12.C | Packaged Windows timezone/restart comparison harness detects host/data differences without changing stored intent or silently substituting policy | 12 evidence; 02 evidence |
| P7-13.A | Durable owner/generation/fencing-token lease state with atomic acquire/heartbeat/expiry/release and final pre-handoff stale-worker refusal | 13 D/F; §3.4/5 |
| P7-13.B | Immutable claimed/running job snapshots bind schedule revision, content hash, verified identity/targets and workflow version despite later edits | 13 D/F; §3.3 |
| P7-13.C | Restart reconciles device/account claims and actual actor/effect state, safely reclaiming only proven undispatched work; TTL alone never authorizes retry | 13 D/F |
| P7-13.D | Compatible backup/migration/restore protocol and restored-backup dispatch quarantine preserve potentially post-backup effects and unknown leases | 13 F/R; §6 |
| P7-13.E | Boundary fault-injection/recovery harness covers claim/dispatch/release, DB lock/full-disk, crash, clock jumps, split ownership and process restart with integrity/fencing traces | 13 evidence; §6/7 |

Distribution checksum: **4 + 4 + 3 + 2 + 4 + 4 + 4 + 2 + 3 + 5 + 4 + 3 + 5 = 47**. Every canonical task has explicit functional coverage. Harness cells correspond to canonical executable simulation/comparison/fault-injection deliverables, not a cell for each authored test. P7-02 implements timezone behavior; P7-12 implements its cross-path and packaged-runtime regression coverage, not a second timezone engine. Device/account claim semantics in P7-06/07 do not substitute for P7-13 crash/expiry/fencing safety.

## 3. Adopted evidence overlay — baseline and timezone continuation

Current sole local `phase-07` is based on local `6cfe03f25722dcb77fc34c548a79eed43382a765`, corresponding published development `1bf3086c71117d9a4809eae8be48f4eab7758848`, tree `a4e4f8671da3c81f062102cfb32a92a6842cdb02`; it is not accepted main. The initial source-entry review permitted the civil recurrence/N-slot model; the [subsequent adopted timezone entry](P7-TIMEZONE-SOURCE-ENTRY.md) permits the explicit supplied resolver and exact dependency/notice integration. The actual model/edit/preview composition and integrated registration/checks are now terminal and independently reviewed, with stitched attribution below.

| Cells | Status | Existing behavior and exact limit |
|---|---|---|
| P7-01.A/B | I | Actual `schedule-civil-contract.ts` snapshots a closed immutable `CIVIL_RULE` schema and computes bounded `CIVIL_INTENT` occurrences. Gregorian arithmetic preserves original anchor, inclusive end and planned-slot ordinal/max across preview windows. No Date/Intl/zone/clock/job/success input can substitute host time or create replacement work. This is civil intent only, not the full timezone-bearing durable schedule. |
| P7-03.A | I | Actual `editCivilSlots` validates the complete explicit replacement, exact ordered discard acknowledgement and stable retained ID/time pairs. Reorder preserves chronological preview identities. The 1440 representational ceiling is minute-domain uniqueness, not an approved posting/product maximum; P7-03.B remains N. |
| P7-02.A/B | I | Explicit supported IANA-zone admission/default identity and actual civil→Temporal→immutable UTC/gap/fold composition, with exact runtime/dependency attribution and no host-zone fallback. Only admitted Node profile; Electron/persistence/job integration remains unavailable. |
| All other 42 cells | N | No complete behavior evidenced here. No credit for future DB/queue/lease/UI types, inherited actor/persistence primitives, or reuse of civil preview as executable P7-11 generation. |

**Current counts: N42/S0/I5, total47. Source5/47=10.6%, integrated5/47=10.6%, acceptance0/13.** Independent final review permits exactly P7-02.A/B N→I, +2/47 (+4.26 percentage points) in each measure versus preserved initial N44/S0/I3 baseline6.4%/6.4%. P7-01.A/B and P7-03.A remain I. No P7-02.C/D or P7-12 credit; denominator unchanged. [Timezone source evidence](../evidence/P7-02-timezone-resolution-2026-11-02.md) records actual14 resolver cases, dependency review and stitched integrated validation, not an uninterrupted aggregate.

[Exact source/integration evidence](../evidence/P7-01-03-civil-model-2026-11-02.md) preserves original batch3 ordinal21 failure (cause unestablished), isolated23/composed87 PASS, batches4–16 953PASS, batch17 sorted-registration failure corrected with5/5 affected PASS, untouched18–23 353PASS, and all seven final refresh stages PASS. No uninterrupted aggregate PASS is claimed. Graph124/map65114bytes; test inventory179; quality538+2 bound540/refusal541.

Read-only source identities at drafting:
- `desktop/src/schedule-civil-contract.ts`: `b6d6052eefc902943a45e3c2e9fd19479bb886ad2dff6c896883fd435ebd1af0`.
- `desktop/tests/schedule-civil-contract.test.mjs`: `8e0939a0d1998eb0afaf1885fce0fdf32c7664264fb5ff4f5d5527ba5487952a`.
- The existing test file contains18 authored cases spanning actual module snapshots, calendar boundaries, anchored recurrence/max, slots/edit identity, hostile descriptors, bounded preview, cross-host-TZ arithmetic and no activation. Implementer reports18/18 targeted PASS in `/tmp/auto-phase07-civil-final-tests.log`, including three actual host-TZ subprocess comparisons, plus scoped strict TypeScript and quality PASS. These are overlapping component software checks, not timezone-resolver/native evidence or progress weights. The normal integrated source attempt and its finite recoveries are terminal as attributed above, not a fresh full aggregate.

## 4. Acceptance and unresolved scope

**Formal acceptance remains0/13.** Even complete civil source does not accept P7-01 or P7-03: full ScheduleProfile persistence/migration and compatible revision recovery, packaged/persisted IANA resolution/versioning, V9 editor/product limits and downstream calendar/job integration remain open. P7-04 advisory behavior is not implemented by accepting close civil times. P7-11 idempotency/transactional generation is not implemented by deterministic in-memory preview.

Phase1 durable transactions/backup, Phase2 actor ownership, Phase5 verified global principal, Phase6 immutable media/content, timezone data/package compatibility and safe dummy-runner integrations remain their actual dependencies. Whole-workflow phone exclusion, cross-phone same-principal exclusion, no catch-up flood, unknown-effect reconciliation and restore quarantine require their own software and later runtime evidence. No timers, queue, DB records, IPC, UI, native/device commands or social actions are activated by this ledger or the civil model.

Windows sleep/restart/packaged timezone behavior, physical safe-command fencing, V9 Dark/Light parity, owner-approved performance/fairness and user acceptance remain separate evidence obligations. Synthetic clocks/principals/queues cannot prove physical account identity or actual device exclusion. Parallel source entry changes neither canonical task acceptance nor permission to publish social content.
