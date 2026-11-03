# P3-01 — exact vendor NOTICE evidence capture

**ADOPTED SOURCE IMPLEMENTATION — 2026-11-02 08:55 UTC.** Independent source-entry CLEAR binds pre-adoption SHA256 `f853c1634ad84776154d944c32946787df0f92de441ee5d2cd90652bdb7eae91`; the coordinator adopts the exact bounded source/test mechanism under existing engineering scope. Final exact runner/campaign review remains pending. No legal classification, binary retention/distribution, runtime activation or task-credit decision follows. This closes one missing readable-text evidence item in the [successful paired-build sample](../evidence/P3-01-derived-pair-build-sample-2026-11-02/), without repeating compilation.

## 1. Fixed authority and inputs

Use the existing admitted Windows SDK physical profile and its exact `build-tools/36.0.0` directory. Preserve the reviewed SDK-label/link check; never use an arbitrary caller directory, URL, fallback SDK, recursive discovery or symlink adoption. The historical runner image was `win22/20261026.347.1`; a later image is not asserted identical. Admission depends on the five exact file identities below, not on a version label alone.

The source-owned baseline is the existing canonical evidence files, checked before any capture:

| Baseline file | SHA256 |
|---|---|
| `tools.json` | `15634991ffb5d5c5a4419a62ce6cdceeb8957fc0313587c779c6911f8e241047` |
| `report.json` | `1d9ba8ee1466a138a5c8d0b5166fedd65a3756a5794ff3d7cb76ab17601ad2f6` |
| `dependencies.json` | `052271a1f838628f2421d5fe0c410dbaf203c81e06d69886c3d052a7060a4dd8` |

All three reside in `docs/evidence/P3-01-derived-pair-build-sample-2026-11-02/`. Reuse the prior independent nine-manifest audit: checking these three exact already-audited byte pins, the needed successful report tuples and the five fixed namespace/path/size/hash rows is sufficient here. This is not a new full build-evidence validator or nine-manifest audit. Do not rewrite unresolved license fields.

| Fixed BUILD_TOOLS36 input | Exact bytes | SHA256 | Retention |
|---|---:|---|---|
| `NOTICE.txt` | 1063288 | `2df581726e404bf9f5385107b650f6bf7800945348745ea54b7970d98e816b86` | Exact text |
| `source.properties` | 62 | `7dee6632e9ad6cb111da2bb99d747211e27927061b1276d040bb1d71fded5ebb` | Exact text |
| `aidl.exe` | 3512416 | `266dcf772ad1791b43f1ec5702af2e152d1222b051d3676af4e47006dd47d359` | Hash only |
| `lib/d8.jar` | 17998582 | `4097ff9c46c185c6e7214da7fe9b1befb5adeea5cc9ca349270e0249904f9240` | Hash only |
| `core-lambda-stubs.jar` | 17103 | `2feb8df434cae3218ed9ffe9bae01ddec101d1dc5e12824c4209f61e283e0d3d` | Hash only |

A differing file is a refused different candidate. No search, alternate download, silent replacement or expected-hash update is permitted. Hashing these tools is not execution or whole-toolchain equivalence proof.

## 2. Minimal implementation boundary

Add one fixed evidence action in the existing paired-build verification tooling, with its own narrow wrapper entry and strict publisher mode; reuse `read`, `digest_file`, canonical JSON, owner-marker/root identity, SDK-profile admission and the existing owned process supervision. Do not invoke build `prepare`, `plan` or `finish`, materialize source, instantiate a compiler, or introduce a generic acquisition framework. The wrapper accepts only its existing fixed Python executable binding, not arbitrary source/tool paths or scripts. Source-owned paths and the five-entry table determine all reads.

Use `desktop/.derived-notice-runtime` as an exclusive owned publication base and one `RUNNER_TEMP/run-<UUID>` scratch root allocated by existing `New-OwnedRun(parent)` (context identifies this notice-only scope), each with the existing exact UUID `.owner` marker and captured directory identity. Existing roots refuse; no adoption. Capture only `NOTICE.txt`, `source.properties` and bounded private control records in scratch. Capture and publisher source bytes, baseline evidence and original process-boundary dependencies are hashed/rechecked before the operation and publication. No source/tool writes.

Each input uses existing plain-file/ancestor/reparse refusal and stable handle/path identity checks, including Windows birthtime and same-API ctime fences, explicit binary reads, size-plus-one bounded reads and post-read identity. Text capture requires exact baseline length/SHA256, strict UTF-8 decode followed by byte-identical encode, and no NUL. Preserve all original bytes, line endings and any UTF-8 BOM; no normalization, redaction, repair, replacement-character decoding or extraction of a preferred subsection. Exact hashes mean the publisher cannot accept arbitrary host text. Both text files together are bounded by 2 MiB. Hash-only files retain the existing streaming byte/identity checks and their exact sizes; do not retain their contents.

