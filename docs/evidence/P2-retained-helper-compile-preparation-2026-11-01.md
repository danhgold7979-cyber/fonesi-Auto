# P2-02 — bounded compile-only verification preparation

**Current: source reviewed; actual Windows compiler NOT_RUN.** No assembly is loaded or
invoked, and no ADB/profile/server/device operation is part of this step.

The [retained native API checkpoint](P2-retained-native-helper-2026-11-01.md) cannot claim
C# compatibility from text assertions. Coordinator Coder Bin confirmed this compile-only
preparation as ordinary software verification at06:45 UTC on2026-11-01. The new source-job
step is default-off: exact manual `run_retained_compile` or a phase-02 push with
`[retained-compile]`. Ordinary source pushes do not repeat it, and it runs only after the
source suite succeeds. No unchanged recipient/fleet/version/server campaign is requested.

The script uses the absolute Windows Framework64/v4.0.30319 `csc.exe`, never PATH or a
newly downloaded compiler. Fixed library-only arguments disable compiler response
configuration and implicit references; only mscorlib/System/System.Core are referenced.
Exactly the unchanged reviewed IsolatedAdbServer.cs and RetainedAdbSession.cs compile.
Verified-build inputs and frozen original-helper hash precede execution; both source
hashes must remain identical afterward. The generated DLL is checked as a bounded
compiler output, never loaded/reflected/imported/invoked. This is compilation evidence,
not Job/endpoint/profile behavior or proof of a production bridge.

Compilation is bounded to30seconds and64KiB captured output. An exclusively created
temporary root/owner marker, narrowed compiler environment and fixed output path isolate
files. Cleanup requires known compiler exit, same root identity, exact marker and closed
inventory; only the expected DLL/marker are removed, nonrecursively. Timeout, uncertain
retirement or unexpected entries preserve the owned directory and fail. No attempt is
made to clean another compiler or infer application-process retirement from compiler exit.
Only fixed stage/status/retirement/cleanup and eight allowlisted C# error codes plus
OTHER are emitted. Raw compiler paths/source/output are not forwarded.

## Actual local verification

- Five distinct new tests PASS: real owned fixture files with injected compiler success,
  fixed privacy-safe error categories, uncertainty/unknown-entry preservation, changed
  source rejection, and exact default-off LF/CRLF workflow gating. No compiler ran.
- Affected diagnostic rerun1/1 confirms mixed known and unknown compiler codes retain
  OTHER; this overlaps the five tests, not a sixth distinct criterion.
- Existing test inventory causal check1/1 PASS. Two existing workflow negative fixtures
  initially mutated the first generic condition, now the new compile step, instead of
  the intended fleet/ADB gate. They now mutate their exact original conditions; affected
  rerun2/2 PASS with all original gate predicates unchanged.
- Targeted formatter/lint and build verification PASS. Initial two assignment-in-loop
  lint errors were rewritten as equivalent explicit statements, not disabled.
- Independent review:3 affected privacy/preservation/gate tests PASS, no repeated full
  suite. Prior937 aggregate and retained-helper affected checks are carried forward.
  Expected next complete desktop960 is NOT_RUN; unchanged109/214 evidence is reused.

Source hashes:
- script: `2db0db1b073b0d8d460c923e4ef54db770ae7abea37aacfe8d099f94b6b7654b`
- workflow: `265ba1a78ae6e7ea5f619cd67a6d7bd18d02d912bc07e82c20966392c6f846fe`

Local preparation does not bypass denied public publication of custody795 or authorize
sending a newer descendant instead. No new public head, CI run, compilation result,
canonical task completion, physical-device evidence or formal acceptance is claimed.

## First admitted hosted checkpoint and quality-only repair

Exact39-file publication succeeded as public
`493b1b28a9f0e21c5806e729fd1a60ddeb9d68fe` / tree
`b8307a5eaa83cf2cb22f9b8e142e6302491029e2` after explicit recipient approval.
CI41286185772 stopped at QUALITY before desktop tests or C# compilation. Local full
quality reproduction identified one warning in the new workflow test: eight literal
spaces in a regex. The earlier targeted error-level lint missed warnings, whereas
the actual pipeline rejects them. This is a verification gap, not a compiler result.
The repair replaces those exact eight spaces with equivalent ` {8}`, preserving all
workflow predicates. The affected gate test and full quality check pass after repair;
no unchanged aggregate/native campaign is repeated. Actual Windows compilation is
still NOT_RUN. The approved compiler script/workflow/helper bytes are unchanged.
