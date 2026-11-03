# Phase07 civil recurrence and N-slot model — adopted source entry

ADOPTED 2026-11-02 12:13 UTC. Independent source-entry review CLEAR binds pre-adoption SHA256 `adcac15fa459295ba189560163edc98dfba88e7879836bc33cd281cb4e82cbbc`. Exact published development base `1bf3086c71117d9a4809eae8be48f4eab7758848`, corresponding local `6cfe03f25722dcb77fc34c548a79eed43382a765`, tree `a4e4f8671da3c81f062102cfb32a92a6842cdb02`. Sole local branch `phase-07` is created at that base, not accepted main. The finite decisions below were reviewed for source implementation only; historical proposal wording does not reopen the decision or authorize effects. At the original draft checkpoint no branch/worktree, implementation or test execution existed. The adopted source lane now has its recorded local branch and separately attributed source/tests; no schedule, DB row, timer or dispatch is created by this contract. Phase07 and its task acceptance remain open; no percentage or completed-task claim.

## Original requirement and useful boundary

Canonical sources in `fonesi-Auto-audit`: `docs/04_MASTER_IMPLEMENTATION_PLAN.md` P7-01/P7-03; `docs/phases/PHASE-07-scheduler-queue.md` §§1–5; `docs/03_DATA_AND_WORKFLOWS.md` ScheduleProfile/§2.6; `docs/16_ACCEPTED_PRODUCT_DECISIONS.md` C-18/C-19; `docs/decisions/ADR-0003-schedule-gap-policy.md`.

Accepted semantics: once, selected weekdays and every-N-days anchored to the selected start date; inclusive end; maximum counts PLANNED OCCURRENCES, not active days or successful posts; first applicable bound wins; retries/skips never manufacture replacement occurrences. P7-03 requires exact N slots, stable slot identities across reorder, no duplicate local times and no silent populated-slot removal. ADR0003 says sub30-minute spacing is advisory, never a hidden minimum or time shift; this slice deliberately does not evaluate that advisory.

Deliver one useful pure model: strict immutable civil rule+slot schema, explicit identity-preserving slot edits, and a deterministic bounded civil-occurrence preview using the same arithmetic that a later reviewed timezone/generation layer can consume. It is NOT a ScheduleProfile persistence schema, executable job list, actual scheduling permission or P7-11/P7-12 completion. No timezone parameter is ignored: this type intentionally contains no zone/UTC fields and rejects them as extras. Results are labelled CIVIL_INTENT, never timestamps. P7-02 must later validate explicit IANA timezone and resolve gap/fold with accepted policy before any job exists; host timezone/default/Date parsing is forbidden here.

## Future branch/dependency boundary

Only after review/source entry: recheck canonical `phase-07` existence; create it once if absent in an isolated worktree (proposed `/workspace/scratch/55d236e904dc/fonesi-Auto-phase-07`) from the coordinator's exact reviewed published software base and record commit/tree. Do not use the dirty phase03 package tree or invent accepted-main status. One canonical phase07 branch, no worker-specific branch; preserve main/history and parallel phase03/phase04 work.

The historical Phase07 draft requires Phase6 acceptance and P7-03 depends on P7-02. Any source-first exception must be explicitly recorded as this authority-free civil-model subset under software-first/parallel amendments, not waiver of Phase1 persistence, Phase2 actors, Phase5 identity, Phase6 content, timezone, V9 or physical acceptance. No source entry is requested for queue/leases/dispatch.

Proposed owned files only:
- `desktop/src/schedule-civil-contract.ts`: leaf types, descriptor-safe snapshots, civil arithmetic, fixed exports below (one implementation, no second date helper/library).
- `desktop/tests/schedule-civil-contract.test.mjs`: actual module pure tests and hostile-input cases.
- Exact parent-owned test inventory/quality/module-map registration needed by the existing build system, plus a zero-import activation assertion. No main/preload/renderer/IPC/native/storage modifications. Module has no Node, Date, Intl, clock, random-ID, timezone, filesystem, callback/provider or third-party dependency.

## Exact schema and bounds (proposed implementation limits, not posting policy)

Gregorian civil calendar only, explicit four-digit years 0001–9999; dates canonical `YYYY-MM-DD` length10 and real month/day/leap validity. No year0, signs, whitespace, Unicode digits, date-time strings or rollover. Leap iff divisible4 except100 unless400. Monday=1 … Sunday=7; 0001-01-01 is Monday. Internally use bounded integer day ordinals, not Unix milliseconds.

Times canonical `HH:mm` length5, 00:00–23:59, minute precision only. No24:00, seconds, offsets, DST fold or timezone abbreviations. Slot ID canonical lowercase UUID v4 length36; caller supplies IDs, but they carry no authority. IDs unique within each slot set.

