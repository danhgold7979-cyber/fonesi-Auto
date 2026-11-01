# P2 fleet facade, selection CAS and V9 integration

Software implementation IN_PROGRESS; no canonical task or hardware acceptance added.
Coordinator Coder Bin approved the independently reviewed [contract](../phases/P2-FLEET-FACADE-IPC-CONTRACT.md)
(pre-adoption SHA256 d19fe794556e19145cbecfae45f81ec9ec21b8ba8455fd3f225b7bae42a39dee).
The separate [durable store proposal](../phases/P2-DURABLE-REGISTRY-CAPTURE-PROPOSAL.md)
has source entry approved, but is not implemented by this process-local selection facade.

## Implemented boundary

Main owns the registry projection and selection controller. Private capabilities,
ViewSession sender/frame/document admission, final ownership checks, expected revision
and current member checks fence an atomic process-local selection CAS. A structural
registry or retained synthetic history cannot become production fleet rows. Generated
UI labels contain no serial/model/endpoint. Current production supplies an empty
recognized registry and BINARY_UNAVAILABLE; no ADB action, server, fixture activation
or new renderer command dispatch is enabled.

The exact fleet channel exposes only read and selection replacement, sharing the
existing eight-invocation/two-second preload budget and private readiness signal.
Timeout/disposal never retries or later invokes a closed readiness wait. Renderer
performs one fleet hydration independently of preferences, renders unavailable/errors
honestly, applies only confirmed selection/focus and requires explicit read after an
uncertain mutation response. V9 structure and demo-local synthetic interaction remain.
APPLIED means in-memory main selection, not SQL persistence or a device effect.

Schema4 FLEET_OPERATION audit extends schemas1–3 without device IDs or payloads.
Selection requires a completed AVAILABLE intent flush before mutation. Actual owned
LogStore append/sync fault composition checks no mutation on intent failure and
APPLIED/DEGRADED after result-log failure; post-application reply revocation never
pretends rollback. Main drains the real facade operation through the existing bounded
non-cancelling shutdown coordinator before persistence release.

## Checks and limitations

Focused contract/client12, initial service8, dispatcher6, schema4 owned audit5,
renderer/shell24 and graph/harness30 checks passed during implementation; these are
component/source tests, not additive full-suite totals or native/device observations.
The first coherent pipeline stopped at QUALITY on a parent integration non-null
assertion before tests; replacing it with an explicitly captured owned service fixed
that warning. Further independent review tightened callback-to-final-CAS ownership
ordering with causal regressions. Final aggregate and exact review are recorded below
when complete; no duplicate unchanged foundation/Python rerun is required.

The previous selection checkpoint now has exact Windows source CI41270753346 at
public bdd53a47675540c2647042108fa19fd4b675fd2a SUCCESS711/109/194. Its CRLF assertion
repair and exact per-execution manual opt-in predicates are retained. Native version
and server jobs were correctly skipped; the earlier bounded DEVELOPMENT_VERSION_PASS
is unchanged. Existing-profile server refusal remains UNMET and is not retried here.
P1-06 cross-user, physical/AVD/Unicode/input/capture evidence and formal acceptance
remain unfinished. Ten canonical Phase1 technical scopes/formal0 remain unchanged.

During integration, independent review found the package's closed output inventory
needed the same three new fleet outputs as the build manifest. Exact exported-list
parity now has a regression; no inventory predicate was relaxed. The next pipeline
reached DEMO_BUILD and rejected the newly shared `UiSelection` type because its demo
map declaration was absent. Adding that exact type-only binding restored the demo
build; value widening and fleet-service/client/bridge imports remain denied. These
were local integration failures, not native/device failures or passing full runs.

Final coherent author desktop source pipeline **751/751 PASS +
DESKTOP_SOURCE_CHECK_PASS** at03:56UTC. Independent review read the complete source,
ran the causal final-owner regression and reviewed exact package/demo-map corrections;
it did not duplicate the full suite. Unchanged foundation109/Python194 retain prior
exact Windows evidence. The new actual Windows fleet/UI smoke is being implemented
under coordinator-approved bounded source-only launcher design; it is **NOT_RUN**.
Earlier P1-08 screenshots are historical references, not proof of the changed renderer.
