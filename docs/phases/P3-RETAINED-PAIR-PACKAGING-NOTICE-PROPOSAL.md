# Retained derived pair: packaging, notices and prior-bundle recovery

**ADOPTED SOURCE PREPARATION — 2026-11-02 08:17 UTC.** Independent source-entry CLEAR binds pre-adoption SHA256 `5b7625ed6d962298eb45069a5981f74c428a71cf04cdf75b452cf4659991a935`. The coordinator adopts only §7’s optional build API, closed v2 inventory/shared verifier, external receipt and owned synthetic tests under existing software-first engineering scope. Legacy v1/default CLI remains unchanged. Future notice extraction, compiler-output retention/transfer/distribution, first-party license choice, runtime pinning and actual prior-package/device launch are not adopted by this entry. This does not activate video or reclassify compile-only evidence as retained-binary proof.

## 1. Canonical scope and present boundary

Traceability: [canonical P3-01](PHASE-03-screen-wall-resources.md), [fixed subdeliverables P3-01.A/E/F](P3-IMPLEMENTATION-SUBDELIVERABLES-v1.md), [derived build contract](P3-DERIVED-SERVER-BUILD-PROPOSAL.md), and [owned headless consumer contract](P3-DIRECT-VIDEO-CONSUMER-SOURCE-PROPOSAL.md).

- **A:** exact app-local version/origin/dependency identity and applicable license/notice closure.
- **E:** bind the derived server and Windows consumer as one compatible, owned app-local bundle.
- **F:** restore a separately verified prior compatible whole bundle, without adopting third-party installations or mixing component generations.
- Runtime admission (P3-01.G), real Windows launch/phone proof, decoder/rendering and performance remain separate. The current headless pair is not a stock scrcpy client, visible preview or complete P3-02 implementation.

The successful build retained nine JSON evidence files, not executable artifacts. Its owned cleanup deleted the build products. Therefore there are currently **measured artifact identities, but no retained executable pair available to install**. Neither hashes nor source manifests reconstruct those bytes. This proposal reuses the successful evidence as a reference; it does not require or perform a new build now.

## 2. Exact successful reference, not a runtime allowlist

Evidence directory for this assessment: `/tmp/auto-derived-pair-success-report` (local evidence locator, not a shipped path).

| Reference | Exact identity |
|---|---|
| Auto source | commit `d267f8ddd9cbfc23a480a3c9f436b0944f4699fe`, tree `f99737a6f708a5c1b3a013f9e818150c69615c7a` |
| Upstream | scrcpy 5.0.1, commit `a60891aea193d92e7e5c3942700eca63f9d19a5f`, tree `eb740a30415199219479610728420ebcfd8a9064` |
| Protocol | `AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1` |
| Derived patch SHA256 | `caaadaecd4b559ef8f980e5eae84c47c9f7174a8d916f8fda05612fed7ff6f8c` |
| Measured server | 100170 bytes; SHA256 `5a10e70d4827fd90e6e2907a382329391e4d1e8e3292529474df5acadfd9ae99` |
| Measured consumer | 106496 bytes; SHA256 `ab5810a6e058f7522b43e3fd5c5ea627adebf3da7b3af1e0a08164e767db3713`; AMD64 |
| Report SHA256 | `1d9ba8ee1466a138a5c8d0b5166fedd65a3756a5794ff3d7cb76ab17601ad2f6` |
| Server build manifest SHA256 | `79d4b65f7e0cbe38e4708e8faf99bedc12f691b3c39928f2e03c8b8d7606915a` |
| Consumer build manifest SHA256 | `bf873af0b13ee3b0c173573c6d76fb5e798774fdec315ed4d9377b6b46f288ab` |
| Dependencies manifest SHA256 | `052271a1f838628f2421d5fe0c410dbaf203c81e06d69886c3d052a7060a4dd8` |

A future retained build must bind its own actual output hashes, source, tools and complete command manifest. Byte equality to this reference must be measured, not presumed reproducibility. Different output bytes are a different candidate even if sources/version match. The consumer summary's four arguments/two framework references are not the complete command: `commands.json` records `/noconfig`, `/nostdlib+` and the explicit mscorlib/System/System.Core references. Preserve both records with their actual meaning.

## 3. Component and notice closure

The dependencies report has 256 records, of which 251 are `UNRESOLVED`. This is a conservative inventory classification, not 251 bundled libraries. Do not edit the historical report to make it appear previously resolved.

