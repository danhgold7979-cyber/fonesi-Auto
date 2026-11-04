# P7-04 resolved gap advisory — adopted finite source entry

**ADOPTED 2026-11-02 13:45 UTC.** Independent source-entry CLEAR binds exact draft SHA256 `ac789af253cbe1744a039f78a3befe97d8162f82f83abd9cf11869c939313ec8`. Named source implementation only; no credit from entry, cross-schedule policy or runtime activation.
Verified repository `danhgold7979-cyber/fonesi-Auto`, existing `phase-07`, local
`05a81562d16f5c348631796e785bc3dd37bac651`; no new branch. This proposal does
not change the fixed 47-cell ledger or current acceptance 0/13.

## 1. Canonical trace and explicit decision requested

[Canonical P7-04](PHASE-07-scheduler-queue.md) requires a non-mutating warning
below 30 minutes and explicitly leaves its midnight/timezone comparison scope
for approval before coding. [ADR-0003](../decisions/ADR-0003-schedule-gap-policy.md)
fixes 29 minutes warning / 30 minutes no warning, never rejection, hidden shifting,
cancellation or exemption from device/account exclusion. [C-18/C-19](../16_ACCEPTED_PRODUCT_DECISIONS.md)
fix planned-occurrence counting, no replacements and complete row overrides;
they do not specify civil-versus-elapsed gap distance or cross-schedule aggregation.
The existing civil and [admitted timezone resolver](P7-TIMEZONE-SOURCE-ENTRY.md)
are implemented; they do not yet emit this advisory.

**Proposed narrow comparison decision, not a claim of an existing decision:**
one invocation evaluates one schedule revision for one explicitly supplied
(deviceId, accountId) target context. It compares consecutive resolved planned
instants from that schedule in the requested preview window, including adjacent
local days. It does not merge schedules just because they share a phone or an
account, compare unrelated devices/accounts, or infer a global account principal
from an account ID. The target context labels the advisory and is not verified
identity, target authorization, or a lease. Cross-schedule resource collisions
remain P7-05/06/07. Parent/reviewer must adopt this exact scope, or specify a
separate cross-schedule requirement, before source entry.

Distance is **elapsed UTC milliseconds** from the admitted resolver, not local
clock-label subtraction. The warning threshold is exactly 1,800,000 ms; distance
0 through 1,799,999 warns and distance at least 1,800,000 does not. Local dates,
times, offsets and resolution reasons remain visible in returned rows. Spring
SKIPPED_GAP rows have no instant and are excluded only from distance comparison;
they remain returned notifications/counting facts. OVERLAP_EARLIER participates
once at the actual earlier instant. No implicit alternate fold or shifted gap.

## 2. Minimal source surface and actual reuse

Only new product leaf `desktop/src/schedule-gap-contract.ts` and new
`desktop/tests/schedule-gap-contract.test.mjs`; coordinator registers that exact
leaf/test in existing closed graph/inventory and refreshes build evidence. No
change to resolver admission, dependency pins, civil arithmetic, DB, jobs, main,
IPC, preload, UI, timers, queue, device actor or logging. No generic resolver
callback, caller UTC row, Temporal object, clock or source-selector parameter.

Export `evaluateScheduleGapPreview(schedule: unknown, request: unknown)`.
Request is exactly:

```
{version:1, scope:{scheduleId,scheduleRevision,deviceId,accountId},
 zone,fromDate,throughDate,limit}
```

All three IDs are canonical lowercase UUIDs with the repository's existing UUID
syntax; scheduleRevision is nonnegative safe integer, not -0. They are immutable
caller attribution only, not DB admission. Scope has exactly four data properties.
The outer record has exactly six data properties. Descriptor-safe ordinary
record snapshot rejects accessors, unexpected keys/prototype, symbols, hostile
proxies and unsafe values without coercion. Zone/window/limit use exactly the
existing resolver schema and limits (1970–2099 domain, at most 366 days,
limit 1..4096); do not widen or duplicate calendar logic.

After capturing scope, call **actual `resolveCivilPreview` once** with schedule
and a private request containing only version/zone/fromDate/throughDate/limit.
Propagate every existing fixed resolver failure code unchanged. Invalid outer
shape/scope yields INVALID_SCHEMA before resolver invocation. No raw exception
text, partial resolution success, replacement zone or fabricated UTC fallback.
No mutation of input, retained schedule, row order, planned ordinal or UTC.

Success is recursively frozen plain data:

```
{ok:true,version:1,kind:'SCHEDULE_GAP_ADVISORY',scope,
 window:{fromDate,throughDate,limit},
 thresholdMs:1800000,comparison:'CONSECUTIVE_RESOLVED_INSTANTS',
 preview:<exact successful ZonePreviewResult>,
 coverage:'COMPLETE_WINDOW'|'TRUNCATED_PREFIX',
 warnings:[{code:'BELOW_30_MINUTES',earlierPlannedOrdinal,
            laterPlannedOrdinal,gapMs}]}
```

