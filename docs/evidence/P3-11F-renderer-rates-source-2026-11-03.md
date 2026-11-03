# P3-11.F captured renderer-rate source evidence

Date: 2026-11-03 UTC. Source entry prepared at 23:45 UTC and independently adopted
23:48 UTC in [the bounded contract](../phases/P3-RENDERER-RATES-SOURCE-ENTRY.md).
Repository/origin verified as `danhgold7979-cyber/fonesi-Auto`, branch `phase-03`.
Public base `602e8f93b67d436b3de302929ccf32c38a8c40da` and local base
`08dbfaba782d280e6391554f076c1960698d66f5` have identical reviewed tree
`ce6f2d3e7ade5320eebc4223a4353fa87c676e8d`. Prior hidden-decoder hosted closure
edits are preserved in this meaningful source publication. Only P3/P10 are active.

## Bounded application behavior

- Actual decoder admission counts validated KEY/DELTA AVC payload bytes exactly
  once, after wire identity/order/PTS and full current-config AVC checks. Hidden,
  waiting-key and held media count; SESSION/CONFIG, invalid/duplicate media and
  private wire framing do not. No bytes are retained for telemetry.
- Immutable accounting includes the private video UUID and current decoder
  invalidation generation. The snapshot exposes this same segment without a
  clock call. Checked counter/byte overflow disables accounting only; it cannot
  change media consumption, drawing, ACKs, native calls or deadlines.
- Pure interval calculation validates exact ordinary data fields, safe cumulative
  counters, frame conservation, video/segment identity and a strictly positive
  monotonic interval below the existing 5000 ms observation-freshness policy.
  Current pending/held/outstanding gauges may decrease. Missing, invalid or stale
  observations are UNKNOWN, while an actual idle interval may truthfully be zero.
- Two explicit preview accounting reads capture actual canvas draws/s and AVC
  payload bits/s, displayed as decimal Mbps. One baseline and result are retained;
  no new timer, polling, per-packet clock, per-frame React update or public IPC.
- Owner, decoder instance, device generation, registry revision and current
  segment fence observations. Stop, failure, replacement, panel close, lifecycle
  teardown and segment transitions clear them. Port routing invalidates captured
  UI immediately after CONFIG advances, even while capability work is pending.
  Existing UiShell panel-incarnation fences reject old close/reopen handlers.
- Existing V9 panel structure remains. Labels state RENDERER_CANVAS /
  RENDERER_INTERVAL, CAPTURED/not-live, units and interval. Native/effective FPS,
  bitrate, native drops and GPU/physical presentation remain UNKNOWN.

## Review and verification

Independent source review returned CLEAR at 23:54 UTC for the final decoder,
renderer, tests and bounded documentation. Local validation finished at 23:55 UTC.
Exact-head hosted verification remains pending at this publication checkpoint.

Observed so far in disposable Linux x64, Node 24.22.1, npm 11.9.0 and Python 3.12.14:
- Decoder focused suite: 89/89 PASS, including exact once-only byte admission,
  hidden/waiting/held handling, strict interval schema, safe arithmetic, decreasing
  gauges, segment changes and successful/failed reentrant draw semantics.
- Combined actual-source focused suites: `env -u NODE_PATH node --test
  --test-reporter=spec desktop/tests/video-decoder.test.mjs
  desktop/tests/settings-renderer.test.mjs desktop/tests/ui-shell.test.mjs
  desktop/tests/video-stream-bridge.test.mjs
  desktop/tests/video-presentation-contract.test.mjs
  desktop/tests/runtime-version-integration.test.mjs
  desktop/tests/module-graph.test.mjs`, **272/272 PASS**: decoder 89, renderer 59,
  shell 36, bridge 46, presentation 5, Help/runtime 10 and module graph 27.
  Final independent reviewer separately reran decoder 89 and renderer/shell 95,
  all PASS. No existing regression test was removed.
- Foundation: `env -u NODE_PATH node foundation/scripts/check.mjs 11.9.0`,
  109/109 PASS, including strict typecheck, boundaries and hygiene.
- Python verification unittest discovery with `-B`, refusing skips: 383/383 PASS.

- Full aggregate: `env -u NODE_PATH node desktop/scripts/check.mjs`,
  **1966/1966 PASS**, `DESKTOP_SOURCE_CHECK_PASS`. Includes dependency metadata,
  exact module graph, lint/format, strict production/demo TypeScript, both builds,
  source manifest and complete current desktop tests.
- Synthetic qualifier build: `env -u NODE_PATH node
  desktop/verification/build-video-decoder.mjs 11.9.0`, **PASS**. This compiles
  the qualifier; it does not run Electron or certify pixels.
- Final diff hygiene PASS. The four production/test source hashes still match
  the independently reviewed bytes. Implementation through these local checks
  took approximately 7 minutes from the recorded 23:48 UTC source entry.

The initial pre-edit V9 inspection used chunks with truncated output, so no
complete pre-edit read is certified. A later contiguous, untruncated inspection
covered all240576 characters /249014 UTF-8 bytes /1295 lines at23:58 UTC and
reviewed the frozen renderer diff against the complete reference: CLEAR, with
no source changes required. This establishes source/reference review only, not
rendered visual parity. Publication followed this completed review.

## Evidence limits and fixed coverage

This is partial P3-11.F, not completion of its full named cell. There is no native
encoder/capture-rate or network utilization claim, applied stream control, global
stream count, measured host envelope, Automatic/Manual policy or new provider.
No user computer, phone, account or ADB session was accessed. Equal-viewport V9
visual parity, real Electron visibility/runtime, native/device timing and monitor
cost qualification remain NOT_RUN for this behavior. Earlier synthetic runtime
failures, legacy G0-12 navigation failure and P1-06 UNMET are not waived.

Fixed ledger remains N71/S5/I24: source 29/100, integrated 24/100 and technical task
acceptance 0/19. No denominator, full-cell credit, whole-task/Phase acceptance or
main/history change follows. Corresponding source CI must be checked on the exact
public commit; native/device/optional runtime campaigns are not part of this entry.
