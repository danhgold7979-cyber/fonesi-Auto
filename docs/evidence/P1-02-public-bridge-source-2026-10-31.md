# P1-02 public bridge — source checkpoint

2026-10-31 04:16 UTC, phase-01. [ADR-0006](../decisions/ADR-0006-foundation-ipc-admission.md)
approved 04:06 UTC before source; approval recorded in AGENTS/playbook/decision/status.
This supersedes only the earlier no-preload/zero-IPC scope for two public reads.
Original G0-12 20/21 FAIL, Phase 0 baseline/twelve exits and full V9 remain unchanged.

## Actual implementation and checks

- Strict flat bounded request parser rejects decoded duplicate keys; fixed public
  health/settings result, no path/device/account/process/secret/mutation method.
- Main-owned view-session with one controlled initial-load arm, sender/main-frame/
  origin/current URL checks, monotonic observed revocation and no rearm. No Document
  incarnation/pre-observation guarantee or human-gesture proof is claimed.
- Actual dispatcher is dependency-injected for tests; production passes real ipcMain.
  Synchronous public result construction/recheck has no external effect or await.
- Sandboxed preload exposes frozen health/settings wrappers only. Eight unresolved
  native slots remain occupied after 2-second caller timeout until settlement;
  late replies discarded, no retry. Canonical own-producer response serialization
  rejects root/nested duplicates and alternate whitespace/order; fixed errors only.
- Minimal React diagnostic mounts explicit read controls; no mount effect/automatic
  read/retry or renderer-driven arming. LIGHT initial default comes from V9 line 388,
  not copied reference JavaScript or persisted settings. No V9 redesign/integration claim.
- Exact renderer.js asset map and CSP self-script source; no network/path wildcard.
  Main/preload/renderer and source inputs are included in verified build manifests.

Full metadata/typecheck/esbuild/manifest/Node suite: **50/50 PASS**; Python strict
report suite **43/43 PASS**, including exact 25-case probe/schema agreement and old
zero-preload-contract rejection. Node syntax/diff checks PASS. No Electron runtime
or installer executed locally. Adapted Windows public-bridge cases **NOT_RUN**;
prior CI7 20/20 success remains evidence of its old zero-bridge configuration only.

Initial direct Node test rejected TypeScript parameter properties; ordinary explicit
class fields fixed it without a runtime flag workaround. Strict noEmit compiler uses
allowImportingTsExtensions for direct pure tests; actual esbuild bundles also verify.
Type-only import uses the existing .js convention. Typeless-package Node warning is
not silently suppressed or converted into a package-type change.

## Dependency provenance and restore

Six exact entries inherited from the reviewed desktop-stack-lab lock/review bring
closure from 61 to **67**: React/react-dom/types 19.3.0, csstype3.2.3, scheduler0.28.0.
Original registry URLs/integrities/licenses remain unchanged; no version guessed.
Inspected installed source package lifecycle metadata before restore: csstype's
prepublish command is recorded as never executed. Restore used npm ci --ignore-scripts
against registry.npmjs.org, then exact installed67 metadata/hooks/binary check before
compiler/build. No Electron install script or application was run.

The explicit --prefix restore initially placed its new npm cache at repository root
rather than desktop because cache paths resolve from cwd. The newly created owned
cache was moved without deletion into ignored desktop/.npm-cache/restore-20261031T0411;
old caches remained untouched. Subsequent restores must run with desktop cwd or an
explicit desktop cache path. No global package/security/proxy settings changed.

## Hosted test contract, pending execution/review

25 named cases per source/package retain all applicable isolation/resource/lifecycle/
crash/cleanup checks and add public health/settings, explicit React read, malformed
request and sender denials. Obsolete no-preload/no-bridge cases become explicitly
named approved-preload/bounded-public-bridge checks, not silently reused PASS labels.
Document.open may retain an allowed public-read principal before an observed event;
only fixed public output is allowed. Reload revokes and cannot rearm; about:blank
URL change still preserves old FAIL and direct actual-handler sender denial is tested.

The owned probe observes original ipcMain.handle registration and BOOTSTRAP_READY
logging without replacing the real handler/policy. It waits for main-owned readiness,
uses actual renderer wrappers for positives, and directly calls the captured actual
handler with real frame/window objects for negatives. This is explicit instrumentation,
not evidence of exposing generic invoke to the renderer or a native transport flood test.
No new preload is added by the probe; the application itself owns the approved preload.

