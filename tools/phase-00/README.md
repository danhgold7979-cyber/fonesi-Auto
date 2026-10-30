# P0-01 host preflight collector

This is a **read-only Phase 0 diagnostic**, not production application code or
host/Phase acceptance. Target: **Windows PowerShell 5.1 Desktop**. Windows CI
fixtures and the target user's host are distinct evidence. HC-09 and HC-13 stay
NOT_RUN until the separately authorized target-host procedure is recorded.

## Running locally

Keep these four source files together: `Collect-HostEnvironment.ps1`,
`HostEnvironmentCollector.psm1`, `HostProbeNative.cs`, and
`Invoke-PowerShellProbe.ps1`. Run in a Windows PowerShell 5.1 session whose current
execution policy permits these reviewed scripts. **Do not bypass or change the
execution policy** to make the collector run. Restricted language mode or an
Add-Type restriction is a real blocked prerequisite, not permission to evade it.

```powershell
.\tools\phase-00\Collect-HostEnvironment.ps1 -OutputDirectory 'D:\PrivateReports\preflight-new-run'
```

The parent directory must already exist; the final directory and adjacent `.zip`
must not exist. The default final directory is unique and under Desktop. The
collector never overwrites a prior run or deletes an unrelated file. A write
failure may leave **partial, collector-created output**; inspect it locally and
choose a new final directory rather than reusing it.

Only after authorization for the **specific target host** and its read-only
queries, an already-elevated PowerShell may use `-IncludeOptionalFeatureQuery`
(`Get-WindowsOptionalFeature -Online` and `bcdedit /enum {current}`). Separately,
`-IncludeAccelerationCheck` enables `emulator -accel-check`. The collector does
not elevate itself, install SDK components, change BIOS/Windows/boot settings,
start an emulator, enumerate devices, or accept the host. The firmware flags,
Windows features, hypervisor and emulator backend still require human
reconciliation; conflicting/unavailable observations remain explicit.

## Deterministic engineering limits

These are **collector engineering limits**, not measured hardware performance
budgets or a claim of Windows validation:

| Limit | Default | Accepted range |
|---|---:|---:|
| Native process deadline (`-TimeoutMilliseconds`) | 10,000 ms | 100–120,000 ms |
| Owned-process/stream cleanup budget (`-CleanupMilliseconds`) | 2,000 ms | 100–10,000 ms |
| Retained characters per stdout/stderr (`-MaxOutputCharacters`) | 65,536 UTF-16 characters | 256–1,048,576 |
| CIM operation timeout | 5 seconds | fixed per query |

The native deadline starts when the suspended process is resumed. Compilation,
process launch and OS scheduling overhead are **not** included in that process
deadline; the test harness measures the end-to-end envelope with an explicit
tolerance. Optional-feature cmdlet provider duration is not a hard total-run
deadline. Neither a timeout nor a nonzero exit is reported as a successful
version. Output beyond the cap is drained/discarded, with truncation metadata;
redacted output is capped again. Streams decode as UTF-8 with replacement, so
legacy OEM/ANSI output is not promised to be lossless.

## Process ownership and command boundaries

The dependency-free C# helper is compiled with built-in `Add-Type`. It creates a
Windows Job Object with kill-on-close and **no breakaway**, starts its root
suspended, assigns that root to the job, and only then resumes it. A restricted
job/launch that prevents safe ownership fails closed. Only three pipe/NUL handles
are inherited. Two reusable thread-pool readers drain stdout/stderr concurrently
into bounded buffers; their per-probe completion events are explicitly disposed,
not dependent on managed Thread finalizers. Normal exit, timeout and launch failure all close owned handles;
descendants are retired even when the root exits first. Cleanup that cannot be
confirmed produces `CLEANUP_FAILED`, not success. No PID-name sweep, WMI process
tree kill, or unrelated-process termination is used.

- `.exe`: Windows argument-array quoting; spaces, Unicode, empty values, quotes
  and backslashes remain literal arguments, without a shell.
- `.cmd`/`.bat`: a fixed `cmd.exe /d /s /v:off /c` form, independent of native EXE
  quoting. Quotes, `% ! ? & | < > ^ ( )`, CR/LF and NUL in the script path or
  arguments are deliberately **rejected** as `UNSUPPORTED_ARGUMENT`; arbitrary
  CMD expressions are not evaluated. Spaces/Unicode are supported. The batch
  shim itself remains trusted installed code; this is not a malware sandbox.
- `.ps1`: a fixed `-File` trampoline decodes a JSON argument array and invokes the
  resolved script with the call operator; it does not use `Invoke-Expression`,
  `-Command`, `-EncodedCommand`, or execution-policy overrides. Installed script
  behavior and normal PowerShell script parameter binding still apply.
- Aliases, functions, cmdlets and other executable extensions are not version
  probes. Presence/resolution never means compatibility or executability.

