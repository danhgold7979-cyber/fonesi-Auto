# P2 fleet facade, selection and V9 bridge — implementation contract

**SOURCE ENTRY APPROVED — 2026-11-01 03:43 UTC.** Coordinator Coder Bin authorized this finite contract and
explicitly permits a non-device-effect selection CAS in the same batch. Exact contract
review preceded new IPC source. Coordinator Coder Bin approved the independently
reviewed pre-adoption SHA256 `d19fe794556e19145cbecfae45f81ec9ec21b8ba8455fd3f225b7bae42a39dee`;
final design CLEAR satisfied that entry condition. Native execution is not implied. This is canonical P2-03/07/10/11 integration, not live
ADB activation or completion of the physical matrix. No task/denominator changes.

## 1. Scope and production boundary

Implement a main-owned facade over the recognized registry and selection controller,
actual private capability/admission checks, fixed audit events, a narrowly exposed
preload client and the existing V9 shell. Current production registry remains empty,
with BINARY_UNAVAILABLE / LIVE_DISCOVERY_UNAVAILABLE. No synthetic provider, hidden
fixture flag, generic command, shell, serial/endpoint/path parameter, pairing, scan,
reconnect or device action becomes available. Existing production unavailable domain
actions remain unavailable. Test/demo fixtures remain separate, labeled provenance.

The facade captures trusted main dependencies (current registry, selection, ownership,
clock, diagnostic allocator, audit). Only an actual in-process recognized registry may
be projected; structural/serialized VERIFIED data and SYNTHETIC_TEST source cannot
become production fleet rows. Reject any recognized snapshot retaining a SYNTHETIC_TEST
binding/history, even when its latest observation.source is ADB_DISCOVERY; a later
source tag cannot cleanse fixture identity. Test that exact mixed-history transition.
The current main factory supplies emptyRegistry, not
user-controlled callback choices. Library tests may supply synthetic facts through the
same typed engine, but are not evidence of actual discovery/identity acquisition.

A future admitted provider can project bounded public rows without changing this
wire; it must independently establish binary/server/registry proof. No activation flag
is added here. Public rows contain only deviceId UUID, generation, a generated bounded
label, state and verification. Public labels have exact grammar `Device 0001` through
`Device 0256`, allocated once per logical device in this main instance without reuse;
no caller label/model/serial is used. Label exhaustion returns LIMIT_EXCEEDED.
No serial, transport/binding ID, endpoint, raw metadata,
account, key, capture path or device stdout crosses this channel. Generated labels are
UI labels, not evidence of physical identity. Real device IDs remain internal app IDs,
not substituted for the separate pseudonymous export labels in P2-11 diagnostics.

## 2. Exact wire and bounds

One channel `foundation:fleet:v1`, exactly one string argument, no extra arguments.
Preload exposes only frozen `window.fleet.read()` and
`window.fleet.replaceSelection(expectedRevision, selection)`; no generic invoke or
subscription/listener. Private request IDs are `f` plus a canonical positive safe
integer counter, no caller override; exhaustion rejects before invoking.

Requests are exact duplicate-aware JSON objects:
- `{version:1,requestId,method:'fleet.get'}`.
- `{version:1,requestId,method:'fleet.selection.replace',expectedRevision,selection}`.

Selection is exact `{selectedDeviceIds:UUID[],activeDeviceId:UUID|null,
groups:[{groupId:UUID,deviceIds:UUID[]}]}`. Revisions are safe nonnegative integers,
negative zero rejected. Duplicate IDs/groups/unknown fields/getters or malformed arrays
reject; no silent trimming, normalization, truncation or selecting an arbitrary device.
Each defensive budget is independently enforced: selected IDs <=128, groups <=32,
total memberships across all groups <=128; these bounds do not imply those devices
exist or are accepted. All referenced devices must exist in the current recognized
registry; group count never bypasses membership validation. Offline rows may
remain selected for viewing, but no selection grants actor/device control. Active
control remains one ID distinct from selected/group sets. Empty state is valid.

Defensive inspection bounds: request16KiB, response64KiB UTF-8; up to256 projected
registry devices,128 selected IDs,32 groups and128 total group memberships. Existing
registry/binding scan budgets remain explicit, bounded main configuration. These are
transport/parser limits, not a certified fleet/product capacity. Exceeding any bound
returns a fixed error, never a partial silently truncated fleet.

Success exact fields:
`{version:1,ok:true,requestId,outcome,fleet,auditHealth}`.
Read outcome is only OBSERVED. Selection outcome is UNCHANGED or APPLIED.
APPLIED means confirmed process-local main selection state, **not durable SQL commit
or a device effect**. `fleet` is exact:
`{registryRevision,availability,reason,devices,selection}`; selection adds its revision.
Availability is UNAVAILABLE or OBSERVED. UNAVAILABLE reason is BINARY_UNAVAILABLE or
LIVE_DISCOVERY_UNAVAILABLE, with empty devices for the current production factory.
OBSERVED has reason:null and only source-admitted registry rows. A row is exact
`{deviceId,generation,label,state,verification}`; state is DEVICE/UNAUTHORIZED/OFFLINE/
UNKNOWN/CONFLICT/DISCONNECTED, verification PROVISIONAL/VERIFIED. No row state is a
permission to dispatch. Selection/group order is canonical; label allocation is stable
within the main process and does not manufacture metadata.

