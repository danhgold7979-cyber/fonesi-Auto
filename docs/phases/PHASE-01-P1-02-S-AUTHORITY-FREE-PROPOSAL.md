# P1-02-S — Authority-free bootstrap/lifecycle proposal

**2026-10-31 02:04 UTC proposal; bounded implementation approved at 02:08 UTC below.**
Canonical task remains **P1-02**. The historical -S suffix denotes partial scope
only, not a new task, nested phase or percentage denominator.

Branch: `phase-01`. This is actual foundation source work, not another stack-version
lab, full P1-02 acceptance, a V9 replacement or a security-requirement amendment.
User delegated continued Auto implementation while requiring unchanged product scope;
The initial authorization covered this proposal only; the appended 02:08 UTC entry
now governs bounded implementation. Full task/Phase acceptance remains unapproved.

## 1. Concrete decision and useful deliverable

Select **zero application IPC bridge** for this subset: no preload, ipcMain handler,
contextBridge export, message-port authority or application-exposed native operation.
Create reusable main lifecycle/window and exact owned-asset policy modules, build
configuration and source/package smoke tests. The renderer surface is a static,
truthful UNAVAILABLE boot diagnostic fixture, not product UI or mocked working data.
No React/V9 integration is attempted here; C-05 React and full V9/manual controls
remain later obligations. The diagnostic page is not a replacement layout.

This advances P1-02's real startup/window/close/resource boundary and integrates a
reproducible source/build pipeline. It is not merely another Electron version check.
No document-incarnation proof is needed for the narrow property that the application
exposes no IPC/data/effect authority at all. Browser UI availability can still fail.
Absence of an application bridge does not prove the entire browser/OS has no effects.

Original G0-12's 21 assertions/artifacts and source/package 20/21 navigation **FAIL**
remain untouched. ADR-0005 A remains the default full-service blocker; B's identity/
ordering proof and C's full manual-authority model are unresolved. No requirement
is deleted or silently weakened. This subset must never be reported as full P1-02
security acceptance or proof that future services can safely be enabled.

## 2. Exact proposed source boundary

- `desktop/package.json`, `package-lock.json`, `dependency-review.json`, `tsconfig.json`,
  `.gitignore`, `README.md`: private internal foundation build, provenance and commands.
- `desktop/src/main/lifecycle.ts`: main-owned startup/close, window references,
  owned profile/session configuration and deterministic disposal; no service registry.
- `desktop/src/main/asset-policy.ts`: exact immutable URL-to-bundled-asset map and
  request/permission/navigation/window denials; never convert arbitrary URLs to paths.
- `desktop/src/main.ts`: bootstrap wiring only. No preload file or bridge module.
- `desktop/tests/fixtures/unavailable.html`: static boot smoke surface; no app/mock data.
- `desktop/tests/`: pure policy/lifecycle contracts, source-surface audit and actual
  Windows runtime probes with fixed, sanitized results. No real user resources.
- `desktop/scripts/`: reviewed build/dependency verification and owned Windows smoke
  supervisor/validator; scripts are development tooling, not runtime services.
- `desktop/build/`, `.runtime/`, `.test-output/`, `.npm-cache/`: ignored owned outputs.

No imports from test/tooling into main source. Main may use only Electron lifecycle,
window/session/protocol controls and bounded reads of its own bundled assets/profile
ownership metadata. No child-process service, arbitrary filesystem API exposed to
renderer, settings, DB, vault, device, account, publishing or OS-key access. Normal
Electron-managed profile files are isolated in owned smoke directories before ready;
this is not production persistence design. No user-data/default profile is opened.

## 3. Candidate dependencies and source basis

