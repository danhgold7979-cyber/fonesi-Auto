# P0-09 built-in SQLite source experiment — execution evidence

2026-10-30 19:43 UTC start, provisional independent hosted-only lab under the
[approved bounded proposal](P0-09-sqlite-source-lab-PROPOSAL-2026-10-30.md) and
playbook exception recorded before code. No Phase/host/production acceptance.

## Pre-publication checkpoint

New probe tests real engine availability and synthetic transaction semantics in
pinned Node24.22.1 and Electron45.1.0 main without a renderer. Source verifies public
StatementSync.close in exact Node documentation/native implementation; no invented
finalization API or GC dependency. Actual availability still NOT_RUN.

Local schema/privacy regressions13/13 PASS; node --check PASS. No local installer,
SQLite DB or Electron process launched. PowerShell5.1 parsing, actual runtime probes,
owned Windows Job cleanup and hosted artifact are NOT_RUN until exact-head CI.

Evidence schema rejects duplicate outer/inner keys, arbitrary/missing case names,
wrong versions, nonfinite/bool numerics, oversize, truncation, fake pass and cleanup
contradictions; schema-valid failed assertions remain failed. Only fixed-field
validated JSON may be uploaded; never DB files, raw streams or exception messages.

Pending independent safety/schema review and coordinator publication. Existing
P0-01 collector/native sources and old desktop21-case checks remain unchanged.
G0-12 navigation FAIL, ADR-0005 full containment proof BLOCKED, full P0-09 and all
Phase0 acceptance gates remain unresolved. This experiment cannot choose production
schema, encrypted backup mechanism or target-host support.

Independent implementation review19:49UTC identified profile ownership and reopen
content coverage gaps before publication. Fixed: validate ownership and configure
Electron userData/sessionData/crashDumps/log paths inside the owned tree before
readiness; bounded recursive traversal rejects reparse entries (depth16/256-entry
limits), measures content, and deletes only after verified Job cleanup. Reopen now
compares exact synthetic text, all three64-bit values and child relationship, not
only row counts. A self-review also corrected NativeProbe NONZERO_EXIT evidence
mapping; the13th regression rejects inconsistent status/exit/pass combinations.
No runtime was run during this review; re-review pending.

Independent review closed19:51UTC:13/13 schema regressions, node syntax, workflow
YAML, local links/new-file whitespace and frozen collector/desktop diff checks PASS.
No remaining blocker for bounded hosted publication. Enumerator is lazy and
finally-disposed; reopened BigInt row count is explicitly three, child count one.
PS5.1 parsing and real Node/Electron/profile/cleanup behavior remain NOT_RUN.
End of pre-publication session19:52UTC (~9minutes since19:43 scope start); root owns
publication, no new runtime evidence or acceptance is implied by this checkpoint.
