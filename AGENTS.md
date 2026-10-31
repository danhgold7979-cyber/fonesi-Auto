# Fonesi-Auto — Instructions for AI Coding Agents

These rules apply to every AI coding agent and contributor in this repository.

## 1. Verify the repository before every task

The only authorized application repository is:

- Repository: danhgold7979-cyber/fonesi-Auto
- Remote: https://github.com/danhgold7979-cyber/fonesi-Auto.git
- Product: Fonesi-Auto, a Windows desktop application for managing Android devices through ADB.

Before editing, running commands, committing or pushing:
1. Verify the current working directory is the local clone of fonesi-Auto.
2. Verify git remote -v points to danhgold7979-cyber/fonesi-Auto.
3. Verify the current branch is the task branch explicitly authorized by the user or active plan.
4. Inspect git status --short. Do not overwrite unrelated changes.

Never perform application work in danhgold7979-cyber/fonesi-W.
Never silently switch repositories, remotes or branches.
If repository identity cannot be verified, STOP and ask.

## 2. Clean-slate rule

Do NOT copy, port, fork, cherry-pick or depend on source code, package structure, contracts, database schemas, runtime, tests or implementation decisions from fonesi-W.

Allowed inputs:
- Approved product requirements.
- The complete V9 UI reference at ui-reference/Fonesi-Auto-V9-UI-Reference.html.
- Technical decisions approved and recorded in this repository.

The V9 HTML is a UI reference artifact, not a source-code template for the backend. Design the new application architecture independently.

## 3. Read before coding

Read:
1. README.md
2. docs/00_MASTER_PLAN.md
3. docs/01_PRODUCT_SCOPE.md
4. docs/02_TECHNICAL_ARCHITECTURE.md
5. docs/03_DATA_AND_WORKFLOWS.md
6. docs/04_MASTER_IMPLEMENTATION_PLAN.md
7. docs/05_ACCEPTANCE_AND_RISKS.md
8. docs/06_UI_V9_MAPPING.md
9. docs/12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md
10. docs/08_DECISIONS_AND_OPEN_ITEMS.md
11. docs/09_GIT_WORKFLOW.md
12. docs/11_PHASE_EXECUTION_PLAYBOOK.md
13. docs/13_DOCUMENTATION_CHANGE_POLICY.md

For UI work, inspect the complete V9 HTML before modifying renderer code.

## 4. Documentation maintenance

Follow docs/13_DOCUMENTATION_CHANGE_POLICY.md. Update canonical living documents in place, preserve accepted Phase plans and decisions, append superseding decisions instead of erasing history, and never delete historical plan/UI/evidence files without explicit approval.

## 5. Phase and task authorization

The recorded cross-phase exception in `docs/phases/PHASE-01-PROVISIONAL-SOURCE-AMENDMENT-01.md` was narrowly approved 01:23 UTC on 2026-10-31. P1-01-S is reviewed; P1-03-S entry approved 01:39 UTC; P1-11-S still requires parent entry approval. Current source branch is `phase-01` under the user's one-branch-per-phase direction. No full Phase 1 opening/acceptance, privileged runtime or original Phase 0 gate waiver follows; all other rules remain.


- Work on one Phase at a time; never start a later Phase before the current Phase is accepted and merged.
- Before each Phase, re-read the Master Plan and all relevant product/architecture/acceptance documents.
- Create a detailed Phase Plan from docs/templates/PHASE_PLAN_TEMPLATE.md and obtain explicit user approval before production coding.
- Work only on the currently authorized Phase and task ID.
- Complete the full test/review/commit loop for the current task before moving to the next task. Independent tasks within the same active Phase may run concurrently only under an explicit, recorded user-approved exception in docs/11_PHASE_EXECUTION_PLAYBOOK.md §6; never infer an exception from multiple IN_PROGRESS rows.
- Drafting or reviewing future Phase plans is documentation work, not permission to execute them. Documentation-review completion is not Phase acceptance.
- Preserve the approved Phase 0 plan. Gate IDs G0-01..G0-19 in the master plan are not the detailed task IDs P0-01..P0-10; use the proposed amendment mapping without treating the amendment as accepted.
- Do not implement later phases early.
- Do not change the approved V9 layout, tab order, screen-wall behavior or workflow structure without explicit approval.
- Do not mark a task complete without tests and acceptance evidence.
- If a requirement is ambiguous, state the exact ambiguity and propose options before implementing.
- If a task depends on an unresolved blocker in docs/08_DECISIONS_AND_OPEN_ITEMS.md, do not guess.

