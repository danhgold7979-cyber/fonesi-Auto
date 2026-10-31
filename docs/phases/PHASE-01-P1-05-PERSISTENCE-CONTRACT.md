# P1-05 foundation persistence and encrypted-backup decision draft

**Proposed 2026-10-31 06:56 UTC; scoped implementation approved 07:05 UTC.**
[ADR-0007](../decisions/ADR-0007-foundation-persistence-backup.md) records the exact
entry and conservative key-initialization selection. This is not task acceptance.
No device/account/job tables, real credentials, P1-06 general vault implementation,
P1-07 settings service or new public IPC method. Existing V9/C-03/C-04/C-05 remain.

## 1. Trace and evidence boundary

[Phase 1 §3/P1-05](PHASE-01-desktop-foundation.md) requires the foundation schema,
migrations/lock/FK, encrypted consistent local backup, seven ordinary copies,
protected pre-migration backup, restore/quarantine and actual Windows evidence.
[C-05/13/14/22](../16_ACCEPTED_PRODUCT_DECISIONS.md) and
[data §§2.3/2.7](../03_DATA_AND_WORKFLOWS.md) settle behavior, not DDL/key format.
The [SQLite lab](../evidence/P0-09-sqlite-source-lab-2026-10-30.md) proved 13 cases
in each pinned runtime, not backup/encryption. The
[secret lab](../evidence/G0-13-secret-restart-lab-2026-10-30.md) proved same-profile
orderly restart/tamper, not profile loss, portability or this backup format.
ADR-0004 remains proposed; synthetic P1-11 records are not migrated into SQL.

## 2. Binding and verified backup API

Propose pinned built-in `node:sqlite` in Electron main, no new native dependency.
Exact Node24.22.1 documentation labels the module release candidate; accepting this
bounded version requires recorded compatibility evidence, not a claim of universal
stability. The API is `backup(sourceDb, path, options): Promise<number>`; options
include source/target/rate/progress. Choose source/target `main`, rate 100. Existing
destination content can be overwritten, so use a fresh owned staging destination.
Mutations on the source connection affect the copy; other connections can restart
it. Serialize application writes during normal backup; separately test concurrency.

Verified sources, read 2026-10-31:
- [Exact official Node v24.22.1 SQLite documentation](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/sqlite.md).
- Installed `desktop/node_modules/@types/node/sqlite.d.ts:1031–1092`, package
  `@types/node`24.19.2, confirms `backup(sourceDb: DatabaseSync, path: PathLike,
  options?: BackupOptions): Promise<number>` and the four option names. Types alone
  are not Electron runtime proof; source/package Windows tests remain mandatory.

Database open policy: main-only fixed owned filename, extensions disabled,
double-quoted string literals disabled, FK enabled, defensive mode enabled;
busy timeout 1,000 ms. Set/verify WAL, foreign_keys=ON and synchronous=FULL on every
writable connection. No SQL/query diagnostics subscription, raw SQL logging or
renderer SQL/path input. Use bound values and explicitly close prepared statements. Exact pinned official
Node documentation §statement.close (lines1000–1011) adds `StatementSync.close()`
in v24.22.0; the prior actual Node/Electron SQLite lab exercised it successfully.
Installed @types/node24.19.2 omits that newer method. Use a narrow local interface
extension/runtime feature check for this verified API; do not invent finalize(),
assume GC finalization or upgrade dependencies silently. Call close once in finally
after statement use has ended; missing API blocks this pinned implementation.

## 3. Exact minimal proposed schema and migrations

All tables STRICT. UUID strings are generated main-owned identifiers and validated
in application contracts; no physical identity meaning. UTC timestamps are safe
integer epoch milliseconds, nonnegative; checksums are lowercase SHA-256 hex.
All identifiers/UTC/checksums receive exact runtime validation in addition to SQL
constraints. No plaintext key/token/password column. Proposed final user_version=2.

Migration 1 creates foundation identity/history:

```sql
CREATE TABLE foundation_store (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  store_id TEXT NOT NULL UNIQUE,
  created_utc INTEGER NOT NULL CHECK(created_utc>=0),
  restore_quarantine INTEGER NOT NULL CHECK(restore_quarantine IN(0,1)),
  restored_from_backup_id TEXT,
  last_auto_admitted_utc INTEGER CHECK(last_auto_admitted_utc>=0)
) STRICT;
CREATE TABLE schema_migration (
  version INTEGER PRIMARY KEY CHECK(version>0),
  script_sha256 TEXT NOT NULL CHECK(length(script_sha256)=64),
  applied_utc INTEGER NOT NULL CHECK(applied_utc>=0),
  prerequisite_backup_id TEXT NOT NULL
) STRICT;
```

