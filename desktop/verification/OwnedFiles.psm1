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
    if ($Name -notin @('source','package','crash','tamper')) { throw 'PROFILE_NAME_REJECTED' }
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
    # Preserve the whole tree if any entry is unsafe. Never recursive bulk-delete.
    $inventory = Get-BoundedOwnedEntries $Owner.Path (512L * 1024 * 1024)
    foreach ($entry in $inventory.Entries) {
        if (-not $entry.PSIsContainer -and $entry.FullName -cne (Join-Path $Owner.Path '.owner')) { [IO.File]::Delete($entry.FullName) }
    }
    foreach ($entry in @($inventory.Entries | Where-Object {$_.PSIsContainer} | Sort-Object {$_.FullName.Length} -Descending)) {
        [IO.Directory]::Delete($entry.FullName,$false)
    }
    [IO.File]::Delete((Join-Path $Owner.Path '.owner'))
    [IO.Directory]::Delete($Owner.Path,$false)
    if (Test-Path -LiteralPath $Owner.Path) { throw 'OWNED_DELETE_FAILED' }
}

Export-ModuleMember -Function New-OwnedRun,Assert-OwnedRun,New-OwnedProfile,Copy-VerifiedTree,Remove-VerifiedOwnedRun
