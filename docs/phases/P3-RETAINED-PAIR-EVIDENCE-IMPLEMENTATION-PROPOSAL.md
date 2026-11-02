# P3-01 — exact retained-pair evidence implementation

**ADOPTED COHERENT SOURCE IMPLEMENTATION — 2026-11-02 09:48 UTC.** Independent source-feasibility review binds pre-adoption SHA256 `749968dd76bb848adec368de5ff5428efb9920edfeedff0e3f4ad3c7d2782be1`; no further source-entry blocker was found against the actual legacy seams. The coordinator proceeds under the owner’s specific retention grant and root’s end-to-end milestone direction. Final combined implementation/runner review remains required before the actual retained campaign. This is a finite implementation proposal for the specific retention destination approved by the owner, not runtime activation, first-party licensing or a release. No build, download, copy of executable outputs or device effect was performed to prepare this document.

## 1. Authority and purpose

The [destination draft](P3-RETAINED-PAIR-EVIDENCE-DESTINATION-DRAFT.md) recorded a question subsequently answered. At09:22UTC the assistant asked whether use was internal/distributed and whether the exact server JAR, consumer DLL, source and evidence could be retained publicly in the repository's GitHub Actions artifact for14days and then downloaded to the coordinator workspace; explicitly no Release or phone execution and no chosen first-party license. User at09:37:28UTC, message `Sentinel_d1cc8af362a881918e88ff7ec9617d55`: “Auto cho nội bộ cá nhân tao thôi, và chia sẻ cho nhân viên làm nữa. Lưu côgn khai cũng được. Cho phép thoải mái”.

This authorizes that bounded public retention/transfer for personal and employee use. It does not select Apache/open-source terms for Auto, authorize runtime pins, publish a Release/installer, bundle vendor tools, or grant device/profile/security effects. The earlier draft's “answer pending” is historical; its destination and ephemeral-storage qualifications remain.

Goal: preserve the **new campaign's actual** inspected pair, three generated Java files and sufficient exact source/notice/build evidence for independent attribution review. The prior successful build deleted its binaries; their hashes are reference evidence, not recoverable retained bytes or promised reproducibility. P3-01.A/E/F and package/runtime approval remain incomplete/null until their separate requirements are met.

## 2. Existing implementation reused, not replaced

- `Invoke-DerivedPairBuild.ps1`: existing fixed tool admission, original Stopwatch, five supervised compiler stages, process facts, strict finish/stage, marker-last scratch cleanup and final publication.
- `derived_pair_build.py`: exact archive/source/patch/tool closure, five fixed command plans, stable binary reads, static DEX/PE inspection, closed-layout cleanup.
- `validate_derived_pair_build.py`: exact legacy report/manifests/process/invocation/output validation, independent staged JSON binding and actual scratch absence.
- `derived_notice_evidence.py`: exact audited two text files and three hash-only tool bindings; reuse inert stable helpers/constants, not its capture workflow or another tool execution.

Existing compile-only default flags, v1 report schema, nine JSON outputs, CLI markers and failure semantics remain unchanged. Historical results remain byte-specific. Do not repurpose the legacy report's scope into a claim of retention or alter its historic UNRESOLVED entries. New retention status has a separate receipt.

### Exact source changes proposed

1. Add optional PowerShell `[switch]$RetainEvidence`, defaultfalse, to the existing wrapper. Old invocation is unchanged. Retention mode requires `ArchivePath` absent: its one fixed acquisition puts `upstream.tar.gz` inside the already-owned scratch, eliminating an arbitrary external archive lifetime. This is not a new URL or retry.
2. Add fixed siblings `desktop/verification/derived_pair_retention.py` (controller: `stage <scratchRoot>`) and `desktop/verification/validate_retained_pair_evidence.py` (independent publisher: `stage <scratchRoot>`, `cleanup <base>` and `publish <base>`), exactly two arguments after each script. They reuse existing standard-library helpers/validators with no subprocess/network API. No arbitrary source/destination/manifest/expected-hash option. Controller success is exact `DERIVED_PAIR_RETENTION_COPIED` LF; validator stage success `DERIVED_PAIR_RETENTION_STAGED` LF; cleanup success `DERIVED_PAIR_RETENTION_CLEANED` LF; publisher success `DERIVED_PAIR_RETENTION_PUBLISHED` LF. Only the wrapper emits final upload eligibility after actual publisher retirement.
3. Add a separate default-off workflow job/input `run_pair_retention`, or exact push marker `[pair-retain]`, phase-03 only and dependent on the successful existing source job. It invokes the same wrapper with `-RetainEvidence -PythonPath <admitted path>`. The original `[pair-build]`/`run_pair_build` job and its JSON-only upload remain unchanged.
4. Extend source-only controller/validator/wrapper tests and exact workflow inventory. No C#, Java, SDK, package approval or runtime pin change is needed.

