# P7 unsaved recurrence controls — proposed finite source entry

PROPOSED 2026-11-03 22:16 UTC. Base: local7b6c5c6/public80f3d15a,
identical tree158cf2b5. Local full aggregate1816/1816 and independent UI review
CLEAR; exact-head Windows source CI41728928994 also passes1816/1816 at22:17 UTC.
Native/visual evidence remains NOT_RUN. This proposal does not itself authorize code.

## Existing independent path

The current civil model, closed draft bridge and actual resolver already accept
ONCE, WEEKDAYS and EVERY_N_DAYS plus inclusive endDate and maximum planned
occurrences. The UI/controller currently expose only EVERY_N_DAYS and hard-code
endDate/maxOccurrences to null. Complete these local inputs through that same
existing API without adding a service, storage, job, device or account binding.
No actual runtime/visual campaign is required to write this code; unrun empirical
checks remain deferred and explicit under the user's code-first direction.

## Bounded behavior

- Keep current default EVERY_N_DAYS with interval1, unchanged dates, editable
  Asia/Ho_Chi_Minh zone and existing explicit slot semantics.
- Add a labelled recurrence selector within the existing Setup formgrid, for
  one date, selected weekdays, or every N days. ONCE means one selected active
  date with the existing slots, not a single post regardless of slot count.
- WEEKDAYS starts with no implicit weekdays. User chooses explicit ISO weekdays
  1(Monday)..7(Sunday); empty selection is invalid for that mode. Order is stable
  and immutable. Other modes retain the local weekday selection and interval
  input for later switching, but inactive fields never affect the wire rule.
- Add optional inclusive end-date and planned-occurrence maximum fields in the
  same formgrid. Blank means no corresponding bound. Preserve invalid raw values
  and show a fixed safe reason instead of coercion/clamping. The maximum uses
  positive safe integers admitted by the existing schema; this representation
  constraint is not a product posting allowance.
- Start remains the recurrence anchor. Both bounds stop at the first reached.
  Maximum counts planned slots, including skipped DST slots; no replacement is
  invented. An end before start or an invalid bound refuses explicit preview.
- Keep throughDate as a separate preview-window limit, not the schedule end.
  Existing preview rows128/window366 and valid zone/date admission remain exact.
- Every edit including mode/weekday/bounds changes increments draft revision,
  invalidates current result and staged removal, cancels only old delivery, and
  never automatically previews. Existing stable slots and entered times survive
  every mode/bound edit. Pending invocation ownership, stale/context/unmount
  fences and no replay remain unchanged.
- Show the selected recurrence/bounds beside a successful preview so the result
  cannot imply an unlimited or persistent schedule. Existing UTC, gap/overlap,
  truncation, warnings and unsaved/no-jobs displays remain.

## Files, checks and limits

Only existing schedule-draft-model.ts and schedule-draft-panel.tsx, their tests,
necessary source-based regression expectations, and scoped docs may change.
No new dependency/module, build inventory expansion, main/preload/IPC method,
Temporal renderer import, persistence or native code. Preserve V9 shell, tabs,
monitor, other Setup cards and the complete canonical HTML. Do not rewrite
historical evidence or fixed47-cell ledger for a partial UI behavior.

Test actual controller/client/admitted bridge/real evaluator composition for
one-date all slots, weekday selection and start anchor, every-N behavior, end
inclusivity, maximum within a day, first bound wins, DST skip consumes planned
maximum, empty weekdays, invalid raw bounds, mode-switch preservation, and
cancel/stale/context/unmount regressions. Run strict source/demo compile, exact
graph/quality, normal/demo build and full desktop aggregate after final source.
Independent implementation review precedes commit and lease-checked publication.
No new native/visual campaign, devices or user computer. Missing screenshots and
actual Electron invocation remain NOT_RUN, not accepted through fixtures.
Rollback only these renderer/controller additions, leaving previous preview/API
and history intact. No persisted data exists to migrate or erase.

## Adopted source entry — 2026-11-03 22:18 UTC

Coordinator adopts the independent CLEAR scope and directs implementation.
Review bound preamble-before-hosted-closure SHA256
`880e2d5bab574b3ce205481688333900d8a922cfecd7eec85207b40b7704b104`;
current pre-adoption SHA256
`46b2f25b1487de41e2f1489db26e78b91d2cfc2cbcde520bfc023ac5ddfc0ca9`
changes only that truthful CI preamble. Clarifications: weekdays are unique and
numeric ascending, inactive interval input cannot block other modes, and DST
skips consume the planned maximum. Implementation owner edits model/panel;
separate test owner edits their tests only. Shared docs remain with implementation
owner. All work is one same-Phase functional cluster, no third phase or device.
