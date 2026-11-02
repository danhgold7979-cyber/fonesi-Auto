# P4-07 — bounded CPU OCR evaluation source checkpoint

**LOCAL SOURCE CHECKPOINT.** Phase `phase-04`, predecessor `aa298037a66d3321957a9bac006e95576ab1009c`. Session began 2026-11-02 14:49 UTC. No commit, publication, application activation, held-out qualification or task acceptance is claimed by this draft. Independent final criterion review permits only P4-07.A N→I: 15/49 source/integrated cells and 0/12 accepted tasks.

## Previous checkpoint verified, not rerun

All 16 previously reviewed OpenCV source/tooling hashes matched the retained freeze. The retained source log still has SHA256 `454459656554a36801dc42f7778517452f661c3ba122e2b0941a23de60b3c3d5` and reports `TESTS_PASS 1695/1695` / `DESKTOP_SOURCE_CHECK_PASS`. That readback is not a new execution or hosted/Windows result.

## Actual candidate/provenance findings

The versioned official PaddleOCR documentation lists Vietnamese for Latin PP-OCRv5, but the downloaded exact dictionary does not contain the full Vietnamese tonal repertoire or its necessary decomposed combining marks. Official Hugging Face mirror commit `ab2cd5cc5fa6309be2e5acdfe66eca2c2c127d57` has the same 6,817-byte config SHA256 `0bbe984570f597af3638e50bdf2e8276f3ab26a61966096538b3b0d1849f5c84`. Sample absent characters include Ắ, Ế, Ộ, ự; absent combining marks include U+0300, U+0301, U+0302, U+0303, U+0306, U+0309, U+031B and U+0323. Representative official v3/v6 candidates also failed this check. [Upstream v5 issue](https://github.com/PaddlePaddle/PaddleOCR/issues/16339) and [v6 issue](https://github.com/PaddlePaddle/PaddleOCR/issues/18254) corroborate the limitation, not its resolution.

VI is therefore explicitly unavailable before model execution, not silently mapped to an unsuitable model or removed from required scope. No dictionary substitution, training or engine switch occurred. Model output classes require the matching trained/exported dictionary; adding characters to a text file is not a repair.

The EN candidate is `en_PP-OCRv5_mobile_rec`. Official archive: 8,007,680 bytes, SHA256 `e595b4cf2ffad19fbb5a61ba345d63939577a3ab8717b6e5995642590c9101b4`. Its exact three data-file hashes are in `desktop/vision/ocr_evaluation_manifest.json`; no archive link, arbitrary extraction or training/pickle model was used. Official model card commit `267c36e24c331595590fe7bd72bde2436fd286f2` declares Apache-2.0. Dependency/model payload redistribution is not proposed.

## Materialization, separate from inference

PaddleOCR 3.6.0 / PaddleX 3.6.0 / PaddlePaddle 3.3.0 resolved to 71 official binary wheels totaling 344,379,226 bytes. Every PyPI published hash/length matched; all 14,689 hash-bound outer RECORD payloads matched (14,760 rows including 71 self-records). An initial inspector bug selected a vendored nested RECORD in setuptools; corrected outer-dist-info selection and the complete rerun passed. No package was executed by downloading or inspecting its ZIP.

The independent requirement/marker walk reached all 71 packages and 116 distinct active dependency edges, including PaddleX `ocr-core`. Exact lock SHA256 `6839eb1fc05803c35bd9fa74572a6d782edd3821af7b2a261a1d7c2d3b233b81`; detailed wheel inventory SHA256 `2a283ed03f6654dda62ce523c0194ec547b03179b48e1d8ba3eec0a831db238a`. Wheel startup inspection found only the explicitly reviewed setuptools distutils shim. Entrypoint scripts/plugins were not invoked.

PaddleX requires OpenCV-contrib 4.10.0.84, so a new exclusive Linux OCR venv was used instead of modifying the passing OpenCV-headless 4.13 preprocessing environment. Exact offline/no-index/no-deps/hash-required/wheel-only/no-compile installation passed after review. All original 14,688 site payloads plus the 4,254-byte Paddle Bash wrapper read back byte-identical; the wrapper was not executed. Frozen installed site inventory: 15,752 files, 1,187,532,995 bytes, aggregate SHA256 `eb638a81fd4a1de59820ff1c25ed526aff2acf56992d90d448306a4d022e9797`. Interpreter/configuration commitments are source-owned. This includes installer/bootstrap files and is not a redistribution/package-footprint approval.

Wheel notices remain in the disposable environment. `bce-python-sdk` metadata declares Apache-2.0 but its wheel lacks a bundled license file; that gap remains explicit for any future redistribution. No claim of complete native dlopen closure, OS sandboxing, Windows compatibility or hard RSS quota follows.

## Actual attempted runtime outcomes — preserve failures

1. First reviewed synthetic EN attempt: process fully retired, exit 0, 3,356 ms end-to-end; 105,884 input bytes, 764 stdout bytes, zero stderr bytes. Structured result was `UNAVAILABLE / WORKER_UNAVAILABLE`, not recognition success. Peak process RSS was 164,364,288 bytes. Cause was initially unavailable because diagnostics were suppressed.
2. Reviewed diagnostic-only source delta retained all guards and added bounded stage/type/fixed-category diagnostics without exception text, full paths or environment. Second attempt fully retired, exit 0, 3,384 ms; structured unavailable again. Diagnostic established `CREATE_PREDICTOR / RuntimeError / PROCESS`. Peak RSS was 164,761,600 bytes. No inference prediction was produced.
3. Static pinned-source inspection identified Paddle's unconditional Linux libc probe via a shell pipeline and subsequent fixed AVX read. A narrowly reviewed amendment admitted only those two exact read-only constants, once each, with pinned installed tools, validated inherited context and isolated process-group retirement. No blanket process/network relaxation or vendor patch was made. The first group-owned attempt then fully retired (group absent, no kill uncertainty), exit 0, 3,552 ms, but returned unavailable. The terminal `ValueError` came from context validation: pinned cv2 source adds `LD_LIBRARY_PATH`. The earlier caught SOCKET event was not asserted as the terminal cause.

4. A separately reviewed source-owned adapter now supplies a fresh closed eight-field environment only for the two exact probe callshapes; vendor files and its parent loader environment remain unchanged. On 2026-11-02 at 16:04 UTC the corrected guarded synthetic attempt produced `TEXT / OK`: label `HELLO 123`, output `Hello 123`, raw score 0.958130419254303, model latency 158.330577 ms, end-to-end 6,952 ms and peak RSS 450,719,744 bytes. The case mismatch is retained. Feeding this exact observed row through the bounded metrics CLI produced 4 edits / 9 reference codepoints (CER 4/9), zero exact lines out of one, and no held-out rows. This single synthetic SMOKE observation is not a benchmark. Exit 0, retired true, process group absent, no kill uncertainty. This proves this synthetic EN worker execution, not held-out accuracy or composed owner execution; the later composed proof below is separate.

All four local attempt records remain separate. All observed processes retired; there was no uncertain-outcome retry. The new probe design is a materially changed reviewed scope, not an unchanged retry of a denied tool/environment action.

## Source tests and integration status

- Metrics: 23/23 stdlib tests PASS, including 1,600 independent small-string comparisons, exact 2M-cell work boundary, duplicate/leakage checks, Unicode preservation, failed empty-label accounting and separate cold/warm measurements. No model imported by those tests.
- Worker framing/refusal/probe predicates: 18/18 default stdlib tests PASS plus one explicit optional color test skipped, including actual read-only tool-hash checks and synthetic permission/context cases. These tests do not execute the two probes or establish model runtime success.
- Owner: 24/24 default source/synthetic tests PASS with the composed runtime proof registered only under the exact opt-in flag. Real CPython JSON serialization cases cover score endpoints and exponent forms; malformed UTF-8 and duplicate decoded keys refuse. Readable-stream errors and process-group uncertainty retain actual ownership. Synthetic PID/signals are not real process containment evidence.
- Tooling: first impact invocation exposed an incorrectly placed test-inventory entry and inherited `NODE_PATH` refusal. Corrected sorted registration and the existing required sanitized environment produced 45/45 PASS. No security admission check was weakened.
- One normal integrated source check completed at 15:44 UTC: 1,719/1,719 PASS and `DESKTOP_SOURCE_CHECK_PASS`, log SHA256 `e4f97fa97cc3fcb964659fd9754befc1b0aea51fab305eb45a995decadc27e05`. That run predates the final clean-probe-environment delta; it is not a claim of a final frozen aggregate. Affected owner tests remained 24/24 PASS after the latest manifest pin.

All model results remain `EVALUATION_ONLY / UNQUALIFIED`. Synthetic smoke is not a held-out corpus; precision/recall, VI accuracy, detector/layout support, Windows packaging, app/actor activation and owner-approved performance criteria remain open. No percentage increase or completed P4-07 task is inferred from source, dependencies or test counts.


### Current exact execution commitments and retained result

Corrected successful attempt: worker SHA256 `1244daa9bf8a1634ff970447451a62c1d5ddf38b5d0768f2f300e40efab448d4`, manifest SHA256 `146a80a4bf1892b2f24b9e8a723f0ca2a813217681f1392d849f343692506dd4`, reviewed group launcher SHA256 `f20823295e3663fc3dc4be343c6eea965b18e5d16fdd65e476a08227a3f95a70`. Retained raw frame SHA256 `cf9b655ce5b90c274e064e67697cb17feeff6c77079eb6731a6ca296e70f268d`; retirement record SHA256 `df15b7a0c0415d1b7468d313ef459cb3e95dd69f34893dd3df1f117f6c2509e8`. The synthetic PNG SHA256 is `cd11a692aa4cbbcbff4e676b857ba522df64a856a8d294655a74a6e8b610cdf1`; its original bitmap glyphs require no external font. Local evidence retention is not public binary redistribution.


## Actual composed evaluator and channel-order proofs — 16:12 UTC

After independent readiness review and coordinator adoption, the source-owned opt-in test executed the original embedded PNG through the actual OpenCV preprocessor and actual OCR owner/worker, then consumed the actual attributed result through the bounded metrics CLI. Result: **1/1 PASS**, with explicit `ownedOcrAndPreprocessorRetired: true`. VI was separately refused before launch; it was not mislabeled as a Vietnamese image benchmark.

The retained `SMOKE / COLD` row has label `HELLO 123`, prediction `Hello 123`, 4 edits / 9 reference codepoints, zero exact lines; model latency 146.690776 ms, original end-to-end latency 8,389.793836 ms and peak RSS 449,523,712 bytes. Source/pixel/model/manifest/context/ROI provenance assertions passed. No normalization, held-out row, warm latency measurement, confidence calibration or qualification was inferred. Runtime attribution is the exact manifest hash. The initial standalone metrics envelope mistakenly labeled its synthetic row TUNING and used the installed-site aggregate as runtime attribution; both metadata fields were corrected to SMOKE and the manifest hash, retaining the initial envelope/output separately. Raw prediction, label and measurements were unchanged; this was not another inference.

A separately reviewed fixed-runtime NumPy-only proof passed 1/1, asserting all four asymmetric RGBA pixels become exact BGR values, uint8 `(2, 2, 3)` shape and contiguous data without mutating input. It imports no Paddle/model and invokes no probes. Default worker tests additionally exercised real filesystem hashing against synthetic temporary model bytes: stable admission, hash tamper, missing file, extra file and symlink refusal. Candidate model files were not modified.

The composed test is not registered unless the exact opt-in flag is present; normal model-free aggregate runs contain no skipped test. Its exact reviewed source hash was `60a16c5ab03f21e334728fabcd1bb9ac6bd263adbc44310ac64cabfb01cd5583`. Ordinary test counts and actual runtime proofs remain separate.

The first final aggregate attempt returned `TESTS_FAILED` solely because the tool requires zero skipped tests (94 PASS / 1 skipped / 0 failures in that batch). The optional runtime proof now registers only under its exact opt-in flag; the existing strict aggregate policy was not relaxed. Corrected aggregate results follow below.


## Final frozen model-free aggregate and criterion decision

The corrected final aggregate completed at 16:16 UTC, exit 0: **1,719/1,719 PASS** and `DESKTOP_SOURCE_CHECK_PASS`. Its concise two-line log SHA256 is `e4f97fa97cc3fcb964659fd9754befc1b0aea51fab305eb45a995decadc27e05` (identical text to the earlier aggregate, but a distinct execution). All 15 current desktop source/tooling hashes matched `/tmp/auto-p4-ocr-final-source-freeze.json`, SHA256 `10689581164694471c9ecc95b490536a53b9a7fd4710ffbd86a0ab6c79c94616`, after completion. Composed real proof log SHA256 `b05bb349885833109ef04fc68fe10392140987bd78d211d1dabc13da473b1018`; NumPy color proof record SHA256 `436ed491beaa568e59b01eb9bf2d168b61ce33236584152229f106a8bab4a6ce`.

Independent criterion review and coordinator adoption credit only P4-07.A: N34 / S0 / I15, fixed denominator 49, 30.6% source/integrated coverage and 0/12 acceptance. P4-07.B–E and P4-08.C/F remain N; existing P4-08.A/B/D/E are strengthened, not counted again. The final registration-only test correction changed its source hash to `04a5e5ead587f778f5d986c80a84088301fbb9f5e1c381993241536a49fa6dfb`; the executed proof body is unchanged. No extra model execution was performed to repair test registration.
