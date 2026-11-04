# P3-07 — bounded display-only fit, selected-grid and visual focus

**SOURCE ENTRY ADOPTED — 2026-11-02 07:44 UTC.** Independent review CLEAR binds exact pre-adoption SHA256 `bc48d2ecbd76baf9bd47e060f545a3126de6994f601e0beebcabc462a0979d9b`. The coordinator adopts this bounded original-scope implementation under standing all-phase/software-first engineering permission and Amendment02, on `phase-03` at local `b687dda` after the audited paired-build closure. No test, build, native window, stream, device or input execution is claimed by this design adoption.

## 1. Original scope and independent software entry

[Canonical Phase 3](PHASE-03-screen-wall-resources.md) P3-07 requires fit-to-panel, selected/all modes, double-click focus, correct identity through resize/mode changes, and disconnect/repeated-focus recovery without moving input to an unintended phone. The fixed [subdeliverable ledger](P3-IMPLEMENTATION-SUBDELIVERABLES-v1.md) cells A–D remain the reporting units; drafting this document does not complete any cell.

[Amendment 02](SOFTWARE-FIRST-HARDWARE-DEFERRED-AMENDMENT-02.md) permits this independent software slice despite unmet P3-06 phone-scroll routing, unavailable real decoder/frame queue, and deferred predecessor/hardware acceptance. Reuse the existing [P3-05 whole-tile display zoom](P3-DISPLAY-ONLY-ZOOM-SOURCE-PROPOSAL.md), not a new monitor framework. No real frame, measured Android dimensions, pointer transform, stream configuration, settings persistence, phone command or physical validation is introduced. All production tiles continue to say that no stream is available. Source/VM checks and eventual same-viewport visual evidence remain distinct; this draft claims neither task nor phase acceptance.

## 2. Reference and actual source boundary

The V9 reference `ui-reference/Fonesi-Auto-V9-UI-Reference.html` implements `selectedMonitorPhones()` from `monitorSet`, and `monitorVisiblePhones()` displays that selected collection in `all`, or one focus row in `one`. `focusMonitor` saves the original width once; leaving focus restores it. Its demo automatic fallback to the first phone is **not** production target authority and must not be copied.

At source entry, `ui-shell.tsx` used main ACTIVE as its focused display key, filtered even focused rows through selected IDs, and changed `view` before an ACTIVE request was confirmed. Fit maximized a single width; ResizeObserver merely clamped that width. There was no prior-view record, and `UiDevice` omitted Fleet generation. These were the finite source seams corrected by this implementation, without changing the Fleet selection protocol or its confirmed ownership.

## 3. Grid/filter meaning and visual versus operational identity

- Grid / existing `all` means **all current main-confirmed monitor-selected rows**, in the existing snapshot order. It never means silently selecting all discovered phones. Keep the existing picker, explicit Select all and Clear selection requests; add no filter toolbar or implicit selection mutation. Clarify existing title/accessibility text to say selected-phone grid.
- Empty selection gives the honest empty grid. A selected row can remain visible as an unavailable/status tile; grid visibility itself grants no operation. Lost IDs are not replaced with another row.
- Visual focus is an independent local exact `{deviceId, generation}` tuple. Generation is copied read-only from the actual Fleet projection into `UiDevice`; it is not synthesized from serial, index, time or a renderer counter. Labelled synthetic fixtures supply their own explicit generation. Generation is a safe integer >=0, excluding negative zero, copied unchanged under actual Fleet semantics. Invalid/missing generation cannot enter focus; resolve exactly one matching ID/generation row, never first-match ambiguity.
- Focus admission requires a READY current snapshot, the exact current row in `DEVICE` state and a valid generation. This is display eligibility, not VERIFIED identity or input permission. An explicit existing page phone selector may focus a current eligible row outside the selected set; it must not add that row to selection. Its focused tile is visible independently of the grid filter.
- Preserve the existing explicit single-click ACTIVE request through `onSelection`; only confirmed props determine ACTIVE. A browser double-click can include preceding single clicks, so this feature does **not** promise that double-click produces zero selection requests. The double-click handler itself only toggles visual focus and must not add another ACTIVE request or any device command.
- Existing page phone selectors retain their explicit ACTIVE-request semantics, but their local visual-focus transition does not wait for or presume confirmation. Denied/delayed ACTIVE never retargets the viewed phone, changes its tuple, or licenses its controls. No newly selected or focused row is silently promoted to ACTIVE.
- The existing single-view toolbar button focuses the current eligible, main-confirmed ACTIVE tuple only; without one it is disabled/no-op, not a first-row fallback. Grid button exits focus. A page selector's empty choice keeps its existing explicit ACTIVE-clear request and exits visual focus; restoration does not undo that request.
- Clearly distinguish **viewed phone** from **main-confirmed operational ACTIVE phone** in the existing monitor status/footer/accessible labels. ACTIVE border/badge/footer derives only from confirmed selection props. A local viewed marker must never reuse the ACTIVE meaning. Existing actual input controls still derive their target solely from the main ACTIVE policy, not from visual focus.

