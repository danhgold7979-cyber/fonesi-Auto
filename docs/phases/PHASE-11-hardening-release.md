# PHASE-11 — Hardening and controlled Windows release

**Revision:** 0.2-draft · **Date:** 2026-10-30
**Status:** DRAFT — NOT APPROVED / NOT AUTHORIZED FOR EXECUTION
**Task status:** P11-01–P11-10 NOT_STARTED; all implementation/hardware/release tests NOT RUN
**Planning branch:** `plan`
**Proposed execution branch:** `phase-11` — not created by this plan
**Execution base/owner:** accepted `main` SHA and responsible implementer/reviewer to be recorded at approval

Accepted product directions: [checklist C-01…C-22](../16_ACCEPTED_PRODUCT_DECISIONS.md). These choices do not replace technical proof, platform permission or express Phase execution approval.

## 1. Outcome, scope and traceability

Produce a supportable Windows release candidate with verifiable build provenance, truthful supported-host/device/workflow matrix, tested recovery, privacy protections and an approved operating envelope. A build or installer is not evidence that the full tool works; release readiness requires the accepted gates for every enabled capability.

Canonical inputs: [master P11 tasks](../04_MASTER_IMPLEMENTATION_PLAN.md), [product scope](../01_PRODUCT_SCOPE.md), [architecture/security](../02_TECHNICAL_ARCHITECTURE.md), [data/effect model](../03_DATA_AND_WORKFLOWS.md), [acceptance AC-11 and preceding gates](../05_ACCEPTANCE_AND_RISKS.md), [V9 mapping](../06_UI_V9_MAPPING.md), [decisions](../08_DECISIONS_AND_OPEN_ITEMS.md), [Git/release rules](../09_GIT_WORKFLOW.md), [execution playbook](../11_PHASE_EXECUTION_PLAYBOOK.md), [resource controls](../12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md), [documentation policy](../13_DOCUMENTATION_CHANGE_POLICY.md).

**In scope:** Windows packaging/signing procedure, dependency trust and license inventory, install/update/downgrade/uninstall behavior, migration/backup/recovery, fault/load/security testing, support export and retention/deletion, operator runbooks, release checklist and separately approved tagging/publication.

**Out of scope:** new workflows, additional platform support by assumption, auto-update distribution not already approved, credential acquisition, bypassing Windows/device security warnings, fonesi-W reuse, arbitrary destructive hardware tests, changes to V9, automatic production rollout, merge/tag/publish without specific authorization.

**Accepted product directions:** checklist 1–22 in the [decision register](../08_DECISIONS_AND_OPEN_ITEMS.md) chooses Electron + TypeScript + React + SQLite, isolated Python, sole ADB input ownership, video-only scrcpy, UI Automator first and OpenCV/PaddleOCR CPU fallback. Exact versions, deployment mechanisms, compatibility, license review and benchmarks remain evidence gates. Foundation + Facebook comes first; other networks stay off, and the Page pilot still requires per-action platform permission and separate certification rather than ownership alone.

- Support is limited to the exact tested Windows/device matrix: target two physical phones plus two AVDs; initial testing with one phone does not close multi-device acceptance. USB first; wireless remains disabled until dedicated authenticated pairing/reconnect tests. HTTP/HTTPS device-proxy first; SOCKS/per-app routing remains deferred.
- Captures/UI trees/OCR: 7 days; logs: 30 days; jobs/metrics: until user cleanup. Unresolved-effect evidence is retained beyond normal expiry.
- Encrypted local backups go to a user-selected folder with no cloud upload: retain 7 validated normal copies; automatic backup at most daily while the app runs, plus manual and pre-migration backups. Pre-migration copies stay protected until upgrade acceptance. A failed backup never evicts a good copy. Exact encryption/key recovery and atomic-write mechanisms still need review/tests; SQLite holds Windows secret-store references, not raw secrets.
- Old-backup restore enters dispatch quarantine until post-backup external effects are reconciled; restored `NOT_DISPATCHED` is not proof that no effect occurred. Product-direction approval does not authorize code, signing, release or runtime actions.

