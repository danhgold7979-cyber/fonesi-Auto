# P7 runtime observation — adopted finite source entry

**ADOPTED 2026-11-02 15:06 UTC.** Coordinator adopted independently reviewed A.1 observation-only scope at draft SHA256 `dc094e5728eaf6e07b1ccbe905832b9a10797ad76109ca0ff74da96c7ff9d7c8`, with stricter helper-compatible refinement `c1f4fa970e37d5bdfb2e6d3c61a2197e55cdacbab890788976a03212657f1942`. Earlier broader A/B/C sections remain proposed context only. No production tuple admission, bridge or ledger credit.

# Proposed next Phase07 functional integration entry (not adopted)

Base: phase-07 0cdf8cfbb84c035e3b078794c839e6e5a19dab15; 6/47 software cells,
0/13 acceptance. Preserve that fixed ledger. No new source authority from this draft.

## Decision: runtime-backed V9 draft editing and advisory, then durable schedule

Use a cohesive read-only preview/editor integration first, not a second schedule
engine or invented persistent ScheduleProfile. Existing CalendarPage is routed
in ui-shell.tsx and honestly marks save/reschedule unavailable. Existing actual
civil→zone→gap path provides domain behavior; all Electron runtimes are currently
explicitly refused. Existing persistence is FoundationDatabase/node:sqlite with
exact schema migration/backup manifests and SettingsStore-style admission, not a
generic SQL bridge. Phase5 principal/target and Phase6 immutable content/workflow
bindings are absent here. Consequently a complete durable ScheduleProfile cannot
be claimed merely by saving caller UUIDs or JSON.

### A. Runtime evidence prerequisite (source harness first)

Add finite static control/result contracts and an owned packaged-runtime timezone
observation harness with fixed public synthetic corpus, no user inputs/secrets,
paths beyond its owned output, devices, accounts or social effects. Observe exact
Electron/Node/V8/ICU/CLDR/tz/unicode tuple, actual pinned Temporal/JSBI attribution,
expected civil/UTC/offset/gap/fold cases including HCM/NY/Lord Howe and host-TZ
independence. Capture expected-vs-observed facts; harness must never auto-admit a
new tuple or replace expected fixtures. Existing Node admission remains unchanged.

Actual Windows packaged execution is a separately reviewed source/package-only
CI operation under coordinator authority, not use of the user's host or devices.
No run while runtime/package review is pending. Result artifacts contain fixed
public fixtures only. After successful independent review, separately record exact
supported Electron tuple and runtime-kind witness in resolver; unexpected tuple,
ICU overrides/data differences, unavailable Intl or library hash mismatch refuse.
No unrestricted Electron acceptance and no bundled fabricated timezone witness.

### B. Actual typed preview composition and V9 editing

With admitted runtime evidence, add bounded read-only main service→typed bridge→
sandboxed preload→renderer client, following actual view-session admission and
closed graph. Main calls actual evaluator once with descriptor-safe bounded draft
and scope; renderer never imports node/Temporal, supplies UTC, selects a callback,
accesses a path or creates jobs. Scope remains attribution only. Since account
registries are not live, do not invent a real account identity; exact handling of
unbound draft context must be separately resolved in API entry before source.

Use only approved V9 schedule controls, full reference review and same-viewport
Dark/Light evidence. Retain explicit slot IDs/times through reorder/count changes,
require acknowledged removals, no invented times; show original intent, UTC/offset,
skipped gap notification, warning pairs, window and incomplete coverage. Disable
only preview on failure and visibly state unavailable; valid sub30 times stay
editable, never auto-shift/reject/cancel. Version every draft request locally;
stale responses, navigation/selection changes, cancel and repeated edits cannot
replace newer drafts. No save/reschedule/undo/job/dispatch success claim.

Product/capability posting maximum remains unresolved. The1440 civil minute-domain
ceiling and4096 preview bound are representation/resource limits, not an approved
product maximum. Keep full P7-03.B N until product admission exists; partial editor
work receives no fractional credit. P7-04.B credit only if complete named visible
warning/disable behavior including actual save/drag/undo semantics required by its
entry is proven; otherwise remain N honestly. No UI screenshot alone earns a cell.

Tests: actual admitted runtime corpus; closed bridge/session/hostile input and
unavailable refusal; main→real resolver composition; stale/late response and
navigation tests; preserved drafts across preview errors; 29/30 boundary and
truncation/gap display; exact graph/quality/type/build/test suite; V9 screenshots
from authorized owned environment. No physical claims.

### C. Durable schedule entry after bindings exist

