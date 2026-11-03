# P3-12 — local performance-panel interaction

## Scope and source entry

The [adopted contract](../phases/P3-PERFORMANCE-POPOVER-LOCAL-SOURCE-PROPOSAL.md) was independently CLEAR against pre-adoption SHA256 `262c374f751726b499592a82b5ddc495079c4d3a30d660b4bbe37d4b3e1b2ab0` at 09:29 UTC. This is a bounded Amendment02 independent implementation of canonical P3-12, not an assertion that its P3-11 telemetry dependency is complete. It preserves the existing attached right-dock panel and six-tab layout, without importing the V9 demo's fabricated measurements or global modal.

Baseline: public `21f7503bde755ba5b67a5b061f943e8d483ec1f5`, local `70cd898e8fd18c616d382ed66c22ee08056dd4d8`, shared tree `0a7f366e1ce914ed107f0aa5dd1d7a10e94f11b2`. Latest actual hosted source then was `2cf4fe02` with 1636/109/353 and separate exact NOTICE capture PASS. At source entry09:29, binary retention was a separate pending owner decision; the later09:37 specific approval remains separate from this UI slice.

## Implemented local behavior

- Explicit nonmodal open/close, stable `aria-controls`, truthful presented `aria-expanded`, normal Tab navigation, panel-origin Escape and same-session conditional focus restoration.
- First focus occurs only after actual measured presentation and while the focused/visible document still owns opener/panel focus. Old session callbacks, rapid close/open, unmount, modal/readiness loss and focus moved elsewhere cannot revive or steal focus.
- Picker/performance transitions are exclusive without changing selection, ACTIVE or visual-focus history. Unrelated settings pending does not disable local panel interaction.
- Hidden/noninteractive, non-layout-consuming initial measurement uses the actual dock width and actual header/sibling dimensions. Fixed siblings do not shrink to fabricate available room; cap reserves the existing 130px wall minimum. Invalid/insufficient geometry cancels rather than reopens automatically. Sticky close chrome remains within the scroll region.
- Panel wheel propagation is contained without preventing native internal scroll; CSS overscroll containment prevents boundary chaining. Existing wall-zoom blocking remains. No wheel becomes a phone command or preference write.
- Existing UNKNOWN/no-sample sensors, unavailable requested/effective/recommended values and disabled backend controls remain unchanged. No telemetry/profile/decoder/main/IPC/native path is added.

## Author validation and review state

Worker baseline 23/23 UI tests passed. Expanded 30-case run had 29 passes and one new fixture failure: it called nonexistent `unmount` instead of the existing `dispose` helper. Correcting that fixture and rerunning the affected case passed 1/1; this is 30 distinct cases with stitched coverage, seven newly authored, not two full successful suites. Existing work-page/CSS cases pass 12/12. Strict TypeScript, scoped Biome and whitespace checks pass. Parent updated only the exact `STYLE_SHA256` to the changed CSS; no general asset-policy relaxation.

The sole parent aggregate on the initial coherent source emitted actual **1643/1643 + DESKTOP_SOURCE_CHECK_PASS** (retained log SHA256 `80649926b8a3e52439175c3b32e680333f5a6bfda84fdf932cc428966c8fc6ed`). Independent review then identified three concrete edges: the existing nested SetupPage UiModal was not covered by shell-local modal state; a retained picker Escape listener could restore stale focus during transition; and the negative sticky-header inset could clip close chrome. The one correction batch adds the actual document-dialog fence and descendant-dialog focus capture, synchronous picker-session invalidation, and sticky inset zero. Actual affected regressions pass **10/10**, including two new causal cases (32 total authored shell cases, nine new in this slice); the nested dialog case composes actual SetupPage/UiModal source through an explicitly transformed VM fixture, not an actual native window. Final narrow implementation review is CLEAR at 09:37 UTC. All seven final module-graph/quality/typecheck/build/demo-typecheck/demo-build/manifest stages PASS; rebuilt asset-policy tests pass 40/40. The historical aggregate is not relabelled as final corrected source. Hosted results are NOT_RUN; the prospective total is **1645/109/353**. VM/React/DOM-geometry and source/CSS assertions are not rendered viewport screenshots, browser-native behavior qualification or physical evidence. No input/stream/telemetry effects were exercised.

Independent final LOCAL evidence review at09:41 credits P3-12.A–D N→I under the unchanged definition: fixed coverage18% source /14% integrated, +4pp each versus14%/10%; technical task acceptance remains0/19. Hosted CI is not an additional invented prerequisite for this software-only status. Full visual parity, real telemetry/profile application, decoder and device acceptance remain open.

## Exact changed paths and source fingerprints

The separate retained-pair destination and implementation drafts are excluded from this source batch. No graph/test-file inventory/cap/dependency/workflow/native change: graph remains123, desktop test files175.

Exact seven paths:

- `desktop/assets/v9.css`
- `desktop/src/main/asset-policy.ts`
- `desktop/src/ui/ui-shell.tsx`
- `desktop/tests/ui-shell.test.mjs`
- `docs/PHASE_STATUS.md`
- `docs/evidence/P3-12-local-performance-panel-source-2026-11-02.md`
- `docs/phases/P3-PERFORMANCE-POPOVER-LOCAL-SOURCE-PROPOSAL.md`

| Source/test path | SHA256 |
|---|---|
| `desktop/assets/v9.css` | `e7e50668bf4ee7c596c27c568cd24ab55a83c711ca2c6134c4f4b9dee7301f42` |
| `desktop/src/main/asset-policy.ts` | `3175c7bd00923bb069588b3f46892078355d6fce1ad37d0e002bad9c93c427b4` |
| `desktop/src/ui/ui-shell.tsx` | `5d07812bfe5a1462bcfcf4705366d0ebdc4407abca8d3b0a77462b0d9e0b51cd` |
| `desktop/tests/ui-shell.test.mjs` | `79eeb83d45678dd363b703e05c4e348af9b0a539b5399eb16cf4c8b817a26788` |


Final refresh log SHA256 `abf64b11f1204bbafc0ca3c98c4ba390175cdcf484517a205ac6a9525bf84cc6`; rebuilt 40-case policy log `6fc695a068c3651b5697118d185d582d0bad6de7fa05204ce2beadc1204da3b1`. Final exact seven-file staged mechanical closure is CLEAR at09:39 UTC: paths, four fingerprints, CSS pin, links, whitespace and retained validation attribution independently checked. No source/test change or rerun followed.


## Local completion and batched publication policy

At09:39, the reviewed local source checkpoint is `129346cb23fc3efed338725fc35b5cef5bc442ae`, tree `731b06001cbfaca9b60e54f6c7ce509f1ce76f3b`. The owner then requested larger code/check batches and publication only at meaningful milestones or phase completion. Immutable blob preparation already in flight settled, but no remote tree/commit/ref update was made for this checkpoint. Remote remains `21f7503bde755ba5b67a5b061f943e8d483ec1f5`. This completed local UI work will accompany the next meaningful source/build batch; no standalone hosted run is needed to restate the already attributable local software checks. Expected hosted counts remain estimates. No standalone evidence/status publication follows.
