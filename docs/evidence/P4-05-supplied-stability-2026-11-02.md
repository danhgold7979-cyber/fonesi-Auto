# P4-05 — supplied-screen stability source checkpoint

**2026-11-02; source/software integration evidence, not acquisition or task acceptance.** This checkpoint follows the independently reviewed [supplied-stability entry](../phases/P4-SUPPLIED-STABILITY-SOURCE-ENTRY.md) on canonical local `phase-04`, baseline `0a9e79f`. Product and finite tooling changes received terminal independent review. No new branch, remote publication or task acceptance is claimed. Independent fixed-cell review permits P4-05.B N→I on this exact pure supplied-observation composition; no autonomous acquisition prerequisite is invented for that API.

## Actual source boundary

`createSuppliedScreenStability` composes the existing PNG decoder and XML normalizer over bounded supplied observations. Its frozen `observe`, `tick`, `cancel` and `snapshot` API has no capture provider, action token, identity issuer, timer, IPC or native effect. Tests use actual codec/parsing logic with synthetic supplied frames, not fabricated successful decoder results.

- At most16 admitted observations; evidence IDs are unique across the entire operation, with strictly increasing sequence and observed UTC. Existing per-frame image/XML/decode limits remain unchanged.
- Explicit supplied policy controls minimum samples, equality duration, maximum gap and one original monotonic deadline. Exact decoded-pixel digest/decoded length and XML digest equality is not perceptual variance, animation confidence or proof of physical stillness. PNG compression/filter changes can preserve equality; pixel/XML/representation changes conservatively reset the window.
- This is an externally advanced synchronous gate. `tick` observes timeout/gaps; it cannot certify stability without another admitted frame. No autonomous watcher or asynchronous timeout is claimed, and cancellation cannot preempt a synchronous decode.
- While WAITING, stale evidence, context/navigation/ownership revision loss, binding/generation change, rotation and disconnect refuse. Immediate cancellation and private operation/generation checks prevent descriptor/Proxy reentrancy from overwriting a terminal outcome; nested observe/tick returns a transient fixed refusal without mutating stored state.
- Terminal STABLE is an immutable **historical observation**, not a continuing currentness guard. Later calls return that historical result without inspecting hostile arguments. Subsequent selection/action must independently revalidate current evidence; the composed selector test demonstrates stale-context refusal after STABLE.
- No raw PNG/XML, decoded pixels or normalized-tree history is retained by the gate. No coordinate, dispatch, recapture, retry or native authority is produced.

## Exact changed files

| File | SHA256 |
|---|---|
| `desktop/src/main/supplied-screen-stability.ts` | `a2a33ccfadb594fce85a799e7a44e2694f32b99e53c988c8b0664829052d0273` |
| `desktop/tests/supplied-screen-stability.test.mjs` | `f4752d9dd6216864689feb0ee7a64d257127776542049df6e9ec63718c7d1b2f` |
| `desktop/module-map.json` | `4ce47d1e2a9cbb4f59a69f92087a411e96aeffd52b9640d9bbf57ca452386ea6` |
| `desktop/scripts/build-manifest.mjs` | `e285e5bba162a277c8332a38b93a5a19666037bec682b95e685f8fbee2bd9846` |
| `desktop/scripts/check-module-graph.mjs` | `d0392fb5961ce4bf9e495c3fd19a1a7f3b6ca0e4bac3b53ab1605652900b64b1` |
| `desktop/scripts/quality-tool.mjs` | `6e316b300630d8613be7186688adc01342155414af10f6361d837189ed5cb826` |
| `desktop/scripts/test-batches.mjs` | `8148c4fbf4449ae45f5ed701f6c5f926b5282d6e36a4815dda0fc86402ffcc72` |
| `desktop/tests/module-graph.test.mjs` | `439e0f96d9c27cf91310dba66a59e79b12e7056bdb1c54be59354bbb2446b49b` |
| `desktop/tests/quality-tool.test.mjs` | `47e92d3a7eb9800c40af4312dcc6064c0b5f5b86eaa77f17980ff42989fc52bb` |

The exact graph grows124→125 modules with the new leaf's capture/input imports only; overflow126 still refuses. Test inventory grows177→178 files. Measured quality traversal grows534→536 entries, and its bound536→538 preserves the existing two-entry fixture allowance; entry539 refuses. The pretty module map would occupy65,727 bytes, so it was compacted to50,070 bytes without changing its meaning or the unchanged65,536-byte admission cap. No runtime bundle entry, dependency change or main/native activation was added.

## Observed checks and failure attribution

1. Initial focused run: **2 PASS / 10 FAIL**. Synthetic XML fixtures omitted the existing scanner's mandatory `index` attribute. The fixture was corrected; no XML parser or admitted-language guard was loosened.
2. Final focused run: **12/12 PASS**. It covers actual decoding equality/change, XML/reset/gaps/deadline, all-operation evidence uniqueness, malformed policy/clock/context, stale display, cancellation, Proxy reentrancy, frame17 refusal and actual codec→stability→selector composition. The positive selector assertion requires UNIQUE, not merely absence of one error.
3. Full project strict TypeScript and scoped warning/error-level quality checks passed. Source/test bytes above remained unchanged during integration.
4. One uninterrupted normal `desktop/scripts/check.mjs` invocation completed exit0 with **TESTS_PASS 1675/1675** and **DESKTOP_SOURCE_CHECK_PASS**. Existing graph, quality, production/demo type checks and builds, manifests and all registered source-test batches were included. The12 focused cases overlap this total; counts are not additive independent evidence.

Retained log: `/tmp/auto-phase04-stability-integrated-source.log`, SHA256 `76728241b19701dc5c800b37b7b72237af418e12b8e9688416717681a46be73c`. Previously verified local dependencies were reused; no installation, network acquisition or duplicate aggregate was performed for this checkpoint.

## Explicit outstanding boundaries

P4-01/02 actual capture/helper certification remains unavailable. Supplied clocks, freshness, app/screen/ownership revisions and display/binding context are comparisons, not certified device-currentness. P4-05.A's real recognition-to-action authority fence and P4-05.C's cancellation/safe reconciliation of actual queued actions remain outside this slice. No physical screen trace, app/native/socket/server/device execution or action occurred. This evidence does not establish Phase04 acceptance or authorize publication/runtime activation.

## Fixed-ledger disposition

Independent source, integration and criterion review is CLEAR. Only existing P4-05.B moves N→I: N42/S0/I7, source7/49=14.3% and integrated7/49=14.3%, each +1/49 (+2.04 percentage points) versus the preceding12.2% baseline. Acceptance stays0/12; P4-05.A/C and acquisition/action dependencies stay unimplemented. This credit does not certify actual waiting on a device, perceptual stability or current action authority.
