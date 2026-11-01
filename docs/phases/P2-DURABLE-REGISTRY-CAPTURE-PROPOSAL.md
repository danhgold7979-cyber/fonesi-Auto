# P2 durable registry and capture proposal

Status: **SOURCE ENTRY APPROVED — 2026-11-01 03:47 UTC.**
Coordinator Coder Bin approved the independently reviewed pre-adoption SHA256
`3193ebe6fafa509b8ce448cc1c79a95a794bb31dc4805d87afd255a223bb7169`.
Implementation is sequenced after fleet interfaces to avoid overlapping audit/schema edits;
actual Windows execution remains a separately reviewed checkpoint.
Prepared 2026-11-01 for coordinator/reviewer decision. This is a finite continuation
of P2-03/05/09, not new task IDs or a claim of hardware/Phase acceptance.

## 1. Scope and authority

Implement an actual SQLite durable control ledger and owned local capture artifact
store using the existing foundation database, protected migration prerequisites,
root lease, pure registry and capture validators. No new dependency, ADB execution,
identity acquisition, device dispatch, public capture-file API or background service.
Actual transport/capture acquisition and hardware qualification remain separate.

References: [canonical Phase 2](PHASE-02-adb-device-fleet.md),
[Device/Transport and retention](../03_DATA_AND_WORKFLOWS.md),
[software entry](PHASE-02-SOFTWARE-FIRST-ENTRY-PROPOSAL.md),
[read-only fleet facade](P2-FLEET-FACADE-IPC-CONTRACT.md).

Selection/focus/batch state is **not persisted in this increment**. The facade's
APPLIED means process-local selection applied, never PERSISTED. Restart clears it;
no selected device is inferred from historical bindings. Device model/locale/notes
and app/account/workflow tables are not added by this ledger migration.

## 2. Exact migration 4 schema

Append only migration 4; preserve migration 1–3 SQL bytes and SHA256 values. Version
4 validation adds these six STRICT tables with exact columns/DDL and foreign keys.
No generic table/column acceptance. UUID and SHA syntax, safe integer upper bounds,
row relationships and aggregate budgets are additionally validated in application
code on every read/import; SQLite length checks alone do not authenticate a value.

