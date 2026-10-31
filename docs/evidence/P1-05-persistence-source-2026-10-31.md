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
