# P3-09.C owned-window hidden decoder source evidence

Date: 2026-11-03 UTC. Branch: `phase-03`, base
`2b5085939184ccd0b6c4088186f5993904572f3d`. Repository and origin verified as
`danhgold7979-cyber/fonesi-Auto`. Source entry was adopted at 23:05 UTC in
[the bounded contract](../phases/P3-HIDDEN-DECODE-SOURCE-ENTRY.md).
This recovery/verification session started at 23:25 UTC. Existing uncommitted
work was inspected and preserved; earlier focused logs were not treated as fresh
validation. Only Phase03/Phase10 are active. Main and existing history remain intact.

## Implemented application behavior

- The captured main-owned BrowserWindow provides visibility and ownership. Hide,
  minimize, show, restore and closed events re-read getters; blur is not a signal.
  Foreign, destroyed, replaced or unavailable owners fail closed. Subscription
  occurs before initial read and partial listener installation is rolled back.
- Private port v2 carries ordered presentation fences and media epochs. Public
  START/STOP, port metadata and native media framing remain v1. Initial VISIBLE is
  acknowledged before any coalesced HIDDEN fence and native begin. One pending
  fence, latest desired state and pending delivery remain bounded.
- Hidden decoding releases pending/held frames, clears canvas, retains only the
  latest validated configuration and validates/drains encoded media. No hidden
  support check, decoder construction or decode occurs. Resume drains DELTAs and
  pre-frontier keys until a later validated IDR, without a new native reservation.
- Startup, pending-media and fence deadlines never pause. After a genuine paint,
  hide preserves only the remaining visible draw budget. Epoch changes, CONFIG,
  hints and consumption cannot replenish it. Only current eligible paint renews.
- Decoder operations own their generation/epoch/config tokens. One unresolved
  support check remains reserved through invalidation; stale resolution cannot
  steal a new operation. Held work is admitted and accounted once. Reentrant
  close/fence callbacks retain its exact once-only consumption acknowledgment.
- Renderer routes the captured port, sends document visibility only as a hint,
  exposes PAUSED_HIDDEN/WINDOW_HIDDEN and WAITING_FRESH_KEY in existing status
  space, and removes its observer on terminal paths. Pagehide/unmount remain Stop.
  Local preview accounting adds a hidden discard count and keeps conservation.

## Review findings repaired before publication

Independent decoder and bridge reviews found and reproduced: stale output erasing
a newer restored canvas; hide before READY producing an invalid initial HIDDEN
fence; and partial observer installation leaking listeners. Recovery also repaired
nested-fence held-delivery acknowledgment loss and clearing after a reentrant draw
that throws. Regression tests exercise each behavior against application source.
Final source reviews returned CLEAR; this is source review, not product acceptance.

The aggregate first stopped at quality fixture inventory: two real protocol files
raised the measured active filesystem entries from 564 to 566. The finite bound
increased from 566 to 568, retaining exactly one owned directory/file fixture pair
and a test rejecting entry 569. No parser, lint, warning, traversal or source-size
guard was disabled. A second aggregate exposed the older transformed renderer
fixture's missing real private-protocol import; its exact module map was extended.
Both failures are recorded rather than represented as initial passes.

## Validation on this session's final source

Environment: disposable Linux x64, Node 24.22.1, npm 11.9.0, Python 3.12.14. No user
computer, phone, account, ADB session or provider was accessed.

- Focused application suites: `env -u NODE_PATH node --test --test-reporter=spec
  desktop/tests/video-decoder.test.mjs desktop/tests/video-stream-bridge.test.mjs
  desktop/tests/video-presentation-contract.test.mjs
  desktop/tests/settings-renderer.test.mjs desktop/tests/module-graph.test.mjs`
  **204/204 PASS**: decoder79, bridge46, protocol5, renderer47, module27.
- Quality boundary fixtures: `env -u NODE_PATH node --test --test-reporter=spec
  desktop/tests/quality-tool.test.mjs` **13/13 PASS**.
- Transformed Help/disk renderer plus preload regressions: `env -u NODE_PATH node
  --test --test-reporter=spec desktop/tests/runtime-version-integration.test.mjs
  desktop/tests/settings-preload.test.mjs` **11/11 PASS**.
- Foundation: `env -u NODE_PATH node foundation/scripts/check.mjs 11.9.0`
  **109/109 PASS**, including bootstrap, boundaries, strict compile and hygiene.
  First attempt was BOOTSTRAP_FAILED because dependencies were absent. The reviewed
  pinned closure was restored scripts-disabled from the existing npm cache, with
  metadata verification and no network/package changes, before the passing rerun.
- Python: `python -B -c` with unittest discovery of `desktop/verification/test_*.py`,
  failure on skips or test failures: **383/383 PASS**.
- Synthetic qualifier build: `env -u NODE_PATH node
  desktop/verification/build-video-decoder.mjs 11.9.0`: **PASS**. No runtime launch.
- Final aggregate `env -u NODE_PATH node desktop/scripts/check.mjs` completed at
  23:34 UTC: **1944/1944 PASS**, `DESKTOP_SOURCE_CHECK_PASS`. This includes pinned
  metadata/dependencies, module graph, lint/format, strict compile, production and
  demo builds, source manifest and the complete current desktop test inventory.
  Recovery through this source gate elapsed approximately nine minutes; earlier
  implementation time is not inferred from this session's elapsed time.

The joined bridge/decoder test uses authored 32x32 AVC, actual decoder validation,
actual port acknowledgment/paint messages and fake native WebCodecs bindings:
paint, hide, 12 hidden media deliveries, show, DELTA drain, later IDR paint. It
proves one reservation/begin, no hidden support work and no duplicate CONSUMED.
It does not prove Electron scheduling, GPU presentation or phone capture timing.

## Remaining gates and coverage

Exact-head Windows source CI is pending publication at this checkpoint. Real
Electron hide/minimize/restore and background throttling, equal-viewport V9
Dark/Light visual parity, native decoder/provider integration and device evidence
remain **NOT_RUN for this new behavior**. Offscreen/CSS/filtered/obscured tiles,
automatic restart, keyframe requests and Auto/Manual stream-pressure policy are
outside this bounded entry. No native producer, actor, target or settings authority
changed. Existing legacy desktop-stack runtime failure and P1-06 UNMET remain.

This is a subset of P3-09.C, not full C-cell completion. Fixed ledger remains
N71/S5/I24: source-covered29/100, integrated24/100, technical task acceptance0/19.
No new full-cell credit, whole-task/Phase acceptance or hardware/release claim.