## 3. Fixed roots, stages and one budget

Use the wrapper's existing exclusive `RUNNER_TEMP/derived-pair-UUID` scratch and exclusive `desktop/.derived-pair-build-runtime` base, with actual owner markers and retained identities. No existing base/scratch adoption. No user-selected output destination. The original work deadline290000ms/total300000ms starts before acquisition and covers **all** compilation, inspection, extra copies, validation, cleanup, publisher work and final readback. Existing per-stage maxima and actual retirement requirements remain; no new per-action full budget, second build or retry.

Retained sequencing:

1. Normal five stages and `finish` run unchanged. Any compiler/report failure prohibits retention staging, though the ordinary truthful failure JSON path may still complete.
2. Normal validator `stage` independently validates actual products and writes existing JSON staging/binding. Then controller retention `stage` and independently validator retention `stage` validate that binding, successful pre-cleanup report candidate (failure null, outputInspected/sourceUnchanged/toolsUnchanged true, all five successful retired receipts), actual outputs and source closure.
3. Reserve `base/retained-stage` exclusively. Copy the fixed content list below with exclusive writes, no hardlinks, no rename of source outputs, fsync/readback and before/open/after identity fences. The controller writes exclusive private `base/retention-capture.json`; the independent validator verifies copied bytes before writing private `base/retention-staging.json` binding scratch/base owner and physical identities, original context/staging/report digests, exact payload inventory and retention source closure. It is never uploaded.
4. Only after the retention child actually retires successfully and the wrapper independently validates its fixed receipt/copy inventory may ordinary controller cleanup delete scratch contents. In retention mode, independent validator `cleanup <base>` rechecks original staged root/base identities plus exact marker-only inventory and removes marker then root nonrecursively, finally observes absence. The wrapper requires actual cleanup-child retirement and absence before continuing. The default compile-only route keeps its unchanged `Remove-VerifiedOwnedRun`; retention does not substitute token-only deletion for original physical identity. An incomplete copy or unknown writer cannot be called preserved evidence; refuse and retain scratch/staging. No best-effort recursive deletion.
5. Existing validator cleanup/publish completes normally, independently observes scratch absence and emits the final unchanged successful compile report in `base/upload/report.json`. Its prior JSON publication is not retention acceptance.
6. Retention `publish` revalidates its staged payload/binding, final strict nine-record build evidence and actual scratch absence. Exclusively add the final report (not the pre-cleanup report) and final retention receipt; rehash all payload files after all callbacks/reads. Promote the complete fixed directory by exclusive rename from `retained-stage` to `retained-upload`; destination collision refuses. Do not delete or replace a prior upload.
7. After the publisher process actually retires, wrapper independently checks the exact closed file set, bounded receipt canonical bytes, all lengths/hashes and final ownership/absence witnesses before emitting `DERIVED_PAIR_RETENTION_WRITTEN` followed by `DERIVED_PAIR_RETENTION_PASS`. A publisher's own “success” output cannot prove its retirement. No binary artifact is eligible until this final wrapper boundary.

