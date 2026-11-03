# Phase 3 explicit video recovery — local source evidence

## Result and limits

The explicit-Start recovery source is implemented across the application bridge, discovery reservation and sealed target issuer, owned consumer/server, retained host factory/adapter/pipe bridge, and native provider/protocol. Independent source review cleared the ownership contract and implementation, including the final clean pre-begin cancellation repair. This is software-source evidence, not actual Windows video recovery or device acceptance.

The work is based on local commit `ec046efc04f510355c3fc34873cce265e651d0ad`, tree `4e460ffe69767e51d2d09821ef26b60b86978b50`, in a same-phase detached worktree. The canonical Phase 3 checkout and its pending publication batch were preserved unchanged. This recovery batch has not been published and is not a different route around that publication hold. No main merge, real device, ADB runtime, native helper campaign, or pixel qualification was executed.

## Implemented ownership

- Wire v7 is a separate sequential media-recovery form. Historical v5/v6 behavior and media header identity remain intact. Exact result discrimination separates real OWNED history from definitive NOT_STARTED refusals; neither direction can later rewrite a candidate's handoff.
- Each attempt has a fresh immutable owner, video ID, bounded ordinal, nonce/scid and sealed target witness. Actual prior retirement is required before replacement. A never-entered but consumer-claimed ticket is not recycled: fresh issuance invalidates the unused predecessor by exact issuer-map identity. Used owners still require proven retirement.
- Local cancellation before provider handoff returns private `null` only after actual construction drain; it does not forge a wire refusal or consume a native ordinal. Cancelled identity/ticket tombstones remain retained. Unknown handed outcomes remain fenced.
- Native replacement uses the captured owner's actual provider cleanup and protocol drain barrier, not timeout or Stop-response arrival. Producer workers are retained before thread start until actual join. Provider installation interrupted by cancellation or shutdown remains a cleanup obligation.
- Ordinary admission-token release at writer selection is distinct from actual write/Flush, media credit and cleanup retirement. Old tokens, replies, credits, frames, port acknowledgements and worker callbacks cannot mutate a fresh attempt.
- The finite U + R + Q budget preserves reserved owner STATUS and first cleanup under exhaustion. Rejected starts have no deferred automatic effect, duplicate cleanup cannot grow reply obligations, and explicit Start is the only restart trigger.
- REFUSED is a bounded port notification containing only the captured video identity and a fixed BUSY/QUOTA/STALE_TARGET/REJECTED reason. It is never cleanup proof. Lower cleanup starts immediately; only the notification capability may remain until explicit Stop, close or the original startup deadline. STOPPED retains its unambiguous retirement meaning. Both lower retirement and successful local port teardown are required for replacement; throwing close remains UNCERTAIN. QUOTA remains terminal in main and renderer, and uncertain cleanup retains the original refusal reason.

## Source checks and independent review

Final frozen source after the unused-ticket repair passed the coherent desktop source gate **1835/1835**, Python verification **383/383**, foundation checks **109/109**, and the decoder qualifier bundle build. The final unused-ticket source and actual issuer/server/consumer integration tests passed **95/95**; independent review passed **93/93** overlapping tests. These targeted counts overlap and are not added together.

| Final check | Command / receipt | SHA-256 of retained local log |
|---|---|---|
| Desktop source, types, builds and tests | `node desktop/scripts/check.mjs` → `TESTS_PASS 1835/1835`, `DESKTOP_SOURCE_CHECK_PASS` | `ff3fde7e979d78a45c2c2c60952119e6e2fbace85cf0ad3fe2c104183ba0eefb` |
| Verification Python | `python3 -m unittest discover -s desktop/verification -p 'test_*.py'` → 383 tests, OK | `03e673401dd0ab239919ddb8dc661bc7363cf8e8b04731cd1d1cd4bd72815e1f` |
| Foundation | `node foundation/scripts/check.mjs 11.19.1` → 109/109 | `42d9c87caa146937ca855fc88d396f1634db577b3dba0aae72e1a3906ca33729` |
| Synthetic qualifier build only | `node desktop/verification/build-video-decoder.mjs 11.19.1` → `VIDEO_DECODER_BUILD_PASS` | `ac821b8cff579a5c73ac2a80462b03e1a9af92f787d7d6bc4733ec43594a8501` |

