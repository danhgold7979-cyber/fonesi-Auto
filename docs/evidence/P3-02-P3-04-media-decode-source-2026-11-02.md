# P3-02/P3-04 single-session encoded media and decoded tile source

## Scope and honest qualification

Restored implementation session started 2026-11-02 14:49 UTC on `phase-03`, local base `2c125363b428427397128a06756902bf7568c5ad`. The adopted [source entry](../phases/P3-MEDIA-DECODE-SOURCE-ENTRY.md) governs this batch. Existing work and Git history are preserved; no device or user-computer operation occurred.

This implements one explicit Start/Stop video session: retained native v6 binary media chunks and credits; bounded main assembly and fixed MessagePort handshake; main-owned verified target/lifetime; renderer H.264 Annex-B SPS/PPS validation, WebCodecs capability/decode orchestration and canvas delivery fenced by identity. Historical v5 counter semantics remain encoded packet observations. Native output Write/Flush and real cleanup promises remain distinct from renderer CONSUMED/PAINTED. Runtime pair admission remains unavailable until newly compiled exact consumer bytes pass separate matching-pair gates.

This does **not** implement/certify multi-stream, pause/restart, effective focused/background profiles, Windows H.264/custom-origin execution, real-device routing, physical image correctness or V9 screenshot parity. Independent fixed-cell criterion review records P3-02.A/C S→I; P3-04.A/C N→S, B/D N→I; P3-09.A N→I. Current N74/S4/I22 gives26/100 source and22/100 integrated, +5pp each versus21/17. P3-04.E remains N for incomplete whole recovery behavior. No task acceptance follows; accepted count remains0/19. These are exact reviewed cell transitions, not automatic credit from test counts or elapsed work.

## Independent review repairs

- WAITING_KEY DELTAs were intentionally consumed without paint in renderer but incorrectly retained as pending paints in main. Main now omits their paint identities until an issued KEY; SESSION/CONFIG reset this state. No protocol expansion; original deadline remains. Tests cover repeated pre-key DELTAs initially and after either reset, forged discarded-frame paint, late old-generation paint/ACK and the three-identity bound.
- Uncertain/rejected video cleanup previously threw inside the shared shutdown try, skipping other shutdown owners. Video now records dirty cleanup separately before entering the unchanged custody/persistence retirement chain. Executed source extraction covers false/rejected cleanup, dependent custody refusal and final non-clean state.
- Restored integration tests needed the explicit video bridge VM dependency and two exact renderer import expectations. The final pass also maps real video modules into existing runtime-version VM tests and scopes native writer-order assertions to WriteLoop, retaining the additional mediaFrame==null retirement requirement. Only literal media.Cancel() credit cancellation is excluded from the existing prohibition on thread/worker cancellation; no worker retirement is inferred. These are inventory repairs, not removed assertions or relaxed boundaries.
- Six quality warnings in the new stream modules were manually resolved through equivalent optional guards and a captured admitted port; no unsafe automatic lint edits.

## Validation

Linux disposable workspace, Node24.22.1; pinned installed dependency and quality-tool verification. Prohibited ambient NODE_PATH/NODE_OPTIONS/ESBUILD_BINARY_PATH omitted from test invocations, with policy unchanged.

