# P1-01 actual desktop module/import contract — proposed completion scope

**Initial proposal: 2026-10-31 05:11 UTC. Current: scoped implementation approved at 05:14 UTC; full task acceptance pending.**
Canonical task remains P1-01, not a new task or percentage denominator. Close the
actual missing whole-desktop architecture/import-graph criterion using existing
pinned tools. No new package, service, device action or V9 UI work.

## Existing evidence and exact gap

Foundation already has a pure-contract map, forbidden imports/cycle fixtures,
reviewed 23-entry closure and named Windows bootstrap. Desktop has the real secure
public-read shell, reviewed 78-entry closure and Windows source/package evidence.
P1-03 tooling is technically verified. Existing desktop no-service string checks
and foundation-only graph checks do **not** enforce the whole desktop import map.
That is the specific software gap; a host ZIP cannot establish import direction.

## Proposed current map (all paths relative to desktop/src)

| Module | Responsibility | Allowed source/package edges |
|---|---|---|
| renderer.tsx | Public diagnostic React view only | react, react-dom/client; generated React JSX-runtime edge separately recognized from reviewed build |
| preload.ts | Sandboxed two-method bridge adapter | electron named contextBridge/ipcRenderer; ipc-contract, preload-client |
| ipc-contract.ts | Pure wire grammar/fixed public values | No imports |
| preload-client.ts | Pure bounded promise/response policy | ipc-contract only, including existing type-only edge |
| view-session.ts | Pure observed admission lifecycle | ipc-contract type only |
| foundation-bridge.ts | Main-owned read dispatcher | electron types only; ipc-contract, view-session, main/asset-policy |
| main.ts | Trusted bootstrap/lifecycle owner | electron; node:fs/path/crypto; foundation-bridge and the four main helpers below |
| main/asset-policy.ts | Pure fixed asset vocabulary | No imports |
| main/lifecycle.ts | Pure resource ownership | main/asset-policy type only |
| main/profile-owner.ts | Owned runtime-profile I/O | node:fs/path only |
| main/window-policy.ts | Main-only Electron session/window adapter | electron types only; main/asset-policy |

The map enumerates **actual current files**; no wildcard node:* or arbitrary package
allowance. Main/preload/renderer cannot import scripts/tests/verification/generated
outputs. Local imports resolve only to a registered source module, with explicit
existing .js→.ts and .ts spellings; query/hash/escaped/absolute/unknown aliases and
missing targets reject. Type-only edges count for architectural policy and cycles,
even though the emitted JavaScript erases them. Source inventory rejects unknown
files/symlinks before graph acceptance. Future UI/modules require a reviewed map
extension, not a silent wildcard bypass.

Future Device Host and Python Vision Worker are **reserved architecture roles** in
[canonical architecture](../02_TECHNICAL_ARCHITECTURE.md), not implemented stubs:
main will own controlled service boundaries; renderer remains typed IPC only;
Python never acquires independent device-input authority. No future worker/runtime
package is added merely to populate this map.

## Enforcement and bounded tests

Expected source files: `desktop/scripts/check-module-graph.mjs`,
`desktop/tests/module-graph.test.mjs`, and a reviewed explicit module-map data file;
wire the check into the existing fail-fast development runner before build/tests.
Update desktop architecture/bootstrap instructions and criterion evidence only.

- Before invoking esbuild, perform bounded plain-file inventory, parse source edges
  and validate every local target against the exact registered map. The esbuild
  resolver must then permit only those already-validated modules/external packages;
  write:false alone is not a filesystem-resolution boundary. Do not let the parser
  discover arbitrary parent directories/node_modules as application source.
- Enforce binding kind as well as module name: preload's Electron value imports
  are exactly contextBridge/ipcRenderer; main-only adapters may use only the mapped
  Electron type imports, not convert them into runtime imports. Record per-binding
  type/value classification for mixed forms such as `ViewSession, type Caller`;
  an import-type declaration makes all its bindings type-only. Unsupported default,
  namespace, import-equals or alias forms fail closed until explicitly reviewed.
- Reuse exact reviewed TypeScript 7.0.2 scanner for a deliberately limited static
  import-declaration grammar (including type-only declarations). Existing source
  uses top-level literal imports; unsupported dynamic/import-equals/re-export or
  ambiguous forms fail closed rather than disappear from the graph. Do not claim
  this scanner is a full semantic parser or hostile-code sandbox.
