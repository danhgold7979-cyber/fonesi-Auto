# PHASE-01 — Repository and desktop foundation

**Revision:** 1.1-draft · **Date:** 2026-10-30
**Plan:** DRAFT / NOT AUTHORIZED · **Execution:** NOT_STARTED
**Proposed branch:** `phase-01` — not created by this plan
**Execution base:** accepted `main` SHA to be recorded after Phase 0 acceptance and merge
**Owner/reviewer:** assign at approval · **Coding authorized:** NO

> Phase 0 remains unfinished. This plan supplies future execution detail, not permission to start application code. Approval of the planning cleanup is not approval of this Phase. No code, runtime tests or hardware results are claimed here.

## 1. Outcome, scope and sources

Deliver a secure, packaged Windows foundation with the **complete V9** navigation/layout, durable local settings, test harness and no enabled platform automation. Trace P1-01…P1-11 in [master tasks](../04_MASTER_IMPLEMENTATION_PLAN.md), acceptance AC-01 in [acceptance](../05_ACCEPTANCE_AND_RISKS.md), and [architecture](../02_TECHNICAL_ARCHITECTURE.md), [data](../03_DATA_AND_WORKFLOWS.md), [V9 mapping](../06_UI_V9_MAPPING.md), [decisions](../08_DECISIONS_AND_OPEN_ITEMS.md).

In scope: desktop lifecycle, privileges, typed contracts, initial persistence, secrets abstraction, mock isolation, UI shell and CI. Out of scope: ADB input, streams, real accounts, publishing, workflow execution, later-phase schemas implemented prematurely, or V9 redesign. No source, packages, contracts, tests or architecture are copied from fonesi-W.

## 2. Entry, decisions and dependency order

**Pending amendment:** [provisional source exception01](PHASE-01-PROVISIONAL-SOURCE-AMENDMENT-01.md) proposes only P1-01-S/P1-03-S/P1-11-S under the current Phase0 branch. It is not approved; full task entry/order/acceptance below remain unchanged. No renderer or privileged runtime is included.


- Phase 0 accepted with required physical-device feasibility evidence, approved ADRs and merge SHA; accepted Phase 0 baseline stays untouched.
- Verify repo/remote/branch/HEAD/status under AGENTS. Create only this integration branch after express authorization; keep all later Phases NOT_STARTED.
- Accepted C-05 direction is **Electron + strict TypeScript + React + SQLite**, Windows-backed secrets and isolated Python; preserve V9. Exact versions, SQLite binding/migration library, secret-store mechanism, package paths and compatibility still require technical evidence/recorded choices. An incompatible result returns for a decision; do not silently choose another stack. See [accepted checklist C-01…C-22](../16_ACCEPTED_PRODUCT_DECISIONS.md).
- Verify the accepted V9 mapping; review threat model, initial schema slice, test commands and Windows CI/build host. Validate current Windows host first and claim only tested OS support (C-07). Unavailable Windows host blocks Windows acceptance; Linux CI cannot waive it.
- Sequential task order: **P1-01 → P1-03 → P1-11 → P1-02 → P1-04 → P1-05 → P1-06 → P1-07 → P1-08 → P1-09 → P1-10**. Finish required evidence/review for one task before the next. IDs retain master meaning; order is dependency-driven.

## 3. Design and planned modules

P1-01 chooses actual paths on the approved Phase branch. The logical modules below are **proposed responsibilities, not existing source**: desktop main/preload/renderer; shared versioned contracts; domain services; persistence/migrations; secret-store adapter; settings; logging; mock-fixture provider; tests/fixtures; CI/package configuration. The renderer may render only typed service results. Main owns privileged resources. Later phases extend contracts through reviewed versions, not renderer shell shortcuts.

P1-11 reviews entity identity/relationships from docs/03 and reserves compatibility conventions; it does **not** implement later-phase business logic or migrate unused speculative schemas. P1-05 implements only the approved foundation schema slice. Settings store desired state, runtime failures store observed state separately. Startup validates schemas before exposing privileged services; incompatible database versions fail safely with recovery guidance rather than deleting the DB.

## 4. Task work packages

