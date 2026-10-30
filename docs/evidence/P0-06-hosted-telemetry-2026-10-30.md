# P0-06 hosted telemetry-source preparation — 2026-10-30

## Authority and limits

The [bounded proposal](P0-06-hosted-telemetry-PROPOSAL-2026-10-30.md) was reviewed
and approved by the coordinator under DEC-022 at19:02 UTC; the playbook exception
was recorded before source edits. Scope is read-only runner source evidence only.
The original Phase0/P0-01 dependency, G0-12 navigation failure, actual Windows host,
GPU decode/driver, device/stream/vision-load and production cadence gates remain
open. Full P0-06 and architecture are not accepted.

## Implementation slice

New telemetry-lab PowerShell workers use only existing local Get-Counter/CIM and
selected properties. Six fixed groups, three actual Get-Counter samples with first
baseline discarded,10s worker+5s cleanup limits through unchanged NativeProbe.
The supervisor uses NativeProbe directly, not collector text redaction that could
mistake timestamps for address-like text. No native output is printed or uploaded.
A separate strict Python standard-library validator creates the only uploadable
artifact after validating raw JSON, duplicate keys, allowed fields, dates, units,
value bounds, source identities, cleanup flags and missingness.

CPU/RAM/disk/anonymous network values and GPU valid engine-sample count only.
GPU decode/VRAM/temperature NOT_PROBED. No counter paths, adapter/process IDs,
addresses or raw errors retained. Localized-counter mismatch/access/error/timeout
is UNKNOWN with null samples, not zero. CIM capacity has null provider timestamp;
only the observed read window is supplied. Rate timestamps must genuinely advance
and fall within that read window. Measured CPU delta and working-set snapshot
are worker descriptors, not whole-system overhead or performance guarantees.

Workflow requires already-installed Python3.12 and Windows PowerShell5.1; no setup
or installer action, no elevation, counter/ACL/driver changes, network/device
request or load generation. It parses PowerShell, runs pure regressions, executes
owned workers, and uploads only schema-approved validated.json for7days.
A schema-valid optional UNKNOWN stays UNKNOWN. Required CPU/RAM absence makes the
useful-data result nonzero; no all-sensor PASS is inferred.

## Actual checks at19:12 UTC

- Linux/Python3.12.14:11/11 pure schema/privacy tests PASS.
- Workflow YAML parse PASS; git diff --check PASS.
- Windows PowerShell parsing, actual counter sampling, timestamp/provider validity
  and native containment for these new workers: NOT_RUN pending hosted execution.
- Independent safety/schema review: CLOSED at19:19UTC after the corrections below.
- Existing collector/native source unchanged; desktop experiment separately
  remains source20/21+package20/21, navigation FAIL.

No new production service, resource budget, live setting change or Phase acceptance.

## Pre-publication review corrections — 19:15 UTC

