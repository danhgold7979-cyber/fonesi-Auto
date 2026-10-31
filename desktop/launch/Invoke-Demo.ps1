[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Import-Module (Join-Path $desktop 'verification/WindowsBoundary.psm1') -Force
$base=Join-Path $desktop '.demo-runtime'
$owned=$null
$allClean=$true
$failure='DEMO_LAUNCH_PREPARE_FAILED'
function Assert-FullPath([string]$Path) {
    if($Path -cnotmatch '^[A-Za-z]:\\' -and $Path -cnotmatch '^\\\\[^\\]+\\[^\\]+\\'){throw 'FULL_PATH_REQUIRED'}
    if(-not [string]::Equals([IO.Path]::GetFullPath($Path),$Path,[StringComparison]::OrdinalIgnoreCase)){throw 'CANONICAL_PATH_REQUIRED'}
}
function Assert-Directory([string]$Path) {
    Assert-FullPath $Path
    $current=$Path
    while($current){
        $item=Get-Item -LiteralPath $current -Force
        if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'DIRECTORY_REJECTED'}
        $parent=[IO.Directory]::GetParent($current)
        if($null -eq $parent){break};$current=$parent.FullName
    }
}
function Read-Private([string]$Path) {
    Assert-Directory ([IO.Path]::GetDirectoryName($Path))
    $item=Get-Item -LiteralPath $Path -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 65536){throw 'PRIVATE_FILE_REJECTED'}
    $stream=[IO.File]::OpenRead($Path)
    try {
        $bytes=New-Object byte[] 65537;$count=0
        while($count -lt $bytes.Length){$n=$stream.Read($bytes,$count,$bytes.Length-$count);if($n -eq 0){break};$count+=$n}
        if($count -gt 65536){throw 'PRIVATE_FILE_LIMIT'}
        $utf8=New-Object Text.UTF8Encoding($false,$true)
        return $utf8.GetString($bytes,0,$count)
    } finally {$stream.Dispose()}
}
function Write-Private([string]$Path,[string]$Raw) {
    Assert-Directory ([IO.Path]::GetDirectoryName($Path))
    $bytes=[Text.Encoding]::UTF8.GetBytes($Raw);if($bytes.Length -gt 65536){throw 'PRIVATE_FILE_LIMIT'}
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Invoke-Selected([string]$Exe,[string[]]$Arguments,[hashtable]$OwnedEnvironment,[bool]$Interactive=$false) {
    Assert-FullPath $Exe
    $file=Get-Item -LiteralPath $Exe -Force
    if($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.Path]::GetExtension($Exe) -ine '.exe'){throw 'EXECUTABLE_REJECTED'}
    $original=[Environment]::GetEnvironmentVariables('Process')
    foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')){throw 'ENVIRONMENT_OVERRIDE'}}
    foreach($key in $OwnedEnvironment.Keys){if($key -cnotin @('FONESI_BOOTSTRAP_ROOT')){throw 'ENVIRONMENT_KEY_REJECTED'}}
    $allowed=@('SystemRoot','WINDIR','SystemDrive','PATH','PATHEXT','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')
    try {
        foreach($key in @($original.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
        foreach($key in $original.Keys){if($allowed -contains [string]$key){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
        foreach($key in $OwnedEnvironment.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$OwnedEnvironment[$key],'Process')}
        if($Interactive){return [Fonesi.Desktop.Persistence.PersistenceProcess]::RunInteractive($Exe,$Arguments)}
        return [Fonesi.Desktop.Persistence.PersistenceProcess]::RunBounded($Exe,$Arguments,120000)
    } finally {
        foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
        foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}
    }
}
function Retired($Result){return ($Result.CleanupComplete -and -not $Result.StdoutTruncated -and -not $Result.StderrTruncated -and $Result.Status -in @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))}
function Success($Result,[string]$Marker){
    if(-not (Retired $Result) -or $Result.Status -ne 'SUCCESS' -or $Result.ExitCode -ne 0 -or @($Result.Stdout -split '\r?\n'|Where-Object {$_ -ceq $Marker}).Count -ne 1){throw 'STAGE_FAILED'}
}
try {
    if($args.Count -ne 0 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'ARGUMENTS_REJECTED'}
    Assert-Directory $desktop
    $helper=Join-Path $desktop 'native/PersistenceProcess.cs'
    if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine '482874120c798b61a0e6a4ab759568832bae1189a71fa2fc2950b6a508083df1'){throw 'HELPER_CHANGED'}
    if('Fonesi.Desktop.Persistence.PersistenceProcess' -as [type]){throw 'PRELOADED_HELPER_REJECTED'}
    Add-Type -Path $helper
    $nodes=@(Get-Command node.exe -CommandType Application -ErrorAction Stop)
    if($nodes.Count -lt 1){throw 'NODE_MISSING'}
    [string]$node=$nodes[0].Source
    Assert-FullPath $node
    if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_CHANGED'}
    $allClean=$false
    $build=Invoke-Selected $node ([string[]]@((Join-Path $PSScriptRoot 'demo-launch-control.cjs'),'verify')) @{}
    $allClean=Retired $build;Success $build 'DEMO_BUILD_VERIFIED'
    $manifestPath=Join-Path $desktop '.runtime/persistence-runtime-manifest.json'
    $manifestRaw=Read-Private $manifestPath;$manifest=$manifestRaw|ConvertFrom-Json
    if($manifest.head -cnotmatch '^[0-9a-f]{40}$' -or $manifest.electron -cne '45.1.0' -or $manifest.exeSha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'RUNTIME_MANIFEST_REJECTED'}
    $allClean=$false
    $runtime=Invoke-Selected $node ([string[]]@((Join-Path $desktop 'verification/persistence-control.cjs'),'verify-runtime',$desktop,[string]$manifest.head)) @{}
    $allClean=Retired $runtime;Success $runtime 'PERSISTENCE_RUNTIME_VERIFIED'
    if((Read-Private $manifestPath) -cne $manifestRaw){throw 'RUNTIME_MANIFEST_CHANGED'}
    $electron=Join-Path $desktop 'node_modules/electron/dist/electron.exe'
    Assert-FullPath $electron
    if((Get-FileHash -LiteralPath $electron -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
    if(-not (Test-Path -LiteralPath $base)){[Fonesi.Desktop.Persistence.PersistenceProcess]::ReserveDirectory($base)}
    Assert-Directory $base
    $token=[guid]::NewGuid().ToString();$owned=Join-Path $base ('demo-'+$token)
    [Fonesi.Desktop.Persistence.PersistenceProcess]::ReserveDirectory($owned)
    $marker='{"version":1,"kind":"FONESI_DEMO","ownerToken":"'+$token+'"}'
    Write-Private (Join-Path $owned '.demo-owner.json') $marker
    $profile=Join-Path $owned 'profile';[Fonesi.Desktop.Persistence.PersistenceProcess]::ReserveDirectory($profile)
    $failure='DEMO_LAUNCH_APPLICATION_FAILED';$allClean=$false
    $native=Invoke-Selected $electron ([string[]]@((Join-Path $desktop 'demo-build/main.cjs'),'--demo')) @{FONESI_BOOTSTRAP_ROOT=$profile} $true
    $allClean=Retired $native
    $capture=[ordered]@{process=[ordered]@{status=$native.Status;exitCode=$native.ExitCode;cleanupComplete=$native.CleanupComplete;stdoutTruncated=$native.StdoutTruncated;stderrTruncated=$native.StderrTruncated};stdout=$native.Stdout;stderr=$native.Stderr}
    Write-Private (Join-Path $owned 'capture.json') ($capture|ConvertTo-Json -Depth 8 -Compress)
    Success $native 'DEMO_CLOSED'
    $lines=@($native.Stdout -split '\r?\n');if($lines.Count -gt 0 -and $lines[-1] -ceq ''){$lines=$lines[0..($lines.Count-2)]}
    if($lines.Count -eq 3 -and $lines[0] -ceq ''){$lines=$lines[1..2]}
    if($lines.Count -ne 2 -or $lines[0] -cne 'DEMO_READY' -or $lines[1] -cne 'DEMO_CLOSED' -or $native.Stderr.Contains('DEMO_FAILED')){throw 'ORDERLY_QUIT_UNPROVEN'}
    $failure='DEMO_LAUNCH_CLEANUP_FAILED'
    Assert-Directory $owned
    if((Read-Private (Join-Path $owned '.demo-owner.json')) -cne $marker){throw 'OWNER_CHANGED'}
    $names=New-Object 'System.Collections.Generic.List[string]'
    $entries=[IO.Directory]::EnumerateFileSystemEntries($owned).GetEnumerator()
    try{while($entries.MoveNext()){if($names.Count -ge 3){throw 'OWNER_ENTRIES'};$names.Add([string]$entries.Current)}}finally{$entries.Dispose()}
    if($names.Count -ne 3 -or @($names|Where-Object {[IO.Path]::GetFileName($_) -cnotin @('.demo-owner.json','profile','capture.json')}).Count){throw 'OWNER_ENTRIES'}
    $profileEntries=Get-BoundedOwnedEntries $profile (8L*1024*1024)
    $captureItem=Get-Item -LiteralPath (Join-Path $owned 'capture.json') -Force
    if($captureItem.PSIsContainer -or ($captureItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $captureItem.Length -gt 65536){throw 'CAPTURE_CHANGED'}
    if(-not $allClean){throw 'RETIREMENT_UNCONFIRMED'}
    foreach($entry in $profileEntries.Entries){if(-not $entry.PSIsContainer){[IO.File]::Delete($entry.FullName)}}
    foreach($entry in @($profileEntries.Entries|Where-Object {$_.PSIsContainer}|Sort-Object {$_.FullName.Length} -Descending)){[IO.Directory]::Delete($entry.FullName,$false)}
    [IO.Directory]::Delete($profile,$false)
    [IO.File]::Delete($captureItem.FullName);[IO.File]::Delete((Join-Path $owned '.demo-owner.json'));[IO.Directory]::Delete($owned,$false)
    Write-Output 'DEMO_LAUNCH_CLOSED'
}catch{Write-Output $failure;exit 1}