Process results distinguish `SUCCESS`, `EMPTY_OUTPUT`, `NONZERO_EXIT`, `TIMEOUT`,
`LAUNCH_FAILED`, `ACCESS_DENIED`, `CAPTURE_FAILED` and `CLEANUP_FAILED`.
Resolution adds `MISSING`, `UNSUPPORTED_COMMAND` and `RESOLUTION_FAILED`.
Nonterminating and terminating cmdlet errors are both captured as unavailable
with stable, non-private reasons. Null sensor fields are partial, never zero;
genuine zero and false remain valid values. Legacy CIM `AdapterRAM` is excluded
because its 32-bit range cannot establish modern GPU VRAM.

## Output and privacy

Schema 2.0 includes run/time/source/availability/unit metadata and a
`COMPLETE`/`PARTIAL` **collection** status. `COMPLETE` never certifies a host.
Unrun acceleration/feature/reconciliation gates remain explicit and ordinarily
make host output `PARTIAL`.

The archive whitelist contains exactly:

1. `host-environment.json` — bounded/redacted structured observations;
2. `README.txt` — status-only, no raw host paths or command output;
3. `manifest.json` — run ID, exact names, byte lengths and SHA-256 of the first two.

Files and ZIP use exclusive `CreateNew`; directory reservation is atomic. No
wildcard directory archiving occurs. JSON is read/parsed back before archiving.
Internal `Write-CollectorJsonFile`/`Write-CollectorZipFile` functions are fault
injection seams used only by tests; successful tests use real persistence.

Every output is **PRIVATE_REVIEW_REQUIRED**. Redaction is conservative best effort,
not a guarantee that arbitrary tool output is safe for publication. It removes
known environment identities/path literals, Windows/UNC/home paths, IP patterns,
labeled serials/credentials and bearer/JWT patterns. Unknown unlabeled sensitive
strings cannot be inferred reliably. No raw local paths, serial enumeration,
network addresses, browser files or credentials are intentionally collected.
Before sharing, inspect **JSON, README, reasons, stdout, stderr, manifest and ZIP
entry names**, and search for known private values. Never commit/upload a raw host
archive or claim it sanitized solely because a scanner passed. CI may publish
only its explicitly synthetic, reviewed test-result summary, not these outputs.

Behavioral regression harness: [`tests/phase-00`](../../tests/phase-00/README.md).
Target-host HC-09/13 and full P0-01 acceptance are separate required evidence.

## P0-04 offline hierarchy selector experiment

`ui_hierarchy_probe.py` is a disposable, standard-library-only analysis module,
not an Android adapter or production component. It never opens files, starts
processes, contacts a device or sends input. Call `inspect_hierarchy` with UTF-8
XML bytes, exact selector fields, capture/current context and an explicit
freshness budget. The result contains only a fixed state and aggregate counts.
`UNIQUE_CANDIDATE` is **not** verified identity, visibility, clickability,
permission, action authorization or success. Supplied metadata is not trusted
merely because it validates; clock provenance and capture authenticity remain
caller obligations.

Selectors combine resource ID/content description/text/class/package by exact
AND matching. At least one ID/description/text predicate is required. Duplicate
matches remain ambiguous: no first-match, positional or coordinate fallback.
Missing enabled/password metadata fails closed for the selected node. Bounds
must be nonempty and inside the declared display. UTF-8 BOM and standard XML
character escapes are supported; DTDs, entities, processing instructions,
comments, CDATA, non-1.0 XML declarations, alternate encodings and unexpected hierarchy shapes are refused.
Offline resource ceilings are 1 MiB input, 10,000 nodes, depth 128 and 10 ASCII
digits per coordinate; these are defensive spike limits, **not measured Android
or production capacity claims**. The byte cap applies before parsing; node/depth checks apply
after parsing and do not promise a strict peak-memory ceiling. Declarations
must be XML 1.0 with absent or UTF-8 encoding; unknown/mismatched declarations
are explicitly rejected before ElementTree can ignore them. Parsing is tested on the recorded Python/Expat
runtime only. No package/version/deployment choice is made for the application.

Run the synthetic suite from the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/phase-00 -p 'test_ui_hierarchy_probe.py' -v
```

Do not publish real hierarchy XML or feed private inputs into test failures/logs.
See [P0-04 evidence](../../docs/evidence/P0-04-offline-selector-2026-10-30.md)
for runtime, source hashes, scope and remaining device gates.

## P0-08 disabled-only review artifact linter

`capability_review_lint.py` validates the current offline
`docs/evidence/P0-08-capability-matrix.json` review artifact, not production
permissions. Pass bytes to `validate_review`; its fixed result
`CONSISTENT_DISABLED_REVIEW` means structurally complete and disabled, never
allowed, compliant, certified or executable. No enable/dispatch API exists.
Unknown actions, ALLOWED/READY/enabled claims, omitted evidence gates and extra
privilege fields reject. A new reviewed disposition needs a separately reviewed
artifact/version, not flipping a boolean. Sources and prose still need human
substantive review. Run all offline tests with the command below; this does not
run Windows collector/device/platform tests:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/phase-00 -p 'test_*.py' -v
```
