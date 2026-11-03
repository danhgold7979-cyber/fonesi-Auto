# P0-09 / G0-12 — Built-in SQLite source feasibility proposal

**BOUNDED EXPERIMENT APPROVED 19:43 UTC; no production/phase acceptance.**
Original proposal prepared2026-10-30 19:39 UTC; scope retained below.

## Plan trace and independence

The approved [P0-09 baseline](../phases/PHASE-00-feasibility.md) includes SQLite/
architecture decisions but depends on P0-01..08. [G0-12](../04_MASTER_IMPLEMENTATION_PLAN.md)
and [ADR-0001](../decisions/ADR-0001-desktop-stack-candidates.md) require measured
binding/runtime compatibility. An explicitly recorded independent lab exception is
required before coding; this proposal does not complete P0-09, approve a binding or
schema, change the Phase baseline, or start P1-05. ADR-0004 remains PROPOSED.

A tiny disposable database-engine probe can consume only fixed synthetic values
and already selected lab runtimes, without renderer navigation, device/host evidence,
accounts or production data. Desktop immutable-navigation and ADR-0005 design gates
remain BLOCKED. Success here would be independent engine evidence, never a green
replacement for the failed desktop workflow.

## Candidate and primary provenance (reviewed 2026-10-30)

No new npm/native dependency, ORM, binding, migration tool or version is selected.
Reuse exact lab Node24.22.1 and Electron45.1.0, its existing reviewed lockfile and
trusted checksum-verified installer, only if coordinator authorizes that provisioning
again for an isolated workflow. Otherwise stop at unavailable runtime; no fallback
install, alternate mirror, npm latest or version swap.

- [Exact Node SQLite API](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/sqlite.md)
  describes `node:sqlite` as Stability1.2 Release Candidate, with synchronous
  DatabaseSync, prepared parameters, foreign keys, extension-disabled mode and busy
  timeout. Availability/stability is not production selection or UI-latency proof.
  nodejs.org exact-version HTML retrieval was inaccessible; exact-tag source worked.
