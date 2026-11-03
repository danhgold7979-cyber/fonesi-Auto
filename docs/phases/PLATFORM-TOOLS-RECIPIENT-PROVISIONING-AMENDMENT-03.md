# Amendment03 — recipient-provisioned, pinned Platform Tools

Status: ADOPTED / PRIVATE CORE SOURCE ENTRY — 2026-11-01 04:38 UTC.
Coordinator Coder Bin adopted the independently reviewed pre-adoption SHA256
`c08a07ee70752598e01149cc879bac2eea75af8034f04a4e79ac2a4b0d27e4fb`.
Recipient terms acceptance, actual installation/download activation, public issuer/IPC
and server/device authority are not granted by this adoption.

## 1. Narrow change and preserved baseline

The existing P2-01 title says Bundle/pin Platform Tools; architecture §2.4 and
P11-02 describe packaged/offline assets. Preserve those historical texts and task IDs,
but amend only the delivery route: Auto's foundation application remains capable of
its tested offline launch. Optional ADB is obtained by the recipient directly from
Google's exact official archive, or from a recipient-selected matching archive,
then stored in Auto's owned app-local runtime area. Auto does not redistribute,
mirror, proxy or re-export the Google ZIP/extracted binaries under this route.

First ADB setup requires network access unless the recipient already possesses the
exact pinned archive. This is not clean offline installation of an included ADB.
Subsequent use of verified local bytes does not require another download. Missing,
declined or unavailable setup leaves the foundation UI functional and the device
capability explicitly unavailable; it is not a server/device success.

Unchanged: exact version/origin/member hashes, binary-versus-host architecture,
absolute app-local resolution with no PATH/global SDK fallback, tamper refusal,
exclusive staging/promotion, previous verified runtime retention and tested rollback.
P2-01 full acceptance still needs its actual application admission/invocation criteria;
P11 install/upgrade/recovery and physical/server/identity gates remain required.
No canonical denominator, formal acceptance or current task PASS changes.

## 2. Rights and recipient boundary

