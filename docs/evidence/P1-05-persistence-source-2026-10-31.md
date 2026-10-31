# P1-05 persistence implementation evidence — in progress

## Scope and entry

Coordinator authorized the reviewed [persistence contract](../phases/PHASE-01-P1-05-PERSISTENCE-CONTRACT.md)
and [ADR-0007](../decisions/ADR-0007-foundation-persistence-backup.md) at 07:05 UTC on
2026-10-31. Work is on `phase-01`, under the recorded development-only exception.
This is not task acceptance: technical task count remains 5/11; formal acceptance
remains pending the unchanged Phase 0 chain. No domain/device/account service or
public v1/v2 IPC method has been added.

## Current source checkpoint — 07:27 UTC

The actual desktop pipeline passed **181/181 tests**, including exact 28-module
source/import graph, strict compiler, reviewed quality checks, build and manifest.
This is Linux source/owned-filesystem evidence, not Windows or native key evidence.
New sources implement:

- Exact two-migration, five-table `node:sqlite` foundation with explicit statement
  finalization, WAL/FK/defensive settings, schema/history/row validation and content
  witness comparison under `BEGIN IMMEDIATE` before DDL.
- Streaming authenticated AES-256-GCM backup container, fixed authenticated header,
  bounded private staging and exclusive destinations. Tests use a synthetic key
  adapter, explicitly not DPAPI protection or a native persistence proof.
- Real SQLite snapshot → encryption → authenticated decryption → SQLite/hash/row
  validation → unique promotion and canonical receipt readback. Migration receipts
  remain external until the witness check and schema 2 permit catalogue import.
- Main-owned root/location identity and exclusive writer lease; borrowed children
  receive assertion only, not release authority. Retained release receipts preserve
  identity if normal release is interrupted. No automatic stale-lock stealing.
- Canonical backup-location configuration; persisted daily admission before backup;
  current-file revalidation before seven-copy ordinary retention; protected migration
  copies remain separately classified. Unresolved directory/catalogue state blocks
  deletion rather than guessing which copy is safe.
- Separate restore destination with transactional quarantine. Root provenance is
  independent of database rollback. Complete restored-app/native entry integration
  remains in progress; the current restore test is a real library/database test.
- Key-profile preflight and exact private Local State checkpoint before native launch.
  Existing provisioned material requires the source-backed `os_crypt.encrypted_key`
  canonical base64/DPAPI prefix shape; this is not decryption or usability proof.
- An orchestration layer that provisions schema 0 without migration and refuses
  dependent migrations until a separate exact supervisor durability receipt exists
  and the original backup authenticates again. Unit tests inject that receipt to
  test refusal/admission logic; they do not establish real process-boundary evidence.

The exact [Chromium 156 DPAPI provider source](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.49/components/os_crypt/async/browser/dpapi_key_provider.cc)
defines that preference/header and separately performs native decryption. Local
State is capped at 64 KiB for this foundation evidence envelope; over-limit fails
visibly and does not reset the profile. Broader profile sizes are not certified.

## Review findings addressed so far

The actual SQL `LIKE 'sqlite_%'` filter admitted an unintended wildcard character;
its replacement uses the literal reserved prefix through `GLOB`, with an actual
`sqliteXhidden` negative. Dangling links are rejected using `lstat` and absence is
accepted only on `ENOENT`. Ordinary mutable location objects are snapshotted before
awaited ownership checks. Owned test paths are file-relative, not process-cwd-relative.
SQLite read-only validation can create WAL sidecars; successful settled snapshot
cleanup names only its own exact database/WAL/SHM paths. Failed work remains private
and is not promoted on file existence.

An initial reviewer concern about JavaScript `$` accepting a trailing LF was
withdrawn after testing the pinned runtime. Explicit length checks are defensive
clarity, not evidence of a previously reproduced parser vulnerability.

## Pending mandatory evidence and integration

Native safeStorage/Windows execution is **NOT_RUN for P1-05**. The selected sequence
must prove provision → actual orderly shutdown and whole-tree retirement → original
backup authentication → abrupt owned-tree termination → original backup authentication
again. Supervisor ownership spans these processes; `will-quit` alone is not native
retirement, and availability/new encryption never replaces old-key recovery.

