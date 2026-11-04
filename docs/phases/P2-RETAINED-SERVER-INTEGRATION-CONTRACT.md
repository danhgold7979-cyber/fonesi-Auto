# P2-02 — Retained server integration contract (draft)

Status: SOURCE IMPLEMENTATION IN PROGRESS under coordinator delegation; independent
source-entry design CLEAR at18:19 on SHA256
`0c655f145e6c38e486d8cdd576b3cb32d93df4115979ff7d8398e885e84fe839`.
This is not native execution approval.
Date: 2026-11-01. Original requirement: PHASE-02-adb-device-fleet.md, P2-02.

## 1. Finite outcome and exclusions

Connect the existing main-only host adapter, fixed managed reader and retained native
server API into one privately constructible START → HEALTH → STOP controller.
An explicit internal caller is required. This batch adds no startup auto-start,
renderer/preload API, Help action, background polling, discovery, device command,
credential adoption, server sharing or foreign-server shutdown. Existing Help VERSION
continues to use VERSION_ONLY. Main must not construct or invoke the new server
controller in its ordinary application path. A future actual invocation requires exact
runner review and execution scope; having a callable export is not activation authority.

Reuse adb-host-plan/lifecycle/adapter/bridge/factory, runtime custody, parent admission,
RetainedAdbProtocol and RetainedAdbSession. Do not add another process supervisor,
IPC abstraction, dependency, shell command compiler or alternate profile mechanism.

## 2. Scope and immutable admission

Add exactly SERVER_ONLY beside VERSION_ONLY to the private factory/bootstrap operation
scope. Omission defaults to VERSION_ONLY. SERVER_ONLY admits START, HEALTH and RETIRE;
VERSION_ONLY admits VERSION and RETIRE. Wrong-scope requests refuse before provider
reservation/effects. DISCOVER remains NOT_READY. The existing five-key canonical ASCII
request frame, monotonic request IDs, UUID session/attempt correlation, frame limits,
request budgets and output bounds remain unchanged.

The scope is captured once from a trusted main-only factory argument and bound into the
hash-verified immutable bootstrap. No renderer string, environment variable or incoming
request can change it. Existing VERSION caller signatures/default behavior remain valid.
A server controller is constructed with the same actual custody, owner fence, expected
positive installation revision, clock, UUID allocator and factory dependencies as the
existing adapter; no public manifest, executable, port or argv argument is introduced.

Fresh runtime read admission must match the immutable bootstrap's current catalog entry,
installation revision, executable path/hash and expected version. Catalog launch policy
continues to apply. The read token remains held across the live server session, blocking
setup/install/rollback. Cached bootstrap bytes are not fresh execution authority.

## 3. Provider and exact response contract

Reuse HostNativeProvider unchanged: reserveAttempt(VERSION|FOREGROUND), version,
startForeground, health, retire. Extend the managed IProvider with StartForeground and
Health, delegating to the already existing retained native methods. Its reservation
accepts FOREGROUND only in the server reader scope; effect-free reservation precedes
handoff. Existing managed default Run overloads remain VERSION_ONLY and silent.

The outer bridge response/correlation envelope is unchanged. The facts payload uses
existing HostTransportFacts version 2. INVOCATION remains unchanged. SESSION has exactly:

```
{version:2,kind:'SESSION',dispatched:boolean,
 jobState:'LIVE'|'RETIRED'|'UNKNOWN',exitCode:number|null,
 endpointState:'OWNED'|'ABSENT'|'UNKNOWN',
 observation:'STARTED'|'HEALTHY'|'STOPPED'|null}
```

The managed serializer must enforce the same closed keys, bounded exit integer and
scalar validation as snapshotHostTransportFacts, then operation-specific success:
- STARTED/HEALTHY: dispatched=true, jobState=LIVE, endpointState=OWNED, exitCode=null.
- STOPPED after dispatch: jobState=RETIRED, endpointState=ABSENT, actual integer exit;
  forced nonzero exit is retirement, not fabricated exit zero.
- Never-dispatched cleanup: dispatched=false, RETIRED/ABSENT, null exit/observation.
- Unknown/error facts never authorize retirement or a successful observation.

