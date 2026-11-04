# P2-03 — Private discovery ingestion contract

Status: **SOURCE ENTRY APPROVED — 2026-11-01 19:06 UTC.** Independent final design
CLEAR binds pre-adoption SHA256 `dc09add879b400c7d9169dc39a22635acb94cdd5cae302eccba52a81988791c9`;
entry proceeds under the coordinator's ordinary source delegation and18:59 P2-03 direction. This document adds no task acceptance or native
authority. [Canonical P2-03](PHASE-02-adb-device-fleet.md), the
[durable ledger contract](P2-DURABLE-REGISTRY-CAPTURE-PROPOSAL.md), and
[fleet contract](P2-FLEET-FACADE-IPC-CONTRACT.md) remain controlling.

## 1. Concrete missing dependency and narrow outcome

The bounded parser, pure reconciler, audited RegistryStore and real SQLite ledger
already exist. Main creates and starts RegistryStore, but has no reconciliation
caller and supplies constant BINARY_UNAVAILABLE to FleetService. The existing host
protocol has VERSION and server lifecycle operations, **not discovery**. This slice
must not add an executable, transport request, polling loop, public IPC, renderer
fixture switch or main activation.

Implement one private ingestion owner that composes admitted observation lifetime,
`parseAdbDiscovery`, and existing durable reconciliation. Do not rewrite those
modules or duplicate their tests. Add the missing observation-current fence through
the actual COMMIT boundary. Prove the composition with actual owned SQLite and
explicit synthetic observations; preserve unavailable production and fleet privacy.
P2-02 actual fresh-profile/server proof and P2-03 two-phone evidence remain open.

## 2. Provenance: no callback-to-native laundering

An epoch is a frozen opaque object recognized by a private WeakMap, not a UUID,
serial, caller-supplied source string, serialized record or public capability.
The issuer captures exact provider callbacks once and binds one epoch to that
provider instance and one ingestion owner. Cross-instance/forged epochs are refused.
The issuer owns a private revoked boolean; explicit revoke sets it synchronously.
The final internal epoch check reads that boolean and captured request/closing flags
without calling provider, clock, owner or any other external callback.

This increment exposes only an explicitly named **synthetic observation provider**
constructor for dependency-injected software composition. Every observation from it
has source SYNTHETIC_TEST, including empty observations. There is no argument to
choose ADB_DISCOVERY and no conversion from parsed bytes to native provenance.
It is not instantiated by main or shipped as a demo activation path. Its source is
ordinary reviewed internal code, not evidence of native authority.

A future actual owned discovery adapter must independently establish executable,
retained server/runtime epoch, exact request, output and retirement provenance before
an ADB_DISCOVERY issuer can be added. That issuer does not exist in this slice.
Supplied identity proofs are **not** accepted: ingestion always sends `proofs: []`.
Thus newly seen devices stay PROVISIONAL and unresolved reconnects are quarantined;
serial/model/IP/order cannot confer physical identity or dispatch authority.

## 3. Proposed exact private API

New `desktop/src/main/adb-discovery-service.ts` exports the service constructor and
its types; a clearly named synthetic-provider constructor brands its private
provider/epoch pair. No source-choice or raw-row method is exposed by the service.

`createAdbDiscoveryService({provider, registry, readDurableRevision,
assertOwnedSync, clock, newId})` captures methods/scalars once. `registry` is the
existing RegistryStore; `readDurableRevision()` reads the actual validated ledger
through the existing persistence adapter, not the process-local registry revision.
The constructor does not acquire, reconcile, allocate files or start a process.
A new ingestion owner requires the already-started, disconnected RegistryStore
snapshot with sequence:null and no current bindings. A nonnull sequence is rejected;
there is no offset, reset or replacement owner over an existing observed registry.

Methods:

- `refresh(expectedDurableRevision): Promise<DiscoveryReceipt>`: one explicit
  acquisition, no retry; reserves the service lane before any injected callback.
- `snapshot(): RegistrySnapshot | null`: privately recognized current snapshot only
  while this owner and its accepted epoch remain current. It is not a dispatch grant.
- `availability(): 'LIVE_DISCOVERY_UNAVAILABLE' | 'OBSERVED'`: OBSERVED requires
  an admitted ADB_DISCOVERY epoch, so remains LIVE_DISCOVERY_UNAVAILABLE for this
  increment's synthetic provider.
- `close(): Promise<{status:'RETIRED'|'UNRETIRED'}>` and `retired:boolean`: see §4.

Provider `begin(request)` returns an exact frozen acquisition handle with two promises:
`result` and `retirement`. Snapshot its own data descriptors before use; getters,
extra fields and malformed promise handles are rejected. Retirement must fulfill
with the exact frozen descriptor-validated record `{status:'RETIRED'}`; a resolved
undefined, false, malformed record or rejected promise does not prove retirement. The request is a frozen private record containing a fresh
request UUID, owner-bound epoch object, positive sequence and absolute deadline UTC.
The provider's captured `assertCurrentSync()` validates the same epoch; it cannot
replace that epoch. Result is an exact descriptor-snapshotted record:

