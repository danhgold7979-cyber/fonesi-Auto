# Phase 04 — Windows vision source and build qualification checkpoint

**REVIEWED SOURCE/BUILD CHECKPOINT, local before publication.** Base `4e0e89d6b62708dd91f1dac3e5c7da2ec873e36a` is preserved. The [adopted Windows source entry](../phases/P4-WINDOWS-CPU-QUALIFICATION-ENTRY.md) was independently reviewed before implementation. Windows C# compilation, native ownership, candidate materialization, DLL loading and model execution are **NOT_RUN** at this checkpoint. Coverage remains 15/49 source/integrated cells and 0/12 acceptance; no new fixed cell is inferred from source volume or test counts.

## Useful implementation, not a POSIX wrapper

- `native/VisionProcess.cs` owns suspended Windows process creation, non-breakaway Job assignment before resume, explicit inherited binary pipes and clean environment, one reserved admission slot, bounded input/output, original monotonic deadline, actual tree/pipe/writer settlement and retained handles through uncertain cleanup. `Retired` follows confirmed handle release, not just process death. Fixed profiles select source-owned decoder, preprocessing, OCR, strict consumers, metrics and controlled lifecycle fixtures; requests cannot supply executable/script/command/environment.
- `tests/fixtures/VisionProcessFixture.cs` supplies controlled byte echo, blocked input, oversized streams, malformed replies, late output, crashes, surviving descendants, nested-owner crash and explicitly synthetic assignment/query/termination/close-failure seams. Source inspection is not evidence those Win32 paths have executed.
- `vision/ocr_windows_worker.py` is separate from the unchanged Linux worker/manifest. It uses genuine Windows file-handle identity/reparse/hash checks and retained model reads, strict source-owned context, no process/socket exception list, actual RGBA→BGR conversion and v2 output identifying `WINDOWS_PEAK_WORKING_SET` / `peakWorkingSetBytes`. VI refuses before native/model admission. Fake-WinAPI tests certify source policy, not native ABI/loader behavior.
- `verification/vision-qualification-fixture.mjs` invokes the existing real supplied-PNG decoder and preprocessing reply contract. Its Windows reply consumer uses fatal UTF-8 and duplicate-decoded-key-aware bounded scalar JSON, accepts legitimate Python numeric encodings, preserves raw text and rejects attribution/schema/measurement mismatches. Synthetic replies in tests are labeled synthetic.
- Metrics version 2 explicitly reports Windows peak working set; original version 1 Linux RSS schema/behavior remains supported. Missing measurements remain null. Failure denominators, exact Unicode/codepoints, bounded edit work and no qualification remain unchanged.

## Native-source review corrections

Before any Windows execution, independent review found and corrected two genuine defects: zero-length files in the exact runtime were wrongly rejected; and unchecked handle-close failure could falsely advertise retirement. Empty files now require the exact empty SHA256, and native handles remain retained on close failure until explicit reconciliation. Separate known tree death and final resource release prevent queries through already closed handles. Public observation exceptions preserve typed uncertainty, like timer observations. The fixture-only nested deadline field is absent from real worker environments.

The wrapper source includes an empty-file/tamper case and explicit pending/BUSY-before-reconciliation checks for synthetic query/termination/close failures. These remain source plans until the optional native campaign is independently admitted and executed.

Generated DLL/EXE bytes are read-held and hashed before any optional assembly load. Malformed-byte native cases explicitly report `RAW_BYTE_TRANSPORT_ONLY`; they do not claim strict-consumer validation. The strict consumer separately preserves `MEMORY_UNAVAILABLE` as typed unavailability. Runtime smoke success requires an actual `TEXT` observation, never merely an exit-zero worker or one metrics attempt. Raw observation and metrics are retained before that check; no exact-text/accuracy threshold is imposed. Independent correction review is CLEAR, but optional native/runtime execution remains unadmitted.

## Patched runtime and dependency research

Do not build around the older PSF 3.13.17 binary: 3.13.18 contains newer SSL trust, Expat, Windows mimetypes and tar/tempfile fixes. The selected review candidate is Astral's normal-GIL CPython 3.13.18 Windows x64 MSVC distribution, immutable release `20261026`, source commit `fa506e0858ac9f2cc5b289c137b888a2aa24d1ee`. Archive: 48,077,770 bytes, SHA256 `ebe90cc1dce2dd2d7afa1f0aa9b6c269c7c0174aeabdc6a801381602b7283424`. All 3,354 install-only files (152,074,886 unpacked bytes) matched the full PGO distribution's runtime subset; 1,647 omitted stdlib/idle tests were explicitly recorded. No links/traversal. venv/ensurepip are present. This is a vendor build, not a PSF Windows installer.

