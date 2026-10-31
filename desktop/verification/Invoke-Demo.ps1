$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path $desktop '.demo-verification'
$owner = $null
$baseVerified = $false
$allClean = $true
$failure = 'PREPARE_FAILED'
$report = [ordered]@{version=1;scope='HOSTED_EXPLICIT_DEMO_BOUNDARY';excludedVaultContext='P106_UNMET_NOT_RERUN';bootstrap=[ordered]@{};modes=[ordered]@{};negatives=[ordered]@{};productionFilesUnchanged=$false;productionPayloadCopyVerified=$false;screenshots=[ordered]@{};runtimeCopyVerified=$false;directoryCleanup=$false;failure=$null}
function Retired($Probe) {
    return ($Probe.CleanupComplete -and -not $Probe.StdoutTruncated -and -not $Probe.StderrTruncated -and $Probe.Status -in @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))
}
function Process-Evidence($Probe) {
    return [ordered]@{status=$Probe.Status;exitCode=$Probe.ExitCode;cleanupComplete=$Probe.CleanupComplete;stdoutTruncated=$Probe.StdoutTruncated;stderrTruncated=$Probe.StderrTruncated}
}
function Show-DemoDiagnostic($Probe) {
    foreach($marker in @('DEMO_PROBE_STAGE_ADMISSION','DEMO_PROBE_STAGE_READY','DEMO_PROBE_STAGE_PAGES','DEMO_PROBE_STAGE_SELECTION','DEMO_PROBE_STAGE_STORAGE','DEMO_PROBE_STAGE_CLOSE','DEMO_PROBE_FAILED','DEMO_PROBE_DEADLINE','DEMO_PRODUCTION_FAILED','DEMO_PRODUCTION_DEADLINE','DEMO_FAILED')){
        if(@($Probe.Stderr -split '\r?\n'|Where-Object {$_ -ceq $marker}).Count -gt 0){Write-Output $marker}
    }
}
function Show-DemoValidationDiagnostic($Probe) {
    $markers=[Collections.Generic.List[string]]::new()
    foreach($name in @('SUCCESS','NONZERO_EXIT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED','EMPTY_OUTPUT')){$markers.Add('DEMO_PROCESS_'+$name)}
    foreach($name in @('NONE','ZERO','NONZERO')){$markers.Add('DEMO_EXIT_'+$name)}
    foreach($name in @('CONFIRMED','UNCONFIRMED')){$markers.Add('DEMO_RETIREMENT_'+$name)}
    foreach($name in @('EXACT','EMPTY','OTHER')){$markers.Add('DEMO_STDOUT_'+$name)}
    $markers.Add('DEMO_CAPTURE_INVALID')
    foreach($name in @('INITIALIZE','ROOT_OWNER','CAPTURE_READ','CAPTURE','RESULT_READ','RESULT_SCHEMA','CASES','OUTPUT_WRITE')){$markers.Add('DEMO_VALIDATION_STAGE_'+$name)}
    foreach($mode in @('SOURCE','PACKAGE','PRODUCTION')){
        $limit=18;if($mode -ceq 'PRODUCTION'){$limit=7}
        for($i=1;$i -le $limit;$i++){$markers.Add(('DEMO_CASE_'+$mode+'_'+$i.ToString('00')+'_FALSE'))}
    }
    $shown=0
    foreach($marker in $markers){if(@($Probe.Stdout -split '\r?\n'|Where-Object {$_ -ceq $marker}).Count -gt 0){$shown++;if($shown -gt 24){break};Write-Output $marker}}
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

# This independent demo run never invokes the P1-06 foreign-context helper.
function Read-Public([string]$Name) {
    Assert-OwnedRun $owner
    if([IO.Path]::GetFileName($Name) -cne $Name){throw 'NAME'}
    $item=Get-Item -LiteralPath (Join-Path $owner.Path $Name) -Force
    if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 65536){throw 'PUBLIC_FILE'}
    return ([IO.File]::ReadAllText($item.FullName)|ConvertFrom-Json)
}
function New-Profile([string]$Name) {
    Assert-OwnedRun $owner
    if($Name -cnotmatch '^fonesi-auto-foundation-source-(provision|orderly-auth|abrupt-auth|final-auth|settings-ui|production-argument)\z'){throw 'PROFILE_NAME'}
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
    if($Name -cnotmatch '^(package|production-payload|data-source|backup-parent-source|logs-source-settings-ui|demo-(source|package)|demo-negative-(marker|manifest)|fonesi-auto-foundation-source-(provision|orderly-auth|abrupt-auth|final-auth|settings-ui|production-argument))\z'){throw 'PART_NAME'}
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
function Remove-DemoPart([string]$Name) {
    if(-not $allClean -or $Name -cnotin @('demo-source','demo-package','demo-negative-marker','demo-negative-manifest')){throw 'DEMO_PART'}
    Assert-OwnedRun $owner
    $outer=Join-Path $owner.Path $Name;Assert-PlainDirectory $outer
    $session=Join-Path $outer 'session';Assert-PlainDirectory $session
    $marker=Get-Item -LiteralPath (Join-Path $session '.demo-owner.json') -Force
    $kind='FONESI_DEMO';if($Name -ceq 'demo-negative-marker'){$kind='NOT_FONESI_DEMO'}
    $pattern='^\{"version":1,"kind":"'+$kind+'","ownerToken":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\}\z'
    if($marker.PSIsContainer -or ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $marker.Length -gt 128 -or [IO.File]::ReadAllText($marker.FullName) -cnotmatch $pattern){throw 'DEMO_OWNER'}
    $positive=$Name -cin @('demo-source','demo-package')
    $allowed=[Collections.Generic.List[string]]::new();$allowed.Add('session');$allowed.Add('demo-build')
    if($positive){$allowed.Add('verification');$allowed.Add('.verification-provenance.json');$allowed.Add($Name+'.json');foreach($image in $report.modes[$Name.Substring(5)].images){$allowed.Add($image.name)}}
    $outerFiles=[Collections.Generic.List[object]]::new();$count=0
    $iterator=[IO.Directory]::EnumerateFileSystemEntries($outer).GetEnumerator()
    try{while($iterator.MoveNext()){
        $count++;if($count -gt $allowed.Count){throw 'DEMO_REMAINDER'}
        $entry=Get-Item -LiteralPath $iterator.Current -Force
        if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $entry.Name -cnotin $allowed){throw 'DEMO_REMAINDER'}
        if($entry.Name -cin @('session','demo-build','verification')){if(-not $entry.PSIsContainer){throw 'DEMO_TYPE'}}
        else{if($entry.PSIsContainer){throw 'DEMO_TYPE'};$outerFiles.Add($entry)}
    }}finally{if($iterator -is [IDisposable]){$iterator.Dispose()}}
    if($count -ne $allowed.Count){throw 'DEMO_REMAINDER'}
    $iterator=[IO.Directory]::EnumerateFileSystemEntries($session).GetEnumerator();$sessionCount=0
    try{while($iterator.MoveNext()){$sessionCount++;if($sessionCount -gt 2 -or [IO.Path]::GetFileName($iterator.Current) -cnotin @('.demo-owner.json','profile')){throw 'DEMO_SESSION'}}}finally{if($iterator -is [IDisposable]){$iterator.Dispose()}}
    if($sessionCount -ne 2){throw 'DEMO_SESSION'}
    $count+=$sessionCount
    $partitions=[Collections.Generic.List[object]]::new()
    # Validate every disjoint bound and exact entry before any deletion.
    foreach($part in @(@('session/profile',8388608L),@('demo-build',8388608L),@('verification',1048576L))){
        if($part[0] -ceq 'verification' -and -not $positive){continue}
        $path=Join-Path $outer $part[0];Assert-PlainDirectory $path
        $inventory=Get-BoundedOwnedEntries $path $part[1];$count+=$inventory.Entries.Count
        if($count -gt 256){throw 'DEMO_COUNT'}
        $partitions.Add([pscustomobject]@{Path=$path;Inventory=$inventory})
    }
    foreach($entry in $outerFiles){
        if($entry.Name.EndsWith('.png')){
            $expected=$report.screenshots[$entry.Name]
            if($null -eq $expected -or $entry.Length -gt 4194304 -or $entry.Length -ne $expected.bytes -or (Get-FileHash $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected.sha256){throw 'DEMO_IMAGE_CHANGED'}
        }elseif($entry.Length -gt 65536){throw 'DEMO_METADATA_LIMIT'}
    }
    Assert-OwnedRun $owner
    foreach($part in $partitions){
        foreach($entry in $part.Inventory.Entries){if(-not $entry.PSIsContainer){[IO.File]::Delete($entry.FullName)}}
        foreach($entry in @($part.Inventory.Entries|Where-Object {$_.PSIsContainer}|Sort-Object {$_.FullName.Length} -Descending)){[IO.Directory]::Delete($entry.FullName,$false)}
        [IO.Directory]::Delete($part.Path,$false)
    }
    foreach($entry in $outerFiles){[IO.File]::Delete($entry.FullName)}
    [IO.File]::Delete($marker.FullName);[IO.Directory]::Delete($session,$false);[IO.Directory]::Delete($outer,$false)
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
    $packageExe=Join-Path $package 'AutoDemo.exe'
    [IO.File]::Move((Join-Path $package 'electron.exe'),$packageExe)
    [void](Copy-VerifiedTree (Join-Path $desktop 'build') (Join-Path $owner.Path 'production-payload') (8L*1024*1024))
    Write-Private (Join-Path $owner.Path 'persistence-runtime-attestation.json') $manifest
    $report.runtimeCopyVerified=$true
    $mode='source'
        $failure='CONTROL_FAILED';$allClean=$false
        $setup=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'setup',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $setup;Require-Success $setup 'PERSISTENCE_CONTROL_SETUP'
        foreach($stage in @('provision','orderly-auth','abrupt-auth','final-auth')){
            $failure='PREFLIGHT_FAILED';$allClean=$false
            $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'prepare',$owner.Path,$mode,$stage)) 120000 @{}
            $allClean=Retired $prepared;Require-Success $prepared 'PERSISTENCE_CONTROL_PREPARED'
            $profileName='fonesi-auto-foundation-'+$mode+'-'+$stage;$profile=New-Profile $profileName
            $exe=$sourceExe;[string[]]$arguments=@((Join-Path $PSScriptRoot 'persistence-probe.cjs'))
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
    $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'settings-control.cjs'),'prepare',$owner.Path,'source','ui')) 120000 @{}
    $allClean=Retired $prepared;Require-Success $prepared 'SETTINGS_CONTROL_PREPARED'
    $profile=New-Profile 'fonesi-auto-foundation-source-settings-ui'
    $environment=@{FONESI_PERSISTENCE_RUN_ROOT=$owner.Path;FONESI_PERSISTENCE_CONTROL_NAME='settings-control-source-ui.json';FONESI_BOOTSTRAP_ROOT=$profile;FONESI_BOOTSTRAP_MODE='source';FONESI_PERSISTENCE_READY_FILE=(Join-Path $owner.Path 'data-source/.ready-launch.json');FONESI_LOG_ROOT=(Join-Path $owner.Path 'logs-source-settings-ui');FONESI_LOG_PARENT_TOKEN=$owner.Token}
    $failure='NATIVE_STAGE_FAILED';$allClean=$false
    $native=Invoke-OwnedChild $sourceExe ([string[]]@((Join-Path $PSScriptRoot 'demo-production-probe.cjs'))) 120000 $environment
    Show-DemoDiagnostic $native;$allClean=Retired $native
    Write-Private (Join-Path $owner.Path 'demo-capture-production.json') ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
    if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
    $failure='STAGE_VALIDATION_FAILED';$allClean=$false
    $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_demo.py'),'stage',$owner.Path,'production')) 120000 @{}
    Show-DemoValidationDiagnostic $validated;$allClean=Retired $validated;Require-Success $validated 'DEMO_VALIDATION_PASS'
    $report.modes.production=Read-Public 'demo-public-production.json'
    Remove-Part 'fonesi-auto-foundation-source-settings-ui' (8L*1024*1024)
    $failure='ISOLATION_FAILED';$allClean=$false
    $copyScan=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'demo-control.cjs'),'scan-copy',$owner.Path)) 120000 @{}
    $allClean=Retired $copyScan;Require-Success $copyScan 'DEMO_PRODUCTION_COPY_CLEAN';$report.productionPayloadCopyVerified=$true
    $allClean=$false
    $witness=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'demo-control.cjs'),'witness',$owner.Path)) 120000 @{}
    $allClean=Retired $witness;Require-Success $witness 'DEMO_PRODUCTION_WITNESSED'
    foreach($mode in @('source','package')){
        $failure='PREFLIGHT_FAILED';$allClean=$false
        $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'demo-control.cjs'),'prepare',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $prepared;Require-Success $prepared 'DEMO_CONTROL_PREPARED'
        $outer=Join-Path $owner.Path ('demo-'+$mode);Assert-PlainDirectory $outer
        $exe=$sourceExe;if($mode -ceq 'package'){$exe=$packageExe}
        if((Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.exeSha256){throw 'RUNTIME_CHANGED'}
        $failure='NATIVE_STAGE_FAILED';$allClean=$false
        $native=Invoke-OwnedChild $exe ([string[]]@((Join-Path $outer 'demo-build/main.cjs'),'--demo')) 120000 @{FONESI_BOOTSTRAP_ROOT=(Join-Path $outer 'session/profile')}
        Show-DemoDiagnostic $native;$allClean=Retired $native
        Write-Private (Join-Path $owner.Path ('demo-capture-'+$mode+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
        if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
        $failure='STAGE_VALIDATION_FAILED';$allClean=$false
        $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_demo.py'),'stage',$owner.Path,$mode)) 120000 @{}
        Show-DemoValidationDiagnostic $validated;$allClean=Retired $validated;Require-Success $validated 'DEMO_VALIDATION_PASS'
        $report.modes[$mode]=Read-Public ('demo-public-'+$mode+'.json')
    }
    foreach($kind in @('marker','manifest')){
        $failure='PREFLIGHT_FAILED';$allClean=$false
        $prepared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'demo-control.cjs'),'negative',$owner.Path,$kind)) 120000 @{}
        $allClean=Retired $prepared;Require-Success $prepared 'DEMO_NEGATIVE_PREPARED'
        $outer=Join-Path $owner.Path ('demo-negative-'+$kind)
        $failure='NATIVE_STAGE_FAILED';$allClean=$false
        $native=Invoke-OwnedChild $sourceExe ([string[]]@((Join-Path $outer 'demo-build/main.cjs'),'--demo')) 120000 @{FONESI_BOOTSTRAP_ROOT=(Join-Path $outer 'session/profile')}
        $allClean=Retired $native
        Write-Private (Join-Path $owner.Path ('demo-capture-'+$kind+'.json')) ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
        if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
        $failure='STAGE_VALIDATION_FAILED';$allClean=$false
        $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_demo.py'),'negative',$owner.Path,$kind)) 120000 @{}
        Show-DemoValidationDiagnostic $validated;$allClean=Retired $validated;Require-Success $validated 'DEMO_VALIDATION_PASS'
        $report.negatives[$kind]=Read-Public ('demo-negative-public-'+$kind+'.json')
    }
    $profile=New-Profile 'fonesi-auto-foundation-source-production-argument'
    $environment.FONESI_BOOTSTRAP_ROOT=$profile
    $failure='NATIVE_STAGE_FAILED';$allClean=$false
    $native=Invoke-OwnedChild $sourceExe ([string[]]@((Join-Path $desktop 'build/main.cjs'),'--demo')) 120000 $environment
    $allClean=Retired $native
    Write-Private (Join-Path $owner.Path 'demo-capture-production-argument.json') ([ordered]@{process=(Process-Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
    if(-not $allClean){throw 'NATIVE_UNCONFIRMED'}
    $failure='STAGE_VALIDATION_FAILED';$allClean=$false
    $validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_demo.py'),'negative',$owner.Path,'production-argument')) 120000 @{}
    Show-DemoValidationDiagnostic $validated;$allClean=Retired $validated;Require-Success $validated 'DEMO_VALIDATION_PASS'
    $report.negatives['production-argument']=Read-Public 'demo-negative-public-production-argument.json'
    Remove-Part 'fonesi-auto-foundation-source-production-argument' (8L*1024*1024)
    $failure='ISOLATION_FAILED';$allClean=$false
    $compared=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'demo-control.cjs'),'compare',$owner.Path)) 120000 @{}
    $allClean=Retired $compared;Require-Success $compared 'DEMO_PRODUCTION_UNCHANGED';$report.productionFilesUnchanged=$true
    foreach($mode in @('source','package','production')){
        $failure='SCREENSHOT_FAILED';$allClean=$false
        $pictures=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_demo.py'),'screenshots',$owner.Path,$mode)) 120000 @{}
        $allClean=Retired $pictures;Require-Success $pictures 'DEMO_SCREENSHOTS_VERIFIED'
        $shots=Read-Public ('demo-screenshots-'+$mode+'.json')
        foreach($image in $shots.images){$report.screenshots[$image.name]=$image}
    }
    $failure='CLEANUP_FAILED'
    # All native trees retired before fixed independently bounded partitions are deleted.
    Remove-Part 'logs-source-settings-ui' (8L*1024*1024)
    Remove-Part 'data-source' (128L*1024*1024)
    Remove-Part 'backup-parent-source' (128L*1024*1024)
    Remove-Part 'production-payload' (8L*1024*1024)
    foreach($name in @('demo-source','demo-package','demo-negative-marker','demo-negative-manifest')){Remove-DemoPart $name}
    Remove-Part 'package' (512L*1024*1024)
    Assert-OwnedRun $owner
    $picture=Get-Item -LiteralPath (Join-Path $owner.Path 'demo-production-overview-light.png') -Force
    $expected=$report.screenshots['demo-production-overview-light.png']
    if($picture.PSIsContainer -or ($picture.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $picture.Length -ne $expected.bytes -or (Get-FileHash $picture.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected.sha256){throw 'SCREENSHOT_CHANGED'}
    [IO.File]::Delete($picture.FullName)
    $left=Get-BoundedOwnedEntries $owner.Path (1024L*1024)
    foreach($entry in $left.Entries){if($entry.PSIsContainer -or $entry.Name -cnotmatch '^(\.owner|persistence-(state|control|capture|public|witness|source|runtime)-[a-z_-]+\.json|settings-control-source-ui\.json|demo-production\.json|demo-production-witness\.json|demo-(capture|public|screenshots)-(source|package|production|marker|manifest|production-argument)\.json|demo-negative-public-(marker|manifest|production-argument)\.json)\z'){throw 'ROOT_REMAINDER'}}
    foreach($entry in $left.Entries){if($entry.Name -cne '.owner'){[IO.File]::Delete($entry.FullName)}}
    Remove-VerifiedOwnedRun $owner $allClean
    $report.directoryCleanup=$true;$report.failure=$null
}catch{$report.failure=$failure}
if(-not $baseVerified){Write-Output 'DEMO_PREPARE_FAILED';exit 1}
Assert-PlainDirectory $base
Write-Private (Join-Path $base 'unvalidated.json') $report
Write-Output 'DEMO_RAW_EVIDENCE_WRITTEN'
