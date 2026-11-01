# P2-02/P2-03 — main-owned explicit lifecycle and discovery source

**SOURCE / HOSTED SOFTWARE1316/109/280 PASS — actual server/socket/device execution NOT_RUN.**

This batch implements the [adopted main integration contract](../phases/P2-MAIN-DISCOVERY-INTEGRATION-CONTRACT.md), design CLEAR against pre-adoption SHA256 `e63cdb5caa3350ce1322be437ffe8cd53010b2227047886efaa069941cee9f9c`. It connects existing main-owned server and discovery services to explicit Help Read/Start/Refresh/Stop actions through the preload/IPC boundary. No automatic Start, discovery polling, reconnect, retry or device command is added.

## Useful original-scope outcome

Main constructs one facade over the existing runtime custody, durable registry and private server/ingestion implementations. Only an explicitly admitted Start constructs the real SERVER_ONLY factory; Refresh uses that exact service-owned provider and the existing audited SQLite reconciliation. One accepted Start attempt is allowed per application launch; no registry startup replay, history reset or replacement epoch is introduced. Existing native KnownFolder/profile-absence and supported-path refusals remain unchanged.

A separate operation generation prevents Stop, revocation or late audit completion from being overwritten by earlier work. The shared invocation budget remains eight: at most seven ordinary requests plus one reserved cleanup admission, in both preload and ViewSession. Stop starts actual cleanup before its audit barriers and drains temporary read holders, pending audits, server/query work and ingestion. Logical timeout never releases uncertain custody. Main retains its actual persistence lease while cleanup runs; renderer-loss failure routes through coordinated quit and preserves a nonzero failure latch.

Schema9 adds fixed discovery audit fields without changing schemas1–8. REQUEST/EXECUTION/READ records describe captured facade work, not proof of renderer delivery or successful final snapshot publication. EXECUTION records the result candidate before final custody/generation fences; those fences can truthfully supersede it without altering known durable outcomes. Each READ diagnostic attempts only one RESULT, even if its later delivery fence fails. START alone also binds the actual private server INTENT/RESULT as a separate TRANSPORT pair, with resultingRevision null; no fictional private REFRESH or close/STOP transport audit is emitted. AVAILABLE requires the real logger emit/flush result. Known durable COMMITTED receipts are not relabeled as database uncertainty when later publication is revoked.

Fleet OBSERVED publication requires the callback-free current provider/custody witness after ordinary callbacks. Cached renderer rows and selection are invalidated on observed lifecycle loss/revocation; displayed observations are captured-time, not continuous health monitoring. No raw serial, path, endpoint, arbitrary argv or native-provider selector is exposed to the renderer.

## Exact affected paths

New product modules:
- `desktop/src/discovery-contract.ts`
- `desktop/src/discovery-audit-contract.ts`
- `desktop/src/discovery-client.ts`
- `desktop/src/discovery-bridge.ts`
- `desktop/src/main/discovery-session-service.ts`

Integration changes are limited to `desktop/src/main.ts`, `foundation-bridge.ts`, `invocation-budget.ts`, `view-session.ts`, `preload.ts`, `renderer.tsx`, `log-contract.ts`, `main/logging.ts`, and `main/fleet-service.ts`. The graph expands98→103 with exact five nodes; the closed build input list adds those five modules, without new output bundles or dependencies. Registered tests expand144→150 with six additive discovery test files and no removed/reordered prior tests. Existing affected budget/IPC/UI/tooling tests are updated to the same seven-plus-one policy.

## Source evidence and attribution

- Facade/Fleet focused30/30 PASS:18 new facade and12 Fleet cases. Composition uses actual server-service branding, ingestion, registry and SQLite with an explicitly transformed real-factory admission and synthetic native facts; it is not a live OS factory/socket run. Cases cover held audit/START/query revocation, actual drain, stale final commit fences and retained truthful durable results.
- Wire/client/bridge/logging focused24/24 PASS, followed by updated audit4/4 PASS (overlapping, not28 distinct). Actual owned log append/flush/reopen is included; no synthetic audit health is substituted.
- Main composition4/4 PASS executes source-derived main construction/shutdown/failure sections with injected builders. It proves exact wiring, concurrent cleanup before custody close and failed main-ready quit routing, not Electron/native execution.
- Admission/UI author tests include affected72, overlapping IPC22/UI-preload20, and a final cross-panel revocation case. These are impact-based results, not an uninterrupted full aggregate count.
- Preliminary TypeScript and exact graph103 checks PASS. Initial aggregate stopped at QUALITY before build/tests: four missing React callback dependencies. The bounded stable-callback repair passes16/16 renderer tests and warning-level quality, preserving one-shot hydration; the failure is retained, not hidden by a successful unrelated suite. The resumed aggregate passed quality, both TypeScript/build paths and manifest verification, then batches1–6. Batch7 stopped at109 tests/108 PASS/1 FAIL: the existing scanner test omitted the newly imported discovery contract from its exact renderer edge expectation. That one expected edge is corrected without changing scanner or graph policy. Final batches7–19 pass853/853 with zero failed/cancelled/skipped/todo; already-passed batches1–6 are reused, not rerun. This covers all150 registered files under the same bounded test process settings. Final quality covers370 files (exit0, information-level legacy diagnostics only), and final build manifest verification is true.