- PASS: `node foundation/scripts/check.mjs 11.19.1`,109/109, zero fail/cancel/skip/todo; `/tmp/p303-foundation.log`.
- PASS: `python -B -m unittest discover -s desktop/verification -p 'test_*.py'`,375/375; `/tmp/p303-python.log`.
- PASS: main shutdown/source integration6/6 (`/tmp/p303-shutdown-regression4.log`), stream bridge17/17 (`/tmp/p303-prekey-regression3.log`). These overlap the desktop aggregate and are not added to its count.
- Independent source review: independent source reviewer CLEAR on functional fixes; actual targeted35/35 and native-source validator37/37. Native-source assertions are **not** managed C# execution.
- PASS: final frozen `node desktop/scripts/check.mjs`,1752/1752 plus `DESKTOP_SOURCE_CHECK_PASS`, including pinned dependency verification, module graph, quality, strict production/demo typecheck, production/demo builds and manifests; `/tmp/p303-restored-final-source.log`. Prior attempts are retained: initial QUALITY_FAILED; then batch3 timing-sensitive held-audit test86/87 (isolated87/87); batch5 missing VM binding76/77; batch9 stale import inventory76/77; diagnostic batch14 obsolete native-source assertions74/75 and batch15 missing new video VM bindings59/61. A later overlapping check/rebuild attempt failed three actual-output preparation fixtures in batch19 (76/79); isolated batch19 then passed79/79 and the final uninterrupted complete aggregate passed1752/1752. Concurrent rebuild interference is a plausible diagnosis, not independently proved. Do not relabel these failed attempts PASS.
- NOT_RUN: current managed92 C# fixture on Windows, exact new consumer compilation/pair build, actual WebCodecs decode and custom-scheme MessagePort transfer, packaged/native runtime and visual/physical acceptance. No Windows compiler/runtime is available locally. Historical managed74/pair evidence cannot qualify changed native bytes.

## Review and publication boundary

No publication or main merge occurred in this worker. Normal reviewed Windows source build/test workflow is the next publication check. Optional `run_video_managed` is a separate fixed pure/fake managed92 campaign, not a phone operation or a build-only claim; optional matching pair compilation is also separate. All actual runtime/campaign results must bind exact published SHA and retained report inputs before credit.

## Final source fingerprints

