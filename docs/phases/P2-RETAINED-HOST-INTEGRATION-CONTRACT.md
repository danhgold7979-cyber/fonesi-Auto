# Retained reader/bootstrap — converged source-only batch

2026-11-01 08:30 UTC: coherent LOCAL source entry under coordinator Coder Bin's ordinary source delegation, following consolidated independent design review.
Remote publication remains held for phase batching; no new native execution approval.
Preserve prior compile-only PASS public e5680a2f /
run41287763437. This entry permits implementation and affected local tests only, not helper/ADB
execution, profile/network/device action, production autoactivation, publication or CI.

## One concrete path

Opt-in trusted launcher creates a nonce-named OUTER kill-on-close, non-breakaway Job,
assigns the actual Electron main while suspended, writes immutable native-handle parent
receipt, then resumes. Main later uses ordinary fixed Node private-stdio spawn for one
long-lived PowerShell Add-Type bootstrap; child inherits outer Job from creation.
No spawn-then-assign race, per-call PowerShell, second duplex supervisor or public pipe.

Bootstrap verifies parent/self Job membership and exact flags with a transient QUERY
handle, closes that Job handle BEFORE readiness or effects, retains only the exact
parent process handle, then runs the real continuously reading C# protocol dispatcher.
Existing TS createHostBridge talks to this actual reader; it invokes unchanged compiled
RetainedProvider methods. First useful complete operation is VERSION only.

## Launcher API and immutable parent receipt

Keep RunBounded/RunInteractive and old anonymous Job behavior unchanged. Add a separate
trusted-main opt-in API RunInteractiveWithHostJob(executable, arguments, context), never
renderer-callable. Context contains exact existing launch directory, launchId, storeId,
ownerToken, prepared READY raw SHA256, exact Electron image hash and a cryptographically
fresh jobNonce UUID. Only normal SOURCE/PACKAGE launch may opt in; initialization,
maintenance, restored-only, demo and historical native fixtures keep existing behavior.
No default activation flag or inherited environment setting silently opts in.

Job name grammar exactly Local\\Fonesi-Auto-host-<canonical-lowercase-UUID>. CreateJobObject
must inspect immediate last-error and refuse ERROR_ALREADY_EXISTS; never adopt a named
object, even with apparently matching flags. Set exactly KILL_ON_JOB_CLOSE (0x2000), no
BREAKAWAY_OK/SILENT_BREAKAWAY_OK. Preserve existing suspended creation, explicit inherited
handle list, Job assignment before resume and descendant retirement/drains. Creating a
named Job is a documented small derivation delta in PersistenceProcess.cs, not a claim
that its bytes stay unchanged. Whole-source derivation tests bind old source plus exact
new optional branch; no other behavior change is intended.

After assignment and BEFORE ResumeThread, use actual CreateProcess handle/PID and
GetProcessTimes to write exclusive launch/host-parent.json (UTF8 canonical, <=4096 bytes):
{version:1,launchId,storeId,ownerToken,readySha256,jobName,parentPid,
 parentCreationFileTime,parentImagePath,parentImageSha256}.
parentCreationFileTime is exactly16 lowercase hex digits representing native creation
FILETIME, lossless; no Date.now, uptime, approximate timestamp or PID-only authority.
parentPid is positive uint32. Exact canonical full image path/hash must match the selected
verified Electron binary. FileMode.CreateNew + Flush(true) + exact readback; collision,
write/readback failure or failed handle query aborts BEFORE resume and retires the
retained suspended process/Job. Receipt absence cannot fall back to guessed context.
The outer launcher retains the ONLY intended long-lived outer-Job owner handle.

READY v2/v3 remain byte-compatible. The opt-in companion is accepted only when exact
launch journal/header/owner and READY raw hash bind it. Add only host-parent.json to the
closed launch inventory, immutable witness and owned cleanup partition. No wildcard,
schema2/3 reinterpretation, extra app-state durability claim or legacy auto-admission.
Legacy absence leaves host provider unavailable.

## Main factory and private bootstrap issuance

New main-only factory consumes the already validated opt-in parent receipt and current
runtime read holder, not renderer parameters. Revalidate owned root/lease/READY/journal,
current process PID and exact receipt/runtime/helper/package closure before writing one
exclusive private bootstrap record under the admitted owned run root. It binds sessionId,
parent receipt SHA, owner token, exact adb path/executable hash, candidate manifest/archive
hashes and installationRevision, plus exact helper/bootstrap asset hashes. Runtime path
is derived by custody, never a request field. Preserve ledger/runtime read holder until
actual attempt AND bridge I/O retirement, including transport failures.

