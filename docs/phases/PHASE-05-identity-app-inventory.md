# PHASE-05 — Identity, accounts, targets and app inventory

**Revision:** 0.2-draft · **Date:** 2026-10-30
**Plan status:** DRAFT — NOT AUTHORIZED FOR IMPLEMENTATION
**Task status:** All tasks NOT_STARTED; no application or hardware tests executed by this planning revision.
**Proposed execution branch:** `phase-05` — not created by this plan
**Execution base:** Future accepted `main` SHA, to be recorded at approval; not the current planning HEAD
**Owner / approver:** Implementing AI/developer / user, to be recorded at approval

Phase 0 remains unfinished. This forward plan is not permission to begin Phase 5, purchase dependencies, operate accounts, install/uninstall apps, change proxy settings or publish content.

## 1. Outcome and traceability

Deliver an evidence-backed app/account/target registry, safe explicitly scoped APK operations and truthful proxy status. A visible name, successful ADB command or reachable host proxy is not proof of account identity, completed installation or Android egress.

Sources: [master tasks](../04_MASTER_IMPLEMENTATION_PLAN.md), [product §2.3, §2.8, §2.10](../01_PRODUCT_SCOPE.md), [architecture](../02_TECHNICAL_ARCHITECTURE.md), [entities](../03_DATA_AND_WORKFLOWS.md), [AC-05 and shared gates](../05_ACCEPTANCE_AND_RISKS.md), [V9 mapping §3–4](../06_UI_V9_MAPPING.md), [decisions](../08_DECISIONS_AND_OPEN_ITEMS.md), [execution playbook](../11_PHASE_EXECUTION_PLAYBOOK.md), [history policy](../13_DOCUMENTATION_CHANGE_POLICY.md). This plan covers P5-01 through P5-15 without renumbering existing tasks.

## 2. Scope and entry gate

**In scope:** installed package evidence, app catalog/version compatibility, icon cache, account/target registration and verification, challenged-session blocks, protected uninstall, authorized APK batch operations, proxy profiles/assignment/verified route, account-lease contract.

**Out of scope:** account creation, credential collection, automatic login/2FA/checkpoint recovery, proxy-assisted evasion, generic per-app proxy promises, platform posting, bulk engagement, full lease scheduler execution (Phase 7), copied fonesi-W schemas or code, V9 redesign.

Required before implementation:
- [ ] Phase 4 ACCEPTED and merged; Phases 0–3 acceptance evidence remains valid. Technical dependencies on Phases 1/2/4 do not permit parallel phases.
- [ ] This exact plan revision is approved with any amendments; only one phase is active.
- [ ] P1 persistence/secrets/IPC contracts, P2 serial/device-generation contracts and P4 recognition/evidence contracts are accepted.
- [ ] Read current decisions for provisioning, account identity, target scope, retention and Android proxy mechanism. Any unresolved item that affects the task blocks that task, not an invitation to guess.
- [ ] Approved test devices, user-authorized app operations and owned/administered test accounts/targets are identified without placing credentials in Git.
- [ ] Current repository, remote, execution branch, accepted base SHA and worktree are verified. Paths below are proposals, not existing implementation claims.

### Accepted directions and remaining verification

The [accepted product checklist C-01..C-22](../16_ACCEPTED_PRODUCT_DECISIONS.md) fixes direction: Facebook first; owned/administered Page pilot; initial user provisioning/login followed by unattended routine work; challenges stop; global verified account identity with leases within this local PC only; device-level HTTP/HTTPS proxy first, with SOCKS/per-app routing deferred. Electron + TypeScript + React + SQLite + isolated Python is the chosen architecture direction, not proof that versions, schema, packaging or device behavior pass. Initial acceptance requires two physical phones plus two AVDs; one initial phone provides only partial evidence. USB first; Wireless Debugging remains disabled until authenticated pairing/reconnect tests pass.