- `desktop/native/RetainedAdbProtocol.cs` SHA256 `74d9e0d3614f055e8cb82b0db328b950cf8c8988929e51fc6e0077918a960ac0`
- `desktop/native/RetainedVideoSession.cs` SHA256 `ba1f50cc58fedf13675b935188b10ae991bf73bc50c8c1440dd79818b03199b6`
- `desktop/scripts/build-manifest.mjs` SHA256 `0907f8cb84d9feef5dde0d3d1e1ead701c020a351d47f51a01f994042aff547d`
- `desktop/scripts/check-module-graph.mjs` SHA256 `eee91a852a2cdd504b03b8def7de12059f788d5a0a4210ee8b61242b39ac6cdf`
- `desktop/scripts/quality-tool.mjs` SHA256 `fc6952ae31920be1fff263709f5508659bcbc653bad5d1cd90d6216107486f51`
- `desktop/scripts/retained-managed-fixture.mjs` SHA256 `1e7dfadd3dec0a49fbae1920388804cd8b125881bef832aec7b1ef4e7d4604b7`
- `desktop/scripts/test-batches.mjs` SHA256 `ca48f6d5aaba156129c04cf3f5b53ec88d287716bd11263011d79f4cf00a40d0`
- `desktop/src/h264-video.ts` SHA256 `f2c9e04c43a7517a105a3db9991d62b2841c7bc56806d74abf2e0d50df3a9b2a`
- `desktop/src/main.ts` SHA256 `7033789bf3453aabd001f87f7cda208a2652bc95c2e70075c2da17f1d6add353`
- `desktop/src/main/adb-discovery-service.ts` SHA256 `d4efca36fc2f7edd407b2348c3684bd8e1c23655bccd596a5bde7d875d3ceea6`
- `desktop/src/main/adb-host-adapter.ts` SHA256 `a25b910094b2080554d4a84e994dde99adbb9ff01b176c0b26a41723799d28eb`
- `desktop/src/main/adb-host-bridge.ts` SHA256 `f10203b7d2708091899c7d2ef67a1ed65df655673d922cf61f81d483b1adb432`
- `desktop/src/main/adb-host-factory.ts` SHA256 `ccad203fbcff163e45b6aff024ffbc6ecb336b52dc908b813932fac865d97849`
- `desktop/src/main/adb-server-service.ts` SHA256 `684136acbaf747f9ab87f807a997a44323ef621013831c6c08bbb46ad90d7386`
- `desktop/src/main/discovery-session-service.ts` SHA256 `ed410161b9140565215e06a95c11bd38c013a2a2eb3a7a126105c45ea3b98cbb`
- `desktop/src/main/owned-video-consumer.ts` SHA256 `d70579ad8bd7e7daacdadc5ab3208f2a42e98fcde33e7b674b657d5cf1f15823`
- `desktop/src/main/video-contract.ts` SHA256 `aac3c6e7aa53d5df7faf5b34515894d14df636d994fd56663f02858a89a1b062`
- `desktop/src/preload.ts` SHA256 `ba654049bc2dc5bce0fde9f5050db3c99ce11ffc68b7b9c4c00e577400446a44`
- `desktop/src/renderer.tsx` SHA256 `e8f6dac974a240a977be6d04993b76d43b01e2801b43189b52a877f9c57f9b4b`
- `desktop/src/ui/ui-shell.tsx` SHA256 `5019d8c6c49870ed489fd30bb6dbf735ae116266de7f21c348a54eabf4d3f8bf`
- `desktop/src/video-decoder.ts` SHA256 `d222d479a56c2156a68eaf08c6f43fc53427e589a354b3e358157d6cfc775c89`
- `desktop/src/video-media-contract.ts` SHA256 `de985b724e344f7d5bc043e0955071fef8a14cc2cf155cacdf5a6bf610e5e1bc`
- `desktop/src/video-stream-bridge.ts` SHA256 `6579bc05e6608ce9dcf4a6d7fcbe79c2b7785af7d14db631611ddde226afeb2c`
- `desktop/src/video-stream-client.ts` SHA256 `3aac068a3e57437fa2890b365d41f5aa4e731637b7525c41d86e363b55ffe7ad`
- `desktop/src/video-stream-contract.ts` SHA256 `4eb11124519c0d5e8423ad53bb65bf15a3124bf002aa59bcfa3bc8113bf3b687`
- `desktop/tests/adb-discovery-service.test.mjs` SHA256 `584996917473dea85ca1321f787d600252d7da5820d884b5d30d3a31a670e949`
- `desktop/tests/adb-host-bridge.test.mjs` SHA256 `495d63489ff7633636b39472c96885f5b7553bdf862bcb9e9c047dff8796795b`
- `desktop/tests/discovery-main-integration.test.mjs` SHA256 `b64a018493ee5e9b8fcea0f0eb08762253303df7f8d3b71aeeebc957ea917b73`
- `desktop/tests/discovery-session-service.test.mjs` SHA256 `f87a472e39912d5dd722474250a4b92018e8dd487183df37ad63d3d291599ed7`
- `desktop/tests/fixtures/RetainedAdbProtocolFixture.cs` SHA256 `b94eca7ae5ce8e425a4ab0959e6d1a65004be8abcb3386d7ca727cb81ce431e6`
- `desktop/tests/module-graph.test.mjs` SHA256 `29c50844130e270a81d1eccca8800f72c79b4578e062429323c260a511e8aca5`
- `desktop/tests/owned-video-consumer.test.mjs` SHA256 `8f63b37b9c77d68c6ba8cca655c66e39bf1d70a41ad6a1fbc70e1a964c15e573`
- `desktop/tests/quality-tool.test.mjs` SHA256 `73818660a530128d198a513ce62acf3c9e8c486a2da20112e764a034df46e3a4`
- `desktop/tests/retained-adb-protocol.test.mjs` SHA256 `8cc0c7659861254cf786ac891da8bf7f8955821c82bfdd267ac1e8808f018448`
- `desktop/tests/retained-managed-fixture.test.mjs` SHA256 `7755d89fad5fa396c3690fb7944f13a276fe861fe3762688e81314e340033735`
- `desktop/tests/runtime-version-integration.test.mjs` SHA256 `0174f2de620c5464c567bb71279f4dfc90f3682e2be2da6f321671b105b66fd1`
- `desktop/tests/settings-preload.test.mjs` SHA256 `3b519b36b70c9fca336d575ade202c8c94e0da2354d034067d1e28965321a284`
- `desktop/tests/settings-renderer.test.mjs` SHA256 `2b12d6f8a3c097d81552fb90e2ef63706e84d871a5eee56a0c21c5e761f8f06b`
- `desktop/tests/ui-shell.test.mjs` SHA256 `78a4ffcb601a1ea2506985a3c6d55ec0a1de207185df867c92acb73ba17e3cf3`
- `desktop/tests/video-decoder.test.mjs` SHA256 `2f1ef73af8dc68cad8eab8c8ce9ac4e7d65e0f54068df58168957a1d49280208`
- `desktop/tests/video-media-contract.test.mjs` SHA256 `5912e1c571ae186ef3f11bdfb34fd0a591e0dc6a898da9b04d6834614a8e5fce`
- `desktop/tests/video-stream-bridge.test.mjs` SHA256 `d092a59831b9951d88677fb0c8c3e0d2f334b57642e35eaebadb48e253726937`
- `desktop/tests/video-stream-client.test.mjs` SHA256 `90c71b850b60dbf4ce11fd719eaf15f27d73b07c313c2717e0fc689624b8ad80`