`CivilScheduleV1` exact keys:
```
{ version:1, kind:'CIVIL_RULE', startDate, endDate:null|date,
  maxOccurrences:null|positiveSafeInteger, rule, postsPerActiveDay, slots }
rule = {kind:'ONCE'}
     | {kind:'WEEKDAYS', weekdays:[1..7]}
     | {kind:'EVERY_N_DAYS', intervalDays:integer1..3652059}
slots = [{id:uuidV4, time:HH:mm}, ...]
```
End>=start, inclusive. WEEKDAYS is nonempty, strictly ascending, unique, <=7; no implicit sorting/drop of invalid entries. Start need not be selected weekday; first selected day on/after start is first active day. EVERY_N_DAYS is start+k*N, k>=0; never anchored to preview start, month start, last success or host today. ONCE means one ACTIVE DATE (start), containing its N explicit slots, not a forced one-slot rule. maxOccurrences can cut that one day part-way. Null end and null max are valid; all operations remain bounded by preview.

postsPerActiveDay integer1..1440, slots.length exactly N, no holes/accessors/extras; all slot times required and unique. The1440 ceiling follows the finite minute-of-day representation and duplicate-time prohibition; it is NOT approval to publish1440 posts/day, not a UI default, and not the unresolved product/capability maximum from P7-03. Later product admission may impose its independently reviewed smaller bound. This is an explicit draft decision requiring reviewer agreement, not asserted existing policy.

Stored slots order is stable editor order, not automatically reordered by time. Preview orders chronologically by date then minute-of-day; carries exact original slotId, never array index as identity. Equal times reject regardless IDs (not silently first-match). Reordering slots alone leaves occurrence identities and chronological output unchanged.

No default recurrence, weekday set, count, end, time, slot ID or maximum is generated. maxOccurrences1..Number.MAX_SAFE_INTEGER is a bound on ordinal planned slots; actual domain has <=3652059*1440 slots and all arithmetic stays exact safe integer. Dates/time/array/object limits are checked before iteration. Snapshot ignores no unknown keys and invokes no property getter/toJSON/valueOf/iterator.

## Fixed pure API and edit semantics

Exports:
```
snapshotCivilSchedule(value:unknown): CivilScheduleV1|null
editCivilSlots(current:unknown, edit:unknown): EditResult
previewCivilOccurrences(schedule:unknown, request:unknown): PreviewResult
```
All accepted inputs are copied descriptor-by-descriptor into new frozen plain records/arrays; outputs recursively frozen. Reject nonplain prototypes, symbols, accessors, sparse arrays, wrong exact keys, nonfinite/-0/noninteger numbers, duplicate IDs/times, excess lengths. No mutation of inputs or captured output through later input mutation. Proxies are not trusted authority; descriptor operations may throw and return INVALID_SCHEMA, never leak arbitrary errors or continue partial work.

Edit exact `{version:1, postsPerActiveDay, slots, discardSlotIds}`. It describes the complete replacement slot set, not a generic patch engine. `discardSlotIds` is unique UUID list <=1440, in previous slot-order, and must equal precisely the previous IDs absent from the replacement; thus a reduction/replacement cannot silently discard populated times. Surviving IDs retain exact old times (a time-change is separately expressed by replacing that ID and explicitly listing the discarded ID; no implicit rewrite). New IDs must be distinct from all previous IDs, have explicitly supplied times, and satisfy complete schedule validation. Reorder with unchangedIDs/times accepts and discard list empty. Increasing N requires all new explicit IDs/times; no invented evenly spaced/default times. `postsPerActiveDay` reduction preserves all surviving exact ID/time values and order from caller's explicit replacement. Unknown/duplicate/reordered/missing discard acknowledgement rejects. This acknowledgement is data-loss awareness for pure model editing, not UI/operator/device authority.

Edit result exact:
- `{ok:true,schedule:CivilScheduleV1,removedSlotIds:[...],addedSlotIds:[...]}`; arrays preserve old/new slot order respectively.
- `{ok:false,code}`; no partial schedule.

Closed edit codes: INVALID_SCHEMA, INVALID_DATE, INVALID_RULE, INVALID_BOUNDS, INVALID_SLOTS, DISCARD_REQUIRED, INVALID_DISCARD, RETAINED_SLOT_CHANGED. Validate current first, then edit shape, final slot validity, removal acknowledgement, retained-time preservation; first failure only. `snapshotCivilSchedule` deliberately returns null rather than publishing parser internals.

## Bounded preview and planned SLOT count

Request exact `{version:1,fromDate,throughDate,limit}`; inclusive from<=through, horizon at most366 civil dates, limit integer1..4096. No cursor/resume hidden state. A subsequent call supplies an explicit next window; it never resets the schedule anchor or occurrence count. Invalid range/limit rejects as INVALID_PREVIEW; malformed shape INVALID_SCHEMA. Both bounds are proposed source resource limits, not a calendar UI/performance claim.