Node checks used the existing reviewed dependencies with NODE_OPTIONS, NODE_PATH and ESBUILD_BINARY_PATH unset. No dependencies were newly installed for this recovery batch.

Independent review also ran the lower transport suite **120/120**, upper integration **197/197**, final bridge/renderer teardown checks **66/66**, managed admission **6/6**, managed validator **37/37**, and qualifier source-boundary mutations **8/8**. These are pure/fake/source tests, not native fixture execution. Exact module-map bindings were updated on existing dependency edges only; roles, parser policy and map-size bound were unchanged.

The managed verification source is now version **9**, with **118 authored groups** (historical 92 plus 26 recovery groups). Historical version 1–8 source hashes and receipts were not rewritten. The v9 runner, source pins and validator admission were independently reviewed. **Native compilation and execution of those 118 groups are NOT_RUN**: no C# compiler is installed in this environment, and no native runtime campaign was activated. The opt-in workflow remains off by default.

### Retained failures and corrections

- Initial aggregate: MODULE_GRAPH_FAILED/BINDING_DENIED, corrected by listing the exact new recovery/refusal imports, without adding authority or widening parser bounds.
- Next aggregate: QUALITY_FAILED, seven source/test warnings. Equivalent optional-chain checks, explicit missing-sink refusal and synthetic capability assertions corrected these; final quality inventory passed with zero warnings. Existing informational diagnostics remain informational.
- Initial Python aggregate: 381/383. The qualifier's exact import allowlist rejected its newly explicit synthetic OWNED snapshot helper. Only the existing pure video-contract dependency was admitted; its mutation suite passed 8/8 and the full Python suite passed 383/383.
- One foundation command omitted its required npm-version argument and stopped at BOOTSTRAP_FAILED; the correct command with `11.19.1` passed 109/109.
- Review caught and closed the pre-first-key paint accounting issue in the predecessor batch, and in this recovery batch caught pre-handoff cancellation, refusal delivery ordering, local port teardown failure, original-reason retention and claimed-unused-ticket recovery. No failing attempt is presented as a pass by retry alone.

## Reviewed source fingerprints

| Source | SHA-256 |
|---|---|
| `desktop/native/RetainedAdbProtocol.cs` | `4d8cb14ff535d5b92272fac89736ebd2ab1b473397fafc088b8120deb9abd882` |
| `desktop/native/RetainedVideoSession.cs` | `ac5eb6ddde8b2a2416b9f633a4bfc70c0ab2af5344c4258debbaa11f613d08dd` |
| `desktop/tests/fixtures/RetainedAdbProtocolFixture.cs` | `ca7011ccf2b2d2ffe41b5ea3f274308562687f9f671d1cb5fa11d6f51420ad3c` |
| `desktop/src/main/adb-host-bridge.ts` | `6f2acec7eaf09352090834eb06e23ed2a4e7d455663a81680148c8ea84a3e65d` |
| `desktop/src/main/adb-host-adapter.ts` | `218e19ad60a62a0224bb5cd1a324d9112da6708593637f623e1897378297a003` |
| `desktop/src/main/adb-host-factory.ts` | `2c3c62e6f6e2bbc0a5112a73338e59bbf813f402271bd9413e06cc0fa3c55a2b` |
| `desktop/src/main/adb-discovery-service.ts` | `0324dedc5a45c7806a3760f5e7fbb48c8abeedaf5727a7a7be03cab2ddd2600c` |
| `desktop/src/video-stream-bridge.ts` | `0aae1df7153ea8b07cef271e0b58478ecf602b353947d3bf8c933adb28e2155c` |
| `desktop/src/renderer.tsx` | `088d215b69c0f21e93657c139aba8b8613e0e73c7a74ed4ed0920c83de8bb01d` |

## Remaining qualification

Actual matching-pair admission remains gated. Native compile/managed118, actual Windows explicit recovery and interruption/teardown qualification remain pending. The previously observed landscape pixel/placement pass and portrait-output failure belong to the earlier exact public campaign, not this source batch. Portrait diagnostic publication and execution remain separately pending. The coordinator adopted the independent fixed-cell review: P3-02.D N→S and P3-04.E N→I only, yielding N72/S5/I23: **28% source / 23% integrated**, with technical task acceptance still **0/19**. P3-09.D/E remain N; no native execution credit is inferred. Pause/resume, multi-stream recovery, cooldown policy and the other full Phase 3 requirements are not silently reduced to this explicit sequential slice.
