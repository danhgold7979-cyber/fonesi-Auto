# P3-05 — display-only whole-tile zoom source checkpoint

**Source implementation CLEAR; local stitched validation PASS; final mechanical review CLEAR; hosted source result pending.**

## Scope and dependency mapping

This is the independently reviewed [bounded P3-05 entry](../phases/P3-DISPLAY-ONLY-ZOOM-SOURCE-PROPOSAL.md), adopted on 2026-11-02 at 02:54 UTC under the existing all-phase/software-first engineering scope. Its reviewed entry SHA256 was `7e8d4e92febd55541d67782c3b820983f60fafdfef93d2e543252ead986e8b2a`. [Amendment02](../phases/SOFTWARE-FIRST-HARDWARE-DEFERRED-AMENDMENT-02.md) permits this explicitly nonsequential software slice while the canonical P3-04 decoder/rendering prerequisite remains unavailable. It does not mark that predecessor met or accept all of P3-05.

The implementation changes only local tile display geometry and wheel/control handling. Unavailable stream content stays unavailable; there is no sample phone imagery, device input, stream/capture setting change or new authority. Existing explicit saved tile dimensions remain available separately. Local toolbar changes no longer implicitly write preferences, and dock resize continues to persist the stored tile width rather than transient zoom.

The reference is the complete `ui-reference/Fonesi-Auto-V9-UI-Reference.html`, 249,014 bytes, SHA256 `26519dda4d65f4712258b9f3c136b785126121260e6fae8d8ada1bbb84363efe`. Source inspection is not rendered visual-parity evidence. Current scope preserves its six-tab layout, honest unavailable tiles, base phone aspect and existing dock/chrome organization.

## Integrated source CI

The existing pinned source workflow is extended to `phase-03`, rather than duplicating its restore, source, foundation and exact Python286/no-skips gates. It emits the matching phase marker. The manually dispatched ADB job gains an explicit phase-02 branch restriction; all other native/default-off gates retain their existing restrictions. Phase-03 source publication cannot enable those native campaigns.

The CI author ran 8/8 targeted checks and then 15/15 compatibility checks (two tests overlap), with formatting PASS. These are authored local test runs, not hosted source or native proof. The new regression checks both LF/CRLF inputs and witnesses each negative mutation before requiring refusal.

## Validation and current limits

The UI author established 20 distinct affected cases through a 19/19 run and final 3/3 run (two overlap). Those include the actual controlled ResizeObserver seam, single-view footprint, baseline reset and zero settings/input effects. An initial formatting dependency finding was corrected; final scoped formatting passed.

The parent integrated gate first stopped at the old graph120 bound before tests; the exact one-leaf addition changes it to121, with122 still rejected. The next attempt stopped at BUILD because the changed CSS no longer matched its old pinned STYLE_SHA256; only the exact asset digest was refreshed. The subsequent gate passed non-test stages and batches1–2, then batch3 reported69 tests/68 pass/1 failure. Diagnosis identified the demo runtime's closed DEMO_INPUTS list missing the new helper, while its build-manifest list already included it. The exact helper entry was added; demo-build then passed8/8. The remaining batches4–22 passed1253 tests, with no failures/skips. These are stitched/overlapping results, **not an uninterrupted final aggregate**.

Final refresh passed all seven named stages: MODULE_GRAPH121, QUALITY, TYPECHECK, BUILD, DEMO_TYPECHECK, DEMO_BUILD and MANIFEST. Existing64KiB map/read/file caps are unchanged; the production graph adds one pure leaf120→121, and test inventory adds exactly two sorted paths167→169 with no removal. The next hosted desktop total is expected1557, not yet observed; foundation109/Python286 are unchanged expected gates. Existing P2 source1550/109/286 remains historical, not a result for this batch.

Retained local logs: `/tmp/p305-zoom-focused.log`, `/tmp/p305-zoom-targeted-final.log`, `/tmp/auto-p305-zoom-source-check.log`, `/tmp/auto-p305-zoom-source-check-final.log`, `/tmp/auto-p305-zoom-source-check-closure.log`, `/tmp/auto-p305-demo-diagnosis.log`, `/tmp/auto-p305-demo-fixed.log`, `/tmp/auto-p305-zoom-remainder.log`, `/tmp/auto-p305-zoom-build-refresh.log`. Independent implementation review is CLEAR at02:59 UTC; the reviewer did not rerun suites.

No actual video, decoder, Windows visual parity, device input or physical-device result is claimed. P3 remains technical acceptance0/19; P2 remains1/13. The separate native deployment proposal remains a design review, excluded from this display-only source implementation.

## Exact source and tooling fingerprints

| Path | SHA256 |
|---|---|
| `.github/workflows/phase-02-software.yml` | `b0e7e226b9eed5b5b16cb452695044792be2fada516ac86ded5af6eddd31d558` |
| `desktop/src/ui/ui-shell.tsx` | `b7ad027014cf064acc3d2db79c814e8b1bd4a82cbf696212b5bc7dfc07815782` |
| `desktop/src/ui/tile-zoom.ts` | `35e303fe3d5ec1a796053e02359f2a56a1db273ed1cc516d5e312ec39de305ad` |
| `desktop/assets/v9.css` | `3d8938864c15aba78e331dba70f6d4747fce3111812a453a3297014ee0a0b709` |
| `desktop/src/main/asset-policy.ts` | `84cb390380248e4021767795e6dd37878efbd9c0b23d7a576acfd03c29fa29fd` |
| `desktop/demo/runtime-contract.ts` | `b807c80e45efd029099e661707d90d700d3737f460a28d525f724c9b8bb83b63` |
| `desktop/tests/ui-shell.test.mjs` | `cad792652105541e8bf33e51b450ba2c298424255b70e7228b4228303745d06d` |
| `desktop/tests/tile-zoom.test.mjs` | `f1b42ae5c8b501de1d8d3f742f9afdfb3ecaa6fe68f55bdd72256a80c36d6887` |
| `desktop/tests/phase-source-workflow.test.mjs` | `ba376df0fba849983399bc383f6bec3b1750aa35ec24dbc6c949edba428e0dee` |
| `desktop/tests/isolated-adb-server.test.mjs` | `158b98d49098e3ea8438486dd75110749861c93f15700180a66849d7ddcdb68d` |
| `desktop/tests/module-graph.test.mjs` | `6cf983fdce8c872c746c2e5c5044b44ab1dc78371de25549f50c5b0706cbd50e` |
| `desktop/scripts/check-module-graph.mjs` | `683aaf7647254828c864deb397711f0fb2b2dd9e5397f540a2a313bd5d2066eb` |
| `desktop/scripts/test-batches.mjs` | `c3a725c6c2b4f88262de130067ed36495f300882186ee91f95a0f4a59d7653f7` |
| `desktop/scripts/build-manifest.mjs` | `eecf6ad8f6b901b153a5800a1c06cbab44cc5d742a7ed0b2eb6324a25975c439` |
| `desktop/scripts/demo-build-manifest.mjs` | `73e9b18873d8da3cbde9386ef0fd74a66e5772659f68d1a597ad4444d1e0f32a` |
| `desktop/module-map.json` | `f942129e17a6bf3f1116b236cb405330aee2a3d943e5f0453a5e3332e5a799ec` |
| `desktop/demo-module-map.json` | `423793f7eb7bf4c17e773be068ef894f932f51f8fdc37ce849a154f98167b85e` |

Final exact21-file index/hash/link closure is independently CLEAR at03:04 UTC. All17 fingerprints matched disk/index; no source/test rerun was performed by the reviewer. The native paired-consumer contract remains excluded from this publication.