Before migration, explicitly design ScheduleProfile binding to real device,
verified account/principal/target, immutable content and workflow revisions;
complete-row override single occurrence path; revision+CAS edits; never mutate
consumed/running/unknown occurrence history. Extend existing FoundationDatabase
and its exact migration/backup manifest rather than sidecar DB or ad-hoc SQL.
Owned root/admission only, audit-before/after policy, write-failure uncertainty
hold, safe restore as a new revision, data-version mismatch future-generation
freeze, and backup restore dispatch quarantine. Tests must use actual SQLite with
transaction failures, locks/full-disk simulation, stale CAS, reopen/crash and
historical rows preservation. Windows key/backup prerequisites remain real gates.
No migration number guessed now: allocate against integrated phase branch schema
at source-entry freeze. P7-01.C/D and02.C/D remain N until complete behavior and
actual integration are established.

## Immediate safe next action / stopping condition

Review A's finite harness contract and inspect exact available packaging/CI
runtime. Then implement harness only if adopted; await measured runtime result and
review before widening resolver admission. In parallel document B's precise V9
control mapping and unresolved draft-context admission, but do not invent it or
start a privileged bridge. Existing six cells remain unchanged until real evidence.

## A.1 Exact finite observation source-entry contract for adoption

This subsection supersedes A's broad sketch only for the first **observation**
implementation. It does NOT admit Electron to production resolver or authorize B.
Start base0cdf8cf; source-only work on phase-07. After independent source review,
coordinator may publish and explicitly dispatch the dedicated hosted Windows job.

### Exact files and boundaries

New files:
- `desktop/verification/schedule-runtime-observer.cjs`: dedicated packaged main
  entry, no application imports and no BrowserWindow/webContents/session creation.
- `desktop/verification/schedule-runtime-contract.cjs`: closed observation/result
  validators and fixed formatter cases, pure except caller-supplied plain facts.
- `desktop/verification/schedule-runtime-control.cjs`: Node-only staging/readback
  verifier; bounded plain-file inventory, exact source/runtime/package attestation.
- `desktop/verification/Invoke-ScheduleRuntime.ps1`: owned launcher and cleanup.
- `desktop/verification/schedule-runtime-contract.test.cjs`: synthetic validation,
  staging/refusal, unchanged-source and fixed artifact-field tests.
- `.github/workflows/phase-07-scheduler.yml`: dedicated manual observation job plus
  standard source checks. No modification of Phase03/04 workflows.

Existing files may change only exact test inventory/quality finite limits and
corresponding boundary tests to register these files. Add notice/provenance paths
only if demanded by reused runtime package inventory. Do not touch product main,
preload, renderer, persistence, zone admission or product package launch manifests.
Observer packaging is a separate verification package, never a release artifact.

Reuse reviewed `desktop/verification/install-electron.mjs` (pinned45.1.0 plus
bundled official checksum verification) after exact installed dependency/source
build checks; do not run generic npm lifecycle hooks or add dependency versions.
Reuse `WindowsBoundary.psm1`, `OwnedFiles.psm1` and the existing byte-pinned
`tools/phase-00/HostProbeNative.cs` process Job boundary, not production retained
runtime custody. Source helper hash remains existing approved value; no new host
service, machine setting, native helper code or expanded command-switch allowlist.

### Package custody, launch and retirement

Owned root: fresh run directory allocated through existing owned-directory helper
under `desktop/.schedule-runtime`; reject links/reparse points, preexisting run
name, wrong marker/token, path aliases and inventory overflow. Reserve marker
before staging. Copy reviewed Electron dist into `<run>/package` with per-file
size/SHA256 equality before/after and closed relative inventory (max256 runtime entries,
max depth8, max total512MiB, max individual512MiB). Reject unsafe names/links and
extra files. Hash exact executable plus full canonical copied inventory digest.
The package has exact `resources/app/package.json` pointing only to the observer;
copy exact observer/contract bytes, no production app payload. Generated control
is fixed-version with run token, expected source HEAD/tree and source-file hashes;
no arbitrary executable, script, output path, zone or fixture accepted.

Before ready, observer sets Electron userData/sessionData/logs/crashDumps to named
subdirectories under its owned sibling `<run>/profile`, never user's real profile.
No command-line switches or dynamic paths from renderer/user. Parent starts only
absolute `<run>/package/electron.exe` with **zero arguments**, through
`Invoke-OwnedChild`,30,000ms process deadline,10,000ms drain,32,768-byte capture
limits. Observer local deadline5,000ms and synchronous bounded formatter work;
`app.exit` after single output. No BrowserWindow, fetch, sockets, navigation,
credentials, vault, SQLite, ADB, device helper, default application or production
entry. Framework-internal behavior is not falsely asserted absent; package is
used only for tuple/Intl observation and never calls application network APIs.

