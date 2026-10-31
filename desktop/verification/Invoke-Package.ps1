$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.package-runtime'
$owner=$null;$baseVerified=$false;$allClean=$true;$phase='INITIALIZE';$stage='NONE';$failure='PREPARE_FAILED'
$stages=@('first-cancel','first-launch','reopen','guard-denied','corrupt-current','recover-retained','restore-cancel','restore-confirm','restored-normal-denied','restored-maintenance')
$report=[ordered]@{version=1;scope='HOSTED_INTERNAL_PRODUCTION_PACKAGE';excludedVaultContext='P106_UNMET_NOT_RERUN';sourceHead=$env:GITHUB_SHA;sourceTree=('0'*40);package=$null;stages=[ordered]@{};negatives=$null;relocatedCopyVerified=$false;originalPackageUnchanged=$false;dataOutsidePackage=$false;directoryCleanup=$false;failure=$null}
function Retired($p){return ($p.CleanupComplete -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))}
function Evidence($p){return [ordered]@{process=[ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated};stdout=$p.Stdout;stderr=$p.Stderr}}
function Write-Private([string]$file,$value){Assert-PlainDirectory ([IO.Path]::GetDirectoryName($file));$bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Depth 24 -Compress));if($bytes.Length -gt 65536){throw 'CAPTURE_LIMIT'};$f=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$f.Write($bytes,0,$bytes.Length);$f.Flush($true)}finally{$f.Dispose()}}
function Read-Private([string]$name){Assert-OwnedRun $owner;if([IO.Path]::GetFileName($name) -cne $name){throw 'NAME'};$f=Get-Item -LiteralPath (Join-Path $owner.Path $name) -Force;if($f.PSIsContainer -or ($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $f.Length -gt 65536){throw 'FILE'};return ([IO.File]::ReadAllText($f.FullName)|ConvertFrom-Json)}
function Require($p,[string]$marker){if(-not (Retired $p) -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0 -or (($p.Stdout -replace '\r\n',"`n").TrimEnd("`n") -cne $marker)){throw 'CONTROL'}}
function Show-ControlDiagnostic($p,[string]$expected){
    # Only finite classifications and exact allowlisted full stderr lines escape.
    $status='INVALID';if($p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED')){$status=$p.Status}
    Write-Output ('PACKAGE_CONTROL_PROCESS_'+$status)
    $exit='NONZERO';if($null -eq $p.ExitCode){$exit='NONE'}elseif($p.ExitCode -eq 0){$exit='ZERO'}
    Write-Output ('PACKAGE_CONTROL_EXIT_'+$exit)
    $retirement='UNCONFIRMED';if(Retired $p){$retirement='CONFIRMED'}
    Write-Output ('PACKAGE_CONTROL_RETIREMENT_'+$retirement)
    $stdout='OTHER';if($p.Stdout.Length -eq 0){$stdout='EMPTY'}elseif((($p.Stdout -replace '\r\n',"`n").TrimEnd("`n")) -ceq $expected){$stdout='EXACT'}
    Write-Output ('PACKAGE_CONTROL_STDOUT_'+$stdout)
    $phases=@('ADMISSION','CAPTURE','BEFORE_STATE','MODULES','PRODUCT','JOURNAL','COMPLETED','OBSERVER','RESULT')
    $codes=@('RESTORE_CONTROL','RESTORE_DESCENDANT','RESTORE_FILE','RESTORE_LIMIT','RESTORE_OWNER','RESTORE_READBACK','RESTORE_RESULT','RESTORE_SCHEMA','RESTORE_SOURCE','PACKAGE_STATE_REJECTED','LAUNCH_JOURNAL_REJECTED','ENOENT','UNCLASSIFIED')
    $shown=0
    foreach($prefix in @('PACKAGE_OBSERVE_','PACKAGE_OBSERVE_ERROR_')){
        $values=$phases;if($prefix -ceq 'PACKAGE_OBSERVE_ERROR_'){$values=$codes}
        foreach($value in $values){$literal=$prefix+$value;if(@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $literal}).Count -eq 1){Write-Output $literal;$shown++;break}}
        if($shown -ge 2){break}
    }
    $captureVector=[ordered]@{
        SCHEMA=@('VALID','INVALID','UNAVAILABLE')
        PARSE_REASON=@('INPUT_LIMIT','JSON_GRAMMAR','DEPTH','PAIRS','DUPLICATE','ROOT_KEYS','PROCESS_KEYS','STATUS_TYPE_OR_ENUM','EXIT_TYPE_OR_RANGE','BOOLEAN_TYPES','STDOUT_TYPE_OR_LIMIT','STDERR_TYPE_OR_LIMIT','VALID','UNAVAILABLE')
        STATUS=@('MATCH','MISMATCH','UNAVAILABLE')
        EXIT=@('MATCH','MISMATCH','UNAVAILABLE')
        CLEANUP=@('TRUE','FALSE','UNAVAILABLE')
        STDOUT_TRUNCATED=@('TRUE','FALSE','UNAVAILABLE')
        STDERR_TRUNCATED=@('TRUE','FALSE','UNAVAILABLE')
        EXPECTED_MARKER=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        NONEMPTY_LINES=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        STDOUT_MATCH=@('EXACT','OTHER','UNAVAILABLE')
        CANCELLED=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        CLOSED=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        RECOVERED=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        FAILURE=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        FAILURE_PREPARE=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        FAILURE_SETUP=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        FAILURE_INITIALIZATION=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        FAILURE_RECOVERY=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        FAILURE_APPLICATION=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        FAILURE_RELEASE=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        OTHER=@('ZERO','ONE','MULTIPLE','UNAVAILABLE')
        FRAMING=@('STANDARD','LEADING_EMPTY','EXTRA_EMPTY','BARE_CR','OTHER','UNAVAILABLE')
        STDERR=@('EMPTY','PRESENT','UNAVAILABLE')
    }
    $captureShown=0
    foreach($key in $captureVector.Keys){
        $matched=0;$selected=$null
        foreach($value in $captureVector[$key]){
            $literal='PACKAGE_CAPTURE_'+$key+'_'+$value
            $count=@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $literal}).Count
            if($count -gt 0){$matched+=$count;$selected=$literal}
        }
        if($matched -eq 1 -and $captureShown -lt 23){Write-Output $selected;$captureShown++}
    }
    $journalVector=[ordered]@{
        DISCOVERY=@('NONE','ONE','MULTIPLE','INVALID','UNAVAILABLE')
        BINDING=@('VALID','INVALID','UNAVAILABLE')
        CHAIN=@('VALID','INVALID','UNAVAILABLE')
        INTENT=@('SETUP','PREPARE_PROVISION','PROVISION','OBSERVE_PROVISION','PREPARE_AUTH','AUTH','OBSERVE_AUTH','PREPARE_READY','MAIN','RELEASE','RECOVERY','NONE','INVALID','UNAVAILABLE')
        SETTLEMENT=@('PRESENT','ABSENT','INVALID','UNAVAILABLE')
        CAPTURE=@('ABSENT','VALID_JSON','INVALID_JSON','UNAVAILABLE')
        CAPTURE_CANONICAL=@('TRUE','FALSE','UNAVAILABLE')
        CAPTURE_PARSE_REASON=@('INPUT_LIMIT','JSON_GRAMMAR','DEPTH','PAIRS','DUPLICATE','ROOT_KEYS','PROCESS_KEYS','STATUS_TYPE_OR_ENUM','EXIT_TYPE_OR_RANGE','BOOLEAN_TYPES','STDOUT_TYPE_OR_LIMIT','STDERR_TYPE_OR_LIMIT','VALID','UNAVAILABLE')
        CAPTURE_STATUS=@('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED','UNAVAILABLE')
        CAPTURE_RETIREMENT=@('RETIRED','UNCONFIRMED','UNAVAILABLE')
        CAPTURE_STDOUT=@('PASS','FAILURE','OTHER','EMPTY','UNAVAILABLE')
        CAPTURE_STDERR=@('INITIALIZE_FAILURE','OBSERVER_FAILURE','OTHER','EMPTY','UNAVAILABLE')
        ERROR=@('RESTORE_CONTROL','RESTORE_DESCENDANT','RESTORE_FILE','RESTORE_LIMIT','RESTORE_OWNER','RESTORE_READBACK','RESTORE_RESULT','RESTORE_SCHEMA','RESTORE_SOURCE','PACKAGE_STATE_REJECTED','LAUNCH_JOURNAL_REJECTED','ENOENT','UNCLASSIFIED','NONE')
    }
    $journalShown=0
    foreach($key in $journalVector.Keys){
        $matched=0;$selected=$null
        foreach($value in $journalVector[$key]){$literal='PACKAGE_JOURNAL_'+$key+'_'+$value;$count=@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $literal}).Count;if($count -gt 0){$matched+=$count;$selected=$literal}}
        if($matched -eq 1 -and $journalShown -lt 13){Write-Output $selected;$journalShown++}
    }
    $observerVector=[ordered]@{
        PHASE=@('ENVIRONMENT','LAYOUT','CONTROL','OWNER','PROOF_SHAPE','DERIVED_CORE','ORIGINALS','OBSERVERS','PACKAGE','ASAR_PHYSICAL','OUTSIDE','VERSIONS','INIT_CONTROL','INIT_DIALOG','INIT_REQUIRE','INIT_RECORD','MAIN_REQUIRE','MAIN_OPERATION','UNKNOWN')
        REASON=@('PACKAGE_ENVIRONMENT','PACKAGE_CONTROL','PACKAGE_OWNER','PACKAGE_PROOF','PACKAGE_VERSION','PACKAGE_DIALOG','RESTORE_OWNER','PACKAGE_REJECTED','PACKAGE_ASAR_WITNESS','RESTORE_FILE','RESTORE_LIMIT','RESTORE_SCHEMA','RESTORE_READBACK','ENOENT','EACCES','EPERM','MODULE_NOT_FOUND','ERR_REQUIRE_ESM','SYNTAX_ERROR','TYPE_ERROR','UNCLASSIFIED')
    }
    $observerShown=0
    foreach($key in $observerVector.Keys){
        $matched=0;$selected=$null
        foreach($value in $observerVector[$key]){$literal='PACKAGE_OBSERVER_'+$key+'_'+$value;$count=@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $literal}).Count;if($count -gt 0){$matched+=$count;$selected=$literal}}
        if($matched -eq 1 -and $observerShown -lt 2){Write-Output $selected;$observerShown++}
    }
}
function Node-Control([string]$name,[string[]]$arguments,[string]$marker){$script:allClean=$false;$p=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot $name))+$arguments) 120000 @{};$script:allClean=Retired $p;if(-not $script:allClean -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0 -or (($p.Stdout -replace '\r\n',"`n").TrimEnd("`n") -cne $marker)){Show-ControlDiagnostic $p $marker};Require $p $marker}
function Validate([string[]]$arguments){$script:allClean=$false;$p=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_package.py'))+$arguments) 120000 @{};$script:allClean=Retired $p;Require $p 'PACKAGE_VALIDATION_PASS'}
function Show-CoreDiagnostic($p){
    $coreVector=[ordered]@{
        FAILURE=@('PREPARE_FAILED','SETUP_FAILED','INITIALIZATION_FAILED','APPLICATION_FAILED','RELEASE_FAILED','RECOVERY_FAILED')
        REASON=@('APPLICATION_FAILED','CANONICAL_PATH_REQUIRED','DIRECTORY_REJECTED','ENVIRONMENT_KEY_REJECTED','ENVIRONMENT_OVERRIDE','EXECUTABLE_REJECTED','FULL_PATH_REQUIRED','GUARD_REJECTED','HELPER_CHANGED','INITIALIZATION_FAILED','JOURNAL_LIMIT','LAUNCH_COUNT','MAINTENANCE_REJECTED','NODE_CHANGED','NODE_MISSING','PRELOADED_HELPER_REJECTED','PRIVATE_FILE_LIMIT','PRIVATE_FILE_REJECTED','RECOVERY_ARGUMENT_REJECTED','RECOVERY_SELECTION','RESTORED_MAINTENANCE_REQUIRED','RETIREMENT_UNCONFIRMED','ROOT_OWNER_CHANGED','ROOT_OWNER_REJECTED','RUNTIME_CHANGED','RUNTIME_MANIFEST_CHANGED','RUNTIME_MANIFEST_REJECTED','STAGE_FAILED','STATE_REJECTED','STORE_NAME','WINDOWS_REQUIRED','UNCLASSIFIED')
        TYPE=@('RUNTIME','METHOD','PARAMETER','COMMAND','OTHER')
        SEQUENCE=@('NONE','01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16')
        OPERATION=@('FULL_PATH','DIRECTORY','READ','WRITE','RESERVE','CHILD','SUCCESS','JOURNAL','CAPTURE','JOURNALED','CONTROL','OUTSIDE','LAUNCHER','UNKNOWN')
        ERROR_ID=@('RuntimeException','MethodInvocationException','ParameterBindingException','CommandNotFoundException','UNKNOWN')
    }
    $shown=0
    foreach($key in $coreVector.Keys){
        $matches=0;$selected=$null
        foreach($value in $coreVector[$key]){$literal='PACKAGE_CORE_'+$key+'_'+$value;$count=@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $literal}).Count;if($count -gt 0){$matches+=$count;$selected=$literal}}
        if($matches -eq 1 -and $shown -lt 6){Write-Output $selected;$shown++}
    }
}
function Launcher([string[]]$arguments){
 $original=[Environment]::GetEnvironmentVariables('Process')
 foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')){throw 'OVERRIDE'}}
 $allowed=@('SystemRoot','WINDIR','SystemDrive','PATHEXT','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')
 try{foreach($key in @($original.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')};foreach($key in $original.Keys){if($allowed -contains [string]$key){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}};[Environment]::SetEnvironmentVariable('PATH',[Environment]::SystemDirectory,'Process');return [Fonesi.Phase00.NativeProbe]::Run($powershell,$arguments,120000,10000,32768)}finally{$current=[Environment]::GetEnvironmentVariables('Process');foreach($key in @($current.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')};foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
}
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'WINDOWS'}
 $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
 if((Get-FileHash $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89' -or ('Fonesi.Phase00.NativeProbe' -as [type])){throw 'HELPER'}
 Add-Type -Path $helper
 if(-not (Test-Path -LiteralPath $base)){[Fonesi.Phase00.NativeProbe]::ReserveDirectory($base)}
 Assert-PlainDirectory $base;$baseVerified=$true
 if(Test-Path -LiteralPath (Join-Path $base 'unvalidated.json')){throw 'PRIOR_REPORT'}
 $owner=New-OwnedRun $base
 $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe'
 if((Get-FileHash $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE'}
 $python=$env:FOUNDATION_PYTHON_EXE;$pi=Get-Item -LiteralPath $python -Force
 if($pi.PSIsContainer -or ($pi.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'PYTHON'}
 $powershell=Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell/v1.0/powershell.exe';$ps=Get-Item -LiteralPath $powershell -Force
 if($ps.PSIsContainer -or ($ps.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'POWERSHELL'}
 $phase='RELOCATE';$failure='PACKAGE_FAILED';$allClean=$false;$extracted=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_package.py'),'extract',$owner.Path)) 120000 @{};$allClean=Retired $extracted;Require $extracted 'PACKAGE_EXTRACTED';Node-Control 'package-launch-driver.cjs' @('relocate',$owner.Path) 'PACKAGE_RELOCATED'
 $info=Read-Private 'package-info.json';if($info.sourceHead -cne $env:GITHUB_SHA){throw 'HEAD'}
 $report.sourceHead=$info.sourceHead;$report.sourceTree=$info.sourceTree;$report.package=$info.package;$report.relocatedCopyVerified=$true
 $package=Join-Path $owner.Path 'relocated-package'
 $phase='NEGATIVES';$failure='NEGATIVE_FAILED';$allClean=$false
 $negative=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'package-control.cjs'),'negatives',$owner.Path,(Join-Path $owner.Path 'package-negative'))) 120000 @{}
 $allClean=Retired $negative;Write-Private (Join-Path $owner.Path 'package-negatives-capture.json') (Evidence $negative);Require $negative 'PACKAGE_NEGATIVES_VERIFIED';Validate @('negative',$owner.Path);$report.negatives=Read-Private 'package-negatives-public.json'
 foreach($stage in $stages){
  $phase='PREPARE';$failure='NATIVE_STAGE_FAILED';Node-Control 'package-state-control.cjs' @('prepare',$owner.Path,$package,$stage) 'PACKAGE_STATE_PREPARED'
  Node-Control 'package-launch-driver.cjs' @('prepare',$owner.Path,$stage) 'PACKAGE_LAUNCH_COPY_PREPARED'
  $seed=Read-Private ('package-stage-'+$stage+'.json');$entry=Join-Path $owner.Path ('package-probe-'+$stage+'/Launch.ps1')
  $arguments=[Collections.Generic.List[string]]::new();foreach($a in @('-NoProfile','-NonInteractive','-File',$entry)){$arguments.Add($a)}
  if($stage -cin @('first-cancel','first-launch')){$arguments.Add('-CreateUnder');$arguments.Add($seed.createParent)}elseif($stage.StartsWith('restored-')){$arguments.Add('-Store');$arguments.Add($seed.selectedStore)}else{$arguments.Add('-Root');$arguments.Add($seed.managedRoot)}
  if($stage -ceq 'recover-retained'){$arguments.Add('-RecoverRetainedLaunch');$arguments.Add($seed.retainedLaunchId)}
  if($stage -cin @('restore-cancel','restore-confirm','restored-maintenance')){$arguments.Add('-Maintenance');$arguments.Add('--maintenance=restore-to-new')}
  $guard=$null;$phase='NATIVE';$allClean=$false
  try{if($stage -ceq 'guard-denied'){$guard=[IO.File]::Open((Join-Path $seed.managedRoot '.launcher-guard'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)};$capture=Launcher $arguments.ToArray()}finally{if($null -ne $guard){$guard.Dispose()}}
  $allClean=Retired $capture
  Show-CoreDiagnostic $capture
  if($capture.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED')){Write-Output ('PACKAGE_PROCESS_'+$capture.Status)}
  Write-Private (Join-Path $owner.Path ('package-capture-'+$stage+'.json')) (Evidence $capture)
  if(-not $allClean){throw 'RETIREMENT'}
  $phase='OBSERVE';Node-Control 'package-state-control.cjs' @('observe',$owner.Path,$package,$stage) 'PACKAGE_STATE_OBSERVED'
  $phase='VALIDATE';$failure='STAGE_VALIDATION_FAILED';Validate @('stage',$owner.Path,$stage);$report.stages[$stage]=Read-Private ('package-public-'+$stage+'.json')
 }
 $phase='ORIGINAL';Node-Control 'package-launch-driver.cjs' @('verify-original',$owner.Path) 'PACKAGE_ORIGINAL_VERIFIED';$report.originalPackageUnchanged=$true;$report.dataOutsidePackage=$true
 $phase='CLEANUP';$failure='CLEANUP_FAILED';if(-not $allClean){throw 'RETIREMENT'};Node-Control 'package-launch-driver.cjs' @('cleanup',$owner.Path) 'PACKAGE_OWNED_CLEANED';$report.directoryCleanup=$true;$failure=$null
}catch{
 if($stage -cin $stages){Write-Output ('PACKAGE_STAGE_'+$stage.ToUpperInvariant().Replace('-','_'))}
 if($phase -cin @('INITIALIZE','RELOCATE','NEGATIVES','PREPARE','NATIVE','OBSERVE','VALIDATE','ORIGINAL','CLEANUP')){Write-Output ('PACKAGE_PHASE_'+$phase)}
}finally{
 $report.failure=$failure
 if($baseVerified){Write-Private (Join-Path $base 'unvalidated.json') $report;Write-Output 'PACKAGE_RAW_EVIDENCE_WRITTEN'}
}
if($null -ne $failure){exit 1}
