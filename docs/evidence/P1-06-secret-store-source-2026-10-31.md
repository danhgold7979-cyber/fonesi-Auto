# P1-06 secret-store implementation evidence — in progress

Coordinator approved the independently reviewed [exact contract](../phases/PHASE-01-P1-06-SECRET-STORE-CONTRACT.md)
at 11:02 UTC on 2026-10-31 under the development-only exception. No real credential,
public IPC service, account/device integration or host security-setting change is
introduced. Original Phase 0 gates remain unaccepted; current technical task count
is six, formal accepted count zero. P1-06 has no technical acceptance yet.

## 11:21 UTC source/library checkpoint

Author full desktop pipeline passed **316/316 tests**: exact 38-module graph,
strict compiler, reviewed quality gate, build/current-input manifest and all fixed
sequential test batches. Independent full rerun also passed **316/316** with `DESKTOP_SOURCE_CHECK_PASS` at 11:21 UTC; no native execution was performed.
Previously independently cleared focused slices include pure contract14, provider9,
compatible audit12 (including six legacy checks), combined contract14/files6/
provider9/store7 (36 total) at the stated earlier checkpoint, and batching5; these are overlapping scoped runs, not additive totals.

Implemented main-only slices:

- Exact reference/revision, sorted active/tombstone index, initialization receipt,
  bound canonical encrypted payload and fixed result union. No bare synthetic
  `secretRefId` silently resolves to a current live revision.
- Real owned exclusive ciphertext files and atomic index publication. Every ACTIVE
  record authenticates against current index/store/ref; exact-named bounded inactive
  partial candidates remain opaque evidence under the explicit 11:12 clarification.
  They are never adopted/pruned; collisions refuse replacement.
- Actual store CRUD/reopen/revision/tombstone tests use a clearly synthetic AES
  provider. Typed native-adapter composition is separately tested; this is not yet
  native safeStorage or other-user evidence.
- Caller identity/method capability, one operation lane, admitted snapshots, final
  synchronous checks before publication and plaintext release. Deterministic async
  revocation regressions preserve the old index and withhold bytes.
- Exact async safeStorage adapter with availability and custody checks before/after
  awaits, bounded copied inputs/results and no rotation fallback. Only trusted typed
  provider failures retain their fixed meaning. A same-bundle native-store facade
  prevents independently bundled error classes from losing identity; an actual
  emitted-artifact regression verifies rotation/owner-denial classification.
- Compatible P1-04 schema-2 vault audit union preserves schema-1 bytes and public IPC.
  Audit intent flush gates mutations/plaintext; post-commit audit failure preserves
  a truthful committed result with DEGRADED audit health. Unaudited early failures
  never claim AVAILABLE. Composed actual owned LogStore append/sync faults block
  mutation without echoing secret/error canaries.
- Injected failures immediately before and after actual index rename prove restart
  sees one complete index state; uncertain writer is poisoned and cannot retry.
  This is controlled filesystem-boundary fault evidence, not arbitrary power loss.
- Actual main opens/verifies the vault only after certified P1-05 NORMAL startup;
  restored/partial roots fail closed. Shutdown waits for vault work before persistence
  and logger settlement. Three real leased-root entry/lifecycle fixtures pass.

The expanded TAP output reached the old 64-KiB cap once. Coordinator approved
fixed sorted sequential batches of at most16 files, each retaining30 seconds and
64KiB, exact six-field summaries and zero failures/skips/cancellations/todos.
No file is dropped/duplicated; aggregate success requires every batch to pass.
The enclosing workflow timeout is unchanged. The first integrated graph test also
correctly rejected its stale33-module expectation; it now asserts the reviewed38.

## Native verification status

The verification-only LocalService helper source is independently reviewed, with
fixed effective-SID/reversion checks and owner/foreign-provider positive controls.
It has not been compiled or executed here. No token acquisition or impersonation
has occurred. The exact owned synthetic-profile input and bounded Job/capture
wrapper require review before execution; inability to obtain/use the foreign
provider cannot count as cross-user denial. Normal OS-provider writes are possible;
no zero-system-write, token-borrowing, escalation or secure-erasure claim is made.

Native source/package restart CRUD, real owned index-sharing denial, persisted audit
and retired artifact canary scans, strict sanitized schema and exact-head Windows
execution are being integrated. No native P1-06 PASS is claimed from local tests.
P1-05 database containers do not automatically include external vault revisions;
missing restored references remain unavailable/re-entry-required, not rebound.

