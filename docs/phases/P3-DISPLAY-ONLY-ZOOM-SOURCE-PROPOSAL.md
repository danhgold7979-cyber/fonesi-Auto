# P3-05 — bounded display-only whole-tile zoom

**SOURCE ENTRY ADOPTED — 2026-11-02 02:54 UTC.** Independent review CLEAR bound pre-adoption SHA256 `7e8d4e92febd55541d67782c3b820983f60fafdfef93d2e543252ead986e8b2a`; coordinator adopted the bounded source batch under standing root direction. No native execution authorized.

Implementation precisions: local zoom does not inherit pending/reconcile settings IPC gating; actual unready/inert/focus/overlay rules remain. The owned `.wall-screen` button and descendants are eligible wheel targets. Base canvas `--screenW` stays150px to avoid double scaling. Baseline, fit, range, wheel and viewport/dock shrink use one current viewport clamp; dock writes retain the stored tile preference.

Original design context: Coordinator requested this finite design under the user's software-first direction; independent review and exact source-entry adoption have now preceded implementation. Current local `phase-03` HEAD is `040ea49e7c8617feaaca80528f0ae03971c816c0` (parent identifies public phase entry `e7e9a046`). Only affected source tests are authorized; no native operation or device action is authorized.

## Canonical mapping and parallel entry

[Phase3](PHASE-03-screen-wall-resources.md) P3-05 requires bounded Ctrl+wheel **whole tile including chrome**, preserved aspect and unchanged stream resolution, with rapid-wheel/minimum/maximum/focus-loss coverage. Its original predecessor P3-04 (real frame queue/decoder) and earlier phase/device acceptance remain open. [Amendment02](SOFTWARE-FIRST-HARDWARE-DEFERRED-AMENDMENT-02.md) permits this independent software/display subset on the single phase development branch; it does not accept P3-04/P3-05, waive native visual/physical evidence, merge main or claim full phase completion. The implementation must explicitly record this nonsequential development exception rather than relabel the canonical dependency as met.

This subset requires no frame provider: existing honest empty/unavailable tiles can be scaled. It does not implement P3-06 phone-scroll routing or P3-07 fit/filter/focus acceptance. Existing filters/focus and six-tab navigation remain intact. P3-07 is future work, not a second deliverable hidden here.

## Inspected reference and concrete current gaps

Reference: complete `ui-reference/Fonesi-Auto-V9-UI-Reference.html`, 249,014 UTF-8 bytes, SHA256 `26519dda4d65f4712258b9f3c136b785126121260e6fae8d8ada1bbb84363efe`. Structural inspection includes the six page definitions, shared wall, final cascading CSS and wall event handlers; this is source inspection, not a new rendered screenshot/parity result. Relevant anchors: `screenTile`, `renderWall`, `changeMonitorZoom`, `initWallEvents`, and final `.wall-screen`/`.android-view` rules. The final reference hides `.screen-top`, uses 9:19.5 phone aspect, default width150, existing range70–520 and a nonpassive wheel listener. Ctrl+wheel uses a signed12px step and returns before its demo phone-scroll branch; plus/minus use10px. Reference demo imagery/input simulation is not production authority and must not be copied into unavailable tiles.

Current `desktop/src/ui/ui-shell.tsx`:
- `wall-surface` React `onWheel` calls `preventDefault` for Ctrl, then `zoom(tile±10)` using a render-captured value. Rapid events before rerender can reuse the same width; zero delta currently shrinks.
- `zoom()` calls `p.onDimensions`, which renderer maps to real preference CAS mutation. Thus each wheel event can enter settings IPC and be blocked by unrelated settings pending/reconcile state.
- Only `--screenW` changes; fixed typography/border/radius and unavailable-content chrome do not uniformly scale. Aspect is preserved for the frame, not yet a proof of whole-tile scaling.
- No explicit nonpassive DOM wheel registration, focus-loss lifecycle fence or popup exclusion exists for this path.
- Current tiles retain `UNAVAILABLE · không có stream`; production rows require existing MAIN_OBSERVED provenance, test/demo rows remain SYNTHETIC_TEST. Empty state is not replaced with sample phones.

`desktop/assets/v9.css` is the owned reference-derived stylesheet. Final overrides hide `.screen-top` and retain reference aspect9/19.5. `renderer.tsx` independently exposes explicit saved dimensions; `ui-model.ts` contains no video frame provider. Existing ui-shell tests assert zoom persistence, so those particular assertions must change deliberately rather than be silently weakened; dock-resize persistence assertions remain.

## Minimal behavior and ownership

One local display width belongs to the shell, seeded from the already-validated `tileWidth` preference (fallback existing150). Ctrl+wheel, existing ± buttons and range use that **same local display state**, keeping their label/value synchronized; they no longer invoke `onDimensions`. This is an intentional narrowing of the toolbar from implicit persistent writes to session-local display scaling. Existing explicit Help/settings dimension controls remain the only unchanged way to save tile width; a newly confirmed external `tileWidth` prop change resets this local baseline. Theme/Fleet selection/ordinary rerenders do not reset it. Reload/unmount discards local zoom. No new setting, IPC, preference schema, stream option, main service or authority callback is introduced.

