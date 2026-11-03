# PHASE-NN — [Name]

**Revision/date:** [revision / YYYY-MM-DD]
**Plan status:** DRAFT / PENDING_APPROVAL / APPROVED / AMENDED / FROZEN
**Execution status:** NOT_STARTED / IN_PROGRESS / BLOCKED / READY_FOR_REVIEW / ACCEPTED
**Coding authorized:** NO until expressly approved below
**Repository:** `danhgold7979-cyber/fonesi-Auto`
**Proposed branch:** `phase-NN` (not permission to create it)
**Execution base:** accepted `main` @ [SHA verified at entry]
**Owner / reviewer / decision owner:** [named at approval]

> A draft plan is not execution authorization. Phase 0 and the immediately preceding Phase must be accepted and merged before this Phase starts; explicit approval of this plan is also required. Technical independence does not authorize parallel phases. Preserve accepted plans; material changes require numbered, approved amendments under docs/13_DOCUMENTATION_CHANGE_POLICY.md.

## 1. Outcome and source mapping

State the concrete result and what remains unavailable afterward. Read AGENTS.md, README, docs/00–06, docs/08–09, docs/11–13, Phase Status, [accepted product checklist](../16_ACCEPTED_PRODUCT_DECISIONS.md) and relevant decisions. Inspect the complete V9 HTML before renderer work. All code, schemas and contracts are clean-slate; no fonesi-W source reuse.

| Canonical requirement / section | Stable master tasks | Acceptance gate | V9 component / workflow |
|---|---|---|---|
| [source] | Pn-xx | AC-nn | [component or not applicable] |

Trace every master task exactly once; do not reuse an ID for a different requirement. New coverage requires a master-plan cross-reference.

## 2. Scope

### Included
- [Specific service/UI/data capabilities.]

### Excluded / still disabled
- [Later-phase behavior, unsupported hardware, unauthorized external actions.]
- No implicit workflow enablement, credential capture, platform safeguard bypass or visual redesign.

## 3. Entry gate and decisions

- [ ] Verify repository, remote, authorized branch, HEAD and working tree; preserve unrelated changes.
- [ ] Phase 0 accepted with mandatory physical evidence; accepted baseline/amendments preserved.
- [ ] Immediately preceding Phase user-accepted and merged; acceptance and merge SHA recorded.
- [ ] This Phase scope, task order, test matrix, owners and conditions expressly approved.
- [ ] Blocking ADRs, policy permissions, host/device matrix and data contracts resolved.
- [ ] Lab accounts/devices/data and side-effect permissions documented.
- [ ] Backup/restore procedure verified before destructive/schema operations.

| Decision / blocker | Exact ambiguity | Affected tasks | Evidence / options | Decider | Status |
|---|---|---|---|---|---|
| [existing ID] | [not a chosen answer] | Pn-xx | [method] | [owner] | OPEN |

Version pins, codecs, OCR thresholds and performance targets must come from measured evidence and recorded approval. For each benchmark specify workload, units, statistics/percentiles, repetitions, environment, raw samples and approver. Missing required evidence is BLOCKED/NOT RUN, never PASS. Do not reopen accepted product decisions as unanswered questions.

## 4. Technical design and proposed files

- Components/services and ownership of device input, processes, leases, effects and secrets.
- Proposed module/file paths (distinguish planned paths from existing code).
- Entities, keys, constraints, schema versioning, retention and deletion rules.
- Typed IPC request/result/event contracts, validation, compatibility, error, timeout/cancel and correlation ID.
- State transitions, identity/generation checks, verified success and unknown-effect recovery.
- Resource bounds, queue/backpressure and requested versus effective settings.
- Supported profile matrix and invalidation on app/device/host change.

## 5. V9 parity

| V9 component | Service replacing demo handler | Behavior / states | Same-viewport evidence |
|---|---|---|---|
| [tab/dock/table/dialog] | [typed service] | [specific] | [screenshots + tests] |

Preserve six-tab navigation, Dark/Light, compact device dropdown, right dock, whole-tile zoom, inside/outside wheel routing and fixed workflow tree. Disabled entries show truthful reasons. Approved additions stay within the existing layout.

## 6. Task order and detailed work packages

All tasks begin NOT_STARTED. Specify an explicit sequential topological order; stable IDs need not imply numerical execution order. Complete the current task's required tests/review/checkpoint before the next task. A deferral requires the user's decision and downstream impact analysis.

| ID | Deliverable | Direct dependencies | Proposed files/modules | Required test classes | Status |
|---|---|---|---|---|---|
| Pn-xx | [observable] | [task/decision] | [path/responsibility] | [unit/Windows/device/etc.] | NOT_STARTED |

