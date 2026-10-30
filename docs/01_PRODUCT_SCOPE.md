# Product Scope and Requirements

**Revision:** 0.1-draft · **Baseline UI:** V9 · **Status:** Draft for review

## 1. Operating model

- Primary operator uses a Windows desktop application.
- Android phones connect to the Windows host by USB ADB or explicitly paired Wireless Debugging.
- Each phone may have multiple installed social apps and multiple logged-in accounts.
- Each account may expose one or more targets (Page/Profile/Group/Channel/etc.) depending on app and platform capability.
- The system runs fixed workflows. Operators configure data and schedules; they do not design workflows as arbitrary node graphs.
- Jobs run unattended only when the workflow has passed capability, identity, safety and certification checks.

## 2. Core product areas

### 2.1 Overview
- Host status, connected/disconnected devices, queued/running/failed jobs.
- Quick device tools: scan/reconnect, APK/app manager, proxy manager, batch operations.
- Selection scope: one device, selected devices or all devices.
- Every batch action reports result per device.

### 2.2 Device fleet and screen wall
- Device registry has no artificial maximum record count.
- Discover USB, ADB Wireless Debugging pairing and connected TCP transports.
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
- In Auto mode, adapt background streams before focused streams. In Manual mode, respect requested settings except an explicitly enabled emergency stream-throttling safeguard.
- Stream throttling must never cancel, race or corrupt ADB workflow execution.

### 2.3 Accounts and targets
- Accounts are scoped by phone and platform.
- Show avatar, display name, platform, stable internal ID, observed profile name/handle where available, session state, last verified and note.
- Targets are separate records: Profile, Page, Group, Channel, Shop, OA or platform-specific target.
- Account switcher and target picker show avatar plus name.
- If exact account/target identity cannot be verified, the job is blocked.
- Never store passwords, OTPs, session cookies or raw access tokens in ordinary database fields.

### 2.4 Fixed workflow catalog
Initial Facebook catalog:

**POSTING**
1. Page video + optional comments on the created Page post.
2. Page photo/album + optional comments on the created Page post.
3. Page Reels + optional comments on the created Page post.
4. Page Story (conditional on verified app flow and policy).
5. Profile video/photo/Reels (disabled until capability and policy are verified).
6. Group video/photo (disabled until capability and policy are verified).

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
- Comment count is 0–10 per media row; only non-empty comment slots are used.
- Comment delay begins only after post success is verified.
- Comment interval is measured between successive verified comment attempts.
- Excel import has preview, mapping, row validation and error report; no silent positional matching.
- Export a blank template and an export of current content.
- Media reuse is disabled by default; reused assets need explicit campaign-level permission.

### 2.6 Scheduling
- User selects Phone → Platform → Account → Target → Workflow.
- Schedule supports start date, IANA timezone, posts per active day, interval N days, end date/max occurrences and a list of local-time slots.
- Number of visible time slots equals posts-per-active-day.
- Minimum gap warning is 30 minutes; collision resolution is configurable.
- Default collision policy is QUEUE; AUTO_SHIFT must be explicit and auditable.
- One device runs one foreground UI automation job at a time.
- Account-level publish lease prevents the same account being active on two phones concurrently.
- Facebook priority may be higher than other platforms, but aging prevents starvation.

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

### 2.9 Proxy
- Store proxy profiles in encrypted secret storage; UI only displays masked credentials.
- Validate syntax and endpoint reachability from host.
- Device-side routing must be separately verified; a host-side "proxy alive" check does not prove Android traffic uses it.
- Per-app proxy routing requires a chosen and tested Android mechanism; do not promise universal compatibility.
- Assignment, health, expiry and rollback are recorded per device.

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
