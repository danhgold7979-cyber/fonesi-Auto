# Task Pn-xx — [Exact master task title]

**Phase/revision:** [approved plan + amendment link]
**Status:** NOT_STARTED / IN_PROGRESS / PASS / FAIL / BLOCKED / DEFERRED
**Authorized branch / HEAD:** [verified values]
**Owner / reviewer:** [named]
**Coding authorized:** NO until Phase and current task scope approved

## 1. Objective and traceability
- Observable result and user value:
- Canonical requirement + section:
- Stable master task ID / AC-nn gate:
- Supported profile and what remains unavailable:

## 2. Entry and dependencies
- [ ] Verify `pwd`, `git remote -v`, `git branch --show-current`, `git rev-parse HEAD`, `git status --short`; preserve unrelated changes.
- [ ] Read AGENTS, approved Phase plan, relevant specs/decisions, [accepted checklist](../16_ACCEPTED_PRODUCT_DECISIONS.md), docs/13 and relevant local skills.
- [ ] Phase 0/predecessor accepted and merged; only one active Phase; current task authorized.
- [ ] Prior task PASS or user-approved deferral; direct dependency evidence verified.
- [ ] No unresolved policy, architecture, identity or benchmark blocker.
- [ ] Backup/rollback and lab data/device permissions verified before mutation.

| Dependency | Required approval / test evidence | Actual state | Blocking consequence |
|---|---|---|---|
| [task/ADR/permission/fixture] | [link] | [actual] | [specific] |

## 3. Scope and proposed changes
### Included
- [Behavior, inputs/outputs, interfaces and data constraints.]
### Excluded
- Later-phase behavior, unapproved choices, unrelated refactors and V9 redesign.
- Any fonesi-W source/schema/contracts/tests/runtime reuse.

| File/module (verify actual path at execution) | Change | Compatibility impact | Rollback unit |
|---|---|---|---|
| [proposed] | [specific] | [schema/IPC version] | [disable/revert/restore] |

### Safety contract
- Input validation, typed errors, timeout/cancel, correlation ID and stale-generation rules:
- Privileged process/path/secret boundary:
- Sole Device Actor, whole-workflow owner, safe pause/takeover and exact serial/account/target/capability checks:
- Durable intent, verified outcome, UNKNOWN reconciliation; no blind retries:
- Privacy/redaction/retention and external-action authorization:

## 4. Acceptance cases (test-first)

| Case | Class | Input / state | Action | Expected result and prohibited effect | Required environment |
|---|---|---|---|---|---|
| Pn-xx-P01 | Positive | [fixture] | [operation] | [observable assertion] | [unit/Windows/physical] |
| Pn-xx-N01 | Negative | [invalid/stale/unauthorized] | [attempt] | [safe error; no mutation] | [environment] |
| Pn-xx-F01 | Failure/recovery | [disconnect/crash/timeout] | [inject] | [durable state; no duplicate] | [environment] |
| Pn-xx-R01 | Regression | [prior behavior] | [repeat] | [preserved contract] | [environment] |

UI: same-viewport V9 before/after, Dark/Light, repeated clicks, Close/Cancel, resize and stale updates. Device: wrong serial, reconnect generation, queue order/cancel. Side effect: crash before dispatch, after possible dispatch and before verification; UNKNOWN is not FAILED or safe-to-retry. Measurements: approved workload, repetitions/statistics, target owner and raw evidence, not an invented threshold.

## 5. Commands and evidence

| Layer | Exact command / procedure | Version / environment | Artifact | Actual result |
|---|---|---|---|---|
| Lint/type/unit | [approved harness] | [version] | [log] | NOT RUN |
| Contract/integration | [case IDs; real vs fake] | [host] | [trace] | NOT RUN |
| UI parity | [procedure] | [viewport/scaling] | [screenshots] | NOT RUN |
| Windows/package | [procedure] | [Windows build] | [log/build hash] | NOT RUN |
| AVD/physical/OCR/GPU | [separate applicable tests] | [exact profile] | [manifest/hash] | NOT RUN |

Record task/case ID, UTC time, source SHA, runtime/device/app/locale, expected/actual and artifact references. Source reading, Linux CI, fake transport, AVD and recorded image replay do not prove live Windows/device/GPU behavior. Required test unavailable = BLOCKED; not applicable needs a reviewed reason. Fill runnable commands when the harness exists, not fictional commands now.

## 6. Rollback and recovery
- Safe checkpoint, backup version and restore proof:
- Feature disablement/code rollback:
- Schema/IPC compatibility and downgrade limitations:
- Owned process/temp cleanup; preserve user data and unresolved journals:
- External effects requiring reconciliation, not rollback; old-backup dispatch quarantine even if restored records say NOT_DISPATCHED:
- Operator action / new authorization needed:

## 7. Execution checklist
- [ ] Report repo/branch/HEAD, task/acceptance and expected files before editing.
- [ ] Add tests, implement only authorized scope, run targeted tests.
- [ ] Run lint/typecheck, integration and impacted regression.
- [ ] Execute applicable UI/Windows/physical/performance/package checks; record blocked/unrun.
- [ ] Review full diff, security/redaction, dependencies/licenses and restore.
- [ ] Verify acceptance assertions with evidence; update Phase/status without rewriting accepted baseline.
- [ ] Commit/push only authorized passing checkpoints; verify remote SHA before claiming push.
- [ ] No merge/tag/publish/later Phase without appropriate authorization.

## 8. Actual result
- Files changed:
- Actual commands/procedures, counts and evidence:
- Tests NOT RUN / exact blocker / smallest needed action:
- SHA / committed or uncommitted / remote verification:
- Acceptance PASS/FAIL/BLOCKED and reason:
- Known issues / uncertain effects:
- Next authorized task (not automatic permission):

## 9. Change history
| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 1.2-draft | Added authorization, accepted-checklist input, evidence classes, whole-workflow ownership and restore quarantine |
