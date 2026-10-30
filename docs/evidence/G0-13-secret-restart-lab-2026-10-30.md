# G0-13 async secret restart lab — stages1–3 execution evidence

Start2026-10-30 21:16UTC, after explicit coordinator approval and pre-code playbook
exception; [source matrix/scope](G0-13-secret-recovery-matrix-PROPOSED-2026-10-30.md).
Exact pinned Electron45.1.0/Node24.22.1, main only, no renderer. Three owned processes
share one private profile: create/roundtrip, orderly restart/recovery, nonempty
prefix-preserving tail tamper with baseline positive control before each negative.
No new dependency, real secret, deliberate OS-key/account/ACL mutation, production
key format or backup implementation. Normal DPAPI provider access uses the runner
identity and can read/write OS-managed state; owned app paths do not claim otherwise.

## Pre-publication checkpoint

Local12/12 Python schema/privacy regressions and5/5 Node exact-error classification
regressions PASS. Node syntax, workflow YAML, diff check and ignored-private-path
checks PASS. Existing offline selector/policy42/42 PASS; frozen collector/native,
desktop and SQLite source/workflow diff empty. No local app/install/crypto launch.
Actual PowerShell5.1 parsing, APIs/restart/tamper and owned Job cleanup NOT_RUN.
Independent source/schema review closed21:21UTC: no blocking finding;12/12 Python
plus5/5 pure Node, syntax/YAML/new-file whitespace/links and frozen-source checks
PASS. Windows APIs/profile persistence/DPAPI/cleanup remain NOT_RUN.
Pre-publication session21:16–21:22UTC (~6minutes); no runtime success inferred.

Availability alone cannot pass. Exact baseline and typed result/rotation hints are
required; hints are observed without re-encryption. Only the exact generic native
Error rejection counts for tamper, never temporary-unavailability/unknown failures.
Normal will-quit observation plus exit0/Job retirement gates sequencing; failure-only
immediate exit is nonzero and cannot become persistence proof. Successful exact
recovery after restart would establish only that observed orderly restart, not
crash durability or OS-wide filesystem/secret security.

Supervisor retains raw inner JSON strings for duplicate-aware validation. Only
fixed validated JSON may be uploaded, never ciphertext, synthetic plaintext, Local
State, keys, profiles, raw streams or error text. Failed schema creates no artifact;
a valid failed stage can be retained as FAIL, never a partial PASS. Stage4 missing/
corrupt profiles, real OS revocation, cross-user/machine recovery and production
backup remain explicit NOT_TESTED. Full G0-13/P0-09 and all Phase acceptance gates
remain open; failed G0-12 navigation/ADR-0005 containment are not rerun or waived.

## Exact-head hosted evidence — 2026-10-30 21:29 UTC

Remote`ba32bf7f301edc9517c6a134069541f53a4ab962`, tree
`fbce72ec9f4ac722624e030e0b47ebca076cfc8e`:
[run41131016175](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41131016175),
job124321620228 SUCCESS. Windows Server2022 build20348 with PowerShell5.1 shell,
preinstalled Python3.12.10, pinned Electron45.1.0/Node24.22.1. Actual PowerShell
parse,5/5 Node classifier tests and12/12 Python schema tests (0.007s) PASS; supervised
runtime stages completed and independent validator emitted`SECRET_SCHEMA_VALID_PASS`.
Separate same-head collector/offline run41131016077 SUCCESS. No old desktop/SQLite
lab rerun was needed.

| Stage | Actual cases | Observed rotation hints | Owned tree bytes before cleanup |
|---|---|---|---|
| create | 8/8 PASS | false,false,false | 558,116 |
| restart | 8/8 PASS | false,false,false | 558,116 |
| tamper | 10/10 PASS | false,false,false | 558,116 |

These observations include actual async API availability **and exact synthetic
plaintext recovery**, typed results/hints, no renderer, normal will-quit, then
successful process exit/owned Job retirement. Restart used the same owned profile
and recovered the earlier ciphertext. Tail truncation/bitflip checks passed for the
fixed three-string corpus, each negative preceded by its intact positive control;
only the reviewed native generic rejection counted. No unavailable error or missing
API was substituted for denial. All9 recorded rotation hints were false, so rotation
handling beyond observing its typed field was NOT_TESTED. The report contains only
aggregate fixed booleans, not secret/ciphertext/Local State contents.

Installer SUCCESS/exit0/cleanuptrue; all3 runtime cleanup flags and final owned-
directory cleanup true. The558,116-byte values are post-stage snapshots including
private app profile material, not peak resource use or an OS-wide filesystem audit.
Normal DPAPI provider access under the existing hosted identity remains acknowledged;
no same-user application isolation, standard-user target proof, crash durability or
zero OS-managed side effects is claimed.

[Artifact13012498600](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41131016175/artifacts/13012498600)
contains only validated.json. ZIP610bytes SHA256
`171be24a25601f222af719121a2ab75af0d5e44099fc337a0f82e43ca647b86b`
matched the hosted upload digest. Downloaded raw JSON2,178bytes SHA256
`eb1e869d71488af6b09498def7373f650998d8d60b703f34d2fda2092decb79b`.
[Retained sanitized sample](G0-13-secret-restart-sample-2026-10-30.json) normalizes
CRLF to LF only:2,080bytes SHA256
`6168ad5d54514ed1b2b99b7c6b7b6aee8df91dc162b1c1481bc2ef225e0aa806`.
Raw duplicate-aware parsing, reconstructed-input strict schema/output equality and
raw/sample semantic equality PASS. Reconstruction validates retained contents, not
a second launch or recovery of discarded original process streams.

**Outcome: approved stages1–3 hosted slice PASS only.** Missing/corrupt profile,
OS-key revocation, cross-user/machine recovery and production backup remain explicit
NOT_TESTED; no production key/backup-format or secret-adapter selection. Full G0-13/
P0-09, target host/device/policy and Phase acceptance remain blocked. G0-12 immutable
navigation failure and ADR-0005 full containment proof are unchanged. Independent
artifact/privacy review closed21:30UTC: duplicate-aware original/sample parse, strict
reconstructed schema/output equality, exact CRLF-to-LF-only bytes, hashes, fixed
fields/counts/exclusions and cleanup flags PASS. Reviewer independently confirmed
hosted job/artifact metadata and collector/offline success, but did not redownload
ZIP or rerun runtime. Local12/12 schema tests, links/whitespace/diff PASS; code
unchanged after the hosted run. No secret material or private identities retained.