Resolve exact Windows System32 WindowsPowerShell/v1.0/powershell.exe and validate its
canonical non-reparse path; no PATH lookup. Fixed flags: -NoLogo -NoProfile -NonInteractive
-File <bound bootstrap.ps1> <bound private bootstrap record> <exact record SHA256>.
The separate fixed hash argument binds the exact canonical main-produced bytes before
PowerShell parses the record; it is not authentication against a hostile local editor. No shell=true, command text,
ExecutionPolicy override, random DLL or network code. stdin/stdout pipes are private;
stderr bounded to fixed diagnostics. Capture a narrow explicit environment without
inherited NODE_OPTIONS/NODE_PATH/PowerShell/Electron overrides or ADB endpoint/key/discovery
settings. The trusted bootstrap uses the same reviewed Add-Type conventions and loads
only the hash-verified, fixed helper closure. Temporary compiler files/assembly allocation
are real effects and must be confined/witnessed in the owned temp partition; no claim of
zero Windows/.NET system writes. Package manifests and build inputs bind the added assets.

This factory is implemented and integration-tested but not automatically called by main.
An explicit reviewed owned harness can invoke it later; production fleet availability
remains BINARY_UNAVAILABLE. The fixed factory is the actual transport, not an injected
model substituted into the alleged native path.

### Exact helper root and separate helper lifetime

Factory exclusively creates launch/host-session-<sessionId>/ with canonical immediate
ancestry and .owner containing the same36-byte canonical owner UUID. Closed top-level
inventory: .owner, bootstrap.json, profile/ and optional adb.log only. bootstrap.json
is immutable canonical UTF8 <=8192 bytes, exact fields {version:1,sessionId,launchId,
storeId,ownerToken,operationSet:'VERSION_ONLY',parentReceiptSha256,readySha256,runRoot,adbPath,adbExeSha256,
candidateArchiveSha256,candidateManifestSha256,installationRevision,assets}; assets is
an exact fixed-key hash map for bootstrap.ps1, IsolatedAdbServer.cs, RetainedAdbSession.cs,
RetainedAdbProtocol.cs and native admission source. No arbitrary source path list.
All actual source paths derive from verified build/package closure. The optional adb.log
is private, never stdout/public. profile is exclusively owned temporary compiler/runtime
space: entire helper root <=64MiB/256 entries/depth8, plain single-link files/canonical
non-reparse directories only; unknown top-level entries reject before deletion. Overflow
preserves root, not cap escalation. No candidate/archive copied into this partition.

Only exact host-parent.json and host-session-<canonical-sessionUUID> are additive launch
inventory entries, bound to header/receipt/owner and immutable bootstrap. Existing launch
witness/cleanup must validate these partitions explicitly, with helper retirement proof;
no broad wildcard directory acceptance. Failed or interrupted contexts remain retained.

ADB-attempt and helper lifetime are distinct. VERSION terminal can release its runtime
read lease only after exact native attempt retirement AND actual per-operation request
write/response delivery settlement; an early response cannot outrun a pending write.
Release does not require the entire idle helper to exit. The PowerShell helper can still
be alive. Factory shutdown first awaits adapter.close/Retire, then signals bridge close by
stdin EOF, and awaits actual helper root/descendant exit plus stdout/stderr/write worker
retirement before helper-root cleanup or outer persistence lease release. Child exit/EOF
is NEVER substituted for missing ADB terminal facts. Unknown helper retirement preserves
run root and permanently closes admission. The concrete fixed spawn path and real C#
reader are implemented together; only OS-boundary injections substitute in local tests.

An idle helper's cached bootstrap is never renewed runtime authority. Every subsequent
VERSION requires a freshly current read holder whose revision/path/executable hash and
candidate digests exactly match the immutable bootstrap, with actual revalidation before
handoff. Changed installation refuses; it does not update the bootstrap or silently reuse
a prior read lease. A new helper requires its own admitted context and retired predecessor.

Helper success uses one reviewed exit-0 path only: Add-Type has returned; reader, native
attempt and all output/write workers have positively retired; then bootstrap returns0.
Factory additionally observes actual process exit0 and stdio closure. Child exit alone
does not prove descendant retirement; abnormal exit, missing attempt terminal facts or
incomplete worker/stream evidence remains UNRETIRED and preserves the run root. Do not
interpret exit0 from an arbitrary/mismatched bootstrap as this success path.

## Native admission: parent and outer Job

Before reader readiness, open parent using only SYNCHRONIZE|PROCESS_QUERY_LIMITED_INFORMATION.
Verify actual PID, exact GetProcessTimes creation FILETIME, exact QueryFullProcessImageName
image against receipt, still-alive state and independently verified image bytes. Retain
that process handle for death watch; do not reopen by PID during cleanup.

