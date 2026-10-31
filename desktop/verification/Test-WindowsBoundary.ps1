$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
$count = 0
foreach ($literal in @('--maintenance=backup-now','--maintenance=list-backups','--maintenance=restore-to-new','--maintenance=accept-upgrade','--maintenance=select-backup-folder')) {
    if (-not (Test-AllowedChildArgument $literal)) { throw 'MAINTENANCE_LITERAL_REJECTED' }
    $count++
}
foreach ($literal in @('--maintenance=unknown','--maintenance=backup-now=extra','--MAINTENANCE=backup-now','--no-sandbox',"--maintenance=backup-now`n")) {
    if (Test-AllowedChildArgument $literal) { throw 'UNTRUSTED_SWITCH_ALLOWED' }
    $count++
}

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
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
function Expect-Rejected([scriptblock]$Action) {
    $rejected = $false
    try { & $Action } catch { $rejected=$true }
    if (-not $rejected) { throw 'EXPECTED_REJECTION_MISSING' }
}
$parent = Join-Path ([IO.Path]::GetTempPath()) ('auto-owned-boundary-test-' + [guid]::NewGuid().ToString())
if (Test-Path -LiteralPath $parent) { throw 'TEST_PARENT_EXISTS' }
[void][IO.Directory]::CreateDirectory($parent)
$owner = New-OwnedRun $parent
try {
    $profile = New-OwnedProfile $owner 'source'
    Expect-Rejected { Remove-VerifiedOwnedRun $owner $true }
    if (-not (Test-Path -LiteralPath $profile)) { throw 'FINAL_ROOT_DELETED_LEFTOVER' }
    $count++
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'FONESI-AUTO-FOUNDATION-SOURCE' $true }
    if (-not (Test-Path -LiteralPath $profile)) { throw 'CASE_ALIAS_DELETED_PROFILE' }
    $count++
    $profileMarker = Join-Path $profile '.owner'
    [IO.File]::WriteAllText($profileMarker,'wrong')
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'fonesi-auto-foundation-source' $true }
    Expect-Rejected { Remove-VerifiedOwnedRun $owner $true }
    if (-not [IO.File]::Exists($profileMarker)) { throw 'BAD_MARKER_DELETED' }
    [IO.File]::WriteAllText($profileMarker,"FONESI_AUTO_FOUNDATION_PROFILE_V1`n")
    $count++
    Expect-Rejected { Remove-VerifiedOwnedPart $owner '../unknown' $true }
    if (-not (Test-Path -LiteralPath $profile)) { throw 'WRONG_NAME_DELETED_PROFILE' }
    $count++
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'fonesi-auto-foundation-source' $false }
    if (-not (Test-Path -LiteralPath $profile)) { throw 'UNRETIRED_DELETED_PROFILE' }
    $count++
    $wrong = [pscustomobject]@{Path=$owner.Path;Parent=$owner.Parent;Token='wrong-token'}
    Expect-Rejected { Remove-VerifiedOwnedPart $wrong 'fonesi-auto-foundation-source' $true }
    if (-not (Test-Path -LiteralPath $profile)) { throw 'WRONG_OWNER_DELETED_PROFILE' }
    $count++
    Remove-VerifiedOwnedPart $owner 'fonesi-auto-foundation-source' $true
    if (Test-Path -LiteralPath $profile) { throw 'OWNED_PART_NOT_REMOVED' }
    $count++
    $profile = New-OwnedProfile $owner 'source'
    # 256 explicit fixture files plus the marker exceed the unchanged 256-entry cap.
    $files = @()
    for ($index=0; $index -lt 256; $index++) {
        $file = Join-Path $profile ('fixture-' + $index + '.txt')
        [IO.File]::WriteAllText($file,'x'); $files += $file
    }
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'fonesi-auto-foundation-source' $true }
    if (-not [IO.File]::Exists($files[0])) { throw 'COUNT_LIMIT_DELETED_DATA' }
    foreach ($file in $files) { [IO.File]::Delete($file) }
    $count++
    $large = Join-Path $profile 'known-large-fixture.bin'
    $stream = [IO.File]::Open($large,[IO.FileMode]::CreateNew)
    try { $stream.SetLength(8388609L) } finally { $stream.Dispose() }
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'fonesi-auto-foundation-source' $true }
    if (-not [IO.File]::Exists($large)) { throw 'BYTE_LIMIT_DELETED_DATA' }
    [IO.File]::Delete($large)
    $count++
    $directories=@(); $deep=$profile
    for ($index=0; $index -lt 17; $index++) {
        $deep=Join-Path $deep 'd'; [void][IO.Directory]::CreateDirectory($deep); $directories += $deep
    }
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'fonesi-auto-foundation-source' $true }
    if (-not [IO.Directory]::Exists($deep)) { throw 'DEPTH_LIMIT_DELETED_DATA' }
    foreach ($directory in @($directories | Sort-Object Length -Descending)) { [IO.Directory]::Delete($directory,$false) }
    $count++
    Remove-VerifiedOwnedPart $owner 'fonesi-auto-foundation-source' $true
    $logs = Join-Path $owner.Path 'logs-source'
    [void][IO.Directory]::CreateDirectory($logs)
    [IO.File]::WriteAllText((Join-Path $logs 'owner.json'),'private invalid owner')
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'logs-source' $true }
    if (-not [IO.File]::Exists((Join-Path $logs 'owner.json'))) { throw 'LOG_REJECTION_DELETED_MARKER' }
    $count++
    [IO.File]::WriteAllText((Join-Path $logs 'owner.json'),('{"schemaVersion":1,"storeId":"' + [guid]::NewGuid().ToString() + '"}' + "`n"))
    $canonicalLogOwner = [IO.File]::ReadAllText((Join-Path $logs 'owner.json'))
    [IO.File]::WriteAllText((Join-Path $logs 'owner.json'),$canonicalLogOwner + "`n")
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'logs-source' $true }
    if (-not [IO.File]::Exists((Join-Path $logs 'owner.json'))) { throw 'LOG_EXTRA_NEWLINE_DELETED_MARKER' }
    [IO.File]::WriteAllText((Join-Path $logs 'owner.json'),$canonicalLogOwner)
    $count++
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'logs-source' $false }
    $count++
    Expect-Rejected { Remove-VerifiedOwnedPart $owner 'LOGS-SOURCE' $true }
    $count++
    Remove-VerifiedOwnedPart $owner 'logs-source' $true
    if (Test-Path -LiteralPath $logs) { throw 'LOG_PART_NOT_REMOVED' }
    $count++
    Remove-VerifiedOwnedRun $owner $true
} finally {
    # Empty-only deletion: a failed assertion preserves uncertain fixture contents.
    if ([IO.Directory]::Exists($parent) -and [IO.Directory]::GetFileSystemEntries($parent).Length -eq 0) {
        [IO.Directory]::Delete($parent,$false)
    }
}
if ($count -ne 40) { throw 'TEST_COUNT_FAILED' }
Write-Output 'WINDOWS_BOUNDARY_MARKERS_AND_OWNERSHIP_PASS_40'
