# P1-07 — Nonsecret settings and recovery contract (APPROVED SOURCE CONTRACT)

## Status and dependency disposition

Originally planning-only at 11:45 UTC; coordinator approved source entry at
11:55 UTC after independent review (exact record below). P1-05 is TECHNICAL_PASS; P1-06's actual
cross-user criterion is UNMET (`TOKEN_UNAVAILABLE`), not waived or accepted.
A proposed development-only parallel entry is possible because these preferences
contain no credential/reference/provider operation. It is explicitly approved by the entry record below;
formal dependency/Phase 0 gates remain pending. Counts stay six technical/formal zero.
Do not bypass existing vault initialization, owner lease or safeStorage checks.

Canonical scope: [Phase 1 P1-07](PHASE-01-desktop-foundation.md#p1-07--app-settings-theme-persistence-and-crash-recovery).
No device/stream policy, account, job, scheduler, auto-start or secret settings.
Full V9 layout is P1-08, not replaced by a new settings UI or claimed here.

## Exact reference-derived preferences

Use the [complete V9 reference](../../ui-reference/Fonesi-Auto-V9-UI-Reference.html)
as requirements, not imported application logic. Relevant exact observations:

| Preference | Initial/default meaning | Supported range/source |
|---|---|---|
| `theme` | `LIGHT` | Only `LIGHT` / `DARK`; reference state/default at lines 387–388, toggle at 1089–1098. No SYSTEM theme. |
| `dockWidth` | `null` means unmodified responsive V9 CSS | CSS defaults 510px, 400px at <=1500 viewport, 350px at <=1120 (lines 1/5). User drag clamp is max(300,min(viewportWidth-510,requested)) at line 741; reset explicitly requests 510 at line 787. |
| `tileWidth` | 150 CSS pixels | Reference monitorSize 150 (line 387), zoom/fit clamped to 70–520 (lines 733/747). Integer values; fit can produce odd integers, so do not impose an even-only rule. |

Persist dock *requested* integer width or null; derive effective width with the
reference clamp for the current owned viewport. Do not overwrite the requested
value when viewport changes. Below the reference responsive breakpoint, apply the
reference layout rather than inventing a new permanent dock. Proposed defensive
stored-width ceiling 16384 is a serialization/window safety bound, not a claimed
product display limit. The reviewer/coordinator must approve this bound before code.
Sidebar widths, active devices, focus, selected jobs, monitor sync, workflows,
filters and demo fixture state are NOT preferences in this task.

Native window state is main-owned: `normalBounds:null|{x,y,width,height}` and
`maximized:boolean`. Initial null/false means use the existing application's
normal creation policy, not a new V9 design or invented saved preference. Only
browser-derived getNormalBounds/isMaximized observations may set it; renderer
messages cannot submit coordinates or monitor identifiers. Proposed safety bounds:
x/y signed 32-bit integers; width/height integers 1..16384. These admit observed
native resizing rather than inventing a minimum V9 window size. Main
intersects/restores against current display work areas, falling back to the current
normal creation policy when no usable overlap exists; a missing monitor is not an
application crash. Do not persist fullscreen/minimized state or replay actions.

## Persistence and revision semantics (proposed implementation choice)

Prefer the existing owned SQLite transaction/backup implementation over another
independent JSON journal. Add one reviewed migration after current schema 2,
containing only `app_settings_revision`: exact `slot` CURRENT/PREVIOUS, nonnegative
safe revision, exact theme, nullable dock width, tile width, nullable complete native
normal-bounds tuple, maximized flag. CURRENT exists exactly once; PREVIOUS exists
only after a committed change and has a lower revision. Fresh migration creates
revision 0 with the defaults above. No free-form JSON/paths/secrets/caller metadata.
Exact DDL below, row validation/fingerprint and its implementation migration digest
must be reviewed before execution. All existing schema 0/1/2 migrations and historical evidence remain
unchanged; current schema/version bounds advance explicitly, not by accepting any
unknown table or version. Pre-migration encrypted backup is mandatory, including
schema-2 -> schema-3. A restore of an old database still obeys quarantine/no dispatch.


Proposed exact third migration (all identifiers literal, no renderer SQL):

```sql
CREATE TABLE app_settings_revision (
  slot TEXT PRIMARY KEY CHECK(slot IN ('CURRENT','PREVIOUS')),
  revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
  theme TEXT NOT NULL CHECK(theme IN ('LIGHT','DARK')),
  dock_width INTEGER CHECK(dock_width IS NULL OR dock_width BETWEEN 300 AND 16384),
  tile_width INTEGER NOT NULL CHECK(tile_width BETWEEN 70 AND 520),
  window_x INTEGER,
  window_y INTEGER,
  window_width INTEGER,
  window_height INTEGER,
  maximized INTEGER NOT NULL CHECK(maximized IN (0,1)),
  CHECK((window_x IS NULL AND window_y IS NULL AND window_width IS NULL AND window_height IS NULL)
    OR (window_x IS NOT NULL AND window_y IS NOT NULL AND window_width IS NOT NULL AND window_height IS NOT NULL
      AND window_x BETWEEN -2147483648 AND 2147483647
      AND window_y BETWEEN -2147483648 AND 2147483647
      AND window_width BETWEEN 1 AND 16384 AND window_height BETWEEN 1 AND 16384))
) STRICT;
INSERT INTO app_settings_revision VALUES('CURRENT',0,'LIGHT',NULL,150,NULL,NULL,NULL,NULL,0);
```

Runtime row validation additionally requires exactly CURRENT and optionally PREVIOUS,
PREVIOUS.revision < CURRENT.revision, exact scalar types and fields, and no unknown
objects. The transaction deletes old PREVIOUS, copies complete CURRENT into PREVIOUS,
and replaces CURRENT at expected revision+1. This table is nonsecret; no secretRef or
vault write is introduced. Expanding the existing exact schema union/version bounds
must preserve historical 0/1/2 validation and cannot become a generic table allowance.

One main-owned serialized settings lane; no queued retry. Snapshot/validate inputs,
check expectedRevision and current owner/session, flush required audit intent,
`BEGIN IMMEDIATE`, re-read and compare current revision before any write, copy CURRENT to PREVIOUS and write revision+1 atomically, commit. An unchanged
value returns UNCHANGED without increment. Revision exhaustion fails closed. A stale
expectedRevision returns CONFLICT and no write; caller chooses a fresh explicit read.
A native window-state save shares this same lane/revision (so concurrent UI edits
cannot silently overwrite it). Updates touch only their exact allowed fields.
While busy, native move/resize/maximize observations replace one bounded latest
snapshot slot (not an unbounded queue); the next admitted native save rereads the
current row and merges only main-owned geometry. Debounce at 250ms, at most one
pending timer/snapshot. Renderer mutations are never automatically retried.
Before orderly shutdown, stop accepting view mutations, cancel the debounce timer,
reread the actual window's normal bounds/maximized state before destruction, settle
the current operation, commit the latest native snapshot through the same lane,
then close persistence. This native-only operation uses an unforgeable internal
window capability tied to the owned BrowserWindow and retained root lease, not a
renderer ACTIVE-view capability. Main settings state is RUNNING -> DRAINING -> CLOSED:
DRAINING denies every new renderer operation, but admits the one captured final
native snapshot before CLOSED. Navigation or renderer revocation cannot prevent
main from saving its own genuine window geometry; no caller-supplied native fields
are merged. The final lease/admission check remains mandatory. A shutdown deadline retains uncertainty rather than claiming
that pending writes were cancelled. This saves local preferences, not replay of
external actions. A failed final save is visible and prior committed state retained.

Crash before COMMIT retains prior CURRENT; crash after COMMIT yields the new entire
CURRENT plus prior PREVIOUS. No partial mixture. Startup validates exact schema/rows;
invalid current state is RECOVERY_REQUIRED, never silently reset or import a candidate.
A user-confirmed restore of valid PREVIOUS from an otherwise fully valid database
is a new revision, not a revision rollback.
The existing main-owned native confirmation defaults Cancel and must recheck owner,
view-session and expectedRevision after its await. Cancel writes nothing. No raw
SQL/file path crosses IPC. Do not bypass the existing exact database validator to salvage one row from a
corrupt database. If CURRENT or PREVIOUS is malformed (including an untrustworthy
revision), normal open/writes remain blocked; preserve the original database and
report RECOVERY_REQUIRED. The available recovery route is the existing explicitly
confirmed P1-05 authenticated backup restore to a NEW quarantined root, not an
in-place settings overwrite or fabricated revision. It does not overwrite the old
database/vault and does not imply recovered external secrets. Thus interrupted
transaction recovery is automatic old-or-new SQLite state; unrelated corruption
is truthful maintenance/recovery, not automatic previous-row repair.
Settings are included in subsequent existing database backups, unlike external vault
revisions. Existing restore/backup acceptance tests must cover the schema extension.

## Explicit ADR-0006 mutation amendment (approved 11:55 UTC)

Keep legacy v1/v2 public read wire snapshots unchanged, including their historical
NOT_PERSISTED diagnostic meaning. Add a separately versioned private channel
`foundation:preferences:v1`; do not silently mutate the old settings.get semantics.
Preload may expose only frozen `preferences.read()` and
`preferences.update(expectedRevision, patch)` wrappers plus
`preferences.reset(expectedRevision)` and `preferences.restorePrevious(expectedRevision)`
(both require main-owned native confirmation). No generic
invoke/channel/events, paths, arbitrary object merge or vault APIs.

JSON-string request <=1024 UTF-8 bytes, exact duplicate-aware records. Common keys:
`version:1`, `requestId` 1–32 ASCII alphanumeric/_/-, `method` from `preferences.get`, `preferences.update`, `preferences.reset`,
`preferences.restorePrevious`.
Read has no other fields. Update adds nonnegative safe `expectedRevision` and exact
nonempty `patch` containing only theme/dockWidth/tileWidth (at most three keys).
Reset/restorePrevious add only expectedRevision. Reset restores UI defaults without
changing native geometry; restorePrevious copies the prior complete settings snapshot
into a new revision. Both operate only on this table, never reset database or secrets.
This selects the canonical user-approved reset/recovery path; arbitrary file import
is not exposed. A future import needs its own bounded schema/ownership review.
Native window bounds are not accepted on this channel. Fixed error codes: INVALID_TRANSPORT, PAYLOAD_TOO_LARGE, INVALID_JSON,
INVALID_SHAPE, UNSUPPORTED_VERSION, UNKNOWN_METHOD, UNTRUSTED_SENDER, SESSION_UNAVAILABLE,
SESSION_REVOKED, BUSY, CONFLICT, CANCELLED, RECOVERY_REQUIRED, WRITE_FAILED,
OUTCOME_UNKNOWN, TIMEOUT, INTERNAL_FAILURE. Invalid inputs never echo values.

Responses are canonical duplicate-rejected JSON <=2048 UTF-8 bytes. Exact field
ordering/variants:

- Success `{version:1,ok:true,requestId,outcome,settings,auditHealth}`.
  outcome is OBSERVED for get, UNCHANGED for no-op/correctly identical update,
  COMMITTED for a new revision. settings is exactly
  `{revision,theme,dockWidth,tileWidth,persistence:'PERSISTED'}` with the scalar bounds
  above. auditHealth is AVAILABLE/DEGRADED. Echo only a syntax-validated requestId;
  do not log it. No coordinates, native monitor identity or secret fields.
- Error `{version:1,ok:false,code,diagnosticId,auditHealth}`. Codes are the fixed
  list above, diagnosticId a validated main UUID when one is available, otherwise
  null; no caller data or arbitrary exception. Preload-local BUSY/TIMEOUT,
  INVALID_SHAPE (wrapper input) or INTERNAL_FAILURE (transport/invalid response)
  retain that fixed code with diagnosticId:null and auditHealth:DEGRADED; preload
  never fabricates a main UUID. Null does not identify which process originated an
  error. Separately, an actual main UUID allocation failure returns
  INTERNAL_FAILURE/null/DEGRADED before starting any mutation. A cancelled reset
  returns CANCELLED with no write.

The old settings.get remains an explicitly legacy diagnostic snapshot, not the
current preference source; the new renderer must not present its NOT_PERSISTED
constant as live application state. New UI reads the new channel. Existing v1/v2
fixtures and channel behavior remain unchanged for compatibility.

Add a compatible P1-04 schema-3 audit variant (schemas1/2 unchanged): existing fixed
run/sequence/time/severity fields, component MAIN, task P1-07, event SETTINGS_OPERATION,
operation READ/UPDATE/RESET/RESTORE/WINDOW, phase INTENT/RESULT, main diagnostic UUID,
nullable safe expectedRevision and resultingRevision, fixed OK or settings error code.
No theme values, coordinates, caller request IDs, paths or arbitrary metadata in audit.
Read may return public state with DEGRADED audit health; mutation/reset/restore/window
save require accepted and flushed INTENT before BEGIN and final admission/COMMIT.
A RESULT audit failure after COMMIT returns COMMITTED plus DEGRADED, never a false
retryable write failure. Uncertain commit returns OUTCOME_UNKNOWN and blocks new
writes pending read-only validation. Test real logger failure composition.

Reuse main-owned view-session admission: exact owned sender, nonnull main frame,
browser origin and canonical app URL, ACTIVE generation, method/payload validation.
Renderer remains untrusted; this grant permits bounded nonsecret UI preferences,
not proof of genuine human intent or immutable Document identity. No rearm/replay.
For renderer-originated mutations, check admission before work and synchronously
at actual transaction COMMIT dispatch
following every await. Observed navigation/crash/closure revokes future commits.
Already-dispatched COMMIT cannot be undone by late revocation/timeout; retain its
result internally, discard stale renderer reply and require fresh explicit read in
a fresh admitted view. Unknown commit outcome blocks retries until validation.
One shared preload cap of 8 unresolved native promises covers existing public
v1/v2 and the new preferences channel together, not 8 per method/channel. Read while
a mutation or native confirmation holds the settings lane returns BUSY; it never
observes uncommitted data or waits in a queue. A 2-second caller deadline causes late
discard, no retry; timed-out promises keep their slots until settlement. Main lane admits one
mutation/reset at a time; no unbounded queue. Timer expiry does not cancel SQLite I/O
or release root ownership. A native confirmation may outlast that renderer deadline:
TIMEOUT means outcome not yet known, NOT cancellation. The still-open native dialog
remains explicit; Cancel means no commit, while a later Confirm may commit only if
owner/session/expectedRevision still pass at dispatch. UI must show pending/unknown
rather than success or automatic retry, and a later explicit fresh read reconciles
state. Navigation/closure revokes admission even while confirmation is pending.
Shutdown awaits this lane before persistence close. Native confirmations do not
prove arbitrary renderer request legitimacy; they are an extra gate for the bounded
reset/rollback methods, not an expansion to other effects.

## Evidence required before task-specific acceptance

- Exact schema/default/reference constraints, duplicate/extra/size/nonfinite/range
  negatives, CAS conflicts and simultaneous window/UI edits; no input/path echo.
- Owned SQLite migration with authenticated backup; actual commit-boundary crash
  controls and reopen proving old-or-new whole state and prior revision retention.
- Real compiled main/preload/renderer channel: allowed read/theme update, wrong
  sender/subframe, malformed/stale/revoked requests, timeout/late reply and no replay.
- Native reset cancellation and confirmed default restore with revision recheck;
  no database/vault content overwritten; reset/restorePrevious rejects extra fields.
- Actual Windows normal close/relaunch for theme and native window preferences,
  original profile ownership/secret guards retained; startup launches no external work.
- Same-viewport LIGHT/DARK screenshots and behavior controls in the current UI slice;
  they prove theme persistence, not full V9 parity (P1-08). The eventual V9 integration
  consumes the same settings contract and preserves exact reference layout/CSS.
- Audit fields fixed to operation/outcome/revision/diagnostic ID, no caller arbitrary
  metadata. Failure reports distinguish committed state from logging degradation.

This candidate leaves source entry and approval of the exact wire/audit shapes,
DDL and safety bounds above to independent review/coordinator approval. It does not accept P1-06 or waive
its cross-user negative. Settings implementation is authorized only by the bounded entry record below.

## Proposed scoped CI while cross-user evidence is blocked

Do not repeat unchanged LocalService token acquisition on every P1-07 push. Preserve
run `41198112252` and its explicit TOKEN_UNAVAILABLE/UNMET disposition; no cache is
reported as a new identity proof and no missing field becomes PASS. Proposed workflow
split, requiring coordinator approval with implementation: keep automatic strict
source/type/lint/unit/owned-boundary checks; run a separately named P1-07 native
settings/backup/recovery job whose fixed artifact declares its scope and the excluded
P1-06 cross-user criterion as UNMET_NOT_RERUN. The existing full identity matrix is
manual/explicitly approved only while that environment prerequisite is unresolved.
Do not turn its strict aggregate predicate green by omitting context or substituting
same-user/wrong-key checks. A passing independent P1-07 job is not full Phase 1 PASS.

Reuse the reviewed owned supervisor/provenance/deadlines/cleanup and production
provision -> orderly retirement -> original-backup authentication path. Any native
UI answer injection/quit-after-check instrumentation remains exact/hash-bound and
honestly labeled, not genuine widget-click evidence. Settings crash tests use actual
owned process termination at the real settings transaction boundary, not injected
return values. Schema-3 migration/backup/restore regressions remain required; do not
skip them merely because P1-06 foreign-context acquisition is unavailable. The exact
workflow split and instrumentation source must be independently reviewed before run.

## Source-entry approval — 2026-10-31 11:55 UTC

Coordinator approved the exact independently CLEAR candidate SHA256
`00f9f35412587950118d4b1f6bc63d3ba04b9e9e6863b1728d7acf1c19c1dbb2`
for development-only parallel implementation. This explicitly authorizes the bounded
ADR-0006 preferences mutation amendment, exact migration 3, safety bounds, compatible
audit extension and proposed scoped CI strategy above. P1-06 cross-user UNMET and
all formal dependency/Phase 0 gates remain; no predecessor acceptance is inferred.
Exact implementation/native workflow review is required before hosted execution.
No new credential/identity/device/service authority or V9 redesign is granted.

### Coordinator-approved hydration clarification — 2026-10-31 12:15 UTC

A private fixed `foundation:preferences:ready` notification is sent by main only after
controlled initial load and existing view-session arming. Preload registers before load,
consumes once, and exposes no listener or fifth method. Only preferences READ may await
this readiness under its existing shared eight-slot/two-second bound. Timeout/pagehide
cancels that wait; a late/duplicate notification cannot invoke a cancelled read or replay
work. Mutations never wait on this signal. Main admission still independently decides
all requests, and the signal never arms a session. The renderer performs one startup
READ, no automatic mutation/retry, so persisted theme/layout hydrate on relaunch.
Viewport resize recomputes effective dock layout without changing stored preferences.
This narrowly supersedes the earlier diagnostic-only no-automatic-read convention.
Settings shutdown reuses the existing 120-second non-cancelling lifecycle deadline;
expiry is nonzero/uncertain and retains the owner lease rather than closing a possibly
active database or claiming cancellation.

### First hosted execution entry — 2026-10-31 12:25 UTC

After independent402/109/119 and source/envelope/workflow CLEAR, coordinator
approved the first bounded exact-head scoped settings execution. No identity
invocation is included. Fixed wrapper answers are not genuine widget clicks;
four exact screenshots require complete metadata binding. Actual hosted outcomes
and P1-07 technical acceptance remain pending, with P1-06 cross-user UNMET and
formal dependencies unchanged.

### Startup geometry ordering clarification — 2026-10-31 12:28 UTC

Coordinator approved suppressing startup restore/show geometry notifications until
the first successful, still-admitted preferences GET snapshot completes. This
private main callback adds no IPC or request queue. Failed hydration leaves ordinary
observation disabled until an explicit successful read; final-close capture remains
unconditional. Thus initial maximization cannot make the one-shot hydration read
race a native autosave. The native fixture now verifies a maximized reopen, and its
read-only observation helper may poll only exact validated BUSY within five seconds;
mutation/confirmation/unknown outcomes are never retried.
