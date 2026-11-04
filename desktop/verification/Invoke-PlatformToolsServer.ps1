# Hosted development only; no personal-machine fallback or existing-profile adoption.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot 'WindowsBoundary.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'OwnedFiles.psm1') -Force
$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $desktop '.platform-tools-server-runtime'
$owner=$null;$allClean=$true;$baseVerified=$false;$phase='PREPARE'
function Blank-Scenario {return [ordered]@{process=$null;listenerOwned=$false;hostVersionObserved=$false;endpointReleased=$false;foreignOwnerUnchanged=$false;launchRefused=$false;forcedStop=$false;deadlineObserved=$false;prematureDeathObserved=$false}}
$report=[ordered]@{version=1;scope='HOSTED_ADB_SERVER_DEVELOPMENT_ONLY';candidateSha256='45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99';revision='37.0.1';binaryArchitecture='IA32';hostArchitecture='X64';cases=[ordered]@{archiveVerified=$false;inventoryVerified=$false;sourceBound=$false;suppressionConfigured=$false;nativeProfileOwned=$false;existingProfileRefused=$false;profileCleaned=$false;candidateUnchanged=$false;commandForegroundOnly=$false};scenarios=[ordered]@{occupied=(Blank-Scenario);healthy=(Blank-Scenario);death=(Blank-Scenario);timeout=(Blank-Scenario)};directoryCleanup=$false;failure=$null}
function Retired($p){return ($p.CleanupComplete -and -not $p.StdoutTruncated -and -not $p.StderrTruncated -and $p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT'))}
function Evidence($p){return [ordered]@{status=$p.Status;exitCode=$p.ExitCode;cleanupComplete=$p.CleanupComplete;stdoutTruncated=$p.StdoutTruncated;stderrTruncated=$p.StderrTruncated}}
function Write-Private([string]$file,$value){Assert-PlainDirectory ([IO.Path]::GetDirectoryName($file));$bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Depth 16 -Compress));if($bytes.Length -gt 65536){throw 'PRIVATE_LIMIT'};$s=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()}}
function Read-Private([string]$file){$i=Get-Item -LiteralPath $file -Force;if($i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $i.Length -gt 65536){throw 'PRIVATE_LIMIT'};return ([IO.File]::ReadAllText($file)|ConvertFrom-Json)}
function Require($p,[string]$marker){if(-not (Retired $p) -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0 -or (($p.Stdout -replace '\r\n',"`n").TrimEnd("`n")) -cne $marker){throw 'CONTROL_FAILED'}}
function Node-Control([string]$action){
 $script:allClean=$false;$p=Invoke-OwnedChild $node ([string[]]@((Join-Path $PSScriptRoot 'platform-tools-server-control.cjs'),$action,$owner.Path)) 30000 @{};$script:allClean=Retired $p
 if(-not $script:allClean -or $p.Status -cne 'SUCCESS' -or $p.ExitCode -ne 0){Show-ControlDiagnostic $p}
 Require $p 'P202_CONTROL_PASS'
}
function Show-ControlDiagnostic($p){
 $vector=[ordered]@{PHASE=@('PREPARE','VERIFY','CLEANUP','ARGUMENT');REASON=@('P202_ARGUMENT','P202_OWNER','P202_CHANGED','P202_LIMIT','P202_INVENTORY','P202_CANDIDATE','P202_RETIREMENT','PLATFORM_TOOLS_FILES_REJECTED','RESTORE_OWNER','RESTORE_FILE','RESTORE_LIMIT','RESTORE_READBACK','ENOENT','EACCES','EPERM','EEXIST','ENOTEMPTY','UNCLASSIFIED')}
 $shown=0;foreach($kind in $vector.Keys){$count=0;$selected=$null;foreach($value in $vector[$kind]){$literal='P202_CONTROL_'+$kind+'_'+$value;$n=@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $literal}).Count;if($n -gt 0){$count+=$n;$selected=$literal}};if($count -eq 1 -and $shown -lt 2){Write-Output $selected;$shown++}}
}
function Show-NativeDiagnostic($p){
 $vector=[ordered]@{
 PHASE=@('ADMISSION','HELPER','SERVER','REPORT')
 FAILURE=@('PREFLIGHT_FAILED','PROFILE_REJECTED','SERVER_FAILED','RETIREMENT_FAILED','CLEANUP_FAILED')
 STEP=@('ADMISSION','COLLISION','PROFILE','HEALTHY','DEATH','TIMEOUT','CLEANUP')
 DETAIL=@('DIRECTORY_REJECTED','FILE_REJECTED','FILE_CHANGED','OWNER_REJECTED','PROFILE_REJECTED','PROFILE_CHANGED','INVENTORY_REJECTED','LISTENER_TABLE_REJECTED','LISTENER_TABLE_CHANGED','LISTENER_ADDRESS_REJECTED','LISTENER_DUPLICATE','HEALTH_EOF','HEALTH_DEADLINE','HEALTH_REJECTED','HEALTH_LENGTH','HEALTH_VERSION','CUSTODY_CHANGED','EARLY_EXIT','FOREIGN_LISTENER','DEATH_UNCONFIRMED','ADMISSION_REJECTED','BINARY_CHANGED','COLLISION_FAILED','RESERVATION_FAILED','NATIVE_FAILED','STDOUT_READ_FAILED','STDERR_READ_FAILED','OWNED_PROCESS_OR_DRAIN_CLEANUP_UNCONFIRMED','UNCLASSIFIED')
 STATUS=@('NONE','SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED')
 PROCESS_PHASE=@('NONE','ADMISSION','LAUNCH','LISTENER','HEALTH','DEADLINE','DEATH')
 }
 $shown=0;foreach($kind in $vector.Keys){$count=0;$literal=$null;foreach($value in $vector[$kind]){$known='P202_NATIVE_'+$kind+'_'+$value;$n=@($p.Stderr -split '\r?\n'|Where-Object {$_ -ceq $known}).Count;if($n -gt 0){$count+=$n;$literal=$known}};if($count -eq 1 -and $shown -lt 6){Write-Output $literal;$shown++}}
 $status='INVALID';if($p.Status -cin @('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','CAPTURE_FAILED','LAUNCH_FAILED','ACCESS_DENIED','CLEANUP_FAILED')){$status=$p.Status};Write-Output ('P202_RUNNER_STATUS_'+$status)
}