## 2. Entry and decision gates

- [ ] Phase 10 is ACCEPTED and merged. All earlier release-critical phases, including Phase 0, have evidence or explicit approved deferral with affected capabilities disabled. **Phase 0 is unfinished at this draft's creation.**
- [ ] User approves this phase plan/task/branch; only this phase executes. Technical dependencies never authorize parallel phase work.
- [ ] Accepted stack direction is implemented with reviewed exact runtime pins, packaging approach, license obligations and passing Windows/Android matrix evidence; do not reopen the stack-family choice or invent versions in this document.
- [ ] Release candidate scope lists every capability as READY, DEFERRED or unsupported, including action-specific policy status. A permitted disabled-only pilot outcome is not Facebook certification.
- [ ] Signing identity/custody, release destination/channel, update/downgrade policy and artifact retention are explicitly approved. Keys/certificates stay in an authorized secret/signing service; this plan does not authorize obtaining or spending money on them.
- [ ] Accepted backup/retention choices above have reviewed encryption/key recovery, safe rotation/deletion and private support-artifact mechanisms with passing tests.
- [ ] Hardware access, fault-injection methods, load dataset sizes/observation windows and measurable acceptance targets have owners and user approval before trials. No arbitrary SLO is established by this draft.

| Decision | Required outcome before dependent task | Owner |
|---|---|---|
| Windows support / installer privileges | Exact OS/build/architecture, per-user/per-machine install, required privileges and offline behavior | User + Windows release owner |
| Dependency trust and distribution | Approved origin, exact pins, checksums/signatures, redistribution/license notices for each bundled component | Release + security/license reviewer |
| Signing / release channel | Authorized signer, secure custody, candidate verification and separate publish permission | User + release owner |
| Downgrade and recovery | Compatible downgrade paths or explicit block; reviewed key recovery and accepted local backup/restore-quarantine behavior proven by tests | Data + workflow owners |
| Performance acceptance | Per-host approved workload/capacity, latency/memory/recovery measures and pass limits derived from benchmarks | User + performance owner |
| Retention and diagnostics | Accepted durations/protected evidence above; remaining field allowlist, deletion preview, access controls and support export/sharing scope | User + privacy owner |

## 3. Proposed implementation boundaries and release contract

Logical paths below must be mapped to the accepted Phase 1 layout; none is asserted to exist now:

- `release/` and approved CI workflow: reproducible build inputs, installer configuration, signing/publishing approval boundaries and artifact verification.
- Dependency lockfiles/vendor manifest, third-party notices and machine-readable SBOM.
- `backup/`, `recovery/`, `diagnostics/` and `retention/`: hardened existing services, schema-compatible restore and scoped local exports.
- `tests/release/{install,recovery,load,security}/`: exact approved test commands/procedures with Windows/device matrix.
- Planned `docs/evidence/phase-11/`, release checklist, support matrix and operator runbooks; private artifacts referenced rather than committed.

Release manifest binds version, source SHA, lockfile/runtime versions, build environment, installer/payload hashes, signature identity/verification, SBOM/notices, migration schema, supported profiles and acceptance evidence. Never label an unsigned local build as a signed release. Signing timestamps may change bytes; distinguish deterministic unsigned payload/build inputs from signed-artifact identity and document reproducibility limits instead of claiming identical hashes without proof.

## 4. Task execution details

All tasks are **NOT_STARTED**. Implement sequentially; prior task PASS or explicit approved deferral is required. A later task may require earlier fixes/regression but cannot bypass its gate.

