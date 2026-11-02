# P4-06/08 — supplied OpenCV preprocessing and owned Linux worker source evidence

Date: 2026-11-02. Local `phase-04`, predecessor `0233c3bc`; no commit/publication performed by this evidence author. Entry: [adopted source contract](../phases/P4-OPENCV-WORKER-SOURCE-ENTRY.md). This is a bounded source/software result, not full task/Phase acceptance or a hardware claim. Checklist credit belongs to the independent ledger decision.

## Actual dependency and processing evidence

- Official Linux wheels were acquired once and inspected in `/tmp/auto-p4-wheel-review-20261102`: OpenCV4.13.0.92,60391106B,SHA256 `0bd48544f77c68b2941392fcdf9bcd2b9cdf00e98cb8c29b2455d194763cf99e`; NumPy2.2.6,16527618B,SHA256 `fd83c01228a688733f1ded5201c678f0c53ecc1006ffbc404db9f7a899ac6249`. Published and measured identities matched. All979 RECORD rows checked, including two unbound self-records;977 other wheel files had exact verified hashes/lengths.
- A fresh `/tmp/auto-p4-preprocess-runtime-v1` venv was created with existing CPython3.12.14. Exact hash-required, no-index/no-deps/wheel-only/no-cache/no-compile installation succeeded. No build backend, vendor console command, global install or extra package resolution. Installed977 original non-RECORD wheel files read back byte-identically. Runtime manifest binds interpreter/configuration, actual1834 installed site files totaling233038051B and worker source; its aggregate uses explicit lexical relative-path ordering.
- Actual imports reported cv2 `4.13.0`, NumPy `2.2.6`, cv2 threads1/OpenCLfalse. The full wheel notices remain in the disposable environment. Native dynamic-table inspection is not complete dlopen/host-library proof, redistribution approval, sandboxing or a native RSS quota.
- Real supplied PNG→existing decoder→isolated Python child→cv2 crop/resize/gain→bounded parsed RGBA succeeded. Tests verify RGB source hash differs from transmitted RGBA hash, HALF/DOUBLE geometry, round-half-up gain/clipping and actual process cancellation/drain. Inputs are labeled synthetic images and display evidence, not phone captures.

## Checks and corrections, with overlap explicit

- First new JS run:12 cases,7PASS/5FAIL. Two real-positive failures were a local runtime-manifest path ordering mismatch; three synthetic fault fixtures used a nonexistent TypeScript transpile API. Fixed canonical lexical ordering and existing esbuild test-only transformation; no admission predicate relaxed.
- First coherent impact run35/35PASS:15 new JS cases plus8 existing capture and12 stability cases. Separate actual Python worker tests8/8PASS, log `/tmp/auto-p4-python-preprocess.log`, SHA256 `bedeb1c9475ed3e83b3a5e6510438ffaa619b72eb4bb658048a462d6e0fae212`.
- Independent review required bounded stable reads, no phantom writes after synchronous throw, post-cwd pre-spawn deadline fence, full final capture UTC classification, and complete forward/rectangle/cover mapping. Corrected batch20/20 new JS casesPASS, including five added causal cases; project strict TypeScript/scoped BiomePASS. Log `/tmp/auto-p4-preprocess-review-corrections.log`, SHA256 `ed8de6b2c07d7dc97268a8acabb722f666e57b5b9650f0db9ace0e1f45b0fedb`. Independent narrow source correction CLEAR recorded by coordinator.
- Synthetic fault processes are explicitly transformed test seams: held EOF/writes, timeout/late output, stderr/size/malformed reply, no-handoff versus queued synchronous throw, clock regression and pre-spawn deadline loss. They are not OS process evidence. Real positive/cancellation cases use the actual fixed interpreter/script without that seam.
- Tooling preflight initially refused the old128 filesystem-entry cap; measured source tree130 entries/127modules and made the exact additive update. Focused graph/quality/batch tests45/45PASS (overlapping final aggregate).
- One normal integrated source check completed uninterrupted: **1695/1695 testsPASS; DESKTOP_SOURCE_CHECK_PASS**, exit0. Includes dependency verification, exact module graph, quality, production/demo type/build and all180 fixed JS/CJS test files. Log `/tmp/auto-p4-opencv-integrated-source.log`, SHA256 `454459656554a36801dc42f7778517452f661c3ba122e2b0941a23de60b3c3d5`. Unchanged Python8 were not redundantly rerun; they are separate from1695.

## Finite integration and remaining boundary