```
{ outcome: 'COMPLETE'|'FAILED', raw: string|null,
  observedAtUtc: number|null, stdoutTruncated: boolean, stderrTruncated: boolean }
```

COMPLETE requires raw string, safe nonnegative observed UTC between the admitted
request start UTC and completion clock inclusive, and both truncation flags false. FAILED requires raw/observedAtUtc null.
No stderr/raw exception is returned to callers. Result resolution is **not** process
retirement. COMPLETE and the exact fulfilled RETIRED record are both required
**before calling RegistryStore.reconcile**. A known FAILED result may release its
lane only after exact retirement; it never reconciles. Both promises must settle
before lane release.
A rejected retirement, malformed handle or thrown begin cannot prove retirement and
latches UNRETIRED/closed admission. Synthetic fixtures may explicitly fulfill their
retirement promise, but that is labeled synthetic lifecycle evidence.

Receipt union (all frozen, exact fields):

- `{outcome:'COMMITTED', revision, requestId, sequence, source:'SYNTHETIC_TEST',
  auditHealth, projectionCurrent:boolean}`. `revision` is actual durable revision.
- `{outcome:'NOT_COMMITTED', code, requestId:string|null,
  sequence:number|null, auditHealth:'DEGRADED'}`.
- `{outcome:'OUTCOME_UNKNOWN', code:'OUTCOME_UNKNOWN', requestId, sequence,
  auditHealth:'DEGRADED'}`.

Finite local refusal codes: BUSY, CLOSED, INVALID_REQUEST, INVALID_DISCOVERY,
DISCOVERY_LIMIT, STALE_OBSERVATION, EPOCH_REVOKED, DEADLINE, PROVIDER_FAILED,
UNRETIRED, ID_EXHAUSTED. Map DurableMutationResult deliberately: preserve its
code (when present), outcome and auditHealth; on COMMITTED copy its actual revision;
attach only this ingestion requestId/sequence (and the fixed source/currentness
fields defined above). Omit durable operationId/diagnosticId from DiscoveryReceipt;
the existing audit retains those correlation IDs. This is not preservation of the
whole durable result object and does not expose additional IDs. Never translate
uncertainty into known failure. No raw observation,
serial, transport, epoch UUID, paths or provider messages enter a receipt.

## 4. Bounds, sequencing and actual settlement

Reuse the parser's 1 MiB UTF-8 bound and RegistryStore's already approved defensive
budgets (256 devices/claims,4096 bindings/evidence); do not add product capacity or
history pruning. Check descriptor shape/length before copying provider data. IDs are
canonical UUIDs, unique within the existing 65536-allocation defensive convention;
exhaustion refuses before acquisition. Sequence starts at1 per private epoch,
increases for every admitted attempt, is never reused after failures, and refuses
before acquisition at MAX_SAFE_INTEGER exhaustion. An observation cannot supply or
reset the sequence. Epoch replacement requires a new owner; old pending work cannot
be rebound. Durable restart already retires historical bindings/increments generation.

Use the established 30-second operation deadline, starting before provider/audit
work, with monotonic nonregressing safe UTC checks. Before entering
RegistryStore.reconcile, timeout immediately invalidates current
projection and may return NOT_COMMITTED/DEADLINE while retaining acquisition
promises. Once reconcile has been entered, refresh awaits its exact durable receipt,
including delayed RESULT audit: no timeout races that receipt and no guessed
NOT_COMMITTED or OUTCOME_UNKNOWN from elapsed waiting. The deadline still fences
pre-COMMIT admission; a known commit stays COMMITTED even if its receipt arrives
late. Timeout never releases a still-pending acquisition lane or means
cancellation/undo. Subsequent refresh is BUSY until actual result and retirement
settle; late acquisition completion cannot reconcile after its deadline.

`close()` immediately prevents new refresh/publication and waits the existing
acquisition/result/commit promises concurrently under one established120-second
shutdown budget. It does not close the shared RegistryStore/coordinator, kill a
process or invoke a provider retry. At the close deadline return UNRETIRED and retain
pending
promises, including an entered reconcile awaiting its exact receipt; this shutdown
status is not database OUTCOME_UNKNOWN. Later refresh settlement retains the exact
durable outcome. Later actual settlement may update `retired`, never reopen admission or
rewrite the returned close receipt. Ordinary epoch authority and persistence-owner
cleanup authority are separate: epoch revocation does not waive tracking retirement.

## 5. Durable CAS, audit and committed-but-stale publication

At admission, validate `expectedDurableRevision` against the actual ledger. Do not
substitute `RegistrySnapshot.revision`: DISPLAY/CAPTURE can advance durable revision
without changing that process-local number. A concurrent durable mutation causes
STALE_REVISION; no automatic re-read/retry after acquisition or audit.

