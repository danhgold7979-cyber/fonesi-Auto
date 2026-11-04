# P2-06 — synthetic observed-transport metadata composition

**SOURCE / HOSTED SOFTWARE1333/109/280 PASS — actual metadata/device acquisition NOT_RUN.**

This finite [adopted source contract](../phases/P2-TRANSPORT-METADATA-SOURCE-CONTRACT.md) advances an original P2-06 dependency without claiming P2-03/04/05/06/07 completion. Independent source-entry design CLEAR binds pre-adoption SHA256 `09eb4c5c335f88d8eb5577561bddd2a2f8c233831d40e33ef58675ff4132a53a`. P2-01 remains TECHNICAL_PASS/DEPENDENCIES_PENDING; technical P2 count1/13, overall11/154 and formal0 are unchanged.

## Useful bounded outcome

`desktop/src/main/transport-metadata.ts` exports only the explicitly synthetic metadata owner. It reuses the existing DeviceActor, metadata parser and recognized registry snapshots, and accepts only SYNTHETIC_TEST registry state. Every result/snapshot labels SYNTHETIC_TEST and SYNTHETIC_PROCESS; parser ADB_TEXT is a format label, not native provenance. No native constructor, arbitrary command, provider-registration selector, metadata database table, dependency, new output bundle or main/preload/renderer route is introduced.

The private owner binds one device/binding/generation/serial/non-null transport ID, numeric hostEpoch and monotonic registry observation, plus a separate unexported generation token. Its nine fixed metadata operations share the existing64/device and1024 shared queue budget. It keeps actor capabilities private, limits request history to128 and retained observations to nine fields. Provisional records may be used only inside this synthetic read-only composition; existing VERIFIED input admission and identity evidence remain unchanged.

Descriptor-safe capture, intrinsic ordinary-Promise attachment and normalization at actual settlement prevent later fixture mutation or hostile thenables from fabricating results. Observation time is captured at settlement within the original deadline; publication repeats target/owner/deadline fences and then callback-free internal checks. Parse callbacks do not mutate public state. A newer field observation cannot be overwritten or staled by an older request. Failed dispatched refresh stales prior data without inventing value/time; parsed unavailable remains unavailable, and whole-owner loss stales all observations.

Logical actor deadline returns promptly with no observation, while actual fixture promises remain tracked. Unknown retirement is deliberately sticky; late settlement does not reclaim actor registration or reopen authority. Close has one bounded report and retained actual drain. The unchanged actor conservatively returns OUTCOME_UNKNOWN if its entered dispatch wrapper rejects its last fence even before the synthetic fixture handoff; this is recorded as zero handoff, not fabricated retired-process proof.

## Exact changed paths and reuse

- New `desktop/src/main/transport-metadata.ts` and `desktop/tests/transport-metadata.test.mjs`.
- `desktop/module-map.json`: one exact node/four existing import edges, graph103→104. No incoming production edge.
- `desktop/scripts/build-manifest.mjs`: one source input, no output addition.
- `desktop/scripts/check-module-graph.mjs` and `desktop/tests/module-graph.test.mjs`: exact104 cap/overflow refusal and causal no-main-activation assertion.
- `desktop/scripts/test-batches.mjs`: one additive test path,150→151; no prior removals/reordering.
- This evidence, adopted contract and `docs/PHASE_STATUS.md` only outside source/tooling/tests.

Existing actor, parser, registry, ingestion, main, IPC, UI, native C#, launcher and workflow bytes are unchanged. Primary AOSP links in the contract document future transport/shell requirements only; no unused socket decoder or native command mapping was implemented.

## Impact-based verification

- New owned SQLite/RegistryStore → actual actor → actual parser composition: initial14/14 PASS, then one added older-request/newer-publication regression plus one affected hostile-promise case2/2 PASS. Final review found the reverse ordering gap: a newer known-retired failure staled a field without advancing its mutation watermark, allowing an older late success to freshen it. The fixed per-field applied sequence advances on publication and dispatched stale mutations, not on pre-dispatch refusal. That new regression plus the opposite-order case2/2 PASS. Sixteen cases are authored; these overlapping runs are not presented as an uninterrupted16-case run.
- Fixtures cover all nine fields; unchanged durable rows/identity evidence; provisional input refusal; exact transport/epoch/generation and duplicate-claim invalidation; queue/history caps; callback revocation; copied settlement facts/timestamp; hostile promise/accessor/oversize/unretired cases; logical timeout/actual drain; stale and unavailable semantics.
- Targeted module graph and batch-runner checks32/32 PASS, including the new causal incoming-main-edge detection and retained exact overflow refusal.
- Current project TypeScript PASS; exact runtime graph104 PASS; BUILD_VERIFIED and final manifest true. Quality372 files exits0 (legacy information-level diagnostics remain; no errors/warnings).
- No full local1316-test rerun or managed/native rerun. Previous actual [main integration source](P2-main-discovery-integration-source-2026-11-01.md)1316/109/280 remains separate. At source freeze the estimate was1333 = previous1316 +16 new cases +1 graph isolation case, with109 foundation/280 Python expected. The actual hosted results below now confirm these counts independently of overlapping local runs.

Independent consolidated source review CLEAR20:58 includes the final mutation-watermark fix and both causal ordering cases. Final current source TypeScript/format checks pass, and the build/manifest was refreshed after the correction; unchanged suites were not rerun.

## Current limits

No spawned process/socket, real provider, profile read/change, device query, physical metadata, RSA/USB/wireless authorization or native retirement is established. Actual SQLite participates in registry authority/history only, not metadata persistence. Production discovery remains provisional without a real identity-proof issuer. A future metadata adapter must preserve honest socket/worker/remote-exit evidence rather than convert it into a fictional local process exit, and must obtain separately reviewed native issuance/current-custody authority. P2-02's actual eligible Windows profile/server proof remains unmet; the existing-profile refusal is not bypassed.

## Frozen source fingerprints

- `desktop/src/main/transport-metadata.ts` — `d4d24cbdf0008c5d527fb91a5a5d519f2482ccc9bfd5527e15f7e4fa8bf68848`
- `desktop/tests/transport-metadata.test.mjs` — `686d12ef69a3fdfce01c814cb2f7a6c87b4ae23fc2c5e4f64323bea4b278df03`
- `desktop/module-map.json` — `b6415f60767dbb3cc788da0f0be41bb94c4d800839adae93d804a4eca55e2e9e`

## Actual hosted source closure — 2026-11-01 21:04 UTC

- Local reviewed source `75099ad2013a825a51986c22f3c0ed3a2e4d06cf`; tree `de5ee527d43dd9b8383f786f5be9353004489d8d`.
- Public `phase-02` `535b0942139820163815a4833e38ca248f3391a1` has the exact same tree and normal parent `538ae244676dca03708061c54a9f93a1a30b40b8`; history preserved.
- CI `41349689623` SUCCESS; source job `124976993745` SUCCESS, exact SOURCE_HEAD.
- Actual desktop **1333/1333** and DESKTOP_SOURCE_CHECK_PASS; foundation **109/109** with zero failed/cancelled/skipped/todo; Python **280**, OK under the unchanged no-skip gate. This is the actual uninterrupted hosted total, not a combined local count.
- All eight optional native/managed jobs SKIPPED, observed in terminal API metadata. No native artifact, device command or new managed proof is inferred.
- Single source log retained privately; independent retained-log audit PASS21:04 confirms exact checkout/source identity and all three software counts. Optional-job skips are the separate coordinator API observation, not inferred from that log. This documentation closure requires no repeated tests.
