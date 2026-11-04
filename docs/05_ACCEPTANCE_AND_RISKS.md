# Acceptance Criteria and Risk Register

**Revision:** 0.3-review · **Date:** 2026-10-30
**Purpose:** Prevent mock UI, optimistic assumptions or unverified automation from being treated as production-ready.

## 1. Phase and release acceptance gates

**Status: all gates below are requirements, not passed results.** Phase 0 is IN_PROGRESS (4 execution tasks in progress, 6 not started), with its exit gates unaccepted; production app/CI do not exist at this snapshot. Acceptance requires evidence for the exact candidate, review and explicit user decision. A plan, partial device smoke result, green mock test or merged PR is not acceptance.

Each phase must satisfy its gate and the applicable earlier regression gates. A formal deferral records requirement, reason, product consequence/disabled capability, owner, revisit trigger and user approval; it is not PASS. See [master tasks](04_MASTER_IMPLEMENTATION_PLAN.md) and [requirement traceability](14_REQUIREMENTS_TRACEABILITY.md).

Stable gate IDs are AC-00…AC-11. Legacy G0…G9 map to AC-00…AC-09; legacy G3A is consolidated into AC-03; legacy G10 (release) maps to **AC-11**, not AC-10. AC-10 now explicitly gates tracking/reporting.

Accepted [C-01…C-22](16_ACCEPTED_PRODUCT_DECISIONS.md) plus DEC-019/020 are the product baseline for these tests. Accepted direction is not measured compatibility, a passed test, an approved Phase amendment or permission to publish on real accounts.

### AC-00 — Product and policy
- Every G0-01…G0-19 gate mapped to approved P0 execution evidence and a recorded outcome; mandatory physical-device smoke evidence is present.
- Accepted stack, pilot, USB-first, host/AVD, retention/backup and scheduling directions are recorded; exact support profiles, versions/mechanisms, schema/Unicode/key/proxy proofs and numerical criteria are approved or explicitly restricted/deferred. No settled product preference is reclassified OPEN.
- Scope, supported platforms and no-manual expectation documented.
- Each automated platform action has a policy/permission outcome.
- No anti-detection, CAPTCHA/checkpoint bypass or unauthorized data collection.
- Unsupported actions are disabled and clearly labeled.

### AC-01 — Desktop foundation
- V9 navigation/layout and Dark/Light work.
- Secure IPC; renderer cannot execute shell commands.
- Electron/React/strict TypeScript boundaries, SQLite WAL/foreign keys/migrations and Windows-backed secret references are tested against pinned compatible versions.
- Encrypted migration backup and restore tests pass; migration refuses to proceed without a verified prerequisite backup (C-05/14/22).
- Structured logs redact secrets.

### AC-02 — Device control
- At least two physical Android devices can connect simultaneously; emulator evidence is separately labeled.
- Commands are always serial-scoped.
- Per-device command queue prevents input races.
- USB disconnect/reconnect and ADB server restart recover safely. USB is accepted first; Wireless Debugging stays disabled until dedicated authenticated pairing/reconnect/security tests pass (C-17).
- Wrong-device command test passes (must never control another phone), including serial reuse/reconnect generation fencing.
- Vietnamese/English, emoji, punctuation and multiline text round-trip through the approved sole-actor input path; loss/corruption blocks affected workflows. Helper installation/permissions require separate authorization; no uncontrolled clipboard/keyboard access (C-08).