```sql
CREATE TABLE registry_meta (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
 host_epoch INTEGER NOT NULL CHECK(host_epoch BETWEEN 0 AND 9007199254740991),
 last_change_utc INTEGER CHECK(last_change_utc BETWEEN 0 AND 9007199254740991),
 last_operation_id TEXT,
 last_change_kind TEXT CHECK(last_change_kind IN('STARTUP','RECONCILE','DISPLAY','CAPTURE','HOLD','PRUNE')),
 CHECK((last_change_utc IS NULL AND last_operation_id IS NULL AND last_change_kind IS NULL)
    OR (last_change_utc IS NOT NULL AND last_operation_id IS NOT NULL AND last_change_kind IS NOT NULL))
) STRICT;
INSERT INTO registry_meta VALUES(1,0,0,NULL,NULL,NULL);
CREATE TABLE registry_device (
 device_id TEXT PRIMARY KEY NOT NULL,
 generation INTEGER NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991),
 display_profile_revision INTEGER NOT NULL CHECK(display_profile_revision BETWEEN 0 AND 9007199254740991),
 created_utc INTEGER NOT NULL CHECK(created_utc>=0),
 updated_utc INTEGER NOT NULL CHECK(updated_utc>=created_utc),
 last_seen_utc INTEGER CHECK(last_seen_utc>=0)
) STRICT;
CREATE TABLE registry_binding (
 binding_id TEXT PRIMARY KEY NOT NULL,
 device_id TEXT NOT NULL REFERENCES registry_device(device_id) ON DELETE RESTRICT,
 generation INTEGER NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991),
 serial TEXT NOT NULL,
 transport_id TEXT,
 source TEXT NOT NULL CHECK(source IN('ADB_DISCOVERY','SYNTHETIC_TEST')),
 last_state TEXT NOT NULL CHECK(last_state IN('DEVICE','UNAUTHORIZED','OFFLINE','UNKNOWN')),
 observed_utc INTEGER NOT NULL CHECK(observed_utc>=0),
 retired INTEGER NOT NULL CHECK(retired IN(0,1))
) STRICT;
CREATE TABLE registry_identity_evidence (
 evidence_id TEXT PRIMARY KEY NOT NULL,
 device_id TEXT NOT NULL REFERENCES registry_device(device_id) ON DELETE RESTRICT,
 observed_utc INTEGER NOT NULL CHECK(observed_utc>=0),
 source TEXT NOT NULL CHECK(source IN('ADB_DISCOVERY','SYNTHETIC_TEST')),
 identity_sha256 TEXT CHECK(identity_sha256 IS NULL OR length(identity_sha256)=64)
) STRICT;
CREATE TABLE capture_artifact (
 evidence_id TEXT PRIMARY KEY NOT NULL,
 device_id TEXT NOT NULL REFERENCES registry_device(device_id) ON DELETE RESTRICT,
 binding_id TEXT NOT NULL REFERENCES registry_binding(binding_id) ON DELETE RESTRICT,
 generation INTEGER NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991),
 display_profile_revision INTEGER NOT NULL CHECK(display_profile_revision BETWEEN 0 AND 9007199254740991),
 kind TEXT NOT NULL CHECK(kind IN('PNG','HIERARCHY_XML')),
 captured_utc INTEGER NOT NULL CHECK(captured_utc>=0),
 display_evidence_id TEXT NOT NULL,
 display_observed_utc INTEGER NOT NULL CHECK(display_observed_utc>=0),
 valid_until_utc INTEGER NOT NULL CHECK(valid_until_utc>=display_observed_utc),
 expires_utc INTEGER NOT NULL CHECK(expires_utc>=captured_utc),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 65535),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 65535),
 rotation INTEGER NOT NULL CHECK(rotation IN(0,90,180,270)),
 source TEXT NOT NULL CHECK(source IN('SYNTHETIC_TEST','VALIDATED_CAPTURE')),
 relative_name TEXT NOT NULL UNIQUE,
 sha256 TEXT CHECK(sha256 IS NULL OR length(sha256)=64),
 bytes INTEGER CHECK(bytes IS NULL OR bytes BETWEEN 1 AND 16777216),
 state TEXT NOT NULL CHECK(state IN('RESERVED','VALIDATED','STALE','DELETE_PENDING','DELETED','UNCERTAIN')),
 CHECK((sha256 IS NULL AND bytes IS NULL) OR (sha256 IS NOT NULL AND bytes IS NOT NULL))
) STRICT;
CREATE TABLE capture_hold (
 hold_id TEXT PRIMARY KEY NOT NULL,
 evidence_id TEXT NOT NULL REFERENCES capture_artifact(evidence_id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(reason IN('OUTCOME_UNKNOWN','RECONCILIATION'))
) STRICT;
```

No serial uniqueness constraint: duplicate transport claims must remain representable
and quarantinable, not silently merged. Global UUID distinctness across allocated
registry/evidence identities follows current registry rules. Binding generation may
be older than device generation but never newer; each artifact's binding must belong
to exactly its device and recorded generation. VALIDATED/STALE/DELETE_PENDING/DELETED
require a complete hash/byte pair; RESERVED/UNCERTAIN may lack one. XML bytes <=1MiB.
`expires_utc = captured_utc + 604800000` with safe addition. `valid_until_utc` is
short-lived display evidence validity, **not** seven-day retention/currentness.
Capture `evidence_id` is the new immutable artifact receipt ID; it is distinct from
`display_evidence_id`, which preserves the supplied display observation UUID.
`display_observed_utc`, `valid_until_utc` and `source` copy that exact observation,
not capture completion time or an upgraded provenance label. Reconstruct DisplayEvidence
with its original evidenceId, observedUtc/validUntilUtc/source, device/binding/generation,
binding serial, dimensions/rotation and display_profile_revision as orientationEpoch;
displayId remains the currently supported literal0. Capture time is separate and
never repairs an expired display observation. The artifact receipt ID and original
display observation ID must not be silently equated.

## 3. Defensive budgets (not product capacity promises)

Per store: 256 devices, 4096 historical bindings, 4096 identity evidence rows,
256 current claims, 4096 capture rows including tombstones, 4096 holds. These are
explicit new defensive ledger bounds using the existing registry's configurable
budget interface; they are not claimed existing product limits. Saturation returns
LIMIT_EXCEEDED without automatic history eviction or ID reuse. Raising them requires
reviewed capacity/migration handling, not bypassing admission.

