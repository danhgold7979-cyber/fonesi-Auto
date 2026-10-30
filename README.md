# Fonesi-Auto

**Clean-slate project repository** for the Fonesi multi-device Android operations desktop application.

## Project rule

This repository is a separate project. Do **not** copy, fork, port, or depend on the source code, package structure, contracts, database schema, execution plan, or implementation decisions from `danhgold7979-cyber/fonesi-W`.

The only retained inputs are:
- The product requirements explicitly approved in the Fonesi-Auto project conversation.
- The approved Fonesi-W V9 HTML interface as a visual/product reference (not as application source code).
- The explicitly selected technology direction: Windows desktop shell, ADB, UI Automator, OpenCV + OCR, and a Python vision worker.

All architecture, schemas, adapters, workflow state machines, tests, and implementation plans must be designed independently for this repository.

## Current status

- Product UI baseline: **V9 — approved reference**
- Planning branch: `planning/clean-slate-master-plan`
- Status: **planning and feasibility gates only**
- Application implementation: **not started**
- No application code should be introduced until the open blockers and Phase 0 acceptance gates in `docs/04_MASTER_IMPLEMENTATION_PLAN.md` are resolved.

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
- [Decisions, open questions and 10-round review](docs/08_DECISIONS_AND_OPEN_ITEMS.md)



## Development governance

- [AI agent instructions](AGENTS.md)
- [Contribution and commit standards](CONTRIBUTING.md)
- [GitHub branch / PR / commit workflow](docs/09_GIT_WORKFLOW.md)
- [AI session starter / project introduction](docs/10_AI_SESSION_STARTER.md)
- [Phase status tracker](docs/PHASE_STATUS.md)
- [Pull request template](.github/PULL_REQUEST_TEMPLATE.md)

## Branch policy

- main is the stable, accepted milestone branch.
- planning/clean-slate-master-plan contains the current plan and full V9 UI reference.
- Do not code on the planning branch.
- Do not use feat/facebook-fixed-workflows; it is a stale legacy branch containing only the old README and is not authorized for implementation.
- After the plan is reviewed and approved, open a PR from planning/clean-slate-master-plan to main.
- Only after that PR is merged should Phase 0 be created from main.
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