Existing exact one-key native error codes remain unchanged (including PROFILE_REJECTED,
ENDPOINT_REJECTED and UNRETIRED); no raw exception/path/key/endpoint output is added.
An error response alone does not establish attempt retirement: perform/observe RETIRE.

## 4. Reader and controller lifetime

Reuse HostState STOPPED/STARTING/READY/STOPPING/UNCERTAIN and HostResult outcome/code;
do not introduce a competing lifecycle state machine. The thin controller forwards the existing engine frozen read-only snapshot through
adapter/factory rather than reconstructing engine state. It owns one adapter/capability and one retained foreground attempt. Its operations are fixed start,
health, stop, snapshot and close, delegating to existing HostRequest operations with
main-created command/correlation IDs and existing bounded deadlines.

START creates the attempt once. HEALTH requires that same successfully started live
attempt; it does not reserve a new one. Ordinary work is serialized. The continuously
reading managed reader must still accept RETIRE while START or HEALTH is in flight;
cleanup has its own retained worker and stopping latch before native create/resume.
Do not reuse the VERSION reader's terminal-only availability predicate for live HEALTH.
Duplicate START, mismatched attempt and post-stop HEALTH refuse without a second
launch. If a same-attempt HEALTH arrives after prior response bytes but before remote
ordinary/output settlement, return the existing fixed BUSY error without provider
handoff; do not close the protocol merely for that scheduling race. This refusal is
not a HEALTH observation, and no automatic replay is added. Serialize the bounded
BUSY response behind existing output while preserving OutputLimit=2; do not add an
unbounded response queue. RETIRE effects always remain cleanup-admissible during that
wait. If START output plus BUSY already consume both output slots, native cleanup
still runs immediately; a RETIRE reply that cannot enter the existing bounded output
queue follows its existing OUTPUT_FAILED/unclean-close path. Do not allocate a third
queued frame, block retirement effects on output capacity, or claim clean retirement
from an undelivered reply. This retains truthful uncertainty rather than promising
all concurrent requests can succeed.
A correct immediate call may truthfully be BUSY, never falsely HEALTHY. If the
existing adapter classifies this native error as uncertain, retain that conservative
classification and cleanup requirement; do not promise a same-controller retry or
weaken its unknown-outcome latch. No automatic replay is permitted. The existing AttemptLimit=128 and OutputLimit=2 remain; factory write cap2 is
concurrent writes, not a lifetime limit, and is unchanged. Admit at most128 HEALTH
requests per foreground attempt (including failed admitted health calls); further
HEALTH returns BUSY without provider handoff, while RETIRE remains available. This
is a defensive bound, not polling or a product uptime limit. One controller owns one
foreground attempt; a new session requires a new controller after confirmed closure.

READY is published only after exact STARTED facts, current owner/capability/runtime
fences, actual parent request-write completion and complete correlated response receipt.
Receiving response LF does not prove the remote serializer/Flush worker has retired;
that effect-free output work remains under the separately retained helper/persistence
lifetime and must settle before helper cleanup or reuse. HEALTH success is observed-at-
time, not a perpetual health guarantee. No automatic health timer is introduced.
A deadline or lost owner revokes ordinary publication and requests cleanup; it does not
cancel the actual provider promise or synthesize stopped/retired facts. Unknown state
retains the underlying attempt/read holder until actual terminal proof. Late success
cannot revive a revoked operation or reopen a closed controller.

An idle, currently admitted ordinary stop may delegate SERVER_STOP and return an
operation receipt `{kind:'OPERATION',result:HostResult,auditHealth:AVAILABLE|DEGRADED}`.
When START/HEALTH is pending, authority is revoked, or shutdown is requested, stop/close
must instead invoke retained factory.close immediately, never adapter.execute(STOP)
which would return BUSY/NOT_AUTHORIZED. This returns a distinct cleanup receipt
`{kind:'CLEANUP',status:RETIRED|UNRETIRED,auditHealth:AVAILABLE|DEGRADED}`; it does not
fabricate an OBSERVED/STOPPED HostResult. close permanently fences further operations.
Factory ownership means actual persistence lease/resource validity through cleanup;
controller session closing/ordinary authority is a separate fence and cannot revoke
cleanup permission. State snapshots preserve the engine state plus its actual closed
flag, not a fabricated STOPPED state derived from a logical timeout.

