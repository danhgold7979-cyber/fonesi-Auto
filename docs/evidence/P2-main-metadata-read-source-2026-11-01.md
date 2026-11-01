# P2-06 explicit main-owned metadata Read — source integration evidence

**Source implementation independently reviewed CLEAR22:23, 2026-11-01. Final TypeScript/build/quality and affected checks PASS; hosted source CI now PASS1410/109/283. Actual server/profile/device execution NOT_RUN.** P2 technical1/13, overall11/154, formal0 are unchanged.

## Original requirement and source-entry boundary

[Adopted source contract](../phases/P2-MAIN-METADATA-READ-PROPOSAL.md) received independent design CLEAR22:04 for pre-adoption SHA256 `acb20e6e414e651c7e3ec1b4eece5b1d3c1cd1b758bd5d87ef08fa1854a86301`. Original master P2-06 and Phase2 P2-06 require nine correctly associated metadata fields with units/source/time and unavailable/stale semantics; Product Scope§2.2 distinguishes explicit action target from selection. Original software-entry§4 requires verified identity including metadata. Consequently this main boundary admits only VERIFIED + DEVICE under the exact sealed native-row/projection/ledger/custody ticket, not a source label or display serial. PROVISIONAL remains visible/unavailable. The private SOURCE-only issuer policy is not promoted into UI/device authority. Existing input/identity verification is unchanged.

This is source implementation under standing reviewed engineering permission, not a new grant from a scheduled reporting task or managed39 result. No actual server/profile/device test, automatic Read/Refresh/Start, profile workaround, identity promotion, input capability, device data persistence or V9 shell/tab redesign is introduced. Exact current managed39 native inputs remain unchanged; no unrelated native rerun is needed.

## Finite composition

One fixed field per explicit Read from the existing nine-field set; cached GET/status reconciliation only, no polling or selection-triggered effects. The existing discovery facade owns the route, one launch-owned existing DeviceQueueBudget, one native metadata owner, same foreground server lane and opaque ingestion target. Repeated reads reuse the current owner. Switching requires actual old-owner drain; a consumed A→B→A ticket in one projection refuses REFRESH_REQUIRED before affecting B, never remints or silently Refreshes.

Metadata interaction revision, public registry projection revision and private durable host_epoch/revision are distinct. Capture full target/installation/projection witnesses; only callback-free final checks follow last external callbacks. GET uses facade history and captured internal witnesses, not owner.snapshot/current/clock or new custody acquisition. Historical logical outcome/code remains separate from freshness/closure. Coarse ActorResult is not sharpened into invented remote-exit proof. Parser unavailable is an honest OBSERVED field; unknown remains uncertain.

Exact schema10 audit uses GET one RESULT and READ REQUEST/EXECUTION pairs, one RESULT attempt per diagnostic. INTENT is required before effects; unavailable logging never fabricates AVAILABLE. A terminal candidate audit is not proof of final delivery. The allocated-op/pre-PENDING failure clarification preserves original revision and exact fixed failure without asserting an unpersisted INTENT.

Reuse global seven ordinary plus one Stop slot within total8; one absolute30s admission/audit/replacement/query deadline and original120s cleanup reporting budget. Stop/revocation invalidates publication synchronously and preempts native work; actual constructor/audit/query/close continuations remain tracked. No logical timeout releases retained actual work or enables another server. Client/UI generations reject late values for another candidate, setup/discovery revision or revoked view.

## Validation attribution — initial stitched checkpoint

Initial author targeted evidence: service/bridge/main42 cases (39 together plus three subsequent causal additions); client/preload/renderer28 cases (27 together plus one subsequent Fleet-loss regression); new wire/audit10 cases, with existing logging/discovery-audit overlap19 together and two later new cases. These overlapping runs are not added into a fabricated aggregate. Actual owned SQLite/sealed ticket/real owner composition uses explicitly synthetic native facts and a test-only VERIFIED identity transformation; production identity issuance is unchanged.

