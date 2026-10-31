$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path $desktop '.persistence-runtime'
$owner = $null
$baseVerified = $false
$allClean = $true
$failure = 'PREPARE_FAILED'
$report = [ordered]@{schemaVersion=5; scope='HOSTED_PERSISTENCE_AND_VAULT_NEGATIVES'; modes=[ordered]@{}; ready=[ordered]@{}; store=[ordered]@{}; maintenance=[ordered]@{}; restore=[ordered]@{}; vault=[ordered]@{}; context=[ordered]@{}; runtimeCopyVerified=$false; directoryCleanup=$false; failure=$null}
function Retired($Probe) {
    return ($Probe.CleanupComplete -and -not $Probe.StdoutTruncated -and -not $Probe.StderrTruncated -and $Probe.Status -in @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))
}
function Process-Evidence($Probe) {
    return [ordered]@{status=$Probe.Status;exitCode=$Probe.ExitCode;cleanupComplete=$Probe.CleanupComplete;stdoutTruncated=$Probe.StdoutTruncated;stderrTruncated=$Probe.StderrTruncated}
}
function Write-Private([string]$Path,$Value) {
    Assert-PlainDirectory ([IO.Path]::GetDirectoryName($Path))
    $raw=$Value|ConvertTo-Json -Depth 16 -Compress
    $bytes=[Text.Encoding]::UTF8.GetBytes($raw)
    if($bytes.Length -gt 65536){throw 'PRIVATE_OUTPUT_LIMIT'}
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Require-Success($Probe,[string]$Marker) {
    if(-not (Retired $Probe) -or $Probe.Status -ne 'SUCCESS' -or $Probe.ExitCode -ne 0 -or -not (Test-ExactlyOneLine $Probe.Stdout $Marker)){throw 'CONTROL_FAILED'}
}
function Show-MaintenanceDiagnostics($Probe) {
    $stages=@('ENTRY','OWNERSHIP','PROFILE','READY','LEASE','KEYS','OPEN','INITIALIZE','CANCEL_FOLDER','CANCEL_ACCEPT','CANCEL_RESTORE','LIST','SELECT_FOLDER','REOPEN','MANUAL_BACKUPS','RETENTION','ACCEPT','POST_ACCEPT_BACKUP','RESTORE','RESTORE_SERVICE','RESTORE_COPY','RESTORE_METADATA','RESTORE_VALIDATE','CLOSE','RESULT','UNCLASSIFIED')
    $codes=@('DATABASE_LOCATION_REJECTED','DATABASE_INVALID','DATABASE_SCHEMA_MISMATCH','DATABASE_FILE_REJECTED','DATABASE_MISSING','IO_FAILED','AUTHENTICATION_FAILED','KEY_UNAVAILABLE','ENOENT','EACCES','EPERM','ENAMETOOLONG','ERR_SQLITE_ERROR','SQLITE_READONLY','SQLITE_CANTOPEN','SQLITE_FULL','SQLITE_BUSY','RESTORE_ADMISSION_REJECTED','RESTORE_BACKUP_UNKNOWN','RESTORE_KEY_CHECKPOINT_REJECTED','RESTORE_QUARANTINE_REQUIRED','BACKUP_ID_REJECTED','BACKUP_IDENTITY_MISMATCH','BACKUP_RECEIPT_MISMATCH','BACKUP_RECEIPT_REJECTED','BACKUP_RECEIPT_LIMIT','BACKUP_BUSY_OR_LOCATION','BACKUP_OWNER_REJECTED','BACKUP_PREREQUISITE_REJECTED','BACKUP_SELECTION_REJECTED','BACKUP_LOCATION_REPLACED','BACKUP_LOCATION_REQUIRED','BACKUP_CATALOG_LIMIT','BACKUP_CATALOG_REJECTED','PERSISTENCE_FILES_REJECTED','OWNERSHIP','FILE','LIMIT','RESTORE_TREE','BACKUP','DIALOG','DISPLAY','CONFIRM','DIALOG_COUNT','OVERRIDE','CONTROL','ENTRY','DATA_OWNER','LEASE','PROFILE','CHECKPOINT','PARENT_NOT_EMPTY','CANCEL','CANCEL_ORPHAN','PROTECTED','LIST','SELECT','LOCATION','PERSIST','RETENTION','ACCEPT','RECEIPT','RESTORE','UNCLASSIFIED')
    $count=0
    foreach($line in ($Probe.Stderr -split '\r?\n')) {
        if($line -cmatch '\APERSISTENCE_MAINTENANCE_STAGE_([A-Z_]+)_CODE_([A-Z_]+)\z' -and $Matches[1] -cin $stages -and $Matches[2] -cin $codes) {
            Write-Output ('PERSISTENCE_MAINTENANCE_STAGE_'+$Matches[1]+'_CODE_'+$Matches[2])
            $count++;if($count -ge 8){break}
        }
    }
    if($Probe.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','CLEANUP_FAILED','LAUNCH_FAILED','ACCESS_DENIED')) { Write-Output ('PERSISTENCE_MAINTENANCE_PROCESS_'+$Probe.Status) }
}
function Show-MaintenanceValidationDiagnostics($Probe) {
    foreach($stage in @('INITIALIZE','ROOT_OWNER','RESULT_READ','CAPTURE_READ','RESULT_SCHEMA','CAPTURE_SCHEMA','PROCESS','STDOUT','OUTPUT_WRITE','UNKNOWN')) {
        if(@($Probe.Stdout -split '\r?\n' | Where-Object {$_ -ceq ('PERSISTENCE_MAINTENANCE_VALIDATION_STAGE_'+$stage)}).Count -gt 0) { Write-Output ('PERSISTENCE_MAINTENANCE_VALIDATION_STAGE_'+$stage) }
    }
}
function Read-FixedPublic([string]$Name) {
    Assert-OwnedRun $owner
    if([IO.Path]::GetFileName($Name) -cne $Name){throw 'PUBLIC_NAME_REJECTED'}
    $path=Join-Path $owner.Path $Name;$item=Get-Item -LiteralPath $path -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 65536){throw 'PUBLIC_STAGE_REJECTED'}
    return ([IO.File]::ReadAllText($path)|ConvertFrom-Json)
}
function New-MatrixProfile([string]$Name) {
    Assert-OwnedRun $owner
    if($Name -cnotmatch '^fonesi-auto-foundation-(source|package)-(maintenance|restore|vault-(create|replace|denied|missing|corrupt|delete|deleted)|store-(before|after)-commit-(crash|reopen))\z'){throw 'PROFILE_NAME_REJECTED'}
    $path=Join-Path $owner.Path $Name
    if(Test-Path -LiteralPath $path){throw 'PROFILE_EXISTS'}
    [void][IO.Directory]::CreateDirectory($path)
    $stream=[IO.File]::Open((Join-Path $path '.owner'),[IO.FileMode]::CreateNew)
    try{$b=[Text.Encoding]::UTF8.GetBytes("FONESI_AUTO_FOUNDATION_PROFILE_V1`n");$stream.Write($b,0,$b.Length)}finally{$stream.Dispose()}
}
function Remove-MatrixProfile([string]$Name) {
    if(-not $allClean){throw 'JOB_RETIREMENT_UNCONFIRMED'}
    Assert-OwnedRun $owner
    if($Name -cnotmatch '^fonesi-auto-foundation-(source|package)-(maintenance|restore|vault-(create|replace|denied|missing|corrupt|delete|deleted)|store-(before|after)-commit-(crash|reopen))\z'){throw 'PROFILE_NAME_REJECTED'}
    $path=Join-Path $owner.Path $Name;Assert-PlainDirectory $path
    $marker=Get-Item -LiteralPath (Join-Path $path '.owner') -Force
    $expected="FONESI_AUTO_FOUNDATION_PROFILE_V1`n"
    if($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $marker.Length -ne [Text.Encoding]::UTF8.GetByteCount($expected) -or [IO.File]::ReadAllText($marker.FullName) -cne $expected){throw 'PROFILE_OWNER_REJECTED'}
    $inventory=Get-BoundedOwnedEntries $path (8L*1024*1024)
    foreach($entry in $inventory.Entries){if(-not $entry.PSIsContainer){[IO.File]::Delete($entry.FullName)}}
    foreach($entry in @($inventory.Entries|Where-Object {$_.PSIsContainer}|Sort-Object {$_.FullName.Length} -Descending)){[IO.Directory]::Delete($entry.FullName,$false)}
    [IO.Directory]::Delete($path,$false)
}
function Remove-TestTree([string]$Name,[long]$Limit) {
    if(-not $allClean){throw 'JOB_RETIREMENT_UNCONFIRMED'}
    Assert-OwnedRun $owner
    if($Name -cnotin @('package','data-source','data-package','backup-parent-source','backup-parent-package','logs-source-ready','logs-package-ready','maintenance-backup-parent-source','maintenance-backup-parent-package','maintenance-restore-parent-source','maintenance-restore-parent-package','logs-source-vault-create','logs-source-vault-replace','logs-source-vault-delete','logs-source-vault-deleted','logs-source-vault-denied','logs-package-vault-create','logs-package-vault-replace','logs-package-vault-delete','logs-package-vault-deleted','logs-package-vault-denied','logs-source-vault-missing','logs-source-vault-corrupt','logs-package-vault-missing','logs-package-vault-corrupt')){throw 'PART_NAME_REJECTED'}
    $path=Join-Path $owner.Path $Name
    if ($Name.StartsWith('logs-')) {
        $marker=Get-Item -LiteralPath (Join-Path $path 'owner.json') -Force
        if ($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $marker.Length -gt 128 -or [IO.File]::ReadAllText($marker.FullName) -cnotmatch '^\{"schemaVersion":1,"storeId":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\}\n\z') { throw 'LOG_MARKER_REJECTED' }
    }
    $inventory=Get-BoundedOwnedEntries $path $Limit
    # All current fixture trees are supervisor-created. Lease remains retained until
    # every native owner retired; deletion is test disposal, never production recovery.
    foreach($entry in $inventory.Entries){if(-not $entry.PSIsContainer){[IO.File]::Delete($entry.FullName)}}
    foreach($entry in @($inventory.Entries|Where-Object {$_.PSIsContainer}|Sort-Object {$_.FullName.Length} -Descending)){[IO.Directory]::Delete($entry.FullName,$false)}
    [IO.Directory]::Delete($path,$false)
}
function Invoke-VaultContext([string]$Mode) {
    if($Mode -cnotin @('source','package')){throw 'MODE'}
    $exe=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    $item=Get-Item -LiteralPath $exe -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'POWERSHELL'}
    $original=[Environment]::GetEnvironmentVariables('Process')
    foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')){throw 'OVERRIDE'}}
    $allowed=@('SystemRoot','WINDIR','SystemDrive','PATH','PATHEXT','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')
    try{
        foreach($key in @($original.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
        foreach($key in $original.Keys){if($allowed -contains [string]$key){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
        return [Fonesi.Phase00.NativeProbe]::Run($exe,[string[]]@('-NoProfile','-NonInteractive','-File',(Join-Path $PSScriptRoot 'Test-VaultContext.ps1'),'-Root',$owner.Path,'-Mode',$Mode),120000,10000,32768)
    }finally{
        foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
        foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}
    }
}
try {
    if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'WINDOWS_REQUIRED'}
    Assert-PlainDirectory $desktop
    if(-not (Test-Path -LiteralPath $base)){[void][IO.Directory]::CreateDirectory($base)}
    Assert-PlainDirectory $base;$baseVerified=$true
    if(Test-Path -LiteralPath (Join-Path $base 'unvalidated.json')){throw 'PRIOR_REPORT_REJECTED'}
    $owner=New-OwnedRun $base
    $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
    if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'){throw 'HELPER_CHANGED'}
    if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER_REJECTED'}
    Add-Type -Path $helper
    $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe'
    if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_HASH_REJECTED'}
    $python=$env:FOUNDATION_PYTHON_EXE
    $pythonItem=Get-Item -LiteralPath $python -Force
    if($pythonItem.PSIsContainer -or ($pythonItem.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'PYTHON_REJECTED'}
    # Private manifest must be created by this workflow's official installer path;
    # an arbitrary preexisting electron/dist is never accepted as provenance.
    if($env:GITHUB_SHA -cnotmatch '^[0-9a-f]{40}$'){throw 'SOURCE_HEAD_REJECTED'}
    $allClean=$false
    $verifiedRuntime=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'verify-runtime',$desktop,$env:GITHUB_SHA)) 120000 @{}
    $allClean=Retired $verifiedRuntime;Require-Success $verifiedRuntime 'PERSISTENCE_RUNTIME_VERIFIED'
    $manifestPath=Join-Path $desktop '.runtime/persistence-runtime-manifest.json'
    $manifestItem=Get-Item -LiteralPath $manifestPath -Force
    if($manifestItem.PSIsContainer -or ($manifestItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $manifestItem.Length -gt 65536){throw 'RUNTIME_MANIFEST_REJECTED'}
    $manifest=[IO.File]::ReadAllText($manifestPath)|ConvertFrom-Json
    $dist=Join-Path $desktop 'node_modules/electron/dist'
    $sourceExe=Join-Path $dist 'electron.exe'
    if($manifest.version -ne 1 -or $manifest.head -cne $env:GITHUB_SHA -or $manifest.electron -cne '45.1.0' -or $manifest.exeSha256 -cnotmatch '^[0-9a-f]{64}$' -or (Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_MANIFEST_REJECTED'}
    $failure='PACKAGE_FAILED'
    $package=Join-Path $owner.Path 'package'
    [void](Copy-VerifiedTree $dist $package (512L*1024*1024))
    $packageExe=Join-Path $package 'AutoPersistence.exe'
    [IO.File]::Move((Join-Path $package 'electron.exe'),$packageExe)
    $appRoot=Join-Path $package 'resources/app'
    [void][IO.Directory]::CreateDirectory($appRoot)
    [void](Copy-VerifiedTree (Join-Path $desktop 'build') (Join-Path $appRoot 'build') (8L*1024*1024))
    $verification=Join-Path $appRoot 'verification';[void][IO.Directory]::CreateDirectory($verification)
    $probe=Join-Path $PSScriptRoot 'persistence-probe.cjs'
    $probeCopy=Join-Path $verification 'persistence-probe.cjs'
    [IO.File]::Copy($probe,$probeCopy,$false)
    if((Get-FileHash $probe -Algorithm SHA256).Hash -cne (Get-FileHash $probeCopy -Algorithm SHA256).Hash){throw 'PROBE_COPY_FAILED'}
    [IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),'{"name":"auto-persistence-library-verification","version":"0.0.0","main":"verification/persistence-probe.cjs"}')
    $mainProbe=Join-Path $PSScriptRoot 'persistence-main-probe.cjs'
    $mainProbeCopy=Join-Path $verification 'persistence-main-probe.cjs'
    [IO.File]::Copy($mainProbe,$mainProbeCopy,$false)
    if((Get-FileHash $mainProbe -Algorithm SHA256).Hash -cne (Get-FileHash $mainProbeCopy -Algorithm SHA256).Hash){throw 'PROBE_COPY_FAILED'}
    foreach($name in @('persistence-store-probe.cjs','persistence-store-contract.cjs','persistence-maintenance-probe.cjs','persistence-maintenance-contract.cjs','persistence-restore-probe.cjs','persistence-restore-contract.cjs','vault-probe.cjs','vault-contract.cjs','vault-owned.cjs','vault-denial.cjs','vault-record-negative.cjs')) {
        $from=Join-Path $PSScriptRoot $name;$to=Join-Path $verification $name
        [IO.File]::Copy($from,$to,$false)
        if((Get-FileHash $from -Algorithm SHA256).Hash -cne (Get-FileHash $to -Algorithm SHA256).Hash){throw 'PROBE_COPY_FAILED'}
    }
    Write-Private (Join-Path $owner.Path 'persistence-runtime-attestation.json') $manifest
    $report.runtimeCopyVerified=$true
    foreach($mode in @('source','package')){
        $failure='CONTROL_FAILED';$allClean=$false
        $setup=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'setup',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $setup;Require-Success $setup 'PERSISTENCE_CONTROL_SETUP'
        foreach($stage in @('provision','orderly-auth','abrupt-auth','final-auth')){
            $failure='PREFLIGHT_FAILED';$allClean=$false
            $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'prepare',$owner.Path,$mode,$stage)) 120000 @{}
            $allClean=Retired $prepared;Require-Success $prepared 'PERSISTENCE_CONTROL_PREPARED'
            $profile=Join-Path $owner.Path ('fonesi-auto-foundation-'+$mode+'-'+$stage)
            [void][IO.Directory]::CreateDirectory($profile)
            $marker=[IO.File]::Open((Join-Path $profile '.owner'),[IO.FileMode]::CreateNew)
            try{$b=[Text.Encoding]::UTF8.GetBytes("FONESI_AUTO_FOUNDATION_PROFILE_V1`n");$marker.Write($b,0,$b.Length)}finally{$marker.Dispose()}
            $exe=$sourceExe;[string[]]$arguments=@($probe)
            if($mode -eq 'package'){$exe=$packageExe;$arguments=@()}
            if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
            $failure='NATIVE_STAGE_FAILED';$allClean=$false
            $native=Invoke-OwnedChild $exe $arguments 120000 @{FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;FONESI_PERSISTENCE_CONTROL_NAME=('persistence-control-'+$mode+'-'+$stage+'.json')}
            $allClean=Retired $native
            Write-Private (Join-Path $owner.Path ('persistence-capture-'+$mode+'-'+$stage+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
            if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
            $failure='STAGE_VALIDATION_FAILED';$allClean=$false
            $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_persistence.py'),'stage',$owner.Path,$mode,$stage)) 120000 @{}
            $allClean=Retired $validated;Require-Success $validated 'PERSISTENCE_VALIDATION_PASS'
            # Keep persistent data/key profile; retire only this disposable UI/crash profile.
            Assert-OwnedRun $owner
            if ([IO.Path]::GetFileName($profile) -cne ('fonesi-auto-foundation-'+$mode+'-'+$stage) -or [IO.Path]::GetDirectoryName($profile) -cne $owner.Path) { throw 'PROFILE_NAME_REJECTED' }
            Assert-PlainDirectory $profile
            $profileMarker=Get-Item -LiteralPath (Join-Path $profile '.owner') -Force
            $expectedMarker="FONESI_AUTO_FOUNDATION_PROFILE_V1`n"
            if ($profileMarker.PSIsContainer -or ($profileMarker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $profileMarker.Length -ne [Text.Encoding]::UTF8.GetByteCount($expectedMarker) -or [IO.File]::ReadAllText($profileMarker.FullName) -cne $expectedMarker) { throw 'PROFILE_OWNER_REJECTED' }
            $inventory=Get-BoundedOwnedEntries $profile (8L*1024*1024)
            foreach($entry in $inventory.Entries){if(-not $entry.PSIsContainer){[IO.File]::Delete($entry.FullName)}}
            foreach($entry in @($inventory.Entries|Where-Object {$_.PSIsContainer}|Sort-Object {$_.FullName.Length} -Descending)){[IO.Directory]::Delete($entry.FullName,$false)}
            [IO.Directory]::Delete($profile,$false)
        }
        $failure='SEQUENCE_VALIDATION_FAILED';$allClean=$false
        $final=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_persistence.py'),'finalize',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $final;Require-Success $final 'PERSISTENCE_VALIDATION_PASS'
        $publicPath=Join-Path $owner.Path ('persistence-public-'+$mode+'.json')
        $publicItem=Get-Item -LiteralPath $publicPath -Force
        if($publicItem.PSIsContainer -or ($publicItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $publicItem.Length -gt 65536){throw 'PUBLIC_STAGE_REJECTED'}
        $report.modes[$mode]=[IO.File]::ReadAllText($publicPath)|ConvertFrom-Json
        $failure='PREFLIGHT_FAILED';$allClean=$false
        $preparedReady=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'prepare-ready',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $preparedReady;Require-Success $preparedReady 'PERSISTENCE_READY_PREPARED'
        $stage='ready'
        $profile=Join-Path $owner.Path ('fonesi-auto-foundation-'+$mode+'-'+$stage)
        [void][IO.Directory]::CreateDirectory($profile)
        $marker=[IO.File]::Open((Join-Path $profile '.owner'),[IO.FileMode]::CreateNew)
        try{$b=[Text.Encoding]::UTF8.GetBytes("FONESI_AUTO_FOUNDATION_PROFILE_V1`n");$marker.Write($b,0,$b.Length)}finally{$marker.Dispose()}
        $exe=$sourceExe;[string[]]$arguments=@($mainProbe)
        if($mode -eq 'package'){
            $exe=$packageExe;$arguments=@()
            [IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),'{"name":"auto-persistence-main-verification","version":"0.0.0","main":"verification/persistence-main-probe.cjs"}')
        }
        if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
        $failure='NATIVE_STAGE_FAILED';$allClean=$false
        $ready=Invoke-OwnedChild $exe $arguments 120000 @{
            FONESI_BOOTSTRAP_ROOT=$profile;FONESI_BOOTSTRAP_MODE=$mode;
            FONESI_PERSISTENCE_READY_FILE=(Join-Path $owner.Path ('data-'+$mode+'/.ready-launch.json'));
            FONESI_LOG_ROOT=(Join-Path $owner.Path ('logs-'+$mode+'-ready'));FONESI_LOG_PARENT_TOKEN=$owner.Token
        }
        $allClean=Retired $ready
        Write-Private (Join-Path $owner.Path ('persistence-ready-capture-'+$mode+'.json')) ([ordered]@{process=(Process-Evidence $ready);stdout=$ready.Stdout;stderr=$ready.Stderr})
        if(-not $allClean -or $ready.Status -ne 'SUCCESS' -or $ready.ExitCode -ne 0){throw 'READY_PROCESS_FAILED'}
        $failure='STAGE_VALIDATION_FAILED';$allClean=$false
        $inspected=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'inspect-ready',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $inspected;Require-Success $inspected 'PERSISTENCE_READY_DATABASE_VERIFIED'
        $allClean=$false
        $validatedReady=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_persistence.py'),'ready',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $validatedReady;Require-Success $validatedReady 'PERSISTENCE_VALIDATION_PASS'
        $readyPublic=Join-Path $owner.Path ('persistence-ready-public-'+$mode+'.json')
        $readyItem=Get-Item -LiteralPath $readyPublic -Force
        if($readyItem.PSIsContainer -or ($readyItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $readyItem.Length -gt 65536){throw 'PUBLIC_STAGE_REJECTED'}
        $report.ready[$mode]=[IO.File]::ReadAllText($readyPublic)|ConvertFrom-Json

            Assert-OwnedRun $owner
            if ([IO.Path]::GetFileName($profile) -cne ('fonesi-auto-foundation-'+$mode+'-'+$stage) -or [IO.Path]::GetDirectoryName($profile) -cne $owner.Path) { throw 'PROFILE_NAME_REJECTED' }
            Assert-PlainDirectory $profile
            $profileMarker=Get-Item -LiteralPath (Join-Path $profile '.owner') -Force
            $expectedMarker="FONESI_AUTO_FOUNDATION_PROFILE_V1`n"
            if ($profileMarker.PSIsContainer -or ($profileMarker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $profileMarker.Length -ne [Text.Encoding]::UTF8.GetByteCount($expectedMarker) -or [IO.File]::ReadAllText($profileMarker.FullName) -cne $expectedMarker) { throw 'PROFILE_OWNER_REJECTED' }
            $inventory=Get-BoundedOwnedEntries $profile (8L*1024*1024)
            foreach($entry in $inventory.Entries){if(-not $entry.PSIsContainer){[IO.File]::Delete($entry.FullName)}}
            foreach($entry in @($inventory.Entries|Where-Object {$_.PSIsContainer}|Sort-Object {$_.FullName.Length} -Descending)){[IO.Directory]::Delete($entry.FullName,$false)}
            [IO.Directory]::Delete($profile,$false)
        Remove-TestTree ('logs-'+$mode+'-ready') (8L*1024*1024)
        $report.vault[$mode]=[ordered]@{}
        foreach($vaultStage in @('create','replace','denied','missing','corrupt','delete','deleted')) {
            $failure='PREFLIGHT_FAILED';$allClean=$false
            $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'vault-control.cjs'),$owner.Path,$mode,$vaultStage)) 120000 @{}
            $allClean=Retired $prepared;Require-Success $prepared 'VAULT_CONTROL_PREPARED'
            $profileName='fonesi-auto-foundation-'+$mode+'-vault-'+$vaultStage
            New-MatrixProfile $profileName
            $exe=$sourceExe;[string[]]$arguments=@((Join-Path $PSScriptRoot 'vault-probe.cjs'))
            if($mode -eq 'package'){
                $exe=$packageExe;$arguments=@()
                [IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),' {"name":"auto-vault-verification","version":"0.0.0","main":"verification/vault-probe.cjs"}')
            }
            if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
            $heldIndex=$null
            try {
                if($vaultStage -ceq 'denied') {
                    Assert-OwnedRun $owner
                    $index=Join-Path $owner.Path ('data-'+$mode+'/vault/index.json')
                    Assert-PlainDirectory ([IO.Path]::GetDirectoryName($index))
                    $indexItem=Get-Item -LiteralPath $index -Force
                    if($indexItem.PSIsContainer -or ($indexItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $indexItem.Length -gt 65536){throw 'INDEX_REJECTED'}
                    $heldIndex=[IO.File]::Open($index,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
                }
                $failure='NATIVE_STAGE_FAILED';$allClean=$false
                $native=Invoke-OwnedChild $exe $arguments 120000 @{FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;FONESI_PERSISTENCE_CONTROL_NAME=('persistence-vault-control-'+$mode+'-'+$vaultStage+'.json')}
                $allClean=Retired $native
            } finally { if($null -ne $heldIndex){$heldIndex.Dispose()} }
            Write-Private (Join-Path $owner.Path ('persistence-vault-capture-'+$mode+'-'+$vaultStage+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
            if(-not $allClean){throw 'VAULT_RETIREMENT_FAILED'}
            $failure='STAGE_VALIDATION_FAILED';$allClean=$false
            $scan=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'vault-control.cjs'),$owner.Path,$mode,('inspect-'+$vaultStage))) 120000 @{}
            $allClean=Retired $scan;Require-Success $scan 'VAULT_ARTIFACTS_INSPECTED'
            $allClean=$false
            $validation=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_vault.py'),$owner.Path,$mode,$vaultStage)) 120000 @{}
            $allClean=Retired $validation;Require-Success $validation 'VAULT_VALIDATION_PASS'
            $report.vault[$mode][$vaultStage]=Read-FixedPublic ('persistence-vault-public-'+$mode+'-'+$vaultStage+'.json')
            Remove-MatrixProfile $profileName
            Remove-TestTree ('logs-'+$mode+'-vault-'+$vaultStage) (8L*1024*1024)
        }
        $failure='PREFLIGHT_FAILED';$allClean=$false
        $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'vault-control.cjs'),$owner.Path,$mode,'context')) 120000 @{}
        $allClean=Retired $prepared;Require-Success $prepared 'VAULT_CONTEXT_PREPARED'
        $failure='NATIVE_STAGE_FAILED';$allClean=$false
        $contextProbe=Invoke-VaultContext $mode
        $allClean=Retired $contextProbe
        Write-Private (Join-Path $owner.Path ('persistence-vault-context-capture-'+$mode+'.json')) ([ordered]@{process=(Process-Evidence $contextProbe);stdout=$contextProbe.Stdout;stderr=$contextProbe.Stderr})
        if(-not $allClean){throw 'CONTEXT_RETIREMENT_FAILED'}
        $failure='STAGE_VALIDATION_FAILED';$allClean=$false
        $validation=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_vault.py'),$owner.Path,$mode,'context')) 120000 @{}
        $allClean=Retired $validation
        foreach($status in @('PASS','INVALID_INPUT','OWNER_CONTEXT_INVALID','OWNER_PROVIDER_UNAVAILABLE','TOKEN_UNAVAILABLE','IMPERSONATION_UNAVAILABLE','CONTROL_FAILED')){if(Test-ExactlyOneLine $validation.Stdout ('VAULT_CONTEXT_STATUS_'+$status)){Write-Output ('VAULT_CONTEXT_STATUS_'+$status)}}
        if(-not $allClean){throw 'CONTEXT_VALIDATION_RETIREMENT'}
        $report.context[$mode]=Read-FixedPublic ('persistence-vault-context-public-'+$mode+'.json')
        $contextUnavailableCollected=($validation.Status -ceq 'NONZERO_EXIT' -and $validation.ExitCode -eq 1 -and $validation.Stderr -ceq '' -and
            (Test-ExactlyOneLine $validation.Stdout 'VAULT_CONTEXT_COLLECTION_SAFE') -and
            (Test-ExactlyOneLine $validation.Stdout 'VAULT_CONTEXT_STATUS_TOKEN_UNAVAILABLE') -and
            (Test-ExactlyOneLine $validation.Stdout 'VAULT_VALIDATION_FAIL') -and
            $report.context[$mode].passed -eq $false -and $report.context[$mode].status -ceq 'TOKEN_UNAVAILABLE')
        # Retired validator + exact safe pre-impersonation outcome permits collection only.
        # The unchanged public context remains false, so the final aggregate cannot PASS.
        if(-not $contextUnavailableCollected){Require-Success $validation 'VAULT_VALIDATION_PASS'}
        $report.store[$mode]=[ordered]@{}
        foreach($boundary in @('BEFORE_COMMIT','AFTER_COMMIT')) {
            $report.store[$mode][$boundary]=[ordered]@{}
            $suffix=$boundary.ToLowerInvariant()
            foreach($storeStage in @('crash','reopen')) {
                $failure='PREFLIGHT_FAILED';$allClean=$false
                $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-matrix-control.cjs'),'prepare-store',$owner.Path,$mode,$boundary,$storeStage)) 120000 @{}
                $allClean=Retired $prepared;Require-Success $prepared 'PERSISTENCE_MATRIX_PREPARED'
                $profileName='fonesi-auto-foundation-'+$mode+'-store-'+$suffix.Replace('_','-')+'-'+$storeStage
                New-MatrixProfile $profileName
                $exe=$sourceExe;[string[]]$arguments=@((Join-Path $PSScriptRoot 'persistence-store-probe.cjs'))
                if($mode -eq 'package') {
                    $exe=$packageExe;$arguments=@()
                    [IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),'{"name":"auto-persistence-store-verification","version":"0.0.0","main":"verification/persistence-store-probe.cjs"}')
                }
                if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
                $failure='NATIVE_STAGE_FAILED';$allClean=$false
                $native=Invoke-OwnedChild $exe $arguments 120000 @{
                    FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;
                    FONESI_PERSISTENCE_STORE_CONTROL_NAME=('persistence-store-control-'+$mode+'-'+$suffix+'-'+$storeStage+'.json')
                }
                $allClean=Retired $native
                Write-Private (Join-Path $owner.Path ('persistence-store-capture-'+$mode+'-'+$suffix+'-'+$storeStage+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
                if(-not $allClean){throw 'STORE_RETIREMENT_FAILED'}
                $failure='STAGE_VALIDATION_FAILED';$allClean=$false
                $validation=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_persistence_store.py'),$owner.Path,$mode,$boundary,$storeStage)) 120000 @{}
                $allClean=Retired $validation;Require-Success $validation 'PERSISTENCE_STORE_VALIDATION_PASS'
                $report.store[$mode][$boundary][$storeStage]=Read-FixedPublic ('persistence-store-public-'+$mode+'-'+$suffix+'-'+$storeStage+'.json')
                Remove-MatrixProfile $profileName
            }
        }
        $failure='PREFLIGHT_FAILED';$allClean=$false
        $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-matrix-control.cjs'),'prepare-maintenance',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $prepared;Require-Success $prepared 'PERSISTENCE_MATRIX_PREPARED'
        $profileName='fonesi-auto-foundation-'+$mode+'-maintenance'
        New-MatrixProfile $profileName
        $exe=$sourceExe;[string[]]$arguments=@((Join-Path $PSScriptRoot 'persistence-maintenance-probe.cjs'))
        if($mode -eq 'package') {
            $exe=$packageExe;$arguments=@()
            [IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),'{"name":"auto-persistence-maintenance-verification","version":"0.0.0","main":"verification/persistence-maintenance-probe.cjs"}')
        }
        if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
        $failure='NATIVE_STAGE_FAILED';$allClean=$false
        $native=Invoke-OwnedChild $exe $arguments 120000 @{
            FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;
            FONESI_PERSISTENCE_CONTROL_NAME=('persistence-maintenance-control-'+$mode+'.json')
        }
        $allClean=Retired $native
        Show-MaintenanceDiagnostics $native
        Write-Private (Join-Path $owner.Path ('persistence-maintenance-capture-'+$mode+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
        if(-not $allClean){throw 'MAINTENANCE_RETIREMENT_FAILED'}
        $failure='STAGE_VALIDATION_FAILED';$allClean=$false
        $validation=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_persistence_maintenance.py'),$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $validation;Show-MaintenanceValidationDiagnostics $validation;Require-Success $validation 'PERSISTENCE_MAINTENANCE_VALIDATION_PASS'
        $report.maintenance[$mode]=Read-FixedPublic ('persistence-maintenance-public-'+$mode+'.json')
        Remove-MatrixProfile $profileName
        $failure='PREFLIGHT_FAILED';$allClean=$false
        $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-restore-control.cjs'),$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $prepared;Require-Success $prepared 'PERSISTENCE_RESTORE_CONTROL_PREPARED'
        $profileName='fonesi-auto-foundation-'+$mode+'-restore'
        New-MatrixProfile $profileName
        $exe=$sourceExe;[string[]]$arguments=@((Join-Path $PSScriptRoot 'persistence-restore-probe.cjs'))
        if($mode -eq 'package') {
            $exe=$packageExe;$arguments=@()
            [IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),' {"name":"auto-persistence-restore-verification","version":"0.0.0","main":"verification/persistence-restore-probe.cjs"}')
        }
        if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
        $failure='NATIVE_STAGE_FAILED';$allClean=$false
        $native=Invoke-OwnedChild $exe $arguments 120000 @{FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;FONESI_PERSISTENCE_MODE=$mode}
        $allClean=Retired $native
        Write-Private (Join-Path $owner.Path ('persistence-restore-capture-'+$mode+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
        if(-not $allClean){throw 'RESTORE_RETIREMENT_FAILED'}
        $failure='STAGE_VALIDATION_FAILED';$allClean=$false
        $validation=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_persistence_restore.py'),$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $validation;Require-Success $validation 'PERSISTENCE_RESTORE_VALIDATION_PASS'
        $report.restore[$mode]=Read-FixedPublic ('persistence-restore-public-'+$mode+'.json')
        Remove-MatrixProfile $profileName
    }
    $failure='CLEANUP_FAILED'
    foreach($name in @('data-source','data-package','backup-parent-source','backup-parent-package','maintenance-backup-parent-source','maintenance-backup-parent-package','maintenance-restore-parent-source','maintenance-restore-parent-package')){Remove-TestTree $name (128L*1024*1024)}
    Remove-TestTree 'package' (512L*1024*1024)
    Assert-OwnedRun $owner
    $remaining=Get-BoundedOwnedEntries $owner.Path (8L*1024*1024)
    foreach($entry in $remaining.Entries){if($entry.PSIsContainer -or $entry.Name -cnotmatch '^(\.owner|persistence-(state|control|capture|public|witness|source|package|ready|store|maintenance|restore|runtime|vault)-[a-z_-]+\.json|persistence-vault-context-blob-(source|package)\.bin|persistence-vault-original-(source|package)-(missing|corrupt)\.bin)$'){throw 'UNEXPECTED_REMAINDER'}}
    foreach($entry in $remaining.Entries){if($entry.Name -cne '.owner'){[IO.File]::Delete($entry.FullName)}}
    Remove-VerifiedOwnedRun $owner $allClean;$report.directoryCleanup=$true
}catch{$report.failure=$failure}
# Public candidate only. A separate strict sanitizer must approve before upload.
try{
    if(-not $baseVerified){throw 'REPORT_PARENT_UNVERIFIED'}
    Assert-PlainDirectory $base
    Write-Private (Join-Path $base 'unvalidated.json') $report
    Write-Output 'PERSISTENCE_PUBLIC_CANDIDATE_WRITTEN'
}catch{Write-Output 'PERSISTENCE_REPORT_FAILED';exit 1}