| Decision | Required evidence/choice | Owner and blocker |
|---|---|---|
| Account/target identity proof | Supported scope is accepted; exact observed stable-ID signals, freshness and calibrated confidence still need physical evidence; a display name alone is insufficient | Engineering proves accepted scope from Phase 4 evidence; blocks unsupported P5-06..09 profiles |
| App safety policy | Supported APK sources/signature trust, downgrade/reinstall permission and protected-app exception policy | User approval before P5-14/P5-10; no default destructive override |
| Proxy mechanism | Device-level HTTP/HTTPS is accepted; prove exact Android mechanism, expected endpoint and rollback per profile; SOCKS/per-app are deferred | Engineering proof before P5-12; operation-specific authority still required |
| Lease identity | Accepted global verified account principal across phones within one local PC; prove stable identity mapping without guessing from name | Engineering before P5-13; no distributed/cross-PC exclusion claim |
| Storage and retention | Captures/UI/OCR 7 days, logs 30 days, jobs/metrics until user cleanup; unresolved evidence retained; encrypted local backups in user folder, no cloud; Windows secret references only | Engineering validates expiry/hold, secret-store failure and restore; avatar-cache detail reviewed with schema |

## 3. Proposed implementation surface and contracts

Map these logical paths to the accepted Phase 1 package tree before coding; update this draft if paths differ. The selected React/SQLite direction is accepted; exact versions and schema still require feasibility/review.

- `src/domain/identity/`: DeviceAccount, Target, VerificationEvidence, canonical account-principal reference, capability/session states.
- `src/application/inventory/`, `src/application/identity/`, `src/application/proxy/`: typed services and permission checks.
- `src/device-host/packages/`, `src/device-host/proxy/`: bounded serial-scoped device commands through the existing Device Actor; no renderer or Python ADB path.
- `src/persistence/migrations/`: reviewed additive schema for InstalledApp, Account, Target, ProxyAssignment and secret references; preserve historical evidence and existing foreign keys.
- `src/renderer/accounts/`, `src/renderer/overview/`: V9 existing selectors/dialogs only; actual paths follow approved UI framework.
- `tests/identity/`, `tests/inventory/`, `tests/proxy/`: fixture, integration, UI and hardware suites with separate environment labels.

Every mutating request includes explicit device IDs, current device generation, operation ID, authorized action scope and expected revision. Results are per device, with verified/known-failed/unknown/cancelled outcomes. A disconnect after dispatch is not a safe automatic retry. Identity evidence binds account + target + app package/version + device generation + capture time. Cached verification cannot survive an unexplained account switch, app upgrade or stale evidence.

A workflow owns the device across its whole foreground session, not only individual taps. Conflicting manual tap/Home/Back, APK or proxy operations are refused unless the operator explicitly requests a safe pause/takeover. Drain in-flight actor work, reconcile any possible side effect, then hand over; invalidate all earlier UI/account/target evidence. If a possible effect remains unresolved, do not grant a takeover that destroys reconciliation evidence. Re-entry requires fresh preflight and ownership.

Proxy state is separate at each layer: configured, host-reachable, device-assigned, device-egress-verified, expired/unknown. A green host check may never promote device-egress state. Secret plaintext stays inside the approved secret-store/application boundary, never in the renderer, ordinary DB, logs or support bundles.

## 4. V9 behavior contract

| Existing V9 surface | Real service behavior | Required parity/evidence |
|---|---|---|
| Overview app tools | Scan/install/uninstall show selected-device scope and individual progress/result | Same-viewport Dark/Light before/after screenshots; cancel/reopen/repeated-click tests |
| Accounts phone selector | Selecting a phone focuses that phone in right monitor; selection is not broadcast permission | Wrong-phone and stale-selection negative tests |
| Account/target avatar pickers | Distinct records; loading/empty/failed/unknown identity are explicit; no invented avatars/names | Duplicate display-name fixtures and disabled runnable-selection evidence |
| Proxy dialog | Masked credentials; host versus device status distinct; expiry and rollback visible | Secret-redaction check; partial batch failure screenshot |

Keep full V9 navigation, density, right dock and workflow tree. This phase does not enable workflows merely because an account appears in a dropdown.

## 5. Task order and acceptance contracts

Execute one task at a time. Proposed dependency order: P5-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 14 → 10 → 11 → 15 → 12 → 13. Stable IDs remain unchanged; P5-14 must precede destructive APK execution. All statuses are NOT_STARTED.