The sole source attempt initially stopped at QUALITY_FAILED before final worker formatting; its private formatting diagnostic was not retained. A separate finalized382-file check passed, then resumed source stages passed TypeScript/build/demo/manifest and batches1–6 (48 files). Batch7 was84/82/2: exact detailed reproduction exposed two old module-graph expectations (no native-owner incoming edge, missing renderer metadata import). The assertions now require only the reviewed facade edge, keep the synthetic owner unwired and bind the new exact contract import; affected2/2 PASS. Batch11 was120/119/1 because the parent's new exact graph assertion needed formatting; the formatter's precise line diff was retained and affected quality1/1 PASS. Batch13 was68/66/2: old runtime-VERSION VM fixtures lacked the new metadata client/contract imports. Exact actual-module bindings and a cache-only UI stub fix these two tests, preserving every prior VERSION/no-auto-effect assertion; affected2/2 PASS.

All other passed batches were retained rather than repeated. Final batches14–20 pass403/403. Together with passed batches8–10/12 and repaired7/11/13, the remaining108 files cover907 passing cases through stitched evidence. All156 registered files are accounted for (prior48 plus remaining108); no uninterrupted local aggregate total is claimed. At that initial stitched checkpoint the exact hosted total was pending, expected1406 from prior1372 plus34 new cases. Final quality382 files/449 infos has no errors/warnings. No dependency/runtime/flag change, native campaign or unrelated Python/foundation rerun was performed locally.

Parent review's concrete corrections are recorded separately from fixture maintenance: GET bridge throws now remain no-effect errors; post-PENDING REQUEST RESULT fence loss reaches a reserved terminal NOT_DISPATCHED result rather than permanent PENDING, without a duplicate REQUEST RESULT or fabricated EXECUTION INTENT; first-operation logical timeout uses the reserved terminal revision so its uncertain/closed snapshot remains valid. Actual query/actor uncertainty remains conservative and retained. Independent implementation review subsequently closed the three additional findings below; no broad suite was repeated.


## Exact source/tooling paths

- New `desktop/src/metadata-contract.ts`, `metadata-audit-contract.ts`, `metadata-client.ts` and their three tests.
- `desktop/src/main/discovery-session-service.ts`, `discovery-bridge.ts`, `main.ts`: same owned facade lifetime and exact second IPC channel; affected discovery service/bridge/main tests.
- `desktop/src/log-contract.ts`, `main/logging.ts`: closed schema10 and actual emit/flush integration; schemas1–9 retained.
- `desktop/src/preload.ts`, `renderer.tsx`, existing settings preload/renderer tests: explicit one-field interface, shared budget and stale-response fences.
- `desktop/tests/runtime-version-integration.test.mjs`: exact VM import closure repair only.
- `desktop/module-map.json`, `desktop/scripts/build-manifest.mjs`, `check-module-graph.mjs`, `test-batches.mjs`, `desktop/tests/module-graph.test.mjs`: exact106→109 graph and153→156 test inventory, three additive modules/files and no new output bundle.
- This evidence, its adopted contract, `docs/PHASE_STATUS.md`, and prior native-metadata evidence's hosted pure-parser closure.

Current native/C#/launcher/workflow inputs are unchanged. Exact final fingerprints are recorded below; independent index/hash/link/inventory closure verified22:24, with final documentation wording corrections applied before publication.


## Final independent corrections and freeze — 22:24 UTC

- A fresh explicit status read can reconcile a STALE historical cache for a newly eligible current VERIFIED candidate/projection. Old values remain stale; PENDING, unknown/closed or historical UNKNOWN cannot rearm. Actual transformed DOM Refresh→status/Fleet→STALE→new explicit Read positive and unknown/closed negatives2/2 PASS.
- An operation-owned actual result candidate is captured before external callbacks. If the original30s timer fires while known OBSERVED or known failure waits for RESULT audit, close/stale preserves that historical outcome/code/terminal revision. Actual audit drain remains retained and may complete cleanly; it is not fabricated native uncertainty. A causal test covers both outcomes; targeted2/2 includes this new case and an overlapping prior timeout case.
- Immutable validated PENDING response bytes are captured before starting a potentially synchronously failing execution continuation. Execution-diagnostic exhaustion now yields valid PENDING/R1 followed by known NOT_DISPATCHED/LIMIT_EXCEEDED/R2, with zero query. One new deterministic regression PASS uses an explicitly reduced test-only exhaustion guard, not a production cap change.

