# P1-04 structured logging, correlation and retention contract

**Initial proposal 2026-10-31 05:58 UTC; scoped implementation approved 06:07 UTC.**
Entry recorded before code under the delegated development exception, after
independent design CLEAR and P1-11 technical closure. Formal Phase 0/predecessor
acceptance remains pending. This is not task/Phase acceptance.
Canonical task is P1-04, not a separate lab or permanent reduced product feature.
Existing P1-02 public services remain read-only; no logging method is exposed to
renderer. No V9 redesign, device action, effect journal or new dependency proposed.

## 1. Requirement and existing-evidence trace

[Phase 1 P1-04](PHASE-01-desktop-foundation.md) requires UTC/severity/correlation/task
events, safe errors, ordered rotation, 30-day technical retention with unresolved
evidence protected, main/preload correlation, canary scans and Windows path/write
failure tests. [Master P1-04](../04_MASTER_IMPLEMENTATION_PLAN.md),
[AC-01 and F-24](../05_ACCEPTANCE_AND_RISKS.md), and
[C-13/C-21](../16_ACCEPTED_PRODUCT_DECISIONS.md) govern this scope. Retention behavior
is settled; storage mechanics below are proposed choices. [Data §2.7](../03_DATA_AND_WORKFLOWS.md)
forbids orphaning UNKNOWN reconciliation/idempotency information through cleanup.

`desktop/src/main.ts` has fixed BOOTSTRAP_* console markers only;
`main/profile-owner.ts` creates logs/crashes directories but no logger. Bridge and
preload return fixed safe errors. Verification Python/PowerShell sanitizers protect
published evidence, not application logging. Foundation identifier validation is
not log sanitization. [ADR-0006](../decisions/ADR-0006-foundation-ipc-admission.md)
forbids logging arbitrary caller request IDs and fixes the current wire grammar.

## 2. Decision A — explicit compatible public-read protocol v2

Keep `foundation:request:v1` and its exact request/response contract, tests and byte
bounds unchanged. Add reviewed `foundation:request:v2`, with the same two methods
health.get/settings.get, same three-field request shape and limits except version 2.
No log.write/read/export/hold operation and no renderer-selected metadata exists.
The existing preload wrappers keep the same two method names and use v2 internally;
do not silently try v1 after failure. Old v1 behavior remains explicitly testable.
Unknown versions/channels fail as specified, not automatic negotiation.

V2 success fields, exact order: `{version:2, ok:true, requestId, diagnosticId,
logging, result}`. V2 error: `{version:2, ok:false, diagnosticId, logging, code}`.
Results and existing error codes retain ADR-0006 meanings. `diagnosticId` is a
main-generated lowercase UUID string; it is unrelated to requestId, payload, URL,
device, username or path. `logging` is AVAILABLE or DEGRADED. Retain 1,024-byte
response ceiling; no stack/message/details field. The deterministic rules are:

| Source/condition | diagnosticId | logging | code/result |
|---|---|---|---|
| Main rejects sender, session or admission capacity before admission | null | current sink health | Existing UNTRUSTED_SENDER / SESSION_UNAVAILABLE / SESSION_REVOKED / BUSY |
| Admitted request, including parse/version/method failure | fresh main UUID | current sink health | Exact existing error code or success result |
| Main UUID creation fails | null | DEGRADED | INTERNAL_FAILURE; no request content logged |
| Admission later revoked | already allocated UUID | current sink health | SESSION_REVOKED |
| Preload-local timeout/busy/disposal/transport or invalid native response | null | DEGRADED (conservative unknown, not assertion of main disk failure) | Existing fixed local error |

V1 and v2 share the same owned ViewSession, generation, eight-admission budget,
revocation and disposal. Adding a channel cannot double caller authority/budgets.
Preload uses one existing eight-unsettled-request budget across supported versions.
No native response or wrapper result has an origin field; wrappers retain Promise<string> JSON representation, with no new wrapper model.
Main allocates UUID only after admission, before parsing. No reflected caller value
can become diagnosticId. A local DEGRADED result is rendered as diagnostics status
unavailable, not falsely described as an observed main write failure.