The before-ready preflight runs outside Electron; asynchronous filesystem work in
Electron entry cannot by itself guarantee that readiness has not already occurred.
Existing runtime/logging evidence remains separate. Native maintenance dialogs,
five exact entry literals, full app lifecycle, restored-root reopening and the
complete Windows failure matrix remain to be integrated and reviewed. No P1-05
technical PASS, target-host support, portable recovery, power-loss guarantee or
plaintext fallback is claimed. The old navigation FAIL and original Phase 0 exits
are unchanged.

Current catalogue metadata bounds are 64 retained location mappings and 512 total
record rows, including retired rows. These are fail-closed development bounds, not
product/device capacities: eventual history compaction requires a later explicit
reconciliation policy. Reaching a bound retains data and blocks pruning; it does not
authorize deleting newer good backups or rewriting history.

The old P1-02 static test forbidding SQLite/safeStorage anywhere in the entire main
bundle is superseded only for these explicitly authorized P1-05 main-owned services.
The same forbidden-service checks remain on the compiled public bridge and preload;
main still forbids external-open and child-process application services. Existing
real public-read dispatch/rejection tests and the v1/v2 method surface are unchanged.
This is a scoped source-test correction, not a renderer privilege or historical
navigation-gate waiver.

## Integrated source and first native checkpoint — 07:50 UTC

The later full desktop pipeline passes **208/208 tests** with an exact **32-module**
map. It includes synchronous production READY-entry checks, native-dialog adapter
wiring for the five approved maintenance literals, an opening/shutdown synchronization
helper, and actual restored schema 0/schema 2 SQLite reopen/quarantine tests.
The native-dialog adapter tests inject dialog answers; they are not native widget
interaction evidence. The prepared production entry does not accept verification
stage flags. Public bridge/preload methods remain unchanged.

The full Python suite passes **57/57**, including 11 strict private/public persistence
evidence tests; the Node envelope contributes four tests within the desktop total.
The existing foundation suite remains separately reported, not added to that total.

The first hosted persistence step is explicitly **HOSTED_KEY_MECHANISM_ONLY**:
source and renamed owned package each provision a schema 0 encrypted backup, exit
orderly and retire, authenticate the same old backup, execute an actual main-process
`process.crash()`, retire the whole Job, and authenticate that old backup again.
An `app.exit()` shortcut was rejected as insufficient evidence of skipped native
teardown. Only a fully validated chronological sequence produces a PRIVATE
`ORDERLY_AND_ABRUPT_RECOVERED` proof. It is never fabricated from availability or
same-process tests, and IDs/hashes/control files are not public artifacts.

The existing successful official installer hands off a fresh, same-head private
runtime inventory; the new step rechecks the complete bounded distribution before
reuse. No existing arbitrary dist is accepted as installer provenance. Existing
logging/runtime reports are unchanged. New private `.persistence-runtime/` outputs
are ignored. Public upload requires exclusive successful sanitization and a fixed
post-close marker; raw private state is never uploaded.

Current envelope bounds: 120 seconds per operation plus 10 seconds retirement;
32,768 characters per captured stream; 64 KiB private/public documents; 8 MiB
per disposable UI profile; 128 MiB per synthetic persistent-data/backup tree;
512 MiB distribution; 256 entries/depth 16 per owned tree. These are separate
synthetic test envelopes, not a larger profile allowance or production capacity
claim. Whole-root disposal requires every relevant Job to be confirmed retired.

### Explicit remaining completion work

No Windows P1-05 result is recorded yet. The key-mechanism result must be observed
before dependent migration/native acceptance. The trusted production first-use
bootstrap/READY handoff, actual main maintenance launches, and the remaining Windows
migration/backup/restore/failure matrix still require end-to-end evidence. The new
main consumes a prepared READY control; unit-injected proof is not a substitute for
that production bootstrap. This checkpoint is not P1-05 TECHNICAL_PASS.

