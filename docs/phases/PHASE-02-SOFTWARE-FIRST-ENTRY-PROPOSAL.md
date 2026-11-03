# Phase02 — proposed software-first entry and deferred-evidence map

**BOUNDED SOFTWARE SOURCE ENTRY APPROVED — 2026-10-31 19:24 UTC.**
Coordinator Coder Bin explicitly approved the first internal P2-01–P2-07 software batch
and creation of `phase-02` from the exact reviewed public base below. This approval
did not itself create the branch; the verified Nov1 creation is recorded below. No ADB execution, SDK/license acceptance, emulator
setup or device operation is authorized by this software-entry approval. It applies the adopted
[software-first amendment](SOFTWARE-FIRST-HARDWARE-DEFERRED-AMENDMENT-02.md) to the
unchanged [canonical Phase2 plan](PHASE-02-adb-device-fleet.md), not a new phase/task list.

## 1. Exact predecessor and entry request

Development branch: `phase-02`, created from the reviewed
public Phase1 closure `f8b155738e0ebbe404449579d4f4b60b911aed28`, tree
`ea1b20b62970a40df0da780591d26d844209e281`. Local equivalent closure is
`3797dae41996884f12c6d14cec89497c70776087`. Source/native evidence remains exact
`c5627b4cc18a72bcec1833ba94ca582a0673fcaf` / Windows run41232572694;
closure publication was docs-only `[skip ci]`, not another runtime test.

[Phase1 technical handoff](../evidence/P1-10-canonical-criterion-audit-2026-10-31.md)
provides the reviewed desktop, UI, contract, logging, storage/settings and internal
package foundation. Ten task scopes technically pass; P1-06 cross-user UNMET and
formal accepted count0 remain. No main merge, formal Phase0/1 acceptance or physical
hardware claim is requested. The exact Phase0 baseline remains byte-identical.

Request one coherent **internal software foundation batch** for canonical P2-01 through
P2-07: binary-admission contract, owned process/server lifecycle engine, strict discovery
and metadata parsers, identity/generation reconciliation and serialized actor logic.
Implement dependent adapters only after their software prerequisites pass; pure fixture
work may run in parallel without pretending the prerequisite is accepted. This is not
full completion of seven tasks. Remaining P2-08/P2-13/P2-09/P2-10/P2-11/P2-12 source
integration follows the canonical order with its exact interfaces reviewed before entry.
No artificial task-count increase, new denominator or per-function acceptance ceremony.

## 2. No implicit host/device authority

- No connection to this session's/user's phones, real accounts or credentials. No USB
  authorization, pairing, TCP listener on a device, driver install, SDK replacement,
  service/task/account/ACL/privilege change or emulator/acceleration setup.
