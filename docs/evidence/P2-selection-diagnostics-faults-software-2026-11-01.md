# P2-10 / P2-11 / P2-12 — selection, diagnostics and fault composition

**SOURCE CHECKPOINT PASS — 2026-11-01 03:33 UTC; canonical tasks IN_PROGRESS.** Coordinator Coder Bin approved
this finite internal source design at03:26UTC. Canonical task numbers and prerequisites
remain in the [Phase2 plan](../phases/PHASE-02-adb-device-fleet.md). Wireless is P2-04,
not P2-11; it remains disabled. This slice adds no IPC, V9 change, process/device
command, storage migration, real log export or task acceptance.

## Selection interface

A main-only controller keeps independent selected UUIDs, one active UUID and explicit
group membership under a revision. Replacement is exact-shape CAS with atomic budget
failure; budgets are supplied inspection bounds, not product fleet capacities. Single
control uses only the active target, never broadcasts to the selected set. Batch plans
snapshot the explicit selected/group members and verified current registry bindings.
A missing, offline, unverified or conflicted member refuses the entire plan, not a
silent partial dispatch. Serialized or forged VERIFIED snapshots cannot gain registry
provenance: the new predicate checks only the existing private in-process WeakSet.

Plans are immutable, capture selection and registry revisions and keep exact identity/
binding/generation/serial tuples. Same-controller current-plan checks reject plans
from another controller or an older selection revision. Changing selection never
rewrites a pending plan's targets. A plan is not an effect capability: future integration
must enforce current plan plus actor owner/current-registry/deadline at actual dispatch.
No such renderer/effect bridge is exposed here. Accounts focus/V9 integration and real
two-phone action evidence remain pending.

## Diagnostics interface

A pure encoder accepts only fixed command outcome/code/operation/health/timing fields.
It allocates per-instance pseudonymous device labels rather than exporting raw stable
device UUIDs, serials, IPs, paths, text or stdout. The bounded map never recycles a label
on exhaustion. The label limit and duration inspection cap are defensive bounds, not
product capacity or proof of observed device health. Command/correlation UUID origin
is a trusted-main precondition; the encoder is not an allocator or authentication layer.
Null duration remains missing, zero remains zero. Invalid inputs return only a fixed
rejection; no credentials or invalid data are echoed. No logger/file/archive/export
writer or persistent identity map is added.

Actual actor-result composition preserves both queued NOT_DISPATCHED/OUTCOME_UNKNOWN
and post-retirement DISPATCHED_UNCONFIRMED/BINARY_UNAVAILABLE without changing either
into a dispatched success. The reviewer caught these mapping omissions before source
closure. This does not establish a working per-device operator log surface or actual
export collision/disk-failure behavior.

## Fault evidence boundary

The tests compose the actual discovery/registry/actor implementations with supplied
synthetic process facts. Two independent device actors, explicit queued cancellation,
disconnect before dispatch/during completion, verified reconnect to the same logical
identity under a new generation/binding, and fresh work are checked without retargeting
or automatic replay. Unretired server loss latches uncertainty across new registry proof;
a replacement actor cannot evade the still-owned queue domain. This is not a physical
cable, server restart, live Unicode/input, Windows-device timeline or cleanup proof.

Focused author43/43 PASS (selection9, diagnostics8, fault composition4, registry16,
server-source/manual-gate6) and full strict TypeScript pass. Independent affected
selection/diagnostics17/17 and composition/workflow read CLEAR. Sole author desktop
aggregate completed03:33UTC: **711/711 + DESKTOP_SOURCE_CHECK_PASS**. A final test-title
only correction describes active-input fencing and queued cancellation accurately;
no behavior changed and no duplicate aggregate was run. Unchanged foundation109 and
Python194 reuse the preceding exact Windows source-job evidence; no local rerun.
The new checkpoint's hosted source run is pending publication. Ordinary pushes now
skip both development binary boundaries; no automatic unchanged server retry follows
this source work. Production
remains BINARY_UNAVAILABLE; physical/AVD gates, P1-06 cross-user UNMET and formal0 remain.

## Windows source capture limit and bounded batching correction

[Run41269799457](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41269799457)
at public `c5344b6c6c89eb177d71f1297f4b195ae67a633d` failed source batch2 with
TEST_PROCESS_CAPTURE_LIMIT / TEST_DIAGNOSTIC_INPUT_REJECTED. This is the unchanged
64KiB child-output limit, not an observed test assertion failure. Native development
was not invoked. The fixed batch exceeded its capture envelope on Windows. The evidence does not
distinguish normal TAP volume from a verbose assertion dump; smaller batches must
expose any underlying test failure rather than assume all tests passed.

The reviewed inventory is unchanged (88 files); batches are reduced deterministically
from16 to8 files, still sequential, with the same30-second/64KiB limits, exact complete
summaries, zero skips and fail-closed aggregate. Affected harness5/5 tests pass, including
every file exactly once and no partial success on capture/timeout/exit failure. No
source functionality, test omission, output-cap increase or exception relaxation.
The prior711 local aggregate is retained, not rerun solely for this scheduling change;
actual corrected Windows result remains pending publication.

## Windows checkout framing correction

Run41270182641 at public `71410f8dbe1e9da62bd8364b1a65e0c338470610`
exposed the underlying assertion: batch3 completed71 tests,70 passed and the manual
workflow-gate assertion failed. The checked-in YAML becomes CRLF on Windows; its
source-inspection regex expected LF. The assertion now normalizes only CRLF framing,
not workflow conditions. Both valid LF/CRLF forms pass; missing inputs, always-on
steps, true defaults and missing workflow-dispatch admission are rejected. Affected
server/source tests6/6 PASS. Review strengthened the existing substring assertion to bind each exact execution
step to its own opt-in; changing either single execution gate to always-on rejects. No product/runtime/workflow change and no repeated full local aggregate;
Windows confirmation remains pending. The existing-profile server refusal is unchanged.