Restore preserves the exact pre-launch Local State checkpoint into a new owned
root, never a live directory copy, and retains the original root/material. Same-user/
machine copied-material old-backup recovery is still an empirical gate; no
cross-machine portability, missing-profile recovery or generic secret-vault claim
is made. Restored roots reject NORMAL application mode and automatic timers; schema
0 migration and schema 2 reopen retain SQL/root quarantine. Later recovery/admission
reconciliation remains outside this foundation's authority.

Independent review of the current source/envelope is CLEAR: reviewer reran the full
208/208 desktop and 57/57 Python suites. Author separately reran foundation109/109;
all five foundation stages passed. Original Phase 0 SHA256 remains
`3882e2112129fdc0dcdc69104195cc95d8f90c933a210c9002cd16642873316c`.
The reviewer did not execute Electron/Windows or install dependencies in this review.

## Observed hosted key mechanism PASS — 07:59 UTC

Coordinator accepted **HOSTED_KEY_MECHANISM_PASS**, not P1-05 task completion, after
independent strict artifact review. Exact public head
`990b511e639345905b2d8614cd06f348eb431012`, tree
`a25a030e2174cb67e8ced37e6878e05ca2eb538c`; Windows run
[41182496843](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41182496843)
completed SUCCESS. Actual hosted suites: desktop208, foundation109, Python57,
PowerShell30. The separate foundation runtime/logging report remains PASS; it is
not evidence that the new READY persistence path was exercised.

[Retained mechanism sample](P1-05-key-mechanism-sample-2026-10-31.json):
artifact13034759249, exact original/Git-blob LF bytes **4,643**, SHA256
`cb4d60a4438ecedfe4e93e146677055c685ae7f59bfa1b722a3a5c9f5c596fe6`.
The reviewer independently performed duplicate-aware parsing, strict reconstructed
schema validation/public equality and fixed-field privacy review; no second native
runtime or duplicate download was claimed.

Both source and naturally packaged modes passed all four ordered stages. Provision
has no previous backup: `existingBackupMatched` and the derived
`oldBackupWitnessMatched` are correctly false; seven of its eight raw case booleans
are true. Each later stage has eight true raw cases and matches the original
supervisor-held witness. Both actual crash stages returned native NONZERO_EXIT
**-36861**, with no orderly-quit observation and verified whole-Job retirement.
The subsequent process recovered/authenticated the SAME old backup. All process
and directory cleanup predicates are true; failure is null. No raw keys, ciphertext,
backup IDs, private paths or process logs are retained in the public sample.

This establishes the selected conservative initialization mechanism on this pinned
Windows source/package execution environment. It does not establish production
first-use orchestration, actual READY main startup, maintenance dialogs, the complete
migration/backup/restore failure matrix, cross-user/machine recovery or target-host
support. Those remain the next P1-05 work; no task count or formal gate changed.

## Production READY-path verification increment — 08:12 UTC

The next hosted envelope retains the accepted four-process key sequence, then
performs the production pre-native READY preflight and launches the actual compiled
`main.cjs`, not a parallel test application. It requires the application's READY and
CLOSED markers, observed orderly quit, exit 0 and whole-Job retirement. Only then does
an independent read-only SQLite inspection require schema 2, two protected migration
backups, one startup DAILY backup and persisted admission state. Source and naturally
packaged modes use the same procedure. The strict version 2 public report explicitly
labels this `HOSTED_KEY_AND_MAIN_READY`; historical version 1 remains supported as
mechanism-only evidence.

The production first-use native-dialog callback now captures a selected parent,
defaults confirmation to Cancel, rechecks ownership after each awaited dialog and
calls the real provisioning service only on confirmation. Six pure injected-dialog
tests passed and were independently reviewed. The verification provisioning wrapper
uses that callback with explicitly injected answers; it does not prove interaction
with real native dialog widgets or an installed end-user first-use launcher.

Current envelope review passed 61/61 Python tests and 5/5 focused Node tests. The
latest full desktop aggregate independently passed **212/212** at 08:13 UTC,
including strict compiler, quality, module graph, build and manifest. The reviewer
cleared this source/envelope increment; owned test output was empty. Corrected READY/native
execution remains NOT_RUN until the next exact-head hosted run. Full maintenance,
copied-profile restore and migration-crash/failure coverage remain pending; no
P1-05 technical or formal task acceptance follows from this increment.

