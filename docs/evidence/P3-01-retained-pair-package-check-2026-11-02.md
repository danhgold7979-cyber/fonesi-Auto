# P3-01.E retained-pair app-local package check — source evidence

**Snapshot: 2026-11-02 11:30 UTC; Windows package-only outcome PENDING.** Independent consolidated runner review was CLEAR at 11:11 UTC. This records the source-freeze preparation against prior HEAD `a1291d99e464292a6709351e54b79a6d366e48ef`, not a new hosted build PASS. The coordinator owns subsequent Windows execution/audit. Independent review also cleared the two narrow workflow-fixture repairs at 11:29 UTC.

## Exact purpose and reused evidence

The [bounded package-check contract](../phases/P3-RETAINED-PAIR-PACKAGE-CHECK.md) composes the existing `buildPackage`/`verifyPackage` path with the already retained pair. Fixed input is artifact `13132988023`, run `41427976617`, source `24a5fe5cca5445b3b36d06e0f8a84e9391d66435`; its [retained receipt](P3-01-retained-pair-receipt-2026-11-02.json) SHA256 is `dc3e9888284b5512c4c5314890eff9591ae825db4029884bbed81c683a966e98`. The exact 31-file retained packet is reused, not recompiled or replaced.

- Optional package-v2 admission now binds reviewed pair/evidence/notice bytes as **integrity/provenance approval**, not a new distribution license. Notice-v2 retains unresolved generated-output applicability and owner internal-use/no-external-grant facts. Existing package-v1 behavior remains.
- The new phase-03, source-dependent, default-off `[pair-package-check]` job downloads only the fixed approved public artifact with job-scoped read permissions. It restores the existing scripts-disabled app build, obtains the exact Node license prerequisite, and stages existing Node24.22.1/Electron45.1.0 runtime bytes. No application, Electron executable, JAR, DLL, server or device is launched.
- The original 300-second wrapper budget covers five actual supervised children in order **PREPARE, ELECTRON, ATTEST, BUILD, CLEANUP**. PREPARE captures original ownership before external runtime preparation. Original private/context bytes survive BUILD; the cleanup seal is bound to the immutable captured build-result hash/length. Actual controller identity-bound cleanup, actual child retirement and observed root absence precede reporting.
- The existing builder captures the package inventory through actual stored-ZIP creation and external receipt verification. Existing 511-file/64KiB-manifest/640MiB package bounds remain. Failure/unknown partial outputs are not permission for recursive cleanup.
- The wrapper emits a canonical <=8192-byte, exact 23-key report. Workflow publication uses bounded held-stream reads, exact source/pin values and five actual retirement tuples plus wrapper exit0/PASS. **Only that JSON is uploaded**, never a full app ZIP/tree or runtime binaries. Runtime staging outside the package root is not falsely claimed removed.

## Source checks and honest stitched attribution

No Windows package-only execution result is present in this snapshot. Relevant retained local checks are:

| Check | Actual result / limit |
|---|---|
| New wrapper/workflow source assertions | 8/8 PASS, `/tmp/auto-retained-package-wrapper-final-tests.log`; source/model checks, not PowerShell execution. |
| Notice-v2/admission and package fixture checks | 35/35 PASS in `/tmp/notice-v2-package-tests.log`; synthetic package/runtime recognition seams are not real Windows packaging evidence. |
| Initial integrated source command | Stopped at batch4 with `TEST_PROCESS_CAPTURE_LIMIT` in `/tmp/auto-retained-package-integrated-source-check.log`; underlying stale retention-workflow slice now matched the newly appended job. No cap was raised to hide the failure. |
| Exact retention workflow boundary repair | 10/10 PASS, `/tmp/auto-package-retention-gate-boundary-final.log`; closed job slice plus mutation negative. |
| Continued batch11 workflow inventory repair | 2/2 PASS, `/tmp/auto-package-job-inventory-fix.log`; admitted only the new reviewed opt-in job. |
| Quality fixture correction | The continuation passed batches11 and12 before the just-edited fixture's formatting failure; formatting corrected, 13/13 PASS in `/tmp/auto-package-quality-after-workflow.log`. |
| Remaining batches13–23 | At this evidence read, `/tmp/auto-package-source-remainder-batch13.log` had reached `REMAINDER_PASS 734`. This is the retained remainder, not a fresh full aggregate PASS. |

Targeted wrapper quality formatting/check passed. The prior **375 Python** result is reused because this package batch changes no Python implementation/tests; it is not described as a newly executed Python run. Terminal stitched integration: batches4–10 passed 88+71+63+56+91+93+54 cases; batches11–12 passed 41+66; batches13–23 passed734. The first three batches completed under the original control command. Final seven refresh checks (module graph, quality, typecheck, build, demo typecheck, demo build, manifest) all PASS in `/tmp/auto-retained-package-final-refresh.log`. Expected desktop inventory is **1674**, derived from1654+matrix1+controller10+wrapper8+retention-negative1; this remains an expected hosted total, not a fresh complete local aggregate claim. Historical logs with older total counts are not substituted for this batch.

### Retained local log fingerprints

