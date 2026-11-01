# Four serialized verification-only launches; no server/device operation or implicit rollback grant.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.retained-host-runtime'
$owner=$null;$allClean=$true;$baseVerified=$false;$phase='PREPARE'
$report=[ordered]@{version=1;scope='HOSTED_RETAINED_ROLLBACK_PACKAGE_ONLY';excludedVaultContext='P106_UNMET_NOT_RERUN';managedEvidence=$null;package=$null;bootstrap=$null;stages=[ordered]@{SEED=$null;UPGRADE=$null;ROLLBACK=$null;REOPEN=$null};originalArchivesUnchanged=$false;originalSourceUnchanged=$false;originalPackageUnchanged=$false;directoryCleanup=$false;failure=$null}
function Retired($p){return ($p.CleanupComplete -and $null -ne $p.ExitCode -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))}
function Evidence($p){return [ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated}}
function PlainFile([string]$file,[long]$limit){$i=Get-Item -LiteralPath $file -Force;if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -lt 1 -or $i.Length -gt $limit -or $i.FullName -cne [IO.Path]::GetFullPath($file)){throw 'FILE_REJECTED'}}
function Write-Private([string]$file,$value){Assert-PlainDirectory ([IO.Path]::GetDirectoryName($file));$bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Depth 16 -Compress));if($bytes.Length -gt 65536){throw 'PRIVATE_LIMIT'};$s=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()}}
function Read-Private([string]$file){PlainFile $file 65536;$s=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{$bytes=New-Object byte[] 65537;$used=0;while($used -lt $bytes.Length){$n=$s.Read($bytes,$used,$bytes.Length-$used);if($n -eq 0){break};$used+=$n};if($used -gt 65536){throw 'PRIVATE_LIMIT'};return ([Text.Encoding]::UTF8.GetString($bytes,0,$used)|ConvertFrom-Json)}finally{$s.Dispose()}}
function Require($p,[string]$marker){if(-not (Retired $p) -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0 -or $p.Stdout.Replace("`r`n","`n") -cne ($marker+"`n")){throw 'CONTROL_FAILED'}}
function Show-Fixed($p){
 $fields=[ordered]@{PHASE=@('PREPARE','ADMISSION','SCHEMA','SETUP','VERSION','RETIRE','CLOSE','AUDIT','INSPECT','CLEANUP','DIAGNOSE','ARGUMENT');REASON=@('SCHEMA','OWNER','SOURCE','BUILD','COPY','ARCHIVE','PACKAGE','STAGE','JOURNAL','CAPTURE','AUTH','DATABASE','LEDGER','AUDIT','HISTORY','INVENTORY','LIMIT','CONTEXT','DIALOG','TIMEOUT','RESPONSE','RETIREMENT','MAIN','UNCLASSIFIED')}
 foreach($slot in $fields.Keys){$found=@();foreach($value in $fields[$slot]){$literal='RETAINED_ROLLBACK_'+$slot+'_'+$value;$matches=@($p.Stderr.Replace("`r`n","`n") -split "`n"|Where-Object {$_ -ceq $literal});foreach($m in $matches){$found+=,$m}};if($found.Count -eq 1){Write-Output $found[0]}}
 foreach($literal in @('PERSISTENCE_DESKTOP_PREPARE_FAILED','PERSISTENCE_DESKTOP_SETUP_FAILED','PERSISTENCE_DESKTOP_INITIALIZATION_FAILED','PERSISTENCE_DESKTOP_APPLICATION_FAILED','PERSISTENCE_DESKTOP_RELEASE_FAILED','PERSISTENCE_DESKTOP_RECOVERY_FAILED')){if(@($p.Stdout.Replace("`r`n","`n") -split "`n"|Where-Object {$_ -ceq $literal}).Count -eq 1){Write-Output $literal}}
}
function Control([string]$action,[string]$stage){
 Assert-OwnedRun $owner
 $list=@((Join-Path $PSScriptRoot 'retained-rollback-control.cjs'),$action,$owner.Path)
 if($action -ceq 'prepare'){$list+=@((Join-Path $desktop '.platform-tools-input/platform-tools_r36.0.0-win.zip'),(Join-Path $desktop '.platform-tools-input/platform-tools_r37.0.1-win.zip'),$env:GITHUB_SHA,$env:PACKAGE_SOURCE_TREE)}elseif($action -cin @('prepare-stage','inspect','diagnose')){$list+=,$stage}
 $script:allClean=$false;$p=Invoke-OwnedChild $node ([string[]]$list) 120000 @{};$script:allClean=Retired $p;Show-Fixed $p;Require $p 'RETAINED_ROLLBACK_CONTROL_PASS'
}
try{
 if($args.Count -ne 0 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitOperatingSystem){throw 'ARGUMENT_REJECTED'}
 Assert-PlainDirectory $desktop
 $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'));PlainFile $helper 1048576
 if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'){throw 'HELPER_CHANGED'}
 if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER'};Add-Type -Path $helper
 if(Test-Path -LiteralPath $base){throw 'BASE_EXISTS'};[Fonesi.Phase00.NativeProbe]::ReserveDirectory($base);Assert-PlainDirectory $base;$baseVerified=$true
 $root=Join-Path $base 'r';[Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
 $token=[guid]::NewGuid().ToString();$s=[IO.File]::Open((Join-Path $root '.owner'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$b=[Text.Encoding]::UTF8.GetBytes($token);$s.Write($b,0,$b.Length);$s.Flush($true)}finally{$s.Dispose()}
 $owner=[pscustomobject]@{Parent=$base;Path=$root;Token=$token};Assert-OwnedRun $owner
 $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe';PlainFile $node 134217728
 if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_REJECTED'}
 $python=$env:FOUNDATION_PYTHON_EXE;if(-not [IO.Path]::IsPathRooted($python)){throw 'PYTHON_REJECTED'};PlainFile $python 134217728
 $phase='MANAGED';$allClean=$false;$gate=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_retained_rollback.py'),'managed-gate',$root)) 30000 @{};$allClean=Retired $gate;Require $gate 'RETAINED_ROLLBACK_MANAGED_PASS'
 $report.managedEvidence=Read-Private (Join-Path $root 'managed-evidence.json')
 $phase='INSTALL';$runtime=Join-Path $desktop '.runtime';if(Test-Path -LiteralPath $runtime){throw 'RUNTIME_EXISTS'};[Fonesi.Phase00.NativeProbe]::ReserveDirectory($runtime)
 $allClean=$false;$installed=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'install-electron.mjs'))) 120000 @{};$allClean=Retired $installed
 if(-not $allClean -or $installed.Status -cne 'SUCCESS' -or $installed.ExitCode -ne 0 -or $installed.Stdout.Replace("`r`n","`n") -cne "FOUNDATION_BUILD_VERIFIED`nFOUNDATION_OFFICIAL_INSTALL_VERIFIED`n"){throw 'INSTALL_FAILED'}
 if($env:GITHUB_SHA -cnotmatch '\A[0-9a-f]{40}\z' -or $env:PACKAGE_SOURCE_TREE -cnotmatch '\A[0-9a-f]{40}\z' -or $env:PACKAGE_NPM_VERSION -cnotmatch '\A[0-9]+\.[0-9]+\.[0-9]+\z'){throw 'PACKAGE_INPUT'}
 $allClean=$false;$attest=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'attest-runtime',$desktop,$env:GITHUB_SHA)) 120000 @{};$allClean=Retired $attest;Require $attest 'PERSISTENCE_RUNTIME_ATTESTED'
 $license=Join-Path $desktop '.package-build/node-LICENSE';PlainFile $license 1048576
 if((Get-FileHash -LiteralPath $license -Algorithm SHA256).Hash -ine '5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace'){throw 'PACKAGE_LICENSE'}
 $allClean=$false;$built=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'package-build-entry.mjs'),$env:PACKAGE_NPM_VERSION,$env:GITHUB_SHA,$env:PACKAGE_SOURCE_TREE,$license)) 120000 @{};$allClean=Retired $built;Require $built 'PACKAGE_CANDIDATE_WRITTEN'
 $allClean=$false;$extracted=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_package.py'),'extract',$root)) 120000 @{};$allClean=Retired $extracted;Require $extracted 'PACKAGE_EXTRACTED'
 $phase='CONTROL';Control 'prepare' '';Assert-OwnedRun $owner
 $packageBinding=Read-Private (Join-Path $root 'package-binding.json');$report.package=[ordered]@{sourceHead=$packageBinding.sourceHead;sourceTree=$packageBinding.sourceTree;zipSha256=$packageBinding.zipSha256;zipBytes=$packageBinding.zipBytes;manifestSha256=$packageBinding.manifestSha256}
 $powershell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe';PlainFile $powershell 8388608
 $index=0
 foreach($stage in @('SEED','UPGRADE','ROLLBACK','REOPEN')){
  $phase='CONTROL';Control 'prepare-stage' $stage
  $plan=Read-Private (Join-Path $root ('stage-'+$stage+'.json'))
  $keys=@($plan.PSObject.Properties.Name);if(($keys -join ',') -cne 'version,stage,managedRoot,wrapper,previousLaunchIds,originalMainSha256,derivedMainSha256,expectedTargetVersion,expectedActiveVersion,installationRevision,archiveFile' -or $plan.version -ne 1 -or $plan.stage -cne $stage -or $plan.previousLaunchIds.Count -ne $index){throw 'STAGE_REJECTED'}
  foreach($hash in @($plan.originalMainSha256,$plan.derivedMainSha256)){if($hash -cnotmatch '\A[0-9a-f]{64}\z'){throw 'STAGE_REJECTED'}}
  $target=if($stage -ceq 'SEED'){'36.0.0'}else{'37.0.1'};$active=if($stage -ceq 'UPGRADE'){'37.0.1'}else{'36.0.0'};$archive=if($stage -ceq 'SEED'){'official-36.zip'}elseif($stage -ceq 'UPGRADE'){'official-37.zip'}else{$null}
  if($plan.expectedTargetVersion -cne $target -or $plan.expectedActiveVersion -cne $active -or $plan.installationRevision -ne [Math]::Min($index+1,3) -or $plan.archiveFile -cne $archive){throw 'STAGE_REJECTED'}
  foreach($id in $plan.previousLaunchIds){if($id -cnotmatch '\A[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\z'){throw 'STAGE_REJECTED'}}
  $wrapper=if($stage -ceq 'SEED'){'scripts-SEED/Invoke-Desktop.instrumented.ps1'}else{'scripts-PACKAGE/Invoke-Package.instrumented.ps1'}
  if($plan.wrapper -cne $wrapper){throw 'WRAPPER_REJECTED'}
  $launch=@('-NoProfile','-NonInteractive','-File',(Join-Path $root $wrapper))
  if($stage -ceq 'SEED'){if($null -ne $plan.managedRoot){throw 'STAGE_REJECTED'};$launch+=@('-CreateUnder',(Join-Path $root 'first-use'))}else{
   $managed=[IO.Path]::GetFullPath($plan.managedRoot);if($managed -cne $plan.managedRoot -or [IO.Path]::GetDirectoryName($managed) -cne (Join-Path $root 'first-use') -or [IO.Path]::GetFileName($managed) -cnotmatch '\AFonesi-Auto-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\z'){throw 'ROOT_REJECTED'}
   $launch+=@('-Root',$managed)
  }
  $launch+=,'-EnableRetainedHost';Assert-OwnedRun $owner
  $phase='NATIVE';$allClean=$false;$original=[Environment]::GetEnvironmentVariables('Process')
  try{
   foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')){throw 'ENVIRONMENT_REJECTED'}}
   $allowed=@('SystemRoot','WINDIR','SystemDrive','PATHEXT','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')
   foreach($key in @($original.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')};foreach($key in $original.Keys){if($allowed -contains [string]$key){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
   # SOURCE discovers node.exe before root admission; PACKAGE resolves its own absolute runtime.
   if($stage -ceq 'SEED'){
    PlainFile $node 134217728
    if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_REJECTED'}
    [Environment]::SetEnvironmentVariable('PATH',([IO.Path]::GetDirectoryName($node)+';'+[Environment]::SystemDirectory),'Process')
   }else{[Environment]::SetEnvironmentVariable('PATH',[Environment]::SystemDirectory,'Process')}
   $native=[Fonesi.Phase00.NativeProbe]::Run($powershell,[string[]]$launch,240000,10000,32768)
  }finally{foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')};foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
  $allClean=Retired $native;$report.stages[$stage]=[ordered]@{observation=$null;process=(Evidence $native)}
  Write-Private (Join-Path $root ('launcher-'+$stage+'-capture.json')) ([ordered]@{process=(Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
  Show-Fixed $native
  $status='INVALID';if($native.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED')){$status=$native.Status};Write-Output ('RETAINED_ROLLBACK_PROCESS_'+$stage+'_'+$status)
  if($allClean){Control 'diagnose' $stage}
  if(-not $allClean -or $native.Status -cne 'SUCCESS' -or $native.ExitCode -ne 0 -or $native.Stdout.Replace("`r`n","`n") -cnotin @("PERSISTENCE_DESKTOP_CLOSED`n","`nPERSISTENCE_DESKTOP_CLOSED`n")){throw 'NATIVE_FAILED'}
  $phase='CONTROL';Control 'inspect' $stage
  $report.stages[$stage].observation=Read-Private (Join-Path $root ('rollback-'+$stage+'-result.json'))
  if($stage -ceq 'SEED'){$report.bootstrap=Read-Private (Join-Path $root 'bootstrap.json')}
  $index++
 }
 $phase='VALIDATION';$allClean=$false;$validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_retained_rollback.py'),'stage',$root)) 30000 @{};$allClean=Retired $validated;Require $validated 'RETAINED_ROLLBACK_STAGE_VALIDATED'
 $public=Read-Private (Join-Path $root 'public.json');foreach($key in @($report.Keys)){if($key -cne 'directoryCleanup'){$report[$key]=$public.$key}}
 $phase='CLEANUP';Control 'cleanup' '';Remove-VerifiedOwnedRun $owner $allClean;$report.directoryCleanup=$true
}catch{
 $report.failure=if($phase -cin @('MANAGED','INSTALL','CONTROL','NATIVE','VALIDATION','CLEANUP')){$phase+'_FAILED'}else{'PREPARE_FAILED'}
 Write-Output ('RETAINED_ROLLBACK_STAGE_'+$phase)
}finally{if($baseVerified){try{Write-Private (Join-Path $base 'unvalidated.json') $report;Write-Output 'RETAINED_ROLLBACK_REPORT_WRITTEN'}catch{Write-Output 'RETAINED_ROLLBACK_REPORT_FAILED'}}}
