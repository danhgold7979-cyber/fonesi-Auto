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

## Narrow Windows smoke design (execution pending exact review)

Coordinator approved a single SOURCE-only production launcher smoke, not reruns of
unrelated backup/vault/identity campaigns. It uses the real initializer, owned lease,
orderly authentication and compiled main/preload/React. Four exact hash-bound launcher
substitutions select the verification observer and injected native initialization
answers; original/derived materialized bytes are rechecked. No production fixture
provider or device transport is activated. Official pinned Electron development-runtime
installation/attestation is prepared under the existing bounded owned Job, without
running the old full foundation/native campaign.

The observer checks startup's single fleet read and independent preference hydration,
empty BINARY_UNAVAILABLE fleet, actual preload read and unchanged empty-selection CAS,
then holds one completed selection reply to observe timeout and explicit reconciliation.
The late reply check is a bounded150ms unchanged UI/no-extra-dispatch observation,
composed with pure client late-settlement tests—not proof of direct preload receipt.
Foreign owned webContents and a real child frame are passed to the captured actual
handler; these are adapter-invoked native negatives, not genuine user IPC intent.
A real reload revokes the document before final denial. Two actual1024×768 Light/Dark
Overview screenshots cover the changed integration; six tabs are structurally checked,
not another32-image full-reference parity certification.

The separate native job depends on the exact source job. A default-false manual input
or explicit `[fleet-ui]` marker on a `phase-02` push requests the developer smoke;
ordinary pushes do not repeat it. The marker is testing opt-in, not production/device
authority. Existing manual ADB version/server boundaries are unchanged and not invoked.
Only reconstructed fixed JSON and two independently hash/PNG-bound screenshots may
publish under separate markers. Raw profiles, initialization keys, paths and captures
remain private. Native execution/results remain NOT_RUN until exact runner review and
coordinator execution disposition.

The application-only checkpoint was published as
`a99175d45fb6efdb9a66eeaa7962a4d2b5216d65` (tree
`6972b0d78fd7488176c9be93c97448e04a73597e`). Exact Windows source
[CI41271299012](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41271299012)
passed751 desktop/109 foundation/194 Python; independent log inspection confirmed
those counts and runtime jobs correctly SKIPPED. This does not convert the new native
fleet smoke into PASS.

### Frozen smoke source checks

Affected new Node cases12/12 PASS (observer6, actual materialized launcher/control5,
workflow opt-in1); new Python validator/handoff9/9 PASS. Registered inventory now
expects763 Node cases and203 Python cases in the next hosted source run; these are
expected totals, not an unrun local full aggregate. The previously passed751/109/194
Windows scope is reused unchanged. Quality inventory258 files and YAML/diff checks
PASS. Initial smoke-only quality failures (block-scoped declarations and ambiguous
literal regex spacing) were corrected without suppression; final checks are clean
apart from pre-existing informational style diagnostics.

Final source hashes:
- Outer PS `540fb045aff7f97b531881aebd1f3c813f8bb940a309ecd2d522db23fbd3b436`.
- Control `90ae7898320140217c6c22e2fa8e3ece1e7938e7f42a5322f433a77cebec2dd0`.
- Observer `3185538bfb5532635bb0ec7d2b1652b0601fa24ae9c53e776b4ca31989da3364`.
- Validator `0d7ffaa8de3285e2dd3941324d85707b1973ce9614bd42c50cff0fbfa9e92d89`.
- Workflow `fdc79dbf6816384de8cb00715a0d88901b60784f7df5f0e0603684710190395e`.

These hashes identify the reviewed development envelope, not an observed native PASS.

Coordinator Coder Bin approved first bounded execution at04:10UTC after independent
exact-source/owned-envelope review CLEAR. This authorizes the frozen SOURCE-only smoke
and two bounded screenshots via the explicit developer opt-in, not native success,
production/device activation or a canonical task acceptance. Native remains NOT_RUN
at this source commit.

## First native smoke result and bounded capture diagnostics — 04:22 UTC

