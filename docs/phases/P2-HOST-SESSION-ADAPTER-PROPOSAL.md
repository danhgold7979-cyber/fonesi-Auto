# Phase2 — private host plan and retained-session adapter

Status: SOURCE IMPLEMENTATION IN PROGRESS under coordinator Coder Bin's ordinary
independent Phase2 software delegation. Independent design CLEAR at06:16 on pre-entry
SHA256 `73bee5b8ad360bb2178dce0468d5ef85e0837406a02dbb2340cb83677d354bc2`.
No native provider is installed or invoked by this source slice.
The recipient/custody checkpoints remain immutable and their evidence stays separate.

## Concrete gap and scope

Canonical P2-01/02/03/07 need an app-local, owned host adapter. Current software-only
`adb-host-lifecycle.ts` requires retired/exit-zero invocation facts even for SERVER_START
and SERVER_HEALTH. A real foreground server is alive during those operations, and an
explicitly retired Job can have a nonzero termination code. Do not fabricate exit zero
or weaken all retirement predicates to accommodate that mismatch.

Add a private fixed host-plan compiler and an injected-provider session adapter, and
version the existing lifecycle facts to distinguish an invocation from retained server
custody. Main does not wire the provider; fleet remains BINARY_UNAVAILABLE. No new IPC,
UI, binary download, executable invocation, profile adoption, credentials, port binding,
server/device operation or generic spawn interface is authorized. DISCOVER remains a
fixed unavailable operation in this adapter; existing bounded supplied-observation
registry/parser tests remain separate.

## Exact plans and separate authority

The compiler accepts only an exact snapshot of the existing version1 HostRequest
(commandId, correlationId, ownerId, operation, deadlineUtc; distinct IDs, safe integers,
no accessors/unknown fields). It returns frozen private plans with no caller path, port,
environment, shell string or additional argv:

- HOST_VERSION: VERSION plan, literal argv `['version']`.
- SERVER_START: FOREGROUND plan; the provider constructs only
  `['-L', ownedEndpoint, 'server', 'nodaemon']` from its own admitted loopback reservation.
- SERVER_HEALTH: HEALTH plan, fixed smart-socket `host:version` only.
- SERVER_STOP: RETIRE plan, retained Job operation; no argv, no kill-server/global kill.
- DISCOVER: NOT_DISPATCHED/NOT_READY (no provider handoff).

A runtime read lease proves byte custody only. Execution requires a separate private,
instance-bound opaque capability, minted through the adapter's main-only grant method
with exact owner ID plus a current-authority callback, analogous to existing lifecycle
capabilities. There is no production caller/issuer in this slice. Native-provider methods
are typed `version`, `startForeground`, `health`, `retire`, not generic spawn. The provider
must supply separately admitted endpoint/profile custody for start; no fabricated
sentinel binding or caller-provided profile is accepted. The adapter's injected tests
label these facts synthetic; no source test creates native admission authority.

### Pre-handoff attempt ownership and cleanup authority

Before VERSION or FOREGROUND can create a process, the provider must synchronously
`reserveAttempt(planKind)` and return an exact opaque instance-bound attempt token.
Reservation itself creates no process/socket/profile files and cannot execute. The adapter
stores that token before calling `version(attempt, admission)` or
`startForeground(attempt, admission)`. The same attempt identifies all process/session
handles even if start throws, times out, or only returns its live observation later.
`retire(attempt)` is available from that pre-handoff point; no returned live token is
needed to find and retire a partially started process. An absent or foreign attempt
is refused before effect handoff. No generic PID lookup or process-name kill is allowed.

Once handoff begins, a throw/rejected promise is not evidence of no process. Retain the
attempt and runtime read holder until that exact attempt proves process retirement and
endpoint absence (or an exact never-started terminal fact). If the provider cannot prove
this, close is UNRETIRED and custody remains retained. A later start result belongs to
the original attempt and cannot replace it with another token.

Cleanup-only `retire(attempt)` and actual read-holder release remain possible after
caller capability revocation, external owner loss, byte revalidation failure or close.
They use the already-held exact private attempt identity, never a fresh grant or lookup.
Such cleanup cannot call start/version/health, acquire a new endpoint/profile, adopt an
unknown process or reopen admissions. Ordinary execution callbacks still fail closed.
Tests cover thrown start after handoff, late start completion after timeout/close, and
revoked-owner cleanup with actual controlled promise settlement.

## Version2 facts and operation semantics

Replace the ambiguous internal observation envelope with a strict version2 discriminated
union; no permissive version1 fallback in the current adapter/lifecycle. Retain historical
source evidence as historical, not as current runtime certification.

INVOCATION fields: version2, kind INVOCATION, dispatched boolean, processRetired boolean,
exitCode null or bounded integer, observation null or VERSION. Successful HOST_VERSION
requires dispatched true, actual retirement, exit0 and exact VERSION observation.

