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
if ($count -ne 9) { throw 'TEST_COUNT_FAILED' }
Write-Output 'WINDOWS_BOUNDARY_MARKERS_PASS_9'
