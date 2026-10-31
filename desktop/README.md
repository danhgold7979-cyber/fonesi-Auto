# Auto desktop foundation — partial P1-02

Actual main/bootstrap, owned lifecycle and resource-policy source. **Not a complete
application, V9 replacement, accepted security architecture or release.** Canonical
task remains P1-02; this checkpoint adds no task/percentage denominator.

## What exists / does not exist

- Main-owned window lifecycle, private session, exact canonical owned asset map,
  restrictive CSP, denied permissions/downloads/popups/webviews and observed navigation. The default native application menu is explicitly removed.
- Explicit sandbox/contextIsolation/webSecurity, Node integration off (including
  workers/subframes), no insecure-content/devtools/plugin escape setting.
- **No preload, application IPC/bridge, dispatcher, external opener, device/account,
  settings/DB/vault or process service.** Normal Electron/browser and owned profile
  activity is not claimed to have zero OS effects.
- Static UNAVAILABLE boot diagnostic under tests/fixtures. No product UI is replaced
  and no React/V9/manual-control requirement is removed. No mocked working devices.
- Failure cleanup latches shutdown before disposing owned windows/session handlers;
  no recursive crash callback or untouched session due to app.exit bypassing will-quit.

Source paths: `src/main.ts` is bootstrap; `src/main/lifecycle.ts` is independently
unit-tested ownership state; `asset-policy.ts` is the exact URL and fixed asset hash;
`window-policy.ts` wires Electron controls; `profile-owner.ts` validates a fresh owned
root and creates only its profile/session/log/crash subdirectories. No test/tooling
module is imported by main. Tooling must never import `build/main.cjs` or Electron
in Node tests: the Electron package can auto-install on import.

## Verified dependency/tool boundary

Existing reviewed candidates: Node 24.22.1, Electron 45.1.0, TypeScript 7.0.2,
esbuild 0.28.2, Node types 24.19.2. The exact recursive 61-entry lock is inherited
from the existing reviewed Auto lab lock, not fresh range selection. Prior file
SHA256, complete metadata and reviewed script hashes are recorded in
`dependency-review.json`. npm 11.9.0 is observed locally; 11.19.1 was observed on the
prior Windows runner. The new verifier explicitly permits those versions without
pretending the environments identical or changing the pure foundation's old gate.

Every npm lifecycle script is disabled on restore. Installed prepare/prepublish/
postinstall command strings are recorded as **never executed**, including husky,
package build/prebuild checks and esbuild install.js; mismatches fail. Only a future
separately reviewed official Electron installer may execute explicitly under the
owned Windows supervisor. No Electron binary was installed/launched for this local
checkpoint. esbuild binary and reviewed installer/package script hashes are checked
before build. npm verifies tarball integrity on restore. These are reviewed-policy
checks, not protection against a malicious editor changing checker and snapshot.

## Development checks

From repository root on this Linux environment:

```sh
env -u NODE_PATH node desktop/scripts/check.mjs
```

This clears only inherited NODE_PATH for that child command, not a host/global
setting. NODE_OPTIONS or other unreviewed overrides must not be enabled. On a
reviewed fresh environment without NODE_PATH, use `node desktop/scripts/check.mjs`.
Add `--restore` only when an owned dependency restore is needed. The runner uses the
existing Node installation's npm CLI, verifies its actual version, and executes
metadata → optional scripts-disabled restore → installed checks → strict compile →
build → manifest → tests. Any false result or exception stops later stages. No
semicolon fall-through, generic shell command or automatic runtime download.

The source check currently passes 32/32 tests; full Windows execution is NOT_RUN.
Test tooling uses bounded child invocation (30 seconds/64 KiB, restore 120 seconds),
not arbitrary-child-tree containment. Runtime/installer Windows supervision is a
separate upcoming implementation, not claimed from these local tests.

## Build/launch integrity and owned outputs

Build checks the fixed fixture hash before writing bundles. It invalidates the old
success marker before dependency/build work, then records a fresh manifest of exact
source inputs and output hashes only on success. A partial/missing/stale manifest
fails verification. Main validates its own built files and fixed asset before load;
a future trusted launcher must also call verifyBuild against current source before
packaging/launch. Remaining files after a failed build are not successful artifacts.
No signing or malicious-editor/hostile-filesystem-race guarantee is implied.

Generated `build/`, `node_modules/`, `.npm-cache/`, `.runtime/` and `.test-output/` are
ignored. Tests create unique owned directories, verify parent/child realpaths and
no symlink before cleanup, and leave the test-output directory empty. Profile root
must be fresh, named `fonesi-auto-foundation-*`, contain only the exact `.owner`
marker and no reparse/symlink alias. No default/user profile or arbitrary root is
accepted. Ownership validation is not a concurrent malicious-local-user race proof.

Do not launch Electron manually at this checkpoint: the trusted bounded launcher,
actual runtime probes and separate phase-01 workflow are still pending review/code.
No --no-sandbox fallback is allowed. Main's switch/environment guards are defense in
depth; they cannot undo effects of native startup flags before application code.

## Honest security limit

Exact raw strings are checked by pure policy tests. Chromium may canonicalize URLs
before handlers; a normalized alias to the same exact owned asset is not claimed
lexically rejected. No arbitrary URL-to-filesystem conversion exists. Observed
navigation handlers do not prove that about:blank/document.open cannot transition.
Original G0-12 source/package 20/21 navigation FAIL remains unchanged. Zero exposed
application authority is useful here but does not solve full manual/scheduled
service authority or permit those future methods to be enabled. Full V9 and C-03
remain obligations, not permanently disabled features.

The separately scoped Windows execution envelope and strict artifact contract are
implemented under [verification](verification/README.md); actual Windows results
remain NOT_RUN pending reviewed publication/CI. No original navigation gate or
full P1-02 acceptance follows from source checks.
