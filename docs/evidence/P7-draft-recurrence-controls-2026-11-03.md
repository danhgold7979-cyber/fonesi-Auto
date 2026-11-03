# P7 unsaved recurrence controls

2026-11-03. Local base7b6c5c6/public80f3d15a share tree158cf2b5.
[Reviewed source entry](../phases/P7-DRAFT-RECURRENCE-CONTROLS-SOURCE-ENTRY.md)
adopted22:18 UTC. This is an extension of the existing unsaved draft preview,
not persistence, job generation, policy admission or an external action.

## Delivered source

The existing V9 Setup form now chooses one selected date, explicit ISO weekdays,
or every N days. ONCE retains all slots on its active date. WEEKDAYS requires
at least one explicitly selected weekday, stores unique numeric ascending values
and anchors eligibility to the start date. Mode changes preserve slot identities,
entered times, weekday selections and the inactive raw interval. Invalid retained
intervals do not block modes that do not use them.

Optional inclusive end-date and planned-occurrence maximum fields pass through
the existing closed civil/preview API. Blank means null. Invalid raw values remain
visible; nothing is coerced or silently clamped. Both bounds stop at the first
reached. The maximum counts planned slots, including skipped DST times, without
replacement occurrences. Preview-window366-day/128-row limits remain separate
from schedule intent; a numerical representation bound is not a posting quota.

Every new edit participates in the existing revision/cancel/stale-result/context
and disposal rules. No automatic request or retry is introduced. Successful
results show the selected rule and bounds beside existing UTC/DST/truncation/gap
facts. Error prompts now include the new inputs. The weekday fieldset/legend is
semantic and uses only scoped default-spacing resets and14px checkboxes; global
V9 CSS, shell, navigation, monitor and other cards are unchanged.

Only four existing source/test files change. No new module/dependency, map/graph
or quality-inventory expansion, main/preload method, Temporal renderer import,
new storage/queue/device/account authority or native code. The complete V9
reference remains unchanged. Production still cannot save or schedule jobs.

## Tests and retained corrections

- Source strict TypeScript and exact graph131 PASS before integrated tests.
- Existing19 model/panel cases PASS after initial implementation.
- Seventeen new cases bring the focused suites to36/36 PASS, zero skips,
  cancelled or todo. These include connected actual controller/client/admitted
  bridge/real evaluator ONCE, weekdays/anchor, every-N, inclusive end, within-day
  maximum, first-bound wins and DST-gap planned-count behavior; invalid raw
  bounds; mode-switch identity/input retention; new-edit pending/staged-removal
  fences; UI result summary and all seven checkboxes.
- Initial implementation review found inherited `.field input` width100% would
  stretch weekday checkboxes. A scoped width14px repair and seven-input assertion
  corrected it without global CSS changes.
- First aggregate stopped at QUALITY. The new div role=group needed a semantic
  fieldset, and the expanded error text needed final formatter wrapping. Both
  were corrected, not suppressed. Added fieldset/legend/default-spacing tests.
- Final focused36/36 and scoped/full quality checks PASS. Independent reviewer
  reran the focused36/36 after correction. `git diff --check`: PASS.
- Final uninterrupted desktop aggregate at22:25 UTC: **1833/1833 PASS** and
  DESKTOP_SOURCE_CHECK_PASS. This includes guarded dependency metadata, full
  graph/quality, strict source/demo compile, normal/demo builds, manifest and all
  registered test batches. No source edits followed this aggregate.

Commands use Node24.22.1/npm11.9.0/Linux x64 in the disposable source environment.
The inherited external NODE_PATH is removed for guarded project commands:
`env -u NODE_PATH -u NODE_OPTIONS -u ESBUILD_BINARY_PATH node scripts/check.mjs`
from desktop. Focused command substitutes `--test` and the two
`tests/schedule-draft-{model,panel}.test.mjs` paths.

## Independent implementation review

Final review CLEAR at22:24 UTC after semantic/checkbox fixes and focused test
rerun. No remaining source blocker or expanded authority. SHA-256:

- Model: `78c4df0557845c4011a7cdc62f8948ae4ed8a95fbf7e5a3b0f99558a39f91bc6`
- Panel: `0b02c65ea2fc86243851d3aa4ad3a46f94358fedd3681f6521371f6d22499a54`
- Model tests: `48674127570944b8636c09cffc534b61bf6f2e26ea48bcdf80512496f84442c1`
- Panel tests: `38318da704281f4e41558ee2b639e28678bfcb037160001bb898ab744ae78154`

## Boundaries and remaining work

Code-first continuation deliberately does not start a new native or visual
campaign. Dark/Light before/after screenshots, actual browser interaction and
packaged Electron UI/IPC execution remain NOT_RUN. Hook/JSX and connected Node
fixtures do not close these gates. No device or user-computer access occurred.

Persistence, immutable jobs, collision/queue/principal leases, calendar mutation,
row overrides and product/capability posting-maximum admission remain unfinished.
Source milestone PASS. This slice does not complete a fixed ledger cell; source6/47, integrated6/47 and
technical acceptance0/13 remain unchanged. No known failure or P1-06 UNMET is
waived. Main and existing history remain preserved. Publication and exact-head
hosted source verification are pending for this increment.
