# Disposable runner only. Reuse the frozen suspended/owned-Job process helper;
# importing it performs no host inventory, device action, or configuration change.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $root
$reportPath = Join-Path $root '.lab-results/results.json'
$owned = $null
$token = [guid]::NewGuid().ToString()
$cleanupVerified = $true
$oldRun = $env:FONESI_LAB_RUN; $oldToken = $env:FONESI_LAB_TOKEN
$report = [pscustomobject][ordered]@{ scope='HOSTED_RUNNER_ONLY'; passed=$false; results=@(); cleanup=$false; failure='LAB_SUPERVISOR_FAILED' }
$stage = 'PREPARE'
$installerEvidence = $null
$nodeCandidateCount = 0
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'WINDOWS_REQUIRED' }
    New-Item -ItemType Directory -Force -Path (Join-Path $root '.lab-results') | Out-Null
    if (Test-Path -LiteralPath $reportPath) { Remove-Item -LiteralPath $reportPath -Force }
    $stage = 'IMPORT_HELPER'
    Import-Module (Join-Path $PSScriptRoot '../../HostEnvironmentCollector.psm1') -Force
    $stage = 'RESOLVE_NODE'
    $nodeCandidates = @(Get-Command node.exe -CommandType Application -ErrorAction Stop)
    $nodeCandidateCount = $nodeCandidates.Count
    if ($nodeCandidateCount -lt 1) { throw 'NODE_COMMAND_MISSING' }
    # Select the execution-precedence application, not member-enumerated Source[].
    [string]$node = $nodeCandidates[0].Source
    if ([string]::IsNullOrWhiteSpace($node) -or -not [IO.Path]::IsPathRooted($node) -or [IO.Path]::GetExtension($node) -ine '.exe' -or -not [IO.File]::Exists($node)) { throw 'INVALID_NODE_EXECUTABLE' }
    $stage = 'INSTALL'
    $cleanupVerified = $false
    $install = Invoke-CollectorProcess -FilePath $node -ArgumentList @((Join-Path $PSScriptRoot 'install-electron.cjs')) -TimeoutMilliseconds 120000 -CleanupMilliseconds 10000 -MaxOutputCharacters 4096
    $cleanupVerified = $install.cleanupComplete
    $installerEvidence = [ordered]@{ status=$install.status; exitCode=$install.exitCode; cleanupComplete=$install.cleanupComplete }
    if (-not $cleanupVerified -or $install.exitCode -ne 0 -or $install.status -notin @('SUCCESS','EMPTY_OUTPUT')) {
        $report.failure = 'INSTALL_OR_CONTAINMENT_FAILED'; throw 'STOP'
    }
    $stage = 'CREATE_OWNED_ROOT'
    $owned = Join-Path $root ('.lab-runs/run-' + [guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $owned | Out-Null
    [IO.File]::WriteAllText((Join-Path $owned '.owner'), $token)
    $env:FONESI_LAB_RUN = $owned; $env:FONESI_LAB_TOKEN = $token
    # Native helper creates Node suspended, assigns kill-on-close non-breakaway Job,
    # resumes, and verifies zero active descendants on every exit/timeout path.
    $stage = 'RUNTIME'
    $cleanupVerified = $false
    $run = Invoke-CollectorProcess -FilePath $node -ArgumentList @((Join-Path $PSScriptRoot 'run-windows.cjs')) -TimeoutMilliseconds 90000 -CleanupMilliseconds 10000 -MaxOutputCharacters 4096
    $cleanupVerified = $run.cleanupComplete
    $stage = 'READ_RUNTIME_REPORT'
    if (Test-Path -LiteralPath $reportPath) {
        $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    }
    $report | Add-Member -NotePropertyName containment -NotePropertyValue ([ordered]@{ installerCleanup=$install.cleanupComplete; runtimeCleanup=$run.cleanupComplete; runtimeExitCode=$run.exitCode }) -Force
    if (-not $cleanupVerified -or $run.exitCode -ne 0 -or $run.status -notin @('SUCCESS','EMPTY_OUTPUT')) {
        $report.passed = $false
        $report | Add-Member -NotePropertyName failure -NotePropertyValue 'RUNTIME_OR_CONTAINMENT_FAILED' -Force
    }
} catch {
    # Only fixed stage, numeric source line and allowlisted type; never message/stack/output.
    $report.passed = $false
    $kind = $_.Exception.GetType().Name
    if ($kind -notin @('RuntimeException','PSInvalidOperationException','PropertyNotFoundException','ParameterBindingException','ParameterBindingValidationException','ParameterBindingArgumentTransformationException','ArgumentTransformationMetadataException','ActionPreferenceStopException','SessionStateUnauthorizedAccessException','CommandNotFoundException','ItemNotFoundException','DirectoryNotFoundException','UnauthorizedAccessException','IOException','MethodInvocationException')) { $kind = 'UNEXPECTED_EXCEPTION' }
    $sourceLine = 0
    if ($null -ne $_.InvocationInfo) { $sourceLine = [int]$_.InvocationInfo.ScriptLineNumber }
    $report | Add-Member -NotePropertyName diagnostic -NotePropertyValue ([ordered]@{ stage=$stage; kind=$kind; sourceLine=$sourceLine }) -Force
} finally {
    $env:FONESI_LAB_RUN = $oldRun; $env:FONESI_LAB_TOKEN = $oldToken
    try {
        if (-not $cleanupVerified) { throw 'CLEANUP_UNCONFIRMED' }
        if ($null -ne $owned) {
            if ([IO.File]::ReadAllText((Join-Path $owned '.owner')) -cne $token) { throw 'OWNER_MISMATCH' }
            Remove-Item -LiteralPath $owned -Recurse -Force
            if (Test-Path -LiteralPath $owned) { throw 'DIRECTORY_REMAINS' }
        }
        $report.cleanup = $true
    } catch {
        $report.passed = $false
        $report | Add-Member -NotePropertyName failure -NotePropertyValue 'CLEANUP_FAILED' -Force
    }
    $report | Add-Member -NotePropertyName nodeCandidateCount -NotePropertyValue $nodeCandidateCount -Force
    $report | Add-Member -NotePropertyName installer -NotePropertyValue $installerEvidence -Force
    $json = $report | ConvertTo-Json -Depth 8
    try { [IO.File]::WriteAllText($reportPath, $json) } catch { Write-Output 'LAB_REPORT_WRITE_FAILED'; exit 1 }
    Write-Output $json
}
if (-not $report.passed -or -not $report.cleanup) { exit 1 }
