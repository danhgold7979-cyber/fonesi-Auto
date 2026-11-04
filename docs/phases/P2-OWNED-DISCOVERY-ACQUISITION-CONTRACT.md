# P2-03 — Owned discovery acquisition contract

Status: **SOURCE ENTRY APPROVED — 2026-11-01 19:35 UTC.** Independent design CLEAR
binds pre-adoption SHA256 `3393f15f43c3bc4ab12822995cd75d7aafbdcb868134d2567f6da6ee7eac74ac`;
implementation proceeds under the coordinator's original-scope source delegation.
This is a finite source-only continuation of [private ingestion](P2-DISCOVERY-INGESTION-CONTRACT.md)
and [retained server integration](P2-RETAINED-SERVER-INTEGRATION-CONTRACT.md), not
permission to launch a server, access a profile, enumerate connected devices or run
a native campaign. [Canonical P2-03](PHASE-02-adb-device-fleet.md) physical evidence
and the actual fresh-profile P2-02 prerequisite remain open.

## 1. Missing boundary and fixed protocol

The retained foreground server can establish owned health, but exposes no discovery
acquisition. Existing ingestion deliberately admits only synthetic providers. Add
one owned read-only host-service request to that exact already-live server attempt;
no executable invocation, auto-start, device targeting, transport selection, tracking
subscription, USB pairing, shell command, metadata/input/capture or main activation.