### P5-01 — App package catalog per platform/version
- **Depends / deliver:** Phase 4 accepted; versioned app-catalog records with exact package IDs, observed versions, supported/unknown states and evidence references in `domain/inventory` and catalog repository. A catalog entry is not a claim an app is installed.
- **Positive tests:** resolve a known package/version; coexistence of two variants is explicit; unknown versions remain visible as unverified.
- **Negative tests:** similar display name, package spoof, malformed version and missing package reference cannot inherit another app's certification.
- **Evidence / pass:** catalog fixtures and resolver results; approved supported package list linked to physical inventory evidence. No hard-coded production installed-app list.
- **Rollback:** disable catalog revision and invalidate dependent capability cache; retain historical observations for audit.

### P5-02 — Scan installed packages per phone
- **Depends / deliver:** P5-01 and P2 actor; cancellable exact-device scan returning observed packages, scan timestamp and complete/partial/error state. Store only completed observations or mark partial explicitly.
- **Positive tests:** two phones with distinct package sets remain isolated; repeat scan updates install/remove changes without duplicate records.
- **Negative tests:** unauthorized/offline phone, truncated command output, timeout and reconnect generation change cannot report a complete empty list or erase previously known data as if uninstalled.
- **Evidence / pass:** sanitized ADB command/result transcript and before/after inventory on at least two approved physical devices; fixture parsing alone is not hardware acceptance.
- **Rollback:** stop scan and retain prior complete snapshot with stale marker; no device mutation to undo.

### P5-03 — Label, version, installer and icon extraction
- **Depends / deliver:** P5-02; bounded metadata extraction with explicit unavailable fields and separate extraction errors.
- **Positive tests:** retrieve exact label/package/version/install-source/icon for supported fixture and device packages, including Vietnamese labels.
- **Negative tests:** missing launcher, restricted metadata, invalid icon bytes, oversized output and duplicate labels preserve package identity and show unavailable rather than fabricated fields.
- **Evidence / pass:** fixture matrix plus authorized device package comparisons, resource/timeout observations and redacted output.
- **Rollback:** disable optional extraction adapter; keep observed package/version facts and clear only invalid derived fields.

### P5-04 — Device/package/version icon cache
- **Depends / deliver:** P5-03; cache key includes device ID, package and version; bounded retention, atomic writes and invalidation on version/uninstall.
- **Positive tests:** repeat read hits correct cache; upgrade and same package on another device generate separate keys.
- **Negative tests:** interrupted write, invalid path, stale cache, unavailable disk and image decode failure cannot display another app's icon or escape cache root.
- **Evidence / pass:** cache hit/invalidation tests and Windows file-lock/path cases; UI placeholder carries unavailable state.
- **Rollback:** invalidate derived icon entries safely; preserve account/installed-package records and never remove source APKs.

### P5-05 — System/critical uninstall protection
- **Depends / deliver:** P5-02; protected-app classification and authorization checks enforced in service/IPC, not only disabled buttons. Protection applies per device.
- **Positive tests:** permitted noncritical package is selectable for an explicitly authorized uninstall preview; system/critical entry is protected with reason.
- **Negative tests:** direct IPC call, altered renderer flags, stale inventory and mixed batch cannot bypass protection; cancelled confirmation sends no command.
- **Evidence / pass:** authorization tests, no-command assertions and UI protection screenshot. Any exception policy remains blocked until separately approved; do not use a destructive production test.
- **Rollback:** retain deny-by-default protection when classification fails; disable uninstall surface rather than weaken checks.

### P5-06 — Device/platform Account Registry
- **Depends / deliver:** P5-04; reviewed Account schema/service separates local ID, observed display data and canonical account principal; session and identity state start UNKNOWN until verified. Add distinct account/target UI selectors.
- **Positive tests:** multiple accounts per phone/platform, same account on two devices and duplicate names retain distinct registration/evidence links.
- **Negative tests:** cross-device foreign key, absent principal evidence, raw credential fields and deleted device cannot produce a runnable account.
- **Evidence / pass:** schema/migration tests, data validation and V9 selector screenshots with sanitized test identities; no password/OTP/cookie/token columns.
- **Rollback:** stop new registrations; recover pre-migration backup if necessary only under shared rollback procedure; preserve references used by audit history.