## 11:26 UTC — reviewed native envelope and first hosted execution authorization

Current author aggregate: **319/319 desktop** and **104/104 Python PASS**. The
additional native-envelope contract/artifact/context source tests are included in
the aggregate. Independent final full rerun passed **319/319 desktop, 109/109 foundation and
104/104 Python**, with no failures/skips/cancellations/todos. The prior independent
library 316/316 remains a separate completed checkpoint, not native proof.

The coherent source/package envelope uses five orderly retired stages: create,
replace, actual access-denied replacement, delete and reopened DELETED. The denial
stage holds only the exact owned index with Windows FileShare.Read and delegates
unchanged real rename; only observed EACCES/EPERM/EBUSY plus preserved active bytes
and reopened prior reference can pass. No ACL or system security setting changes.
Retired log/profile/vault scans are bounded and include known UTF-8/UTF-16/base64
canaries; positive file counts are required, and zero native-dump count is not a
claim that arbitrary dumps are sanitized. Raw captures/refs/ciphertexts stay private.
Schema 4 requires all vault groups and cross-context controls in both modes while
preserving historical public schemas 1–3. Missing/false evidence never becomes PASS.

Independent envelope source review passed 7 Node and 11 vault-Python focused tests.
Coordinator explicitly authorized the first bounded hosted execution at 11:26 UTC,
after reviewing the complete helper/provenance/Job wrapper—not merely its design.
Helper SHA256: `b52511ff827a696d464699eff94b4590a875960cadf071c3a18826fc4b304a23`.
The exact owned synthetic profile-key blob is bound by current build/root/lease/
profile hashes. The isolated System32 PowerShell process has the reviewed 120-second
Job deadline, 10-second cleanup and bounded capture; no borrowed tokens, new
accounts/services/tasks, changed ACL/rights/privileges, credentials or escalation
fallback. Failed token acquisition/provider control is NOT cross-user PASS. Failed
reversion/identity verification terminates the isolated process without resuming
owner filesystem work. Normal OS-provider profile writes remain disclosed.

Compilation, PowerShell and actual identity/native behavior remain NOT_RUN until
that exact-head hosted run. This is a checkpoint, not full P1-06 acceptance. Native
missing/corrupt encrypted-record negatives remain a finite completion item (current
pure/composed tests cover these); no user-host or cross-machine claim is inferred.

### Post-publication entry allowlist correction (11:30 UTC)

Read-only review found that the native probe's control-filename allowlist omitted
`denied`, although the strict stage contract and supervisor already required it.
This deterministically rejects that stage before its intended OS denial test; it
is a source finding, not an observed hosted outcome. Coordinator authorized the
narrow missing-literal correction and a regression that checks both modes/every
contract stage against the actual entry regex and rejects unknown/aliased names.
The focused contract suite passes 3/3; native acceptance predicates, ownership,
identity constraints and deadlines are unchanged. The initial CI remains running
on the prior exact head and cannot establish this corrected entry's behavior.

The first hosted run `41197082168` produced successful source CREATE/REPLACE
records, then failed before a DENIED result. This is consistent with the source
allowlist defect, not proof it was the only possible failure. The next exact-head
run `41197272146` stopped earlier at QUALITY_FAILED: adding the literal exceeded
the formatter's line width. Replaying the committed probe through the reviewed
formatter reproduced its required whitespace-only wrapping. The regression now
permits that formatter whitespace while still extracting the exact entry regex.
The corrected base (without pending negative-stage work) passed the full desktop
pipeline **320/320**, including quality, strict types, build and manifest checks.
No native or cross-context result is inferred from the failed quality run.

### Scoped missing/corrupt active-record increment (11:37 UTC)

Coordinator authorized the reviewed same-owned-vault native negatives after the
entry fix was published. Seven-stage schema 5 adds missing and corrupt ACTIVE
ciphertext cases before deletion; historical schema 4 retains its exact five-stage
set. Each case requires an original native-provider canary read, exact fixed denial
with no returned data, independent fresh-store verify refusal, and exclusive
witnessed restoration followed by a fresh original-reference read. Index, receipt
and every other vault file are hash-witnessed unchanged. Corruption flips only the
last ciphertext/tag byte; it preserves the provider prefix and length.

