# P1-01 actual module graph — source checkpoint

**2026-10-31 05:30 UTC · implementation under the approved
[module-graph contract](../phases/PHASE-01-P1-01-MODULE-GRAPH-CONTRACT.md).**
No new package/service/application authority. Root publishes; main unchanged.

## Implementation

- `desktop/module-map.json`: all 11 actual modules, exact named imports and type/value
  kinds, explicit renderer/preload/main/pure ownership. Future worker roles stay
  documented, not implemented placeholders.
- `desktop/scripts/check-module-graph.mjs`: bounded plain-source inventory, restricted
  static source import grammar, registered target/binding/layer/cycle validation
  **before** esbuild resolution. The parser's onResolve/onLoad use only already
  validated in-memory source or reviewed external edges; no arbitrary application
  filesystem fallback. Generated React JSX-runtime is distinguished from authored
  source imports. Type-only edges remain checked although runtime output erases them.
- Existing runner and direct build both invoke the graph gate. Build manifest binds
  module-map/checker bytes. No Electron/application module is imported/executed by
  graph tests; write:false parsing is not falsely used as a read-containment proof.
- Reviewed TypeScript7.0.2 scanner and esbuild0.28.2 are existing locked packages.
  Observed scanner entry SHA256 `aa95c0544bb2a42541421ab0ec2c1dc41b7b1f75f0694e28d8caa33e120d8c22`,
  scanner implementation `a5e29430a9414acc5e6f3ede98c255394801dcbb3626010075860c03e676a057`.
  Dependency lock/versions/licenses are unchanged by this task.

## Review-driven defects and limits

The first test caught TypeScript's RequireKeyword classification (plain/escaped
require), not Identifier. Independent review then demonstrated valid TSX quote,
comment, backtick, regex and split-span forms hiding dynamic loaders from standard
scanning; esbuild erased dead branches and therefore could not repair source-edge
coverage. Those failed attempts were not accepted evidence.

The final limited `.tsx` grammar rejects import/export/require words in every
opaque lexical token, including after rescans, regardless of brace co-location.
This conservatively rejects harmless code-like opaque text too; it is explicit
unsupported syntax, not a full JSX parser. Plain TypeScript literal and ordinary UI
text positive controls, actual renderer, and the reproduced variants are tested.
Type-only named/star reexports and external reference/bypass directives are denied
before erasure. Reflection/computed capability access and malicious edits to the
policy/checker itself are outside this development import-graph proof; existing
runtime isolation/IPC tests remain required.

Source cap 1 MiB/file, 64 registered modules, inventory128 entries/depth8, token cap
200,000/file; checker child30s/64KiB via existing runner. These are validation/time/
output bounds, not a hostile-native peak-memory guarantee. Tests use exclusively
created temporary trees and remove only their fixed owned entries, nonrecursively.

## Local executed results

Actual current graph: **11 registered modules / 11 runtime parser inputs PASS**.
Full strict desktop pipeline: **85/85 PASS** (63 existing + 22 graph/bootstrap fixtures),
including current lint/formatter, strict compiler, graph, build and manifest checks.
Graph cases cover exact positives, forbidden renderer/preload/contract imports,
wrong type/value bindings, unknown source/package, escaped/absolute/query/missing
imports, dynamic/dead-code loaders, unsupported forms/type reexports/directives,
allowed-edge value/type cycles, a real transitive renderer→contract→main-adapter
rejection, actual symlink/unregistered filesystem inventory and limited JSX policy.

Independent source review CLEAR at 05:31 UTC: current desktop84/84,
foundation86/86, Python43/43 and nine additional reviewer adversarial probes PASS
(the nine probes are not added to checked-in suite counts). Both reproduced
blockers are closed. No application runtime was executed by reviewer. Exact-head
Windows execution remains pending. Earlier
P1-03 Windows evidence is environment/bootstrap provenance, **not** a claim that
this new graph suite has already run there. Original Phase0 baseline/12 exits and
old navigation FAIL are unchanged.

## Canonical P1-01 criterion mapping

| Original criterion | Current evidence / remaining step |
|---|---|
| Clean independently designed module/package map and explicit ownership | Actual 11-module map plus existing foundation map and canonical future-worker ownership; no fonesi-W source reuse |
| Import directions, renderer only approved UI/contracts | Exact source binding/layer policy + restricted runtime parser cross-check; current React renderer positive; forbidden/transitive negatives |
| Reviewed dependency/license inventory and pinned bootstrap | Existing desktop78/foundation23 reviews/locks, unchanged here; named fresh Windows evidence on ee7e04de; new exact graph head rerun pending |
| Forbidden renderer→privileged imports and circular fixture reject | Source negatives; cycles have individually allowed edges and actual const/type exports so earlier edge rejection cannot masquerade as cycle coverage |
| Missing dependency/runtime fails readably, no unpinned fallback | Actual owned copied-verifier CLI: metadata-only positive PASS, absent node_modules gives exit1/fixed DEPENDENCY_CHECK_FAILED, no install/cache created. Existing wrong-runtime/version fixtures retained; this does not claim an absent Node executable was run. Graph has fixed codes and no installer fallback |
| Boundary tests on named host | Local85 PASS; approved named Windows development-machine run of new graph still pending |
| Rollback / owned cleanup | Revert map/checker/dependent manifest as a unit; no global SDK/cache deletion; owned negative fixtures clean up fixed entries only |

Development-foundation pins were explicitly selected at 05:14 UTC, separately from
ADR-0001's product target-host/support/feasibility gates. No C-07/HC09/HC13/device,
OCR, V9 parity or full Phase0/Phase1 acceptance is inferred from this map. Status
remains in progress until independent review and the exact Windows verification.

Reviewed checker SHA256:
`e2a062866648eaac3b8c01a3b2166ecafdd9bed1330ae427e2dbf4eca1461faf`.

## Actual missing-installation negative — 2026-10-31 05:35 UTC

Review correctly distinguished earlier simulated INSTALLED-false/version fixtures
from actual absence. A new exclusively owned temporary fixture copies the real
verifier and exact metadata/provenance files, reads the actual npm version, then
runs the verifier CLI. Metadata-only control succeeds (78 entries); installed check
with absent node_modules exits1 and emits only DEPENDENCY_CHECK_FAILED. It creates
no node_modules or package cache. Real installed dependencies/caches are untouched;
fixed copied files/directories are removed nonrecursively. This verifier has no
network/process downloader path; no unsupported global-runtime installation is
attempted. Full current desktop pipeline **85/85 PASS**; final follow-up review is
pending. The previous 84-test independent run is retained as a dated milestone.

## Final independent closure — 2026-10-31 05:37 UTC

Current full desktop **85/85 PASS**, final source/docs CLEAR, 100 local links and
diff check PASS. Actual absence fixture closes the review qualification without
modifying shared installs/caches. Unchanged prior foundation86/Python43 and nine
separate adversarial reviewer probes remain correctly attributed. Original Phase0
baseline unchanged. Test SHA256:
`0c212a6e02a2f60c3cfd8e2307da9f015c692afcc38544f5e3b85b49770ff528`.
Exact-head Windows verification is next; no full task/Phase acceptance is asserted.
