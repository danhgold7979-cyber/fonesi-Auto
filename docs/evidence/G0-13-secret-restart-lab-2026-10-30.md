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