Main logs request outcome against this ID; preload preserves it only after full v2
response validation. Fixed safe error rendering includes the code and validated
diagnostic reference, never raw exception text. Main-owned diagnostic IDs are not
authority, proof of persistence or a secret-detection scheme. Caller requestId is
used only for existing wire matching, never written to logs.

Preload-local TIMEOUT/BUSY/transport/malformed-response/disposal errors use
`diagnosticId:null`, not an invented main ID. All null diagnostic IDs render the fixed text `diagnostic reference unavailable`.
Null may mean a local failure, main admission denial or failed main ID allocation;
it does not establish origin. No LOCAL field or hidden display metadata is required.
A response-received failure with a validated nonnull main diagnostic ID correlates
across main/preload by that ID;
a timeout before a response cannot truthfully claim that correlation. Existing late
response suppression remains; do not expose a late diagnostic ID or retry. Tests
must distinguish these cases. This is honest observability, not a new human-intent
or immutable-Document guarantee.

`logging` reports sink health at response construction, not a durable receipt for
this request's asynchronously queued event. AVAILABLE means the sink is accepting
records with no known failure; it does not claim fsync or crash survival. Explicit
writer results distinguish QUEUED, WRITTEN, FLUSHED, DROPPED and FAILED internally.

## 3. Decision B — fixed event vocabulary and conservative redaction

Use standard modules only. Pure event encoder plus main-only sink, not a generic
logging framework. Exact event record fields:

`{schemaVersion:1, runId, sequence, utc, severity, component, task, event,
diagnosticId, code}`.

- runId: main-generated UUID per process; sequence: positive safe integer increasing
  per run, never wraps. utc: main-generated ISO UTC timestamp with milliseconds.
- severity: INFO/WARN/ERROR; component: MAIN/PRELOAD_BOUNDARY/LOGGING;
  task: fixed P1-04; diagnosticId: main UUID or null for lifecycle/logging events.
- event: STARTUP_READY, STARTUP_FAILED, SHUTDOWN, BRIDGE_RESULT,
  RENDERER_LOST, LOGGING_DEGRADED, LOGGING_RECOVERED, RETENTION_RESULT.
- code: exact fixed allowlist comprising current public error codes plus OK,
  STARTUP_FAILURE, RENDERER_LOSS, WRITE_FAILED, FLUSH_FAILED, QUEUE_FULL,
  RETENTION_FAILED, HOLDS_UNAVAILABLE, CLOCK_REGRESSION, RECOVERED.
  Event/code combinations are explicitly validated by the following table.

| event | allowed code | severity | diagnosticId |
|---|---|---|---|
| STARTUP_READY | OK | INFO | null |
| STARTUP_FAILED | STARTUP_FAILURE | ERROR | null |
| SHUTDOWN | OK / FLUSH_FAILED | INFO for OK; ERROR otherwise | null |
| BRIDGE_RESULT | OK / any fixed ADR-0006 public error code | INFO for OK; ERROR for INTERNAL_FAILURE; WARN otherwise | UUID after admission; null only for pre-admission denial/UUID-generation failure |
| RENDERER_LOST | RENDERER_LOSS | ERROR | null |
| LOGGING_DEGRADED | WRITE_FAILED / FLUSH_FAILED / QUEUE_FULL / RETENTION_FAILED / HOLDS_UNAVAILABLE / CLOCK_REGRESSION | WARN for CLOCK_REGRESSION; ERROR otherwise | null |
| LOGGING_RECOVERED | RECOVERED | INFO | null |
| RETENTION_RESULT | OK / RETENTION_FAILED / HOLDS_UNAVAILABLE / CLOCK_REGRESSION | INFO for OK; WARN otherwise | null |

Reject every other tuple. Pre-admission rejection summaries are bounded/coalesced;
never allocate one unbounded persistent event per hostile IPC message. No logging
recursion on encoder/sink failure; fixed console/health status is the fallback.

