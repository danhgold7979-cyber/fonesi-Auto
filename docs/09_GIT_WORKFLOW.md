# GitHub Workflow — Branches, Commits, Pull Requests and Releases

Repository: danhgold7979-cyber/fonesi-Auto  
Default branch: main  
Current planning branch: planning/clean-slate-master-plan

## 1. Recommended model

Use a phase integration branch plus short-lived task branches.

Do NOT create one branch for every commit or tiny edit. Do NOT create all Phase branches at the beginning. Create only the branch for the Phase currently authorized.

### Branch roles

| Branch | Purpose | Lifetime | Merge target |
|---|---|---|---|
| main | Stable, accepted project milestones | Permanent | — |
| planning/clean-slate-master-plan | Clean-slate planning documents and full V9 UI reference | Until plan is accepted | main via PR |
| phase/00-feasibility | Phase 0 feasibility work and evidence | One Phase | main via PR |
| phase/01-desktop-foundation | Phase 1 integration | One Phase | main via PR |
| feat/p01-01-electron-shell | One substantial feature/task | Short-lived | Active Phase branch |
| fix/p02-03-adb-reconnect | One bug fix | Short-lived | Active Phase branch |
| test/p04-02-ui-automator-spike | One test/feasibility task | Short-lived | Active Phase branch |
| docs/p00-policy-review | One documentation task | Short-lived | Active Phase branch |

The examples are naming examples, not branches to create now.

## 2. Exact branch lifecycle

### Step A — Approve the plan
1. Keep plan changes on planning/clean-slate-master-plan.
2. Review all plan documents and the complete V9 HTML.
3. Open a PR from planning/clean-slate-master-plan to main.
4. Merge only after the user approves the plan.
5. Do not start production code before Phase 0 entry gates are approved.

### Step B — Start a Phase
1. Create one integration branch from the current main: phase/NN-short-name.
2. Update the Phase status and link the authorized task IDs.
3. Use this branch as the integration target for that Phase.
4. Keep only one active Phase integration branch at a time for this project.

### Step C — Implement a task
1. For a substantial task, create a short-lived branch from the active Phase branch.
2. Name it feat/pNN-TT-short-name, fix/pNN-TT-short-name, test/pNN-TT-short-name or docs/pNN-TT-short-name.
3. Make a focused change for one task ID.
4. Run the relevant tests and inspect the diff.
5. Commit with a specific Conventional Commit message.
6. Push the task branch and open a PR into the active Phase branch.
7. Merge only after review and required checks pass.
8. Delete the merged task branch after verifying the merge.

For a very small documentation-only correction, a direct commit to the active Phase branch may be allowed if the user explicitly authorizes it. Never do this on main.

### Step D — Close a Phase
1. Run the complete Phase test suite.
2. Verify every Phase exit criterion in docs/04_MASTER_IMPLEMENTATION_PLAN.md.
3. Attach test logs, screenshots, hardware evidence and known limitations.
4. Update docs/PHASE_STATUS.md.
5. Open a PR from phase/NN-short-name to main.
6. Merge only after the user approves the Phase acceptance.
7. Tag the accepted milestone if appropriate.
8. Start the next Phase from the updated main.

## 3. Should every Phase have its own branch?

Recommended answer: YES for a substantial Phase, but NOT one branch per tiny task or commit.

Why:
- The Phase branch isolates unfinished work from the stable main branch.
- Task branches keep individual changes small and reviewable.
- The Phase PR provides one clear acceptance point.
- After Phase merge, main represents a working milestone.
- The next Phase starts from a known stable base.

If a Phase is very small (one or two independent commits), it may be implemented on a single Phase branch without nested task branches.

## 4. Branch naming rules

Use lowercase kebab-case and include the Phase/task number where possible.

- phase/00-feasibility
- phase/01-desktop-foundation
- feat/p02-01-adb-discovery
- feat/p03-02-screen-wall-streams
- fix/p02-07-device-actor-race
- test/p04-03-vietnamese-ocr
- docs/p00-meta-policy-review
- hotfix/critical-startup-crash

Do not use generic names such as dev, new, test1, final, latest or update.

## 5. Commit format

Use Conventional Commits:

~~~text
<type>(<scope>): <imperative summary>
~~~

Examples:
- docs(plan): add phase 0 feasibility checklist
- feat(device): discover USB-connected Android devices
- feat(screen-wall): render video-only device streams
- fix(adb): prevent unscoped commands with multiple devices
- test(vision): add Vietnamese OCR fixtures
- refactor(scheduler): isolate recurrence calculation
- build(windows): package pinned Android platform tools

Allowed types: feat, fix, test, docs, refactor, build, ci, chore, perf, security.

Rules:
- One logical change per commit.
- Use an imperative, specific summary.
- Do not use vague messages such as update, changes or fix stuff.
- Do not combine unrelated modules in one commit.
- Commit only after relevant tests pass.
- Never commit secrets, generated runtime data, local databases, private device screenshots or machine-specific configuration.
- Commit lockfiles when dependency manifests change.

## 6. Pull request rules

Every PR must:
- Link a Phase/task ID.
- Explain the problem and intended change.
- List files/modules changed.
- Include test commands and actual results.
- Include screenshots and UI parity checklist for renderer changes.
- Include migration and rollback notes for database changes.
- State security, privacy and platform-policy impact.
- List unresolved issues.
- Pass CI before merge.

A PR is not accepted just because the build passes. Acceptance criteria and evidence must also pass.

## 7. Main branch protection

Configure GitHub branch protection for main:
- Require pull requests; block direct pushes.
- Require CI checks: typecheck, lint, unit tests, integration tests as applicable.
- Require at least one approval where the account setup permits it; for a solo project, use an explicit self-review checklist if GitHub cannot enforce a second reviewer.
- Require conversation resolution.
- Block force pushes and branch deletion.
- Do not enable automatic merge for Phase PRs.
- Do not merge when required checks are skipped or failing.

## 8. Repository state observed when this policy was drafted

- main contained only an older README that said the implementation baseline would be brought over from fonesi-W. That statement conflicts with the approved clean-slate direction.
- feat/facebook-fixed-workflows also contained only that older README at the time of inspection; it is not an authorized implementation branch.
- planning/clean-slate-master-plan contains the clean-slate plan and V9 UI reference.

Do not base new work on feat/facebook-fixed-workflows. Do not delete it without approval. First merge the approved planning branch to main through a PR; that PR will replace the stale main README and add the clean-slate documents.

## 9. Current state and next authorized Git operation

Current state:
- Planning branch: planning/clean-slate-master-plan
- Application code: not started
- Main: not yet synchronized with the clean-slate plan
- No Phase implementation branch is authorized yet

Next operation after plan review:
1. Create a PR from planning/clean-slate-master-plan to main.
2. Review and merge only after user approval.
3. Then create phase/00-feasibility from the updated main.