Keep existing dock-resize persistence, but pass the actual stored/baseline tile preference to `onDimensions`, never the transient local zoom width. Thus resizing a dock cannot accidentally persist a wheel draft. Existing dock reset/fit affordances remain in place: the existing fit control may reuse the same local width setter and existing formula, but this batch does not redesign fit or claim P3-07 behavior. No control moves or new modal is added.

Use a small pure UI helper in `desktop/src/ui/tile-zoom.ts` (no imports from privileged, client or persistence modules):
- validate finite scalar delta and finite measured viewport width;
- clamp local whole-tile width to the reference minimum70 and maximum520, further bounded to `floor(wallSurface.clientWidth - 24)` where at least70 fits (existing12px left/right padding);
- if an exceptionally narrow viewport cannot fit70, keep70 with existing wall overflow rather than make unreadable smaller tiles or alter the application window;
- positive vertical Ctrl delta reduces12px, negative increases12px; exact zero/nonfinite delta is no-op. Delta mode never multiplies untrusted magnitude: pixel/line/page wheels all use one bounded signed step per actual event, not a guessed device scroll amount;
- clamp means repeated events at a limit remain no-op. No exponential scale, frame-rate claim, debounce timeout or deferred mutation queue.

The event callback reads/updates a synchronous ref or equivalent functional latest-state transition, so a rapid burst is cumulative without waiting for React render. Register exactly one native `wheel` listener on the owned wall surface with `{passive:false}` and remove that exact listener on cleanup. A handled focused Ctrl gesture calls `preventDefault` and stops propagation before any other route, even at clamp/no-op bounds; it never invokes a phone handler, scroll mutation, selection callback or settings callback. Ordinary non-Ctrl wheel remains browser wall scrolling; P3-06 phone input remains unavailable. No second React wheel handler runs alongside the native listener.

Admit a zoom gesture only while this document/window is focused and the event belongs to the wall, not an open modal, picker/popover or nested editable/control overlay. On blur/visibility loss, mark interaction inactive synchronously and clear any gesture bookkeeping; there is no queued wheel work to replay on focus. Losing focus or opening an overlay cannot dispatch a device event. Do not prevent ordinary scrolling inside overlays. The listener checks each event's ctrlKey; no sticky keyboard-modifier global state.

## Whole-tile geometry, not stream configuration

Use a stable reference-sized tile canvas (150px wide, existing9:19.5 frame) and scale the complete tile subtree uniformly, including unavailable text, order marker, border/radius, focus/active chrome and future child content. Reserve the corresponding scaled footprint in the grid (wrapper width and height derived from the same factor) so transforms do not leave unscaled hitboxes, overlap rows or create a second scrolling layer. Preserve the original accessible button/identity and focus semantics; wrappers add no clickable duplicate phone. The displayed aspect stays9:19.5 for the existing unavailable reference tile, not a claim about an attached phone's real dimensions. Grid gaps/dock headers/toolbars and six-tab layout remain their existing V9 values rather than scaling the whole application.

No video/frame dimension, decoder, capture profile, Android display size, transport metadata or settings state changes. A future real frame provider must retain its own measured dimensions and letterboxing contract; this source subset must not invent one now. Do not add sample video, fake Android chrome or a successful stream badge. Unavailable reason, zero selected tiles and disconnected rows remain truthful through every zoom value.

## Files and one coherent validation checkpoint

Likely changes only `desktop/src/ui/ui-shell.tsx`, owned `desktop/assets/v9.css`, new pure `ui/tile-zoom.ts`, existing `desktop/tests/ui-shell.test.mjs`, and focused `desktop/tests/tile-zoom.test.mjs`. Renderer tests may need only compatibility assertions that local zoom causes zero preference/fleet/input calls; no renderer authority/API expansion. Parent updates exact graph/build/demo closure and fixed test inventory if the new pure helper is used. No native workflow or dependency additions.

Causal tests:
1. Min/max/zero/nonfinite/delta-mode/narrow-dock bounds; burst events before rerender accumulate against the latest width.
2. Ctrl gesture over tile and empty wall prevents default exactly once and propagates nowhere; ordinary wheel remains untouched; no phone input, settings mutation, selection change or stream/capture configuration call occurs.
3. Window blur/hidden document, overlay/editable targets, unmount and ref replacement cannot leave listeners or replay events; restored focus accepts only a new event.
4. At two widths, the exact whole-tile transform and grid footprint scale together, frame aspect remains unchanged, accessible focus/identity and unavailable text remain; no duplicate phone or nested scroll route.
5. Range/buttons/wheel share local display state; stored tile prop updates reset local baseline; dock resize/reset never persists local wheel width. Light/dark, empty production, labelled synthetic populated fixtures and existing six-tab structure stay intact.

Use existing React/esbuild/VM harness and pure tests, with explicit controlled event-target/geometry facts. These are not native browser pixel or physical-device evidence. After implementation freezes, run one integrated affected source/test/build checkpoint and normal source CI, not a per-control approval/test loop. No native execution is requested. Native visual parity and full P3-05 acceptance remain pending their own honest evidence. Rollback is source/local display-state reset only, with no external device state to undo.
