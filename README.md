# Fonesi-Auto

**Clean-slate project repository** for the Fonesi multi-device Android operations desktop application.

## Project rule

This repository is a separate project. Do **not** copy, fork, port, or depend on the source code, package structure, contracts, database schema, execution plan, or implementation decisions from `danhgold7979-cyber/fonesi-W`.

The only retained inputs are:
- The product requirements explicitly approved in the Fonesi-Auto project conversation.
- The approved Fonesi-W V9 HTML interface as a visual/product reference (not as application source code).
- The explicitly selected technology direction: Windows desktop shell, ADB, UI Automator, OpenCV + OCR, and a Python vision worker.

All architecture, schemas, adapters, workflow state machines, tests, and implementation plans must be designed independently for this repository.

## Current status — 2026-10-30

- Product UI baseline: **V9 — approved reference**.
- Initial clean-slate planning PR **#1 is merged** into `main` at `e85d2c0c67a3aefa11dc390739243653d2b1bbf0`.
- Phase 0 feasibility is **APPROVED / IN_PROGRESS** on `phase/00-feasibility`: **4 tasks IN_PROGRESS, 6 NOT_STARTED; all 12 exit criteria remain unaccepted**.
- This documentation normalization is on `plan`, based on `34b9649`. It prepares a reviewable plan, not a production implementation or Phase acceptance.
- Phase 1–11 detailed plans are **DRAFT / NOT APPROVED**; Phase 9 remains **BLOCKED** by policy/capability gates.
- Production application implementation is **NOT_STARTED / NOT AUTHORIZED**. Phase 0 diagnostics and disposable feasibility work are not production app code.
- Authoritative evidence and current blockers: [Phase status](docs/PHASE_STATUS.md). Proposed clarification of the preserved Phase 0 baseline: [Amendment 01](docs/phases/PHASE-00-feasibility-AMENDMENT-01.md).

A complete documentation review, a draft Phase plan, a passing build or a merged documentation PR does **not** authorize production coding. Resolve or explicitly defer gates with recorded consequences, obtain Phase acceptance and merge, then approve the next Phase plan before implementation.

## Documents

- [Master plan](docs/00_MASTER_PLAN.md)
- [Product scope and requirements](docs/01_PRODUCT_SCOPE.md)
- [Technical architecture](docs/02_TECHNICAL_ARCHITECTURE.md)
- [Data model and workflow specifications](docs/03_DATA_AND_WORKFLOWS.md)
- [Master implementation plan](docs/04_MASTER_IMPLEMENTATION_PLAN.md)
- [Acceptance criteria and risk register](docs/05_ACCEPTANCE_AND_RISKS.md)
- [V9 interface mapping](docs/06_UI_V9_MAPPING.md)
- [Complete V9 HTML UI reference](ui-reference/Fonesi-Auto-V9-UI-Reference.html)
- [How to open the V9 UI reference](ui-reference/README.md)
- [Technology and policy references](docs/07_REFERENCES.md)
- [Hardware resource manager and stream controls](docs/12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md)
- [Decisions, open questions and 10-round review](docs/08_DECISIONS_AND_OPEN_ITEMS.md)



## Development governance

- [AI agent instructions](AGENTS.md)
- [Contribution and commit standards](CONTRIBUTING.md)
- [GitHub branch / PR / commit workflow](docs/09_GIT_WORKFLOW.md)
- [AI session starter / project introduction](docs/10_AI_SESSION_STARTER.md)
- [Phase-by-phase execution playbook](docs/11_PHASE_EXECUTION_PLAYBOOK.md)
- [Documentation update and history policy](docs/13_DOCUMENTATION_CHANGE_POLICY.md)
- [Resource & Stream Control requirements](docs/02_TECHNICAL_ARCHITECTURE.md#6-host-resource--stream-manager)
- [Phase plan template](docs/templates/PHASE_PLAN_TEMPLATE.md)
- [Task checklist template](docs/templates/TASK_TEMPLATE.md)
- [Phase status tracker](docs/PHASE_STATUS.md)
- [Pull request template](.github/PULL_REQUEST_TEMPLATE.md)

## Branch policy

- main is the stable, accepted milestone branch.
- `planning/clean-slate-master-plan` is the historical source of merged PR #1; do not treat it as an unmerged prerequisite.
- The current documentation-review branch is documentation-only; do not add application code.
- Do not use feat/facebook-fixed-workflows; it is a stale legacy branch containing only the old README and is not authorized for implementation.
- Continue authorized Phase 0 execution only on its approved branch and task; do not recreate the already-started Phase.
- Future Phases execute strictly in sequence. A task-level parallel exception needs explicit approval under the execution playbook; a technical dependency alone is not start authorization.
- This documentation branch and a draft PR to `phase/00-feasibility` are authorized; merge still requires separate approval.
- Never commit directly to main or force-push.

## Non-negotiable engineering principles

1. ADB is the device transport/control plane; one serialized controller owns input for each device.
2. UI Automator is the semantic UI inspection/action layer; OpenCV/OCR is a fallback, not the first choice.
3. Python is an isolated vision worker; it must not race the ADB controller.
4. The V9 layout is the UI baseline. Visual changes require explicit product approval.
5. A workflow is not "ready" because it appears in the UI. It needs device/app/profile-specific evidence and acceptance tests.
6. Unknown UI state, ambiguous posting outcome, identity mismatch, or uncertain side effect must stop and enter a safe blocked/recovery state.
7. No CAPTCHA/checkpoint bypass, anti-detection evasion, unauthorized data collection, fake engagement, or blind retries.
8. "Unlimited devices" means no artificial record cap; live stream and worker concurrency are bounded by measured host resources.

## Change history

- 2026-10-30: Reconciled merged planning baseline and Phase 0 evidence; separated documentation-review readiness, draft future plans and implementation authorization; corrected document links.

## Accepted product decisions

[Accepted checklist C-01–C-22](docs/16_ACCEPTED_PRODUCT_DECISIONS.md) records the user choices used by this plan revision. It is not a declaration of Phase 0 completion or authorization to skip tests. [Plan readiness review](docs/15_PLAN_READINESS_REVIEW.md) records the final document checks and changed-file inventory.
