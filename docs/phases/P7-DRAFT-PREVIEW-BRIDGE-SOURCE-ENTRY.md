# P7 read-only draft preview bridge — reviewed source entry

2026-11-03. Base: local b483708 / identical published 981ce632, tree
54ff929b6a4fe4d4434a070e5d78aa27dace2ae2. The pure unbound API has independent
review and 1761/1761 source PASS. The prior exact production runtime campaign is
retained and audited in P7-unbound-draft-preview-2026-11-03.md. The coordinator
has directed continuation after scope review, without another user approval.

## One bounded capability

Add only explicit `scheduleDraft.preview(input): Promise<string>` and local
`scheduleDraft.cancel(): void` to sandboxed preload. Input is a closed
`{schedule, request}` object using the existing civil rule and UNBOUND_DRAFT
request. This computes unsaved intent; it cannot save, queue, identify an account,
use a device, select a callback/path, accept caller-supplied UTC occurrence
timestamps, change time or authorize dispatch. The UTC timezone is valid.
No automatic invocation on startup, readiness, panel open or navigation. UI is
unchanged in this batch. It receives no Phase7 ledger credit by itself.

Fixed channel `foundation:schedule-draft:v1`, method `schedule.draft.preview`.
Canonical JSON request envelope has exactly version1, generated requestId,
method, schedule and request. requestId is d1..dMAX_SAFE_INTEGER, never supplied
by renderer. Both parser and preload snapshot use `snapshotCivilSchedule` and
closed descriptor-safe request/scope validation. The actual evaluator validates
again. All current schema/rule/date/zone policy remains unchanged.

Technical bridge limits: 128KiB UTF-8 input/output, at most128 preview rows, at
most366 inclusive preview days, existing1440-slot representation bound. The
128-row bridge limit is an explicit IPC/compute bound, not a product posting cap
or performance promise. Out-of-bound input refuses, never silently clamps. Civil
end/max semantics and resolver date range1970..2099 stay unchanged. The limit
fits the existing truncated-prefix/next contract; no absent pages are called clear.

A closed success response contains version1, oktrue, requestId and the complete
UNBOUND_SCHEDULE_GAP_ADVISORY preview. A failure contains version1, okfalse,
requestId or null, and one fixed transport/domain code. No raw exception, path,
callback, diagnostic secret or partial success. A node-free contract validator
snapshots all nested output fields, with bounds and exact fixed discriminants;
preload must not load Temporal, node modules or the live resolver through a value
import. Local or transport input-schema/civil-snapshot refusal returns INVALID_SHAPE,
including malformed dates, rules and slots; this does not rewrite the richer
existing pure API errors. After input admission, evaluator domain/runtime failures
remain exact. Oversize wire returns PAYLOAD_TOO_LARGE; unknown method/version
have fixed separate codes. Canonical JSON rejects duplicate keys,
noncanonical encoding and extra fields; no trim/extract/default recovery.

## Lifetime and ownership

Main registers only against the existing main-window ViewSession admission,
ordinary invocation budget and current-generation check, before and after the
bounded synchronous real `evaluateUnboundScheduleGapPreview` call. No new session
or permission. Descriptor snapshots do not claim detection of every transparent
JavaScript proxy. No injectable evaluator/caller callback. Handler disposal removes
the exact channel; every admitted operation releases its lease in finally.

Client snapshots input before generating a request. One outstanding invocation
per draft client; repeated preview while pending returns BUSY rather than queues.
It also acquires the shared ordinary invocation lease. A2-second delivery deadline,
cancel or preload disposal prevents later success delivery; retained native
promise still owns both the shared lease and the single per-client outstanding
slot until it settles; a timeout/cancel cannot admit a replacement invocation.
Before native dispatch, cancelling the readiness waiter settles the local pending
operation and releases its lease/slot without invoking main. Cancel is delivery-only,
not a claim that synchronous computation was interrupted. No asynchronous
filesystem/device effect exists. A response must match requestId plus draftId/
draftRevision and requested window/zone before delivery. No replay on failure.
Readiness waiting is cancellable and uses existing settings readiness only to
avoid requesting before the main-view session is ready; readiness never triggers
an invocation without the explicit preview call.

## Files and checks

New: desktop/src/schedule-draft-contract.ts, schedule-draft-client.ts,
schedule-draft-bridge.ts and focused contract/client/bridge tests. Existing main.ts,
preload.ts and preload declaration receive exact wiring/disposal changes. Extend
module-map.json, build source manifest, fixed test inventory and finite quality
limits plus their boundary tests, not bypasses. No dependency/lock/native/UI,
helper, persistence or device source change.

Test actual contract→client→admitted handler→unbound evaluator→validated response
composition on the admitted Node authoring runtime; separately label Electron
execution NOT_RUN for this changed source. Test payload/row/date bounds, canonical
wire and unknown/duplicate keys, descriptor/accessor and throwing/revoked/hostile proxy refusal, mismatched responses,
budget BUSY, timeout/cancel/dispose/readiness and late settlement, revoked/untrusted
session and exception cleanup, real29/30/DST/truncation output and unchanged main
security. Verify built preload has no Temporal/node runtime and main contains the
real evaluator. Run graph, strict compiler, quality, normal/demo build and full
aggregate. Independent scope review precedes code and implementation review
precedes commit/publication. Hosted exact-head source checks do not imply actual
new API invocation in Electron or V9 screenshots. Real UI entry remains separate.

Rollback removes only this bridge capability and its owned handlers/client state;
there is no stored schedule to migrate or external effect to reverse. Keep the
pure unbound API and all existing device/session/security boundaries unchanged.

## Source-only CI coverage repair

The existing scheduler push filter covers only its runtime harness, so pure
scheduler source981ce632 did not start the scheduler source job. Expand only this
workflow's push paths to desktop/**, foundation/**, biome.json and the workflow
itself, with trigger regression assertions. Preserve exact phase-07 branch,
read-only permissions and every existing explicit runtime marker/input predicate.
This admits source checks for changed application code, not automatic Electron
observation or device execution. Other phase workflows remain unchanged.

## Reviewed source entry — 2026-11-03 21:26 UTC

Independent scope review CLEAR binds pre-entry SHA256
`da528569c876afb52286cfd178e3446a13175c432e8e4d0ce79b834dbf3b6ed2`.
Three review clarifications above fix input-error mapping, proxy claims and
retained pending-slot behavior. Implementation proceeds under the coordinator's
explicit Phase7 bridge continuation direction. Contract/test files and client/
bridge/integration files are separately owned within this single functional
cluster; shared build inventories remain serialized. No third phase is opened.
