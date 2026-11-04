$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$directory=Join-Path $PSScriptRoot '.lab-results'
$raw=Join-Path $directory 'unvalidated.json'
$validated=Join-Path $directory 'validated.json'
try {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    foreach ($file in @($raw,$validated)) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
} catch { Write-Output 'TELEMETRY_PREPARE_FAILED'; exit 1 }
$groups=@(); $complete=$true; $failure=$null; $stage='HELPER_FAILED'
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'WINDOWS_REQUIRED' }
    Import-Module (Join-Path $PSScriptRoot 'TelemetrySources.psm1') -Force
    # NativeProbe itself is unchanged. Avoid text-redaction of our structured UTC fields;
    # no captured output is printed, and independent schema validation precedes upload.
    if (-not ('Fonesi.Phase00.NativeProbe' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot '../HostProbeNative.cs') -ErrorAction Stop }
    $exe=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $stage='WORKER_INVOCATION_FAILED'
    foreach ($group in @('cpu','ram','capacity','disk','network','gpu')) {
        $start=[DateTime]::UtcNow.ToString('o')
        $probe=[Fonesi.Phase00.NativeProbe]::Run($exe, [string[]]@('-NoProfile','-NonInteractive','-File',(Join-Path $PSScriptRoot 'Read-TelemetryWorker.ps1'),'-Group',$group),10000,5000,65536)
        $entry=$null
        if ($probe.CleanupComplete -and $probe.ExitCode -eq 0 -and $probe.Status -eq 'SUCCESS' -and -not $probe.StdoutTruncated) {
            try { $entry=$probe.Stdout | ConvertFrom-Json -ErrorAction Stop } catch {}
        }
        if ($null -eq $entry) {
            $reason='UNEXPECTED_FAILURE'
            if ($probe.Status -eq 'TIMEOUT') {$reason='TIMEOUT'}
            $entry=[pscustomobject][ordered]@{ group=$group; readStartUtc=$start; readEndUtc=[DateTime]::UtcNow.ToString('o'); durationMs=$probe.DurationMs;
                workerCpuMs=$null; workerWorkingSetBytes=$null; metrics=@(New-UnknownMetrics $group $reason) }
        }
        $entry | Add-Member -NotePropertyName cleanupComplete -NotePropertyValue $probe.CleanupComplete -Force
        $groups+=,$entry
        if (-not $probe.CleanupComplete) { $complete=$false; $failure='CLEANUP_UNCONFIRMED'; break }
    }
} catch { $complete=$false; $failure=$stage }
# Only the Python validator may create the artifact that the workflow uploads.
$report=[ordered]@{ scope='HOSTED_RUNNER_ONLY'; schemaVersion=1; complete=$complete; supervisorFailure=$failure; groups=@($groups);
    notProbed=@('gpu.decode','gpu.vram','temperature') }
try { [IO.File]::WriteAllText($raw,($report | ConvertTo-Json -Depth 10)) } catch { Write-Output 'TELEMETRY_REPORT_WRITE_FAILED'; exit 1 }
Write-Output 'TELEMETRY_WORKERS_FINISHED_PENDING_SCHEMA_VALIDATION'