Open named Job with JOB_OBJECT_QUERY only. Verify exact limit flags, IsProcessInJob for
both retained parent and current helper process, then CLOSE the query Job handle in a
finally BEFORE any ready marker/provider reservation/effect. Even a QUERY handle retained
by the child could postpone last-handle kill; never retain it. No terminate/assign rights
are requested. Receipt or job name alone is not authority. Failure refuses bootstrap;
no unknown-handle adoption or fallback to an unnamed/default server.

Reuse existing declarations and checked native patterns. The small new interop boundary
actually needed (OpenJobObject, least-rights OpenProcess, GetProcessTimes,
QueryFullProcessImageName and extended-limit query overload) must be explicitly reviewed;
these are not present in the old helpers. Do not rewrite their existing CreateProcess,
Job/drain/health infrastructure. Original IsolatedAdbServer.cs and RetainedAdbSession.cs
stay byte-identical; additions live in new bootstrap/reader files. The existing helper's
inner child Job still supplies owned ADB retirement. Outer launcher/parent/bridge death
never means positive profile or runtime-custody cleanup by itself.

### Exact new build/package closure

Factory source desktop/src/main/adb-host-native-provider.ts produces the fixed private
build/adb-host-native-provider.cjs output. Add exact inputs/packaged paths for:
- native/IsolatedAdbServer.cs (unchanged reviewed hash)
- native/RetainedAdbSession.cs (unchanged compiled-reviewed hash)
- native/RetainedAdbProtocol.cs (new fixed reader)
- native/RetainedHostAdmission.cs (new parent/Job admission)
- launch/retained-host-bootstrap.ps1 (new fixed long-lived bootstrap)

The source build-manifest binds these exact files and factory imports; the PACKAGE
manifest binds each corresponding app/native, app/launch and app/build path and bytes.
SOURCE derives them under the verified desktop root; PACKAGE derives them under its
already-admitted app root. No wildcard C# enumeration or arbitrary assembly load. The
bootstrap.assets map uses exactly these four C# basenames and the PS basename with
currentverified hashes, while the factory output itself is build/package admitted.
Old package artifacts/manifests are historical and cannot be said to contain these
assets. Any missing/changed member refuses before Add-Type or spawn admission.

## Canonical request reader and actual concurrency

Accept ONLY the exact canonical ASCII bytes generated by current adb-host-bridge.ts:
{"version":1,"sessionId":"<uuid>","requestId":<positive-safe-int>,"attemptId":"<uuid>","operation":"VERSION|START|HEALTH|RETIRE"}\n
Five keys, this order, no spaces/escapes/alternate spelling, BOM, CR, extra LF, nested
values or trailing bytes. Maximum65536 bytes including LF. UUID lowercase canonical;
requestId canonical1..9007199254740991, strictly increasing. An anchored finite grammar
plus integer checks suffices; no general JSON parser/dependency. This narrowing matches
the actual producer; decoded duplicates/unknown keys cannot match. Response bytes are
closed serialization of exact known facts/error fields, parsed by existing TS parser.

One input reader stays live while one ordinary worker executes; permit one concurrent
cleanup-only RETIRE. Synchronously Reserve and register exact C# Attempt before scheduling
first VERSION/START. HEALTH/RETIRE never create attempts. New first-operation only after
prior native terminal facts AND prior worker/output retirement. Seen attempt IDs bounded
at128/session; overflow closes admission and cleans up, never evicts/reuses IDs. This is
a defensive memory budget, not product/device capacity. Requests/responses bind exact
session/request/attempt/operation; only ordinary+cleanup responses may finish out of order.

One writer serializes at most two <=65536-byte response frames. Actual write/flush
completion is tracked. A write timeout is not cancellation or retirement. EOF, incomplete
frame, malformed/replayed input, parent-handle death, output failure or protocol close
revokes new admission and requests Retire of the registered exact attempt. Reader must
not wait for START before accepting RETIRE. Late worker completion cannot resurrect an
attempt or publish a new live session after stopping. No new helper discovers/kills old
processes. Retain all actual worker/write promises; the overall close bound is120s,
native operation30s and retirement10s as reviewed. Stuck I/O/cleanup remains UNRETIRED;
supervisor forced containment is distinct from a positive terminal acknowledgement.

## VERSION and effects boundary

Actual end-to-end path: opt-in launcher receipt -> fixed long-lived bootstrap -> native
parent/Job/asset/root admission -> existing TS bridge canonical VERSION frame -> actual
reader/RetainedProvider.Version -> strict correlated version2 INVOCATION response ->
bridge output/worker/EOF retirement -> runtime holder release. Fixed adb version only;
no server, .android reservation, device, discovery, pairing, SDK download or terms action.
Process/Job/pipes/compiler/temp/capture effects are disclosed, not called zero-write.

