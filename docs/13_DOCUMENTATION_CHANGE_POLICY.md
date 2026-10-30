# Documentation Change & Versioning Policy

**Revision:** 1.0-draft  
**Repository:** danhgold7979-cyber/fonesi-Auto  
**Purpose:** Keep one clear current source of truth while preserving approved decisions and historical plans.

## 1. The short rule

**Update current canonical documents in place; preserve history through Git. Do not delete old plans or create duplicate "final-v2-final" files.**

There are three different document classes:

1. Living documents — update the existing file when current requirements or architecture change.
2. Append-only decision records — add a new decision/ADR; do not erase or rewrite the historical decision.
3. Approved Phase plans — preserve the approved baseline; record approved changes as amendments and freeze the final accepted version.

## 2. Living documents — update the existing file

These files describe the current approved product and engineering baseline. When a requirement changes, edit the relevant existing file, update its revision/date and add a concise entry to its Change History section.

| Canonical file | What belongs here |
|---|---|
| README.md | Project introduction, entry points and current status |
| docs/00_MASTER_PLAN.md | Overall product outcome and delivery stages |
| docs/01_PRODUCT_SCOPE.md | Current user-visible requirements and scope |
| docs/02_TECHNICAL_ARCHITECTURE.md | Current architecture and technology boundaries |
| docs/03_DATA_AND_WORKFLOWS.md | Current domain entities, schemas and workflow definitions |
| docs/04_MASTER_IMPLEMENTATION_PLAN.md | Current phase order, task scope and dependencies |
| docs/05_ACCEPTANCE_AND_RISKS.md | Current acceptance gates, test matrix and risks |
| docs/06_UI_V9_MAPPING.md | Current mapping to the canonical V9 UI |
| docs/12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md | Current host telemetry, FPS/quality controls and resource policies |
| docs/11_PHASE_EXECUTION_PLAYBOOK.md | Current rules for phase-by-phase delivery |
| AGENTS.md / CONTRIBUTING.md | Current mandatory contributor and AI-agent rules |
| docs/PHASE_STATUS.md | Current evidence-backed status only |

Do not make a new copy of a living document for every small change. Example: update docs/01_PRODUCT_SCOPE.md rather than creating PRODUCT_SCOPE_v2_final.md.

## 3. Append-only records — never erase history

### 3.1 Decision register

- Add a new decision ID to docs/08_DECISIONS_AND_OPEN_ITEMS.md.
- Do not silently replace an old decision.
- If a decision changes, mark the old decision SUPERSEDED and add a new decision that references the old ID, explains why it changed, who approved it and when.
- Keep unresolved questions open until answered; do not convert a proposal into CONFIRMED without user approval.

### 3.2 Architecture Decision Records (ADRs)

For material architecture decisions, create a new file:
- docs/decisions/ADR-0001-electron-desktop-shell.md
- docs/decisions/ADR-0002-adb-device-actor.md
- docs/decisions/ADR-0003-stream-resource-policy.md

Each ADR contains: context, decision, alternatives, consequences, evidence, status (PROPOSED/ACCEPTED/SUPERSEDED) and links to related Phase tasks.

Do not rewrite an accepted ADR to make history disappear. Create a superseding ADR and cross-link both.

### 3.3 Change requests

For a product-scope change that affects multiple modules or phases, create:
- docs/changes/CHANGE-YYYYMMDD-NNN-short-name.md

Record the request, reason, affected documents/phases, impact analysis, recommendation, user decision and implementation links. After approval, update the living documents and relevant plans.

## 4. Phase plans — approved baseline and amendments

Phase plans are not generic living documents; they are execution agreements.

### Before approval
- The draft Phase Plan may be edited in place while it is being reviewed.
- Update its revision and change history as decisions are clarified.

### After approval, before/during execution
- Preserve the approved scope and acceptance baseline.
- A typo or clarification that does not change scope may be corrected with a dated change-history entry.
- A scope, architecture, dependency, task or acceptance change requires a numbered amendment:
  docs/phases/PHASE-02-adb-device-fleet-AMENDMENT-01.md