Capture root: one marker plus at most two fixed names per capture row (8193 entries),
flat/no subdirectories, total actual payload+partials <=256MiB. Before a write,
reserve the full declared per-format maximum in that budget so pending writes cannot
overcommit it. PNG <=16MiB encoded /64MiB decoded /4096 chunks; XML <=1MiB /64 depth /
10000 nodes, preserving current pure validator limits. Inventory is bounded and
streamed; no recursive traversal. Input arrays/rows and canonical metadata are bounded
before materializing snapshots. Pure XML currently rejects all entity references;
this subset remains explicit, not certification of escaped vendor UI XML.

## 4. Runtime provenance and transaction boundary

Proposed main-only APIs:

- `RegistryStore.open(database, lease, clock, nextId, audit)` validates durable rows
  and performs the startup transition below.
- `RegistryStore.reconcile(expectedRevision, observation)` invokes the existing pure
  reconciler on its privately held WeakSet-recognized snapshot, then commits the
  admitted delta and returns a new snapshot only after confirmed COMMIT.
- An internal `reconstructDisconnectedRegistry(validatedRows)` creates a fresh frozen
  WeakSet-recognized object; it never accepts a serialized VERIFIED/current binding.
- `CaptureStore.reserve/complete/read/addHold/releaseHold/prune` accept typed IDs,
  admitted current display evidence and copied bounded bytes, never caller paths.
  Fixed errors include STALE_REVISION, LIMIT_EXCEEDED, OWNER_REVOKED,
  INVALID_CAPTURE, STALE_CAPTURE, STORAGE_FAILED, RECOVERY_REQUIRED.

All database writes use the existing single writer/root lease, BEGIN IMMEDIATE,
expected registry revision CAS and a final lease/admission check before COMMIT.
Revision overflow and generation overflow fail closed. Known rollback rethrows fixed
failure; any uncertain COMMIT outcome latches the store unavailable until a fresh
validated reopen. No in-memory successor snapshot is published on uncertain commit.

Startup, including Device Host restart: in one transaction increment host_epoch and
EVERY stored device generation, retire every binding, increment registry revision;
then reconstruct all devices DISCONNECTED/PROVISIONAL/currentBindingId:null with no
current claims/sequence. Historical evidence IDs remain for history/duplicate checks,
not current authority. A fresh observation and newly admitted resolver proof are
required to become VERIFIED. Identity fingerprint remains NULL unless an approved
resolver actually supplies one; serial/model/transport alone never manufacture it.
This increment does not implement that hardware resolver or upgrade synthetic facts.

Audit compatibility is exact: add schemaVersion5 (schema4 belongs to the fleet
facade), retaining all schema1–4 decoders unchanged. Record keys are exactly
`schemaVersion,runId,sequence,utc,severity,component,task,event,operation,phase,
diagnosticId,operationId,expectedRevision,resultingRevision,code`.
Use existing canonical UUID/UTC/sequence validators; component MAIN;
severity INFO for OK, WARN otherwise; event DURABLE_STORE_OPERATION;
task P2-03 for STARTUP/RECONCILE/DISPLAY and P2-09 for capture operations.
Operation enum: STARTUP, RECONCILE, DISPLAY, CAPTURE_RESERVE, CAPTURE_COMMIT,
HOLD_ADD, HOLD_RELEASE, PRUNE_MARK, PRUNE_COMPLETE, RECOVER_CLASSIFY.
Phase INTENT or RESULT. diagnosticId and operationId are distinct main-allocated
UUIDs; revision fields are nullable nonnegative safe integers. Codes exactly:
OK, INVALID_REQUEST, STALE_REVISION, LIMIT_EXCEEDED, OWNER_REVOKED,
INVALID_CAPTURE, STALE_CAPTURE, STORAGE_FAILED, RECOVERY_REQUIRED,
AUDIT_UNAVAILABLE, REVISION_EXHAUSTED, OUTCOME_UNKNOWN. No serial/IP/path/device
UUID, image hash, raw XML or free-form error is an audit field.

Every mutating transaction (including startup/recovery/holds/prune) requires a
successful bounded append **and flush** of its INTENT before BEGIN IMMEDIATE or
filesystem mutation for that step. INTENT uses code OK, expectedRevision=current
admitted revision and resultingRevision=null. Allocation/append/flush failure means
NOT_COMMITTED/AUDIT_UNAVAILABLE, auditHealth DEGRADED, with no operation mutation.
After that await recapture lease/ownership and revision; failed admission makes no
mutation. A capture operation's steps each use their own INTENT/RESULT and step
operationId; no successful reservation is mislabeled as successful final capture.
Hold denial means callers cannot claim evidence is preserved and must not proceed
with an effect that requires that hold.