### P11-01 — Windows installer and signed release pipeline
- **Depends on:** Phase 1 packaging foundation, accepted runtime/package decisions and signing/installer policy.
- **Deliver:** installer/build pipeline configuration in `release/` using pinned inputs, isolated build environment, artifact manifest and separate protected signing/publication stages. Renderer remains sandboxed and app processes start without undocumented admin privileges.
- **Positive tests:** clean approved Windows environments build/install/launch the candidate; two clean builds reproduce expected payload inputs and manifests; authorized signatures verify against the intended identity. **Negative tests:** missing key, expired/untrusted signature, tampered artifact, unsupported OS, path with spaces/Unicode and non-admin context fail safely with truthful diagnostics.
- **Evidence/acceptance:** build logs, exact source/tool versions, manifest/hash comparison, installer launch and signature verification results. Signing absent means BLOCKED for signed-release acceptance, not simulated PASS.
- **Rollback:** retain prior installer; disable failed candidate distribution/signing stage. Do not replace a released artifact under the same version or bypass OS trust checks.

### P11-02 — Runtime pins, SBOM, trust and license notices
- **Depends on:** P11-01 and accepted ADB/scrcpy/UI Automator/Python/OpenCV/OCR/media-probe choices from earlier phases.
- **Deliver:** complete dependency and bundled-runtime manifest, exact origin/version/hash/signature checks, SBOM and redistribution/license/model notices. Include installer dependencies and optional components, not only package-manager packages.
- **Positive tests:** clean/offline install resolves only approved packaged assets; reported runtime versions match the manifest; license notices are accessible. **Negative tests:** substituted executable/model, hash mismatch, unexpected PATH executable, missing notice or prohibited redistributable blocks packaging/launch of that component.
- **Evidence/acceptance:** dependency inventory, approved license review, supply-chain scan and packaged-file hash/version verification on Windows; no live download of an unpinned runtime.
- **Rollback:** quarantine invalid package, restore verified compatible runtime and revoke affected certification; never silently fallback to a different globally installed executable.

### P11-03 — Install, upgrade, downgrade and uninstall
- **Depends on:** P11-02 and approved compatibility/data-retention policies.
- **Deliver:** installation lifecycle matrix and handling in `release/`, including locked files, running jobs, disk space, restart requirements, user data and owned-process cleanup. Downgrade is supported only across explicitly tested compatible schemas; otherwise block with recovery guidance.
- **Positive tests:** clean install and supported upgrade preserve settings/accounts/media references; approved uninstall leaves/removes data exactly as selected; reinstall restores only permitted compatible state. **Negative tests:** interrupted install, insufficient disk, older schema, locked files, cancel, multiple instances and running effects leave recoverable state, not half-upgraded success.
- **Evidence/acceptance:** Windows snapshots before/after each path, logs and filesystem/registry/process inventory; unrelated user files, ADB installations and processes remain untouched.
- **Rollback:** use tested installer rollback or prior compatible version plus backup. Never downgrade the live DB blindly or delete user data merely to make reinstall succeed.

### P11-04 — Database migration and backup/restore
- **Depends on:** P11-03 and accepted schema/secret-store/retention contracts.
- **Deliver:** migration compatibility matrix and encrypted local backup/restore in `backup/`/`recovery/`: user folder, 7 validated normal copies, at-most-daily automatic/manual/pre-migration triggers, protected pre-migration copy until upgrade acceptance and no cloud upload. Preserve durable effects, job snapshots and identity/capability state; old-backup restore enters dispatch quarantine until post-backup effects are reconciled.
- **Positive tests:** migrations retain foreign keys/integrity; backup validates and restores on the supported host/account/key path; normal-copy rotation preserves 7 valid copies and protected pre-migration evidence. **Negative tests:** corrupt/truncated/wrong-key backup, disk full, interruption or duplicate triggers never delete a good backup; unsupported schema blocks restore; restored `NOT_DISPATCHED` cannot authorize dispatch or erase a possible post-backup publish/comment.
- **Evidence/acceptance:** checksums, integrity reports, recovery logs and Windows secret-store tests; document cross-machine/key limitations explicitly. Raw credentials are never exported to make restore easier.
- **Rollback:** retain untouched validated backup, stop queues, restore compatible schema/application and reconcile all potentially dispatched work; no automatic republish from old state.

