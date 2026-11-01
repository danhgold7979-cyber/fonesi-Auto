# P2-01 retained-runtime rollback — bounded source checkpoint

Date: 2026-11-01. Status: implementation/source review CLEAR; stitched136-file local inventory complete. No current Windows compilation, rollback execution or whole-task acceptance is claimed.

## Requirement and entry

Original P2-01 requires restoration of a prior verified runtime, not merely a ledger record with a different digest. The accepted [instrumented PACKAGE invocation](P2-package-runtime-version-native-2026-11-01.md) remains exact historical evidence for public `b279d692c5d338eb6ed8f75b43e3569bb22afa0c`, tree `a4b52ea0590896c88051a902d029f3af5da5b193`, CI41320763809. Its1130/109/263 source and11 bootstrap+14 main predicates are not rerun or relabeled as coverage of this changed source.

The [finite rollback contract](../phases/P2-RETAINED-RUNTIME-ROLLBACK-CONTRACT.md) received independent design CLEAR on SHA256 `6b13969af62e299b1c2facbb2d74388b6f3f065185bee11eb474ef075c38292e`; source entry was recorded at15:47 UTC under the coordinator's original P2-01 delegation. Repository/remote/phase-02 identity was reverified, baseline local `6ddd3c88f2e3c000e0136400edc16350bae72ec5`, tree `5158889c3276b4f2fa2d635b374812b7a876ea26` (public docs closure `1bd53ace8f817fca52b9317b7c339544ff1996b5`).

## Implemented boundary

- Private immutable catalog separates known historical metadata, activation eligibility and current launch eligibility. Production still contains **only the original37.0.1 pin**, whose canonical candidate bytes and manifest digest are unchanged. No renderer, environment, disk file or constructor accepts an arbitrary catalog.
- Existing v1 append-only intent/settlement history is preserved. Reconstructed operation provenance binds each stage to its own candidate. Candidate-specific archive/file/hash/PE checks cover retained runtimes, current custody and factory admission. Known capacity is checked before intent:128MiB, five stages, four runtime directories and128 operations remain fixed; no pruning or adoption is added.
- Existing native setup interaction offers only the fixed install target or fully verified distinct predecessor, with genuine Cancel-default confirmation, private grant, captured revisions and shared custody. No renderer digest/path/URL selection is introduced. Known intact but launch-denied policy state permits allowed INSTALL; genuine uncertain/pending state remains latched.
- Current internal setup/runtime wire v2 reports install target separately from admitted active release. Schema8 adds the selected setup action while preserving historical schema6/7 parsing, exact pre-selection cancellation/failure and audit-flush semantics. Cross-action renderer/client generations prevent stale VERSION reads from restoring readiness after setup.
- Factory and bootstrap v2 bind the selected candidate's exact release/build grammar. Native VERSION remains the same fixed invocation, with exact protocol1.0.41 and selected literal release; there is no caller regex, new operation or server/device capability. The downloader uses only the immutable install target at the fixed Google origin, retaining no-redirect/one-GET/byte/deadline/actual-close rules.
- Changed C#/PowerShell bytes invalidate historical managed/native reuse. The existing eight managed groups remain, with two additional pure selected-release parser groups authored but **NOT_COMPILED/NOT_EXECUTED**. Historical recipient/retained/main/PACKAGE native opt-ins and old compile-only step are explicitly suspended; original ADB/fleet boundaries are unchanged. A refreshed exact runner must validate changed helpers before any new runtime campaign.

## Evidence and fixes

Actual owned filesystem tests compose synthetic buildA→buildB→rollbackA→reopen through real archive/ledger/files/provisioner and custody. They verify retained fingerprints, missing/tampered/revoked prior refusal, stale/busy/grant revocation, open/sync uncertainty, known capacity with no new intent/download, and record-only rollback at full stage capacity. The catalog replacement is a test-time source transformation, not a production injection hook or genuine second release.

Author affected evidence includes core20 plus ledger8 (stitched affected runs); catalog3; custody10; factory27/integration5/runtime-service16 together48, then one new actual transformed catalog/factory prior-release/launch-revocation test; downloader6; setup/wire/audit/UI67 followed by the added renderer causal test (13 renderer total); native/session/managed-runner17 source assertions; and six exact suspended-workflow tests. These scopes overlap; they are not summed as an uninterrupted aggregate. Independent review read the combined source/causal tests and requested the downloader-target, stale-renderer and pre-intent-capacity corrections; it did not duplicate the aggregate.

