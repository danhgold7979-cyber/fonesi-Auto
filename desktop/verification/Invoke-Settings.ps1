$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path $desktop '.settings-runtime'
$owner = $null
$baseVerified = $false
$allClean = $true
$failure = 'PREPARE_FAILED'
$report = [ordered]@{version=3;scope='HOSTED_SETTINGS_SCHEMA3_RECOVERY';excludedVaultContext='P106_UNMET_NOT_RERUN';bootstrap=[ordered]@{};modes=[ordered]@{};recovery=[ordered]@{};screenshots=[ordered]@{};runtimeCopyVerified=$false;directoryCleanup=$false;failure=$null}
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

# This independent settings run never invokes the P1-06 foreign-context helper.
function Read-Public([string]$Name) {
    Assert-OwnedRun $owner
    if([IO.Path]::GetFileName($Name) -cne $Name){throw 'NAME'}
    $item=Get-Item -LiteralPath (Join-Path $owner.Path $Name) -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 65536){throw 'PUBLIC_FILE'}
    return ([IO.File]::ReadAllText($item.FullName)|ConvertFrom-Json)
}
function New-Profile([string]$Name) {
    Assert-OwnedRun $owner
    if($Name -cnotmatch '^fonesi-auto-foundation-(source|package)-(provision|orderly-auth|abrupt-auth|final-auth|settings-(ui|reopen|before-crash|before-reopen|after-crash|after-reopen|recovery-setup|current-cancel|current-confirm|previous-cancel|previous-confirm))\z'){throw 'PROFILE_NAME'}
    $path=Join-Path $owner.Path $Name
    if(Test-Path -LiteralPath $path){throw 'PROFILE_EXISTS'}
    [Fonesi.Phase00.NativeProbe]::ReserveDirectory($path)
    $stream=[IO.File]::Open((Join-Path $path '.owner'),[IO.FileMode]::CreateNew)
    try{$bytes=[Text.Encoding]::UTF8.GetBytes("FONESI_AUTO_FOUNDATION_PROFILE_V1`n");$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
    return $path
}
function Remove-Part([string]$Name,[long]$Limit) {
    if(-not $allClean){throw 'RETIREMENT_UNCONFIRMED'}
    Assert-OwnedRun $owner
    if($Name -cnotmatch '^(package|data-(source|package)|backup-parent-(source|package)|settings-recovery-parent-(source|package)-(current|previous)|logs-(source|package)-settings-(ui|reopen|recovery-setup|current-cancel|current-confirm|previous-cancel|previous-confirm)|fonesi-auto-foundation-(source|package)-(provision|orderly-auth|abrupt-auth|final-auth|settings-(ui|reopen|before-crash|before-reopen|after-crash|after-reopen|recovery-setup|current-cancel|current-confirm|previous-cancel|previous-confirm)))\z'){throw 'PART_NAME'}
    $path=Join-Path $owner.Path $Name;Assert-PlainDirectory $path
    if($Name.StartsWith('fonesi-auto-foundation-')){
        $marker=Get-Item -LiteralPath (Join-Path $path '.owner') -Force
        if($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $marker.Length -ne 34 -or [IO.File]::ReadAllText($marker.FullName) -cne "FONESI_AUTO_FOUNDATION_PROFILE_V1`n"){throw 'PROFILE_OWNER'}
    }
    if($Name.StartsWith('logs-')){
        $marker=Get-Item -LiteralPath (Join-Path $path 'owner.json') -Force
        if($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $marker.Length -gt 128 -or [IO.File]::ReadAllText($marker.FullName) -cnotmatch '^\{"schemaVersion":1,"storeId":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\}\n\z'){throw 'LOG_OWNER'}
    }
    $inventory=Get-BoundedOwnedEntries $path $Limit
    foreach($entry in $inventory.Entries){if(-not $entry.PSIsContainer -and $entry.Name -cne '.owner'){[IO.File]::Delete($entry.FullName)}}
    foreach($entry in $inventory.Entries){if(-not $entry.PSIsContainer -and $entry.Name -ceq '.owner'){[IO.File]::Delete($entry.FullName)}}
    foreach($entry in @($inventory.Entries|Where-Object {$_.PSIsContainer}|Sort-Object {$_.FullName.Length} -Descending)){[IO.Directory]::Delete($entry.FullName,$false)}
    [IO.Directory]::Delete($path,$false)
}
try {
    if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'WINDOWS_REQUIRED'}
    Assert-PlainDirectory $desktop
    $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
    if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'){throw 'HELPER_CHANGED'}
    if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER_REJECTED'}
    Add-Type -Path $helper
    if(-not (Test-Path -LiteralPath $base)){[Fonesi.Phase00.NativeProbe]::ReserveDirectory($base)}
    Assert-PlainDirectory $base;$baseVerified=$true
    if(Test-Path -LiteralPath (Join-Path $base 'unvalidated.json')){throw 'PRIOR_REPORT_REJECTED'}
    $owner=New-OwnedRun $base
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
    $packageExe=Join-Path $package 'AutoSettings.exe'
    [IO.File]::Move((Join-Path $package 'electron.exe'),$packageExe)
    $appRoot=Join-Path $package 'resources/app'
    [Fonesi.Phase00.NativeProbe]::ReserveDirectory($appRoot)
    [void](Copy-VerifiedTree (Join-Path $desktop 'build') (Join-Path $appRoot 'build') (8L*1024*1024))

    $verification=Join-Path $appRoot 'verification';[Fonesi.Phase00.NativeProbe]::ReserveDirectory($verification)
    foreach($name in @('persistence-probe.cjs','persistence-restore-contract.cjs','persistence-store-contract.cjs','settings-native.cjs','settings-contract.cjs','settings-main-probe.cjs','settings-store-probe.cjs','settings-recovery-contract.cjs','settings-recovery-control.cjs','settings-recovery-probe.cjs')){
        $from=Join-Path $PSScriptRoot $name;$to=Join-Path $verification $name
        [IO.File]::Copy($from,$to,$false)
        if((Get-FileHash $from -Algorithm SHA256).Hash -cne (Get-FileHash $to -Algorithm SHA256).Hash){throw 'PROBE_COPY'}
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
            $profileName='fonesi-auto-foundation-'+$mode+'-'+$stage;$profile=New-Profile $profileName
            $exe=$sourceExe;[string[]]$arguments=@((Join-Path $PSScriptRoot 'persistence-probe.cjs'))
            if($mode -eq 'package'){$exe=$packageExe;$arguments=@();[IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),' {"name":"auto-settings-key-verification","version":"0.0.0","main":"verification/persistence-probe.cjs"}')}
            if((Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
            $failure='NATIVE_STAGE_FAILED';$allClean=$false
            $native=Invoke-OwnedChild $exe $arguments 120000 @{FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;FONESI_PERSISTENCE_CONTROL_NAME=('persistence-control-'+$mode+'-'+$stage+'.json')}
            $allClean=Retired $native
            Write-Private (Join-Path $owner.Path ('persistence-capture-'+$mode+'-'+$stage+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
            if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
            $failure='STAGE_VALIDATION_FAILED';$allClean=$false
            $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_persistence.py'),'stage',$owner.Path,$mode,$stage)) 120000 @{}
            $allClean=Retired $validated;Require-Success $validated 'PERSISTENCE_VALIDATION_PASS'
            Remove-Part $profileName (8L*1024*1024)
        }
        $failure='SEQUENCE_VALIDATION_FAILED';$allClean=$false
        $final=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_persistence.py'),'finalize',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $final;Require-Success $final 'PERSISTENCE_VALIDATION_PASS'
        $report.bootstrap[$mode]=Read-Public ('persistence-public-'+$mode+'.json')
        $report.modes[$mode]=[ordered]@{}
        foreach($stage in @('ui','reopen','before-crash','before-reopen','after-crash','after-reopen')){
            $failure='PREFLIGHT_FAILED';$allClean=$false
            $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'settings-control.cjs'),'prepare',$owner.Path,$mode,$stage)) 120000 @{}
            $allClean=Retired $prepared;Require-Success $prepared 'SETTINGS_CONTROL_PREPARED'
            $profileName='fonesi-auto-foundation-'+$mode+'-settings-'+$stage;$profile=New-Profile $profileName
            $entry='settings-store-probe.cjs';if($stage -cin @('ui','reopen')){$entry='settings-main-probe.cjs'}
            $exe=$sourceExe;[string[]]$arguments=@((Join-Path $PSScriptRoot $entry))
            if($mode -eq 'package'){$exe=$packageExe;$arguments=@();[IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),('{"name":"auto-settings-verification","version":"0.0.0","main":"verification/'+$entry+'"}'))}
            if((Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
            $environment=@{FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;FONESI_PERSISTENCE_CONTROL_NAME=('settings-control-'+$mode+'-'+$stage+'.json')}
            if($stage -cin @('ui','reopen')){
                $environment.FONESI_BOOTSTRAP_ROOT=$profile;$environment.FONESI_BOOTSTRAP_MODE=$mode
                $environment.FONESI_PERSISTENCE_READY_FILE=Join-Path $owner.Path ('data-'+$mode+'/.ready-launch.json')
                $environment.FONESI_LOG_ROOT=Join-Path $owner.Path ('logs-'+$mode+'-settings-'+$stage);$environment.FONESI_LOG_PARENT_TOKEN=$owner.Token
            }
            $failure='NATIVE_STAGE_FAILED';$allClean=$false
            $native=Invoke-OwnedChild $exe $arguments 120000 $environment
            foreach($diagnostic in @('SENDER','SUBFRAME','LATE_REPLY','REVOKED_RESET')) {
                $marker='SETTINGS_NEGATIVE_STAGE_'+$diagnostic
                if(@($native.Stderr -split '\r?\n' | Where-Object {$_ -ceq $marker}).Count -gt 0){Write-Output $marker}
            }
            $allClean=Retired $native
            Write-Private (Join-Path $owner.Path ('settings-capture-'+$mode+'-'+$stage+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
            if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
            $failure='STAGE_VALIDATION_FAILED';$allClean=$false
            $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_settings.py'),'stage',$owner.Path,$mode,$stage)) 120000 @{}
            $allClean=Retired $validated;Require-Success $validated 'SETTINGS_VALIDATION_PASS'
            $report.modes[$mode][$stage]=Read-Public ('settings-public-'+$mode+'-'+$stage+'.json')
            Remove-Part $profileName (8L*1024*1024)
            if($stage -cin @('ui','reopen')){Remove-Part ('logs-'+$mode+'-settings-'+$stage) (8L*1024*1024)}
        }
        $report.recovery[$mode]=[ordered]@{}
        foreach($stage in @('recovery-setup','current-cancel','current-confirm','previous-cancel','previous-confirm')){
            $failure='PREFLIGHT_FAILED';$allClean=$false
            $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'settings-recovery-control.cjs'),'prepare',$owner.Path,$mode,$stage)) 120000 @{}
            $allClean=Retired $prepared;Require-Success $prepared 'SETTINGS_RECOVERY_CONTROL_PREPARED'
            $controlName='settings-recovery-control-'+$mode+'-'+$stage+'.json'
            $control=Read-Public $controlName
            if($control.version -ne 1 -or $control.mode -cne $mode -or $control.stage -cne $stage -or $control.runParentToken -cne $owner.Token){throw 'RECOVERY_CONTROL'}
            foreach($identity in @($control.parentToken,$control.ownerToken,$control.storeId)){if($identity -isnot [string] -or $identity -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z'){throw 'RECOVERY_IDENTITY'}}
            $data=[IO.Path]::GetFullPath([string]$control.dataRoot)
            if($data -cne $control.dataRoot){throw 'RECOVERY_PATH'}
            if($stage -cin @('previous-cancel','previous-confirm')){
                $outer=[IO.Path]::GetDirectoryName($data);$container=Join-Path $owner.Path ('settings-recovery-parent-'+$mode+'-current')
                if([IO.Path]::GetDirectoryName($outer) -cne $container -or [IO.Path]::GetFileName($outer) -cnotmatch '^fonesi-restore-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z' -or [IO.Path]::GetFileName($data) -cne ('data-'+$control.storeId)){throw 'RECOVERY_PATH'}
                Assert-PlainDirectory $container;Assert-PlainDirectory $outer
                $marker=Get-Item -LiteralPath (Join-Path $outer '.owner') -Force
                if($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $marker.Length -ne 36 -or [IO.File]::ReadAllText($marker.FullName) -cne $control.parentToken){throw 'RECOVERY_OWNER'}
            }elseif($data -cne (Join-Path $owner.Path ('data-'+$mode)) -or $control.parentToken -cne $owner.Token){throw 'RECOVERY_PATH'}
            Assert-PlainDirectory $data
            $profileName='fonesi-auto-foundation-'+$mode+'-settings-'+$stage;$profile=New-Profile $profileName
            $exe=$sourceExe;[string[]]$arguments=@((Join-Path $PSScriptRoot 'settings-recovery-probe.cjs'))
            if($stage -cne 'recovery-setup'){$arguments+= '--maintenance=restore-to-new'}
            if($mode -eq 'package'){
                $exe=$packageExe;$arguments=@();if($stage -cne 'recovery-setup'){$arguments=@('--maintenance=restore-to-new')}
                [IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),' {"name":"auto-settings-recovery-verification","version":"0.0.0","main":"verification/settings-recovery-probe.cjs"}')
            }
            if((Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
            $environment=@{FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;FONESI_PERSISTENCE_CONTROL_NAME=$controlName;FONESI_BOOTSTRAP_ROOT=$profile;FONESI_BOOTSTRAP_MODE=$mode;FONESI_PERSISTENCE_READY_FILE=(Join-Path $data '.ready-launch.json');FONESI_LOG_ROOT=(Join-Path $owner.Path ('logs-'+$mode+'-settings-'+$stage));FONESI_LOG_PARENT_TOKEN=$owner.Token}
            $failure='NATIVE_STAGE_FAILED';$allClean=$false
            $native=Invoke-OwnedChild $exe $arguments 120000 $environment
            $allClean=Retired $native
            Write-Private (Join-Path $owner.Path ('settings-recovery-capture-'+$mode+'-'+$stage+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
            if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
            $failure='STAGE_VALIDATION_FAILED';$allClean=$false
            $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_settings.py'),'recovery',$owner.Path,$mode,$stage)) 120000 @{}
            $allClean=Retired $validated;Require-Success $validated 'SETTINGS_RECOVERY_VALIDATION_PASS'
            $report.recovery[$mode][$stage]=Read-Public ('settings-recovery-public-'+$mode+'-'+$stage+'.json')
            Remove-Part $profileName (8L*1024*1024)
            if($stage -cne 'recovery-setup'){Remove-Part ('logs-'+$mode+'-settings-'+$stage) (8L*1024*1024)}
        }
        $failure='SCREENSHOT_FAILED';$allClean=$false
        $pictures=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_settings.py'),'screenshots',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $pictures;Require-Success $pictures 'SETTINGS_SCREENSHOTS_VERIFIED'
        $shots=Read-Public ('settings-screenshots-'+$mode+'.json')
        foreach($theme in @('light','dark')){
            $report.screenshots[$mode+'-'+$theme]=$shots.$theme
            Assert-OwnedRun $owner
            $picture=Get-Item -LiteralPath (Join-Path $owner.Path ('settings-'+$mode+'-'+$theme+'.png')) -Force
            if($picture.PSIsContainer -or ($picture.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $picture.Length -ne $shots.$theme.bytes -or (Get-FileHash $picture.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $shots.$theme.sha256){throw 'SCREENSHOT_CHANGED'}
            [IO.File]::Delete($picture.FullName)
        }
    }
    $failure='CLEANUP_FAILED'
    # Fixed independently bounded partitions; no whole-root aggregate cap increase.
    foreach($mode in @('source','package')){
        Remove-Part ('data-'+$mode) (128L*1024*1024)
        Remove-Part ('backup-parent-'+$mode) (128L*1024*1024)
        Remove-Part ('settings-recovery-parent-'+$mode+'-current') (128L*1024*1024)
        Remove-Part ('settings-recovery-parent-'+$mode+'-previous') (128L*1024*1024)
    }
    Remove-Part 'package' (512L*1024*1024)
    # Remaining exact private control/capture files are never artifact upload inputs.
    Assert-OwnedRun $owner
    $left=Get-BoundedOwnedEntries $owner.Path (1024L*1024)
    foreach($entry in $left.Entries){if($entry.PSIsContainer -or $entry.Name -cnotmatch '^(\.owner|persistence-(state|control|capture|public|witness|source|package|runtime)-[a-z_-]+\.json|settings-(control|capture|public|screenshots)-[a-z_-]+\.json|settings-(expected|vault-before)-(source|package)\.json|settings-recovery-(control|capture|public)-(source|package)-(recovery-setup|current-cancel|current-confirm|previous-cancel|previous-confirm)\.json|settings-recovery-(source|package)-(recovery-setup|current-cancel|current-confirm|previous-cancel|previous-confirm)\.json|settings-recovery-(owner|backup)-(source|package)\.json|settings-recovery-before-(source|package)-(current|previous)\.json|settings-(source|package)-(ui|reopen|before-crash|before-reopen|after-crash|after-reopen)\.json|settings-(source|package)-(light|dark)\.png)$'){throw 'ROOT_REMAINDER'}}
    foreach($entry in $left.Entries){if($entry.Name -cne '.owner'){[IO.File]::Delete($entry.FullName)}}
    Remove-VerifiedOwnedRun $owner $allClean
    $report.directoryCleanup=$true;$report.failure=$null
}catch{$report.failure=$failure}
if(-not $baseVerified){Write-Output 'SETTINGS_PREPARE_FAILED';exit 1}
Assert-PlainDirectory $base
Write-Private (Join-Path $base 'unvalidated.json') $report
Write-Output 'SETTINGS_RAW_EVIDENCE_WRITTEN'
