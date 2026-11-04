# P1-06 — Windows secret-store abstraction: proposed contract

**Status: SCOPED SOURCE ENTRY APPROVED at 2026-10-31 11:02 UTC.** Prepared after qualified
P1-05 TECHNICAL_PASS. Coordinator requested an implementable design under delegated
Auto authority; coordinator approved this exact implementation after independent design CLEAR.
Cross-context execution still requires exact bounded-helper source review; no
unreviewed runtime identity/security action is authorized.
Work remains on `phase-01`; full Phase 0/task-chain acceptance is unchanged.

## 1. Canonical scope and exclusions

Implement [P1-06](PHASE-01-desktop-foundation.md#p1-06--windows-secret-store-abstraction)
and [C-14](../16_ACCEPTED_PRODUCT_DECISIONS.md): main-only create/read/replace/delete
of Windows-protected secret material and opaque references, masked renderer status,
restart consistency, failure visibility, and audit references without values.
Reuse the established [P1-05 profile/lease](PHASE-01-P1-05-PERSISTENCE-CONTRACT.md)
and current runtime/old-backup authentication gates. This is not real proxy/account
integration, credential collection, another public IPC method, P1-07 settings,
V9 redesign, cross-machine recovery, or a general privileged service.

No product credentials are used in tests. SQLite/domain data must contain opaque
references only, never secret values, decryption keys or an encoded plaintext
substitute. This abstraction does not invent unused account/domain tables; later
consumers persist the exact reference contract and must handle unavailable/stale
references without silently rebinding them. A synthetic SQLite binding fixture
will verify reference serialization without claiming domain integration.

## 2. Exact main-only API and authority

- Reference: exact own data fields `{version:1,id:UUID,revision:Revision}`. UUID is
  main-generated lowercase canonical UUID; Revision is a positive safe integer,
  excluding negative zero. Version is a safe integer; unsupported values reject.
- Purpose: fixed `PROXY_CREDENTIAL` for this checkpoint, not a caller-controlled
  filesystem namespace or arbitrary service selector.
- `create(caller, purpose, bytes)` returns a new reference at revision 1.
- `read(caller, reference)` returns a fresh byte copy only inside trusted main.
- `replace(caller, reference, bytes)` requires the exact active revision and returns
  the same ID at revision + 1. No implicit last-write-wins/retry.
- `delete(caller, reference)` requires exact revision, commits a tombstone and
  returns a fixed acknowledgement. Repeated deletion of that exact tombstoned
  revision is idempotent; stale/different references reject, never delete newer data.
- `status(reference)` returns only fixed `AVAILABLE`, `MISSING`, `DELETED`,
  `STALE_REFERENCE`, or `UNAVAILABLE` plus the supplied valid opaque reference;
  it never attempts to expose plaintext, length, username or secret fragments.
  No new renderer bridge is introduced. Existing health/settings stay compatible.

All bullets above describe the payload inside one exact typed result envelope,
not a raw reference/byte return. Success is
`{version:1,ok:true,operation,outcome,data,auditHealth}`; failure is
`{version:1,ok:false,operation,code,auditHealth}` with no data/reference echo.
Operation is the fixed called method CREATE/READ/REPLACE/DELETE/STATUS, never an
unvalidated input string. Audit health is AVAILABLE or DEGRADED, independently of
operation success. Exact success variants:

| Operation | outcome | exact data |
|---|---|---|
| CREATE / REPLACE | COMMITTED | `{reference:Ref}` |
| DELETE | COMMITTED or UNCHANGED for the exact existing tombstone | `{reference:Ref,deleted:true}` |
| READ | READ | `{reference:Ref,bytes:Uint8Array}` (fresh copy, main-only) |
| STATUS | OBSERVED | `{reference:Ref,status:fixedStatus}` |

Post-commit audit failure remains `ok:true,outcome:COMMITTED,auditHealth:DEGRADED`
with the exact committed reference, not an ambiguous retryable failure. Plaintext
READ success requires its audit completion plus final authorization; otherwise
return a fixed failure with no bytes. Invalid reference input returns no caller
ID/bytes/status echo. Existing P1-11 bare `secretRefId` fixture fields are synthetic
relationship IDs, not live vault authority: no automatic bare-ID→latest-revision
resolution is introduced; later bindings must explicitly carry version/revision.

A private main-created caller capability is identity-checked, method-scoped and
revoked during closing; no serialized renderer token can manufacture it. Recheck
caller/root ownership before admission, before index publication after awaits,
and immediately before returning decrypted bytes (including after audit awaits).
One bounded serialized operation lane rejects overlap, rather than retaining an
unbounded queue. Copy admitted reference/bytes before the first await. This guards
ordinary caller mutation; it is not a sandbox against malicious code inside main.

Development bounds: secret input 1–4096 bytes, ciphertext record at most 32 KiB,
index at most 64 KiB/256 entries, one operation at a time. These are fail-closed
adapter limits, not claimed permanent product/device capacities. No truncation.
No caller-controlled path, SQL, filename, crypto option or arbitrary error string.
Revision filenames are derived only from validated UUID/revision; index bytes stay
within the existing 65,536-byte owned-file helper limit. Bounds count tombstones
and inactive evidence too; exhaustion rejects safely rather than pruning silently.

Fixed failures: `AUDIT_UNAVAILABLE`, `INVALID_REQUEST`, `UNSUPPORTED_VERSION`, `UNAUTHORIZED`,
`STALE_REFERENCE`, `NOT_FOUND`, `DELETED`, `BUSY`, `KEY_UNAVAILABLE`,
`DECRYPTION_FAILED`, `STORE_INVALID`, `WRITE_FAILED`, `OWNER_REVOKED`,
`REVISION_EXHAUSTED`. Malformed input cannot echo caller data into errors/logs.

## 3. Storage and Windows custody

Use the existing approved Electron `safeStorage` provider only after the actual
P1-05 profile/runtime admission gate. No plaintext fallback or application-created
master key replaces an unavailable provider. Store under an exact owned `vault/`
child of the existing persistent root, protected by the same retained owner lease.
No new npm dependency, native daemon, user account, service or system setting.

Each immutable revision file contains only the provider's encrypted bytes. The
plaintext protected by `safeStorage.encryptStringAsync` is canonical JSON with exact
`version,storeId,id,revision,purpose,payloadBase64` fields. Use exact `decryptStringAsync` result `{result,shouldReEncrypt}`; a true
rotation hint returns `KEY_UNAVAILABLE` and does not silently rewrite/rebind a
reference. A separately reviewed rotation migration would be needed. On decryption require
canonical serialization, exact bindings, canonical base64 and byte bounds before
returning a fresh byte array. Binding inside the protected plaintext detects
record swaps; external metadata alone is not treated as authenticated. A successful
read must match the current index and requested revision. No raw secret enters
SQLite, a log event, an exception, command-line arguments or an uploaded artifact.

The nonsecret canonical index binds store ID and exact active/tombstoned entries.
Its exact fields are `{version:1,storeId,entries}` with entries ordered by ID; each
entry has exactly `{id,revision,purpose,state}` where state is ACTIVE or DELETED.
A tombstone retains the last active revision, so deletion of that exact reference
is idempotent and the ID is never reused. It contains no secret lengths/payloads. It is bounded, duplicate-aware and descriptor-validated. Unknown filenames,
missing/malformed active records, conflicting active revisions, malformed active index or ownership mismatch
fail closed; never rebuild active authority by scanning arbitrary ciphertext.

Encryption/decryption produces JavaScript strings internally; no guaranteed secure
zeroization is claimed. Clear owned byte buffers best-effort after use; do not
retain successful read results in caches or closure state. Logging sees only fixed
operation/result and opaque reference fields through the reviewed P1-04 encoder.

### Exact files, initialization and inactive records

`vault/.owner` binds the existing store ID; `vault/index.json` is the sole active
index. The exact allowed inventory is `.owner`, `index.json`, `initialized.json`,
and the two filename grammars below; `.owner` is exactly the canonical store UUID
with no trailing newline. Revision names are exactly `secret-<UUID>-r<positive decimal>.bin` (canonical
no-leading-zero revision). Index candidates use the existing helper's exact
`.replace-<UUID>.json` grammar; ciphertext candidates are already final immutable
revision names and are not active until referenced by the index.

Reserve a new vault only under a verified FRESH/active persistence root, with an
exclusive empty directory, owner marker, empty index, then an exclusive flushed/closed initialization
receipt `initialized.json` containing exactly canonical
`{version:1,storeId:<same UUID>,format:"VAULT_V1"}`. Do not treat a missing index in an existing/nonempty vault as an empty
store. Initialization interrupted before its receipt is an explicit unavailable
recovery state, not automatic reset. Restored roots do not auto-create a replacement
vault for missing references. Unknown names or identity mismatch reject. Exact-named bounded regular
unreferenced revision/index candidates are inactive retained opaque evidence and
may coexist with a valid committed index even if an interrupted write left their
contents incomplete. Only ACTIVE indexed records are authenticated and admitted. Do not
adopt or automatically delete them. Total inventory is at most 1024 entries and
32 MiB, including tombstones/inactive records, no symlinks/reparse descendants.
Exhaustion rejects new writes; no automatic reconciliation/compaction is invented.

### Compatible audit extension

Keep every existing schema-1 P1-04 record/tuple accepted unchanged. Add a separately
validated schema-2 vault record with the same bounded run/sequence/time/severity
fields, `component:MAIN`, `task:P1-06`, fixed `event:SECRET_OPERATION`, operation
CREATE/READ/REPLACE/DELETE/STATUS, phase INTENT/RESULT, a main diagnostic UUID,
nullable validated `secretId`/`revision`, and only OK or the fixed vault failure
codes. Both reference fields are null for invalid input, never copied unvalidated.
No purpose label, payload, length, path, exception or caller metadata is added.
Update the existing log-store validator/encoder/scanner as a compatible union;
retain schema-1 snapshots and rejection fixtures. No v1/v2 public IPC wire change.

An audit intent must be accepted and flushed before a mutation or plaintext return
is authorized. Audit failure there yields AUDIT_UNAVAILABLE and no index mutation
or plaintext return. After index commit, an audit-result failure cannot undo the
already committed operation: return its exact reference/outcome with explicit
`auditHealth:DEGRADED`, never a retryable generic write failure. All operation
results distinguish operation outcome from audit health. Reads must recheck caller
and lease after audit completion before releasing their copied bytes. These rules
must be tested with real logger failure injection and canary scans; no claim an
in-memory enqueue alone proves persistent audit. Existing deadlines do not cancel
issued writes or permit premature lease release.

## 4. Commit, replacement, deletion and interrupted-operation rules

Create/replace: snapshot inputs → validate owner/index/caller → encrypt → write a
fresh exclusive revision file → flush/close → decrypt and verify that exact record
→ recheck owner/caller/current revision → write/flush/close a fresh index candidate
→ atomic index replacement using the reviewed owned-file primitive. The previous
index remains the authority until publication. Never overwrite an active encrypted
revision in place. A failure before index publication must preserve the previous
active reference/bytes; an orphan encrypted candidate is not active.

Delete: commit a tombstone through the same index transaction first. Ciphertext
cleanup is a separate bounded owned operation after the tombstone is durable and
all relevant operations are settled. A cleanup failure does not resurrect the
secret or turn deletion into an unrecorded success. Do not promise forensic secure
erasure from SSDs, backups, page files or prior snapshots. Existing DB references
remain references and resolve to DELETED; do not silently delete user rows.
A database restore does not silently reconstruct or reset a vault: references whose
matching encrypted revisions are absent remain unavailable/re-entry-required.
This task must document that existing P1-05 database containers do not automatically
include the external vault; do not advertise complete secret backup/portability.

On restart: validate index and every referenced immutable record before admitting
operations; incomplete candidates are retained as inactive evidence and reported,
not adopted or automatically pruned. Reopen of the last complete index yields its
last committed state. If an index replacement outcome is uncertain, stop writes
and require owned recovery/revalidation; do not retry a mutation blindly. Shutdown
awaits the shared operation completion before releasing ownership; deadline expiry
retains uncertainty and does not claim cancellation of issued filesystem writes.

Tests must place failures before and after each publication boundary and prove
old/new state is one complete version, not mixed state. Recovery of stale locks
must use P1-05 stopped-owner rules; no new lock-stealing path.

## 5. Required evidence and limitations

Pure/owned-file tests: exact request/reference grammar and caller spoofing; stale
revision, deleted/missing record, concurrent operation, caller mutation, invalid
ciphertext/bindings, missing provider, replacement/write failures, interrupted index
publication, restart and idempotent deletion. All errors fixed/no data echo.
Actual Windows tests: synthetic canary create → orderly retirement → same-reference
read after restart; replace → restart → new value only; delete → restart → DELETED;
old revision denial; missing/corrupt encrypted record and provider denial; audit and
artifact scan. Only fixed booleans/codes/counts may be published. Whole profile and
ciphertexts remain private owned evidence under the existing cleanup rules.

Renderer denial is actual existing IPC request/payload rejection plus a boundary
fixture proving no vault import/channel in preload/renderer. It does not require
exposing a retrieval method solely to reject it. No main-process compromise proof.

### Another Windows user context — bounded design approved, execution pending

Wrong-key fixtures, a second process under the same SID, a restricted same-user
token, and `LOGON32_LOGON_NEW_CREDENTIALS` do not satisfy this canonical negative.
Microsoft documents that NEW_CREDENTIALS retains the same local identity:
[LogonUser](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-logonuserw).

Coordinator approved this bounded design at 11:00 UTC under the delegated
implementation/test grant, with exact source review required before execution.
A bounded verification-only
helper attempts a service logon for the already existing built-in LocalService
identity, without creating an account/service/task, changing rights/ACLs, enabling
privileges or supplying a password. Actual availability on the named runner is
UNKNOWN. [LocalService](https://learn.microsoft.com/en-us/windows/win32/services/localservice-account)
is a distinct predefined identity; this does not itself grant permission or prove
LogonUser will succeed. No identity experiment has run; source/execution review remains required.

If the reviewed mechanism is available, verify the actual effective token SID is
exactly LocalService (S-1-5-19) and differs from the runner,
impersonate only for bounded DPAPI operations, and always revert/close handles.
Verify successful reversion and the original effective SID before any owner
filesystem continuation; failed RevertToSelf terminates the isolated helper.
Normal OS provider profile/key writes may occur; no zero-system-write claim.
[RevertToSelf](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-reverttoself)
explicitly requires stopping if reversion fails.
Use only the owned synthetic profile-key blob: normal-owner decrypt positive before
and after; a foreign-context own-canary protect/decrypt positive; actual foreign
CryptUnprotectData of the original owner's blob must fail. Never publish plaintext,
raw SID, blob or exception. Failure to obtain a token or initialize a usable foreign
provider is NOT cross-user denial. This is compositional provider-boundary evidence,
not a full Electron application run under another account. Coordinator explicitly
accepted that compositional provider boundary for the abstraction-level criterion,
conditional on all actual controls passing.
[CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
describes user-scoped protection; machine-scope protection is forbidden here.

If the permitted mechanism is unavailable, retain the exact unmet cross-user check
and propose a separately authorized test environment/action. Never silently weaken
it or borrow tokens/credentials from unrelated processes. No user secrets requested.

## 6. Proposed source/test placement and entry

Main-only `secret-store.ts`, pure `secret-contract.ts`, native provider adapter using
existing runtime custody, owned-file tests and the already scoped Windows envelope.
Extend exact module-map bindings and manifest inputs before running new code. No
public v1/v2 response change. The P1-05 reference-only database rule is tested without
adding speculative business migrations. Independent source review precedes exact-
head Windows execution; canonical criterion audit follows actual results, not merely
source test counts. Coordinator approved this exact complete contract for source entry at 11:02 UTC;
the cross-user design choice is recorded above, not permission to execute an
unreviewed helper. P1-06 is not technically accepted
by this proposal; current counts remain six technical tasks and zero formal tasks.


### Entry record — 2026-10-31 11:02 UTC

Coordinator authorized the independently CLEAR exact contract under the existing
development-only exception. Implement only synthetic/main-owned vault abstraction,
compatible audit and owned verification; no real credentials, public new IPC,
account/device integration, privilege changes or escalation fallback. Native
cross-context helper must be reviewed before execution. Tested durability means
sync/close/readback/process-crash evidence, not arbitrary power-loss guarantees.
Original Phase 0 gates remain unaccepted; technical counts stay 6/11 and 6/154,
formal zero. This entry precedes implementation.

### Recovery clarification — 2026-10-31 11:12 UTC

Coordinator resolved the original malformed-candidate wording against the required
last-committed restart behavior: exact-named regular bounded inactive revision and
.replace bytes remain opaque non-authoritative evidence, including partial writes.
Authenticate every ACTIVE indexed record; reject missing/malformed active state,
unknown names, owner/type/bound violations. Never parse/adopt/prune inactive files
or overwrite collisions. The partial-write/restart regression must prove prior
committed state remains usable without weakening active authentication.

### First hosted helper authorization — 2026-10-31 11:26 UTC

After independent complete-envelope source review, coordinator approved the exact
bounded first hosted run, including reviewed LocalService helper SHA256
`b52511ff827a696d464699eff94b4590a875960cadf071c3a18826fc4b304a23`,
owned synthetic blob provenance, isolated System32 PowerShell 120-second Job,
10-second cleanup/capture bounds and verified reversion/fail-stop rules. No token
acquisition/provider failure may count as denial evidence; no privilege/account/
ACL/task/service change or escalation fallback. This permits that reviewed test,
not arbitrary identity use or task acceptance; actual results remain pending.
