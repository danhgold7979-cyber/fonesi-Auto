# ADR-0006 — Foundation IPC admission and bounded public capability

**APPROVED FOR BOUNDED IMPLEMENTATION — 2026-10-31 04:06 UTC.**
Proposed 04:02 UTC; independent design review CLEAR before coordinator approval.
Applies to canonical P1-02 on `phase-01`, not a new task hierarchy. Root's delegated
technical review may approve this decision; no product change or further user grant
is presumed necessary for a requirements-preserving implementation choice.

## Requirement trace and explicit gate disposition

- [C-03/C-04/C-05](../16_ACCEPTED_PRODUCT_DECISIONS.md): unattended certified work,
  exclusive device/workflow ownership, Electron/TypeScript/React and unchanged V9.
- [P1-02](../phases/PHASE-01-desktop-foundation.md): isolated main/renderer/preload,
  bounded versioned health/settings IPC, validated sender/payload and denied native
  command/path/secret access; lifecycle and Windows packaged evidence.
- [AC-01](../05_ACCEPTANCE_AND_RISKS.md): secure IPC and no renderer shell execution.
- [Architecture §3.1](../02_TECHNICAL_ARCHITECTURE.md) and
  [ADR-0004](ADR-0004-runtime-data-contracts.md): semantic validation, deadlines,
  revisions, ownership/fencing and honest cancellation/outcome semantics.

The G0-12 extra immutable-document objective remains **20/21 FAIL**, unchanged.
[ADR-0005](ADR-0005-renderer-navigation-containment-PROPOSED.md) A's use of that
objective as a blanket foundation-code blocker is narrowly superseded by the
04:06 UTC approval of the bounded admission contract below. B's stronger
per-Document/pre-observation revocation proof remains unproved; proposed intent-only
C is not adopted. No lab assertion/result is renamed or changed to PASS. Original
Phase 0 baseline and twelve unchecked exits remain untouched; full Phase acceptance
still needs explicit disposition of outstanding gates, not this technical decision alone.

The earlier [zero-bridge P1-02 proposal](../phases/PHASE-01-P1-02-S-AUTHORITY-FREE-PROPOSAL.md)
remains the historical scope/evidence of CI7. The 04:06 UTC approval explicitly supersedes its no-preload/no-IPC exclusion
**only for the two public methods below**; AGENTS/playbook/current entry notices
were updated before source edits. It does not
expand device/account/secret/persistence authority or erase the old zero-bridge proof.

Neither the canonical task nor accepted C-05 requires proving genuine human intent
from renderer events. This does not license arbitrary renderer-originated effects:
main must independently authorize each operation against owned semantic state.
Full manual controls are preserved for their canonical device/workflow phases,
not removed, permanently disabled or replaced with routine native confirmation prompts.

## Trust model and session lifetime

Treat all renderer requests as untrusted, including requests from the packaged UI.
A main-owned session record binds one owned WebContents, its main frame, allowed
app origin and exact canonical app URL. It is a **view-session**, never a claim of
Document incarnation identity. No renderer value can select another session.

State: INITIALIZING → ACTIVE → REVOKED → CLOSED, never reverse. Main creates it
before the one controlled initial load, with lifecycle listeners installed before
loadURL. Count only that intended first main-frame load; requests while INITIALIZING
deny. Repeated or unexpected initialization loads revoke rather than replace it. Arm once
only after that load's successful completion and current owned main-frame/origin/
URL checks. Unexpected/repeated initialization navigation fails closed. After arming,
observed navigation start (including same-URL reload), renderer loss/crash, window
closure or explicit disposal synchronously latches REVOKED before other work. Do not
call stop() inside navigation observers. Never rearm on did-finish-load, URL return
or renderer handshake. A fresh main-created window is a new session.

At every handler admission validate: exact owned sender, nonnull senderFrame,
main-frame association, browser-derived origin equal to `auto-foundation://app`,
exact current URL `auto-foundation://app/status.html`, ACTIVE state, method and schema.
Origin and frame equality are not Document identity; inherited about:blank and
same-origin document.open do not establish a new independently trusted principal.
The URL restriction and observed latch are additional denial conditions, not a proof
that no transition can occur before main observes it.

Capture the main-owned session generation at admission. Immediately before result
construction/return, recheck ACTIVE and captured generation; avoid awaits in these
fixed read-only handlers. Any future asynchronous adapter must revalidate after
its await at its actual commit/admission point, not merely in the outer IPC wrapper.
No replay/retry/rearm follows navigation or timeout. No external effect is exposed
by this contract, so no cancellation can falsely claim an already dispatched effect
was undone. Future actor dispatch must validate current ownership/generation/fencing,
retain already admitted effect identity and reconcile UNKNOWN outcomes (C-04/C-14).

## Exact P1-02 wire contract

One private channel `foundation:request:v1`; preload exports only frozen
`foundation.health()` and `foundation.settings()` wrappers. No generic invoke/send,
Electron event, channel selection, callback registration, filesystem or process API.
Preload is sandbox-compatible; Node remains disabled in renderer and context isolation,
webSecurity, sandbox and existing resource/permission/download/window controls remain.

