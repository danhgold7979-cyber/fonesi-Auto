# Proposed recipient setup integration

Status: SOURCE ENTRY APPROVED — coordinator Coder Bin, 2026-11-01 05:21 UTC,
against reviewed pre-adoption SHA256 `278212f8a5e8c6be665bdacb18ed5d6b0d13a278412d2adaafa09f79823e0e87`.
Actual host setup execution still requires the exact reviewed runner; no server/device/runtime activation is granted.
This is the next bounded integration of adopted [Amendment03](PLATFORM-TOOLS-RECIPIENT-PROVISIONING-AMENDMENT-03.md),
not redistribution, server/device authority or a change to canonical acceptance counts.

## User interaction and authority

Add one compact action/status surface inside the existing V9 Help/settings dialog,
not a new page, fake device list or application menu. Renderer requests only a main-owned
setup interaction; it never supplies a path, URL, digest, terms decision or grant.
The main-owned native dialog presents Cancel as default and explains: optional ADB,
first-setup network requirement, exact pinned37.0.1 origin, no Auto redistribution,
recipient SDK terms/entity authority and no server/device action. A subsequent native
choice selects direct official download or the native file picker. File selection is
not terms acceptance. Final explicit recipient confirmation is required for either route;
Cancel/decline creates no provisioning intent or candidate payload. Grant identities are
opaque per-process objects in a private WeakMap, bound to current owner, ViewSession,
candidate/route and native-selected path. Revoke on session loss, shutdown or completion.
Tests inject answers and must never describe those as genuine recipient consent.

Opening an official terms page, if exposed, is a separate explicit native user action
with one fixed HTTPS URL; no renderer URL or arbitrary external navigation is accepted.
The exact UI wording/terms presentation must be reviewed before product activation.
No automatic acceptance or checkbox on behalf of the recipient is allowed.

## Proposed exact operation model

A separate main-only service shares existing ViewSession admission and the single shared
preload unresolved-invocation budget8. New exact channel `foundation:platform-tools:v1`
contains only `platformTools.get` and `platformTools.setup.request`. Wire version1,
requestId and expected revision follow the existing canonical-string grammar. The setup
request has no route/path/terms field. Duplicate keys, extra keys, wrong sender/frame,
revoked session, oversized wire and stale revision refuse before native dialog dispatch.

`setup.request` starts at most one main-owned interaction and returns a truthful PENDING
acknowledgment, not APPLIED or VERIFIED_LOCAL. It does not hold an IPC invocation while
a human reads a dialog. An operation-scoped opaque public ID correlates status only; it
is not a grant/capability and carries no stable device/recipient identity. There is no
mutation retry. `get` returns a bounded fixed state: UNAVAILABLE, AWAITING_RECIPIENT,
PROVISIONING, VERIFIED_LOCAL, DECLINED, FAILED or OUTCOME_UNKNOWN, plus revision,
operation correlation and fixed error/health fields. No absolute paths, raw exceptions,
archive contents or legal identity enter renderer output/logs. Explicit user Read is the
reconciliation path; no polling timer, background download or automatic install occurs.
The existing2s client deadline remains; late replies cannot relabel a timed-out action.

Pending interaction is separately tracked by the main service, capped at one. Every
native await rechecks owner/session before grant or file effects. No grant survives a
revoked session. Shutdown aborts transport and revokes grants; a still-pending native
interaction or core operation is UNRETIRED, never silently treated as completed or used
to release its owning resources. The exact bounded shutdown adapter must match the
existing lifecycle contract; implementation may not infer retirement from a timeout.

## Download and installed-byte boundary

Use only Node's fixed HTTPS request adapter, never shell/curl/PATH: one GET to the exact
versioned Google URL, no redirects, exact status/content-length/byte cap, streamed bounded
buffer,120000ms total setup budget and AbortSignal. No arbitrary URL, proxy override,
credential, retry or update discovery. Local archive uses the existing native-selected
bounded exact read. Both feed the already-reviewed core and preserve original bytes on
failure. Required notices stay within the exact admitted archive inventory.

Read status and provisioning must use the existing owned data lease and reject restored
maintenance, package/output overlap and unretired server custody. Integration is normal
main only and drains before persistence resource release. Success means VERIFIED_LOCAL
bytes/settled chain only. It does not set a fabricated component-license-reviewed flag
or reuse the redistribution-oriented PlatformToolsManifest as if rights were settled.
Production command execution remains BINARY_UNAVAILABLE until a separately reviewed
recipient-delivery runtime capability admits the exact owner/chain/files/rights boundary.
No ADB version/server/device command is part of this proposed UI/setup batch.

## Required checkpoint

Freeze exact request/response schema and native wording before source entry. Test actual
bridge/client budget, final callback fences, Cancel/decline/no-write, duplicate request,
late reply/reconciliation, grant revocation, bounded download failures and owned-file
composition. Preserve V9 with focused component checks and at most the existing two-view
native integration smoke, not another full parity campaign. Actual hosted download/setup
execution needs a reviewed disposable-owner runner; native injected answers remain
explicitly synthetic consent. No user-host operation is initiated by source publication.