### AC-03 — Screen wall
- Stream process is video-only.
- Ctrl+wheel zooms tile dimensions; normal wheel semantics match V9.
- Single/all/selected modes work.
- Stream backpressure and overload behavior are measured.
- Device record count is not hard-capped; active stream count is resource-bounded.
- User can adjust FPS, resolution/scale, bitrate/quality and maximum concurrent streams.
- Auto and Manual modes, global defaults and per-device overrides work.
- Realtime CPU/RAM and supported GPU telemetry is timestamped; unavailable metrics show UNKNOWN.
- Requested/effective/recommended settings are separately visible.
- Warnings use benchmark-derived thresholds, hysteresis and actionable recommendations.
- Emergency throttling is explicit, logged and restores requested settings only after stable recovery when enabled.
- Stream overload cannot corrupt/drop ADB input; measured input latency stays within the approved budget under the tested stream/vision envelope.
- CPU/RAM/GPU/disk/network and stream metrics carry source, timestamp and freshness. Sensor loss/staleness transitions to UNKNOWN, not GREEN or zero.
- Global/selected/per-device controls, effective FPS/resolution, override/reset and preset semantics are verified.
- Manual emergency throttle is **OFF by default** and opt-in (DEC-019); disabling it preserves requested values, blocks unsafe new starts/increases and reports degraded previews. Hard technical limits remain enforced.
- Sustained threshold/hysteresis/cooldown and gradual recovery do not oscillate. Under pressure, preview/nonessential vision degrades before active input integrity; no automatic workflow cancellation for FPS.

### AC-04 — UI recognition
- Labeled screenshots and UI trees cover supported app versions/locales.
- UI Automator selector success rate meets agreed target.
- OpenCV + PaddleOCR CPU-first fallback precision/recall and latency meet the preapproved benchmark; UI Automator remains first, with deployment/version/model chosen by evidence (C-06).
- Unknown state/low confidence blocks action.
- Python worker crash cannot issue or corrupt device commands.

### AC-05 — Identity and account
- Device identity, account identity and target identity are separate.
- A job is blocked when identity confidence is insufficient.
- No passwords, OTPs or raw session cookies are stored; proxy credentials only use protected secret references.
- Real package/icon inventory, APK signature/package/version/downgrade checks, protected-app refusal and per-device cancel/results pass.
- Device-level HTTP/HTTPS proxy activation requires actual Android route proof; expiry/cancel/rollback states are truthful. SOCKS5/per-app routing is deferred, never implicitly enabled (C-09).
- Verified global account identity and lease prevent simultaneous publication across phones in one local-PC coordinator; name/avatar cannot merge identity and no cross-PC lock is claimed (C-12).
- Initial device authorization/login is user-performed; routine certified work is unattended, but expiry/2FA/checkpoint/security challenges stop and report without bypass/substitution (C-03).

### AC-06 — Media/content
- Recursive folder scan, hash dedupe and file-stability checks pass.
- Excel import preview and row error reporting pass.
- Media is matched by relative path/hash, not row order or basename alone.
- Caption, hashtag, schedule and 0–10 comment fields round-trip through blank/current-content exports and supported template versions.
- TXT imports reject ambiguous path/encoding matches; changing/locked files invalidate validation and never stage partial content.
- Exact Android staging/picker identity is verified with file/hash/ownership manifest. Low-storage/cancel/error cleanup touches only safe tool-owned staging; never original/unrelated files. Completion cleanup requires verified outcome; UNKNOWN keeps recovery data (C-21).
- Explicit album/group key plus ordered assets forms one post per target; folders are not implicitly albums. Validate exact count/order and certified composer constraints before dispatch and in outcome evidence (C-20).
- Reuse is off by default; explicit campaign permission is required. Comments start only after verified publish with the defined delay/interval.

### AC-07 — Scheduler
- Every-N-days anchors to selected start date in schedule timezone; weekdays/once also pass. End date is inclusive; max occurrences counts planned occurrences, not successes. Both bounds stop at the first reached; retries/skips add no replacement occurrences (C-18).
- Default IANA timezone is Asia/Ho_Chi_Minh and selectable per schedule. DST nonexistent local time skips with notification; overlap chooses the earlier occurrence exactly once. Timezone/rule version is snapshotted (C-11).
- Gaps below 30 minutes show a warning, not a hard minimum (DEC-020). Device/account conflicts still queue or use the explicitly selected collision policy; warning acknowledgment never bypasses locks.
- QUEUE is default; AUTO_SHIFT explicit and constrained to configured window and same local day, otherwise REVIEW. Downtime-missed/unadmitted occurrences enter REVIEW rather than a catch-up flood; already admitted queue work stays QUEUE (C-10/18/19).
- Complete valid row date/time/timezone visibly overrides its profile; absent override follows profile, partial/invalid override errors. Never generate both jobs for the same content occurrence; validate slot counts before save (C-18/19).
- Whole-workflow device/account leases prevent conflicting jobs and manual input/Home/Back/APK/proxy mutation between steps. Conflicts reject, or explicit pause/takeover drains/fences work, reconciles uncertain effects and invalidates capture/identity before control changes.
- Schedule edits are audited and reversible; drag/drop invalid/revision-conflicting moves revert visibly.
- Start/end dates, maximum occurrences, slot count, overdue/clock-change behavior and priority aging are tested.
- Persisted lease fencing and immutable schedule/content/workflow snapshots prevent stale dispatch after restart or takeover.