Migration 2 adds real backup metadata/validation relationship:

```sql
CREATE TABLE backup_location (
  location_id TEXT PRIMARY KEY NOT NULL,
  folder_marker_id TEXT NOT NULL UNIQUE,
  selected_utc INTEGER NOT NULL CHECK(selected_utc>=0),
  state TEXT NOT NULL CHECK(state IN('ACTIVE','RETIRED'))
) STRICT;
CREATE TABLE backup_record (
  backup_id TEXT PRIMARY KEY NOT NULL,
  location_id TEXT NOT NULL REFERENCES backup_location(location_id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL REFERENCES foundation_store(store_id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(reason IN('DAILY','MANUAL','PRE_MIGRATION')),
  snapshot_utc INTEGER NOT NULL CHECK(snapshot_utc>=0),
  snapshot_schema INTEGER NOT NULL CHECK(snapshot_schema>=0),
  filename TEXT NOT NULL UNIQUE,
  encrypted_sha256 TEXT NOT NULL CHECK(length(encrypted_sha256)=64),
  key_ref TEXT NOT NULL,
  protected INTEGER NOT NULL CHECK(protected IN(0,1)),
  state TEXT NOT NULL CHECK(state IN('VALIDATED','MISSING','RETIRED'))
) STRICT;
CREATE TABLE backup_validation (
  backup_id TEXT PRIMARY KEY NOT NULL REFERENCES backup_record(backup_id) ON DELETE RESTRICT,
  validated_utc INTEGER NOT NULL CHECK(validated_utc>=0),
  plaintext_sha256 TEXT NOT NULL CHECK(length(plaintext_sha256)=64),
  validation_version INTEGER NOT NULL CHECK(validation_version=1)
) STRICT;
```

`filename` is generated basename only, never a user path. key_ref is an opaque UUID,
not key bytes or a vault path. Require PRE_MIGRATION protected=1 at creation;
ordinary backups protected=0. Runtime checks enforce supported schema, UUID/hash
syntax, timestamp integer safety and record combinations. Releasing a safety copy
requires an explicit main-owned upgrade-acceptance operation recording an owned
receipt; user_version reaching 2 is not acceptance. No automatic release on restart.

schema_migration prerequisites may reference external validated manifests because
the bootstrap backup predates backup_record. Do not invent a dangling SQL FK there.
backup_validation exercises genuine FK enforcement and deletion restriction.
`restored_from_backup_id` identifies the source backup externally; it need not exist
in its own earlier snapshot. Backup metadata necessarily describes earlier backups,
not the backup currently being created. No circular self-inclusion requirement.

No business-domain schema is added. Fresh install runs migrations 1 then 2; prior
fixture at version1 exercises real migration2. Expected schema SQL/constraints and
script checksums are versioned fixtures; mismatch or newer version fails safely.

## 4. Ownership, migration locking and first install

Use an explicitly supplied reusable owned data root, separate from disposable probe
profiles and the user-selected backup folder. Read-only ownership preflight precedes
any mutation. A single exclusive owner lock covers DB, migration, backup admission,
restore and key-profile changes. Reuse P1-04's conservative exclusive-directory
ownership/recovery principles; never age/PID-steal. No process may migrate or prune
another owner's open resources. Backup-folder ownership is an app-created child
folder with marker/store ID beneath the selected folder, not ownership of its parent.

First create a valid empty SQLite database with user_version=0 in owned staging;
materialize/validate it before backup. Obtain a validated encrypted schema0 safety
snapshot before migration1. Do not call an absent file a successful backup or waive
the prerequisite for first schema creation. The backup manifest uses the main-owned
store UUID even before foundation_store exists. Keep that identity through migrations.

