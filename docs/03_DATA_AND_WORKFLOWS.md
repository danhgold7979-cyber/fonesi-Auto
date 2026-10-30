# Data Model and Workflow Specifications

**Revision:** 0.1-draft  
**Status:** Proposed schema; must be reviewed before migrations are written.

## 1. Entity map

```text
Workspace
 ├─ Device 1..N
 │   ├─ DeviceTransport 1..N
 │   ├─ InstalledApp 1..N
 │   ├─ Account 0..N
 │   │   └─ Target 0..N
 │   └─ ProxyAssignment 0..1
 ├─ MediaSource 1..N
 │   └─ MediaAsset 0..N
 ├─ ContentCampaign 1..N
 │   └─ ContentRow 1..N
 ├─ ScheduleProfile 1..N
 ├─ WorkflowDefinition 1..N
 ├─ Job 0..N
 │   ├─ JobStep 1..N
 │   ├─ EffectIntent 0..N
 │   └─ JobEvidence 0..N
 └─ MetricSnapshot / AuditEvent / Notification
```

## 2. Proposed entities

### Device
- device_id (UUID)
- android_identity_hash (stable identity fingerprint; not serial alone)
- serial_display (redacted where needed)
- model, manufacturer, android_version, sdk_level, build_fingerprint, locale
- connection_state, last_seen_at, battery_percent, storage_free_bytes
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

### Account
- account_id, device_id, platform
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
- content_row_id, campaign_id, media_id
- caption, hashtags
- comment_count (0..10), comment_1..comment_10
- comment_delay_minutes, comment_interval_minutes
- scheduled_local_date/time, timezone, resolved_utc
- import_batch_id, validation_state, note

### ScheduleProfile
- schedule_id, device_id, account_id, target_id, workflow_id
- start_date, end_date or max_occurrences
- recurrence_kind: EVERY_N_DAYS | WEEKDAYS | ONCE
- repeat_every_days, weekdays
- posts_per_active_day, time_slots[]
- timezone_iana, minimum_gap_minutes (default 30)
- collision_policy: QUEUE | AUTO_SHIFT | BLOCK
- overdue_policy: QUEUE | NEXT_SLOT | SKIP | REVIEW
- enabled, revision, created_at, updated_at

### Job
- job_id, schedule_id, content_row_id, device_id, account_id, target_id, workflow_id
- planned_at_utc, timezone_snapshot, priority, queue_position
- state, attempt_count, next_attempt_at
- idempotency_key, created_at, started_at, completed_at
- result_code, result_summary

### JobStep
- step_id, job_id, step_key, sequence, state
- started_at, ended_at, retry_count, timeout_ms
- input_snapshot_ref, output_snapshot_ref, error_code, error_detail

### EffectIntent
- effect_id, job_id, effect_kind, target_ref, intent_hash
- prepared_at, dispatched_at, provider_or_ui_evidence_ref
- outcome: VERIFIED | FAILED | UNKNOWN | NOT_DISPATCHED
- reconciliation_state

### JobEvidence
- evidence_id, job_id, step_id, evidence_kind
- screenshot_ref, ui_tree_ref, ocr_result_ref, text_summary
- captured_at, confidence, device_generation

### MetricSnapshot
- snapshot_id, account_id, target_id, post_ref
- metric_key, metric_value, metric_unit
- source_kind, source_ref, period_start, period_end
- collected_at, freshness_state, confidence, notes

### AuditEvent
- event_id, actor, device_id, account_id, job_id
- event_type, timestamp, redacted_payload, correlation_id

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
- A post/comment effect intent is persisted before the UI action.
- A success toast alone is not sufficient evidence. Verify post/comment presence and exact target where the permitted app UI exposes it.
- If the screen changes unexpectedly, stop and capture evidence.
- Retry only a known-safe step. Never blindly retry a publish/comment when the first attempt may have succeeded.

## 4. Fixed Facebook workflows

These are workflow definitions, not a claim that each is permitted or technically certified.

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
Same preflight and identity checks; validate image/album count, dimensions, order and exact media mapping. Verify all expected images are present before marking success.

### FB-PAGE-REELS
Separate workflow from feed video because composer UI, aspect ratio, duration and publishing result may differ. Verify the result is a Reel, not merely a feed video.

### FB-PAGE-STORY
Separate workflow with its own media constraints, audience settings and expiry behavior. Disabled until the UI and policy feasibility spike passes.

### FB-PROFILE-VIDEO / PHOTO / REELS
Capability-gated. Must not inherit Page workflow certification. Disabled until a compliant, stable and verified method exists.

### FB-GROUP-VIDEO / PHOTO
Capability-gated. Requires exact Group identity and permission. Do not scrape group lists or bypass platform restrictions. Disabled until a compliant, stable and verified method exists.

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
- key = account_id + target_id + post_ref + action_kind
- state = NOT_SEEN | ELIGIBLE | QUEUED | ATTEMPTED | VERIFIED_DONE | FAILED_KNOWN | UNKNOWN
- UNKNOWN is not treated as NOT_DONE.
- A target count means count of eligible, verified post references, not count of arbitrary URLs typed into a box.
- "Get latest N posts" requires a permitted source and a reliable ordering/pagination method. Without that, the workflow is BLOCKED; do not invent older post URLs.

## 6. Excel content template

Recommended columns:
- media_relative_path
- media_type
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
- Empty comment slots are ignored.
- comment_count must match the non-empty comment slots; import preview reports mismatch.
- Import never silently overwrites existing campaigns; user chooses merge/replace/new campaign.

## 7. Open schema decisions

- Store time slots as normalized child rows or JSON; recommendation: child rows for queryability and ordering.
- How to model one media item distributed to multiple targets: one content row with target assignments, or one generated job per target. Recommendation: one campaign row plus a separate ContentTargetAssignment table.
- Whether one content row can be reused across multiple workflows. Recommendation: no by default; explicit campaign-level reuse policy.
- Whether metrics are per account, target or post. Recommendation: all three with distinct metric keys.