New action failure frame is exactly `DERIVED_PAIR_RETENTION_DIAG|ACTION|STEP|REASON` LF followed by `DERIVED_PAIR_RETENTION_FAILED` LF, at most256 ASCII bytes. ACTION is COPY|VALIDATE|CLEANUP|PUBLISH; STEP is OWNER|CONTEXT|SOURCE|BUILD|OUTPUT|GENERATED|NOTICE|COPY|READBACK|LAYOUT|CLEANUP|RECEIPT|PROMOTE; REASON is PREDICATE|IDENTITY|HASH|BYTE_LIMIT|SCHEMA|IO_ACCESS|IO_NOT_FOUND|IO_OTHER|INTERNAL. Set stage at the actual boundary, never derive it from exception text. Wrapper forwards a reconstructed frame only for the exact requested action, actual retired exit1, untruncated stdout/stderr and empty stderr. Otherwise fixed diagnostic-unavailable plus actual existing closed supervisor facts; never raw paths/errors/output. Success markers require actual retired exit0/untruncated/empty stderr and exact one line. Existing compile-only diagnostics are unchanged.

No retained success artifact on timeout, unretired process, partial copy, failed cleanup, changed source/notice or malformed publisher output. Emit fixed `DERIVED_PAIR_RETENTION_FAIL` only, with the existing bounded diagnostic channel where applicable. Failed/uncertain owned remnants stay retained for review; no marker claims cleanup or rollback. The compiler result remains truthful even if retention later fails. A successful copied pair cannot make a failed compiler report pass.

## 4. Exact retained content set

Thirty payload files plus one receipt, **31 total files**, no extra/empty directories beyond their parent closure. Total uncompressed contents including receipt at most64MiB. Every lower cap remains; no class-directory glob, raw compiler output, profile, environment dump, private scratch/context/staging/owner record or tool binary is included.

| Relative path(s) inside retained artifact | Source and bound |
|---|---|
| `payload/server.jar`, `payload/RetainedVideoConsumer.dll` | Exact inspected `scratch/evidence` bytes; each existing8MiB cap; require equality with report/output/build hashes and actual pre/post-copy bytes |
| `build/{source,tools,dependencies,generated,commands,outputs,server-build,consumer-build,report}.json` | Same nine complete canonical records; existing per-file caps:262144,8388608,524288,2097152,262144,1048576,8192,8192,65536 bytes respectively; report is final post-cleanup report |
| `build/retention-source.json` | New fixed source closure below; cap65536 |
| `generated/android/content/IOnPrimaryClipChangedListener.java`, `generated/android/view/IDisplayWindowListener.java`, `generated/com/genymobile/scrcpy/BuildConfig.java` | Actual three admitted generated Java files, each at most1MiB and combined at most2MiB; exact bytes/size/hash must match the GENERATED rows in generated.json; BuildConfig also matches existing constant |
| `source/upstream.tar.gz` | Actual owned acquired archive; exact513746B/SHA`a0d699fc7388b8252416c49e6293639de39ab76a03e7302ddced56c284d45200`; revalidate with existing archive/tree inspector, not digest-only substitution |
| `source/verified-selected-source-manifest.json`, `source/verified-full-source-manifest.json` | Exact existing pinned source packet; respective SHA`f96d6623e1e7ae129a398d8886a5676b47e85b64c40075e5740d9cbf7f036e29`/`94c62a3f7586e56da49e4a66612e0860d7ca4d8efdca46f4673a7dc195e7749e`; each≤262144B |
| `source/auto-video-nonce-v1.patch`, `source/source-provenance.json` | Actual reviewed single patch and provenance; patch SHA`caaadaecd4b559ef8f980e5eae84c47c9f7174a8d916f8fda05612fed7ff6f8c`, provenance must match current closed source packet and effective-source derivation; each≤262144B |
| `source/auto/native/{IsolatedAdbServer,RetainedAdbSession,RetainedAdbProtocol,RetainedHostAdmission,RetainedVideoSession}.cs` | Actual scratch consumer inputs; each≤1MiB/combined≤4MiB; equality with current source/effective and consumer-build source records |
| `source/upstream-LICENSE`, `source/upstream-README.md` | Exact archive-bound texts:11387B/SHA`01c12035bf35af37241298dc7ad538eb2a07e5c940437bc6876feeaa9d1951d0`,8141B/SHA`1a2f2677b4b86c0879b68a5b23c24fa7268ac3af1a92a17bddbe137abf374549` |
| `notice/NOTICE.txt`, `notice/source.properties` | Exact SDK text identities from the independently audited notice campaign:1063288B/SHA`2df581726e404bf9f5385107b650f6bf7800945348745ea54b7970d98e816b86`,62B/SHA`7dee6632e9ad6cb111da2bb99d747211e27927061b1276d040bb1d71fded5ebb`; strict UTF-8 roundtrip/noNUL, combined≤2MiB |
| `notice/capture-receipt.json` | Exact committed prior receipt `docs/evidence/P3-01-exact-notice-receipt-2026-11-02.json`,1167B/SHA`e38ceb009e011feeae1ce839a383cbd7d30d1a1b2377caec4e832e05ce2b503e`; explicitly historical notice capture, not a newly fabricated receipt |
| `retention-receipt.json` | New canonical public receipt, cap65536; excluded from its own files/digest list |

