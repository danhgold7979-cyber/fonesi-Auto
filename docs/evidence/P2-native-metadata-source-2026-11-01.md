# P2-06 sealed native metadata producer / typed actor — SOURCE evidence

**Current status: coherent source implementation independently reviewed CLEAR; final source-only publication pending. Current changed C# compilation / 39 managed groups NOT_RUN; actual socket/server/profile/device metadata NOT_RUN.** No task acceptance is added: P2 technical1/13, overall11/154, formal0 remain unchanged.

[Adopted source contract](../phases/P2-NATIVE-METADATA-SOURCE-CONTRACT.md) received independent source-entry CLEAR at21:19 for pre-adoption SHA256 `493c1589b798a294e5a2fe0abedf0083de2ca3198991fe908570e90c767459ab`. Narrow subsequent private-handle and local-BUSY distinctions preserve the same no-effect/source scope. Source eligibility of a unique provisional DEVICE on its exact observed transport is not physical identity, input authority, actual device authorization or main activation.

## Concrete outcome and reused boundaries

The existing retained acquisition object, socket/connect/close work, shared ordinary lane and combined128 query cap are reused for nine fixed metadata commands. A same-socket transport-id selection precedes the fixed shell-v2 request; strict incremental framing accepts bounded stdout/stderr, exactly one remote exit and EOF. Query socket retirement, remote command exit, foreground server retirement and helper output/Flush retirement remain different facts. No process SUCCESS/exit0 is invented from socket facts. No new scheduler, dependency, archive, fallback command, policy change or profile workaround is introduced.

An actual RegistryStore private record binds the committed ledger epoch/revision to the exact projection. Native ingestion retains the exact normalized acquired rows; only a matching unique row and current committed projection can issue an opaque target. Every new projection invalidates older tickets; a bounded memo never silently upgrades them. A source-labelled snapshot or structural store cannot mint authority. The final captured store/provider/custody witness is callback-free, distinct from ordinary admission callbacks.

The existing actor receives a separate v3 metadata route with immutable transport ID and two real query promises, not a DeviceProcessResult cast. A private native owner accepts only the opaque ticket and existing queue budget; no caller clock, source, current or dispatch callback is accepted. Existing synthetic metadata owner, parser and v1/v2 process/input behavior remain separately attributed. No product main/renderer edge activates the native owner. Nine captured-time fields keep bounded stale/unavailable semantics and per-field mutation ordering.

A confirmed immediate local no-query refusal is distinguished by a private immutable handle discriminator, never a native-frame label. Reserved QUERY path does not itself claim physical wire or remote dispatch. Native wire failure/unknown remains conservative epoch loss and cleanup. A sealed localBusy witness can authorize only a no-effect refusal before inspection-sensitive admission, never publication, ticket renewal or weakened final custody checks.

## Exact changed paths

- New `desktop/src/main/metadata-query-contract.ts` and `desktop/src/main/owned-transport-metadata.ts`, with their two tests.
- `desktop/src/main/adb-host-adapter.ts`, `adb-host-bridge.ts`, `adb-host-factory.ts`, `adb-server-service.ts`, `adb-discovery-service.ts`, `registry-store.ts`, `device-actor.ts` and their affected tests.
- `desktop/native/RetainedAdbSession.cs`, `RetainedAdbProtocol.cs`; managed `desktop/tests/fixtures/RetainedAdbProtocolFixture.cs`; affected session/protocol/admission source assertions.
- `desktop/module-map.json`, `desktop/scripts/check-module-graph.mjs`, `build-manifest.mjs`, `test-batches.mjs`, and `desktop/tests/module-graph.test.mjs`: exact106 private graph nodes and two additive test files, no new output bundle.
- `desktop/verification/Invoke-RetainedManagedFixture.ps1`, `validate_retained_host.py`, `test_validate_retained_host.py`, `retained-rollback-workflow.test.cjs`, `desktop/scripts/retained-managed-fixture.mjs`, `desktop/tests/retained-managed-fixture.test.mjs`, `.github/workflows/phase-02-software.yml`: refreshed managed-only v5 gate, historical v2/v3/v4 tables retained.
- This evidence, the adopted contract, and `docs/PHASE_STATUS.md`.

## Validation attribution — final local source checkpoint

Author focused evidence: shared leaf5/5 and new low-level adapter/bridge5/5 PASS; unchanged adapter/bridge36/36 PASS. Native source assertions33/33 plus overlapping reviewed shared-unknown correction2/2 PASS. Registry/ingestion/server slice61/61 plus two separately added causal cases PASS (63 authored cases); its actual SQLite→same sealed ticket→owner/actor held-HEALTH composition was extended and checked once again, not counted as a new native test. Actor/new owner/unchanged synthetic owner initially46/46 PASS; later BUSY, remote-unknown, local-code and deterministic timeout corrections used narrow overlapping checks. No transformed fixture is actual native provenance.

The sole whole-source attempt passed pre-test stages and batches1–2, then failed batch3 at72/71/1 (ordinal47). A detailed batch rerun72/72 identified the case as the new20ms wall-clock timeout fixture, not a reproduced private assertion; the source permits pre-dispatch expiry under scheduling load. Its injected clock is now deterministic while the actual20ms timer and retained promise/reservation checks remain. No production deadline increased. A final narrow local-refusal classification fix was checked separately; its code cannot classify a native QUERY response as a local refusal.