Transport payload is a JSON **string**, at most 512 UTF-8 bytes, before JSON parsing;
reject nonstrings, then UTF-16 length over 512, then UTF-8 byte length over 512
before parsing. This caps parser input, not Chromium's
prior IPC transport allocation or hostile in-process objects. Use duplicate-key-aware
strict parsing (no new dependency unless separately reviewed). Decoded shape is an
exact plain record with three own fields, no arrays/additional keys:

| Field | Exact accepted value |
|---|---|
| version | integer 1 |
| requestId | 1–32 ASCII `[A-Za-z0-9_-]` characters |
| method | `health.get` or `settings.get` |

Request IDs are correlation only, not authorization or proof of uniqueness; never
log arbitrary caller IDs. Repetition may read the same public state but cannot create
an effect. No payload/device/account/path/secret fields exist. Preload owns a bounded
monotonic request counter per instance; main still treats supplied IDs as untrusted.
At most 8 simultaneous admitted requests per session; excess returns BUSY, with
counter release in finally. Disposal clears/cancels app-owned queued work, not
already-sent Electron replies. A synchronous final check cannot retract a public
response already handed to transport.

Preload additionally permits at most 8 unsettled native invoke promises and a
2,000 ms caller-visible deadline per request; timeout returns fixed TIMEOUT, never
retries, and discards any later response. A timed-out invoke retains its occupancy
slot until the underlying promise settles, so repeated timeouts cannot evade the
preload cap. Disposal marks all app-owned requests unavailable and suppresses late
callbacks; it does not pretend to cancel native transport work. These are app-level
bounds, not a global Chromium IPC/backlog or hostile-renderer memory guarantee.

Response is a bounded JSON string (maximum 1,024 UTF-8 bytes), exact variants.
Preload requires byte-for-byte canonical own-producer JSON.stringify serialization
with the field order below; alternate whitespace/order and duplicate keys reject.
Reconstruct only validated fixed public values, never forward arbitrary native data:
- Success: `{version:1, ok:true, requestId, result}`. Echo requestId only after its
  syntax validates; it is not a log/export sanitization guarantee.
- Error: `{version:1, ok:false, code}`; no caller values, exception message or stack.
- `health.get` result: `{kind:'health', status:'READY', services:'UNAVAILABLE'}`.
  READY means this bootstrap/bridge can answer, not device/platform readiness.
- `settings.get` result: `{kind:'settings', revision:0, persistence:'NOT_PERSISTED',
  theme:'LIGHT'}`. This initial default follows the canonical V9 reference (line 388: light
  when no stored theme exists), not a stored user preference or V9 theme acceptance.
  Only the semantic default is reused; no reference JavaScript is ported. No mutation method is exposed.
  P1-07 must version/extend the contract for accepted theme semantics and persistence;
  a read-only revision zero never implies a completed settings service.

Fixed error codes: INVALID_TRANSPORT, PAYLOAD_TOO_LARGE, INVALID_JSON,
INVALID_SHAPE, UNSUPPORTED_VERSION, UNKNOWN_METHOD, UNTRUSTED_SENDER,
SESSION_UNAVAILABLE, SESSION_REVOKED, BUSY, TIMEOUT, INTERNAL_FAILURE. Method errors disclose
no capability inventory beyond the two documented public methods. Main catches
failures and returns a fixed code; no raw input or exception reaches logs/results.
Future mutations require explicit expectedRevision and main-owned compare-and-swap;
no mutation/revision scheme is silently added now.

## Concrete source and dependency plan

Extend `desktop/src/main.ts` with owned bridge/session disposal; add strict pure
`ipc-contract.ts`, `view-session.ts`, sandboxed `preload.ts`, minimal `renderer.tsx`.
Use the existing diagnostic owned asset as the mount, not a redesigned V9 screen.
React initially displays truthful NOT_READY/UNAVAILABLE and makes no automatic
mount/useEffect request or retry. Two diagnostic read controls invoke the methods
only on explicit test/user action; an early click may truthfully return
SESSION_UNAVAILABLE. The Windows probe waits for main-owned ACTIVE observation
before its positive call. Renderer events never arm the session; no new readiness
event bridge is introduced. This diagnostic interaction is not the future V9 UI.
Add exact owned emitted JS assets to the asset map/CSP/build manifest; no wildcard
protocol/filesystem resolution or remote content. Existing zero-authority bootstrap
evidence is historical; new bridge evidence must honestly test its new configuration.

Reuse exact reviewed Electron45.1.0, Node24.22.1, TypeScript7.0.2, esbuild0.28.2,
Node types24.19.2. React/react-dom/@types/react/@types/react-dom **19.3.0** come only
from the existing reviewed `tools/phase-00/desktop-stack-lab/package-lock.json` closure,
with provenance/integrity/license and lifecycle-script review before scripts-disabled
restore. No new dependency guesses or compiler/scanner shortcuts. Existing immutable
foundation validator APIs are not silently repurposed as this wire parser.

## Required tests and bounded Windows evidence

