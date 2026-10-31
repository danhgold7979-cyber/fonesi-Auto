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
