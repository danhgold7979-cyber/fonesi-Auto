# Contributing to Fonesi-Auto

## Before starting
1. Verify the repository remote is danhgold7979-cyber/fonesi-Auto.
2. Read AGENTS.md.
3. Read the active Phase in docs/04_MASTER_IMPLEMENTATION_PLAN.md.
4. Confirm the issue/task ID and acceptance criteria.
5. Start from the current approved base branch. Do not use an old or unrelated branch.

## Phase-by-phase execution

Follow docs/11_PHASE_EXECUTION_PLAYBOOK.md. Only one Phase is active at a time. Re-read the Master Plan, create a detailed Phase Plan from the template and obtain user approval before production code. Implement one task at a time; do not proceed while the current task is failing or required tests remain unrun. An independent same-Phase task may proceed only under the explicit user-approved exception procedure in the playbook. A branch, another agent, or a technical dependency does not provide that approval.

Future Phase plans may be drafted for review, but a DRAFT is not an execution agreement. Documentation review completion is distinct from Phase acceptance and production authorization. Keep the approved Phase 0 baseline unchanged; review its numbered PROPOSED amendment separately.

## Branching
Follow docs/09_GIT_WORKFLOW.md.

- main is the last accepted, stable milestone.
- phase-NN is the temporary integration branch for one Phase.
- feat/..., fix/..., test/... and docs/... are optional short-lived scoped branches, not permission to start another Phase.
- Merge only through pull requests after required checks pass.

## Commit format
Use Conventional Commits:

~~~text
<type>(<scope>): <imperative summary>
~~~

Examples:
- docs(plan): add phase 0 feasibility checklist
- feat(device): discover USB-connected Android devices
- fix(adb): prevent unscoped commands with multiple devices
- test(vision): add Vietnamese OCR fixtures
- build(windows): package pinned Android platform tools

Allowed types: feat, fix, test, docs, refactor, build, ci, chore, perf, security.

Rules:
- One logical change per commit.
- Use an imperative, specific summary.
- Avoid vague messages such as update, changes or fix stuff.
- Do not combine unrelated modules in one commit.
- Commit only after relevant tests pass.
- Never commit secrets, generated runtime data, local databases, private device screenshots or machine-specific configuration. Review and redact device serials, IPs, local usernames/paths, UI trees and diagnostic outputs; raw device/host bundles must not enter the public repository.
- Commit lockfiles when dependency manifests change.

## Pull request requirements
Every PR must:
- Link a Phase/task ID.
- Explain the problem and intended change.
- List files/modules changed.
- Include exact test commands, environment and PASS / FAIL / NOT_RUN / NOT_APPLICABLE results, counts and sanitized evidence links. Explain unrun or inapplicable checks.
- Include screenshots and UI parity checklist for renderer changes.
- Include migration and rollback notes for database changes.
- State security/privacy/platform-policy impact.
- List unresolved issues.
- Pass CI before merge.

## Definition of done
A task is not done merely because it compiles or appears in the UI. It must satisfy the acceptance criteria, tests and evidence in the relevant Phase plan. A workflow is READY only for the device/app/account profile that has been certified.


## Reporting and coverage

Report the start time/timezone, Phase/task, scope and intended checks before work. At meaningful checkpoints give elapsed time, exact files changed since the previous checkpoint and the current blocker/result. Finish with end time/timezone, elapsed time, files, actual tests, acceptance still missing and next authorized action. Unknown historical start times remain unknown.

Track requirement → task → test → evidence → accepted capability/profile. A count is meaningful only with a stated denominator and exclusions; do not replace acceptance with an arbitrary completion percentage. Required unrun hardware tests mean blocked acceptance, even if static or mock tests pass.

## Change history

- 2026-10-30: Aligned sequential work/exception rules, draft-plan boundaries, evidence privacy and time-stamped reporting with the execution playbook.