The pinned [Android SERVICES.TXT](https://android.googlesource.com/platform/packages/modules/adb/+/7799b4ba18dd0fc0298ccac65014ca533dacbddd/SERVICES.TXT)
documents devices-l as a one-shot host listing: OKAY, four hexadecimal length bytes,
payload and connection close. Implement that framing, not the CLI display header.
The exact outbound bytes are ASCII `000ehost:devices-l`; there is no caller-supplied
command or endpoint. The destination is the retained attempt's already-owned
127.0.0.1 port, never default5037/PATH/environment or an arbitrary address.

Maximum payload is **32768 bytes**, a defensive acquisition limit, not a fleet-capacity
promise. Zero bytes is a valid empty server list. Reject malformed hex, declared
length above the limit, short payload, extra bytes after the exact payload, missing
EOF, FAIL/unknown status, invalid UTF-8, BOM/NUL and malformed rows. FAIL message
bytes are not logged or returned. No replacement decoding, trimming, truncation,
partial-list success or invented CLI prefix.

## 2. Parser reuse and immutable facts

Add `parseAdbServerDiscovery(raw: unknown)` in `adb-discovery.ts`. It accepts the
actual server payload string (including empty), shares the existing row/token/state/
duplicate-preservation logic, and enforces the32768-byte server bound. Preserve
`parseAdbDiscovery` CLI header/1MiB semantics and its historical tests. Factor row
validation internally rather than concatenate a fake header. Unknown well-formed
states remain UNKNOWN; serial/model/path text is not identity proof.

Decode payload once after exact native framing and canonical base64 validation.
Descriptor-snapshot immutable result facts at their own settlement, retaining the
current ingestion's separate result/retirement obligations. Use empty proofs.
All discovered identities remain provisional unless a separately admitted identity
resolver later supplies real evidence; this increment adds no such resolver.

## 3. Exact private wire extension

Keep existing request/response version1 and INVOCATION/SESSION fact grammars unchanged
for VERSION/START/HEALTH/RETIRE. Add a separate DISCOVER request shape, version2:

```
{version:2,sessionId,requestId,attemptId,operation:'DISCOVER',deadlineUtc}
```

UUID/request-counter grammar stays existing; deadlineUtc is a safe UTC integer and
must be future/current, with remaining duration at admission no greater than30000ms.
The reader captures remaining time once into its monotonic elapsed budget. Rechecks
never restart that budget. The ingestion's original deadline includes all preceding
admission/audit time; no new full timeout is granted by bridge/native handoff.

Use one existing bridge request counter across both version1 and version2 frames;
IDs cannot overlap or restart at a version boundary. Bound DISCOVER to128 admitted
queries per foreground attempt; exhaustion refuses before socket/provider handoff
and never allocates another server attempt.

The matching outer response is exact:

```
{version:2,sessionId,requestId,attemptId,operation:'DISCOVER',result:{
  version:1,kind:'ACQUISITION',status:'COMPLETE'|'FAILED'|'UNRETIRED',
  code:'OK'|'ADMISSION_REJECTED'|'BUSY'|'CLOSED'|'DEADLINE'|
       'DISCOVERY_REJECTED'|'NATIVE_FAILED'|'UNRETIRED',
  dispatched:boolean,operationRetired:boolean,
  payloadBase64:string|null,observedAtUtc:number|null
}}
```

COMPLETE requires OK, dispatched:true, operationRetired:true, canonical base64 of
0..32768 bytes (empty string allowed), valid byte framing/UTF-8 and bounded observation UTC. Native COMPLETE attests byte
acquisition only; TypeScript must separately accept row semantics before ingestion
or fleet publication. No duplicated native row/identity parser is added.
FAILED requires a non-OK/non-UNRETIRED code, operationRetired:true, null payload/time;
dispatched states whether this owned socket exchange began. UNRETIRED requires code
UNRETIRED, operationRetired:false, null payload/time; dispatched remains observed.
Native observedAtUtc is captured only after exact payload plus remote EOF, within
the original admitted request start/deadline inclusive and nonregressing against
prior observations of this epoch. Node does not replace it with delayed handoff
time. Result handoff requires both the actual request write callback and a full
validated matching response; a received LF does not prove remote Flush completion
or worker retirement. Native operation-retirement covers the acquisition socket,
connect completion and native query workers only. Remote serializer/Flush, reader
and output workers remain obligations of the helper/outer lease; neither LF nor
query retirement proves those workers retired.

Unknown/contradictory tuples, duplicate keys, mismatched request/session/attempt,
extra fields and duplicate responses refuse. These are **not SESSION facts** and
cannot release the live server runtime read holder or make STOPPED/retired claims.

Canonical base64 length at32768 decoded bytes is43692, leaving the exact JSON frame
comfortably below existing65536-byte private frame cap; validate both decoded and
whole encoded limits before allocation. Require decode/re-encode equality, including
padding, rather than permissive Node base64 decoding alone. No frame-limit increase.
No public renderer contract, logging schema or exported diagnostic payload is added.

## 4. Owned socket and worker lifetime

Native API: `RetainedProvider.Discover(Attempt attempt, long deadlineUtc)` returns
a separate immutable `AcquisitionReply.Snapshot()` with the exact fields above;
existing `Reply` SESSION remains unchanged. Reader `IProvider.Discover(object,long)`
delegates the same attempt and never calls Reserve. Entry uses the existing
`Enter(a,"FOREGROUND",false)` shared lane.

DISCOVER is admitted only in SERVER_ONLY, same READY/nonbusy foreground attempt,
with the original retained runtime read observation, expected install revision,
bootstrap/owner/lease/profile/listener/process checks. VERSION_ONLY default remains
unchanged; discovery cannot reserve/start a new attempt. A separate request attempt
ID or another factory instance cannot reuse this server capability.

The adapter shared lane is mandatory, not optional: typed acquisition uses the
SAME granted foreground capability and one-ordinary-operation state. HEALTH and
DISCOVER cannot overlap. The server-service lane also spans pending INTENT/RESULT
audit, so releasing an adapter call before its service receipt cannot allow a query
to race that audit. No direct bridge/factory discovery path bypasses this service lane.
RETIRE remains independently preemptive. Preserve the existing bounded two-output
writer capacity and BUSY refusal; do not add a deferred query queue or unbounded
response buffer. Register the exact acquisition socket and
worker with the attempt before connect; retirement closes only that owned socket,
then waits its worker alongside existing owned server cleanup within existing
budgets. No unrelated endpoint is closed and no host:kill is sent.

Success requires exact payload plus remote EOF, actual local socket disposal and
actual worker settlement, including any pending asynchronous connect completion
and its completion callback/EndConnect accounting. Use the BCL
Task.Factory.FromAsync pattern around BeginConnect/EndConnect exactly once; reserve
the pending registration before issue so synchronous completion or RETIRE cannot
lose it. Retain the task after socket disposal until EndConnect has settled; closing
an AsyncWaitHandle is not retirement. No new native P/Invoke is required. Closing/disposing a socket is
not itself evidence that BeginConnect or its worker has settled. Do not inherit
an unchecked pending-connect retirement shortcut from health code. Publish
ACQUISITION only after those facts hold, not upon
read callback, timeout, cancellation request or partial frame arrival. The bridge
maintains separate operation-retirement and live-server-session state. A complete
query releases only its operation lane; the retained server/custody token stays live.
It must not set the bridge/adapter foreground attempt terminal, imply processRetired,
or release the original read holder (the live process remains unretired).

Deadline/RETIRE closes the specific in-flight socket to unblock its worker. If
worker/socket/connect retirement cannot be established, emit/latch UNRETIRED and
retain the exact socket/connect/worker registrations and pending promises; cleanup
closes the registered socket before the existing workers-wait loop (not after it),
without holding the attempt gate across blocking I/O. Never set a worker count to zero or
drop its registration while asynchronous connect completion/callback is outstanding; do not publish acquisition success or a clean overall close.
No repeated query or restarted deadline. Any native query FAILED (including native
BUSY/deadline) or UNRETIRED permanently revokes this discovery epoch and immediately
starts factory cleanup; it is not eligible for a retry on the same epoch. A local
service-lane BUSY before native handoff is only a refusal, not fabricated native
failure. `ingestion.close()` fences publication and drains its retained promises;
`factory.close()` is the explicit socket/server preemption path, invoked by the
provider on native failure and by server-service stop/close. Ingestion close alone
does not claim it terminated the server. Whole factory close still accounts for
protocol writer/reader/server workers and real Job retirement, not just this socket.

## 5. Native provenance issuer and ingestion composition

The server service is the sole native ingestion-brand issuer and owns its private
provider WeakMap. The factory separately recognizes its real instances and exposes
only a low-level same-capability acquisition accessor, not an ingestion brand.
The native route may use only a `createHostFactory` instance constructed using
its default realBindings path; any explicitly injected Bindings instance remains
synthetic/test-only and cannot mint ADB_DISCOVERY provenance. There is no public
source boolean, supplied callback that claims native, or structural factory token.

The service's private issuer binds its actual factory/grant, original entry/lease,
live attempt token, exact
runtime observation/install revision, owned endpoint and one discovery epoch.
The provider is recognized by private identity, not by copied properties. Its
assertion uses the existing actual retained-session/custody fence; no second runtime
lease. Factory close, observed server death/retirement, observed runtime/custody loss or
owner revocation synchronously invalidate its private epoch **when observed** before
late publication. This is observed-at-time evidence, not instantaneous OS death
detection; no watcher or polling service is added. It cannot be
reissued for another attempt without a fresh disconnected RegistryStore startup.

Freeze the private API as follows:

- `AdbServerService.discoveryProvider()` is a synchronous main-only accessor available
  only after a successful START with this controller's captured ordinary grant.
  It returns one opaque provider registered in the **server-service-owned WeakMap**,
  not a factory/token/endpoint. No public IPC or main wiring calls it here.
- The service constructs and captures the provider's `begin(request)` itself. It
  reserves its own existing active lane before any callback and keeps that lane
  through acquisition result/retirement publication, including pending ordinary
  audit. It runs its captured session/owner/clock and final retained-token fences.
  No exported registration, caller-supplied source selector, ordinaryAdmission
  callback or lane hook can mint the provider brand.
- Pending HEALTH/START/STOP audit produces a known local pre-handoff refusal using
  the existing settled provider FAILED result (raw/observedAtUtc:null, both truncation
  flags:false) plus exact frozen `{status:'RETIRED'}`. Ingestion maps it to
  NOT_COMMITTED/PROVIDER_FAILED. No native response is fabricated, no throw from
  begin is used, and no native epoch cleanup is triggered. Private handoff state
  distinguishes this from native BUSY/FAILED, which revokes and starts cleanup.
- `factory.acquireDiscovery(capturedGrant, request)` is the low-level typed accessor.
  Factory checks its actual private real-instance registration, SERVER_ONLY scope,
  exact granted capability, current foreground attempt and retained runtime custody.
  It calls the actual adapter and returns private acquisition facts/settlement only;
  it does **not** mint or expose an ingestion-provider brand. Even a direct factory
  caller cannot obtain a service-admitted provider through this accessor.
- Ingestion imports read-only `inspectOwnedDiscoveryProvider(provider)` from
  **server-service**, not factory. This function recognizes only the service's private
  WeakMap and returns the sealed assertion/acquisition/epoch interface, with no
  registration operation. The graph is acyclic: ingestion→server-service→factory;
  factory/server-service do not import ingestion. Synthetic providers keep their
  separate existing issuer.

The adapter gains typed `acquireDiscovery(capability, request)` on the existing
foreground capability, sharing its ordinary lane/current read holder. The service
uses its own captured grant, never a second capability or lease. ACQUISITION is not
coerced into HostResult/SESSION. Service close tracks its actual pending acquisition
and audit obligations while factory cleanup/preemption starts immediately; it does
not wait for that service lane before closing the owned socket. The server service's
ordinary authority remains decisive even while cleanup ownership is valid, and
captured callbacks cannot reopen revoked admission. No new generic hook abstraction
is introduced.

Ingestion branches by privately registered provider kind, not caller fields:
synthetic retains existing CLI fixture parser/source; owned acquisition uses actual
server payload parser and ADB_DISCOVERY only after exact acquisition facts and
operation retirement. Preserve durable CAS, pre-COMMIT final internal epoch fence,
exact known receipt semantics, close tracking and no identity proofs. A native
provider result does not itself confer device VERIFIED/current dispatch authority.

Before ingestion admission capture actual attempt/epoch and deadline; before COMMIT
and publication validate the same retained epoch and custody. Final internal checks
follow all external callbacks. A server lost during RESULT cannot erase a known
COMMIT; return COMMITTED/projectionCurrent:false and withhold fleet currentness.

A committed current native-source snapshot may satisfy the existing FleetService
projection predicate, but no main or renderer is wired to this provider here. Tests
with injected managed/JS providers remain labeled synthetic acquisition-policy
composition; native provenance-positive tests require explicitly transformed
verification-only admission or a separately reviewed real campaign, never a public
production bypass. This slice does not claim real phones, identity proof or live UI.

## 6. Files, audit/privacy and proof freshness

Expected narrow source files:

- `native/RetainedAdbSession.cs`: retained socket acquisition/worker custody.
- `native/RetainedAdbProtocol.cs`: exact DISCOVER framing/scope/retirement, disjoint facts.
- `src/main/adb-host-bridge.ts`: strict response/tuple/base64 binding and query retirement.
- `src/main/adb-host-factory.ts`: actual retained attempt identity and low-level acquisition admission.
- `src/main/adb-host-adapter.ts`: mandatory shared-capability acquisition lane,
  separate typed result/retirement; no generic commands or lifecycle-result coercion.
- `src/main/adb-server-service.ts`: sole private provider issuer/accessor, same ordinary lane and
  captured grant/session fences; no main activation or extra persistent audit schema.
- `src/main/adb-discovery.ts` and `adb-discovery-service.ts`: shared server parsing and
  privately admitted provider composition. Existing RegistryStore/Coordinator fences
  should not need redesign or another migration.
- Corresponding focused tests and `tests/fixtures/RetainedAdbProtocolFixture.cs`;
  parent owns managed harness/provenance hashes/build-map/test inventory changes.

Private raw list/base64 contains serials and endpoints: it stays on the owned private
pipe and in bounded memory. It is never stderr/progress telemetry, persistent audit,
renderer response, public artifact or sanitized report. Reuse durable RECONCILE
INTENT/RESULT for commit; retain exact fixed local refusals for earlier failures.
No claim of secure erasure or audited native failure where no such record exists.

Any C# helper/protocol change invalidates the prior exact managed19 evidence as proof
of the changed helper. Preserve it as historical only. Rebuild and execute the new
managed fake-provider fixture under a separately reviewed bounded gate before
claiming managed PASS; source tests alone are not managed execution. Historical
VERSION/server campaigns retain their exact old-source attribution. Default VERSION
and prior server behaviors receive compatibility tests, not assumed compatibility.

## 7. Coherent focused test checkpoint and remaining gates

Managed tests must exercise the **real framing/read algorithm** through a pure
in-memory byte-channel seam with deterministic read/connect/EOF settlement; returning
prebuilt fake COMPLETE facts alone is insufficient. Keep the production socket adapter
as the only real endpoint implementation and bind the same framing function to it.
The internal fixed `ReadDevicesList(byteChannel,capturedBudget)` seam exposes bounded
Send/Receive/EOF, never a destination or service argument. It sends the literal,
checks length before allocation, consumes exactly that payload then performs a
one-byte EOF probe. Recheck the same absolute remaining budget before/after every
partial I/O; no per-Receive timeout reset. Shared strict UTF-8/BOM/NUL checks precede
TypeScript row validation. Final native owner/live/listener/profile/runtime checks
and operation settlement remain mandatory around this framing seam.
Fake provider tests separately exercise protocol scheduling and custody, not framing.

Managed fake-provider/controlled-memory-stream tests: exact request literal; zero,
normal, duplicate, unauthorized/offline lists; bad status/hex/UTF-8/base64/length;
short/extra/missing EOF; slow partial reads; socket exception; expiry before and
during read; RETIRE preemption; worker-unretired refusal; HEALTH/query serialization;
request-ID/attempt mixing across v1/v2, late/duplicate frames,128-query exhaustion
and two-output cap. Explicitly test pending HEALTH RESULT audit versus query
admission; native failure revokes once and initiates cleanup; held connect callback
prevents operation and whole-factory retirement even after socket disposal. Known cleanup facts
must come from the fake provider's actual controlled settlement, not set true by the
reader. Retain old VERSION and SERVER lifecycle fixture cases.

JS/actual owned SQLite composition: parser parity without fabricated header;
canonical byte limits; acquisition completion distinct from server retirement;
forged/cross-factory/injected-binding issuer denial; epoch revoked during pending
read, audit INTENT, final COMMIT callback and RESULT; immutable row observation;
known COMMITTED but unavailable after late loss; synthetic history still refused
by Fleet; original runtime holder remains until actual STOP and cannot be released
by a successful query. No second query after deadline/close and no automatic replay.

This checkpoint is SOURCE ONLY until separate execution disposition. Real owned
fresh-profile server→query→EOF→close, actual process-tree cleanup, two physical-phone
isolation/reconnect, identity proof and public fleet activation remain explicitly
NOT_RUN/UNMET. No task or phase acceptance changes follow from this proposal.

## 8. Refreshed managed-only gate (source preparation)

The same coherent checkpoint prepares one default-off `run_discovery_managed` /
`[discovery-managed]` workflow job after mandatory source checks. It uses the existing
fixed Framework compiler, references, suspended owned Job supervisor and strict
owned temporary-output cleanup. Compile the four exact production C# inputs and
one fixed fixture, then invoke only RunAll8, RunVersionExpectations2, RunServer9 and
RunDiscovery8:27 groups total. The shared byte-reader is exercised with controlled
in-memory channels, not a native endpoint. No actual retained provider is
constructed; the pure nested deadline budget does not create a provider or socket.
Fixture lock/connect settlement cases use controlled synchronization/tasks and
read-only reflection of the private managed reader, not native process effects.

The only permitted outputs are finite compiler/fixture diagnostics and one strict
managed-v4 JSON report bound to ten exact current source/harness hashes. Unknown
compiler/fixture retirement prevents cleanup and PASS. Historical v1/v2/v3 tables
stay byte-bound; the new job requires v4/27 and cannot relabel old managed19. Other
native workflows remain suspended. No official archive, Electron launch, ADB
invocation, server/profile method, socket, phone or production activation belongs
to this gate. Final implementation, exact pins and runner require independent
closure before execution under the existing authorized Auto build/test scope.