### P5-07 — Observable account identity verification
- **Depends / deliver:** P5-06 and accepted Phase 4 recognizer; verifier returns verified/mismatch/ambiguous/challenge with timestamp, profile/version and evidence binding. Required signals and confidence are approved before implementation, not guessed numeric thresholds.
- **Positive tests:** exact supported account verified from permitted visible signals; recheck after switch binds the new observation.
- **Negative tests:** same display name, stale screenshot, orientation change, low OCR confidence, unknown app version and background account switch block selection/execution.
- **Evidence / pass:** labeled fixture results and approved physical-account tests in supported locales; OCR replay is not proof of current logged-in identity.
- **Rollback:** invalidate verifier/profile and set affected accounts UNKNOWN; never retain READY when the verifier is disabled.

### P5-08 — Exact Target Registry and verification
- **Depends / deliver:** P5-07; Target linked to correct account, platform-specific kind, observed stable reference where available, permission evidence and capability state.
- **Positive tests:** approved owned/administered target is matched independently from account identity; target switch requires new evidence.
- **Negative tests:** same-name Pages, wrong target type/account, stale administrator permission and absent stable proof cannot inherit target readiness.
- **Evidence / pass:** target-selection fixtures and physical read-only verification evidence; account identity alone never passes target gate.
- **Rollback:** invalidate target verification and block dependents; preserve target history and permission evidence references.

### P5-09 — Expired login, challenge and unknown session
- **Depends / deliver:** P5-07/08; state transition handler marks session blocked and exposes legitimate provisioning/recovery requirement without collecting credentials or auto-solving a challenge.
- **Positive tests:** observed logout becomes LOGGED_OUT; legitimate user-completed recovery needs fresh verification before unblocking.
- **Negative tests:** 2FA/checkpoint/unrecognized dialog, changing account mid-check and unavailable UI capture never trigger password entry, bypass or silent retry.
- **Evidence / pass:** blocked-state screenshots, transition tests and no-input assertions; use fixtures for sensitive challenge cases, not deliberate security challenges against real accounts.
- **Rollback:** default affected account to UNKNOWN/BLOCKED; no automatic workflow resume from cached session state.

### P5-14 — APK trust, package/version and downgrade validation
- **Depends / deliver:** P5-05; preflight validates source, file stability/hash, expected package, signature identity, version, device compatibility and approved downgrade policy before the P5-10 executor receives a dispatchable intent.
- **Positive tests:** approved test APK matches expected metadata; upgrade preview shows target package/version and required operator scope.
- **Negative tests:** changed APK after preview, unknown/untrusted signature, package mismatch, downgrade, truncated APK and path traversal block dispatch. A warning alone is not an authorization to overwrite app data.
- **Evidence / pass:** tampered/unsigned/mismatched fixtures, approved trust/downgrade decision and no-command negative results; tooling choice/pins inherit accepted architecture decisions.
- **Rollback:** revoke validation artifact on any source or trust change; do not remove installed apps to compensate for rejected preflight.

### P5-10 — Authorized APK batch install/uninstall
- **Depends / deliver:** P5-14; preview explicit operation/package/device set, persist intent, dispatch through each actor, verify resulting package state and report result per phone. Cancellation stops undispatched work; uncertain in-flight operation is reconciled before retry.
- **Positive tests:** approved disposable app install/uninstall on authorized lab phones, mixed success batch, repeat read-only reconciliation and progress after reconnect.
- **Negative tests:** wrong serial, blocked critical package, insufficient storage, unsupported downgrade, disconnect after dispatch, repeated clicks and cancel cannot cause duplicate operations or batch-level false success. Install/uninstall during an owned workflow is refused; authorized takeover waits for drain/reconciliation and invalidates old UI evidence.
- **Evidence / pass:** per-device intent/result journal, package read-back and physical failure-injection reports. A zero exit code without expected observed package state is insufficient.
- **Rollback:** rollback is operation-specific and authorized: an install may be removable; uninstall/data deletion may be irreversible. Stop remaining devices, preserve evidence, explain data-loss risk and require explicit approval before any compensating install/uninstall.

