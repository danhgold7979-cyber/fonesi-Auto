# Software-first development with deferred hardware evidence — amendment 02

**ADOPTED 2026-10-31 13:10 UTC.** Proposed13:08, independently reviewed and explicitly
adopted by the coordinator under the user's latest software-first direction and delegated
planning authority. This document does not accept a phase, create a branch, grant
device access or change any test result.

## Direction and preserved baseline

The user asked whether software work can continue into later phases and phones can
be connected later, noting this session cannot directly access their computer.
The coordinator acknowledged software-first development, with hardware tests still
NOT_RUN and no claim of 100% release readiness. This proposal makes the distinction
explicit rather than silently ignoring the sequential plan.

The original [Phase 0 plan](PHASE-00-feasibility.md), SHA256
`3882e2112129fdc0dcdc69104195cc95d8f90c933a210c9002cd16642873316c`, remains byte-identical.
Its physical-device/host gates, C-07, HC-09/HC-13 and all historical failed/unrun
results remain open. A mock, replay, emulator or hosted Windows runner is not a
physical-device or user's Windows-host acceptance substitute. Existing scoped
[Phase 1 source exceptions](PHASE-01-PROVISIONAL-SOURCE-AMENDMENT-01.md) remain historical;
this amendment supersedes only their development-entry restriction where stated below.

## Development entry, not acceptance or activation

After adoption, the coordinator may approve the next canonical phase's bounded
software implementation plan before predecessor hardware acceptance/merge, provided:

1. The specific task IDs, software dependencies, unresolved hardware assumptions and
   required eventual real-device tests are mapped before implementation. No new task
   denominator or fictional completion percentage is created.
2. Implementable software prerequisites are actually built/reviewed/tested. An absent
   dependency is exposed through an explicit unavailable/disabled typed boundary,
   not a fake-success adapter. Pure contracts, mock-only fixtures, desktop UI, owned
   packaging and repeatable software integration may proceed where independent.
3. Each checkpoint retains normal strict compiler/lint/tests, provenance, security
   review and exact-head evidence requirements. Hardware deferral does not waive
   software defects, unsafe authority, secret handling, concurrency/fencing or recovery.
4. Physical/device/target-host-specific rows are explicitly `NOT_RUN — HARDWARE_DEFERRED`;
   known failures remain FAIL, and unrelated unmet criteria remain UNMET. In particular
   P1-06 cross-user protection is currently UNMET, not a hardware test silently passed
   by this amendment. Existing identity-execution restrictions remain unchanged.
5. Live device effects, real account/credential use, posting/scheduling, host installation
   or privileged changes require their own already-applicable approved admission. A
   future implementation plan does not authorize executing those operations here.

Only one development phase is active at a time by default. Move on after its software
scope is mapped and reviewed, carrying an explicit unresolved-evidence ledger, rather
than claiming formal phase completion. Same-phase independent parallel work remains
subject to the recorded exception rules. Full V9, canonical requirements and rollback
obligations are not replaced by mocks or a reduced product.

## Branches and main remain honest

Preserve one clearly named `phase-NN` integration branch per phase. Do not create
future branches merely to reserve names. On an explicitly approved later software
entry, the next branch may be based on the exact reviewed predecessor development
checkpoint, with its base SHA/tree and all inherited unaccepted gates recorded.
This is a deliberate development-branch exception to the accepted-main prerequisite
in the [Git workflow](../09_GIT_WORKFLOW.md), not permission to merge unaccepted work.
The prior phase branch is preserved; no history rewrite, force-push or deletion follows.

`main` remains restricted to explicitly fully accepted phase milestones under the
user's existing merge direction. Publication/CI success/software readiness is not
merge approval. When delayed hardware evidence becomes available, fixes and evidence
must be traced to the affected phase/descendant branches before formal acceptance;
do not rewrite older evidence to imply tests ran earlier.

## Deferred evidence ledger and eventual handoff

Keep a bounded task/criterion ledger with: canonical ID; software evidence/head;
remaining exact test; required host/device/profile; why deferred; safe operator steps;
expected result; and current status. Record simulator/fixture limitations beside each
result. Do not require immediate phone connection merely to continue independent code.

When a suitable authorized Windows test environment and devices are available, provide
reviewed operator instructions or an owned bounded collector. The user may run them
locally and return sanitized evidence; do not imply this session has remote control.
Use two physical devices and the approved AVD matrix where canonical C-07/Phase 2 calls
for them. Emulator evidence is separately labelled and never closes physical-only rows.
No emulator/ADB installation, acceleration/security change, device connection or host
access is authorized by this planning amendment itself.

Before full-tool/release acceptance, close the retained hardware/support and real
integration gates, security negatives, recovery/ownership handoffs and canonical phase
exits. P1-10 must close the known failed-normal-launch retained-lease recovery usability
gap; P1-08 owns its UI handoff. Neither is erased by P1-07's bounded actual-main recovery.
Until then report **software development progress**, **technical scope verified**, and
**formal/release readiness** separately; never call the tool fully verified or ready
for unsupported devices/hosts.

## Adoption record — 13:10 UTC

Coordinator explicitly adopted the independently CLEAR proposal with pre-adoption
SHA256 `8db2d46bfae6d528e6b4015205b7c1e8a90b9c2353dbf8dbfa5579595314426c`.
The development-entry and branch-base exceptions above supersede the default
predecessor-acceptance restriction only for separately reviewed/approved software
plans; acceptance, main merge, activation and hardware evidence rules remain intact.
Current phase remains Phase1/phase-01; no future branch is created. P1-08 planning
may proceed read-only while P1-07 native recovery runs; code entry still requires
its bounded disposition and reviewed V9 scope. The first later-phase plan/base will
be recorded when that entry is actually authorized, not fabricated now.
Current governance headers link this record; all original baseline/history is retained.