Narrow RegistryStore extension: allow `reconcile(expectedRevision, observation,
assertObservationCurrent?, assertObservationFinal?)` to capture the ordinary synchronous
admission callback and separate callback-free final fence, and
invoke it alongside existing owner/runtime checks in the DurableCoordinator lane,
including its actual database COMMIT admission and final runtime publication. The
callback checks captured epoch, closed/deadline state and original request identity.
The existing DurableCoordinator.assert invokes its final owned callback after admit;
therefore merely adding another external admit callback is insufficient. Add a
minimal optional final-internal observation fence to the coordinator lane/step path:
run existing owner/provider/clock/ordinary admission callbacks first, then invoke
the ingestion-owned callback-free fence after the coordinator's last owned callback
and immediately before actual COMMIT admission completes. The fence reads only
private epoch-revoked/request/closed/expired flags and captured deadline values. No
external callback follows it before commit dispatch. Apply the same ordering before
current runtime publication. Existing callers without this optional fence retain
their existing behavior. The issuer's revoke operation synchronously changes the
private flag even when called reentrantly by that last coordinator-owned callback.
Existing direct internal store callers may retain the original two-argument form;
that path does not acquire new native provenance.

Reuse existing RECONCILE INTENT/RESULT audit and protected transaction semantics.
No second fabricated audit layer, logger schema or database migration is added.
Failed INTENT prohibits commit; RESULT degradation preserves a known commit.
Malformed acquisition/pre-admission refusals are fixed service outcomes, not falsely
claimed durable audit events. Raw discovery bytes/serials never enter audit records.

If confirmed COMMIT occurs and epoch/owner becomes stale during RESULT audit or final
publication, preserve the true COMMITTED durable receipt with
`projectionCurrent:false`; invalidate the ingestion projection. Do not claim rollback,
replay, a current binding or OUTCOME_UNKNOWN for a known commit. If SQLite itself
reports uncertain commit, retain OUTCOME_UNKNOWN and existing coordinator quarantine.
Closing/stale publication must not erase stable device/evidence history.

## 6. Fleet boundary, deliberately no public-contract expansion

FleetService already rejects SYNTHETIC_TEST current or historical bindings. Preserve
that predicate; tests must show this ingestion cannot bypass it. The service's
synthetic snapshot may be inspected by private tests, never projected as native.
Initial production remains the existing empty unavailable state; no new main wiring.

After a formerly admitted observation becomes invalid, ingestion snapshot returns
null rather than a remembered live binding. Existing FleetService then emits fixed
FLEET_UNAVAILABLE; current renderer hides stale rows. Do not return successful empty
observation for provider failure, or label disconnected history OBSERVED merely to
fit the wire. A richer stale/history/conflict-summary UI is a separate finite
contract: current fleet wire cannot display unresolved claims without device IDs.
This slice therefore does not claim full P2-03 conflict visibility or live refresh.

## 7. Files and focused acceptance

Expected source scope: new discovery service + focused composition tests; narrow
RegistryStore fence extension, minimal optional final-internal DurableCoordinator
fence, and their causal tests. Reuse parser, reconciler,
FoundationPersistence.durableAdapter, DurableCoordinator, FleetService and existing
private-provenance checks. No main/preload/renderer/native/protocol edits. Parent owns
module-map/test inventory and the coherent aggregate after independent review.

Actual-owned SQLite tests with explicitly synthetic text/provider lifecycle:

1. Parser→store confirmed COMMIT preserves two stable distinct provisional IDs across
   row-order changes; durable receipts and actual ledger revisions match.
2. Duplicate serial/transport, empty/malformed text and historical reconnect never
   merge identities; conflict/quarantine and history match existing reconciler.
3. DISPLAY/CAPTURE advancement makes a stale durable CAS refuse; registry revision
   is never substituted for ledger revision.
4. Deferred provider, failed audit, owner/epoch revocation during INTENT, immediately
   before COMMIT and during RESULT: exact byte/ledger witnesses; no false rollback
   or current publication after a known commit.
5. Result-before-retirement, timeout, close, late response, rejected retirement and
   reentrant clock/ID callbacks: no second acquisition or late reconcile.
6. Sequence/ID exhaustion and malformed descriptor/getter records refuse atomically.
7. The coordinator's **last owned callback** revokes the private epoch after ordinary
   admit succeeds: final callback-free fence refuses before COMMIT; unchanged ledger
   witness proves no publication or mutation. Also reject a new owner over a nonnull
   sequence and observations predating admitted start.
8. Real store→FleetService composition rejects synthetic history and stale/null
   projection without exposing private serial/text. No synthetic ADB_DISCOVERY label.
9. Actual database close/reopen/startup retains device/evidence history, retires all
   bindings and cannot inherit a provider epoch or VERIFIED/current authority.

These establish software ingestion, persistence and refusal subcriteria only.
Actual owned acquisition, P2-02 server prerequisite, two physical phones, identity
proof acquisition, live conflict visibility and physical reconnect evidence remain
NOT_RUN/UNMET, not silently deferred into passing P2-03 acceptance.