Parent demands exit0, exact one JSON stdout line at most16,384 UTF-8 bytes,
nontruncated capture and **confirmed whole Job retirement** before success or
cleanup. stderr is retained privately only as bounded process capture and never
published; no raw stack/path/environment in public output. Any malformed result,
extra stdout, timeout, nonzero exit, capture error or uncertain retirement is FAIL,
not a tuple. Uncertain retirement leaves owned run preserved with fixed diagnostic
and prevents rerun/cleanup until actual retirement resolved. Cleanup only through
owned helper after confirmation. Source and copied executable inventories are
rehashed after process retirement to detect mutation. Profile files are not part
of public artifact, and never treated as code provenance.

### Exact closed observation JSON and public artifact

Observer success is exactly:
```
{version:1,kind:'SCHEDULE_RUNTIME_OBSERVATION',
 platform:'win32',arch:'x64',
 versions:{electron,node,v8,icu,cldr,tz,unicode},
 overrideAbsent:true,
 cases:[{id,requestedZone,resolvedZone,parts:[{type,value}]}]}
```
All version strings nonempty printable ASCII max64; case IDs/order and zone fields
must equal fixed source fixtures; parts have bounded lengths and only requested
Intl year/month/day/hour/minute/timeZoneName part types (filter literal parts),
no arbitrary locale text. Use timeZoneName shortOffset; retain exact part order. Fixed
formatter locale `en-US-u-ca-gregory-nu-latn`, hourCycle h23, all component options
explicit. Exact UTC sample epochs and zones: HCM and Asia/Saigon alias at
2024-01-01T00:00Z; NY at2024-03-10T06:59Z/07:00Z and2024-11-03T05:30Z/06:30Z;
Lord Howe at2024-10-05T15:29Z/15:30Z. Eight fixed observations, no discovered-zone
inventory or host-local timezone. Capturing formatter facts is not accepting them
as product expected results. Observer failure emits only fixed failure marker and
nonzero exit, never partially successful observation. Refuse any case-insensitive
Electron override or NODE_OPTIONS/NODE_PATH/ESBUILD_BINARY_PATH/NODE_ICU_DATA/
ICU_DATA input, execArgv, unknown argv or absent mandatory actual version field.

Node control validates output again using strict canonical JSON readback
(JSON.stringify(parsed) equals the sole raw line, excluding LF), rejects unknown/duplicate JSON keys,
unsafe numbers, nested depth>8, noncanonical or duplicate case identities, and
never inserts missing fields/default tuples. Parent public report exactly:
```
{version:1,kind:'SCHEDULE_RUNTIME_OBSERVATION_REPORT',
 source:{head,tree,files:[{path,sha256}]},
 runtime:{electronPackage:'45.1.0',exeSha256,inventorySha256},
 verificationPackage:{inventorySha256,observerSha256,contractSha256},
 process:{exitCode:0,retirement:'CONFIRMED',captureComplete:true},
 observation:<exact validated success>,
 disposition:'OBSERVED_NOT_ADMITTED'}
```
File paths are only fixed repository-relative names; HEAD/tree40 lowercase hex,
SHA25664 lowercase hex. No absolute workspace/user/device/account paths, raw
stdout/stderr, token, profile files, env, arbitrary errors, screenshots or binary
artifacts. Public report max32,768 bytes; fixed filename
`schedule-runtime-observation.json`. Known failing run produces only a fixed
status code in CI log, no success report/upload fallback.

### Dedicated CI and source acceptance

New workflow manual `workflow_dispatch` boolean `observe_runtime` defaultfalse,
branch explicitly `refs/heads/phase-07`; permissions contents:read only; no secrets,
OIDC, broad token, PR trigger or automatic observation on push. windows-2022,
20-minute job cap; checkout/setup-node actions reuse exact currently pinned SHA;
Node24.22.1 and scripts-disabled restore/signature/source checks. Observation step
runs only true input+exact branch after checks. The install network path is only
existing official Electron acquisition; actual observer never downloads anything.
Job validates report and uploads **only exact success report** with pinned existing
upload-artifact action SHA,14-day retention, error if missing. No directory glob,
runtime package, node_modules, private capture or profile upload. Report includes
same checked-out HEAD/tree; coordinator verifies job's actual commit before use.

Author and reviewer must test malformed/extra/duplicate/oversized/truncated JSON,
changed fixture/version type, override refusal, staging tamper and symlink/name
rejection, missing retirement, timeout/nonzero exit, extra stdout, post-run mutation,
wrong source hashes, and artifact allowlist. Pure simulated process outcomes never
claim native retirement. Run normal source aggregate after coherent freeze;
independent review before publication/dispatch. Actual Windows job outcome is a
separate evidence requirement, not inferred from source tests.

### Next gates after observation (not authorized by this entry)