Planning/documentation-review branches are documentation-only. Do not add application source code to them. The 2026-10-30 review branch does not authorize collector changes, device actions, installation, production implementation, publication or merge by itself.

## 6. Technology boundaries

- ADB is the Android transport and device-control plane.
- One serialized Device Actor owns input commands for each device.
- UI Automator is the preferred semantic UI inspection/action layer.
- OpenCV + OCR is the visual fallback when semantic UI information is insufficient.
- Python Vision Worker is isolated and returns recognition results over a defined IPC contract.
- Python must NOT issue competing ADB input commands.
- scrcpy, if approved after feasibility testing, is a video-stream component; it must not create a second input-control path.
- Do not add Meta Graph API posting when the approved scope says ADB-driven app control.
- Do not bypass CAPTCHA, account checkpoints, 2FA, rate limits, platform access controls or anti-abuse protections.

## 7. UI fidelity

- Canonical UI: ui-reference/Fonesi-Auto-V9-UI-Reference.html.
- UI behavior mapping: docs/06_UI_V9_MAPPING.md.
- Preserve layout, dimensions, navigation order, right-side phone monitor, compact device list, phone tile behavior, Dark/Light mode and workflow tree.
- Replace demo data and mock handlers with real typed services; do not redesign the visual system.
- Every UI PR must include before/after screenshots at the same viewport size and a UI parity checklist.

## 8. Coding rules

- TypeScript strict mode for desktop/domain code.
- Typed IPC only; renderer must not spawn arbitrary processes or execute shell commands.
- Every ADB command must target an explicit device serial/transport ID.
- Serialize input per device.
- Use timeouts, cancellation, structured errors and correlation IDs.
- Persist intent before external side effects and verify outcomes afterward.
- Never blindly retry a publish/comment action with an uncertain outcome.
- No secrets, passwords, OTPs, session cookies or proxy credentials in source, logs or commits. Do not put raw device serials, local IPs, user paths, unredacted screenshots/UI trees or raw diagnostic ZIPs in the public repository; retain only reviewed, sanitized evidence.
- Add tests with every feature or bug fix.
- Keep changes scoped; avoid unrelated refactors.

## 9. Git rules

- Never commit directly to main.
- Never force-push.
- Never merge a pull request without explicit user approval.
- Push important passing checkpoints only to the authorized Phase branch.
- The default for one sequential AI/developer is one integration branch per Phase and task-by-task commits on that branch.
- Create a separate task branch only when justified and authorized; a branch does not grant concurrent-work permission. Parallel work still requires the explicit exception record in the playbook.
- Follow docs/09_GIT_WORKFLOW.md and docs/11_PHASE_EXECUTION_PLAYBOOK.md.
- Do not create a branch for every tiny commit.
- Do not delete existing branches without inspecting them and obtaining approval.
- Keep planning documents and application code in their appropriate branches.

## 10. Required report before and after each task

Before editing, report:
- Start timestamp with timezone, current Phase/task, and the scope being started (documentation, feasibility or implementation).
- Verified repository and remote.
- Current branch and HEAD.
- Phase/task ID and acceptance criteria.
- Files expected to change.
- Tests to run.

At meaningful checkpoints, report the current Phase/task, measured elapsed time, exact files changed since the previous checkpoint, result and blocker; never invent historical start times.

After editing, report:
- End timestamp with timezone and elapsed time for this session/task (not an estimate of whole-Phase duration).
- Files changed.
- Commits created and branch pushed, if authorized.
- Tests with exact PASS / FAIL / NOT_RUN / NOT_APPLICABLE results, commands, environment, actual counts, evidence paths and reasons. BLOCKED is a task/gate state, not a passing test.
- State whether the current task is PASS, FAIL or BLOCKED.
- Do not proceed to the next task unless the current task is PASS, the user explicitly defers it with consequences, or a recorded same-Phase independent-task exception applies. Required unrun tests cannot be silently waived.
- Acceptance criteria met/not met.
- Known issues, feature/requirement coverage, decisions awaiting approval and next authorized task. Do not report an arbitrary completion percentage.

If a command or test was not run, state that explicitly. Never claim success based on assumption.

## 11. Change history

- 2026-10-30: Clarified sequential authorization and approved exceptions, immutable Phase 0 baseline, evidence/privacy requirements, and start/checkpoint/end reporting. This governance change itself grants no production or product-behavior authorization.

**2026-10-31 01:23 UTC scoped exception approved:** proposal b7d0e11 now permits only P1-01-S first, with separately reviewed next entries P1-03-S/P1-11-S as recorded in the provisional-source amendment and playbook. Earlier pending notes are historical; all other sequential/acceptance/security rules remain. Full Phase 1 is not opened or accepted.
