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
| `.github/workflows/phase-02-software.yml` | `d0e962f871e921b9b7e4fec7747ae890b8fe355c42dffa892013cec5c12119fa` |
| `desktop/scripts/quality-tool.mjs` | `ccff8a43620c7cea61d81b5c3ae0ea5e963431ae2e7b7fdd73975b5c500f663d` |
| `desktop/scripts/test-batches.mjs` | `0489ff8d0afaa86a83bad671bc4a762a0343c4bf3b53c600804f985e8f511f63` |
| `desktop/tests/phase-source-workflow.test.mjs` | `a79f3e98d457a236226fbf37400384dd9f484e1688cdbdda17bf1f1bfaed74cd` |
| `desktop/tests/quality-tool.test.mjs` | `05110e6803d583a3574a3cc93d30c5e6c71f91f485dfb64e5029794296767bf5` |
| `desktop/tests/retained-managed-fixture.test.mjs` | `a05176ed8fe84fc460d508fb01af5ded49814adb5e2e942124451d04298e09b8` |
| `desktop/verification/retained-rollback-workflow.test.cjs` | `43f1adcf1cf924159264d49eee5581b0bbef861e29af2fa4a36c6d97dc354be9` |
| `desktop/verification/Invoke-DerivedPairBuild.ps1` | `1f92dd122c48d5a8a978e5db34183274d7a6456f9072138c21c5740cf5ae81c0` |
| `desktop/verification/derived-pair-wrapper.test.cjs` | `2c50844f0f9f42ca8b295a9b659eb8ae5ddab7fee192f9adb61f8679e5b1d541` |
| `desktop/verification/derived_pair_build.py` | `44963fca862532237291e6019a8f5818ea56d724ef73bb857b5c9e0d65cf7877` |
| `desktop/verification/test_derived_pair_build.py` | `f7fb49f17743a140db9ca3f8bd0a0e25cf8c3a93ab34c7aedb935f6a70a959ea` |
| `desktop/verification/test_validate_derived_pair_build.py` | `0eeebd9f8fe3ce4a5d97999f7c107f9805e0d4406ea32adef71533426708492e` |
| `desktop/verification/validate_derived_pair_build.py` | `7d2c7fda2c24cecb487ff03fcb86231804936fc6e14bcff903aeb4f1241d99ce` |
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


## Second hosted attempt — Windows Python portability, 05:25 UTC

Public `f0048fd39edb40a6752b2fd025dda8631fa84866` / local `6b190cf77c881b5f15d5ea470d195b5a9c0686ad`, tree `1aab67fc80bd6ea0e22c106e77e5230802ff3b93`, CI41393632505/source job125110153830, now emits actual **TESTS_PASS1598/1598 and DESKTOP_SOURCE_CHECK_PASS**, followed by foundation109/109 with zero failure/cancellation/skip/todo. Python runs the exact320 cases but reports **10 errors**, so the source job is not PASS. The separately observed jobs API reports paired compilation SKIPPED again; no compiler/output evidence exists yet.

The retained log is114,776 bytes, SHA256 `e71c8dccd57a81e91a44f3ca10468ea6174aeb18b864b8d4a1009839b592b697`, independently audited. Seven errors occur in the new controller's path-stat/open-handle identity comparisons, and three in strict canonical path checks on synthetic temporary roots. The log does not identify which stat field differs. The correction must preserve same-API change-time stability, device/inode binding, exact bytes and reparse refusal; it is not permission to discard identity checks. Only test-created temporary roots are canonicalized once, not arbitrary production path aliases. Exact primary-backed Windows/Python semantics and causal correction results follow in the final repair record.


### Exact portability correction

