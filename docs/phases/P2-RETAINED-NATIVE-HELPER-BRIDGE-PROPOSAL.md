# Phase2 — retained native helper and private bridge source contract

Status: SOURCE ENTRY 2026-11-01 06:37 UTC under coordinator Coder Bin's ordinary
source delegation and independent design CLEAR at pre-entry SHA
`9217137a51f8800540e8254c2acf6dad075e8995bd7b829481ae875d472b3d9c`.
This is not permission to execute a helper, create a profile/key/socket, invoke ADB or
wire production availability. Exact Windows compile/execution review remains separate.

## Scope and reuse decision

P2-02 needs a real long-lived attempt behind the private HostNativeProvider interface.
Do not use per-operation PowerShell processes: they lose the process/Job/endpoint handle
that proves custody. Do not rewrite the reviewed Windows interop layer or adopt a new
package merely because it appears on GitHub.

Compile the unchanged existing `desktop/native/IsolatedAdbServer.cs` together with a
new partial-class extension. Its private Win32 declarations, Drain, QuoteArgument,
JobEmpty, listener/Job checks, fixed health exchange, native profile resolution and
bounded inventory witnesses are directly reused in the same assembly. The historical
helper's bytes and standalone behavior are unchanged. New code is limited to retained
attempt state/lifetime and fixed bridge framing; it adds no P/Invoke declaration.

A source contract test binds the original file's exact reviewed hash and checks the
extension compiles against that same class, rather than copying an untracked second
interop implementation. Native compilation is explicitly NOT_RUN on this Linux executor
(no dotnet/csc/mcs installed). A later reviewed Windows compile-only step may establish
syntax/type compatibility without launching ADB. No current source test is native proof.

No third-party dependency is added. Google Platform Tools remains the exact official
37.0.1 candidate already pinned/inspected; this helper does not redistribute it. CsWin32
remains a future candidate, not an adopted build dependency. Existing license notices
and exact source provenance are retained.

## Effect-free reservation and retained C# attempt

One provider instance, one attempt at a time; nested sealed Attempt has an internal
constructor, provider-instance identity and monotonically increasing generation.
Reserve(VERSION|FOREGROUND) is memory-only and returns before any file/process/socket
operation. It permanently owns all subsequently allocated handles, including partially
started or suspended children. No caller supplies a PID, endpoint, argv or profile path.

State: RESERVED → STARTING → LIVE or RETIRED; STOPPING/UNKNOWN are explicit. A stopping
latch is set before cancellation/retirement starts and checked under the same lock before
CreateProcess and before ResumeThread. Late start can never revive a stopped attempt.
All handle assignment belongs to that token even when admission/start throws. A failed
attempt is not silently reused; only exact proven retirement permits another reservation.

- VERSION uses the verified private runtime path and literal `version`. It does not
  reserve .android or start a server. Reuse suspended-create/Job assignment, bounded
  drains and actual exit/Job-empty observation; semantic version output is validated
  privately against the pinned candidate and installed-path equality.
- FOREGROUND uses only `-L tcp:127.0.0.1:<owned-port> server nodaemon`. The helper selects
  a bounded loopback endpoint, refuses occupied/colliding ownership and rechecks the
  actual retained PID/Job/listener before and after fixed host:version health.
- HEALTH uses the same attempt and fixed bounded smart-socket request, never a new ADB
  client, arbitrary service string or remote host.
- RETIRE is cleanup-only and remains available after caller revocation. It sets stopping,
  terminates only the retained owned Job, observes root exit/Job empty/stream retirement
  and endpoint absence. Nonzero forced exit is not failure by itself. Unknown evidence
  remains UNKNOWN/UNRETIRED; no process-name lookup or kill-server fallback.

Reuse the existing30-second startup/operation limit,10-second retirement/drain budget,
32768 UTF-16 code-unit cap per private stream,1MiB listener-table/32768-row bounds and
existing native path/handle witness checks. No cap increase to accommodate failures.
Raw process streams are never renderer/public data.
Terminal HostTransportFacts are emitted only after exact owned profile/key cleanup
(or proof this attempt never reserved a profile), all helper workers/drains/I/O have
settled, and private run-root ownership is revalidated. Job-empty/endpoint-absent alone
cannot authorize release. Failed-start and never-started paths obey the same rule.
Unresolved profile identity, cleanup or worker retirement returns fixed UNRETIRED and
retains custody, never a terminal fact that releases the TypeScript read holder.

## Unchanged profile boundary