### P11-05 — Power-loss/crash/disconnect recovery
- **Depends on:** P11-04 and accepted journal/fencing/cancellation contracts.
- **Deliver:** controlled fault-injection matrix in `tests/release/recovery/` at queue claim, intent persistence, dispatch, verification and completion boundaries. Simulate power-loss semantics safely first; any actual power interruption requires specific hardware-owner approval and isolation.
- **Positive tests:** restart recovers committed state, reconciles uncertain effects, cleans owned orphan workers and resumes only known-safe work outside restore quarantine. **Negative tests:** desktop/ADB/worker/scrcpy crash, USB loss, stale device generation, expired same-PC account lease and failure after possible publish/comment never cause wrong-device input, duplicate effect or false success; verified global account identity does not imply cross-PC locking.
- **Evidence/acceptance:** journal/lease timelines and exact before/after command traces on Windows plus physical devices; simulator crash coverage does not substitute for actual transport tests.
- **Rollback:** stop dispatch, preserve diagnostics and unresolved effects, restore only compatible components. Never kill unrelated ADB sessions or clear UNKNOWN to force queue progress.

### P11-06 — Load and capacity validation
- **Depends on:** P11-05 and approved Phase 0/3/4 resource profiles and test safety limits.
- **Deliver:** benchmark suite/report for growing device registry, concurrent screen wall, OCR queue, scheduling/history and media scanning/import. Use approved multiple Windows host/device profiles; device records have no artificial product cap while live streams/workers remain bounded.
- **Positive tests:** representative sustained workloads remain inside each approved envelope, preserve actor input and produce stable memory/queue behavior. **Negative tests:** saturated CPU/RAM/decoder/USB/network, unavailable/stale GPU counters, low disk, stream churn and queue pressure degrade previews/noncritical work without corrupting workflows.
- **Evidence/acceptance:** raw repeated samples, workload/versions, warm-up and observation method, latency distributions, resource/queue growth, delivered FPS, drop/recovery behavior and approved pass limits. No single-PC result becomes universal support.
- **Rollback:** withdraw excessive profile/concurrency recommendation, preserve requested settings and constrain new starts to certified limits. Manual emergency throttling stays OFF by default and only affects previews after opt-in; recovery obeys accepted restore settings.

### P11-07 — Security and privacy review
- **Depends on:** P11-06 and current threat model; fixes require rerunning impacted earlier suites.
- **Deliver:** findings/remediation report covering renderer/IPC origin and schema validation, process allowlists, argument/path handling, secret storage, file access, malicious imports, local artifacts, logs and component supply chain.
- **Positive tests:** legitimate typed operations succeed with least privilege and redacted logs. **Negative tests:** arbitrary process/ADB command through IPC, unscoped serial, command injection, path traversal/symlink escape, spreadsheet formula payload, oversized worker message and secret-bearing error cannot escape boundaries or expose credentials.
- **Evidence/acceptance:** test cases, dependency scan, Windows secret-store access tests and redaction canary scan; zero unresolved release-blocking findings under approved severity policy. Do not waive wrong-target, secret-leak or blind-retry failures as cosmetic.
- **Rollback:** disable the affected capability or withdraw candidate; retain forensic evidence securely. Remediation is scoped and audited, not a silent security-control bypass.

### P11-08 — Support bundle, retention/deletion and runbooks
- **Depends on:** P11-07 and approved privacy/retention policy.
- **Deliver:** scoped local diagnostics export, accepted 7-day capture/UI/OCR and 30-day log retention, user-cleanup-only jobs/metrics and protected unresolved evidence in `diagnostics/`/`retention/`. Bundle manifest lists selected logs, versions, redacted device state and sensor availability; private captures require explicit inclusion. Runbooks distinguish human initial provisioning/login/recovery from routine unattended workflows and checkpoint safe stop, and explain policy revocation, calibration, backup/key handling and restore quarantine.
- **Positive tests:** preview matches allowlisted files; redaction removes canary secrets; expiry boundaries remove only eligible owned artifacts; verified media cleanup removes tool-owned staged copies, never originals. **Negative tests:** unresolved effects retain staged copies/evidence; reused export folder, name collision, locked file, traversal/symlink, disk full, cancellation and permission failure never overwrite/archive unrelated files or report false completion; expiry never auto-deletes jobs/metrics.
- **Evidence/acceptance:** archive member inventory, hashes, privacy scan, deletion dry-run/ownership tests and Windows filesystem failure results. Export is local; upload/send requires separate destination/recipient authorization.
- **Rollback:** disable export/deletion, preserve required evidence and clean only operation-owned temporary files. Deleted data is not assumed recoverable; approval/preview and tested backups precede destructive actions.