- Do not use another application's ADB34.0.5 or any PATH executable. Platform Tools
  candidate37.0.1 is listed in the [official release notes](https://developer.android.com/tools/releases/platform-tools),
  checked2026-10-31. It is a research candidate, not a recorded archive/hash/license pin.
- Before a real binary is bundled or invoked, freeze the official versioned origin,
  archive bytes/SHA256, exact PE architecture and executable/DLL inventory, notices and
  applicable redistribution terms. No invented hash, silent floating-latest download or
  inference that a successful download grants redistribution permission. An unresolved
  binary/license gate yields `BINARY_UNAVAILABLE`; pure engine work can continue.
- Official SDK terms require acceptance/authority and distinguish redistribution from
  separately licensed OSS components. The current AOSP adb Apache2 notice alone does
  not establish the license closure of the exact Windows archive and DLLs. No new
  explicit SDK terms are accepted by this proposal or by source-entry approval. Bring
  the exact terms link and acceptance/download/distribution action to the coordinator
  if actually required by the selected origin/components; do not invent a universal SDK
acceptance requirement when verified applicable component licenses already permit the
action. Keep that gate separate from pure contracts/actor/registry work. Official
  metadata fetch has not established a versioned Windows archive hash or inventory.
- Any first actual Windows invocation requires reviewed exact runner/manifest and root
  execution approval. The initial candidate test is fixed `adb version`, which must not
  start a server. Server lifecycle tests need a separately reviewed bounded isolated
  host profile; no real device test follows from an owned process test.
- Wireless stays disabled pending dedicated authenticated evidence. Unicode live input
  remains unavailable pending an explicitly approved mechanism/permissions and physical
  round-trip evidence. Neither is replaced by plain `adb shell input text` guesses.
- No P106 identity retry or secret-store weakening. This batch does not consume secrets.
  Disabled live services remain truthful UNAVAILABLE in the existing V9 shell; no
  production fake rows, environment activation flag or hidden demo-to-live promotion.

## 3. Internal contracts and admission boundary

Main-only modules; no new public IPC, renderer process/path parameter, SQL migration or
live UI effect wiring in this first batch. Existing P1-11 UUID/entity separation remains:
`deviceId`, `bindingId`, `generation`, exact `serial`, plus distinct command/correlation
IDs. Generation/revision are safe nonnegative integers; overflow rejects. A display
label is never identity. Wire/schema additions for later UI integration require their
own exact review, not reinterpretation of the current four preferences methods.

The immutable transport snapshot records exact serial, observed transport ID when
available, state, observation time, evidence source and generation. States distinguish
`DEVICE`, `UNAUTHORIZED`, `OFFLINE`, `CONFLICT`, `DISCONNECTED`, `UNKNOWN`;
unknown/malformed lines are not CONNECTED. Duplicate serial/transport claims quarantine
rather than merge. USB/Wi-Fi association requires independent sufficient identity proof;
this batch provides no heuristic merge by model, label, IP or reused endpoint.

Reconciliation is a pure transition over a supplied typed registry snapshot. Durable
registry storage is explicitly not implemented by inventing a JSON file or speculative
SQL table here; its migration and recovery contract precede production wiring. Existing
identity histories must not be overwritten to resolve conflict. Every disconnect,
rebind or ambiguity invalidates the old dispatch generation and outstanding UI evidence.

Device-operation envelope: `{version:1,commandId,correlationId,deviceId,bindingId,
generation,serial,ownerId,operation,deadlineUtc}`. IDs use existing P1-11 UUID encoding;
no arbitrary executable, raw argv, shell string or renderer-supplied environment exists.
Only private code constructs fixed operation variants. Initial device variants cover
bounded metadata reads; side-effect variants are reserved, not dispatched live.
Host/server/discovery requests use a separate main-only envelope
`{version:1,commandId,correlationId,ownerId,operation,deadlineUtc}` with a fixed
HOST_VERSION/SERVER_START/SERVER_HEALTH/SERVER_STOP/DISCOVER operation union. They do
not fabricate device IDs, bindings or serials before discovery. Their private endpoint
capability comes from the server manager, never arbitrary argv or a caller-supplied
address. Device operations always require the complete current binding envelope.

Results distinguish `NOT_DISPATCHED`, `DISPATCHED_UNCONFIRMED`, `OBSERVED` and
`OUTCOME_UNKNOWN`, with a fixed code and an explicit diagnosticId field. The pure device actor reports
`diagnosticId:null` until a real main diagnostic allocator is composed; command and
correlation IDs are not silently relabeled as diagnostic IDs. The host engine accepts
a private injected diagnostic allocator, still not a claim of persisted logging. Process exit0 proves transport
completion only; `OBSERVED` needs the operation-specific validated result and current
binding/generation. No automatic replay after dispatch, timeout, actor crash or uncertain
retirement. Cancellation before dispatch can remove queued work; cancellation afterward
cannot claim undo or success. Invalid input is not echoed in logs/results.

## 4. Owned lifecycle and deterministic actor implementation

Reuse the reviewed bounded Windows process/Job containment and drain model. Capture,
timeout and cleanup facts remain separate; a free port/PID exit is not proof that a
foreign server belongs to this app. No generic `adb kill-server`, PATH lookup or
termination of an unrelated process. Server start/stop command syntax, exact local
socket endpoint, endpoint custody and supported ADB environment variables must be
frozen against the selected binary before real-host execution. Until then the engine
has an injected private transport in tests and refuses live server admission.

One actor per verified device identity. It captures the immutable exact binding and
generation at queue admission and rechecks immediately before dispatch and before
publishing a completion. Independent actors may progress concurrently; one actor never
has two dispatched device operations, including initial metadata reads; serialization
is exercised now, not deferred until input operations exist. Operation owner is a
capability, not a display
label. A simulated workflow owner blocks conflicting manual work; explicit takeover
stops admission, drains/reconciles in-flight effects and advances fencing before a new
owner can dispatch. Uncertain old work remains blocked, not silently released.

Proposed defensive buffering limits:64 queued commands per actor and1024 globally;
exceeding either returns `BUSY` before dispatch. These are bounded in-flight work limits,
not a cap on stored/visible devices or a performance promise. Discovery text is capped
at1MiB and metadata responses at64KiB each; overflow is a fixed failure, never truncated
success. Dates/counts/numbers have exact finite ranges before use. The native collector
retains existing reviewed120s/10s process/cleanup upper bounds; operation deadlines may
be shorter but never extend an expired capability or convert uncertain work to success.

Metadata values include source/time/units and `available` versus `unavailable` reason.
No missing battery/storage/resolution value becomes zero; previous values are explicitly
stale. Parse only fixed expected formats, reject XML entities/invalid binary framing in
later capture work, and keep raw serial/IP/device properties out of public artifacts.

## 5. Canonical coverage and remaining gates

| Canonical IDs | First software batch / later work | Evidence still required |
|---|---|---|
| P2-01 | Exact binary manifest/admission and package integration after trust/license pin; no source/PATH fallback | Actual reviewed Windows local-binary invocation, tamper/missing/architecture/license negatives; not yet run |
| P2-02 | Ownership/lifecycle state machine and bounded runner adapter; injected child/server fixture races | Actual approved Windows server collision/start/stop/death/retirement matrix; no foreign server kill |
| P2-03/P2-04/P2-05 | Strict discovery, explicit transport states, reconciliation/generation fencing; wireless disabled | Two physical phones through reorder/RSA/offline/reconnect; authenticated wireless separately deferred |
| P2-06 | Fixed metadata parsers and unavailable/stale model | Physical model/locale/orientation/density/battery/storage readback; no fake values |
| P2-07 | Serialized actor, operation owner, deadlines/cancellation/takeover and stale-result fences | Deterministic independent-device races plus eventual serial-labeled physical traces |
| P2-08/P2-13 | Later typed coordinate/key/text operations and approved Unicode mechanism through sole actor | Authorized reversible lab actions, exact Vietnamese/English/emoji/punctuation/newline round-trip; no silent normalization |
| P2-09 | Later atomic bounded screenshot/UI hierarchy artifacts with generation/orientation ownership | Physical captures, rotation/disconnect/disk failures and exact current-device proof |
| P2-10/P2-11 | Later typed service/UI selection/group binding and correlated diagnostics/export | Same-viewport V9 evidence and two-phone targeting; private-data canary/export path failures |
| P2-12 | Later full deterministic lifecycle fault suite, then physical execution | Two physical phones disconnect before/during/after dispatch and server restart; no false success/replay |

All physical rows remain **NOT_RUN — HARDWARE_DEFERRED**. Canonical matrix still requires
two physical phones and two AVDs, initially one AVD running. AVD/fake/hosted evidence has
its own labels; none replaces USB/OEM/wireless/Unicode physical evidence. The user can
later run a reviewed bounded collector and return sanitized results; this session does
not acquire remote access by publishing instructions.

## 6. Verification, handoff and rollback

Focused pure/adapter tests during implementation, one coherent full Phase1 regression
and new Phase2 source suite at checkpoint. Exact hosted runner/source/schema review
precedes execution/publication. Never add simulated actor/device outcomes to production
native evidence or mark a physical acceptance row PASS from software tests. Preserve
canonical P2 task IDs and the original13-task scope. Record actual source/fake/native/
physical outcomes separately, with exact SHA and evidence limits.

Proposed first checkpoint delivers source contracts/engines, strict fixture tests,
closed binary-admission boundary and a finite unresolved-evidence ledger. It does not
claim a usable live phone-control UI, durable registry, complete Phase2 or new accepted
task count. Disabled wireless is not completed wireless, and a software-criterion
technical PASS is not hardware PASS, canonical full-task acceptance or formal phase
acceptance. Later source integration remains within this same phase after exact review.
Rollback disables the new main-only adapter, retains the verified Phase1 package and
registry/effect evidence, and never resets a phone, uninstalls apps or replays uncertain
work. Main remains unmerged; prior phase branch/history remains intact.

**Coordinator source-entry decision:** APPROVED by coordinator Coder Bin, 2026-10-31 19:24 UTC,
for the exact first internal P2-01–P2-07 scope and public base
`f8b155738e0ebbe404449579d4f4b60b911aed28` only. The approval message explicitly
authorizes the `phase-02` development branch from that base, preserves `phase-01`
and `main`, and forbids interpreting this as full-task/native/ADB/SDK/device approval.
**Independent design review:** CLEAR at pre-approval-record document SHA256
`a536eb2a2157585cdc81c82ec9bfd0172aace7373cbeec7d56655127473cdb9f`.
**Phase2 branch creation:** COMPLETED. Remote `phase-02` was verified by coordinator
at 2026-11-01 02:37 UTC; local fetch verified exact public base
`f8b155738e0ebbe404449579d4f4b60b911aed28` and tree
`ea1b20b62970a40df0da780591d26d844209e281`, then local `phase-02` was created at
02:38 UTC. Prior denied-before-execution attempts remain historical, not branch writes.
The user's renewed autonomous implementation instruction authorizes routine future
phase branches after reviewed readiness; ordinary branch creation does not require
another confirmation ceremony. Technical review and concrete SDK/device/security gates
remain separate; no premature main merge is authorized.
**Phase2 source implementation:** IN_PROGRESS — bounded pure/main-only foundation batch.
**Native/ADB/physical execution:** NOT_RUN / not granted by software entry.

## November1 continuation — pure input/capture source

After the first pure foundation and bounded official-candidate version job passed,
coordinator Coder Bin directed continued independent pure input/capture source work
at03:06–03:09UTC. This extends internal source development to P2-08/P2-13/P2-09
contracts and fixture validators, not their physical acceptance or live transport.
[Exact interface and limitations](../evidence/P2-input-capture-software-2026-11-01.md).
The earlier unpinned-candidate statements in §2 are historical: current exact pins
and the restricted development invocation are in the
[version evidence](../evidence/P2-01-platform-tools-development-2026-11-01.md).
Production activation/distribution remains unresolved. A server lifecycle experiment
is separately pending: environment variables are not proof of redirecting Windows
native-profile ADB key storage, and no server command is authorized by these pure tests.