Use one wrapper monotonic clock from entry: work must finish admission/capture/staging within 60 seconds; retirement, cleanup and publication share only the remaining interval through 70 seconds from that same entry. No command starts without a positive remaining budget; each supervision timeout is bounded by the applicable original remaining interval. No retry or refreshed deadline. A timeout is not process retirement; preserve uncertain roots and prohibit clean publication until actual settlement is known. Fixed failure categories only, never exception messages, host paths, user names, environment values or actual unknown hashes in stdout/artifacts.

### Fixed entrypoints and lifetime records

Implementation files are `desktop/verification/Invoke-DerivedNoticeEvidence.ps1` and its fixed-purpose sibling `derived_notice_evidence.py`; focused tests may be added beside existing verification tests. The Python sibling imports only the fixed repository `derived_pair_build.py` stable-read/canonical/identity helpers through an exact sibling import under `-I -B`. Import must remain inert: no build actions, subprocess dispatch, caller-selected module, URL, source tree or arbitrary path mode. No new general validator/runner framework.

The Windows PowerShell 5 wrapper reuses `desktop/verification/WindowsBoundary.psm1` SHA256 `d796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf`, `desktop/verification/OwnedFiles.psm1` SHA256 `17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29`, and `tools/phase-00/HostProbeNative.cs` SHA256 `b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89`. Verify fixed source hashes before import/Add-Type. Add-Type compiles this trusted process supervisor, not the paired consumer/server or vendor tools. Each Python invocation uses the admitted absolute Python executable and `NativeProbe.Run` with fixed `-I -B <absolute fixed sibling script>` arguments, clean environment, bounded capture and the original remaining budget. Preserve the unchanged supervisor’s executable-directory working directory. No shell command construction or tool payload invocation.

The wrapper reserves base/scratch and writes the only initial scratch control file `context.json`. Its closed canonical shape is `{version:1,owner:<UUID>,baseOwner:<UUID>,scratchRoot:<actual allocated absolute path>,autoSourceCommit:<hex40>,autoSourceTree:<hex40>,buildToolsRoot:<admitted physical fixed directory>,sourceClosure:[{name:<fixed relative implementation/supervisor/baseline name>,sha256:<hex64>}]}`. Context and each private control record are at most 16384 bytes; exact source-closure names come only from these two new implementation files, the reused Python helper, the three supervisor files and the three pinned baseline files. The run-directory UUID and marker token are independently allocated: validate the canonical run-UUID basename separately and bind the actual scratchRoot plus original token/identity. Absolute paths exist only in private context, never public evidence.

| Fixed action | Inputs and effects | Required settlement and next step |
|---|---|---|
| `capture <scratch>` | Marker/context-only initial inventory; validate context, source closure, baseline and five tool bindings; create exclusive exact `NOTICE.txt`, `source.properties`, `capture.json`. At initial capture, record the actual scratch and fixed publication-base `(dev,ino)` identities, never identities first observed at cleanup. Capture record is `{version:1,rootIdentity:{dev:<decimal string>,ino:<decimal string>},baseIdentity:{dev:<decimal string>,ino:<decimal string>},contextSha256:<hex64>,files:<the two fixed public rows>,toolBindings:<the three fixed public rows>}`. | Wrapper requires actual retired/untruncated exit0 with empty stderr and exact `DERIVED_NOTICE_CAPTURED`; otherwise no stage. |
| `stage <scratch> <base>` | Recheck all bindings and text; exclusive base `upload/NOTICE.txt`, `upload/source.properties`; base `staging.json` binds `{version:1,owner,baseOwner,rootIdentity,baseIdentity,scratchRoot,contextSha256,captureSha256,autoSourceCommit,autoSourceTree}`. Copy private context/capture to base as `context.json` and `capture.json`. | Actual retired/untruncated exit0 with empty stderr plus `DERIVED_NOTICE_STAGED`; wrapper records capture/stage process facts. |
| `cleanup <scratch> <base>` | Revalidate exact stage bindings and scratch bytes; delete only known scratch `NOTICE.txt`, `source.properties`, `capture.json`, `context.json`, then remove `.owner` last and the empty root using the original identity fences. No nested scratch directories are admitted. Changed owner/identity or unknown entry refuses before deletion. | Actual retired/untruncated exit0 with empty stderr plus `DERIVED_NOTICE_CLEANED`; wrapper performs no second deletion, independently observes actual absence, then records cleanup facts. |
| `publish <base>` | Require exact private base inventory, source/text/hash bindings, scratch absence and wrapper-recorded process/cleanup facts; re-read/re-hash all five original SDK inputs and the complete captured source closure before asserting unchanged, not merely the staged copies; recheck both staged text lengths/hashes after those final reads, then write exclusive `upload/receipt.json` with exact schema below. | Actual retired/untruncated exit0 with empty stderr plus `DERIVED_NOTICE_PUBLISHED` required by wrapper before uploader eligibility. Publisher’s own prior self-written receipt is insufficient. After actual publisher retirement, wrapper requires the two fixed text lengths/hashes and exact canonical expected receipt bytes (at most 8192 bytes, including current commit/tree) before uploader eligibility. |

