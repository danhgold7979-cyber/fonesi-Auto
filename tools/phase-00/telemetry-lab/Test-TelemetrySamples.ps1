$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'TelemetrySources.psm1') -Force
$start=[DateTime]::Parse('2026-10-30T19:00:00Z').ToUniversalTime()
$end=$start.AddSeconds(5)
$spec=@(Get-TelemetrySpecs 'cpu')[0]
function New-TestSets {
    param([switch]$Stale, [double]$Value=0, [int]$Status=0)
    return @(0..2 | ForEach-Object {
        $index=$_; $stamp=$start.AddSeconds($index)
        if ($Stale) { $stamp=$start }
        [pscustomobject]@{ Timestamp=$start.AddSeconds($index); CounterSamples=@(
            [pscustomobject]@{ Path='synthetic\% processor time'; Timestamp=$stamp; Status=$Status; CookedValue=$Value }) }
    })
}
function Assert-Rejected {
    param([scriptblock]$Action)
    $rejected=$false
    try { & $Action | Out-Null } catch { if ($_.Exception.Message -ceq 'INVALID_DATA') { $rejected=$true } else { throw } }
    if (-not $rejected) { throw 'REGRESSION_FAILED' }
}
$good=@(ConvertTo-TelemetrySamples -Sets (New-TestSets) -Spec $spec -ReadStart $start -ReadEnd $end)
if ($good.Count -ne 2 -or $good[0].values[0] -ne 0 -or $good[0].providerSampleUtc -cne $start.AddSeconds(1).ToString('o')) { throw 'REGRESSION_FAILED' }
Assert-Rejected { ConvertTo-TelemetrySamples -Sets (New-TestSets -Stale) -Spec $spec -ReadStart $start -ReadEnd $end }
Assert-Rejected { ConvertTo-TelemetrySamples -Sets (New-TestSets -Value 101) -Spec $spec -ReadStart $start -ReadEnd $end }
Assert-Rejected { ConvertTo-TelemetrySamples -Sets (New-TestSets -Status 2) -Spec $spec -ReadStart $start -ReadEnd $end }
Assert-Rejected { ConvertTo-TelemetrySamples -Sets (New-TestSets) -Spec $spec -ReadStart $start.AddSeconds(2) -ReadEnd $end }
$multiSpec=$spec.Clone(); $multiSpec.many=$true
$multiSets=New-TestSets
foreach ($set in $multiSets) {
    $set.CounterSamples+=,[pscustomobject]@{ Path='second-synthetic\% processor time'; Timestamp=$set.CounterSamples[0].Timestamp.AddMilliseconds(1); Status=0; CookedValue=[double]0 }
}
Assert-Rejected { ConvertTo-TelemetrySamples -Sets $multiSets -Spec $multiSpec -ReadStart $start -ReadEnd $end }
$nullSets=New-TestSets
$nullSets[1].CounterSamples[0].CookedValue=$null
Assert-Rejected { ConvertTo-TelemetrySamples -Sets $nullSets -Spec $spec -ReadStart $start -ReadEnd $end }
Write-Output 'PASS_TELEMETRY_PROVIDER_REGRESSIONS_7'