## Retained final log fingerprints

- `p303-restored-final-source.log`: 47 bytes, SHA256 `f7b0bd725bdb844812dfcd3d90a46874a09441352fd49afa75722111e702cb2e`.
- `p303-foundation.log`: 137 bytes, SHA256 `42d9c87caa146937ca855fc88d396f1634db577b3dba0aae72e1a3906ca33729`.
- `p303-python.log`: 1518 bytes, SHA256 `bd74c2d7d1183e0859b7baa2b059bae5b76e6ac1ca7c3352bc802c624d87dcb4`.
- `p303-prekey-regression3.log`: 2508 bytes, SHA256 `9ffb86639555d7e9c11a6d921f0d560efcf9d11d4392dfa2f8952fea1e9e1d6a`.
- `p303-shutdown-regression4.log`: 790 bytes, SHA256 `86a175c0a0a27b43d17b882a433bdbbad16fdb0bac35d796ec9369c3e0eaf041`.
- `p303-batch19-diagnostic.log`: 20536 bytes, SHA256 `e368876b71f98b24c02e8c820059dcf6b33b678d4e4fb317f2c91b303c767e87`.

## Actual hosted software milestone — 2026-11-02 15:16 UTC

Published `phase-03` commit `6c755b7288f68e65b56c62964195de88f112e614` preserves parent `2b02ef7cbcfdf46b99e67c78570c6239a404dc23`. Its tree `2ccae8343103183dd099eddfe01a37b4a8e28abb` exactly equals local `143437958ec9a25cba69948c56db77ce6944f080`; all53 changed blob identities were checked, expected-head/nonforce ref update and final remote readback succeeded. Local and public lineages remain intact; main was not changed.

CI41469006549 on that exact public SHA completed SUCCESS. Source job125357327580 emits actual1752/1752, DESKTOP_SOURCE_CHECK_PASS, foundation109/109 with zero fail/cancel/skip/todo, Python375/OK, PHASE03_SOFTWARE_ONLY and SOURCE_JOB_NO_ADB_EXECUTION. Exact retained job log100482bytes SHA256 `951cb7b8c89895d8b7b427b66c1c7d3e42999d3e00c58be474937a7ffab931fa`. Separate jobs API confirms15 optional jobs SKIPPED, including managed92 and pair compilation; skip is not inferred from source log absence. Independent coordinator audit confirmed exact run/commit/tree/log markers. No device, real decoder, native managed92 or retained pair campaign occurred. This closes the source/build milestone, not04.A/C actual-output qualification or task acceptance. Record retained here for the next functional milestone; no status-only public push.

## Next bounded qualification increment — 2026-11-02