Main-only **mutation** results are exact discriminated envelopes (no new public IPC):
- `{ok:true,outcome:'COMMITTED',revision,operationId,diagnosticId,auditHealth}` for
  a confirmed transaction. A typed snapshot/artifact return is separate and provided
  only on this branch, never smuggled into the error variant.
- `{ok:false,outcome:'NOT_COMMITTED',code,operationId,diagnosticId,auditHealth}` for
  pre-mutation denial or confirmed rollback. code excludes OK/OUTCOME_UNKNOWN;
  allocation failure permits null IDs, with auditHealth DEGRADED.
- `{ok:false,outcome:'OUTCOME_UNKNOWN',code:'OUTCOME_UNKNOWN',operationId,
  diagnosticId,auditHealth:'DEGRADED'}` for an uncertain commit, with allocated IDs
  but no revision/snapshot/artifact success receipt. Latch unavailable until reopen.

RESULT after confirmed commit has code OK and resultingRevision=committed revision.
RESULT append/flush failure returns COMMITTED/DEGRADED, never fabricated rollback or
unknown commit. Failed confirmed-rollback RESULT uses its fixed error and null
resultingRevision; unknown commit uses OUTCOME_UNKNOWN/null. The committed
registry_meta last-operation witness is not a full history journal. External log and
SQLite are not an atomic distributed transaction; intent-before-mutation plus
truthful result/degradation makes that limitation explicit. Read-only artifact
validation has no INTENT barrier and cannot mutate or claim currentness from audit.

`CaptureStore.read` has separate exact main-only results:
- `{ok:true,outcome:'OBSERVED',artifact,data}` where artifact has exactly
  `{evidenceId,kind,sha256,bytes,capturedUtc,freshness}`; kind PNG/HIERARCHY_XML,
  freshness CURRENT/STALE. `data` is a fresh copied Uint8Array of the completely
  validated owned file, bounded by kind. No path/serial/current revision is returned.
  CURRENT additionally requires the exact current runtime display observation;
  explicit stale read may return STALE but never usable coordinate authority.
- `{ok:false,outcome:'NOT_OBSERVED',code}` with code exactly INVALID_REQUEST,
  OWNER_REVOKED, INVALID_CAPTURE, STALE_CAPTURE, STORAGE_FAILED, RECOVERY_REQUIRED
  or NOT_FOUND. Default current-only read returns STALE_CAPTURE rather than silently
  returning a prior artifact; `allowStale` is an explicit trusted main boolean.
The read is not COMMITTED and makes no persistence/audit-health claim. No raw bytes
or receipt are returned on failure; typed receipt/data never go directly to public
IPC. Data copying cannot grant device provenance that the stored observation lacks.

## 5. Owned immutable capture lifecycle

Fixed root `<owned-data-root>/captures-v1`; canonical marker
`{version:1,storeId,kind:'CAPTURE_STORE'}` binds the existing store. Exact filenames
`capture-<evidenceUUID>.png` or `.xml`, temporary name adds `.part`. Plain canonical
ancestors/files, no symlinks/reparse points/hardlinks/aliases; exclusive creation,
no overwrite, no caller-selected destination. Existing unknown contents refuse
mutation and remain private. Main store owns serialization, not the renderer.

1. Under current actor read-ownership, reserve fresh evidence UUID and complete binding,
   display epoch, times and format in a committed RESERVED row.
2. Exclusively write copied bounded bytes to its `.part`, sync and close; validate
   full PNG/XML using existing pure validators and bind exact display evidence.
3. Recheck device/binding/generation/dimensions/rotation/display epoch and ownership;
   promote by same-directory exclusive hard-link creation of the final filename,
   then unlink the owned temporary name and reread/hash the single-link final file.
   Ordinary overwrite-capable rename is not an acceptable no-overwrite primitive;
   filesystems without the reviewed link operation fail closed. Changed binding/rotation makes the artifact STALE, not current.
4. CAS commit hash/bytes and VALIDATED or STALE. Only a confirmed final commit can
   return a usable typed artifact receipt. Read checks actual bytes/hash and current
   exact evidence; a VALIDATED database label alone cannot authorize current UI input.

Filesystem promotion and SQLite COMMIT are **not one atomic transaction**. Crash at any
boundary yields RESERVED/partial/promoted-uncommitted or missing/mismatched evidence;
startup classifies it UNCERTAIN, never auto-VALIDATED, never another device's last image.
No raw file is exposed by IPC in this increment. Late completion after revocation
cannot publish current evidence. A failed write may retain only exact owned private
partial material for diagnosis; it is never treated as a valid artifact.

