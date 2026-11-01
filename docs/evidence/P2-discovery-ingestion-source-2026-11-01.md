# P2-03 — private discovery ingestion source evidence

**SOURCE IMPLEMENTED / LOCAL SOFTWARE1243 PASS — native acquisition NOT_RUN.**
This advances the original [P2-03](../phases/PHASE-02-adb-device-fleet.md) parser-to-durable-registry dependency, not a new task or live device capability.
P2-01 remains TECHNICAL_PASS/DEPENDENCIES_PENDING; P2 technical1/13 and overall11/154 remain unchanged.

## Adopted boundary and useful outcome

Independent design CLEAR at19:06 binds the pre-adoption [contract](../phases/P2-DISCOVERY-INGESTION-CONTRACT.md)
SHA256 `dc09add879b400c7d9169dc39a22635acb94cdd5cae302eccba52a81988791c9`.
The coordinator authorized concrete P2-03 source work while actual P2-02 server eligibility remains open.
Existing parser, pure reconciler, SQLite adapter, RegistryStore, durable audit and FleetService are reused.
No dependency, database migration, audit schema, native protocol, main/preload/renderer activation or new output bundle is introduced.

The new private ingestion service binds one opaque synthetic provider epoch to one owner, captures immutable bounded observation facts at result settlement, and requires actual fulfilled operation retirement before reconciliation. Its receipt carries the true durable revision, distinct from the process-local registry revision. It does not accept arbitrary source tags or identity proofs: every current provider is explicitly SYNTHETIC_TEST and proofs are empty. The existing FleetService rejects this source; no fake phone list, native provenance or dispatch grant is created.

RegistryStore and DurableCoordinator now propagate an optional callback-free final observation fence after the last external owner callback, including the actual SQLite pre-COMMIT admission and post-RESULT publication. Existing callers retain their original path. Before reconciliation, timeout may report known no-commit while retaining actual acquisition promises; once reconciliation is entered, the service awaits its exact durable outcome. Known COMMITTED remains COMMITTED even when epoch loss makes projectionCurrent false. Close has one120-second reporting budget and never treats an unresolved promise as retired or a mere audit wait as unknown database commit.

## Actual source and fixture evidence

- Coordinator/store affected19/19 PASS, including three new causal cases. Actual owned SQLite proves last-owner epoch revocation rolls back before COMMIT with unchanged ledger/fingerprint; post-COMMIT/RESULT revocation preserves the committed receipt and withholds current projection.
- Discovery service final22/22 focused PASS over actual owned SQLite with explicitly synthetic text/provider lifecycle. Covers distinct provisional records/order changes, duplicate/conflict and malformed-text refusal, real durable CAS divergence, epoch/owner revocation, delayed result/retirement, deadline/close, immutable settlement facts, restart, exact code privacy, reentrant constructor ownership and malformed native-Promise attachment. Earlier11/21 runs overlap; an intermediate overly strict promise-own-key check rejected normal Node async-hook symbols and was corrected before the final result.
- Synthetic store-to-Fleet composition remains unavailable, not an ADB_DISCOVERY positive. The fixture does not execute adb or establish physical identity.
- Parent's first coherent check stopped at TYPECHECK before build/tests. Direct compiler diagnostics identified narrowing-only errors: closed-code membership, captured provider optionality, intrinsic Promise generic return and an overly broad denial-helper return annotation. Repairs retain runtime predicates; direct strict TypeScript then PASS. The subsequent complete144-file aggregate passes TESTS_PASS1243/1243 and DESKTOP_SOURCE_CHECK_PASS, including metadata, closed graph, quality, strict TypeScript, production/demo builds and their provenance checks. This final invocation is uninterrupted; the earlier typecheck failure remains separately recorded. Unchanged foundation109/Python277 and managed19 evidence is carried forward, not rerun locally. Hosted1243/109/277 remains pending.
- Module inventory97→98 adds exactly the private ingestion module;99th module remains refused. Registered test inventory143→144 adds exactly its test, preserving all prior entries. Existing code/dependency/native bytes outside this finite slice retain prior proof only, not a new run.

## Frozen source SHA256

| File | SHA256 |
|---|---|
| `desktop/src/main/adb-discovery-service.ts` | `b2707cdda9759b60a055972d4b18058da49dabe2875b034f0bfa406ebd8256bb` |
| `desktop/src/main/durable-coordinator.ts` | `31695738d2456269360d305f6917777c43005fa1b0ef0aa5cbe01d756298c43a` |
| `desktop/src/main/registry-store.ts` | `c82dc73f88357995956a6d53d64deac71be903c997ea4df934ba63eaee96c945` |
| `desktop/tests/adb-discovery-service.test.mjs` | `4020680ea063199f00ce3c4e243f3b06d20ea281d942fbd8fbbc5b397daa3ffc` |
| `desktop/module-map.json` | `afbe4d54cba92f086b79f602b5749f05b3198562809a6a19eeca289f4f7c2269` |

## Remaining original requirements

Current [Windows compile/managed19 proof](P2-retained-server-source-2026-11-01.md) is retained, not replayed here. Actual owned server lifecycle still needs a genuinely eligible Windows native KnownFolder whose `.android` entry is absent, unchanged native ownership/privacy guards, and separately reviewed finite lifecycle/fault execution. No existing profile/key adoption, deletion or environment/account/security workaround is proposed.

P2-03 still needs an actual owned discovery acquisition issuer, live conflict visibility, sufficient identity proof acquisition and real two-phone reorder/reconnect evidence. This checkpoint intentionally provides no ADB_DISCOVERY issuer or production service instance; no caller-controlled source switch can convert software fixtures into native evidence. Later main activation must be separately reviewed against actual server/runtime custody. No native campaign or accepted-task-count increase is implied by source publication.

Independent implementation/type-delta review completed19:14 with no reviewer test/build rerun. The parent owns the sole final aggregate; final docs/index/hash/inventory closure completed19:16 before source-only publication. No native opt-in marker is included.