The independently reviewed [actual-decoder source entry](../phases/P3-DECODER-OUTPUT-QUALIFICATION-PROPOSAL.md) was adopted at 15:25 UTC. Verification-only source now generates two self-authored fixed AVC I_PCM frames, compiles the real production bridge against the unchanged preload/renderer/decoder, and defines an opt-in disposable Windows Electron pixel/contain-placement campaign. Production runtime pair pins and all device/provider gates remain unchanged. No actual decoder output has yet been observed for this increment; source generation/parser tests are not decoder evidence. Fixed ledger remains source26/100, integration22/100, formal acceptance0/19.

Final source checks: authored fixture/schema/owned-file tests18/18; source-boundary/mutation tests8/8; full desktop aggregate1770/1770 with DESKTOP_SOURCE_CHECK_PASS; foundation109/109; Python aggregate383/383; production build and verification bundle PASS. The initial aggregate rejected stale exact workflow job/count assertions (batch11 output exceeded capture bound); the detailed isolated failure was retained and exact opt-in/default-false mutation tests updated. An initial direct quality test rejected inherited NODE_PATH as designed; sanitized quality13/13 PASS. The second aggregate exposed the retained-rollback workflow’s separate historical375-count assertion; that test was updated to383 without enabling its suspended campaign. Final uninterrupted aggregate passes. Independent implementation review CLEAR at15:56 UTC followed three repairs: known-retired failure-path owned cleanup, observed non-neutral letterbox pixels plus stable actual tile/label geometry, and explicit Stop causally stopping the producer before late stale-media refusal. The source fixture selects exactly its synthetic tile; a regression invokes the actual extracted fleet reply through production validation. No runtime result or additional04.A/C integration credit is claimed. Only the separately selected opt-in campaign may establish actual decode evidence.

Final local evidence (not uploaded runtime evidence):

| Check | Log SHA256 |
|---|---|
| `p303-decoder-reviewed-source.log` | `3b2f4a5b6a5287c2c9d60d991acc4fefda6d837dc6e8ffeb1a45347286e3c8e4` |
| `p303-decoder-reviewed-python.log` | `ef6430563c388bd768fb111c5e373cbfcede2bf85315c9eb6596c8eb30b80114` |
| `p303-decoder-foundation.log` | `42d9c87caa146937ca855fc88d396f1634db577b3dba0aae72e1a3906ca33729` |

### Reviewed qualification source identities

No generated Electron binary, fixture clip, profile, screenshot or personal data is committed. The actual captured image remains only in memory; evidence contains bounded synthetic pixel samples and numeric rectangles. Native bitmap color order is not assumed: content is neutral grayscale and the existing V9 letterbox gradient is non-neutral.

| Source | SHA256 |
|---|---|
| `desktop/verification/build-video-decoder.mjs` | `bce0a8522f5eab6d067b3bd6271acb39d5b3965bd5de8c8fc4efa6e3fff0959f` |
| `desktop/verification/video-decoder-contract.mjs` | `c775de66b31fdc8c6c8d370fce57461381628601182523231992475471725aa6` |
| `desktop/verification/video-decoder-contract.test.mjs` | `bafbeca331114991d0b947d376bc5e00d4b8fbb1ddd0489098c80f2028ab0a2a` |
| `desktop/verification/video-decoder-control.mjs` | `59ccc2e7772b6c25d8bc369a832a5137d1475471ce424f0ce10cd334557a9f6f` |
| `desktop/verification/video-decoder-control.test.mjs` | `c8849f883bc3f0923431a75f5ef6138f9f58ac1094c21cf6c084a3c699039507` |
| `desktop/verification/video-decoder-fixture.mjs` | `7f339972fc5e3ccefd0d4a9b24a3b009f891fa1df714f9dcfeeb8856f00af4b8` |
| `desktop/verification/video-decoder-fixture.test.mjs` | `7db65a5f3d41ae508543559a856565ca7e751dc9d696f7e48cbefc3247173baf` |
| `desktop/verification/video-decoder-probe.mjs` | `92ae01b2f3abce2c0d9d03ab10e69068ea4c65b4bddb9cc7bb556ca2620bd359` |
| `desktop/verification/Invoke-VideoDecoder.ps1` | `a0226f950bf998d4667a937f79057f7d4f0501b4ed1cc1e502e44c20e8d41b66` |
| `desktop/verification/validate_video_decoder.py` | `180d28fc7b74d0c72ee3df9422b72128674eae68edc412a1736b3b2fab135150` |
| `desktop/verification/test_validate_video_decoder.py` | `e9ceacca20a23843c32de820dcda0a8cc84faadfd447483eb9b3ed4eab3fefff` |

