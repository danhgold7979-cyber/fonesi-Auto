# P1-04 structured logging — source checkpoint

**Source/envelope checkpoint, 2026-10-31 06:47 UTC. Not task acceptance.**
Scope is the approved [logging contract](../phases/PHASE-01-P1-04-LOGGING-CONTRACT.md).
The original Phase 0 baseline and all 12 exit criteria remain unaccepted. The
historical immutable-document navigation objective remains FAIL_RETAINED.

## Implemented source

- Exact fixed event encoder; main-generated UUID correlation; compatible v1 and
  explicitly versioned v2 public-read responses. No log/path/hold IPC method.
- Reusable owned log root, exclusive writer ownership, canonical bounded metadata,
  serialized queue/holds/prune, date/1 MiB rotation and strict 30-day cutoff.
- Conservative incomplete-state quarantine and an explicit offline maintenance
  entry, `desktop/scripts/recover-logs.mjs`, using verified compiled recovery code.
  The stopped-owner/launch-exclusion acknowledgment is a required operator or
  supervisor precondition, not proof supplied by a token, PID or command flag.
- Main startup/outcome/crash/shutdown integration; fixed degraded status and
  one-shot asynchronous shutdown. Five seconds limits waiting, not filesystem I/O.
  Late completion cannot turn an abandoned operation into a successful receipt.
- Build input hashes cover every new module; maintenance bundles are included in
  the exact output manifest. Parent-relative imports remain exact registered
  in-root edges, not arbitrary resolution.

## Executed local evidence so far

The final independent local run passed **133/133 desktop**, **109/109 foundation**
and **46/46 Python** tests. Desktop runs exact metadata/import/quality/type/build/
manifest checks before tests. Check-only quality inspected 57 active files with
zero errors/warnings; informational style suggestions do not change configured
severity. Syntax, workflow YAML, whitespace and owned-output cleanup checks passed.
The reviewer did not execute Electron, install packages or run Windows/PowerShell.

Actual owned-file tests include 5,000 records across two size-bounded segments,
4,096 accepted inventory entries and rejection/preservation of 4,097, cutoff
before/equality/after behavior, holds across reopen, interrupted release/recovery,
wrong owner/extra lock entries, immutable queued records, shared close promise,
microtask drain handoff and an actual five-second unresolved-flush deadline with
late completion. Injected ENOSPC is a deterministic fault test, not a filled disk.
A clean direct 127-test run and subsequent full runner passed; an earlier
intermediate aggregate TESTS_FAILED was not localized and is not acceptance evidence.

Review corrected null primary correlation tuples, legacy v1 allocation-failure
compatibility, release crash windows, recovery prevalidation, handle disposal,
queue handoff and caller-record snapshotting. Source-only findings do not prove
Windows locking, power-loss durability or application runtime behavior.

## Pending exact evidence

Windows envelope is implemented; independent source/envelope/documentation review
was CLEAR at 06:49 UTC (133/109/46 tests, final quality, YAML, links and staged
whitespace checks). This review did not execute Windows, PowerShell or Electron.
Actual sharing-denial and owned-process
crash/recovery, source/package runtime correlation and log/crash-artifact canary
scans remain **NOT_RUN**. Raw logs, paths, IDs and crash bytes stay private; only
strict fixed-schema evidence may be retained. Native dumps are not represented as
sanitized application logs. No production effects or credentials are used.

Final criterion-by-criterion disposition follows the reviewed exact-head Windows
result. No full P1-04/Phase 1 acceptance or main merge is implied by these counts.

## Canonical criterion map (pending hosted verification)

| P1-04 requirement | Implementation and evidence boundary |
|---|---|
| Structured UTC/severity/task/correlation events | Fixed encoder/event tuples; main UUID generation; no caller ID/freeform metadata; pure and compiled-dispatch tests |
| Safe errors and main/preload correlation | Compatible v1, strict v2 canonical response, received-error ID matches persisted fixed record; null local errors do not invent IDs |
| Rotation, bounded async writes and orderly flush | Actual date/1 MiB rotation, queue limits, one lane, shared close promise, five-second abandonment/late-completion tests; Windows application exit pending |
| 30-day retention without unresolved evidence loss | Exact max-UTC content validation, strict cutoff, persistent holds and same-lane ordering, backward-clock suppression; no live effect journal exists |
| Owned reusable root and failure visibility | Plain owned root/parent validation, exclusive writer, exact metadata and fixed degraded health; real Windows sharing/reparse and visible app failure pending |
| Crash/restart recovery | Quarantine receipt and stopped-owner maintenance CLI; no automatic stale PID takeover, no power-loss/controller guarantee; supervised Windows crash/reopen pending |
| Canary/redaction validation | Encoder exclusion and local persistence canaries; hosted application stdout/stderr/log/crash-artifact scans pending, raw artifacts private |
| No regression | Existing metadata/quality/type/import/build/public-read suites retained; final full source and Windows run required after envelope review |

The offline command is development maintenance, not renderer functionality:
`node desktop/scripts/recover-logs.mjs --owners-stopped-and-launches-excluded <owned-root> <parent-token> <store-id> <stale-owner-token>`.
The operator/supervisor must establish the stated precondition before invoking it;
the flag merely acknowledges that obligation. Arguments are never echoed. Failure
prints only RECOVERY_FAILED or OWNERSHIP_REJECTED; successful verified recovery
prints RECOVERED. No installation, process killing or owner discovery occurs here.

## Frozen Windows verification envelope

The same isolated windows-2022 development workflow now requires source/package
29-case reports, a six-case actual degraded-sink application probe, ten fixed
store-fixture modes, and 30 PowerShell ownership/boundary regressions. All are
**NOT_RUN on Windows for this checkpoint**. Private scanning covers owned app logs,
captured stdout/stderr and enumerated native crash artifacts; the actual renderer
crash is seeded with a synthetic canary. Detection fails the aggregate and retains fixed detection evidence, never
redacts a dump into a success or uploads raw bytes. Retired owned raw subtrees
may be removed by bounded cleanup; raw crash-dump preservation is not claimed.

Existing limits remain: installer 120 seconds and other supervised processes
30 seconds, plus 10-second Job retirement; 32,768 characters per captured stream;
8 MiB per owned profile/log subtree, 256 entries/depth 16; runtime copy 512 MiB;
raw and sanitized reports 64 KiB. Incremental deletion follows verified retirement
and full owned-subtree validation; uncertain state is retained. The writer's own
4,096-entry/1 MiB-segment envelope is distinct from small synthetic runtime fixtures.

Local owned subprocess replay exercised exclusion, deliberate crash exit 73,
wrong-token denial and the actual maintenance CLI recovery followed by fresh
logging/held-record preservation. This is Linux process/filesystem evidence, not
Windows Job or sharing evidence. Windows replacement denial uses an owned open
file, not host ACL changes; ENOSPC remains explicitly injected, never disk filling.
