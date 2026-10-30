# V9 UI Baseline Mapping

**Revision:** 0.1-draft  
**Rule:** This document maps product behavior to the approved V9 layout. It is not permission to redesign the interface.

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

Every modal reports per-device progress and result. A batch-level success is not enough if one phone failed.

## 4. Accounts

- Phone selector controls the right-side monitor: selecting Phone X in Accounts focuses Phone X in the right monitor.
- Show platform avatar, account avatar and target avatar where available.
- Keep account and target distinct.
- Unknown identity must be visibly marked and cannot be selected for a runnable job.
- Do not fabricate avatar/name/identity values in production.

## 5. Tracking

- Select phone, then social network, then account/target.
- Show only metrics actually available from a permitted source.
- Progress bar thresholds: red <=5%, amber 6–49%, green >=50%, but each bar must label what the percentage means (media inventory, license, proxy, etc.).
- Show metric collection time, freshness and provenance.
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
- Excel import preview and template export.
- Row-level validation errors must remain visible.

## 7. Calendar

- Select phone/account/target/platform filters.
- Horizontal time axis; day/week/month view as represented in V9.
- Drag/drop moves a job; time updates immediately in the UI.
- Backend checks collision and revision. If invalid, revert with a clear reason; do not silently persist an invalid schedule.
- Color coding by platform and account/target must be stable and distinguishable.
- Queue jobs are visible separately from their planned time.

## 8. Workflow tree

- One root entry per platform.
- Facebook branches: ĐĂNG and TƯƠNG TÁC.
- Facebook posting entries: Page video, Page photo/album, Reels, Story, Profile flows, Group video/photo.
- Interaction entries: comment-by-link and reaction/share entries.
- Every workflow shows capability state and reason if blocked/deferred.
- The tree is a catalog of fixed workflows, not a node editor.

## 9. Right-side phone monitor

- Show all connected/selected devices according to monitor mode.
- Double-click a phone to focus it.
- Mouse/keyboard input is routed only to the active device actor.
- Multi-select is for group-scoped actions that explicitly support batching.
- Provide quick actions (Home, Back, screenshot, clear selection, app shortcuts) using icons.
- ADB reconnect and stream reconnect statuses are separate.

## 9.1 Stream / Performance controls in the right dock

Add controls inside the existing right-side device monitor header as a compact popover/expandable panel. Preserve the V9 shell and dock geometry.

Controls:
- Auto / Manual mode.
- Stream scope: focused / selected / all.
- FPS slider.
- Resolution/scale slider or supported discrete choices.
- Bitrate/quality slider or Low / Balanced / High preset plus Advanced.
- Maximum concurrent stream slider.
- Apply and Use recommended settings.
- Global defaults and per-device overrides.
- Optional emergency throttle and auto-restore toggles.

Live panel:
- CPU, RAM, GPU (when supported), disk and stream statistics with sample timestamp.
- GREEN / AMBER / RED / UNKNOWN state.
- Requested vs effective vs recommended settings.
- Clear reason and recommended action for every warning.

Interaction rules:
- Changing tile zoom does not change stream resolution.
- Ctrl+wheel continues to resize the whole device tile.
- Normal wheel inside a phone continues to scroll the Android screen.
- A global change applies only to the selected scope.
- If a metric is unavailable, display Not available; never substitute 0.
- Keep the performance popover compact and avoid obscuring phone screens.

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