Pinned [CPython3.12.10 `posixmodule.c`](https://github.com/python/cpython/blob/v3.12.10/Modules/posixmodule.c) path-stat handling copies birthtime into `ctime`, whereas [`Python/fileutils.c`](https://github.com/python/cpython/blob/v3.12.10/Python/fileutils.c) open-handle stat retains Windows ChangeTime. These primary semantics explain why comparing the two complete tuples is invalid; the host log itself does not reveal individual values. The controller and publisher now retain **full path-before/path-after and fd-before/fd-after** witnesses (including change time, birthtime, links and attributes), while the cross-API binding compares device, inode, size, modification time, common birthtime and links. Windows birthtime is mandatory, not a fallback. Replacement/change-time/reparse refusal is preserved.

The same pinned `os.open` implementation forwards `_wopen` flags without adding binary mode. The controller's three raw open paths now explicitly include `O_BINARY`, preserving exact CRLF, LF and control-Z bytes rather than text-mode translation. The publisher already uses `rb`. Only synthetic temporary roots are resolved once before constructing fixtures; strict production canonical-path checks remain unchanged.

Author affected validation: **35/35 controller+publisher tests PASS**, **4/4 exact workflow/count tests PASS**, and affected shared quality PASS. The four added causal methods establish the new exact Python discovery count **324**; current workflow/fixture predicates bind324 with no skipped tests. These results do not claim an actual Windows rerun or an uninterrupted full324 local suite. Earlier320 local PASS and the actual320/10-error Windows run remain separate history. Desktop expected count stays1598; no native C#/PowerShell/compiler-plan changes, deadline extension or relaxed ownership gate accompanies this correction.

Independent narrow production review is CLEAR for controller `9317866c0a8e214af5184d5d595c2c9819172adb3300fc711f1987276f676beb` and publisher `e6cae074e387f2bd39119a3ce38fd6f4022792ce4e6dbd329d4d0090174df3a0`, with exact causal fixtures. Final nine-file inventory/docs closure is independently CLEAR at 05:31 UTC; the same bounded compile-only retry remains the intended next execution, not device/runtime work.


## Third hosted attempt — isolated fixture stdout, 05:38 UTC

Public `424826594685305b4791eb912d156bf642a1d511` / local `c2ee359e488d38ad79296effda27fffefbdf02fa`, tree `a329aad042606a2ec601bdefc322c0cc3c45e8ff`, CI 41394717653 / source job 125113456044, emits actual **1598/1598 desktop PASS plus DESKTOP_SOURCE_CHECK_PASS and foundation109 PASS**. Python runs324 with exactly one failure: the isolated helper emits `ISOLATED_STATIC_PASS\r\n` through Windows text stdout while its exact fixture assertion expects LF. The prior ten stat/root portability errors are absent. The separate jobs API records paired job125114436867 SKIPPED; no Java or consumer compiler stage ran.

The retained source log is89,687 bytes, SHA256 `8d0617152bd54a38d8f45db90f3c149cc67e02a94cc28417e204fe0ad663a54f`, independently audited. The fixture now emits its fixed marker through `sys.stdout.buffer.write`, retaining the exact LF stdout and empty stderr assertions. The one affected isolated composition case passes locally; this is not a full324 rerun or production report-format relaxation.

### Preventive fixed JVM command amendment

Before the first compiler execution, the [official Java17 manual](https://docs.oracle.com/en/java/javase/17/docs/specs/man/java.html#advanced-serviceability-options-for-java) establishes that UsePerfData defaults on and its disabled option suppresses perfdata directory creation. Independently reviewed preventive command closure adds exactly `-J-XX:-UsePerfData` to javac and `-XX:-UsePerfData` to the D8 JVM, binding producer, publisher and command evidence. This is **not observed residue from the hosted installed binary**: all three compile jobs were skipped. Unknown residue still refuses cleanup, original absolute budgets are unchanged, and unsupported options fail without fallback. Tool installation, runtime output loading, retained deployable artifacts and device effects remain outside this campaign.

Author affected validation for this corrective packet: controller2/2, publisher3/3 (including six absent/enabled/reordered-option subcases), and exact workflow/count4/4 PASS. The marker case separately passed1/1 before the option amendment. One new Python method yields measured discovery325 (no full325 local rerun); workflow preserves exact325 and no-skip predicates. Affected quality exits0 with two existing informational style suggestions, not errors/warnings. Initial author quality invocation supplied the wrong npm-version argument and refused RUNTIME_MISMATCH before checking files; corrected invocation uses the admitted11.9.0 value. The worker's initial wrong-directory unittest invocation failed import before cases; its corrected cwd run produced the stated3/3. No compiler output, runtime pair or additional implementation-cell credit is claimed. Independent exact ten-file corrective review is CLEAR at 05:43 UTC: all18 fingerprints, index/disk identity, links, exact325/no-skip predicates and bounded scope verified. The same source-dependent compile-only retry is recommended, with no additional task or implementation-cell credit.


## Fourth hosted source PASS; first paired tool-admission refusal — 05:51 UTC

Public `31e376a860b0046d947c91a9c782045f88e771e0` / local `75b35c8616c24711afbbd3b74ea2ada725f52661`, exact tree `ca518e020ad4645b526b9b7bb88cad3902963ad4`, CI41395854688/source job125116896933 establishes actual **1598/1598 desktop plus DESKTOP_SOURCE_CHECK_PASS, foundation109/109 with zero exclusions, Python325/OK under the exact no-skip gate**, and phase03/no-ADB markers. The retained90,312-byte source log SHA256 is `644f579f651e486b1b9f85a89c8d015b72228bcd5fa089c561cd0cccd9ab9b60`; independent audit confirms these emitted results, not echoed commands.

The now-admitted paired job125117836658 passes source binding/PowerShell syntax, then emits `DERIVED_PAIR_STAGE_TOOLS` and `DERIVED_PAIR_VALIDATION_FAIL`, exit1. Its retained20,977-byte log SHA256 is `596b6fe9e0b5474a4617bb12771ae1992d885cd47f7b0c5ad1406ad13b0cc728`, independently audited. The wrapper's actual ordering places this refusal **before PREPARE and all five compiler stages**. The log does not expose the rejected tools predicate; neither a missing SDK nor a particular compiler/tool defect is established. The separate jobs API records sourceSUCCESS, pairedFAILURE, uploadSKIPPED and eleven other optional jobsSKIPPED. There is no WRITTEN report, output identity or compiler-success evidence. Diagnosis retains the exact closed prerequisites; no unchanged retry or speculative provisioning follows from this result.

### Bounded tool-admission diagnostics

Source inspection found no deterministic failing TOOLS expression; the original environment snapshot remains retained after process-environment clearing, so clearing alone is not an established cause. The exact image README linked by the runner log was unavailable (404), not a verified installed-tool inventory. The corrective change adds only a fixed private substep before each existing root/equality/metadata/image/source/context boundary and one closed allowlisted `DERIVED_PAIR_TOOLS_…` marker on that failure. Workflow forwards exactly those13 named alternatives; no path, actual tool value, raw exception or generic exception-text classification is published. Every original tool predicate, tool version, no-install rule, process budget and failure outcome remains unchanged. This is a diagnostic evidence improvement for the same bounded source-dependent attempt, not a claimed tool repair or permission to adopt unknown tools.

Author diagnostic validation: wrapper source-static12/12 PASS (one additive case), including exact workflow marker acceptance for all13 names and refusal of unknown/path/raw canaries; affected shared quality PASS. These tests do not execute PowerShell or tool discovery. Expected desktop count becomes1599; actual current hosted total remains1598. Foundation109 and Python325 are unchanged. Independent exact six-file diagnostic review is CLEAR at05:54 UTC; all18 fingerprints, index/disk identity, unchanged admission and precise attribution verified. The same bounded source-dependent retry is supported.


## Fifth hosted source PASS; SDK root boundary isolated — 05:59 UTC

Public `a535f7c00c59a2c077b987765af055f7487ce878` / local `7d3379abca3877cd8fc31d389ca882b450e96401`, exact tree `f4b34ed960d18800d83cdc8c4276ee38ea60c381`, CI41396802718/source job125119767979, establishes actual **1599/1599 desktop plus sourcePASS, foundation109 with zero exclusions, Python325/OK**. Retained90,309-byte log SHA256 `aa744a16f63f795d6e619b7971a46a6f22ddef09228388b367fdf44b28deff2f` is independently audited. Paired job125120345052 now specifically emits `DERIVED_PAIR_TOOLS_SDK_ROOT`, then STAGE_TOOLS/FAIL. Retained21,215-byte build log SHA256 `64bfa08f664707ef6d85f87d46266902fd555e2b743f1dcaffc6da79d7a45669` is independently audited. JDK root passed; SDK consistency, PREPARE and all compiler stages were not reached. The marker covers saved ANDROID_HOME expansion plus container/reparse checks, not observed filesystem type.

### Fixed Windows2022 SDK installation profile

The official runner installer source documents the physical SDK at `C:\Program Files (x86)\Android\android-sdk`, a SymbolicLink at `C:\Android\android-sdk`, and SDK environment keys assigned to that alias. This establishes an incompatibility between the original alias-based plain-directory check and the documented layout, **not proof that the failed image had that exact link or failure cause**. The reviewed correction admits one named win22 profile: both SDK environment keys must name only the exact documented alias or physical spelling; an alias spelling receives metadata-only exact type/single-target validation. Actual file access, inventory and compiler commands use only the fixed physical literal, never an arbitrary resolved target. Physical root and ancestors must be plain, and complete tool hashes/version/caps remain mandatory. Missing, foreign, retargeted, wrong-type or linked physical ancestry refuses without fallback. No link/directory mutation, tool install, profile/security change or runtime effect is involved.

The explanatory [official installer blob](https://api.github.com/repos/actions/runner-images/git/blobs/853fa25e01caf81ac86ed3b333c9fe3048c52f7e) is pinned at Git blob853fa25e01caf81ac86ed3b333c9fe3048c52f7e,9,813 bytes. The original source comment calls the alias a hardlink, but the actual creation specifies SymbolicLink; only the actual operation is attributed. This is current-source explanation, not a claim that the failed runner used this exact blob.

Author affected wrapper13/13 source-static cases PASS, including exact profile strings, fixed authority path, alias metadata predicates, plain ancestry and mutation/refusal witnesses; shared quality PASS. No PowerShell or Windows filesystem case was executed locally. One new desktop case makes next expected1600; actual hosted1599/109/325 remains the established result. Independent exact five-file correction review is CLEAR at06:03 UTC; all18 fingerprints, index/disk identity, unchanged inventory fences and exact profile refusal verified. The same bounded compile-only retry is supported.


## Sixth hosted source PASS; controller preparation refusal — 06:10 UTC

Public `fe99b9b22baea2c12858146b6cc871bd3cb4fbd7` / local `7bc0be17f838c4c3d186d67137a1d86a2212f2b9`, exact tree `4626042eb500a6e5e04a7d2227ee9b8d259cd642`, CI41397644305/source job125122331816, establishes actual **1600/1600 desktop plus sourcePASS, foundation109 with zero exclusions, Python325/OK**. Retained90,305-byte source log SHA256 `678ee0a1e0ec4b38a7eeb71f78be668fdb14b255d2566b4a53c5affbcd95b0bb` is independently audited. Paired job125123430358 passes TOOLS and reaches PREPARE, then refuses before any compiler. Retained21,159-byte log SHA256 `bd7ea908e7fe9b10fb1c4daf58df97853c87dc1c2f6487f6bd8504e2d6de5037` is independently audited. Elapsed preparation time does not identify which archive, context, tool-inventory, materialization or closure predicate failed. No report/output was uploaded and no bound is raised from timing alone.

### Closed controller diagnostics

The independent reviewer approved one comprehensive diagnostic correction rather than further opaque one-predicate probes. Controller actions retain success output unchanged. A caught refusal may emit one bounded ASCII frame with only source-assigned action, last-entered fixed checkpoint and fixed predicate category, followed by the existing failure marker. No raw exception text, path, tool value, identifier or count is emitted. The wrapper admits that diagnostic only for the requested action and exact complete output from an actually retired exit1 process, with both streams untruncated and empty stderr. Duplicate, malformed or extra output never becomes a trusted diagnostic. Otherwise only DIAGNOSTIC_UNAVAILABLE and actual closed supervisor facts may be shown; no failure predicate is inferred. All refusal codes, admission, byte/count caps, original deadlines, cleanup and no-install scope remain unchanged. This supplies diagnosis, not successful build or artifact admission.

Author diagnostic validation: four affected controller cases PASS plus one overlapping strengthened hostile-value rerun; wrapper15/15 source-static cases and shared quality PASS; exact workflow/count4/4 PASS. Three new Python methods yield measured discovery328; exact328/no-skip gate is retained. Two new wrapper cases yield expected1602 desktop, while actual latest source remains1600/109/325. Synthetic tests cover predicate categories, bounded all-action frames, isolated CLI composition, hostile values, complete-frame/requested-action/supervisor admission and actual workflow forwarding/refusal. They do not claim Windows PowerShell execution or compiler evidence. Independent exact ten-file coherent diagnostic review is CLEAR at06:18 UTC: all18 fingerprints, index/disk identity, exact grammar and unchanged bounds verified. The same bounded compile-only retry is supported.