1. Review exact actual tuple + fixed formatter observations; no observation field
   self-authorizes admission and no golden fixture regenerated from observed output.
2. Propose source-owned **candidate-only** profile and bundle actual civil→zone→gap
   corpus in verification package; production Node-only resolver stays unchanged.
   Expected UTC/offset/skip/fold/ordinals/truncation/warnings come from independently
   reviewed fixtures, tested across fixed host TZ matrix and mismatch/refusal cases.
3. Only after actual same-package corpus passes and review CLEAR, adopt exact
   production Electron profile plus honest runtimeKind/electronVersion witness.
4. Then adopt precise B typed bridge/unbound draft context/V9 controls; no physical,
   persistent save, drag/undo completion, product cap or full task acceptance inferred.

### A.1 exactness addendum (part of the same proposed adoption)

- `Invoke-ScheduleRuntime.ps1` accepts **zero parameters/arguments** and rejects
  unknown invocation arguments. It verifies checked-out HEAD/tree through fixed
  git commands, then requires successful official installer completion **in this
  same fresh run**. `install-electron.mjs` intentionally rejects preexisting dist,
  path.txt and cache and does not emit persistence-runtime-manifest.json. This
  observer must neither rely on that missing manifest nor attest an arbitrary
  preexisting dist. After successful install, Node control captures complete
  inventory bound to current HEAD/tree and copies/verifies it before execution.
- Node controller accepts exactly two verb forms: `stage <ownedRunRoot> <head>
  <tree>` and `validate <ownedRunRoot>`. Root must be canonical current owned run
  under the fixed `.schedule-runtime` base with matching marker/token; head/tree
  must match actual checked-out Git facts and fixed hash grammar. Neither verb
  accepts executable, fixture, output, profile, script or package selectors. Stage
  writes immutable private same-run control/provenance; validate reads fixed
  `capture.json` written by parent after observed child retirement, then rehashes
  source/package and emits only fixed pass marker. Wrong verb/count/root refuses.
  Node control itself uses the existing trusted absolute Node24.22.1 executable,
  30-second owned process bound and exact script path.
- Runtime-only256-entry/512MiB limits do not hide verification additions: exactly
  four added app files (`package.json`, observer, contract, `control.json`) and
  at most two added directories (`resources/app` hierarchy, reusing resources if
  present). Refuse any preexisting `resources/app`, `resources/app.asar`, or app
  override; source Electron default_app.asar may remain only as attested runtime
  inventory and is not the selected app. Final inventory has max262 entries and
 512MiB+64KiB total, with each added file<=16KiB. Exactly four source/control bytes
  are attested; private inventory/capture are outside the executable package.
- Formatter output explicitly filters `literal` parts. Exactly six remaining
  parts per case, in actual formatter order, one each year/month/day/hour/minute/
  timeZoneName; IDs/zones/case order are fixed. Types max12 characters, each value
  ASCII1..16 characters, offset label `GMT` or `GMT[+-]H[H][:MM]`; numeric parts
  decimal digits with bounded field-specific length. Parent records observation,
  not locale-dependent literal punctuation. Any duplicate/missing part refuses.
- Parent exposes artifact only after complete validation and cleanup status is
  known. Fixed fresh public directory `desktop/.schedule-runtime-public` contains
  exactly `schedule-runtime-observation.json`; preexisting directory/file refuses,
  CreateNew no overwrite. Artifact action selects that exact file, never a glob.
  Successful artifact requires confirmed child retirement and owned run cleanup;
  cleanup failure yields a fixed failure marker and **no public report**. The
  report includes no native capture or copied package. Raw capture/private
  inventory are excluded from Git and artifact inventory; register these two
  dedicated generated directories in `.gitignore` (one additional allowed file).

Compatibility refinement after inspecting existing owned cleanup helpers: use
existing `New-OwnedProfile(owner,'source')`, hence profile sibling is exactly
`fonesi-auto-foundation-source` with its existing marker and8MiB cleanup bound,
not an unsupported new `profile` cleanup name. Fixed subdirectories userData,
sessionData/logs/crashDumps sit inside that profile. Keep shared helper unchanged.
To preserve its existing256-entry/512MiB package cleanup bounds, staging reserves
six entries and64KiB: runtime must be<=250 entries and<=512MiB-64KiB; final package
must be<=256 entries and<=512MiB. This deliberately tighter harness-only admission
supersedes262-entry sketch above; a runtime exceeding it fails rather than widening
shared deletion/inventory limits. Exact ignore edits belong in existing
`desktop/.gitignore`, not a new root ignore file. Delete only fixed private files
whose regular-file/hash/size admission succeeded, remove package and profile via
existing `Remove-VerifiedOwnedPart`, then marker-only `Remove-VerifiedOwnedRun`.
