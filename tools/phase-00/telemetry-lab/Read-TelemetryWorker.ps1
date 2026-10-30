param([Parameter(Mandatory=$true)][ValidateSet('cpu','ram','capacity','disk','network','gpu')][string]$Group)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'TelemetrySources.psm1') -Force
$readStarted=[DateTime]::UtcNow
$start=$readStarted.ToString('o')
$watch=[Diagnostics.Stopwatch]::StartNew()
$self=[Diagnostics.Process]::GetCurrentProcess()
$cpuStart=$self.TotalProcessorTime.TotalMilliseconds
$records=New-UnknownMetrics $Group 'UNEXPECTED_FAILURE'
try {
    $specs=@(Get-TelemetrySpecs $Group)
    if ($Group -eq 'capacity') {
        $os=Get-CimInstance -ClassName Win32_OperatingSystem -Property TotalVisibleMemorySize -OperationTimeoutSec 3 -ErrorAction Stop
        $bytes=[double]$os.TotalVisibleMemorySize * 1024
        if ([double]::IsNaN($bytes) -or [double]::IsInfinity($bytes) -or $bytes -le 0 -or $bytes -gt 9007199254740991) { throw 'INVALID_DATA' }
        $records=@([pscustomobject][ordered]@{ sourceId='ram.total'; unit='bytes'; status='AVAILABLE'; reason='OK';
            samples=@([pscustomobject]@{ providerSampleUtc=$null; values=@($bytes) }) })
    } elseif ([Globalization.CultureInfo]::InstalledUICulture.TwoLetterISOLanguageName -ne 'en') {
        $records=New-UnknownMetrics $Group 'UNSUPPORTED_LOCALE'
    } else {
        # Exactly three actual provider samples; omit first as baseline. No raw paths emitted.
        $sets=@(Get-Counter -Counter @($specs | ForEach-Object {$_.path}) -SampleInterval 1 -MaxSamples 3 -ErrorAction Stop)
        if ($sets.Count -ne 3) { throw 'INVALID_DATA' }
        $records=@()
        foreach ($spec in $specs) {
            $samples=@(ConvertTo-TelemetrySamples -Sets $sets -Spec $spec -ReadStart $readStarted -ReadEnd ([DateTime]::UtcNow))
            $records+=,[pscustomobject][ordered]@{ sourceId=$spec.id; unit=$spec.unit; status='AVAILABLE'; reason='OK'; samples=$samples }
        }
    }
} catch {
    $reason='UNEXPECTED_FAILURE'
    if ($_.Exception.Message -ceq 'INVALID_DATA') { $reason='INVALID_DATA' }
    elseif ($_.CategoryInfo.Category -eq [System.Management.Automation.ErrorCategory]::PermissionDenied) { $reason='ACCESS_DENIED' }
    elseif ($_.CategoryInfo.Category -eq [System.Management.Automation.ErrorCategory]::ObjectNotFound) { $reason='SOURCE_MISSING' }
    $records=New-UnknownMetrics $Group $reason
}
$self.Refresh()
$cpuDelta=$self.TotalProcessorTime.TotalMilliseconds-$cpuStart
if ($cpuDelta -lt 0) { $cpuDelta=$null }
$result=[ordered]@{ group=$Group; readStartUtc=$start; readEndUtc=[DateTime]::UtcNow.ToString('o'); durationMs=$watch.Elapsed.TotalMilliseconds;
    workerCpuMs=$cpuDelta; workerWorkingSetBytes=$self.WorkingSet64; metrics=@($records) }
Write-Output ($result | ConvertTo-Json -Depth 8 -Compress)