## 4. One local focus/restoration record

On the first eligible transition from grid to focus, capture one original local display record: grid mode plus current tile width and sizing mode (`manual` or `fit`). This is bounded one-record state, not a stack or device history. Selected IDs and ACTIVE are not stored for restoration.

An ordinary focus request for the already-focused exact tuple is idempotent. Only explicit double-click of the same exact focused tuple exits to that record. Focusing B while A is focused changes only the viewed tuple, keeps the original record, and does not overwrite it with A's focused width. Repeated focus/exit cannot grow state. Entering focus uses focused fit sizing by default; manual zoom while focused is allowed but does not overwrite the pre-focus record.

Exit restores original display sizing: manual width re-clamped to the **current** viewport; fit mode recomputed for the current grid viewport. It restores neither old selected IDs nor historical ACTIVE, and does not send IPC. Scroll position is not captured/restored in this slice; no hidden historical target is brought back through a scroll side effect. Settings-provided tile baseline changes while focused update only the saved manual restoration width when the saved mode was manual; saved fit remains fit and is recomputed on exit. The current focused manual/fit presentation remains unchanged except current viewport clamps, so the existing unconditional tileWidth prop effect must be replaced rather than silently erasing focus sizing. In grid, baseline changes retain existing behavior. No preference write is generated.

Render-time eligibility must resolve the exact tuple against the latest READY/DEVICE snapshot, not wait for effect cleanup: a same-ID replacement must never briefly render through an old focus. Focus ends without replacement when the exact row disappears, becomes non-DEVICE (including OFFLINE, UNAUTHORIZED, DISCONNECTED, UNKNOWN or CONFLICT), changes generation, or the snapshot ceases to be READY. Reusing the same ID with a new generation never preserves focus. Loss restores the local pre-focus display record, not any target authority. A change to selected IDs alone does not end a still-current focused tuple; the eventual grid uses the newly confirmed selected set. An ACTIVE change alone does not change visual focus. No automatic reconnect, refresh, selection, focus fallback or stream start follows loss.

## 5. Fit geometry and manual zoom

Use the existing owned `wall-surface` client dimensions, current 12px padding on each side of `.dot-grid`, 2px grid gap, and fixed unavailable whole-tile canvas **150 × 325**. These are display pixels for current placeholder chrome, not phone/stream resolution. Reuse P3-05's final integer width clamp: 70–520, also bounded by `tileZoomLimit(currentViewportWidth)`.

Grid fit follows the reference's up-to-four-column rule (not a device-count or capacity claim):

```
innerWidth = max(0, clientWidth - 24)
columns = min(4, max(1, floor(innerWidth / 120)))
rawWidth = floor((innerWidth - (columns - 1) * 2) / columns)
width = clampTileZoom(rawWidth, clientWidth)
```

Keep existing auto-fill layout for actual row count and no fabricated empty phone tiles. Empty grid can retain a calculated width but renders no phone. Fit does not promise every selected row fits vertically; grid scroll remains available.

Focused fit uses exactly one current tile and both dimensions:

```
innerHeight = max(0, clientHeight - 24)
rawWidth = floor(min(innerWidth, innerHeight * 150 / 325))
width = clampTileZoom(rawWidth, clientWidth)
```

