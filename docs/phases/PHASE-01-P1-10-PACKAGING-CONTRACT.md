# P1-10 — internal Windows package and launch recovery

**SOURCE ENTRY APPROVED — 2026-10-31 15:55 UTC.**
Coordinator approved independently CLEAR pre-entry SHA256
`014e5ebef5449543c911deb1fc4be986ff731face6d7f947fddb06d3d666e4a6`.
Exact hosted runner/schema/source execution review remains pending; no task acceptance.
Implements [canonical P1-10](PHASE-01-desktop-foundation.md#p1-10--ci-and-packaging-smoke)
and the explicit P1-07/P1-08 retained-lease/RESTORED-launcher obligations. P1-09 passed
its bounded scope; P1-06 cross-user remains UNMET, formal Phase0/Phase1 gates remain.
Software-first development does not waive those gates. No identity retry, installer,
signing, public distribution, deployment, device service or future-phase implementation.

## 1. One usable offline internal bundle

Build a fresh exclusive production package directory and ZIP with no overwrite:

- `Launch.ps1`: fixed trusted entry with no arbitrary executable/script argument.
- `runtime/electron/`: complete exact verified pinned Electron45.1.0 Windows x64
  distribution, retaining official electron.exe basename, version and all licenses/notices.
- `runtime/node/node.exe` and `runtime/node/LICENSE`: pinned Node24.22.1 executable
  (existing reviewed Windows SHA256) plus exact official tagged license bytes.
- `app/build/`: exact production build output inventory, never demo/fixtures/probes.
- `app/launch/`, `app/native/`, `app/scripts/`: explicitly enumerated minimal trusted
  launcher/initializer/control/native helper/package-verifier closure, not whole source
  directories or development node_modules. Bundle all required local helpers explicitly.
- `provenance/`: fixed source SHA/tree, reviewed lock/dependency metadata digests,
  runtime inventory/provenance and production build-input/output hash records.
- canonical `package-manifest.json` and concise offline-use/recovery README.

No npm, PATH Node, ELECTRON_RUN_AS_NODE, runtime download at application launch, source
checkout or development dependency is required to launch this internal bundle. Packaging
may copy the already verified hosted Node binary. Its license must match the exact
[official Node24.22.1 tag](https://github.com/nodejs/node/blob/v24.22.1/LICENSE), with a
reviewed checked-in digest; use installed matching bytes or an explicitly fixed tagged
build-time fetch. Missing/unverified license fails packaging, never a placeholder.
Electron and third-party notices remain complete. This adds no npm dependency.

The closed canonical package manifest has exact version1/modeINTERNAL_PRODUCTION,
sourceHead/sourceTree, fixed runtime versions, fixed entry `Launch.ps1`, and a sorted
relative-file list `{path,bytes,sha256}`. Reject duplicates, unknown/absolute/dot-traversal
paths, links/reparse entries, wrong case aliases, absent/extra files, hash/size mismatch.
Manifest excludes itself from file hashing; detached package SHA256 binds the final ZIP.
Packaging-only proposed bounds:512 files, depth16, aggregate640MiB, app outputs8MiB;
account for the combined Node/Electron/app inventory explicitly, without reusing or
silently widening a256-entry owned-runtime helper limit. No increase to existing
native profile/capture/process cleanup bounds. Staging is exclusively reserved; only
complete validated inventory can be atomically promoted under a new unique name.
Failure preserves private staging or safely removes only its positively owned files;
never emits a successful package marker or overwrites the last verified package.

Source development retains current verifyBuild/current-input checks. Packaged launch
uses a separate strict closed-payload verifier anchored to its own fixed manifest and
local binaries, not a permissive fallback when source validation fails. Both entry modes
must be explicit in trusted launcher code and tested; no renderer switch. Hash metadata
is build provenance/integrity, not signing or authenticity against a hostile local editor.
Runtime certification/current versions/provider/key proof checks remain unchanged.
Product roots, backup locations and profiles are outside the package; launcher refuses
creating/adopting a product root inside its package/runtime tree.

## 2. Launcher-wide exclusion and known-retired failure recovery

Preserve current `-CreateUnder` and `-Root` normal/maintenance semantics. Add one explicit
`-RecoverRetainedLaunch <canonical launch UUID>` option for an existing owned root, not
a generic unlock command. Recovery does not mean orderly application success.

Every participating normal/maintenance/recovery supervisor holds one persistent regular
`.launcher-guard` file with exclusive OS sharing denial for the entire operation, across
all native/control processes and lease release. Validate canonical parent/marker and
nonlink regular guard; never delete/recreate it to bypass another holder. Contention
fails before store mutation. Guard release alone is NOT retirement evidence.

Before acquiring the writer lease, persist exact intended store/owner/launch identity,
then record successful acquisition; never first acquire and only afterward invent the
identity record. Bounded setup/control Jobs also have intent/settlement records. An
explicit no-native-admitted setup failure is recoverable only with complete setup Job
retirement and the matching planned/acquired owner state; missing settlement remains
blocked. Before each native launch, exclusively write/fsync a canonical intent bound to root,
parent token, storeId, launch UUID, current writer ownerToken, fixed stage, executable
hash and exact supported entry/mode. After the real owned Job reports complete retirement
with untruncated capture, write/fsync a corresponding immutable retirement receipt with
fixed status/exit and capture digest. Receipt may honestly describe NONZERO_EXIT; it
cannot describe unknown/timeout/capture-failed ownership as retired. Missing, duplicate,
malformed, mismatched or unfinished latest intent refuses recovery unchanged. No PID,
age, free guard, user acknowledgment or missing lock is inferred proof of death.

Explicit recovery under the exclusive guard accepts only exact prior intent/receipt/
capture and retained lease token/store/root bindings. It preserves original evidence and
all DB/WAL/SHM/vault/profile/backup bytes. It retires the known settled old lease using a
sync/readback recovery receipt before removal; an interrupted removal/empty-lock state
is resumable only with that exact prior receipt, never by guessing an owner. Reject
unknown extra lock entries and mismatched tokens before any mutation. Next launch obtains
a fresh ownerToken. Existing log-store recovery may be invoked only with this same proven
whole-native-tree retirement and exact log ownership; do not blindly delete log locks.

This closes failed normal main → observed complete retirement → explicit recovery →
normal reopen or explicit restore-to-new. A supervisor crash or missing retirement proof
remains safely blocked; this is not universal stale-lock recovery. Recovery itself never
opens invalid active SQLite, repairs rows, resets keys, clears quarantine or starts work.
After handoff, unchanged normal validation still rejects corruption; restore-only uses
the existing authenticated selected-backup route. No new public IPC or native literal.

## 3. RESTORED-root launcher usability

Add a distinct existing-store parameter set `-Store <absolute data-child path>`; its
parent must carry the existing canonical `.owner`, and its exact `data-<...>` child,
root provenance and restore receipt must match existing persistence contracts. No
recursive search, automatic first-directory selection or FRESH relabeling. Existing
`-Root` continues to mean documented FRESH/data-main layout.

RESTORED entry requires an explicit existing maintenance literal (normal UI refuses),
no first-use provisioning, and existing retained Local State/checkpoint, runtime/key
proof and original-backup authentication. Prepare READY against that exact selected
child. Keep SQL/external quarantine and automatic admission OFF; no timers, jobs, vault
initialization or secret rebinding. Explicit restore-to-new may recover a malformed
RESTORED active DB without opening it, producing another new quarantined root. Read/list,
backup/upgrade operations keep their existing validation rules; no new repair mode.
Expose the actual created restore-root path only in local trusted native guidance/private
owned launch evidence, not public CI artifacts. Cancel preserves all source roots.

## 4. CI, usable-package tests and evidence

Keep existing source/type/lint/unit/integration and automatic settings/UI jobs. Add one
bounded exact-package job after successful prerequisite checks, no identity invocation.
Fresh checkout uses existing pinned scripts-disabled restore and review/license gates.
Build/package manifest records actual sourceHead/tree; use local bundled Node/runtime
for smoke from a relocated extracted directory without source/node_modules/PATH Node.
Normal interactive UI has no lifetime kill; test supervision remains120s/10s retirement.

One coherent synthetic native matrix:
1. Real packaged trusted launcher create/cancel/create-confirm → orderly close → reopen,
   actual six-tab empty production, settings persistence, no demo canary or activated
   automation; whole owned-process retirement and external data-root isolation.
2. Deliberate malformed CURRENT failed normal startup → retained exact lease/retirement
   receipt → explicit recovery → real restore-only Cancel/Confirm → new quarantined root.
   Original DB/WAL/SHM/vault bytes preserved; genuine selected old backup authentication.
3. Launch the produced RESTORED root through the actual `-Store` maintenance route,
   cancel and authenticated second restore; normal entry refuses, no jobs/timer enabled.
4. Live guard contention, unknown/incomplete retirement, wrong root/owner/capture digest,
   extra lock entries and interrupted-release receipt negatives reject unchanged.
5. Owned package copies with missing executable/license, changed payload/manifest,
   mismatched reviewed lock, injected failing test, failed copy/promotion and fixture
   leakage cannot emit a promotable package/report. Preserve original package bytes.

If native dialogs/quit require automation, use the existing exact-hash derived-copy
observer pattern: finite audited substitutions, real launcher/control/main/SQLite/key
provider, no production flags or spoofed user identity. Clearly label injected answers
not genuine human clicks. Final exact schema, fixed screenshots, wrapper substitutions,
artifact allowlist and native helper changes require independent source review before
hosted execution. Only complete successful package/provenance and fixed sanitized report
are publishable; private roots/captures/key material are never artifacts. No auto-deploy.

## 5. Acceptance, rollback and remaining gates

Canonical P1-10 technical disposition requires actual exact-head Windows fresh-package
launch/relaunch, full negative gating, and both recorded launcher usability obligations.
Linux/component tests alone do not pass it. Packaging can be disabled and last verified
internal bundle retained; no executable downgrade is claimed as a database rollback.
P1-06 UNMET and physical/hardware/formal acceptance remain explicit; Phase1 is not formally
accepted or merged merely because ten independent technical task scopes might pass.

## 6. Exact pre-entry clarifications

### Shared guard, journal and replay rules

The guard is `<parent>/.launcher-guard`, where parent is `-Root` itself or the direct
parent of `-Store`; both therefore serialize the same physical owned parent, including
recovery. No per-spelling/per-command alternate guard. Canonical path checks and existing
parent `.owner` binding precede opening it. Legacy launch directories/captures without
this journal are explicitly non-recoverable by the new option; do not synthesize records.

All journal JSON is canonical UTF-8, exact keys, duplicate-free, ≤64KiB; UUIDs canonical,
digests lowercase64hex, paths exact admitted canonical values. Fixed metadata:
- `launch-journal.json`: `{version:1,launchId,parentToken,storeId,ownerToken,dataRoot,
  entryMode,maintenance,executableSha256}`; entryMode SOURCE|PACKAGE, maintenance NORMAL
  or an existing five literal. Written before acquisition; immutable thereafter.
- Parent `.launcher-current.json`: `{version:1,launchId,ownerToken,storeId,dataRoot}`.
  Exclusive initial write or sync/readback atomic replacement under guard. It must match
  the retained lock and selected launch. An uncertain replacement blocks; no older pointer
  is searched or adopted. Historical launch evidence is never deleted by recovery. Replacement is allowed only
  after the prior exact journal proves completed RELEASE (or completed explicit recovery
  handoff), with no remaining owned writer lock. A free guard is insufficient: a normal
  retry or another -Store child must refuse without replacing a failed/pending pointer.
  The selected policy is one parent-wide pointer, not competing per-store pointers;
  recover the prior known launch before opening another child under that parent.
- `intent-NN.json`: `{version:1,launchId,ownerToken,sequence,stage,previousSettlementSha256}`.
- `settled-NN.json`: `{version:1,launchId,ownerToken,sequence,stage,intentSha256,
  captureSha256,status,exitCode,cleanupComplete,stdoutTruncated,stderrTruncated}`.
  Status/exit use the existing supervisor schema, booleans literal. Only complete,
  untruncated retired outcomes qualify; no wrapper assertion substitutes for capture.
- `lease-acquired.json`: `{version:1,launchId,ownerToken,storeId,dataRoot,lockOwnerSha256}`,
  written only after exact owned lock readback. A planned UUID alone is not acquisition.
- `lease-recovery.json`: `{version:1,launchId,ownerToken,storeId,dataRoot,
  retiredSettlementSha256,lockOwnerSha256,state:"RELEASE_AUTHORIZED"}`. Written/synced/
  read back only after all recovery admission checks and exact existing owner validation.
  It authorizes only that old lease removal, not DB success or normal startup.

Stages are fixed SETUP, PREPARE_PROVISION, PROVISION, OBSERVE_PROVISION,
PREPARE_AUTH, AUTH, OBSERVE_AUTH, PREPARE_READY,
MAIN, RELEASE, RECOVERY; optional provision omitted only for an authenticated existing
store, cancellation terminates before AUTH/MAIN. Maximum16 intents/settlements per launch,
strict contiguous positive sequence and previous-settlement hash chain. For sequence1,
previousSettlementSha256 is the SHA256 of exact immutable launch-journal.json bytes;
for sequenceN>1 it is the SHA256 of exact settled-(N-1).json bytes (never null/sentinel).
Enumerate only
fixed journal/control/capture names under existing bounded launch inventory. No duplicate
or pending higher sequence may be ignored. Every control that may acquire/change/release
ownership is journaled, not only native Electron. Recovery checks the latest sequence;
an older successful main receipt never bypasses a newer unfinished operation.

An empty lock after interrupted acquisition without a verified `lease-acquired.json`
is **not recoverable**, even with planned UUID and a retired setup process. An owner file
matching the intended UUID but missing acquisition receipt may only be recognized after
an explicit completed setup settlement plus exact unchanged owner verification under the
guard; write the attributable acquisition record before any recovery action. Empty-lock
resume is limited to an existing exact RELEASE_AUTHORIZED receipt for a previously
verified owner and a completed retired recovery-control settlement. Missing control
settlement remains blocked even if the lock is empty. These refusals deliberately leave
unknown supervisor-crash cases for later authorized recovery, not silent lock stealing.

### Explicit source/package closure and path grammar

Source `Invoke-Desktop.ps1` selects SOURCE explicitly; new package `Launch.ps1` delegates
only to fixed `app/launch/Invoke-Package.ps1`, which selects PACKAGE explicitly. Shared
`app/launch/launch-core.ps1` implements lifecycle; private control invocation carries only
that fixed SOURCE|PACKAGE enum. Neither mode auto-falls back on failed verification.
Source mode retains current build/dependency/runtime verification; package mode verifies
its closed payload with `app/launch/package-admission.cjs` before compiled helper loads.

The minimal packaged local closure is exactly: Invoke-Package.ps1, launch-core.ps1,
persistence-initialize.cjs, persistence-launch-control.cjs, launch-journal.cjs,
package-admission.cjs, native/PersistenceProcess.cs and all exact production build outputs.
Package-admission/journal use only Node standard modules; no copied verification probes,
source-oriented build-manifest dependency, npm tree or fixtures. New scripts enter source
lint/type/hash/test inventory. Fixed top-level Launch.ps1 and README complete user entry.
If implementation needs another local helper, enumerate it explicitly in the reviewed
manifest/tested dependency closure, never dynamic directory inclusion.

Manifest paths use forward slash relative segments, ASCII `[A-Za-z0-9._-]+` only,
no empty/dot/dotdot segment, colon/ADS, separator alias, trailing dot/space, DOS reserved
basename (CON/PRN/AUX/NUL/COM1–9/LPT1–9 including extensions), or case-fold collision.
No drive/UNC/rooted paths in manifest. Actual filesystem entries must match exact case
and regular-file/directory types; canonical package ancestors have no reparse components.
User data selections retain existing canonical absolute drive/UNC policy, not manifest
path grammar, and cannot overlap package runtime/payload trees.

Bundled renderer license closure also includes `licenses/react-LICENSE`,
`licenses/react-dom-LICENSE` and `licenses/scheduler-LICENSE`, copied from each exact
pinned installed package after dependency verification. All three currently have SHA256
`da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93`;
retain each named copy and the existing bundle notices. Missing or changed bytes block
package promotion, as do missing Electron/Chromium and Node notices. No license is
substituted with a newly authored summary.

## 7. Implementation boundary clarifications (2026-10-31)

The private SOURCE READY envelope remains version2. PACKAGE uses version3 with an exact
packageRoot bound to the verified launcher, actual packaged main-module directory and
certified packaged Electron executable. The same package exclusion is enforced before
product-root, backup-location or restore-destination creation: equal, ancestor and
descendant overlap are rejected under existing canonical-directory checks. No public
IPC, renderer authority or permissive source fallback is introduced.

A main log writer is acquired with the already admitted unique persistence owner token.
The journal-bound pre-main log proof records the exact log-root identity and absence of
an existing writer. Recovery requires the selected MAIN's complete retired settlement,
that proof and the retained writer's exact matching owner token, not merely a free parent
guard or the same log store. An unrelated, legacy or otherwise unattributable writer
remains refused. Actual Windows failed-main recovery must demonstrate the supported
path; synthetic settlement fixtures alone do not close that criterion.

Journal enumeration uses disjoint bounded partitions: at most256 top-level control and
journal entries, and each of the three exact provision/auth/main profiles retains the
existing256-entry, depth16,8MiB limit. This is not an aggregate256-entry claim across all
three profiles. No native process, capture or profile-helper cap is widened; retained
journal/profile evidence is not silently pruned to fit a bound.
