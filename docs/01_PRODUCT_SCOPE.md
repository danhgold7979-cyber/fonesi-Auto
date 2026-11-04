# Product Scope and Requirements

**Revision:** 0.3-draft · **Date:** 2026-10-30 · **Baseline UI:** V9 · **Status:** Draft for review

**Approval boundary:** The [accepted product decisions C-01–C-22](16_ACCEPTED_PRODUCT_DECISIONS.md#1-accepted-checklist) are current; numerical benchmarks, detailed schemas and Phase implementation still require their evidence/approval gates. This document does not authorize production coding or real-account publishing. Historical proposals are reconciled in [the decision register](08_DECISIONS_AND_OPEN_ITEMS.md).

## 1. Operating model

- Primary operator uses a Windows desktop application.
- USB ADB acceptance comes first. Wireless Debugging remains disabled until dedicated authenticated pairing/reconnect tests pass; never expose an unauthenticated ADB port (C-17).
- Each phone may have multiple installed social apps and multiple logged-in accounts.
- Each account may expose one or more targets (Page/Profile/Group/Channel/etc.) depending on app and platform capability.
- The system runs fixed workflows. Operators configure data and schedules; they do not design workflows as arbitrary node graphs.
- Jobs run unattended only when the workflow has passed capability, identity, safety and certification checks. The user performs initial device authorization/login; expired login, 2FA/checkpoint or security challenge stops and reports, without bypass or silent manual fallback (C-03).
- Complete device, screen-wall, account, content, scheduler/queue and reporting foundations; Facebook is first and other networks are explicitly unsupported in the initial scope (C-01).
- Validate the current Windows host first and publish only tested support. Use at least two physical devices for isolation plus two AVD profiles for repeatability, initially one AVD running; emulator evidence cannot replace physical-device acceptance (C-07).

## 2. Core product areas

### 2.1 Overview
- Host status, connected/disconnected devices, queued/running/failed jobs.
- Quick device tools: scan/reconnect, APK/app manager, proxy manager, batch operations.
- Selection scope: one device, selected devices or all devices.
- Every batch action reports result per device.

### 2.2 Device fleet and screen wall
- Device registry has no artificial maximum record count.
- Discover USB and distinguish authenticated Wireless Debugging/TCP transports; non-USB enablement follows the separate C-17 acceptance gate.
- Display connection type, serial/identity, Android version, model, locale, battery, storage and last-seen.
- V9 right-side device panel is a collapsible dropdown/list, not a permanent long list.
- Main screen wall supports single-device focus and all/selected devices.
- Ctrl+wheel zooms the whole device tile; normal wheel inside a phone scrolls phone content; outside scrolls the wall.
- Phone tiles have slight rounded corners, compact spacing, index badge inside the screen and fit-to-panel.
- Selection and active control target are distinct. Multi-select does not mean every action is broadcast; action scope must be explicit.
- Add a Stream / Performance panel in the existing right-side device monitor; do not redesign the V9 shell.
- Provide Auto and Manual modes. In Manual mode the user can adjust FPS, resolution/scale, bitrate/quality and maximum concurrent streams.
- Support global defaults plus per-device overrides and batch changes for explicitly selected devices.
- Show live CPU, RAM and supported GPU metrics with timestamps; show unsupported/stale sensors as UNKNOWN/Not available, never as zero.
- Show requested, effective and recommended stream settings separately.
- Display GREEN / AMBER / RED / UNKNOWN resource state with evidence-based thresholds, hysteresis and actionable recommendations.
- In Auto mode, adapt background streams before focused streams. **Accepted DEC-019 (2026-10-30):** Manual emergency throttling is OFF by default; only explicit user opt-in permits temporary policy-driven preview reduction/pause under critical load. Requested settings remain visible and unchanged by effective-setting changes. Without opt-in, warn and reject unsafe new increases, but do not silently throttle existing Manual previews.
- Stream throttling must never cancel, race or corrupt ADB workflow execution.
- Manual taps/Home/Back, APK mutations and proxy changes cannot interleave with an owned workflow. Refuse conflicts or require explicit safe pause/takeover after drain/reconciliation; revalidate UI/identity before resume. UNKNOWN effects remain quarantined (C-04).

### 2.3 Accounts and targets
- Accounts are presented by phone and platform, including the observed session on that phone. The same real account on two phones must share a verified global publishing identity for lease enforcement; a local phone/account row alone is not a global identity. The proposed identity/session schema is in [the data contract](03_DATA_AND_WORKFLOWS.md#21-identity-and-device-generation-contract--proposed).
- Show avatar, display name, platform, stable internal ID, observed profile name/handle where available, session state, last verified and note.
- Targets are separate records: Profile, Page, Group, Channel, Shop, OA or platform-specific target.
- Account switcher and target picker show avatar plus name.
- If exact account/target identity cannot be verified, the job is blocked.
- Never store passwords, OTPs, session cookies or raw access tokens in ordinary database fields.

### 2.4 Fixed workflow catalog
Initial Facebook catalog. Accepted pilot scope is owned/administered Pages for photo, explicit albums, video and Reels; each action still requires policy/permission and feasibility evidence. Story is certified separately. Profile/Group/reactions/shares remain off (C-02):

**POSTING**
1. Page video + optional comments on the created Page post.
2. Page photo/album + optional comments on the created Page post.
3. Page Reels + optional comments on the created Page post.
4. Page Story (conditional on verified app flow and policy).
5. Profile video/photo/Reels (off in the accepted pilot; separate scope approval plus capability/policy certification required).
6. Group video/photo (off in the accepted pilot; separate scope approval plus capability/policy certification required).

**INTERACTION / ENGAGEMENT**
1. Comment by source Page or explicit post list (conditional; only authorized scope and non-spam content).
2. Like/Love/Share (not enabled as bulk engagement automation; each action requires separate policy and technical approval; fake/coordinated engagement is excluded).

The UI may show future workflow entries with a status badge, but it must not allow execution while status is UNVERIFIED, BLOCKED or DEFERRED.

### 2.5 Media and content
- Select a root folder and toggle recursive subfolder scanning.
- Scan common image/video formats; stable sort by relative path and filename.
- Detect file changes during scan and avoid reading files still being written.
- SHA-256 identifies duplicate files; same filename is not enough to identify a file.
- Caption defaults to filename without extension; user or Excel may override.
- Hashtags are a separate field.
- Comment count is 0–10 per logical post row (single media or explicit album); only non-empty comment slots are used.
- An album has an explicit album/group key and ordered assets and produces one post per target. Never infer an album from a folder; validate exact count/order against certified composer constraints and verify the outcome (C-20).
- Comment delay begins only after post success is verified.
- Comment interval is measured between successive verified comment attempts.
- Excel import has preview, mapping, row validation and error report; no silent positional matching.
- Export a blank template and an export of current content.
- Media reuse is disabled by default; reused assets need explicit campaign-level permission.
- Exact Vietnamese/English/emoji round-trip is required before posting; corruption blocks the job. Helper installation/permissions require separate approval (C-08).
- After verified completion, clean only tool-owned staged copies using ownership manifests. Never delete original user media or unrelated phone files; UNKNOWN retains recovery data (C-21).

### 2.6 Scheduling
- User selects Phone → Platform → Account → Target → Workflow.
- Schedule supports start date, IANA timezone, posts per active day, interval N days, end date/max occurrences and a list of local-time slots.
- Number of visible time slots equals posts-per-active-day.
- **Accepted DEC-020 (2026-10-30):** A gap below 30 minutes produces a warning only, not a hard rejection or automatic shift. Real foreground-operation conflicts on the same device still queue; global-account publishing remains serialized. Collision resolution is separate from this warning. Exact warning comparison scope must be documented in the approved scheduler plan.
- Default collision policy is QUEUE; AUTO_SHIFT is explicit and auditable. Already admitted queue jobs remain QUEUE; occurrences missed during downtime enter REVIEW, never an automatic catch-up flood (C-10/C-19).
- One device runs one foreground UI automation job at a time.
- Account-level publish lease prevents the same account publishing on two managed phones concurrently. Lease expiry or an app restart does not authorize retry of an uncertain publish; reconcile the prior effect before another publish dispatch.
- Facebook priority may be higher than other platforms, but aging prevents starvation.
- Default timezone is Asia/Ho_Chi_Minh, selectable per schedule. A nonexistent DST local time skips the occurrence with notification; an overlap selects the earlier occurrence exactly once. Snapshot timezone/rule version and show resolved time, conflicts and shifts in preview (C-11).
- Every-N-day recurrence anchors to the selected start date in the schedule timezone. End date is inclusive; maximum occurrences counts planned occurrences, not successes. If both constraints exist, stop at the first reached. Retries/skips do not generate replacement occurrences (C-18).
- AUTO_SHIFT stays within the configured window and same local day; otherwise REVIEW. Validate slot count and values before saving (C-18).
- A complete valid row date/time/timezone explicitly overrides the profile and is visibly labeled; absent override inherits, partial/invalid override errors. Never create both row and profile jobs for the same content occurrence (C-19).

### 2.7 Tracking
- Account and post metrics show provider/source, metric key, period, collected time, freshness and availability.
- Unknown/unavailable metrics are not shown as zero.
- Growth requires at least two valid snapshots; one snapshot is a baseline, not a trend.
- "Strong recommendation" or "viral" is never inferred from likes alone. It requires an explicit traffic-source metric; otherwise show "not available".
- Automated reading of Facebook content/metrics must pass platform permission/policy review.

### 2.8 App inventory and APK management
- Scan installed packages per device.
- Show exact app name, package ID, version, install source and launcher icon where extractable.
- App icon cache key includes device, package and version.
- System/critical apps are protected from batch uninstall by default.
- Install/uninstall has per-device progress, cancellation and result.
- APK source, signature, package name, version and downgrade policy are validated before install.

### 2.9 Host resource monitor and stream controls
- Provide a dedicated Resource & Stream Control panel, accessible from the device monitor and settings without changing the approved V9 layout.
- Display live host CPU usage, RAM used/available, GPU utilization and memory when supported, disk free space, network throughput, active ADB devices, active streams, stream FPS and vision-worker queue depth.
- Show a timestamp and data freshness for each metric. Unsupported GPU counters must be shown as unavailable, not as zero.
- User-adjustable stream controls: FPS, image quality/bitrate, maximum stream resolution and per-device stream enable/pause.
- Scope controls: all devices, selected devices or one device. Support a global default with per-device overrides.
- Provide Auto and Manual modes. Auto mode applies resource-aware limits; Manual mode validates requests against measured hard host/device limits and reports invalid requests without silently changing the saved request. Manual emergency changes require explicit opt-in under accepted DEC-019.
- Show estimated/observed resource impact and warn before applying a configuration predicted to overload the host.
- Use configurable warning/critical thresholds with hysteresis and a cooldown to avoid alert flicker.
- In Auto mode, critical pressure reduces preview FPS/bitrate/resolution, pauses non-focused streams, and defers nonessential vision work. In Manual mode, preview policy changes require accepted DEC-019 explicit opt-in; warn and block unsafe new work when the safeguard is not enabled. Never silently interrupt a device workflow or drop an ADB command.
- User may acknowledge a warning and choose a lower profile. The app must not allow an unsafe setting to silently destabilize the host.
- Provide recommended profiles (Eco, Balanced, Smooth, Custom); actual values are host-benchmark-derived, not hard-coded universal guarantees.

### 2.10 Proxy
- Store proxy profiles in encrypted secret storage; UI only displays masked credentials.
- Validate syntax and endpoint reachability from host.
- Device-side routing must be separately verified; a host-side "proxy alive" check does not prove Android traffic uses it.
- Initial scope is HTTP/HTTPS at device level with real Android route verification and rollback. SOCKS5/per-app routing is deferred unless separately accepted and tested; no universal routing claim (C-09).
- Assignment, health, expiry and rollback are recorded per device.

### 2.11 Retention, backup and recovery
- Capture/UI/OCR diagnostics: 7 days; technical logs: 30 days. Job history and derived metrics/history remain until explicit user cleanup. Retain unresolved UNKNOWN evidence and necessary reconciliation/idempotency records (C-13/C-21).
- Encrypted local backups use a user-chosen folder, with seven validated ordinary copies and no automatic cloud upload. Back up before data migration and at most once daily while running; manual backup is available. Keep pre-migration safety copies until upgrade acceptance; backup failure is visible and must not replace a known-good copy or permit migration without its verified backup (C-13/C-22).
- SQLite contains secret references; Windows-backed storage holds proxy secrets. Older-backup restore quarantines dispatch until post-snapshot effects are reconciled. Same-machine and cross-machine key recovery require separate tested proof, not an assumed portability promise (C-14).

## 3. Explicit exclusions
- No workflow editor/node canvas.
- No unlimited simultaneous video stream promise.
- No CAPTCHA, checkpoint, 2FA, rate-limit or anti-abuse bypass.
- No automated scraping of Facebook group lists or arbitrary user content without authorization.
- No fake engagement or coordinated bulk reactions/comments.
- No false success state when the app UI only appears to have accepted an action.

## 4. Acceptance vocabulary
- DRAFT: requirements not approved.
- UNVERIFIED: implementation exists but no device evidence.
- READY: all capability, identity, policy and test gates pass.
- BLOCKED: missing prerequisite or permission.
- DEFERRED: intentionally excluded from current release.
- FAILED: attempted and failed with known outcome.
- UNKNOWN: side effect may have occurred; reconciliation required.

## 5. Contract and acceptance trace

These are planned acceptance obligations, not test results or approval of open choices. Detailed test cases belong in [acceptance](05_ACCEPTANCE_AND_RISKS.md) and the approved [Phase plan](04_MASTER_IMPLEMENTATION_PLAN.md).

| Requirement | Contract / implementation trace | Required evidence |
|---|---|---|
| One real account across phones | Data §2.1–2.2; P5-06/07/13, P7-07 | Two local sessions resolve to one verified identity; concurrent publish acquisition permits only one owner |
| No duplicate uncertain side effects | Data §2.3; P8-05/07/10 | Crash before/after dispatch remains distinguishable where provable; uncertain outcomes cannot redispatch |
| Resource control without losing input ownership | Hardware §§3–6; Phase 3; DEC-019 | Auto/Manual overload, opt-in/out, stale telemetry and recovery traces; no wrong-device or dropped input command |
| Capability-derived FPS/quality | Hardware §§3/8; Phase 0/3 | Supported bounds and observed FPS for each certified host/device profile; no universal 60 FPS claim |
| Deterministic media/import | Data §6; P6-04/11/12 | Root escape, duplicate basename, edited file, malformed Excel/TXT and repeat import tests |
| Deterministic schedule | Data §2.6; P7-01–12; DEC-020 | DST gap/overlap, repeat generation, revisions, collisions and approved gap policy fixtures |
| Honest metrics | Data §2.5; P10-01/02/04/08 | Null unavailable values, stale samples, source mismatch and comparable-snapshot growth tests |
| Unchanged V9 | UI mapping §§1–12; P1-08 and relevant UI tasks | Same-viewport screenshots and parity checklist; canonical HTML unchanged |

## Change History

- 2026-10-30 — 0.2-draft: aligned identity, uncertainty, scheduling and resource contracts; applied user-approved DEC-019/DEC-020 and left the separate proposed collision default pending; added implementation/evidence trace. Recorded the two explicit product approvals; no approval inferred for other choices and no runtime test result claimed.

- 2026-10-30 — 0.3-draft: synchronized accepted C-01–C-22 (scope/provisioning, ownership, USB-first, proxy, scheduling/album semantics and retention/backup). Earlier 0.2 pending statements describe the prior review state, not current unresolved product choices. No runtime or Phase acceptance claimed.