## Actual READY-path hosted PASS — 08:17 UTC

Coordinator accepted **HOSTED_KEY_AND_MAIN_READY_PASS**, not full P1-05, on public
head `09ef6a66ff42db139f60c927f55d20385e003fc0`, exact tree
`855ada668a91ad775c84283356b1c0d6bf6c5d05`, successful Windows run
[41183789682](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41183789682).
Actual suites were 212 desktop / 109 foundation / 61 Python / 30 PowerShell.
[Exact retained READY report](P1-05-ready-sample-2026-10-31.json), artifact
13035719419, has **5,520 LF bytes**, SHA256
`b57f69004927fa6478615f4158767d41f81611b93cdeb58bedd73ab3aa7796ba`.
These hashes describe artifact/Git-blob bytes, not an unconfigured checkout transform.
Independent duplicate-aware strict v2 reconstruction/public equality and privacy
review passed; no second native run or duplicate download is claimed.

Both source and packaged modes passed original key recovery, actual main READY,
orderly exit 0, full process retirement, schema 2, two protected migration backups,
one startup DAILY backup and its persisted admission, plus directory cleanup.
This settles that concrete READY path. It does not certify the subsequent new
production launcher, per-store proof v2, maintenance/crash matrix or restored-profile
native recovery; those changes require their own exact-head verification.

## Next implementation checkpoint — in progress

The next matrix uses isolated real SQLite before/after-COMMIT crashes, separate
reopen/history checks, and the actual native maintenance adapter with verification-
only dialog answers. Seven ordinary copies and protected/released safety copies are
counted separately. The online-copy fixture commits from a real second WAL connection
while the snapshot promise is unsettled; it proves coherent before/after contents,
not a page-copy synchronization barrier. All private captures, IDs and key material
remain excluded from fixed public reports.

The usable developer launcher now has production native dialog initialization,
separate orderly original-backup authentication, an honest version-2 per-store proof,
verified READY handoff and ownership through interactive shutdown. Its normal UI
lifetime is not killed by the 120-second initialization limit. Source control fixtures
use explicitly synthetic native outcome records; they are not DPAPI/runtime proof.
Actual launcher testing uses coordinator-approved, exactly audited verification-only
entrypoint substitutions for dialog answers/auto-close, never production test flags.
The approval does not claim genuine widget clicks or installed P1-10 packaging.

Current author full desktop pipeline passed 238/238 before one additional quality
scope regression; that regression separately passed in the 12/12 quality suite.
Python 79/79 passed after staging the updated exact LF config/hash bindings so the
real checkout-index test exercises current bytes. New launch CJS is explicitly part
of the existing formatter/linter corpus with unchanged rules/packages; config hashes
were updated, not ignored. Latest complete independent aggregate and native execution
are still pending. No task-count increase follows.

### Integrated production-launcher and native matrix checkpoint — 08:54 UTC

The author full desktop pipeline now passes **247/247**; the strict Python suite
passes **92/92**. Earlier counts above are dated checkpoints, not current totals.
The combined source passed final independent verification as recorded below. No new
Windows outcome is claimed before exact-head execution.

The matrix now requires both source and packaged results for before/after-COMMIT
crash recovery, real second-connection SQLITE_BUSY migration denial, all five
maintenance commands, seven-copy retention and native reopen of the copied
restored key profile. Restore requires authentication of the original bootstrap
backup, schema/quarantine and automatic-admission denial, and unchanged source
DB/key-material witnesses. Missing/corrupt copied-profile negatives are explicitly
pre-native tests. Historical public schema versions 1/2 remain distinct; the new
version 3 scope is `HOSTED_KEY_MAIN_STORE_MAINTENANCE_RESTORE`.

A separate fixed report covers the actual developer launcher twice: first
`CreateUnder`, then reopening the same `Root`. An exclusive verification copy has
exactly four counted, hash-bound substitutions; original initializer, control,
provider and main code still execute. Only native dialog answers and quit-after-
READY are instrumented. The outer 120-second test bound does not change production
`RunInteractive`'s unlimited UI lifetime. Original-backup identity, honest v2
orderly proof, persisted admission/backups and released lease are checked after
whole-process retirement. This is not genuine widget interaction or P1-10 installed
packaging. Uploads contain only strict fixed reports, never private captures,
paths, keys or backup contents.

