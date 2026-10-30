# G0-12 disposable hosted-stack experiment — 2026-10-30

## Scope / authorization

Started 17:52 UTC under the owner's continued independent-work grant and the
bounded pre-code playbook §6 record. This is a P0-09/G0-12 feasibility input,
not production Phase 1, an accepted ADR, complete P0-09, installer or supported-host
claim. The original Phase 0 plan, V9 and P0-01 collector sources are unchanged.
HC-09/HC-13, actual target Windows/device and platform authorization remain open;
Phase 0 acceptance remains 0/10. Provisional lab code may be discarded or reworked.

## Exact candidate and source review

The private disposable lab locks Electron 45.1.0, TypeScript 7.0.2, React/ReactDOM
19.3.0, esbuild 0.28.2, Node 24.22.1 and exact typings. The dated lab README links
primary upstream release/security/distribution documentation. `dependency-review.json`
records all 67 lock entries, exact official npm registry tarball URL, SHA512
integrity, license and lifecycle flag, plus SHA256 of inspected installer files.
Electron's official release listing exposed 45.2.0 but the registry returned E404;
45.1.0 was actually available and was explicitly approved as a **lab candidate**.
No latest-version or production-support assertion is inferred from this.

Restore used `npm ci --ignore-scripts --no-audit --no-fund` and the explicit trusted
npm registry; no lifecycle scripts ran. Only esbuild declares a lifecycle hook;
its inspected fallback installer is not executed. The locked optional-platform
binary is checked against the upstream embedded SHA256 list before use.
Electron's explicit installer and `@electron/get` URL/checksum behavior were
inspected; the workflow executes it only inside a bounded owned Windows Job.
Electron Windows archive SHA256:
`55eaba17abff7b5bba6c3bbc85068967379024fe742fe9c7fdba9118922ccbe2`.
Electron MIT does **not** license all bundled Chromium/Node/codecs: upstream
LICENSE and LICENSES.chromium.html are required, retained and hash-compared during
package copy, as are React/ReactDOM/scheduler notices. Complete production license
approval remains pending. npm audit at 17:58 UTC reported zero known findings;
this is a dated advisory result, not a complete security review.

## Actual local checks

Linux x64, Node 24.22.1, npm 11.9.0; no display/Xvfb and no local Electron runtime
claim. Clean script-disabled restore: 23 installed host packages, 67 lock entries
including optional platforms. Reviewed dependency/native-binary checks PASS;
strict TypeScript PASS; actual esbuild build PASS; pure contract tests **6/6 PASS**.
YAML parse and `git diff --check` PASS. Existing offline Python regressions
remain 42/42 PASS (18:07 UTC, 0.044s). No Windows PowerShell runtime is available
locally; wrapper and actual Electron source/package tests remain **NOT_RUN** until
hosted execution. Six contract tests are not a substitute for the 21 runtime cases
required separately for each source and package launch.

First strict check failed because Electron no longer types
`webContents.getLastWebPreferences`; replaced this unsupported API with documented
preload runtime flags plus behavior checks. At 17:56:53 UTC, a plain-Node import
of compiled main unintentionally invoked Electron's lazy installer. The owned
command was interrupted at 17:57:02 (exit 130); no installed path.txt/dist was
present afterward and no application launched. This is an execution mistake,
not evidence of a successful installation. Tests now import only separately
compiled pure contracts; the Electron index lazy-install entry was added to the
reviewed source hashes. No sandbox workaround was attempted.

## Inputs, assertions and failure gates

Only owned synthetic directories and local generated HTML; no credentials,
private fixtures, accounts, ADB, devices or platform action. Actual React render,
typed health IPC roundtrip, seven malformed/unknown payload rejections, untrusted
sender rejection, isolated context and sandbox flags, absent renderer Node globals,
restricted bridge, denied process-spawn route, navigation/window denial, exact
version and source/package identity must produce 21 true cases per launch.
All packaged build files and upstream license notices must match source hashes.

Review identified an unsafe PID/taskkill deadline: replaced with the unchanged
collector's suspended-start, non-breakaway kill-on-close Windows Job helper.
Installer deadline 120s, runtime supervisor deadline 90s, each with 10s cleanup;
individual Electron launch rejects after 30s and app watchdog is 20s. Tree cleanup
must be confirmed by native Job accounting before the supervisor deletes its
unique marker-owned directory. Unconfirmed tree cleanup is FAIL, not waived by
successful directory deletion. Frozen helper hashes:

- HostProbeNative.cs: `b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89`
- HostEnvironmentCollector.psm1: `8f2437c6c438bea73b2f9c1339b2870f11389b2801d859c1a9a3a43ddf61894c`

Workflow triggers include both helpers. Importing the module runs no inventory.
Review also caught the helper's executable-directory working directory; the installer
now explicitly changes to its own lab root before relative I/O.
The reviewer also identified arbitrary exception text leakage; failures now map
to fixed codes, and the supervisor never outputs captured child stdout/stderr.
Only sanitized fixed-case results JSON is uploaded for seven days; no binary,
profile, screenshot, raw paths or private fixtures. Any unavailable prerequisite,
early exit, timeout, mismatch, failed assertion or unconfirmed cleanup is nonzero.

Independent read-only review closed at 18:07 UTC: deadline/owned-tree, fixed-code
privacy and installer cwd findings resolved; independent pure contracts 6/6 PASS,
Node syntax, workflow YAML and diff checks PASS. No remaining blocker identified
for the bounded hosted experiment. PS5.1 and Electron runtime were NOT_RUN by
reviewer. Hosted Windows outcome: NOT_RUN pending publication. No commit/push or
main merge performed by the implementing agent. Implementation checkpoint frozen
at 18:08 UTC (16 minutes since recorded lab start); parent coordinates publication.
