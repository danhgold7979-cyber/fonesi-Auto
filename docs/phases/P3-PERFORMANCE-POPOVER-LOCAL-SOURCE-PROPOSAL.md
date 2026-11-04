# P3-12 — local performance-panel interaction and containment

**ADOPTED SOURCE ENTRY — 2026-11-02 09:29 UTC.** Independent design CLEAR binds pre-adoption SHA256 `262c374f751726b499592a82b5ddc495079c4d3a30d660b4bbe37d4b3e1b2ab0`. The coordinator adopts this finite local UiShell/CSS implementation under standing all-phase/software-first engineering authority and Amendment02, on verified `phase-03` public `21f7503b`, local `70cd898`. No tests, build, window, telemetry or device effects were performed for design review; source implementation and attributable validation follow separately. Retained-pair binary permission was separate and pending at this source-entry checkpoint; the later 09:37 approval does not change this UI scope.

## 1. Canonical scope and deferred dependencies

[Phase 3 P3-12](PHASE-03-screen-wall-resources.md) calls for a compact right-dock panel with open/close/resize/theme, keyboard-focus and wheel isolation. [Hardware-resource specification §2](../12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md) expressly permits an attached expandable panel in the existing monitor header. The fixed [100-cell ledger](P3-IMPLEMENTATION-SUBDELIVERABLES-v1.md) maps this work to P3-12.A–D; design, source and checked-cell evidence must remain distinct.

[Amendment02](SOFTWARE-FIRST-HARDWARE-DEFERRED-AMENDMENT-02.md) permits this independent local interaction slice despite unmet P3-11 measured telemetry and deferred physical/visual acceptance. Existing P3-07 display behavior remains intact. No telemetry collector, capability inference, resource classification, stream profile, backend setting, device command, main/preload/IPC API or decoder is added. No hardware or task acceptance follows source-only tests.

## 2. Inspected source-entry baseline

At source entry, `desktop/src/ui/ui-shell.tsx` already had `performance` boolean state, `wall-performance` trigger, an attached `.performance-panel` section, explicit close button and `aria-expanded`. The shell is not inert while it is open. `Performance` renders disabled controls and truthful UNKNOWN/no-sample values. Existing UI coverage only establishes basic open/close and absence of a global modal.

`desktop/assets/v9.css` gives the panel padding10px, bottom border, `max-height:45vh`, `overflow:auto`, `flex:none`, two-column forms/statistics and inherited theme. The monitor is a column flex container with header, controls, zoom bar, surface (minimum130px) and footer. P3-07 suppresses wall zoom while performance is open, but no panel-specific keyboard lifecycle or boundary-scroll containment is implemented.

The V9 HTML's `openStreamPerformance()` uses a global demo dialog with fabricated measurements and effective values. That demonstration is not a production-data or modal-policy authority. Preserve the canonical attached-panel option already implemented; do not copy demo numbers, controls that pretend to apply settings, or a full-screen redesign.

## 3. Exact nonmodal interaction policy

- Reuse the existing explicit trigger and close button. Add a stable panel ID and `aria-controls` on the trigger; keep `aria-expanded` accurate. The labelled section is nonmodal: no `aria-modal`, global shell inertness or focus trap.
- A successful explicit open starts one local open-session token and focuses its actual close button after the current panel mounts. Require the same current session/component lifetime, visible and focused document, no current modal, and focus still at the opener or current panel at that point; a user who moved elsewhere is never refocused merely because the session token matches. Never refocus on unrelated render/theme/resize or reuse a previously closed session.
- Normal Tab/Shift+Tab can leave the panel; disabled backend controls stay disabled. No global Tab listener or loop is added. Outside focus may leave the panel open. No outside-click listener is needed.
- Escape closes only when its event originates in the currently mounted panel or descendants. It prevents that handled Escape's default and propagation; Escape elsewhere does not close this panel or hijack another control's policy.
- Explicit close/Escape may return focus to the still-connected trigger **only** when the same live open session is closing and focus is still in that panel or on its trigger. If the user already moved elsewhere, do not steal focus back. The trigger's toggle-close likewise leaves legitimate trigger focus in place.
- Rapid close/open allocates a new local session. A stale close handler, deferred initial-focus callback, observer or cleanup from the previous session cannot close/reopen or focus the new session. Unmount invalidates the token and performs no focus restoration.
- Opening the picker closes performance without focus restoration; opening performance closes the picker without running picker Escape-style restoration. Neither transition changes selected rows, ACTIVE or local visual focus. Existing modal opening or readiness loss closes performance without restoration. Returning to READY or closing that modal does not reopen it automatically.
- Panel local interaction is independent of unrelated preference pending/reconciliation. Its availability follows actual local readiness/lifetime/modal rules, not settings IPC completion. Retain the existing owned-session safety checks for any other control; do not relax them to make this panel accessible.

## 4. Scroll and event isolation

Attach wheel containment to the actual panel boundary while it is mounted. Stop propagation for wheel events originating inside it, including Ctrl+wheel, without calling preventDefault: native internal scrolling remains native and no zoom/phone command is synthesized. Do not attach a window/document wheel interceptor.

Apply `overscroll-behavior:contain` to the panel's own scrolling region so scrolling at its boundaries does not chain into the wall/page. This is distinct from JavaScript event propagation and from P3-07's existing guard. Ctrl+wheel must not reach the wall's zoom handler or any device route; any browser-native behavior is not represented as a successful product zoom or device action. Neither wheel handling nor panel opening changes tile sizing mode, stored preference, stream dimensions or selection.