try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitOperatingSystem -or $env:GITHUB_ACTIONS -cne 'true'){throw 'HOSTED_WINDOWS_REQUIRED'}
 Assert-PlainDirectory $desktop
 $helper=[IO.Path]::GetFullPath((Join-Path $desktop '../tools/phase-00/HostProbeNative.cs'))
 if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash -ine 'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89'){throw 'HELPER_CHANGED'}
 if('Fonesi.Phase00.NativeProbe' -as [type]){throw 'PRELOADED_HELPER_REJECTED'}
 Add-Type -Path $helper
 if(-not (Test-Path -LiteralPath $base)){[Fonesi.Phase00.NativeProbe]::ReserveDirectory($base)}
 Assert-PlainDirectory $base;$baseVerified=$true
 if(Test-Path -LiteralPath (Join-Path $base 'unvalidated.json')){throw 'PRIOR_REPORT'}
 $root=Join-Path $base ('run-'+[guid]::NewGuid().ToString());[Fonesi.Phase00.NativeProbe]::ReserveDirectory($root)
 $token=[guid]::NewGuid().ToString();$stream=[IO.File]::Open((Join-Path $root '.owner'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$bytes=[Text.Encoding]::UTF8.GetBytes($token);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 $owner=[pscustomobject]@{Parent=$base;Path=$root;Token=$token};Assert-OwnedRun $owner
 $node=Join-Path $env:RUNNER_TOOL_CACHE 'node/24.22.1/x64/node.exe';$nodeFile=Get-Item -LiteralPath $node -Force
 if($nodeFile.PSIsContainer -or ($nodeFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'){throw 'NODE_REJECTED'}
 $python=$env:FOUNDATION_PYTHON_EXE;$pythonFile=Get-Item -LiteralPath $python -Force
 if(-not [IO.Path]::IsPathRooted($python) -or $pythonFile.PSIsContainer -or ($pythonFile.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'PYTHON_REJECTED'}
 $phase='EXTRACT';$archive=Join-Path $desktop '.platform-tools-input/platform-tools_r37.0.1-win.zip'
 $allClean=$false;$extract=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'platform_tools_archive.py'),'extract',$archive,(Join-Path $root 'candidate'),$token)) 30000 @{}
 $allClean=Retired $extract;Require $extract 'PLATFORM_TOOLS_ARCHIVE_EXTRACTED'
 $phase='PREFLIGHT';Node-Control 'prepare'
 [Fonesi.Phase00.NativeProbe]::ReserveDirectory((Join-Path $root 'profile'))
 Node-Control 'verify';Assert-OwnedRun $owner
 $powershell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
 $psFile=Get-Item -LiteralPath $powershell -Force;if($psFile.PSIsContainer -or ($psFile.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'POWERSHELL_REJECTED'}
 $phase='SERVER';$allClean=$false
 $original=[Environment]::GetEnvironmentVariables('Process')
 try{
  foreach($key in $original.Keys){if($key -match '(?i)electron' -or $key -in @('NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH')){throw 'OVERRIDE_REJECTED'}}
  $allowed=@('SystemRoot','WINDIR','SystemDrive','PATHEXT','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')
  foreach($key in @($original.Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')}
  foreach($key in $original.Keys){if($allowed -contains [string]$key){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
  [Environment]::SetEnvironmentVariable('PATH',(Join-Path $original['SystemRoot'] 'System32'),'Process')
  # One exact fresh PS file entry, no general shell/argument boundary expansion.
  $native=[Fonesi.Phase00.NativeProbe]::Run($powershell,[string[]]@('-NoProfile','-NonInteractive','-File',(Join-Path $PSScriptRoot 'Test-PlatformToolsServer.ps1'),$root),120000,10000,32768)
 }finally{foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){[Environment]::SetEnvironmentVariable([string]$key,$null,'Process')};foreach($key in $original.Keys){[Environment]::SetEnvironmentVariable([string]$key,[string]$original[$key],'Process')}}
 $allClean=Retired $native;Show-NativeDiagnostic $native
 Write-Private (Join-Path $root 'runner-capture.json') ([ordered]@{process=(Evidence $native);stdout=$native.Stdout;stderr=$native.Stderr})
 Require $native 'P202_SERVER_OBSERVED'
 $phase='POSTCHECK';Node-Control 'verify'
 $phase='VALIDATE';$allClean=$false;$validated=Invoke-OwnedChild $python ([string[]]@((Join-Path $PSScriptRoot 'validate_platform_tools_server.py'),'stage',$root)) 30000 @{}
 $allClean=Retired $validated;Require $validated 'PLATFORM_TOOLS_SERVER_STAGE_VALIDATED'
 $public=Read-Private (Join-Path $root 'server-public.json')
 foreach($key in @($report.Keys)){if($key -cne 'directoryCleanup'){$report[$key]=$public.$key}}
 $phase='CLEANUP';Assert-OwnedRun $owner;Node-Control 'cleanup';Remove-VerifiedOwnedRun $owner $allClean;$report.directoryCleanup=$true
}catch{
 $report.failure='PREFLIGHT_FAILED';if($phase -ceq 'SERVER'){$report.failure='SERVER_FAILED'}elseif($phase -ceq 'POSTCHECK'){$report.failure='SERVER_FAILED'}elseif($phase -ceq 'VALIDATE'){$report.failure='SERVER_FAILED'}elseif($phase -ceq 'CLEANUP'){$report.failure='CLEANUP_FAILED'}
 if($phase -cin @('PREPARE','EXTRACT','PREFLIGHT','SERVER','POSTCHECK','VALIDATE','CLEANUP')){Write-Output ('P202_STAGE_'+$phase)}
}finally{
 if($baseVerified){try{Write-Private (Join-Path $base 'unvalidated.json') $report;Write-Output 'P202_REPORT_WRITTEN'}catch{Write-Output 'P202_REPORT_FAILED'}}
}
