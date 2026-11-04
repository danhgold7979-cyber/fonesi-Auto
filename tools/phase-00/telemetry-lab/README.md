# Disposable hosted telemetry-source lab

P0-06 / G0-16 input only, under the 2026-10-30 19:02 playbook exception.
See the [reviewed scope](../../../docs/evidence/P0-06-hosted-telemetry-PROPOSAL-2026-10-30.md).
No target-host, GPU decode, workload overhead, resource policy or Phase acceptance.

Windows PowerShell 5.1 workers use existing local Get-Counter/CIM only. No package,
driver, counter/ACL or optional-feature installation/change; no elevation, network
request, device action, synthetic load or persistent service. Python 3.12 must
already exist in the runner tool cache; the workflow selects its absolute executable
and does not invoke a launcher that could download a missing runtime. No install.

Six fixed groups have 10-second worker deadlines plus 5-second cleanup each,
using the unchanged NativeProbe suspended-start/non-breakaway kill-on-close Job.
Only a confirmed-clean worker result is considered. Three provider samples with
one-second lab intervals; the first Get-Counter sample is baseline, not retained.
These are experiment bounds, not production latency or cadence targets.

The native helper is called directly, without its collector text redactor: text
redaction can misidentify colon-separated timestamps. Raw native stdout/stderr
are never printed; only an independent strict schema validator may create the
uploaded artifact. Frozen collector/module files are not edited or inventories run.
Only owned `.lab-results` files are replaced; no process-name/PID wildcards used.

- CPU is a valid cooked total percentage; RAM availability/total use bytes.
- Disk rates are aggregate runner counters; network values are anonymous per-
  interface rates, never a sum or stable adapter identity.
- GPU exposes only valid engine-sample count/availability, not total utilization,
  decode use or VRAM. GPU decode/VRAM/temperature remain explicitly NOT_PROBED.
- Missing, inaccessible, unsupported-locale, invalid or timed-out metrics have
  `UNKNOWN` and `samples:null`, never zero. A valid measured zero is preserved.
- Individual Get-Counter counter timestamps (not batch timestamps) must advance and fall within the observed read
  window. CIM capacity has `providerSampleUtc:null`; read timestamps are not
  relabeled as provider timestamps.
- Values are capped at 64 anonymous samples/metric/time. This is a retained-output
  cap, not a claimed peak-memory bound inside the Windows counter provider.
- Wall time, worker CPU time and working set are descriptive worker measurements,
  not total monitoring overhead or a loaded-stream performance benchmark.

The shared PowerShell producer conversion has seven synthetic regressions, including
advancing batch times with frozen counter times and differing per-counter times;
these await hosted execution. A metric with inconsistent provider times is
UNKNOWN/INVALID_DATA, not assigned an invented shared timestamp.

The validator rejects extra fields, duplicate keys, wrong units/source IDs,
nonfinite or invalid values, malformed timestamps, stale rates and raw error/path
fields. Input is capped at 64 KiB. Valid unknown optional sensors remain UNKNOWN.
`requiredCpuRamDataAvailable` means only that the three required CPU/RAM inputs
are valid; it is not an all-sensors capability or full P0-06 PASS. Missing required
CPU/RAM data or incomplete/unclean supervision returns nonzero.

Local pure checks (Python standard library only):

```sh
python -m unittest discover -s tools/phase-00/telemetry-lab -p 'test_*.py' -v
```

Hosted worker execution and PowerShell parsing are NOT_RUN until published CI.
The workflow uploads only `.lab-results/validated.json`, never unvalidated JSON,
raw counter paths, machine/adapter/process IDs or native output. Old validated
results are removed before any new attempt, including validation failures.