### AC-08 — Workflow runtime
- Every external action has a durable intent record.
- Success requires verification evidence.
- Unknown external effect is not blindly retried.
- Retry only known-safe actions.
- Crash/restart recovery does not duplicate a post. Backup restore quarantines dispatch until effects after the backup reconcile and leases/identity revalidate; restored NOT_DISPATCHED never proves no later external effect happened.
- Workflow version/profile certification is enforced; app/layout/profile drift revokes readiness before dispatch.
- Interaction ledger keys/eligibility use verified references and authorized sources; UNKNOWN does not become NOT_DONE. Latest-N is blocked without permitted ordering/pagination.
- Cancellation after possible dispatch reconciles the effect, rather than treating it as undispatched; comment retries cannot duplicate uncertain comments.

### AC-09 — Platform workflow
- Exact account, target, app package/version and locale verified.
- Policy gate is passed for each action.
- Owned/administered Page photo/album/video/Reels pilot flows each pass positive/negative cases and written per-action permission; Story is separately certified. Profile/Group/reactions/shares remain off; relevant comments require permitted scope, and other networks remain unsupported (C-01/02).
- No unsupported flow can be started.
- Volume/throughput is limited to tested operating envelope.

### AC-10 — Tracking and reporting
- Every metric names permitted source, identity scope, key/unit/period, collected time, confidence and freshness.
- Unavailable/stale/denied readings are not zero or fabricated; production rejects demo data.
- Growth needs at least two comparable valid snapshots; recommendation/viral claims require explicit source metrics.
- Inventory/license/proxy bars label their distinct denominator and units; alerts are deduplicated and show evidence.
- CSV/XLSX reports preserve source timestamps, missing-data flags and consistent values; untrusted cells cannot execute formulas on export.

### AC-11 — Release
- Installer, upgrade, backup/restore, rollback and uninstall tested.
- Security review passed.
- Hardware/support matrix and measured stream/vision/input/media budgets are published with exact version/profile coverage.
- Dependencies/models/binaries have version pins, checksums/provenance, SBOM and license notices; vulnerability findings have reviewed dispositions.
- Exact release candidate passes full regression and clean supported-Windows install; signatures/artifact hashes verified.
- No critical/high unresolved defect or unrun mandatory check. Lower-severity exceptions require approved owner, consequence and deadline/revisit condition.
- Capability certificate expiry/revocation, emergency disable, backup/restore, privacy retention/deletion and rollback runbooks are exercised.
- Release notes list READY, disabled, DEFERRED and untested capabilities separately; no universal device/stream claim.
- Logs and support bundle contain no secrets. Captures/UI/OCR diagnostics retain 7 days; technical logs 30 days; job/derived metric history remains until explicit cleanup. Unresolved UNKNOWN/reconciliation/idempotency evidence survives normal cleanup (C-13/21).
- Manual backup is available; encrypted local backup runs before migration and at most once daily while the app runs. Seven validated ordinary copies are retained in the user-chosen folder, with no automatic cloud upload. Pre-migration safety copy remains until upgrade acceptance (C-22).
- Failed backup is visible and cannot delete/replace known-good copies; migration blocks without verified prerequisite backup. Same-machine and other-machine key/restore portability are separately tested, not assumed (C-14/22).

## 2. Device and host test matrix

Candidate coverage below is a proposal, not a support promise. Before acceptance replace it with exact user-owned/lab identities and measured supported profiles. A missing device/host is NOT_RUN or an approved scope restriction, never inferred PASS:
- Android 11, 12, 13, 14, 15 and 16 where available.
- At least two manufacturers (Google/AOSP-like and one heavily customized OEM).
- Low/mid/high screen resolutions and density buckets.
- English and Vietnamese locale.
- USB connection, Wireless Debugging pairing and Wi-Fi reconnect.
- Battery saver, screen lock, rotation, low storage, poor USB cable and unstable Wi-Fi.
- Facebook app stable release and one prior supported version.
- App update during a queued job.

