# Phase Status — Fonesi-Auto

This is the single status board for the implementation roadmap. Update it only with evidence-backed status changes.

## Status definitions
- NOT_STARTED: no work begun.
- IN_PROGRESS: authorized work is underway.
- BLOCKED: a dependency or decision prevents progress.
- READY_FOR_REVIEW: implementation and tests are complete; awaiting review.
- ACCEPTED: exit criteria passed and user approved.
- DEFERRED: explicitly postponed with a recorded reason.

## Current repository state

| Item | Status | Notes |
|---|---|---|
| Clean-slate plan | ACCEPTED | PR #1 merged to main at e85d2c0c67a3aefa11dc390739243653d2b1bbf0 |
| Hardware resource / stream controls | SPECIFIED | User-adjustable Auto/Manual FPS, resolution, bitrate, concurrency and live warnings documented in docs/12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md |
| Full V9 HTML reference | UPDATED | Complete original V9 plus approved Stream / Performance controls; 1,296 lines |
| Git workflow rules | ACCEPTED | Merged to main through PR #1 |
| Application source code | NOT_STARTED | No production app implementation authorized |
| Phase 0 | IN_PROGRESS | User-approved plan on phase/00-feasibility; physical-device smoke test required before acceptance |
| Phase 1–11 | NOT_STARTED | Must follow Phase 0 exit gate |

## Execution rule

- Only one Phase may be IN_PROGRESS at a time.
- Before each Phase, read the Master Plan and prepare a detailed Phase Plan using docs/templates/PHASE_PLAN_TEMPLATE.md.
- The user must approve the Phase Plan before production coding.
- Implement tasks sequentially. A task must PASS its required tests before the next task begins.
- Commit and push passing checkpoints to the active Phase branch.
- Close the Phase with full regression, acceptance evidence and a PR to main.

## Phase tracker

| Phase | Name | Status | Entry dependency | Evidence / PR |
|---|---|---|---|---|
| 0 | Product, policy and feasibility | IN_PROGRESS | Phase 0 plan approved by user; physical-device smoke test mandatory | [Phase 0 plan](phases/PHASE-00-feasibility.md) |
| 1 | Desktop foundation | NOT_STARTED | Phase 0 ACCEPTED | TBD |
| 2 | ADB and device fleet | NOT_STARTED | Phase 1 ACCEPTED | TBD |
| 3 | Screen wall and streaming | NOT_STARTED | Phase 2 device contracts stable | TBD |
| 4 | UI Automator and Vision | NOT_STARTED | Phase 2 device contracts stable | TBD |
| 5 | Identity, accounts and app inventory | NOT_STARTED | Phase 2 and 4 accepted | TBD |
| 6 | Media and content | NOT_STARTED | Phase 1 accepted | TBD |
| 7 | Scheduler and queue | NOT_STARTED | Phase 1 and domain models accepted | TBD |
| 8 | Workflow runtime and safety | NOT_STARTED | Phases 2, 4, 5, 6 and 7 accepted | TBD |
| 9 | Facebook pilot | BLOCKED | Policy gate and workflow capability certification | TBD |
| 10 | Tracking and reports | NOT_STARTED | Permitted data sources established | TBD |
| 11 | Hardening and release | NOT_STARTED | All release-critical phases accepted | TBD |

## Rule
Do not mark a Phase ACCEPTED until its exit criteria, tests, evidence and user approval are recorded. A merged PR alone does not mean a Phase is accepted.