No freeform metadata, raw IPC, caller IDs, exception/cause objects, stacks, URLs,
paths, secret references, account names, serials or native error messages. Convert
exceptions to a fixed code at known call sites without enumerating or serializing
them. This is redaction by exclusion, not a claim that regex detects every secret.
Future task/components require reviewed vocabulary extension, not arbitrary fields.
Pure encoder rejects extra fields/accessors and wrong types; it receives trusted
constructed records, not a hostile-JavaScript sandbox. Log only canonical encoding.

UTC may go backwards with the OS clock. Preserve observed UTC and strictly increasing
run sequence; emit one fixed CLOCK_REGRESSION warning when detected. Do not falsify
wall time to manufacture monotonic UTC. Cross-run order is not inferred solely from
UUIDs; segment manifests record run/sequence endpoints. No host-clock accuracy claim.

## 4. Decision C — reusable owned log root, separate from disposable profiles

Keep existing fresh profile ownership contract unchanged. A trusted launcher supplies
separate absolute `FONESI_LOG_ROOT`; no renderer/IPC path input. Development/Windows
tests create it under their exact owned workspace. The eventual installed default
location remains a Phase 11 packaging choice; this logger supports safe reopen now.

Create only a missing leaf within an explicitly validated existing owned parent;
or reopen a directory with the exact application log-owner marker. Reject unowned,
relative, symlink/reparse, unexpected entries and identity/path mismatches. Existing
nonempty unowned directories are never adopted or cleaned. Marker records fixed
format version and generated store UUID, no user data. Reopen validates marker and
recognized segment/manifest/hold filenames before appending. App logs use this root;
native crash output retains its separate existing owned path and is not silently
advertised as sanitized application events.

### Exclusive store lifetime

Acquire an exclusive `.writer-lock` directory with atomic mkdir before reading or
changing store metadata, segments or holds. It contains only this run's generated
owner token/PID for diagnosis; PID/age alone never proves safe takeover. The lock
covers validation, reopening, writes, rotation, hold changes and pruning across
both channels/windows and multiple app processes. A second or uncertain owner gets
DEGRADED and performs no store writes/pruning; it may still serve public reads.
No recursive lock deletion or age-based stealing. Normal release occurs only after
all writer/hold/prune work settles and owned token is verified. Test two concurrent
processes against the same owned test store; exactly one may mutate it.

Crash leaves a stale lock and unfinished marker. On later launch do not guess that
it is abandoned: report fixed LOGGING_DEGRADED/recovery-required status. Recovery is
an explicit trusted maintenance operation only after all possible owners are known
stopped (test supervisor can prove its owned process tree exited); preserve segments
and holds, validate/reconcile metadata, then remove only the verified lock. No
renderer path or automatic PID/timeout heuristic. A production stopped-owner recovery
UX must be integrated with P1-08; the trusted lifecycle/recovery procedure and its
synthetic process-crash test are required in P1-04, not permanently unsupported.

Supported recovery action (not a mere future promise): provide an offline,
main-maintenance-only recovery entry/script using existing standard tools, taking
an exact owned log-root path, expected store UUID and expected stale owner token.
It is not exposed through renderer IPC. Preconditions: normal launcher is stopped
and new launches excluded for the maintenance interval; all processes that could
own this store have exited. An owned launcher/test supervisor may establish this
from termination of its entire owned process tree; otherwise the operator explicitly
closes all app instances and confirms the maintenance precondition. PID absence,
age, guessed executable name or token possession alone is insufficient proof.

Recovery verifies those exact ownership values, preserves all existing segments and
hold data, quarantines every pre-recovery segment from automated pruning, and records
an owned recovery receipt before removing only the stale lock/unfinished marker.
It does not reset holds to empty, delete old evidence or claim uncertain writes were
persisted. Invalid ownership/metadata fails closed without alteration. The next normal
launch can acquire a fresh lock and write new segments, so an ordinary crash does
not cause permanent logging unavailability. Pre-recovery segments remain protected
until a separately reviewed reconciliation/release procedure; P1-04 supports resumed
logging and truthful retained-evidence status, not automatic unsafe cleanup. Tests
must execute crash → prove owned-tree exit → offline recovery → reopen/write,
including failed recovery and wrong-token cases. The later P1-08 task presents this
same usable recovery action within V9; it does not replace a missing P1-04 mechanism.

