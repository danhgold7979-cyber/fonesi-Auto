# P7 read-only draft preview bridge

2026-11-03. Base local `b483708bd68c92106b8a0b04f0039035dda6b876` and published
`981ce632b6d571a2c7a00b76999e907ffd85f487` have identical tree
`54ff929b6a4fe4d4434a070e5d78aa27dace2ae2`. Neither history is rewritten.
The [reviewed source entry](../phases/P7-DRAFT-PREVIEW-BRIDGE-SOURCE-ENTRY.md)
binds this one functional cluster. Phase6 is untouched.

## Delivered source

The explicit sandboxed `window.scheduleDraft.preview(input)` capability accepts
only a closed unsaved civil draft and local draft identity/revision. Its fixed
`foundation:schedule-draft:v1` handler uses the existing trusted main-view
admission and actual unbound timezone/gap evaluator. It cannot save, queue,
identify an account/device, dispatch, choose an arbitrary callback or accept
caller-supplied UTC occurrence timestamps. The UTC timezone is valid. No automatic preview or UI control is added.

Canonical JSON request and response envelopes are capped at128KiB UTF-8. At
most128 rows and366 inclusive days are admitted without silently clamping. The
civil model's existing1440-slot representation remains unchanged. Descriptor-safe
snapshots, immutable nested structures, fixed failures, response correlation and
closed output bounds protect the boundary. No universal proxy detection or
second timezone engine is claimed. The output parser checks structural and gap
warning consistency; the real main evaluator remains the runtime authority.

The client shares the existing7-ordinary/8-total invocation budget and retains
its one outstanding slot and native lease until settlement, even after the
2-second delivery deadline, explicit cancel or disposal. Cancellation before
readiness prevents native dispatch. Cancellation after dispatch suppresses
late delivery; it does not claim to interrupt synchronous computation. Main
rechecks the admitted view before and after computation and releases in finally.

Build registration is exact:129 source modules,132 walked source entries,
67,564-byte module map,555 quality-corpus entries with a557-entry fixture limit,
and three explicitly registered test suites. Boundary tests still reject the
next unregistered module/entry. No dependencies, package lock, native helper,
persistence or V9 visual source changed. Built preload contains the civil schema
and closed wire validator but no Temporal or live Node timezone engine; main
contains the real resolver.