### P11-09 — Release checklist, quantified targets and limitations
- **Depends on:** P11-01–P11-08 PASS/approved deferral and all earlier phase evidence.
- **Deliver:** release-candidate dossier and complete AC-00–AC-11 traceability matrix in planned `docs/evidence/phase-11/`. List build SHA, enabled/disabled workflows, current policy outcomes, hardware/app/locale matrix, evidence, open defects, recovery/retention procedures and measured targets.
- **Positive tests:** each advertised capability and quantified SLO resolves to an approved definition, workload, method, threshold and passing result; release notes match installer capability state. **Negative tests:** missing hardware test, unknown signature, stale certification, unsupported metric, critical/high unresolved defect, unapproved threshold or deferred prerequisite prevents readiness claim.
- **Evidence/acceptance:** signed-off checklist from accountable product, test, security and release owners; every deviation has explicit user decision and scope consequence, never a fabricated pass.
- **Rollback:** mark candidate NOT READY, disable/remove unsupported claims and rerun impacted tests after fixes; retain superseded reports and accepted plan history.

### P11-10 — Explicitly authorized release tag and publication
- **Depends on:** P11-09 passing release dossier, user acceptance of the tested candidate and separate authorization for exact commit, version, tag, destination and distribution scope. Merge is a separate authorized action.
- **Deliver:** release tag/manifest only when authorized, linked to verified artifacts and accepted commit. Before authority exists, prepare a reviewable release proposal; do not create/push a tag or publish automatically.
- **Positive tests:** authorized tag resolves to the approved SHA; downloaded published artifact matches manifest/hash/signature; release notes and supported scope match the accepted dossier. **Negative tests:** changed HEAD after tests, dirty worktree, missing/failed gate, tag collision, stale artifact, wrong destination or uncertain publication outcome stops and verifies state before any retry.
- **Evidence/acceptance:** recorded user decision, remote tag/commit verification, artifact identity/signature and publication/read-back result. A local tag alone is not published; a successful upload alone is not distribution verification.
- **Rollback:** withdraw/deprecate a faulty release through separately authorized channel actions and direct operators to the tested compatible version. Never rewrite an existing published tag or silently replace binaries under it.

## 5. Quantified acceptance without invented targets

Before load/release acceptance, the responsible owner populates and the user approves a target table with: metric definition, host/device/app profile, dataset/workload, sample/repetition/observation design, units, pass limit, failure condition, source evidence and approver/date. Candidate measures include startup/install duration, idle/loaded memory, device command latency, stream delivery/drop rate, recognition latency/accuracy, queue age, scan throughput, crash recovery duration and backup/restore time. Values must come from feasible workload requirements and measured baselines, not attractive arbitrary constants.

A measured result without an approved target is **MEASURED / ACCEPTANCE PENDING**, not PASS. A host with unavailable GPU counters remains UNKNOWN for those counters; supported fallback measurements may establish a narrower envelope. No promise of unlimited simultaneous streams or universal GPU behavior is allowed.

## 6. Required test and evidence matrix