`processes.json` is wrapper-written, canonical, maximum 16384 bytes: `{version:1,contextSha256:<hex64>,capture:<facts>,stage:<facts>,cleanup:<facts>,directoryCleanup:true}`. Each facts record is exactly `{status:"SUCCESS",exitCode:0,cleanupComplete:true,stdoutTruncated:false,stderrTruncated:false,stderrEmpty:true,marker:<the exact preceding action marker>}`. `SUCCESS` is the existing NativeProbe success enum, not a synthesized retirement status. The wrapper writes these records only after observing that actual exact successful tuple, empty stderr and exact stdout marker. Any other actual NativeProbe result stays a failure and cannot produce this private success record or public evidence; `UNRETIRED` remains only a wrapper failure category, never an invented NativeProbe status. Private records are created exclusively, not rewritten from partial failures. No cleanup command or later receipt may erase unknown lifetime.

Exact base inventory before publish: `.owner`, `context.json`, `capture.json`, `staging.json`, `processes.json`, and `upload/` with the two fixed text files. After publish it additionally contains only `upload/receipt.json`. There is no broad recursive cleanup: scratch deletion uses the fixed four-file allowlist plus marker-last removal and the original captured identity/owner checks before every deletion. Every stage and publication must retain the same original tokens plus scratch/base identities through the private capture/staging chain; a replacement directory with the same marker token is refused, never newly adopted. After scratch removal, publication requires its absence and the original base identity. Identity decimal strings are canonical unsigned integers (no leading zeros except zero), matched to actual platform stat values without JavaScript-number conversion. Base private records and public outputs remain owned until hosted job disposal; they are not claimed deleted. Failed preparation may retain a known/unknown scratch root and has no success artifact. A missing/late publisher settlement prevents upload even if receipt bytes exist.

## 3. Exact evidence and publication

Successful CI artifact name: `derived-notice-evidence`. Exact public file set:

1. `NOTICE.txt` — exact 1063288 bytes above.
2. `source.properties` — exact 62 bytes above.
3. `receipt.json` — canonical UTF-8 JSON, no BOM/trailing newline, maximum 8192 bytes.

Receipt key order and schema:

```
{version:1,scope:"EXACT_BUILD_TOOLS_NOTICE_EVIDENCE",
 autoSourceCommit:<40 lowercase hex>,autoSourceTree:<40 lowercase hex>,
 baselineReportSha256:<fixed hash>,baselineToolsSha256:<fixed hash>,
 baselineDependenciesSha256:<fixed hash>,
 files:[{name:"NOTICE.txt",bytes:1063288,sha256:<fixed hash>},
        {name:"source.properties",bytes:62,sha256:<fixed hash>}],
 toolBindings:[{name:"aidl.exe",bytes:3512416,sha256:<fixed hash>},
               {name:"lib/d8.jar",bytes:17998582,sha256:<fixed hash>},
               {name:"core-lambda-stubs.jar",bytes:17103,sha256:<fixed hash>}],
 sourceUnchanged:true,inputsUnchanged:true,processRetired:true,
 directoryCleanup:true,passed:true}
```

All keys/order, array order and fixed literals are closed; duplicates, extras, coercions, malformed UTF-8 or mismatched baseline values refuse. Checkout commit/tree come from the actual workflow checkout and must match its bound source context. This receipt asserts capture facts only. It has no license verdict, output-artifact admission, installation or runtime field.