The exact published `cbd81704bee66a639f0a87c9ea4cb4dbdec26346` first smoke
returned a truthful failed report: `CONTROL_FAILED`, no bootstrap/UI result,
`cleanupComplete:false`. The outer native process was `SUCCESS`/exit0; the
inspection control rejected its capture boundary with `FLEET_UI_CAPTURE`.
Artifact13069357932 reconstructs to306 bytes, SHA256
`4eb9d4543ab202bfc22eeff360313ae351d78bc1aa1e7d7305ea36c2a9778593`.
This is not a native UI PASS and does not identify the private framing difference.

A verification-only diagnostic increment binds14 fixed capture classifications
(target, schema, status/exit, retirement/truncation, expected-marker count/order,
leading/trailing/interior empty lines, unknown lines and known failure categories)
to the actual thrown capture error. PowerShell forwards at most one exact literal
per slot; no private stdout, stderr, path or exception is forwarded. Existing exact
capture acceptance and every report/retirement predicate remain unchanged. All six
actual launcher failure literals and the initializer failure are recognized.

Five affected capture/diagnostic tests PASS, including actual failed-capture
classification, equivalent PowerShell JSON transport, malformed/duplicate rejection,
fixed-enum forwarding parity and private-canary exclusion. The unchanged copied
launcher materialization tests are not repeated against the concurrently dirty
schema4 development build, whose manifest correctly refuses the old verified build.
This narrow checkpoint contains no durable schema4 source; the retry remains bound
to the committed schema3 application. Native cause and corrected outcome remain
pending the next explicitly opted-in run. No canonical count changes.

## Exact native framing correction — 04:32 UTC

The diagnostic run41273051125 on exact public
`5e17a532b29728aa612f96fb0d37b8397c3f6680` passed source765/109/203 but its
native inspection failed again. Its fixed vector now proves the PROVISION capture
has exactly ONE leading empty line and ONE final newline, with exact marker count
and order, no interior empty/unknown/failure lines, SUCCESS0, complete retirement and
untruncated streams. Artifact13069838964 reconstructs to the same306-byte failed
report/SHA above; no UI result is implied.

The narrow correction accepts exactly zero or one leading empty line before the
otherwise byte-exact expected lines, matching the established package capture grammar.
It does not trim whitespace, extra trailing/interior blanks, duplicate markers,
reordered/missing lines or unknown text. Six affected tests PASS, including LF/CRLF
zero/one-leading positives and multiple-leading/trailing/interior/space/reorder/missing
negatives. This is an actual observed framing cause, unlike the earlier diagnosis-only
checkpoint. Coordinator approved this bounded schema3 retry at04:32UTC. Current
schema4 development remains excluded from this commit and native outcome is pending.

## Accepted historical schema3 SOURCE smoke — 2026-11-01

Coordinator Coder Bin accepted bounded protocol and Light/Dark visual PASS for exact
[run41273611811](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41273611811), public commit `4657abbdddbe2cd315ed7580dc0411868e220d38`, report artifact13070535255 and PNG artifact13070585124, after independent duplicate-aware reconstruction and both original PNG
hash/CRC/privacy/visual checks. The [retained exact report](samples/P2-fleet-ui-schema3-pass.json)
is1290 bytes, SHA256 `f4edf7b591d6178536313780938f5484adef050d6be45030656c0ebdd6f86206`.
All seven bootstrap and18 UI cases pass, with retired native processes and cleanup.
The corrected grammar accepts exactly zero or one leading empty line, preserving
nonempty markers/order and all other bounds. The reviewer withdrew an initial mistaken
visual observation of a blank dark dock after reopening the exact original image;
no CSS or screenshot change was made or needed.

This remains SOURCE/schema3 evidence with injected provisioning answers and four
hash-bound verification substitutions, not an untouched end-user launcher or real
ADB/device test. Two theme captures establish this bounded integration smoke, not a new
32-image parity campaign; inherited reference contrast limitations remain. The current
schema4 application has separate source evidence and native UI/migration NOT_RUN.
The old schema3 job remains explicitly suspended on schema4 until a reviewed update.
No canonical task count, formal acceptance or P1-06/hardware gate changes.
