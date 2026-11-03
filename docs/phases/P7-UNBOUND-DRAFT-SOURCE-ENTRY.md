# P7 unbound draft preview — reviewed source entry

Date: 2026-11-03. Base: public phase-07
`3a7689e3c70435f673d53b21a2f713d5ac1a53ca` in an isolated worktree.
This bounded continuation resolves the unbound context question in
[P7 runtime entry B](P7-RUNTIME-OBSERVATION-SOURCE-ENTRY.md#b-actual-typed-preview-composition-and-v9-editing).
It is not adoption of the proposed bridge, UI, persistence or dispatch work.
The coordinator redirected independent software work here while the prior Phase6
worktree is unavailable in the present executor; no Phase6 files are overwritten.

## Outcome and compatibility

Add an authority-free synchronous `evaluateUnboundScheduleGapPreview` export to
`desktop/src/schedule-gap-contract.ts`. It accepts the same civil rule and a
closed request `{version:1, scope:{kind:'UNBOUND_DRAFT', draftId, draftRevision},
zone, fromDate, throughDate, limit}`. draftId uses the existing lowercase UUID
syntax; draftRevision is a nonnegative safe integer, rejecting negative zero.
They identify local editing intent only, not a stored schedule or authenticated
principal. No device, account, target, capability, caller UTC or saved-state field
is allowed. Missing/extra/accessor/symbol/prototype fields fail before evaluation.

A success is explicitly `kind:'UNBOUND_SCHEDULE_GAP_ADVISORY'` with the immutable
unbound scope. It shares all other fields/semantics with the existing gap result:
actual civil/zone resolution, exact runtime witness, requested preview window,
1800000ms warning-only threshold, consecutive resolved instants, gap skip,
earlier overlap, bounded prefix/next and honest coverage. No invented identity,
placeholder device/account UUID, modified time, job or executable object.

Extract the existing resolution/warning body into one private shared function;
both existing and new exports must use it. The old supplied-scope request/result
and error precedence remain compatible. Its acceptance of supplied IDs still
proves attribution only. A successful unbound preview cannot be treated as an
accepted bound schedule by its type or result kind.

## Scope, checks and gates

Changed code: existing gap contract and its existing tests only. New documentation:
this entry and a result evidence record. No new import, dependency, module, test
inventory, IPC, main/preload/renderer, filesystem operation, database, timer, actor,
account or external effect. No product slot maximum is invented. P7-03.B, P7-04.B,
P7-11 and all Phase/task acceptance remain unchanged; no extra ledger credit.

Verify old bound fixtures unchanged; closed/malformed unbound schema, hostile
property descriptors/proxies, revision bounds, caller mutation/frozen output,
legacy-kind separation and identity injection denial; actual shared 29/30-minute,
midnight, DST gap/overlap, invalid zone/date/slot/runtime and truncated coverage
composition. Run strict compile, graph/quality/build and the full aggregate after
source freeze. Preserve failed and recovered attempts in evidence. An independent
scope review precedes code; independent implementation review precedes commit.

Actual Windows production campaign41493281269 at this public base is available
for separate artifact audit, not inferred from local tests. Existing native proof
is not proof of a future bridge. New unbound API native invocation is NOT_RUN until
its exact source is exercised. No device/phone or user-computer use.

Rollback removes only the new pure export and shared implementation refactor;
existing bound API behavior is regression-tested. There is no persisted state to
migrate or erase and no external action to undo. Next work may adopt a precise
bridge and V9 editing contract after this interface and runtime evidence review.

## Source entry record — 2026-11-03 21:13 UTC

Independent scope review CLEAR binds pre-entry SHA256
`60978cdc55e265b7a55d95de90c9f5ec0746e9115c596055e8224c255af6f457`.
The assigned implementation worker proceeds under the coordinator's direction to
continue independent Phase7 software work. This admits only the pure API above;
the broader B bridge/UI proposal remains unadopted. Baseline restore and full
source aggregate passed 1753/1753 before implementation.