### Pn-xx — [Exact master task title]
- **Deliverable/dependencies:** specific behavior, interfaces, constraints, upstream task/approval evidence; inherited entry gates still apply.
- **Positive tests:** inputs, observable output and assertions, not merely “works.”
- **Negative/failure tests:** invalid/stale/unauthorized state, repeated action, timeout, cancellation, disconnect/crash as applicable; assert safe outcome and absence of prohibited effects.
- **Evidence/acceptance:** case IDs/logs, fixture hashes, source SHA, environment/version matrix, required UI/physical evidence and measurable criterion.
- **Rollback:** disable/revert/restore, owned cleanup, preserved journal/evidence; irreversible effects require reconciliation, not an assumed undo.

## 7. Safety, privacy and recovery

- Typed IPC only; renderer has no arbitrary shell, unrestricted path access or long-lived secrets.
- Exact device serial/generation and one Device Actor own input; Python and video workers cannot compete. Hold whole-workflow ownership too: conflicting manual input/APK/proxy mutation is refused until explicitly authorized pause/takeover drains/reconciles and invalidates stale UI/identity evidence.
- Verify account/target and policy/capability before dispatch; recheck on state changes.
- Persist intent before side effects; uncertain outcome enters UNKNOWN/reconciliation, never blind retry.
- No passwords/OTP/cookies/raw tokens in DB/logs/fixtures; redact personal data, retain only permitted evidence.
- CAPTCHA/checkpoint/2FA/rate limits stop safely; legitimate recovery is not bypass or silent manual fallback in a READY workflow.
- Apply accepted C-13/C-14/C-21/C-22 retention/backup defaults; document key/restore verification, schema compatibility and owned cleanup. An older backup quarantines dispatch until post-snapshot effects are reconciled; restored NOT_DISPATCHED is not evidence an external effect never occurred.
- Reverting code does not undo a publish/comment/install; retain unresolved effects and obtain authority for corrective external actions.

## 8. Test strategy and evidence contract

| Layer | Procedure / exact command once harness exists | Environment | Required assertion / artifact |
|---|---|---|---|
| Docs/source | ID coverage, links, diff/secret review | Current checkout | No omitted IDs or unsupported claims |
| Static/unit | Actual approved harness commands | Pinned runtime | Type/lint/domain output |
| Contract/integration | Storage/process tests, explicitly identified fakes | Approved host | Failure/recovery traces |
| UI | V9 before/after and interactions | Same viewport/scaling | Parity screenshots |
| Windows | Runtime/secret-store/process/package tests | Approved builds | OS-specific results |
| AVD | Repeatable fixtures/lifecycle | Named image/build | Emulator-only result |
| Physical Android | Explicit device/app/locale tests | Authorized devices | Isolation/recognition/effect evidence |
| Performance/OCR/GPU | Approved workload/raw samples/holdout | Exact hardware/driver | Approved benchmark and availability |

At approval replace procedure placeholders with commands and case/fixture IDs; do not invent runnable commands before a harness exists. Each run records task/case ID, UTC time, SHA, versions, host/device/app/locale, sanitized input, expected/actual result, PASS/FAIL/BLOCKED/NOT_RUN, artifact location and hash. Private raw data stays in an approved private location. Source/Linux/mock/AVD/Windows/physical/OCR/GPU evidence are distinct; one does not certify another.

## 9. Risks and limitations

| Risk | Observable failure | Mitigation / stop condition | Owner | Residual limitation |
|---|---|---|---|---|
| [canonical or phase-specific] | [signal] | [safe behavior] | [owner] | [truthful scope] |

## 10. Phase exit

- [ ] Every master task PASS or explicitly deferred with downstream/release consequences recorded.
- [ ] Required positive/negative/failure, full regression, build and Windows/physical tests actually passed.
- [ ] Relevant AC-nn gate met; unknown/unsupported cannot masquerade as success.
- [ ] Measured targets and supported matrix approved; no universal performance promises.
- [ ] V9 parity, security/privacy, backup/restore and rollback verified.
- [ ] Canonical docs/status and evidence index updated without rewriting accepted history.
- [ ] Acceptance report contains commit range, evidence, limitations and user decision.
- [ ] User acceptance and authorized merge recorded before next Phase begins.

## 11. Approval and execution

- User decision: **PENDING**.
- Approved scope/conditions/deferrals: **NONE RECORDED**.
- Coding authorized: **NO**.
- Approval reference/date: **NOT RECORDED**.
- Application/hardware tests: **NOT RUN — planning only**.

| Date | Task | SHA / branch | Actual tests / evidence | Result |
|---|---|---|---|---|
| — | — | — | No execution recorded | NOT_STARTED |

## 12. Change history

| Date | Revision | Change | Authorization effect |
|---|---|---|---|
| 2026-10-30 | 1.2-draft | Added authorization, traceability, evidence classes, accepted-checklist input, whole-workflow ownership and restore quarantine | Template only; no Phase authorized |