The [official SDK terms](https://developer.android.com/studio/terms) distinguish
recipient acceptance/entity authority and the SDK grant from third-party open-source
component rights (§2, §3.1, §3.4–3.5). Direct download is not a legal exemption or a
claim that every intended use is licensed. Preserve notices and applicable obligations;
do not assert an exact linked-component license map from strings/import tables.
Existing project-owner authorization cannot accept terms for unrelated recipients.

Before actual recipient provisioning, show the official origin, version, applicable
terms link, preserved NOTICE status and the limited setup action. Record the actual
recipient decision by the trusted installer/native host, never a renderer-invented
boolean, remembered project-owner approval or silent acceptance. Cancel/decline does
not download, adopt existing SDKs or activate anything. An independently established
component-rights route may be recorded accurately; do not fabricate either universal
SDK acceptance or `componentLicensesReviewed:true`/redistribution approval.

If Auto later conveys these binaries itself, full redistribution/component-obligation
review is again required. Signing, export/use-purpose review and release approval are
not supplied by this engineering amendment.

## 3. Exact initial candidate

- Version37.0.1; origin `https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip`.
- ZIP8044989 bytes, SHA256 `45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99`.
- Exact14-file inventory and17529398 expanded bytes already registered in the reviewed
  Platform Tools contract; preserve complete original NOTICE/source.properties.
- Actual binaries are PE32/I386 (`0x14c`), not x64. Existing Windows-x64 bounded
  `adb version` evidence is a separate host-compatibility observation, not a phone,
  installer, server or production-admission certificate.
- Never use the official page's floating latest download link. A new version is a
  new explicit manifest/review/checkpoint, not automatic drift.

The [official release page](https://developer.android.com/tools/releases/platform-tools#downloads)
offers standalone tools; the retained exact candidate inspection and source evidence
remain referenced by the [development checkpoint](../evidence/P2-01-platform-tools-development-2026-11-01.md).
The newer terms page and older repository metadata license text are not byte-identical;
do not label them as the same document.

## 4. Bounded implementation contract — core first, no new public IPC

Implement a main-only recipient provisioner and admission state machine; keep the
existing production capability unavailable until trusted actual setup is composed and
reviewed. This batch does not add a renderer download/command/path API. The actual
native installer/help entry and its terms presentation are a separately exact reviewed
adapter, not an unrestricted callback or hidden auto-install on startup.

The core accepts only a private single-operation grant from that trusted host, bound
to the current owned data-root lease, manifest digest, OFFICIAL_DOWNLOAD or LOCAL_ARCHIVE
route, and actual recipient decision record. A local archive path comes only from the
native picker; renderer text, URL, executable path and arbitrary argv are never inputs.
All effects revalidate the captured owner after awaits and before promotion. One lane,
no queued retry; an active or unretired owned server/operation blocks replacement.

Owned layout is `<data-root>/platform-tools-runtime/`, outside immutable package bytes
and not part of DB-only backups. Exact marker version1/storeId/kindPLATFORM_TOOLS_RUNTIME;
fixed `staging-<UUID>` and `runtime-<archiveSHA256>` children, exact14-file closure,
plus fixed bounded activation/operation records. Existing unmarked, linked, aliased,
unknown or over-budget roots are refused without adoption/removal. No global SDK,
PATH, USB driver, `.android` entry, key or account is read/adopted/modified by setup.

Official fetch permits only the exact HTTPS origin/path with normal certificate
verification, one GET, zero redirects, exact archive-byte bound and a120000ms total
setup deadline (download included); redirects/alternate mirrors/proxy
or TLS overrides are not inferred permissions. Local input is copied through bounded
single-link ordinary-file custody to exclusive owned staging. Both routes verify the
same complete archive/member/CRC/path/PE/hash grammar before candidate use. No
executable runs during download/extraction/admission; an optional version-only check
requires its already separately reviewed literal invocation boundary.

Promotion is same-volume exclusive directory publication, with no-clobber destination;
a matching existing runtime must independently pass the complete physical verifier.
Activation uses the exact append-only intent/settlement protocol in §6, not a mutable
pointer or delete-then-write replacement. No SQL/filesystem atomicity is claimed.
Prior verified bytes remain until explicit bounded retention policy is
reviewed. Interrupted/ambiguous staging or activation is retained and capability remains
unavailable; reopening revalidates records and bytes rather than treating planned intent
as completed work. Unknown files are never recursively cleaned.

Read outcomes distinguish NOT_PROVISIONED, TERMS_DECLINED, SETUP_IN_PROGRESS,
VERIFIED_LOCAL, SETUP_FAILED and RECOVERY_REQUIRED; BINARY_UNAVAILABLE remains the
external capability until actual admitted runtime composition. A verified binary is
not permission to start a server or address a phone. Setup never runs start-server,
kill-server, devices, pairing, shell, install, forwarding or device input.

## 5. Required evidence and next entry decision

Pure/owned-file tests must exercise exact candidate and negative archive cases,
recipient decline/no effect, ownership loss at each final boundary, failed copy/sync,
promotion collision, stale setup revision, interrupted activation, old-version retention,
PATH shadowing and immutable package overlap refusal. Real owned byte tests are not
Windows atomicity proof. The later scoped hosted run must test the actual trusted
setup adapter and activation/reopen on the exact candidate without real devices or
existing keys. Existing server `.android` refusal remains UNMET and is not bypassed.

This proposal removes an unnecessary requirement to redistribute Google bytes for
internal progress; it does not declare legal clearance or silently alter release
claims. Coordinator adoption and review of the exact §6 protocol precede source
entry. Ordinary phase/branch autonomy remains as already delegated by the user.

## 6. Exact core records and activation protocol (candidate for source entry)

Use an append-only activation ledger, **not** a mutable pointer or delete/replace
operation. This section replaces the unspecified atomic-pointer option in §4. A
partial record is a refusal, never an implicitly committed activation. No filesystem
atomicity across multiple files is asserted.

The exact root children are `.platform-tools-owner.json`, `operations`, `runtimes`
and `staging`. Marker keys are `{version:1,storeId,kind:'PLATFORM_TOOLS_RUNTIME'}`;
all directories are plain canonical descendants under the currently held data-root
lease, outside the immutable application tree. Each operation has one private UUID,
and a single current in-process lane; all caller grants are opaque and revoked on
close/lease loss. No arbitrary directory/filename/URL is accepted by the core.

Bounds: at most128 operation pairs (256 ordinary files, each4096 UTF-8 bytes), at most
4 verified runtime directories, one active staging directory plus at most4 retained
completed or failed staging directories. The aggregate limit is128MiB across all archive, staged, extracted and record bytes;
each archive remains the exact8044989 bytes and each extracted candidate the exact
14-file17529398-byte inventory. All enumeration checks stop at the first limit+1
sentinel. Unknown entries, symlinks/reparse points, multiple links, case/ADS/reserved
Windows aliases, partial records or over-budget layouts produce RECOVERY_REQUIRED
without deletion. No background pruning is in this increment.

An operation filename is `operation-<canonical UUID>.intent.json` or
`operation-<same UUID>.settled.json`. JSON is exact canonical UTF-8 with no trailing
newline/duplicate keys; integers are safe nonnegative, not -0. Intent fields, in this
order, are:

`{version:1,storeId,operationId,revision,previousSettlementSha256,kind,route,
manifestSha256,archiveSha256,previousActiveSha256,recipientDecisionId}`.

- revision is1..128, exactly previous+1; first previousSettlementSha256 is the exact
  owner-marker byte SHA256, later ones hash the prior settled bytes.
- kind is INSTALL or ROLLBACK. route is OFFICIAL_DOWNLOAD, LOCAL_ARCHIVE or
  RETAINED_RUNTIME (only ROLLBACK). No raw selected path is recorded.
- manifestSha256/archiveSha256 must identify a manifest explicitly accepted by the
  current application build. The core candidate allowlist initially contains only the exact
  reviewed37.0.1 candidate; a test-only second manifest never enters production.
- previousActiveSha256 is the last committed active digest or null.
- recipientDecisionId is an opaque UUID bound to the actual trusted recipient grant;
  it is not permission proof by itself and cannot be supplied by public IPC.

Settled fields, in this order, are:
`{version:1,storeId,operationId,revision,intentSha256,outcome,activeSha256,
previousActiveSha256}`.
Outcome is ACTIVATED or NOT_ACTIVATED. ACTIVATED selects the verified intended
candidate (or prior retained candidate for ROLLBACK), and previousActiveSha256 records
the former active candidate; NOT_ACTIVATED preserves both prior values. Every ID,
revision and hash must match the exact intent/chain. Duplicate revisions, forks,
unsettled earlier intents, gaps or mismatched root IDs refuse admission. An intact
latest settled record plus full runtime verification defines the current active
runtime; directory existence or a planned intent alone never does.

Install sequence under one lane/lease:
1. Validate recipient grant, exact owner/layout, complete prior chain, idle/unretired
   server boundary, expected revision and all budgets. Allocate operation UUID once.
2. Exclusively write/sync/close/readback the immutable intent before download or any
   candidate file creation. If that write is uncertain, return OUTCOME_UNKNOWN and
   preserve; do not start a second operation.
3. Exclusively stage the exact downloaded or selected archive, validate all bytes,
   extract through the existing bounded closed grammar, sync/readback and physical
   verify all files. No executable launch is part of this phase.
4. Revalidate owner and intent/chain. Publish to the exact digest runtime directory
   via exclusive directory creation and exclusive per-file copy/sync/readback on the
   same volume; verify all actual published bytes before settlement. This is not atomic
   directory promotion: partial publication remains unsettled and refused.
   A preexisting exact directory can be reused only after full verification, never
   merged or overwritten. Do not remove the prior active directory.
5. Revalidate owner, current chain and actual candidate immediately before exclusive
   settled-record creation. Write/sync/close/readback exactly ACTIVATED. Only after
   this confirmed record and a final owner fence may the core return VERIFIED_LOCAL.

A failed fetch/validation with known retired local work may write NOT_ACTIVATED if
its intent/owner/chain are intact. Ambiguous file/record completion, lost ownership,
unknown active participant or interrupted promotion returns OUTCOME_UNKNOWN and
blocks new grants; original bytes and records stay intact. Reopening can admit a
complete exact settled chain after physical verification, but an unfinished or
partial latest operation remains RECOVERY_REQUIRED. No automatic abandonment,
lock-stealing or removal recovery is invented. A later explicit recovery procedure
requires an exact additional contract, not a heuristic that a free lane proves
retirement. Existing known-retired launcher recovery does not repair malformed
provisioning records.

ROLLBACK uses the same new intent/settled protocol and final owner fence, selecting
only a retained prior digest whose manifest is still explicitly allowed and whose
full physical inventory/hash verifies. It does not rewrite history, delete the newer
runtime, downgrade to a globally found binary or run a server. A missing/tampered
prior version refuses rollback truthfully. Capacity exhaustion is LIMIT_EXCEEDED,
not permission to remove retained evidence.

Core result codes are fixed: INVALID_REQUEST, TERMS_REQUIRED, TERMS_DECLINED,
OWNER_REVOKED, BUSY, STALE_REVISION, LIMIT_EXCEEDED, ARCHIVE_REJECTED,
DOWNLOAD_FAILED, STORAGE_FAILED, OUTCOME_UNKNOWN, RECOVERY_REQUIRED. Successful
output contains only revision, admitted manifest/archive digest and status; private
absolute runtime resolution is a distinct main-only capability method that rechecks
owner/chain/full files immediately before any separately authorized invocation.
No result exposes recipient-selected paths or claims redistribution clearance.

The core uses a delivery-specific private candidate record: exact manifest/archive
hashes and `deliveryMode:'RECIPIENT_PROVISIONED'`, with component mapping/redistribution
status still explicitly pending. It must not manufacture an accepted existing
`PlatformToolsManifest` license map or set any reviewed-license flag to true merely
to reuse an API. Physical byte verification is independent of rights/runtime admission;
`PRODUCTION_PLATFORM_TOOLS` remains null in this core-first batch.

The first source batch may implement this core plus actual owned-file tests only.
Production public setup entry, recipient terms UI and real download/activation host
execution remain disabled until their exact adapter/runner is reviewed. This is a
bounded sequencing boundary, not a claim that source tests complete P2-01.


Implementation clarification under the adopted no-clobber grant: successful staging
is retained too (not mislabeled failed-only), within the same fixed five-directory and
128MiB limits; no cleanup/pruning authority is added. Reinstalling the already active
exact candidate revalidates it and returns the same revision without another intent or
download. Close aborts the private download signal and waits up to120000ms for actual
work settlement. An uncooperative operation returns UNRETIRED, latches uncertainty and
retains its active promise; the owning host must retain its lease/resources, never
interpret that bounded return as termination. No production host adapter is wired.
