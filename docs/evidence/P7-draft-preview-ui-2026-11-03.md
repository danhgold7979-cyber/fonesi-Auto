# P7 unsaved V9 draft preview UI

2026-11-03. Local base `270e17caadc1cd1e09601ae4e01d33a40ab6e7b8`
and public base `1eaa2b9cc5847c4bc7e888c8d3d106ba0d5241fb` share tree
`4df3b769a4b07bb631569ea91789ef2c1248dd0d`. This slice follows the
[reviewed finite source entry](../phases/P7-DRAFT-PREVIEW-UI-SOURCE-ENTRY.md).
Neither history is rewritten. Earlier bridge hosted closure edits are retained.

## Delivered scope

The existing Setup scheduling card now edits a local, explicitly unsaved civil
draft through the existing read-only preview port. Date selection is explicit;
Asia/Ho_Chi_Minh is the editable zone default. The three existing example times
are labelled editable unsaved defaults. Added slots are blank. Stable local UUIDs
survive retained edits; removing slots stages their exact identities/times and
requires acknowledgment. No automatic time distribution occurs.

Each edit changes the revision and clears results. Selection/workflow context
changes, cancellation and disposal fence old completion; local pending ownership
remains until the client promise settles. The existing client still retains its
native lease until invoke settlement. No mount/edit/navigation retries occur.
Closed validated responses must match draft identity, revision, zone and window.
Inputs survive failure. Preview returns original civil date/time, UTC and offset,
explicit skipped DST gaps, earlier overlaps, next/truncation coverage and exact
elapsed warnings. A 29-minute warning does not shift or reject the schedule.

The renderer imports only civil/wire validation at runtime, not the Temporal
resolver. Production root/shell pass the existing preview port; demo mode has no
native port and reports unavailable. Saving, bulk scheduling, collision policy,
comment timing, media-table mutation and jobs remain unavailable. No dependencies,
main/preload/IPC methods, native code or persistent data were added.

Exact registrations are131 modules,134 walked source entries and a68,228-byte
module map. Quality inventory increases by the four new source/test files; its
finite fixture bound is561 entries. Both new suites are explicitly registered;
normal/demo manifests include their required source/type dependency closure.
Existing next-entry/module denials remain tested.

## Validation and preserved failed attempt

Session resumed at22:08:59 UTC; repository remote and phase-07 identity verified.
Recovered uncommitted source was preserved, inspected and tested, not replaced.

- First focused command:50/51 PASS; the model suite correctly rejected the
  executor's inherited NODE_PATH with OVERRIDE_REJECTED. No project guard was
  relaxed. This was an environment precondition failure, not a passing run.
- Corrected focused command: `env -u NODE_PATH -u NODE_OPTIONS -u ESBUILD_BINARY_PATH
  node --test tests/schedule-draft-model.test.mjs tests/schedule-draft-panel.test.mjs
  tests/work-pages.test.mjs tests/ui-shell.test.mjs` from desktop: **64/64 PASS**,
  zero skips/cancelled/todo. Node24.22.1, npm11.9.0, Linux x64.
- Final uninterrupted aggregate: `env -u NODE_PATH -u NODE_OPTIONS
  -u ESBUILD_BINARY_PATH node scripts/check.mjs` from desktop: **1816/1816 PASS**
  and DESKTOP_SOURCE_CHECK_PASS at22:11:37 UTC. Includes metadata/dependency
  guards, graph, quality, strict source/demo compiler, normal/demo build,
  manifest and every registered test batch. No source edits followed this run.
- Additional exact graph invocation: MODULE_GRAPH_PASS131. `git diff --check`: PASS.
- Connected controller/client/admitted bridge/real evaluator fixtures cover
  UTC/offset, actual29/30-minute advisory, DST gap/overlap, truncation, immutable
  intent, invalid numeric/date/zone/slot input, malformed/mismatched responses,
  cancellation, stale/late completion, context change, unmount and effect rearm.
  Component tests are controlled hook/JSX fixtures, not browser interaction proof.

## Independent implementation review

Read-only review CLEAR at22:10 UTC: no actionable correctness, authority,
lifecycle or inventory blocker. Aggregate was not rerun by the reviewer to avoid
competing executions. Reviewed SHA-256 identities:

- Model: `d7117205cde139440f9cc1516baa09e794d9eeae2d2af29ab4a29068bd0e0b4f`
- Panel: `46cf45e5946267369e10af2b5e07cf4415559aeb92a3dc5ae8d3dc1409353b14`
- Model tests: `52841b3f0de4d659db736868b002e2ff4015c7cbe2c0e10a96bae5b5a3dfd87d`
- Panel tests: `83020ad390ad287bf5c7405114a16506781be98a70d9c05de04b7fc37af518e6`

## V9 source parity checklist and evidence limits

- PASS by source/test inspection: same shell, six navigation tabs, right monitor,
  four Setup cards, existing formgrid/slot-grid and unchanged content/calendar
  structures. Full canonical V9 HTML is retained unchanged.
- PASS by source/test inspection: preview action is explicitly unsaved, preserves
  original times, shows unavailable actions honestly and creates no jobs.
- NOT_RUN: same-viewport before/after Dark/Light screenshots, actual browser focus
  or layout behavior, and packaged Electron invocation of this new UI/IPC route.
  The installed Chromium attempt was previously blocked at OS singleton-socket
  creation with sandbox intact. That unchanged operation was not retried and no
  sandbox weakening or device/user-computer access was attempted.
- NOT_RUN: persistence, real queues/collisions, actual devices/accounts and
  end-to-end scheduled execution; these are outside this source slice.

Source milestone PASS. Visual/native acceptance remains open; fixed ledger
source6/47, integrated6/47 and technical acceptance0/13 is unchanged. Known
Phase0 desktop-stack failure and P1-06 UNMET remain unwaived. No main merge,
PR approval, device activation, private-data publication or new capability grant.
Publication and exact-head hosted verification are pending at this checkpoint.


## Publication and exact-head hosted closure

Published commit `80f3d15abb90b4f6565cd737b79ffbbf79c8f8a7` is a lease-checked,
non-force fast-forward of public1eaa2b9. Its tree
`158cf2b5d4305dcba9e80dcbc9cc9e81edce30f1` exactly matches local
`7b6c5c66214434cf84c7b47810b01f8158b7e673`. Parent, tree and public branch ref
were read back. Local and public histories are preserved; main is untouched.

[Scheduler source run41728928994](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41728928994)
completed SUCCESS on that exact push head. Job126240875926 logs verify checkout
80f3d15a and **1816/1816 PASS** plus DESKTOP_SOURCE_CHECK_PASS at22:17:06 UTC.
Dedicated native observation and report upload were both SKIPPED under unchanged
explicit gates. This is Windows source verification, not actual new UI/IPC
execution, a screenshot or acceptance of any deferred evidence.

Associated PR checks collector41728938754, SQLite41728938649,
telemetry41728938716 and secret restart41728938789 succeeded. The separate
legacy desktop-stack run41728938740 failed at install/launch with
RUNTIME_OR_CONTAINMENT_FAILED, runtime exit1, installer/runtime cleanuptrue.
It checked out merge b73bf76 (80f3d15a into main), not the direct phase head.
That known failure is retained and unwaived; no repair or runtime rerun is
claimed for this source slice.
