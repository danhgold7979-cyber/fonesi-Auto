# Shared fixed SOURCE/PACKAGE lifecycle. No renderer or arbitrary executable entry.
function Invoke-PersistenceLauncher {
param([ValidateSet('SOURCE','PACKAGE')][string]$EntryMode,[ValidateSet('Create','Existing','Store')][string]$Selection,[string]$CreateUnder,[string]$Root,[string]$Store,[string]$Maintenance,[string]$RecoverRetainedLaunch)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launchTools=$PSScriptRoot
$packageRoot=[IO.Path]::GetFullPath((Join-Path $desktop '..'))
$context=[pscustomobject]@{AllClean=$true;Sequence=0};$cancelled=$false;$launch=$null;$guard=$null
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
function Journal([string[]]$Arguments) {
    $context.AllClean=$false
    $result=Invoke-Selected $node ([string[]](@((Join-Path $launchTools 'launch-journal.cjs'))+$Arguments)) @{}
    $context.AllClean=Retired $result
    Success $result 'LAUNCH_JOURNAL_PASS'
}
function Save-Capture([int]$Sequence,[string]$Stage,$Result){
    $capture=[ordered]@{process=[ordered]@{status=$Result.Status;exitCode=$Result.ExitCode;cleanupComplete=$Result.CleanupComplete;stdoutTruncated=$Result.StdoutTruncated;stderrTruncated=$Result.StderrTruncated};stdout=$Result.Stdout;stderr=$Result.Stderr}
    $raw=$capture|ConvertTo-Json -Depth 8 -Compress
    Write-Private (Join-Path $launch ('capture-'+$Sequence.ToString('00')+'.json')) $raw
    if($Stage -cin @('PROVISION','AUTH','MAIN')){Write-Private (Join-Path $launch ($Stage.ToLowerInvariant()+'-capture.json')) $raw}
}
function Invoke-Journaled([string]$Stage,[string]$Exe,[string[]]$Arguments,[hashtable]$Environment,[bool]$Interactive=$false) {
    $context.Sequence++;if($context.Sequence -gt 16){throw 'JOURNAL_LIMIT'}
    if($Stage -ceq 'RECOVERY'){Journal ([string[]]@('recovery-intent',$Root,$launch,[string]$context.Sequence))}
    else{Journal ([string[]]@('intent',$Root,$launch,[string]$context.Sequence,$Stage))}
    $context.AllClean=$false
    $result=Invoke-Selected $Exe $Arguments $Environment $Interactive
    $context.AllClean=Retired $result
    Save-Capture $context.Sequence $Stage $result
    if(-not $context.AllClean){throw 'RETIREMENT_UNCONFIRMED'}
    Journal ([string[]]@('settle',$Root,$launch,[string]$context.Sequence))
    return $result
}
function Control([string]$Action,[string]$Stage){
    $result=Invoke-Journaled $Stage $node ([string[]]@((Join-Path $launchTools 'persistence-launch-control.cjs'),$Action,$Root,$launch)) @{}
    Success $result 'PERSISTENCE_LAUNCH_CONTROL_PASS'
    return $result
}
function Outside-Package([string]$Path){
    if($EntryMode -ceq 'PACKAGE'){
        $context.AllClean=$false
        $result=Invoke-Selected $node ([string[]]@((Join-Path $launchTools 'package-admission.cjs'),'outside',$packageRoot,$Path)) @{}
        $context.AllClean=Retired $result;Success $result 'PACKAGE_DATA_OUTSIDE'
    }
}
try {
    if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'WINDOWS_REQUIRED'}
    if($Maintenance -cnotin @('','--maintenance=backup-now','--maintenance=list-backups','--maintenance=restore-to-new','--maintenance=accept-upgrade','--maintenance=select-backup-folder')){throw 'MAINTENANCE_REJECTED'}
    if($RecoverRetainedLaunch -and ($RecoverRetainedLaunch -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z' -or $Maintenance)){throw 'RECOVERY_ARGUMENT_REJECTED'}
    if($Selection -ceq 'Store' -and -not $Maintenance -and -not $RecoverRetainedLaunch){throw 'RESTORED_MAINTENANCE_REQUIRED'}
    Assert-Directory $desktop
    $helper=Join-Path $desktop 'native/PersistenceProcess.cs'
    if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine '482874120c798b61a0e6a4ab759568832bae1189a71fa2fc2950b6a508083df1'){throw 'HELPER_CHANGED'}
    if('Fonesi.Desktop.Persistence.PersistenceProcess' -as [type]){throw 'PRELOADED_HELPER_REJECTED'}
    Add-Type -Path $helper
    if($EntryMode -ceq 'PACKAGE'){$node=Join-Path $packageRoot 'runtime/node/node.exe'}
    else{$nodes=@(Get-Command node.exe -CommandType Application -ErrorAction Stop);if($nodes.Count -lt 1){throw 'NODE_MISSING'};$node=[string]$nodes[0].Source}
    Assert-FullPath $node
    if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_CHANGED'}
    if($EntryMode -ceq 'PACKAGE'){
        $context.AllClean=$false
        $verified=Invoke-Selected $node ([string[]]@((Join-Path $launchTools 'package-admission.cjs'),'verify',$packageRoot)) @{}
        $context.AllClean=Retired $verified;Success $verified 'PACKAGE_VERIFIED'
        $packageRaw=Read-Private (Join-Path $packageRoot 'package-manifest.json');$packageManifest=$packageRaw|ConvertFrom-Json
        $electron=Join-Path $packageRoot 'runtime/electron/electron.exe';$exeHash=[string]$packageManifest.runtime.electronExeSha256
        $manifestRaw=([ordered]@{version=1;head=$packageManifest.sourceHead;electron='45.1.0';exeSha256=$exeHash}|ConvertTo-Json -Compress)
    }else{
        $manifestPath=Join-Path $desktop '.runtime/persistence-runtime-manifest.json';$manifestRaw=Read-Private $manifestPath;$manifest=$manifestRaw|ConvertFrom-Json
        if($manifest.head -cnotmatch '^[0-9a-f]{40}\z' -or $manifest.electron -cne '45.1.0' -or $manifest.exeSha256 -cnotmatch '^[0-9a-f]{64}\z'){throw 'RUNTIME_MANIFEST_REJECTED'}
        $context.AllClean=$false
        $runtime=Invoke-Selected $node ([string[]]@((Join-Path $desktop 'verification/persistence-control.cjs'),'verify-runtime',$desktop,[string]$manifest.head)) @{}
        $context.AllClean=Retired $runtime;Success $runtime 'PERSISTENCE_RUNTIME_VERIFIED'
        if((Read-Private $manifestPath) -cne $manifestRaw){throw 'RUNTIME_MANIFEST_CHANGED'}
        $electron=Join-Path $desktop 'node_modules/electron/dist/electron.exe';$exeHash=[string]$manifest.exeSha256
    }
    Assert-FullPath $electron
    if($exeHash -cnotmatch '^[0-9a-f]{64}\z' -or (Get-FileHash -LiteralPath $electron -Algorithm SHA256).Hash.ToLowerInvariant() -cne $exeHash){throw 'RUNTIME_CHANGED'}
    if($Selection -ceq 'Create'){
        Assert-Directory $CreateUnder
        $rootName='Fonesi-Auto-'+[guid]::NewGuid().ToString();Outside-Package (Join-Path $CreateUnder $rootName)
        $Root=New-Reserved $CreateUnder $rootName ([guid]::NewGuid().ToString())
    }elseif($Selection -ceq 'Store'){
        Assert-Directory $Store;$Root=[IO.Path]::GetDirectoryName($Store)
        if([IO.Path]::GetFileName($Store) -cnotmatch '^data-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z'){throw 'STORE_NAME'}
    }
    Assert-Directory $Root;Outside-Package $Root
    $parentToken=Read-Private (Join-Path $Root '.owner')
    if($parentToken -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z'){throw 'ROOT_OWNER_REJECTED'}
    $guardPath=Join-Path $Root '.launcher-guard'
    if(Test-Path -LiteralPath $guardPath){
        $item=Get-Item -LiteralPath $guardPath -Force
        if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -ne 0){throw 'GUARD_REJECTED'}
        $guard=[IO.File]::Open($guardPath,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    }else{$guard=[IO.File]::Open($guardPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$guard.Flush($true)}
    if((Read-Private (Join-Path $Root '.owner')) -cne $parentToken){throw 'ROOT_OWNER_CHANGED'}
    $dataRoot=Join-Path $Root 'data-main';if($Selection -ceq 'Store'){$dataRoot=$Store}
    if($RecoverRetainedLaunch){
        $launch=Join-Path $Root ('launch-'+$RecoverRetainedLaunch);Assert-Directory $launch
        $header=(Read-Private (Join-Path $launch 'launch-journal.json'))|ConvertFrom-Json
        if($header.dataRoot -cne $dataRoot -or $header.parentToken -cne $parentToken -or $header.entryMode -cne $EntryMode -or $header.executableSha256 -cne $exeHash){throw 'RECOVERY_SELECTION'}
        $iterator=[IO.Directory]::EnumerateFileSystemEntries($launch).GetEnumerator();$entries=0
        try{while($iterator.MoveNext()){$entries++;if($entries -gt 256){throw 'LAUNCH_COUNT'};if([IO.Path]::GetFileName($iterator.Current) -cmatch '^intent-(0[1-9]|1[0-6])\.json\z'){$context.Sequence++}}}finally{if($iterator -is [IDisposable]){$iterator.Dispose()}}
        $failure='PERSISTENCE_DESKTOP_RECOVERY_FAILED'
        $null=Control 'recover' 'RECOVERY'
        Write-Output 'PERSISTENCE_DESKTOP_RECOVERED'
        return
    }
    $launch=New-Reserved $Root ('launch-'+[guid]::NewGuid().ToString()) ([guid]::NewGuid().ToString())
    Write-Private (Join-Path $launch 'runtime-attestation.json') $manifestRaw
    $method='NORMAL';if($Maintenance){$method=$Maintenance.Substring('--maintenance='.Length)}
    Journal ([string[]]@('plan',$Root,$launch,$dataRoot,$EntryMode,$method,$exeHash))
    $failure='PERSISTENCE_DESKTOP_SETUP_FAILED';$null=Control 'setup' 'SETUP'
    $state=(Read-Private (Join-Path $launch 'state.json'))|ConvertFrom-Json
    if($state.version -ne 2 -or $state.root -cne $Root -or $state.dataRoot -cne $dataRoot -or $state.parentToken -cne $parentToken -or $state.needsProvision -isnot [bool] -or $state.runtimeExeSha256 -cne $exeHash){throw 'STATE_REJECTED'}
    foreach($stage in @('provision','auth')){
        if($stage -ceq 'provision' -and -not $state.needsProvision){continue}
        $failure='PERSISTENCE_DESKTOP_INITIALIZATION_FAILED'
        $profile=New-Reserved $launch ('fonesi-auto-foundation-'+([IO.Path]::GetFileName($launch).Substring(7))+'-'+$stage) "FONESI_AUTO_FOUNDATION_PROFILE_V1`n"
        $null=Control ('prepare-'+$stage) ('PREPARE_'+$stage.ToUpperInvariant())
        $native=Invoke-Journaled ($stage.ToUpperInvariant()) $electron ([string[]]@((Join-Path $launchTools 'persistence-initialize.cjs'))) @{FONESI_PERSISTENCE_LAUNCH_CONTROL=(Join-Path $launch ($stage+'-control.json'));FONESI_BOOTSTRAP_ROOT=$profile}
        if(-not $context.AllClean -or $native.Status -ne 'SUCCESS' -or $native.ExitCode -ne 0){throw 'INITIALIZATION_FAILED'}
        $observed=Control ('observe-'+$stage) ('OBSERVE_'+$stage.ToUpperInvariant())
        if(@($observed.Stdout -split '\r?\n'|Where-Object {$_ -ceq 'PERSISTENCE_LAUNCH_CANCELLED'}).Count -gt 0){$cancelled=$true;break}
    }
    if(-not $cancelled){
        $null=Control 'prepare-ready' 'PREPARE_READY'
        $profile=New-Reserved $launch ('fonesi-auto-foundation-'+([IO.Path]::GetFileName($launch).Substring(7))+'-main') "FONESI_AUTO_FOUNDATION_PROFILE_V1`n"
        [string[]]$arguments=@((Join-Path $desktop 'build/main.cjs'));if($Maintenance){$arguments+=,$Maintenance}
        $failure='PERSISTENCE_DESKTOP_APPLICATION_FAILED'
        $application=Invoke-Journaled 'MAIN' $electron $arguments @{FONESI_PERSISTENCE_READY_FILE=(Join-Path $dataRoot '.ready-launch.json');FONESI_BOOTSTRAP_ROOT=$profile;FONESI_BOOTSTRAP_MODE='source';FONESI_LOG_ROOT=(Join-Path $Root 'logs-main');FONESI_LOG_PARENT_TOKEN=$parentToken} ($Maintenance -eq '')
        if(-not $context.AllClean -or $application.Status -ne 'SUCCESS' -or $application.ExitCode -ne 0){throw 'APPLICATION_FAILED'}
    }
    if(-not $context.AllClean){throw 'RETIREMENT_UNCONFIRMED'}
    $failure='PERSISTENCE_DESKTOP_RELEASE_FAILED';$null=Control 'release' 'RELEASE'
    Write-Output $(if($cancelled){'PERSISTENCE_DESKTOP_CANCELLED'}else{'PERSISTENCE_DESKTOP_CLOSED'})
}catch{
    Write-Output $failure
    exit 1
}finally{
    if($null -ne $guard){$guard.Dispose()}
}
}