No uninterrupted local aggregate PASS is claimed. The exact hosted desktop count below comes from actual source CI, not a sum of overlapping author tests. Hosted results now establish exact1316/109/280 PASS at the checkpoint below. Independent consolidated review found two finite source gaps: unknown client revisions were serialized before scalar validation, and the idle READ revision callback followed its last generation fence. The client now rejects invalid scalars before JSON with no getter/coercion/invoke (6/6 focused tests); the facade captures revision before its final fence and callback-free publication (1/1 causal last-callback Stop test). These final checks supplement, rather than replace or fabricate a rerun of, the stitched inventory. A third audit correction latches READ result-attempt before its awaited audit, preventing a duplicate FAILED result after delivery revocation; its causal1/1 test passes. Narrowed independent source review is CLEAR20:31. The final facade now has20 authored cases, not a claimed rerun of all20. Final TypeScript passes; the refreshed build first correctly refused the newly imported scalar validator absent from its exact module-map binding, then passes BUILD_VERIFIED/manifest true after adding only that binding. No graph policy or output surface changed.

## Reused proof and remaining requirements

[Current managed27 proof](P2-owned-discovery-acquisition-source-2026-11-01.md) remains exact unchanged four-C# and ten-input evidence at public9a0700b4/CI41344155270: hosted1268/109/280 and strict managed-v4/27 PASS. This source batch changes no C#, native bootstrap, managed fixture/wrapper, launcher or workflow; that managed proof is carried forward, not rerun or promoted to live server/device proof. Foundation109 and Python280 now also pass in this checkpoint’s actual source CI; the managed27 campaign itself was not rerun.

P2-01 remains TECHNICAL_PASS/DEPENDENCIES_PENDING; P2 technical1/13, overall11/154 and formal0 are unchanged. Actual P2-02 start/health/retirement and P2-03 physical discovery remain pending an authorized Windows environment whose actual native KnownFolder `.android` is genuinely absent. The known existing-profile error183 is not retried or bypassed by environment redirection, adoption/deletion, account changes or security policy changes. No actual server/profile/socket/device campaign is included in this checkpoint.

## Frozen implementation fingerprints

- `desktop/src/main.ts` — `f8334ca7505de62fb41bf45c820b820cc0570dd4a0788febefa7dc46b61e9710`
- `desktop/src/main/discovery-session-service.ts` — `3637c0ae59c1c2b4bcbedb4096845a3eda47b1265735e062601809c92794e5a5`
- `desktop/src/discovery-contract.ts` — `ff9b08b766c1c6f2bc5bd97e5ee1db21d3cc77e827bf62412759f7a5c7e03f47`
- `desktop/src/discovery-audit-contract.ts` — `42264902d579a364f61faf5d3533369351e52afc451ed0649ffffe94282603ec`
- `desktop/src/discovery-client.ts` — `d136ae1850c239f02943a0cca6ad23d406e0c0a42d6f0fdfe05a9f4338fe738d`
- `desktop/src/discovery-bridge.ts` — `7357dfd88d3fe2de8f5a0c1333faad37e6ea9af213fa27a912c2540ea2609853`
- `desktop/src/invocation-budget.ts` — `14dd3ec1a3a07fa6e8e09509c5c36c1a1be110aeebb9b373180185f181ff831e`
- `desktop/src/view-session.ts` — `b5aa7ece73b90731a69e16798b624bb4d1d938ea04140ee9412788f32b90330c`
- `desktop/src/foundation-bridge.ts` — `b525ea3b4d56f033afb6de47b859c9a4ec68bcf403503cee337c3c0cfa1a3943`
- `desktop/src/preload.ts` — `526e1ff02a1d120e91ce4ee298d09e54ab95e592a32abb7f62b6d7e0280b0aa1`
- `desktop/src/renderer.tsx` — `65f3ea53fd0cbea777e78047c491d1d53107656d19a32316165e73ddb8b3881d`
- `desktop/src/main/fleet-service.ts` — `3b56728de2bfce9cbdbcabdbdb354b84d2181abab369f32e4de95d8a480b21dc`
- `desktop/src/main/logging.ts` — `0f03fef12a157e38f73ed4ac52967acaad5ae3c12c1b347456064437737bc90e`
- `desktop/src/log-contract.ts` — `4439fe0836784d91063ba2492234015d26256621ece6ed8e9a0f384ebf8c876d`
- `desktop/module-map.json` — `5d245e3bc9c62b117dff2fa0f80d93d8a1bda38e0f7263adf8838b66dd6c903d`

## Actual hosted source closure — 2026-11-01 20:40 UTC

- Local reviewed source: `3e08a456f8eb347a09587ffcaaacd97f2088d51b`; exact tree `889f2738ccd8d7489df8ea308cd6890a48cc39e1`.
- Public `phase-02`: `d73b2d4481937c660c059684662755c2be160ddd`, same tree and normal parent lease `8077a103f16adae9abce4886f97a6bde47f4829e`; history preserved.
- CI `41347625831` SUCCESS; source job `124970742053` SUCCESS. Exact SOURCE_HEAD is the public commit.
- Actual desktop **1316/1316** plus DESKTOP_SOURCE_CHECK_PASS; foundation **109/109**, zero failed/cancelled/skipped/todo; Python **280**, OK under the unchanged no-skip gate. This is the uninterrupted hosted total, not a relabeling of the stitched local runs.
- All eight optional native/managed jobs were SKIPPED. No native artifact or new server/profile/device proof is claimed.
- Single source log retained privately; independent exact-log audit PASS20:40 confirms checkout/source identity and all three actual software counts. Optional-job skips are the coordinator’s terminal API metadata observation, not inferred from the source log. No additional tests or unchanged managed campaign are needed for this documentation closure.
