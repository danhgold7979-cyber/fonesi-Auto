# P1-07 nonsecret preferences — implementation in progress

Coordinator approved the [exact settings contract](../phases/PHASE-01-P1-07-SETTINGS-CONTRACT.md)
at 11:55 UTC and the bounded post-arm hydration clarification at 12:15 UTC.
This development-only parallel entry does not accept P1-06: its cross-user criterion
remains **UNMET**, with no further unchanged token-acquisition retry. Technical task
count remains **6/11 (54.5%), 6/154 (3.9%)**, formal accepted count zero.

## Implemented application boundary

- Migration 3 adds only CURRENT/PREVIOUS nonsecret settings. The original two
  migration texts/hashes are unchanged. Actual schema-2 migration requires an
  authenticated schema-2 prerequisite through the existing backup service.
- Strict Dark/Light, requested dock/tile widths and main-owned native geometry;
  public snapshots exclude geometry, database paths, secrets and provider details.
  Every nonzero CURRENT revision requires a valid lower PREVIOUS revision.
- One settings lane, actual `BEGIN IMMEDIATE`/revision CAS, complete old/new state,
  final synchronous caller/session/lease admission immediately before COMMIT,
  and sticky uncertain-outcome refusal until validated reopen.
- Four narrow preference wrappers share the existing eight unresolved invocation
  budget with legacy public reads. Reset/restore use default-Cancel native
  confirmation. Timeouts do not cancel a possibly committed request or auto-retry.
- Compatible schema-3 audit events contain fixed operation/error/revision metadata,
  never preference values. Real logger intent failure prevents mutation; post-commit
  result/notification failure does not disguise known COMMITTED state as rollback.
- Real window snapshots are separately main-authorized. Shutdown captures geometry
  before destruction, drains the existing lane, and only then closes persistence.
  Existing 120-second non-cancelling lifecycle timeout retains uncertainty/lease.
- Private fixed main readiness notification is sent only after controlled load and
  view arming. One renderer startup READ hydrates saved preferences; no automatic
  mutation/retry. Readiness timeout/disposal cannot later invoke. Resize recomputes
  derived dock layout without rewriting the requested stored width.
- Main startup still opens/validates the existing vault. No vault requirement,
  public v1/v2 schema, device/account/job boundary or original Phase-0 gate is waived.

## Local checkpoints (overlapping runs, not additive totals)

At 12:15 UTC the author full desktop pipeline passed **393/393** with
`DESKTOP_SOURCE_CHECK_PASS`: reviewed quality gate, strict compiler, exact 44-module
source/runtime graph, current build manifest and every fixed sequential test batch.
An earlier integrated attempt correctly failed one stale renderer import-count
expectation; it was replaced with the exact three reviewed import specifiers.

After the approved hydration amendment, strict compiler, graph and normal build
passed again, and a focused client/renderer/dispatcher/composition/graph run passed
**53/53** at 12:18 UTC. This is not a second full aggregate claim.
Independent focused review previously passed actual dispatcher7, real
SQLite/logger composition8, window4 and synchronous lease4; the hydration delta independently passed37/37 at12:19UTC. The later full aggregate
review including the new native envelope is recorded below.

Tests include actual SQLite CAS/busy/malformed rows, previous retention, schema-2
migration admission, rollback/uncertain COMMIT instrumentation, append/sync audit
faults, no-input-echo contracts, shared capacity, exact method/reply binding, native
confirmation cancellation, pending-confirmation shutdown timeout/late settlement,
and renderer state via transformed source with injected React/DOM adapters.
These local renderer tests are **not native CSP, screenshot or genuine-widget evidence**.
COMMIT delegation exceptions are not mislabeled as process-crash evidence.

## Required hosted evidence — pending

The separately scoped settings supervisor/job will exercise actual compiled main,
preload, React and SQLite under the reviewed Windows Job/owned-root/provenance
controls, in source and unpacked-package modes. Required observations are migration
3 with authenticated prerequisite, real preference changes and automatic hydration
on orderly reopen, actual native window restoration, same-viewport Light/Dark
screenshots, and isolated actual COMMIT crash/reopen controls.

Dialog answers and bounded quitting use exact hash-bound verification wrappers;
they are **injected answers, not genuine widget clicks or human-intent proof**.
Reports must explicitly carry `P106_UNMET_NOT_RERUN`. Historical full persistence/
vault validators are not relaxed or relabeled; the automatic settings job cannot
stand in for the unmet foreign-context criterion. Exact source/workflow review is
required before hosted execution. No P1-07 technical acceptance is claimed yet.

