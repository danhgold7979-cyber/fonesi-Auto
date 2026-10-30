# V9 UI Baseline Mapping

**Revision:** 0.3-draft · **Date:** 2026-10-30
**Rule:** This document maps [accepted C-01–C-22](16_ACCEPTED_PRODUCT_DECISIONS.md#1-accepted-checklist) to the approved V9 layout. It is not permission to redesign the interface or treat untested service behavior as implemented.

**Canonical full HTML reference:** [ui-reference/Fonesi-Auto-V9-UI-Reference.html](../ui-reference/Fonesi-Auto-V9-UI-Reference.html) · [Open instructions](../ui-reference/README.md). This file contains the complete V9 HTML, CSS and JavaScript. Download it and open in Chrome/Edge; GitHub's source viewer does not execute HTML.

## 1. Global layout

- Keep the V9 desktop shell, compact navigation and right-side device monitor.
- Keep Dark/Light toggle in the top bar.
- Keep device monitor dock on the right, resizable by the user.
- Device list remains a dropdown/collapsible list; never render dozens of permanent phone cards in the sidebar.
- Device tiles remain tightly spaced with slight rounded corners and an index badge inside the screen.
- Ctrl + wheel zooms the whole phone tile, not the content inside the phone.
- Normal wheel inside a phone scrolls the phone's own content; outside scrolls the outer wall.
- Device record count is unbounded. Screen streaming is resource-bounded.

## 2. Navigation order

1. Tổng quan
2. Tài khoản
3. Theo dõi
4. Thiết lập & nội dung
5. Quản lý lịch đăng
6. Quy trình

Do not move or rename these tabs without approval.

## 3. Overview

Top quick-action row:
- Scan devices / reconnect.
- App inventory / install / uninstall.
- Proxy management.
- Device information and diagnostics.
- Batch actions with explicit selected-device scope.

Every modal reports per-device progress and result. A batch-level success is not enough if one phone failed. Under C-04, APK mutations/proxy changes cannot interleave with an owned workflow: show the ownership conflict and refuse or request explicit safe pause/takeover, never silently queue a mutation between workflow steps. HTTP/HTTPS device-level proxy is the initial scope; SOCKS5/per-app remains deferred (C-09). Wireless enablement remains disabled with a reason until its dedicated tests pass (C-17).

## 4. Accounts

- Phone selector controls the right-side monitor: selecting Phone X in Accounts focuses Phone X in the right monitor.
- Show platform avatar, account avatar and target avatar where available.
- Keep account and target distinct.
- Unknown identity must be visibly marked and cannot be selected for a runnable job.
- Do not fabricate avatar/name/identity values in production.
- Initial authorization/login belongs to the user; expired login/security challenge blocks and reports without bypass or silent substitution. Show verified global account identity separately from its per-device session (C-03/C-12).

## 5. Tracking

- Select phone, then social network, then account/target.
- Show only metrics actually available from a permitted source.
- Progress bar thresholds: red <=5%, amber 6–49%, green >=50%, but each bar must label what the percentage means (media inventory, license, proxy, etc.).
- Show metric collection time, freshness, provenance and availability. Unknown/unavailable is not zero; a stale last-known value retains its old timestamp. Growth requires comparable valid snapshots and cannot infer viral/recommendation status from likes.
- Double-click a device row may open the corresponding content setup or schedule view, with the device preselected.
- Never label a mock snapshot as a real platform metric.

## 6. Setup & content

Required selection order:
1. Phone
2. Social network
3. Account
4. Target
5. Fixed workflow
6. Media folder/source
7. Content table and schedule

Media table:
- Maximum 20 visible rows before scrolling.
- Recursive scan toggle for subfolders.
- Caption defaults to media filename without extension.
- Hashtag column.
- Comment count selector 0–10; show exactly that many comment columns.
- Comment delay and interval.
- Schedule fields after hashtag/comment fields as in V9.
- Excel/TXT import preview, explicit path/hash matching, template/current-content export and a visible per-row error report; no silent positional or ambiguous-basename matching.
- Row-level validation errors must remain visible.
- Show explicit album/group key and ordered assets in existing content/preview details, producing one logical post per target; never infer album grouping from a folder (C-20).
- Label a complete valid row date/time/timezone as overriding the profile; absent override inherits and partial/invalid override errors. Preview must not show duplicate row/profile jobs (C-19).
- Failed Vietnamese/English/emoji round-trip blocks the row/job with a reason (C-08); no silently corrupted preview or publish text.

## 7. Calendar

- Select phone/account/target/platform filters.
- Horizontal time axis; day/week/month view as represented in V9.
- Drag/drop moves a job; time updates immediately in the UI.
- Backend checks collision and revision. If invalid, revert with a clear reason and authoritative state; do not silently persist an invalid schedule. Pending optimistic changes must not be shown as saved before backend acknowledgement.
- Accepted DEC-020: a gap below 30 minutes shows a warning, not a save/run rejection or automatic shift by itself. Device foreground conflicts still queue; global-account publish ownership remains serialized.
- Preview shows selectable timezone (default Asia/Ho_Chi_Minh), resolved UTC time, DST skipped-occurrence notification and earlier-overlap-once result (C-11).
- QUEUE is default. AUTO_SHIFT is explicit, visible/audited, confined to its configured window and same local day; otherwise REVIEW (C-10/C-18).
- Show start-date recurrence anchor, inclusive end and planned-occurrence limit. Skips/retries do not create replacements; admitted queue jobs remain QUEUE while downtime-missed occurrences show REVIEW (C-18/C-19).
- Color coding by platform and account/target must be stable and distinguishable.
- Queue jobs are visible separately from their planned time.

## 8. Workflow tree

- One root entry per platform.
- Facebook branches: ĐĂNG and TƯƠNG TÁC.
- Facebook posting entries: Page video, Page photo/album, Reels, Story, Profile flows, Group video/photo.
- Interaction entries: comment-by-link and reaction/share entries.
- Every workflow shows capability state and reason if blocked/deferred. C-01/C-02 limit the initial pilot to Facebook owned/administered Page photo/album/video/Reels under per-action gates; Story is separately certified, Profile/Group/reactions/shares and other networks stay off. Presence in V9 is never execution permission.
- The tree is a catalog of fixed workflows, not a node editor.

## 9. Right-side phone monitor

- Show all connected/selected devices according to monitor mode.
- Double-click a phone to focus it.
- Mouse/keyboard input is routed only to the active device actor. C-04 additionally enforces whole-workflow ownership: manual tap/Home/Back conflicts are refused or require explicit safe pause/takeover after drain/reconciliation. Revalidate identity/captures before resume; UNKNOWN is not cleared by takeover. Read-only diagnostics need a tested noninterfering path.
- Multi-select is for group-scoped actions that explicitly support batching.
- Provide quick actions (Home, Back, screenshot, clear selection, app shortcuts) using icons.
- ADB reconnect and stream reconnect statuses are separate.

## 9.1 Stream / Performance controls in the right dock

Add controls inside the existing right-side device monitor header as a compact popover/expandable panel. Preserve the V9 shell and dock geometry.

Controls:
- Auto / Manual mode.
- Stream scope: focused / selected / all.
- Capability-bounded FPS slider with numeric requested value and delivered FPS; candidate 1–60 / 5–60 ranges are not universal guarantees.
- Resolution/scale slider or supported discrete choices (candidate Auto/360p/480p/720p/1080p/Source only where supported).
- Bitrate/quality slider or Low / Balanced / High preset plus Advanced; show bitrate when available. Eco / Balanced / Smooth / Custom profiles are derived from approved benchmarks, not fixed promises.
- Maximum concurrent stream slider.
- Apply and Use recommended settings.
- Global defaults, visibly marked per-device overrides and reset-to-global-default.
- Emergency-throttle toggle is OFF by default in Manual mode and explicit opt-in (accepted DEC-019); auto-restore is a separate explicit enablement, never inferred from emergency-throttle consent; recovery windows are benchmark-derived.

Live panel:
- CPU utilization; RAM used/available; supported GPU utilization/memory; disk free space; network throughput; connected devices/active streams; delivered FPS/backlog; Vision Worker queue depth. Show sample timestamp/source and stale/unavailable state.
- GREEN / AMBER / RED / UNKNOWN state.
- Requested vs effective vs recommended settings.
- Clear reason, affected scope and recommended action for every warning. Text/icons supplement colors; color alone is insufficient.

Interaction rules:
- Changing tile zoom does not change stream resolution.
- Ctrl+wheel continues to resize the whole device tile.
- Normal wheel inside a phone continues to scroll the Android screen.
- Applying to current/selected/all-connected devices shows the captured target scope and per-device results. Saving global defaults is a distinct explicit action; see the proposed inheritance/revision contract in [hardware §3.6](12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md#36-apply-scope-precedence-and-revisions--proposed-implementation-contract).
- If a metric is unavailable, display Not available; never substitute 0.
- Keep the performance popover compact and avoid obscuring phone screens.
- Controls show pending/requested/effective values. Safe Apply needs no extra confirmation; predicted overload within a tested hard envelope requires explicit warning/Apply confirmation under the hardware contract. Values beyond hard bounds are rejected with a reason, not silently clamped/saved.
- Auto mode may lower preview quality under sustained pressure and recover gradually. Manual mode may do so only after DEC-019 opt-in; RED explains whether a policy change occurred or only degraded delivery was observed.
- Resource controls affect preview streams, never Android display resolution or workflow execution.
- Unavailable settings show disabled controls with reasons; backend failure, stale settings revision, empty selection and partial batch failure have visible per-device states.

## 10. UI-to-service mapping

| UI area | Service/API boundary |
|---|---|
| Overview quick actions | DeviceFleetService, AppInventoryService, ProxyService |
| Accounts | AccountRegistryService, TargetRegistryService, DeviceFleetService |
| Tracking | TrackingService, MetricSnapshot repository |
| Setup & content | MediaLibraryService, ContentImportExportService, WorkflowCatalog |
| Calendar | SchedulerService, QueueCoordinator |
| Workflow tree | WorkflowCatalogService, CapabilityRegistry |
| Right phone monitor | ScreenStreamService, DeviceActorService, HostResourceMonitor, ResourcePolicyEngine |
| Logs/report | AuditLogService, JobEvidence repository |

## 11. UI fidelity acceptance

- Compare V9 reference and implemented UI at the same viewport sizes.
- Verify all navigation labels/order and page layouts.
- Verify right-side panel resize, dropdown and monitor focus.
- Verify Ctrl+wheel and normal wheel behavior.
- Verify Dark/Light persistence.
- Verify 20-row table viewport and scroll.
- Verify account/avatar dropdowns.
- Verify no permanent full-height list of dozens of phones in the side panel.
- No visual redesign without explicit approval.


## 12. Resource & Stream Control acceptance mapping

Section 9.1 is the single control/interaction specification for this same panel; the former second panel description is consolidated there, not a second UI surface. The panel remains attached to the existing right monitor/settings entry: no permanent widening or change to the V9 three-column shell.

- Verify all §9.1 controls in both themes and approved viewport/DPI sizes, including keyboard focus, labels and empty/error/loading states; no screenshot is a substitute for behavior tests.
- Verify requested/effective/recommended values, supported bounds and sensor availability against fixture/service responses, then real host/device observations.
- Verify Manual default OFF, opt-in/out, warning-only RED with safeguard disabled, visible throttling when enabled, and independent restore behavior (DEC-019; hardware §9.1).
- Verify sub-30-minute scheduling warning without rejection/implicit shift, while a real foreground-device conflict remains queued (DEC-020).
- Verify selecting a phone, scrolling/zooming, changing scope, failing one batch member and reopening the panel preserve active target and explicit override state.
- Verify owned-workflow manual/APK/proxy conflicts and safe takeover, explicit album order/one-post grouping, row override labels and DST/missed-occurrence states against C-04/C-10/C-11/C-18/C-19/C-20.
- Existing settings/recovery surfaces must show backup failure, retention categories and old-backup dispatch quarantine without a new V9 shell/navigation design (C-13/C-14/C-21/C-22).
- Trace to P1-08, Phase 3 UI/resource tasks, P6-07/11/12, P7-04/10 and P10-02/05; approved Phase plans provide exact cases and evidence paths.

## Change History

- 2026-10-30 — 0.2-draft: consolidated duplicate resource-panel requirements without removing controls; aligned DEC-019/DEC-020, capability-derived ranges, import/schedule/metric states and acceptance traces. Canonical V9 HTML was not edited; proposed schema/scope details still require ADR/Phase approval.

- 2026-10-30 — 0.3-draft: mapped accepted ownership/provisioning, scoped capabilities/proxy/USB, album/row override and exact calendar semantics from C-01–C-22; retained V9 geometry and backend/evidence gates. Canonical HTML unchanged.