Scheduler CI push paths now cover desktop/**, foundation/**, biome.json and its
own workflow. The exact phase-07 branch, read-only token and explicit runtime
observation input/commit-marker conditions remain unchanged. This repairs the
previous source-only push coverage gap without automatically invoking Electron.

## Validation and retained iteration history

- Contract worker:18/18 focused tests and strict TypeScript PASS.
- Graph129, strict compiler and normal build PASS before the integrated suite.
- First combined focused run:32/33 PASS. One overbroad built-preload assertion
  rejected the legitimate `DST_GAP_SKIPPED` response discriminant. The assertion
  was corrected to forbid live resolver/Node/Temporal code, not vocabulary.
- First full aggregate stopped at QUALITY: two new test callbacks returned the
  expression supplied to `forEach`. Both use `for...of` now; lint was not waived.
- Initial manual graph invocations first lacked the required npm-version
  argument and then exposed a generated map that replaced duplicate node:crypto
  imports instead of merging bindings. Both preparation failures were corrected
  before the first passing graph/build. No dependency or policy bypass occurred.
- Independent implementation review requested connected client→admitted handler
  →real evaluator→validated response coverage. The connected fixture was added,
  alongside detached mutation, real29/30/DST/truncation, untrusted/revoked
  sessions, payload/row/horizon bounds, retained lease/slot, timeout/cancel,
  readiness cancellation, sync exception, late settlement and correlation cases.
- Second full aggregate stopped at batch15: an older transformed-preload fixture
  lacked the two new imports, and a civil-leaf test allowed only the zone consumer.
  The fixtures now load the actual draft modules, verify the frozen surface and
  shared budget, and permit only the added draft-contract consumer. The old
  timezone test title now describes its actual no-direct-UI-import assertion.
- Final targeted seven-suite integration run:73/73 PASS, zero skips/cancelled/todo.
- Third aggregate reached batch23, where the earlier exact workflow-path test
  still expected the old harness-only list. Its exact expectation now matches
  the reviewed source paths; the unchanged observation/upload predicates are
  still compared exactly. Added fixture cases show ordinary source pushes do
  not observe runtime. The focused runtime/workflow suite passes35/35.
- Final uninterrupted aggregate at21:42 UTC: **1796/1796 PASS**, zero failures,
  skips/cancelled/todo, followed by `DESKTOP_SOURCE_CHECK_PASS`. This includes
  graph, full quality, strict source/demo compile, normal/demo build, manifest
  and all registered test batches. No code changed after this aggregate.

## Evidence limits

This is source and Node composition evidence, not actual invocation of the new
IPC in packaged Electron, a screenshot of a V9 schedule form, persistence,
queue/restart behavior or device execution. Those remain NOT_RUN/unimplemented
where applicable. The prior production Electron campaign41493281269 remains
historical evidence for its exact sources, not this new bridge. Old independent
Phase0 desktop-stack workflow failures are retained and not waived.

Ledger unchanged: source6/47, integrated6/47, formal technical acceptance0/13.
No phase merge, main update, PR approval, credential/security change, private-data
publication or device use is part of this batch.

## Independent implementation review

Review CLEAR at21:38 UTC after the connected fixture and existing preload
regressions were corrected. Final source SHA-256 identities:

- Contract: `1d2e49a1662f6ea6cfa98bcf087c3925a8fac248de007149fd2c8ef14336ebd7`
- Client: `702a1b9f5ee3487f7527cb9a1572ebb9acb273914de2719331bbabc32103645a`
- Bridge: `e803c67a4ff659ac0328b5675d1e334997d50b251dac19041455a9716b89cec2`
- Connected bridge test: `0b8e41185ad4dcd40d027d548fa68cae0536db1c75fbbf6f01a21a329e1a3725`

The reviewer found no remaining code blocker. The wording now distinguishes
caller-supplied UTC occurrence timestamps (not accepted) from the UTC timezone
(valid). Review does not establish packaged Electron execution.

Narrow independent workflow-regression review is also CLEAR at21:41 UTC,
SHA-256 `c386a74bef7531a665d51ac937c3f309e558602c39bc83985568e2b6ed412dd3`.
Exact source paths, slash-bounded directory matching and unchanged native gates
remain checked. No source runtime result was inferred from these fixture tests.

## Publication and exact-head hosted closure

Published commit `1eaa2b9cc5847c4bc7e888c8d3d106ba0d5241fb` is a
lease-checked, non-force fast-forward of `981ce632b6d571a2c7a00b76999e907ffd85f487`.
Its tree `4df3b769a4b07bb631569ea91789ef2c1248dd0d` exactly matches local
`270e17caadc1cd1e09601ae4e01d33a40ab6e7b8`. Both local history and public
history are preserved; neither was reset or rewritten. Remote ref and fetched
object identities were read back. Main remains untouched.

[Scheduler source run41724632904](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41724632904)
is SUCCESS at exact public head1eaa2b9 on a push, not a pull-request merge.
Job126226081973 logs verify the exact checkout and **1796/1796 PASS** plus
`DESKTOP_SOURCE_CHECK_PASS` at21:48 UTC. The dedicated observation package and
report upload were both skipped under the unchanged explicit gates, as intended.
This closes Windows source verification, not actual new IPC execution in Electron.

Associated PR checks for telemetry41724644132, secret restart41724643979,
collector41724643803 and SQLite41724643702 succeeded. The separate legacy
desktop-stack lab41724644127 still failed at install/launch with
`RUNTIME_OR_CONTAINMENT_FAILED`, runtime exit1, and installer/runtime cleanuptrue.
It executed PR merge `d299de6e65f0fb189c52674a24ca644c351a5f0a`, not the direct
phase head. This known failure family remains visible and unwaived.
