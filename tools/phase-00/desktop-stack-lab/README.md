# G0-12 disposable hosted-stack lab

**Not the production application, V9 integration, installer or accepted stack.**
This isolated feasibility experiment consumes C-05's selected Electron + strict
TypeScript + React direction. It contributes runner evidence only to G0-12/P0-09;
Phase 0 and the user's Windows/Android support remain unaccepted.

## Candidates and provenance

Exact direct candidates: Electron **45.1.0**, React/React DOM **19.3.0**,
TypeScript **7.0.2**, esbuild **0.28.2**, React/DOM types **19.3.0**, Node types
**24.19.2**. Node test runtime: **24.22.1**. All direct/transitive resolutions,
registry tarball URLs, SHA-512 integrity values and package license labels are
in `package-lock.json` and `dependency-review.json` (67 entries including optional
platform packages). This is a lab candidate selection, not production pinning.

Official sources checked 2026-10-30:
- [Electron release listing](https://releases.electronjs.org/releases/stable) and
  [45.1.0 release](https://github.com/electron/electron/releases/tag/v45.1.0).
  The listing showed 45.2.0 on October 30, but npm returned 404 for that version;
  45.1.0 was the available registry candidate, not claimed newest.
- [React versions](https://react.dev/versions) lists 19.3.0;
  [TypeScript 7.0.2](https://github.com/microsoft/TypeScript/releases/tag/v7.0.2)
  and registry metadata confirmed exact versions.
- [esbuild documentation](https://esbuild.github.io/getting-started/) describes
  local browser bundling; exact 0.28.2 metadata came from the trusted npm registry.
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security),
  [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation),
  [sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox) and
  [manual packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
  inform this isolated experiment. Source guidance is not proof our tests passed.

Electron/React/esbuild/type package labels are MIT; TypeScript is Apache-2.0.
Transitive metadata also includes ISC. **Electron's MIT label does not cover all
bundled Chromium, Node, codecs and third-party components.** The official binary
`LICENSE` and `LICENSES.chromium.html` must exist and survive package-copy hashing;
React/React DOM/scheduler notices are retained in the bundled lab. Full production
SBOM/legal license disposition, signing and redistribution are not certified here.

## Supply-chain/lifecycle boundary

1. Use `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`.
   No lifecycle hook runs. npm verifies locked package integrity.
2. `node scripts/verify-dependencies.cjs` checks every locked origin/version/license/
   integrity against the review snapshot, refuses unreviewed install hooks and
   binary overrides, hashes reviewed scripts and checks the platform esbuild
   binary against the hash in its integrity-locked official package.
3. esbuild's `postinstall` script was inspected but is **not run**. Its optional
   platform binary is already in the lock; no fallback npm/download routine is used.
   TypeScript's optional native compiler is likewise from locked npm packages.
4. Only on Windows x64, `node scripts/install-electron.cjs` explicitly invokes the
   reviewed official installer with bounded timeout and a local package cache.
   It refuses Electron/Node override environment variables. `@electron/get` uses
   official GitHub release URLs and validates SHA-256 against the checksums bundled
   in the integrity-locked Electron package before extraction. No custom mirror,
   checksum disable flag or global installation is used.
5. Electron 45's npm `index.js` can lazily run its installer on plain-Node import.
   **Never import `build/main.cjs` in Node.** Unit tests import only the separately
   bundled pure contract. Electron main is launched only with the verified binary.

## Commands and expected checks

From this directory after dependency restore/review:

```sh
node scripts/verify-dependencies.cjs
node node_modules/typescript/bin/tsc --project tsconfig.json
node scripts/build.cjs
node --test scripts/contracts.test.cjs
```

Windows x64 only, after the above succeeds:

```sh
.\scripts\Invoke-DesktopLab.ps1  # Windows PowerShell 5.1
```

Six pure contract cases are supplemental. The real Electron process must report
**21/21 cases for each of source and unpacked-package launch**:
- Actual sandbox/context-isolation state from preload, with Node built-ins refused;
  renderer's `require`/`process` absent and attempted process-spawn route unavailable.
  `nodeIntegration:false` is explicitly configured and verified behaviorally via
  absent Node globals, not read using an unsupported private Electron API.
- Exact Electron version and source/package mode; actual React render completes.
- Context canary does not leak; only the typed `health` bridge exists; no generic
  `send/invoke/spawn/exec/readFile/getSecret` surface.
- Valid bounded health request round-trips its version/correlation. Seven malformed,
  unsupported/unknown-operation/extra-privilege payloads reject.
- Untrusted renderer sender is rejected; new windows/navigation are denied.

Secure BrowserWindow configuration also fixes `webSecurity:true`, disables webview
and subframe Node integration, and denies permission requests/checks. Runtime
network requests outside file resources are denied. The lab does not claim a
complete security audit from these cases.

The renderer watchdog is 20 seconds; each Electron launch rejects after 30 seconds.
The PowerShell supervisor reuses the unchanged Phase 0 NativeProbe: create Node
suspended, assign a non-breakaway kill-on-close Windows Job, then resume. Installer
and runtime have separate 120/90-second deadlines plus 10-second cleanup budgets.
Zero active owned descendants must be verified before directory cleanup; no PID
lookup/taskkill or wildcard termination is used. An unconfirmed cleanup fails and
retains the owned directory rather than treating deletion as process evidence.
These are bounded lab deadlines, not production performance acceptance budgets.
Package copy uses a unique `.lab-runs/run-*` folder with a random ownership marker;
only that owned folder is removed, including failure paths. Copy hashes and
license notices must match. Cleanup failure fails the run. No install/signing,
registry changes, security switches, `--no-sandbox`, accounts, ADB or devices.

The wrapper retains only `.lab-results/results.json`: fixed case booleans, runtime
versions, executable hash and sanitized failure codes. No binary, private input,
profile folder or screenshot is uploaded. Missing results, early exit, timeout,
failed checks or cleanup are nonzero failures. A pass certifies **only the tested
hosted runner**. No local-display workaround or target Windows claim is allowed.
