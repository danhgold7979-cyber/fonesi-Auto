# P1-02 canonical criterion audit

2026-10-31 04:25 UTC. Read-only assessment; no task acceptance inferred.
Source: [Phase 1 P1-02](../phases/PHASE-01-desktop-foundation.md#p1-02--desktop-mainrendererpreload-and-secure-ipc),
[master task](../04_MASTER_IMPLEMENTATION_PLAN.md#3-phase-1--repository-and-desktop-foundation),
[AC-01](../05_ACCEPTANCE_AND_RISKS.md#ac-01--desktop-foundation),
[approved ADR-0006](../decisions/ADR-0006-foundation-ipc-admission.md).
Evidence: [reviewed exact-head source/Windows result](P1-02-public-bridge-source-2026-10-31.md)
and [fixed artifact](P1-02-public-bridge-sample-2026-10-31.json).

## Two separate conclusions

**A — P1-02-specific technical scope: implemented, but verification not yet fully
complete.** Runtime/source review covers the currently implemented public-read behaviors
within the scope qualifications below; the explicitly named contract/fuzz evidence
still lacks a recorded generated-input campaign. Thus do not yet report the whole
technical scope DONE solely from 25/25 runtime cases.

**B — Formal task acceptance: pending predecessor gates independently of A.**
Full P1-03 and P1-11 are not accepted, although their concrete compiler/test and
bridge-specific contract subsets used here are reviewed and exercised. Closing A's
remaining verification gap does not silently accept those entire predecessor tasks.

## Every P1-02 row, without importing later-phase requirements

| Canonical item | Current evidence / disposition |
|---|---|
| Dependency P1-03 | Strict compiler, exact restored toolchain, built-in unit harness, fail-closed stage/summary controls actually exercised. **Full prerequisite task unaccepted:** complete lint/formatter choice and required evidence remain distinct work. |
| Dependency P1-11 | This bridge's exact version/error/correlation/session/threat contract approved in ADR-0006, executable parser/client/session/dispatcher tests. **Full prerequisite task unaccepted:** domain identity/generation/entity relationships and broader invariants not implemented/reviewed as a whole. |
| Electron main/React renderer/preload, strict TypeScript | Actual main.ts, renderer.tsx and sandboxed preload.ts; strict noEmit + emitted esbuild bundles/manifests. Runtime source/package both invoke the real application. **MET for this task's minimal boundary**, not P1-08 V9. |
| Launch/close lifecycle; minimal versioned bridge | Real source/package version checks, main_bundle_loaded and orderly_quit PASS; version1 public health/settings. **MET**. |
| Renderer isolation | Runtime secure_preferences, approved_preload, no_node_globals, bounded_public_bridge, isolated_world_separate PASS; config/build review and bounded DevTools denial qualified. **MET for documented contract**, not native OS-token attestation. |
| Restrictive content policy; navigation/window allowlists | Exact app HTML/renderer JS map, restrictive CSP, network/unknown-asset/permission/download/popup denials PASS. Reload revokes and about:blank handler denies even though URL transition occurs. **MET under explicitly approved admission contract**; original immutable-URL objective remains FAIL. |
| Validated IPC sender/payload; no generic shell/process/secret method | Exact main-owned session/sender/main-frame/origin/URL checks, exact bounded schema and only two public fixed reads; runtime request/sender/subframe denials PASS, actual-dispatcher source negatives. **MET**. |
| Positive: approved renderer invokes bounded typed health/settings method | Actual preload wrappers and React diagnostic explicit read; health_read/settings_read/react_explicit_read PASS both modes. Settings revision0/LIGHT/NOT_PERSISTED is honest initial public state. **MET**; no requirement to implement P1-07 persistence early. |
| Positive: multiple windows and close/reopen release resources cleanly | Real compiled lifecycle creates/closes/reopens native helper windows; actual primary orderly quit and full process/owned-directory cleanup PASS. **MET for that lifecycle/resource scope**, not a demonstrated reopen of the original application window with a fresh attached bridge session. Repeated attached-view integration is unclaimed. |
| Negative: malformed/oversized payload and unsupported version | Strict parser fixtures and actual captured handler cases: bad JSON/nonstring/513-byte/duplicate/extra-field/version2; fixed errors/no echo. **MET for deterministic fixtures**; see fuzz coverage gap below. |
| Negative: untrusted sender/navigation | Wrong window, foreign main frame, genuine child-frame and null sender; reload session revoked/no rearm, about:blank sender denial; source tests cover destroyed/getter-failure/observed-denial events. **MET for explicit admission semantics**; no pre-observation Document guarantee. |
| Negative: arbitrary command/path and denied method without process launch/secret disclosure | Unknown shell.exec method and path-bearing extra field denied; exact two-method source/compiled closure imports no effect/secret adapter; runtime no Node/generic API. **MET for this closed public capability surface**. No future native service or arbitrary compromised-OS claim. |
| Negative: renderer crash does not corrupt persistent state | Real renderer crash produces expected NONZERO_EXIT1, bootstrapFailed and verified retirement/cleanup, no unexpected normal quit. This task exposes no durable application-state writer; defaults are explicitly NOT_PERSISTED. **Crash shutdown/retirement MET; durable-state corruption assertion NOT_EXERCISED, currently N/A to application-domain state because no writer exists.** Chromium profile files do exist and were cleaned, not integrity/reopen-tested. Coordinator must record this scoped disposition; no DB/settings recovery claim. P1-05/P1-07 later supply their persistent-state crash tests; demanding DB before P1-02 would contradict their dependency order. |
| Acceptance evidence: contract/fuzz-negative tests | Contract and deterministic adversarial boundary fixtures PASS. **Specific remaining evidence gap:** no dedicated bounded generated-input/fuzz campaign of the IPC parser/dispatcher has yet been recorded. Do not relabel a table of examples as a fuzz campaign. |
| Acceptance evidence: Windows packaged smoke | Exact head e1e1cdae, source/package25/25, typed negatives and cleanup; reviewed instrumentation and fixed artifact. **MET on named hosted Windows runner**, not a universal/target-host claim. |
| Acceptance evidence: security review demonstrates absent privileged renderer paths | Independent source/integration/envelope and artifact CLEAR; sandboxed two-method preload and closed public result schema, no effect adapter. **MET for current capability set**; later methods need their own review. |
| Rollback: disable affected bridge, close owned resources, revert verified shell; redacted diagnostics | dispose removes IPC handler and closes monotonic sessions, main disposal closes windows/private handlers; manifest-bound prior zero-bridge checkpoint remains in history; fixed-field evidence redacted. **Mechanism present/tested at disposal**, no production deploy/downgrade or real-user rollback claim. |

## Real IPC versus direct-handler coverage

The positive health/settings calls cross the actual renderer → sandboxed preload →
Electron invoke → registered main handler → bounded response path in both source
and packaged modes. React's explicit button additionally exercises UI binding.
Reload uses a recreated real preload wrapper and receives the revoked-session result.

Malformed wire/version/path/denied-method and wrong-window/subframe/null-frame
negatives invoke the actual captured main handler from the privileged test process,
using actual Electron frame/window objects. They are not a second permissive handler
or mocked policy, but **they do not prove malformed transport messages were sent by
an untrusted renderer over Electron IPC**. That deliberate instrumentation avoids
adding a generic invoke/test preload capability to the application. Native sender
metadata provenance relies on the pinned Electron API/source plus source review;
no hostile native-transport flood/memory bound or same-process attacker guarantee is
claimed. Generated fuzz should cover the actual parser/dispatcher under the same
explicit model, not silently call direct invocation a native transport fuzz test.
Coordinator/security reviewer must retain this scope distinction in acceptance.

## Smallest remaining work and sequencing

1. Close the concrete fuzz-evidence gap with a bounded deterministic-seed generated
   wire corpus using existing Node tooling (no new dependency/service), explicit
   execution/time/input caps, safe accepted-shape invariants and fixed failure outputs;
   test dispatcher denial/non-crash behavior and record seed/count/results. This is
   a normal P1-02 verification increment, not a new phase, lab or product requirement.
2. Coordinator then decides P1-02-specific functional/security verification status
   separately from the formal prerequisite gate. Do not call the whole task PASS
   merely from 25/25 runtime, or keep all useful source work blocked by unrelated
   device/OCR/platform-policy evidence.
3. Complete canonical P1-03 lint/formatter/tooling acceptance and P1-11 reviewed
   domain/IPC conventions/relationships/fixtures next in their normal dependency
   order. Their full-task status is not inferred from the exact smaller tooling/
   contract subset actually proven for this public bridge.

Full V9 integration is P1-08; durable settings P1-07; secrets P1-06; device/manual
commands Phase 2/3 and workflow arbitration later; production signing Phase 11.
Neither genuine-human-intent proof nor immutable Document identity is a hidden
P1-02 requirement. Phase 0 support/device gates and phase-level acceptance remain
open independently; this audit changes no original checkbox or accepted-task count.

## Follow-through — 04:30 UTC

Root approved the named fuzz gap, not a new architecture. Local source pipeline now
passes 52/52 with the recorded 4,096-input/16,384-dispatch seeded campaign; details in
[bridge evidence](P1-02-public-bridge-source-2026-10-31.md). Independent review CLEAR at 04:32 UTC (fresh 52/52 and 43/43);
Windows execution is still pending for this increment, so conclusion A above is
not yet automatically promoted. A new actual-adapter test also verifies close/removal
of old view, fresh second-view admission and permanent old-view denial. Combined with
the real compiled native helper lifecycle and separately fresh source/package starts,
this is a compositional reopening/resource proof, not an original-window UI replay
trace. No application-domain persistent writer exists: durable-state corruption is
scoped N/A, while actual crash shutdown/retirement is measured; Chromium profile
integrity was not tested or advertised. Full P1-03/P1-11 gate remains separate.
