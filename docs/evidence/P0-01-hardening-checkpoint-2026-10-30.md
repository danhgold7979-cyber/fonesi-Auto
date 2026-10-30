# P0-01 Collector Hardening Checkpoint

Date: 2026-10-30. Task: P0-01 only. Phase: 0 of roadmap phases 0–11.
Baseline: f6f77b0a5ff64a932fe84bb9aca09f0f1e8b44e0 after PR #2 integrated the reviewed plan into the active phase branch, not main.

## Authorization and evidence boundary

The owner directed continued implementation phase by phase on 2026-10-30 16:03 and 16:06 UTC. This checkpoint implements the scoped collector amendment and synthetic checks. It does not mark Phase 0 or any hardware-dependent acceptance complete. No device, live account, elevation, system setting, execution-policy change or target-host acceleration command is executed by synthetic tests.

## Files and behavior

- `tools/phase-00/Collect-HostEnvironment.ps1`: small host-report entry point with explicit success/PARTIAL/failure exit behavior.
- `HostEnvironmentCollector.psm1`: structured probes, explicit command types/arguments, redaction, availability and fresh output/ZIP creation.
- `HostProbeNative.cs`: Windows-owned job containment, suspended start before assignment, bounded concurrent pipe capture, deadline and cleanup.
- `Invoke-PowerShellProbe.ps1`: fixed script trampoline; no expression evaluation or execution-policy bypass.
- `tools/phase-00/README.md`: exact invocation and limitations.
- `tests/phase-00/`: synthetic fixture and dependency-free Windows PowerShell 5.1 runner, evidence schema and README.
- `.github/workflows/phase-00-collector.yml`: hosted Windows synthetic checks with read-only repository permission, pinned official actions and seven-day synthetic evidence retention.

## Current checks

| Check | State | Meaning |
|---|---|---|
| Source inspection and bounded independent review | Completed for first checkpoint | Not runtime proof |
| `git diff --check` | PASS before checkpoint | Whitespace/diff check only |
| Workflow YAML parse + permissions/runner assertions | PASS | Not execution of the workflow |
| ASCII source check for PowerShell/C# files | PASS | Avoids Windows 5.1 UTF-8-without-BOM source ambiguity; Unicode fixture values still require runtime tests |
| 18 synthetic cases on Windows PowerShell 5.1 | NOT_RUN at first publication | CI results must be attached for the exact candidate before claiming PASS |
| HC-09 actual target-host virtualization/acceleration | NOT_RUN | Hosted runner is not the user's machine |
| HC-13 exact target-host collector rerun | NOT_RUN | Requires actual Windows host and sanitized evidence |
| Task P0-01 acceptance | BLOCKED | Runtime/target-host gates outstanding |
| Phase 0 acceptance | NOT ACCEPTED | Do not advance to production Phase 1 from this checkpoint |

## CI verification procedure

Run `powershell.exe -NoProfile -NonInteractive -File tests/phase-00/Test-HostEnvironment.ps1 -OutputDirectory <new-owned-results-directory>` on Windows PowerShell Desktop 5.1. The GitHub job invokes that script in its explicit `powershell` shell. Read `results.json` and `summary.txt`, validate source hashes against the candidate, and retain failures. Exit 0 means the scoped synthetic suite passed, never the whole P0-01 task or Phase 0.

The workflow uploads only synthetic-safe result files. Test-generated executable fixtures and raw command output stay in separate owned temporary directories. HC-09 and HC-13 must be explicitly NOT_RUN in the synthetic report.

## Next action

Publish the first testable checkpoint as WIP verification, inspect the actual Windows CI run, fix reproducible failures and rerun. Do not call the task PASS until its mandatory target-host evidence is also satisfied. No later phase work is authorized by a green synthetic job alone.

## Windows CI attempt 1 — completed, FAIL

- Remote candidate: b46107ec23cd010585747fc0b017148862a0cf74.
- Run: https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41089238883.
- Host: Windows Server 2022, PowerShell Desktop 5.1.20348.5756, CLR 4.0.30319.42000.
- Results: 17 synthetic PASS, 1 FAIL, 2 NOT_RUN; 488 assertions reached.
- Failing case HC-07.1: immediate process-handle growth exceeded the existing bound without relying on finalizers. No failure is waived.
- HC-09 and HC-13 still NOT_RUN. Hosted synthetic results are not user-host/Phase acceptance.
- All other synthetic cases passed: parsing, output/2 MiB concurrent draining, timeout/owned descendants, executable/shim arguments and injection refusal, status errors, query errors, ZIP collisions/whitelist/write failures, redaction and schema/PARTIAL behavior.

Focused correction under test: replace per-probe managed Thread objects (whose native handles rely on finalization) with shared pool callbacks and explicitly owned/disposed completion events. Add actual baseline/batch/immediate/post-GC handle counts to result evidence. Preserve both original <=16 immediate/post-GC assertions. A rerun, not this explanation, determines whether the defect is fixed.

Windows checkout used different working-tree line endings for raw source hashes in attempt 1. A narrow .gitattributes now pins LF for PowerShell/module/C# source so subsequent working-byte hashes can be compared directly. No UI or historical evidence file is normalized by this rule.
