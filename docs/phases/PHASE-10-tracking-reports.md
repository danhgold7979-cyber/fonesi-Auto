# PHASE-10 — Tracking, health and reports

**Revision:** 0.2-draft · **Date:** 2026-10-30
**Status:** DRAFT — NOT APPROVED / NOT AUTHORIZED FOR EXECUTION
**Task status:** P10-01–P10-09 NOT_STARTED; all implementation/hardware tests NOT RUN
**Planning branch:** `plan`
**Proposed execution branch:** `phase-10` — not created by this plan
**Execution base/owner:** accepted `main` SHA and responsible implementer/reviewer to be recorded at approval

Accepted product directions: [checklist C-01…C-22](../16_ACCEPTED_PRODUCT_DECISIONS.md). These choices do not replace technical proof, platform permission or express Phase execution approval.

## 1. Outcome and requirements

Deliver trustworthy account/post metrics, operational health and exportable reports in the existing V9 Tracking view. The product must distinguish zero from unavailable, configured values from observations, and a baseline snapshot from genuine growth. A permitted data source is required even when the technology can read visible text.

Traceability: [master P10 tasks](../04_MASTER_IMPLEMENTATION_PLAN.md), [product tracking/accounts](../01_PRODUCT_SCOPE.md), [architecture](../02_TECHNICAL_ARCHITECTURE.md), [MetricSnapshot and audit entities](../03_DATA_AND_WORKFLOWS.md), [acceptance AC-10](../05_ACCEPTANCE_AND_RISKS.md), [V9 Tracking mapping](../06_UI_V9_MAPPING.md), [accepted checklist and remaining source/mechanism evidence](../08_DECISIONS_AND_OPEN_ITEMS.md), [execution rules](../11_PHASE_EXECUTION_PLAYBOOK.md), [host resource semantics](../12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md), [documentation policy](../13_DOCUMENTATION_CHANGE_POLICY.md).

**In scope:** permitted metric source registry, provenance/freshness schema, snapshot/history processing, per-network capability map, labeled operational progress bars, health dashboard, CSV/XLSX reports, evidence-based recommendation status and actionable alerts.

**Out of scope:** new social posting flows, cloud scraping service, arbitrary profile harvesting, inference of private/platform metrics, fabricated demo data, a new licensing backend, auto-remediation that changes accounts/devices, silent exports/sharing, V9 redesign or new policy permissions. Do not use fonesi-W code, contracts or schemas.

**Accepted product direction:** checklist 1–22 selects foundation + Facebook first; other networks remain disabled. Captures/UI trees/OCR have 7-day retention, logs 30 days, and jobs/metrics remain until user cleanup; unresolved-effect evidence is retained. Unavailable metrics remain unavailable, not zero or inferred viral data. These directions are accepted, but individual collection permission, source freshness definitions, exact mechanisms/tests and this execution plan still require their gates.

## 2. Entry criteria and decisions

- [ ] Phase 9 is ACCEPTED and merged, or its disabled-only deferral outcome has explicit user acceptance and merge. No technical independence permits Phase 10 to run in parallel.
- [ ] All prerequisite phases and Phase 0 are accepted; **Phase 0 is unfinished at this draft's creation**.
- [ ] User approves this phase plan/task/branch. Accepted Phase 1 contracts, Phase 5 identity/inventory, Phase 6 media state, Phase 7 scheduling and Phase 8 journal/audit are available.
- [ ] Each proposed network/metric source has a written permission/capability outcome, owner, scope and refresh/revocation condition. If Facebook remains disabled, dashboards may show truthful internal health but must not fabricate Facebook metrics.
- [ ] Accepted retention is mapped to schema/artifact ownership with tested unresolved-evidence protection, deletion preview, privacy/export controls and backup interactions; exact mechanisms are reviewed before implementation.
- [ ] Measurement targets and supported data volumes are based on phase benchmarks and approved before acceptance; this draft commits no universal latency or throughput beyond the accepted retention choices.

| Decision | Required resolution before dependent work | Owner |
|---|---|---|
| Permitted collection (B-014) | Source, account/target scope, metric meaning, allowed cadence and policy approval per network; deny unsupported sources | User + policy reviewer |
| Freshness/comparability | Freshness windows, time basis, unit/period rules and source revision compatibility per metric, not one invented global expiry | Product/data owner |
| Retention/privacy (B-015) | Accepted 7-day captures/UI/OCR, 30-day logs, jobs/metrics until user cleanup and unresolved-evidence protection; remaining deletion/access/export mechanisms and tests | User + privacy owner |
| Operational denominators | Meaning of inventory/license/proxy progress; missing inputs produce UNAVAILABLE rather than a plausible percentage | Product owner |
| Alert policy | Trigger/reset conditions, deduplication, severity, suppression and channels; no external notifications without separate scope | Product owner |