SDK texts are read from the admitted fixed physical build-tools root with existing stable plain-file/no-reparse/no-hardlink rules; no network download. The current build's aidl.exe/d8.jar/lambda-stub hashes must match all three exact audited notice tool bindings. Different tool bytes refuse this notice-bound campaign; do not select old notices by version string alone. Only text is copied. The new receipt records current text revalidation; the preserved prior capture receipt keeps its historical source/time meaning.

The whole upstream archive supplies exact original source content, LICENSE and AIDL headers. Patch+provenance+selected manifests reproduce the derived source inputs for inspection; the archive itself is not executed. Three generated Java bodies are now actually retained, unlike the previous hash-only result. Generated implementation applicability still requires inspection; exact NOTICE text is not blanket legal clearance. User intended-use approval is not an Apache or other first-party license choice.

## 5. Canonical receipts and proof partition

`build/retention-source.json` exact shape `{version:1,autoSourceCommit,autoSourceTree,files}`. Files are sorted exact `{path,bytes,sha256}` records for these ten repository paths: `desktop/verification/Invoke-DerivedPairBuild.ps1`, `derived_pair_build.py`, `validate_derived_pair_build.py`, `derived_pair_retention.py`, `validate_retained_pair_evidence.py`, `derived_notice_evidence.py` (all under desktop/verification), `.github/workflows/phase-02-software.yml`, `desktop/verification/WindowsBoundary.psm1`, `desktop/verification/OwnedFiles.psm1`, `tools/phase-00/HostProbeNative.cs`. Capture/recheck actual bytes before retention staging and final publication; fixed supervisor pins remain unchanged. The current build's normal source closure remains separately validated; the additional retention closure does not rewrite the old report schema.

`retention-receipt.json` exact ordered fields:

```
version,scope,githubRunId,githubRunAttempt,autoSourceCommit,autoSourceTree,
protocolId,reportSha256,retentionSourceSha256,noticeReceiptSha256,files,totalBytes,
buildProcessesRetired,copyVerified,sourceUnchanged,noticeBytesVerified,
directoryCleanup,passed
```

- version1; scope `DERIVED_SCRCPY_PAIR_RETAINED_EVIDENCE`; protocol exact existing Auto nonce protocol.
- GitHub run ID is canonical positive decimal string≤20digits; attempt positive safe integer≤1000000. Wrapper captures actual fixed runner variables before child-env clearing, under source-checkout HEAD/tree/GITHUB_SHA binding; they are attribution, not permission or a file path. Commit/tree are exact40lowerhex matching the new build.
- Each digest is exact64lowerhex and binds retained actual bytes, including **final** build report. `files` is the exact sorted30-payload-entry `{path,bytes,sha256}` list above, excluding this receipt. `totalBytes` equals their actual sum; final aggregate including receipt must fit64MiB. No self-hash or hosted ZIP hash in this receipt.
- Success booleans are all true only after independent checks. `buildProcessesRetired` refers to the five actual compiler receipts, not to the currently executing publisher. `directoryCleanup` means actual scratch absence after identity-bound cleanup, not just a deletion request. `sourceUnchanged` binds both build and retention source closures.
- The final wrapper boundary separately proves all supervised controller/stage/cleanup/publisher work actually retired and repeats receipt/file readback before upload eligibility. Do not put a self-asserted publisher-retired field into its own output.
- No public success receipt is emitted for a partial or failed retention. Existing compile-only failure/success JSON remains separate, and fixed retention failure diagnostics preserve the reason class without raw output.

