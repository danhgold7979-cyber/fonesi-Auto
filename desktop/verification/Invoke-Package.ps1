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
function Node-Control([string]$name,[string[]]$arguments,[string]$marker){$script:allClean=$false;$p=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot $name))+$arguments) 120000 @{};$script:allClean=Retired $p;Require $p $marker}
function Validate([string[]]$arguments){$script:allClean=$false;$p=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_package.py'))+$arguments) 120000 @{};$script:allClean=Retired $p;Require $p 'PACKAGE_VALIDATION_PASS'}
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
