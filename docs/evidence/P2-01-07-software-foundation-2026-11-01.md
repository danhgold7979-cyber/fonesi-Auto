# P2-01–P2-07 — internal software foundation checkpoint

**IN_PROGRESS, no new canonical task acceptance — 2026-11-01.**

## Authority and exact base

[Reviewed entry](../phases/PHASE-02-SOFTWARE-FIRST-ENTRY-PROPOSAL.md) was approved by
coordinator Coder Bin at2026-10-31 19:24UTC under adopted Amendment02. After renewed
explicit user authorization, remote `phase-02` was created and verified2026-11-01
02:37UTC; local fetch/switch at02:38 matched public
`f8b155738e0ebbe404449579d4f4b60b911aed28`, tree
`ea1b20b62970a40df0da780591d26d844209e281`. `phase-01` and `main` were preserved.
Prior denied branch attempts were before execution, not hidden branch writes.
Routine future phase branches are delegated after reviewed readiness; genuine
SDK/device/security authority is not inferred from branch permission.

## Implemented source scope

- `platform-tools-contract.ts`: exact immutable candidate manifest/evidence comparison.
  This is supplied-fact validation, not filesystem/native admission. Production manifest
  remains null and production status `BINARY_UNAVAILABLE`.
- `adb-discovery.ts` and `adb-metadata.ts`: bounded fixed text parsing, exact transport
  tokens, explicit unavailable metadata and stale snapshots; no command execution.
- `adb-host-lifecycle.ts`: injected main-only host/server state machine, capability/owned
  endpoint custody, serialized lane, deadlines and uncertainty; no real server adapter.
- `transport-registry.ts`: pure immutable snapshots, provisional versus verified identity,
  supplied resolver proof, conflict/disconnect generation fencing and retained history.
  No durable registry/SQL migration or real identity-proof acquisition. Caller inspection
  budgets are fixture/processing budgets, not a supported product device-count limit.
- `device-actor.ts`: one actor per device within its shared actor domain, fixed metadata
  operations, private owner capabilities, exact binding checks,64 queued per actor and
  1024 shared work reservations, cancellation/takeover/drain and no uncertain replay.
  Production must use the single admitted domain; no new renderer or live action route.
  Actor diagnosticId is explicitly null until actual diagnostic integration; host
  diagnostic allocation is an injected private boundary, not a persisted log claim.

No main activation, public IPC, renderer effect, live binary/server/device invocation,
new dependency, SDK installation or physical evidence is introduced. All injected
binary/ownership/retirement/identity facts in tests are explicitly synthetic. Parsed
ADB-like text is not proof that a device exists or was authorized.

## Verification state

Focused source tests and actual pure-module composition are being reviewed. Global
strict TypeScript and exact module graph57 passed at the initial coherent checkpoint;
quality inventory227 passed. The first full aggregate failed one existing exact module-count assertion (51 before
the six additions,57 now); the fixture was corrected to exact57 without weakening
graph edges or runtime closure. Independent review also found/fixed null actor
capability dereference and a final injected-clock revocation gap, with direct negative
regressions. A verified-identity reassignment conflict was also corrected to quarantine
rather than transfer existing identity. Author full desktop then passed640/640 plus
`DESKTOP_SOURCE_CHECK_PASS` at02:46UTC. Final review found/fixed a remaining actor
120-second admission edge: a synchronous result must not outrun the timer with a
far-future caller deadline. Direct regression now rejects that request before dispatch
and rejects a clock-jump completion. Timeout tests use fixed injected clocks with real
bounded timers, avoiding creation-to-dispatch scheduler timing assumptions. The final
actor16/host13/composition2 focused run passed31/31; independent final checks completed at02:48UTC: **desktop641/641 +
DESKTOP_SOURCE_CHECK_PASS, foundation109/109, Python157/157, zero skipped tests**.
Independent source review CLEAR covers the six unwired modules and their composition;
new source-only workflow YAML7steps/diff-check passed. Workflow SHA256
`79815548dafb9b6b5d155b43bf50477c9a600ff710f6c0607faea8bda26e3734`.
This is local Linux source evidence, not a Windows/ADB runtime result. The prior author
640 count is historical; the final641 includes the reviewer-requested deadline test.
All133 local Markdown links resolve, and frozen Phase0/native-helper/V9 hashes remain
unchanged. Source-only hosted CI is ready for publication; its actual outcome is pending.
The composition tests use actual parser/registry/actor modules with synthetic transport
facts: provisional bindings and actual production-unavailable status prevent dispatch;
validated metadata can be observed only with a current supplied verified binding;
disconnect invalidates an already dispatched result.

No Windows/ADB/server/USB/wireless/Unicode test ran for this checkpoint. Inspection of
an official archive by the coordinator/reviewer is separate provenance research, not
execution or permission to activate it. Binary architecture is distinct from host
architecture (the inspected candidate Windows ADB is PE32/I386); compatibility must be
observed, not inferred from a Windows x64 host label.

## Remaining evidence and rollback

All13 canonical tasks and original denominators remain unchanged. P1-06 cross-user
UNMET, formal accepted count0 and physical matrix remain open. Phase1 still has10/11
bounded technical passes (90.9%;10/154=6.5% overall); this source batch adds none.
Actual binary/license admission, Windows server/process behavior, durable registry,
public service wiring, two-phone targeting, two-AVD matrix, capture/input/Unicode and
full device faults retain their original gates. Disabled wireless is not wireless PASS.
Rollback removes/disables the unwired software modules while preserving the reviewed
Phase1 package and all evidence; it never resets a phone or replays an uncertain effect.
