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

## Hosted attempt 1 — FAIL, 2026-10-30 18:10 UTC

Published candidate `a35aafef7de10a75c11e6abbd9f7413dbdc28bbe` ran
[desktop lab 41104514276](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41104514276),
job 124230345072, on Windows Server 2022 (10.0.20348), Node 24.22.1,
npm 11.19.1. Locked restore/review, strict TypeScript, build and 6/6 pure contracts
PASS. Supervisor step **FAIL** after approximately five seconds with
`LAB_SUPERVISOR_FAILED`, empty runtime results, `cleanup:true`. The generic code
does not establish which stage failed, installation success or any Electron
runtime assertion. Do not infer source/package launch success or absence from it.
The independent existing workflow
[41104514182](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41104514182)
passed its collector and Windows/Linux offline jobs; it is not desktop evidence.

Narrow diagnostic retry prepared 18:16 UTC: retain only fixed supervisor stage,
allowlisted exception class, numeric source line and installer status/exit/cleanup
fields; no exception message/stack or captured process output. Mark cleanup
unconfirmed before each native invocation so unexpected invocation exceptions
cannot inherit a previous cleanup success. No runtime assertion, provenance rule,
security flag or owned Job containment is weakened. Root cause remains UNRESOLVED
pending the diagnostic hosted run; this change is not presented as a proven fix.
Local dependency/strict compile/build and 6/6 contracts remain PASS; diff check PASS.
Ignored dependency binaries/cache, build, staging and result paths verified with
`git check-ignore`; no downloaded runtime or raw logs added to source.

Independent diagnostic review closed at 18:19 UTC: fixed diagnostics/privacy and
fail-closed cleanup approved for staged hosted retry; no definite root cause
identified without Windows execution. Invocation source-line extraction is
null-safe and StrictMode PropertyNotFoundException is explicitly allowlisted.

## Hosted attempt 2 — FAIL, narrow binding candidate, 18:25 UTC

Diagnostic commit `6449a3d4ebbab11d8792e04386568c08d04e4939`, desktop run
[41106276360](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41106276360),
job 124236827835, failed with stage INSTALL, unexpected exception class, source
line 25 (the helper invocation), installer=null and cleanup=false. This proves no
returned installer result; it does not identify the masked exception type. Existing
collector/offline run 41106276557 succeeded independently.

Independent review identified a matching **hypothesis**: if command resolution
returns multiple application objects, `.Source` member enumeration produces an
array and binding to the helper's scalar FilePath fails before its internal catch.
The narrow candidate fix selects the first execution-precedence application,
explicitly types its source as string, and validates a nonempty absolute .exe path.
Only candidate count is recorded, never the executable path. Diagnostic allowlist
now includes parameter-transformation and action-preference exception classes.
[Microsoft's Get-Command documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/get-command?view=powershell-5.1)
says exact-name resolution normally returns one command; therefore this remains a
candidate, not an empirically proven root cause until the next hosted evidence.
No security flag, deadline, checksum or runtime assertion is relaxed.

Additional primary-source review resolves the documentation nuance: current
[PowerShell GetCommandCommand source](https://github.com/PowerShell/PowerShell/blob/master/src/System.Management.Automation/engine/GetCommandCommand.cs#L1000-L1008)
continues enumeration when CommandType is explicitly specified, even for exact
names. Our invocation does specify it. Thus multi-result member enumeration is a
source-supported integration defect; the next Windows candidate count will test
whether it caused this particular run failure. The original failed invocation is
retained as regression evidence; the next run must return installer/containment
results and pass all unchanged source/package assertions, not merely bind a path.

## Hosted attempt 3 — installer/launch advancement, runtime FAIL, 18:30 UTC

Commit `cf6ee7d67910cfc0fd68505c4536c078e3454d07`, desktop
[41107363359](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41107363359),
job 124240617390: nodeCandidateCount=2 confirms the multiple command-source
condition. Scalar resolution now returns installer SUCCESS/exit0/cleanupComplete
true. An actual source Electron 45.1.0 process reports Chromium 156.0.8078.49,
Node 24.22.1, packaged=false, and three true cases: secure_runtime_state,
expected_electron_version, package_mode. Source result is still **FAIL**, with the
remaining 18 cases not returned and package launch not reached. Installer and
runtime owned-tree cleanup are both true, runtime exit1 and directory cleanup true.
The supervisor step lasted approximately 12 seconds including installation.

The monolithic renderer probe did not retain partial progress; its source cannot
alone distinguish rejection from watchdog termination. No concrete renderer root
cause is established. A narrow observability correction now retains partial case
booleans and fixed stage/allowlisted error-name markers, with a distinct watchdog
marker. Any such diagnostic still immediately fails; all 21 cases for each mode,
20/30/90-second deadlines, secure flags, exact version, IPC checks and containment
remain required. No arbitrary exception text, URL, path, console output or stack
is captured. Local strict TypeScript/build/dependency review and 6/6 contracts
PASS; hosted behavior remains pending. This is not complete G0-12/P0-09 acceptance
or a target Windows compatibility claim.

## Hosted attempt 4 — outer execution rejection, 18:36 UTC

Commit `a33d100f6e6391f2e4c2d69a4875a0d2e77e1dfc`, desktop
[41108317021](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41108317021),
job 124243861465: installer SUCCESS and both owned-tree cleanups true; source
reports the same three true cases, then outer diagnostic RENDERER_CHECKS/Error.
This is not an inner assertion diagnostic or watchdog marker. Package not reached.
The root cause remains unresolved: rejected execution or loss of its context can
prevent even the renderer's internal catch from returning partial observations.

The harness now returns the unchanged non-navigation checks before attempting
popup/navigation in separate calls with fixed stage boundaries. Both about:blank
targets, event/URL/window-count assertions, all 21-case requirements and secure
configuration are unchanged. A navigation can no longer erase earlier returned
results. Main-process 200ms settling waits replace the same renderer settling wait.
Exact known upstream error strings map to four fixed codes; arbitrary messages
remain discarded. Primary code reviewed at Electron v45.1.0:
[execution result handling](https://github.com/electron/electron/blob/v45.1.0/shell/renderer/electron_api_service_impl.cc#L59-L107)
and [frame reply handling](https://github.com/electron/electron/blob/v45.1.0/shell/browser/api/electron_api_web_frame_main.cc#L450-L478).
This improves failure isolation without declaring a guessed runtime fix or
relaxing CSP. Local strict TypeScript and diff checks PASS; hosted retry pending.
A primitive `executeJavaScript('true')` smoke stage precedes the core probe and is
not counted among the 21 acceptance assertions. It distinguishes API execution
failure from probe logic. Final local dependency/build/strict checks and 6/6 pure
contracts PASS at 18:40 UTC; a wrong-working-directory build invocation returned
MODULE_NOT_FOUND before the correctly scoped successful rerun (no installation).