Remaining completion evidence is finite: this combined native matrix and launcher
must pass on the exact published Windows head, then canonical P1-05 criteria must
be mapped to the observed outcomes and their limitations. Injected faults, online
snapshot promise overlap, copied-profile corruption and native dialog automation
must retain their precise labels; no disk-fill, OS-key revocation, power-loss or
cross-machine key recovery guarantee is inferred. P1-05 and formal Phase 0/Phase 1
acceptance remain pending; technical task counts are unchanged.

Independent final source/envelope review at 08:56 UTC passed **247/247 desktop,
109/109 foundation and 92/92 Python**, with no skipped/cancelled cases. Owned test
outputs were empty, original Phase 0/native helper hashes unchanged, and final
workflow/publisher review CLEAR. Native matrix and launcher execution remain
NOT_RUN pending the coordinator's exact-tree publication.

### First combined Windows attempt — source-stage failure, 10:04 UTC

Public head `8523b1950ca47164e3614a59a9326df0dcf0b7eb` (tree
`033148c6d92e10c9608fcf3ec6468022eaf4ae7b`) ran in
[41191079997](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41191079997),
job 124507825230. The source checker reported `TESTS_FAILED`; native matrix and
launcher execution were not reached. The original runner's fixed stage-only output
does not establish which assertion failed, or distinguish test timeout/capture
failure. No native PASS is inferred and no functional cause is claimed.

A diagnostic-only follow-up preserves the existing 30-second child deadline,
65,536-byte capture cap and all test success predicates. On failure it emits only a
fixed process category, six validated numeric summary fields, and at most 16 numeric
TAP failure ordinals. It never echoes test titles, YAML, exception text, paths or
captured stdout/stderr. Ordinals identify cases in that exact registered test-run
order, not a stable cross-revision product identifier. Missing/malformed/duplicate
summary fields remain unavailable; they never authorize success. Three disclosure/
bounds regressions pass and the full local pipeline passes **250/250**. The next
exact-head Windows run is diagnostic, not a claimed fix for the unknown cause.
Independent diagnostic review CLEAR at 10:05 UTC; reviewer reran the three focused
regressions, not a second full aggregate. No actual-cause fix or acceptance follows.

### Diagnostic result and portable fixture correction — 10:11 UTC

Diagnostic head `174c1a9e9572e0d229edfce6ab2f471349acb2d3` ran in
[41191419322](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41191419322),
job 124508812751: **250 tests, 248 pass, 2 fail**, no cancellation/skip/todo.
The child exited nonzero, not by timeout/capture limit. Exact-run ordinals mapped to:

- 220: launch CJS quality-corpus fixture. Its inventory comparison used `/` while
  Windows `path.relative` returns `\\`; the assertion now normalizes separators,
  matching the existing inventory test convention. Actual lint denial/category and
  required file inclusion remain mandatory.
- 241: positive owned restored-control fixture. Its exact failing internal step is
  still unknown. The fixture now reports only an allowlisted stage/error category
  on failure; original assertions and failure propagation remain unchanged. A TEMP
  canonicalization hypothesis is not treated as fact or patched speculatively.

The follow-up local pipeline passes **251/251**, including four safe-diagnostic
regressions. No service, ownership, native process, schema or cleanup predicate was
relaxed. Native stages remain unexecuted on both failed Windows attempts.
Independent narrow source/diagnostic review CLEAR at 10:12 UTC; four focused tests
passed independently. Cleanup diagnostics preserve the original failure and do not
replace it with a later cleanup error. The full 251-test run is author evidence.

### Restore fixture canonical input — 10:17 UTC

Run [41191859518](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41191859518)
on `583f71f636e15593f92e4416275a740a59309ed5` produced **251 tests, 250 pass,
1 fail**. The portable inventory correction passed. Remaining ordinal 242 mapped
to the same restore positive fixture, with fixed `PREPARE` /
`PERSISTENCE_FILES_REJECTED`; no cancellation/skip or native execution occurred.