## Exact proposed wire and state semantics

Requests are canonical JSON strings, at most512 UTF-8 bytes:
- `{version:1,requestId,method:'platformTools.get'}`.
- `{version:1,requestId,method:'platformTools.setup.request',expectedRevision}`.
`requestId` is exactly `p[1-9][0-9]{0,15}`, with a canonical positive safe-integer suffix; the preload allocates it monotonically and never reuses an ID in a session. `expectedRevision` is a
nonnegative safe integer (never -0). No other field or method is accepted. Responses are
canonical JSON, at most8192 UTF-8 bytes, with the same exact requestId and fixed health.
No public rollback/recovery method is added by this batch.

The snapshot is exactly `{revision,installationRevision,state,operationId,code,candidateVersion}`.
`revision` is a process-local interaction/status CAS counter, initially0, advanced only
for actual published state transitions. `installationRevision` is the separately read
persisted core revision, or null when it cannot be established; it is never substituted
for the interaction revision. `candidateVersion` is always the prospective pin `'37.0.1'`,
not an installed-version claim. `operationId` is null or one main-generated UUID, retained
only for the latest interaction in this process; it is not a device or legal identity.
`state` uses the seven fixed values above. `code` is null for UNAVAILABLE,
AWAITING_RECIPIENT, PROVISIONING and VERIFIED_LOCAL, TERMS_DECLINED, TERMS_REQUIRED or SETUP_CANCELLED for DECLINED, a
fixed failure code for FAILED, and OUTCOME_UNKNOWN/RECOVERY_REQUIRED for OUTCOME_UNKNOWN.

Successful `get` response is exactly
`{version:1,requestId,ok:true,outcome:'OBSERVED',snapshot,diagnosticId,loggingHealth}`.
Successful setup acknowledgment has the same fields with `outcome:'PENDING'` and
snapshot state AWAITING_RECIPIENT. It proves only one interaction was admitted, not that
native consent, file mutation or installation happened. A request while another
interaction exists returns BUSY without a second dialog, irrespective of revision.
Otherwise a stale expectedRevision refuses. Repeated old requests are not cached/replayed
as successful native actions. On reload, wrappers require a fresh successful get before
setup is enabled; old ViewSession requests cannot reuse the new session. On process
restart the interaction counter/ID reset, while actual persisted installationRevision
and pending-ledger refusal are reconstructed by the core.

Errors are exactly
`{version:1,requestId,ok:false,outcome:'NOT_STARTED'|'OUTCOME_UNKNOWN',code,diagnosticId,loggingHealth}`.
Fixed codes are INVALID_TRANSPORT, PAYLOAD_TOO_LARGE, INVALID_JSON, INVALID_SHAPE,
UNSUPPORTED_VERSION, UNKNOWN_METHOD, UNTRUSTED_SENDER, SESSION_UNAVAILABLE,
SESSION_REVOKED, BUSY, STALE_REVISION, INTERNAL_FAILURE, AUDIT_UNAVAILABLE, TIMEOUT,
INVALID_REQUEST, TERMS_REQUIRED, TERMS_DECLINED, SETUP_CANCELLED, OWNER_REVOKED, LIMIT_EXCEEDED,
ARCHIVE_REJECTED, DOWNLOAD_FAILED, STORAGE_FAILED, OUTCOME_UNKNOWN and RECOVERY_REQUIRED;
no arbitrary string is accepted. Error requestId is null only when no valid request ID
can be established; otherwise it must equal the request. A null diagnosticId requires
DEGRADED loggingHealth, following the existing client fallback convention. Pre-admission errors are NOT_STARTED. The client timeout
is OUTCOME_UNKNOWN and cannot trigger retry or later automatic success. diagnosticId is
null or an allocated fixed UUID; loggingHealth is AVAILABLE or DEGRADED. Explicit get
reconciles the main state. Bytes-only VERIFIED_LOCAL never enables a device command.

## Audit and shutdown ordering

Use additive audit schemaVersion6, preserving historical schemas1–5 byte/grammar compatibility. Event
PLATFORM_TOOLS_SETUP, taskP2-01, MAIN, phaseINTENT/RESULT, operationREAD/REQUEST/PROVISION,
diagnosticId and operationId, expected/result interaction revisions and fixed code only.
No native answer, path, recipient identity, URL, raw archive or response body is logged.

