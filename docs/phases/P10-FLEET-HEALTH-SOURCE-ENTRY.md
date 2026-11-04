# P10-06 bounded internal fleet-health source entry

Proposed 2026-11-03 22:33 UTC; independently design-reviewed CLEAR and adopted
by the delegated coordinator at 22:34 UTC before production edits. This supplements the historical
[Phase10 draft](PHASE-10-tracking-reports.md) under adopted
[Amendment02](SOFTWARE-FIRST-HARDWARE-DEFERRED-AMENDMENT-02.md), not full approval
of P10-01..09 or acceptance of predecessor phases.

## Base and dependency boundary

New isolated phase-10 starts from exact public Phase09
`9befe4dcd936fc7b399af0e77190bb0e9a94e47d`, tree
`0f18da509e79c01a81d280e67cec54d4fe39c923`, reverified 22:32 UTC. Phase07 is
source-frozen at public `23cb79b7511881a4a764bcded80093fc39f5d4d5`, with hosted
source run41730831678 PASS1833/1833 reported by its owner, not inherited into this
base. Existing branches/main/history remain unchanged. Coordinator limits source
work to at most two phases; this lane replaces closed Phase07/Phase09 source work
while another lane owns Phase5/6 recovery. No concurrent shared-worktree edits.

Existing main FleetService rejects synthetic registry/bindings and only projects
OBSERVED for ADB_DISCOVERY. FleetSnapshot validates immutable device ID, generation,
label, state, verification, registry revision and selection revision/members. It
has NO observation or verification timestamp. Its authority is a captured registry
record, not a live fleet census, current account login or fresh identity guarantee.

## Exact scope and semantics

Add a closed immutable internal health projection from the existing validated
FleetSnapshot and connect the actual renderer → shell → Tracking composition.
Retain registry/selection revisions and each device's generation, state and device
verification. The source label is existing main fleet projection (OBSERVED), not a
new collector or claimed wire timestamp/source field. No new IPC/collection,
authority, persistence, dependency, command, metric, threshold, export or remediation.

Tracking's health table keeps its existing all-loaded-device scope. Counts explicitly
mean records in that captured scope; any displayed filtered counts name their scope.
Phone/network/account controls keep existing behavior; phone selection continues to
focus the right monitor. Device verification is shown separately from connectivity,
explicitly attributed to the registry; no account login inference. Battery, storage,
transport, stream, accounts, media, jobs and platform analytics stay unavailable
without a real source. Unknown scopes show unavailable, never zero. An observed empty
scope may show zero records, not zero measured devices/metrics.

Loading/error/unavailable clear health rows; synthetic/demo input cannot acquire
observed health. The shell must bind any health data to the same admitted READY
MAIN_OBSERVED snapshot, not trust separate props after rejecting its snapshot.
Response sequencing/revocation and registry/selection rollback must not show older
or wrong-device data. No observation/verification time exists; show time unavailable,
never Date.now/receipt/render time as a measurement and never invent freshness.

## Files, checks and rollback

Expected changes: one read-model module under desktop/src/ui, renderer.tsx,
ui-shell.tsx, primary-pages.tsx, ui-model.ts if needed, focused integration tests,
exact module/build/demo/quality/test inventories only as needed, a narrow source-only
phase10 workflow if existing triggers omit it, and linked scope/evidence/status docs.
No CSS geometry/navigation redesign; preserve complete V9 HTML unchanged.

Tests exercise actual FleetService → validated snapshot → model → Tracking, all six
states and both verification states, exact revisions/IDs/generation, immutable closed
outputs, hostile/unknown descriptors, unavailable and synthetic sources, known empty
versus unknown, selection/focus changes, failed and late responses, no cross-device
leakage, invented zeros or timestamps. Test fixtures are explicitly synthetic test
inputs, never production demo injection. Run strict product/demo types, both builds,
manifest, exact graph, quality and full desktop aggregate with clean child env.
Review actual limit failures rather than widening checks blindly.

Source-only CI may mirror reviewed phase09 source workflow with exact phase10 guard,
pinned actions, contents:read, no credentials/cache/artifacts, scripts-disabled restore,
finite timeout and explicit NOT_RUN/UNMET markers. No native campaign activation.
Independent implementation review precedes commit/publication. Verify remote parent,
tree/ref and exact-head terminal CI; retain independent legacy workflow failures.
Rollback is the reviewed source delta only, no schema/data migration or history rewrite.

## Retained gates

P10-06 is a partial device-health source contribution, not full task/Phase acceptance.
P10 account health, alert policy, permitted analytics, freshness, CSV/XLSX and prior
formal phase exits remain open. P1-06 cross-user proof stays UNMET. Actual Electron,
browser/visual/screenshots, target Windows and physical/device campaigns are NOT_RUN,
deferred by the user's source-first direction; no visual parity PASS is inferred
from static/React tests. Later authorized same-viewport V9 comparison and real-device
integration must verify this exact source before visual/physical acceptance.

## Design review adoption — 22:34 UTC

Private identity binding joins frozen UI and health projections from one validated
copy; it is internal consistency, not cryptographic source authentication. Preserve
revision high-water marks across errors/null clearing and reject either revision
rollback. Pending/revoked/error views have no health; absent account sources must
not display zero. All source-only CI controls and deferred gates above remain.

## Implementation review correction — 22:43 UTC

Independent review rejected clearing all captured shell rows during selection
pending because it discarded right-monitor focus. The adopted smaller correction
preserves existing captured READY rows/selection/focus while omitting the private
health binding during pending. Tracking keeps its phone picker but displays no
health rows/count/source/verification until an admitted response completes. Existing
shell lifecycle stays unchanged, including automatic resize. Initial loading and
terminal errors/reconciliation/unavailable still have no health. This does not
promote captured rows to fresh observations or unblock pending commands.