The fixture now resolves its newly and exclusively created temporary root through
`fs.realpathSync.native`, matching the native canonicalization used by production
`fs.promises.realpath`, and explicitly asserts async canonical identity before
preparation. The ordinary synchronous JS path walker and native binding can differ
for Windows path spelling; the exact hosted alias was not logged or proven. This
is a canonical fixture-input correction, not relaxation of production ownership,
no-link, lease, profile or recovery checks. Missing/corrupt copied-profile negatives
now require `ENOENT` / `KEY_PROFILE_MATERIAL_REJECTED` respectively, so an unrelated
ownership failure cannot satisfy them. Focused **6/6** and full local **251/251**
pass; exact-head Windows confirmation remains required.
Independent fixture-only review CLEAR at 10:17 UTC with a separate 6/6 focused
rerun; the full 251-test result remains author evidence.

### Source suite recovered; fresh supervisor base correction — 10:23 UTC

Run [41192375990](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41192375990)
on `7669d7f5f1eba3929e327ac87d14a35a7966185d` passed the source suite (251),
foundation (109), Python (92), PowerShell boundary cases (40) and syntax checks.
The canonical fixture correction therefore passed on Windows; exact private TEMP
spelling remains unobserved. The next interactive-lifetime supervisor regression
failed before downstream application probes, with only its fixed failure marker.

Source/workflow ordering establishes a fresh-checkout defect: that regression
validated `desktop/.runtime` before creation, but the later `Invoke-Foundation`
step was its first initializer. The regression now validates its desktop parent,
exclusively reserves the absent base through the unchanged reviewed native helper,
and validates the resulting directory. Existing/reparse entries are not adopted
without validation. The test still validates all owned children before deletion;
no unknown directory or production root is removed.

A fixed nine-value stage code is emitted only on failure and forwarded by an exact
workflow allowlist; no raw exception/child output is printed. Helper hashes,
interactive lifetime, 30-second bounded case, outer 120-second supervision, cleanup
and capture bounds, and all pass predicates are unchanged. Local full pipeline
**252/252** and focused helper/source **3/3** pass. Actual new supervisor/native
execution remains pending; this is not a full P1-05 result.
Independent fresh-base delta review CLEAR at 10:24 UTC, with 3/3 source/derivation
tests rerun. No local PowerShell/native execution is claimed.

### Native matrix partial result and maintenance diagnostics — 10:29 UTC

Run [41192651453](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41192651453)
on `96c147602cb3c404e804655663a295500c47781d` passed the three actual native
supervisor lifetime cases and the separate foundation runtime envelope. The
persistence report remained **FAIL**: source key sequence and real-main READY
passed; source before/after-COMMIT crash and reopen predicates, including real
SQLITE_BUSY migration denial and process retirement, passed. Maintenance/restore
and packaged-mode results were absent, `failure=STAGE_VALIDATION_FAILED`, and
`directoryCleanup=false`. Those missing results are not success. Final directory cleanup was skipped after
the prior failure; this does not establish a cleanup malfunction or a cleanup PASS.

Maintenance result files are emitted only after all checks and orderly quit. The
current aggregate failure does not identify whether native maintenance failed or
its result/transport validation rejected. A narrow follow-up emits allowlisted
native operation-stage/error categories, process status, and strict validator
read/schema/process/framing stage. Only exact fixed markers are forwarded, never
private stdout/stderr or exception strings; complete schema and PASS requirements
are unchanged. This is diagnosis, not a claimed maintenance fix.

The approved disk-full negative now invokes the real backup-service/migration path
with an isolated test-process wrapper on only its exact owned pending-container
write. One real write succeeds, then an injected `ENOSPC` yields `IO_FAILED` and
blocks migration. Database version/fingerprint and every retained good backup/
receipt hash remain unchanged; the partial pending file is not promoted and the
old encrypted copy still validates. Bindings are restored before final validation/
cleanup. This proves injected failure handling, **not actual disk exhaustion**.
Independent focused review passed 7/7 service tests. The separate faithful actual
write-denied persistence case remains an explicit acceptance gap; no changed open
mode, standalone dummy-file failure or host ACL alteration substitutes for it.