Error exact fields:
`{version:1,ok:false,code,diagnosticId,auditHealth}`. Fixed codes:
INVALID_TRANSPORT, PAYLOAD_TOO_LARGE, INVALID_JSON, INVALID_SHAPE, UNSUPPORTED_VERSION,
UNKNOWN_METHOD, UNTRUSTED_SENDER, SESSION_UNAVAILABLE, SESSION_REVOKED, BUSY, TIMEOUT,
INTERNAL_FAILURE, CONFLICT, MEMBER_UNAVAILABLE, LIMIT_EXCEEDED, OWNER_REVOKED,
FLEET_UNAVAILABLE. No echoed input or raw exceptions. diagnosticId is canonical main
UUID or null. Preload-local failures retain their fixed code, null and DEGRADED;
null does not identify a human/origin. Main allocator failure returns INTERNAL_FAILURE
before mutation, null/DEGRADED. Success auditHealth is observed AVAILABLE/DEGRADED,
never assumed from a successful read alone. Parsers bind requestId and method outcome.

## 3. Main lifecycle, CAS and audit

Use existing ViewSession admission: exact trusted main-frame sender/URL, document
session, current state and shared global8 unresolved cap. Recheck after every await
and synchronously at final state replacement / response release. No new origin,
navigation, CSP relaxation or renderer-selected capability. Main services receive
private operation capabilities, not the transport request as authority.

One bounded facade operation lane returns BUSY rather than queuing implicit retries.
READ checks ownership/current session before atomic snapshot and again after audit
before releasing data. Selection checks expected revision, current registry membership,
owner/session and response-size validity before replacing state. SELECT must first receive AVAILABLE from an actual flushed
INTENT audit; failed/throwing/degraded intent returns INTERNAL_FAILURE with allocated
diagnosticId and DEGRADED, leaving state unchanged. After that await, recapture the
recognized registry and revalidate membership/expected selection revision, then check
owner/session synchronously after the last dependency callback. No await between the
last synchronous current check and in-memory CAS. Failure before replacement leaves
selection unchanged. Audit or notification failure after confirmed replacement keeps
truthful APPLIED/DEGRADED, not a fabricated rollback or OUTCOME_UNKNOWN commit.
Revoked reply after application returns SESSION_REVOKED; it does not undo the already
applied selection. Main close revokes admission and waits only on its actual bounded
operation settlement, using existing non-cancelling shutdown deadline/uncertainty rules.

Extend the existing fixed logger union compatibly with schemaVersion4, task P2-10,
event FLEET_OPERATION. Keep old record schemas1–3 valid. New record includes existing
runId/sequence/UTC/severity/component envelope and exact fields operation READ/SELECT,
phase INTENT/RESULT, diagnosticId, expectedRevision/resultingRevision nullable safe
integers and code OK or the fixed fleet error enum. READ attempts a RESULT audit and may return OBSERVED/DEGRADED if that audit fails;
it does not mutate and need not acquire a successful INTENT barrier. SELECT follows
the required INTENT barrier above; its RESULT failure after CAS preserves APPLIED.
No payload, row/device ID, group
label, serial or selection list is logged. Actual ApplicationLogger/owned LogStore
append outcomes govern auditHealth; append failure is not falsely reported available.
P2-11 pure per-device encoding remains separate, not impersonated by unrelated P1 events.

Selection is process-local in this batch; restart clears it. Durable registry/capture
schema is separately specified and must integrate next, not be claimed implemented by
this facade. Groups/selection persistence is not implied by APPLIED.

## 4. Preload and UI composition

Use the SAME existing InvocationBudget shared with diagnostic and preferences clients:
8 unresolved,2-second total deadline including readiness. Reuse the private post-arm
readiness signal as a narrow semantic extension to fleet hydration; register before
renderer load, consume without exposing event handlers. No missing/late event can
invoke after timeout/disposal. Timeout retains underlying invocation occupancy until
settlement, discards late replies and never retries a mutation. pagehide disposes all
clients/readiness; no event can rearm a revoked document.

Renderer performs one fleet read on mount after readiness, independent of one-shot
preferences hydration. Explicit refresh/reconcile is available in the existing help/
status surface, no polling or auto scan. Failed/unknown selection response requires an
explicit read before further selection mutation, not optimistic retry. Read timeout
never invents empty success; render fixed error/unavailable state with no stale rows
presented as live. Preferences/theme continue independently.

V9 six-page structure/CSS/dock are retained. Adapt main public rows to a distinct typed
MAIN_OBSERVED provenance (not SYNTHETIC_TEST), retaining unknown metrics and unavailable
domain actions. Current production stays empty/unavailable. Bind selected/active UI
changes to confirmed main selection results; do not call local view state committed.
One selection mutation at a time; no automatic retry/coalescing of external effects.
Accounts focus follows the confirmed active target; selected checkboxes never become
implicit broadcast. Group routing is typed main state, not a new device execution UI.
No new banner geometry or invented backend data is needed.

## 5. Finite evidence

Pure contract/client tests cover duplicate/size/type/enum rejection, mixed-client shared
budget, readiness/late settlement/dispose, request binding and method outcomes. Actual
facade + real logger tests cover CAS, unchanged/read, offline membership, final ownership/
session revocation, audit failure and APPLIED-versus-unknown transport distinction.
Actual dispatcher tests cover foreign sender/subframe/reload/no extra args and no
response leakage. Renderer tests cover single hydration, confirmed selection/focus,
error reconciliation and independent preferences. Fixture rows are explicit test data,
not new production demo activation. Existing demo surface remains unchanged.

One coherent source aggregate follows affected tests. Hosted native integration, if
needed, uses exact reviewed production entry instrumentation and bounded evidence—not
real device actions. Existing protected server gate stays manual/defaultoff and is not
retried on the ineligible preexisting-profile runner. No task/Phase acceptance follows
from these software fixtures; physical two-phone/Unicode/capture and P1-06 gaps remain.