Independent integration/envelope/docs review CLEAR at 04:21 UTC: fresh source/build
50/50, Python 43/43, probe syntax, staged/unstaged diff and 81 local links PASS.
All 67 dependency entries match inherited lock/review; frozen helper/baseline hashes
unchanged; owned test-output empty. No Windows execution by reviewer. No task/phase acceptance, target-host
support or later service authority follows from source tests. Root publishes/runs only
a reviewed coherent checkpoint; no main merge or live device/account actions.

Review corrections before hosted execution: denied about:blank with unchanged URL
requires SESSION_REVOKED, while changed URL requires UNTRUSTED_SENDER; neither can
accept success. Observed navigation-denial events also latch revocation. Genuine
owned initial-empty iframe metadata (no URL/preload/CSP change) is required for
subframe denial; no exposed child means failure, not skipped coverage. The probe
waits at most three seconds for React controls to mount before the one explicit
read; this is not an automatic application retry or renderer-driven arming.

## Exact-head Windows result — 2026-10-31 04:23 UTC

First public-bridge hosted run **SUCCESS** at remote
`e1e1cdae7d95cd161db4515cb21fad50a4646567`, tree
`d3e68dbc97fdb3b7d8b864d9e8f14a9f8e7b32df`:
[run 41168294925](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41168294925),
job 124440521096. Source/build **50/50**, Python **43/43**, PowerShell **25/25**;
source and instrumented package each **25/25** actual runtime cases PASS.

Artifact 13030465465 ZIP: 1,024 bytes, SHA256
`4720f2fc4d8b3a070bc1177ec85f97d3b1238f2d698c00397d8c20d44f734655`.
The [retained fixed-field JSON](P1-02-public-bridge-sample-2026-10-31.json) is
Git blob bytes are byte-identical to the downloaded LF-only original: 4,380 bytes, SHA256
`b614ecb2b3b37cffb6844bc59bdece084f342ed88f2b82476d49455e5a2f328a`.
Verified ZIP digest/size, single bounded entry and duplicate-aware JSON before retention.
This hash identifies artifact/Git blob bytes, not a Windows working copy potentially
converted by local core.autocrlf settings; inspect the Git blob for byte verification.

- Both modes: actual Electron 45.1.0 / Node 24.22.1 / Chromium 156.0.8078.49;
  approved preload, fixed health/settings and React read, strict request/sender/
  genuine child-frame denials, isolation/resource controls and orderly quit PASS.
- Source/package exit 0; owned bytes 1,231,396 /1,231,400. Every Job/capture cleanup
  true, no truncation. Installer official marker true.
- Crash expected NONZERO_EXIT 1 with armed/observed/bootstrapFailed true and
  unexpectedQuit false; owned bytes 1,231,392.
- Changed asset expected NONZERO_EXIT 1 with changed/bootstrapFailed true and
  unexpectedReady false; owned bytes 557,458.
- Build verification, binary equality, runtime copy and directory cleanup true;
  package bytes 374,866,334; failure null and aggregate passed true.
- Original-window document.open/reload URL observations remain unchanged; reload
  session denial passed. About:blank changed URL with no observed navigation denial,
  but actual handler sender rejection passed. Old G0-12 remains FAIL_RETAINED.

Independent artifact content review CLEAR at 04:24 UTC: duplicate-aware original
parse, strict 25-case schema reconstruction/public equality and privacy checks PASS.
Reviewer did not redownload ZIP or relaunch runtime. Reviewed report contains no
raw logs, private paths, credentials or caller request IDs. Historical CI7 and
G0-12 artifacts/results remain distinct, not overwritten or relabeled.

This establishes the approved public-bridge Windows runner behavior. It is not full
Phase 1 acceptance, target-host/Android support, persistent settings, V9 parity,
service authority or a main merge. Full-task disposition belongs to the coordinator
against canonical P1-02 and its explicitly reviewed prerequisites; no automatic
accepted-task numerator change is made in this evidence record.

## Bounded generated-input verification increment — 04:30 UTC