The wrapper writes exclusive private `base/retention-context.json` exact `{version:1,githubRunId,githubRunAttempt}` from saved runner variables. Both retention actions bind its raw SHA256; it is never uploaded.

Private retention staging binding exact fields `{version,baseOwner,baseIdentity,scratchRoot,runId,owner,rootIdentity,contextSha256,retentionContextSha256,stagingSha256,preCleanupReportSha256,retentionSourceSha256,files}`. Identity objects use existing exact dev/ino strings; private canonical paths and UUIDs are never uploaded. Its files list initially contains29 entries (final report absent) and is sealed after complete stable copy. The final report is added only after ordinary successful publication; no unversioned overwrite of a staged report. Final expected30-file payload is then independently reconstructed before receipt/publication.

No new DEX/PE parser: reuse existing static output validation before copy; verify destination byte equality after actual copy and at publication. Reuse strict report/manifests parsing and canonical helpers. Hash equality does not replace actual file retention, and hardlinks are never treated as independent preserved copies.

## 6. Publication and coordinator audit

Fixed hosted artifact name `derived-pair-retained-evidence`;14-day retention; only `desktop/.derived-pair-build-runtime/retained-upload/` after the exact final WRITTEN+PASS markers and actual successful wrapper exit. Upload action remains pinned. Never upload base/private files, partial staging, ordinary scratch, arbitrary glob roots or vendor tools. Do not create GitHub Release/repository binary commit/package registry entry. The archive created by the artifact service is outside the receipt's digest graph.

Coordinator downloads exactly the actual run's one artifact into exclusive `/tmp/auto-derived-pair-retained-<actual-run-id>`. Before extraction: bound transport size and uncompressed aggregate64MiB, exact31file/parent-directory closure, no traversal/absolute paths/backslashes/duplicates/case-collisions/links/special members. Record actual service artifact ID, compressed byte count/SHA256 and run/source identity **externally**. Then independently reconstruct receipt, all31 bytes and links to build/notice/source evidence; never load the pair. No second download/rebuild on mismatch without reporting the actual failure.

Hosted14days is a retention setting, not guaranteed durable backup. Coordinator `/tmp`/workspace remains ephemeral and may disappear earlier. Retain for review and the owner's disposal/destination decision; verify availability before claiming it later. No automatic installation or promotion into packaging approval/runtime pins. Personal/employee intended use remains distinct from redistribution terms review.

## 7. Causal tests and final campaign review

Use owned temporary files and synthetic output fixtures to test the same copy/stage/publish path: default compile-only never calls retention or widens upload; retention opt-in is exact and branch/source dependent; failed compiler/report cannot retain; three generated files match their actual rows; notice/tool/source drift refuses; replacement during copy, hardlink, extra file/emptydir, short read, partial write, owner/identity change and cap overflow refuse; final report absent before cleanup and byte-bound after; cleanup refusal/late writer prevents WRITTEN; publisher exit/timeout/truncation blocks upload; final post-publisher tamper refuses; no duplicate receipt or destination adoption. Assert unchanged historical report schemas and old success/failure grammar. No tests need real compiler, tool install, device or live DLL.

One final independent source/runner review must bind actual wrapper/controller/publisher/workflow/tests and exact counters before the coordinator invokes the first opt-in retained campaign. The owner's destination approval does not excuse those checks. No unchanged compile-only rerun is substituted for retention proof. A successful new campaign may establish retained evidence availability only; it does not automatically resolve generated-code notices, choose Auto terms, admit a runtime pair, prove Windows loading/Android compatibility, complete P3-01 or create a prior package.