### First hosted qualification gate and fixture-only repair — 2026-11-02 16:10 UTC

Local `24a6b214e900db5cf6fd070e3631bdaa476b74e8` was mirrored to public `95100941918e854a4e8836e3a688a6262b761c6a` with exact tree `785f558136739acc11f81bd2c3a10536db28d881`, preserving public parent `6c755b7288f68e65b56c62964195de88f112e614`. CI41477622071 **FAILED** its source job: desktop1770/1770, verification compile/PowerShell syntax and foundation109/109 passed, but Python382/383 passed with one error in the new temporary-tree positive fixture. `validate_tree` correctly rejected noncanonical `file.resolve() != file.absolute()` at line196; real repository source validation passed. The decoder job was SKIPPED by its dependency gate, so actual decode remains NOT_RUN. Failed hosted log retained locally as `p303-decoder-hosted-failed-source.log`, SHA256 `a0519f64bdb633f63c70ffefebe0414ecddc6345edd6b10c57bd0aacecd124dd`.

Repair only the test-owned temporary root with `resolve(strict=True)` before fixture construction; the strict validator is unchanged. Windows TEMP can have an8.3 alias spelling. The test emits fixed, path-free alias-observed/alias-rejected witnesses when that condition actually occurs and still requires the uncanonicalized alias to fail validation. This does not relax the real source tree or skip link/size/missing-file negatives. Independently reviewed repair CLEAR; affected8/8 and full Python383/383 PASS locally. Current test SHA256 `06fb04b93cbad417eb7e09dec2e60471bf9859057903961c906e37df63849b54`; validator remains `180d28fc7b74d0c72ee3df9422b72128674eae68edc412a1736b3b2fab135150`. Probe/runner/contract/bundle identities and bounded synthetic-only campaign scope are unchanged. No new acceptance or percentage credit.

### Actual qualification failure and bounded diagnosis repair — 2026-11-02 16:30 UTC

The fixture-only repair mapped local `ef95e9237a3e836668537bd7d8503cbe37bc6db7` to public `e563161a9425f12cc6009d48e2ade221842e7945`, exact tree `3a34608ec9f01eff883966ae77c7e6767acdce8f`. CI41479135705 source job125392489409 passed1770/109/383 and actually emitted both fixed TEMP-alias witnesses. Its separately opted-in actual Electron qualification job125395027150 **FAILED at DECODE**. Original success-only artifact gating retained no process/pixel/cleanup JSON on this failure. The fixed stage log cannot establish which decode checkpoint failed or certify child/profile cleanup; do not infer either success or a specific decoder defect. Runtime failure log SHA256 `4d64b518397d0001d0841b8dfcd0ed5b02b0970bc9258cb7b0546ca213785d4d` is retained locally. Managed92 and all15 unrelated optional jobs were SKIPPED. Ledger remains26%/22%, acceptance0/19.

The reviewed diagnosis-only repair adds a fixed failure-stage enum, fixed last-renderer-state enum and exact case booleans only after source/control binding. The owned supervisor retains this diagnostic only after confirmed decoder child retirement and before profile cleanup. A strict <=16KiB publication contract permits sanitized supervisor-only uncertain failures but refuses diagnostic/result extraction without a nonnull retired process, contradictory directory-cleanup claims, unknown/private fields, altered heads, arbitrary state/error text or false PASS. The workflow always validates, then uploads only the single exclusive sanitized JSON after its written marker; raw stdout/stderr, file paths, profiles and images remain excluded. Probe/production pixel criteria, normal sandbox, decoder implementation, production native gates and custody requirements are unchanged. This is an evidence-guided diagnosability repair, not a blind rerun or a claimed decoder fix.