The first whole-check attempt stopped before tests at MODULE_GRAPH: an author-generated exact import map overwrote separate type/value imports from the same specifier. Merging those bindings corrected it; the actual96-module graph check passed. The next source check passed graph/quality/strict types/build/demo build/manifest and batches1–4, then failed batch5 (83 tests,82 pass, ordinal74): a journal fixture still materialized bootstrapv1. Its current fixture now uses exact v2 fields; legacy-v1 and final-LF-release negatives remain refusals. The first added negative used the fixture's exclusive-write helper and correctly hit EEXIST; it was changed to an explicit test-only mutation before the production refusal assertion. Unchanged passing batches were retained; remaining inventory was run once rather than restarting it.

Final stitched accounting: all **136 registered files** are covered. Batches1–4 passed within the original runner before its batch5 stop (their per-batch counts were not printed). Batch5 was83/82 with the one journal failure, corrected by the affected journal run and final causal negative. Batches6–9 passed315/315. Batch10 was67/57: two current native-source pins and eight historical pipe-derivation cases stopped on stale pins; the two exact pin checks and all10 pipe cases then passed. The derived historical parameterized fixture is byte-identical to baseline:3857B/SHA256 `ce092c9606548923cec4254602bafc2fff8a1f2000944ebf6f94bb42e465740d`; only its required current-source pin changed, with no new native result. Batches11–16 passed340/340. Batch17 was80/73: five old success-transition snippet extractions and two preparation fixtures assumed reusable historical managed bytes. All seven affected tests passed after exact current-success extraction and explicitly synthetic historical admission in those materialization-only fixtures. Actual historical reuse against changed current source now has a causal rejection assertion; its production ten-hash table is untouched.

No uninterrupted1155 local PASS is claimed. **1155 desktop tests are expected** from prior1130 plus25 net declarations, pending exact hosted execution. The final342-file registered quality corpus passed with381 informational diagnostics, zero warnings/errors; current build-manifest verification is true. Strict types, production/demo builds and manifest passed before the test-only repairs and remain applicable to unchanged product bytes. Foundation109 and Python263 are carried-forward evidence from unchanged scopes, not fresh local runs here.

## Frozen key source bytes

- `desktop/src/main/platform-tools-catalog.ts` — `9295c04488a5cdcc43bc22e1d730569904bd85a9287a39bd62579f70b207b2bd`
- `desktop/src/main/platform-tools-provisioner.ts` — `66f4d1915d762fb7afa31688d472cf3509726db08ddc6c42b2d7070c7868cfd9`
- `desktop/src/main/platform-tools-provision-files.ts` — `d70bbc7cc240df89bea1d211eaa9aa4e9dbe831f0bb51e06861bcdac4d0cb5e3`
- `desktop/src/main/platform-tools-runtime-custody.ts` — `7aa9a79ea7593395288c5f7526cbcbe2290b42af1e2618ffc8537972b602912b`
- `desktop/src/main/adb-host-factory.ts` — `907e9a8a3b4ed5932fac9360479ce3a5351fbba2ae1785928e7a216cdac62f59`
- `desktop/src/main/platform-tools-setup-service.ts` — `916751547fac2d949be66da7bd2e6dca0e13d0a506bb746a27997322ca5c1bda`
- `desktop/src/main/runtime-version-service.ts` — `531661006643bed30916bbce61bb6e819946f67954c3eaf8a2339c56781839b4`
- `desktop/native/RetainedAdbSession.cs` — `c22e40441fb6bc9bd7d1b1b1aaced656572c3ded8c2666d006449dd8b2f45470`
- `desktop/launch/Invoke-RetainedHost.ps1` — `35d825b536f5541c7ed33683884fd640a937c95d62330b73f3f3c952ccfe8750`
- `desktop/launch/launch-journal.cjs` — `2c233235579932a37577e63250bc78b193dd734778c71213ba8729baa909f62d`

## Remaining acceptance

P2-01 remains IN_PROGRESS: this closes the single-pin implementation restriction in source, but the production catalog still has no distinct eligible prior release. A second official candidate needs exact provenance/bytes/inventory/NOTICE review before adoption; real two-release rollback and updated native/compiler evidence remain pending. The accepted packaged positive is not erased, and consent/HTTPS/untouched-launcher exclusions are not invented as additional canonical rollback requirements. No server/profile/device/P106 or full-phase/formal acceptance is added. Amendment03 atomicity remains confirmed immutable settlement selecting verified bytes, not filesystem-wide atomic replacement or a false rollback of uncertain writes.