FOREGROUND resolves the actual Windows native profile using both existing native APIs
and exclusively reserves `.android` only if absent. Any existing entry refuses before
server launch; no reads/adoption/copy of existing credentials. No USERPROFILE/HOME or
ANDROID_* redirection assumption, new identity/token/ACL/privilege, or alternate-profile
workaround. Discovery suppression remains exact ADB_USB=0/ADB_EMU=0/ADB_MDNS=0 with the
previous binary-control-flow limitation, not physical-device noninteraction proof.

The reserved directory keeps its exact owner marker and retained directory handle.
Only marker/adbkey/adbkey.pub are allowed; combined64KiB profile bound and exact witness
checks remain. Cleanup requires exact attempt retirement, full inventory/witness checks
before deletion and unchanged source/runtime ownership. Partial/changed/unknown profile
state is preserved and reported, never pruned. No persistent access is provisioned onto
any device. Standard hosted runner eligibility remains UNMET because .android exists.

The helper consumes an already-owned private run root with the existing exact marker
and profile subdirectory; it does not invent a persistent application directory scheme.
Production run-root issuance/reopen recovery and package asset admission remain later
integration prerequisites, not fabricated by a test fixture.

## Private long-lived bridge protocol

Prepare a typed bridge state/framing adapter with injected byte transport. Do not add
actual child spawning or main wiring in this slice. A later source contract must bind
the PowerShell/bootstrap/helper assets, actual parent process, run-root issuance and
package closure before installing the provider. The protocol itself is finite:

- UTF-8, no BOM, one JSON record plus LF;65536-byte maximum frame; reject invalid UTF-8,
  decoded duplicate keys at every object, accessors/non-JSON values, unknown keys and
  invalid integer ranges. No permissive trim or generic message passthrough.
- Request exact fields: version1, sessionId UUID, requestId positive safe integer,
  attemptId UUID, operation VERSION|START|HEALTH|RETIRE. Runtime/path/profile/argv are
  not request fields; they come from the separately admitted private bootstrap context.
- sessionId is minted by the main-only instance; attemptId maps to its exact C# opaque
  attempt and cannot be chosen from renderer input. Monotonic request IDs cannot replay.
  One bridge instance retains at most128 prior attempt IDs, then refuses new reservations;
  this bounds replay bookkeeping without deleting active or uncertain custody.
  The main provider reserves its local token synchronously. On the first VERSION or
  START frame, the helper reader synchronously reserves and registers the matching C#
  attempt before scheduling any effect; a second first-operation frame is refused.
  RETIRE can follow this registered attempt while its worker is pending. Unknown attempt
  IDs never create an attempt through HEALTH/RETIRE. This mapping is established before
  any asynchronous start handoff, not only after a process has been created.
- Response exact fields: version1, sessionId, requestId, attemptId, operation, result.
  result is the strict immutable version2 HostTransportFacts or a fixed error envelope
  `{code: ADMISSION_REJECTED|BINARY_CHANGED|PROFILE_REJECTED|ENDPOINT_REJECTED|BUSY|CLOSED|NATIVE_FAILED|UNRETIRED}`.
  No raw exception/path/key/stream/port/PID appears in these response records.
- At most one ordinary operation plus one cleanup-only RETIRE may be outstanding. No
  unbounded queue. The reader remains active during START/HEALTH so EOF or RETIRE can
  latch stopping before delayed start resumes. Responses are correlated and may arrive
  out of order only for these two admitted requests; no unsolicited result is accepted.
- Malformed/foreign/duplicate/oversized input closes admission and requests exact-attempt
  cleanup; it never claims no process. Main-side timeout retains the actual transport
  promise/attempt/read holder until independently confirmed retirement and settled I/O.
- EOF/parent loss revokes new work and retires the known attempt; it does not start a
  fresh helper to discover or kill an old one. Future actual bridge launch must preserve
  the parent's non-breakaway Job containment and the helper's kill-on-close child Job.
  A crashed helper is not equivalent to a positive Job-empty/endpoint-absent report.

Fixed framing/correlation tests use synthetic bytes and retained provider facts only.
The native extension's source checks/compile status are reported separately from those
TypeScript tests. No honest result may call synthetic framing tests a live native bridge.

## Exit and subsequent execution gate

Source checkpoint requires unchanged historical helper/hash, minimal reviewed lifetime
delta, exact parser/attempt/correlation/cancellation tests, registered build inputs and
closed graph/test inventories. Windows compilation, parent/bridge-loss behavior, actual
VERSION and eligible-profile START/HEALTH/RETIRE all remain NOT_RUN until the exact
compiled assets/runner/report/cleanup envelope is independently reviewed and approved.
No unchanged recipient/fleet/server campaign is rerun solely for this source proposal.
Canonical full P2 acceptance, device/AVD/physical gates and P1-06 remain unchanged.