Coordinator approved the specific remaining P1-02 fuzz verification increment at
04:27 UTC; no new architecture/dependency/service. The normal source pipeline now
runs a fixed-seed `0x5a17c0de` xorshift campaign of **4,096 inputs** against the emitted
parser and **16,384 actual-dispatcher calls** across INITIALIZING/ACTIVE/REVOKED/CLOSED.
Sixteen mutation classes cover valid/whitespace reads, duplicate escaped keys,
malformed JSON, nested/nonstring values, invalid methods/versions, secret-field
canaries, UTF-8 boundaries, 511/512/513-byte boundaries and nonfinite numeric parsing.
Every accepted result must equal the exact allowed public JSON; rejected results
must be fixed errors, never throw, echo the synthetic canary or reach an effect API.

One generated input is retained at a time, maximum 1,024 UTF-16 units /2,048 UTF-8
bytes. Campaign deadline 5 seconds checked each iteration and after the final iteration;
Node test deadline 10 seconds. These checks/timers are cooperative, not preemptive
for a synchronously hung parser. The trusted child runner supplies the outer
30-second termination bound and 64 KiB capture cap. This bounds the finite
corpus/work, not whole-V8 peak allocation or hostile native transport. No random
network target, real credential/device, unbounded fuzz duration or new package.
Finite deterministic fuzz is additional evidence, not exhaustive correctness proof.
The pure parser bundle is now explicitly included in build integrity requirements.

A small existing-adapter regression closes the view-recreation composition check:
one handler admits first view, rejects it after close/removal, admits a freshly
initialized second view, and never rearms the old one. This is actual compiled
adapter logic with synthetic event emitters, not a claimed original-window native
reopen trace. It complements already measured native helper-window lifecycle and
fresh source/package app launches. No additional service or generic IPC was added.

Local complete pipeline **52/52 PASS**, Python **43/43 PASS**. Independent review
CLEAR at 04:32 UTC: fresh 52/52 and 43/43, diff and 9 local links PASS; finite oracle/
bounds/reopen qualifications verified. New exact-head Windows run remains pending. Prior actual runtime25/25
is retained separately; current formal task/prerequisite acceptance remains pending.

## Generated-input increment: Windows PASS — 04:35 UTC

Exact remote head `ff25bee9cff5db7e2018b0a503a2791a4603c223`, tree
`2046a4d474344f75ca406a888f3c21152e7eb699`:
[run 41169068159](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41169068159),
job 124442878218 SUCCESS. Actual Windows source/build **52/52** includes the bounded
seeded campaign and fresh-view regression; Python **43/43**, PowerShell **25/25**.
Actual source/package **25/25 each**, crash/tamper expected exit 1, every Job/capture
and directory cleanup true, no truncation, all build/binary/copy checks true.

Artifact 13030442649 ZIP: 1,023 bytes, SHA256
`ca37dcbb670d9de2f81b9595482815286e9781a3b98d4c9fd6dc8ae30af12ddd`.
[Retained fixed report](P1-02-public-bridge-fuzz-sample-2026-10-31.json) Git blob bytes
match downloaded LF-only original: 4,380 bytes, SHA256
`fcbaf2b57574b25dd672b1404cfa1ad5902fbeee0e81241abd2cd0080553e46a`.
Hash refers to artifact/Git blob, not a potentially newline-converted Windows copy.
Verified bounded ZIP digest/single entry and duplicate-aware parse before retention.
Source/package owned bytes 1,231,398 /1,231,400; crash 1,231,390; tamper 557,458;
package 374,870,614. Runtime versions unchanged. Both about:blank URLs changed with
no observed navigation denial; actual sender denial passed and old FAIL_RETAINED.

The named generated-input evidence gap is now closed on Linux and hosted Windows.
[Canonical audit](P1-02-canonical-criterion-audit-2026-10-31.md) distinguishes task-specific
technical evidence from formal predecessor acceptance. No further P1-02 research or
new surface is inferred. Full P1-03/P1-11, phase gates and main merge remain separate.
Independent new artifact content review CLEAR at 04:35 UTC: strict schema/public
equality, hash and privacy checks PASS, without reviewer redownload/runtime rerun.
Coordinator accepted P1-02-specific TECHNICAL_PASS at 04:36 UTC; formal task remains
DEPENDENCIES_PENDING for P1-03/P1-11. No full task/phase acceptance is asserted here.