Independent implementation review CLEAR after the retirement-consistency correction; targeted24/24 JS and8/8 Python source/mutation tests PASS. Final source/build gate precedes any approved retry. No new integration credit is inferred from diagnostics.

Final frozen diagnostic source gate: desktop1774/1774 + DESKTOP_SOURCE_CHECK_PASS, Python383/383, product/verification compilation PASS. Source log SHA256 `0f6cf992c4344ca9c8986fbb946c8ec7813633dace9e2777998a34db5d185820`; Python log `cf38ef7559bd8d00820d778f5d090694b0ffd10dfcb11522170161ab4ac5cf73`. Independently reviewed final source identities: probe `0abe1d26e33cd1afc888a4329adc4cc07220b99d5188a05e4929ea5192554850`, runner `96fc6bdd268c6300fc69cf21f114aa13f5de9c92107633b027006a937a6cbb68`, contract `0fd84b1fb138e33473fd1c63b6f671e0d74f749152aa10133c1e6c9c97c8e6a9`, control `52579653ae81c2afa62655353ef5676ce092fbdf243f9e541d70c19896e0884c`. Verification bundle `4003e7d5f7b6de0ac6e92bf5787b2891f5235fdc67173cb8f57367a38301ace6`. Runtime retry result remains pending; these identities supersede the earlier qualification probe only for this bounded diagnostic increment.

### Source-bound asynchronous decode failure and fixed reason categories — 2026-11-02 16:57 UTC

Diagnostic milestone local `77b4faf1e9db09e8be2e138906a140d8c7244b18` mapped to public `572468c2419e758004c1586a6e8ddcb4c9c6d988`, exact tree `31279a5fa9eea4c353f6924fd26665eb210fdffe`. CI41483227818 source1774/109/383 PASS; actual qualification job125408498247 FAILED. This time the strict sanitized artifact13160772415 was retained (ZIP SHA256 `23b3e3f95b1d559979613ec1e68e3fe24877facb94b01dfc8e317fc5dcb90259`) and locally revalidated against the closed schema. It proves normal secure origin/sandbox, explicit Start and actual MessagePort READY, followed by LANDSCAPE_OUTPUT / DECODE_FAILED / STOPPED with no qualifying pixels. Process NONZERO_EXIT1 had confirmed whole-tree retirement, no truncated capture, and confirmed owned directory cleanup. Bundle/source hashes match the reviewed diagnostic bytes. No decoder-output or orientation credit is earned.

The failure occurs after the real KEY CONSUMED acknowledgment; synchronous config/parser/submission exceptions would fail earlier. Async native decoder error, output identity/geometry validation, draw/acknowledgment failure and no-output deadline remain possible; no buffering hypothesis is treated as established. A local installed-FFmpeg EOF-drained decode reported expected synthetic pixels, but its package provenance was unresolved: corroboration only, not vendor-attested or streaming/Windows evidence. No unrecognized executable was added to the project, no decoder engine was substituted and no new media frames were introduced.

