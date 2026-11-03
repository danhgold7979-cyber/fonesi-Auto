# Data Model and Workflow Specifications

**Revision:** 0.3-draft · **Date:** 2026-10-30
**Status:** Accepted product behavior with PROPOSED schema/mechanics; no migrations approved by this document.

[Accepted C-01–C-22](16_ACCEPTED_PRODUCT_DECISIONS.md#1-accepted-checklist), DEC-019 and DEC-020 govern the behavior below. The detailed schema/IPC/recovery mechanics in [ADR-0004](decisions/ADR-0004-runtime-data-contracts.md) and relevant Phase plans still require review/tests before implementation. Entity names/fields are a logical design, not accepted SQL DDL; accepted product choices are not reopened by a PROPOSED implementation heading.

## 1. Entity map

```text
Workspace
 ├─ Device 1..N
 │   ├─ DeviceTransport 1..N
 │   ├─ InstalledApp 1..N
 │   ├─ Account 0..N (local device/platform session)
 │   │   └─ Target 0..N
 │   └─ ProxyAssignment 0..1
 ├─ AccountIdentity 0..N (shared across local Account sessions)
 │   └─ PublishLease / lease history
 ├─ HostCapabilityProfile / StreamSettings / StreamObservation
 ├─ MediaSource 1..N
 │   └─ MediaAsset 0..N
 ├─ ContentCampaign 1..N
 │   └─ ContentRow 1..N (one logical single-media/album post)
 │       └─ ContentRowAsset 1..N (explicit ordered membership)
 ├─ ScheduleProfile 1..N
 ├─ WorkflowDefinition 1..N
 ├─ Job 0..N
 │   ├─ JobStep 1..N
 │   ├─ EffectIntent 0..N
 │   │   └─ EffectAttempt / ReconciliationRecord
 │   └─ JobEvidence 0..N
 └─ MetricSnapshot / AuditEvent / Notification / StagedMediaCopy / BackupRecord
```

## 2. Proposed entities

### Device
- device_id (UUID)
- android_identity_hash (stable identity fingerprint; not serial alone)
- serial_display (redacted where needed)
- model, manufacturer, android_version, sdk_level, build_fingerprint, locale
- connection_state, last_seen_at, battery_percent, storage_free_bytes
- generation (durable monotonic device-control epoch), display_profile_revision (dimensions, density, rotation)
- selected, notes, created_at, updated_at

### DeviceTransport
- transport_id, device_id
- kind: USB | WIFI_PAIRING | WIFI_TCP
- endpoint/serial reference (sensitive fields redacted)
- state: CONNECTED | PAIR_REQUIRED | OFFLINE | UNAUTHORIZED | CONFLICT
- last_seen_at, generation, diagnostics

### InstalledApp
- app_id, device_id, package_name, label, version_name, version_code
- installer_package, is_system, is_enabled
- icon_cache_key, icon_extraction_state
- last_scanned_at

### AccountIdentity — shared publishing identity (C-12); proposed schema
- account_identity_id, platform, stable_account_ref (when permitted and verified)
- identity_state: VERIFIED | UNVERIFIED | CONFLICT | RETIRED
- verification_evidence_id, verified_at, revision, created_at, updated_at
- No credentials; display name/avatar alone is not a unique identity.

### Account — local phone/platform session
- account_id, device_id, platform, account_identity_id (nullable until verified)
- display_name, handle_or_profile_ref, avatar_cache_key
- observed_login_state: LOGGED_IN | LOGGED_OUT | CHALLENGE | UNKNOWN
- identity_confidence, last_verified_at, verification_evidence_id
- note, created_at, updated_at
- No password, OTP, cookie or raw session token columns.

### Target
- target_id, account_id, platform, target_kind
- stable_target_ref (only when observed/authorized)
- display_name, avatar_cache_key
- capability_state, permission_evidence, last_verified_at
- Target kinds are platform-specific; do not assume every app has Page/Group semantics.

### MediaSource
- source_id, root_path, recursive_enabled, watcher_enabled
- last_scan_at, scan_state, scan_error, include_extensions, exclude_patterns

### MediaAsset
- media_id, source_id, relative_path, filename, extension, media_kind
- size_bytes, duration_ms, width, height, sha256, modified_at
- probe_state, file_stability_state, duplicate_of_media_id
- asset_state: AVAILABLE | ASSIGNED | USED | MISSING | CHANGED | INVALID

### ContentCampaign
- campaign_id, name, platform, device_id, account_id, target_id, workflow_id
- created_at, state, reuse_policy, default_timezone

### ContentRow
- content_row_id, campaign_id, content_kind: SINGLE | ALBUM, album_group_key (required for ALBUM)
- caption, hashtags
- comment_count (0..10), comment_1..comment_10
- comment_delay_minutes, comment_interval_minutes
- scheduled_local_date/time, timezone, resolved_utc
- import_batch_id, validation_state, note
- scheduling_source: PROFILE | ROW_OVERRIDE; complete row date/time/timezone required for ROW_OVERRIDE (C-19)

### ContentRowAsset — ordered payload (C-20); proposed schema
- content_row_id, media_id, asset_order (stable explicit order), expected_sha256
- Unique (content_row_id, asset_order); ordered membership is authoritative, including one member for SINGLE.
- Album membership is explicit by album/group key, never inferred from folders. Conflicting group metadata, duplicate order or missing assets fails preview.
- One logical content row creates one post per target; validate and verify exact ordered count against the certified composer profile, not one post per asset.

### StagedMediaCopy — tool ownership and cleanup (C-21); proposed schema
- staged_copy_id, job_id, device_id, media_id, source_sha256, tool_owned_destination_ref
- manifest_id, owner_run_id, transferred_at, verified_hash, staging_state, cleanup_state, cleanup_evidence_ref
- Delete only manifest-proven tool-owned copies after verified completion. Original user files, unrelated device files and UNKNOWN recovery data are never routine-cleanup targets.

### BackupRecord — validated local copies (C-13/C-14/C-22); proposed schema
- backup_id, snapshot_at, schema_version, effect_ledger_watermark, encrypted_file_ref, checksum
- secret_key_ref, created_reason: DAILY | MANUAL | PRE_MIGRATION, validation_state, validated_at
- protected_until_upgrade_accepted, restore_quarantine_state, retention_state
- Store references rather than secret keys in SQLite. Same-machine and cross-machine key recovery remain separately tested.

### ScheduleProfile
- schedule_id, device_id, account_id, target_id, workflow_id
- start_date (every-N-day anchor), end_date (inclusive, optional), max_occurrences (planned count, optional; first reached bound wins)
- recurrence_kind: EVERY_N_DAYS | WEEKDAYS | ONCE
- repeat_every_days, weekdays
- posts_per_active_day, time_slots[]
- timezone_iana (default Asia/Ho_Chi_Minh, selectable), gap_warning_minutes (30 under DEC-020; not an enforced minimum)
- dst_gap_policy: SKIP_WITH_NOTIFICATION; dst_overlap_policy: EARLIER_ONCE (C-11)
- timezone_database_version, time_policy_revision, auto_shift_window_start/end (same local day only; otherwise REVIEW)
- collision_policy: QUEUE | AUTO_SHIFT | BLOCK (accepted QUEUE default, AUTO_SHIFT explicit; device input always serialized)
- missed_unadmitted_policy: REVIEW; already-admitted queued jobs retain QUEUE (C-10/C-19)
- enabled, revision, created_at, updated_at

### Job
- job_id, schedule_id, content_row_id, device_id, account_id, account_identity_id, target_id, workflow_id
- schedule_revision, occurrence_key, workflow_version, certification_profile_revision
- device_generation, lease_owner_id, lease_fencing_token
- planned_at_utc, timezone_snapshot, priority, queue_position
- state, attempt_count, next_attempt_at, admitted_at, scheduling_source, row_override_snapshot
- planned_occurrence_ordinal, skip_reason, original_planned_at_utc, shifted_at_utc
- idempotency_key, created_at, started_at, completed_at
- result_code, result_summary

### JobStep
- step_id, job_id, step_key, sequence, state
- started_at, ended_at, retry_count, timeout_ms
- input_snapshot_ref, output_snapshot_ref, error_code, error_detail

### EffectIntent
- effect_id, job_id, effect_kind, target_ref, intent_hash
- effect_business_key (unique logical publish/comment action), content_snapshot_hash, account_identity_id
- prepared_at, provider_or_ui_evidence_ref, verified_at
- outcome: VERIFIED | FAILED | UNKNOWN | NOT_DISPATCHED
- reconciliation_state; one or more explicit EffectAttempt records (see §2.3)

### JobEvidence
- evidence_id, job_id, step_id, evidence_kind
- screenshot_ref, ui_tree_ref, ocr_result_ref, text_summary
- captured_at, confidence, device_generation, display_profile_revision
- account_identity_id, target_id, app_package, app_version, locale, evidence_hash, retention_class

### MetricSnapshot
- snapshot_id, account_id, target_id, post_ref
- metric_key, metric_value (nullable; never substitute zero for missing), metric_unit
- availability: AVAILABLE | UNAVAILABLE | UNKNOWN | ERROR; unavailable_reason
- source_kind, source_ref, period_start, period_end
- collected_at, freshness_state, confidence, notes
- metric_definition_version, source_capability_revision, identity_evidence_id

### AuditEvent
- event_id, actor, device_id, account_id, job_id
- event_type, timestamp, redacted_payload, correlation_id


### 2.1 Identity and device-generation contract — PROPOSED

- C-12 accepts verified global identity and one local-PC publishing coordinator. The proposed table linkage below implements that accepted behavior.
- `Account` remains the per-device/platform session used by existing selectors; `AccountIdentity` represents the same real account across those sessions. Target authorization remains attached to the verified session/target relationship, not inferred from a merged label.
- Uniqueness is platform plus a verified stable account reference when available. Never merge accounts by display name, avatar, list position or OCR text alone. If no reliable cross-device identity is provable, publishing stays BLOCKED rather than inventing an identity that bypasses the global lease.
- Account linking/unlinking requires evidence, an audited revision and no unresolved in-flight effect; queued jobs revalidate identity and target instead of inheriting an earlier assumption.
- `Device.generation` increases on control-identity/transport-owner replacement, reconnect or Device Host restart. Actor commands, captures, UI trees and vision results carry this epoch. Reject stale work before dispatch; do not replay a stale input against a new transport. A change to dimensions/rotation also invalidates coordinate-bound evidence via `display_profile_revision`.
- ADB serial and transport generation are not durable physical identity by themselves. A fingerprint conflict is a blocked device state requiring verified resolution, not an automatic merge.
- Trace: P2-03/05/07/12, P4-05, P5-06/07/08/13. Tests: same account on two devices, identical display names for different accounts, identity swap, reconnect with changed transport, and rotation between capture and tap.

### 2.2 Publish lease and fencing — PROPOSED

Logical `PublishLease` fields: `account_identity_id` (unique active lease key), `owner_run_id`, `job_id`, `device_id`, `device_generation`, monotonic `fencing_token`, `acquired_at`, `heartbeat_at`, `expires_at`, `state`, `revision`. Persist lease history/audit; do not delete the last fencing counter on release.

- A single authoritative local scheduler acquires device ownership and the global-account publish lease transactionally, in deterministic order. This is an across-managed-devices guarantee, not a cross-PC distributed lock.
- C-04 accepts whole-workflow ownership. Device ownership covers the entire workflow, not just individual serialized commands. Conflicting manual wall inputs, Home/Back, APK mutation or proxy changes must refuse or request explicit safe pause/takeover. Drain and reconcile all possible effects before ownership transfer, then invalidate UI/account captures and revalidate identity. Noninterfering read-only diagnostics need an explicit tested path.
- Acquire/renew/release uses owner/token/revision compare-and-swap. Before every protected dispatch, Device Host validates the current owner, token, device generation and exact account/target. A stale owner cannot enqueue another action after takeover.
- Fencing is a host-side guard: Android/the social platform does not honor our token, and an already-sent tap cannot be recalled. Lease expiration alone therefore does **not** prove the old publish stopped or failed. Quiesce/drain the old actor, resolve in-flight effects, then allow a new publishing owner. If that cannot be proved, keep the account blocked for reconciliation.
- On crash/restart, expire ownership only as part of recovery; reconcile dispatch-possible effects before releasing the publishing quarantine. Clock jumps/long sleep must not cause parallel takeover; monotonic in-process deadlines and persisted recovery state are required. Exact heartbeat/TTL values await approved tests.
- Trace: P5-13, P7-06/07, P8-05/10, P11-05. Tests: simultaneous acquisition grants one owner; stale-token dispatch and renew fail; expiry during a delayed publish never permits a second dispatch; crash/restart and clock change do not duplicate work.

### 2.3 Effect durability and reconciliation — PROPOSED

`EffectIntent` is the logical action; `EffectAttempt` is a specific possible dispatch. Proposed attempt fields: `attempt_id`, `effect_id`, `attempt_number`, `owner_run_id`, `fencing_token`, `device_generation`, `dispatch_state`, `dispatch_started_at`, `dispatch_ack_at`, `outcome`, `error_code`, `evidence_refs`. Proposed dispatch states: `PREPARED`, `DISPATCH_POSSIBLE`, `VERIFIED`, `FAILED_KNOWN`, `UNKNOWN`. A dispatch acknowledgement is not a publish-success acknowledgement.

`ReconciliationRecord` fields: `reconciliation_id`, `effect_id`, `attempt_id`, `state`, `started_at`, `completed_at`, `permitted_readback_method`, `account_identity_id`, `target_ref`, `evidence_refs`, `finding`, `resolution_actor`, `resolution_reason`, `next_action`. Findings distinguish `EFFECT_CONFIRMED`, `NO_EFFECT_PROVEN`, `STILL_UNKNOWN`, and `BLOCKED_READBACK`.

1. Commit immutable intent, content/identity snapshot and unique business key before any external action. Publish key includes logical job occurrence and target; comment key additionally includes the comment slot/ordinal. Same text alone is not a valid idempotency key.
2. Commit the attempt's `DISPATCH_POSSIBLE` transition before issuing input. A crash between that commit and actual send is conservatively uncertain. Do not claim exactly-once delivery across local DB and external UI.
3. Dispatch only under current device ownership, verified identity and lease fencing. Persist outcome and verification evidence atomically where applicable. Evidence files use finalized content-addressed references/checksums; a missing/incomplete file cannot support VERIFIED.
4. Known pre-dispatch failure may remain NOT_DISPATCHED. Timeout, disconnect, cancellation or crash after dispatch became possible yields UNKNOWN/NEEDS_RECONCILIATION unless evidence establishes a known result. Do not release a quarantined publish merely because the process died.
5. Permitted read-back verifies exact account/target/content/post or comment. A toast or absence from one unrefreshed screen does not prove success or failure. A still-unknown result stays blocked; no automatic retry, alternative workflow or manual-posting fallback is silently substituted.
6. Only verified effect completion, or sufficient evidence of no effect plus approved retry policy, can resolve the quarantine. Retain original attempts and append the reconciliation/new attempt, never reset UNKNOWN to NOT_DISPATCHED to force retry.
7. Restoring any older backup starts in dispatch quarantine: all scheduled dispatch stays disabled until restored work is reconciled with effects that may have happened after the snapshot. A restored NOT_DISPATCHED record is not proof no external action occurred; missing post-backup history cannot be recreated by blindly replaying jobs. Release quarantine only through a reviewed recovery procedure with permitted evidence.
8. Intent/attempt/reconciliation records survive app restart and backup. Retention follows accepted C-13/C-14/C-21/C-22 and §2.7; it must not orphan UNKNOWN evidence/idempotency information. Migrations/restore do not resume old active owners automatically.

Trace: P8-03/04/05/06/07/09/10/11, P11-04/05. Failure tests must kill the process before intent commit, after intent commit, after dispatch-possible commit, after tap, and after verification before persistence; each case proves no blind redispatch and reports any irreducibly unknown result.

### 2.4 Stream configuration and telemetry — PROPOSED schema

Logical records (behavior follows accepted DEC-019 and [hardware controls](12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md)):

- `HostCapabilityProfile`: profile ID, non-sensitive host fingerprint, Windows/driver/backend/app versions, device/codec profiles, tested bounds/concurrency, benchmark evidence/date and invalidation state.
- `StreamSettings`: settings ID, GLOBAL_DEFAULT or DEVICE scope, device ID when relevant, inherit/override flag, mode, requested FPS/resolution/bitrate/quality, stream enabled, concurrency budget, emergency-throttle opt-in (Manual default false), auto-restore choice, revision and updated-at. Restoration occurs only when the user explicitly enables auto-restore; emergency-throttle consent alone does not enable it. Numerical recovery windows remain benchmark gates.
- `StreamApplyOperation`: operation/correlation ID, requested settings revision, captured target device IDs, expected revisions, capability profile, per-device APPLIED/REJECTED/PENDING result and reason. Saving global defaults is distinct from applying to a current device scope.
- `StreamObservation`: device/stream ID, device generation, settings revision, effective encoder FPS/resolution/bitrate when known, delivered FPS, dropped frames/backlog, state, sample time, measurement availability, throttle reason and originating policy event. Persisted observations become stale on restart until re-observed; do not restore them as actual live truth.
- `StreamRecommendation`: profile/settings revision, measured load window, proposed limits, confidence, reason, generated-at and expiry. Recommendations never overwrite requested settings.
- `HostMetricSample`: metric key, nullable value, unit, source/adapter, availability, sampled-at, freshness deadline, optional confidence/error. Aggregates retain source/window; absent data is not 0 or automatically GREEN.
- `ResourcePolicyEvent`: event ID, mode/opt-in revision, old/new effective settings, unchanged requested revision, affected devices, reason/sample refs, applied-at, recovery/restore reference and result.

Precedence/validation is defined in hardware §3.6. Tests cover restart, stale samples, concurrent settings revisions, failed batch member, override inheritance and lower actual FPS without a requested-setting rewrite. Trace: Phase 3 stream/resource tasks and P11-06.

### 2.5 Metric validity — PROPOSED

- `metric_value` is numeric only when a source actually yielded a valid value; unavailable/error/unknown collection stores null with a reason. A retained last-known value may be shown only with its original collection time and STALE label, not as a fresh sample.
- Compare snapshots only when subject, metric definition/unit, source semantics and period are compatible. Two valid samples are the minimum for growth; a zero denominator produces undefined/not-applicable percentage, not infinity or fabricated growth.
- A metric capability record states supported subject/account/target/post scope, permitted source and availability reason. Traffic-source/recommendation metrics require explicit source evidence; likes are not a substitute.
- Trace: P10-01/02/03/04/08. Tests include genuine zero versus missing, provider errors, stale last-known value, changing metric definitions and one-snapshot baselines.

### 2.6 Schedule time and occurrence contract — PROPOSED

- DEC-020 accepts a **30-minute warning only**. A gap below 30 minutes does not reject/save-shift a schedule by itself. Device mutual exclusion still queues overlapping foreground work; account publishing leases still serialize global identity. Neither lock automatically rewrites planned time.
- Recurrence generation consumes an immutable schedule revision, local date/time slots, IANA timezone, timezone database version and explicit policies. Snapshot the resolved UTC instant and local representation on each job; host timezone changes do not silently reinterpret it.
- Accepted C-11: default IANA timezone `Asia/Ho_Chi_Minh`, selectable per schedule. A nonexistent DST local time is `SKIP_WITH_NOTIFICATION`; an overlap resolves to the earlier instant exactly once. Preserve the skipped occurrence/audit rather than shifting it or manufacturing a replacement. These choices are accepted separately from DEC-020.
- Accepted C-10/C-18/C-19: collision defaults to `QUEUE`; `AUTO_SHIFT` is explicit and records original/new planned time, reason and policy revision. A shift must stay inside the configured window and the same local day; otherwise `REVIEW`. `BLOCK` rejects actual conflicts where explicitly chosen, never the advisory 30-minute gap alone. Admitted queued jobs stay QUEUE; downtime-missed, unadmitted occurrences go to REVIEW without automatic catch-up.
- Stable occurrence identity includes schedule ID, logical local date, stable slot ID and approved overlap choice. Generation under the same revision is idempotent. Edits reconcile pending occurrences by stable occurrence key; do not create a second publish merely by incrementing revision. Running/completed/uncertain occurrences are not silently replaced.
- Accepted C-19: a row containing complete valid date/time/timezone explicitly overrides the profile and is labeled ROW_OVERRIDE. With no override, use the profile. Partial/invalid override is an error. Materialize only one content occurrence, never both the row override and profile job.
- Accepted C-18: every-N-day recurrence anchors to start date in the schedule timezone. End date is inclusive; max occurrences counts planned occurrences, not successes. If both bounds exist, stop at the first reached. Retries/skips keep their occurrence identity and never create unlimited replacements. Validate positive recurrence/slot counts and a complete slot list before saving.
- Calendar edits use expected revision and one transaction for changed schedule/pending jobs/audit. Keep prior values for undo only while safe; undo cannot undo an external publish. Rejected/stale edits return authoritative state for UI rollback.
- Tests: spring gap skips/notifies, autumn overlap earlier once, invalid zone, host clock/timezone change, rule update, repeat generation, slot reorder, revisions after execution, admitted queue versus missed REVIEW, start-date anchoring, inclusive end/max-count boundary, same-day shift overflow, complete/partial row override, no replacement after skip/retry and warning-only 29/30/31-minute gaps. Trace: P7-01/02/03/04/05/09/10/11/12.

### 2.7 Retention and backup contract — accepted behavior; proposed mechanics

- C-13/C-21: capture/UI/OCR diagnostics expire after 7 days and technical logs after 30 days. Job history and derived metric/history records remain until explicit user cleanup. UNKNOWN recovery evidence and required reconciliation/idempotency information are held beyond routine expiry.
- C-21: staged-copy cleanup requires a manifest proving tool ownership and verified completion; never delete originals or unrelated phone files. UNKNOWN blocks cleanup of necessary staged/recovery data. Record cleanup result/failure without rewriting the job outcome.
- C-13/C-22: encrypt local backups to a user-chosen folder, no automatic cloud upload. Keep seven validated ordinary copies; create a backup at most once daily while running and allow manual backup. A separate verified pre-migration copy is required and protected until upgrade acceptance.
- Never replace/delete a known-good copy after a failed backup; display failure. Migration cannot proceed without its verified prerequisite backup. Validation covers snapshot integrity, schema/ledger consistency and restore ability; file existence alone is insufficient.
- C-14: restoring an older snapshot starts in dispatch quarantine (§2.3). Test key recovery/secret rebinding for same-machine and transfer-to-other-machine restore independently; do not promise untested key portability.
- Trace: P1-05/06, P8-05/10, P11-03/04/05/07. Tests distinguish 7-day diagnostics from retained UNKNOWN evidence/history, reject unowned-file deletion, preserve known-good backups on failure, protect pre-migration copy, and block replay from an old snapshot.

## 3. Workflow state machine

Every fixed workflow is a versioned state machine, not a generic visual node graph.

```text
DRAFT
  -> VALIDATING
  -> PREFLIGHT
  -> READY
  -> RUNNING
       -> STEP_VERIFY
       -> next step
       -> SUCCESS_VERIFIED
       -> FAILED_KNOWN
       -> BLOCKED_PRECONDITION
       -> UNKNOWN_EXTERNAL_EFFECT
       -> NEEDS_RECONCILIATION
       -> CANCELLED
```

Rules:
- A job must pass device, app, account, target, media, permission/policy and schedule preflight.
- Every action is followed by a state check.
- The next action is not issued while the prior action is unresolved.
- A post/comment effect intent and dispatch-attempt transition are persisted before the UI action; use the durability/reconciliation protocol in §2.3. Cancellation cannot turn a possible external effect into NOT_DISPATCHED.
- A success toast alone is not sufficient evidence. Verify post/comment presence and exact target where the permitted app UI exposes it.
- If the screen changes unexpectedly, stop and capture evidence.
- Retry only a known-safe step. Never blindly retry a publish/comment when the first attempt may have succeeded.

## 4. Fixed Facebook workflows

These are workflow definitions, not a claim that each is permitted or technically certified. C-02 selects owned/administered Page photo/album/video/Reels for the pilot, Story separately certified, and Profile/Group/reactions/shares off. Ownership is not sufficient platform permission.

### FB-PAGE-VIDEO
1. Resolve exact device/account/Page.
2. Verify logged-in account and selected Page.
3. Verify the Page is an authorized target and the requested workflow is enabled.
4. Validate video format, duration, size and orientation.
5. Stage/select the correct media.
6. Fill caption and hashtags.
7. Execute publish only if the platform-policy gate is passed.
8. Verify the created post on the same Page.
9. Enqueue optional comments only after verified post.
10. Verify each comment and store evidence.

### FB-PAGE-PHOTO
Same preflight and identity checks; use explicit album/group key and ordered ContentRowAsset membership (C-20), never folder inference. One post per target; validate certified count/dimensions/order and exact mapping before input, and verify all expected images in that order before success.

### FB-PAGE-REELS
Separate workflow from feed video because composer UI, aspect ratio, duration and publishing result may differ. Verify the result is a Reel, not merely a feed video.

### FB-PAGE-STORY
Separate workflow with its own media constraints, audience settings and expiry behavior. Disabled until the UI and policy feasibility spike passes.

### FB-PROFILE-VIDEO / PHOTO / REELS
Off in the accepted C-02 pilot. Must not inherit Page certification; later scope acceptance and separate compliant, stable technical certification are required.

### FB-GROUP-VIDEO / PHOTO
Off in the accepted C-02 pilot. Later scope acceptance requires exact Group identity, permission and separate technical certification. Do not scrape group lists or bypass platform restrictions.

### FB-COMMENT-OWN-CONTENT
- Scope is restricted to content owned/administered by the configured account/target.
- Comment text must be content-relevant, non-duplicative and within configured limits.
- No mass comment generation or repeated template spam.
- Each comment is a separate journaled side effect.
- Disabled if platform policy or UI behavior does not permit the automation.

### FB-REACTION / SHARE
Not part of the first automatic release. No bulk fake engagement. Each action requires separate policy and technical approval; unsupported actions remain disabled.

## 5. Interaction ledger semantics

The internal ledger records only what Fonesi-Auto has verified or the user has explicitly imported as trusted history. It does not claim to know every historical Facebook reaction/comment.

For each post/action:
- Proposed global key = account_identity_id + canonical target reference + post_ref + action_kind (plus comment ordinal where repeated authorized comments are distinct). A per-device account_id is retained for evidence but must not bypass dedupe across devices.
- state = NOT_SEEN | ELIGIBLE | QUEUED | ATTEMPTED | VERIFIED_DONE | FAILED_KNOWN | UNKNOWN
- UNKNOWN is not treated as NOT_DONE.
- A target count means count of eligible, verified post references, not count of arbitrary URLs typed into a box.
- "Get latest N posts" requires a permitted source and a reliable ordering/pagination method. Without that, the workflow is BLOCKED; do not invent older post URLs.

## 6. Excel content template

Recommended columns:
- media_relative_path
- media_type
- album_group_key (explicit for albums; never inferred from folder)
- asset_order (required unique order within album)
- caption
- hashtags
- comment_count
- comment_1 ... comment_10
- comment_delay_minutes
- comment_interval_minutes
- schedule_date
- schedule_time
- timezone
- target_ref or target_group_key
- workflow_id
- reuse_allowed
- note

Import rules:
- Match media by normalized relative path + optional SHA-256, not row order.
- Duplicate basename in different folders is not ambiguous when relative path is supplied.
- Unknown/missing media references are row errors.
- Album rows sharing an explicit group key form one ordered logical post per target; conflicting caption/schedule/target metadata or duplicate/missing order fails preview (C-20).
- Complete valid row date/time/timezone overrides the profile; absent override inherits; partial/invalid override errors. Preview/export preserves the override label and never creates both jobs (C-19).
- Empty comment slots are ignored.
- comment_count must match the non-empty comment slots; import preview reports mismatch.
- Import never silently overwrites existing campaigns; user chooses merge/replace/new campaign.

### 6.1 Media path and import transaction contract — PROPOSED

- Normalize separators and dot segments against a selected `MediaSource` root; resolve the actual filesystem path and ensure containment before reading and again before staging. Reject traversal, absolute/UNC path injection, alternate data streams, unsupported URI schemes and reparse-point/symlink escapes from imported relative paths. A user-selected network root is a separate validated source, not blanket permission for arbitrary UNC paths.
- Follow the selected filesystem's case behavior; preserve original spelling/Unicode. Detect ambiguous normalized paths/case collisions rather than guessing which file is intended. Stable sort has a documented path/name tie-breaker.
- Probe content type and permitted format, dimensions, duration, file size and stability; extensions alone are not evidence. Snapshot size/mtime and SHA-256 after a bounded stability check; revalidate before staging. If bytes change, invalidate the prior content validation and require a new preview, not silent replacement.
- Define approved file/row/archive-expansion/processing-time limits in Phase 6. Reject malformed spreadsheets, encrypted/unsupported files, macros and formula/external-link execution; imports read data only. Export captions/comments as safe literal spreadsheet text to prevent formula injection while preserving Unicode.
- Stage an `ImportBatch` with source file hash, schema version, mapping, normalized row keys, preview snapshot/revision and row errors. Commit only the reviewed valid rows (partial commit, if offered, requires explicit selection); validation failure does not partially overwrite a campaign. Conflict with a changed campaign/file invalidates the preview and requests revalidation.
- Merge/replace/new is an explicit transaction with audit and rollback before scheduling external work. Repeating the same committed batch must not duplicate content/jobs; later intentional re-import remains a distinct reviewed operation. Referenced media deletion is restricted/soft-marked while queued/uncertain jobs need it.
- TXT comment import (P6-12) uses the same path/hash matching, UTF-8/BOM handling and preview/error rules; never guess from basename when ambiguous. Delimiters/multi-comment mapping must be specified in the Phase 6 plan and cannot exceed 0–10 non-empty comment slots.
- Tests: `../`/absolute/UNC injection, symlink escape, same basename in two folders, Unicode/case collisions, file modified during scan/before staging, duplicate import, stale preview, macro/formula cells and malformed archives. Trace: P6-02/03/04/05/06/11/12/14, P11-07.


## 7. Remaining schema implementation review

- Store time slots as normalized child rows or JSON; recommendation: child rows for queryability and ordering.
- How to model one media item distributed to multiple targets: one content row with target assignments, or one generated job per target. Recommendation: one campaign row plus a separate ContentTargetAssignment table.
- Enforce no reuse by default and explicit campaign-level permission in the finalized relation/constraints; preserve one logical album post per target (C-20).
- Finalize distinct subject keys for account, target and post metrics while retaining provenance and C-15 unavailable-not-zero behavior.

- Review detailed `AccountIdentity` relation, lease/fencing/reconciliation durability and indexes (§§2.1–2.3); C-04/C-12 already accept ownership/global identity and the single-local-coordinator scope.
- Review stream configuration revisions/telemetry persistence and measured recovery windows (§2.4); Manual emergency OFF/opt-in is accepted and restore requires its separate explicit enablement.
- Review occurrence uniqueness/storage, timezone-library behavior and revision reconciliation against accepted C-10/C-11/C-18/C-19/DEC-020 (§2.6); DST/overdue defaults and row precedence are settled, not open preferences.
- Pin schema constraints, indexes and safe migration/restore mechanics/tests in the relevant Phase plan; C-13/C-14/C-21/C-22 retention/backup behavior is settled (§2.7). Do not treat this logical draft as final DDL.

## Change History

- 2026-10-30 — 0.2-draft: added proposed global identity, device generation, lease/fencing, effect reconciliation, stream/metric and media/time contracts with test traces. Applied accepted DEC-019/DEC-020 product semantics; all other implementation choices remain subject to ADR-0004 and Phase approval. No migrations or runtime tests were executed.

- 2026-10-30 — 0.3-draft: synchronized C-01–C-22; added explicit ordered album assets and staging/backup manifests, applied accepted recurrence/DST/row override and retention/backup semantics, preserved whole-workflow ownership and old-snapshot quarantine. Earlier pending product-choice wording in 0.2 history is superseded by docs16; DDL/mechanics/tests remain unapproved/unexecuted.
