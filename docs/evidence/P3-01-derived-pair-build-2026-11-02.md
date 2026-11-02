# P3-01 — derived server source and paired-build preparation

**Active source/build preparation; no current permission stop.** The four-file download blocker was resolved by the user's explicit 04:30:57 UTC approval. No phone, server/profile, deployment or stream execution is authorized or claimed. The paired-build source-entry contract is independently CLEAR and adopted; the implemented controller/wrapper/publisher have completed independent source/runner review and stitched source validation. No derived server build or binary admission is claimed yet.

## Exact resumed acquisition

The earlier tool denial stopped the exact four Java downloads; no alternate retrieval was used. After the coordinator forwarded the user's explicit approval, the original destinations were checked absent and no prior matching fetch process remained. One retry at 04:32 UTC succeeded from the same official scrcpy commit `a60891aea193d92e7e5c3942700eca63f9d19a5f`: Options.java 23,888 bytes, Server.java 10,937 bytes, DesktopConnection.java 6,221 bytes and Streamer.java 8,093 bytes. These are source bytes, not an executed or installed artifact.

The minimal [derived patch and provenance](../../desktop/video-source/README.md) changes exactly Options, Server and DesktopConnection. It requires the private nonce, refuses the named unsafe/framing configurations, emits an exact flushed READY line through the retained foreground stdout descriptor after bind, and prefixes the accepted video connection with dummy zero / AUTOVID1 / 32 nonce bytes before unchanged stream framing. The Java guard covers the named safety/framing subset; the existing closed C# formatter supplies the complete admitted option set. Streamer is byte-unchanged. No raw nonce is logged by Auto; platform command logging is not excluded.

Independent source review reconstructed every patch hunk against the retained originals with exact context/counts, checked every original/derived size and SHA256, and confirmed all output pins remain null. Patch SHA256: `caaadaecd4b559ef8f980e5eae84c47c9f7174a8d916f8fda05612fed7ff6f8c`. This is source preparation, not Java compilation or Android compatibility.

## Complete source closure for build preparation

One official pinned source tar was retained, without extraction or execution: 513,746 compressed bytes, SHA256 `a0d699fc7388b8252416c49e6293639de39ab76a03e7302ddced56c284d45200`. In-memory inspection established 2,242,560 tar bytes, the exact commit root plus 446 entries, and 387 regular blobs totaling 1,910,664 bytes. Every path, byte length and Git blob identity matches the official pinned tree `eb740a30415199219479610728420ebcfd8a9064`. The four earlier Java files are byte-identical. Traversal, duplicates/case collisions, sparse/special/link entries were refused.

An initial inspection-only assertion incorrectly expected tar permission modes to equal Git modes; actual codeload regular/directory modes are 0664/0775. No second download occurred. Transport modes are recorded separately and never grant filesystem authority; materialization must use fresh owned restrictive files. Exact executable-bit correspondence, member identities and commit PAX comment were retained.

Selected source/provenance closure: 95 files (91 Java, two AIDL, LICENSE, manual build script), 454,057 bytes. Its canonical SHA256-bound manifest is 24,823 bytes, SHA256 `f96d6623e1e7ae129a398d8886a5676b47e85b64c40075e5740d9cbf7f036e29`. Full verified manifest is 87,054 bytes, SHA256 `94c62a3f7586e56da49e4a66612e0860d7ca4d8efdca46f4673a7dc195e7749e`. Root README license attribution is separately bound through the full manifest. No archive or upstream binary is committed to the public repository.

## Supported build path and remaining evidence

Pinned upstream [manual build](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/server/build_without_gradle.sh) supports AIDL → javac → D8 with Android platform 36/build-tools 36.0.0 and Java source/target 1.8. It avoids Gradle/AGP dependency resolution and intentionally bundling their Kotlin dependencies; actual output inspection must confirm the resulting class closure. The generated AIDL and hidden-API stub are payload classes, not merely compile-only inputs. This route is not claimed byte-equivalent to the official Gradle APK.

The [adopted paired-build contract](../phases/P3-DERIVED-SERVER-BUILD-PROPOSAL.md) specifies one controlled server build plus the complete five-source Windows consumer DLL, using actual preinstalled tooling and existing owned process supervision. Fixed owned JVM home/temp and disabled annotation processing are explicit command deviations. No SDK installation/license acceptance, binary upload, DLL/DEX loading, app_process or device execution follows. Missing tools refuse; a first observed output hash is evidence, not automatically an admitted pin.

