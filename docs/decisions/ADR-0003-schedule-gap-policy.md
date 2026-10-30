# ADR-0003 — Advisory 30-minute scheduling gap

Status: ACCEPTED for gap behavior only. Date: 2026-10-30. Authority: user accepted the stated recommendation (DEC-020).

## Decision
A gap below 30 minutes produces an advisory warning. It does not independently block saving, shift times or cancel jobs. This resolves the prior warning-versus-hard-minimum contradiction.

Device foreground serialization and account publication leases remain mandatory. The UI must explain separately a gap advisory, a real resource/identity conflict, a platform capability restriction and an overdue policy outcome. AUTO_SHIFT requires explicit selection and visible audit; advisory warnings never secretly activate it.

## Alternatives
A hard 30-minute prohibition would alter the accepted product behavior. No warning at all would discard the user's scheduling guidance. Advisory with mandatory safe concurrency is selected.

## Required verification
- 29-minute interval: accepted schedule with warning.
- 30-minute interval: no below-gap warning.
- Overlapping device/account jobs: serialized despite advisory behavior.
- Repeated save/drag/undo: no duplicate occurrence or hidden time shift.
- The later accepted C-10/C-11/C-18/C-19 resolve QUEUE, downtime REVIEW, DST SKIP/earlier-once, start-date anchoring, inclusive end date, planned-occurrence counting, bounded same-day AUTO_SHIFT and complete row overrides. Test these explicitly; none follows implicitly from the 30-minute advisory.

## Scope and rollback
Store the advisory threshold independently of queue/lease policy. Existing data migrations must not transform warnings into rejection. Any future hard limit needs a superseding decision and migration plan.

Trace: Phase 7; [DEC-020](../08_DECISIONS_AND_OPEN_ITEMS.md#dec-020--30-minute-spacing-is-advisory).

## Later accepted scheduler rules
See [C-10/C-11/C-18/C-19](../16_ACCEPTED_PRODUCT_DECISIONS.md). Their user acceptance does not claim recurrence/queue tests have passed.