- [Electron45.1.0 DEPS](https://raw.githubusercontent.com/electron/electron/v45.1.0/DEPS)
  selects Node24.22.1. [Node GN defaults](https://raw.githubusercontent.com/nodejs/node/v24.22.1/node.gni)
  enable SQLite; [Electron build arguments](https://raw.githubusercontent.com/electron/electron/v45.1.0/build/args/all.gn)
  do not explicitly disable it. These support testing, not a claim that the shipped
  Electron binary exposes the module. Actual import is the first gate.
- [Exact bundled SQLite header](https://raw.githubusercontent.com/nodejs/node/v24.22.1/deps/sqlite/sqlite3.h)
  identifies3.53.4. Record actual `sqlite_version()` in each runtime and compare;
  unexpected engine/version is evidence of mismatch and stops acceptance, not an
  automatic repin.
- [Node license](https://raw.githubusercontent.com/nodejs/node/v24.22.1/LICENSE)
  includes MIT and third-party notices; [SQLite](https://sqlite.org/copyright.html)
  is public domain. Preserve existing Electron/Chromium/Node notices; Electron MIT
  does not cover every bundled component. No redistributed DB/runtime artifact.

## Smallest proposed experiment

Two independent supervised launches: standalone pinned Node, then pinned Electron
**main process only** (no BrowserWindow, renderer, preload, IPC bridge or run-as-node
mode override). Both run the same plain JavaScript engine probe in separate newly
owned temporary directories. No dependency on the failed desktop launch script;
reuse only reviewed provisioning/containment mechanisms without changing collector
or old21-case tests. Missing API in either runtime is BLOCKED/failed feasibility,
not a skipped PASS or permission to install another binding.

Fixed inputs: at most32 rows, two small STRICT tables with synthetic integer keys,
one foreign key, unique constraint and a fixed Vietnamese/English/emoji/SQL-looking
text corpus; one64-bit integer boundary value. No real identifiers, media, secrets,
user paths or imported files. This is explicitly **not** the production account/
device/effect schema and not a production migration or backup implementation.

| Probe | Required result |
|---|---|
| Runtime and module | Exact expected Node/Electron identity; built-in import and DatabaseSync available; actual engine3.53.4; no renderer created |
| Parameter/Unicode roundtrip | Bound synthetic text and SQL-looking value round-trip exactly, no unintended statement; 64-bit integer reads exactly using explicit BigInt handling |
| Constraints | Explicit foreign_keys=ON readback; orphan and duplicate insert rejected; row counts unchanged |
| Atomic transaction | Controlled throw after first write followed by explicit ROLLBACK leaves original rows; separate COMMIT persists both intended rows |
| WAL/reopen | Requested WAL mode readback equals wal; close/reopen owned file preserves committed values and integrity_check returns ok |
| Bounded contention | Two local connections, one write lock; second write fails busy with configured100ms timeout; after rollback a deliberate new synthetic write succeeds (not automatic retry) |
| Extension boundary | Constructor allowExtension=false; attempting enableLoadExtension(true) is rejected without loading any DLL/file |
| Cleanup/evidence | Close handles; supervised process/owned Job cleanup verified; remove only owned directory and confirm removal; fixed-schema sanitized report |

Negative constraint/busy/extension cases require the expected typed error class
and allowlisted code; a syntax error, missing API or arbitrary thrown exception
cannot satisfy the denial assertion. Finalize every prepared statement explicitly
in finally before DatabaseSync.close/reopen; never rely on garbage collection to
release statements, handles or locks.

No crash-durability, power-loss, network filesystem, multi-process locking, performance
threshold, encryption, Windows secret store, encrypted backup/restore, migration
rollback or production support claim follows. Those remain separate unresolved gates.
The rollback fixture tests SQL transaction semantics only, not approved migration
policy or verified pre-migration encrypted backup.

## Bounds, failure semantics and publication

Proposed per-runtime15-second deadline plus5-second verified owned Job cleanup;
workflow10-minute ceiling including separately bounded existing trusted provisioning.
No SQL input from outside constants, recursive queries, ATTACH, extensions or arbitrary
PRAGMAs. Two connections,32 rows, fewer than64 fixed statement executions; page_size
4096 and max_page_count128 requested/read back, journal_size_limit bounded. Report
post-run file-size check at4MiB for the owned directory. Page/journal configuration
and final size checks are **not** a strict peak-memory/disk cap; if a hard storage
quota is required, reject this proposal until an enforceable design is reviewed.

Create each temporary directory exclusively with a fresh owned marker; refuse an
existing/reparse-point destination. Delete only its validated owned directory and
only after verified Job cleanup; cleanup uncertainty retains the failure and must
not trigger broader deletion. Capture at most64KiB stdout/report data, and bound
reads to64KiB+1 before allocation/parsing; oversized data fails closed.

Only JSON with fixed probe IDs, pass/fail/unknown codes, runtime versions, finite
counts/timings and cleanup booleans may leave the supervisor. No SQL rows, raw error
messages, host paths, database/WAL/SHM files, environment dump or stdout/stderr upload.
Validate strict keys/types/expected test-set and versions before uploading. Missing
result, unexpected status/version, timeout, failed cleanup or assertion failure must
be nonzero; unsupported API stays explicit, never replaced by a mock. A positive
engine result requires both real runtime probes and verified cleanup.

Local checks before publication: pure report-validator negatives (duplicates,
missing/extra probes, wrong runtime, unknown state, fake cleanup, nonfinite/oversize
JSON), script syntax and workflow YAML. Independent safety/schema review required.
Actual Windows execution remains NOT_RUN until an exact-head hosted run is reviewed.
If approved, expected source changes are a new tools/phase-00/sqlite-lab directory,
new isolated workflow, playbook exception before code and evidence/status updates;
existing collector/native helper, desktop workflow and old assertions stay unchanged.

## Decision requested

Authorize only this disposable engine-availability/transaction experiment and trusted
reuse of already reviewed pinned provisioning, or keep proposal pending. No new
production dependency, SQLite binding acceptance, schema approval or phase acceptance
is requested. Root coordinates publication; no implementation before approval.

Independent proposal review19:41UTC verified exact-source provenance and requested
explicit statement finalization, typed negative outcomes, bounded evidence reads
and cleanup-before-deletion ownership. These requirements are incorporated above.
Proposal remains unapproved; no runtime or implementation occurred.

## Authorization and prerequisite resolution — 19:43 UTC

Coordinator approved only the bounded lab and reuse of existing trusted pinned
provisioning, conditional on deterministic statement finalization. Exact Node24.22.1
[public API](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/sqlite.md#L1000-L1011)
documents statement.close(), added24.22.0; [native source](https://raw.githubusercontent.com/nodejs/node/v24.22.1/src/node_sqlite.cc#L2624-L2652)
performs sqlite3_finalize and registers public close at line3660. This resolves the
source-design prerequisite, not actual Electron availability. Explicit finally-close
is required; missing method stops the probe without GC or alternative-method fallback.
Playbook exception is recorded before source creation. Historical proposal wording
above describes the request/review sequence, not an additional production grant.