Current author source pipeline **254/254** and Python **93/93** pass. Exact-head
Windows maintenance diagnosis and remaining matrix completion are still pending;
P1-05 is not technically or formally accepted.

Independent final diagnostic integration review CLEAR at 10:29 UTC: 3/3 Node and
7/7 Python focused checks passed; the partial artifact was strictly reconstructed
as FAIL, not upgraded. No functional maintenance cause is yet proven.

### Restore-specific diagnostic refinement — 10:35 UTC

Run [41193060408](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41193060408)
on `9cb37e2b390620cb0eadeaf5d8e09b5e29432394` reached fixed native
`RESTORE_CODE_UNCLASSIFIED`, nonzero process exit and validator `RESULT_READ`.
This establishes failure inside the real restore request before a result was
written, not its filesystem/SQLite cause. No functional restore fix is inferred.

Verification-only delegation now distinguishes restore SERVICE, COPY and METADATA
without changing original method receivers, arguments, results or errors. Exact
existing database/backup/restore error literals and allowlisted OS/SQLite error
categories are mapped to fixed codes; unknown/private messages remain UNCLASSIFIED.
PowerShell forwarding uses the identical reviewed literal lists and unchanged
bounds/PASS predicates. Enum parity and local full **255/255** pass; independent
focused **4/4** review is CLEAR. The separately reviewed ReadOnly-denial probe is
held out of this diagnostic tree so it cannot prevent reaching the observed
restore failure. Its native behavior remains NOT_RUN; no acceptance gap is waived.

### 10:42 UTC — bounded Windows SQLite physical-path correction

- Actual run `41193413873`, job `124514635443`, public head `302ad97dbf7392b7d0ccd9eb23adc77a68796368` reached `RESTORE_COPY` and reported exact `SQLITE_CANTOPEN`. This establishes the failing operation/category, not the private pathname or its length.
- Exact [Node 24.22.1 SQLite adapter](https://raw.githubusercontent.com/nodejs/node/v24.22.1/src/node_sqlite.cc) passes database/backup filenames directly to the default SQLite VFS. [SQLite 3.53.4 Windows VFS](https://raw.githubusercontent.com/sqlite/sqlite/version-3.53.4/src/os_win.c) adds extended prefixes in its Cygwin branch, not the ordinary Windows UTF-16 conversion. The generated restore layout can exceed the ordinary Win32 path boundary; this is a source-supported diagnosis pending the controlled Windows regression, not an observed disclosure of a runner path.
- After unchanged canonical-parent, regular-file and absent-destination checks, the main-only adapter now passes Windows namespaced spelling to `DatabaseSync` and `backup`. Logical filenames, ownership, metadata and all later filesystem checks retain their original ordinary canonical spelling. No URI/VFS override, SQL/open-flag change, host long-path policy change or shorter test-only restore location is used.
- The final physical spelling must fit the pinned default VFS's 1040 UTF-8-byte buffer with 64 bytes reserved for sidecars plus NUL. This fail-closed development limit is not unlimited path support. No ATTACH/multi-database filename guarantees are introduced.
- Two new regressions cover exact byte/multibyte boundaries and actual owned long-path snapshot/reopen/new writable creation. On the pinned Windows verification environment, the same absent target must first produce `ERR_SQLITE_ERROR`/14 through the prior unprefixed call; only then can the adapter path pass. Linux exercises the real owned snapshot/reopen but does not claim that Windows negative ran. Focused DB suite: 10/10 PASS locally. Windows regression and restored native matrix remain pending.
- The separately reviewed READONLY probe remains excluded from this correction checkpoint so it cannot prevent reaching the established restore failure. Existing acceptance predicates and all historical failed runs remain unchanged.
- Final local correction-tree aggregate: desktop 257/257 PASS, `DESKTOP_SOURCE_CHECK_PASS`. Independent reviewer reran the focused 10/10 suite and cleared the three source/map/test files; no independent full build or Windows execution was claimed. Diff check PASS. No P1-05 acceptance/count change.
