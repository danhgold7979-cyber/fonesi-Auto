$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
$count = 0
foreach ($case in @(
    @{text=''; expected=$false},
    @{text='OTHER'; expected=$false},
    @{text="FORBIDDEN`n"; expected=$true},
    @{text="FORBIDDEN`r`nFORBIDDEN`r`n"; expected=$true},
    @{text="OTHER`nFORBIDDEN`nOTHER"; expected=$true},
    @{text='forbidden'; expected=$false}
)) {
    if ((Test-AnyLine $case.text 'FORBIDDEN') -ne $case.expected) { throw 'FORBIDDEN_MARKER_TEST_FAILED' }
    $count++
}
foreach ($case in @(
    @{text=''; expected=$false},
    @{text="REQUIRED`n"; expected=$true},
    @{text="REQUIRED`nREQUIRED`n"; expected=$false}
)) {
    if ((Test-ExactlyOneLine $case.text 'REQUIRED') -ne $case.expected) { throw 'REQUIRED_MARKER_TEST_FAILED' }
    $count++
}
if ((Get-FixedCleanupReason 'OWNED_COUNT_EXCEEDED') -cne 'OWNED_COUNT_EXCEEDED') { throw 'CLEANUP_CODE_FAILED' }
$count++
if ((Get-FixedCleanupReason 'private path and error') -cne 'UNCLASSIFIED') { throw 'CLEANUP_PRIVACY_FAILED' }
$count++
if ((Get-FixedCleanupReason 'private message' 'IOException' 32) -cne 'FILE_IN_USE') { throw 'IO_CODE_FAILED' }
$count++
if ((Get-FixedCleanupReason 'private message' 'UnauthorizedAccessException' 5) -cne 'ACCESS_DENIED') { throw 'ACCESS_CODE_FAILED' }
$count++
if ((Get-FixedCleanupReason 'private message' 'private type' 32) -cne 'UNCLASSIFIED') { throw 'TYPE_PRIVACY_FAILED' }
$count++
if ((Get-FixedCleanupReason 'owned_count_exceeded') -cne 'UNCLASSIFIED') { throw 'CODE_CASE_FAILED' }
$count++
if ($count -ne 15) { throw 'TEST_COUNT_FAILED' }
Write-Output 'WINDOWS_BOUNDARY_MARKERS_PASS_15'