| Log under `/tmp` | SHA256 |
|---|---|
| `auto-retained-package-integrated-source-check.log` | `e68a6c63506f50e8c1ec788daaeb50ee99bedeef72c8dd21890b4765d0d76009` |
| `auto-package-source-remainder-batch4.log` | `83ab565aff6657893a358ab22b93d8372ce4b003330252af4df0f05c06fa44dd` |
| `auto-package-source-remainder-batch11.log` | `c79728e30878aaa5933f6adad64a6921295e97c5c6b38e11f71ae5edf78b0375` |
| `auto-package-source-remainder-batch13.log` | `5bc5ca958f6fa89fd70bd13d34ac629328ead5312d816a0ce7e7d0e7a8ad33c4` |
| `auto-package-retention-gate-boundary-final.log` | `3b14e1c1511292590b118280bed84cb053bddfcc35c2b5772c8014e9570dc8b6` |
| `auto-package-job-inventory-fix.log` | `4bbd1aab26e33d1fa368c37795d1256655c061c4a3ea8113786a58f292f92bba` |
| `auto-package-quality-after-workflow.log` | `e8b3342a10faf78aff987bcf407a4870397c776f87987b047b59e69a1ac89a63` |
| `auto-retained-package-final-refresh.log` | `abf64b11f1204bbafc0ca3c98c4ba390175cdcf484517a205ac6a9525bf84cc6` |

## Fingerprints at this source snapshot

| File | SHA256 |
|---|---|
| `desktop/verification/Invoke-RetainedPairPackage.ps1` | `24da33547a7c093667854f034668e44d31488db453f72dca73333667d26fc7d7` |
| `desktop/verification/retained-pair-package-control.mjs` | `c5cc1601f473f1aaa8aad8e1d1778cc7edc0c0ddcdc66d3077b42e2a532b445d` |
| `desktop/launch/package-admission.cjs` | `b375090d30f6c6f72805702a3ae6779df9af2bfc1bd12edcd8527074f2778cf5` |
| `desktop/tests/retained-pair-package-check.test.mjs` | `050a713a54ea4b6eded19d6de65c7fc9dabf548a2f1cd853d922f415b7738e15` |
| `desktop/tests/retained-pair-package-control.test.mjs` | `21175ff503d6c241ef505df15e1611d82978450afdd6d6832b13e090a5adb17a` |
| `.github/workflows/phase-02-software.yml` | `7173f08ec9d905d0254a6a2e943679916cd587833086409998e43646fd28ea03` |
| `docs/phases/P3-RETAINED-PAIR-PACKAGE-CHECK.md` | `88cb4b2a44770713094d244a5ae0a8948281584d22023f0c2deef9c73baed570` |
| `desktop/video-source/retained-package/attribution-prefix.txt` | `440adb0d83d55c08694a26df29c2c4c8869760f4a39fb6cb6e576de002500893` |
| `desktop/video-source/retained-package/evidence-manifest.json` | `7bd7125bf8f427cd10a2371f6a435b82c410bd4a0163b5626750049a7aa2a043` |
| `desktop/video-source/retained-package/notice-manifest.json` | `305698d5f4623d7572c1c46a515a17d0984b35d26a82ae743ebeb71a04a0ebf6` |
| `desktop/video-source/retained-package/pair.json` | `934a9ff34a1b868fa56ddfc8a57d4eaba64d9d6305b6da05839566b90b366437` |
| `docs/evidence/P3-01-retained-pair-receipt-2026-11-02.json` | `dc3e9888284b5512c4c5314890eff9591ae825db4029884bbed81c683a966e98` |

## Exact pending changed-path inventory

This is the working-tree inventory observed for the coherent batch, excluding Python caches. It includes the coordinator's prior retained-evidence/status closure and parallel-execution amendment; their presence is not a claim that this package check implements another phase. The list includes this evidence file.

```text
.github/workflows/phase-02-software.yml
desktop/launch/package-admission.cjs
desktop/scripts/quality-tool.mjs
desktop/scripts/test-batches.mjs
desktop/tests/derived-pair-retention.test.mjs
desktop/tests/fixtures/retained-pair-package.mjs
desktop/tests/package-build.test.mjs
desktop/tests/phase-source-workflow.test.mjs
desktop/tests/quality-tool.test.mjs
desktop/tests/retained-pair-package-check.test.mjs
desktop/tests/retained-pair-package-control.test.mjs
desktop/tests/retained-pair-package.test.mjs
desktop/verification/Invoke-RetainedPairPackage.ps1
desktop/verification/retained-pair-package-control.mjs
desktop/video-source/retained-package/attribution-prefix.txt
desktop/video-source/retained-package/evidence-manifest.json
desktop/video-source/retained-package/notice-manifest.json
desktop/video-source/retained-package/pair.json
docs/PHASE_STATUS.md
docs/evidence/P3-01-retained-pair-evidence-milestone-2026-11-02.md
docs/evidence/P3-01-retained-pair-package-check-2026-11-02.md
docs/evidence/P3-01-retained-pair-receipt-2026-11-02.json
docs/phases/P3-IMPLEMENTATION-SUBDELIVERABLES-v1.md
docs/phases/P3-RETAINED-PAIR-PACKAGE-CHECK.md
docs/phases/P3-RETAINED-PAIR-PACKAGING-NOTICE-PROPOSAL.md
docs/phases/PARALLEL-SOFTWARE-EXECUTION-AMENDMENT-03.md
```

## Acceptance boundary

P3-01.E actual app-local integration remains pending until the fixed Windows package-only check and independent report audit succeed. This source snapshot does not grant P3-01.A legal/notice closure, P3-01.F retained-prior recovery, runtime admission, preview/rendering, device acceptance or public full-application distribution. Runtime pins remain null. No new device, profile, security-setting, Release or pair-compilation action is included.