| Component/evidence group | Actual relationship | Proposed attributable closure |
|---|---|---|
| 91 server Java inputs | 90 scrcpy Java files and the empty `android.content.IContentProvider` exposure stub; compiled into the server JAR, not shipped source merely because the historical inventory says BUNDLED_SOURCE | Pinned root README declares Apache 2.0 for scrcpy. Preserve original source and applicable notices, and map this declaration to the exact selected paths; no blanket keyword-only classification. |
| Two AIDL inputs | AOSP clipboard 2008 and display listener 2019 headers; generated-source inputs | Retain both Apache headers in the source packet. Actual DEX contains five generated display-listener types; generated clipboard Java exists in evidence but its types are absent from this DEX. |
| Derived changes | Options.java, Server.java, device/DesktopConnection.java | Retain prominent existing Auto modification notices, exact upstream/derived hashes and patch; label artifact as Auto-derived, never official-server bytes. |
| Generated implementation | DEX has five `ExternalSyntheticBackport` types and generated AIDL Stub/Proxy implementation | Resolve the exact pinned D8/R8 and AIDL generated-code notice applicability. A build-only tool label does not prove generated implementation has no attribution requirement. |
| Five consumer C# inputs | First-party Auto source closure, recorded by source/consumer manifests but omitted from dependencies.json | Separate first-party origin/terms entry covering IsolatedAdbServer, RetainedAdbSession, RetainedAdbProtocol, RetainedHostAdmission and RetainedVideoSession. Public repository visibility is not a license declaration. Do not silently inherit Apache terms from the server. |
| 160 unresolved tool/environment records | JDK146, build-tools6, Framework5, platform3; includes metadata and notices, not 160 shipped libraries | Keep as build/reference evidence. 143 JDK entries are legal/notice files; do not count them as components. android.jar/framework.aidl/core-lambda-stubs are compile inputs; Framework DLLs are explicit references, not requested package payloads. Review generated-code exceptions separately. |

Pinned upstream README attribution: Genymobile 2018 and Romain Vimont 2018–2026. Exact root LICENSE is 11387 bytes, SHA256 `01c12035bf35af37241298dc7ad538eb2a07e5c940437bc6876feeaa9d1951d0`. The retained 387-blob archive contains no upstream NOTICE file. Do not fabricate one or omit existing source headers. The Apache text's redistribution section requires provision of its license, marked modifications, retention of applicable source notices, and treatment of an upstream NOTICE if supplied. This document records those source terms, not blanket legal clearance.

The full selected server is compiled: audio/control classes remain present even though the fixed runtime profile disables those capabilities. Their source notices remain in scope. Stock desktop-client SDL/FFmpeg and bundled platform-tools are not part of this pair; do not import their distribution obligations as if those binaries were included.

### Concrete unresolved content sources

1. Exact build-tools `NOTICE.txt`, 1063288 bytes, SHA256 `2df581726e404bf9f5385107b650f6bf7800945348745ea54b7970d98e816b86`: current evidence retains identity, not its text. Need attributable relevant AIDL/R8/generated-code notice text from those exact admitted bytes or a separately verified matching primary source. Do not use unrelated current-version notices.
2. The recorded `lib/d8.jar` identity and actual generated backport types: determine which implementation/template origins apply. DEX namespace filtering is not an attribution proof.
3. Exact Framework `ThirdPartyNotices.txt` and JDK legal/NOTICE records are hash-bound but unread here. They concern build/runtime distribution only to the extent actually included; no JDK/Framework redistribution is proposed. Any later bundling changes this assessment.
4. Auto's first-party consumer and patch distribution terms must be explicitly stated in the package. No repository-root LICENSE was observed in this assessment; no new license choice is made here.

### Bounded acquisition to close the specific text gap (not performed)

A future explicitly reviewed evidence-only invocation can copy exactly `BUILD_TOOLS36/NOTICE.txt` (1063288 bytes, SHA256 above) and `BUILD_TOOLS36/source.properties` (62 bytes, SHA256 `7dee6632e9ad6cb111da2bb99d747211e27927061b1276d040bb1d71fded5ebb`). Use the same fixed plain physical SDK profile, no-reparse ancestors, binary stable reads with before/open/after identity checks, exact historical length/hash, strict UTF-8 roundtrip/no NUL, and aggregate at most2 MiB. Hash-check—not copy—aidl.exe, lib/d8.jar and core-lambda-stubs.jar against the successful tools manifest. No compiler, SDK installer, whole-tool upload, binary retention or build prepare/finish path. The output is only these two allowlisted exact text files plus a bounded identity receipt; it is evidence acquisition within this packaging plan, not a generic notice service. Different image bytes refuse this reference extraction; a new tool candidate needs its own attributable evidence, never an old-hash fallback.