Success exact:
```
{ok:true,kind:'CIVIL_INTENT',occurrences:[
 {date,time,slotId,plannedOrdinal}
], truncated:boolean, next:null|{date,time,slotId,plannedOrdinal}}
```
Failure exact `{ok:false,code}` with INVALID_SCHEMA / INVALID_DATE / INVALID_RULE / INVALID_BOUNDS / INVALID_SLOTS / INVALID_PREVIEW.

plannedOrdinal is 1-based across ALL valid chronological slots from the original start, including dates before the requested preview window; it is not a count of returned items. For N=3 and max=5, first active date contributes3 slots, next contributes2, no sixth slot and no third day. Both end and max independently filter; whichever terminates earlier prevails. End-date slots are included subject to max. A window after max/end returns empty, not a reset. ONCE outside window returns empty.

Compute active dates before window arithmetically (whole weeks+bounded remainder for weekdays; integer division for every-N), then visit at most366 dates and their <=1440 slots. It is forbidden to scan every date/slot from year0001 to a late preview start or materialize all lifetime occurrences. Chronological slot sort is over at most1440 copied entries, performed once. Produce at mostlimit+1 candidates: limit output plus the exact next eligible civil occurrence WITHIN THE SAME requested window. `truncated` iff that next exists; `next` is null iff not truncated. This does not claim the schedule has ended when the finite window is exhausted. No append/merge helper silently duplicates overlapping windows. `(date,slotId)` identifies a civil occurrence within this supplied rule only; no globally durable idempotency key, schedule revision or executable job ID is invented.

DST is intentionally unresolved: these are planned CIVIL slots before zone resolution, not proof every listed slot maps to an instant. Later accepted gap SKIP+notification consumes the original planned intent and never creates a substitute to fill max; overlap chooses earlier once. That future layer must preserve this ordinal and review its integration explicitly, not use this preview as UTC input by assumption.

No retry/success/failure/skip state is accepted by any API; therefore such state cannot extend max or generate a replacement. No async operation, timer, cancellation token or external callback exists: calls finish within structural bounds or reject. Cancellation at a later UI/service layer can discard a return value but cannot imply device/DB retirement here.

## Focused verification before any claimed source closure

- Date corpus: leap2000 vs1900/2100; all month boundaries, Dec31→Jan1; years0001/9999, invalid0000/10000, missing leadingzero, malformed dates, end<start.
- Once with1/multiple slots; weekdays Monday1/Sunday7, first selected date afterstart; every-N crossing month/year/leap with original anchor retained across windows.
- Inclusive end on active/inactive day, max1, maxN, maxN+1 and partial last active day; end earlier/later than max; late window preserves global plannedOrdinal; no replacement inputs permitted.
- N1/1440 schema boundary, N0/1441, mismatched arrays, invalid/null/duplicate times, duplicate/invalid IDs. Counts are model support, not throughput proof.
- Reorder keepsIDs/times and previeworder; increase requiresnewtimes; reduction rejects missing/unknown/duplicate discardIDs and preserves surviving values; failed edit returns no partial replacement; mutation after snapshot cannot alter outputs.
- Preview366/367days, limit1/4096/4097; exact-limit without extra =>truncatedfalse; oneextra =>truncatedtrue+exactnext; empty beyondend/max; date9999 boundary nooverflow; late-window work independent of elapsed centuries.
- Hostile getters/toJSON/valueOf/iterators not invoked; thrown descriptor traps refuse; symbol/extrakeys/nonplain/sparse/nonfinite inputs; recursively frozen output.
- Same fixtures run under differing host TZ environment settings but module must have no Date/Intl/clock usage/import, proving no host-zone dependency of civil arithmetic (not proving any timezone resolver).
- Source graph excludes main/preload/renderer/IPC/DB/actor/native calls; no application activation. Existing source tests/typecheck/format only after coherent source freeze; no hardware, Windows sleep, timezone-data, queue, migration or V9 evidence claimed.

## Decisions for exact review / stopping condition

Review proposed minute-only/year0001–9999 representation,1440 representational slots, bounded366-day/4096-item preview, and explicit full-set replacement/discard semantics. In particular canonical P7-03 says preserve/remove behavior is approved but does not specify a complete editor command protocol or product N maximum: this draft must not silently claim those details were already adopted. If reviewer requires a different explicit edit model, amend this contract before source entry, not add a generic scheduler layer.

The original plan-only stopping point has been satisfied by the exact independent review and coordinator source entry. Implement only the named pure source/test cluster on the recorded local branch; no remote publication or wider runtime entry follows. Useful source outcome after later authorization is a tested, reusable civil rule/slot preview model only. Full P7-01 persistence/migration, P7-02 IANA resolution, P7-03 V9 editor/capability bounds and P7-04+ remain separately open.