Use exclusive creation for new segments; retain open handles for appends. Recheck
ownership and candidate entry type before cleanup; no recursive traversal/deletion.
Reject unknown or ambiguous entries rather than repairing/deleting them. Standard
filesystem checks do not defend against an arbitrary same-user process racing path
replacement; document that threat boundary rather than claim atomic path containment.
Unexpected reparse/ownership state fails closed for writes/pruning and visibly degrades.

## 5. Decision D — bounded writer, rotation and 30-day retention

Proposed engineering limits: maximum encoded record 2,048 UTF-8 bytes including
newline; queue 256 records; each drain batch at most 16; one serialized async writer;
segment rotates before exceeding 1 MiB or when UTC calendar date changes. These are
implementation resource limits, not device/fleet/product capacity promises. No new
package is required: node:fs/promises, node:path and node:crypto in main-only modules.

Rotate to a new exclusive generated segment name; never overwrite old logs. Sequence
is assigned before enqueue; gaps truthfully indicate discarded records, not fake
continuous persistence. Queue overflow sets DEGRADED and reports QUEUE_FULL without
recursively attempting to log every failed log. Retain at most one pending fixed
degradation/recovery summary. No unbounded retry loop; retry on next explicit sink
reopen/startup, not an automatic background disk-fill loop. Flush on orderly shutdown
with reviewed 5-second deadline; deadline expiration reports FLUSH_FAILED and does
not claim persistence or prevent process cleanup indefinitely.

Use a validated per-segment metadata record with format version, segment ID, store
ID, run ID, first/last sequence, maximum observed event UTC and finalized flag.
Finalize only after queued writes and file sync succeed and the segment handle is
closed successfully. Never append a finalized segment on reopen; start a new segment.
Metadata uses owned temp/exclusive-write, file sync, close and rename; rename alone
is not a durability proof. A crash may leave an incomplete
segment/metadata pair. Such entries are retained and flagged, never deleted because
mtime looks old. No full recovery of arbitrary corrupt log content is promised.

Retention cutoff is UTC `now - 30 * 24 hours`. Prune only finalized recognized
segments whose validated maximum event UTC is strictly older than cutoff, not
currently open and not held. Equality is retained until older. Do not use filesystem
mtime as evidence age. On clock regression relative to the stored successful
retention-check UTC, defer pruning and report CLOCK_REGRESSION; a forward clock jump
cannot be distinguished from real elapsed time, so record this wall-clock limitation.
No automatic deletion of younger logs merely to meet a disk cap. Disk pressure
instead causes visible DEGRADED state. No change to C-13's 30 days.

Check retention at startup after validation and at daily UTC rotation. Bounded scan:
at most 4,096 root entries and 64 KiB per metadata/hold file; over-limit or unreadable
state suppresses cleanup and reports RETENTION_FAILED. This is a conservative
development operating envelope, not a hard maximum product history. Review measured
behavior before raising limits; never silently delete excess entries. Tests include
the boundary and preserve unknown entries. A large-history scalable index is not
required before this first logger, but do not advertise complete pruning beyond the
tested envelope.

## 6. Decision E — minimal persistent recovery hold protection

An owned versioned hold manifest contains exact store ID and distinct segment IDs.
It is main-only; no renderer method, recovery engine or effect journal. Initialize
an empty manifest before first segment creation. On reopening, missing/corrupt/
oversized/unknown-version hold data suppresses all pruning and reports
HOLDS_UNAVAILABLE. Never silently recreate an empty manifest beside existing logs.

Hold-add and prune run on the same serialized store-owner lane, never independent
read/modify/write helpers. Recheck holds in that lane immediately before deleting
each candidate. A successfully acknowledged hold must precede any later prune of
that segment; adding a hold after deletion returns fixed MISSING_SEGMENT, not success.
Hold removal is not implemented in P1-04.