Use the actual surface height, not viewport/window height or Android metadata. The minimum70 remains even when the panel is too small; truthful overflow/scroll is preferable to violating the existing bound. Nonfinite/nonpositive or not-yet-measured dimensions do not produce NaN/Infinity or invent a measurement: retain the last bounded width until a positive measurement arrives. Existing width clamp remains effective on valid width changes even when height is not yet available.

Fit button selects persistent local `fit` sizing. ResizeObserver/dock/window resize recomputes fit for the current grid/focus mode. Manual minus/plus/range/accepted Ctrl+wheel switches to `manual`; subsequent resize only clamps manual width. Unmodified wheel retains existing wall scroll behavior, not phone scroll. Fit/zoom never changes persisted tile preference, capture size, FPS, bitrate, resolution or Fleet selection. One helper may centralize this pure geometry and bounded view transition logic; no state-management framework is needed.

## 6. Interaction guards and lifetime

Preserve existing local READY/inert gates and P3-05 focus/hidden-document/editable-target/overlay protections. Visual focus and Fit do not operate behind a modal, open monitor picker or performance popover, or from stale/unmounted handlers; overlay interactions must not leak through to a tile. Existing ACTIVE requests retain their own main-selection pending/currentness guards separately; selection being pending does not make a local focus tuple into confirmed ACTIVE.

Do not intercept text controls, navigation keys or input shortcuts as phone operations. Tile accessible button semantics remain, and viewing a phone does not steal keyboard focus into an Android surface. No new global double-click/keyboard listener is needed. Every captured event and observer callback rechecks the latest local lifetime and snapshot before changing display state; stale handlers cannot reintroduce an old tuple. Remove/ignore old ResizeObserver/listener callbacks on unmount/ref replacement; do not replay a stale focus after remount. Reset one local focus record on actual component lifetime loss.

## 7. Expected bounded files and evidence

Likely implementation: `desktop/src/ui/ui-shell.tsx`, existing `ui/tile-zoom.ts` or one small pure helper if needed, `ui/ui-model.ts`, the renderer's read-only Fleet-to-UI row projection, narrow CSS only if existing footer/geometry needs it, and directly affected UI/renderer/helper fixtures. Coordinator owns any exact graph/test-inventory/demo closure updates. No main/preload/IPC, Fleet service, database, native host, decoder or device actor changes are required. Preserve unrelated code and existing source maps/caps.

Required causal source tests before software claims:

1. Reference grid formula at several widths, focus width/height formula, all bounds/nonfinite/zero/tiny geometry, resize after Fit versus after manual zoom, unchanged fixed tile aspect/chrome.
2. Grid selected-only/empty behavior and explicit Select all/Clear; outside-selected page focus without modifying selection; no first-row fallback.
3. Browser click-before-double-click sequence, delayed and denied ACTIVE confirmation: visual tuple stays exact while operational badge/controls follow only confirmed ACTIVE. No extra double-click selection request or device command.
4. Same-tuple toggle, A→B repeated focus preserving one original grid width/mode, manual focused zoom, exit with changed viewport and baseline preference; no restoration of ACTIVE/selected IDs.
5. Row loss/non-DEVICE/READY loss/generation change, including render before effect cleanup and stale captured handler invocation, restores display without replacement; selected-set and ACTIVE-only changes do not incorrectly retarget focus.
6. Overlay/editable/focus-loss and unmount/ref-replacement guards; accepted local fit/focus/zoom generates zero input/settings/stream calls. Existing explicit single-click Fleet selection calls remain separately expected, not counted as zero.
7. Main-projection generation copying and source/synthetic attribution; unavailable text stays visible, no fake Android image or successful-stream badge. Light/dark and existing six-tab/monitor structure remain intact.

Actual UI screenshots at comparable viewports, when run, must be labelled rendered-software evidence with unavailable tiles. Source VM geometry tests alone are not screenshots or hardware evidence. P3-06, real decoder/stream behavior, physical two-phone input targeting and all canonical acceptance gaps remain explicitly open. No fixed-ledger cell is checked merely because this design is adopted.