Original ciphertext copies are private, exclusively written/synced and retained
until fully retired, validated collection cleanup (including a truthful
TOKEN_UNAVAILABLE aggregate FAIL). Expected altered state is checked before restoring;
unexpected state or any uncertainty preserves evidence, retains the primary
failure and stops later work. No production fault hooks, relaxed provider/schema
predicates, arbitrary paths or real credentials are introduced. Native outcomes
remain pending; local helper fixtures do not substitute for actual provider denial.

### Actual unavailable-context outcome and safe independent collection

Run `41197592146` / job `124526788626` failed truthfully at cross-context acquisition.
Its strict reviewed artifact reports all five source vault stages passing, including
real `EPERM` for the held-index publication attempt, then `TOKEN_UNAVAILABLE`.
Owner-before authentication was true; the other five context controls were false;
the isolated helper itself exited 0 with confirmed cleanup and no truncation.
There was no impersonation or foreign-provider denial proof. Required cross-user
acceptance therefore remains explicitly UNMET; technical count stays six/formal zero.

Coordinator approved collection of independent later groups only for that exact
validated pre-impersonation vector and successful retired native process. The fixed
COLLECTION_SAFE marker does not change validation exit 1, VALIDATION_FAIL or the
stored false context result. All other failed/uncertain statuses abort. The final
aggregate remains FAIL even if both modes and cleanup otherwise complete. No new
identity mechanism, account/service, privilege/right/ACL change or token borrowing
is authorized or attempted; no permission-free alternative has been established.
The local Python suite passes 107/107, including all 448 status/Boolean-vector
combinations, process uncertainty and complete-later-groups-still-FAIL checks.


Independent final review at 11:43 UTC: desktop **327/327**, foundation **109/109**,
Python **107/107**, clean diff and unchanged native-helper/Phase0 hashes. Seven-stage
source integration and narrowly validated safe collection are CLEAR for hosted
verification. These local/source results do not close the actual cross-user gap.

## Hosted seven-stage collection — bounded PASS, full P1-06 UNMET

- Public source head: `7137e3182dd7701e952ae71f758363915c839db1`.
- Exact reviewed local source: `96cf35ec9b77e18b6babb730466b27646a88a54e`;
  tree `aed396d3d4b260450ac067ba670644379c006874`.
- Hosted Windows run `41198112252` is terminal **FAIL**, deliberately not greenwashed.
- Retained fixed sanitized [sample](P1-06-collected-sample-2026-10-31.json):
  21,972 LF bytes; SHA256
  `f62762944c7f2dfb76377867c3eae45056b99f01620f10c0a678d43713884559`.
  Digest refers to exact artifact/Git bytes, not a potentially converted checkout.

All seven native vault stages pass in both source and renamed-package modes:
create, replace, actual EPERM publication denial, missing active ciphertext,
authentication-failed corrupted ciphertext, delete and deleted restart. Every
stage requires the real composed provider/store, fixed typed/no-data negatives,
audit/canary observations and retired process controls. The original-reference
positive before/after restoration and unchanged other files are mandatory native
negative predicates, not merely pure fixtures. All existing key/READY/database/
maintenance/restore groups also passed and directory cleanup is true.

Both cross-context results are **TOKEN_UNAVAILABLE**, owner-before true and all
other controls false. They establish no foreign identity, foreign-provider positive,
foreign-owner-blob denial or reversion proof. Strict public `passed:false` is retained;
`failure:null` means collection completed without a supervisor exception, NOT task
success. No account/service/rights/ACL/token/identity workaround was attempted.
The canonical cross-user negative remains UNMET, not replaced by a wrong-key fixture.

Independent reviewer validated the original duplicate-aware bytes against the exact
committed schema and reconstructed strict private-envelope/public equality; fixed-field
privacy review CLEAR. That is artifact-content review, not a second native run or
independent ZIP download. Coordinator accepted **bounded seven-stage native-vault
PASS only**. P1-06 is not TECHNICAL_PASS; six technical tasks/formal zero remain.

The current production-launcher E2E step is downstream of the failing aggregate and
was skipped. Its most recent accepted exact-head evidence remains the P1-05 source
head `2e8c08b7df8448c7db89438891da66bce7b8b715`; do not present that earlier result
as a rerun of this vault-integrated launcher. Same-owner/pinned-runtime, simulated
dialog, no arbitrary-dump confidentiality/power-loss/secure-erasure and external-
vault-not-in-DB-backup limitations remain. No further unchanged token-acquisition retry is planned.
