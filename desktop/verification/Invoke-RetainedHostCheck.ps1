# SOURCE retained VERSION-only check. Injected setup answers; no server or device operations.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.retained-host-runtime'
$owner=$null;$allClean=$true;$baseVerified=$false;$phase='PREPARE'
$report=[ordered]@{version=1;scope='HOSTED_RETAINED_VERSION_SOURCE_ONLY';excludedVaultContext='P106_UNMET_NOT_RERUN';bootstrap=$null;observation=$null;process=$null;originalArchiveUnchanged=$false;originalSourceUnchanged=$false;directoryCleanup=$false;failure=$null}
function Retired($p){return ($p.CleanupComplete -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))}
function Evidence($p){return [ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated}}
function Write-Private([string]$file,$value){Assert-PlainDirectory ([IO.Path]::GetDirectoryName($file));$bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Depth 16 -Compress));if($bytes.Length -gt 65536){throw 'PRIVATE_LIMIT'};$s=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()}}
function Read-Private([string]$file){$i=Get-Item -LiteralPath $file -Force;if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -gt 65536){throw 'PRIVATE_LIMIT'};return ([IO.File]::ReadAllText($file)|ConvertFrom-Json)}
function Require($p,[string]$marker){if(-not (Retired $p) -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0 -or (($p.Stdout -replace '\r\n',"`n").TrimEnd("`n")) -cne $marker){throw 'CONTROL_FAILED'}}
function Show-Control($p){
 $known=@('RETAINED_HOST_CONTROL_REJECTED','RETAINED_HOST_ARCHIVE','RETAINED_HOST_SOURCE_CHANGED','RETAINED_HOST_TRANSFORM','RETAINED_HOST_BUILD','RETAINED_HOST_COPY','RETAINED_HOST_RETIREMENT','RETAINED_HOST_CAPTURE','RETAINED_HOST_OWNER','RETAINED_HOST_PARENT','RETAINED_HOST_JOURNAL','RETAINED_HOST_AUTH','RETAINED_HOST_DIALOG','RETAINED_HOST_MAIN','RETAINED_HOST_LEASE','RETAINED_HOST_SCHEMA','RETAINED_HOST_RESULT','RETAINED_HOST_INVENTORY','RETAINED_HOST_LIMIT','RECIPIENT_SETUP_SCHEMA','RECIPIENT_SETUP_RESULT','RECIPIENT_SETUP_OWNER','RECIPIENT_SETUP_LIMIT','FLEET_UI_SCHEMA4','RECOVERY_REQUIRED','LAUNCH_JOURNAL_REJECTED','PACKAGE_STATE_REJECTED','RESTORE_SCHEMA','ENOENT','EACCES','EPERM','UNCLASSIFIED')
 $vector=[ordered]@{PHASE=@('PREPARE','VERIFY_COPY','INSPECT','CLEANUP','DIAGNOSE','ARGUMENT');REASON=$known}
 foreach($key in $vector.Keys){$count=0;$found=$null;foreach($value in $vector[$key]){$literal='RETAINED_HOST_CONTROL_'+$key+'_'+$value;$n=@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $literal}).Count;if($n -gt 0){$count+=$n;$found=$literal}};if($count -eq 1){Write-Output $found}}
 $capture=[ordered]@{TARGET=@('OUTER','PROVISION','AUTH','MAIN','UNKNOWN');SCHEMA=@('VALID','INVALID');STATUS=@('SUCCESS','NONZERO_EXIT','OTHER','UNAVAILABLE');EXIT=@('ZERO','NONZERO','NULL','UNAVAILABLE');RETIRED=@('TRUE','FALSE','UNAVAILABLE');TRUNCATED=@('TRUE','FALSE','UNAVAILABLE');EXPECTED=@('ZERO','EXACT','OTHER','UNAVAILABLE');ORDER=@('MATCH','MISMATCH','UNAVAILABLE');LEADING=@('ZERO','ONE','MULTIPLE','UNAVAILABLE');TRAILING=@('ZERO','ONE','MULTIPLE','UNAVAILABLE');INTERIOR=@('TRUE','FALSE','UNAVAILABLE');UNKNOWN=@('TRUE','FALSE','UNAVAILABLE');FAILURE=@('ZERO','ONE','MULTIPLE','UNAVAILABLE');STDERR_FAILURE=@('TRUE','FALSE','UNAVAILABLE')}
 foreach($key in $capture.Keys){$count=0;$found=$null;foreach($value in $capture[$key]){$literal='RETAINED_HOST_CAPTURE_'+$key+'_'+$value;$n=@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $literal}).Count;if($n -gt 0){$count+=$n;$found=$literal}};if($count -eq 1){Write-Output $found}}
}
function Node-Control([string]$action){$script:allClean=$false;$argsList=@((Join-Path $PSScriptRoot 'retained-host-control.cjs'),$action,$owner.Path);if($action -ceq 'prepare'){$argsList+= (Join-Path $desktop '.platform-tools-input/platform-tools_r37.0.1-win.zip')};$p=Invoke-OwnedChild $node ([string[]]$argsList) 120000 @{};$script:allClean=Retired $p;if(-not $script:allClean -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0){Show-Control $p};Require $p 'RETAINED_HOST_CONTROL_PASS'}
function Show-Native($p){
 $status='INVALID';if($p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED')){$status=$p.Status};Write-Output ('RETAINED_HOST_PROCESS_'+$status)
 foreach($known in @('PERSISTENCE_DESKTOP_PREPARE_FAILED','PERSISTENCE_DESKTOP_SETUP_FAILED','PERSISTENCE_DESKTOP_INITIALIZATION_FAILED','PERSISTENCE_DESKTOP_APPLICATION_FAILED','PERSISTENCE_DESKTOP_RELEASE_FAILED','PERSISTENCE_DESKTOP_RECOVERY_FAILED')){if(@($p.Stdout -split '\r?\n'|Where-Object {$_ -ceq $known}).Count -eq 1){Write-Output $known}}
}
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitOperatingSystem){throw 'WINDOWS_REQUIRED'}
 Assert-PlainDirectory $desktop
 $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
 if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'){throw 'HELPER_CHANGED'}
 if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER_REJECTED'};Add-Type -Path $helper
 if(Test-Path -LiteralPath $base){throw 'BASE_EXISTS'};[Fonesi.Phase00.NativeProbe]::ReserveDirectory($base);Assert-PlainDirectory $base;$baseVerified=$true
 $root=Join-Path $base ('run-'+[guid]::NewGuid().ToString());[Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
 $token=[guid]::NewGuid().ToString();$stream=[IO.File]::Open((Join-Path $root '.owner'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$b=[Text.Encoding]::UTF8.GetBytes($token);$stream.Write($b,0,$b.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 $owner=[pscustomobject]@{Parent=$base;Path=$root;Token=$token};Assert-OwnedRun $owner
 $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe';$n=Get-Item -LiteralPath $node -Force
 if($n.PSIsContainer -or ($n.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_REJECTED'}
 $python=$env:FOUNDATION_PYTHON_EXE;$p=Get-Item -LiteralPath $python -Force;if(-not [IO.Path]::IsPathRooted($python) -or $p.PSIsContainer -or ($p.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'PYTHON_REJECTED'}
 $phase='INSTALL';$runtime=Join-Path $desktop '.runtime'
 if(Test-Path -LiteralPath $runtime){throw 'RUNTIME_EXISTS'};[Fonesi.Phase00.NativeProbe]::ReserveDirectory($runtime)
 $allClean=$false;$installed=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'install-electron.mjs'))) 120000 @{};$allClean=Retired $installed
 if(-not $allClean -or $installed.Status -cne 'SUCCESS' -or $installed.ExitCode -ne 0 -or $installed.Stdout.Replace("`r`n","`n") -cne "FOUNDATION_BUILD_VERIFIED`nFOUNDATION_OFFICIAL_INSTALL_VERIFIED`n"){throw 'INSTALL_FAILED'}
 if($env:GITHUB_SHA -cnotmatch '\A[0-9a-f]{40}\z'){throw 'HEAD_REJECTED'}
 $allClean=$false;$attest=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'persistence-control.cjs'),'attest-runtime',$desktop,$env:GITHUB_SHA)) 120000 @{};$allClean=Retired $attest;Require $attest 'PERSISTENCE_RUNTIME_ATTESTED'
 $phase='CONTROL';Node-Control 'prepare';Node-Control 'verify-copy';Assert-OwnedRun $owner
 $powershell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe';$p=Get-Item -LiteralPath $powershell -Force;if($p.PSIsContainer -or ($p.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'POWERSHELL_REJECTED'}
 $phase='NATIVE'
 $launchArgs=@('-NoProfile','-NonInteractive','-File',(Join-Path $root 'Invoke-Desktop.instrumented.ps1'),'-CreateUnder',(Join-Path $root 'first-use'),'-EnableRetainedHost')
 $allClean=$false;$original=[Environment]::GetEnvironmentVariables('Process')
 try{
  foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')){throw 'ENVIRONMENT_REJECTED'}}
  $allowed=@('SystemRoot','WINDIR','SystemDrive','PATH','PATHEXT','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')
  foreach($key in @($original.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')};foreach($key in $original.Keys){if($allowed -contains [string]$key){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
  $native=[Fonesi.Phase00.NativeProbe]::Run($powershell,[string[]]$launchArgs,240000,10000,32768)
 }finally{foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')};foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
 $allClean=Retired $native;Show-Native $native;$report.process=Evidence $native
 Write-Private (Join-Path $root 'launcher-capture.json') ([ordered]@{process=(Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
 if($allClean -and ($native.Status -cne 'SUCCESS' -or $native.ExitCode -ne 0)){
  $allClean=$false;$diagnostic=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'retained-host-control.cjs'),'diagnose',$root)) 30000 @{};$allClean=Retired $diagnostic
  if($allClean -and $diagnostic.Status -ceq 'SUCCESS' -and $diagnostic.ExitCode -eq 0 -and $diagnostic.Stdout.Replace("`r`n","`n") -ceq "RETAINED_HOST_CONTROL_PASS`n"){
   $matches=@($diagnostic.Stderr -split '\r?\n'|Where-Object {$_ -cmatch '\ARETAINED_HOST_PHASE_(PREPARE|MIGRATION|SETUP|ADMISSION|VERSION|RETIRE|CLOSE)\z'})
   if($matches.Count -eq 1 -and @($diagnostic.Stderr -split '\r?\n'|Where-Object {$_ -ceq 'RETAINED_HOST_FAILED'}).Count -eq 1){Write-Output $matches[0];Write-Output 'RETAINED_HOST_FAILED'}
   $slots=[ordered]@{REASON=@('RETAINED_HOST_CONTEXT','RETAINED_HOST_FILE','RETAINED_HOST_SETUP','RETAINED_HOST_TIMEOUT','RETAINED_HOST_DIALOG','RETAINED_HOST_TERMS_NOT_OPENED','RETAINED_HOST_SCHEMA','RETAINED_HOST_INITIAL','RETAINED_HOST_PENDING','RETAINED_HOST_CUSTODY','RETAINED_HOST_RUNTIME','RETAINED_HOST_PARENT','RETAINED_HOST_VERSION','RETAINED_HOST_RETIRE','RETAINED_HOST_CASES','RETAINED_HOST_PROFILE','RETAINED_HOST_MAIN','RETAINED_HOST_CLOSE','OWNER_REVOKED','HOST_FACTORY_REJECTED','HOST_CONTEXT_REJECTED','RECOVERY_REQUIRED','FLEET_UI_SCHEMA4','UNCLASSIFIED');OUTCOME=@('NOT_DISPATCHED','DISPATCHED_UNCONFIRMED','OBSERVED','OUTCOME_UNKNOWN','UNAVAILABLE');CODE=@('OK','INVALID_REQUEST','NOT_AUTHORIZED','BINARY_UNAVAILABLE','BUSY','DEADLINE','NOT_READY','CUSTODY_REJECTED','TRANSPORT_FAILED','INVALID_OBSERVATION','RECOVERY_REQUIRED','CLOSED','INTERNAL_FAILURE','UNAVAILABLE');HELPERSTATE=@('UNCERTAIN','EXITED','RUNNING','NOT_STARTED','UNAVAILABLE');HELPERPHASE=@('ENVIRONMENT','CONTEXT','ASSETS','COMPILE','PARENT','READER','CLOSE','UNAVAILABLE');HELPEREXIT=@('ZERO','NONZERO','NONE','UNAVAILABLE');CONTEXTSITE=@('SITE_01','SITE_02','SITE_03','SITE_04','SITE_05','SITE_06','SITE_07','SITE_08','SITE_09','SITE_10','SITE_11','SITE_12','SITE_13','SITE_14','SITE_15','SITE_16','SITE_17','SITE_18','SITE_19','SITE_20','SITE_21','SITE_22','SITE_23','SITE_24','SITE_25','SITE_26','SITE_27','SITE_28','SITE_29','SITE_30','SITE_31','SITE_32','SITE_33','SITE_34','SITE_35','SITE_36','SITE_37','SITE_38','SITE_39','SITE_40','SITE_41','SITE_42','SITE_43','SITE_44','SITE_45','SITE_46','SITE_47','SITE_48','SITE_49','SITE_50','SITE_51','SITE_52','SITE_53','SITE_54','SITE_55','SITE_56','SITE_57','SITE_58','SITE_59','SITE_60','SITE_61','SITE_62','SITE_63','SITE_64','UNAVAILABLE');CONTEXTCALLER=@('createHostFactory','readHostContext','hostRead','imageDigest','hostRecord','hostPlain','fence','UNAVAILABLE');SYSTEMREGULAR=@('YES','NO','UNAVAILABLE');SYSTEMREPARSE=@('YES','NO','UNAVAILABLE');SYSTEMSINGLELINK=@('YES','NO','UNAVAILABLE');SYSTEMCANONICAL=@('YES','NO','UNAVAILABLE')}
   foreach($slot in $slots.Keys){$found=@($diagnostic.Stderr -split '\r?\n'|Where-Object {$line=$_;@($slots[$slot]|Where-Object {$line -ceq ('RETAINED_HOST_DIAGNOSTIC_'+$slot+'_'+$_)}).Count -eq 1});if($found.Count -eq 1){Write-Output $found[0]}}

  }else{Show-Control $diagnostic}
 }
 Require $native 'PERSISTENCE_DESKTOP_CLOSED'
 $phase='CONTROL';Node-Control 'inspect'
 $phase='VALIDATION';$allClean=$false;$validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_retained_host.py'),'stage',$root)) 30000 @{};$allClean=Retired $validated;Require $validated 'RETAINED_HOST_STAGE_VALIDATED'
 $public=Read-Private (Join-Path $root 'public.json');foreach($key in @($report.Keys)){if($key -cne 'directoryCleanup'){$report[$key]=$public.$key}}
 $phase='CLEANUP';Node-Control 'cleanup';Remove-VerifiedOwnedRun $owner $allClean;$report.directoryCleanup=$true
}catch{
 $report.failure='PREPARE_FAILED';if($phase -cin @('INSTALL','CONTROL','NATIVE','VALIDATION','CLEANUP')){$report.failure=$phase+'_FAILED'}
 if($phase -cin @('PREPARE','INSTALL','CONTROL','NATIVE','VALIDATION','CLEANUP')){Write-Output ('RETAINED_HOST_STAGE_'+$phase)}
}finally{if($baseVerified){try{Write-Private (Join-Path $base 'unvalidated.json') $report;Write-Output 'RETAINED_HOST_REPORT_WRITTEN'}catch{Write-Output 'RETAINED_HOST_REPORT_FAILED'}}}
