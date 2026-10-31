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
$report = [ordered]@{schemaVersion=2; scope='HOSTED_KEY_AND_MAIN_READY'; modes=[ordered]@{}; ready=[ordered]@{}; runtimeCopyVerified=$false; directoryCleanup=$false; failure=$null}
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
function Remove-TestTree([string]$Name,[long]$Limit) {
    if(-not $allClean){throw 'JOB_RETIREMENT_UNCONFIRMED'}
    Assert-OwnedRun $owner
    if($Name -cnotin @('package','data-source','data-package','backup-parent-source','backup-parent-package','logs-source-ready','logs-package-ready')){throw 'PART_NAME_REJECTED'}
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

    }
    $failure='CLEANUP_FAILED'
    foreach($name in @('data-source','data-package','backup-parent-source','backup-parent-package')){Remove-TestTree $name (128L*1024*1024)}
    Remove-TestTree 'package' (512L*1024*1024)
    Assert-OwnedRun $owner
    $remaining=Get-BoundedOwnedEntries $owner.Path (8L*1024*1024)
    foreach($entry in $remaining.Entries){if($entry.PSIsContainer -or $entry.Name -cnotmatch '^(\.owner|persistence-(state|control|capture|public|witness|source|package|ready)-[a-z-]+\.json)$'){throw 'UNEXPECTED_REMAINDER'}}
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