For each migration: hold exclusive store ownership, stop normal write admissions,
create/validate a protected encrypted backup of current version; record its external
receipt; then BEGIN IMMEDIATE, recheck version/schema/checksum, execute reviewed DDL,
insert history row and update user_version in the same transaction; COMMIT. On error,
ROLLBACK if possible, preserve files/evidence and report fixed failure. Never remove
WAL/journals to hide corruption. No transaction is held across the async backup.
The exclusive application lock bridges normal backup-to-migration work. Version/
schema checks alone cannot detect an independent connection's intervening DML.
Therefore compare a deterministic logical snapshot fingerprint after BEGIN IMMEDIATE
against the fully validated backup: exact approved schema SQL plus every row of every
approved table in primary-key order, with canonical type-tagged scalar encoding.
Unknown tables/schema reject. Do not compare raw file hashes, which can differ due
to WAL/layout. Once the write transaction is acquired, competing writes cannot pass
between comparison and migration commit. Any content mismatch aborts/rolls back;
require a new protected snapshot, never migrate against unbacked state. Force a
second connection to commit DML between backup and transaction in a regression.
For PRE_MIGRATION, defer importing the new backup/catalogue/location receipt into
the live DB until after this comparison, inside the migration transaction; otherwise
our own catalogue write would invalidate the snapshot. External validated receipts
provide the prerequisite before that import. Normal/manual backups may catalogue
as §6 describes.

Fresh install remains staging-only until both migrations/validation complete. Produce
and validate a self-contained final SQLite copy using the same verified backup API,
close owned database handles, sync it and atomically promote under the fixed absent
active filename. Never move only a live WAL-dependent main file. On interrupted
promotion, retain staging and fail closed/reconcile; do not accidentally serve an
unpromoted database. Reopen the promoted active file and validate before readiness.
Repeated launch performs validation, not repeated migrations. Refuse newer schema,
wrong store identity, invalid checksums or unexpected objects without reset/downgrade.
The version1 fixture and interrupted migration are exercised in real SQLite on Windows.

## 5. Encryption and minimal key custody, not P1-06 vault

Use standard node:crypto AES-256-GCM: fresh random 32-byte data-encryption key per
backup, fresh random 12-byte nonce, 16-byte authentication tag. Wrap only that key's
base64 encoding with the already-investigated Electron async safeStorage APIs.
No raw key in SQLite/header/logs; ciphertext of wrapped key is included in the backup.
No passphrase, machine-scope fallback, plain base64-only protection or custom cipher.
The wrapper is a narrow internal backup-key adapter, not generic secret CRUD.