Two main-adapter modules added; module125→127, exact tree128→130, overflow128module refuses. Test inventory178→180 preserves every prior verification file. Quality traversal now includes fixed `desktop/vision`:545 measured entries,547 cap preserving two fixture entries,548 refusal. Compact module map51121B remains below unchanged65536B cap. Build source commitments include both TS leaves and fixed Python/lock/runtime metadata; no new packaged executable or application entry.

The decoder applies4096-axis/4194304-pixel preprocessing IHDR admission before inflate while existing capture API/limits remain unchanged. Output mappings bind source and wire hashes, target/display/context revision; rational geometry and conservative cover are not lossless reconstruction or action coordinates. Owner reserves before proxy traps, fences generation/context/cancellation and final UTC, and retains the sole slot until actual child close, stream EOF/close and own write settlement. Logical timeout/kill is not retirement; undrained resources retain the slot. No auto retry, queue, application startup activation, ADB/device/network operation or OCR/model execution.

Fixed runtime admission is **local Linux development only**, not portable Windows Python packaging. P4-01/02 acquisition remains unavailable; stream coexistence/hard native memory limit, prior pipeline rollback, full OCR and application worker-health integration are not established. Historical processed images confer no continuing current-display/identity/action authority. No ledger percentage or full task acceptance is inferred.

## Exact source and tooling freeze

| File | SHA256 |
|---|---|
| `desktop/src/main/capture-contract.ts` | `54b3eeed00a05b2f014e99c9fc68e9829f9c6eacf7c907fff8d621d9b0c00d34` |
| `desktop/src/main/preprocess-contract.ts` | `9e61390fc7dee36b56824d4eaff2bd1d9241a664756c4cecedbd5cf938db2935` |
| `desktop/src/main/preprocess-worker.ts` | `b3ecd99b944d6e600d36846d117fbbc2ed5ba815424daa712df0074fe2479013` |
| `desktop/vision/preprocess_worker.py` | `a614ee0394bc8899a302d4aacbd2303370a53ea1d7bf8185c881918316d7eab7` |
| `desktop/vision/runtime-linux.json` | `e70f5d74055c77e7487c13701feb7ba3ab3f8847365da63152ebbc34aab1f207` |
| `desktop/vision/requirements-linux.lock` | `8d5ac7f503728a05906459f673390545f593a10e42d4ce95568639ff296c9f4f` |
| `desktop/tests/preprocess-contract.test.mjs` | `ea8b0fa0e6c627d541a8d36f03d7da715f8bad4cef8bc0ee61f1ce1dbec4a6f6` |
| `desktop/tests/preprocess-worker.test.mjs` | `11562d2c858806f2df0a365bf53b4d3cd3a33f863816ec30d979fd23466af1b6` |
| `desktop/verification/test_preprocess_worker.py` | `924ba845a0beea254019e19805fc32a579438031014b647949712745e88bac76` |
| `desktop/module-map.json` | `fe7590f3dc9f0c11be578172861bceee8ad0bedec71a759125a77ea82676be38` |
| `desktop/scripts/build-manifest.mjs` | `9cdec5402ce4899a066322d21ddd4c5e87350da57015acae376744366d084978` |
| `desktop/scripts/check-module-graph.mjs` | `fe4df6809b65a9afa23d25b76d19f21299e106fcc408bc47295c7037617d0c40` |
| `desktop/scripts/quality-tool.mjs` | `6fe3adbed80fd3b45eb2d96746ee72e84190e2e9955ac8febfd0f52a03856036` |
| `desktop/scripts/test-batches.mjs` | `17376cf6051f77f302ad56cebb817d849a471c6815da7b20c9c7155c6ca09980` |
| `desktop/tests/module-graph.test.mjs` | `2d579d694c398aab2864e1d71abc5a54d9eba167f7749dc67b6329d42d251743` |
| `desktop/tests/quality-tool.test.mjs` | `d824771ea4b8394850128df49a1c6e9287bd42a22934fbaa21ee64f6cc20ced5` |

## Independent closure and fixed-ledger decision

Product corrections, exact tooling integration, all16 source/tooling hashes and the retained1695 source PASS were independently reviewed CLEAR. On resumed readback at14:44 UTC, all16 fingerprints still match and no test was rerun. Independent criterion review credits exactly P4-06.A/B/C and P4-08.A/B/D/E N→I under the unchanged49-cell ledger: N35/S0/I14, source28.6% and integrated28.6%, +7/49 (+14.29 percentage points) each from14.3%. Acceptance remains0/12. These are the named supplied-input/Linux backend software behaviors, not Windows deployment, application health/actor activation, OCR, stream coexistence, prior-version rollback or physical evidence. The source remains a local functional milestone; no hosted run or publication is inferred.