- Cross-check actual runtime dependency edges with existing esbuild 0.28.2 parser/
  metafile output, write:false, externalizing only reviewed packages. No importing
  or executing Electron/application bundles in Node tests. Type-only policy remains
  a separate source-graph obligation, not inferred from erased metafile edges.
- Strict tsc7 independently checks syntax/types. If the limited scanner cannot
  unambiguously handle an actual current form, report that form and extend only with
  executable fixtures; do not skip files or invent an unavailable parser API.
- Bound source files to 1 MiB each, 64 registered modules/depth 8; fixed child
  checker deadline 30 seconds and output 64 KiB. These are development validation/
  execution limits, not arbitrary hostile-input or native peak-memory guarantees.
- Positive: actual source map and current renderer dependencies pass; exact local
  resolution/type-only edges preserved; clean bootstrap still uses pinned metadata.
- Negative: renderer→electron/node:fs/main/profile-owner, preload→main/service,
  contracts→tooling, unknown external dependency/source, escaped/absolute/missing
  import, unregistered file/symlink, dynamic require/import and circular fixture
  all reject with fixed named codes and nonzero aggregate stage.
- Include a cycle fixture whose individual edges are allowed so cycle detection is
  independently exercised, not accidentally passed by an earlier forbidden-edge
  check. Include type-only cycle and transitive renderer→privileged edge fixtures.
- Include comments/string/template/JSX fixtures so lexical text cannot silently
  create or hide an import edge; unsupported syntax is explicitly rejected. Current
  rendered React source must pass the real compiler/parser, not a substitute mock.
- Existing desktop63/foundation86/Python43/PS25 and real source/package25 tests remain
  required; new tests add coverage without replacing them. Named Windows clean
  checkout reruns the same map/negative fixtures. No new workflow/framework needed.

## Stack and acceptance disposition needed

C-05 and ADR-0001 already select Electron/TypeScript/React direction. Current exact
pins and licenses have development/source/package evidence, but ADR-0001's product
host matrix/performance/OCR/device requirements are still pending. Coordinator may
record exact **development-foundation** pin selection for P1-01 using the existing
reviewed evidence, without rewriting ADR-0001 or accepting all Phase 0 compatibility.
No Windows10/user-host/C-07/HC09/HC13/old navigation gate waiver is proposed.

After graph enforcement, compare every P1-01 deliverable/positive/negative/evidence
criterion to actual results. Main/worker ownership documentation and import rules,
reviewed dependencies, readable missing-runtime failure and clean named Windows
bootstrap must all be present before technical/formal status is decided. P1-03's
P1-01 predecessor gate cannot be removed merely because its own tooling tests pass.
Rollback map/checker/config together; remove only owned generated fixture outputs.

## Independent design review — 2026-10-31 05:14 UTC

Read-only review CLEAR: all 11 modules/current imports match; bounded source/target
validation precedes esbuild, binding-kind/preload rules and generated JSX distinction
are explicit, future workers remain unimplemented roles. Diff check PASS. No build,
runtime or implementation authorization arose from this documentation review.

## Coordinator implementation entry — 2026-10-31 05:14 UTC

Coordinator approved this exact contract and reviewer clarifications under delegated
Auto implementation authority. Record entry before source. Existing reviewed exact
Node24.22.1/TypeScript7.0.2/esbuild0.28.2/Electron45.1.0/React19.3.0 and Biome2.6.4
pins are selected for this **development foundation** and named Windows evidence,
not target-host/product support or general Phase 0 acceptance. No new dependency,
service, worker, device/account operation or V9 change. Implement/test map and
negative fixtures, independently review, then local commit; root publishes.

## Implemented grammar clarification — 2026-10-31 05:30 UTC

Standard scanner mode is not a full JSX parser. The current `.tsx` policy therefore
rejects the module-edge words import/export/require in any opaque string/comment/
template/regex token, including after slash/template rescans, independent of brace
co-location. This deliberately rejects some harmless code-like text rather than
allowing JSX quotes/comments to hide loaders that esbuild later erases. Ordinary
UI text and the actual renderer are positive controls. `.ts` literals are handled
separately; code-like opaque brace spans and escaped identifiers remain unsupported.
Type-only named/star reexports and compiler-bypass/reference directives also reject.
No reflection/capability sandbox or general TypeScript/JSX grammar claim is made;
future source requiring an unsupported form needs a tested policy/parser revision,
not a V9 feature cut or silently skipped source.