The accepted 30-minute scheduling rule is advisory; device/account concurrency remains queued independently. QUEUE is default, AUTO_SHIFT explicit, missed runs REVIEW; default timezone is selectable IANA `Asia/Ho_Chi_Minh`, with DST gaps SKIP + notify and overlaps EARLIER once. Account identity/leases coordinate devices on this PC, not separate PCs. Manual stream emergency throttling is OFF by default and only changes previews after explicit opt-in. Tracking reflects these states without introducing different scheduler/resource policies.

## 3. Proposed service and data contracts

The following are logical module/file targets, not a claim that source already exists. Map them into the accepted Phase 1 layout before coding:

- `tracking/sources/` and `tracking/capabilities/`: approved adapters and per-network metric availability.
- `tracking/snapshots/`, persistence migrations and repository: typed provenance, deduplicated immutable samples and history queries.
- `tracking/health/` and `tracking/alerts/`: read models over observed device/account/media/job state.
- `tracking/export/`: safe CSV/XLSX projection with consistent snapshot boundary.
- `renderer/tracking/`: existing V9 filters, status bars, table and drill-down wiring.
- `tests/tracking/{unit,integration,ui,hardware}/` and planned `docs/evidence/phase-10/` index.

A metric record needs subject type/ID, metric key/value/unit, source kind/reference, period, captured/collected times, availability/freshness/confidence, extractor/profile version and supporting evidence reference. Null/unavailable must not coerce to numeric zero. Separate account, target and post namespaces; a post metric is not automatically an account aggregate. Derived growth stores both source snapshot IDs and the comparison period. Typed IPC returns only authorized redacted projections; the renderer never launches capture processes or receives secrets.

Any visible-UI collection uses the same serial-scoped Device Actor/foreground coordination and current identity checks. It must not interrupt an active publish or grant Python/OCR input ownership. Scheduling collection is not permission to perform it; policy/capability is rechecked at dispatch.

## 4. Task execution details

All tasks are **NOT_STARTED**. Work sequentially; the previous task must PASS or have explicit user-approved deferral before the next begins.

### P10-01 — Permitted account/post metric sources
- **Depends on:** accepted Phase 9 policy/capability dispositions and Phase 8 preflight.
- **Deliver:** source registry and collection permission contract in `tracking/sources/`, listing each account/target/post metric, source, observed unit/period, allowed scope and unsupported reason. Include internal operational sources separately from platform analytics.
- **Positive tests:** approved source/subject pairs produce typed sample requests and current authorization is checked. **Negative tests:** arbitrary URLs, unauthorized targets, removed permission, unknown source and hidden/private data requests cannot dispatch collection; the app shows unavailable/blocked.
- **Evidence/acceptance:** approved source matrix with dated references and service denial tests; actual source availability requires permitted Windows/device evidence, not a mock value.
- **Rollback:** disable the source, cancel undispatched collection and mark stale/unsupported data without deleting historical provenance or widening access.

### P10-02 — Provenance, availability and freshness
- **Depends on:** P10-01 and approved retention/schema contracts.
- **Deliver:** schema/validation/migration for MetricSnapshot, observation timestamp, source revision, unit/period, confidence and explicit AVAILABLE/UNAVAILABLE/STALE/ERROR interpretation in `tracking/snapshots/`.
- **Positive tests:** real zero stays zero with source evidence; absent values remain unavailable; known timestamps and periods round-trip without locale loss. **Negative tests:** malformed units, future/stale clock data, invalid subject, missing provenance and incompatible source versions are rejected/quarantined, never silently repaired as zero.
- **Evidence/acceptance:** schema/migration fixtures and freshness boundary tests using a controlled clock; approved per-metric windows documented.
- **Rollback:** compatible migration rollback or tested pre-migration restore; preserve source/effect audit needed for reconciliation and never rewrite history to remove uncertainty.

### P10-03 — Snapshot scheduler and history
- **Depends on:** P10-02 and accepted Phase 7 scheduling/leases.
- **Deliver:** bounded collection jobs, snapshot idempotency and indexed history query in `tracking/snapshots/`; store actual collection time separately from intended time. Recheck capability/identity before every capture.
- **Positive tests:** repeated scheduler generation produces one intended collection; comparable snapshots create a traceable time series; restart resumes safe read-only work outside restore quarantine. **Negative tests:** device offline, active publish lease, missed slot under REVIEW, DST gap/overlap, clock/timezone shift, duplicate delivery, partial capture and collector crash do not duplicate samples or block critical workflow input; no cross-PC lease guarantee is displayed.
- **Evidence/acceptance:** deterministic clock/DB tests, queue fairness traces and physical capture at approved cadence; partial/stale data is visible, not silently interpolated.
- **Rollback:** pause collection and retain history; back out scheduler changes without resetting idempotency keys or replaying expired jobs indiscriminately.