The independent reviewer found that Get-Counter's batch Timestamp is not necessarily
an individual counter's raw provider Timestamp. The worker now uses a shared pure
conversion function with per-counter identity/timestamp tracking only in memory.
Each provider must advance from baseline and stay within the observed read window;
all values sharing one output timestamp must agree, otherwise UNKNOWN/INVALID_DATA.
No raw counter identity is exported. Seven PowerShell producer regressions include
stale individual values under advancing batches, disagreeing counter times and
explicit null cooked-value rejection;
they are authored but NOT_RUN until hosted CI.
Primary source: [PowerShell PDH sample construction](https://github.com/PowerShell/PowerShell/blob/master/src/Microsoft.PowerShell.Commands.Diagnostics/PdhHelper.cs#L1091-L1192).

The reviewer also found the file-size check happened after read_bytes allocation;
the validator now reads at most65537bytes before enforcing the64KiB limit. Local
Python regressions remain11/11PASS. Negative worker CPU deltas become null, never
a fabricated zero. Windows producer parsing/execution remains NOT_RUN.

The reviewer additionally required null cooked-value rejection before numeric
conversion (otherwise null could become0); the shared producer now requires the
actual provider's double type. The seventh producer regression covers null.
Cached Python selection is an explicit existing executable, not an auto-installing
launcher. Windows PowerShell5.1 GitHub environment/summary files use explicit
UTF-8 Out-File rather than its UTF-16 redirection default. Workflow YAML/diff
checks PASS; local telemetry11/11 and unchanged offline42/42 tests PASS at19:18UTC.

Checkpoint frozen19:20UTC,18minutes after recorded experiment authorization.
All seven PowerShell producer regressions and real hosted probes remain NOT_RUN.
Original collector/native implementation and previous workflows are unchanged.

## Hosted execution — scoped experiment PASS, 2026-10-30 19:22 UTC

Exact published source `0c3cc7d6ecd2eea5cd852dd5727aeca9b9bdd03c`,
[telemetry run41114623415](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41114623415),
job124265490837, completed SUCCESS on WindowsServer2022 build20348,
PowerShell5.1.20348.5756 and preinstalled Python3.12.10. No runtime installation.

- PowerShell syntax parse PASS.
- Python schema/privacy tests11/11PASS (0.014s hosted).
- PowerShell producer regressions7/7PASS, including frozen per-counter timestamps
  under advancing batches, inconsistent per-counter times and null cooked values.
- Six actual worker groups completed; all6 native Job cleanupComplete flags true.
- Independent output schema and required CPU/RAM useful-data checks PASS.

Artifact13004882555 contains only validated.json,1076compressed bytes, ZIP SHA256
`d2b2bc769ce8209305115731366f3961e5fdf0eb541288592890caae85523aff`.
Downloaded bytes matched that digest; archive membership and bounded raw JSON
were checked, including duplicate-key rejection, then independently revalidated.
The [sanitized retained sample](P0-06-hosted-telemetry-sample-2026-10-30.json)
contains no raw counter paths, names, addresses or process/adapter identifiers.
The GitHub artifact expires2026-11-06; this schema-reviewed sample preserves evidence.

| Source | Actual observation | Scope limit |
|---|---|---|
| CPU total | AVAILABLE, two samples approximately0.1422%/0.1228% | Short runner observation, not an approved performance budget |
| RAM available/total | AVAILABLE; about14.526GB available,17,174,360,064bytes total | Hosted runner only; capacity provider timestamp is correctly null |
| Disk read/write | AVAILABLE; measured zeros plus nonzero rates | Zero is real valid data, not missing-data substitution |
| Network receive/send | AVAILABLE, two anonymous interface values per sample, both zero | No physical-network aggregate, stable adapter identity or throughput claim |
| GPU engine availability | AVAILABLE,45valid engine-counter instances per sample | Not45GPUs, aggregate utilization, video decode or VRAM evidence |
| GPU decode/VRAM/temperature | NOT_PROBED | Remain UNKNOWN; not treated as zero or available |

All retained counter-provider timestamps advanced inside their observed read
windows; CIM total capacity uses read timestamps without fabricated provider time.
Worker elapsed durations were approximately0.473–3.482seconds, including deliberate
sample intervals; CPU time and working-set fields are own-worker observations only.
No inference of full-system monitoring overhead, production cadence, stream capacity
or target-host compatibility is made. The runner used its existing token without
elevation; standard-user access on the target PC was not verified.

**Outcome:** bounded source experiment PASS; full P0-06/G0-16 acceptance BLOCKED on
target Windows, broader driver/localization coverage, unavailable metrics and real
stream/vision-load evaluation. P0-01 HC-09/HC-13, G0-12 navigation, device and policy
gates remain open; Phase acceptance0/10. Desktop navigation failure was not rerun.

Independent artifact/evidence review closed19:26UTC: before Git newline
normalization, on-disk downloaded payload and retained sample were byte-identical
6,280bytes, SHA256
`48878a2926ea65e8763b6d4dc3e4cf72ed8b6838dbbdea68579e507984d6ebe3`.
Reviewer independently rejected duplicate keys before normalization, verified the
derived required-data Boolean, reran the strict schema, checked all6 cleanup flags,
8 available metrics, provider/read timestamps and fixed-field privacy. Local
schema11/11PASS again. Reviewer did not separately download the ZIP or rerun
PowerShell; the hosted execution evidence remains the single cited CI run.

Git staged diff check then caught Windows CRLF line endings in the copied sample.
The retained sample was normalized to LF only: 6043bytes, SHA256
`53967de314fd19ddb063c801e9253b10bacf4d00a83ccce3aeb1e11102e775ea`. Parsed JSON equality with the downloaded payload and strict schema
revalidation PASS; no values changed. Original artifact hash above remains valid.