All tasks below are **NOT_STARTED**; tests are planned, not executed. Every task inherits the entry gate and [evidence contract](#6-verification-and-evidence).

### P1-01 — Establish clean folder/package architecture
- **Deliverable/dependencies:** approved Phase 0 stack ADRs → independently designed module/package map, import-direction rules, dependency/license inventory and reproducible bootstrap instructions. Record actual paths and ownership; no inherited fonesi-W structure.
- **Positive:** clean checkout bootstraps using the approved pinned toolchain; renderer imports only allowed UI/contracts; main and future workers have explicit boundaries.
- **Negative:** forbidden renderer→privileged import and circular boundary fixture are rejected; absent dependency/runtime reports a readable setup failure, not an alternate unpinned download.
- **Evidence/acceptance:** architecture map, clean-bootstrap transcript and boundary tests on named host. All dependencies have reviewed origin/version/license and lockfile policy.
- **Rollback:** revert bootstrap/configuration as a unit; remove only generated files owned by this checkout, never global SDKs or unrelated caches.

### P1-02 — Desktop main/renderer/preload and secure IPC
- **Deliverable/dependencies:** P1-03, P1-11 → launch/close lifecycle and minimal versioned bridge. Renderer isolation, restrictive content policy, navigation/window allowlists and validated IPC sender/payloads; no generic shell/process/secret method.
- **Positive:** approved renderer invokes a bounded typed health/settings method; multiple windows and close/reopen release resources cleanly.
- **Negative:** malformed/oversized payload, unsupported version, untrusted sender/navigation, arbitrary command/path and denied method fail without process launch or secret disclosure. Renderer crash does not corrupt persistent state.
- **Evidence/acceptance:** contract/fuzz-negative tests plus Windows packaged smoke; security review demonstrates absent privileged renderer paths.
- **Rollback:** disable affected bridge method; close owned child resources and revert to last verified shell. Preserve diagnostic logs with redaction.

### P1-03 — Strict TypeScript, lint, formatting and test harness
- **Deliverable/dependencies:** P1-01 → approved strict compiler configuration, formatter/linter, unit harness, test naming and coverage of boundaries; document exact commands and pinned runtimes.
- **Positive:** a deterministic fixture passes from a fresh checkout on the approved local Windows development host; lint/type/unit failures report task/case context. P1-10 later binds the same suite to CI, so CI does not block this earlier task.
- **Negative:** intentionally unsafe type, unused rule violation and failing assertion make checks nonzero; skipped tests cannot appear as passed; test isolation prevents state leaking between runs.
- **Evidence/acceptance:** good/bad fixture transcripts and reproducible dependency install; numerical coverage target requires review, not an invented percentage.
- **Rollback:** revert harness config together with dependent scripts; retain failure reproduction fixtures and never bypass a failing check to continue tasks.

### P1-04 — Structured logs, correlation and redaction
- **Deliverable/dependencies:** P1-02 → typed log/event schema with UTC time, severity, correlation/task context, safe error rendering, 30-day technical-log retention (C-13), with unresolved recovery evidence protected; no raw IPC dumps.
- **Positive:** a request's main/preload errors correlate without exposing content; rotation preserves ordered timestamps and bounded retention.
- **Negative:** proxy credential/password/token/OTP/cookie canaries, nested errors, file paths and untrusted multiline values are sanitized; disk-full/write-denied failure does not silently claim logs persisted or leak to fallback console.
- **Evidence/acceptance:** canary scan of logs and crash output, rotation fixture and Windows path/failure tests. No secret-bearing field reaches persistent logs.
- **Rollback:** reduce to safe minimal logging; preserve audit necessity and report missing evidence, never re-enable raw logging as a workaround.

### P1-05 — Migrations, WAL, foreign keys and backup tests
- **Deliverable/dependencies:** P1-04/P1-11 and accepted DB/backup ADR → versioned foundation migrations, transactional migration lock, foreign-key enforcement, safe consistent encrypted local backup/restore and incompatible-version handling. C-13/C-22: backup before migration, at most daily while app runs, and on manual request; seven validated normal copies in a user-chosen folder, no cloud upload. Protect pre-migration copy until upgrade acceptance. No raw password/token columns.
- **Positive:** empty install, repeated launch and prior fixture migration yield identical constraints; online backup includes a consistent snapshot and restores to a separate test location with matching records. Fake-clock tests prove daily coalescing, manual trigger, seven-copy rotation only after validation and protected pre-migration copy.
- **Negative:** migration interruption, corrupt file, missing parent reference, concurrent writer, disk full and unsupported newer schema fail without partial success or destructive reset; a copied live DB without its needed state must not be advertised as a valid backup. Failed backup cannot delete/replace a good copy or let migration proceed. Restore sets dispatch quarantine; an old NOT_DISPATCHED record is not proof no later external effect occurred (C-14). Phase 8 later integrates real-effect reconciliation.
- **Evidence/acceptance:** schema diff, before/after hashes/logs, backup cadence/rotation/quarantine tests on approved Windows filesystem and documented encryption/key portability constraints. Same-machine proof does not certify transfer-to-other-machine restore.
- **Rollback:** pre-migration backup and tested restore into a new location; forward-only migrations prohibit unsupported downgrade. Never overwrite the only user DB or remove journals to hide failure.

### P1-06 — Windows secret-store abstraction
- **Deliverable/dependencies:** P1-02/P1-04/P1-05 and secret-store ADR → scoped create/read/update/delete/reference contract; DB stores opaque references, renderer receives masked status only.
- **Positive:** authorized main service retrieves a lab canary after restart; replacement/delete are consistent and audit events contain references only.
- **Negative:** renderer retrieval attempt, invalid reference, denied Windows access, another user context and missing/decryption-failed secret return typed unavailable states. No plaintext fallback to DB/files/logs.
- **Evidence/acceptance:** real Windows secret-store round-trip, cross-context denial and artifact canary scan. A mock adapter proves contracts only.
- **Rollback:** remove only explicitly created test secrets; preserve user references and offer re-entry/recovery without exporting credentials. Reverting code does not delete existing vault entries automatically.

### P1-07 — App settings, theme persistence and crash recovery
- **Deliverable/dependencies:** P1-05/P1-06 → validated versioned settings for theme/window preferences, startup recovery and atomic saves; no automatic launch of later-phase jobs.
- **Positive:** Dark/Light and approved layout preferences survive normal close/restart; first launch uses documented defaults; interrupted writes recover last committed settings.
- **Negative:** malformed/out-of-range settings, simultaneous edits, reset cancellation and crash during save preserve the previous version or enter a truthful recoverable state; startup must not replay external actions.
- **Evidence/acceptance:** persistence/crash tests plus Windows open/close/relaunch, same-viewport Dark/Light screenshots.
- **Rollback:** retain prior settings revision and a user-approved reset/import path; restore supported preferences without overwriting database/secrets.

### P1-08 — Integrate full V9 layout
- **Deliverable/dependencies:** P1-02/P1-07 → React integration of all six canonical tabs, exact hierarchy/navigation, compact device dropdown/right dock, workflow tree and Dark/Light states while preserving V9 CSS/layout. Inspect complete [V9 HTML](../../ui-reference/Fonesi-Auto-V9-UI-Reference.html), not a screenshot recreation. Replace handlers through typed stubs with truthful unavailable state.
- **Positive:** Tổng quan → Tài khoản → Theo dõi → Thiết lập & nội dung → Quản lý lịch đăng → Quy trình order, dock resize, dropdown/focus, table scroll and theme work at approved reference viewport/scaling.
- **Negative:** empty/error/loading data, repeated navigation, narrow dock, modal Close/Cancel and stale response do not leave invisible overlays, fabricated device state or enabled actions. Keyboard focus remains on the intended control.
- **Evidence/acceptance:** complete page-by-page parity checklist and reference/implementation screenshots at identical sizes; discrepancies require repair or explicit UI amendment, not quiet redesign.
- **Rollback:** revert affected UI slice with its typed contract; keep the canonical HTML unchanged and automation disabled.

### P1-09 — Explicit mock-data boundary
- **Deliverable/dependencies:** P1-08 → test/demo fixtures behind an explicit build/runtime boundary, unmistakable DEMO labeling and isolated test storage; production uses empty/unavailable service states until real adapters exist.
- **Positive:** demo walkthrough displays a persistent demo indicator; production fresh launch has no invented phone/account/metrics/job success; tests intentionally inject fixtures.
- **Negative:** environment flag tampering, accidentally imported fixture and production package scan detect/reject demo activation; switching data source cannot merge mock identities into production DB.
- **Evidence/acceptance:** release-package fixture search, production empty-state screenshots and isolated storage tests. No placeholder analytics masquerade as observations.
- **Rollback:** disable demo route/provider completely; delete only test-owned fixture DB after identifying it, never infer a production file is disposable.

### P1-10 — CI and packaging smoke
- **Deliverable/dependencies:** P1-01…P1-09 and P1-11 → CI for actual type/lint/unit/integration commands and Windows packaging smoke, pinned dependency restore, artifact hash/version and build provenance. Production signing/distribution remains Phase 11 and separately authorized.
- **Positive:** fresh checkout yields a launchable foundation package on approved Windows; checks run against exact source SHA and close app without orphan processes.
- **Negative:** failing test, missing binary/license, mismatched lockfile and packaging error block a passing status/artifact promotion; Linux success cannot stand in for Windows packaging.
- **Evidence/acceptance:** exact CI URLs/SHA/logs and local Windows smoke results; package contains no secrets, private test fixtures or activated automation.
- **Rollback:** retain last verified internal build, disable failing packaging job publication; no overwrite of a published release or auto-deployment.

### P1-11 — Domain/IPC contracts, schema constraints and threat review
- **Deliverable/dependencies:** P1-01/P1-03 → version/error/identity/generation/correlation conventions, task ownership map and reviewed entity relationships. Define exact serial targeting, separate device/account/target IDs, desired/observed distinction, safe side-effect results and secret references before privileged code. Document proposed future services without implementing them.
- **Positive:** contract fixtures serialize/validate across main/preload boundary; valid entity relationships and supported protocol versions round-trip.
- **Negative:** unknown enum/version, conflicting IDs, missing correlation, extra privilege-bearing fields and invalid foreign references reject at boundary; a UI display name is not accepted as verified identity.
- **Evidence/acceptance:** signed-off contract/schema/threat review and executable validation fixtures. Changes affecting later phases are cross-linked, not silently imposed.
- **Rollback:** version contracts rather than reinterpreting stored values; reject incompatible clients and keep previous schema fixtures for migration verification.

## 5. V9, privacy and recovery invariants

UI shell owns no privileged process or account state. IPC errors are typed and redacted; user-selected filesystem access is scoped. Every UI change supplies Dark/Light and same-viewport parity evidence. No live automation is enabled merely because a workflow exists in the tree. Recovery never deletes a corrupt database without permission, never gathers personal folders for a support bundle and never logs secrets to diagnose vault failure.

Accepted C-13/C-14/C-21/C-22 govern privacy/recovery: captures/UI/OCR 7 days, technical logs 30 days, job/metric history until explicit user cleanup, unresolved evidence retained, encrypted local backup cadence/rotation as P1-05. Exact chosen folder, key recovery/portability and crash-report access implementation still require scoped evidence. Test with synthetic data and exact lab paths. An application rollback restores a compatible backup or rejects incompatible schema; an executable downgrade alone is not a DB rollback. Restore quarantines any future dispatch until post-snapshot effects are reconciled; Phase 1 establishes the marker/contract, not a claimed workflow implementation.

## 6. Verification and evidence

Before execution record actual harness commands from P1-03, rather than inventing `npm` commands now. Required layers: static/type/lint; unit contract/log/settings tests; real DB integration; renderer IPC security; complete V9 UI parity; **Windows** launch/close/crash, secret store and packaged smoke. Linux checks and mocks are supplemental. No Android/OCR/GPU benchmark is claimed by this Phase.

Each evidence item records task/case ID, source SHA, UTC, runtime/Windows build, fixture hash, sanitized input, expected/actual, PASS/FAIL/BLOCKED/NOT_RUN, log/artifact reference and reviewer. Private artifacts require approved storage/access; public reports contain redacted manifests. Missing required Windows evidence blocks acceptance. Performance bootstrap/package targets, if required, need baseline workload, repeated measurements and owner-approved limits before being used as exit gates.

## 7. Exit, risk and approval

- [ ] P1-01…P1-11 pass required cases, or user approves a specific deferral and downstream consequence.
- [ ] AC-01: secure renderer/IPC, real migration/backup/restore, redacted logs and Windows launch verified.
- [ ] Full V9 hierarchy/navigation, Dark/Light and empty/unavailable states demonstrated; no automation enabled.
- [ ] Exact supported Windows/toolchain matrix, dependencies and unresolved limitations recorded.
- [ ] Full regression and package smoke pass; acceptance report, docs/status and reviewed PR prepared.
- [ ] User accepts the Phase and authorizes merge; only afterward may Phase 2 be separately approved.

Primary risks: unverified version/binding/compatibility detail (stop, do not guess or reopen the selected stack silently); renderer privilege escape (block gate); backup/key non-portability (document restore scope); visual drift or mock leakage (parity/package gate). Owner for each risk is assigned at plan approval.

**Approval:** PENDING · **Scope/conditions:** none recorded · **Coding:** NO.
**Actual results:** NOT RUN; no production implementation, commits or acceptance inferred from this document.

| Date | Task | SHA / evidence | Actual result |
|---|---|---|---|
| — | — | — | NOT_STARTED |

## 8. Change history
| Date | Revision | Change | Authorization effect |
|---|---|---|---|
| 2026-10-30 | 1.0-draft | Full Phase 1 task/dependency/test/evidence/rollback plan | Future draft only |

- 2026-10-30 / 1.1-draft: aligned accepted C-05/C-07/C-13/C-14/C-22; retained phase authorization and technical-evidence gates.

**2026-10-31 01:23 UTC scoped exception approved:** proposal b7d0e11 now permits only P1-01-S first, with separately reviewed next entries P1-03-S/P1-11-S as recorded in the provisional-source amendment and playbook. Earlier pending notes are historical; all other sequential/acceptance/security rules remain. Full Phase1 is not opened or accepted.
