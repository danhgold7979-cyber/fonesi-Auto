# P0-06 hosted telemetry-source experiment — PROPOSAL

Recorded 2026-10-30 19:00 UTC. **BOUNDED EXPERIMENT APPROVED by coordinating review at 19:02 UTC**, under DEC-022; playbook §6 exception recorded before code.
This is a proposed independent slice of P0-06 / mapping G0-16, not the full task,
not an amendment acceptance and not a continuation of production Phase 1.

## Dependency and proposed exception

Approved Phase 0 plan makes P0-06 depend on P0-01. The target Windows HC-09/HC-13
inputs remain unresolved, and G0-12 has a measured navigation failure. Neither
may be waived. Proposed playbook §6 exception, requiring coordinator review before
code: use only the hosted Windows runner's read-only local performance APIs to
measure source availability, validity and elapsed sampling cost. This consumes
neither the target PC nor Electron, Android, scrcpy or a device. Results can inform
source contracts but **cannot** certify target host support or performance.
The original Phase 0 baseline stays unchanged. P0-06 acceptance remains blocked.

## Intended outcome and narrow files

Disposable PowerShell 5.1 telemetry probe under `tools/phase-00/telemetry-lab/`,
pure value/availability tests, separate hosted Windows job/workflow, sanitized
results and this evidence record. Reuse the unchanged NativeProbe owned Job helper
for bounded PowerShell worker processes; do not modify the collector. No added
package dependencies/installers or persistent services. No UI, resource manager,
Auto/Manual control, stream admission or production sampling interval choice.

## Candidate source contracts (reviewed primary documentation)

The initial hosted runner is English Windows Server 2022. Built-in `Get-Counter`
uses localized counter names; if the runner's counter language does not match,
return UNKNOWN/UNSUPPORTED_LOCALE rather than guess translations. This is explicitly
not a multilingual Windows implementation. Source IDs are fixed labels; raw PDH
paths (which can contain host, process and adapter identifiers) never leave the
worker's memory.

| Field | Candidate read-only source | Unit and interpretation |
|---|---|---|
| cpu.total | Get-Counter Processor(_Total)/% Processor Time | percent [0,100], provider cooked sample; not process CPU or capacity budget |
| ram.available | Memory/Available Bytes | bytes >=0; no invented used value if total is unavailable |
| ram.total | Win32_OperatingSystem.TotalVisibleMemorySize, selected property only | documented KiB converted to bytes; physical OS-visible capacity, not allocation pressure |
| disk.read/write | PhysicalDisk(_Total)/Disk Read Bytes/sec and Disk Write Bytes/sec | bytes/second >=0; runner aggregate, not filesystem latency or physical-device benchmark |
| network.receive/send | Network Interface(*)/Bytes Received/sec and Bytes Sent/sec | anonymous per-interface samples, no names/IP/MAC and no cross-interface sum (virtual adapters may double-count) |
| gpu.engineAvailability | GPU Engine(*)/Utilization Percentage probe | availability and valid anonymous engine sample count only; not an aggregate GPU utilization or decode metric |
| gpu.decode, gpu.vram, temperature | no reviewed adapter mapping/vendor sensor implementation in this slice | UNKNOWN/NOT_PROBED; explicitly outside this increment, never zero |

Actual counter existence, data status and permissions are empirical questions.
GPU provider availability is driver/WDDM-dependent. No elevation, driver change,
ACL modification or enabling counters is permitted if unavailable.

Each metric result must contain fixed sourceId/unit, status AVAILABLE or UNKNOWN,
finite value(s) or null, providerSampleUtc (null when the source supplies none), readStartUtc,
readEndUtc, monotonic durationMs and fixed reason. UNKNOWN reasons include
NOT_PROBED, UNSUPPORTED_LOCALE, SOURCE_MISSING, ACCESS_DENIED, INVALID_DATA,
TIMEOUT and UNEXPECTED_FAILURE. No raw exception, class dump or counter path.
Anonymous interface samples are per-sample only; no stable adapter identity or
cross-sample adapter trend is claimed.

## Bounds / freshness / overhead

- At most six fixed metric groups, each in a separately owned worker Job with
  10-second process limit plus 5-second verified cleanup; overall workflow 5 minutes.
- Three provider samples/group at one-second intervals; discard warm-up sample
  where a cooked rate needs a baseline. These are **lab inputs**, not production
  cadence/freshness/latency acceptance settings.
- Max 64 retained anonymous values per group/sample; overflow reports UNKNOWN/
  INVALID_DATA and a bounded count. No counter-path enumeration artifacts.
- Record actual provider timestamp and elapsed read time; never relabel a reused
  sample as newly measured. A rate-source timestamp that does not advance across the
  probe is UNKNOWN/INVALID_DATA; CIM total RAM is a capacity snapshot with
  providerSampleUtc=null and observed read timestamps, not fabricated freshness; source validity is distinct from a valid zero.
- Measure wall time and the owned worker's own process CPU/working-set deltas if
  available. Report them descriptively; do not claim whole-system overhead from
  those numbers or extrapolate to loaded scrcpy/OCR operation.
- No synthetic CPU/disk/network load, sleeps masquerading as sensor evidence,
  stream workload or proposed performance thresholds.

## Checks and stopping conditions

Pure tests: preserve measured zero; reject NaN/infinity/negative/out-of-range
percentages; missing/error/timeout -> null UNKNOWN; retain original timestamps;
nonadvancing/stale sample distinction; units/conversions; cap anonymous arrays;
fixed-field privacy serialization with hostile path-like error fixtures.

Hosted checks: real CPU/RAM/disk/network source results (availability and any
UNKNOWN reason both reported); GPU availability is measured, not assumed; every
value has correct unit/status/timestamp, nonzero duration measured where possible,
no raw paths/IDs in retained JSON, workers all return/timeout with verified cleanup.
An UNKNOWN sensor is not a sensor PASS. A harness may pass safe-unavailability
handling while its per-metric capability remains UNKNOWN. Required CPU/RAM absent
or invalid means the useful-data experiment is BLOCKED/FAIL, not silently green.

Stop on unsafe source behavior, unconfirmed cleanup, unknown package dependency,
need for elevation, or a request to change host settings. No fallback to security
changes. Full P0-06 still requires target Windows availability, real GPU/driver
coverage, approved freshness contract, and stream/vision-load overhead evidence.

## Primary references checked 2026-10-30

- [Microsoft Get-Counter](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-counter?view=powershell-5.1): local performance data, finite sampling controls, localization and access limitations.
- [Microsoft Win32_OperatingSystem](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem): selected memory properties/units; no broad machine inventory export.
- [Microsoft WMI performance monitoring](https://learn.microsoft.com/en-us/windows/win32/wmisdk/monitoring-performance-data): formatted/raw counters and baseline refresh requirements; no claim that one raw snapshot is a valid rate.
- [Microsoft DirectX GPU telemetry](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/), 2017-07-21: historical primary explanation of driver/WDDM dependence, not a current guarantee for the hosted runner.

## Requested coordinating decision

Approve/reject only this read-only hosted source experiment and its explicit
P0-01-dependency exception. Before implementation, append the accepted narrow scope
to playbook §6 with test budgets and the still-open target-host/performance gates.
No production architecture, alternate desktop candidate or Phase acceptance is
requested here.