Final service/bridge/main authored coverage44 cases; client/preload/renderer30; wire/audit10. The four new final cases are checked separately from the earlier156-file stitched pass accounting. At final source freeze the expected hosted total was1410 (not yet observed), with unchanged foundation109/Python283 expected; the actual hosted result below now supersedes that estimate. Final TypeScript/build/manifest PASS and382-file quality has449 infos, no errors/warnings. Independent source/causal-test review CLEAR22:23; no reviewer suite was repeated. No C#/launcher/workflow or managed-v5 pin changes.

### Frozen source SHA256

| Path | SHA256 |
| --- | --- |
| `desktop/src/metadata-contract.ts` | `97e7e2ec45ee2117d8c4d09a16af040474fbc589560b68ee64216030dec707a9` |
| `desktop/src/metadata-audit-contract.ts` | `11d744f09dfce052defcccdd57db485a0cb24ce5ce2f02f99fbe78e906c66d0c` |
| `desktop/src/metadata-client.ts` | `a81a192b4ba803c891a3f9b76b5b5397b3ac125f8222025c892b458dce54859b` |
| `desktop/src/discovery-bridge.ts` | `86dac3b4010f31d6900a467c45a95c706d67634ef547be96e3bc5a3e45a92392` |
| `desktop/src/main/discovery-session-service.ts` | `791c3d44f56445b1da3e99d011c655f08ed7ff10777692f735c40cfba30cd3cf` |
| `desktop/src/main.ts` | `010f900bb7ef6496b9878a66c82ab1f923d9904329cece77389b879608214a62` |
| `desktop/src/log-contract.ts` | `7e2898d950ef1d7199f2b3f1be29c03f7759c8300b64bb19e8659ec1f1a2c272` |
| `desktop/src/main/logging.ts` | `1dc8244e99eb7bd8e41672f075c9dfb056ff00f5eca7622a3aac3ac29b8aef2b` |
| `desktop/src/preload.ts` | `91a10fd34f7fa1db71e7bd8d0ba337155f5d44c764b232f05f1f9186c7d52439` |
| `desktop/src/renderer.tsx` | `26b09ee0827764e032702b9179ab56e6fbb65500bf26f5b6db1eb48171d32604` |
| `desktop/module-map.json` | `71664e49813f98fff7bbffb09fb4008cba0a5622c2090a260b4f0d51557e2f83` |
| `desktop/scripts/build-manifest.mjs` | `4e247cf43204630e7758193ad7e2feda1bd69a8cfc1d1efb6984bd0fb886da0b` |
| `desktop/scripts/test-batches.mjs` | `d82c52f9f7369b4a31f71ec30b7224627539a381daa3e2d35276dfe46236f7bc` |
| `desktop/scripts/check-module-graph.mjs` | `2a3bc5b53c70786b2348660453b68d7a78a60674fb623d24f24509fdf27fce6e` |
| `desktop/tests/module-graph.test.mjs` | `3ee08818fa7fc8752b4d526afadd80337514f5894dd9687a6dc02b1150a2e0b1` |


## Actual hosted source closure — 22:32 UTC

The reviewed28-file source checkpoint is local `c3d528ba7e2f5daad539541fa00f7bfbc8785907`, exact tree `e758a473ad57878cb33199c5df0d7a4e8c93fbc8`, public `3123c7b883b042c7090b96288a0cc96939dced34`. CI `41357276991` and Windows source job `124999938189` completed SUCCESS. The single retained source log binds the exact public SOURCE_HEAD and records **1410/1410 desktop tests + DESKTOP_SOURCE_CHECK_PASS,109/109 foundation tests with zero failures/cancellations/skips/todos, and283 Python tests/OK under the exact-count/no-skip gate**. Its81194 bytes have SHA256 `76bd439e50322fcd5a0daa15e021638508d0f8a5d0b592f3a7f721a12756c5a1`.

The terminal jobs API separately records all nine optional native/managed jobs SKIPPED; this is not inferred from source log markers. No unchanged native/managed campaign or completed local suite was rerun for this closure. The existing current compile/controlled managed39 proof remains tied to its exact unchanged ten inputs; this source result does not establish actual server/profile/device metadata or physical identity. Production discovery still provides no verified physical-identity proof, so PROVISIONAL candidates remain unavailable at this main boundary. P2 technical1/13, overall11/154 and formal0 remain unchanged. Independent retained-log and all15 committed-fingerprint audit PASS22:32; the reviewer used the retained log without refetching or rerunning tests.
