# P3-11 — explicit host CPU/RAM source integration

## Scope, authority and baseline

[Parallel software execution Amendment 03](../phases/PARALLEL-SOFTWARE-EXECUTION-AMENDMENT-03.md), section B, was adopted at 11:26 UTC after independent CLEAR against pre-adoption SHA256 `e86b0646c4721a412d2b9198045c404176e8a89e2c25619f81f122c67b09f588`. This implements canonical P3-11.A and its bounded freshness/sampling G behavior independently of phone/video availability, under [Amendment 02](../phases/SOFTWARE-FIRST-HARDWARE-DEFERRED-AMENDMENT-02.md). It is not a complete telemetry subsystem, resource-grade implementation or hardware acceptance.

The isolated source lane started at local `a1291d99e464292a6709351e54b79a6d366e48ef`, corresponding public `24a5fe5cca5445b3b36d06e0f8a84e9391d66435`, tree `2a56b23b829f46d1f4890189a5c8ef3f2723829b`. Parent integrated the reviewed named files serially onto canonical phase-03 local `6cfe03f25722dcb77fc34c548a79eed43382a765`, preserving its separate NOTICE-v2/package changes. No new branch, standalone publication, credential/security change or device action is part of this evidence.

## Implemented behavior and finite contracts

- The existing performance panel owns one explicit **Read host CPU/RAM** action. Opening/hydrating/resizing the panel does not sample. There is no automatic polling or retry.
- `foundation:host-resources:v1` accepts only exact bounded canonical string SAMPLE/CANCEL requests, correlated finite request IDs and closed responses. Preload/bridge use the existing ordinary invocation budget; no ninth invocation or device Stop reservation is taken.
- A fixed bundled `host-resource-worker.cjs` uses Node OS/process counters. Production sampling is Windows-only; unavailable platform/probe/counter facts are explicit null metrics, never invented zeroes.
- Each immutable metric records value, code, unit, source and scope. Host CPU uses nonregressing per-core busy/total counter deltas. Main-process CPU uses cumulative user+system microseconds divided by monotonic elapsed time and logical CPU count. Topology change, invalid/regressing counters or denominator reject that metric. RAM total/free and main-process RSS use bytes.
- **MAIN_PROCESS means Electron's main process, including its threads; it does not mean all Auto/Electron processes, renderers or application workers.** UI states this limit. GPU/disk/network/Vision/stream/resource-level and unsupported controls remain UNKNOWN/unavailable.
- Two captures have a fixed one-second separation within one original three-second monotonic deadline. One retained worker is allowed; a message is not retirement. Successful delivery waits actual exit zero, exact message/correlation and final current-session fences.
- Cancel/timeout/close requests termination of the exact worker but retains actual exit obligations. Shutdown awaits actual drain. Panel cancellation can be BUSY under the shared ordinary budget: UI delivery is immediately revoked, while the original main three-second deadline still requests worker stop. Immediate termination is not claimed.
- Five-second cached freshness is a conservative UX/source policy, not an observed performance grade. Transport/operation elapsed time is subtracted rather than extending freshness. Expiry or close preserves captured history marked STALE/NOT CURRENT; late completion cannot revive it.
- UiShell owns the Read button and its exact measured panel-session token. It checks live lifetime, readiness, current modal/document visibility/focus and disabled state. A retained handler from a closed/reopened panel cannot start another sample. Renderer supplies content and callback, not an unfenced raw action.