### P10-04 — Per-network metric capability map
- **Depends on:** P10-03 and Phase 8 capability registry.
- **Deliver:** typed metric capability projection for phone → network → account/target selection, with source-specific READY/UNAVAILABLE/BLOCKED/DEFERRED reasons and certification/version bounds in `tracking/capabilities/`.
- **Positive tests:** selecting a supported subject exposes only permitted metrics and valid freshness labels. **Negative tests:** a Facebook capability is not inherited by another network/account; app update, missing source or policy revocation disables collection across UI, IPC and queued work despite cached UI state.
- **Evidence/acceptance:** source/profile matrix, cache invalidation tests and V9 capability screenshots; no production mock metrics.
- **Rollback:** fail closed to unavailable if capability data is missing/incompatible; retain navigation and supported internal operational metrics.

### P10-05 — Distinct inventory/license/proxy progress semantics
- **Depends on:** P10-04; accepted media inventory/proxy data and an actual approved license source if one exists.
- **Deliver:** status-bar view models in `tracking/health/` with explicit numerator/denominator, units, observation time, meaning and unavailable reason. Preserve V9 threshold colors: red ≤5%, amber 6–49%, green ≥50%, with text/icons rather than color-only meaning; define continuous boundary rendering consistently before coding.
- **Positive tests:** representative known inventory, remaining-validity and proxy states compute labeled percentages from valid inputs; empty inventory is distinct from unavailable data. **Negative tests:** zero denominator, expired/unknown license, missing proxy expiry or device egress proof never fabricates green/100% or treats host reachability as Android routing.
- **Evidence/acceptance:** formula/boundary fixtures and V9 screenshots for known/expired/unavailable states; no licensing subsystem added by implication.
- **Rollback:** revert display projection only, preserving underlying records; show raw labeled status instead of an invalid percentage.

### P10-06 — Device/account health dashboard
- **Depends on:** P10-05 and accepted device/account/target state events.
- **Deliver:** V9 Tracking read model showing device connectivity, stream status separately, session/identity confidence, last verification, queue/effect state and media availability. Preserve phone/network/account/target filter order and existing drill-down behavior.
- **Positive tests:** changing filters/drill-down keeps exact selected device/account/target and right-monitor focus synchronized; loading, empty, stale and error states are visible. **Negative tests:** stream failure is not device disconnect; stale identity is not logged-in assurance; out-of-order events and rapid filter changes cannot leak another account's data or make UNKNOWN jobs successful.
- **Evidence/acceptance:** reducer/integration tests, same-viewport Dark/Light parity and physical disconnect/session-change traces.
- **Rollback:** disable affected read model/drill-down, retain source truth and show explicit unavailable state; no automatic account/device repair actions.

### P10-07 — CSV/XLSX with source timestamps and missing flags
- **Depends on:** P10-06 and approved export/privacy policy.
- **Deliver:** export contract and serializer in `tracking/export/` including source references, periods, observed/collected times, units, availability/freshness and comparison bases. Export from a stable selected snapshot and scope; user chooses destination explicitly.
- **Positive tests:** exported rows round-trip Unicode, timezones, true zero and missing values; filtered selection/row counts match preview. **Negative tests:** spreadsheet-formula injection, malformed strings, path traversal, overwrite collision, file lock, disk full, cancel and changing filters cannot leak secrets, escape selected paths or report a partial file as success.
- **Evidence/acceptance:** synthetic export fixtures reopened by supported readers, schema checks, Windows file-failure tests and redaction scan. Exported content is labeled with its actual source, not platform endorsement.
- **Rollback:** leave no incomplete final artifact; clean only the export operation's temporary files and never remove an existing user file without approval.

### P10-08 — No unsupported recommendation/viral inference
- **Depends on:** P10-07 and approved source metric definitions.
- **Deliver:** derived-metric policy in `tracking/snapshots/` and UI: growth requires comparable snapshots; recommendation/viral status is unavailable without an explicit permitted traffic-source metric and approved definition.
- **Positive tests:** approved comparable periods/units yield correct change with references to both samples; valid source-specific recommendation data is clearly attributed. **Negative tests:** likes alone, single snapshot, zero baseline, mismatched periods, source revisions, units or subjects cannot produce fabricated growth/viral claims; stale data remains labeled.
- **Evidence/acceptance:** comparison decision table including percentage-vs-absolute rules and approved labels; UI/export render the same result and missing reason.
- **Rollback:** disable the derived indicator, preserve raw data/provenance and display unavailable until the formula/source definition is approved.

