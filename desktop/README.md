# Auto desktop foundation — partial P1-02

Actual main/bootstrap, owned lifecycle and resource-policy source. **Not a complete
application, V9 replacement, accepted security architecture or release.** Canonical
task remains P1-02; this checkpoint adds no task/percentage denominator.

## What exists / does not exist

- Main-owned window lifecycle, private session, exact canonical owned asset map,
  restrictive CSP, denied permissions/downloads/popups/webviews and observed navigation. The default native application menu is explicitly removed.
- Explicit sandbox/contextIsolation/webSecurity, Node integration off (including
  workers/subframes), no insecure-content/devtools/plugin escape setting.
- Approved sandboxed preload and two public read-only IPC methods (health/settings),
  admitted by main-owned view-session policy. **No external opener, device/account,
  settings mutation/persistence, DB/vault or process service.** Normal Electron/browser
  and owned profile activity is not claimed to have zero OS effects.
- Minimal React UNAVAILABLE diagnostic mounted in the exact owned fixture. No product UI is replaced
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
esbuild 0.28.2, Node types 24.19.2. React/react-dom/types 19.3.0, csstype 3.2.3 and scheduler 0.28.0 extend
the original inherited 67-entry closure from the reviewed Auto lab lock. P1-03 adds
exact Biome 2.6.4 plus its ten optional platform packages (78 entries total),
without changing those 67 inherited entries. See `biome-review.json` and the
[P1-03 admission evidence](../docs/evidence/P1-03-tooling-admission-2026-10-31.md). Prior file
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
metadata → optional scripts-disabled restore → installed checks → fresh-restore
registry signature/provenance and advisory checks → lint/format → strict compile →
build → manifest → tests. Any false result or exception stops later stages. No
semicolon fall-through, generic shell command or automatic runtime download.

The current local source check passes 52/52 tests (including bounded seeded fuzz
and fresh-view recreation); exact-head Windows run 41169068159 also passed 52/52. The prior zero-bridge source
checkpoint passed 36/36 tests. Hosted CI7 passed source/package 20/20 each, Python 42/42 and PowerShell 25/25;
corrected preference/preload measurements now have actual Windows runner evidence.
See the [runtime evidence](../docs/evidence/P1-02-windows-envelope-source-2026-10-31.md).
Test tooling uses bounded child invocation (30 seconds/64 KiB, restore 120 seconds),
not arbitrary-child-tree containment. Runtime/installer Windows supervision is implemented separately and has hosted
evidence; it is not inferred from these local tests.

## Build/launch integrity and owned outputs

Build checks the fixed fixture hash before writing bundles. It invalidates the old
success marker before dependency/build work, then records a fresh manifest of exact
source inputs and output hashes only on success. A partial/missing/stale manifest
fails verification. Main validates its own built files and fixed asset before load;
the owned launcher also calls verifyBuild against current source before
packaging/launch. Remaining files after a failed build are not successful artifacts.
No signing or malicious-editor/hostile-filesystem-race guarantee is implied.

Generated `build/`, `node_modules/`, `.npm-cache/`, `.runtime/` and `.test-output/` are
ignored. Tests create unique owned directories, verify parent/child realpaths and
no symlink before cleanup, and leave the test-output directory empty. Profile root
must be fresh, named `fonesi-auto-foundation-*`, contain only the exact `.owner`
marker and no reparse/symlink alias. No default/user profile or arbitrary root is
accepted. Ownership validation is not a concurrent malicious-local-user race proof.

Do not launch Electron manually: use the reviewed bounded launcher and separate
phase-01 workflow. Hosted evidence does not authorize arbitrary local profiles.
No --no-sandbox fallback is allowed. Main's switch/environment guards are defense in
depth; they cannot undo effects of native startup flags before application code.

## Honest security limit

Exact raw strings are checked by pure policy tests. Chromium may canonicalize URLs
before handlers; a normalized alias to the same exact owned asset is not claimed
lexically rejected. No arbitrary URL-to-filesystem conversion exists. Observed
navigation handlers do not prove that about:blank/document.open cannot transition.
Original G0-12 source/package 20/21 navigation FAIL remains unchanged. The prior zero-bridge result and current strictly public read capability do not
solve full manual/scheduled service authority or permit future effect methods
to be enabled. Full V9 and C-03
remain obligations, not permanently disabled features.

The separately scoped Windows execution envelope and strict artifact contract are
implemented under [verification](verification/README.md). CI6 remains a valid failed
report; CI7 passes the corrected bounded measurements. No original navigation gate
or full P1-02 acceptance follows from this bootstrap slice.

## Current development entry — public read bridge

ADR-0006 approval at 04:06 UTC supersedes the earlier zero-bridge scope only for
health/settings public reads. The application now includes its own sandboxed preload
and minimal React diagnostic; earlier zero-preload/source counts are historical.
[Current source evidence](../docs/evidence/P1-02-public-bridge-source-2026-10-31.md):
50/50 source/build tests, 43/43 Python; new 25-case Windows contract PASS in both source/package on run 41168294925.
No device/account/secret/path/shell/mutation service or full V9 acceptance is implied.

## P1-03 active-code quality gate

Root `biome.json` pins the reviewed formatter/recommended-linter configuration.
`quality-tool.mjs` checks its hash, the shipped schema hash and exact native binary,
then uses shell:false with a 30-second deadline and 64 KiB output cap. Only reviewed
Linux glibc x64 / Windows x64 are supported. Unexpected nested configs on active ancestors/subtrees and alternative root
biome.jsonc are rejected before native calls. The wrapper/ldd/daemon are never used;
BIOME_* and Node override variables are rejected (case-insensitive names).
The active foundation/desktop TS/TSX/MJS/CJS inventory excludes generated outputs,
Phase 0 and V9. Strict TypeScript 7 remains required; this is tested corpus support,
not a claim that Biome supports every TypeScript 7 feature.

`node desktop/scripts/quality-tool.mjs --inventory <reviewed-npm-version>` is check-only.
The development runner also runs native good/bad lint, format and parser fixtures,
format idempotence and target/env-denial tests. Check/lint explicitly fail on warnings as well as configured errors and format
drift. Informational style suggestions remain visible, not suppressed or claimed
absent. No unsafe linter fix/import sorting is authorized.