STOP/close cleanup remains permitted for the exact retained attempt after ordinary
capability/owner loss; it grants no new launch authority. EOF/parent death stops ordinary
admission and starts cleanup. Clean helper exit requires reader, provider/cleanup and
output workers retired; Node must also observe actual helper process and stdio/write
retirement. Outer Job kill/child exit is an emergency boundary, not positive ADB proof.
The persistence lease/run-root cannot be released or removed on uncertain helper cleanup.
Preserve existing bounded shutdown rather than stacking a second full shutdown budget.

## 5. Audit and publication boundary for this source-only slice

Do not mislabel server work as RUNTIME_VERSION or alter historical log schemas 1–8.
The controller accepts an injected private audit callback, with exact fixed fields:
`phase:INTENT|RESULT`, `request:HostRequest`, `result:HostResult|null`,
`state:HostState`. The request is an immutable descriptor-validated snapshot, not an
arbitrary object; its operation is restricted to SERVER_START/SERVER_HEALTH/SERVER_STOP.
INTENT requires result=null; RESULT requires a validated HostResult. No raw runtime,
endpoint, serial, profile, stdout/stderr or free text is allowed. The callback has the exact asynchronous type
`(record:AuditRecord) => Promise<'AVAILABLE'|'DEGRADED'>`; rejected promises, invalid
receipts or synchronous throws are DEGRADED. No persistent logger binding is provided in this batch, and tests
must label these as supplied audit receipts rather than real fsync evidence.

For ordinary START/HEALTH, successful INTENT receipt is required before provider
handoff. Failure refuses the ordinary operation, without effects. A RESULT audit
failure cannot erase a known physical result: return the existing HostResult together
with auditHealth=DEGRADED; do not retry launch or claim rollback. Publication rechecks
owner/session/runtime admission after callbacks. Successful START/HEALTH calls the
factory's effect-free assertCurrentSession against its actual retained read token,
observation and expected installation revision after the last external callback.
Successful ordinary STOP instead calls assertRetiredSession against the actual
STOPPED/released adapter state; whole-helper cleanup is a separate obligation. Only
controller internal closed/expired/deadline comparisons follow these assertions before
the immutable response is captured. Neither assertion reacquires custody or performs
a health exchange; no continuously-live or fresh byte-rescan claim is introduced. A known physical result may be
retained privately for cleanup even when it cannot be published as current READY.

Cleanup STOP/close begins immediately even with pending INTENT/RESULT audit, failed
audit or revoked owner. It does not fabricate a HostResult or new operation audit record
for cleanup-only retirement. Already-started audit promises remain actual drain
obligations; failure contributes DEGRADED. Late INTENT completion cannot dispatch after
close. One close deadline starts when close is first requested, covers factory cleanup
and existing audit completion concurrently, and is never restarted after an audit wait.
UNRETIRED retains the factory/audit promises and actual retirement latch; late settlement
may complete cleanup without reopening admission. This exception never permits START/HEALTH. A future main activation must supply a separately reviewed actual logger
binding and exact additive durable event schema; this draft does not silently grant
persistent server audit coverage or connect a no-op audit implementation to main.

## 6. Native profile and endpoint rules stay unchanged

Use actual NativeProfile resolution through SHGetKnownFolderPath and corroborating
legacy API, then exclusive CreateDirectory of its .android child. Existing .android
(including dangling/reparse entries) refuses; no adoption, rename, deletion, backup,
USERPROFILE/HOME redirection, token switch or ACL workaround. Only a newly reserved,
marker/identity-bound profile may be cleaned, after workers/Job/drains retire and exact
key-pair/owner inventory checks pass. Unknown/changed inventory remains retained.

Keep fixed foreground command, private loopback endpoint selection, owned listener PID
and Job proof, fixed host:version health exchange, and existing USB/emulator/mDNS
suppression. Do not connect to, restore by killing, or take over an unrelated server.
Port collision/race refuses; cleanup touches only owned process handles. The same
native profile guard applies to every eligible pinned catalog candidate; generic
ANDROID_USER_HOME/HOME documentation does not prove ADB authentication redirection. Suppression
configuration is not evidence of real-device isolation beyond what was actually tested.

