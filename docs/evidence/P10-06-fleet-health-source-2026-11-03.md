# P10-06 captured fleet-health source evidence

## Scope and base

2026-11-03 source-only increment under the independently adopted
[bounded entry](../phases/P10-FLEET-HEALTH-SOURCE-ENTRY.md). New `phase-10` starts
from exact public Phase09 `9befe4dcd936fc7b399af0e77190bb0e9a94e47d`, tree
`0f18da509e79c01a81d280e67cec54d4fe39c923`. Main, prior phases and V9 reference
remain unchanged. P10-06 is partial; no full task or Phase10 acceptance.

The actual FleetService response parser feeds an immutable internal projection.
Private snapshot identity binds registry/selection revisions, record count and
per-device ID/generation/state/verification to Tracking. This is consistency with
existing main validation, not new authentication or observation authority.
All counts name captured registry records, not live fleet census. Device registry
verification is explicitly not account login. Observation/verification timestamps,
metrics and freshness remain unavailable. No new IPC, collection, persistence,
export, dependency or command was introduced.

Selection pending retains existing captured shell rows/focus while the new health
binding and health-table rows are unavailable. Errors/reconciliation/revocation
clear health; revisions cannot roll back after failed requests. Synthetic UI data
cannot acquire an observed binding. Demo remains separate and explicitly synthetic.

## Review and tests

Design review CLEAR/adopted22:34 UTC before source. Initial implementation review
caught whole-shell pending clearing that lost monitor focus. The reviewed correction
keeps shell source unchanged and suppresses health only; effectful tests exercise
actual automatic window resize, ResizeObserver and dock-width changes while pending.
Final independent implementation review CLEAR22:44 UTC; reviewer reran18/18
focused tests and diff whitespace check. Frozen aggregate completed22:46 UTC:
`env -u NODE_PATH -u NODE_OPTIONS -u ESBUILD_BINARY_PATH node desktop/scripts/check.mjs`
PASS1820/1820 and DESKTOP_SOURCE_CHECK_PASS. All25 changed-file SHA256s matched
the pre-run freeze. This aggregate includes strict product/demo types, both builds,
manifest/graph and quality. Separate quality inventory PASS442 files with540
pre-existing informational diagnostics; no warnings/errors.

Focused integration18/18 PASS at22:43 UTC, with synthetic test fixtures only:
actual FleetService → wire parser → projection → Tracking, actual renderer async
requests/high-water/error/revocation/late delivery, shell identity and effectful
focus/resize, six states, both verification values, exact identities/revisions,
hostile descriptors, frozen copies, missing versus empty and fabricated-zero/time
checks. Workflow boundary negatives and exact map-size admission66048/rejection66049
are included. Product strict types, graph129 modules, product/demo builds and demo
strict types passed during preparation. Final quality is included in the frozen aggregate above.

Earlier attempts are not final evidence: a command without the required npm version
argument failed; map growth66042 exceeded prior65792 cap, now bounded66048 with
boundary tests. Demo runtime manifest and three transformed component/renderer
harnesses needed explicit new pure-module registration. One aggregate stopped on
runtime-version harness registration; a later mixed-edit aggregate stopped on
Overview-only verification harness registration. Both were corrected without
weakening assertions. An obsolete changed empty-state text was restored.

## Publication and retained gates

Published exact `766a675ff6aaa13bcf131fe1f697738ed2e53381`, tree
`d12c5119f5c6340b355cec43b68fc896716a689d`, parent
`9befe4dcd936fc7b399af0e77190bb0e9a94e47d`. Exact-head
[CI41734027573](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41734027573)
/source job126258436615 completed SUCCESS22:52 UTC. Coordinator independently read
SOURCE_HEAD,1820/1820 and DESKTOP_SOURCE_CHECK_PASS22:52:04 plus all five
source/captured/NOT_RUN/UNMET markers22:52:05. Hosted Windows2022 used pinned
Node24.22.1 with admitted npm11.19.1; local evidence used npm11.9.0.
The reviewed workflow is
phase-10-only, pinned actions, read-only contents, no persisted credentials/cache,
scripts-disabled dependency restore and finite timeout. It cannot activate native
campaigns. Hosted source output must be read before any PASS claim.

Actual Electron/window/browser screenshots, visual parity and physical/device tests
are NOT_RUN. P1-06 cross-user evidence stays UNMET. Existing independent legacy
workflow failure is not bypassed. No account-health metrics, freshness, analytics,
CSV/XLSX, native acceptance, full P10-06 or predecessor acceptance is established.