| Layer | Required procedure | What it establishes |
|---|---|---|
| Source/CI | Exact accepted lint/type/unit/integration commands and dependency checks | Code-level correctness only; capture commands/commit/output/exit code |
| Windows packaging | Clean supported OS images, user/admin contexts, install/upgrade/uninstall/signature checks | Actual installer/runtime compatibility and privilege behavior |
| Data recovery | Migration paths, consistent backup, key/secret-store conditions, restore and journal reconciliation | No data corruption or replay of possibly completed effects |
| Physical Android | Supported profiles, at least accepted multi-device baseline, reconnect/crash/identity drift | Device isolation and real transport/recovery; simulator does not replace hardware |
| Vision/GPU/resources | Labeled real corpus, CPU-first worker and approved optional GPU profiles; telemetry/overload matrix | Only tested recognition and resource combinations; no unsupported acceleration claim |
| UI parity | Full V9 reference at same viewport/DPI/themes with empty/loading/error/disabled states | No redesign or false READY state |
| Security/privacy | Adversarial IPC/path/import/process tests, canary secrets, archive member inspection | Boundaries and minimized/redacted exports |
| Release read-back | Exact tag/SHA + downloaded installer hash/signature against manifest | Published artifact identity, not inferred publication success |

Evidence entries require task ID, source SHA, environment versions, timestamp, exact command/procedure, expected/actual result, pass/fail/block reason and artifact references/hashes. Keep sensitive raw captures/logs access-controlled and put only sanitized manifests in Git. **Linux/source/simulator checks cannot stand in for Windows installer/secret-store, physical Android, real OCR corpus or GPU tests.** Tests not run are NOT RUN; unavailable resources produce BLOCKED.

## 7. Release-stop conditions and rollback discipline

Stop new dispatch/release on wrong-device input, identity mismatch reaching a side effect, duplicate/uncertain effect retry, secret exposure, data corruption, policy denial, unsafe privilege/process execution or unsupported capability enablement. Capture evidence, isolate the affected profile/version, preserve the durable journal and obtain appropriate authorization before external cleanup.

App/code rollback, DB rollback and external-effect reconciliation are separate operations. Restoring an earlier database must not make an already sent post/comment disappear from known history. Enter dispatch quarantine and reconcile post-backup effects even when the restored row says `NOT_DISPATCHED`; if reconciliation is unavailable, remain paused. Keep protected pre-migration backups until upgrade acceptance and never rotate out a good copy because its replacement failed. No automated deletion/edit of external content is implied by release rollback.

## 8. Exit, approvals and execution record

- [ ] P11-01–P11-09 PASS or individually approved deferral that does not invalidate an enabled release-critical gate.
- [ ] Required installer, signed-artifact, recovery, security, privacy, load, Windows/device and V9 tests pass against the exact candidate.
- [ ] Hardware/app/locale matrix and measured operating envelope are approved; all untested combinations are explicitly unsupported/unverified.
- [ ] READY/DEFERRED/unsupported release notes, runbooks, notices/SBOM, evidence and support privacy controls match shipped behavior.
- [ ] User accepts candidate and separately authorizes merge/tag/publication as applicable; P11-10 remains BLOCKED until that authority exists.
- [ ] If release is authorized, remote tag and published artifact identity are verified; otherwise report RELEASE CANDIDATE READY FOR REVIEW, not released/complete.
- [ ] Final acceptance report records tested commit range, actual commands/results, environment matrix, evidence, remaining limitations and user decision. Phase closure/merge is recorded in the canonical status board.

**Approval:** checklist 1–22 product directions accepted in the decision register; this phase's execution-plan approval and evidence acceptance remain PENDING. Production coding **NO**; signing-key use **NOT AUTHORIZED**; merge/tag/push/publish/distribute **NOT AUTHORIZED BY THIS PLAN**.
**Execution log:** none — planning only.
**Acceptance report:** NOT CREATED; no installer, signature, benchmark or release PASS is claimed.

## Change history

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Added all P11 execution contracts, supply-chain/privacy/recovery coverage, measured-target approval and separate release authority |
| 2026-10-30 | 0.2-draft | Reconciled accepted stack/scope/retention/backup directions; added safe rotation, protected pre-migration copy, restored-NOT_DISPATCHED quarantine and owned-media cleanup tests |
