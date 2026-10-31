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
50/50, Python43/43, probe syntax, staged/unstaged diff and 81 local links PASS.
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