Actual tool versions/hashes, compilation, output/DEX/PE inspection, cleanup and canonical reports remain NOT_RUN. The earlier [v7/74 managed proof](P3-01-owned-video-consumer-source-2026-11-02.md#actual-hosted-and-controlled-managed-result--0403-utc) remains exact historical evidence for matching host sources, not a derived Java build. P3 software-checklist coverage remains 1/19 = 5.3%; technical acceptance remains 0/19.


## Implemented compile-only source boundary

The source packet now contains one fixed controller, Windows process wrapper and strict publisher. The controller verifies the complete upstream archive and selected/derived sources, measures the actual preinstalled tool closure, produces five absolute fixed command plans and statically inspects the resulting DEX ZIP and AMD64/PE32+ managed DLL. CLI metadata structure is checked without loading the assembly; no observed assembly name/version is claimed by the fixed public schema. The wrapper uses the unchanged bounded NativeProbe supervisor, original 290-second work / absolute 300-second cleanup horizon, executable-directory cwd and owned JVM home/temp. The publisher cross-binds actual source/tool/generated/command/output bytes and eight JSON manifests, stages only JSON, and requires actual scratch removal before clean PASS. Deleted outputs are not deployable bytes, and their hashes cannot recreate or admit a later artifact.

The new `derived-pair-compile-development` workflow is default-off, phase-03-only and depends on successful source CI. Only explicit `run_pair_build` or `[pair-build]` selects it. It binds checkout HEAD/tree to the actual workflow commit, selects preinstalled Python, syntax-checks the fixed PowerShell entry, and uploads only strict JSON after the publisher's WRITTEN marker. It does not install tooling, accept SDK licenses, load output binaries or invoke a phone/server/socket. The existing five native sources, supervisor and current v7/74 pins remain unchanged; that earlier controlled fixture campaign is not repeated just to compile the consumer DLL.

Independent implementation review identified and authors corrected five concrete integration issues before any campaign: isolated Python sibling import, unexpected-file admission into cleanup, exact owner-token/root-identity checks during deletion, streamed ZIP data-descriptor parity, and aggregate directory-plus-file tool inventory accounting. Causal tests use actual bounded byte parsers and owned synthetic filesystem compositions; they are not compiler/runtime or physical-device observations.

## Author validation attribution

- Wrapper/workflow: 11 distinct static/source cases passed after exact regex-spacing quality fixes. Earlier eight-case and subsequent eleven-case runs overlap. Formatter-only success was not lint proof: parent quality found 14 warnings in the new workflow-regex assertions; these were corrected without changing the gate predicates.
- Controller: 15 authored cases, with initial 14 passing and two final affected cases passing with overlap. Actual synthetic producer → validator → static-output → owned-cleanup composition passed; no compiler or downloaded payload ran.
- Validator: 16 distinct cases passed, then the strengthened existing isolated-Python/streamed-ZIP/CLI case passed. This is not 17 separate cases. The same non-seekable ZIP bytes exercise producer and publisher; unsupported flags and rehashed missing CLI metadata refuse.
- Parent's first inventory command encountered the inherited `NODE_PATH` override and correctly refused before quality; five independent inventory-runner tests passed in that invocation. After explicitly using the reviewed clean build environment, 12/13 quality cases passed and exposed the new test's lint warnings. After correction, the 13 quality cases plus two exact workflow-count/gate cases pass (15/15).
- Exact inventory is now 173 registered desktop test paths (one additive wrapper/workflow file), 521 measured quality traversal entries (six new verification files), with the existing two-entry owned-fixture allowance bounded at 523 and rejection at 524. Python discovery measures exactly 320 cases (289 historical plus 15 controller and 16 validator); the workflow and stale/relaxed-count negatives bind that exact count. Product module graph remains 123; no new runtime/UI activation edge is introduced.

The complete Python source suite actually passed **320/320**, `Ran 320 tests` / `OK`, with no skipped cases. The sole desktop aggregate passed its pre-test graph/quality/typecheck/build/demo/manifest stages and first 80 test files, then batch 11 exceeded capture after the existing phase-workflow fixture rejected the newly added closed job inventory and stale Python count. Isolated diagnosis confirmed those exact fixture mismatches, not a compiler failure. The narrow correction preserved old native suspensions and exact new gate/count assertions.

Continuing only the remaining files passed batches 11–13 (**245 tests across 24 files**), then batch 14 exposed a second existing fixture's first-input `default:false` mutation targeting the new pair input instead of `run_video_managed`. Named-block mutation and round-trip witnesses repaired that case and the analogous two new pair-input mutations. The affected existing cases passed **8/8**, the new wrapper cases **11/11**, and resumed batches 14–22 passed **532 tests across 69 files**. Thus all 173 registered files have passing stitched coverage; there is no uninterrupted local 1598-test aggregate claim. Expected hosted desktop count is 1598, not yet observed. The source-capture cap was not increased.

Independent implementation reread is CLEAR on the exact controller/publisher/wrapper after all five substantive findings. Final source/index/hash review is CLEAR at 05:13 UTC; the ordinary source-dependent compile-only campaign remains pending, no actual paired build PASS is implied. The separately reviewed [finer complete Phase3 ledger](../phases/P3-IMPLEMENTATION-SUBDELIVERABLES-v1.md) establishes 8/100 source-covered and 4/100 integrated at the **prior** audited checkpoint, without counting this uncommitted work. This recalibration is not newly earned progress; the old 1/19 whole-deliverable metric remains separately labelled.


## Exact changed paths and frozen source fingerprints

The 23-file packet includes only the paths below. Caches, archive/source originals, compiler outputs, binaries and scratch evidence are excluded. All current native/launcher sources and historical managed pin tables are unchanged.

- `.github/workflows/phase-02-software.yml`
- `desktop/scripts/quality-tool.mjs`
- `desktop/scripts/test-batches.mjs`
- `desktop/tests/phase-source-workflow.test.mjs`
- `desktop/tests/quality-tool.test.mjs`
- `desktop/tests/retained-managed-fixture.test.mjs`
- `desktop/verification/retained-rollback-workflow.test.cjs`
- `docs/PHASE_STATUS.md`
- `docs/phases/P3-IMPLEMENTATION-CHECKLIST.md`
- `desktop/verification/Invoke-DerivedPairBuild.ps1`
- `desktop/verification/derived-pair-wrapper.test.cjs`
- `desktop/verification/derived_pair_build.py`
- `desktop/verification/test_derived_pair_build.py`
- `desktop/verification/test_validate_derived_pair_build.py`
- `desktop/verification/validate_derived_pair_build.py`
- `desktop/video-source/README.md`
- `desktop/video-source/auto-video-nonce-v1.patch`
- `desktop/video-source/source-provenance.json`
- `desktop/video-source/verified-full-source-manifest.json`
- `desktop/video-source/verified-selected-source-manifest.json`
- `docs/evidence/P3-01-derived-pair-build-2026-11-02.md`
- `docs/phases/P3-DERIVED-SERVER-BUILD-PROPOSAL.md`
- `docs/phases/P3-IMPLEMENTATION-SUBDELIVERABLES-v1.md`

| Source / gate | SHA256 |
|---|---|
| `.github/workflows/phase-02-software.yml` | `44b0678747b1ae40f12bcc870846547a69db8b91bfaeafd6e358defe55ab8c58` |
| `desktop/scripts/quality-tool.mjs` | `ccff8a43620c7cea61d81b5c3ae0ea5e963431ae2e7b7fdd73975b5c500f663d` |
| `desktop/scripts/test-batches.mjs` | `0489ff8d0afaa86a83bad671bc4a762a0343c4bf3b53c600804f985e8f511f63` |
| `desktop/tests/phase-source-workflow.test.mjs` | `0ba8d5b507faaf5ec6a1700be581136480ef2fb0518307947a798d375da91e9c` |
| `desktop/tests/quality-tool.test.mjs` | `05110e6803d583a3574a3cc93d30c5e6c71f91f485dfb64e5029794296767bf5` |
| `desktop/tests/retained-managed-fixture.test.mjs` | `a05176ed8fe84fc460d508fb01af5ded49814adb5e2e942124451d04298e09b8` |
| `desktop/verification/retained-rollback-workflow.test.cjs` | `7c7f4bce4ad867a5d72b3b2dd85f879fc82a8a65908eea360345b2352c16855c` |
| `desktop/verification/Invoke-DerivedPairBuild.ps1` | `d28fc606114ebb628c32ed49260f4496e3bde2738910bb6b49dec391b41b482d` |
| `desktop/verification/derived-pair-wrapper.test.cjs` | `ddfa9f072cd785734b4db9cf2883d58ba20406c12aadd2e3fa905d34fc148766` |
| `desktop/verification/derived_pair_build.py` | `3fca5b84ad7192c7dc92005af9eef0cf0cfa59dd1433e01f792e71493b2ebb9f` |
| `desktop/verification/test_derived_pair_build.py` | `d3eb7cce3f58078afb9dcede40525ea277d59f91f75cdcc0e50d251688d44508` |
| `desktop/verification/test_validate_derived_pair_build.py` | `b7adbacc4403dff05ef730e85a92077aa1cf78020e57f71b67234afba6278f83` |
| `desktop/verification/validate_derived_pair_build.py` | `ac010c9a15046487ff776c3b40f3989e5c378dccd0786693ffa68eb2edd8d106` |
| `desktop/video-source/README.md` | `71886a1b4a7a210757da499cebe7bbf55e860bd25cf28b51ceaef1fd0f535d42` |
| `desktop/video-source/auto-video-nonce-v1.patch` | `caaadaecd4b559ef8f980e5eae84c47c9f7174a8d916f8fda05612fed7ff6f8c` |
| `desktop/video-source/source-provenance.json` | `5903269dca4416213e4acb8be7cdf1c637147ed07a00dc9527684b4a8de574a6` |
| `desktop/video-source/verified-full-source-manifest.json` | `94c62a3f7586e56da49e4a66612e0860d7ca4d8efdca46f4673a7dc195e7749e` |
| `desktop/video-source/verified-selected-source-manifest.json` | `f96d6623e1e7ae129a398d8886a5676b47e85b64c40075e5740d9cbf7f036e29` |

Final author refresh at 05:11 UTC: all seven existing graph, quality, main typecheck/build, demo typecheck/build and manifest stages PASS (`/tmp/auto-derived-pair-final-refresh.log`). The product graph remains exactly 123 modules and the unchanged manifest cap remains 64 KiB. Windows PowerShell parsing, five compiler processes and actual output/tool manifests remain NOT_RUN pending the reviewed opt-in campaign.

Whitespace attribution: cached whitespace checking passes for all source/docs except the exact hash-bound unified patch data, whose 14 lines consisting of a single context marker (` `) are required blank-line patch syntax. All 14 were checked as context-only markers; the independently reviewed patch hash is unchanged. No global whitespace rule was relaxed or patch bytes stripped.

Independent final closure at 05:13 UTC is CLEAR for the exact 23-file packet, 18 fingerprints, links, additive test/Python inventory, seven refresh markers and fixed 100-cell reporting baseline. The recommendation covers one source-dependent compile-only campaign under standing engineering permission, not runtime pair admission, artifact retention or any device execution.


## First hosted attempt — source fixture refusal, 05:18 UTC

Public source `b2a7a78771537987a14f236fd26437c2309f045e` / local `4d1d59d59fe3aa2180321b04bc7a250b0f78d617` has exact tree `b91d935c018a109026ba5e9b21ae585cadf17a1a`. CI 41392997482 source job 125108227802 failed in desktop batch18: actual 60 cases, 58 passed, two failed at ordinals27/28, no cancellation/skip/todo. The log contains TESTS_FAILED, not a desktop/source PASS. Foundation/Python hosted stages did not run; the separate jobs API reports the paired compile-only job SKIPPED. **No Java or consumer compiler stage executed.**

The retained source log is 19,464 bytes, SHA256 `e5aaec467322c069e88c1b3b40a3b2c0fb04c5c9a05734632f319920b0977d8e`; independent read-only audit confirms these exact bounded markers. Ordinal mapping identifies the new wrapper test's workflow-encoding positive and named-input mutation cases. Source inspection finds raw Windows CRLF can be converted to CRCRLF by an unnormalized LF→CRLF replacement, while the named-input regex expects LF. The hosted log does not expose a private assertion message; causal local reproduction/correction is attributed separately, not invented as observed Windows internals. No output/capture cap, production gate or compiler semantics is relaxed to repair a test fixture.


The test-only CRLF checkout composition reproduced exactly those two named failures against the unchanged test. The correction reuses the existing `workflowEncodings` normalizer before mutation/variant generation, tests both LF and already-CRLF source, and explicitly refuses producing CRCRLF. Author results: normal checkout 11/11 PASS; synthetic CRLF checkout 11/11 PASS; shared quality check PASS with no diagnostics. These runs overlap the same 11 cases, not 22 distinct tests. A bounded static check of this packet's four changed workflow helpers confirms the remaining raw conversions already normalize LF first or use the shared helper. No new generic framework, compiler/source change, gate relaxation or capture-cap increase was made.

Only the test and two evidence/status documents change in this corrective packet. Expected hosted counts stay1598/109/320; the actual previous host result remains FAILED and paired compilation remains NOT_RUN until the corrected run produces evidence.

Independent exact three-file corrective review is CLEAR at 05:21 UTC, including index/disk identity, the unchanged production/compiler gate and the bounded static-normalization check. The same source-dependent compile-only retry is supported; no new scope or acceptance follows.