The existing locally retained tar already supplies the exact LICENSE, README and two AIDL source headers. Generated Java bodies were deleted after the successful build: generated.json contains sizes/hashes, not readable generated headers. Neither proposed notice closure nor this text extraction claims otherwise.

## 4. Exact finite package-format and API extension

At source entry, inspection showed `desktop/scripts/build-package.mjs` exposed `buildPackage({npmVersion,sourceHead,sourceTree,nodeExe,nodeLicense,outputParent})`, copies only fixed paths, verifies the package and exclusively promotes new directory/ZIP names. `desktop/scripts/package-manifest.mjs` delegates verification to `desktop/launch/package-admission.cjs`. Its v1 manifest has exactly seven keys, complete file/directory equality, at most 511 listed files, a 65536-byte manifest and 640 MiB total inventory bound. Extra video/JAR/DLL files were rejected at that v1 baseline. `Invoke-Package.ps1` selects its own package root and external data root; it is not an updater.

Proposed source preparation changes only these package builder/manifest/admission seams and their existing tests:

- Extend the JS build API with one optional `retainedPairRoot = null`. This is an absolute build-time candidate directory, not a caller pin, source selector, runtime callback or issuer. Existing CLI remains its exact six positional arguments and produces legacy no-video v1 packages. No new CLI switch or main activation in this slice.
- Extend `createPackageManifest(root,sourceHead,sourceTree,runtime,video = null)`. Null produces the existing exact v1 shape and closure. A verified nonnull record produces v2 exact keys `{version,mode,sourceHead,sourceTree,runtime,entry,video,files}`; all existing field semantics are unchanged.
- The v2 `video` record has exactly `{pairManifestSha256,noticeManifestSha256,evidenceManifestSha256}`, each lowercase SHA256. No null-video v2 variant. `verifyPackage(root)` and its existing CLI remain unchanged signatures and accept only the two closed formats. Both builder and verifier call the same package-admission-owned `verifyRetainedPair(root)` check for exact pair/evidence/notice contents. This function returns the frozen three-hash record or throws `PACKAGE_REJECTED`; it does not install, load or register anything.
- `verifyRetainedPair(root)` treats root as a package-shaped plain tree and never accepts expected hashes from a caller. A source-owned packaging approval record is initially null. Its future exact value binds `{pairManifestSha256,noticeManifestSha256,evidenceManifestSha256}` after independent retained-byte/notice review. Null refuses real nonnull pair packaging. Source tests use an explicitly transformed fixed approval seam with synthetic payloads, not a production registration function.
- The builder checks a retained candidate's fixed subset before copy, copies exclusively, then repeats verification over the final package. Keep the existing manifest/file/byte caps; if the exact proposed closure does not fit, refuse rather than silently increase them. Package verifier and builder must reject the same unknown files/directories.

### Exact paths and contents

The candidate directory uses the following package-shaped fixed subset. Runtime desktop root is `<package>/app`, not `<package>`:

| App-relative runtime/evidence name | Package path |
|---|---|
| `video/server.jar` | `app/video/server.jar` |
| `native/RetainedVideoConsumer.dll` | `app/native/RetainedVideoConsumer.dll` |
| `video/pair.json` | `app/video/pair.json` |
| `video/server-build.json`, `video/consumer-build.json` | corresponding `app/video/` paths |
| Five exact existing `native/*.cs` inputs | corresponding existing `app/native/` paths, not duplicate copies |
| `video/notices/APACHE-2.0.txt`, `video/notices/ATTRIBUTIONS.txt` | corresponding `app/video/notices/` paths |
| `video/notice-manifest.json`, `video/evidence-manifest.json` | corresponding `app/video/` paths |
| Nine complete retained JSON evidence files | `app/video/evidence/{report,source,tools,dependencies,generated,commands,outputs,server-build,consumer-build}.json` |

The two build JSON copies at `app/video/` must byte-equal their evidence copies. Five C# candidate source files must byte-equal the current package's existing source copies and consumer-build source hashes; a previous compiled DLL cannot be paired with current changed source. Pair/build JSON schemas and existing 8192-byte limits, 8 MiB binary limits and fixed protocol/architecture remain unchanged. No files are taken from PATH or a third-party install.

