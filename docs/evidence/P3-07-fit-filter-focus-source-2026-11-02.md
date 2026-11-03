# P3-07 — display-only fit, selected grid and visual focus

**Implemented source; local and hosted source PASS; independent implementation and terminal audit CLEAR.** The [source contract](../phases/P3-FIT-FILTER-FOCUS-SOURCE-PROPOSAL.md) was independently CLEAR at07:44 UTC against exact pre-adoption SHA256 `bc48d2ecbd76baf9bd47e060f545a3126de6994f601e0beebcabc462a0979d9b`. The coordinator adopted this bounded independent UI slice under the existing all-phase/software-first scope and Amendment02. At source entry, the reviewed source baseline was public `d267f8ddd9cbfc23a480a3c9f436b0944f4699fe`, actual1603/109/339 source PASS; docs/evidence closure is public `9e9e88e185e2c8617b6310b712d6ccfa3169e99a`, local `b687ddaa60c9039ee1dd24384d15747a44828af6`, tree `1ef8191645191196da89b3705cd014acb6b00375`.

The finite software work separates local visual focus from main-confirmed ACTIVE, preserves the existing selected-phone grid and explicit picker selection, uses actual read-only generation for display invalidation, and restores only prior local display sizing. Fit/manual resize behavior reuses existing whole-tile zoom and unavailable canvas geometry. No decoder, frame provider, new main/IPC/actor authority, phone command, stream operation or settings write is introduced. Existing explicit tile/page ACTIVE requests remain separately confirmed and are not falsely counted as zero selection changes.

Canonical P3-06/decoder/physical evidence remains open. Source geometry/VM tests, rendered visual evidence and task acceptance are separate. At source freeze the fixed ledger remained 10/100 source-covered and 6/100 integrated. The actual hosted closure and independently reviewed four-cell update below supersede that checkpoint, separately from task/visual/hardware acceptance.


## Coherent source implementation and author checks

Product changes reuse `ui-shell.tsx` and existing `tile-zoom.ts`; no new module or CSS. `UiDevice.generation` is copied unchanged from parsed Fleet rows into the readonly renderer projection; demo generation0 is explicitly synthetic. Product/demo module maps add only the exact `fitTileZoom` import binding; graph, file/read caps and authority boundaries remain unchanged.

Author targeted evidence: 27 distinct UI/helper cases pass across overlapping targeted runs (seven additive cases), not an uninterrupted aggregate. The initial run passed5/27 and failed22 after a source row-narrowing typo caused ReferenceError; the product correction was made. The next shell run passed18/23; five obsolete fixtures relied on OFFLINE focus, implicit selection or an open picker. They were updated to the adopted explicit DEVICE/generation/selection/overlay behavior, not relaxed product guards. A subsequent4/5 run exposed invocation of an intentionally stale captured page handler after another render; the fixture uses the current handler while the new stale-handler refusal case remains. Strict TypeScript/scoped Biome pass after earlier array-element narrowing and exhaustive-dependency corrections, without suppressions. An initial formatter used the wrong root tool path and exited127; the admitted desktop path was then used.

Readonly projection tests pass2/2, including unchanged0/7/MAX_SAFE generation and malformed/missing/-0/negative/fractional/unsafe/string/null refusal through the actual Fleet parser; demo4/4 passes. These renderer/VM/geometry/source tests are not screenshots, real video, physical identity or hardware input evidence. The coordinator's sole coherent desktop aggregate completed **1611/1611 PASS plus DESKTOP_SOURCE_CHECK_PASS**. Retained `/tmp/auto-p307-first-source-check.log` SHA256 is `7dcf98c67cc56cbca7d14e917810df11035567a4d346f59e2790ea363df666bc`. Its normal pipeline includes current graph, quality, strict typecheck, product/demo builds and manifests before tests. Independent unified implementation review is CLEAR at07:53 UTC against the exact source, projection, maps and causal fixtures; no concrete blocker remains. At source freeze hosted results were NOT_RUN and 1611/109/339 were expected only; actual hosted evidence below now supersedes that estimate.


## Exact source/test scope and fingerprints

