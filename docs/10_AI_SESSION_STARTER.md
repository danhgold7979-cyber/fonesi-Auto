# AI Agent Session Starter — Fonesi-Auto

Use this brief at the beginning of every new ChatGPT/Codex/AI coding session. Updated: 2026-10-30.

## Project introduction

You are working on Fonesi-Auto, a clean-slate Windows desktop application for managing Android phones through ADB. The only authorized repository is danhgold7979-cyber/fonesi-Auto.

This is NOT the fonesi-W project. Do not copy or port code, package structures, database schemas, contracts, runtime components or implementation plans from fonesi-W.

The complete V9 interface is the approved UI baseline:
ui-reference/Fonesi-Auto-V9-UI-Reference.html

The desktop app must preserve that interface and replace only demo data/mock handlers with real services. Do not redesign the UI without explicit approval.

## Approved technology direction

- Windows desktop: Electron + TypeScript is the current recommendation, subject to Phase 0 approval.
- Android control: ADB.
- Semantic UI inspection/action: UI Automator.
- Visual fallback: OpenCV + OCR.
- Vision processing: isolated Python worker over IPC; it must never issue competing ADB input.
- scrcpy is a candidate for video-only screen streaming and requires a feasibility/license/resource check.
- Stream FPS, quality/bitrate and resolution must be user-adjustable globally, for selected devices and per device.
- A real-time Host Resource Monitor must read CPU/RAM/GPU/disk/network and stream/worker telemetry, warn on sustained pressure, and adapt preview streams without interrupting active workflows.
- Local persistence: SQLite candidate.
- Local secrets: Windows Credential Manager/DPAPI candidate.

## State and authorization checkpoint

- Initial planning PR #1 is merged; Phase 0 feasibility is APPROVED / IN_PROGRESS, not accepted.
- Read `docs/PHASE_STATUS.md` rather than assuming a new plan means execution started.
- `docs/phases/PHASE-00-feasibility.md` is preserved approved history. Its proposed Amendment 01 must not be treated as approved by its existence.
- G0-01..G0-19 are master feasibility gates; P0-01..P0-10 are detailed Phase 0 tasks. Use the amendment's mapping; do not renumber historical evidence.
- Phase 1–11 plans are DRAFT / NOT APPROVED. Only one Phase executes, strictly in order after predecessor acceptance/merge and current plan approval.
- A complete documentation review is not implementation completion, Phase acceptance or production authorization.

## Product rules

- Fixed workflows; no generic drag-and-drop node editor.
- Many Android devices; no artificial device-record cap, but simultaneous streams/workers are resource-bounded.
- Each phone has one serialized input controller.
- Accounts and targets must be verified before jobs run.
- Scheduler, queue, effect journal, evidence, retry and recovery are first-class.
- All enabled workflows are expected to run unattended; unsupported workflows must remain disabled rather than silently falling back to manual operation.
- Apply accepted DEC-019 / DEC-020 in the decision register: Manual-mode emergency preview throttling defaults OFF and is opt-in; the 30-minute scheduling gap is warning-only, while device/account mutual exclusion remains mandatory; QUEUE/default and other scheduler semantics now resolved by accepted C-10/C-11/C-18/C-19; verification remains pending. Do not invent broader behavior changes.
- No CAPTCHA/checkpoint/2FA/rate-limit bypass, anti-detection evasion, unauthorized data collection or fake engagement.
- The UI V9 reference is mandatory for visual implementation.

## Mandatory reading

Read AGENTS.md and these documents before implementation:
- docs/00_MASTER_PLAN.md
- docs/01_PRODUCT_SCOPE.md
- docs/02_TECHNICAL_ARCHITECTURE.md
- docs/03_DATA_AND_WORKFLOWS.md
- docs/04_MASTER_IMPLEMENTATION_PLAN.md
- docs/05_ACCEPTANCE_AND_RISKS.md
- docs/06_UI_V9_MAPPING.md
- docs/08_DECISIONS_AND_OPEN_ITEMS.md
- docs/09_GIT_WORKFLOW.md
- docs/11_PHASE_EXECUTION_PLAYBOOK.md
- docs/12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md
- docs/13_DOCUMENTATION_CHANGE_POLICY.md
- docs/PHASE_STATUS.md
- The current approved Phase plan and any separately approved amendments
- docs/templates/PHASE_PLAN_TEMPLATE.md
- docs/templates/TASK_TEMPLATE.md

## Mandatory phase-by-phase workflow

- Only one Phase is active at a time.
- At the beginning of every Phase, re-read the full Master Plan and relevant specifications.
- Prepare a detailed Phase Plan using docs/templates/PHASE_PLAN_TEMPLATE.md.
- Do not write production code until the user approves that Phase Plan.
- Implement one task at a time. For each task: test, code, test again, self-review, then commit and push when PASS.
- If a task fails, fix and retest it before moving to the next task. If a required hardware test cannot run, mark BLOCKED, not PASS.
- Use one Phase branch by default. Independent same-Phase work needs the explicit approved exception in playbook §6; a task branch, multiple agents or several historical IN_PROGRESS rows do not establish authorization.
- Finish the entire Phase regression and acceptance report before opening a PR to main.

## Mandatory preflight

Before editing anything, report start timestamp/timezone and:
1. Current repository remote.
2. Current branch and HEAD.
3. Clean/dirty working tree.
4. Authorized Phase and task ID.
5. Acceptance criteria.
6. Files expected to change.
7. Tests to run.
8. Scope type (documentation / feasibility / production), approval evidence and the active sequential task or approved same-Phase exception.

If the remote is not danhgold7979-cyber/fonesi-Auto, stop. If the current branch is not the authorized task branch, stop. Never commit directly to main or force-push.

## Task to execute

Phase: [FILL IN]
Task ID: [FILL IN]
Scope type: [FILL IN]
Start time/timezone: [FILL IN]
Authorization / approved amendment or exception: [LINK OR NONE]
Issue/PR: [FILL IN]
Acceptance criteria: [PASTE EXACT CRITERIA]

Implement only this task. Do not expand scope. Follow docs/11_PHASE_EXECUTION_PLAYBOOK.md exactly. Do not claim completion without test output and acceptance evidence. Push only to the authorized branch and open a PR to the target branch specified in docs/09_GIT_WORKFLOW.md. Do not merge without user approval.


## Checkpoint and completion report

At meaningful checkpoints state current Phase/task, measured elapsed time, exact files changed since the previous checkpoint, findings and blocker. At the end report end timestamp/timezone, elapsed time, files, commit/remote/PR verification if authorized, requirement coverage and next authorized action.

List each required check as PASS / FAIL / NOT_RUN / NOT_APPLICABLE with command, environment, result counts, reason and sanitized evidence. A static review does not prove Windows, emulator, real-device, UI or packaging acceptance. Do not replace this matrix with an arbitrary completion percentage. Do not publish raw device serials, IPs, usernames/paths, sensitive screenshots/UI trees or host ZIPs.

## Change history

- 2026-10-30: Added factual baseline/Phase status, draft/amendment authorization boundaries, approved behavior-decision pointers, explicit test evidence and start/elapsed/end reporting.

## Accepted checklist synchronization — 2026-10-30

Read [accepted C-01–C-22](16_ACCEPTED_PRODUCT_DECISIONS.md) before interpreting historical open questions. Product choices are accepted; exact engineering values, feasibility proofs, Phase 0 amendment acceptance, phase coding authorization and main merge remain separate gates. No result is PASS solely from checklist approval.
