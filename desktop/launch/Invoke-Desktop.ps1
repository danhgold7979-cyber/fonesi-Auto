[CmdletBinding(DefaultParameterSetName='Existing')]
param(
    [Parameter(Mandatory=$true,ParameterSetName='Create')][string]$CreateUnder,
    [Parameter(Mandatory=$true,ParameterSetName='Existing')][string]$Root,
    [string]$Maintenance = ''
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$allClean=$true
$cancelled=$false
$launch=$null
$failure='PERSISTENCE_DESKTOP_PREPARE_FAILED'
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
function New-Reserved([string]$Parent,[string]$Name,[string]$Marker) {
    Assert-Directory $Parent
    $path=Join-Path $Parent $Name
    [Fonesi.Desktop.Persistence.PersistenceProcess]::ReserveDirectory($path)
    Assert-Directory $path
    Write-Private (Join-Path $path '.owner') $Marker
    return $path
}
function Invoke-Selected([string]$Exe,[string[]]$Arguments,[hashtable]$OwnedEnvironment,[bool]$Interactive=$false) {
    Assert-FullPath $Exe
    $file=Get-Item -LiteralPath $Exe -Force
    if($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.Path]::GetExtension($Exe) -ine '.exe'){throw 'EXECUTABLE_REJECTED'}
    $original=[Environment]::GetEnvironmentVariables('Process')
    foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')){throw 'ENVIRONMENT_OVERRIDE'}}
    foreach($key in $OwnedEnvironment.Keys){if($key -cnotin @('FONESI_PERSISTENCE_LAUNCH_CONTROL','FONESI_PERSISTENCE_READY_FILE','FONESI_BOOTSTRAP_ROOT','FONESI_BOOTSTRAP_MODE','FONESI_LOG_ROOT','FONESI_LOG_PARENT_TOKEN')){throw 'ENVIRONMENT_KEY_REJECTED'}}
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
function Save-Capture([string]$Stage,$Result){
    $capture=[ordered]@{process=[ordered]@{status=$Result.Status;exitCode=$Result.ExitCode;cleanupComplete=$Result.CleanupComplete;stdoutTruncated=$Result.StdoutTruncated;stderrTruncated=$Result.StderrTruncated};stdout=$Result.Stdout;stderr=$Result.Stderr}
    Write-Private (Join-Path $launch ($Stage+'-capture.json')) ($capture|ConvertTo-Json -Depth 8 -Compress)
}
function Control([string]$Action){
    $script:allClean=$false
    $result=Invoke-Selected $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-launch-control.cjs'),$Action,$Root,$launch)) @{}
    $script:allClean=Retired $result
    Success $result 'PERSISTENCE_LAUNCH_CONTROL_PASS'
    return $result
}
try {
    if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'WINDOWS_REQUIRED'}
    if($Maintenance -cnotin @('','--maintenance=backup-now','--maintenance=list-backups','--maintenance=restore-to-new','--maintenance=accept-upgrade','--maintenance=select-backup-folder')){throw 'MAINTENANCE_REJECTED'}
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
    $manifestPath=Join-Path $desktop '.runtime/persistence-runtime-manifest.json'
    $manifestRaw=Read-Private $manifestPath
    $manifest=$manifestRaw|ConvertFrom-Json
    if($manifest.head -cnotmatch '^[0-9a-f]{40}$' -or $manifest.electron -cne '45.1.0' -or $manifest.exeSha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'RUNTIME_MANIFEST_REJECTED'}
    $allClean=$false
    $runtime=Invoke-Selected $node ([string[]]@((Join-Path $desktop 'verification/persistence-control.cjs'),'verify-runtime',$desktop,[string]$manifest.head)) @{}
    $allClean=Retired $runtime;Success $runtime 'PERSISTENCE_RUNTIME_VERIFIED'
    if((Read-Private $manifestPath) -cne $manifestRaw){throw 'RUNTIME_MANIFEST_CHANGED'}
    $electron=Join-Path $desktop 'node_modules/electron/dist/electron.exe'
    Assert-FullPath $electron
    if((Get-FileHash -LiteralPath $electron -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
    if($PSCmdlet.ParameterSetName -eq 'Create'){
        Assert-Directory $CreateUnder
        $Root=New-Reserved $CreateUnder ('Fonesi-Auto-'+[guid]::NewGuid().ToString()) ([guid]::NewGuid().ToString())
    }else{Assert-Directory $Root}
    $parentToken=Read-Private (Join-Path $Root '.owner')
    if($parentToken -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'){throw 'ROOT_OWNER_REJECTED'}
    $launch=New-Reserved $Root ('launch-'+[guid]::NewGuid().ToString()) ([guid]::NewGuid().ToString())
    Write-Private (Join-Path $launch 'runtime-attestation.json') $manifestRaw
    $failure='PERSISTENCE_DESKTOP_SETUP_FAILED'
    $null=Control 'setup'
    $state=(Read-Private (Join-Path $launch 'state.json'))|ConvertFrom-Json
    if($state.version -ne 1 -or $state.root -cne $Root -or $state.parentToken -cne $parentToken -or $state.needsProvision -isnot [bool] -or $state.runtimeExeSha256 -cne $manifest.exeSha256){throw 'STATE_REJECTED'}
    foreach($stage in @('provision','auth')){
        if($stage -eq 'provision' -and -not $state.needsProvision){continue}
        $failure='PERSISTENCE_DESKTOP_INITIALIZATION_FAILED'
        $profile=New-Reserved $launch ('fonesi-auto-foundation-'+([IO.Path]::GetFileName($launch).Substring(7))+'-'+$stage) "FONESI_AUTO_FOUNDATION_PROFILE_V1`n"
        $null=Control ('prepare-'+$stage)
        $allClean=$false
        $native=Invoke-Selected $electron ([string[]]@((Join-Path $PSScriptRoot 'persistence-initialize.cjs'))) @{FONESI_PERSISTENCE_LAUNCH_CONTROL=(Join-Path $launch ($stage+'-control.json'));FONESI_BOOTSTRAP_ROOT=$profile}
        $allClean=Retired $native;Save-Capture $stage $native
        if(-not $allClean -or $native.Status -ne 'SUCCESS' -or $native.ExitCode -ne 0){throw 'INITIALIZATION_FAILED'}
        $observed=Control ('observe-'+$stage)
        if(@($observed.Stdout -split '\r?\n'|Where-Object {$_ -ceq 'PERSISTENCE_LAUNCH_CANCELLED'}).Count -gt 0){$cancelled=$true;break}
    }
    if(-not $cancelled){
        $null=Control 'prepare-ready'
        $profile=New-Reserved $launch ('fonesi-auto-foundation-'+[guid]::NewGuid().ToString()+'-main') "FONESI_AUTO_FOUNDATION_PROFILE_V1`n"
        [string[]]$arguments=@((Join-Path $desktop 'build/main.cjs'));if($Maintenance){$arguments+=,$Maintenance}
        $failure='PERSISTENCE_DESKTOP_APPLICATION_FAILED';$allClean=$false
        $application=Invoke-Selected $electron $arguments @{FONESI_PERSISTENCE_READY_FILE=(Join-Path $Root 'data-main/.ready-launch.json');FONESI_BOOTSTRAP_ROOT=$profile;FONESI_BOOTSTRAP_MODE='source';FONESI_LOG_ROOT=(Join-Path $Root 'logs-main');FONESI_LOG_PARENT_TOKEN=$parentToken} ($Maintenance -eq '')
        $allClean=Retired $application;Save-Capture 'main' $application
        if(-not $allClean -or $application.Status -ne 'SUCCESS' -or $application.ExitCode -ne 0){throw 'APPLICATION_FAILED'}
    }
    if(-not $allClean){throw 'RETIREMENT_UNCONFIRMED'}
    $failure='PERSISTENCE_DESKTOP_RELEASE_FAILED'
    $null=Control 'release'
    Write-Output $(if($cancelled){'PERSISTENCE_DESKTOP_CANCELLED'}else{'PERSISTENCE_DESKTOP_CLOSED'})
}catch{
    # Preserve all persistent data and private launch evidence. An unknown process
    # or pending filesystem outcome is never converted to a successful release.
    # Even a retired nonzero native result preserves the lease for explicit recovery.
    Write-Output $failure
    exit 1
}