Include Windows build/edition, CPU/RAM, GPU adapter/driver/counter availability, display scaling, USB controller/cable, network, runtime/model/ADB/stream-backend versions and host storage. Exercise minimum/recommended/high host profiles and concurrent stream+vision+ADB load; a single PC establishes only that PC's measured envelope. Record unsupported CPU/GPU sensors explicitly.

Do not claim support for an Android version, OEM, host or app/locale profile until its corresponding test suite passes. App/driver/runtime changes trigger affected recertification.

## 3. Required failure-injection tests

- F-01 Disconnect USB while a tap command is queued.
- F-02 Disconnect after a publish button may have been pressed.
- F-03 Restart ADB server while two phones are active.
- F-04 Kill scrcpy while the device actor remains healthy.
- F-05 Kill Python Vision Worker during OCR.
- F-06 Return malformed/empty UI hierarchy.
- F-07 Return low-confidence OCR.
- F-08 Change orientation between screenshot and action.
- F-09 Change logged-in account before a job starts.
- F-10 Switch Page/target unexpectedly.
- F-11 Trigger unexpected dialog/checkpoint/permission prompt.
- F-12 Fill storage during media staging.
- F-13 Modify a media file after scan.
- F-14 Expire proxy or lose device-side route.
- F-15 Crash desktop process after effect intent but before outcome record.
- F-16 Restart after a job reaches UNKNOWN.
- F-17 Re-run generation across complete/absent/partial row overrides, retries/skips, end/max boundaries and downtime restart: no duplicate profile+row jobs, replacement occurrences or catch-up flood; admitted queue jobs remain QUEUE (C-10/18/19).
- F-18 Import Excel with duplicate filenames in different folders and ordered album groups; reject wrong/missing assets, implicit folder grouping, wrong count/order and unsupported composer constraints (C-20).
- F-19 Change app version and invalidate UI certification.
- F-20 Change timezone/DST, every-N anchor/end/max bounds and AUTO_SHIFT window: nonexistent time skips/notifies, overlap uses earlier once, end inclusive, planned occurrences count, out-of-day/window shift enters REVIEW; no duplicate replacement (C-11/18).

- F-21 Run manual mode with emergency throttle OFF/ON, stale GPU counters and CPU/RAM pressure; requested settings remain unchanged, effective changes are explained, ADB stays intact.
- F-22 Cross warning/critical/recovery boundaries repeatedly; sustained windows/hysteresis prevent flicker and restoration oscillation.
- F-23 Send stale renderer/worker replies and old transport-generation commands after reconnect; reject them without effects.
- F-24 Attempt invalid IPC payloads, shell/path injection, unauthorized filesystem reads and secret-bearing diagnostic export; deny/redact.
- F-25 Restore an older encrypted backup after migration/interrupted write and after a later publish succeeded or became uncertain; quarantine dispatch until post-backup effects reconcile and identity/leases revalidate. A restored NOT_DISPATCHED record cannot authorize replay; verify locked secret handling and no duplicate dispatch. Exercise manual/daily/pre-migration backup, seven-copy rotation, backup failure/low disk and unaccepted upgrade: preserve known-good and pre-migration safety copies, block unsafe migration, and retain unresolved evidence beyond normal cleanup (C-13/14/21/22).
- F-26 Cancel/kill during APK install or proxy assignment; report per-device actual state and safe rollback/recovery, never batch-level false success.
- F-27 Corrupt staged media/Unicode text or cancel transfer; exact-content verification blocks publishing and cleans only app-owned data.
- F-28 Expire/reclaim a device/account lease while an old worker resumes; fencing prevents simultaneous dispatch. During gaps between workflow steps attempt wall input/Home/Back, APK install and proxy changes: reject conflict, or explicitly drain/fence/reconcile before takeover and invalidate capture/identity before resume.
- F-29 Feed absent/stale/incomparable metrics, hostile spreadsheet cells and duplicate alerts; preserve missingness, safe exports and correct notification state.
- F-30 Upgrade app/UI/driver/model/backend or revoke policy/capability approval; block outdated certificates and require recertification.