## 7. Concrete file and test plan

- Modify desktop/src/main/adb-host-factory.ts and desktop/launch/Invoke-RetainedHost.ps1 for the immutable scope gate;
  preserve default VERSION path and asset/source provenance.
- Update launch/launch-journal.cjs to admit exactly the same immutable scope values;
  retain current launch ownership/receipt/bootstrap validation.
- Modify RetainedAdbProtocol.cs for scope-bound provider dispatch, SESSION serialization
  and retained live-attempt scheduling. Reuse native RetainedAdbSession methods without
  rewriting reviewed interop. Any required native defect repair is separately identified.
- Add main/adb-server-service.ts as the thin private controller described above; reuse
  HostRequest/HostResult/HostState and the existing adapter, not a second transport.
- Extend managed fixture and focused reader/bridge/factory/adapter tests; add controller
  composition tests. Register exact imports/build assets/pins, without main activation.
- Preserve historical evidence parsers. Changed C#/PS invalidates old current-input
  managed reuse: a later execution needs refreshed exact-source compilation and managed
  fixture evidence before any server campaign. Suspend the current retained-rollback
  opt-in during this source-only checkpoint rather than run it with stale managed/report
  assumptions; re-enablement requires exact updated input/runner review.

Useful locally runnable outcome: injected real controller → adapter → bridge framing
with controlled provider responses proves START/live HEALTH/STOP, shared setup exclusion,
wrong-scope zero-handoff, same-attempt correlation, pending START/HEALTH plus RETIRE,
owner loss, pending audit plus immediate close/late no-dispatch, fixed BUSY on
pre-Flush HEALTH with cleanup preemption, audit faults, clock/reentrant fences, EOF, timeout/late settlement and
unretired-output custody. Managed fixtures separately exercise actual reader scheduling
with fake providers, including SESSION tuples and no false clean exit. No fixture calls
native server/profile/network methods. Run only affected suites, not redundant campaigns.

## 8. Acceptance and remaining gate

This source slice can finish executable source integration and deterministic lifetime
composition independently of host eligibility. It cannot accept original P2-02's actual
Windows collision/start/health/stop/death/hung-child/process-tree criteria.

The current real environment is blocked by an existing native Known Folder .android
(CreateDirectory error 183). That is a correct refusal, not a reason to change profile
policy. Actual server proof requires a separately reviewed eligible Windows environment
where that native entry is genuinely absent, exact current managed compilation, and a
finite owned lifecycle/negative campaign. No currently authorized Windows execution
environment was identified by the parent inventory. No device or personal host access
is inferred. Inspected AOSP Windows profile source is supporting source context, not
proof of the exact source revision of either pinned executable.
Until then, report SOURCE_INTEGRATED / NATIVE_SERVER_UNMET, never server availability,
whole-task acceptance or an implicit production activation.

## 9. Current-source managed-only verification preparation

Coordinator18:24 confirmed that current-source compilation and fake-provider SESSION
routing/lifetime verification are within the existing authorized builds/tests scope,
contingent on final exact runner review. This does not resolve the native profile gate.
Reuse the fixed four-source compiler/owned fixture runner. Invoke the historical eight
reader groups, two selected-version parser groups and nine newly authored SERVER_ONLY
fake-provider groups; no fixture may construct the native provider or invoke native
server/profile/endpoint methods. Produce a distinct strict version3/group19 report
bound to all ten current managed inputs. Preserve version1/eight and version2/ten
historical parsers, hashes and accepted bytes unchanged.

The sole new opt-in is phase-02 `[server-managed]` or the explicit default-false manual
input after source checks. It performs no official archive fetch, ADB invocation,
Electron app launch, device operation or profile mutation. Only the fixed sanitized
managed JSON report may be uploaded. Exact source hashes, compiler/fixture retirement,
output bounds and owned cleanup retain their existing fail-closed predicates. Old
rollback and other stale managed/native routes remain suspended. No success is inferred
until the exact compiled/managed report is actually produced and independently audited.
