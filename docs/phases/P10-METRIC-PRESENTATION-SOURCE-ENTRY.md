# P10-04/08 bounded metric presentation source entry

Proposed 2026-11-03 23:32 UTC; independent design CLEAR and coordinator adoption
at 23:33 UTC preceded production edits. Reviewed proposal SHA256:
`d0c92d1a0a01d12a6409f6f40446f4b8bea48b1f2610deda4fa23568027944ff`.
This is a partial software-only contribution under Amendment02, not full P10-04/08
or Phase10 acceptance. The coordinator keeps at most two active source phases.

## Base and independent scope

Local phase-10 `c8452e1c284f4d67c51942939ba709dd540c6a53` has the same complete tree
`74b86469d11c394fbd2b741ee02abf813f4f8eda` as verified public phase-10
`3bd3b06589d5dfa75c0a755a85add3a75021e413`. Its exact hosted Windows source run
41739163781/job 126276010462 passed 1829/1829 at 23:29 UTC. Public history, main,
existing local commits and the preceding CSV report remain intact.

The existing Tracking page has fixed per-network metric display labels, em dashes,
unavailable buttons and no metric collector. Move those labels into one immutable
closed presentation-availability projection and consume its reasons in that page.
This is not a runtime capability registry, collection admission or dispatch fence.
No currently unavailable metric becomes supported merely because it has a label.

## Exact presentation contract

The existing nine network identifiers and their metric label order stay unchanged.
Only exact primitive lowercase identifiers select a known catalog. No coercion,
case normalization, URL interpretation, object-property lookup on untrusted input,
getter invocation or arbitrary network registration is needed. Unknown or malformed
input returns the same frozen unavailable fallback with no metric entries.

Every known and fallback result has availability UNAVAILABLE. Facebook explains that
no permitted metric source has been admitted into this application. It does not
claim Facebook prohibits collection or that the platform lacks those metrics. The
eight other networks explain that their implementation is deferred under accepted
C-01 Facebook-first scope. This is a product implementation disposition, not a
platform policy claim. Metric entries are stable presentation keys and original V9
labels only, not account/post scope, metric unit or approved source definitions.

All nested arrays/entries/results are frozen and stable across reads. There are no
numeric values, dates, source/evidence IDs, account/device IDs, versions, READY state,
permission/certification fields, persistence, adapters, commands or mutation hooks.
Existing raw snapshots, identity/selection and private fleet-health binding stay
unchanged. A healthy/verified device or selected demo account cannot make analytics
available, and no catalog entry is inherited by another network.

Growth remains unavailable because comparable admitted metric snapshots do not
exist. Recommendation/viral status remains unavailable without an admitted permitted
traffic-source metric and approved definition. These fixed explanatory strings are
not formulas or a validator for future metric evidence. The projection accepts no
observations and cannot certify a supplied value, zero, source, time or freshness.

## UI and lifecycle

Consume the actual projection on each Tracking render. Visibly label the catalog as
planned display labels, not supported account/post metric definitions. Replace generic
availability copy with the selected network's reason, retain the UNAVAILABLE badge and em-dash
metric values, and expose the same reason as accessible description/title text.
Existing refresh controls stay unavailable. Network changes synchronously replace
labels/reasons and keep the existing account reset, phone focus and CSV invalidation
behavior. Account/phone selection, loading, error and demo snapshots cannot promote
availability. Do not add cached permissions or asynchronous callbacks.

Preserve V9 labels, section order, filter order, cards, metric grid, right monitor,
navigation and CSS. Clarify the existing growth/recommendation explanation without
new sections or redesign. CSV continues to contain only captured fleet registry
records; this slice adds no analytics columns, native save or clipboard/download.

## Implementation and verification

Expected production changes: one dependency-free UI presentation module and the
Tracking page only. Extend exact product/demo module maps and build-source inventories
for the actual new module. Add focused tests and register them in the existing test
batches; update quality bounds only if measured inventory growth requires it, with
exact-boundary tests retaining next-entry refusal. No dependency or workflow expansion.

Tests cover the exact nine catalogs/order, immutable nested outputs, deterministic
identity, hostile/unknown input with zero coercion/getter effects, and constant
unavailability with no permission/value/source fields. Actual Tracking composition
tests exercise all networks and loading/error/unavailable/demo/observed states,
selection changes, unchanged action denial, metric labels/reasons, derived-status
copy and preserved fleet CSV scope/lifetime. Retain existing fleet/UI regressions.

Independent design CLEAR and coordinator adoption precede production edits.
Independent implementation review precedes commit/publication. Freeze final files,
run strict product/demo compilers, both builds/manifests, graph, quality/dependency
checks and the complete registered aggregate. Serialize aggregates with the other
active lane. Publish the reviewed identical tree as a normal child of the current
public phase-10 head, with expected SHA and no force. Reverify ref/tree and exact-head
terminal hosted source CI. Rollback is the reviewed source delta, no data migration.

## Retained gates

P10-01 permitted sources, P10-02 provenance/freshness, P10-03 collection/history,
runtime P10-04 capabilities and P10-08 derived-metric formulas remain unimplemented
or unaccepted as before. No B-014 source/policy decision is invented. Browser/Electron
visual parity, target-host/native and physical-device tests are NOT_RUN; P1-06 stays
UNMET. No live service, account, secret, device, platform access or external action
is authorized by this informational display work.