Each F-case requires a procedure, exact injection point, expected durable/UI/device state, actual observations, cleanup and evidence ID in the relevant Phase Plan. Passing an isolated fault test does not certify the whole phase.

## 4. Risk register

All risks are OPEN for mitigation/verification unless an evidence-backed disposition is recorded in the relevant Phase acceptance report. A listed mitigation is not evidence it exists. Accountable owner is the respective Phase owner, assigned in its approved plan; policy/product exceptions require the user. Historical duplicate-ID mapping is in [traceability §3](14_REQUIREMENTS_TRACEABILITY.md#3-historical-id-migration-no-requirement-deleted).

| ID | Risk | Impact | Mitigation / decision |
|---|---|---|---|
| R-001 | Meta policy restricts automated UI access/data collection | Account restriction / product unusable | Written policy gate; disable unsupported actions; no evasion |
| R-002 | Facebook UI changes frequently | Workflow failures | Versioned UI profiles, screenshot fixtures, certification |
| R-003 | Profile/Group flows are not stable or supported | Cannot meet all-auto requirement | Keep disabled until verified and permitted |
| R-004 | ADB commands race across phones | Wrong device action | Exact serial + per-device actor + negative tests |
| R-005 | UI tree missing/inaccessible | Recognition failures | OpenCV/OCR fallback; safe stop on low confidence |
| R-006 | OCR mistakes Vietnamese/English | Wrong action | Labeled benchmark, confidence threshold, semantic selector first |
| R-007 | scrcpy stream overload | UI freezes / high CPU | Adaptive stream profiles and resource budget |
| R-008 | Python runtime/model too large | Slow install / high memory | CPU-first benchmark, lazy model load, package-size gate |
| R-009 | Account identity not provable | Post to wrong Page/Profile | Identity confidence and preflight block |
| R-010 | ADB text input corrupts Unicode | Broken captions/comments | Dedicated Unicode input proof; round-trip test |
| R-011 | Publish timeout after server accepts | Duplicate post | Durable intent + read-back reconciliation; no blind retry |
| R-012 | Account session changes mid-job | Wrong account action | Account lock and foreground identity recheck |
| R-013 | Proxy check only proves host reachability | Device traffic leaks | Device-side egress verification |
| R-014 | APK uninstall removes critical app | Device unusable | System app protection and batch confirmation policy |
| R-015 | Analytics metric unavailable/stale | False growth alerts | Provenance/freshness; unavailable is not zero |
| R-016 | Unlimited phones misunderstood as unlimited streams | Resource exhaustion | Unbounded registry, bounded concurrent streams |
| R-017 | Media basename collisions | Wrong content mapped | Relative path + hash mapping |
| R-018 | Schedule DST/timezone ambiguity | Wrong execution time | IANA timezone and explicit DST tests |
| R-019 | Desktop/ADB/worker crash | Lost or duplicate work | Persistent queue, leases, effect journal, recovery |
| R-020 | User expects fully automatic unsupported flows | Scope conflict | Capability registry and explicit unavailable state |
| R-021 | Stream settings exceed current PC capacity | Host overload / frozen preview | Live telemetry, benchmarked budgets, warnings and emergency background-stream throttle |
| R-022 | GPU counters are missing or driver-specific | Incorrect performance status | Sensor availability states, Windows baseline counters and UNKNOWN fallback |
| R-023 | Auto mode oscillates FPS/quality under fluctuating load | Poor viewing experience | Rolling averages, hysteresis, cooldown and gradual recovery |
| R-024 | Manual override is silently changed | Loss of user control | Requested vs effective settings, explicit emergency-throttle opt-in and audit log |
| R-025 | Resource monitor consumes too much CPU | Monitoring worsens overload | Lightweight sampling, profiling and bounded polling |
| R-026 | Manual stream requests exceed the host envelope | Host instability / control latency | Enforce hard limits, warn above recommendation, apply accepted DEC-019 OFF-by-default opt-in policy and log effective degradation |
| R-027 | Staged asset differs from validated content | Wrong media published | Hash/path mapping, picker proof, changed-file invalidation and storage/cancel tests |
| R-028 | Stale lease/worker resumes after crash | Concurrent input or duplicate effect | Durable fencing, immutable snapshots and takeover tests |
| R-029 | Untrusted package, model or IPC/path input | Host/device compromise | Approved artifact provenance, signature/SBOM review, allowlisted validated IPC and process/path boundaries |
| R-030 | Backup/retention failure exposes data or loses intent | Privacy breach / replayed effects | Encrypted restore drills, dispatch quarantine/reconciliation, deletion/retention policy and preserved UNKNOWN state |
| R-031 | Emulator/one-host result treated as general support | Unsupported hardware release | Physical/host matrix evidence and capability-limited release statements |

## 5. Definition of done for a workflow

A workflow is DONE only when:
- It has a versioned definition and supported-profile declaration.
- Preconditions and required permissions/policy state are explicit.
- It passes UI Automator/OCR fixtures.
- It passes physical-device integration tests.
- It writes durable job/step/effect records.
- It verifies the actual resulting state.
- It has failure, timeout, cancellation and recovery tests.
- It is visible as READY only for certified combinations.

## 6. Verification suite registry (planned)

These stable test families are specifications, **not executable commands or test results**. Each approved Phase Plan must bind them to actual package scripts/procedures and fixtures before implementation. Phase 1 creates app CI; until then no app CI pass is claimable.

| Family | Coverage and decisive expected result | Primary tasks / gate | Evidence required |
|---|---|---|---|
| T-00 | Gate decisions, host/AVD lifecycle, physical smoke, OCR/stream/telemetry feasibility; every unresolved scope item remains blocked or explicitly deferred | G0-01…19; P0-01…10 / AC-00 | Inventory, dated source review, raw benchmark samples, ADR approvals and P0-10 report |
| T-01 | Shell starts; invalid IPC/path/process requests denied; strict types; migrations atomic; encrypted backups restore; secrets redacted; demo data isolated | P1-01…11 / AC-01 | Clean build/check logs, threat/contract review, DB restore fixtures and denied-request traces |
| T-02 | Two physical serials never cross-control; reconnect generations reject stale work; cancellation/server restart safe; Unicode exact round-trip | P2-01…13 / AC-02 | Sanitized serial map, command/event traces, physical read-back and F-01/03/08/23/27 |
| T-03 | Video-only streams, scoped settings, fresh/unknown sensors, approved hard budgets and OFF/ON throttle; latency remains within frozen budget under load | P3-01…19 / AC-03 | Host matrix/raw samples, settings/event traces, capture parity and F-04/21/22 |
| T-04 | Labeled selector/OCR holdout accuracy and latency meet preapproved thresholds; stale/ambiguous/low-confidence results refuse action | P4-01…12 / AC-04 | Dataset manifest/license/labels, model versions, precision/recall and p50/p95 latency/memory, F-05…08/11 |
| T-05 | Wrong/expired identity blocks; app inventory real; signature/protected-app guards; device-side proxy route and rollback verified | P5-01…15 / AC-05 | Physical UI/package/egress proof, masked audit and F-09/10/14/26 |
| T-06 | Nested/duplicate/changing files map exactly; Excel/TXT preview and export round-trip; explicit ordered albums and staged ownership/cancel/storage checks prevent wrong content | P6-01…16 / AC-06 | Synthetic file corpus, import error reports, hashes, Android stage proof and F-12/13/18/27 |
| T-07 | Idempotent generation; accepted anchors/bounds/DST/row override/REVIEW/shift-window/30-minute warning; revision revert, bounded starvation, leases/fencing survive restart | P7-01…13 / AC-07 | Deterministic virtual-clock fixtures, persisted snapshots, lease traces and F-17/20/28 |
| T-08 | Intent precedes dispatch; known-safe retry only; UNKNOWN persists; pause/cancel/restart never duplicate effect; ledger count/source truthful | P8-01…14 / AC-08 | State transition/effect traces, fault matrix and F-02/15/16/19/28/30 |
| T-09 | Each permitted enabled action has exact profile/identity/read-back and negative cases; disabled actions cannot dispatch | P9-01…12 / AC-09 | Per-capability certificate, written permission, controlled physical trials and recovery evidence |
| T-10 | Missing metrics remain unavailable; valid comparable snapshots only; exports traceable/safe and alerts deduplicated | P10-01…09 / AC-10 | Source permission matrix, fixture/report comparisons and F-29/30 |
| T-11 | Exact signed candidate installs/upgrades/restores/rolls back safely; resource/load/security/supply-chain/7-day/30-day retention and seven-copy backup cadence matrix passes | P11-01…10 / AC-11 | Windows artifact hashes/signatures, SBOM/license/security findings, load/recovery reports and F-24/25 |
| T-12 | Same-viewport V9 parity: labels/order, dock, themes, tile focus/scroll/zoom, 20-row table, workflow disabled reasons; loading/empty/error/keyboard states | All UI tasks / AC-01…11 | Before/after screenshots plus interaction assertions; visual resemblance alone is insufficient |

### Measurable budgets and results

Before a performance/accuracy test, record approved target, rationale, dataset/profile, measurement window, sample count and pass rule in the Phase Plan. Required budget dimensions: UI responsiveness; ADB p50/p95 and maximum command latency; stream delivered FPS/frame-drop/latency; CPU/RAM/GPU/monitor overhead; OCR precision/recall/latency; media scan/import size/time/memory; scheduler backlog/lease recovery; installer size/startup; recovery/backup time and data-loss boundary. Values remain OPEN until measured/approved. Results report actual distribution and failures, never only an average or selected success screenshot.

Evidence minimum: task/RQ/T/F IDs, exact commit/build and dependency versions, sanitized host/device/app/locale profile, fixture hash, procedure/commands, expected versus actual, raw output/artifact links, result PASS/FAIL/NOT_RUN/BLOCKED, reviewer and user acceptance reference. Keep secrets/private screenshots outside public Git; retain sanitized proof and controlled evidence references under the approved retention policy.

## 7. Readiness and release decision

| State | Necessary evidence | Current position |
|---|---|---|
| PLAN_REVIEWABLE | Coherent requirements, IDs, dependencies, draft task plans and open decision owners | This documentation revision targets reviewability; it is not execution approval |
| PHASE_READY | Predecessor accepted/merged, required decisions resolved and current detailed plan approved | Only Phase 0 feasibility is authorized; current exits unaccepted |
| IMPLEMENTATION_READY | AC-00 accepted, approved stack/schema/support/acceptance decisions and Phase 1 approval | NOT MET |
| CAPABILITY_READY | AC-08/09 plus policy, exact app/device/locale/account/target certificate and fresh identity | NOT MET; no production workflows |
| RELEASE_CANDIDATE_READY | AC-00…11 on exact candidate, full regression, all blocking defects resolved and truthful scope | NOT MET; no app/installer/CI candidate |
| RELEASE_AUTHORIZED | User approves release package and destination after above evidence | NOT REQUESTED/NOT GRANTED by this plan |

Release package includes immutable commit/artifact hashes; signed installer and verification; support/capability matrix; migration/backup/rollback instructions; policy/license/security dispositions; known limitations and disabled features; test/evidence manifest; operator support/retention runbooks. Tagging/publishing/merging requires its own authorization. A disabled capability may be an approved release limitation, but must never be described as a completed working workflow. No mandatory safety invariant (single input owner, identity gate, durable unknown-effect handling, no bypass/secrets leakage) is waived by a product scope deferral.

## 8. Change history

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Historical acceptance/risk baseline retained in Git. |
| 2026-10-30 | 0.2-draft | Unique AC gates, duplicate-risk migration, explicit tracking gate, planned T/F coverage and evidence/readiness definitions; DEC-019 manual OFF opt-in and DEC-020 warning-only gap recorded without claiming tests/Phase acceptance. |
| 2026-10-30 | 0.3-review | Applied accepted C-01…C-22 to existing AC/T/F cases: stack/pilot/USB/proxy, exact recurrence/row override, ordered albums, retention/ownership cleanup and safe backup cadence; no tests or Phase exits inferred passed. |