### P5-11 — Proxy profile storage, validation and assignment intent
- **Depends / deliver:** P5-06 and accepted secret store; secret references in DB, masked UI, syntax/host reachability diagnostics and explicit proposed device assignment. Do not label host reachability as Android routing success.
- **Positive tests:** create/update masked profile; secret-store round trip; host-reachable profile remains unverified for device egress until P5-12.
- **Negative tests:** malformed endpoint, unreachable host, secret-store denied/locked, cancelled save and logging failures do not leak credentials or create ACTIVE assignment.
- **Evidence / pass:** Windows secret-store tests, redacted log scan and status-state UI evidence; Linux substitute does not certify Windows storage.
- **Rollback:** remove uncommitted secret references without deleting unrelated entries; retain prior profile revision until new one validates.

### P5-15 — Proxy mechanism gates, expiry, cancellation and rollback
- **Depends / deliver:** P5-11; per-device capability for the accepted HTTP/HTTPS routing scope, expiry tracking, previous-state capture and bounded assignment/cancel/restore state machine. SOCKS and per-app routing remain deferred/unavailable.
- **Positive tests:** approved mechanism dry-run captures prior configuration; expired profile blocks new assignments; cancellation before dispatch performs no mutation; tested restore returns to captured prior state.
- **Negative tests:** unavailable route mechanism, missing previous-state read, expired secret, restore failure and cancellation after uncertain dispatch leave explicit UNKNOWN/needs-recovery state rather than false restored/active. Conflicting workflow ownership refuses route change until authorized safe takeover completes; no proxy change to evade restrictions.
- **Evidence / pass:** reviewed mechanism decision, state-machine tests and physical rollback/expiry cases on each claimed supported profile.
- **Rollback:** stop new route changes; reconcile actual device configuration then perform only authorized restoration. Never disable unrelated device networking or widen traffic routing to make a check pass.

### P5-12 — Device-side proxy egress proof
- **Depends / deliver:** P5-15; authorized device-side test tied to assignment revision and mechanism scope, with observed route evidence, timestamp and freshness. App-specific routing claims require app-scoped proof, not device-browser proof alone.
- **Positive tests:** observed egress matches approved expected proxy route; refresh failure downgrades verified status; different devices maintain distinct evidence.
- **Negative tests:** host-only success, direct-device egress, stale cached test, DNS/route leak, expired profile and unsupported per-app scope cannot display ACTIVE/verified.
- **Evidence / pass:** sanitized Windows/device route procedure and observed results from approved endpoint; no account credentials or sensitive IPs committed unnecessarily.
- **Rollback:** use P5-15 authorized restore; mark UNKNOWN if restoration cannot be verified and block dependent jobs.

### P5-13 — Cross-device account lease contract
- **Depends / deliver:** P5-07/08; canonical verified account-principal key across phones on this local PC, lease owner/job/device, revision/fencing/expiry interface and acquisition/release reason codes for Phase 7. No cross-PC lock guarantee. This phase defines and tests the identity contract; full durable queue/fencing implementation remains P7-07/P7-13.
- **Positive tests:** two registrations of one proven principal resolve to one lock key; unrelated verified accounts do not block each other.
- **Negative tests:** duplicate display name, unproven identity equivalence and stale registry revision cannot merge accounts or acquire a permissive fallback key.
- **Evidence / pass:** contract tests and schema review cross-linked to Phase 7; simulator proves identity-key behavior only, not crash-safe runtime exclusion.
- **Rollback:** disable unresolved principal registrations for jobs; never silently fall back from global lease to per-phone lease.

## 6. Security, migration and rollback

