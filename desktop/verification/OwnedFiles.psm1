Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Scope Local

function New-OwnedRun([string]$Parent) {
    Assert-PlainDirectory $Parent
    $path = Join-Path $Parent ('run-' + [guid]::NewGuid().ToString())
    if (Test-Path -LiteralPath $path) { throw 'OWNER_ALREADY_EXISTS' }
    [void][IO.Directory]::CreateDirectory($path)
    Assert-PlainDirectory $path
    $token = [guid]::NewGuid().ToString()
    $stream = [IO.File]::Open((Join-Path $path '.owner'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($token)
        $stream.Write($bytes,0,$bytes.Length)
    } finally { $stream.Dispose() }
    return [pscustomobject]@{ Path=$path; Parent=$Parent; Token=$token }
}

function Assert-OwnedRun($Owner) {
    Assert-PlainDirectory $Owner.Parent
    Assert-PlainDirectory $Owner.Path
    if ([IO.Path]::GetDirectoryName($Owner.Path) -cne $Owner.Parent) { throw 'OWNER_PARENT_MISMATCH' }
    $marker = Get-Item -LiteralPath (Join-Path $Owner.Path '.owner') -Force
    if ($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $marker.Length -ne 36) { throw 'OWNER_MARKER_REJECTED' }
    if ([IO.File]::ReadAllText($marker.FullName) -cne $Owner.Token) { throw 'OWNER_TOKEN_MISMATCH' }
}

function New-OwnedProfile($Owner, [string]$Name) {
    Assert-OwnedRun $Owner
    if ($Name -notin @('source','package','crash','tamper','degraded')) { throw 'PROFILE_NAME_REJECTED' }
    $profile = Join-Path $Owner.Path ('fonesi-auto-foundation-' + $Name)
    if (Test-Path -LiteralPath $profile) { throw 'PROFILE_ALREADY_EXISTS' }
    [void][IO.Directory]::CreateDirectory($profile)
    $stream = [IO.File]::Open((Join-Path $profile '.owner'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes("FONESI_AUTO_FOUNDATION_PROFILE_V1`n")
        $stream.Write($bytes,0,$bytes.Length)
    } finally { $stream.Dispose() }
    return $profile
}

function Copy-VerifiedTree([string]$Source, [string]$Destination, [long]$MaxBytes) {
    Assert-PlainDirectory ([IO.Path]::GetDirectoryName($Destination))
    if (Test-Path -LiteralPath $Destination) { throw 'COPY_DESTINATION_EXISTS' }
    $inventory = Get-BoundedOwnedEntries $Source $MaxBytes
    # Inventory is fully validated before copying; every copied byte is rehashed.
    [void][IO.Directory]::CreateDirectory($Destination)
    foreach ($entry in $inventory.Entries) {
        $relative = $entry.FullName.Substring($Source.TrimEnd('\').Length).TrimStart('\')
        if ([IO.Path]::IsPathRooted($relative) -or $relative.Split('\') -contains '..') { throw 'COPY_PATH_REJECTED' }
        $target = Join-Path $Destination $relative
        if ($entry.PSIsContainer) {
            [void][IO.Directory]::CreateDirectory($target)
        } else {
            [IO.File]::Copy($entry.FullName,$target,$false)
            if ((Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash -cne (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw 'COPY_HASH_MISMATCH' }
        }
    }
    $copied = Get-BoundedOwnedEntries $Destination $MaxBytes
    if ($copied.Bytes -ne $inventory.Bytes -or $copied.Entries.Count -ne $inventory.Entries.Count) { throw 'COPY_INVENTORY_MISMATCH' }
    return $copied.Bytes
}

function Remove-VerifiedOwnedRun($Owner, [bool]$AllJobsRetired) {
    if (-not $AllJobsRetired) { throw 'JOB_RETIREMENT_UNCONFIRMED' }
    Assert-OwnedRun $Owner
    # Final root is marker-only. Never fall back to deleting a rejected/leftover part.
    $enumerator = [IO.Directory]::EnumerateFileSystemEntries($Owner.Path).GetEnumerator()
    try {
        if (-not $enumerator.MoveNext() -or $enumerator.Current -cne (Join-Path $Owner.Path '.owner')) { throw 'OWNER_PARTS_REMAIN' }
        if ($enumerator.MoveNext()) { throw 'OWNER_PARTS_REMAIN' }
    } finally { $enumerator.Dispose() }
    [IO.File]::Delete((Join-Path $Owner.Path '.owner'))
    [IO.Directory]::Delete($Owner.Path,$false)
    if (Test-Path -LiteralPath $Owner.Path) { throw 'OWNED_DELETE_FAILED' }
}

function Remove-VerifiedOwnedPart($Owner, [string]$Name, [bool]$AllJobsRetired) {
    if (-not $AllJobsRetired) { throw 'JOB_RETIREMENT_UNCONFIRMED' }
    $limits = @{'package'=536870912L; 'tampered-build'=8388608L;
        'fonesi-auto-foundation-source'=8388608L; 'fonesi-auto-foundation-package'=8388608L;
        'fonesi-auto-foundation-degraded'=8388608L; 'fonesi-auto-foundation-crash'=8388608L; 'fonesi-auto-foundation-tamper'=8388608L;
        'logs-reparse-target'=8388608L; 'logs-concurrent'=8388608L; 'logs-recovery'=8388608L; 'logs-sharing'=8388608L; 'logs-enospc'=8388608L;
        'logs-source'=8388608L; 'logs-package'=8388608L; 'logs-crash'=8388608L; 'logs-tamper'=8388608L}
    if (-not ($limits.Keys -ccontains $Name)) { throw 'OWNED_PART_NAME_REJECTED' }
    Assert-OwnedRun $Owner
    $path = Join-Path $Owner.Path $Name
    Assert-PlainDirectory $path
    if ($Name.StartsWith('fonesi-auto-foundation-')) {
        $marker = Get-Item -LiteralPath (Join-Path $path '.owner') -Force
        if ($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            $marker.Length -ne ([Text.Encoding]::UTF8.GetByteCount("FONESI_AUTO_FOUNDATION_PROFILE_V1`n")) -or [IO.File]::ReadAllText($marker.FullName) -cne "FONESI_AUTO_FOUNDATION_PROFILE_V1`n") { throw 'PROFILE_MARKER_REJECTED' }
    }
    if ($Name.StartsWith('logs-')) {
        $marker = Get-Item -LiteralPath (Join-Path $path 'owner.json') -Force
        if ($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $marker.Length -gt 128) { throw 'LOG_MARKER_REJECTED' }
        $raw = [IO.File]::ReadAllText($marker.FullName)
        if ($raw -cnotmatch '^\{"schemaVersion":1,"storeId":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\}\n\z') { throw 'LOG_MARKER_REJECTED' }
    }
    # Full fixed-part inventory before any deletion; the existing per-tree caps are unchanged.
    $inventory = Get-BoundedOwnedEntries $path $limits[$Name]
    foreach ($entry in $inventory.Entries) {
        if (-not $entry.PSIsContainer -and $entry.Name -cne '.owner') { [IO.File]::Delete($entry.FullName) }
    }
    # Nested .owner files are ordinary owned bytes, but retain the top profile marker until last.
    foreach ($entry in $inventory.Entries) {
        if (-not $entry.PSIsContainer -and $entry.Name -ceq '.owner' -and $entry.FullName -cne (Join-Path $path '.owner')) { [IO.File]::Delete($entry.FullName) }
    }
    foreach ($entry in @($inventory.Entries | Where-Object {$_.PSIsContainer} | Sort-Object {$_.FullName.Length} -Descending)) {
        [IO.Directory]::Delete($entry.FullName,$false)
    }
    if ([IO.File]::Exists((Join-Path $path '.owner'))) { [IO.File]::Delete((Join-Path $path '.owner')) }
    [IO.Directory]::Delete($path,$false)
    if (Test-Path -LiteralPath $path) { throw 'OWNED_DELETE_FAILED' }
}

Export-ModuleMember -Function New-OwnedRun,Assert-OwnedRun,New-OwnedProfile,Copy-VerifiedTree,Remove-VerifiedOwnedRun,Remove-VerifiedOwnedPart