The actual factory/bootstrap operationSet is fixed VERSION_ONLY: only VERSION and
cleanup RETIRE frames are admitted. START/HEALTH are rejected before effect handoff.
Reader shared support may remain internally tested, but changing this bootstrap gate
requires separate eligible-host source/execution scope; no configurable caller enum
can enable it. START code remains structurally available but unwired pending that scope. Its existing actual Windows .android absent-only gate is unchanged.
Existing entry refuses without reading/adopting keys; no profile redirect, identity,
token, ACL, credential or environment workaround. Standard runner gate remains UNMET.
HEALTH/RETIRE only use retained attempt; DISCOVER has no protocol operation.

## Coherent implementation/testing batch and stop point

Implement together: optional named-Job launcher/receipt delta, actual main-only fixed
factory, long-lived bootstrap/native admission, canonical C# reader and exact manifest/
inventory additions. No production auto-call. Keep one source batch, not micro-CI loops.

Locally runnable affected tests: current TS bridge through actual factory with injected
spawn/duplex/clock only at OS boundary; canonical request parity; argv/env/asset admission;
fragmentation/correlation, pending START+RETIRE/EOF, parent-loss notification, stalled
writes and retained custody. Derivation/source tests cover native create/assign/receipt/
resume order, existing-name refusal, query handle closure before readiness, fixed rights,
old anonymous route and unchanged historical helper hashes. No model output is native proof.

Actual C# parser/worker logic needs a future reviewed Windows managed-memory-stream test
entry with injected provider/liveness (no ADB/network/profile). Windows compilation and
that managed reader test can be one coherent batch. Native VERSION needs separate exact
runner/asset/parent/cleanup approval; test it once through the real opt-in path. START
requires genuinely eligible absent-profile environment and its own execution disposition.
No publication/CI during current HOLD. Unknown parent/Job/asset/runtime/root, malformed
framing, unretired worker/Job/profile/write => no new effect/no release/no retry. Canonical
P2/device/formal acceptance and P1-06 remain unchanged.

## Exact asset/tooling closure for this source batch

Add `desktop/launch/Invoke-RetainedHost.ps1`,
`desktop/native/RetainedAdbProtocol.cs`, `desktop/native/RetainedHostAdmission.cs`,
and private `desktop/src/main/adb-host-factory.ts` (plus bounded private context helper
if needed). Build a closed private `adb-host-factory.cjs` output for trusted harness
integration, not renderer/preload/demo access. Package the exact fixed bootstrap and
four helper sources (IsolatedAdbServer, RetainedAdbSession, RetainedAdbProtocol,
RetainedHostAdmission), alongside existing PersistenceProcess. Bind their committed
input hashes, exact output inventory and package path/hash schema; no wildcard source
loading or new dependency. Preserve old P110 evidence as historical. Current added
SOURCE/PACKAGE runtime behavior remains NOT_RUN until a separately agreed actual
campaign; source closure alone does not establish packaging/runtime acceptance.


Implementation precision: `-EnableRetainedHost` is an explicit default-false normal-launch
opt-in, unavailable for maintenance/Store/recovery. Factory cleanup alone removes a
host-session root after the reviewed sole clean helper exit path plus actual process/I/O
retirement. Journal inspection accepts only exact bounded bound partitions; RELEASE,
RECOVERY and replacement of the current launch refuse any retained host-session root.
A retired MAIN alone does not authorize deleting unresolved helper state. The old P110
known-retired recovery evidence does not silently extend to this new interrupted-helper
case. The immutable host-parent receipt alone may remain through normal completed-launch
retention without implying a live helper.


Finite wire timing clarification: after native terminal facts and response publication
has begun, a client may receive those bytes before the writer's Flush/final bookkeeping
returns. At most one next VERSION frame may be held without Reserve/effect until prior
workers and output actually settle; it retains the existing30s operation bound. Reader
still observes cleanup/EOF while it waits. Further queued ordinary work is refused.
This is not a second concurrent device/host operation or a weakened retirement check.
The managed fixture explicitly holds Flush after making the response visible, then
proves the next Reserve occurs only after release. Its execution remains NOT_RUN here.


The runtime/helper lease partition is exact: native terminal facts plus actual parent
request-write completion and full correlated response delivery may release the per-attempt
runtime byte holder. Receiving LF does NOT prove remote Flush/thread retirement. After
native Version returns, protocol serialization/Flush/bookkeeping has only fixed result
facts, no authority to touch runtime files or dispatch ADB. That remaining work belongs
to helper/persistence lifetime and must settle before helper cleanup or a new Reserve.
Any next VERSION still requires a fresh matching current runtime holder. No remote-I/O
retirement claim is inferred from the parent receiving bytes.
