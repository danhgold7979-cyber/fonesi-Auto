# Fonesi-Auto Phase 0 / P0-01. Read-only diagnostics; Windows PowerShell 5.1.
# No install, elevation, security-policy change, device enumeration, or upload.
[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path ([Environment]::GetFolderPath('Desktop')) ('Fonesi-Auto-P0-01-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))),
    [switch]$IncludeOptionalFeatureQuery,
    [switch]$IncludeAccelerationCheck,
    [ValidateRange(100, 120000)][int]$TimeoutMilliseconds = 10000,
    [ValidateRange(100, 10000)][int]$CleanupMilliseconds = 2000,
    [ValidateRange(256, 1048576)][int]$MaxOutputCharacters = 65536
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
    Import-Module (Join-Path $PSScriptRoot 'HostEnvironmentCollector.psm1') -Force -ErrorAction Stop
    $report = Get-CollectorHostReport -IncludeOptionalFeatureQuery:$IncludeOptionalFeatureQuery -IncludeAccelerationCheck:$IncludeAccelerationCheck -TimeoutMilliseconds $TimeoutMilliseconds -CleanupMilliseconds $CleanupMilliseconds -MaxOutputCharacters $MaxOutputCharacters
    $export = Export-CollectorReport -Report $report -OutputDirectory $OutputDirectory
    Write-Host ('P0-01 collection: ' + $report.status + '. This is not host or Phase acceptance.')
    Write-Host 'Private report and ZIP created in the requested new output location. Review locally before sharing.'
    [pscustomobject]@{ status = $report.status; runId = $report.runId; exportStatus = $export.status }
} catch {
    # Avoid InvocationInfo/raw exception content which can include a user path.
    [Console]::Error.WriteLine('P0-01 collection failed (' + $_.Exception.GetType().Name + '). No existing evidence is overwritten; check the new output location for partial files.')
    exit 1
}