`evidence-manifest.json` exact shape: `{version:1,files}`; files is the exact nine-entry sorted list of `{path,bytes,sha256}` with path relative to `video/evidence/`. Maximum manifest size 8192 bytes. Retain **contents**, not only digests: complete source/effective inputs, tool inventory, dependencies, actual commands, generated-class inventory, output descriptors, both build records and strict report. Keep the existing derived-build evidence per-file byte bounds, without expanding them. The independent **offline** evidence validator/reviewer validates the complete compiler/source/tool/command schemas, actual retained outputs and static DEX/PE structure before source-owned packaging approval can be set. Its approved evidence-manifest hash binds the exact nine reviewed evidence byte strings; approved pair and notice hashes bind their exact contents and payload digests. Package admission rehashes those exact bytes and performs only the finite existing pair/build/source/package consistency checks, including actual JAR/DLL size/hash and all five source matches. It neither ports the full Python validator or DEX/PE parsers into launch JavaScript nor spawns Python at launch. Arbitrary JSON `passed:true` never establishes approval, and approved JSON cannot admit absent or substituted binary bytes. No DLL/DEX load occurs in package verification.

`notice-manifest.json` proposed exact shape: `{version:1,pairManifestSha256,sourceEvidenceSha256,dependenciesManifestSha256,components,files}`. Mapping maximum262144 bytes; exact two sorted notice file entries `{path,bytes,sha256}`, each and combined text at most2 MiB. Paths are only the fixed notice filenames above. Components are an exact five-entry ID list, each `{id,role,origin,license,noticeFiles}`:

| ID | Fixed role | Origin / license decision |
|---|---|---|
| SERVER_UPSTREAM | COMPILED_CODE | exact pinned scrcpy commit and selected91Java hash set; Apache-2.0 declaration supported by retained README/LICENSE |
| SERVER_AIDL | GENERATED_CODE | exact two pinned AIDL hashes and actual generated types; Apache-2.0 source headers, generated implementation applicability must be resolved |
| SERVER_GENERATED | GENERATED_CODE | exact pinned aidl.exe/d8.jar identities and generated implementation mapping; terms unresolved, cannot mint notice-closed candidate yet |
| AUTO_PATCH | FIRST_PARTY_MODIFICATION | exact three-file patch SHA and modification notices; owner's distribution terms pending |
| AUTO_CONSUMER | FIRST_PARTY_COMPILED_CODE | exact five-source Auto commit/hash set; owner's distribution terms pending |

`origin` is a closed JSON object `{sourceCommit,sourceHashes,toolHashes}`: sourceCommit is exact40hex or null only for generated tooling; each hash list contains sorted exact `{path,sha256}` entries drawn from corresponding admitted evidence, with no URLs/commands. `license` must be an exact reviewed source-owned identifier/notice mapping, not arbitrary caller text; no `UNRESOLVED` acceptance. The final identifiers/text for unresolved groups must be reviewed before enabling packaging approval. This does not prevent implementing/test-driving the closed source-only verifier with explicitly synthetic notice fixtures. Build-tool inventory is separate evidence, not incorrectly relabeled compiled code. Source form is not claimed shipped merely because the build inventory used BUNDLED_SOURCE.

### No digest cycle

Package-manifest lists all payload file hashes but excludes itself, preserving the existing construction. Pair manifest does not hash the package/archive. Notice/evidence manifests hash their fixed files and lower evidence, never the outer package. The whole ZIP digest remains **external**: retain the existing exclusive `<archive>.sha256` plus a proposed external receipt `{version:1,archiveBytes,archiveSha256,packageManifestSha256,pairManifestSha256,noticeManifestSha256,evidenceManifestSha256,sourceHead,sourceTree}`. This receipt is not included inside that archive and is not self-authorizing. Runtime TS/PowerShell pair pins remain null regardless of package verification.

## 5. Side-by-side selection, not a new updater

No durable CURRENT/PRIOR pointer, database migration, automatic rollback controller or in-place patch is proposed. CURRENT and PRIOR are descriptive labels for two separately retained immutable whole-package directories. Each has its own `Launch.ps1`, runtime, application sources/build, pair approval and notices. Keep the existing builder's exclusive new output names and directory/ZIP promotion; do not overwrite an existing package or create a mutable video alias.

