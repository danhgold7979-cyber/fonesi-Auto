# AI Agent Session Starter — Fonesi-Auto

Use this brief at the beginning of every new ChatGPT/Codex/AI coding session.

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
- Local persistence: SQLite candidate.
- Local secrets: Windows Credential Manager/DPAPI candidate.

## Product rules

- Fixed workflows; no generic drag-and-drop node editor.
- Many Android devices; no artificial device-record cap, but simultaneous streams/workers are resource-bounded.
- Each phone has one serialized input controller.
- Accounts and targets must be verified before jobs run.
- Scheduler, queue, effect journal, evidence, retry and recovery are first-class.
- All enabled workflows are expected to run unattended; unsupported workflows must remain disabled rather than silently falling back to manual operation.
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

## Mandatory preflight

Before editing anything, report:
1. Current repository remote.
2. Current branch and HEAD.
3. Clean/dirty working tree.
4. Authorized Phase and task ID.
5. Acceptance criteria.
6. Files expected to change.
7. Tests to run.

If the remote is not danhgold7979-cyber/fonesi-Auto, stop. If the current branch is not the authorized task branch, stop. Never commit directly to main or force-push.

## Task to execute

Phase: [FILL IN]
Task ID: [FILL IN]
Issue/PR: [FILL IN]
Acceptance criteria: [PASTE EXACT CRITERIA]

Implement only this task. Do not expand scope. Do not claim completion without test output and acceptance evidence. Push only to the authorized branch and open a PR to the target branch specified in docs/09_GIT_WORKFLOW.md. Do not merge without user approval.
