# P7 unsaved V9 draft preview — finite source entry

2026-11-03. Base: phase-07 local270e17c and public1eaa2b9, identical
4df3b769 tree. Existing hosted closure edits are retained. Coordinator permits
source entry after independent review under the user's continuous software-only
instruction. No third phase, user computer, device or new capability grant.

## Outcome and bounds

Replace only the existing Setup scheduling placeholder with an explicit unsaved
preview using the existing scheduleDraft bridge. Preserve V9 shell, navigation,
monitor, cards and slot-grid; no calendar/job/media-row mutation. Preserve the
original complete V9 reference. Preview is UNBOUND_DRAFT and never has device,
account, target, content or workflow authority. Saving and bulk scheduling remain
unavailable. Product maximum remains unresolved; technical bounds are labelled
as representation/preview resource bounds, not a posting allowance.

Introduce an immutable renderer-side draft model/controller with local random
UUID draft/slot IDs, revisioned edits and one outstanding preview delivery.
User-selected dates/times are strings, never host-time conversions. Initial date
is blank (explicit selection required); initial three existing V9 example times
are labelled unsaved editable defaults. Retained slot IDs/times survive changes.
New slots are blank, not invented. Reducing the count stages exact removed IDs
and times and requires an explicit local discard acknowledgment. Editing while
removal is staged invalidates that proposal; no silent removal/reuse of IDs.
The existing auto-distribute button is disabled with its missing-policy reason,
not used to silently replace manual times. Numeric invalid input remains visible,
with a reason instead of coercion/clamping. Count representation bound1440,
intervalDays1..3652059 follow actual pure contract. No arbitrary24 posting cap.

Use the existing every-N-days/start controls and add only required labelled zone,
through-date preview-window controls within the same formgrid. Default zone is
Asia/Ho_Chi_Minh; explicit IANA input including UTC admitted by existing API.
Request fromDate equals the selected startDate; through-date bounds preview only,
not schedule endDate. Rename the existing action to Xem trước bản nháp so it
does not imply media-table mutation. Existing collision/comment controls are
visibly excluded from this time-only preview. Preview limit128 and inclusive window<=366 days remain bridge resource bounds.
This slice does not add recurrence modes, persistent end/max, row overrides,
collision/queue behavior or infer saved schedules from a preview.

## Lifetime and truthful display

The controller calls only supplied preview/cancel ports. No automatic preview on
mount, editing, readiness or navigation. Every edit invalidates displayed result
and increments revision; in-flight cancellation is delivery-only. Retain local
pending ownership until the client promise settles; a new explicit request may
still get BUSY if preload's underlying invoke is pending. Never retry/replay.
A completion must match current draft ID/revision, zone and preview window, and
must parse through the closed existing response validator. Selection/context
changes (including external device selection and workflow prop changes) clear result and cancel delivery. Unmount disposes the controller and
fences later callbacks; remount creates a fresh draft ID. Errors preserve inputs.

Show original local date/time and IANA zone, resolved UTC/offset/policy, each
DST gap skip and earlier-overlap choice, warning pairs with exact elapsed gap,
requested window, returned count, truncation/next and comparison coverage. Never
say no conflicts or all clear from a partial preview; gap advisory is not collision
analysis. Failure disables only the preview result; editable times remain.29-minute
warning does not reject, shift or cancel. A visible unsaved/no-jobs notice remains.

## Files, tests and rollback

Expected files: new renderer-safe model/controller + tests; existing work-pages,
UI props/shell/root wiring and relevant tests; exact module map/build manifest/test
inventory/quality bounds and boundary tests. No new dependencies, main/preload/IPC,
Temporal renderer import, persistence, runtime admission, commands or native code.
Use actual client/bridge/evaluator composition in tests, plus edit/revision/removal,
malformed-response, cancellation, stale/late, selection/navigation/disposal,
29/30, UTC/offset, DST and truncation rendering. Strict compiler, module graph,
quality, normal/demo builds and full desktop aggregate must pass after final edit.
Review complete V9 artifact; collect before/after same-viewport Dark/Light images
only through available authorized disposable browser/runtime. Missing executable
visual environment is NOT_RUN, never a screenshot or UI-acceptance claim.
Independent implementation review precedes commit; source tree and public head
readback precede publication claims. Existing Windows bridge execution remains
NOT_RUN unless actually exercised. No new fixed-ledger cell/task acceptance.
Rollback removes this UI/controller wiring, leaving existing bridge/pure APIs and
stored history untouched (this slice creates no persisted state).

## Source entry — 2026-11-03 21:59 UTC

Independent scope review CLEAR binds pre-entry SHA256
`e2477d0db82366bad319a96c542ae9fc10b65ab2f93b2641484a447b552a8840`.
Coordinator delegated adoption after this review; implementation starts now.
New model/test and existing UI/wiring/shared inventories have nonoverlapping
owners within this single feature cluster. The installed Chromium visual path
was already blocked by OS singleton-socket creation with sandbox intact. That
unchanged operation is not retried and sandbox is not disabled; visual evidence
remains NOT_RUN pending an authorized available runtime.