Hold-add returns PERSISTED, FAILED or UNCERTAIN. PERSISTED requires successful
validation, exclusive temp write, file sync/close, replacement and validated readback
under the lock; report the exact tested filesystem/process-crash durability scope,
not universal Windows power-loss survival. Before mutation, mark the store unfinished;
clear only after all metadata/holds and owned handles have completed their persistence
steps. Any failed/uncertain operation latches cleanup-disabled for the store; no
later same-run success silently resets it. On unclean reopen/stale lock, suppress all
pruning until explicit recovery reconciles retained records. Never reconstruct empty
holds from a stale-but-valid manifest alone. A caller may not rely on FAILED/UNCERTAIN
as recovery protection and must keep the underlying evidence elsewhere; there is
no real effect producer in P1-04.

The exact filesystem acknowledgement contract needs Windows crash/reopen evidence
and reviewer approval before source acceptance. File sync plus rename is not proof
of every storage controller/power-loss behavior. If durable replacement/unclean
recovery cannot be established on the supported test filesystem, retain all affected
segments and mark this persistence criterion BLOCKED rather than claiming PERSISTED.
This limitation is not permission to discard unresolved evidence. Tests can reopen synthetic
held segments and demonstrate protection beyond 30 days. Future recovery owners must
establish a hold before relying on a log as unresolved recovery evidence and define
reviewed resolution/release behavior. This is a retention dependency contract, not
proof that later effects are journaled. Existing application has no real effects.
UNKNOWN evidence, job history and idempotency state must never be stored solely in
unheld expiring logs. No automatic removal of a hold on crash/restart.

## 7. Decision F — visible failure and exact evidence

Logging failure does not turn successful public health/settings reads into false
service failures or automatically kill the application. Sink state becomes DEGRADED;
v2 returns that status, and the existing diagnostic view displays fixed
`LOGGING DEGRADED — diagnostics may be incomplete` on its next explicit read.
No background request/poll, V9 redesign or new bridge method. Before UI/bridge is
available and at shutdown, emit only a fixed LOGGING_DEGRADED console marker;
never raw error/paths/canaries. Preserve existing BOOTSTRAP_* markers and explicitly
extend harness accepted output grammar for this one status rather than hide failures.
Detailed future V9 operational log/status placement remains P1-08; it must preserve
the same truthful health semantics, not permanently conceal log failures.

Required evidence, all synthetic/private where raw output may contain canaries:

- Pure encoding tests: exact schema and event/code table, multiline/credential/
  password/OTP/token/cookie/path/nested-error/accessor canaries, bounded bytes,
  invalid timestamps/IDs and no caller requestId in output.
- Main/preload integration: fixed main diagnostic reference matches log record on
  received error; malformed/untrusted/local timeout results never invent correlation;
  v1 unchanged and v2 exact validators/limits; no extra method/authority.
- Real owned filesystem reopen/rotation: sequential writes, concurrent callers,
  date/size rotation, truncated metadata, interrupted append/rename, no overwrite,
  held/unheld retention before/at/after cutoff, backward clock and scan bounds.
- Windows tests using actual temporary owned paths: traversal/unowned/reparse denial,
  successful reopen/write/flush, actual sharing-denied or ACL-denied write and failed
  cleanup preservation. Use an owned locked file with FileShare.None or scoped ACL
  fixture; restore/close only test-owned resources. Do not change host-wide security.
- Disk-full branch via deterministic injected ENOSPC on Windows; label fault injection,
  not an actually filled disk. Do not fill the host drive. Verify FAILED/DEGRADED,
  no false persistence acknowledgement and no raw fallback console.
- Windows source/package run: scan application log bytes and captured stdout/stderr
  after positive, malformed-input, sink-failure and renderer-crash cases. Explicitly
  enumerate inspected crash artifacts. Native dumps, if generated, remain private;
  do not claim an arbitrary crash dump can be sanitized by the event encoder. A
  canary-bearing dump blocks publication and requires a separate capture policy.
- All existing P1-01/02/03/11 checks and source/package regressions remain required.
  Sanitized report identifies exact SHA, commands, modes, counts, failure injection
  versus actual filesystem outcomes and NOT_RUN limitations. No required check is
  silently waived by unit tests.