A successful status read allocates a diagnostic ID and emits a READ RESULT without an
INTENT barrier (no mutation); failure degrades health without claiming the snapshot changed.
Before scheduling native interaction or advancing the interaction revision, flush REQUEST
INTENT. Failure returns NOT_STARTED/AUDIT_UNAVAILABLE without dialog or mutation. After
that await, repeat final ViewSession/owner/idle admission before reserving the one operation.
A failed RESULT after admission returns PENDING with DEGRADED health, not false NOT_STARTED.
After actual native consent and route selection, flush a separate PROVISION INTENT before
calling the core. Failure revokes the grant and publishes FAILED/AUDIT_UNAVAILABLE with no
core intent/payload. Core confirmation publishes VERIFIED_LOCAL; a RESULT log failure only
degrades health, never falsifies the confirmed result. Native Cancel is DECLINED with no
core files; result-log failure does not turn a known cancellation into installation.

Track native-interaction retirement separately from core/download retirement. Stop rejects
new requests, revokes session/grants and aborts transport; it waits for both real promises
under the existing120000ms lifecycle ceiling. An unresolved native dialog or network/core
promise means UNRETIRED and prevents persistence/lease release on the normal successful
shutdown path. Do not equate an AbortSignal, free UI slot, closed renderer or timer with
completion. There is no forced key/profile deletion or unknown-operation recovery.

## Exact proposed native wording and transport

Native dialog title: “Thiết lập Android Platform Tools”. Explain the exact37.0.1 candidate,
direct Google/local-archive route, first-setup network condition, no Auto redistribution,
and “Chưa khởi động ADB hoặc kết nối thiết bị.” Show the fixed official terms URL
`https://developer.android.com/studio/terms` and require an explicit recipient statement
that they have read/accept applicable terms and have authority for their use/entity.
Default/cancel is always “Hủy”; affirmative consent is “Tôi đã đọc và đồng ý”. Opening
terms is a separate explicit fixed-URL action and ends this request without consent;
there is no automatic acceptance after browser launch. A new user request can proceed
after reading. After consent, route buttons are “Hủy”, “Chọn tệp ZIP”, “Tải từ Google”.
The file picker accepts one local ZIP and still requires the same prior explicit consent.
After either route is selected (and the file is chosen for LOCAL_ARCHIVE), a final native
confirmation names candidate37.0.1 and that route, with “Hủy” default and “Xác nhận thiết lập”
affirmative. Only this affirmative plus the earlier terms affirmation can mint the grant,
after the final current-session/owner check. Terms-dialog Cancel is DECLINED/TERMS_DECLINED;
Open terms ends as DECLINED/TERMS_REQUIRED; route/picker/final-confirm Cancel is
DECLINED/SETUP_CANCELLED. All three mean no grant/core intent/payload, not a legal
judgment about the recipient. No renderer request substitutes for either affirmation.

The HTTPS adapter uses a fresh request/agent with normal certificate validation, no proxy
or credential override, no global-agent mutation, one fixed hostname/path/GET, no redirect,
HTTP200, exact declared archive length, no content encoding other than identity, and an
exact-length-plus-one streaming cap. It resolves or rejects only after its own request/
response resources have actually closed; abort/overflow/incomplete reads destroy only
those owned resources and wait for close. Fixed errors only. Tests may use an injected
request implementation, not claim a real network transfer or recipient consent.


Audit record exact fields are `{schemaVersion:6,runId,sequence,utc,severity,component:'MAIN',
task:'P2-01',event:'PLATFORM_TOOLS_SETUP',operation,phase,diagnosticId,operationId,
expectedRevision,resultingRevision,outcome,code}`. Existing UUID/run sequence/UTC validation
is reused. operation is READ, REQUEST or PROVISION; phase is INTENT or RESULT. diagnosticId
is always a distinct allocated UUID in an emitted record; operationId is the interaction
UUID, or null only for READ with no current interaction. If ID allocation fails, emit no
fabricated record and return INTERNAL_FAILURE/null diagnostic/DEGRADED before effects.
severity is INFO exactly when code is OK, WARN otherwise. code is OK or the exact public
fixed-code list. No record may accept arbitrary extra fields.

INTENT is only REQUEST/PROVISION, codeOK, outcomeINTENT, a safe expectedRevision and
null resultingRevision. READ is RESULT only, outcomeOBSERVED orFAILED, null expectedRevision,
and observed revision or null on failure. Other RESULT records use actual expected revision
and actual resulting interaction revision (or null if not established), and outcomePENDING,
VERIFIED_LOCAL, DECLINED, FAILED orOUTCOME_UNKNOWN. A failed pre-admission audit does not
reserve an interaction revision or create a native dialog. A post-effect result failure
cannot be represented as a pre-effect refusal.


Implementation clarification: existing Admission.current() is invocation-slot-bound and
becomes false after release. A new main-only operationCurrent observer captures the same
admitted ViewSession generation/ACTIVE state but is independent only of RPC slot release.
The original current/release/8-cap semantics remain unchanged. Only the service's already
admitted single native operation retains this liveness observer; bridge disposal, session
revocation/close and service completion revoke its usefulness. It is not a renderer token,
new action grant or means of dispatching another operation. Client uncertainty after a
setup dispatch (timeout, disposal or malformed/failed reply) remains OUTCOME_UNKNOWN;
only known pre-dispatch refusal is NOT_STARTED.