Two provider attestations were downloaded and their source/workflow subjects inspected. **Cryptographic verification NOT_RUN**; installed gh 2.46 lacked that command, and no replacement verifier was executed. Provider component/license metadata is retained, but no standards-complete SBOM or production redistribution approval is claimed. Raw build-directory metadata stays outside the public repository.

Windows OCR closure: 72 official PyPI wheels, 219,436,463 bytes; published hashes/lengths and 14,755 hash-bound RECORD payloads verified; Windows marker walk reached 72 packages / 116 distinct active edges. Windows adds colorama 0.4.6 to the original 71-version set. Exact lock SHA256 `adad5582bcdee77451031e1ec3cf9ebc2d9b0cd60ad423bcb0891f62a913fc84`. Only startup shim is the separately inspectable setuptools distutils `.pth`; no package code was executed during inspection.

Separate preprocessing retains OpenCV-headless 4.13.0.92 / NumPy 2.2.6, not PaddleX's conflicting OpenCV-contrib 4.10.0.84. The Windows NumPy preprocessing wheel remains metadata-only/not acquired. No candidate runtime has been installed/imported. Native prerequisites are real: Paddle's DLL import chain needs unbundled VCOMP140.DLL; contrib cv2 imports Media Foundation/D3D components. Disabling MKLDNN inference does not remove PE imports. No system DLL copying, OS feature changes, headless overwrite or arbitrary loader search was used to hide those requirements.

An acquisition poll was denied because the reviewer applied a report-only scope. The original downloader was confirmed stopped with 36 partial files. After root supplied materially relevant original user engineering grants and accurately distinguished saved reporting configuration from direct user quotations, exactly one resumption rehashed/reused those files and completed the official closure. No alternate route, credential change or repeated denied retry. Exact denial and resumption evidence remain in the local review packet.

## Honest source/native test partition

The previous 1,719-check aggregate was **OCR-model-free, not native-runtime-free**. It included three actual Linux preprocessing/lifecycle cases; the separate Python preprocessing suite contains eight actual Linux cv2 cases. Those bodies remain intact, now explicitly registered under the Linux native opt-in rather than pretending to pass on Windows. The previous successful evidence is retained.

Current targeted local results:

- Portable JS owner/transport cases: 38/38 PASS, zero skips.
- Original Linux preprocessing/lifecycle opt-in: 3/3 PASS, actual existing isolated backend; no OCR model run.
- Windows worker: 21/21 stdlib/fake-WinAPI policy tests PASS.
- Metrics: 25/25 PASS (original 23 plus Windows memory-schema tests).
- Strict producer/consumer/source-workflow cases: 9/9 PASS; overlapping tooling selection: 27/27 PASS after correcting strict lint warnings (first selection had 26 PASS / 1 quality failure).
- Exact portable Python inventory: 421/421 PASS, zero skips. Linux native/probe modules are explicitly listed as separate lanes, not silently ignored or counted as Windows execution.

Final coherent desktop aggregate: **1,725/1,725 PASS**, zero failures, plus `DESKTOP_SOURCE_CHECK_PASS` (exit 0). This is 1,719 historical checks minus three explicitly separated actual Linux cases plus nine new portable cases. The first final attempt stopped at `QUALITY_FAILED` on one test formatting mismatch; the corrected full run is retained separately. Native lexical/source checks are not counted as actual managed fixture or Win32 PASS.

## Early meaningful Windows compile job

The proposed `phase-04-vision.yml` runs portable source/build/foundation checks and **Compile-only** owner/fixture creation by default. Compile mode never loads or invokes the generated assemblies. It does not materialize the Python candidate or run OCR. An explicit, default-false workflow-dispatch flag is required for controlled native ownership fixtures. There is no workflow runtime/model job. Runtime mode in the source harness refuses while `approvedInstalledInventorySha256` is null or host prerequisites are unverified.

At 17:19 UTC the coordinator authorized reviewed publication and the default Compile job after the final coherent aggregate/freeze. This is a functional Windows build milestone, not a status-only push; authorization does not admit the optional Managed or Runtime modes. Compilation success must not be labeled native ownership or OCR success. Preserve actual CI failures, source identities and finite sanitized compiler codes. All original VI, held-out, accuracy/performance, application, Windows packaging and device acceptance gates remain open. No main merge or device/account use.