Reuse the existing staging/cleanup separation: exclusive byte-verified copies in the publication base plus a private owner/context/hash-bound staging record; actual worker exit and I/O retirement; exact scratch inventory cleanup with identity rechecks and marker last; independent observation of scratch absence; only then exclusive final receipt publication. `processRetired:true` is derived from the wrapper’s actual preceding process settlements, conveyed through exact private process records and independently checked by the publisher; it is never a Python self-attestation. The final publisher cannot attest its own exit: upload additionally requires its actual retired, untruncated exit-zero success with empty stderr observed by the wrapper. Unknown scratch files, changed markers, partial copy or cleanup uncertainty retain the root and fail. Never derive deletion authority from an arbitrary observed inventory. The publication base intentionally retains the three evidence files for the artifact uploader; `directoryCleanup` means the exact scratch root is absent, not that uploaded evidence has been deleted. Private owner/staging records are never uploaded.

A failed or uncertain campaign emits only a fixed failure category in its bounded log and uploads no purported success artifact. Categories are `BASELINE_REJECTED`, `SDK_PROFILE_REJECTED`, `INPUT_REJECTED`, `TEXT_REJECTED`, `SOURCE_CHANGED`, `STAGING_FAILED`, `UNRETIRED`, `CLEANUP_FAILED`, `PUBLICATION_FAILED`, `INTERNAL_FAILURE`. Do not salvage or publish partial text. Uploader uses an exact three-file allowlist, no directory/glob that can include private records or binaries, with missing-file failure and 14-day artifact retention.

## 4. Source CI and sole campaign ownership

Extend the existing source workflow, not a second pipeline. The new evidence-only job requires the existing source job to succeed, `phase-03`, and either explicit default-false `workflow_dispatch` input `run_notice_evidence` or exact reviewed push marker `[notice-evidence]`. Ordinary pushes do not capture hosted text. Keep all compiler/native opt-ins unchanged; this job cannot invoke them. Pin existing checkout/Python/artifact actions consistently with the reviewed workflow; no dependency install, SDK manager, license acceptance, Gradle, Java, AIDL, D8, pair-artifact csc invocation, emulator, server, artifact DLL loading or phone operation. The existing trusted supervisor is compiled by PowerShell Add-Type as stated below; this is not a promise of zero compilation of supervision code.

Coordinator owns the sole dispatch/marker, monitoring, artifact download and audit. Other workers do not fetch the artifact independently. After the terminal successful job, coordinator downloads that exact artifact once to a separate exclusive local evidence directory, validates the three-file allowlist and exact receipt/text hashes, and actually reads the notice text for attribution assessment. Record any mismatch rather than replacing it. CI artifacts expire after 14 days; before expiry, retain the exact checked public vendor text and receipt in the agreed project evidence location if separately approved for publication. This draft does not silently expand repository distribution policy.

Stopping criterion: actual readable exact `NOTICE.txt` and properties bytes have been retrieved and independently audited against the baseline, or a finite refusal identifies a different/unavailable candidate or uncertain cleanup. Compilation is never repeated to fill this evidence gap. No automatic retry follows a mismatch.

## 5. Source-origin evidence already available and limits

The already-verified pinned upstream tar contains the source-origin material; no new source fetch is required: `LICENSE` (11387 bytes), `README.md` (8141), `server/src/main/aidl/android/content/IOnPrimaryClipChangedListener.aidl` (757), `server/src/main/aidl/android/view/IDisplayWindowListener.aidl` (1801), and `server/src/main/java/android/content/IContentProvider.java` (168). Their exact hashes remain bound by the checked-in full/selected manifests and successful dependencies evidence. The two AIDL headers identify AOSP 2008/2019 Apache notices; the hidden stub has no individual header. The actual generated Java files were deleted after the build: retained size/hash records are not retained generated-header text. Original AIDL headers establish origin evidence, not every generator-emitted text detail.

Reading build-tools NOTICE may resolve component/source attribution questions; it does not establish legal completeness, imply that all listed components entered the server DEX, accept SDK terms, or authorize binary redistribution. Unused stock-client DLL notices are not prerequisites for this narrow server/consumer selection. Source-owned reviewed pair remains null, and the earlier build's deleted outputs cannot be restored or admitted from recorded hashes.

## 6. Required focused checks before campaign review

Use synthetic owned-file fixtures only: exact text byte/hash success; CRLF/BOM preservation; invalid UTF-8/NUL/oversize refusal; known-size hash mismatch; symlink/ancestor/identity replacement; each tool-binding mismatch; duplicate/extra receipt fields; changed source/baseline; unknown scratch file/changed owner; partial stage, timeout/late retirement and cleanup uncertainty; uploader exact-list/no-binary mutation witnesses; ordinary push disabled and explicit source-dependent opt-in only. The implementation must exercise the real stable-read/staging/publisher composition, not manufacture a successful receipt. Final exact runner review precedes campaign execution. Source entry is recorded above; no campaign or test result is claimed by this contract.