An operator can select a different whole package by its own explicit existing `Launch.ps1` path only after the previous application launch, host, video, artifact descriptors and cleanup obligations have actually drained. Selecting a prior package does not permit automatic restart, bypass profile/data ownership or erase uncertain journals. A live or uncertain prior launch remains a refusal under existing launch ownership/recovery mechanisms; directory selection is not proof of retirement.

Before any actual prior-package launch:

1. Revalidate its entire physical package inventory, byte hashes, notices, source/DLL pairing and compatible protocol/runtime grammar. Integrity of a previously reviewed package must be re-established.
2. Independently require compatibility with the **external data store's current schema and recorded migration history** using existing database/startup/backup admission. Restoring application files does not roll back external data. No automatic schema downgrade or invented compatibility field; unsupported prior software refuses before normal app work. Existing authenticated backup/restore remains a separate operation and authority.
3. Preserve unresolved launch/video journal refusal across both packages. An older launcher must not ignore unfamiliar newer journal state; source preparation must add a compatibility refusal test, not reinterpret old journal contents as clean.
4. Keep current platform-tools installation identity/revision separate; no video package operation rewrites its active pointer or adopts foreign tools.

P3-01.F requires a genuinely retained compatible prior bundle plus attributable selection/drain/compatibility evidence. Two synthetic packages establish bounded software verification only. The first real retained package has no fabricated prior. A prior whole app can carry its own independently reviewed single pair pin; current code does not gain an arbitrary historical allowlist.

## 6. Source tests and independent action boundary

Named required causal tests: legacy-v1 unchanged/no-video; v1 rejects extraJAR/DLL; exactv2 closure; missing/extra notice/evidence file; copied server/DLL changed after pre-copy verification; copied five-source/DLL mismatch; wrong pair/build/evidence hash; source/command record omitted despite digest; linked directory/file; manifest65536/file511/total640MiB limits; archive receipt remains external; final destination preexists; null packaging approval refuses genuine candidate; exact synthetic approval cannot escape its tuple. Tests inspect actual owned fixture files and exercise shared builder/admission checks, not only JSON shapes. No running payloads.

Prior-selection fixtures must separately show retained package tampering, incompatible external schema, unresolved/unknown launch/video journal, and held actual cleanup all refuse. No synthetic data-schema fixture is physical/Windows recovery proof. Existing no-video API/CLI and third-party install protections remain intact.

Source-only verifier/build preparation is separable from resolving notice texts, retaining binaries, distribution and runtime activation. **A future compiler-output retention/transfer campaign** would change prior JSON-only cleanup: it needs an explicit reviewed destination, exact copied byte identities, lifetime and owned cleanup. Packaging or distributing those binaries is another explicit action boundary. This draft neither performs nor silently authorizes them. Current successful outputs were deleted; any future approved rebuild must establish its own actual hashes, not presume this reference is reproducible.

## 7. Freeze boundary

The proposed implementable source slice is the exact optional build API, version2 finite inventory, shared verification and external receipt above, with synthetic tests and approval/pins remaining null. No generic installer, issuer registry or new update state machine. Final notice content/owner terms and actual retained-byte provenance remain explicit conditions for real packaging approval. Real Windows launch/device/profile evidence remains excluded. Keep P3-01.A/E/F incomplete until their complete named behavior/evidence exists; this draft changes no canonical status.

## Adopted receipt and inventory precision — 08:21 UTC

The external receipt uses fixed `${zip}.receipt.json`, exclusively written only after actual promoted package and ZIP revalidation; only v2 extends the return with its receipt path. Failure after partial promotion returns no success and retains the actual evidence; no multi-file atomicity is claimed. Independent narrow review CLEAR at 08:19. The two source-test files add exactly two measured quality entries, 521→523; preserve the two-entry owned fixture allowance with bound525 and refusal526. One additive registered test path makes173→174; shared fixture imports register no tests. Existing package/file/manifest caps and runtime admission stay unchanged.

The final v2 archive path uses one builder-private immutable capture of the validated complete file/directory inventory, including the package manifest’s own digest. The ZIP writer consumes those exact entries; the actual produced digest is bound to that capture and the final receipt repeats the same package/ZIP identity. A successor capture cannot adopt an older ZIP. The fixed sidecar is read as exactly65 bytes through bounded plain/single-link stable-file checks. These close the two consolidated implementation findings without adding a ZIP parser or changing v1 behavior.
