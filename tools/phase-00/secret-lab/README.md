# Disposable G0-13 secret restart experiment — stages1–3 only

[Matrix/authorization](../../../docs/evidence/G0-13-secret-recovery-matrix-PROPOSED-2026-10-30.md).
Pinned Electron45.1.0 async safeStorage in three supervised main-only processes:
create/API+roundtrip, orderly same-profile restart, prefix-preserving tail tamper
with baseline positive control before every negative. No renderer, production
secret adapter, backup format, real credentials or deliberate OS key/ACL changes.
Normal Windows DPAPI access may use OS-managed state outside owned application
paths; no same-user-app isolation or zero OS-side-effect promise.

Actual success requires exact synthetic recovery, typed result/rotation hints,
normal will-quit observation, exit0 and verified Job cleanup before the next stage.
Availability alone cannot pass. Rotation hints are recorded, not acted upon.
Failure paths may immediate-exit1 but cannot be counted as orderly persistence.

Supervisor reuses the reviewed frozen NativeProbe and pinned trusted installer.
Each stage15s+5s cleanup; installer120s+10s. All application profile/session/log/crash
paths are owned before ready. Captured streams limited to32768UTF-16 characters
(64KiB string payload); outer JSON and reads limited to64KiB/64KiB+1. Three fixed
strings<=256UTF-8 bytes, ciphertext<=16KiB each stays private in owned files.
Lazy depth16/count256 traversal rejects reparse points, validates full tree before
nonrecursive deletion after verified process cleanup.4MiB is post-run size, not a
hard peak-memory/disk cap. No broad delete, account login or secret-store enumeration.

Strict duplicate-aware validator accepts exact ordered stage/case sets, versions,
boolean hints and status/exit/cleanup relationships. Only validated fixed JSON is
uploaded. Raw streams/JSON, ciphertext, Local State and profiles are ignored. A
schema-valid partial failed sequence can be published only as FAIL, never PASS.
Stage4 missing/corrupt profiles, OS revocation, cross-user/machine recovery and
production backup remain explicit NOT_TESTED.

Pure local tests (no runtime/crypto launch):
```
node --check tools/phase-00/secret-lab/probe.cjs
node --test tools/phase-00/secret-lab/result-contract.test.cjs
python -m unittest discover -s tools/phase-00/secret-lab -p 'test_*.py' -v
```
Windows parse/runtime/cleanup evidence only after independent review and authorized
hosted publication. Old collector/desktop/SQLite experiments remain unchanged.
