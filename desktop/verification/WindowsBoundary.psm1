Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Assert-PlainDirectory([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'UNSAFE_DIRECTORY' }
}

function Get-BoundedOwnedEntries([string]$Root, [long]$MaxBytes) {
    Assert-PlainDirectory $Root
    $pending = New-Object 'System.Collections.Generic.Queue[object]'
    $entries = New-Object 'System.Collections.Generic.List[object]'
    $pending.Enqueue([pscustomobject]@{ Path=$Root; Depth=0 })
    $bytes = 0L
    while ($pending.Count -gt 0) {
        $current = $pending.Dequeue()
        if ($current.Depth -gt 16) { throw 'OWNED_DEPTH_EXCEEDED' }
        $enumerator = [IO.Directory]::EnumerateFileSystemEntries($current.Path).GetEnumerator()
        try {
            while ($enumerator.MoveNext()) {
                if ($entries.Count -ge 256) { throw 'OWNED_COUNT_EXCEEDED' }
                $entry = Get-Item -LiteralPath $enumerator.Current -Force -ErrorAction Stop
                if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'OWNED_REPARSE_REJECTED' }
                $entries.Add($entry)
                if ($entry.PSIsContainer) {
                    $pending.Enqueue([pscustomobject]@{ Path=$entry.FullName; Depth=$current.Depth+1 })
                } else {
                    $bytes += $entry.Length
                    if ($bytes -gt $MaxBytes) { throw 'OWNED_BYTES_EXCEEDED' }
                }
            }
        } finally { $enumerator.Dispose() }
    }
    return [pscustomobject]@{ Entries=$entries.ToArray(); Bytes=$bytes }
}

function Test-AllowedChildArgument([string]$Argument) {
    if (-not $Argument.StartsWith('-')) { return $true }
    return ($Argument -cin @('--demo','--maintenance=backup-now','--maintenance=list-backups',
        '--maintenance=restore-to-new','--maintenance=accept-upgrade','--maintenance=select-backup-folder'))
}

function Invoke-OwnedChild([string]$Executable, [string[]]$Arguments,
                           [int]$TimeoutMs, [hashtable]$OwnedEnvironment) {
    if ($TimeoutMs -ne 30000 -and $TimeoutMs -ne 120000) { throw 'UNREVIEWED_DEADLINE' }
    if (-not [IO.Path]::IsPathRooted($Executable) -or [IO.Path]::GetExtension($Executable) -ine '.exe') { throw 'EXECUTABLE_REJECTED' }
    $file = Get-Item -LiteralPath $Executable -Force -ErrorAction Stop
    if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'EXECUTABLE_REJECTED' }
    # Caller selects exact trusted executable/hash/argument list before this boundary.
    # No shell interpolation; NativeProbe owns a suspended process and all descendants.
    foreach ($argument in $Arguments) {
        if (-not (Test-AllowedChildArgument $argument)) { throw 'CHROMIUM_NODE_SWITCH_REJECTED' }
    }
    foreach ($key in $OwnedEnvironment.Keys) {
        if ($key -notin @('FONESI_BOOTSTRAP_ROOT','FONESI_BOOTSTRAP_MODE','FONESI_LOG_ROOT','FONESI_LOG_PARENT_TOKEN','FONESI_PERSISTENCE_RUN_ROOT','FONESI_PERSISTENCE_CONTROL_NAME','FONESI_PERSISTENCE_READY_FILE','FONESI_PERSISTENCE_STORE_CONTROL_NAME','FONESI_PERSISTENCE_MODE')) { throw 'ENVIRONMENT_KEY_REJECTED' }
    }
    $original = [Environment]::GetEnvironmentVariables('Process')
    foreach ($key in $original.Keys) {
        if ($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')) { throw 'UNREVIEWED_OVERRIDE' }
    }
    $allowed = @('SystemRoot','WINDIR','SystemDrive','PATH','PATHEXT','COMSPEC',
                 'TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA',
                 'OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')
    try {
        # Process-local inheritance only: never mutate machine/user settings.
        foreach ($key in @($original.Keys)) { [Environment]::SetEnvironmentVariable([string]$key,$null,'Process') }
        foreach ($key in $original.Keys) {
            if ($allowed -contains [string]$key) { [Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process') }
        }
        foreach ($key in $OwnedEnvironment.Keys) { [Environment]::SetEnvironmentVariable([string]$key,[string]$OwnedEnvironment[$key],'Process') }
        return [Fonesi.Phase00.NativeProbe]::Run($Executable,$Arguments,$TimeoutMs,10000,32768)
    } finally {
        $current = [Environment]::GetEnvironmentVariables('Process')
        foreach ($key in @($current.Keys)) { [Environment]::SetEnvironmentVariable([string]$key,$null,'Process') }
        foreach ($key in $original.Keys) { [Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process') }
    }
}

function Test-ExactlyOneLine([string]$Text, [string]$Line) {
    return @($Text -split '\r?\n' | Where-Object {$_ -ceq $Line}).Count -eq 1
}
function Test-AnyLine([string]$Text, [string]$Line) {
    return @($Text -split '\r?\n' | Where-Object {$_ -ceq $Line}).Count -gt 0
}
function Get-FixedCleanupReason([string]$Message, [string]$Kind = '', [int]$NativeCode = 0) {
    if ($Message -cin @('OWNED_DEPTH_EXCEEDED','OWNED_COUNT_EXCEEDED','OWNED_BYTES_EXCEEDED',
        'OWNED_REPARSE_REJECTED','UNSAFE_DIRECTORY','OWNER_PARENT_MISMATCH',
        'OWNER_MARKER_REJECTED','OWNER_TOKEN_MISMATCH','OWNED_DELETE_FAILED','OWNER_PARTS_REMAIN')) { return $Message }
    if ($Kind -eq 'IOException' -and $NativeCode -in @(32,33)) { return 'FILE_IN_USE' }
    if ($Kind -eq 'UnauthorizedAccessException') { return 'ACCESS_DENIED' }
    if ($Kind -in @('FileNotFoundException','DirectoryNotFoundException')) { return 'PATH_MISSING' }
    if ($Kind -eq 'IOException') { return 'IO_FAILURE' }
    return 'UNCLASSIFIED'
}
Export-ModuleMember -Function Test-AllowedChildArgument,Assert-PlainDirectory,Get-BoundedOwnedEntries,Invoke-OwnedChild,Test-ExactlyOneLine,Test-AnyLine,Get-FixedCleanupReason
