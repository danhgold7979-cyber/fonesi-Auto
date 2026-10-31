$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path $desktop '.ui-runtime'
$owner = $null
$baseVerified = $false
$allClean = $true
$failure = 'PREPARE_FAILED'
$report = [ordered]@{version=1;scope='HOSTED_V9_UI_PARITY';excludedVaultContext='P106_UNMET_NOT_RERUN';bootstrap=[ordered]@{};modes=[ordered]@{};screenshots=[ordered]@{};runtimeCopyVerified=$false;directoryCleanup=$false;failure=$null}
function Retired($Probe) {
    return ($Probe.CleanupComplete -and -not $Probe.StdoutTruncated -and -not $Probe.StderrTruncated -and $Probe.Status -in @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))
}
function Process-Evidence($Probe) {
    return [ordered]@{status=$Probe.Status;exitCode=$Probe.ExitCode;cleanupComplete=$Probe.CleanupComplete;stdoutTruncated=$Probe.StdoutTruncated;stderrTruncated=$Probe.StderrTruncated}
}
function Show-FixedUiDiagnostic($Probe) {
    foreach($marker in @('UI_STAGE_PREPARE','UI_STAGE_HYDRATE','UI_STAGE_PAGES','UI_STAGE_DROPDOWN','UI_STAGE_MODAL','UI_STAGE_DIMENSIONS','UI_STAGE_RESPONSIVE','UI_STAGE_CLOSE','UI_REFERENCE_STAGE_PREPARE','UI_REFERENCE_STAGE_LOAD','UI_REFERENCE_STAGE_PAGES','UI_REFERENCE_STAGE_CLOSE','UI_REFERENCE_PROGRESS_ENTRY','UI_REFERENCE_PROGRESS_PREPARED','UI_REFERENCE_PROGRESS_LOADED','UI_REFERENCE_PROGRESS_CAPTURED','UI_REFERENCE_PROGRESS_CLOSING','UI_REFERENCE_PROGRESS_WRITTEN')){
        if(@($Probe.Stderr -split '\r?\n' | Where-Object {$_ -ceq $marker}).Count -gt 0){Write-Output $marker}
    }
    foreach($page in @('OVERVIEW','ACCOUNTS','TRACKING','SETUP','CALENDAR','WORKFLOWS')){
        foreach($theme in @('LIGHT','DARK')){
            foreach($step in @('THEME','NAVIGATE','STRUCTURE','EMPTY','GEOMETRY','CAPTURE')){
                $marker='UI_PAGE_'+$page+'_'+$theme+'_'+$step
                if(@($Probe.Stderr -split '\r?\n' | Where-Object {$_ -ceq $marker}).Count -gt 0){Write-Output $marker;return}
            }
        }
    }
}
function Show-FixedUiValidation($Probe) {
    foreach($marker in @('UI_VALIDATION_STAGE_INITIALIZE','UI_VALIDATION_STAGE_ROOT_OWNER','UI_VALIDATION_STAGE_CAPTURE_READ','UI_VALIDATION_STAGE_RESULT_READ','UI_VALIDATION_STAGE_RESULT_SCHEMA','UI_VALIDATION_STAGE_CAPTURE_SCHEMA','UI_VALIDATION_STAGE_PROCESS','UI_VALIDATION_STAGE_STDOUT','UI_VALIDATION_STAGE_STDERR','UI_VALIDATION_STAGE_CASE_FALSE','UI_VALIDATION_STAGE_OUTPUT_WRITE','UI_PROCESS_SUCCESS','UI_PROCESS_NONZERO_EXIT','UI_PROCESS_EMPTY_OUTPUT','UI_PROCESS_TIMEOUT','UI_PROCESS_LAUNCH_FAILED','UI_PROCESS_ACCESS_DENIED','UI_PROCESS_CLEANUP_FAILED','UI_PROCESS_INVALID','UI_EXIT_NULL','UI_EXIT_ZERO','UI_EXIT_NONZERO','UI_EXIT_INVALID','UI_RETIREMENT_CONFIRMED','UI_RETIREMENT_UNCONFIRMED','UI_REFERENCE_CLOSED_ZERO','UI_REFERENCE_CLOSED_ONE','UI_REFERENCE_CLOSED_MULTIPLE','UI_STDOUT_EMPTY_PRESENT','UI_STDOUT_OTHER_PRESENT','UI_CAPTURE_INVALID','UI_REFERENCE_DEADLINE','UI_REFERENCE_FAILED','UI_FAILED','UI_DEADLINE')){
        if(@($Probe.Stdout -split '\r?\n' | Where-Object {$_ -ceq $marker}).Count -gt 0){Write-Output $marker}
    }
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

# This independent UI run never invokes the P1-06 foreign-context helper.
function Read-Public([string]$Name) {
    Assert-OwnedRun $owner
    if([IO.Path]::GetFileName($Name) -cne $Name){throw 'NAME'}
    $item=Get-Item -LiteralPath (Join-Path $owner.Path $Name) -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 65536){throw 'PUBLIC_FILE'}
    return ([IO.File]::ReadAllText($item.FullName)|ConvertFrom-Json)
}
function New-Profile([string]$Name) {
    Assert-OwnedRun $owner
    if($Name -cnotmatch '^fonesi-auto-foundation-((source|package)-(provision|orderly-auth|abrupt-auth|final-auth|settings-ui)|ui-reference)\z'){throw 'PROFILE_NAME'}
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
    if($Name -cnotmatch '^(package|data-(source|package)|backup-parent-(source|package)|logs-(source|package)-settings-ui|fonesi-auto-foundation-((source|package)-(provision|orderly-auth|abrupt-auth|final-auth|settings-ui)|ui-reference))\z'){throw 'PART_NAME'}
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
    $packageExe=Join-Path $package 'AutoUi.exe'
    [IO.File]::Move((Join-Path $package 'electron.exe'),$packageExe)
    $appRoot=Join-Path $package 'resources/app'
    [Fonesi.Phase00.NativeProbe]::ReserveDirectory($appRoot)
    [void](Copy-VerifiedTree (Join-Path $desktop 'build') (Join-Path $appRoot 'build') (8L*1024*1024))

    $verification=Join-Path $appRoot 'verification';[Fonesi.Phase00.NativeProbe]::ReserveDirectory($verification)
    foreach($name in @('persistence-probe.cjs','persistence-restore-contract.cjs','settings-native.cjs','settings-contract.cjs','ui-contract.cjs','ui-main-probe.cjs','ui-reference-probe.cjs')){
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
        $failure='PREFLIGHT_FAILED';$allClean=$false
        $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'settings-control.cjs'),'prepare',$owner.Path,$mode,'ui')) 120000 @{}
        $allClean=Retired $prepared;Require-Success $prepared 'SETTINGS_CONTROL_PREPARED'
        $profileName='fonesi-auto-foundation-'+$mode+'-settings-ui';$profile=New-Profile $profileName
        $exe=$sourceExe;[string[]]$arguments=@((Join-Path $PSScriptRoot 'ui-main-probe.cjs'))
        if($mode -eq 'package'){$exe=$packageExe;$arguments=@();[IO.File]::WriteAllText((Join-Path $appRoot 'package.json'),' {"name":"auto-ui-verification","version":"0.0.0","main":"verification/ui-main-probe.cjs"}')}
        if((Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
        $environment=@{FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;FONESI_PERSISTENCE_CONTROL_NAME=('settings-control-'+$mode+'-ui.json');FONESI_BOOTSTRAP_ROOT=$profile;FONESI_BOOTSTRAP_MODE=$mode;FONESI_PERSISTENCE_READY_FILE=(Join-Path $owner.Path ('data-'+$mode+'/.ready-launch.json'));FONESI_LOG_ROOT=(Join-Path $owner.Path ('logs-'+$mode+'-settings-ui'));FONESI_LOG_PARENT_TOKEN=$owner.Token}
        $failure='NATIVE_STAGE_FAILED';$allClean=$false
        $native=Invoke-OwnedChild $exe $arguments 120000 $environment
        Show-FixedUiDiagnostic $native
        $allClean=Retired $native
        Write-Private (Join-Path $owner.Path ('ui-capture-'+$mode+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
        if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
        $failure='STAGE_VALIDATION_FAILED';$allClean=$false
        $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_ui.py'),'stage',$owner.Path,$mode)) 120000 @{}
        Show-FixedUiValidation $validated
        $allClean=Retired $validated;Require-Success $validated 'UI_VALIDATION_PASS'
        $report.modes[$mode]=Read-Public ('ui-public-'+$mode+'.json')
        Remove-Part $profileName (8L*1024*1024)
        Remove-Part ('logs-'+$mode+'-settings-ui') (8L*1024*1024)
    }
    $failure='PREFLIGHT_FAILED'
    $reference=[IO.Path]::GetFullPath((Join-Path $desktop '../ui-reference/Fonesi-Auto-V9-UI-Reference.html'))
    $refItem=Get-Item -LiteralPath $reference -Force
    if($refItem.PSIsContainer -or ($refItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $refItem.Length -ne 249014 -or (Get-FileHash $reference -Algorithm SHA256).Hash.ToLowerInvariant() -cne '26519dda4d65f4712258b9f3c136b785126121260e6fae8d8ada1bbb84363efe'){throw 'REFERENCE_CHANGED'}
    [IO.File]::Copy($reference,(Join-Path $owner.Path 'ui-reference.html'),$false)
    if((Get-FileHash (Join-Path $owner.Path 'ui-reference.html') -Algorithm SHA256).Hash.ToLowerInvariant() -cne '26519dda4d65f4712258b9f3c136b785126121260e6fae8d8ada1bbb84363efe'){throw 'REFERENCE_COPY'}
    $profile=New-Profile 'fonesi-auto-foundation-ui-reference'
    if((Get-FileHash $sourceExe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
    $failure='NATIVE_STAGE_FAILED';$allClean=$false
    $native=Invoke-OwnedChild $sourceExe ([string[]]@((Join-Path $PSScriptRoot 'ui-reference-probe.cjs'))) 120000 @{FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;FONESI_BOOTSTRAP_ROOT=$profile}
    Show-FixedUiDiagnostic $native
    $allClean=Retired $native
    Write-Private (Join-Path $owner.Path 'ui-capture-reference.json') ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
    if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
    $failure='STAGE_VALIDATION_FAILED';$allClean=$false
    $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_ui.py'),'stage',$owner.Path,'reference')) 120000 @{}
    Show-FixedUiValidation $validated
        $allClean=Retired $validated;Require-Success $validated 'UI_VALIDATION_PASS'
    $report.modes.reference=Read-Public 'ui-public-reference.json'
    Remove-Part 'fonesi-auto-foundation-ui-reference' (8L*1024*1024)
    foreach($mode in @('source','package','reference')){
        $failure='SCREENSHOT_FAILED';$allClean=$false
        $pictures=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_ui.py'),'screenshots',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $pictures;Require-Success $pictures 'UI_SCREENSHOTS_VERIFIED'
        $shots=Read-Public ('ui-screenshots-'+$mode+'.json')
        foreach($image in $shots.images){
            if($image.name -isnot [string] -or [IO.Path]::GetFileName($image.name) -cne $image.name -or $image.name -cnotmatch '^ui-(source|package|reference)-(overview|accounts|tracking|setup|calendar|workflows)-(light|dark)(-(880|600))?\.png\z'){throw 'SCREENSHOT_NAME'}
            $report.screenshots[$image.name]=$image
            Assert-OwnedRun $owner
            $picture=Get-Item -LiteralPath (Join-Path $owner.Path $image.name) -Force
            if($picture.PSIsContainer -or ($picture.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $picture.Length -ne $image.bytes -or (Get-FileHash $picture.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $image.sha256){throw 'SCREENSHOT_CHANGED'}
            [IO.File]::Delete($picture.FullName)
        }
    }
    $failure='CLEANUP_FAILED'
    foreach($mode in @('source','package')){
        Remove-Part ('data-'+$mode) (128L*1024*1024)
        Remove-Part ('backup-parent-'+$mode) (128L*1024*1024)
    }
    Remove-Part 'package' (512L*1024*1024)
    Assert-OwnedRun $owner
    $left=Get-BoundedOwnedEntries $owner.Path (1024L*1024)
    foreach($entry in $left.Entries){if($entry.PSIsContainer -or $entry.Name -cnotmatch '^(\.owner|persistence-(state|control|capture|public|witness|source|package|runtime)-[a-z_-]+\.json|settings-control-(source|package)-ui\.json|ui-(source|package|reference)\.json|ui-(capture|public|screenshots)-(source|package|reference)\.json|ui-reference\.html)\z'){throw 'ROOT_REMAINDER'}}
    foreach($entry in $left.Entries){if($entry.Name -cne '.owner'){[IO.File]::Delete($entry.FullName)}}
    Remove-VerifiedOwnedRun $owner $allClean
    $report.directoryCleanup=$true;$report.failure=$null
}catch{$report.failure=$failure}
if(-not $baseVerified){Write-Output 'UI_PREPARE_FAILED';exit 1}
Assert-PlainDirectory $base
Write-Private (Join-Path $base 'unvalidated.json') $report
Write-Output 'UI_RAW_EVIDENCE_WRITTEN'