The thirteen-file checkpoint consists of the ten files below plus this evidence, PHASE_STATUS and the adopted P3-07 source contract. No new product module or test-file registration is added; graph123 and existing173-test-file inventory stay unchanged. Product map is65,035 bytes under the unchanged64KiB limit; only one exact value binding is added in each map. All current C#/launcher/managed/compiler/workflow inputs remain unchanged, so neither managed74 nor paired compilation is repeated. Caches remain excluded.

| Path | SHA256 |
|---|---|
| `desktop/demo-module-map.json` | `17174a1f65c71c470edde3e2898d1b35686be51376562d6959eea3f3ca9fae27` |
| `desktop/demo/fixtures.ts` | `dfbfa69ffd3c8fc1931e53b66e3232b52262dbb2857de2a4d42c2d9a889fcc77` |
| `desktop/module-map.json` | `2def01fb1bf59dbd7b579aec9c880e527dc873750ce8114e05052b1dcf79b178` |
| `desktop/src/renderer.tsx` | `c9e1062a2762bd141de7efe606d5bd511f6bdcbef1559447be227cdd5e9c6617` |
| `desktop/src/ui/tile-zoom.ts` | `a9ff854d6482a83f271ae7f30ca4594bb0eae5c838a3201a87092656ad6f6e1a` |
| `desktop/src/ui/ui-model.ts` | `361eb61ee4d8325f08fa53a5e79cb3626518979f84f179c96af9d89b5ff781a4` |
| `desktop/src/ui/ui-shell.tsx` | `a684da44089e526dcbe6cc12b499d2fbf0c0ae56e0c76edf97586ae780377f7a` |
| `desktop/tests/settings-renderer.test.mjs` | `a29d476db51857e85ecbf6ebefdb903e92fab48b855610bdc5167d52314b4a60` |
| `desktop/tests/tile-zoom.test.mjs` | `aa3b3e7803246cbd6da4ebe3208c7fe59352bb307072c7c9a03d9889c127a4d8` |
| `desktop/tests/ui-shell.test.mjs` | `5e33ba7152f185d06be6b2a469f51de53c10da3343eb50959bfe46a4454e4518` |

Final exact thirteen-file mechanical closure is independently CLEAR at07:53 UTC: all ten fingerprints, disk/index equality, links, retained aggregate hash and unchanged graph/test inventories verified. Historical source-entry wording is corrected; no further source/test change or aggregate is requested.

## Actual hosted source closure — 08:05 UTC

Public source `2d765754f4981e071932d0d064322a0c938900ab`, local `8b099f4331505639bde0a7bd9ab6589b928d5369`, exact common tree `eafd505df84ba59cbb0f8104d0cb7c861359f476`. CI **41409458090**, source job **125158907820**, is terminal SUCCESS. Retained `/tmp/auto-p307-source-pass.log` is exactly **93,407 bytes**, SHA256 `70eb59313c737d2a7e5c8605003253bc74da7e9870daeb4b0896f9f59c5b2a9f`.

Actual emitted evidence is **TESTS_PASS 1611/1611**, **DESKTOP_SOURCE_CHECK_PASS**, foundation **109/109** with fail/cancelled/skipped/todo all zero, Python **Ran 339 tests / OK**, and phase03/no-ADB markers. Twelve optional jobs were SKIPPED according to the separately observed jobs API; that fact is not inferred from this source log. No native or paired compiler rerun occurred.

Independent retained-log audit at **08:02 UTC** verified exact bytes/hash, source/local/tree identity and all ten committed source fingerprints. The fixed [100-cell ledger](../phases/P3-IMPLEMENTATION-SUBDELIVERABLES-v1.md) credits only P3-07.A–D N→I: fit/resize, selected-grid/empty filtering, independent focus versus confirmed ACTIVE, and exact-tuple loss/repeated-focus/restoration. Current N86/S4/I10 gives **14% source coverage / 10% integrated software coverage**, **+4 percentage points each** versus the prior 10%/6% checkpoint. Definitions/denominator are unchanged; no credit comes from test-count growth alone. Rendered visual parity, decoder, physical and task acceptance remain unproved; technical acceptance stays **0/19**.