Reuse only already reviewed candidates: Node 24.22.1, Electron 45.1.0,
TypeScript 7.0.2, esbuild 0.28.2 and Node types 24.19.2. Prior observed npm versions
are 11.9.0 locally and 11.19.1 on the hosted Windows candidate. Record and verify
the actual per-environment version; do not pretend identical npm environments or
install an unreviewed npm package merely to align them. The new desktop checks may
explicitly allow those two reviewed versions; existing foundation checks remain
unchanged and must not receive a fabricated version argument. Derive the minimal exact
recursive closure from the existing [reviewed lock](../../tools/phase-00/desktop-stack-lab/package-lock.json)
and [review snapshot](../../tools/phase-00/desktop-stack-lab/dependency-review.json).
No fresh range resolution or guessed package version. React is not needed for a
static test fixture; that does not change the approved production React direction.
Record all direct/transitive origins, SHA512 integrities, licenses and lifecycle
scripts before restore/execution. npm restore disables scripts; verify installed
metadata first. Execute only the separately reviewed official Electron installer
with checksum verification and bounded owned supervision. No mirror/override,
unpinned fallback, global SDK or automatic npm upgrade. Electron's MIT label does
not cover bundled Chromium/Node/third-party components; retain official notices.

Existing [candidate evidence](../evidence/G0-12-hosted-stack-lab-2026-10-30.md)
proves availability on a hosted runner, not this new source or target-host support.
Exact-tag primary documentation inspected on 2026-10-31:
- [Protocol API](https://raw.githubusercontent.com/electron/electron/v45.1.0/docs/api/protocol.md):
  handlers belong to their session; scheme registration is before ready. Use only
  needed standard/secure flags, never bypassCSP/service-worker/fetch privileges by
  default. Return fixed owned bytes, not a generic net.fetch/path proxy.
- [Web preferences](https://raw.githubusercontent.com/electron/electron/v45.1.0/docs/api/structures/web-preferences.md):
  sandbox/context isolation/web security enabled, Node integration disabled including
  workers/subframes, nonpersistent isolated session. Actual source/runtime checks
  still required; documentation is not execution evidence.

## 4. Required security and lifecycle contract

1. Explicit sandbox, contextIsolation and webSecurity true; Node integration false.
   No `--no-sandbox`, web-security disable or fallback on launch failure.
2. No preload/bridge/application IPC registration, generic process/file/secret APIs,
   external opener, webview, popup or permission grant. Remove the default native application menu before creating windows and verify
   menu-null in the future Windows probe. Cancel will-download in the
   owned session; do not expose shell.openExternal or an OS-protocol delegate.
   Unknown external protocols remain unsupported; tests must not invoke real OS handlers. Unknown methods cannot resolve
   to a service because no application dispatcher exists. Audit complete source and
   built output; renderer tests must not rely solely on one missing global variable.
3. Serve only exact owned diagnostic assets under a dedicated app scheme/session.
   Reject unknown canonical host/path, query, unexpected methods, subresources and
   protocols. Pure raw-string policy tests reject lexical traversal/encoding forms;
   browser request URLs may already be normalized. Canonical aliases reaching the
   same exact owned asset are not an arbitrary-path escape, and erased raw syntax
   cannot be claimed observed/rejected by protocol.handle. Record that distinction. Restrictive CSP, no inline/eval/remote code or network
   connections. Deny requests by default; deny all permission request/check paths.
4. Keep navigation/window guards, but do not infer they prevent every transition.
   Record original-window about:blank/reload/document.open observations separately.
   No Stop-from-navigation callback workaround, automatic reload or replay recovery.
5. Smoke launch validates exclusive owned marker/directory before Electron ready and
   sets userData/sessionData/log/crash paths there. No actual user profile. Lifecycle
   disposal unregisters owned handlers/listeners and closes owned windows only.

## 5. Verification matrix

| Layer | Positive control | Required negatives / limitations |
|---|---|---|
| Linux source/build | Exact metadata, strict compile, reproducible bundle and fixed owned asset hashes | Wrong versions/integrity, forbidden runtime imports/bridge registration, unknown assets and unsupported resource forms fail nonzero |
| Pure policy | Exact asset admitted; lifecycle transitions modeled explicitly | Unknown canonical URL/method, raw-parser traversal/encoding, duplicate startup/disposal and forbidden service names rejected; pure tests are not runtime proof |
| Windows actual source | Launch exact source bundle; render diagnostic; verify actual secure settings, no Node globals/preload/application bridge; orderly close | Crash/load failure/close-reopen release owned resources; no new service/effect method before or after navigation |
| Original-window transitions | Observe about:blank, same URL reload and document.open separately | UI loss or navigation is reported, not converted into old navigation PASS; no claim every document transition is observed |
| Assets/network/permissions | Exact fixture read succeeds | Unknown owned fixture/resource and permission/window requests denied; network negatives run in an isolated offline test session as a safety envelope and must independently observe the policy denial, not count offline failure alone as PASS |
| Internal package copy | Hash-verified copy launches same actual source and diagnostic | Missing/changed asset, wrong binary/notice or partial output fails; no installer/signing/distribution claim |
| Ownership/evidence | Verified owned process-tree retirement and directory cleanup | Timeout/truncation/missing stage/unknown output/cleanup failure fails closed; never serialize arbitrary errors, URLs or paths |

No tests invoke devices/accounts/credentials, real remote service or host security
changes. Offline session controls apply only to the test's own Electron session,
not host proxy/firewall/network settings. Tests do not claim manual input authority,
production IPC, V9 parity, data confidentiality for future services or target support.

## 6. Bounds and Windows runner plan

Linux can execute metadata, strict compile/build and pure tests. This environment's
GUI/runtime availability is not assumed. Windows evidence requires a newly reviewed
**phase-01-scoped** workflow, not editing/rerunning the old Phase 0 lab workflow.
Proposed `.github/workflows/phase-01-desktop-foundation.yml` uses existing pinned
trusted checkout/setup/runtime/artifact actions, paths scoped to new desktop source
and the unchanged shared supervisor helper it actually consumes. Coordinator must
approve this workflow as part of implementation; no hosted run is claimed now.

Reuse the unchanged native suspended-start/Windows Job ownership helper for trusted
installer/runtime children; keep wrapper deadlines and cleanup verification. Proposed
installer budget 120 seconds plus 10 cleanup; each source/package probe 30 seconds
plus 10 cleanup; bounded supervisor fallback. No unbounded PID-only taskkill promise.
Capture each stream at most 32,768 UTF-16 characters; fixed JSON report at most 64 KiB
UTF-8, read at most 65,537 bytes before rejection. Exact schema/duplicate rejection,
fixed codes/booleans/counts only; no raw stdout, paths, screenshots or private fixtures
uploaded. Missing runtime evidence is NOT_RUN/FAIL, never synthetic PASS.

Own profile/build outputs: post-run 8 MiB each; depth 16 and 256 entries, lazy traversal
and no symlink/reparse following. Exact verified runtime distribution is separate,
with manifest/hash checks and a 512 MiB post-run size ceiling. These are defensive
lab/build ceilings, not supported capacity or hard peak-disk/memory guarantees.
Delete only fully validated owned trees after verified Job cleanup; do not clean an
uncertain tree to hide failure. Unknown runtime size/compatibility fails for review,
not a silently increased bound. All actual Windows outcomes currently NOT_RUN.

## 7. Full-service blocker and next entry

The unresolved production decision is trustworthy manual/scheduled authority while
preserving full V9 and C-03 unattended operation. Origin checks are not originating
Document identity; native dialogs/input interception are not by themselves secure
human-intent proof. Neither the host ZIP nor zero-bridge shell proves that future
manual taps, Home/Back, APK/proxy changes or calendar actions can safely be enabled.
Further exact-source/design work is ours, not a missing-user-data excuse. Keep those
requirements, not a permanent unavailable-only product or prompt-per-job substitute.

On approval: record scope/time before code; implement dependency/module boundary
first, then source/build/pure tests, independent review, and only then authorized
hosted Windows verification. Preserve old labs, the original Phase 0 plan bytes and
all 12 exits. No full task/Phase acceptance or activation follows from this subset.

## Bounded implementation entry — 2026-10-31 02:08 UTC

Root approved this partial P1-02 implementation after the canonicalization and
application-exposed-authority clarifications above. Entry recorded before source:
zero bridge/preload, exact owned assets, download/external-open denials, mandatory
sandbox/isolation/web security and no Node renderer; no V9 replacement or service.
Approved minimal verified dependency closure, scripts-disabled restore and reviewed
checksum-verified official installer; separate phase-01 Windows workflow only after
static/source/test review. Implement main/lifecycle/build/pure tests first and return
a reviewed checkpoint before publication/hosted execution. Root owns publication.
Original 21-case failure and full manual-authority decision remain unresolved.