Retain current P3-07 block while the panel is open. Closing restores eligibility for a **new** wall gesture only; no queued gesture is replayed. Keep contained events and listener cleanup tied to the exact current panel/session, with no duplicate handlers after reopen.

## 5. Bounded dock geometry and theme

Keep the panel inline at its current position after the monitor header. Do not overlay phone controls, move six tabs, alter monitor width, create a second application sidebar or change existing responsive breakpoints.

Replace the unqualified45vh allowance with a cap derived from the actual owned dock and its current fixed siblings:

```
remaining = wall.clientHeight
          - measured header/controls/zoom-bar/footer outer heights
          - existing wall-surface minimum 130px
panelCap = min(45% of current viewport height, remaining)
```

The existing wall header, controls and zoom bar must retain intrinsic uncompressed outer heights with narrow `flex-shrink:0` rules (footer already does); opening must not create apparent room by shrinking those siblings. Account for the panel's own border/padding using border-box sizing; sibling outer heights include their actual margins/borders rather than assuming constant text heights. Use existing DOM geometry only, not screen/device dimensions. Observe the owned dock and fixed sibling sizes, plus ordinary window resize; recompute after theme/font/layout changes through actual measured sizes. One local effect/observer is sufficient, not a new layout framework.

The panel header/close control must stay visible while its content scrolls (a sticky header within the same panel scrolling region is sufficient). Its minimum usable height is the measured close-header outer height plus panel vertical padding/border, not a guessed device metric. If positive measurements show less available space than that minimum, refuse a new open or close the current panel, without altering monitor controls or shrinking the wall below its existing minimum. A geometry-triggered close may restore trigger focus only under the same live-session/inside-focus rule above; it never restores historical selection or ACTIVE. It does not automatically reopen when space returns. For initial measurement, mount the actual panel and header at the real current dock width in a noninteractive, non-layout-consuming measurement state, not `display:none` and not a guessed header height. Keep it hidden from accessibility/focus while measuring; the existing trigger remains accessible and cancels that pending open. `aria-expanded` reflects actual visible presentation, not the pending measurement request. A current valid measurement may present only that same still-pending explicit open session. Unmeasured/nonfinite or insufficient geometry terminates that request (or closes an existing presentation), invalidates its session and retains no stale visible cap; later geometry does not auto-reopen it. Existing small-screen minimum dock heights and page scrolling remain unchanged.

Use current CSS variables for light/dark surfaces, text and borders. Do not add sensor-status colors implying measured load. Opening/closing can legitimately change available wall-surface height; P3-07's existing fit ResizeObserver responds to that real geometry, while manual zoom retains its existing clamp semantics. This is display behavior, not a resource-profile adjustment.

## 6. Truthful status and safe recovery

Preserve every existing unknown sensor value: CPU/RAM/GPU/disk/network/backlog/Vision/resource level remain `—` and `UNKNOWN · không có mẫu quan sát`. Requested/effective/recommended remain UNAVAILABLE. Keep all backend selectors, inputs and toggles disabled with existing capability-unavailable text; neither emergency reduction nor auto-restore gains consent or effects.

Existing Apply/Use recommended affordances continue their current explicit unavailable explanation only. If that explanation opens the existing modal, close the performance panel under §3; do not fabricate an applied/recommended value. Hiding, reopening, resize, theme change and keyboard navigation leave admitted profiles and all device/stream state unchanged. This slice adds no sample timestamp, fake successful telemetry, fake imagery or user profile persistence.

## 7. Closed files and meaningful validation

Expected product scope: `desktop/src/ui/ui-shell.tsx` and narrow `desktop/assets/v9.css` changes only. Reuse current hooks/refs and controls; no new module or generic wrapper. Affected tests remain `desktop/tests/ui-shell.test.mjs` and existing CSS/source guard fixtures as necessary. Coordinator refreshes only affected exact build/module/CSS fingerprints and documentation/inventory if required; no scanner/cap relaxation, main/native/workflow or dependency change.

Before any software status claim, author causal tests for:

1. Explicit open/close, accurate labelled ID/expanded relationship, first close-button focus, normal Tab exit and Escape only from panel descendants; no modal/inert/trap.
2. Same-session conditional focus return; outside focus preserved; stale handlers, rapid close/open, pending mount focus, unmount and readiness loss cannot steal focus or reopen.
3. Picker/performance exclusivity and modal transition with no erroneous picker/opener restoration; unrelated settings pending does not block local panel controls.
4. Native panel scrolling plus boundary containment, including Ctrl+wheel and propagation assertions; no wall zoom/input/settings/profile calls and no listener leak after close.
5. Actual synthetic DOM dimensions at wide/narrow/short sizes, changing sibling heights, minimum close-header fit and insufficient-space refusal/closure; existing monitor controls and130px surface remain accounted for. Fit/manual wall behavior remains separately tested, not guessed.
6. Light/dark structure and unknown/disabled values unchanged through repeated interaction; unavailable explanations remain truthful and safe.

A VM/source geometry check is not a rendered viewport screenshot. Comparable rendered-software screenshots, if separately run, must show unavailable telemetry and state their real viewport/environment. P3-11 measurements, actual backend profile behavior, physical operation and original full visual/phase acceptance remain open. Do not update ledger cells merely for adopting this proposal; record only subsequently observed evidence against complete cell definitions.
