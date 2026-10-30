# GitHub Workflow — Branches, Commits, Pull Requests and Releases

Repository: danhgold7979-cyber/fonesi-Auto
Default branch: main
Updated: 2026-10-30
Historical planning branch: `planning/clean-slate-master-plan` (PR #1 merged)
Active feasibility branch: `phase/00-feasibility`
Documentation review branch: `plan`

## 1. Recommended model

Use one Phase integration branch as the default. Implement tasks sequentially on that branch and create a commit after each logical task passes its tests. Use short-lived task branches only when independent review or risk isolation justifies the extra overhead. Concurrent same-Phase work additionally requires the explicit user-approved exception record in [the execution playbook](11_PHASE_EXECUTION_PLAYBOOK.md#6-branch-strategy--đơn-giản-tuần-tự-không-rối).

Do NOT create one branch for every commit or tiny edit. Do NOT create all Phase branches at the beginning. Create only the branch for the Phase currently authorized. Only one Phase may be active at a time.

### Branch roles

| Branch | Purpose | Lifetime | Merge target |
|---|---|---|---|
| main | Stable, accepted project milestones | Permanent | — |
| planning/clean-slate-master-plan | Historical clean-slate planning baseline | PR #1 already merged | Historical main PR |
| plan | Documentation normalization only; based on Phase 0 snapshot `34b9649` | This review | Draft PR to phase/00-feasibility; no merge without approval |
| phase/00-feasibility | Phase 0 feasibility work and evidence | One Phase | main via PR |
| phase-01 | Phase 1 integration | One Phase | main via PR |
| feat/p01-01-electron-shell | One substantial feature/task | Short-lived | Active Phase branch |
| fix/p02-03-adb-reconnect | One bug fix | Short-lived | Active Phase branch |
| test/p04-02-ui-automator-spike | One test/feasibility task | Short-lived | Active Phase branch |
| docs/p00-policy-review | One documentation task | Short-lived | Active Phase branch |

The examples are naming examples, not branches to create now.

## 2. Exact branch lifecycle

### Step A — Baseline and documentation review
1. Initial planning PR #1 is already merged to `main` at `e85d2c0c67a3aefa11dc390739243653d2b1bbf0`; do not repeat that prerequisite.
2. Current normalization stays on `plan`, based on Phase 0 snapshot `34b9649`, with no source/script/UI-reference edits.
3. Publish only to the authorized documentation branch and draft PR target. Because the base contains unaccepted Phase 0 history, target `phase/00-feasibility`, not `main`; merging to `main` would incorrectly bundle unaccepted feasibility work.
4. Review all changed documents, preserve accepted baselines and label unapproved amendments/drafts. A documentation PR does not close Phase 0 or authorize production implementation.
5. Production code requires accepted/merged Phase 0 and explicit approval of the next Phase plan. Publication approval is not merge approval.

### Step B — Start a Phase
1. After predecessor Phase acceptance and merge, create the authorized integration branch from the current accepted main: phase-NN. Do not recreate Phase 0, which is already active.
2. Update the Phase status and link the authorized task IDs.
3. Use this branch as the integration target for that Phase.
4. Keep only one active Phase integration branch at a time for this project.

### Step C — Implement a task
1. Read the approved Phase Plan and select the next task ID.
2. Implement that task on the active Phase branch by default.
3. Run the task tests, review the diff and verify acceptance criteria.
4. Only when the task is PASS, commit with a specific Conventional Commit message and push the Phase branch.
5. Do not start the next task while the current task is FAIL or has unrun required tests, unless a recorded user-approved deferral or same-Phase independent-work exception applies. Neither option silently waives required Phase exit evidence.
6. If the task needs authorized isolation/review, create a short-lived task branch named feat/pNN-TT-short-name, fix/pNN-TT-short-name, test/pNN-TT-short-name or docs/pNN-TT-short-name.
7. A task branch PR targets the active Phase branch, never main.
8. Merge the task branch into the Phase branch only after review and required checks pass.
9. Delete a merged task branch only after verifying the merge and obtaining explicit deletion approval.

For a sequential solo AI/developer workflow, do not create task branches by default; the Phase branch plus logical commits is simpler and easier to continue across sessions.

### Step D — Close a Phase
1. Run the complete Phase test suite.
2. Verify every Phase exit criterion in docs/04_MASTER_IMPLEMENTATION_PLAN.md.
3. Attach reviewed, sanitized test logs, screenshots, hardware evidence and known limitations; never publish raw device/host bundles.
4. Update docs/PHASE_STATUS.md.
5. Open a PR from phase-NN to main.
6. Merge only after the user approves the Phase acceptance.
7. Tag the accepted milestone if appropriate.
8. Start the next Phase from the updated main.

## 3. Should every Phase have its own branch?

Recommended answer: YES, each Phase has one integration branch. For a single AI/developer working sequentially, code tasks directly on that Phase branch and commit after each task passes. Task branches are optional, not mandatory.

Why:
- The Phase branch isolates unfinished work from stable main.
- Task-by-task commits create clear checkpoints and simplify rollback.
- Avoiding unnecessary nested branches reduces merge conflicts and context switching.
- The Phase PR provides one clear acceptance point.
- After Phase merge, main represents a working milestone.
- The next Phase starts from a known stable base.

## 4. Branch naming rules

Use lowercase kebab-case and include the Phase/task number where possible.

- phase/00-feasibility
- phase-01
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
- Never commit secrets, generated runtime data, local databases, private device screenshots or machine-specific configuration. Redact device serials, IPs, local usernames/paths and UI-tree personal data from public evidence.
- Commit lockfiles when dependency manifests change.

## 6. Pull request rules

Every PR must:
- Link a Phase/task ID.
- Explain the problem and intended change.
- List files/modules changed.
- Include exact test commands, environment, counts and PASS / FAIL / NOT_RUN / NOT_APPLICABLE results with sanitized evidence links; state why checks were not run.
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

## 8. Historical repository observations — preserved context

The original policy observed an older README on `main` and `feat/facebook-fixed-workflows`, and an unmerged clean-slate planning branch. That was a **pre-PR #1 snapshot**, not the current state. PR #1 replaced the stale main baseline and established the clean-slate plan. Keep `feat/facebook-fixed-workflows` unauthorized; do not use or delete it without a separate approved action.

## 9. Current state and next authorized Git operation — 2026-10-30

- Planning PR #1: merged at `e85d2c0c67a3aefa11dc390739243653d2b1bbf0`.
- Phase 0: approved feasibility work, still IN_PROGRESS; baseline snapshot `34b9649`, no Phase acceptance yet.
- Current documentation normalization: `plan`, no production/source changes.
- Publication: user authorized this documentation branch and a **draft PR**, not merge. Reviewers must validate the final branch head and PR base before publication.
- Application production code: NOT_STARTED / NOT AUTHORIZED.
- Next execution step: clarify/select the next authorized Phase 0 task under the playbook, not Phase 1 coding.

After local documentation checks pass, commit/push only within the publication authorization and open the draft PR against `phase/00-feasibility`. Report exact commit SHA, remote verification, PR URL and checks. Do not mark the normalization accepted merely because the PR exists; do not merge without explicit approval.

## 10. Documentation updates

Follow [Documentation Change & Versioning Policy](13_DOCUMENTATION_CHANGE_POLICY.md). Living canonical documents are edited in place and their previous revisions remain in Git history. Decision records and accepted Phase baselines are preserved; superseding decisions and approved Phase changes are appended as new records/amendments. Never delete historical plans or evidence without explicit user approval.

## 11. Change history

- 2026-10-30: Reconciled merged PR #1 and active Phase 0; documented scoped normalization/draft-PR routing, strict sequential execution and approved exception/deletion rules; separated publication, merge and Phase acceptance.


## Short branch names — user request 2026-10-30

Target convention: `main` (accepted baseline), `phase-00`, `phase-01`, … (only one active phase), and temporary `plan` for a document review. Task commits stay on the active phase; avoid a new branch for each small task. A temporary document branch is removed only after its changes are accepted/merged and history recovery is verified.

The local documentation branch was renamed from `docs/plan-readiness-2026-10-30` to `plan` before publication. Remote Phase 0 is still `phase/00-feasibility` until its rename to `phase-00` is verified. Do not claim or link the new name as existing before verification. See [branch cleanup status](17_BRANCH_CLEANUP.md). Historical approved phase/evidence files retain their original branch labels; the verified rename record provides the alias.