1. Pure exact-schema positive and all error variants: unknown/duplicate/extra keys,
   nested/nonstring/null/array, nonfinite/fractional version, invalid IDs, over-limit
   multibyte input, unsupported version/method, size exact-boundary and fixed output.
2. Session transitions: initialization rejects; one arm only; navigation/reload/close/
   crash revokes; return cannot rearm; queued synthetic read released after revocation
   denies; wrong generation and 9th concurrent request reject; counters clean up.
   Preload deadline/late response, repeated timeout saturation and disposal tests
   prove no retry, no late application delivery and no early native-slot release.
3. Real source/package main+preload+React positive: fixed health/settings response,
   no generic bridge, no Node/process/secret APIs, isolation and restrictive assets.
4. Actual wrong window/subframe/origin, malformed wire, command/path/secret field
   requests deny. Original-window about:blank/reload/document.open tested separately;
   observed transition and denial are recorded, not forced into immutable-URL PASS.
   Direct main handler tests prevent absence-of-bridge from masquerading as denial.
5. Close/reopen/crash and manifest-tamper behavior retain bounded owned Job execution,
   orderly exit versus forced retirement, fixed sanitized output, all directory cleanup.
   No real devices/accounts/credentials/native effect sink are introduced.

Use the existing reviewed Windows envelope and strict artifact discipline, updating
case names/schema explicitly rather than silently reusing the old zero-preload
predicate. No full P1-02 acceptance until its remaining contract/tooling review and
required new Windows evidence pass. Target-host ZIP and device tests remain distinct
support/activation gates, not prerequisites to this public bridge source development.

## Approval and remaining risks

Coordinator approved this exact bounded technical scope at 04:06 UTC under delegated
Auto implementation/plan authority. This approval supersedes the two narrow exclusions
identified above; it does not accept old gates or full tasks. Exact bootstrap arming,
session event coverage and IPC ingress limit behavior need implementation/source tests;
no universal document revocation, memory-bound IPC or compromised-OS guarantee is made.
Future service authority is separate: method-level identity/resource/revision checks,
serialized actor admission, durable ownership/fencing and uncertain-effect recovery.
A compromised allowed UI may request its allowed operations; actor fencing alone does
not prove human intent or make unsafe allowed operations safe. Each later capability
must have its own threat/semantic authorization review without cutting V9/C-03 scope.

## Pinned source basis

Reviewed 2026-10-31: Electron45.1.0 [security guidance](https://github.com/electron/electron/blob/v45.1.0/docs/tutorial/security.md)
requires isolated/sandboxed renderers and sender validation; its sender section
recommends browser-derived origin rather than treating URL as a principal.
[IpcMainInvokeEvent](https://github.com/electron/electron/blob/v45.1.0/docs/api/structures/ipc-main-invoke-event.md)
allows senderFrame to become null after navigation/destruction. These support
fail-closed checks, not request-time Document identity or a navigation-notification
flush. ADR-0005's exact-source lifetime/ordering limitations remain applicable.
The current bootstrap [CI7 evidence](../evidence/P1-02-windows-envelope-source-2026-10-31.md)
proves zero-bridge source/package behavior only; adding this bridge requires its
own reviewed actual runtime evidence.

Approval recorded before source: public read-only health/settings, precise session/
preload/transport bounds, reviewed React closure, negative tests and owned Windows
envelope only. Startup diagnostic uses explicit reads after main-owned arming,
not mount effects, retries, renderer arming or a generic readiness event bridge.


## Scoped compatible amendment — P1-04, 2026-10-31 06:07 UTC

Coordinator approved the [P1-04 logging contract](../phases/PHASE-01-P1-04-LOGGING-CONTRACT.md).
V1 wire/channel semantics remain unchanged and regression-tested. V2 adds only
main-generated diagnosticId and AVAILABLE/DEGRADED logging status to the same two
public reads, with exact nullable rules and bounded canonical responses. Preload
wrappers remain Promise<string>; null IDs render diagnostic reference unavailable.
Both channels share admission/session limits; no log-write/read/export/hold method,
caller metadata authority or fallback negotiation. Existing security/lifecycle
checks and old failed immutable-document objective are not waived. Main-owned log
I/O belongs to the approved logging sink only, not a renderer filesystem service.

## Approved bounded preferences amendment — 2026-10-31 11:55 UTC

Coordinator approved the exact independently reviewed [P1-07 settings contract](../phases/PHASE-01-P1-07-SETTINGS-CONTRACT.md)
for a separate `foundation:preferences:v1` channel: read/update/reset/restorePrevious
of nonsecret UI preferences only. Legacy v1/v2 public wire contracts remain unchanged.
The grant requires shared preload occupancy, exact schemas/CAS, observed view-session
revocation and final COMMIT admission, native confirmation for reset/rollback, and
truthful timeout/late-result semantics. It does not claim immutable Document identity
or genuine human intent. Main-only window geometry uses distinct owned-window/lease
admission through shutdown. No credential/device/job/path/SQL service is exposed.
P1-06 cross-user UNMET and formal dependency/Phase 0 gates remain unchanged.