## Exact final source/evidence freeze

Independent review verified all 21 source/workflow file hashes in local `auto-p4-windows-source-freeze.json`, SHA256 `03cd8744090f8a22184185ebc8ed2de162c590b0feac079187d50eb93b066dc2`. After that aggregate, staged whitespace validation found one trailing space in the PowerShell wrapper. Only that space was removed; exact-source freeze was refreshed, product build and manifest verification passed again, and the 1,725 test logic remained unchanged. Final aggregate log SHA256 `7d6e8c2c37ccdde19ebab0fbc20dc9729eaf552eda058ca776f72f5ec764ef7f`. No vendor payload or private runtime inventory is published. The changed source hashes below bind this checkpoint; hosted compilation and optional execution require their own actual evidence.

| Source path | SHA256 |
| --- | --- |
| `.github/workflows/phase-04-vision.yml` | `1706fe047399b596b79ae064272fcb453f0e2e4adb959ee2b6b72071515fc7b2` |
| `desktop/native/VisionProcess.cs` | `f59725c0259813e8f62cf515b29ec750b66f78db3ab40943dd95f65fdd6bd038` |
| `desktop/scripts/build-manifest.mjs` | `156ce0d6ad4d9cea0f23c90cdfe0afa338a7a58149a5cef2bdc4c2c167bffa8a` |
| `desktop/scripts/quality-tool.mjs` | `202f33c7d7fe26272b7bc0a58a87e52cc9ad758af7d7d9306333258cc2fb32da` |
| `desktop/scripts/test-batches.mjs` | `cac5ca4d16117061d75fd5eaa25aa1eb5d26bf13fd68b0de92c93779f422a28d` |
| `desktop/scripts/vision-qualification.mjs` | `5bd9f569317c69a733a47ddfc56fabb2a13a7ac52b2d727727fb95a6323d253d` |
| `desktop/tests/fixtures/VisionProcessFixture.cs` | `ae1ce0cb9f7153850882724303255d3bb487c608bd6e2ebe0b433f32e4ac511d` |
| `desktop/tests/ocr-evaluation.test.mjs` | `b55205beae3cb503680294ee3bb328412898090325aa2920f75a3c9261e3b5f7` |
| `desktop/tests/preprocess-worker.test.mjs` | `497e1f0c9e74bee709b6f53c0dbd299fb75d4ce3c6c76113c1152c548d5d5ae8` |
| `desktop/tests/quality-tool.test.mjs` | `3b239d24e7e36d3677643ff60c1711641a61d4fe7c93196d05ec0dd56eda9730` |
| `desktop/tests/vision-qualification.test.mjs` | `d8d67a4afb195b27b5be6ccfc1e8463bdbc92aefc0ede642f0ff349cd58057ac` |
| `desktop/verification/Invoke-VisionQualification.ps1` | `3c3988a310b6a997c7f02fb86ca23677f86ad4bd3570789eff4d2aef95f723d8` |
| `desktop/verification/ocr_evaluation_metrics.py` | `158f49408209e1ab8bb68f1a43ee9efe336aef9a92c431d743670526d1e3d268` |
| `desktop/verification/run_vision_source_tests.py` | `bc453935a6e8a17fc748d93f40d4a0968f11b14512e050023ecbaca9ab6f076f` |
| `desktop/verification/test_ocr_evaluation_metrics.py` | `79a72af22c83c8aa3395f0b2bc5e291aee917db92e0edd1a1771192555d2503d` |
| `desktop/verification/test_ocr_windows_worker.py` | `566d5dd2c13f1d18f2774901275cd3beaf01434f0a3c5f2d0d93973115bba860` |
| `desktop/verification/vision-qualification-fixture.mjs` | `7b35a77580bad8e2776347661da855ca6f2b2f5d35f5040031a8b2609265d3f1` |
| `desktop/vision/ocr-requirements-windows.lock` | `adad5582bcdee77451031e1ec3cf9ebc2d9b0cd60ad423bcb0891f62a913fc84` |
| `desktop/vision/ocr_windows_worker.py` | `1e3e25b8a1b8542f23c7150bfe7b06cdbe6d6078ff57c3146d10fd9909910480` |
| `desktop/vision/preprocess-requirements-windows.lock` | `3a855aa577e4e21615eb9a2ab3741f4ee3c71ea86c31e1d2a069518c301ea4ff` |
| `desktop/vision/windows_qualification_manifest.json` | `bb71aecbab0abc81200ed14c32f6ab2cb52a2e9fdd38c7564b48f597d2297237` |