After actual resolver success, the exact frozen `window` copies the validated
request bounds, including for empty
or truncated results; the underlying ZonePreviewResult does not retain these fields.

Failure is exactly `{ok:false,code:<INVALID_SCHEMA or existing ZoneCode>}`.
There is deliberately no accepted/saveAllowed/collisionFree/dispatchAllowed
field. A successful evaluation means the warning calculation was available,
not permission to save/run or proof that hard exclusions are satisfied.

## 3. Bounded comparison and incomplete-preview truth

Copy references to non-skipped rows from `preview.occurrences`, then sort a private
array by utcMs ascending, plannedOrdinal ascending as exact deterministic tie
breaker. Leave the original preview array unchanged. Compare adjacent pairs
only; this reports every short consecutive spacing, not every pair in a dense
cluster. At most 4096 admitted rows, 4095 warnings; no Cartesian product, merge
cursor, expanding horizon or unbounded retry. Duplicate instants retain both
planned identities and yield zero-distance warning; no coalescing/job creation.

The resolver's `next` remains untouched inside preview as a truncation witness;
it is NOT included as an extra compared row. `coverage` is COMPLETE_WINDOW iff
preview.truncated is false; otherwise TRUNCATED_PREFIX. Even COMPLETE_WINDOW
covers only returned rows within fromDate..throughDate, not unseen neighbors
before/after that window or the whole recurrence. No standalone all-clear boolean.
An empty warnings list on a truncated or gap-only result must never be presented
as globally safe spacing. A gap-skipped next row cannot establish the distance
to the next executable occurrence; do not scan beyond the user's limit silently.

Known warnings in an incomplete prefix remain useful; consumers must retain the
coverage/window qualification and request a deliberately chosen new preview to
inspect additional rows. This source slice has no consumer/UI and does not claim
that visible warning/incompleteness presentation is implemented.

## 4. Exact source verification after adoption

Use actual imported civil model plus admitted Temporal/runtime resolver, not
copied UTC calculations or a mocked successful resolver. Fixed expected fixtures:

- HCM same-day 29/30/31 minute boundaries; one/zero occurrence yields no pair.
- Adjacent local days 23:50→00:19 warns29, 23:50→00:20 no warning30; no same-day reset.
- New York spring 01:59→03:00 is elapsed1 minute although wall labels differ61;
  skipped02:15 stays SKIPPED_GAP and consumes ordinal, no replacement.
- New York autumn earlier01:45→02:00 is elapsed75 minutes, not wall-label15;
  overlap produces one selected instant. Lord Howe half-hour transition verifies
  no assumption that every transition is one hour.
- Repeated calls preserve exact scope and all source rows/times/ordinals; separate
  device/account/schedule contexts never combine or acquire authority. No identity
  lookup or dispatcher exists in this leaf.
- Dense slots and limit boundaries produce at most4095 warnings; truncated prefix
  no-warning remains explicitly incomplete, next is preserved/not compared;
  gap-only prefix, empty window and cross-day max/end truncation remain truthful.
- Frozen nested scope/preview/warnings; getter/toJSON/proxy/extra-key/UUID/revision
  refusal without invocation/coercion; inherited resolver malformed/unsupported
  zone/date/runtime failures preserved and no partial advisory substituted.
- Source import/effect inventory proves this leaf calls only resolver and has no
  persistence/queue/shift/cancel/lease/actor path. This cannot substitute for later
  actual lock composition or UI warning proof.

Only targeted source tests, normal type/format/closed-inventory checks and one
coordinator aggregate after coherent freeze. No new binary acquisition, app,
Windows packaged timezone test, live device/account or social effect.

## 5. Ledger and completion limits

Candidate scope is exactly existing **P7-04.A**, contingent on adopted comparison
scope, implemented source and actual reviewed tests. **P7-04.B remains unimplemented**:
no editor/preview display, warning-disable recovery or real save/drag/undo flow.
No credit is assigned by this document, and no denominator/status changes here.
P7-04 whole-task acceptance remains unmet. P7-01/02/03 existing credit is not
recounted. Complete row overrides are not implemented by a second path here:
future P7-11 must feed its single admitted occurrence path into a separately
reviewed integration rather than generating both row and profile occurrences.

Software-first/parallel amendments permit this independent pure leaf despite
missing hardware/full predecessor acceptance. They do not permit activation or
pretend advisory tests establish mutual exclusion. Rollback is removal/disable
of this unwired evaluator with an honest unavailable status in any future
consumer, never rewriting/cancelling existing schedule or job facts.