### P10-09 — Operational alerts
- **Depends on:** P10-08 and approved alert semantics.
- **Deliver:** deduplicated internal alerts for idle, expired, low inventory, offline, blocked and unknown jobs in `tracking/alerts/`, each tied to source state/time, affected subject, severity and a safe operator action. Distinguish alert acknowledgment from fixing the underlying state.
- **Positive tests:** sustained known condition produces one actionable alert; recovery/acknowledgment follows the approved lifecycle and drill-down opens the exact subject. **Negative tests:** stale sensors, flapping connectivity, repeated events, app restart, hidden/deleted subject and contradictory updates do not flood alerts, silently clear UNKNOWN effects or trigger automatic retries/publishing.
- **Evidence/acceptance:** clock-controlled trigger/reset tests, event replay and Windows UI notification behavior; external email/chat delivery remains outside this authorization.
- **Rollback:** pause alert delivery while preserving event/acknowledgment history; dashboard continues to expose underlying safety-critical blocked/unknown state.

## 5. Verification and evidence strategy

| Layer | Required procedure | Evidence / limitation |
|---|---|---|
| Lint/type/unit | Use exact approved harness commands recorded at phase entry | Command, commit, output, exit code; validate units, nulls, time and formulas |
| DB/integration | Fresh/migrated DB, duplicate deliveries, crash/restart, source revocation | No duplicate/misattributed snapshots; constraints and provenance preserved |
| UI/V9 | Full reference comparison at matched viewport/DPI, Dark/Light, empty/error/loading/stale states | No navigation/layout redesign, wrong-subject data or false status |
| Export | Reopen supported CSV/XLSX fixtures, validate formulas/Unicode/row scope, inject filesystem failures | Only selected/redacted content, safe temporary-file cleanup |
| Windows/Android | Permitted real capture, identity mismatch, device loss, queue contention | Actual source integration and actor isolation; mocks cannot substitute |
| Performance | Repeated history/filter/export tests at approved dataset sizes; concurrent stream/vision/job load | Raw timings, memory, queue/actor latency; user-approved targets before PASS |

Record task ID, code SHA, operating system/device/app/profile versions, timestamp, expected/actual outcome and artifact hashes. Evidence containing private content remains in approved access-controlled storage with a sanitized manifest. Source inspection, Linux tests and simulator replay do **not** certify Windows filesystem behavior, physical-device collection, OCR accuracy or GPU telemetry. No metric source is called supported solely because a fixture exists.

## 6. Migration, privacy, recovery and risks

- Version MetricSnapshot/source schemas and test backup/restore. Preserve raw observation metadata through schema changes; never change an old metric's meaning in place.
- Retention tests cover 7-day captures/UI/OCR, 30-day logs, jobs/metrics retained until user cleanup and unresolved-effect evidence protected beyond expiry. Test time boundaries, deletion preview and exact ownership; never purge metrics because a raw capture expired or broaden storage merely because screenshots are available.
- Renderer projections and exports omit secrets and minimize account/device identifiers. Do not include unrelated files or raw private screenshots by default.
- Rollback pauses collection/export/alerts and preserves durable samples. An old-backup restore stays in dispatch quarantine until post-backup effects are reconciled; restored `NOT_DISPATCHED` does not prove no effect happened. Historical side-effect records are not disposable metrics.
- Principal risks: unauthorized collection (deny source), false analytics (provenance/comparability), wrong account attribution (fresh identity), alert fatigue (deduplication), export leakage (scoped projection and redaction), resource contention (bounded scheduling). Each unresolved risk needs a named owner at approval.

## 7. Exit, approval and execution record

- [ ] All P10 tasks PASS or individually user-approved DEFERRED with explicit unavailable behavior.
- [ ] Every displayed/exported metric has permitted provenance, observation time, unit/period and availability; no mock production data and no missing-as-zero coercion.
- [ ] Growth and recommendation rules pass positive/negative tests; unsupported indicators are unavailable.
- [ ] Required Windows/device tests, Phase 7/8 safety regression, privacy/export review and V9 parity pass.
- [ ] Alerts cannot modify external account/device state or replay uncertain effects.
- [ ] Approved retention, source refresh/revocation and rollback procedures are documented with evidence.
- [ ] Acceptance report links commit range, exact tests, source/device matrix, benchmarks and limitations; user accepts and separately authorizes merge before Phase 11 starts.

**Approval:** checklist 1–22 product directions accepted in the decision register; this phase's execution-plan approval and evidence acceptance remain PENDING. Production coding authorized **NO**; new collection/export/sharing permission **NOT GRANTED BY THIS PLAN**.
**Execution log:** none — planning only.
**Acceptance report:** NOT CREATED; no runtime PASS or production-readiness claim.

## Change history

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Added complete P10 execution/test/evidence/rollback coverage; no implementation authorization |
| 2026-10-30 | 0.2-draft | Applied accepted product/retention/scheduler directions and restore quarantine while retaining source permission and execution/test gates |
