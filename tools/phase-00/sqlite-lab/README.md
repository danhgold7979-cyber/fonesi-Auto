# Disposable built-in SQLite source lab

Authorized scope/limits: [proposal and approval](../../../docs/evidence/P0-09-sqlite-source-lab-PROPOSAL-2026-10-30.md).
Not production schema, binding selection, encrypted backup, migration, durability,
performance or target-host acceptance. Old desktop navigation failure remains.

`probe.cjs` uses only owned synthetic DBs in exact Node24.22.1/Electron45.1.0 main,
no renderer/run-as-node override. Each prepared statement explicitly closes in
finally; typed denial outcomes cannot pass on arbitrary thrown errors. Actual
node:sqlite/StatementSync.close availability is measured, not assumed.

`Invoke-SqliteLab.ps1` runs the existing reviewed installer (120s+10s cleanup) and
both15s+5s runtime jobs through unchanged NativeProbe. Each captured stream is
capped at32768 UTF-16 characters (64KiB string payload); no captured stderr is
printed or uploaded. Raw JSON report is limited to64KiB UTF-8. Directory cleanup
occurs only after verified process cleanup and ownership/reparse checks. The
4MiB final owned-size limit is not a strict peak-disk cap.

`validate.py` duplicate-checks outer JSON and each original runtime JSON string,
strictly validates fixed fields/cases, writes only sanitized validated.json and
returns nonzero for failed/incomplete evidence. Invalid data creates no artifact.
A complete schema-valid failed probe may be uploaded as failure evidence, not PASS.
Database/WAL/SHM, raw report and caches are ignored and never uploaded.

Local pure checks (no DB/runtime launch):

```
node --check tools/phase-00/sqlite-lab/probe.cjs
python -m unittest discover -s tools/phase-00/sqlite-lab -p 'test_*.py' -v
```

Actual Windows launch only via the scoped hosted workflow after independent review
and coordinator publication. No collector changes or user data access.

Electron profile/session/crash/log directories are redirected into the validated
owned root before app readiness. Tree traversal allows at most256 entries/depth16,
rejects reparse points at every level, and validates traversal before deletion.