- Treat screenshots, account names, identifiers, proxy endpoints and package lists as potentially private; apply approved retention, restricted access and redaction before Git evidence export.
- Only explicit user-selected devices may receive destructive app/network changes. Preview exact scope and prevent stale/repeated confirmation replay. Every command uses exact device identity/generation.
- Add migrations only after schema review. Test backup restore on the accepted Windows database stack, foreign-key integrity, restart mid-migration and older-reader refusal. Do not silently downgrade schemas.
- Shared rollback: disable new feature/capability → stop undispatched work → preserve intent/evidence/actual device state → take validated backup → revert only compatible application changes or restore with explicit approval and reconciliation. A DB restore does not undo an Android operation or make a possible side effect disappear.
- Restoring an older backup quarantines all dispatch until post-backup effects are reconciled against current device/platform evidence. Restored NOT_DISPATCHED or absent journal rows are not proof no effect occurred. Retain unresolved evidence beyond ordinary retention. Back up before migration, at most daily automatically while running, and manually on request; keep seven validated normal copies plus pre-migration copies until upgrade acceptance. A failed backup never deletes or replaces any known-good copy.
- Revoke certification after app/device/profile change; metadata extraction may degrade to unavailable, but identity/policy checks fail closed.

## 7. Verification and evidence matrix

| Layer | Planned procedure | Evidence / acceptance boundary |
|---|---|---|
| Static/unit | Accepted Phase 1 lint/typecheck/test commands; registry, parsing, trust, state and lease-key fixtures | Exact command/version/output; commands to be filled from actual manifests before approval, not invented now |
| DB/IPC integration | Migration/restore, scope authorization, command spy, cache invalidation, secret references | Fixture and integration evidence; does not prove device behavior |
| V9 UI | Account focus, selectors, app/proxy dialogs, all empty/loading/error/partial states, repeated actions and cancellation | Same viewport Dark/Light comparison with full V9; no redesign |
| Windows | Secret-store denied/available, file locks/paths, packaged metadata helper execution | Supported Windows build/permissions listed; Linux results separate |
| Physical Android | At least two approved devices: inventory isolation, exact identity/target, authorized disposable APK operation, proxy route/restore | Device/OEM/Android/app/locale/transport/generation evidence; no emulator-only PASS |
| Performance | Scan and cache latency/memory at representative package counts; proxy/identity work alongside streams | Raw distributions and host/device profile; owner approves budgets before performance PASS; no arbitrary throughput guarantee |
| Privacy/policy | Redacted support/log/evidence sample, no secret schema fields, no unauthorized account/network mutation | Security review and operation-specific authorization record |

Each artifact records task/case ID, commit SHA, environment class, host/device/app/tool versions, procedure, expected/observed outcome, timestamp, sanitized evidence link/hash, reviewer and limitations. Hardware not available means BLOCKED for hardware acceptance. Simulator/Linux/source-only checks must be labeled accordingly. Raw sensitive evidence may be private with an approved restricted reference and hash.

## 8. Exit and approval

- [ ] P5-01..15 PASS, or each deferral explicitly approved with dependent features disabled.
- [ ] Actual package inventory, exact account/target proof and challenge blocks validated on approved physical profiles.
- [ ] Protected-app and trust checks cannot be bypassed through IPC; APK batches show truthful individual outcomes.
- [ ] Device-side routing proof and rollback exist for every proxy capability advertised; unsupported mechanisms remain disabled.
- [ ] No credential/OTP/cookie in DB/logs/screenshots committed; retention and secret-store failures reviewed.
- [ ] V9 parity, migration/restore and Phase 1–4 regression pass; actual commands/results attached.
- [ ] Acceptance report lists certified profile coverage, unsupported combinations, remaining risks, commit range and approval links.
- [ ] User accepts Phase 5 and separately approves merge before Phase 6 starts.

**Approval:** NOT REQUESTED/NOT RECORDED by this draft. **Production coding authorized: NO.** App/account/proxy operations require both approved execution plan and operation-specific authority. Acceptance and a merge are not inferred from document existence.

## 9. Execution and change history

| Date | Task/commit | Actual tests/evidence | Result/approval |
|---|---|---|---|
| — | — | No implementation tests run by this draft | NOT_STARTED |

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Initial actionable plan; preserved stable master IDs and explicit APK/proxy safety coverage; no implementation authorization. |
| 2026-10-30 | 0.2-draft | Synchronized accepted checklist directions; added whole-workflow takeover and old-backup quarantine safeguards; all runtime evidence remains pending. |