Remaining inventory was run without repeating the completed first two batches. It exposed the two new test paths inserted out of sorted order (batch14 64/63/1); only those two entries moved to canonical sorted positions, all prior paths/order preserved, and inventory5/5 PASS. It then exposed the historical workflow test's stale Python280 assertion after the explicit new v5 inventory became283; the assertion's large diff exhausted the unchanged64KiB batch capture. The test now checks exact283 and still rejects stale/relaxed counts under LF/CRLF; targeted2/2 PASS. No capture cap, production predicate or no-skip gate was relaxed.

Final stitched evidence covers all153 registered files: the earlier successful first16 files plus **1157/1157 tests in the remaining137 files**, with the corrected failure batches rerun and all other successful batches carried forward. Continued execution used the retained original file partitions to avoid duplicating already passed files after sorted insertion; this is not an uninterrupted final aggregate or a claimed current hosted total. Actual final hosted desktop count remains pending. Final TypeScript and BUILD_VERIFIED PASS, current build-manifest equality true; quality376 files PASS with444 informational diagnostics and no warnings/errors. Current managed gate6/6 and strict validator31/31 PASS; Python discovery confirms283 authored cases, not283 executed locally.

Current changed C# has39 authored controlled managed groups (prior27 inventory plus12 metadata groups, including reviewed shared late-unknown variants), **NOT_COMPILED / NOT_RUN locally**. Historical foundation109 and full Python280 evidence remain explicitly carried forward until corresponding current CI. Independent reviewer read the source, causal tests, exact native boundary and gate; no duplicate reviewer suite/native run occurred.

The managed-only workflow uses the same reviewed fixed Framework compiler, references, owned supervisor and cleanup. It runs no real provider, socket, ADB, archive, Electron, server, profile or device route. Current v5 publication requires its exact ten input hashes and39 actual groups; old v4 opt-in is suspended. Python inventory is283 with the exact-count/no-skips gate preserved. Historical managed27/1333 desktop source proof remains evidence for old bytes only, not this changed implementation.

## Remaining original-scope gaps

P2-02 actual eligible absent-profile server proof remains unmet; existing `.android` is not adopted, inspected, removed or redirected. P2-03 actual acquisition/device evidence and P2-06 actual metadata compatibility/activation remain unmet. The pinned modern BatteryService output has extra fields rejected by the unchanged strict parser: truthful unavailable is expected for that format, not fabricated nine-value success. No physical identity promotion, input/capture authorization, metadata DB migration, production operation-audit/UI activation, new native device campaign or full-task acceptance follows from this source batch.

## Frozen source and runner SHA256

- `desktop/src/main/metadata-query-contract.ts`: `ffa974fda4a0d649cb7d2f7c8fcf690c631a91432b48b03100ed7c28c53c8ca2`
- `desktop/src/main/owned-transport-metadata.ts`: `e302506fbf8a22bb78ef4cdb1605a864c80ff58e07c62ad9dc85f815966c7228`
- `desktop/src/main/device-actor.ts`: `1bd35c66524759942f16f4511a5d5deb6c12db5230caed88a214b1f441d8c73c`
- `desktop/src/main/registry-store.ts`: `59fec10a525fd6705d26b8fa5383dba6e4d1f4629dc23b3f8c9d0738d73d4f82`
- `desktop/src/main/adb-discovery-service.ts`: `c43045425a18d1683c6c1c935833b694f946aa32175275efe0078c2b732bbf05`
- `desktop/src/main/adb-server-service.ts`: `a4988910a08fe4ec8f9d4130dccbc7810ac14180be8db31e4975cdc9686391ce`
- `desktop/src/main/adb-host-adapter.ts`: `b9123c613f6eff79dbf2c7e3efd0c209b58b958634ede244be0cfbc32a50f919`
- `desktop/src/main/adb-host-bridge.ts`: `dd0c17b3173b6b779ddfc0fdcaf948fec995ba02ac7b7748a06cd0fda484a7f9`
- `desktop/src/main/adb-host-factory.ts`: `3c75a2e5fcb60d62097f2a7ddbcb4552885457c1da461b4c003b700d36bfa1a9`
- `desktop/native/RetainedAdbSession.cs`: `be62300592244f1474fa340101976cb86ad5ed5c6734b98b28dc545d6b00ce71`
- `desktop/native/RetainedAdbProtocol.cs`: `8af014e0d5082ec3bc0c2872c06114b34f621bfd6097fea61b86d7ba832df5fd`
- `desktop/tests/fixtures/RetainedAdbProtocolFixture.cs`: `c10522693707ac3e526756044cf87b58abf9c037704031bfeeca7af26ae92aff`
- `desktop/verification/Invoke-RetainedManagedFixture.ps1`: `63d276e48a1f2d39cb45f259bca2c24e7a4017938d6fd1098133b1888820e141`
- `desktop/scripts/retained-managed-fixture.mjs`: `5f23e3ae03fd349edac4ff582c99106914980669329d07421e2f4031e4651804`
- `desktop/verification/validate_retained_host.py`: `a122d4ee56f7b4e408f75cace7032c0c2e5fc4ea6bde90725b1d1a26f62c4c15`
- `.github/workflows/phase-02-software.yml`: `f05f9867cb70a00e47bc930c45685d4c458b2c6eb4d52973aa53b1c5de6803c3`

Independent final index/docs/hash closure CLEAR at21:39: exact38 files, all16 recorded fingerprints and current ten v5 pins, historical tables, sorted additive inventory and relative links verified. This is source/execution-readiness review under standing engineering permission, not observed Windows compilation or managed39 PASS.