## 6. Retention, holds and recovery

Seven-day captures/UI diagnostics and thirty-day existing technical logs remain
separate. Capture expiry never deletes needed UNKNOWN/reconciliation evidence.
Hold creation/removal and pruning share the same store lane and revision checks.
Releasing a hold requires exact hold ID plus trusted main reconciliation disposition;
there is no generic renderer release or automatic timeout of UNKNOWN.

Prune requires elapsed expiry, monotonic observed wall-clock (rollback defers cleanup),
no holds, complete bounded inventory and exact marker/path/hash ownership. Commit
DELETE_PENDING, recheck in the serialized lane, unlink only the exact admitted file,
then commit DELETED tombstone. No new hold is acknowledged once deletion is issued;
return fixed conflict so callers cannot claim preservation of a deleted artifact.
On restart a DELETE_PENDING row is resolved only against its exact named file: missing
means finish tombstone; matching file may retry under the same no-hold checks; mismatch
means UNCERTAIN. Unknown files and ambiguous partial promotion disable routine prune. An interrupted link/unlink leaves two
names for one inode: preserve as UNCERTAIN until exact reservation-bound recovery;
do not mistake it for an admitted ordinary single-link artifact.

An explicit recovery review may remove an incomplete owned partial only when its
reservation proves ownership, no applicable hold/reconciliation dependency exists and
whole producer retirement is proven. No blanket recursive cleanup or deletion of
original/user/phone files. Failed cleanup changes cleanup status, not command outcome.

## 7. Backup, restore and historical schema compatibility

Migration4 requires the existing authenticated protected schema3 prerequisite backup
and existing transaction witness checks. Preserve migrations1–3 hashes, all prior
backup header versions and exact historical schema0/1/2/3 validation. Extend
`visibleTable` explicitly (currently all non-settings tables default to version2),
TABLES and per-table value validation; never relax unknown-column/schema rejection.
Backup container schema limit already derives from DATABASE_VERSION.

Backups currently contain SQLite, **not capture payload directories**. Schema4 backups
include ledger rows, not an implied image archive. A restored new root remains
maintenance-only/quarantined; it cannot reopen old filesystem paths or reconstruct
live actor authority. Artifact references are unavailable/UNCERTAIN until actual
owned bytes are separately proven; no source root borrowing/copying is automatic.
Older snapshots create empty ledger tables through normal protected migrations when
that maintenance operation is explicitly admitted.

A restored generation counter can be lower than the source store's later history.
Do not claim globally monotonic epochs across rollback. Existing restore quarantine,
fresh host-instance/binding UUIDs and post-admission epoch increment fence old commands;
no live transport/effect replay follows restoring an old snapshot. Root quarantine is
not cleared by this increment. Per-store UUIDs and hashes are not physical identity proof.

## 8. Finite implementation/test checkpoint

Proposed source files: `main/registry-store.ts`, `main/capture-store.ts`; narrowly extend
existing persistence-contract/foundation-database, registry reconstruction and fixed
log event contracts. No new package, privileged service or facade mutation API.

Required source/owned-fixture evidence before publication:

- Actual SQLite3→4 migration with protected prerequisite witness; first3 hashes
  unchanged; historical0–3 snapshots validate; malformed/FK/duplicate/overflow denied.
- Actual CAS/rollback and before/after COMMIT exceptions, reopen old/new state; no
  in-memory publication on uncertain commit; startup generations/retirement.
- Serialized VERIFIED/currentBinding injection cannot create actor authority; fresh
  proof mandatory; restored rows/quarantine cannot dispatch.
- Complete PNG/XML owned writes/readback; malformed/truncated bytes, rotation or
  disconnect during write => rejected/stale, never cross-device substitution.
- Injected ENOSPC/close/rename/commit faults, process-interruption checkpoints and
  reopening classify partials/orphans; no false durability/cleanup claim.
- Exact7-day expiry vs holds, clock rollback, held deletion conflict, unknown entries,
  symlink/alias/path escape and root mismatch refuse without touching unrelated files.
- Database-only restore does not falsely expose missing capture bytes; selection
  remains explicitly process-local. Public diagnostics canary scan has no private fields.

Node/owned-filesystem tests are not native Android capture or physical identity evidence.
A scoped Windows filesystem campaign can verify platform semantics after source review;
real-device P2 acceptance remains independently required. No source changes or database
writes are authorized by this proposal itself.