SESSION fields: version2, kind SESSION, dispatched boolean, jobState LIVE/RETIRED/UNKNOWN,
exitCode null or bounded integer, endpointState OWNED/ABSENT/UNKNOWN, observation null or
STARTED/HEALTHY/STOPPED. A private opaque provider server token is held by the adapter,
not serialized into facts, public results or logs.

- STARTED requires the exact current token, LIVE/null exit and independently observed
  OWNED endpoint. The retained server is not described as retired.
- HEALTHY requires the same LIVE/null-exit token and OWNED endpoint after the bounded
  fixed health exchange. A response alone is insufficient custody evidence.
- STOPPED requires that exact Job RETIRED with an observed exit code (zero or nonzero)
  and independently observed endpoint ABSENT. Unknown retirement/endpoint is never PASS.
- A declined non-dispatch fact has null observation and cannot create, erase or transfer
  the existing server token/custody. Wrong operation/kind/extra fields fail closed.

Existing HostResult outcome/code/diagnostic fields remain fixed. No raw provider error,
path, serial, endpoint, key, stdout or stderr is returned. Provider throws/unknown facts
following handoff are OUTCOME_UNKNOWN, not NOT_DISPATCHED. ID-allocation failure remains
INTERNAL_FAILURE with null diagnostic. Read lease/facts do not substitute for audit or
live device authorization in later production integration.

## Lifetime, fencing and shutdown

One private lane reserves before callbacks. No queue and no concurrent host operation.
Capture configuration once. Request deadlines remain at most120000ms and are checked
before handoff and after observation. Every callback/await is followed by owner,
capability and internal generation fences before any effect/result publication.

Acquire/revalidate the exact runtime read holder before the provider receives a private
absolute verified path. Keep it through a live server and all actual in-flight native
promises. Setup cannot overlap. A timer ending the logical request does not retire the
underlying invocation/Job, release custody, permit another request or erase its token.
Late settlement is tracked separately; no late observation reopens closed/uncertain
admissions or silently replays an operation.

Close revokes new admissions, requests retirement only of the exact retained provider
Job, and awaits actual pending invocation plus Job/endpoint retirement. Fixed120000ms
close bound returns UNRETIRED while retaining tokens/promises/custody; actual later
settlement may finish retirement without reopening. If no server was created, no
retire call is invented. Foreign handles/tokens, preexisting endpoints and unknown
profile ownership remain refusal; no discovery or adoption fallback.

## Source evidence and future gates

Focused tests must exercise fixed plan immutability/exact fields, forged capability,
reentrant callback revocation, byte revalidation failure, setup/read exclusion, live
START/HEALTH versus retired STOP including nonzero forced exit, wrong endpoint/facts,
timeout with actual late settlement, owner loss and bounded shutdown retention. Use
controlled synthetic provider facts with actual owned runtime-byte fixtures where
composition needs them. No simulated output is called observed native behavior.

Actual Windows provider implementation/admission is a later reviewed boundary. The
existing IsolatedAdbServer.cs is a development scenario runner, not a production session
provider. Its actual standard-runner attempt refused preexisting .android before server
launch. Current upstream AOSP corroborates Windows CSIDL_PROFILE + .android and user-key
loading before vendor keys; this is not proof of an alternate supported profile redirect
for pinned37.0.1. No such redirect, credential adoption or host-security workaround is
part of this source slice. Canonical hardware/full-task/formal gates remain unchanged.

## Finite implementation refinements

HOST_VERSION is BUSY while an existing server/unknown attempt is retained: no second
process is borrowed under the single runtime holder. A synchronous private assertRead
checks the current exact holder after external admission callbacks; it grants no new
authority and does not replace full byte revalidation. Provider completion facts are
normalized once into immutable records. A late LIVE observation invalidates earlier
retirement evidence. After all in-flight calls settle, close may make one final exact
attempt cleanup-only confirmation; without terminal/absent evidence it remains UNRETIRED.

Reuse-first review: existing pinned official Google adb, runtime custody, lifecycle and
parsers are reused. No new package is installed. Execa's upstream MIT generic process
wrapper has not established the required Windows Job/endpoint/profile custody semantics
and would add runtime dependencies; it is not adopted merely for convenience. Microsoft
CsWin32 is a first-party MIT source-generator candidate for future native P/Invoke/SafeHandle
bindings, but its exact pinned compiler/dependency/community/target-fit review is still
pending; it is not part of this TypeScript-only adapter. Primary references:
[Execa](https://github.com/sindresorhus/execa),
[Execa license](https://github.com/sindresorhus/execa/blob/main/license),
[CsWin32](https://github.com/microsoft/CsWin32),
[CsWin32 license](https://github.com/microsoft/CsWin32/blob/main/LICENSE).
GitHub availability/stars are not treated as trust, license closure or adoption evidence.