## Canonical criterion mapping

| Canonical requirement | Current evidence / remaining observation |
|---|---|
| Versioned theme/window settings, atomic saves, no job replay | Implemented exact contract and local SQLite/service/bridge tests; native verification pending. |
| Defaults and Dark/Light/layout survive normal close/restart | Exact V9-derived defaults and hydration/window adapters tested locally; actual Windows reopen/screenshots pending. |
| Interrupted save retains whole committed state | Actual SQLite fault/rollback/readback tests; real process COMMIT crash/reopen pending. |
| Malformed/out-of-range/simultaneous edits/reset cancellation | Exact parser/DB/CAS/native-confirmation adapter negatives; malformed DB remains preserved RECOVERY_REQUIRED, not guessed repair. |
| Previous revision and approved recovery/reset path | Valid CURRENT/PREVIOUS restore creates a new revision; reset preserves geometry. Malformed-state recovery uses existing authenticated maintenance restoration into a new quarantined root. No arbitrary JSON import route. |
| Dependencies | P1-05 technical scope passed; P1-06 cross-user unmet and formal Phase-0 chain unaccepted. Parallel development approval is not prerequisite acceptance. |

Full V9 page parity remains P1-08, and installed release packaging/signing remains
its existing later scope. This diagnostic preference UI does not claim either.

## Final local/source-review checkpoint — 12:24 UTC

Author full pipeline **402/402** passed at 12:23 UTC. Independent full rerun
**402/402 desktop**, **109/109 foundation**, and **119/119 Python** passed;
no skips/cancellations were accepted. The quality gate caught the initial hydration
hook's incomplete dependency declaration; the corrected `useCallback` plus explicit
one-shot ref satisfies the unchanged rule and does not retry on later renders.
Exact build-output/main-admission inventory parity is now regression-tested.

Independent application and native-envelope source review is CLEAR. Remaining
hosted execution is **NOT_RUN**, including actual PowerShell/native COMMIT crashes,
CSP styling, screenshots and real Windows UI/reopen observations. This is source
clearance, not P1-07 technical acceptance or a new task-count disposition.

The automatic workflow keeps the generic source/foundation controls and a separate
fresh-checkout `owned-windows-settings` job. The historical full persistence/vault
workflow is preserved as manual-only; it is not silently considered passing against
migration 3 and must not be invoked for an unchanged identity retry. No current
settings report can satisfy the P1-06 cross-user requirement.

Fixed JSON publication has its own post-close written marker. PNG upload requires
a separate complete-four-image marker after all exact source/package Light/Dark
files are structurally validated and bound to report hashes/dimensions. A valid
FAIL JSON may be retained without uploading partial/unbound screenshots.

The native settings probes authenticate the schema-2 encrypted migration
prerequisite and observe schema-3 COMMIT/reopen. A separate new native schema-3
backup-to-restored-root roundtrip is **not claimed**: current schema-3 restore
coverage is actual SQLite plus synthetic-provider composition, while the underlying
native encrypted recovery mechanism retains its separately dated P1-05 evidence.
No genuine widget clicks, arbitrary power-loss durability, foreign-user success,
installed-release smoke or full V9 parity is inferred.

Coordinator approved the first bounded exact-head hosted execution at12:25UTC,
after independent source/workflow CLEAR. This authorizes only the reviewed settings
job/wrappers/owned captures and metadata-bound screenshots, with no identity
invocation. Actual results and canonical criterion disposition remain pending.

## Final publication candidate — 12:32 UTC

After the coordinator-approved startup geometry ordering correction, author and
independent full desktop pipelines passed **407/407**. Foundation109/Python119
remain unchanged independent PASS. Five additional dispatcher/composition tests
prove only a successful still-admitted GET enables native event observation, saved
maximized startup does not race hydration, and final shutdown capture remains
unconditional. Exact BUSY-only bounded verification reads never retry mutations;
the maximized native fixture chooses its normal rectangle inside actual workArea
and still requires exact reopen geometry. Source/envelope/YAML/diff review is CLEAR.
Root execution approval stands for this exact reviewed candidate; native results
remain NOT_RUN. This supersedes the402-test candidate, not its historical results.