- The amendment must explain the original baseline, proposed change, reason, impact and user approval.
- Do not implement an unapproved amendment.

### After Phase acceptance
- Freeze the accepted Phase Plan and its acceptance report as historical records.
- Do not rewrite the accepted baseline to match later work.
- A later change belongs to a future Phase plan or a new amendment/change request.

## 5. Templates and reference artifacts

- Templates are living documents and are updated in place.
- The complete V9 HTML at ui-reference/Fonesi-Auto-V9-UI-Reference.html is a canonical reference artifact. Do not overwrite it with a mock or simplified redraw.
- If the user explicitly approves a new UI version, add a new versioned reference file (for example V10) and update the UI baseline pointer. Keep V9 for historical comparison.
- Do not store screenshots or exports as a replacement for the full HTML source.

## 6. Git is the history system

Every documentation change must be committed to the authorized branch.

Git provides:
- File history and previous versions.
- Diff between revisions.
- Blame/history of who changed a line.
- Revert of an individual change.
- PR review and approval trail.

Therefore, editing a canonical Markdown file in place does not destroy its prior version. The previous content remains accessible in Git commit history as long as commits are retained.

For a meaningful change:
1. Update the canonical document.
2. Update the decision register or add an ADR/change request if needed.
3. Update impacted Phase plans/templates/status.
4. Add a concise Change History entry.
5. Commit with a Conventional Commit message.
6. Push to the authorized branch.
7. Review the diff in the PR.

## 7. When may a document be deleted?

Do not delete a plan, decision, Phase report, UI reference or test evidence just because it is outdated.

If obsolete:
- Mark it SUPERSEDED or DEPRECATED.
- Add a link to the replacement.
- Move it to docs/archive only when its historical role is clear and the move is reviewed.
- Preserve the Git history.
- Delete only with explicit user approval and a documented reason.

## 8. Naming rules

Use stable, predictable names:
- One canonical path per current living document.
- Sequential IDs for ADRs and decisions.
- Date + sequence for change requests.
- Phase number + stable name for Phase plans.
- Numbered amendments for approved Phase-plan changes.

Avoid:
- plan-new.md
- plan-final.md
- plan-final-v2.md
- plan-final-latest.md
- multiple files that claim to be the current source of truth.

## 9. Required documentation checklist for every requirement change

- [ ] Identify the canonical document(s) affected.
- [ ] Update the existing living document(s) in place.
- [ ] Add a decision entry or ADR if a decision changed.
- [ ] Add a change request if scope spans multiple phases/modules.
- [ ] Update the Phase plan if it is not yet approved; otherwise create an amendment.
- [ ] Update acceptance criteria and tests.
- [ ] Update UI mapping if visible behavior changes.
- [ ] Update README/status links if needed.
- [ ] Add Change History entry.
- [ ] Commit and push to the authorized branch.
- [ ] Report the changed files and commit SHA to the user.

## 10. Example

User requests: "Add FPS and stream quality sliders with live hardware warnings."

Correct documentation update:
1. Update docs/12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md with the detailed control behavior.
2. Update docs/01_PRODUCT_SCOPE.md with the user-visible requirement.
3. Update docs/02_TECHNICAL_ARCHITECTURE.md with HostResourceMonitor and ResourcePolicyEngine.
4. Update docs/04_MASTER_IMPLEMENTATION_PLAN.md with Phase 0 benchmarks and Phase 3 implementation tasks.
5. Update docs/06_UI_V9_MAPPING.md with the control placement in the existing right dock.
6. Add/confirm a decision in docs/08_DECISIONS_AND_OPEN_ITEMS.md.
7. If Phase 0/3 plan is already approved, create an amendment rather than silently changing its baseline.
8. Commit all related documentation changes as one logical docs commit or a small ordered set of commits.

The old document files are not deleted. Git retains their previous revisions.