safeStorage depends on retained Windows user/profile material. Configure a dedicated
owned persistent sessionData/key-profile path before app ready; preserve existing
sandbox/resource policies and separate log/crash paths. This explicitly extends the
fresh-profile bootstrap arrangement only for required key custody. Validate owner
and reuse the same profile on restart. Never delete/reinitialize an existing missing/
corrupt key profile to make old backups appear recoverable. Availability is not proof
that an earlier wrapped key decrypts. Require exact key recovery before decryption.
Exact-source basis: [Electron45.1.0 browser_process_impl.cc](https://raw.githubusercontent.com/electron/electron/v45.1.0/shell/browser/browser_process_impl.cc)
reads Local State under sessionData, as already recorded in the G0-13 source matrix.
Before ready, detect a missing previously provisioned profile/key-record prerequisite
and block our own reset/reinitialization path. Before native ready on an existing provisioned profile, preserve the exact owned
Local State bytes in an exclusive private checkpoint under the data root; validate
plain-file ownership/size and never overwrite the last retained original on failure.
Missing/oversized/unreadable existing material blocks provider-dependent work.
Corruption tests run on owned copies, preserving original profile/backups before
native startup. Gate successful recovery on decrypting/authenticating an existing
known-good backup's old wrapped key/ciphertext, not availability or new encryption.
Upstream key replacement/mutation that loses that positive control is failed recovery,
never restored access. Native provider initialization may itself write
OS/profile state; do not claim that refusing an application reset prevents every
native write. Availability=true still cannot establish usability of an old key.
Normal Windows provider access is acknowledged; no account/key-store mutation test.

Development-foundation support claim after evidence: same Windows user/machine with retained usable
owned key profile. Cross-user/cross-machine restore is unsupported pending separate
mechanism/proof, visibly reported—not promised and not silently attempted with new
keys. Same-machine reinstall/profile-loss recovery is also unproved until tested.
Losing the profile may make backups unavailable; warn before choosing this scope.
This is the explicit current C-14 empirical support boundary, not waived encryption
or a permanent product portability reduction. Later recovery/portability work remains
required at its existing gates before broader support can be claimed; no product
requirement is deleted by this development-foundation choice.

If the decrypt result requests re-encryption, preserve original backup/key material;
do not silently rotate/replace it. Return a reviewed fixed recovery-needed state until
that mechanism is separately selected. No arbitrary native exception text is logged.
Buffer overwrite is best effort, not secure-memory/administrator/same-user isolation.

### First-profile key persistence prerequisite

Same-process wrap/decrypt and a validated encrypted backup do not establish that a
newly provisioned provider key survives abrupt exit. Before any dependent migration
may rely on a protected backup, the selected initialization mechanism must satisfy
this exact owned synthetic process matrix on the pinned Windows source/package:

| Stage | Required observation |
|---|---|
| Fresh owned key profile, no prior key material | Provision through normal provider; produce and fully validate an encrypted schema0 backup |
| Immediately after reported backup validation, before orderly app quit | Supervisor abruptly ends the complete owned process tree; no graceful will-quit persistence substituted |
| New process using retained original profile and backup | Recover the OLD wrapped data key and authenticate/decrypt the OLD backup exactly; new-key availability or newly generated backup is not a positive control |
| Same test with missing/corrupt copied profile/key prerequisite | Fail closed, preserve original material, no migration or fresh-key substitution |
| Recovered old schema0 backup | SQLite/hash/schema validation passes; only then does this test establish the claimed initialization crash boundary |

If immediate first-profile persistence is not established, do not weaken that
assertion or count the old orderly-restart lab as a substitute. Select a bounded
provisioning phase: create profile/key and bootstrap backup, complete observed
orderly shutdown/owned-tree retirement, reopen and authenticate the old backup;
then repeat abrupt-exit/reopen recovery from that provisioned state before allowing
migration. The protected migration prerequisite is then explicitly the VERIFIED
PROVISIONED profile state, never the first same-process encryption result. No sleep,
availability=true check, assumed GC or extra decrypt in the same process substitutes
for the required process boundary. Source/package tests must verify the selected
path and failure refusal. If neither path passes, key custody remains BLOCKED for
migration; no plaintext backup or unverified key persistence fallback.

Coordinator must approve which initialization mechanism is implemented before code:
immediate first-profile persistence only with existing exact evidence, otherwise
provision/orderly-close/reopen as the candidate with the mandatory crash proof above.
The current evidence supports proposing the latter candidate, not claiming it passed.
This is existing encrypted-backup durability work, not a new product feature.

## 6. Exact backup container and validation/promotion

Container v1: 8 ASCII magic bytes `FONAUB01`; 4-byte big-endian header byte length;
canonical UTF-8 JSON header; ciphertext of the SQLite snapshot; final 16-byte GCM tag.
Header, exact field order: formatVersion=1, storeId, locationId, backupId, keyRef, reason,
snapshotUtc, schemaVersion, plaintextBytes, plaintextSha256, nonceBase64,
wrappedKeyBase64. Authenticate magic+length+header as GCM associated data. Unknown
fields/version, duplicate keys, noncanonical encoding, length mismatch and invalid
base64 reject. No compression/archive extraction or embedded path. Header cap64KiB;
snapshot cap64MiB for this measured foundation workload, not a product DB capacity
promise. Over-limit fails visibly, never truncates or deletes existing backups.

1. Snapshot with verified `backup()` into a fresh owned staging path; no same-connection
   writes during this operation. Check SQLite integrity_check, foreign_key_check,
   exact supported schema/history/store identity and deterministic row comparison.
2. Hash and stream-encrypt staged bytes to a fresh exclusive temporary file in the
   owned backup subfolder. Flush/sync/close. No plaintext snapshot in that folder.
3. Reopen/decrypt into a separate owned validation path. Authenticate completely
   before trusting or opening decrypted SQLite data; unauthenticated plaintext must
   never be exposed as a valid restore. Validate hash/size/SQLite/schema/rows again.
4. Promote under unique generated backup basename and write validated manifest/receipt;
   sync/close and readback before recording VALIDATED in DB. Write catalogue and
   validation row in one transaction where schema supports them. Schema0/1 uses
   external manifests until migration2 imports validated metadata.
5. Only after verified promotion may rotation consider older ordinary copies.
   Failed encryption/validation/promotion/catalogue reconciliation never deletes a
   known-good backup or permits its dependent migration. Preserve uncertain staging
   privately for diagnosis; clean only proven owned files, no secure-erasure claim.

DB and directory promotion are not one atomic transaction. On restart reconcile
owned manifests/catalogue; an orphan or interrupted promotion is UNKNOWN until
revalidated, not immediately usable or deletable. Retention stays disabled for
uncertain catalogue state. Never promote based merely on file existence. Validation
receipts describe tested process-crash/fs-sync behavior, not universal power-loss
survival. Filesystem crash tests are required before claiming this boundary.

### Persisted backup-location identity

Persist main-owned `backup-locations.json` inside the data root, exact structure
`{version:1, storeId, activeLocationId, locations:[{locationId, folderMarkerId,
absolutePath, selectedUtc, state}]}`. IDs are main UUIDs; activeLocationId is nullable
until first selection. Path is sensitive local configuration, never IPC/log output.
Each location points to an app-owned child folder whose exact marker contains
version/storeId/locationId/folderMarkerId. On reopen validate both config and marker;
missing/moved/replaced storage reports unavailable without searching elsewhere.
Automatic backup uses the persisted active location with no recurring picker prompt.
Corrupt/missing existing config is a blocked state, not a reset to an arbitrary folder.

First selection is explicit in main's native dialog, including pre-migration setup.
Replacement requires explicit confirmation; cancellation changes nothing. Validate
and persist new location/marker first, then atomically change activeLocationId under
the owner lane, marking old location RETIRED but preserving its config/catalogue.
Mirror locations into backup_location after schema2 exists; startup reconciles the
external config and SQL, suppressing pruning on disagreement. No silent directory
rescan/rebind. Every backup is resolved using its recorded locationId plus marker,
never the current folder paired with an old filename. Restore/list may access an old
location only through that exact retained mapping; inaccessible locations stay
unavailable, not MISSING by assumption. Rotation considers all known validated
ordinary copies, but deletes only accessible exactly-owned candidates; if a required
older candidate cannot be verified, retain extras and report retention-blocked rather
than delete a newer good copy. Changing folder never automatically moves/deletes old
backups. Config/manifests are bounded to 64KiB; exceeded limits visibly block change
without loss, a development envelope not product history/capacity limit.

## 7. Cadence, seven copies and protected safety copies

Choose elapsed24h UTC between **automatic admissions**, persisted before beginning
the snapshot. This is conservative at-most-daily behavior under C-22, not schedule
timezone policy. Under owner/transaction, if no prior automatic admission or
now >= last_auto_admitted_utc + 86,400,000, persist now then admit exactly one DAILY
backup. A failed attempt remains admitted for that window; expose failure and allow
manual retry immediately. No catch-up burst. Backwards clock delays automatic work;
restart does not reset the timestamp. Manual and PRE_MIGRATION do not update it.
Check on startup and a bounded hourly timer while running; no backup when app is off.

Keep up to seven validated ordinary copies (DAILY+MANUAL) once enough exist; order
by snapshotUtc then backupId. Count a retained slot only after current exact file/
manifest ownership, encrypted hash and authenticated validation evidence are checked
against the actual file; stale VALIDATED rows alone do not count. Before pruning,
revalidate decrypt/authentication and SQLite integrity of the candidate retained set.
Missing/corrupt copies do not consume slots; any unresolved catalogue disables pruning
and reports the gap, never causes another known-good copy to be deleted to reach seven.
Before pruning an eighth, confirm the new copy's actual
validation and ownership, preserve every protected safety copy, and reconcile DB/
manifest state. Do not delete good backups after failed creation or solely to free
space. PRE_MIGRATION copies are outside seven and remain protected until explicit
upgrade acceptance. Released safety copies remain separately identified; deletion
requires that acceptance receipt and explicit cleanup policy, not conversion into
an ordinary slot. Unknown/corrupt manifests never authorize deletion.

## 8. Restore and quarantine

Restore is main-owned explicit maintenance into a new empty owned destination, never
over the only active database. Resolve backup by validated opaque ID in the chosen
owned backup folder, not arbitrary renderer path. Authenticate/decrypt/validate fully;
unknown container/schema/key or mismatched identity returns fixed blocked status.
For schema1/2 set restore_quarantine=1 and restored_from_backup_id transactionally
before exposing restored state. Schema0 restore remains non-dispatchable; if migrated,
initialize foundation_store with quarantine=1. Restoring backup metadata does not
prove the external backup folder/catalogue or post-snapshot effects match it.

Owned root provenance is explicit: initial marker has immutable kind FRESH, or
RESTORED with generated restoreReceiptId. Fresh roots need no restore receipt;
restored roots always require the matching owned receipt independent of DB contents.
Persist the receipt outside the restored DB marking quarantine before any activation.
Cross-check marker/receipt/store identity on startup; missing/mismatched/uncertain
restored-root receipts fail closed, never default to FRESH. Rolling back the DB cannot
remove this root provenance. App-owned writes never change RESTORED to FRESH. This prevents an older database value from silently clearing quarantine.
A restored root stays maintenance-only: no automatic backup timer/admission uses its
possibly old last_auto_admitted_utc. Explicit manual backup/validation remains possible;
normal automatic operation requires a later reviewed recovery/admission reconciliation,
not a bare restart or copied old timestamp. P1-05 does not implement a dispatch
service or quarantine-release operation. Phase8
must reconcile post-snapshot effects and identity/leases before release. Tests prove
quarantine remains across reopen, including a fixture previously marked undispatched.

## 9. Functional entrypoints and bounded evidence

Implement real main-only functions for initialize/migrate, manual backup, automatic
tick, backup listing/validation and restore-to-new-location. Trusted diagnostic/test
launcher invokes synthetic operations; no public arbitrary file/SQL/crypto route.
User folder selection is native main-owned selection returning a scoped internal
handle; cancellation leaves prior state unchanged. Select a trusted maintenance-launcher integration now. Exact application argument
grammar (after the executable/app path): zero arguments = normal startup, or exactly
one of `--maintenance=backup-now`, `--maintenance=list-backups`,
`--maintenance=restore-to-new`, `--maintenance=accept-upgrade`,
`--maintenance=select-backup-folder`. Reject duplicates, extra arguments, other
values, alternate casing, whitespace forms and unknown switches. Existing unsafe
Electron/Node override checks still run. No backup ID, path, SQL, shell, key or crypto
argument is accepted. Data/key roots use validated trusted launcher configuration,
not renderer input. Native main-owned dialogs select the location/backup ID/new
restore destination and confirm restore or specific upgrade acceptance. Cancellation
returns fixed CANCELLED with no selected-operation/configuration/admission mutation;
it does not claim that earlier native provider/startup work made zero writes. Listing is native main display
of fixed metadata, never key/path contents in console. Backup-now uses persisted
location, prompting only if none exists; missing existing storage blocks and offers
explicit folder-change action, never silently substitutes. Accept-upgrade selects
an exact pending migration/safety-copy set and records its receipt after confirmation.
Main direct test injection can replace dialogs only in the separate verification
harness, never by production environment flag. This is an explicit reviewed extension
of the former no-arguments contract. Existing WindowsBoundary rejects '-' arguments;
its source must admit only these five complete exact literals, not a generic switch
prefix. Tests preserve the zero-argument path and all other argument denials. No public v1/v2 IPC widening. Full V9 placement follows P1-08;
do not claim those future UI controls are already complete.

Proposed test execution bounds:64MiB snapshots, one active operation, 120-second
supervisor deadline and bounded private outputs. Deadline does not cancel SQLite/
filesystem work; retain lock until confirmed operation/process termination. No
automatic retry or concurrent backup after timeout. Limits are foundation evidence
envelopes, not arbitrary universal performance requirements.

Mandatory Windows source/package evidence: fresh/version1/repeated launch; schema
diff/checksums; FK violation; real second-connection migration contention; before/
after-commit crash; online backup concurrent-write fixture; encrypted roundtrip;
wrong key/tamper/truncation/missing/corrupt profile; manual/daily/restart/clock cases;
seven-copy rotation; protected safety copy; failed backup blocks migration and keeps
good copies; separate restore/quarantine; actual owned-path/write-denied behavior;
injected ENOSPC clearly labeled; plaintext/key/canary scans of public outputs.
Do not deliberately revoke OS credentials or fill the host disk. Cross-machine
testing remains NOT_RUN/unsupported, not inferred from same-machine success.

## 10. Decisions and remaining gates

This draft selects binding candidate, exact minimal DDL, ownership/migration order,
authenticated format/key-custody direction, elapsed24h cadence, retention and
separate restore/quarantine. Accept/revise them as one scoped DB/backup decision
before code. Require independent schema/crypto/lifecycle review and exact Windows
runtime evidence. API signature is verified; safeStorage backup-key/profile behavior
and file promotion/crash semantics are empirical gates, not missing user secrets.
The selected maintenance launcher (§9) supplies explicit manual operations without
silently widening public IPC; its frozen executable grammar above requires reviewer approval, not implementation guessing.
No evidence or implementation approval is asserted by this proposal.