Pinned Electron declarations and official Node [OS](https://nodejs.org/api/os.html), [process](https://nodejs.org/api/process.html) and [Electron process](https://www.electronjs.org/docs/latest/api/process) documentation support units/scope. Cumulative Node CPU counters avoid sharing Electron's interval-reset CPU getter among consumers. These sources are API support, not actual Windows sampling evidence.

## Source, build and package closure

Exactly five new source modules extend graph 123→128, with 129 rejected. The same five existing source directories make filesystem inventory 128→133; depth and link rules are unchanged. Compact JSON retains the **65,536-byte map cap**; the current map is 51,427 bytes. Roles, exact imported symbols and Node/main separation remain closed. Demo's existing shared-UI graph passes without importing telemetry authority into its renderer.

The literal worker is emitted by the existing build, required by main's exact output list, hashed by the production manifest and required by package admission. Missing or extra worker outputs are refused in the actual package-policy fixture. An additional test really bundles the current worker and proves its generated hash in the actual manifest composer; all other temporary outputs in that test are explicitly synthetic. The generated worker is **not executed**.

The isolated actual build produced a 6,838-byte worker, SHA256 `16f0fe5f674e4672b72eaffb9ad4443b99daa9fe33da5e8f572d1ef3001da05c`, equal to its manifest entry. Parent subsequently rebuilt the integrated canonical source. Test inventory is 176→177, one additive path; quality inventory is 542→544 with exact 545 overflow negative. No scanner, output, dependency, deadline or capture cap is relaxed.

The isolated worktree used an untracked tooling-only dependency link. An initial build refused the ambient NODE_PATH with OVERRIDE_REJECTED; removing that prohibited environment override, without modifying verifier policy, yielded actual installed-dependency verification and BUILD_VERIFIED. This is not a claim of physical link-free dependency custody. The link, generated outputs and copied amendment are not source payload.

## Validation, fixes and independent review

There are **19 newly authored cases**: 14 host contract/counter/sampler/client/bridge cases, two renderer cases, two UiShell cases and one generated-worker/manifest composition case. Existing package missing/extra-output and graph fixtures were extended rather than counted as new tests.

Author runs are deliberately overlapping/stitched, not a fabricated uninterrupted aggregate:

- Initial host cases 12/12, then two final-fence/deadline cases 2/2; refreshed producer plus runtime integration 19/19.
- Affected settings renderer/preload 34/34; final renderer host cases 2/2. Existing shell 32/32, new cancellation case 1/1.
- Independent review found one stale panel Read-handler gap. The source correction moved Read ownership into UiShell; actual transformed UI cases now cover close/reopen retained handlers, hidden document, dialog, disabled/readiness loss and unmount. The affected renderer/shell set passed 4/4, including the new causal case. Reviewer CLEAR binds shell `49e6621a…` / renderer `83917945…` and their exact tests.
- Initial build-integration graph/batch run was 19/32: the filesystem inventory needed the five new sources, and an inherited NODE_PATH invalidated the metadata control. After exact inventory/environment correction, 31/32 passed; the remaining test had a stale exact renderer-import expectation. Adding the one real contract import made its targeted rerun 1/1 PASS. No graph policy was weakened.
- Generated-worker/package composition 3/3; unchanged demo compatibility 8/8. Strict TypeScript and whitespace passed. Scoped quality reported pre-existing informational template suggestions, no new warnings/errors.

The first parent integrated source run stopped at batch 5 with **TEST_PROCESS_CAPTURE_LIMIT**, not PASS. Diagnosis isolated the old discovery-main callback regex (4/5); the repaired fixture exercises the actual coordinated callback, and its five cases pass. Initial batches 1–4 had completed in the parent control; remaining batches 5–23 then produced **REMAINDER_PASS 1288** with zero failure/cancel/skip/todo in each batch. This is stitched complete inventory coverage, not an uninterrupted source aggregate or hosted count.

Final parent refresh records all seven stages PASS: module graph, quality, TypeScript, build, demo TypeScript, demo build and manifest. Source/build review is independently CLEAR. No broad duplicate suite, live worker or native campaign was needed to repair these source fixtures.

## Software status versus acceptance

Independent software review credits fixed [implementation checklist](../phases/P3-IMPLEMENTATION-CHECKLIST.md) cells **P3-11.A and G N→I**, without splitting/reweighting the denominator: **N79 / S5 / I16**, source coverage **21/100 = 21%**, integrated/software-tested **16/100 = 16%**; **+2 percentage points each** from the comparable 19%/14% baseline. This is functional software coverage, not effort, LOC, hardware success or complete P3-11 acceptance. Phase 3 acceptance remains **0/19**.

Actual Windows worker sampling, live UI/browser visual qualification, performance overhead, all-process accounting, GPU/network/disk/stream metrics, resource grading and phone/video integration are **NOT_RUN or unimplemented as applicable**. No real resource values or hardware identity evidence were manufactured. Hosted source/Windows results for this integrated telemetry checkpoint remain NOT_RUN at this local freeze. Separate package publication/NOTICE decisions are not retried or reclassified by this source lane.

## Exact final source/tooling fingerprints

These hashes bind the integrated canonical files (including the parent's preserved package-v2 context and narrow final fixture/quality corrections), not the earlier isolated versions. Documentation/status/ledger updates are parent-owned and separate.

| Path | SHA256 |
|---|---|
| `desktop/src/host-resource-contract.ts` | `71e414b3d9b62c35cec09525094fa7c1e5e5ff75e6c118031750bd7f18edab9c` |
| `desktop/src/host-resource-client.ts` | `82a1b60918b499fdfbf2a2ed18fe2fb2c4009ebe5b1ff523e3ac2345c7308953` |
| `desktop/src/host-resource-bridge.ts` | `5a06236556c95dc206a2fbee214042f933a4cee4c8be2b4153e53dbd9c122140` |
| `desktop/src/main/host-resource-sampler.ts` | `b002edabd197d450e3c5879ab4cd62d42bdda6956c0b03e07ee2b12da6e21a6c` |
| `desktop/src/main/host-resource-worker.ts` | `b1bd89f75d7e0e8aa9715cc99fc505b623ab43287608a987dccf83573b28d2ff` |
| `desktop/src/main.ts` | `440cee31e776437af1e5f828d3528a1d99be9a4bc155e2338b67d7bd094734b3` |
| `desktop/src/preload.ts` | `94d1dd47808f0295bc2cdc99372423e5c38290520bc9ae9e7765455fa78b26dd` |
| `desktop/src/renderer.tsx` | `83917945f9b79be87fc38b9930f00abd6d710e27ca4b0c9ecae888da8fc5a744` |
| `desktop/src/ui/ui-shell.tsx` | `49e6621a0c9c2952d99d1072fc65be5bd13c6a98a20a1fa869cfdadd2e623e15` |
| `desktop/tests/host-resource.test.mjs` | `2943f13c35d76a72934951513ed3808d6e4df1b596317b111ddde3c235b2bc06` |
| `desktop/tests/settings-renderer.test.mjs` | `da1c96bb7c7ffc6fa98b91b4046d137b27f645c75e8438147fa40c05d447f7e5` |
| `desktop/tests/settings-preload.test.mjs` | `9f52b1a540f6bcee4706ec547b51d6b62d65c44aeee7f382521aefdfdfe76786` |
| `desktop/tests/runtime-version-integration.test.mjs` | `25366e9a0d74d00d1777afa36160bd50636f3b69a6510a74e5c1402aa2293963` |
| `desktop/tests/ui-shell.test.mjs` | `da6e534f396174e1a294658275d6c5d20a4f85e0aadc76ebe722bf17f99c2ccf` |
| `desktop/scripts/build.mjs` | `a10df059dd0e77b1b4a9487ac2eb826eff57528e853d18bbd3da32e4fe129f79` |
| `desktop/scripts/build-manifest.mjs` | `64ad7959548845ac69f5f2a6a251dc34357b56ed1db80da24314ee7bd39acaac` |
| `desktop/scripts/check-module-graph.mjs` | `98a9e739a494dee6e0f37d2281eed65f4a042b3013ad1c969c1ea7c76f68e875` |
| `desktop/scripts/test-batches.mjs` | `67e2285618f8fe1ecb0349ca49a6fded32b7fc6ec25542a47a325685fa8d728b` |
| `desktop/launch/package-admission.cjs` | `24f717d6af6522f802e99b8f2fc6b6994d3a4b8ff15e5ab91d349545416c5dfa` |
| `desktop/module-map.json` | `c60ac1fc1358a1866715b7ee84ce4d02121ec3bf9437a861101ba4e306aeab2c` |
| `desktop/tests/module-graph.test.mjs` | `995d7af29c97bdda8109881517d9b70658280c72a2bf76fc42043ba42de971d2` |
| `desktop/tests/package-build.test.mjs` | `4a6e1d14b90336949585a4043c2729f18605bf2fce3c03ac9544aaf424bbc211` |
| `desktop/scripts/quality-tool.mjs` | `ab918507cc2c4afac0641d1edb4b134cf219a1eba1cc0dbb3e4635de652fbc06` |
| `desktop/tests/quality-tool.test.mjs` | `1b1968661cee02a009d181244e8f46681088fcb6c2867ced5e43ff9bc50ce5bc` |
| `desktop/tests/discovery-main-integration.test.mjs` | `49a7d9d4583c9d3aec650574ccfb26a87aa5f84ff2e3a41b9b806c8e58dd91b7` |

## Retained local validation log fingerprints

| Log | SHA256 |
|---|---|
| `p311-panel-session-correction.log` | `f19438a6082d95aa0afe6e375113338fae9d4eedc03f48ddc14b60ca44012ff7` |
| `p311-worker-composition.log` | `7c3c48c75821bb415a222bdc8ae9c248bf6e911383da0083d97c84f4dd6a734e` |
| `p311-demo-compat.log` | `450b2cdcd25da1c366ce99ca61efcfc7e0bd43947e94d3eccf279954e8fa3a9d` |
| `auto-telemetry-integrated-source.log` | `2644eca0e479cf90a84308b83782ec174539be36c4019a399b4dfc488d3fbeb5` |
| `auto-telemetry-discovery-final.log` | `235dc0caf4f3df24b0b481cfb85e6f28d66e0f0ac6f9ec387820e64c8a08f3e8` |
| `auto-telemetry-remainder-batch5.log` | `cf436c79dbb9ff390241bbf7cfda037ec0f345bbdc264fbb62e7f202f13f5f7d` |
| `auto-telemetry-final-refresh.log` | `abf64b11f1204bbafc0ca3c98c4ba390175cdcf484517a205ac6a9525bf84cc6` |