### Orderly shutdown and deadline semantics

Current main cleanup/will-quit is synchronous. Replace it with a one-shot shutdown
state: on first ordinary quit request prevent default, stop new admissions, dispose
views/resources once, enqueue final safe shutdown event, then await the bounded
writer drain/sync/close. Resume quit only once through a guarded second pass. Emit
BOOTSTRAP_CLOSED exactly once only for completed resource cleanup; distinguish log
flush failure by the fixed LOGGING_DEGRADED marker and health/evidence outcome.
Fatal startup/crash exit never claims a successful flush merely because cleanup ran.

A five-second deadline stops waiting, not an already-issued filesystem operation.
Do not release the store lock, clear unfinished state or report FLUSHED on timeout.
Proceed with bounded process termination leaving conservative stale-lock/unfinished
recovery state; no new writer may assume ownership until trusted recovery. Test
reentrant quit, flush rejection, unresolved fs promise, and late completion without
duplicate markers or a second owner racing unfinished work.

## 8. Expected source scope and approval decisions

Expected modules: pure event/schema helper, main-only owned log store/writer, bridge
correlation integration, v2 request/response validators and safe diagnostic rendering;
tests and Windows probe changes. Extend exact P1-01 import map/build manifest; no
generic node:* allowance. Retain existing pure foundation contracts unchanged.

Coordinator approved this exact v2 compatibility change, persistent root/ownership
contract, event/code mapping, resource envelope, retention/hold mechanics and failure
visibility at 06:07 UTC before implementation. Reviewer must check whether these definitions
fully satisfy P1-04 and identify missing cases, not infer acceptance from this draft.
Remaining product preferences: none reopened. Later installed path, real effect-hold
integration and V9 presentation are explicitly owned by their canonical tasks.
Windows/native dump outcomes remain empirical, never assumed safe. This proposal
is NOT_RUN; no Phase/task acceptance, merge or release authorization follows.

### Implementation representation notes — 2026-10-31 06:15 UTC

The trusted development launcher supplies FONESI_LOG_ROOT plus the expected UUID
from its owned parent `.owner` marker as FONESI_LOG_PARENT_TOKEN. This token is an
ownership-consistency check, not a secret or protection against an arbitrary local
process. Root basename uses `logs-` plus lowercase ASCII letters/digits/hyphens;
installed defaults remain separate. Immutable existing owner-marker preflight is
read-only **before** mkdir(.writer-lock), so an unowned root is never mutated merely
to inspect ownership. All mutable store metadata remains under acquired ownership.

Canonical store files: owner.json, holds.json, state.json, unfinished.json;
`.writer-lock/owner.json`; `segment-<UUID>.jsonl` and matching
`segment-<UUID>.meta.json`; `recovery-<UUID>.json` receipts and exclusive
`pending-<UUID>.tmp` replacement files. JSON uses exact field order plus one LF,
duplicate/noncanonical data rejects. Finalized segment retention verifies record
content against run/sequence/max-UTC metadata, not just metadata age. All typed
records and filename rules are implemented/tested as fixed internal schemas, not
renderer-selected filesystem access. Unknown entries and uncertain temporary files
are preserved; they never authorize broad cleanup.

### Current implementation clarification — 2026-10-31 06:35 UTC

The module graph now permits one literal `../` prefix from a nested module only
when normalization remains inside `desktop/src` and the target, binding kinds and
role edge are explicitly registered. Escaping the source root, repeated parent
segments, missing targets and undeclared bindings still reject before esbuild.
This supports main-only logging modules importing their pure contracts; it does
not authorize arbitrary parent-directory or package resolution.

Orderly release persists a fixed `release.json` owner-token receipt before removing
unfinished/lock metadata. An interrupted empty-lock release is recoverable only
under the same stopped-owner/excluded-launch maintenance precondition and exact
receipt identity. A present malformed owner or extra lock entry rejects before
recovery mutation. Deadline abandonment prevents subsequent release steps; it
cannot retract a filesystem operation already issued before abandonment.
