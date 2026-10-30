# Contributing to Fonesi-Auto

## Before starting
1. Verify the repository remote is danhgold7979-cyber/fonesi-Auto.
2. Read AGENTS.md.
3. Read the active Phase in docs/04_MASTER_IMPLEMENTATION_PLAN.md.
4. Confirm the issue/task ID and acceptance criteria.
5. Start from the current approved base branch. Do not use an old or unrelated branch.

## Branching
Follow docs/09_GIT_WORKFLOW.md.

- main is the last accepted, stable milestone.
- phase/NN-short-name is the temporary integration branch for one Phase.
- feat/..., fix/..., test/... and docs/... are short-lived task branches.
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
- Never commit secrets, generated runtime data, local databases, private device screenshots or machine-specific configuration.
- Commit lockfiles when dependency manifests change.

## Pull request requirements
Every PR must:
- Link a Phase/task ID.
- Explain the problem and intended change.
- List files/modules changed.
- Include test commands and actual results.
- Include screenshots and UI parity checklist for renderer changes.
- Include migration and rollback notes for database changes.
- State security/privacy/platform-policy impact.
- List unresolved issues.
- Pass CI before merge.

## Definition of done
A task is not done merely because it compiles or appears in the UI. It must satisfy the acceptance criteria, tests and evidence in the relevant Phase plan. A workflow is READY only for the device/app/account profile that has been certified.
