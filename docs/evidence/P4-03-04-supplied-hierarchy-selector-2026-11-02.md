# P4-03/04 — supplied hierarchy and exact selector source checkpoint

**2026-11-02; source-only evidence, not phase acceptance.** Work is isolated in the local `phase-04` worktree under [Amendment 03](../phases/PARALLEL-SOFTWARE-EXECUTION-AMENDMENT-03.md). At this checkpoint HEAD remains the common local base `a1291d99e464292a6709351e54b79a6d366e48ef`, tree `2a56b23b829f46d1f4890189a5c8ef3f2723829b` (corresponding previously published source `24a5fe5cca5445b3b36d06e0f8a84e9391d66435`). The changes below are working-tree evidence, not a claim that Phase04 has been committed or published remotely.

## Reviewed source boundary

The existing bounded XML scanner now exposes immutable normalized supplied hierarchy data while preserving its string-validation entry point. The new pure selector evaluates exact supplied predicates and returns UNIQUE, NOT_FOUND, AMBIGUOUS or UNAVAILABLE. It neither acquires a hierarchy nor issues an action or identity capability. Its only direct imports are the existing capture and input contracts.

| Source | SHA256 |
|---|---|
| `desktop/src/main/capture-contract.ts` | `cc975b0fe8ef79a014441d17af149d024ecdb64aa689265dab3e08968372c4dc` |
| `desktop/src/main/hierarchy-selector.ts` | `e581fb5f2952d8a267ac81a2ec95b3b979e1c07cce3210310cc29d5a56058e1f` |
| `desktop/tests/hierarchy-selector.test.mjs` | `72046199bcc25adf10202d670dcbf4e1a59a862fb8133b136a70c6eebf2c3bb2` |

The source and finite integration changes received independent review. This checkpoint does not replace the separate requirement-derived implementation checklist or assign a new score.

## Finite integration

Seven existing tooling files changed: `desktop/module-map.json`; `desktop/scripts/{build-manifest,check-module-graph,quality-tool,test-batches}.mjs`; and `desktop/tests/{module-graph,quality-tool}.test.mjs`.

- Register the new leaf as `main-adapter` with its exact imported bindings; include its source in build provenance and its test in the closed inventory.
- Module inventory/bound: 123 → 124. Existing source, import, layer and runtime graph checks remain enforced; the overflow negative remains.
- Test inventory: 176 → 177 files.
- Measured quality traversal: 532 → 534 entries, reflecting only the new source and test. Bound 534 → 536 preserves the existing two-entry owned-fixture allowance; entry 537 still refuses. No generic cap relaxation or excluded source subtree was introduced.
- No additional runtime bundle entry, main/preload/IPC integration, dependency version, native action or workflow route was added.

## Actual local checks and attribution

1. Source author's focused checkpoint: **17/17 PASS**, with scoped TypeScript checking, before integration. These cases overlap the integrated run below; they are not an additional independent total.
2. Phase04 had no installed dependencies. With explicit coordinator authorization, the already-admitted local Phase03 `node_modules` was copied into the absent Phase04 directory, without network, installation scripts or build-output copying. Lockfile and dependency-review bytes matched. The unchanged dependency verifier passed. An initial ambient invocation correctly refused `OVERRIDE_REJECTED`; the subsequent commands used a clean declared environment, without weakening the guard or using a source-tool symlink as admission evidence.
3. Graph check: **MODULE_GRAPH_PASS 124**. Full project strict TypeScript check passed.
4. One normal `desktop/scripts/check.mjs` invocation completed with exit 0: **TESTS_PASS 1663/1663** and **DESKTOP_SOURCE_CHECK_PASS**. This includes the existing graph, quality, production/demo type checks and builds, manifest validation and registered test batches. It is a local source integration result, not Windows runtime or device proof.
5. Afterwards only two graph-test titles were corrected from “one hundred twenty-three” to “one hundred twenty-four.” The two affected tests reran: **2/2 PASS**, overlapping the integrated cases. No second aggregate was run.

Retained aggregate log: `/tmp/auto-phase04-integrated-source.log`, SHA256 `63222687f77637143834fd313d44eafea3d2e398810ae2d6279ce9a5c0bc4cc4`. The aggregate does not imply that every separately hosted Python/foundation/native campaign was rerun.

## Explicit limits

P4-01/02 actual acquisition/helper certification remains unavailable. Tests use supplied/synthetic hierarchy and context; supplied freshness, display, binding and generation comparisons do not authenticate a physical device. No application, Android helper, socket/server, phone action, capture, identity enrollment or native payload was executed for this checkpoint. Physical hierarchy replay and selected-node action are NOT_RUN. This is a partial P4-03/04 source milestone; Phase04 is not accepted, and no acceptance percentage or remote publication is claimed.
