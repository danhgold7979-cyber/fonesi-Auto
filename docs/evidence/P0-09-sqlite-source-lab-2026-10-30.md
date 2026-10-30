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

## Exact-head hosted result — 2026-10-30 19:58 UTC

Remote`b942eae24fd8077666a9700e75bcd63a946caae5`, source tree
`ea366d7393237e3abda10b68c64ed8f9d8d0eb56`:
[run41119112530](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41119112530),
job124280949022 SUCCESS. Windows Server2022 build20348, existing Python3.12.10,
pinned Node24.22.1. PowerShell5.1 shell parse and13/13 hosted Python regressions PASS
(0.009s); actual supervised probes and independent schema emitted
`SQLITE_SCHEMA_VALID_PASS`. Existing collector/offline run41119112459 also SUCCESS
on the same head, independently; failed desktop workflow was not rerun.

| Actual runtime | Engine | Cases | Fixed statement executions | Owned tree bytes before deletion |
|---|---|---|---|---|
| Node24.22.1 | SQLite3.53.4 | 13/13 PASS | 43 | 16,420 |
| Electron45.1.0 main / Node24.22.1 | SQLite3.53.4 | 13/13 PASS | 43 | 573,844 |

Real built-in import, exact version, bound text/Unicode/SQL-looking strings, BigInt,
typed foreign-key/unique denial, controlled rollback/commit, WAL/reopen/exact values,
locked second-connection denial then deliberate new write, disabled extensions,
explicit statement finalization and no-renderer checks all passed in both runtimes.
Installer SUCCESS/exit0/cleanuptrue; both owned runtime Job cleanup flags and owned
directory removal true. Electron profile/session/crash/log paths were assigned into
the owned tree before readiness; no profiles/database content was uploaded. These
are bounded script observations, not an OS-wide filesystem-access audit or production
privilege/availability proof. Byte counts are post-run snapshots, not peak usage.

[Artifact13008000847](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41119112530/artifacts/13008000847)
contains only validated.json. Downloaded ZIP539bytes SHA256
`8331715be04bbfa03ea765c5047461580181682b1ad03a67570fd1399b58a966`
matched hosted upload digest. Raw JSON1,580bytes SHA256
`d24133443d1b0ad60d9b61c89e3d17e31a2c2b69747fe55d5799c417d3ea5a26`.
[Retained sanitized sample](P0-09-sqlite-source-sample-2026-10-30.json) is LF-normalized
only:1,513bytes SHA256
`47da1d263c210bb4d8ea2194a0dab3e06c4643bf046a0a1d896d76b33dda9918`.
Duplicate-aware raw parsing precedes reconstructed-input schema revalidation;
validated output equality and raw/sample semantic equality PASS. Reconstruction
checks artifact contents, not a second execution or recovery of discarded raw streams.

**Outcome: bounded hosted engine experiment PASS, not binding/schema acceptance.**
No production tables/migrations, encryption/backup/secret mechanism, power-loss
recovery, target-host compatibility or performance guarantee tested. FullP0-09 and
Phase0 acceptance remain blocked; old G0-12 navigation20/21 source+package failure
and ADR-0005 full containment proof remain unresolved. Do not extrapolate a second
runtime proof from13 synthetic validator fixtures or claim this resolves navigation.
Independent artifact/privacy review closed19:59UTC: duplicate-aware original/sample
parse, strict reconstructed schema/output equality, CRLF-to-LF-only byte comparison,
hashes, counts and fixed-field privacy PASS. Reviewer independently checked hosted
job/artifact metadata but did not redownload ZIP or rerun runtime. Local13/13 schema
regressions, diff/whitespace and links PASS; no source changes after hosted run.