The coordinator and independent source-entry reviewer adopted the [fixed failure-category amendment](../phases/P3-DECODER-OUTPUT-QUALIFICATION-PROPOSAL.md#7-bounded-failure-category-observation-amendment--2026-11-02-1651-utc). Implementation adds only the finite first-terminal `failureReason` snapshot field and existing renderer status suffix. Normal Stop stays null; early owner-unassigned status is honestly UNOBSERVED. All budgets, original predicates/evaluation order, stop transitions, payload checks, geometry and pixel tolerances remain. Independent final implementation CLEAR and27/27 targeted tests PASS distinguish native callback/submission/configuration, output identity/geometry, draw/ACK/close, watchdog/clock/cancellation and first-reason latching. Final full gate and exact reviewed retry result are recorded separately; acceptance remains0/19.

Final fixed-reason gate PASS1779/1779 + DESKTOP_SOURCE_CHECK_PASS, Python383/383, production and qualification builds PASS. Reviewed decoder SHA256 `e75a638d4ca028939f354e9e47d6b1d710440b4e5046a0e7d3bf60c9b397e1ba`, renderer `31d2653236ffc5beb0546efb6cd0bf3dd020b16e1c0bc70b7176863fafb861eb`, qualification contract `d7e0e19cf9f35428d16e51a982fb4395f3f4e84115b7cd9d47ae9ef72f76a0e0`; verification bundle `b9bd1ef755e43c55de348771433bd630d4fd77d2610efab2824403ed3b545a23`. Local source/Python log hashes `b2103375c31f1943569870d6f23e3ad7353d7fca9e96c9fc0f9fc213f0825c6e` / `fb2c388d3ca029209430acdefcd8aca98384ef4885c18fbf7b9fbac1e43d0de8`. Coordinator authorized only the same bounded diagnostic retry after this exact gate; no second-frame change or broadened campaign.

### Actual output geometry failure and standards repair — 2026-11-02 17:13 UTC

Local `aeae36c749ff8582c23c620daade39669fff65c3` maps to public `be21758271b1d71eda049dafd1d2b6da70ff3a23`, exact tree `4c6a2997e26c2feeedf38fc24306a628f84abe30`. Scoped run41486912037 source job125419586410 succeeded; synthetic runtime job125422125108 failed. Artifact13161309940 ZIP SHA256 `872b36320a12c5e5fd5223e384a79fe2791c188718a3addfe7de6b807c233240` reports LANDSCAPE_OUTPUT / DECODE_FAILED:OUTPUT_GEOMETRY / STOPPED, exit1, actual process retirement and owned directory cleanup true. The decoder output callback was reached: buffering/watchdog/native-error is not the observed failure category. No pixels qualified. The artifact did not capture the exact offending geometry scalar; padding remains unmeasured, not an established actual cause.

The [adopted visible-surface semantics repair](../phases/P3-DECODER-OUTPUT-QUALIFICATION-PROPOSAL.md#8-videoframe-visible-surface-semantics-repair--2026-11-02-1713-utc) replaces SPS allocation equality with exact visible content containment and bounded native allocation, retains display/SAR and default orientation checks, and leaves Canvas crop handling to the API. Fixed bounded geometry failure facts accompany the same sanitized custody path. Source tests and final review/build outcomes follow separately;26%source/22%integrated and0/19 acceptance remain unchanged.

Final visible-surface source gate PASS1784/1784 + DESKTOP_SOURCE_CHECK_PASS, Python383/383, production and qualification builds PASS. Independent implementation review67/67PASS. Initial aggregate TYPECHECK_FAILED because the pinned DOM declarations lack rotation/flip; corrected only the type boundary to optional unknown fields, retaining explicit runtime0/false checks and no inferred capability. Final decoder SHA256 `ef132c46cd6a7d57e01eac22ead35410be41f2717b7bba10e74bc33c9b74795a`, renderer `856ee224b106fccf7e1ad3e17649ff78d5b4c60928dad9f31af04bbb9daa68dd`, probe `ce35fa00fcda50bb7c249516290174a4a74412fc8e1643e11e7f01a1e6d9ca80`, contract `b8ed12792318f57bfa9a24dffd6f9ffba337160c020c183834010443bc553c71`, built probe `8bccca57403d16e871641cf8ed26e4494bcb295da8bb6e606e14498271e50476`. Source/Python log hashes `d4d083a0e1e97ba32d34ebb90225d4929f4f55ee1c07052d198823582aa0c83a` / `acdfdd9c7c7476d80092cea45085eedc4076c13a1fb091690be576df992dd2aa`. Coordinator authorized same bounded synthetic retry after these gates; actual result remains pending, no acceptance credit.
