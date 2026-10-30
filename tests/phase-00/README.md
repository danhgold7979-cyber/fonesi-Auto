# P0-01 synthetic Windows regression tests

This dependency-free harness exercises the actual collector helpers on **Windows
PowerShell 5.1 (Desktop)**. It is not a real host inventory or Phase acceptance.
No Pester, npm, Java, Android SDK or external test package is required. The native
fixture is compiled locally using the .NET Framework compiler supplied to
`Add-Type`; it is not downloaded.

## Run

From the repository root, in an already permitted Windows PowerShell session:

```powershell
powershell.exe -NoProfile -NonInteractive -File tests/phase-00/Test-HostEnvironment.ps1 -OutputDirectory "$env:TEMP\fonesi-p0-results-unique-run-id"
```

Or in the GitHub Actions `powershell` shell:

```powershell
./tests/phase-00/Test-HostEnvironment.ps1 -OutputDirectory "$env:RUNNER_TEMP\fonesi-auto-tests"
```

Choose an output directory that does **not** exist. Existing files/directories are
never reused or deleted. Without `-OutputDirectory`, the harness creates a unique
results directory in the system temp directory. The harness does not bypass or
change execution policy. A restrictive policy or missing compiler is a genuine
blocked/failed run, not grounds to claim a pass or weaken policy.

Exit codes:

- `0`: all executed synthetic cases passed; HC-09/HC-13 still `NOT_RUN`.
- `1`: one or more behavioral assertions or fixture-cleanup checks failed.
- `2`: prerequisites/setup or result publication failed.

`results.json` is the machine-readable record; `summary.txt` is the short result.
The record includes individual case statuses/durations/assertion counts, shell
and OS version, exact invocation shape, timestamps, and SHA-256 of the collector,
module, native helper, PowerShell wrapper, harness and native fixture. The JSON is
also printed to stdout. An unexpected exception is recorded by type only; raw
paths, stack traces and arbitrary process output are not published in CI results.

## Coverage and evidence boundaries

| Cases | Actual behavior checked |
|---|---|
| HC-01.1 | Parse the exact collector, module, wrapper and test script under Desktop 5.1; record runtime. |
| HC-02.1 | Actual `.exe` stdout, stderr-only Java-style `-version`, both streams, exit code and version adapter. |
| HC-03.1 | Two independent fixture threads each emit **2 MiB** concurrently; both streams drain to completion while each stored stream is capped at 4,096 characters and marked truncated. |
| HC-04.1–2 | Timed-out root/child cleanup, unrelated sentinel survival, and a root that exits while its descendant holds inherited pipes. Child IDs come only from the fixture; cleanup never kills processes by name or scans the host process inventory. |
| HC-05.1–4 | `.exe`, `.cmd`, uppercase `.CMD`/`.BAT`, `.ps1`, PATH-resolved synthetic npm, path spaces/Unicode, exact native argv including empty/quoted strings, literal PS1 attack text, CMD metachar rejection, unsupported aliases/functions. |
| HC-06.1–2 | Missing command, actual invalid executable, real nonzero exit `23`, empty output and Windows access-denied launch against an owned directory. Present is not equivalent to successful version. |
| HC-07.1 | 24 success/nonzero pairs plus four timeouts; explicit cleanup and immediate/post-finalization process handle growth. |
| HC-08.1 | Actual query wrapper with controlled successful value, terminating/nonterminating errors, nonexistent cmdlet, null result and simulated access denial. No CIM/optional-feature query is made against the runner. |
| HC-10.1–3 | Actual JSON round-trip, ZIP contents and manifest hashes/lengths; existing directory/file/ZIP preservation; invalid parent path; synthetic JSON/ZIP access-denial injection and subsequent real-writer recovery. |
| HC-11.1 | Synthetic username/path, UNC, documentation IP addresses, serial/token/password/secret markers scanned across version stdout/stderr, errors, report, README, manifest and ZIP entries/content. This does not prove arbitrary real diagnostics safe to publish. |
| HC-12.1 | Schema/run/time/scope/source/unit metadata, 64-bit byte count, unavailable data preserved as null, PARTIAL report and null sensor-property behavior. |
| HC-09 | **NOT_RUN:** actual target-host optional-feature/virtualization/backend and `emulator -accel-check`; requires separately approved host procedure. |
| HC-13 | **NOT_RUN:** exact approved collector rerun on the user's Windows host, reviewed sanitized artifacts and non-mutating-scope verification. |

There are **18 synthetic behavioral cases** and **2 explicit target-host
NOT_RUN records**. Setup/cleanup failure records may be added. A CI pass certifies
only the tested synthetic helper behavior, not target Windows support,
virtualization readiness, physical-device feasibility, or Phase 0 acceptance.
The result intentionally keeps `taskAcceptance: BLOCKED` while HC-09/HC-13 are
unrun. The entry-point collector is parsed but **not executed** in CI because it
would inventory the runner rather than use synthetic input.

## Deterministic limits and fault injection

- Ordinary subprocess fixture deadline: 10,000 ms; cleanup budget: 2,000 ms;
  stored output cap: 65,536 characters per stream.
- Flood fixture deadline: 15,000 ms; cap: 4,096 per stream; expected completion
  before 19,000 ms, including explicit cleanup and scheduling allowance.
- Tree/root-exits fixtures: 1,500 ms deadline plus 2,000 ms cleanup; the harness
  permits 6,500 ms total to account for scheduled wakeups. Standalone fixture
  hangs self-expire after 30 seconds as a final test-only safety bound.
- Repeated timeout fixture deadline: 300 ms. A child need not produce output to
  establish this timeout, unlike the explicit tree-child test.
- Handle test: warm up three calls, then allow at most 16 net process handles
  above baseline immediately and after finalizers. This small test-runtime noise
  allowance is not a production hardware/resource threshold or support promise.
  HC-07.1 records baseline, successive success/nonzero batches, each timeout,
  immediate-end and post-GC counts from the current test process only. Both end
  measurements are collected before asserting so failures retain the trend;
  post-GC reduction never replaces or relaxes the immediate-growth assertion.
- Only failure-injection cases replace the module's internal
  `Write-CollectorJsonFile` / `Write-CollectorZipFile` with a throwing synthetic
  writer; original functions are restored in `finally`. Successful export cases
  always use the actual writers and actual filesystem. This proves error
  propagation, not a real disk-full or filesystem-ACL certification. The invalid
  parent and collision cases use the real filesystem without changing ACLs.

The harness creates executable/shim fixtures in a separate unique owned temp
directory. It restores the temporary PATH and global alias/function fixtures,
disposes owned process handles, and recursively removes only a directory whose
unpredictable ownership marker matches this run. Results remain for review.
Fixture compilation, local temporary output and owned-process execution are the
only intended changes. No elevation, Windows feature/BIOS/security changes,
package installation, ADB/device commands, external network or private inventory
is performed.

## Result interpretation

Run the exact invocation above to produce Windows evidence. Source review,
`git diff --check`, compilation on a different runtime, and an authored test file
are **not** a Windows test pass. At authoring time in the Linux workspace these
Windows tests were **NOT_RUN**; the authoritative execution result must come from
the current run's `results.json` and CI process exit status.
