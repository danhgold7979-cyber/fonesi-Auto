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
