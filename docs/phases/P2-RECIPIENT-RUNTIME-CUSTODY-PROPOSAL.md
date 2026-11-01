# Recipient runtime read-admission and shared custody

Status: SOURCE IMPLEMENTATION IN PROGRESS under coordinator Coder Bin's 2026-11-01
05:53 ordinary independent Phase2 source delegation; independent design CLEAR at 05:59
on exact pre-entry SHA256 `36203047ccf6164c795a3c49d9d3f06feaae86d9beadab5302a3f21605d3061a`.
No host/network/server/device execution is granted by this contract. Prior application
9cfb65d and native runner935add3 remain immutable, separately published checkpoints.

## Canonical dependency and limits

P2-01 requires exact app-local binary resolution; P2-02/P2-07 require ownership and no
competing runtime replacement. Current setup's idle check merely states that no production
server exists. Replace that assumption with a real main-owned shared custody lane before
any future transport adapter can borrow verified runtime bytes. This is not a runnable
process capability, server ownership proof, license-review substitute or BINARY_UNAVAILABLE
promotion. No new IPC, renderer state, V9 change, download or native process launch.

A fixed ADB argument compiler/actual host adapter is a subsequent separate boundary;
this slice does not add arbitrary shell/argv or guess Android/OEM behavior. Existing
inputArguments and actor target/display fences remain unchanged.

## Exact private custody protocol

One factory captures owned persistence root/storeId, location and lease assertions once.
Opaque tokens are frozen empty objects held in instance-private WeakMaps, never serialized.
Only one holder exists at a time, including asynchronous inspection/reservation. States:
IDLE, SETUP, INSPECTING, READ_LEASE, CLOSING, UNRETIRED, CLOSED. No unbounded queue.

- `reserveSetup()` synchronously reserves SETUP before any owner/location callback or
  await, then checks ownership/location and the still-current reservation. Reentrant
  acquisition therefore sees BUSY; failed admission retires only its own new reservation. It returns an opaque setup token or a fixed refusal. This is
  an in-memory reservation, not recipient consent or a provisioning intent.
- `assertSetup(token)` checks exact instance/token, owner/location and current state.
  `releaseSetup(token, retired)` accepts only an exact boolean supplied by the owning
  service after its real native/core/reservation promises settle. False latches UNRETIRED;
  no timeout, absent holder or free OS lock is treated as retirement. Unknown/foreign
  tokens never release another holder. The same retained setup token may subsequently
  report true only when its actual outstanding operation finally retires; this can finish
  closure but never reopen admissions after false/close. No generic unlock/reset is exposed.
- `acquireRead()` reserves INSPECTING before asynchronous work. It reads the actual owned
  provisioning ledger, requires a settled active exact candidate, scans the complete bounded
  provisioning inventory and physically rehashes/PE-checks all14 files using existing helpers.
  It then rereads the ledger byte-bound state (revision/active digest/last-settlement hash)
  and final owner/location/internal-generation fence before returning READ_LEASE.
  Missing provisioning is BINARY_UNAVAILABLE; invalid/partial/changed state is
  RECOVERY_REQUIRED. No files/directories/ledger entries are created by admission.
- Success exposes an opaque read token plus fixed private observation: release37.0.1,
  archive/manifest SHA256, ledger revision and absolute derived adb.exe path under the
  exact active `platform-tools-runtime/runtimes/runtime-<pin>` directory. No caller path,
  PATH fallback, generic manifest or fabricated componentLicensesReviewed flag is accepted.
  This observation is private, never renderer/log output and never executable permission.
- `revalidateRead(token)` reruns the same actual ledger/inventory/file and final fences,
  requiring the originally pinned revision/settlement/digests. A changed file/state refuses
  and invalidates that token’s read observation, not its retained holder identity. The same
  token can still retire its own holder after inspection settles; no replacement candidate
  is silently adopted. Foreign/already-released tokens remain refused.
- `releaseRead(token)` releases only that read-only holder, after its own active inspection
  promise settles. It is not a process/endpoint retirement assertion. A future process
  adapter must introduce explicit native Job/endpoint custody before dispatch and cannot
  relabel this token as process ownership. Current production has no such adapter.
- `close()` stops new reservations, invalidates observations and waits at most120000ms for
  the actual inspection promise and holder release. If either remains, return UNRETIRED,
  retain the holder and prevent persistence lease release; no promise cancellation is
  equated with completion. Subsequent status can observe eventual retirement, but no new
  admission resumes after close. All results use fixed enums, descriptor-only/nonthrowing
  error classification; no raw exception/path enters public output.

Fixed refusal codes: BUSY, CLOSED, OWNER_REVOKED, INVALID_TOKEN, BINARY_UNAVAILABLE,
RECOVERY_REQUIRED, UNRETIRED. Read-success type is explicitly READ_VERIFIED_ONLY.
At most one read token and one setup token can ever be live; historical tokens are weakly
held and cannot regain authority. Safe-integer revision checks reject negative zero.

## Actual application composition

Main creates one custody instance for the actual owned persistence root. The existing
setup service reserves SETUP before REQUEST INTENT/dialog handoff, keeps it through
native decisions/core work and releases only after actual operation settlement. Every
existing core `assertIdleSync` call becomes exact `assertSetup` for that reserved token;
initial read-only service initialization also holds an exclusive reservation while the
actual core status promise runs. This in-memory token is never a recipient grant and
creates no provisioning intent or files. Release waits for both the native/core operation
and any outstanding REQUEST audit/result reservation to settle. Audit barriers remain unchanged: custody alone
never allows dialogs or bytes before existing REQUEST/PROVISION INTENT flush.

Main shuts the setup service down first, then closes custody before fleet/durable/SQLite
release. An unretired setup/read holder retains the old data lease. There is no production
caller of acquireRead/revalidateRead for execution yet; real owned-file composition tests
exercise the complete admission path and mutual exclusion, not synthetic public rows.
The actual setup UI/source behavior remains the previously reviewed contract.

## Tests and evidence

Use actual owned temporary directories and actual ledger/files APIs, with explicitly
synthetic candidate bytes only where existing controlled module fixtures require them.
Cover missing/tampered/extra/symlink candidate, settled/current versus pending/revision
change, foreign/released tokens, final callback owner loss, reentrant acquire/setup,
setup-vs-read exclusion, close during delayed read and unresolved setup, no data writes
on admission, preserved originals on refusal, and actual setup-service reservation/audit
composition. No test may turn a fake retirement boolean into a native proof claim.

Register only main-private modules in strict graph/hash inventory, preserve old manifests
and candidate pin. Run affected tests and one coherent checkpoint if source dependencies
require it; reuse unchanged PASS evidence. Native901/214 expectations from the separate
runner are historical to that tree, not a claim for this new application revision.
No full canonical P2 task or hardware result follows from this source-only slice.
